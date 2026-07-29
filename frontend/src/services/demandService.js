import { request, requestSafe, API_BASE } from './api';

export const demandService = {
  getDemands: () => requestSafe(`${API_BASE}/demands`),
  
  deleteDemand: (id) => request(`${API_BASE}/demands/${id}`, { method: 'DELETE' }),
  
  createDemand: (formData) => request(`${API_BASE}/demands/intake`, {
    method: 'POST',
    body: formData
  }),

  classifyRoute: (id) => request(`${API_BASE}/demands/${id}/classify-route`, { method: 'POST' }),

  approveClassify: (id, type, risk_level, domain, duplicate_of) => request(`${API_BASE}/demands/${id}/approve-classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, risk_level, domain, duplicate_of })
  }),

  capacityCheck: (id) => request(`${API_BASE}/demands/${id}/capacity-check`, { method: 'POST' }),

  saveCapacity: (id, data) => request(`${API_BASE}/demands/${id}/save-capacity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  approveCapacity: (id, verdict, resourceConstraints) => request(`${API_BASE}/demands/${id}/approve-capacity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verdict, resourceConstraints })
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
    body: JSON.stringify({ business_case_summary: draftText })
  })
};
