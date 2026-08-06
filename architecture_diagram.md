# Project Architecture: AgenticAI-IT

This document outlines the high-level architecture of the **Agentic AI in IT Delivery (AgenticAI-IT)** application.

## 1. Architecture Diagram (Mermaid)

```mermaid
graph TD
    %% Frontend Layer
    subgraph Browser ["Frontend (Browser)"]
        UI["Vanilla HTML5 & CSS UI"]
        JS["Client-Side JavaScript (shell.js, dashboard.js, etc.)"]
        UI <--> JS
    end

    %% API Gateway & Backend Services
    subgraph Backend ["Python Backend Server"]
        GW["FastAPI Gateway (gateway.py / main.py per service)"]
        
        subgraph Orchestration ["Agentic Orchestration"]
            LG["LangGraph Workflows (workflow.py, estimate_graph.py, etc.)"]
            LLM_C["LLM Client (llm_client.py)"]
        end
    end

    %% Data & External Services
    subgraph Storage ["Storage & External APIs"]
        DB[("SQLite Databases (source.db, plan.db, etc.)")]
        AzureOpenAI["Azure OpenAI Service (grok-4-1-fast-reasoning)"]
    end

    %% Data Flows
    JS <-->|HTTP Requests / JSON| GW
    GW <-->|Invoke / Parse| LG
    LG <-->|Call Gemini| LLM_C
    LLM_C <-->|Secure API Calls (API Key or Entra ID)| AzureOpenAI
    GW <-->|Read / Write SQL| DB
    LG <-->|Read / Write SQL| DB
```

---

## 2. Frameworks: Are we using LangChain?
* **No, we are not directly importing or using LangChain.**
* The project uses **LangGraph** (specifically `langgraph.graph.StateGraph`) to coordinate state-based workflows, and calls the Azure OpenAI API directly using the official `openai` Python SDK.

---

## 3. Simplified Explanation: What does FastAPI do?

Think of **FastAPI** as the **receptionist/translator** of our application:

1. **The Browser (Frontend)** is like a customer who only speaks "HTML/JS" and wants to perform an action (e.g., *“Generate an estimate for this demand”*).
2. **The LLM Workflows (Backend)** are like specialists who only speak "Python code" and don't know anything about web browsers.
3. **FastAPI** stands in the middle:
   * It exposes clean "counters" (called **endpoints/APIs**, like `/api/estimates/generate`).
   * When the browser clicks a button, it sends a request package to this counter.
   * **FastAPI checks the package** (data validation) to make sure no information is missing or corrupted.
   * If the package is correct, it translates the request and **orders the Python specialists to do their work** (like running the LangGraph AI workflow).
   * Once the specialists finish, FastAPI takes the output, packages it back into a simple web format (JSON), and **hands it back to the browser** to display on your screen.
