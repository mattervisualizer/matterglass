import type { RefObject } from 'react';
import type { GlassHole } from '../core/GlassContext';
import { useIsoLayoutEffect } from '../utils/useIsoLayoutEffect';

const MASK_PROPS = [
  'mask-image', '-webkit-mask-image',
  'mask-size', '-webkit-mask-size',
  'mask-repeat', '-webkit-mask-repeat',
];

function roundedRect(x: number, y: number, w: number, h: number, r: number[], kx: number, ky: number) {
  const [a, b, c, d] = r;
  const X = (v: number) => v * kx;
  const Y = (v: number) => v * ky;
  return `M${x + X(a)},${y}H${x + w - X(b)}A${X(b)},${Y(b)} 0 0 1 ${x + w},${y + Y(b)}V${y + h - Y(c)}` +
    `A${X(c)},${Y(c)} 0 0 1 ${x + w - X(c)},${y + h}H${x + X(d)}A${X(d)},${Y(d)} 0 0 1 ${x},${y + h - Y(d)}` +
    `V${y + Y(a)}A${X(a)},${Y(a)} 0 0 1 ${x + X(a)},${y}Z`;
}

function radii(el: HTMLElement, w: number, h: number): number[] {
  const cs = getComputedStyle(el);
  const p = (v: string) => {
    const n = parseFloat(v);
    if (!isFinite(n)) return 1e9;
    return v.trim().endsWith('%') ? (n / 100) * Math.min(w, h) : n;
  };
  const r = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(p);
  const f = Math.min(
    1,
    w / (r[0] + r[1] || 1), w / (r[3] + r[2] || 1),
    h / (r[0] + r[3] || 1), h / (r[1] + r[2] || 1),
  );
  return r.map((x) => x * f);
}

export function useGlassHoleMask(
  parentRef: RefObject<HTMLElement | null>,
  holes: GlassHole[],
  layers: RefObject<HTMLElement | null>[],
): void {
  useIsoLayoutEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    let last: string | undefined | null = null;
    const apply = (mask: string | undefined) => {
      if (mask === last) return;
      last = mask;
      for (const layer of layers) {
        const st = layer.current?.style;
        if (!st) continue;
        if (!mask) {
          MASK_PROPS.forEach((p) => st.removeProperty(p));
          continue;
        }
        st.setProperty('mask-image', mask);
        st.setProperty('-webkit-mask-image', mask);
        st.setProperty('mask-size', '100% 100%');
        st.setProperty('-webkit-mask-size', '100% 100%');
        st.setProperty('mask-repeat', 'no-repeat');
        st.setProperty('-webkit-mask-repeat', 'no-repeat');
      }
    };

    const update = () => {
      if (holes.length === 0) return apply(undefined);
      const pr = parent.getBoundingClientRect();
      const pw = parent.offsetWidth;
      const ph = parent.offsetHeight;
      if (!pw || !ph || !pr.width || !pr.height) return;
      const kx = pw / pr.width;
      const ky = ph / pr.height;

      let paths = '';
      for (const hole of holes) {
        const el = hole.element.current;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const x = Math.floor((r.left - pr.left) * kx);
        const y = Math.floor((r.top - pr.top) * ky);
        const w = Math.ceil((r.right - pr.left) * kx) - x;
        const h = Math.ceil((r.bottom - pr.top) * ky) - y;
        const sx = el.offsetWidth ? w / el.offsetWidth : 1;
        const sy = el.offsetHeight ? h / el.offsetHeight : 1;
        const rad = radii(el, el.offsetWidth || w, el.offsetHeight || h);
        paths += `<path d='${roundedRect(x, y, w, h, rad, sx, sy)}' fill='black'/>`;
      }
      const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${pw}' height='${ph}' viewBox='0 0 ${pw} ${ph}'>` +
        `<rect width='${pw}' height='${ph}' fill='white'/>${paths}</svg>`;
      apply(`url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`);
    };

    let raf = 0;
    let until = 0;
    const loop = () => {
      update();
      raf = performance.now() < until ? requestAnimationFrame(loop) : 0;
    };
    const follow = (ms = 600) => {
      until = Math.max(until, performance.now() + ms);
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      update();
      follow(50);
    };

    update();
    if (holes.length === 0) return;

    const ro = new ResizeObserver(kick);
    ro.observe(parent);
    const mo = new MutationObserver(kick);
    mo.observe(parent, { attributes: true, attributeFilter: ['style', 'class'] });

    for (const hole of holes) {
      const el = hole.element.current;
      if (!el) continue;
      ro.observe(el);
      for (let n: HTMLElement | null = el; n && n !== parent; n = n.parentElement) {
        mo.observe(n, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    }

    const onAnim = (e: Event) => {
      const t = e.target as Node;
      if (holes.some((h) => h.element.current && (t === h.element.current || t.contains(h.element.current)))) follow();
    };
    const animEvents = ['transitionrun', 'transitionend', 'animationstart', 'animationend'];
    animEvents.forEach((e) => parent.addEventListener(e, onAnim));
    window.addEventListener('resize', kick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      animEvents.forEach((e) => parent.removeEventListener(e, onAnim));
      window.removeEventListener('resize', kick);
    };
  }, [parentRef, holes, ...layers]);
}
