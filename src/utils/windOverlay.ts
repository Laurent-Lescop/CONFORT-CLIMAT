/**
 * Visualisation du vent sur la carte :
 *  - carte de vitesse au sol (rapport U/U∞) sous les bâtiments 3D ;
 *  - particules animées avec traînées (calque WebGL, masquées derrière les bâtiments).
 * L'animation est accélérée : un rapport de vitesse de 1 avance d'environ 45 m/s à l'écran.
 */

import type { ImageSource, Map as MapLibreMap } from 'maplibre-gl';
import { GlOverlayLayer } from './glOverlayLayer';
import { GlScene, LINE_STRIDE } from './glScene';
import {
  WIND_ANIMATION_SPEED_MS,
  WindField,
  fieldCorners,
  renderSpeedCanvas,
  sampleField,
  speedColor,
} from './windField';
import { attachCustomLayer } from './mapOverlays';

const PARTICLES = 2200;
const TRAIL_POINTS = 11; // points mémorisés par particule
const TRAIL_EVERY_FRAMES = 3;
const PARTICLE_HEIGHT_M = 2;
const IMAGE_SOURCE = 'wind-speed-image';
const IMAGE_LAYER = 'wind-speed-raster';

export class WindOverlay {
  private readonly glLayer = new GlOverlayLayer('wind-gl');
  private readonly detachGl: () => void;
  private field: WindField | null = null;
  private showParticles = true;
  private showSpeedMap = true;
  private readonly canvas = document.createElement('canvas');
  private imageDirty = false;

  // Particules : positions en mètres relatives au centre du domaine
  private px = new Float32Array(PARTICLES);
  private py = new Float32Array(PARTICLES);
  private age = new Float32Array(PARTICLES);
  private life = new Float32Array(PARTICLES);
  private trail = new Float32Array(PARTICLES * TRAIL_POINTS * 2);
  private trailLen = new Uint8Array(PARTICLES);
  private speed = new Float32Array(PARTICLES);
  private lineBuf = new Float32Array(PARTICLES * (TRAIL_POINTS - 1) * LINE_STRIDE);
  private frame = 0;
  private raf = 0;
  private lastTime = 0;
  private readonly tmp = { u: 0, v: 0, solid: false };
  private readonly onStyleLoad = () => this.ensureImageLayer();

  constructor(private readonly map: MapLibreMap) {
    this.detachGl = attachCustomLayer(map, this.glLayer);
    map.on('style.load', this.onStyleLoad);
  }

  setField(field: WindField | null) {
    const first = !this.field;
    this.field = field;
    if (!field) {
      this.glLayer.setScene(null);
      this.removeImageLayer();
      this.stopLoop();
      return;
    }
    if (first) this.resetParticles();
    this.imageDirty = true;
    this.ensureImageLayer();
    this.startLoop();
  }

  setVisibility(opts: { particles?: boolean; speedMap?: boolean }) {
    if (opts.particles !== undefined) this.showParticles = opts.particles;
    if (opts.speedMap !== undefined) this.showSpeedMap = opts.speedMap;
    if (this.map.getLayer(IMAGE_LAYER)) {
      this.map.setLayoutProperty(IMAGE_LAYER, 'visibility', this.showSpeedMap ? 'visible' : 'none');
    }
    this.glLayer.setVisible(this.showParticles);
    if (this.showParticles && this.field) this.startLoop();
    else this.stopLoop();
  }

  dispose() {
    this.stopLoop();
    this.map.off('style.load', this.onStyleLoad);
    this.detachGl();
    this.removeImageLayer();
  }

  // ---- Carte de vitesse (image géoréférencée) ----

  private beforeId(): string | undefined {
    const layers = (this.map.getStyle()?.layers ?? []) as any[];
    return (
      layers.find((l) => l.id === 'osm-real-3d-buildings')?.id ??
      layers.find((l) => l.type === 'fill-extrusion')?.id
    );
  }

  private ensureImageLayer() {
    const f = this.field;
    if (!f) return;
    // Style en cours de chargement (tuiles qui arrivent après un mouvement de caméra) : on réessaie dès que la carte est prête
    if (!this.map.isStyleLoaded()) {
      this.map.once('idle', this.onStyleLoad);
      return;
    }
    const coordinates = fieldCorners(f);
    if (this.imageDirty || !this.map.getSource(IMAGE_SOURCE)) {
      renderSpeedCanvas(f, this.canvas);
      const url = this.canvas.toDataURL('image/png');
      const src = this.map.getSource(IMAGE_SOURCE) as ImageSource | undefined;
      if (src) src.updateImage({ url, coordinates });
      else this.map.addSource(IMAGE_SOURCE, { type: 'image', url, coordinates });
      this.imageDirty = false;
    }
    if (!this.map.getLayer(IMAGE_LAYER)) {
      this.map.addLayer(
        {
          id: IMAGE_LAYER,
          type: 'raster',
          source: IMAGE_SOURCE,
          layout: { visibility: this.showSpeedMap ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
        },
        this.beforeId()
      );
    }
  }

  private removeImageLayer() {
    try {
      if (this.map.getLayer(IMAGE_LAYER)) this.map.removeLayer(IMAGE_LAYER);
      if (this.map.getSource(IMAGE_SOURCE)) this.map.removeSource(IMAGE_SOURCE);
    } catch {
      // carte détruite
    }
  }

  // ---- Particules ----

  private spawn(i: number) {
    const f = this.field!;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * f.radiusM * 0.99;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      sampleField(f, x, y, this.tmp);
      if (!this.tmp.solid) {
        this.px[i] = x;
        this.py[i] = y;
        break;
      }
    }
    this.age[i] = 0;
    this.life[i] = 2.5 + Math.random() * 3.5;
    this.trailLen[i] = 0;
  }

  private resetParticles() {
    for (let i = 0; i < PARTICLES; i++) {
      this.spawn(i);
      this.age[i] = Math.random() * this.life[i]; // âges répartis pour éviter une apparition synchronisée
    }
  }

  private startLoop() {
    if (this.raf || !this.showParticles || !this.field) return;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.stepParticles(dt);
      this.glLayer.setScene(this.buildScene());
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private stepParticles(dt: number) {
    const f = this.field;
    if (!f) return;
    const r2 = f.radiusM * f.radiusM;
    this.frame++;
    const record = this.frame % TRAIL_EVERY_FRAMES === 0;
    for (let i = 0; i < PARTICLES; i++) {
      sampleField(f, this.px[i], this.py[i], this.tmp);
      if (this.tmp.solid) {
        this.spawn(i);
        continue;
      }
      const ratio = Math.hypot(this.tmp.u, this.tmp.v);
      this.speed[i] = ratio;
      this.px[i] += this.tmp.u * WIND_ANIMATION_SPEED_MS * dt;
      this.py[i] += this.tmp.v * WIND_ANIMATION_SPEED_MS * dt;
      this.age[i] += dt;
      if (this.age[i] > this.life[i] || this.px[i] * this.px[i] + this.py[i] * this.py[i] > r2) {
        this.spawn(i);
        continue;
      }
      if (record) {
        const base = i * TRAIL_POINTS * 2;
        // Décale la traînée d'un cran et ajoute le point courant en tête
        const len = Math.min(TRAIL_POINTS, this.trailLen[i] + 1);
        for (let k = len - 1; k > 0; k--) {
          this.trail[base + k * 2] = this.trail[base + (k - 1) * 2];
          this.trail[base + k * 2 + 1] = this.trail[base + (k - 1) * 2 + 1];
        }
        this.trail[base] = this.px[i];
        this.trail[base + 1] = this.py[i];
        this.trailLen[i] = len;
      }
    }
  }

  private buildScene(): GlScene | null {
    const f = this.field;
    if (!f) return null;
    const buf = this.lineBuf;
    let n = 0;
    for (let i = 0; i < PARTICLES; i++) {
      const len = this.trailLen[i];
      if (len < 2) continue;
      const [r, g, b] = speedColor(this.speed[i]);
      // Fondu en début et fin de vie
      const lifeFade = Math.min(1, this.age[i] / 0.4, (this.life[i] - this.age[i]) / 0.6);
      const base = i * TRAIL_POINTS * 2;
      for (let k = 0; k < len - 1; k++) {
        const o = n * LINE_STRIDE;
        buf[o] = this.trail[base + k * 2];
        buf[o + 1] = this.trail[base + k * 2 + 1];
        buf[o + 2] = PARTICLE_HEIGHT_M;
        buf[o + 3] = this.trail[base + (k + 1) * 2];
        buf[o + 4] = this.trail[base + (k + 1) * 2 + 1];
        buf[o + 5] = PARTICLE_HEIGHT_M;
        buf[o + 6] = r / 255;
        buf[o + 7] = g / 255;
        buf[o + 8] = b / 255;
        buf[o + 9] = Math.max(0, lifeFade) * 0.9 * (1 - k / len);
        buf[o + 10] = 1.5;
        n++;
      }
    }
    return {
      origin: f.center,
      lines: buf.subarray(0, n * LINE_STRIDE),
      points: new Float32Array(0),
      spheres: [],
    };
  }
}
