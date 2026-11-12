/**
 * Affichage de la carte de confort thermique : image géoréférencée posée au sol (sous les bâtiments 3D)
 * et infobulle de survol donnant UTCI, Tmrt, vent, ombre et ciel visible à l'endroit pointé.
 */

import type { ImageSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { UTCI_CATEGORIES, utciCategoryId } from './utci';
import { COMFORT_NO_DATA, ComfortResult } from './comfortModel';
import { LngLat, metersPerDegree } from './geoUtils';
import { fieldCorners } from './windField';

const SOURCE = 'comfort-image';
const LAYER = 'comfort-raster';

export class ComfortOverlay {
  private result: ComfortResult | null = null;
  private center: LngLat = [0, 0];
  private visible = true;
  private blobUrl: string | null = null;
  private readonly tooltip: HTMLDivElement;
  private token = 0;
  private readonly onStyleLoad = () => this.ensureLayer();
  private readonly onMove = (e: MapMouseEvent) => this.updateTooltip(e);
  private readonly onLeave = () => this.hideTooltip();

  constructor(private readonly map: MapLibreMap) {
    this.tooltip = document.createElement('div');
    this.tooltip.setAttribute('role', 'status');
    this.tooltip.style.cssText =
      'position:absolute;z-index:15;pointer-events:none;display:none;max-width:230px;padding:8px 10px;border-radius:10px;' +
      'background:rgba(15,23,42,0.95);color:#e2e8f0;font:11px/1.45 system-ui,sans-serif;border:1px solid rgba(100,116,139,0.6);' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    map.getContainer().appendChild(this.tooltip);
    map.on('style.load', this.onStyleLoad);
  }

  /** Affiche un résultat (ou l'efface avec null). L'encodage de l'image est asynchrone. */
  async setResult(result: ComfortResult | null, center: LngLat) {
    this.result = result;
    this.center = center;
    const token = ++this.token;
    if (!result) {
      this.removeLayer();
      this.hideTooltip();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = result.n;
    canvas.height = result.n;
    const pixels = new Uint8ClampedArray(result.rgba.buffer as ArrayBuffer, result.rgba.byteOffset, result.rgba.length);
    canvas.getContext('2d')!.putImageData(new ImageData(pixels, result.n, result.n), 0, 0);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (token !== this.token || !blob) return; // un résultat plus récent a pris le relais
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = URL.createObjectURL(blob);
    this.ensureLayer();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (this.map.getLayer(LAYER)) this.map.setLayoutProperty(LAYER, 'visibility', visible ? 'visible' : 'none');
    if (!visible) this.hideTooltip();
  }

  dispose() {
    this.token++;
    this.map.off('style.load', this.onStyleLoad);
    this.map.off('mousemove', this.onMove);
    this.map.off('mouseout', this.onLeave);
    this.removeLayer();
    this.tooltip.remove();
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
  }

  private beforeId(): string | undefined {
    const layers = (this.map.getStyle()?.layers ?? []) as any[];
    return (
      layers.find((l) => l.id === 'osm-real-3d-buildings')?.id ?? layers.find((l) => l.type === 'fill-extrusion')?.id
    );
  }

  private ensureLayer() {
    const r = this.result;
    if (!r || !this.blobUrl) return;
    // Style en cours de chargement (tuiles qui arrivent après un mouvement de caméra) : on réessaie dès que la carte est prête
    if (!this.map.isStyleLoaded()) {
      this.map.once('idle', this.onStyleLoad);
      return;
    }
    const coordinates = fieldCorners({ center: this.center, nx: r.n, dx: r.dx });
    const src = this.map.getSource(SOURCE) as ImageSource | undefined;
    if (src) {
      src.updateImage({ url: this.blobUrl, coordinates });
    } else {
      this.map.addSource(SOURCE, { type: 'image', url: this.blobUrl, coordinates });
    }
    if (!this.map.getLayer(LAYER)) {
      this.map.addLayer(
        {
          id: LAYER,
          type: 'raster',
          source: SOURCE,
          layout: { visibility: this.visible ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
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
    const m = metersPerDegree(this.center[1]);
    const x = (e.lngLat.lng - this.center[0]) * m.lng;
    const y = (e.lngLat.lat - this.center[1]) * m.lat;
    const ix = Math.floor((x + r.half) / r.dx);
    const iy = Math.floor((y + r.half) / r.dx);
    if (ix < 0 || iy < 0 || ix >= r.n || iy >= r.n) return this.hideTooltip();
    const idx = iy * r.n + ix;
    if (r.utci[idx] === COMFORT_NO_DATA) return this.hideTooltip();

    const utci = r.utci[idx] / 100;
    const cat = UTCI_CATEGORIES[utciCategoryId(utci)];
    const [cr, cg, cb] = cat.color;
    const shade = r.beam[idx] / 255;
    const sunText = shade > 0.9 ? 'Plein soleil' : shade < 0.05 ? 'À l’ombre' : `Ombre partielle (${Math.round((1 - shade) * 100)} %)`;
    this.tooltip.innerHTML =
      `<div style="font-weight:700;font-size:13px;color:#fff">${utci.toFixed(1)} °C <span style="font-weight:600;color:rgb(${cr},${cg},${cb})">UTCI</span></div>` +
      `<div style="color:rgb(${cr},${cg},${cb});font-weight:600">${cat.label}</div>` +
      `<div style="margin-top:4px;color:#94a3b8">${sunText}<br>Tmrt ${(r.tmrt[idx] / 100).toFixed(1)} °C<br>Vent ${(r.wind[idx] / 10).toFixed(1)} m/s (équivalent 10 m)<br>Ciel visible ${Math.round((r.svf[idx] / 255) * 100)} %</div>`;
    this.tooltip.style.display = 'block';
    const box = this.map.getContainer().getBoundingClientRect();
    const px = e.point.x;
    const py = e.point.y;
    const flipX = px > box.width - 250;
    this.tooltip.style.left = `${flipX ? px - 14 - this.tooltip.offsetWidth : px + 14}px`;
    this.tooltip.style.top = `${Math.max(4, py - 10)}px`;
  }
}
