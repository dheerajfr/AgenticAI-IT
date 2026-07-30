import { apiFetch, fetchSafe } from './apiClient';

export const getOrchestrations = () => fetchSafe('/api/deployments/runbooks');
export const getRunbooks = () => fetchSafe('/api/deployments/runbooks');
export const getCutoverSessions = () => fetchSafe('/api/deployments/cutover');

export const createRunbook = (payload) =>
  apiFetch('/api/deployments/orchestration/start', { method: 'POST', body: JSON.stringify(payload) });

export const updateRunbook = (runbookId, payload) =>
  apiFetch(`/api/deployments/runbooks/${runbookId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteRunbook = (runbookId) =>
  apiFetch(`/api/deployments/runbooks/${runbookId}`, { method: 'DELETE' });

export const generateRunbook = (payload) =>
  apiFetch('/api/deployments/runbooks/draft', { method: 'POST', body: JSON.stringify(payload) });

export const submitRunbookForReview = (runbookId) =>
  apiFetch(`/api/deployments/runbooks/${runbookId}/submit-review`, { method: 'POST' });

export const approveRunbook = (runbookId) =>
  apiFetch(`/api/deployments/runbooks/${runbookId}/approve`, { method: 'POST' });

export const getDeployments = () =>
  fetchSafe('/api/deployments/orchestration');

export const startDeployment = (payload) =>
  apiFetch('/api/deployments/orchestration/start', { method: 'POST', body: JSON.stringify(payload) });

export const checkPreconditions = (deploymentId) =>
  apiFetch(`/api/deployments/orchestration/${deploymentId}/check-preconditions`, { method: 'POST' });

export const submitGoNoGo = (deploymentId, payload) =>
  apiFetch(`/api/deployments/orchestration/${deploymentId}/go-no-go`, { method: 'POST', body: JSON.stringify(payload) });

export const completeDeployment = (deploymentId) =>
  apiFetch(`/api/deployments/orchestration/${deploymentId}/complete`, { method: 'POST' });

export const startCutover = (payload) =>
  apiFetch('/api/deployments/cutover/start', { method: 'POST', body: JSON.stringify(payload) });

export const advanceCutoverStep = (cutoverId, stepId, payload) =>
  apiFetch(`/api/deployments/cutover/${cutoverId}/step/${stepId}/advance`, { method: 'POST', body: JSON.stringify(payload) });

export const postCutoverUpdate = (cutoverId, payload) =>
  apiFetch(`/api/deployments/cutover/${cutoverId}/update`, { method: 'POST', body: JSON.stringify(payload) });

export const endCutover = (cutoverId, payload) =>
  apiFetch(`/api/deployments/cutover/${cutoverId}/end`, { method: 'POST', body: JSON.stringify(payload) });
