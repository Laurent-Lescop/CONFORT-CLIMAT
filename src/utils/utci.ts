/**
 * UTCI (Universal Thermal Climate Index) par approximation polynomiale officielle.
 *
 * Entrées : température de l'air Ta (°C), température radiante moyenne Tmrt (°C),
 * vitesse du vent à 10 m v (m/s), humidité relative HR (%).
 * Domaine de validité : Ta ∈ [−50, 50] °C, Tmrt − Ta ∈ [−30, 70] K, v ∈ [0,5 ; 17] m/s.
 */

import { UTCI_TERMS } from './utciCoefficients';

export const UTCI_MIN_WIND = 0.5;
export const UTCI_MAX_WIND = 17;

/** Pression de vapeur saturante (hPa), formule spécifique à l'UTCI. */
export function saturatedVaporPressureHpa(tempC: number): number {
  const g = [-2836.5744, -6028.076559, 19.54263612, -0.02737830188, 0.000016261698, 7.0229056e-10, -1.8680009e-13];
  const tk = tempC + 273.15;
  let es = 2.7150305 * Math.log(tk);
  for (let i = 0; i < g.length; i++) es += g[i] * Math.pow(tk, i - 2);
  return Math.exp(es) * 0.01;
}

export interface UtciEvaluator {
  /** UTCI (°C) pour une vitesse de vent à 10 m et une température radiante moyenne */
  (windMs: number, tmrtC: number): number;
}

/**
 * Prépare l'évaluation pour une température d'air et une humidité données (fixes sur toute la zone) :
 * les termes en Ta et Pa sont regroupés une fois pour toutes, il ne reste qu'un polynôme en (v, ΔTr).
 */
export function makeUtciEvaluator(taC: number, rhPercent: number): UtciEvaluator {
  const pa = (saturatedVaporPressureHpa(taC) * (rhPercent / 100)) / 10; // kPa
  // Coefficient regroupé par exposants (v, ΔTr)
  const grouped = new Map<number, number>();
  for (const [c, ea, ev, ed, ep] of UTCI_TERMS) {
    const key = ev * 8 + ed;
    grouped.set(key, (grouped.get(key) ?? 0) + c * Math.pow(taC, ea) * Math.pow(pa, ep));
  }
  const terms = [...grouped.entries()].map(([key, c]) => ({ c, ev: Math.floor(key / 8), ed: key % 8 }));
  const n = terms.length;
  const coef = new Float64Array(n);
  const ev = new Uint8Array(n);
  const ed = new Uint8Array(n);
  terms.forEach((t, i) => {
    coef[i] = t.c;
    ev[i] = t.ev;
    ed[i] = t.ed;
  });
  const vp = new Float64Array(7);
  const dp = new Float64Array(7);

  return (windMs: number, tmrtC: number) => {
    const v = Math.min(UTCI_MAX_WIND, Math.max(UTCI_MIN_WIND, windMs));
    const d = Math.min(70, Math.max(-30, tmrtC - taC));
    vp[0] = 1;
    dp[0] = 1;
    for (let k = 1; k < 7; k++) {
      vp[k] = vp[k - 1] * v;
      dp[k] = dp[k - 1] * d;
    }
    let s = taC;
    for (let i = 0; i < n; i++) s += coef[i] * vp[ev[i]] * dp[ed[i]];
    return s;
  };
}

/** UTCI direct (une seule valeur). */
export function utci(taC: number, tmrtC: number, windMs: number, rhPercent: number): number {
  return makeUtciEvaluator(taC, rhPercent)(windMs, tmrtC);
}

// ---------------------------------------------------------------------------
// Catégories de stress thermique
// ---------------------------------------------------------------------------

export interface UtciCategory {
  id: number;
  label: string;
  /** Borne inférieure (°C, incluse) */
  min: number;
  color: [number, number, number];
}

/** Échelle officielle du stress thermique UTCI (du plus froid au plus chaud). */
export const UTCI_CATEGORIES: UtciCategory[] = [
  { id: 0, label: 'Froid extrême', min: -Infinity, color: [38, 24, 140] },
  { id: 1, label: 'Froid très fort', min: -40, color: [49, 54, 175] },
  { id: 2, label: 'Froid fort', min: -27, color: [69, 117, 180] },
  { id: 3, label: 'Froid modéré', min: -13, color: [116, 173, 209] },
  { id: 4, label: 'Froid léger', min: 0, color: [171, 217, 233] },
  { id: 5, label: 'Pas de stress thermique', min: 9, color: [120, 198, 121] },
  { id: 6, label: 'Chaleur modérée', min: 26, color: [254, 224, 139] },
  { id: 7, label: 'Chaleur forte', min: 32, color: [253, 141, 60] },
  { id: 8, label: 'Chaleur très forte', min: 38, color: [215, 48, 39] },
  { id: 9, label: 'Chaleur extrême', min: 46, color: [127, 0, 38] },
];

export function utciCategoryId(utciC: number): number {
  let id = 0;
  for (let i = 0; i < UTCI_CATEGORIES.length; i++) if (utciC >= UTCI_CATEGORIES[i].min) id = i;
  return id;
}

/**
 * Couleur continue (interpolée entre les centres de catégories) : évite les aplats en escalier
 * et laisse voir les gradients entre ombre et soleil.
 */
export function utciColor(utciC: number): [number, number, number] {
  const cats = UTCI_CATEGORIES;
  // Centres des catégories (les catégories extrêmes sont bornées)
  const centers = [-45, -33.5, -20, -6.5, 4.5, 17.5, 29, 35, 42, 50];
  if (utciC <= centers[0]) return cats[0].color;
  if (utciC >= centers[centers.length - 1]) return cats[cats.length - 1].color;
  let i = 0;
  while (i < centers.length - 2 && utciC > centers[i + 1]) i++;
  const t = (utciC - centers[i]) / (centers[i + 1] - centers[i]);
  const a = cats[i].color;
  const b = cats[i + 1].color;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
