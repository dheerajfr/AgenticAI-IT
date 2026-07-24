"""Multi-source proof: ONE trace that mixes all three capture paths --

  1. an auto-instrumented raw OpenAI SDK call (stubbed, offline),
  2. a custom function decorated with @localtrace.trace(kind="AGENT"),
  3. a manual `with localtrace.span("retrieve", kind="RETRIEVER")` block,

grouped under a session/user via set_session(). Prints the trace id so you
can inspect it with `localtrace show <trace_id>`.

    python examples/03_multi_source.py
"""
import json

import localtrace

localtrace.init(project="examples", log_dir="./localtrace_logs")
localtrace.set_session(session_id="demo-session-1", user_id="user-42", channel="cli-demo")

# --- source 1: raw OpenAI SDK (auto-instrumented), offline stub -------------
try:
    from _stub_openai import make_stub_client

    _client = make_stub_client()

    def llm_call(question: str, context: str) -> str:
        response = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Answer using this context: " + context},
                {"role": "user", "content": question},
            ],
        )
        return response.choices[0].message.content
except ImportError:
    from _stub_openai import emulated_llm_call

    def llm_call(question: str, context: str) -> str:
        return emulated_llm_call([
            {"role": "system", "content": "Answer using this context: " + context},
            {"role": "user", "content": question},
        ])


# --- source 3: manual span for a homegrown retriever -------------------------
def retrieve(question: str) -> list[str]:
    with localtrace.span("retrieve", kind="RETRIEVER") as sp:
        sp.set_attribute("input.value", question)
        docs = [
            "Local logs are append-only JSONL, one span per line.",
            "OpenInference attributes are stored verbatim for portability.",
        ]
        for i, doc in enumerate(docs):
            sp.set_attribute(f"retrieval.documents.{i}.document.id", f"doc-{i}")
            sp.set_attribute(f"retrieval.documents.{i}.document.content", doc)
        sp.set_attribute("output.value", json.dumps(docs))
        return docs


# --- source 2: custom agent via decorator ------------------------------------
@localtrace.trace(kind="AGENT")
def answer_question(question: str) -> str:
    docs = retrieve(question)
    return llm_call(question, " ".join(docs))


if __name__ == "__main__":
    with localtrace.span("handle-request", kind="CHAIN") as root:
        trace_id = format(root.get_span_context().trace_id, "032x")
        result = answer_question("Why keep AI traces local?")
    print("answer:", result)
    localtrace.shutdown()
    print("\ntrace id:", trace_id)
    print("inspect it with:  localtrace show", trace_id)
