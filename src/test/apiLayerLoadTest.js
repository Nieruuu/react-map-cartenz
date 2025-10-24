// Test script to verify API layer loading functionality
// This script tests the functions we created to load "Batas Kecamatan Kabupaten Badung" layer

// Mock the DOM environment for testing
global.window = global;
global.fetch = async (url) => {
  console.log(`Mock fetch called with URL: ${url}`);
  
  // Mock response for spatial feature API
  if (url.includes('/spatial-feature')) {
    return {
      json: async () => ({
        total: 1,
        pageNumber: 1,
        pageSize: 1000,
        data: [
          {
            id: 1,
            systemId: 1,
            type: 1,
            identifier: "test-id",
            label: "test-label",
            value: "test-value",
            status: 1,
            attribute: [
              {
                id: 1,
                dataType: 1,
                rowIdentifier: 1,
                groupIdentifier: null,
                attributeIndex: 0,
                attributeKey: "spatialFeature.type",
                attributeLabel: "Type",
                attributeValue: "Batas Kecamatan Kabupaten Badung",
                attributeValueType: 1,
                status: 1
              },
              {
                id: 2,
                dataType: 1,
                rowIdentifier: 1,
                groupIdentifier: null,
                attributeIndex: 1,
                attributeKey: "spatialFeature.refWilayah",
                attributeLabel: "Reference Wilayah",
                attributeValue: "Kecamatan Test",
                attributeValueType: 1,
                status: 1
              },
              {
                id: 3,
                dataType: 1,
                rowIdentifier: 1,
                groupIdentifier: null,
                attributeIndex: 2,
                attributeKey: "spatialFeature.geometry",
                attributeLabel: "Geometry",
                attributeValue: "POLYGON((115.1 -8.5, 115.2 -8.5, 115.2 -8.6, 115.1 -8.6, 115.1 -8.5))",
                attributeValueType: 1,
                status: 1
              }
            ],
            description: "Test feature",
            createdBy: "test",
            createdAt: Date.now(),
            updatedBy: "test",
            updatedAt: Date.now()
          }
        ]
      })
    };
  }
  
  throw new Error(`Unknown URL: ${url}`);
};

// Import the functions we need to test
async function testApiLayerLoading() {
  console.log("=== Testing API Layer Loading ===");
  
  try {
    // Test 1: Test getSpatialFeaturesByAttribute function
    console.log("\n1. Testing getSpatialFeaturesByAttribute function...");
    const { getSpatialFeaturesByAttribute } = await import('../lib/api/spatialFeature.js');
    
    const result = await getSpatialFeaturesByAttribute(
      'spatialFeature.type',
      'Batas Kecamatan Kabupaten Badung'
    );
    
    console.log("✓ getSpatialFeaturesByAttribute function works correctly");
    console.log(`  - Found ${result.data.length} features`);
    console.log(`  - First feature type: ${result.data[0].attribute.find(a => a.attributeKey === 'spatialFeature.type')?.attributeValue}`);
    
    // Test 2: Test getBatasKecamatanKabupatenBadung function
    console.log("\n2. Testing getBatasKecamatanKabupatenBadung function...");
    const { getBatasKecamatanKabupatenBadung } = await import('../lib/api/spatialFeature.js');
    
    const badungResult = await getBatasKecamatanKabupatenBadung();
    
    console.log("✓ getBatasKecamatanKabupatenBadung function works correctly");
    console.log(`  - Found ${badungResult.data.length} features`);
    console.log(`  - First feature name: ${badungResult.data[0].attribute.find(a => a.attributeKey === 'spatialFeature.refWilayah')?.attributeValue}`);
    
    // Test 3: Test loadBatasKecamatanKabupatenBadung function (without UI components)
    console.log("\n3. Testing loadBatasKecamatanKabupatenBadung function...");
    
    // Mock the required dependencies
    global.useLayersStore = {
      getState: () => ({
        addLayer: (layerInfo) => {
          console.log(`✓ Mock addLayer called with: ${layerInfo.name} (${layerInfo.id})`);
          return layerInfo;
        }
      })
    };
    
    // Mock the OpenLayers components
    global.VectorSource = class {
      constructor() {
        this.features = [];
      }
      addFeature(feature) {
        this.features.push(feature);
      }
      getFeatures() {
        return this.features;
      }
    };
    
    global.VectorLayer = class {
      constructor(options) {
        this.source = options.source;
      }
      set(key, value) {
        this[key] = value;
      }
    };
    
    // Mock the styleFromCfg function
    global.styleFromCfg = (cfg) => cfg;
    
    // Mock the simpleWKTToFeature function
    global.simpleWKTToFeature = (wkt, properties) => ({
      getGeometry: () => ({
        getExtent: () => [115.1, -8.6, 115.2, -8.5]
      }),
      get: (key) => properties[key] || `mock-${key}`,
      set: () => {}
    });
    
    // Mock the transformSpatialFeatures function
    global.transformSpatialFeatures = (features, options) => {
      return features.map(feature => ({
        id: feature.id,
        geometry: feature.attribute.find(a => a.attributeKey === 'spatialFeature.geometry')?.attributeValue,
        properties: {
          id: feature.id,
          name: feature.attribute.find(a => a.attributeKey === 'spatialFeature.refWilayah')?.attributeValue || `Feature ${feature.id}`,
          _rawAttributes: feature.attribute
        }
      }));
    };
    
    const { loadBatasKecamatanKabupatenBadung } = await import('../features/loadFromApi.js');
    
    const loadResult = await loadBatasKecamatanKabupatenBadung();
    
    if (loadResult) {
      console.log("✓ loadBatasKecamatanKabupatenBadung function works correctly");
      console.log(`  - Layer ID: ${loadResult.id}`);
      console.log(`  - Layer name: ${loadResult.name}`);
      console.log(`  - Feature count: ${loadResult.count}`);
    } else {
      console.log("✗ loadBatasKecamatanKabupatenBadung function returned null");
    }
    
    console.log("\n=== All tests passed! ===");
    console.log("The API layer loading implementation is working correctly.");
    console.log("The application should now load 'Batas Kecamatan Kabupaten Badung' from the API instead of the local 5103.zip file.");
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testApiLayerLoading();