import { profileKey } from './surfaceProfiles';
import {
  generateDisplacementMap,
  generateDisplacementMapAsync,
  type DisplacementMapOptions,
} from './generateDisplacementMap';

export type DisplacementFilterOptions = DisplacementMapOptions;

type Entry = {
  id: string;
  refs: number;
  el: SVGFilterElement;
  removeTimer: number | null;
  ready: Promise<void>;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const REMOVE_DELAY = 1000;

const registry = new Map<string, Entry>();
const urlToKey = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let filterSvg: SVGSVGElement | null = null;
let filterId = 0;

function getFilterSvg(): SVGSVGElement {
  if (!filterSvg || !filterSvg.isConnected) {
    filterSvg = document.createElementNS(SVG_NS, 'svg');
    filterSvg.setAttribute('width', '0');
    filterSvg.setAttribute('height', '0');
    filterSvg.setAttribute('aria-hidden', 'true');
    filterSvg.style.position = 'absolute';
    filterSvg.style.pointerEvents = 'none';
    document.body.appendChild(filterSvg);
  }
  return filterSvg;
}

function filterKey(o: DisplacementFilterOptions): string {
  const m = o.metrics;
  return [
    m.width, m.height,
    Math.round(m.radiusTopLeft), Math.round(m.radiusTopRight),
    Math.round(m.radiusBottomRight), Math.round(m.radiusBottomLeft),
    profileKey(o.profile), o.bezelWidth, o.refractiveIndex, o.strength, o.chromaticAberration,
    o.lean ? 'lean' : '',
  ].join('|');
}

function buildFilter(options: DisplacementFilterOptions, id: string, mapUri: string): SVGFilterElement {
  const { metrics, strength, chromaticAberration, lean } = options;
  const { width, height } = metrics;
  const feImage = (result: string) =>
    `<feImage x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="${mapUri}" result="${result}"/>`;

  const image = lean
    ? feImage('dm')
    : `<feFlood flood-color="rgb(128,128,128)" flood-opacity="1" result="neutral"/>` +
      feImage('raw') +
      `<feComposite in="raw" in2="neutral" operator="over" result="dm"/>`;

  const displace = (scale: number, result = '') =>
    `<feDisplacementMap in="SourceGraphic" in2="dm" scale="${scale}" xChannelSelector="R" yChannelSelector="G"${result ? ` result="${result}"` : ''}/>`;

  const displacement =
    chromaticAberration <= 0
      ? displace(strength, 'disp')
      : displace(strength + chromaticAberration * 2) +
        `<feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="dR"/>` +
        displace(strength + chromaticAberration) +
        `<feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="dG"/>` +
        displace(strength) +
        `<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="dB"/>` +
        `<feBlend in="dR" in2="dG" mode="screen" result="dRG"/>` +
        `<feBlend in="dRG" in2="dB" mode="screen" result="disp"/>`;

  const smooth = lean ? '' : `<feGaussianBlur in="disp" stdDeviation="0.5"/>`;

  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  filter.innerHTML = image + displacement + smooth;
  return filter;
}

function decode(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

function addEntry(key: string, options: DisplacementFilterOptions, mapUri: string): Entry {
  const id = `mg-f${filterId++}`;
  const el = buildFilter(options, id, mapUri);
  getFilterSvg().appendChild(el);
  const entry: Entry = { id, refs: 0, el, removeTimer: null, ready: decode(mapUri) };
  registry.set(key, entry);
  urlToKey.set(`url(#${id})`, key);
  scheduleRemoval(key, entry);
  return entry;
}

function existing(key: string): Entry | undefined {
  const entry = registry.get(key);
  if (entry && !entry.el.isConnected) getFilterSvg().appendChild(entry.el);
  return entry;
}

function isEmpty(o: DisplacementFilterOptions) {
  return o.metrics.width === 0 || o.metrics.height === 0 || o.strength === 0;
}

export function getDisplacementFilter(options: DisplacementFilterOptions): string {
  if (isEmpty(options)) return 'none';
  const key = filterKey(options);
  let entry = existing(key);
  if (!entry) {
    const mapUri = generateDisplacementMap(options);
    if (!mapUri) return 'none';
    entry = addEntry(key, options, mapUri);
  }
  return `url(#${entry.id})`;
}

export function getDisplacementFilterAsync(options: DisplacementFilterOptions): Promise<string> {
  if (isEmpty(options)) return Promise.resolve('none');
  const key = filterKey(options);
  const found = existing(key);
  if (found) return found.ready.then(() => `url(#${found.id})`);
  const running = inflight.get(key);
  if (running) return running;

  const job = generateDisplacementMapAsync(options).then((mapUri) => {
    inflight.delete(key);
    if (!mapUri) return 'none';
    const entry = existing(key) ?? addEntry(key, options, mapUri);
    return entry.ready.then(() => `url(#${entry.id})`);
  });
  inflight.set(key, job);
  return job;
}

export function retainDisplacementFilter(url: string) {
  const key = urlToKey.get(url);
  const entry = key && registry.get(key);
  if (!entry) return;
  entry.refs++;
  if (entry.removeTimer !== null) {
    clearTimeout(entry.removeTimer);
    entry.removeTimer = null;
  }
}

export function releaseDisplacementFilter(url: string) {
  const key = urlToKey.get(url);
  const entry = key && registry.get(key);
  if (!key || !entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs === 0) scheduleRemoval(key, entry);
}

function scheduleRemoval(key: string, entry: Entry) {
  if (entry.removeTimer !== null) clearTimeout(entry.removeTimer);
  entry.removeTimer = window.setTimeout(() => {
    entry.removeTimer = null;
    if (entry.refs > 0) return;
    entry.el.remove();
    registry.delete(key);
    urlToKey.delete(`url(#${entry.id})`);
  }, REMOVE_DELAY);
}
