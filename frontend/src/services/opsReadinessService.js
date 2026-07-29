import { request, requestSafe, API_BASE } from './api';

const BASE = `${API_BASE}/ops-readiness`;

export const opsReadinessService = {
  getRecord: (demandId) => requestSafe(`${BASE}/records/${demandId}`),
  
  submitMonitoring: (payload) => request(`${BASE}/monitoring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  submitSreReview: (demandId, payload) => request(`${BASE}/monitoring/${demandId}/sre-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  submitHandover: (payload) => request(`${BASE}/handover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  submitOpsReview: (demandId, payload) => request(`${BASE}/handover/${demandId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  submitValidation: (payload) => request(`${BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  submitDirectorSignoff: (demandId, payload) => request(`${BASE}/validate/${demandId}/sign-off`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
};
