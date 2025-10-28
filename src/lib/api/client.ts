// If the above import bothers your setup, remove it. It's only for types.

import { auth } from './auth';
import { API_BASE_URL, ENABLE_API_DEBUG } from '../config';

// Use environment-based API base URL from config
export const API_BASE = API_BASE_URL;

function getStoredToken(): string | null {
  try {
    return localStorage.getItem('ret_token') || null;
  } catch {
    return null;
  }
}

// Legacy exports for compatibility
export const getAccessToken = getStoredToken;
export const setAccessToken = (token: string) => {
  try {
    localStorage.setItem('ret_token', token);
  } catch {
    // localStorage not available
  }
};
export const getTokenType = () => {
  return 'Bearer';
};
export const setTokenType = () => {
  // No-op - always use Bearer
};
export const clearAccessToken = () => {
  try {
    localStorage.removeItem('ret_token');
  } catch {
    // localStorage not available
  }
};

// Additional exports for compatibility
export const getRaw = async <T>(path: string): Promise<T> => {
  return get<T>(path);
};

export const postNoAuth = async <T>(path: string, body?: unknown): Promise<T> => {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await res.text();
  let data: unknown = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) {
    throw new HttpError(url, res.status, data);
  }
  return data as T;
};
function getAuthHeader(): Record<string, string> {
  try {
    // Use the authentication manager for consistent token retrieval
    return auth.getAuthHeader();
  } catch {
    // If not authenticated, return empty header
    return {};
  }
}

export class HttpError extends Error {
  status: number;
  url: string;
  body?: unknown;
  constructor(url: string, status: number, body?: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  
  // Initial request with current token
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> || {}),
    ...getAuthHeader(),
  };
  
  // Debug logging for request (controlled by environment variable)
  if (ENABLE_API_DEBUG) {
    console.debug('API Request:', {
      url,
      method: init.method || 'GET',
      hasAuthHeader: !!headers.Authorization,
      authHeaderLength: headers.Authorization?.length,
    });
  }
  
  const res = await fetch(url, { ...init, headers });

  const txt = await res.text();
  let data: unknown = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }

  if (res.status === 401) {
    if (ENABLE_API_DEBUG) {
      console.warn('API request unauthorized, clearing token', {
        url,
        status: res.status,
        requestHadAuth: !!headers.Authorization,
      });
    }

    await auth.logout();
    throw new HttpError(url, res.status, data);
  }

  if (!res.ok) {
    throw new HttpError(url, res.status, data);
  }
  return data as T;
}

export async function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}
export async function post<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  return request<T>(path, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
}
export async function put<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  return request<T>(path, { method: 'PUT', headers, body: body ? JSON.stringify(body) : undefined });
}
export async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}
export async function patch<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  return request<T>(path, { method: 'PATCH', headers, body: body ? JSON.stringify(body) : undefined });
}
