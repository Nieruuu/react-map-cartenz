// src/lib/api/client.ts
import { API_BASE_URL } from '../config';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const TOKEN_KEY = 'ret_access_token';
const TYPE_KEY  = 'ret_token_type';
const EXP_KEY   = 'ret_token_exp';

export const setAccessToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const getAccessToken = () => localStorage.getItem(TOKEN_KEY);
export const setTokenType   = (t: string) => localStorage.setItem(TYPE_KEY, t);
export const getTokenType   = () => localStorage.getItem(TYPE_KEY);
export const setTokenExpireAt = (ms: number) => localStorage.setItem(EXP_KEY, String(ms ?? 0));
export const getTokenExpireAt = () => localStorage.getItem(EXP_KEY);
export const clearAccessToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TYPE_KEY); localStorage.removeItem(EXP_KEY); };

function joinBase(path: string) {
  const base = (API_BASE_URL || '').replace(/\/+$/, '');
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Servermu maunya karakter mentah seperti Postman.
// Kembalikan encoding [] | $$ ; ke bentuk aslinya.
function unescapeJsonApiQuery(u: string) {
  return u
    .replace(/%5B%5D/gi, '[]')   // []
    .replace(/%7C/gi, '|')       // |
    .replace(/%24%24/gi, '$$')   // $$
    .replace(/%3B/gi, ';');      // ;
}

function buildUrl(path: string, params?: Record<string, unknown>) {
  // Kalau path sudah bawa query (?include[]=attribute) dan tidak ada params tambahan,
  // jangan diotak-atik. Biarkan mentah.
  if (path.includes('?') && (!params || Object.keys(params).length === 0)) {
    return joinBase(path);
  }

  const joined = joinBase(path);
  const url = /^https?:\/\//i.test(joined) ? new URL(joined) : new URL(joined, window.location.origin);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      if (k.endsWith('[]')) {
        if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, String(val)));
        else url.searchParams.append(k, String(v));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  // Perbaiki encoding ke bentuk mentah agar match Postman
  const raw = url.toString();
  const [base, qh] = raw.split('?', 2);
  if (!qh) return raw;
  const [query, hash] = qh.split('#', 2);
  const fixed = unescapeJsonApiQuery(query);
  return `${base}?${fixed}${hash ? `#${hash}` : ''}`;
}

export async function request<T>(
  method: HttpMethod,
  path: string,
  opts?: { params?: Record<string, unknown>, body?: unknown, auth?: boolean, headers?: Record<string,string> }
): Promise<T> {
  const { params, body, auth = true, headers = {} } = opts || {};
  const url = buildUrl(path, params);

  const init: RequestInit = {
    method,
    headers: {
      // mirip Postman, beberapa backend baper kalau Accept terlalu “rapi”
      Accept: '*/*',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  };

  if (auth) {
    const token = getAccessToken();
    const type  = getTokenType() || 'jws';
    if (token) (init.headers as Record<string, string>).Authorization = `${type} ${token}`;
  }

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson && text ? JSON.parse(text) : text;

  if (!res.ok) {
    const snippet = typeof data === 'string' ? data.slice(0, 800) : JSON.stringify(data).slice(0, 800);
    const err = new Error(`HTTP ${res.status}: ${snippet}`);
    (err as Error & { status?: number; url?: string }).status = res.status;
    (err as Error & { status?: number; url?: string }).url = url;
    throw err;
  }
  return data as T;
}

export const get   = <T>(path: string, params?: Record<string, unknown>) => request<T>('GET', path, { params });
export const post  = <T>(path: string, body?: unknown, params?: Record<string, unknown>) => request<T>('POST', path, { body, params });
export const patch = <T>(path: string, body?: unknown, params?: Record<string, unknown>) => request<T>('PATCH', path, { body, params });
export const del   = <T>(path: string, params?: Record<string, unknown>) => request<T>('DELETE', path, { params });

// RAW: pakai path yang sudah mengandung query mentah (include[]=attribute)
export const getRaw = <T>(rawPathWithQuery: string) => request<T>('GET', rawPathWithQuery, {});
