/**
 * Étude des ombres portées sur la zone :
 *  - ombres au sol à un instant donné (date et heure du sunpath), recalculées en direct ;
 *  - heures d'ensoleillement direct au sol sur une journée (ciel clair).
 * Bâtiments lus dans les tuiles de la carte (y compris les volumes surélevés), arbres du calque
 * végétation (semi-transparents), grille de 1 m sur le secteur et une marge de 60 m.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import { LngLat } from '../utils/geoUtils';
import {
  GRID_MARGIN_M,
  GridBuilding,
  HeightGrid,
  isLeafOn,
  makeSunTracer,
  rasterizeHeightGrid,
} from '../utils/heightGrid';
import { dayOfYearToMonthDay, solarPosition, utcFromStandardTime } from '../utils/sunPosition';
import type { VegetationData } from './vegetationService';
import { vegetationToCanopy } from './comfortSimulation';
import { loadBuildingsForDomain } from './windSimulation';

export const SHADOW_GRID_DX = 1;
/** Hauteur du point testé : le sol */
const GROUND_Z = 0.1;
/** Pas de temps de l'ensoleillement journalier (min) */
const DAILY_STEP_MIN = 10;

export interface ShadowGridInfo {
  n: number;
  dx: number;
  half: number;
  center: LngLat;
  radiusM: number;
  /** 1 dans le disque d'étude et hors bâtiment (sol accessible) */
  ground: Uint8Array;
  groundCells: number;
}

export interface InstantShadowResult {
  kind: 'instant';
  grid: ShadowGridInfo;
  /** Transmission du soleil direct 0..255 (0 = ombre) ; tout à 0 si le soleil est couché */
  transmission: Uint8Array;
  sunUp: boolean;
  sunlitFraction: number;
}

export interface DailySunResult {
  kind: 'daily';
  grid: ShadowGridInfo;
  /** Minutes de soleil direct par cellule */
  minutes: Uint16Array;
  /** Durée du jour (soleil au-dessus de l'horizon), minutes */
  dayLengthMin: number;
  meanHours: number;
  maxHours: number;
  /** Parts du sol libre : < 2 h, 2–4 h, 4–6 h, ≥ 6 h */
  classes: [number, number, number, number];
  dayOfYear: number;
}

const aborted = () => Object.assign(new Error('Calcul annulé'), { name: 'AbortError' });

/**
 * Rend la main au navigateur (affichage, clics) sans passer par setTimeout : dans un onglet en
 * arrière-plan, Chrome ralentit setTimeout à une fois par seconde, ce qui multiplierait la durée du calcul.
 */
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const waiting: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => waiting.shift()?.();
const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (!channel) return void setTimeout(resolve, 0);
    waiting.push(resolve);
    channel.port2.postMessage(0);
  });

export class ShadowStudy {
  private buildingsKey = '';
  private buildings: GridBuilding[] = [];
  private gridKey = '';
  private grid: HeightGrid | null = null;
  private info: ShadowGridInfo | null = null;
  private generation = 0;
  private dailyGeneration = 0;

  /** Annule une préparation et un calcul journalier en cours. */
  cancel() {
    this.generation++;
    this.dailyGeneration++;
  }

  /** Annule seulement le calcul journalier en cours. */
  cancelDaily() {
    this.dailyGeneration++;
  }

  /** Oublie les données (zone changée) */
  reset() {
    this.cancel();
    this.buildingsKey = '';
    this.gridKey = '';
    this.grid = null;
    this.info = null;
    this.buildings = [];
  }

  get isReady() {
    return !!this.grid;
  }

  /**
   * Lit les bâtiments (une fois par zone) et construit la grille des hauteurs avec la végétation
   * courante. Renvoie le nombre de volumes bâtis et d'arbres pris en compte.
   */
  async prepare(
    map: MapLibreMap,
    center: LngLat,
    radiusM: number,
    vegetation: VegetationData | null,
    onWaiting?: () => void
  ): Promise<{ buildings: number; trees: number }> {
    const generation = ++this.generation;
    const half = radiusM + GRID_MARGIN_M;
    const bKey = `${center[0].toFixed(6)},${center[1].toFixed(6)},${radiusM}`;
    if (bKey !== this.buildingsKey) {
      const res = await loadBuildingsForDomain(map, center, half, {
        isAborted: () => generation !== this.generation,
        onWaiting,
        use: 'shade',
      });
      if (generation !== this.generation) throw aborted();
      this.buildings = res.polygons.map((p) => ({ rings: p.rings, height: p.height ?? 8, base: p.base ?? 0 }));
      this.buildingsKey = bKey;
      this.gridKey = '';
    }
    const { trees, canopyAreas } = vegetationToCanopy(vegetation, center);
    const gKey = `${bKey}|${trees.length}|${canopyAreas.length}|${vegetation?.fetchedAt ?? ''}`;
    if (gKey !== this.gridKey || !this.grid) {
      const grid = rasterizeHeightGrid({ buildings: this.buildings, trees, canopyAreas }, half, SHADOW_GRID_DX);
      const ground = new Uint8Array(grid.n * grid.n);
      let groundCells = 0;
      const r2 = radiusM * radiusM;
      for (let iy = 0; iy < grid.n; iy++) {
        const y = (iy + 0.5) * grid.dx - half;
        for (let ix = 0; ix < grid.n; ix++) {
          const x = (ix + 0.5) * grid.dx - half;
          const idx = iy * grid.n + ix;
          if (x * x + y * y <= r2 && grid.bh[idx] === 0) {
            ground[idx] = 1;
            groundCells++;
          }
        }
      }
      this.grid = grid;
      this.info = { n: grid.n, dx: grid.dx, half, center, radiusM, ground, groundCells };
      this.gridKey = gKey;
    }
    return { buildings: this.buildings.length, trees: trees.length + canopyAreas.length };
  }

  /** Ombres au sol pour une position du soleil (calcul synchrone, ~0,1 s). */
  instant(sunAzimuth: number, sunElevation: number, month: number): InstantShadowResult | null {
    const grid = this.grid;
    const info = this.info;
    if (!grid || !info) return null;
    const { n, dx, half } = grid;
    const transmission = new Uint8Array(n * n);
    const trace = makeSunTracer(grid, sunAzimuth, sunElevation, isLeafOn(month));
    let sunlit = 0;
    if (trace) {
      for (let iy = 0; iy < n; iy++) {
        const y = (iy + 0.5) * dx - half;
        const row = iy * n;
        for (let ix = 0; ix < n; ix++) {
          const idx = row + ix;
          if (!info.ground[idx]) continue;
          const T = trace((ix + 0.5) * dx - half, y, GROUND_Z);
          transmission[idx] = Math.round(T * 255);
          if (T > 0.5) sunlit++;
        }
      }
    }
    return {
      kind: 'instant',
      grid: info,
      transmission,
      sunUp: !!trace,
      sunlitFraction: info.groundCells ? sunlit / info.groundCells : 0,
    };
  }

  /**
   * Heures de soleil direct au sol sur la journée (ciel clair), par pas de 10 min. Le calcul rend
   * régulièrement la main pour garder l'interface fluide ; il s'arrête si `cancel()` est appelé.
   */
  async daily(
    dayOfYear: number,
    year: number,
    timezone: number,
    onProgress: (fraction: number) => void
  ): Promise<DailySunResult> {
    const grid = this.grid;
    const info = this.info;
    if (!grid || !info) throw new Error('Grille des hauteurs non préparée');
    const generation = ++this.dailyGeneration;
    const { n, dx, half } = grid;
    const { month, day } = dayOfYearToMonthDay(year, dayOfYear);
    const leafOn = isLeafOn(month);
    const [lng, lat] = info.center;

    // Instants (milieu de chaque pas) où le soleil est levé
    const instants: { az: number; el: number }[] = [];
    let dayLengthMin = 0;
    for (let t = DAILY_STEP_MIN / 2; t < 24 * 60; t += DAILY_STEP_MIN) {
      const pos = solarPosition(utcFromStandardTime(year, month, day, t / 60, timezone), lat, lng);
      if (pos.elevation > 0) {
        dayLengthMin += DAILY_STEP_MIN;
        instants.push({ az: pos.azimuth, el: pos.elevation });
      }
    }

    // Cumul en dixièmes de minute pour garder la transmission partielle sous les arbres
    const acc = new Float32Array(n * n);
    let lastYield = performance.now();
    for (let k = 0; k < instants.length; k++) {
      const trace = makeSunTracer(grid, instants[k].az, instants[k].el, leafOn);
      if (trace) {
        for (let iy = 0; iy < n; iy++) {
          const y = (iy + 0.5) * dx - half;
          const row = iy * n;
          for (let ix = 0; ix < n; ix++) {
            const idx = row + ix;
            if (!info.ground[idx]) continue;
            acc[idx] += trace((ix + 0.5) * dx - half, y, GROUND_Z) * DAILY_STEP_MIN;
          }
          if (performance.now() - lastYield > 30) {
            onProgress((k + iy / n) / instants.length);
            await yieldToBrowser();
            if (generation !== this.dailyGeneration) throw aborted();
            lastYield = performance.now();
          }
        }
      }
    }

    const minutes = new Uint16Array(n * n);
    const classes: [number, number, number, number] = [0, 0, 0, 0];
    let sum = 0;
    let max = 0;
    for (let i = 0; i < minutes.length; i++) {
      if (!info.ground[i]) continue;
      const mins = Math.round(acc[i]);
      minutes[i] = mins;
      const h = mins / 60;
      sum += h;
      if (h > max) max = h;
      classes[h < 2 ? 0 : h < 4 ? 1 : h < 6 ? 2 : 3]++;
    }
    const cells = info.groundCells || 1;
    return {
      kind: 'daily',
      grid: info,
      minutes,
      dayLengthMin,
      meanHours: sum / cells,
      maxHours: max,
      classes: classes.map((c) => c / cells) as [number, number, number, number],
      dayOfYear,
    };
  }
}
