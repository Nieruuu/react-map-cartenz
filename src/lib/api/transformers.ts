/**
 * Data transformer for SmartGov API responses
 * Converts JSON responses using specific attribute keys for spatial features
 */

import type { SpatialRow, SpatialAttribute } from './spatialGeneric';
import type { SpatialFeature, SpatialFeatureAttribute } from './spatialFeature';

export interface TransformedFeature {
  id: string;
  uuid: string;
  name: string; // Uses attributeValue from spatialFeature.refWilayah as the region name
  typeCode: string;
  geometry: string | null;
  properties: Record<string, any>;
  original: SpatialRow | SpatialFeature;
}

export interface TransformOptions {
  nameKey?: string;
  geometryKey?: string;
  typeKey?: string;
  includeRawAttributes?: boolean;
  flattenAttributes?: boolean;
  includeSystemFields?: boolean; // Simplified option to include system fields
}

/**
 * Default attribute keys used by SmartGov API
 */
const DEFAULT_KEYS = {
  name: 'spatialFeature.refWilayah',
  geometry: 'spatialFeature.geometry',
  type: 'spatialFeature.type',
} as const;

/**
 * Extract attribute value from spatial feature attributes (legacy format)
 */
export function extractAttribute(
  row: SpatialRow,
  key: string,
  defaultValue: any = null
): any {
  if (!row.attribute || !Array.isArray(row.attribute)) {
    return defaultValue;
  }

  const attribute = row.attribute.find((attr: SpatialAttribute) =>
    attr.attributeKey === key
  );

  return attribute?.attributeValue ?? defaultValue;
}

/**
 * Extract attribute value from spatial feature (new format)
 */
export function extractSpatialFeatureAttribute(
  feature: SpatialFeature,
  attributeKey: string,
  defaultValue: any = null
): any {
  if (!feature.attribute || !Array.isArray(feature.attribute)) {
    return defaultValue;
  }

  const attribute = feature.attribute.find((attr: SpatialFeatureAttribute) =>
    attr.attributeKey === attributeKey
  );

  return attribute?.attributeValue ?? defaultValue;
}

/**
 * Transform a single spatial row to a normalized feature object (legacy)
 */
export function transformSpatialRow(
  row: SpatialRow,
  options: TransformOptions = {}
): TransformedFeature {
  const opts = {
    nameKey: DEFAULT_KEYS.name,
    geometryKey: DEFAULT_KEYS.geometry,
    typeKey: DEFAULT_KEYS.type,
    includeRawAttributes: false,
    flattenAttributes: true,
    ...options,
  };

  // Extract core attributes
  const name = extractAttribute(row, opts.nameKey) || `Feature ${row.id}`;
  const geometry = extractAttribute(row, opts.geometryKey);
  const typeCode = extractAttribute(row, opts.typeKey) || '';

  // Build properties object - only include essential fields by default
  let properties: Record<string, any> = {
    id: row.id,
    name: name,
  };
  
  // Only include system fields if explicitly requested
  if (opts.includeSystemFields) {
    properties.uuid = row.value;
    properties.typeCode = typeCode;
    properties.identifier = row.identifier;
    properties.label = row.label;
    properties.status = row.status;
    properties.description = row.description;
    properties.createdBy = row.createdBy;
    properties.createdAt = row.createdAt;
    properties.updatedBy = row.updatedBy;
    properties.updatedAt = row.updatedAt;
  }

  // Flatten additional attributes if requested
  if (opts.flattenAttributes && row.attribute) {
    row.attribute.forEach((attr: SpatialAttribute) => {
      // Skip core spatial attributes that are already handled
      if (attr.attributeKey.startsWith('spatialFeature.')) {
        return;
      }

      // Add attribute to properties
      properties[attr.attributeKey] = attr.attributeValue;
    });
  }

  // Include raw attributes if requested
  if (opts.includeRawAttributes) {
    properties._rawAttributes = row.attribute;
  }

  // No need for complex filtering anymore - we only include id and name by default

  return {
    id: String(row.id).replace(/,/g, ''), // Remove commas from ID
    uuid: row.value,
    name: String(name),
    typeCode: String(typeCode),
    geometry: geometry,
    properties,
    original: row,
  };
}

/**
 * Transform a single spatial feature to a normalized feature object (new format)
 */
export function transformSpatialFeature(
  feature: SpatialFeature,
  options: TransformOptions = {}
): TransformedFeature {
  const opts = {
    nameKey: DEFAULT_KEYS.name,
    geometryKey: DEFAULT_KEYS.geometry,
    typeKey: DEFAULT_KEYS.type,
    includeRawAttributes: false,
    flattenAttributes: true,
    ...options,
  };

  // Extract core attributes using the new format
  const name = extractSpatialFeatureAttribute(feature, opts.nameKey) || `Feature ${feature.id}`;
  const geometry = extractSpatialFeatureAttribute(feature, opts.geometryKey);
  const typeCode = extractSpatialFeatureAttribute(feature, opts.typeKey) || '';

  // Build properties object - only include essential fields by default
  let properties: Record<string, any> = {
    id: feature.id, // Use id field as the unique region code
    name: name, // Use attributeValue from spatialFeature.refWilayah as the region name
  };
  
  // Only include system fields if explicitly requested
  if (opts.includeSystemFields) {
    properties.uuid = feature.value;
    properties.typeCode = typeCode;
    properties.identifier = feature.identifier;
    properties.label = feature.label;
    properties.status = feature.status;
    properties.description = feature.description;
    properties.createdBy = feature.createdBy;
    properties.createdAt = feature.createdAt;
    properties.updatedBy = feature.updatedBy;
    properties.updatedAt = feature.updatedAt;
  }

  // Flatten additional attributes if requested
  if (opts.flattenAttributes && feature.attribute) {
    feature.attribute.forEach((attr: SpatialFeatureAttribute) => {
      // Skip core spatial attributes that are already handled
      if (attr.attributeKey.startsWith('spatialFeature.')) {
        return;
      }

      // Add attribute to properties
      properties[attr.attributeKey] = attr.attributeValue;
    });
  }

  // Include raw attributes if requested
  if (opts.includeRawAttributes) {
    properties._rawAttributes = feature.attribute;
  }

  // No need for complex filtering anymore - we only include id and name by default

  return {
    id: String(feature.id).replace(/,/g, ''), // Remove commas from ID
    uuid: feature.value,
    name: String(name),
    typeCode: String(typeCode),
    geometry: geometry,
    properties,
    original: feature,
  };
}

/**
 * Transform an array of spatial rows (legacy)
 */
export function transformSpatialRows(
  rows: SpatialRow[],
  options: TransformOptions = {}
): TransformedFeature[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map(row => transformSpatialRow(row, options))
    .filter(feature => feature.geometry !== null); // Only include features with geometry
}

/**
 * Transform an array of spatial features (new format)
 */
export function transformSpatialFeatures(
  features: SpatialFeature[],
  options: TransformOptions = {}
): TransformedFeature[] {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .map(feature => transformSpatialFeature(feature, options))
    .filter(feature => feature.geometry !== null); // Only include features with geometry
}

/**
 * Group transformed features by type code
 */
export function groupFeaturesByType(
  features: TransformedFeature[]
): Record<string, TransformedFeature[]> {
  return features.reduce((groups, feature) => {
    const typeCode = feature.typeCode || 'unknown';
    if (!groups[typeCode]) {
      groups[typeCode] = [];
    }
    groups[typeCode].push(feature);
    return groups;
  }, {} as Record<string, TransformedFeature[]>);
}

/**
 * Get unique type codes from features
 */
export function getUniqueTypeCodes(features: TransformedFeature[]): string[] {
  const typeCodes = features.map(f => f.typeCode);
  return Array.from(new Set(typeCodes)).sort();
}

/**
 * Filter features by type code
 */
export function filterFeaturesByType(
  features: TransformedFeature[],
  typeCodes: string | string[]
): TransformedFeature[] {
  const codes = Array.isArray(typeCodes) ? typeCodes : [typeCodes];
  return features.filter(feature => codes.includes(feature.typeCode));
}

/**
 * Filter features by name (case-insensitive partial match)
 */
export function filterFeaturesByName(
  features: TransformedFeature[],
  searchTerm: string
): TransformedFeature[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return features;
  }

  const term = searchTerm.toLowerCase().trim();
  return features.filter(feature => 
    feature.name.toLowerCase().includes(term)
  );
}

/**
 * Get statistics about transformed features
 */
export function getFeatureStatistics(features: TransformedFeature[]) {
  const stats = {
    total: features.length,
    byType: {} as Record<string, number>,
    withGeometry: 0,
    withoutGeometry: 0,
  };

  features.forEach(feature => {
    // Count by type
    const type = feature.typeCode || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    // Count geometry presence
    if (feature.geometry) {
      stats.withGeometry++;
    } else {
      stats.withoutGeometry++;
    }
  });

  return stats;
}

/**
 * Create a summary string for feature statistics
 */
export function createFeatureSummary(features: TransformedFeature[]): string {
  const stats = getFeatureStatistics(features);
  const typeCount = Object.keys(stats.byType).length;
  
  if (typeCount === 0) {
    return 'No features found';
  }

  const typeInfo = typeCount === 1 
    ? `1 type` 
    : `${typeCount} types`;

  return `${stats.total} features (${typeInfo}, ${stats.withGeometry} with geometry)`;
}

/**
 * Validate that a transformed feature has all required data
 */
export function validateTransformedFeature(feature: TransformedFeature): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!feature.id) {
    errors.push('Missing feature ID');
  }

  if (!feature.uuid) {
    errors.push('Missing feature UUID');
  }

  if (!feature.name) {
    errors.push('Missing feature name');
  }

  if (!feature.geometry) {
    errors.push('Missing geometry data');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Batch validate multiple features
 */
export function validateTransformedFeatures(
  features: TransformedFeature[]
): {
  valid: TransformedFeature[];
  invalid: Array<{ feature: TransformedFeature; errors: string[] }>;
} {
  const valid: TransformedFeature[] = [];
  const invalid: Array<{ feature: TransformedFeature; errors: string[] }> = [];

  features.forEach(feature => {
    const validation = validateTransformedFeature(feature);
    if (validation.isValid) {
      valid.push(feature);
    } else {
      invalid.push({ feature, errors: validation.errors });
    }
  });

  return { valid, invalid };
}

/**
 * Add a new attribute to a transformed feature (for metadata editor)
 * When a user adds metadata through the FocusCard metadata editor,
 * the system must append a new attribute block inside the attribute array
 */
export function addAttributeToTransformedFeature(
  feature: TransformedFeature,
  attributeKey: string,
  attributeValue: string,
  attributeLabel?: string
): TransformedFeature {
  // Check if the original feature is a SpatialFeature
  const isSpatialFeature = 'attribute' in feature.original && 
    Array.isArray(feature.original.attribute) &&
    feature.original.attribute.length > 0 &&
    'attributeKey' in feature.original.attribute[0];

  if (isSpatialFeature) {
    // Update the original SpatialFeature
    const originalFeature = feature.original as SpatialFeature;
    const newAttribute: SpatialFeatureAttribute = {
      id: Date.now(), // Use timestamp as temporary ID
      dataType: 1,
      rowIdentifier: originalFeature.id,
      groupIdentifier: null,
      attributeIndex: (originalFeature.attribute || []).length,
      attributeKey,
      attributeLabel: attributeLabel || attributeKey,
      attributeValue,
      attributeValueType: 1, // Default to string type
      status: 1,
    };

    const updatedOriginal = {
      ...originalFeature,
      attribute: [...(originalFeature.attribute || []), newAttribute],
    };

    // Update properties
    const updatedProperties = {
      ...feature.properties,
      [attributeKey]: attributeValue,
    };

    return {
      ...feature,
      properties: updatedProperties,
      original: updatedOriginal,
    };
  } else {
    // For legacy SpatialRow format
    const originalRow = feature.original as SpatialRow;
    const newAttribute: SpatialAttribute = {
      id: Date.now(),
      dataType: 1,
      rowIdentifier: originalRow.id,
      groupIdentifier: null,
      attributeIndex: (originalRow.attribute || []).length,
      attributeKey,
      attributeLabel: attributeLabel || attributeKey,
      attributeValueType: 1,
      attributeValue,
      status: 1,
    };

    const updatedOriginal = {
      ...originalRow,
      attribute: [...(originalRow.attribute || []), newAttribute],
    };

    // Update properties
    const updatedProperties = {
      ...feature.properties,
      [attributeKey]: attributeValue,
    };

    return {
      ...feature,
      properties: updatedProperties,
      original: updatedOriginal,
    };
  }
}
