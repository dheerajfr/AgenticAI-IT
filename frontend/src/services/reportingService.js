import { request, requestSafe, API_BASE } from './api';

export const reportingService = {
  getReportingProject: (demandId) => requestSafe(`${API_BASE}/reporting-communication/project/${demandId}`),
  
  generateSummary: (payload) => request(`${API_BASE}/reporting-communication/generate-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  draftComm: (payload) => request(`${API_BASE}/reporting-communication/draft-comm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
};
