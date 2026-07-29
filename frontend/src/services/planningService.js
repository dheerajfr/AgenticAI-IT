import { request, requestSafe, API_BASE } from './api';

export const planningService = {
  getPlans: () => requestSafe(`${API_BASE}/plans`),
  
  getEmployees: () => requestSafe(`${API_BASE}/plans/employees`),
  
  deletePlan: (id) => request(`${API_BASE}/plans/${id}`, { method: 'DELETE' }),
  
  generatePlan: (payload) => request(`${API_BASE}/plans/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  getEmployeeAvailability: (skill) => requestSafe(
    `${API_BASE}/plans/employees/availability?skill=${encodeURIComponent(skill)}`
  ),

  savePlan: (payload) => request(`${API_BASE}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  replan: (planId, payload) => request(`${API_BASE}/plans/${planId}/replan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateStatus: (planId, payload) => request(`${API_BASE}/plans/${planId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  getPlanHistory: (planId) => requestSafe(`${API_BASE}/plans/${planId}/history`)
};
