/**
 * Comprehensive authentication system for SmartGov API
 * Maintains Bearer token in localStorage and automatically adds it to requests
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

export class AuthError extends Error {
  public code?: string;
  
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export class AuthenticationManager {
  private static instance: AuthenticationManager;

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
    
    return {
      token,
      tokenType: 'Bearer',
      expiresAt: null,
      isAuthenticated: !!token,
    };
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
    
    // Always use Bearer token
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Store authentication data
   */
  storeAuthData(response: LoginResponse): void {
    try {
      localStorage.setItem(TOKEN_KEY, response.accessToken);
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
    } catch (error) {
      console.error('Failed to clear auth data:', error);
    }
  }

  /**
   * Login with credentials
   */
  async login(credentials: LoginCredentials): Promise<AuthState> {
    try {
      const response = await fetch('/api/auth/request-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AuthError(
          errorData.message || `Login failed: ${response.status}`,
          `HTTP_${response.status}`
        );
      }

      const loginData: { data: LoginResponse } = await response.json();
      this.storeAuthData(loginData.data);
      
      return this.getAuthState();
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(`Login failed: ${error}`, 'NETWORK_ERROR');
    }
  }

  /**
   * Auto-login with default credentials
   */
  async autoLogin(): Promise<AuthState> {
    return this.login({
      userIdentifier: 'sa',
      password: 'pass@word1'
    });
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