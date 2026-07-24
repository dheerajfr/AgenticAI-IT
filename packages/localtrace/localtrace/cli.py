"""Terminal interface over the local trace logs.

    localtrace list [--project X] [--limit N] [--since ISO]
    localtrace show <trace_id>
    localtrace stats <trace_id>
    localtrace query "<SQL>"

Terminal only by design -- a dashboard is a separate downstream consumer of
localtrace.query.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

from . import __version__
from .query import TraceQuery


def _fmt_int(value) -> str:
    return f"{int(value):,}" if value else "-"


def _fmt_cost(value) -> str:
    if value is None:
        return "-"
    return f"${value:.6f}" if 0 < value < 0.01 else f"${value:.4f}"


def _fmt_duration(ms) -> str:
    if ms is None:
        return "-"
    return f"{ms / 1000:.2f} s" if ms >= 1000 else f"{ms:.0f} ms"


def _fmt_time(ns) -> str:
    if not ns:
        return "-"
    return datetime.fromtimestamp(ns / 1e9, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _print_table(rows: list[dict], columns: list[tuple[str, str]]) -> None:
    if not rows:
        print("(no rows)")
        return
    widths = {
        key: max(len(header), max(len(str(row.get(key, ""))) for row in rows))
        for header, key in columns
    }
    header_line = "  ".join(header.ljust(widths[key]) for header, key in columns)
    print(header_line)
    print("  ".join("-" * widths[key] for _, key in columns))
    for row in rows:
        print("  ".join(str(row.get(key, "")).ljust(widths[key]) for _, key in columns))


def cmd_list(args: argparse.Namespace) -> int:
    q = TraceQuery(args.log_dir)
    traces = q.list_traces(project=args.project, since=args.since, limit=args.limit)
    if not traces:
        print(f"No traces found in {args.log_dir}")
        return 0
    rows = [
        {
            "trace_id": t["trace_id"],
            "started": _fmt_time(t["start_time_ns"]),
            "name": (t["name"] or "")[:40],
            "status": t["status"] or "-",
            "spans": t["span_count"],
            "tokens": _fmt_int(t["total_tokens"]),
            "cost": _fmt_cost(t["cost_total"]),
            "duration": _fmt_duration(t["duration_ms"]),
            "project": t["project"] or "-",
        }
        for t in traces
    ]
    _print_table(
        rows,
        [
            ("TRACE ID", "trace_id"),
            ("STARTED (UTC)", "started"),
            ("NAME", "name"),
            ("STATUS", "status"),
            ("SPANS", "spans"),
            ("TOKENS", "tokens"),
            ("COST", "cost"),
            ("DURATION", "duration"),
            ("PROJECT", "project"),
        ],
    )
    return 0


def _node_label(node: dict) -> str:
    attributes = node.get("attributes") or {}
    parts = [f"[{node.get('span_kind', 'UNKNOWN')}]", node.get("name") or "?"]
    model = attributes.get("llm.model_name")
    if model:
        parts.append(f"model={model}")
    total = attributes.get("llm.token_count.total")
    if not total:
        prompt = attributes.get("llm.token_count.prompt") or 0
        completion = attributes.get("llm.token_count.completion") or 0
        total = (prompt or 0) + (completion or 0) or None
    if total:
        parts.append(f"tokens={total}")
    if node.get("duration_ms") is not None:
        parts.append(f"({_fmt_duration(node['duration_ms'])})")
    status = node.get("status")
    if status and status != "UNSET":
        parts.append("ERROR" if status == "ERROR" else status)
    return " ".join(str(p) for p in parts)


def _render_tree(node: dict, prefix: str = "", is_last: bool = True, is_root: bool = True) -> None:
    if is_root:
        print(_node_label(node))
        child_prefix = ""
    else:
        connector = "`-- " if is_last else "|-- "
        print(prefix + connector + _node_label(node))
        child_prefix = prefix + ("    " if is_last else "|   ")
    children = node.get("children") or []
    for i, child in enumerate(children):
        _render_tree(child, child_prefix, i == len(children) - 1, is_root=False)


def cmd_show(args: argparse.Namespace) -> int:
    q = TraceQuery(args.log_dir)
    roots = q.get_trace_tree(args.trace_id)
    if not roots:
        print(f"Trace {args.trace_id} not found in {args.log_dir}", file=sys.stderr)
        return 1
    stats = q.span_stats(args.trace_id)
    print(
        f"Trace {args.trace_id}\n"
        f"  spans={stats['span_count']}  duration={_fmt_duration(stats['duration_ms'])}  "
        f"tokens={_fmt_int(stats['total_tokens'])}  cost={_fmt_cost(stats['cost_total'])}\n"
    )
    for root in roots:
        _render_tree(root)
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    q = TraceQuery(args.log_dir)
    stats = q.span_stats(args.trace_id)
    if args.json:
        print(json.dumps(stats, indent=2, default=str))
        return 0
    if stats["span_count"] == 0:
        print(f"Trace {args.trace_id} not found in {args.log_dir}", file=sys.stderr)
        return 1
    print(f"Trace {stats['trace_id']}")
    print(f"  spans:             {stats['span_count']}")
    print(f"  duration:          {_fmt_duration(stats['duration_ms'])}")
    print(f"  prompt tokens:     {_fmt_int(stats['prompt_tokens'])}")
    print(f"  completion tokens: {_fmt_int(stats['completion_tokens'])}")
    print(f"  total tokens:      {_fmt_int(stats['total_tokens'])}")
    print(f"  est. cost:         {_fmt_cost(stats['cost_total'])}")
    if stats["models"]:
        print(f"  models:            {', '.join(stats['models'])}")
    print("  by kind:")
    for kind, slot in sorted(stats["by_kind"].items()):
        print(
            f"    {kind:<12} count={slot['count']}  duration={_fmt_duration(slot['duration_ms'])}"
            f"  tokens={_fmt_int(slot['total_tokens'])}"
        )
    return 0


def cmd_query(args: argparse.Namespace) -> int:
    q = TraceQuery(args.log_dir)
    rows = q.raw_sql(args.sql)
    if args.json:
        print(json.dumps(rows, indent=2, default=str))
        return 0
    if not rows:
        print("(no rows)")
        return 0
    columns = [(key, key) for key in rows[0].keys()]
    printable = [{k: ("" if v is None else v) for k, v in row.items()} for row in rows]
    _print_table(printable, columns)
    return 0


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(errors="replace")
        except Exception:
            pass
    parser = argparse.ArgumentParser(
        prog="localtrace",
        description="Query locally captured AI traces (JSONL + DuckDB). Terminal only.",
    )
    parser.add_argument("--version", action="version", version=f"localtrace {__version__}")
    parser.add_argument(
        "-d", "--log-dir", default="./localtrace_logs", help="trace log directory"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="list recent traces, newest first")
    p_list.add_argument("--project", default=None)
    p_list.add_argument("--limit", type=int, default=50)
    p_list.add_argument("--since", default=None, help="ISO date/datetime lower bound")
    p_list.set_defaults(func=cmd_list)

    p_show = sub.add_parser("show", help="pretty-print the span tree of a trace")
    p_show.add_argument("trace_id")
    p_show.set_defaults(func=cmd_show)

    p_stats = sub.add_parser("stats", help="tokens / cost / duration for a trace")
    p_stats.add_argument("trace_id")
    p_stats.add_argument("--json", action="store_true")
    p_stats.set_defaults(func=cmd_stats)

    p_query = sub.add_parser("query", help="run DuckDB SQL over the logs")
    p_query.add_argument("sql")
    p_query.add_argument("--json", action="store_true")
    p_query.set_defaults(func=cmd_query)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
