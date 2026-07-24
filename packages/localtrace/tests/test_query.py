"""DuckDB query layer: tree reconstruction, stats, rollups, raw SQL --
always over multiple JSONL files (including a gzipped one), no ETL."""
import json

import pytest

from localtrace.query import TraceQuery

from helpers import _BASE_NS, make_record, write_jsonl, write_jsonl_gz

DAY_NS = 86_400 * 1_000_000_000

TRACE_A = "a" * 32   # 2026-07-19 file: root -> (retriever -> tool), llm
TRACE_B = "b" * 32   # 2026-07-20 file: root -> llm  (project "other")
TRACE_C = "c" * 32   # gzipped file: single root span


@pytest.fixture()
def log_dir(tmp_path):
    t_a, t_b, t_c = _BASE_NS + DAY_NS, _BASE_NS + 2 * DAY_NS, _BASE_NS

    trace_a = [
        make_record(trace_id=TRACE_A, span_id="a1a1a1a1a1a1a1a1", name="agent-root",
                    kind="AGENT", start_ns=t_a, duration_ms=900),
        make_record(trace_id=TRACE_A, span_id="a2a2a2a2a2a2a2a2", parent_span_id="a1a1a1a1a1a1a1a1",
                    name="retrieve", kind="RETRIEVER", start_ns=t_a + 10_000_000, duration_ms=100),
        make_record(trace_id=TRACE_A, span_id="a3a3a3a3a3a3a3a3", parent_span_id="a2a2a2a2a2a2a2a2",
                    name="rank", kind="TOOL", start_ns=t_a + 20_000_000, duration_ms=50),
        make_record(trace_id=TRACE_A, span_id="a4a4a4a4a4a4a4a4", parent_span_id="a1a1a1a1a1a1a1a1",
                    name="ChatCompletion", kind="LLM", start_ns=t_a + 200_000_000, duration_ms=600,
                    attributes={
                        "llm.model_name": "gpt-4o-mini",
                        "llm.token_count.prompt": 100,
                        "llm.token_count.completion": 50,
                        "llm.token_count.total": 150,
                        "llm.input_messages.0.message.role": "user",
                        "llm.input_messages.0.message.content": "hello",
                    }),
    ]
    trace_b = [
        make_record(trace_id=TRACE_B, span_id="b1b1b1b1b1b1b1b1", name="other-root",
                    kind="CHAIN", start_ns=t_b, duration_ms=400, project="other"),
        make_record(trace_id=TRACE_B, span_id="b2b2b2b2b2b2b2b2", parent_span_id="b1b1b1b1b1b1b1b1",
                    name="ChatCompletion", kind="LLM", start_ns=t_b + 5_000_000, duration_ms=300,
                    project="other",
                    attributes={
                        "llm.model_name": "claude-sonnet-4",
                        "llm.token_count.prompt": 200,
                        "llm.token_count.completion": 100,
                        "llm.token_count.total": 300,
                    }),
    ]
    trace_c = [
        make_record(trace_id=TRACE_C, span_id="c1c1c1c1c1c1c1c1", name="lonely-root",
                    kind="CHAIN", start_ns=t_c, duration_ms=10),
    ]
    write_jsonl(tmp_path / "traces-2026-07-19.jsonl", trace_a)
    write_jsonl(tmp_path / "traces-2026-07-20.jsonl", trace_b)
    write_jsonl_gz(tmp_path / "traces-2026-07-18.jsonl.gz", trace_c)
    return tmp_path


def test_raw_sql_reads_all_files_including_gz(log_dir):
    q = TraceQuery(log_dir)
    (row,) = q.raw_sql("SELECT COUNT(*) AS n FROM spans")
    assert row["n"] == 7


def test_get_trace_tree_reconstructs_nesting(log_dir):
    q = TraceQuery(log_dir)
    roots = q.get_trace_tree(TRACE_A)
    assert len(roots) == 1
    root = roots[0]
    assert root["parent_span_id"] is None
    assert root["name"] == "agent-root"
    child_names = [c["name"] for c in root["children"]]
    assert child_names == ["retrieve", "ChatCompletion"]  # ordered by start time
    retriever = root["children"][0]
    assert [c["name"] for c in retriever["children"]] == ["rank"]
    assert retriever["children"][0]["children"] == []


def test_span_stats_tokens_and_cost(log_dir):
    q = TraceQuery(log_dir)
    stats = q.span_stats(TRACE_A)
    assert stats["span_count"] == 4
    assert stats["prompt_tokens"] == 100
    assert stats["completion_tokens"] == 50
    assert stats["total_tokens"] == 150
    assert stats["models"] == ["gpt-4o-mini"]
    expected = 100 / 1000 * 0.00015 + 50 / 1000 * 0.0006
    assert stats["cost_total"] == pytest.approx(expected, rel=1e-3)
    assert stats["by_kind"]["LLM"]["count"] == 1
    assert stats["by_kind"]["AGENT"]["count"] == 1
    assert stats["duration_ms"] > 0


def test_pricing_is_overridable(log_dir):
    q = TraceQuery(log_dir, pricing={"gpt-4o-mini": (1.0, 2.0)})
    stats = q.span_stats(TRACE_A)
    assert stats["cost_total"] == pytest.approx(100 / 1000 * 1.0 + 50 / 1000 * 2.0)


def test_pricing_json_in_log_dir(log_dir):
    (log_dir / "pricing.json").write_text(
        json.dumps({"gpt-4o-mini": {"input_per_1k": 10.0, "output_per_1k": 20.0}}),
        encoding="utf-8",
    )
    q = TraceQuery(log_dir)
    stats = q.span_stats(TRACE_A)
    assert stats["cost_total"] == pytest.approx(1.0 + 1.0)


def test_list_traces_order_filters_limit(log_dir):
    q = TraceQuery(log_dir)
    traces = q.list_traces()
    assert [t["trace_id"] for t in traces] == [TRACE_B, TRACE_A, TRACE_C]  # newest first
    trace_a = next(t for t in traces if t["trace_id"] == TRACE_A)
    assert trace_a["span_count"] == 4
    assert trace_a["total_tokens"] == 150
    assert trace_a["cost_total"] is not None and trace_a["cost_total"] > 0
    assert trace_a["name"] == "agent-root"

    only_other = q.list_traces(project="other")
    assert [t["trace_id"] for t in only_other] == [TRACE_B]

    assert len(q.list_traces(limit=1)) == 1


def test_aggregate_by_model(log_dir):
    q = TraceQuery(log_dir)
    rows = {r["group"]: r for r in q.aggregate(group_by="model")}
    assert set(rows) == {"gpt-4o-mini", "claude-sonnet-4"}
    assert rows["gpt-4o-mini"]["total_tokens"] == 150
    assert rows["claude-sonnet-4"]["total_tokens"] == 300
    assert rows["claude-sonnet-4"]["cost_total"] == pytest.approx(
        200 / 1000 * 0.003 + 100 / 1000 * 0.015
    )


def test_aggregate_by_day_and_kind(log_dir):
    q = TraceQuery(log_dir)
    by_day = q.aggregate(group_by="day")
    assert len(by_day) == 3
    assert all(r["span_count"] > 0 for r in by_day)

    by_kind = {r["group"]: r for r in q.aggregate(group_by="kind")}
    assert by_kind["LLM"]["span_count"] == 2
    assert by_kind["LLM"]["total_tokens"] == 450
    assert by_kind["CHAIN"]["span_count"] == 2

    with pytest.raises(ValueError):
        q.aggregate(group_by="nonsense")


def test_since_filter(log_dir):
    q = TraceQuery(log_dir)
    cutoff_ns = _BASE_NS + int(1.5 * DAY_NS)
    recent = q.list_traces(since=cutoff_ns)
    assert [t["trace_id"] for t in recent] == [TRACE_B]


def test_empty_log_dir_is_fine(tmp_path):
    q = TraceQuery(tmp_path / "does-not-exist-yet")
    assert q.list_traces() == []
    (row,) = q.raw_sql("SELECT COUNT(*) AS n FROM spans")
    assert row["n"] == 0


def test_new_files_visible_without_reconnect(tmp_path):
    q = TraceQuery(tmp_path)
    assert q.list_traces() == []
    write_jsonl(
        tmp_path / "traces-2026-07-21.jsonl",
        [make_record(trace_id="f" * 32, span_id="9" * 16, name="late-arrival")],
    )
    traces = q.list_traces()
    assert len(traces) == 1
    assert traces[0]["name"] == "late-arrival"
