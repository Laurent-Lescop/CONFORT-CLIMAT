/// <reference lib="webworker" />
/**
 * Worker de simulation du vent : exécute le solveur Boltzmann hors du thread principal et
 * renvoie régulièrement le champ de vitesse (instantané pendant la chauffe, moyen ensuite).
 */

import { WindSolveOut, WindSolveStart, solveWind } from '../utils/windSolveLoop';

export type WindWorkerStart = WindSolveStart & { type: 'start' };
export type WindWorkerOut = WindSolveOut;

let stopRequested = false;

self.onmessage = (e: MessageEvent<WindWorkerStart | { type: 'stop' }>) => {
  const msg = e.data;
  if (msg.type === 'stop') {
    stopRequested = true;
    return;
  }
  stopRequested = false;
  void solveWind(msg, {
    post: (out, transfer = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(out, transfer),
    shouldStop: () => stopRequested,
    yieldControl: () => new Promise((r) => setTimeout(r, 0)),
    chunkSteps: 25, // ≈ 150 ms entre deux points de contrôle d'un éventuel message d'arrêt
  });
};
