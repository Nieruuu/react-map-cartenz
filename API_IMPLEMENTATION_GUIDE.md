# API Implementation Guide: Spatial Feature Endpoints

This guide provides a step-by-step approach to implement and debug the spatial-feature API endpoints that are returning HTTP 500 errors.

## Table of Contents

1. [Understanding the Problem](#understanding-the-problem)
2. [Prerequisites](#prerequisites)
3. [Implementation Steps](#implementation-steps)
4. [Error Troubleshooting](#error-troubleshooting)
5. [Integration with LoadAllCheck Component](#integration-with-loadallcheck-component)
6. [Best Practices](#best-practices)

## Understanding the Problem

The spatial-feature endpoints are returning HTTP 500 errors with the following error IDs:
- `8b4ioiao9` - Basic spatial-feature list endpoint
- `8b4ioibad` - Include parameter error
- `8b4ioibih` - Filter parameter error
- `8b4ioibpo` - Pagination error
- `8b4ioic4a` - Spatial feature by ID error
- `8b4ioicad` - Count endpoint error

## Prerequisites

Before starting, ensure you have:

1. ✅ HTTP client (`src/lib/api/client.ts`) with proper authentication
2. ✅ JSON:API query builder (`src/lib/api/qs.ts`)
3. ✅ Spatial Feature API functions (`src/lib/api/spatialFeature.ts`)
4. ✅ API Test Framework (`src/lib/api/testFramework.ts`)
5. ✅ API Test Suite component (`src/dev/ApiTestSuite.tsx`)

## Implementation Steps

### Step 1: Setup the Testing Framework

First, let's add the API Test Suite to your development environment:

```typescript
// In src/components/TaxMap.tsx
import ApiTestSuite from '../dev/ApiTestSuite';

// Add to the dev components section
{import.meta.env.DEV && (
  <>
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 99999 }}>
      <ApiDeepCheck />
    </div>
    <div style={{ position: "fixed", top: 56, right: 12, zIndex: 99999 }}>
      <LoadAllCheck />
    </div>
    <div style={{ position: "fixed", top: 100, right: 12, zIndex: 99999 }}>
      <ApiTestSuite />
    </div>
  </>
)}
```

### Step 2: Test with Mock Mode

Enable mock mode to verify your implementation works with expected data:

1. Open the API Test Suite component
2. Check the "Mock Mode" checkbox
3. Click "Run Full Test Suite"
4. Verify all tests pass with mock data

### Step 3: Test Real API Endpoints

Disable mock mode and test the actual API:

1. Uncheck "Mock Mode"
2. Click "Run Full Test Suite"
3. Identify which endpoints are failing
4. Click on failed tests to see detailed error information

### Step 4: Debug Authentication Issues

If authentication tests fail:

```typescript
// Test authentication manually
import { login } from '../lib/api/auth';

try {
  const authResult = await login();
  console.log('Auth successful:', authResult);
} catch (error) {
  console.error('Auth failed:', error);
}
```

### Step 5: Test Individual Endpoints

Use the quick test buttons to isolate issues:

1. **Auth**: Tests authentication endpoint
2. **List**: Tests basic spatial-feature list
3. **With Include**: Tests include parameter
4. **With Filter**: Tests filter parameter
5. **By ID**: Tests single feature retrieval
6. **Count**: Tests count endpoint

### Step 6: Analyze Error Responses

For each failed endpoint, check:

1. **Status Code**: HTTP status (500 indicates server error)
2. **Error Message**: Detailed error description
3. **Response Time**: Helps identify timeout issues
4. **Request Parameters**: Verify parameters are correctly formatted

## Error Troubleshooting

### Error ID: 8b4ioiao9 (Basic List)

**Symptoms**: Basic spatial-feature list returns 500 error

**Troubleshooting Steps**:
1. Check if the API server is running
2. Verify the endpoint path: `/api/spatial-feature`
3. Check authentication token validity
4. Review server logs for detailed error information
5. Verify the base URL configuration in `src/lib/config.ts`

**Code Fix**:
```typescript
// Verify your client.ts is making correct requests
const response = await get<Paged<SpatialFeatureRow>>('/spatial-feature', {
  'page[number]': '1',
  'page[size]': '10'
});
```

### Error ID: 8b4ioibad (Include Parameter)

**Symptoms**: Request with include[] parameter fails

**Troubleshooting Steps**:
1. Verify the include[] parameter format
2. Check if "attribute" is a valid include resource
3. Ensure the backend supports the include parameter
4. Test with different include values

**Code Fix**:
```typescript
// Test different include formats
const params1 = buildParams({ include: ['attribute'] });
const params2 = buildParams({ include: [] }); // Test without include
```

### Error ID: 8b4ioibih (Filter Parameter)

**Symptoms**: Request with filter[] parameter fails

**Troubleshooting Steps**:
1. Check filter syntax: "field|operator|value"
2. Verify the field names are correct
3. Ensure the operator is supported (eq, ne, gt, lt, etc.)
4. Test with simpler filters

**Code Fix**:
```typescript
// Test different filter formats
const params1 = buildParams({ filter: ['status|eq|1'] });
const params2 = buildParams({ filter: ['id|gt|0'] });
const params3 = buildParams({ filter: [] }); // Test without filter
```

### Error ID: 8b4ioibpo (Pagination)

**Symptoms**: Pagination parameters cause errors

**Troubleshooting Steps**:
1. Check page[number] and page[size] parameters
2. Verify the page number is valid (not negative)
3. Ensure the page size is within allowed limits
4. Test with different page sizes

**Code Fix**:
```typescript
// Test different pagination values
const params1 = buildParams({ page: { number: 1, size: 10 } });
const params2 = buildParams({ page: { number: 1, size: 5 } });
const params3 = buildParams({ page: { number: 1, size: 1 } });
```

### Error ID: 8b4ioic4a (By ID)

**Symptoms**: Single feature retrieval fails

**Troubleshooting Steps**:
1. Verify the feature ID exists
2. Check if the ID format is correct (number vs string)
3. Ensure the endpoint supports the include parameter
4. Test with different IDs

**Code Fix**:
```typescript
// Test different ID formats
await getSpatialFeature(1);
await getSpatialFeature('1');
await getSpatialFeature(999); // Test non-existent ID
```

### Error ID: 8b4ioicad (Count)

**Symptoms**: Count endpoint returns 500 error

**Troubleshooting Steps**:
1. Check if the count endpoint is implemented
2. Verify the endpoint path: `/api/spatial-feature/count`
3. Review server logs for count-specific errors
4. Test with and without parameters

**Code Fix**:
```typescript
// Test count endpoint
await countSpatialFeatures();
await countSpatialFeatures({ status: 1 });
```

## Integration with LoadAllCheck Component

### Step 1: Update LoadAllCheck with Error Handling

```typescript
// In src/dev/LoadAllCheck.tsx
import { apiTestFramework } from '../lib/api/testFramework';

export default function LoadAllCheck() {
  const [msg, setMsg] = React.useState('Idle');
  const [running, setRunning] = React.useState(false);
  const [useMock, setUseMock] = React.useState(false);

  React.useEffect(() => {
    apiTestFramework.setMockMode(useMock);
  }, [useMock]);

  async function run() {
    try {
      setRunning(true);
      setMsg('Testing API connectivity...');
      
      // First test individual endpoints
      const authTest = await apiTestFramework.testAuthentication();
      if (authTest.status !== 'success') {
        setMsg(`Auth failed: ${authTest.error}`);
        return;
      }
      
      setMsg('Fetching all pages...');
      
      // Use the enhanced listAllSpatialFeaturesJsonApi with error handling
      const rows = await listAllSpatialFeaturesJsonApi({ 
        pageSize: 200, 
        include: ['attribute'],
        maxPages: 10 // Limit for testing
      });
      
      setMsg(`Done. features=${rows.length}`);
      
      // Log success to test framework
      apiTestFramework.logSuccess('load-all-check', {
        featureCount: rows.length,
        pageSize: 200,
        maxPages: 10
      });
      
    } catch (e: any) {
      setMsg(`ERR: ${e?.message || String(e)}`);
      
      // Log error to test framework
      apiTestFramework.logError('load-all-check', e, {
        pageSize: 200,
        include: ['attribute']
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', padding: 8, borderRadius: 6 }}>
      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px' }}>
          <input
            type="checkbox"
            checked={useMock}
            onChange={(e) => setUseMock(e.target.checked)}
          />
          Use Mock Data
        </label>
      </div>
      
      <button 
        onClick={run} 
        disabled={running} 
        style={{ 
          padding: '6px 10px', 
          border: '1px solid #888', 
          borderRadius: 4,
          background: running ? '#ccc' : '#3b82f6',
          color: 'white',
          cursor: running ? 'not-allowed' : 'pointer'
        }}
      >
        {running ? 'Loading…' : 'Load ALL (paginated)'}
      </button>
      
      <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12 }}>{msg}</div>
    </div>
  );
}
```

### Step 2: Add Error Logging to Test Framework

```typescript
// Add these methods to src/lib/api/testFramework.ts
logSuccess(testName: string, data?: any) {
  const result: TestResult = {
    endpoint: testName,
    method: 'CUSTOM',
    status: 'success',
    responseTime: 0,
    timestamp: new Date().toISOString(),
    data
  };
  this.errorLog.push(result);
}

logError(testName: string, error: any, params?: any) {
  const result: TestResult = {
    endpoint: testName,
    method: 'CUSTOM',
    status: 'error',
    statusCode: error.status,
    responseTime: 0,
    error: error.message,
    timestamp: new Date().toISOString(),
    params
  };
  this.errorLog.push(result);
}
```

## Best Practices

### 1. Progressive Implementation

1. Start with mock data to verify UI functionality
2. Test authentication first
3. Test simple endpoints before complex ones
4. Add parameters gradually
5. Implement error handling at each step

### 2. Error Handling

```typescript
// Always wrap API calls in try-catch
try {
  const result = await apiCall();
  // Handle success
} catch (error) {
  // Log detailed error information
  console.error('API Error:', {
    endpoint,
    params,
    error: error.message,
    status: error.status,
    timestamp: new Date().toISOString()
  });
}
```

### 3. Parameter Validation

```typescript
// Validate parameters before making requests
function validateParams(params: any) {
  if (params.page?.number && params.page.number < 1) {
    throw new Error('Page number must be greater than 0');
  }
  if (params.page?.size && (params.page.size < 1 || params.page.size > 1000)) {
    throw new Error('Page size must be between 1 and 1000');
  }
  return params;
}
```

### 4. Retry Logic

```typescript
// Implement exponential backoff for failed requests
async function apiCallWithRetry(call: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await call();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

### 5. Monitoring

```typescript
// Add performance monitoring
function monitorApiCall(endpoint: string, call: () => Promise<any>) {
  const start = performance.now();
  return call().then(
    result => {
      const duration = performance.now() - start;
      console.log(`API Call ${endpoint} completed in ${duration}ms`);
      return result;
    },
    error => {
      const duration = performance.now() - start;
      console.error(`API Call ${endpoint} failed after ${duration}ms:`, error);
      throw error;
    }
  );
}
```

## Conclusion

By following this guide, you should be able to:

1. ✅ Identify the root cause of HTTP 500 errors
2. ✅ Implement proper error handling and logging
3. ✅ Test API endpoints systematically
4. ✅ Integrate working API calls into your application
5. ✅ Monitor and maintain API performance

Remember to:
- Start with mock mode to verify functionality
- Test each endpoint individually
- Use the troubleshooting guides for specific error IDs
- Implement proper error handling in production code
- Monitor API performance and errors regularly