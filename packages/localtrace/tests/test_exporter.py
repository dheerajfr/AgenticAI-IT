"""Span -> JSONL record mapping, incl. redaction, truncation, content capture,
sampling, and session stamping. Everything goes through the real init() path."""
import json

import pytest

import localtrace
from localtrace.config import CONTENT_PLACEHOLDER, TRUNCATION_MARKER

from helpers import read_records

SCHEMA_KEYS = {
    "schema_version", "project", "service_name", "environment",
    "trace_id", "span_id", "parent_span_id", "name", "span_kind",
    "start_time_ns", "end_time_ns", "duration_ms", "status", "status_message",
    "session_id", "user_id", "metadata", "attributes", "events",
}


def test_record_schema_and_parenting(tmp_path):
    localtrace.init(
        project="p1", log_dir=tmp_path, frameworks="none", environment="test"
    )
    with localtrace.span("root", kind="CHAIN"):
        with localtrace.span("child", kind="RETRIEVER"):
            pass
    localtrace.shutdown()

    records = read_records(tmp_path)
    assert len(records) == 2
    by_name = {r["name"]: r for r in records}
    root, child = by_name["root"], by_name["child"]

    for record in records:
        assert SCHEMA_KEYS <= set(record.keys())
        assert record["schema_version"] == 1
        assert record["project"] == "p1"
        assert record["service_name"] == "p1"
        assert record["environment"] == "test"
        assert record["status"] == "OK"
        assert record["duration_ms"] >= 0
        assert len(record["trace_id"]) == 32
        assert len(record["span_id"]) == 16

    assert root["parent_span_id"] is None
    assert child["parent_span_id"] == root["span_id"]
    assert child["trace_id"] == root["trace_id"]
    assert root["span_kind"] == "CHAIN"
    assert child["span_kind"] == "RETRIEVER"
    assert root["attributes"]["openinference.span.kind"] == "CHAIN"


def test_decorator_records_io_and_kind(tmp_path):
    localtrace.init(project="p1", log_dir=tmp_path, frameworks="none")

    @localtrace.trace(kind="AGENT")
    def agent(question: str):
        return {"answer": question.upper()}

    result = agent("hi there")
    assert result == {"answer": "HI THERE"}
    localtrace.shutdown()

    (record,) = read_records(tmp_path)
    attrs = record["attributes"]
    assert record["span_kind"] == "AGENT"
    assert record["name"].endswith("agent")
    assert "hi there" in attrs["input.value"]
    assert attrs["input.mime_type"] == "application/json"
    assert "HI THERE" in attrs["output.value"]
    assert attrs["output.mime_type"] == "application/json"


def test_decorator_records_errors(tmp_path):
    localtrace.init(project="p1", log_dir=tmp_path, frameworks="none")

    @localtrace.trace(kind="TOOL")
    def boom():
        raise ValueError("nope")

    with pytest.raises(ValueError):
        boom()
    localtrace.shutdown()

    (record,) = read_records(tmp_path)
    assert record["status"] == "ERROR"
    assert "nope" in (record["status_message"] or "")
    exception_events = [e for e in record["events"] if e["name"] == "exception"]
    assert exception_events
    assert exception_events[0]["attributes"]["exception.type"] == "ValueError"


def test_redaction_masks_email_and_api_key(tmp_path):
    localtrace.init(
        project="p1",
        log_dir=tmp_path,
        frameworks="none",
        redact=[r"[\w.+-]+@[\w-]+\.[\w.-]+", r"sk-[A-Za-z0-9]{8,}"],
    )
    secret = "contact alice@example.com with key sk-test1234567890abcdef"
    with localtrace.span("leaky", kind="CHAIN") as sp:
        sp.set_attribute("input.value", secret)
    localtrace.shutdown()

    (record,) = read_records(tmp_path)
    stored = record["attributes"]["input.value"]
    assert "alice@example.com" not in stored
    assert "sk-test1234567890abcdef" not in stored
    assert stored.count("[REDACTED]") == 2
    assert "alice@example.com" not in json.dumps(record)


def test_redaction_accepts_callable(tmp_path):
    localtrace.init(
        project="p1", log_dir=tmp_path, frameworks="none",
        redact=lambda text: text.replace("hunter2", "*******"),
    )
    with localtrace.span("s", kind="CHAIN") as sp:
        sp.set_attribute("input.value", "password is hunter2")
    localtrace.shutdown()

    (record,) = read_records(tmp_path)
    assert "hunter2" not in record["attributes"]["input.value"]


def test_truncation_marks_oversized_values(tmp_path):
    localtrace.init(
        project="p1", log_dir=tmp_path, frameworks="none", max_payload_chars=100
    )
    with localtrace.span("big", kind="CHAIN") as sp:
        sp.set_attribute("input.value", "x" * 5000)
    localtrace.shutdown()

    (record,) = read_records(tmp_path)
    stored = record["attributes"]["input.value"]
    assert stored.endswith(TRUNCATION_MARKER)
    assert len(stored) == 100 + len(TRUNCATION_MARKER)


def test_capture_content_false_keeps_structure_and_metrics(tmp_path):
    localtrace.init(
        project="p1", log_dir=tmp_path, frameworks="none", capture_content=False
    )
    with localtrace.span("llm-ish", kind="LLM") as sp:
        sp.set_attribute("input.value", "top secret prompt")
        sp.set_attribute("llm.input_messages.0.message.content", "top secret prompt")
        sp.set_attribute("llm.model_name", "gpt-4o-mini")
        sp.set_attribute("llm.token_count.total", 42)
    localtrace.shutdown()

    (record,) = read_records(tmp_path)
    attrs = record["attributes"]
    assert attrs["input.value"] == CONTENT_PLACEHOLDER
    assert attrs["llm.input_messages.0.message.content"] == CONTENT_PLACEHOLDER
    assert "top secret" not in json.dumps(record)
    # structure + metrics survive
    assert attrs["llm.model_name"] == "gpt-4o-mini"
    assert attrs["llm.token_count.total"] == 42
    assert record["span_kind"] == "LLM"


def test_sample_rate_zero_writes_nothing(tmp_path):
    localtrace.init(project="p1", log_dir=tmp_path, frameworks="none", sample_rate=0.0)
    for i in range(5):
        with localtrace.span(f"s{i}", kind="CHAIN"):
            pass
    localtrace.shutdown()
    assert read_records(tmp_path) == []


def test_sample_rate_one_writes_all(tmp_path):
    localtrace.init(project="p1", log_dir=tmp_path, frameworks="none", sample_rate=1.0)
    for i in range(5):
        with localtrace.span(f"s{i}", kind="CHAIN"):
            pass
    localtrace.shutdown()
    assert len(read_records(tmp_path)) == 5


def test_session_metadata_stamped_on_spans(tmp_path):
    localtrace.init(project="p1", log_dir=tmp_path, frameworks="none")
    localtrace.set_session(session_id="sess-1", user_id="user-9", channel="tests")
    with localtrace.span("in-session", kind="CHAIN"):
        pass
    localtrace.clear_session()
    with localtrace.span("no-session", kind="CHAIN"):
        pass
    localtrace.shutdown()

    by_name = {r["name"]: r for r in read_records(tmp_path)}
    stamped = by_name["in-session"]
    assert stamped["session_id"] == "sess-1"
    assert stamped["user_id"] == "user-9"
    assert stamped["metadata"] == {"channel": "tests"}
    assert by_name["no-session"]["session_id"] is None
