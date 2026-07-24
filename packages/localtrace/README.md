# localtrace

**Local-first, framework-agnostic AI tracing for Python.**

localtrace captures a trace of everything your AI application does — every LLM call, agent step, tool invocation, and retrieval, from **any** LLM SDK or agent framework — using the [OpenInference](https://github.com/Arize-ai/openinference) semantic conventions on top of OpenTelemetry. Every span is appended to **local JSONL log files** (the durable source of truth) and served back through a **DuckDB SQL** query layer for a CLI or a downstream dashboard.

**No network calls. No external services. No API keys. Just files on your disk.**

```
your app ──► OTel TracerProvider ──► BatchSpanProcessor ──► JSONLSpanExporter
                    ▲                 (background thread)          │
     auto-instrumentors (openai,                                   ▼
     anthropic, langchain, crewai …)               ./localtrace_logs/traces-YYYY-MM-DD.jsonl
     + @trace / span() for your code                               │
                                                                   ▼
                                             DuckDB (read_json over the glob) ──► CLI / your dashboard
```

---

## Table of contents

1. [Where to get the package from](#1-where-to-get-the-package-from)
2. [Installation](#2-installation)
3. [Quickstart — one line](#3-quickstart--one-line)
4. [Integrating into an existing application (step by step)](#4-integrating-into-an-existing-application-step-by-step)
5. [Integration checklist for AI coding agents](#5-integration-checklist-for-ai-coding-agents)
6. [How it works (in detail)](#6-how-it-works-in-detail)
7. [The JSONL record schema](#7-the-jsonl-record-schema)
8. [Reading the data back: query layer & CLI](#8-reading-the-data-back-query-layer--cli)
9. [Configuration reference](#9-configuration-reference)
10. [Supported frameworks](#10-supported-frameworks)
11. [Where to use it — and where not to](#11-where-to-use-it--and-where-not-to)
12. [Limitations](#12-limitations)
13. [Troubleshooting](#13-troubleshooting)
14. [Examples & tests](#14-examples--tests)

---

## 1. Where to get the package from

localtrace is **not published on PyPI**. You install it **from this repository** (a plain `pip install localtrace` from PyPI will not give you this package). Three ways:

```bash
# A) Editable install from a local checkout (recommended for development)
git clone <this-repo-url> localtrace
cd localtrace
pip install -e ".[all]"

# B) Directly from a git URL
pip install "localtrace[all] @ git+https://<this-repo-url>"

# C) Build a wheel once, install it anywhere (air-gapped machines, CI)
pip install build && python -m build
pip install dist/localtrace-0.1.0-py3-none-any.whl

# D) Receive it as a .zip from a colleague — see the section right below
```

Requirements: **Python 3.10+**. Core dependencies are only `opentelemetry-sdk`, `opentelemetry-api`, `openinference-semantic-conventions`, and `duckdb`.

### Sharing the package as a .zip

**If you are the sender** — from the repo root, build a clean archive (excludes `.venv`, caches, logs, and build artifacts):

```powershell
python tools\make_zip.py
# -> dist\localtrace-0.1.0-src.zip   (send this file)
```

**If you received `localtrace-0.1.0-src.zip`** — exact setup, start to finish. You need Python 3.10+ and internet access once (localtrace's dependencies are downloaded from PyPI during install; the zip only contains localtrace itself).

**Windows (PowerShell):**

```powershell
# 1. Unzip (right-click -> Extract All also works)
Expand-Archive localtrace-0.1.0-src.zip -DestinationPath C:\dev
cd C:\dev\localtrace-0.1.0

# 2. Confirm Python is 3.10 or newer
python --version

# 3. Create and activate a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1
#   if activation is blocked, first run:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 4. Install localtrace with the extras you need
pip install -e ".[all]"          # or ".[openai]", ".[langchain,crewai]", ...

# 5. Verify the install
python -c "import localtrace; print('localtrace', localtrace.__version__)"
python examples\03_multi_source.py     # runs fully offline, writes real spans
localtrace list                        # the trace from the example appears
```

**macOS / Linux:**

```bash
unzip localtrace-0.1.0-src.zip -d ~/dev
cd ~/dev/localtrace-0.1.0
python3 --version                      # needs 3.10+
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[all]"
python -c "import localtrace; print('localtrace', localtrace.__version__)"
python examples/03_multi_source.py
localtrace list
```

**Then wire it into your own application.** The steps above installed localtrace into a *demo* environment. To use it in your app, activate **your app's** environment (or add it to your app's `requirements.txt` as a path) and install from the unzipped folder:

```powershell
# with your application's venv active:
pip install "C:\dev\localtrace-0.1.0[all]"      # plain install, or -e for editable
```

then add the two lines from [Quickstart](#3-quickstart--one-line) / the full recipe in [Integrating into an existing application](#4-integrating-into-an-existing-application-step-by-step):

```python
import localtrace
localtrace.init(project="my-app")
```

**Fully offline target machine?** On any connected machine: `pip download ".[all]" -d wheels` from the unzipped folder, ship the `wheels/` folder along with the zip, then install with `pip install --no-index --find-links=wheels -e ".[all]"`.

Common recipient pitfalls: `localtrace` command "not recognized" means the venv isn't active (re-run the activate line — the CLI lives inside the venv's `Scripts`/`bin`); installing while a *different* project's venv is active puts localtrace in that project instead — check with `pip show localtrace`.

## 2. Installation

Install the core plus the extras that match **your** stack. Each extra pulls only the small OpenInference instrumentor package — never the AI library itself:

```bash
pip install -e ".[openai]"              # OpenAI SDK (also covers Azure OpenAI clients)
pip install -e ".[anthropic]"           # Anthropic SDK
pip install -e ".[langchain]"           # LangChain / LangGraph
pip install -e ".[openai,langchain,crewai]"   # combine freely
pip install -e ".[all]"                 # every supported instrumentor
```

Available extras: `openai`, `anthropic`, `bedrock`, `google-genai`, `vertexai`, `mistralai`, `groq`, `litellm`, `langchain`, `llama-index`, `crewai`, `dspy`, `haystack`, `autogen`, `openai-agents`, `smolagents`, `pydantic-ai`, `instructor`, `mcp`, plus `http` (OTel `requests`/`httpx` instrumentation for raw REST calls) and `all`. For running the offline examples and tests: `.[examples,dev]`.

## 3. Quickstart — one line

```python
import localtrace
localtrace.init()
```

That is genuinely all an existing app needs. `init()` auto-detects every supported AI library that is installed and instruments it — **your existing call sites do not change**:

```python
import localtrace
localtrace.init(project="my-app")

from openai import OpenAI
client = OpenAI()
client.chat.completions.create(model="gpt-4o-mini", messages=[...])   # traced ✔
```

Every call now lands in `./localtrace_logs/traces-YYYY-MM-DD.jsonl` with model name, token counts, full input/output messages, invocation parameters, latency, and errors. Verify with:

```bash
localtrace list
```

## 4. Integrating into an existing application (step by step)

This is the full recipe for a real application — e.g. a multi-agent system with a planner, workers, tools, and a retriever.

### Step 1 — Call `init()` once, at the very top of your entry point

Put it **before** you create LLM clients or agents, so instrumentation is in place when they are constructed:

```python
# main.py / app.py / worker startup
import localtrace

localtrace.init(
    project="support-copilot",       # tags every span; filterable at query time
    log_dir="./localtrace_logs",
    environment="dev",               # or "prod" — stored on every span
)
```

If your agents run on a supported SDK/framework, **the LLM layer is now fully traced** — nothing else is mandatory. Steps 2–4 add structure and grouping.

### Step 2 — Give each request one root span

Wrap your top-level handler so that everything one user request triggers becomes **one trace** (one tree), instead of loose spans:

```python
def handle_user_message(message: str) -> str:
    with localtrace.span("handle-request", kind="CHAIN"):
        return orchestrator.run(message)
```

### Step 3 — Group traces by conversation and user

Call `set_session()` at the start of each request. It stamps `session_id` / `user_id` / metadata onto **every** span started afterwards — including spans created by auto-instrumented libraries:

```python
localtrace.set_session(session_id=conversation_id, user_id=user_id, channel="web")
...
localtrace.clear_session()   # when the request is done
```

### Step 4 — Mark your custom agents and tools

Auto-instrumentation covers *library* calls. Your own orchestration code is plain Python, so label it with the decorator (sync **and** async supported; inputs and return value are recorded):

```python
@localtrace.trace(kind="AGENT")
def planner_agent(task: str) -> Plan: ...

@localtrace.trace(kind="AGENT")
async def researcher_agent(question: str) -> str: ...

@localtrace.trace(kind="TOOL")
def search_web(query: str) -> list[dict]: ...
```

For homegrown components where you want to attach specific attributes, use the context manager:

```python
def retrieve(query: str) -> list[str]:
    with localtrace.span("vector-search", kind="RETRIEVER") as sp:
        sp.set_attribute("input.value", query)
        docs = store.search(query)
        sp.set_attribute("output.value", json.dumps(docs))
        return docs
```

Span kinds follow OpenInference: `CHAIN`, `LLM`, `TOOL`, `AGENT`, `RETRIEVER`, `EMBEDDING`, `RERANKER`, `GUARDRAIL`, `EVALUATOR`.

### Step 5 — Production hardening

```python
localtrace.init(
    project="support-copilot",
    environment="prod",
    redact=[r"[\w.+-]+@[\w-]+\.[\w.-]+", r"sk-[A-Za-z0-9]{8,}"],  # strip PII/keys BEFORE write
    capture_content=False,      # optional: drop prompt/completion text, keep tokens/latency/models
    sample_rate=0.2,            # optional head sampling: trace 20% of requests (1.0 = everything)
    max_payload_chars=10_000,   # truncate giant payloads with a "...[truncated]" marker
    retention_days=30,          # delete log files older than 30 days
    max_file_mb=100,            # size rotation within a day
    gzip_rotated=True,          # compress rotated files
)
```

### Step 6 — Verify

```bash
python your_app.py            # exercise one request
localtrace list               # the trace appears, with tokens & cost
localtrace show <trace_id>    # the agent tree
```

Other lifecycle API: `localtrace.flush()` (force pending spans to disk), `localtrace.shutdown()` (flush + close; also runs automatically via `atexit`, so spans survive a process that exits without calling it), and `with localtrace.session(project=...):` which wraps init/shutdown for scripts and batch jobs.

## 5. Integration checklist for AI coding agents

A deterministic recipe for automated integration into an arbitrary Python codebase:

1. `pip install -e "<path-to-this-repo>[all]"` (or the extras matching imports found in the target repo).
2. Locate the application entry point (`main()`, FastAPI/Flask app factory, worker bootstrap). Insert `import localtrace` and `localtrace.init(project="<repo-name>")` as the **first** application statements, before any LLM client/agent construction.
3. Locate the top-level per-request function; wrap its body in `with localtrace.span("handle-request", kind="CHAIN"):`.
4. If a conversation/user id is available at that point, add `localtrace.set_session(session_id=..., user_id=...)` before the span.
5. Decorate functions that implement agents with `@localtrace.trace(kind="AGENT")` and tool functions with `@localtrace.trace(kind="TOOL")`. Do **not** decorate functions that only call an already-instrumented SDK — that would just add noise.
6. Verify: run the app's smallest end-to-end path, then run `localtrace list` and confirm a trace with span_count > 1 exists; run `localtrace show <trace_id>` and confirm the LLM span carries `llm.token_count.total`.
7. Do not add `shutdown()` calls inside request handlers — only (optionally) at process exit; `atexit` already covers normal exits.

## 6. How it works (in detail)

### Spans, traces, and how nesting happens

Every unit of work is a **span**: name, kind, start/end time (ns), status, and an attribute map. Spans share a **`trace_id`** per request and link via **`parent_span_id`**. OpenTelemetry keeps the "currently active span" in a Python `contextvar`; when your decorated agent is running and it calls an LLM, the LLM span starts *while the agent span is current* and is automatically recorded as its child. This works through `async`/`await` too. That is why a multi-agent call chain produces a correct tree with zero plumbing.

### What `init()` sets up

1. **TracerProvider** ([localtrace/\_\_init\_\_.py](localtrace/__init__.py)) — the OTel engine, with a `Resource` carrying `project`, `service_name`, `environment`, and the localtrace version. It is registered as the process-global provider, so any OTel-aware code in the process feeds into it. Head sampling (`sample_rate`) is applied here, at the root of each trace.
2. **Auto-instrumentation** — a registry maps each framework to its OpenInference instrumentor. For each entry, if the target library **and** the instrumentor package are importable, `instrument(tracer_provider=...)` is called; that instrumentor patches the library so every call emits a span with standardized attributes (`llm.model_name`, `llm.token_count.*`, `llm.input_messages.*`, …). Missing libraries are skipped silently — `init()` cannot crash your app because a library is absent. Pass `frameworks=["openai", "langchain"]` to pin the set, or `"none"` to disable.
3. **Session processor** — stamps whatever `set_session()` stored onto every span at start time, so even library-created spans carry your conversation/user grouping.
4. **Export pipeline** — a `BatchSpanProcessor` collects finished spans on a **background thread** (your request path never blocks on disk I/O) and hands batches to the [JSONLSpanExporter](localtrace/exporter.py). The exporter applies the cross-cutting rules **before write** — redaction (regexes/callable over string values), truncation (`max_payload_chars`), and `capture_content=False` (blanks content keys, keeps structure and metrics) — then serializes each span to one JSON line.
5. **Storage** ([localtrace/store.py](localtrace/store.py)) — a thread-safe, append-only writer. Files are named per UTC day (`traces-2026-07-21.jsonl`), rotate by size when `max_file_mb` is set (`traces-2026-07-21.001.jsonl`, optionally gzipped), and `retention_days` prunes old files. The file handle is opened per batch, so external readers never contend with a long-lived lock.
6. **atexit hook** — `shutdown()` is registered so the final batch is flushed even when the process ends right after a call.

### The read path

[localtrace/query.py](localtrace/query.py) opens DuckDB **directly over the JSONL glob** (`read_json`, including `.jsonl.gz`) — no import step, no ETL, no fixed schema for attributes (they stay a JSON map). The `spans` view is re-pointed at whatever files currently exist, so a long-lived dashboard process always sees fresh data. **Cost** is computed at query time: token counts from the attributes joined against a model→price map ([localtrace/pricing.py](localtrace/pricing.py)) that you can override — the shipped defaults are estimates, never authoritative.

### Portability guarantee

Spans follow the OpenInference semantic conventions on standard OTel spans, and the attribute map is stored **verbatim**. The same JSONL files can later be replayed into Arize Phoenix, Langfuse, or any OTLP-compatible backend with zero application changes — the format is just "OTel span as JSON, one per line". Nothing is proprietary.

## 7. The JSONL record schema

One JSON object per line, `schema_version: 1`:

| Field | Meaning |
|---|---|
| `schema_version`, `project`, `service_name`, `environment` | record version + resource identity |
| `trace_id`, `span_id`, `parent_span_id` | hex ids; root spans have `parent_span_id: null` |
| `name`, `span_kind` | span name + OpenInference kind (`LLM`, `AGENT`, …) |
| `start_time_ns`, `end_time_ns`, `duration_ms` | timing (epoch nanoseconds) |
| `status`, `status_message` | `OK` / `ERROR` / `UNSET` + error text |
| `session_id`, `user_id`, `metadata` | grouping from `set_session()` |
| `attributes` | the **complete OpenInference map, verbatim** — messages, token counts, model, invocation params, documents, embeddings, tool calls, … |
| `events` | span events, including exceptions with stack traces |
| `resource` | full OTel resource attributes |

Real captured example (abridged):

```json
{"schema_version": 1, "project": "examples", "trace_id": "000bf45a43ad5ff58d50daaddc3b9500",
 "span_id": "d77082d9ec2a4aca", "parent_span_id": "00597ea65bb77d48",
 "name": "ChatCompletion", "span_kind": "LLM", "duration_ms": 135.547, "status": "OK",
 "session_id": "demo-session-1", "user_id": "user-42", "metadata": {"channel": "cli-demo"},
 "attributes": {"llm.model_name": "gpt-4o-mini", "llm.token_count.prompt": 49,
   "llm.token_count.completion": 32, "llm.token_count.total": 81,
   "llm.input_messages.0.message.role": "system", "llm.finish_reason": "stop", "...": "..."},
 "events": []}
```

## 8. Reading the data back: query layer & CLI

### Python (what a dashboard imports)

```python
from localtrace import TraceQuery

q = TraceQuery("./localtrace_logs")               # pricing overridable: TraceQuery(dir, pricing={...})
q.list_traces(project="my-app", limit=20)         # newest first: root name, duration, tokens, cost
q.get_trace(trace_id)                             # all spans of one trace
q.get_trace_tree(trace_id)                        # nested parent→child tree (roots have parent None)
q.span_stats(trace_id)                            # tokens, cost, duration, counts by span kind
q.aggregate(group_by="day")                       # or "model" / "kind" — rollups for charts
q.raw_sql("SELECT ... FROM spans ...")            # escape hatch: arbitrary DuckDB SQL
q.df("SELECT ...")                                # same, as pandas DataFrame (pandas required)
```

SQL examples over the `spans` view (OpenInference keys contain dots, so JSON paths quote them):

```sql
-- token spend per model
SELECT attributes->>'$."llm.model_name"' AS model,
       SUM(TRY_CAST(attributes->>'$."llm.token_count.total"' AS BIGINT)) AS tokens
FROM spans WHERE span_kind = 'LLM' GROUP BY model;

-- error rate per project
SELECT project, COUNT(*) FILTER (WHERE status = 'ERROR') * 1.0 / COUNT(*) AS error_rate
FROM spans GROUP BY project;
```

A `pricing` table (`model`, `input_per_1k`, `output_per_1k`) is registered alongside `spans` for joins.

### CLI

```bash
localtrace list [--project X] [--limit N] [--since 2026-07-01] [-d LOG_DIR]
localtrace show  <trace_id>        # indented span tree: kind, model, tokens, duration
localtrace stats <trace_id>        # token / cost / per-kind breakdown (--json available)
localtrace query "SELECT span_kind, COUNT(*) FROM spans GROUP BY 1"
```

Terminal only by design — a web dashboard is a separate downstream consumer of `localtrace.query`.

### Overriding prices

Costs come from a model→(input $/1K, output $/1K) map. Defaults ship in [localtrace/pricing.py](localtrace/pricing.py) but **prices change — treat them as estimates** and override via any of:

1. `TraceQuery(log_dir, pricing={"gpt-4o-mini": (0.00015, 0.0006)})`
2. a `pricing.json` in the log dir: `{"gpt-4o-mini": {"input_per_1k": 0.00015, "output_per_1k": 0.0006}}`
3. `localtrace.pricing.update_pricing({...})` process-wide

Matching is exact first, then longest substring — `openai/gpt-4o-mini-2024-07-18` resolves to `gpt-4o-mini`.

## 9. Configuration reference

All parameters of `localtrace.init()`:

| Parameter | Default | Effect |
|---|---|---|
| `project` | `"default"` | tag on every span; filter key at query time |
| `log_dir` | `"./localtrace_logs"` | where JSONL files are written |
| `frameworks` | `"auto"` | `"auto"` = instrument everything installed; a list pins the set; `"none"` disables |
| `sample_rate` | `1.0` | head sampling; `1.0` traces everything, `0.0` nothing, `0.2` = 20% of traces |
| `capture_content` | `True` | `False` drops prompt/completion/document text but keeps structure & metrics |
| `max_payload_chars` | `10000` | truncates oversized stored strings with `...[truncated]` |
| `redact` | `None` | list of regexes (or a `str -> str` callable) applied to strings **before** write |
| `service_name` | `project` | OTel `service.name` |
| `environment` | `None` | e.g. `"prod"`; stored on every span |
| `retention_days` | `None` | delete log files older than N days |
| `max_file_mb` | `None` | size-based rotation within a day |
| `gzip_rotated` | `False` | gzip rotated files |

Calling `init()` again tears down the previous setup and starts fresh (useful in notebooks/tests).

## 10. Supported frameworks

Auto-detected when both the library and its instrumentor extra are installed:

| Kind | Frameworks |
|---|---|
| LLM SDKs | OpenAI (`openai`), Anthropic (`anthropic`), AWS Bedrock (`bedrock`), Google Gemini (`google-genai`), Vertex AI (`vertexai`), Mistral (`mistralai`), Groq (`groq`), LiteLLM (`litellm`) |
| Agent / orchestration | LangChain & LangGraph (`langchain`), LlamaIndex (`llama-index`), CrewAI (`crewai`), DSPy (`dspy`), Haystack (`haystack`), AutoGen (`autogen`), OpenAI Agents SDK (`openai-agents`), smolagents (`smolagents`), pydantic-ai (`pydantic-ai`), Instructor (`instructor`), MCP (`mcp`) |
| Raw HTTP (opt-in only) | `requests`, `httpx` — never enabled by `"auto"` because they trace *every* HTTP request; pass explicitly: `frameworks=["openai", "httpx"]` |

Framework instrumentors emit their own `AGENT`/`TOOL`/`CHAIN` spans, so e.g. a CrewAI crew shows its agents and tasks, not just the underlying LLM calls. Note for **pydantic-ai**: its integration is a span *processor* that rewrites pydantic-ai's native OTel spans; you must also enable instrumentation on the pydantic-ai side (e.g. `Agent(..., instrument=True)`). Everything not on this list is covered by the manual API (`@localtrace.trace`, `localtrace.span`).

## 11. Where to use it — and where not to

**Great fit:**

- Local development and debugging of agent pipelines — see exactly which agent made which call, with what prompt, at what cost.
- Single-service Python applications (CLI tools, batch jobs, notebooks, a FastAPI/Flask service running as one process).
- Offline cost/latency/token analytics over weeks of runs — DuckDB over the files, no infra.
- Air-gapped or compliance-sensitive environments where trace data must never leave the machine.
- As the capture layer under a custom internal dashboard (build it on `localtrace.query`).

**Not designed for:**

- **Distributed tracing across services.** There is no OTLP exporter and no cross-process context propagation; a trace lives inside one process. (The logs are OpenInference/OTel-portable, so you can graduate to Phoenix/Langfuse later without changing app code.)
- **Multi-tenant hosted observability** — no server, no auth, no remote storage, by design.
- **Evaluation/scoring, alerting, or a web UI** — explicitly out of scope; the package ends at the query layer.

## 12. Limitations

Honest constraints to plan around:

1. **One process = one writer.** The store is thread-safe *within* a process, but concurrent **processes** appending to the same file can interleave writes. For multi-worker servers (gunicorn/uvicorn workers), give each worker its own `log_dir` (e.g. suffix with the PID) and query the directories separately.
2. **New OS threads don't inherit the active span.** Python contextvars flow through `async`/`await` but not into `threading.Thread`/`ThreadPoolExecutor` by default — spans created in a fresh thread start a *new* trace. Either start a span inside the worker function or propagate OTel context manually.
3. **Head sampling only.** `sample_rate` decides at the trace root; there is no tail sampling ("keep only errors"). At `0.2`, four in five traces are simply never written.
4. **Costs are estimates.** Computed at query time from a user-overridable price map; only prompt+completion token counts are priced (no cache-discount or per-image pricing).
5. **Content on disk is plain text.** Redaction/truncation/`capture_content` run before write, but whatever passes them sits unencrypted in the JSONL files — treat `log_dir` with the same care as application logs.
6. **Global tracer provider.** `init()` claims the process-wide OTel provider. If your app already configures OpenTelemetry for other purposes, spans from both setups will interact — integrate deliberately (localtrace replaces the global provider on re-init).
7. **Log growth is yours to manage** unless you set `retention_days` / `max_file_mb`. Rough scale: a few KB per LLM span with content on.
8. **Query layer is read-heavy, not real-time push.** DuckDB re-reads the files per query — perfect for dashboards polling every few seconds, not for sub-second streaming UIs.
9. **Auto-instrumentation depends on the OpenInference ecosystem.** A brand-new framework without an instrumentor needs the manual API (that's what `@trace`/`span()` are for). Instrumentor coverage/quality is upstream's.
10. **File naming is UTC** — a "day" boundary is midnight UTC, not local midnight.

## 13. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `localtrace list` shows nothing | App exited before flush? Normal exits are covered by `atexit`; hard kills (`SIGKILL`) lose the last batch — call `localtrace.flush()` after critical calls. Also check `sample_rate` and that you're pointing at the right `--log-dir`. |
| LLM calls not traced | `init()` ran *after* the client library was patched-around, or the instrumentor extra isn't installed. Call `init()` first thing; check `pip list | grep openinference`. |
| Spans appear but not nested | Work crossed a thread boundary (see limitation 2), or there's no root span — wrap the request in `with localtrace.span(...)`. |
| Cost shows `-`/`None` | Model name not in the pricing map — add it via `pricing.json` in the log dir. |
| Two traces for one request | `set_session` groups but doesn't *nest*; nesting requires a shared root span (Step 2). |
| Re-running `init()` in a notebook | Supported: it shuts the previous pipeline down and starts fresh. |

## 14. Examples & tests

All examples run **offline** — the OpenAI ones use the real SDK pointed at an `httpx.MockTransport` (needs `.[examples]`):

```bash
python examples/01_openai_stubbed.py   # raw OpenAI SDK call, auto-instrumented, zero call-site changes
python examples/02_custom_agent.py     # @trace(kind="AGENT") + manual RETRIEVER span
python examples/03_multi_source.py     # ONE trace mixing all three capture paths + session grouping
python examples/04_query.py            # read everything back through the DuckDB layer
```

Development:

```bash
pip install -e ".[all,examples,dev]"
pytest        # 32 tests: exporter mapping (redaction/truncation/sampling), store rotation/retention, query layer, atexit flush
```

Repo layout: `pyproject.toml` · `localtrace/` (`__init__.py`, `exporter.py`, `store.py`, `query.py`, `config.py`, `pricing.py`, `cli.py`) · `examples/` · `tests/`.
