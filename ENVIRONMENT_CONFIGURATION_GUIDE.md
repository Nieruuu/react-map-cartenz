# Environment-Based Configuration Guide

This document explains the environment-based configuration implementation for the Tax Map React application, preparing it for Laravel integration and production deployment.

## Overview

The application now uses environment variables for all configuration values, making it easy to switch between development, staging, and production environments without code changes.

## Files Created/Modified

### 1. `.env` file
Contains the actual environment variables for the current environment. This file is **NOT** committed to version control.

### 2. `.env.example` file
Template file that documents all available environment variables. This file **IS** committed to version control.

### 3. `vite.config.ts`
Updated to use environment variables for proxy configuration and build settings.

### 4. `src/lib/config.ts`
Enhanced with comprehensive configuration management using environment variables.

### 5. `src/lib/api/client.ts`
Updated to use centralized configuration and controlled debug logging.

### 6. `src/lib/api/auth.ts`
Updated to use environment-based endpoints and feature flags.

### 7. `.gitignore`
Updated to exclude environment files while allowing the example template.

## Environment Variables

### API Configuration
- `VITE_API_BASE_URL`: Production API base URL
- `VITE_API_PROXY_URL`: Development proxy URL path
- `VITE_PROXY_TARGET`: Target server for development proxy
- `VITE_PROXY_PATH`: Path prefix for development proxy

### Application Settings
- `VITE_NODE_ENV`: Environment mode (development/production)
- `VITE_APP_TITLE`: Application title for UI display

### Feature Flags
- `VITE_ENABLE_API_DEBUG`: Enable/disable API debug logging
- `VITE_ENABLE_FEATURE_GROUPS`: Enable/disable feature grouping
- `VITE_AUTH_AUTO_LOGIN`: Enable/disable automatic login
- `VITE_AUTH_REFRESH_ENABLED`: Enable/disable token refresh

## Environment-Specific Behavior

### Development Environment
- Uses Vite proxy to redirect `/api/*` to `https://retfw.smartgov.id/framework/*`
- Debug logging enabled when `VITE_ENABLE_API_DEBUG=true`
- Auto-login enabled by default
- Source maps generated for debugging

### Production Environment
- Direct API connection to `VITE_API_BASE_URL`
- Debug logging disabled by default
- Optimized build with minification
- No source maps (smaller bundle size)

## Laravel Integration

This environment-based configuration makes Laravel integration straightforward:

### 1. API Endpoints
Update `VITE_API_BASE_URL` to point to your Laravel backend:
```
VITE_API_BASE_URL=https://your-laravel-app.com/api
```

### 2. Authentication
The authentication system is already designed to work with Laravel-style token authentication. Update the endpoints in `src/lib/config.ts` if your Laravel app uses different routes.

### 3. Proxy Configuration
For development with a local Laravel instance:
```
VITE_PROXY_TARGET=http://localhost:8000
VITE_PROXY_PATH=/api
```

## Usage Instructions

### For Development
1. Copy `.env.example` to `.env` (if not already exists)
2. Modify values in `.env` as needed for your development setup
3. Run `npm run dev`

### For Production
1. Set environment variables on your server/hosting platform
2. Run `npm run build`
3. Deploy the built files to your web server

### For Laravel Integration
1. Update `VITE_API_BASE_URL` to your Laravel API endpoint
2. Configure CORS in your Laravel application
3. Update authentication endpoints if needed in `src/lib/config.ts`

## Security Considerations

- `.env` files are excluded from version control (see `.gitignore`)
- Sensitive values like API keys and credentials should only be in environment files
- Use different environment files for different deployment stages
- Never commit actual `.env` files to version control

## Debugging

### Enable Debug Logging
Set `VITE_ENABLE_API_DEBUG=true` in your `.env` file to see detailed API request/response logs in the browser console.

### Verify Environment Variables
You can check if environment variables are loaded correctly by:
1. Opening browser developer tools
2. Checking the console for any configuration-related logs
3. Verifying network requests are going to the expected endpoints

## Migration from Hardcoded Configuration

All hardcoded configuration values have been moved to environment variables:

| Before | After |
|--------|--------|
| `'https://retfw.smartgov.id/framework'` | `import.meta.env.VITE_API_BASE_URL` |
| `process.env.NODE_ENV === 'development'` | `import.meta.env.VITE_ENABLE_API_DEBUG` |
| Hardcoded proxy settings | Environment-based proxy configuration |

## Troubleshooting

### Environment Variables Not Loading
1. Ensure `.env` file exists in project root
2. Check that variables start with `VITE_` prefix
3. Restart development server after changing `.env` file

### Proxy Not Working
1. Verify `VITE_PROXY_TARGET` and `VITE_PROXY_PATH` are correct
2. Check that proxy configuration in `vite.config.ts` matches your needs
3. Ensure no conflicting proxy settings

### API Requests Failing
1. Verify `VITE_API_BASE_URL` is correct for your environment
2. Check CORS configuration on your backend
3. Enable debug logging to see request details

## Best Practices

1. **Always use `.env.example` as a template** for new environment files
2. **Document any new environment variables** in both `.env.example` and this guide
3. **Test configuration changes** in development before deploying to production
4. **Use different values** for development, staging, and production environments
5. **Keep sensitive data** out of code and in environment variables only

## Future Enhancements

Potential improvements to the configuration system:

1. **Environment validation**: Add runtime validation of required environment variables
2. **Configuration schema**: Define TypeScript interfaces for environment variables
3. **Multi-stage builds**: Support for staging/preview environments
4. **Dynamic configuration**: Load configuration from remote sources if needed
5. **Configuration UI**: Admin interface for managing environment-specific settings

---

**Last Updated**: October 2025  
**Version**: 1.0.0  
**Framework**: Vite + React + TypeScript