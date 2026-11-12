# matterglass

Liquid glass for React. The background behind an element is actually refracted through an SVG displacement map, with a soft specular rim and tint.

```bash
npm install matterglass
```

```tsx
import { Glass } from 'matterglass';

export function Card() {
  return (
    <Glass className="rounded-[32px] p-6">
      Hello
    </Glass>
  );
}
```

`Glass` renders a `div` and accepts every regular `div` prop (`className`, `style`, `onClick`, `ref`, …). Its shape comes from your own `border-radius`; a background color set on it (`bg-white/10`) becomes the tint of the glass.

## Props

| Prop | Default | Description |
| --- | --- | --- |
| `profile` | `'squircle'` | Shape of the edge: `'squircle'`, `'convex'`, `'concave'`, `'lip'` or a function `(x: number) => number` (0 = edge, 1 = flat part) |
| `bezelWidth` | `32` | Width of the refracting edge, px |
| `refractiveIndex` | `1.2` | How strongly the edge bends light |
| `strength` | `96` | Maximum displacement of the background, px |
| `chromaticAberration` | `0` | Color fringing on the edge, px |
| `blur` | `0.7` | Background blur, px |
| `safariBlur` | `6` | Background blur in Safari, px (Safari has no refraction, see below) |
| `bloom` | `1.08` | Brightness and saturation of what is behind the glass |
| `specular` | `true` | Specular rim |
| `specularWidth` | `1` | Rim thickness, px |
| `specularAngle` | `0` | Rotation of the light, degrees |
| `specularIntensity` | `0.71` | Rim brightness, 0–1 |
| `specularAdaptive` | `false` | The rim brightens the background behind it instead of being drawn white |

Glass can be nested: an inner `Glass` cuts its own hole in the outer one, so the filters don't stack.

## Browsers

| Browser | What you get |
| --- | --- |
| Chrome, Edge, Opera, Electron | Full refraction (`backdrop-filter` with an SVG filter) |
| Firefox | Refraction for top-level glass (a live copy of the background via `-moz-element`); nested glass is frosted |
| Safari, any browser on iOS | Frosted glass: blur, tint and rim, no refraction — WebKit does not support SVG filters in `backdrop-filter` |

## License

MIT
