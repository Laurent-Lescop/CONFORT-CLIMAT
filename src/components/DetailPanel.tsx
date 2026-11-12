import React, { useState, useEffect } from 'react';
import { AtlasItem } from '../types/atlas';
import {
  X,
  ExternalLink,
  MapPin,
  Calendar,
  Building,
  UserCheck,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DetailPanelProps {
  item: AtlasItem | null;
  onClose: () => void;
  onAskAiAboutItem: (item: AtlasItem) => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  item,
  onClose,
  onAskAiAboutItem,
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [item?.id]);

  if (!item) return null;

  const isProject = item.type === 'project';
  const currentImage = item.images && item.images.length > 0
    ? item.images[Math.min(activeImageIndex, item.images.length - 1)]
    : null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 w-full sm:w-[440px] bg-slate-900/98 backdrop-blur-xl border-l border-slate-700/80 shadow-2xl flex flex-col text-slate-100 transition-all duration-300 animate-in slide-in-from-right"
      aria-label={`Détails pour ${item.name}`}
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                isProject
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              }`}
            >
              {isProject ? 'Projet urbain' : 'Lieu d\'intérêt'}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{item.category}</span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
            {item.name}
          </h2>
          <p className="text-xs text-indigo-300 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <span>{item.districtName}</span>
          </p>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
          title="Fermer le volet de détail (Échap)"
          aria-label="Fermer le volet de détail"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content scrollable area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {/* Main image / media preview */}
        {currentImage ? (
          <div className="space-y-1.5">
            <div className="relative rounded-2xl overflow-hidden aspect-video bg-slate-950 border border-slate-800 group">
              <img
                key={currentImage.url}
                src={currentImage.url}
                alt={item.name}
                className="w-full h-full object-cover transition-opacity duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-transparent pointer-events-none" />
              
              {/* Caption */}
              <div className="absolute bottom-2 left-3 right-3 text-[11px] text-slate-200 pointer-events-none font-medium leading-tight">
                {currentImage.caption}
              </div>

              {/* Navigation arrows if multiple images */}
              {item.images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setActiveImageIndex((prev) => (prev - 1 + item.images.length) % item.images.length)
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md opacity-80 group-hover:opacity-100 transition-opacity border border-slate-700/60"
                    title="Photo précédente"
                    aria-label="Image précédente"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setActiveImageIndex((prev) => (prev + 1) % item.images.length)
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md opacity-80 group-hover:opacity-100 transition-opacity border border-slate-700/60"
                    title="Photo suivante"
                    aria-label="Image suivante"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Dot indicators */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/70 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-700/50">
                    {item.images.map((_, idx) => (
                      <span
                        key={idx}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          idx === activeImageIndex ? 'bg-indigo-400 w-3' : 'bg-slate-500'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            {currentImage.credit && (
              <div className="text-[10px] text-slate-500 text-right">
                Crédit : {currentImage.credit}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" />
            <span>Aucun document visuel libre de droits n'est actuellement indexé pour cet élément.</span>
          </div>
        )}

        {/* Status / Calendar bar */}
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Statut :</span>
            </span>
            <span className="font-semibold text-white">{item.status}</span>
          </div>

          {item.calendar && (
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-700/50">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Calendrier :</span>
              </span>
              <span className="font-medium text-slate-200">{item.calendar}</span>
            </div>
          )}

          {item.architect && (
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-700/50">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-teal-400" />
                <span>Maîtrise d'œuvre :</span>
              </span>
              <span className="font-medium text-slate-200 text-right max-w-[200px] truncate">
                {item.architect}
              </span>
            </div>
          )}
        </div>

        {/* Key figures if available */}
        {item.keyFigures && item.keyFigures.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Chiffres clés & dimensions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {item.keyFigures.map((fig, idx) => (
                <div key={idx} className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400">{fig.label}</div>
                  <div className="text-xs font-bold text-white mt-0.5">{fig.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed description */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Présentation & Enjeux
          </h4>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {item.description}
          </p>
        </div>

        {/* Historical context if available */}
        {item.historyOrContext && (
          <div className="space-y-1.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
            <h4 className="text-xs font-semibold text-indigo-300">
              Mémoire du site & contexte urbain
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {item.historyOrContext}
            </p>
          </div>
        )}

        {/* Geographic coordinates & validation check */}
        <div className="bg-slate-800/30 p-2.5 rounded-xl border border-slate-800/80 text-[11px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Coordonnées géographiques :</span>
            <span className="font-mono text-slate-300">
              [{item.coordinates[0].toFixed(4)}, {item.coordinates[1].toFixed(4)}]
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            {item.coordinateConfirmed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300/90">Positionnement géoréférencé vérifié</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300/90">Coordonnées approximatives à confirmer</span>
              </>
            )}
          </div>
          {item.source_note && (
            <p className="text-[10px] text-slate-500 pt-0.5">{item.source_note}</p>
          )}
        </div>

        {/* External verified links */}
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Ressources & Liens officiels
          </h4>
          {item.links && item.links.length > 0 ? (
            <div className="space-y-1.5">
              {item.links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 bg-slate-800/40 hover:bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs font-medium text-slate-200 hover:text-white transition-colors group"
                >
                  <span className="truncate pr-2">{link.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic p-2 bg-slate-900/50 rounded-lg">
              Aucun lien externe disponible pour ce site.
            </div>
          )}
        </div>

        {/* AI Exploration action button */}
        <div className="pt-2">
          <button
            onClick={() => onAskAiAboutItem(item)}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all active:scale-98"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <span>Interroger l'assistant sur ce lieu</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
