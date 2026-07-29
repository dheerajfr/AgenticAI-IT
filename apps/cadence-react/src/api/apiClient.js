const API_BASE = '/api';

/**
 * Safe JSON fetch — mirrors the original fetchSafe() from dashboard.js and shell.js.
 * Returns parsed JSON on success, null on failure.
 */
export async function fetchSafe(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Standard fetch with error throwing for mutations (POST, PUT, DELETE, PATCH).
 */
export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errorMsg = body.detail || body.message || errorMsg;
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(errorMsg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export { API_BASE };
