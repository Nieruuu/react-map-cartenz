const EPSILON = 1e-9;
const MIN_RING_AREA = 1e-12;

function almostEqual(a, b) {
  return Math.abs(a - b) <= EPSILON;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function toXY(coord) {
  if (Array.isArray(coord) && coord.length >= 2) {
    const x = Number(coord[0]);
    const y = Number(coord[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
    return null;
  }
  if (
    coord &&
    typeof coord === "object" &&
    Number.isFinite(Number(coord.x)) &&
    Number.isFinite(Number(coord.y))
  ) {
    const x = Number(coord.x);
    const y = Number(coord.y);
    return [x, y];
  }
  return null;
}

function ensureClosedRing(points) {
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

function normalizePolygonRing(input, options = {}) {
  if (!Array.isArray(input)) return [];
  const cleaned = [];
  let prev = null;
  for (const coord of input) {
    const point = toXY(coord);
    if (!point) continue;
    if (!prev || !almostEqual(point[0], prev[0]) || !almostEqual(point[1], prev[1])) {
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
  return closed.map(([x, y]) => [x, y]);
}

function normalizePolygonRings(input, options = {}) {
  if (!Array.isArray(input)) return [];
  const rings = [];
  for (const ring of input) {
    const normalized = normalizePolygonRing(ring, options);
    if (normalized.length >= 4) rings.push(normalized);
  }
  return rings;
}

function clonePolygonCoordinates(rings) {
  return rings.map((ring) => ring.map(([x, y]) => [x, y]));
}

function looksLikeLinearRing(candidate) {
  if (!Array.isArray(candidate) || candidate.length < 3) return false;
  return candidate.every((coord) => toXY(coord) !== null);
}

function extractRingArrays(input) {
  if (!Array.isArray(input)) return [];
  if (looksLikeLinearRing(input)) return [input];
  const rings = [];
  for (const item of input) {
    if (looksLikeLinearRing(item)) {
      rings.push(item);
    } else if (Array.isArray(item)) {
      rings.push(...extractRingArrays(item));
    }
  }
  return rings;
}

function ringOrientation(ring) {
  const area = ringArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) <= EPSILON) return 0;
  return area > 0 ? 1 : -1;
}

function groupNormalizedRings(rings) {
  if (!rings.length) return [];
  const firstOrient = ringOrientation(rings[0]) || 1;
  const polygons = [];
  let current = null;
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

function normalizePolygonGeometry(geomObj) {
  if (!geomObj) return null;
  const rawType = typeof geomObj.type === "string" ? geomObj.type : "";
  const type = rawType.toLowerCase();
  const isPolygonLike = /polygon/.test(type);
  const isMulti = /^multi/.test(type);
  if (type === "geometrycollection") {
    const geometries = Array.isArray(geomObj.geometries) ? geomObj.geometries : [];
    const collected = [];
    geometries.forEach((geometry) => {
      const normalized = normalizePolygonGeometry(geometry);
      if (!normalized) return;
      if (normalized.type === "Polygon") {
        collected.push(clonePolygonCoordinates(normalized.coordinates));
      } else if (normalized.type === "MultiPolygon") {
        normalized.coordinates.forEach((poly) => {
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
  const sources = Array.isArray(geomObj.coordinates) && geomObj.coordinates.length
    ? geomObj.coordinates
    : Array.isArray(geomObj.rings)
    ? geomObj.rings
    : [];
  const clonePoly = (poly) => clonePolygonCoordinates(poly);
  const polygons = [];
  if (isMulti) {
    const polygonCandidates = Array.isArray(sources) ? sources : [];
    polygonCandidates.forEach((polyCandidate) => {
      const ringCandidates = extractRingArrays(polyCandidate);
      if (!ringCandidates.length) return;
      let normalized = normalizePolygonRings(ringCandidates);
      if (!normalized.length) {
        normalized = normalizePolygonRings(ringCandidates, { allowDegenerate: true });
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
      normalized = normalizePolygonRings(ringCandidates, { allowDegenerate: true });
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

function sanitizeFeatureCollection(fc) {
  if (!fc) return null;
  const features = Array.isArray(fc.features) ? fc.features : [];
  const sanitizedFeatures = features
    .map((feat) => {
      const geomObj = normalizePolygonGeometry(feat?.geometry);
      if (!geomObj) return null;
      const props =
        feat && typeof feat === "object" ? { ...(feat.properties || {}) } : {};
      return {
        type: "Feature",
        properties: props,
        geometry: geomObj,
      };
    })
    .filter((feat) => feat !== null);
  if (!sanitizedFeatures.length) return null;
  return {
    ...(typeof fc === "object" && fc !== null ? { ...fc } : {}),
    type: "FeatureCollection",
    features: sanitizedFeatures,
  };
}

const fc = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: 1 },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [110.0, -7.0],
              [110.1, -7.0],
              [110.1, -7.1],
              [110.0, -7.1],
              [110.0, -7.0]
            ]
          ],
          [
            [
              [110.2, -7.0],
              [110.3, -7.0],
              [110.3, -7.1],
              [110.2, -7.1],
              [110.2, -7.0]
            ]
          ]
        ]
      }
    }
  ]
};

console.log(JSON.stringify(sanitizeFeatureCollection(fc), null, 2));
