import { request, requestSafe, API_BASE } from './api';

export const estimateService = {
  getEstimates: () => requestSafe(`${API_BASE}/estimates`),
  
  deleteEstimate: (id) => request(`${API_BASE}/estimates/${id}`, { method: 'DELETE' }),
  
  generateEstimate: (demand, rebaselineReason = null) => {
    const body = { demand };
    if (rebaselineReason) {
      body.rebaseline_reason = rebaselineReason;
    }
    return request(`${API_BASE}/estimates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  approveEstimate: (demandId, payload) => request(`${API_BASE}/estimates/approve?demand_id=${demandId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  triggerCheck: (id) => request(`${API_BASE}/estimates/${id}/trigger-check`, { method: 'POST' }),

  rebaseline: (id, reason) => request(`${API_BASE}/estimates/${id}/rebaseline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  }),

  finalize: (id, reason) => request(`${API_BASE}/estimates/${id}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  })
};
