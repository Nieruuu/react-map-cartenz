// src/components/RightDock.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import OLMap from "ol/Map";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { useLayersStore, styleFromCfg } from "../hooks/useLayersStore";

export default function RightDock() {
  const { map, layers, moveLayer, setVisible, updateStyleCfg, removeEntry } =
    useLayersStore();

  const [open, setOpen] = useState(true);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Editor state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>("");

  // Fokus dari peta
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Refs DOM
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingFlipPrevRects = useRef<Map<string, DOMRect> | null>(null);
  const dragAvatarRef = useRef<HTMLDivElement | null>(null);
  const dragAvatarOffset = useRef<{ x: number; y: number }>({ x: 12, y: 12 });

  // Map instance
  const olMap: OLMap | null = useMemo(() => (map as any) || null, [map]);

  useEffect(() => {
    const openDock = () => setOpen(true);
    window.addEventListener("open-rightdock", openDock);

    const onHighlight = (ev: Event) => {
      const { layerId } = (ev as CustomEvent<any>).detail || {};
      if (!layerId) return;
      setOpen(true);
      setSelectedLayerId(layerId);
      itemRefs.current[layerId]?.scrollIntoView?.({
        block: "nearest",
        behavior: "smooth",
      });
    };
    window.addEventListener("highlight-layer-entry", onHighlight as any);

    return () => {
      window.removeEventListener("open-rightdock", openDock);
      window.removeEventListener("highlight-layer-entry", onHighlight as any);
    };
  }, []);

  // helper kecil: ambil label dari feature, bukan nama layer
  const pickFeatureLabel = (ft: any, mode: "nama" | "kode", fallback = "") => {
    if (mode === "kode") return String(ft.get("id") || "");
    // UTAMAKAN 'name' hasil edit
    const byName = String(ft.get("name") || "");
    if (byName) return byName;
    // fallback: beberapa alias umum dari sumber impor
    const props = ft.getProperties ? ft.getProperties() : {};
    const keys = [
      "D_NM_KEC",
      "NAMA_KEC",
      "NM_KEC",
      "KECAMATAN",
      "Kecamatan",
      "WADMKC",
      "NAMA_KEL",
      "NM_KEL",
      "NAMA_DESA",
      "NM_DESA",
      "NAMA_KAB",
      "NM_KAB",
      "NAME",
      "name",
      "NAMA",
    ];
    for (const k of keys) {
      const v = props[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return fallback;
  };

  const applyStyle = (id: string) => {
    const L = layers.find((l) => l.id === id);
    if (!L) return;
    const base = styleFromCfg(L.styleCfg);
    const mode = (L.styleCfg as any).labelMode || "nama";

    (L.layer as VectorLayer<VectorSource>).setStyle((ft: any) => {
      const s = base(ft).clone();
      const t = s.getText?.();
      if (t) t.setText(pickFeatureLabel(ft, mode));
      return s;
    });

    (L.layer as any).changed?.();
  };

  const doToggle = (id: string) => {
    const L = layers.find((l) => l.id === id);
    if (!L) return;
    (L.layer as VectorLayer<VectorSource>).setVisible(!L.visible);
    setVisible(id, !L.visible);
  };

  const doGoto = (id: string) => {
    const L = layers.find((l) => l.id === id);
    if (!L || !olMap) return;
    const src = (L.layer as VectorLayer<VectorSource>).getSource();
    if (!src) return;
    const ext = src.getExtent();
    if (ext && ext.every((val) => isFinite(val))) {
      olMap.getView().fit(ext, { padding: [40, 40, 40, 320], duration: 300 });
    }
  };

  const doRemove = (id: string) => {
    const L = layers.find((l) => l.id === id);
    if (L && olMap) olMap.removeLayer(L.layer as any);
    removeEntry(id);
    if (expandedId === id) setExpandedId(null);
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const onToggleExpand = (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      const L = layers.find((l) => l.id === id);
      setTempName(L?.name || "");
    }
  };

  const onEditClick = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      const L = layers.find((l) => l.id === id);
      setTempName(L?.name || "");
    }
  };

  const saveName = (id: string) => {
    const val = tempName.trim();
    if (!val) return;

    // Update nama layer di store → memicu re-render RightDock
    useLayersStore.setState((prev) => ({
      layers: prev.layers.map((le) =>
        le.id === id ? { ...le, name: val } : le
      ),
    }));

    // Simpan juga ke metadata OL layer (display only), biar konsisten
    const entry = layers.find((l) => l.id === id);
    if (entry) {
      (entry.layer as any).set("appName", val);
      (entry.layer as any).changed?.();
    }

    // Update tempName to reflect the saved name
    setTempName(val);
    setExpandedId(null);
  };

  /* ===================== FLIP helpers ===================== */
  const captureRects = (): Map<string, DOMRect> => {
    const m = new Map<string, DOMRect>();
    for (const l of layers) {
      const el = itemRefs.current[l.id];
      if (!el) continue;
      m.set(l.id, el.getBoundingClientRect());
    }
    return m;
  };

  const runFlip = (prev: Map<string, DOMRect>) => {
    for (const l of layers) {
      if (l.id === draggingId) continue;
      const el = itemRefs.current[l.id];
      if (!el) continue;
      const last = prev.get(l.id);
      const next = el.getBoundingClientRect();
      if (!last) continue;

      const dy = last.top - next.top;
      if (Math.abs(dy) > 1) {
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        // Force reflow
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        el.offsetHeight;
        el.style.transition = "transform 120ms ease";
        el.style.transform = "translateY(0)";
        const cleanup = () => {
          el.style.transition = "";
          el.style.transform = "";
          el.removeEventListener("transitionend", cleanup);
        };
        el.addEventListener("transitionend", cleanup);
      }
    }
  };

  /* ===================== Drag Avatar (ikut mouse) ===================== */
  const showDragAvatar = (
    srcEl: HTMLElement,
    startX: number,
    startY: number
  ) => {
    // Buat clone minimalis supaya ringan
    const ghost = document.createElement("div");
    ghost.className = "drag-avatar";
    ghost.style.width = `${srcEl.getBoundingClientRect().width}px`;
    ghost.innerHTML =
      srcEl.querySelector(".rd-row")?.outerHTML || srcEl.innerHTML;

    document.body.appendChild(ghost);
    dragAvatarRef.current = ghost;

    const rect = srcEl.getBoundingClientRect();
    dragAvatarOffset.current = { x: startX - rect.left, y: startY - rect.top };
    moveDragAvatar(startX, startY);
  };

  const moveDragAvatar = (clientX: number, clientY: number) => {
    const ghost = dragAvatarRef.current;
    if (!ghost) return;
    const { x, y } = dragAvatarOffset.current;
    ghost.style.left = `${clientX - x}px`;
    ghost.style.top = `${clientY - y}px`;
  };

  const hideDragAvatar = () => {
    const ghost = dragAvatarRef.current;
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    dragAvatarRef.current = null;
  };

  /* ===================== Drag & Drop (realtime + anti-jitter) ===================== */
  const onDragStart = (e: React.DragEvent, idx: number, id: string) => {
    // Matikan ghost bawaan dan bikin avatar kita sendiri
    try {
      const img = new Image();
      img.src =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      e.dataTransfer.setDragImage(img, 0, 0);
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    } catch {}

    setDragIdx(idx);
    setDraggingId(id);
    setOverIdx(idx);

    const src = e.currentTarget as HTMLElement;
    showDragAvatar(src, e.clientX, e.clientY);
  };

  // HTML5 drag event memicu 'onDrag' di element sumber → update posisi avatar
  const onDrag = (e: React.DragEvent<HTMLDivElement>) => {
    moveDragAvatar(e.clientX, e.clientY);
  };

  // Hysteresis: geser hanya bila melewati tengah item target (50/50 → lebih responsif)
  const shouldReorder = (
    currentIdx: number,
    targetIdx: number,
    clientY: number,
    rect: DOMRect
  ) => {
    if (currentIdx === targetIdx) return false;
    const y = clientY - rect.top;
    const h = rect.height;
    if (currentIdx < targetIdx) return y > h * 0.5; // seret ke bawah
    if (currentIdx > targetIdx) return y < h * 0.5; // seret ke atas
    return false;
  };

  const onDragOverItem = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {}

    if (dragIdx === null || expandedId) return;

    if (idx !== dragIdx) {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      if (!shouldReorder(dragIdx, idx, e.clientY, rect)) {
        setOverIdx(idx);
        return;
      }

      const prevRects = captureRects();
      pendingFlipPrevRects.current = prevRects;

      moveLayer(dragIdx, idx);
      setDragIdx(idx);
      setOverIdx(idx);

      requestAnimationFrame(() => {
        const prev = pendingFlipPrevRects.current;
        pendingFlipPrevRects.current = null;
        if (prev) runFlip(prev);
      });
    } else {
      setOverIdx(idx);
    }
  };

  const onDragOverList = (e: React.DragEvent<HTMLDivElement>) => {
    // biar bisa drag di celah tanpa cursor silang
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {}
    moveDragAvatar(e.clientX, e.clientY);
  };

  const onDropOrEnd = () => {
    setDragIdx(null);
    setDraggingId(null);
    setOverIdx(null);
    pendingFlipPrevRects.current = null;
    hideDragAvatar();
  };

  /* ===================== Render ===================== */
  return (
    <div
      className={`rightdock ${open ? "open" : ""} ${
        dragIdx !== null ? "dragging" : ""
      }`}
      aria-label="Layer Settings"
    >
      <div
        className="rd-header"
        role="button"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="icon">layers</span>
        <span style={{ flex: 1 }}>Layer Settings</span>
        <span
          className="icon"
          style={{
            transform: `rotate(${open ? 180 : 0}deg)`,
            transition: "transform .15s",
          }}
        >
          expand_more
        </span>
      </div>

      <div className={`rd-body ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="rd-list" onDragOver={onDragOverList}>
          {layers.map((l, idx) => {
            const isDragging = draggingId === l.id;
            const isPreview = overIdx === idx && !isDragging;

            return (
              <div
                key={l.id}
                ref={(el) => {
                  itemRefs.current[l.id] = el;
                }}
                className={
                  "rd-item " +
                  (expandedId === l.id ? "expanded " : "") +
                  (selectedLayerId === l.id ? "active " : "") +
                  (isDragging ? "dragging-item " : "") +
                  (isPreview ? "drop-preview " : "")
                }
                draggable={expandedId === null}
                onDragStart={(e) => onDragStart(e, idx, l.id)}
                onDrag={(e) => onDrag(e)}
                onDragOver={(e) => onDragOverItem(e, idx)}
                onDrop={onDropOrEnd}
                onDragEnd={onDropOrEnd}
                title={`${l.kind.toUpperCase()} • ${l.name}`}
              >
                <div className="rd-row">
                  <div className="rd-left">
                    <button
                      className="iconbtn drag-handle"
                      title="Drag untuk reorder"
                    >
                      <span className="iconlayers">drag_indicator</span>
                    </button>
                    <button
                      className="iconbtn visibility-btn"
                      onClick={() => doToggle(l.id)}
                      title={l.visible ? "Sembunyikan" : "Tampilkan"}
                    >
                      <span className="iconlayers">
                        {l.visible ? "visibility" : "visibility_off"}
                      </span>
                    </button>
                    <div className="rd-label-container">
                      <div
                        className="rd-label"
                        onClick={() => onToggleExpand(l.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="rd-title" title={l.name}>
                          {l.name}
                        </div>
                        <div className="rd-kind" title={l.kind}>
                          {l.kind}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rd-actions">
                    <button
                      className="iconbtn"
                      title={expandedId === l.id ? "Tutup panel" : "Edit layer"}
                      onClick={() => onEditClick(l.id)}
                      aria-pressed={expandedId === l.id}
                      style={
                        expandedId === l.id
                          ? { borderColor: "#bfdbfe", background: "#eff6ff" }
                          : undefined
                      }
                    >
                      <span className="iconlayers">edit</span>
                    </button>
                    <button
                      className="iconbtn"
                      title="Zoom ke layer"
                      onClick={() => doGoto(l.id)}
                    >
                      <span className="iconlayers">my_location</span>
                    </button>
                    <button
                      className="iconbtn danger"
                      title="Hapus layer"
                      onClick={() => doRemove(l.id)}
                    >
                      <span className="icon">delete</span>
                    </button>
                  </div>
                </div>

                {/* SLIDING EDITOR */}
                <div
                  className={`rd-editor-slide ${
                    expandedId === l.id ? "open" : ""
                  }`}
                >
                  <div className="rd-editor">
                    <div
                      className="name-edit-container"
                      style={{ marginBottom: 12 }}
                    >
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName(l.id);
                        }}
                        placeholder="Nama layer…"
                        className="name-edit-input"
                      />
                      <button
                        className="name-save-btn"
                        title="Simpan nama"
                        onClick={() => saveName(l.id)}
                      >
                        <span className="iconlayers">check</span>
                      </button>
                    </div>

                    <div className="form grid2">
                      <label>
                        <span>Border Color</span>
                        <input
                          type="color"
                          value={l.styleCfg.borderColor}
                          onChange={(e) => {
                            updateStyleCfg(l.id, {
                              borderColor: e.target.value,
                            });
                            applyStyle(l.id);
                          }}
                        />
                      </label>

                      <label>
                        <span>Border Width</span>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.2}
                          value={(l.styleCfg as any).borderWidth ?? 1.4}
                          onChange={(e) => {
                            const v = Math.max(
                              0,
                              Math.min(10, Number(e.target.value) || 0)
                            );
                            updateStyleCfg(l.id, { borderWidth: v } as any);
                            applyStyle(l.id);
                          }}
                        />
                      </label>

                      <label>
                        <span>Border Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={l.styleCfg.borderOpacity ?? 1}
                          onChange={(e) => {
                            updateStyleCfg(l.id, {
                              borderOpacity: Number(e.target.value),
                            });
                            applyStyle(l.id);
                          }}
                        />
                      </label>

                      <label>
                        <span>Border Style</span>
                        <select
                          value={(l.styleCfg as any).borderStyle ?? "Solid"}
                          onChange={(e) => {
                            updateStyleCfg(l.id, {
                              borderStyle: e.target.value as any,
                            });
                            applyStyle(l.id);
                          }}
                        >
                          <option value="Solid">Solid</option>
                          <option value="Dashed">Dashed</option>
                          <option value="Dotted">Dotted</option>
                        </select>
                      </label>

                      <label>
                        <span>Fill Color</span>
                        <input
                          type="color"
                          value={l.styleCfg.fillColor}
                          onChange={(e) => {
                            updateStyleCfg(l.id, { fillColor: e.target.value });
                            applyStyle(l.id);
                          }}
                        />
                      </label>

                      <label>
                        <span>Fill Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={l.styleCfg.fillOpacity}
                          onChange={(e) => {
                            updateStyleCfg(l.id, {
                              fillOpacity: Number(e.target.value),
                            });
                            applyStyle(l.id);
                          }}
                        />
                      </label>

                      <label>
                        <span>Label Size</span>
                        <input
                          type="number"
                          min={8}
                          max={36}
                          step={1}
                          value={l.styleCfg.labelSize ?? 12}
                          onChange={(e) => {
                            updateStyleCfg(l.id, {
                              labelSize: Number(e.target.value),
                            } as any);
                            applyStyle(l.id);
                          }}
                        />
                      </label>

                      <label>
                        <span>Label Font</span>
                        <select
                          value={l.styleCfg.labelFont || "Arial"}
                          onChange={(e) => {
                            updateStyleCfg(l.id, { labelFont: e.target.value });
                            applyStyle(l.id);
                          }}
                        >
                          <option value="Arial">Arial</option>
                          <option value="Inter">Inter</option>
                          <option value="Roboto">Roboto</option>
                          <option value="Segoe UI">Segoe UI</option>
                          <option value="Poppins">Poppins</option>
                          <option value="Montserrat">Montserrat</option>
                          <option value="Noto Sans">Noto Sans</option>
                          <option value="system-ui">System UI</option>
                        </select>
                      </label>

                      <label>
                        <span>Label Color</span>
                        <input
                          type="color"
                          value={l.styleCfg.labelColor || "#111827"}
                          onChange={(e) => {
                            updateStyleCfg(l.id, {
                              labelColor: e.target.value,
                            });
                            applyStyle(l.id);
                          }}
                        />
                      </label>

                      <label>
                        <span>Label Mode</span>
                        <select
                          value={l.styleCfg.labelMode}
                          onChange={(e) => {
                            updateStyleCfg(l.id, {
                              labelMode: e.target.value as any,
                            });
                            applyStyle(l.id);
                          }}
                        >
                          <option value="nama">Nama</option>
                          <option value="kode">Kode</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
                {/* END SLIDING EDITOR */}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
