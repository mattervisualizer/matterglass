import { useCallback, useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { useIsoLayoutEffect } from '../utils/useIsoLayoutEffect';

const BG_PROPS = [
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'background-origin',
  'background-clip',
] as const;

const TOUCHED = [
  'background-color',
  'background-image',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
];

const STATE_BG = /(^|\s)\S*(hover|active|focus|focus-visible|focus-within|group-[\w-]+|peer-[\w-]+):\S*(bg-|from-|via-|to-)/;

const splitList = (v: string) =>
  v.replace(/\([^)]*\)/g, (m) => m.replace(/,/g, '§')).split(',').map((x) => x.trim()).filter(Boolean);

export function useBackgroundTransfer(
  rootRef: RefObject<HTMLElement | null>,
  coverRef: RefObject<HTMLElement | null>,
  className: string | undefined,
  style: CSSProperties | undefined,
) {
  const written = useRef<Record<string, string>>({});
  const user = useRef<Record<string, string>>({});
  const lastKey = useRef<string | null>(null);
  const coverState = useRef('');

  const key =
    (className ?? '') + '§' +
    (style
      ? [style.background, style.backgroundColor, style.backgroundImage, style.transition,
         style.transitionProperty, style.transitionDuration].map(String).join('|')
      : '');

  const sync = useCallback((force: boolean) => {
    const root = rootRef.current;
    const cover = coverRef.current;
    if (!root || !cover) return;
    if (!force && lastKey.current === key) return;
    lastKey.current = key;

    const s = root.style;
    const cs = getComputedStyle(root);
    const hasWritten = Object.keys(written.current).length > 0;

    for (const p of TOUCHED) {
      const cur = s.getPropertyValue(p);
      if (cur !== written.current[p]) user.current[p] = cur;
    }
    const restore = (p: string) => {
      s.removeProperty(p);
      const v = user.current[p];
      if (v) s.setProperty(p, v);
      delete written.current[p];
    };
    const write = (p: string, v: string) => {
      if (written.current[p] === v && s.getPropertyValue(p) === v) return;
      s.setProperty(p, v, 'important');
      written.current[p] = s.getPropertyValue(p);
    };

    if (hasWritten) {
      restore('background-color');
      restore('background-image');
    }
    const values = BG_PROPS.map((p) => cs.getPropertyValue(p));
    const empty =
      /^(transparent|rgba\(0, 0, 0, 0\))$/.test(values[0]) && values[1] === 'none';

    const setCover = (bg: string[] | null, transition: string) => {
      const sig = bg ? bg.join('|') + transition : '';
      if (sig === coverState.current) return;
      coverState.current = sig;
      const c = cover.style;
      if (!bg) {
        BG_PROPS.forEach((p) => c.removeProperty(p));
        c.removeProperty('transition');
        return;
      }
      c.transition = transition;
      BG_PROPS.forEach((p, i) => c.setProperty(p, bg[i]));
    };

    if (empty) {
      if (hasWritten) TOUCHED.forEach((p) => p in written.current && restore(p));
      setCover(null, '');
      return;
    }

    const tp = splitList(cs.transitionProperty);
    const td = splitList(cs.transitionDuration);
    const tf = splitList(cs.transitionTimingFunction);
    const tdl = splitList(cs.transitionDelay);
    const at = (arr: string[], i: number) => (arr[i % arr.length] ?? '0s').replace(/§/g, ',');

    let bgTransition = 'none';
    for (let i = tp.length - 1; i >= 0; i--) {
      if (tp[i] === 'all' || tp[i].startsWith('background')) {
        bgTransition = ['background-color', 'background-image']
          .map((p) => `${p} ${at(td, i)} ${at(tf, i)} ${at(tdl, i)}`)
          .join(', ');
        break;
      }
    }

    if (tp.length && tp[0] !== 'none' && !written.current['transition-property']) {
      const n = tp.length;
      const idx = Array.from({ length: n }, (_, i) => i);
      write('transition-property', [...tp, 'background-color', 'background-image'].join(', '));
      write('transition-duration', [...idx.map((i) => at(td, i)), '0s', '0s'].join(', '));
      write('transition-timing-function', [...idx.map((i) => at(tf, i)), 'linear', 'linear'].join(', '));
      write('transition-delay', [...idx.map((i) => at(tdl, i)), '0s', '0s'].join(', '));
    }

    write('background-color', 'transparent');
    write('background-image', 'none');
    setCover(values, bgTransition);
  }, [rootRef, coverRef, key]);

  useIsoLayoutEffect(() => sync(false), [sync]);

  const hasStateBg = !!className && STATE_BG.test(className);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !hasStateBg) return;
    const handler = () => {
      sync(true);
      requestAnimationFrame(() => sync(true));
    };
    const events = ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup', 'pointercancel', 'focusin', 'focusout'];
    events.forEach((e) => root.addEventListener(e, handler));
    return () => events.forEach((e) => root.removeEventListener(e, handler));
  }, [rootRef, sync, hasStateBg]);
}
