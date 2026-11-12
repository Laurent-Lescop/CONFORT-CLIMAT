/**
 * Utilitaires géographiques : secteur d'étude circulaire (rayon max 250 m),
 * conversions mètres <-> degrés et filtrage spatial.
 */

export const MAX_RADIUS_M = 250;
export const MIN_RADIUS_M = 100;
export const DEFAULT_RADIUS_M = 250;

export type LngLat = [number, number];

export interface BoundingBox {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export function clampRadius(radiusM: number): number {
  if (!Number.isFinite(radiusM)) return DEFAULT_RADIUS_M;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, radiusM));
}

/** Longueur d'un degré de latitude / longitude en mètres, à une latitude donnée (WGS84). */
export function metersPerDegree(latDeg: number): { lat: number; lng: number } {
  const phi = (latDeg * Math.PI) / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi),
    lng: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi),
  };
}

/** Boîte englobante du disque de rayon `radiusM` autour de `center` ([lng, lat]). */
export function computeBoundingBox(center: LngLat, radiusM: number): BoundingBox {
  const r = clampRadius(radiusM);
  const m = metersPerDegree(center[1]);
  const dLat = r / m.lat;
  const dLng = r / m.lng;
  return {
    minLng: center[0] - dLng,
    maxLng: center[0] + dLng,
    minLat: center[1] - dLat,
    maxLat: center[1] + dLat,
  };
}

/** Point situé à `distM` mètres de `center` dans la direction `bearingDeg` (0 = nord, sens horaire). */
export function destinationPoint(center: LngLat, bearingDeg: number, distM: number): LngLat {
  const m = metersPerDegree(center[1]);
  const b = (bearingDeg * Math.PI) / 180;
  const dx = distM * Math.sin(b);
  const dy = distM * Math.cos(b);
  return [center[0] + dx / m.lng, center[1] + dy / m.lat];
}

/** Distance approchée (m) entre deux points [lng, lat] (haversine). */
export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Anneau fermé (polygone) approchant le cercle de rayon `radiusM`. */
export function circleRing(center: LngLat, radiusM: number, steps = 96): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i++) {
    ring.push(destinationPoint(center, (i / steps) * 360, radiusM));
  }
  ring.push(ring[0]);
  return ring;
}

export function createGeoJsonCircle(center: LngLat, radiusM: number) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [circleRing(center, clampRadius(radiusM))],
    },
  };
}

/** Formate un centre [lng, lat] en « lat, lon » (ordre Google Maps), 5 décimales. */
export function formatGps(center: LngLat): string {
  return `${center[1].toFixed(5)}, ${center[0].toFixed(5)}`;
}

/**
 * Lit des coordonnées GPS saisies sous la forme « lat, lon » (ex. « 47.2058, -1.5530 »).
 * Accepte la virgule ou le point comme séparateur décimal. Retourne [lng, lat] ou null.
 */
export function parseGpsInput(text: string): LngLat | null {
  const t = text.trim();
  if (!t) return null;
  let parts: string[];
  if (t.includes(';')) parts = t.split(';');
  else if (/\s/.test(t)) parts = t.split(/,?\s+/);
  else parts = t.split(',');
  if (parts.length !== 2) return null;
  const [lat, lng] = parts.map((p) => Number(p.trim().replace(',', '.')));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

export function isPointInsideBbox(point: LngLat, bbox: BoundingBox): boolean {
  return (
    point[0] >= bbox.minLng &&
    point[0] <= bbox.maxLng &&
    point[1] >= bbox.minLat &&
    point[1] <= bbox.maxLat
  );
}

export function isPointInsideCircle(point: LngLat, center: LngLat, radiusM: number): boolean {
  return haversineM(point, center) <= radiusM;
}

export function isBuildingInsideBbox(featureCoords: number[][][], bbox: BoundingBox): boolean {
  if (!featureCoords || !featureCoords[0] || !featureCoords[0][0]) return false;
  const [lng, lat] = featureCoords[0][0];
  return isPointInsideBbox([lng, lat], bbox);
}

/** Point dans un anneau (ray casting). */
export function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Découpe un anneau par un polygone convexe (Sutherland–Hodgman).
 * Sert à limiter les données OSM au disque d'étude.
 */
export function clipRingToConvex(subject: number[][], clip: number[][]): number[][] {
  // Orientation du polygone de découpe (aire signée)
  let area = 0;
  for (let i = 0; i < clip.length - 1; i++) {
    area += clip[i][0] * clip[i + 1][1] - clip[i + 1][0] * clip[i][1];
  }
  const sign = area >= 0 ? 1 : -1;

  const inside = (p: number[], a: number[], b: number[]) =>
    sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;

  const intersect = (p: number[], q: number[], a: number[], b: number[]): number[] => {
    const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1];
    const x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-18) return q;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };

  let output = subject.slice(0, subject.length > 1 && samePoint(subject[0], subject[subject.length - 1]) ? -1 : undefined);
  for (let i = 0; i < clip.length - 1 && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[i + 1];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curIn = inside(cur, a, b);
      const prevIn = inside(prev, a, b);
      if (curIn) {
        if (!prevIn) output.push(intersect(prev, cur, a, b));
        output.push(cur);
      } else if (prevIn) {
        output.push(intersect(prev, cur, a, b));
      }
    }
  }
  if (output.length < 3) return [];
  output.push(output[0]);
  return output;
}

function samePoint(a: number[], b: number[]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Aire (m²) d'un anneau [lng, lat] (projection locale équirectangulaire). */
export function ringAreaM2(ring: number[][]): number {
  if (ring.length < 4) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const m = metersPerDegree(lat0);
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * m.lng;
    const y1 = ring[i][1] * m.lat;
    const x2 = ring[i + 1][0] * m.lng;
    const y2 = ring[i + 1][1] * m.lat;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
