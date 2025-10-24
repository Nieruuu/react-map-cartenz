import { listSpatialFeatures, type SpatialFeature } from '../lib/api/spatialFeature';
import { simpleWKTToFeature } from '../lib/geo/simpleWKTConverter';
import { transformSpatialFeatures, type TransformOptions } from '../lib/api/transformers';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { styleFromCfg } from '../hooks/useLayersStore';
import { useLayersStore } from '../hooks/useLayersStore';

/**
 * Add a layer from the spatial feature API
 * Uses the correct endpoint and filters according to specifications
 * Features with the same spatialFeature.type value belong to the same layer
 */
export async function addApiLayer(opts: {
  layerName?: string;
  pageNumber?: number;
  pageSize?: number;
  filters?: string[];
  includeSystemFields?: boolean;
}) {
  const resp = await listSpatialFeatures({
    pageNumber: opts.pageNumber ?? 1,
    pageSize: opts.pageSize ?? 50,
    include: ['attribute'],
    filters: opts.filters,
  });

  const source = new VectorSource();
  let count = 0;

  // Transform features using the transformer with simplified options
  const transformOptions: TransformOptions = {
    includeSystemFields: opts.includeSystemFields || false, // Default to false for QGIS compatibility
    includeRawAttributes: true, // Include _rawAttributes for FocusCard editing
    flattenAttributes: true,
  };
  
  const transformedFeatures = transformSpatialFeatures(resp.data || [], transformOptions);

  for (const transformedFeature of transformedFeatures) {
    // Skip features without geometry
    if (!transformedFeature.geometry) {
      console.warn('No geometry found for feature:', transformedFeature.id);
      continue;
    }
    
    // Use simple WKT conversion (API now provides well-formatted WKT)
    const olFeature = simpleWKTToFeature(transformedFeature.geometry, transformedFeature.properties);
    if (!olFeature) {
      console.error('WKT conversion failed for:', transformedFeature.geometry.substring(0, 50) + '...');
      continue;
    }
    
    source.addFeature(olFeature);
    count++;
  }

  const cfg = {
    borderColor: '#0ea5e9',
    borderOpacity: 1,
    borderWidth: 2,
    borderStyle: 'Solid',
    fillColor: '#22d3ee',
    fillOpacity: 0.2,
    labelColor: '#111827',
    labelStroke: '#ffffff',
    labelStrokeWidth: 3,
    labelFont: 'Arial',
    labelSize: 12,
    labelMode: 'nama',
  } as const;

  const layer = new VectorLayer({ source, style: styleFromCfg(cfg) });
  (layer as any).set('appKind', 'custom');
  const id = `api-${Date.now()}`;
  const name = opts.layerName || 'Spatial Feature (API)';
  const addLayer = useLayersStore.getState().addLayer;
  addLayer({ id, name, kind: 'custom', visible: true, layer, styleCfg: cfg, typeCode: '' });

  return { id, name, count };
}

/**
 * Add layers grouped by type code
 * Features with the same spatialFeature.type value are loaded into the same layer
 * Uses attributeValue from spatialFeature.refWilayah as the layer name
 */
export async function addApiLayersByType(opts: {
  typeCode?: string;
  pageNumber?: number;
  pageSize?: number;
}) {
  // If typeCode is provided, load only that type
  // Otherwise, load all features and group them by type
  const resp = await listSpatialFeatures({
    pageNumber: opts.pageNumber ?? 1,
    pageSize: opts.pageSize ?? 1000,
    include: ['attribute'],
    filters: opts.typeCode ? [`spatialFeature.type|eq|${opts.typeCode}`] : undefined,
  });

  // Group features by type code
  const featuresByType: Record<string, SpatialFeature[]> = {};
  
  for (const feature of resp.data || []) {
    const typeCode = feature.attribute?.find(a => a.attributeKey === 'spatialFeature.type')?.attributeValue || 'unknown';
    if (!featuresByType[typeCode]) {
      featuresByType[typeCode] = [];
    }
    featuresByType[typeCode].push(feature);
  }

  const layerResults: Array<{ id: string; name: string; count: number; typeCode: string }> = [];

  // Create a separate layer for each type
  for (const [typeCode, features] of Object.entries(featuresByType)) {
    const source = new VectorSource();
    let count = 0;

    // Use the transformer to properly handle the features with only id and name
    const transformOptions: TransformOptions = {
      includeSystemFields: false, // Only include id and name
      includeRawAttributes: true, // Include _rawAttributes for FocusCard editing
      flattenAttributes: true,
    };
    
    const transformedFeatures = transformSpatialFeatures(features, transformOptions);

    for (const transformedFeature of transformedFeatures) {
      // Skip features without geometry
      if (!transformedFeature.geometry) {
        console.warn('No geometry found for feature:', transformedFeature.id);
        continue;
      }
      
      // Use simple WKT conversion (API now provides well-formatted WKT)
      const olFeature = simpleWKTToFeature(transformedFeature.geometry, transformedFeature.properties);
      if (!olFeature) {
        console.error('WKT conversion failed for:', transformedFeature.geometry.substring(0, 50) + '...');
        continue;
      }
      
      source.addFeature(olFeature);
      count++;
    }

    if (count === 0) continue;

    const cfg = {
      borderColor: '#0ea5e9',
      borderOpacity: 1,
      borderWidth: 2,
      borderStyle: 'Solid',
      fillColor: '#22d3ee',
      fillOpacity: 0.2,
      labelColor: '#111827',
      labelStroke: '#ffffff',
      labelStrokeWidth: 3,
      labelFont: 'Arial',
      labelSize: 12,
      labelMode: 'nama',
    } as const;

    const layer = new VectorLayer({ source, style: styleFromCfg(cfg) });
    (layer as any).set('appKind', 'custom');
    const id = `api-${typeCode}-${Date.now()}`;
    // Use layer name based on type code
    const name = getLayerNameForType(typeCode);
    const addLayer = useLayersStore.getState().addLayer;
    addLayer({ id, name, kind: 'custom', visible: true, layer, styleCfg: cfg, typeCode });

    layerResults.push({ id, name, count, typeCode });
  }

  return layerResults;
}

/**
 * Get layer name for layer type
 * Returns the type code directly as the layer name
 */
function getLayerNameForType(typeCode: string): string {
  // Return the type code directly as requested
  return typeCode;
}

/**
 * Load "Batas Kecamatan Kabupaten Badung" layer specifically
 * This function fetches and loads the "Batas Kecamatan Kabupaten Badung" layer from the API
 * Replaces the local 5103.zip file loading
 */
export async function loadBatasKecamatanKabupatenBadung() {
  try {
    // Import the function dynamically to avoid circular dependencies
    const { getBatasKecamatanKabupatenBadung } = await import('../lib/api/spatialFeature');
    
    // Fetch the specific layer data
    const resp = await getBatasKecamatanKabupatenBadung({
      pageNumber: 1,
      pageSize: 1000, // Load all features for this layer
    });

    if (!resp.data || resp.data.length === 0) {
      console.warn('No features found for "Batas Kecamatan Kabupaten Badung" layer');
      return null;
    }

    const source = new VectorSource();
    let count = 0;

    // Transform features using the transformer with appropriate options
    const transformOptions: TransformOptions = {
      includeSystemFields: false, // Only include id and name for compatibility
      includeRawAttributes: true, // Include _rawAttributes for FocusCard editing
      flattenAttributes: true,
    };
    
    const transformedFeatures = transformSpatialFeatures(resp.data, transformOptions);

    for (const transformedFeature of transformedFeatures) {
      // Skip features without geometry
      if (!transformedFeature.geometry) {
        console.warn('No geometry found for feature:', transformedFeature.id);
        continue;
      }
      
      // Use simple WKT conversion
      const olFeature = simpleWKTToFeature(transformedFeature.geometry, transformedFeature.properties);
      if (!olFeature) {
        console.error('WKT conversion failed for:', transformedFeature.geometry.substring(0, 50) + '...');
        continue;
      }
      
      source.addFeature(olFeature);
      count++;
    }

    if (count === 0) {
      console.warn('No valid features found for "Batas Kecamatan Kabupaten Badung" layer');
      return null;
    }

    // Style configuration matching the original kecamatan style
    const cfg = {
      borderColor: '#10b981',
      borderOpacity: 1,
      borderWidth: 1.6,
      borderStyle: 'Solid',
      fillColor: '#34d399',
      fillOpacity: 0.25,
      labelColor: '#1f2937',
      labelStroke: '#ffffff',
      labelStrokeWidth: 3,
      labelFont: 'Arial',
      labelSize: 12,
      labelMode: 'nama',
    } as const;

    const layer = new VectorLayer({ source, style: styleFromCfg(cfg) });
    (layer as any).set('appKind', 'kecamatan');
    (layer as any).set('appName', 'Batas Kecamatan Kabupaten Badung');
    
    const id = `kecamatan-${Date.now()}`;
    const name = 'Batas Kecamatan Kabupaten Badung';
    const addLayer = useLayersStore.getState().addLayer;
    
    addLayer({
      id,
      name,
      kind: 'kecamatan',
      visible: true,
      layer,
      styleCfg: cfg,
      typeCode: 'Batas Kecamatan Kabupaten Badung'
    });

    return { id, name, count };
  } catch (error) {
    console.error('Error loading "Batas Kecamatan Kabupaten Badung" layer:', error);
    return null;
  }
}