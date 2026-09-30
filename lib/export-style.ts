/**
 * The one look of every document that leaves the application — block D, D.28.
 *
 * The Confluence/HTML exports of the Analyze, Design and Documentation stages
 * and the Word summary of the audit pack are standalone files: a reader opens
 * them in a browser, pastes them into Confluence or opens them in Word, and
 * none of those can read the CSS variables of `app/globals.css`. So the
 * colours are written out here, once, as named values — each one the value of
 * the token it is named after (`--cc-ink` is `EXPORT_COLORS.ink`). Before this
 * file every template carried a stylesheet of its own: Atlassian blue in two,
 * brand green headings and Calibri in the audit pack, and a grey footer at
 * 3.9 : 1.
 *
 * What DESIGN.md asks of a document, and where it is kept:
 *   - Inter where it is installed, the system face otherwise (§1.2) — no font
 *     is fetched: the exports carry no `<link>` (`tests/export-inertness-guard.spec.ts`
 *     counts them).
 *   - Headings and table heads in ink, never brand green (§1.1, "Grün heißt
 *     belegt"); a state colour only on a word that names the state.
 *   - The type scale of the workspace: 22 / 15 / 14 / 13 / 12 / 11 px.
 *   - Every text pair ≥ 4.5 : 1 — the footer is ink-muted on a muted surface.
 *   - The print rules of §7.1: no background, ink on white, a 1-px border
 *     instead of a shadow, no break inside a card or a table row, link targets
 *     printed in brackets, chips keep their word and their border.
 *
 * `tests/helpers/design-rules.ts` names this file as the one place outside
 * `app/globals.css` where a colour literal is allowed ("Standalone-Export"),
 * and holds the templates that use it to none.
 */

import { normaliseSeverity, SEVERITY } from './severity';

/** The tokens of `app/globals.css`, as a standalone document needs them. */
export const EXPORT_COLORS = {
  ink: '#0b1c30',
  inkMuted: '#4b5563',
  line: '#e5e7eb',
  fieldBorder: '#6b7280',
  surface: '#ffffff',
  surfaceMuted: '#f9fafb',
  success: '#047857',
  successBg: '#ecfdf5',
  warning: '#92400e',
  warningBg: '#fffbeb',
  warningLine: '#b45309',
  error: '#b91c1c',
  errorBg: '#fef2f2',
  information: '#1d4ed8',
  informationBg: '#eff6ff',
  neutral: '#4b5563',
  neutralBg: '#f9fafb',
} as const;

/** Inter where it is installed; nothing is downloaded for it. */
export const EXPORT_FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** `--cc-font-mono`. */
export const EXPORT_FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** The five semantic states of §1.1, as the class names the stylesheet defines. */
export type ExportTone = 'success' | 'warning' | 'error' | 'information' | 'neutral';

const C = EXPORT_COLORS;

/** The class of a chip in a state: `tag tone-error`. Only ever one of our own five. */
export function toneClass(tone: ExportTone): string {
  return `tag tone-${tone}`;
}

/**
 * A severity chip's class, through `lib/severity.ts` like every severity on
 * screen: Critical and High are `error`, Medium `warning`, Low `neutral`, Info
 * `information` — never green. A word that is not one of the five is neutral;
 * the chip still prints the word it was given.
 */
export function severityClass(value: unknown): string {
  const v = normaliseSeverity(value);
  return toneClass(v ? SEVERITY[v].state : 'neutral');
}

const TONES: Array<[ExportTone, string, string, string]> = [
  ['success', C.success, C.successBg, C.success],
  ['warning', C.warning, C.warningBg, C.warningLine],
  ['error', C.error, C.errorBg, C.error],
  ['information', C.information, C.informationBg, C.information],
  ['neutral', C.neutral, C.neutralBg, C.fieldBorder],
];

/**
 * The stylesheet of the stage exports, without the `<style>` element.
 *
 * Classes a template may use: `header`, `meta`, `summary-box`, `card-grid`,
 * `card`, `card-title`, `note` (a "not determined" box, dashed), `tag` with
 * `tone-<state>`, `accent-<state>` (a card's left rule), `muted`, `mono`,
 * `strong`, `footer`.
 */
export const EXPORT_CSS = `
  body { font-family: ${EXPORT_FONT}; font-size: 14px; color: ${C.ink}; background: ${C.surface}; line-height: 1.55; padding: 40px; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: ${C.ink}; margin: 0 0 8px; }
  h2 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid ${C.line}; }
  h3, h4 { font-size: 14px; font-weight: 700; color: ${C.ink}; margin: 24px 0 8px; }
  p { margin: 0 0 12px; }
  ul, ol { margin: 0 0 12px; padding-left: 24px; }
  li { margin-bottom: 4px; }
  small { font-size: 12px; color: ${C.inkMuted}; }
  code, .mono { font-family: ${EXPORT_FONT_MONO}; font-size: 12px; }
  code { background: ${C.surfaceMuted}; border: 1px solid ${C.line}; border-radius: 4px; padding: 0 4px; }
  pre { background: ${C.surfaceMuted}; border: 1px solid ${C.line}; border-radius: 8px; padding: 12px; overflow-x: auto; }
  pre code { background: none; border: 0; padding: 0; }
  blockquote { margin: 16px 0; padding: 8px 16px; border-left: 4px solid ${C.line}; color: ${C.inkMuted}; }
  hr { border: 0; border-top: 1px solid ${C.line}; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 13px; }
  th { background: ${C.surfaceMuted}; color: ${C.inkMuted}; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 12px; border-bottom: 1px solid ${C.fieldBorder}; vertical-align: bottom; }
  td { padding: 8px 12px; border-bottom: 1px solid ${C.line}; vertical-align: top; }
  .header { border-bottom: 1px solid ${C.line}; padding-bottom: 16px; margin-bottom: 24px; }
  .meta { color: ${C.inkMuted}; font-size: 12px; font-weight: 600; }
  .muted { color: ${C.inkMuted}; }
  .strong { font-weight: 700; }
  .summary-box { background: ${C.surfaceMuted}; border: 1px solid ${C.line}; border-left: 4px solid ${C.ink}; border-radius: 0 8px 8px 0; padding: 16px 24px; margin-bottom: 24px; }
  .summary-box h3 { margin-top: 0; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin: 12px 0 24px; }
  .card { border: 1px solid ${C.line}; border-radius: 12px; padding: 16px; background: ${C.surface}; }
  .card > :first-child { margin-top: 0; }
  .card-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.inkMuted}; margin: 0 0 8px; }
  .score { font-size: 22px; font-weight: 800; margin: 0; }
  .note { border: 1px dashed ${C.fieldBorder}; border-radius: 8px; padding: 16px; margin: 16px 0; color: ${C.inkMuted}; }
  .tag { display: inline-block; font-size: 12px; font-weight: 600; line-height: 1.4; padding: 0 8px; border: 1px solid; border-radius: 4px; white-space: nowrap; }
${TONES.map(([t, fg, bg, border]) => `  .tone-${t} { color: ${fg}; background: ${bg}; border-color: ${border}; }`).join('\n')}
${TONES.map(([t, , , border]) => `  .accent-${t} { border-left: 4px solid ${border}; }`).join('\n')}
  .footer { margin-top: 40px; padding: 12px 16px; background: ${C.surfaceMuted}; border: 1px solid ${C.line}; border-radius: 8px; font-size: 12px; color: ${C.inkMuted}; text-align: center; }
  @media print {
    body { background: none; color: ${C.ink}; padding: 0; max-width: none; }
    .card, .summary-box, .note, .footer, pre { box-shadow: none; background: none; border: 1px solid ${C.line}; }
    .summary-box { border-left: 4px solid ${C.ink}; }
    .tag { background: none; }
    th { background: none; }
    tr, .card, .summary-box, .note, pre { break-inside: avoid; }
    thead { display: table-header-group; }
    h1, h2, h3, h4 { break-after: avoid; }
    a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 12px; color: ${C.inkMuted}; }
  }
`;

/** The stylesheet as the `<style>` element a template puts in its head. */
export const EXPORT_STYLE_ELEMENT = `<style>${EXPORT_CSS}</style>`;

/**
 * The Word flavour of the same look, for the audit pack's executive summary
 * (`00-executive-summary.doc`). Word lays pages out in points and ignores most
 * of the screen rules above, so the sizes are points and the page has its
 * margin; the colours and faces are the same set.
 */
export const EXPORT_WORD_CSS = `
    body { font-family: ${EXPORT_FONT}; font-size: 10.5pt; line-height: 1.5; color: ${C.ink}; margin: 1in; }
    h1 { font-size: 16.5pt; font-weight: 800; color: ${C.ink}; border-bottom: 1px solid ${C.fieldBorder}; padding-bottom: 5px; margin-top: 0; }
    h2 { font-size: 11.5pt; font-weight: 700; color: ${C.ink}; margin-top: 20px; border-bottom: 1px solid ${C.line}; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
    th { background-color: ${C.surfaceMuted}; color: ${C.ink}; text-align: left; font-size: 8.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 10px; border: 1px solid ${C.fieldBorder}; }
    td { padding: 6px 10px; border: 1px solid ${C.line}; vertical-align: top; }
    blockquote { border-left: 4px solid ${C.fieldBorder}; padding-left: 10px; margin-left: 0; color: ${C.inkMuted}; font-style: italic; }
    code { font-family: ${EXPORT_FONT_MONO}; background-color: ${C.surfaceMuted}; padding: 2px 4px; font-size: 9pt; }
    .footer { font-size: 9pt; color: ${C.inkMuted}; text-align: right; margin-top: 40px; border-top: 1px solid ${C.line}; padding-top: 5px; }
    @media print {
      th { background: none; }
      tr { break-inside: avoid; }
      thead { display: table-header-group; }
    }
`;
