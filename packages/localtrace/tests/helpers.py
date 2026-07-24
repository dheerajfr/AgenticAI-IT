"""Shared test utilities: read JSONL logs back, and fabricate records."""
from __future__ import annotations

import gzip
import json
from pathlib import Path

_BASE_NS = 1_752_000_000_000_000_000  # ~2025-07, epoch nanoseconds


def read_records(log_dir) -> list[dict]:
    records = []
    for path in sorted(Path(log_dir).glob("*.jsonl*")):
        opener = gzip.open if path.name.endswith(".gz") else open
        with opener(path, "rt", encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    records.append(json.loads(line))
    return records


def make_record(
    *,
    trace_id: str,
    span_id: str,
    parent_span_id: str | None = None,
    name: str = "span",
    kind: str = "CHAIN",
    start_ns: int | None = None,
    duration_ms: float = 250.0,
    project: str = "default",
    attributes: dict | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
    status: str = "OK",
) -> dict:
    start_ns = _BASE_NS if start_ns is None else start_ns
    end_ns = start_ns + int(duration_ms * 1e6)
    attrs = {"openinference.span.kind": kind}
    attrs.update(attributes or {})
    return {
        "schema_version": 1,
        "project": project,
        "service_name": project,
        "environment": None,
        "trace_id": trace_id,
        "span_id": span_id,
        "parent_span_id": parent_span_id,
        "name": name,
        "span_kind": kind,
        "start_time_ns": start_ns,
        "end_time_ns": end_ns,
        "duration_ms": duration_ms,
        "status": status,
        "status_message": None,
        "session_id": session_id,
        "user_id": user_id,
        "metadata": None,
        "attributes": attrs,
        "events": [],
        "resource": {},
    }


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n", encoding="utf-8")


def write_jsonl_gz(path: Path, records: list[dict]) -> None:
    data = "\n".join(json.dumps(r) for r in records) + "\n"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        fh.write(data)
