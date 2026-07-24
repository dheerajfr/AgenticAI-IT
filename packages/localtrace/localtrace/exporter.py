"""OTel SpanExporter that appends OpenInference spans to local JSONL files.

Each span becomes exactly one JSON object (one line). The full OpenInference
attribute map is preserved verbatim (modulo redaction / truncation /
capture_content, applied here before write), so the same logs can later be
replayed into Phoenix, Langfuse, or any OTLP backend.

This exporter never blocks the caller's request path: it is meant to sit
behind a BatchSpanProcessor, which hands it batches on a background thread.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Mapping, Optional, Sequence

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import format_span_id, format_trace_id

from .config import Config, process_attributes
from .store import JSONLStore

logger = logging.getLogger("localtrace")

SCHEMA_VERSION = 1

_SPAN_KIND_KEY = "openinference.span.kind"
_SESSION_ID_KEY = "session.id"
_USER_ID_KEY = "user.id"
_METADATA_KEY = "metadata"


def _parse_metadata(attributes: Mapping[str, Any]) -> Optional[dict]:
    """OpenInference stores metadata as a JSON string attribute; surface it as a dict."""
    raw = attributes.get(_METADATA_KEY)
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            return {"value": raw}
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    if isinstance(raw, dict):
        return raw
    return None


def span_to_record(span: ReadableSpan, config: Config) -> dict:
    """Map one OTel span to the localtrace JSONL record (see README, section
    'JSONL record schema'). ``attributes`` keeps the complete OpenInference map."""
    ctx = span.get_span_context()
    attributes = process_attributes(dict(span.attributes or {}), config)
    events = [
        {
            "name": event.name,
            "timestamp_ns": event.timestamp,
            "attributes": process_attributes(dict(event.attributes or {}), config),
        }
        for event in (span.events or [])
    ]
    resource_attrs = dict(span.resource.attributes) if span.resource is not None else {}
    start = span.start_time
    end = span.end_time
    duration_ms = round((end - start) / 1e6, 3) if start is not None and end is not None else None
    status = span.status
    return {
        "schema_version": SCHEMA_VERSION,
        "project": resource_attrs.get("localtrace.project", config.project),
        "service_name": resource_attrs.get("service.name", config.service_name or config.project),
        "environment": resource_attrs.get("deployment.environment", config.environment),
        "trace_id": format_trace_id(ctx.trace_id),
        "span_id": format_span_id(ctx.span_id),
        "parent_span_id": format_span_id(span.parent.span_id) if span.parent else None,
        "name": span.name,
        "span_kind": attributes.get(_SPAN_KIND_KEY, "UNKNOWN"),
        "start_time_ns": start,
        "end_time_ns": end,
        "duration_ms": duration_ms,
        "status": status.status_code.name if status is not None else "UNSET",
        "status_message": (status.description if status is not None else None) or None,
        "session_id": attributes.get(_SESSION_ID_KEY),
        "user_id": attributes.get(_USER_ID_KEY),
        "metadata": _parse_metadata(attributes),
        "attributes": attributes,
        "events": events,
        "resource": {
            k: (v if isinstance(v, (str, int, float, bool)) else str(v))
            for k, v in resource_attrs.items()
        },
    }


class JSONLSpanExporter(SpanExporter):
    """Serialize each finished span to one JSON line and append it to the store."""

    def __init__(self, store: JSONLStore, config: Config) -> None:
        self._store = store
        self._config = config

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        try:
            lines: list[str] = []
            for span in spans:
                try:
                    record = span_to_record(span, self._config)
                    lines.append(json.dumps(record, ensure_ascii=False, default=str))
                except Exception:
                    logger.exception(
                        "localtrace: failed to serialize span %r", getattr(span, "name", "?")
                    )
            self._store.write_lines(lines)
            return SpanExportResult.SUCCESS
        except Exception:
            logger.exception("localtrace: failed to write span batch")
            return SpanExportResult.FAILURE

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        return True

    def shutdown(self) -> None:
        self._store.close()
