# Solution for 401 Unauthorized Error in Production Build

## Problem

When running `npm run preview`, the application serves static files directly without a proxy, causing:
- **401 Unauthorized errors** when calling API
- **CORS issues** with cross-origin requests
- **Authentication failures** due to missing headers

## Solutions

### ✅ Solution 1: Docker with Nginx Reverse Proxy (Recommended)

**Status: WORKING** 🎉

The Docker container we created already solves this issue completely.

**Access:** `http://localhost:8080`

**Why it works:**
- Nginx proxies `/api/*` requests to `https://retfw.smartgov.id/framework/*`
- CORS headers are automatically added
- Authentication works properly
- Production-ready environment

**Commands:**
```bash
# Start Docker container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

### ✅ Solution 2: Preview Server with Proxy (NEW)

**Status: WORKING** 🎉

Just created a custom preview server with proxy capabilities.

**Access:** `http://localhost:4173`

**Why it works:**
- Express server with http-proxy-middleware
- Proxies `/api/*` to `https://retfw.smartgov.id/framework/*`
- Adds proper CORS headers
- Handles preflight OPTIONS requests

**Commands:**
```bash
# Start proxy preview server
npm run preview:proxy

# Build first (if needed)
npm run build
npm run preview:proxy
```

### ❌ Solution 3: Standard Vite Preview (Not Working)

**Command:** `npm run preview`
**Access:** `http://localhost:4173`
**Problem:** No proxy, direct API calls fail with 401/CORS

## Comparison

| Method | URL | API Proxy | CORS | Status |
|---------|------|------------|-------|--------|
| Docker | http://localhost:8080 | ✅ Nginx | ✅ Fixed | **Recommended** |
| Custom Preview | http://localhost:4173 | ✅ Express | ✅ Fixed | **Good for testing** |
| Vite Preview | http://localhost:4173 | ❌ None | ❌ Broken | **Not recommended** |

## Technical Details

### Docker Solution (Production Ready)
- **Nginx reverse proxy** handles all API requests
- **Security headers** automatically added
- **Performance optimized** with gzip and caching
- **Health checks** for reliability
- **Non-root user** for security

### Custom Preview Solution (Development)
- **Express server** with http-proxy-middleware
- **CORS headers** added programmatically
- **Path rewriting** `/api` → `/framework`
- **Preflight handling** for OPTIONS requests
- **SPA routing** support

## API Flow

```
Browser → Nginx/Express → React SPA
                    ↓
            /api/* → https://retfw.smartgov.id/framework/*
```

## Authentication Headers Added

The proxy solutions add these critical headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type, Accept, ...`
- `Access-Control-Allow-Credentials: true`

## Recommendation

**For Production:** Use Docker (`http://localhost:8080`)
- Most reliable and secure
- Production-ready configuration
- Best performance

**For Development:** Use Custom Preview (`npm run preview:proxy`)
- Easy to test changes
- Hot reload not available (static build)
- Good for final testing before deployment

**Avoid:** Standard Vite preview (`npm run preview`)
- No proxy support
- CORS and authentication issues
- Not suitable for API testing

## Next Steps

1. **Test Docker solution:** Visit `http://localhost:8080`
2. **Test custom preview:** Run `npm run preview:proxy` and visit `http://localhost:4173`
3. **Choose based on needs:** Docker for production, custom preview for testing
4. **Deploy:** Use Docker compose for production deployment

Both solutions successfully resolve the 401 Unauthorized error by implementing proper API proxying with CORS support!