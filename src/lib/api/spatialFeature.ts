import { get, patch } from './client';
import { toQuery } from './qs';

export type SpatialFeatureAttribute = {
  id: number;
  dataType: number;
  rowIdentifier: number;
  groupIdentifier: number | null;
  attributeIndex: number;
  attributeKey: string;
  attributeLabel: string;
  attributeValue: string;
  attributeValueType: number;
  status: number; // 1 = active, 2 = inactive
};

// For new attributes (minimal payload)
export type NewSpatialFeatureAttribute = {
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
 * Get a single spatial feature by ID with complete attribute data
 * This is used to fetch the current state before making updates
 */
export async function getSpatialFeatureById(
  featureId: number
): Promise<SpatialFeature> {
  const q = toQuery({
    include: ['attribute'],
    filter: [`id|eq|${featureId}`],
  });

  const response = await get<SpatialFeatureListResponse>(`/spatial-feature${q}`);
  
  if (!response.data || response.data.length === 0) {
    throw new Error(`Feature with ID ${featureId} not found`);
  }
  
  return response.data[0];
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
    dataType: 8, // Default data type
    rowIdentifier: feature.id,
    groupIdentifier: null,
    attributeIndex: 0,
    attributeKey,
    attributeLabel: attributeLabel || attributeKey,
    attributeValue,
    attributeValueType: 1, // Default to string type
    status: 1, // Active
  };

  return {
    ...feature,
    attribute: [...(feature.attribute || []), newAttribute],
  };
}

/**
 * Update a spatial feature with new attribute values
 * Endpoint: https://retfw.smartgov.id/framework/spatial-feature/{featureId}?include[]=attribute
 * Uses PATCH method for partial updates
 *
 * IMPORTANT: The API requires ALL existing attributes to be sent in the PATCH request,
 * not just the changed ones. This function handles that requirement.
 *
 * For existing attributes: Send attribute objects with ID (other fields optional but recommended)
 * For new attributes: Send minimal attribute objects with only required fields
 */
export async function updateSpatialFeature(
  featureId: number,
  allAttributes: SpatialFeatureAttribute[]
): Promise<SpatialFeature> {
  const q = toQuery({
    include: ['attribute'],
  });

  // Prepare the payload for the API - include ALL attributes
  const payload = {
    attribute: allAttributes.map(attr => {
      // Check if this is a new attribute (only missing ID or ID is 0)
      const isNewAttribute = !attr.id || attr.id === 0;
      
      console.log(`Processing attribute: key=${attr.attributeKey}, id=${attr.id}, isNew=${isNewAttribute}`);
      
      if (isNewAttribute) {
        // For new attributes, send only the minimal required fields
        const newAttr = {
          attributeKey: attr.attributeKey,
          attributeLabel: attr.attributeLabel || attr.attributeKey,
          attributeValue: attr.attributeValue,
          attributeValueType: attr.attributeValueType ?? 1, // Default to string type
        };
        console.log(`New attribute payload:`, newAttr);
        return newAttr;
      } else {
        // For existing attributes, send the attribute with ID and preserve all original fields
        // Use the complete structure from the GET request to ensure we don't lose any data
        const existingAttr = {
          id: attr.id,
          ...(attr.dataType && { dataType: attr.dataType }),
          ...(attr.rowIdentifier && { rowIdentifier: attr.rowIdentifier }),
          ...(attr.groupIdentifier !== undefined && { groupIdentifier: attr.groupIdentifier }),
          ...(attr.attributeIndex !== undefined && { attributeIndex: attr.attributeIndex }),
          attributeKey: attr.attributeKey,
          attributeLabel: attr.attributeLabel || attr.attributeKey,
          attributeValue: attr.attributeValue,
          attributeValueType: attr.attributeValueType ?? 1,
          ...(attr.status !== undefined && { status: attr.status }),
        };
        console.log(`Existing attribute payload:`, existingAttr);
        return existingAttr;
      }
    }),
  };

  console.log('PATCH Payload:', JSON.stringify(payload, null, 2));

  return patch<SpatialFeature>(`/spatial-feature/${featureId}${q}`, payload);
}

/**
 * Update a single attribute of a spatial feature
 * NOTE: This function requires the complete current attributes array to work correctly
 */
export async function updateSpatialFeatureAttribute(
  featureId: number,
  currentAttributes: SpatialFeatureAttribute[],
  attributeId: number,
  attributeKey: string,
  attributeValue: string,
  attributeLabel?: string,
  attributeValueType: number = 1
): Promise<SpatialFeature> {
  // Update the specific attribute in the current attributes array
  const updatedAttributes = currentAttributes.map(attr => {
    if (attr.id === attributeId) {
      return {
        ...attr,
        attributeKey,
        attributeLabel: attributeLabel || attributeKey,
        attributeValue,
        attributeValueType,
      };
    }
    return attr;
  });

  return updateSpatialFeature(featureId, updatedAttributes);
}

/**
 * Add a new attribute to a spatial feature via API
 * NOTE: This function requires the complete current attributes array to work correctly
 */
export async function addSpatialFeatureAttribute(
  featureId: number,
  currentAttributes: SpatialFeatureAttribute[],
  attributeKey: string,
  attributeValue: string,
  attributeLabel?: string,
  attributeValueType: number = 1
): Promise<SpatialFeature> {
  // Create new attribute without the complete structure (API will assign missing fields)
  const newAttribute: NewSpatialFeatureAttribute = {
    attributeKey,
    attributeLabel: attributeLabel || attributeKey,
    attributeValue,
    attributeValueType,
  };

  // Add to current attributes array
  const updatedAttributes = [...currentAttributes, newAttribute as SpatialFeatureAttribute];

  return updateSpatialFeature(featureId, updatedAttributes);
}

/**
 * Delete an attribute from a spatial feature
 * NOTE: This function requires the complete current attributes array to work correctly
 */
export async function deleteSpatialFeatureAttribute(
  featureId: number,
  currentAttributes: SpatialFeatureAttribute[],
  attributeId: number
): Promise<SpatialFeature> {
  // Mark the attribute for deletion by setting status to inactive
  const updatedAttributes = currentAttributes.map(attr => {
    if (attr.id === attributeId) {
      return {
        ...attr,
        status: 2, // Mark as inactive
      };
    }
    return attr;
  });

  return updateSpatialFeature(featureId, updatedAttributes);
}