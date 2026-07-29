import { request, requestSafe, API_BASE } from './api';

export const riskService = {
  getRisks: (demandId) => requestSafe(`${API_BASE}/risk-issues/project/${demandId}`),
  
  aggregateRisks: (demandId) => request(`${API_BASE}/risk-issues/project/${demandId}/aggregate`, {
    method: 'POST'
  }),

  convertRiskToIssue: (payload) => request(`${API_BASE}/risk-issues/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  mitigateRisk: (payload) => request(`${API_BASE}/risk-issues/mitigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
};
