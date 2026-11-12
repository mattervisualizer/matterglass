
# what is this?
**matterglass** is the most developer-friendly [React](https://github.com/facebook/react) glassmorphism UI library yet, inspired by Apple Liquid Glass.

the background behind the element is actually refracted through an SVG displacement map, with a soft specular rim and tint.

<img width="512" height="512" alt="Снимок экрана 2026-11-12 194720" src="https://github.com/user-attachments/assets/9649f12a-9904-4f5b-ae9c-3e4ceaaef171" />


# installation
```bash
npm install matterglass
```

# how to use
```tsx
import { Glass } from 'matterglass';

export function GlassyHelloBlock() {
  return (
    <Glass className="rounded-[32px] p-6">
      <span>Hello, world.</span>
    </Glass>
  );
}
```
`<Glass>` renders a `<div>` and accepts every regular `<div>` prop: `className`, `style`, `onClick`, `ref` etc. its shape comes from your own `border-radius`, and a background color set on it (like `bg-white/10`) becomes the tint of the glass.

basically, think of it as a standard `<div>`. there won't be any conflicts or issues with it: it's a fully customizable element.

## props
| prop | default | description |
|  ---  |  ---  |  ---  |
|  `profile`  |  `'squircle'`  | shape of the edge: `'squircle'`, `'convex'`, `'concave'`, `'lip'` or a function `(x: number) => number` (0 = edge, 1 = flat part) |
|  `bezelWidth`  |  `32`  | width of the refracting edge, px |
|  `refractiveIndex`  |  `1.2`  | how strongly the edge bends light |
|  `strength`  |  `96`  | maximum displacement of the background, px |
|  `chromaticAberration`  |  `0`  | color fringing on the edge, px |
|  `blur`  |  `0.7`  | background blur, px |
|  `safariBlur`  |  `6`  | background blur in Safari, px |
|  `bloom`  |  `1.08`  | brightness and saturation of what is behind the glass |
|  `specular`  |  `true`  | specular rim |
|  `specularWidth`  |  `1`  | rim thickness, px |
|  `specularAngle`  |  `0`  | rotation of the light, degrees |
|  `specularIntensity`  |  `0.71`  | rim brightness, 0–1 |
|  `specularAdaptive`  |  `false`  | the rim brightens the background behind it instead of being drawn white |

glass can be nested. an inner `Glass` cuts its own hole in the outer one, so the filters do not stack.

## browsers
| browser | what you get |
|  ---  |  ---  |
| Google Chrome, Opera, Microsoft Edge ... (any Chromium browser) | full refraction (`backdrop-filter` with an SVG filter) |
| Mozilla Firefox | refraction for top-level glass (a live copy of the background via `-moz-element`); nested glass is frosted |
| any browser on iOS, Safari, WebKit | frosted glass: blur, tint and rim, no refraction |

## why no refraction in safari?
short answer: WebKit cant do it properly. yet...

refraction in Chromium works through `backdrop-filter: url(#svg-filter)`. WebKit simply ignores `url()` inside `backdrop-filter` and drops the whole value. it's a [known bug](https://bugs.webkit.org/show_bug.cgi?id=245510) that has been open since 2022, and as of Safari 27 its still not fixed.

so i tried to work around it the same way as in Firefox: copy whatever is behind the glass into the glass itself and bend that copy with a regular `filter`. and it actually works... but only until something moves:
- **scrolling.** iOS scrolls the page natively, outside of JavaScript. the copy can only catch up from JS, so on any fixed or sticky glass (headers, floating buttons) the content behind it lags and tears, even on slow scroll;
- **animations.** CSS animations, `<canvas>`, `<video>` behind the glass can't be copied live. the glass would show a frozen frame while everything around it moves;
- **limits.** Safari renders animated content inside SVG filters as empty, and drops filters on large areas.

i tested pretty much everything: prediction of the scroll position, iOS momentum math, JS-driven scrolling (synced, but locked to 60 fps), filters on the scroll container itself. none of it looks right. buggy refraction is worse than no refraction, so Safari gets clean frosted glass instead: native `backdrop-filter`, buttery smooth at 120 Hz. tweak `safariBlur` to make it look the way you want.

once WebKit ships `url()` support in `backdrop-filter`, full refraction will come to Safari too.

## firefox notes
Firefox doesnt support SVG filters in `backdrop-filter` either, but it has `-moz-element()`: a live picture of any element on the page. so top-level glass draws a copy of the background with it and refracts it. it works smoothly, with a couple of trade-offs:
- nested glass is frosted (a copy inside a copy would be way too heavy);
- SVG filters in Firefox run on the CPU, so a lot of big glass on one page can get heavy.

## tips
- glass is only visible because of what is behind it. on a flat single-color background there is nothing to refract, so play with `bloom` and the tint instead;
- `strength` and `bezelWidth` are clamped automatically on small elements, so tiny glass (like slider thumbs) wont break;
- glass sets `position: relative` on itself only if you didn't set any position. `absolute`, `fixed`, `sticky` and responsive variants work as usual.

# license
MIT . do whatever you want </3
