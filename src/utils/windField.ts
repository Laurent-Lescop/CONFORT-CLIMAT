/**
 * Champ de vent calculé sur la zone d'étude : structure de données, échantillonnage,
 * palette de couleurs et image de la carte de vitesse.
 */

import { LngLat, metersPerDegree } from './geoUtils';

export interface WindField {
  center: LngLat;
  /** Rayon du disque d'étude (m) */
  radiusM: number;
  nx: number;
  ny: number;
  /** Taille d'une cellule (m) */
  dx: number;
  /** Direction d'où vient le vent (° depuis le nord, sens horaire) */
  directionFrom: number;
  /** Vitesse de référence (m/s), à 10 m en terrain dégagé (fichier EPW ou saisie) */
  speedRef: number;
  /** Rapport de vitesse U/U∞, composantes est et nord ; 0 dans les obstacles */
  u: Float32Array;
  v: Float32Array;
  solid: Uint8Array;
  /** Vrai si le champ est une moyenne temporelle (sinon instantané) */
  averaged: boolean;
}

export const WIND_ANIMATION_SPEED_MS = 45; // vitesse visuelle des particules pour un rapport de 1 (animation accélérée)

/** Demi-côté du domaine carré (m). */
export function fieldHalfSide(f: Pick<WindField, 'nx' | 'dx'>): number {
  return (f.nx * f.dx) / 2;
}

/**
 * Vitesse (rapport U/U∞) au point (x, y) en mètres relatifs au centre, par interpolation bilinéaire
 * des cellules fluides. `solid` vaut true si le point tombe dans un obstacle.
 */
export function sampleField(f: WindField, x: number, y: number, out: { u: number; v: number; solid: boolean }) {
  const half = fieldHalfSide(f);
  const gx = (x + half) / f.dx - 0.5;
  const gy = (y + half) / f.dx - 0.5;
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  if (i0 < 0 || j0 < 0 || i0 >= f.nx - 1 || j0 >= f.ny - 1) {
    out.u = 0;
    out.v = 0;
    out.solid = true; // hors domaine
    return out;
  }
  const tx = gx - i0;
  const ty = gy - j0;
  const idx = j0 * f.nx + i0;
  // Cellule la plus proche : si elle est solide, le point est dans un bâtiment
  const near = (ty < 0.5 ? 0 : f.nx) + idx + (tx < 0.5 ? 0 : 1);
  if (f.solid[near] === 1) {
    out.u = 0;
    out.v = 0;
    out.solid = true;
    return out;
  }
  const w00 = (1 - tx) * (1 - ty) * (f.solid[idx] ? 0 : 1);
  const w10 = tx * (1 - ty) * (f.solid[idx + 1] ? 0 : 1);
  const w01 = (1 - tx) * ty * (f.solid[idx + f.nx] ? 0 : 1);
  const w11 = tx * ty * (f.solid[idx + f.nx + 1] ? 0 : 1);
  const sw = w00 + w10 + w01 + w11 || 1;
  out.u = (f.u[idx] * w00 + f.u[idx + 1] * w10 + f.u[idx + f.nx] * w01 + f.u[idx + f.nx + 1] * w11) / sw;
  out.v = (f.v[idx] * w00 + f.v[idx + 1] * w10 + f.v[idx + f.nx] * w01 + f.v[idx + f.nx + 1] * w11) / sw;
  out.solid = false;
  return out;
}

/**
 * Palette divergente du rapport de vitesse : bleu foncé (calme) → cyan → blanc (≈ vent libre)
 * → jaune → orange → rouge (forte accélération).
 */
const STOPS: [number, [number, number, number]][] = [
  [0.0, [37, 52, 148]],
  [0.35, [44, 127, 184]],
  [0.7, [127, 205, 187]],
  [1.0, [240, 244, 240]],
  [1.25, [254, 217, 118]],
  [1.5, [253, 141, 60]],
  [1.9, [215, 25, 28]],
];

export function speedColor(ratio: number): [number, number, number] {
  const r = Math.max(0, ratio);
  if (r >= STOPS[STOPS.length - 1][0]) return STOPS[STOPS.length - 1][1];
  let i = 0;
  while (i < STOPS.length - 2 && r > STOPS[i + 1][0]) i++;
  const [r0, c0] = STOPS[i];
  const [r1, c1] = STOPS[i + 1];
  const t = (r - r0) / (r1 - r0);
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
}

/** Dégradé CSS de la palette, pour la légende. */
export function speedLegendGradient(): string {
  const max = STOPS[STOPS.length - 1][0];
  return `linear-gradient(to right, ${STOPS.map(([r, [R, G, B]]) => `rgb(${R},${G},${B}) ${((r / max) * 100).toFixed(0)}%`).join(', ')})`;
}

/** Dessine la carte de vitesse (nord en haut) dans `canvas` ; transparente hors disque et dans les bâtiments. */
export function renderSpeedCanvas(f: WindField, canvas: HTMLCanvasElement) {
  canvas.width = f.nx;
  canvas.height = f.ny;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(f.nx, f.ny);
  const half = fieldHalfSide(f);
  const r2 = f.radiusM * f.radiusM;
  for (let j = 0; j < f.ny; j++) {
    const row = f.ny - 1 - j; // la ligne 0 de la grille est au sud
    const ym = (j + 0.5) * f.dx - half;
    for (let i = 0; i < f.nx; i++) {
      const xm = (i + 0.5) * f.dx - half;
      const o = (row * f.nx + i) * 4;
      const idx = j * f.nx + i;
      if (xm * xm + ym * ym > r2 || f.solid[idx] === 1) {
        img.data[o + 3] = 0;
        continue;
      }
      const [R, G, B] = speedColor(Math.hypot(f.u[idx], f.v[idx]));
      img.data[o] = R;
      img.data[o + 1] = G;
      img.data[o + 2] = B;
      img.data[o + 3] = 215;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Coins du domaine [NO, NE, SE, SO] en [lng, lat], pour positionner l'image sur la carte. */
export function fieldCorners(f: Pick<WindField, 'center' | 'nx' | 'dx'>): [LngLat, LngLat, LngLat, LngLat] {
  const half = fieldHalfSide(f);
  const m = metersPerDegree(f.center[1]);
  const dLng = half / m.lng;
  const dLat = half / m.lat;
  const [lng, lat] = f.center;
  return [
    [lng - dLng, lat + dLat],
    [lng + dLng, lat + dLat],
    [lng + dLng, lat - dLat],
    [lng - dLng, lat - dLat],
  ];
}
