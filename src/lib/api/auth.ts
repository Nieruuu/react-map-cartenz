/**
 * Comprehensive authentication system for SmartGov API
 * Maintains Bearer token in localStorage and automatically adds it to requests
 * Includes automatic token refresh and expiration monitoring
 */

export interface AuthState {
  token: string | null;
  tokenType: string;
  expiresAt: number | null;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  userIdentifier: string;
  password: string;
}

export interface LoginResponse {
  tokenType: string;
  accessToken: string;
  expireAt: number;
}

const TOKEN_KEY = 'ret_token';
const EXPIRES_AT_KEY = 'ret_token_expires_at';
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiration
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 in milliseconds
const TOKEN_ENDPOINT = '/api/auth/request-token';
const DEFAULT_CREDENTIALS: LoginCredentials = {
  userIdentifier: 'sa',
  password: 'pass@word1',
};

/**
 * Timezone utilities for Indonesia WIB (UTC+7)
 */
export class WIBTimeUtils {
  /**
   * Convert UTC timestamp to WIB timestamp
   */
  static utcToWib(utcTimestamp: number): number {
    return utcTimestamp + WIB_OFFSET_MS;
  }

  /**
   * Convert WIB timestamp to UTC timestamp
   */
  static wibToUtc(wibTimestamp: number): number {
    return wibTimestamp - WIB_OFFSET_MS;
  }

  /**
   * Get current WIB timestamp
   */
  static getCurrentWIBTimestamp(): number {
    return Date.now() + WIB_OFFSET_MS;
  }

  /**
   * Format WIB timestamp for display
   */
  static formatWIBTime(wibTimestamp: number): string {
    const date = new Date(wibTimestamp - WIB_OFFSET_MS); // Convert back to UTC for Date object
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');
  }

  /**
   * Format WIB time as time only (HH:MM:SS)
   */
  static formatWIBTimeOnly(wibTimestamp: number): string {
    const date = new Date(wibTimestamp - WIB_OFFSET_MS); // Convert back to UTC for Date object
    return date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Check if WIB timestamp is expired
   */
  static isWIBTimestampExpired(wibTimestamp: number, bufferMs: number = 0): boolean {
    const currentWIB = this.getCurrentWIBTimestamp();
    return currentWIB >= (wibTimestamp - bufferMs);
  }
}

export class AuthError extends Error {
  public code?: string;
  
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

function normalizeExpirationTimestamp(raw: number | string): number {
  const parsed =
    typeof raw === 'string' ? Number.parseFloat(raw) : Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new AuthError('Invalid expiration timestamp', 'INVALID_EXPIRATION');
  }

  // API can return seconds – convert to milliseconds for consistent comparisons
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

export class AuthenticationManager {
  private static instance: AuthenticationManager;

  private defaultTokenPromise: Promise<AuthState> | null = null;

  private constructor() {}

  static getInstance(): AuthenticationManager {
    if (!AuthenticationManager.instance) {
      AuthenticationManager.instance = new AuthenticationManager();
    }
    return AuthenticationManager.instance;
  }

  /**
   * Get current authentication state
   */
  getAuthState(): AuthState {
    const token = this.getToken();
    const expiresAt = this.getExpirationTime();
    const isExpired = this.isTokenExpired(expiresAt);
    
    const authState = {
      token,
      tokenType: 'Bearer',
      expiresAt,
      isAuthenticated: !!token && !isExpired,
    };
    
    // Debug logging for authentication state
    if (process.env.NODE_ENV === 'development') {
      console.debug('Auth state:', {
        hasToken: !!token,
        tokenLength: token?.length,
        expiresAt,
        isExpired,
        isAuthenticated: authState.isAuthenticated,
        currentTime: WIBTimeUtils.getCurrentWIBTimestamp(),
      });
    }
    
    return authState;
  }

  /**
   * Get token expiration time in WIB
   */
  getExpirationTime(): number | null {
    try {
      const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
      return expiresAt ? parseInt(expiresAt, 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get token expiration time formatted for display in WIB
   */
  getExpirationTimeDisplay(): string | null {
    const expiresAt = this.getExpirationTime();
    return expiresAt ? WIBTimeUtils.formatWIBTime(expiresAt) : null;
  }

  /**
   * Get token expiration time as WIB time only (HH:MM:SS)
   */
  getExpirationTimeWIB(): string | null {
    const expiresAt = this.getExpirationTime();
    return expiresAt ? WIBTimeUtils.formatWIBTimeOnly(expiresAt) : null;
  }

  /**
   * Check if token is expired or will expire soon (using WIB timezone)
   */
  isTokenExpired(expiresAt: number | null = null): boolean {
    const expiration = expiresAt || this.getExpirationTime();
    if (!expiration) return true;
    
    // Check if token is actually expired (no buffer for UI state)
    return WIBTimeUtils.isWIBTimestampExpired(expiration, 0);
  }

  /**
   * Check if token will expire soon (with buffer for proactive refresh)
   */
  isTokenExpiringSoon(expiresAt: number | null = null): boolean {
    const expiration = expiresAt || this.getExpirationTime();
    if (!expiration) return true;
    
    return WIBTimeUtils.isWIBTimestampExpired(expiration, REFRESH_BUFFER_MS);
  }

  /**
   * Core token request helper used by all authentication flows
   */
  private async performTokenRequest(credentials: LoginCredentials): Promise<AuthState> {
    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AuthError(
          errorData.message || `Token request failed: ${response.status}`,
          `REQUEST_HTTP_${response.status}`
        );
      }

      const loginData: { data: LoginResponse } = await response.json();
      this.storeAuthData(loginData.data);

      return this.getAuthState();
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(`Token request failed: ${error}`, 'REQUEST_NETWORK_ERROR');
    }
  }

  /**
   * Request token using default system credentials while avoiding duplicate calls
   */
  private async requestTokenWithDefaultCredentials(): Promise<AuthState> {
    if (!this.defaultTokenPromise) {
      this.defaultTokenPromise = this.performTokenRequest({
        ...DEFAULT_CREDENTIALS,
      }).finally(() => {
        this.defaultTokenPromise = null;
      });
    }

    return this.defaultTokenPromise;
  }

  /**
   * Ensure the application has a valid authentication token
   * When force is true, a new token is requested regardless of current state
   */
  async ensureAuthenticated(force = false): Promise<AuthState> {
    const currentState = this.getAuthState();

    if (!force && currentState.isAuthenticated && currentState.expiresAt && !this.isTokenExpiringSoon(currentState.expiresAt)) {
      return currentState;
    }

    return this.requestTokenWithDefaultCredentials();
  }

  /**
   * Public method kept for backward compatibility (replaces refreshToken semantics)
   */
  async refreshToken(): Promise<AuthState> {
    return this.requestTokenWithDefaultCredentials();
  }

  /**
   * Get stored token
   */
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Get authorization header for requests
   */
  getAuthHeader(): Record<string, string> {
    const token = this.getToken();
    if (!token) {
      throw new AuthError('Not authenticated', 'NOT_AUTHENTICATED');
    }
    
    // Debug logging for token attachment
    if (process.env.NODE_ENV === 'development') {
      console.debug('Attaching auth header:', {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 10) + '...',
      });
    }
    
    // Always use Bearer token
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Store authentication data
   */
  storeAuthData(response: LoginResponse): void {
    try {
      const normalizedExpiration = normalizeExpirationTimestamp(response.expireAt);
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(EXPIRES_AT_KEY, normalizedExpiration.toString());
      
      // No automatic refresh scheduling - tokens will be requested when needed
    } catch (error) {
      console.error('Failed to store auth data:', error);
      throw new AuthError('Failed to store authentication data', 'STORAGE_ERROR');
    }
  }

  /**
   * Clear authentication data
   */
  clearAuthData(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRES_AT_KEY);
    } catch (error) {
      console.error('Failed to clear auth data:', error);
    }
  }

  /**
   * Login with credentials
   */
  async login(credentials: LoginCredentials): Promise<AuthState> {
    try {
      return await this.performTokenRequest(credentials);
    } catch (error) {
      if (error instanceof AuthError) {
        const message = error.message.replace('Token request', 'Login');
        throw new AuthError(message, error.code);
      }
      throw new AuthError(`Login failed: ${error}`, 'NETWORK_ERROR');
    }
  }

  /**
   * Check and auto-login if needed on app startup
   */
  async initializeAuth(): Promise<AuthState> {
    const token = this.getToken();
    const expiresAt = this.getExpirationTime();
    
    // If token exists and is not expired, return current state
    if (token && expiresAt && !this.isTokenExpired(expiresAt)) {
      return this.getAuthState();
    }
    
    // Otherwise, auto-login with default credentials
    try {
      return await this.autoLogin();
    } catch (error) {
      console.warn('Auto-login failed on initialization:', error);
      return this.getAuthState(); // Return unauthenticated state
    }
  }

  /**
   * Auto-login with default credentials
   */
  async autoLogin(): Promise<AuthState> {
    return this.requestTokenWithDefaultCredentials();
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    this.clearAuthData();
  }
}

// Export singleton instance
export const auth = AuthenticationManager.getInstance();

// Export convenience functions
export const getAuthHeader = () => auth.getAuthHeader();
export const isAuthenticated = () => auth.getAuthState().isAuthenticated;
export const getToken = () => auth.getToken();
