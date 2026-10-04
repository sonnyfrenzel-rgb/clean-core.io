import { PRIORITY_LABEL } from '@/lib/functional-requirements';
import { REQUIREMENT_STATUS_LABEL } from '@/lib/requirement-status';
import { richPlain } from '@/lib/rich-text';
import { EXPORT_COLORS, EXPORT_FONT, EXPORT_FONT_MONO } from '@/lib/export-style';
import { escapeHtml } from '@/lib/export-safety';
import {
  blocksDocx,
  blocksDocxParts,
  blocksHtml,
  blocksMarkdown,
  type DocBlock,
} from '@/lib/requirements-export';
import {
  DECISION_OWNER_LABEL,
  SPEC_DOC_STATUS_LABEL,
  SPEC_NFR_CATEGORIES,
  SPEC_NFR_CATEGORY_LABEL,
  decisionOpen,
  linesText,
  specCounts,
  traceRows,
  type RequirementsSpec,
  type SpecDecision,
  type SpecHistoryEntry,
  type SpecRequirement,
} from '@/lib/requirements-spec';

/**
 * The requirements specification as a document that leaves the application —
 * Word, Markdown and a Confluence page — from one block list
 * (`lib/requirements-export.ts`), so the three cannot say different things.
 *
 * Written for an implementer who never saw the ABAP: a title page with the
 * facts of the document, the contents, the nine numbered sections, and the
 * revision history as an appendix. Every requirement says where it comes from
 * in words — *Reconstructed from the code*, *Written in the workspace*,
 * *Accepted by the author* — and a model's proposal for a decision is printed
 * as one, beside the answer, never as the answer. The specification is not
 * evidence and the title page says so: it is not part of the signed audit pack.
 *
 * Every value is escaped where it is spelled: `escapeRichText`/`esc` in the
 * HTML half, `run()` in Word; Markdown is the format itself.
 */

export interface SpecExportMeta {
  /** ISO date of the export, handed in: this module reads no clock. */
  date: string;
  /** The file the signed run read, and its SHA-256. */
  fileName: string;
  sourceSha256: string;
  revision: number;
  /** The account that saved last — a self-declaration of the signed-in account. */
  author: string;
  history: readonly SpecHistoryEntry[];
  /** True when the document was written for an earlier source than the signed one. */
  stale?: boolean;
}

export const SPEC_EXPORT_NOTE =
  'Drafted from the ABAP source by the Clean-Core.io engine and completed in the requirements workspace. Requirements marked “Reconstructed from the code” are read from the current program and not confirmed by a person; “Accepted” is the author’s own statement, not an organisational approval. Line references (L…) point at the signed source named above. This specification is not evidence and is not part of the signed audit pack.';

export function provenanceWords(r: SpecRequirement): string {
  if (r.status === 'accepted') return r.origin === 'engine' ? 'Reconstructed from the code; accepted by the author' : 'Written in the workspace; accepted by the author';
  return r.origin === 'engine' ? 'Reconstructed from the code — not confirmed' : 'Written in the workspace';
}

function answerText(d: SpecDecision): string {
  if (!d.answer) return 'Open';
  if (d.answer.kind === 'later') return 'Open — to be decided later';
  const who = d.answer.by ? ` (${d.answer.by}${d.answer.at ? `, ${d.answer.at.slice(0, 10)}` : ''})` : '';
  return `${richPlain(d.answer.value)}${who}`;
}

const SECTIONS = [
  '1. Purpose and scope',
  '2. Context and stakeholders',
  '3. Functional requirements',
  '4. Non-functional requirements',
  '5. Interfaces and data',
  '6. Constraints and assumptions',
  '7. Open decisions',
  '8. Traceability matrix',
  '9. Glossary',
] as const;

function requirementBlocks(r: SpecRequirement, number: string): DocBlock[] {
  const out: DocBlock[] = [
    { k: 'h', level: 4, text: `${number} ${r.id} — ${r.title}` },
    { k: 'rich', text: r.statement },
  ];
  const kv: Array<[string, string]> = [];
  if (r.kind === 'non-functional') {
    kv.push(['Target', richPlain(r.target) || 'Not determined']);
    kv.push(['Measured by', richPlain(r.method) || 'Not determined']);
  }
  kv.push(['Priority', PRIORITY_LABEL[r.priority]]);
  kv.push(['Status', REQUIREMENT_STATUS_LABEL[r.status]]);
  if (r.rationale.trim()) kv.push(['Rationale', richPlain(r.rationale)]);
  const src = [
    r.source.lines.length ? `lines ${linesText(r.source.lines)}` : '',
    r.source.rules.length ? `business rule ${r.source.rules.join(', ')}` : '',
    r.source.steps.length ? `process step ${r.source.steps.join(', ')}` : '',
    r.decisionIds.length ? `decision ${r.decisionIds.join(', ')}` : '',
  ].filter(Boolean);
  kv.push(['Source', src.length ? src.join('; ') : 'none — written in the workspace']);
  kv.push(['Provenance', provenanceWords(r)]);
  out.push({ k: 'kv', items: kv });
  if (r.acceptance.length) {
    out.push({ k: 'p', text: 'Acceptance criteria', strong: true });
    out.push({ k: 'ol', items: r.acceptance.map((c) => `Given ${c.given}, when ${c.when}, then ${c.then}.`) });
  }
  if (r.note.trim()) {
    out.push({ k: 'p', text: 'Note', strong: true });
    out.push({ k: 'rich', text: r.note });
  }
  return out;
}

/** The specification as blocks — the one structure every export spells. */
export function specBlocks(spec: RequirementsSpec, meta: SpecExportMeta): DocBlock[] {
  const counts = specCounts(spec);
  const functional = spec.requirements.filter((r) => r.kind === 'functional');
  const nonFunctional = spec.requirements.filter((r) => r.kind === 'non-functional');
  const blocks: DocBlock[] = [];

  blocks.push({
    k: 'titlepage',
    title: spec.title,
    subtitle: `What a new solution must do to replace the custom program ${spec.program}.`,
    rows: [
      ['Program', spec.program],
      ['Source', `${meta.fileName} · SHA-256 ${meta.sourceSha256.slice(0, 16)}…${meta.stale ? ' · written for an earlier source' : ''}`],
      ['Version', `${spec.version} · revision ${meta.revision}`],
      ['Author', `${meta.author} (self-declaration of the signed-in account)`],
      ['Date', meta.date],
      ['Status', SPEC_DOC_STATUS_LABEL[spec.docStatus]],
      ['Requirements', `${counts.functional} functional, ${counts.nonFunctional} non-functional (${counts.byPriority.must} Must, ${counts.byPriority.should} Should, ${counts.byPriority.could} Could)`],
      ['Open decisions', `${counts.openDecisions} of ${counts.decisions}`],
    ],
    note: SPEC_EXPORT_NOTE,
  });
  blocks.push({
    k: 'toc',
    items: [
      ...SECTIONS.flatMap((s) => {
        const items: Array<{ level: 1 | 2; text: string }> = [{ level: 1, text: s }];
        if (s.startsWith('4.')) {
          SPEC_NFR_CATEGORIES.filter((c) => nonFunctional.some((r) => r.category === c)).forEach((c, i) => items.push({ level: 2, text: `4.${i + 1} ${SPEC_NFR_CATEGORY_LABEL[c]}` }));
        }
        return items;
      }),
      { level: 1, text: 'Appendix: Revision history' },
    ],
  });
  blocks.push({ k: 'pagebreak' });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[0] });
  blocks.push({ k: 'h', level: 3, text: '1.1 Purpose' }, { k: 'rich', text: spec.purpose });
  blocks.push({ k: 'h', level: 3, text: '1.2 Scope' }, { k: 'rich', text: spec.scope });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[1] });
  blocks.push({ k: 'h', level: 3, text: '2.1 Context' }, { k: 'rich', text: spec.context });
  blocks.push({ k: 'h', level: 3, text: '2.2 Stakeholders' });
  blocks.push({ k: 'table', head: ['Role', 'Interest in this specification'], rows: spec.stakeholders.map((s) => [s.role, s.interest]) });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[2] });
  blocks.push({
    k: 'table',
    head: ['ID', 'Requirement', 'Priority', 'Status', 'Lines'],
    rows: functional.map((r) => [r.id, r.title, PRIORITY_LABEL[r.priority], REQUIREMENT_STATUS_LABEL[r.status], linesText(r.source.lines) || '—']),
  });
  functional.forEach((r, i) => blocks.push(...requirementBlocks(r, `3.${i + 1}`)));

  blocks.push({ k: 'h', level: 2, text: SECTIONS[3] });
  blocks.push({
    k: 'table',
    head: ['Category', 'Requirements', 'Target set', 'Waiting on a decision'],
    rows: SPEC_NFR_CATEGORIES.filter((c) => nonFunctional.some((r) => r.category === c)).map((c) => {
      const list = nonFunctional.filter((r) => r.category === c && r.status !== 'rejected');
      return [
        SPEC_NFR_CATEGORY_LABEL[c],
        String(list.length),
        String(list.filter((r) => r.target.trim() && !/^Not determined/.test(r.target)).length),
        String(list.filter((r) => r.status === 'clarify').length),
      ];
    }),
  });
  SPEC_NFR_CATEGORIES.filter((c) => nonFunctional.some((r) => r.category === c)).forEach((c, ci) => {
    blocks.push({ k: 'h', level: 3, text: `4.${ci + 1} ${SPEC_NFR_CATEGORY_LABEL[c]}` });
    nonFunctional.filter((r) => r.category === c).forEach((r, i) => blocks.push(...requirementBlocks(r, `4.${ci + 1}.${i + 1}`)));
  });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[4] });
  blocks.push({ k: 'p', text: 'The SAP objects and customer objects the current program reads, writes and calls, as the engine read them. The clean core level is SAP’s classification of an SAP object, an orientation, not evidence.' });
  blocks.push({
    k: 'table',
    head: ['Object', 'Kind', 'Use', 'Clean core level', 'Lines'],
    rows: spec.interfaces.map((x) => [
      x.name,
      x.kind.replace('-', ' '),
      x.use,
      x.level === 'custom' ? 'customer object' : x.level === 'not-graded' ? 'not graded' : x.level,
      linesText(x.lines),
    ]),
  });
  if (spec.interfacesNote.trim()) blocks.push({ k: 'rich', text: spec.interfacesNote });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[5] });
  blocks.push({ k: 'h', level: 3, text: '6.1 Constraints' }, { k: 'rich', text: spec.constraints });
  blocks.push({ k: 'h', level: 3, text: '6.2 Assumptions' }, { k: 'rich', text: spec.assumptions });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[6] });
  blocks.push({
    k: 'p',
    text: `${counts.openDecisions} of ${counts.decisions} decisions are open. Suggested answers are starting points, not read from the code; a model proposal is printed as one and was not taken over.`,
  });
  blocks.push({
    k: 'table',
    head: ['ID', 'Question', 'Who decides', 'Answer', 'Shapes', 'Lines'],
    rows: spec.decisions.map((d) => [
      d.id,
      d.question,
      DECISION_OWNER_LABEL[d.owner],
      `${answerText(d)}${d.proposal.trim() && decisionOpen(d) ? ` · Model proposal: ${richPlain(d.proposal)}` : ''}`,
      d.affects.join(', ') || '—',
      linesText(d.lines) || 'not in the code',
    ]),
  });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[7] });
  blocks.push({
    k: 'table',
    head: ['Requirement', 'Code lines', 'Business rules', 'Process steps', 'Decisions', 'Status'],
    rows: traceRows(spec).map((t) => [
      `${t.id} ${t.title}`,
      t.lines || '—',
      t.rules.join(', ') || '—',
      t.steps.join(', ') || '—',
      t.decisions.map((d) => `${d.id}${d.open ? ' (open)' : ''}`).join(', ') || '—',
      REQUIREMENT_STATUS_LABEL[t.status],
    ]),
  });

  blocks.push({ k: 'h', level: 2, text: SECTIONS[8] });
  blocks.push({ k: 'table', head: ['Term', 'Meaning'], rows: spec.glossary.map((g) => [g.term, g.meaning]) });

  blocks.push({ k: 'h', level: 2, text: 'Appendix: Revision history' });
  blocks.push({
    k: 'table',
    head: ['Revision', 'Date', 'By', 'Change'],
    rows: meta.history.length ? [...meta.history].reverse().map((h) => [String(h.revision), h.at.slice(0, 16).replace('T', ' '), h.by, h.change]) : [['—', meta.date, meta.author, 'Not saved yet']],
  });
  return blocks;
}

export const specMarkdown = (spec: RequirementsSpec, meta: SpecExportMeta): string => blocksMarkdown(specBlocks(spec, meta));
export const specDocxParts = (spec: RequirementsSpec, meta: SpecExportMeta): Record<string, string> => blocksDocxParts(specBlocks(spec, meta));
export const specDocx = (spec: RequirementsSpec, meta: SpecExportMeta): Promise<Blob> => blocksDocx(specBlocks(spec, meta));

/** The look of the Confluence page: the export tokens of `lib/export-style.ts`, nothing fetched. */
const SPEC_HTML_CSS = `
body{font-family:${EXPORT_FONT};color:${EXPORT_COLORS.ink};background:${EXPORT_COLORS.surface};max-width:880px;margin:32px auto;padding:0 24px;font-size:14px;line-height:1.55}
h1{font-size:22px;font-weight:800;letter-spacing:-0.02em}h2{font-size:18px;font-weight:700;margin-top:32px;border-bottom:1px solid ${EXPORT_COLORS.line};padding-bottom:4px}
h3{font-size:15px;font-weight:700;margin-top:24px}h4{font-size:14px;font-weight:700;margin-top:20px}
table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{font-size:13px}
code{font-family:${EXPORT_FONT_MONO};font-size:12px;background:${EXPORT_COLORS.surfaceMuted};padding:0 4px}
a{color:${EXPORT_COLORS.information}}.title-page{border:1px solid ${EXPORT_COLORS.line};padding:24px;margin-bottom:24px}
@media print{body{margin:0;max-width:none}tr,li{break-inside:avoid}a[href]::after{content:" (" attr(href) ")"}}
`;

/** The Confluence page: a standalone document, every value escaped by the block spellers. */
export function specConfluenceHtml(spec: RequirementsSpec, meta: SpecExportMeta): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(spec.title)}</title><style>${SPEC_HTML_CSS}</style></head><body>${blocksHtml(specBlocks(spec, meta))}</body></html>`;
}

export function specFileName(projectName: string, ext: 'md' | 'docx' | 'html'): string {
  const base = projectName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'project';
  return `${base}_requirements_specification.${ext}`;
}
