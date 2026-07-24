"""Read the logs back through the DuckDB query layer -- exactly what a
separate dashboard process would do. Run examples 01-03 first.

    python examples/04_query.py
"""
from localtrace import TraceQuery

q = TraceQuery("./localtrace_logs")

print("== latest traces ==")
for t in q.list_traces(limit=5):
    print(
        f"  {t['trace_id']}  {str(t['name'])[:28]:<28}  spans={t['span_count']}"
        f"  tokens={t['total_tokens']}  cost={t['cost_total']}"
    )

traces = q.list_traces(limit=1)
if traces:
    trace_id = traces[0]["trace_id"]

    print(f"\n== span tree for {trace_id} ==")

    def show(node: dict, depth: int = 0) -> None:
        print("  " * depth + f"- [{node['span_kind']}] {node['name']} ({node['duration_ms']} ms)")
        for child in node["children"]:
            show(child, depth + 1)

    for root in q.get_trace_tree(trace_id):
        show(root)

    print("\n== span_stats ==")
    stats = q.span_stats(trace_id)
    for key in ("span_count", "duration_ms", "total_tokens", "cost_total", "models"):
        print(f"  {key}: {stats[key]}")

print("\n== aggregate(group_by='model') ==")
for row in q.aggregate(group_by="model"):
    print(
        f"  {row['group']:<20} llm_calls={row['llm_span_count']}"
        f"  tokens={row['total_tokens']}  cost={row['cost_total']}"
    )

print("\n== raw_sql escape hatch: spans by kind ==")
for row in q.raw_sql("SELECT span_kind, COUNT(*) AS n FROM spans GROUP BY 1 ORDER BY n DESC"):
    print(f"  {row['span_kind']:<12} {row['n']}")
