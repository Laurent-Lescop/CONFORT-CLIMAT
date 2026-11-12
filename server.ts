import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Google Gen AI
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Endpoint for Live Search Grounding using gemini-3.5-flash
app.post('/api/gemini/grounded-search', async (req: Request, res: Response) => {
  const { query, itemContext } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'La requête de recherche est requise.' });
  }

  if (!ai) {
    return res.status(503).json({
      error: 'Clé API Gemini non configurée dans l\'environnement.',
      offlineMode: true,
      text: 'Le service d\'intelligence augmentée nécessite la configuration de GEMINI_API_KEY sur le serveur.'
    });
  }

  try {
    const prompt = `Tu es un expert cartographe et urbaniste spécialiste de l'Île de Nantes (Loire-Atlantique, France).
L'utilisateur te pose une question sur un lieu, un projet urbain, un événement ou l'actualité de l'île.

${itemContext ? `Contexte spécifique sélectionné :
- Nom : ${itemContext.name}
- Type : ${itemContext.type === 'project' ? 'Projet urbain' : 'Lieu d\'intérêt'}
- Description : ${itemContext.description}
- Statut / Calendrier : ${itemContext.status || 'N/A'}` : ''}

Question : "${query}"

Consignes :
1. Fournis une réponse factuelle, précise, claire et structurée en français.
2. Si des informations récentes sont disponibles via Google Search (horaires, chantier, expositions en cours, programmation Scopitone ou Voyage à Nantes), inclus-les fidèlement.
3. Mentionne si une donnée est soumise à confirmation.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const candidate = response.candidates?.[0];
    const text = response.text || '';
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    const webSearchQueries = candidate?.groundingMetadata?.webSearchQueries || [];

    // Extract citations
    const sources = groundingChunks
      .filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web?.title || 'Source web',
        url: chunk.web?.uri,
      }));

    return res.json({
      text,
      sources,
      webSearchQueries,
      modelUsed: 'gemini-3.5-flash (Google Search Grounded)',
    });
  } catch (error: any) {
    console.error('Erreur Gemini Grounded Search:', error);
    return res.status(500).json({
      error: 'Erreur lors de l\'interrogation de l\'assistant.',
      details: error.message || 'Erreur inconnue',
    });
  }
});

// Endpoint for In-Depth Urban & Architectural Thinking using gemini-3.1-pro-preview with HIGH thinking
app.post('/api/gemini/deep-analysis', async (req: Request, res: Response) => {
  const { topic, itemContext } = req.body;

  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'Le sujet d\'analyse est requis.' });
  }

  if (!ai) {
    return res.status(503).json({
      error: 'Clé API Gemini non configurée dans l\'environnement.',
      offlineMode: true,
      text: 'Le service d\'analyse approfondie nécessite la clé GEMINI_API_KEY sur le serveur.'
    });
  }

  try {
    const prompt = `Tu es un architecte-urbaniste de renommée internationale, membre du comité scientifique de l'Île de Nantes.
Réalise une réflexion approfondie et argumentée sur la question suivante relative à l'Île de Nantes :

"${topic}"

${itemContext ? `Élément étudié :
- Nom : ${itemContext.name} (${itemContext.category})
- Architecte / Maîtrise d'œuvre : ${itemContext.architect || 'Non spécifié'}
- Calendrier / Statut : ${itemContext.status}
- Résumé : ${itemContext.shortDescription}` : ''}

Structure ton analyse :
1. Enjeux spatiaux et paysagers insulaires (relation à la Loire, corridors écologiques, vents dominants estuariens).
2. Typologies architecturales et mémoire industrielle (béton brut, charpentes métalliques, matériaux biosourcés).
3. Impact sociologique et usages métropolitains.
4. Synthèse critique et perspectives à l'horizon 2030.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingLevel: 'HIGH' as any,
        },
        // DO NOT set maxOutputTokens when using thinking
      },
    });

    return res.json({
      text: response.text || '',
      modelUsed: 'gemini-3.1-pro-preview (High Thinking Mode)',
    });
  } catch (error: any) {
    console.error('Erreur Gemini Deep Analysis:', error);
    return res.status(500).json({
      error: 'Erreur lors de l\'analyse approfondie.',
      details: error.message || 'Erreur inconnue',
    });
  }
});

// Serve static files from public directory (workers, geojson, data)
app.use(express.static(path.resolve(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.cjs') || filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    }
  }
}));

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atlas Île de Nantes server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
