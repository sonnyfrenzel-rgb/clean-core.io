import { NOT_DETERMINED, type BriefSection, type BriefStatement, type ProcessBrief } from '@/lib/brief/model';
import { renderTextPdf, type PdfTextBlock } from '@/lib/brief/pdf-writer';

/**
 * The brief as a PDF — roadmap 4.4.
 *
 * The typesetting is in `lib/brief/pdf-writer.ts`; what is here is the shape of
 * the document, and one rule governs it: **every statement is printed with its
 * evidence line directly under it.** The two are never separated, never
 * collapsed into one line and never made optional, because a brief whose claims
 * and whose anchors can drift apart is a brief whose claims are unanchored the
 * first time somebody edits the layout.
 *
 * A model's proposal is labelled where it stands. Roadmap 2.4's business name
 * and lane are the only model output in this document, and `DESIGN.md` §3.1
 * allows the product to name the model factually — which is what the line under
 * such a statement does.
 *
 * Pure. The time is passed in, so the same brief and the same time give the same
 * bytes; nothing here reads a clock.
 */

export interface BriefPdfOptions {
  /** ISO 8601 — printed as a date and recorded as the document's creation time. */
  generatedAt: string;
}

/** The date, as the ISO day. No locale, so the same brief reads the same everywhere. */
function day(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

/** What stands in a section that has no statements. Never a claim beyond the counting. */
const EMPTY_SECTION: Record<BriefSection['key'], string> = {
  picture: 'No element was drawn from this source.',
  rules: 'No business rule was derived from this source.',
  questions: 'No open question was found in the sources this brief reads.',
};

function statementBlocks(statement: BriefStatement): PdfTextBlock[] {
  const blocks: PdfTextBlock[] = [
    { style: 'body', text: statement.text },
    { style: 'detail', text: statement.evidence },
  ];
  if (statement.origin === 'model-proposal') {
    blocks.push({
      style: 'detail',
      text: 'Model proposal — the business name and the lane. The technical name and the lines are the engine’s.',
    });
  }
  const confirmed = statement.confirmation;
  if (confirmed) {
    blocks.push({
      style: 'detail',
      text: `Confirmed: ${confirmed.label} — ${confirmed.account}, ${day(confirmed.confirmedAt)}, `
        + `revision ${confirmed.revision}.${confirmed.note ? ` Note: ${confirmed.note}` : ''}`,
    });
  }
  return blocks;
}

/** The blocks of the document, in print order. Exported so a test can read the plan. */
export function briefBlocks(brief: ProcessBrief, options: BriefPdfOptions): PdfTextBlock[] {
  const blocks: PdfTextBlock[] = [
    { style: 'title', text: brief.processName },
    { style: 'subtitle', text: `Brief on ${brief.fileName}. Written ${day(options.generatedAt)}.` },
    { style: 'lead', text: brief.disclaimer },
    { style: 'lead', text: brief.traceability.sentence },
    {
      style: 'lead',
      text: `${brief.counts.statements} ${brief.counts.statements === 1 ? 'statement' : 'statements'} in this brief: `
        + `${brief.counts.anchored} name a line range, ${brief.counts.undetermined} say `
        + `${NOT_DETERMINED.toLowerCase()}.`,
    },
  ];

  for (const section of brief.sections) {
    // Each section starts a page of its own, except the first: a reader who was
    // sent this to answer one question wants to find the section, not scroll to
    // the place a paragraph happened to end.
    blocks.push({ style: 'heading', text: section.title, pageBreakBefore: section.key !== 'picture' });
    blocks.push({ style: 'lead', text: section.lead });
    if (section.key === 'questions') blocks.push({ style: 'lead', text: brief.targetDisclaimer });

    if (section.statements.length === 0) {
      blocks.push({ style: 'body', text: EMPTY_SECTION[section.key] });
      continue;
    }
    for (const statement of section.statements) blocks.push(...statementBlocks(statement));
  }

  return blocks;
}

/** The brief as PDF bytes. */
export function briefPdf(brief: ProcessBrief, options: BriefPdfOptions): Uint8Array {
  return renderTextPdf({
    title: `${brief.processName} — brief`,
    footer: `clean-core.io · ${brief.fileName}`,
    createdAt: options.generatedAt,
    blocks: briefBlocks(brief, options),
  });
}
