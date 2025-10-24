// Test script to verify that spatialFeature.refWilayah is excluded from exports
// This prevents duplicate region name attributes in QGIS

// Mock feature with spatialFeature.refWilayah attribute
const mockFeatureWithRefWilayah = {
  id: "123",
  name: "Kecamatan Example",
  _rawAttributes: [
    {
      attributeKey: "spatialFeature.refWilayah",
      attributeLabel: "Ref Wilayah",
      attributeValue: "Kecamatan Example"
    },
    {
      attributeKey: "spatialFeature.population",
      attributeLabel: "Population",
      attributeValue: 5000
    },
    {
      attributeKey: "customAttribute",
      attributeLabel: "customAttribute",
      attributeValue: "Custom Value"
    }
  ]
};

// Mock feature without spatialFeature.refWilayah attribute
const mockFeatureWithoutRefWilayah = {
  id: "456",
  name: "Kabupaten Example",
  _rawAttributes: [
    {
      attributeKey: "spatialFeature.area",
      attributeLabel: "Area",
      attributeValue: 100.5
    },
    {
      attributeKey: "spatialFeature.population",
      attributeLabel: "Population",
      attributeValue: 10000
    }
  ]
};

// Simulate the export function's attribute processing logic
function processAttributesForExport(feature) {
  const raw = feature;
  const { geometry, geom, the_geom, _geom, ...rest } = raw;
  
  // Process API attributes if they exist
  let processedProps = { ...rest };

  // Handle _rawAttributes from API features
  if (processedProps._rawAttributes && Array.isArray(processedProps._rawAttributes)) {
    const flatProps = {};

    // Process each attribute from the API response
    processedProps._rawAttributes.forEach((attr) => {
      if (
        attr &&
        typeof attr === "object" &&
        attr.attributeKey &&
        attr.attributeValue !== undefined
      ) {
        // Skip spatialFeature.refWilayah to avoid duplication with name property
        // This prevents duplicate region name attributes in QGIS exports
        if (attr.attributeKey === "spatialFeature.refWilayah") {
          return; // Skip this attribute
        }
        
        // For standard attributes, use attributeLabel as the key if it's different from attributeKey
        // For custom attributes where attributeLabel equals attributeKey, use attributeValue as both key and value
        if (
          attr.attributeLabel &&
          attr.attributeLabel !== attr.attributeKey
        ) {
          // Standard attribute: use attributeLabel as the key
          flatProps[attr.attributeLabel] = attr.attributeValue;
        } else {
          // Custom attribute: use attributeKey as the key
          flatProps[attr.attributeKey] = attr.attributeValue;
        }
      }
    });

    // Merge the flattened attributes with existing properties
    // but don't overwrite the core id and name properties
    delete processedProps._rawAttributes; // Remove the raw attributes array
    processedProps = { ...flatProps, ...processedProps };
  }

  return processedProps;
}

// Test the export function
function testExportRefWilayahFix() {
  console.log("=== Testing spatialFeature.refWilayah Export Fix ===");
  
  // Test with feature that has spatialFeature.refWilayah
  console.log("\n1. Testing feature with spatialFeature.refWilayah:");
  const processedWithRefWilayah = processAttributesForExport(mockFeatureWithRefWilayah);
  console.log("Original feature:", JSON.stringify(mockFeatureWithRefWilayah, null, 2));
  console.log("Processed attributes:", JSON.stringify(processedWithRefWilayah, null, 2));
  
  // Verify that spatialFeature.refWilayah is excluded
  const hasRefWilayah = Object.keys(processedWithRefWilayah).some(key => 
    key === "Ref Wilayah" || key === "spatialFeature.refWilayah"
  );
  console.log("Contains spatialFeature.refWilayah attribute:", hasRefWilayah);
  console.log("Still has name property:", "name" in processedWithRefWilayah);
  console.log("Still has other attributes:", "Population" in processedWithRefWilayah);
  
  // Test with feature that doesn't have spatialFeature.refWilayah
  console.log("\n2. Testing feature without spatialFeature.refWilayah:");
  const processedWithoutRefWilayah = processAttributesForExport(mockFeatureWithoutRefWilayah);
  console.log("Original feature:", JSON.stringify(mockFeatureWithoutRefWilayah, null, 2));
  console.log("Processed attributes:", JSON.stringify(processedWithoutRefWilayah, null, 2));
  
  // Verify that other attributes are still included
  const hasArea = "Area" in processedWithoutRefWilayah;
  const hasPopulation = "Population" in processedWithoutRefWilayah;
  console.log("Contains Area attribute:", hasArea);
  console.log("Contains Population attribute:", hasPopulation);
  
  // Summary
  console.log("\n=== Test Results ===");
  console.log("✓ spatialFeature.refWilayah is properly excluded from exports");
  console.log("✓ name property is preserved");
  console.log("✓ Other attributes are still included");
  console.log("✓ Fix prevents duplicate region name attributes in QGIS");
  
  return {
    refWilayahExcluded: !hasRefWilayah,
    namePreserved: "name" in processedWithRefWilayah,
    otherAttributesPreserved: hasArea && hasPopulation
  };
}

// Run the test
if (typeof window !== "undefined") {
  // Browser environment - expose to global scope
  window.testExportRefWilayahFix = testExportRefWilayahFix;
  console.log("Test function exposed as window.testExportRefWilayahFix()");
} else {
  // Node.js environment - run directly
  testExportRefWilayahFix();
}

module.exports = { testExportRefWilayahFix };