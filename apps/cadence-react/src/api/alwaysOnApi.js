import { apiFetch, fetchSafe } from './apiClient';

// Risk & Issues
export const getRiskIssues = (demandId) =>
  fetchSafe(`/api/risk-issues/project/${demandId}`);

export const createRiskIssue = (demandId, payload) =>
  apiFetch(`/api/risk-issues/project/${demandId}`, { method: 'POST', body: JSON.stringify(payload) });

export const updateRiskIssue = (demandId, itemId, payload) =>
  apiFetch(`/api/risk-issues/project/${demandId}/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteRiskIssue = (demandId, itemId) =>
  apiFetch(`/api/risk-issues/project/${demandId}/${itemId}`, { method: 'DELETE' });

// Budget & Cost
export const getBudgetCost = (demandId) =>
  fetchSafe(`/api/budget-cost/project/${demandId}`);

export const saveBudgetCost = (demandId, payload) =>
  apiFetch(`/api/budget-cost/project/${demandId}`, { method: 'POST', body: JSON.stringify(payload) });

export const updateBudgetCost = (demandId, payload) =>
  apiFetch(`/api/budget-cost/project/${demandId}`, { method: 'PUT', body: JSON.stringify(payload) });

// Vendor Coordination
export const getVendorCoordination = (demandId) =>
  fetchSafe(`/api/vendor-coordination/project/${demandId}`);

export const saveVendorCoordination = (demandId, payload) =>
  apiFetch(`/api/vendor-coordination/project/${demandId}`, { method: 'POST', body: JSON.stringify(payload) });

export const updateVendorCoordination = (demandId, itemId, payload) =>
  apiFetch(`/api/vendor-coordination/project/${demandId}/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteVendorItem = (demandId, itemId) =>
  apiFetch(`/api/vendor-coordination/project/${demandId}/${itemId}`, { method: 'DELETE' });

// Reporting & Communication
export const getReportingCommunication = (demandId) =>
  fetchSafe(`/api/reporting-communication/project/${demandId}`);

export const saveReportingCommunication = (demandId, payload) =>
  apiFetch(`/api/reporting-communication/project/${demandId}`, { method: 'POST', body: JSON.stringify(payload) });

export const updateReportingItem = (demandId, itemId, payload) =>
  apiFetch(`/api/reporting-communication/project/${demandId}/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteReportingItem = (demandId, itemId) =>
  apiFetch(`/api/reporting-communication/project/${demandId}/${itemId}`, { method: 'DELETE' });

// Knowledge & Artifacts
export const getKnowledgeArtifacts = (demandId) =>
  fetchSafe(`/api/knowledge-artifacts/project/${demandId}`);

export const saveKnowledgeArtifact = (demandId, payload) =>
  apiFetch(`/api/knowledge-artifacts/project/${demandId}`, { method: 'POST', body: JSON.stringify(payload) });

export const updateKnowledgeArtifact = (demandId, itemId, payload) =>
  apiFetch(`/api/knowledge-artifacts/project/${demandId}/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteKnowledgeArtifact = (demandId, itemId) =>
  apiFetch(`/api/knowledge-artifacts/project/${demandId}/${itemId}`, { method: 'DELETE' });
