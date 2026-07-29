export const API_BASE = '/api';

export async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errorMsg = `Request failed with status ${res.status}`;
    try {
      const errorJson = await res.json();
      if (errorJson && errorJson.detail) {
        if (Array.isArray(errorJson.detail)) {
          errorMsg = errorJson.detail
            .map((err) => {
              const field = err.loc.filter(l => l !== 'body').join('.');
              return `${field || 'Field'}: ${err.msg}`;
            })
            .join(' | ');
        } else if (typeof errorJson.detail === 'string') {
          errorMsg = errorJson.detail;
        } else {
          errorMsg = JSON.stringify(errorJson.detail);
        }
      } else {
        errorMsg = JSON.stringify(errorJson);
      }
    } catch {
      try {
        const text = await res.text();
        if (text) errorMsg = text;
      } catch {}
    }
    throw new Error(errorMsg);
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
