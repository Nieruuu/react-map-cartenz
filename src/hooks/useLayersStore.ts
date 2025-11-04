// src/hooks/useLayersStore.ts
import { create } from "zustand";
import type Map from "ol/Map";
import type { FeatureLike } from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";

/** ==== Types ==== */
export type LayerKind = "kabupaten" | "kecamatan" | "kelurahan" | "custom";
export type AttributeLabelMode = `attr:${string}`;
export type LabelMode = "kode" | "nama" | AttributeLabelMode;

export type LayerStyleCfg = {
  borderColor: string;
  borderOpacity: number;
  borderWidth?: number; // px
  borderStyle?: "Solid" | "Dashed" | "Dotted";
  fillColor: string;
  fillOpacity: number;
  labelColor: string;
  labelStroke?: string;
  labelStrokeWidth?: number;
  labelFont: string; // font family
  labelSize?: number;
  labelMode: LabelMode;
};

export interface LayerEntry {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  layer: VectorLayer<VectorSource>;
  styleCfg: LayerStyleCfg;
  typeCode?: string; // Store the spatial feature type code for API layers
}

/** ==== Utils ==== */
const toRgba = (hex: string, a = 1) => {
  const h = (hex || "#000000").replace("#", "");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
};

export const styleFromCfg = (cfg: LayerStyleCfg) => {
  const dash =
    cfg.borderStyle === "Dashed"
      ? [6, 4]
      : cfg.borderStyle === "Dotted"
      ? [2, 6]
      : undefined;

  const normalizeKey = (key: string | null | undefined) =>
    (key || "").trim().toLowerCase();

  const getRawAttributes = (feature: any): any[] | undefined => {
    if (!feature) return undefined;
    const raw =
      feature?.get?.("_rawAttributes") ?? (feature as any)?._rawAttributes;
    return Array.isArray(raw) ? raw : undefined;
  };

  const getAttributeValue = (feature: any, key: string): string => {
    if (!feature || !key) return "";
    const normalizedKey = normalizeKey(key);
    const toStringOrEmpty = (value: unknown) =>
      value === undefined || value === null ? "" : String(value);

    if (normalizedKey === "spatialfeature.refwilayah") {
      const direct =
        feature.get?.("regionName") ??
        feature.get?.("name") ??
        getAttributeValue(feature, "name");
      if (direct) return toStringOrEmpty(direct);
    }

    if (normalizedKey === "spatialfeature.type") {
      const direct =
        feature.get?.("layerType") ??
        feature.get?.("type") ??
        getAttributeValue(feature, "type");
      if (direct) return toStringOrEmpty(direct);
    }

    if (normalizedKey === "spatialfeature.uuid") {
      const direct =
        feature.get?.("id") ??
        feature.get?.("uuid") ??
        getAttributeValue(feature, "id");
      if (direct) return toStringOrEmpty(direct);
    }

    const rawAttributes = getRawAttributes(feature);
    if (rawAttributes) {
      for (const attr of rawAttributes) {
        const attrKey = normalizeKey(attr?.attributeKey);
        if (!attrKey || attrKey !== normalizedKey) continue;
        return toStringOrEmpty(attr?.attributeValue);
      }
    }

    const props = feature.getProperties ? feature.getProperties() : {};
    if (key in props) return toStringOrEmpty(props[key]);
    const tail = key.includes(".") ? key.split(".").pop() : key;
    if (tail && tail in props) return toStringOrEmpty(props[tail]);

    return "";
  };

  const getDefaultName = (feature: any, fallback = ""): string => {
    if (!feature) return fallback;
    const byName = feature.get?.("name");
    if (typeof byName === "string" && byName.trim()) return byName.trim();
    const props = feature.getProperties ? feature.getProperties() : {};
    const aliases = [
      "name",
      "NAME",
      "Nama",
      "nama",
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
      "NAMA",
    ];
    for (const key of aliases) {
      const value = props[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return fallback;
  };

  const resolveLabelText = (feature: FeatureLike): string => {
    const mode = cfg.labelMode || "nama";
    if (mode === "kode") {
      const idValue =
        (feature as any)?.get?.("id") ??
        (feature as any)?.get?.("ID") ??
        (feature as any)?.get?.("objectid") ??
        (feature as any)?.get?.("OBJECTID");
      return idValue ? String(idValue) : "";
    }
    if (mode === "nama") {
      const name = getDefaultName(feature, "");
      return name ? name.toUpperCase() : "";
    }
    if (mode.startsWith("attr:")) {
      const attributeKey = mode.slice(5);
      const attrValue = getAttributeValue(feature, attributeKey);
      if (attrValue) return attrValue;
      const fallbackName = getDefaultName(feature, "");
      return fallbackName ? fallbackName.toUpperCase() : "";
    }
    return "";
  };

  return (feature: FeatureLike) => {
    const labelText = resolveLabelText(feature);

    return new Style({
      fill: new Fill({ color: toRgba(cfg.fillColor, cfg.fillOpacity) }),
      stroke: new Stroke({
        color: toRgba(cfg.borderColor, cfg.borderOpacity),
        width: cfg.borderWidth ?? 1.4,
        lineDash: dash,
      }),
      text: labelText
        ? new Text({
            text: labelText,
            font: `${cfg.labelSize ?? 12}px ${cfg.labelFont || "Arial"}`,
            fill: new Fill({ color: cfg.labelColor || "#1f2937" }),
            stroke:
              cfg.labelStroke && (cfg.labelStrokeWidth ?? 0) > 0
                ? new Stroke({ color: cfg.labelStroke, width: cfg.labelStrokeWidth })
                : new Stroke({ color: "rgba(255,255,255,.9)", width: 3 }),
            overflow: true,
          })
        : undefined,
    });
  };
};

/** ==== Store ==== */
type S = {
  map: Map | null;
  setMap: (m: Map | null) => void;

  /** Urutan disimpan TOP-FIRST: index 0 = paling depan */
  layers: LayerEntry[];

  /** Ambil array layer dari atas ke bawah (buat picking) */
  topFirst: () => LayerEntry[];

  addLayer: (e: LayerEntry) => void;
  removeEntry: (id: string) => void;
  pruneLayerIfEmpty: (id: string) => void;
  moveLayer: (fromIdx: number, toIdx: number) => void;
  setVisible: (id: string, v: boolean) => void;
  updateLayerName: (id: string, newName: string) => void;

  /** Update styleCfg & langsung apply ke OL (fix perlu klik 2x) */
  updateStyleCfg: (id: string, patch: Partial<LayerStyleCfg>) => void;

  /** internal: sinkron zIndex sesuai urutan TOP-FIRST */
  _applyOrder: () => void;
};

export const useLayersStore = create<S>((set, get) => ({
  map: null,
  setMap: (m) => set({ map: m }),

  layers: [],

  // sudah top-first di array
  topFirst: () => get().layers,

  addLayer: (e) =>
    set((s) => {
      // style & visibility awal
      e.layer.setStyle(styleFromCfg(e.styleCfg));
      e.layer.setVisible(e.visible);

      // pastikan ada di map
      if (s.map && !s.map.getLayers().getArray().includes(e.layer)) {
        s.map.addLayer(e.layer);
      }

      // masukkan ke PALING ATAS (index 0)
      const layers = [e, ...s.layers];
      setTimeout(get()._applyOrder, 0);
      return { layers };
    }),

  removeEntry: (id) =>
    set((s) => {
      const L = s.layers.find((x) => x.id === id);
      if (L && s.map) s.map.removeLayer(L.layer);
      const layers = s.layers.filter((x) => x.id !== id);
      setTimeout(get()._applyOrder, 0);
      return { layers };
    }),
  pruneLayerIfEmpty: (id) => {
    const { layers, removeEntry } = get();
    const L = layers.find((x) => x.id === id);
    if (!L) return;
    const source = L.layer.getSource?.();
    const features = source?.getFeatures?.();
    if (!features || features.length > 0) return;
    removeEntry(id);
  },

  moveLayer: (fromIdx, toIdx) =>
    set((s) => {
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= s.layers.length || toIdx >= s.layers.length) {
        return {};
      }
      const arr = [...s.layers];
      const [cur] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, cur);
      setTimeout(get()._applyOrder, 0);
      return { layers: arr };
    }),

  setVisible: (id, v) =>
    set((s) => {
      const L = s.layers.find((x) => x.id === id);
      if (L) {
        L.visible = v;
        L.layer.setVisible(v);
      }
      return { layers: [...s.layers] };
    }),

  updateLayerName: (id, newName) =>
    set((s) => {
      const L = s.layers.find((x) => x.id === id);
      if (L) {
        L.name = newName;
        // Update features dalam layer juga jika ada
        const source = L.layer.getSource();
        if (source) {
          const features = source.getFeatures();
          if (features.length === 1) {
            // Jika hanya ada satu feature, update nama feature tersebut
            features[0].set("name", newName);
          }
          // Refresh style untuk memperbarui label jika labelMode = 'nama'
          L.layer.setStyle(styleFromCfg(L.styleCfg));
          L.layer.changed();
        }
      }
      return { layers: [...s.layers] };
    }),

  updateStyleCfg: (id, patch) =>
    set((s) => {
      const L = s.layers.find((x) => x.id === id);
      if (!L) return {};
      L.styleCfg = { ...L.styleCfg, ...patch };
      L.layer.setStyle(styleFromCfg(L.styleCfg)); // apply dengan cfg TERBARU
      (L.layer as unknown as { changed?: () => void }).changed?.();
      return { layers: [...s.layers] };
    }),

  _applyOrder: () => {
    const { layers } = get();
    // index 0 paling depan → beri zIndex tertinggi
    const base = 100;
    const N = layers.length;
    layers.forEach((L, idx) => {
      const z = base + (N - idx); // idx 0 => base+N
      L.layer.setZIndex(z);
    });
  },
}));
