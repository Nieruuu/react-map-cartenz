// src/lib/config.ts
// Dev pakai Vite proxy di /api. Prod pakai env atau fallback ke host resmi.
const PROD_BASE = (import.meta as unknown as ImportMetaEnv & { VITE_API_BASE_URL?: string }).env?.VITE_API_BASE_URL || 'https://retfw.smartgov.id/framework';
export const API_BASE_URL = import.meta.env.DEV ? '/api' : PROD_BASE;

// HANYA untuk smoke test di dev. Kosongkan di prod.
export const DEFAULT_USER = import.meta.env.DEV ? 'sa' : '';
export const DEFAULT_PASS = import.meta.env.DEV ? 'pass@word1' : '';
