import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * En-tête de l'application (coin supérieur gauche) : titre, état de la connexion et accès à la
 * recherche intelligente (assistant Gemini avec recherche Google, nécessite une clé GEMINI_API_KEY).
 */
export const AppHeaderCard: React.FC<{ isOnline: boolean; onOpenSearch: () => void }> = ({ isOnline, onOpenSearch }) => (
  <div className="absolute top-4 left-4 z-20 w-72 max-w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl text-slate-100 p-3 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h1 className="font-bold text-sm tracking-tight text-white truncate">Atlas climatique · Île de Nantes</h1>
        <p className="text-[11px] text-slate-400">Soleil, ombres, vent et confort thermique</p>
      </div>
      <span
        className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          isOnline ? 'bg-emerald-950/70 text-emerald-400 border-emerald-500/30' : 'bg-amber-950/70 text-amber-300 border-amber-500/30'
        }`}
      >
        {isOnline ? 'En ligne' : 'Hors-ligne'}
      </span>
    </div>
    <button
      onClick={onOpenSearch}
      className="w-full flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900 border border-indigo-500/30 hover:border-indigo-500/60 rounded-xl text-xs font-medium text-indigo-200 hover:text-white transition-all group"
      title="Poser une question (actualité, réglementation, retours d'expérience) : réponse de l'assistant Gemini avec sources web"
    >
      <Sparkles className="w-4 h-4 text-indigo-400 group-hover:rotate-12 transition-transform" />
      <span>Recherche intelligente</span>
    </button>
  </div>
);
