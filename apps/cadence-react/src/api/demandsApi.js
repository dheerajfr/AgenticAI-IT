import { apiFetch, fetchSafe } from './apiClient';

export const getDemands = () => fetchSafe('/api/demands');

export const createDemand = (payload) =>
  apiFetch('/api/demands', { method: 'POST', body: JSON.stringify(payload) });

export const createDemandFromFile = (formData) =>
  apiFetch('/api/demands/from-file', {
    method: 'POST',
    headers: {}, // Let browser set Content-Type for multipart
    body: formData,
  });

export const deleteDemand = (demandId) =>
  apiFetch(`/api/demands/${demandId}`, { method: 'DELETE' });

export const updateDemand = (demandId, payload) =>
  apiFetch(`/api/demands/${demandId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const classifyDemand = (demandId) =>
  apiFetch(`/api/demands/${demandId}/classify`, { method: 'POST' });

export const checkCapacity = (demandId) =>
  apiFetch(`/api/demands/${demandId}/capacity`, { method: 'POST' });

export const generateBusinessCase = (demandId) =>
  apiFetch(`/api/demands/${demandId}/business-case`, { method: 'POST' });

export const approveDemand = (demandId) =>
  apiFetch(`/api/demands/${demandId}/approve`, { method: 'POST' });

export const rejectDemand = (demandId) =>
  apiFetch(`/api/demands/${demandId}/reject`, { method: 'POST' });
