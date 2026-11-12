/**
 * Position du soleil (algorithme NOAA) et construction du diagramme solaire (sunpath).
 * Les angles sont en degrés ; l'azimut est compté depuis le nord, dans le sens horaire.
 */

import { LngLat, destinationPoint } from './geoUtils';
import { GlScene, GlSceneBuilder, RGBA, mixRgba } from './glScene';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunPosition {
  azimuth: number; // 0 = nord, 90 = est, 180 = sud, 270 = ouest
  elevation: number; // > 0 : soleil au-dessus de l'horizon
  declination: number;
  equationOfTime: number; // minutes
}

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Position du soleil pour un instant UTC, une latitude et une longitude (est positive). */
export function solarPosition(date: Date, latDeg: number, lonDeg: number): SunPosition {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525.0;

  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG;

  const y = Math.tan((obliq * RAD) / 2) ** 2;
  const L0r = L0 * RAD;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));

  const minutesUtc = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarTime = (((minutesUtc + eqTime + 4 * lonDeg) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarTime / 4 - 180;

  const latR = latDeg * RAD;
  const declR = decl * RAD;
  const haR = hourAngle * RAD;
  const sinEl = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) * DEG;

  // Azimut depuis le nord (sens horaire)
  const azimuth =
    ((Math.atan2(Math.sin(haR), Math.cos(haR) * Math.sin(latR) - Math.tan(declR) * Math.cos(latR)) * DEG + 180) %
      360 +
      360) %
    360;

  return { azimuth, elevation, declination: decl, equationOfTime: eqTime };
}

/**
 * Instant UTC correspondant à une heure légale « standard » (UTC+tz, sans heure d'été).
 * `hourDecimal` peut être fractionnaire (ex. 13.5 = 13 h 30).
 */
export function utcFromStandardTime(
  year: number,
  month: number, // 1-12
  day: number,
  hourDecimal: number,
  tzHours: number
): Date {
  const ms = Date.UTC(year, month - 1, day, 0, 0, 0) + (hourDecimal - tzHours) * 3600000;
  return new Date(ms);
}

export function dayOfYearToMonthDay(year: number, doy: number): { month: number; day: number } {
  const d = new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400000);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function dateToDayOfYear(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}

export function sunDirectionVector(sun: { azimuth: number; elevation: number }) {
  const az = sun.azimuth * RAD;
  const el = sun.elevation * RAD;
  // x = est, y = nord, z = haut
  return { x: Math.cos(el) * Math.sin(az), y: Math.cos(el) * Math.cos(az), z: Math.sin(el) };
}

// ---------------------------------------------------------------------------
// Sunpath : projection stéréographique sur le plan horizontal, centrée sur la zone
// ---------------------------------------------------------------------------

/** Distance au centre (0..1) d'un point de la voûte : 0 = zénith, 1 = horizon. */
export function stereographicRadius(elevationDeg: number): number {
  const zenith = (90 - elevationDeg) * RAD;
  return Math.tan(zenith / 2);
}

export function projectSky(center: LngLat, radiusM: number, azimuth: number, elevation: number): LngLat {
  return destinationPoint(center, azimuth, stereographicRadius(elevation) * radiusM);
}

export interface SunpathLabel {
  lngLat: LngLat;
  text: string;
  kind: 'cardinal' | 'hour' | 'month';
}

export interface SunpathGeometry {
  geojson: GeoJSON.FeatureCollection;
  labels: SunpathLabel[];
}

type Feature = GeoJSON.Feature;

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

/**
 * Construit le diagramme solaire annuel : courbes du 21 de chaque mois, analemmes horaires,
 * cercles d'élévation (0°, 30°, 60°) et repères cardinaux.
 */
export function buildSunpath(
  center: LngLat,
  radiusM: number,
  tzHours: number,
  year = 2023
): SunpathGeometry {
  const [lon, lat] = center;
  const features: Feature[] = [];
  const labels: SunpathLabel[] = [];

  // Cercles d'élévation
  for (const el of [0, 30, 60]) {
    const ring: LngLat[] = [];
    for (let az = 0; az <= 360; az += 5) ring.push(projectSky(center, radiusM, az, el));
    features.push({
      type: 'Feature',
      properties: { kind: el === 0 ? 'horizon' : 'altitude', elevation: el },
      geometry: { type: 'LineString', coordinates: ring },
    });
  }

  // Axes cardinaux (N, E, S, O)
  const cardinals: [string, number][] = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['O', 270],
  ];
  for (const [name, az] of cardinals) {
    features.push({
      type: 'Feature',
      properties: { kind: 'axis' },
      geometry: {
        type: 'LineString',
        coordinates: [center, destinationPoint(center, az, radiusM)],
      },
    });
    labels.push({ lngLat: destinationPoint(center, az, radiusM * 1.07), text: name, kind: 'cardinal' });
  }

  // Courbes journalières (le 21 de chaque mois)
  for (let month = 1; month <= 12; month++) {
    const coords: LngLat[] = [];
    let firstPoint: LngLat | null = null;
    let lastPoint: LngLat | null = null;
    for (let h = 0; h <= 24; h += 0.25) {
      const date = utcFromStandardTime(year, month, 21, h, tzHours);
      const sun = solarPosition(date, lat, lon);
      if (sun.elevation >= 0) {
        const p = projectSky(center, radiusM, sun.azimuth, sun.elevation);
        coords.push(p);
        if (!firstPoint) firstPoint = p;
        lastPoint = p;
      }
    }
    if (coords.length > 1) {
      const isSolstice = month === 6 || month === 12;
      features.push({
        type: 'Feature',
        properties: { kind: 'day', month, solstice: isSolstice, label: MONTH_LABELS[month - 1] },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
  }

  // Analemmes horaires (une courbe par heure, sur l'année)
  for (let hour = 4; hour <= 21; hour++) {
    const coords: LngLat[] = [];
    // Du 21 déc. au 21 juin puis retour : on échantillonne l'année tous les 6 jours
    for (let doy = 1; doy <= 366; doy += 6) {
      const { month, day } = dayOfYearToMonthDay(year, doy);
      const sun = solarPosition(utcFromStandardTime(year, month, day, hour, tzHours), lat, lon);
      if (sun.elevation >= 0) coords.push(projectSky(center, radiusM, sun.azimuth, sun.elevation));
    }
    if (coords.length > 2) {
      features.push({
        type: 'Feature',
        properties: { kind: 'hour', hour },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
  }

  // Étiquettes horaires placées sur les courbes des solstices
  for (const [month, tag] of [[6, 'été'], [12, 'hiver']] as const) {
    for (let hour = 5; hour <= 20; hour++) {
      const sun = solarPosition(utcFromStandardTime(year, month, 21, hour, tzHours), lat, lon);
      if (sun.elevation > 2 && (tag === 'été' || hour % 2 === 0)) {
        labels.push({
          lngLat: projectSky(center, radiusM, sun.azimuth, sun.elevation),
          text: `${hour}h`,
          kind: 'hour',
        });
      }
    }
  }

  return { geojson: { type: 'FeatureCollection', features }, labels };
}

/** Rayon et libellé de la direction du soleil pour le repère « soleil actuel ». */
export function sunMarkerFeatures(
  center: LngLat,
  radiusM: number,
  sun: { azimuth: number; elevation: number }
): GeoJSON.FeatureCollection {
  if (sun.elevation <= 0) return { type: 'FeatureCollection', features: [] };
  const p = projectSky(center, radiusM, sun.azimuth, sun.elevation);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'sun', azimuth: sun.azimuth, elevation: sun.elevation },
        geometry: { type: 'Point', coordinates: p },
      },
      {
        type: 'Feature',
        properties: { kind: 'sun-ray' },
        geometry: { type: 'LineString', coordinates: [center, p] },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sunpath 3D : dôme céleste (demi-sphère de rayon = rayon du secteur), lignes fines.
// Style proche de Grasshopper / Ladybug : courbes du 21 de chaque mois colorées selon la
// déclinaison, analemmes horaires, repères du dôme, soleil représenté par une sphère.
// ---------------------------------------------------------------------------

/** Point du dôme dans la direction (azimut, élévation), en mètres (est, nord, haut) depuis le centre. */
export function domeXYZ(radiusM: number, azimuth: number, elevation: number): [number, number, number] {
  const az = azimuth * RAD;
  const el = elevation * RAD;
  return [radiusM * Math.cos(el) * Math.sin(az), radiusM * Math.cos(el) * Math.cos(az), radiusM * Math.sin(el)];
}

const COLD: RGBA = [0.36, 0.64, 1.0, 0.95]; // 21 décembre
const MID: RGBA = [1.0, 0.86, 0.35, 0.95]; // équinoxes
const HOT: RGBA = [1.0, 0.45, 0.15, 0.95]; // 21 juin

function declinationColor(t: number): RGBA {
  return t < 0.5 ? mixRgba(COLD, MID, t * 2) : mixRgba(MID, HOT, (t - 0.5) * 2);
}

/**
 * Partie fixe du sunpath 3D (lignes fines et points horaires) : ne dépend que du centre, du rayon
 * et du fuseau, pas de la date ou de l'heure choisies.
 */
export function buildSunpathBaseScene(center: LngLat, radiusM: number, tzHours: number, year = 2023): GlScene {
  const [lon, lat] = center;
  const b = new GlSceneBuilder(center);

  // Repères du dôme
  const ring = (el: number): [number, number, number][] => {
    const pts: [number, number, number][] = [];
    for (let az = 0; az <= 360; az += 4) pts.push(domeXYZ(radiusM, az, el));
    return pts;
  };
  b.polyline(ring(0), [1, 1, 1, 0.9], 1.6);
  b.polyline(ring(30), [1, 1, 1, 0.28], 1);
  b.polyline(ring(60), [1, 1, 1, 0.28], 1);
  for (const az of [0, 90, 180, 270]) {
    const pts: [number, number, number][] = [];
    for (let el = 0; el <= 90; el += 3) pts.push(domeXYZ(radiusM, az, el));
    b.polyline(pts, [1, 1, 1, az === 0 ? 0.4 : 0.2], 1);
  }

  // Analemmes horaires (une courbe par heure, sur toute l'année)
  for (let hour = 4; hour <= 21; hour++) {
    const pts: [number, number, number][] = [];
    for (let doy = 1; doy <= 366; doy += 2) {
      const { month, day } = dayOfYearToMonthDay(year, doy);
      const sun = solarPosition(utcFromStandardTime(year, month, day, hour, tzHours), lat, lon);
      if (sun.elevation >= 0) pts.push(domeXYZ(radiusM, sun.azimuth, sun.elevation));
    }
    b.polyline(pts, [0.75, 0.88, 1, 0.5], 1);
  }

  // Courbes journalières (le 21 de chaque mois) colorées selon la déclinaison, points à chaque heure pleine
  for (let month = 1; month <= 12; month++) {
    const decl = solarPosition(utcFromStandardTime(year, month, 21, 12, tzHours), lat, lon).declination;
    const color = declinationColor((decl + 23.44) / 46.88);
    const solstice = month === 6 || month === 12;
    const pts: [number, number, number][] = [];
    for (let h = 0; h <= 24.0001; h += 0.05) {
      const sun = solarPosition(utcFromStandardTime(year, month, 21, h, tzHours), lat, lon);
      if (sun.elevation >= 0) pts.push(domeXYZ(radiusM, sun.azimuth, sun.elevation));
    }
    b.polyline(pts, color, solstice ? 2.4 : 1.8);
    for (let h = 1; h <= 23; h++) {
      const sun = solarPosition(utcFromStandardTime(year, month, 21, h, tzHours), lat, lon);
      if (sun.elevation > 0) b.point(domeXYZ(radiusM, sun.azimuth, sun.elevation), color, solstice ? 5 : 4);
    }
  }
  return b.build();
}

/**
 * Éléments dépendant de la date et de l'heure : sphère du soleil, halo, rayon vers le centre
 * et projection au sol. Vide quand le soleil est sous l'horizon.
 */
export function buildSunMarkerScene(
  center: LngLat,
  radiusM: number,
  sun: { azimuth: number; elevation: number }
): GlScene {
  const b = new GlSceneBuilder(center);
  if (sun.elevation <= 0) return b.build();
  const p = domeXYZ(radiusM, sun.azimuth, sun.elevation);
  const ground: [number, number, number] = [p[0], p[1], 0];
  b.segment([0, 0, 0], p, [1, 0.92, 0.45, 0.85], 1.4);
  b.segment(p, ground, [1, 1, 1, 0.3], 1);
  b.point(ground, [1, 0.92, 0.45, 0.9], 4);
  b.point(p, [1, 0.85, 0.3, 0.6], Math.max(70, radiusM * 0.14), true);
  b.sphere(p, Math.max(8, radiusM * 0.025), [1, 0.82, 0.2, 1]);
  return b.build();
}

/** Concatène plusieurs scènes de même origine. */
export function mergeScenes(...scenes: (GlScene | null)[]): GlScene | null {
  const list = scenes.filter((s): s is GlScene => !!s);
  if (list.length === 0) return null;
  const cat = (arrs: Float32Array[]) => {
    const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrs) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  };
  return {
    origin: list[0].origin,
    lines: cat(list.map((s) => s.lines)),
    points: cat(list.map((s) => s.points)),
    spheres: list.flatMap((s) => s.spheres),
  };
}
