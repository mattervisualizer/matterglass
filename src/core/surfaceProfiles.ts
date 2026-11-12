export type SurfaceProfile = 'convex' | 'concave' | 'squircle' | 'lip' | SurfaceFunction;
export type SurfaceFunction = (x: number) => number;

function convexCircle(x: number): number {
  return Math.sqrt(1 - (1 - x) ** 2);
}

function convexSquircle(x: number): number {
  return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
}

function concave(x: number): number {
  return 1 - convexCircle(x);
}

function smoothstep(x: number): number {
  return x * x * (3 - 2 * x);
}

function lip(x: number): number {
  const t = smoothstep(x);
  return convexCircle(x) * (1 - t) + concave(x) * t;
}

const presets: Record<string, SurfaceFunction> = {
  convex: convexCircle,
  squircle: convexSquircle,
  concave,
  lip,
};

function resolveProfile(profile: SurfaceProfile): SurfaceFunction {
  if (typeof profile === 'function') return profile;
  return presets[profile] ?? convexSquircle;
}

export function getSurfaceDerivative(profile: SurfaceProfile, x: number): number {
  const fn = resolveProfile(profile);
  const delta = 0.001;
  const y1 = fn(Math.max(0, Math.min(1, x - delta)));
  const y2 = fn(Math.max(0, Math.min(1, x + delta)));
  return (y2 - y1) / (2 * delta);
}

const fnIds = new WeakMap<SurfaceFunction, number>();
let fnCounter = 0;

export function profileKey(profile: SurfaceProfile): string {
  if (typeof profile !== 'function') return profile;
  let id = fnIds.get(profile);
  if (id === undefined) fnIds.set(profile, (id = fnCounter++));
  return `fn${id}`;
}
