// src/components/FocusCard.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fromLonLat } from "ol/proj";
import { useMapStore } from "../hooks/useMapStore";

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

function detectPair(props: Record<string, any>): Pair {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(props, k);
  if (has("D_KD_DT2") && has("D_NM_DT2"))
    return { codeKey: "D_KD_DT2", nameKey: "D_NM_DT2", official: true };
  if (has("D_KD_KEC") && has("D_NM_KEC"))
    return { codeKey: "D_KD_KEC", nameKey: "D_NM_KEC", official: true };
  if (has("D_KD_KEL") && has("D_NM_KEL"))
    return { codeKey: "D_KD_KEL", nameKey: "D_NM_KEL", official: true };
  // Gaada kayak diatas? berarti CUSTOM → pakai id/name.
  return { codeKey: "id", nameKey: "name", official: false };
}

export default function FocusCard() {
  const { focus, setFocus } = useMapStore();

  const [openModal, setOpenModal] = useState(false);
  const [rows, setRows] = useState<KV[]>([]);
  const [loadingProps, setLoadingProps] = useState(false);

  const [tempId, setTempId] = useState("");
  const [tempName, setTempName] = useState("");

  const pairRef = useRef<Pair>({
    codeKey: "id",
    nameKey: "name",
    official: false,
  });
  const initialKeysRef = useRef<Set<string>>(new Set());
  const openIdRef = useRef<string | null>(null);
  const openLayerIdRef = useRef<string | null>(null);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(t);
  }, [toast]);

  const hasFocus = !!focus;

  const openEditor = () => {
    if (!focus) return;

    setRows([]);
    initialKeysRef.current = new Set();
    openIdRef.current = (focus as any)?.id || null;
    openLayerIdRef.current = (focus as any).layerId || null;
    setOpenModal(true);
    setLoadingProps(true);

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
      if (p._rawAttributes && Array.isArray(p._rawAttributes)) {
        p._rawAttributes.forEach((attr: any) => {
          if (attr.attributeKey === "spatialFeature.refWilayah") {
            namaWilayah = attr.attributeValue || "";
          }
        });
      }

      // Handle direct attribute structure
      if (p["spatialFeature.refWilayah"]) {
        namaWilayah = p["spatialFeature.refWilayah"];
      }

      // Extract ID wilayah from id field (not uuid/value field)
      idWilayah = p.id || String((focus as any)?.id || "");

      // Set the form values
      setTempName(namaWilayah || String((focus as any)?.name || ""));
      setTempId(idWilayah);

      // Store all attributes in internal state but don't display them
      const list: KV[] = [];
      initialKeysRef.current = new Set();

      // Only keep track of all attributes internally, but don't add them to the display list
      Object.entries(p).forEach(([k, v]) => {
        if (RESERVED_KEYS.has(k)) return;
        // Store all keys for tracking but don't display them
        initialKeysRef.current.add(k);
      });

      // Don't add any default attributes to the display list
      // Only user-added attributes will be shown
      setRows(list);
      setLoadingProps(false);
    };

    window.addEventListener("feature-props-response", onResp as any, {
      once: true,
    });
    window.dispatchEvent(
      new CustomEvent("request-feature-props", {
        detail: { id: (focus as any)?.id, layerId: (focus as any).layerId },
      })
    );

    // fallback supaya gak loading abadi
    setTimeout(() => setLoadingProps(false), 900);
  };

  const addRow = () =>
    setRows((r) => [...r, { id: `row_${Date.now()}`, key: "", value: "" }]);
  const removeRow = (rowId: string) =>
    setRows((r) => r.filter((x) => x.id !== rowId || x.locked));
  const updateRow = (rowId: string, patch: Partial<KV>) =>
    setRows((r) => {
      const { codeKey, nameKey } = pairRef.current;
      return r.map((x) => {
        if (x.id !== rowId) return x;
        let next = { ...x, ...patch };
        // cegah user memasukkan id/name sebagai key baru
        if (patch.key && RESERVED_KEYS.has(patch.key)) {
          setToast({
            type: "error",
            msg: "Kunci 'id/name' tidak boleh diubah.",
          });
          next = x; // abaikan perubahan key
        }
        if (next.locked && next.key === codeKey) setTempId(next.value);
        if (next.locked && next.key === nameKey) setTempName(next.value);
        return next;
      });
    });

  // sinkron input atas -> baris locked
  useEffect(() => {
    const { codeKey } = pairRef.current;
    setRows((r) =>
      r.map((x) =>
        x.locked && x.key === codeKey ? { ...x, value: tempId } : x
      )
    );
  }, [tempId]);
  useEffect(() => {
    const { nameKey } = pairRef.current;
    setRows((r) =>
      r.map((x) =>
        x.locked && x.key === nameKey ? { ...x, value: tempName } : x
      )
    );
  }, [tempName]);

  const saveAll = () => {
    if (!focus) return;
    const { id, layerId } = focus as any;

    // ambil rows non-reserved saja (user-added attributes only)
    const cleaned = rows
      .map((x) => ({
        key: (x.key || "").trim(),
        value: (x.value ?? "").toString(),
        locked: !!x.locked,
      }))
      .filter((x) => x.key && !RESERVED_KEYS.has(x.key));

    const updates: Record<string, string> = {};
    cleaned.forEach(({ key, value }) => (updates[key] = value));

    // Update the core fields for QGIS export compatibility
    updates["spatialFeature.refWilayah"] = (tempName || "").trim();
    updates["uuid"] = (tempId || "").trim();
    updates["id"] = (tempId || "").trim();
    updates["name"] = (tempName || "").trim();

    const currentKeys = new Set(
      cleaned.filter((x) => !x.locked).map((x) => x.key)
    );
    const deletes: string[] = [];
    initialKeysRef.current.forEach((k) => {
      if (!currentKeys.has(k) && !RESERVED_KEYS.has(k)) deletes.push(k);
    });

    const onApplied = (ev: Event) => {
      const d = (ev as CustomEvent<any>).detail || {};
      if (d?.layerId === layerId)
        setToast({ type: "success", msg: "Atribut berhasil disimpan." });
      window.removeEventListener("feature-props-applied", onApplied as any);
    };
    window.addEventListener("feature-props-applied", onApplied as any, {
      once: true,
    });

    // Apply props with proper structure for API compatibility
    window.dispatchEvent(
      new CustomEvent("apply-feature-props", {
        detail: { id, layerId, updates, deletes },
      })
    );

    setTimeout(
      () =>
        setToast((t) => t ?? { type: "success", msg: "Perubahan tersimpan." }),
      700
    );
    openIdRef.current = null;
    openLayerIdRef.current = null;
    setOpenModal(false);
  };

  const cancelAll = () => {
    openIdRef.current = null;
    openLayerIdRef.current = null;
    setOpenModal(false);
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
            <div className="preview-coords">{ring3857.length} vertices</div>
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

      {openModal &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={() => {
              openIdRef.current = null;
              openLayerIdRef.current = null;
              setOpenModal(false);
            }}
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
              <h2 style={{ margin: "16px 16px 8px" }}>Edit Metadata Feature</h2>

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
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    placeholder="Nama wilayah (dari spatialFeature.refWilayah)…"
                    style={{ flex: 1 }}
                  />
                </div>

                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                  <label style={{ minWidth: 140 }}>ID Wilayah</label>
                  <input
                    type="text"
                    value={tempId}
                    onChange={(e) => setTempId(e.target.value)}
                    placeholder="ID wilayah (dari uuid/id)…"
                    style={{ flex: 1 }}
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
                    onClick={addRow}
                    title="Tambah baris"
                  >
                    <span className="iconfocuscard">add</span>
                  </button>
                </div>

                {loadingProps && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Memuat atribut dari feature...
                  </div>
                )}

                <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 40px",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        value={r.key}
                        onChange={(e) =>
                          updateRow(r.id, { key: e.target.value })
                        }
                        placeholder="key"
                        disabled={r.locked}
                        title={r.locked ? "Kunci resmi; tidak bisa diubah" : ""}
                      />
                      <input
                        type="text"
                        value={r.value}
                        onChange={(e) =>
                          updateRow(r.id, { value: e.target.value })
                        }
                        placeholder="value"
                      />
                      <button
                        type="button"
                        className={`iconbtn ${r.locked ? "ghost" : "danger"}`}
                        onClick={() => removeRow(r.id)}
                        disabled={r.locked}
                        title={
                          r.locked
                            ? "Kunci resmi tidak boleh dihapus"
                            : "Hapus baris"
                        }
                      >
                        <span className="iconfocuscard">
                          {r.locked ? "lock" : "delete"}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="row end" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn-save" onClick={saveAll}>
                    <span className="iconfocuscard">save</span> Simpan
                  </button>
                  <button className="btn-cancel" onClick={cancelAll}>
                    <span className="iconfocuscard">cancel</span> Batal
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
