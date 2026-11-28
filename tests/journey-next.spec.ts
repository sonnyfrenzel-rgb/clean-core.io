import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { decisionOfRead, journeyNext } from '../lib/journey-next';
import type { DecisionRead } from '../lib/management-overview';
import type { RedesignDecision } from '../lib/redesign';
import { PHASES, type PhaseKey, type PhaseState, type RailStep } from '../lib/workflow-steps';

/**
 * Journey review 26.11.2026 (M2): one next step on every tool, by Re-design's own rule, decision included — never the
 * page the reader stands on. Server-free.
 */
const ROOT = path.resolve(__dirname, '..');

function rail(states: Partial<Record<PhaseKey, PhaseState>>): RailStep[] {
  return PHASES.map((p) => {
    const state = states[p.key] ?? 'empty';
    return { n: p.n, key: p.key, label: p.label, path: p.key, state, done: state === 'done', proven: false, mock: false, verifiedOutside: null, badge: '', detail: '' };
  });
}
const none: RedesignDecision = { stage: 'not-decided', option: null, indicated: null };

test.describe('the one next step', () => {
  test('from Analyze and from Economics: the decision, never Economics (ADR-145 (5))', () => {
    const steps = rail({ analyze: 'done' });
    expect(journeyNext(steps, none, 'analyze').next).toMatchObject({ key: 'decide', path: 'redesign#decide' });
    const onEconomics = journeyNext(steps, none, 'tco');
    expect(onEconomics.next).toMatchObject({ key: 'decide', path: 'redesign#decide' });
    expect(onEconomics.after).toBeNull();
  });

  test('priced, not decided: the decision on the Re-design page — the step the tool row never knew', () => {
    const way = journeyNext(rail({ analyze: 'done', tco: 'done' }), none, 'design');
    expect(way.next).toMatchObject({ key: 'decide', path: 'redesign#decide' });
    expect(way.after).toBeNull();
  });

  test('decided Rebuild: Design; and on Design, the tool after it', () => {
    const rebuild: RedesignDecision = { stage: 'confirmed', option: 'rebuild', indicated: null };
    expect(journeyNext(rail({ analyze: 'done', tco: 'done' }), rebuild, 'tco').next).toMatchObject({ key: 'design', path: 'design' });
    expect(journeyNext(rail({ analyze: 'done', tco: 'done' }), rebuild, 'design').after).toMatchObject({ key: 'transformation', path: 'transformation' });
  });

  test('the decision as Re-design reads it: confirmed, chosen, or none', () => {
    const binding = (rev: string | null) => ({ bindings: [{ key: 'option', revision: rev }] });
    const read = (over: Partial<DecisionRead>): DecisionRead => ({ draft: binding('rap · x') as never, stored: null, ...over } as DecisionRead);
    expect(decisionOfRead(null, true).stage).toBe('unknown');
    expect(decisionOfRead(read({ draft: binding(null) as never }), false).stage).toBe('not-decided');
    expect(decisionOfRead(read({}), false)).toMatchObject({ stage: 'chosen', option: 'rebuild' });
    expect(decisionOfRead(read({ stored: { ...binding('retire'), status: 'confirmed' } as never }), false)).toMatchObject({ stage: 'confirmed', option: 'retire' });
  });

  test('one source for the bar and the tool row: the header works it out once and hands it to both', () => {
    const header = fs.readFileSync(path.join(ROOT, 'components/StageHeader.tsx'), 'utf8');
    expect(header).toContain('const journey = useJourneyNext({');
    expect(header).toContain('<NextStepBar way={journey} base={toolBase} />');
    expect(header).toContain('journeyNextKey={journeyNextKey}');
    // Not on Re-design, which is the step list itself; never before the project is read (walk-through, finding 2).
    expect(header).toContain("tools && toolCurrent && toolCurrent !== 'analyze' && !onRedesign && toolBase ? <NextStepBar");
    expect(header).toContain('loaded: demo || Boolean(project),');
    const bar = fs.readFileSync(path.join(ROOT, 'components/NextStepBar.tsx'), 'utf8');
    expect(bar.match(/<CcLinkButton /g)?.length).toBe(1);
    expect(bar).toContain('if (!way) return null;');
    const hook = fs.readFileSync(path.join(ROOT, 'hooks/useJourneyNext.ts'), 'utf8');
    expect(hook).toContain("if (!demo && hasRun && (!own || own.state === 'failed')) return null;");
    expect(hook).toContain('const own = read && read.projectId === projectId ? read : null;');
    const row = fs.readFileSync(path.join(ROOT, 'components/workspace/ToolBar.tsx'), 'utf8');
    expect(row).toContain('journeyNextKey === undefined ? shownNext : nextTagShown(tools, journeyNextKey, progress.laterToolOpened) ? journeyNextKey : null;');
  });
});

test('once a tool after Economics holds a record, the way on does not send the reader back to Economics, but still to the decision (ADR-145)', () => {
  // Before 3.5.4 a rebuild could be confirmed only after Design's sign-off, so the decision was skipped here. Now it
  // is recorded in one go on the Decide page, route included: the undecided program's next step is the decision.
  const steps = rail({ analyze: 'done', tco: 'partial', design: 'partial' });
  const way = journeyNext(steps, none, 'testing');
  expect(way.next).toMatchObject({ key: 'decide', path: 'redesign#decide' });
  expect(journeyNext(steps, none, 'design').next?.key).toBe('decide');
  const rebuild: RedesignDecision = { stage: 'confirmed', option: 'rebuild', indicated: null };
  expect(journeyNext(steps, rebuild, 'testing').next).toMatchObject({ key: 'design', path: 'design' });
});
