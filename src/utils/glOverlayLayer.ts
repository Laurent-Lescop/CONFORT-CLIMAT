/**
 * Calque WebGL personnalisé pour MapLibre : lignes fines lissées (largeur en pixels),
 * points ronds et sphères ombrées, avec test de profondeur contre les bâtiments 3D.
 *
 * Les positions arrivent en mètres relatifs à une origine [lng, lat] ; elles sont converties en
 * coordonnées Mercator relatives à cette origine, et la translation est appliquée en double
 * précision dans la matrice, ce qui évite le tremblement des petites géométries en gros plan.
 */

import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { GlScene, LINE_STRIDE, POINT_STRIDE } from './glScene';

const LINE_VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_dpr;
in vec3 a_a;
in vec3 a_b;
in vec4 a_color;
in float a_width;
out vec4 v_color;
out float v_dist;
out float v_hw;
void main() {
  int id = gl_VertexID;
  float t = float(id / 2);
  float side = (id % 2 == 0) ? -1.0 : 1.0;
  vec4 ca = u_matrix * vec4(a_a, 1.0);
  vec4 cb = u_matrix * vec4(a_b, 1.0);
  if (ca.w <= 0.0 || cb.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 half_vp = u_viewport * 0.5;
  vec2 sa = ca.xy / ca.w * half_vp;
  vec2 sb = cb.xy / cb.w * half_vp;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw0 = a_width * u_dpr * 0.5;
  float hw = hw0 + 0.75;
  vec4 c = mix(ca, cb, t);
  vec2 s = mix(sa, sb, t);
  s += dir * hw * (t * 2.0 - 1.0);
  s += nrm * side * hw;
  gl_Position = vec4(s / half_vp * c.w, c.z, c.w);
  v_color = a_color;
  v_dist = side * hw;
  v_hw = hw0;
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec4 v_color;
in float v_dist;
in float v_hw;
out vec4 outColor;
void main() {
  float a = clamp(v_hw + 0.5 - abs(v_dist), 0.0, 1.0) * v_color.a;
  outColor = vec4(v_color.rgb * a, a);
}`;

const POINT_VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_dpr;
in vec3 a_pos;
in vec4 a_color;
in float a_size;
in float a_soft;
out vec4 v_color;
out vec2 v_local;
out float v_radius;
out float v_half;
out float v_soft;
void main() {
  int id = gl_VertexID;
  vec2 corner = vec2(float(id % 2) * 2.0 - 1.0, float(id / 2) * 2.0 - 1.0);
  vec4 c = u_matrix * vec4(a_pos, 1.0);
  if (c.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float radius = a_size * u_dpr * 0.5;
  float half_ext = radius + 1.0;
  vec2 half_vp = u_viewport * 0.5;
  vec2 s = c.xy / c.w * half_vp + corner * half_ext;
  gl_Position = vec4(s / half_vp * c.w, c.z, c.w);
  v_color = a_color;
  v_local = corner * half_ext;
  v_radius = radius;
  v_half = half_ext;
  v_soft = a_soft;
}`;

const POINT_FS = `#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_local;
in float v_radius;
in float v_half;
in float v_soft;
out vec4 outColor;
void main() {
  float dist = length(v_local);
  float a = v_soft > 0.5
    ? pow(clamp(1.0 - dist / v_half, 0.0, 1.0), 2.0)
    : clamp(v_radius + 0.5 - dist, 0.0, 1.0);
  a *= v_color.a;
  outColor = vec4(v_color.rgb * a, a);
}`;

const SPHERE_VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
uniform vec3 u_center;
uniform float u_radius;
in vec3 a_pos;
out vec3 v_n;
void main() {
  v_n = a_pos;
  gl_Position = u_matrix * vec4(u_center + a_pos * u_radius, 1.0);
}`;

const SPHERE_FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
in vec3 v_n;
out vec4 outColor;
void main() {
  vec3 n = normalize(v_n);
  // Repère Mercator : x = est, y = sud, z = haut
  vec3 L = normalize(vec3(-0.45, -0.55, 0.75));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 28.0);
  vec3 col = u_color.rgb * (0.42 + 0.7 * diff) + vec3(1.0, 0.97, 0.85) * spec * 0.55;
  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader : ' + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Programme : ' + gl.getProgramInfoLog(p));
  return p;
}

interface InstancedBatch {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
}

export class GlOverlayLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private lineProg: WebGLProgram | null = null;
  private pointProg: WebGLProgram | null = null;
  private sphereProg: WebGLProgram | null = null;
  private lineBatch: InstancedBatch | null = null;
  private pointBatch: InstancedBatch | null = null;
  private sphereVao: WebGLVertexArrayObject | null = null;
  private sphereIndexCount = 0;
  private scene: GlScene | null = null;
  /** Données converties en offsets Mercator relatifs à l'origine */
  private lineData: Float32Array = new Float32Array(0);
  private pointData: Float32Array = new Float32Array(0);
  private lineCount = 0;
  private pointCount = 0;
  private origin: { x: number; y: number } = { x: 0, y: 0 };
  private k = 1; // mètres -> unités Mercator
  private dirty = true;
  private visible = true;

  constructor(id: string) {
    this.id = id;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.map?.triggerRepaint();
  }

  setScene(scene: GlScene | null) {
    this.scene = scene;
    if (scene) this.convert(scene);
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  /** Mètres (est, nord, haut) -> offsets Mercator (x vers l'est, y vers le sud, z vers le haut). */
  private convert(scene: GlScene) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng: scene.origin[0], lat: scene.origin[1] }, 0);
    this.origin = { x: mc.x, y: mc.y };
    this.k = mc.meterInMercatorCoordinateUnits();
    const k = this.k;
    // Les tampons sont réutilisés d'une image à l'autre (la simulation de vent met la scène à jour à chaque frame)
    const L = scene.lines;
    const nl = Math.floor(L.length / LINE_STRIDE);
    if (this.lineData.length < L.length) this.lineData = new Float32Array(Math.max(L.length, this.lineData.length * 2));
    const ld = this.lineData;
    for (let i = 0; i < nl; i++) {
      const o = i * LINE_STRIDE;
      ld[o] = L[o] * k;
      ld[o + 1] = -L[o + 1] * k;
      ld[o + 2] = L[o + 2] * k;
      ld[o + 3] = L[o + 3] * k;
      ld[o + 4] = -L[o + 4] * k;
      ld[o + 5] = L[o + 5] * k;
      for (let j = 6; j < LINE_STRIDE; j++) ld[o + j] = L[o + j];
    }
    this.lineCount = nl;
    const P = scene.points;
    const np = Math.floor(P.length / POINT_STRIDE);
    if (this.pointData.length < P.length) this.pointData = new Float32Array(Math.max(P.length, this.pointData.length * 2));
    const pd = this.pointData;
    for (let i = 0; i < np; i++) {
      const o = i * POINT_STRIDE;
      pd[o] = P[o] * k;
      pd[o + 1] = -P[o + 1] * k;
      pd[o + 2] = P[o + 2] * k;
      for (let j = 3; j < POINT_STRIDE; j++) pd[o + j] = P[o + j];
    }
    this.pointCount = np;
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    this.lineProg = link(gl, LINE_VS, LINE_FS);
    this.pointProg = link(gl, POINT_VS, POINT_FS);
    this.sphereProg = link(gl, SPHERE_VS, SPHERE_FS);
    this.lineBatch = this.createBatch(gl, this.lineProg, [
      ['a_a', 3], ['a_b', 3], ['a_color', 4], ['a_width', 1],
    ], LINE_STRIDE);
    this.pointBatch = this.createBatch(gl, this.pointProg, [
      ['a_pos', 3], ['a_color', 4], ['a_size', 1], ['a_soft', 1],
    ], POINT_STRIDE);
    this.createSphereMesh(gl);
    this.dirty = true;
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext) {
    if (this.lineBatch) {
      gl.deleteBuffer(this.lineBatch.buffer);
      gl.deleteVertexArray(this.lineBatch.vao);
    }
    if (this.pointBatch) {
      gl.deleteBuffer(this.pointBatch.buffer);
      gl.deleteVertexArray(this.pointBatch.vao);
    }
    if (this.sphereVao) gl.deleteVertexArray(this.sphereVao);
    [this.lineProg, this.pointProg, this.sphereProg].forEach((p) => p && gl.deleteProgram(p));
    this.lineBatch = this.pointBatch = null;
    this.sphereVao = null;
    this.map = null;
    this.gl = null;
  }

  private createBatch(
    gl: WebGL2RenderingContext,
    prog: WebGLProgram,
    attrs: [string, number][],
    stride: number
  ): InstancedBatch {
    const vao = gl.createVertexArray()!;
    const buffer = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    let offset = 0;
    for (const [name, size] of attrs) {
      const loc = gl.getAttribLocation(prog, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
        gl.vertexAttribDivisor(loc, 1);
      }
      offset += size;
    }
    gl.bindVertexArray(null);
    return { vao, buffer, count: 0 };
  }

  private createSphereMesh(gl: WebGL2RenderingContext) {
    const lat = 18;
    const lon = 28;
    const verts: number[] = [];
    for (let i = 0; i <= lat; i++) {
      const th = (i / lat) * Math.PI;
      for (let j = 0; j <= lon; j++) {
        const ph = (j / lon) * Math.PI * 2;
        verts.push(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = i * (lon + 1) + j;
        const b = a + lon + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.sphereProg!, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.sphereVao = vao;
    this.sphereIndexCount = idx.length;
  }

  private upload(gl: WebGL2RenderingContext, batch: InstancedBatch, data: Float32Array, count: number, stride: number) {
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * stride), gl.DYNAMIC_DRAW);
    batch.count = count;
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput) {
    if (!this.visible || !this.scene || !this.lineBatch || !this.pointBatch || !this.sphereVao) return;

    if (this.dirty) {
      this.upload(gl, this.lineBatch, this.lineData, this.lineCount, LINE_STRIDE);
      this.upload(gl, this.pointBatch, this.pointData, this.pointCount, POINT_STRIDE);
      this.dirty = false;
    }

    // M = mainMatrix × translation(origine), calculé en double précision
    const m = options.defaultProjectionData.mainMatrix as ArrayLike<number>;
    const tx = this.origin.x;
    const ty = this.origin.y;
    const M = new Float32Array(16);
    for (let r = 0; r < 4; r++) {
      M[r] = m[r];
      M[4 + r] = m[4 + r];
      M[8 + r] = m[8 + r];
      M[12 + r] = m[r] * tx + m[4 + r] * ty + m[12 + r];
    }

    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = canvas.clientWidth > 0 ? gl.drawingBufferWidth / canvas.clientWidth : 1;
    const vw = gl.drawingBufferWidth;
    const vh = gl.drawingBufferHeight;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);

    // 1. Sphères opaques (écrivent la profondeur)
    if (this.scene.spheres.length > 0) {
      gl.useProgram(this.sphereProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.sphereProg!, 'u_matrix'), false, M);
      gl.bindVertexArray(this.sphereVao);
      gl.depthMask(true);
      for (const s of this.scene.spheres) {
        gl.uniform3f(
          gl.getUniformLocation(this.sphereProg!, 'u_center'),
          s.pos[0] * this.k,
          -s.pos[1] * this.k,
          s.pos[2] * this.k
        );
        gl.uniform1f(gl.getUniformLocation(this.sphereProg!, 'u_radius'), s.radius * this.k);
        gl.uniform4f(gl.getUniformLocation(this.sphereProg!, 'u_color'), s.color[0], s.color[1], s.color[2], s.color[3]);
        gl.drawElements(gl.TRIANGLES, this.sphereIndexCount, gl.UNSIGNED_SHORT, 0);
      }
    }

    // 2. Lignes puis points : lus contre la profondeur, sans l'écrire
    gl.depthMask(false);
    if (this.lineBatch.count > 0) {
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg!, 'u_matrix'), false, M);
      gl.uniform2f(gl.getUniformLocation(this.lineProg!, 'u_viewport'), vw, vh);
      gl.uniform1f(gl.getUniformLocation(this.lineProg!, 'u_dpr'), dpr);
      gl.bindVertexArray(this.lineBatch.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.lineBatch.count);
    }
    if (this.pointBatch.count > 0) {
      gl.useProgram(this.pointProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pointProg!, 'u_matrix'), false, M);
      gl.uniform2f(gl.getUniformLocation(this.pointProg!, 'u_viewport'), vw, vh);
      gl.uniform1f(gl.getUniformLocation(this.pointProg!, 'u_dpr'), dpr);
      gl.bindVertexArray(this.pointBatch.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.pointBatch.count);
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
  }
}
