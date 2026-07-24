"""(a) Raw OpenAI SDK call, traced with ZERO changes at the call site.

Runs fully offline: the real `openai` SDK talks to an httpx.MockTransport
that replays a canned chat.completion response. localtrace.init() detects
the installed `openai` package and auto-instruments it -- the call below is
exactly what production code looks like.

    python examples/01_openai_stubbed.py
"""
import localtrace

localtrace.init(project="examples", log_dir="./localtrace_logs")

try:
    from _stub_openai import make_stub_client

    client = make_stub_client()
    # --- unchanged production-style call site ------------------------------
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Why store AI traces locally?"},
        ],
    )
    # -----------------------------------------------------------------------
    print("assistant:", response.choices[0].message.content)
    print("usage:", response.usage.total_tokens, "tokens")
except ImportError:
    from _stub_openai import emulated_llm_call

    print("`openai` not installed -- emitting an equivalent manual LLM span instead.")
    print("assistant:", emulated_llm_call([
        {"role": "user", "content": "Why store AI traces locally?"},
    ]))

localtrace.shutdown()
print("\nSpans written to ./localtrace_logs -- try: localtrace list")
