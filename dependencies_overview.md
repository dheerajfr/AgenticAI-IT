# Dependencies Module Overview & Capability Flow

This document outlines the requirements and current implementation of the **Dependencies** module (Stage 04) based on the Capability Catalogue and active codebase.

## 1. Capability Catalogue Requirements (Stage 04)
The excel/CSV capability sheet defines three core capabilities under dependencies:
* **Sense dependencies**: Automatically discover and map technical, resource, data, or vendor dependencies from task metadata, linkages, or communications instead of relying on manual entry.
* **Chase commitments**: Monitor cross-team delivery agreements, automatically nudge owners before deadlines, and escalate threats that block the critical path.
* **Cross-programme impact**: Track and simulate how a delay in one task ripples through downstream milestones and affects shared portfolio assets.

## 2. Dynamic Workflow Flow (Step-by-Step)
1. **Sensing Phase (Discovery)**:
   * System scans the plan's task list (names, owners, dates, predecessors).
   * Passes this metadata to the LLM.
   * LLM detects logical/technical dependencies and classifies their types (technical, resource, data, external-vendor) rather than guessing by list index position.
2. **Chasing Phase (Monitoring & Alerts)**:
   * Keeps track of open dependency edges.
   * Allows automated or manual triggers to follow up.
   * LLM generates a nudge message with a selected tone (friendly, formal, urgent) and checks if escalation is warranted.
3. **Impact Phase (Ripple Projection)**:
   * If a task is delayed by *X* days, the system executes a programmatic graph relaxation algorithm.
   * Propagates the delay through all predecessor-successor linkages.
   * Calculates the exact shifted milestones and final project slippage.

## 3. Active Implementation Details
* **Sensing Endpoint** (`/api/dependencies/sense`): Uses the LangGraph `sense_node` to query the Gemini LLM for structured JSON dependency edges.
* **Chasing Endpoint** (`/api/dependencies/{id}/chase`): Invokes the LangGraph `chase_node` to evaluate risks and generate custom reminders.
* **Impact Endpoint** (`/api/dependencies/impact`): Performs a programmatic date-propagation traversal to calculate end-date slip.

## 4. Enhanced Guard Rails
* **Circular Link Protections**: Prevents task self-dependency loops to protect the propagation algorithm from freezing.
* **Dynamic Milestone Labels**: Computes release names dynamically by querying the database (`plan.db` and `demands`) via `derive_release_label` instead of static mapping.
* **Real Predecessor Mapping**: Discards indexing-based guesses and maps tasks to actual predecessor IDs.
