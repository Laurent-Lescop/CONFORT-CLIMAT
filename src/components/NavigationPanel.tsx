import React, { useState } from 'react';
import { District, AirQualityData } from '../types/atlas';
import { MapPin, Building2, Landmark, Compass, ChevronDown, Sparkles, Filter, Info, Globe, Key, Wind, Activity, Video } from 'lucide-react';

interface NavigationPanelProps {
  districts: District[];
  selectedDistrictId: string | null;
  activeFilter: 'all' | 'poi' | 'project';
  totalPoisCount: number;
  totalProjectsCount: number;
  activeProvider: 'osm' | 'mapbox';
  showAirQualityHeatmap: boolean;
  airQuality?: AirQualityData | null;
  isOnline?: boolean;
  onToggleAirQualityHeatmap: () => void;
  onSelectDistrict: (id: string | null) => void;
  onSelectFilter: (filter: 'all' | 'poi' | 'project') => void;
  onOpenAiModal: () => void;
  onOpenProviderModal: () => void;
  onOpenDemoTour: () => void;
}

export const NavigationPanel: React.FC<NavigationPanelProps> = ({
  districts,
  selectedDistrictId,
  activeFilter,
  totalPoisCount,
  totalProjectsCount,
  activeProvider,
  showAirQualityHeatmap,
  airQuality,
  isOnline = true,
  onToggleAirQualityHeatmap,
  onSelectDistrict,
  onSelectFilter,
  onOpenAiModal,
  onOpenProviderModal,
  onOpenDemoTour,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const currentDistrict = districts.find((d) => d.id === selectedDistrictId);

  return (
    <div className="absolute top-4 left-4 z-20 w-80 sm:w-88 max-w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl text-slate-100 overflow-hidden transition-all duration-300">
      {/* Header with Title and collapse toggle */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-indigo-500 animate-pulse' : 'bg-amber-500'}`} />
              <h1 className="font-bold text-base tracking-tight text-white">
                Atlas Île de Nantes
              </h1>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isOnline
                    ? 'bg-emerald-950/70 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-950/70 text-amber-300 border-amber-500/30'
                }`}
                title={isOnline ? 'Mode En ligne (données temps réel)' : 'Mode Hors-ligne (données de base locales)'}
              >
                {isOnline ? 'En ligne' : 'Hors-ligne'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Territoire insulaire, projets urbains & environnement
            </p>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isCollapsed ? 'Déplier le panneau' : 'Replier le panneau'}
            aria-expanded={!isCollapsed}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 space-y-3.5">
          {/* District Selector */}
          <div>
            <label htmlFor="district-select" className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Quartiers de l'île
            </label>
            <div className="relative">
              <select
                id="district-select"
                value={selectedDistrictId || ''}
                onChange={(e) => onSelectDistrict(e.target.value || null)}
                className="w-full appearance-none bg-slate-800/90 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-8 cursor-pointer transition-colors"
              >
                <option value="">Tous les quartiers (Vue globale)</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>

            {currentDistrict && (
              <p className="mt-1.5 text-[11px] text-slate-300 leading-snug bg-slate-800/40 p-2 rounded-lg border border-slate-800">
                <span className="font-semibold text-indigo-300">{currentDistrict.subtitle}</span> — {currentDistrict.description}
              </p>
            )}
          </div>

          {/* Filter segment tabs */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              <span>Filtres de consultation</span>
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
              <button
                onClick={() => onSelectFilter('all')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
                  activeFilter === 'all'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tous ({totalPoisCount + totalProjectsCount})
              </button>
              <button
                onClick={() => onSelectFilter('poi')}
                className={`py-1.5 px-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                  activeFilter === 'poi'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-indigo-300'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>Lieux ({totalPoisCount})</span>
              </button>
              <button
                onClick={() => onSelectFilter('project')}
                className={`py-1.5 px-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                  activeFilter === 'project'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Projets ({totalProjectsCount})</span>
              </button>
            </div>
          </div>

          {/* Air Quality Index Heat Map Overlay Toggle */}
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 transition-all hover:border-slate-700/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                    showAirQualityHeatmap
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                  }`}
                >
                  <Wind className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">
                      Heatmap Qualité de l'Air
                    </span>
                    {showAirQualityHeatmap && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    {airQuality?.europeanAqi != null ? (
                      <>
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                            airQuality.europeanAqi <= 20
                              ? 'bg-emerald-400'
                              : airQuality.europeanAqi <= 40
                              ? 'bg-teal-400'
                              : airQuality.europeanAqi <= 60
                              ? 'bg-amber-400'
                              : airQuality.europeanAqi <= 80
                              ? 'bg-orange-400'
                              : 'bg-rose-400'
                          }`}
                        />
                        <span className="truncate font-medium text-slate-300">
                          EAQI {airQuality.europeanAqi} · {airQuality.aqiBand.label}
                        </span>
                      </>
                    ) : (
                      <span>Surcouche 3D indice EAQI</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Toggle switch button */}
              <button
                type="button"
                role="switch"
                aria-checked={showAirQualityHeatmap}
                onClick={onToggleAirQualityHeatmap}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                  showAirQualityHeatmap ? 'bg-emerald-500 shadow-emerald-500/30 shadow-md' : 'bg-slate-700'
                }`}
                title={
                  showAirQualityHeatmap
                    ? "Désactiver la carte thermique de la qualité de l'air"
                    : "Activer la carte thermique de la qualité de l'air sur le modèle 3D"
                }
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    showAirQualityHeatmap ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {showAirQualityHeatmap && (
              <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Gradient dispersion actif
                </span>
                <span className="text-slate-500">Modèle CAMS</span>
              </div>
            )}
          </div>

          {/* Assistant & Explorateur IA button */}
          <div className="pt-1">
            <button
              onClick={onOpenAiModal}
              className="w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900 border border-indigo-500/30 hover:border-indigo-500/60 rounded-xl text-xs font-medium text-indigo-200 hover:text-white transition-all group"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400 group-hover:rotate-12 transition-transform" />
                <span>Explorer avec l'Intelligence Urbaine</span>
              </div>
              <span className="text-[10px] bg-indigo-900/60 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-700/50">
                Recherche directe
              </span>
            </button>
          </div>

          {/* Mode Démo Réseaux Sociaux / Visite Guidée Automatique */}
          <div>
            <button
              onClick={onOpenDemoTour}
              className="w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-rose-950/70 via-purple-950/50 to-slate-900 border border-rose-500/40 hover:border-rose-500/80 rounded-xl text-xs font-medium text-rose-200 hover:text-white transition-all group shadow-sm hover:shadow-rose-500/20"
              title="Lancer la visite guidée 3D automatisée pour filmer ou présenter l'application"
            >
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                <span>Visite Démo Réseaux Sociaux</span>
              </div>
              <span className="text-[10px] bg-rose-900/70 text-rose-300 px-1.5 py-0.5 rounded-full border border-rose-700/60 flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                <span>Visite 3D</span>
              </span>
            </button>
          </div>

          {/* Map Engine & API Key settings shortcut */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Fond & Bâti 3D :</span>
            <button
              onClick={onOpenProviderModal}
              className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 hover:underline"
              title="Configurer OpenStreetMap ou Mapbox"
            >
              <Globe className="w-3 h-3 text-emerald-400" />
              <span>{activeProvider === 'mapbox' ? 'Mapbox Pro 3D' : 'OpenStreetMap (Libre)'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
