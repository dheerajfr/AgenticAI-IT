"""(b) A custom function traced with @localtrace.trace(kind="AGENT") and
(c) a manual `with localtrace.span(...)` RETRIEVER block -- the escape
hatches for code no auto-instrumentor covers.

    python examples/02_custom_agent.py
"""
import json

import localtrace

localtrace.init(project="examples", log_dir="./localtrace_logs")

CORPUS = [
    "localtrace appends every span to date-rotated JSONL files.",
    "DuckDB reads the JSONL glob directly; there is no ETL step.",
    "Spans follow the OpenInference semantic conventions on top of OTel.",
    "The logs can be replayed into Phoenix, Langfuse, or any OTLP backend.",
]


def retrieve(question: str) -> list[str]:
    """A homegrown retriever -- traced manually as a RETRIEVER span."""
    with localtrace.span("retrieve-docs", kind="RETRIEVER") as sp:
        sp.set_attribute("input.value", question)
        words = {w.strip("?.,").lower() for w in question.split()}
        hits = [d for d in CORPUS if words & set(d.lower().split())] or CORPUS[:2]
        for i, doc in enumerate(hits):
            sp.set_attribute(f"retrieval.documents.{i}.document.id", f"doc-{i}")
            sp.set_attribute(f"retrieval.documents.{i}.document.content", doc)
        sp.set_attribute("output.value", json.dumps(hits))
        return hits


@localtrace.trace(kind="TOOL")
def compose_answer(question: str, docs: list[str]) -> str:
    return f"Q: {question} A: " + " ".join(docs)


@localtrace.trace(kind="AGENT")
def run_agent(question: str) -> str:
    """A custom agent -- one decorator, inputs and output recorded."""
    docs = retrieve(question)
    return compose_answer(question, docs)


if __name__ == "__main__":
    print("agent answer:", run_agent("How are traces stored?"))
    localtrace.shutdown()
    print("\nSpans written to ./localtrace_logs -- try: localtrace list")
