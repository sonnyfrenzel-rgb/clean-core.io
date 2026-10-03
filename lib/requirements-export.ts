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

function docxTable(head: string[], rows: string[][]): string {
  const cell = (t: string, header: boolean) =>
    `<w:tc><w:tcPr>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}</w:tcPr>${para(run(t, { bold: header }))}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${[
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h) => cell(h, true)).join('')}</w:tr>`,
    ...rows.map((r) => `<w:tr>${r.map((c) => cell(c, false)).join('')}</w:tr>`),
  ].join('')}</w:tbl>${para('')}`;
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
