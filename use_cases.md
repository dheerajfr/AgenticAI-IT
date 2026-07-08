# Dependencies Service — Business Use Case Blueprint

This document details the 3 primary business use cases developed under the **Dependencies** module (Stage 04) of the AI Delivery Lifecycle Platform.

---

## Use Case 1: Sense Dependencies

### Description
Automatically discovers dependencies and risk links within a project plan by analyzing and linking task metadata, corporate work-item links, component architecture schemas, and teams communications.

*   **Tech Required:** Workflow automation, Large Language Models (LLM), Natural Language Processing (NLP) Entity Extraction, Semantic Retrieval.
*   **Data Required:** 
    *   Project task metadata lists.
    *   Corporate Work-Item Links (e.g., Azure DevOps / ADO).
    *   Component Architecture & Infrastructure Schema definitions.
    *   Retrieved Teams chat logs and communications transcripts between task owners.
*   **Business Value:** Faster, cleaner intake and less back-and-forth.
*   **Value Lever:** **Speed**
*   **Interaction Mode:** Human-in-the-loop (Human Approves)
*   **Human Checkpoint:** Human checkpoint confirms scope before the sensed dependency edges enter the active portfolio.
*   **Coordination:** Coordinates with **Classify & Route** and **Capacity Check** modules.

---

## Use Case 2: Chase Commitments

### Description
Tracks cross-team commitments and nudges owners, assessing risks to critical path milestones and proposing personalized notifications.

*   **Tech Required:** Workflow automation, Large Language Models (LLM), Risk Alerting heuristics.
*   **Data Required:** 
    *   Dependency logs (active dependency database).
    *   Owner directory (accountable personnel details).
    *   Status feeds (milestone/task state updates).
*   **Business Value:** Triage in minutes; duplicates and delays caught early.
*   **Value Lever:** **Speed**
*   **Interaction Mode:** Human-in-the-loop (Human Approves)
*   **Human Checkpoint:** Human checkpoint owns final routing approval and nudge delivery priority.
*   **Coordination:** Coordinates with **Capture & Structure** and **Capacity Check** modules.

---

## Use Case 3: Cross-Programme Impact

### Description
Computes the ripple delay impacts and timeline relaxation effects across other programmes sharing the same assets, forecasting critical path slippages.

*   **Tech Required:** Knowledge Graph Analytics, Critical Path Method (CPM) relaxation constraints.
*   **Data Required:** 
    *   Portfolio dependency graph.
    *   Shared asset registry.
    *   Change calendar (production/staging deployment schedule).
*   **Business Value:** Asset schedule collisions and release overlaps avoided.
*   **Value Lever:** **Risk & Control**
*   **Interaction Mode:** Human-in-the-loop (Human Monitors)
*   **Human Checkpoint:** Human checkpoint reviews computed timeline impact, determines sequencing corrections, and approves re-baseline schedules.
*   **Coordination:** Coordinates with **Sense Dependencies** and **Collision Detection** modules.
