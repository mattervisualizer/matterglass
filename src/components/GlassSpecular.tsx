import { memo, useId, type CSSProperties } from 'react';
import type { ElementMetrics } from '../core/types';

type GlassSpecularProps = {
  metrics: ElementMetrics;
  angle: number;
  width: number;
  intensity: number;
  bloom: number;
  adaptive: boolean;
  layerStyle: CSSProperties;
};

const FALLOFF: [number, number][] = [
  [0, 1],
  [0.2, 0.82],
  [0.4, 0.5],
  [0.6, 0.24],
  [0.8, 0.07],
  [1, 0],
];

const BOTTOM_LIGHT = 0.45;

function roundedRectPath(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number) {
  tl = Math.min(tl, w / 2, h / 2);
  tr = Math.min(tr, w / 2, h / 2);
  br = Math.min(br, w / 2, h / 2);
  bl = Math.min(bl, w / 2, h / 2);
  return (
    `M${x + tl},${y} H${x + w - tr} A${tr},${tr} 0 0 1 ${x + w},${y + tr} ` +
    `V${y + h - br} A${br},${br} 0 0 1 ${x + w - br},${y + h} ` +
    `H${x + bl} A${bl},${bl} 0 0 1 ${x},${y + h - bl} ` +
    `V${y + tl} A${tl},${tl} 0 0 1 ${x + tl},${y} Z`
  );
}

function specularGeometry(metrics: ElementMetrics, strokeWidth: number, angle: number) {
  const { width: w, height: h, radiusTopLeft: rTL, radiusTopRight: rTR, radiusBottomRight: rBR, radiusBottomLeft: rBL } = metrics;
  const half = strokeWidth / 2;
  const inset = (r: number) => Math.max(0, r - half);
  const rimPath = roundedRectPath(half, half, w - strokeWidth, h - strokeWidth, inset(rTL), inset(rTR), inset(rBR), inset(rBL));

  const rx = w * 0.62;
  const ryTop = Math.min(h * 0.6, Math.max(rTL, rTR, 12) * 1.9 + 8);
  const ryBot = Math.min(h * 0.5, Math.max(rBL, rBR, 12) * 1.5 + 6);
  const rot = `rotate(${angle} ${w / 2} ${h / 2})`;

  return {
    w,
    h,
    rimPath,
    topTransform: `${rot} translate(${w / 2} 0) scale(${rx} ${ryTop})`,
    botTransform: `${rot} translate(${w / 2} ${h}) scale(${rx * 0.85} ${ryBot})`,
  };
}

function specularMask(g: ReturnType<typeof specularGeometry>, strokeWidth: number) {
  const stops = (k: number) =>
    FALLOFF.map(([o, a]) => `<stop offset="${o}" stop-color="white" stop-opacity="${a * k}"/>`).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g.w}" height="${g.h}" viewBox="0 0 ${g.w} ${g.h}">` +
    `<defs>` +
    `<radialGradient id="t" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="${g.topTransform}">${stops(1)}</radialGradient>` +
    `<radialGradient id="b" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="${g.botTransform}">${stops(BOTTOM_LIGHT)}</radialGradient>` +
    `</defs>` +
    `<path d="${g.rimPath}" fill="none" stroke="url(#t)" stroke-width="${strokeWidth}"/>` +
    `<path d="${g.rimPath}" fill="none" stroke="url(#b)" stroke-width="${strokeWidth}"/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export const GlassSpecular = memo(function GlassSpecular({
  metrics,
  angle,
  width: strokeWidth,
  intensity,
  bloom,
  adaptive,
  layerStyle,
}: GlassSpecularProps) {
  const uid = useId().replace(/[^\w-]/g, '');
  if (metrics.width === 0 || metrics.height === 0) return null;

  const g = specularGeometry(metrics, strokeWidth, angle);
  const alpha = Math.max(0, Math.min(1, intensity));

  if (adaptive) {
    const mask = specularMask(g, strokeWidth);
    const amount = (0.9 + (bloom - 1) * 5) * alpha;
    const filter = `brightness(${1 + amount}) saturate(${1 + amount * 0.6})`;
    return (
      <div
        aria-hidden
        data-mg-layer=""
        style={{
          ...layerStyle,
          zIndex: 20,
          backdropFilter: filter,
          WebkitBackdropFilter: filter,
          maskImage: mask,
          WebkitMaskImage: mask,
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          transition: 'backdrop-filter .3s',
        }}
      />
    );
  }

  const topId = `mg-st-${uid}`;
  const botId = `mg-sb-${uid}`;

  return (
    <svg
      aria-hidden
      data-mg-layer=""
      width={g.w}
      height={g.h}
      style={{ ...layerStyle, zIndex: 20, width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={topId} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={1} gradientTransform={g.topTransform}>
          {FALLOFF.map(([o, a], i) => <stop key={i} offset={o} stopColor="white" stopOpacity={a} />)}
        </radialGradient>
        <radialGradient id={botId} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={1} gradientTransform={g.botTransform}>
          {FALLOFF.map(([o, a], i) => <stop key={i} offset={o} stopColor="white" stopOpacity={a * BOTTOM_LIGHT} />)}
        </radialGradient>
      </defs>
      <g style={{ opacity: alpha, transition: 'opacity .3s' }}>
        <path d={g.rimPath} fill="none" stroke={`url(#${topId})`} strokeWidth={strokeWidth} />
        <path d={g.rimPath} fill="none" stroke={`url(#${botId})`} strokeWidth={strokeWidth} />
      </g>
    </svg>
  );
});
