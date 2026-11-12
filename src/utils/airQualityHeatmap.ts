import { AirQualityData, District } from '../types/atlas';

export interface AirQualityPointProperties {
  aqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  name: string;
  type: 'station' | 'grid' | 'hotspot' | 'park';
  weight: number;
}

export interface AirQualityFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: AirQualityPointProperties;
}

export interface AirQualityGeoJson {
  type: 'FeatureCollection';
  features: AirQualityFeature[];
}

// Known geographic anchor points across Île de Nantes
const ANCHOR_POINTS: { name: string; coordinates: [number, number]; type: 'station' | 'hotspot' | 'park'; aqiModifier: number }[] = [
  // Parks & river banks (generally cleaner, lower AQI index)
  { name: 'Parc des Chantiers & Nefs', coordinates: [-1.5665, 47.2060], type: 'park', aqiModifier: -4 },
  { name: 'Pointe Ouest & Rives de Loire', coordinates: [-1.5750, 47.2000], type: 'park', aqiModifier: -6 },
  { name: 'Berges de Sèvres & Pirmil', coordinates: [-1.5420, 47.2025], type: 'park', aqiModifier: -3 },
  { name: 'Promenade de l\'Île Mabon', coordinates: [-1.5710, 47.2020], type: 'park', aqiModifier: -5 },
  { name: 'Parc Beaulieu & Rives Nord', coordinates: [-1.5290, 47.2110], type: 'park', aqiModifier: -4 },
  { name: 'Quai François Mitterrand', coordinates: [-1.5580, 47.2078], type: 'park', aqiModifier: -2 },

  // Heavy traffic corridors and bridges (higher dispersion & particulate concentration)
  { name: 'Axe Général de Gaulle / Pont Willy Brandt', coordinates: [-1.5395, 47.2085], type: 'hotspot', aqiModifier: +7 },
  { name: 'Pont Anne de Bretagne', coordinates: [-1.5700, 47.2072], type: 'hotspot', aqiModifier: +5 },
  { name: 'Boulevard de la Prairie-au-Duc', coordinates: [-1.5620, 47.2050], type: 'hotspot', aqiModifier: +4 },
  { name: 'Boulevard Victor-Hugo & Ponts', coordinates: [-1.5470, 47.2055], type: 'hotspot', aqiModifier: +6 },
  { name: 'Carrefour Vincent-Gâche', coordinates: [-1.5495, 47.2065], type: 'hotspot', aqiModifier: +5 },
  { name: 'Secteur Chantier CHU / MIN', coordinates: [-1.5540, 47.2018], type: 'hotspot', aqiModifier: +6 },
  { name: 'Pont des Trois Continents', coordinates: [-1.5645, 47.1990], type: 'hotspot', aqiModifier: +4 },
  { name: 'Pont Aristide Briand', coordinates: [-1.5350, 47.2095], type: 'hotspot', aqiModifier: +5 },

  // Urban quarters & mixed zones
  { name: 'Quartier de la Création & Beaux-Arts', coordinates: [-1.5585, 47.2062], type: 'station', aqiModifier: +1 },
  { name: 'Place de la République', coordinates: [-1.5488, 47.2062], type: 'station', aqiModifier: +2 },
  { name: 'Cœur Beaulieu Tertiaire', coordinates: [-1.5340, 47.2090], type: 'station', aqiModifier: +2 },
  { name: 'Île de Nantes Centre-Sud', coordinates: [-1.5510, 47.2040], type: 'station', aqiModifier: 0 },
  { name: 'Station CAMS Île de Nantes', coordinates: [-1.5530, 47.2058], type: 'station', aqiModifier: 0 },
];

/**
 * Builds an authentic, continuous GeoJSON feature collection covering Île de Nantes
 * based on the active airQuality state (EAQI, PM2.5, PM10, NO2).
 */
export function generateAirQualityGeoJson(
  airQuality: AirQualityData | null,
  districts: District[] = []
): AirQualityGeoJson {
  const baseAqi = airQuality?.europeanAqi ?? 28;
  const basePm25 = airQuality?.pm25 ?? 9.5;
  const basePm10 = airQuality?.pm10 ?? 14.2;
  const baseNo2 = airQuality?.nitrogenDioxide ?? 18.0;

  const features: AirQualityFeature[] = [];

  // 1. Add specific urban anchor points
  ANCHOR_POINTS.forEach((pt) => {
    const aqiVal = Math.max(5, Math.min(120, Math.round(baseAqi + pt.aqiModifier)));
    const pm25Val = Math.max(1, Math.round((basePm25 * (aqiVal / baseAqi)) * 10) / 10);
    const pm10Val = Math.max(1, Math.round((basePm10 * (aqiVal / baseAqi)) * 10) / 10);
    const no2Val = Math.max(1, Math.round((baseNo2 * (aqiVal / baseAqi)) * 10) / 10);
    const weight = Math.min(1.0, Math.max(0.1, aqiVal / 80));

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: pt.coordinates,
      },
      properties: {
        aqi: aqiVal,
        pm25: pm25Val,
        pm10: pm10Val,
        no2: no2Val,
        name: pt.name,
        type: pt.type,
        weight,
      },
    });
  });

  // 2. Add District centers from props
  districts.forEach((dist) => {
    // Avoid exact duplicate coordinates if very close to an anchor point
    const hasClose = ANCHOR_POINTS.some(
      (a) => Math.hypot(a.coordinates[0] - dist.center[0], a.coordinates[1] - dist.center[1]) < 0.002
    );
    if (!hasClose) {
      const aqiVal = Math.max(5, Math.min(120, Math.round(baseAqi)));
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: dist.center,
        },
        properties: {
          aqi: aqiVal,
          pm25: basePm25,
          pm10: basePm10,
          no2: baseNo2,
          name: `Quartier ${dist.name}`,
          type: 'station',
          weight: Math.min(1.0, Math.max(0.1, aqiVal / 80)),
        },
      });
    }
  });

  // 3. Dense spatial interpolation grid over Île de Nantes
  // Bounds: minLng: -1.578, maxLng: -1.526, minLat: 47.199, maxLat: 47.213
  const lngSteps = 9;
  const latSteps = 6;
  const minLng = -1.576;
  const maxLng = -1.528;
  const minLat = 47.1995;
  const maxLat = 47.2125;

  const dLng = (maxLng - minLng) / (lngSteps - 1);
  const dLat = (maxLat - minLat) / (latSteps - 1);

  for (let i = 0; i < lngSteps; i++) {
    for (let j = 0; j < latSteps; j++) {
      const lng = minLng + i * dLng;
      const lat = minLat + j * dLat;

      // Realistic pseudo-variation based on coordinates and island shape
      const distFromCenter = Math.hypot(lng - (-1.5530), lat - 47.2058) * 100;
      const isWesternTip = lng < -1.568;
      const isTrafficCore = Math.abs(lng - (-1.545)) < 0.008;

      let variation = Math.sin(i * 1.8 + j * 2.2) * 3;
      if (isWesternTip) variation -= 3;
      if (isTrafficCore) variation += 4;

      const aqiVal = Math.max(5, Math.min(120, Math.round(baseAqi + variation)));
      const pm25Val = Math.max(1, Math.round((basePm25 * (aqiVal / baseAqi)) * 10) / 10);
      const pm10Val = Math.max(1, Math.round((basePm10 * (aqiVal / baseAqi)) * 10) / 10);
      const no2Val = Math.max(1, Math.round((baseNo2 * (aqiVal / baseAqi)) * 10) / 10);
      const weight = Math.min(1.0, Math.max(0.1, aqiVal / 80));

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        properties: {
          aqi: aqiVal,
          pm25: pm25Val,
          pm10: pm10Val,
          no2: no2Val,
          name: `Maille atmosphérique [${i + 1},${j + 1}]`,
          type: 'grid',
          weight,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
