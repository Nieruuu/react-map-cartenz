// src/lib/api/spatialFeature.ts
import { get } from './client';
import { buildParams } from './qs';

export type SpatialAttr = { attributeKey: string; attributeValue: string; attributeValueType?: number; status?: number };
export type SpatialFeatureRow = { id: number; attribute?: SpatialAttr[] };
export type Paged<T> = { total: number; pageNumber: number; pageSize: number; data: T[] };

/** Legacy simple list (dipertahankan kalau ada kode lama yang masih pakai). */
export function listSpatialFeatures(params?: Record<string, unknown>) {
  const p = { pageNumber: 1, pageSize: 10, include: 'attribute', ...(params || {}) };
  return get<Paged<SpatialFeatureRow>>('/spatial-feature', p);
}

/** Versi “gaya Postman” dengan page[number], include[], filter[] */
export function listSpatialFeaturesJsonApi(opts?: {
  page?: { number?: number; size?: number };
  include?: string[];
  filter?: string[];
  extra?: Record<string, unknown>;
}) {
  const params = buildParams({
    page: { number: opts?.page?.number ?? 1, size: opts?.page?.size ?? 10 },
    include: opts?.include ?? ['attribute'],
    filter: opts?.filter,
    extra: opts?.extra
  });
  return get<Paged<SpatialFeatureRow>>('/spatial-feature', params);
}

/** Ambil seluruh halaman dengan paging loop. */
export async function listAllSpatialFeaturesJsonApi(opts?: {
  pageSize?: number;
  include?: string[];
  filter?: string[];
  extra?: Record<string, unknown>;
  maxPages?: number;
}): Promise<SpatialFeatureRow[]> {
  const size = opts?.pageSize ?? 200;
  const include = opts?.include ?? ['attribute'];
  const maxPages = opts?.maxPages ?? 500;

  let page = 1;
  let out: SpatialFeatureRow[] = [];
  while (page <= maxPages) {
    const res = await listSpatialFeaturesJsonApi({
      page: { number: page, size },
      include,
      filter: opts?.filter,
      extra: opts?.extra
    });
    const chunk = res?.data ?? [];
    out = out.concat(chunk);
    const total = res?.total ?? out.length;
    const pageSize = res?.pageSize || size;
    const pageCount = Math.ceil(total / pageSize);
    if (page >= pageCount || chunk.length === 0) break;
    page += 1;
  }
  return out;
}

export function countSpatialFeatures(params?: Record<string, unknown>) {
  return get<{ data: number }>('/spatial-feature/count', params);
}

export function getSpatialFeature(id: number | string, params?: Record<string, unknown>) {
  // default-nya minta attribute ikut serta dengan gaya bracket
  const baseParams = { 'include[]': 'attribute' } as Record<string, unknown>;
  return get<{ data: SpatialFeatureRow }>(`/spatial-feature/${id}`, { ...baseParams, ...(params || {}) });
}

/** Direct fetch implementation that exactly matches Postman format */
export async function getSpatialFeaturesDirect(includeAttribute = true): Promise<Paged<SpatialFeatureRow>> {
  const token = localStorage.getItem('ret_access_token');
  const tokenType = localStorage.getItem('ret_token_type') || 'jws';
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  const baseUrl = (import.meta as unknown as ImportMetaEnv & { VITE_API_BASE_URL?: string }).env?.VITE_API_BASE_URL || 'https://retfw.smartgov.id/framework';
  const url = includeAttribute
    ? `${baseUrl}/spatial-feature?include[]=attribute`
    : `${baseUrl}/spatial-feature`;

  const myHeaders = new Headers();
  myHeaders.append("Authorization", `${tokenType} ${token}`);

  const requestOptions: RequestInit = {
    method: "GET",
    headers: myHeaders,
    redirect: "follow"
  };

  try {
    const response = await fetch(url, requestOptions);
    const responseText = await response.text();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`);
    }

    // Try to parse as JSON, fallback to text
    try {
      return JSON.parse(responseText) as Paged<SpatialFeatureRow>;
    } catch {
      throw new Error(`Invalid JSON response: ${responseText.slice(0, 200)}`);
    }
  } catch (error) {
    console.error('Direct fetch error:', error);
    throw error;
  }
}
