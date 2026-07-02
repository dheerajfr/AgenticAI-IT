# AI Delivery Lifecycle Platform - Monorepo Scaffold

A clean monorepo scaffold designed to coordinate the development of a 5-stage AI Delivery Lifecycle Platform. It enables parallel development across modules via shared UI kit components and data contracts.

## Monorepo Layout

*   `/apps/shell`: Shared UI Shell. Renders the stage pipeline navigation rail and swaps active viewports.
*   `/services/demand-intake`: Stage 01 service (FastAPI + LangGraph orchestration).
*   `/packages/ui-kit`: Shared styling tokens (`tokens.css`) and native Web Components (`stage-rail.js`, `status-pill.js`, `module-placeholder.js`).
*   `/packages/contracts`: JSON Schema specification for the `DemandRecord` data contract.

---

## Local Development Setup

### 1. Backend Service (FastAPI + LangGraph)

Navigate to the project root and install dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
cd services/demand-intake
uvicorn main:app --reload --port 8000
```

The REST API will be running at `http://127.0.0.1:8000`. You can explore the interactive API docs at `http://127.0.0.1:8000/docs`.

### 2. Frontend App Shell

Since the frontend is built entirely using vanilla HTML/JS and native Web Components, no build steps or bundlers are required. 

To avoid CORS restrictions when loading ES Modules locally, start a lightweight web server from the project root:

Using python:
```bash
python -m http.server 8080
```

Now open your browser and navigate to:
```
http://localhost:8080/apps/shell/
```

### 3. Run Automated Tests

To run the backend test suite, run the following command from the project root:

```bash
pytest services/demand-intake/test_endpoints.py
```
h