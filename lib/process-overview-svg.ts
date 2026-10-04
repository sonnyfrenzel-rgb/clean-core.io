import { escapeHtml } from '@/lib/export-safety';
import { EXPORT_COLORS, EXPORT_FONT } from '@/lib/export-style';
import { linesLabel, type PdPathEntry } from '@/lib/process-document';

/**
 * The main path of the process description as one picture — the overview a
 * Confluence page or a printout carries in place of the live map.
 *
 * Drawn from the document's own path (`ProcessDocument.overview.path`), not
 * from a second reading: the numbered steps, the decision points between them
 * with the outcome that ends the run, a start and an end. One column, top to
 * bottom, so it reads on a narrow page and survives being pasted. The full map
 * with every sub-process stays on the stage and in the BPMN 2.0 file.
 *
 * Every label is a value from the source or the naming stage and goes through
 * `escapeHtml`; every number is ours. Nothing else is interpolated.
 */

const C = EXPORT_COLORS;
const WIDTH = 640;
const CX = 190;
const BOX_W = 300;
const BOX_H = 46;
const ROW = 70;
const MAX_LABEL = 40;

const clip = (text: string, max = MAX_LABEL) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const n = (value: number) => String(Math.round(value));

export function processOverviewSvg(path: readonly PdPathEntry[], title: string): string {
  const esc = escapeHtml;
  const parts: string[] = [];
  let y = 24;

  // Start.
  parts.push(`<circle cx="${n(CX)}" cy="${n(y)}" r="12" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.5"/>`);
  parts.push(`<text x="${n(CX + 22)}" y="${n(y + 4)}" font-size="12" fill="${C.inkMuted}">Run starts</text>`);
  let prevBottom = y + 12;

  for (const entry of path) {
    y += ROW;
    if (entry.kind === 'step') {
      const top = y - BOX_H / 2;
      parts.push(`<line x1="${n(CX)}" y1="${n(prevBottom)}" x2="${n(CX)}" y2="${n(top - 2)}" stroke="${C.fieldBorder}" stroke-width="1.5" marker-end="url(#pd-arrow)"/>`);
      parts.push(`<rect x="${n(CX - BOX_W / 2)}" y="${n(top)}" width="${n(BOX_W)}" height="${n(BOX_H)}" rx="8" fill="${C.surfaceMuted}" stroke="${C.ink}" stroke-width="1"/>`);
      parts.push(`<text x="${n(CX - BOX_W / 2 + 12)}" y="${n(y - 3)}" font-size="13" font-weight="700" fill="${C.ink}">${esc(clip(`${entry.number}. ${entry.businessName ?? entry.name}`))}</text>`);
      // The plain line under the name; the lines and the sub-steps beside the box, muted.
      parts.push(`<text x="${n(CX - BOX_W / 2 + 12)}" y="${n(y + 14)}" font-size="11" fill="${C.inkMuted}">${esc(clip(entry.line || entry.technicalName, 44))}</text>`);
      const count = entry.subSteps.length + entry.moreSubSteps;
      const side = [linesLabel(entry.anchors.slice(0, 2)) || 'lines not determined', count > 0 ? `${count} sub-step${count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
      parts.push(`<text x="${n(CX + BOX_W / 2 + 10)}" y="${n(y + 4)}" font-size="11" fill="${C.inkMuted}">${esc(side)}</text>`);
      prevBottom = y + BOX_H / 2;
    } else {
      const r = 16;
      parts.push(`<line x1="${n(CX)}" y1="${n(prevBottom)}" x2="${n(CX)}" y2="${n(y - r - 2)}" stroke="${C.fieldBorder}" stroke-width="1.5" marker-end="url(#pd-arrow)"/>`);
      parts.push(`<polygon points="${n(CX)},${n(y - r)} ${n(CX + r)},${n(y)} ${n(CX)},${n(y + r)} ${n(CX - r)},${n(y)}" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.5"/>`);
      parts.push(`<text x="${n(CX + r + 10)}" y="${n(y - 2)}" font-size="12" font-weight="600" fill="${C.ink}">${esc(clip(entry.label, 36))}</text>`);
      const ending = entry.outcomes.find((o) => o.ends);
      const other = entry.outcomes.filter((o) => !o.ends);
      const note = ending
        ? `${ending.when}: the run ends`
        : other.length > 1 ? other.map((o) => `${o.when}: ${o.then.replace(/^continue with /, '')}`).join(' · ') : '';
      if (note) parts.push(`<text x="${n(CX + r + 10)}" y="${n(y + 13)}" font-size="11" fill="${C.inkMuted}">${esc(clip(note, 60))}</text>`);
      prevBottom = y + r;
    }
  }

  // End.
  y += ROW;
  parts.push(`<line x1="${n(CX)}" y1="${n(prevBottom)}" x2="${n(CX)}" y2="${n(y - 16)}" stroke="${C.fieldBorder}" stroke-width="1.5" marker-end="url(#pd-arrow)"/>`);
  parts.push(`<circle cx="${n(CX)}" cy="${n(y)}" r="12" fill="${C.surface}" stroke="${C.ink}" stroke-width="3"/>`);
  parts.push(`<text x="${n(CX + 22)}" y="${n(y + 4)}" font-size="12" fill="${C.inkMuted}">Run ends</text>`);
  const height = y + 28;

  const steps = path.filter((e) => e.kind === 'step').length;
  const gates = path.length - steps;
  const label = `${title}: ${steps} step${steps === 1 ? '' : 's'} and ${gates} decision point${gates === 1 ? '' : 's'} on the main path`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${n(WIDTH)} ${n(height)}" width="${n(WIDTH)}" height="${n(height)}" font-family="${EXPORT_FONT.replace(/"/g, "'")}" data-process-overview="">`
    + `<title>${esc(label)}</title>`
    + `<defs><marker id="pd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.fieldBorder}"/></marker></defs>`
    + parts.join('')
    + '</svg>';
}
