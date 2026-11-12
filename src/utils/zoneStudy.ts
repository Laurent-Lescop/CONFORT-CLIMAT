/**
 * Préparation de l'exploitation d'un fichier EPW sur la zone étudiée :
 *  - position du soleil pour chacune des heures du fichier, calculée au centre de la zone ;
 *  - points de rayonnement à superposer au sunpath ;
 *  - exports (JSON d'étude, CSV horaire, GeoJSON de la végétation) pour Rhino / Grasshopper / Ladybug, etc.
 */

import { EpwData, EpwSummary, EPW_COLUMNS, EpwSeriesKey } from './epw';
import { LngLat, haversineM } from './geoUtils';
import { domeXYZ, projectSky, solarPosition, utcFromStandardTime } from './sunPosition';
import { GlScene, GlSceneBuilder, hexToRgba } from './glScene';
import type { VegetationData } from '../services/vegetationService';

export interface ZoneDefinition {
  center: LngLat; // [lng, lat]
  radiusM: number;
}

/** Instant UTC du milieu de l'heure EPW `i` (l'heure EPW 1..24 désigne la fin de l'heure). */
function epwInstant(epw: EpwData, i: number): Date {
  const hourMid = epw.hour[i] - 0.5; // milieu de l'heure en heure légale standard
  return utcFromStandardTime(epw.year[i] || 2023, epw.month[i], epw.day[i], hourMid, epw.location.timezone);
}

export interface HourlySun {
  azimuth: Float32Array;
  elevation: Float32Array;
}

/** Azimut / élévation du soleil pour chaque ligne du fichier EPW, au centre de la zone. */
export function computeHourlySun(epw: EpwData, zone: ZoneDefinition): HourlySun {
  const n = epw.rows;
  const azimuth = new Float32Array(n);
  const elevation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = solarPosition(epwInstant(epw, i), zone.center[1], zone.center[0]);
    azimuth[i] = s.azimuth;
    elevation[i] = s.elevation;
  }
  return { azimuth, elevation };
}

export type RadiationMetric = 'ghi' | 'dni' | 'dhi';

/**
 * Points du sunpath colorés par le rayonnement EPW : un point par heure ensoleillée de l'année,
 * placé à la position du soleil (projection stéréographique centrée sur la zone).
 */
export function buildRadiationPoints(
  epw: EpwData,
  zone: ZoneDefinition,
  sun: HourlySun,
  metric: RadiationMetric
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const values = epw.series[metric];
  for (let i = 0; i < epw.rows; i++) {
    const v = values[i];
    if (sun.elevation[i] <= 0 || Number.isNaN(v) || v <= 0) continue;
    features.push({
      type: 'Feature',
      properties: { value: Math.round(v), month: epw.month[i], hour: epw.hour[i] },
      geometry: { type: 'Point', coordinates: projectSky(zone.center, zone.radiusM, sun.azimuth[i], sun.elevation[i]) },
    });
  }
  return { type: 'FeatureCollection', features };
}

const RADIATION_STOPS: [number, [number, number, number]][] = [
  [0, [0x4f, 0x46, 0xe5]],
  [150, [0x2d, 0xd4, 0xbf]],
  [400, [0xfd, 0xe0, 0x47]],
  [700, [0xf9, 0x73, 0x16]],
  [950, [0xef, 0x44, 0x44]],
];

/** Couleur (hex) d'un rayonnement horaire en Wh/m², même échelle que le calque 2D. */
export function radiationColor(value: number): string {
  const v = Math.max(0, value);
  let i = 0;
  while (i < RADIATION_STOPS.length - 2 && v > RADIATION_STOPS[i + 1][0]) i++;
  const [v0, c0] = RADIATION_STOPS[i];
  const [v1, c1] = RADIATION_STOPS[i + 1];
  const t = Math.min(1, Math.max(0, (v - v0) / (v1 - v0)));
  const ch = (k: number) => Math.round(c0[k] + (c1[k] - c0[k]) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/**
 * Points de rayonnement du sunpath 3D : un disque par heure ensoleillée, posé sur le dôme à la
 * position du soleil et coloré par le rayonnement EPW.
 */
export function buildRadiationDotsScene(
  epw: EpwData,
  zone: ZoneDefinition,
  sun: HourlySun,
  metric: RadiationMetric
): GlScene {
  const b = new GlSceneBuilder(zone.center);
  const values = epw.series[metric];
  for (let i = 0; i < epw.rows; i++) {
    const v = values[i];
    if (sun.elevation[i] <= 0 || Number.isNaN(v) || v <= 0) continue;
    b.point(domeXYZ(zone.radiusM, sun.azimuth[i], sun.elevation[i]), hexToRgba(radiationColor(v), 0.9), 4.5);
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const CSV_SERIES: EpwSeriesKey[] = ['dryBulb', 'dewPoint', 'relHumidity', 'pressure', 'ghi', 'dni', 'dhi', 'windDir', 'windSpeed', 'totalSkyCover', 'precipitation'];

const fmt = (v: number, digits = 2) => (Number.isNaN(v) ? '' : v.toFixed(digits));

/** CSV horaire : une ligne par heure EPW, avec la position du soleil calculée sur la zone. */
export function buildHourlyCsv(epw: EpwData, sun: HourlySun): string {
  const header = [
    'index', 'annee', 'mois', 'jour', 'heure_epw',
    ...CSV_SERIES.map((k) => `${k} [${EPW_COLUMNS[k].unit}]`),
    'azimut_soleil [deg]', 'elevation_soleil [deg]',
  ];
  const lines = [header.join(';')];
  for (let i = 0; i < epw.rows; i++) {
    lines.push(
      [
        i,
        epw.year[i],
        epw.month[i],
        epw.day[i],
        epw.hour[i],
        ...CSV_SERIES.map((k) => fmt(epw.series[k][i], k === 'pressure' ? 0 : 1)),
        fmt(sun.azimuth[i], 2),
        fmt(sun.elevation[i], 2),
      ].join(';')
    );
  }
  return lines.join('\n');
}

export interface ZoneStudyExport {
  schema: 'atlas-3d-ile-de-nantes/zone-study@1';
  generatedAt: string;
  zone: {
    center: { lat: number; lng: number };
    radiusM: number;
    areaM2: number;
    timeConventions: string;
  };
  epw: {
    fileName: string;
    location: EpwData['location'];
    distanceStationToZoneKm: number;
    rows: number;
    summary: Omit<EpwSummary, 'monthly' | 'windRose'> & { monthly: EpwSummary['monthly']; windRose: EpwSummary['windRose'] };
  } | null;
  buildingsInSector: number;
  vegetation: VegetationData['stats'] | null;
  notes: string[];
}

export function buildZoneStudy(args: {
  zone: ZoneDefinition;
  epw: EpwData | null;
  summary: EpwSummary | null;
  buildingsInSector: number;
  vegetation: VegetationData | null;
}): ZoneStudyExport {
  const { zone, epw, summary, buildingsInSector, vegetation } = args;
  const notes = [
    "Heures EPW : 1 à 24, fin d'heure, heure légale standard (UTC+fuseau du fichier), sans heure d'été.",
    "Position du soleil calculée au milieu de chaque heure, au centre de la zone d'étude.",
    "Azimut compté depuis le nord dans le sens horaire (90 = est, 180 = sud).",
    'Végétation et bâti : © contributeurs OpenStreetMap (ODbL).',
  ];
  const distanceKm = epw ? haversineM(zone.center, [epw.location.longitude, epw.location.latitude]) / 1000 : 0;
  if (epw && distanceKm > 50) {
    notes.push(`Attention : la station météo du fichier EPW est à ${distanceKm.toFixed(0)} km de la zone étudiée.`);
  }
  return {
    schema: 'atlas-3d-ile-de-nantes/zone-study@1',
    generatedAt: new Date().toISOString(),
    zone: {
      center: { lat: zone.center[1], lng: zone.center[0] },
      radiusM: zone.radiusM,
      areaM2: Math.PI * zone.radiusM * zone.radiusM,
      timeConventions: 'UTC' + (epw ? (epw.location.timezone >= 0 ? '+' : '') + epw.location.timezone : '+1') + ' standard time',
    },
    epw:
      epw && summary
        ? {
            fileName: epw.fileName,
            location: epw.location,
            distanceStationToZoneKm: Math.round(distanceKm * 10) / 10,
            rows: epw.rows,
            summary,
          }
        : null,
    buildingsInSector,
    vegetation: vegetation?.stats ?? null,
    notes,
  };
}

export function downloadTextFile(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// Heure d'étude : données météo et soleil d'une ligne du fichier EPW
// ---------------------------------------------------------------------------

export interface EpwHourInfo {
  row: number;
  month: number;
  day: number;
  /** Heure EPW 1..24 (fin d'heure) */
  epwHour: number;
  taC: number;
  rhPercent: number;
  /** Vent à 10 m (m/s) et direction d'où il vient (°) */
  wind10: number;
  windDirFrom: number | null;
  ghi: number;
  dni: number;
  dhi: number;
  /** Rayonnement infrarouge horizontal du ciel (W/m²), estimé si absent du fichier */
  lwSky: number;
  lwSkyEstimated: boolean;
  /** Soleil au milieu de l'heure, au centre de la zone */
  sunAzimuth: number;
  sunElevation: number;
}

/**
 * Rugosité du terrain autour du site. Le vent des fichiers EPW est mesuré à 10 m sur un aérodrome
 * (terrain dégagé) ; en ville, le vent qui arrive sur le quartier à 10 m est nettement plus faible.
 * Profils en loi puissance de l'ASHRAE (Fundamentals, chap. 24), comme Ladybug Tools.
 */
export type WindTerrain = 'open' | 'suburban' | 'city';

export const WIND_TERRAINS: Record<WindTerrain, { label: string; exponent: number; boundaryLayerM: number }> = {
  open: { label: 'Dégagé', exponent: 0.14, boundaryLayerM: 270 },
  suburban: { label: 'Périurbain', exponent: 0.22, boundaryLayerM: 370 },
  city: { label: 'Ville dense', exponent: 0.33, boundaryLayerM: 460 },
};

/** Rapport vent à 10 m sur le site / vent à 10 m de la station (terrain dégagé). */
export function stationToSiteWindFactor(terrain: WindTerrain): number {
  const met = WIND_TERRAINS.open;
  const site = WIND_TERRAINS[terrain];
  return Math.pow(met.boundaryLayerM / 10, met.exponent) * Math.pow(10 / site.boundaryLayerM, site.exponent);
}

/** Ligne EPW d'une date (mois, jour) et d'une heure EPW (1..24) ; −1 si absente. */
export function findEpwRow(epw: EpwData, month: number, day: number, epwHour: number): number {
  for (let i = 0; i < epw.rows; i++) {
    if (epw.month[i] === month && epw.day[i] === day && epw.hour[i] === epwHour) return i;
  }
  return -1;
}

/** Ligne de l'heure la plus chaude de l'année (température sèche maximale). */
export function hottestEpwRow(epw: EpwData): number {
  let best = -1;
  let max = -Infinity;
  const t = epw.series.dryBulb;
  for (let i = 0; i < epw.rows; i++) {
    if (!Number.isNaN(t[i]) && t[i] > max) {
      max = t[i];
      best = i;
    }
  }
  return best;
}

export function epwHourInfo(epw: EpwData, row: number, center: LngLat): EpwHourInfo {
  const s = epw.series;
  const taC = s.dryBulb[row];
  const sun = solarPosition(epwInstant(epw, row), center[1], center[0]);
  let lw = s.horizIR[row];
  let estimated = false;
  if (Number.isNaN(lw)) {
    // Estimation comme EnergyPlus : émissivité du ciel clair de Clark & Allen, corrigée par la
    // nébulosité opaque N (dixièmes) du fichier
    const tdp = Number.isNaN(s.dewPoint[row]) ? taC - 8 : s.dewPoint[row];
    const nOpaque = Number.isNaN(s.opaqueSkyCover[row]) ? 5 : Math.min(10, Math.max(0, s.opaqueSkyCover[row]));
    const epsClear = 0.787 + 0.764 * Math.log((tdp + 273.15) / 273.15);
    const eps = epsClear * (1 + 0.0224 * nOpaque - 0.0035 * nOpaque ** 2 + 0.00028 * nOpaque ** 3);
    lw = Math.min(1, Math.max(0.5, eps)) * 5.670374419e-8 * Math.pow(taC + 273.15, 4);
    estimated = true;
  }
  const dir = s.windDir[row];
  return {
    row,
    month: epw.month[row],
    day: epw.day[row],
    epwHour: epw.hour[row],
    taC,
    rhPercent: Number.isNaN(s.relHumidity[row]) ? 50 : s.relHumidity[row],
    wind10: Number.isNaN(s.windSpeed[row]) ? 0 : s.windSpeed[row],
    windDirFrom: Number.isNaN(dir) ? null : dir,
    ghi: Number.isNaN(s.ghi[row]) ? 0 : s.ghi[row],
    dni: Number.isNaN(s.dni[row]) ? 0 : s.dni[row],
    dhi: Number.isNaN(s.dhi[row]) ? 0 : s.dhi[row],
    lwSky: lw,
    lwSkyEstimated: estimated,
    sunAzimuth: sun.azimuth,
    sunElevation: sun.elevation,
  };
}
