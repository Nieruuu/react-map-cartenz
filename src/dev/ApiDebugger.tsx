/**
 * Comprehensive debugging tools for SmartGov API
 * Proper error logging and token validation
 */

import { useState, useEffect } from "react";
import { auth, type AuthState } from "../lib/api/auth";
import { listSpatialGeneric } from "../lib/api/spatialGeneric";
import {
  transformSpatialRows,
  validateTransformedFeatures,
} from "../lib/api/transformers";
import { simpleWKTToFeature } from "../lib/geo/simpleWKTConverter";
import { API_BASE } from "../lib/api/client";

interface DebugLog {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "success";
  message: string;
  details?: any;
}

interface TestResult {
  name: string;
  status: "pending" | "success" | "error";
  message: string;
  details?: any;
  duration?: number;
}

export default function ApiDebugger() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "status" | "tests" | "logs" | "auth"
  >("status");

  // Add log entry
  const addLog = (level: DebugLog["level"], message: string, details?: any) => {
    const log: DebugLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message,
      details,
    };
    setLogs((prev) => [log, ...prev].slice(0, 100)); // Keep last 100 logs
  };

  // Update auth state and log changes
  useEffect(() => {
    const updateAuthState = () => {
      const newAuthState = auth.getAuthState();
      setAuthState(newAuthState);

      if (newAuthState.isAuthenticated) {
        addLog("success", "Authentication state updated", {
          tokenPresent: !!newAuthState.token,
          tokenType: newAuthState.tokenType,
          expiresAt: newAuthState.expiresAt
            ? new Date(newAuthState.expiresAt).toISOString()
            : null,
        });
      }
    };

    updateAuthState();

    const interval = setInterval(updateAuthState, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Run comprehensive API tests
  const runTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);

    const tests: TestResult[] = [
      {
        name: "Authentication Check",
        status: "pending",
        message: "Checking authentication...",
      },
      {
        name: "Token Validation",
        status: "pending",
        message: "Validating token...",
      },
      {
        name: "API Connectivity",
        status: "pending",
        message: "Testing API connection...",
      },
      {
        name: "Spatial Feature List",
        status: "pending",
        message: "Fetching spatial features...",
      },
      {
        name: "Data Transformation",
        status: "pending",
        message: "Testing data transformation...",
      },
      {
        name: "WKT Conversion",
        status: "pending",
        message: "Testing WKT conversion...",
      },
    ];

    setTestResults(tests);

    // Test 1: Authentication Check
    try {
      const startTime = Date.now();
      const authStatus = auth.getAuthState();
      const duration = Date.now() - startTime;

      if (authStatus.isAuthenticated && authStatus.token) {
        tests[0] = {
          ...tests[0],
          status: "success",
          message: "Authentication successful",
          details: {
            tokenType: authStatus.tokenType,
            tokenLength: authStatus.token.length,
            expiresAt: authStatus.expiresAt,
          },
          duration,
        };
        addLog("success", "Authentication check passed", tests[0].details);
      } else {
        tests[0] = {
          ...tests[0],
          status: "error",
          message: "Not authenticated",
          details: authStatus,
          duration,
        };
        addLog("error", "Authentication check failed", tests[0].details);
      }
    } catch (error) {
      tests[0] = {
        ...tests[0],
        status: "error",
        message: `Authentication check failed: ${error}`,
        details: error,
      };
      addLog("error", "Authentication check error", error);
    }

    setTestResults([...tests]);

    // Test 2: Token Validation
    if (tests[0].status === "success") {
      try {
        const startTime = Date.now();
        const isValid = !!auth.getToken();
        const duration = Date.now() - startTime;

        if (isValid) {
          tests[1] = {
            ...tests[1],
            status: "success",
            message: "Token is valid",
            duration,
          };
          addLog("success", "Token validation passed");
        } else {
          tests[1] = {
            ...tests[1],
            status: "error",
            message: "Token validation failed",
            duration,
          };
          addLog("error", "Token validation failed");
        }
      } catch (error) {
        tests[1] = {
          ...tests[1],
          status: "error",
          message: `Token validation error: ${error}`,
          details: error,
        };
        addLog("error", "Token validation error", error);
      }
    } else {
      tests[1] = {
        ...tests[1],
        status: "error",
        message: "Skipped - authentication required",
      };
    }

    setTestResults([...tests]);

    // Test 3: API Connectivity
    if (tests[0].status === "success") {
      try {
        const startTime = Date.now();
        const response = await fetch(
          `${API_BASE}/spatial-feature?page[number]=1&page[size]=1`,
          {
            headers: auth.getAuthHeader(),
          }
        );
        const duration = Date.now() - startTime;

        if (response.ok) {
          tests[2] = {
            ...tests[2],
            status: "success",
            message: `API connection successful (${response.status})`,
            details: {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
            },
            duration,
          };
          addLog("success", "API connectivity test passed", tests[2].details);
        } else {
          tests[2] = {
            ...tests[2],
            status: "error",
            message: `API connection failed (${response.status})`,
            details: {
              status: response.status,
              statusText: response.statusText,
            },
            duration,
          };
          addLog("error", "API connectivity test failed", tests[2].details);
        }
      } catch (error) {
        tests[2] = {
          ...tests[2],
          status: "error",
          message: `API connectivity error: ${error}`,
          details: error,
        };
        addLog("error", "API connectivity error", error);
      }
    } else {
      tests[2] = {
        ...tests[2],
        status: "error",
        message: "Skipped - authentication required",
      };
    }

    setTestResults([...tests]);

    // Test 4: Spatial Feature List
    if (tests[2].status === "success") {
      try {
        const startTime = Date.now();
        const response = await listSpatialGeneric({
          pageNumber: 1,
          pageSize: 5,
          include: ["attribute"],
        });
        const duration = Date.now() - startTime;

        tests[3] = {
          ...tests[3],
          status: "success",
          message: `Loaded ${response.data.length} features`,
          details: {
            total: response.total,
            pageNumber: response.pageNumber,
            pageSize: response.pageSize,
            dataCount: response.data.length,
          },
          duration,
        };
        addLog("success", "Spatial feature list test passed", tests[3].details);
      } catch (error) {
        tests[3] = {
          ...tests[3],
          status: "error",
          message: `Spatial feature list failed: ${error}`,
          details: error,
        };
        addLog("error", "Spatial feature list error", error);
      }
    } else {
      tests[3] = {
        ...tests[3],
        status: "error",
        message: "Skipped - previous tests failed",
      };
    }

    setTestResults([...tests]);

    // Test 5: Data Transformation
    if (tests[3].status === "success" && tests[3].details?.dataCount > 0) {
      try {
        const startTime = Date.now();
        const mockData = {
          id: 1,
          value: "test-uuid",
          attribute: [
            {
              attributeKey: "spatialFeature.refWilayah",
              attributeValue: "Test Feature",
            },
            {
              attributeKey: "spatialFeature.geometry",
              attributeValue: "POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))",
            },
            { attributeKey: "spatialFeature.type", attributeValue: "20000001" },
          ],
        } as any;

        const transformed = transformSpatialRows([mockData]);
        const validation = validateTransformedFeatures(transformed);
        const duration = Date.now() - startTime;

        if (validation.valid.length > 0) {
          tests[4] = {
            ...tests[4],
            status: "success",
            message: `Transformed ${validation.valid.length} features`,
            details: {
              valid: validation.valid.length,
              invalid: validation.invalid.length,
              sampleFeature: validation.valid[0],
            },
            duration,
          };
          addLog(
            "success",
            "Data transformation test passed",
            tests[4].details
          );
        } else {
          tests[4] = {
            ...tests[4],
            status: "error",
            message: "No valid features after transformation",
            details: validation,
          };
          addLog("error", "Data transformation failed", validation);
        }
      } catch (error) {
        tests[4] = {
          ...tests[4],
          status: "error",
          message: `Data transformation error: ${error}`,
          details: error,
        };
        addLog("error", "Data transformation error", error);
      }
    } else {
      tests[4] = {
        ...tests[4],
        status: "error",
        message: "Skipped - no test data available",
      };
    }

    setTestResults([...tests]);

    // Test 6: WKT Conversion
    try {
      const startTime = Date.now();
      const testWKT =
        "POLYGON((107.0 -7.0, 108.0 -7.0, 108.0 -6.0, 107.0 -6.0, 107.0 -7.0))";
      const feature = simpleWKTToFeature(testWKT, { name: "Test Feature" });
      const duration = Date.now() - startTime;

      if (feature) {
        tests[5] = {
          ...tests[5],
          status: "success",
          message: "WKT conversion successful",
          details: {
            geometryType: feature.getGeometry()?.getType(),
            success: true,
          },
          duration,
        };
        addLog("success", "WKT conversion test passed", tests[5].details);
      } else {
        tests[5] = {
          ...tests[5],
          status: "error",
          message: "WKT conversion failed",
          details: {
            error: "Simple WKT conversion failed",
          },
        };
        addLog(
          "error",
          "WKT conversion failed",
          "Simple WKT conversion failed"
        );
      }
    } catch (error) {
      tests[5] = {
        ...tests[5],
        status: "error",
        message: `WKT conversion error: ${error}`,
        details: error,
      };
      addLog("error", "WKT conversion error", error);
    }

    setTestResults(tests);
    setIsRunningTests(false);

    const successCount = tests.filter((t) => t.status === "success").length;
    const totalCount = tests.length;
    addLog(
      "info",
      `Test suite completed: ${successCount}/${totalCount} tests passed`
    );
  };

  // Login function
  const handleLogin = async () => {
    try {
      addLog("info", "Attempting login...");
      await auth.login({ userIdentifier: "sa", password: "pass@word1" });
      setAuthState(auth.getAuthState());
      addLog("success", "Login successful");
    } catch (error) {
      addLog("error", "Login failed", error);
    }
  };

  // Logout function
  const handleLogout = async () => {
    try {
      addLog("info", "Attempting logout...");
      await auth.logout();
      setAuthState(null);
      addLog("success", "Logout successful");
    } catch (error) {
      addLog("error", "Logout failed", error);
    }
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };

  // Get log level color
  const getLogLevelColor = (level: DebugLog["level"]) => {
    switch (level) {
      case "success":
        return "#059669";
      case "error":
        return "#dc2626";
      case "warn":
        return "#d97706";
      case "info":
        return "#2563eb";
      default:
        return "#6b7280";
    }
  };

  // Get test status color
  const getTestStatusColor = (status: TestResult["status"]) => {
    switch (status) {
      case "success":
        return "#059669";
      case "error":
        return "#dc2626";
      case "pending":
        return "#6b7280";
      default:
        return "#6b7280";
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, marginBottom: 8 }}>API Debugger</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Comprehensive debugging tools for SmartGov API integration
        </p>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {[
          { key: "status", label: "Status" },
          { key: "tests", label: "Tests" },
          { key: "logs", label: "Logs" },
          { key: "auth", label: "Authentication" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? "primary" : "ghost"}`}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              borderBottom:
                activeTab === tab.key ? "2px solid #3b82f6" : "none",
              borderRadius: activeTab === tab.key ? "8px 8px 0 0" : "0",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status Tab */}
      {activeTab === "status" && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>System Status</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 16,
              }}
            >
              {/* Authentication Status */}
              <div
                style={{
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: authState?.isAuthenticated
                    ? "#f0fdf4"
                    : "#fef2f2",
                }}
              >
                <h4 style={{ margin: "0 0 8px 0" }}>Authentication</h4>
                <div style={{ fontSize: 14 }}>
                  <div>
                    Status:{" "}
                    {authState?.isAuthenticated
                      ? "✓ Authenticated"
                      : "✗ Not authenticated"}
                  </div>
                  {authState?.token && (
                    <div>Token: {authState.token.substring(0, 20)}...</div>
                  )}
                  {authState?.expiresAt && (
                    <div>Expires: {auth.getExpirationTimeDisplay()}</div>
                  )}
                </div>
              </div>

              {/* API Status */}
              <div
                style={{
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: "#f9fafb",
                }}
              >
                <h4 style={{ margin: "0 0 8px 0" }}>API Configuration</h4>
                <div style={{ fontSize: 14 }}>
                  <div>Base URL: {API_BASE}</div>
                  <div>
                    Environment:{" "}
                    {import.meta.env.DEV ? "Development" : "Production"}
                  </div>
                  <div>
                    Proxy: {import.meta.env.DEV ? "Enabled" : "Disabled"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              className="btn primary"
              onClick={runTests}
              disabled={isRunningTests}
            >
              {isRunningTests ? "Running Tests..." : "Run Tests"}
            </button>
            <button className="btn ghost" onClick={clearLogs}>
              Clear Logs
            </button>
          </div>
        </div>
      )}

      {/* Tests Tab */}
      {activeTab === "tests" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Test Results</h3>

            {testResults.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "#6b7280",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                }}
              >
                No tests run yet. Click "Run Tests" to start.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {testResults.map((test, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 16,
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      backgroundColor:
                        test.status === "success"
                          ? "#f0fdf4"
                          : test.status === "error"
                          ? "#fef2f2"
                          : "#f9fafb",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontWeight: "bold" }}>{test.name}</div>
                      <div
                        style={{
                          color: getTestStatusColor(test.status),
                          fontSize: 12,
                        }}
                      >
                        {test.status.toUpperCase()}
                        {test.duration && ` (${test.duration}ms)`}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>
                      {test.message}
                    </div>
                    {test.details && (
                      <details>
                        <summary
                          style={{
                            cursor: "pointer",
                            fontSize: 12,
                            color: "#6b7280",
                          }}
                        >
                          Show Details
                        </summary>
                        <pre
                          style={{
                            fontSize: 11,
                            marginTop: 8,
                            padding: 8,
                            backgroundColor: "#f3f4f6",
                            borderRadius: 4,
                            overflow: "auto",
                          }}
                        >
                          {JSON.stringify(test.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn primary"
            onClick={runTests}
            disabled={isRunningTests}
          >
            {isRunningTests ? "Running Tests..." : "Run Tests"}
          </button>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: 0 }}>Debug Logs</h3>
            <button className="btn ghost" onClick={clearLogs}>
              Clear Logs
            </button>
          </div>

          {logs.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#6b7280",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
              }}
            >
              No logs yet. Run tests or perform actions to generate logs.
            </div>
          ) : (
            <div
              style={{
                maxHeight: 500,
                overflow: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
              }}
            >
              {logs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f3f4f6",
                    borderLeft: `4px solid ${getLogLevelColor(log.level)}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        color: getLogLevelColor(log.level),
                        fontSize: 12,
                      }}
                    >
                      {log.level.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {log.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>
                    {log.message}
                  </div>
                  {log.details && (
                    <details>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        Show Details
                      </summary>
                      <pre
                        style={{
                          fontSize: 11,
                          marginTop: 8,
                          padding: 8,
                          backgroundColor: "#f3f4f6",
                          borderRadius: 4,
                          overflow: "auto",
                        }}
                      >
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Authentication Tab */}
      {activeTab === "auth" && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Authentication Management</h3>

            <div
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                backgroundColor: "#f9fafb",
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 8px 0" }}>Current Status</h4>
                <div style={{ fontSize: 14 }}>
                  <div>
                    Authenticated: {authState?.isAuthenticated ? "Yes" : "No"}
                  </div>
                  {authState?.token && (
                    <>
                      <div>Token Type: {authState.tokenType}</div>
                      <div>
                        Token Length: {authState.token.length} characters
                      </div>
                      {authState.expiresAt && (
                        <div>Expires At: {auth.getExpirationTimeDisplay()}</div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  className={
                    authState?.isAuthenticated ? "btn ghost" : "btn primary"
                  }
                  onClick={
                    authState?.isAuthenticated ? handleLogout : handleLogin
                  }
                >
                  {authState?.isAuthenticated ? "Logout" : "Login"}
                </button>
              </div>
            </div>
          </div>

          {/* Token Information */}
          {authState?.token && (
            <div
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                backgroundColor: "#f9fafb",
              }}
            >
              <h4 style={{ margin: "0 0 8px 0" }}>Token Information</h4>
              <div style={{ fontSize: 14 }}>
                <div>Full Token:</div>
                <div
                  style={{
                    padding: 8,
                    backgroundColor: "#f3f4f6",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    fontSize: 12,
                    wordBreak: "break-all",
                    marginTop: 4,
                  }}
                >
                  {authState.token}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
