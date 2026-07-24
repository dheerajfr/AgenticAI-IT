# Contributing Guidelines & Architecture Standards

Welcome to the AI Delivery Lifecycle Platform monorepo! This scaffold is designed to help 5 engineers develop stages of the platform concurrently.

---

## 1. Folder Structure

When adding your stage, follow these guidelines:

*   **Contracts**: Add your stage's schema in `/packages/contracts/`. This defines the language-agnostic interface downstream modules will consume.
*   **Backend Service**: Create a new folder under `/services/<your-service-name>`. Build your backend using FastAPI and validate input/output using Pydantic classes generated from your JSON contracts. Use `database.py` with an in-memory interface initially.
*   **Frontend Screen**: Integrate your UI directly into `/apps/shell/shell.js`. Register your screen route under the appropriate index in `<stage-rail>`, replacing the placeholder element with your screen's layout.
*   **UI Kit**: Put reusable components (e.g. specialized visualization charts, card styles) inside `/packages/ui-kit` as vanilla Custom Elements.

---

## 2. Shared Data Contract Versioning Rule

Data contracts ensure system compatibility as we build in parallel:

1.  **Baseline**: All contracts start at version `v1` (e.g. `demand-record.schema.json`).
2.  **Non-Breaking Changes**: Adding an optional field is safe and does not require a version bump.
3.  **Breaking Changes**: Removing an existing field, renaming a field, or modifying a field type is considered a breaking change.
    *   You must bump the schema to `v2` (e.g. `<name>.schema.v2.json`).
    *   Notify downstream module owners in advance to allow time to update their intake models.
4.  **Fixtures**: Always publish 3–5 sample JSON records matching your contract in `/services/<your-service>/fixtures/` so downstream developers can mock inputs before your backend goes live.

---

## 3. Native Web Component UI Pattern

To avoid bundlers or compile steps, we write UI views and components using **Vanilla Web Components**:

*   **Definition**: Components are written as custom ES classes extending `HTMLElement`.
*   **Shadow DOM**: Always use `this.attachShadow({ mode: 'open' })` to encapsulate styles and prevent pollution across different module views.
*   **Design Tokens**: Import `/packages/ui-kit/tokens.css` inside your HTML header. Since CSS custom properties traverse the Shadow DOM boundary, you can safely use variables like `var(--color-brand)` inside your component's `<style>` block.
*   **Events**: Communication from components to the app shell should use `CustomEvent` with `bubbles: true` and `composed: true` (which permits bubble traversal through the shadow boundary).

Example skeleton:
```javascript
class CustomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        .card { border: 1px solid var(--border-color); padding: var(--spacing-md); }
      </style>
      <div class="card"><slot></slot></div>
    `;
  }
}
customElements.define('custom-card', CustomCard);
```

---

## 4. LangGraph Orchestration Pattern

Any capability involving multi-step reasoning, extraction, routing, or drafting must use **LangGraph**:

1.  **State Definition**: Declare a `TypedDict` subclass representing the shared memory state of the graph.
    ```python
    from typing import TypedDict, Optional
    class StageState(TypedDict):
        input_text: str
        processed_data: Optional[dict]
        error: Optional[str]
    ```
2.  **Node Execution**: Graph operations must be isolated into distinct nodes (e.g. `parse` -> `suggest` -> `route`). Each node prints a log output on execution (useful for trace tracking).
3.  **State Convergency**: Try to route multiple inputs (like text forms and document uploads) into a single converged flow early, using conditional entry points:
    ```python
    workflow.set_conditional_entry_point(
        route_mode,
        {
            "parse_doc": "parse_node",
            "extract": "extract_node"
        }
    )
    ```
4.  **Human-in-the-loop**: Never auto-promote transitions. Every stage is configured with separate *evaluation* and *approval* endpoints in FastAPI. The frontend calls the evaluation node first to display suggested outputs, and waits for a user action (click "Approve") before posting to the approval endpoint to commit the state to memory.
.....