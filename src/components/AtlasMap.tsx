import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker, Popup, StyleSpecification, MapLayerMouseEvent } from 'maplibre-gl';

// Configure self-contained MapLibre worker to prevent worker resolution failure
if (typeof window !== 'undefined') {
  try {
    const workerUrl = new URL('/maplibre-gl-worker.cjs', window.location.href).href;
    maplibregl.setWorkerUrl(workerUrl);
  } catch (err) {
    console.warn('Could not set worker URL in AtlasMap:', err);
  }
}

import { AtlasItem, District, SelectionWindowConfig, AirQualityData, CameraFocusRequest } from '../types/atlas';
import { computeBoundingBox, createGeoJsonCircle, isPointInsideCircle, BoundingBox } from '../utils/geoUtils';
import { generateAirQualityGeoJson } from '../utils/airQualityHeatmap';
import type { VegetationData } from '../services/vegetationService';
import type { SunpathGeometry } from '../utils/sunPosition';
import localBuildingsGeoJson from '../data/buildings-ile-de-nantes.json';
import { Layers, Maximize2, Map as MapIcon, Globe, Sparkles, Key, Wind, Trees, Sun } from 'lucide-react';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Applique (ou réinitialise) l'éclairage 3D de la carte selon la direction du soleil. */
function applyMapLight(map: MapLibreMap, sun: { azimuth: number; elevation: number } | null) {
  try {
    if (!sun) {
      map.setLight(DEFAULT_LIGHT as any);
      return;
    }
    const up = sun.elevation > 0;
    map.setLight({
      anchor: 'map',
      position: [1.5, sun.azimuth, Math.max(0, Math.min(90, 90 - sun.elevation))],
      color: up ? '#fff4d6' : '#8aa4ff',
      intensity: up ? 0.35 + 0.55 * Math.sin((sun.elevation * Math.PI) / 180) : 0.1,
    } as any);
  } catch {
    // setLight indisponible pour ce style : on ignore, l'éclairage reste celui par défaut
  }
}

/** Éclairage 3D par défaut de MapLibre, restauré quand la synchronisation solaire est coupée. */
const DEFAULT_LIGHT = { anchor: 'viewport', position: [1.15, 210, 30], color: '#ffffff', intensity: 0.5 } as const;

interface AtlasMapProps {
  items: AtlasItem[];
  districts: District[];
  selectedItem: AtlasItem | null;
  selectedDistrictId: string | null;
  activeFilter: 'all' | 'poi' | 'project';
  show3DBuildings: boolean;
  selectionConfig: SelectionWindowConfig;
  isPickCenterActive: boolean;
  showAirQualityHeatmap: boolean;
  airQuality: AirQualityData | null;
  onSelectItem: (item: AtlasItem) => void;
  onSelectDistrict: (districtId: string | null) => void;
  onToggle3D: () => void;
  onToggleAirQualityHeatmap?: () => void;
  onUpdateSelectionCenter: (newCenter: [number, number]) => void;
  onBuildingCountChange: (count: number) => void;
  mapboxToken: string;
  activeProvider: 'osm' | 'mapbox';
  onOpenProviderModal: () => void;
  overview: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
  isOnline?: boolean;
  // Calque végétation OSM
  showVegetation: boolean;
  vegetation: VegetationData | null;
  isVegetationLoading: boolean;
  onToggleVegetation: () => void;
  // Étude climatique : sunpath centré sur la zone
  isStudyPanelOpen: boolean;
  onToggleStudyPanel: () => void;
  showSunpath: boolean;
  sunMode: '2d' | '3d';
  sunpath: SunpathGeometry | null;
  radiationPoints: GeoJSON.FeatureCollection | null;
  sunMarker: GeoJSON.FeatureCollection | null;
  /** Direction du soleil appliquée à l'éclairage 3D ; null = éclairage par défaut */
  sunLight: { azimuth: number; elevation: number } | null;
  focusRequest: CameraFocusRequest | null;
  /** Appelé une fois la carte chargée : permet à des calques externes (WebGL, simulation) de s'y accrocher */
  onMapReady?: (map: MapLibreMap) => void;
}

// Authentic OpenStreetMap styles (100% free, no API key required, no carto.com)
export const OSM_STYLES: Record<string, { label: string; shortLabel: string; style: StyleSpecification | string }> = {
  'osm-standard': {
    label: 'OpenStreetMap Standard (Officiel 2D)',
    shortLabel: 'OSM Standard',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        },
        'osm-buildings-vector': {
          type: 'vector',
          tiles: ['https://tiles.openfreemap.org/planet/20260913_164504_pt/{z}/{x}/{y}.pbf'],
          minzoom: 0,
          maxzoom: 14,
        },
      },
      layers: [
        {
          id: 'background-fallback',
          type: 'background',
          paint: {
            'background-color': '#e2e8f0',
          },
        },
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 20,
        },
      ],
    },
  },
  'osm-fr': {
    label: 'OpenStreetMap France (Toponymie & Détails)',
    shortLabel: 'OSM France',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors · Rendu OSM France',
        },
        'osm-buildings-vector': {
          type: 'vector',
          tiles: ['https://tiles.openfreemap.org/planet/20260913_164504_pt/{z}/{x}/{y}.pbf'],
          minzoom: 0,
          maxzoom: 14,
        },
      },
      layers: [
        {
          id: 'background-fallback',
          type: 'background',
          paint: {
            'background-color': '#e2e8f0',
          },
        },
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 20,
        },
      ],
    },
  },
  'osm-vector': {
    label: 'OpenStreetMap Vectoriel (Rendu Moderne)',
    shortLabel: 'OSM Vectoriel',
    style: 'https://tiles.openfreemap.org/styles/liberty',
  },
  'osm-light': {
    label: 'OpenStreetMap Clair (Minimaliste)',
    shortLabel: 'OSM Clair',
    style: 'https://tiles.openfreemap.org/styles/bright',
  },
};

// Mapbox styles URLs (activated when Mapbox Token is provided)
export const MAPBOX_STYLES: Record<string, { label: string; shortLabel: string; styleUrl: (token: string) => string }> = {
  'mapbox-streets': {
    label: 'Mapbox Rues 3D (Haute Définition)',
    shortLabel: 'Mapbox Rues 3D',
    styleUrl: (token) => `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${token}`,
  },
  'mapbox-satellite': {
    label: 'Mapbox Satellite HD + 3D',
    shortLabel: 'Mapbox Satellite 3D',
    styleUrl: (token) => `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=${token}`,
  },
  'mapbox-dark': {
    label: 'Mapbox Sombre 3D (Architectural)',
    shortLabel: 'Mapbox Sombre 3D',
    styleUrl: (token) => `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${token}`,
  },
  'mapbox-light': {
    label: 'Mapbox Clair 3D (Épuré)',
    shortLabel: 'Mapbox Clair 3D',
    styleUrl: (token) => `https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${token}`,
  },
};

export const AtlasMap: React.FC<AtlasMapProps> = ({
  items,
  districts,
  selectedItem,
  selectedDistrictId,
  activeFilter,
  show3DBuildings,
  selectionConfig,
  isPickCenterActive,
  showAirQualityHeatmap,
  airQuality,
  onSelectItem,
  onSelectDistrict,
  onToggle3D,
  onToggleAirQualityHeatmap,
  onUpdateSelectionCenter,
  onBuildingCountChange,
  mapboxToken,
  activeProvider,
  onOpenProviderModal,
  overview,
  isOnline = true,
  showVegetation,
  vegetation,
  isVegetationLoading,
  onToggleVegetation,
  isStudyPanelOpen,
  onToggleStudyPanel,
  showSunpath,
  sunMode,
  sunpath,
  radiationPoints,
  sunMarker,
  sunLight,
  focusRequest,
  onMapReady,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const sunpathLabelMarkersRef = useRef<Marker[]>([]);
  const markersRef = useRef<{ id: string; marker: Marker }[]>([]);
  const centerMarkerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentStyleId, setCurrentStyleId] = useState<string>('osm-standard');
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);

  // Store callbacks and mutable props in refs to avoid rebuilding the map
  const onSelectItemRef = useRef(onSelectItem);
  onSelectItemRef.current = onSelectItem;
  const onSelectDistrictRef = useRef(onSelectDistrict);
  onSelectDistrictRef.current = onSelectDistrict;
  const onUpdateSelectionCenterRef = useRef(onUpdateSelectionCenter);
  onUpdateSelectionCenterRef.current = onUpdateSelectionCenter;
  const onBuildingCountChangeRef = useRef(onBuildingCountChange);
  onBuildingCountChangeRef.current = onBuildingCountChange;
  const isPickCenterActiveRef = useRef(isPickCenterActive);
  isPickCenterActiveRef.current = isPickCenterActive;
  const show3DBuildingsRef = useRef(show3DBuildings);
  show3DBuildingsRef.current = show3DBuildings;
  const showAirQualityHeatmapRef = useRef(showAirQualityHeatmap);
  showAirQualityHeatmapRef.current = showAirQualityHeatmap;
  const airQualityRef = useRef(airQuality);
  airQualityRef.current = airQuality;
  const districtsRef = useRef(districts);
  districtsRef.current = districts;
  const selectionConfigRef = useRef(selectionConfig);
  selectionConfigRef.current = selectionConfig;
  const showVegetationRef = useRef(showVegetation);
  showVegetationRef.current = showVegetation;
  const vegetationRef = useRef(vegetation);
  vegetationRef.current = vegetation;
  const showSunpathRef = useRef(showSunpath);
  showSunpathRef.current = showSunpath;
  const sunpathRef = useRef(sunpath);
  sunpathRef.current = sunpath;
  const radiationPointsRef = useRef(radiationPoints);
  radiationPointsRef.current = radiationPoints;
  const sunMarkerRef = useRef(sunMarker);
  sunMarkerRef.current = sunMarker;
  const sunModeRef = useRef(sunMode);
  sunModeRef.current = sunMode;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const sunLightRef = useRef(sunLight);
  sunLightRef.current = sunLight;

  // Track last reported count to avoid infinite re-render cycles
  const lastReportedCountRef = useRef<number>(-1);

  // Calculate current bounding box for the selection sector (disc of radius radiusM)
  const currentBbox: BoundingBox = useMemo(() => {
    return computeBoundingBox(selectionConfig.center, selectionConfig.radiusM);
  }, [selectionConfig.center, selectionConfig.radiusM]);

  const currentBboxRef = useRef(currentBbox);
  currentBboxRef.current = currentBbox;

  // Add 3D building, air quality heatmap, and selection layers to the map
  const attachMapLayers = useCallback((map: MapLibreMap) => {
    const is3D = show3DBuildingsRef.current;
    const isBoxEnabled = selectionConfigRef.current.enabled;
    const bbox = currentBboxRef.current;
    const isHeatmapVisible = showAirQualityHeatmapRef.current;

    // 0. Air Quality Heat Map GeoJSON Source & Layer
    const aqGeoJson = generateAirQualityGeoJson(airQualityRef.current, districtsRef.current);
    if (!map.getSource('air-quality-heatmap-source')) {
      map.addSource('air-quality-heatmap-source', {
        type: 'geojson',
        data: aqGeoJson as any,
      });
    }

    if (!map.getLayer('air-quality-heatmap-layer')) {
      map.addLayer({
        id: 'air-quality-heatmap-layer',
        type: 'heatmap',
        source: 'air-quality-heatmap-source',
        layout: {
          visibility: isHeatmapVisible ? 'visible' : 'none',
        },
        paint: {
          // Increase heatmap weight based on AQI value
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'aqi'],
            0, 0.1,
            20, 0.3,
            40, 0.6,
            60, 0.85,
            100, 1.0,
          ],
          // Increase intensity as map zooms in
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 0.7,
            13, 1.3,
            16, 2.0,
          ],
          // European AQI color ramp:
          // Good (<=20: emerald) -> Moderate (<=40: teal) -> Degraded (<=60: amber) -> Poor (<=80: orange) -> Very Poor (<=100: red) -> Extremely Poor (>100: purple)
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(16, 185, 129, 0)',
            0.12, 'rgba(16, 185, 129, 0.45)', // emerald
            0.32, 'rgba(20, 184, 166, 0.62)', // teal
            0.55, 'rgba(245, 158, 11, 0.75)', // amber
            0.75, 'rgba(249, 115, 22, 0.85)', // orange
            0.90, 'rgba(239, 68, 68, 0.92)',  // red
            1.0, 'rgba(168, 85, 247, 0.96)',  // purple
          ],
          // Radius by zoom level
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11, 30,
            13, 60,
            15, 105,
            17, 180,
          ],
          'heatmap-opacity': isHeatmapVisible ? 0.78 : 0,
        },
      });
    }

    // 1. OpenStreetMap Vector 3D buildings layer
    if (map.getSource('osm-buildings-vector') && !map.getLayer('osm-real-3d-buildings')) {
      map.addLayer({
        id: 'osm-real-3d-buildings',
        type: 'fill-extrusion',
        source: 'osm-buildings-vector',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 10],
            0, '#e2e8f0',
            12, '#cbd5e1',
            25, '#94a3b8',
            45, '#64748b',
            80, '#0284c7',
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': is3D ? 0.88 : 0,
        },
      });

      // OSM Building popup on click
      map.on('click', 'osm-real-3d-buildings', (e: MapLayerMouseEvent) => {
        if (!e.features || !e.features[0]) return;
        const feat = e.features[0];
        const props = feat.properties || {};

        if (popupRef.current) popupRef.current.remove();

        const heightVal = props.render_height ? `${Math.round(props.render_height)} m` : 'Standard (R+2/3)';
        const nameVal = props.name || props['name:fr'] || 'Édifice OpenStreetMap';

        const popupContent = document.createElement('div');
        popupContent.className = 'p-3 bg-slate-900/98 backdrop-blur-md rounded-xl text-white text-xs border border-slate-700 shadow-2xl space-y-1.5 max-w-[240px]';
        popupContent.innerHTML = `
          <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            <span>Bâtiment réel OpenStreetMap</span>
          </div>
          <div class="font-bold text-sm text-white leading-tight">${nameVal}</div>
          <div class="grid grid-cols-2 gap-1.5 pt-1 text-[11px] border-t border-slate-800">
            <div>
              <span class="text-slate-400">Hauteur :</span>
              <strong class="text-amber-300 ml-1">${heightVal}</strong>
            </div>
            <div>
              <span class="text-slate-400">Source :</span>
              <strong class="text-slate-200 ml-1">OSM Vector</strong>
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: 'custom-atlas-popup',
        })
          .setLngLat(e.lngLat)
          .setDOMContent(popupContent)
          .addTo(map);

        popupRef.current = popup;
      });

      map.on('mouseenter', 'osm-real-3d-buildings', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'osm-real-3d-buildings', () => {
        map.getCanvas().style.cursor = isPickCenterActiveRef.current ? 'crosshair' : '';
      });
    }

    // 2. Mapbox composite 3D buildings layer
    if (map.getSource('composite') && !map.getLayer('3d-buildings-mapbox')) {
      const layers = map.getStyle().layers || [];
      const labelLayerId = layers.find(
        (l) => l.type === 'symbol' && l.layout && (l.layout as any)['text-field']
      )?.id;

      map.addLayer(
        {
          id: '3d-buildings-mapbox',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['get', 'height'],
              0, '#d1d5db',
              15, '#9ca3af',
              30, '#6b7280',
              60, '#374151',
              100, '#0284c7',
            ],
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.05,
              ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.05,
              ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': is3D ? 0.88 : 0,
          },
        },
        labelLayerId
      );

      // Mapbox 3D Building click interaction
      map.on('click', '3d-buildings-mapbox', (e: MapLayerMouseEvent) => {
        if (!e.features || !e.features[0]) return;
        const feat = e.features[0];
        const props = feat.properties || {};

        if (popupRef.current) popupRef.current.remove();

        const heightVal = props.height ? `${Math.round(props.height)} m` : 'R+2/3';
        const nameVal = props.name || 'Édifice Mapbox 3D';

        const popupContent = document.createElement('div');
        popupContent.className = 'p-3 bg-slate-900/98 backdrop-blur-md rounded-xl text-white text-xs border border-slate-700 shadow-2xl space-y-1.5 max-w-[240px]';
        popupContent.innerHTML = `
          <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <span>Bâti Mapbox Pro 3D</span>
          </div>
          <div class="font-bold text-sm text-white leading-tight">${nameVal}</div>
          <div class="grid grid-cols-2 gap-1.5 pt-1 text-[11px] border-t border-slate-800">
            <div>
              <span class="text-slate-400">Hauteur :</span>
              <strong class="text-amber-300 ml-1">${heightVal}</strong>
            </div>
            <div>
              <span class="text-slate-400">Source :</span>
              <strong class="text-slate-200 ml-1">Mapbox v8</strong>
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: 'custom-atlas-popup',
        })
          .setLngLat(e.lngLat)
          .setDOMContent(popupContent)
          .addTo(map);

        popupRef.current = popup;
      });

      map.on('mouseenter', '3d-buildings-mapbox', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', '3d-buildings-mapbox', () => {
        map.getCanvas().style.cursor = isPickCenterActiveRef.current ? 'crosshair' : '';
      });
    }

    // 3. Secteur d'étude circulaire (rayon max 250 m) : source & calques
    if (!map.getSource('selection-window-source')) {
      map.addSource('selection-window-source', {
        type: 'geojson',
        data: createGeoJsonCircle(selectionConfigRef.current.center, selectionConfigRef.current.radiusM),
      });
    }

    if (!map.getLayer('selection-window-fill')) {
      map.addLayer({
        id: 'selection-window-fill',
        type: 'fill',
        source: 'selection-window-source',
        paint: {
          'fill-color': '#38bdf8',
          'fill-opacity': isBoxEnabled ? 0.12 : 0,
        },
      });
    }

    if (!map.getLayer('selection-window-line')) {
      map.addLayer({
        id: 'selection-window-line',
        type: 'line',
        source: 'selection-window-source',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 2.5,
          'line-dasharray': [3, 2],
          'line-opacity': isBoxEnabled ? 0.85 : 0,
        },
      });
    }

    // 4. Végétation OpenStreetMap (calque optionnel)
    const vegVisibility = showVegetationRef.current ? 'visible' : 'none';
    if (!map.getSource('vegetation-source')) {
      map.addSource('vegetation-source', {
        type: 'geojson',
        data: (vegetationRef.current?.features ?? EMPTY_FC) as any,
      });
    }
    const vegColor: any = [
      'match', ['get', 'kind'],
      'park', '#4ade80',
      'grass', '#86efac',
      'scrub', '#65a30d',
      'wood', '#166534',
      'tree', '#16a34a',
      'crop', '#bef264',
      '#22c55e',
    ];
    // Les surfaces sont posées sous les bâtiments pour ne jamais les masquer
    const beforeBuildings = map.getLayer('osm-real-3d-buildings')
      ? 'osm-real-3d-buildings'
      : map.getLayer('3d-buildings-mapbox')
      ? '3d-buildings-mapbox'
      : undefined;
    if (!map.getLayer('vegetation-fill')) {
      map.addLayer(
        {
          id: 'vegetation-fill',
          type: 'fill',
          source: 'vegetation-source',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!', ['in', ['get', 'kind'], ['literal', ['wood', 'tree']]]]],
          layout: { visibility: vegVisibility },
          paint: { 'fill-color': vegColor, 'fill-opacity': 0.6 },
        },
        beforeBuildings
      );
    }
    if (!map.getLayer('vegetation-rows')) {
      map.addLayer(
        {
          id: 'vegetation-rows',
          type: 'line',
          source: 'vegetation-source',
          filter: ['==', ['get', 'kind'], 'tree_row'],
          layout: { visibility: vegVisibility, 'line-cap': 'round' },
          paint: {
            'line-color': '#22c55e',
            'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 8],
            'line-opacity': 0.85,
          },
        },
        beforeBuildings
      );
    }
    if (!map.getLayer('vegetation-extrusion')) {
      map.addLayer({
        id: 'vegetation-extrusion',
        type: 'fill-extrusion',
        source: 'vegetation-source',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['in', ['get', 'kind'], ['literal', ['wood', 'tree']]]],
        layout: { visibility: vegVisibility },
        paint: {
          'fill-extrusion-color': vegColor,
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'base'], 0],
          'fill-extrusion-opacity': 0.85,
        },
      });
    }

    // 5. Sunpath centré sur la zone : lignes, rayonnement EPW, position du soleil
    const sunVisibility = showSunpathRef.current && sunModeRef.current === '2d' ? 'visible' : 'none';
    if (!map.getSource('sunpath-source')) {
      map.addSource('sunpath-source', {
        type: 'geojson',
        data: (sunpathRef.current?.geojson ?? EMPTY_FC) as any,
      });
    }
    if (!map.getSource('sunpath-radiation-source')) {
      map.addSource('sunpath-radiation-source', {
        type: 'geojson',
        data: (radiationPointsRef.current ?? EMPTY_FC) as any,
      });
    }
    if (!map.getSource('sunpath-sun-source')) {
      map.addSource('sunpath-sun-source', {
        type: 'geojson',
        data: (sunMarkerRef.current ?? EMPTY_FC) as any,
      });
    }
    if (!map.getLayer('sunpath-guides')) {
      map.addLayer({
        id: 'sunpath-guides',
        type: 'line',
        source: 'sunpath-source',
        filter: ['in', ['get', 'kind'], ['literal', ['altitude', 'axis']]],
        layout: { visibility: sunVisibility },
        paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.4, 'line-dasharray': [2, 3] },
      });
    }
    if (!map.getLayer('sunpath-lines')) {
      map.addLayer({
        id: 'sunpath-lines',
        type: 'line',
        source: 'sunpath-source',
        filter: ['in', ['get', 'kind'], ['literal', ['horizon', 'day', 'hour']]],
        layout: { visibility: sunVisibility, 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'kind'],
            'horizon', '#ffffff',
            'day', ['case', ['==', ['get', 'solstice'], true], '#f59e0b', '#fcd34d'],
            'hour', '#7dd3fc',
            '#ffffff',
          ],
          'line-width': [
            'match', ['get', 'kind'],
            'horizon', 2.5,
            'day', ['case', ['==', ['get', 'solstice'], true], 2.8, 1.6],
            0.9,
          ],
          'line-opacity': ['match', ['get', 'kind'], 'hour', 0.7, 0.95],
        },
      });
    }
    if (!map.getLayer('sunpath-radiation')) {
      map.addLayer({
        id: 'sunpath-radiation',
        type: 'circle',
        source: 'sunpath-radiation-source',
        layout: { visibility: sunVisibility },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 1.4, 17, 3, 19, 5],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'value'],
            0, '#4f46e5',
            150, '#2dd4bf',
            400, '#fde047',
            700, '#f97316',
            950, '#ef4444',
          ],
          'circle-opacity': 0.85,
        },
      });
    }
    if (!map.getLayer('sunpath-sun-ray')) {
      map.addLayer({
        id: 'sunpath-sun-ray',
        type: 'line',
        source: 'sunpath-sun-source',
        filter: ['==', ['get', 'kind'], 'sun-ray'],
        layout: { visibility: sunVisibility },
        paint: { 'line-color': '#fde047', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
      });
    }
    if (!map.getLayer('sunpath-sun')) {
      map.addLayer({
        id: 'sunpath-sun',
        type: 'circle',
        source: 'sunpath-sun-source',
        filter: ['==', ['get', 'kind'], 'sun'],
        layout: { visibility: sunVisibility },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 6, 18, 11],
          'circle-color': '#fde047',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
    }

    // Éclairage 3D : suit le soleil quand la synchronisation est active
    applyMapLight(map, sunLightRef.current);
  }, []);

  // Compute building count safely and fire callback only on actual change
  const computeBuildingCount = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Bâtiments dont le centre est dans le disque d'étude, lus dans les tuiles chargées (indépendant de
    // l'inclinaison et de l'orientation de la caméra). Tant que les tuiles ne sont pas là, on garde la valeur précédente.
    let count = 0;
    try {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      const layer =
        layers.find((l) => l.id === 'osm-real-3d-buildings') ??
        layers.find((l) => l.id === '3d-buildings-mapbox') ??
        layers.find((l) => l['source-layer'] === 'building' && l.source);
      if (!layer?.source) return;
      const features = map.querySourceFeatures(layer.source, { sourceLayer: layer['source-layer'] });
      if (!features.length) return;
      const { center, radiusM } = selectionConfigRef.current;
      const seen = new Set<string>();
      for (const f of features) {
        const g: any = f.geometry;
        // Chaque emprise compte (les tuiles regroupent parfois plusieurs bâtiments sous un même identifiant)
        const polys: number[][][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
        for (const poly of polys) {
          const ring = poly?.[0];
          if (!ring?.length) continue;
          let sx = 0;
          let sy = 0;
          for (const c of ring) {
            sx += c[0];
            sy += c[1];
          }
          const cx = sx / ring.length;
          const cy = sy / ring.length;
          if (!isPointInsideCircle([cx, cy], center, radiusM)) continue;
          // La même emprise présente dans plusieurs tuiles chargées n'est comptée qu'une fois
          seen.add(`${f.id ?? ''}:${cx.toFixed(5)},${cy.toFixed(5)}`);
        }
      }
      count = seen.size;
    } catch {
      return;
    }

    if (count !== lastReportedCountRef.current) {
      lastReportedCountRef.current = count;
      onBuildingCountChangeRef.current(count);
    }
  }, []);

  // Sanitize style projections to prevent "unknown property name" warnings from Mapbox styles
  const sanitizeStyle = useCallback((previous: any, next: any) => {
    if (next && next.projection && typeof next.projection === 'object') {
      if (next.projection.name && !next.projection.type) {
        next.projection.type = next.projection.name;
      }
    }
    return next;
  }, []);

  // Initialize MapLibre ONCE on component mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let isDisposed = false;

    // Initial style selection (Pure OpenStreetMap by default, or Mapbox if token active)
    const initialStyle: StyleSpecification | string =
      activeProvider === 'mapbox' && mapboxToken
        ? MAPBOX_STYLES['mapbox-streets'].styleUrl(mapboxToken)
        : OSM_STYLES['osm-standard'].style;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: overview.center,
      zoom: overview.zoom,
      pitch: overview.pitch,
      bearing: overview.bearing,
      maxPitch: 75,
      // Lissage des bords : nécessaire pour que les lignes fines du sunpath ne soient pas crénelées
      canvasContextAttributes: { antialias: true },
      attributionControl: false,
      validateStyle: false,
      transformStyle: sanitizeStyle,
    } as any);

    // Suppress benign style validation warnings like unknown property "name"
    map.on('error', (e: any) => {
      const errMsg = e?.error?.message || e?.message || '';
      if (errMsg.includes('unknown property "name"')) {
        return;
      }
      console.warn('MapLibre notice:', errMsg || e);
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          activeProvider === 'mapbox' && mapboxToken
            ? '© Mapbox · © OpenStreetMap contributors'
            : '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      }),
      'bottom-right'
    );

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      }),
      'top-right'
    );

    map.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 120,
        unit: 'metric',
      }),
      'bottom-right'
    );

    map.on('load', () => {
      if (isDisposed) return;
      setMapLoaded(true);
      attachMapLayers(map);
      computeBuildingCount();
      onMapReadyRef.current?.(map);
    });

    map.on('style.load', () => {
      if (isDisposed) return;
      attachMapLayers(map);
      computeBuildingCount();
    });

    // « idle » : après chaque déplacement ET une fois les tuiles arrivées (le compte est alors complet)
    map.on('idle', () => {
      if (!isDisposed) {
        computeBuildingCount();
      }
    });

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (isPickCenterActiveRef.current) {
        onUpdateSelectionCenterRef.current([e.lngLat.lng, e.lngLat.lat]);
      }
    });

    const handleResize = () => map.resize();
    window.addEventListener('resize', handleResize);

    mapRef.current = map;

    return () => {
      isDisposed = true;
      window.removeEventListener('resize', handleResize);
      if (popupRef.current) popupRef.current.remove();
      if (centerMarkerRef.current) centerMarkerRef.current.remove();
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []); // Run ONCE on mount!

  // Update cursor when isPickCenterActive changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = isPickCenterActive ? 'crosshair' : '';
  }, [isPickCenterActive]);

  // Handle Map Style Switch smoothly without rebuilding map
  const handleChangeStyle = (styleId: string) => {
    const map = mapRef.current;
    if (!map) return;

    setCurrentStyleId(styleId);
    setIsStyleMenuOpen(false);

    if (OSM_STYLES[styleId]) {
      map.setStyle(OSM_STYLES[styleId].style, {
        validate: false,
        transformStyle: sanitizeStyle,
      } as any);
    } else if (MAPBOX_STYLES[styleId] && mapboxToken) {
      map.setStyle(MAPBOX_STYLES[styleId].styleUrl(mapboxToken), {
        validate: false,
        transformStyle: sanitizeStyle,
      } as any);
    }
  };

  // Sync Provider or Token change smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (activeProvider === 'mapbox' && mapboxToken) {
      setCurrentStyleId('mapbox-streets');
      map.setStyle(MAPBOX_STYLES['mapbox-streets'].styleUrl(mapboxToken), {
        validate: false,
        transformStyle: sanitizeStyle,
      } as any);
    } else {
      setCurrentStyleId('osm-standard');
      map.setStyle(OSM_STYLES['osm-standard'].style, {
        validate: false,
        transformStyle: sanitizeStyle,
      } as any);
    }
  }, [activeProvider, mapboxToken, mapLoaded, sanitizeStyle]);

  // Update Selection Window Geometry on map without re-renders
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('selection-window-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(createGeoJsonCircle(selectionConfig.center, selectionConfig.radiusM) as any);
    }

    if (map.getLayer('selection-window-fill')) {
      map.setPaintProperty('selection-window-fill', 'fill-opacity', selectionConfig.enabled ? 0.12 : 0);
    }
    if (map.getLayer('selection-window-line')) {
      map.setPaintProperty('selection-window-line', 'line-opacity', selectionConfig.enabled ? 0.85 : 0);
    }

    // Center marker pin
    if (selectionConfig.enabled) {
      if (!centerMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'w-6 h-6 rounded-full bg-sky-500/80 border-2 border-white flex items-center justify-center text-white shadow-lg pointer-events-none animate-pulse';
        el.innerHTML = '<span class="w-2 h-2 rounded-full bg-white"></span>';

        centerMarkerRef.current = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat(selectionConfig.center)
          .addTo(map);
      } else {
        centerMarkerRef.current.setLngLat(selectionConfig.center);
      }
    } else {
      if (centerMarkerRef.current) {
        centerMarkerRef.current.remove();
        centerMarkerRef.current = null;
      }
    }

    computeBuildingCount();
  }, [currentBbox, selectionConfig.enabled, selectionConfig.center, selectionConfig.radiusM, mapLoaded, computeBuildingCount]);

  // --- Calque végétation : données et visibilité ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('vegetation-source') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData((vegetation?.features ?? EMPTY_FC) as any);
    const visibility = showVegetation ? 'visible' : 'none';
    ['vegetation-fill', 'vegetation-rows', 'vegetation-extrusion'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
    });
  }, [vegetation, showVegetation, mapLoaded]);

  // --- Sunpath : géométrie, rayonnement EPW, repère du soleil, étiquettes ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const set = (id: string, data: GeoJSON.FeatureCollection | null | undefined) => {
      const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData((data ?? EMPTY_FC) as any);
    };
    set('sunpath-source', sunpath?.geojson);
    set('sunpath-radiation-source', radiationPoints);
    set('sunpath-sun-source', sunMarker);
    // Le diagramme posé au sol (2D) est géré ici ; le dôme 3D est un calque WebGL géré hors de ce composant
    const vis2d = showSunpath && sunMode === '2d' ? 'visible' : 'none';
    ['sunpath-guides', 'sunpath-lines', 'sunpath-radiation', 'sunpath-sun-ray', 'sunpath-sun'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis2d);
    });
  }, [sunpath, radiationPoints, sunMarker, showSunpath, sunMode, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    sunpathLabelMarkersRef.current.forEach((m) => m.remove());
    sunpathLabelMarkersRef.current = [];
    if (!map || !mapLoaded || !showSunpath || !sunpath) return;
    sunpath.labels.forEach((label) => {
      // En 3D, une étiquette d'heure ne peut pas être posée à son altitude sur le dôme : on garde les points cardinaux
      if (sunMode === '3d' && label.kind !== 'cardinal') return;
      const el = document.createElement('div');
      el.className = 'pointer-events-none select-none font-bold';
      el.textContent = label.text;
      if (label.kind === 'cardinal') {
        el.style.cssText = 'color:#fff;font-size:13px;text-shadow:0 0 4px #0f172a,0 0 2px #0f172a;';
      } else {
        el.style.cssText = 'color:#e0f2fe;font-size:9px;font-weight:600;text-shadow:0 0 3px #0f172a,0 0 2px #0f172a;';
      }
      sunpathLabelMarkersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(label.lngLat).addTo(map)
      );
    });
    return () => {
      sunpathLabelMarkersRef.current.forEach((m) => m.remove());
      sunpathLabelMarkersRef.current = [];
    };
  }, [sunpath, showSunpath, sunMode, mapLoaded]);

  // --- Éclairage 3D synchronisé avec le soleil ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    applyMapLight(map, sunLight);
  }, [sunLight, mapLoaded]);

  // --- Déplacement de la caméra à la demande (saisie GPS, cadrage du secteur) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest) return;
    map.flyTo({
      center: focusRequest.center,
      zoom: focusRequest.zoom ?? 16.9,
      pitch: focusRequest.pitch ?? map.getPitch(),
      bearing: focusRequest.bearing ?? map.getBearing(),
      essential: true,
      duration: 1400,
    });
  }, [focusRequest?.nonce]);

  // Handle 3D buildings visibility toggle safely
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const targetOpacity = show3DBuildings ? 0.88 : 0;
    const targetVisibility = show3DBuildings ? 'visible' : 'none';

    if (map.getLayer('osm-real-3d-buildings')) {
      map.setPaintProperty('osm-real-3d-buildings', 'fill-extrusion-opacity', targetOpacity);
      map.setLayoutProperty('osm-real-3d-buildings', 'visibility', targetVisibility);
    }
    if (map.getLayer('3d-buildings-mapbox')) {
      map.setPaintProperty('3d-buildings-mapbox', 'fill-extrusion-opacity', targetOpacity);
      map.setLayoutProperty('3d-buildings-mapbox', 'visibility', targetVisibility);
    }
  }, [show3DBuildings, mapLoaded]);

  // Handle Air Quality Heatmap Layer visibility, opacity & data updates smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    showAirQualityHeatmapRef.current = showAirQualityHeatmap;
    airQualityRef.current = airQuality;

    const source = map.getSource('air-quality-heatmap-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(generateAirQualityGeoJson(airQuality, districts) as any);
    }

    if (map.getLayer('air-quality-heatmap-layer')) {
      const targetVisibility = showAirQualityHeatmap ? 'visible' : 'none';
      const targetOpacity = showAirQualityHeatmap ? 0.78 : 0;
      map.setLayoutProperty('air-quality-heatmap-layer', 'visibility', targetVisibility);
      map.setPaintProperty('air-quality-heatmap-layer', 'heatmap-opacity', targetOpacity);
    } else if (showAirQualityHeatmap) {
      // Re-attach if layer was missing
      attachMapLayers(map);
    }
  }, [showAirQualityHeatmap, airQuality, districts, mapLoaded, attachMapLayers]);

  // Create custom marker DOM element
  const createMarkerElement = useCallback((item: AtlasItem, isSelected: boolean) => {
    const el = document.createElement('div');
    el.className = 'cursor-pointer transform-gpu transition-all duration-300 hover:scale-115 group';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${item.type === 'project' ? 'Projet' : 'Lieu'} : ${item.name}`);

    const isProject = item.type === 'project';

    el.innerHTML = `
      <div class="relative flex items-center justify-center">
        ${isSelected ? `<div class="absolute -inset-2 rounded-full animate-ping opacity-40 ${isProject ? 'bg-amber-400' : 'bg-indigo-400'}"></div>` : ''}
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full shadow-lg border-2 transition-all ${
          isSelected
            ? isProject
              ? 'bg-amber-500 border-white text-slate-950 ring-4 ring-amber-400/40 scale-110'
              : 'bg-indigo-600 border-white text-white ring-4 ring-indigo-400/40 scale-110'
            : isProject
              ? 'bg-amber-500/90 hover:bg-amber-400 border-amber-200 text-slate-950'
              : 'bg-indigo-600/90 hover:bg-indigo-500 border-indigo-200 text-white'
        }">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
            ${
              isProject
                ? '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 2h2v4h-2V5zm-4 0h2v4H8V5zm8 14H8v-2h8v2zm0-4H8v-2h8v2zm0-4H8V9h8v2z"/>'
                : '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>'
            }
          </svg>
        </div>
        <div class="absolute -bottom-1 w-2 h-2 rotate-45 ${
          isSelected
            ? isProject ? 'bg-amber-500' : 'bg-indigo-600'
            : isProject ? 'bg-amber-500/90' : 'bg-indigo-600/90'
        }"></div>
      </div>
    `;

    return el;
  }, []);

  // Update Markers when items or activeFilter change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current = [];

    const filteredItems = items.filter((item) => {
      if (activeFilter === 'all') return true;
      return item.type === activeFilter;
    });

    filteredItems.forEach((item) => {
      const isSelected = selectedItem?.id === item.id;
      const el = createMarkerElement(item, isSelected);

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat(item.coordinates)
        .addTo(map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectItemRef.current(item);
      });

      el.addEventListener('mouseenter', () => {
        if (popupRef.current) popupRef.current.remove();

        const popupNode = document.createElement('div');
        popupNode.className = 'p-3 bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-slate-700/80 max-w-[240px] pointer-events-auto';
        popupNode.innerHTML = `
          <div class="flex items-center gap-1.5 mb-1 text-[11px] font-medium uppercase tracking-wider ${
            item.type === 'project' ? 'text-amber-400' : 'text-indigo-400'
          }">
            <span>${item.type === 'project' ? 'Projet urbain' : 'Lieu d\'intérêt'}</span>
            <span>·</span>
            <span class="text-slate-400">${item.category}</span>
          </div>
          <div class="font-semibold text-sm leading-tight text-white mb-1.5">${item.name}</div>
          <p class="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-2">${item.shortDescription}</p>
          <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px] text-slate-400">
            <span>${item.status}</span>
            <span class="text-indigo-300 font-medium hover:underline">Fiche &rarr;</span>
          </div>
        `;

        popupNode.addEventListener('click', () => {
          onSelectItemRef.current(item);
        });

        const popup = new maplibregl.Popup({
          offset: [0, -38],
          closeButton: false,
          closeOnClick: true,
          className: 'custom-atlas-popup',
        })
          .setLngLat(item.coordinates)
          .setDOMContent(popupNode)
          .addTo(map);

        popupRef.current = popup;
      });

      markersRef.current.push({ id: item.id, marker });
    });
  }, [items, activeFilter, selectedItem, mapLoaded, createMarkerElement]);

  // Camera flyTo when selectedItem changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedItem) return;

    map.flyTo({
      center: selectedItem.coordinates,
      zoom: 16.5,
      pitch: 58,
      bearing: -15,
      essential: true,
      duration: 1600,
    });
  }, [selectedItem]);

  // Camera flyTo when selectedDistrictId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDistrictId) return;

    const district = districts.find((d) => d.id === selectedDistrictId);
    if (!district) return;

    map.flyTo({
      center: district.center,
      zoom: district.zoom,
      pitch: district.pitch,
      bearing: district.bearing,
      essential: true,
      duration: 1600,
    });
  }, [selectedDistrictId, districts]);

  const handleResetOverview = () => {
    const map = mapRef.current;
    if (!map) return;
    onSelectDistrictRef.current(null);
    map.flyTo({
      center: overview.center,
      zoom: overview.zoom,
      pitch: overview.pitch,
      bearing: overview.bearing,
      essential: true,
      duration: 1400,
    });
  };

  return (
    <div className="absolute inset-0 w-full h-full select-none overflow-hidden">
      {/* MapLibre WebGL container */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full bg-slate-950" />

      {/* Floating Map Actions (Top Right) - Compact & responsive to avoid collisions */}
      <div className="absolute top-4 right-14 z-10 flex items-center gap-1 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700/80 p-1 shadow-2xl">
        {/* Provider / API Key Settings Button */}
        <button
          onClick={onOpenProviderModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 ${
            activeProvider === 'mapbox' && mapboxToken
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              : 'text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
          title="Gérer les moteurs 2D/3D (OpenStreetMap ou clé API Mapbox)"
        >
          {activeProvider === 'mapbox' && mapboxToken ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline">Mapbox 3D</span>
            </>
          ) : (
            <>
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xl:inline">OSM</span>
            </>
          )}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        {/* Style Switcher Menu */}
        <div className="relative">
          <button
            onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-medium rounded-lg transition-all active:scale-95"
            title="Changer le style de la carte"
          >
            <MapIcon className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden xl:inline">
              {OSM_STYLES[currentStyleId]?.shortLabel ||
                MAPBOX_STYLES[currentStyleId]?.shortLabel ||
                'Style'}
            </span>
          </button>

          {isStyleMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 bg-slate-900/98 backdrop-blur-xl border border-slate-700/90 rounded-xl shadow-2xl p-1.5 z-40 space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                <span>Fonds OpenStreetMap</span>
                <span className="text-emerald-400 text-[9px] font-normal">Sans clé</span>
              </div>
              {Object.entries(OSM_STYLES).map(([id, info]) => (
                <button
                  key={id}
                  onClick={() => handleChangeStyle(id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    currentStyleId === id
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{info.label}</span>
                  {currentStyleId === id && <span className="text-[11px]">✓</span>}
                </button>
              ))}

              {/* Mapbox section */}
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-t border-slate-800 flex items-center justify-between mt-1 pt-1.5">
                <span>Fonds Mapbox Pro</span>
                {mapboxToken ? (
                  <span className="text-amber-400 text-[9px] font-normal">Clé active</span>
                ) : (
                  <span className="text-slate-500 text-[9px] font-normal">Clé requise</span>
                )}
              </div>

              {mapboxToken ? (
                Object.entries(MAPBOX_STYLES).map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => handleChangeStyle(id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                      currentStyleId === id
                        ? 'bg-amber-600 text-white font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{info.label}</span>
                    {currentStyleId === id && <span className="text-[11px]">✓</span>}
                  </button>
                ))
              ) : (
                <button
                  onClick={() => {
                    setIsStyleMenuOpen(false);
                    onOpenProviderModal();
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium flex items-center gap-1.5 border border-amber-500/20"
                >
                  <Key className="w-3.5 h-3.5 shrink-0" />
                  <span>Entrer une clé Mapbox...</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Overview button */}
        <button
          onClick={handleResetOverview}
          className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-medium rounded-lg transition-all active:scale-95"
          title="Recentrer sur l'ensemble de l'île de Nantes"
          aria-label="Vue d'ensemble de l'île de Nantes"
        >
          <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden xl:inline">Recentrer</span>
        </button>

        {/* Air Quality Heatmap toggle button */}
        {onToggleAirQualityHeatmap && (
          <button
            onClick={onToggleAirQualityHeatmap}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all active:scale-95 ${
              showAirQualityHeatmap
                ? 'bg-emerald-600 text-white shadow-emerald-500/20 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Activer ou désactiver la carte thermique de la qualité de l'air"
            aria-label="Basculer la heatmap qualité de l'air"
          >
            <Wind className="w-3.5 h-3.5 text-emerald-300" />
            <span className="hidden xl:inline">Heatmap</span>
          </button>
        )}

        {/* Vegetation layer toggle (OpenStreetMap) */}
        <button
          onClick={onToggleVegetation}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all active:scale-95 ${
            showVegetation
              ? 'bg-green-700 text-white shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title={
            showVegetation && isVegetationLoading
              ? 'Chargement de la végétation OpenStreetMap… (jusqu\'à une minute)'
              : 'Afficher la végétation OpenStreetMap du secteur (arbres, parcs, pelouses)'
          }
          aria-label="Basculer le calque de végétation"
          aria-pressed={showVegetation}
          aria-busy={showVegetation && isVegetationLoading}
        >
          <Trees className={`w-3.5 h-3.5 text-green-300 ${showVegetation && isVegetationLoading ? 'animate-pulse' : ''}`} />
          <span className="hidden xl:inline">Végétation</span>
        </button>

        {/* Climate study panel (EPW, sunpath) */}
        <button
          onClick={onToggleStudyPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all active:scale-95 ${
            isStudyPanelOpen
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="Étude climatique : fichier EPW, sunpath, exports"
          aria-label="Ouvrir le panneau d'étude climatique"
          aria-pressed={isStudyPanelOpen}
        >
          <Sun className="w-3.5 h-3.5 text-amber-300" />
          <span className="hidden xl:inline">Étude</span>
        </button>

        {/* 3D toggle button */}
        <button
          onClick={onToggle3D}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all active:scale-95 ${
            show3DBuildings
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="Activer ou masquer l'extrusion 3D des bâtiments réels"
          aria-label="Basculer l'extrusion 3D des bâtiments"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">3D</span>
        </button>
      </div>

      {/* Floating Air Quality Heatmap Legend (when heatmap overlay is active) */}
      {showAirQualityHeatmap && (
        <div className="absolute top-16 right-14 z-20 w-72 max-w-[calc(100vw-4rem)] bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/90 p-3 shadow-2xl text-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-emerald-500/20 text-emerald-400">
                <Wind className="w-3.5 h-3.5" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-white leading-tight">Heatmap Qualité de l'Air</h4>
                <p className="text-[10px] text-slate-400">Indice européen EAQI (CAMS)</p>
              </div>
            </div>
            {onToggleAirQualityHeatmap && (
              <button
                onClick={onToggleAirQualityHeatmap}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors text-xs font-medium"
                title="Masquer la surcouche"
                aria-label="Fermer la légende"
              >
                ✕
              </button>
            )}
          </div>

          {airQuality?.europeanAqi != null && (
            <div className="py-2 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Niveau global :</span>
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                EAQI {airQuality.europeanAqi} ({airQuality.aqiBand.label})
              </span>
            </div>
          )}

          {/* Color Gradient Scale */}
          <div className="space-y-1 pt-1">
            <div className="h-2 rounded-full w-full bg-gradient-to-r from-emerald-500 via-teal-400 via-amber-400 via-orange-500 via-rose-500 to-purple-600 shadow-inner" />
            <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
              <span>0 (Bon)</span>
              <span>40</span>
              <span>60</span>
              <span>80</span>
              <span>100+</span>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span>Bâti 3D en surélévation</span>
            <span className="text-emerald-400 font-medium">Temps réel</span>
          </div>
        </div>
      )}

      {/* Crosshair notice when picking center */}
      {isPickCenterActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-amber-500 text-slate-950 px-4 py-2 rounded-full font-bold text-xs shadow-2xl border-2 border-white animate-bounce">
          🎯 Cliquez n'importe où sur la carte pour positionner le centre du secteur (rayon 250 m)
        </div>
      )}

      {/* Active Data Source indicator bottom center */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 hidden sm:flex items-center gap-2 text-[11px] text-slate-300/90 bg-slate-950/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800 shadow-lg pointer-events-none">
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        <span>
          {isOnline
            ? (activeProvider === 'mapbox' && mapboxToken
                ? 'Données Mapbox Pro 3D actives · Flux en direct'
                : 'Données réelles OpenStreetMap actives · Flux en direct')
            : 'Mode hors-ligne · Données vectorielles et cartographiques de base chargées localement'}
        </span>
      </div>
    </div>
  );
};
