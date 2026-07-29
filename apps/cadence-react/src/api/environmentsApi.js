import { apiFetch, fetchSafe } from './apiClient';

export const getEnvironments = () => fetchSafe('/api/environments');

export const createEnvironment = (payload) =>
  apiFetch('/api/environments', { method: 'POST', body: JSON.stringify(payload) });

export const updateEnvironment = (envId, payload) =>
  apiFetch(`/api/environments/${envId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteEnvironment = (envId) =>
  apiFetch(`/api/environments/${envId}`, { method: 'DELETE' });

export const generateEnvironments = (payload) =>
  apiFetch('/api/environments/generate', { method: 'POST', body: JSON.stringify(payload) });
