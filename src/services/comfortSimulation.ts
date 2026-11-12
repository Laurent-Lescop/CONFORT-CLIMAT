/**
 * Orchestration de la carte de confort UTCI : bâtiments (tuiles de la carte), arbres (calque
 * végétation), météo de l'heure choisie (EPW) et champ de vent, puis calcul dans un Web Worker.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import { LngLat, metersPerDegree } from '../utils/geoUtils';
import {
  COMFORT_MARGIN_M,
  ComfortBuilding,
  ComfortCanopyArea,
  ComfortInput,
  ComfortResult,
  computeComfort,
  ComfortTree,
} from '../utils/comfortModel';
import type { EpwHourInfo } from '../utils/zoneStudy';
import type { WindField } from '../utils/windField';
import type { VegetationData } from './vegetationService';
import type { GridCanopyArea, GridTree } from '../utils/heightGrid';
import { WindSimulationError, loadBuildingsForDomain } from './windSimulation';
import type { ComfortWorkerOut, ComfortWorkerStart } from '../workers/comfortWorker';

export interface ComfortRunParams {
  map: MapLibreMap;
  center: LngLat;
  radiusM: number;
  /** Taille de cellule en mètres (0,5 par défaut) */
  dx: number;
  hour: EpwHourInfo;
  /** Végétation chargée pour cette zone (arbres, boisements), ou null */
  vegetation: VegetationData | null;
  /** Champ de vent calculé pour la direction de cette heure, ou null (vent uniforme) */
  wind: WindField | null;
  /** Vent à 10 m arrivant sur le quartier (vent de la station corrigé de la rugosité du terrain), m/s */
  siteWind10: number;
  onPhase?: (label: string, fraction: number) => void;
}

const TREE_ROW_SPACING_M = 8;

/** Les arbres ne sont pris en compte que si leur chargement correspond bien à la zone courante. */
function vegetationMatches(v: VegetationData | null, center: LngLat): v is VegetationData {
  return !!v && Math.abs(v.center[0] - center[0]) < 1e-5 && Math.abs(v.center[1] - center[1]) < 1e-5;
}

/**
 * Arbres isolés, alignements (un arbre tous les 8 m) et boisements du calque végétation, en mètres
 * relatifs au centre. Vide si la végétation n'est pas chargée pour cette zone.
 */
export function vegetationToCanopy(
  vegetation: VegetationData | null,
  center: LngLat
): { trees: GridTree[]; canopyAreas: GridCanopyArea[] } {
  const trees: GridTree[] = [];
  const canopyAreas: GridCanopyArea[] = [];
  if (!vegetationMatches(vegetation, center)) return { trees, canopyAreas };
  const m = metersPerDegree(center[1]);
  for (const t of vegetation.trees) {
    trees.push({
      x: (t.lng - center[0]) * m.lng,
      y: (t.lat - center[1]) * m.lat,
      crownDiameter: t.crownDiameter,
      top: t.height,
    });
  }
  for (const f of vegetation.features.features) {
    const props = (f.properties ?? {}) as { kind?: string; height?: number };
    if (props.kind === 'tree_row' && f.geometry.type === 'LineString') {
      const pts = f.geometry.coordinates.map((c) => [(c[0] - center[0]) * m.lng, (c[1] - center[1]) * m.lat]);
      const top = props.height ?? 10;
      const crown = Math.min(10, Math.max(4, top * 0.6));
      let carry = 0; // distance restant à parcourir avant le prochain arbre
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x0, y0] = pts[k];
        const [x1, y1] = pts[k + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        let d = carry;
        for (; d <= len; d += TREE_ROW_SPACING_M) {
          const t = len > 0 ? d / len : 0;
          trees.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, crownDiameter: crown, top });
        }
        carry = d - len;
      }
      continue;
    }
    if (props.kind !== 'wood' || f.geometry.type !== 'Polygon') continue;
    const rings = f.geometry.coordinates.map((ring) => {
      const out = new Float32Array(ring.length * 2);
      ring.forEach((c, i) => {
        out[i * 2] = (c[0] - center[0]) * m.lng;
        out[i * 2 + 1] = (c[1] - center[1]) * m.lat;
      });
      return out;
    });
    canopyAreas.push({ rings, top: props.height ?? 14 });
  }
  return { trees, canopyAreas };
}

export class ComfortRunner {
  private worker: Worker | null = null;
  private rejectRun: ((reason: Error) => void) | null = null;
  private generation = 0;

  get isRunning() {
    return this.worker !== null;
  }

  private stop() {
    this.worker?.terminate();
    this.worker = null;
    this.rejectRun = null;
  }

  cancel() {
    this.generation++;
    const reject = this.rejectRun;
    this.stop();
    reject?.(Object.assign(new Error('Calcul annulé'), { name: 'AbortError' }));
  }

  async run(params: ComfortRunParams): Promise<{ result: ComfortResult; buildingCount: number; treeCount: number }> {
    this.cancel();
    const generation = this.generation;
    const { map, center, radiusM, dx, hour } = params;
    // 1. Bâtiments avec leur hauteur (la grille dépasse un peu le disque pour les ombres venant de l'extérieur).
    //    Pour les ombres, tous les volumes comptent, y compris les parties surélevées (passages couverts).
    params.onPhase?.('Lecture des bâtiments', 0);
    const buildings = await loadBuildingsForDomain(map, center, radiusM + COMFORT_MARGIN_M, {
      isAborted: () => generation !== this.generation,
      onWaiting: () => params.onPhase?.('Attente du chargement des bâtiments', 0.5),
      use: 'shade',
    });
    if (generation !== this.generation) throw Object.assign(new Error('Calcul annulé'), { name: 'AbortError' });
    const comfortBuildings: ComfortBuilding[] = buildings.polygons.map((p) => ({
      rings: p.rings,
      height: p.height ?? 8,
      base: p.base ?? 0,
    }));

    // 2. Arbres, alignements et boisements du calque végétation (s'il est chargé pour cette zone)
    const { trees, canopyAreas } = vegetationToCanopy(params.vegetation, center);
    if (generation !== this.generation) throw Object.assign(new Error('Calcul annulé'), { name: 'AbortError' });

    // 3. Calcul dans un worker
    const input: ComfortInput = {
      radiusM,
      dx,
      buildings: comfortBuildings,
      trees,
      canopyAreas,
      wind: params.wind
        ? { nx: params.wind.nx, ny: params.wind.ny, dx: params.wind.dx, u: params.wind.u, v: params.wind.v, solid: params.wind.solid }
        : null,
      weather: {
        taC: hour.taC,
        rhPercent: hour.rhPercent,
        wind10: params.siteWind10,
        dni: hour.dni,
        dhi: hour.dhi,
        lwSky: hour.lwSky,
        sunAzimuth: hour.sunAzimuth,
        sunElevation: hour.sunElevation,
        // Feuillage des arbres caducs : d'avril à octobre
        leafOn: hour.month >= 4 && hour.month <= 10,
      },
    };

    return new Promise((resolve, reject) => {
      const finish = (result: ComfortResult) => {
        this.stop();
        resolve({ result, buildingCount: comfortBuildings.length, treeCount: trees.length + canopyAreas.length });
      };

      // Repli : si le Web Worker ne peut pas démarrer (script non chargé, navigateur restrictif), le calcul
      // s'exécute sur le thread principal par tranches (il rend la main toutes les quelques dizaines de lignes).
      const runInline = (reason: string) => {
        console.warn(`Web Worker indisponible (${reason}) : calcul du confort sur le thread principal.`);
        this.rejectRun = reject;
        computeComfort(
          input,
          (label, fraction) => {
            if (generation === this.generation) params.onPhase?.(label, fraction);
          },
          async () => {
            await new Promise((r) => setTimeout(r, 0));
            if (generation !== this.generation) throw Object.assign(new Error('Calcul annulé'), { name: 'AbortError' });
          }
        )
          .then((result) => {
            if (generation === this.generation) finish(result);
          })
          .catch((err) => {
            if (generation !== this.generation) return;
            this.stop();
            reject(err instanceof Error ? err : new WindSimulationError(String(err)));
          });
      };

      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/comfortWorker.ts', import.meta.url), { type: 'module' });
      } catch (err) {
        runInline(err instanceof Error ? err.message : String(err));
        return;
      }
      this.worker = worker;
      this.rejectRun = reject;
      let gotMessage = false;
      worker.onmessage = (e: MessageEvent<ComfortWorkerOut>) => {
        gotMessage = true;
        const msg = e.data;
        if (msg.type === 'progress') {
          params.onPhase?.(msg.phase, msg.fraction);
        } else if (msg.type === 'done') {
          finish(msg.result);
        } else if (msg.type === 'error') {
          this.stop();
          reject(new WindSimulationError(msg.message));
        }
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
      const start: ComfortWorkerStart = { type: 'start', input };
      worker.postMessage(start);
    });
  }
}
