// src/hooks/useMapStore.ts
import { create } from "zustand";
import type Map from "ol/Map";
import type VectorSource from "ol/source/Vector";
import type VectorLayer from "ol/layer/Vector";
import type { FeatureLike } from "ol/Feature";
import type Feature from "ol/Feature";
import type { Geometry } from "ol/geom";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
import { platformModifierKeyOnly } from "ol/events/condition";
import { Fill, Stroke, Style, Text } from "ol/style";

export type BaseLayerKind =
  | "osm"
  | "osm_carto_light"
  | "esri_street"
  | "esri_sat"
  | "xyz_terrain";

export type LabelMode = "kode" | "nama";
export type LayerKind = "kabupaten" | "kecamatan" | "kelurahan" | "custom";

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
  labelFont: string; // family name saja; size dipisah
  labelSize?: number;
  labelMode: LabelMode;
};

export interface LayerEntry {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  z: number;
  // Longgarkan generic supaya kompatibel lintas OL typings
  layer: VectorLayer<VectorSource>;
  styleCfg: LayerStyleCfg;
}

type DrawState = {
  draw?: Draw | null;
  modify?: Modify | null;
  select?: Select | null;
};

type S = {
  // map
  map?: Map | null;
  setMap: (m: Map) => void;

  // basemap
  baseLayer: BaseLayerKind;
  setBaseLayer: (k: BaseLayerKind) => void;

  // hover/selected + footer (kompatibel TaxMap)
  hoveredId?: string;
  selectedId?: string;
  setHoveredId: (id?: string) => void;
  setSelectedId: (id?: string) => void;
  setZoomAndScale: (zoom: number, scaleText: string) => void;
  zoom: number;
  scaleText: string;
  setFocus: (f: unknown) => void;
  suppressFocusRestore: boolean;
  setSuppressFocusRestore: (value: boolean) => void;
  focus: unknown | null;

  // layer manager
  layers: LayerEntry[];
  selectedLayerId: string | null;
  selectLayer: (id: string | null) => void;
  setLayerVisibility: (id: string, visible: boolean) => void;
  addLayer: (e: LayerEntry) => void;
  removeLayer: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  updateLayerStyle: (id: string, patch: Partial<LayerStyleCfg>) => void;

  // draw / edit
  drawState: DrawState;
  startDraw: (
    geom: "Point" | "LineString" | "Polygon",
    layerId?: string
  ) => void;
  finishDraw: () => void;
  cancelDraw: () => void;
  enableModify: (layerId?: string) => void;
  disableModify: () => void;
  deleteSelectedFeatures: (layerId?: string) => void;

  // defaults (dipakai TaxMap saat add layer)
  borderColor: string;
  selectedFillColor: string;
  opacityNormal: number;
  opacitySelected: number;
};

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cfgToStyle(cfg: LayerStyleCfg): Style {
  const dash =
    cfg.borderStyle === "Dashed"
      ? [6, 4]
      : cfg.borderStyle === "Dotted"
      ? [2, 6]
      : undefined;

  return new Style({
    fill: new Fill({ color: hexToRgba(cfg.fillColor, cfg.fillOpacity) }),
    stroke: new Stroke({
      color: hexToRgba(cfg.borderColor, cfg.borderOpacity),
      width: cfg.borderWidth ?? 1,
      lineDash: dash,
    }),
    text: new Text({
      font: `${cfg.labelSize ?? 12}px ${cfg.labelFont}`,
      fill: new Fill({ color: cfg.labelColor }),
      stroke:
        cfg.labelStroke && (cfg.labelStrokeWidth ?? 0) > 0
          ? new Stroke({
              color: cfg.labelStroke,
              width: cfg.labelStrokeWidth,
            })
          : undefined,
      overflow: true,
    }),
  });
}

export const useMapStore = create<S>((set, get) => ({
  map: null,
  setMap: (m) => set({ map: m }),

  baseLayer: "osm",
  setBaseLayer: (k) => set({ baseLayer: k }),

  hoveredId: undefined,
  selectedId: undefined,
  setHoveredId: (id) => set({ hoveredId: id }),
  setSelectedId: (id) => set({ selectedId: id }),

  zoom: 10,
  scaleText: "1 km",
  setZoomAndScale: (zoom, scaleText) => set({ zoom, scaleText }),

  focus: null,
  setFocus: (f) =>
    set((state) => ({
      focus: f,
      suppressFocusRestore: f ? false : state.suppressFocusRestore,
    })),
  suppressFocusRestore: false,
  setSuppressFocusRestore: (value) => set({ suppressFocusRestore: value }),

  // layer manager
  layers: [],
  selectedLayerId: null,
  selectLayer: (id) => set({ selectedLayerId: id }),

  setLayerVisibility: (id, visible) =>
    set((s) => {
      const L = s.layers.find((x) => x.id === id);
      if (L) {
        L.visible = visible;
        L.layer.setVisible(visible);
      }
      return { layers: [...s.layers] };
    }),

  addLayer: (e) =>
    set((s) => {
      // initial style
      e.layer.setStyle((feat: FeatureLike) => {
        const st = cfgToStyle(e.styleCfg).clone();
        const labelMode = e.styleCfg.labelMode;
        const text =
          labelMode === "kode"
            ? (feat as { get: (key: string) => unknown }).get?.("id")
            : (feat as { get: (key: string) => unknown }).get?.("name");
        (st.getText() as Text | undefined)?.setText(
          typeof text === "string" ? text.toUpperCase() : undefined
        );
        return st;
      });
      e.layer.setVisible(e.visible);
      e.z = s.layers.length ? Math.max(...s.layers.map((x) => x.z)) + 1 : 1;

      // kalau map sudah ada, layer ini kemungkinan sudah ditambahkan di tempat lain—no-op
      return { layers: [...s.layers, e] };
    }),

  removeLayer: (id) =>
    set((s) => {
      const L = s.layers.find((x) => x.id === id);
      if (L && s.map) s.map.removeLayer(L.layer);
      const left = s.layers.filter((x) => x.id !== id);
      const selectedLayerId =
        s.selectedLayerId === id ? (left[0]?.id ?? null) : s.selectedLayerId;
      return { layers: left, selectedLayerId };
    }),

  moveLayerUp: (id) =>
    set((s) => {
      const idx = s.layers.findIndex((x) => x.id === id);
      if (idx <= 0) return {};
      const arr = [...s.layers];
      const [cur] = arr.splice(idx, 1);
      arr.splice(idx - 1, 0, cur);
      return { layers: arr };
    }),

  moveLayerDown: (id) =>
    set((s) => {
      const idx = s.layers.findIndex((x) => x.id === id);
      if (idx < 0 || idx >= s.layers.length - 1) return {};
      const arr = [...s.layers];
      const [cur] = arr.splice(idx, 1);
      arr.splice(idx + 1, 0, cur);
      return { layers: arr };
    }),

  updateLayerStyle: (id, patch) =>
    set((s) => {
      const L = s.layers.find((x) => x.id === id);
      if (!L) return {};
      L.styleCfg = { ...L.styleCfg, ...patch };

      const cfg = L.styleCfg;
      L.layer.setStyle((feat: FeatureLike) => {
        const st = cfgToStyle(cfg).clone();
        const textKey = cfg.labelMode === "kode" ? "id" : "name";
        const label = (feat as { get: (key: string) => unknown }).get?.(textKey);
        (st.getText() as Text | undefined)?.setText(
          typeof label === "string" ? label.toUpperCase() : undefined
        );
        return st;
      });
      L.layer.changed();
      return { layers: [...s.layers] };
    }),

  // draw / edit
  drawState: {},
  startDraw: (geom, layerId) => {
    const { map, layers, drawState } = get();
    if (!map) return;
    const targetId = layerId ?? get().selectedLayerId ?? layers[0]?.id;
    if (!targetId) return;
    const L = layers.find((x) => x.id === targetId);
    if (!L) return;

    // cleanup previous
    if (drawState.draw) map.removeInteraction(drawState.draw);

    const draw = new Draw({
      source: L.layer.getSource() as VectorSource,
      type: geom,
    });
    map.addInteraction(draw);
    set({ drawState: { ...drawState, draw } });
  },
  finishDraw: () => {
    const { map, drawState } = get();
    if (map && drawState.draw) map.removeInteraction(drawState.draw);
    set({ drawState: { ...drawState, draw: undefined } });
  },
  cancelDraw: () => {
    const { map, drawState } = get();
    if (map && drawState.draw) map.removeInteraction(drawState.draw);
    set({ drawState: { ...drawState, draw: undefined } });
  },

  enableModify: (layerId) => {
    const { map, layers, drawState } = get();
    if (!map) return;
    const targetId = layerId ?? get().selectedLayerId ?? layers[0]?.id;
    if (!targetId) return;
    const L = layers.find((x) => x.id === targetId);
    if (!L) return;

    if (drawState.modify) map.removeInteraction(drawState.modify);
    const modify = new Modify({
      source: L.layer.getSource() as VectorSource,
    });
    map.addInteraction(modify);

    // optional select (Ctrl/Cmd) untuk deleteSelectedFeatures
    if (!drawState.select) {
      const select = new Select({
        condition: platformModifierKeyOnly,
        layers: [L.layer] as VectorLayer<VectorSource>[],
      });
      map.addInteraction(select);
      set({ drawState: { ...drawState, modify, select } });
    } else {
      set({ drawState: { ...drawState, modify } });
    }
  },
  disableModify: () => {
    const { map, drawState } = get();
    if (!map) return;
    if (drawState.modify) map.removeInteraction(drawState.modify);
    set({ drawState: { ...drawState, modify: undefined } });
  },

  deleteSelectedFeatures: (layerId) => {
    const { layers, selectedId } = get();
    const targetId = layerId ?? get().selectedLayerId ?? layers[0]?.id;
    if (!targetId) return;
    const L = layers.find((x) => x.id === targetId);
    if (!L) return;

    const src = L.layer.getSource();
    if (!src) return;

    let removed = 0;
    if (selectedId) {
      src.getFeatures().forEach((f: Feature<Geometry>) => {
        if (String(f.get("id")) === String(selectedId)) {
          src.removeFeature(f);
          removed++;
        }
      });
    } else {
      // fallback: hapus fitur yang terseleksi via Select
      const sel = get().drawState.select || null;
      if (sel) {
        sel.getFeatures().forEach((f: Feature<Geometry>) => {
          src.removeFeature(f);
          removed++;
        });
        sel.getFeatures().clear();
      }
    }
    if (removed > 0) L.layer.changed();
  },

  // defaults
  borderColor: "#0ea5e9",
  selectedFillColor: "#22d3ee",
  opacityNormal: 0.18,
  opacitySelected: 0.4,
}));
