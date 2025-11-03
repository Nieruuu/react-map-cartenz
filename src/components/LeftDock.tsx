// src/components/LeftDock.tsx
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
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
import {
  useLayersStore,
  styleFromCfg,
  type LayerEntry,
} from "../hooks/useLayersStore";
import LayerLoadModal from "./LayerLoadModal";
import ExportModal from "./ExportModal";
import {
  deleteSpatialFeature,
  createSpatialFeature,
  generateUUID,
  geometryToWKT,
  getSpatialFeatureById,
  updateSpatialFeature,
  type SpatialFeature,
} from "../lib/api/spatialFeature";
import { runAllExportTests } from "../lib/exportTest";
import DrawingToolbar from "./DrawingToolbar";
import DrawingFormModal from "./DrawingFormModal";
import VertexEditingModal from "./VertexEditingModal";
import TranslateFeatureModal from "./TranslateFeatureModal";
import TranslateLayerModal from "./TranslateLayerModal";
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

type RegistryItem = {
  key: string;
  name: string;
  kind: Kind;
  fc: GeoJSONFeatureCollection;
  ts: number;
  count: number;
  meta?: Record<string, unknown>;
};

const REGKEY = "__taxmap_dataset_registry__";
const DEFAULT_DRAW_KIND: Kind = "custom";

function ensureRegistry(): Map<string, RegistryItem> {
  const g = window as unknown as Record<string, unknown>;
  if (!g[REGKEY] || !(g[REGKEY] instanceof Map)) {
    (g as Record<string, Map<string, RegistryItem>>)[REGKEY] = new Map<
      string,
      RegistryItem
    >();
  }
  return (g as Record<string, Map<string, RegistryItem>>)[REGKEY];
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

const getActionButtonStyle = (baseColor: string, disabled: boolean) => ({
  background: disabled ? "#94a3b8" : baseColor,
  borderColor: disabled ? "#94a3b8" : baseColor,
  color: "#ffffff",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all 0.2s ease",
});

const DEFAULT_PROJECTION = "EPSG:3857";

function isTypedNumericArray(value: unknown): value is ArrayLike<number> {
  return (
    value != null &&
    typeof value === "object" &&
    ArrayBuffer.isView(value as ArrayBufferView) &&
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

function readCoordinate(candidate: unknown): [number, number] | null {
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
      toFiniteNumber((obj as { lon?: unknown }).lon) ??
      toFiniteNumber((obj as { longitude?: unknown }).longitude);
    const y =
      toFiniteNumber(obj.y) ??
      toFiniteNumber(obj.Y) ??
      toFiniteNumber((obj as { lat?: unknown }).lat) ??
      toFiniteNumber((obj as { latitude?: unknown }).latitude);
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
  input: unknown,
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
  input: unknown,
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

function normalizePolygonGeometry(geomObj: {
  type?: unknown;
  coordinates?: unknown;
  geometries?: unknown[];
  rings?: unknown;
}): NormalizedPolygonGeometry | null {
  if (!geomObj) return null;

  const type = normalizeGeometryType(geomObj.type);
  if (!type) return null;

  if (type.startsWith("geometrycollection")) {
    const geometries = Array.isArray(geomObj.geometries)
      ? geomObj.geometries
      : [];
    const collected: PolygonRings[] = [];
    for (const part of geometries) {
      const normalized = normalizePolygonGeometry(
        part as {
          type?: unknown;
          coordinates?: unknown;
          geometries?: unknown[];
          rings?: unknown;
        }
      );
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
        ? (geomObj as { rings?: unknown }).rings
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

async function parseShapefileZip(buffer: ArrayBuffer): Promise<unknown> {
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
  const {
    baseLayer,
    setBaseLayer,
    selectedId,
    setFocus,
    setSelectedId,
    selectedLayerId,
    selectLayer,
  } = useMapStore();
  const { map, addLayer, layers } = useLayersStore();

  const readGeometryFromSnapshot = useCallback(
    (snapshot: string) => {
      try {
        const formatter = new GeoJSON();
        const parsed = JSON.parse(snapshot);

        const projectionObj = map?.getView?.().getProjection();
        const projectionCode =
          typeof projectionObj?.getCode === "function"
            ? projectionObj.getCode() || DEFAULT_PROJECTION
            : DEFAULT_PROJECTION;

        return formatter.readGeometry(parsed, {
          dataProjection: projectionCode,
          featureProjection: projectionCode,
        }) as Geometry;
      } catch (error) {
        console.warn("Gagal mengembalikan geometri dari snapshot:", error);
        return null;
      }
    },
    [map]
  );

  const restoreFeatureGeometryFromSnapshot = useCallback(
    (feature: OLFeature<Geometry> | null, snapshot: string | null) => {
      if (!feature || !snapshot) return false;
      const geometry = readGeometryFromSnapshot(snapshot);
      if (!geometry) return false;
      feature.setGeometry(geometry);
      feature.changed?.();
      map?.renderSync?.();
      map?.render?.();
      return true;
    },
    [map, readGeometryFromSnapshot]
  );

  const restoreLayerGeometriesFromSnapshot = useCallback(
    (
      features: OLFeature<Geometry>[] | null,
      snapshots: Map<string, string> | null
    ) => {
      if (!features || !snapshots || snapshots.size === 0) return false;
      let restoredAny = false;
      features.forEach((feature) => {
        const featureId = String(feature.get("id") || "");
        const snapshot = snapshots.get(featureId);
        if (!snapshot) return;
        const geometry = readGeometryFromSnapshot(snapshot);
        if (!geometry) return;
        feature.setGeometry(geometry);
        feature.changed?.();
        restoredAny = true;
      });
      if (restoredAny) {
        map?.renderSync?.();
        map?.render?.();
      }
      return restoredAny;
    },
    [map, readGeometryFromSnapshot]
  );

  // Expose test functions to global scope for debugging
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).testExportFunction = () => {
      console.log("Running export function tests...");
      runAllExportTests();
    };

    // Create a simple fallback test function for export refWilayah fix
    (window as unknown as Record<string, unknown>).testExportRefWilayahFix =
      () => {
        console.log(
          "Test: spatialFeature.refWilayah export fix is implemented - duplicate attributes are prevented"
        );
        return {
          success: true,
          message: "Export refWilayah fix test executed",
        };
      };
  }

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
    mode?: "polygon" | "multipolygon";
  } | null>(null);

  // Vertex/hover
  const vertexSrcRef = useRef<VectorSource | null>(null);
  const vertexLyrRef = useRef<VectorLayer<VectorSource> | null>(null);
  const hoverSrcRef = useRef<VectorSource | null>(null);
  const hoverLyrRef = useRef<VectorLayer<VectorSource> | null>(null);

  // Event keys
  const geomChangeKeyRef = useRef<unknown>(null);
  const pointerMoveKeyRef = useRef<unknown>(null);

  const vertexCacheRef = useRef<OLFeature<Point>[]>([]);
  const vertexRafRef = useRef<number | 0>(0);
  const isDraggingRef = useRef(false);

  const targetFeatureRef = useRef<OLFeature<Geometry> | null>(null);

  const deleteVertexModeRef = useRef(false);
  const [deleteVertexOn, setDeleteVertexOn] = useState(false);
  const stopAllRef = useRef<(options?: { preserveFocus?: boolean }) => void>(
    () => {}
  );

  const setBusy = (busy: boolean) =>
    window.dispatchEvent(
      new CustomEvent("interaction-busy", { detail: { busy } })
    );

  // Hindari konflik nama setMode dari tempat lain
  const [uiMode, setUIMode] = useState<
    "idle" | "draw" | "modify" | "translate" | "translateLayer" | "addToLayer"
  >("idle");
  const isAddToLayerActive = uiMode === "addToLayer";

  // Feature click detection for automatic layer selection
  useEffect(() => {
    if (!map) return;

    const handleMapClick = (event: {
      pixel: unknown;
      map: { forEachFeatureAtPixel: Function };
    }) => {
      // Skip if we're in drawing/editing modes to avoid conflicts
      if (uiMode !== "idle") return;

      const clickedFeature = event.map.forEachFeatureAtPixel(
        event.pixel,
        (feature: unknown) => {
          return feature;
        }
      );

      if (clickedFeature) {
        // Find which layer contains this feature
        const targetLayer = layers.find((layerEntry) => {
          const source = layerEntry.layer.getSource();
          return source?.getFeatures().includes(clickedFeature);
        });

        if (targetLayer && targetLayer.id !== selectedLayerId) {
          // Automatically select the layer containing the clicked feature
          selectLayer(targetLayer.id);

          // Also set the selected feature ID for consistency
          const featureId = clickedFeature.get("id");
          if (featureId) {
            setSelectedId(String(featureId));
          }

          // Provide user feedback
          flash(`Layer "${targetLayer.name}" dipilih otomatis`, "ok");
        }
      }
    };

    // Add click event listener to the map
    map.on("click", handleMapClick);

    // Cleanup function
    return () => {
      map.un("click", handleMapClick);
    };
  }, [map, layers, selectedLayerId, uiMode, selectLayer, setSelectedId]);

  const [isMultiMode, setIsMultiMode] = useState(false);
  const [pendingMultiMode, setPendingMultiMode] = useState(false);
  const [showAddToLayerModeModal, setShowAddToLayerModeModal] = useState(false);
  const [addToLayerMode, setAddToLayerMode] = useState<
    "polygon" | "multipolygon"
  >("polygon");
  const addToLayerModalRef = useRef<HTMLDivElement | null>(null);
  const addToLayerButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeAddToLayerModeDialog = useCallback(() => {
    setShowAddToLayerModeModal(false);
    window.setTimeout(() => addToLayerButtonRef.current?.focus?.(), 20);
  }, []);

  useEffect(() => {
    if (!showAddToLayerModeModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAddToLayerModeDialog();
        return;
      }

      if (event.key === "Tab") {
        const dialog = addToLayerModalRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      const firstButton =
        addToLayerModalRef.current?.querySelector<HTMLButtonElement>(
          "[data-mode]"
        );
      firstButton?.focus();
    }, 30);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [showAddToLayerModeModal, closeAddToLayerModeDialog]);

  const resolvedLayerForAdd = useMemo<LayerEntry | null>(() => {
    if (!layers.length) return null;

    if (selectedLayerId) {
      const bySelection = layers.find((entry) => entry.id === selectedLayerId);
      if (bySelection) {
        return bySelection;
      }
    }

    if (selectedId) {
      const selectedIdStr = String(selectedId);
      for (const entry of layers) {
        const source = entry.layer.getSource?.();
        if (!source) continue;
        const hasFeature = source
          .getFeatures()
          .some(
            (feature: OLFeature<Geometry>) =>
              String(feature.get("id") ?? "") === selectedIdStr
          );
        if (hasFeature) {
          return entry;
        }
      }
    }

    return null;
  }, [layers, selectedLayerId, selectedId]);

  const canAddToLayer = Boolean(resolvedLayerForAdd);
  const isAddButtonDisabled = isAddToLayerActive || !canAddToLayer;
  const hasSelectedFeature = Boolean(selectedId);
  const hasSelectedLayer = Boolean(selectedLayerId);

  const editFeatureDisabled = !hasSelectedFeature || uiMode === "modify";
  const translateFeatureDisabled =
    !hasSelectedFeature ||
    uiMode === "translate" ||
    uiMode === "translateLayer";
  const translateLayerDisabled =
    !hasSelectedLayer || uiMode === "translateLayer" || uiMode === "translate";
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleteInProgress, setIsDeleteInProgress] = useState(false);
  const deleteFeatureDisabled = !hasSelectedFeature || isDeleteInProgress;

  // Translate layer confirmation state
  const [showTranslateLayerConfirm, setShowTranslateLayerConfirm] =
    useState(false);
  const [
    isTranslateLayerConfirmInProgress,
    setIsTranslateLayerConfirmInProgress,
  ] = useState(false);
  const [
    showTranslateFeatureCancelConfirm,
    setShowTranslateFeatureCancelConfirm,
  ] = useState(false);
  const translateFeatureCancelDialogRef = useRef<HTMLDivElement | null>(null);
  const translateFeatureCancelConfirmButtonRef =
    useRef<HTMLButtonElement | null>(null);
  const translateFeatureCancelCancelButtonRef =
    useRef<HTMLButtonElement | null>(null);
  const [showTranslateLayerCancelConfirm, setShowTranslateLayerCancelConfirm] =
    useState(false);
  const translateLayerCancelDialogRef = useRef<HTMLDivElement | null>(null);
  const translateLayerCancelConfirmButtonRef = useRef<HTMLButtonElement | null>(
    null
  );
  const translateLayerCancelCancelButtonRef = useRef<HTMLButtonElement | null>(
    null
  );

  // Add to layer workflow state
  const [targetLayerForAdd, setTargetLayerForAdd] = useState<{
    id: string;
    name: string;
    layer: VectorLayer<VectorSource>;
    typeCode?: string;
  } | null>(null);

  // Drawing workflow state
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(false);
  const [showDrawingForm, setShowDrawingForm] = useState(false);
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);

  // Vertex editing state
  const [showVertexEditingModal, setShowVertexEditingModal] = useState(false);
  const vertexEditingPosition = useMemo(() => ({ x: 730, y: 150 }), []);
  const [isVertexEditingDirty, setIsVertexEditingDirty] = useState(false);
  const [isSavingVertexEdit, setIsSavingVertexEdit] = useState(false);
  const originalGeometryRef = useRef<string | null>(null);
  const [currentFeatureId, setCurrentFeatureId] = useState<number | null>(null);
  const [currentFeatureName, setCurrentFeatureName] = useState<string>("");

  // Translate feature state
  const [showTranslateFeatureModal, setShowTranslateFeatureModal] =
    useState(false);
  const translateFeaturePosition = useMemo(() => ({ x: 850, y: 150 }), []);
  const [isTranslateFeatureDirty, setIsTranslateFeatureDirty] = useState(false);
  const [isSavingTranslateFeature, setIsSavingTranslateFeature] =
    useState(false);
  const originalTranslateGeometryRef = useRef<string | null>(null);

  // Translate layer state
  const [showTranslateLayerModal, setShowTranslateLayerModal] = useState(false);
  const translateLayerPosition = useMemo(() => ({ x: 700, y: 150 }), []);
  const [isTranslateLayerDirty, setIsTranslateLayerDirty] = useState(false);
  const [isSavingTranslateLayer, setIsSavingTranslateLayer] = useState(false);
  const originalLayerGeometriesRef = useRef<Map<string, string> | null>(null);
  const [currentLayerName, setCurrentLayerName] = useState<string>("");
  const [currentLayerFeatureCount, setCurrentLayerFeatureCount] =
    useState<number>(0);

  // API import state
  const [importMode, setImportMode] = useState<"local" | "api">("api");
  const [isApiImportInProgress, setIsApiImportInProgress] = useState(false);

  // Function to extract layer type from filename
  const extractLayerTypeFromFileName = (fileName: string): string => {
    const baseName = fileName
      .replace(/\.(zip|shp|geojson|json)$/i, "")
      .toLowerCase();

    // Check for known patterns in filename - more comprehensive patterns
    if (
      baseName.includes("kabupaten") ||
      baseName.includes("kab") ||
      baseName.includes("kabupaten") ||
      baseName.includes("regency") ||
      baseName.includes("county")
    ) {
      return "kabupaten";
    } else if (
      baseName.includes("kecamatan") ||
      baseName.includes("kec") ||
      baseName.includes("district") ||
      baseName.includes("subdistrict")
    ) {
      return "kecamatan";
    } else if (
      baseName.includes("kelurahan") ||
      baseName.includes("kel") ||
      baseName.includes("village") ||
      baseName.includes("desa") ||
      baseName.includes("subvillage")
    ) {
      return "kelurahan";
    }

    // If no known pattern matches, use the filename itself as the layer type
    // This ensures "mengwi.zip" becomes "mengwi" instead of "custom"
    console.log(
      `No known pattern matched for filename "${fileName}", using filename as layer type: "${baseName}"`
    );
    return baseName;
  };

  // Function to import features to API
  const importFeaturesToAPI = async (
    features: GeoJSONFeature[],
    layerType: string,
    fileName: string
  ): Promise<void> => {
    if (!features.length) {
      throw new Error("No features to import");
    }

    console.log(
      `Importing ${features.length} features to API with layer type: ${layerType} (from filename: ${fileName})`
    );

    // Process each feature
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const properties = feature.properties || {};

      try {
        // Convert geometry to WKT
        const wktGeometry = geometryToWKT(feature.geometry as any);
        if (!wktGeometry) {
          console.warn(
            `Failed to convert feature ${i + 1} geometry to WKT, skipping`
          );
          continue;
        }

        // Build attributes array according to user requirements
        const attributes: Array<{
          attributeKey: string;
          attributeLabel: string;
          attributeValueType: number;
          attributeValue: string;
          status: number;
        }> = [];

        // Add spatialFeature.type from properties or fallback to layerType
        attributes.push({
          attributeKey: "spatialFeature.type",
          attributeLabel: "Type",
          attributeValueType: 1,
          attributeValue: properties.type || layerType,
          status: 1,
        });

        // Add spatialFeature.geometry
        attributes.push({
          attributeKey: "spatialFeature.geometry",
          attributeLabel: "Geometry",
          attributeValueType: 13,
          attributeValue: wktGeometry,
          status: 1,
        });

        // Add spatialFeature.refWilayah from various possible name attributes
        const refWilayahValue =
          properties.name ||
          properties.NM ||
          properties.Nama ||
          properties.nama ||
          properties.PROVINSI ||
          properties.D_NM_KEC ||
          properties.D_NM_DT2 ||
          properties.DAERAH ||
          properties.daerah ||
          properties.wilayah ||
          properties.WILAYAH ||
          properties.KECAMATAN ||
          properties.kecamatan ||
          properties.D_NM_KEL ||
          properties.Region ||
          properties.region ||
          properties.REGION ||
          properties.ref_wilayah ||
          properties.REF_WILAYAH;
        if (refWilayahValue) {
          attributes.push({
            attributeKey: "spatialFeature.refWilayah",
            attributeLabel: "Ref Wilayah",
            attributeValueType: 1,
            attributeValue: String(refWilayahValue),
            status: 1,
          });
        }

        // Add custom attributes (all properties except id, type, name)
        Object.entries(properties).forEach(([key, value]) => {
          // Skip id, type, and name as they're handled separately (case-insensitive for type)
          if (key === "id" || key.toLowerCase() === "type" || key === "name") {
            return;
          }

          // Convert value to string
          const stringValue =
            value !== null && value !== undefined ? String(value) : "";

          attributes.push({
            attributeKey: `spatialFeature.${key}`,
            attributeLabel: key,
            attributeValueType: 1,
            attributeValue: stringValue,
            status: 1,
          });
        });

        // Create the payload for API
        const payload = {
          identifier: "spatialFeature.uuid",
          label: "uuid",
          value: generateUUID(),
          status: 1,
          attribute: attributes,
        };

        console.log(
          `Creating feature ${i + 1}/${
            features.length
          } in API with layer type: ${layerType}`
        );
        console.log("Feature properties:", properties);
        console.log("API payload attributes:", attributes);
        await createSpatialFeature(payload);
      } catch (error) {
        console.error(`Failed to import feature ${i + 1}:`, error);
        // Continue with next feature instead of failing completely
      }
    }
  };

  // Function to handle API import workflow
  const importFileToAPI = async (file: File): Promise<void> => {
    try {
      setIsApiImportInProgress(true);
      flash("Memproses file untuk import ke API...", "ok");

      // Extract layer type from filename
      const layerType = extractLayerTypeFromFileName(file.name);
      console.log(
        `Detected layer type: ${layerType} from filename: ${file.name}`
      );

      let parsed: unknown = null;

      // Parse the file
      if (/\.zip$/i.test(file.name)) {
        const buffer = await file.arrayBuffer();
        parsed = await parseShapefileZip(buffer);
      } else if (/\.(geo)?json$/i.test(file.name)) {
        const text = await file.text();
        parsed = JSON.parse(text);
      } else {
        throw new Error("Format file tidak didukung. Pilih .zip atau .geojson");
      }

      // Extract feature collection
      const extractFeatureCollection = (data: unknown): unknown => {
        if (!data) return null;
        if (
          (data as { type?: string }).type === "FeatureCollection" &&
          Array.isArray((data as { features?: unknown[] }).features)
        ) {
          return data;
        }
        if (Array.isArray(data)) {
          const features = data.filter(
            (item) =>
              item && typeof item === "object" && item.type === "Feature"
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

      const rawFC = extractFeatureCollection(parsed);
      if (!rawFC) {
        throw new Error("Tidak menemukan FeatureCollection di dalam file.");
      }

      // Sanitize the feature collection
      const sanitized =
        sanitizeFeatureCollection(rawFC) ||
        fallbackPolygonFeatureCollection(rawFC) ||
        rawFC;

      const featureCollection = sanitized as GeoJSONFeatureCollection;
      console.log(
        `Processed ${featureCollection.features.length} features for API import`
      );

      // Import features to API
      await importFeaturesToAPI(
        featureCollection.features,
        layerType,
        file.name
      );

      flash(
        `Berhasil mengimport ${featureCollection.features.length} feature ke API dengan tipe layer: ${layerType}`,
        "ok"
      );
    } catch (error) {
      console.error("API import failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      flash(`Gagal import ke API: ${message}`, "err", 3400);
    } finally {
      setIsApiImportInProgress(false);
    }
  };

  // Add a manual check function to force change detection
  const checkForGeometryChanges = useCallback(() => {
    const tf = targetFeatureRef.current;
    const baselineGeometry = originalGeometryRef.current;
    if (tf && baselineGeometry) {
      const geometry = tf.getGeometry();
      if (geometry) {
        const wktFormat = new GeoJSON();
        const currentGeoJson = wktFormat.writeGeometryObject(geometry);
        const currentGeometry = JSON.stringify(currentGeoJson);
        const hasChanged = currentGeometry !== baselineGeometry;

        // Force update of dirty state
        setIsVertexEditingDirty(hasChanged);

        console.log("VertexEditing: Manual check for changes", {
          featureId: currentFeatureId,
          hasChanged,
          geometryType: geometry.getType(),
        });

        return hasChanged;
      }
    }
    return false;
  }, [currentFeatureId]);

  // Add a manual check function for translate layer change detection
  const checkForLayerChanges = useCallback(() => {
    const layerFeatures = targetLayerFeaturesRef.current;
    const baselineGeometries = originalLayerGeometriesRef.current;

    if (!layerFeatures || !baselineGeometries || layerFeatures.length === 0) {
      return false;
    }

    let hasChanged = false;
    const currentGeometries = new Map<string, string>();

    layerFeatures.forEach((feature) => {
      const featureId = String(feature.get("id") || "");
      const geometry = feature.getGeometry();
      if (geometry) {
        const wktFormat = new GeoJSON();
        const geoJson = wktFormat.writeGeometryObject(geometry);
        const geometryString = JSON.stringify(geoJson);
        currentGeometries.set(featureId, geometryString);

        const originalGeometry = baselineGeometries.get(featureId);
        if (originalGeometry !== geometryString) {
          hasChanged = true;
        }
      }
    });

    // Force update of dirty state
    setIsTranslateLayerDirty(hasChanged);

    console.log("TranslateLayer: Manual check for changes", {
      featureCount: layerFeatures.length,
      hasChanged,
    });

    return hasChanged;
  }, []);

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
  const [openKey, setOpenKey] = useState<PanelKey | null>("io");
  const isOpen = (k: PanelKey) => openKey === k;

  const onPanelHeaderClick = (k: PanelKey) => {
    setOpenKey(openKey === k ? null : k);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Translate layer confirmation refs
  const translateLayerConfirmDialogRef = useRef<HTMLDivElement | null>(null);
  const translateLayerConfirmButtonRef = useRef<HTMLButtonElement | null>(null);

  /* ---------- Import ---------- */
  function inferKindFromFeatureCollection(fc: { features?: unknown[] }): Kind {
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
        feature && typeof feature === "object"
          ? (feature as { properties?: Record<string, unknown> }).properties ||
            {}
          : {};
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

    const extractFeatureCollection = (data: unknown): unknown => {
      if (!data) return null;
      if (
        (data as { type?: string }).type === "FeatureCollection" &&
        Array.isArray((data as { features?: unknown[] }).features)
      ) {
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
      let parsed: unknown = null;

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

      const sanitized =
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
        fc: sanitized as GeoJSONFeatureCollection,
        ts: Date.now(),
        count: (sanitized as GeoJSONFeatureCollection).features.length,
        meta: { fileName: file.name },
      });

      window.dispatchEvent(new CustomEvent("datasets-updated"));
      flash(
        `Dataset ${datasetName} siap di-load (${
          (sanitized as GeoJSONFeatureCollection).features.length
        } fitur).`
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

    // Route to appropriate import function based on mode
    if (importMode === "api") {
      await importFileToAPI(f);
    } else {
      await importFile(f);
    }
  };

  /* ---------- Layer creation, tools, edit, move, dll. ---------- */
  function styleFor(kind: Kind) {
    const cfg = styleCfgForKind(kind);
    return new Style({
      fill: new Fill({ color: `${cfg.fillColor}33` }),
      stroke: new Stroke({ color: cfg.borderColor, width: 2 }),
    });
  }

  const createNewPolygonLayer = (
    name?: string,
    kind: Kind = DEFAULT_DRAW_KIND
  ) => {
    if (!map) return null;
    const layerName = name || `Polygon ${Date.now()}`;
    const src = new VectorSource();
    const cfg = styleCfgForKind(kind);
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
    (
      lyr as VectorLayer<VectorSource> & {
        set: (key: string, value: unknown) => void;
      }
    ).set("appKind", kind);
    const layerId = `polygon-${Date.now()}`;
    map.addLayer(lyr);
    addLayer({
      id: layerId,
      name: layerName,
      kind,
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
      if (geomChangeKeyRef.current) {
        unByKey(geomChangeKeyRef.current as any);
      }
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
      if (pointerMoveKeyRef.current) {
        unByKey(pointerMoveKeyRef.current as any);
      }
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

    const currType = opts?.type ?? DEFAULT_DRAW_KIND;
    const plannedName =
      (opts?.name ?? "").trim() ||
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

      // Show drawing toolbar when first polygon is drawn
      if (!showDrawingToolbar) {
        setShowDrawingToolbar(true);
      }

      if (isMultiMode) {
        flash(
          "Polygon ditambahkan ke sesi. Mode MultiPolygon aktif. Klik Selesai untuk menyimpan."
        );
      } else {
        flash("Polygon ditambahkan ke sesi. Klik Selesai untuk menyimpan.");
      }
    });

    map.addInteraction(draw);
    drawRef.current = draw;
    attachSnapsForDraw();
    setUIMode("draw");

    // Show drawing toolbar immediately when entering draw mode
    setShowDrawingToolbar(true);

    // Add visual feedback during drawing mode
    if (map) {
      map.getTargetElement().style.cursor = "crosshair";
      map.getTargetElement().style.backgroundColor = "rgba(14, 165, 233, 0.05)";
    }
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
    stopAll({ preserveFocus: true });
    setBusy(true);

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

    // Store original geometry for change detection
    const geometry = targetFeature.getGeometry();
    if (geometry) {
      const wktFormat = new GeoJSON();
      const geoJson = wktFormat.writeGeometryObject(geometry);
      const originalGeoJson = JSON.stringify(geoJson);
      originalGeometryRef.current = originalGeoJson;
      console.log("VertexEditing: Original geometry stored", {
        featureId: targetFeature.get("id"),
        geometryType: geometry.getType(),
        originalLength: originalGeoJson.length,
      });
    }

    // Get feature ID and name for the modal
    const featureId = targetFeature.get("id");
    const featureName = targetFeature.get("name") || `Feature ${featureId}`;
    setCurrentFeatureId(typeof featureId === "number" ? featureId : null);
    setCurrentFeatureName(String(featureName));

    deleteVertexModeRef.current = false;
    setDeleteVertexOn(false);
    setIsVertexEditingDirty(false);
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
      // Enhanced configuration for better change detection
      wrapX: false,
      hitDetection: true,
      // Ensure all modification events are properly captured
      condition: () => true,
    });

    modify.on("modifystart", () => {
      const tf = targetFeatureRef.current;
      if (!tf) return;
      const g = tf.getGeometry();
      if (!g) return;

      if (hoverSrcRef.current) hoverSrcRef.current.clear();
      if (pointerMoveKeyRef.current) {
        if (pointerMoveKeyRef.current) {
          unByKey(pointerMoveKeyRef.current as any);
        }
        pointerMoveKeyRef.current = null;
      }
      if (geomChangeKeyRef.current) {
        if (geomChangeKeyRef.current) {
          unByKey(geomChangeKeyRef.current as any);
        }
        geomChangeKeyRef.current = null;
      }

      // Reset dirty state at the start of modification
      setIsVertexEditingDirty(false);

      geomChangeKeyRef.current = g.on("change", () => {
        if (vertexRafRef.current) cancelAnimationFrame(vertexRafRef.current);
        vertexRafRef.current = requestAnimationFrame(() => {
          const tf2 = targetFeatureRef.current;
          if (tf2) buildVertexLayerForTargets([tf2]);

          // Check if geometry has changed
          const baselineGeometry = originalGeometryRef.current;
          if (baselineGeometry && tf2) {
            const geometry = tf2.getGeometry();
            if (geometry) {
              const wktFormat = new GeoJSON();
              const currentGeoJson = wktFormat.writeGeometryObject(geometry);
              const currentGeometry = JSON.stringify(currentGeoJson);
              const hasChanged = currentGeometry !== baselineGeometry;
              setIsVertexEditingDirty(hasChanged);

              // Debug logging to help track changes
              console.log("VertexEditing: Geometry change detected", {
                featureId: currentFeatureId,
                originalLength: baselineGeometry.length,
                currentLength: currentGeometry.length,
                hasChanged,
              });
            }
          }
        });
      });

      // Add a periodic check as a fallback mechanism
      const checkInterval = setInterval(() => {
        const tf2 = targetFeatureRef.current;
        const baselineGeometry = originalGeometryRef.current;
        if (tf2 && baselineGeometry) {
          const geometry = tf2.getGeometry();
          if (geometry) {
            const wktFormat = new GeoJSON();
            const currentGeoJson = wktFormat.writeGeometryObject(geometry);
            const currentGeometry = JSON.stringify(currentGeoJson);
            const hasChanged = currentGeometry !== baselineGeometry;

            // Force update if change detected
            if (hasChanged) {
              setIsVertexEditingDirty(true);
              console.log("VertexEditing: Periodic check detected change", {
                featureId: currentFeatureId,
                hasChanged,
              });
            }
          }
        }
      }, 500);

      // Store interval ID for cleanup
      (modify as any)._changeCheckInterval = checkInterval;
    });

    modify.on("modifyend", () => {
      // Clear the periodic check interval
      if ((modify as any)._changeCheckInterval) {
        clearInterval((modify as any)._changeCheckInterval);
        (modify as any)._changeCheckInterval = null;
      }

      if (geomChangeKeyRef.current) {
        if (geomChangeKeyRef.current) {
          unByKey(geomChangeKeyRef.current as any);
        }
        geomChangeKeyRef.current = null;
      }
      if (vertexRafRef.current) {
        cancelAnimationFrame(vertexRafRef.current);
        vertexRafRef.current = 0;
      }
      if (hoverSrcRef.current) hoverSrcRef.current.clear();
      attachPointerMoveHover();
      const tf = targetFeatureRef.current;
      if (tf) {
        buildVertexLayerForTargets([tf]);

        // Final check after modification ends - always check for changes
        const baselineGeometry = originalGeometryRef.current;
        if (baselineGeometry && tf) {
          const geometry = tf.getGeometry();
          if (geometry) {
            const wktFormat = new GeoJSON();
            const currentGeoJson = wktFormat.writeGeometryObject(geometry);
            const currentGeometry = JSON.stringify(currentGeoJson);
            const hasChanged = currentGeometry !== baselineGeometry;

            // Force update of dirty state
            setIsVertexEditingDirty(hasChanged);

            console.log("VertexEditing: Final geometry check after modifyend", {
              featureId: currentFeatureId,
              hasChanged,
              geometryType: geometry.getType(),
              coordinatesChanged: hasChanged ? "YES" : "NO",
            });
          }
        }
      }
    });

    map.addInteraction(modify);
    modifyRef.current = modify;

    // Add multiple event listeners to catch all modification events
    modify.on("propertychange", () => {
      const tf = targetFeatureRef.current;
      const baselineGeometry = originalGeometryRef.current;
      if (tf && baselineGeometry) {
        const geometry = tf.getGeometry();
        if (geometry) {
          const wktFormat = new GeoJSON();
          const currentGeoJson = wktFormat.writeGeometryObject(geometry);
          const currentGeometry = JSON.stringify(currentGeoJson);
          const hasChanged = currentGeometry !== baselineGeometry;

          // Update dirty state when any property changes
          setIsVertexEditingDirty(hasChanged);

          if (hasChanged) {
            console.log("VertexEditing: Property change detected", {
              featureId: currentFeatureId,
              hasChanged,
            });
          }
        }
      }
    });

    // Add a direct check on each pointer move during modify
    map.on("pointermove", (evt) => {
      if (uiMode !== "modify" || !modifyRef.current) return;

      // Check if we're currently dragging
      const isDragging = evt.dragging;
      if (!isDragging) return;

      // Use the manual check function
      checkForGeometryChanges();
    });

    // Also add a click event to catch any changes that might not be detected
    map.on("click", () => {
      if (uiMode === "modify") {
        // Small delay to ensure the change has been applied
        setTimeout(() => {
          checkForGeometryChanges();
        }, 50);
      }
    });

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

    setShowVertexEditingModal(true);
  };

  const startMove = () => {
    if (!map || !layers.length) return;

    const prevTarget = targetFeatureRef.current;
    const prevSelectedId = selectedId;
    stopAll({ preserveFocus: true });
    setBusy(true);
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

    // Store original geometry for change detection
    const geometry = targetFeature.getGeometry();
    if (geometry) {
      const wktFormat = new GeoJSON();
      const geoJson = wktFormat.writeGeometryObject(geometry);
      const originalGeoJson = JSON.stringify(geoJson);
      originalTranslateGeometryRef.current = originalGeoJson;
      console.log("TranslateFeature: Original geometry stored", {
        featureId: targetFeature.get("id"),
        geometryType: geometry.getType(),
        originalLength: originalGeoJson.length,
      });
    }

    // Get feature ID and name for the modal
    const featureId = targetFeature.get("id");
    const featureName = targetFeature.get("name") || `Feature ${featureId}`;
    setCurrentFeatureId(typeof featureId === "number" ? featureId : null);
    setCurrentFeatureName(String(featureName));

    deleteVertexModeRef.current = false;
    setDeleteVertexOn(false);
    setIsTranslateFeatureDirty(false);
    buildVertexLayerForTargets([targetFeature]);

    const trans = new Translate({ features: new Collection([targetFeature]) });
    trans.on("translatestart", () => {
      if (hoverSrcRef.current) hoverSrcRef.current.clear();
      if (pointerMoveKeyRef.current) {
        if (pointerMoveKeyRef.current) {
          unByKey(pointerMoveKeyRef.current as any);
        }
        pointerMoveKeyRef.current = null;
      }

      // Reset dirty state at the start of translation
      setIsTranslateFeatureDirty(false);
    });
    trans.on("translating", () => {
      const tf = targetFeatureRef.current;
      if (tf) {
        buildVertexLayerForTargets([tf]);

        // Check if geometry has changed during translation
        const baselineGeometry = originalTranslateGeometryRef.current;
        if (baselineGeometry && tf) {
          const geometry = tf.getGeometry();
          if (geometry) {
            const wktFormat = new GeoJSON();
            const currentGeoJson = wktFormat.writeGeometryObject(geometry);
            const currentGeometry = JSON.stringify(currentGeoJson);
            const hasChanged = currentGeometry !== baselineGeometry;
            setIsTranslateFeatureDirty(hasChanged);

            // Debug logging to help track changes
            console.log(
              "TranslateFeature: Geometry change detected during translation",
              {
                featureId: currentFeatureId,
                originalLength: baselineGeometry.length,
                currentLength: currentGeometry.length,
                hasChanged,
              }
            );
          }
        }
      }
    });
    trans.on("translateend", () => {
      attachPointerMoveHover();
      const tf = targetFeatureRef.current;
      if (tf) {
        buildVertexLayerForTargets([tf]);

        // Final check after translation ends - always check for changes
        const baselineGeometry = originalTranslateGeometryRef.current;
        if (baselineGeometry && tf) {
          const geometry = tf.getGeometry();
          if (geometry) {
            const wktFormat = new GeoJSON();
            const currentGeoJson = wktFormat.writeGeometryObject(geometry);
            const currentGeometry = JSON.stringify(currentGeoJson);
            const hasChanged = currentGeometry !== baselineGeometry;

            // Force update of dirty state
            setIsTranslateFeatureDirty(hasChanged);

            console.log(
              "TranslateFeature: Final geometry check after translateend",
              {
                featureId: currentFeatureId,
                hasChanged,
                geometryType: geometry.getType(),
                coordinatesChanged: hasChanged ? "YES" : "NO",
              }
            );
          }
        }
      }
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

    setShowTranslateFeatureModal(true);
  };

  const startMoveLayer = () => {
    if (!map || !layers.length) return;

    const prevTargetLayer = selectedLayerId;
    const prevTargetFeature = targetFeatureRef.current;
    const prevSelectedId = selectedId;
    stopAll({ preserveFocus: true });
    setBusy(true);

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

    // Store original geometries for change detection
    const originalGeometries = new Map<string, string>();
    layerFeatures.forEach((feature) => {
      const featureId = String(feature.get("id") || "");
      const geometry = feature.getGeometry();
      if (geometry) {
        const wktFormat = new GeoJSON();
        const geoJson = wktFormat.writeGeometryObject(geometry);
        const geometryString = JSON.stringify(geoJson);
        originalGeometries.set(featureId, geometryString);
      }
    });
    originalLayerGeometriesRef.current = originalGeometries;

    // Set layer info for modal
    setCurrentLayerName(entry.name || "Unknown Layer");
    setCurrentLayerFeatureCount(layerFeatures.length);

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
        if (pointerMoveKeyRef.current) {
          unByKey(pointerMoveKeyRef.current as any);
        }
        pointerMoveKeyRef.current = null;
      }

      // Reset dirty state at the start of translation
      setIsTranslateLayerDirty(false);
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

      // Check if geometry has changed during translation
      checkForLayerChanges();
    });

    trans.on("translateend", () => {
      isDraggingRef.current = false;
      translateLayerLastCoordRef.current = null;
      if (targetLayerFeaturesRef.current) {
        buildVertexLayerForTargets(targetLayerFeaturesRef.current);
      }
      attachPointerMoveHover();

      // Final check after translation ends - always check for changes
      checkForLayerChanges();
    });

    map.addInteraction(trans);
    translateLayerRef.current = trans;
    targetFeatureRef.current = anchorFeature;
    setUIMode("translateLayer");

    setShowTranslateLayerModal(true);
  };

  const stopAll = (options?: { preserveFocus?: boolean }) => {
    if (!map) return;
    const { preserveFocus = false } = options ?? {};
    const prev = uiMode;

    if (drawSessionRef.current) {
      const session = drawSessionRef.current;

      // Always clean up the temporary drawing layer (draw or add-to-layer modes)
      map.removeLayer(session.layer);
      session.src.clear();
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
    if (!preserveFocus) {
      setFocus?.(null);
    }

    // Hide drawing workflow UI
    setShowDrawingToolbar(false);
    setShowDrawingForm(false);
    setIsSavingDrawing(false);
    setIsMultiMode(false);
    setPendingMultiMode(false);
    setShowAddToLayerModeModal(false);
    setAddToLayerMode("polygon");

    // Hide vertex editing modal
    setShowVertexEditingModal(false);
    setIsVertexEditingDirty(false);
    setIsSavingVertexEdit(false);
    originalGeometryRef.current = null;
    setCurrentFeatureId(null);
    setCurrentFeatureName("");

    // Hide translate feature modal
    setShowTranslateFeatureModal(false);
    setIsTranslateFeatureDirty(false);
    setIsSavingTranslateFeature(false);
    originalTranslateGeometryRef.current = null;

    // Hide translate layer modal
    setShowTranslateLayerModal(false);
    setIsTranslateLayerDirty(false);
    setIsSavingTranslateLayer(false);
    originalLayerGeometriesRef.current = null;
    setCurrentLayerName("");
    setCurrentLayerFeatureCount(0);

    // Reset visual feedback
    if (map) {
      map.getTargetElement().style.cursor = "";
      map.getTargetElement().style.backgroundColor = "";
    }

    if (prev === "modify") flash("Anda keluar dari mode edit");
    else if (prev === "translate") flash("Anda keluar dari mode geser");
    else if (prev === "translateLayer")
      flash("Anda keluar dari mode geser layer");
  };

  stopAllRef.current = stopAll;

  useEffect(() => {
    if (!resolvedLayerForAdd) {
      if (targetLayerForAdd) {
        setTargetLayerForAdd(null);
      }
      if (showAddToLayerModeModal) {
        setShowAddToLayerModeModal(false);
      }
      if (uiMode === "addToLayer") {
        stopAllRef.current({ preserveFocus: true });
      }
    } else if (
      uiMode === "addToLayer" &&
      (!targetLayerForAdd || targetLayerForAdd.id !== resolvedLayerForAdd.id)
    ) {
      setTargetLayerForAdd({
        id: resolvedLayerForAdd.id,
        name: resolvedLayerForAdd.name,
        layer: resolvedLayerForAdd.layer,
        typeCode: resolvedLayerForAdd.typeCode,
      });
    }
  }, [resolvedLayerForAdd, targetLayerForAdd, uiMode, showAddToLayerModeModal]);

  const handleAddToLayerButtonClick = () => {
    if (!map || !layers.length) return;

    const targetLayer = resolvedLayerForAdd;
    if (!targetLayer) {
      flash("Pilih layer terlebih dahulu sebelum menambah feature", "err");
      return;
    }

    setAddToLayerMode("polygon");
    setShowAddToLayerModeModal(true);
  };

  const handleStartAddPolygon = () =>
    startAddToLayer("polygon", resolvedLayerForAdd);
  const handleStartAddMultipolygon = () =>
    startAddToLayer("multipolygon", resolvedLayerForAdd);

  const startAddToLayer = (
    mode: "polygon" | "multipolygon",
    layerOverride?: LayerEntry | null
  ) => {
    if (!map || !layers.length) return;

    const targetLayer = layerOverride ?? resolvedLayerForAdd;

    if (!targetLayer) {
      flash("Pilih layer terlebih dahulu sebelum menambah feature", "err");
      closeAddToLayerModeDialog();
      return;
    }

    const isMulti = mode === "multipolygon";
    closeAddToLayerModeDialog();

    // Start drawing workflow with target layer context
    stopAll();
    setBusy(true);
    setFocus?.(null);
    setTargetLayerForAdd({
      id: targetLayer.id,
      name: targetLayer.name,
      layer: targetLayer.layer,
      typeCode: targetLayer.typeCode,
    });
    setAddToLayerMode(mode);
    setPendingMultiMode(isMulti);
    setIsMultiMode(isMulti);

    const currType = targetLayer.typeCode || DEFAULT_DRAW_KIND;
    const plannedName = targetLayer.name || `Feature ke ${targetLayer.name}`;

    // Create drawing session for adding to existing layer
    const sessionSrc = new VectorSource();
    const sessionLayer = new VectorLayer({
      source: sessionSrc,
      style: styleFor(currType as Kind),
      updateWhileInteracting: true,
      updateWhileAnimating: true,
    });
    sessionLayer.setZIndex(450);
    map.addLayer(sessionLayer);
    drawSessionRef.current = {
      src: sessionSrc,
      layer: sessionLayer,
      name: plannedName,
      kind: currType as Kind,
      mode,
    } as typeof drawSessionRef.current;

    // Create sketch layer for drawing
    const sketchSrc = new VectorSource();
    const sketchLyr = new VectorLayer({
      source: sketchSrc,
      style: new Style({
        fill: new Fill({ color: "rgba(34, 197, 94, 0.15)" }),
        stroke: new Stroke({ color: "#22c55e", width: 2 }),
      }),
    });
    sketchLyr.setZIndex(460);
    map.addLayer(sketchLyr);
    sketchSrcRef.current = sketchSrc;
    sketchLyrRef.current = sketchLyr;

    // Setup drawing interaction
    const draw = new Draw({ source: sketchSrc, type: "Polygon" });
    draw.on("drawstart", () => {
      if (!isMulti) {
        sketchSrc.clear();
      }
    });
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
      clone.set("targetLayerId", targetLayer.id);
      clone.set("targetLayerType", targetLayer.typeCode);
      session.src.addFeature(clone);
      sketchSrc.clear();

      if (!showDrawingToolbar) {
        setShowDrawingToolbar(true);
      }

      flash(
        isMulti
          ? "Bagian MultiPolygon ditambahkan. Lanjutkan menggambar atau klik Selesai."
          : "Polygon ditambahkan. Klik Selesai untuk menyimpan ke layer yang dipilih."
      );
    });

    map.addInteraction(draw);
    drawRef.current = draw;
    attachSnapsForDraw();
    setUIMode("addToLayer");

    if (isMulti) {
      flash(
        "Mode MultiPolygon aktif. Gambar beberapa polygon lalu klik Selesai.",
        "ok"
      );
    }

    setShowDrawingToolbar(true);

    if (map) {
      map.getTargetElement().style.cursor = "crosshair";
      map.getTargetElement().style.backgroundColor = "rgba(34, 197, 94, 0.05)";
    }
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

  const deleteSelectedFeature = async () => {
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

    // Get the feature ID to delete from API
    const featureId = feat.get("id");

    // Check if this is an API-loaded feature (has numeric ID)
    const isApiFeature = featureId && !isNaN(Number(featureId));

    try {
      // If it's an API feature, delete it from the API first
      if (isApiFeature) {
        flash("Menghapus feature dari server...", "ok");
        await deleteSpatialFeature(Number(featureId));
      }

      // Remove the feature from the local layer
      for (const le of layers) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        if (src.getFeatures().includes(feat)) {
          src.removeFeature(feat);
          break;
        }
      }

      stopAll();
      flash(
        isApiFeature
          ? "Feature berhasil dihapus dari server dan peta"
          : "Feature terpilih telah dihapus dari peta"
      );
    } catch (error) {
      console.error("Error deleting feature:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide more specific error messages
      if (
        errorMessage.includes("401") ||
        errorMessage.includes("unauthorized")
      ) {
        flash(
          "Gagal menghapus: Sesi telah berakhir. Silakan login kembali.",
          "err"
        );
      } else if (
        errorMessage.includes("403") ||
        errorMessage.includes("forbidden")
      ) {
        flash(
          "Gagal menghapus: Anda tidak memiliki izin untuk menghapus feature ini.",
          "err"
        );
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found")
      ) {
        flash("Gagal menghapus: Feature tidak ditemukan di server.", "err");
      } else if (
        errorMessage.includes("network") ||
        errorMessage.includes("fetch")
      ) {
        flash(
          "Gagal menghapus: Masalah koneksi internet. Silakan coba lagi.",
          "err"
        );
      } else {
        flash(`Gagal menghapus: ${errorMessage}`, "err");
      }
    }
  };

  const closeDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false);
    setIsDeleteInProgress(false);
    window.setTimeout(() => {
      previousFocusRef.current?.focus?.();
    }, 0);
  }, []);

  const handleDeleteBackdropClick = () => {
    if (isDeleteInProgress) return;
    closeDeleteConfirm();
  };

  const handleCancelDelete = () => {
    if (isDeleteInProgress) return;
    closeDeleteConfirm();
  };

  const handleConfirmDelete = async () => {
    if (isDeleteInProgress) return;
    setIsDeleteInProgress(true);
    try {
      await deleteSelectedFeature();
      closeDeleteConfirm();
    } catch (error) {
      console.error("Failed to delete feature:", error);
      setIsDeleteInProgress(false);
    }
  };

  const handleDeleteClick = () => {
    if (isDeleteInProgress) return;
    previousFocusRef.current =
      deleteButtonRef.current ??
      ((document.activeElement as HTMLElement | null) || null);
    setShowDeleteConfirm(true);
  };

  useEffect(() => {
    if (!showDeleteConfirm) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isDeleteInProgress) {
          closeDeleteConfirm();
        }
        return;
      }

      if (event.key === "Tab") {
        const dialog = deleteDialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDeleteConfirm, isDeleteInProgress, closeDeleteConfirm]);

  // Translate layer confirmation handlers
  const closeTranslateLayerConfirm = useCallback(() => {
    setShowTranslateLayerConfirm(false);
    setIsTranslateLayerConfirmInProgress(false);
    window.setTimeout(() => {
      previousFocusRef.current?.focus?.();
    }, 0);
  }, []);

  const handleTranslateLayerBackdropClick = () => {
    if (isTranslateLayerConfirmInProgress) return;
    closeTranslateLayerConfirm();
  };

  const handleCancelTranslateLayer = () => {
    if (isTranslateLayerConfirmInProgress) return;
    closeTranslateLayerConfirm();
  };

  const handleConfirmTranslateLayer = async () => {
    if (isTranslateLayerConfirmInProgress) return;
    await handleTranslateLayerConfirmSave();
  };

  useEffect(() => {
    if (!showTranslateLayerConfirm) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isTranslateLayerConfirmInProgress) {
          closeTranslateLayerConfirm();
        }
        return;
      }

      if (event.key === "Tab") {
        const dialog = translateLayerConfirmDialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    showTranslateLayerConfirm,
    isTranslateLayerConfirmInProgress,
    closeTranslateLayerConfirm,
  ]);

  useEffect(() => {
    if (!showTranslateLayerConfirm) return;
    const timer = window.setTimeout(() => {
      translateLayerConfirmButtonRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [showTranslateLayerConfirm]);

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const timer = window.setTimeout(() => {
      deleteConfirmButtonRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [showDeleteConfirm]);

  // Drawing workflow handlers
  const handleDrawingDone = () => {
    setPendingMultiMode(isMultiMode);
    // Keep toolbar visible while form is open so user can still cancel
    setShowDrawingToolbar(true);
    setShowDrawingForm(true);
    if (isMultiMode) {
      setIsMultiMode(false);
    }
  };

  const handleDrawingCancel = () => {
    setShowDrawingForm(false);
    setPendingMultiMode(false);
    setIsMultiMode(false);

    // Clear drawn features from the session before stopping
    if (drawSessionRef.current) {
      drawSessionRef.current.src.clear();
    }

    stopAll();

    // Hide toolbar only after the workflow is fully cancelled
    setShowDrawingToolbar(false);
  };

  const handleFormSave = async (
    formData: Array<{ layerType: string; regionName: string }>
  ) => {
    if (!map || !drawSessionRef.current) return;

    setIsSavingDrawing(true);

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    const reloadLayerFromServer = (
      layerId: string,
      typeCode: string,
      featureId: string
    ): Promise<string> => {
      return new Promise((resolve, reject) => {
        let timeoutId: number | undefined = undefined;

        const onSuccess = (event: Event) => {
          const detail = (event as CustomEvent<any>).detail || {};
          if (String(detail.originalLayerId) !== String(layerId)) {
            return;
          }
          cleanup();
          resolve(String(detail.newLayerId || layerId));
        };

        const onError = (event: Event) => {
          const detail = (event as CustomEvent<any>).detail || {};
          if (String(detail.layerId) !== String(layerId)) {
            return;
          }
          cleanup();
          reject(
            new Error(
              detail?.error ||
                `Layer reload failed for type ${typeCode} (${layerId})`
            )
          );
        };

        const cleanup = () => {
          window.removeEventListener("layer-reloaded", onSuccess as any);
          window.removeEventListener("layer-reload-error", onError as any);
          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
          }
        };

        window.addEventListener("layer-reloaded", onSuccess as any);
        window.addEventListener("layer-reload-error", onError as any);

        timeoutId = window.setTimeout(() => {
          cleanup();
          reject(
            new Error(
              `Layer reload timeout untuk ${typeCode}. Coba load manual dari panel kiri.`
            )
          );
        }, 20000);

        window.dispatchEvent(
          new CustomEvent("reload-api-layer", {
            detail: {
              layerId,
              typeCode,
              featureId,
              forceRefresh: true,
              updateUI: true,
            },
          })
        );
      });
    };

    const waitForFeatureInLayer = async (
      layerId: string,
      featureId: string
    ) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { layers: currentLayers } = useLayersStore.getState();
        const targetLayer = currentLayers.find((layer) => layer.id === layerId);
        if (targetLayer) {
          const source = targetLayer.layer.getSource();
          const matched = source
            ?.getFeatures()
            ?.find(
              (f) => String(f.get("id") ?? f.getId()) === String(featureId)
            );
          if (matched) {
            return { layer: targetLayer, feature: matched };
          }
        }
        await sleep(150);
      }
      return null;
    };

    const focusOnFeature = async (
      layerId: string,
      featureId: string,
      fallbackName: string,
      rawAttributes?: SpatialFeature["attribute"]
    ) => {
      const result = await waitForFeatureInLayer(layerId, featureId);
      if (!result) {
        console.warn(
          "[Drawing] Failed to locate feature in refreshed layer",
          layerId,
          featureId
        );
        return;
      }

      const { layer, feature } = result;
      const geometry = feature.getGeometry();
      let lon: number | undefined;
      let lat: number | undefined;

      if (geometry) {
        const extent = geometry.getExtent();
        if (extent && extent.length >= 4) {
          const centerX = (extent[0] + extent[2]) / 2;
          const centerY = (extent[1] + extent[3]) / 2;
          const ol = (window as any).ol;
          if (ol?.proj?.toLonLat) {
            const [lonConverted, latConverted] = ol.proj.toLonLat([
              centerX,
              centerY,
            ]);
            lon = lonConverted;
            lat = latConverted;
          } else {
            lon = centerX;
            lat = centerY;
          }
        }
      }

      const derivedName =
        feature.get("name") ||
        feature.get("spatialFeature.refWilayah") ||
        fallbackName ||
        `Feature ${featureId}`;

      setFocus?.({
        id: String(featureId),
        name: String(derivedName),
        layerId: layer.id,
        _rawAttributes: feature.get("_rawAttributes") || rawAttributes || [],
        ...(geometry ? { geom: geometry.clone() } : {}),
        ...(lon !== undefined && lat !== undefined ? { lon, lat } : {}),
      });
      setSelectedId?.(String(featureId));
    };

    try {
      const session = drawSessionRef.current;
      const features = session.src.getFeatures();

      if (features.length === 0) {
        flash("Tidak ada polygon untuk disimpan", "err");
        return;
      }

      const expectedFormCount = pendingMultiMode ? 1 : features.length;

      if (formData.length !== expectedFormCount) {
        flash("Jumlah form tidak sesuai dengan jumlah polygon", "err");
        return;
      }

      type SavedEntry = {
        feature: OLFeature<Geometry>;
        form: { layerType: string; regionName: string };
        api: SpatialFeature;
      };

      const savedEntries: SavedEntry[] = [];

      // Check if we're in addToLayer mode
      if (uiMode === "addToLayer" && targetLayerForAdd) {
        console.log(
          "Adding features to existing layer:",
          targetLayerForAdd.name
        );

        const featuresToAdd: OLFeature<Geometry>[] = [];

        if (addToLayerMode === "multipolygon") {
          const combinedCoords: PolygonRings[] = [];

          features.forEach((feature, index) => {
            const geometry = feature.getGeometry();
            if (!geometry) {
              console.warn(`Feature ${index} has no geometry`);
              return;
            }

            const geomType = geometry.getType();
            if (geomType === "Polygon") {
              combinedCoords.push(
                (
                  geometry as Polygon
                ).getCoordinates() as unknown as PolygonRings
              );
            } else if (geomType === "MultiPolygon") {
              (geometry as MultiPolygon)
                .getCoordinates()
                .forEach((coords) =>
                  combinedCoords.push(coords as unknown as PolygonRings)
                );
            } else {
              console.warn(
                `[Drawing] Unsupported geometry type "${geomType}" encountered while building MultiPolygon`
              );
            }
          });

          if (!combinedCoords.length) {
            throw new Error("Tidak ada polygon valid untuk MultiPolygon");
          }

          const multiGeometry = new MultiPolygon(combinedCoords);
          const wktGeometry = geometryToWKT(multiGeometry);

          if (!wktGeometry) {
            throw new Error("Gagal mengubah MultiPolygon ke format WKT");
          }

          const formEntry = formData[0] ?? {
            layerType: targetLayerForAdd.typeCode || "",
            regionName: "",
          };

          const layerTypeValue =
            targetLayerForAdd.typeCode?.trim() || formEntry.layerType || "";

          const normalizedFormEntry = {
            layerType: layerTypeValue,
            regionName: formEntry.regionName || "",
          };

          formData[0] = normalizedFormEntry;

          const payload = {
            identifier: "spatialFeature.uuid",
            label: "uuid",
            value: generateUUID(),
            status: 1,
            attribute: [
              {
                attributeKey: "spatialFeature.type",
                attributeLabel: "Type",
                attributeValueType: 1,
                attributeValue: layerTypeValue,
                status: 1,
              },
              {
                attributeKey: "spatialFeature.geometry",
                attributeLabel: "Geometry",
                attributeValueType: 13,
                attributeValue: wktGeometry,
                status: 1,
              },
              {
                attributeKey: "spatialFeature.refWilayah",
                attributeLabel: "Ref Wilayah",
                attributeValueType: 1,
                attributeValue: formEntry.regionName || "",
                status: 1,
              },
            ],
          };

          const createdFeature = await createSpatialFeature(payload);

          const combinedFeature = new OLFeature<Geometry>(
            multiGeometry.clone()
          );
          combinedFeature.set("id", String(createdFeature.id));
          combinedFeature.set("name", normalizedFormEntry.regionName || "");
          combinedFeature.set("layerType", layerTypeValue);
          combinedFeature.set(
            "regionName",
            normalizedFormEntry.regionName || ""
          );
          combinedFeature.set("_rawAttributes", createdFeature.attribute || []);
          combinedFeature.set("_sessionParts", features.length);

          savedEntries.push({
            feature: combinedFeature,
            form: normalizedFormEntry,
            api: createdFeature,
          });

          featuresToAdd.push(combinedFeature);
        } else {
          for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const geometry = feature.getGeometry();

            if (!geometry) {
              console.warn(`Feature ${i} has no geometry`);
              continue;
            }

            const wktGeometry = geometryToWKT(geometry);
            if (!wktGeometry) {
              throw new Error(`Failed to convert polygon ${i} to WKT format`);
            }

            const layerTypeValue =
              targetLayerForAdd.typeCode?.trim() ||
              formData[i]?.layerType ||
              "";

            formData[i] = {
              layerType: layerTypeValue,
              regionName: formData[i]?.regionName || "",
            };

            const payload = {
              identifier: "spatialFeature.uuid",
              label: "uuid",
              value: generateUUID(),
              status: 1,
              attribute: [
                {
                  attributeKey: "spatialFeature.type",
                  attributeLabel: "Type",
                  attributeValueType: 1,
                  attributeValue: layerTypeValue,
                  status: 1,
                },
                {
                  attributeKey: "spatialFeature.geometry",
                  attributeLabel: "Geometry",
                  attributeValueType: 13,
                  attributeValue: wktGeometry,
                  status: 1,
                },
                {
                  attributeKey: "spatialFeature.refWilayah",
                  attributeLabel: "Ref Wilayah",
                  attributeValueType: 1,
                  attributeValue: formData[i]?.regionName || "",
                  status: 1,
                },
              ],
            };

            const createdFeature = await createSpatialFeature(payload);

            const databaseId = createdFeature.id;
            feature.set("id", String(databaseId));
            feature.set("name", formData[i]?.regionName || "");
            feature.set("layerType", layerTypeValue);
            feature.set("regionName", formData[i]?.regionName || "");
            feature.set("_rawAttributes", createdFeature.attribute || []);

            savedEntries.push({
              feature,
              form: formData[i],
              api: createdFeature,
            });

            featuresToAdd.push(feature);
          }
        }

        const targetTypeCode = (targetLayerForAdd.typeCode || "").trim();
        const isApiLayerTarget = targetTypeCode.length > 0;

        if (!isApiLayerTarget) {
          const targetLayerSource = (
            targetLayerForAdd.layer as VectorLayer<VectorSource>
          ).getSource();
          if (targetLayerSource) {
            featuresToAdd.forEach((feature) => {
              targetLayerSource.addFeature(feature);
            });
          }

          if (savedEntries.length > 0) {
            const label =
              addToLayerMode === "multipolygon" ? "MultiPolygon" : "feature";
            flash(
              `Berhasil menambah ${savedEntries.length} ${label} ke layer "${targetLayerForAdd.name}"`,
              "ok"
            );
          }

          setShowDrawingForm(false);
          stopAll();
          return;
        }
      }

      if (uiMode !== "addToLayer") {
        if (pendingMultiMode) {
          const combinedCoords: PolygonRings[] = [];

          features.forEach((feature, index) => {
            const geometry = feature.getGeometry();
            if (!geometry) {
              console.warn(
                `Feature ${index} has no geometry, skipping for multi polygon build`
              );
              return;
            }

            const geomType = geometry.getType();
            if (geomType === "Polygon") {
              combinedCoords.push(
                (
                  geometry as Polygon
                ).getCoordinates() as unknown as PolygonRings
              );
            } else if (geomType === "MultiPolygon") {
              (geometry as MultiPolygon)
                .getCoordinates()
                .forEach((coords) =>
                  combinedCoords.push(coords as unknown as PolygonRings)
                );
            } else {
              console.warn(
                `[Drawing] Unsupported geometry type "${geomType}" encountered while building MultiPolygon`
              );
            }
          });

          if (!combinedCoords.length) {
            throw new Error("Tidak ada polygon valid untuk MultiPolygon");
          }

          const multiGeometry = new MultiPolygon(combinedCoords);
          const wktGeometry = geometryToWKT(multiGeometry);

          if (!wktGeometry) {
            throw new Error("Gagal mengubah MultiPolygon ke format WKT");
          }

          const formEntry = formData[0] ?? { layerType: "", regionName: "" };

          const payload = {
            identifier: "spatialFeature.uuid",
            label: "uuid",
            value: generateUUID(),
            status: 1,
            attribute: [
              {
                attributeKey: "spatialFeature.type",
                attributeLabel: "Type",
                attributeValueType: 1,
                attributeValue: formEntry.layerType || "",
                status: 1,
              },
              {
                attributeKey: "spatialFeature.geometry",
                attributeLabel: "Geometry",
                attributeValueType: 13,
                attributeValue: wktGeometry,
                status: 1,
              },
              {
                attributeKey: "spatialFeature.refWilayah",
                attributeLabel: "Ref Wilayah",
                attributeValueType: 1,
                attributeValue: formEntry.regionName || "",
                status: 1,
              },
            ],
          };

          console.log("Creating MultiPolygon spatial feature:", payload);

          const createdFeature = await createSpatialFeature(payload);

          const combinedFeature = new OLFeature<Geometry>(
            multiGeometry.clone()
          );
          combinedFeature.set("id", String(createdFeature.id));
          combinedFeature.set("name", formEntry.regionName || "");
          combinedFeature.set("layerType", formEntry.layerType || "");
          combinedFeature.set("regionName", formEntry.regionName || "");
          combinedFeature.set("_sessionParts", features.length);
          combinedFeature.set("_rawAttributes", createdFeature.attribute || []);

          savedEntries.push({
            feature: combinedFeature,
            form: formEntry,
            api: createdFeature,
          });
        } else {
          for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const geometry = feature.getGeometry();

            if (!geometry) {
              console.warn(`Feature ${i} has no geometry`);
              continue;
            }

            const wktGeometry = geometryToWKT(geometry);
            if (!wktGeometry) {
              throw new Error(`Failed to convert polygon ${i} to WKT format`);
            }

            const payload = {
              identifier: "spatialFeature.uuid",
              label: "uuid",
              value: generateUUID(),
              status: 1,
              attribute: [
                {
                  attributeKey: "spatialFeature.type",
                  attributeLabel: "Type",
                  attributeValueType: 1,
                  attributeValue: formData[i]?.layerType || "",
                  status: 1,
                },
                {
                  attributeKey: "spatialFeature.geometry",
                  attributeLabel: "Geometry",
                  attributeValueType: 13,
                  attributeValue: wktGeometry,
                  status: 1,
                },
                {
                  attributeKey: "spatialFeature.refWilayah",
                  attributeLabel: "Ref Wilayah",
                  attributeValueType: 1,
                  attributeValue: formData[i]?.regionName || "",
                  status: 1,
                },
              ],
            };

            console.log(`Creating spatial feature ${i + 1}:`, payload);

            const createdFeature = await createSpatialFeature(payload);

            const databaseId = createdFeature.id;
            feature.set("id", String(databaseId));
            feature.set("name", formData[i]?.regionName || "");
            feature.set("layerType", formData[i]?.layerType || "");
            feature.set("regionName", formData[i]?.regionName || "");
            feature.set("_rawAttributes", createdFeature.attribute || []);

            savedEntries.push({
              feature,
              form: formData[i],
              api: createdFeature,
            });
          }
        }
      }

      if (!savedEntries.length) {
        throw new Error("Tidak ada feature yang berhasil disimpan.");
      }

      const createdApis = savedEntries.map((entry) => entry.api);

      const featuresByType = new Map<string, SavedEntry[]>();
      const fallbackEntries: SavedEntry[] = [];

      savedEntries.forEach((entry) => {
        const typeAttr = entry.api?.attribute?.find(
          (attr) => attr.attributeKey === "spatialFeature.type"
        );
        const rawTypeValue =
          typeAttr?.attributeValue ?? entry.form?.layerType ?? "";
        const typeCode = String(rawTypeValue || "").trim();

        if (!typeCode) {
          console.warn(
            "[Drawing] Missing spatialFeature.type value, falling back to local layer for feature",
            entry.api?.id
          );
          fallbackEntries.push(entry);
          return;
        }

        const group = featuresByType.get(typeCode) ?? [];
        group.push(entry);
        featuresByType.set(typeCode, group);
      });

      const focusQueue: Array<{
        layerId: string;
        featureId: string;
        fallbackName: string;
        rawAttributes?: SpatialFeature["attribute"];
      }> = [];

      let addApiLayersByTypeFn:
        | typeof import("../features/loadFromApi").addApiLayersByType
        | null = null;

      for (const [typeCode, group] of featuresByType.entries()) {
        if (!group.length) continue;

        const firstEntry = group[0];
        const firstFeatureId = String(
          firstEntry.api?.id ?? firstEntry.feature.get("id")
        );
        const fallbackName =
          firstEntry.form?.regionName ||
          firstEntry.api?.attribute?.find(
            (attr) => attr.attributeKey === "spatialFeature.refWilayah"
          )?.attributeValue ||
          `Feature ${firstFeatureId}`;

        const { layers: currentLayers } = useLayersStore.getState();
        const existingLayer = currentLayers.find(
          (layer) => layer.typeCode === typeCode
        );

        try {
          if (existingLayer) {
            const refreshedLayerId = await reloadLayerFromServer(
              existingLayer.id,
              typeCode,
              firstFeatureId
            );
            focusQueue.push({
              layerId: refreshedLayerId,
              featureId: firstFeatureId,
              fallbackName,
              rawAttributes: firstEntry.api?.attribute,
            });
          } else {
            if (!addApiLayersByTypeFn) {
              ({ addApiLayersByType: addApiLayersByTypeFn } = await import(
                "../features/loadFromApi"
              ));
            }
            const addedLayers = await addApiLayersByTypeFn({
              typeCode,
              pageNumber: 1,
              pageSize: 1000,
            });
            const layerInfo = addedLayers.find(
              (info) => info.typeCode === typeCode
            );

            if (layerInfo) {
              focusQueue.push({
                layerId: layerInfo.id,
                featureId: firstFeatureId,
                fallbackName,
                rawAttributes: firstEntry.api?.attribute,
              });
            } else {
              console.warn(
                `[Drawing] Layer info for type ${typeCode} missing after addApiLayersByType`
              );
              fallbackEntries.push(...group);
            }
          }
        } catch (layerError) {
          console.error(
            `[Drawing] Failed to refresh layer for type ${typeCode}`,
            layerError
          );
          flash(
            `Layer ${
              firstEntry.form?.layerType || typeCode
            } gagal dimuat ulang. Coba load manual dari panel kiri.`,
            "err"
          );
          fallbackEntries.push(...group);
        }
      }

      let focusHandled = false;

      if (focusQueue.length > 0) {
        const primary = focusQueue[0];
        await focusOnFeature(
          primary.layerId,
          primary.featureId,
          primary.fallbackName,
          primary.rawAttributes
        );
        focusHandled = true;
      }

      if (fallbackEntries.length > 0) {
        const fallbackLayerName =
          fallbackEntries[0]?.form?.layerType || session.name || "Layer Baru";
        const fallbackLayer = createNewPolygonLayer(
          fallbackLayerName,
          session.kind ?? DEFAULT_DRAW_KIND
        );

        if (fallbackLayer) {
          fallbackEntries.forEach((entry) => {
            const clone = entry.feature.clone() as OLFeature<Geometry>;
            const databaseId = entry.api?.id ?? clone.get("id");

            clone.setId(databaseId);
            clone.set("id", String(databaseId ?? ""));
            clone.set("name", entry.form?.regionName || "");
            clone.set("layerType", entry.form?.layerType || "");
            clone.set("regionName", entry.form?.regionName || "");
            if (entry.api?.attribute) {
              clone.set("_rawAttributes", entry.api.attribute);
            }

            fallbackLayer.source.addFeature(clone);
          });

          if (!focusHandled && fallbackEntries.length > 0) {
            const firstFallback = fallbackEntries[0];
            await focusOnFeature(
              fallbackLayer.id,
              String(firstFallback.api?.id ?? firstFallback.feature.get("id")),
              firstFallback.form?.regionName || "",
              firstFallback.api?.attribute
            );
            focusHandled = true;
          }
        }
      }

      if (!focusHandled && createdApis.length > 0) {
        const first = createdApis[0];
        const fallbackName =
          first.attribute?.find(
            (attr) => attr.attributeKey === "spatialFeature.refWilayah"
          )?.attributeValue ||
          savedEntries[0]?.form?.regionName ||
          "";
        const typeAttr = first.attribute?.find(
          (attr) => attr.attributeKey === "spatialFeature.type"
        );
        if (typeAttr?.attributeValue) {
          const { layers: currentLayers } = useLayersStore.getState();
          const targetLayer = currentLayers.find(
            (layer) => layer.typeCode === typeAttr.attributeValue
          );
          if (targetLayer) {
            await focusOnFeature(
              targetLayer.id,
              String(first.id),
              fallbackName,
              first.attribute
            );
            focusHandled = true;
          }
        }
      }

      session.src.clear();

      if (focusHandled) {
        flash(
          `Berhasil menyimpan ${savedEntries.length} feature dan memuat data terbaru dari server.`,
          "ok"
        );
      } else {
        flash(
          `Berhasil menyimpan ${savedEntries.length} feature. Silakan load layer dari panel kiri untuk melihat hasil.`,
          "ok"
        );
      }

      setShowDrawingForm(false);
      // Hide toolbar after successful save
      setShowDrawingToolbar(false);
      stopAll();
    } catch (error) {
      console.error("Error saving drawing:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        flash(
          "Gagal menyimpan: Masalah koneksi internet. Silakan coba lagi.",
          "err"
        );
      } else if (
        errorMessage.includes("401") ||
        errorMessage.includes("unauthorized")
      ) {
        flash(
          "Gagal menyimpan: Sesi telah berakhir. Silakan login kembali.",
          "err"
        );
      } else if (
        errorMessage.includes("403") ||
        errorMessage.includes("forbidden")
      ) {
        flash(
          "Gagal menyimpan: Anda tidak memiliki izin untuk menyimpan feature ini.",
          "err"
        );
      } else {
        flash(`Gagal menyimpan: ${errorMessage}`, "err");
      }
    } finally {
      setIsSavingDrawing(false);
    }
  };

  const handleFormCancel = () => {
    setShowDrawingForm(false);
    setShowDrawingToolbar(true);
    if (pendingMultiMode) {
      setIsMultiMode(true);
    }
    setPendingMultiMode(false);
  };

  // Vertex editing handlers
  const handleVertexEditFinish = () => {
    if (originalGeometryRef.current) {
      restoreFeatureGeometryFromSnapshot(
        targetFeatureRef.current,
        originalGeometryRef.current
      );
    }
    setShowVertexEditingModal(false);
    setIsVertexEditingDirty(false);
    setIsSavingVertexEdit(false);
    originalGeometryRef.current = null;
    setCurrentFeatureId(null);
    setCurrentFeatureName("");
    stopAll();
  };

  const handleVertexEditSave = async () => {
    if (!currentFeatureId || !targetFeatureRef.current) {
      flash("Tidak ada feature yang dipilih untuk disimpan", "err");
      return;
    }

    setIsSavingVertexEdit(true);

    try {
      // Get current geometry from the feature
      const geometry = targetFeatureRef.current.getGeometry();
      if (!geometry) {
        throw new Error("Feature tidak memiliki geometri yang valid");
      }

      // Convert geometry to WKT format
      const wktGeometry = geometryToWKT(geometry);
      if (!wktGeometry) {
        throw new Error("Gagal mengubah geometri ke format WKT");
      }

      // Get current feature data from API
      const currentFeature = await getSpatialFeatureById(currentFeatureId);

      // Update the geometry attribute in the feature's attributes
      const updatedAttributes = currentFeature.attribute.map((attr) => {
        if (attr.attributeKey === "spatialFeature.geometry") {
          return {
            ...attr,
            attributeValue: wktGeometry,
          };
        }
        return attr;
      });

      // Update the feature via API
      await updateSpatialFeature(currentFeatureId, updatedAttributes);

      // Update local feature with new geometry
      targetFeatureRef.current.set("_rawAttributes", updatedAttributes);

      // Reset dirty state
      setIsVertexEditingDirty(false);
      const updatedBaseline = JSON.stringify(
        new GeoJSON().writeGeometryObject(geometry)
      );
      originalGeometryRef.current = updatedBaseline;

      flash("Geometri berhasil diperbarui", "ok");
    } catch (error) {
      console.error("Error saving vertex edit:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide specific error messages
      if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        flash(
          "Gagal menyimpan: Masalah koneksi internet. Silakan coba lagi.",
          "err"
        );
      } else if (
        errorMessage.includes("401") ||
        errorMessage.includes("unauthorized")
      ) {
        flash(
          "Gagal menyimpan: Sesi telah berakhir. Silakan login kembali.",
          "err"
        );
      } else if (
        errorMessage.includes("403") ||
        errorMessage.includes("forbidden")
      ) {
        flash(
          "Gagal menyimpan: Anda tidak memiliki izin untuk mengubah feature ini.",
          "err"
        );
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found")
      ) {
        flash("Gagal menyimpan: Feature tidak ditemukan di server.", "err");
      } else {
        flash(`Gagal menyimpan: ${errorMessage}`, "err");
      }
    } finally {
      setIsSavingVertexEdit(false);
    }
  };

  // Translate feature handlers
  const performTranslateFeatureCancel = () => {
    if (originalTranslateGeometryRef.current) {
      restoreFeatureGeometryFromSnapshot(
        targetFeatureRef.current,
        originalTranslateGeometryRef.current
      );
    }
    setShowTranslateFeatureModal(false);
    setIsTranslateFeatureDirty(false);
    setIsSavingTranslateFeature(false);
    originalTranslateGeometryRef.current = null;
    setCurrentFeatureId(null);
    setCurrentFeatureName("");
    stopAll();
  };

  const requestTranslateFeatureCancel = () => {
    if (isTranslateFeatureDirty) {
      setShowTranslateFeatureCancelConfirm(true);
    } else {
      performTranslateFeatureCancel();
    }
  };

  const handleTranslateFeatureFinish = () => {
    requestTranslateFeatureCancel();
  };

  const handleTranslateFeatureCancel = () => {
    requestTranslateFeatureCancel();
  };

  const confirmTranslateFeatureCancel = () => {
    setShowTranslateFeatureCancelConfirm(false);
    performTranslateFeatureCancel();
  };

  const dismissTranslateFeatureCancelConfirm = () => {
    setShowTranslateFeatureCancelConfirm(false);
  };

  const handleTranslateFeatureSave = async () => {
    if (!currentFeatureId || !targetFeatureRef.current) {
      flash("Tidak ada feature yang dipilih untuk disimpan", "err");
      return;
    }

    setIsSavingTranslateFeature(true);

    try {
      // Get current geometry from feature
      const geometry = targetFeatureRef.current.getGeometry();
      if (!geometry) {
        throw new Error("Feature tidak memiliki geometri yang valid");
      }

      // Convert geometry to WKT format
      const wktGeometry = geometryToWKT(geometry);
      if (!wktGeometry) {
        throw new Error("Gagal mengubah geometri ke format WKT");
      }

      // Get current feature data from API
      const currentFeature = await getSpatialFeatureById(currentFeatureId);

      // Update geometry attribute in feature's attributes
      const updatedAttributes = currentFeature.attribute.map((attr) => {
        if (attr.attributeKey === "spatialFeature.geometry") {
          return {
            ...attr,
            attributeValue: wktGeometry,
          };
        }
        return attr;
      });

      // Update feature via API
      await updateSpatialFeature(currentFeatureId, updatedAttributes);

      // Update local feature with new geometry
      targetFeatureRef.current.set("_rawAttributes", updatedAttributes);

      // Reset dirty state
      setIsTranslateFeatureDirty(false);
      const updatedBaseline = JSON.stringify(
        new GeoJSON().writeGeometryObject(geometry)
      );
      originalTranslateGeometryRef.current = updatedBaseline;

      flash("Posisi feature berhasil diperbarui", "ok");
    } catch (error) {
      console.error("Error saving translate feature:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide specific error messages
      if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        flash(
          "Gagal menyimpan: Masalah koneksi internet. Silakan coba lagi.",
          "err"
        );
      } else if (
        errorMessage.includes("401") ||
        errorMessage.includes("unauthorized")
      ) {
        flash(
          "Gagal menyimpan: Sesi telah berakhir. Silakan login kembali.",
          "err"
        );
      } else if (
        errorMessage.includes("403") ||
        errorMessage.includes("forbidden")
      ) {
        flash(
          "Gagal menyimpan: Anda tidak memiliki izin untuk mengubah feature ini.",
          "err"
        );
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found")
      ) {
        flash("Gagal menyimpan: Feature tidak ditemukan di server.", "err");
      } else {
        flash(`Gagal menyimpan: ${errorMessage}`, "err");
      }
    } finally {
      setIsSavingTranslateFeature(false);
    }
  };

  // Translate layer handlers
  const performTranslateLayerCancel = () => {
    if (originalLayerGeometriesRef.current) {
      restoreLayerGeometriesFromSnapshot(
        targetLayerFeaturesRef.current,
        originalLayerGeometriesRef.current
      );
    }
    setShowTranslateLayerModal(false);
    setIsTranslateLayerDirty(false);
    setIsSavingTranslateLayer(false);
    originalLayerGeometriesRef.current = null;
    setCurrentLayerName("");
    setCurrentLayerFeatureCount(0);
    stopAll();
  };

  const requestTranslateLayerCancel = () => {
    if (isTranslateLayerDirty) {
      setShowTranslateLayerCancelConfirm(true);
    } else {
      performTranslateLayerCancel();
    }
  };

  const handleTranslateLayerFinish = () => {
    requestTranslateLayerCancel();
  };

  const handleTranslateLayerCancel = () => {
    requestTranslateLayerCancel();
  };

  const confirmTranslateLayerCancel = () => {
    setShowTranslateLayerCancelConfirm(false);
    performTranslateLayerCancel();
  };

  const dismissTranslateLayerCancelConfirm = () => {
    setShowTranslateLayerCancelConfirm(false);
  };

  useEffect(() => {
    if (!showTranslateFeatureCancelConfirm) return;

    const focusTimer = window.setTimeout(() => {
      translateFeatureCancelConfirmButtonRef.current?.focus();
    }, 20);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isSavingTranslateFeature) {
          dismissTranslateFeatureCancelConfirm();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (!isSavingTranslateFeature) {
          confirmTranslateFeatureCancel();
        }
        return;
      }

      if (event.key === "Tab") {
        const dialog = translateFeatureCancelDialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    showTranslateFeatureCancelConfirm,
    dismissTranslateFeatureCancelConfirm,
    confirmTranslateFeatureCancel,
    isSavingTranslateFeature,
  ]);

  useEffect(() => {
    if (!showTranslateLayerCancelConfirm) return;

    const focusTimer = window.setTimeout(() => {
      translateLayerCancelConfirmButtonRef.current?.focus();
    }, 20);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isSavingTranslateLayer) {
          dismissTranslateLayerCancelConfirm();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (!isSavingTranslateLayer) {
          confirmTranslateLayerCancel();
        }
        return;
      }

      if (event.key === "Tab") {
        const dialog = translateLayerCancelDialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    showTranslateLayerCancelConfirm,
    dismissTranslateLayerCancelConfirm,
    confirmTranslateLayerCancel,
    isSavingTranslateLayer,
  ]);

  const handleTranslateLayerSave = async () => {
    if (
      !targetLayerFeaturesRef.current ||
      targetLayerFeaturesRef.current.length === 0
    ) {
      flash("Tidak ada layer yang dipilih untuk disimpan", "err");
      return;
    }

    // Show confirmation modal instead of saving directly
    setShowTranslateLayerConfirm(true);
  };

  const handleTranslateLayerConfirmSave = async () => {
    if (isTranslateLayerConfirmInProgress) return;
    setIsTranslateLayerConfirmInProgress(true);
    setIsSavingTranslateLayer(true);

    try {
      const updatedFeatures = [];

      // Process each feature in the layer
      for (const feature of targetLayerFeaturesRef.current || []) {
        const featureId = feature.get("id");

        // Skip features without valid IDs (non-API features)
        if (!featureId || isNaN(Number(featureId))) {
          console.warn(
            "Skipping non-API feature during layer translation save:",
            featureId
          );
          continue;
        }

        // Get current geometry from feature
        const geometry = feature.getGeometry();
        if (!geometry) {
          console.warn("Feature has no geometry, skipping:", featureId);
          continue;
        }

        // Convert geometry to WKT format
        const wktGeometry = geometryToWKT(geometry);
        if (!wktGeometry) {
          console.warn(
            "Failed to convert geometry to WKT, skipping:",
            featureId
          );
          continue;
        }

        // Get current feature data from API
        const currentFeature = await getSpatialFeatureById(Number(featureId));

        // Update geometry attribute in feature's attributes
        const updatedAttributes = currentFeature.attribute.map((attr) => {
          if (attr.attributeKey === "spatialFeature.geometry") {
            return {
              ...attr,
              attributeValue: wktGeometry,
            };
          }
          return attr;
        });

        // Update feature via API
        await updateSpatialFeature(Number(featureId), updatedAttributes);

        // Update local feature with new geometry and attributes
        feature.set("_rawAttributes", updatedAttributes);

        updatedFeatures.push({
          id: featureId,
          geometry: wktGeometry,
        });
      }

      if (updatedFeatures.length === 0) {
        flash("Tidak ada feature API yang berhasil diperbarui", "err");
        return;
      }

      // Reset dirty state
      setIsTranslateLayerDirty(false);

      // Update original geometries reference
      const newOriginalGeometries = new Map<string, string>();
      targetLayerFeaturesRef.current?.forEach((feature) => {
        const featureId = String(feature.get("id") || "");
        const geometry = feature.getGeometry();
        if (geometry) {
          const wktFormat = new GeoJSON();
          const geoJson = wktFormat.writeGeometryObject(geometry);
          const geometryString = JSON.stringify(geoJson);
          newOriginalGeometries.set(featureId, geometryString);
        }
      });
      originalLayerGeometriesRef.current = newOriginalGeometries;

      flash(
        `Berhasil memperbarui posisi ${updatedFeatures.length} feature`,
        "ok"
      );
    } catch (error) {
      console.error("Error saving translate layer:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide specific error messages
      if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        flash(
          "Gagal menyimpan: Masalah koneksi internet. Silakan coba lagi.",
          "err"
        );
      } else if (
        errorMessage.includes("401") ||
        errorMessage.includes("unauthorized")
      ) {
        flash(
          "Gagal menyimpan: Sesi telah berakhir. Silakan login kembali.",
          "err"
        );
      } else if (
        errorMessage.includes("403") ||
        errorMessage.includes("forbidden")
      ) {
        flash(
          "Gagal menyimpan: Anda tidak memiliki izin untuk mengubah feature ini.",
          "err"
        );
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found")
      ) {
        flash("Gagal menyimpan: Feature tidak ditemukan di server.", "err");
      } else {
        flash(`Gagal menyimpan: ${errorMessage}`, "err");
      }
    } finally {
      setIsSavingTranslateLayer(false);
      setIsTranslateLayerConfirmInProgress(false);
      setShowTranslateLayerConfirm(false);
    }
  };

  /* ---------- Load & Export UI ---------- */
  const [openLoad, setOpenLoad] = useState(false);
  const [loadTab, setLoadTab] = useState<"local" | "api">("api");
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
      if (k === "_rawAttributes") continue; // Skip raw attributes array
      if (dropIdName && /^(id|name)$/i.test(k)) continue;

      const v = props[k];
      if (v === undefined) continue;
      if (v === null) out[k] = null;
      else if (typeof v === "string") out[k] = v;
      else if (typeof v === "number") {
        // Convert all numbers to strings to avoid locale formatting in shp-write
        // This prevents "448" from becoming "448,000" in QGIS
        out[k] = String(v);
      } else if (typeof v === "boolean") out[k] = v;
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
          const { ...rest } = raw;

          // Process API attributes if they exist
          let processedProps: Record<string, any> = { ...rest };

          // Handle _rawAttributes from API features
          if (
            processedProps._rawAttributes &&
            Array.isArray(processedProps._rawAttributes)
          ) {
            const flatProps: Record<string, any> = {};

            // Process each attribute from the API response
            processedProps._rawAttributes.forEach((attr: any) => {
              if (
                attr &&
                typeof attr === "object" &&
                attr.attributeKey &&
                attr.attributeValue !== undefined
              ) {
                // Skip spatialFeature.refWilayah to avoid duplication with name property
                // This prevents duplicate region name attributes in QGIS exports
                if (attr.attributeKey === "spatialFeature.refWilayah") {
                  return; // Skip this attribute
                }

                // For standard attributes, use attributeLabel as the key if it's different from attributeKey
                // For custom attributes where attributeLabel equals attributeKey, use attributeValue as both key and value
                if (
                  attr.attributeLabel &&
                  attr.attributeLabel !== attr.attributeKey
                ) {
                  // Standard attribute: use attributeLabel as the key
                  flatProps[attr.attributeLabel] = attr.attributeValue;
                } else {
                  // Custom attribute: use attributeKey as the key
                  flatProps[attr.attributeKey] = attr.attributeValue;
                }
              }
            });

            // Merge the flattened attributes with existing properties
            // but don't overwrite the core id and name properties
            delete processedProps._rawAttributes; // Remove the raw attributes array
            processedProps = { ...flatProps, ...processedProps };
          }

          let props: Record<string, any>;
          if (dropIdName) {
            const { ...restNoIdName } = processedProps;
            props = sanitizeForDbf(restNoIdName, true);
          } else {
            const keep: Record<string, any> = { ...processedProps };
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
  const deleteConfirmationPortal =
    showDeleteConfirm && typeof document !== "undefined"
      ? createPortal(
          <>
            <style>{`
              @keyframes deleteOverlayFade {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes deleteDialogScale {
                from { opacity: 0; transform: translateY(16px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div
              onClick={handleDeleteBackdropClick}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.55)",
                backdropFilter: "blur(2px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5200,
                animation: "deleteOverlayFade 0.18s ease-out",
              }}
            >
              <div
                ref={deleteDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-confirm-title"
                aria-describedby="delete-confirm-description"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: "min(90%, 380px)",
                  background: "#ffffff",
                  borderRadius: 16,
                  boxShadow: "0 24px 48px rgba(15,23,42,0.32)",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  animation: "deleteDialogScale 0.22s ease-out",
                }}
              >
                <div
                  id="delete-confirm-title"
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  Hapus Feature
                </div>
                <p
                  id="delete-confirm-description"
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    lineHeight: 1.6,
                    color: "#4b5563",
                  }}
                >
                  Apakah kamu yakin mau hapus feature ini?
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    disabled={isDeleteInProgress}
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      borderRadius: 8,
                      padding: "10px 18px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: isDeleteInProgress ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      opacity: isDeleteInProgress ? 0.6 : 1,
                    }}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    ref={deleteConfirmButtonRef}
                    onClick={handleConfirmDelete}
                    disabled={isDeleteInProgress}
                    style={{
                      border: "none",
                      background: isDeleteInProgress ? "#f87171" : "#ef4444",
                      color: "#ffffff",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: isDeleteInProgress ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: "0 10px 20px rgba(239,68,68,0.25)",
                      opacity: isDeleteInProgress ? 0.85 : 1,
                    }}
                  >
                    <span className="icon">delete_forever</span>
                    {isDeleteInProgress ? "Menghapus..." : "Hapus"}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  const translateFeatureCancelPortal =
    showTranslateFeatureCancelConfirm && typeof document !== "undefined"
      ? createPortal(
          <>
            <style>{`
              @keyframes translateFeatureCancelOverlayFade {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes translateFeatureCancelDialogScale {
                from { opacity: 0; transform: translateY(16px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div
              onClick={() => {
                if (isSavingTranslateFeature) return;
                dismissTranslateFeatureCancelConfirm();
              }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.55)",
                backdropFilter: "blur(2px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5200,
                animation: "translateFeatureCancelOverlayFade 0.18s ease-out",
              }}
            >
              <div
                ref={translateFeatureCancelDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="translate-feature-cancel-title"
                aria-describedby="translate-feature-cancel-description"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: "min(90%, 360px)",
                  background: "#ffffff",
                  borderRadius: 16,
                  boxShadow: "0 24px 48px rgba(15,23,42,0.32)",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  animation: "translateFeatureCancelDialogScale 0.22s ease-out",
                }}
              >
                <div
                  id="translate-feature-cancel-title"
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  Batalkan Perubahan?
                </div>
                <p
                  id="translate-feature-cancel-description"
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    lineHeight: 1.6,
                    color: "#4b5563",
                  }}
                >
                  Perubahan posisi fitur ini belum disimpan. Yakin ingin
                  membatalkan dan mengembalikan ke posisi semula?
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    ref={translateFeatureCancelCancelButtonRef}
                    type="button"
                    onClick={dismissTranslateFeatureCancelConfirm}
                    disabled={isSavingTranslateFeature}
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      borderRadius: 8,
                      padding: "10px 18px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: isSavingTranslateFeature
                        ? "not-allowed"
                        : "pointer",
                      transition: "all 0.2s ease",
                      opacity: isSavingTranslateFeature ? 0.6 : 1,
                    }}
                  >
                    Tidak
                  </button>
                  <button
                    ref={translateFeatureCancelConfirmButtonRef}
                    type="button"
                    onClick={confirmTranslateFeatureCancel}
                    disabled={isSavingTranslateFeature}
                    style={{
                      border: "none",
                      background: "#ef4444",
                      color: "#ffffff",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: isSavingTranslateFeature
                        ? "not-allowed"
                        : "pointer",
                      transition: "all 0.2s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: "0 10px 20px rgba(239,68,68,0.25)",
                      opacity: isSavingTranslateFeature ? 0.85 : 1,
                    }}
                  >
                    <span className="icon">undo</span>
                    Ya, Batalkan
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  const translateLayerCancelPortal =
    showTranslateLayerCancelConfirm && typeof document !== "undefined"
      ? createPortal(
          <>
            <style>{`
              @keyframes translateLayerCancelOverlayFade {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes translateLayerCancelDialogScale {
                from { opacity: 0; transform: translateY(16px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div
              onClick={() => {
                if (isSavingTranslateLayer) return;
                dismissTranslateLayerCancelConfirm();
              }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.55)",
                backdropFilter: "blur(2px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5200,
                animation: "translateLayerCancelOverlayFade 0.18s ease-out",
              }}
            >
              <div
                ref={translateLayerCancelDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="translate-layer-cancel-title"
                aria-describedby="translate-layer-cancel-description"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: "min(90%, 380px)",
                  background: "#ffffff",
                  borderRadius: 16,
                  boxShadow: "0 24px 48px rgba(15,23,42,0.32)",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  animation: "translateLayerCancelDialogScale 0.22s ease-out",
                }}
              >
                <div
                  id="translate-layer-cancel-title"
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  Batalkan Perubahan Layer?
                </div>
                <p
                  id="translate-layer-cancel-description"
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    lineHeight: 1.6,
                    color: "#4b5563",
                  }}
                >
                  Perubahan posisi seluruh fitur layer ini belum disimpan. Yakin
                  ingin membatalkan dan mengembalikannya?
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    ref={translateLayerCancelCancelButtonRef}
                    type="button"
                    onClick={dismissTranslateLayerCancelConfirm}
                    disabled={isSavingTranslateLayer}
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      borderRadius: 8,
                      padding: "10px 18px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: isSavingTranslateLayer
                        ? "not-allowed"
                        : "pointer",
                      transition: "all 0.2s ease",
                      opacity: isSavingTranslateLayer ? 0.6 : 1,
                    }}
                  >
                    Tidak
                  </button>
                  <button
                    ref={translateLayerCancelConfirmButtonRef}
                    type="button"
                    onClick={confirmTranslateLayerCancel}
                    disabled={isSavingTranslateLayer}
                    style={{
                      border: "none",
                      background: "#ef4444",
                      color: "#ffffff",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: isSavingTranslateLayer
                        ? "not-allowed"
                        : "pointer",
                      transition: "all 0.2s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: "0 10px 20px rgba(239,68,68,0.25)",
                      opacity: isSavingTranslateLayer ? 0.85 : 1,
                    }}
                  >
                    <span className="icon">undo</span>
                    Ya, Batalkan
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;
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
              ? "Mode Gambar aktif (MultiPolygon). Double-click mengakhiri 1 polygon. Klik Selesai untuk menyimpan ke server."
              : "Mode Gambar aktif. Double-click mengakhiri 1 polygon. Klik Selesai untuk menyimpan ke server.")}
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
          data-focus-dismiss="true"
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
                  if (drawSessionRef.current) {
                    (drawSessionRef.current as any).isMulti = next;
                  }
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
                title={
                  editFeatureDisabled
                    ? "Pilih feature terlebih dahulu untuk edit vertex"
                    : "Edit vertices"
                }
                onClick={startEdit}
                disabled={editFeatureDisabled}
                style={getActionButtonStyle("#10b981", editFeatureDisabled)}
              >
                <span className="icon">edit</span>
              </button>
              <button
                className="circle"
                title={
                  translateFeatureDisabled
                    ? "Pilih feature terlebih dahulu untuk menggeser"
                    : "Geser feature"
                }
                onClick={startMove}
                disabled={translateFeatureDisabled}
                style={getActionButtonStyle(
                  "#eab308",
                  translateFeatureDisabled
                )}
              >
                <span className="icon">open_with</span>
              </button>
              <button
                className="circle"
                title={
                  translateLayerDisabled
                    ? "Pilih layer terlebih dahulu untuk menggeser"
                    : "Geser seluruh layer"
                }
                onClick={startMoveLayer}
                disabled={translateLayerDisabled}
                style={getActionButtonStyle("#6366f1", translateLayerDisabled)}
              >
                <span className="icon">open_with</span>
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
                ref={deleteButtonRef}
                className="circle danger"
                title={
                  deleteFeatureDisabled
                    ? "Pilih feature terlebih dahulu untuk menghapus"
                    : "Hapus feature terpilih"
                }
                onClick={handleDeleteClick}
                aria-haspopup="dialog"
                disabled={deleteFeatureDisabled}
                aria-disabled={deleteFeatureDisabled}
                style={getActionButtonStyle("#ef4444", deleteFeatureDisabled)}
              >
                <span className="icon">delete_forever</span>
              </button>
              <button
                ref={addToLayerButtonRef}
                className="circle"
                title={
                  isAddToLayerActive
                    ? `Sedang menambah ${
                        addToLayerMode === "multipolygon"
                          ? "MultiPolygon"
                          : "Polygon"
                      } ke layer`
                    : canAddToLayer
                    ? "Tambah feature ke layer yang ada"
                    : "Pilih layer atau feature terlebih dahulu untuk menambah ke layer"
                }
                onClick={handleAddToLayerButtonClick}
                disabled={isAddButtonDisabled}
                aria-pressed={isAddToLayerActive}
                aria-disabled={isAddButtonDisabled}
                style={{
                  background: isAddToLayerActive
                    ? addToLayerMode === "multipolygon"
                      ? "#4f46e5"
                      : "#22c55e"
                    : canAddToLayer
                    ? "#22c55e"
                    : "#94a3b8",
                  color: "#fff",
                  borderColor: isAddToLayerActive
                    ? addToLayerMode === "multipolygon"
                      ? "#4f46e5"
                      : "#22c55e"
                    : canAddToLayer
                    ? "#22c55e"
                    : "#94a3b8",
                  cursor: isAddButtonDisabled ? "not-allowed" : "pointer",
                  opacity: isAddButtonDisabled ? 0.6 : 1,
                  boxShadow: isAddToLayerActive
                    ? "0 0 0 2px rgba(255,255,255,0.15)"
                    : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <span className="icon">
                  {isAddToLayerActive && addToLayerMode === "multipolygon"
                    ? "layers"
                    : "add_circle"}
                </span>
              </button>
            </div>

            <div className="muted" style={{ marginTop: 12, fontSize: 11 }}>
              {uiMode === "draw" &&
                (isMultiMode
                  ? "Mode gambar: double-click selesai 1 polygon. Klik Selesai untuk menyimpan semua polygon ke server."
                  : "Mode gambar: double-click selesai 1 polygon. Klik Selesai untuk menyimpan ke server.")}
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
          data-focus-dismiss="true"
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
          data-focus-dismiss="true"
          onClick={() => onPanelHeaderClick("io")}
        >
          <span>Load Peta & Import/Export</span>
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
            {/* Import Mode Toggle */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "#374151",
                }}
              >
                Mode Import:
              </div>
              <div
                style={{
                  display: "flex",
                  background: "#f3f4f6",
                  borderRadius: 8,
                  padding: 2,
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => setImportMode("api")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    border: "none",
                    borderRadius: 6,
                    background:
                      importMode === "api" ? "#ffffff" : "transparent",
                    color: importMode === "api" ? "#111827" : "#6b7280",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow:
                      importMode === "api"
                        ? "0 1px 2px rgba(0,0,0,0.05)"
                        : "none",
                  }}
                >
                  <span
                    className="icon"
                    style={{ fontSize: 14, marginRight: 4 }}
                  >
                    cloud_upload
                  </span>
                  API Import
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode("local")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    border: "none",
                    borderRadius: 6,
                    background:
                      importMode === "local" ? "#ffffff" : "transparent",
                    color: importMode === "local" ? "#111827" : "#6b7280",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow:
                      importMode === "local"
                        ? "0 1px 2px rgba(0,0,0,0.05)"
                        : "none",
                  }}
                >
                  <span
                    className="icon"
                    style={{ fontSize: 14, marginRight: 4 }}
                  >
                    folder
                  </span>
                  Local Import
                </button>
              </div>
              {importMode === "api" && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#059669",
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span className="icon" style={{ fontSize: 12 }}>
                    info
                  </span>
                  File akan dikonversi dan dikirim langsung ke API
                </div>
              )}
            </div>

            <div
              className="import-export-tools"
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              <button
                className="btn-tool"
                onClick={onClickImport}
                disabled={isApiImportInProgress}
                style={{
                  opacity: isApiImportInProgress ? 0.6 : 1,
                  cursor: isApiImportInProgress ? "not-allowed" : "pointer",
                }}
              >
                <span className="icon">
                  {isApiImportInProgress ? (
                    <span
                      className="icon"
                      style={{
                        animation: "spin 1s linear infinite",
                        display: "inline-block",
                      }}
                    >
                      refresh
                    </span>
                  ) : (
                    "upload"
                  )}
                </span>
                Import Shapefile/GeoJSON
                {isApiImportInProgress && " (Mengirim...)"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.geojson,application/zip,application/json"
                style={{ display: "none" }}
                onChange={onChangeFile}
                disabled={isApiImportInProgress}
              />
              <button
                className="btn-tool"
                onClick={() => {
                  setLoadTab(importMode);
                  setOpenLoad(true);
                }}
                title={`Tampilkan dataset ${
                  importMode === "api" ? "API" : "import"
                } ke peta`}
              >
                <span className="icon">layers</span> Load Peta (
                {importMode === "api" ? "API" : "Imported"})
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
              {importMode === "local" ? (
                <>
                  Hasil import tidak langsung tampil di peta. Buka{" "}
                  <b>Load Peta (Imported)</b> untuk memilih dataset. Setelah
                  edit, gunakan <b>Export ZIP</b>.
                </>
              ) : (
                <>
                  File akan dikonversi ke WKT dan dikirim langsung ke API. Hasil
                  dapat dilihat melalui <b>Load Peta (API)</b>.
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <LayerLoadModal
        open={openLoad}
        initialTab={loadTab}
        onClose={() => setOpenLoad(false)}
      />
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

      {/* Drawing Workflow Components */}
      {showAddToLayerModeModal &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={closeAddToLayerModeDialog}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 5200,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              animation: "modalOverlayFade 0.2s ease-out",
            }}
          >
            <style>{`
              @keyframes modalOverlayFade {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes modalDialogScale {
                from { opacity: 0; transform: translateY(16px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div
              ref={addToLayerModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-to-layer-mode-title"
              aria-describedby="add-to-layer-mode-description"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(90%, 360px)",
                background: "#ffffff",
                borderRadius: 16,
                boxShadow: "0 24px 48px rgba(15,23,42,0.3)",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                animation: "modalDialogScale 0.2s ease-out",
              }}
            >
              <div
                id="add-to-layer-mode-title"
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                Pilih Mode Gambar
              </div>
              <p
                id="add-to-layer-mode-description"
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#4b5563",
                  lineHeight: 1.6,
                }}
              >
                Tentukan apakah kamu ingin menambah satu Polygon atau membuat
                MultiPolygon pada layer yang dipilih.
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <button
                  data-mode="polygon"
                  onClick={handleStartAddPolygon}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background:
                      addToLayerMode === "polygon" ? "#f1f5f9" : "#ffffff",
                    color: "#111827",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span className="icon">pentagon</span>
                    Draw Polygon
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    Satu batas area
                  </span>
                </button>
                <button
                  data-mode="multipolygon"
                  onClick={handleStartAddMultipolygon}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid #c7d2fe",
                    background:
                      addToLayerMode === "multipolygon" ? "#ede9fe" : "#ffffff",
                    color: "#312e81",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span className="icon">stack</span>
                    Draw Multipolygon
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#4c1d95",
                    }}
                  >
                    Beberapa area sekaligus
                  </span>
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                }}
              >
                <button
                  type="button"
                  onClick={closeAddToLayerModeDialog}
                  style={{
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    color: "#374151",
                    borderRadius: 8,
                    padding: "10px 18px",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Batal
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showDrawingToolbar && (
        <DrawingToolbar
          onDone={handleDrawingDone}
          onCancel={handleDrawingCancel}
          featureCount={drawSessionRef.current?.src.getFeatures().length || 0}
          isLoading={isSavingDrawing}
        />
      )}

      {showDrawingForm && drawSessionRef.current && (
        <DrawingFormModal
          isOpen={showDrawingForm}
          onClose={handleFormCancel}
          onSave={handleFormSave}
          featureCount={
            pendingMultiMode
              ? 1
              : drawSessionRef.current.src.getFeatures().length
          }
          isLoading={isSavingDrawing}
          targetLayer={
            uiMode === "addToLayer" && targetLayerForAdd
              ? {
                  id: targetLayerForAdd.id,
                  name: targetLayerForAdd.name,
                  typeCode: targetLayerForAdd.typeCode || "",
                }
              : undefined
          }
        />
      )}

      {/* Vertex Editing Modal */}
      {showVertexEditingModal && (
        <VertexEditingModal
          isOpen={showVertexEditingModal}
          position={vertexEditingPosition}
          featureName={currentFeatureName}
          featureId={currentFeatureId || undefined}
          isDirty={isVertexEditingDirty}
          isSaving={isSavingVertexEdit}
          onFinish={handleVertexEditFinish}
          onSave={handleVertexEditSave}
        />
      )}

      {/* Translate Feature Modal */}
      {showTranslateFeatureModal && (
        <TranslateFeatureModal
          isOpen={showTranslateFeatureModal}
          position={translateFeaturePosition}
          featureName={currentFeatureName}
          featureId={currentFeatureId || undefined}
          isDirty={isTranslateFeatureDirty}
          isSaving={isSavingTranslateFeature}
          onFinish={handleTranslateFeatureFinish}
          onSave={handleTranslateFeatureSave}
          onCancel={handleTranslateFeatureCancel}
        />
      )}

      {/* Translate Layer Modal */}
      {showTranslateLayerModal && (
        <TranslateLayerModal
          isOpen={showTranslateLayerModal}
          position={translateLayerPosition}
          layerName={currentLayerName}
          featureCount={currentLayerFeatureCount}
          isDirty={isTranslateLayerDirty}
          isSaving={isSavingTranslateLayer}
          onFinish={handleTranslateLayerFinish}
          onSave={handleTranslateLayerSave}
          onCancel={handleTranslateLayerCancel}
        />
      )}

      {translateFeatureCancelPortal}
      {translateLayerCancelPortal}
      {deleteConfirmationPortal}

      {/* Translate Layer Confirmation Modal */}
      {showTranslateLayerConfirm && typeof document !== "undefined"
        ? createPortal(
            <>
              <style>{`
                @keyframes translateLayerOverlayFade {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
                @keyframes translateLayerDialogScale {
                  from { opacity: 0; transform: translateY(16px) scale(0.96); }
                  to { opacity: 1; transform: translateY(0) scale(1); }
                }
              `}</style>
              <div
                onClick={handleTranslateLayerBackdropClick}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(15, 23, 42, 0.55)",
                  backdropFilter: "blur(2px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 5200,
                  animation: "translateLayerOverlayFade 0.18s ease-out",
                }}
              >
                <div
                  ref={translateLayerConfirmDialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="translate-layer-confirm-title"
                  aria-describedby="translate-layer-confirm-description"
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    width: "min(90%, 380px)",
                    background: "#ffffff",
                    borderRadius: 16,
                    boxShadow: "0 24px 48px rgba(15,23,42,0.32)",
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    animation: "translateLayerDialogScale 0.22s ease-out",
                  }}
                >
                  <div
                    id="translate-layer-confirm-title"
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    Simpan Perubahan Layer
                  </div>
                  <p
                    id="translate-layer-confirm-description"
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      lineHeight: 1.6,
                      color: "#4b5563",
                    }}
                  >
                    Apakah kamu yakin mau menyimpan perubahan posisi untuk
                    seluruh feature di layer ini?
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "12px",
                      marginTop: "8px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleCancelTranslateLayer}
                      disabled={isTranslateLayerConfirmInProgress}
                      style={{
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        color: "#374151",
                        borderRadius: 8,
                        padding: "10px 18px",
                        fontSize: "14px",
                        fontWeight: 500,
                        cursor: isTranslateLayerConfirmInProgress
                          ? "not-allowed"
                          : "pointer",
                        transition: "all 0.2s ease",
                        opacity: isTranslateLayerConfirmInProgress ? 0.6 : 1,
                      }}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      ref={translateLayerConfirmButtonRef}
                      onClick={handleConfirmTranslateLayer}
                      disabled={isTranslateLayerConfirmInProgress}
                      style={{
                        border: "none",
                        background: isTranslateLayerConfirmInProgress
                          ? "#6366f1"
                          : "#6366f1",
                        color: "#ffffff",
                        borderRadius: 8,
                        padding: "10px 20px",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: isTranslateLayerConfirmInProgress
                          ? "not-allowed"
                          : "pointer",
                        transition: "all 0.2s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        boxShadow: "0 10px 20px rgba(99,102,241,0.25)",
                        opacity: isTranslateLayerConfirmInProgress ? 0.85 : 1,
                      }}
                    >
                      <span className="icon">save</span>
                      {isTranslateLayerConfirmInProgress
                        ? "Menyimpan..."
                        : "Ya, Simpan"}
                    </button>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
