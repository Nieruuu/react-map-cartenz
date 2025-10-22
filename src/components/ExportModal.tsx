import { useEffect, useMemo, useState } from "react";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { useLayersStore } from "../hooks/useLayersStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onExport: (layerId: string) => void;
};

export default function ExportModal({ open, onClose, onExport }: Props) {
  const { layers } = useLayersStore();
  const [picked, setPicked] = useState<string | null>(null);

  const vectorLayers = useMemo(() => {
    return layers
      .filter((le) => le.layer instanceof VectorLayer)
      .map((le) => {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        const count = src ? src.getFeatures().length : 0;
        const kind =
          (
            le.layer as VectorLayer<VectorSource> & {
              get?: (key: string) => unknown;
            }
          ).get?.("appKind") || "custom";
        const base = (
          le.layer as VectorLayer<VectorSource> & {
            get?: (key: string) => unknown;
          }
        ).get?.("fileBase") as string | undefined;
        return {
          id: le.id,
          name: le.name,
          kind,
          count,
          base,
          visible: le.visible,
        };
      });
  }, [layers]);

  useEffect(() => {
    if (!open) return;

    // Dispatch custom event when modal opens (for FocusCard auto-close)
    window.dispatchEvent(
      new CustomEvent("open-modal", {
        detail: { modal: "ExportModal" },
      })
    );

    const firstVisible = vectorLayers.find((le) => le.visible);
    setPicked(firstVisible?.id || vectorLayers[0]?.id || null);
  }, [open, vectorLayers]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, .35)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "100%",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Export Layer ke ZIP (Shapefile)
          </h3>
          <button onClick={onClose} className="circle ghost" title="Tutup">
            <span className="icon">close</span>
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {vectorLayers.length === 0 ? (
            <div className="muted">Tidak ada layer vektor untuk diexport.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {vectorLayers.map((le) => (
                <label
                  key={le.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="export_layer"
                    checked={picked === le.id}
                    onChange={() => setPicked(le.id)}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{le.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Jenis: {String(le.kind)} • {le.count} fitur
                      {le.base ? ` • file: ${le.base}.zip` : ""}
                    </div>
                  </div>
                  <div className="badge" style={{ fontSize: 12 }}>
                    {le.kind}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 16,
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn ghost" onClick={onClose}>
            <span className="icon">close</span> Batal
          </button>
          <button
            className="btn primary"
            disabled={!picked}
            onClick={() => picked && onExport(picked)}
          >
            <span className="icon">download</span> Export ZIP
          </button>
        </div>
      </div>
    </div>
  );
}
