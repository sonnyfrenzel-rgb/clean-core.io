import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { checkBusinessDocShape } from '../app/(app)/project/[projectId]/documentation/blueprint-schema';

/**
 * QA full review of v2.20.0 (fc787674705f), documentation stage.
 *
 * - 69cb77382430: the business layer was accepted when its three lists were
 *   merely truthy; an object or a string was stored and the tab crashed on `.map`.
 * - 52487ee4cacc: the layer was put into local state before the write, so a
 *   refused write still showed as done.
 * - 0f6472d80f3f: the write did not check that the run and the documentation it
 *   was written from were still the project's.
 * - 131d46bc4ffd: a failed load was shown as an empty stage.
 *
 * Pure: the first half runs the check itself, the second reads the page source
 * for the order of operations a browser test could only reach by making a
 * Firestore transaction fail on cue.
 */

const PAGE = path.join(process.cwd(), 'app/(app)/project/[projectId]/documentation/page.tsx');
const page = () => fs.readFileSync(PAGE, 'utf8');

const good = {
  raci_matrix: [{ stepId: 'Task_1', r: 'Master Data Steward', a: 'Process Owner', c: 'Compliance', i: 'Finance' }],
  sop_details: [{ stepId: 'Task_1', narrative: 'The steward checks.', businessException: 'Escalate.', kpiTarget: '< 1 day' }],
  audit_controls: [{ stepId: 'Task_1', controlObjective: 'Accuracy', mitigationAction: 'Four eyes', assertionMethod: 'Review' }],
};

test('a complete business layer passes the check', () => {
  expect(checkBusinessDocShape(good)).toEqual({ ok: true, problems: [] });
  expect(checkBusinessDocShape({ raci_matrix: [], sop_details: [], audit_controls: [] }).ok).toBe(true);
});

test('a truthy non-list in any of the three lists is refused (69cb77382430)', () => {
  for (const list of ['raci_matrix', 'sop_details', 'audit_controls'] as const) {
    for (const bad of [{ stepId: 'x' }, 'see above', 1, true]) {
      const check = checkBusinessDocShape({ ...good, [list]: bad });
      expect(check.ok, `${list} = ${JSON.stringify(bad)}`).toBe(false);
      expect(check.problems.join(' ')).toContain(list);
    }
  }
  for (const list of ['raci_matrix', 'sop_details'] as const) {
    const { [list]: _dropped, ...rest } = good;
    void _dropped;
    expect(checkBusinessDocShape(rest).ok, `${list} missing`).toBe(false);
  }
});

test('a layer without control checkpoints is the current form (roadmap 3.0.7: the prompt no longer asks for them)', () => {
  const { audit_controls: _controls, ...current } = good;
  void _controls;
  expect(checkBusinessDocShape(current)).toEqual({ ok: true, problems: [] });
  const prompt = page().slice(page().indexOf('async function runBusinessGeneration'), page().indexOf('const generateBusinessDocumentation'));
  for (const gone of ['"kpiTarget"', '"audit_controls"', '"controlObjective"', '"assertionMethod"']) {
    expect(prompt, `the prompt still asks for ${gone}`).not.toContain(gone);
  }
  expect(prompt).toContain('Do NOT propose KPI targets, control objectives, audit controls or verification methods');
});

test('entries and rendered fields that React cannot draw are refused', () => {
  expect(checkBusinessDocShape({ ...good, raci_matrix: [null] }).ok).toBe(false);
  expect(checkBusinessDocShape({ ...good, sop_details: ['text'] }).ok).toBe(false);
  expect(checkBusinessDocShape({ ...good, raci_matrix: [{ stepId: 'T', r: { role: 'x' } }] }).ok).toBe(false);
  expect(checkBusinessDocShape({ ...good, audit_controls: [{ stepId: 'T', controlObjective: ['a'] }] }).ok).toBe(false);
  // Absent fields are fine: the page prints a placeholder or nothing.
  expect(checkBusinessDocShape({ ...good, raci_matrix: [{ stepId: 'T' }] }).ok).toBe(true);
  expect(checkBusinessDocShape('{"raci_matrix": []}').ok).toBe(false);
  expect(checkBusinessDocShape(null).ok).toBe(false);
});

test('the page gates both the generation and the stored layer on the shape check', () => {
  const src = page();
  const gen = src.slice(src.indexOf('async function runBusinessGeneration'), src.indexOf('const signedSource = useMemo'));
  expect(gen).toContain('checkBusinessDocShape(extractJSON(responseText))');
  expect(gen, 'the old truthiness check is back').not.toContain('!parsed.raci_matrix');
  const stored = src.slice(src.indexOf('const parsedBusinessDoc = useMemo'), src.indexOf('async function runBusinessGeneration'));
  expect(stored).toContain('checkBusinessDocShape(parsed)');
});

test('the business layer is shown only after the transaction stored it (52487ee4cacc)', () => {
  const src = page();
  const gen = src.slice(src.indexOf('async function runBusinessGeneration'), src.indexOf('const signedSource = useMemo'));
  const transaction = gen.indexOf('await runTransaction(');
  // What is shown is what the transaction returned: this answer, or a layer another writer stored first.
  const shown = gen.indexOf('setBusinessDocumentation(storedLayer)');
  expect(gen).toContain('const storedLayer = updatedCode.kept ?? responseText;');
  expect(transaction).toBeGreaterThan(-1);
  expect(shown).toBeGreaterThan(transaction);
  expect(gen.split('setBusinessDocumentation(').length - 1).toBe(1);
});

test('the business layer is written only while the run and the documentation are unchanged (0f6472d80f3f)', () => {
  const src = page();
  const gen = src.slice(src.indexOf('async function runBusinessGeneration'), src.indexOf('const signedSource = useMemo'));
  const body = gen.slice(gen.indexOf('await runTransaction('), gen.indexOf('tx.update('));
  expect(body).toMatch(/current\.activeRunId !== writtenFromRun/);
  expect(body).toMatch(/current\.documentation !== writtenFromDocumentation/);
  expect(body).toContain('throw new Error(');
  // Captured before the model call, not re-read after it.
  expect(gen.indexOf('const writtenFromRun = project.activeRunId')).toBeGreaterThan(-1);
  expect(gen.indexOf('const writtenFromDocumentation = documentation')).toBeGreaterThan(-1);
});

test('a failed project load is said, not shown as an empty stage (131d46bc4ffd)', () => {
  const src = page();
  const load = src.slice(src.indexOf('const fetchProject = async'), src.indexOf('fetchProject();'));
  const caught = load.slice(load.indexOf('} catch (err)'), load.indexOf('} finally'));
  expect(caught).toContain('setLoadError(');
  expect(src).toMatch(/if \(loadError\) return \(/);
  expect(src).toContain('data-load-error');
});

test('replacing the documentation drops the business layer written from the old one (QA full review 96b39ec78c97)', () => {
  const src = page();
  const start = src.indexOf('const generateDocumentation = useCallback');
  expect(start, 'the documentation generator').toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf('}, [projectId, project, signedSource', start));
  // One write: the new document, and the layer that described the old one cleared.
  expect(body).toContain("tx.update(projectDoc, { documentation: stored, status: 'documented', businessDocumentation: '', ...cleanup })");
  // …and a layer file an earlier build merged into the package goes too
  // (roadmap 3.0.7: the stage writes no package; Delivery writes the file).
  expect(body).toContain('const cleanup = packageCleanup(current.generatedCode);');
  expect(src).toContain('DOCUMENTATION_PACKAGE_FILES.includes(');
  // …and from the screen, after the write went through.
  expect(body.indexOf("setBusinessDocumentation('')")).toBeGreaterThan(body.indexOf('await runTransaction'));
});
