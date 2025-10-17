// src/components/LayerLoadModal.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  listSpatialFeatures,
  type SpatialFeature,
} from "../lib/api/spatialFeature";
import { addApiLayersByType } from "../features/loadFromApi";
import { auth } from "../lib/api/auth";
// Removed unused imports: transformSpatialFeatures, getUniqueTypeCodes, groupFeaturesByType, TransformedFeature

type Kind = "kabupaten" | "kecamatan" | "kelurahan" | "custom";

type RegistryItem = {
  key: string;
  name: string;
  kind: Kind;
  fc: any;
  ts: number;
  count: number;
  meta?: Record<string, any>;
};

const REGKEY = "__taxmap_dataset_registry__";
function ensureRegistry(): Map<string, RegistryItem> {
  const g: any = window as any;
  if (!g[REGKEY] || !(g[REGKEY] instanceof Map)) g[REGKEY] = new Map();
  return g[REGKEY] as Map<string, RegistryItem>;
}

// API Layer interfaces for hierarchical grouping
interface FeatureGroup {
  typeCode: string;
  typeName: string;
  description: string;
  count: number;
  features: SpatialFeature[];
  isSelected: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  subGroups?: Record<string, FeatureSubGroup>;
}

interface FeatureSubGroup {
  refWilayah: string;
  features: SpatialFeature[];
  count: number;
  isSelected: boolean;
  isLoading: boolean;
}

interface LoadState {
  isLoading: boolean;
  message: string;
  progress?: number;
}

// Helper function to get layer name for type code (fallback)
function getLayerNameForType(typeCode: string): string {
  // Use type code directly instead of hardcoded names
  return `Type ${typeCode}`;
}

// Helper function to get description from feature attributes
function getLayerDescriptionFromFeature(feature: SpatialFeature): string {
  const description = feature.description;
  const typeCode = feature.attribute?.find(
    (a) => a.attributeKey === "spatialFeature.type"
  )?.attributeValue;

  return description || `Spatial features of type ${typeCode}`;
}

export default function LayerLoadModal({
  open,
  onClose,
  initialTab = "local",
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: "local" | "api";
}) {
  const [tab, setTab] = useState<"local" | "api">(initialTab);
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [selected, setSelected] = useState<string>("");

  // API Layer state for hierarchical grouping
  const [featureGroups, setFeatureGroups] = useState<
    Record<string, FeatureGroup>
  >({});
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedSubGroups, setSelectedSubGroups] = useState<string[]>([]);
  const [apiLoadState, setApiLoadState] = useState<LoadState>({
    isLoading: false,
    message: "",
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLayerDetails, setShowLayerDetails] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const refresh = () => {
    const reg = ensureRegistry();
    const list = Array.from(reg.values()).sort((a, b) => b.ts - a.ts);
    setItems(list);
    // pilih item terakhir biar user gak perlu klik dua kali
    if (list.length && !list.find((x) => x.key === selected)) {
      setSelected(list[0].key);
    }
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const onUpd = () => refresh();
    window.addEventListener("datasets-updated", onUpd as any);
    return () => window.removeEventListener("datasets-updated", onUpd as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Check authentication status and auto-load API features when authenticated
  useEffect(() => {
    const hasToken = !!auth.getToken();
    setIsAuthenticated(hasToken);

    // Auto-switch to API tab and load features when authenticated
    if (hasToken && Object.keys(featureGroups).length === 0) {
      setTab("api");
      loadAvailableFeatureGroups();
    }
  }, []);

  // Load feature groups when tab switches to API and authenticated
  useEffect(() => {
    if (
      tab === "api" &&
      isAuthenticated &&
      Object.keys(featureGroups).length === 0
    ) {
      loadAvailableFeatureGroups();
    }
  }, [tab, isAuthenticated]);

  const hasData = items.length > 0;

  const subtitle = useMemo(() => {
    if (!hasData) return "Belum ada dataset yang di-import.";
    const it = items.find((x) => x.key === selected);
    if (!it) return "";
    const kindLabel =
      it.kind === "kelurahan"
        ? "Kelurahan"
        : it.kind === "kecamatan"
        ? "Kecamatan"
        : it.kind === "kabupaten"
        ? "Kabupaten"
        : "Custom";
    return `${kindLabel} • ${it.count} fitur`;
  }, [items, selected, hasData]);

  const onLoad = () => {
    if (!selected) return;
    const reg = ensureRegistry();
    const item = reg.get(selected);
    if (!item) return;

    window.dispatchEvent(
      new CustomEvent("load-imported-dataset", {
        detail: {
          key: selected,
          fc: item.fc,
          name: item.name,
          kind: item.kind,
          meta: item.meta,
        },
      })
    );
    onClose();
  };

  // API Feature Group loading functions
  const loadAvailableFeatureGroups = useCallback(async () => {
    if (!isAuthenticated) {
      setApiLoadState({
        isLoading: false,
        message: "Please authenticate to load layers",
      });
      return;
    }

    setApiLoadState({
      isLoading: true,
      message: "Discovering available feature groups...",
    });

    try {
      // Get features to discover available type groups
      const response = await listSpatialFeatures({
        pageNumber: 1,
        pageSize: 1000,
        include: ["attribute"],
      });

      // Group features by type code for hierarchical display
      const groups: Record<string, FeatureGroup> = {};

      response.data?.forEach((feature: SpatialFeature) => {
        // Extract type code from attributes
        const typeCode = feature.attribute?.find(
          (a) => a.attributeKey === "spatialFeature.type"
        )?.attributeValue;

        if (!typeCode) return;

        // Initialize group if it doesn't exist
        if (!groups[typeCode]) {
          // Use the first feature of this type to get dynamic naming
          const firstFeature = feature;
          groups[typeCode] = {
            typeCode,
            typeName: getLayerNameForType(typeCode),
            description: getLayerDescriptionFromFeature(firstFeature),
            count: 0,
            features: [],
            isSelected: false,
            isExpanded: false,
            isLoading: false,
            subGroups: {},
          };
        }

        // Add feature to group
        groups[typeCode].features.push(feature);
        groups[typeCode].count++;

        // Create sub-groups by refWilayah for hierarchical organization
        const refWilayah =
          feature.attribute?.find(
            (a) => a.attributeKey === "spatialFeature.refWilayah"
          )?.attributeValue || `Unknown ${feature.id}`;

        if (!groups[typeCode].subGroups![refWilayah]) {
          groups[typeCode].subGroups![refWilayah] = {
            refWilayah,
            features: [],
            count: 0,
            isSelected: false,
            isLoading: false,
          };
        }

        groups[typeCode].subGroups![refWilayah].features.push(feature);
        groups[typeCode].subGroups![refWilayah].count++;
      });

      setFeatureGroups(groups);
      setApiLoadState({
        isLoading: false,
        message: `Found ${Object.keys(groups).length} feature groups`,
      });
    } catch (error) {
      console.error("Failed to load available feature groups:", error);
      setApiLoadState({
        isLoading: false,
        message: `Failed to discover feature groups: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }, [isAuthenticated]);

  // Toggle group selection
  const toggleGroupSelection = (typeCode: string) => {
    setSelectedGroups((prev) =>
      prev.includes(typeCode)
        ? prev.filter((code) => code !== typeCode)
        : [...prev, typeCode]
    );
  };

  // Toggle sub-group selection
  const toggleSubGroupSelection = (typeCode: string, refWilayah: string) => {
    const key = `${typeCode}:${refWilayah}`;
    setSelectedSubGroups((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Toggle group expansion
  const toggleGroupExpansion = (typeCode: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(typeCode)) {
        newSet.delete(typeCode);
      } else {
        newSet.add(typeCode);
      }
      return newSet;
    });
  };

  // Toggle all groups selection
  const toggleAllGroups = () => {
    const allGroupCodes = Object.keys(featureGroups);
    if (selectedGroups.length === allGroupCodes.length) {
      setSelectedGroups([]);
      setSelectedSubGroups([]);
    } else {
      setSelectedGroups(allGroupCodes);
      // Also select all sub-groups
      const allSubGroupKeys: string[] = [];
      Object.entries(featureGroups).forEach(([typeCode, group]) => {
        Object.keys(group.subGroups || {}).forEach((refWilayah) => {
          allSubGroupKeys.push(`${typeCode}:${refWilayah}`);
        });
      });
      setSelectedSubGroups(allSubGroupKeys);
    }
  };

  // Handle authentication
  const handleApiAuth = async () => {
    try {
      setApiLoadState({ isLoading: true, message: "Authenticating..." });
      await auth.login({ userIdentifier: "sa", password: "pass@word1" });
      setIsAuthenticated(true);
      setApiLoadState({
        isLoading: false,
        message: "Authentication successful",
      });
      // Auto-load layers after authentication
      loadAvailableFeatureGroups();
    } catch (error) {
      setApiLoadState({
        isLoading: false,
        message: `Authentication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };

  // Load selected feature groups
  const loadSelectedGroups = async () => {
    if (selectedGroups.length === 0 && selectedSubGroups.length === 0) {
      setApiLoadState({
        isLoading: false,
        message: "Please select at least one feature group to load",
      });
      return;
    }

    setApiLoadState({
      isLoading: true,
      message: "Loading selected feature groups...",
      progress: 0,
    });

    try {
      let totalFeatures = 0;
      let loadedGroups = 0;
      const totalToLoad = selectedGroups.length + selectedSubGroups.length;

      // Load selected groups
      for (const typeCode of selectedGroups) {
        const progress = ((loadedGroups + 1) / totalToLoad) * 100;

        setApiLoadState({
          isLoading: true,
          message: `Loading ${
            featureGroups[typeCode]?.typeName || typeCode
          }...`,
          progress,
        });

        // Load all features for this type group
        const result = await addApiLayersByType({
          typeCode: typeCode,
          pageNumber: 1,
          pageSize: 1000,
        });

        if (result.length > 0) {
          totalFeatures += result[0].count;
        }
        loadedGroups++;
      }

      // Load selected sub-groups
      for (const subGroupKey of selectedSubGroups) {
        const [typeCode, refWilayah] = subGroupKey.split(":");
        const progress = ((loadedGroups + 1) / totalToLoad) * 100;

        setApiLoadState({
          isLoading: true,
          message: `Loading ${refWilayah}...`,
          progress,
        });

        // Load features for this specific sub-group
        const result = await addApiLayersByType({
          typeCode: typeCode,
          pageNumber: 1,
          pageSize: 1000,
        });

        if (result.length > 0) {
          totalFeatures += result[0].count;
        }
        loadedGroups++;
      }

      setApiLoadState({
        isLoading: false,
        message: `Successfully loaded ${totalFeatures} features from ${totalToLoad} group(s)`,
      });

      // Clear selection after successful load
      setSelectedGroups([]);
      setSelectedSubGroups([]);
    } catch (error) {
      console.error("Failed to load feature groups:", error);
      setApiLoadState({
        isLoading: false,
        message: `Failed to load feature groups: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };

  // Load all groups
  const loadAllGroups = async () => {
    const allGroupCodes = Object.keys(featureGroups);
    const allSubGroupKeys: string[] = [];
    Object.entries(featureGroups).forEach(([typeCode, group]) => {
      Object.keys(group.subGroups || {}).forEach((refWilayah) => {
        allSubGroupKeys.push(`${typeCode}:${refWilayah}`);
      });
    });

    setSelectedGroups(allGroupCodes);
    setSelectedSubGroups(allSubGroupKeys);
    await loadSelectedGroups();
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(900px, 95vw)",
          maxWidth: "900px",
          height: "min(85vh, 700px)",
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 40px rgba(0,0,0,.25)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <h2 style={{ margin: 0, padding: "6px 4px 2px" }}>Load Peta</h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            className={tab === "local" ? "btn primary" : "btn ghost"}
            onClick={() => setTab("local")}
          >
            Local file
          </button>
          <button
            className={tab === "api" ? "btn primary" : "btn ghost"}
            onClick={() => setTab("api")}
          >
            From API
          </button>
        </div>

        {tab === "local" && (
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="muted" style={{ margin: "2px 4px 12px" }}>
              {subtitle}
            </div>

            {!hasData && (
              <div
                className="muted"
                style={{
                  padding: 12,
                  border: "1px dashed #e5e7eb",
                  borderRadius: 10,
                  flex: 1,
                }}
              >
                Tidak ada dataset di registry. Import shapefile/geojson dari
                panel kiri dulu.
              </div>
            )}

            {hasData && (
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  border: "1px solid #f1f5f9",
                  borderRadius: 10,
                  minHeight: 0,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "separate",
                    borderSpacing: 0,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "#f8fafc",
                      }}
                    >
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>
                        Pilih
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>
                        Nama
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>
                        Tipe
                      </th>
                      <th style={{ textAlign: "right", padding: "10px 12px" }}>
                        Jumlah Fitur
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr
                        key={it.key}
                        style={{ borderTop: "1px solid #f1f5f9" }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <input
                            type="radio"
                            name="dataset"
                            checked={selected === it.key}
                            onChange={() => setSelected(it.key)}
                          />
                        </td>
                        <td style={{ padding: "10px 12px" }}>{it.name}</td>
                        <td
                          style={{
                            padding: "10px 12px",
                            textTransform: "capitalize",
                          }}
                        >
                          {it.kind}
                        </td>
                        <td
                          style={{ padding: "10px 12px", textAlign: "right" }}
                        >
                          {it.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "api" && (
          <div
            style={{
              padding: 16,
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px 0" }}>Load from API</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
                Select specific layers to load from SmartGov database
              </p>
            </div>

            {/* Authentication Status */}
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                backgroundColor: isAuthenticated ? "#f0fdf4" : "#fef2f2",
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
                      color: isAuthenticated ? "#059669" : "#dc2626",
                    }}
                  >
                    {isAuthenticated
                      ? "✓ Authenticated"
                      : "✗ Not authenticated"}
                  </div>
                </div>
                <button
                  className={isAuthenticated ? "btn ghost" : "btn primary"}
                  onClick={
                    isAuthenticated ? () => auth.logout() : handleApiAuth
                  }
                  disabled={apiLoadState.isLoading}
                >
                  {isAuthenticated ? "Logout" : "Login"}
                </button>
              </div>
            </div>

            {/* Load State */}
            {apiLoadState.message && (
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
                  {apiLoadState.isLoading && (
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
                  <span style={{ fontSize: 14 }}>{apiLoadState.message}</span>
                  {apiLoadState.progress !== undefined && (
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      ({Math.round(apiLoadState.progress)}%)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Available Feature Groups */}
            {isAuthenticated && Object.keys(featureGroups).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    Feature Groups (
                    {selectedGroups.length + selectedSubGroups.length} selected)
                  </h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn ghost"
                      onClick={() => setShowLayerDetails(!showLayerDetails)}
                      style={{ fontSize: 12 }}
                    >
                      {showLayerDetails ? "Hide Details" : "Show Details"}
                    </button>
                    <button
                      className="btn ghost"
                      onClick={toggleAllGroups}
                      style={{ fontSize: 12 }}
                    >
                      {selectedGroups.length ===
                        Object.keys(featureGroups).length &&
                      selectedSubGroups.length ===
                        Object.values(featureGroups).reduce(
                          (sum, group) =>
                            sum + Object.keys(group.subGroups || {}).length,
                          0
                        )
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    overflow: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    minHeight: 0,
                    maxHeight: "calc(min(45vh, 300px))",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  {Object.entries(featureGroups).map(([typeCode, group]) => (
                    <div
                      key={typeCode}
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      {/* Parent Group Row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "12px 8px",
                          backgroundColor: selectedGroups.includes(typeCode)
                            ? "#eff6ff"
                            : "#fafafa",
                          cursor: "pointer",
                        }}
                        onClick={() => toggleGroupSelection(typeCode)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroups.includes(typeCode)}
                          onChange={() => toggleGroupSelection(typeCode)}
                          style={{ marginRight: 8 }}
                        />
                        <button
                          className="btn ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroupExpansion(typeCode);
                          }}
                          style={{
                            marginRight: 8,
                            padding: "2px 6px",
                            fontSize: 10,
                            minWidth: "20px",
                          }}
                        >
                          {expandedGroups.has(typeCode) ? "▼" : "▶"}
                        </button>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: "bold", fontSize: 13 }}>
                            {group.typeName}
                          </div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>
                            Type: {typeCode} • {group.count} features
                          </div>
                          {showLayerDetails && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "#9ca3af",
                                marginTop: 2,
                              }}
                            >
                              {group.description}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Sub-groups (hierarchical display) */}
                      {expandedGroups.has(typeCode) && group.subGroups && (
                        <div
                          style={{
                            backgroundColor: "#f8f9fa",
                            paddingLeft: 32,
                          }}
                        >
                          {Object.entries(group.subGroups).map(
                            ([refWilayah, subGroup]) => {
                              const subGroupKey = `${typeCode}:${refWilayah}`;
                              return (
                                <div
                                  key={subGroupKey}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "8px 8px",
                                    backgroundColor: selectedSubGroups.includes(
                                      subGroupKey
                                    )
                                      ? "#e0f2fe"
                                      : "white",
                                    borderTop: "1px solid #e5e7eb",
                                    cursor: "pointer",
                                  }}
                                  onClick={() =>
                                    toggleSubGroupSelection(
                                      typeCode,
                                      refWilayah
                                    )
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedSubGroups.includes(
                                      subGroupKey
                                    )}
                                    onChange={() =>
                                      toggleSubGroupSelection(
                                        typeCode,
                                        refWilayah
                                      )
                                    }
                                    style={{ marginRight: 8 }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: "500",
                                      }}
                                    >
                                      {refWilayah}
                                    </div>
                                    <div
                                      style={{ fontSize: 10, color: "#6b7280" }}
                                    >
                                      {subGroup.count} features
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {isAuthenticated && Object.keys(featureGroups).length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                  marginBottom: 16,
                }}
              >
                <button
                  className="btn ghost"
                  onClick={loadAvailableFeatureGroups}
                  disabled={apiLoadState.isLoading}
                >
                  Refresh Groups
                </button>
                <button
                  className="btn secondary"
                  onClick={loadAllGroups}
                  disabled={
                    apiLoadState.isLoading ||
                    Object.keys(featureGroups).length === 0
                  }
                >
                  Load All Groups
                </button>
                <button
                  className="btn primary"
                  onClick={loadSelectedGroups}
                  disabled={
                    apiLoadState.isLoading ||
                    (selectedGroups.length === 0 &&
                      selectedSubGroups.length === 0)
                  }
                >
                  {apiLoadState.isLoading
                    ? "Loading..."
                    : `Load Selected (${
                        selectedGroups.length + selectedSubGroups.length
                      })`}
                </button>
              </div>
            )}

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
        )}

        <div
          className="row end"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
          }}
        >
          <button className="btn ghost" onClick={onClose}>
            Batal
          </button>
          {tab === "local" && (
            <button
              className="btn primary"
              onClick={onLoad}
              disabled={!selected}
            >
              Load
            </button>
          )}
          {tab === "api" && isAuthenticated && (
            <button
              className="btn primary"
              onClick={loadSelectedGroups}
              disabled={
                apiLoadState.isLoading ||
                (selectedGroups.length === 0 && selectedSubGroups.length === 0)
              }
            >
              {apiLoadState.isLoading
                ? "Loading..."
                : `Load Selected (${
                    selectedGroups.length + selectedSubGroups.length
                  })`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
