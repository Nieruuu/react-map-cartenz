import { API_BASE_URL } from '../config';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const TK = 'ret_access_token';
const TT = 'ret_token_type';
const TE = 'ret_token_exp';

export const setAccessToken = (t: string) => localStorage.setItem(TK, t);
export const getAccessToken = () => localStorage.getItem(TK);
export const setTokenType   = (t: string) => localStorage.setItem(TT, t);
export const getTokenType   = () => localStorage.getItem(TT);
export const setTokenExpireAt = (ms: number) => localStorage.setItem(TE, String(ms ?? 0));
export const clearAccessToken = () => { localStorage.removeItem(TK); localStorage.removeItem(TT); localStorage.removeItem(TE); };

function baseJoin(path: string) {
  const base = (API_BASE_URL || '').replace(/\/+$/, '');
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
function unescapeJsonApiQuery(u: string) {
  return u.replace(/%5B%5D/gi,'[]').replace(/%7C/gi,'|').replace(/%24%24/gi,'$$').replace(/%3B/gi,';');
}
function buildUrl(path: string, params?: Record<string, any>) {
  if (path.includes('?') && (!params || Object.keys(params).length === 0)) return baseJoin(path);
  const joined = baseJoin(path);
  const url = /^https?:\/\//i.test(joined) ? new URL(joined) : new URL(joined, window.location.origin);
  if (params) {
    for (const [k,v] of Object.entries(params)) {
      if (v == null || v === '') continue;
      if (k.endsWith('[]')) {
        Array.isArray(v) ? v.forEach(val => url.searchParams.append(k, String(val))) : url.searchParams.append(k, String(v));
      } else url.searchParams.set(k, String(v));
    }
  }
  const raw = url.toString();
  const [b, qh] = raw.split('?', 2);
  if (!qh) return raw;
  const [q, h] = qh.split('#', 2);
  return `${b}?${unescapeJsonApiQuery(q)}${h ? `#${h}` : ''}`;
}

export async function request<T>(method: HttpMethod, path: string, opts?: {
  params?: Record<string, any>, body?: any, auth?: boolean, headers?: Record<string,string>
}): Promise<{ data: T; __meta: { url: string; status: number; headers: Record<string,string> } }> {
  const { params, body, auth = true, headers = {} } = opts || {};
  const url = buildUrl(path, params);
  const init: RequestInit = {
    method,
    headers: { Accept: '*/*', ...(body !== undefined ? { 'Content-Type':'application/json' } : {}), ...headers },
  };
  if (auth) {
    const token = getAccessToken();
    let type = getTokenType() || 'jws';
    (init.headers as any).Authorization = token ? `${type} ${token}` : '';
  }
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);

  const t0 = performance.now();
  const res = await fetch(url, init);
  const text = await res.text();
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const parsed = isJson && text ? JSON.parse(text) : text;
  const t1 = performance.now();

  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} ${res.statusText}: ${typeof parsed === 'string' ? parsed.slice(0,800) : JSON.stringify(parsed).slice(0,800)}`);
    (e as any).status = res.status;
    (e as any).url = url;
    (e as any).rt = (t1 - t0).toFixed(1);
    throw e;
  }
  const hdrs: Record<string,string> = {};
  res.headers.forEach((v,k)=>hdrs[k]=v);
  return { data: parsed as T, __meta: { url, status: res.status, headers: hdrs } };
}

export const get   = <T>(path: string, params?: Record<string, any>, headers?: Record<string,string>) => request<T>('GET', path, { params, headers });
export const post  = <T>(path: string, body?: any, params?: Record<string, any>, headers?: Record<string,string>) => request<T>('POST', path, { body, params, headers });
export const getRaw = <T>(rawPathWithQuery: string, headers?: Record<string,string>) => request<T>('GET', rawPathWithQuery, { headers });