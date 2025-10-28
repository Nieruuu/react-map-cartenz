/**
 * Test utility for the export function
 * This helps verify that API attributes are correctly flattened for export
 */

import type { SpatialFeatureAttribute } from './api/spatialFeature';

/**
 * Test data that simulates API feature attributes
 */
export const testApiAttributes: SpatialFeatureAttribute[] = [
  {
    id: 1,
    dataType: 1,
    rowIdentifier: 123,
    groupIdentifier: null,
    attributeIndex: 0,
    attributeKey: 'spatialFeature.type',
    attributeLabel: 'Type',
    attributeValue: '20000006',
    attributeValueType: 1,
    status: 1,
  },
  {
    id: 2,
    dataType: 1,
    rowIdentifier: 123,
    groupIdentifier: null,
    attributeIndex: 1,
    attributeKey: 'spatialFeature.refWilayah',
    attributeLabel: 'Ref Wilayah',
    attributeValue: 'TPS Cengkareng123',
    attributeValueType: 1,
    status: 1,
  },
  {
    id: 3,
    dataType: 1,
    rowIdentifier: 123,
    groupIdentifier: null,
    attributeIndex: 2,
    attributeKey: 'spatialFeature.banyak',
    attributeLabel: 'spatialFeature.banyak',
    attributeValue: '123',
    attributeValueType: 1,
    status: 1,
  },
];

/**
 * Simulates the attribute flattening logic from the export function
 */
export function flattenApiAttributes(attributes: SpatialFeatureAttribute[]): Record<string, unknown> {
  const flatProps: Record<string, unknown> = {};
  
  // Process each attribute from the API response
  attributes.forEach((attr) => {
    if (attr && typeof attr === 'object' && attr.attributeKey && attr.attributeValue !== undefined) {
      // For standard attributes, use attributeLabel as the key if it's different from attributeKey
      // For custom attributes where attributeLabel equals attributeKey, use attributeValue as both key and value
      if (attr.attributeLabel && attr.attributeLabel !== attr.attributeKey) {
        // Standard attribute: use attributeLabel as the key
        flatProps[attr.attributeLabel] = attr.attributeValue;
      } else {
        // Custom attribute: use attributeKey as the key
        flatProps[attr.attributeKey] = attr.attributeValue;
      }
    }
  });
  
  return flatProps;
}

/**
 * Test function to verify attribute flattening
 */
export function testAttributeFlattening(): void {
  console.log('=== Testing API Attribute Flattening ===');
  
  const flattened = flattenApiAttributes(testApiAttributes);
  
  console.log('Original attributes:', testApiAttributes);
  console.log('Flattened attributes:', flattened);
  
  // Verify expected results
  const expectedResults = {
    'Type': '20000006',
    'Ref Wilayah': 'TPS Cengkareng123',
    'spatialFeature.banyak': '123',
  };
  
  let allTestsPassed = true;
  
  for (const [key, expectedValue] of Object.entries(expectedResults)) {
    if (flattened[key] !== expectedValue) {
      console.error(`❌ Test failed for key "${key}": expected "${expectedValue}", got "${flattened[key]}"`);
      allTestsPassed = false;
    } else {
      console.log(`✅ Test passed for key "${key}": "${flattened[key]}"`);
    }
  }
  
  if (allTestsPassed) {
    console.log('🎉 All attribute flattening tests passed!');
  } else {
    console.log('❌ Some tests failed. Check the output above.');
  }
}

/**
 * Test function to simulate the full export process
 */
export function testExportProcess(): void {
  console.log('=== Testing Full Export Process ===');
  
  // Simulate a feature with _rawAttributes
  const mockFeature = {
    id: '123',
    name: 'Test Feature',
    _rawAttributes: testApiAttributes,
    // Other properties
    customProperty: 'test value',
  };
  
  console.log('Mock feature:', mockFeature);
  
  // Simulate the processing logic from buildFeatureCollectionFromLayer
  let processedProps: Record<string, unknown> = { ...mockFeature };
  
  // Handle _rawAttributes from API features
  if (processedProps._rawAttributes && Array.isArray(processedProps._rawAttributes)) {
    const flatProps = flattenApiAttributes(processedProps._rawAttributes);
    
    // Merge the flattened attributes with existing properties
    delete processedProps._rawAttributes; // Remove the raw attributes array
    processedProps = { ...flatProps, ...processedProps };
  }
  
  console.log('Processed properties for export:', processedProps);
  
  // Verify that the flattened attributes are present
  const expectedAttributes = ['Type', 'Ref Wilayah', 'spatialFeature.banyak'];
  let allAttributesPresent = true;
  
  for (const attr of expectedAttributes) {
    if (!(attr in processedProps)) {
      console.error(`❌ Missing attribute "${attr}" in processed properties`);
      allAttributesPresent = false;
    } else {
      console.log(`✅ Attribute "${attr}" present: "${processedProps[attr]}"`);
    }
  }
  
  if (allAttributesPresent) {
    console.log('🎉 All attributes are correctly processed for export!');
  } else {
    console.log('❌ Some attributes are missing. Check the output above.');
  }
}

// Export a function to run all tests
export function runAllExportTests(): void {
  testAttributeFlattening();
  console.log('\n');
  testExportProcess();
}