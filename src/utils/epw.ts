/**
 * Lecture d'un fichier météo EnergyPlus Weather (.epw) et statistiques de base.
 *
 * Format : 8 lignes d'en-tête (LOCATION, DESIGN CONDITIONS, TYPICAL/EXTREME PERIODS,
 * GROUND TEMPERATURES, HOLIDAYS/DAYLIGHT SAVINGS, COMMENTS 1, COMMENTS 2, DATA PERIODS)
 * puis une ligne par heure (35 colonnes). L'heure EPW va de 1 à 24 et désigne la
 * fin de l'heure (heure légale standard, sans heure d'été).
 */

export interface EpwLocation {
  city: string;
  state: string;
  country: string;
  source: string;
  wmo: string;
  latitude: number;
  longitude: number;
  timezone: number; // décalage UTC en heures
  elevation: number; // m
}

/** Colonnes exploitées (indice 0-based dans la ligne de données EPW) et valeur « manquante ». */
export const EPW_COLUMNS = {
  dryBulb: { index: 6, missing: 99.9, label: 'Température sèche', unit: '°C' },
  dewPoint: { index: 7, missing: 99.9, label: 'Température de rosée', unit: '°C' },
  relHumidity: { index: 8, missing: 999, label: 'Humidité relative', unit: '%' },
  pressure: { index: 9, missing: 999999, label: 'Pression atmosphérique', unit: 'Pa' },
  horizIR: { index: 12, missing: 9999, label: 'Rayonnement IR ciel', unit: 'Wh/m²' },
  ghi: { index: 13, missing: 9999, label: 'Rayonnement global horizontal', unit: 'Wh/m²' },
  dni: { index: 14, missing: 9999, label: 'Rayonnement direct normal', unit: 'Wh/m²' },
  dhi: { index: 15, missing: 9999, label: 'Rayonnement diffus horizontal', unit: 'Wh/m²' },
  windDir: { index: 20, missing: 999, label: 'Direction du vent', unit: '°' },
  windSpeed: { index: 21, missing: 999, label: 'Vitesse du vent', unit: 'm/s' },
  totalSkyCover: { index: 22, missing: 99, label: 'Nébulosité totale', unit: 'dixièmes' },
  opaqueSkyCover: { index: 23, missing: 99, label: 'Nébulosité opaque', unit: 'dixièmes' },
  precipitation: { index: 33, missing: 999, label: 'Précipitations', unit: 'mm' },
} as const;

export type EpwSeriesKey = keyof typeof EPW_COLUMNS;

export interface EpwData {
  fileName: string;
  location: EpwLocation;
  comments: string[];
  rows: number;
  year: Int16Array;
  month: Uint8Array;
  day: Uint8Array;
  hour: Uint8Array; // 1..24
  series: Record<EpwSeriesKey, Float32Array>;
}

export class EpwParseError extends Error {}

const DATA_COLUMN_COUNT = 35;

function num(v: string | undefined, fallback = NaN): number {
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function parseEpw(text: string, fileName = 'meteo.epw'): EpwData {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines.length < 9 || !/^LOCATION/i.test(lines[0].trim())) {
    throw new EpwParseError("Ce fichier ne ressemble pas à un EPW : la première ligne devrait commencer par « LOCATION ».");
  }

  const loc = lines[0].split(',').map((s) => s.trim());
  const location: EpwLocation = {
    city: loc[1] || 'Lieu inconnu',
    state: loc[2] || '',
    country: loc[3] || '',
    source: loc[4] || '',
    wmo: loc[5] || '',
    latitude: num(loc[6]),
    longitude: num(loc[7]),
    timezone: num(loc[8], 0),
    elevation: num(loc[9], 0),
  };
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new EpwParseError('Coordonnées GPS illisibles dans la ligne LOCATION du fichier EPW.');
  }

  const comments = lines
    .slice(1, 8)
    .filter((l) => /^COMMENTS/i.test(l))
    .map((l) => l.replace(/^COMMENTS \d+,?/i, '').trim())
    .filter(Boolean);

  // Lignes de données : on repère les 8 lignes d'en-tête puis tout ce qui a >= 34 colonnes
  const dataLines = lines.slice(8).filter((l) => l.trim().length > 0);
  const n = dataLines.length;
  if (n < 24) throw new EpwParseError('Le fichier EPW ne contient pas assez de lignes de données horaires.');

  const year = new Int16Array(n);
  const month = new Uint8Array(n);
  const day = new Uint8Array(n);
  const hour = new Uint8Array(n);
  const series = {} as Record<EpwSeriesKey, Float32Array>;
  (Object.keys(EPW_COLUMNS) as EpwSeriesKey[]).forEach((k) => {
    series[k] = new Float32Array(n).fill(NaN);
  });

  let valid = 0;
  for (let i = 0; i < n; i++) {
    const cols = dataLines[i].split(',');
    if (cols.length < DATA_COLUMN_COUNT - 1) continue;
    year[valid] = num(cols[0], 0);
    month[valid] = num(cols[1], 0);
    day[valid] = num(cols[2], 0);
    hour[valid] = num(cols[3], 0);
    (Object.keys(EPW_COLUMNS) as EpwSeriesKey[]).forEach((k) => {
      const spec = EPW_COLUMNS[k];
      const v = num(cols[spec.index]);
      series[k][valid] = Number.isFinite(v) && v < spec.missing ? v : NaN;
    });
    valid++;
  }
  if (valid < 24) throw new EpwParseError('Aucune ligne de données météo valide dans le fichier EPW.');

  const trim = <T extends Int16Array | Uint8Array | Float32Array>(a: T): T => a.slice(0, valid) as T;
  (Object.keys(series) as EpwSeriesKey[]).forEach((k) => {
    series[k] = trim(series[k]);
  });

  return {
    fileName,
    location,
    comments,
    rows: valid,
    year: trim(year),
    month: trim(month),
    day: trim(day),
    hour: trim(hour),
    series,
  };
}

// ---------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------

export interface MonthlyStat {
  month: number; // 1..12
  tMean: number;
  tMin: number;
  tMax: number;
  ghiKwh: number; // kWh/m² sur le mois
  dniKwh: number;
  dhiKwh: number;
  windMean: number;
  rhMean: number;
}

export interface WindRose {
  /** Fréquence (0..1) par secteur de 22.5° centré sur N, NNE, ... */
  sectors: number[];
  /** Vitesse moyenne (m/s) par secteur */
  meanSpeed: number[];
  calmFraction: number;
  prevailingLabel: string;
}

export interface EpwSummary {
  hours: number;
  tMean: number;
  tMin: number;
  tMax: number;
  rhMean: number;
  windMean: number;
  windMax: number;
  ghiKwh: number; // kWh/m²/an
  dniKwh: number;
  dhiKwh: number;
  precipitationMm: number;
  heatingDegreeDays: number; // base 18 °C
  coolingDegreeDays: number; // base 24 °C
  hoursAbove30: number;
  hoursBelow0: number;
  monthly: MonthlyStat[];
  windRose: WindRose;
}

export const WIND_LABELS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
];

function finite(a: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i])) out.push(a[i]);
  return out;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

export function summarizeEpw(epw: EpwData): EpwSummary {
  const { series, month, rows } = epw;
  const T = series.dryBulb;

  const monthly: MonthlyStat[] = [];
  for (let m = 1; m <= 12; m++) {
    const t: number[] = [];
    const w: number[] = [];
    const rh: number[] = [];
    let ghi = 0;
    let dni = 0;
    let dhi = 0;
    for (let i = 0; i < rows; i++) {
      if (month[i] !== m) continue;
      if (!Number.isNaN(T[i])) t.push(T[i]);
      if (!Number.isNaN(series.windSpeed[i])) w.push(series.windSpeed[i]);
      if (!Number.isNaN(series.relHumidity[i])) rh.push(series.relHumidity[i]);
      if (!Number.isNaN(series.ghi[i])) ghi += series.ghi[i];
      if (!Number.isNaN(series.dni[i])) dni += series.dni[i];
      if (!Number.isNaN(series.dhi[i])) dhi += series.dhi[i];
    }
    monthly.push({
      month: m,
      tMean: mean(t),
      tMin: t.length ? Math.min(...t) : NaN,
      tMax: t.length ? Math.max(...t) : NaN,
      ghiKwh: ghi / 1000,
      dniKwh: dni / 1000,
      dhiKwh: dhi / 1000,
      windMean: mean(w),
      rhMean: mean(rh),
    });
  }

  const allT = finite(T);
  let hdh = 0;
  let cdh = 0;
  let above30 = 0;
  let below0 = 0;
  for (const t of allT) {
    if (t < 18) hdh += 18 - t;
    if (t > 24) cdh += t - 24;
    if (t > 30) above30++;
    if (t < 0) below0++;
  }

  const sum = (a: Float32Array) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i])) s += a[i];
    return s;
  };

  const wind = finite(series.windSpeed);

  // Rose des vents (calmes : vitesse < 0.5 m/s)
  const counts = new Array(16).fill(0);
  const speeds = new Array(16).fill(0);
  let calm = 0;
  let withDir = 0;
  for (let i = 0; i < rows; i++) {
    const d = series.windDir[i];
    const s = series.windSpeed[i];
    if (Number.isNaN(d) || Number.isNaN(s)) continue;
    withDir++;
    if (s < 0.5) {
      calm++;
      continue;
    }
    const idx = Math.round((((d % 360) + 360) % 360) / 22.5) % 16;
    counts[idx]++;
    speeds[idx] += s;
  }
  const sectors = counts.map((c) => (withDir ? c / withDir : 0));
  const meanSpeed = counts.map((c, i) => (c ? speeds[i] / c : 0));
  const maxIdx = sectors.indexOf(Math.max(...sectors));

  return {
    hours: rows,
    tMean: mean(allT),
    tMin: allT.length ? Math.min(...allT) : NaN,
    tMax: allT.length ? Math.max(...allT) : NaN,
    rhMean: mean(finite(series.relHumidity)),
    windMean: mean(wind),
    windMax: wind.length ? Math.max(...wind) : NaN,
    ghiKwh: sum(series.ghi) / 1000,
    dniKwh: sum(series.dni) / 1000,
    dhiKwh: sum(series.dhi) / 1000,
    precipitationMm: sum(series.precipitation),
    heatingDegreeDays: hdh / 24,
    coolingDegreeDays: cdh / 24,
    hoursAbove30: above30,
    hoursBelow0: below0,
    monthly,
    windRose: {
      sectors,
      meanSpeed,
      calmFraction: withDir ? calm / withDir : 0,
      prevailingLabel: WIND_LABELS[maxIdx] ?? '—',
    },
  };
}
