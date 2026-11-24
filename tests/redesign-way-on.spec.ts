import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { redesignHref, redesignModel, REDESIGN_DECIDE_ID, type RedesignDecision } from '../lib/redesign';
import { managementLevelMix, managementRisks, MANAGEMENT_PAGE_IDS } from '../lib/analyze-management';
import { PHASES, type PhaseKey, type PhaseState, type RailStep } from '../lib/workflow-steps';
import type { ItFindingRow } from '../lib/it-findings';

/**
 * ADR-143 (owner request 23.11.2026): Analyze gets a Management view of its own, and the way on from Analyze leads
 * through Re-design (`/project/[id]/redesign`) into the tools. Server-free: the Re-design model, the Management
 * page's readings, and the links that must lead to Re-design (or must not).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function rail(states: Partial<Record<PhaseKey, PhaseState>>): RailStep[] {
  return PHASES.map((p) => {
    const state = states[p.key] ?? 'empty';
    return { n: p.n, key: p.key, label: p.label, path: p.key, state, done: state === 'done', proven: false, mock: false, verifiedOutside: null, badge: '', detail: '' };
  });
}
const none: RedesignDecision = { stage: 'not-decided', option: null, indicated: 'rebuild' };

test.describe('the Re-design model', () => {
  test('the six tools in PHASES order with the decision as step 2, between Economics and Design', () => {
    const m = redesignModel(rail({ analyze: 'done' }), none);
    expect(m.steps.map((s) => s.key)).toEqual(['tco', 'decide', 'design', 'transformation', 'documentation', 'testing', 'delivery']);
    expect(m.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(m.steps.find((s) => s.key === 'decide')?.path).toBeNull();
  });

  test('the next step: Economics first, then the decision, then Design', () => {
    expect(redesignModel(rail({ analyze: 'done' }), none).next).toMatchObject({ key: 'tco', path: 'tco', label: 'Start with Economics: price the options' });
    expect(redesignModel(rail({ analyze: 'done', tco: 'partial' }), none).next?.label).toBe('Continue in Economics: price the options');
    const priced = redesignModel(rail({ analyze: 'done', tco: 'done' }), none);
    expect(priced.next).toMatchObject({ key: 'decide', path: `#${REDESIGN_DECIDE_ID}` });
    const decided = redesignModel(rail({ analyze: 'done', tco: 'done' }), { stage: 'confirmed', option: 'rebuild', indicated: 'rebuild' });
    expect(decided.next).toMatchObject({ key: 'design', path: 'design' });
  });

  test('no signed run: the way on is the analysis, and nothing is offered past it', () => {
    const m = redesignModel(rail({}), none);
    expect(m.analysed).toBe(false);
    expect(m.next).toMatchObject({ key: 'analyze', path: 'analyze' });
    expect(redesignModel(rail({ analyze: 'stale' }), none).next?.label).toBe('Run the analysis again');
  });

  // 3.5.1 (decision-flow S1): a decision that builds nothing used to leave Design "Not started" and the primary action
  // on "Open Design" for ever. Now the walk ends at the confirmed decision.
  for (const option of ['retire', 'keep', 'standard'] as const) {
    test(`a confirmed ${option} builds nothing: Design to Delivery read "Not needed", and the walk ends`, () => {
      const m = redesignModel(rail({ analyze: 'done', tco: 'done' }), { stage: 'confirmed', option, indicated: null });
      const by = Object.fromEntries(m.steps.map((s) => [s.key, s]));
      const named = { retire: 'Retire', keep: 'Keep', standard: 'Move to SAP standard' }[option];
      for (const k of ['design', 'transformation', 'documentation', 'testing', 'delivery']) {
        expect(by[k].state, k).toBe('not-needed');
        expect(by[k].stateWords, k).toBe(`Not needed: ${named} builds nothing`);
      }
      expect(by.decide.state).toBe('done');
      // No step stays waiting.
      expect(m.steps.filter((s) => s.state !== 'done' && s.state !== 'not-needed')).toEqual([]);
      // The action opens the decision on this page, never a tool, and never "Open Design".
      expect(m.next).toMatchObject({ key: 'decide', path: `#${REDESIGN_DECIDE_ID}`, label: 'Open the decision', done: true });
      expect(m.next?.label).not.toMatch(/Design/);
      expect(m.next?.note).toBe(`Done. ${named} builds nothing, so no step is waiting.`);
      expect(m.answer).toContain(`Decided: ${named}. Nothing is built, so Re-design is done.`);
    });
  }

  test('the walk ends even with Economics not priced, and a step with something on record keeps its state', () => {
    // The decision does not require a price (no cost gate in `decision-manager.ts`), so Economics is no next step.
    const m = redesignModel(rail({ analyze: 'done', tco: 'partial', design: 'partial' }), { stage: 'confirmed', option: 'retire', indicated: null });
    const by = Object.fromEntries(m.steps.map((s) => [s.key, s]));
    expect(by.tco.state).toBe('started');
    expect(by.design).toMatchObject({ state: 'started', stateWords: 'Started' });
    expect(by.transformation.state).toBe('not-needed');
    expect(m.next).toMatchObject({ key: 'decide', done: true });
  });

  test('a chosen or outdated option that builds nothing does not end the walk: the decision is still waiting', () => {
    const chosen = redesignModel(rail({ analyze: 'done', tco: 'done' }), { stage: 'chosen', option: 'retire', indicated: null });
    expect(chosen.next).toMatchObject({ key: 'decide' });
    expect(chosen.next?.done).toBeUndefined();
    expect(chosen.steps.find((s) => s.key === 'design')?.stateWords).toBe('Not needed once Retire is confirmed');
    expect(chosen.answer).toBe('Retire chosen, not confirmed yet. Nothing is built after it once it is confirmed.');
    const outdated = redesignModel(rail({ analyze: 'done', tco: 'done' }), { stage: 'outdated', option: 'keep', indicated: null });
    expect(outdated.steps.find((s) => s.key === 'decide')?.state).toBe('stale');
    expect(outdated.next).toMatchObject({ key: 'decide' });
    expect(outdated.next?.done).toBeUndefined();
    expect(outdated.answer).toContain('out of date');
  });

  test('Rebuild is unchanged: Design is the next step, nothing reads "Not needed"', () => {
    const m = redesignModel(rail({ analyze: 'done', tco: 'done' }), { stage: 'confirmed', option: 'rebuild', indicated: 'rebuild' });
    expect(m.steps.some((s) => s.state === 'not-needed')).toBe(false);
    expect(m.next).toMatchObject({ key: 'design', path: 'design', label: 'Open Design' });
    expect(m.next?.done).toBeUndefined();
  });

  test('a chosen, unconfirmed option is started, never done', () => {
    const m = redesignModel(rail({ analyze: 'done', tco: 'done' }), { stage: 'chosen', option: 'keep', indicated: null });
    expect(m.steps.find((s) => s.key === 'decide')).toMatchObject({ state: 'started', stateWords: 'Keep chosen, not confirmed' });
    expect(m.next?.key).toBe('decide');
  });

  test("a step the account's own switch blocks says so, and the next step's note names the switch", () => {
    // The rule of the retired "Next step" card (lib/next-step.ts), carried into Re-design: opening still works.
    const off = { modelStages: { design: false } };
    const decided = { stage: 'confirmed', option: 'rebuild', indicated: 'rebuild' } as const;
    const m = redesignModel(rail({ analyze: 'done', tco: 'done' }), decided, off);
    const design = m.steps.find((s) => s.key === 'design');
    expect(design?.blocked).toBe('The model is switched off for solution design blueprint on this account.');
    expect(m.next).toMatchObject({ key: 'design', path: 'design' });
    expect(m.next?.note).toContain('switched off');
    // Only an empty step, and never without the account's own switch.
    expect(redesignModel(rail({ analyze: 'done', tco: 'done', design: 'partial' }), decided, off).steps.find((s) => s.key === 'design')?.blocked).toBeUndefined();
    expect(redesignModel(rail({ analyze: 'done', tco: 'done' }), decided).steps.some((s) => s.blocked)).toBe(false);
  });

  test('no em dash in a sentence the page shows', () => {
    const decisions: RedesignDecision[] = [
      none,
      { stage: 'confirmed', option: 'retire', indicated: null },
      { stage: 'chosen', option: 'standard', indicated: null },
      { stage: 'outdated', option: 'keep', indicated: null },
    ];
    for (const d of decisions) {
      const m = redesignModel(rail({ analyze: 'done' }), d);
      for (const s of m.steps) expect(`${s.purpose} ${s.stateWords}`).not.toContain('—');
      expect(m.answer).not.toContain('—');
      expect(`${m.next?.label ?? ''} ${m.next?.note ?? ''}`).not.toContain('—');
    }
  });

  test('the address', () => {
    expect(redesignHref('p 1')).toBe('/project/p%201/redesign');
    expect(redesignHref('p1', 'decide')).toBe('/project/p1/redesign#decide');
  });
});

const row = (over: Partial<ItFindingRow>): ItFindingRow =>
  ({ id: 'CC-1', kind: 'k', title: 't', severity: 'High', objectName: null, objectType: null, lineStart: 1, lineEnd: null, routine: null, level: null, ...over }) as ItFindingRow;

test.describe('Analyze, Management: its readings of the findings', () => {
  test('risk if nothing changes: critical and high only, grouped, worst first, three line anchors at most', () => {
    const r = managementRisks([
      row({ kind: 'write', kindLabel: 'direct writes to SAP standard tables', severity: 'Critical', lineStart: 40 }),
      row({ kind: 'write', severity: 'High', lineStart: 12 }),
      row({ kind: 'read', kindLabel: 'reads of SAP standard tables', severity: 'High', lineStart: 5 }),
      row({ kind: 'read', severity: 'High', lineStart: 6 }),
      row({ kind: 'read', severity: 'High', lineStart: 7 }),
      row({ kind: 'read', severity: 'High', lineStart: 8 }),
      row({ kind: 'screen', severity: 'Medium', lineStart: 9 }),
    ]);
    expect(r.total).toBe(6);
    expect(r.worst).toBe('Direct writes to SAP standard tables');
    expect(r.groups.map((g) => g.kind)).toEqual(['write', 'read']);
    expect(r.groups[0].lines.map((l) => l.start)).toEqual([12, 40]);
    expect(r.groups[1].lines).toHaveLength(3);
    expect(managementRisks([row({ severity: 'Low' })])).toEqual({ total: 0, worst: null, groups: [] });
  });

  test('the Level A–D mix counts each object once per level and leaves rows without a level out', () => {
    const mix = managementLevelMix([
      row({ objectName: 'VBAK', level: 'C' }),
      row({ objectName: 'VBAK', level: 'C', lineStart: 9 }),
      row({ objectName: 'VBAP', level: 'D' }),
      row({ objectName: 'BAPI_X', level: 'A' }),
      row({ objectName: 'ZT', level: 'Unknown' }),
      row({ objectName: null, level: null }),
    ]);
    expect(mix).toEqual({ A: 1, B: 0, C: 1, D: 1 });
  });
});

test.describe('the way on leads through Re-design (ADR-143)', () => {
  test('Analyze, Management: its own page, one primary action into Re-design, no tool link, no amount of its own', () => {
    const page = code('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(page).toMatch(/view === 'management' && !working[\s\S]*?<AnalyzeManagement\b/);
    expect(page).toContain("redesignHref(projectId, 'decide')");
    expect(page).not.toContain('?view=management#decision-card');
    // Economics' "Take it to the decision" goes straight to the decision step, not through an old address (S1).
    const economics = code('app/(app)/project/[projectId]/tco/page.tsx');
    expect(economics).toContain("redesignHref(String(projectId), 'decide')");
    expect(economics).not.toContain('?view=management#decision-card');
    expect(code('components/tco/EconomicsObjectPage.tsx')).not.toContain('that is taken in Management');
    const mgmt = code('components/analyze/AnalyzeManagement.tsx');
    expect(mgmt.match(/variant="primary"/g) ?? []).toHaveLength(1);
    expect(mgmt).toContain('An indication, not a decision.');
    expect(mgmt).toContain('Re-design this program');
    // No option links into a tool: the options table has no href of a stage.
    expect(mgmt).not.toMatch(/\/(tco|design|transformation|documentation|testing|delivery)[`'"]/);
    expect(mgmt).not.toMatch(/CoachMark|DEC-\d/);
    for (const id of Object.values(MANAGEMENT_PAGE_IDS)) expect(mgmt).toContain(`MANAGEMENT_PAGE_IDS.${Object.entries(MANAGEMENT_PAGE_IDS).find(([, v]) => v === id)![0]}`);
  });

  test('the endings, the start after a run and the tiles go to Re-design; the business questions stay direct', () => {
    const biz = code('components/analyze/AnalyzeBusiness.tsx');
    expect(biz).toContain('const redesignHref = redesignPageHref(projectId);');
    expect(biz).toMatch(/router\.push\(redesignPageHref\(projectId\)\)/);
    expect(biz).toContain('/design#${RULE_QUESTIONS_ID}');
    const tiles = code('components/workspace/WorkspaceTiles.tsx');
    for (const action of ['open-decision', 'start-redesign', 'continue']) {
      expect(tiles, action).toMatch(new RegExp(`<ActionLink href=\\{redesignHref\\(tile(, true)?\\)\\} data-tile-action="${action}"`));
    }
    expect(tiles).toContain('router.push(redesignHref(t));');
    expect(code('components/analyze/RouteCard.tsx')).toContain('Decide in Re-design');
  });

  test('the tool row of Analyze groups the six tools under "Re-design ›"; the Re-design page is its current item', () => {
    const bar = code('components/workspace/ToolBar.tsx');
    expect(bar).toContain('data-stage-tools-group="redesign"');
    expect(bar).toContain("aria-current={group.current ? 'page' : undefined}");
    const header = code('components/StageHeader.tsx');
    expect(header).toMatch(/\(projectId \|\| demo\) && \(onRedesign \|\| toolCurrent === 'analyze'\)/);
    expect(header).toContain('demo ? demoRedesignHref() : redesignHref(projectId)');
    const route = code('app/(app)/project/[projectId]/redesign/page.tsx');
    expect(route).toContain('<RedesignPage');
    const redesign = code('components/redesign/RedesignPage.tsx');
    expect(redesign).toContain('place="redesign"');
    expect(redesign).toContain('<RedesignView');
    const view = code('components/redesign/RedesignView.tsx');
    expect(view).toContain('id={step.key === \'decide\' ? REDESIGN_DECIDE_ID : undefined}');
    // Read-only apart from the reused decision parts: no write of its own.
    for (const src of [redesign, view]) expect(src).not.toMatch(/setDoc|updateDoc|addDoc|fetch\(/);
    // The demo has its own Re-design page, drawn by the same view, and its onward links lead there.
    expect(code('app/(app)/demo/redesign/page.tsx')).toContain('<DemoRedesign');
    expect(code('components/demo/DemoRedesign.tsx')).toContain('<RedesignView');
    expect(code('components/demo/DemoAnalyze.tsx')).not.toContain('/demo/workspace?view=management');
    expect(code('components/demo/DemoAnalyze.tsx')).toContain("decideHref={demoRedesignHref('decide')}");
    expect(code('components/demo/DemoAnalyzeBusiness.tsx')).toContain('designHref={demoRedesignHref()}');
  });
});
