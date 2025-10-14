// src/lib/api/authService.ts
import { login as baseLogin, logout as baseLogout } from './auth';
import { getAccessToken, getTokenType, getTokenExpireAt, setAccessToken, setTokenType, setTokenExpireAt } from './client';

export interface TokenInfo {
  token: string;
  tokenType: string;
  expireAt: number;
  isExpired: boolean;
  timeLeft: number;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  tokenInfo: TokenInfo | null;
  error: string | null;
}

/**
 * Enhanced authentication service with better error handling and token validation
 */
export class AuthService {
  private static instance: AuthService;
  
  private constructor() {}
  
  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }
  
  /**
   * Get current authentication status
   */
  public getAuthStatus(): AuthStatus {
    try {
      const token = getAccessToken();
      const tokenType = getTokenType() || 'jws';
      const expireAtStr = getTokenExpireAt();
      
      if (!token) {
        return {
          isAuthenticated: false,
          tokenInfo: null,
          error: null
        };
      }
      
      const expireAt = parseInt(expireAtStr || '0', 10);
      const now = Date.now();
      const isExpired = expireAt < now;
      const timeLeft = expireAt - now;
      
      return {
        isAuthenticated: !isExpired,
        tokenInfo: {
          token,
          tokenType,
          expireAt,
          isExpired,
          timeLeft
        },
        error: isExpired ? 'Token has expired' : null
      };
    } catch (error) {
      return {
        isAuthenticated: false,
        tokenInfo: null,
        error: `Error checking auth status: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Enhanced login with better error handling
   */
  public async login(userIdentifier?: string, password?: string): Promise<AuthStatus> {
    try {
      const response = await baseLogin(userIdentifier, password);
      const { tokenType, accessToken, expireAt } = response.data;
      
      // Validate the response
      if (!accessToken) {
        return {
          isAuthenticated: false,
          tokenInfo: null,
          error: 'No access token received from server'
        };
      }
      
      // Store the token
      setTokenType(tokenType || 'jws');
      setAccessToken(accessToken);
      setTokenExpireAt(expireAt || 0);
      
      // Verify the token was stored correctly
      const storedToken = getAccessToken();
      if (!storedToken) {
        return {
          isAuthenticated: false,
          tokenInfo: null,
          error: 'Failed to store access token'
        };
      }
      
      return this.getAuthStatus();
    } catch (error) {
      return {
        isAuthenticated: false,
        tokenInfo: null,
        error: `Login failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Logout and clear tokens
   */
  public logout(): void {
    baseLogout();
  }
  
  /**
   * Refresh token if needed (placeholder for future implementation)
   */
  public async refreshTokenIfNeeded(): Promise<boolean> {
    const status = this.getAuthStatus();
    
    if (!status.isAuthenticated || !status.tokenInfo) {
      return false;
    }
    
    // If token expires within 5 minutes, refresh it
    if (status.tokenInfo.timeLeft < 5 * 60 * 1000) {
      // TODO: Implement token refresh logic
      console.warn('Token refresh not implemented yet');
      return false;
    }
    
    return true;
  }
  
  /**
   * Get authorization header value
   */
  public getAuthHeader(): string | null {
    const status = this.getAuthStatus();
    
    if (!status.isAuthenticated || !status.tokenInfo) {
      return null;
    }
    
    return `${status.tokenInfo.tokenType} ${status.tokenInfo.token}`;
  }
  
  /**
   * Validate token format
   */
  public validateTokenFormat(token: string): { isValid: boolean; error?: string } {
    if (!token) {
      return { isValid: false, error: 'Token is empty' };
    }
    
    // Basic JWT format validation (header.payload.signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { isValid: false, error: 'Invalid JWT format (should have 3 parts separated by dots)' };
    }
    
    try {
      // Try to decode header and payload (basic validation)
      JSON.parse(atob(parts[0]));
      JSON.parse(atob(parts[1]));
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid JWT payload encoding' };
    }
  }
  
  /**
   * Decode JWT payload (for debugging purposes only)
   */
  public decodeJWTPayload(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      return JSON.parse(atob(parts[1]));
    } catch (error) {
      throw new Error(`Failed to decode JWT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();