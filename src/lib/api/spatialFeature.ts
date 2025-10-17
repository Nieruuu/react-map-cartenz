import { get } from './client';
import { toQuery } from './qs';

export type SpatialFeatureAttribute = {
  id: number;
  attributeKey: string;
  attributeLabel: string;
  attributeValue: string;
  attributeValueType: number;
};

export type SpatialFeature = {
  id: number; // unique identifier of the feature (used as the region code)
  systemId: number;
  type: number;
  identifier: string;
  label: string;
  value: string; // uuid
  status: number; // 1 = active, 2 = inactive
  attribute: SpatialFeatureAttribute[];
  description?: string | null;
  createdBy?: string;
  createdAt?: number;
  updatedBy?: string;
  updatedAt?: number;
};

export type SpatialFeatureListResponse = {
  total: number; // total number of available features
  pageNumber: number; // current page number (starting from 1)
  pageSize: number; // number of features per page
  data: SpatialFeature[]; // array of individual feature objects
};

export type ListSpatialFeaturesParams = {
  pageNumber?: number;
  pageSize?: number;
  // include must be sent as include[]=attribute
  include?: string[];
  // filters must be sent as filter[]=key|op|value
  filters?: string[];
};

/**
 * List spatial features from the SmartGov API
 * Endpoint: https://retfw.smartgov.id/framework/spatial-feature
 * Required filter: ?filter[]=status|eq|1&include[]=attribute
 */
export async function listSpatialFeatures(params: ListSpatialFeaturesParams = {}): Promise<SpatialFeatureListResponse> {
  // Default parameters to ensure we only get active features with attributes
  const defaultParams = {
    include: ['attribute'],
    filters: ['status|eq|1'], // Only return features with status = 1 (active)
  };

  // Merge with provided params
  const mergedParams = {
    ...defaultParams,
    ...params,
    // If filters are provided, ensure the status filter is included
    filters: params.filters 
      ? [...defaultParams.filters, ...params.filters]
      : defaultParams.filters,
  };

  const q = toQuery({
    include: mergedParams.include,
    page: {
      number: mergedParams.pageNumber ?? 1,
      size: mergedParams.pageSize ?? 50,
    },
    ...(mergedParams.filters && mergedParams.filters.length ? { filter: mergedParams.filters } : {}),
  });

  // Use the correct endpoint path
  return get<SpatialFeatureListResponse>(`/spatial-feature${q}`);
}

/**
 * Get spatial features by type code
 * Features with the same spatialFeature.type value belong to the same layer
 */
export async function getSpatialFeaturesByType(
  typeCode: string,
  params: Omit<ListSpatialFeaturesParams, 'filters'> = {}
): Promise<SpatialFeatureListResponse> {
  return listSpatialFeatures({
    ...params,
    filters: [`spatialFeature.type|eq|${typeCode}`],
  });
}

/**
 * Extract attribute value from a spatial feature
 */
export function extractAttribute(
  feature: SpatialFeature,
  attributeKey: string,
  defaultValue: any = null
): any {
  if (!feature.attribute || !Array.isArray(feature.attribute)) {
    return defaultValue;
  }

  const attribute = feature.attribute.find(attr => attr.attributeKey === attributeKey);
  return attribute?.attributeValue ?? defaultValue;
}

/**
 * Get layer name from spatial feature
 * Uses attributeValue from spatialFeature.refWilayah as the layer name
 */
export function getLayerName(feature: SpatialFeature): string {
  return extractAttribute(feature, 'spatialFeature.refWilayah') || `Feature ${feature.id}`;
}

/**
 * Get type code from spatial feature
 * Uses attributeValue from spatialFeature.type
 */
export function getTypeCode(feature: SpatialFeature): string {
  return extractAttribute(feature, 'spatialFeature.type') || '';
}

/**
 * Get geometry from spatial feature
 * Uses attributeValue from spatialFeature.geometry
 */
export function getGeometry(feature: SpatialFeature): string | null {
  return extractAttribute(feature, 'spatialFeature.geometry');
}

/**
 * Group features by type code for layer creation
 * Features with the same spatialFeature.type value belong to the same layer
 */
export function groupFeaturesByType(features: SpatialFeature[]): Record<string, SpatialFeature[]> {
  return features.reduce((groups, feature) => {
    const typeCode = getTypeCode(feature);
    if (!groups[typeCode]) {
      groups[typeCode] = [];
    }
    groups[typeCode].push(feature);
    return groups;
  }, {} as Record<string, SpatialFeature[]>);
}

/**
 * Get unique type codes from features
 */
export function getUniqueTypeCodes(features: SpatialFeature[]): string[] {
  const typeCodes = features.map(feature => getTypeCode(feature));
  return Array.from(new Set(typeCodes)).sort();
}

/**
 * Filter features to only include active ones (status = 1)
 */
export function filterActiveFeatures(features: SpatialFeature[]): SpatialFeature[] {
  return features.filter(feature => feature.status === 1);
}

/**
 * Add a new attribute to a spatial feature (for metadata editor)
 */
export function addAttributeToFeature(
  feature: SpatialFeature,
  attributeKey: string,
  attributeValue: string,
  attributeLabel?: string
): SpatialFeature {
  const newAttribute: SpatialFeatureAttribute = {
    id: Date.now(), // Use timestamp as temporary ID
    attributeKey,
    attributeLabel: attributeLabel || attributeKey,
    attributeValue,
    attributeValueType: 1, // Default to string type
  };

  return {
    ...feature,
    attribute: [...(feature.attribute || []), newAttribute],
  };
}