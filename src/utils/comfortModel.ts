/**
 * Carte de confort thermique extérieur (UTCI) pour une heure donnée, sur une grille fine (0,5 m).
 *
 * Chaîne de calcul :
 *   1. rasterisation des hauteurs (bâtiments, houppiers d'arbres, boisements) ;
 *   2. ombres portées par lancer de rayon vers le soleil (bâtiments opaques, canopée semi-transparente) ;
 *   3. part de ciel visible (SVF) par balayage de 16 azimuts ;
 *   4. température radiante moyenne (Tmrt) d'une personne debout, modèle simplifié de type SOLWEIG :
 *      6 directions, ondes courtes et longues, sol échauffé par le rayonnement ;
 *   5. vitesse du vent par cellule = rapport de vitesse de la simulation × vitesse EPW ;
 *   6. UTCI par le polynôme officiel.
 *
 * Hypothèses assumées (résultat qualitatif d'aide à la conception, pas un calcul réglementaire) :
 * instantané (pas d'inertie thermique du sol et des façades), albédo du sol uniforme, façades à la
 * température de l'air, pas de réflexions multiples entre bâtiments, canopée d'arbres feuillue.
 */

import { WindField } from './windField';
import { UTCI_CATEGORIES, makeUtciEvaluator, utciColor } from './utci';
import {
  GRID_MARGIN_M,
  GridBuilding,
  GridCanopyArea,
  GridTree,
  makeSunTracer,
  rasterizeHeightGrid,
} from './heightGrid';

const SIGMA = 5.670374419e-8; // constante de Stefan-Boltzmann
const BODY_Z = 1.1; // hauteur du centre du corps (m)
const GROUND_ALBEDO = 0.2;
const GROUND_EMISSIVITY = 0.95;
const WALL_EXCESS_K = 1; // façades légèrement plus chaudes que l'air
const SHORTWAVE_ABSORPTIVITY = 0.7;
const LONGWAVE_ABSORPTIVITY = 0.97;
const NO_DATA = -32768;

/** Volume bâti (avec `base` > 2,2 m pour une partie surélevée) */
export type ComfortBuilding = GridBuilding;
export type ComfortTree = GridTree;
export type ComfortCanopyArea = GridCanopyArea;

export interface ComfortWeather {
  taC: number;
  rhPercent: number;
  /**
   * Vent à 10 m arrivant sur le quartier (m/s) : vent de la station EPW corrigé de la rugosité du
   * terrain. Multiplié par le rapport local de la simulation, il donne la vitesse « équivalente à 10 m »
   * attendue par l'UTCI.
   */
  wind10: number;
  /** Rayonnements EPW (W/m²) */
  dni: number;
  dhi: number;
  /** Rayonnement infrarouge horizontal du ciel (W/m²) */
  lwSky: number;
  sunAzimuth: number;
  sunElevation: number;
  /** Arbres feuillus avec feuilles (transmission faible) ou sans feuilles */
  leafOn: boolean;
}

export interface ComfortInput {
  radiusM: number;
  /** Taille de cellule (m) : 0,5 par défaut */
  dx: number;
  buildings: ComfortBuilding[];
  trees: ComfortTree[];
  canopyAreas: ComfortCanopyArea[];
  /** Champ de vent calculé (rapport U/U∞) ; null = vent uniforme */
  wind: Pick<WindField, 'nx' | 'ny' | 'dx' | 'u' | 'v' | 'solid'> | null;
  weather: ComfortWeather;
}

export interface ComfortStats {
  /** Part de la surface libre du disque dans chaque catégorie UTCI (10 valeurs) */
  categoryFractions: number[];
  utciMin: number;
  utciMax: number;
  utciMean: number;
  tmrtMean: number;
  sunlitFraction: number;
  windMeanMs: number;
}

export interface ComfortResult {
  n: number;
  dx: number;
  /** Demi-côté de la grille (m), centre = centre du secteur */
  half: number;
  /** UTCI × 100 (°C), NO_DATA (−32768) dans les bâtiments et hors du disque */
  utci: Int16Array;
  tmrt: Int16Array;
  /** Vent (m/s) × 10 */
  wind: Uint8Array;
  /** Transmission du rayonnement direct, 0..255 (0 = ombre) */
  beam: Uint8Array;
  /** Part de ciel visible, 0..255 */
  svf: Uint8Array;
  rgba: Uint8ClampedArray;
  stats: ComfortStats;
}

export { NO_DATA as COMFORT_NO_DATA };

/** Marge de grille autour du disque d'étude (m) : les ombres venant de l'extérieur proche sont prises en compte. */
export const COMFORT_MARGIN_M = GRID_MARGIN_M;

export function comfortGridSize(radiusM: number, dx: number): { n: number; half: number } {
  const half = radiusM + COMFORT_MARGIN_M;
  return { n: Math.round((2 * half) / dx), half };
}

type Progress = (phase: string, fraction: number) => void;

export async function computeComfort(
  input: ComfortInput,
  onProgress: Progress,
  /** Appelé régulièrement : permet au worker de rendre la main (annulation) */
  yieldControl: () => Promise<void>
): Promise<ComfortResult> {
  const { radiusM, dx, weather: w } = input;
  const { n, half } = comfortGridSize(radiusM, dx);
  const N = n * n;
  const r2 = radiusM * radiusM;
  const inDisc = (ix: number, iy: number) => {
    const x = (ix + 0.5) * dx - half;
    const y = (iy + 0.5) * dx - half;
    return x * x + y * y <= r2;
  };

  // ---- 1. Hauteurs ----
  onProgress('Hauteurs des bâtiments et de la canopée', 0);
  const grid = rasterizeHeightGrid(input, half, dx);
  const { bh, ot, ct, cb, hmax } = grid;
  await yieldControl();

  // ---- 2. Ombres portées (rayon vers le soleil depuis le centre du corps) ----
  const beam = new Uint8Array(N);
  const sunEl = w.sunElevation;
  const sunAz = (w.sunAzimuth * Math.PI) / 180;
  const trace = sunEl > 1 ? makeSunTracer(grid, w.sunAzimuth, sunEl, w.leafOn) : null;
  if (trace) {
    for (let iy = 0; iy < n; iy++) {
      const y0 = (iy + 0.5) * dx - half;
      for (let ix = 0; ix < n; ix++) {
        if (!inDisc(ix, iy)) continue;
        const idx = iy * n + ix;
        if (bh[idx] > 0) continue;
        beam[idx] = Math.round(trace((ix + 0.5) * dx - half, y0, BODY_Z) * 255);
      }
      if (iy % 64 === 0) {
        onProgress('Ombres portées', iy / n);
        await yieldControl();
      }
    }
  }

  // ---- 3. Part de ciel visible : balayage de 16 azimuts, calculée sur une grille ~1 m puis étalée ----
  const f = Math.max(1, Math.round(1 / dx));
  const nc = Math.floor(n / f);
  const svf = new Uint8Array(N).fill(255);
  const AZ = 16;
  const azSin = new Float64Array(AZ);
  const azCos = new Float64Array(AZ);
  for (let a = 0; a < AZ; a++) {
    azSin[a] = Math.sin((a / AZ) * Math.PI * 2);
    azCos[a] = Math.cos((a / AZ) * Math.PI * 2);
  }
  const DIST = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 27, 33, 40, 50, 60, 75, 90, 110, 135, 165, 200, 250];
  for (let cy = 0; cy < nc; cy++) {
    const iyMid = Math.min(n - 1, cy * f + (f >> 1));
    const y = (iyMid + 0.5) * dx - half;
    for (let cx = 0; cx < nc; cx++) {
      const ixMid = Math.min(n - 1, cx * f + (f >> 1));
      if (!inDisc(ixMid, iyMid)) continue;
      const x = (ixMid + 0.5) * dx - half;
      let value = 1;
      if (bh[iyMid * n + ixMid] > 0) {
        value = 0;
      } else if (hmax > BODY_Z) {
        let sum = 0;
        for (let a = 0; a < AZ; a++) {
          let tanH = 0;
          for (let k = 0; k < DIST.length; k++) {
            const d = DIST[k];
            const jx = Math.floor((x + azSin[a] * d + half) / dx);
            const jy = Math.floor((y + azCos[a] * d + half) / dx);
            if (jx < 0 || jy < 0 || jx >= n || jy >= n) break;
            const h = Math.max(bh[jy * n + jx], ot[jy * n + jx]);
            if (h > BODY_Z) {
              const t = (h - BODY_Z) / d;
              if (t > tanH) tanH = t;
            }
          }
          sum += 1 / (1 + tanH * tanH); // cos²(angle d'horizon)
        }
        value = sum / AZ;
      }
      const v8 = Math.round(value * 255);
      for (let jy = cy * f; jy < Math.min(n, (cy + 1) * f); jy++) {
        const row = jy * n;
        for (let jx = cx * f; jx < Math.min(n, (cx + 1) * f); jx++) svf[row + jx] = v8;
      }
    }
    if (cy % 32 === 0) {
      onProgress('Part de ciel visible', cy / nc);
      await yieldControl();
    }
  }

  // ---- 4-6. Tmrt, vent, UTCI ----
  const utciEval = makeUtciEvaluator(w.taC, w.rhPercent);
  const tmrt = new Int16Array(N).fill(NO_DATA);
  const utciOut = new Int16Array(N).fill(NO_DATA);
  const windOut = new Uint8Array(N);

  const sinEl = Math.sin((Math.max(sunEl, 0) * Math.PI) / 180);
  const cosEl = Math.cos((Math.max(sunEl, 0) * Math.PI) / 180);
  // Faces latérales de la personne : N, E, S, O (azimuts 0, 90, 180, 270)
  const faceCos = [0, 90, 180, 270].map((az) => Math.max(0, Math.cos(sunAz - (az * Math.PI) / 180)));
  const faceCosSum = faceCos.reduce((s, c) => s + c, 0);
  const tAirK = w.taC + 273.15;
  const lWall = SIGMA * GROUND_EMISSIVITY * Math.pow(tAirK + WALL_EXCESS_K, 4);
  const diffuseOverhead = w.leafOn ? 0.35 : 0.75; // transmission diffuse sous canopée
  const F_UP = 0.06;
  const F_SIDE = 0.22;

  const wf = input.wind;
  const half_w = wf ? (wf.nx * wf.dx) / 2 : 0;
  /** Rapport de vitesse interpolé sur les cellules fluides du champ de vent. */
  const windRatio = (x: number, y: number): number => {
    if (!wf) return 1;
    const gx = (x + half_w) / wf.dx - 0.5;
    const gy = (y + half_w) / wf.dx - 0.5;
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    if (i0 < 0 || j0 < 0 || i0 >= wf.nx - 1 || j0 >= wf.ny - 1) return 1;
    const tx = gx - i0;
    const ty = gy - j0;
    const a = j0 * wf.nx + i0;
    const w00 = (1 - tx) * (1 - ty) * (wf.solid[a] ? 0 : 1);
    const w10 = tx * (1 - ty) * (wf.solid[a + 1] ? 0 : 1);
    const w01 = (1 - tx) * ty * (wf.solid[a + wf.nx] ? 0 : 1);
    const w11 = tx * ty * (wf.solid[a + wf.nx + 1] ? 0 : 1);
    const sw = w00 + w10 + w01 + w11;
    if (sw < 1e-3) return 0.3; // cellule entourée d'obstacles : air quasi calme
    const uu = (wf.u[a] * w00 + wf.u[a + 1] * w10 + wf.u[a + wf.nx] * w01 + wf.u[a + wf.nx + 1] * w11) / sw;
    const vv = (wf.v[a] * w00 + wf.v[a + 1] * w10 + wf.v[a + wf.nx] * w01 + wf.v[a + wf.nx + 1] * w11) / sw;
    return Math.hypot(uu, vv);
  };

  // Statistiques
  const catCount = new Float64Array(UTCI_CATEGORIES.length);
  let cells = 0;
  let sumU = 0;
  let sumT = 0;
  let sumW = 0;
  let sunlit = 0;
  let uMin = Infinity;
  let uMax = -Infinity;

  for (let iy = 0; iy < n; iy++) {
    const y = (iy + 0.5) * dx - half;
    for (let ix = 0; ix < n; ix++) {
      if (!inDisc(ix, iy)) continue;
      const idx = iy * n + ix;
      if (bh[idx] > 0) continue;
      const T = beam[idx] / 255;
      let sv = svf[idx] / 255;
      // Canopée au-dessus de la personne : le ciel est en partie masqué
      if (ct[idx] > 0 && cb[idx] > BODY_Z) sv *= diffuseOverhead;
      // Sous un volume surélevé (passage couvert) : ciel visible seulement par les côtés
      if (ot[idx] > 0) sv *= 0.25;
      const x = (ix + 0.5) * dx - half;

      // Ondes courtes (W/m²) sur chacune des 6 directions
      const kDirHoriz = w.dni * T * sinEl; // direct sur une surface horizontale
      const kDown = kDirHoriz + w.dhi * sv; // sur le dessus de la personne et sur le sol
      const kUpFace = kDown;
      const kDownFace = GROUND_ALBEDO * kDown;
      const kSidesDiffuse = 4 * (0.5 * w.dhi * sv + 0.5 * GROUND_ALBEDO * kDown);
      const kSidesBeam = w.dni * T * cosEl * faceCosSum;
      const kWeighted = F_UP * (kUpFace + kDownFace) + F_SIDE * (kSidesDiffuse + kSidesBeam);

      // Ondes longues : sol échauffé par le soleil, ciel (EPW) et façades à la température de l'air
      const groundExcess = Math.min(35, 0.035 * (1 - GROUND_ALBEDO) * kDown);
      const lGround = SIGMA * GROUND_EMISSIVITY * Math.pow(tAirK + groundExcess, 4);
      const lUpFace = sv * w.lwSky + (1 - sv) * lWall;
      const lSide = 0.5 * (lUpFace + lGround);
      const lWeighted = F_UP * (lUpFace + lGround) + F_SIDE * 4 * lSide;

      const sStr = SHORTWAVE_ABSORPTIVITY * kWeighted + LONGWAVE_ABSORPTIVITY * lWeighted;
      const tmrtC = Math.pow(sStr / (LONGWAVE_ABSORPTIVITY * SIGMA), 0.25) - 273.15;

      const windMs = windRatio(x, y) * w.wind10;
      const u = utciEval(windMs, tmrtC);

      tmrt[idx] = Math.round(tmrtC * 100);
      utciOut[idx] = Math.round(u * 100);
      windOut[idx] = Math.min(255, Math.round(windMs * 10));

      // Statistiques
      cells++;
      sumU += u;
      sumT += tmrtC;
      sumW += windMs;
      if (T > 0.5) sunlit++;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      let c = 0;
      for (let k = 0; k < UTCI_CATEGORIES.length; k++) if (u >= UTCI_CATEGORIES[k].min) c = k;
      catCount[c]++;
    }
    if (iy % 64 === 0) {
      onProgress('Température radiante et UTCI', iy / n);
      await yieldControl();
    }
  }

  // ---- Image RGBA (nord en haut) ----
  onProgress('Carte de couleurs', 0);
  // Table de couleurs au dixième de degré, de −50 à +70 °C
  const lutMin = -50;
  const lut = new Uint8ClampedArray(1201 * 3);
  for (let i = 0; i <= 1200; i++) {
    const [r, g, b] = utciColor(lutMin + i / 10);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  const rgba = new Uint8ClampedArray(N * 4);
  for (let iy = 0; iy < n; iy++) {
    const row = n - 1 - iy;
    for (let ix = 0; ix < n; ix++) {
      const v = utciOut[iy * n + ix];
      if (v === NO_DATA) continue;
      const li = Math.max(0, Math.min(1200, Math.round(v / 10 - lutMin * 10))) * 3;
      const o = (row * n + ix) * 4;
      rgba[o] = lut[li];
      rgba[o + 1] = lut[li + 1];
      rgba[o + 2] = lut[li + 2];
      rgba[o + 3] = 215;
    }
  }

  const total = cells || 1;
  return {
    n,
    dx,
    half,
    utci: utciOut,
    tmrt,
    wind: windOut,
    beam,
    svf,
    rgba,
    stats: {
      categoryFractions: Array.from(catCount, (c) => c / total),
      utciMin: cells ? uMin : NaN,
      utciMax: cells ? uMax : NaN,
      utciMean: sumU / total,
      tmrtMean: sumT / total,
      sunlitFraction: sunlit / total,
      windMeanMs: sumW / total,
    },
  };
}
