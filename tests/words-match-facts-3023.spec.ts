import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../lib/first-look';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { explainBusinessRules, theSubject } from '../lib/abap/business-rule-set-explain';
import { questionRuleCountsOf } from '../lib/rule-counts';
import { basketLineText } from '../lib/messages/rule-questions';
import { codeGeneratedStep } from '../lib/transformation-view';
import { handoverFacets, handoverStatusLine, buildHandoverChain, type HandoverProject } from '../lib/handover';
import { workflowSteps } from '../lib/workflow-steps';

/**
 * Roadmap 3.0.23 (d), server-free: words that match the facts.
 *   1. The Business opening's rule line counts rules, so it adds up to the
 *      business-rule count it stands beside (Design's "5 questions cover 16 of
 *      the 41 business rules").
 *   2. "Status of the code" ticks "Code generated" only when the tool bar's
 *      Transformation phase is done — never beside "Generated · not activatable".
 *   3. Delivery names the signed-off target the design target; "Decision" is
 *      the keep / rebuild / retire decision of the status line beside it.
 *   4. No sentence of the rule explanation says "the the": the generator puts
 *      one article before a subject, whatever the subject is.
 * Sources: the starter examples and a small synthetic program written here.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

async function load(rel: string): Promise<Record<string, (props: Record<string, unknown>) => React.ReactElement | null>> {
  const out = path.join(ROOT, 'tmp', 'words-3023', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out);
}

function explain(source: string) {
  const reading = readSource(source);
  return explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source));
}

/** Synthetic: two limits tested on expressions with no field of their own — the subject falls back to "the value". */
const NO_SUBJECT = `REPORT zcc_words_probe.
DATA lt_items TYPE STANDARD TABLE OF ekpo.
DATA lv_flag TYPE c.
PARAMETERS p_ebeln TYPE ekko-ebeln.
START-OF-SELECTION.
  SELECT * FROM ekpo INTO TABLE lt_items WHERE ebeln = p_ebeln.
  IF lines( lt_items ) < 3.
    MESSAGE 'Too few items' TYPE 'E'.
  ENDIF.
  IF strlen( p_ebeln ) < 3.
    lv_flag = 'X'.
  ENDIF.
`;

test.describe('3.0.23 (d) words that match the facts', () => {
  test('1. the rule line adds up to the business rules it stands beside', async () => {
    const sources = [
      read('public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'),
      read('public/starter-examples/Z_MM_PO_APPROVAL.abap'),
      read('tests/fixtures/rule-baskets/zmm_gr_invoice_check.abap'),
    ];
    const mod = await load('components/workspace/RuleBasketLine.tsx');
    for (const source of sources) {
      const c = questionRuleCountsOf(explain(source), 0);
      if (c.questions === 0) continue;
      const text = basketLineText(c.questions, c.rulesAsked, c.technical);
      const covered = Number(/cover(?:s)? (\d+) rules?/.exec(text)?.[1]);
      expect(covered).toBe(c.rulesAsked);
      const html = renderToStaticMarkup(
        React.createElement(mod.RuleBasketLineView, { questions: c.questions, rulesAsked: c.rulesAsked, total: c.total, technical: c.technical, undetermined: c.undetermined, designHref: null }),
      );
      const plain = html.replace(/<[^>]+>/g, '');
      // The rule figures on the line: covered + technical + not determined (+ any other) — never the question count.
      const technical = Number(/(\d+) technical rules? stays? as coded/.exec(plain)?.[1] ?? 0);
      const undetermined = Number(/(\d+) not determined/.exec(plain)?.[1] ?? 0);
      const other = Number(/(\d+) more in the rule register/.exec(plain)?.[1] ?? 0);
      expect(covered + technical + undetermined + other, plain).toBe(c.total);
    }
    // The line takes its counts from the one count source Design reads.
    expect(read('components/workspace/RuleBasketLine.tsx')).toContain('questionRuleCountsOf(ex, 0)');
  });

  test('2. "Code generated" carries no done tick while the tool bar says the package is not activatable', async () => {
    const notActivatable = { state: 'partial', badge: 'Generated · not activatable', detail: 'Target code not activatable: 2 syntax errors — regenerate it before testing.' };
    const step = codeGeneratedStep({ generated: true, packageNote: '3 objects', emptyNote: 'not yet', phase: notActivatable });
    expect(step.done).toBe(false);
    expect(step.text).toBe('Generated · not activatable');
    expect(step.note).toContain('regenerate it before testing');
    expect(codeGeneratedStep({ generated: true, packageNote: '3 objects', emptyNote: 'not yet', phase: { state: 'done', badge: 'Generated', detail: '' } })).toEqual({ done: true, text: 'Code generated', note: '3 objects' });
    // The demo (no phase, no files) is unchanged.
    expect(codeGeneratedStep({ generated: false, packageNote: '', emptyNote: 'not in a demo' }).done).toBe(false);

    const mod = await load('components/transformation/TransformationObjectPage.tsx');
    const render = (codePhase: unknown) =>
      renderToStaticMarkup(
        React.createElement(mod.default, {
          findings: [],
          coverage: null,
          track: 'in-app',
          codeKind: 'ABAP Cloud (RAP)',
          files: [{ path: 'src/zcl_demo_logic.clas.abap', content: 'CLASS zcl_demo_logic DEFINITION PUBLIC.\nENDCLASS.\n' }],
          openSignOffs: null,
          codePhase,
        }),
      );
    const status = (html: string) => html.slice(html.indexOf('data-code-status'), html.indexOf('</ol>', html.indexOf('data-code-status')));
    const broken = status(render(notActivatable));
    expect(broken).toContain('Generated · not activatable');
    expect(broken).not.toContain('Code generated');
    expect(broken).not.toContain('(done)');
    expect(status(render({ state: 'done', badge: 'Generated', detail: '' }))).toContain('Code generated');
    // The page hands the tool bar's phase to the Object Page.
    expect(read('app/(app)/project/[projectId]/transformation/page.tsx')).toContain("codePhase={phases.find((p) => p.key === 'transformation') ?? null}");
  });

  test('3. Delivery names the signed-off target the design target, beside the unconfirmed Decision', () => {
    const p = {
      id: 'p1',
      name: 'Words fixture',
      legacyCode: 'REPORT z_words.\n',
      activeRunId: 'run-0001',
      solutionDesign: '# Design',
      approvedByArchitect: true,
      targetArchitecture: 'rap',
      approvedBy: 'lead@example.invalid',
      worklist: [],
    } as unknown as HandoverProject;
    const phases = workflowSteps(p as never);
    const chain = buildHandoverChain(p, phases);
    const facets = handoverFacets(p, phases, chain, { blockers: [], exportedAt: null });
    const target = facets.find((f) => f.key === 'decision')!;
    expect(target.label).toBe('Design target');
    expect(target.value).toBe('Signed off');
    expect(facets.some((f) => /decision/i.test(f.label))).toBe(false);
    // The keep / rebuild / retire decision is not confirmed — and it is the only "Decision" on the header.
    expect(handoverStatusLine(p, chain).find((s) => s.key === 'decision')).toMatchObject({ label: 'Decision', value: 'not confirmed' });
    const page = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(page).toContain("k: 'Design target'");
    expect(page).not.toMatch(/k: 'Decision',\s*v: target/);
    expect(page).not.toContain('— confirmed${project.approvedBy');
  });

  test('4. the rule explanation never says "the the" — the generator puts one article before a subject', () => {
    const ex = explain(NO_SUBJECT);
    const statements = ex.questions.map((q) => q.statement.text);
    expect(statements.length).toBeGreaterThan(0);
    expect(statements).toContain('When the value is below 3, the program stops with an error message.');
    expect(JSON.stringify(ex)).not.toMatch(/\bthe the\b/i);
    expect(theSubject('value')).toBe('the value');
    expect(theSubject('the value')).toBe('the value');
    // No template of the explainer writes a bare "the " before a subject any more — only `theSubject` itself does.
    expect(read('lib/abap/business-rule-set-explain.ts').match(/the \$\{[\w.]*[sS]ubject\}/g)).toEqual(['the ${subject}']);
  });
});
