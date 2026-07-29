import { request, requestSafe, API_BASE } from './api';

export const configService = {
  getEnvironments: () => requestSafe(`${API_BASE}/environments`),
  
  getDemandIds: () => requestSafe(`${API_BASE}/environments/demand-ids`),
  
  deleteEnvironment: (id) => request(`${API_BASE}/environments/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }),

  seedEnvironments: (payload) => request(`${API_BASE}/environments/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  saveField: (demandId, environment, payload) => request(
    `${API_BASE}/environments/${encodeURIComponent(demandId)}/${encodeURIComponent(environment)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  ),

  reconcileDrift: (payload) => request(`${API_BASE}/environments/reconcile-drift`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  checkHygiene: (payload) => request(`${API_BASE}/environments/records-hygiene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  applyHygieneFix: (payload) => request(`${API_BASE}/environments/apply-hygiene-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  verifyReadiness: (payload) => request(`${API_BASE}/environments/verify-readiness`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
};
