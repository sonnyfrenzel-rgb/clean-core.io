/**
 * WCAG 2.2 contrast, computed rather than claimed.
 *
 * `DESIGN.md` §1.1 states a ratio for every token pair, and a table of numbers
 * in a document is a promise. This is the arithmetic that checks it — no new
 * dependency, which is what §8 asks for, and the same twelve lines every
 * contrast checker has.
 *
 * Alpha matters more than it looks: the highlighted code line is a translucent
 * blue over near-black, and a naive reader of `getComputedStyle` gets
 * `rgba(59, 130, 246, 0.28)` and computes the contrast of a colour nobody can
 * see. `flatten` composites it first.
 */

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

/** `rgb(11, 28, 48)`, `rgba(0,0,0,.4)`, `rgb(11 28 48 / 45%)`, `#0b1c30`, `#abc`. */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return [0, 0, 0, 0];

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    const digits = hex[1];
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (digits.length === 3 || digits.length === 4) {
      return [
        expand(digits[0]),
        expand(digits[1]),
        expand(digits[2]),
        digits.length === 4 ? expand(digits[3]) / 255 : 1,
      ];
    }
    if (digits.length === 6 || digits.length === 8) {
      return [
        expand(digits.slice(0, 2)),
        expand(digits.slice(2, 4)),
        expand(digits.slice(4, 6)),
        digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
      ];
    }
    return null;
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!fn) return null;
  const parts = fn[1]
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (s: string) => (s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s));
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return [channel(parts[0]), channel(parts[1]), channel(parts[2]), Number.isFinite(alpha) ? alpha : 1];
}

/** Composites a translucent colour over an opaque one. */
export function flatten(over: Rgba, under: Rgb): Rgb {
  const a = over[3];
  return [
    over[0] * a + under[0] * (1 - a),
    over[1] * a + under[1] * (1 - a),
    over[2] * a + under[2] * (1 - a),
  ];
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Contrast of two CSS colour strings, the second treated as the opaque ground. */
export function ratioOf(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const ground: Rgb = [bg[0], bg[1], bg[2]];
  return contrastRatio(flatten(fg, ground), ground);
}

export const round2 = (value: number) => Math.round(value * 100) / 100;
