"""DuckDB query layer over the JSONL trace logs.

Reads the raw ``*.jsonl`` / ``*.jsonl.gz`` files directly -- no import step,
no ETL, no fixed schema for attributes (they stay a JSON map). A ``spans``
view is (re)registered over whatever files currently exist, so a dashboard
can keep one TraceQuery open and always see fresh data. ``raw_sql`` is the
escape hatch for arbitrary DuckDB SQL; a ``pricing`` table (model,
input_per_1k, output_per_1k) is also registered for convenience.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional, Union

import duckdb

from . import pricing as pricing_mod

logger = logging.getLogger("localtrace")

_COLUMNS: dict[str, str] = {
    "schema_version": "INTEGER",
    "project": "VARCHAR",
    "service_name": "VARCHAR",
    "environment": "VARCHAR",
    "trace_id": "VARCHAR",
    "span_id": "VARCHAR",
    "parent_span_id": "VARCHAR",
    "name": "VARCHAR",
    "span_kind": "VARCHAR",
    "start_time_ns": "BIGINT",
    "end_time_ns": "BIGINT",
    "duration_ms": "DOUBLE",
    "status": "VARCHAR",
    "status_message": "VARCHAR",
    "session_id": "VARCHAR",
    "user_id": "VARCHAR",
    "metadata": "JSON",
    "attributes": "JSON",
    "events": "JSON",
    "resource": "JSON",
}

# SQL fragments for OpenInference attributes (keys contain dots, so the JSON
# path must quote them).
_MODEL = "attributes->>'$.\"llm.model_name\"'"
_PROMPT_TOKENS = "TRY_CAST(attributes->>'$.\"llm.token_count.prompt\"' AS BIGINT)"
_COMPLETION_TOKENS = "TRY_CAST(attributes->>'$.\"llm.token_count.completion\"' AS BIGINT)"
_TOTAL_TOKENS = "TRY_CAST(attributes->>'$.\"llm.token_count.total\"' AS BIGINT)"

# Aggregations first project the JSON extractions in a subquery and filter in
# the outer query: pushing WHERE clauses on `attributes->>...` down into
# read_json trips a DuckDB conversion bug (observed in 1.5.x).
_TOKEN_PROJECTION = f"""
    SELECT trace_id, span_kind, name, project, session_id, user_id,
           start_time_ns, duration_ms, status,
           {_MODEL} AS model,
           {_PROMPT_TOKENS} AS prompt_tokens_raw,
           {_COMPLETION_TOKENS} AS completion_tokens_raw,
           {_TOTAL_TOKENS} AS total_tokens_raw
    FROM spans
"""
_TOTAL_OR_SUM = (
    "COALESCE(total_tokens_raw, "
    "COALESCE(prompt_tokens_raw, 0) + COALESCE(completion_tokens_raw, 0))"
)


def _where(conditions: list[str]) -> str:
    return ("WHERE " + " AND ".join(conditions)) if conditions else ""


def _to_ns(value: Union[int, float, str, datetime, date]) -> int:
    """Accept datetimes, dates, ISO strings, or epoch seconds/ns."""
    if isinstance(value, bool):
        raise TypeError("since must be a datetime, date, ISO string, or epoch number")
    if isinstance(value, (int, float)):
        return int(value if value > 1e14 else value * 1e9)
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1e9)
    if isinstance(value, date):
        return _to_ns(datetime(value.year, value.month, value.day, tzinfo=timezone.utc))
    raise TypeError(f"unsupported 'since' value: {value!r}")


def _as_int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _span_tokens(attributes: Mapping[str, Any]) -> tuple[Optional[str], int, int, int]:
    model = attributes.get("llm.model_name")
    prompt = _as_int(attributes.get("llm.token_count.prompt"))
    completion = _as_int(attributes.get("llm.token_count.completion"))
    total = _as_int(attributes.get("llm.token_count.total")) or (prompt + completion)
    return (model if isinstance(model, str) else None), prompt, completion, total


class TraceQuery:
    """SQL access to the JSONL logs for dashboards and the CLI.

    All helpers return plain dicts; :meth:`df` returns pandas DataFrames for
    anything (requires pandas, which is not a localtrace dependency).
    """

    def __init__(self, log_dir="./localtrace_logs", pricing: Optional[Mapping] = None) -> None:
        self.log_dir = Path(log_dir)
        self._pricing = pricing_mod.load_pricing(overrides=pricing, log_dir=self.log_dir)
        self._conn = duckdb.connect()
        self._registered_files: tuple = ("<unset>",)
        self.refresh()
        self._register_pricing_table()

    # -- plumbing --------------------------------------------------------------

    def files(self) -> list[Path]:
        """The JSONL files currently backing the ``spans`` view."""
        out: set[Path] = set()
        if self.log_dir.exists():
            for pattern in ("*.jsonl", "*.jsonl.gz"):
                out.update(self.log_dir.glob(pattern))
        return sorted(out)

    def refresh(self) -> None:
        """Re-point the ``spans`` view at the files currently on disk."""
        files = tuple(str(p) for p in self.files())
        if files == self._registered_files:
            return
        columns_sql = ", ".join(f"'{name}': '{typ}'" for name, typ in _COLUMNS.items())
        if files:
            quoted = ", ".join(
                "'" + f.replace("\\", "/").replace("'", "''") + "'" for f in files
            )
            select = (
                f"SELECT * FROM read_json([{quoted}], format='newline_delimited', "
                f"columns={{{columns_sql}}})"
            )
        else:
            select = (
                "SELECT "
                + ", ".join(f"CAST(NULL AS {typ}) AS {name}" for name, typ in _COLUMNS.items())
                + " WHERE FALSE"
            )
        self._conn.execute(f"CREATE OR REPLACE VIEW spans AS {select}")
        self._registered_files = files

    def _register_pricing_table(self) -> None:
        self._conn.execute(
            "CREATE OR REPLACE TABLE pricing(model VARCHAR, input_per_1k DOUBLE, output_per_1k DOUBLE)"
        )
        rows = [(m, p[0], p[1]) for m, p in self._pricing.items()]
        if rows:
            self._conn.executemany("INSERT INTO pricing VALUES (?, ?, ?)", rows)

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> "TraceQuery":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # -- escape hatch ------------------------------------------------------------

    def raw_sql(self, sql: str, params=None) -> list[dict]:
        """Run arbitrary DuckDB SQL over the logs. The ``spans`` view and the
        ``pricing`` table are available. Returns a list of dicts."""
        self.refresh()
        cursor = self._conn.execute(sql, params or [])
        if cursor.description is None:
            return []
        columns = [d[0] for d in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def df(self, sql: str, params=None):
        """Like raw_sql but returns a pandas DataFrame (pandas required)."""
        self.refresh()
        return self._conn.execute(sql, params or []).df()

    # -- trace-level helpers -------------------------------------------------------

    def get_trace(self, trace_id: str) -> list[dict]:
        """All spans of a trace, ordered by start time, JSON fields parsed."""
        rows = self.raw_sql(
            "SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_ns", [trace_id]
        )
        for row in rows:
            for key in ("metadata", "attributes", "events", "resource"):
                value = row.get(key)
                if isinstance(value, str):
                    try:
                        row[key] = json.loads(value)
                    except ValueError:
                        pass
        return rows

    def get_trace_tree(self, trace_id: str) -> list[dict]:
        """Nested parent->child tree for a trace, reconstructed from
        parent_span_id. Returns the list of root spans (a root has
        parent_span_id None); each node carries a ``children`` list."""
        spans = self.get_trace(trace_id)
        nodes = {s["span_id"]: dict(s, children=[]) for s in spans}
        roots: list[dict] = []
        for node in nodes.values():
            parent_id = node.get("parent_span_id")
            if parent_id and parent_id in nodes:
                nodes[parent_id]["children"].append(node)
            else:
                roots.append(node)

        def _sort(items: list[dict]) -> None:
            items.sort(key=lambda n: n.get("start_time_ns") or 0)
            for item in items:
                _sort(item["children"])

        _sort(roots)
        return roots

    def span_stats(self, trace_id: str) -> dict:
        """Tokens, cost, duration, and per-kind counts for one trace."""
        spans = self.get_trace(trace_id)
        if not spans:
            return {
                "trace_id": trace_id,
                "span_count": 0,
                "duration_ms": None,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "cost_total": None,
                "models": [],
                "by_kind": {},
            }
        prompt = completion = total = 0
        cost = 0.0
        priced = False
        models: set[str] = set()
        by_kind: dict[str, dict] = {}
        for s in spans:
            attributes = s.get("attributes") or {}
            model, p, c, t = _span_tokens(attributes)
            prompt += p
            completion += c
            total += t
            if model:
                models.add(model)
                estimate = pricing_mod.estimate_cost(model, p, c, self._pricing)
                if estimate is not None:
                    cost += estimate
                    priced = True
            kind = s.get("span_kind") or "UNKNOWN"
            slot = by_kind.setdefault(
                kind, {"count": 0, "duration_ms": 0.0, "total_tokens": 0}
            )
            slot["count"] += 1
            slot["duration_ms"] = round(slot["duration_ms"] + (s.get("duration_ms") or 0.0), 3)
            slot["total_tokens"] += t
        starts = [s["start_time_ns"] for s in spans if s.get("start_time_ns")]
        ends = [s["end_time_ns"] for s in spans if s.get("end_time_ns")]
        duration_ms = round((max(ends) - min(starts)) / 1e6, 3) if starts and ends else None
        return {
            "trace_id": trace_id,
            "span_count": len(spans),
            "duration_ms": duration_ms,
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
            "cost_total": round(cost, 6) if priced else None,
            "models": sorted(models),
            "by_kind": by_kind,
        }

    def list_traces(self, project: Optional[str] = None, since=None, limit: int = 50) -> list[dict]:
        """Newest traces first: root span name, duration, total tokens, cost."""
        conditions = ["parent_span_id IS NULL"]
        params: list = []
        if project:
            conditions.append("project = ?")
            params.append(project)
        if since is not None:
            conditions.append("start_time_ns >= ?")
            params.append(_to_ns(since))
        params.append(int(limit))
        roots = self.raw_sql(
            f"""
            SELECT trace_id, name, project, session_id, user_id,
                   start_time_ns, duration_ms, status
            FROM spans
            WHERE {' AND '.join(conditions)}
            ORDER BY start_time_ns DESC
            LIMIT ?
            """,
            params,
        )
        if not roots:
            return []
        trace_ids = [r["trace_id"] for r in roots]
        placeholders = ", ".join("?" for _ in trace_ids)
        grouped = self.raw_sql(
            f"""
            SELECT trace_id,
                   model,
                   COUNT(*) AS span_count,
                   SUM(COALESCE(prompt_tokens_raw, 0)) AS prompt_tokens,
                   SUM(COALESCE(completion_tokens_raw, 0)) AS completion_tokens,
                   SUM({_TOTAL_OR_SUM}) AS total_tokens
            FROM ({_TOKEN_PROJECTION}) sub
            WHERE trace_id IN ({placeholders})
            GROUP BY trace_id, model
            """,
            trace_ids,
        )
        stats: dict[str, dict] = {}
        for row in grouped:
            slot = stats.setdefault(
                row["trace_id"],
                {"span_count": 0, "total_tokens": 0, "cost": 0.0, "priced": False, "models": set()},
            )
            slot["span_count"] += row["span_count"] or 0
            slot["total_tokens"] += row["total_tokens"] or 0
            if row["model"]:
                slot["models"].add(row["model"])
                estimate = pricing_mod.estimate_cost(
                    row["model"], row["prompt_tokens"], row["completion_tokens"], self._pricing
                )
                if estimate is not None:
                    slot["cost"] += estimate
                    slot["priced"] = True
        out = []
        for root in roots:
            slot = stats.get(root["trace_id"], {})
            start_ns = root.get("start_time_ns")
            out.append(
                {
                    "trace_id": root["trace_id"],
                    "name": root.get("name"),
                    "project": root.get("project"),
                    "session_id": root.get("session_id"),
                    "user_id": root.get("user_id"),
                    "start_time": (
                        datetime.fromtimestamp(start_ns / 1e9, tz=timezone.utc).isoformat()
                        if start_ns
                        else None
                    ),
                    "start_time_ns": start_ns,
                    "duration_ms": root.get("duration_ms"),
                    "status": root.get("status"),
                    "span_count": slot.get("span_count", 0),
                    "total_tokens": slot.get("total_tokens", 0),
                    "cost_total": round(slot["cost"], 6) if slot.get("priced") else None,
                    "models": sorted(slot.get("models", set())),
                }
            )
        return out

    def aggregate(self, project: Optional[str] = None, group_by: str = "day", since=None) -> list[dict]:
        """Token/cost/latency rollups for dashboard charts.

        ``group_by`` is one of ``"day"``, ``"model"``, ``"kind"``.
        """
        key_exprs = {
            "day": "strftime(make_timestamp(CAST(start_time_ns / 1000 AS BIGINT)), '%Y-%m-%d')",
            "model": "model",
            "kind": "span_kind",
        }
        if group_by not in key_exprs:
            raise ValueError(f"group_by must be one of {sorted(key_exprs)}, got {group_by!r}")
        key_expr = key_exprs[group_by]
        conditions: list[str] = []
        params: list = []
        if project:
            conditions.append("project = ?")
            params.append(project)
        if since is not None:
            conditions.append("start_time_ns >= ?")
            params.append(_to_ns(since))
        if group_by == "model":
            conditions.append("model IS NOT NULL")
        rows = self.raw_sql(
            f"""
            SELECT {key_expr} AS grp,
                   COUNT(*) AS span_count,
                   COUNT(DISTINCT trace_id) AS trace_count,
                   COUNT(*) FILTER (WHERE span_kind = 'LLM') AS llm_span_count,
                   AVG(duration_ms) FILTER (WHERE span_kind = 'LLM') AS avg_llm_latency_ms,
                   SUM(COALESCE(prompt_tokens_raw, 0)) AS prompt_tokens,
                   SUM(COALESCE(completion_tokens_raw, 0)) AS completion_tokens,
                   SUM({_TOTAL_OR_SUM}) AS total_tokens
            FROM ({_TOKEN_PROJECTION}) sub
            {_where(conditions)}
            GROUP BY grp
            ORDER BY grp
            """,
            params,
        )
        cost_conditions = list(conditions)
        if "model IS NOT NULL" not in cost_conditions:
            cost_conditions.append("model IS NOT NULL")
        cost_rows = self.raw_sql(
            f"""
            SELECT {key_expr} AS grp,
                   model,
                   SUM(COALESCE(prompt_tokens_raw, 0)) AS prompt_tokens,
                   SUM(COALESCE(completion_tokens_raw, 0)) AS completion_tokens
            FROM ({_TOKEN_PROJECTION}) sub
            {_where(cost_conditions)}
            GROUP BY grp, model
            """,
            params,
        )
        costs: dict = {}
        for row in cost_rows:
            estimate = pricing_mod.estimate_cost(
                row["model"], row["prompt_tokens"], row["completion_tokens"], self._pricing
            )
            if estimate is not None:
                costs[row["grp"]] = costs.get(row["grp"], 0.0) + estimate
        for row in rows:
            grp = row.pop("grp")
            row["group"] = grp
            row["cost_total"] = round(costs[grp], 6) if grp in costs else None
            if row.get("avg_llm_latency_ms") is not None:
                row["avg_llm_latency_ms"] = round(row["avg_llm_latency_ms"], 3)
        return [{"group": r.pop("group"), **r} for r in rows]


def connect(log_dir="./localtrace_logs", pricing: Optional[Mapping] = None) -> TraceQuery:
    """Convenience factory: ``q = localtrace.query.connect("./localtrace_logs")``."""
    return TraceQuery(log_dir=log_dir, pricing=pricing)
