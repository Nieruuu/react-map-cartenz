// src/components/LayerLoadModal.tsx
import { useEffect, useMemo, useState } from "react";

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

export default function LayerLoadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [selected, setSelected] = useState<string>("");

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
          width: "min(680px, 92%)",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 40px rgba(0,0,0,.25)",
          padding: 16,
        }}
      >
        <h2 style={{ margin: 0, padding: "6px 4px 2px" }}>
          Load Peta (Imported)
        </h2>
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
            }}
          >
            Tidak ada dataset di registry. Import shapefile/geojson dari panel
            kiri dulu.
          </div>
        )}

        {hasData && (
          <div
            style={{
              maxHeight: 360,
              overflow: "auto",
              border: "1px solid #f1f5f9",
              borderRadius: 10,
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
                  style={{ position: "sticky", top: 0, background: "#f8fafc" }}
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
                  <tr key={it.key} style={{ borderTop: "1px solid #f1f5f9" }}>
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
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {it.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <button className="btn primary" onClick={onLoad} disabled={!selected}>
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
