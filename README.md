# AI Delivery Lifecycle Platform

An end-to-end AI-powered Delivery Lifecycle Platform featuring multi-stage intelligence, dynamic agentic workflows (FastAPI + LangGraph), shared UI components, and API gateway routing.

---

## 🏗️ Monorepo Architecture Overview

This monorepo coordinates 10 lifecycle stages across apps, services, and shared packages:

* **`gateway.py`**: Central FastAPI API Gateway aggregating services and serving static UI shell assets on port `8000`.
* **`/apps/shell`**: Shared UI Shell rendering the stage pipeline navigation rail and dynamic module viewports.
* **`/services`**: Microservice modules implementing specific delivery lifecycle stages:
  * `01-demand-intake`: Demand intake & scoping workflows (LangGraph + FastAPI).
  * `02-estimation-costing`: Cost estimation & resource planning.
  * `03-capacity-resource`: Capacity checking and resource allocation.
  * `04-dependencies`: Dependency sensing, commitment chasing, and cross-programme impact analysis.
  * `05-risk-governance`: Risk detection and compliance governance.
  * `06-architecture-design`: Solution design and architectural governance.
  * `07-build-pipeline`: Build automation and tracking.
  * `08-qa-testing`: Quality assurance & testing orchestration.
  * `09-deployment-release`: Deployment pipelines & release coordination.
  * `10-operations-value`: Operations, monitoring, and value realization.
* **`/packages`**:
  * `/packages/ui-kit`: Shared styling tokens (`tokens.css`) and web components (`stage-rail.js`, `status-pill.js`).
  * `/packages/contracts`: JSON Schema specifications and data contracts for inter-module interoperability.

---

## 🚀 Step-by-Step Guide to Run the Project

### Prerequisites

* **Python 3.10+** installed on your system.
* **Environment Configuration (`.env`)**: Environment variables required by the application (such as LangSmith tracing, Azure OpenAI keys, and model names). Refer to [`.env.example`](.env.example) in the root directory for the template.

---

### Step 1: Environment Setup

1. **Clone the repository** and navigate into the cloned directory:
   ```bash
   git clone <repository-url>
   cd AgenticAI-IT
   ```

2. **Create and activate a virtual environment**:
   * **Windows (PowerShell)**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   * **Linux / macOS**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in any required API keys or environment variables:
   ```bash
   cp .env.example .env
   ```

---

### Step 2: Start the Project (Backend APIs + Frontend UI)

Run the single `uvicorn` command below to launch the entire application. The Gateway automatically handles all backend microservice APIs and serves the frontend UI shell on port `8000`:

```bash
uvicorn gateway:app --reload --port 8000
```

Once started:
* 🌐 **Frontend App Shell**: Open `http://127.0.0.1:8000/` in your browser (redirects automatically to `/apps/shell/index.html`).
* ⚙️ **Backend APIs**: Accessible at `http://127.0.0.1:8000/api/...`
* 📚 **Interactive Swagger API Docs**: `http://127.0.0.1:8000/docs`

