import { listSpatialFeatures, type SpatialFeature } from '../lib/api/spatialFeature';
import { wktToFeature } from '../lib/geo/wktConverter';
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
}) {
  const resp = await listSpatialFeatures({
    pageNumber: opts.pageNumber ?? 1,
    pageSize: opts.pageSize ?? 50,
    include: ['attribute'],
    filters: opts.filters,
  });

  const source = new VectorSource();
  let count = 0;

  for (const feature of resp.data || []) {
    // Extract geometry using the new spatial feature format
    const wkt = feature.attribute?.find(a => a.attributeKey === 'spatialFeature.geometry')?.attributeValue;
    if (!wkt) continue;
    
    // Use attributeValue from spatialFeature.refWilayah as the region name
    const name = feature.attribute?.find(a => a.attributeKey === 'spatialFeature.refWilayah')?.attributeValue || `Feature ${feature.id}`;
    
    // Use id field as the unique region code
    const regionCode = feature.id;
    
    // Get type code from spatialFeature.type
    const typeCode = feature.attribute?.find(a => a.attributeKey === 'spatialFeature.type')?.attributeValue || '';
    
    // Build properties object
    const properties: Record<string, any> = {
      id: regionCode, // Use id field as the unique region code
      name: name, // Use attributeValue from spatialFeature.refWilayah as the region name
      uuid: feature.value,
      typeCode: typeCode,
      identifier: feature.identifier,
      label: feature.label,
      status: feature.status,
      description: feature.description,
      createdBy: feature.createdBy,
      createdAt: feature.createdAt,
      updatedBy: feature.updatedBy,
      updatedAt: feature.updatedAt,
    };
    
    // Flatten extra attributes (non spatialFeature.*)
    (feature.attribute || []).forEach((a: any) => {
      if (!/^spatialFeature\./.test(a.attributeKey)) {
        properties[a.attributeKey] = a.attributeValue;
      }
    });
    
    const olFeature = wktToFeature(wkt, properties);
    if (!olFeature) continue;
    
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

    for (const feature of features) {
      // Extract geometry using the new spatial feature format
      const wkt = feature.attribute?.find(a => a.attributeKey === 'spatialFeature.geometry')?.attributeValue;
      if (!wkt) continue;
      
      // Use attributeValue from spatialFeature.refWilayah as the region name
      const name = feature.attribute?.find(a => a.attributeKey === 'spatialFeature.refWilayah')?.attributeValue || `Feature ${feature.id}`;
      
      // Use id field as the unique region code
      const regionCode = feature.id;
      
      // Build properties object
      const properties: Record<string, any> = {
        id: regionCode, // Use id field as the unique region code
        name: name, // Use attributeValue from spatialFeature.refWilayah as the region name
        uuid: feature.value,
        typeCode: typeCode,
        identifier: feature.identifier,
        label: feature.label,
        status: feature.status,
        description: feature.description,
        createdBy: feature.createdBy,
        createdAt: feature.createdAt,
        updatedBy: feature.updatedBy,
        updatedAt: feature.updatedAt,
      };
      
      // Flatten extra attributes (non spatialFeature.*)
      (feature.attribute || []).forEach((a: any) => {
        if (!/^spatialFeature\./.test(a.attributeKey)) {
          properties[a.attributeKey] = a.attributeValue;
        }
      });
      
      const olFeature = wktToFeature(wkt, properties);
      if (!olFeature) continue;
      
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
 * Get human-readable name for layer type
 */
function getLayerNameForType(typeCode: string): string {
  // Return the type code directly as requested
  return typeCode;
}