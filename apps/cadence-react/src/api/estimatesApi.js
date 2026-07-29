import { apiFetch, fetchSafe } from './apiClient';

export const getEstimates = () => fetchSafe('/api/estimates');

export const createEstimate = (payload) =>
  apiFetch('/api/estimates', { method: 'POST', body: JSON.stringify(payload) });

export const updateEstimate = (estimateId, payload) =>
  apiFetch(`/api/estimates/${estimateId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteEstimate = (estimateId) =>
  apiFetch(`/api/estimates/${estimateId}`, { method: 'DELETE' });

export const generateEstimate = (demandId, payload) =>
  apiFetch(`/api/estimates/generate`, { method: 'POST', body: JSON.stringify({ demand_id: demandId, ...payload }) });

export const rebaselineEstimate = (estimateId, payload) =>
  apiFetch(`/api/estimates/${estimateId}/rebaseline`, { method: 'POST', body: JSON.stringify(payload) });

export const challengeEstimate = (estimateId, payload) =>
  apiFetch(`/api/estimates/${estimateId}/challenge`, { method: 'POST', body: JSON.stringify(payload) });

export const approveEstimate = (estimateId) =>
  apiFetch(`/api/estimates/${estimateId}/approve`, { method: 'POST' });
