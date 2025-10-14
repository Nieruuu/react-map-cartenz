// src/components/LeftDock.tsx
import { useRef, useState } from "react";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Translate from "ol/interaction/Translate";
import Snap from "ol/interaction/Snap";
import Collection from "ol/Collection";
import GeoJSON from "ol/format/GeoJSON";
import shp from "shpjs";
import JSZip from "jszip";
import { write as writeShapefile } from "@crmackey/shp-write";
import { Fill, Stroke, Style, Circle as CircleStyle } from "ol/style";
import type { Geometry } from "ol/geom";
import Point from "ol/geom/Point";
import MultiPoint from "ol/geom/MultiPoint";
import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import OLFeature from "ol/Feature";
import { unByKey } from "ol/Observable";
import { singleClick } from "ol/events/condition";

import { useMapStore } from "../hooks/useMapStore";
import { useLayersStore, styleFromCfg } from "../hooks/useLayersStore";
import LayerLoadModal from "./LayerLoadModal";
import ExportModal from "./ExportModal";
import type {
  Feature as GeoJSONFeature,
  FeatureCollection as GeoJSONFeatureCollection,
  Geometry as GeoJSONGeometry,
} from "geojson";

type Kind = "kabupaten" | "kecamatan" | "kelurahan" | "custom";

type StyleColorCfg = {
  borderColor: string;
  fillColor: string;
};

function styleCfgForKind(kind: Kind): StyleColorCfg {
  switch (kind) {
    case "kabupaten":
      return { borderColor: "#ef4444", fillColor: "#f87171" };
    case "kecamatan":
      return { borderColor: "#f97316", fillColor: "#fb923c" };
    case "kelurahan":
      return { borderColor: "#10b981", fillColor: "#34d399" };
    default:
      return { borderColor: "#0ea5e9", fillColor: "#22d3ee" };
  }
}

type Pair = { codeKey: string; nameKey: string };

function aliasForKind(kind: Kind): Pair {
  switch (kind) {
    case "kabupaten":
      return { codeKey: "D_KD_DT2", nameKey: "D_NM_DT2" };
    case "kecamatan":
      return { codeKey: "D_KD_KEC", nameKey: "D_NM_KEC" };
    case "kelurahan":
      return { codeKey: "D_KD_KEL", nameKey: "D_NM_KEL" };
    default:
      return { codeKey: "id", nameKey: "name" };
  }
}

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
  if (!g[REGKEY] || !(g[REGKEY] instanceof Map)) {
    g[REGKEY] = new Map<string, RegistryItem>();
  }
  return g[REGKEY] as Map<string, RegistryItem>;
}

type PolygonRings = [number, number][][];
type NormalizedPolygonGeometry =
  | { type: "Polygon"; coordinates: PolygonRings }
  | { type: "MultiPolygon"; coordinates: PolygonRings[] };

/* ---------- Util: normalisasi geometri polygon ---------- */
const COORD_TOLERANCE = 1e-9;

type NormalizeOptions = {
  allowDegenerate?: boolean;
};

function isTypedNumericArray(value: unknown): value is ArrayLike<number> {
  return (
    value != null &&
    typeof value === "object" &&
    ArrayBuffer.isView(value as any) &&
    !(value instanceof DataView)
  );
}

function expandNumericPairs(source: ArrayLike<number>): [number, number][] {
  const coords: [number, number][] = [];
  const len = source.length ?? 0;
  for (let i = 0; i + 1 < len; i += 2) {
    const x = toFiniteNumber(source[i]);
    const y = toFiniteNumber(source[i + 1]);
    if (x == null || y == null) continue;
    coords.push([x, y]);
  }
  return coords;
}

function numbersEqual(a: number, b: number) {
  return Math.abs(a - b) <= COORD_TOLERANCE;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function readCoordinate(candidate: any): [number, number] | null {
  if (isTypedNumericArray(candidate) && candidate.length >= 2) {
    const x = toFiniteNumber(candidate[0]);
    const y = toFiniteNumber(candidate[1]);
    if (x == null || y == null) return null;
    return [x, y];
  }
  if (Array.isArray(candidate) && candidate.length >= 2) {
    const x = toFiniteNumber(candidate[0]);
    const y = toFiniteNumber(candidate[1]);
    if (x == null || y == null) return null;
    return [x, y];
  }
  if (candidate && typeof candidate === "object") {
    const obj = candidate as Record<string, unknown>;
    const x =
      toFiniteNumber(obj.x) ??
      toFiniteNumber(obj.X) ??
      toFiniteNumber((obj as any).lon) ??
      toFiniteNumber((obj as any).longitude);
    const y =
      toFiniteNumber(obj.y) ??
      toFiniteNumber(obj.Y) ??
      toFiniteNumber((obj as any).lat) ??
      toFiniteNumber((obj as any).latitude);
    if (x != null && y != null) return [x, y];
  }
  return null;
}

function closeRing(points: [number, number][]): [number, number][] {
  if (!points.length) return [];
  const first = points[0];
  const last = points[points.length - 1];
  if (!numbersEqual(first[0], last[0]) || !numbersEqual(first[1], last[1])) {
    return [...points, [first[0], first[1]]];
  }
  const cloned = points.slice();
  cloned[cloned.length - 1] = [last[0], last[1]];
  return cloned;
}

function sanitizeLinearRing(
  input: any,
  allowDegenerate: boolean
): [number, number][] | null {
  const source = Array.isArray(input)
    ? input
    : isTypedNumericArray(input)
    ? expandNumericPairs(input)
    : [];
  if (!Array.isArray(source) || !source.length) return null;

  const cleaned: [number, number][] = [];
  let prev: [number, number] | null = null;

  for (const candidate of source) {
    const coord = readCoordinate(candidate);
    if (!coord) continue;
    if (
      prev &&
      numbersEqual(coord[0], prev[0]) &&
      numbersEqual(coord[1], prev[1])
    ) {
      continue;
    }
    cleaned.push([coord[0], coord[1]]);
    prev = coord;
  }

  if (cleaned.length < 3) return null;

  const unique = new Set(cleaned.map((pt) => `${pt[0]}|${pt[1]}`));
  if (unique.size < 3 && !allowDegenerate) return null;

  const closed = closeRing(cleaned);
  if (closed.length < 4) return null;
  return closed;
}

function normalizePolygonRings(
  input: any,
  options: NormalizeOptions = {}
): PolygonRings {
  const sources = Array.isArray(input)
    ? input
    : isTypedNumericArray(input)
    ? [input]
    : [];
  if (!sources.length) return [];
  const rings: PolygonRings = [];
  for (const candidate of sources) {
    const ring = sanitizeLinearRing(
      candidate,
      Boolean(options.allowDegenerate)
    );
    if (ring) {
      rings.push(ring.map(([x, y]) => [x, y] as [number, number]));
    }
  }
  return rings;
}

function clonePolygonCoordinates(rings: PolygonRings): PolygonRings {
  return rings.map((ring) => ring.map(([x, y]) => [x, y] as [number, number]));
}

function cloneMultiPolygonCoordinates(
  polygons: PolygonRings[]
): PolygonRings[] {
  return polygons.map((poly) => clonePolygonCoordinates(poly));
}

function normalizeGeometryType(type: unknown): string {
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

function normalizePolygonGeometry(
  geomObj: any
): NormalizedPolygonGeometry | null {
  if (!geomObj) return null;

  const type = normalizeGeometryType(geomObj.type);
  if (!type) return null;

  if (type.startsWith("geometrycollection")) {
    const geometries = Array.isArray(geomObj.geometries)
      ? geomObj.geometries
      : [];
    const collected: PolygonRings[] = [];
    for (const part of geometries) {
      const normalized = normalizePolygonGeometry(part);
      if (!normalized) continue;
      if (normalized.type === "Polygon") {
        collected.push(clonePolygonCoordinates(normalized.coordinates));
      } else {
        normalized.coordinates.forEach((poly) =>
          collected.push(clonePolygonCoordinates(poly))
        );
      }
    }
    if (!collected.length) return null;
    if (collected.length === 1) {
      return { type: "Polygon", coordinates: collected[0] };
    }
    return { type: "MultiPolygon", coordinates: collected };
  }

  if (type.startsWith("multipolygon")) {
    const sources = Array.isArray(geomObj.coordinates)
      ? geomObj.coordinates
      : isTypedNumericArray(geomObj.coordinates)
      ? [geomObj.coordinates]
      : [];
    const polygons: PolygonRings[] = [];
    for (const poly of sources) {
      const rings = normalizePolygonRings(poly);
      if (rings.length) polygons.push(rings);
    }
    if (!polygons.length) return null;
    return { type: "MultiPolygon", coordinates: polygons };
  }

  if (type.startsWith("polygon")) {
    const coordsSource =
      Array.isArray(geomObj.coordinates) && geomObj.coordinates.length
        ? geomObj.coordinates
        : Array.isArray((geomObj as any).rings)
        ? (geomObj as any).rings
        : isTypedNumericArray(geomObj.coordinates)
        ? [geomObj.coordinates]
        : [];
    const rings = normalizePolygonRings(coordsSource);
    if (!rings.length) return null;
    return { type: "Polygon", coordinates: rings };
  }

  return null;
}

function sanitizeFeatureCollection(fc: any) {
  if (!fc || !Array.isArray(fc.features)) return null;
  const sanitized = fc.features
    .map((feat: any) => {
      const geom = normalizePolygonGeometry(feat?.geometry);
      if (!geom) return null;
      const props =
        feat && typeof feat === "object" ? { ...(feat.properties || {}) } : {};
      const base = {
        type: "Feature",
        properties: props,
      } as {
        type: "Feature";
        properties: Record<string, any>;
        geometry: any;
        id?: string | number;
      };
      if (geom.type === "Polygon") {
        base.geometry = {
          type: "Polygon",
          coordinates: clonePolygonCoordinates(geom.coordinates),
        };
      } else {
        base.geometry = {
          type: "MultiPolygon",
          coordinates: cloneMultiPolygonCoordinates(geom.coordinates),
        };
      }
      if (feat && typeof feat === "object" && "id" in feat && feat.id != null) {
        base.id = feat.id;
      }
      return base;
    })
    .filter(Boolean);

  if (!sanitized.length) return null;
  return {
    type: "FeatureCollection",
    features: sanitized,
  };
}

function fallbackPolygonFeatureCollection(
  fc: any
): GeoJSONFeatureCollection | null {
  if (!fc || !Array.isArray(fc.features)) return null;
  const features = fc.features
    .map((feat: any) => {
      if (!feat || typeof feat !== "object") return null;
      const geom = feat.geometry as GeoJSONGeometry | undefined;
      const type = normalizeGeometryType(geom?.type);
      if (
        !type.startsWith("polygon") &&
        !type.startsWith("multipolygon") &&
        !type.startsWith("geometrycollection")
      ) {
        return null;
      }
      try {
        const clonedGeom =
          geom && typeof geom === "object"
            ? (JSON.parse(JSON.stringify(geom)) as GeoJSONGeometry)
            : null;
        if (!clonedGeom) return null;
        const props =
          feat && typeof feat === "object"
            ? { ...(feat.properties || {}) }
            : {};
        const base: GeoJSONFeature = {
          type: "Feature",
          properties: props,
          geometry: clonedGeom,
        };
        if ("id" in feat && feat.id != null) {
          base.id = feat.id as string | number;
        }
        return base;
      } catch (error) {
        console.warn("fallback clone failed for feature:", error);
        return null;
      }
    })
    .filter((f: GeoJSONFeature | null): f is GeoJSONFeature => Boolean(f));
  if (!features.length) return null;
  return { type: "FeatureCollection", features };
}

async function flattenZipToRoot(
  buffer: ArrayBuffer
): Promise<Uint8Array | null> {
  try {
    const sourceZip = await JSZip.loadAsync(buffer);
    const flattened = new JSZip();
    let changed = false;
    const entries = Object.values(sourceZip.files ?? {});
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry || entry.dir) return;
        const normalized = entry.name.replace(/\\/g, "/");
        const parts = normalized.split("/").filter(Boolean);
        if (!parts.length) return;
        const fileName = parts.pop()!;
        const prefix = parts.length ? `${parts.join("_")}_` : "";
        const targetName = `${prefix}${fileName}`;
        if (parts.length) changed = true;
        const data = await entry.async("uint8array");
        flattened.file(targetName, data);
      })
    );
    if (!changed) return null;
    const output = await flattened.generateAsync({ type: "uint8array" });
    return output;
  } catch (error) {
    console.warn("flattenZipToRoot failed:", error);
    return null;
  }
}

async function parseShapefileZip(buffer: ArrayBuffer): Promise<any> {
  const shapefile: any = shp;
  const attempts: (ArrayBuffer | Uint8Array)[] = [buffer];
  const flattened = await flattenZipToRoot(buffer);
  if (flattened) attempts.push(flattened);
  let lastError: unknown = null;
  for (const attempt of attempts) {
    const candidate =
      attempt instanceof Uint8Array ? attempt : new Uint8Array(attempt);
    try {
      if (typeof shapefile === "function") {
        return await shapefile(candidate);
      }
    } catch (error) {
      lastError = error;
    }
    if (typeof shapefile?.parseZip === "function") {
      try {
        return await shapefile.parseZip(candidate);
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError) throw lastError;
  throw new Error("Gagal membaca file shapefile ZIP");
}

export default function LeftDock() {
  const { baseLayer, setBaseLayer, selectedId, setFocus, selectedLayerId } =
    useMapStore();
  const { map, addLayer, layers } = useLayersStore();

  // Interactions
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const translateRef = useRef<Translate | null>(null);
  const translateLayerRef = useRef<Translate | null>(null);
  const translateLayerLastCoordRef = useRef<[number, number] | null>(null);
  const targetLayerFeaturesRef = useRef<OLFeature<Geometry>[] | null>(null);
  const snapRefs = useRef<Snap[]>([]);

  // Sketch layer
  const sketchSrcRef = useRef<VectorSource | null>(null);
  const sketchLyrRef = useRef<VectorLayer<VectorSource> | null>(null);

  // SESSION DRAW
  const drawSessionRef = useRef<{
    src: VectorSource;
    layer: VectorLayer<VectorSource>;
    name: string;
    kind: Kind;
  } | null>(null);

  // Vertex/hover
  const vertexSrcRef = useRef<VectorSource | null>(null);
  const vertexLyrRef = useRef<VectorLayer<VectorSource> | null>(null);
  const hoverSrcRef = useRef<VectorSource | null>(null);
  const hoverLyrRef = useRef<VectorLayer<VectorSource> | null>(null);

  // Event keys
  const geomChangeKeyRef = useRef<any>(null);
  const pointerMoveKeyRef = useRef<any>(null);

  const vertexCacheRef = useRef<OLFeature<Point>[]>([]);
  const vertexRafRef = useRef<number | 0>(0);
  const isDraggingRef = useRef(false);

  const targetFeatureRef = useRef<OLFeature<Geometry> | null>(null);

  const deleteVertexModeRef = useRef(false);
  const [deleteVertexOn, setDeleteVertexOn] = useState(false);

  const setBusy = (busy: boolean) =>
    window.dispatchEvent(
      new CustomEvent("interaction-busy", { detail: { busy } })
    );

  // Hindari konflik nama setMode dari tempat lain
  const [uiMode, setUIMode] = useState<
    "idle" | "draw" | "modify" | "translate" | "translateLayer"
  >("idle");
  const [drawingLayerType, setDrawingLayerType] = useState<Kind>("custom");
  const [newLayerName, setNewLayerName] = useState("");
  const [isMultiMode, setIsMultiMode] = useState(false);

  // HUD
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const flash = (text: string, type: "ok" | "err" = "ok", ms = 2200) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), ms);
  };

  type PanelKey = "draw" | "basemap" | "io";
  const [openKey, setOpenKey] = useState<PanelKey | null>(null);
  const isOpen = (k: PanelKey) => openKey === k;
  const onPanelHeaderClick = (k: PanelKey) =>
    setOpenKey(openKey === k ? null : k);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------- Import ---------- */
  function inferKindFromFeatureCollection(fc: any): Kind {
    if (!fc || !Array.isArray(fc.features)) return "custom";
    const patterns: Record<Exclude<Kind, "custom">, RegExp[]> = {
      kelurahan: [
        /(^|_)KD_?KEL($|_)/i,
        /(^|_)D_KD_?KEL($|_)/i,
        /(^|_)NM_?KEL($|_)/i,
        /(^|_)D_NM_?KEL($|_)/i,
        /DESA/i,
      ],
      kecamatan: [
        /(^|_)KD_?KEC($|_)/i,
        /(^|_)D_KD_?KEC($|_)/i,
        /(^|_)NM_?KEC($|_)/i,
        /(^|_)D_NM_?KEC($|_)/i,
        /KECAMATAN/i,
        /WADMKC/i,
      ],
      kabupaten: [
        /(^|_)KD_?KAB($|_)/i,
        /(^|_)D_KD_?DT2($|_)/i,
        /(^|_)NM_?KAB($|_)/i,
        /(^|_)D_NM_?DT2($|_)/i,
        /KABUPATEN/i,
        /WADMKD/i,
      ],
    };
    const found: Record<Exclude<Kind, "custom">, boolean> = {
      kelurahan: false,
      kecamatan: false,
      kabupaten: false,
    };

    for (const feature of fc.features) {
      if (found.kelurahan && found.kecamatan && found.kabupaten) break;
      const props =
        feature && typeof feature === "object" ? feature.properties || {} : {};
      if (!props || typeof props !== "object") continue;
      const keys = Object.keys(props);
      const strValues = Object.values(props).filter(
        (v): v is string => typeof v === "string"
      );
      const matches = (regex: RegExp) =>
        keys.some((k) => regex.test(k)) || strValues.some((v) => regex.test(v));

      if (!found.kelurahan && patterns.kelurahan.some(matches)) {
        found.kelurahan = true;
      }
      if (!found.kecamatan && patterns.kecamatan.some(matches)) {
        found.kecamatan = true;
      }
      if (!found.kabupaten && patterns.kabupaten.some(matches)) {
        found.kabupaten = true;
      }
    }

    if (found.kelurahan) return "kelurahan";
    if (found.kecamatan) return "kecamatan";
    if (found.kabupaten) return "kabupaten";
    return "custom";
  }

  function datasetNameFromFile(fileName: string, kind: Kind): string {
    const withoutExt = fileName.replace(/\.(zip|geojson|json|shp)$/i, "");
    const cleaned = withoutExt
      .replace(/[_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const titled = cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    const base = titled || withoutExt || "Dataset";
    const labelMap: Record<Kind, string> = {
      kabupaten: "Kabupaten",
      kecamatan: "Kecamatan",
      kelurahan: "Kelurahan",
      custom: "Custom",
    };
    const label = labelMap[kind] || "Custom";
    return `${base} (${label})`;
  }

  async function importFile(file: File) {
    if (!map) return;

    const extractFeatureCollection = (data: any): any => {
      if (!data) return null;
      if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
        return data;
      }
      if (Array.isArray(data)) {
        const features = data.filter(
          (item) => item && typeof item === "object" && item.type === "Feature"
        );
        if (features.length) {
          return { type: "FeatureCollection", features };
        }
      }
      if (typeof data === "object") {
        for (const value of Object.values(data)) {
          const fc = extractFeatureCollection(value);
          if (fc) return fc;
        }
      }
      return null;
    };

    try {
      let parsed: any = null;

      if (/\.zip$/i.test(file.name)) {
        const buffer = await file.arrayBuffer();
        parsed = await parseShapefileZip(buffer);
      } else if (/\.(geo)?json$/i.test(file.name)) {
        const text = await file.text();
        parsed = JSON.parse(text);
      } else {
        throw new Error("Format file tidak didukung. Pilih .zip atau .geojson");
      }

      const rawFC = extractFeatureCollection(parsed);
      if (!rawFC) {
        throw new Error("Tidak menemukan FeatureCollection di dalam file.");
      }

      let sanitized =
        sanitizeFeatureCollection(rawFC) ||
        fallbackPolygonFeatureCollection(rawFC) ||
        rawFC; // JANGAN buang datanya, biar TaxMap yang putuskan

      const datasetKind = inferKindFromFeatureCollection(sanitized);
      const datasetName = datasetNameFromFile(file.name, datasetKind);

      const reg = ensureRegistry();
      const key = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      reg.set(key, {
        key,
        name: datasetName,
        kind: datasetKind,
        fc: sanitized,
        ts: Date.now(),
        count: sanitized.features.length,
        meta: { fileName: file.name },
      });

      window.dispatchEvent(new CustomEvent("datasets-updated"));
      flash(
        `Dataset ${datasetName} siap di-load (${sanitized.features.length} fitur).`
      );
    } catch (error) {
      console.error("Import dataset gagal:", error);
      const message = error instanceof Error ? error.message : String(error);
      flash(`Gagal import: ${message}`, "err", 3400);
    }
  }

  const onClickImport = () => fileInputRef.current?.click();
  const onChangeFile: React.ChangeEventHandler<HTMLInputElement> = async (
    e
  ) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    await importFile(f);
  };

  /* ---------- Layer creation, tools, edit, move, dll. ---------- */
  function styleFor(kind: Kind) {
    const cfg = styleCfgForKind(kind);
    return new Style({
      fill: new Fill({ color: `${cfg.fillColor}33` }),
      stroke: new Stroke({ color: cfg.borderColor, width: 2 }),
    });
  }

  const createNewPolygonLayer = (name?: string) => {
    if (!map) return null;
    const layerName = name || `Polygon ${Date.now()}`;
    const src = new VectorSource();
    const cfg = styleCfgForKind(drawingLayerType);
    const baseCfg = {
      borderColor: cfg.borderColor,
      borderOpacity: 1,
      borderWidth: 2,
      borderStyle: "Solid",
      fillColor: cfg.fillColor,
      fillOpacity: 0.2,
      labelColor: "#111827",
      labelStroke: "#ffffff",
      labelStrokeWidth: 3,
      labelFont: "Arial",
      labelSize: 12,
      labelMode: "nama",
    } as const;

    const lyr = new VectorLayer({
      source: src,
      style: styleFromCfg(baseCfg),
      updateWhileInteracting: true,
      updateWhileAnimating: true,
    });
    (lyr as any).set("appKind", drawingLayerType);
    const layerId = `polygon-${Date.now()}`;
    map.addLayer(lyr);
    addLayer({
      id: layerId,
      name: layerName,
      kind: drawingLayerType,
      visible: true,
      layer: lyr,
      styleCfg: baseCfg,
    });
    return { layer: lyr, source: src, id: layerId, name: layerName };
  };

  const clearSketch = () => {
    if (!map) return;
    if (sketchLyrRef.current) {
      map.removeLayer(sketchLyrRef.current);
      sketchLyrRef.current = null;
    }
    sketchSrcRef.current = null;
  };
  const clearVertexLayer = () => {
    if (!map) return;
    if (geomChangeKeyRef.current) {
      unByKey(geomChangeKeyRef.current);
      geomChangeKeyRef.current = null;
    }
    if (vertexRafRef.current) cancelAnimationFrame(vertexRafRef.current);
    vertexRafRef.current = 0;
    if (vertexLyrRef.current) {
      map.removeLayer(vertexLyrRef.current);
      vertexLyrRef.current = null;
    }
    vertexSrcRef.current = null;
    vertexCacheRef.current = [];
  };
  const clearHoverLayer = () => {
    if (!map) return;
    if (pointerMoveKeyRef.current) {
      unByKey(pointerMoveKeyRef.current);
      pointerMoveKeyRef.current = null;
    }
    if (hoverLyrRef.current) {
      map.removeLayer(hoverLyrRef.current);
      hoverLyrRef.current = null;
    }
    hoverSrcRef.current = null;
  };

  const attachSnapsForDraw = () => {
    if (!map) return;
    snapRefs.current.forEach((s) => map.removeInteraction(s));
    snapRefs.current = [];
    map
      .getLayers()
      .getArray()
      .forEach((L) => {
        if (L instanceof VectorLayer) {
          const src = (L as VectorLayer<VectorSource>).getSource?.();
          if (!src) return;
          const snap = new Snap({ source: src, pixelTolerance: 12 });
          map.addInteraction(snap);
          snapRefs.current.push(snap);
        }
      });
    if (drawSessionRef.current) {
      const sSnap = new Snap({
        source: drawSessionRef.current.src,
        pixelTolerance: 12,
      });
      map.addInteraction(sSnap);
      snapRefs.current.push(sSnap);
    }
    if (vertexSrcRef.current) {
      const vSnap = new Snap({
        source: vertexSrcRef.current,
        pixelTolerance: 10,
      });
      map.addInteraction(vSnap);
      snapRefs.current.push(vSnap);
    }
  };

  const startDraw = (opts?: { type?: Kind; name?: string }) => {
    if (!map) return;
    stopAll();
    setBusy(true);
    setFocus?.(null);

    const currType = opts?.type ?? drawingLayerType;
    const plannedName =
      (opts?.name ?? newLayerName.trim()) ||
      `${currType.charAt(0).toUpperCase() + currType.slice(1)} Baru`;

    const sessionSrc = new VectorSource();
    const sessionLayer = new VectorLayer({
      source: sessionSrc,
      style: styleFor(currType),
      updateWhileInteracting: true,
      updateWhileAnimating: true,
    });
    sessionLayer.setZIndex(450);
    map.addLayer(sessionLayer);
    drawSessionRef.current = {
      src: sessionSrc,
      layer: sessionLayer,
      name: plannedName,
      kind: currType,
    };

    const sketchSrc = new VectorSource();
    const sketchLyr = new VectorLayer({
      source: sketchSrc,
      style: new Style({
        fill: new Fill({ color: "rgba(14,165,233,0.15)" }),
        stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
      }),
    });
    sketchLyr.setZIndex(460);
    map.addLayer(sketchLyr);
    sketchSrcRef.current = sketchSrc;
    sketchLyrRef.current = sketchLyr;

    const draw = new Draw({ source: sketchSrc, type: "Polygon" });
    draw.on("drawstart", () => sketchSrc.clear());
    draw.on("drawend", (event) => {
      const session = drawSessionRef.current!;
      if (!session) return;
      const clone = (
        event.feature as OLFeature<Geometry>
      ).clone() as OLFeature<Geometry>;
      clone.set(
        "id",
        `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      );
      clone.set("name", session.name);
      session.src.addFeature(clone);
      sketchSrc.clear();
      isMultiMode
        ? flash(
            "Polygon ditambahkan ke sesi. Mode MultiPolygon aktif. Tekan Stop untuk menggabungkan."
          )
        : flash("Polygon ditambahkan ke sesi. Tekan Stop untuk membuat layer.");
    });

    map.addInteraction(draw);
    drawRef.current = draw;
    attachSnapsForDraw();
    setUIMode("draw");
  };

  function collectVerticesCoords(geom: any): number[][] {
    const out: number[][] = [];
    const pushRing = (ring: number[][]) => ring.forEach((c) => out.push(c));
    const type = geom?.getType?.() || geom?.type;
    if (type === "Polygon")
      geom.getCoordinates().forEach((ring: number[][]) => pushRing(ring));
    else if (type === "MultiPolygon")
      geom
        .getCoordinates()
        .forEach((poly: number[][][]) =>
          poly.forEach((ring) => pushRing(ring))
        );
    return out;
  }

  function buildVertexLayerForTargets(targets: OLFeature<Geometry>[]) {
    if (!map) return;
    if (!vertexSrcRef.current) vertexSrcRef.current = new VectorSource();
    if (!vertexLyrRef.current) {
      vertexLyrRef.current = new VectorLayer({
        source: vertexSrcRef.current,
        style: new Style({
          image: new CircleStyle({
            radius: 5,
            fill: new Fill({ color: "#2563eb" }),
            stroke: new Stroke({ color: "#ffffff", width: 2 }),
          }),
        }),
        updateWhileInteracting: true,
        updateWhileAnimating: true,
      });
      vertexLyrRef.current.setZIndex(9999);
      map.addLayer(vertexLyrRef.current);
    }

    if (!targets.length) {
      vertexSrcRef.current!.clear();
      vertexCacheRef.current = [];
      return;
    }

    const coords: number[][] = [];
    targets.forEach((feat) => {
      const geom = feat.getGeometry();
      if (!geom) return;
      coords.push(...collectVerticesCoords(geom));
    });

    const src = vertexSrcRef.current!;
    const cache = vertexCacheRef.current;
    if (src.getFeatures().length !== cache.length) {
      src.clear();
      for (const ft of cache) src.addFeature(ft);
    }
    if (cache.length !== coords.length) {
      src.clear();
      cache.length = 0;
      for (let i = 0; i < coords.length; i++) {
        const ft = new OLFeature(new Point(coords[i] as [number, number]));
        cache.push(ft);
        src.addFeature(ft);
      }
      return;
    }
    for (let i = 0; i < coords.length; i++)
      (cache[i].getGeometry() as Point).setCoordinates(
        coords[i] as [number, number]
      );
  }

  function ensureHoverLayer() {
    if (!map) return;
    if (!hoverSrcRef.current) hoverSrcRef.current = new VectorSource();
    if (!hoverLyrRef.current) {
      hoverLyrRef.current = new VectorLayer({
        source: hoverSrcRef.current,
        style: new Style({
          image: new CircleStyle({
            radius: 5,
            fill: new Fill({ color: "#f59e0b" }),
            stroke: new Stroke({ color: "#ffffff", width: 2 }),
          }),
        }),
        updateWhileInteracting: true,
        updateWhileAnimating: true,
      });
      hoverLyrRef.current.setZIndex(10000);
      map.addLayer(hoverLyrRef.current);
    }
  }

  function attachPointerMoveHover() {
    if (!map) return;
    ensureHoverLayer();
    const handler = (evt: any) => {
      if (isDraggingRef.current) return;
      const tf = targetFeatureRef.current;
      const layerTargets = targetLayerFeaturesRef.current;
      const geometries: Geometry[] = [];
      if (layerTargets && layerTargets.length) {
        layerTargets.forEach((feat) => {
          const g = feat.getGeometry();
          if (g) geometries.push(g);
        });
      } else if (tf) {
        const g = tf.getGeometry();
        if (g) geometries.push(g);
      }
      if (!geometries.length) return;

      const pointerPx = evt.pixel as [number, number];
      const coord = evt.coordinate as [number, number];
      let closestCoord: [number, number] | null = null;
      let distPx = Infinity;
      geometries.forEach((geom) => {
        const candidate = geom.getClosestPoint(coord) as [number, number];
        if (!candidate) return;
        const candidatePx = map.getPixelFromCoordinate(candidate);
        const dx = candidatePx[0] - pointerPx[0];
        const dy = candidatePx[1] - pointerPx[1];
        const d = Math.hypot(dx, dy);
        if (d < distPx) {
          distPx = d;
          closestCoord = candidate;
        }
      });
      if (!closestCoord) return;

      const SEG_TOL = 8;
      if (distPx > SEG_TOL) {
        hoverSrcRef.current!.clear();
        return;
      }

      const verts = vertexSrcRef.current?.getFeatures() || [];
      let best: { coord: [number, number]; dist: number } | null = null;
      for (const vf of verts) {
        const c = (vf.getGeometry() as Point).getCoordinates() as [
          number,
          number
        ];
        const vpx = map.getPixelFromCoordinate(c);
        const d = Math.hypot(vpx[0] - pointerPx[0], vpx[1] - pointerPx[1]);
        if (best === null || d < best.dist) best = { coord: c, dist: d };
      }
      const src = hoverSrcRef.current!;
      src.clear();
      if (best && best.dist < 8)
        src.addFeature(new OLFeature(new Point(best.coord)));
      else src.addFeature(new OLFeature(new Point(closestCoord)));
    };
    pointerMoveKeyRef.current = map.on("pointermove", handler);
  }

  const startEdit = () => {
    if (!map || !layers.length) return;

    const prevTarget = targetFeatureRef.current;
    const prevSelectedId = selectedId;
    stopAll();
    setBusy(true);
    setFocus?.(null);

    let targetFeature: OLFeature<Geometry> | null = prevTarget || null;
    if (!targetFeature && prevSelectedId) {
      for (const le of layers) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const feat = src
          .getFeatures()
          .find(
            (f: any) => String(f.get("id") || "") === String(prevSelectedId)
          );
        if (feat) {
          targetFeature = feat as OLFeature<Geometry>;
          break;
        }
      }
    }
    if (!targetFeature) {
      setBusy(false);
      flash("Pilih layer/feature terlebih dahulu", "err");
      return;
    }
    targetFeatureRef.current = targetFeature;

    deleteVertexModeRef.current = false;
    setDeleteVertexOn(false);
    buildVertexLayerForTargets([targetFeature]);
    const featuresColl = new Collection<OLFeature<Geometry>>([targetFeature]);

    const modify = new Modify({
      features: featuresColl,
      pixelTolerance: 10,
      insertVertexCondition: () => true,
      deleteCondition: (evt) => deleteVertexModeRef.current && singleClick(evt),
      style: (feature) => {
        const styles: Style[] = [];
        const geom = feature.getGeometry();
        if (geom) {
          const coords = collectVerticesCoords(geom);
          styles.push(
            new Style({
              image: new CircleStyle({
                radius: 6,
                fill: new Fill({ color: "#10b981" }),
                stroke: new Stroke({ color: "#ffffff", width: 2 }),
              }),
              geometry: () => new MultiPoint(coords),
            })
          );
        }
        return styles;
      },
    });

    modify.on("modifystart", () => {
      const tf = targetFeatureRef.current;
      if (!tf) return;
      const g = tf.getGeometry();
      if (!g) return;

      if (hoverSrcRef.current) hoverSrcRef.current.clear();
      if (pointerMoveKeyRef.current) {
        unByKey(pointerMoveKeyRef.current);
        pointerMoveKeyRef.current = null;
      }
      if (geomChangeKeyRef.current) {
        unByKey(geomChangeKeyRef.current);
        geomChangeKeyRef.current = null;
      }
      geomChangeKeyRef.current = g.on("change", () => {
        if (vertexRafRef.current) cancelAnimationFrame(vertexRafRef.current);
        vertexRafRef.current = requestAnimationFrame(() => {
          const tf2 = targetFeatureRef.current;
          if (tf2) buildVertexLayerForTargets([tf2]);
        });
      });
    });

    modify.on("modifyend", () => {
      if (geomChangeKeyRef.current) {
        unByKey(geomChangeKeyRef.current);
        geomChangeKeyRef.current = null;
      }
      if (vertexRafRef.current) {
        cancelAnimationFrame(vertexRafRef.current);
        vertexRafRef.current = 0;
      }
      if (hoverSrcRef.current) hoverSrcRef.current.clear();
      attachPointerMoveHover();
      const tf = targetFeatureRef.current;
      if (tf) buildVertexLayerForTargets([tf]);
    });

    map.addInteraction(modify);
    modifyRef.current = modify;

    snapRefs.current.forEach((s) => map.removeInteraction(s));
    snapRefs.current = [];
    if (vertexSrcRef.current) {
      const vertexSnap = new Snap({
        source: vertexSrcRef.current,
        pixelTolerance: 12,
      });
      map.addInteraction(vertexSnap);
      snapRefs.current.push(vertexSnap);
    }

    const entryOfTarget = layers.find((le) => {
      const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
      return src?.getFeatures().includes(targetFeatureRef.current as any);
    });
    const srcOfTarget = entryOfTarget
      ? (entryOfTarget.layer as VectorLayer<VectorSource>).getSource()!
      : null;
    if (srcOfTarget) {
      const targetSnap = new Snap({ source: srcOfTarget, pixelTolerance: 10 });
      map.addInteraction(targetSnap);
      snapRefs.current.push(targetSnap);
    }

    attachPointerMoveHover();
    setUIMode("modify");
  };

  const startMove = () => {
    if (!map || !layers.length) return;

    const prevTarget = targetFeatureRef.current;
    const prevSelectedId = selectedId;
    stopAll();
    setBusy(true);
    setFocus?.(null);
    targetLayerFeaturesRef.current = null;

    let targetFeature: OLFeature<Geometry> | null = prevTarget || null;
    if (!targetFeature && prevSelectedId) {
      for (const le of layers) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const feat = src
          .getFeatures()
          .find(
            (f: any) => String(f.get("id") || "") === String(prevSelectedId)
          );
        if (feat) {
          targetFeature = feat as OLFeature<Geometry>;
          break;
        }
      }
    }
    if (!targetFeature) {
      setBusy(false);
      flash("Pilih layer/feature terlebih dahulu", "err");
      return;
    }
    targetFeatureRef.current = targetFeature;

    deleteVertexModeRef.current = false;
    setDeleteVertexOn(false);
    buildVertexLayerForTargets([targetFeature]);

    const trans = new Translate({ features: new Collection([targetFeature]) });
    trans.on("translatestart", () => {
      if (hoverSrcRef.current) hoverSrcRef.current.clear();
      if (pointerMoveKeyRef.current) {
        unByKey(pointerMoveKeyRef.current);
        pointerMoveKeyRef.current = null;
      }
    });
    trans.on("translating", () => {
      const tf = targetFeatureRef.current;
      if (tf) buildVertexLayerForTargets([tf]);
    });
    trans.on("translateend", () => {
      attachPointerMoveHover();
      const tf = targetFeatureRef.current;
      if (tf) buildVertexLayerForTargets([tf]);
    });

    map.addInteraction(trans);
    translateRef.current = trans;

    const entryOfTarget = layers.find((le) => {
      const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
      return src?.getFeatures().includes(targetFeatureRef.current as any);
    });
    const srcOfTarget = entryOfTarget
      ? (entryOfTarget.layer as VectorLayer<VectorSource>).getSource()!
      : null;
    if (srcOfTarget) {
      const targetSnap = new Snap({ source: srcOfTarget, pixelTolerance: 10 });
      map.addInteraction(targetSnap);
      snapRefs.current.push(targetSnap);
    }

    attachPointerMoveHover();
    setUIMode("translate");
  };

  const startMoveLayer = () => {
    if (!map || !layers.length) return;

    const prevTargetLayer = selectedLayerId;
    const prevTargetFeature = targetFeatureRef.current;
    const prevSelectedId = selectedId;
    stopAll();
    setBusy(true);
    setFocus?.(null);

    let targetEntry =
      (prevTargetLayer && layers.find((le) => le.id === prevTargetLayer)) ||
      null;
    let anchorFeature =
      (prevTargetFeature as OLFeature<Geometry> | null) || null;

    if (!targetEntry && prevTargetFeature) {
      targetEntry =
        layers.find((le) => {
          const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
          return src?.getFeatures().includes(prevTargetFeature as any);
        }) || null;
    }

    if (!targetEntry && prevSelectedId) {
      for (const le of layers) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const feat = src
          .getFeatures()
          .find(
            (f: any) => String(f.get("id") || "") === String(prevSelectedId)
          );
        if (feat) {
          targetEntry = le;
          anchorFeature = feat as OLFeature<Geometry>;
          break;
        }
      }
    }

    if (!targetEntry) {
      setBusy(false);
      flash("Pilih layer terlebih dahulu", "err");
      return;
    }

    const entry = targetEntry;
    const src = (entry.layer as VectorLayer<VectorSource>).getSource?.();
    if (!src) {
      setBusy(false);
      flash("Layer tidak memiliki sumber data", "err");
      return;
    }

    const feats = src.getFeatures();
    if (!feats.length) {
      setBusy(false);
      flash("Layer kosong, tidak ada fitur untuk digeser", "err");
      return;
    }
    const layerFeatures = feats.filter(
      (f): f is OLFeature<Geometry> => !!f.getGeometry()
    );
    if (!anchorFeature) {
      anchorFeature = layerFeatures[0] || null;
    }
    if (!anchorFeature) {
      setBusy(false);
      flash("Layer tidak memiliki geometri yang valid", "err");
      return;
    }
    targetLayerFeaturesRef.current = layerFeatures;
    buildVertexLayerForTargets(layerFeatures);
    attachPointerMoveHover();

    const trans = new Translate({
      layers: [entry.layer] as any,
      hitTolerance: 6,
    });

    trans.on("translatestart", (evt) => {
      isDraggingRef.current = true;
      const coord = evt.coordinate as [number, number];
      translateLayerLastCoordRef.current = coord
        ? ([coord[0], coord[1]] as [number, number])
        : null;
      if (hoverSrcRef.current) hoverSrcRef.current.clear();
      if (pointerMoveKeyRef.current) {
        unByKey(pointerMoveKeyRef.current);
        pointerMoveKeyRef.current = null;
      }
    });

    trans.on("translating", (evt) => {
      const coord = evt.coordinate as [number, number];
      const last = translateLayerLastCoordRef.current;
      if (!coord) return;
      const dx = last ? coord[0] - last[0] : 0;
      const dy = last ? coord[1] - last[1] : 0;
      if (!dx && !dy) return;
      const moved = new Set(evt.features.getArray());
      src.getFeatures().forEach((feat) => {
        if (moved.has(feat)) return;
        const geom = feat.getGeometry();
        geom?.translate(dx, dy);
      });
      entry.layer.changed();
      translateLayerLastCoordRef.current = [coord[0], coord[1]];
      if (targetLayerFeaturesRef.current) {
        buildVertexLayerForTargets(targetLayerFeaturesRef.current);
      }
    });

    trans.on("translateend", () => {
      isDraggingRef.current = false;
      translateLayerLastCoordRef.current = null;
      if (targetLayerFeaturesRef.current) {
        buildVertexLayerForTargets(targetLayerFeaturesRef.current);
      }
      attachPointerMoveHover();
    });

    map.addInteraction(trans);
    translateLayerRef.current = trans;
    targetFeatureRef.current = anchorFeature;
    setUIMode("translateLayer");
  };

  const stopAll = () => {
    if (!map) return;
    const prev = uiMode;

    if (prev === "draw" && drawSessionRef.current) {
      const session = drawSessionRef.current;
      const feats = session.src.getFeatures();
      if (feats.length > 0) {
        const created = createNewPolygonLayer(session.name);
        if (created) {
          (created.layer as any).set("appKind", session.kind);
          const { codeKey, nameKey } = aliasForKind(session.kind);

          if (isMultiMode) {
            const polys: number[][][][] = [];
            for (const f of feats) {
              const g = f.getGeometry();
              if (!g) continue;
              const t = g.getType();
              if (t === "Polygon") polys.push((g as Polygon).getCoordinates());
              else if (t === "MultiPolygon")
                (g as MultiPolygon)
                  .getCoordinates()
                  .forEach((p) => polys.push(p));
            }
            if (polys.length > 0) {
              const multi = new MultiPolygon(polys);
              const feature = new OLFeature<Geometry>(multi);
              const code = `feat-${Date.now()}`;
              feature.set("id", code);
              feature.set("name", session.name);
              if (session.kind !== "custom") {
                feature.set(codeKey, code);
                feature.set(nameKey, session.name);
              } else
                [
                  "D_KD_KEC",
                  "D_NM_KEC",
                  "D_KD_DT2",
                  "D_NM_DT2",
                  "D_KD_KEL",
                  "D_NM_KEL",
                ].forEach((k) => (feature as any).unset?.(k, true));
              created.source.addFeature(feature);
              flash("MultiPolygon berhasil dibuat dari sesi gambar.");
            }
          } else {
            for (const f of feats) {
              const clone = f.clone() as OLFeature<Geometry>;
              const code = `feat-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 6)}`;
              clone.set("id", code);
              clone.set("name", session.name);
              if (session.kind !== "custom") {
                clone.set(codeKey, code);
                clone.set(nameKey, session.name);
              } else
                [
                  "D_KD_KEC",
                  "D_NM_KEC",
                  "D_KD_DT2",
                  "D_NM_DT2",
                  "D_KD_KEL",
                  "D_NM_KEL",
                ].forEach((k) => (clone as any).unset?.(k, true));
              created.source.addFeature(clone);
            }
            flash(`${feats.length} polygon ditambahkan ke layer baru.`);
          }
        }
      }
      map.removeLayer(session.layer);
    }

    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
    }
    if (modifyRef.current) {
      map.removeInteraction(modifyRef.current);
      modifyRef.current = null;
    }
    if (translateRef.current) {
      map.removeInteraction(translateRef.current);
      translateRef.current = null;
    }
    if (translateLayerRef.current) {
      map.removeInteraction(translateLayerRef.current);
      translateLayerRef.current = null;
    }
    translateLayerLastCoordRef.current = null;
    targetLayerFeaturesRef.current = null;
    snapRefs.current.forEach((s) => map.removeInteraction(s));
    snapRefs.current = [];

    isDraggingRef.current = false;
    clearSketch();
    clearVertexLayer();
    clearHoverLayer();
    drawSessionRef.current = null;
    targetFeatureRef.current = null;
    deleteVertexModeRef.current = false;
    setDeleteVertexOn(false);
    setUIMode("idle");
    setBusy(false);
    setFocus?.(null);

    if (prev === "modify") flash("Anda keluar dari mode edit");
    else if (prev === "translate") flash("Anda keluar dari mode geser");
    else if (prev === "translateLayer")
      flash("Anda keluar dari mode geser layer");
  };

  const toggleDeleteVertex = () => {
    if (uiMode !== "modify") {
      flash("Aktifkan mode Edit terlebih dahulu", "err");
      return;
    }
    deleteVertexModeRef.current = !deleteVertexModeRef.current;
    setDeleteVertexOn(deleteVertexModeRef.current);
    flash(
      deleteVertexModeRef.current
        ? "Mode Hapus Vertex aktif. Klik vertex untuk menghapus."
        : "Mode Hapus Vertex nonaktif."
    );
  };

  const deleteSelectedFeature = () => {
    if (!map || !layers.length) return;
    let feat: OLFeature<Geometry> | null = targetFeatureRef.current || null;
    const sid = selectedId;

    if (!feat && sid) {
      for (const le of layers) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const found = src
          .getFeatures()
          .find((f: any) => String(f.get("id") || "") === String(sid));
        if (found) {
          feat = found as OLFeature<Geometry>;
          break;
        }
      }
    }
    if (!feat) {
      flash("Tidak ada feature yang dipilih", "err");
      return;
    }

    for (const le of layers) {
      const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
      if (!src) continue;
      if (src.getFeatures().includes(feat)) {
        src.removeFeature(feat);
        break;
      }
    }
    stopAll();
    flash("Feature terpilih telah dihapus");
  };

  const quickPolygon = (type: Exclude<Kind, "custom">, name?: string) => {
    stopAll();
    const layerName =
      name || `${type.charAt(0).toUpperCase() + type.slice(1)} Baru`;
    setDrawingLayerType(type);
    setNewLayerName(layerName);
    startDraw({ type, name: layerName });
  };

  /* ---------- Load & Export UI ---------- */
  const [openLoad, setOpenLoad] = useState(false);
  const [openExport, setOpenExport] = useState(false);
  const openExportModal = () => setOpenExport(true);

  /* ---------- Export helpers ---------- */
  function sanitizeForDbf(
    props: Record<string, any>,
    dropIdName: boolean = true
  ) {
    const out: Record<string, string | number | boolean | null> = {};
    for (const k of Object.keys(props)) {
      if (/^(geometry|geom|the_geom|_geom)$/i.test(k)) continue;
      if (k === "__idx") continue;
      if (dropIdName && /^(id|name)$/i.test(k)) continue;

      const v = props[k];
      if (v === undefined) continue;
      if (v === null) out[k] = null;
      else if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      )
        out[k] = v;
      else if (v instanceof Date) out[k] = v.toISOString();
      else out[k] = JSON.stringify(v);
    }
    return out;
  }

  function buildFeatureCollectionFromLayer(layer: VectorLayer<VectorSource>) {
    const fmt = new GeoJSON();
    const src = layer.getSource();
    if (!src) throw new Error("Sumber layer tidak ditemukan.");
    const feats = src.getFeatures();
    if (!feats.length) throw new Error("Layer kosong.");

    console.log("Processing " + feats.length + " features for export");

    const layerKind: Kind =
      ((layer as any).get && (layer as any).get("appKind")) || "custom";
    const dropIdName = layerKind !== "custom";

    const features = feats
      .map((ft, idx) => {
        try {
          const g = ft.getGeometry();
          if (!g) {
            console.warn("Feature " + idx + " has no geometry, skipping");
            return null;
          }

          const geomType = g.getType();
          if (!["Polygon", "MultiPolygon"].includes(geomType)) {
            console.warn(
              "Feature " +
                idx +
                " has unsupported geometry type: " +
                geomType +
                ", skipping"
            );
            return null;
          }

          const g4326 = g.clone().transform("EPSG:3857", "EPSG:4326");
          const geomObjRaw = fmt.writeGeometryObject(g4326 as any);
          const geomObj = normalizePolygonGeometry(geomObjRaw);

          if (!geomObj) {
            console.warn(
              "Feature " + idx + " failed geometry conversion, skipping"
            );
            return null;
          }

          if (!geomObj.coordinates || !Array.isArray(geomObj.coordinates)) {
            console.warn(
              "Feature " + idx + " has invalid coordinates, skipping"
            );
            return null;
          }

          const raw = (ft as any).getProperties?.() || {};
          const { geometry, geom, the_geom, _geom, ...rest } = raw;

          let props: Record<string, any>;
          if (dropIdName) {
            const {
              id: _id,
              ID: _ID,
              name: _name,
              NAME: _NAME,
              ...restNoIdName
            } = rest;
            props = sanitizeForDbf(restNoIdName, true);
          } else {
            const keep: Record<string, any> = { ...rest };
            if (keep.id == null) keep.id = "feat_" + Date.now() + "_" + idx;
            if (keep.name == null) keep.name = "Feature " + idx;
            [
              "D_KD_KEC",
              "D_NM_KEC",
              "D_KD_DT2",
              "D_NM_DT2",
              "D_KD_KEL",
              "D_NM_KEL",
            ].forEach((k) => delete keep[k]);
            props = sanitizeForDbf(keep, false);
          }

          if (!props || typeof props !== "object") {
            props = {};
          }

          return { type: "Feature", properties: props, geometry: geomObj };
        } catch (error) {
          console.error("Error processing feature " + idx + ":", error);
          return null;
        }
      })
      .filter(
        (f): f is { type: string; properties: any; geometry: any } => f !== null
      );

    if (features.length === 0)
      throw new Error("Tidak ada feature valid untuk diexport.");

    console.log("Successfully processed " + features.length + " features");
    const fc = { type: "FeatureCollection", features };

    try {
      const fcString = JSON.stringify(fc);
      if (!fcString || fcString.length < 50) {
        throw new Error("Feature collection appears to be empty or invalid");
      }
      console.log("Feature collection validation passed");
    } catch (error) {
      throw new Error("Feature collection validation failed: " + error);
    }

    return fc;
  }

  const WGS84_PRJ =
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]';

  function shapefileGeometryFromFeatureGeometry(
    geometry: any
  ): PolygonRings | PolygonRings[] | null {
    if (!geometry || !geometry.type) return null;
    if (geometry.type === "Polygon") {
      let rings = normalizePolygonRings(geometry.coordinates);
      if (!rings.length) {
        rings = normalizePolygonRings(geometry.coordinates, {
          allowDegenerate: true,
        });
      }
      return rings.length ? rings : null;
    }
    if (geometry.type === "MultiPolygon") {
      const polygons = (geometry.coordinates || [])
        .map((poly: any) => {
          let normalized = normalizePolygonRings(poly);
          if (!normalized.length) {
            normalized = normalizePolygonRings(poly, {
              allowDegenerate: true,
            });
          }
          return normalized;
        })
        .filter((poly: PolygonRings) => poly.length > 0);
      return polygons.length ? polygons : null;
    }
    return null;
  }

  function toUint8Array(data: any): Uint8Array {
    if (!data) return new Uint8Array();
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data instanceof DataView) {
      const { buffer, byteOffset, byteLength } = data;
      return new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength));
    }
    if (Array.isArray(data)) return Uint8Array.from(data);
    if (typeof data === "string") {
      const encoder = new TextEncoder();
      return encoder.encode(data);
    }
    return new Uint8Array();
  }

  async function createShapefileZip(
    fc: { type: string; features: any[] },
    baseName: string
  ): Promise<Blob> {
    const rows: Record<string, any>[] = [];
    const geometries: Array<PolygonRings | PolygonRings[]> = [];

    for (const feature of fc.features || []) {
      const geomParts = shapefileGeometryFromFeatureGeometry(feature.geometry);
      if (!geomParts) continue;
      geometries.push(geomParts);
      rows.push({ ...(feature.properties || {}) });
    }

    if (!geometries.length) {
      throw new Error("Tidak ada geometri polygon valid untuk export");
    }

    const files = await new Promise<any>((resolve, reject) => {
      try {
        writeShapefile(rows, "POLYGON", geometries, (err: any, result: any) => {
          if (err) reject(err);
          else resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });

    const zip = new JSZip();
    const shpU8 = toUint8Array(files.shp);
    const shxU8 = toUint8Array(files.shx);
    const dbfU8 = toUint8Array(files.dbf);
    const prjText =
      typeof files.prj === "string" && files.prj.trim().length > 0
        ? files.prj
        : WGS84_PRJ;

    zip.file(baseName + ".shp", shpU8, { binary: true });
    zip.file(baseName + ".shx", shxU8, { binary: true });
    zip.file(baseName + ".dbf", dbfU8, { binary: true });
    zip.file(baseName + ".prj", prjText);

    const zippedBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 3 },
    });

    return zippedBlob; // langsung Blob, selesai drama
  }

  async function exportLayerToZip(layerId: string) {
    console.log("=== EXPORT DEBUG START ===");
    console.log("Starting export process...");
    console.log("Layer ID:", layerId);

    const entry = useLayersStore
      .getState()
      .layers.find((l) => l.id === layerId);
    if (!entry) throw new Error("Layer tidak ditemukan.");
    const lyr = entry.layer as VectorLayer<VectorSource>;
    console.log("Layer found:", entry.name);
    console.log("Layer kind:", entry.kind);

    console.log("Building feature collection from layer...");
    const fc = buildFeatureCollectionFromLayer(lyr);
    console.log("Feature collection built:", fc);
    console.log("Feature count:", fc?.features?.length);

    const base =
      (lyr.get && (lyr.get("fileBase") as string)) ||
      (lyr.get && (lyr.get("appName") as string)) ||
      entry.name ||
      "export";
    const clean = String(base)
      .replace(/\.(zip|geojson|json|shp)$/i, "")
      .replace(/[^\w\-]+/g, "_");

    let blob: Blob | null = null;

    try {
      blob = await createShapefileZip(fc, clean);
    } catch (error) {
      console.error("@crmackey/shp-write export failed:", error);
    }

    if (!blob) {
      try {
        console.log("Falling back to GeoJSON export...");
        const geoJsonString = JSON.stringify(fc, null, 2);
        blob = new Blob([geoJsonString], { type: "application/json" });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = clean + ".geojson";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 64);

        flash(
          "Export shapefile gagal, GeoJSON berhasil diunduh sebagai fallback.",
          "ok"
        );
        return;
      } catch (geoJsonError) {
        console.error("GeoJSON fallback also failed:", geoJsonError);
        throw new Error(
          "Semua metode export gagal, termasuk fallback GeoJSON."
        );
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = clean + ".zip";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 64);
  }
  /* ---------- UI ---------- */
  return (
    <div className="leftstack">
      {uiMode !== "idle" && (
        <div
          className="toast ok"
          style={{
            position: "fixed",
            top: 64,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
          }}
        >
          {uiMode === "draw" &&
            (isMultiMode
              ? "Mode Gambar aktif (MultiPolygon). Double-click mengakhiri 1 polygon. Tekan Stop untuk menggabungkan jadi MultiPolygon."
              : "Mode Gambar aktif. Double-click mengakhiri 1 polygon. Tekan Stop untuk buat layer dari semua polygon sesi.")}
          {uiMode === "modify" &&
            (deleteVertexOn
              ? "Mode Edit + Hapus Vertex. Klik vertex untuk menghapus. Tekan Stop untuk keluar."
              : "Mode Edit aktif. Drag titik biru/klik garis untuk tambah vertex. Tekan Stop untuk keluar.")}
          {uiMode === "translate" &&
            "Mode Geser aktif. Drag fitur untuk memindahkan posisi. Tekan Stop untuk keluar."}
          {uiMode === "translateLayer" &&
            "Mode Geser Layer aktif. Drag salah satu fitur untuk memindahkan seluruh layer. Tekan Stop untuk keluar."}
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.type === "ok" ? "ok" : "err"}`}
          style={{
            position: "fixed",
            top: 100,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
          }}
        >
          {toast.text}
        </div>
      )}

      <div className={`ld-panel ${isOpen("draw") ? "open" : ""}`}>
        <div
          className="ld-header"
          role="button"
          onClick={() => onPanelHeaderClick("draw")}
        >
          <span>Gambar Batas Wilayah</span>
          <span
            className="icon"
            style={{
              transform: `rotate(${isOpen("draw") ? 180 : 0}deg)`,
              transition: "transform .15s",
            }}
          >
            expand_more
          </span>
        </div>
        <div
          className={`ld-body ${isOpen("draw") ? "open" : ""}`}
          aria-hidden={!isOpen("draw")}
        >
          <div className="ld-body-in">
            <div className="form-group">
              <label>Nama Layer Baru</label>
              <input
                type="text"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                placeholder="Nama wilayah/polygon..."
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Tipe Batas Wilayah</label>
              <select
                value={drawingLayerType}
                onChange={(e) => setDrawingLayerType(e.target.value as Kind)}
                className="form-select"
              >
                <option value="kabupaten">Kabupaten</option>
                <option value="kecamatan">Kecamatan</option>
                <option value="kelurahan">Kelurahan</option>
                <option value="custom">Custom/Lainnya</option>
              </select>
            </div>

            <div
              className="tools"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(40px, 1fr))",
                gap: 8,
                alignItems: "center",

                justifyItems: "center",
              }}
            >
              <button
                className="circle"
                title="Mulai gambar"
                onClick={() => startDraw()}
                disabled={uiMode === "draw"}
              >
                <span className="icon">pentagon</span>
              </button>
              <button
                className={`circle ${isMultiMode ? "" : "ghost"}`}
                title={
                  isMultiMode
                    ? "MultiPolygon aktif"
                    : "Aktifkan Mode MultiPolygon"
                }
                onClick={() => {
                  if (uiMode !== "draw" || !drawSessionRef.current) {
                    flash("Aktifkan mode Gambar dulu (ikon poligon).", "err");
                    return;
                  }
                  const next = !isMultiMode;
                  setIsMultiMode(next);
                  flash(
                    next
                      ? "Mode MultiPolygon aktif."
                      : "Mode MultiPolygon dimatikan."
                  );
                }}
              >
                <span className="icon">stack</span>
              </button>
              <button
                className="circle"
                title="Edit vertices"
                onClick={startEdit}
                disabled={uiMode === "modify"}
                style={{
                  background: "#10b981",
                  color: "#fff",
                  borderColor: "#10b981",
                }}
              >
                <span className="icon">edit</span>
              </button>
              <button
                className="circle"
                title="Geser feature"
                onClick={startMove}
                disabled={uiMode === "translate" || uiMode === "translateLayer"}
                style={{
                  background: "#eab308",
                  color: "#fff",
                  borderColor: "#eab308",
                }}
              >
                <span className="icon">open_with</span>
              </button>
              <button
                className="circle"
                title="Geser seluruh layer"
                onClick={startMoveLayer}
                disabled={uiMode === "translateLayer" || uiMode === "translate"}
                style={{
                  background: "#6366f1",
                  color: "#fff",
                  borderColor: "#6366f1",
                }}
              >
                <span className="icon">move_group</span>
              </button>

              <button
                className={`circle ${deleteVertexOn ? "danger" : "warning"}`}
                title="Hapus vertex (klik vertex)"
                onClick={toggleDeleteVertex}
                disabled={uiMode !== "modify"}
              >
                <span className="icon">content_cut</span>
              </button>
              <button
                className="circle danger"
                title="Hapus feature terpilih"
                onClick={deleteSelectedFeature}
              >
                <span className="icon">delete_forever</span>
              </button>
              <button
                className="circle dark"
                title="Stop semua mode"
                onClick={stopAll}
              >
                <span className="icon">close</span>
              </button>
            </div>

            <div className="quick-actions">
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Aksi Cepat:
              </div>
              <div className="quick-buttons">
                <button
                  className="btn-quick kabupaten"
                  onClick={() => quickPolygon("kabupaten")}
                >
                  Kabupaten
                </button>
                <button
                  className="btn-quick kecamatan"
                  onClick={() => quickPolygon("kecamatan")}
                >
                  Kecamatan
                </button>
                <button
                  className="btn-quick kelurahan"
                  onClick={() => quickPolygon("kelurahan")}
                >
                  Kelurahan
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 12, fontSize: 11 }}>
              {uiMode === "draw" &&
                (isMultiMode
                  ? "Mode gambar: double-click selesai 1 polygon. Stop untuk gabung jadi satu MultiPolygon."
                  : "Mode gambar: double-click selesai 1 polygon. Stop untuk buat layer dari semua polygon sesi.")}
              {uiMode === "modify" &&
                (deleteVertexOn
                  ? "Edit + Hapus vertex: klik vertex untuk menghapus. Snap aktif."
                  : "Edit: drag titik biru, klik garis untuk tambah vertex. Snap aktif.")}
              {uiMode === "translate" &&
                "Geser: drag fitur untuk pindahkan posisi."}
              {uiMode === "translateLayer" &&
                "Geser Layer: drag salah satu fitur untuk memindahkan seluruh layer."}
            </div>
          </div>
        </div>
      </div>

      <div className={`ld-panel ${isOpen("basemap") ? "open" : ""}`}>
        <div
          className="ld-header"
          role="button"
          onClick={() => onPanelHeaderClick("basemap")}
        >
          <span>Tipe Peta Dasar</span>
          <span
            className="icon"
            style={{
              transform: `rotate(${isOpen("basemap") ? 180 : 0}deg)`,
              transition: "transform .15s",
            }}
          >
            expand_more
          </span>
        </div>
        <div
          className={`ld-body ${isOpen("basemap") ? "open" : ""}`}
          aria-hidden={!isOpen("basemap")}
        >
          <div className="ld-body-in">
            <div className="radiolist">
              {[
                ["osm", "OpenStreetMap (default)"],
                ["osm_carto_light", "OpenStreetMap Carto Light"],
                ["esri_street", "Esri ArcGIS Street"],
                ["esri_sat", "Esri World Imagery (Satellite)"],
                ["xyz_terrain", "OpenTopoMap (Terrain)"],
              ].map(([val, label]) => (
                <label key={val} className="row">
                  <input
                    type="radio"
                    name="basemap"
                    value={val}
                    checked={baseLayer === (val as any)}
                    onChange={(e) => setBaseLayer(e.currentTarget.value as any)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`ld-panel ${isOpen("io") ? "open" : ""}`}>
        <div
          className="ld-header"
          role="button"
          onClick={() => onPanelHeaderClick("io")}
        >
          <span>Import / Export</span>
          <span
            className="icon"
            style={{
              transform: `rotate(${isOpen("io") ? 180 : 0}deg)`,
              transition: "transform .15s",
            }}
          >
            expand_more
          </span>
        </div>
        <div
          className={`ld-body ${isOpen("io") ? "open" : ""}`}
          aria-hidden={!isOpen("io")}
        >
          <div className="ld-body-in">
            <div
              className="import-export-tools"
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              <button className="btn-tool" onClick={onClickImport}>
                <span className="icon">upload</span> Import Shapefile/GeoJSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.geojson,application/zip,application/json"
                style={{ display: "none" }}
                onChange={onChangeFile}
              />
              <button
                className="btn-tool"
                onClick={() => setOpenLoad(true)}
                title="Tampilkan dataset import ke peta"
              >
                <span className="icon">layers</span> Load Peta (Imported)
              </button>
              <button
                className="btn-tool"
                onClick={openExportModal}
                title="Pilih layer yang akan diexport"
              >
                <span className="icon">download</span> Export ZIP (Shapefile)
              </button>
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
              Hasil import tidak langsung tampil di peta. Buka <b>Load Peta</b>{" "}
              untuk memilih dataset. Setelah edit, gunakan <b>Export ZIP</b>.
            </div>
          </div>
        </div>
      </div>

      <LayerLoadModal open={openLoad} onClose={() => setOpenLoad(false)} />
      <ExportModal
        open={openExport}
        onClose={() => setOpenExport(false)}
        onExport={async (layerId) => {
          try {
            console.log("Starting export process for layer:", layerId);
            await exportLayerToZip(layerId);
            setOpenExport(false);
            flash("Export berhasil. ZIP siap diunduh.");
          } catch (e: any) {
            console.error("Export failed with detailed error:", e);
            const errorMessage = e?.message || "tidak diketahui";

            // Provide more specific error messages
            if (errorMessage.includes("shp-write")) {
              flash(
                `Gagal export: Library shp-write bermasalah. Coba refresh halaman dan ulangi export.`,
                "err"
              );
            } else if (errorMessage.includes("feature")) {
              flash(
                `Gagal export: Data layer tidak valid. Pastikan layer memiliki polygon yang valid.`,
                "err"
              );
            } else if (
              errorMessage.includes("network") ||
              errorMessage.includes("load")
            ) {
              flash(
                `Gagal export: Gagal memuat library export. Periksa koneksi internet.`,
                "err"
              );
            } else {
              flash(`Gagal export: ${errorMessage}`, "err");
            }
          }
        }}
      />
    </div>
  );
}
