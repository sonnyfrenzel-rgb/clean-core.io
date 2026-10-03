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
import { EXPORT_STYLE_ELEMENT } from '@/lib/export-style';
import { NOT_DETERMINED_LABEL } from '@/lib/process-documentation';
import {
  EMPTY_SECTION,
  MODEL_PROPOSAL_LABEL,
  appendixLead,
  gateLine,
  groupTitle,
  linesLabel,
  sectionTitle,
  stepLine,
  type PdText,
  type ProcessDocument,
  type ProcessDocumentSection,
} from '@/lib/process-document';
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
 * The Confluence page of the process description (owner 03.10.2026) — the
 * same `ProcessDocument` the stage renders, in the order a successor reads
 * it: purpose and scope, trigger and inputs, the process overview with its
 * diagram, decision points and rules, exceptions, outputs, integrations,
 * controls, open questions — then the business layer when a model wrote one,
 * marked as a proposal, and the technical trace last, as an appendix. No
 * table stands before the first section, and nothing is folded: a pasted
 * page has no disclosure to open.
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
  const lines = (anchors: PdText['anchors']) => esc(linesLabel(anchors));
  const para = (t: PdText) => `<p>${esc(t.text)}${t.anchors.length ? ` <small>${lines(t.anchors)}</small>` : ''}</p>`;
  const item = (t: PdText) => `<li>${esc(t.text)}${t.anchors.length ? ` <small>${lines(t.anchors)}</small>` : ''}</li>`;
  const proposal = (text: string, anchors: PdText['anchors'], engineWord: string) =>
    `<p class="card accent-information"><span class="tag tone-information">${esc(MODEL_PROPOSAL_LABEL)}</span> ${esc(text)}${anchors.length ? ` <small>${lines(anchors)}</small>` : ''}<br><small>${esc(engineWord)}</small></p>`;
  const table = (head: string[], rows: string[][]) =>
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  const empty = (key: keyof typeof EMPTY_SECTION) => `<p class="muted">${esc(EMPTY_SECTION[key])}</p>`;
  const h2 = (key: ProcessDocumentSection) => `<h2 data-doc-section="${esc(key)}">${esc(sectionTitle(key))}</h2>`;
  const p = document.purpose;

  const headerSection = `<h1>${esc(`Process description — ${options?.projectName || document.program}`)}</h1>
    <p class="meta">${esc(`${document.fileName} · ${document.lineCount} lines · SHA-256 ${document.sourceSha256.slice(0, 16)}…`)}</p>
    <p><em>${esc(document.note)}</em></p>`;

  const purposeSection = `${h2('purpose')}
    ${p.summary.map(para).join('')}
    ${p.proposal ? proposal(p.proposal.text, p.proposal.anchors, 'Worded by the analysis model from the same source; the engine sentences above are the evidence.') : ''}
    ${para(p.users)}
    <h3>${esc('In scope')}</h3><ul>${p.inScope.map(item).join('')}</ul>
    <h3>${esc('Not in scope — not in this code')}</h3><ul>${p.outOfScope.map(item).join('')}</ul>`;

  const t = document.trigger;
  const triggerSection = `${h2('trigger')}
    ${!t.start.length && !t.selection.length ? empty('trigger') : ''}
    ${t.start.map(para).join('')}
    ${t.selection.length ? `<h3>${esc('Selection screen')}</h3>${table(['Field', 'Meaning', 'Kind', 'Required', 'Default', 'Line'], t.selection.map((i) => [i.name.toUpperCase(), i.meaning, i.kind, i.required ? 'Yes' : 'No', i.defaultValue ?? '—', linesLabel([i.anchor])]))}` : ''}
    ${t.data.length ? `<h3>${esc('Data the process reads')}</h3>${table(['Table', 'Business object', 'Owner', 'Lines'], t.data.map((d) => [d.name, d.meaning ?? '—', d.owner, linesLabel(d.anchors)]))}` : ''}`;

  const pathRows = document.overview.path.map((entry) => {
    if (entry.kind === 'gate') return `<p class="note">${esc(gateLine(entry))}</p>`;
    const subSteps = entry.subSteps
      .map((s) => `<li>${esc(`${s.depth > 1 ? '– ' : ''}${s.kind}: ${s.label}`)}${s.anchor ? ` <small>${lines([s.anchor])}</small>` : ''}</li>`)
      .join('');
    const more = entry.moreSubSteps > 0 ? `<li><em>${esc(`and ${entry.moreSubSteps} more — see the appendix`)}</em></li>` : '';
    return `<h3 data-doc-step="">${esc(`${entry.number}. ${entry.businessName ?? entry.name}`)}</h3>
      <p class="meta">${esc(stepLine(entry))}</p>
      ${entry.facts ? `<p>${esc(entry.facts)}</p>` : ''}
      ${entry.proposal ? proposal(entry.proposal.text, entry.proposal.anchors, `Engine: ${entry.does.map((d) => d.text).join(' ') || entry.facts || entry.name}`) : ''}
      ${entry.does.map(para).join('')}
      ${subSteps || more ? `<ul>${subSteps}${more}</ul>` : ''}`;
  }).join('\n');
  const overviewSection = `${h2('overview')}
    <p>${esc(document.overview.sentence)}</p>
    <div class="card">${processOverviewSvg(document.overview.path, document.program)}</div>
    <p><small>${esc(document.overview.traceability)}</small></p>
    ${pathRows}`;

  const rulesSection = `${h2('rules')}${document.rules.length
    ? table(['Rule', 'Where', 'Condition', 'Effect', 'Lines'], document.rules.map((r) => [r.ref, r.where ?? 'Whole program', r.condition, r.effect, linesLabel(r.anchors)]))
    : empty('rules')}`;
  const exceptionsSection = `${h2('exceptions')}${document.exceptions.length
    ? table(['What happens', 'Where', 'Message the user sees', 'Outcome', 'Lines'], document.exceptions.map((e) => [e.what, e.where ?? '—', e.message ?? 'None at this point', e.outcome, linesLabel(e.anchors)]))
    : empty('exceptions')}`;
  const outputsSection = `${h2('outputs')}${document.outputs.length
    ? table(['Effect', 'What', 'Objects', 'Lines'], document.outputs.map((e) => [e.kind, e.what, e.objects.join(', ') || '—', linesLabel(e.anchors)]))
    : empty('outputs')}`;
  const integrationsSection = `${h2('integrations')}${document.integrations.length
    ? table(['Called', 'Kind', 'Purpose', 'Lines'], document.integrations.map((i) => [i.name, i.kind, i.purpose, linesLabel(i.anchors)]))
    : empty('integrations')}`;
  const controlsSection = `${h2('controls')}${document.controls.length
    ? table(['Control', 'What the code does', 'Ref', 'Lines'], document.controls.map((c) => [c.kind, c.text, c.ref ?? '—', linesLabel(c.anchors)]))
    : empty('controls')}`;
  const questionsSection = `${h2('questions')}${document.questions.length
    ? `<p>${esc('Not determined from the code. Each question is asked once; the lines name what raises it.')}</p>${table(['ID', 'Owner', 'Question', 'Why the code cannot answer it', 'Lines'], document.questions.map((q) => [q.id, q.owner, q.question, q.why, q.anchors.length ? linesLabel(q.anchors) : 'not in the code']))}`
    : empty('questions')}`;

  // The business layer the stage shows: written by a model from the process,
  // marked as a proposal, escaped like the rest. A field the model left empty
  // reads "Not determined", never a default (ADR-068).
  const nd = NOT_DETERMINED_LABEL;
  const businessSection = parsedBusinessDoc
    ? `<h2 data-business-layer="">${esc('Business layer — Model proposal')}</h2>
    <p><em>${esc('Written by a language model from the process description above. Not derived from the code, and not verified.')}</em></p>
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
  const appendixSection = `${h2('appendix')}
    <p><em>${esc(appendixLead(a))}</em></p>
    <h3>${esc('A.1 Process elements')}</h3>
    <table><thead><tr><th>Element</th><th>Name</th><th>What it does</th><th>Lines</th></tr></thead><tbody>${a.elements
      .map((e) => `<tr data-trace-element=""><td><code>${esc(e.id)}</code><br>${esc(e.kind)}</td><td>${esc(e.name)}</td><td>${e.does ? esc(e.does) : e.sameAs ? `<small>${esc(`As at ${e.sameAs}`)}</small>` : ''}</td><td>${esc(e.evidence)}</td></tr>`)
      .join('')}</tbody></table>
    <h3>${esc('A.2 Statements by routine')}</h3>
    ${a.groups.map((g) => `<h4>${esc(groupTitle(g))}</h4><ul>${g.statements.map((s) => `<li data-trace-statement="">${esc(s.text)} <small>${lines(s.anchors)}</small></li>`).join('')}</ul>`).join('')}
    ${a.luw.length ? `<h3>${esc('A.3 Saving changes')}</h3><ul>${a.luw.map(item).join('')}</ul>` : ''}
    ${a.lanes.length ? `<h3>${esc('A.4 Lanes the code proves')}</h3><ul>${a.lanes.map(item).join('')}</ul>` : ''}`;

  // The stylesheet every stage export shares (`lib/export-style.ts`).
  const exportCSS = EXPORT_STYLE_ELEMENT;
  const engineHtml = `<html><head><meta charset="utf-8">${exportCSS}</head><body>
    ${staleSection}
    ${headerSection}
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
      const head = matrix.roles.map((r) => `<th>${esc(r.name)}${r.overloaded ? esc(` (Responsible on ${r.counts.R} of ${matrix.steps.length})`) : ''}</th>`).join('');
      const body = matrix.steps.map((s) => `<tr data-glance-raci-step="${esc(s.stepId)}"><td>${esc(String(s.number))} ${esc(s.step?.name ?? s.stepId)}</td>${matrix.roles.map((r) => `<td class="mono strong">${esc(lettersOf(s, r.name).join(' '))}</td>`).join('')}<td>${esc(s.gaps.map(raciGapWord).join(', '))}</td></tr>`).join('');
      parts.push(`<h3>RACI matrix — Model proposal</h3><p><small>${esc(RACI_LETTERS.map((l) => `${l} ${raciLetterWord(l)}`).join(' · '))}</small></p><table><thead><tr><th>Step</th>${head}<th>Check</th></tr></thead><tbody>${body}</tbody></table>`);
    }
  }
  return parts.join('\n');
}
