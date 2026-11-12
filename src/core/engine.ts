export type Engine = {
  backdropUrl: boolean;
  mozElement: boolean;
  webkit: boolean;
};

let cached: Engine | null = null;

export function getEngine(): Engine {
  if (cached) return cached;
  if (typeof window === 'undefined' || typeof CSS === 'undefined') {
    return { backdropUrl: true, mozElement: false, webkit: false };
  }
  const ua = navigator.userAgent;
  const mozElement = CSS.supports('background-image', '-moz-element(#a)');
  const isGecko = mozElement || /\bFirefox\//.test(ua);
  const isWebKit =
    /AppleWebKit/.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR)\//.test(ua) ||
    /(iPhone|iPad|iPod)/.test(ua);
  cached = { backdropUrl: !isGecko && !isWebKit, mozElement, webkit: isWebKit && !isGecko };
  return cached;
}
