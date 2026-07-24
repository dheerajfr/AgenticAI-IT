"""localtrace -- local-first, framework-agnostic AI tracing.

Captures OpenInference/OpenTelemetry spans from any AI library or from your
own code and appends them to local JSONL files (the durable source of
truth), with a DuckDB query layer on top. No network calls, no services.

One line to onboard an existing app::

    import localtrace
    localtrace.init()

Optional extras for custom code::

    @localtrace.trace(kind="AGENT")
    def my_agent(question): ...

    with localtrace.span("retrieve", kind="RETRIEVER") as sp:
        sp.set_attribute("output.value", str(docs))
"""
from __future__ import annotations

__version__ = "0.1.0"

import atexit
import contextlib
import contextvars
import functools
import importlib
import importlib.util
import inspect
import json
import logging
from pathlib import Path
from typing import Any, Callable, Optional, Sequence, Union

from opentelemetry import trace as trace_api
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import (
    ALWAYS_OFF,
    ALWAYS_ON,
    ParentBased,
    TraceIdRatioBased,
)
from openinference.semconv.trace import (
    OpenInferenceMimeTypeValues,
    OpenInferenceSpanKindValues,
    SpanAttributes,
)

from .config import Config, RedactSpec
from .exporter import JSONLSpanExporter
from .store import JSONLStore
from .query import TraceQuery

__all__ = [
    "init",
    "shutdown",
    "flush",
    "trace",
    "span",
    "set_session",
    "clear_session",
    "session",
    "TraceQuery",
    "__version__",
]

logger = logging.getLogger("localtrace")

_KIND_VALUES = {member.value for member in OpenInferenceSpanKindValues}

_STATE: dict = {
    "provider": None,
    "store": None,
    "config": None,
    "instrumentors": [],
    "atexit_registered": False,
}

_session_ctx: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar(
    "localtrace_session", default=None
)

# ---------------------------------------------------------------------------
# Framework auto-instrumentation registry
#
# name -> (target module that must be importable, instrumentor module, class).
# Instrumentor packages are optional extras and imported lazily -- a missing
# one is silently skipped in "auto" mode, so init() is safe with zero AI libs.
# ---------------------------------------------------------------------------
_FRAMEWORKS: dict[str, tuple[str, str, str]] = {
    "openai": ("openai", "openinference.instrumentation.openai", "OpenAIInstrumentor"),
    "anthropic": ("anthropic", "openinference.instrumentation.anthropic", "AnthropicInstrumentor"),
    "bedrock": ("boto3", "openinference.instrumentation.bedrock", "BedrockInstrumentor"),
    "google-genai": ("google.genai", "openinference.instrumentation.google_genai", "GoogleGenAIInstrumentor"),
    "vertexai": ("vertexai", "openinference.instrumentation.vertexai", "VertexAIInstrumentor"),
    "mistralai": ("mistralai", "openinference.instrumentation.mistralai", "MistralAIInstrumentor"),
    "groq": ("groq", "openinference.instrumentation.groq", "GroqInstrumentor"),
    "litellm": ("litellm", "openinference.instrumentation.litellm", "LiteLLMInstrumentor"),
    "langchain": ("langchain_core", "openinference.instrumentation.langchain", "LangChainInstrumentor"),
    "llama-index": ("llama_index.core", "openinference.instrumentation.llama_index", "LlamaIndexInstrumentor"),
    "crewai": ("crewai", "openinference.instrumentation.crewai", "CrewAIInstrumentor"),
    "dspy": ("dspy", "openinference.instrumentation.dspy", "DSPyInstrumentor"),
    "haystack": ("haystack", "openinference.instrumentation.haystack", "HaystackInstrumentor"),
    "autogen": ("autogen", "openinference.instrumentation.autogen", "AutogenInstrumentor"),
    "openai-agents": ("agents", "openinference.instrumentation.openai_agents", "OpenAIAgentsInstrumentor"),
    "smolagents": ("smolagents", "openinference.instrumentation.smolagents", "SmolagentsInstrumentor"),
    "pydantic-ai": ("pydantic_ai", "openinference.instrumentation.pydantic_ai", "OpenInferenceSpanProcessor"),
    "instructor": ("instructor", "openinference.instrumentation.instructor", "InstructorInstrumentor"),
    "mcp": ("mcp", "openinference.instrumentation.mcp", "MCPInstrumentor"),
    # HTTP-level instrumentation for raw REST calls to LLM APIs. Excluded from
    # "auto" (it traces *every* HTTP request) -- opt in explicitly, e.g.
    # frameworks=["openai", "httpx"].
    "requests": ("requests", "opentelemetry.instrumentation.requests", "RequestsInstrumentor"),
    "httpx": ("httpx", "opentelemetry.instrumentation.httpx", "HTTPXClientInstrumentor"),
}
_AUTO_EXCLUDED = {"requests", "httpx"}


def _module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, AttributeError, ValueError):
        return False


def _instrument_frameworks(
    frameworks: Union[str, Sequence[str], None], provider: TracerProvider
) -> list[tuple[str, Any]]:
    if frameworks is None or frameworks == "none" or frameworks is False:
        return []
    auto = False
    if isinstance(frameworks, str):
        if frameworks == "auto":
            auto = True
            requested = [name for name in _FRAMEWORKS if name not in _AUTO_EXCLUDED]
        else:
            requested = [frameworks]
    else:
        requested = list(frameworks)

    instrumented: list[tuple[str, Any]] = []
    for raw_name in requested:
        name = str(raw_name).lower().replace("_", "-")
        entry = _FRAMEWORKS.get(name)
        if entry is None:
            logger.warning(
                "localtrace: unknown framework %r (known: %s)",
                raw_name,
                ", ".join(sorted(_FRAMEWORKS)),
            )
            continue
        target_module, instrumentor_module, class_name = entry
        if auto and not _module_available(target_module):
            continue  # the AI library itself is not installed
        if not _module_available(instrumentor_module):
            if not auto:
                logger.warning(
                    "localtrace: instrumentor for %r is not installed -- "
                    "pip install 'localtrace[%s]'",
                    name,
                    name,
                )
            continue
        try:
            module = importlib.import_module(instrumentor_module)
            instrumentor_cls = getattr(module, class_name, None)
            if instrumentor_cls is None:
                logger.warning("localtrace: no usable instrumentor found for %r", name)
                continue
            if hasattr(instrumentor_cls, "instrument"):
                instrumentor = instrumentor_cls()
                if getattr(instrumentor, "is_instrumented_by_opentelemetry", False):
                    with contextlib.suppress(Exception):
                        instrumentor.uninstrument()
                instrumentor.instrument(tracer_provider=provider)
                instrumented.append((name, instrumentor))
            elif hasattr(instrumentor_cls, "on_end"):
                # Some integrations (e.g. pydantic-ai) ship a SpanProcessor that
                # rewrites the library's native OTel spans into OpenInference
                # attributes instead of a BaseInstrumentor.
                provider.add_span_processor(instrumentor_cls())
                instrumented.append((name, None))
            else:
                logger.warning("localtrace: no usable instrumentor found for %r", name)
                continue
            logger.info("localtrace: instrumented %s", name)
        except Exception as exc:  # a broken instrumentor must never crash the app
            logger.warning("localtrace: failed to instrument %s: %s", name, exc)
    return instrumented


class _SessionSpanProcessor(SpanProcessor):
    """Stamps set_session() context (session/user/metadata) onto every span,
    including spans created by auto-instrumented libraries."""

    def on_start(self, span, parent_context=None) -> None:
        info = _session_ctx.get()
        if not info:
            return
        try:
            if info.get("session_id") is not None:
                span.set_attribute(SpanAttributes.SESSION_ID, str(info["session_id"]))
            if info.get("user_id") is not None:
                span.set_attribute(SpanAttributes.USER_ID, str(info["user_id"]))
            metadata = info.get("metadata")
            if metadata:
                span.set_attribute(SpanAttributes.METADATA, json.dumps(metadata, default=str))
        except Exception:
            logger.debug("localtrace: failed to stamp session attributes", exc_info=True)

    def on_end(self, span) -> None:
        pass

    def shutdown(self) -> None:
        pass

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        return True


def _set_global_tracer_provider(provider: TracerProvider) -> None:
    with contextlib.suppress(Exception):
        trace_api.set_tracer_provider(provider)
    if trace_api.get_tracer_provider() is not provider:
        # OTel only allows the global provider to be set once per process; on
        # re-init we swap it directly so new spans reach the new exporter.
        with contextlib.suppress(Exception):
            trace_api._TRACER_PROVIDER = provider


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def init(
    project: str = "default",
    log_dir: Union[str, Path] = "./localtrace_logs",
    frameworks: Union[str, Sequence[str], None] = "auto",
    sample_rate: float = 1.0,
    capture_content: bool = True,
    max_payload_chars: Optional[int] = 10_000,
    redact: RedactSpec = None,
    service_name: Optional[str] = None,
    environment: Optional[str] = None,
    retention_days: Optional[int] = None,
    max_file_mb: Optional[float] = None,
    gzip_rotated: bool = False,
) -> None:
    """Start capturing AI traces to local JSONL logs. Safe to call once at startup.

    * ``frameworks="auto"`` instruments every supported AI library that is
      installed; pass an explicit list to override, or ``"none"`` to disable.
    * ``sample_rate`` is head sampling: 1.0 traces everything, 0.0 nothing.
    * ``capture_content=False`` keeps structure and metrics but drops
      prompt/completion/document content.
    * ``redact`` is a list of regexes (or a callable) applied to stored
      strings before write; ``max_payload_chars`` truncates oversized values.
    * Calling init() again tears down the previous setup and starts fresh.
    """
    if _STATE["provider"] is not None:
        shutdown()

    config = Config(
        project=project,
        log_dir=log_dir,
        frameworks=frameworks,
        sample_rate=sample_rate,
        capture_content=capture_content,
        max_payload_chars=max_payload_chars,
        redact=redact,
        service_name=service_name,
        environment=environment,
        retention_days=retention_days,
        max_file_mb=max_file_mb,
        gzip_rotated=gzip_rotated,
    )
    store = JSONLStore(
        config.log_dir,
        max_file_mb=max_file_mb,
        retention_days=retention_days,
        gzip_rotated=gzip_rotated,
    )
    resource_attrs: dict[str, Any] = {
        "service.name": service_name or project,
        "localtrace.project": project,
        "localtrace.version": __version__,
    }
    if environment:
        resource_attrs["deployment.environment"] = environment
    resource = Resource.create(resource_attrs)

    if sample_rate >= 1.0:
        sampler = ALWAYS_ON
    elif sample_rate <= 0.0:
        sampler = ALWAYS_OFF
    else:
        sampler = ParentBased(TraceIdRatioBased(sample_rate))

    provider = TracerProvider(resource=resource, sampler=sampler, shutdown_on_exit=False)
    provider.add_span_processor(_SessionSpanProcessor())
    _set_global_tracer_provider(provider)

    # Frameworks may add attribute-rewriting span processors (e.g. pydantic-ai);
    # the exporting processor is added last so it sees the final attributes.
    instrumented = _instrument_frameworks(frameworks, provider)
    provider.add_span_processor(BatchSpanProcessor(JSONLSpanExporter(store, config)))

    _STATE.update(provider=provider, store=store, config=config, instrumentors=instrumented)
    if not _STATE["atexit_registered"]:
        atexit.register(shutdown)
        _STATE["atexit_registered"] = True


def shutdown() -> None:
    """Flush pending spans, uninstrument libraries, and close the log store."""
    provider = _STATE.get("provider")
    if provider is None:
        return
    for _name, instrumentor in _STATE.get("instrumentors") or []:
        if instrumentor is None or not hasattr(instrumentor, "uninstrument"):
            continue  # processor-style integrations shut down with the provider
        with contextlib.suppress(Exception):
            instrumentor.uninstrument()
    with contextlib.suppress(Exception):
        provider.shutdown()  # flushes the BatchSpanProcessor
    store = _STATE.get("store")
    if store is not None:
        with contextlib.suppress(Exception):
            store.close()
    _STATE.update(provider=None, store=None, config=None, instrumentors=[])


def flush(timeout_millis: int = 10_000) -> bool:
    """Force pending spans to disk without shutting down."""
    provider = _STATE.get("provider")
    if provider is None:
        return True
    return bool(provider.force_flush(timeout_millis))


@contextlib.contextmanager
def session(**init_kwargs):
    """Context manager wrapping init()/shutdown()::

        with localtrace.session(project="batch-job"):
            run()
    """
    init(**init_kwargs)
    try:
        yield
    finally:
        shutdown()


def set_session(session_id=None, user_id=None, **metadata) -> None:
    """Attach conversation/session/user grouping to all subsequently started
    spans (auto-instrumented ones included). Values merge with what is already
    set; use clear_session() to reset."""
    current = dict(_session_ctx.get() or {})
    if session_id is not None:
        current["session_id"] = session_id
    if user_id is not None:
        current["user_id"] = user_id
    if metadata:
        merged = dict(current.get("metadata") or {})
        merged.update(metadata)
        current["metadata"] = merged
    _session_ctx.set(current or None)


def clear_session() -> None:
    """Stop attaching session/user/metadata to new spans."""
    _session_ctx.set(None)


# ---------------------------------------------------------------------------
# Manual spans: decorator + context manager
# ---------------------------------------------------------------------------

def _tracer():
    provider = _STATE.get("provider")
    if provider is not None:
        return provider.get_tracer("localtrace", __version__)
    return trace_api.get_tracer("localtrace", __version__)


def _normalize_kind(kind) -> str:
    if isinstance(kind, OpenInferenceSpanKindValues):
        return kind.value
    value = str(kind).strip().upper()
    if value not in _KIND_VALUES:
        logger.debug("localtrace: non-standard span kind %r", kind)
    return value


def _attr_value(value):
    if isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, (list, tuple)) and all(
        isinstance(v, (str, bool, int, float)) for v in value
    ):
        return list(value)
    return json.dumps(value, default=str)


def _mark_ok(sp) -> None:
    """Set status OK on success, but never override a status the user set."""
    try:
        if sp.is_recording() and sp.status.status_code == trace_api.StatusCode.UNSET:
            sp.set_status(trace_api.Status(trace_api.StatusCode.OK))
    except Exception:
        pass


@contextlib.contextmanager
def span(name: str, kind: str = "CHAIN", **attributes):
    """Manual span context manager for anything without an instrumentor
    (a homegrown retriever, a raw HTTP LLM call, ...)::

        with localtrace.span("retrieve", kind="RETRIEVER") as sp:
            docs = search(query)
            sp.set_attribute("output.value", json.dumps(docs))

    Extra keyword arguments become span attributes.
    """
    with _tracer().start_as_current_span(
        name, record_exception=True, set_status_on_exception=True
    ) as sp:
        if sp.is_recording():
            sp.set_attribute(SpanAttributes.OPENINFERENCE_SPAN_KIND, _normalize_kind(kind))
            for key, value in attributes.items():
                sp.set_attribute(key, _attr_value(value))
        yield sp
        _mark_ok(sp)


def _compact_repr(obj) -> str:
    text = repr(obj)
    return text if len(text) <= 500 else text[:500] + "..."


def _safe_json(obj) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False, default=_compact_repr)
    except (TypeError, ValueError):
        return repr(obj)


def _describe_input(func, args, kwargs) -> Optional[str]:
    try:
        bound = inspect.signature(func).bind_partial(*args, **kwargs)
        data = {k: v for k, v in bound.arguments.items() if k not in ("self", "cls")}
    except (TypeError, ValueError):
        data = {"args": list(args), "kwargs": kwargs}
    if not data:
        return None
    return _safe_json(data)


def _record_output(sp, result, capture_io: bool) -> None:
    if not capture_io or result is None or not sp.is_recording():
        return
    if isinstance(result, str):
        sp.set_attribute(SpanAttributes.OUTPUT_VALUE, result)
        sp.set_attribute(SpanAttributes.OUTPUT_MIME_TYPE, OpenInferenceMimeTypeValues.TEXT.value)
    else:
        sp.set_attribute(SpanAttributes.OUTPUT_VALUE, _safe_json(result))
        sp.set_attribute(SpanAttributes.OUTPUT_MIME_TYPE, OpenInferenceMimeTypeValues.JSON.value)


@contextlib.contextmanager
def _function_span(name: str, kind: str, func, args, kwargs, capture_io: bool):
    with _tracer().start_as_current_span(
        name, record_exception=True, set_status_on_exception=True
    ) as sp:
        if sp.is_recording():
            sp.set_attribute(SpanAttributes.OPENINFERENCE_SPAN_KIND, _normalize_kind(kind))
            if capture_io:
                payload = _describe_input(func, args, kwargs)
                if payload is not None:
                    sp.set_attribute(SpanAttributes.INPUT_VALUE, payload)
                    sp.set_attribute(
                        SpanAttributes.INPUT_MIME_TYPE, OpenInferenceMimeTypeValues.JSON.value
                    )
        yield sp
        _mark_ok(sp)


def _wrap_function(func: Callable, name: Optional[str], kind: str, capture_io: bool) -> Callable:
    span_name = name or getattr(func, "__qualname__", None) or func.__name__
    if inspect.iscoroutinefunction(func):

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            with _function_span(span_name, kind, func, args, kwargs, capture_io) as sp:
                result = await func(*args, **kwargs)
                _record_output(sp, result, capture_io)
                return result

        return async_wrapper

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with _function_span(span_name, kind, func, args, kwargs, capture_io) as sp:
            result = func(*args, **kwargs)
            _record_output(sp, result, capture_io)
            return result

    return wrapper


def trace(name=None, kind: str = "CHAIN", *, capture_io: bool = True):
    """Decorator wrapping any function as an OpenInference span, recording
    input arguments and return value. Works on sync and async functions::

        @localtrace.trace(kind="AGENT")
        def my_agent(question): ...

    Usable bare (``@localtrace.trace``), with a name, or with a kind.
    """
    if callable(name) and not isinstance(name, str):
        return _wrap_function(name, None, kind, capture_io)

    def decorator(func):
        return _wrap_function(func, name, kind, capture_io)

    return decorator
