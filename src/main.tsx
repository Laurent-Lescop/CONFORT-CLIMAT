import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as maplibregl from 'maplibre-gl';
import App from './App.tsx';
import './index.css';

// Configure self-contained MapLibre worker to prevent worker resolution failure
if (typeof window !== 'undefined') {
  // Filter out benign Mapbox/MapLibre projection "name" property validation warnings
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : a?.message || '')).join(' ');
    if (msg.includes('unknown property "name"')) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('unknown property "name"')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (reason.includes('unknown property "name"')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  try {
    const workerUrl = new URL('/maplibre-gl-worker.cjs', window.location.href).href;
    maplibregl.setWorkerUrl(workerUrl);
  } catch (err) {
    console.warn('Could not initialize maplibre worker URL:', err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
