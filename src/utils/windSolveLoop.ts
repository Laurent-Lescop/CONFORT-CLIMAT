/**
 * Boucle de résolution du vent, partagée entre le Web Worker (cas normal) et le thread principal
 * (repli si le worker ne peut pas démarrer dans le navigateur).
 */

import { LbmSolver } from './windLbm';

export interface WindSolveStart {
  nx: number;
  ny: number;
  solid: Uint8Array;
  windEast: number;
  windNorth: number;
  warmupSteps: number;
  averagingSteps: number;
  reportEvery: number;
}

export type WindSolveOut =
  | { type: 'progress'; phase: 'warmup' | 'averaging'; step: number; total: number; u: Float32Array; v: Float32Array; averaged: boolean }
  | { type: 'done'; u: Float32Array; v: Float32Array; steps: number; msPerStep: number }
  | { type: 'error'; message: string };

export interface WindSolveIo {
  post: (msg: WindSolveOut, transfer?: Transferable[]) => void;
  shouldStop: () => boolean;
  /** Rend la main à la boucle d'événements (annulation, rafraîchissement de l'interface) */
  yieldControl: () => Promise<void>;
  /** Nombre de pas entre deux « respirations » : grand dans un worker, petit sur le thread principal */
  chunkSteps: number;
}

export async function solveWind(start: WindSolveStart, io: WindSolveIo): Promise<void> {
  try {
    const sim = new LbmSolver({
      nx: start.nx,
      ny: start.ny,
      solid: start.solid,
      windEast: start.windEast,
      windNorth: start.windNorth,
    });
    const total = start.warmupSteps + start.averagingSteps;
    const t0 = performance.now();
    const CHUNK = Math.max(1, io.chunkSteps);

    for (let step = 0; step < total && !io.shouldStop(); ) {
      const target = Math.min(total, step + CHUNK);
      for (; step < target; step++) sim.step(step >= start.warmupSteps);
      if (sim.isDiverged()) {
        io.post({
          type: 'error',
          message: 'La simulation est devenue instable (valeurs non finies). Essayez une autre direction ou un rayon plus petit.',
        });
        return;
      }
      if (step % start.reportEvery < CHUNK || step === total) {
        const { u, v, averaged } = sim.getVelocityRatio();
        io.post(
          { type: 'progress', phase: step < start.warmupSteps ? 'warmup' : 'averaging', step, total, u, v, averaged },
          [u.buffer, v.buffer]
        );
      }
      await io.yieldControl();
    }
    const { u, v } = sim.getVelocityRatio();
    io.post(
      { type: 'done', u, v, steps: sim.steps, msPerStep: (performance.now() - t0) / Math.max(1, sim.steps) },
      [u.buffer, v.buffer]
    );
  } catch (err) {
    io.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}
