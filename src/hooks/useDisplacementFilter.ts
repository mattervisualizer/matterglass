import { useMemo, useEffect, useRef, useState } from 'react';
import type { ElementMetrics } from '../core/types';
import type { SurfaceProfile } from '../core/surfaceProfiles';
import {
  getDisplacementFilter,
  getDisplacementFilterAsync,
  retainDisplacementFilter,
  releaseDisplacementFilter,
} from '../core/createDisplacementFilter';

type Options = {
  profile: SurfaceProfile;
  bezelWidth: number;
  refractiveIndex: number;
  strength: number;
  chromaticAberration: number;
  lean?: boolean;
};

export function useDisplacementFilter(metrics: ElementMetrics, options: Options): string {
  const lean = !!options.lean;
  const zero =
    metrics.width === 0 || metrics.height === 0 ||
    options.strength === 0 || options.bezelWidth === 0;
  const deps = [
    metrics.width, metrics.height,
    metrics.radiusTopLeft, metrics.radiusTopRight,
    metrics.radiusBottomRight, metrics.radiusBottomLeft,
    options.profile, options.bezelWidth, options.refractiveIndex,
    options.strength, options.chromaticAberration, lean, zero,
  ];

  const filter = useMemo(
    () => (lean || zero ? 'none' : getDisplacementFilter({ metrics, ...options })),
    deps,
  );

  useEffect(() => {
    if (filter === 'none') return;
    retainDisplacementFilter(filter);
    return () => releaseDisplacementFilter(filter);
  }, [filter]);

  const [shown, setShown] = useState('none');
  const held = useRef('none');
  const busy = useRef(false);
  const latest = useRef<{ metrics: ElementMetrics; options: Options } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (held.current !== 'none') releaseDisplacementFilter(held.current);
      held.current = 'none';
    };
  }, []);

  const hold = (url: string) => {
    if (url !== 'none') retainDisplacementFilter(url);
    if (held.current !== 'none') releaseDisplacementFilter(held.current);
    held.current = url;
    setShown(url);
  };

  const run = () => {
    const job = latest.current;
    if (!job || busy.current) return;
    latest.current = null;
    busy.current = true;
    getDisplacementFilterAsync({ metrics: job.metrics, ...job.options }).then((url) => {
      busy.current = false;
      if (!alive.current) return;
      if (url !== 'none') hold(url);
      run();
    });
  };

  useEffect(() => {
    if (!lean) return;
    if (zero) {
      latest.current = null;
      hold('none');
      return;
    }
    latest.current = { metrics, options };
    run();
  }, deps);

  return lean ? shown : filter;
}
