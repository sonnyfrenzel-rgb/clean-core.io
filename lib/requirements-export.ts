import {
  NFR_CATEGORIES,
  NFR_CATEGORY_LABEL,
  NFR_OWNER_LABEL,
  NFR_SIGNAL_LABEL,
  type NfrCategory,
  type NfrCategoryStatus,
  type NfrQuestion,
  type NfrSet,
  type NonFunctionalRequirement,
} from '@/lib/non-functional-requirements';
import { parseRich, richHtml, richMarkdown, type RichInline } from '@/lib/rich-text';
import {
  BASIS_LABEL,
  PRIORITY_LABEL,
  anchorList,
  type FunctionalRequirement,
  type RequirementSet,
} from '@/lib/functional-requirements';

/**
 * The functional requirements as a requirement specification — Markdown for
 * "Copy as text" and the `.md` download, HTML for the clipboard's rich half,
 * and a `.docx` for Word. One document structure, four spellings, so a copy
 * never says less than the download:
 *
 *   1. title, source, digest and the provenance note;
 *   2. an overview table of every requirement (ID, priority, statement, step, lines);
 *   3. the requirements per process step, each with statement, rationale,
 *      priority and its reason, line anchors, SAP objects, acceptance criteria
 *      and provenance;
 *   4. what the business has to confirm;
 *   5. the traceability matrix, step → requirements → SAP objects.
 *
 * Where a model proposed the wording, the proposal is the statement and the
 * engine's sentence stands beneath it, marked; nothing in the export hides
 * which is which. Pure except for `requirementsDocx`, which loads JSZip.
 */

export interface RequirementsExportMeta {
  projectName: string;
  fileName: string;
  /** ISO date, `2026-10-03`. Handed in: this module reads no clock. */
  date: string;
  /** Requirement id → the model's proposed sentence, when one was accepted. */
  wording?: Readonly<Record<string, string>> | null;
}

export const PROVENANCE_NOTE =
  'Every requirement below is reconstructed by the Clean-Core.io engine from the ABAP source; the line anchors (L…) point at that source. Priorities follow from what the code does (a hard-coded rule or a change of data is Must). Nothing here is confirmed by the business. Where a sentence is marked as a model proposal, a language model reworded it and the server checked it against the anchors; the engine wording is kept beside it.';

const statementOf = (r: FunctionalRequirement, meta: RequirementsExportMeta) => meta.wording?.[r.id] ?? r.statement;
const isProposed = (r: FunctionalRequirement, meta: RequirementsExportMeta) => Boolean(meta.wording?.[r.id]);

function objectText(r: FunctionalRequirement): string {
  if (!r.objects.length) return 'none named at these lines';
  return r.objects
    .map((o) => `${o.name} (${o.custom ? 'customer object' : o.level ? `level ${o.level}` : 'level not graded'}, ${o.use})`)
    .join('; ');
}

function stepLabel(set: RequirementSet, id: string | null): string {
  if (!id) return 'Program-wide';
  const s = set.steps.find((x) => x.id === id);
  return s ? `${s.number}. ${s.label}` : 'Program-wide';
}

const mdCell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** One requirement as plain text — the per-requirement "Copy". */
export function requirementText(set: RequirementSet, r: FunctionalRequirement, meta: Pick<RequirementsExportMeta, 'wording'> = {}): string {
  const m = meta as RequirementsExportMeta;
  const lines = [
    `${r.id} · ${PRIORITY_LABEL[r.priority]} · ${stepLabel(set, r.stepId)}`,
    statementOf(r, m),
  ];
  if (isProposed(r, m)) lines.push(`Engine wording: ${r.statement}`);
  lines.push(
    `Rationale: ${r.rationale}`,
    `Priority: ${PRIORITY_LABEL[r.priority]} — ${r.priorityReason}`,
    `Lines: ${anchorList(r.anchors)}`,
    `SAP objects: ${objectText(r)}`,
    'Acceptance criteria:',
    ...r.acceptance.map((c, i) => `  ${i + 1}. Given ${c.given}, when ${c.when}, then ${c.then}.`),
    `Provenance: reconstructed from the code by the engine${isProposed(r, m) ? '; wording: model proposal, checked against the anchors' : ''}.`,
  );
  return lines.join('\n');
}

export function requirementsMarkdown(set: RequirementSet, meta: RequirementsExportMeta): string {
  const out: string[] = [];
  out.push(`# Functional requirements — ${meta.projectName}`, '');
  out.push(`Source: \`${meta.fileName}\` · SHA-256 \`${set.sourceSha256.slice(0, 16)}…\` · ${set.lineCount} lines · ${meta.date}`, '');
  out.push(`> ${PROVENANCE_NOTE}`, '');
  out.push(`${set.counts.total} requirements: ${set.counts.must} Must, ${set.counts.should} Should, ${set.counts.could} Could. ${set.counts.open} questions for the business.`, '');

  out.push('## 1. Overview', '');
  out.push('| ID | Priority | Requirement | Process step | Lines |', '|---|---|---|---|---|');
  for (const r of set.requirements) {
    out.push(`| ${r.id} | ${PRIORITY_LABEL[r.priority]} | ${mdCell(statementOf(r, meta))}${isProposed(r, meta) ? ' *(model proposal)*' : ''} | ${mdCell(stepLabel(set, r.stepId))} | ${anchorList(r.anchors)} |`);
  }
  out.push('');

  out.push('## 2. Requirements by process step', '');
  const groups: Array<{ title: string; items: FunctionalRequirement[] }> = [];
  const wide = set.requirements.filter((r) => !r.stepId);
  if (wide.length) groups.push({ title: 'Program-wide', items: wide });
  for (const s of set.steps) {
    const items = set.requirements.filter((r) => r.stepId === s.id);
    if (items.length) groups.push({ title: `${s.number}. ${s.label} (${s.routine}${s.anchor ? `, ${anchorList([s.anchor])}` : ''})`, items });
  }
  groups.forEach((g, gi) => {
    out.push(`### 2.${gi + 1} ${g.title}`, '');
    for (const r of g.items) {
      out.push(`#### ${r.id} — ${PRIORITY_LABEL[r.priority]} · ${BASIS_LABEL[r.basis.kind]}`, '');
      out.push(`**${statementOf(r, meta)}**`, '');
      if (isProposed(r, meta)) out.push(`Model proposal. Engine wording: ${r.statement}`, '');
      out.push(`- Rationale: ${r.rationale}`);
      out.push(`- Priority: ${PRIORITY_LABEL[r.priority]} — ${r.priorityReason}`);
      out.push(`- Lines: ${anchorList(r.anchors)}`);
      out.push(`- SAP objects: ${objectText(r)}`);
      out.push('- Acceptance criteria:');
      r.acceptance.forEach((c, i) => out.push(`  ${i + 1}. Given ${c.given}, when ${c.when}, then ${c.then}.`));
      out.push(`- Provenance: reconstructed from the code${isProposed(r, meta) ? '; wording proposed by a model' : ''}.`, '');
      out.push('```abap', ...r.anchors.slice(0, 3).map((a) => `* ${anchorList([a])}\n${a.quote}`), '```', '');
    }
  });

  out.push('## 3. To be confirmed by the business', '');
  out.push('The code cannot answer these. They are not requirements found in the code.', '');
  out.push('| ID | Question | Why the code cannot answer it | Lines |', '|---|---|---|---|');
  for (const o of set.open) out.push(`| ${o.id} | ${mdCell(o.question)} | ${mdCell(o.why)} | ${o.anchors.length ? anchorList(o.anchors) : 'not in the code'} |`);
  out.push('');

  out.push('## 4. Traceability', '');
  out.push('| Process step | Requirements | SAP objects |', '|---|---|---|');
  for (const s of set.steps) {
    if (!s.requirementIds.length && !s.objects.length) continue;
    out.push(`| ${mdCell(`${s.number}. ${s.label}`)} | ${s.requirementIds.join(', ') || '0'} | ${s.objects.map((o) => `${o.name}${o.custom ? '' : o.level ? ` (${o.level})` : ''}`).join(', ') || 'none'} |`);
  }
  out.push('');
  return out.join('\n');
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same document as HTML — the rich half of "Copy as text", so a paste into Word or Confluence keeps headings and tables. */
export function requirementsHtml(set: RequirementSet, meta: RequirementsExportMeta): string {
  const td = 'style="border:1px solid #cbd5e1;padding:4px 6px;vertical-align:top"';
  const th = 'style="border:1px solid #cbd5e1;padding:4px 6px;text-align:left;background:#f1f5f9"';
  const table = (head: string[], rows: string[][]) =>
    `<table style="border-collapse:collapse"><thead><tr>${head.map((h) => `<th ${th}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td ${td}>${esc(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  const parts: string[] = [];
  parts.push(`<h1>Functional requirements — ${esc(meta.projectName)}</h1>`);
  parts.push(`<p>Source: ${esc(meta.fileName)} · SHA-256 ${esc(set.sourceSha256.slice(0, 16))}… · ${set.lineCount} lines · ${esc(meta.date)}</p>`);
  parts.push(`<p><em>${esc(PROVENANCE_NOTE)}</em></p>`);
  parts.push('<h2>1. Overview</h2>');
  parts.push(table(['ID', 'Priority', 'Requirement', 'Process step', 'Lines'], set.requirements.map((r) => [
    r.id, PRIORITY_LABEL[r.priority], `${statementOf(r, meta)}${isProposed(r, meta) ? ' (model proposal)' : ''}`, stepLabel(set, r.stepId), anchorList(r.anchors),
  ])));
  parts.push('<h2>2. Requirements</h2>');
  for (const r of set.requirements) {
    parts.push(`<h3>${esc(r.id)} — ${PRIORITY_LABEL[r.priority]} · ${esc(stepLabel(set, r.stepId))}</h3>`);
    parts.push(`<p><strong>${esc(statementOf(r, meta))}</strong></p>`);
    if (isProposed(r, meta)) parts.push(`<p>Model proposal. Engine wording: ${esc(r.statement)}</p>`);
    parts.push(`<ul><li>Rationale: ${esc(r.rationale)}</li><li>Priority: ${PRIORITY_LABEL[r.priority]} — ${esc(r.priorityReason)}</li><li>Lines: ${esc(anchorList(r.anchors))}</li><li>SAP objects: ${esc(objectText(r))}</li></ul>`);
    parts.push(`<ol>${r.acceptance.map((c) => `<li>Given ${esc(c.given)}, when ${esc(c.when)}, then ${esc(c.then)}.</li>`).join('')}</ol>`);
  }
  parts.push('<h2>3. To be confirmed by the business</h2>');
  parts.push(table(['ID', 'Question', 'Why the code cannot answer it', 'Lines'], set.open.map((o) => [o.id, o.question, o.why, o.anchors.length ? anchorList(o.anchors) : 'not in the code'])));
  parts.push('<h2>4. Traceability</h2>');
  parts.push(table(['Process step', 'Requirements', 'SAP objects'], set.steps
    .filter((s) => s.requirementIds.length || s.objects.length)
    .map((s) => [`${s.number}. ${s.label}`, s.requirementIds.join(', ') || '0', s.objects.map((o) => `${o.name}${o.custom ? '' : o.level ? ` (${o.level})` : ''}`).join(', ') || 'none'])));
  return parts.join('\n');
}

/* ---------------------------------------------------------------- docx */

const x = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function run(text: string, opts: { bold?: boolean; mono?: boolean; italic?: boolean } = {}): string {
  const props = [
    opts.bold ? '<w:b/>' : '',
    opts.italic ? '<w:i/>' : '',
    opts.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/>' : '',
  ].join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
}

function para(content: string, style?: string): string {
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${content}</w:p>`;
}

function docxTable(head: string[], rows: string[][], muted: readonly number[] = []): string {
  const cell = (t: string, header: boolean, grey: boolean) =>
    `<w:tc><w:tcPr>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}</w:tcPr>${para(grey && !header ? mutedRun(t) : run(t, { bold: header }))}</w:tc>`;
  // A header row of empty cells (a key–value table) is left out.
  const headRow = head.some((h) => h.trim())
    ? [`<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, i) => cell(h, true, muted.includes(i))).join('')}</w:tr>`]
    : [];
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${[
    ...headRow,
    ...rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, false, muted.includes(i))).join('')}</w:tr>`),
  ].join('')}</w:tbl>${para('')}`;
}

/** A two-column table of facts — the title page — without a header row. */
function docxKeyTable(rows: Array<[string, string]>): string {
  const cell = (t: string, key: boolean) =>
    `<w:tc><w:tcPr>${key ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/><w:tcW w:w="1400" w:type="pct"/>' : ''}</w:tcPr>${para(run(t, { bold: key }))}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${rows
    .map(([k, v]) => `<w:tr>${cell(k, true)}${cell(v, false)}</w:tr>`)
    .join('')}</w:tbl>${para('')}`;
}

/** Small grey text — the source column of names and lines. */
function mutedRun(text: string): string {
  return `<w:r><w:rPr><w:color w:val="4B5563"/><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
}

function documentXml(set: RequirementSet, meta: RequirementsExportMeta): string {
  const b: string[] = [];
  b.push(para(run(`Functional requirements — ${meta.projectName}`), 'Title'));
  b.push(para(run(`Source: ${meta.fileName} · SHA-256 ${set.sourceSha256.slice(0, 16)}… · ${set.lineCount} lines · ${meta.date}`)));
  b.push(para(run(PROVENANCE_NOTE, { italic: true })));
  b.push(para(run('1. Overview'), 'Heading1'));
  b.push(docxTable(['ID', 'Priority', 'Requirement', 'Process step', 'Lines'], set.requirements.map((r) => [
    r.id, PRIORITY_LABEL[r.priority], `${statementOf(r, meta)}${isProposed(r, meta) ? ' (model proposal)' : ''}`, stepLabel(set, r.stepId), anchorList(r.anchors),
  ])));
  b.push(para(run('2. Requirements by process step'), 'Heading1'));
  const groups: Array<{ title: string; items: FunctionalRequirement[] }> = [];
  const wide = set.requirements.filter((r) => !r.stepId);
  if (wide.length) groups.push({ title: 'Program-wide', items: wide });
  for (const s of set.steps) {
    const items = set.requirements.filter((r) => r.stepId === s.id);
    if (items.length) groups.push({ title: `${s.number}. ${s.label} (${s.routine})`, items });
  }
  for (const g of groups) {
    b.push(para(run(g.title), 'Heading2'));
    for (const r of g.items) {
      b.push(para(run(`${r.id} — ${PRIORITY_LABEL[r.priority]} · ${BASIS_LABEL[r.basis.kind]}`), 'Heading3'));
      b.push(para(run(statementOf(r, meta), { bold: true })));
      if (isProposed(r, meta)) b.push(para(run(`Model proposal. Engine wording: ${r.statement}`, { italic: true })));
      b.push(para(run('Rationale: ', { bold: true }) + run(r.rationale)));
      b.push(para(run('Priority: ', { bold: true }) + run(`${PRIORITY_LABEL[r.priority]} — ${r.priorityReason}`)));
      b.push(para(run('Lines: ', { bold: true }) + run(anchorList(r.anchors), { mono: true })));
      b.push(para(run('SAP objects: ', { bold: true }) + run(objectText(r))));
      b.push(para(run('Acceptance criteria', { bold: true })));
      r.acceptance.forEach((c, i) => b.push(para(run(`${i + 1}. Given ${c.given}, when ${c.when}, then ${c.then}.`))));
      for (const a of r.anchors.slice(0, 3)) {
        b.push(para(run(`${anchorList([a])}  `, { mono: true }) + a.quote.split('\n').map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(l, { mono: true })).join('')));
      }
    }
  }
  b.push(para(run('3. To be confirmed by the business'), 'Heading1'));
  b.push(para(run('The code cannot answer these. They are not requirements found in the code.')));
  b.push(docxTable(['ID', 'Question', 'Why the code cannot answer it', 'Lines'], set.open.map((o) => [o.id, o.question, o.why, o.anchors.length ? anchorList(o.anchors) : 'not in the code'])));
  b.push(para(run('4. Traceability'), 'Heading1'));
  b.push(docxTable(['Process step', 'Requirements', 'SAP objects'], set.steps
    .filter((s) => s.requirementIds.length || s.objects.length)
    .map((s) => [`${s.number}. ${s.label}`, s.requirementIds.join(', ') || '0', s.objects.map((o) => `${o.name}${o.custom ? '' : o.level ? ` (${o.level})` : ''}`).join(', ') || 'none'])));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${b.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="table" w:styleId="Grid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

/** The file set of the `.docx`, as text — exported so a spec can read what Word will. */
export function requirementsDocxParts(set: RequirementSet, meta: RequirementsExportMeta): Record<string, string> {
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': STYLES,
    'word/document.xml': documentXml(set, meta),
  };
}

export async function requirementsDocx(set: RequirementSet, meta: RequirementsExportMeta): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [name, content] of Object.entries(requirementsDocxParts(set, meta))) zip.file(name, content);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export function requirementsFileName(projectName: string, ext: 'md' | 'docx'): string {
  const base = projectName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'project';
  return `${base}_functional_requirements.${ext}`;
}

/* ======================================================================
 * Non-functional requirements, and the one specification of both
 * (owner 03.10.2026: copyable for a requirement specification).
 *
 * One block list, three spellings — Markdown, HTML, WordprocessingML — so the
 * clipboard, the `.md` and the `.docx` cannot drift apart. The functional
 * exports above keep their own builders; the specification reads the same
 * functional set into blocks of its own.
 * ==================================================================== */

export type DocBlock =
  | { k: 'h'; level: 1 | 2 | 3 | 4 | 5; text: string }
  | { k: 'p'; text: string; strong?: boolean; em?: boolean }
  | { k: 'note'; text: string }
  /** `muted`: columns printed small and grey (a source column of names and lines). */
  | { k: 'table'; head: string[]; rows: string[][]; muted?: number[] }
  | { k: 'kv'; items: Array<[string, string]> }
  | { k: 'ol'; items: string[] }
  | { k: 'code'; items: Array<{ label: string; quote: string }> }
  /** Text in the restricted format of `lib/rich-text.ts` — parsed, never passed through. */
  | { k: 'rich'; text: string }
  /** The title page of a specification: title, one line under it, a table of facts. */
  | { k: 'titlepage'; title: string; subtitle: string; rows: Array<[string, string]>; note: string }
  /** A table of contents, written out (no field to update in Word). */
  | { k: 'toc'; items: Array<{ level: 1 | 2; text: string }> }
  | { k: 'ul'; items: string[] }
  /** A new page in Word and in print; nothing in Markdown. */
  | { k: 'pagebreak' };

export function blocksMarkdown(blocks: DocBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k === 'h') out.push(`${'#'.repeat(b.level)} ${b.text}`, '');
    else if (b.k === 'p') out.push(b.strong ? `**${b.text}**` : b.em ? `*${b.text}*` : b.text, '');
    else if (b.k === 'note') out.push(`> ${b.text}`, '');
    else if (b.k === 'table') {
      out.push(`| ${b.head.map(mdCell).join(' | ')} |`, `|${b.head.map(() => '---').join('|')}|`);
      for (const r of b.rows) out.push(`| ${r.map(mdCell).join(' | ')} |`);
      out.push('');
    } else if (b.k === 'kv') {
      for (const [k, v] of b.items) out.push(`- ${k}: ${v}`);
      out.push('');
    } else if (b.k === 'ol') {
      b.items.forEach((t, i) => out.push(`${i + 1}. ${t}`));
      out.push('');
    } else if (b.k === 'ul') {
      b.items.forEach((t) => out.push(`- ${t}`));
      out.push('');
    } else if (b.k === 'code' && b.items.length) {
      out.push('```abap', ...b.items.map((a) => `* ${a.label}\n${a.quote}`), '```', '');
    } else if (b.k === 'rich') {
      const md = richMarkdown(b.text);
      if (md) out.push(md, '');
    } else if (b.k === 'titlepage') {
      out.push(`# ${b.title}`, '', `*${b.subtitle}*`, '', '| | |', '|---|---|');
      for (const [k, v] of b.rows) out.push(`| ${mdCell(k)} | ${mdCell(v)} |`);
      out.push('', `> ${b.note}`, '');
    } else if (b.k === 'toc') {
      out.push('## Contents', '');
      for (const item of b.items) out.push(`${item.level === 2 ? '  ' : ''}- ${item.text}`);
      out.push('');
    } else if (b.k === 'pagebreak') {
      out.push('---', '');
    }
  }
  return out.join('\n');
}

export function blocksHtml(blocks: DocBlock[]): string {
  const td = 'style="border:1px solid #cbd5e1;padding:4px 6px;vertical-align:top"';
  const th = 'style="border:1px solid #cbd5e1;padding:4px 6px;text-align:left;background:#f1f5f9"';
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.k === 'h') parts.push(`<h${b.level}>${esc(b.text)}</h${b.level}>`);
    else if (b.k === 'p') parts.push(`<p>${b.strong ? `<strong>${esc(b.text)}</strong>` : b.em ? `<em>${esc(b.text)}</em>` : esc(b.text)}</p>`);
    else if (b.k === 'note') parts.push(`<p><em>${esc(b.text)}</em></p>`);
    else if (b.k === 'table') {
      parts.push(`<table style="border-collapse:collapse"><thead><tr>${b.head.map((h) => `<th ${th}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c) => `<td ${td}>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`);
    } else if (b.k === 'kv') parts.push(`<ul>${b.items.map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join('')}</ul>`);
    else if (b.k === 'ol') parts.push(`<ol>${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`);
    else if (b.k === 'ul') parts.push(`<ul>${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
    else if (b.k === 'code' && b.items.length) {
      parts.push(`<pre style="font-family:Consolas,monospace;font-size:12px;background:#f8fafc;padding:6px">${b.items.map((a) => `${esc(a.label)}  ${esc(a.quote)}`).join('\n')}</pre>`);
    } else if (b.k === 'rich') parts.push(richHtml(b.text));
    else if (b.k === 'titlepage') {
      parts.push(`<section class="title-page"><h1>${esc(b.title)}</h1><p><em>${esc(b.subtitle)}</em></p><table style="border-collapse:collapse"><tbody>${b.rows
        .map(([k, v]) => `<tr><th ${th}>${esc(k)}</th><td ${td}>${esc(v)}</td></tr>`)
        .join('')}</tbody></table><p><em>${esc(b.note)}</em></p></section>`);
    } else if (b.k === 'toc') {
      parts.push(`<nav aria-label="Contents"><h2>Contents</h2><ul>${b.items.map((i) => `<li${i.level === 2 ? ' style="margin-left:16px"' : ''}>${esc(i.text)}</li>`).join('')}</ul></nav>`);
    } else if (b.k === 'pagebreak') parts.push('<hr style="page-break-after:always;break-after:page;border:0">');
  }
  return parts.join('\n');
}

function inlineRuns(nodes: readonly RichInline[], opts: { bold?: boolean; italic?: boolean } = {}): string {
  return nodes
    .map((n) => {
      if (n.t === 'text') return n.v.split('\n').map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(l, opts)).join('');
      if (n.t === 'code') return run(n.v, { ...opts, mono: true });
      if (n.t === 'b') return inlineRuns(n.c, { ...opts, bold: true });
      if (n.t === 'i') return inlineRuns(n.c, { ...opts, italic: true });
      // Word gets the target in brackets: a hyperlink needs a relationship part, and the text is what matters.
      return inlineRuns(n.c, opts) + run(` (${n.href})`, opts);
    })
    .join('');
}

/** Text in the restricted format as WordprocessingML paragraphs — every text node escaped by `run`. */
export function richDocx(text: string): string {
  return parseRich(text)
    .map((blk) =>
      blk.t === 'p'
        ? para(inlineRuns(blk.c))
        : blk.items
            .map((item, i) => `<w:p><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr>${run(blk.t === 'ul' ? '• ' : `${i + 1}. `)}${inlineRuns(item)}</w:p>`)
            .join(''),
    )
    .join('');
}

const HEADING_STYLE: Record<1 | 2 | 3 | 4 | 5, string> = { 1: 'Title', 2: 'Heading1', 3: 'Heading2', 4: 'Heading3', 5: 'Heading4' };

function blocksDocument(blocks: DocBlock[]): string {
  const b: string[] = [];
  for (const block of blocks) {
    if (block.k === 'h') b.push(para(run(block.text), HEADING_STYLE[block.level]));
    else if (block.k === 'p') b.push(para(run(block.text, { bold: block.strong, italic: block.em })));
    else if (block.k === 'note') b.push(para(run(block.text, { italic: true })));
    else if (block.k === 'table') b.push(docxTable(block.head, block.rows, block.muted));
    else if (block.k === 'kv') for (const [k, v] of block.items) b.push(para(run(`${k}: `, { bold: true }) + run(v, { mono: k === 'Lines' })));
    else if (block.k === 'ol') block.items.forEach((t, i) => b.push(para(run(`${i + 1}. ${t}`))));
    else if (block.k === 'ul') block.items.forEach((t) => b.push(para(run(`•  ${t}`))));
    else if (block.k === 'pagebreak') b.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    else if (block.k === 'code') {
      for (const a of block.items) {
        b.push(para(run(`${a.label}  `, { mono: true }) + a.quote.split('\n').map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(l, { mono: true })).join('')));
      }
    } else if (block.k === 'rich') b.push(richDocx(block.text));
    else if (block.k === 'titlepage') {
      b.push(para(run(block.title), 'Title'));
      b.push(para(run(block.subtitle, { italic: true })));
      b.push(docxKeyTable(block.rows));
      b.push(para(run(block.note, { italic: true })));
    } else if (block.k === 'toc') {
      b.push(para(run('Contents'), 'Heading1'));
      for (const item of block.items) b.push(`<w:p><w:pPr><w:ind w:left="${item.level === 2 ? 440 : 0}"/></w:pPr>${run(item.text)}</w:p>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${b.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const STYLES_WITH_H4 = STYLES.replace(
  '</w:styles>',
  '<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style></w:styles>',
);

const PACKAGE_PARTS: Record<string, string> = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
};

export function blocksDocxParts(blocks: DocBlock[]): Record<string, string> {
  return { ...PACKAGE_PARTS, 'word/styles.xml': STYLES_WITH_H4, 'word/document.xml': blocksDocument(blocks) };
}

export async function blocksDocx(blocks: DocBlock[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [name, content] of Object.entries(blocksDocxParts(blocks))) zip.file(name, content);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------------------------------------------------- non-functional */

export const NFR_PROVENANCE_NOTE =
  'Every non-functional requirement below is read by the Clean-Core.io engine from the ABAP source; the line anchors (L…) point at that source, and only code an entry point reaches counts. The questions to be decided are what the code cannot answer — service levels, volumes, retention periods, roles, the cutover date. They are not requirements found in the code, and no value is assumed for them. Model proposals, where listed, are marked and were not checked against the code.';

/** The design model's text for one category, with what it names of this program. */
export interface NfrProposalExport {
  text: string;
  /** Tables, objects or question IDs of this program the text names; empty = generic. */
  references: string[];
}

export interface NfrExportMeta {
  projectName: string;
  fileName: string;
  /** ISO date, handed in: this module reads no clock. */
  date: string;
  proposals?: Partial<Record<NfrCategory, NfrProposalExport>> | null;
}

export const NFR_STATUS_WORD: Readonly<Record<NfrCategoryStatus, string>> = {
  grounded: 'Grounded in the code',
  decision: 'Needs a decision',
  none: 'Nothing found in the code',
};

function nfrAcceptance(r: NonFunctionalRequirement): string[] {
  return r.acceptance.map((c) => `Given ${c.given}, when ${c.when}, then ${c.then}.`);
}

const ownerPhrase = (qn: NfrQuestion) => (qn.owner === 'business' ? 'the business' : 'IT operations');

/** One non-functional requirement as plain text — the per-row "Copy". */
export function nfrText(r: NonFunctionalRequirement): string {
  return [
    `${r.id} · ${PRIORITY_LABEL[r.priority]} · ${NFR_CATEGORY_LABEL[r.category]}`,
    r.statement,
    `Rationale: ${r.rationale}`,
    `Priority: ${PRIORITY_LABEL[r.priority]} — ${r.priorityReason}`,
    `Lines: ${anchorList(r.anchors)}`,
    `Read from: ${NFR_SIGNAL_LABEL[r.signal]}${r.objects.length ? ` (${r.objects.join(', ')})` : ''}`,
    ...(r.acceptance.length ? ['Acceptance criteria:', ...nfrAcceptance(r).map((t, i) => `  ${i + 1}. ${t}`)] : ['Acceptance criteria: none the code makes testable.']),
    'Provenance: reconstructed from the code by the engine.',
  ].join('\n');
}

/** One question as plain text — the per-question "Copy". */
export function nfrQuestionText(qn: NfrQuestion): string {
  return [
    `${qn.id} · To be decided by ${ownerPhrase(qn)} · ${NFR_CATEGORY_LABEL[qn.category]}`,
    qn.question,
    `Evidence: ${qn.evidence}`,
    `Lines: ${qn.anchors.length ? anchorList(qn.anchors) : 'not in the code'}`,
    'Provenance: not determined — the code cannot answer it.',
  ].join('\n');
}

function nfrRequirementBlocks(set: NfrSet, level: 3 | 4, prefix: string): DocBlock[] {
  const out: DocBlock[] = [];
  NFR_CATEGORIES.forEach((category, i) => {
    const summary = set.categories.find((c) => c.category === category)!;
    const items = set.requirements.filter((r) => r.category === category);
    out.push({ k: 'h', level, text: `${prefix}${i + 1} ${NFR_CATEGORY_LABEL[category]}` });
    if (!items.length) {
      out.push({
        k: 'p',
        em: true,
        text: summary.questions
          ? `Nothing found in the code. ${summary.questions} question${summary.questions === 1 ? '' : 's'} to be decided: ${set.questions.filter((x) => x.category === category).map((x) => x.id).join(', ')}.`
          : 'Nothing found in the code.',
      });
    }
    for (const r of items) {
      out.push({ k: 'h', level: (level + 1) as 4 | 5, text: `${r.id} — ${PRIORITY_LABEL[r.priority]} · ${NFR_SIGNAL_LABEL[r.signal]}` });
      out.push({ k: 'p', text: r.statement, strong: true });
      out.push({
        k: 'kv',
        items: [
          ['Rationale', r.rationale],
          ['Priority', `${PRIORITY_LABEL[r.priority]} — ${r.priorityReason}`],
          ['Lines', anchorList(r.anchors)],
          ['Objects', r.objects.length ? r.objects.join(', ') : 'none named'],
          ['Provenance', 'reconstructed from the code'],
        ],
      });
      if (r.acceptance.length) {
        out.push({ k: 'p', text: 'Acceptance criteria', strong: true });
        out.push({ k: 'ol', items: nfrAcceptance(r) });
      }
      out.push({ k: 'code', items: r.anchors.slice(0, 3).map((a) => ({ label: anchorList([a]), quote: a.quote })) });
    }
    if (summary.unreached.length) {
      out.push({
        k: 'p',
        em: true,
        text: `Not counted — in routines no entry point reaches: ${summary.unreached.slice(0, 6).map((u) => `${u.what} in ${u.routine} (L${u.line})`).join('; ')}${summary.unreached.length > 6 ? `; ${summary.unreached.length - 6} more` : ''}.`,
      });
    }
  });
  return out;
}

function nfrOverviewTable(set: NfrSet): DocBlock {
  return {
    k: 'table',
    head: ['Category', 'Grounded in the code', 'To be decided', 'Status'],
    rows: set.categories.map((c) => [c.label, String(c.grounded), String(c.questions), NFR_STATUS_WORD[c.status]]),
  };
}

function nfrListTable(set: NfrSet): DocBlock {
  return {
    k: 'table',
    head: ['ID', 'Category', 'Priority', 'Requirement', 'Lines'],
    rows: set.requirements.map((r) => [r.id, NFR_CATEGORY_LABEL[r.category], PRIORITY_LABEL[r.priority], r.statement, anchorList(r.anchors)]),
  };
}

function questionRows(questions: readonly NfrQuestion[]): string[][] {
  return questions.map((qn) => [qn.id, NFR_CATEGORY_LABEL[qn.category], NFR_OWNER_LABEL[qn.owner], qn.question, qn.evidence, qn.anchors.length ? anchorList(qn.anchors) : 'not in the code']);
}

function proposalBlocks(meta: NfrExportMeta, level: 2 | 3, title: string): DocBlock[] {
  const entries: Array<[NfrCategory, NfrProposalExport]> = [];
  for (const c of NFR_CATEGORIES) {
    const p = meta.proposals?.[c];
    if (p && p.text.trim()) entries.push([c, p]);
  }
  if (!entries.length) return [];
  const specific = entries.filter(([, p]) => p.references.length);
  const generic = entries.length - specific.length;
  const out: DocBlock[] = [{ k: 'h', level, text: title }];
  out.push({ k: 'p', em: true, text: 'Written by the design model with the solution design. Proposals, not requirements: not checked against the code.' });
  if (specific.length) out.push({ k: 'table', head: ['Category', 'Model proposal', 'Names'], rows: specific.map(([c, p]) => [NFR_CATEGORY_LABEL[c], p.text.trim(), p.references.join(', ')]) });
  if (generic) out.push({ k: 'p', text: `${generic} further proposal${generic === 1 ? '' : 's'} named nothing from this program and ${generic === 1 ? 'is' : 'are'} left out.` });
  return out;
}

function nfrBlocks(set: NfrSet, meta: NfrExportMeta): DocBlock[] {
  return [
    { k: 'h', level: 1, text: `Non-functional requirements — ${meta.projectName}` },
    { k: 'p', text: `Source: ${meta.fileName} · SHA-256 ${set.sourceSha256.slice(0, 16)}… · ${set.lineCount} lines · ${meta.date}` },
    { k: 'note', text: NFR_PROVENANCE_NOTE },
    {
      k: 'p',
      text: `${set.counts.total} requirements grounded in the code (${set.counts.must} Must, ${set.counts.should} Should, ${set.counts.could} Could) in ${set.counts.categoriesGrounded} of ${NFR_CATEGORIES.length} categories. ${set.counts.questions} questions to be decided by the business or IT operations.`,
    },
    { k: 'h', level: 2, text: '1. Overview by category' },
    nfrOverviewTable(set),
    { k: 'h', level: 2, text: '2. Requirements' },
    nfrListTable(set),
    ...nfrRequirementBlocks(set, 3, '2.'),
    { k: 'h', level: 2, text: '3. To be decided by the business / IT operations' },
    { k: 'p', text: 'The code cannot answer these. They are questions, not requirements found in the code.' },
    { k: 'table', head: ['ID', 'Category', 'Owner', 'Question', 'Evidence', 'Lines'], rows: questionRows(set.questions) },
    ...proposalBlocks(meta, 2, '4. Model proposals'),
  ];
}

export const nfrMarkdown = (set: NfrSet, meta: NfrExportMeta): string => blocksMarkdown(nfrBlocks(set, meta));
export const nfrHtml = (set: NfrSet, meta: NfrExportMeta): string => blocksHtml(nfrBlocks(set, meta));
export const nfrDocxParts = (set: NfrSet, meta: NfrExportMeta): Record<string, string> => blocksDocxParts(nfrBlocks(set, meta));
export const nfrDocx = (set: NfrSet, meta: NfrExportMeta): Promise<Blob> => blocksDocx(nfrBlocks(set, meta));

/* ---------------------------------------------- the one specification */

/**
 * Functional open topics the non-functional questions ask more precisely —
 * left out of the specification so the reader is not asked twice.
 */
export const FR_TOPICS_COVERED_BY_NFR: ReadonlySet<string> = new Set(['authorization', 'retention', 'volume']);

function frBlocks(set: RequirementSet, meta: RequirementsExportMeta): DocBlock[] {
  const out: DocBlock[] = [];
  out.push({ k: 'h', level: 3, text: 'A.1 Overview' });
  out.push({
    k: 'table',
    head: ['ID', 'Priority', 'Requirement', 'Process step', 'Lines'],
    rows: set.requirements.map((r) => [r.id, PRIORITY_LABEL[r.priority], `${statementOf(r, meta)}${isProposed(r, meta) ? ' (model proposal)' : ''}`, stepLabel(set, r.stepId), anchorList(r.anchors)]),
  });
  out.push({ k: 'h', level: 3, text: 'A.2 Requirements by process step' });
  const groups: Array<{ title: string; items: FunctionalRequirement[] }> = [];
  const wide = set.requirements.filter((r) => !r.stepId);
  if (wide.length) groups.push({ title: 'Program-wide', items: wide });
  for (const s of set.steps) {
    const items = set.requirements.filter((r) => r.stepId === s.id);
    if (items.length) groups.push({ title: `${s.number}. ${s.label} (${s.routine}${s.anchor ? `, ${anchorList([s.anchor])}` : ''})`, items });
  }
  groups.forEach((g, gi) => {
    out.push({ k: 'h', level: 4, text: `A.2.${gi + 1} ${g.title}` });
    for (const r of g.items) {
      out.push({ k: 'h', level: 5, text: `${r.id} — ${PRIORITY_LABEL[r.priority]} · ${BASIS_LABEL[r.basis.kind]}` });
      out.push({ k: 'p', text: statementOf(r, meta), strong: true });
      if (isProposed(r, meta)) out.push({ k: 'p', em: true, text: `Model proposal. Engine wording: ${r.statement}` });
      out.push({
        k: 'kv',
        items: [
          ['Rationale', r.rationale],
          ['Priority', `${PRIORITY_LABEL[r.priority]} — ${r.priorityReason}`],
          ['Lines', anchorList(r.anchors)],
          ['SAP objects', objectText(r)],
          ['Provenance', `reconstructed from the code${isProposed(r, meta) ? '; wording proposed by a model' : ''}`],
        ],
      });
      out.push({ k: 'p', text: 'Acceptance criteria', strong: true });
      out.push({ k: 'ol', items: r.acceptance.map((c) => `Given ${c.given}, when ${c.when}, then ${c.then}.`) });
      out.push({ k: 'code', items: r.anchors.slice(0, 3).map((a) => ({ label: anchorList([a]), quote: a.quote })) });
    }
  });
  out.push({ k: 'h', level: 3, text: 'A.3 Traceability' });
  out.push({
    k: 'table',
    head: ['Process step', 'Requirements', 'SAP objects'],
    rows: set.steps
      .filter((s) => s.requirementIds.length || s.objects.length)
      .map((s) => [`${s.number}. ${s.label}`, s.requirementIds.join(', ') || '0', s.objects.map((o) => `${o.name}${o.custom ? '' : o.level ? ` (${o.level})` : ''}`).join(', ') || 'none']),
  });
  return out;
}

export type SpecificationMeta = RequirementsExportMeta & Pick<NfrExportMeta, 'proposals'>;

function specificationBlocks(fr: RequirementSet, nfr: NfrSet, meta: SpecificationMeta): DocBlock[] {
  const frOpen = fr.open.filter((o) => !FR_TOPICS_COVERED_BY_NFR.has(o.topic));
  return [
    { k: 'h', level: 1, text: `Requirements specification — ${meta.projectName}` },
    { k: 'p', text: `Source: ${meta.fileName} · SHA-256 ${fr.sourceSha256.slice(0, 16)}… · ${fr.lineCount} lines · ${meta.date}` },
    { k: 'note', text: PROVENANCE_NOTE },
    { k: 'note', text: NFR_PROVENANCE_NOTE },
    { k: 'p', text: `${fr.counts.total} functional and ${nfr.counts.total} non-functional requirements read from the code; ${frOpen.length + nfr.counts.questions} questions to be decided.` },
    { k: 'h', level: 2, text: 'A. Functional requirements' },
    ...frBlocks(fr, meta),
    { k: 'h', level: 2, text: 'B. Non-functional requirements' },
    { k: 'h', level: 3, text: 'B.1 Overview by category' },
    nfrOverviewTable(nfr),
    { k: 'h', level: 3, text: 'B.2 Requirements' },
    nfrListTable(nfr),
    ...nfrRequirementBlocks(nfr, 4, 'B.2.'),
    { k: 'h', level: 2, text: 'C. To be decided by the business / IT operations' },
    { k: 'p', text: 'The code cannot answer these. They are questions, not requirements found in the code.' },
    {
      k: 'table',
      head: ['ID', 'Area', 'Owner', 'Question', 'Evidence', 'Lines'],
      rows: [
        ...frOpen.map((o) => [o.id, 'Functional', 'Business', o.question, o.why, o.anchors.length ? anchorList(o.anchors) : 'not in the code']),
        ...questionRows(nfr.questions),
      ],
    },
    ...proposalBlocks(meta, 2, 'D. Model proposals for the non-functional requirements'),
  ];
}

export const specificationMarkdown = (fr: RequirementSet, nfr: NfrSet, meta: SpecificationMeta): string => blocksMarkdown(specificationBlocks(fr, nfr, meta));
export const specificationHtml = (fr: RequirementSet, nfr: NfrSet, meta: SpecificationMeta): string => blocksHtml(specificationBlocks(fr, nfr, meta));
export const specificationDocxParts = (fr: RequirementSet, nfr: NfrSet, meta: SpecificationMeta): Record<string, string> => blocksDocxParts(specificationBlocks(fr, nfr, meta));
export const specificationDocx = (fr: RequirementSet, nfr: NfrSet, meta: SpecificationMeta): Promise<Blob> => blocksDocx(specificationBlocks(fr, nfr, meta));

export function exportFileName(projectName: string, kind: 'non-functional' | 'specification', ext: 'md' | 'docx'): string {
  const base = projectName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'project';
  return `${base}_${kind === 'non-functional' ? 'non_functional_requirements' : 'requirements_specification'}.${ext}`;
}
