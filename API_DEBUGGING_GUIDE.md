# API Debugging Guide

## Problem Analysis
The spatial feature API is not connecting properly despite successful authentication. Based on the Postman code snippet provided, we've identified several key differences and implemented solutions.

## Key Changes Made

### 1. Authorization Header Format
**Issue**: Our client was using the token type from the API response (`jws`) instead of `Bearer`.

**Fix**: Updated default token type to `Bearer` in both `client.ts` and `auth.ts`:
```typescript
// Before: setTokenType(tokenType || 'jws');
// After: setTokenType(tokenType || 'Bearer');
```

### 2. Empty Body for GET Requests
**Issue**: Postman includes an empty body even for GET requests, which some APIs require.

**Fix**: Modified client to include empty body for GET requests:
```typescript
// For GET requests, include empty body to match Postman behavior
if (method === 'GET' && body === undefined) {
  init.body = '';
}
```

### 3. Direct Fetch Implementation
**Issue**: Sometimes the fetch API behavior differs from the built-in `request` function.

**Fix**: Created `getSpatialFeaturesDirect()` function that exactly matches Postman:
```typescript
export async function getSpatialFeaturesDirect(includeAttribute = true): Promise<Paged<SpatialFeatureRow>>
```

## Testing the Fix

### Option 1: Use the LoadAllCheck Component
1. Open the app in development mode
2. Look for the "Load ALL (paginated)" component in the top-right corner
3. Enable "Use Direct Fetch" checkbox
4. Click "Load Direct" to test the Postman-style implementation
5. Check the results message for success/error details

### Option 2: Use the API Test Suite
1. Open the API Test Suite component
2. Click the "Direct (Postman)" button
3. Check the test results and error details
4. Review troubleshooting steps if errors occur

### Option 3: Manual Testing in Browser Console
```javascript
// Test the direct fetch implementation
import { getSpatialFeaturesDirect } from './src/lib/api/spatialFeature.js';

getSpatialFeaturesDirect(true)
  .then(data => console.log('Success:', data))
  .catch(error => console.error('Error:', error));
```

## Troubleshooting Steps

### 1. Check Authentication Token
```javascript
// In browser console
console.log('Token:', localStorage.getItem('ret_access_token'));
console.log('Type:', localStorage.getItem('ret_token_type'));
```

### 2. Verify API URL Construction
```javascript
// Check the final URL being used
const baseUrl = 'https://retfw.smartgov.id/framework';
const url = `${baseUrl}/spatial-feature?include[]=attribute`;
console.log('Final URL:', url);
```

### 3. Network Request Inspection
1. Open browser DevTools (F12)
2. Go to Network tab
3. Trigger the API call
4. Check the request headers and response
5. Look for CORS issues or authentication errors

### 4. Common Error Messages and Solutions

#### "401 Unauthorized"
- **Cause**: Invalid or expired token
- **Solution**: Re-authenticate and check token format

#### "403 Forbidden"
- **Cause**: Insufficient permissions
- **Solution**: Verify user has access to spatial features

#### "404 Not Found"
- **Cause**: Incorrect endpoint URL
- **Solution**: Verify the API base URL and endpoint path

#### "CORS Error"
- **Cause**: Browser blocking cross-origin request
- **Solution**: Ensure server allows requests from your domain

#### "Network Error"
- **Cause**: Connectivity issues
- **Solution**: Check internet connection and API server status

## Implementation Details

### Postman vs. Our Implementation

| Aspect | Postman | Our Implementation |
|--------|---------|-------------------|
| Authorization | `Bearer token` | `Bearer token` (fixed) |
| Body | Empty string `""` | Empty string `""` (fixed) |
| Headers | Basic headers | Full headers with Accept |
| URL Encoding | Raw characters | Raw characters (preserved) |

### Request Flow
1. **Authentication**: Get JWT token from `/auth/request-token`
2. **Token Storage**: Store in localStorage as `ret_access_token`
3. **API Call**: Use token in `Authorization: Bearer token` header
4. **Response**: Parse JSON response with spatial features

## Integration with OpenLayers

Once the API is working, the spatial features can be loaded into OpenLayers:

```typescript
// Example integration
const features = await getSpatialFeaturesDirect(true);
const vectorSource = new VectorSource();
features.data.forEach(feature => {
  // Convert API feature to OpenLayers format
  const olFeature = new Feature({
    geometry: new GeoJSON().readGeometry(feature.geometry),
    ...feature.properties
  });
  vectorSource.addFeature(olFeature);
});

const vectorLayer = new VectorLayer({
  source: vectorSource,
  style: createFeatureStyle()
});
map.addLayer(vectorLayer);
```

## Next Steps

1. **Test Both Implementations**: Try both the original client and direct fetch
2. **Monitor Network Requests**: Use DevTools to inspect actual HTTP requests
3. **Compare with Postman**: Ensure requests match exactly
4. **Check Server Logs**: If available, review server-side error logs
5. **Verify Data Format**: Ensure response structure matches expected types

## Support

If issues persist:
1. Check browser console for detailed error messages
2. Use the API Test Suite for comprehensive testing
3. Review network requests in DevTools
4. Compare exact request format with Postman collection
5. Verify API server is accessible and running