import { useState, useEffect } from "react";
import { listSpatialGeneric, type SpatialRow } from "../lib/api/spatialGeneric";
import { addApiLayer } from "../features/loadFromApi";
import { auth } from "../lib/api/auth";

interface FeatureInfo {
  id: number;
  uuid: string;
  refWilayah: string;
  type: string;
}

export function ApiLoadPanel() {
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const hasToken = !!auth.getToken();
    setIsAuthenticated(hasToken);
    if (hasToken) {
      loadFeatures();
    }
  }, []);

  // Auto-login and load features
  const handleLoadFromApi = async () => {
    setIsLoading(true);
    setMessage("Authenticating...");

    try {
      // Auto-login if no token
      if (!auth.getToken()) {
        await auth.autoLogin();
        setIsAuthenticated(true);
      }

      // Load features
      await loadFeatures();
    } catch (error) {
      setMessage(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Load features from API
  const loadFeatures = async () => {
    setIsLoading(true);
    setMessage("Loading features...");

    try {
      const response = await listSpatialGeneric({
        pageNumber: 1,
        pageSize: 100,
        include: ["attribute"],
      });

      const featureList: FeatureInfo[] = (response.data || []).map(
        (row: SpatialRow) => {
          const refWilayah =
            row.attribute?.find(
              (a) => a.attributeKey === "spatialFeature.refWilayah"
            )?.attributeValue || "";
          const type =
            row.attribute?.find((a) => a.attributeKey === "spatialFeature.type")
              ?.attributeValue || "";

          return {
            id: row.id,
            uuid: row.value,
            refWilayah,
            type,
          };
        }
      );

      setFeatures(featureList);
      setMessage(`Loaded ${featureList.length} features`);
    } catch (error) {
      setMessage(
        `Error loading features: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setFeatures([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load all features to map
  const handleLoadAllToMap = async () => {
    if (features.length === 0) {
      setMessage("No features to load");
      return;
    }

    setIsLoading(true);
    setMessage("Loading features to map...");

    try {
      const result = await addApiLayer({
        layerName: "Spatial Features (API)",
        pageNumber: 1,
        pageSize: 100,
      });

      setMessage(`Loaded ${result.count} features to map`);
    } catch (error) {
      setMessage(
        `Error loading to map: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Load from API</h3>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
          Load spatial data from SmartGov database
        </p>
      </div>

      {/* Authentication status */}
      <div
        style={{
          marginBottom: 16,
          padding: 8,
          backgroundColor: isAuthenticated ? "#f0fdf4" : "#fef2f2",
          borderRadius: 4,
          fontSize: 14,
        }}
      >
        Status: {isAuthenticated ? "✓ Authenticated" : "✗ Not authenticated"}
      </div>

      {/* Action buttons */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button
          className="btn primary"
          onClick={handleLoadFromApi}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Load from API"}
        </button>

        {features.length > 0 && (
          <button
            className="btn secondary"
            onClick={handleLoadAllToMap}
            disabled={isLoading}
          >
            Load All to Map
          </button>
        )}
      </div>

      {/* Status message */}
      {message && (
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            backgroundColor: "#f3f4f6",
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          {message}
        </div>
      )}

      {/* Features list */}
      {features.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 16 }}>
            Features ({features.length})
          </h4>
          <div
            style={{
              maxHeight: 300,
              overflow: "auto",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
            }}
          >
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead
                style={{
                  backgroundColor: "#f9fafb",
                  position: "sticky",
                  top: 0,
                }}
              >
                <tr>
                  <th style={{ textAlign: "left", padding: 8 }}>ID</th>
                  <th style={{ textAlign: "left", padding: 8 }}>UUID</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Ref Wilayah</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => (
                  <tr
                    key={feature.id}
                    style={{ borderTop: "1px solid #f3f4f6" }}
                  >
                    <td style={{ padding: 8 }}>{feature.id}</td>
                    <td style={{ padding: 8, fontFamily: "monospace" }}>
                      {feature.uuid}
                    </td>
                    <td style={{ padding: 8 }}>{feature.refWilayah}</td>
                    <td style={{ padding: 8 }}>{feature.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
