import { apiFetch, fetchSafe } from './apiClient';

export const getPlans = () => fetchSafe('/api/plans');

export const createPlan = (payload) =>
  apiFetch('/api/plans', { method: 'POST', body: JSON.stringify(payload) });

export const updatePlan = (planId, payload) =>
  apiFetch(`/api/plans/${planId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deletePlan = (planId) =>
  apiFetch(`/api/plans/${planId}`, { method: 'DELETE' });

export const generatePlan = (payload) =>
  apiFetch('/api/plans/generate', { method: 'POST', body: JSON.stringify(payload) });

export const rebaselinePlan = (planId, payload) =>
  apiFetch(`/api/plans/${planId}/rebaseline`, { method: 'POST', body: JSON.stringify(payload) });

export const approvePlan = (planId) =>
  apiFetch(`/api/plans/${planId}/approve`, { method: 'POST' });
