import React, { useState } from 'react';
import { AtlasItem } from '../types/atlas';
import { askGroundedSearch, askDeepAnalysis, GroundedSearchResult, DeepAnalysisResult } from '../services/geminiService';
import {
  Sparkles,
  Search,
  BrainCircuit,
  X,
  ExternalLink,
  Loader2,
  Send,
  MessageSquare,
  Building,
  TreePine,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface UrbanIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeItemContext: AtlasItem | null;
}

export const UrbanIntelligenceModal: React.FC<UrbanIntelligenceModalProps> = ({
  isOpen,
  onClose,
  activeItemContext,
}) => {
  const [mode, setMode] = useState<'grounded' | 'deep'>('grounded');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [groundedResult, setGroundedResult] = useState<GroundedSearchResult | null>(null);
  const [deepResult, setDeepResult] = useState<DeepAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Preset exploratory queries for Île de Nantes
  const suggestions = [
    { label: 'Îlots de chaleur à Nantes', query: 'Quelles sont les études récentes sur les îlots de chaleur urbains à Nantes et sur l\'île de Nantes (mesures, cartes, actions) ?' },
    { label: 'Plan canopée et arbres', query: 'Où en est la politique de plantation d\'arbres et de végétalisation de Nantes Métropole sur l\'île de Nantes ?' },
    { label: 'Règles du PLUm (climat)', query: 'Quelles règles du PLUm de Nantes Métropole concernent la végétalisation, la pleine terre et l\'adaptation au changement climatique ?', mode: 'deep' as const },
    { label: 'Confort d\'été des espaces publics', query: 'Quelles stratégies de conception améliorent le confort thermique d\'été des espaces publics (ombre, eau, végétation, matériaux) dans un climat océanique comme celui de Nantes ?', mode: 'deep' as const },
  ];

  const handleRunSearch = async (customQuery?: string, targetMode?: 'grounded' | 'deep') => {
    const q = customQuery || query;
    const m = targetMode || mode;
    if (!q.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setGroundedResult(null);
    setDeepResult(null);

    try {
      if (m === 'grounded') {
        const res = await askGroundedSearch(q, activeItemContext);
        setGroundedResult(res);
      } else {
        const res = await askDeepAnalysis(q, activeItemContext);
        setDeepResult(res);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Une erreur est survenue lors de l\'interrogation de l\'intelligence.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Intelligence Urbaine & Chronique
              </h3>
              <p className="text-xs text-slate-400">
                Données actualisées avec Google Search & Analyse architecturale approfondie
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fermer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Context Bar if any */}
        {activeItemContext && (
          <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Contexte actif : <strong className="text-indigo-300">{activeItemContext.name}</strong>
            </span>
            <span className="text-[11px] text-slate-500 uppercase font-medium">
              {activeItemContext.type === 'project' ? 'Projet urbain' : 'Lieu patrimonial'}
            </span>
          </div>
        )}

        {/* Mode Selector */}
        <div className="p-4 pb-2">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
            <button
              onClick={() => setMode('grounded')}
              className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'grounded'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Actualité & Web (gemini-3.5-flash)</span>
            </button>
            <button
              onClick={() => setMode('deep')}
              className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'deep'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>Réflexion Urbaine (Thinking High)</span>
            </button>
          </div>
        </div>

        {/* Prompt Input Form */}
        <div className="px-4 py-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunSearch();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'grounded'
                  ? 'Ex : canicules récentes à Nantes, projets de végétalisation sur l\'île...'
                  : 'Ex : stratégie d\'ombrage d\'une place exposée au sud-ouest...'
              }
              className="flex-1 bg-slate-950/80 border border-slate-700 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Consulter</span>
            </button>
          </form>

          {/* Quick preset query suggestions */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] text-slate-400 no-scrollbar">
            <span className="text-slate-500 whitespace-nowrap">Idées :</span>
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(s.query);
                  if (s.mode) setMode(s.mode);
                  handleRunSearch(s.query, s.mode || mode);
                }}
                className="whitespace-nowrap px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 hover:text-indigo-300 border border-slate-700/60 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Response Body Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="w-7 h-7 animate-spin mx-auto text-indigo-400" />
              <p className="text-xs text-slate-300">
                {mode === 'grounded'
                  ? 'Recherche en temps réel via Google Search Grounding...'
                  : 'Analyse approfondie en cours avec modèle de pensée avancée...'}
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300">
              {errorMessage}
            </div>
          )}

          {groundedResult && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {groundedResult.text}
              </div>

              {/* Grounded Sources */}
              {groundedResult.sources && groundedResult.sources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Sources Web vérifiées
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {groundedResult.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-xs border border-slate-700 transition-colors"
                      >
                        <span className="max-w-[200px] truncate">{s.title}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-500 pt-1">
                Modèle : {groundedResult.modelUsed}
              </div>
            </div>
          )}

          {deepResult && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-purple-950/20 rounded-xl border border-purple-800/40 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {deepResult.text}
              </div>
              <div className="text-[10px] text-slate-500 pt-1">
                Modèle : {deepResult.modelUsed}
              </div>
            </div>
          )}

          {!isLoading && !groundedResult && !deepResult && !errorMessage && (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs">
                Posez une question sur un projet urbain, un monument ou l'histoire de l'île.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
