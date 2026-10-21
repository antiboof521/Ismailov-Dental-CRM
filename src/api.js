/**
 * api.js — server bilan aloqa (fetch asosida)
 */

let token = localStorage.getItem('dc_token') || '';
let apiKey = localStorage.getItem('dc_api_key') || '';
let baseUrl = localStorage.getItem('dc_base_url') !== null ? localStorage.getItem('dc_base_url') : '';

export function setAuth(newToken) {
  token = newToken || '';
  if (newToken) localStorage.setItem('dc_token', newToken);
  else localStorage.removeItem('dc_token');
}

export function setApiKey(key) {
  apiKey = key || '';
  if (key) localStorage.setItem('dc_api_key', key);
  else localStorage.removeItem('dc_api_key');
}

export function setBaseUrl(url) {
  baseUrl = url !== undefined ? url : '';
  localStorage.setItem('dc_base_url', baseUrl);
}

export function getBaseUrl() {
  return baseUrl;
}

export function hasToken() {
  return Boolean(token);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (apiKey) headers['x-api-key'] = apiKey;

  const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Excel fayl — blob qaytaramiz
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('spreadsheetml') || ct.includes('excel') || ct.includes('octet-stream')) {
    if (!res.ok) throw new ApiError('Yuklab olishda xato', res.status);
    return res.blob();
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Xato: ${res.status}`, res.status);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};
