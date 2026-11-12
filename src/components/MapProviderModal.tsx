import React, { useState } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Layers,
  Sparkles,
  Zap,
  Globe,
  Trash2,
  HelpCircle,
  Eye,
  Check,
} from 'lucide-react';

interface MapProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  mapboxToken: string;
  onSaveToken: (token: string) => void;
  activeProvider: 'osm' | 'mapbox';
  onSwitchProvider: (provider: 'osm' | 'mapbox') => void;
}

export const MapProviderModal: React.FC<MapProviderModalProps> = ({
  isOpen,
  onClose,
  mapboxToken,
  onSaveToken,
  activeProvider,
  onSwitchProvider,
}) => {
  const [tokenInput, setTokenInput] = useState(mapboxToken);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'comparison'>('settings');

  if (!isOpen) return null;

  const handleValidateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim();

    if (!cleanToken) {
      onSaveToken('');
      setValidationStatus('idle');
      return;
    }

    if (!cleanToken.startsWith('pk.')) {
      setValidationStatus('error');
      setErrorMessage('Une clé publique Mapbox valide commence par "pk." (Default public token).');
      return;
    }

    setIsValidating(true);
    setValidationStatus('idle');
    setErrorMessage('');

    try {
      // Test the token against Mapbox Styles API
      const res = await fetch(
        `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${cleanToken}`
      );
      if (res.ok) {
        setValidationStatus('success');
        onSaveToken(cleanToken);
        onSwitchProvider('mapbox');
      } else {
        setValidationStatus('error');
        setErrorMessage('La clé fournie a été rejetée par l\'API Mapbox (vérifiez les autorisations de votre jeton).');
      }
    } catch (err: any) {
      setValidationStatus('error');
      setErrorMessage('Impossible de vérifier la clé avec les serveurs Mapbox.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveKey = () => {
    setTokenInput('');
    onSaveToken('');
    setValidationStatus('idle');
    onSwitchProvider('osm');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Moteur Cartographique 2D & 3D
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  OSM & Mapbox
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Choix de la source géométrique, précision des détails et configuration de clé API
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            Configuration & Clé API
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'comparison'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Comparatif : Qualité, Vitesse & Gratuité
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeTab === 'settings' ? (
            <>
              {/* Provider Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* OpenStreetMap Option */}
                <div
                  onClick={() => onSwitchProvider('osm')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    activeProvider === 'osm'
                      ? 'bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/30'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="font-bold text-sm text-white">OpenStreetMap (Actif)</span>
                    </div>
                    {activeProvider === 'osm' && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                        Sélectionné
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Données ouvertes authentiques d'OpenStreetMap. Bâtiments 3D vectoriels réels sans aucune clé requise.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>100% Libre & Gratuit sans quota</span>
                  </div>
                </div>

                {/* Mapbox Option */}
                <div
                  onClick={() => {
                    if (mapboxToken) onSwitchProvider('mapbox');
                  }}
                  className={`p-4 rounded-xl border transition-all ${
                    !mapboxToken
                      ? 'bg-slate-900/60 border-slate-800 opacity-80'
                      : activeProvider === 'mapbox'
                      ? 'bg-amber-950/40 border-amber-500/60 ring-1 ring-amber-500/30 cursor-pointer'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${mapboxToken ? 'bg-amber-400' : 'bg-slate-500'}`} />
                      <span className="font-bold text-sm text-white">Mapbox Pro 3D</span>
                    </div>
                    {mapboxToken && activeProvider === 'mapbox' && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                        Sélectionné
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Rendu architectural haute définition, toitures 3D détaillées, éclairage solaire et vue satellite HD.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] font-medium">
                    {mapboxToken ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Clé configurée et active
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1">
                        <Key className="w-3.5 h-3.5" /> Nécessite une clé API ci-dessous
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* API Key Form */}
              <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>Entrer votre clé d'accès Mapbox (Access Token)</span>
                  </div>
                  <a
                    href="https://account.mapbox.com/access-tokens/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                  >
                    <span>Obtenir une clé gratuite sur mapbox.com</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <form onSubmit={handleValidateAndSave} className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="pk.eyJ1Ijoi..."
                      value={tokenInput}
                      onChange={(e) => {
                        setTokenInput(e.target.value);
                        setValidationStatus('idle');
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono tracking-tight"
                    />
                    {tokenInput && (
                      <button
                        type="button"
                        onClick={handleRemoveKey}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-400 p-1"
                        title="Effacer la clé"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Feedback Messages */}
                  {validationStatus === 'error' && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {validationStatus === 'success' && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>Clé Mapbox validée avec succès ! Le moteur Mapbox Pro 3D est actif.</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">
                      🔒 Stockage local sécurisé dans votre navigateur (localStorage).
                    </span>
                    <button
                      type="submit"
                      disabled={isValidating || !tokenInput.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-xs rounded-lg transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      {isValidating ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          <span>Vérification...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Enregistrer & Activer</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Instructions Steps */}
              <div className="border-t border-slate-800 pt-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Comment obtenir votre clé en 30 secondes :
                </h4>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside pl-1 leading-relaxed">
                  <li>
                    Créez un compte gratuit sur{' '}
                    <a
                      href="https://account.mapbox.com/auth/signup/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline"
                    >
                      mapbox.com/auth/signup
                    </a>{' '}
                    (aucune carte bancaire requise pour le quota gratuit).
                  </li>
                  <li>
                    Rendez-vous dans la section{' '}
                    <strong className="text-slate-200">Access Tokens</strong> et copiez votre{' '}
                    <strong className="text-slate-200">Default public token</strong> (commençant par <code className="text-amber-300 font-mono text-[11px]">pk.eyJ...</code>).
                  </li>
                  <li>Collez-la ci-dessus et cliquez sur <em>Enregistrer & Activer</em>.</li>
                </ol>
              </div>
            </>
          ) : (
            /* Comparison Tab */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* OSM Column */}
                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <Globe className="w-4 h-4" />
                    <span>OpenStreetMap (Libre)</span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-2.5">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white shrink-0">Qualité :</span>
                      <span>
                        Excellente couverture collaborative à Nantes. Les empreintes des bâtiments, parcelles et quais sont fidèles au cadastre. Rendu sobre et fonctionnel.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white shrink-0">Vitesse :</span>
                      <span>
                        Excellente réactivité via les serveurs OpenStreetMap (tile.openstreetmap.org et OpenFreeMap). Aucune latence d'authentification.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white shrink-0">Gratuité :</span>
                      <span className="text-emerald-400 font-semibold">
                        100% gratuit à vie, sans quota, sans compte, sans carte bancaire (Licence libre ODbL).
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Mapbox Column */}
                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>Mapbox Pro 3D (API)</span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-2.5">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white shrink-0">Qualité :</span>
                      <span>
                        Référence mondiale pour l'architecture et l'urbanisme. Modèles 3D détaillés, toitures complexes, calcul des ombres portées selon la course du soleil et vue satellite haute résolution (15 à 30 cm/pixel).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white shrink-0">Vitesse :</span>
                      <span>
                        Infrastructure Edge AWS mondiale ultra-optimisée, fluidité 60 FPS permanente et tuiles vectorielles compressées MVT v2.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white shrink-0">Gratuité :</span>
                      <span className="text-amber-300 font-semibold">
                        50 000 chargements de cartes gratuits par mois chaque mois (amplement suffisant pour du bureau d'études ou de la recherche).
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Architectural verdict */}
              <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-xs text-slate-300 space-y-1.5">
                <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  <span>Recommandation pour le projet Île de Nantes</span>
                </div>
                <p className="leading-relaxed">
                  Pour commencer immédiatement sans friction, <strong>OpenStreetMap</strong> fournit les empreintes géométriques réelles de tous les édifices insulaires sans aucune configuration. Si vous souhaitez des vues satellites photoréalistes, des ombres portées d'ensoleillement et le niveau de détail maximal pour des jurys ou rendus d'architecture, l'activation de <strong>Mapbox</strong> avec une clé gratuite est recommandée.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Source active :{' '}
            <strong className="text-white">
              {activeProvider === 'mapbox' && mapboxToken ? 'Mapbox Pro 3D' : 'OpenStreetMap (Libre)'}
            </strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
