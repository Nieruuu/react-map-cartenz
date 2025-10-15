// src/lib/api/client.ts
import { API_BASE_URL } from '../config';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// Kunci localStorage
const TK = 'ret_access_token';
const TT = 'ret_token_type';
const TE = 'ret_token_exp';

// Akses token & tipe
export const setAccessToken    = (t: string) => localStorage.setItem(TK, t);
export const getAccessToken    = () => localStorage.getItem(TK);
export const setTokenType      = (t: string) => localStorage.setItem(TT, t);
export const getTokenType      = () => localStorage.getItem(TT);
export const setTokenExpireAt  = (ms: number) => localStorage.setItem(TE, String(ms ?? 0));
export const clearAccessToken  = () => { localStorage.removeItem(TK); localStorage.removeItem(TT); localStorage.removeItem(TE); };

// Base join
function baseJoin(path: string) {
  const base = (API_BASE_URL || '').replace(/\/+$/, '');
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Server suka bracket/pipe mentah, jadi kembalikan hasil encode standar.
function unescapeJsonApiQuery(u: string) {
  return u
    .replace(/%5B%5D/gi, '[]')  // []
    .replace(/%7C/gi,   '|')    // |
    .replace(/%24%24/gi,'$$')   // $$
    .replace(/%3B/gi,   ';');   // ;
}

// Bikin URL final
function buildUrl(path: string, params?: Record<string, any>) {
  if (path.includes('?') && (!params || Object.keys(params).length === 0)) {
    return baseJoin(path);
  }
  const joined = baseJoin(path);
  const url = /^https?:\/\//i.test(joined) ? new URL(joined) : new URL(joined, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '') continue;
      if (k.endsWith('[]')) {
        Array.isArray(v) ? v.forEach(val => url.searchParams.append(k, String(val))) : url.searchParams.append(k, String(v));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const raw = url.toString();
  const [b, qh] = raw.split('?', 2);
  if (!qh) return raw;
  const [q, h] = qh.split('#', 2);
  return `${b}?${unescapeJsonApiQuery(q)}${h ? `#${h}` : ''}`;
}

// Normalisasi skema token: apapun dari server (jws/jwt/…)
// kita paksa jadi 'Bearer' supaya backend tidak tersinggung.
function normalizeScheme(s: string | null | undefined): string {
  if (!s) return 'Bearer';
  const k = s.toLowerCase();
  if (k === 'jws' || k === 'jwt' || k === 'bearer') return 'Bearer';
  return 'Bearer';
}

// Mesin request utama
export async function request<T>(
  method: HttpMethod,
  path: string,
  opts?: { params?: Record<string, any>, body?: any, auth?: boolean, headers?: Record<string, string> }
): Promise<{ data: T; __meta: { url: string; status: number } }> {
  const { params, body, auth = true, headers = {} } = opts || {};
  const url = buildUrl(path, params);

  const init: RequestInit = {
    method,
    headers: { Accept: '*/*', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
  };

  if (auth) {
    const token = getAccessToken();
    const type  = normalizeScheme(getTokenType());
    if (token) (init.headers as any).Authorization = `${type} ${token}`;
  }
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);

  const res  = await fetch(url, init);
  const text = await res.text();
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const parsed = isJson && text ? JSON.parse(text) : text;

  if (!res.ok) {
    const msg = `HTTP ${res.status} ${res.statusText}: ${typeof parsed === 'string' ? parsed.slice(0, 600) : JSON.stringify(parsed).slice(0, 600)}`;
    const err = new Error(msg) as any;
    err.status = res.status;
    err.url    = url;
    throw err;
  }

  return { data: parsed as T, __meta: { url, status: res.status } };
}

// Helper umum
export const get      = <T>(path: string, params?: Record<string, any>, headers?: Record<string, string>) => request<T>('GET', path, { params, headers });
export const post     = <T>(path: string, body?: any, params?: Record<string, any>, headers?: Record<string, string>) => request<T>('POST', path, { body, params, headers });
export const patch    = <T>(path: string, body?: any, params?: Record<string, any>, headers?: Record<string, string>) => request<T>('PATCH', path, { body, params, headers });
export const del      = <T>(path: string, params?: Record<string, any>, headers?: Record<string, string>) => request<T>('DELETE', path, { params, headers });

// Raw path dengan query bawaan (tetap lewat base/proxy)
export const getRaw   = <T>(rawPathWithQuery: string, headers?: Record<string, string>) => request<T>('GET', rawPathWithQuery, { headers });

// Auth token harus TANPA Authorization header
export const postNoAuth = <T>(path: string, body?: any, params?: Record<string, any>, headers?: Record<string, string>) =>
  request<T>('POST', path, { body, params, headers, auth: false });
