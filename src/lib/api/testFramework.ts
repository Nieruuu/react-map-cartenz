import { request } from './client';
import { buildParams } from './qs';
import { getSpatialFeaturesDirect } from './spatialFeature';
import type { SpatialFeatureRow, Paged } from './spatialFeature';

export interface TestResult {
  endpoint: string;
  method: string;
  params?: Record<string, unknown>;
  status: 'success' | 'error' | 'timeout';
  statusCode?: number;
  responseTime: number;
  error?: string;
  errorId?: string;
  data?: unknown;
  headers?: Record<string, string>;
  timestamp: string;
}

export interface TestSuite {
  name: string;
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    timeouts: number;
    averageResponseTime: number;
  };
}

export interface MockResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
  delay?: number;
}

class ApiTestFramework {
  private mockMode: boolean = false;
  private mockResponses: Map<string, MockResponse> = new Map();
  private errorLog: TestResult[] = [];
  private testSuites: TestSuite[] = [];

  // Enable/disable mock mode for development
  setMockMode(enabled: boolean) {
    this.mockMode = enabled;
  }

  // Register mock responses for testing
  registerMockResponse(endpoint: string, mock: MockResponse) {
    this.mockResponses.set(endpoint, mock);
  }

  // Get detailed error information
  getErrorLog(): TestResult[] {
    return [...this.errorLog];
  }

  // Get all test suites
  getTestSuites(): TestSuite[] {
    return [...this.testSuites];
  }

  // Clear error log and test suites
  clearLogs() {
    this.errorLog = [];
    this.testSuites = [];
  }

  // Enhanced request method with detailed logging
  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    params?: Record<string, unknown>,
    body?: unknown,
    errorId?: string
  ): Promise<TestResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    try {
      // Check for mock response
      if (this.mockMode && this.mockResponses.has(endpoint)) {
        const mock = this.mockResponses.get(endpoint)!;
        if (mock.delay) {
          await new Promise(resolve => setTimeout(resolve, mock.delay));
        }
        
        return {
          endpoint,
          method,
          params,
          status: mock.status >= 400 ? 'error' : 'success',
          statusCode: mock.status,
          responseTime: Date.now() - startTime,
          data: mock.data,
          headers: mock.headers || {},
          timestamp,
          error: mock.status >= 400 ? `Mock error: ${mock.status}` : undefined,
          errorId
        };
      }

      // Make actual request
      const response = await request<T>(
        method,
        endpoint,
        { params, body, auth: true }
      );
      
      const responseTime = Date.now() - startTime;
      
      return {
        endpoint,
        method,
        params,
        status: 'success',
        responseTime,
        data: response,
        timestamp
      };
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;
      const err = error as Error & { status?: number };
      const result: TestResult = {
        endpoint,
        method,
        params,
        status: 'error',
        statusCode: err.status,
        responseTime,
        error: err.message || 'Unknown error',
        errorId,
        timestamp
      };

      // Log detailed error information
      this.logDetailedError(err, errorId || 'unknown', endpoint, params);
      
      return result;
    }
  }

  // Detailed error logging
  private logDetailedError(error: Error & { status?: number; url?: string; stack?: string; responseBody?: string }, errorId: string, endpoint: string, params?: unknown) {
    const errorDetails = {
      errorId,
      endpoint,
      method: 'GET',
      params,
      message: error.message,
      status: error.status,
      url: error.url,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      // Add any additional debugging info
      requestHeaders: this.getLastRequestHeaders(),
      responseBody: error.responseBody || 'Not available'
    };

    this.errorLog.push({
      ...errorDetails,
      status: 'error',
      responseTime: 0,
      timestamp: errorDetails.timestamp
    } as TestResult);

    console.error(`API Error [${errorId}]:`, errorDetails);
  }

  // Helper to get last request headers (would need to be implemented in client.ts)
  private getLastRequestHeaders(): Record<string, string> {
    // This would need to be tracked in the client.ts
    return {};
  }

  // Test authentication
  async testAuthentication(): Promise<TestResult> {
    return this.makeRequest('POST', '/auth/request-token', undefined, {
      userIdentifier: 'sa',
      password: 'pass@word1'
    }, 'auth-test');
  }

  // Test spatial-feature list endpoint
  async testSpatialFeatureList(params?: {
    page?: { number?: number; size?: number };
    include?: string[];
    filter?: string[];
  }, errorId?: string): Promise<TestResult> {
    const queryParams = params ? buildParams(params) : undefined;
    return this.makeRequest<Paged<SpatialFeatureRow>>(
      'GET',
      '/spatial-feature',
      queryParams,
      undefined,
      errorId || 'spatial-feature-list'
    );
  }

  // Test spatial-feature by ID endpoint
  async testSpatialFeatureById(id: number | string, errorId?: string): Promise<TestResult> {
    return this.makeRequest<{ data: SpatialFeatureRow }>(
      'GET',
      `/spatial-feature/${id}`,
      { 'include[]': 'attribute' },
      undefined,
      errorId || `spatial-feature-${id}`
    );
  }

  // Test spatial-feature count endpoint
  async testSpatialFeatureCount(params?: Record<string, unknown>, errorId?: string): Promise<TestResult> {
    return this.makeRequest<{ data: number }>(
      'GET',
      '/spatial-feature/count',
      params,
      undefined,
      errorId || 'spatial-feature-count'
    );
  }

  // Test direct fetch implementation (matches Postman exactly)
  async testSpatialFeatureDirect(errorId?: string): Promise<TestResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    try {
      // Check for mock response
      if (this.mockMode && this.mockResponses.has('/spatial-feature')) {
        const mock = this.mockResponses.get('/spatial-feature')!;
        if (mock.delay) {
          await new Promise(resolve => setTimeout(resolve, mock.delay));
        }
        
        return {
          endpoint: '/spatial-feature (direct)',
          method: 'GET',
          status: mock.status >= 400 ? 'error' : 'success',
          statusCode: mock.status,
          responseTime: Date.now() - startTime,
          data: mock.data,
          headers: mock.headers || {},
          timestamp,
          error: mock.status >= 400 ? `Mock error: ${mock.status}` : undefined,
          errorId
        };
      }

      // Use direct fetch implementation
      const response = await getSpatialFeaturesDirect(true);
      const responseTime = Date.now() - startTime;
      
      return {
        endpoint: '/spatial-feature (direct)',
        method: 'GET',
        status: 'success',
        responseTime,
        data: response,
        timestamp
      };
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;
      const err = error as Error & { status?: number };
      const result: TestResult = {
        endpoint: '/spatial-feature (direct)',
        method: 'GET',
        status: 'error',
        statusCode: err.status,
        responseTime,
        error: err.message || 'Unknown error',
        errorId,
        timestamp
      };

      // Log detailed error information
      this.logDetailedError(err, errorId || 'spatial-feature-direct', '/spatial-feature (direct)');
      
      return result;
    }
  }

  // Run comprehensive test suite
  async runComprehensiveTestSuite(): Promise<TestSuite> {
    const suiteName = 'Spatial Feature API Comprehensive Test';
    const tests: TestResult[] = [];

    // Test 1: Authentication
    console.log('Testing authentication...');
    const authTest = await this.testAuthentication();
    tests.push(authTest);

    if (authTest.status === 'success') {
      // Test 2: Basic spatial-feature list
      console.log('Testing spatial-feature list...');
      const basicListTest = await this.testSpatialFeatureList(
        { page: { number: 1, size: 10 } },
        '8b4ioiao9'
      );
      tests.push(basicListTest);

      // Test 3: Spatial-feature list with include
      console.log('Testing spatial-feature list with include...');
      const includeTest = await this.testSpatialFeatureList(
        { 
          page: { number: 1, size: 5 },
          include: ['attribute']
        },
        '8b4ioibad'
      );
      tests.push(includeTest);

      // Test 4: Spatial-feature list with filter
      console.log('Testing spatial-feature list with filter...');
      const filterTest = await this.testSpatialFeatureList(
        {
          page: { number: 1, size: 5 },
          filter: ['status|eq|1']
        },
        '8b4ioibih'
      );
      tests.push(filterTest);

      // Test 5: Spatial-feature list with pagination
      console.log('Testing spatial-feature pagination...');
      const paginationTest = await this.testSpatialFeatureList(
        { page: { number: 2, size: 5 } },
        '8b4ioibpo'
      );
      tests.push(paginationTest);

      // Test 6: Spatial-feature by ID (using a sample ID)
      console.log('Testing spatial-feature by ID...');
      const byIdTest = await this.testSpatialFeatureById(1, '8b4ioic4a');
      tests.push(byIdTest);

      // Test 7: Spatial-feature count
      console.log('Testing spatial-feature count...');
      const countTest = await this.testSpatialFeatureCount(undefined, '8b4ioicad');
      tests.push(countTest);

      // Test 8: Direct fetch (Postman-style)
      console.log('Testing spatial-feature direct fetch...');
      const directTest = await this.testSpatialFeatureDirect('8b4ioicdirect');
      tests.push(directTest);
    }

    // Calculate summary
    const summary = {
      total: tests.length,
      passed: tests.filter(t => t.status === 'success').length,
      failed: tests.filter(t => t.status === 'error').length,
      timeouts: tests.filter(t => t.status === 'timeout').length,
      averageResponseTime: tests.reduce((sum, t) => sum + t.responseTime, 0) / tests.length
    };

    const testSuite: TestSuite = {
      name: suiteName,
      tests,
      summary
    };

    this.testSuites.push(testSuite);
    return testSuite;
  }

  // Get troubleshooting guide for specific error IDs
  getTroubleshootingGuide(errorId: string): string[] {
    const guides: Record<string, string[]> = {
      '8b4ioiao9': [
        'Basic spatial-feature list endpoint error',
        'Check if the API server is running',
        'Verify the endpoint path: /api/spatial-feature',
        'Check authentication token validity',
        'Review server logs for detailed error information'
      ],
      '8b4ioibad': [
        'Include parameter error',
        'Verify the include[] parameter format',
        'Check if "attribute" is a valid include resource',
        'Ensure the backend supports the include parameter'
      ],
      '8b4ioibih': [
        'Filter parameter error',
        'Check filter syntax: "field|operator|value"',
        'Verify the field names are correct',
        'Ensure the operator is supported (eq, ne, gt, lt, etc.)'
      ],
      '8b4ioibpo': [
        'Pagination error',
        'Check page[number] and page[size] parameters',
        'Verify the page number is valid',
        'Ensure the page size is within allowed limits'
      ],
      '8b4ioic4a': [
        'Spatial feature by ID error',
        'Verify the feature ID exists',
        'Check if the ID format is correct',
        'Ensure the endpoint supports the include parameter'
      ],
      '8b4ioicad': [
        'Count endpoint error',
        'Check if the count endpoint is implemented',
        'Verify the endpoint path: /api/spatial-feature/count',
        'Review server logs for count-specific errors'
      ],
      '8b4ioicdirect': [
        'Direct fetch implementation error',
        'Check Bearer token format and validity',
        'Verify the URL matches Postman exactly',
        'Ensure empty body is included in GET request',
        'Check network connectivity to the API server'
      ]
    };

    return guides[errorId] || [
      'Unknown error ID',
      'Check the error message for details',
      'Review the request parameters',
      'Contact the API development team'
    ];
  }
  // Add these methods for enhanced logging
  logSuccess(testName: string, data?: any) {
    const result: TestResult = {
      endpoint: testName,
      method: 'CUSTOM',
      status: 'success',
      responseTime: 0,
      timestamp: new Date().toISOString(),
      data
    };
    this.errorLog.push(result);
  }

  logError(testName: string, error: Error & { status?: number }, params?: Record<string, unknown>) {
    const result: TestResult = {
      endpoint: testName,
      method: 'CUSTOM',
      status: 'error',
      statusCode: error.status,
      responseTime: 0,
      error: error.message,
      timestamp: new Date().toISOString(),
      params
    };
    this.errorLog.push(result);
  }
}

// Export singleton instance
export const apiTestFramework = new ApiTestFramework();

// Register default mock responses for development
export const setupDefaultMocks = () => {
  // Mock successful authentication
  apiTestFramework.registerMockResponse('/auth/request-token', {
    status: 200,
    data: {
      data: {
        tokenType: 'jws',
        accessToken: 'mock-token-for-development',
        expireAt: Date.now() + 3600000
      }
    },
    delay: 100
  });

  // Mock spatial-feature list
  apiTestFramework.registerMockResponse('/spatial-feature', {
    status: 200,
    data: {
      total: 100,
      pageNumber: 1,
      pageSize: 10,
      data: Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        attribute: [
          { attributeKey: 'name', attributeValue: `Feature ${i + 1}` },
          { attributeKey: 'type', attributeValue: 'polygon' }
        ]
      }))
    },
    delay: 200
  });

  // Mock spatial-feature by ID
  apiTestFramework.registerMockResponse('/spatial-feature/1', {
    status: 200,
    data: {
      data: {
        id: 1,
        attribute: [
          { attributeKey: 'name', attributeValue: 'Sample Feature' },
          { attributeKey: 'type', attributeValue: 'polygon' }
        ]
      }
    },
    delay: 150
  });

  // Mock spatial-feature count
  apiTestFramework.registerMockResponse('/spatial-feature/count', {
    status: 200,
    data: { data: 100 },
    delay: 100
  });
};