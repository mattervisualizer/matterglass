import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import type { SurfaceProfile } from '../core/surfaceProfiles';
import { GlassContext, useGlassParent, useGlassHoles } from '../core/GlassContext';
import { getEngine } from '../core/engine';
import { useElementMetrics } from '../hooks/useElementMetrics';
import { useDisplacementFilter } from '../hooks/useDisplacementFilter';
import { useGlassHoleMask } from '../hooks/useGlassHoleMask';
import { useBackgroundTransfer } from '../hooks/useBackgroundTransfer';
import { useMozBackdrop } from '../hooks/useMozBackdrop';
import { GlassSpecular } from './GlassSpecular';
import { useIsoLayoutEffect } from '../utils/useIsoLayoutEffect';

export interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  profile?: SurfaceProfile;
  bezelWidth?: number;
  refractiveIndex?: number;
  strength?: number;
  blur?: number;
  safariBlur?: number;
  chromaticAberration?: number;
  bloom?: number;
  specular?: boolean;
  specularWidth?: number;
  specularAngle?: number;
  specularIntensity?: number;
  specularAdaptive?: boolean;
  children?: ReactNode;
}

const LAYER: CSSProperties = {
  position: 'absolute',
  inset: 0,
  margin: 0,
  padding: 0,
  border: 'none',
  borderRadius: 'inherit',
  pointerEvents: 'none',
};

const NO_HOLES: never[] = [];

let baseStyleInjected = false;

function injectBaseStyle() {
  if (baseStyleInjected || typeof document === 'undefined') return;
  baseStyleInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-matterglass', '');
  style.textContent = '@layer matterglass{:where([data-mg-glass]){position:relative;isolation:isolate}}';
  document.head.prepend(style);
}

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  {
    profile = 'squircle',
    bezelWidth = 32,
    refractiveIndex = 1.2,
    strength = 96,
    blur = 0.7,
    safariBlur = 6,
    chromaticAberration = 0,
    bloom = 1.08,
    specular = true,
    specularWidth = 1,
    specularAngle = 0,
    specularIntensity = 0.71,
    specularAdaptive = false,
    className,
    style,
    children,
    ...rest
  },
  forwardedRef,
) {
  const ref = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const glassId = useId();

  useImperativeHandle(forwardedRef, () => ref.current!, []);
  useIsoLayoutEffect(injectBaseStyle, []);

  const styleKey = (className ?? '') + '§' + (style ? JSON.stringify(style) : '');
  const metrics = useElementMetrics(ref, styleKey);
  useBackgroundTransfer(ref, coverRef, className, style);

  const parentCtx = useGlassParent();
  useEffect(() => {
    if (!parentCtx) return;
    parentCtx.registerHole({ id: glassId, element: ref });
    return () => parentCtx.unregisterHole(glassId);
  }, [parentCtx, glassId]);
  const { holes, registerHole, unregisterHole } = useGlassHoles();

  const minDim = Math.min(metrics.width, metrics.height) || Infinity;
  const effBezel = Math.min(bezelWidth, minDim / 2);
  const effStrength = Math.round(Math.min(strength, minDim));
  const effCA = Math.min(chromaticAberration, minDim * 0.05);

  const engine = getEngine();
  const firefoxCopy = engine.mozElement && !parentCtx && minDim !== Infinity;
  const skipDisplacement = !(engine.backdropUrl || firefoxCopy) || effStrength === 0 || effBezel === 0;

  useGlassHoleMask(ref, firefoxCopy ? NO_HOLES : holes, [filterRef, coverRef]);

  const displacementFilter = useDisplacementFilter(metrics, {
    profile,
    bezelWidth: skipDisplacement ? 0 : effBezel,
    refractiveIndex,
    strength: skipDisplacement ? 0 : effStrength,
    chromaticAberration: skipDisplacement ? 0 : effCA,
    lean: engine.mozElement,
  });
  const hasMap = displacementFilter !== 'none';

  const useCopy = firefoxCopy && hasMap;
  const noBackdrop = useCopy || (engine.mozElement && !!parentCtx?.copying);
  useMozBackdrop(ref, copyRef, useCopy);

  const tone = bloom !== 1 ? [`brightness(${bloom})`, `saturate(${0.9 + bloom * 0.2})`] : [];
  const backdropFilter = [
    `blur(${engine.webkit ? safariBlur : blur}px)`,
    engine.backdropUrl && hasMap ? displacementFilter : '',
    ...tone,
  ].filter(Boolean).join(' ');
  const copyFilter = [hasMap ? displacementFilter : '', `blur(${blur}px)`, ...tone].filter(Boolean).join(' ');

  return (
    <GlassContext.Provider value={{ registerHole, unregisterHole, holes, copying: useCopy }}>
      <div ref={ref} data-mg-glass="" className={className} style={style} {...rest}>
        <div
          ref={filterRef}
          data-mg-layer=""
          aria-hidden
          style={{
            ...LAYER,
            zIndex: -1,
            backdropFilter: noBackdrop ? undefined : backdropFilter,
            WebkitBackdropFilter: noBackdrop ? undefined : backdropFilter,
            contain: 'paint',
          }}
        />

        {useCopy && (
          <div
            ref={copyRef}
            data-mg-layer=""
            aria-hidden
            style={{
              ...LAYER,
              zIndex: -1,
              borderRadius: 0,
              filter: copyFilter,
              clipPath: `inset(0 round ${metrics.radiusTopLeft}px ${metrics.radiusTopRight}px ${metrics.radiusBottomRight}px ${metrics.radiusBottomLeft}px)`,
              contain: 'strict',
              willChange: 'transform',
              transform: 'translateZ(0)',
            }}
          />
        )}

        <div ref={coverRef} data-mg-layer="" aria-hidden style={{ ...LAYER, zIndex: -1, contain: 'paint' }} />

        {specular && metrics.width > 0 && (
          <GlassSpecular
            metrics={metrics}
            angle={specularAngle}
            width={specularWidth}
            intensity={specularIntensity}
            bloom={bloom}
            adaptive={specularAdaptive}
            layerStyle={LAYER}
          />
        )}

        {children}
      </div>
    </GlassContext.Provider>
  );
});
