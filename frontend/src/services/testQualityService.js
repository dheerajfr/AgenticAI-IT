import { request, requestSafe, API_BASE } from './api';

const BASE = `${API_BASE}/test-quality`;

export const testQualityService = {
  getConsolidated: (demandId) => requestSafe(`${BASE}/consolidated/${demandId}`),
  
  getQualityGate: (demandId) => requestSafe(`${BASE}/relational/quality_gate/${demandId}`),
  
  getDashboardStats: (demandId) => requestSafe(`${BASE}/dashboard-stats/${demandId}`),
  
  getDeliveryContext: (id) => requestSafe(`${BASE}/delivery-context/${id}`),

  generateTests: (payload) => request(`${BASE}/test-generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  createTestCase: (demandId, mockId, payload) => request(`${BASE}/relational/test_cases/${demandId}/${mockId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateTestCase: (demandId, id, payload) => request(`${BASE}/relational/test_cases/${demandId}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  deleteTestCase: (id) => request(`${BASE}/relational/test_cases/${id}`, {
    method: 'DELETE'
  }),

  saveTestData: (demandId, datasetId, payload) => request(`${BASE}/relational/test_data/${demandId}/${datasetId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  deleteTestData: (id) => request(`${BASE}/relational/test_data/${id}`, {
    method: 'DELETE'
  }),

  executeTests: (payload) => request(`${BASE}/test-execution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  defectTriage: (payload) => request(`${BASE}/defect-triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateTestExecution: (demandId, testRunId, payload) => request(`${BASE}/relational/test_execution/${demandId}/${testRunId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  getDefects: (demandId) => requestSafe(`${BASE}/relational/defects/${demandId}`),

  createDefect: (demandId, mockId, payload) => request(`${BASE}/relational/defects/${demandId}/${mockId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  closeDefect: (demandId, idToClose, payload) => request(`${BASE}/relational/defects/${demandId}/${idToClose}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  dedupDefect: (demandId, survivorId, payload) => request(`${BASE}/relational/defects/${demandId}/${survivorId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  deleteDefect: (demandId, id) => request(`${BASE}/relational/defects/${demandId}/${id}`, {
    method: 'DELETE'
  }),

  updateDefect: (demandId, id, payload) => request(`${BASE}/relational/defects/${demandId}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  getSecurityFindings: (demandId) => requestSafe(`${BASE}/relational/security_findings/${demandId}`),

  runSecurityTesting: (payload) => request(`${BASE}/security-testing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateSecurityFinding: (demandId, id, payload) => request(`${BASE}/relational/security_findings/${demandId}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  deleteSecurityFinding: (demandId, id) => request(`${BASE}/relational/security_findings/${demandId}/${id}`, {
    method: 'DELETE'
  }),

  getTraceability: (demandId) => requestSafe(`${BASE}/relational/traceability/${demandId}`),

  runTraceability: (payload) => request(`${BASE}/traceability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  runQualityGate: (payload) => request(`${BASE}/quality-gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateQualityGate: (demandId, gateId, payload) => request(`${BASE}/relational/quality_gate/${demandId}/${gateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  deleteQualityGate: (demandId, gateId) => request(`${BASE}/relational/quality_gate/${demandId}/${gateId}`, {
    method: 'DELETE'
  })
};
