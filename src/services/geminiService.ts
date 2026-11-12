import { AtlasItem } from '../types/atlas';

export interface GroundedSearchResult {
  text: string;
  sources: { title: string; url: string }[];
  webSearchQueries?: string[];
  modelUsed: string;
}

export interface DeepAnalysisResult {
  text: string;
  modelUsed: string;
}

export async function askGroundedSearch(query: string, itemContext?: AtlasItem | null): Promise<GroundedSearchResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Vous êtes actuellement en mode hors-ligne. Une connexion Internet active est requise pour interroger l\'assistant IA.');
  }

  try {
    const res = await fetch('/api/gemini/grounded-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, itemContext }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Erreur serveur (${res.status})`);
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
      throw new Error('Impossible de joindre le service IA. Vérifiez que le serveur local est actif et que votre connexion Internet fonctionne.');
    }
    throw err;
  }
}

export async function askDeepAnalysis(topic: string, itemContext?: AtlasItem | null): Promise<DeepAnalysisResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Vous êtes actuellement en mode hors-ligne. Une connexion Internet active est requise pour l\'analyse architecturale approfondie.');
  }

  try {
    const res = await fetch('/api/gemini/deep-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, itemContext }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Erreur serveur (${res.status})`);
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
      throw new Error('Impossible de joindre le service IA. Vérifiez que le serveur local est actif et que votre connexion Internet fonctionne.');
    }
    throw err;
  }
}
