import { request, requestSafe, API_BASE } from './api';

const BASE = `${API_BASE}/deployments`;

export const buildDeployService = {
  getRunbooks: () => requestSafe(`${BASE}/runbooks`),
  
  getCutoverSessions: () => requestSafe(`${BASE}/cutover`),
  
  getOrchestrations: () => requestSafe(`${BASE}/orchestration`),

  createRunbookDraft: (payload) => request(`${BASE}/runbooks/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  submitRunbookReview: (runbookId) => request(`${BASE}/runbooks/${runbookId}/submit-review`, {
    method: 'POST'
  }),

  approveRunbook: (runbookId) => request(`${BASE}/runbooks/${runbookId}/approve`, {
    method: 'POST'
  }),

  updateRunbook: (runbookId, payload) => request(`${BASE}/runbooks/${runbookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  startCutover: (payload) => request(`${BASE}/cutover/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  advanceCutoverStep: (cutoverId, stepId, payload) => request(
    `${BASE}/cutover/${cutoverId}/step/${encodeURIComponent(stepId)}/advance`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  ),

  updateCutover: (cutoverId, payload) => request(`${BASE}/cutover/${cutoverId}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  endCutover: (cutoverId, payload) => request(`${BASE}/cutover/${cutoverId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  startOrchestration: (payload) => request(`${BASE}/orchestration/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  checkPreconditions: (deploymentId) => request(`${BASE}/orchestration/${deploymentId}/check-preconditions`, {
    method: 'POST'
  }),

  submitGoNoGo: (deploymentId, payload) => request(`${BASE}/orchestration/${deploymentId}/go-no-go`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  completeOrchestration: (deploymentId) => request(`${BASE}/orchestration/${deploymentId}/complete`, {
    method: 'POST'
  }),

  deleteRecord: (apiPath, id) => request(`${BASE}/${apiPath}/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
};
