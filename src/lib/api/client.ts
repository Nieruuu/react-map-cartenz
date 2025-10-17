// If the above import bothers your setup, remove it. It's only for types.

const isDev = import.meta.env.DEV;

// In dev we call /api/* then vite rewrites to /framework/*
export const API_BASE = isDev ? '/api' : 'https://retfw.smartgov.id/framework';

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
  } catch {}
};
export const getTokenType = () => {
  return 'Bearer';
};
export const setTokenType = (_type: string) => {
  // No-op - always use Bearer
};
export const clearAccessToken = () => {
  try {
    localStorage.removeItem('ret_token');
  } catch {}
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
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) {
    throw new HttpError(url, res.status, data);
  }
  return data as T;
};
function getAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  // Force Bearer even if backend says tokenType = "jws"
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> || {}),
    ...getAuthHeader(),
  };
  const res = await fetch(url, { ...init, headers });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
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
