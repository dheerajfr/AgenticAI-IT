import { apiFetch, fetchSafe } from './apiClient';

export const getReleases = () => fetchSafe('/api/release-change/releases');

export const createRelease = (payload) =>
  apiFetch('/api/release-change/releases', { method: 'POST', body: JSON.stringify(payload) });

export const updateRelease = (releaseId, payload) =>
  apiFetch(`/api/release-change/releases/${releaseId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteRelease = (releaseId) =>
  apiFetch(`/api/release-change/releases/${releaseId}`, { method: 'DELETE' });

export const generateRelease = (payload) =>
  apiFetch('/api/release-change/releases/generate', { method: 'POST', body: JSON.stringify(payload) });

export const getChanges = () => fetchSafe('/api/release-change/changes');

export const createChange = (payload) =>
  apiFetch('/api/release-change/changes', { method: 'POST', body: JSON.stringify(payload) });

export const updateChange = (changeId, payload) =>
  apiFetch(`/api/release-change/changes/${changeId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteChange = (changeId) =>
  apiFetch(`/api/release-change/changes/${changeId}`, { method: 'DELETE' });
