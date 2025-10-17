import { get } from './client';
import { toQuery } from './qs';

export type SpatialAttribute = {
  id: number;
  dataType: number;
  rowIdentifier: number;
  groupIdentifier: number | null;
  attributeIndex: number;
  attributeKey: string;
  attributeLabel: string;
  attributeValueType: number;
  attributeValue: string;
  status: number;
};

export type SpatialRow = {
  id: number;
  systemId: number;
  type: number;
  identifier: string;
  label: string;
  value: string; // uuid
  status: number;
  attribute?: SpatialAttribute[];
  description?: string | null;
  createdBy?: string;
  createdAt?: number;
  updatedBy?: string;
  updatedAt?: number;
};

export type SpatialListResponse = {
  total: number;
  pageNumber: number;
  pageSize: number;
  data: SpatialRow[];
};

export type ListGenericParams = {
  pageNumber?: number;
  pageSize?: number;
  // include must be sent as include[]=attribute
  include?: string[];
  // filters must be sent as filters[]=key|op|value
  filters?: string[];
};

export async function listSpatialGeneric(params: ListGenericParams = {}): Promise<SpatialListResponse> {
  const q = toQuery({
    include: params.include && params.include.length ? params.include : ['attribute'],
    page: {
      number: params.pageNumber ?? 1,
      size: params.pageSize ?? 10,
    },
    ...(params.filters && params.filters.length ? { filters: params.filters } : {}),
  });
  // path is /spatial-feature (BASE already points to /framework in prod; to /api in dev)
  return get<SpatialListResponse>(`/spatial-feature${q}`);
}