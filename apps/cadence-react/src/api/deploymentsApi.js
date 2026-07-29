import { apiFetch, fetchSafe } from './apiClient';

export const getOrchestrations = () => fetchSafe('/api/deployments/orchestration');
export const getCutoverSessions = () => fetchSafe('/api/deployments/cutover');

export const createRunbook = (payload) =>
  apiFetch('/api/deployments/orchestration', { method: 'POST', body: JSON.stringify(payload) });

export const updateRunbook = (runbookId, payload) =>
  apiFetch(`/api/deployments/orchestration/${runbookId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteRunbook = (runbookId) =>
  apiFetch(`/api/deployments/orchestration/${runbookId}`, { method: 'DELETE' });

export const generateRunbook = (payload) =>
  apiFetch('/api/deployments/orchestration/generate', { method: 'POST', body: JSON.stringify(payload) });

export const createCutover = (payload) =>
  apiFetch('/api/deployments/cutover', { method: 'POST', body: JSON.stringify(payload) });

export const updateCutover = (cutoverId, payload) =>
  apiFetch(`/api/deployments/cutover/${cutoverId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteCutover = (cutoverId) =>
  apiFetch(`/api/deployments/cutover/${cutoverId}`, { method: 'DELETE' });

export const generateCutover = (payload) =>
  apiFetch('/api/deployments/cutover/generate', { method: 'POST', body: JSON.stringify(payload) });

export const updateRunbookStep = (runbookId, stepId, payload) =>
  apiFetch(`/api/deployments/orchestration/${runbookId}/steps/${stepId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
