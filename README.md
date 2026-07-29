# AI Delivery Lifecycle Platform - Monorepo Layout

A clean monorepo designed to coordinate the development of the AI Delivery Lifecycle Platform. It separates client-side interfaces and backend logic.

## Monorepo Layout

*   `/frontend`: Modern React 19 + Vite SPA. Handles all stages, routing, UI modules, and dynamic state context.
*   `/backend/services`: Python FastAPI services for all delivery modules (demand intake, estimate shaping, scheduling Gantt, config drift scanner, testing quality gates, release governance, and ops readiness checklists).
*   `/frontend/packages`: Client contracts and shared design system widgets.

---

## Local Development Setup

### 1. Backend Service & API Gateway

Navigate to the `backend/` directory, create a virtual environment, activate it, install requirements, and run the service gateway:

```bash
cd backend
python -m venv venv

# Activate on Windows:
.\venv\Scripts\activate

# Activate on macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn gateway:app --reload --port 8000
```

The unified API gateway runs at `http://127.0.0.1:8000`.

### 2. Frontend Development

Navigate to the `frontend/` directory, install package dependencies, and start the local Vite development server:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. The Vite dev server will proxy API calls (`/api/*`) to the backend gateway.

### 3. Run Automated Tests

To run the backend test suite, execute pytest inside the `backend/` directory:

```bash
cd backend
pytest services/demand-intake/test_endpoints.py
```