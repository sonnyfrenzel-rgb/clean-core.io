/**
 * The Confluence page of the documentation stage — the process description
 * (roadmap 3.0.5, ADR-077), as HTML a reviewer opens. The page of a legacy
 * blueprint went with its rendering in 3.0.7 ("Documentation lean"): a
 * blueprint stored before 3.0.5 is downloaded as it was stored.
 *
 * Moved here out of `app/(app)/project/[projectId]/documentation/page.tsx` in
 * block D, step D.16a, unchanged: the page is a screen and is held to the
 * design tokens (`tests/design-source-guard.spec.ts`), while these are
 * documents that leave the application. Since D.28 they carry the stylesheet
 * all stage exports share, `lib/export-style.ts`, for a reader who opens them
 * outside it. The page builds nothing here itself; it asks for the file and
 * saves it.
 *
 * Every value in both documents was written by a model or read from the
 * customer's own source, and every one goes through `escapeHtml`
 * (`tests/export-escaping-guard.spec.ts` reads this file for that).
 */
import { escapeHtml } from '@/lib/utils';
import { EXPORT_COLORS, EXPORT_FONT_MONO, EXPORT_STYLE_ELEMENT } from '@/lib/export-style';
import { NOT_DETERMINED_LABEL } from '@/lib/process-documentation';
import {
  EMPTY_SECTION,
  AI_GENERATED_LABEL,
  linesLabel,
  sectionName,
  sectionTitle,
  stepRef,
  type PdText,
  type ProcessDocument,
  type ProcessDocumentSection,
} from '@/lib/process-document';
import {
  COMPLETE_TABLES,
  REQUIREMENT_QUESTIONS,
  REQUIREMENT_QUESTION_HEAD,
  SOURCE_COLUMN,
  STEP_SUMMARY_HEAD,
  sharedQuestionLead,
  stepSummaryRows,
  appendixLead,
  figureText,
  longTables,
  moreRowsLine,
  questionLinkText,
  documentOutline,
  gateSentence,
  groupTitle,
  requirementQuestionRows,
  sourceText,
  stepDetailLines,
  stepName,
  wordingRows,
  BUSINESS_TARGET_ANCHOR,
  type PdSectionKey,
  type PdTable,
} from '@/lib/process-document-outline';
import { processOverviewSvg } from '@/lib/process-overview-svg';
import { BUSINESS_PAGE, businessPageLineText, type BusinessPage } from '@/lib/documentation-business-page';
import { SOP_BASIS, layerFacts, sopBasisText, type SopStatement } from '@/lib/sop-provenance';
import { readCapabilityFacts } from '@/lib/documentation-capabilities';
import type { OpenQuestions } from '@/lib/open-questions';
import { raciGapWord, raciLetterWord, sopLevelBusinessLine, sopLevelLegacyLine } from '@/lib/messages/documentation';
import { RACI_EDITED_IN_FILE, type RaciEditRecord } from '@/lib/raci-edit';
import { aiMarkingComment, aiMarkingMetaTag, aiMarkingStatement, type AiAuthorship } from '@/lib/ai-marking';
import { wt } from '@/lib/workspace-messages';
import {
  RACI_LETTERS,
  isBusinessLevelLayer,
  lettersOf,
  raciMatrix,
  sopSteps,
  type GlanceAnchor,
  type SopStep,
  type SopJudgement,
  type ProcessStepRef,
} from '@/lib/business-summary';

/** The stored forms are model JSON, read exactly as the page reads them. */
type ModelJson = any;

/**
 * What a stale export says about itself (owner decision 30.09.2026). A
 * documentation the workflow contract (`lib/workflow-steps.ts`)
 * calls `stale` stays exportable — it is not blocked — but the file does not
 * pass itself off as current: it opens with this note, and the page's export
 * button carries the same warning ("Stale — regenerate first") beside it, so
 * the reader is told before the download what the file then says itself.
 */
export const STALE_EXPORT_NOTE =
  'Stale — this documentation was written for an earlier source or an earlier step. Regenerate it before relying on it.';

/** Options the Confluence page takes. */
export interface ConfluenceExportOptions {
  /** True when the documentation phase is `stale` in `workflowSteps(project)`. */
  stale?: boolean;
  /** The project's open questions (ADR-081) for the open questions section — the stage passes the list it shows. */
  openQuestions?: OpenQuestions | null;
  /**
   * The steps the business layer is keyed to, named as the stage names them.
   * Absent for the engine page: read from the document itself.
   */
  processSteps?: ProcessStepRef[];
  /** The project's name, for the title of the engine page. */
  projectName?: string;
  /**
   * The owner's RACI, when one is saved for the proposal on record (owner
   * request 10.10.2026). The layer passed in already carries it; this only
   * says whose it is — "Edited by the owner of the project", never an account.
   */
  raciEdit?: RaciEditRecord | null;
  /**
   * Roadmap 3.0.17 (AI Act Art. 50(2)): who wrote the model text the page carries — the business layer (`sop`) and
   * the glance's proposal worded by the analysis model (`analysis`) — read by `lib/ai-authorship.ts`. A page that
   * carries model text gets the statement as its header comment and as `<meta name="ai-generated">`; a page with
   * the engine's reading alone gets neither.
   */
  ai?: { sop: AiAuthorship | null; analysis: AiAuthorship | null; appVersion: string };
}

/**
 * Where the controls of a process stand (roadmap 3.0.7, "Documentation lean"):
 * the systems section, read from the code — named by its key, never by its
 * number (ADR-084). The model no longer proposes control objectives,
 * verification methods or KPI targets — inventions 3.0.5 had already taken out
 * of the description.
 */
export const CONTROLS_FROM_THE_CODE =
  `Controls are read from the code: “${sectionName('systems')}” in the process description. The model proposes no controls and no KPI targets.`;

/** The note a stale export opens with; empty for a current one. Our own markup, no model value. */
function staleNoteHtml(options: ConfluenceExportOptions | undefined): string {
  if (!options?.stale) return '';
  return `<p class="card accent-warning" data-stale-export=""><span class="tag tone-warning">Stale</span> ${escapeHtml(STALE_EXPORT_NOTE.replace(/^Stale — /, ''))}</p>`;
}

/** The file name the page is saved under. */
export function confluenceFileName(projectName: string | undefined): string {
  const fileName = (projectName || 'Project').replace(/\s+/g, '_');
  return `${fileName}_Confluence.html`;
}

/**
 * The few classes of the process description's page on top of the shared
 * stylesheet: the muted source column, the cover, the figure tiles and the
 * appendix on a page of its own. Only our class names and the export colours.
 */
const PROCESS_DOC_CSS = `<style>
    .lead { color: ${EXPORT_COLORS.inkMuted}; margin: -4px 0 12px; }
    td.src { color: ${EXPORT_COLORS.inkMuted}; font-size: 12px; font-family: ${EXPORT_FONT_MONO}; white-space: normal; }
    table.cover td { border: 0; padding: 2px 16px 2px 0; }
    table.cover td:first-child { color: ${EXPORT_COLORS.inkMuted}; font-size: 12px; font-weight: 600; width: 140px; }
    .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 12px 0 16px; }
    .figure { border: 1px solid ${EXPORT_COLORS.line}; border-radius: 12px; padding: 10px 12px; }
    .figure .value { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
    .figure .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: ${EXPORT_COLORS.inkMuted}; margin: 0; }
    .appendix { break-before: page; }
  </style>`;

/**
 * The Confluence page of the process description (owner 03.10.2026, tightened
 * 04.10.2026: "far too long … much smarter-looking, to the point") — the same
 * outline the stage renders (`lib/process-document-outline.ts`): the title
 * (project — program) with "Process description" under it, a cover with
 * program, source, version, date and status; *At a glance* with what it does,
 * who starts it, six key figures, the reader questions as links to their
 * sections, the rules and risks to know, what it covers and leaves out and the
 * main path; then the sections (ADR-084), each a one-line lead and a compact table whose
 * last column carries the program's names and lines; then the business layer
 * when a model wrote one, marked as a proposal; and the appendix last, on a
 * page of its own in print. Nothing is folded: a pasted page has no disclosure
 * to open, so what the stage folds stands in the appendix.
 *
 * Every value is the engine's reading of the customer's source or a model's
 * text, and every one goes through `escapeHtml`; the section strings are
 * assembled from escaped values only (`tests/export-escaping-guard.spec.ts`).
 */
export function buildEngineConfluenceHtml(
  document: ProcessDocument,
  parsedBusinessDoc: ModelJson | null,
  options?: ConfluenceExportOptions,
): Blob {
  const esc = escapeHtml;
  const staleSection = staleNoteHtml(options);
  const o = documentOutline(document, { projectName: options?.projectName, openQuestions: options?.openQuestions ?? null });
  const lines = (anchors: PdText['anchors']) => esc(linesLabel(anchors));
  const para = (t: PdText) => `<p>${esc(t.text)}${t.anchors.length ? ` <small>${lines(t.anchors)}</small>` : ''}</p>`;
  const item = (t: PdText) => `<li>${esc(t.text)}${t.anchors.length ? ` <small>${lines(t.anchors)}</small>` : ''}</li>`;
  const proposal = (text: string, anchors: PdText['anchors'], engineWord: string) =>
    `<p class="card accent-information"><span class="tag tone-information">${esc(AI_GENERATED_LABEL)}</span> ${esc(text)}${anchors.length ? ` <small>${lines(anchors)}</small>` : ''}<br><small>${esc(engineWord)}</small></p>`;
  const table = (head: string[], rows: string[][], muted: number[] = []) =>
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((cell, i) => `<td${muted.includes(i) ? ' class="src"' : ''}>${esc(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  // Owner review 10.10.2026: a question on several rows of a table is said once, above it.
  const tableOf = (t: PdTable | null, whole = false) => (t
    ? `${(t.shared ?? []).map((q) => `<p class="meta" data-doc-shared-question="${esc(q.action)}">${esc(sharedQuestionLead(q, t.rows.length) + ':')} <a href="#oq-${esc(q.action)}">${esc(q.title)}</a></p>`).join('')}<table><thead><tr>${[...t.head, SOURCE_COLUMN].map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${(whole ? t.rows : t.rows.slice(0, t.first))
      .map((r) => `<tr${r.id ? ` id="${esc(r.id)}"` : ''}>${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}<td class="src">${esc(sourceText({ tech: r.tech, anchors: r.anchors }))}${r.question ? ` <a href="#oq-${esc(r.question.action)}">${esc(`→ ${questionLinkText(r.question)}`)}</a>` : ''}</td></tr>`)
      .join('')}</tbody></table>${t.note ? `<p class="meta">${esc(t.note)}</p>` : ''}${!whole && t.rows.length > t.first ? `<p class="meta">${esc(moreRowsLine(t))}</p>` : ''}`
    : '');
  const empty = (key: keyof typeof EMPTY_SECTION) => `<p class="muted">${esc(EMPTY_SECTION[key])}</p>`;
  // Every section carries its key as the anchor (`#pd-<key>`), so the "Go to" line links to it (ADR-084).
  const h2 = (key: ProcessDocumentSection) => `<h2 id="pd-${esc(key)}" data-doc-section="${esc(key)}">${esc(sectionTitle(key))}</h2>`;
  const lead = (key: PdSectionKey) => `<p class="lead">${esc(o.leads[key])}</p>`;
  const g = o.glance;

  const docCSS = PROCESS_DOC_CSS;

  const coverSection = `<div class="header" data-doc-cover="">
    <h1>${esc(o.title)}</h1>
    <p class="lead" data-doc-subtitle="">${esc(o.subtitle)}</p>
    <table class="cover"><tbody>${o.cover.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    <p class="muted"><span class="tag tone-information">${esc('Reconstructed')}</span> ${esc(o.note)}</p>
  </div>`;

  // Owner 11.10.2026 (external review F-07, §6.1): the business page first — engine facts only,
  // the questions as links into the page. Every value is escaped; the anchors are our own keys.
  const bp = o.business;
  const bpItem = (l: BusinessPage['does'][number]) => `<li data-business-page-line="${esc(l.basis)}">${esc(businessPageLineText(l))}</li>`;
  const businessPageSection = `<h2 id="pd-in-short" data-business-page="">${esc(BUSINESS_PAGE.title)}</h2>
    <div class="summary-box">
      <h3>${esc(BUSINESS_PAGE.does)}</h3><ul>${bp.does.map(bpItem).join('')}</ul>
      <h3>${esc(BUSINESS_PAGE.doesNot)}</h3><ul>${bp.doesNot.map(bpItem).join('')}</ul>
      <h3>${esc(BUSINESS_PAGE.limits)}</h3><ul>${bp.limits.map(bpItem).join('')}</ul>
      <h3>${esc(BUSINESS_PAGE.owner)}</h3><ul>${[bp.owner, bp.approval].map(bpItem).join('')}</ul>
      <h3>${esc(BUSINESS_PAGE.questions)}</h3>
      <ul data-business-questions="">${bp.questions.map((q) => `<li><a href="#${esc(BUSINESS_TARGET_ANCHOR[q.target])}">${esc(q.question)}</a> — ${esc(q.answer)}</li>`).join('')}</ul>
    </div>`;

  // ADR-084: purpose and scope stand in the glance — what it covers and what it leaves out, under the risks.
  const scopeSection = table(['Scope', 'What', SOURCE_COLUMN], [
    ...g.covers.map((s) => [wt('doc.covers'), s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
    ...g.leaves.map((s) => [wt('doc.leaves'), s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
  ], [2]);
  const goToSection = `<p data-doc-goto=""><strong>${esc(wt('doc.goTo'))}:</strong> ${g.goTo
    .map((q) => `<a href="#pd-${esc(q.anchor ?? q.section)}">${esc(q.label)}</a>`)
    .join(' · ')}</p>`;

  const glanceSection = `<h2 data-glance-export="">${esc('At a glance')}</h2>
    <div class="summary-box">
      ${g.summary.map(para).join('')}
      ${g.proposal ? proposal(g.proposal.text, g.proposal.anchors, 'Worded by the analysis model from the same source; the engine reading is the evidence.') : ''}
      <p><strong>${esc('Started by:')}</strong> ${esc(g.trigger.text)}</p>
    </div>
    <div class="figures">${g.figures.map((f) => `<div class="figure"><p class="value">${esc(figureText(f))}</p><p class="label">${esc(f.label)}</p></div>`).join('')}</div>
    ${goToSection}
    ${g.points.length ? `<h3>${esc('Rules and risks to know')}</h3><ul>${g.points.map((pt) => `<li>${pt.ref ? `<strong>${esc(pt.ref)}</strong> ` : ''}${esc(pt.text)} <small>${esc([pt.detail, linesLabel(pt.anchors)].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>` : ''}
    ${scopeSection}
    <p class="meta">${esc(`Main path: ${g.path}`)}</p>`;

  // How a run starts opens the process section (ADR-084): the start, the selection screen, the input it does not use.
  const startItem = (t: PdText) => `<li>${esc(t.text)} <small>${esc(sourceText({ tech: t.detail ?? null, anchors: t.anchors }))}</small></li>`;
  const runStartsSection = `<h3 id="pd-run-starts">${esc(wt('doc.runStarts'))}</h3>
    <ul>${document.trigger.start.map(startItem).join('')}</ul>
    ${o.tables.inputs ? tableOf(o.tables.inputs) : ''}
    ${o.inputUse.length ? `<p><strong>${esc(wt('doc.inputUnused'))}</strong></p><ul>${o.inputUse.map(startItem).join('')}</ul>` : ''}`;

  const overviewSection = `${h2('overview')}${lead('overview')}
    ${runStartsSection}
    <div class="card">${processOverviewSvg(document.overview.path, document.program)}</div>
    <h3 id="pd-steps">${esc(o.tables.steps.caption)}</h3>
    ${o.whoActsLine ? `<p class="meta" data-doc-who-acts-none="">${esc(o.whoActsLine)}</p>` : ''}
    ${tableOf(o.tables.steps)}`;

  // Roadmap 3.0.7: each classification that only sets one field, as one business rule task with its table.
  const decisionTablesSection = o.decisionTables
    .map((d) => `<h3 data-doc-decision-table="${esc(d.id)}">${esc(d.caption)}</h3>${tableOf(d, true)}`)
    .join('');
  const rulesSection = `${h2('rules')}${lead('rules')}${o.tables.rules ? tableOf(o.tables.rules) : o.decisionTables.length ? '' : empty('rules')}${decisionTablesSection}`;
  const exceptionsSection = `${h2('exceptions')}${lead('exceptions')}${o.tables.exceptions ? tableOf(o.tables.exceptions) : empty('exceptions')}`;
  const outputsSection = `${h2('outputs')}${lead('outputs')}${o.tables.outputs ? tableOf(o.tables.outputs) : empty('outputs')}`;
  // ADR-084: the data it reads, the integrations and the controls are one section, each part with its own anchor.
  const systemsSection = `${h2('systems')}${lead('systems')}
    <h3 id="pd-data">${esc(wt('doc.dataReads'))}</h3><p class="lead">${esc(o.partLeads.data)}</p>${o.tables.data ? tableOf(o.tables.data) : ''}
    ${o.tables.derived ? `<h4>${esc(o.tables.derived.caption)}</h4>${tableOf(o.tables.derived)}` : ''}
    <h3 id="pd-integrations">${esc(wt('doc.integrationsTitle'))}</h3><p class="lead">${esc(o.partLeads.integrations)}</p>${o.tables.integrations ? tableOf(o.tables.integrations) : ''}
    <h3 id="pd-controls">${esc(wt('doc.controlsTitle'))}</h3><p class="lead">${esc(o.partLeads.controls)}</p>${o.tables.controls ? tableOf(o.tables.controls) : ''}`;
  // The open questions are the project's one list (ADR-081), with the end
  // state of every group; the engine's questions about the requirements stand
  // in appendix A.4.
  const questionsSection = `${h2('questions')}${lead('questions')}${tableOf(o.questions.table, true)}${o.questions.list?.limits
    ? `<p class="meta">${esc(o.questions.list.limits)}</p>`
    : ''}${o.questions.requirementsLine ? `<p>${esc(o.questions.requirementsLine)}</p>` : ''}`;
  // The business layer the stage shows: written by a model from the process,
  // marked as a proposal, escaped like the rest. A field the model left empty
  // reads "Not determined", never a default (ADR-068). The matrix is the
  // normalised one (`lib/business-summary.ts`, `raciMatrix`): a small set of
  // roles, the rest listed beside it, a step without an Accountable named.
  const nd = NOT_DETERMINED_LABEL;
  // Owner review 10.10.2026: only the steps of the process — a row the model
  // wrote for a step the code does not have is not printed (`sopSteps`).
  const steps = options?.processSteps ?? processStepsFromDocument(document);
  // Owner 11.10.2026 (external review F-06): every SOP sentence with its basis, judged against what the program can do.
  const judgement = { facts: readCapabilityFacts(document.facts) ?? layerFacts(parsedBusinessDoc) };
  const sop = parsedBusinessDoc ? sopSteps(parsedBusinessDoc, steps, judgement) : [];
  const edited = options?.raciEdit ?? null;
  const editedNote = edited ? RACI_EDITED_IN_FILE + ' · ' + edited.editedAt.slice(0, 10) + '.' : '';
  // Owner 16.10.2026: the SOP and the RACI stand on the business level, each step's technical steps beside it.
  const business = isBusinessLevelLayer(parsedBusinessDoc);
  const levelLine = business
    ? sopLevelBusinessLine(sop.length, sop.reduce((n, st) => n + st.technical.length, 0))
    : sopLevelLegacyLine(sop.length);
  const businessSection = parsedBusinessDoc
    ? `<h2 data-business-layer="">${esc('Business layer — AI-generated')}</h2>
    <p><em>${esc('Written by a language model from the process description above. Every sentence says its basis: Reconstructed only where it cites a line of its step and nothing in it contradicts the code; roles, approvals, escalations and anything the program does not do are a proposal, not in the program.')}</em></p>
    <p class="meta" data-sop-level="${esc(business ? 'business' : 'technical')}">${esc(levelLine)}</p>
    ${edited ? `<p data-raci-edited=""><span class="tag tone-information">${esc('Confirmed')}</span> ${esc("The RACI below is the owner's, not the model's. " + editedNote)}</p>` : ''}
    ${glanceHtml(parsedBusinessDoc, steps, edited ? editedNote : null, judgement)}
    <h3>${esc('RACI assignment')}</h3>
    <table><thead><tr><th>Step</th><th>Responsible (R)</th><th>Accountable (A)</th><th>Consulted (C)</th><th>Informed (I)</th></tr></thead><tbody>${sop.filter((st) => st.hasRaci)
      .map((st) => `<tr><td>${esc(sopStepLabel(st))}</td><td>${esc(st.roles.R.join(', ') || nd)}</td><td>${esc(st.roles.A.join(', ') || nd)}</td><td>${esc(st.roles.C.join(', ') || nd)}</td><td>${esc(st.roles.I.join(', ') || nd)}</td></tr>`)
      .join('')}</tbody></table>
    <h3>${esc('Standard operating procedure')}</h3>
    ${sopTableHtml(sop, business)}
    <p class="meta">${esc(CONTROLS_FROM_THE_CODE)}</p>`
    : '';

  const a = document.appendix;
  const stepDetailsSection = document.overview.path.map((entry) => entry.kind === 'gate'
    ? `<p class="note">${esc(gateSentence(entry))}</p>`
    : `<h4 data-doc-step="">${esc(`${stepRef(entry)}. ${stepName(entry)}`)}</h4><ul>${stepDetailLines(entry, o.whoActs).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('');
  const long = longTables(o);
  const completeSection = long.length
    ? `<h3>${esc(COMPLETE_TABLES)}</h3>${long.map((t) => `<h4>${esc(`${t.caption} (${t.rows.length})`)}</h4>${tableOf(t, true)}`).join('')}`
    : '';
  const appendixSection = `<div class="appendix">${h2('appendix')}
    <p><em>${esc(appendixLead(a))}</em></p>
    <h3>${esc('A.1 Step details')}</h3>
    ${table(STEP_SUMMARY_HEAD, stepSummaryRows(document, o.whoActs), [3])}
    ${stepDetailsSection}
    ${completeSection}
    <h3>${esc('A.3 Wording as read from the code')}</h3>
    ${table(['Section', 'Item', 'As read from the code', 'Lines'], wordingRows(document), [3])}
    ${document.questions.length ? `<h3>${esc(REQUIREMENT_QUESTIONS)}</h3>${table(REQUIREMENT_QUESTION_HEAD, requirementQuestionRows(document), [4])}` : ''}
    <h3>${esc('A.5 Process elements')}</h3>
    <table><thead><tr><th>Element</th><th>Name</th><th>What it does</th><th>Lines</th></tr></thead><tbody>${a.elements
      .map((e) => `<tr data-trace-element=""><td><code>${esc(e.id)}</code><br>${esc(e.kind)}</td><td>${esc(e.name)}</td><td>${e.does ? esc(e.does) : e.sameAs ? `<small>${esc(`As at ${e.sameAs}`)}</small>` : ''}</td><td>${esc(e.evidence)}</td></tr>`)
      .join('')}</tbody></table>
    <h3>${esc('A.6 Statements by routine')}</h3>
    ${a.groups.map((g) => `<h4>${esc(groupTitle(g))}</h4><ul>${g.statements.map((s) => `<li data-trace-statement="">${esc(s.text)} <small>${lines(s.anchors)}</small></li>`).join('')}</ul>`).join('')}
    ${a.luw.length ? `<h3>${esc('A.7 Saving changes')}</h3><ul>${a.luw.map(item).join('')}</ul>` : ''}
    ${a.lanes.length ? `<h3>${esc('A.8 Lanes the code proves')}</h3><ul>${a.lanes.map(item).join('')}</ul>` : ''}
  </div>`;

  // Roadmap 3.0.17 (AI Act Art. 50(2)): the statement of every model that wrote text on this page — the business
  // layer's, and the analysis model's for the glance proposal — as the header comment and as metadata.
  const aiVersion = options?.ai?.appVersion ?? '';
  const aiStatements = [
    parsedBusinessDoc && options?.ai?.sop ? aiMarkingStatement(options.ai.sop, aiVersion) : null,
    g.proposal && options?.ai?.analysis ? aiMarkingStatement(options.ai.analysis, aiVersion) : null,
  ].filter((s): s is string => s !== null);
  // Both are assembled by `lib/ai-marking.ts`, which writes the statement on one line with no comment terminator and
  // escapes it for the attribute (fed hostile names in tests/ai-marking.spec.ts).
  // One comment line and one meta element per statement: a page with the text of two models names both.
  const aiCommentSection = aiStatements.map((s) => aiMarkingComment('markup', s) + '\n').join('');
  const aiMetaSection = aiStatements.map(aiMarkingMetaTag).join('');

  // The stylesheet every stage export shares (`lib/export-style.ts`), and this page's own few classes.
  const exportCSS = EXPORT_STYLE_ELEMENT;
  const engineHtml = `${aiCommentSection}<html><head><meta charset="utf-8">${aiMetaSection}<title>${esc(o.title)}</title>${exportCSS}${docCSS}</head><body>
    ${staleSection}
    ${coverSection}
    ${businessPageSection}
    ${glanceSection}
    ${overviewSection}
    ${rulesSection}
    ${exceptionsSection}
    ${outputsSection}
    ${systemsSection}
    ${questionsSection}
    ${businessSection}
    ${appendixSection}
  </body></html>`;
  return new Blob([engineHtml], { type: 'text/html;charset=utf-8' });
}

/** "4a. Check vendor" — a SOP step as a file names it: its reference on the main path, else its number, and its name. */
export function sopStepLabel(step: SopStep): string {
  return `${step.ref ?? String(step.number)}. ${step.step?.name ?? step.stepId}`;
}

/**
 * The SOP as a file prints it: one row per step with its sentences and its
 * exception, and — for a layer on the business level (owner 16.10.2026) —
 * the technical steps of each step in a column of their own, since a pasted
 * page has no fold to open. Every value escaped.
 */
export function sopTableHtml(sop: readonly SopStep[], business: boolean): string {
  const esc = escapeHtml;
  const head = ['Step', 'Description', 'Business exception', ...(business ? ['Technical steps'] : [])];
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sop
    .map((st) => `<tr><td>${esc(sopStepLabel(st))}</td><td>${sopStatementsHtml(st.statements)}</td><td>${sopStatementsHtml(st.exceptionStatement ? [st.exceptionStatement] : [])}</td>${business ? `<td data-sop-technical="${esc(String(st.technical.length))}">${technicalStepsHtml(st)}</td>` : ''}</tr>`)
    .join('')}</tbody></table>`;
}

/** The technical steps of a business step, as a list with their kinds and lines. Every value escaped. */
export function technicalStepsHtml(step: SopStep): string {
  if (!step.technical.length) return '';
  const esc = escapeHtml;
  return `<ul>${step.technical
    .map((t) => `<li data-sop-technical-step="">${esc(t.name)}${t.kind ? ` <small>${esc(t.kind)}</small>` : ''}${t.anchor ? ` <small>${esc(anchorWords(t.anchor))}</small>` : ''}</li>`)
    .join('')}</ul>`;
}

/** The steps the business layer is keyed to, read from the document's appendix when the page names none. */
function processStepsFromDocument(document: ProcessDocument): ProcessStepRef[] {
  return document.appendix.elements.map((e) => ({
    id: e.id,
    name: e.name,
    technicalName: e.name,
    anchor: e.anchor,
    provenance: 'reconstructed' as const,
  }));
}

/* ------------------------------------------------------------ the glance */

const anchorWords = (a: GlanceAnchor) => (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}-${a.lineEnd}`);

/**
 * The business layer as tables (owner 03.10.2026): the SOP steps in process
 * order and the RACI matrix with its gaps. It stands **in addition to** the
 * full RACI table below it, which keeps every row as stored. Every value is
 * escaped; the tables are marked as AI-generated.
 */
/** The SOP sentences of one cell, each with its basis; *Not determined* when there are none. Every value escaped. */
export function sopStatementsHtml(list: readonly SopStatement[]): string {
  if (!list.length) return escapeHtml(NOT_DETERMINED_LABEL);
  return `<ul>${list.map(statementHtml).join('')}</ul>`;
}

/** One SOP sentence with its basis as a tag — the tag reads as the stage's chip does. Escaped, our own classes. */
function statementHtml(st: SopStatement): string {
  const esc = escapeHtml;
  const tone = st.basis === 'reconstructed' || st.basis === 'confirmed' ? 'tone-information' : 'tone-warning';
  return `<li data-sop-statement="${esc(st.basis)}">${esc(st.text)} <span class="tag ${tone}">${esc(sopBasisText(st))}</span>${st.reason && st.basis === 'not-in-program' ? ` <small>${esc(st.reason)}</small>` : ''}</li>`;
}

function glanceHtml(
  parsedBusinessDoc: ModelJson | null,
  processSteps: ProcessStepRef[],
  editedNote: string | null = null,
  judgement: SopJudgement = {},
): string {
  const esc = escapeHtml;
  const parts: string[] = [];
  if (parsedBusinessDoc) {
    const steps = sopSteps(parsedBusinessDoc, processSteps, judgement);
    const stepRowsHtml = steps.map((s) => `<tr data-glance-sop-step="${esc(s.stepId)}"><td>${esc(s.ref ?? String(s.number))}</td><td>${esc(s.step?.name ?? s.stepId)}<br><small><code>${esc(s.stepId)}</code></small></td><td>${esc(s.statements[0]?.text ?? s.outcome ?? NOT_DETERMINED_LABEL)}</td><td>${esc(s.roles.R.join(', ') || NOT_DETERMINED_LABEL)}</td><td>${esc(s.step?.anchor ? anchorWords(s.step.anchor) : NOT_DETERMINED_LABEL)}</td><td>${esc(s.statements[0] ? SOP_BASIS[s.statements[0].basis].label : NOT_DETERMINED_LABEL)}</td></tr>`).join('');
    parts.push(`<h3>SOP steps — AI-generated</h3><table><thead><tr><th>#</th><th>Step</th><th>Outcome</th><th>Responsible</th><th>Lines</th><th>Provenance</th></tr></thead><tbody>${stepRowsHtml}</tbody></table>`);
    const matrix = raciMatrix(steps);
    if (matrix.steps.length > 0) {
      // At most six role columns (`MAX_RACI_COLUMNS`); a long name is shortened
      // in the head and named in full in the key; further roles are listed
      // under the matrix with their letters — the full assignment follows in
      // the RACI table further down.
      const head = matrix.roles.map((r) => `<th>${esc(r.short)}${r.overloaded ? esc(` (Responsible on ${r.counts.R} of ${matrix.steps.length})`) : ''}</th>`).join('');
      const body = matrix.steps.map((s) => `<tr data-glance-raci-step="${esc(s.stepId)}"><td>${esc(s.ref ?? String(s.number))} ${esc(s.step?.name ?? s.stepId)}</td>${matrix.roles.map((r) => `<td class="mono strong">${esc(lettersOf(s, r.name).join(' '))}</td>`).join('')}<td>${esc([...s.gaps.map(raciGapWord), ...(s.hiddenAccountable.length ? [`A: ${s.hiddenAccountable.join(', ')}`] : [])].join(', '))}</td></tr>`).join('');
      const key = matrix.roles.filter((r) => r.short !== r.name).map((r) => `${r.short} = ${r.name}`).join(' · ');
      const more = matrix.moreRoles.map((r) => `<li>${esc(r.name)}: ${esc(matrix.steps.map((st) => ({ st, l: lettersOf(st, r.name) })).filter((x) => x.l.length).map((x) => `${x.l.join('')} on ${x.st.ref ?? x.st.number}`).join(', '))}</li>`).join('');
      parts.push(`<h3>RACI matrix — ${editedNote ? 'Edited by the owner' : 'AI-generated'}</h3><p><small>${editedNote ? `${esc(editedNote)} ` : ''}${esc(RACI_LETTERS.map((l) => `${l} ${raciLetterWord(l)}`).join(' · '))}${key ? esc(` · ${key}`) : ''}</small></p><table><thead><tr><th>Step</th>${head}<th>Check</th></tr></thead><tbody>${body}</tbody></table>${more ? `<p><small>${esc(`${matrix.moreRoles.length} more roles the proposal names:`)}</small></p><ul>${more}</ul>` : ''}`);
    }
  }
  return parts.join('\n');
}
