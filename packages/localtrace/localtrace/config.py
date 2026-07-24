"""Configuration and cross-cutting content processing for localtrace.

Everything that touches span payloads before they hit disk lives here:
redaction, truncation, and the ``capture_content`` switch. The write path
stays schema-free -- these functions only transform values, never the shape
of the attribute map.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping, Optional, Pattern, Sequence, Union

logger = logging.getLogger("localtrace")

#: Either a callable ``str -> str`` or a sequence of regex patterns/strings.
RedactSpec = Union[Callable[[str], str], Sequence[Union[str, Pattern[str]]], None]

TRUNCATION_MARKER = "...[truncated]"
CONTENT_PLACEHOLDER = "[content not captured]"
REDACTED_PLACEHOLDER = "[REDACTED]"

# Attribute keys (or key fragments) that carry captured *content* -- prompts,
# completions, documents, tool arguments, media -- as opposed to metrics and
# structural metadata. ``capture_content=False`` blanks exactly these keys,
# so token counts, model names, latencies etc. always survive.
_CONTENT_KEYS_EXACT = {
    "input.value",
    "output.value",
    "llm.prompts",
    "llm.prompt_template.template",
}
_CONTENT_KEY_FRAGMENTS = (
    ".message.content",             # llm.input_messages.0.message.content
    "message_content",              # multimodal content parts
    "document.content",             # retrieval.documents.N.document.content
    "embedding.text",               # embedding.embeddings.N.embedding.text
    "tool_call.function.arguments",
    "function_call_arguments",
    "prompt_template.variables",
    "image.url",
    "audio.url",
)


def is_content_key(key: str) -> bool:
    """True when *key* holds user/LLM content rather than structure or metrics."""
    return key in _CONTENT_KEYS_EXACT or any(fragment in key for fragment in _CONTENT_KEY_FRAGMENTS)


def build_redactor(redact: RedactSpec) -> Optional[Callable[[str], str]]:
    """Turn a RedactSpec into a single ``str -> str`` callable (or None)."""
    if redact is None:
        return None
    if callable(redact):
        return redact
    patterns = [re.compile(p) if isinstance(p, str) else p for p in redact]

    def _apply(text: str) -> str:
        for pattern in patterns:
            text = pattern.sub(REDACTED_PLACEHOLDER, text)
        return text

    return _apply


@dataclass
class Config:
    """Resolved runtime configuration, built once by :func:`localtrace.init`."""

    project: str = "default"
    log_dir: Path = Path("./localtrace_logs")
    frameworks: Union[str, Sequence[str], None] = "auto"
    sample_rate: float = 1.0
    capture_content: bool = True
    max_payload_chars: Optional[int] = 10_000
    redact: RedactSpec = None
    service_name: Optional[str] = None
    environment: Optional[str] = None
    retention_days: Optional[int] = None
    max_file_mb: Optional[float] = None
    gzip_rotated: bool = False
    _redactor: Optional[Callable[[str], str]] = field(default=None, repr=False, compare=False)

    def __post_init__(self) -> None:
        self.log_dir = Path(self.log_dir)
        self._redactor = build_redactor(self.redact)

    @property
    def redactor(self) -> Optional[Callable[[str], str]]:
        return self._redactor


def _jsonable(value):
    """Coerce OTel attribute values (tuples, odd scalars) into JSON-friendly ones."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, Mapping):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return str(value)


def _process_value(value, config: Config):
    """Apply redaction then truncation to every string, recursively."""
    if isinstance(value, str):
        if config.redactor is not None:
            try:
                value = config.redactor(value)
            except Exception:
                logger.exception("localtrace: redact callable raised; storing placeholder")
                return REDACTED_PLACEHOLDER
        if config.max_payload_chars and len(value) > config.max_payload_chars:
            value = value[: config.max_payload_chars] + TRUNCATION_MARKER
        return value
    if isinstance(value, list):
        return [_process_value(v, config) for v in value]
    if isinstance(value, dict):
        return {k: _process_value(v, config) for k, v in value.items()}
    return value


def process_attributes(attributes: Mapping, config: Config) -> dict:
    """Prepare an attribute map for storage.

    * ``capture_content=False`` replaces content values with a placeholder
      while keeping the key (structure and metrics stay intact).
    * Redaction runs over every string value (content or not) so secrets
      can never leak through a non-standard key.
    * Oversized strings are truncated with an explicit marker.
    """
    out: dict = {}
    for key, value in attributes.items():
        key = str(key)
        value = _jsonable(value)
        if not config.capture_content and is_content_key(key):
            out[key] = CONTENT_PLACEHOLDER
            continue
        out[key] = _process_value(value, config)
    return out
