"""Offline stand-ins for an LLM provider -- no API key, no network.

`make_stub_client()` returns a REAL `openai` SDK client whose HTTP layer is
an httpx.MockTransport replaying a canned chat.completion response. Calls
through it exercise the genuine SDK code path, so
openinference-instrumentation-openai traces them exactly like production
traffic -- with zero changes at the call site.

`emulated_llm_call()` is the fallback when `openai`/`httpx` are not
installed: it emits an equivalent OpenInference LLM span by hand.
"""
from __future__ import annotations

import json

ANSWER = (
    "Local traces stay on your machine, survive restarts as plain JSONL, "
    "and can be replayed into any OpenInference/OTLP backend later."
)


def make_stub_client(default_model: str = "gpt-4o-mini"):
    """A real openai.OpenAI client wired to a canned offline transport."""
    import httpx
    from openai import OpenAI

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content or b"{}")
        messages = payload.get("messages", [])
        prompt_tokens = sum(len(str(m.get("content", ""))) // 4 + 4 for m in messages)
        completion_tokens = len(ANSWER) // 4
        body = {
            "id": "chatcmpl-local-0001",
            "object": "chat.completion",
            "created": 1752444000,
            "model": payload.get("model", default_model),
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": ANSWER},
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }
        return httpx.Response(200, json=body)

    transport = httpx.MockTransport(handler)
    return OpenAI(
        api_key="sk-offline-stub",
        base_url="http://stub.localhost/v1",
        http_client=httpx.Client(transport=transport),
    )


def emulated_llm_call(messages: list[dict], model: str = "gpt-4o-mini") -> str:
    """Fallback when `openai` is missing: hand-built OpenInference LLM span."""
    import localtrace

    prompt_tokens = sum(len(str(m.get("content", ""))) // 4 + 4 for m in messages)
    completion_tokens = len(ANSWER) // 4
    with localtrace.span("ChatCompletion", kind="LLM") as sp:
        sp.set_attribute("llm.model_name", model)
        sp.set_attribute("llm.provider", "openai")
        sp.set_attribute("llm.system", "openai")
        sp.set_attribute("llm.invocation_parameters", json.dumps({"model": model}))
        sp.set_attribute("input.value", json.dumps({"messages": messages, "model": model}))
        sp.set_attribute("input.mime_type", "application/json")
        for i, message in enumerate(messages):
            sp.set_attribute(f"llm.input_messages.{i}.message.role", str(message["role"]))
            sp.set_attribute(f"llm.input_messages.{i}.message.content", str(message["content"]))
        sp.set_attribute("llm.output_messages.0.message.role", "assistant")
        sp.set_attribute("llm.output_messages.0.message.content", ANSWER)
        sp.set_attribute("llm.token_count.prompt", prompt_tokens)
        sp.set_attribute("llm.token_count.completion", completion_tokens)
        sp.set_attribute("llm.token_count.total", prompt_tokens + completion_tokens)
        sp.set_attribute("output.value", ANSWER)
        sp.set_attribute("output.mime_type", "text/plain")
    return ANSWER
