import { apiFetch, fetchSafe } from './apiClient';

export const getDependencies = () => fetchSafe('/api/dependencies');

export const createDependency = (payload) =>
  apiFetch('/api/dependencies', { method: 'POST', body: JSON.stringify(payload) });

export const updateDependency = (depId, payload) =>
  apiFetch(`/api/dependencies/${depId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteDependency = (depId) =>
  apiFetch(`/api/dependencies/${depId}`, { method: 'DELETE' });

export const generateDependencies = (payload) =>
  apiFetch('/api/dependencies/generate', { method: 'POST', body: JSON.stringify(payload) });
