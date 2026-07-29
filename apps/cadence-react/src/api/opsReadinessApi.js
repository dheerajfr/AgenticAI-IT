import { apiFetch, fetchSafe } from './apiClient';

export const getOpsReadiness = (demandId) =>
  fetchSafe(`/api/ops-readiness/records/${demandId}`);

export const saveOpsReadiness = (demandId, payload) =>
  apiFetch(`/api/ops-readiness/records/${demandId}`, { method: 'POST', body: JSON.stringify(payload) });

export const updateOpsReadiness = (demandId, payload) =>
  apiFetch(`/api/ops-readiness/records/${demandId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const generateOpsReadiness = (demandId) =>
  apiFetch(`/api/ops-readiness/records/${demandId}/generate`, { method: 'POST' });
