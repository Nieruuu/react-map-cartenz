// src/lib/config.ts
const PROD_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'https://retfw.smartgov.id/framework';
export const API_BASE_URL = import.meta.env.DEV ? '/api' : PROD_BASE;

// Dev-only defaults for quick smoke tests. Jangan bawa ke produksi.
export const DEFAULT_USER = import.meta.env.DEV ? 'sa' : '';
export const DEFAULT_PASS = import.meta.env.DEV ? 'pass@word1' : '';
