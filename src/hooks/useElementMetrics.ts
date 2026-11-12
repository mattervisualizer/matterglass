import { useState, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { ElementMetrics } from '../core/types';
import { useIsoLayoutEffect } from '../utils/useIsoLayoutEffect';

const ZERO: ElementMetrics = {
  width: 0, height: 0,
  radiusTopLeft: 0, radiusTopRight: 0,
  radiusBottomRight: 0, radiusBottomLeft: 0,
};

function parseRadius(raw: string, size: number): number {
  let r = parseFloat(raw) || 0;
  if (raw.includes('%')) r = (parseFloat(raw) / 100) * size;
  return r;
}

let pendingMeasures = new Set<() => void>();
let rafScheduled = false;

function scheduleMeasure(fn: () => void) {
  pendingMeasures.add(fn);
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      const batch = pendingMeasures;
      pendingMeasures = new Set();
      batch.forEach(f => f());
    });
  }
}

export function useElementMetrics(ref: RefObject<HTMLElement | null>, styleKey = ''): ElementMetrics {
  const [metrics, setMetrics] = useState<ElementMetrics>(ZERO);
  const prev = useRef<ElementMetrics>(ZERO);
  const measureRef = useRef<() => void>(() => {});

  useIsoLayoutEffect(() => {
    measureRef.current();
  }, [styleKey]);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      if (!ref.current) return;
      const el = ref.current;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const cs = getComputedStyle(el);
      const minDim = Math.min(w, h);
      const maxR = minDim / 2;

      const tl = Math.min(parseRadius(cs.borderTopLeftRadius, minDim), maxR);
      const tr = Math.min(parseRadius(cs.borderTopRightRadius, minDim), maxR);
      const br = Math.min(parseRadius(cs.borderBottomRightRadius, minDim), maxR);
      const bl = Math.min(parseRadius(cs.borderBottomLeftRadius, minDim), maxR);

      const p = prev.current;
      if (
        Math.abs(p.width - w) < 0.5 &&
        Math.abs(p.height - h) < 0.5 &&
        Math.abs(p.radiusTopLeft - tl) < 0.5 &&
        Math.abs(p.radiusTopRight - tr) < 0.5 &&
        Math.abs(p.radiusBottomRight - br) < 0.5 &&
        Math.abs(p.radiusBottomLeft - bl) < 0.5
      ) return;

      const next: ElementMetrics = {
        width: w, height: h,
        radiusTopLeft: tl, radiusTopRight: tr,
        radiusBottomRight: br, radiusBottomLeft: bl,
      };
      prev.current = next;
      setMetrics(next);
    };

    measureRef.current = measure;

    const scheduleOnce = () => {
      try {
        flushSync(measure);
      } catch {
        scheduleMeasure(measure);
      }
    };

    const resizeObserver = new ResizeObserver(scheduleOnce);
    resizeObserver.observe(el);

    const mutationObserver = new MutationObserver(() => scheduleMeasure(measure));
    mutationObserver.observe(el, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    measure();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      pendingMeasures.delete(measure);
    };
  }, [ref]);

  return metrics;
}
