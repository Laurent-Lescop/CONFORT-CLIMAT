import React from 'react';

interface Props {
  /** Nom affiché dans le message (ex. « le panneau d'étude ») */
  label: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Évite qu'une erreur d'exécution dans une partie de l'interface ne casse toute la page :
 * affiche le message d'erreur exact (utile pour le signaler) et propose de réessayer.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Erreur dans ${this.props.label} :`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="absolute top-16 right-4 z-30 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-rose-500/50 bg-slate-900/95 p-3.5 text-slate-100 shadow-2xl"
      >
        <p className="text-xs font-bold text-rose-300">Une erreur est survenue dans {this.props.label}.</p>
        <p className="mt-1.5 break-words rounded-lg bg-slate-950/70 p-2 font-mono text-[11px] text-rose-200">
          {this.state.error.name} : {this.state.error.message}
        </p>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Si la page a été modifiée pendant que vous l'utilisiez, rechargez-la (Ctrl+F5).
        </p>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={() => this.setState({ error: null })}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold hover:bg-slate-700"
          >
            Réessayer
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 rounded-lg border border-sky-400/60 bg-sky-600 px-2 py-1.5 text-[11px] font-semibold hover:bg-sky-500"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
