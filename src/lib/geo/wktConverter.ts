/**
 * Robust WKT to OpenLayers feature conversion with proper coordinate system transformations
 * Enhanced error handling and debugging capabilities
 */

import WKT from "ol/format/WKT";
import type Geometry from "ol/geom/Geometry";
import Feature from "ol/Feature";

export interface WKTConversionOptions {
  dataProjection?: string;
  featureProjection?: string;
  strictValidation?: boolean;
  logErrors?: boolean;
  sanitizeGeometry?: boolean;
}

export interface ConversionResult {
  feature: Feature<Geometry> | null;
  success: boolean;
  errors: string[];
  warnings: string[];
  originalWKT: string;
  cleanedWKT: string;
  geometryType?: string;
}

export interface ConversionStats {
  total: number;
  successful: number;
  failed: number;
  geometryTypes: Record<string, number>;
  commonErrors: Record<string, number>;
}

const wktReader = new WKT();

/**
 * Clean and sanitize WKT strings to handle common formatting issues
 */
export function sanitizeWKT(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    // Fix weird coordinate separators like "107.26+-7.01" -> "107.26 -7.01"
    .replace(/\+\-/g, " -")
    .replace(/\+\-\-/g, " -")
    .replace(/\+\s*/g, " ")
    
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim()
    
    // Fix common coordinate format issues
    .replace(/(\d+)\s+(\d+)\s+(\d+)/g, "$1 $2 $3") // Ensure space between coordinate groups
    .replace(/(\d+)\.(\d+)\s+(\d+)\.(\d+)/g, "$1.$2 $3.$4") // Fix decimal coordinates
    
    // Remove trailing commas and semicolons
    .replace(/[,;]\s*$/, "")
    
    // Ensure proper parentheses matching
    .replace(/\(\s*\)/g, "()")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

/**
 * Validate WKT string structure
 */
export function validateWKT(wkt: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!wkt || wkt.trim() === '') {
    errors.push('WKT string is empty');
    return { isValid: false, errors };
  }

  const upperWKT = wkt.toUpperCase().trim();
  
  // Check for valid WKT type prefix
  const validTypes = ['POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'];
  const hasValidType = validTypes.some(type => upperWKT.startsWith(type));
  
  if (!hasValidType) {
    errors.push(`Invalid WKT type. Must start with one of: ${validTypes.join(', ')}`);
  }

  // Basic parenthesis validation
  const openParens = (wkt.match(/\(/g) || []).length;
  const closeParens = (wkt.match(/\)/g) || []).length;
  
  if (openParens !== closeParens) {
    errors.push(`Unmatched parentheses: ${openParens} opening, ${closeParens} closing`);
  }

  // Check for coordinate patterns
  const coordPattern = /\d+\.\d+\s+\d+\.\d+/g;
  const coordinates = wkt.match(coordPattern);
  
  if (!coordinates || coordinates.length === 0) {
    errors.push('No valid coordinate patterns found');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Convert WKT string to OpenLayers Feature with comprehensive error handling
 */
export function convertWKTToFeature(
  wkt: string,
  properties: Record<string, any> = {},
  options: WKTConversionOptions = {}
): ConversionResult {
  const opts = {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    strictValidation: false,
    logErrors: true,
    sanitizeGeometry: true,
    ...options,
  };

  const result: ConversionResult = {
    feature: null,
    success: false,
    errors: [],
    warnings: [],
    originalWKT: wkt,
    cleanedWKT: wkt,
  };

  try {
    // Step 1: Basic validation
    if (!wkt || typeof wkt !== 'string') {
      result.errors.push('WKT input must be a non-empty string');
      return result;
    }

    // Step 2: Sanitize WKT
    if (opts.sanitizeGeometry) {
      result.cleanedWKT = sanitizeWKT(wkt);
      if (result.cleanedWKT !== wkt) {
        result.warnings.push('WKT string was sanitized during conversion');
      }
    }

    // Step 3: Validate structure
    if (opts.strictValidation) {
      const validation = validateWKT(result.cleanedWKT);
      if (!validation.isValid) {
        result.errors.push(...validation.errors);
        return result;
      }
    }

    // Step 4: Attempt geometry conversion
    let geometry: Geometry | null = null;
    let geometryType: string | undefined;

    try {
      geometry = wktReader.readGeometry(result.cleanedWKT, {
        dataProjection: opts.dataProjection,
        featureProjection: opts.featureProjection,
      });

      geometryType = geometry.getType();
      result.geometryType = geometryType;

      // Additional geometry validation
      if (geometry.getExtent().every(val => val === 0)) {
        result.errors.push('Converted geometry appears to be empty');
        return result;
      }

      // Check for valid bounds
      const extent = geometry.getExtent();
      if (!isFinite(extent[0]) || !isFinite(extent[1]) || 
          !isFinite(extent[2]) || !isFinite(extent[3])) {
        result.errors.push('Geometry has invalid bounds (contains NaN or Infinity)');
        return result;
      }

    } catch (geomError) {
      result.errors.push(`Geometry conversion failed: ${geomError}`);
      
      if (opts.logErrors) {
        console.error('WKT Geometry Conversion Error:', {
          originalWKT: wkt,
          cleanedWKT: result.cleanedWKT,
          error: geomError,
        });
      }
      
      return result;
    }

    // Step 5: Create feature
    const feature = new Feature<Geometry>(geometry);
    
    // Set properties
    Object.entries(properties).forEach(([key, value]) => {
      feature.set(key, value);
    });

    // Set metadata
    feature.set('_wktOriginal', wkt);
    feature.set('_wktCleaned', result.cleanedWKT);
    feature.set('_geometryType', geometryType);

    result.feature = feature;
    result.success = true;

  } catch (error) {
    result.errors.push(`Unexpected error during WKT conversion: ${error}`);
    
    if (opts.logErrors) {
      console.error('Unexpected WKT Conversion Error:', {
        wkt,
        error,
        options: opts,
      });
    }
  }

  return result;
}

/**
 * Batch convert multiple WKT strings
 */
export function convertWKTBatch(
  wktList: Array<{ wkt: string; properties?: Record<string, any> }>,
  options: WKTConversionOptions = {}
): { results: ConversionResult[]; stats: ConversionStats } {
  const results: ConversionResult[] = [];
  const stats: ConversionStats = {
    total: wktList.length,
    successful: 0,
    failed: 0,
    geometryTypes: {},
    commonErrors: {},
  };

  wktList.forEach(({ wkt, properties = {} }) => {
    const result = convertWKTToFeature(wkt, properties, options);
    results.push(result);

    if (result.success) {
      stats.successful++;
      if (result.geometryType) {
        stats.geometryTypes[result.geometryType] = (stats.geometryTypes[result.geometryType] || 0) + 1;
      }
    } else {
      stats.failed++;
      result.errors.forEach(error => {
        stats.commonErrors[error] = (stats.commonErrors[error] || 0) + 1;
      });
    }
  });

  return { results, stats };
}

/**
 * Create a human-readable summary of conversion results
 */
export function createConversionSummary(stats: ConversionStats): string {
  const successRate = ((stats.successful / stats.total) * 100).toFixed(1);
  const typeInfo = Object.entries(stats.geometryTypes)
    .map(([type, count]) => `${count} ${type.toLowerCase()}(s)`)
    .join(', ');

  let summary = `${stats.successful}/${stats.total} (${successRate}%) successful`;
  
  if (typeInfo) {
    summary += ` - ${typeInfo}`;
  }

  if (stats.failed > 0) {
    const errorCount = Object.keys(stats.commonErrors).length;
    summary += ` - ${stats.failed} failed with ${errorCount} error type(s)`;
  }

  return summary;
}

/**
 * Get geometry bounds in WGS84 coordinates
 */
/**
 * Get geometry bounds in WGS84 coordinates
 */
export function getGeometryBoundsWGS84(feature: Feature<Geometry>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  try {
    const geometry = feature.getGeometry();
    if (!geometry) return null;

    // Transform to WGS84 if needed
    const wgs84Geom = geometry.clone().transform('EPSG:3857', 'EPSG:4326');
    const extent = wgs84Geom.getExtent();

    return {
      minX: extent[0],
      minY: extent[1],
      maxX: extent[2],
      maxY: extent[3],
    };
  } catch {
    return null;
  }
}

/**
 * Check if geometry is within specified bounds
 */
export function isGeometryInBounds(
  feature: Feature<Geometry>,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  const geomBounds = getGeometryBoundsWGS84(feature);
  if (!geomBounds) return false;

  return !(
    geomBounds.maxX < bounds.minX ||
    geomBounds.minX > bounds.maxX ||
    geomBounds.maxY < bounds.minY ||
    geomBounds.minY > bounds.maxY
  );
}

/**
 * Export utility function for backward compatibility
 */
export const wktToFeature = (
  wkt: string, 
  properties?: Record<string, any>
): Feature<Geometry> | null => {
  const result = convertWKTToFeature(wkt, properties);
  return result.success ? result.feature : null;
};