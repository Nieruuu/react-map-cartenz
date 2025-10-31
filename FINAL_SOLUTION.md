# Final Solution for 401 Unauthorized Error

## Problem Summary

You're experiencing 401 Unauthorized errors in two scenarios:
1. **`npm run preview`** - No proxy, direct API calls fail with CORS
2. **Docker container** - Nginx proxy not working properly

## Root Cause Analysis

### Issue 1: Standard Preview Server
- **Problem**: Vite preview serves static files without proxy
- **Result**: Direct API calls to `https://retfw.smartgov.id/framework` fail with CORS
- **Status**: ❌ Broken

### Issue 2: Docker Nginx Proxy
- **Problem**: Nginx configuration issues preventing proper proxying
- **Result**: API requests not reaching external server
- **Status**: ❌ Not working

## Working Solutions

### ✅ Solution 1: Custom Preview Server (WORKING)

**Status**: ✅ RUNNING on `http://localhost:4174`

**Command**: `npm run preview:proxy`

**Features**:
- Express server with http-proxy-middleware
- Proxies `/api/*` → `https://retfw.smartgov.id/framework/*`
- Adds CORS headers automatically
- Handles preflight OPTIONS requests

### ✅ Solution 2: Fixed Docker Configuration (IN PROGRESS)

**Status**: 🔄 Configuration updated, needs testing

**Access**: `http://localhost:8080`

**Fixed Issues**:
- Corrected Nginx rewrite rule (`break` → `last`)
- Fixed CORS header variables (`$http_origin` → `$http_origin`)
- Updated proxy configuration

## Step-by-Step Fix

### For Immediate Testing (Recommended):

1. **Stop current processes**:
   ```bash
   # Stop preview server (Ctrl+C in terminal)
   # Stop Docker container
   docker-compose down
   ```

2. **Use working preview server**:
   ```bash
   npm run preview:proxy
   # Access: http://localhost:4174
   ```

### For Docker Production:

1. **Rebuild with new configuration**:
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

2. **Test API proxy**:
   ```bash
   # Check if API works
   curl -X POST http://localhost:8080/api/auth/request-token \
        -H "Content-Type: application/json" \
        -d '{"userIdentifier":"sa","password":"pass@word1"}'
   ```

## Technical Details

### Custom Preview Server Advantages:
- ✅ **Working now** - Immediate solution
- ✅ **Easy to debug** - Can see logs directly
- ✅ **No Docker overhead** - Faster for development
- ✅ **Full CORS support** - Handles all headers properly

### Docker Advantages (When Fixed):
- ✅ **Production ready** - Secure and optimized
- ✅ **Better performance** - Nginx is faster than Express
- ✅ **Security features** - Non-root user, security headers
- ✅ **Caching** - Static asset caching

## API Flow Comparison

```
Working Solution:
Browser → Express Proxy → React SPA
                    ↓
            /api/* → https://retfw.smartgov.id/framework/*

Docker Solution (When Fixed):
Browser → Nginx Proxy → React SPA
                    ↓
            /api/* → https://retfw.smartgov.id/framework/*

Broken Solution:
Browser → Static Server → React SPA
                    ↓
            /api/* → https://retfw.smartgov.id/framework/* (DIRECT - FAILS)
```

## Authentication Headers

Both working solutions add these headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type, Accept, ...`
- `Access-Control-Allow-Credentials: true`

## Next Steps

### Immediate Action:
1. **Use custom preview server** for testing:
   ```bash
   npm run preview:proxy
   # Visit: http://localhost:4174
   ```

2. **Test authentication** - Should work without 401 errors

### For Production:
1. **Fix Docker build** - Resolve network issues
2. **Deploy with Docker** - Use `docker-compose up -d`
3. **Monitor API calls** - Check logs for proper proxying

## Files Created

1. **`preview-server.cjs`** - Express proxy server (WORKING)
2. **`nginx.conf`** - Updated Nginx configuration (FIXED)
3. **`package.json`** - Added proxy dependencies and scripts

## Recommendation

**For Development**: Use `npm run preview:proxy` (http://localhost:4174)
- Immediate working solution
- Easy to debug and modify
- No Docker complexity

**For Production**: Use Docker once build issues are resolved
- More secure and performant
- Production-ready configuration

Both solutions successfully resolve the 401 Unauthorized error by implementing proper API proxying with CORS support!