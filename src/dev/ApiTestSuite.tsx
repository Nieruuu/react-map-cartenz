import { useState, useEffect } from "react";
import {
  apiTestFramework,
  setupDefaultMocks,
  type TestResult,
  type TestSuite,
} from "../lib/api/testFramework";

export default function ApiTestSuite() {
  const [isRunning, setIsRunning] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [currentTest, setCurrentTest] = useState("");
  const [testSuite, setTestSuite] = useState<TestSuite | null>(null);
  const [selectedError, setSelectedError] = useState<TestResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Setup default mocks for development
    setupDefaultMocks();
    apiTestFramework.setMockMode(mockMode);
  }, [mockMode]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const runTestSuite = async () => {
    setIsRunning(true);
    setLogs([]);
    setTestSuite(null);
    setSelectedError(null);

    addLog("Starting comprehensive API test suite...");
    addLog(`Mock mode: ${mockMode ? "ENABLED" : "DISABLED"}`);

    try {
      // Clear previous logs
      apiTestFramework.clearLogs();

      // Run the comprehensive test suite
      const suite = await apiTestFramework.runComprehensiveTestSuite();
      setTestSuite(suite);

      addLog(
        `Test suite completed: ${suite.summary.passed}/${suite.summary.total} passed`
      );

      if (suite.summary.failed > 0) {
        addLog(`${suite.summary.failed} tests failed - check details below`);
      }

      // Log individual test results
      suite.tests.forEach((test) => {
        const status = test.status === "success" ? "✅" : "❌";
        addLog(
          `${status} ${test.endpoint} (${test.responseTime}ms) ${
            test.errorId || ""
          }`
        );
        if (test.error) {
          addLog(`   Error: ${test.error}`);
        }
      });
    } catch (error: unknown) {
      const err = error as Error;
      addLog(`Test suite failed: ${err.message}`);
    } finally {
      setIsRunning(false);
      setCurrentTest("");
    }
  };

  const runSingleTest = async (
    testName: string,
    testFunction: () => Promise<TestResult>
  ) => {
    setCurrentTest(testName);
    addLog(`Running test: ${testName}...`);

    try {
      const result = await testFunction();
      const status = result.status === "success" ? "✅" : "❌";
      addLog(`${status} ${testName} (${result.responseTime}ms)`);
      if (result.error) {
        addLog(`   Error: ${result.error}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      addLog(`❌ ${testName} failed: ${err.message}`);
    } finally {
      setCurrentTest("");
    }
  };

  const getErrorColor = (status: string) => {
    switch (status) {
      case "success":
        return "#10b981";
      case "error":
        return "#ef4444";
      case "timeout":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const getTroubleshootingSteps = (errorId: string) => {
    return apiTestFramework.getTroubleshootingGuide(errorId);
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ddd",
        padding: 12,
        borderRadius: 6,
        width: "500px",
        maxHeight: "80vh",
        overflowY: "auto",
      }}
    >
      <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>API Test Suite</h3>

      {/* Controls */}
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          onClick={runTestSuite}
          disabled={isRunning}
          style={{
            padding: "6px 12px",
            border: "1px solid #888",
            borderRadius: 4,
            background: isRunning ? "#ccc" : "#3b82f6",
            color: "white",
            cursor: isRunning ? "not-allowed" : "pointer",
          }}
        >
          {isRunning ? `Running: ${currentTest}` : "Run Full Test Suite"}
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={mockMode}
            onChange={(e) => setMockMode(e.target.checked)}
          />
          Mock Mode
        </label>

        <button
          onClick={() => {
            setLogs([]);
            setTestSuite(null);
            setSelectedError(null);
          }}
          style={{
            padding: "4px 8px",
            border: "1px solid #888",
            borderRadius: 4,
            background: "#f3f4f6",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>

      {/* Quick Test Buttons */}
      <div
        style={{ marginBottom: 12, display: "flex", gap: 4, flexWrap: "wrap" }}
      >
        <button
          onClick={() =>
            runSingleTest("Auth", () => apiTestFramework.testAuthentication())
          }
          disabled={isRunning}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          Auth
        </button>
        <button
          onClick={() =>
            runSingleTest("List", () =>
              apiTestFramework.testSpatialFeatureList()
            )
          }
          disabled={isRunning}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          List
        </button>
        <button
          onClick={() =>
            runSingleTest("With Include", () =>
              apiTestFramework.testSpatialFeatureList({
                include: ["attribute"],
              })
            )
          }
          disabled={isRunning}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          With Include
        </button>
        <button
          onClick={() =>
            runSingleTest("With Filter", () =>
              apiTestFramework.testSpatialFeatureList({
                filter: ["status|eq|1"],
              })
            )
          }
          disabled={isRunning}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          With Filter
        </button>
        <button
          onClick={() =>
            runSingleTest("By ID", () =>
              apiTestFramework.testSpatialFeatureById(1)
            )
          }
          disabled={isRunning}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          By ID
        </button>
        <button
          onClick={() =>
            runSingleTest("Count", () =>
              apiTestFramework.testSpatialFeatureCount()
            )
          }
          disabled={isRunning}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          Count
        </button>
        <button
          onClick={() =>
            runSingleTest("Direct", () =>
              apiTestFramework.testSpatialFeatureDirect()
            )
          }
          disabled={isRunning}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: 3,
            backgroundColor: "#e0f2fe",
            color: "#0369a1",
          }}
        >
          Direct (Postman)
        </button>
      </div>

      {/* Test Results Summary */}
      {testSuite && (
        <div
          style={{
            marginBottom: 12,
            padding: 8,
            background: "#f9fafb",
            borderRadius: 4,
            border: "1px solid #e5e7eb",
          }}
        >
          <h4 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
            Test Results Summary
          </h4>
          <div style={{ display: "flex", gap: 12, fontSize: "12px" }}>
            <span>
              Total: <strong>{testSuite.summary.total}</strong>
            </span>
            <span style={{ color: "#10b981" }}>
              Passed: <strong>{testSuite.summary.passed}</strong>
            </span>
            <span style={{ color: "#ef4444" }}>
              Failed: <strong>{testSuite.summary.failed}</strong>
            </span>
            <span>
              Avg Time:{" "}
              <strong>
                {Math.round(testSuite.summary.averageResponseTime)}ms
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Test Results Details */}
      {testSuite && (
        <div style={{ marginBottom: 12 }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
            Test Results
          </h4>
          <div style={{ fontSize: "12px" }}>
            {testSuite.tests.map((test, index) => (
              <div
                key={index}
                onClick={() =>
                  test.status === "error" && setSelectedError(test)
                }
                style={{
                  padding: "4px 6px",
                  margin: "2px 0",
                  background: test.status === "error" ? "#fef2f2" : "#f9fafb",
                  border: `1px solid ${
                    test.status === "error" ? "#fecaca" : "#e5e7eb"
                  }`,
                  borderRadius: 3,
                  cursor: test.status === "error" ? "pointer" : "default",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      color: getErrorColor(test.status),
                      marginRight: 4,
                    }}
                  >
                    {test.status === "success" ? "✅" : "❌"}
                  </span>
                  <span>{test.endpoint}</span>
                  {test.errorId && (
                    <span style={{ color: "#6b7280", marginLeft: 4 }}>
                      ({test.errorId})
                    </span>
                  )}
                </div>
                <span style={{ color: "#6b7280" }}>{test.responseTime}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Details */}
      {selectedError && (
        <div
          style={{
            marginBottom: 12,
            padding: 8,
            background: "#fef2f2",
            borderRadius: 4,
            border: "1px solid #fecaca",
          }}
        >
          <h4
            style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#dc2626" }}
          >
            Error Details: {selectedError.errorId}
          </h4>
          <div style={{ fontSize: "12px" }}>
            <div>
              <strong>Endpoint:</strong> {selectedError.endpoint}
            </div>
            <div>
              <strong>Status:</strong> {selectedError.statusCode}
            </div>
            <div>
              <strong>Error:</strong> {selectedError.error}
            </div>
            <div>
              <strong>Time:</strong> {selectedError.timestamp}
            </div>

            {selectedError.params && (
              <div>
                <strong>Params:</strong> {JSON.stringify(selectedError.params)}
              </div>
            )}

            {selectedError.errorId && (
              <div style={{ marginTop: 8 }}>
                <strong>Troubleshooting Steps:</strong>
                <ol style={{ margin: "4px 0 0 16px", paddingLeft: 16 }}>
                  {getTroubleshootingSteps(selectedError.errorId).map(
                    (step, index) => (
                      <li key={index} style={{ margin: "2px 0" }}>
                        {step}
                      </li>
                    )
                  )}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logs */}
      <div>
        <h4 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Logs</h4>
        <div
          style={{
            background: "#1f2937",
            color: "#f9fafb",
            padding: 8,
            borderRadius: 4,
            fontSize: "11px",
            fontFamily: "monospace",
            maxHeight: "150px",
            overflowY: "auto",
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: "#9ca3af" }}>No logs yet...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} style={{ margin: "2px 0" }}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
