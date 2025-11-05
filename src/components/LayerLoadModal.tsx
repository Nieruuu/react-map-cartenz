// src/components/LayerLoadModal.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  listSpatialFeatures,
  deleteSpatialFeature,
  type SpatialFeature,
} from "../lib/api/spatialFeature";
import { addApiLayersByType } from "../features/loadFromApi";
import { auth } from "../lib/api/auth";
import { useLayersStore } from "../hooks/useLayersStore";
import { LayerDeleteConfirmationModal } from "./LayerDeleteConfirmationModal";
// Removed unused imports: transformSpatialFeatures, getUniqueTypeCodes, groupFeaturesByType, TransformedFeature

type Kind = "kabupaten" | "kecamatan" | "kelurahan" | "custom";

type RegistryItem = {
  key: string;
  name: string;
  kind: Kind;
  fc: GeoJSON.FeatureCollection;
  ts: number;
  count: number;
  meta?: Record<string, unknown>;
};

const REGKEY = "__taxmap_dataset_registry__";
function ensureRegistry(): Map<string, RegistryItem> {
  const g: Record<string, unknown> = window as unknown as Record<
    string,
    unknown
  >;
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

  // Reset tab when modal opens with different initialTab
  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);
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
  const [deletingTypeCode, setDeletingTypeCode] = useState<string | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<{
    typeCode: string;
    typeName: string;
    featureCount: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setPendingDeleteGroup(null);
      setDeletingTypeCode(null);
    }
  }, [open]);

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

    // Dispatch custom event when modal opens (for FocusCard auto-close)
    window.dispatchEvent(
      new CustomEvent("open-modal", {
        detail: { modal: "LayerLoadModal" },
      })
    );

    refresh();
    const onUpd = () => refresh();
    window.addEventListener("datasets-updated", onUpd);
    return () => window.removeEventListener("datasets-updated", onUpd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // API Feature Group loading functions
  const loadAvailableFeatureGroups = useCallback(async () => {
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated) {
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

      // Check if error is authentication-related
      if (
        error instanceof Error &&
        (error.message.includes("401") ||
          error.message.includes("Unauthorized") ||
          error.message.includes("authentication") ||
          error.message.includes("token"))
      ) {
        setApiLoadState({
          isLoading: false,
          message: "Authentication expired. Please login again.",
        });
        setIsAuthenticated(false);
      } else {
        setApiLoadState({
          isLoading: false,
          message: `Failed to discover feature groups: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    }
  }, []);

  // Check authentication status when modal opens
  useEffect(() => {
    const authState = auth.getAuthState();
    setIsAuthenticated(authState.isAuthenticated);
  }, [open]);

  // Load feature groups when tab switches to API and authenticated
  useEffect(() => {
    if (
      tab === "api" &&
      isAuthenticated &&
      Object.keys(featureGroups).length === 0 &&
      open // Only load when modal is open
    ) {
      loadAvailableFeatureGroups();
    }
  }, [tab, isAuthenticated, open, featureGroups, loadAvailableFeatureGroups]);

  // Monitor authentication state changes
  useEffect(() => {
    const checkAuthStatus = () => {
      const authState = auth.getAuthState();
      setIsAuthenticated(authState.isAuthenticated);
    };

    // Check auth status every 30 seconds to detect token expiration
    const authCheckInterval = setInterval(checkAuthStatus, 30000);

    return () => clearInterval(authCheckInterval);
  }, []);

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

  // Toggle group selection
  const toggleGroupSelection = (typeCode: string) => {
    setSelectedGroups((prev) =>
      prev.includes(typeCode)
        ? prev.filter((code) => code !== typeCode)
        : [...prev, typeCode]
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
      // Clear sub-groups when selecting parent groups to avoid duplicates
      setSelectedSubGroups([]);
    }
  };

  const removeLayersForTypeCode = useCallback((typeCode: string) => {
    const normalizedType = (typeCode || "").trim().toLowerCase();
    if (!normalizedType) return;
    const { layers, removeEntry } = useLayersStore.getState();
    const targets = layers.filter((layer) => {
      const layerType = (layer.typeCode || "").trim().toLowerCase();
      return layerType === normalizedType;
    });
    targets.forEach((layer) => {
      removeEntry(layer.id);
    });
  }, []);

  const deleteGroup = useCallback(
    async (typeCode: string) => {
      const group = featureGroups[typeCode];
      if (!group) return;

      const typeName = group.typeName || getLayerNameForType(typeCode);
      const isProtected =
        typeName.trim().toLowerCase() ===
        "batas kecamatan kabupaten badung";
      if (isProtected) return;

      try {
        setDeletingTypeCode(typeCode);
        setApiLoadState({
          isLoading: true,
          message: `Menghapus layer ${typeName}...`,
          progress: 0,
        });

        await auth.ensureAuthenticated();

        const features = group.features ?? [];
        if (features.length === 0) {
          removeLayersForTypeCode(typeCode);
          setApiLoadState({
            isLoading: false,
            message: `Layer ${typeName} tidak memiliki fitur untuk dihapus.`,
          });
          return;
        }

        let deleted = 0;
        let failures = 0;
        let lastError: unknown = null;

        for (const feature of features) {
          try {
            await deleteSpatialFeature(feature.id);
            deleted += 1;
          } catch (error) {
            failures += 1;
            lastError = error;
            console.error(
              `Failed deleting feature ${feature.id} from layer ${group.typeName}:`,
              error
            );
            if (
              error instanceof Error &&
              (error.message.includes("401") ||
                error.message.includes("Unauthorized"))
            ) {
              setIsAuthenticated(false);
              break;
            }
          }

          setApiLoadState({
            isLoading: true,
            message: `Menghapus layer ${typeName} (${deleted}/${features.length})...`,
            progress: Math.round((deleted / features.length) * 100),
          });
        }

        await loadAvailableFeatureGroups();

        setSelectedGroups((prev) => prev.filter((code) => code !== typeCode));
        setSelectedSubGroups((prev) =>
          prev.filter((key) => !key.startsWith(`${typeCode}:`))
        );
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          next.delete(typeCode);
          return next;
        });

        if (failures === 0) {
          removeLayersForTypeCode(typeCode);
          setApiLoadState({
            isLoading: false,
            message: `Layer ${typeName} berhasil dihapus (${deleted} fitur).`,
          });
        } else {
          const errorMessage =
            lastError instanceof Error ? lastError.message : "Unknown error";
          setApiLoadState({
            isLoading: false,
            message: `Layer ${typeName} terhapus sebagian (${deleted}/${features.length}). ${errorMessage}`,
          });
        }
      } catch (error) {
        console.error("Failed to delete feature group:", error);
        setApiLoadState({
          isLoading: false,
          message: `Gagal menghapus layer: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      } finally {
        setDeletingTypeCode(null);
      }
    },
    [featureGroups, loadAvailableFeatureGroups, removeLayersForTypeCode]
  );

  const requestDeleteGroup = useCallback(
    (typeCode: string) => {
      const group = featureGroups[typeCode];
      if (!group) return;
      const typeName = group.typeName || getLayerNameForType(typeCode);
      const isProtected =
        typeName.trim().toLowerCase() ===
        "batas kecamatan kabupaten badung";
      if (isProtected) return;
      const featureCount =
        typeof group.count === "number"
          ? group.count
          : group.features?.length ?? 0;
      setPendingDeleteGroup({
        typeCode,
        typeName,
        featureCount,
      });
    },
    [featureGroups]
  );

  const cancelDeleteGroup = useCallback(() => {
    if (deletingTypeCode) return;
    setPendingDeleteGroup(null);
  }, [deletingTypeCode]);

  const confirmDeleteGroup = useCallback(async () => {
    if (!pendingDeleteGroup) return;
    const { typeCode } = pendingDeleteGroup;
    try {
      await deleteGroup(typeCode);
    } finally {
      setPendingDeleteGroup(null);
    }
  }, [pendingDeleteGroup, deleteGroup]);

  // Handle authentication
  const handleApiAuth = async () => {
    try {
      setApiLoadState({ isLoading: true, message: "Authenticating..." });
      const authState = await auth.login({
        userIdentifier: "sa",
        password: "pass@word1",
      });
      setIsAuthenticated(authState.isAuthenticated);
      setApiLoadState({
        isLoading: false,
        message: "Authentication successful",
      });
      // Auto-load layers after authentication
      loadAvailableFeatureGroups();
    } catch (error) {
      setIsAuthenticated(false);
      setApiLoadState({
        isLoading: false,
        message: `Authentication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };

  // Handle logout
  const handleApiLogout = async () => {
    try {
      setApiLoadState({ isLoading: true, message: "Logging out..." });
      await auth.logout();
      setIsAuthenticated(false);
      setFeatureGroups({});
      setSelectedGroups([]);
      setSelectedSubGroups([]);
      setApiLoadState({ isLoading: false, message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout failed:", error);
      setApiLoadState({
        isLoading: false,
        message: `Logout failed: ${
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
      const totalToLoad = selectedGroups.length + selectedSubGroups.length;

      // Load selected groups
      for (const typeCode of selectedGroups) {
        const progress =
          ((selectedGroups.indexOf(typeCode) + 1) / totalToLoad) * 100;

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
      }

      // Skip loading sub-groups separately since they're loaded with parent groups
      // This prevents duplicate layer loading

      setApiLoadState({
        isLoading: false,
        message: `Successfully loaded ${totalFeatures} features from ${totalToLoad} group(s)`,
      });

      // Clear selection after successful load
      setSelectedGroups([]);
      setSelectedSubGroups([]);
    } catch (error) {
      console.error("Failed to load feature groups:", error);

      // Check if error is authentication-related
      if (
        error instanceof Error &&
        (error.message.includes("401") ||
          error.message.includes("Unauthorized") ||
          error.message.includes("authentication") ||
          error.message.includes("token"))
      ) {
        setApiLoadState({
          isLoading: false,
          message: "Authentication expired during loading. Please login again.",
        });
        setIsAuthenticated(false);
      } else {
        setApiLoadState({
          isLoading: false,
          message: `Failed to load feature groups: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    }
  };

  const authStateSnapshot = auth.getAuthState();
  const authExpiresText = authStateSnapshot.expiresAt
    ? ` (expires ${new Date(authStateSnapshot.expiresAt).toLocaleTimeString()})`
    : "";
  const authStatusLabel = isAuthenticated
    ? `→ Authenticated${authExpiresText}`
    : "⚠ Not authenticated";

  if (!open) return null;

  return (
    <>
      <div
        className="modal-overlay"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 9999,
        }}
        onClick={() => {
          if (!deletingTypeCode) {
            onClose();
          }
        }}
      >
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(900px, 90vw)",
          maxWidth: "900px",
          height: "min(85vh, 750px)",
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 40px rgba(0,0,0,.25)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 10000,
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
            onClick={() => {
              setTab("api");
              // Trigger auto-login and feature loading when switching to API tab
              const checkAndAutoLogin = async () => {
                const authState = auth.getAuthState();
                console.debug("LayerLoadModal tab switch to API, auth state:", {
                  isAuthenticated: authState.isAuthenticated,
                  hasToken: !!authState.token,
                  expiresAt: authState.expiresAt,
                });

                // Update local state to match current auth state
                setIsAuthenticated(authState.isAuthenticated);

                // If not authenticated, try auto-login
                if (!authState.isAuthenticated) {
                  try {
                    console.debug(
                      "LayerLoadModal attempting auto-login on tab switch..."
                    );
                    const newAuthState = await auth.autoLogin();
                    setIsAuthenticated(newAuthState.isAuthenticated);
                    console.debug(
                      "LayerLoadModal auto-login successful on tab switch:",
                      {
                        isAuthenticated: newAuthState.isAuthenticated,
                        hasToken: !!newAuthState.token,
                      }
                    );

                    // Load features after successful auto-login
                    setTimeout(() => {
                      loadAvailableFeatureGroups();
                    }, 100);
                  } catch (error) {
                    console.warn(
                      "LayerLoadModal auto-login failed on tab switch:",
                      error
                    );
                  }
                } else if (Object.keys(featureGroups).length === 0) {
                  // Already authenticated, load features if needed
                  console.debug(
                    "LayerLoadModal already authenticated on tab switch, loading features..."
                  );
                  setTimeout(() => {
                    loadAvailableFeatureGroups();
                  }, 100);
                }
              };

              checkAndAutoLogin();
            }}
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
              minHeight: 0,
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
                    {authStatusLabel}
                  </div>
                </div>
                <button
                  className={isAuthenticated ? "btn ghost" : "btn primary"}
                  onClick={isAuthenticated ? handleApiLogout : handleApiAuth}
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
              <div
                style={{
                  marginBottom: 16,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                    flexShrink: 0,
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
                      onClick={loadAvailableFeatureGroups}
                      disabled={apiLoadState.isLoading}
                      style={{ fontSize: 12 }}
                    >
                      Refresh Groups
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
                    maxHeight: "calc(40vh)",
                    overflowY: "scroll",
                    overflowX: "hidden",
                    // Ensure scrollbar is always visible when content overflows
                    scrollbarWidth: "auto", // Firefox
                    WebkitOverflowScrolling: "touch", // iOS momentum scrolling
                    // Force scrollbar to be visible
                    scrollbarGutter: "stable",
                  }}
                >
                  {Object.entries(featureGroups).map(([typeCode, group]) => {
                    const isDeleting = deletingTypeCode === typeCode;
                    const isProtected =
                      (group.typeName || "").trim().toLowerCase() ===
                      "batas kecamatan kabupaten badung";
                    const deleteDisabled =
                      deletingTypeCode !== null ||
                      isProtected ||
                      pendingDeleteGroup !== null;

                    return (
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
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleGroupSelection(typeCode);
                            }}
                            onClick={(event) => event.stopPropagation()}
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
                          <div
                            style={{
                              flex: 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
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
                            <div style={{ marginLeft: "auto" }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!deleteDisabled) {
                                    requestDeleteGroup(typeCode);
                                  }
                                }}
                                disabled={deleteDisabled}
                                title={
                                  isProtected
                                    ? "Layer ini tidak dapat dihapus"
                                    : "Hapus semua fitur di layer ini"
                                }
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 10,
                                  borderRadius: 8,
                                  border: "1px solid rgba(248,113,113,0.45)",
                                  backgroundColor: "rgba(248,113,113,0.1)",
                                  color: "#b91c1c",
                                  fontWeight: 600,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  cursor: deleteDisabled
                                    ? "not-allowed"
                                    : "pointer",
                                  opacity: deleteDisabled ? 0.6 : 1,
                                }}
                              >
                                <span
                                  className="icon"
                                  aria-hidden="true"
                                  style={{ fontSize: 14 }}
                                >
                                  delete
                                </span>
                                {isDeleting ? "Menghapus..." : "Hapus"}
                              </button>
                            </div>
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
                                      backgroundColor: "white",
                                      borderTop: "1px solid #e5e7eb",
                                      cursor: "default",
                                    }}
                                  >
                                    {/* Remove checkbox to prevent individual feature selection */}
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
                    );
                  })}
                </div>
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
    <LayerDeleteConfirmationModal
        open={pendingDeleteGroup !== null}
        layerLabel={pendingDeleteGroup?.typeName ?? ""}
        featureCount={pendingDeleteGroup?.featureCount}
        isDeleting={
          pendingDeleteGroup !== null &&
          deletingTypeCode === pendingDeleteGroup.typeCode
        }
        onCancel={cancelDeleteGroup}
        onConfirm={confirmDeleteGroup}
      />
    </>
  );
}
