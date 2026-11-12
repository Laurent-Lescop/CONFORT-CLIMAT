import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AtlasData,
  AtlasItem,
  WeatherData,
  AirQualityData,
  SelectionWindowConfig,
  SectorPreset,
  CameraFocusRequest,
  SunSettings,
  WindUiState,
  ComfortUiState,
  ShadowUiState,
} from './types/atlas';
import { fetchWeatherData, fetchAirQualityData } from './services/weatherService';
import { fetchVegetation, VegetationData } from './services/vegetationService';
import { EpwData, EpwParseError, parseEpw, summarizeEpw } from './utils/epw';
import {
  buildSunpath,
  buildSunpathBaseScene,
  buildSunMarkerScene,
  mergeScenes,
  dateToDayOfYear,
  dayOfYearToMonthDay,
  solarPosition,
  sunMarkerFeatures,
  utcFromStandardTime,
} from './utils/sunPosition';
import {
  buildRadiationPoints,
  buildRadiationDotsScene,
  computeHourlySun,
  epwHourInfo,
  findEpwRow,
  hottestEpwRow,
  stationToSiteWindFactor,
} from './utils/zoneStudy';
import type { WindField } from './utils/windField';
import { ComfortOverlay } from './utils/comfortOverlay';
import type { ComfortStats } from './utils/comfortModel';
import { ComfortRunner } from './services/comfortSimulation';
import { GlOverlayLayer } from './utils/glOverlayLayer';
import { attachCustomLayer } from './utils/mapOverlays';
import { WindOverlay } from './utils/windOverlay';
import { ShadowOverlay } from './utils/shadowOverlay';
import { ShadowStudy } from './services/shadowStudy';
import { WindSimulationError, WindSimulationRunner } from './services/windSimulation';
import { WindStats, computeWindStats } from './utils/windLbm';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { ClimateStudyPanel, SUN_YEAR } from './components/ClimateStudyPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AtlasMap } from './components/AtlasMap';
import { AppHeaderCard } from './components/AppHeaderCard';
import { ClimatePanel } from './components/ClimatePanel';
import { UrbanIntelligenceModal } from './components/UrbanIntelligenceModal';
import { SectorSelectionToolbar, SECTOR_PRESETS } from './components/SectorSelectionToolbar';
import { MapProviderModal } from './components/MapProviderModal';
// Direct import of data.json ensures instant availability
import initialAtlasData from './data/data.json';

/** Les lieux et projets de l'atlas ne sont plus affichés : l'application est centrée sur le climat */
const NO_ITEMS: AtlasItem[] = [];

export default function App() {
  const [atlasData, setAtlasData] = useState<AtlasData>(initialAtlasData as AtlasData);
  const [selectedItem, setSelectedItem] = useState<AtlasItem | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'poi' | 'project'>('all');
  const [show3DBuildings, setShow3DBuildings] = useState<boolean>(true);

  // Mapbox & OpenStreetMap Provider state
  const [mapboxToken, setMapboxToken] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('atlas_mapbox_token') || '';
    }
    return '';
  });
  const [activeProvider, setActiveProvider] = useState<'osm' | 'mapbox'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('atlas_mapbox_token') ? 'mapbox' : 'osm';
    }
    return 'osm';
  });
  const [isProviderModalOpen, setIsProviderModalOpen] = useState<boolean>(false);

  const handleSaveMapboxToken = (token: string) => {
    setMapboxToken(token);
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('atlas_mapbox_token', token);
        setActiveProvider('mapbox');
      } else {
        localStorage.removeItem('atlas_mapbox_token');
        setActiveProvider('osm');
      }
    }
  };

  // Secteur d'étude circulaire (rayon max 250 m), centré sur des coordonnées GPS [lng, lat]
  const [selectionConfig, setSelectionConfig] = useState<SelectionWindowConfig>({
    enabled: true,
    center: [-1.5530, 47.2058],
    radiusM: 250,
    isolateBuildings: false,
  });
  const [isPickCenterActive, setIsPickCenterActive] = useState<boolean>(false);
  const [buildingsInSectorCount, setBuildingsInSectorCount] = useState<number>(0);
  const [focusRequest, setFocusRequest] = useState<CameraFocusRequest | null>(null);

  const focusOn = useCallback(
    (center: [number, number], opts: Partial<Omit<CameraFocusRequest, 'center' | 'nonce'>> = {}) => {
      setFocusRequest({ center, nonce: Date.now(), ...opts });
    },
    []
  );

  // Calque végétation OpenStreetMap (optionnel)
  const [showVegetation, setShowVegetation] = useState<boolean>(false);
  const [vegetation, setVegetation] = useState<VegetationData | null>(null);
  const [isVegetationLoading, setIsVegetationLoading] = useState<boolean>(false);
  const [vegetationError, setVegetationError] = useState<string | null>(null);

  // Étude climatique : fichier EPW + sunpath centré sur la zone
  const [isStudyPanelOpen, setIsStudyPanelOpen] = useState<boolean>(false);
  const [epw, setEpw] = useState<EpwData | null>(null);
  const [epwError, setEpwError] = useState<string | null>(null);
  const [sun, setSun] = useState<SunSettings>({
    showSunpath: false,
    mode: '3d',
    dayOfYear: 172, // 21 juin
    hour: 13,
    syncMapLight: false,
    showRadiation: false,
    radiationMetric: 'ghi',
  });
  const epwSummary = useMemo(() => (epw ? summarizeEpw(epw) : null), [epw]);
  // Fuseau horaire : celui du fichier EPW, sinon heure légale d'hiver de la France (UTC+1)
  const timezone = epw?.location.timezone ?? 1;

  const sunPosition = useMemo(() => {
    const { month, day } = dayOfYearToMonthDay(SUN_YEAR, sun.dayOfYear);
    return solarPosition(
      utcFromStandardTime(SUN_YEAR, month, day, sun.hour, timezone),
      selectionConfig.center[1],
      selectionConfig.center[0]
    );
  }, [sun.dayOfYear, sun.hour, timezone, selectionConfig.center]);

  const sunpath = useMemo(
    () =>
      sun.showSunpath
        ? buildSunpath(selectionConfig.center, selectionConfig.radiusM, timezone, SUN_YEAR)
        : null,
    [sun.showSunpath, selectionConfig.center, selectionConfig.radiusM, timezone]
  );

  const is3d = sun.mode === '3d';

  // Éléments 2D (diagramme posé au sol)
  const sunMarker = useMemo(
    () =>
      sun.showSunpath && !is3d ? sunMarkerFeatures(selectionConfig.center, selectionConfig.radiusM, sunPosition) : null,
    [sun.showSunpath, is3d, selectionConfig.center, selectionConfig.radiusM, sunPosition]
  );

  // Position du soleil à chaque heure du fichier EPW (commune aux modes 2D et 3D)
  const hourlySun = useMemo(() => {
    if (!epw || !sun.showSunpath || !sun.showRadiation) return null;
    return computeHourlySun(epw, { center: selectionConfig.center, radiusM: selectionConfig.radiusM });
  }, [epw, sun.showSunpath, sun.showRadiation, selectionConfig.center, selectionConfig.radiusM]);

  const radiationPoints = useMemo(() => {
    if (!epw || !hourlySun || is3d) return null;
    return buildRadiationPoints(
      epw,
      { center: selectionConfig.center, radiusM: selectionConfig.radiusM },
      hourlySun,
      sun.radiationMetric
    );
  }, [epw, hourlySun, is3d, sun.radiationMetric, selectionConfig.center, selectionConfig.radiusM]);

  const sunLight = useMemo(
    () => (sun.syncMapLight ? { azimuth: sunPosition.azimuth, elevation: sunPosition.elevation } : null),
    [sun.syncMapLight, sunPosition]
  );

  // --- Dôme 3D du sunpath : calque WebGL (lignes fines, points ronds, sphère du soleil) ---
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const sunGlLayerRef = useRef<GlOverlayLayer | null>(null);

  useEffect(() => {
    if (!mapInstance) return;
    const layer = new GlOverlayLayer('sunpath-gl');
    sunGlLayerRef.current = layer;
    const detach = attachCustomLayer(mapInstance, layer);
    return () => {
      detach();
      sunGlLayerRef.current = null;
    };
  }, [mapInstance]);

  const show3dSunpath = sun.showSunpath && is3d;

  // Partie fixe : ne dépend ni de l'heure ni de la date
  const sunBaseScene = useMemo(
    () =>
      show3dSunpath ? buildSunpathBaseScene(selectionConfig.center, selectionConfig.radiusM, timezone, SUN_YEAR) : null,
    [show3dSunpath, selectionConfig.center, selectionConfig.radiusM, timezone]
  );
  const sunDotsScene = useMemo(() => {
    if (!show3dSunpath || !epw || !hourlySun) return null;
    return buildRadiationDotsScene(
      epw,
      { center: selectionConfig.center, radiusM: selectionConfig.radiusM },
      hourlySun,
      sun.radiationMetric
    );
  }, [show3dSunpath, epw, hourlySun, sun.radiationMetric, selectionConfig.center, selectionConfig.radiusM]);
  const sunMarkerScene = useMemo(
    () =>
      show3dSunpath ? buildSunMarkerScene(selectionConfig.center, selectionConfig.radiusM, sunPosition) : null,
    [show3dSunpath, selectionConfig.center, selectionConfig.radiusM, sunPosition]
  );

  useEffect(() => {
    const layer = sunGlLayerRef.current;
    if (!layer) return;
    layer.setScene(show3dSunpath ? mergeScenes(sunBaseScene, sunDotsScene, sunMarkerScene) : null);
    layer.setVisible(show3dSunpath);
  }, [mapInstance, show3dSunpath, sunBaseScene, sunDotsScene, sunMarkerScene]);

  // --- Simulation du vent (2,5D) : lancée par un clic sur la rose des vents du panneau d'étude ---
  const windOverlayRef = useRef<WindOverlay | null>(null);
  const windRunnerRef = useRef<WindSimulationRunner | null>(null);
  const windRunIdRef = useRef(0);
  const [wind, setWind] = useState<WindUiState>({
    status: 'idle',
    progress: 0,
    directionFrom: 270,
    speedRef: 4,
    hasField: false,
    obstacleCount: 0,
    result: null,
    error: null,
    showParticles: true,
    showSpeedMap: true,
  });
  const [windStats, setWindStats] = useState<WindStats | null>(null);

  useEffect(() => {
    if (!mapInstance) return;
    const overlay = new WindOverlay(mapInstance);
    const runner = new WindSimulationRunner();
    windOverlayRef.current = overlay;
    windRunnerRef.current = runner;
    return () => {
      runner.cancel();
      overlay.dispose();
      windOverlayRef.current = null;
      windRunnerRef.current = null;
    };
  }, [mapInstance]);

  useEffect(() => {
    windOverlayRef.current?.setVisibility({ particles: wind.showParticles, speedMap: wind.showSpeedMap });
  }, [mapInstance, wind.showParticles, wind.showSpeedMap, wind.hasField]);

  const clearWind = useCallback(() => {
    windRunIdRef.current++;
    windRunnerRef.current?.cancel();
    windOverlayRef.current?.setField(null);
    windFieldRef.current = null;
    setWindStats(null);
    setWind((w) => ({ ...w, status: 'idle', progress: 0, hasField: false, result: null, error: null }));
  }, []);

  // Le résultat n'a plus de sens si la zone change : on l'efface
  useEffect(() => {
    clearWind();
  }, [selectionConfig.center, selectionConfig.radiusM, clearWind]);

  const runWind = useCallback(
    async (directionFrom: number, speedRef: number): Promise<WindField | null> => {
      const map = mapInstance;
      const runner = windRunnerRef.current;
      const overlay = windOverlayRef.current;
      if (!map || !runner || !overlay) return null;
      const runId = ++windRunIdRef.current;
      setWindStats(null);
      windFieldRef.current = null;
      setWind((w) => ({
        ...w,
        directionFrom,
        speedRef,
        status: 'preparing',
        progress: 0,
        error: null,
        hasField: false,
        result: { directionFrom, speedRef },
        // Un nouveau calcul affiche son résultat, même si la carte avait été masquée (ombres, confort)
        showSpeedMap: true,
      }));
      setShadow((s) => (s.mode === 'off' ? s : { ...s, mode: 'off' }));
      overlay.setField(null);
      try {
        const field = await runner.run({
          map,
          center: selectionConfig.center,
          radiusM: selectionConfig.radiusM,
          directionFrom,
          speedRef,
          onPhase: (phase, info) => {
            if (runId !== windRunIdRef.current) return;
            setWind((w) => ({
              ...w,
              status: phase,
              progress: info.fraction,
              obstacleCount: info.buildings ? info.buildings.obstacleCount : w.obstacleCount,
            }));
          },
          onField: (f) => {
            if (runId !== windRunIdRef.current) return;
            overlay.setField(f);
            setWind((w) => (w.hasField ? w : { ...w, hasField: true }));
          },
        });
        if (runId !== windRunIdRef.current) return null;
        overlay.setField(field);
        windFieldRef.current = field;
        setWindStats(computeWindStats(field.u, field.v, field.solid, field.nx, field.ny, field.dx, field.radiusM));
        setWind((w) => ({ ...w, status: 'done', progress: 1, hasField: true }));
        return field;
      } catch (err) {
        if (runId !== windRunIdRef.current || (err as Error)?.name === 'AbortError') return null;
        console.error('Simulation du vent :', err);
        // Erreur « attendue » (message déjà explicite) ou imprévue (on affiche le détail technique)
        const message =
          err instanceof WindSimulationError
            ? err.message
            : `Erreur inattendue : ${err instanceof Error ? `${err.name} — ${err.message}` : String(err)}. Rechargez la page (Ctrl+F5) puis réessayez ; si elle persiste, notez ce message.`;
        // Un champ partiel (calcul interrompu par l'erreur) ne doit pas rester affiché comme un résultat
        overlay.setField(null);
        setWind((w) => ({ ...w, status: 'error', error: message, hasField: false, result: null }));
        return null;
      }
    },
    [mapInstance, selectionConfig.center, selectionConfig.radiusM]
  );

  // Arrêt : le champ partiel (non moyenné) n'est pas un résultat, on l'efface
  const stopWind = clearWind;

  // --- Confort thermique (UTCI) : carte au sol à 0,5 m pour l'heure choisie dans le sunpath ---
  const windFieldRef = useRef<WindField | null>(null);
  const comfortOverlayRef = useRef<ComfortOverlay | null>(null);
  const comfortRunnerRef = useRef<ComfortRunner | null>(null);
  const comfortRunIdRef = useRef(0);
  const [comfort, setComfort] = useState<ComfortUiState>({
    status: 'idle',
    phase: '',
    progress: 0,
    dx: 0.5,
    terrain: 'city',
    showMap: true,
    hasResult: false,
    error: null,
    summary: null,
  });
  const [comfortStats, setComfortStats] = useState<ComfortStats | null>(null);

  useEffect(() => {
    if (!mapInstance) return;
    const overlay = new ComfortOverlay(mapInstance);
    const runner = new ComfortRunner();
    comfortOverlayRef.current = overlay;
    comfortRunnerRef.current = runner;
    return () => {
      runner.cancel();
      overlay.dispose();
      comfortOverlayRef.current = null;
      comfortRunnerRef.current = null;
    };
  }, [mapInstance]);

  useEffect(() => {
    comfortOverlayRef.current?.setVisible(comfort.showMap);
  }, [mapInstance, comfort.showMap, comfort.hasResult]);

  // Ligne EPW de l'heure étudiée : date et heure réglées dans la section Sunpath
  const comfortHour = useMemo(() => {
    if (!epw) return null;
    const { month, day } = dayOfYearToMonthDay(SUN_YEAR, sun.dayOfYear);
    const epwHour = Math.min(24, Math.max(1, Math.floor(sun.hour) + 1));
    const row = findEpwRow(epw, month, day, epwHour);
    return row >= 0 ? epwHourInfo(epw, row, selectionConfig.center) : null;
  }, [epw, sun.dayOfYear, sun.hour, selectionConfig.center]);

  const clearComfort = useCallback(() => {
    comfortRunIdRef.current++;
    comfortRunnerRef.current?.cancel();
    comfortOverlayRef.current?.setResult(null, [0, 0]);
    setComfortStats(null);
    setComfort((c) => ({ ...c, status: 'idle', phase: '', progress: 0, hasResult: false, error: null, summary: null }));
  }, []);

  // La carte n'a plus de sens si la zone, le fichier EPW, l'heure ou le terrain changent : on l'efface
  useEffect(() => {
    clearComfort();
  }, [selectionConfig.center, selectionConfig.radiusM, epw, comfortHour?.row, comfort.terrain, clearComfort]);

  /** Vrai pendant que le calcul de confort fait tourner la simulation du vent de son heure */
  const comfortWindStepRef = useRef(false);

  const stopComfort = useCallback(() => {
    comfortRunIdRef.current++;
    comfortRunnerRef.current?.cancel();
    // N'arrête le vent que s'il a été lancé par le calcul de confort
    if (comfortWindStepRef.current) {
      comfortWindStepRef.current = false;
      clearWind();
    }
    setComfort((c) => ({ ...c, status: 'idle', phase: '', progress: 0 }));
  }, [clearWind]);

  const runComfort = useCallback(async () => {
    const map = mapInstance;
    const runner = comfortRunnerRef.current;
    const overlay = comfortOverlayRef.current;
    const hour = comfortHour;
    if (!map || !runner || !overlay || !hour) return;
    const runId = ++comfortRunIdRef.current;
    const stale = () => runId !== comfortRunIdRef.current;
    const hourLabel = `${hour.day}/${hour.month} ${hour.epwHour - 1} h`;
    setComfortStats(null);
    overlay.setResult(null, selectionConfig.center);
    setComfort((c) => ({ ...c, status: 'preparing', phase: 'Préparation', progress: 0, error: null, hasResult: false, summary: null }));

    try {
      // 1. Vent de cette heure : réutilise la simulation existante si la direction correspond (à 11° près)
      let windField: WindField | null = null;
      let windMode: 'simulated' | 'reused' | 'uniform' = 'uniform';
      if (hour.wind10 >= 0.5 && hour.windDirFrom !== null) {
        const cur = windFieldRef.current;
        const diff = cur ? Math.abs(((cur.directionFrom - hour.windDirFrom + 540) % 360) - 180) : 360;
        if (cur && cur.averaged && diff <= 11.25) {
          windField = cur;
          windMode = 'reused';
        } else {
          setComfort((c) => ({ ...c, status: 'wind', phase: 'Simulation du vent', progress: 0 }));
          const windRunId = windRunIdRef.current + 1; // identifiant que runWind va prendre
          comfortWindStepRef.current = true;
          try {
            windField = await runWind(hour.windDirFrom, hour.wind10);
          } finally {
            comfortWindStepRef.current = false;
          }
          if (stale()) return;
          if (!windField) {
            throw new WindSimulationError(
              windRunIdRef.current !== windRunId
                ? 'La simulation du vent de cette heure a été interrompue (un autre calcul de vent a été lancé). Relancez la carte de confort.'
                : 'La simulation du vent de cette heure a échoué : voir le message dans la section « Simulation du vent ».'
            );
          }
          windMode = 'simulated';
        }
      }
      if (stale()) return;

      // 2. Carte de confort. Le vent de la station (aérodrome, terrain dégagé) est ramené au vent
      //    qui arrive sur le quartier selon la rugosité du terrain choisie.
      const siteWind10 = hour.wind10 * stationToSiteWindFactor(comfort.terrain);
      setComfort((c) => ({ ...c, status: 'computing', phase: 'Préparation', progress: 0 }));
      const { result, buildingCount, treeCount } = await runner.run({
        map,
        center: selectionConfig.center,
        radiusM: selectionConfig.radiusM,
        dx: comfort.dx,
        hour,
        vegetation: showVegetation ? vegetation : null,
        wind: windField,
        siteWind10,
        onPhase: (label, fraction) => {
          if (!stale()) setComfort((c) => ({ ...c, status: 'computing', phase: label, progress: fraction }));
        },
      });
      if (stale()) return;
      await overlay.setResult(result, selectionConfig.center);
      if (stale()) return;
      setComfortStats(result.stats);
      setComfort((c) => ({
        ...c,
        status: 'done',
        phase: '',
        progress: 1,
        hasResult: true,
        showMap: true, // un nouveau calcul affiche sa carte, même si elle avait été masquée
        summary: { buildings: buildingCount, trees: treeCount, windMode, hourLabel, siteWindMs: siteWind10 },
      }));
      // La carte de confort prime sur la carte de vitesse du vent et sur les ombres (même emplacement au sol)
      setWind((w) => ({ ...w, showSpeedMap: false }));
      setShadow((s) => (s.mode === 'off' ? s : { ...s, mode: 'off' }));
    } catch (err) {
      if (stale() || (err as Error)?.name === 'AbortError') return;
      console.error('Carte de confort :', err);
      const message =
        err instanceof WindSimulationError
          ? err.message
          : `Erreur inattendue : ${err instanceof Error ? `${err.name} — ${err.message}` : String(err)}. Rechargez la page (Ctrl+F5) puis réessayez ; si elle persiste, notez ce message.`;
      setComfort((c) => ({ ...c, status: 'error', error: message }));
    }
  }, [
    mapInstance,
    comfortHour,
    comfort.dx,
    comfort.terrain,
    selectionConfig.center,
    selectionConfig.radiusM,
    showVegetation,
    vegetation,
    runWind,
  ]);

  // --- Ombres portées au sol (à l'heure du sunpath) et heures d'ensoleillement du jour ---
  const shadowStudyRef = useRef<ShadowStudy | null>(null);
  const shadowOverlayRef = useRef<ShadowOverlay | null>(null);
  const [shadow, setShadow] = useState<ShadowUiState>({
    mode: 'off',
    status: 'idle',
    progress: 0,
    error: null,
    buildings: 0,
    trees: 0,
    sunlitFraction: null,
    daily: null,
  });
  /** Incrémenté quand la grille des hauteurs est prête (nouvelle zone ou nouvelle végétation) */
  const [shadowGridVersion, setShadowGridVersion] = useState(0);
  const shadowActive = shadow.mode !== 'off';
  const shadowVegetation = showVegetation ? vegetation : null;

  useEffect(() => {
    if (!mapInstance) return;
    const study = new ShadowStudy();
    const overlay = new ShadowOverlay(mapInstance);
    shadowStudyRef.current = study;
    shadowOverlayRef.current = overlay;
    return () => {
      study.cancel();
      overlay.dispose();
      shadowStudyRef.current = null;
      shadowOverlayRef.current = null;
    };
  }, [mapInstance]);

  // Zone changée : les bâtiments sont à relire
  useEffect(() => {
    shadowStudyRef.current?.reset();
    shadowOverlayRef.current?.setResult(null);
  }, [selectionConfig.center, selectionConfig.radiusM]);

  // Changement de mode : on efface l'ancien calque ; les autres cartes au sol s'effacent devant les ombres
  useEffect(() => {
    shadowOverlayRef.current?.setResult(null);
    if (shadow.mode === 'off') {
      shadowStudyRef.current?.cancelDaily();
      setShadow((s) => ({ ...s, status: 'idle', progress: 0, error: null, sunlitFraction: null, daily: null }));
    } else {
      setComfort((c) => (c.showMap ? { ...c, showMap: false } : c));
      setWind((w) => (w.showSpeedMap ? { ...w, showSpeedMap: false } : w));
    }
  }, [shadow.mode]);

  // Préparation : bâtiments de la zone (une fois) + arbres du calque végétation
  useEffect(() => {
    const study = shadowStudyRef.current;
    const map = mapInstance;
    if (!shadowActive || !study || !map) return;
    let cancelled = false;
    setShadow((s) => ({ ...s, status: 'loading', progress: 0, error: null }));
    study
      .prepare(map, selectionConfig.center, selectionConfig.radiusM, shadowVegetation)
      .then(({ buildings, trees }) => {
        if (cancelled) return;
        setShadow((s) => ({ ...s, buildings, trees }));
        setShadowGridVersion((v) => v + 1);
      })
      .catch((err) => {
        if (cancelled || (err as Error)?.name === 'AbortError') return;
        console.error('Ombres portées :', err);
        setShadow((s) => ({
          ...s,
          status: 'error',
          error: err instanceof WindSimulationError ? err.message : `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`,
        }));
      });
    return () => {
      cancelled = true;
      study.cancel();
    };
  }, [shadowActive, mapInstance, selectionConfig.center, selectionConfig.radiusM, shadowVegetation]);

  // Ombres à l'instant choisi : recalculées en direct quand la date ou l'heure bougent
  useEffect(() => {
    if (shadow.mode !== 'instant' || !shadowStudyRef.current?.isReady) return;
    const raf = requestAnimationFrame(() => {
      const study = shadowStudyRef.current;
      const overlay = shadowOverlayRef.current;
      if (!study || !overlay) return;
      const { month } = dayOfYearToMonthDay(SUN_YEAR, sun.dayOfYear);
      const res = study.instant(sunPosition.azimuth, sunPosition.elevation, month);
      if (!res) return;
      overlay.setResult(res);
      setShadow((s) => ({ ...s, status: 'done', sunlitFraction: res.sunUp ? res.sunlitFraction : null }));
    });
    return () => cancelAnimationFrame(raf);
  }, [shadow.mode, shadowGridVersion, sunPosition, sun.dayOfYear]);

  // Heures d'ensoleillement du jour : recalculées quand la date change (quelques secondes)
  useEffect(() => {
    if (shadow.mode !== 'daily' || !shadowStudyRef.current?.isReady) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const study = shadowStudyRef.current;
      const overlay = shadowOverlayRef.current;
      if (!study || !overlay) return;
      setShadow((s) => ({ ...s, status: 'computing', progress: 0, error: null }));
      try {
        const res = await study.daily(sun.dayOfYear, SUN_YEAR, timezone, (p) => {
          if (!cancelled) setShadow((s) => ({ ...s, progress: p }));
        });
        if (cancelled) return;
        overlay.setResult(res);
        setShadow((s) => ({
          ...s,
          status: 'done',
          progress: 1,
          daily: {
            dayOfYear: res.dayOfYear,
            dayLengthMin: res.dayLengthMin,
            meanHours: res.meanHours,
            maxHours: res.maxHours,
            classes: res.classes,
          },
        }));
      } catch (err) {
        if (cancelled || (err as Error)?.name === 'AbortError') return;
        setShadow((s) => ({ ...s, status: 'error', error: err instanceof Error ? err.message : String(err) }));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      shadowStudyRef.current?.cancelDaily();
    };
  }, [shadow.mode, shadowGridVersion, sun.dayOfYear, timezone]);

  // « Heure la plus chaude » : se place sur la ligne EPW de température maximale
  const pickHottestHour = useCallback(() => {
    if (!epw) return;
    const row = hottestEpwRow(epw);
    if (row < 0) return;
    setSun((prev) => ({
      ...prev,
      dayOfYear: dateToDayOfYear(SUN_YEAR, epw.month[row], epw.day[row]),
      hour: epw.hour[row] - 0.5,
    }));
  }, [epw]);

  const handleLoadEpwFile = useCallback(async (file: File) => {
    setEpwError(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new EpwParseError('Fichier trop volumineux (plus de 25 Mo) pour un EPW.');
      const parsed = parseEpw(await file.text(), file.name);
      setEpw(parsed);
      setSun((prev) => ({ ...prev, showSunpath: true, showRadiation: true }));
    } catch (err) {
      setEpwError(err instanceof Error ? err.message : 'Lecture du fichier EPW impossible.');
    }
  }, []);

  const handleClearEpw = useCallback(() => {
    setEpw(null);
    setEpwError(null);
    setSun((prev) => ({ ...prev, showRadiation: false }));
  }, []);

  // Charge la végétation OSM autour du centre du secteur (avec délai pour éviter les requêtes en rafale)
  useEffect(() => {
    if (!showVegetation) return;
    const controller = new AbortController();
    setIsVegetationLoading(true);
    setVegetationError(null);
    const timer = setTimeout(() => {
      fetchVegetation(selectionConfig.center, selectionConfig.radiusM, controller.signal)
        .then((data) => {
          setVegetation(data);
          setIsVegetationLoading(false);
        })
        .catch((err) => {
          if ((err as Error)?.name === 'AbortError') return;
          setVegetationError(
            "Impossible de charger la végétation OpenStreetMap (serveur Overpass indisponible ou hors-ligne). Réessayez dans un instant."
          );
          setIsVegetationLoading(false);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [showVegetation, selectionConfig.center, selectionConfig.radiusM]);

  // Climate state
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [isClimateLoading, setIsClimateLoading] = useState<boolean>(true);
  const [showAirQualityHeatmap, setShowAirQualityHeatmap] = useState<boolean>(false);

  // AI Modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiContextItem, setAiContextItem] = useState<AtlasItem | null>(null);

  // Guided Demo Tour state (social media automated video demo mode)
  const [isDemoTourOpen, setIsDemoTourOpen] = useState<boolean>(false);

  // Climate data fetching
  const loadClimateData = useCallback(async () => {
    setIsClimateLoading(true);
    try {
      const [wData, aqData] = await Promise.all([
        fetchWeatherData(),
        fetchAirQualityData(),
      ]);
      setWeather(wData);
      setAirQuality(aqData);
    } catch (err) {
      console.warn('Failed to load climate data:', err);
    } finally {
      setIsClimateLoading(false);
    }
  }, []);

  // Online / Offline network state tracking
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      loadClimateData();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadClimateData]);

  // Initial load and periodic refresh
  useEffect(() => {
    loadClimateData();
    const interval = setInterval(() => {
      loadClimateData();
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
  }, [loadClimateData]);

  // Load public data.json if updated
  useEffect(() => {
    fetch('/data.json')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not found');
      })
      .then((data: AtlasData) => {
        if (data && data.items && data.districts) {
          setAtlasData(data);
        }
      })
      .catch(() => {
        // Fallback already in place
      });
  }, []);

  // Keyboard navigation & Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPickCenterActive) {
          setIsPickCenterActive(false);
        } else if (isAiModalOpen) {
          setIsAiModalOpen(false);
        } else if (selectedItem) {
          setSelectedItem(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPickCenterActive, isAiModalOpen, selectedItem]);

  const totalPoisCount = atlasData.items.filter((i) => i.type === 'poi').length;
  const totalProjectsCount = atlasData.items.filter((i) => i.type === 'project').length;

  const handleOpenAiForSpecificItem = useCallback((item: AtlasItem) => {
    setAiContextItem(item);
    setIsAiModalOpen(true);
  }, []);

  const handleOpenGeneralAiModal = useCallback(() => {
    setAiContextItem(selectedItem);
    setIsAiModalOpen(true);
  }, [selectedItem]);

  const handleSelectPreset = useCallback((preset: SectorPreset) => {
    setSelectionConfig((prev) => ({
      ...prev,
      enabled: true,
      center: preset.center,
      radiusM: preset.radiusM,
    }));
    setIsPickCenterActive(false);
    focusOn(preset.center, { zoom: preset.zoom, pitch: preset.pitch, bearing: preset.bearing });
  }, [focusOn]);

  // Saisie de coordonnées GPS : déplace le secteur puis la caméra
  const handleSetCenterFromGps = useCallback(
    (center: [number, number]) => {
      setSelectionConfig((prev) => ({ ...prev, enabled: true, center }));
      setSelectedDistrictId(null);
      focusOn(center, { zoom: 16.9, pitch: 55 });
    },
    [focusOn]
  );

  const handleCenterOnEpwStation = useCallback(() => {
    if (epw) handleSetCenterFromGps([epw.location.longitude, epw.location.latitude]);
  }, [epw, handleSetCenterFromGps]);

  const handleUpdateSelectionCenter = useCallback((newCenter: [number, number]) => {
    setSelectionConfig((prev) => ({
      ...prev,
      center: newCenter,
    }));
    setIsPickCenterActive(false);
  }, []);

  const handleBuildingCountChange = useCallback((c: number) => {
    setBuildingsInSectorCount(c);
  }, []);

  const handleToggle3D = useCallback(() => {
    setShow3DBuildings((prev) => !prev);
  }, []);

  const handleSelectItem = useCallback((item: AtlasItem) => {
    setSelectedItem(item);
  }, []);

  const handleSelectDistrict = useCallback((distId: string | null) => {
    setSelectedDistrictId(distId);
    setSelectedItem(null);
  }, []);

  const handleFitToSector = useCallback(() => {
    // Recadre la caméra sur le secteur courant (le zoom dépend du rayon)
    const zoom = selectionConfig.radiusM >= 200 ? 16.9 : selectionConfig.radiusM >= 150 ? 17.3 : 17.7;
    focusOn(selectionConfig.center, { zoom, pitch: 55 });
  }, [focusOn, selectionConfig.center, selectionConfig.radiusM]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* 3D Map canvas occupying full screen background */}
      <AtlasMap
        items={NO_ITEMS}
        districts={atlasData.districts}
        selectedItem={selectedItem}
        selectedDistrictId={selectedDistrictId}
        activeFilter={activeFilter}
        show3DBuildings={show3DBuildings}
        selectionConfig={selectionConfig}
        isPickCenterActive={isPickCenterActive}
        showAirQualityHeatmap={showAirQualityHeatmap}
        airQuality={airQuality}
        onSelectItem={handleSelectItem}
        onSelectDistrict={handleSelectDistrict}
        onToggle3D={handleToggle3D}
        onToggleAirQualityHeatmap={() => setShowAirQualityHeatmap((prev) => !prev)}
        onUpdateSelectionCenter={handleUpdateSelectionCenter}
        onBuildingCountChange={handleBuildingCountChange}
        mapboxToken={mapboxToken}
        activeProvider={activeProvider}
        onOpenProviderModal={() => setIsProviderModalOpen(true)}
        overview={atlasData.overview}
        isOnline={isOnline}
        showVegetation={showVegetation}
        vegetation={vegetation}
        isVegetationLoading={isVegetationLoading}
        onToggleVegetation={() => setShowVegetation((prev) => !prev)}
        isStudyPanelOpen={isStudyPanelOpen}
        onToggleStudyPanel={() => setIsStudyPanelOpen((prev) => !prev)}
        showSunpath={sun.showSunpath}
        sunMode={sun.mode}
        sunpath={sunpath}
        radiationPoints={radiationPoints}
        sunMarker={sunMarker}
        sunLight={sunLight}
        focusRequest={focusRequest}
        onMapReady={setMapInstance}
      />

      {/* Top Center Sector Selection Toolbar (rayon max 250 m, centre en coordonnées GPS) */}
      <SectorSelectionToolbar
        config={selectionConfig}
        buildingsInSectorCount={buildingsInSectorCount}
        isPickCenterActive={isPickCenterActive}
        onChangeConfig={(newCfg) => setSelectionConfig((prev) => ({ ...prev, ...newCfg }))}
        onSelectPreset={handleSelectPreset}
        onTogglePickCenter={() => setIsPickCenterActive((prev) => !prev)}
        onFitToSector={handleFitToSector}
        onSetCenterFromGps={handleSetCenterFromGps}
      />

      {/* Étude climatique : fichier EPW, sunpath, végétation, exports */}
      <ErrorBoundary label="le panneau d'étude climatique">
      <ClimateStudyPanel
        isOpen={isStudyPanelOpen && !selectedItem}
        onClose={() => setIsStudyPanelOpen(false)}
        zone={{ center: selectionConfig.center, radiusM: selectionConfig.radiusM }}
        buildingsInSector={buildingsInSectorCount}
        epw={epw}
        summary={epwSummary}
        epwError={epwError}
        onLoadEpwFile={handleLoadEpwFile}
        onClearEpw={handleClearEpw}
        onCenterOnEpwStation={handleCenterOnEpwStation}
        sun={sun}
        onChangeSun={(patch) => setSun((prev) => ({ ...prev, ...patch }))}
        onTopView={() => focusOn(selectionConfig.center, { zoom: 16.2, pitch: 0, bearing: 0 })}
        onDomeView={() => focusOn(selectionConfig.center, { zoom: 16.0, pitch: 62, bearing: 165 })}
        sunPosition={sunPosition}
        timezone={timezone}
        showVegetation={showVegetation}
        onToggleVegetation={() => setShowVegetation((prev) => !prev)}
        vegetation={vegetation}
        isVegetationLoading={isVegetationLoading}
        vegetationError={vegetationError}
        wind={wind}
        windStats={windStats}
        onRunWind={runWind}
        onStopWind={stopWind}
        onClearWind={clearWind}
        onChangeWindParams={(patch) => setWind((w) => ({ ...w, ...patch }))}
        comfort={comfort}
        comfortStats={comfortStats}
        comfortHour={comfortHour}
        windProgress={wind.progress}
        onRunComfort={runComfort}
        onStopComfort={stopComfort}
        onClearComfort={clearComfort}
        onChangeComfort={(patch) => setComfort((c) => ({ ...c, ...patch }))}
        onPickHottestHour={pickHottestHour}
        shadow={shadow}
        onChangeShadowMode={(mode) => setShadow((s) => ({ ...s, mode }))}
      />
      </ErrorBoundary>

      {/* En-tête : titre et recherche intelligente (la palette Atlas des lieux et projets est retirée) */}
      <AppHeaderCard isOnline={isOnline} onOpenSearch={handleOpenGeneralAiModal} />

      {/* Bottom Left Climate & Air Quality Panel */}
      <ClimatePanel
        weather={weather}
        airQuality={airQuality}
        isLoading={isClimateLoading}
        onRefresh={loadClimateData}
        isOnline={isOnline}
      />

      {/* Urban Intelligence & Gemini AI Modal */}
      <UrbanIntelligenceModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        activeItemContext={aiContextItem}
      />

      {/* Map Provider & API Key Modal */}
      <MapProviderModal
        isOpen={isProviderModalOpen}
        onClose={() => setIsProviderModalOpen(false)}
        mapboxToken={mapboxToken}
        onSaveToken={handleSaveMapboxToken}
        activeProvider={activeProvider}
        onSwitchProvider={(prov) => setActiveProvider(prov)}
      />

    </div>
  );
}
