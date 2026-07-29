import { request, requestSafe, API_BASE } from './api';

export const knowledgeService = {
  getKnowledgeProject: (demandId) => requestSafe(`${API_BASE}/knowledge-artifacts/project/${demandId}`),
  
  autoHarvest: (demandId) => request(`${API_BASE}/knowledge-artifacts/auto-harvest/${demandId}`, {
    method: 'POST'
  }),

  uploadFile: (demandId, formData) => request(`${API_BASE}/knowledge-artifacts/upload/${demandId}`, {
    method: 'POST',
    body: formData
  }),

  generateStubs: (demandId, payload) => request(`${API_BASE}/knowledge-artifacts/generate-stubs/${demandId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  extractLessons: (payload) => request(`${API_BASE}/knowledge-artifacts/extract-lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  syncOnboarding: (payload) => request(`${API_BASE}/knowledge-artifacts/sync-onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  searchKnowledge: (payload) => request(`${API_BASE}/knowledge-artifacts/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  validateQA: (payload) => request(`${API_BASE}/knowledge-artifacts/validate-qa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  validateUpdate: (payload) => request(`${API_BASE}/knowledge-artifacts/validate-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  saveArtifact: (demandId, payload) => request(`${API_BASE}/knowledge-artifacts/artefacts/${demandId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  approveArtifact: (demandId, payload) => request(`${API_BASE}/knowledge-artifacts/artefacts/${demandId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  deleteArtifact: (demandId, filename) => {
    const encoded = encodeURIComponent(filename);
    return request(`${API_BASE}/knowledge-artifacts/artefacts/${demandId}/${encoded}`, {
      method: 'DELETE'
    });
  }
};
