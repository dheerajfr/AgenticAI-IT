import { request, requestSafe, API_BASE } from './api';

export const demandService = {
  getDemands: () => requestSafe(`${API_BASE}/demands`),
  
  deleteDemand: (id) => request(`${API_BASE}/demands/${id}`, { method: 'DELETE' }),
  
  createDemand: (formData) => request(`${API_BASE}/demands/intake`, {
    method: 'POST',
    body: formData
  }),

  classifyRoute: (id) => request(`${API_BASE}/demands/${id}/classify-route`, { method: 'POST' }),

  approveClassify: (id, category, rationale) => request(`${API_BASE}/demands/${id}/approve-classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, rationale })
  }),

  capacityCheck: (id) => request(`${API_BASE}/demands/${id}/capacity-check`, { method: 'POST' }),

  saveCapacity: (id, data) => request(`${API_BASE}/demands/${id}/save-capacity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  approveCapacity: (id, decision, comment) => request(`${API_BASE}/demands/${id}/approve-capacity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, comment })
  }),

  getResources: () => requestSafe(`${API_BASE}/demands/resources?t=${Date.now()}`),

  saveResources: (data) => request(`${API_BASE}/demands/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  deleteResource: (name) => request(`${API_BASE}/demands/resources/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  }),

  generateBusinessCase: (id) => request(`${API_BASE}/demands/${id}/business-case`, { method: 'POST' }),

  saveBusinessCaseDraft: (id, draftText) => request(`${API_BASE}/demands/${id}/save-business-case-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_case_draft: draftText })
  }),

  approveBusinessCase: (id, decision, comment, draftText) => request(`${API_BASE}/demands/${id}/approve-business-case`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, comment, business_case_draft: draftText })
  })
};
