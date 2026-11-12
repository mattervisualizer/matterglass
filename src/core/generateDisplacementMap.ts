import type { ElementMetrics } from './types';
import { profileKey, type SurfaceProfile } from './surfaceProfiles';
import { calculateDisplacementField } from './refractionField';

export type DisplacementMapOptions = {
  metrics: ElementMetrics;
  profile: SurfaceProfile;
  bezelWidth: number;
  refractiveIndex: number;
  strength: number;
  chromaticAberration: number;
  lean?: boolean;
};

const MAX_MAP_SIZE = 384;
const LEAN_MAX_MAP_SIZE = 256;
const MIN_MAP_DIM = 64;
const MAX_CACHE = 64;

const mapCache = new Map<string, string>();

function getScale(metrics: ElementMetrics, lean = false): number {
  const maxDim = Math.max(metrics.width, metrics.height);
  const minDim = Math.min(metrics.width, metrics.height);
  const dpr = lean ? 1 : typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  let scale = Math.min(dpr, (lean ? LEAN_MAX_MAP_SIZE : MAX_MAP_SIZE) / maxDim);
  if (minDim * scale < MIN_MAP_DIM && minDim > 0) scale = MIN_MAP_DIM / minDim;
  return scale;
}

export type MapParams = {
  w: number;
  h: number;
  rTL: number;
  rTR: number;
  rBR: number;
  rBL: number;
  scaledBezel: number;
  field: number[];
  reachMap: number;
  edgeMargin: number;
  smooth: number;
};

function prepareMap(options: DisplacementMapOptions): { key: string; params: MapParams } | null {
  const { metrics, profile, bezelWidth, refractiveIndex, strength, chromaticAberration, lean } = options;
  if (metrics.width === 0 || metrics.height === 0) return null;

  const scale = getScale(metrics, lean);
  const w = Math.max(Math.ceil(metrics.width * scale), 2);
  const h = Math.max(Math.ceil(metrics.height * scale), 2);
  const reach = strength + chromaticAberration * 2;
  const key = [
    lean ? 'L' : '', w, h, profileKey(profile), bezelWidth, refractiveIndex, Math.round(reach),
    Math.round(metrics.radiusTopLeft), Math.round(metrics.radiusTopRight),
    Math.round(metrics.radiusBottomRight), Math.round(metrics.radiusBottomLeft),
  ].join(':');
  const scaledBezel = bezelWidth * scale;

  return {
    key,
    params: {
      w,
      h,
      rTL: metrics.radiusTopLeft * scale,
      rTR: metrics.radiusTopRight * scale,
      rBR: metrics.radiusBottomRight * scale,
      rBL: metrics.radiusBottomLeft * scale,
      scaledBezel,
      field: Array.from(calculateDisplacementField(profile, scaledBezel, refractiveIndex, 128)),
      reachMap: (reach / 2) * scale,
      edgeMargin: 1.5 * scale,
      smooth: 0.8 * scale,
    },
  };
}

export function generateDisplacementMap(options: DisplacementMapOptions): string {
  const prep = prepareMap(options);
  if (!prep) return '';
  const cached = mapCache.get(prep.key);
  if (cached) return cached;

  const { w, h, smooth } = prep.params;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(buildMapPixels(prep.params) as never, w, h), 0, 0);
  if (smooth >= 0.3 && typeof ctx.filter === 'string') {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d')!.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.filter = `blur(${smooth}px)`;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }
  const result = canvas.toDataURL();

  if (mapCache.size >= MAX_CACHE) {
    const first = mapCache.keys().next().value;
    if (first) mapCache.delete(first);
  }
  mapCache.set(prep.key, result);
  return result;
}

let worker: Worker | null | undefined;
let jobId = 0;
const jobs = new Map<number, (url: string) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw 0;
    const src = `const buildMapPixels = ${buildMapPixels.toString()};
self.onmessage = async (e) => {
  const { id, p } = e.data;
  try {
    const c = new OffscreenCanvas(p.w, p.h);
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(buildMapPixels(p), p.w, p.h), 0, 0);
    let out = c;
    if (p.smooth >= 0.3 && typeof ctx.filter === 'string') {
      out = new OffscreenCanvas(p.w, p.h);
      const o = out.getContext('2d');
      o.filter = 'blur(' + p.smooth + 'px)';
      o.drawImage(c, 0, 0);
    }
    const blob = await out.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, url: new FileReaderSync().readAsDataURL(blob) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e: MessageEvent) => {
      const { id, url } = e.data;
      const done = jobs.get(id);
      if (!done) return;
      jobs.delete(id);
      done(url || '');
    };
    worker.onerror = () => {
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function generateDisplacementMapAsync(options: DisplacementMapOptions): Promise<string> {
  const prep = prepareMap(options);
  if (!prep) return Promise.resolve('');
  const cached = mapCache.get(prep.key);
  if (cached) return Promise.resolve(cached);
  const w = getWorker();
  if (!w) return Promise.resolve(generateDisplacementMap(options));
  return new Promise((resolve) => {
    const id = jobId++;
    jobs.set(id, (url) => resolve(url || generateDisplacementMap(options)));
    w.postMessage({ id, p: prep.params });
  });
}

export function buildMapPixels(p: MapParams): Uint8ClampedArray {
  const { w, h, rTL, rTR, rBR, rBL, scaledBezel, field, reachMap, edgeMargin } = p;
  const samples = field.length;

  const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
  const smoothstep = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const sdf = (px: number, py: number) => {
    const hw = w / 2;
    const hh = h / 2;
    const cx = px - hw;
    const cy = py - hh;
    const r = cx <= 0 ? (cy <= 0 ? rTL : rBL) : cy <= 0 ? rTR : rBR;
    const qx = Math.abs(cx) - (hw - r);
    const qy = Math.abs(cy) - (hh - r);
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return -(Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r);
  };
  const boxBlur = (a: Float32Array, r: number) => {
    const tmp = new Float32Array(Math.max(w, h));
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[o + clamp(i, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[x] = sum / n;
        sum += a[o + clamp(x + r + 1, 0, w - 1)] - a[o + clamp(x - r, 0, w - 1)];
      }
      for (let x = 0; x < w; x++) a[o + x] = tmp[x];
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[clamp(i, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        tmp[y] = sum / n;
        sum += a[clamp(y + r + 1, 0, h - 1) * w + x] - a[clamp(y - r, 0, h - 1) * w + x];
      }
      for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
    }
  };

  const data = new Uint8ClampedArray(w * h * 4);

  const distField = new Float32Array(w * h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) distField[py * w + px] = sdf(px + 0.5, py + 0.5);
  }
  const smoothR = Math.max(1, Math.round(Math.min(w, h) * 0.06));
  boxBlur(distField, smoothR);
  boxBlur(distField, smoothR);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const cx = px + 0.5;
      const cy = py + 0.5;
      const exact = sdf(cx, cy);
      const dist = exact <= 0 ? exact : Math.min(exact, distField[py * w + px]);
      data[idx + 3] = 255;

      if (dist <= 0 || dist >= scaledBezel) {
        data[idx] = 128;
        data[idx + 1] = 128;
        continue;
      }

      const t = clamp(dist / scaledBezel, 0, 1);
      const fi = t * (samples - 1);
      const i0 = Math.min(Math.floor(fi), samples - 1);
      const i1 = Math.min(i0 + 1, samples - 1);
      const magnitude = field[i0] + (field[i1] - field[i0]) * (fi - i0);

      const gx = distField[py * w + Math.min(w - 1, px + 1)] - distField[py * w + Math.max(0, px - 1)];
      const gy = distField[Math.min(h - 1, py + 1) * w + px] - distField[Math.max(0, py - 1) * w + px];
      const glen = Math.sqrt(gx * gx + gy * gy);
      let nx = 0;
      let ny = 0;
      if (glen > 1e-4) {
        nx = -gx / glen;
        ny = -gy / glen;
      }
      const centerFade = smoothstep(0.15, 0.9, glen / 2);
      const innerFade = 1 - smoothstep(0.7, 1, t);

      let dx = magnitude * nx * centerFade * innerFade;
      let dy = magnitude * ny * centerFade * innerFade;

      if (reachMap > 0) {
        const sx = cx + dx * reachMap;
        const sy = cy + dy * reachMap;
        const sq = sdf(sx, sy);
        if (sq < edgeMargin) {
          const push = 2 * (edgeMargin - sq);
          let qx = sx - push * nx;
          let qy = sy - push * ny;
          for (let it = 0; it < 6 && sdf(qx, qy) < edgeMargin; it++) {
            qx = cx + (qx - cx) * 0.6;
            qy = cy + (qy - cy) * 0.6;
          }
          dx = (qx - cx) / reachMap;
          dy = (qy - cy) / reachMap;
        }
      }

      data[idx] = clamp(Math.round(128 + dx * 127), 0, 255);
      data[idx + 1] = clamp(Math.round(128 + dy * 127), 0, 255);
    }
  }
  return data;
}
