import { request, requestSafe, API_BASE } from './api';

export const dependencyService = {
  getDependencies: () => requestSafe(`${API_BASE}/dependencies`),
  
  getDependencyDetails: (id) => requestSafe(`${API_BASE}/dependencies/${id}`),

  getDependencyGraph: (id, selectedTask) => requestSafe(
    `${API_BASE}/dependencies/${id}/graph${selectedTask ? '?selected_task=' + encodeURIComponent(selectedTask) : ''}`
  ),

  deleteDependency: (id) => request(`${API_BASE}/dependencies/${id}`, {
    method: 'DELETE'
  }),

  getTaskDetails: (depId, taskId) => requestSafe(
    `${API_BASE}/dependencies/${depId}/task-details?task_id=${encodeURIComponent(taskId)}`
  ),

  chaseDependency: (id, params = {}) => {
    const urlParams = new URLSearchParams(params);
    return request(`${API_BASE}/dependencies/${id}/chase?${urlParams.toString()}`, {
      method: 'POST'
    });
  },

  draftCommunication: (id, payload) => request(`${API_BASE}/dependencies/${id}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateStatus: (id, payload) => request(`${API_BASE}/dependencies/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  addActivity: (id, payload) => request(`${API_BASE}/dependencies/${id}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  getActivities: (id) => requestSafe(`${API_BASE}/dependencies/${id}/activity`),

  checkImpact: (payload) => request(`${API_BASE}/dependencies/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  senseDependencies: (payload) => request(`${API_BASE}/dependencies/sense`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  createDependency: (payload) => request(`${API_BASE}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
};
