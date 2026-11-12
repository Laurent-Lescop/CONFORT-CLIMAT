/**
 * Végétation OpenStreetMap via l'API Overpass, limitée au disque d'étude (rayon max 250 m).
 *
 * Éléments récupérés : arbres isolés (natural=tree), alignements d'arbres (natural=tree_row),
 * boisements (natural=wood, landuse=forest), fourrés/landes, prairies et pelouses,
 * parcs et jardins, vergers/vignes/jardins ouvriers.
 */

import {
  LngLat,
  MAX_RADIUS_M,
  circleRing,
  clipRingToConvex,
  computeBoundingBox,
  haversineM,
  metersPerDegree,
  pointInRing,
  ringAreaM2,
} from '../utils/geoUtils';

export type VegetationKind = 'tree' | 'tree_row' | 'wood' | 'scrub' | 'grass' | 'park' | 'crop';

export const VEGETATION_KIND_LABELS: Record<VegetationKind, string> = {
  tree: 'Arbres isolés',
  tree_row: "Alignements d'arbres",
  wood: 'Boisements',
  scrub: 'Fourrés / landes',
  grass: 'Prairies / pelouses',
  park: 'Parcs & jardins',
  crop: 'Vergers / cultures',
};

export const VEGETATION_KIND_COLORS: Record<VegetationKind, string> = {
  tree: '#16a34a',
  tree_row: '#22c55e',
  wood: '#166534',
  scrub: '#65a30d',
  grass: '#86efac',
  park: '#4ade80',
  crop: '#bef264',
};

/** Hauteur par défaut (m) du houppier / de la formation végétale. */
const DEFAULT_HEIGHT: Record<VegetationKind, number> = {
  tree: 9,
  tree_row: 9,
  wood: 14,
  scrub: 1.5,
  grass: 0,
  park: 0,
  crop: 0,
};

const DEFAULT_CROWN_DIAMETER_M = 6;
const TRUNK_HEIGHT_M = 2;

export interface VegetationTree {
  lng: number;
  lat: number;
  height: number;
  crownDiameter: number;
  species?: string;
  leafType?: string;
}

export interface VegetationStats {
  radiusM: number;
  zoneAreaM2: number;
  treeCount: number;
  treeRowCount: number;
  /** Surface (m²) par type de végétation surfacique, dans le disque d'étude */
  areaByKindM2: Partial<Record<VegetationKind, number>>;
  /** Part du disque couverte par de la végétation (surfacique + houppiers d'arbres), 0..1 */
  greenCoverFraction: number;
  /** Part du disque couverte par la canopée arborée (arbres + boisements), 0..1 */
  canopyCoverFraction: number;
}

export interface VegetationData {
  center: LngLat;
  radiusM: number;
  fetchedAt: string;
  source: string;
  /** Entités à afficher (surfaces et houppiers d'arbres convertis en petits polygones) */
  features: GeoJSON.FeatureCollection;
  /** Arbres isolés d'origine (pour l'export et les calculs) */
  trees: VegetationTree[];
  stats: VegetationStats;
}

// ---------------------------------------------------------------------------
// Requête Overpass
// ---------------------------------------------------------------------------

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const AREA_FILTERS = [
  '["natural"~"^(wood|scrub|grassland|heath)$"]',
  '["landuse"~"^(forest|grass|meadow|orchard|vineyard|village_green|recreation_ground|allotments)$"]',
  '["leisure"~"^(park|garden|nature_reserve)$"]',
];

/** Délai serveur demandé à Overpass et délai client par serveur (ms). Le serveur public est parfois lent. */
const SERVER_TIMEOUT_S = 60;
const CLIENT_TIMEOUT_MS = 90_000;

/**
 * Requête par boîte englobante (plus rapide qu'un filtre `around`) ; le résultat est ensuite
 * découpé au disque d'étude côté client.
 */
function buildQuery(center: LngLat, radiusM: number): string {
  const b = computeBoundingBox(center, radiusM);
  const bbox = `[bbox:${b.minLat.toFixed(6)},${b.minLng.toFixed(6)},${b.maxLat.toFixed(6)},${b.maxLng.toFixed(6)}]`;
  const areaParts = AREA_FILTERS.flatMap((f) => [`way${f};`, `relation${f}["type"="multipolygon"];`]);
  return `[out:json][timeout:${SERVER_TIMEOUT_S}]${bbox};(${areaParts.join('')}node["natural"="tree"];way["natural"="tree_row"];);out geom;`;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

async function postOverpass(query: string): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    // Délai propre à chaque serveur
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
      // Overpass répond 200 avec une « remark » et un résultat vide/partiel quand il manque de temps ou de mémoire :
      // ce n'est pas « aucune végétation », on ne doit ni l'afficher ni le mettre en cache.
      if (json.remark && /error|timed out|out of memory/i.test(json.remark)) {
        throw new Error(`Overpass : ${json.remark}`);
      }
      return { elements: json.elements ?? [] };
    } catch (err) {
      // Délai dépassé ou serveur en erreur : on essaie le serveur suivant
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Overpass indisponible');
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function classifyArea(tags: Record<string, string>): VegetationKind | null {
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'wood';
  if (tags.natural === 'scrub' || tags.natural === 'heath') return 'scrub';
  if (tags.natural === 'grassland' || tags.landuse === 'grass' || tags.landuse === 'meadow' || tags.landuse === 'village_green' || tags.landuse === 'recreation_ground') return 'grass';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'nature_reserve') return 'park';
  if (tags.landuse === 'orchard' || tags.landuse === 'vineyard' || tags.landuse === 'allotments') return 'crop';
  return null;
}

function parseMeters(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const toRing = (g: { lat: number; lon: number }[]): number[][] => g.map((p) => [p.lon, p.lat]);

const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];

/** Assemble des segments de ways en anneaux fermés (relations multipolygon). */
function stitchRings(segments: number[][][]): number[][][] {
  const rings: number[][][] = [];
  const pool = segments.map((s) => s.slice()).filter((s) => s.length > 1);
  while (pool.length) {
    let current = pool.shift()!;
    let guard = 0;
    while (!same(current[0], current[current.length - 1]) && pool.length && guard++ < 10000) {
      const end = current[current.length - 1];
      const idx = pool.findIndex((s) => same(s[0], end) || same(s[s.length - 1], end));
      if (idx === -1) break;
      const next = pool.splice(idx, 1)[0];
      current = same(next[0], end) ? current.concat(next.slice(1)) : current.concat(next.slice().reverse().slice(1));
    }
    if (current.length >= 4 && same(current[0], current[current.length - 1])) rings.push(current);
  }
  return rings;
}

/** Petit polygone (cercle à 12 côtés) représentant le houppier d'un arbre. */
function crownPolygon(lng: number, lat: number, diameter: number): number[][] {
  return circleRing([lng, lat], diameter / 2, 12) as number[][];
}

export function convertOverpass(
  elements: OverpassElement[],
  center: LngLat,
  radiusM: number
): Omit<VegetationData, 'fetchedAt' | 'source'> {
  const clipRing = circleRing(center, radiusM, 96) as number[][];
  const features: GeoJSON.Feature[] = [];
  const trees: VegetationTree[] = [];
  const seenTrees = new Set<number>();
  const areaByKind: Partial<Record<VegetationKind, number>> = {};
  let treeRowCount = 0;

  const addPolygon = (kind: VegetationKind, outer: number[][], holes: number[][][], tags: Record<string, string>, id: string) => {
    const clippedOuter = clipRingToConvex(outer, clipRing);
    if (clippedOuter.length < 4) return;
    const clippedHoles = holes
      .map((h) => clipRingToConvex(h, clipRing))
      .filter((h) => h.length >= 4);
    const height = parseMeters(tags.height) ?? DEFAULT_HEIGHT[kind];
    const area = ringAreaM2(clippedOuter) - clippedHoles.reduce((s, h) => s + ringAreaM2(h), 0);
    areaByKind[kind] = (areaByKind[kind] ?? 0) + Math.max(0, area);
    features.push({
      type: 'Feature',
      properties: {
        id,
        kind,
        name: tags.name ?? '',
        height,
        base: 0,
        leaf_type: tags.leaf_type ?? '',
        genus: tags.genus ?? '',
      },
      geometry: { type: 'Polygon', coordinates: [clippedOuter, ...clippedHoles] },
    });
  };

  for (const el of elements) {
    const tags = el.tags ?? {};

    if (el.type === 'node' && tags.natural === 'tree' && el.lat !== undefined && el.lon !== undefined) {
      if (seenTrees.has(el.id)) continue;
      seenTrees.add(el.id);
      if (haversineM([el.lon, el.lat], center) > radiusM) continue;
      const height = parseMeters(tags.height) ?? DEFAULT_HEIGHT.tree;
      let crown = parseMeters(tags.diameter_crown);
      if (!crown) {
        const circ = parseMeters(tags.circumference);
        // Diamètre de houppier estimé : ~ 6 × diamètre du tronc, borné
        crown = circ ? Math.min(14, Math.max(3, ((circ / Math.PI) * 6))) : Math.min(12, Math.max(DEFAULT_CROWN_DIAMETER_M, height * 0.6));
      }
      trees.push({
        lng: el.lon,
        lat: el.lat,
        height,
        crownDiameter: crown,
        species: tags.species ?? tags.genus,
        leafType: tags.leaf_type,
      });
      features.push({
        type: 'Feature',
        properties: {
          id: `tree-${el.id}`,
          kind: 'tree',
          name: tags.species ?? tags.genus ?? '',
          height,
          base: Math.min(TRUNK_HEIGHT_M, height * 0.3),
          leaf_type: tags.leaf_type ?? '',
          genus: tags.genus ?? '',
        },
        geometry: { type: 'Polygon', coordinates: [crownPolygon(el.lon, el.lat, crown)] },
      });
      continue;
    }

    if (el.type === 'way' && tags.natural === 'tree_row' && el.geometry) {
      const coords = toRing(el.geometry);
      if (coords.length < 2) continue;
      treeRowCount++;
      features.push({
        type: 'Feature',
        properties: { id: `row-${el.id}`, kind: 'tree_row', height: parseMeters(tags.height) ?? DEFAULT_HEIGHT.tree_row, base: 0 },
        geometry: { type: 'LineString', coordinates: coords },
      });
      continue;
    }

    const kind = classifyArea(tags);
    if (!kind) continue;

    if (el.type === 'way' && el.geometry) {
      const ring = toRing(el.geometry);
      if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) {
        addPolygon(kind, ring, [], tags, `way-${el.id}`);
      }
    } else if (el.type === 'relation' && el.members) {
      const outers = stitchRings(el.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => toRing(m.geometry!)));
      const inners = stitchRings(el.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => toRing(m.geometry!)));
      outers.forEach((outer, i) => {
        const holes = inners.filter((h) => pointInRing(h[0][0], h[0][1], outer));
        addPolygon(kind, outer, holes, tags, `rel-${el.id}-${i}`);
      });
    }
  }

  const stats = computeStats(features, trees, treeRowCount, areaByKind, center, radiusM);
  return { center, radiusM, features: { type: 'FeatureCollection', features }, trees, stats };
}

/** Couverture végétale par échantillonnage régulier (pas de 5 m) du disque d'étude. */
function computeStats(
  features: GeoJSON.Feature[],
  trees: VegetationTree[],
  treeRowCount: number,
  areaByKind: Partial<Record<VegetationKind, number>>,
  center: LngLat,
  radiusM: number
): VegetationStats {
  const m = metersPerDegree(center[1]);
  const step = 5;
  const polys = features
    .filter((f) => f.geometry.type === 'Polygon')
    .map((f) => ({
      kind: (f.properties as { kind: VegetationKind }).kind,
      rings: (f.geometry as GeoJSON.Polygon).coordinates,
    }));

  let total = 0;
  let green = 0;
  let canopy = 0;
  for (let dx = -radiusM; dx <= radiusM; dx += step) {
    for (let dy = -radiusM; dy <= radiusM; dy += step) {
      if (dx * dx + dy * dy > radiusM * radiusM) continue;
      total++;
      const lng = center[0] + dx / m.lng;
      const lat = center[1] + dy / m.lat;
      let isGreen = false;
      let isCanopy = false;
      for (const p of polys) {
        if (!pointInRing(lng, lat, p.rings[0])) continue;
        if (p.rings.slice(1).some((h) => pointInRing(lng, lat, h))) continue;
        isGreen = true;
        if (p.kind === 'wood' || p.kind === 'tree') {
          isCanopy = true;
          break;
        }
      }
      if (isGreen) green++;
      if (isCanopy) canopy++;
    }
  }

  return {
    radiusM,
    zoneAreaM2: Math.PI * radiusM * radiusM,
    treeCount: trees.length,
    treeRowCount,
    areaByKindM2: areaByKind,
    greenCoverFraction: total ? green / total : 0,
    canopyCoverFraction: total ? canopy / total : 0,
  };
}

// ---------------------------------------------------------------------------
// API publique avec cache local
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'atlas_veg_v1_';
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

function cacheKey(center: LngLat): string {
  return `${CACHE_PREFIX}${center[1].toFixed(4)}_${center[0].toFixed(4)}`;
}

// Cache mémoire : évite de relire/réécrire le localStorage quand seul le rayon change
const memoryCache = new Map<string, OverpassElement[]>();

function readCache(center: LngLat): OverpassElement[] | null {
  const key = cacheKey(center);
  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; elements: OverpassElement[] };
    if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
    memoryCache.set(key, parsed.elements);
    return parsed.elements;
  } catch {
    return null;
  }
}

function writeCache(center: LngLat, elements: OverpassElement[]) {
  memoryCache.set(cacheKey(center), elements);
  try {
    localStorage.setItem(cacheKey(center), JSON.stringify({ t: Date.now(), elements }));
  } catch {
    // Quota dépassé ou stockage indisponible : on ignore, le cache est facultatif
  }
}

/** Requêtes réseau en cours, partagées : un changement de rayon ne relance pas une requête de plusieurs secondes. */
const inflight = new Map<string, Promise<OverpassElement[]>>();

function loadElements(center: LngLat): Promise<OverpassElement[]> {
  const cached = readCache(center);
  if (cached) return Promise.resolve(cached);
  const key = cacheKey(center);
  let pending = inflight.get(key);
  if (!pending) {
    pending = postOverpass(buildQuery(center, MAX_RADIUS_M))
      .then((json) => {
        writeCache(center, json.elements);
        return json.elements;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** Rejette tout de suite si `signal` est annulé, sans interrompre la requête partagée. */
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Annulé'), { name: 'AbortError' }));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', abort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', abort);
        reject(e);
      }
    );
  });
}

/**
 * Récupère la végétation OSM autour de `center`. La requête porte toujours sur le rayon
 * maximal (250 m), puis le résultat est découpé au rayon demandé : changer le rayon
 * ne déclenche donc aucune nouvelle requête réseau.
 */
export async function fetchVegetation(
  center: LngLat,
  radiusM: number,
  signal?: AbortSignal
): Promise<VegetationData> {
  const elements = await withAbort(loadElements(center), signal);
  return {
    ...convertOverpass(elements, center, radiusM),
    fetchedAt: new Date().toISOString(),
    source: 'OpenStreetMap contributors (Overpass API, ODbL)',
  };
}
