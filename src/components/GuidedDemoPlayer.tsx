import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  X,
  Video,
  Sparkles,
  Layers,
  Wind,
  Box,
  Compass,
  Building2,
  Download,
  Square,
  Globe2,
} from 'lucide-react';

export interface GuidedDemoPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  // State setters to control the app automatically
  onSelectDistrict: (id: string | null) => void;
  onSelectItem: (item: any | null) => void;
  onToggle3D: (value: boolean) => void;
  onToggleHeatmap: (value: boolean) => void;
  onSetSelectionConfig: (config: any) => void;
  onOpenAiModal: (isOpen: boolean) => void;
  onResetOverview: () => void;
  allPois: any[];
}

export const GuidedDemoPlayer: React.FC<GuidedDemoPlayerProps> = ({
  isOpen,
  onClose,
  onSelectDistrict,
  onSelectItem,
  onToggle3D,
  onToggleHeatmap,
  onSetSelectionConfig,
  onOpenAiModal,
  onResetOverview,
  allPois,
}) => {
  const [lang, setLang] = useState<'fr' | 'en'>('en'); // Defaults to English for international social media
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0 to 100%
  const [showRecordingTip, setShowRecordingTip] = useState(false);

  // In-browser recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const STEP_DURATION_MS = 7500; // 7.5 seconds per step (~50s total, ideal for Reels, Shorts, LinkedIn, X)

  const steps = [
    {
      id: 1,
      badge: lang === 'en' ? '3D Digital Twin' : 'Jumeau Numérique 3D',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      icon: Compass,
      title:
        lang === 'en'
          ? 'Atlas Île de Nantes — Immersive 3D Digital Twin'
          : 'Atlas Île de Nantes en 3D immersive',
      subtitle:
        lang === 'en'
          ? '337 hectares in the heart of Nantes metropolis'
          : '337 hectares au cœur de la métropole nantaise',
      description:
        lang === 'en'
          ? 'Interactive WebGL spatial twin combining urban modeling, architectural heritage, and live island bioclimatics.'
          : 'Cartographie interactive haute performance combinant modélisation urbaine, patrimoine et environnement insulaire.',
      action: () => {
        onSelectItem(null);
        onOpenAiModal(false);
        onToggleHeatmap(false);
        onToggle3D(true);
        onSelectDistrict(null);
        onResetOverview();
        onSetSelectionConfig({
          enabled: false,
          center: [-1.5530, 47.2058],
          radiusM: 250,
        });
      },
    },
    {
      id: 2,
      badge: lang === 'en' ? 'Real 3D Buildings' : 'Bâti Réel 3D',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      icon: Building2,
      title:
        lang === 'en'
          ? 'Real-Time 3D Building Extrusions'
          : 'Extrusion volumétrique des bâtiments réels',
      subtitle:
        lang === 'en'
          ? 'Quartier de la Création & Historic Alstom Halls'
          : 'Quartier de la Création & Halles Alstom',
      description:
        lang === 'en'
          ? 'Volumetric heights rendered directly from OpenStreetMap and OpenFreeMap vector cadastral data.'
          : 'Rendu 3D temps réel alimenté par OpenStreetMap et OpenFreeMap avec hauteurs cadastrales exactes.',
      action: () => {
        onSelectItem(null);
        onOpenAiModal(false);
        onToggleHeatmap(false);
        onToggle3D(true);
        onSelectDistrict('creation');
      },
    },
    {
      id: 3,
      badge: lang === 'en' ? 'Spatial Analysis' : 'Analyse Territoriale',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      icon: Box,
      title:
        lang === 'en'
          ? 'Mobile 250 m radius Analysis Sector'
          : 'Secteur mobile d\'analyse (rayon 250 m)',
      subtitle:
        lang === 'en'
          ? 'Instant building density counting'
          : 'Comptage volumétrique instantané',
      description:
        lang === 'en'
          ? 'Movable bounding window with real-time building feature querying and urban density quantification.'
          : 'Outil d\'étude déplaçable avec calcul dynamique des édifices et densité bâtie à l\'intérieur du périmètre.',
      action: () => {
        onSelectItem(null);
        onOpenAiModal(false);
        onToggleHeatmap(false);
        onToggle3D(true);
        onSetSelectionConfig({
          enabled: true,
          center: [-1.5530, 47.2058],
          radiusM: 250,
          isolateBuildings: false,
        });
      },
    },
    {
      id: 4,
      badge: lang === 'en' ? 'Environment & Air' : 'Environnement & Climat',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      icon: Wind,
      title:
        lang === 'en'
          ? 'Real-time Air Quality Heatmap (CAMS / EAQI)'
          : 'Heatmap Qualité de l\'Air en direct (CAMS / EAQI)',
      subtitle:
        lang === 'en'
          ? 'Atmospheric dispersion & urban microclimate'
          : 'Dispersion atmosphérique & microclimat',
      description:
        lang === 'en'
          ? 'Spatial interpolation of the European Air Quality Index flowing beneath the extruded 3D city buildings.'
          : 'Superposition thermique de l\'indice européen de la qualité de l\'air, émergeant sous les volumes 3D du bâti.',
      action: () => {
        onSelectItem(null);
        onOpenAiModal(false);
        onToggleHeatmap(true);
        onToggle3D(true);
        onSelectDistrict('sainte-anne-prairie');
      },
    },
    {
      id: 5,
      badge: lang === 'en' ? 'Heritage & Projects' : 'Patrimoine & Projets',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: Layers,
      title:
        lang === 'en'
          ? 'Architectural Dossiers & Urban Transformation'
          : 'Fiches architecturales & projets urbains',
      subtitle:
        lang === 'en'
          ? 'Les Machines de l\'Île & Dubigeon Shipyard Halls'
          : 'Les Machines de l\'Île & Nefs Dubigeon',
      description:
        lang === 'en'
          ? 'Comprehensive project dossiers with key metrics, delivery calendars, architects, photo galleries, and history.'
          : 'Fiches synthétiques complètes avec chiffres-clés, calendrier, architectes et historique urbain.',
      action: () => {
        onOpenAiModal(false);
        onToggleHeatmap(false);
        const machinesItem = allPois.find((p) => p.id === 'machines-de-lile') || allPois[0];
        if (machinesItem) {
          onSelectItem(machinesItem);
        }
      },
    },
    {
      id: 6,
      badge: lang === 'en' ? 'Climate & Solar' : 'Météo & Solaire',
      badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
      icon: Compass,
      title:
        lang === 'en'
          ? 'Live Climate Sensors & Solar Elevation Angle'
          : 'Capteurs météo & course solaire temps réel',
      subtitle:
        lang === 'en'
          ? 'Open-Meteo & real-time solar tracking'
          : 'Open-Meteo & calcul d\'élévation solaire',
      description:
        lang === 'en'
          ? 'Live temperature, estuary wind gusts, wind rose directions, and solar azimuth/elevation calculation.'
          : 'Température, rafales de vent, rose des vents estuarienne et suivi de l\'angle solaire sur l\'île.',
      action: () => {
        onSelectItem(null);
        onOpenAiModal(false);
        onToggleHeatmap(false);
        onSelectDistrict('beaulieu-est');
      },
    },
    {
      id: 7,
      badge: lang === 'en' ? 'Urban AI Assistant' : 'Intelligence Urbaine IA',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      icon: Sparkles,
      title:
        lang === 'en'
          ? 'Gemini Urban Intelligence Assistant'
          : 'Assistant d\'Intelligence Urbaine Gemini',
      subtitle:
        lang === 'en'
          ? 'Contextual Q&A and 2030 prospective planning'
          : 'Questions-réponses contextuelles & prospective 2030',
      description:
        lang === 'en'
          ? 'Generative AI model answering questions on architecture, urban planning, ecological transition, and history.'
          : 'Modèle d\'IA générative connecté pour répondre aux enjeux d\'aménagement, d\'histoire et de transition écologique.',
      action: () => {
        onSelectItem(null);
        onToggleHeatmap(false);
        onOpenAiModal(true);
      },
    },
  ];

  // Execute step action on step change
  useEffect(() => {
    if (!isOpen) return;
    const currentStep = steps[currentStepIndex];
    if (currentStep) {
      currentStep.action();
    }
    setProgress(0);
  }, [currentStepIndex, isOpen]);

  // Interval timer for auto-play
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    const intervalTime = 100; // ms
    const increment = (intervalTime / STEP_DURATION_MS) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          // If at the end and recording, automatically stop and trigger download
          if (currentStepIndex === steps.length - 1 && isRecording) {
            handleStopRecording();
            setIsPlaying(false);
            return 100;
          }
          setCurrentStepIndex((curr) => (curr + 1) % steps.length);
          return 0;
        }
        return prev + increment;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isOpen, isPlaying, currentStepIndex, steps.length, isRecording]);

  // Recording timer ticker
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setRecordingSeconds(0);
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    try {
      let stream: MediaStream | null = null;

      // 1. Try display capture if available
      if (navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia) {
        try {
          stream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: { frameRate: 60 },
            audio: false,
          });
        } catch (displayErr) {
          // User cancelled prompt or policy restricted in iframe
          console.log('Display media prompt dismissed or restricted, falling back to canvas');
        }
      }

      // 2. Fallback to MapLibre WebGL canvas capture stream
      if (!stream) {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) throw new Error('Canvas not found');
        stream = (canvas as any).captureStream(30);
      }

      if (!stream) throw new Error('No stream available');

      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `atlas-3d-ile-de-nantes-demo-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 200);
        }
        setIsRecording(false);
      };

      // Handle user stopping screen share from native browser banner
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStopRecording();
        };
      }

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setCurrentStepIndex(0);
      setProgress(0);
      setIsPlaying(true);
    } catch (err) {
      console.warn('Direct recording issue, showing recording instructions dialog:', err);
      setShowRecordingTip(true);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  if (!isOpen) return null;

  const currentStep = steps[currentStepIndex];
  const StepIcon = currentStep.icon;

  const handleNext = () => {
    setCurrentStepIndex((prev) => (prev + 1) % steps.length);
  };

  const handlePrev = () => {
    setCurrentStepIndex((prev) => (prev - 1 + steps.length) % steps.length);
  };

  const handleRestart = () => {
    setCurrentStepIndex(0);
    setProgress(0);
    setIsPlaying(true);
  };

  const formatRecordingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Floating Demo Presentation Control Bar (Bottom Center) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95vw] max-w-2xl bg-slate-900/98 backdrop-blur-xl border border-indigo-500/50 rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.25)] text-slate-100 overflow-hidden transition-all duration-300 select-none animate-in fade-in slide-in-from-bottom-6">
        {/* Top Progress Bar */}
        <div className="h-1.5 w-full bg-slate-800 relative">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Player Body */}
        <div className="p-3 sm:p-4 space-y-2.5">
          {/* Header Row: Badge, Step indicator, Recording Controls, Language, Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                {lang === 'en' ? 'Social Media Demo Video' : 'Mode Démo Réseaux Sociaux'}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${currentStep.badgeColor}`}>
                {currentStep.badge}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Language Switcher */}
              <button
                onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                title={lang === 'en' ? 'Passer en français' : 'Switch to English'}
              >
                <Globe2 className="w-3 h-3 text-indigo-400" />
                <span>{lang.toUpperCase()}</span>
              </button>

              {/* Direct In-Browser Recording Button */}
              {isRecording ? (
                <button
                  onClick={handleStopRecording}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-white px-2.5 py-1 bg-rose-600 hover:bg-rose-700 rounded-lg shadow-md shadow-rose-600/30 transition-all animate-pulse"
                  title={lang === 'en' ? 'Stop recording and download video' : 'Arrêter et télécharger la vidéo'}
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>{formatRecordingTime(recordingSeconds)} · {lang === 'en' ? 'Save Video' : 'Télécharger'}</span>
                </button>
              ) : (
                <button
                  onClick={handleStartRecording}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 hover:text-white px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 rounded-lg shadow-sm transition-all"
                  title={lang === 'en' ? 'Record demo video directly (.webm)' : 'Enregistrer la vidéo directement (.webm)'}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span>{lang === 'en' ? 'Record Video' : 'Filmer la démo'}</span>
                </button>
              )}

              {/* Guide / Instructions button */}
              <button
                onClick={() => setShowRecordingTip(!showRecordingTip)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title={lang === 'en' ? 'Screen capture shortcuts & guide' : 'Raccourcis et conseils d\'enregistrement'}
              >
                <Video className="w-4 h-4 text-indigo-400" />
              </button>

              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title={lang === 'en' ? 'Close demo player' : 'Quitter le mode démo'}
                aria-label="Fermer la démo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Content: Step title, subtitle & description */}
          <div className="flex items-start gap-3 pt-0.5">
            <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700/80 text-indigo-400 shrink-0 mt-0.5">
              <StepIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white tracking-tight leading-snug truncate">
                  {currentStep.title}
                </h3>
              </div>
              <p className="text-xs text-indigo-300 font-medium mt-0.5 truncate">
                {currentStep.subtitle}
              </p>
              <p className="text-xs text-slate-300 leading-relaxed mt-1">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Bottom Controls Row: Play/Pause, Step numbers, Timeline buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
            {/* Step count pills */}
            <div className="flex items-center gap-1">
              {steps.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStepIndex
                      ? 'w-6 bg-indigo-500'
                      : idx < currentStepIndex
                      ? 'w-2 bg-slate-600'
                      : 'w-2 bg-slate-800'
                  }`}
                  title={`${lang === 'en' ? 'Go to step' : 'Aller à l\'étape'} ${idx + 1}`}
                />
              ))}
              <span className="ml-2 text-[11px] text-slate-400 font-mono">
                {currentStepIndex + 1} / {steps.length}
              </span>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRestart}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title={lang === 'en' ? 'Restart from beginning' : 'Recommencer depuis le début'}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handlePrev}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title={lang === 'en' ? 'Previous feature' : 'Étape précédente'}
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span className="text-xs">{isPlaying ? (lang === 'en' ? 'Pause' : 'Pause') : (lang === 'en' ? 'Play' : 'Lecture')}</span>
              </button>

              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title={lang === 'en' ? 'Next feature' : 'Étape suivante'}
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Screen Recording Tips Dialog */}
      {showRecordingTip && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-400" />
                <h4 className="font-bold text-sm text-white">
                  {lang === 'en' ? 'Social Media Video Capture Guide' : 'Comment capturer la vidéo pour vos réseaux'}
                </h4>
              </div>
              <button
                onClick={() => setShowRecordingTip(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              <p>
                {lang === 'en'
                  ? 'The automated Demo Mode choreographs all 7 core functions with smooth camera sweeps at 60 FPS (~50 seconds total).'
                  : 'Le Mode Démo fait défiler automatiquement les 7 fonctionnalités clés avec des angles de caméra et des transitions fluides à 60 FPS (~50 secondes au total).'}
              </p>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="font-semibold text-indigo-300">
                  {lang === 'en' ? 'Direct Capture Options:' : 'Options de capture instantanée :'}
                </div>
                <ul className="list-disc pl-4 space-y-1.5 text-slate-300">
                  <li>
                    <strong>{lang === 'en' ? '1-Click In-App Recording:' : 'Bouton d\'enregistrement intégré :'}</strong>{' '}
                    {lang === 'en'
                      ? 'Click the red "Record Video" button in the demo player to start capturing and auto-download a .webm video file.'
                      : 'Cliquez sur le bouton "Filmer la démo" dans le lecteur pour enregistrer et télécharger directement un fichier .webm.'}
                  </li>
                  <li>
                    <strong>Windows Game Bar:</strong>{' '}
                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono text-[10px]">Win + Alt + R</kbd>{' '}
                    {lang === 'en' ? 'to start/stop instant HD recording.' : 'pour démarrer/arrêter l\'enregistrement HD instantanément.'}
                  </li>
                  <li>
                    <strong>macOS Screenshot/Screen Recording:</strong>{' '}
                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono text-[10px]">Cmd + Shift + 5</kbd>.
                  </li>
                </ul>
              </div>

              <p className="text-slate-400 text-[11px]">
                💡 {lang === 'en' ? 'Tip: Press' : 'Astuce : Appuyez sur'}{' '}
                <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">F11</kbd>{' '}
                {lang === 'en'
                  ? 'to toggle browser full screen before recording for a pristine 4K/HD presentation without browser toolbars!'
                  : 'pour passer en plein écran avant d\'enregistrer pour un rendu propre sans barres de navigation !'}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowRecordingTip(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                {lang === 'en' ? 'Ready to record' : 'C\'est compris'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
