/// <reference lib="webworker" />
/**
 * Worker de la carte de confort thermique (UTCI) : exécute le calcul lourd hors du thread principal.
 */

import { ComfortInput, ComfortResult, computeComfort } from '../utils/comfortModel';

export interface ComfortWorkerStart {
  type: 'start';
  input: ComfortInput;
}

export type ComfortWorkerOut =
  | { type: 'progress'; phase: string; fraction: number }
  | { type: 'done'; result: ComfortResult }
  | { type: 'error'; message: string };

const post = (msg: ComfortWorkerOut, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<ComfortWorkerStart>) => {
  if (e.data.type !== 'start') return;
  try {
    let lastReport = 0;
    const result = await computeComfort(
      e.data.input,
      (phase, fraction) => {
        const now = performance.now();
        if (now - lastReport > 120 || fraction === 0) {
          lastReport = now;
          post({ type: 'progress', phase, fraction });
        }
      },
      () => new Promise((r) => setTimeout(r, 0))
    );
    post({ type: 'done', result }, [
      result.utci.buffer,
      result.tmrt.buffer,
      result.wind.buffer,
      result.beam.buffer,
      result.svf.buffer,
      result.rgba.buffer,
    ]);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
