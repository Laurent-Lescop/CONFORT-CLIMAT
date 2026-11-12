export interface District {
  id: string;
  name: string;
  subtitle: string;
  center: [number, number]; // [longitude, latitude]
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

export interface SectorPreset {
  id: string;
  name: string;
  subtitle: string;
  center: [number, number]; // [longitude, latitude]
  radiusM: number; // rayon du secteur en mètres (100 à 250)
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

export interface SelectionWindowConfig {
  enabled: boolean;
  center: [number, number]; // [longitude, latitude]
  radiusM: number; // 100 à 250 m
  isolateBuildings: boolean;
}

/** Demande de déplacement de la caméra (le `nonce` change à chaque demande). */
export interface CameraFocusRequest {
  center: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  nonce: number;
}

/** État de la simulation de vent affiché dans le panneau d'étude. */
export interface WindUiState {
  status: 'idle' | 'preparing' | 'warmup' | 'averaging' | 'done' | 'error';
  /** Avancement du calcul, 0..1 */
  progress: number;
  /** Direction d'où vient le vent (° depuis le nord) et vitesse de référence (m/s) */
  directionFrom: number;
  speedRef: number;
  /** Un champ de vent est affiché sur la carte (même si le calcul n'est pas fini) */
  hasField: boolean;
  /** Nombre de bâtiments retenus comme obstacles */
  obstacleCount: number;
  /**
   * Paramètres du champ affiché sur la carte. Ils peuvent différer de `directionFrom` / `speedRef`
   * (réglages pour le prochain calcul) quand l'utilisateur bouge les curseurs après un calcul.
   */
  result: { directionFrom: number; speedRef: number } | null;
  error: string | null;
  showParticles: boolean;
  showSpeedMap: boolean;
}

/** État de la carte de confort thermique (UTCI) affiché dans le panneau d'étude. */
export interface ComfortUiState {
  status: 'idle' | 'preparing' | 'wind' | 'computing' | 'done' | 'error';
  /** Étape en cours (libellé) et avancement 0..1 de cette étape */
  phase: string;
  progress: number;
  /** Taille de cellule en mètres : 0,5 (fin), 1 ou 2 (rapide) */
  dx: number;
  /** Rugosité du terrain autour du site, pour passer du vent de la station au vent du quartier */
  terrain: 'open' | 'suburban' | 'city';
  showMap: boolean;
  hasResult: boolean;
  error: string | null;
  /** Ce qui a été pris en compte dans le dernier calcul */
  summary: {
    buildings: number;
    trees: number;
    windMode: 'simulated' | 'reused' | 'uniform';
    hourLabel: string;
    /** Vent à 10 m arrivant sur le quartier (station × correction de terrain), m/s */
    siteWindMs: number;
  } | null;
}

/** Étude des ombres portées au sol (calque piloté par la date et l'heure du sunpath). */
export interface ShadowUiState {
  /** off : aucun calque ; instant : ombres à l'heure choisie ; daily : heures de soleil du jour */
  mode: 'off' | 'instant' | 'daily';
  status: 'idle' | 'loading' | 'computing' | 'done' | 'error';
  /** Avancement du calcul journalier, 0..1 */
  progress: number;
  error: string | null;
  /** Volumes bâtis et arbres pris en compte */
  buildings: number;
  trees: number;
  /** Ombres à l'instant : part du sol libre au soleil (null si le soleil est couché) */
  sunlitFraction: number | null;
  /** Ensoleillement journalier */
  daily: {
    dayOfYear: number;
    dayLengthMin: number;
    meanHours: number;
    maxHours: number;
    classes: [number, number, number, number];
  } | null;
}

/** Paramètres du diagramme solaire (sunpath) centré sur la zone étudiée. */
export interface SunSettings {
  showSunpath: boolean;
  /** 3D : dôme céleste de rayon = rayon du secteur ; 2D : diagramme posé au sol */
  mode: '2d' | '3d';
  /** Jour de l'année 1..366 */
  dayOfYear: number;
  /** Heure légale standard décimale 0..24 */
  hour: number;
  /** Applique la direction du soleil à l'éclairage 3D de la carte */
  syncMapLight: boolean;
  /** Colore le sunpath avec le rayonnement du fichier EPW */
  showRadiation: boolean;
  radiationMetric: 'ghi' | 'dni' | 'dhi';
}

export interface AtlasItem {
  id: string;
  name: string;
  type: 'poi' | 'project';
  category: string;
  districtId: string;
  districtName: string;
  coordinates: [number, number]; // [longitude, latitude]
  coordinateConfirmed: boolean;
  shortDescription: string;
  description: string;
  historyOrContext?: string;
  status: string;
  calendar?: string;
  architect?: string;
  keyFigures?: { label: string; value: string }[];
  images: { url: string; caption: string; credit?: string }[];
  links: { title: string; url: string; note?: string }[];
  source_note: string;
}

export interface AtlasData {
  overview: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    title: string;
    description: string;
  };
  districts: District[];
  items: AtlasItem[];
}

export interface WeatherData {
  temperature: number | null;
  apparentTemperature: number | null;
  relativeHumidity: number | null;
  weatherCode: number | null;
  weatherDescription: string;
  windSpeed: number | null; // km/h
  windDirection: number | null; // deg
  windDirectionLabel: string;
  windGusts: number | null; // km/h
  precipitation: number | null; // mm
  isDay: boolean;
  sunrise: string | null;
  sunset: string | null;
  sunshineDurationHours: number | null;
  uvIndex: number | null;
  solarElevation: number | null; // deg
  solarElevationStatus: string;
  lastUpdated: string;
  isAvailable: boolean;
  source: string;
}

export interface AirQualityData {
  europeanAqi: number | null;
  aqiBand: {
    level: string;
    label: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
    summary: string;
  };
  pm25: number | null;
  pm10: number | null;
  nitrogenDioxide: number | null;
  ozone: number | null;
  attribution: string;
  disclaimer: string;
  lastUpdated: string;
  isAvailable: boolean;
}
