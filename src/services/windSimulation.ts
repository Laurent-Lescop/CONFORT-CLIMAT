/**
 * Orchestration de la simulation de vent : collecte des emprises de bâtiments depuis les tuiles
 * vectorielles déjà chargées par la carte, rasterisation sur la grille, calcul dans un Web Worker.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import { LngLat, metersPerDegree } from '../utils/geoUtils';
import { PolygonMeters, rasterizePolygons } from '../utils/windLbm';
import type { WindField } from '../utils/windField';
import type { WindWorkerOut, WindWorkerStart } from '../workers/windWorker';
import { solveWind } from '../utils/windSolveLoop';

/** Cellules de la grille par côté : compromis entre finesse et durée de calcul (~6 ms par pas). */
export const WIND_GRID_CELLS = 300;
/** Marge autour du disque d'étude, pour que les bords du domaine soient loin du secteur. */
export const WIND_DOMAIN_MARGIN = 1.2;
/** Un bâtiment de moins de 3 m n'est pas un obstacle à hauteur de piéton. */
export const MIN_OBSTACLE_HEIGHT_M = 3;
const DEFAULT_BUILDING_HEIGHT_M = 8;

export interface BuildingCollection {
  polygons: PolygonMeters[];
  /** Nombre d'entités bâtiments lues dans les tuiles (avant filtrage par hauteur) */
  featureCount: number;
  /** Nombre de bâtiments retenus comme obstacles */
  obstacleCount: number;
  /** Nom de la source de tuiles utilisée */
  source: string;
}

export class WindSimulationError extends Error {}

interface BuildingLayerInfo {
  source: string;
  sourceLayer: string;
  /** Zoom minimal auquel les tuiles contiennent les bâtiments */
  minzoom: number;
}

function findBuildingLayer(map: MapLibreMap): BuildingLayerInfo {
  const layers = (map.getStyle()?.layers ?? []) as any[];
  const candidates = layers.filter((l) => l['source-layer'] === 'building' && l.source && l.type !== 'custom');
  const layer =
    candidates.find((l) => l.id === 'osm-real-3d-buildings') ??
    candidates.find((l) => l.type === 'fill-extrusion') ??
    candidates[0];
  if (!layer) {
    throw new WindSimulationError("Aucune couche de bâtiments n'est disponible dans ce fond de carte. Choisissez un fond OpenStreetMap.");
  }
  return { source: layer.source, sourceLayer: layer['source-layer'], minzoom: Math.max(14, layer.minzoom ?? 0) };
}

/**
 * Usage des emprises :
 *  - `wind` : obstacles à hauteur de piéton (bâtiments ≥ 3 m, parties surélevées exclues) ;
 *  - `shade` : tout ce qui porte une ombre, y compris les parties surélevées (passages, porte-à-faux),
 *    avec leur altitude de base.
 */
export type FootprintUse = 'wind' | 'shade';

/** Emprises des bâtiments (en mètres relatifs au centre) dans un carré de demi-côté `halfSideM`. */
export function collectBuildingFootprints(
  map: MapLibreMap,
  center: LngLat,
  halfSideM: number,
  use: FootprintUse = 'wind'
): BuildingCollection {
  const src = findBuildingLayer(map);
  const features = map.querySourceFeatures(src.source, { sourceLayer: src.sourceLayer });
  const m = metersPerDegree(center[1]);
  const lim = halfSideM * 1.1;
  const polygons: PolygonMeters[] = [];

  const toRing = (ring: number[][]): Float32Array => {
    const out = new Float32Array(ring.length * 2);
    for (let i = 0; i < ring.length; i++) {
      out[i * 2] = (ring[i][0] - center[0]) * m.lng;
      out[i * 2 + 1] = (ring[i][1] - center[1]) * m.lat;
    }
    return out;
  };
  const inRange = (ring: Float32Array) => {
    for (let i = 0; i < ring.length; i += 2) if (Math.abs(ring[i]) <= lim && Math.abs(ring[i + 1]) <= lim) return true;
    return false;
  };

  for (const f of features) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const rawH = Number(props.render_height ?? props.height);
    const h = Number.isFinite(rawH) && rawH > 0 ? rawH : DEFAULT_BUILDING_HEIGHT_M;
    const rawMin = Number(props.render_min_height ?? props.min_height ?? 0);
    const minH = Number.isFinite(rawMin) && rawMin > 0 ? Math.min(rawMin, h) : 0;
    if (use === 'wind') {
      // Parties surélevées (passages, porte-à-faux) : ne bloquent pas l'écoulement à hauteur de piéton
      if (h < MIN_OBSTACLE_HEIGHT_M || minH >= MIN_OBSTACLE_HEIGHT_M) continue;
    } else if (h - minH < 0.5) {
      continue;
    }
    const g = f.geometry;
    const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const rings = poly.map(toRing);
      if (rings.length && inRange(rings[0])) polygons.push({ rings, height: h, base: minH });
    }
  }
  return { polygons, featureCount: features.length, obstacleCount: polygons.length, source: src.source };
}

export interface WindRunParams {
  map: MapLibreMap;
  center: LngLat;
  radiusM: number;
  /** Direction d'où vient le vent, en degrés depuis le nord */
  directionFrom: number;
  speedRef: number;
  warmupSteps?: number;
  averagingSteps?: number;
  onPhase?: (phase: 'preparing' | 'warmup' | 'averaging', info: { fraction: number; buildings?: BuildingCollection }) => void;
  /** Appelé à chaque nouveau champ (instantané pendant la chauffe, moyen ensuite) */
  onField?: (field: WindField) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function domainCorners(center: LngLat, halfSideM: number): LngLat[] {
  const m = metersPerDegree(center[1]);
  const dLng = halfSideM / m.lng;
  const dLat = halfSideM / m.lat;
  return [
    [center[0] - dLng, center[1] - dLat],
    [center[0] + dLng, center[1] - dLat],
    [center[0] + dLng, center[1] + dLat],
    [center[0] - dLng, center[1] + dLat],
  ];
}

/**
 * Vrai si le domaine entier est à l'écran à un zoom où les tuiles contiennent les bâtiments :
 * la carte charge alors déjà toutes les tuiles utiles, inutile de bouger la caméra.
 */
function domainInView(map: MapLibreMap, center: LngLat, halfSideM: number, minzoom: number): boolean {
  if (map.getZoom() < minzoom) return false;
  const el = map.getContainer();
  const w = el.clientWidth;
  const h = el.clientHeight;
  return domainCorners(center, halfSideM).every((c) => {
    const p = map.project(c);
    return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  });
}

function waitForMoveEnd(map: MapLibreMap, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!map.isMoving()) {
      // Le mouvement peut ne commencer qu'à l'image suivante
      requestAnimationFrame(() => (map.isMoving() ? map.once('moveend', () => resolve()) : resolve()));
    } else {
      map.once('moveend', () => resolve());
    }
    setTimeout(resolve, timeoutMs);
  });
}

/**
 * Amène le domaine à l'écran en gardant l'orientation de la caméra choisie par l'utilisateur
 * (seule l'inclinaison est limitée pendant le chargement si elle est très forte).
 */
async function bringDomainIntoView(map: MapLibreMap, center: LngLat, halfSideM: number, minzoom: number) {
  const corners = domainCorners(center, halfSideM);
  const bounds: [LngLat, LngLat] = [corners[0], corners[2]];
  const bearing = map.getBearing();
  const pitch = Math.min(map.getPitch(), 50);
  map.fitBounds(bounds, { bearing, pitch, padding: 40, maxZoom: 17.5, duration: 800, essential: true });
  await waitForMoveEnd(map, 3000);
  // Le cadrage ne tient pas compte de la perspective : on recule un peu, même inclinaison
  for (let i = 0; i < 4 && !domainInView(map, center, halfSideM, minzoom); i++) {
    const zoom = map.getZoom() - 0.35;
    if (zoom < minzoom) break;
    map.easeTo({ center, zoom, duration: 250, essential: true });
    await waitForMoveEnd(map, 1500);
  }
  if (domainInView(map, center, halfSideM, minzoom)) return;
  // Le recul ne suffit pas (vue presque rasante) : on cadre à plat, même orientation
  map.fitBounds(bounds, { bearing, pitch: 0, padding: 40, maxZoom: 17.5, duration: 600, essential: true });
  await waitForMoveEnd(map, 3000);
}

/** Attend que toutes les tuiles visibles de la source soient chargées (ou le délai). */
async function waitForSource(map: MapLibreMap, source: string, timeoutMs: number, isAborted: () => boolean) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (isAborted()) return;
    let loaded = false;
    try {
      loaded = map.isSourceLoaded(source) && !map.isMoving();
    } catch {
      loaded = false; // source retirée (changement de fond de carte en cours)
    }
    if (loaded) return;
    await sleep(150);
  }
}

/**
 * Lit les emprises de bâtiments du domaine dans les tuiles de la carte. Si le domaine est déjà
 * entièrement visible, la caméra ne bouge pas ; sinon elle le cadre en gardant son orientation.
 * Sur un réseau lent ou au premier chargement, on attend jusqu'à 30 s que les tuiles arrivent.
 */
export async function loadBuildingsForDomain(
  map: MapLibreMap,
  center: LngLat,
  halfSideM: number,
  opts: { isAborted?: () => boolean; onWaiting?: () => void; use?: FootprintUse } = {}
): Promise<BuildingCollection> {
  const aborted = () => Object.assign(new Error('Simulation annulée'), { name: 'AbortError' });
  const isAborted = opts.isAborted ?? (() => false);
  const { source, minzoom } = findBuildingLayer(map);

  if (!domainInView(map, center, halfSideM, minzoom)) {
    await bringDomainIntoView(map, center, halfSideM, minzoom);
    if (isAborted()) throw aborted();
  }
  await waitForSource(map, source, 15000, isAborted);
  if (isAborted()) throw aborted();

  let buildings = collectBuildingFootprints(map, center, halfSideM, opts.use);
  const deadline = performance.now() + 30000;
  while (buildings.featureCount === 0 && performance.now() < deadline) {
    opts.onWaiting?.();
    await sleep(700);
    if (isAborted()) throw aborted();
    buildings = collectBuildingFootprints(map, center, halfSideM, opts.use);
  }
  if (buildings.obstacleCount === 0) {
    throw new WindSimulationError(
      buildings.featureCount === 0
        ? "Aucun bâtiment lu dans les tuiles de la carte après 30 s : soit la zone n'a pas de bâti cartographié, soit les tuiles n'ont pas pu être chargées (connexion lente ou coupée). Vérifiez que les bâtiments 3D s'affichent sur la carte, puis relancez."
        : 'Aucun bâtiment assez haut (≥ 3 m) dans la zone : rien à calculer.'
    );
  }
  return buildings;
}

export class WindSimulationRunner {
  private worker: Worker | null = null;
  private rejectRun: ((reason: Error) => void) | null = null;
  /** Incrémenté à chaque annulation : une préparation en cours (avant le worker) s'arrête d'elle-même */
  private generation = 0;

  get isRunning() {
    return this.worker !== null;
  }

  private stop() {
    this.worker?.terminate();
    this.worker = null;
    this.rejectRun = null;
  }

  /** Annule le calcul en cours ; la promesse de `run` est rejetée avec une erreur nommée `AbortError`. */
  cancel() {
    this.generation++;
    const reject = this.rejectRun;
    this.stop();
    reject?.(Object.assign(new Error('Simulation annulée'), { name: 'AbortError' }));
  }

  async run(params: WindRunParams): Promise<WindField> {
    this.cancel();
    const generation = this.generation;
    const { map, center, radiusM } = params;
    const half = radiusM * WIND_DOMAIN_MARGIN;
    const nx = WIND_GRID_CELLS;
    const ny = WIND_GRID_CELLS;
    const dx = (2 * half) / nx;

    // 1-2. Attente des tuiles (cadrage seulement si le domaine n'est pas à l'écran), lecture des bâtiments
    params.onPhase?.('preparing', { fraction: 0 });
    const buildings = await loadBuildingsForDomain(map, center, half, {
      isAborted: () => generation !== this.generation,
      onWaiting: () => params.onPhase?.('preparing', { fraction: 0.5 }),
    });
    // Un autre calcul a pu être demandé pendant la lecture (nouveau clic sur la rose) : on s'efface,
    // sinon deux workers tourneraient en même temps.
    if (generation !== this.generation) throw Object.assign(new Error('Simulation annulée'), { name: 'AbortError' });
    params.onPhase?.('preparing', { fraction: 1, buildings });
    const solid = new Uint8Array(nx * ny);
    rasterizePolygons(buildings.polygons, nx, ny, dx, solid);
    // Bordure du domaine toujours fluide (identique au solveur)
    for (let i = 0; i < nx; i++) {
      solid[i] = 0;
      solid[(ny - 1) * nx + i] = 0;
    }
    for (let j = 0; j < ny; j++) {
      solid[j * nx] = 0;
      solid[j * nx + nx - 1] = 0;
    }

    // 3. Calcul dans un worker (la caméra reste celle choisie par l'utilisateur)
    const rad = (params.directionFrom * Math.PI) / 180;
    const warmupSteps = params.warmupSteps ?? 2000;
    const averagingSteps = params.averagingSteps ?? 1500;
    const makeField = (u: Float32Array, v: Float32Array, averaged: boolean): WindField => ({
      center,
      radiusM,
      nx,
      ny,
      dx,
      directionFrom: params.directionFrom,
      speedRef: params.speedRef,
      u,
      v,
      solid,
      averaged,
    });

    return new Promise<WindField>((resolve, reject) => {
      const start: WindWorkerStart = {
        type: 'start',
        nx,
        ny,
        solid: solid.slice(), // copie : le solveur modifie sa propre grille
        windEast: -Math.sin(rad),
        windNorth: -Math.cos(rad),
        warmupSteps,
        averagingSteps,
        reportEvery: 250,
      };

      const handle = (msg: WindWorkerOut) => {
        if (generation !== this.generation) return;
        if (msg.type === 'progress') {
          params.onPhase?.(msg.phase, { fraction: msg.step / msg.total });
          params.onField?.(makeField(msg.u, msg.v, msg.averaged));
        } else if (msg.type === 'done') {
          this.stop();
          resolve(makeField(msg.u, msg.v, true));
        } else if (msg.type === 'error') {
          this.stop();
          reject(new WindSimulationError(msg.message));
        }
      };

      // Repli : si le Web Worker ne peut pas démarrer (script non chargé, navigateur restrictif), le même
      // calcul s'exécute sur le thread principal par petites tranches, pour que l'interface reste utilisable.
      const runInline = (reason: string) => {
        console.warn(`Web Worker indisponible (${reason}) : calcul du vent sur le thread principal.`);
        this.rejectRun = reject;
        void solveWind(start, {
          post: handle,
          shouldStop: () => generation !== this.generation,
          yieldControl: () => new Promise((r) => setTimeout(r, 0)),
          chunkSteps: 4,
        });
      };

      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/windWorker.ts', import.meta.url), { type: 'module' });
      } catch (err) {
        runInline(err instanceof Error ? err.message : String(err));
        return;
      }
      this.worker = worker;
      this.rejectRun = reject;
      let gotMessage = false;
      worker.onmessage = (e: MessageEvent<WindWorkerOut>) => {
        gotMessage = true;
        handle(e.data);
      };
      worker.onerror = (ev) => {
        this.stop();
        const detail = ev.message || 'le script du worker n’a pas pu être chargé';
        if (!gotMessage) {
          runInline(detail);
          return;
        }
        const where = ev.filename ? ` (${ev.filename.split('/').pop()}:${ev.lineno})` : '';
        reject(new WindSimulationError(`Le calcul en arrière-plan a échoué : ${detail}${where}`));
      };
      worker.postMessage(start);
    });
  }
}
