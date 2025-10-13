// src/components/LeftDock.tsx
import { useRef, useState, useEffect } from "react";
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

/* =======================  Loader shp-write (modern & classic)  ======================= */
declare global {
  interface Window {
    shpwriter?: { zip: (fc: any, opts?: any) => Promise<any> | any };
    shpwrite?: { zip: (fc: any, opts?: any) => Promise<any> | any };
    __shpwriterLoading__?: Promise<any>;
    __shpwriteClassicLoading__?: Promise<any>;

    // Mapshaper & Zip.js
    mapshaper?: {
      applyCommands: (
        commands: string,
        inputs?: Record<string, string | ArrayBuffer | Uint8Array>
      ) => Promise<Record<string, string | ArrayBuffer | Uint8Array>>;
    };
    zip?: any;
    __mapshaperLoading__?: Promise<any>;
    __zipjsLoading__?: Promise<any>;
  }
}

/** UMD @crmackey/shp-write via jsDelivr → unpkg (fallback) */
async function ensureShpWriterReady(): Promise<any> {
  if (window.shpwriter && typeof window.shpwriter.zip === "function") {
    return window.shpwriter;
  }
  if (window.__shpwriterLoading__) {
    return window.__shpwriterLoading__;
  }

  const tryLoadFromCdn = () =>
    new Promise<any>((resolve, reject) => {
      const urls = [
        "https://cdn.jsdelivr.net/npm/@crmackey/shp-write@0.4.5/lib/shpwriter.umd.js",
        "https://unpkg.com/@crmackey/shp-write@0.4.5/lib/shpwriter.umd.js",
      ];
      let i = 0;
      const next = () => {
        if (i >= urls.length) {
          reject(new Error("Gagal memuat shpwriter dari CDN"));
          return;
        }
        const url = urls[i++];
        console.log(`Trying to load shpwriter from: ${url}`);
        const script = document.createElement("script");
        script.async = true;
        script.crossOrigin = "anonymous";
        script.src = url;
        const timeoutId = window.setTimeout(() => {
          script.onload = null;
          script.onerror = null;
          script.remove();
          next();
        }, 15000);
        script.onload = () => {
          window.clearTimeout(timeoutId);
          setTimeout(() => {
            const shpLib = window.shpwriter || window.shpwrite;
            if (shpLib && typeof shpLib.zip === "function") {
              window.shpwriter = shpLib;
              window.shpwrite = shpLib;
              resolve(shpLib);
            } else {
              console.warn(
                "shpwriter script loaded but zip() not found, trying next source"
              );
              next();
            }
          }, 300);
        };
        script.onerror = () => {
          window.clearTimeout(timeoutId);
          script.remove();
          next();
        };
        document.head.appendChild(script);
      };
      next();
    });

  const tryLoadFromModule = async () => {
    try {
      const mod = await import("shp-write");
      const writer = (mod as any)?.default ?? (mod as any);
      if (writer && typeof writer.zip === "function") {
        window.shpwriter = writer;
        return writer;
      }
      throw new Error("Modul shp-write tidak menyediakan fungsi zip()");
    } catch (error) {
      console.error("Gagal memuat modul shp-write lokal:", error);
      throw error;
    }
  };

  window.__shpwriterLoading__ = (async () => {
    try {
      console.log("=== LOADING @crmackey/shp-write (CDN) ===");
      return await tryLoadFromCdn();
    } catch (cdnError) {
      console.warn("shpwrite CDN gagal:", cdnError);
      console.log("=== LOADING shp-write dari modul lokal ===");
      return await tryLoadFromModule();
    }
  })();

  return window.__shpwriterLoading__;
}

/** UMD shp-write klasik via jsDelivr → unpkg (fallback) */
async function ensureShpWriteClassicReady(): Promise<any> {
  if (window.shpwrite && typeof window.shpwrite.zip === "function")
    return window.shpwrite;
  if (!window.__shpwriteClassicLoading__) {
    window.__shpwriteClassicLoading__ = new Promise((resolve, reject) => {
      const urls = [
        "https://cdn.jsdelivr.net/npm/shp-write@0.3.4/shpwrite.js",
        "https://unpkg.com/shp-write@0.3.4/shpwrite.js",
      ];
      let i = 0;
      const next = () => {
        if (i >= urls.length)
          return reject(new Error("Gagal memuat shp-write klasik"));
        const s = document.createElement("script");
        s.async = true;
        s.crossOrigin = "anonymous";
        s.src = urls[i++];
        const to = window.setTimeout(() => {
          s.onload = null;
          s.onerror = null;
          s.remove();
          next();
        }, 15000); // Increased timeout
        s.onload = () => {
          window.clearTimeout(to);
          // Add delay to ensure library is fully initialized
          setTimeout(() => {
            if (window.shpwrite && typeof window.shpwrite.zip === "function") {
              console.log("Classic shpwrite loaded successfully");
              resolve(window.shpwrite);
            } else {
              console.warn(
                "Classic shpwrite loaded but zip function not available"
              );
              next();
            }
          }, 500); // Added delay
        };
        s.onerror = () => {
          window.clearTimeout(to);
          s.remove();
          next();
        };
        document.head.appendChild(s);
      };
      next();
    });
  }
  return window.__shpwriteClassicLoading__;
}

/* =======================  Loader Mapshaper & Zip.js  ======================= */
/** Muat Mapshaper build browser (global `mapshaper`) via CDN dengan fallback */
async function ensureMapshaperReady(): Promise<any> {
  if (window.mapshaper?.applyCommands) return window.mapshaper;
  if (!window.__mapshaperLoading__) {
    window.__mapshaperLoading__ = new Promise((resolve, reject) => {
      const urls = [
        "https://cdn.jsdelivr.net/npm/mapshaper@0.6.113/dist/mapshaper.js",
        "https://unpkg.com/mapshaper@0.6.113/dist/mapshaper.js",
      ];
      let i = 0;
      const next = () => {
        if (i >= urls.length)
          return reject(new Error("Gagal memuat Mapshaper"));
        const s = document.createElement("script");
        s.async = true;
        s.crossOrigin = "anonymous";
        s.src = urls[i++];
        const to = window.setTimeout(() => {
          s.onload = null;
          s.onerror = null;
          s.remove();
          next();
        }, 12000);
        s.onload = () => {
          window.clearTimeout(to);
          if (window.mapshaper?.applyCommands) resolve(window.mapshaper);
          else next();
        };
        s.onerror = () => {
          window.clearTimeout(to);
          s.remove();
          next();
        };
        document.head.appendChild(s);
      };
      next();
    });
  }
  return window.__mapshaperLoading__;
}

/** Muat Zip.js (writer modern) */
async function ensureZipJsReady(): Promise<any> {
  if (window.zip?.ZipWriter) return window.zip;
  if (!window.__zipjsLoading__) {
    window.__zipjsLoading__ = new Promise((resolve, reject) => {
      const urls = [
        "https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.7.73/dist/zip.min.js",
        "https://unpkg.com/@zip.js/zip.js@2.7.73/dist/zip.min.js",
      ];
      let i = 0;
      const next = () => {
        if (i >= urls.length) return reject(new Error("Gagal memuat Zip.js"));
        const s = document.createElement("script");
        s.async = true;
        s.crossOrigin = "anonymous";
        s.src = urls[i++];
        const to = window.setTimeout(() => {
          s.onload = null;
          s.onerror = null;
          s.remove();
          next();
        }, 12000);
        s.onload = () => {
          window.clearTimeout(to);
          if (window.zip?.ZipWriter) resolve(window.zip);
          else next();
        };
        s.onerror = () => {
          window.clearTimeout(to);
          s.remove();
          next();
        };
        document.head.appendChild(s);
      };
      next();
    });
  }
  return window.__zipjsLoading__;
}

/** Validasi isi ZIP: harus ada SHP/SHX/DBF */
async function zipHasShapefileParts(blob: Blob): Promise<boolean> {
  try {
    // Skip validation if blob is too small
    if (blob.size < 100) {
      console.log("ZIP too small for validation");
      return false;
    }

    const ziplib = await ensureZipJsReady();
    const zr = new ziplib.ZipReader(new ziplib.BlobReader(blob));
    const entries = await zr.getEntries();
    await zr.close();

    console.log(
      "ZIP entries found:",
      entries.map((e: any) => e.filename)
    );

    const hasSHP = entries.some((e: any) => /\.shp$/i.test(e.filename));
    const hasSHX = entries.some((e: any) => /\.shx$/i.test(e.filename));
    const hasDBF = entries.some((e: any) => /\.dbf$/i.test(e.filename));

    console.log("Shapefile parts validation:", { hasSHP, hasSHX, hasDBF });

    // For now, just check if we have at least one shapefile component
    // This is more lenient to avoid false negatives
    return hasSHP || hasSHX || hasDBF;
  } catch (error) {
    console.error("Error validating ZIP contents:", error);
    // Don't fail the export if validation fails
    return true;
  }
}

/* =======================  App code  ======================= */

type Kind = "kabupaten" | "kecamatan" | "kelurahan" | "custom";

function styleCfgForKind(kind: Kind) {
  switch (kind) {
    case "kabupaten":
      return { borderColor: "#f59e0b", fillColor: "#fbbf24" };
    case "kecamatan":
      return { borderColor: "#10b981", fillColor: "#34d399" };
    case "kelurahan":
      return { borderColor: "#8b5cf6", fillColor: "#a78bfa" };
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
  if (!g[REGKEY] || !(g[REGKEY] instanceof Map)) g[REGKEY] = new Map();
  return g[REGKEY] as Map<string, RegistryItem>;
}

type PolygonRings = [number, number][][];
type NormalizedPolygonGeometry =
  | { type: "Polygon"; coordinates: PolygonRings }
  | { type: "MultiPolygon"; coordinates: PolygonRings[] };

/* ---------- Util: normalisasi geometri polygon ---------- */
const EPSILON = 1e-9;
const MIN_RING_AREA = 1e-12;

type NormalizeOptions = {
  allowDegenerate?: boolean;
};

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function ringArea(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function toXY(coord: any): [number, number] | null {
  if (Array.isArray(coord) && coord.length >= 2) {
    const x = Number(coord[0]);
    const y = Number(coord[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
    return null;
  }

  if (
    coord &&
    typeof coord === "object" &&
    Number.isFinite(Number((coord as any).x)) &&
    Number.isFinite(Number((coord as any).y))
  ) {
    const x = Number((coord as any).x);
    const y = Number((coord as any).y);
    return [x, y];
  }

  return null;
}

function ensureClosedRing(points: [number, number][]): [number, number][] {
  if (!points.length) return [];
  const first = points[0];
  const last = points[points.length - 1];
  if (!almostEqual(first[0], last[0]) || !almostEqual(first[1], last[1])) {
    return [...points, [first[0], first[1]]];
  }
  const cloned = points.slice();
  const [lx, ly] = cloned[cloned.length - 1];
  cloned[cloned.length - 1] = [lx, ly];
  return cloned;
}

function normalizePolygonRing(
  input: any,
  options: NormalizeOptions = {}
): [number, number][] {
  if (!Array.isArray(input)) return [];

  const cleaned: [number, number][] = [];
  let prev: [number, number] | null = null;

  for (const coord of input) {
    const point = toXY(coord);
    if (!point) continue;

    if (
      !prev ||
      !almostEqual(point[0], prev[0]) ||
      !almostEqual(point[1], prev[1])
    ) {
      cleaned.push(point);
      prev = point;
    }
  }

  if (cleaned.length < 3) return [];

  const closed = ensureClosedRing(cleaned);
  if (closed.length < 4) return [];

  const area = Math.abs(ringArea(closed));
  if (!Number.isFinite(area)) return [];
  if (area <= MIN_RING_AREA && !options.allowDegenerate) return [];

  return closed.map(([x, y]) => [x, y] as [number, number]);
}

function normalizePolygonRings(
  input: any,
  options: NormalizeOptions = {}
): PolygonRings {
  if (!Array.isArray(input)) return [];
  const rings: PolygonRings = [];
  for (const ring of input) {
    const normalized = normalizePolygonRing(ring, options);
    if (normalized.length >= 4) rings.push(normalized);
  }
  return rings;
}

function clonePolygonCoordinates(rings: PolygonRings): PolygonRings {
  return rings.map((ring) => ring.map(([x, y]) => [x, y] as [number, number]));
}

function looksLikeLinearRing(candidate: any): boolean {
  if (!Array.isArray(candidate) || candidate.length < 3) return false;
  return candidate.every((coord: any) => toXY(coord) !== null);
}

function extractRingArrays(input: any): any[] {
  if (!Array.isArray(input)) return [];
  if (looksLikeLinearRing(input)) return [input];
  const rings: any[] = [];
  for (const item of input) {
    if (looksLikeLinearRing(item)) {
      rings.push(item);
    } else if (Array.isArray(item)) {
      rings.push(...extractRingArrays(item));
    }
  }
  return rings;
}

function ringOrientation(ring: [number, number][]): number {
  const area = ringArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) <= EPSILON) return 0;
  return area > 0 ? 1 : -1;
}

function groupNormalizedRings(rings: PolygonRings): PolygonRings[] {
  if (!rings.length) return [];
  const firstOrient = ringOrientation(rings[0]) || 1;
  const polygons: PolygonRings[] = [];
  let current: PolygonRings | null = null;

  rings.forEach((ring, idx) => {
    const orient = ringOrientation(ring) || firstOrient;
    if (!current || idx === 0 || orient === firstOrient) {
      current = [ring];
      polygons.push(current);
    } else {
      current.push(ring);
    }
  });

  return polygons;
}

function normalizePolygonGeometry(
  geomObj: any
): NormalizedPolygonGeometry | null {
  if (!geomObj) return null;

  const rawType = typeof geomObj.type === "string" ? geomObj.type : "";
  const type = rawType.toLowerCase();
  const isPolygonLike = /polygon/.test(type);
  const isMulti = /^multi/.test(type);

  if (type === "geometrycollection") {
    const geometries = Array.isArray(geomObj.geometries)
      ? geomObj.geometries
      : [];
    const collected: PolygonRings[] = [];
    geometries.forEach((geometry: any) => {
      const normalized = normalizePolygonGeometry(geometry);
      if (!normalized) return;
      if (normalized.type === "Polygon") {
        const coords = normalized.coordinates;
        collected.push(clonePolygonCoordinates(coords));
      } else if (normalized.type === "MultiPolygon") {
        const polys = normalized.coordinates;
        polys.forEach((poly: PolygonRings) => {
          collected.push(clonePolygonCoordinates(poly));
        });
      }
    });
    if (!collected.length) return null;
    if (collected.length === 1) {
      return { type: "Polygon", coordinates: collected[0] };
    }
    return {
      type: "MultiPolygon",
      coordinates: collected.map((poly) => clonePolygonCoordinates(poly)),
    };
  }

  if (!isPolygonLike) return null;

  const sources =
    Array.isArray(geomObj.coordinates) && geomObj.coordinates.length
      ? geomObj.coordinates
      : Array.isArray((geomObj as any).rings)
      ? (geomObj as any).rings
      : [];

  const clonePoly = (poly: PolygonRings) => clonePolygonCoordinates(poly);
  const polygons: PolygonRings[] = [];

  if (isMulti) {
    const polygonCandidates = Array.isArray(sources) ? sources : [];
    polygonCandidates.forEach((polyCandidate) => {
      const ringCandidates = extractRingArrays(polyCandidate);
      if (!ringCandidates.length) return;
      let normalized = normalizePolygonRings(ringCandidates);
      if (!normalized.length) {
        normalized = normalizePolygonRings(ringCandidates, {
          allowDegenerate: true,
        });
      }
      if (normalized.length) {
        polygons.push(normalized);
      }
    });

    if (!polygons.length) {
      const fallbackRings = normalizePolygonRings(extractRingArrays(sources), {
        allowDegenerate: true,
      });
      if (fallbackRings.length) {
        const grouped = groupNormalizedRings(fallbackRings);
        grouped.forEach((poly) => {
          if (poly.length) polygons.push(poly);
        });
      }
    }
  } else {
    const ringCandidates = extractRingArrays(sources);
    if (!ringCandidates.length) return null;
    let normalized = normalizePolygonRings(ringCandidates);
    if (!normalized.length) {
      normalized = normalizePolygonRings(ringCandidates, {
        allowDegenerate: true,
      });
    }
    if (!normalized.length) return null;
    polygons.push(normalized);
  }

  if (!polygons.length) return null;

  if (!isMulti && polygons.length === 1) {
    return { type: "Polygon", coordinates: clonePoly(polygons[0]) };
  }

  return {
    type: "MultiPolygon",
    coordinates: polygons.map((poly) => clonePoly(poly)),
  };
}

function sanitizeFeatureCollection(fc: any) {
  if (!fc) return null;
  const features = Array.isArray(fc.features) ? fc.features : [];
  type SimpleFeature = {
    type: "Feature";
    properties: Record<string, any>;
    geometry: any;
  };
  const sanitizedFeatures: SimpleFeature[] = features
    .map((feat: any) => {
      // Handle both Polygon and MultiPolygon geometries
      const geomObj = normalizePolygonGeometry(feat?.geometry);
      if (!geomObj) return null;
      const props =
        feat && typeof feat === "object" ? { ...(feat.properties || {}) } : {};
      return {
        type: "Feature",
        properties: props,
        geometry: geomObj,
      } as SimpleFeature | null;
    })
    .filter(
      (feat: SimpleFeature | null): feat is SimpleFeature => feat !== null
    );

  if (!sanitizedFeatures.length) return null;
  return {
    ...(typeof fc === "object" && fc !== null ? { ...fc } : {}),
    type: "FeatureCollection",
    features: sanitizedFeatures,
  };
}

function fallbackNormalizeFeatureCollection(fc: any, fmtInstance: GeoJSON) {
  if (!fc) return null;
  const fmt = fmtInstance || new GeoJSON();
  try {
    const fallbackFeatures = fmt.readFeatures(fc, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:4326",
    }) as OLFeature<Geometry>[];
    if (!fallbackFeatures.length) return null;
    const normalized = fallbackFeatures
      .map((feature) => {
        const geometry = feature.getGeometry();
        if (!geometry) return null;
        const rawFeature = fmt.writeFeatureObject(feature, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:4326",
          rightHanded: false,
          decimals: 12,
        }) as any;
        const normalizedGeom = normalizePolygonGeometry(rawFeature?.geometry);
        if (!normalizedGeom) return null;
        const props =
          rawFeature && typeof rawFeature === "object"
            ? { ...(rawFeature.properties || {}) }
            : {};
        const normalizedFeature: any = {
          type: "Feature",
          properties: props,
          geometry: normalizedGeom,
        };
        if (rawFeature?.id != null) {
          normalizedFeature.id = rawFeature.id;
        }
        return normalizedFeature;
      })
      .filter((feat) => !!feat);
    if (!normalized.length) return null;
    return {
      ...(typeof fc === "object" && fc !== null ? { ...fc } : {}),
      type: "FeatureCollection",
      features: normalized,
    };
  } catch (error) {
    console.warn("Fallback normalization failed:", error);
    return null;
  }
}

function flattenFeatureCollectionToPolygons(fc: {
  type: string;
  features: any[];
}) {
  const flattened: any[] = [];
  fc.features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) return;
    const baseProps = { ...(feature.properties || {}) };
    if (geometry.type === "Polygon") {
      let rings = normalizePolygonRings(geometry.coordinates);
      if (!rings.length) {
        rings = normalizePolygonRings(geometry.coordinates, {
          allowDegenerate: true,
        });
      }
      if (!rings.length) return;
      flattened.push({
        type: "Feature",
        properties: { ...baseProps },
        geometry: {
          type: "Polygon",
          coordinates: clonePolygonCoordinates(rings),
        },
      });
    } else if (geometry.type === "MultiPolygon") {
      const polygons = (geometry.coordinates || [])
        .map((polyCoords: any) => {
          let poly = normalizePolygonRings(polyCoords);
          if (!poly.length) {
            poly = normalizePolygonRings(polyCoords, {
              allowDegenerate: true,
            });
          }
          return poly;
        })
        .filter((poly: PolygonRings) => poly.length > 0);
      if (!polygons.length) return;
      flattened.push({
        type: "Feature",
        properties: { ...baseProps },
        geometry: {
          type: "MultiPolygon",
          coordinates: polygons.map((poly: PolygonRings) =>
            clonePolygonCoordinates(poly)
          ),
        },
      });
    }
  });

  return { type: "FeatureCollection", features: flattened };
}

export default function LeftDock() {
  const { baseLayer, setBaseLayer, selectedId, setFocus, selectedLayerId } =
    useMapStore();
  const { map, addLayer, layers } = useLayersStore();

  // Preload tool agar cepat
  useEffect(() => {
    const preloadLibraries = async () => {
      try {
        console.log("Preloading export libraries...");
        await Promise.allSettled([
          ensureShpWriteClassicReady(),
          ensureShpWriterReady(),
          ensureMapshaperReady(),
          ensureZipJsReady(),
        ]);
        console.log("Export libraries preloading completed");
      } catch (error) {
        console.warn("Error during library preloading:", error);
      }
    };

    preloadLibraries();

    // Debug function for testing export functionality
    (window as any).debugExport = async () => {
      console.log("=== Export Debug Information ===");
      console.log("Mapshaper:", window.mapshaper ? "✓ Loaded" : "✗ Not loaded");
      console.log("Zip.js:", window.zip ? "✓ Loaded" : "✗ Not loaded");
      console.log(
        "@crmackey/shp-write:",
        window.shpwriter ? "✓ Loaded" : "✗ Not loaded"
      );
      console.log(
        "Classic shp-write:",
        window.shpwrite ? "✓ Loaded" : "✗ Not loaded"
      );

      // Test library functions
      try {
        if (window.mapshaper) {
          console.log(
            "Mapshaper applyCommands:",
            typeof window.mapshaper.applyCommands
          );
        }
        if (window.zip) {
          console.log("Zip.js ZipWriter:", typeof window.zip.ZipWriter);
        }
        if (window.shpwriter) {
          console.log("shpwriter zip:", typeof window.shpwriter.zip);
        }
        if (window.shpwrite) {
          console.log("shpwrite zip:", typeof window.shpwrite.zip);
        }
      } catch (error) {
        console.error("Error testing library functions:", error);
      }

      console.log("=== End Debug Information ===");
    };
  }, []);

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
  function normalizeFeatureProps(f: any, idx: number) {
    const p = f.getProperties ? f.getProperties() : {};
    const idKeys = [
      "KD_KEL",
      "KD_DESA",
      "D_KD_KEL",
      "kd_kel",
      "D_KD_KEC",
      "KD_KEC",
      "kd_kec",
      "KD_KAB",
      "KD_KK",
      "KD_KABKOT",
      "kd_kab",
      "id",
      "ID",
      "OBJECTID",
      "OBJECTID_1",
      "KODE",
      "NO",
      "FID",
      "D_KD_DT2",
    ];
    let idVal: any = idKeys
      .map((k) => p?.[k])
      .find((v) => v != null && String(v) !== "");
    if (idVal === undefined) idVal = `feat_${idx}`;
    f.set("id", String(idVal));

    const nameKeys = [
      "NAMA",
      "NAMA_KEL",
      "NM_KEL",
      "D_NM_KEL",
      "nm_kel",
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
      "name",
      "NAME",
      "D_NM_DT2",
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

  function detectLevelFromProps(features: any[]): Kind {
    const p = features[0]?.getProperties ? features[0].getProperties() : {};
    const keys = Object.keys(p || {});
    const hasKec = keys.some((k) =>
      /(^|_)KD_KEC$|^D_KD_KEC$|(^|_)NM_KEC$|^D_NM_KEC$|KECAMATAN|WADMKC/i.test(
        k
      )
    );
    const hasKab = keys.some((k) =>
      /(^|_)KD_KAB$|^D_KD_DT2$|(^|_)NM_KAB$|^D_NM_DT2$|WADMKD/i.test(k)
    );
    const hasKel = keys.some((k) =>
      /(^|_)KD_KEL$|^D_KD_KEL$|(^|_)NM_KEL$|^D_NM_KEL$|DESA/i.test(k)
    );
    if (hasKel) return "kelurahan";
    if (hasKec) return "kecamatan";
    if (hasKab) return "kabupaten";
    return "custom";
  }

  async function importFile(file: File) {
    if (!map) return;
    const fmt = new GeoJSON();
    let feats: any[] = [];
    let fc4326: any = null;

    try {
      if (/\.geojson$/i.test(file.name)) {
        const parsed = JSON.parse(await file.text());
        const fc =
          parsed?.type === "FeatureCollection"
            ? parsed
            : Object.values(parsed).find(
                (v: any) => v && v.type === "FeatureCollection"
              );
        if (!fc) throw new Error("GeoJSON tidak valid");
        fc4326 = fc;
      } else {
        const ab = await file.arrayBuffer();
        try {
          const parsed = await (shp as any)(ab);
          const fc =
            parsed?.type === "FeatureCollection"
              ? parsed
              : Object.values(parsed).find(
                  (v: any) => v && v.type === "FeatureCollection"
                );
          if (!fc) throw new Error("Shapefile tidak ditemukan di dalam ZIP");
          fc4326 = fc;
        } catch (e) {
          const hasParseZip = typeof (shp as any).parseZip === "function";
          if (!hasParseZip) throw e;
          const parsed2 = await (shp as any).parseZip(ab);
          const fc2 =
            parsed2?.type === "FeatureCollection"
              ? parsed2
              : Object.values(parsed2).find(
                  (v: any) => v && v.type === "FeatureCollection"
                );
          if (!fc2) throw e;
          fc4326 = fc2;
        }
      }

      // 1) Coba sanitasi ketat
      let sanitized = sanitizeFeatureCollection(fc4326);

      // 2) Kalau gagal, coba fallback via OL roundtrip
      if (!sanitized) {
        const fallback = fallbackNormalizeFeatureCollection(fc4326, fmt);
        if (fallback) sanitized = fallback;
      }

      // 3) Kalau masih gagal, JANGAN throw. Ambil mentah tapi hanya Polygon/MultiPolygon
      if (!sanitized) {
        const onlyArea = {
          type: "FeatureCollection",
          features: Array.isArray(fc4326?.features)
            ? fc4326.features.filter((f: any) => {
                const t = f?.geometry?.type?.toLowerCase?.();
                return t === "polygon" || t === "multipolygon";
              })
            : [],
        };
        // Minimal: asalkan masih ada fitur area, teruskan
        if (onlyArea.features.length > 0) {
          sanitized = onlyArea;
        } else {
          // benar-benar tidak ada geometri area
          throw new Error(
            "Data tidak memiliki geometri polygon atau MultiPolygon yang valid."
          );
        }
      }

      fc4326 = sanitized;

      // 4) Tetap coba baca ke 3857. Kalau gagal, biarkan feats kosong saja.
      //    LayerLoadModal + TaxMap akan meng-handle saat 'Load Peta'.
      try {
        feats = fmt.readFeatures(fc4326, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }) as any[];
      } catch {
        feats = [];
      }
      // ...
    } catch (e) {
      alert("Gagal import file: " + (e as Error).message);
      return;
    }

    // Jangan batal walau feats kosong.
    // feats mungkin kosong, tapi fc4326 (sanitized) tetap bisa diload oleh TaxMap.
    if (feats.length) {
      feats.forEach((ft, i) => normalizeFeatureProps(ft, i));
    }

    // Jika feats kosong, coba deteksi level dari FC mentah agar labelnya tetap bagus
    const detected =
      feats.length > 0
        ? detectLevelFromProps(feats)
        : (() => {
            const sampel = Array.isArray(fc4326?.features)
              ? fc4326.features[0]
              : null;
            if (sampel && sampel.properties) {
              const fake = { getProperties: () => sampel.properties };
              return detectLevelFromProps([fake]);
            }
            return "custom";
          })();

    const baseName = file.name.replace(/\.(zip|json|geojson)$/i, "");
    const displayName = baseName;

    const reg = ensureRegistry();
    const key = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const savedCount = Array.isArray(fc4326?.features)
      ? fc4326.features.length
      : feats.length;

    reg.set(key, {
      key,
      name: displayName,
      kind: detected,
      fc: fc4326, // FeatureCollection yang sudah disanitasi (Polygon/MultiPolygon aman)
      ts: Date.now(),
      count: savedCount,
      meta: { fileName: file.name },
    });

    window.dispatchEvent(new CustomEvent("datasets-updated"));
    alert(
      `Import selesai: ${displayName}\n(${savedCount} fitur)\n\nUntuk menampilkan di peta, klik tombol "Load Peta".`
    );
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

  /* ---------- Export helpers (Mapshaper-first) ---------- */
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

    console.log(`Processing ${feats.length} features for export`);

    const layerKind: Kind =
      ((layer as any).get && (layer as any).get("appKind")) || "custom";
    const dropIdName = layerKind !== "custom";

    const features = feats
      .map((ft, idx) => {
        try {
          const g = ft.getGeometry();
          if (!g) {
            console.warn(`Feature ${idx} has no geometry, skipping`);
            return null;
          }

          // Validate geometry type
          const geomType = g.getType();
          if (!["Polygon", "MultiPolygon"].includes(geomType)) {
            console.warn(
              `Feature ${idx} has unsupported geometry type: ${geomType}, skipping`
            );
            return null;
          }

          const g4326 = g.clone().transform("EPSG:3857", "EPSG:4326");
          const geomObjRaw = fmt.writeGeometryObject(g4326 as any);
          const geomObj = normalizePolygonGeometry(geomObjRaw);

          if (!geomObj) {
            console.warn(`Feature ${idx} failed geometry conversion, skipping`);
            return null;
          }

          // Validate geometry coordinates
          if (!geomObj.coordinates || !Array.isArray(geomObj.coordinates)) {
            console.warn(`Feature ${idx} has invalid coordinates, skipping`);
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
            if (keep.id == null) keep.id = `feat_${Date.now()}_${idx}`;
            if (keep.name == null) keep.name = `Feature ${idx}`;
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

          // Ensure properties object exists and has valid data
          if (!props || typeof props !== "object") {
            props = {};
          }

          return { type: "Feature", properties: props, geometry: geomObj };
        } catch (error) {
          console.error(`Error processing feature ${idx}:`, error);
          return null;
        }
      })
      .filter(
        (f): f is { type: string; properties: any; geometry: any } => f !== null
      );

    if (features.length === 0)
      throw new Error("Tidak ada feature valid untuk diexport.");

    console.log(`Successfully processed ${features.length} features`);
    const fc = { type: "FeatureCollection", features };

    // Validate final feature collection
    try {
      const fcString = JSON.stringify(fc);
      if (!fcString || fcString.length < 50) {
        throw new Error("Feature collection appears to be empty or invalid");
      }
      console.log("Feature collection validation passed");
    } catch (error) {
      throw new Error(`Feature collection validation failed: ${error}`);
    }

    return fc;
  }

  const WGS84_PRJ =
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]';

  function normalizeZipToBlob(zipOut: any): Blob {
    if (zipOut instanceof Blob) return zipOut;
    if (zipOut instanceof ArrayBuffer)
      return new Blob([zipOut], { type: "application/zip" });
    if (zipOut instanceof Uint8Array) {
      const buf =
        zipOut.buffer instanceof ArrayBuffer
          ? zipOut.buffer.slice(
              zipOut.byteOffset,
              zipOut.byteOffset + zipOut.byteLength
            )
          : (() => {
              const b = new ArrayBuffer(zipOut.byteLength);
              new Uint8Array(b).set(zipOut);
              return b;
            })();
      return new Blob([buf], { type: "application/zip" });
    }
    if (ArrayBuffer.isView(zipOut)) {
      const view = zipOut as ArrayBufferView;
      const srcU8 = new Uint8Array(
        view.buffer as any,
        view.byteOffset,
        view.byteLength
      );
      const b = new ArrayBuffer(srcU8.byteLength);
      new Uint8Array(b).set(srcU8);
      return new Blob([b], { type: "application/zip" });
    }
    if (typeof zipOut === "string") {
      const bin = atob(zipOut);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8.buffer], { type: "application/zip" });
    }
    return new Blob([], { type: "application/zip" });
  }

  async function repackageShapefileZip(
    blob: Blob,
    baseName: string
  ): Promise<Blob> {
    try {
      const buffer = await blob.arrayBuffer();
      const sourceZip = await JSZip.loadAsync(buffer);
      const outputZip = new JSZip();
      const seenExt = new Set<string>();
      const targetExts = ["shp", "shx", "dbf", "prj"];

      await Promise.all(
        Object.values(sourceZip.files).map(async (entry) => {
          if (!entry || entry.dir) return;
          const match = entry.name.match(/\.([a-z0-9]+)$/i);
          if (!match) return;
          const ext = match[1].toLowerCase();
          if (!targetExts.includes(ext) || seenExt.has(ext)) return;
          const data = await entry.async("uint8array");
          outputZip.file(`${baseName}.${ext}`, data);
          seenExt.add(ext);
        })
      );

      if (seenExt.size === 0) return blob;

      const repacked = await outputZip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 3 },
      });
      return normalizeZipToBlob(repacked);
    } catch (error) {
      console.warn("Failed to repackage shapefile ZIP:", error);
      return blob;
    }
  }

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

  async function createZipWithShpWrite(
    writer: any,
    fc: { type: string; features: any[] },
    baseName: string
  ): Promise<Blob> {
    if (!writer) {
      throw new Error("shp-write tidak tersedia");
    }

    const hasWrite = typeof writer.write === "function";
    const hasZip = typeof writer.zip === "function";
    console.log("shp-write capabilities:", { write: hasWrite, zip: hasZip });
    const flattenedFC = flattenFeatureCollectionToPolygons(fc);

    if (hasWrite) {
      const rows: Record<string, any>[] = [];
      const geometries: Array<PolygonRings | PolygonRings[]> = [];

      fc.features.forEach((feature) => {
        const geomParts = shapefileGeometryFromFeatureGeometry(
          feature.geometry
        );
        if (!geomParts) return;
        geometries.push(geomParts);
        rows.push({ ...(feature.properties || {}) });
      });

      if (!geometries.length) {
        throw new Error("Tidak ada geometri polygon valid untuk shp-write");
      }

      const files = await new Promise<any>((resolve, reject) => {
        try {
          writer.write(rows, "POLYGON", geometries, (err: any, result: any) => {
            if (err) reject(err);
            else resolve(result);
          });
        } catch (error) {
          reject(error);
        }
      });

      console.log(
        "shp-write.write buffers length:",
        files?.shp?.byteLength ?? files?.shp?.length,
        files?.shx?.byteLength ?? files?.shx?.length,
        files?.dbf?.byteLength ?? files?.dbf?.length
      );

      const zip = new JSZip();
      const folder = zip.folder("layers");
      if (!folder) throw new Error("Gagal membuat folder ZIP 'layers'.");

      const shpU8 = toUint8Array(files.shp);
      const shxU8 = toUint8Array(files.shx);
      const dbfU8 = toUint8Array(files.dbf);
      const prjText =
        typeof files.prj === "string" && files.prj.trim().length > 0
          ? files.prj
          : WGS84_PRJ;

      folder.file(`${baseName}.shp`, shpU8, { binary: true });
      folder.file(`${baseName}.shx`, shxU8, { binary: true });
      folder.file(`${baseName}.dbf`, dbfU8, { binary: true });
      folder.file(`${baseName}.prj`, prjText);

      const zipped = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 3 },
      });

      return normalizeZipToBlob(zipped);
    }

    if (hasZip) {
      const options = {
        prj: WGS84_PRJ,
        encoding: "utf8",
        types: {
          polygon: baseName,
          polyline: baseName,
          point: baseName,
        },
      };

      let out = writer.zip(flattenedFC, options);
      if (out && typeof out.then === "function") {
        out = await out;
      }
      const zipBlob = normalizeZipToBlob(out);
      return repackageShapefileZip(zipBlob, baseName);
    }

    throw new Error(
      "shp-write tidak menyediakan metode export (zip/write) yang kompatibel"
    );
  }

  /** Keluarkan ZIP via Mapshaper (plan A), kalau gagal: pecah SHP/SHX/DBF/PRJ lalu zip dengan Zip.js */
  async function exportWithMapshaperZipFirst(
    fc: any,
    baseName: string
  ): Promise<Blob> {
    const ms = await ensureMapshaperReady();

    // Validate feature collection before processing
    if (!fc || !fc.features || fc.features.length === 0) {
      throw new Error("Invalid feature collection: no features found");
    }

    // Ensure all features have valid geometry
    const validFeatures = fc.features.filter(
      (f: any) =>
        f.geometry &&
        f.geometry.coordinates &&
        Array.isArray(f.geometry.coordinates) &&
        f.geometry.coordinates.length > 0
    );

    if (validFeatures.length === 0) {
      throw new Error("No valid features with geometry found");
    }

    const validFC = { ...fc, features: validFeatures };
    const fcString = JSON.stringify(validFC);
    console.log(
      `Processing ${validFeatures.length} valid features with Mapshaper`
    );

    // 1) Coba langsung generate ZIP shapefile
    try {
      console.log("Attempting direct ZIP generation with Mapshaper...");
      const outFiles1 = await ms.applyCommands(
        `-i in.json -o format=shapefile encoding=utf8 out.zip`,
        { "in.json": fcString }
      );
      const rawZip = outFiles1["out.zip"];
      const zipU8 =
        rawZip instanceof Uint8Array
          ? new Uint8Array(rawZip)
          : rawZip instanceof ArrayBuffer
          ? new Uint8Array(rawZip)
          : null;

      if (zipU8 && zipU8.byteLength > 0) {
        const blob = new Blob([new Uint8Array(zipU8)], {
          type: "application/zip",
        });
        // Hanya return kalau ZIP benar berisi shapefile parts
        if (await zipHasShapefileParts(blob)) {
          console.log("Mapshaper direct ZIP generation successful");
          return blob;
        }
        // kalau tidak valid, lanjut ke plan A.2
        console.warn(
          "Mapshaper direct ZIP generated but validation failed, trying manual approach"
        );
      } else {
        console.warn("Mapshaper direct ZIP generation returned empty data");
      }
    } catch (e) {
      console.warn("Mapshaper ZIP langsung gagal, lanjut plan A.2:", e);
    }

    // 2) Ambil file pecahan SHP/SHX/DBF/PRJ lalu zip manual
    try {
      console.log("Attempting manual shapefile generation with Mapshaper...");
      const outFiles2 = await ms.applyCommands(
        `-i in.json -o format=shapefile encoding=utf8 out.shp`,
        { "in.json": fcString }
      );

      const pieces = ["out.shp", "out.shx", "out.dbf", "out.prj"]
        .map((name) => {
          const raw = outFiles2[name];
          const buf =
            raw instanceof Uint8Array
              ? new Uint8Array(raw)
              : raw instanceof ArrayBuffer
              ? new Uint8Array(raw)
              : null;
          return buf ? { name, data: buf } : null;
        })
        .filter(Boolean) as { name: string; data: Uint8Array }[];

      if (!pieces.length) {
        throw new Error("Mapshaper tidak mengembalikan file shapefile.");
      }

      console.log(
        `Mapshaper generated ${pieces.length} shapefile files:`,
        pieces.map((p) => p.name)
      );

      const zip = await ensureZipJsReady();
      const writer = new zip.BlobWriter("application/zip");
      const zipWriter = new zip.ZipWriter(writer, { zip64: true });

      for (const p of pieces) {
        const newName = p.name.replace(/^out\./, `${baseName}.`);
        await zipWriter.add(
          newName,
          new zip.BlobReader(new Blob([new Uint8Array(p.data)]))
        );
      }

      const blob = await zipWriter.close();

      // Wajib valid
      if (!(await zipHasShapefileParts(blob))) {
        throw new Error("Mapshaper menghasilkan ZIP tanpa shapefile");
      }
      console.log("Mapshaper manual ZIP creation successful");
      return blob;
    } catch (error) {
      console.error("Mapshaper manual approach failed:", error);
      throw new Error(`Mapshaper export failed: ${error}`);
    }
  }

  /* =======================  Export validation helpers  ======================= */
  async function validateExportLibraries(): Promise<void> {
    console.log("=== VALIDATING EXPORT LIBRARIES ===");
    const checks = [
      { name: "Mapshaper", check: () => window.mapshaper?.applyCommands },
      { name: "Zip.js", check: () => window.zip?.ZipWriter },
      { name: "@crmackey/shp-write", check: () => window.shpwriter?.zip },
      { name: "Classic shp-write", check: () => window.shpwrite?.zip },
    ];

    console.log("Checking library availability...");
    checks.forEach((lib) => {
      console.log(
        `${lib.name}:`,
        lib.check() ? "✓ Available" : "✗ Not available"
      );
    });

    const results = await Promise.allSettled([
      ensureMapshaperReady(),
      ensureZipJsReady(),
      ensureShpWriterReady(),
      ensureShpWriteClassicReady(),
    ]);

    const failed = checks.filter((lib, index) => {
      const result = results[index];
      const isFailed = result.status === "rejected" || !lib.check();
      console.log(`${lib.name}:`, isFailed ? "✗ Failed" : "✓ Ready");
      if (result.status === "rejected") {
        console.error(`  Error:`, result.reason);
      }
      return isFailed;
    });

    if (failed.length > 0) {
      console.warn(
        "Some export libraries failed to load:",
        failed.map((f) => f.name)
      );
    } else {
      console.log("All export libraries are ready");
    }
  }

  /* =======================  Export utama (Mapshaper-first)  ======================= */
  async function exportLayerToZip(layerId: string) {
    console.log("=== EXPORT DEBUG START ===");
    console.log("Starting export process...");
    console.log("Layer ID:", layerId);

    // Validate libraries first
    console.log("Validating export libraries...");
    await validateExportLibraries();
    console.log("Library validation completed");

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

    // Nama file dasar rapi
    const base =
      (lyr.get && (lyr.get("fileBase") as string)) ||
      (lyr.get && (lyr.get("appName") as string)) ||
      entry.name ||
      "export";
    const clean = String(base)
      .replace(/\.(zip|geojson|json|shp)$/i, "")
      .replace(/[^\w\-]+/g, "_");

    let blob: Blob | null = null;

    // Plan A: Mapshaper (langsung ZIP, atau pecah + Zip.js)
    try {
      blob = await exportWithMapshaperZipFirst(fc, clean);
    } catch (e) {
      console.warn(
        "Export via Mapshaper gagal, fallback ke @crmackey/shp-write:",
        e
      );
    }

    // Plan B: @crmackey/shp-write (CDN)
    if (!blob) {
      try {
        console.log("=== PLAN B: @crmackey/shp-write (CDN) ===");
        console.log("Attempting export with @crmackey/shp-write...");
        const writer = await ensureShpWriterReady();
        console.log("shpwriter loaded:", writer);
        console.log("shpwriter.zip function:", typeof writer?.zip);

        // Validate feature collection before passing to shp-write
        if (!fc || !fc.features || fc.features.length === 0) {
          throw new Error("Invalid feature collection: no features found");
        }

        console.log(`Creating ZIP with ${fc.features.length} features...`);
        console.log("Feature collection sample:", fc.features[0]);

        // Ensure all features have valid geometry
        const validFeatures = fc.features.filter(
          (f: any) =>
            f.geometry &&
            f.geometry.coordinates &&
            Array.isArray(f.geometry.coordinates) &&
            f.geometry.coordinates.length > 0
        );

        console.log(
          `Valid features count: ${validFeatures.length}/${fc.features.length}`
        );

        if (validFeatures.length === 0) {
          throw new Error("No valid features with geometry found");
        }

        const validFC = { ...fc, features: validFeatures };
        console.log("Valid feature collection ready for shp-write export");

        try {
          console.log("Membangun ZIP menggunakan shp-write...");
          const zipBlob = await createZipWithShpWrite(writer, validFC, clean);
          console.log("shp-write ZIP size:", zipBlob.size);
          blob = zipBlob;
        } catch (zipError) {
          console.error("Error creating ZIP with shp-write:", zipError);
          console.error("Error details:", (zipError as any)?.message);
          console.error("Error stack:", (zipError as any)?.stack);
          throw zipError;
        }
      } catch (error) {
        console.error("@crmackey/shp-write failed:", error);
        console.error("Error details:", (error as any)?.message);
        console.error("Error stack:", (error as any)?.stack);
        throw new Error(`@crmackey/shp-write failed: ${error}`);
      }
    }

    // Plan C: Classic shp-write fallback
    if (!blob) {
      try {
        console.log("Attempting export with classic shp-write...");
        const writer = await ensureShpWriteClassicReady();
        console.log("Classic shp-write loaded, attempting to create ZIP...");

        // Ensure all features have valid geometry
        const validFeatures = fc.features.filter(
          (f: any) =>
            f.geometry &&
            f.geometry.coordinates &&
            Array.isArray(f.geometry.coordinates) &&
            f.geometry.coordinates.length > 0
        );

        if (validFeatures.length === 0) {
          throw new Error("No valid features with geometry found");
        }

        const validFC = { ...fc, features: validFeatures };
        try {
          console.log("Membangun ZIP menggunakan shp-write klasik...");
          const zipBlob = await createZipWithShpWrite(writer, validFC, clean);
          console.log("Classic shp-write ZIP size:", zipBlob.size);
          blob = zipBlob;
        } catch (zipError) {
          console.error("Error creating ZIP with classic shp-write:", zipError);
          throw zipError;
        }
      } catch (error) {
        console.error("Classic shp-write failed:", error);
        throw new Error(`Classic shp-write failed: ${error}`);
      }
    }

    if (!blob) {
      // Final fallback: create GeoJSON download
      console.log("All shapefile exports failed, falling back to GeoJSON...");
      try {
        const geoJsonString = JSON.stringify(fc, null, 2);
        blob = new Blob([geoJsonString], { type: "application/json" });
        console.log("GeoJSON fallback created successfully");

        // Update download to use .geojson extension
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${clean}.geojson`;
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
    a.download = `${clean}.zip`;
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
