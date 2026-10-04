/**
 * The Confluence pages of the documentation stage — the legacy blueprint and
 * the engine document (roadmap 3.0.5), as HTML a reviewer opens.
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
  MODEL_PROPOSAL_LABEL,
  linesLabel,
  sectionTitle,
  type PdText,
  type ProcessDocument,
  type ProcessDocumentSection,
} from '@/lib/process-document';
import {
  COMPLETE_TABLES,
  SOURCE_COLUMN,
  appendixLead,
  longTables,
  moreRowsLine,
  documentOutline,
  gateSentence,
  groupTitle,
  questionSourceRows,
  questionTable,
  sourceText,
  stepDetailLines,
  stepName,
  wordingRows,
  type PdSectionKey,
  type PdTable,
} from '@/lib/process-document-outline';
import { processOverviewSvg } from '@/lib/process-overview-svg';
import { provenance, type ProvenanceValue } from '@/lib/provenance';
import { raciGapWord, raciLetterWord } from '@/lib/messages/documentation';
import {
  RACI_LETTERS,
  lettersOf,
  raciMatrix,
  sopSteps,
  type GlanceAnchor,
  type GlanceEvidence,
  type ProcessStepRef,
} from '@/lib/business-summary';

/** The stored forms are model JSON, read exactly as the page reads them. */
type ModelJson = any;

/**
 * What a stale export says about itself (owner decision 30.09.2026, QA
 * c8ae21453b3b). A documentation the workflow contract (`lib/workflow-steps.ts`)
 * calls `stale` stays exportable — it is not blocked — but the file does not
 * pass itself off as current: it opens with this note, and the page's export
 * button carries the same warning ("Stale — regenerate first") beside it, so
 * the reader is told before the download what the file then says itself.
 */
export const STALE_EXPORT_NOTE =
  'Stale — this documentation was written for an earlier source or an earlier step. Regenerate it before relying on it.';

/** Options both Confluence pages take. */
export interface ConfluenceExportOptions {
  /** True when the documentation phase is `stale` in `workflowSteps(project)`. */
  stale?: boolean;
  /**
   * The glance the stage shows above the map (owner 03.10.2026), already in
   * words — the callouts need the handbook, the coverage sweep and the levels,
   * which only the page holds. Absent: the file has no glance table, and loses
   * nothing else.
   */
  glance?: {
    headline: string;
    callouts: Array<{ title: string; provenance: ProvenanceValue; evidence: GlanceEvidence[]; more: number }>;
  };
  /**
   * The steps the business layer is keyed to, named as the stage names them.
   * Absent for the engine page: read from the document itself.
   */
  processSteps?: ProcessStepRef[];
  /** The project's name, for the title of the engine page. */
  projectName?: string;
}

/** The note a stale export opens with; empty for a current one. Our own markup, no model value. */
function staleNoteHtml(options: ConfluenceExportOptions | undefined): string {
  if (!options?.stale) return '';
  return `<p class="card accent-warning" data-stale-export=""><span class="tag tone-warning">Stale</span> ${escapeHtml(STALE_EXPORT_NOTE.replace(/^Stale — /, ''))}</p>`;
}

/**
 * The legacy blueprint's Confluence page.
 *
 * The export is an HTML document a reviewer opens, and every value in it
 * was written by the model from the customer's own ABAP — a comment in the
 * source is enough to steer it into returning markup (QA review of
 * 33471220d6e9, 06f7c0c56a6c). Nothing generated reaches the document
 * unescaped; the markup around it is ours.
 */
export function buildLegacyConfluenceHtml(
  parsedDoc: ModelJson,
  parsedBusinessDoc: ModelJson | null,
  options?: ConfluenceExportOptions,
): Blob {
  const esc = escapeHtml;
  const staleSection = staleNoteHtml(options);
  const glanceSection = glanceHtml(options, parsedBusinessDoc, options?.processSteps ?? []);

  // The stylesheet every stage export shares (`lib/export-style.ts`).
  const confluenceCSS = EXPORT_STYLE_ELEMENT;

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        ${confluenceCSS}
      </head>
      <body>
        ${staleSection}
        <div class="header">
          <h1>${esc(parsedDoc.l1_domain?.name || 'Process documentation')}</h1>
          <div class="meta">Enterprise Integration Specifications & Workflow Definition</div>
        </div>
        ${glanceSection}
        
        <div class="card-grid">
          <div class="card">
            <div class="card-title">Level 1: Business Domain Blueprint</div>
            <p><strong>Strategic Goal:</strong> ${esc(parsedDoc.l1_domain?.strategicGoal || 'N/A')}</p>
            <span class="tag tone-neutral">Owner: ${esc(parsedDoc.l1_domain?.owner || 'N/A')}</span>
          </div>
          
          <div class="card">
            <div class="card-title">Level 2: Process Area Group</div>
            <p><strong>Process Area:</strong> ${esc(parsedDoc.l2_group?.processArea || 'N/A')}</p>
            <p><strong>KPI Framework:</strong></p>
            <div>
              ${(parsedDoc.l2_group?.kpis || []).map((kpi: string) => `<span class="tag tone-neutral">${esc(kpi)}</span>`).join(' ')}
            </div>
          </div>
        </div>
        
        <h2>Level 4: Architectural Task Specifications</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 10%">ID</th>
              <th style="width: 25%">Task Name</th>
              <th style="width: 35%">Functional Description</th>
              <th style="width: 15%">Complexity</th>
              <th style="width: 15%">Technology Stack</th>
            </tr>
          </thead>
          <tbody>
            ${(parsedDoc.l4_tasks || []).map((task: any) => `
              <tr>
                <td class="mono strong">${esc(task.stepId)}</td>
                <td><strong>${esc(task.name) || `Task ${esc(task.stepId)}`}</strong></td>
                 <td>
                   <p>${esc(task.description)}</p>
                   <p class="meta">
                     <strong>Inputs:</strong> ${esc((task.inputs || []).join(', ') || 'N/A')} | 
                     <strong>Outputs:</strong> ${esc((task.outputs || []).join(', ') || 'N/A')}
                   </p>
                 </td>
                <td>
                  <span class="${
                    task.complexity === 'High' ? 'tag tone-error' :
                    task.complexity === 'Medium' ? 'tag tone-warning' :
                    'tag tone-neutral'
                  }">${esc(task.complexity || 'Low')}</span>
                </td>
                <td>
                  ${(task.systems || []).map((sys: string) => `<span class="tag tone-neutral">${esc(sys)}</span>`).join(' ')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${parsedBusinessDoc ? `
          <h2>Level 5: Standard Operating Procedures (SOP) & RACI Assignment</h2>
          
          <h3>RACI Assignment Matrix</h3>
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Responsible (R)</th>
                <th>Accountable (A)</th>
                <th>Consulted (C)</th>
                <th>Informed (I)</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedBusinessDoc.raci_matrix || []).map((raci: any) => `
                <tr>
                  <td class="mono strong">${esc(raci.stepId)}</td>
                  <td>${esc(raci.r || 'N/A')}</td>
                  <td>${esc(raci.a || 'N/A')}</td>
                  <td>${esc(raci.c || 'N/A')}</td>
                  <td>${esc(raci.i || 'N/A')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h3>SOP Operational Playbook</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 15%">Task ID</th>
                <th style="width: 50%">Operational SOP Description</th>
                <th style="width: 20%">Business Exception Fallback</th>
                <th style="width: 15%">KPI Success Metric</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedBusinessDoc.sop_details || []).map((sop: any) => `
                <tr>
                  <td class="mono strong">${esc(sop.stepId)}</td>
                  <td>${esc(sop.narrative || 'N/A')}</td>
                  <td>${esc(sop.businessException || 'N/A')}</td>
                  <td class="strong">${esc(sop.kpiTarget || 'N/A')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h3>Internal Audit Compliance & Risk Controls</h3>
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Control Objective</th>
                <th>Mitigation Action</th>
                <th>Assertion Verification Method</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedBusinessDoc.audit_controls || []).map((ctrl: any) => `
                <tr>
                  <td class="mono strong">${esc(ctrl.stepId)}</td>
                  <td><strong>${esc(ctrl.controlObjective || 'N/A')}</strong></td>
                  <td>${esc(ctrl.mitigationAction || 'N/A')}</td>
                  <td class="mono">${esc(ctrl.assertionMethod || 'N/A')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
      </body>
    </html>
  `;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}

/** The file name both pages are saved under. */
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
 * outline the stage renders (`lib/process-document-outline.ts`): a cover with
 * program, source, version, date and status; *At a glance* with what it does,
 * who starts it, six key figures, the rules and risks to know and the main
 * path; then sections 1 to 9, each a one-line lead and a compact table whose
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
  const o = documentOutline(document, { projectName: options?.projectName });
  const lines = (anchors: PdText['anchors']) => esc(linesLabel(anchors));
  const para = (t: PdText) => `<p>${esc(t.text)}${t.anchors.length ? ` <small>${lines(t.anchors)}</small>` : ''}</p>`;
  const item = (t: PdText) => `<li>${esc(t.text)}${t.anchors.length ? ` <small>${lines(t.anchors)}</small>` : ''}</li>`;
  const proposal = (text: string, anchors: PdText['anchors'], engineWord: string) =>
    `<p class="card accent-information"><span class="tag tone-information">${esc(MODEL_PROPOSAL_LABEL)}</span> ${esc(text)}${anchors.length ? ` <small>${lines(anchors)}</small>` : ''}<br><small>${esc(engineWord)}</small></p>`;
  const table = (head: string[], rows: string[][], muted: number[] = []) =>
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((cell, i) => `<td${muted.includes(i) ? ' class="src"' : ''}>${esc(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  const tableOf = (t: PdTable | null, whole = false) => (t
    ? `${table([...t.head, SOURCE_COLUMN], (whole ? t.rows : t.rows.slice(0, t.first)).map((r) => [...r.cells, sourceText(r)]), [t.head.length])}${!whole && t.rows.length > t.first ? `<p class="meta">${esc(moreRowsLine(t))}</p>` : ''}`
    : '');
  const empty = (key: keyof typeof EMPTY_SECTION) => `<p class="muted">${esc(EMPTY_SECTION[key])}</p>`;
  const h2 = (key: ProcessDocumentSection) => `<h2 data-doc-section="${esc(key)}">${esc(sectionTitle(key))}</h2>`;
  const lead = (key: PdSectionKey) => `<p class="lead">${esc(o.leads[key])}</p>`;
  const p = document.purpose;

  const docCSS = PROCESS_DOC_CSS;

  const coverSection = `<div class="header" data-doc-cover="">
    <h1>${esc(o.title)}</h1>
    <table class="cover"><tbody>${o.cover.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    <p class="muted"><span class="tag tone-information">${esc('Reconstructed')}</span> ${esc(o.note)}</p>
  </div>`;

  const glanceSection = `<h2 data-glance-export="">${esc('At a glance')}</h2>
    <div class="summary-box">
      ${o.glance.summary.map(para).join('')}
      <p><strong>${esc('Started by:')}</strong> ${esc(o.glance.trigger.text)}</p>
    </div>
    <div class="figures">${o.glance.figures.map((f) => `<div class="figure"><p class="value">${esc(String(f.value))}</p><p class="label">${esc(f.label)}</p></div>`).join('')}</div>
    ${o.glance.points.length ? `<h3>${esc('Rules and risks to know')}</h3><ul>${o.glance.points.map((pt) => `<li>${pt.ref ? `<strong>${esc(pt.ref)}</strong> ` : ''}${esc(pt.text)} <small>${esc([pt.detail, linesLabel(pt.anchors)].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>` : ''}
    <p class="meta">${esc(`Main path: ${o.glance.path}`)}</p>`;

  const purposeSection = `${h2('purpose')}${lead('purpose')}
    ${p.proposal ? proposal(p.proposal.text, p.proposal.anchors, 'Worded by the analysis model from the same source; the engine reading below is the evidence.') : ''}
    <p>${esc(p.users.text)} <small>${esc(sourceText({ tech: p.users.detail ?? null, anchors: p.users.anchors }))}</small></p>
    ${table(['Scope', 'What', SOURCE_COLUMN], [
      ...p.inScope.map((s) => ['In scope', s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
      ...p.outOfScope.map((s) => ['Outside this code', s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
    ], [2])}`;

  const triggerSection = `${h2('trigger')}${lead('trigger')}
    ${o.tables.inputs ? `<h3>${esc(o.tables.inputs.caption)}</h3>${tableOf(o.tables.inputs)}` : ''}
    ${o.tables.data ? `<h3>${esc(o.tables.data.caption)}</h3>${tableOf(o.tables.data)}` : ''}`;

  const overviewSection = `${h2('overview')}${lead('overview')}
    <div class="card">${processOverviewSvg(document.overview.path, document.program)}</div>
    ${tableOf(o.tables.steps)}`;

  const rulesSection = `${h2('rules')}${lead('rules')}${o.tables.rules ? tableOf(o.tables.rules) : empty('rules')}`;
  const exceptionsSection = `${h2('exceptions')}${lead('exceptions')}${o.tables.exceptions ? tableOf(o.tables.exceptions) : empty('exceptions')}`;
  const outputsSection = `${h2('outputs')}${lead('outputs')}${o.tables.outputs ? tableOf(o.tables.outputs) : empty('outputs')}`;
  const integrationsSection = `${h2('integrations')}${lead('integrations')}${o.tables.integrations ? tableOf(o.tables.integrations) : empty('integrations')}`;
  const controlsSection = `${h2('controls')}${lead('controls')}${o.tables.controls ? tableOf(o.tables.controls) : empty('controls')}`;
  const questionsSection = `${h2('questions')}${lead('questions')}${o.questions.groups.length
    ? o.questions.groups.map((g) => `<h3 data-question-group="${esc(g.theme)}">${esc(`${g.title} (${g.questions.length})`)}</h3>${tableOf(questionTable(g))}`).join('')
    : ''}`;

  // The business layer the stage shows: written by a model from the process,
  // marked as a proposal, escaped like the rest. A field the model left empty
  // reads "Not determined", never a default (ADR-068). The matrix is the
  // normalised one (`lib/business-summary.ts`, `raciMatrix`): a small set of
  // roles, the rest listed beside it, a step without an Accountable named.
  const nd = NOT_DETERMINED_LABEL;
  const businessSection = parsedBusinessDoc
    ? `<h2 data-business-layer="">${esc('Business layer — Model proposal')}</h2>
    <p><em>${esc('Written by a language model from the process description above. Not derived from the code, and not verified; the roles are a proposal for the business to confirm.')}</em></p>
    ${glanceHtml(undefined, parsedBusinessDoc, options?.processSteps ?? processStepsFromDocument(document))}
    <h3>${esc('RACI assignment')}</h3>
    <table><thead><tr><th>Step</th><th>Responsible (R)</th><th>Accountable (A)</th><th>Consulted (C)</th><th>Informed (I)</th></tr></thead><tbody>${(parsedBusinessDoc.raci_matrix || [])
      .map((raci: Record<string, unknown>) => `<tr><td><code>${esc(raci.stepId)}</code></td><td>${esc(raci.r || nd)}</td><td>${esc(raci.a || nd)}</td><td>${esc(raci.c || nd)}</td><td>${esc(raci.i || nd)}</td></tr>`)
      .join('')}</tbody></table>
    <h3>${esc('Standard operating procedure')}</h3>
    <table><thead><tr><th>Step</th><th>Description</th><th>Business exception</th><th>KPI</th></tr></thead><tbody>${(parsedBusinessDoc.sop_details || [])
      .map((sop: Record<string, unknown>) => `<tr><td><code>${esc(sop.stepId)}</code></td><td>${esc(sop.narrative || nd)}</td><td>${esc(sop.businessException || nd)}</td><td>${esc(sop.kpiTarget || nd)}</td></tr>`)
      .join('')}</tbody></table>
    <h3>${esc('Audit controls')}</h3>
    <table><thead><tr><th>Step</th><th>Control objective</th><th>Mitigation</th><th>Verification</th></tr></thead><tbody>${(parsedBusinessDoc.audit_controls || [])
      .map((ctrl: Record<string, unknown>) => `<tr><td><code>${esc(ctrl.stepId)}</code></td><td>${esc(ctrl.controlObjective || nd)}</td><td>${esc(ctrl.mitigationAction || nd)}</td><td>${esc(ctrl.assertionMethod || nd)}</td></tr>`)
      .join('')}</tbody></table>`
    : '';

  const a = document.appendix;
  const stepDetailsSection = document.overview.path.map((entry) => entry.kind === 'gate'
    ? `<p class="note">${esc(gateSentence(entry))}</p>`
    : `<h4 data-doc-step="">${esc(`${entry.number}. ${stepName(entry)}`)}</h4><ul>${stepDetailLines(entry).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('');
  const long = longTables(o);
  const completeSection = long.length
    ? `<h3>${esc(COMPLETE_TABLES)}</h3>${long.map((t) => `<h4>${esc(`${t.caption} (${t.rows.length})`)}</h4>${tableOf(t, true)}`).join('')}`
    : '';
  const appendixSection = `<div class="appendix">${h2('appendix')}
    <p><em>${esc(appendixLead(a))}</em></p>
    <h3>${esc('A.1 Step details')}</h3>
    ${stepDetailsSection}
    ${completeSection}
    <h3>${esc('A.3 Wording as read from the code')}</h3>
    ${table(['Section', 'Item', 'As read from the code', 'Lines'], wordingRows(document), [3])}
    ${document.questions.length ? `<h3>${esc('A.4 Sources of the open questions')}</h3>${table(['No.', 'Source ids', 'Why the code cannot answer it', 'As the engine asked'], questionSourceRows(document), [1])}` : ''}
    <h3>${esc('A.5 Process elements')}</h3>
    <table><thead><tr><th>Element</th><th>Name</th><th>What it does</th><th>Lines</th></tr></thead><tbody>${a.elements
      .map((e) => `<tr data-trace-element=""><td><code>${esc(e.id)}</code><br>${esc(e.kind)}</td><td>${esc(e.name)}</td><td>${e.does ? esc(e.does) : e.sameAs ? `<small>${esc(`As at ${e.sameAs}`)}</small>` : ''}</td><td>${esc(e.evidence)}</td></tr>`)
      .join('')}</tbody></table>
    <h3>${esc('A.6 Statements by routine')}</h3>
    ${a.groups.map((g) => `<h4>${esc(groupTitle(g))}</h4><ul>${g.statements.map((s) => `<li data-trace-statement="">${esc(s.text)} <small>${lines(s.anchors)}</small></li>`).join('')}</ul>`).join('')}
    ${a.luw.length ? `<h3>${esc('A.7 Saving changes')}</h3><ul>${a.luw.map(item).join('')}</ul>` : ''}
    ${a.lanes.length ? `<h3>${esc('A.8 Lanes the code proves')}</h3><ul>${a.lanes.map(item).join('')}</ul>` : ''}
  </div>`;

  // The stylesheet every stage export shares (`lib/export-style.ts`), and this page's own few classes.
  const exportCSS = EXPORT_STYLE_ELEMENT;
  const engineHtml = `<html><head><meta charset="utf-8"><title>${esc(o.title)}</title>${exportCSS}${docCSS}</head><body>
    ${staleSection}
    ${coverSection}
    ${glanceSection}
    ${purposeSection}
    ${triggerSection}
    ${overviewSection}
    ${rulesSection}
    ${exceptionsSection}
    ${outputsSection}
    ${integrationsSection}
    ${controlsSection}
    ${questionsSection}
    ${businessSection}
    ${appendixSection}
  </body></html>`;
  return new Blob([engineHtml], { type: 'text/html;charset=utf-8' });
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
 * The visual summary of the stage as tables (owner 03.10.2026): the headline
 * and the callouts with their evidence, the SOP steps in process order, and
 * the RACI matrix with its gaps. It stands **in addition to** the full
 * sections below it, which keep every row as stored. Every value is escaped;
 * the business-layer tables are marked as a model proposal.
 */
function glanceHtml(
  options: ConfluenceExportOptions | undefined,
  parsedBusinessDoc: ModelJson | null,
  processSteps: ProcessStepRef[],
): string {
  const esc = escapeHtml;
  const parts: string[] = [];
  const glance = options?.glance;
  if (glance) {
    const rows = glance.callouts.map((c) => {
      const evidence = c.evidence
        .map((e) => [e.ref, e.anchor ? anchorWords(e.anchor) : null, e.label, e.level === undefined ? null : `level ${e.level ?? NOT_DETERMINED_LABEL.toLowerCase()}`]
          .filter((x): x is string => !!x)
          .map((x) => esc(x))
          .join(' · '))
        .concat(c.more > 0 ? [esc(`and ${c.more} more`)] : [])
        .join('<br>');
      return `<tr><td><strong>${esc(c.title)}</strong></td><td>${evidence}</td><td>${esc(provenance(c.provenance).label)}</td></tr>`;
    }).join('');
    parts.push(`<h2 data-glance-export="">At a glance</h2><p>${esc(glance.headline)}</p>`
      + (rows ? `<table><thead><tr><th>What the code shows</th><th>Evidence</th><th>Provenance</th></tr></thead><tbody>${rows}</tbody></table>` : ''));
  }
  if (parsedBusinessDoc) {
    const steps = sopSteps(parsedBusinessDoc, processSteps);
    const stepRowsHtml = steps.map((s) => `<tr data-glance-sop-step="${esc(s.stepId)}"><td>${esc(String(s.number))}</td><td>${esc(s.step?.name ?? s.stepId)}<br><small><code>${esc(s.stepId)}</code></small></td><td>${esc(s.outcome ?? NOT_DETERMINED_LABEL)}</td><td>${esc(s.roles.R.join(', ') || NOT_DETERMINED_LABEL)}</td><td>${esc(s.step?.anchor ? anchorWords(s.step.anchor) : NOT_DETERMINED_LABEL)}</td><td>${esc(provenance(s.step ? s.step.provenance : 'proposed').label)}</td></tr>`).join('');
    parts.push(`<h3>SOP steps — Model proposal</h3><table><thead><tr><th>#</th><th>Step</th><th>Outcome</th><th>Responsible</th><th>Lines</th><th>Provenance</th></tr></thead><tbody>${stepRowsHtml}</tbody></table>`);
    const matrix = raciMatrix(steps);
    if (matrix.steps.length > 0) {
      // At most six role columns (`MAX_RACI_COLUMNS`); a long name is shortened
      // in the head and named in full in the key; further roles are listed
      // under the matrix with their letters — the full assignment follows in
      // the RACI table further down.
      const head = matrix.roles.map((r) => `<th>${esc(r.short)}${r.overloaded ? esc(` (Responsible on ${r.counts.R} of ${matrix.steps.length})`) : ''}</th>`).join('');
      const body = matrix.steps.map((s) => `<tr data-glance-raci-step="${esc(s.stepId)}"><td>${esc(String(s.number))} ${esc(s.step?.name ?? s.stepId)}</td>${matrix.roles.map((r) => `<td class="mono strong">${esc(lettersOf(s, r.name).join(' '))}</td>`).join('')}<td>${esc([...s.gaps.map(raciGapWord), ...(s.hiddenAccountable.length ? [`A: ${s.hiddenAccountable.join(', ')}`] : [])].join(', '))}</td></tr>`).join('');
      const key = matrix.roles.filter((r) => r.short !== r.name).map((r) => `${r.short} = ${r.name}`).join(' · ');
      const more = matrix.moreRoles.map((r) => `<li>${esc(r.name)}: ${esc(matrix.steps.map((st) => ({ st, l: lettersOf(st, r.name) })).filter((x) => x.l.length).map((x) => `${x.l.join('')} on ${x.st.number}`).join(', '))}</li>`).join('');
      parts.push(`<h3>RACI matrix — Model proposal</h3><p><small>${esc(RACI_LETTERS.map((l) => `${l} ${raciLetterWord(l)}`).join(' · '))}${key ? esc(` · ${key}`) : ''}</small></p><table><thead><tr><th>Step</th>${head}<th>Check</th></tr></thead><tbody>${body}</tbody></table>${more ? `<p><small>${esc(`${matrix.moreRoles.length} more roles the proposal names:`)}</small></p><ul>${more}</ul>` : ''}`);
    }
  }
  return parts.join('\n');
}
