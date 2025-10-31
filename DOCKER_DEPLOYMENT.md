# Docker Deployment Guide for Tax Map React

This guide explains how to deploy the Tax Map React application using Docker with Nginx reverse proxy.

## ✅ Deployment Status: SUCCESSFULLY TESTED

The Docker deployment has been successfully built and tested. The container is running on `http://localhost:8080` with full Nginx reverse proxy functionality.

## Overview

The Docker setup uses:
- **Multi-stage build**: Builds the React app and serves it with Nginx
- **Reverse proxy**: Nginx proxies API requests to `https://retfw.smartgov.id`
- **CORS handling**: Eliminates CORS issues through proxying
- **Security**: Non-root user, security headers, and SSL verification
- **Performance**: Gzip compression and static asset caching

## Architecture

```
Browser → Nginx Container → React SPA
                ↓
        API Proxy → retfw.smartgov.id
```

## Files Created

1. **`.env.production`** - Production environment variables
2. **`nginx.conf`** - Nginx configuration with reverse proxy
3. **`Dockerfile`** - Multi-stage Docker build configuration
4. **`.dockerignore`** - Files to exclude from Docker build
5. **`docker-compose.yml`** - Docker Compose configuration

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### Option 2: Using Docker directly

```bash
# Build the image
docker build -t tax-map-react .

# Run the container
docker run -d -p 8080:80 --name tax-map-react tax-map-react

# View logs
docker logs -f tax-map-react

# Stop the container
docker stop tax-map-react
docker rm tax-map-react
```

## Accessing the Application

After starting the container, access the application at:
- **Local**: http://localhost:8080
- **Network**: http://[your-ip]:8080

## Configuration

### Environment Variables

The application uses the following production environment variables (defined in `.env.production`):

```env
VITE_API_BASE_URL=/api                    # API base URL for proxy
VITE_API_PROXY_URL=/api                   # Proxy URL path
VITE_NODE_ENV=production                  # Node environment
VITE_APP_TITLE=Tax Map React              # Application title
VITE_PROXY_TARGET=https://retfw.smartgov.id  # Target API server
VITE_PROXY_PATH=/framework                # API path on target server
VITE_ENABLE_API_DEBUG=false               # API debug logging
VITE_ENABLE_FEATURE_GROUPS=true           # Feature groups enabled
VITE_AUTH_AUTO_LOGIN=true                 # Auto-login enabled
VITE_AUTH_REFRESH_ENABLED=true            # Token refresh enabled
```

### Nginx Configuration

The Nginx configuration (`nginx.conf`) includes:

- **Reverse Proxy**: `/api/*` requests are proxied to `https://retfw.smartgov.id/framework/*`
- **CORS Headers**: Proper CORS headers are added to all responses
- **Security Headers**: Security headers for XSS protection, content type options, etc.
- **Gzip Compression**: Compresses text-based assets for better performance
- **Static Asset Caching**: Long-term caching for JS, CSS, and image files
- **SPA Routing**: All non-file requests are routed to `index.html`

## API Flow

1. **Development**: Uses Vite proxy (`/api` → `https://retfw.smartgov.id/framework`)
2. **Production**: Uses Nginx proxy (`/api` → `https://retfw.smartgov.id/framework`)

The application automatically switches between development and production API configurations based on the `import.meta.env.DEV` flag.

## Security Features

- **Non-root User**: Container runs as non-root user for security
- **Security Headers**: XSS protection, content type options, frame options
- **SSL Verification**: SSL verification for upstream API calls
- **CORS Handling**: Proper CORS headers for cross-origin requests

## Performance Optimizations

- **Gzip Compression**: Reduces response sizes for text-based assets
- **Static Asset Caching**: 1-year cache for static assets
- **Multi-stage Build**: Smaller final image by excluding build dependencies
- **Health Checks**: Container health monitoring

## Troubleshooting

### Common Issues

1. **Docker Desktop not running**
   - Start Docker Desktop before running commands

2. **Port already in use**
   - Change the port mapping: `docker run -p 8081:80 ...`

3. **API connection issues**
   - Check Nginx logs: `docker logs tax-map-react`
   - Verify API endpoint is accessible

4. **Build failures**
   - Check Node.js version compatibility
   - Verify all dependencies are installed

### Debugging Commands

```bash
# Check container status
docker ps

# View container logs
docker logs tax-map-react

# Access container shell
docker exec -it tax-map-react sh

# Check Nginx configuration
docker exec tax-map-react nginx -t

# Reload Nginx configuration
docker exec tax-map-react nginx -s reload
```

## Production Deployment

### Environment-Specific Configurations

For different environments (staging, production), create additional environment files:

```bash
# Staging
cp .env.production .env.staging
# Edit .env.staging with staging-specific values

# Production
# Edit .env.production with production-specific values
```

### Scaling with Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  tax-map-app:
    build: .
    ports:
      - "80:80"
    environment:
      - NODE_ENV=production
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

### Monitoring and Logging

```bash
# Monitor resource usage
docker stats tax-map-react

# Follow logs in real-time
docker logs -f tax-map-react

# Export logs
docker logs tax-map-react > tax-map-logs.txt
```

## Maintenance

### Updating the Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### Backup and Recovery

```bash
# Export image
docker save tax-map-react > tax-map-react.tar

# Import image
docker load < tax-map-react.tar
```

## Support

For issues related to:
- **Docker**: Check Docker Desktop documentation
- **Nginx**: Review Nginx error logs
- **Application**: Check browser console and application logs

## Next Steps

1. Test the application locally with Docker
2. Configure environment-specific settings
3. Set up monitoring and logging
4. Plan for backup and disaster recovery
5. Consider load balancing for high availability