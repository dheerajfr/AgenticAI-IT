import { request, requestSafe, API_BASE } from './api';

const BASE = `${API_BASE}/release-change`;

export const releaseService = {
  getDropdowns: () => requestSafe(`${BASE}/dropdowns`),
  
  getReleases: () => requestSafe(`${BASE}/releases`),
  
  getReleaseDetails: (id) => requestSafe(`${BASE}/releases/${id}`),

  deleteRelease: (id) => request(`${BASE}/releases/${id}`, {
    method: 'DELETE'
  }),

  createRelease: (payload) => request(`${BASE}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  draftChangeRequest: (id) => request(`${BASE}/releases/${id}/draft`, {
    method: 'POST'
  }),

  submitChangeRequest: (id, payload) => request(`${BASE}/releases/${id}/change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  submitToCab: (id) => request(`${BASE}/releases/${id}/submit`, {
    method: 'POST'
  }),

  evaluateRisk: (id) => request(`${BASE}/releases/${id}/evaluate-risk`, {
    method: 'POST'
  }),

  submitCabReview: (id, payload) => request(`${BASE}/releases/${id}/cab-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  checkCollision: (id) => request(`${BASE}/releases/${id}/collision`, {
    method: 'POST'
  }),

  auditRelease: (id) => request(`${BASE}/releases/${id}/audit`, {
    method: 'POST'
  })
};
