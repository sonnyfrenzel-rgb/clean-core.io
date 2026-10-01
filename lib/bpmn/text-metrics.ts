/**
 * Text width without a browser — the measure the BPMN layout plans with.
 *
 * The layout runs on the server and in specs, where there is no canvas to ask
 * how wide a word is. So it estimates: an advance-width table for the UI font
 * (Inter, which both the workspace map and the landing page draw labels in),
 * rounded **up**, plus a safety factor. An estimate that is too wide costs a few
 * pixels of air; one that is too narrow lets a renderer wrap into a line the
 * layout did not reserve, which is exactly the overlap this module exists to
 * prevent.
 *
 * The wrapping copies the rule `diagram-js` applies when bpmn-js draws a label
 * (`diagram-js/lib/util/Text.js`): break at spaces and hyphens, and cut a word
 * that does not fit on a line of its own. Same rule, same line count — so a box
 * sized here holds what bpmn-js draws into it.
 *
 * Pure and deterministic: no DOM, no randomness, no locale.
 */

/** Advance widths in em, rounded up, for the characters labels are made of. */
const WIDTHS: Record<string, number> = {
  ' ': 0.28, '!': 0.3, '"': 0.4, '#': 0.66, '$': 0.64, '%': 0.85, '&': 0.72, "'": 0.24, '(': 0.36, ')': 0.36,
  '*': 0.48, '+': 0.64, ',': 0.27, '-': 0.44, '.': 0.27, '/': 0.42, ':': 0.29, ';': 0.29, '<': 0.64, '=': 0.64,
  '>': 0.64, '?': 0.52, '@': 0.98, '[': 0.36, '\\': 0.42, ']': 0.36, '^': 0.5, _: 0.5, '`': 0.3, '{': 0.38,
  '|': 0.28, '}': 0.38, '~': 0.64, '…': 0.82, '–': 0.62, '—': 0.98, '·': 0.3, '›': 0.4, '’': 0.25,
  a: 0.56, b: 0.61, c: 0.55, d: 0.61, e: 0.58, f: 0.36, g: 0.61, h: 0.6, i: 0.25, j: 0.26, k: 0.55, l: 0.25,
  m: 0.9, n: 0.6, o: 0.6, p: 0.61, q: 0.61, r: 0.39, s: 0.53, t: 0.37, u: 0.6, v: 0.56, w: 0.82, x: 0.55,
  y: 0.56, z: 0.53,
  A: 0.7, B: 0.66, C: 0.73, D: 0.73, E: 0.6, F: 0.58, G: 0.75, H: 0.76, I: 0.29, J: 0.54, K: 0.68, L: 0.55,
  M: 0.91, N: 0.77, O: 0.78, P: 0.64, Q: 0.78, R: 0.66, S: 0.64, T: 0.64, U: 0.75, V: 0.7, W: 1.0, X: 0.69,
  Y: 0.67, Z: 0.64,
};
const DIGIT = 0.64;
const OTHER = 0.7;
/** Bold text is wider; Inter at 600 runs about six per cent wider than at 400. */
const BOLD = 1.07;
/** The margin for the font the browser really has. */
const SAFETY = 1.06;

export const LINE_HEIGHT_RATIO = 1.2;

export function lineHeight(fontSize: number): number {
  return Math.ceil(fontSize * LINE_HEIGHT_RATIO);
}

/** Estimated width of one line of text, in px. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  let em = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') em += DIGIT;
    else em += WIDTHS[ch] ?? OTHER;
  }
  return Math.ceil(em * fontSize * SAFETY * (bold ? BOLD : 1));
}

/**
 * Lines as `diagram-js` would break `text` into a box `maxWidth` wide: at
 * spaces and hyphens where it can, by cutting the word where it cannot.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let rest = paragraph.trim();
    if (!rest) continue;
    while (rest) {
      if (textWidth(rest, fontSize, bold) <= maxWidth) {
        out.push(rest);
        break;
      }
      // Longest prefix that ends at a break opportunity and fits.
      const parts = rest.split(/(\s|-)/);
      let line = '';
      for (const part of parts) {
        const next = line + part;
        if (textWidth(next.trimEnd(), fontSize, bold) <= maxWidth) line = next;
        else break;
      }
      line = line.trimEnd();
      if (!line || line === '-') {
        // One word wider than the box: cut it by characters.
        let n = 1;
        while (n < rest.length && textWidth(rest.slice(0, n + 1), fontSize, bold) <= maxWidth) n += 1;
        line = rest.slice(0, n);
      }
      out.push(line);
      rest = rest.slice(line.length).trim();
    }
  }
  return out;
}

/** Widest line of a set, estimated. */
export function blockWidth(lines: string[], fontSize: number, bold = false): number {
  return lines.reduce((w, l) => Math.max(w, textWidth(l, fontSize, bold)), 0);
}

/**
 * Wrap for a reader rather than for bpmn-js: break after `_` too, so a
 * technical name such as `ENRICH_MATERIALS_AND_STOCK` breaks between its words.
 * Used where this product draws the text itself (the landing page SVG).
 */
export function wrapIdentifier(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const spaced = text.replace(/_(?=[A-Za-z0-9])/g, '_\u0000');
  const words = spaced.split(/\u0000|(?<=\s)/);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && textWidth((line + word).trimEnd(), fontSize, bold) > maxWidth) {
      out.push(line.trimEnd());
      line = word.trimStart();
    } else {
      line += word;
    }
  }
  if (line.trim()) out.push(line.trimEnd());
  return out.flatMap((l) => (textWidth(l, fontSize, bold) <= maxWidth ? [l] : wrapText(l, maxWidth, fontSize, bold)));
}
