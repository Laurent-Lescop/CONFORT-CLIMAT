/**
 * Scène 3D légère pour le calque WebGL personnalisé : lignes, points et sphères.
 * Les coordonnées sont en mètres (est, nord, haut) relatives à un point d'origine [lng, lat].
 */

export type RGBA = [number, number, number, number]; // composantes 0..1

export interface GlSphere {
  /** Position (est, nord, haut) en mètres */
  pos: [number, number, number];
  radius: number;
  color: RGBA;
}

export interface GlScene {
  origin: [number, number];
  /** 11 flottants par segment : ax, ay, az, bx, by, bz, r, g, b, a, largeur (px) */
  lines: Float32Array;
  /** 9 flottants par point : x, y, z, r, g, b, a, taille (px), doux (0 = disque net, 1 = halo) */
  points: Float32Array;
  spheres: GlSphere[];
}

export const LINE_STRIDE = 11;
export const POINT_STRIDE = 9;

export function hexToRgba(hex: string, alpha = 1): RGBA {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

/** Mélange linéaire de deux couleurs. */
export function mixRgba(a: RGBA, b: RGBA, t: number): RGBA {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}

/** Construit une scène en accumulant des segments, polylignes, points et sphères. */
export class GlSceneBuilder {
  private lines: number[] = [];
  private points: number[] = [];
  private spheres: GlSphere[] = [];

  constructor(private origin: [number, number]) {}

  segment(a: [number, number, number], b: [number, number, number], color: RGBA, widthPx: number) {
    this.lines.push(a[0], a[1], a[2], b[0], b[1], b[2], color[0], color[1], color[2], color[3], widthPx);
  }

  polyline(pts: [number, number, number][], color: RGBA, widthPx: number) {
    for (let i = 0; i < pts.length - 1; i++) this.segment(pts[i], pts[i + 1], color, widthPx);
  }

  point(pos: [number, number, number], color: RGBA, sizePx: number, soft = false) {
    this.points.push(pos[0], pos[1], pos[2], color[0], color[1], color[2], color[3], sizePx, soft ? 1 : 0);
  }

  sphere(pos: [number, number, number], radius: number, color: RGBA) {
    this.spheres.push({ pos, radius, color });
  }

  build(): GlScene {
    return {
      origin: this.origin,
      lines: new Float32Array(this.lines),
      points: new Float32Array(this.points),
      spheres: this.spheres,
    };
  }
}
