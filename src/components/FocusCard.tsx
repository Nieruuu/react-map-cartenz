// src/components/FocusCard.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { fromLonLat } from "ol/proj";
import { useMapStore } from "../hooks/useMapStore";
import { useMetadataEditor } from "../hooks/useMetadataEditor";
import type { SpatialFeature } from "../lib/api/spatialFeature";

type KV = { id: string; key: string; value: string; locked?: boolean };

// Jangan pernah izinkan kunci ini muncul / disimpan
const RESERVED_KEYS = new Set([
  "geometry",
  "geom",
  "the_geom",
  "_geom",
  "id",
  "ID",
  "name",
  "NAME",
]);

type Pair = { codeKey: string; nameKey: string; official: boolean };

export default function FocusCard() {
  const { focus, setFocus } = useMapStore();
  const metadataEditor = useMetadataEditor();

  // Ref to track if FocusCard should auto-close
  const shouldAutoCloseRef = useRef(true);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(t);
  }, [toast]);

  const hasFocus = !!focus;

  // Auto-close FocusCard when interacting with other UI elements
  const handleOutsideInteraction = useCallback(
    (event: Event) => {
      if (!focus || !shouldAutoCloseRef.current) return;

      // Don't close if clicking inside the FocusCard
      const focusCardElement = document.querySelector(".focuscard-improved");
      if (focusCardElement && focusCardElement.contains(event.target as Node)) {
        return;
      }

      // Don't close if clicking on the edit modal
      const modalElement = document.querySelector(".modal-overlay");
      if (modalElement && modalElement.contains(event.target as Node)) {
        return;
      }

      // Close FocusCard when interacting with other UI elements
      setFocus(null);
    },
    [focus, setFocus]
  );

  // Set up event listeners for auto-close
  useEffect(() => {
    if (!focus) return;

    // Reset auto-close flag when focus changes
    shouldAutoCloseRef.current = true;

    // List of UI elements that should trigger auto-close
    const uiSelectors = [
      ".leftstack", // Left dock panels
      ".rightdock", // Right dock panels
      ".topbar", // Top bar
      ".footerbar", // Footer bar
      ".modal-overlay", // Any modal overlays
      ".ld-panel", // Left dock panels
      ".rd-item", // Right dock items
      ".btn", // Buttons
      ".iconbtn", // Icon buttons
      ".form-input", // Form inputs
      ".form-select", // Form selects
      ".tab", // Tabs
    ];

    const handleClick = (event: Event) => {
      // Check if the click is on any UI element that should trigger auto-close
      const target = event.target as Element;
      const shouldClose = uiSelectors.some(
        (selector) =>
          target.closest(selector) && !target.closest(".focuscard-improved")
      );

      if (shouldClose) {
        handleOutsideInteraction(event);
      }
    };

    // Add event listeners
    document.addEventListener("click", handleClick, true);
    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("touchstart", handleClick, true);

    // Also listen for custom events from other components
    const handleCustomEvent = () => {
      if (shouldAutoCloseRef.current) {
        setFocus(null);
      }
    };

    window.addEventListener("open-left-dock", handleCustomEvent);
    window.addEventListener("open-right-dock", handleCustomEvent);
    window.addEventListener("open-modal", handleCustomEvent);
    window.addEventListener("panel-header-click", handleCustomEvent);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("touchstart", handleClick, true);
      window.removeEventListener("open-left-dock", handleCustomEvent);
      window.removeEventListener("open-right-dock", handleCustomEvent);
      window.removeEventListener("open-modal", handleCustomEvent);
      window.removeEventListener("panel-header-click", handleCustomEvent);
    };
  }, [focus, handleOutsideInteraction, setFocus]);

  const openEditor = () => {
    if (!focus) return;

    // Disable auto-close while editing
    shouldAutoCloseRef.current = false;

    // Request feature properties to get the full feature data
    const openIdRef = { current: (focus as any)?.id || null };
    const openLayerIdRef = { current: (focus as any).layerId || null };

    const onResp = (ev: Event) => {
      const {
        id: rid,
        layerId: rlayer,
        props,
      } = (ev as CustomEvent<any>).detail || {};
      if (rid !== openIdRef.current || rlayer !== openLayerIdRef.current)
        return;

      const p: Record<string, any> = props || {};

      // Extract Nama Wilayah from spatialFeature.refWilayah attribute
      let namaWilayah = "";
      let idWilayah = "";

      // Handle API-loaded features with attribute structure
      const attributes: any[] = [];
      if (p._rawAttributes && Array.isArray(p._rawAttributes)) {
        p._rawAttributes.forEach((attr: any) => {
          if (attr.attributeKey === "spatialFeature.refWilayah") {
            namaWilayah = attr.attributeValue || "";
          } else {
            // Add all attributes except spatialFeature.refWilayah
            attributes.push({
              id: attr.id,
              attributeKey: attr.attributeKey,
              attributeValue: attr.attributeValue,
              attributeLabel: attr.attributeLabel || attr.attributeKey,
              attributeValueType: attr.attributeValueType || 1,
            });
          }
        });
      }

      // Handle direct attribute structure
      if (p["spatialFeature.refWilayah"]) {
        namaWilayah = p["spatialFeature.refWilayah"];
      }

      // Extract ID wilayah from id field (not uuid/value field)
      idWilayah = p.id || String((focus as any)?.id || "");

      // Create a SpatialFeature object from the focus data
      const spatialFeature: SpatialFeature = {
        id: (focus as any)?.id || 0,
        systemId: 0,
        type: 0,
        identifier: "",
        label: "",
        value: "",
        status: 1,
        attribute: attributes,
        description: "",
        createdBy: "",
        createdAt: 0,
        updatedBy: "",
        updatedAt: 0,
      };

      // Start editing with the metadata editor hook
      metadataEditor.actions.startEditing(spatialFeature);
    };

    // Listen for success/error events from the metadata editor
    const onPropsApplied = (ev: Event) => {
      const { id: rid, layerId: rlayer } =
        (ev as CustomEvent<any>).detail || {};
      if (rid !== openIdRef.current || rlayer !== openLayerIdRef.current)
        return;

      // Re-enable auto-close after successful save
      shouldAutoCloseRef.current = true;
      setToast({ type: "success", msg: "Metadata berhasil disimpan." });

      // Refresh the focus data to show updated values
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("request-feature-props", {
            detail: { id: (focus as any)?.id, layerId: (focus as any).layerId },
          })
        );
      }, 100);
    };

    // Listen for layer reload completion to refresh focus data
    const onLayerReloaded = (ev: Event) => {
      const { layerId, newLayerId } = (ev as CustomEvent<any>).detail || {};

      // Check if this is the layer we're interested in
      if (layerId !== openLayerIdRef.current) return;

      // Refresh the focus data with the new layer data
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("request-feature-props", {
            detail: {
              id: (focus as any)?.id,
              layerId: newLayerId || layerId, // Use new layer ID if provided
            },
          })
        );
      }, 200); // Slightly longer delay to ensure layer is fully reloaded
    };

    const onPropsError = (ev: Event) => {
      const {
        id: rid,
        layerId: rlayer,
        error,
      } = (ev as CustomEvent<any>).detail || {};
      if (rid !== openIdRef.current || rlayer !== openLayerIdRef.current)
        return;

      setToast({ type: "error", msg: `Gagal menyimpan: ${error}` });
    };

    window.addEventListener("feature-props-response", onResp as any, {
      once: true,
    });
    window.addEventListener("feature-props-applied", onPropsApplied as any);
    window.addEventListener("feature-props-error", onPropsError as any);
    window.addEventListener("layer-reloaded", onLayerReloaded as any);

    window.dispatchEvent(
      new CustomEvent("request-feature-props", {
        detail: { id: (focus as any)?.id, layerId: (focus as any).layerId },
      })
    );

    // fallback supaya gak loading abadi
    setTimeout(() => {
      // If no response, start editing with basic data
      if (!metadataEditor.state.isEditing) {
        const namaWilayah = String((focus as any)?.name || "");
        const attributes: any[] = [
          {
            id: 0, // Temporary ID
            attributeKey: "spatialFeature.refWilayah",
            attributeValue: namaWilayah,
            attributeLabel: "spatialFeature.refWilayah",
            attributeValueType: 1,
          },
        ];

        const spatialFeature: SpatialFeature = {
          id: (focus as any)?.id || 0,
          systemId: 0,
          type: 0,
          identifier: "",
          label: "",
          value: "",
          status: 1,
          attribute: attributes,
          description: "",
          createdBy: "",
          createdAt: 0,
          updatedBy: "",
          updatedAt: 0,
        };

        metadataEditor.actions.startEditing(spatialFeature);
      }
    }, 900);

    // Clean up event listeners when component unmounts or editing ends
    return () => {
      window.removeEventListener(
        "feature-props-applied",
        onPropsApplied as any
      );
      window.removeEventListener("feature-props-error", onPropsError as any);
      window.removeEventListener("layer-reloaded", onLayerReloaded as any);
    };
  };

  const saveAll = async () => {
    // Show confirmation modal first
    setShowSaveConfirmation(true);
  };

  const confirmSave = async () => {
    setShowSaveConfirmation(false);

    try {
      // For API-loaded features, the save is handled by the TaxMap component
      // For local features, use the direct save method
      const isApiFeature =
        (focus as any)?._rawAttributes &&
        Array.isArray((focus as any)._rawAttributes);

      if (isApiFeature) {
        // Trigger the apply-feature-props event to let TaxMap handle the save
        const updates: Record<string, any> = {};
        const deletes: string[] = [];

        // Build updates from the metadata editor state
        const originalNamaWilayah =
          metadataEditor.state.originalFeature?.attribute?.find(
            (attr) => attr.attributeKey === "spatialFeature.refWilayah"
          )?.attributeValue || "";

        if (metadataEditor.state.namaWilayah !== originalNamaWilayah) {
          updates["spatialFeature.refWilayah"] =
            metadataEditor.state.namaWilayah;
        }

        metadataEditor.state.editableAttributes.forEach((attr) => {
          const originalAttr =
            metadataEditor.state.originalFeature?.attribute?.find(
              (orig: any) =>
                orig.id === parseInt(attr.id) ||
                orig.attributeKey === `spatialFeature.${attr.attributeKey}`
            );

          if (attr.isNew && attr.attributeValue.trim() !== "") {
            updates[attr.attributeKey] = attr.attributeValue;
          } else if (
            originalAttr &&
            originalAttr.attributeValue !== attr.attributeValue
          ) {
            updates[attr.attributeKey] = attr.attributeValue;
          }
        });

        // Send the apply event with layer reload request
        console.log(
          "FocusCard: Dispatching apply-feature-props event with reloadLayer=true",
          {
            id: (focus as any)?.id,
            layerId: (focus as any).layerId,
            updates,
            deletes,
            reloadLayer: true,
          }
        );
        window.dispatchEvent(
          new CustomEvent("apply-feature-props", {
            detail: {
              id: (focus as any)?.id,
              layerId: (focus as any).layerId,
              updates,
              deletes,
              reloadLayer: true, // Request layer reload after save
            },
          })
        );
      } else {
        // Local feature: use direct save method
        const success = await metadataEditor.actions.saveChanges();
        if (success) {
          // Re-enable auto-close after saving
          shouldAutoCloseRef.current = true;
          setToast({ type: "success", msg: "Metadata berhasil disimpan." });
        } else {
          setToast({ type: "error", msg: "Gagal menyimpan metadata." });
        }
      }
    } catch (error) {
      console.error("Error saving metadata:", error);
      setToast({ type: "error", msg: "Terjadi kesalahan saat menyimpan." });
    }
  };

  const cancelSave = () => {
    setShowSaveConfirmation(false);
  };

  const cancelAll = () => {
    metadataEditor.actions.cancelEditing();
    // Re-enable auto-close after canceling
    shouldAutoCloseRef.current = true;
  };

  // Mini preview, posisikan shape di tengah (pakai offset centering)
  const renderMiniPreview = () => {
    const g = (focus as any)?.geom;
    if (!g) {
      return (
        <div className="mini-preview-placeholder">
          <div className="placeholder-content">
            <span className="iconfocuscard">location_on</span>
            <div>No Preview</div>
          </div>
        </div>
      );
    }
    try {
      let ringLonLat: number[][] = [];
      if (g.type === "Polygon") ringLonLat = g.coordinates[0];
      else if (g.type === "MultiPolygon") {
        // ambil polygon terluas agar preview proporsional
        let largest: number[][] = g.coordinates[0][0];
        let maxArea = 0;
        g.coordinates.forEach((poly: any) => {
          const coords = poly[0];
          const c3857 = coords.map(([lo, la]: number[]) =>
            fromLonLat([lo, la])
          );
          let area = 0;
          for (let i = 0; i < c3857.length - 1; i++)
            area +=
              c3857[i][0] * c3857[i + 1][1] - c3857[i + 1][0] * c3857[i][1];
          area = Math.abs(area) / 2;
          if (area > maxArea) {
            maxArea = area;
            largest = coords;
          }
        });
        ringLonLat = largest;
      }
      if (!ringLonLat.length) return null;

      const ring3857 = ringLonLat.map(([lo, la]) => fromLonLat([lo, la])) as [
        number,
        number
      ][];
      const xs = ring3857.map((c) => c[0]);
      const ys = ring3857.map((c) => c[1]);
      const minX = Math.min(...xs),
        maxX = Math.max(...xs);
      const minY = Math.min(...ys),
        maxY = Math.max(...ys);

      // ukuran kanvas
      const pad = 12;
      const svgWidth = 220;
      const svgHeight = 180;

      // skala uniform, sisakan padding
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const scale = Math.min(
        (svgWidth - 2 * pad) / w,
        (svgHeight - 2 * pad) / h
      );

      // hitung offset supaya konten tepat di tengah
      const contentW = w * scale;
      const contentH = h * scale;
      const offsetX = (svgWidth - contentW) / 2 - minX * scale;
      const offsetY = (svgHeight - contentH) / 2 + maxY * scale; // ingat sumbu Y terbalik

      const nx = (x: number) => offsetX + x * scale;
      const ny = (y: number) => offsetY - y * scale;

      const pathData = `M ${ring3857
        .map(([x, y]) => `${nx(x)} ${ny(y)}`)
        .join(" L ")} Z`;

      // centroid sederhana untuk titik merah
      const cx0 = xs.reduce((a, b) => a + b, 0) / xs.length;
      const cy0 = ys.reduce((a, b) => a + b, 0) / ys.length;
      const cx = nx(cx0);
      const cy = ny(cy0);

      return (
        <div className="mini-preview-container">
          <svg width={svgWidth} height={svgHeight} className="mini-preview-svg">
            <rect width="100%" height="100%" fill="#f8fafc" />
            <defs>
              <pattern
                id="grid"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3" />
            <path
              d={pathData}
              fill="rgba(59,130,246,.12)"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={cx}
              cy={cy}
              r="3"
              fill="#ef4444"
              stroke="#fff"
              strokeWidth="1"
            />
          </svg>
          <div className="preview-info">
            <div className="preview-type">{g.type}</div>
            <div className="preview-coords">
              {ring3857.length > 0 ? ring3857.length - 1 : 0} vertices
            </div>
          </div>
        </div>
      );
    } catch {
      return (
        <div className="mini-preview-placeholder">
          <div className="placeholder-content">
            <span className="iconfocuscard">warning</span>
            <div>Preview Error</div>
          </div>
        </div>
      );
    }
  };

  if (!hasFocus) return <div style={{ display: "none" }} />;

  const { id, name, lon, lat } = (focus as any) || {};

  return (
    <div className="focuscard-improved">
      <button
        className="close-btn"
        onClick={() => setFocus(null)}
        title="Tutup"
      >
        <span className="iconfocuscard">close</span>
      </button>

      <div className="focuscard-content">
        <div className="preview-section">{renderMiniPreview()}</div>

        <div className="info-section">
          <div className="view-content">
            <div className="info-header">
              <div className="area-name">
                {name || "Wilayah Tidak Diketahui"}
              </div>
              <div className="area-code">{id || "N/A"}</div>
            </div>

            {lat && lon && (
              <div className="coordinates-section">
                <div className="coord-label">
                  <span className="iconfocuscard">place</span>Koordinat
                </div>
                <div className="coord-values">
                  <div
                    className="coord-item"
                    onClick={() =>
                      navigator.clipboard.writeText(`${lat}, ${lon}`)
                    }
                    title="Klik untuk copy"
                  >
                    <span className="coord-type">Lat:</span>
                    <span className="coord-value">{lat.toFixed(6)}</span>
                  </div>
                  <div
                    className="coord-item"
                    onClick={() =>
                      navigator.clipboard.writeText(`${lat}, ${lon}`)
                    }
                    title="Klik untuk copy"
                  >
                    <span className="coord-type">Lon:</span>
                    <span className="coord-value">{lon.toFixed(6)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Attributes Display */}
            {(focus as any)?._rawAttributes &&
              Array.isArray((focus as any)._rawAttributes) && (
                <div className="attributes-section">
                  <div className="attributes-label">
                    <span className="iconfocuscard">list</span>Atribut Kustom
                  </div>
                  <div className="attributes-list">
                    {((focus as any)._rawAttributes as any[])
                      .filter((attr) => {
                        // Filter out system attributes
                        const systemAttributes = [
                          "spatialFeature.type",
                          "spatialFeature.geometry",
                          "spatialFeature.refWilayah",
                        ];
                        return !systemAttributes.includes(attr.attributeKey);
                      })
                      .map((attr, index) => (
                        <div key={index} className="attribute-item">
                          <div className="attribute-key">
                            {attr.attributeKey}
                          </div>
                          <div className="attribute-value">
                            {attr.attributeValue}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

            <div className="action-buttons">
              <button
                className="btn-action primary"
                onClick={openEditor}
                title="Edit metadata"
              >
                <span className="iconfocuscard">edit</span>
                <span>Edit</span>
              </button>
              <button
                className="btn-action"
                onClick={() => {
                  if (lat && lon)
                    window.open(
                      `https://www.google.com/maps?q=${lat},${lon}`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                }}
                title="Buka di Google Maps"
              >
                <span className="iconfocuscard">map</span>
                <span>Maps</span>
              </button>
              <button
                className="btn-action"
                onClick={() => {
                  if (lat && lon)
                    window.open(
                      `https://www.google.com/maps/@${lat},${lon},3a,75y,0h,90t/data=!3m4!1e1!3m2!1s0:0!2e0`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                }}
                title="Street View"
              >
                <span className="iconfocuscard">streetview</span>
                <span>Street View</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {metadataEditor.state.isEditing &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={cancelAll}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 9999,
            }}
          >
            <div
              className="modal-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
                maxWidth: 620,
                width: "92%",
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 12px 24px rgba(0,0,0,.25)",
                overflow: "hidden",
              }}
            >
              <h2 style={{ margin: "16px 16px 8px" }}>
                Edit Metadata Feature
                {metadataEditor.state.hasUnsavedChanges && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      color: "#f59e0b",
                      fontWeight: "normal",
                    }}
                  >
                    (Unsaved changes)
                  </span>
                )}
              </h2>

              <div
                className="form"
                style={{
                  padding: "0 16px 16px",
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                }}
              >
                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                  <label style={{ minWidth: 140 }}>Nama Wilayah</label>
                  <input
                    type="text"
                    value={metadataEditor.state.namaWilayah}
                    onChange={(e) =>
                      metadataEditor.actions.updateNamaWilayah(e.target.value)
                    }
                    placeholder="Nama wilayah (dari spatialFeature.refWilayah)…"
                    style={{ flex: 1 }}
                  />
                </div>

                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                  <label style={{ minWidth: 140 }}>ID Wilayah</label>
                  <input
                    type="text"
                    value={metadataEditor.state.idWilayah}
                    onChange={(e) =>
                      metadataEditor.actions.updateIdWilayah(e.target.value)
                    }
                    placeholder="ID wilayah (dari uuid/id)…"
                    readOnly
                    style={{
                      flex: 1,
                      backgroundColor: "#f3f4f6",
                      cursor: "not-allowed",
                      opacity: 0.7,
                    }}
                    title="ID Wilayah tidak dapat diubah"
                  />
                </div>

                <div
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 6,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Atribut Tambahan</div>
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={metadataEditor.actions.addAttribute}
                    title="Tambah atribut baru"
                  >
                    <span className="iconfocuscard">add</span>
                  </button>
                </div>

                {metadataEditor.state.isLoading && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Menyimpan perubahan...
                  </div>
                )}

                <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                  {metadataEditor.state.editableAttributes.map((attr) => (
                    <div
                      key={attr.id}
                      className="row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 40px",
                        gap: 8,
                        alignItems: "center",
                        border: attr.hasError ? "1px solid #ef4444" : "none",
                        borderRadius: 4,
                        padding: 4,
                      }}
                    >
                      <input
                        type="text"
                        value={attr.attributeKey}
                        onChange={(e) =>
                          metadataEditor.actions.updateAttribute(
                            attr.id,
                            "attributeKey",
                            e.target.value
                          )
                        }
                        placeholder="attributeName"
                        readOnly={!attr.isNew} // Make keys read-only for existing attributes
                        style={{
                          borderColor: attr.hasError ? "#ef4444" : undefined,
                          backgroundColor: !attr.isNew ? "#f3f4f6" : undefined,
                          cursor: !attr.isNew ? "not-allowed" : undefined,
                          opacity: !attr.isNew ? 0.7 : undefined,
                        }}
                        title={
                          !attr.isNew
                            ? "Attribute key tidak dapat diubah setelah disimpan"
                            : "Attribute key akan otomatis ditambahi prefix 'spatialFeature.'"
                        }
                      />
                      <input
                        type="text"
                        value={attr.attributeValue}
                        onChange={(e) =>
                          metadataEditor.actions.updateAttribute(
                            attr.id,
                            "attributeValue",
                            e.target.value
                          )
                        }
                        placeholder="value"
                        style={{
                          borderColor: attr.hasError ? "#ef4444" : undefined,
                        }}
                      />
                      <button
                        type="button"
                        className={`iconbtn ${attr.isNew ? "danger" : "ghost"}`}
                        onClick={() =>
                          metadataEditor.actions.removeAttribute(attr.id)
                        }
                        title={attr.isNew ? "Hapus atribut" : "Hapus atribut"}
                      >
                        <span className="iconfocuscard">delete</span>
                      </button>
                      {attr.hasError && (
                        <div
                          style={{
                            gridColumn: "1 / -1",
                            fontSize: 12,
                            color: "#ef4444",
                            marginTop: 2,
                          }}
                        >
                          {attr.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="row end" style={{ gap: 8, marginTop: 10 }}>
                  <button
                    className="btn-save"
                    onClick={saveAll}
                    disabled={
                      metadataEditor.state.isLoading ||
                      !metadataEditor.state.hasUnsavedChanges
                    }
                    style={{
                      opacity:
                        metadataEditor.state.isLoading ||
                        !metadataEditor.state.hasUnsavedChanges
                          ? 0.6
                          : 1,
                      cursor:
                        metadataEditor.state.isLoading ||
                        !metadataEditor.state.hasUnsavedChanges
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <span className="iconfocuscard">
                      {metadataEditor.state.isLoading
                        ? "hourglass_empty"
                        : "save"}
                    </span>
                    {metadataEditor.state.isLoading ? "Menyimpan..." : "Simpan"}
                  </button>
                  <button
                    className="btn-cancel"
                    onClick={cancelAll}
                    disabled={metadataEditor.state.isLoading}
                    style={{
                      opacity: metadataEditor.state.isLoading ? 0.6 : 1,
                      cursor: metadataEditor.state.isLoading
                        ? "not-allowed"
                        : "pointer",
                    }}
                  >
                    <span className="iconfocuscard">cancel</span> Batal
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showSaveConfirmation &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={cancelSave}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 10000,
            }}
          >
            <div
              className="modal-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                maxWidth: 400,
                width: "90%",
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 12px 24px rgba(0,0,0,.25)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "24px", textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    marginBottom: "16px",
                  }}
                >
                  Apakah kamu yakin?
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "24px",
                  }}
                >
                  Perubahan metadata akan disimpan dan layer akan dimuat ulang
                  secara otomatis.
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "center",
                  }}
                >
                  <button
                    className="btn-cancel"
                    onClick={cancelSave}
                    style={{
                      padding: "10px 20px",
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      borderRadius: 6,
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Tidak
                  </button>
                  <button
                    className="btn-save"
                    onClick={confirmSave}
                    style={{
                      padding: "10px 20px",
                      border: "none",
                      background: "#3b82f6",
                      color: "#fff",
                      borderRadius: 6,
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Ya
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {toast &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: "50%",
              bottom: 24,
              transform: "translateX(-50%)",
              background: toast.type === "success" ? "#10b981" : "#ef4444",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 10,
              boxShadow: "0 10px 20px rgba(0,0,0,.2)",
              zIndex: 10000,
              fontWeight: 700,
            }}
          >
            {toast.msg}
          </div>,
          document.body
        )}
    </div>
  );
}
