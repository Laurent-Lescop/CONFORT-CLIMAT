/**
 * Grille des hauteurs de la zone (bâtiments, volumes surélevés, canopée des arbres) et lancer de
 * rayons vers le soleil. Partagée par la carte de confort (UTCI) et par l'étude des ombres portées.
 */

import type { PolygonMeters } from './windLbm';

/** Hauteur du tronc sous le houppier (m) */
export const TRUNK_HEIGHT_M = 2.5;
/** Un volume dont le dessous est à plus de 2,2 m est surélevé : on circule dessous. */
export const OVERHEAD_MIN_BASE_M = 2.2;
/** Longueur maximale d'une ombre prise en compte (m) */
export const MAX_SHADOW_DISTANCE_M = 220;
/** Marge de grille autour du disque d'étude (m) : les ombres venant de l'extérieur proche sont prises en compte. */
export const GRID_MARGIN_M = 60;

export interface GridBuilding extends PolygonMeters {
  height: number;
}

export interface GridTree {
  x: number; // mètres, est, relatif au centre
  y: number; // mètres, nord
  crownDiameter: number;
  top: number; // hauteur du sommet
}

export interface GridCanopyArea extends PolygonMeters {
  top: number;
}

export interface HeightGrid {
  n: number;
  dx: number;
  /** Demi-côté de la grille (m), centre = centre du secteur */
  half: number;
  /** Hauteur des bâtiments posés au sol (0 = sol libre) */
  bh: Float32Array;
  /** Volumes surélevés : dessus et dessous (0 = aucun) */
  ot: Float32Array;
  ob: Float32Array;
  /** Canopée des arbres : sommet et base (0 = aucune) */
  ct: Float32Array;
  cb: Float32Array;
  hmax: number;
}

/** Remplit les cellules d'un polygone (anneaux extérieur et trous, règle pair-impair). */
export function fillRings(
  rings: Float32Array[],
  n: number,
  dx: number,
  half: number,
  visit: (idx: number) => void
) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let k = 1; k < ring.length; k += 2) {
      if (ring[k] < minY) minY = ring[k];
      if (ring[k] > maxY) maxY = ring[k];
    }
  }
  const j0 = Math.max(0, Math.floor((minY + half) / dx));
  const j1 = Math.min(n - 1, Math.ceil((maxY + half) / dx));
  const hits: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const yc = (j + 0.5) * dx - half;
    hits.length = 0;
    for (const ring of rings) {
      const m = ring.length / 2;
      for (let a = 0; a < m; a++) {
        const b = a + 1 === m ? 0 : a + 1;
        const y1 = ring[a * 2 + 1];
        const y2 = ring[b * 2 + 1];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
          hits.push(ring[a * 2] + ((yc - y1) / (y2 - y1)) * (ring[b * 2] - ring[a * 2]));
        }
      }
    }
    hits.sort((p, q) => p - q);
    for (let h = 0; h + 1 < hits.length; h += 2) {
      const i0 = Math.max(0, Math.ceil((hits[h] + half) / dx - 0.5));
      const i1 = Math.min(n - 1, Math.floor((hits[h + 1] + half) / dx - 0.5));
      for (let i = i0; i <= i1; i++) visit(j * n + i);
    }
  }
}

/** Grille carrée de demi-côté `half` et de pas `dx` contenant bâtiments et canopée. */
export function rasterizeHeightGrid(
  input: { buildings: GridBuilding[]; trees: GridTree[]; canopyAreas: GridCanopyArea[] },
  half: number,
  dx: number
): HeightGrid {
  const n = Math.round((2 * half) / dx);
  const N = n * n;
  const bh = new Float32Array(N);
  const ot = new Float32Array(N);
  const ob = new Float32Array(N);
  for (const b of input.buildings) {
    const base = b.base ?? 0;
    if (base < OVERHEAD_MIN_BASE_M) {
      fillRings(b.rings, n, dx, half, (idx) => {
        if (b.height > bh[idx]) bh[idx] = b.height;
      });
    } else {
      fillRings(b.rings, n, dx, half, (idx) => {
        if (ot[idx] === 0) {
          ot[idx] = b.height;
          ob[idx] = base;
        } else {
          if (b.height > ot[idx]) ot[idx] = b.height;
          if (base < ob[idx]) ob[idx] = base;
        }
      });
    }
  }

  const ct = new Float32Array(N);
  const cb = new Float32Array(N);
  const addCanopy = (idx: number, top: number, bottom: number) => {
    if (ct[idx] === 0) {
      ct[idx] = top;
      cb[idx] = bottom;
    } else {
      if (top > ct[idx]) ct[idx] = top;
      if (bottom < cb[idx]) cb[idx] = bottom;
    }
  };
  for (const a of input.canopyAreas) {
    fillRings(a.rings, n, dx, half, (idx) => addCanopy(idx, a.top, Math.min(TRUNK_HEIGHT_M, a.top * 0.4)));
  }
  for (const t of input.trees) {
    // Houppier en ellipsoïde : base = tronc, sommet = hauteur de l'arbre
    const rad = Math.max(dx, t.crownDiameter / 2);
    const base = Math.min(TRUNK_HEIGHT_M, t.top * 0.4);
    const zc = (base + t.top) / 2;
    const bz = (t.top - base) / 2;
    const i0 = Math.max(0, Math.floor((t.x - rad + half) / dx));
    const i1 = Math.min(n - 1, Math.ceil((t.x + rad + half) / dx));
    const j0 = Math.max(0, Math.floor((t.y - rad + half) / dx));
    const j1 = Math.min(n - 1, Math.ceil((t.y + rad + half) / dx));
    for (let j = j0; j <= j1; j++) {
      const yc = (j + 0.5) * dx - half - t.y;
      for (let i = i0; i <= i1; i++) {
        const xc = (i + 0.5) * dx - half - t.x;
        const q = (xc * xc + yc * yc) / (rad * rad);
        if (q > 1) continue;
        const s = Math.sqrt(1 - q);
        addCanopy(j * n + i, zc + bz * s, zc - bz * s);
      }
    }
  }

  let hmax = 0;
  for (let i = 0; i < N; i++) {
    if (bh[i] > hmax) hmax = bh[i];
    if (ct[i] > hmax) hmax = ct[i];
    if (ot[i] > hmax) hmax = ot[i];
  }
  return { n, dx, half, bh, ot, ob, ct, cb, hmax };
}

/** Coefficient d'extinction de la canopée (1/m) : feuillus avec ou sans feuilles. */
export function canopyExtinction(leafOn: boolean): number {
  return leafOn ? 0.35 : 0.08;
}

/** Feuillage des arbres caducs : d'avril à octobre. */
export function isLeafOn(month: number): boolean {
  return month >= 4 && month <= 10;
}

/**
 * Prépare le lancer de rayons vers le soleil. La fonction renvoyée donne la transmission du
 * rayonnement direct (1 = plein soleil, 0 = ombre d'un bâtiment, entre les deux sous les arbres)
 * pour un point (x, y) en mètres à la hauteur z0. Renvoie null si le soleil est sous l'horizon.
 */
export function makeSunTracer(
  g: HeightGrid,
  sunAzimuthDeg: number,
  sunElevationDeg: number,
  leafOn: boolean
): ((x: number, y: number, z0: number) => number) | null {
  if (sunElevationDeg <= 0.5) return null;
  const { n, dx, half, bh, ot, ob, ct, cb, hmax } = g;
  const az = (sunAzimuthDeg * Math.PI) / 180;
  const el = (sunElevationDeg * Math.PI) / 180;
  const ds = Math.max(dx, 0.5);
  const stepX = Math.sin(az) * ds;
  const stepY = Math.cos(az) * ds;
  const stepZ = Math.tan(el) * ds;
  const trans = Math.exp(-canopyExtinction(leafOn) * (ds / Math.cos(el)));
  const maxDistSteps = Math.ceil(MAX_SHADOW_DISTANCE_M / ds);
  const { nb, cells: B, dilatedMax } = blockMaxima(g);
  const blockM = B * dx;
  // Saut sans risque : tant que le rayon est au-dessus de tout ce qui se trouve dans le bloc courant
  // et ses 8 voisins, il ne peut rien toucher sur une distance d'un bloc (le rayon ne fait que monter).
  const jumpSteps = Math.max(1, Math.floor(blockM / ds));

  return (x0: number, y0: number, z0: number) => {
    const maxSteps = Math.min(maxDistSteps, Math.ceil(Math.max(0, hmax - z0) / stepZ) + 1);
    let px = x0;
    let py = y0;
    let z = z0;
    let T = 1;
    for (let k = 0; k < maxSteps; ) {
      const bx = Math.floor((px + half) / blockM);
      const by = Math.floor((py + half) / blockM);
      if (bx >= 0 && by >= 0 && bx < nb && by < nb && z >= dilatedMax[by * nb + bx]) {
        px += stepX * jumpSteps;
        py += stepY * jumpSteps;
        z += stepZ * jumpSteps;
        k += jumpSteps;
        continue;
      }
      px += stepX;
      py += stepY;
      z += stepZ;
      k++;
      const jx = Math.floor((px + half) / dx);
      const jy = Math.floor((py + half) / dx);
      if (jx < 0 || jy < 0 || jx >= n || jy >= n) break;
      const j = jy * n + jx;
      if (bh[j] > z || (ot[j] > 0 && z >= ob[j] && z <= ot[j])) return 0;
      if (ct[j] > 0 && z >= cb[j] && z <= ct[j]) {
        T *= trans;
        if (T < 0.004) return 0;
      }
    }
    return T;
  };
}

const blockCache = new WeakMap<HeightGrid, { nb: number; cells: number; dilatedMax: Float32Array }>();

/**
 * Hauteur maximale (bâtiments, volumes surélevés, canopée) par bloc d'environ 8 m, élargie aux
 * 8 blocs voisins : sert à sauter les espaces dégagés lors du lancer de rayons.
 */
function blockMaxima(g: HeightGrid) {
  const cached = blockCache.get(g);
  if (cached) return cached;
  const { n, dx, bh, ot, ct } = g;
  const B = Math.max(2, Math.round(8 / dx));
  const nb = Math.ceil(n / B);
  const bmax = new Float32Array(nb * nb);
  for (let j = 0; j < n; j++) {
    const by = Math.floor(j / B);
    for (let i = 0; i < n; i++) {
      const idx = j * n + i;
      const h = Math.max(bh[idx], ot[idx], ct[idx]);
      const b = by * nb + Math.floor(i / B);
      if (h > bmax[b]) bmax[b] = h;
    }
  }
  const dilatedMax = new Float32Array(nb * nb);
  for (let by = 0; by < nb; by++) {
    for (let bx = 0; bx < nb; bx++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = by + dy;
        if (yy < 0 || yy >= nb) continue;
        for (let dxb = -1; dxb <= 1; dxb++) {
          const xx = bx + dxb;
          if (xx < 0 || xx >= nb) continue;
          if (bmax[yy * nb + xx] > m) m = bmax[yy * nb + xx];
        }
      }
      dilatedMax[by * nb + bx] = m;
    }
  }
  const out = { nb, cells: B, dilatedMax };
  blockCache.set(g, out);
  return out;
}
