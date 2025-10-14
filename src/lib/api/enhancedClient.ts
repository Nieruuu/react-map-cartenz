// src/lib/api/enhancedClient.ts
import { API_BASE_URL } from '../config';
import { authService } from './authService';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface EnhancedRequestOptions {
  params?: Record<string, unknown>;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  retryAuth?: boolean; // Whether to retry with fresh auth on 401
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * Enhanced API client with better authentication handling and error reporting
 */
export class EnhancedApiClient {
  private baseUrl: string;
  
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || API_BASE_URL;
  }
  
  /**
   * Build URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`, window.location.origin);
    
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        
        if (key.endsWith('[]')) {
          if (Array.isArray(value)) {
            value.forEach(val => url.searchParams.append(key, String(val)));
          } else {
            url.searchParams.append(key, String(value));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    
    return url.toString();
  }
  
  /**
   * Make HTTP request with enhanced error handling
   */
  private async makeRequest<T>(
    method: HttpMethod,
    path: string,
    options: EnhancedRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, body, auth = true, headers = {}, retryAuth = true } = options;
    
    let url = this.buildUrl(path, params);
    
    const init: RequestInit = {
      method,
      headers: {
        'Accept': '*/*',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      }
    };
    
    // Add authentication header if required
    if (auth) {
      const authHeader = authService.getAuthHeader();
      if (authHeader) {
        (init.headers as Record<string, string>).Authorization = authHeader;
      }
    }
    
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    
    try {
      const response = await fetch(url, init);
      const responseText = await response.text();
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      const data = isJson && responseText ? JSON.parse(responseText) : responseText;
      
      // Convert headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      // Handle authentication errors with retry logic
      if (response.status === 401 && retryAuth && auth) {
        console.warn('Received 401 Unauthorized, attempting to refresh authentication...');
        
        // Try to refresh authentication status
        const authStatus = authService.getAuthStatus();
        if (authStatus.error && authStatus.error.includes('expired')) {
          // Token is expired, try to login again
          const loginResult = await authService.login();
          if (loginResult.isAuthenticated) {
            console.log('Authentication refreshed, retrying request...');
            // Retry the request with new token
            return this.makeRequest<T>(method, path, { ...options, retryAuth: false });
          }
        }
      }
      
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${responseText.slice(0, 800)}`);
        (error as any).status = response.status;
        (error as any).statusText = response.statusText;
        (error as any).url = url;
        (error as any).response = data;
        (error as any).headers = responseHeaders;
        throw error;
      }
      
      return {
        data: data as T,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      };
    } catch (error) {
      // Enhance error with more context
      if (error instanceof Error) {
        (error as any).url = url;
        (error as any).method = method;
        (error as any).authRequired = auth;
        (error as any).authStatus = auth ? authService.getAuthStatus() : null;
      }
      throw error;
    }
  }
  
  /**
   * GET request
   */
  public async get<T>(path: string, params?: Record<string, unknown>, options: Omit<EnhancedRequestOptions, 'params'> = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('GET', path, { ...options, params });
  }
  
  /**
   * POST request
   */
  public async post<T>(path: string, body?: unknown, params?: Record<string, unknown>, options: Omit<EnhancedRequestOptions, 'body' | 'params'> = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('POST', path, { ...options, body, params });
  }
  
  /**
   * PATCH request
   */
  public async patch<T>(path: string, body?: unknown, params?: Record<string, unknown>, options: Omit<EnhancedRequestOptions, 'body' | 'params'> = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('PATCH', path, { ...options, body, params });
  }
  
  /**
   * DELETE request
   */
  public async delete<T>(path: string, params?: Record<string, unknown>, options: Omit<EnhancedRequestOptions, 'params'> = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('DELETE', path, { ...options, params });
  }
  
  /**
   * Test authentication with a simple request
   */
  public async testAuth(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const response = await this.get('/spatial-feature', { page: { number: 1, size: 1 } });
      return {
        success: true,
        details: {
          status: response.status,
          statusText: response.statusText,
          hasData: !!response.data
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: {
          status: (error as any).status,
          statusText: (error as any).statusText,
          url: (error as any).url,
          authStatus: (error as any).authStatus
        }
      };
    }
  }
}

// Export singleton instance
export const enhancedApiClient = new EnhancedApiClient();