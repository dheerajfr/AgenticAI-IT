export const API_BASE = '/api';

export async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(errorText || `Request failed with status ${res.status}`);
  }
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

export async function requestSafe(url, options = {}) {
  try {
    return await request(url, options);
  } catch (e) {
    console.error(`Safe API Request failed for ${url}:`, e);
    return null;
  }
}
