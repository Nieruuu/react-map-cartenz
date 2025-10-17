# Spatial Feature API Implementation

## Overview
This implementation updates the Tax Map React application to use the correct spatial feature API response structure as specified in the requirements.

## Changes Made

### 1. Created `src/lib/api/spatialFeature.ts`
New API module that handles the spatial feature endpoint with the correct response structure:

- **SpatialFeatureAttribute**: Defines the attribute structure with `id`, `attributeKey`, `attributeLabel`, `attributeValue`, and `attributeValueType`
- **SpatialFeature**: Defines the feature object with `id` (used as region code), `systemId`, `type`, `identifier`, `label`, `value`, `status`, and `attribute` array
- **SpatialFeatureListResponse**: Defines the pagination response with `total`, `pageNumber`, `pageSize`, and `data` array
- **listSpatialFeatures()**: Main API function that calls `/spatial-feature` endpoint with required filters
- **Helper functions**: For extracting attributes, grouping features by type, and getting layer names

### 2. Updated `src/lib/api/transformers.ts`
Enhanced the data transformation utilities to handle both legacy and new spatial feature formats:

- **extractSpatialFeatureAttribute()**: New function to extract attributes from SpatialFeature format
- **transformSpatialFeature()**: New function to transform SpatialFeature objects
- **transformSpatialFeatures()**: New function to transform arrays of SpatialFeature objects
- **addAttributeToTransformedFeature()**: New function for metadata editor functionality

### 3. Updated `src/features/loadFromApi.ts`
Modified the layer loading logic to use the correct API and layer grouping:

- **addApiLayer()**: Updated to use `listSpatialFeatures()` and correct attribute extraction
- **addApiLayersByType()**: New function that groups features by type code and creates separate layers
- **Correct ID/Name usage**: Uses `id` field as unique region code and `spatialFeature.refWilayah` as region name

### 4. Updated `src/components/api/SmartGovLoader.tsx`
Updated the UI component to use the new API functions:

- Uses `listSpatialFeatures()` instead of `listSpatialGeneric()`
- Uses `transformSpatialFeatures()` instead of `transformSpatialRows()`
- Uses `addApiLayersByType()` for proper layer grouping

## Key Features Implemented

### Correct API Response Structure
- Uses the correct endpoint: `https://retfw.smartgov.id/framework/spatial-feature`
- Applies required filter: `?filter[]=status|eq|1&include[]=attribute`
- Only returns features with status = 1 (active)
- Excludes features with status = 2 (inactive)

### Proper Attribute Handling
- Each feature object contains an `attribute` array with the correct structure
- Supports dynamic attribute addition through the metadata editor
- Preserves all attribute properties: `id`, `attributeKey`, `attributeLabel`, `attributeValue`, `attributeValueType`

### Layer Grouping Logic
- Features with `attributeKey = "spatialFeature.type"` and `attributeValue = "20000001"` belong to the same layer
- Uses `attributeValue` from `spatialFeature.refWilayah` as the layer name
- Features with different `spatialFeature.type` values form separate layers
- Each layer can contain multiple features with the same type value

### ID and Name Usage
- Uses the `id` field as the unique region code
- Uses the `attributeValue` from `spatialFeature.refWilayah` as the region name
- Ensures all features with the same `spatialFeature.type` value are loaded into the same layer

## Dynamic Attribute Implementation
When a user adds metadata through the FocusCard metadata editor:
- The system appends a new attribute block inside the attribute array
- The new block follows the same structure as existing attributes
- The value of `attributeValue` matches the user's input

## Testing
- TypeScript compilation passes without errors
- All imports and exports are correctly configured
- The implementation follows the specified JSON response structure
- Layer grouping logic works as specified

## Usage
The implementation is backward compatible and doesn't break existing functionality. The new spatial feature API can be used through the SmartGovLoader component in the UI.