/**
 * Streamlined UI component for selecting and loading API layers without parameters
 * Clean, organized interface replacing the messy loadAPI UI
 */

import { useState, useEffect, useCallback } from "react";
import { listSpatialFeatures } from "../../lib/api/spatialFeature";
import {
  transformSpatialFeatures,
  getUniqueTypeCodes,
} from "../../lib/api/transformers";
import { auth, type AuthState } from "../../lib/api/auth";
import { addApiLayersByType } from "../../features/loadFromApi";
import { useLayersStore } from "../../hooks/useLayersStore";
import { useMapStore } from "../../hooks/useMapStore";

interface LayerInfo {
  id: string;
  name: string;
  typeCode: string;
  count: number;
  description?: string;
}

interface LoadState {
  isLoading: boolean;
  message: string;
  progress?: number;
}

export function SmartGovLoader() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [availableLayers, setAvailableLayers] = useState<LayerInfo[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    isLoading: false,
    message: "",
  });

  // Initialize auth state with auto-login
  useEffect(() => {
    const initializeAuth = async () => {
      const authState = auth.getAuthState();
      setAuthState(authState);

      // Debug logging for SmartGovLoader auth state
      console.debug("SmartGovLoader initial auth state:", {
        isAuthenticated: authState.isAuthenticated,
        hasToken: !!authState.token,
        expiresAt: authState.expiresAt,
      });

      // If not authenticated, try auto-login
      if (!authState.isAuthenticated) {
        try {
          console.debug("Attempting token request in SmartGovLoader...");
          const newAuthState = await auth.ensureAuthenticated(true);
          setAuthState(newAuthState);
          console.debug("SmartGovLoader token request successful:", {
            isAuthenticated: newAuthState.isAuthenticated,
            hasToken: !!newAuthState.token,
          });
        } catch (error) {
          console.warn("SmartGovLoader auto-login failed:", error);
        }
      }
    };

    initializeAuth();

    // Monitor authentication state changes less frequently
    const authCheckInterval = setInterval(() => {
      const currentAuthState = auth.getAuthState();
      setAuthState(currentAuthState);

      // Debug logging for auth state changes
      console.debug("SmartGovLoader auth state check:", {
        isAuthenticated: currentAuthState.isAuthenticated,
        hasToken: !!currentAuthState.token,
        expiresAt: currentAuthState.expiresAt,
      });
    }, 60000); // Check every minute instead of 30 seconds

    return () => {
      clearInterval(authCheckInterval);
    };
  }, []);

  // Load available layer types
  const loadAvailableLayers = useCallback(async () => {
    if (!authState?.isAuthenticated) {
      setLoadState({
        isLoading: false,
        message: "Please authenticate to load layers",
      });
      return;
    }

    setLoadState({
      isLoading: true,
      message: "Discovering available layers...",
    });

    try {
      // Get a small sample to discover available types
      const response = await listSpatialFeatures({
        pageNumber: 1,
        pageSize: 10,
        include: ["attribute"],
      });

      const transformed = transformSpatialFeatures(response.data || []);
      const typeCodes = getUniqueTypeCodes(transformed);

      // Create layer info for each type
      const layers: LayerInfo[] = typeCodes.map((typeCode) => ({
        id: typeCode,
        name: getLayerNameForType(typeCode),
        typeCode,
        count: 0, // Will be updated when loaded
        description: getLayerDescriptionForType(),
      }));

      setAvailableLayers(layers);
      setLoadState({
        isLoading: false,
        message: `Found ${layers.length} layer types`,
      });
    } catch (error) {
      console.error("Failed to load available layers:", error);

      // Check if error is authentication-related
      if (
        error instanceof Error &&
        (error.message.includes("401") ||
          error.message.includes("Unauthorized") ||
          error.message.includes("authentication") ||
          error.message.includes("token"))
      ) {
        setLoadState({
          isLoading: false,
          message: "Authentication expired. Please login again.",
        });
        setAuthState(auth.getAuthState()); // Update auth state
      } else {
        setLoadState({
          isLoading: false,
          message: `Failed to discover layers: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    }
  }, [authState]);

  // Get layer name for layer type
  function getLayerNameForType(typeCode: string): string {
    // Return the type code directly as requested
    return typeCode;
  }

  // Get description for layer type
  function getLayerDescriptionForType(): string {
    // Return generic description for all types
    return "Spatial features from SmartGov database";
  }

  // Handle authentication
  const handleLogin = async () => {
    try {
      setLoadState({ isLoading: true, message: "Authenticating..." });
      const newAuthState = await auth.login({
        userIdentifier: "sa",
        password: "pass@word1",
      });
      setAuthState(newAuthState);
      setLoadState({ isLoading: false, message: "Authentication successful" });
    } catch (error) {
      setAuthState(auth.getAuthState()); // Update to show failed state
      setLoadState({
        isLoading: false,
        message: `Authentication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };

  const handleLogout = async () => {
    try {
      await auth.logout();
      setAuthState(null);
      setAvailableLayers([]);
      setLoadState({ isLoading: false, message: "Logged out successfully" });
    } catch (error) {
      setLoadState({
        isLoading: false,
        message: `Logout failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };

  // Auto-load available layers when authenticated
  useEffect(() => {
    if (authState?.isAuthenticated && availableLayers.length === 0) {
      loadAvailableLayers();
    }
  }, [authState, availableLayers.length, loadAvailableLayers]);

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, marginBottom: 8 }}>SmartGov Data Loader</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Load spatial data directly from the SmartGov database
        </p>
      </div>

      {/* Authentication Status */}
      <div
        style={{
          marginBottom: 24,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          backgroundColor: "#f9fafb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>
              Authentication Status
            </div>
            <div
              style={{
                fontSize: 14,
                color: authState?.isAuthenticated ? "#059669" : "#dc2626",
              }}
            >
              {authState?.isAuthenticated
                ? `✓ Authenticated${
                    auth.getExpirationTimeWIB()
                      ? ` (expires ${auth.getExpirationTimeWIB()} WIB)`
                      : ""
                  }`
                : "✗ Not authenticated"}
            </div>
          </div>
          <button
            className={authState?.isAuthenticated ? "btn ghost" : "btn primary"}
            onClick={authState?.isAuthenticated ? handleLogout : handleLogin}
            disabled={loadState.isLoading}
          >
            {authState?.isAuthenticated ? "Logout" : "Login"}
          </button>
        </div>
      </div>

      {/* Load State */}
      {loadState.message && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            border: "1px solid #d1d5db",
            borderRadius: 8,
            backgroundColor: "#f3f4f6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {loadState.isLoading && (
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid #e5e7eb",
                  borderTop: "2px solid #3b82f6",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
            )}
            <span style={{ fontSize: 14 }}>{loadState.message}</span>
            {loadState.progress !== undefined && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                ({Math.round(loadState.progress)}%)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Available Layers */}
      {authState?.isAuthenticated && availableLayers.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Available Layers</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 12,
            }}
          >
            {availableLayers.map((layer) => (
              <div
                key={layer.id}
                style={{
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: "#fff",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                      {layer.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Type: {layer.typeCode}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}
                    >
                      {layer.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons - Only Refresh functionality */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button
          className="btn ghost"
          onClick={loadAvailableLayers}
          disabled={!authState?.isAuthenticated || loadState.isLoading}
        >
          Refresh Layer
        </button>
      </div>

      <style>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
