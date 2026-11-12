/**
 * Solveur d'écoulement 2D (vue en plan) par méthode de Boltzmann sur réseau (D2Q9),
 * avec modèle de turbulence de Smagorinsky.
 *
 * Principe : le vent traverse un domaine carré où les bâtiments sont des obstacles
 * (rebond demi-chemin). L'écoulement moyen (moyenne temporelle) donne le rapport de vitesse
 * U / U∞ en chaque point : accélérations aux angles et dans les rues canalisées, zones calmes
 * dans les sillages.
 *
 * Limites assumées (modèle « 2,5D ») : il s'agit d'une coupe horizontale à hauteur de piéton.
 * Un bâtiment est un obstacle quelle que soit sa hauteur au-delà d'un seuil : les écoulements
 * par-dessus les toits, les tourbillons de coin verticaux et le profil de vent vertical ne sont
 * pas représentés. Résultats qualitatifs, utiles pour repérer les tendances, pas pour dimensionner.
 */

const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];

export interface LbmOptions {
  nx: number;
  ny: number;
  /** Indicateur d'obstacle (1 = solide), taille nx*ny, ligne 0 = sud */
  solid: Uint8Array;
  /** Direction vers laquelle souffle le vent : composantes unitaires (est, nord) */
  windEast: number;
  windNorth: number;
  /** Vitesse du vent en unités du réseau (≈ 0.05–0.1 ; nombre de Mach = U·√3) */
  latticeSpeed?: number;
  /** Viscosité moléculaire du réseau (plus petit = plus turbulent, moins stable) */
  viscosity?: number;
  /** Constante de Smagorinsky */
  smagorinsky?: number;
}

export class LbmSolver {
  readonly nx: number;
  readonly ny: number;
  readonly n: number;
  readonly solid: Uint8Array;
  readonly U: number;
  private f: Float32Array;
  private g: Float32Array;
  private readonly tau0: number;
  private readonly cs2: number;
  private readonly inL: boolean;
  private readonly inR: boolean;
  private readonly inB: boolean;
  private readonly inT: boolean;
  private readonly uxInf: number;
  private readonly uyInf: number;
  /** Cumul pour la moyenne temporelle */
  private sumUx: Float32Array;
  private sumUy: Float32Array;
  private samples = 0;
  /** Vitesse instantanée (dernier pas) */
  readonly ux: Float32Array;
  readonly uy: Float32Array;
  steps = 0;

  constructor(opts: LbmOptions) {
    this.nx = opts.nx;
    this.ny = opts.ny;
    this.n = opts.nx * opts.ny;
    this.solid = opts.solid;
    this.U = opts.latticeSpeed ?? 0.08;
    const nu = opts.viscosity ?? 0.002;
    this.tau0 = 0.5 + 3 * nu;
    const cs = opts.smagorinsky ?? 0.16;
    this.cs2 = cs * cs;

    const len = Math.hypot(opts.windEast, opts.windNorth) || 1;
    const ex = opts.windEast / len;
    const ey = opts.windNorth / len;
    this.uxInf = ex * this.U;
    this.uyInf = ey * this.U;
    // Arêtes « amont » : le vent entre par là
    const eps = 1e-6;
    this.inL = ex > eps;
    this.inR = ex < -eps;
    this.inB = ey > eps;
    this.inT = ey < -eps;

    // Bordure toujours fluide
    for (let x = 0; x < this.nx; x++) {
      this.solid[x] = 0;
      this.solid[(this.ny - 1) * this.nx + x] = 0;
    }
    for (let y = 0; y < this.ny; y++) {
      this.solid[y * this.nx] = 0;
      this.solid[y * this.nx + this.nx - 1] = 0;
    }

    this.f = new Float32Array(9 * this.n);
    this.g = new Float32Array(9 * this.n);
    this.sumUx = new Float32Array(this.n);
    this.sumUy = new Float32Array(this.n);
    this.ux = new Float32Array(this.n);
    this.uy = new Float32Array(this.n);

    // Écoulement uniforme initial
    const feq = this.equilibrium(1, this.uxInf, this.uyInf);
    for (let i = 0; i < 9; i++) {
      this.f.fill(feq[i], i * this.n, (i + 1) * this.n);
      this.g.fill(feq[i], i * this.n, (i + 1) * this.n);
    }
    this.ux.fill(this.uxInf);
    this.uy.fill(this.uyInf);
  }

  private equilibrium(rho: number, ux: number, uy: number): number[] {
    const out = new Array<number>(9);
    const usq = 1.5 * (ux * ux + uy * uy);
    for (let i = 0; i < 9; i++) {
      const cu = 3 * (CX[i] * ux + CY[i] * uy);
      out[i] = W[i] * rho * (1 + cu + 0.5 * cu * cu - usq);
    }
    return out;
  }

  /** Avance d'un pas de temps (propagation + collision fusionnées, schéma « pull »). */
  step(accumulate = false): void {
    const { nx, ny, n, solid, f, g, tau0, cs2 } = this;
    const ux = this.ux;
    const uy = this.uy;
    const SQ = 18 * Math.SQRT2 * cs2;
    // Rayon de lecture des voisins pour chaque direction
    const off1 = -1, off2 = -nx, off3 = 1, off4 = nx, off5 = -nx - 1, off6 = -nx + 1, off7 = nx + 1, off8 = nx - 1;

    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const idx = y * nx + x;
        if (solid[idx] === 1) continue;

        // Propagation (pull) avec rebond sur les obstacles
        const f0 = f[idx];
        const f1 = solid[idx + off1] === 1 ? f[3 * n + idx] : f[n + idx + off1];
        const f2 = solid[idx + off2] === 1 ? f[4 * n + idx] : f[2 * n + idx + off2];
        const f3 = solid[idx + off3] === 1 ? f[n + idx] : f[3 * n + idx + off3];
        const f4 = solid[idx + off4] === 1 ? f[2 * n + idx] : f[4 * n + idx + off4];
        const f5 = solid[idx + off5] === 1 ? f[7 * n + idx] : f[5 * n + idx + off5];
        const f6 = solid[idx + off6] === 1 ? f[8 * n + idx] : f[6 * n + idx + off6];
        const f7 = solid[idx + off7] === 1 ? f[5 * n + idx] : f[7 * n + idx + off7];
        const f8 = solid[idx + off8] === 1 ? f[6 * n + idx] : f[8 * n + idx + off8];

        const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
        const inv = 1 / rho;
        const vx = (f1 - f3 + f5 - f6 - f7 + f8) * inv;
        const vy = (f2 - f4 + f5 + f6 - f7 - f8) * inv;
        ux[idx] = vx;
        uy[idx] = vy;

        const usq = 1.5 * (vx * vx + vy * vy);
        const r = rho;
        // Équilibres
        const e0 = (4 / 9) * r * (1 - usq);
        let cu = 3 * vx;
        const e1 = (1 / 9) * r * (1 + cu + 0.5 * cu * cu - usq);
        const e3 = (1 / 9) * r * (1 - cu + 0.5 * cu * cu - usq);
        cu = 3 * vy;
        const e2 = (1 / 9) * r * (1 + cu + 0.5 * cu * cu - usq);
        const e4 = (1 / 9) * r * (1 - cu + 0.5 * cu * cu - usq);
        cu = 3 * (vx + vy);
        const e5 = (1 / 36) * r * (1 + cu + 0.5 * cu * cu - usq);
        const e7 = (1 / 36) * r * (1 - cu + 0.5 * cu * cu - usq);
        cu = 3 * (-vx + vy);
        const e6 = (1 / 36) * r * (1 + cu + 0.5 * cu * cu - usq);
        const e8 = (1 / 36) * r * (1 - cu + 0.5 * cu * cu - usq);

        // Tenseur des contraintes hors-équilibre -> viscosité de Smagorinsky
        const n1 = f1 - e1, n2 = f2 - e2, n3 = f3 - e3, n4 = f4 - e4;
        const n5 = f5 - e5, n6 = f6 - e6, n7 = f7 - e7, n8 = f8 - e8;
        const pxx = n1 + n3 + n5 + n6 + n7 + n8;
        const pyy = n2 + n4 + n5 + n6 + n7 + n8;
        const pxy = n5 - n6 + n7 - n8;
        const q = Math.sqrt(pxx * pxx + pyy * pyy + 2 * pxy * pxy);
        const tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + (SQ * q) * inv));
        const om = 1 / tau;

        g[idx] = f0 - om * (f0 - e0);
        g[n + idx] = f1 - om * (n1);
        g[2 * n + idx] = f2 - om * (n2);
        g[3 * n + idx] = f3 - om * (n3);
        g[4 * n + idx] = f4 - om * (n4);
        g[5 * n + idx] = f5 - om * (n5);
        g[6 * n + idx] = f6 - om * (n6);
        g[7 * n + idx] = f7 - om * (n7);
        g[8 * n + idx] = f8 - om * (n8);

        if (accumulate) {
          this.sumUx[idx] += vx;
          this.sumUy[idx] += vy;
        }
      }
    }
    if (accumulate) this.samples++;

    this.applyBoundaries(g);
    this.f = g;
    this.g = f;
    this.steps++;
  }

  private applyBoundaries(post: Float32Array) {
    const { nx, ny, n } = this;
    const feq = this.equilibrium(1, this.uxInf, this.uyInf);
    const setEq = (idx: number) => {
      for (let i = 0; i < 9; i++) post[i * n + idx] = feq[i];
    };
    // Arêtes « libres » (aval et côtés) : pression fixée (ρ = 1) avec la vitesse de la cellule voisine.
    // Contrairement à une simple copie, cela laisse l'écoulement dévier latéralement autour du quartier
    // au lieu d'imposer un débit constant qui l'accélérerait artificiellement.
    const copy = (idx: number, from: number) => {
      let vx = this.ux[from];
      let vy = this.uy[from];
      // Limite la vitesse pour éviter toute instabilité (nombre de Mach)
      const sp = Math.hypot(vx, vy);
      const cap = 2 * this.U;
      if (sp > cap) {
        vx *= cap / sp;
        vy *= cap / sp;
      }
      const e = this.equilibrium(1, vx, vy);
      for (let i = 0; i < 9; i++) post[i * n + idx] = e[i];
      this.ux[idx] = vx;
      this.uy[idx] = vy;
    };
    for (let x = 0; x < nx; x++) {
      // Arête sud (y = 0) et nord (y = ny - 1)
      const south = x;
      const north = (ny - 1) * nx + x;
      const xi = Math.min(nx - 2, Math.max(1, x));
      if (this.inB || (x === 0 && this.inL) || (x === nx - 1 && this.inR)) setEq(south);
      else copy(south, nx + xi);
      if (this.inT || (x === 0 && this.inL) || (x === nx - 1 && this.inR)) setEq(north);
      else copy(north, (ny - 2) * nx + xi);
    }
    for (let y = 1; y < ny - 1; y++) {
      const west = y * nx;
      const east = y * nx + nx - 1;
      if (this.inL) setEq(west);
      else copy(west, west + 1);
      if (this.inR) setEq(east);
      else copy(east, east - 1);
    }
  }

  /**
   * Champ de vitesse moyen normalisé par U∞ (composantes est / nord), ou instantané
   * tant qu'aucune moyenne n'a été accumulée. Les cellules solides valent 0.
   */
  getVelocityRatio(): { u: Float32Array; v: Float32Array; averaged: boolean } {
    const u = new Float32Array(this.n);
    const v = new Float32Array(this.n);
    const useAvg = this.samples > 0;
    const k = useAvg ? 1 / (this.samples * this.U) : 1 / this.U;
    for (let i = 0; i < this.n; i++) {
      if (this.solid[i] === 1) continue;
      u[i] = (useAvg ? this.sumUx[i] : this.ux[i]) * k;
      v[i] = (useAvg ? this.sumUy[i] : this.uy[i]) * k;
    }
    return { u, v, averaged: useAvg };
  }

  /** Vrai si le champ contient des valeurs non finies (instabilité numérique). */
  isDiverged(): boolean {
    let bad = 0;
    for (let i = 0; i < this.n; i += 7) {
      const v = this.ux[i];
      if (!Number.isFinite(v) || Math.abs(v) > 0.5) bad++;
    }
    return bad > 0;
  }
}

// ---------------------------------------------------------------------------
// Rasterisation des bâtiments sur la grille
// ---------------------------------------------------------------------------

export interface PolygonMeters {
  /** Hauteur du bâtiment (m), si connue */
  height?: number;
  /** Altitude du dessous du volume (m) : > 0 pour une partie surélevée (passage, porte-à-faux) */
  base?: number;
  /** Anneaux (extérieur puis trous) : suites x0,y0,x1,y1... en mètres (est, nord) relatifs au centre du domaine */
  rings: Float32Array[];
}

/** Remplit `solid` (1 = obstacle) pour des polygones donnés en mètres relatifs au centre du domaine. */
export function rasterizePolygons(
  polygons: PolygonMeters[],
  nx: number,
  ny: number,
  dx: number,
  solid: Uint8Array
): void {
  const halfW = (nx * dx) / 2;
  const halfH = (ny * dx) / 2;
  const hits: number[] = [];
  for (const poly of polygons) {
    // Boîte englobante en indices de lignes
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ring of poly.rings) {
      for (let k = 1; k < ring.length; k += 2) {
        minY = Math.min(minY, ring[k]);
        maxY = Math.max(maxY, ring[k]);
      }
    }
    const j0 = Math.max(0, Math.floor((minY + halfH) / dx));
    const j1 = Math.min(ny - 1, Math.ceil((maxY + halfH) / dx));
    for (let j = j0; j <= j1; j++) {
      const yc = (j + 0.5) * dx - halfH; // centre de la ligne, en mètres
      hits.length = 0;
      for (const ring of poly.rings) {
        const m = ring.length / 2;
        for (let a = 0; a < m; a++) {
          const b = (a + 1) % m;
          const y1 = ring[a * 2 + 1];
          const y2 = ring[b * 2 + 1];
          if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
            const t = (yc - y1) / (y2 - y1);
            hits.push(ring[a * 2] + t * (ring[b * 2] - ring[a * 2]));
          }
        }
      }
      hits.sort((p, q) => p - q);
      for (let h = 0; h + 1 < hits.length; h += 2) {
        const i0 = Math.max(0, Math.ceil((hits[h] + halfW) / dx - 0.5));
        const i1 = Math.min(nx - 1, Math.floor((hits[h + 1] + halfW) / dx - 0.5));
        for (let i = i0; i <= i1; i++) solid[j * nx + i] = 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Statistiques sur le champ de vitesse
// ---------------------------------------------------------------------------

export interface WindStats {
  /** Rapport de vitesse maximal dans le secteur (cellules fluides, hors bordure) */
  maxRatio: number;
  meanRatio: number;
  /** Parts de la surface fluide du disque d'étude, par classe de rapport de vitesse */
  calmFraction: number; // < 0.5
  normalFraction: number; // 0.5 – 1.2
  acceleratedFraction: number; // 1.2 – 1.5
  strongFraction: number; // > 1.5 (effets de coin, canalisation)
  /** Part du disque occupée par les bâtiments (obstacles) */
  builtFraction: number;
}

export function computeWindStats(
  u: Float32Array,
  v: Float32Array,
  solid: Uint8Array,
  nx: number,
  ny: number,
  dx: number,
  radiusM: number
): WindStats {
  let fluid = 0;
  let built = 0;
  let sum = 0;
  let max = 0;
  let calm = 0;
  let normal = 0;
  let accel = 0;
  let strong = 0;
  const cx = nx / 2;
  const cy = ny / 2;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const dxm = (i + 0.5 - cx) * dx;
      const dym = (j + 0.5 - cy) * dx;
      if (dxm * dxm + dym * dym > radiusM * radiusM) continue;
      const idx = j * nx + i;
      if (solid[idx] === 1) {
        built++;
        continue;
      }
      const s = Math.hypot(u[idx], v[idx]);
      fluid++;
      sum += s;
      if (s > max) max = s;
      if (s < 0.5) calm++;
      else if (s < 1.2) normal++;
      else if (s < 1.5) accel++;
      else strong++;
    }
  }
  const total = fluid + built || 1;
  const f = fluid || 1;
  return {
    maxRatio: max,
    meanRatio: sum / f,
    calmFraction: calm / f,
    normalFraction: normal / f,
    acceleratedFraction: accel / f,
    strongFraction: strong / f,
    builtFraction: built / total,
  };
}
