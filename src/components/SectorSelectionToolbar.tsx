import React, { useEffect, useState } from 'react';
import { SectorPreset, SelectionWindowConfig } from '../types/atlas';
import { MAX_RADIUS_M, MIN_RADIUS_M, clampRadius, formatGps, parseGpsInput } from '../utils/geoUtils';
import {
  Box,
  Crosshair,
  Maximize,
  Eye,
  MousePointerClick,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const SECTOR_PRESETS: SectorPreset[] = [
  {
    id: 'secteur-ouest',
    name: 'Secteur Ouest (Machines & Chantiers)',
    subtitle: 'Nefs Dubigeon, Parc des Chantiers & ENSA',
    center: [-1.5650, 47.2060],
    radiusM: 250,
    zoom: 16.9,
    pitch: 58,
    bearing: -22,
    description: 'Secteur de rayon 250 m centré sur le grand pôle culturel des Nefs et les friches reconverties.',
  },
  {
    id: 'secteur-centre',
    name: 'Secteur Centre (République & Création)',
    subtitle: 'Halles Alstom, Beaux-Arts & Prairie-au-Duc',
    center: [-1.5520, 47.2050],
    radiusM: 250,
    zoom: 16.9,
    pitch: 56,
    bearing: -12,
    description: 'Secteur de rayon 250 m englobant le cœur habité et les îlots résidentiels bas carbone.',
  },
  {
    id: 'secteur-est',
    name: 'Secteur Est (Beaulieu & Tripode)',
    subtitle: 'Conservatoire, Centre Beaulieu & Berges Est',
    center: [-1.5330, 47.2095],
    radiusM: 250,
    zoom: 16.9,
    pitch: 54,
    bearing: -30,
    description: 'Secteur de rayon 250 m sur les tours tertiaires, les équipements métropolitains et la Loire amont.',
  },
  {
    id: 'secteur-chu',
    name: 'Secteur Sud (Grand CHU & Rives Sud)',
    subtitle: 'Chantier hospitalier 10 ha & bras de Pirmil',
    center: [-1.5560, 47.2015],
    radiusM: 250,
    zoom: 16.9,
    pitch: 60,
    bearing: 15,
    description: 'Secteur de rayon 250 m sur le plus grand complexe hospitalier en construction de France.',
  },
  {
    id: 'secteur-pointe-ouest',
    name: 'Secteur Pointe Ouest (Hangar à Bananes)',
    subtitle: 'Quai des Antilles, Anneaux Buren & Estuaire',
    center: [-1.5740, 47.2008],
    radiusM: 250,
    zoom: 16.9,
    pitch: 62,
    bearing: 42,
    description: 'Secteur de rayon 250 m sur la proue maritime et l\'ouverture sur l\'estuaire ligérien.',
  },
];

interface SectorSelectionToolbarProps {
  config: SelectionWindowConfig;
  buildingsInSectorCount: number;
  isPickCenterActive: boolean;
  onChangeConfig: (newConfig: Partial<SelectionWindowConfig>) => void;
  onSelectPreset: (preset: SectorPreset) => void;
  onTogglePickCenter: () => void;
  onFitToSector: () => void;
  /** Nouveau centre saisi en coordonnées GPS ([lng, lat]) */
  onSetCenterFromGps: (center: [number, number]) => void;
}

export const SectorSelectionToolbar: React.FC<SectorSelectionToolbarProps> = ({
  config,
  buildingsInSectorCount,
  isPickCenterActive,
  onChangeConfig,
  onSelectPreset,
  onTogglePickCenter,
  onFitToSector,
  onSetCenterFromGps,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [gpsText, setGpsText] = useState(() => formatGps(config.center));
  const [gpsError, setGpsError] = useState(false);

  // Garde le champ GPS synchronisé quand le centre change (clic sur la carte, présélection...)
  useEffect(() => {
    setGpsText(formatGps(config.center));
    setGpsError(false);
  }, [config.center]);

  const submitGps = () => {
    const parsed = parseGpsInput(gpsText);
    if (!parsed) {
      setGpsError(true);
      return;
    }
    setGpsError(false);
    onSetCenterFromGps(parsed);
  };

  // If collapsed, display a sleek minimal badge that never overlaps side menus
  if (isCollapsed) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/95 hover:bg-slate-800 backdrop-blur-md rounded-xl border border-slate-700/80 hover:border-slate-600 shadow-2xl text-xs font-semibold text-slate-100 transition-all hover:scale-102 group active:scale-95"
          title="Déplier les outils du secteur d'étude 3D (rayon 250 m)"
        >
          <Box className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-12 transition-transform" />
          <span>
            Secteur 3D{' '}
            {config.enabled
              ? `(R ${Math.round(config.radiusM)} m · ${buildingsInSectorCount} bâtis)`
              : '(Désactivé)'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[94vw] sm:w-auto max-w-lg lg:max-w-xl bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl p-2 sm:px-3 sm:py-2.5 text-slate-100 transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Toggle Window & Title */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onChangeConfig({ enabled: !config.enabled })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
              config.enabled
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
            }`}
            title="Activer le secteur d'étude circulaire (rayon 250 m maximum)"
          >
            <Box className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Secteur 3D</span>
            <span>{config.enabled ? 'Actif' : 'Off'}</span>
          </button>

          {/* Quick preset selector */}
          <div className="relative">
            <select
              disabled={!config.enabled}
              onChange={(e) => {
                const preset = SECTOR_PRESETS.find((p) => p.id === e.target.value);
                if (preset) onSelectPreset(preset);
                e.target.value = '';
              }}
              className="appearance-none bg-slate-800/90 border border-slate-700 hover:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-medium disabled:opacity-50 cursor-pointer pr-6 focus:outline-none focus:ring-1 focus:ring-indigo-250 max-w-[150px] sm:max-w-[190px] truncate"
              defaultValue=""
            >
              <option value="" disabled>
                Secteurs (R 250 m)...
              </option>
              {SECTOR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[9px]">
              ▼
            </div>
          </div>
        </div>

        {/* Action Controls when enabled */}
        {config.enabled && (
          <div className="flex items-center gap-1.5">
            {/* Pick center on map toggle button */}
            <button
              onClick={onTogglePickCenter}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                isPickCenterActive
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-300 animate-pulse'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Cliquer sur la carte pour repositionner le centre"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {isPickCenterActive ? 'Cible...' : 'Déplacer'}
              </span>
            </button>

            {/* Fit 3D Camera button */}
            <button
              onClick={onFitToSector}
              className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition-colors"
              title="Recentrer et incliner la vue 3D sur le secteur sélectionné"
            >
              <Maximize className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">Cadrer</span>
            </button>

            {/* Isolate buildings toggle */}
            <button
              onClick={() => onChangeConfig({ isolateBuildings: !config.isolateBuildings })}
              className={`p-1.5 rounded-xl border transition-all text-xs flex items-center gap-1 ${
                config.isolateBuildings
                  ? 'bg-purple-600/90 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={
                config.isolateBuildings
                  ? "Afficher tous les volumes de l'île"
                  : "Isoler uniquement les volumes à l'intérieur du secteur"
              }
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Collapse toggle button */}
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors ml-auto"
          title="Replier la barre de secteur"
          aria-label="Replier la barre"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded status bar when enabled */}
      {config.enabled && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 space-y-1.5">
          {/* Centre du secteur en coordonnées GPS */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitGps();
            }}
            className="flex items-center gap-1.5"
          >
            <label htmlFor="sector-gps" className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
              <Crosshair className="w-3 h-3 text-sky-400" />
              Centre GPS
            </label>
            <input
              id="sector-gps"
              type="text"
              inputMode="decimal"
              value={gpsText}
              onChange={(e) => {
                setGpsText(e.target.value);
                setGpsError(false);
              }}
              placeholder="lat, lon  (ex. 47.2058, -1.5530)"
              aria-invalid={gpsError}
              className={`flex-1 min-w-0 bg-slate-800/90 border rounded-lg px-2 py-1 text-[11px] font-mono text-slate-100 focus:outline-none focus:ring-1 ${
                gpsError
                  ? 'border-rose-500 focus:ring-rose-500'
                  : 'border-slate-700 focus:ring-indigo-500'
              }`}
            />
            <button
              type="submit"
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/60 transition-colors"
              title="Centrer le secteur sur ces coordonnées"
            >
              Aller
            </button>
          </form>
          {gpsError && (
            <p className="text-[10px] text-rose-400">
              Format attendu : latitude, longitude en degrés décimaux (ex. 47.2058, -1.5530).
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-1.5">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
              <span className="font-semibold text-indigo-300">
                Rayon {Math.round(config.radiusM)} m
              </span>
              <span>·</span>
              <span>
                Bâtis : <strong className="text-white">{buildingsInSectorCount}</strong>
              </span>
            </div>

            {/* Radius slider, max 250 m */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[10px]">Rayon :</span>
              <input
                type="range"
                min={MIN_RADIUS_M}
                max={MAX_RADIUS_M}
                step="25"
                value={config.radiusM}
                onChange={(e) => onChangeConfig({ radiusM: clampRadius(parseFloat(e.target.value)) })}
                className="w-16 sm:w-20 accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                title="Ajuster le rayon du secteur (250 m maximum)"
                aria-label="Rayon du secteur en mètres"
              />
              <span className="font-mono text-[10px] text-white min-w-[40px]">
                {Math.round(config.radiusM)} m
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
