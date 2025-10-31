// src/lib/config.ts
// Environment-based configuration using .env variables
const PROD_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const DEV_PROXY = import.meta.env.VITE_API_PROXY_URL || '/api';

export const API_BASE_URL = import.meta.env.DEV ? DEV_PROXY : PROD_BASE;

// Application settings
export const APP_TITLE = import.meta.env.VITE_APP_TITLE || 'Tax Map React';
export const NODE_ENV = import.meta.env.VITE_NODE_ENV || 'development';

// Feature flags
export const ENABLE_API_DEBUG = import.meta.env.VITE_ENABLE_API_DEBUG === 'true';
export const ENABLE_FEATURE_GROUPS = import.meta.env.VITE_ENABLE_FEATURE_GROUPS !== 'false';

// Authentication settings
export const AUTH_AUTO_LOGIN = import.meta.env.VITE_AUTH_AUTO_LOGIN !== 'false';
export const AUTH_REFRESH_ENABLED = import.meta.env.VITE_AUTH_REFRESH_ENABLED !== 'false';

// Default credentials can be provided via environment variables. We only fall back to
// the built-in dev credentials when running the Vite dev server.
const envDefaultUser = import.meta.env.VITE_AUTH_DEFAULT_USER;
const envDefaultPass = import.meta.env.VITE_AUTH_DEFAULT_PASS;
export const DEFAULT_USER =
  envDefaultUser !== undefined ? envDefaultUser : (import.meta.env.DEV ? 'sa' : '');
export const DEFAULT_PASS =
  envDefaultPass !== undefined ? envDefaultPass : (import.meta.env.DEV ? 'pass@word1' : '');

// API endpoint configuration
export const API_ENDPOINTS = {
  BASE: API_BASE_URL,
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    LOGOUT: `${API_BASE_URL}/auth/logout`,
    REFRESH: `${API_BASE_URL}/auth/refresh`,
    VALIDATE: `${API_BASE_URL}/auth/validate`,
  },
  SPATIAL_FEATURE: `${API_BASE_URL}/spatial-feature`,
} as const;

// Proxy configuration for development
export const PROXY_CONFIG = {
  TARGET: import.meta.env.VITE_PROXY_TARGET || 'https://retfw.smartgov.id',
  PATH: import.meta.env.VITE_PROXY_PATH || '/framework',
} as const;
