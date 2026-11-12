/**
 * Affichage de l'étude des ombres : image géoréférencée posée au sol (sous les bâtiments 3D) et
 * infobulle au survol (soleil / ombre à l'instant choisi, ou heures de soleil de la journée).
 */

import type { ImageSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { metersPerDegree } from './geoUtils';
import { fieldCorners } from './windField';
import type { DailySunResult, InstantShadowResult } from '../services/shadowStudy';

const SOURCE = 'shadow-image';
const LAYER = 'shadow-raster';

export type ShadowResult = InstantShadowResult | DailySunResult;

/** Palette des heures de soleil (type viridis) : 0 h bleu nuit → jour complet jaune. */
const SUN_STOPS: [number, [number, number, number]][] = [
  [0, [40, 30, 90]],
  [0.15, [59, 72, 140]],
  [0.3, [44, 114, 142]],
  [0.5, [33, 145, 140]],
  [0.7, [94, 201, 98]],
  [0.85, [190, 223, 38]],
  [1, [253, 231, 37]],
];

export function sunHoursColor(fraction: number): [number, number, number] {
  const f = Math.min(1, Math.max(0, fraction));
  let i = 0;
  while (i < SUN_STOPS.length - 2 && f > SUN_STOPS[i + 1][0]) i++;
  const [f0, c0] = SUN_STOPS[i];
  const [f1, c1] = SUN_STOPS[i + 1];
  const t = (f - f0) / (f1 - f0);
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
}

/** Dégradé CSS de la palette, pour la légende. */
export function sunHoursLegendGradient(): string {
  return `linear-gradient(to right, ${SUN_STOPS.map(([f, [r, g, b]]) => `rgb(${r},${g},${b}) ${Math.round(f * 100)}%`).join(', ')})`;
}

const fmtDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

export class ShadowOverlay {
  private result: ShadowResult | null = null;
  private visible = true;
  private readonly canvas = document.createElement('canvas');
  private url: string | null = null;
  private readonly tooltip: HTMLDivElement;
  private readonly onStyleLoad = () => this.ensureLayer();
  private readonly onMove = (e: MapMouseEvent) => this.updateTooltip(e);
  private readonly onLeave = () => this.hideTooltip();

  constructor(private readonly map: MapLibreMap) {
    this.tooltip = document.createElement('div');
    this.tooltip.setAttribute('role', 'status');
    this.tooltip.style.cssText =
      'position:absolute;z-index:15;pointer-events:none;display:none;max-width:230px;padding:7px 10px;border-radius:10px;' +
      'background:rgba(15,23,42,0.95);color:#e2e8f0;font:11px/1.45 system-ui,sans-serif;border:1px solid rgba(100,116,139,0.6);' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    map.getContainer().appendChild(this.tooltip);
    map.on('style.load', this.onStyleLoad);
  }

  setResult(result: ShadowResult | null) {
    this.result = result;
    if (!result) {
      this.url = null;
      this.removeLayer();
      this.hideTooltip();
      return;
    }
    const { n } = result.grid;
    this.canvas.width = n;
    this.canvas.height = n;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    const px = img.data;
    const ground = result.grid.ground;
    for (let iy = 0; iy < n; iy++) {
      const row = n - 1 - iy; // ligne 0 de la grille au sud, image nord en haut
      for (let ix = 0; ix < n; ix++) {
        const idx = iy * n + ix;
        if (!ground[idx]) continue;
        const o = (row * n + ix) * 4;
        if (result.kind === 'instant') {
          // Ombre : voile bleu nuit d'autant plus dense que le soleil direct est masqué
          const shade = result.sunUp ? 1 - result.transmission[idx] / 255 : 1;
          if (shade < 0.02) continue;
          // Voile sombre bien distinct des bâtiments clairs (bleu nuit presque opaque)
          px[o] = 10;
          px[o + 1] = 14;
          px[o + 2] = 46;
          px[o + 3] = Math.round(205 * shade);
        } else {
          const [r, g, b] = sunHoursColor(result.dayLengthMin ? result.minutes[idx] / result.dayLengthMin : 0);
          px[o] = r;
          px[o + 1] = g;
          px[o + 2] = b;
          px[o + 3] = 205;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    this.url = this.canvas.toDataURL('image/png');
    this.ensureLayer();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (this.map.getLayer(LAYER)) this.map.setLayoutProperty(LAYER, 'visibility', visible ? 'visible' : 'none');
    if (!visible) this.hideTooltip();
  }

  dispose() {
    this.map.off('style.load', this.onStyleLoad);
    this.removeLayer();
    this.tooltip.remove();
  }

  private beforeId(): string | undefined {
    const layers = (this.map.getStyle()?.layers ?? []) as any[];
    return layers.find((l) => l.id === 'osm-real-3d-buildings')?.id ?? layers.find((l) => l.type === 'fill-extrusion')?.id;
  }

  private ensureLayer() {
    const r = this.result;
    if (!r || !this.url) return;
    // Style en cours de chargement (tuiles qui arrivent après un mouvement de caméra) : on réessaie dès que la carte est prête
    if (!this.map.isStyleLoaded()) {
      this.map.once('idle', this.onStyleLoad);
      return;
    }
    const coordinates = fieldCorners({ center: r.grid.center, nx: r.grid.n, dx: r.grid.dx });
    const src = this.map.getSource(SOURCE) as ImageSource | undefined;
    if (src) src.updateImage({ url: this.url, coordinates });
    else this.map.addSource(SOURCE, { type: 'image', url: this.url, coordinates });
    if (!this.map.getLayer(LAYER)) {
      this.map.addLayer(
        {
          id: LAYER,
          type: 'raster',
          source: SOURCE,
          layout: { visibility: this.visible ? 'visible' : 'none' },
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
        },
        this.beforeId()
      );
    }
    this.map.off('mousemove', this.onMove);
    this.map.off('mouseout', this.onLeave);
    this.map.on('mousemove', this.onMove);
    this.map.on('mouseout', this.onLeave);
  }

  private removeLayer() {
    try {
      this.map.off('mousemove', this.onMove);
      this.map.off('mouseout', this.onLeave);
      if (this.map.getLayer(LAYER)) this.map.removeLayer(LAYER);
      if (this.map.getSource(SOURCE)) this.map.removeSource(SOURCE);
    } catch {
      // carte détruite
    }
  }

  private hideTooltip() {
    this.tooltip.style.display = 'none';
  }

  private updateTooltip(e: MapMouseEvent) {
    const r = this.result;
    if (!r || !this.visible) return this.hideTooltip();
    const g = r.grid;
    const m = metersPerDegree(g.center[1]);
    const x = (e.lngLat.lng - g.center[0]) * m.lng;
    const y = (e.lngLat.lat - g.center[1]) * m.lat;
    const ix = Math.floor((x + g.half) / g.dx);
    const iy = Math.floor((y + g.half) / g.dx);
    if (ix < 0 || iy < 0 || ix >= g.n || iy >= g.n) return this.hideTooltip();
    const idx = iy * g.n + ix;
    if (!g.ground[idx]) return this.hideTooltip();

    if (r.kind === 'instant') {
      const T = r.sunUp ? r.transmission[idx] / 255 : 0;
      this.tooltip.innerHTML = !r.sunUp
        ? '<b style="color:#fff">Soleil couché</b>'
        : T > 0.9
        ? '<b style="color:#fde68a">Au soleil</b>'
        : T < 0.05
        ? '<b style="color:#c7d2fe">À l’ombre</b>'
        : `<b style="color:#bbf7d0">Ombre filtrée par les arbres</b><br><span style="color:#94a3b8">${Math.round(T * 100)} % du soleil direct passe</span>`;
    } else {
      const mins = r.minutes[idx];
      this.tooltip.innerHTML =
        `<div style="font-weight:700;font-size:13px;color:#fff">${fmtDuration(mins)} de soleil</div>` +
        `<div style="color:#94a3b8">direct au sol, sur ${fmtDuration(r.dayLengthMin)} de jour (ciel clair)</div>`;
    }
    this.tooltip.style.display = 'block';
    const box = this.map.getContainer().getBoundingClientRect();
    const flipX = e.point.x > box.width - 250;
    this.tooltip.style.left = `${flipX ? e.point.x - 14 - this.tooltip.offsetWidth : e.point.x + 14}px`;
    this.tooltip.style.top = `${Math.max(4, e.point.y - 10)}px`;
  }
}
