/**
 * Simplified WKT converter using OpenLayers directly
 * Use this when API provides well-formatted WKT strings
 */

import WKT from "ol/format/WKT";
import type Geometry from "ol/geom/Geometry";
import Feature from "ol/Feature";

const wktReader = new WKT();

/**
 * Convert WKT string to OpenLayers Feature using direct OpenLayers WKT reader
 * This is a simplified version that assumes well-formatted WKT input
 */
export function simpleWKTToFeature(
  wkt: string,
  properties: Record<string, unknown> = {}
): Feature<Geometry> | null {
  try {
    // Validate input
    if (!wkt || typeof wkt !== 'string' || wkt.trim() === '') {
      console.warn('Invalid WKT input: empty or not a string');
      return null;
    }

    // Convert WKT to geometry
    const geometry = wktReader.readGeometry(wkt.trim(), {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    // Validate geometry
    if (!geometry) {
      console.warn('Failed to create geometry from WKT:', wkt);
      return null;
    }

    // Check for valid bounds
    const extent = geometry.getExtent();
    if (!isFinite(extent[0]) || !isFinite(extent[1]) || 
        !isFinite(extent[2]) || !isFinite(extent[3])) {
      console.warn('Geometry has invalid bounds:', extent);
      return null;
    }

    // Create feature and set properties
    const feature = new Feature<Geometry>(geometry);
    
    Object.entries(properties).forEach(([key, value]) => {
      feature.set(key, value);
    });

    return feature;
  } catch (error) {
    console.error('WKT conversion failed:', error, 'WKT:', wkt);
    return null;
  }
}

/**
 * Note: The robustWKTToFeature function has been removed since the API
 * now provides well-formatted WKT data. Use simpleWKTToFeature directly.
 */