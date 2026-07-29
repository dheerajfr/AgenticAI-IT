import { request, requestSafe, API_BASE } from './api';

export const budgetService = {
  getBudgetProject: (demandId) => requestSafe(`${API_BASE}/budget-cost/project/${demandId}`),

  getInvoices: (demandId) => requestSafe(`${API_BASE}/budget-cost/invoices/${demandId}`),
  
  generateInsights: (demandId) => request(`${API_BASE}/budget-cost/insights/generate/${demandId}`, {
    method: 'POST'
  }),

  deleteBudgetProject: (demandId) => request(`${API_BASE}/budget-cost/project/${demandId}`, {
    method: 'DELETE'
  }),

  getBurn: (demandId) => requestSafe(`${API_BASE}/budget-cost/burn/${demandId}`),

  updateBurnActuals: (payload) => request(`${API_BASE}/budget-cost/burn/actuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateBurnForecast: (payload) => request(`${API_BASE}/budget-cost/burn/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  updateBurnCommit: (payload) => request(`${API_BASE}/budget-cost/burn/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  approveInvoice: (payload) => request(`${API_BASE}/budget-cost/invoices/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  finalApproveInvoice: (payload) => request(`${API_BASE}/budget-cost/invoices/final-approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  getCapexOpex: (demandId) => requestSafe(`${API_BASE}/budget-cost/capex-opex/${demandId}`),

  signOffCapexOpexItem: (payload) => request(`${API_BASE}/budget-cost/capex-opex/sign-off-item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  signOffCapexOpex: (payload) => request(`${API_BASE}/budget-cost/capex-opex/sign-off`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  generateProjectInvoices: (demandId, payload) => request(`${API_BASE}/budget-cost/project/${demandId}/invoices/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  generateSampleInvoices: (demandId, payload) => request(`${API_BASE}/budget-cost/invoices/${demandId}/generate-samples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
};
