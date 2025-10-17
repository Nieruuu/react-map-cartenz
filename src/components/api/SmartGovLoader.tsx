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
import { addApiLayersByType } from "../../features/loadFromApi";
import { auth, type AuthState } from "../../lib/api/auth";

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

interface FeatureSummary {
  total: number;
  byType: Record<string, number>;
  withGeometry: number;
  withoutGeometry: number;
}

export function SmartGovLoader() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [availableLayers, setAvailableLayers] = useState<LayerInfo[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    isLoading: false,
    message: "",
  });
  const [featureSummary, setFeatureSummary] = useState<FeatureSummary | null>(
    null
  );
  const [showDetails, setShowDetails] = useState(false);

  // Initialize auth state
  useEffect(() => {
    const updateAuthState = () => {
      setAuthState(auth.getAuthState());
    };

    updateAuthState();

    // Listen for auth changes
    window.addEventListener("auth-changed", updateAuthState);
    window.addEventListener("auth-expired", updateAuthState);

    return () => {
      window.removeEventListener("auth-changed", updateAuthState);
      window.removeEventListener("auth-expired", updateAuthState);
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
        description: getLayerDescriptionForType(typeCode),
      }));

      setAvailableLayers(layers);
      setLoadState({
        isLoading: false,
        message: `Found ${layers.length} layer types`,
      });
    } catch (error) {
      console.error("Failed to load available layers:", error);
      setLoadState({
        isLoading: false,
        message: `Failed to discover layers: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }, [authState]);

  // Load features for selected layers
  const loadSelectedLayers = useCallback(async () => {
    if (selectedLayers.length === 0) {
      setLoadState({
        isLoading: false,
        message: "Please select at least one layer to load",
      });
      return;
    }

    setLoadState({
      isLoading: true,
      message: "Loading layer data...",
      progress: 0,
    });

    try {
      let totalFeatures = 0;
      const layerStats: Record<string, number> = {};

      for (let i = 0; i < selectedLayers.length; i++) {
        const typeCode = selectedLayers[i];
        const progress = ((i + 1) / selectedLayers.length) * 100;

        setLoadState({
          isLoading: true,
          message: `Loading ${getLayerNameForType(typeCode)}...`,
          progress,
        });

        // Load features for this type
        const response = await listSpatialFeatures({
          pageNumber: 1,
          pageSize: 1000, // Load more features per type
          include: ["attribute"],
          filters: [`spatialFeature.type|eq|${typeCode}`],
        });

        const transformed = transformSpatialFeatures(response.data || []);
        layerStats[typeCode] = transformed.length;
        totalFeatures += transformed.length;

        // Add layer to map using the new grouped layer function
        const layerResults = await addApiLayersByType({
          typeCode: typeCode,
          pageNumber: 1,
          pageSize: 1000,
        });

        // Update stats with actual loaded features
        if (layerResults.length > 0) {
          layerStats[typeCode] = layerResults[0].count;
        }
      }

      // Update summary
      setFeatureSummary({
        total: totalFeatures,
        byType: layerStats,
        withGeometry: totalFeatures, // Assuming all have geometry after transformation
        withoutGeometry: 0,
      });

      setLoadState({
        isLoading: false,
        message: `Successfully loaded ${totalFeatures} features from ${selectedLayers.length} layer(s)`,
      });

      // Clear selection after successful load
      setSelectedLayers([]);
    } catch (error) {
      console.error("Failed to load layers:", error);
      setLoadState({
        isLoading: false,
        message: `Failed to load layers: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }, [selectedLayers]);

  // Toggle layer selection
  const toggleLayerSelection = (layerId: string) => {
    setSelectedLayers((prev) =>
      prev.includes(layerId)
        ? prev.filter((id) => id !== layerId)
        : [...prev, layerId]
    );
  };

  // Get human-readable name for layer type
  function getLayerNameForType(typeCode: string): string {
    const typeNames: Record<string, string> = {
      "20000001": "Administrative Boundaries",
      "20000002": "Land Use",
      "20000003": "Buildings",
      "20000004": "Roads",
      "20000005": "Water Bodies",
      "20000006": "Vegetation",
      "20000007": "Points of Interest",
    };

    return typeNames[typeCode] || `Layer Type ${typeCode}`;
  }

  // Get description for layer type
  function getLayerDescriptionForType(typeCode: string): string {
    const descriptions: Record<string, string> = {
      "20000001":
        "Administrative boundaries including provinces, regencies, districts",
      "20000002": "Land use and land cover classifications",
      "20000003": "Building footprints and structures",
      "20000004": "Road networks and transportation infrastructure",
      "20000005": "Rivers, lakes, and other water features",
      "20000006": "Forest areas, parks, and vegetation cover",
      "20000007": "Points of interest, facilities, and landmarks",
    };

    return descriptions[typeCode] || "Spatial features from SmartGov database";
  }

  // Handle authentication
  const handleLogin = async () => {
    try {
      setLoadState({ isLoading: true, message: "Authenticating..." });
      await auth.login({ userIdentifier: "sa", password: "pass@word1" });
      setAuthState(auth.getAuthState());
      setLoadState({ isLoading: false, message: "Authentication successful" });
    } catch (error) {
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
      setSelectedLayers([]);
      setFeatureSummary(null);
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
                ? "✓ Authenticated"
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Available Layers</h3>
            <button
              className="btn ghost"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? "Hide Details" : "Show Details"}
            </button>
          </div>

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
                  border: selectedLayers.includes(layer.id)
                    ? "2px solid #3b82f6"
                    : "1px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: selectedLayers.includes(layer.id)
                    ? "#eff6ff"
                    : "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onClick={() => toggleLayerSelection(layer.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedLayers.includes(layer.id)}
                    onChange={() => {}}
                    style={{ margin: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                      {layer.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Type: {layer.typeCode}
                    </div>
                    {showDetails && layer.description && (
                      <div
                        style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}
                      >
                        {layer.description}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature Summary */}
      {featureSummary && (
        <div
          style={{
            marginBottom: 24,
            padding: 12,
            border: "1px solid #d1fae5",
            borderRadius: 8,
            backgroundColor: "#ecfdf5",
          }}
        >
          <h4 style={{ margin: "0 0 8px 0", color: "#059669" }}>
            Load Summary
          </h4>
          <div style={{ fontSize: 14 }}>
            <div>Total Features: {featureSummary.total}</div>
            <div>With Geometry: {featureSummary.withGeometry}</div>
            {Object.entries(featureSummary.byType).map(([type, count]) => (
              <div key={type}>
                {getLayerNameForType(type)}: {count}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button
          className="btn ghost"
          onClick={loadAvailableLayers}
          disabled={!authState?.isAuthenticated || loadState.isLoading}
        >
          Refresh Layers
        </button>
        <button
          className="btn primary"
          onClick={loadSelectedLayers}
          disabled={
            !authState?.isAuthenticated ||
            selectedLayers.length === 0 ||
            loadState.isLoading
          }
        >
          Load Selected ({selectedLayers.length})
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
