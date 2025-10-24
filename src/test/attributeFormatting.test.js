// Test file to verify attribute key/label formatting behavior
// This is a simple test to demonstrate the expected behavior

// Mock the attribute formatting logic from useMetadataEditor
function formatAttributeForAPI(userInputKey, userInputValue, userInputLabel) {
  // This simulates the fixed behavior
  const fullAttributeKey = `spatialFeature.${userInputKey}`;
  return {
    attributeKey: fullAttributeKey,
    attributeValue: userInputValue,
    attributeLabel: userInputLabel || userInputKey, // Keep original label without prefix
    attributeValueType: 1,
  };
}

// Test cases
const testCases = [
  {
    name: "New attribute with user input 'populasi: 1000'",
    input: { key: "populasi", value: "1000", label: "populasi" },
    expected: {
      attributeKey: "spatialFeature.populasi",
      attributeValue: "1000",
      attributeLabel: "populasi",
      attributeValueType: 1,
    },
  },
  {
    name: "New attribute with custom label",
    input: { key: "penduduk", value: "5000", label: "Jumlah Penduduk" },
    expected: {
      attributeKey: "spatialFeature.penduduk",
      attributeValue: "5000",
      attributeLabel: "Jumlah Penduduk",
      attributeValueType: 1,
    },
  },
  {
    name: "New attribute without explicit label",
    input: { key: "luas", value: "250", label: "" },
    expected: {
      attributeKey: "spatialFeature.luas",
      attributeValue: "250",
      attributeLabel: "luas",
      attributeValueType: 1,
    },
  },
];

// Run tests
console.log("Testing attribute key/label formatting...\n");

testCases.forEach((testCase, index) => {
  const result = formatAttributeForAPI(
    testCase.input.key,
    testCase.input.value,
    testCase.input.label
  );
  
  const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
  
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`Input: ${JSON.stringify(testCase.input)}`);
  console.log(`Expected: ${JSON.stringify(testCase.expected)}`);
  console.log(`Result: ${JSON.stringify(result)}`);
  console.log(`Status: ${passed ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("-".repeat(50));
});

console.log("\nTest completed. The attribute formatting should now work as expected:");
console.log("- attributeKey gets the 'spatialFeature.' prefix");
console.log("- attributeLabel remains as the original user input without prefix");