import { request, requestSafe, API_BASE } from './api';

export const vendorService = {
  getVendorProject: (demandId) => requestSafe(`${API_BASE}/vendor-coordination/project/${demandId}`),
  
  checkSow: (payload) => request(`${API_BASE}/vendor-coordination/check-sow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),

  revokeAccess: (demandId, user) => request(`${API_BASE}/vendor-coordination/revoke-access/${demandId}?user=${encodeURIComponent(user)}`, {
    method: 'POST'
  })
};
