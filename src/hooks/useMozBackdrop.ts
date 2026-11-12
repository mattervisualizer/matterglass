import type { RefObject } from 'react';
import { useIsoLayoutEffect } from '../utils/useIsoLayoutEffect';

const BG_PROPS = [
  'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-origin', 'background-clip',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-right-radius', 'border-bottom-left-radius',
] as const;

let idCounter = 0;
function ensureId(el: Element): string {
  if (!el.id) el.id = `mg-bd-${idCounter++}`;
  return el.id;
}

function zOf(el: Element): number {
  const cs = getComputedStyle(el);
  if (cs.position === 'static') return 0;
  const z = parseInt(cs.zIndex, 10);
  return isNaN(z) ? 0 : z;
}

function intersects(a: DOMRect, b: DOMRect) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

const hasOwnBackground = (cs: CSSStyleDeclaration) =>
  cs.backgroundImage !== 'none' ||
  !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor);

type Layer = { el: HTMLElement; kind: 'bg' | 'el'; node: HTMLDivElement };

function collect(glass: HTMLElement): { kind: 'bg' | 'el'; el: HTMLElement }[] {
  const g = glass.getBoundingClientRect();
  const out: { kind: 'bg' | 'el'; el: HTMLElement }[] = [];
  const levels: { kind: 'bg' | 'el'; el: HTMLElement }[][] = [];

  let path: HTMLElement = glass;
  for (let anc = glass.parentElement; anc; path = anc, anc = anc.parentElement) {
    const level: { kind: 'bg' | 'el'; el: HTMLElement }[] = [];
    const cs = getComputedStyle(anc);
    if (!anc.hasAttribute('data-mg-glass') && hasOwnBackground(cs)) level.push({ kind: 'bg', el: anc });

    const pathZ = zOf(path);
    const pathFixed = getComputedStyle(path).position === 'fixed';
    let before = true;
    for (const sib of Array.from(anc.children) as HTMLElement[]) {
      if (sib === path) { before = false; continue; }
      if (!(sib instanceof HTMLElement)) continue;
      if (sib.matches('script,style,template,audio,link,meta')) continue;
      if (sib.hasAttribute('data-mg-layer')) continue;
      const scs = getComputedStyle(sib);
      if (scs.display === 'none' || scs.visibility === 'hidden') continue;
      if (!intersects(sib.getBoundingClientRect(), g)) continue;
      const sz = zOf(sib);
      const under = before ? sz <= pathZ : sz < pathZ || (pathFixed && scs.position !== 'fixed');
      if (under) level.push({ kind: 'el', el: sib });
    }
    levels.push(level);
    if (anc === document.documentElement) break;
  }
  for (let i = levels.length - 1; i >= 0; i--) out.push(...levels[i]);
  return out;
}

export function useMozBackdrop(
  glassRef: RefObject<HTMLElement | null>,
  copyRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useIsoLayoutEffect(() => {
    const glass = glassRef.current;
    const copy = copyRef.current;
    if (!enabled || !glass || !copy) return;
    copy.style.backgroundColor = 'Canvas';

    let layers: Layer[] = [];

    const makeNode = (kind: 'bg' | 'el', el: HTMLElement) => {
      const node = document.createElement('div');
      node.style.position = 'absolute';
      node.style.pointerEvents = 'none';
      if (kind === 'el') {
        node.style.backgroundImage = `-moz-element(#${ensureId(el)})`;
        node.style.backgroundRepeat = 'no-repeat';
        node.style.backgroundSize = '100% 100%';
      } else {
        paintBg(node, el);
      }
      return node;
    };
    const paintBg = (node: HTMLDivElement, el: HTMLElement) => {
      const cs = getComputedStyle(el);
      for (const p of BG_PROPS) node.style.setProperty(p, cs.getPropertyValue(p));
    };

    let kinds: ('bg' | 'el')[] = [];
    const rebuild = () => {
      const next = collect(glass);
      const same =
        next.length === layers.length &&
        next.every((n, i) => n.el === layers[i].el && n.kind === kinds[i]);
      if (same) {
        next.forEach((n, i) => { if (n.kind === 'bg') paintBg(layers[i].node, n.el); });
      } else {
        const nodes = next.map(({ kind, el }) => ({ el, kind, node: makeNode(kind, el) }));
        copy.replaceChildren(...nodes.map((n) => n.node));
        layers = nodes;
        kinds = next.map((n) => n.kind);
      }
      last = '';
      sync();
    };

    let last = '';
    const sync = () => {
      const g = glass.getBoundingClientRect();
      const kx = g.width ? glass.offsetWidth / g.width : 1;
      const ky = g.height ? glass.offsetHeight / g.height : 1;
      let key = '';
      const rects = layers.map(({ el }) => {
        const r = el.getBoundingClientRect();
        const v = [
          ((r.left - g.left) * kx).toFixed(1), ((r.top - g.top) * ky).toFixed(1),
          (r.width * kx).toFixed(1), (r.height * ky).toFixed(1),
        ];
        key += v.join(',') + ';';
        return v;
      });
      if (key === last) return;
      last = key;
      layers.forEach(({ node }, i) => {
        const [x, y, w, h] = rects[i];
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        node.style.width = w + 'px';
        node.style.height = h + 'px';
      });
    };

    let raf = 0;
    let until = 0;
    const loop = () => {
      sync();
      raf = performance.now() < until ? requestAnimationFrame(loop) : 0;
    };
    const follow = (ms: number) => {
      until = Math.max(until, performance.now() + ms);
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const now = () => { sync(); follow(32); };

    rebuild();

    let rebuildTimer = 0;
    const scheduleRebuild = () => {
      clearTimeout(rebuildTimer);
      rebuildTimer = window.setTimeout(rebuild, 150);
    };

    window.addEventListener('scroll', now, { capture: true, passive: true });
    window.addEventListener('resize', scheduleRebuild);
    const ro = new ResizeObserver(() => { now(); scheduleRebuild(); });
    ro.observe(glass);
    let rebuildRaf = 0;
    const rebuildSoon = () => {
      if (!rebuildRaf) rebuildRaf = requestAnimationFrame(() => { rebuildRaf = 0; rebuild(); });
    };
    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.target !== glass)) rebuildSoon();
      else now();
    });
    for (let n: HTMLElement | null = glass; n && n !== document.documentElement; n = n.parentElement) {
      mo.observe(n, { attributes: true, attributeFilter: ['style', 'class'], childList: n !== glass });
    }
    const anim = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && t.contains(glass)) follow(700);
    };
    const events = ['transitionrun', 'transitionend', 'animationstart', 'animationiteration'];
    events.forEach((e) => document.addEventListener(e, anim, { passive: true }));

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rebuildRaf);
      clearTimeout(rebuildTimer);
      window.removeEventListener('scroll', now, { capture: true });
      window.removeEventListener('resize', scheduleRebuild);
      ro.disconnect();
      mo.disconnect();
      events.forEach((e) => document.removeEventListener(e, anim));
      copy.replaceChildren();
      copy.style.backgroundColor = '';
    };
  }, [glassRef, copyRef, enabled]);
}
