import React, { useState } from 'react';
import { WeatherData, AirQualityData } from '../types/atlas';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  Wind,
  Compass,
  Sunrise,
  Sunset,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

interface ClimatePanelProps {
  weather: WeatherData | null;
  airQuality: AirQualityData | null;
  isLoading: boolean;
  onRefresh: () => void;
  isOnline?: boolean;
}

export const ClimatePanel: React.FC<ClimatePanelProps> = ({
  weather,
  airQuality,
  isLoading,
  onRefresh,
  isOnline = true,
}) => {
  const [activeTab, setActiveTab] = useState<'meteo' | 'air' | 'soleil'>('meteo');
  const [isMinimized, setIsMinimized] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);

  return (
    <>
      <div className="absolute bottom-4 left-4 z-20 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl text-slate-100 overflow-hidden transition-all duration-300">
        {/* Panel Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Climat & Air
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                isOnline
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-950/60 text-amber-300 border-amber-500/30'
              }`}
              title={isOnline ? 'En ligne : données synchronisées en temps réel' : 'Hors-ligne : données de référence locales'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all ${
                isLoading ? 'animate-spin text-indigo-400' : ''
              }`}
              title="Actualiser les données météo et qualité de l'air"
              aria-label="Actualiser les données"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowExplanationModal(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Explications des indicateurs et sources"
              aria-label="Informations sur les indicateurs"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={isMinimized ? 'Déplier les mesures' : 'Réduire les mesures'}
              aria-label={isMinimized ? 'Déplier' : 'Réduire'}
            >
              {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Minimized quick preview */}
        {isMinimized ? (
          <div
            onClick={() => setIsMinimized(false)}
            className="px-4 py-2 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">
                {weather?.temperature !== null ? `${weather?.temperature}°C` : 'Météo indisponible'}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-300 truncate max-w-[120px]">
                {weather?.weatherDescription || 'Variable'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Air:</span>
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                  airQuality?.aqiBand ? airQuality.aqiBand.textColor : 'text-slate-400'
                }`}
              >
                {airQuality?.aqiBand?.label || 'Indisponible'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3.5 space-y-3">
            {/* Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/70 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('meteo')}
                className={`py-1 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'meteo'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Météo & Vent
              </button>
              <button
                onClick={() => setActiveTab('air')}
                className={`py-1 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'air'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Qualité de l'Air
              </button>
              <button
                onClick={() => setActiveTab('soleil')}
                className={`py-1 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'soleil'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Soleil & UV
              </button>
            </div>

            {/* TAB 1: MÉTÉO & VENT */}
            {activeTab === 'meteo' && (
              <div className="space-y-2.5">
                {weather?.isAvailable ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white tracking-tight">
                          {weather.temperature !== null ? `${weather.temperature}°C` : 'N/D'}
                        </span>
                        {weather.apparentTemperature !== null && (
                          <span className="text-xs text-slate-400">
                            Ressenti {weather.apparentTemperature}°C
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium text-indigo-300">
                          {weather.weatherDescription}
                        </span>
                        {weather.precipitation !== null && weather.precipitation > 0 && (
                          <div className="text-[11px] text-sky-400">
                            Précipitations: {weather.precipitation} mm
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Wind and humidity grid */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                      <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-0.5">
                          <Wind className="w-3.5 h-3.5 text-sky-400" />
                          <span>Vent moyen (10m)</span>
                        </div>
                        <div className="text-xs font-semibold text-white">
                          {weather.windSpeed !== null ? `${weather.windSpeed} km/h` : 'Indisponible'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {weather.windDirectionLabel}
                        </div>
                      </div>

                      <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-0.5">
                          <Activity className="w-3.5 h-3.5 text-amber-400" />
                          <span>Rafales max</span>
                        </div>
                        <div className="text-xs font-semibold text-white">
                          {weather.windGusts !== null ? `${weather.windGusts} km/h` : 'Calme'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Humidité: {weather.relativeHumidity !== null ? `${weather.relativeHumidity}%` : 'N/D'}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-3 bg-slate-800/50 rounded-xl text-center text-xs text-slate-400">
                    <AlertCircle className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                    <span>Données météo momentanément indisponibles.</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: QUALITÉ DE L'AIR */}
            {activeTab === 'air' && (
              <div className="space-y-2.5">
                {airQuality?.isAvailable ? (
                  <>
                    {/* Index banner with both color and explicit textual label */}
                    <div
                      className={`p-2.5 rounded-xl border flex items-center justify-between ${
                        airQuality.aqiBand.bgColor
                      } ${airQuality.aqiBand.borderColor}`}
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Indice Européen (EAQI)
                        </div>
                        <div className={`text-base font-bold ${airQuality.aqiBand.textColor}`}>
                          {airQuality.aqiBand.label}
                          {airQuality.europeanAqi !== null && (
                            <span className="text-xs font-normal text-slate-300 ml-1.5">
                              (score {airQuality.europeanAqi})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right max-w-[150px]">
                        <p className="text-[11px] text-slate-300 leading-tight">
                          {airQuality.aqiBand.summary}
                        </p>
                      </div>
                    </div>

                    {/* Pollutants grid */}
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="bg-slate-800/40 p-1.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">PM2,5</div>
                        <div className="text-xs font-semibold text-white">
                          {airQuality.pm25 !== null ? `${airQuality.pm25}` : '—'}
                        </div>
                        <div className="text-[9px] text-slate-500">µg/m³</div>
                      </div>

                      <div className="bg-slate-800/40 p-1.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">PM10</div>
                        <div className="text-xs font-semibold text-white">
                          {airQuality.pm10 !== null ? `${airQuality.pm10}` : '—'}
                        </div>
                        <div className="text-[9px] text-slate-500">µg/m³</div>
                      </div>

                      <div className="bg-slate-800/40 p-1.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">NO₂</div>
                        <div className="text-xs font-semibold text-white">
                          {airQuality.nitrogenDioxide !== null ? `${airQuality.nitrogenDioxide}` : '—'}
                        </div>
                        <div className="text-[9px] text-slate-500">µg/m³</div>
                      </div>

                      <div className="bg-slate-800/40 p-1.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">O₃</div>
                        <div className="text-xs font-semibold text-white">
                          {airQuality.ozone !== null ? `${airQuality.ozone}` : '—'}
                        </div>
                        <div className="text-[9px] text-slate-500">µg/m³</div>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-snug">
                      <span className="font-semibold text-slate-300">Note :</span> Modélisation régionale CAMS (non mesurée in situ).
                    </p>
                  </>
                ) : (
                  <div className="p-3 bg-slate-800/50 rounded-xl text-center text-xs text-slate-400">
                    <AlertCircle className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                    <span>Données de qualité de l'air indisponibles.</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SOLEIL & ÉPHÉMÉRIDE */}
            {activeTab === 'soleil' && (
              <div className="space-y-2.5">
                {/* Solar elevation calculated estimate */}
                <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">Hauteur solaire calculée :</span>
                    <span className="font-semibold text-amber-300">
                      {weather && weather.solarElevation !== null ? `~${weather.solarElevation}°` : 'Calcul indisponible'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {weather?.solarElevationStatus || 'Donnée non disponible'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    *Estimation géométrique instantanée d'après l'équation du temps.
                  </p>
                </div>

                {/* Sunrise / Sunset */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
                    <Sunrise className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div>
                      <div className="text-[10px] text-slate-400">Lever du soleil</div>
                      <div className="text-xs font-semibold text-white">
                        {weather?.sunrise || 'Indisponible'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
                    <Sunset className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <div>
                      <div className="text-[10px] text-slate-400">Coucher du soleil</div>
                      <div className="text-xs font-semibold text-white">
                        {weather?.sunset || 'Indisponible'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sunshine & UV */}
                <div className="flex items-center justify-between text-[11px] text-slate-300 px-1">
                  <span>
                    Ensoleillement prévu :{' '}
                    <strong className="text-white">
                      {weather?.sunshineDurationHours !== null ? `${weather?.sunshineDurationHours} h` : 'N/D'}
                    </strong>
                  </span>
                  <span>
                    Indice UV max :{' '}
                    <strong className="text-amber-300">
                      {weather?.uvIndex !== null ? `${weather?.uvIndex}` : 'N/D'}
                    </strong>
                  </span>
                </div>
              </div>
            )}

            {/* Footer with Last Update & Attribution */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Mis à jour à {weather?.lastUpdated || airQuality?.lastUpdated || 'récemment'}</span>
              </span>
              <span>Open-Meteo & CAMS</span>
            </div>
          </div>
        )}
      </div>

      {/* Explanatory modal for indicators and models */}
      {showExplanationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">
                Comprendre les indicateurs environnementaux
              </h3>
              <button
                onClick={() => setShowExplanationModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <h4 className="font-semibold text-indigo-300 mb-1">
                  Indice Européen de Qualité de l'Air (EAQI)
                </h4>
                <p className="text-slate-300">
                  L'EAQI évalue la qualité de l'air selon 6 classes : Bon (0-20), Moyen (20-40), Dégradé (40-60), Mauvais (60-80), Très mauvais (80-100) et Extrêmement mauvais (&gt;100). Il repose sur le polluant le plus défavorable parmi les particules fines (PM2,5 et PM10), le dioxyde d'azote (NO₂) et l'ozone (O₃).
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-indigo-300 mb-1">
                  Nature des données & Modélisation CAMS
                </h4>
                <p className="text-slate-300">
                  Les données de qualité de l'air proviennent du <em>Copernicus Atmosphere Monitoring Service (CAMS)</em> via Open-Meteo. Il s'agit d'<strong>estimations de modèle à échelle régionale</strong> et non de mesures physiques in situ captées par une micro-station sur l'île.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-indigo-300 mb-1">
                  Calcul de la Hauteur Solaire
                </h4>
                <p className="text-slate-300">
                  L'élévation du soleil (en degrés) est estimée par calcul astronomique à partir des coordonnées géographiques précises de l'île (47.2058°N, 1.5530°O) et de l'heure locale, en prenant en compte l'équation du temps et la déclinaison solaire.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-indigo-300 mb-1">
                  Bâtiments 3D & Données OpenStreetMap
                </h4>
                <p className="text-slate-300">
                  L'extrusion 3D exploite les hauteurs lorsqu'elles sont cartographiées dans OpenStreetMap. Si la hauteur n'est pas renseignée, elle est déduite du nombre d'étages (niveau × 3,5 mètres). Il s'agit de repères volumétriques indicatifs et non de mesures géodésiques certifiées.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-right">
              <button
                onClick={() => setShowExplanationModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-colors"
              >
                J'ai compris
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
