import React, { useMemo, useRef, useState } from 'react';
import {
  Sun,
  X,
  FileUp,
  Trash2,
  Trees,
  Download,
  MapPin,
  AlertTriangle,
  Loader2,
  Lightbulb,
  Sunrise,
  Sunset,
  Wind,
  Thermometer,
  SunDim,
} from 'lucide-react';
import type { ComfortUiState, ShadowUiState, SunSettings, WindUiState } from '../types/atlas';
import { sunHoursLegendGradient } from '../utils/shadowOverlay';
import type { ComfortStats } from '../utils/comfortModel';
import type { EpwHourInfo } from '../utils/zoneStudy';
import { UTCI_CATEGORIES } from '../utils/utci';
import type { WindStats } from '../utils/windLbm';
import { speedLegendGradient } from '../utils/windField';
import { EpwData, EpwSummary, WIND_LABELS } from '../utils/epw';
import { LngLat, haversineM } from '../utils/geoUtils';
import {
  SunPosition,
  dayOfYearToMonthDay,
  solarPosition,
  utcFromStandardTime,
} from '../utils/sunPosition';
import {
  WIND_TERRAINS,
  WindTerrain,
  buildHourlyCsv,
  buildZoneStudy,
  computeHourlySun,
  downloadTextFile,
  stationToSiteWindFactor,
} from '../utils/zoneStudy';
import { WIND_DOMAIN_MARGIN, WIND_GRID_CELLS } from '../services/windSimulation';
import {
  VEGETATION_KIND_COLORS,
  VEGETATION_KIND_LABELS,
  VegetationData,
  VegetationKind,
} from '../services/vegetationService';

export const SUN_YEAR = 2023; // année de référence (non bissextile) pour le sunpath

interface ClimateStudyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  zone: { center: LngLat; radiusM: number };
  buildingsInSector: number;
  // EPW
  epw: EpwData | null;
  summary: EpwSummary | null;
  epwError: string | null;
  onLoadEpwFile: (file: File) => void;
  onClearEpw: () => void;
  onCenterOnEpwStation: () => void;
  // Soleil
  sun: SunSettings;
  onChangeSun: (patch: Partial<SunSettings>) => void;
  /** Vue plongeante nord en haut, cadrée sur tout le secteur */
  onTopView: () => void;
  /** Vue inclinée, cadrée pour voir tout le dôme céleste */
  onDomeView: () => void;
  sunPosition: SunPosition;
  timezone: number;
  // Végétation
  showVegetation: boolean;
  onToggleVegetation: () => void;
  vegetation: VegetationData | null;
  isVegetationLoading: boolean;
  vegetationError: string | null;
  // Simulation du vent (2,5D)
  wind: WindUiState;
  windStats: WindStats | null;
  onRunWind: (directionFrom: number, speedRef: number) => void;
  onStopWind: () => void;
  onClearWind: () => void;
  onChangeWindParams: (patch: Partial<Pick<WindUiState, "directionFrom" | "speedRef" | "showParticles" | "showSpeedMap">>) => void;
  // Confort thermique (UTCI)
  comfort: ComfortUiState;
  comfortStats: ComfortStats | null;
  /** Données EPW de l'heure étudiée (date et heure du sunpath), ou null sans fichier EPW */
  comfortHour: EpwHourInfo | null;
  /** Progression du calcul de vent lancé en préalable au confort */
  windProgress: number;
  onRunComfort: () => void;
  onStopComfort: () => void;
  onClearComfort: () => void;
  onChangeComfort: (patch: Partial<Pick<ComfortUiState, "dx" | "showMap" | "terrain">>) => void;
  onPickHottestHour: () => void;
  // Ombres portées
  shadow: ShadowUiState;
  onChangeShadowMode: (mode: ShadowUiState['mode']) => void;
}

const fmtHours = (h: number) => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return hh ? `${hh} h ${String(mm).padStart(2, '0')}` : `${mm} min`;
};

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function hourLabel(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function Section({ title, icon, children, right }: { title: string; icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border-t border-slate-800 px-3.5 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full border transition-colors shrink-0 ${
        checked ? 'bg-emerald-600 border-emerald-400' : 'bg-slate-700 border-slate-600'
      }`}
    >
      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-slate-950/50 border border-slate-800 rounded-lg px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-slate-500 leading-tight">{label}</div>
      <div className="text-sm font-semibold text-white leading-tight">
        {value}
        {unit && <span className="text-[10px] font-normal text-slate-400 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

/** Températures mensuelles : barre min-max et point de moyenne. */
function TemperatureChart({ summary }: { summary: EpwSummary }) {
  const W = 300;
  const H = 96;
  const padL = 22;
  const mins = summary.monthly.map((m) => m.tMin);
  const maxs = summary.monthly.map((m) => m.tMax);
  const lo = Math.floor(Math.min(0, ...mins) / 5) * 5;
  const hi = Math.ceil(Math.max(...maxs) / 5) * 5;
  const y = (t: number) => H - 14 - ((t - lo) / (hi - lo || 1)) * (H - 22);
  const step = (W - padL) / 12;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Températures mensuelles minimale, moyenne et maximale">
      {[lo, (lo + hi) / 2, hi].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 3" />
          <text x={padL - 3} y={y(t) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{Math.round(t)}</text>
        </g>
      ))}
      {summary.monthly.map((m, i) => {
        const cx = padL + step * i + step / 2;
        return (
          <g key={m.month}>
            <line x1={cx} x2={cx} y1={y(m.tMax)} y2={y(m.tMin)} stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
            <circle cx={cx} cy={y(m.tMean)} r="2.6" fill="#fbbf24" stroke="#0f172a" strokeWidth="0.8" />
            <text x={cx} y={H - 3} textAnchor="middle" fontSize="8" fill="#94a3b8">{MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Rayonnement mensuel (kWh/m²) : global / direct normal / diffus. */
function RadiationChart({ summary }: { summary: EpwSummary }) {
  const W = 300;
  const H = 90;
  const padL = 22;
  const max = Math.max(...summary.monthly.map((m) => m.ghiKwh)) || 1;
  const step = (W - padL) / 12;
  const h = (v: number) => (v / max) * (H - 22);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Rayonnement global horizontal mensuel">
      <text x={padL - 3} y={10} textAnchor="end" fontSize="8" fill="#94a3b8">{Math.round(max)}</text>
      <text x={padL - 3} y={H - 14} textAnchor="end" fontSize="8" fill="#94a3b8">0</text>
      {summary.monthly.map((m, i) => {
        const x = padL + step * i + step * 0.15;
        const w = step * 0.7;
        const hGlobal = h(m.ghiKwh);
        const hDiffuse = h(m.dhiKwh);
        return (
          <g key={m.month}>
            <rect x={x} y={H - 14 - hGlobal} width={w} height={hGlobal} rx="1.5" fill="#f59e0b" opacity="0.9" />
            <rect x={x} y={H - 14 - hDiffuse} width={w} height={hDiffuse} rx="1.5" fill="#38bdf8" opacity="0.85" />
            <text x={x + w / 2} y={H - 3} textAnchor="middle" fontSize="8" fill="#94a3b8">{MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Rose des vents annuelle. Chaque secteur est cliquable sur toute sa longueur (zone de clic
 * invisible jusqu'au cercle extérieur) : un clic lance la simulation pour ce vent.
 */
function WindRoseChart({
  summary,
  selected,
  disabled,
  onSelect,
}: {
  summary: EpwSummary;
  selected: number | null;
  disabled?: boolean;
  onSelect: (sectorIndex: number) => void;
}) {
  const size = 150;
  const c = size / 2;
  const R = 54;
  const sectors = summary.windRose.sectors;
  const max = Math.max(...sectors) || 1;
  const half = Math.PI / 16;
  const pt = (ang: number, rad: number) => `${c + rad * Math.sin(ang)},${c - rad * Math.cos(ang)}`;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-[150px] h-[150px] shrink-0" role="group" aria-label="Rose des vents annuelle : cliquez un secteur pour simuler ce vent">
      {[0.5, 1].map((f) => (
        <circle key={f} cx={c} cy={c} r={R * f} fill="none" stroke="#334155" strokeWidth="0.6" strokeDasharray="2 3" />
      ))}
      {sectors.map((f, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r = (f / max) * R;
        const isSel = selected === i;
        const label = `${WIND_LABELS[i]} (${(i * 22.5).toFixed(1).replace('.0', '')}°) : ${(f * 100).toFixed(1)} % du temps, ${summary.windRose.meanSpeed[i].toFixed(1)} m/s en moyenne`;
        return (
          <g
            key={i}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={`Simuler le vent de ${label}`}
            aria-pressed={isSel}
            onClick={() => !disabled && onSelect(i)}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(i);
              }
            }}
            className={disabled ? 'opacity-60' : 'cursor-pointer outline-none group'}
          >
            <title>{label}</title>
            {/* Zone de clic : le secteur entier jusqu'au cercle extérieur */}
            <polygon
              points={`${c},${c} ${pt(a - half, R + 4)} ${pt(a + half, R + 4)}`}
              fill={isSel ? 'rgba(56,189,248,0.22)' : 'rgba(255,255,255,0.001)'}
              className="group-hover:fill-[rgba(56,189,248,0.14)] group-focus-visible:fill-[rgba(56,189,248,0.22)]"
            />
            <polygon
              points={`${c},${c} ${pt(a - half * 0.8, r)} ${pt(a + half * 0.8, r)}`}
              fill={isSel ? '#38bdf8' : '#34d399'}
              opacity="0.9"
              pointerEvents="none"
            />
          </g>
        );
      })}
      {(['N', 'E', 'S', 'O'] as const).map((l, i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <text key={l} x={c + (R + 11) * Math.sin(a)} y={c - (R + 11) * Math.cos(a) + 3} textAnchor="middle" fontSize="9" fill="#cbd5e1" fontWeight="600" pointerEvents="none">{l}</text>
        );
      })}
    </svg>
  );
}

function daylightRange(lat: number, lon: number, dayOfYear: number, tz: number): { rise: number; set: number } | null {
  const { month, day } = dayOfYearToMonthDay(SUN_YEAR, dayOfYear);
  let rise: number | null = null;
  let set: number | null = null;
  let prev = solarPosition(utcFromStandardTime(SUN_YEAR, month, day, 0, tz), lat, lon).elevation;
  for (let m = 5; m <= 24 * 60; m += 5) {
    const el = solarPosition(utcFromStandardTime(SUN_YEAR, month, day, m / 60, tz), lat, lon).elevation;
    if (prev <= 0 && el > 0 && rise === null) rise = m / 60;
    if (prev > 0 && el <= 0) set = m / 60;
    prev = el;
  }
  return rise !== null && set !== null ? { rise, set } : null;
}

export const ClimateStudyPanel: React.FC<ClimateStudyPanelProps> = ({
  isOpen,
  onClose,
  zone,
  buildingsInSector,
  epw,
  summary,
  epwError,
  onLoadEpwFile,
  onClearEpw,
  onCenterOnEpwStation,
  sun,
  onChangeSun,
  onTopView,
  onDomeView,
  sunPosition,
  timezone,
  showVegetation,
  onToggleVegetation,
  vegetation,
  isVegetationLoading,
  vegetationError,
  wind,
  windStats,
  onRunWind,
  onStopWind,
  onClearWind,
  onChangeWindParams,
  comfort,
  comfortStats,
  comfortHour,
  windProgress,
  onRunComfort,
  onStopComfort,
  onClearComfort,
  onChangeComfort,
  onPickHottestHour,
  shadow,
  onChangeShadowMode,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const stationDistanceKm = useMemo(
    () => (epw ? haversineM(zone.center, [epw.location.longitude, epw.location.latitude]) / 1000 : 0),
    [epw, zone.center]
  );

  const daylight = useMemo(
    () => (isOpen ? daylightRange(zone.center[1], zone.center[0], sun.dayOfYear, timezone) : null),
    [isOpen, zone.center, sun.dayOfYear, timezone]
  );

  if (!isOpen) return null;

  const { month, day } = dayOfYearToMonthDay(SUN_YEAR, sun.dayOfYear);
  const dateLabel = new Date(Date.UTC(SUN_YEAR, month - 1, day)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const tzLabel = `UTC${timezone >= 0 ? '+' : ''}${timezone}`;

  const comfortBusy = comfort.status === 'preparing' || comfort.status === 'wind' || comfort.status === 'computing';
  const comfortHourLabel = comfortHour
    ? `${new Date(Date.UTC(SUN_YEAR, comfortHour.month - 1, comfortHour.day)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })} · ${hourLabel(comfortHour.epwHour - 1)}–${hourLabel(comfortHour.epwHour % 24)}`
    : '';

  const windBusy = wind.status === 'preparing' || wind.status === 'warmup' || wind.status === 'averaging';
  // Pendant le calcul de confort, le vent est piloté par l'heure étudiée : commandes du vent verrouillées
  const windLocked = comfortBusy;
  const sectorOf = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  const windSelectedSector = wind.hasField || wind.status !== 'idle' ? sectorOf(wind.directionFrom) : null;
  const windResult = wind.result;
  const windParamsDiffer =
    !!windResult &&
    !windBusy &&
    (Math.abs(windResult.directionFrom - wind.directionFrom) > 0.01 || Math.abs(windResult.speedRef - wind.speedRef) > 0.01);
  const windCellM = (2 * zone.radiusM * WIND_DOMAIN_MARGIN) / WIND_GRID_CELLS;
  const terrainFactor = stationToSiteWindFactor(comfort.terrain);
  const windPhaseLabel =
    wind.status === 'preparing'
      ? 'Lecture des bâtiments dans les tuiles de la carte…'
      : wind.status === 'warmup'
      ? "Calcul de l'écoulement (mise en régime)…"
      : 'Calcul de l’écoulement moyen…';

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onLoadEpwFile(file);
  };

  const exportStudy = () => {
    const study = buildZoneStudy({ zone, epw, summary, buildingsInSector, vegetation });
    downloadTextFile('etude-zone.json', JSON.stringify(study, null, 2), 'application/json');
  };
  const exportCsv = () => {
    if (!epw) return;
    const sunSeries = computeHourlySun(epw, zone);
    downloadTextFile('epw-horaire-zone.csv', buildHourlyCsv(epw, sunSeries), 'text/csv');
  };
  const exportVegetation = () => {
    if (!vegetation) return;
    downloadTextFile(
      'vegetation-osm.geojson',
      JSON.stringify(vegetation.features),
      'application/geo+json'
    );
  };

  const kinds = vegetation
    ? (Object.keys(VEGETATION_KIND_LABELS) as VegetationKind[]).filter((k) =>
        k === 'tree' ? vegetation.stats.treeCount > 0 : k === 'tree_row' ? vegetation.stats.treeRowCount > 0 : (vegetation.stats.areaByKindM2[k] ?? 0) > 0
      )
    : [];

  return (
    <aside
      className="absolute top-16 right-4 bottom-12 z-20 w-[22rem] max-w-[calc(100vw-2rem)] flex flex-col bg-slate-900/96 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl text-slate-100 overflow-hidden"
      aria-label="Étude climatique de la zone"
    >
      <header className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/60 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5 text-amber-400" /> Étude climatique
          </h2>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Zone : {zone.center[1].toFixed(4)}, {zone.center[0].toFixed(4)} · rayon {Math.round(zone.radiusM)} m
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" aria-label="Fermer le panneau d'étude">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* ---------------- Fichier EPW ---------------- */}
        <Section title="Fichier météo EPW" icon={<FileUp className="w-3.5 h-3.5 text-sky-400" />}
          right={epw && (
            <button onClick={onClearEpw} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-300 transition-colors" title="Retirer le fichier EPW">
              <Trash2 className="w-3 h-3" /> Retirer
            </button>
          )}
        >
          {!epw ? (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                className={`rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors ${isDragging ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700 hover:border-slate-600'}`}
              >
                <p className="text-xs text-slate-300">Glissez un fichier <strong>.epw</strong> ici</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/60 transition-colors"
                >
                  Choisir un fichier…
                </button>
                <p className="text-[10px] text-slate-500 mt-2">Fichiers gratuits : climate.onebuilding.org, EnergyPlus Weather. Le fichier reste dans votre navigateur.</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".epw,text/plain" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
            </>
          ) : (
            <div className="space-y-2">
              <div className="rounded-lg bg-slate-950/50 border border-slate-800 px-2.5 py-2 text-xs">
                <div className="font-semibold text-white truncate" title={epw.fileName}>{epw.location.city}{epw.location.country ? ` · ${epw.location.country}` : ''}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {epw.location.latitude.toFixed(3)}°, {epw.location.longitude.toFixed(3)}° · alt. {Math.round(epw.location.elevation)} m · UTC{epw.location.timezone >= 0 ? '+' : ''}{epw.location.timezone}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={epw.fileName}>{epw.fileName} · {epw.rows} h</div>
              </div>
              <div className={`flex items-start gap-1.5 text-[11px] rounded-lg px-2 py-1.5 border ${stationDistanceKm > 50 ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-slate-950/40 border-slate-800 text-slate-300'}`}>
                {stationDistanceKm > 50 && <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />}
                <span>
                  Station à <strong>{stationDistanceKm < 10 ? stationDistanceKm.toFixed(1) : Math.round(stationDistanceKm)} km</strong> de la zone étudiée.
                  {stationDistanceKm > 50 && ' Les données climatiques peuvent différer sensiblement.'}
                </span>
              </div>
              {stationDistanceKm > 1 && (
                <button onClick={onCenterOnEpwStation} className="flex items-center gap-1.5 text-[11px] text-sky-300 hover:text-sky-200 transition-colors">
                  <MapPin className="w-3 h-3" /> Centrer le secteur sur la station EPW
                </button>
              )}
            </div>
          )}
          {epwError && (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {epwError}
            </p>
          )}
        </Section>

        {/* ---------------- Sunpath ---------------- */}
        <Section title="Sunpath (course du soleil)" icon={<Sun className="w-3.5 h-3.5 text-amber-400" />}
          right={<Toggle checked={sun.showSunpath} onChange={() => onChangeSun({ showSunpath: !sun.showSunpath })} label="Afficher le sunpath sur la carte" />}
        >
          <div className="flex gap-1" role="group" aria-label="Mode d'affichage du sunpath">
            {([['3d', 'Dôme 3D'], ['2d', 'Au sol 2D']] as const).map(([m, label]) => (
              <button key={m} onClick={() => onChangeSun({ mode: m })} aria-pressed={sun.mode === m} className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${sun.mode === m ? 'bg-amber-500/20 text-amber-200 border-amber-500/40' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">
            {sun.mode === '3d'
              ? `Dôme céleste de ${Math.round(zone.radiusM)} m de rayon centré sur la zone : chaque point est à la hauteur réelle du soleil (altitude = R·sin h).`
              : 'Diagramme stéréographique posé au sol, centré sur la zone (horizon = cercle du secteur).'}{' '}
            Heure légale standard ({tzLabel}, sans heure d'été).
          </p>
          <div className="flex gap-1">
            <button onClick={onDomeView} className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
              Vue 3D du dôme
            </button>
            <button onClick={onTopView} className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
              Vue du dessus
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Date</span>
              <span className="font-semibold text-white">{dateLabel}</span>
            </div>
            <input type="range" min={1} max={365} value={sun.dayOfYear} onChange={(e) => onChangeSun({ dayOfYear: parseInt(e.target.value, 10) })} className="w-full accent-amber-500 h-1.5" aria-label="Jour de l'année" />
            <div className="flex gap-1">
              {[
                ['Équinoxe', 80],
                ['Solstice été', 172],
                ['Solstice hiver', 355],
              ].map(([label, doy]) => (
                <button key={label as string} onClick={() => onChangeSun({ dayOfYear: doy as number })} className={`flex-1 px-1.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${sun.dayOfYear === doy ? 'bg-amber-500/20 text-amber-200 border-amber-500/40' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Heure</span>
              <span className="font-semibold text-white font-mono">{hourLabel(sun.hour)}</span>
            </div>
            <input type="range" min={0} max={24} step={0.25} value={sun.hour} onChange={(e) => onChangeSun({ hour: parseFloat(e.target.value) })} className="w-full accent-amber-500 h-1.5" aria-label="Heure légale" />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Élévation" value={sunPosition.elevation > 0 ? fmt(sunPosition.elevation) : 'Sous l’horizon'} unit={sunPosition.elevation > 0 ? '°' : undefined} />
            <Stat label="Azimut (N=0°, E=90°)" value={fmt(sunPosition.azimuth)} unit="°" />
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] flex items-center gap-1.5"><Sunrise className="w-3.5 h-3.5 text-amber-300" />{daylight ? hourLabel(daylight.rise) : '—'}</div>
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] flex items-center gap-1.5"><Sunset className="w-3.5 h-3.5 text-orange-400" />{daylight ? hourLabel(daylight.set) : '—'}</div>
          </div>

          <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
            <span className="flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-yellow-300" /> Éclairer les bâtiments 3D selon le soleil</span>
            <Toggle checked={sun.syncMapLight} onChange={() => onChangeSun({ syncMapLight: !sun.syncMapLight })} label="Synchroniser l'éclairage de la carte avec le soleil" />
          </label>

          {/* Ombres portées au sol */}
          <div className="space-y-1.5 rounded-lg bg-slate-950/40 border border-slate-800 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
              <SunDim className="w-3.5 h-3.5 text-indigo-300" /> Ombres portées au sol
            </div>
            <div className="flex gap-1" role="group" aria-label="Calque des ombres portées">
              {([['off', 'Aucune'], ['instant', 'À cette heure'], ['daily', 'Soleil du jour']] as const).map(([m, label]) => (
                <button key={m} onClick={() => onChangeShadowMode(m)} aria-pressed={shadow.mode === m}
                  className={`flex-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${shadow.mode === m ? 'bg-indigo-500/25 text-indigo-100 border-indigo-400/50' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>

            {shadow.mode !== 'off' && shadow.status === 'loading' && (
              <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Loader2 className="w-3 h-3 animate-spin text-indigo-300" /> Lecture des bâtiments et des arbres…</p>
            )}
            {shadow.mode !== 'off' && shadow.error && (
              <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {shadow.error}</p>
            )}

            {shadow.mode === 'instant' && shadow.status === 'done' && (
              <p className="text-[11px] text-slate-300">
                {shadow.sunlitFraction === null
                  ? 'Soleil couché : tout le secteur est à l’ombre.'
                  : <>Sol libre au soleil à {hourLabel(sun.hour)} : <strong className="text-white">{fmt(shadow.sunlitFraction * 100, 0)} %</strong>. Déplacez le curseur d'heure : les ombres suivent.</>}
              </p>
            )}

            {shadow.mode === 'daily' && shadow.status === 'computing' && (
              <div className="space-y-1" role="status" aria-live="polite">
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-indigo-400 transition-all duration-200" style={{ width: `${Math.max(3, Math.round(shadow.progress * 100))}%` }} />
                </div>
                <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Loader2 className="w-3 h-3 animate-spin text-indigo-300" /> Course du soleil du {dateLabel}, toutes les 10 min…</p>
              </div>
            )}
            {shadow.mode === 'daily' && shadow.daily && shadow.status !== 'computing' && (
              <div className="space-y-1.5">
                <div>
                  <div className="h-2 rounded-full" style={{ background: sunHoursLegendGradient() }} />
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5">
                    <span>0 h</span><span>soleil direct au sol</span><span>{fmtHours(shadow.daily.dayLengthMin / 60)} (jour entier)</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Stat label="Moyenne au sol" value={fmtHours(shadow.daily.meanHours)} />
                  <Stat label="Durée du jour" value={fmtHours(shadow.daily.dayLengthMin / 60)} />
                </div>
                <ul className="space-y-0.5 text-[11px]">
                  {(['Moins de 2 h', '2 à 4 h', '4 à 6 h', '6 h et plus'] as const).map((label, i) => (
                    <li key={label} className="flex items-center justify-between">
                      <span className="text-slate-300">{label}</span>
                      <span className="font-mono text-slate-200">{fmt(shadow.daily!.classes[i] * 100, 0)} %</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {shadow.mode !== 'off' && (
              <p className="text-[10px] text-slate-500 leading-snug">
                {shadow.buildings > 0 && `${shadow.buildings} volumes bâtis${shadow.trees ? `, ${shadow.trees} arbres/boisements` : ''}. `}
                {!showVegetation && 'Arbres non pris en compte : activez le calque Végétation. '}
                Grille de 1 m, ombres au sol uniquement (pas sur les toits ni les façades){shadow.mode === 'daily' ? ', ciel clair (sans nuages)' : ''}. Survolez la carte pour lire la valeur.
              </p>
            )}
          </div>

          <div className={`space-y-1.5 ${epw ? '' : 'opacity-50'}`}>
            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
              <span>Colorer par le rayonnement EPW</span>
              <Toggle checked={sun.showRadiation && !!epw} onChange={() => epw && onChangeSun({ showRadiation: !sun.showRadiation })} label="Colorer le sunpath avec le rayonnement du fichier EPW" />
            </label>
            {sun.showRadiation && epw && (
              <>
                <div className="flex gap-1">
                  {([['ghi', 'Global'], ['dni', 'Direct'], ['dhi', 'Diffus']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => onChangeSun({ radiationMetric: k })} className={`flex-1 px-1.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${sun.radiationMetric === k ? 'bg-amber-500/20 text-amber-200 border-amber-500/40' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 via-teal-400 via-yellow-300 to-red-500" />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono"><span>faible</span><span>Wh/m² horaire</span><span>fort</span></div>
              </>
            )}
            {!epw && <p className="text-[10px] text-slate-500">Chargez un fichier EPW pour activer cette option.</p>}
          </div>
        </Section>

        {/* ---------------- Végétation ---------------- */}
        <Section title="Végétation OpenStreetMap" icon={<Trees className="w-3.5 h-3.5 text-emerald-400" />}
          right={<Toggle checked={showVegetation} onChange={onToggleVegetation} label="Afficher le calque de végétation" />}
        >
          {!showVegetation && <p className="text-[10px] text-slate-400">Calque optionnel : arbres, boisements, parcs et pelouses limités au secteur.</p>}
          {showVegetation && isVegetationLoading && (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-300"><Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0 mt-px" /> <span>Chargement depuis OpenStreetMap… le serveur public Overpass peut mettre jusqu'à une minute. Le résultat est ensuite gardé en cache.</span></p>
          )}
          {showVegetation && vegetationError && (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {vegetationError}</p>
          )}
          {showVegetation && vegetation && !isVegetationLoading && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <Stat label="Couverture végétale" value={fmt(vegetation.stats.greenCoverFraction * 100, 0)} unit="%" />
                <Stat label="Canopée arborée" value={fmt(vegetation.stats.canopyCoverFraction * 100, 0)} unit="%" />
              </div>
              {kinds.length === 0 ? (
                <p className="text-[11px] text-slate-400">Aucune végétation cartographiée dans OSM sur ce secteur.</p>
              ) : (
                <ul className="space-y-1">
                  {kinds.map((k) => (
                    <li key={k} className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: VEGETATION_KIND_COLORS[k] }} />
                        {VEGETATION_KIND_LABELS[k]}
                      </span>
                      <span className="font-mono text-slate-200">
                        {k === 'tree' ? `${vegetation.stats.treeCount}` : k === 'tree_row' ? `${vegetation.stats.treeRowCount}` : `${((vegetation.stats.areaByKindM2[k] ?? 0) / 10000).toFixed(2)} ha`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-slate-500">Les arbres sont ceux saisis dans OSM : le total réel peut être plus élevé. © contributeurs OpenStreetMap.</p>
            </div>
          )}
        </Section>

        {/* ---------------- Synthèse EPW ---------------- */}
        {summary && (
          <Section title="Synthèse du fichier EPW" icon={<Sun className="w-3.5 h-3.5 text-orange-400" />}>
            <div className="grid grid-cols-3 gap-1.5">
              <Stat label="T moyenne" value={fmt(summary.tMean)} unit="°C" />
              <Stat label="T min" value={fmt(summary.tMin)} unit="°C" />
              <Stat label="T max" value={fmt(summary.tMax)} unit="°C" />
              <Stat label="Global horiz." value={fmt(summary.ghiKwh, 0)} unit="kWh/m²" />
              <Stat label="Direct normal" value={fmt(summary.dniKwh, 0)} unit="kWh/m²" />
              <Stat label="Diffus" value={fmt(summary.dhiKwh, 0)} unit="kWh/m²" />
              <Stat label="Vent moyen" value={fmt(summary.windMean)} unit="m/s" />
              <Stat label="Dominant" value={summary.windRose.prevailingLabel} />
              <Stat label="Humidité" value={fmt(summary.rhMean, 0)} unit="%" />
              <Stat label="h > 30 °C" value={String(summary.hoursAbove30)} unit="h" />
              <Stat label="DJU chauffage" value={fmt(summary.heatingDegreeDays, 0)} unit="°C·j" />
              <Stat label="DJU froid" value={fmt(summary.coolingDegreeDays, 0)} unit="°C·j" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">Température mensuelle <span className="text-sky-300">min–max</span> · <span className="text-amber-300">moyenne</span> (°C)</div>
              <TemperatureChart summary={summary} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">Rayonnement mensuel (kWh/m²) <span className="text-amber-300">global</span> · <span className="text-sky-300">diffus</span></div>
              <RadiationChart summary={summary} />
            </div>
            <div className="flex items-center gap-3">
              <WindRoseChart
                summary={summary}
                selected={windSelectedSector}
                disabled={windLocked}
                onSelect={(i) => {
                  const mean = summary.windRose.meanSpeed[i];
                  onRunWind(i * 22.5, mean > 0.3 ? Math.round(mean * 10) / 10 : 3);
                }}
              />
              <div className="text-[10px] text-slate-400 space-y-0.5">
                <div className="text-sky-300 font-medium">
                  {windLocked ? 'Rose verrouillée pendant le calcul de confort' : 'Cliquez un secteur pour simuler ce vent sur la zone'}
                </div>
                <div>Rose annuelle, d'où vient le vent</div>
                <div>Dominant : <strong className="text-slate-200">{summary.windRose.prevailingLabel}</strong></div>
                <div>Calmes (&lt; 0,5 m/s) : <strong className="text-slate-200">{fmt(summary.windRose.calmFraction * 100, 0)} %</strong></div>
                <div>Vitesse max : <strong className="text-slate-200">{fmt(summary.windMax)} m/s</strong></div>
                <div className="text-slate-500">DJU : base 18 °C (chauffage) et 24 °C (froid).</div>
                {windBusy && <div className="text-amber-300">Simulation en cours… {Math.round(wind.progress * 100)} %</div>}
              </div>
            </div>
          </Section>
        )}

        {/* ---------------- Simulation du vent ---------------- */}
        <Section title="Simulation du vent (2,5D)" icon={<Wind className="w-3.5 h-3.5 text-sky-300" />}
          right={wind.hasField && !windBusy && (
            <button onClick={onClearWind} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-300 transition-colors" title="Effacer le résultat de la carte">
              <Trash2 className="w-3 h-3" /> Effacer
            </button>
          )}
        >
          <p className="text-[10px] text-slate-400 leading-snug">
            {summary
              ? 'Cliquez un secteur de la rose des vents ci-dessus, ou réglez la direction à la main.'
              : "Réglez la direction à la main (ou chargez un EPW pour cliquer sur sa rose des vents)."}{' '}
            Les bâtiments d'OpenStreetMap sont des obstacles ; l'écoulement est calculé à hauteur de piéton.
          </p>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Vent d'où il vient</span>
              <span className="font-semibold text-white">
                {WIND_LABELS[sectorOf(wind.directionFrom)]} · {fmt(wind.directionFrom, wind.directionFrom % 1 ? 1 : 0)}°
              </span>
            </div>
            <input type="range" min={0} max={357.5} step={2.5} value={wind.directionFrom} disabled={windBusy || windLocked}
              onChange={(e) => onChangeWindParams({ directionFrom: parseFloat(e.target.value) })}
              className="w-full accent-sky-500 h-1.5 disabled:opacity-50" aria-label="Direction d'où vient le vent, en degrés depuis le nord" />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Vitesse de référence (station, 10 m)</span>
              <span className="font-semibold text-white">{wind.speedRef.toFixed(1)} m/s</span>
            </div>
            <input type="range" min={0.5} max={15} step={0.1} value={wind.speedRef} disabled={windBusy || windLocked}
              onChange={(e) => onChangeWindParams({ speedRef: parseFloat(e.target.value) })}
              className="w-full accent-sky-500 h-1.5 disabled:opacity-50" aria-label="Vitesse de référence du vent en mètres par seconde" />
          </div>

          <div className="flex gap-1.5">
            {windBusy ? (
              <button onClick={onStopWind} disabled={windLocked} className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-600/80 hover:bg-rose-500 disabled:opacity-50 text-white border border-rose-400/60 transition-colors">
                {windLocked ? 'Calcul piloté par la carte de confort' : 'Arrêter'}
              </button>
            ) : (
              <button onClick={() => onRunWind(wind.directionFrom, wind.speedRef)} disabled={windLocked} className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white border border-sky-400/60 transition-colors">
                {windParamsDiffer ? 'Lancer avec ces réglages' : wind.hasField ? 'Relancer la simulation' : 'Lancer la simulation'}
              </button>
            )}
          </div>
          {windResult && wind.hasField && (
            <p className={`text-[10px] leading-snug ${windParamsDiffer ? 'text-amber-300' : 'text-slate-400'}`}>
              Champ affiché : vent de {WIND_LABELS[sectorOf(windResult.directionFrom)]} ({fmt(windResult.directionFrom, windResult.directionFrom % 1 ? 1 : 0)}°), {windResult.speedRef.toFixed(1)} m/s
              {windParamsDiffer && ' — les curseurs ont changé : relancez pour mettre la carte à jour.'}
            </p>
          )}

          {windBusy && (
            <div className="space-y-1" role="status" aria-live="polite">
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-sky-400 transition-all duration-300" style={{ width: `${Math.max(3, Math.round(wind.progress * 100))}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-sky-300" /> {windPhaseLabel}
              </p>
            </div>
          )}
          {wind.error && (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {wind.error}
            </p>
          )}

          {wind.hasField && (
            <>
              <div className="flex gap-1.5">
                {([['showParticles', 'Particules'], ['showSpeedMap', 'Carte de vitesse']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => onChangeWindParams({ [k]: !wind[k] })} aria-pressed={wind[k]}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${wind[k] ? 'bg-sky-500/20 text-sky-200 border-sky-500/40' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div>
                <div className="h-2 rounded-full" style={{ background: speedLegendGradient() }} />
                <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5">
                  <span>0 calme</span><span>1 = vent libre</span><span>1,5</span><span>≥ 1,9</span>
                </div>
              </div>
            </>
          )}

          {windStats && wind.status === 'done' && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <Stat label="Accélération max" value={fmt(windStats.maxRatio, 2)} unit={`× ≈ ${fmt(windStats.maxRatio * (windResult?.speedRef ?? wind.speedRef))} m/s`} />
                <Stat label="Bâtiments (obstacles)" value={String(wind.obstacleCount)} />
              </div>
              <ul className="space-y-0.5 text-[11px]">
                {[
                  ['Zones calmes (< 0,5)', windStats.calmFraction, 'bg-blue-700'],
                  ['Vent normal (0,5 – 1,2)', windStats.normalFraction, 'bg-teal-400'],
                  ['Accéléré (1,2 – 1,5)', windStats.acceleratedFraction, 'bg-amber-400'],
                  ['Fort : effets de coin (> 1,5)', windStats.strongFraction, 'bg-red-500'],
                ].map(([label, frac, color]) => (
                  <li key={label as string} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-slate-300"><span className={`w-2.5 h-2.5 rounded-sm ${color}`} />{label as string}</span>
                    <span className="font-mono text-slate-200">{fmt((frac as number) * 100, 0)} %</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-500">Parts de la surface libre du secteur ({fmt(windStats.builtFraction * 100, 0)} % du disque est bâti). Vitesse absolue indicative : rapport × vitesse de référence. Grille de {fmt(windCellM)} m.</p>
            </div>
          )}

          <details className="text-[10px] text-slate-400 leading-snug">
            <summary className="cursor-pointer text-slate-300 hover:text-white">Limites du modèle</summary>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              <li>Modèle 2D en plan (Boltzmann sur réseau, turbulence de Smagorinsky) à hauteur de piéton : résultat qualitatif, pas un calcul réglementaire.</li>
              <li>Un bâtiment est un obstacle plein dès 3 m de haut : l'air ne passe jamais par-dessus, ce qui renforce les contournements et les accélérations dans les rues.</li>
              <li>Pas de profil de vent vertical, de tourbillons de coin verticaux, de végétation ni de topographie.</li>
              <li>L'animation est accélérée ; seule la couleur donne la vitesse relative.</li>
            </ul>
          </details>
        </Section>

        {/* ---------------- Confort thermique (UTCI) ---------------- */}
        <Section title="Confort thermique (UTCI)" icon={<Thermometer className="w-3.5 h-3.5 text-rose-300" />}
          right={comfort.hasResult && !comfortBusy && (
            <button onClick={onClearComfort} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-300 transition-colors" title="Effacer la carte de confort">
              <Trash2 className="w-3 h-3" /> Effacer
            </button>
          )}
        >
          {!epw || !comfortHour ? (
            <p className="text-[10px] text-slate-400 leading-snug">
              Carte du ressenti thermique extérieur (indice UTCI) à une heure donnée. Chargez d'abord un fichier EPW : température, humidité, vent et rayonnement de l'heure choisie en sont tirés.
            </p>
          ) : (
            <>
              <p className="text-[10px] text-slate-400 leading-snug">
                Carte du ressenti thermique à hauteur de piéton pour <strong className="text-slate-200">une heure</strong> : ombres des bâtiments et des arbres, ciel visible, vent simulé. La date et l'heure se règlent dans la section Sunpath.
              </p>
              <div className="rounded-lg bg-slate-950/50 border border-slate-800 px-2.5 py-2 text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    {comfortHourLabel}
                  </span>
                  <button onClick={onPickHottestHour} disabled={comfortBusy} className="text-[10px] text-sky-300 hover:text-sky-200 disabled:opacity-40 transition-colors" title="Se placer sur l'heure la plus chaude du fichier EPW">
                    Heure la plus chaude
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-300">
                  <span>Air : <strong className="text-white">{fmt(comfortHour.taC)} °C</strong></span>
                  <span>Humidité : <strong className="text-white">{fmt(comfortHour.rhPercent, 0)} %</strong></span>
                  <span>Vent station : <strong className="text-white">{fmt(comfortHour.wind10)} m/s</strong>{comfortHour.windDirFrom !== null && <span className="text-slate-400"> · {WIND_LABELS[sectorOf(comfortHour.windDirFrom)]}</span>}</span>
                  <span>Soleil : <strong className="text-white">{comfortHour.sunElevation > 0 ? `${fmt(comfortHour.sunElevation, 0)}° haut` : 'sous l’horizon'}</strong></span>
                  <span>Direct : <strong className="text-white">{fmt(comfortHour.dni, 0)} W/m²</strong></span>
                  <span>Diffus : <strong className="text-white">{fmt(comfortHour.dhi, 0)} W/m²</strong></span>
                </div>
                {comfortHour.sunElevation <= 0 && (
                  <p className="text-[10px] text-amber-300">De nuit il n'y a ni soleil ni ombres : la carte ne montre que l'effet du vent et du ciel.</p>
                )}
                {comfortHour.lwSkyEstimated && (
                  <p className="text-[10px] text-slate-500">Rayonnement infrarouge du ciel absent du fichier : estimé.</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">Finesse de la grille</div>
                <div className="flex gap-1" role="group" aria-label="Taille de cellule de la carte de confort">
                  {([[0.5, '0,5 m'], [1, '1 m'], [2, '2 m (rapide)']] as const).map(([v, label]) => (
                    <button key={v} onClick={() => onChangeComfort({ dx: v })} disabled={comfortBusy} aria-pressed={comfort.dx === v}
                      className={`flex-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-50 ${comfort.dx === v ? 'bg-rose-500/20 text-rose-200 border-rose-500/40' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">
                  0,5 m : environ {fmt((2 * (zone.radiusM + 60) / 0.5) ** 2 / 1e6, 1)} millions de cellules, quelques secondes à une minute selon le soleil. Le vent reste calculé sur sa grille de {fmt(windCellM)} m puis interpolé.
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">Terrain autour du site (vent qui arrive sur le quartier)</div>
                <div className="flex gap-1" role="group" aria-label="Rugosité du terrain autour du site">
                  {(['city', 'suburban', 'open'] as WindTerrain[]).map((t) => (
                    <button key={t} onClick={() => onChangeComfort({ terrain: t })} disabled={comfortBusy} aria-pressed={comfort.terrain === t}
                      className={`flex-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-50 ${comfort.terrain === t ? 'bg-rose-500/20 text-rose-200 border-rose-500/40' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                      {WIND_TERRAINS[t].label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">
                  Vent de la station (aérodrome) × {fmt(terrainFactor, 2)} = <strong className="text-slate-300">{fmt(comfortHour.wind10 * terrainFactor)} m/s</strong> à 10 m sur le quartier (profils ASHRAE, comme Ladybug). La simulation répartit ensuite ce vent entre rues abritées et couloirs accélérés.
                </p>
              </div>

              {!(showVegetation && vegetation) && (
                <p className="flex items-start gap-1.5 text-[10px] text-amber-300">
                  <Trees className="w-3 h-3 shrink-0 mt-px" /> Arbres non pris en compte : activez le calque « Végétation » (bouton en haut à droite), attendez son chargement, puis lancez le calcul.
                </p>
              )}

              <div className="flex gap-1.5">
                {comfortBusy ? (
                  <button onClick={onStopComfort} className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-600/80 hover:bg-rose-500 text-white border border-rose-400/60 transition-colors">
                    Arrêter
                  </button>
                ) : (
                  <button onClick={onRunComfort} disabled={windBusy} className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:hover:bg-rose-600 text-white border border-rose-400/60 transition-colors">
                    {windBusy ? 'Attendez la fin de la simulation du vent' : comfort.hasResult ? 'Recalculer la carte de confort' : 'Calculer la carte de confort'}
                  </button>
                )}
              </div>

              {comfortBusy && (
                <div className="space-y-1" role="status" aria-live="polite">
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-rose-400 transition-all duration-300" style={{ width: `${Math.max(3, Math.round((comfort.status === 'wind' ? windProgress : comfort.progress) * 100))}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin text-rose-300" />
                    {comfort.status === 'wind' ? 'Simulation du vent de cette heure…' : `${comfort.phase}…`}
                  </p>
                </div>
              )}
              {comfort.error && (
                <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {comfort.error}
                </p>
              )}

              {comfort.hasResult && comfortStats && (
                <div className="space-y-2">
                  <button onClick={() => onChangeComfort({ showMap: !comfort.showMap })} aria-pressed={comfort.showMap}
                    className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${comfort.showMap ? 'bg-rose-500/20 text-rose-200 border-rose-500/40' : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:text-white'}`}>
                    {comfort.showMap ? 'Carte affichée' : 'Carte masquée'} · survolez-la pour lire UTCI, Tmrt, vent, ombre
                  </button>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Stat label="UTCI min" value={fmt(comfortStats.utciMin)} unit="°C" />
                    <Stat label="UTCI moyen" value={fmt(comfortStats.utciMean)} unit="°C" />
                    <Stat label="UTCI max" value={fmt(comfortStats.utciMax)} unit="°C" />
                    <Stat label="Tmrt moyenne" value={fmt(comfortStats.tmrtMean)} unit="°C" />
                    <Stat label="Au soleil" value={fmt(comfortStats.sunlitFraction * 100, 0)} unit="%" />
                    <Stat label="Vent moyen" value={fmt(comfortStats.windMeanMs)} unit="m/s" />
                  </div>
                  <ul className="space-y-0.5 text-[11px]">
                    {UTCI_CATEGORIES.map((c, i) => ({ c, f: comfortStats.categoryFractions[i] }))
                      .filter(({ f }) => f >= 0.005)
                      .reverse()
                      .map(({ c, f }) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: `rgb(${c.color[0]},${c.color[1]},${c.color[2]})` }} />
                            {c.label}
                          </span>
                          <span className="font-mono text-slate-200">{fmt(f * 100, 0)} %</span>
                        </li>
                      ))}
                  </ul>
                  {comfort.summary && (
                    <p className="text-[10px] text-slate-500">
                      Pris en compte : {comfort.summary.buildings} volumes bâtis, {comfort.summary.trees} arbres/boisements, vent de {fmt(comfort.summary.siteWindMs)} m/s sur le quartier{' '}
                      {comfort.summary.windMode === 'uniform' ? '(uniforme : calme ou direction inconnue)' : comfort.summary.windMode === 'reused' ? '(réparti par la simulation déjà calculée)' : '(réparti par la simulation de cette heure)'}. Parts de la surface libre du secteur.
                    </p>
                  )}
                </div>
              )}

              <details className="text-[10px] text-slate-400 leading-snug">
                <summary className="cursor-pointer text-slate-300 hover:text-white">Hypothèses et limites</summary>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>UTCI : polynôme officiel (Bröde et al.), personne debout à l'extérieur. Vent utilisé = vent de la station × correction de terrain × rapport local simulé (vitesse équivalente à 10 m, comme le demande l'UTCI).</li>
                  <li>Température radiante moyenne : modèle simplifié de type SOLWEIG (6 directions, ondes courtes et longues), sol échauffé par le soleil, albédo 0,2, façades à la température de l'air (+1 K). Infrarouge du ciel : valeur du fichier EPW, ou estimation Clark & Allen corrigée de la nébulosité (méthode EnergyPlus).</li>
                  <li>Ombres : bâtiments d'OpenStreetMap opaques, y compris les volumes surélevés (passages couverts, porte-à-faux) ; arbres semi-transparents (feuillus : feuillage d'avril à octobre). Ombres venant de plus de 60 m hors du secteur ignorées.</li>
                  <li>Calcul instantané pour une heure : pas d'inertie thermique du sol et des façades, pas de réflexions entre bâtiments, pas d'évapotranspiration de la végétation.</li>
                  <li>Résultat d'aide à la conception : à lire en écart entre lieux (ombre / soleil, abrité / venté) plutôt qu'en valeur absolue.</li>
                </ul>
              </details>
            </>
          )}
        </Section>

        {/* ---------------- Exports ---------------- */}
        <Section title="Préparer l'exploitation" icon={<Download className="w-3.5 h-3.5 text-indigo-300" />}>
          <p className="text-[10px] text-slate-400 leading-snug">
            Exports prêts pour Grasshopper / Ladybug, Python ou tableur. Le soleil est calculé au centre de la zone pour chaque heure du fichier EPW.
          </p>
          <div className="grid gap-1.5">
            <button onClick={exportStudy} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/60 transition-colors text-left">
              Étude de zone (JSON) — secteur, EPW, végétation
            </button>
            <button onClick={exportCsv} disabled={!epw} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-100 border border-slate-600 transition-colors text-left">
              Série horaire (CSV) — météo + position du soleil
            </button>
            <button onClick={exportVegetation} disabled={!vegetation} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-100 border border-slate-600 transition-colors text-left">
              Végétation (GeoJSON)
            </button>
          </div>
          {!vegetation && <p className="text-[10px] text-slate-500">Activez le calque végétation pour inclure ses statistiques et le GeoJSON.</p>}
        </Section>
      </div>
    </aside>
  );
};
