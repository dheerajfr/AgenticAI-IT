import { apiFetch, fetchSafe } from './apiClient';

export const getConsolidated = (demandId) =>
  fetchSafe(`/api/test-quality/consolidated/${demandId}`);

export const getQualityGate = (demandId) =>
  fetchSafe(`/api/test-quality/relational/quality_gate/${demandId}`);

export const getTestGeneration = (demandId) =>
  fetchSafe(`/api/test-quality/relational/test_generation/${demandId}`);

export const getTestData = (demandId) =>
  fetchSafe(`/api/test-quality/relational/test_data/${demandId}`);

export const getTestExecution = (demandId) =>
  fetchSafe(`/api/test-quality/relational/test_execution/${demandId}`);

export const getSecurityTesting = (demandId) =>
  fetchSafe(`/api/test-quality/relational/security_testing/${demandId}`);

export const getTraceability = (demandId) =>
  fetchSafe(`/api/test-quality/relational/traceability/${demandId}`);

export const saveTestGeneration = (demandId, payload) =>
  apiFetch(`/api/test-quality/relational/test_generation/${demandId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const saveTestData = (demandId, payload) =>
  apiFetch(`/api/test-quality/relational/test_data/${demandId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const saveTestExecution = (demandId, payload) =>
  apiFetch(`/api/test-quality/relational/test_execution/${demandId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const saveSecurityTesting = (demandId, payload) =>
  apiFetch(`/api/test-quality/relational/security_testing/${demandId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const saveTraceability = (demandId, payload) =>
  apiFetch(`/api/test-quality/relational/traceability/${demandId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const saveQualityGate = (demandId, payload) =>
  apiFetch(`/api/test-quality/relational/quality_gate/${demandId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
