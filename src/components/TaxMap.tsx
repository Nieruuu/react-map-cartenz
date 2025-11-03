// src/components/TaxMap.tsx
import { useEffect, useRef } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat, toLonLat } from "ol/proj";
import Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import type {
  Feature as GeoJSONFeature,
  FeatureCollection as GeoJSONFeatureCollection,
  Geometry as GeoJSONGeometry,
} from "geojson";
import "ol/ol.css";
import {
  getCenter,
  createEmpty as createEmptyExtent,
  extend as extendExtent,
  isEmpty as isEmptyExtent,
} from "ol/extent";
import Geometry from "ol/geom/Geometry";
import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
// import shp from "shpjs";

import { useMapStore } from "../hooks/useMapStore";
import { styleFromCfg, useLayersStore } from "../hooks/useLayersStore";
import { useMetadataEditor } from "../hooks/useMetadataEditor";
import { useAppLoading } from "../hooks/useLoadingState";
import type {
  SpatialFeature,
  SpatialFeatureAttribute,
} from "../lib/api/spatialFeature";

// const ADMIN_SRC = "/data/5103.zip";
const INITIAL_CENTER = fromLonLat([115.178, -8.5]);
const INITIAL_ZOOM = 10;

type Kind = "kabupaten" | "kecamatan" | "kelurahan" | "custom";

/* registry kecil utk dataset import */
const REGKEY = "__taxmap_dataset_registry__";
function ensureRegistry(): Map<
  string,
  {
    key: string;
    name: string;
    kind: Kind;
    fc: any;
    ts: number;
    count: number;
    meta?: Record<string, any>;
  }
> {
  const g: any = window as any;
  if (!g[REGKEY] || !(g[REGKEY] instanceof Map)) g[REGKEY] = new Map();
  return g[REGKEY] as Map<string, any>;
}

type Position2D = [number, number];
type LinearRing2D = Position2D[];
type PolygonCoords2D = LinearRing2D[];
type MultiPolygonCoords2D = PolygonCoords2D[];

/* ==== Sampel koordinat dari FC untuk heuristik urutan XY/YX ==== */
function sampleCoordsFromFC(
  fc: GeoJSONFeatureCollection,
  max = 100
): number[][] {
  const samples: number[][] = [];
  if (!fc || !Array.isArray(fc.features)) return samples;

  const pushCoord = (coord: any) => {
    if (!Array.isArray(coord) || coord.length < 2) return;
    const x = Number(coord[0]);
    const y = Number(coord[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    samples.push([x, y]);
  };

  const visitCoords = (coords: any) => {
    if (!Array.isArray(coords) || samples.length >= max) return;
    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      pushCoord(coords);
      return;
    }
    for (const part of coords) {
      if (samples.length >= max) break;
      visitCoords(part);
    }
  };

  const visitGeometry = (geom: GeoJSONGeometry | null | undefined) => {
    if (!geom) return;
    if (geom.type === "GeometryCollection") {
      const geoms = Array.isArray(geom.geometries) ? geom.geometries : [];
      for (const part of geoms) {
        if (samples.length >= max) break;
        visitGeometry(part as GeoJSONGeometry);
      }
      return;
    }
    visitCoords((geom as any).coordinates);
  };

  for (const feature of fc.features) {
    if (samples.length >= max) break;
    visitGeometry(feature?.geometry as GeoJSONGeometry);
  }
  return samples;
}

/* ==== swap koordinat deep untuk fallback ==== */
function swapCoordinatesDeep(coords: any): any {
  if (!Array.isArray(coords)) return coords;
  if (
    coords.length >= 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    const rest = coords.length > 2 ? coords.slice(2) : [];
    return [coords[1], coords[0], ...rest];
  }
  return coords.map((part: any) => swapCoordinatesDeep(part));
}

function swapGeometryCoordinates(
  geom: GeoJSONGeometry | null | undefined
): GeoJSONGeometry | null {
  if (!geom) return null;
  if (geom.type === "GeometryCollection") {
    const geoms = Array.isArray(geom.geometries) ? geom.geometries : [];
    return {
      type: "GeometryCollection",
      geometries: geoms
        .map((g) => swapGeometryCoordinates(g as GeoJSONGeometry))
        .filter(Boolean) as GeoJSONGeometry[],
    };
  }
  if ("coordinates" in geom) {
    return {
      ...geom,
      coordinates: swapCoordinatesDeep((geom as any).coordinates),
    } as GeoJSONGeometry;
  }
  return geom;
}

/* ==== toleransi angka ==== */
function almostEq(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

/* ==== pembaca koordinat generik: [x,y], typed array, atau {x,y}/{lon,lat} ==== */
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
    const x = Number(source[i]);
    const y = Number(source[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    coords.push([x, y]);
  }
  return coords;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readCoordinate(candidate: any): [number, number] | null {
  // typed array of numbers
  if (isTypedNumericArray(candidate) && candidate.length >= 2) {
    const x = toFiniteNumber(candidate[0]);
    const y = toFiniteNumber(candidate[1]);
    return x == null || y == null ? null : [x, y];
  }
  // plain array [x,y]
  if (Array.isArray(candidate) && candidate.length >= 2) {
    const x = toFiniteNumber(candidate[0]);
    const y = toFiniteNumber(candidate[1]);
    return x == null || y == null ? null : [x, y];
  }
  // object {x,y} / {lon,lat}
  if (candidate && typeof candidate === "object") {
    const o = candidate as Record<string, unknown>;
    const x =
      toFiniteNumber(o.x) ??
      toFiniteNumber((o as any).X) ??
      toFiniteNumber((o as any).lon) ??
      toFiniteNumber((o as any).longitude);
    const y =
      toFiniteNumber(o.y) ??
      toFiniteNumber((o as any).Y) ??
      toFiniteNumber((o as any).lat) ??
      toFiniteNumber((o as any).latitude);
    if (x != null && y != null) return [x, y];
  }
  return null;
}

/* ==== normalisasi ring/rings==== */
function normalizeRing(raw: any): LinearRing2D | null {
  // raw bisa array koordinat, atau typed array of pairs
  const source: any[] = Array.isArray(raw)
    ? raw
    : isTypedNumericArray(raw)
    ? expandNumericPairs(raw)
    : [];

  if (!source.length) return null;

  const ring: LinearRing2D = [];
  let prev: Position2D | null = null;

  for (const candidate of source) {
    const coord = readCoordinate(candidate);
    if (!coord) continue;
    if (prev && almostEq(prev[0], coord[0]) && almostEq(prev[1], coord[1])) {
      continue;
    }
    ring.push([coord[0], coord[1]]);
    prev = coord;
  }

  if (ring.length < 3) return null;

  // minimal 3 titik unik
  const unique = new Set(ring.map((pt) => `${pt[0]}|${pt[1]}`));
  if (unique.size < 3) return null;

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!(almostEq(first[0], last[0]) && almostEq(first[1], last[1]))) {
    ring.push([first[0], first[1]]);
  } else {
    // keep last as-is
    ring[ring.length - 1] = [last[0], last[1]];
  }

  if (ring.length < 4) return null;
  return ring;
}

function normalizePolygonCoords(raw: any): PolygonCoords2D | null {
  const sources: any[] = Array.isArray(raw)
    ? raw
    : isTypedNumericArray(raw)
    ? [raw] // flat typed array of XYXY...
    : [];
  if (!sources.length) return null;

  const rings: PolygonCoords2D = [];
  for (const candidate of sources) {
    // jika typed array datar, expand dulu jadi pasangan [x,y]
    const ringInput = isTypedNumericArray(candidate)
      ? expandNumericPairs(candidate)
      : candidate;
    const ring = normalizeRing(ringInput);
    if (ring) rings.push(ring);
  }
  return rings.length ? rings : null;
}

/* ==== normalizeGeometry: paham Polygon/MultiPolygon/GeometryCollection, rings, PolygonZ ==== */
function normalizeGeometry(
  geom: GeoJSONGeometry | null | undefined
):
  | { type: "Polygon"; coordinates: PolygonCoords2D }
  | { type: "MultiPolygon"; coordinates: MultiPolygonCoords2D }
  | null {
  if (!geom) return null;

  const rawType = typeof geom.type === "string" ? geom.type : "";
  const lc = rawType.toLowerCase();

  const isPolygon = lc.startsWith("polygon"); // polygon, polygonz, polygonm...
  const isMultiPolygon = lc.startsWith("multipolygon");
  const isGeomColl = lc.startsWith("geometrycollection");

  if (isGeomColl) {
    const geoms = Array.isArray((geom as any).geometries)
      ? (geom as any).geometries
      : [];
    const collected: PolygonCoords2D[] = [];
    for (const part of geoms) {
      const n = normalizeGeometry(part as GeoJSONGeometry);
      if (!n) continue;
      if (n.type === "Polygon") collected.push(n.coordinates);
      else collected.push(...n.coordinates);
    }
    if (!collected.length) return null;
    if (collected.length === 1) {
      return { type: "Polygon", coordinates: collected[0] };
    }
    return { type: "MultiPolygon", coordinates: collected };
  }

  if (isPolygon) {
    // coordinates biasa, atau ESRI rings, atau typed array datar
    const coordsSource =
      Array.isArray((geom as any).coordinates) &&
      (geom as any).coordinates.length
        ? (geom as any).coordinates
        : Array.isArray((geom as any).rings)
        ? (geom as any).rings
        : isTypedNumericArray((geom as any).coordinates)
        ? [(geom as any).coordinates]
        : [];
    const rings = normalizePolygonCoords(coordsSource);
    return rings ? { type: "Polygon", coordinates: rings } : null;
  }

  if (isMultiPolygon) {
    const polysSrc = Array.isArray((geom as any).coordinates)
      ? (geom as any).coordinates
      : [];
    const polys: PolygonCoords2D[] = [];
    for (const poly of polysSrc) {
      const rings = normalizePolygonCoords(poly);
      if (rings && rings.length) polys.push(rings);
    }
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }

  return null;
}

/* ==== builder manual OL Feature dari GeoJSON normalisasi ==== */
function manualBuildFeatures(
  baseFC: GeoJSONFeatureCollection,
  order: "xy" | "yx",
  asDegrees: boolean
): Feature<Geometry>[] {
  const features: Feature<Geometry>[] = [];
  const swap = order === "yx";

  const projectPoint = (coord: Position2D): Position2D | null => {
    const raw: Position2D = swap ? [coord[1], coord[0]] : [coord[0], coord[1]];
    if (asDegrees) {
      const projected = fromLonLat(raw);
      if (!Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) {
        return null;
      }
      return [projected[0], projected[1]];
    }
    return raw;
  };

  const projectRing = (ring: LinearRing2D): LinearRing2D | null => {
    const projected: LinearRing2D = [];
    let prev: Position2D | null = null;
    for (const coord of ring) {
      const pj = projectPoint(coord);
      if (!pj) continue;
      if (prev && almostEq(prev[0], pj[0]) && almostEq(prev[1], pj[1]))
        continue;
      projected.push(pj);
      prev = pj;
    }
    if (projected.length < 3) return null;
    const first = projected[0];
    const last = projected[projected.length - 1];
    if (!(almostEq(first[0], last[0]) && almostEq(first[1], last[1]))) {
      projected.push([first[0], first[1]]);
    }
    if (projected.length < 4) return null;

    return projected;
  };

  for (const feature of baseFC.features || []) {
    const normalized = normalizeGeometry(feature?.geometry as GeoJSONGeometry);
    if (!normalized) continue;
    const props =
      feature && typeof feature === "object"
        ? { ...(feature.properties || {}) }
        : {};

    if (normalized.type === "Polygon") {
      const rings = normalized.coordinates
        .map((ring) => projectRing(ring))
        .filter((ring): ring is LinearRing2D => Boolean(ring));
      if (!rings.length) continue;
      const geom = new Polygon(rings);
      const ft = new Feature(geom);
      ft.setProperties(props);
      if (
        feature &&
        typeof feature === "object" &&
        "id" in feature &&
        (feature as any).id != null
      ) {
        ft.setId((feature as any).id);
      }
      features.push(ft);
    } else {
      const polys: PolygonCoords2D[] = [];
      for (const poly of normalized.coordinates) {
        const projected = poly
          .map((ring) => projectRing(ring))
          .filter((ring): ring is LinearRing2D => Boolean(ring));
        if (projected.length) polys.push(projected);
      }
      if (!polys.length) continue;
      const geom = new MultiPolygon(polys);
      const ft = new Feature(geom);
      ft.setProperties(props);
      if (
        feature &&
        typeof feature === "object" &&
        "id" in feature &&
        (feature as any).id != null
      ) {
        ft.setId((feature as any).id);
      }
      features.push(ft);
    }
  }

  return features;
}

/* ==== filter valid extent longgar ==== */
function requireValid(features: Feature<Geometry>[]): Feature<Geometry>[] {
  const eps = 1e-6; // toleransi
  return features.filter((ft) => {
    const geom = ft.getGeometry?.();
    if (!geom) return false;
    const [minX, minY, maxX, maxY] = geom.getExtent();
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    )
      return false;
    const w = Math.abs(maxX - minX);
    const h = Math.abs(maxY - minY);
    return w > eps && h > eps;
  });
}

/* ==== utils tampilan ==== */
function hexToRgba(hex: string, alpha = 1) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function assignFeatureMetadata(features: Feature<Geometry>[]) {
  const idKeys = [
    "D_KD_DT2",
    "KD_KEL",
    "KD_DESA",
    "D_KD_KEL",
    "kd_kel",
    "D_KD_KEC",
    "KD_KEC",
    "kd_kec",
    "KD_KAB",
    "KD_KABKOT",
    "KD_KK",
    "kd_kab",
    "id",
    "ID",
    "OBJECTID",
    "OBJECTID_1",
    "KODE",
    "NO",
    "FID",
  ];
  const nameKeys = [
    "D_NM_DT2",
    "NAMA_KEL",
    "NM_KEL",
    "D_NM_KEL",
    "nm_kel",
    "NAMA_DESA",
    "NM_DESA",
    "NAMA_KEC",
    "NM_KEC",
    "D_NM_KEC",
    "KECAMATAN",
    "Kecamatan",
    "WADMKC",
    "nm_kec",
    "NAMA_KAB",
    "NM_KAB",
    "WADMKD",
    "KABUPATEN",
    "Kabupaten",
    "NAMA",
    "name",
    "NAME",
  ];
  const hasLetters = (value: unknown): boolean =>
    typeof value === "string" && value.trim() !== "" && /[A-Za-z]/.test(value);

  features.forEach((feature, index) => {
    const props = feature.getProperties ? feature.getProperties() : {};

    let idValue =
      idKeys
        .map((key) => (props as any)?.[key])
        .find(
          (value) =>
            value !== undefined && value !== null && String(value) !== ""
        ) ?? `feat_${index}`;
    feature.set("id", String(idValue));

    let nameValue = nameKeys
      .map((key) => (props as any)?.[key])
      .find(hasLetters);
    if (!nameValue) {
      const dynamicKey = Object.keys(props || {}).find((key) =>
        /kec|kel|desa|kab|nama|name/i.test(key)
      );
      const dynamicValue = dynamicKey ? (props as any)[dynamicKey] : undefined;
      if (hasLetters(dynamicValue)) {
        nameValue = dynamicValue;
      }
    }

    if (nameValue) {
      feature.set("name", String(nameValue).trim());
    }
  });
}
function makeBaseSource(kind: string) {
  switch (kind) {
    case "osm_carto_light":
      return new XYZ({
        url: "https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        attributions: "(c) OpenStreetMap (c) CARTO",
        maxZoom: 20,
      });
    case "esri_street":
      return new XYZ({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        attributions: "Tiles (c) Esri",
        maxZoom: 20,
      });
    case "esri_sat":
      return new XYZ({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attributions: "Tiles (c) Esri",
        maxZoom: 20,
      });
    case "xyz_terrain":
      return new XYZ({
        url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
        attributions: "(c) OpenStreetMap contributors, SRTM",
        maxZoom: 17,
      });
    case "osm":
    default:
      return new OSM();
  }
}
function niceScaleText(resolution: number) {
  const meters = resolution * 100;
  const steps = [1, 2, 5];
  let pow = 0;
  let val = meters;
  while (val >= 10) {
    val /= 10;
    pow += 1;
  }
  const base = steps.reduce((a, b) =>
    Math.abs(b - val) < Math.abs(a - val) ? b : a
  );
  const scaled = base * Math.pow(10, pow);
  if (scaled >= 1000) {
    const km = scaled / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${scaled.toFixed(0)} m`;
}
function featureName(f: any): string | undefined {
  const props = f?.getProperties ? f.getProperties() : {};
  const keys = [
    "D_NM_DT2",
    "D_NM_KEC",
    "name",
    "NAME",
    "KECAMATAN",
    "Kecamatan",
    "WADMKC",
    "NAMA_KEC",
    "NAMA",
    "nm_kec",
    "WADMKD",
    "NAMA_KEL",
    "NM_KEL",
    "NAMA_DESA",
    "NM_DESA",
    "NAMA_KAB",
    "NM_KAB",
  ];
  for (const k of keys) {
    const v = (props as any)?.[k];
    if (typeof v === "string" && v.trim() !== "" && /[A-Za-z]/.test(v))
      return v.trim();
  }
  const dynKey = Object.keys(props || {}).find((k) =>
    /kec|kel|desa|kab|nama|name/i.test(k)
  );
  const dynVal = dynKey ? (props as any)[dynKey] : undefined;
  if (
    typeof dynVal === "string" &&
    dynVal.trim() !== "" &&
    /[A-Za-z]/.test(dynVal)
  )
    return dynVal.trim();
  return undefined;
}
function bestPointForStreetView(geom: Geometry): [number, number] {
  if (geom instanceof Polygon)
    return geom.getInteriorPoint().getCoordinates() as [number, number];
  if (geom instanceof MultiPolygon) {
    let best: [number, number] | null = null;
    let maxA = -Infinity;
    geom.getPolygons().forEach((p) => {
      const a = Math.abs(p.getArea());
      if (a > maxA) {
        maxA = a;
        best = p.getInteriorPoint().getCoordinates() as [number, number];
      }
    });
    if (best) return best;
  }
  return getCenter(geom.getExtent()) as [number, number];
}

/* ==== alias sinkronisasi ==== */
const CODE_KEYS = [
  "D_KD_DT2",
  "D_KD_KEL",
  "KD_KEL",
  "kd_kel",
  "D_KD_KEC",
  "KD_KEC",
  "kd_kec",
  "KD_KAB",
  "kd_kab",
  "KD_KABKOT",
  "KODE",
  "id",
  "ID",
];
const NAME_KEYS = [
  "D_NM_DT2",
  "D_NM_KEL",
  "NM_KEL",
  "NAMA_KEL",
  "nm_kel",
  "NAMA_DESA",
  "NM_DESA",
  "D_NM_KEC",
  "NM_KEC",
  "NAMA_KEC",
  "KECAMATAN",
  "Kecamatan",
  "WADMKC",
  "nm_kec",
  "NAMA_KAB",
  "NM_KAB",
  "WADMKD",
  "KABUPATEN",
  "Kabupaten",
  "name",
  "NAME",
  "NAMA",
];

export default function TaxMap() {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const geojsonFmtRef = useRef<GeoJSON | null>(null);

  const modifyRef = useRef<Modify | null>(null);
  const selectRef = useRef<Select | null>(null);
  const isBusyRef = useRef(false);

  const autoLoadOnceRef = useRef(false);
  const hoverStateRef = useRef({
    moving: false,
    rafId: 0 as number | 0,
    lastPx: [-9999, -9999] as [number, number],
  });

  const {
    baseLayer,
    selectedId,
    setSelectedId,
    hoveredId,
    setHoveredId,
    setZoomAndScale,
    setFocus,
    selectLayer,
  } = useMapStore();
  const setLayersMap = useLayersStore((s) => s.setMap);
  const addLayerToMgr = useLayersStore((s) => s.addLayer);
  const topFirst = useLayersStore((s) => s.topFirst);

  // Mount metadata editor hook to handle API-based feature updates
  const metadataEditor = useMetadataEditor();

  // Loading state management
  const { startLoading, updateProgress, finishLoading, showError } =
    useAppLoading();

  useEffect(() => {
    if (!mapDiv.current) return;

    const base = new TileLayer({ source: makeBaseSource(baseLayer || "osm") });
    baseLayerRef.current = base;

    const map = new OlMap({
      target: mapDiv.current,
      layers: [base],
      view: new View({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM }),
    });
    mapRef.current = map;
    setLayersMap(map);
    geojsonFmtRef.current = new GeoJSON();

    map.on("movestart", () => (hoverStateRef.current.moving = true));
    map.on("moveend", () => (hoverStateRef.current.moving = false));

    // Listener GLOBAL: loncat ke koordinat
    const onGoto = (ev: Event) => {
      const {
        lat,
        lon,
        zoom = 16,
        animate = true,
      } = (ev as CustomEvent<any>).detail || {};
      if (!mapRef.current || !Number.isFinite(lat) || !Number.isFinite(lon))
        return;
      const view = mapRef.current.getView();
      const center = fromLonLat([lon, lat]);
      if (animate) view.animate({ center, zoom, duration: 400 });
      else {
        view.setCenter(center);
        if (typeof zoom === "number") view.setZoom(zoom);
      }
    };
    window.addEventListener("goto-coords", onGoto as any);

    // Fallback callable
    (window as any).__taxmapGoto = (
      lat: number,
      lon: number,
      zoom = 16,
      animate = true
    ) => {
      const view = mapRef.current?.getView();
      if (!view || !(Number.isFinite(lat) && Number.isFinite(lon))) return;
      const center = fromLonLat([lon, lat]);
      if (animate) view.animate({ center, zoom, duration: 400 });
      else {
        view.setCenter(center);
        view.setZoom(zoom);
      }
    };

    // Auto load "Batas Kecamatan Kabupaten Badung" from API
    (async () => {
      if (autoLoadOnceRef.current) return;
      autoLoadOnceRef.current = true;

      try {
        console.log(
          "Loading 'Batas Kecamatan Kabupaten Badung' layer from API..."
        );

        // Start loading with initial message
        startLoading("Menghubungkan ke server...");
        updateProgress(10);

        // Import the load function dynamically to avoid circular dependencies
        const { loadBatasKecamatanKabupatenBadung } = await import(
          "../features/loadFromApi"
        );

        updateProgress(30);
        startLoading("Mengunduh data peta...");

        // Load the layer from API
        const result = await loadBatasKecamatanKabupatenBadung();

        if (!result) {
          console.warn(
            "Failed to load 'Batas Kecamatan Kabupaten Badung' layer from API"
          );
          showError("Gagal memuat data peta dari server. Silakan coba lagi.");
          return;
        }

        updateProgress(70);
        startLoading("Memproses data peta...");

        console.log(
          `Successfully loaded ${result.count} features for '${result.name}' layer`
        );

        // Find the layer that was just added
        const { layers } = useLayersStore.getState();
        const layerEntry = layers.find((l) => l.id === result.id);

        if (!layerEntry) {
          console.error("Layer not found in store after loading");
          showError("Terjadi kesalahan saat memproses data peta.");
          return;
        }

        updateProgress(85);
        startLoading("Menampilkan peta...");

        // Get the source to access features
        const src = layerEntry.layer.getSource();
        if (!src) {
          console.error("Layer source not found");
          showError("Terjadi kesalahan saat memuat layer peta.");
          return;
        }

        const validFeats = src.getFeatures();

        // Safe fit
        const extent = createEmptyExtent();
        validFeats.forEach((ft: any) =>
          extendExtent(extent, ft.getGeometry().getExtent())
        );
        if (!isEmptyExtent(extent)) {
          map.getView().fit(extent, {
            padding: [40, 40, 40, 320],
            duration: 300,
          });
        }

        updateProgress(95);
        startLoading("Menyelesaikan...");

        // Select the first feature and set focus
        const rep = validFeats[0] as any;
        if (rep) {
          const id = String(rep.get("id") || "");
          const name = String(rep.get("name") || "") || featureName(rep) || "-";
          setSelectedId(id);

          const geom = rep.getGeometry() as Geometry;
          const p3857 = bestPointForStreetView(geom);
          const [lon, lat] = toLonLat(p3857);
          const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");
          setFocus({
            id,
            name,
            lon,
            lat,
            layerId: result.id,
            geom: new GeoJSON().writeGeometryObject(geom4326),
          });
          window.dispatchEvent(
            new CustomEvent("highlight-layer-entry", {
              detail: { layerId: result.id, featureId: id },
            })
          );
        }

        // Complete loading
        updateProgress(100);
        setTimeout(() => {
          finishLoading();
        }, 500); // Small delay to show 100% completion
      } catch (error) {
        console.error(
          "Error loading 'Batas Kecamatan Kabupaten Badung' layer from API:",
          error
        );

        // Show user-friendly error message
        const errorMessage =
          error instanceof Error
            ? `Gagal memuat data peta: ${error.message}`
            : "Gagal memuat data peta dari server. Silakan coba lagi.";

        showError(errorMessage);
      }
    })();

    function guessGeographicOrder(coords: number[][], take = 25) {
      let tested = 0,
        okXY = 0,
        okYX = 0;
      for (const c of coords) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const x = Number(c[0]),
          y = Number(c[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        tested++;
        if (Math.abs(x) <= 180 && Math.abs(y) <= 90) okXY++;
        if (Math.abs(y) <= 180 && Math.abs(x) <= 90) okYX++;
        if (tested >= take) break;
      }
      const ratioXY = tested ? okXY / tested : 0;
      const ratioYX = tested ? okYX / tested : 0;
      const asDegrees = Math.max(ratioXY, ratioYX) >= 0.6;
      const prefer: "xy" | "yx" = ratioYX > ratioXY ? "yx" : "xy";
      return { asDegrees, prefer };
    }

    /* LISTENER: Load dataset hasil import */
    const onLoadImportedDataset = (ev: Event) => {
      const detail = (ev as CustomEvent<any>).detail || {};
      const registry = ensureRegistry();
      const { key, fc, name, kind, meta } = detail || {};

      if (!mapRef.current) return;

      const registryItem = key ? registry.get(key) : null;
      const fcSource = ((fc as GeoJSONFeatureCollection | undefined) ??
        (registryItem?.fc as GeoJSONFeatureCollection | undefined)) as
        | GeoJSONFeatureCollection
        | undefined;

      if (!fcSource || !Array.isArray(fcSource.features)) {
        console.warn(
          "Dataset import tidak memiliki FeatureCollection yang valid."
        );
        return;
      }

      const datasetName = (registryItem?.name ||
        name ||
        "Dataset Import") as string;
      const datasetKind = (registryItem?.kind || kind || "custom") as Kind;
      const fileName = (registryItem?.meta?.fileName ||
        meta?.fileName ||
        datasetName) as string;

      const fmt = geojsonFmtRef.current!;

      // 1) Ambil sampel dan tebak sifat data (derajat atau meter) + urutan (xy atau yx)
      const samples = sampleCoordsFromFC(fcSource);
      const g = guessGeographicOrder(samples); // { asDegrees: boolean, prefer: "xy" | "yx" }

      // 2) Jika prefer "yx", siapkan FC yang di-swap; kalau "xy" biarkan apa adanya
      const fcPrefer: GeoJSONFeatureCollection =
        g.prefer === "yx"
          ? {
              ...fcSource,
              features: (fcSource.features || []).map(
                (feat: GeoJSONFeature) => {
                  if (!feat?.geometry) return feat;
                  const swapped = swapGeometryCoordinates(
                    feat.geometry as GeoJSONGeometry
                  );
                  return { ...feat, geometry: swapped ?? feat.geometry };
                }
              ),
            }
          : fcSource;

      // Helper: baca fitur sesuai dugaan derajat/meter
      const adaptiveRead = (
        source: GeoJSONFeatureCollection,
        asDegrees: boolean
      ) => {
        try {
          if (asDegrees) {
            // data kelihatan derajat → transform 4326 → 3857
            return fmt.readFeatures(source, {
              dataProjection: "EPSG:4326",
              featureProjection: "EPSG:3857",
            }) as Feature<Geometry>[];
          }
          // data bukan derajat (meter UTM/TM-3/apa pun) → JANGAN transform dulu
          return fmt.readFeatures(source, {
            dataProjection: "EPSG:3857",
            featureProjection: "EPSG:3857",
          }) as Feature<Geometry>[];
        } catch (e) {
          console.error("adaptiveRead gagal:", e);
          return [];
        }
      };

      // 3) Coba baca dengan kombinasi paling masuk akal
      let features = requireValid(adaptiveRead(fcPrefer, g.asDegrees));

      // 4) Kalau kosong, coba kombinasi kebalikan (swap balik + asumsi proyeksi dibalik)
      if (!features.length) {
        const fcAlt =
          fcPrefer === fcSource
            ? {
                ...fcSource,
                features: (fcSource.features || []).map(
                  (feat: GeoJSONFeature) => {
                    if (!feat?.geometry) return feat;
                    const swapped = swapGeometryCoordinates(
                      feat.geometry as GeoJSONGeometry
                    );
                    return { ...feat, geometry: swapped ?? feat.geometry };
                  }
                ),
              }
            : fcSource;

        features = requireValid(adaptiveRead(fcAlt, !g.asDegrees));
      }

      // 5) Terakhir: manual builder (swap XY/YX + fromLonLat kalau derajat)
      if (!features.length) {
        console.warn(
          "No valid features found after adaptive read, trying manual builder"
        );
        const orders =
          g.prefer === "yx" ? (["yx", "xy"] as const) : (["xy", "yx"] as const);
        for (const order of orders) {
          const manual = manualBuildFeatures(fcSource, order, g.asDegrees);
          const validManual = requireValid(manual);
          if (validManual.length) {
            features = validManual;
            break;
          }
        }
      }

      if (!features.length) {
        console.warn(
          "Semua fitur punya extent kosong setelah import atau manual fallback gagal."
        );
        return;
      }

      assignFeatureMetadata(features);

      const src = new VectorSource({ features });

      const colorByKind: Record<Kind, [string, string]> = {
        kabupaten: ["#f59e0b", "#fbbf24"],
        kecamatan: ["#10b981", "#34d399"],
        kelurahan: ["#8b5cf6", "#a78bfa"],
        custom: ["#0ea5e9", "#22d3ee"],
      };
      const [stroke, fill] = colorByKind[datasetKind] || colorByKind.custom;

      const styleCfg = {
        borderColor: stroke,
        borderOpacity: 1,
        borderStyle: "Solid",
        borderWidth: 1.6,
        fillColor: fill,
        fillOpacity: 0.25,
        labelColor: "#1f2937",
        labelFont: "Arial",
        labelStroke: "#ffffff",
        labelStrokeWidth: 3,
        labelSize: 12,
        labelMode: "nama",
      } as any;

      const lyr = new VectorLayer({
        source: src,
        style: styleFromCfg(styleCfg),
        updateWhileInteracting: true,
        updateWhileAnimating: true,
      });

      const layerId = `${datasetKind}-${Date.now()}`;
      lyr.set("appKind", datasetKind);
      lyr.set("appName", datasetName);

      const fileBase = String(fileName || datasetName).replace(
        /\.(zip|shp|geojson|json)$/i,
        ""
      );
      (lyr as any).set("fileBase", fileBase);

      mapRef.current.addLayer(lyr);

      addLayerToMgr({
        id: layerId,
        name: datasetName,
        kind: datasetKind,
        layer: lyr,
        visible: true,
        styleCfg,
      });

      const unionExtent = createEmptyExtent();
      features.forEach((ft) => {
        const geom = ft.getGeometry();
        if (!geom) return;
        extendExtent(unionExtent, geom.getExtent());
      });

      if (!isEmptyExtent(unionExtent)) {
        mapRef.current
          .getView()
          .fit(unionExtent, { padding: [40, 40, 40, 320], duration: 300 });
      } else {
        console.warn("Layer extent kosong, melewati fit.");
      }
    };

    window.addEventListener(
      "load-imported-dataset",
      onLoadImportedDataset as any
    );

    // Hover
    const onMove = (e: any) => {
      const hs = hoverStateRef.current;
      if (isBusyRef.current || hs.moving) {
        setHoveredId(undefined);
        return;
      }
      const [lx, ly] = hs.lastPx;
      const [x, y] = e.pixel as [number, number];
      if (Math.abs(x - lx) + Math.abs(y - ly) < 6) return;
      hs.lastPx = [x, y];
      if (hs.rafId) cancelAnimationFrame(hs.rafId);
      hs.rafId = requestAnimationFrame(() => {
        let hid: string | undefined;
        const ordered = topFirst();
        for (const le of ordered) {
          if (!le.visible) continue;
          const f = map.forEachFeatureAtPixel(
            e.pixel,
            (ft: any) => {
              hid = String(ft.get("id") || "");
              return true;
            },
            { layerFilter: (L) => L === le.layer, hitTolerance: 2 }
          );
          if (f) break;
        }
        setHoveredId(hid);
      });
    };
    map.on("pointermove", onMove);

    // Click select
    map.on("singleclick", (evt) => {
      if (isBusyRef.current) return;
      const ordered = topFirst();
      let found: any = null;
      let foundLayerId: string | null = null;

      for (const le of ordered) {
        if (!le.visible) continue;
        const f = map.forEachFeatureAtPixel(
          evt.pixel,
          (ft) => {
            found = ft;
            return true;
          },
          { layerFilter: (L) => L === le.layer }
        );
        if (f) {
          foundLayerId = le.id;
          break;
        }
      }

      if (!found) {
        setSelectedId(undefined);
        setFocus(null);
        selectLayer(null);
        return;
      }

      const id = String((found as any).get("id") || "");
      const name =
        String((found as any).get("name") || "") ||
        featureName(found as any) ||
        "-";
      setSelectedId(id);
      if (foundLayerId) {
        selectLayer(foundLayerId);
      }

      const geom = (found as any).getGeometry() as Geometry;
      map
        .getView()
        .fit(geom.getExtent(), { padding: [40, 40, 40, 320], duration: 250 });

      const p3857 = bestPointForStreetView(geom);
      const [lon, lat] = toLonLat(p3857);
      const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");
      setFocus({
        id,
        name,
        lon,
        lat,
        layerId: foundLayerId!,
        geom: new GeoJSON().writeGeometryObject(geom4326),
      });

      if (foundLayerId) {
        window.dispatchEvent(
          new CustomEvent("highlight-layer-entry", {
            detail: { layerId: foundLayerId, featureId: id },
          })
        );
      }
    });

    // Footer scale
    const view = map.getView();
    const updateScale = () => {
      const zoom = view.getZoom() ?? 0;
      const res = view.getResolution() ?? 1;
      setZoomAndScale(zoom, niceScaleText(res));
    };
    updateScale();
    view.on("change:resolution", updateScale);

    // Edit interactions (hook dari RightDock)
    const onEditLayer = (ev: Event) => {
      const { layerId } = (ev as CustomEvent<any>).detail || {};
      if (!layerId || !mapRef.current) return;
      const entry = useLayersStore
        .getState()
        .layers.find((l) => l.id === layerId);
      if (!entry) return;
      const src = (entry.layer as VectorLayer<VectorSource>).getSource();
      if (!src) return;

      if (modifyRef.current)
        mapRef.current.removeInteraction(modifyRef.current);
      if (selectRef.current)
        mapRef.current.removeInteraction(selectRef.current);
      const modify = new Modify({ source: src });
      const select = new Select({ layers: [entry.layer as any] });
      mapRef.current.addInteraction(modify);
      mapRef.current.addInteraction(select);
      modifyRef.current = modify;
      selectRef.current = select;
    };
    const onStopEditLayer = () => {
      if (!mapRef.current) return;
      if (modifyRef.current) {
        mapRef.current.removeInteraction(modifyRef.current);
        modifyRef.current = null;
      }
      if (selectRef.current) {
        mapRef.current.removeInteraction(selectRef.current);
        selectRef.current = null;
      }
    };
    window.addEventListener("edit-layer", onEditLayer as any);
    window.addEventListener("stop-edit-layer", onStopEditLayer as any);

    // Busy flag
    const onBusy = (ev: Event) => {
      const busy = !!(ev as CustomEvent<any>).detail?.busy;
      isBusyRef.current = busy;
      if (busy) {
        setHoveredId(undefined);
        setSelectedId(undefined);
        setFocus(null);
      }
    };
    window.addEventListener("interaction-busy", onBusy as any);

    // Rename layer display only
    const onRenameLayerDisplayOnly = (ev: Event) => {
      const { layerId, name } = (ev as CustomEvent<any>).detail || {};
      if (!layerId || typeof name !== "string") return;
      const st = useLayersStore.getState();
      useLayersStore.setState({
        layers: st.layers.map((le) =>
          le.id === layerId ? { ...le, name } : le
        ),
      });
      const entry = useLayersStore
        .getState()
        .layers.find((l) => l.id === layerId);
      if (entry) {
        (entry.layer as any).set("appName", name);
        (entry.layer as any).changed?.();
      }
    };
    window.addEventListener(
      "rename-layer-display-only",
      onRenameLayerDisplayOnly as any
    );

    // Edit metadata dari FocusCard
    const onEditMetadata = (ev: Event) => {
      const {
        id: oldId,
        layerId,
        kd,
        nm,
      } = (ev as CustomEvent<any>).detail || {};
      if (!oldId) return;

      const st = useLayersStore.getState();
      const entries = layerId
        ? st.layers.filter((l) => l.id === layerId)
        : st.layers;
      let updated: any = null;

      for (const le of entries) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const ft = src
          .getFeatures()
          .find((f: any) => String(f.get("id") || "") === String(oldId));
        if (!ft) continue;

        if (typeof kd === "string" && kd.trim() !== "") ft.set("id", kd.trim());
        if (typeof nm === "string" && nm.trim() !== "")
          ft.set("name", nm.trim());

        // sinkron ke key yang memang ada
        const propsNow = ft.getProperties?.() || {};
        if (typeof kd === "string" && kd.trim() !== "")
          CODE_KEYS.forEach((k) => {
            if (k in propsNow) ft.set(k, kd.trim());
          });
        if (typeof nm === "string" && nm.trim() !== "")
          NAME_KEYS.forEach((k) => {
            if (k in propsNow) ft.set(k, nm.trim());
          });

        (le.layer as any).changed?.();
        updated = { ft, leId: le.id };
        break;
      }

      if (updated) {
        const ft = updated.ft as any;
        const leId = updated.leId as string;
        const idNow = String(ft.get("id") || "");
        const nameNow =
          String(ft.get("name") || "") || featureName(ft as any) || "";
        const geom = ft.getGeometry() as Geometry;
        const p3857 = bestPointForStreetView(geom);
        const [lon, lat] = toLonLat(p3857);
        const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");

        setSelectedId(idNow);
        setFocus({
          id: idNow,
          name: nameNow,
          lon,
          lat,
          layerId: leId,
          geom: new GeoJSON().writeGeometryObject(geom4326),
        });

        window.dispatchEvent(
          new CustomEvent("metadata-edited", {
            detail: { id: oldId, layerId: leId, kd, nm },
          })
        );
      }
    };
    window.addEventListener("edit-metadata", onEditMetadata as any);

    // Kirim seluruh properties utk editor (kecuali geometry) dengan data terbaru dari API
    const onRequestProps = async (ev: Event) => {
      const { id, layerId } = (ev as CustomEvent<any>).detail || {};
      if (!id) return;

      console.log("TaxMap: onRequestProps called", { id, layerId });

      const st = useLayersStore.getState();
      const targets = layerId
        ? st.layers.filter((l) => l.id === layerId)
        : st.layers;

      let foundFeature: any = null;
      let foundLayerId: string | null = null;
      let foundLayerEntry:
        | ReturnType<typeof useLayersStore.getState>["layers"][number]
        | null = null;

      for (const le of targets) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const candidate = src
          .getFeatures()
          .find((f: any) => String(f.get("id") || "") === String(id));
        if (!candidate) continue;
        foundFeature = candidate;
        foundLayerId = le.id;
        foundLayerEntry = le;
        break;
      }

      if (!foundFeature) {
        window.dispatchEvent(
          new CustomEvent("feature-props-error", {
            detail: {
              id,
              layerId,
              error: "Feature not found in current map layers",
            },
          })
        );
        return;
      }

      const props: Record<string, any> =
        (foundFeature.getProperties?.() as Record<string, any>) || {};
      props.id = props.id ?? foundFeature.get("id") ?? id;

      const hasApiAttributes =
        Array.isArray(foundFeature.get("_rawAttributes")) ||
        Array.isArray(props._rawAttributes);

      if (hasApiAttributes) {
        try {
          const { getSpatialFeatureById } = await import(
            "../lib/api/spatialFeature"
          );
          const freshFeature = await getSpatialFeatureById(Number(id));

          const normalizedAttributes: SpatialFeatureAttribute[] =
            Array.isArray(freshFeature.attribute)
              ? (freshFeature.attribute as SpatialFeatureAttribute[]).map(
                  (attr, index) => ({
                    ...attr,
                    attributeIndex:
                      attr.attributeIndex !== undefined
                        ? attr.attributeIndex
                        : index,
                  })
                )
              : [];

          const refreshedName =
            normalizedAttributes.find(
              (attr) => attr.attributeKey === "spatialFeature.refWilayah"
            )?.attributeValue ||
            (typeof freshFeature.label === "string"
              ? freshFeature.label
              : undefined) ||
            (typeof props.name === "string" ? props.name : undefined);

          foundFeature.set(
            "_rawAttributes",
            normalizedAttributes.map((attr) => ({ ...attr }))
          );
          props._rawAttributes = normalizedAttributes.map((attr) => ({
            ...attr,
          }));

          if (refreshedName) {
            foundFeature.set("name", refreshedName);
            props.name = refreshedName;
          }

          if (foundLayerEntry?.layer) {
            (foundLayerEntry.layer as any).changed?.();
          }

          const currentFocus = useMapStore.getState().focus;
          if (
            currentFocus &&
            typeof currentFocus === "object" &&
            String((currentFocus as any)?.id ?? "") === String(id)
          ) {
            useMapStore.getState().setFocus({
              ...(currentFocus as any),
              name: props.name,
              _rawAttributes: props._rawAttributes,
            });
          }
        } catch (error) {
          console.error("TaxMap: Failed to fetch latest feature props", error);
          window.dispatchEvent(
            new CustomEvent("feature-props-error", {
              detail: {
                id,
                layerId: foundLayerId || layerId,
                error:
                  error instanceof Error
                    ? error.message
                    : "Failed to fetch feature metadata",
              },
            })
          );
          return;
        }
      } else if (
        props._rawAttributes &&
        Array.isArray(props._rawAttributes)
      ) {
        props._rawAttributes = (props._rawAttributes as SpatialFeatureAttribute[]).map(
          (attr: SpatialFeatureAttribute, index: number) => ({
            ...attr,
            attributeIndex:
              attr.attributeIndex !== undefined ? attr.attributeIndex : index,
          })
        );
      }

      const geom = foundFeature.getGeometry() as Geometry;
      if (geom) {
        const p3857 = bestPointForStreetView(geom);
        const [lon, lat] = toLonLat(p3857);
        const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");

        props.lon = lon;
        props.lat = lat;
        props.geometry = new GeoJSON().writeGeometryObject(geom4326);
      }

      console.log("TaxMap: Sending feature-props-response", {
        id,
        layerId: foundLayerId || layerId,
        hasRawAttributes: !!props._rawAttributes,
        hasGeometry: !!props.geometry,
        hasCoords: !!(props.lon && props.lat),
        name: props.name,
      });

      window.dispatchEvent(
        new CustomEvent("feature-props-response", {
          detail: { id, layerId: foundLayerId || layerId, props },
        })
      );
    };
    window.addEventListener("request-feature-props", onRequestProps as any);

    // Apply props + sinkron id/name jika alias diubah
    const onApplyFeatureProps = async (ev: Event) => {
      const {
        id,
        layerId,
        updates = {},
        deletes = [],
        reloadLayer = false,
      } = (ev as CustomEvent<any>).detail || {};

      console.log("TaxMap: Received apply-feature-props event", {
        id,
        layerId,
        updates,
        deletes,
        reloadLayer,
      });

      if (!id) {
        console.warn("TaxMap: apply-feature-props event missing id");
        return;
      }

      const st = useLayersStore.getState();
      const targets = layerId
        ? st.layers.filter((l) => l.id === layerId)
        : st.layers;

      for (const le of targets) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const ft = src
          .getFeatures()
          .find((f: any) => String(f.get("id") || "") === String(id));
        if (!ft) continue;

        // Check if this is an API-loaded feature that needs server-side updates
        const rawAttributes = ft.get("_rawAttributes");
        if (rawAttributes && Array.isArray(rawAttributes)) {
          const finalizeFeatureUpdate = (
            attributes: SpatialFeatureAttribute[],
            spatialFeatureForEvent?: SpatialFeature
          ) => {
            const normalizedAttributes = attributes.map((attr, index) => ({
              ...attr,
              attributeIndex:
                attr.attributeIndex !== undefined
                  ? attr.attributeIndex
                  : index,
            }));

            ft.set(
              "_rawAttributes",
              normalizedAttributes.map((attr) => ({ ...attr }))
            );

            Object.keys(updates).forEach((k) => {
              if (/^(geometry|geom|the_geom|_geom)$/i.test(k)) return;
              (ft as any).set(k, (updates as any)[k]);
            });

            const updatedNameFromAttributes = normalizedAttributes.find(
              (attr) => attr.attributeKey === "spatialFeature.refWilayah"
            )?.attributeValue;

            if (updatedNameFromAttributes) {
              (ft as any).set("name", updatedNameFromAttributes);
            } else if (updates["spatialFeature.refWilayah"]) {
              (ft as any).set("name", updates["spatialFeature.refWilayah"]);
            }

            (le.layer as any).changed?.();

            const updatedProps = {
              id: ft.get("id"),
              name:
                updatedNameFromAttributes ||
                (ft.get("name") as string) ||
                (updates["spatialFeature.refWilayah"] as string) ||
                "",
              _rawAttributes: normalizedAttributes.map((attr) => ({
                ...attr,
              })),
            };

            const currentFocus = useMapStore.getState().focus;
            if (
              currentFocus &&
              String((currentFocus as any)?.id ?? "") === String(id)
            ) {
              const { setFocus } = useMapStore.getState();
              setFocus({
                ...(currentFocus as any),
                name: updatedProps.name || (currentFocus as any)?.name || "",
                _rawAttributes: updatedProps._rawAttributes,
              });
            }

            window.dispatchEvent(
              new CustomEvent("feature-props-applied", {
                detail: {
                  id,
                  layerId: le.id,
                  updates,
                  deletes,
                  reloadLayer,
                  updatedProps,
                  updatedRawAttributes: updatedProps._rawAttributes,
                  updatedSpatialFeature: spatialFeatureForEvent,
                },
              })
            );

            if (reloadLayer) {
              console.log(
                "TaxMap: reloadLayer is true, initiating layer reload process"
              );
              try {
                const layerEntry = useLayersStore
                  .getState()
                  .layers.find((l) => l.id === le.id);
                console.log(
                  "TaxMap: Found layer entry:",
                  layerEntry
                    ? {
                        id: layerEntry.id,
                        name: layerEntry.name,
                        kind: layerEntry.kind,
                        typeCode: layerEntry.typeCode,
                      }
                    : null
                );

                if (layerEntry) {
                  const typeAttribute = normalizedAttributes.find(
                    (attr) => attr.attributeKey === "spatialFeature.type"
                  );
                  const typeCode = typeAttribute?.attributeValue;
                  console.log(
                    "TaxMap: Extracted typeCode from rawAttributes:",
                    typeCode
                  );

                  if (typeCode) {
                    console.log(
                      `TaxMap: Dispatching reload-api-layer event for ${le.id} with type ${typeCode}`
                    );

                    const reloadEvent = new CustomEvent("reload-api-layer", {
                      detail: {
                        layerId: le.id,
                        typeCode,
                        featureId: id,
                        forceRefresh: true,
                        updateUI: true,
                      },
                    });
                    console.log(
                      "TaxMap: reload-api-layer event detail:",
                      reloadEvent.detail
                    );
                    window.dispatchEvent(reloadEvent);
                  } else {
                    console.error(
                      "TaxMap: No typeCode found in rawAttributes"
                    );
                  }
                } else {
                  console.error(
                    `TaxMap: Layer entry ${le.id} not found in store`
                  );
                }
              } catch (reloadError) {
                console.error("TaxMap: Error reloading layer:", reloadError);
                window.dispatchEvent(
                  new CustomEvent("layer-reload-error", {
                    detail: {
                      id,
                      layerId: le.id,
                      error: "Failed to reload layer after save",
                    },
                  })
                );
              }
            } else {
              console.log(
                "TaxMap: reloadLayer is false, skipping layer reload"
              );
            }
          };

          try {
            const spatialFeature = {
              id: parseInt(String(id)),
              systemId: 0,
              type: 0,
              identifier: "",
              label: "",
              value: "",
              status: 1,
              attribute: rawAttributes,
              description: "",
              createdBy: "",
              createdAt: 0,
              updatedBy: "",
              updatedAt: 0,
            };

            Object.keys(updates).forEach((key) => {
              if (key === "spatialFeature.refWilayah") {
                const refWilayahAttr = rawAttributes.find(
                  (attr: any) =>
                    attr.attributeKey === "spatialFeature.refWilayah"
                );
                if (refWilayahAttr) {
                  refWilayahAttr.attributeValue = updates[key];
                }
              } else if (key.startsWith("spatialFeature.")) {
                const attr = rawAttributes.find(
                  (a: any) => a.attributeKey === key
                );
                if (attr) {
                  attr.attributeValue = updates[key];
                } else {
                  rawAttributes.push({
                    id: 0,
                    attributeKey: key,
                    attributeValue: updates[key],
                    attributeLabel: key,
                    attributeValueType: 1,
                  });
                }
              }
            });

            deletes.forEach((key: string) => {
              if (key.startsWith("spatialFeature.")) {
                const index = rawAttributes.findIndex(
                  (a: any) => a.attributeKey === key
                );
                if (index !== -1) {
                  rawAttributes.splice(index, 1);
                }
              }
            });

            const { skipServerUpdate = false, updatedFeature, updatedRawAttributes } =
              (ev as CustomEvent<any>).detail || {};

            if (skipServerUpdate && updatedFeature) {
              const attributesFromEvent = Array.isArray(updatedRawAttributes)
                ? (updatedRawAttributes as SpatialFeatureAttribute[])
                : Array.isArray(updatedFeature.attribute)
                ? (updatedFeature.attribute as SpatialFeatureAttribute[])
                : (rawAttributes as SpatialFeatureAttribute[]);

              finalizeFeatureUpdate(attributesFromEvent, updatedFeature);
              break;
            }

            metadataEditor.actions.startEditing(spatialFeature);

            const updatedFeatureFromEditor =
              await metadataEditor.actions.saveChanges();

            if (updatedFeatureFromEditor) {
              const updatedAttributes = Array.isArray(
                updatedFeatureFromEditor.attribute
              )
                ? (updatedFeatureFromEditor.attribute as SpatialFeatureAttribute[])
                : (rawAttributes as SpatialFeatureAttribute[]);

              finalizeFeatureUpdate(
                updatedAttributes,
                updatedFeatureFromEditor
              );
            } else {
              window.dispatchEvent(
                new CustomEvent("feature-props-error", {
                  detail: {
                    id,
                    layerId: le.id,
                    error: "Failed to save changes to server",
                  },
                })
              );
            }
          } catch (error) {
            console.error("Error applying feature props:", error);
            window.dispatchEvent(
              new CustomEvent("feature-props-error", {
                detail: { id, layerId: le.id, error: String(error) },
              })
            );
          }
        } else {
          // This is a local feature, use the original logic
          Object.keys(updates).forEach((k) => {
            if (/^(geometry|geom|the_geom|_geom)$/i.test(k)) return;
            (ft as any).set(k, (updates as any)[k]);
          });
          (deletes as string[]).forEach((k) => {
            if (/^(geometry|geom|the_geom|_geom)$/i.test(k)) return;
            try {
              (ft as any).unset?.(k, true);
            } catch {
              // Handle error silently
            }
          });

          // bila user mengubah kode/nama via alias resmi, ikutkan ke id/name
          const pickFirst = (keys: string[]) => {
            for (const k of keys)
              if (
                k in (updates as any) &&
                String((updates as any)[k]).trim() !== ""
              )
                return String((updates as any)[k]).trim();
            return undefined;
          };
          const newIdMaybe = pickFirst(CODE_KEYS);
          const newNameMaybe = pickFirst(NAME_KEYS);
          if (newIdMaybe) (ft as any).set("id", newIdMaybe);
          if (newNameMaybe) (ft as any).set("name", newNameMaybe);

          (le.layer as any).changed?.();

          const idNow = String((ft as any).get("id") || "");
          const nameNow =
            String((ft as any).get("name") || "") ||
            featureName(ft as any) ||
            "";
          const geom = (ft as any).getGeometry() as Geometry;
          const p3857 = bestPointForStreetView(geom);
          const [lon, lat] = toLonLat(p3857);
          const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");
          setSelectedId(idNow);
          setFocus({
            id: idNow,
            name: nameNow,
            lon,
            lat,
            layerId: le.id,
            geom: new GeoJSON().writeGeometryObject(geom4326),
          });

          window.dispatchEvent(
            new CustomEvent("feature-props-applied", {
              detail: { id, layerId: le.id, updates, deletes },
            })
          );
        }
        break;
      }
    };
    window.addEventListener("apply-feature-props", onApplyFeatureProps as any);

    // Handle layer reload requests (moved from SmartGovLoader to ensure always active)
    const handleReloadLayer = async (event: Event) => {
      console.log("TaxMap: handleReloadLayer called");
      const {
        layerId,
        typeCode,
        featureId,
        forceRefresh = false,
        updateUI = false,
      } = (event as CustomEvent<any>).detail || {};

      console.log("TaxMap: reload-api-layer event received with payload:", {
        layerId,
        typeCode,
        featureId,
        forceRefresh,
        updateUI,
      });

      if (!typeCode || !layerId) {
        console.error("TaxMap: Invalid reload-api-layer event payload:", {
          layerId,
          typeCode,
          featureId,
          forceRefresh,
          updateUI,
        });
        return;
      }

      try {
        console.log(
          `TaxMap handling layer reload for ${layerId} with type ${typeCode}, forceRefresh: ${forceRefresh}, updateUI: ${updateUI}`
        );

        // Import required modules dynamically
        const { listSpatialFeatures } = await import(
          "../lib/api/spatialFeature"
        );
        const { addApiLayersByType } = await import("../features/loadFromApi");

        // Store current focus state if this is the focused feature
        const mapStoreState = useMapStore.getState();
        const currentFocus = mapStoreState.focus;
        const suppressFocusRestore = mapStoreState.suppressFocusRestore;
        const isFocusedFeature =
          currentFocus &&
          typeof currentFocus === "object" &&
          "id" in currentFocus &&
          String(currentFocus.id) === String(featureId);

        // Find the existing layer in the store
        const { layers, map, removeEntry } = useLayersStore.getState();
        const existingLayer = layers.find((l) => l.id === layerId);

        if (!existingLayer) {
          console.warn(`Layer ${layerId} not found in store`);
          return;
        }

        // Store layer properties for restoration
        const layerProperties = {
          name: existingLayer.name,
          kind: existingLayer.kind,
          styleCfg: existingLayer.styleCfg,
          visible: existingLayer.visible,
        };

        console.log(`Removing existing layer ${layerId} from map and store`);

        // Remove the existing layer from map and store
        if (map && existingLayer.layer) {
          map.removeLayer(existingLayer.layer);
        }
        removeEntry(layerId);

        // ENHANCED: Immediate UI notification before reload starts
        if (updateUI) {
          // Notify that reload is starting
          window.dispatchEvent(
            new CustomEvent("layer-reload-started", {
              detail: { layerId, typeCode, featureId },
            })
          );
        }

        // Load fresh data from API for the specific type
        const response = await listSpatialFeatures({
          pageNumber: 1,
          pageSize: 1000, // Load all features for this type
          filters: [`spatialFeature.type|eq|${typeCode}`],
          include: ["attribute"],
        });

        const { transformSpatialFeatures } = await import(
          "../lib/api/transformers"
        );
        const transformed = transformSpatialFeatures(response.data || []);

        if (transformed.length === 0) {
          console.warn("No features returned for layer reload");
          return;
        }

        console.log(
          `Loading fresh data for type ${typeCode}, ${transformed.length} features`
        );

        // Load fresh data as a new layer to replace the old one
        const layerResults = await addApiLayersByType({
          typeCode,
          pageNumber: 1,
          pageSize: 1000,
        });

        // Find the newly created layer and restore properties
        const { layers: newLayers } = useLayersStore.getState();
        const createdLayerInfo = layerResults.find(
          (layer) => layer.typeCode === typeCode
        );
        const newLayer = createdLayerInfo
          ? newLayers.find((l) => l.id === createdLayerInfo.id)
          : newLayers.find(
              (l) =>
                l.kind === layerProperties.kind &&
                l.name === layerProperties.name
            );

        if (newLayer) {
          console.log(`Restoring properties for new layer ${newLayer.id}`);

          // Restore style configuration
          if (layerProperties.styleCfg) {
            const { updateStyleCfg } = useLayersStore.getState();
            updateStyleCfg(newLayer.id, layerProperties.styleCfg);
          }

          // Restore visibility
          if (!layerProperties.visible) {
            const { setVisible } = useLayersStore.getState();
            setVisible(newLayer.id, false);
          }

          // ENHANCED: Immediate focus restoration with better timing
          if (isFocusedFeature && updateUI && !suppressFocusRestore) {
            const restoreFocus = () => {
              // Find the feature in the new layer
              const source = newLayer.layer.getSource();
              if (source) {
                const feature = source
                  .getFeatures()
                  .find(
                    (f: any) => String(f.get("id") || "") === String(featureId)
                  );

                if (feature) {
                  // Get the updated name from _rawAttributes first, then fallback to feature property
                  let name =
                    String(feature.get("name") || "") || `Feature ${featureId}`;

                  const rawAttributes = feature.get("_rawAttributes");
                  if (rawAttributes && Array.isArray(rawAttributes)) {
                    const refWilayahAttr = rawAttributes.find(
                      (attr: any) =>
                        attr.attributeKey === "spatialFeature.refWilayah"
                    );
                    if (refWilayahAttr && refWilayahAttr.attributeValue) {
                      name = refWilayahAttr.attributeValue;
                      console.log(
                        `TaxMap: Updated name from _rawAttributes: ${name}`
                      );
                    }
                  }

                  const geom = feature.getGeometry();

                  if (geom) {
                    // Calculate center point
                    const center = geom.getExtent();
                    const centerX = (center[0] + center[2]) / 2;
                    const centerY = (center[1] + center[3]) / 2;

                    // Convert to lon/lat
                    const ol = (window as any).ol;
                    const [lon, lat] = ol?.proj?.toLonLat?.([
                      centerX,
                      centerY,
                    ]) || [0, 0];

                    // Update focus with fresh data
                    const { setFocus, setSelectedId } = useMapStore.getState();
                    setFocus({
                      id: featureId,
                      name,
                      lon,
                      lat,
                      layerId: newLayer.id,
                      geom:
                        ol?.format
                          ?.GeoJSON?.()
                          ?.writeGeometryObject?.(
                            geom.clone().transform("EPSG:3857", "EPSG:4326")
                          ) || {},
                      // Include _rawAttributes for FocusCard
                      _rawAttributes: rawAttributes,
                    });

                    setSelectedId(featureId);

                    console.log(
                      `Restored focus for feature ${featureId} in reloaded layer with name: ${name}`
                    );

                    // ENHANCED: Immediate FocusCard refresh with fresh data
                    setTimeout(() => {
                      console.log(
                        "TaxMap: Triggering immediate FocusCard refresh with fresh data"
                      );
                      window.dispatchEvent(
                        new CustomEvent("layer-reloaded-for-focus-refresh", {
                          detail: {
                            id: featureId,
                            layerId: newLayer.id,
                            originalLayerId: layerId,
                            newLayerId: newLayer.id,
                            typeCode,
                            forceRefresh,
                            updateUI,
                            props: {
                              id: String(featureId),
                              layerId: newLayer.id,
                              name,
                              lon,
                              lat,
                              geometry:
                                ol?.format
                                  ?.GeoJSON?.()
                                  ?.writeGeometryObject?.(
                                    geom
                                      .clone()
                                      .transform("EPSG:3857", "EPSG:4326")
                                  ) || {},
                              _rawAttributes: rawAttributes,
                            },
                          },
                        })
                      );
                    }, 100); // Very short delay for immediate update
                  }
                }
              }
            };

            // Try immediately first, then fallback with longer delay
            restoreFocus();
            setTimeout(restoreFocus, 300);
          } else if (isFocusedFeature && updateUI && suppressFocusRestore) {
            console.log(
              "TaxMap: Skipping automatic focus restoration due to suppression flag"
            );
          }

          // Emit success event with enhanced details
          console.log(
            "TaxMap: Emitting layer-reloaded success event with details:",
            {
              originalLayerId: layerId,
              newLayerId: newLayer.id,
              typeCode,
              featureId,
              featureCount: transformed.length,
              forceRefresh,
              updateUI,
            }
          );
          window.dispatchEvent(
            new CustomEvent("layer-reloaded", {
              detail: {
                originalLayerId: layerId,
                newLayerId: newLayer.id,
                typeCode,
                featureId,
                featureCount: transformed.length,
                forceRefresh,
                updateUI,
              },
            })
          );

          // ENHANCED: More reliable UI synchronization with multiple attempts
          if (updateUI) {
            const triggerUISync = () => {
              window.dispatchEvent(
                new CustomEvent("ui-synchronization-complete", {
                  detail: {
                    layerId: newLayer.id,
                    originalLayerId: layerId,
                    featureId,
                    components: ["rightdock", "taxmap", "focuscard"],
                  },
                })
              );
            };

            // Multiple attempts to ensure UI synchronization
            setTimeout(triggerUISync, 200);
            setTimeout(triggerUISync, 500);
            setTimeout(triggerUISync, 1000);
          }
        } else {
          throw new Error("New layer not found after reload");
        }
      } catch (error) {
        console.error("Error reloading layer in TaxMap:", error);

        // Emit error event
        window.dispatchEvent(
          new CustomEvent("layer-reload-error", {
            detail: {
              layerId,
              typeCode,
              featureId,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          })
        );
      }
    };

    // Handle layer reload success events
    const onLayerReloaded = (ev: Event) => {
      const {
        originalLayerId,
        newLayerId,
        featureId,
        typeCode,
        forceRefresh,
        updateUI,
      } = (ev as CustomEvent<any>).detail || {};

      console.log(`Layer reloaded: ${originalLayerId} -> ${newLayerId}`);

      // If the currently selected feature was in the reloaded layer, update the focus
      if (selectedId && String(featureId ?? "") === String(selectedId ?? "")) {
        // Find the feature in the new layer
        const st = useLayersStore.getState();
        const newLayerEntry = st.layers.find((l) => l.id === newLayerId);

        if (newLayerEntry) {
          const src = (
            newLayerEntry.layer as VectorLayer<VectorSource>
          ).getSource?.();
          if (src) {
            const feature = src
              .getFeatures()
              .find(
                (f: any) => String(f.get("id") || "") === String(featureId)
              );

            if (feature) {
              const name =
                String(feature.get("name") || "") || featureName(feature) || "";
              const geom = feature.getGeometry() as Geometry;
              const p3857 = bestPointForStreetView(geom);
              const [lon, lat] = toLonLat(p3857);
              const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");
              const rawAttributes = feature.get("_rawAttributes");
              const geoJsonWriter = new GeoJSON();
              const geometryObject =
                geoJsonWriter.writeGeometryObject(geom4326);

              // Update focus with fresh data
              setFocus({
                id: featureId,
                name,
                lon,
                lat,
                layerId: newLayerId,
                geom: geometryObject,
                _rawAttributes: rawAttributes,
              });

              // Update selected layer ID
              setSelectedId(featureId);

              console.log(
                `Updated focus for feature ${featureId} with fresh data`
              );

              // Notify FocusCard with refreshed data payload so it can update immediately
              const refreshedProps = {
                id: String(featureId),
                layerId: newLayerId,
                name,
                lon,
                lat,
                geometry: geometryObject,
                _rawAttributes: rawAttributes,
              };

              window.dispatchEvent(
                new CustomEvent("layer-reloaded-for-focus-refresh", {
                  detail: {
                    id: featureId,
                    layerId: newLayerId,
                    originalLayerId,
                    newLayerId,
                    typeCode,
                    forceRefresh,
                    updateUI,
                    props: refreshedProps,
                  },
                })
              );
            }
          }
        }
      }
    };

    // Handle layer reload error events
    const onLayerReloadError = (ev: Event) => {
      const { layerId, error } = (ev as CustomEvent<any>).detail || {};
      console.error(`Layer reload failed for ${layerId}:`, error);

      // Optionally notify the user
      window.dispatchEvent(
        new CustomEvent("layer-reload-failed", {
          detail: { layerId, error },
        })
      );
    };

    window.addEventListener("reload-api-layer", handleReloadLayer);
    window.addEventListener("layer-reloaded", onLayerReloaded as any);
    window.addEventListener("layer-reload-error", onLayerReloadError as any);

    // Handle TaxMap refresh requests
    const handleTaxMapRefresh = (event: Event) => {
      const { layerId, typeCode, reason } =
        (event as CustomEvent<any>).detail || {};
      console.log(
        `TaxMap refresh requested for layer ${layerId}, type ${typeCode}, reason: ${reason}`
      );

      // Force map re-render by triggering a view change
      if (mapRef.current) {
        const view = mapRef.current.getView();
        const currentCenter = view.getCenter();
        const currentZoom = view.getZoom();

        // Small animation to force refresh
        if (currentCenter && currentZoom !== undefined) {
          view.animate({
            center: currentCenter,
            zoom: currentZoom,
            duration: 100,
          });
        }
      }
    };
    window.addEventListener("taxmap-refresh-requested", handleTaxMapRefresh);

    // Handle UI synchronization completion
    const handleUISynchronizationComplete = (event: Event) => {
      const { layerId, components } = (event as CustomEvent<any>).detail || {};
      console.log(
        `TaxMap UI synchronization complete for layer ${layerId}, components: ${components?.join(
          ", "
        )}`
      );

      // Force refresh of feature styles to ensure labels are updated
      const st = useLayersStore.getState();
      const layerEntry = st.layers.find((l) => l.id === layerId);

      if (layerEntry) {
        // Trigger style refresh to update feature labels
        layerEntry.layer.changed();

        // If this layer contains the currently selected feature, update the focus
        if (selectedId) {
          const src = (
            layerEntry.layer as VectorLayer<VectorSource>
          ).getSource?.();
          if (src) {
            const feature = src
              .getFeatures()
              .find(
                (f: any) => String(f.get("id") || "") === String(selectedId)
              );

            if (feature) {
              const name =
                String(feature.get("name") || "") || featureName(feature) || "";
              const geom = feature.getGeometry() as Geometry;
              const p3857 = bestPointForStreetView(geom);
              const [lon, lat] = toLonLat(p3857);
              const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");

              setFocus({
                id: selectedId,
                name,
                lon,
                lat,
                layerId,
                geom: new GeoJSON().writeGeometryObject(geom4326),
              });
            }
          }
        }
      }
    };
    // INTELLIGENT AUTO-RELOAD: Handle automatic metadata editor updates
    const handleIntelligentAutoReload = (event: Event) => {
      const {
        featureId,
        layerId,
        namaWilayah,
        idWilayah,
        rawAttributes,
        isAutoUpdate,
      } = (event as CustomEvent<any>).detail || {};

      console.log("TaxMap: handleIntelligentAutoReload event received", {
        featureId,
        layerId,
        namaWilayah,
        idWilayah,
        attributeCount: rawAttributes?.length || 0,
        isAutoUpdate,
      });

      if (!featureId || !layerId) {
        console.warn("TaxMap: Invalid intelligent-auto-reload event payload");
        return;
      }

      // Find the layer and feature to update
      const st = useLayersStore.getState();
      const layerEntry = st.layers.find((l) => l.id === layerId);

      if (!layerEntry) {
        console.warn(
          `TaxMap: Layer ${layerId} not found for intelligent auto-reload`
        );
        return;
      }

      const src = (layerEntry.layer as VectorLayer<VectorSource>).getSource?.();
      if (!src) {
        console.warn(`TaxMap: Layer ${layerId} has no source`);
        return;
      }

      const feature = src
        .getFeatures()
        .find((f: any) => String(f.get("id") || "") === String(featureId));

      if (!feature) {
        console.warn(
          `TaxMap: Feature ${featureId} not found in layer ${layerId}`
        );
        return;
      }

      // Update the feature with fresh data
      if (rawAttributes && Array.isArray(rawAttributes)) {
        // Update _rawAttributes with fresh data
        feature.set("_rawAttributes", [...rawAttributes]);

        // Update local properties from fresh attributes
        rawAttributes.forEach((attr: any) => {
          if (attr.attributeKey === "spatialFeature.refWilayah") {
            feature.set("name", attr.attributeValue);
          }
        });

        // Update the feature's display name
        const refWilayahAttr = rawAttributes.find(
          (attr: any) => attr.attributeKey === "spatialFeature.refWilayah"
        );
        if (refWilayahAttr && refWilayahAttr.attributeValue) {
          feature.set("name", refWilayahAttr.attributeValue);
        }
      }

      // Trigger layer refresh to update the display
      layerEntry.layer.changed();

      // Update the current focus if this is the focused feature
      const currentFocus = useMapStore.getState().focus;
      if (
        currentFocus &&
        typeof currentFocus === "object" &&
        "id" in currentFocus
      ) {
        const currentFocusId = String(currentFocus.id);
        const eventFeatureId = String(featureId);

        if (currentFocusId === eventFeatureId) {
          console.log(
            "TaxMap: Updating current focus with intelligent auto-reload data"
          );

          const geom = feature.getGeometry() as Geometry;
          if (geom) {
            const p3857 = bestPointForStreetView(geom);
            const [lon, lat] = toLonLat(p3857);
            const geom4326 = geom.clone().transform("EPSG:3857", "EPSG:4326");

            const updatedFocus = {
              ...currentFocus,
              name: namaWilayah || (currentFocus as any).name,
              id: idWilayah || (currentFocus as any).id,
              lon,
              lat,
              layerId,
              geom: new GeoJSON().writeGeometryObject(geom4326),
              _rawAttributes: rawAttributes,
            };

            useMapStore.getState().setFocus(updatedFocus);
            useMapStore.getState().setSelectedId(featureId);

            console.log(
              "TaxMap: Focus updated with intelligent auto-reload data",
              {
                oldName: (currentFocus as any).name,
                newName: updatedFocus.name,
                hasRawAttributes: !!updatedFocus._rawAttributes,
              }
            );
          }
        }
      }

      // Emit success event for UI synchronization
      window.dispatchEvent(
        new CustomEvent("intelligent-auto-reload-complete", {
          detail: {
            featureId,
            layerId,
            namaWilayah,
            idWilayah,
            success: true,
            timestamp: Date.now(),
          },
        })
      );

      console.log("TaxMap: Intelligent auto-reload completed successfully");
    };

    window.addEventListener(
      "intelligent-auto-reload",
      handleIntelligentAutoReload as any
    );

    window.addEventListener(
      "ui-synchronization-complete",
      handleUISynchronizationComplete
    );

    return () => {
      const hs = hoverStateRef.current;
      window.removeEventListener("goto-coords", onGoto as any);
      window.removeEventListener(
        "load-imported-dataset",
        onLoadImportedDataset as any
      );
      window.removeEventListener("edit-layer", onEditLayer as any);
      window.removeEventListener("stop-edit-layer", onStopEditLayer as any);
      window.removeEventListener("interaction-busy", onBusy as any);
      window.removeEventListener(
        "rename-layer-display-only",
        onRenameLayerDisplayOnly as any
      );
      window.removeEventListener("edit-metadata", onEditMetadata as any);
      window.removeEventListener(
        "request-feature-props",
        onRequestProps as any
      );
      window.removeEventListener(
        "apply-feature-props",
        onApplyFeatureProps as any
      );
      window.removeEventListener("reload-api-layer", handleReloadLayer);
      window.removeEventListener("layer-reloaded", onLayerReloaded as any);
      window.removeEventListener(
        "layer-reload-error",
        onLayerReloadError as any
      );
      window.removeEventListener(
        "taxmap-refresh-requested",
        handleTaxMapRefresh
      );
      window.removeEventListener(
        "ui-synchronization-complete",
        handleUISynchronizationComplete
      );
      window.removeEventListener(
        "intelligent-auto-reload",
        handleIntelligentAutoReload as any
      );

      if (hs.rafId) cancelAnimationFrame(hs.rafId);

      map.setTarget(undefined as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ganti base layer
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    baseLayerRef.current = new TileLayer({
      source: makeBaseSource(baseLayer || "osm"),
    });
    map.getLayers().insertAt(0, baseLayerRef.current);
  }, [baseLayer]);

  // highlight hover/selected + label
  useEffect(() => {
    const layers = useLayersStore.getState().layers;
    layers.forEach((layerEntry) => {
      if (layerEntry.layer.get("customStyleApplied")) return;
      const originalStyleFn = styleFromCfg(layerEntry.styleCfg);

      layerEntry.layer.setStyle((feature: FeatureLike) => {
        const featureId = String((feature as any).get("id") || "");
        const isSelected = featureId === selectedId;
        const isHovered = featureId === hoveredId;

        const style = originalStyleFn(feature).clone();
        const t = (style as any).getText?.();
        if (t) {
          const mode = layerEntry.styleCfg.labelMode || "nama";
          const label: string =
            mode === "kode"
              ? String((feature as any).get("id") || "")
              : String((feature as any).get("name") || "") ||
                featureName(feature as any) ||
                "";
          t.setText(label);
        }

        if (isSelected || isHovered) {
          const stroke = (style as any).getStroke?.();
          if (stroke) {
            stroke.setWidth((layerEntry.styleCfg.borderWidth ?? 1.6) + 1);
            if (isSelected) stroke.setColor(hexToRgba("#3b82f6", 1));
          }
          const fill = (style as any).getFill?.();
          if (fill && isSelected) {
            fill.setColor(
              hexToRgba(
                layerEntry.styleCfg.fillColor,
                Math.min(1, (layerEntry.styleCfg.fillOpacity ?? 0.25) + 0.2)
              )
            );
          }
        }
        return style;
      });

      layerEntry.layer.changed();
    });
  }, [selectedId, hoveredId]);

  return (
    <>
      <div ref={mapDiv} className="map" />
      {import.meta.env.DEV && (
        <div
          style={{ position: "fixed", top: 12, right: 12, zIndex: 99999 }}
        ></div>
      )}
    </>
  );
}
