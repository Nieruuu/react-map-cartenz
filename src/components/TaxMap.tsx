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
  MultiPolygon as GeoJSONMultiPolygon,
  Polygon as GeoJSONPolygon,
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
import shp from "shpjs";

import { useMapStore } from "../hooks/useMapStore";
import { styleFromCfg, useLayersStore } from "../hooks/useLayersStore";

const ADMIN_SRC = "/data/5103.zip";
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

/* ==== utils ==== */
function hexToRgba(hex: string, alpha = 1) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function pickFeatureCollection(data: any) {
  if (!data) return null;
  if (data.type === "FeatureCollection") return data;
  if (typeof data === "object") {
    for (const k of Object.keys(data)) {
      const v = (data as any)[k];
      if (v && v.type === "FeatureCollection") return v;
    }

    type Position2D = [number, number];
    type LinearRing2D = Position2D[];
    type PolygonCoords2D = LinearRing2D[];
    type MultiPolygonCoords2D = PolygonCoords2D[];

    function looksLikeLonLatSample(coords: number[][], take = 25): boolean {
      if (!coords.length) return false;
      let tested = 0;
      let within = 0;
      for (const pair of coords) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const x = Number(pair[0]);
        const y = Number(pair[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        tested++;
        if (Math.abs(x) <= 180 && Math.abs(y) <= 90) within++;
        if (tested >= take) break;
      }
      if (!tested) return false;
      return within / tested >= 0.6;
    }

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

    function normalizeRing(raw: any): LinearRing2D | null {
      if (!Array.isArray(raw)) return null;
      const ring: LinearRing2D = [];
      let prev: Position2D | null = null;
      for (const candidate of raw) {
        if (!Array.isArray(candidate) || candidate.length < 2) continue;
        const x = Number(candidate[0]);
        const y = Number(candidate[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const current: Position2D = [x, y];
        if (prev && prev[0] === current[0] && prev[1] === current[1]) continue;
        ring.push(current);
        prev = current;
      }
      if (ring.length < 3) return null;
      const unique = new Set(ring.map((pt) => `${pt[0]}|${pt[1]}`));
      if (unique.size < 3) return null;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      } else {
        ring[ring.length - 1] = [last[0], last[1]];
      }
      if (ring.length < 4) return null;
      return ring;
    }

    function normalizePolygonCoords(raw: any): PolygonCoords2D | null {
      if (!Array.isArray(raw)) return null;
      const rings: PolygonCoords2D = [];
      for (const candidate of raw) {
        const ring = normalizeRing(candidate);
        if (ring) rings.push(ring);
      }
      return rings.length ? rings : null;
    }

    function normalizeMultiPolygonCoords(
      raw: any
    ): MultiPolygonCoords2D | null {
      if (!Array.isArray(raw)) return null;
      const polygons: MultiPolygonCoords2D = [];
      for (const candidate of raw) {
        const poly = normalizePolygonCoords(candidate);
        if (poly) polygons.push(poly);
      }
      return polygons.length ? polygons : null;
    }

    function normalizeGeometry(
      geom: GeoJSONGeometry | null | undefined
    ):
      | { type: "Polygon"; coordinates: PolygonCoords2D }
      | { type: "MultiPolygon"; coordinates: MultiPolygonCoords2D }
      | null {
      if (!geom) return null;
      if (geom.type === "Polygon") {
        const coords = normalizePolygonCoords(
          (geom as GeoJSONPolygon).coordinates
        );
        return coords ? { type: "Polygon", coordinates: coords } : null;
      }
      if (geom.type === "MultiPolygon") {
        const coords = normalizeMultiPolygonCoords(
          (geom as GeoJSONMultiPolygon).coordinates
        );
        return coords ? { type: "MultiPolygon", coordinates: coords } : null;
      }
      if (geom.type === "GeometryCollection") {
        const geoms = Array.isArray(geom.geometries) ? geom.geometries : [];
        const collected: PolygonCoords2D[] = [];
        for (const part of geoms) {
          const normalized = normalizeGeometry(part as GeoJSONGeometry);
          if (!normalized) continue;
          if (normalized.type === "Polygon") {
            collected.push(normalized.coordinates);
          } else {
            collected.push(...normalized.coordinates);
          }
        }
        if (!collected.length) return null;
        if (collected.length === 1) {
          return { type: "Polygon", coordinates: collected[0] };
        }
        return { type: "MultiPolygon", coordinates: collected };
      }
      return null;
    }

    function manualBuildFeatures(
      baseFC: GeoJSONFeatureCollection,
      order: "xy" | "yx",
      asDegrees: boolean
    ): Feature<Geometry>[] {
      const features: Feature<Geometry>[] = [];
      const swap = order === "yx";

      const projectPoint = (coord: Position2D): Position2D | null => {
        const raw: Position2D = swap
          ? [coord[1], coord[0]]
          : [coord[0], coord[1]];
        if (asDegrees) {
          const projected = fromLonLat(raw);
          if (
            !Number.isFinite(projected[0]) ||
            !Number.isFinite(projected[1])
          ) {
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
          if (prev && prev[0] === pj[0] && prev[1] === pj[1]) continue;
          projected.push(pj);
          prev = pj;
        }
        if (projected.length < 3) return null;
        const first = projected[0];
        const last = projected[projected.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          projected.push([first[0], first[1]]);
        }
        if (projected.length < 4) return null;
        return projected;
      };

      for (const feature of baseFC.features || []) {
        const normalized = normalizeGeometry(
          feature?.geometry as GeoJSONGeometry
        );
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
            feature.id != null
          ) {
            ft.setId(feature.id);
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
            feature.id != null
          ) {
            ft.setId(feature.id);
          }
          features.push(ft);
        }
      }

      return features;
    }

    function requireValid(features: Feature<Geometry>[]): Feature<Geometry>[] {
      return features.filter((ft) => {
        const geom = ft.getGeometry?.();
        if (!geom) return false;
        const extent = geom.getExtent();
        return (
          Number.isFinite(extent[0]) &&
          Number.isFinite(extent[1]) &&
          Number.isFinite(extent[2]) &&
          Number.isFinite(extent[3]) &&
          extent[2] !== extent[0] &&
          extent[3] !== extent[1]
        );
      });
    }
  }
  return null;
}

function normalizeFeatureProps(f: any, idx: number) {
  const p = f.getProperties ? f.getProperties() : {};
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
  let idVal: any = idKeys
    .map((k) => p?.[k])
    .find((v) => v !== undefined && v !== null && String(v) !== "");
  if (idVal === undefined) idVal = `feat_${idx}`;
  f.set("id", String(idVal));

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
  const hasLetters = (v: any) =>
    typeof v === "string" && v.trim() !== "" && /[A-Za-z]/.test(v);
  let nameVal: any = nameKeys.map((k) => p?.[k]).find(hasLetters);
  if (!nameVal) {
    const dynKey = Object.keys(p || {}).find((k) =>
      /kec|kel|desa|kab|nama|name/i.test(k)
    );
    const dynVal = dynKey ? p[dynKey] : undefined;
    if (hasLetters(dynVal)) nameVal = dynVal;
  }
  if (nameVal) f.set("name", String(nameVal).trim());
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
    const v = props?.[k];
    if (typeof v === "string" && v.trim() !== "" && /[A-Za-z]/.test(v))
      return v.trim();
  }
  const dynKey = Object.keys(props || {}).find((k) =>
    /kec|kel|desa|kab|nama|name/i.test(k)
  );
  const dynVal = dynKey ? props[dynKey] : undefined;
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
  } = useMapStore();
  const setLayersMap = useLayersStore((s) => s.setMap);
  const addLayerToMgr = useLayersStore((s) => s.addLayer);
  const topFirst = useLayersStore((s) => s.topFirst);

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

    // Auto load contoh
    (async () => {
      if (autoLoadOnceRef.current) return;
      autoLoadOnceRef.current = true;

      try {
        const ab = await fetch(ADMIN_SRC).then((r) => r.arrayBuffer());
        const parsed = await shp(ab);
        const fc = pickFeatureCollection(parsed);
        if (!fc) return;

        const fmt = geojsonFmtRef.current!;
        const feats = fmt.readFeatures(fc, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }) as any[];
        feats.forEach((ft, i) => normalizeFeatureProps(ft, i));

        // VALIDASI & FIT AMAN
        const cloned = feats.map((f) => f.clone());
        const validFeats = cloned.filter((ft: any) => {
          const g = ft.getGeometry?.();
          if (!g) return false;
          const e = g.getExtent();
          return (
            Number.isFinite(e[0]) &&
            Number.isFinite(e[1]) &&
            Number.isFinite(e[2]) &&
            Number.isFinite(e[3])
          );
        });

        const src = new VectorSource({ features: validFeats });

        const styleCfg = {
          borderColor: "#10b981",
          borderOpacity: 1,
          borderStyle: "Solid",
          borderWidth: 1.6,
          fillColor: "#34d399",
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

        lyr.set("appKind", "kecamatan");
        lyr.set("appName", "Batas Kecamatan");

        map.addLayer(lyr);

        const newId = `kecamatan-${Date.now()}`;
        addLayerToMgr({
          id: newId,
          name: "Batas Kecamatan",
          kind: "kecamatan",
          layer: lyr,
          visible: true,
          styleCfg,
        });

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
            layerId: newId,
            geom: new GeoJSON().writeGeometryObject(geom4326),
          });
          window.dispatchEvent(
            new CustomEvent("highlight-layer-entry", {
              detail: { layerId: newId, featureId: id },
            })
          );
        }
      } catch {
        // user bisa Import + Load
      }
    })();

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
      const readFeatures = (source: GeoJSONFeatureCollection) => {
        try {
          return fmt.readFeatures(source, {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
          }) as Feature<Geometry>[];
        } catch (error) {
          console.error("readFeatures gagal:", error);
          return [];
        }
      };

      let features = requireValid(readFeatures(fcSource));

      if (!features.length) {
        console.warn(
          "No valid features found after normalization, trying raw OL read + manual builder"
        );

        const swappedFC: GeoJSONFeatureCollection = {
          ...fcSource,
          features: (fcSource.features || []).map((feat: GeoJSONFeature) => {
            if (!feat?.geometry) return feat;
            const swappedGeom = swapGeometryCoordinates(
              feat.geometry as GeoJSONGeometry
            );
            return {
              ...feat,
              geometry: swappedGeom ?? feat.geometry,
            };
          }),
        };

        features = requireValid(readFeatures(swappedFC));

        if (!features.length) {
          const samples = sampleCoordsFromFC(fcSource);
          const asDegrees = looksLikeLonLatSample(samples);
          for (const order of ["xy", "yx"] as const) {
            const manual = manualBuildFeatures(fcSource, order, asDegrees);
            const validManual = requireValid(manual);
            if (validManual.length) {
              features = validManual;
              break;
            }
          }
        }
      }

      if (!features.length) {
        console.warn(
          "Semua fitur punya extent kosong setelah import atau manual fallback gagal."
        );
        return;
      }

      features.forEach((ft, idx) => normalizeFeatureProps(ft, idx));

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
    map.on("pointermove", (e) => {
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
    });

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
        return;
      }

      const id = String((found as any).get("id") || "");
      const name =
        String((found as any).get("name") || "") ||
        featureName(found as any) ||
        "-";
      setSelectedId(id);

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

    // Kirim seluruh properties utk editor (kecuali geometry)
    const onRequestProps = (ev: Event) => {
      const { id, layerId } = (ev as CustomEvent<any>).detail || {};
      if (!id) return;

      const st = useLayersStore.getState();
      const targets = layerId
        ? st.layers.filter((l) => l.id === layerId)
        : st.layers;

      let props: Record<string, any> = {};
      for (const le of targets) {
        const src = (le.layer as VectorLayer<VectorSource>).getSource?.();
        if (!src) continue;
        const ft = src
          .getFeatures()
          .find((f: any) => String(f.get("id") || "") === String(id));
        if (!ft) continue;
        const raw = ft.getProperties?.() || {};
        const { geometry, geom, the_geom, _geom, ...rest } = raw;
        props = rest;
        break;
      }

      window.dispatchEvent(
        new CustomEvent("feature-props-response", {
          detail: { id, layerId, props },
        })
      );
    };
    window.addEventListener("request-feature-props", onRequestProps as any);

    // Apply props + sinkron id/name jika alias diubah
    const onApplyFeatureProps = (ev: Event) => {
      const {
        id,
        layerId,
        updates = {},
        deletes = [],
      } = (ev as CustomEvent<any>).detail || {};
      if (!id) return;

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

        Object.keys(updates).forEach((k) => {
          if (/^(geometry|geom|the_geom|_geom)$/i.test(k)) return;
          ft.set(k, updates[k]);
        });
        (deletes as string[]).forEach((k) => {
          if (/^(geometry|geom|the_geom|_geom)$/i.test(k)) return;
          try {
            (ft as any).unset?.(k, true);
          } catch {}
        });

        // bila user mengubah kode/nama via alias resmi, ikutkan ke id/name
        const pickFirst = (keys: string[]) => {
          for (const k of keys)
            if (k in updates && String(updates[k]).trim() !== "")
              return String(updates[k]).trim();
          return undefined;
        };
        const newIdMaybe = pickFirst(CODE_KEYS);
        const newNameMaybe = pickFirst(NAME_KEYS);
        if (newIdMaybe) ft.set("id", newIdMaybe);
        if (newNameMaybe) ft.set("name", newNameMaybe);

        (le.layer as any).changed?.();

        const idNow = String((ft as any).get("id") || "");
        const nameNow =
          String((ft as any).get("name") || "") || featureName(ft as any) || "";
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
        break;
      }
    };
    window.addEventListener("apply-feature-props", onApplyFeatureProps as any);

    return () => {
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

      const hs = hoverStateRef.current;
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

  return <div ref={mapDiv} className="map" />;
}
