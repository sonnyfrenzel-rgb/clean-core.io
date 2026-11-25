import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { docProposalsCostLine } from '../lib/messages/documentation';
import { STARTER_BADGE_RAN_BEFORE, starterStartLabel } from '../lib/run-cost';

/**
 * Release 3.1.0, QA review of the release candidate (second slice): the UI-side defects confirmed there, each held
 * server-free — by its pure helper or, for a page, an effect or a route, by its source.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test('Analyze lets only the newest project read land, so a pre-run answer cannot replace the signed result', () => {
  const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
  const start = page.indexOf('const fetchProject = async () => {');
  const end = page.indexOf('}, [projectId, searchParams, startInFlight]);');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const effect = page.slice(page.lastIndexOf('useEffect(() => {', start), end);
  expect(effect).toMatch(/const hydratedProject = await loadProjectAndHydrate\(projectId as string\);\n\s*if \(!current\) return;/);
  expect(effect).toMatch(/return \(\) => \{\n\s*current = false;\n\s*\};\s*$/);
});

test('the Documentation card names the two calls of the business sentences when the deployment rewords them', () => {
  const plain = docProposalsCostLine(undefined, false);
  const reworded = docProposalsCostLine(undefined, false, true);
  expect(plain).not.toContain('two calls');
  expect(reworded).toContain('The business sentences take two calls: a draft, then their wording for a business reader.');
  expect(docProposalsCostLine('gemini-x', true, true)).toMatch(/^One model call per proposal \(gemini-x, with your own Gemini key\)\. The business sentences take two calls/);
  // The card is the only cost line beside the sentences' button there, so the page hands it the deployment's answer.
  const page = read('app/(app)/project/[projectId]/documentation/page.tsx');
  expect(page).toContain("docProposalsCostLine(modelAvailability.stageModels.documentation, modelAvailability.keySource === 'byok', modelAvailability.statementsRewording)");
  expect(page).toContain('<StatementProposalPanel {...statementPanelProps} costLine={false} />');
});

test('the recommended home example says in its accessible name that it ran before, keeping its visible text', () => {
  const visible = 'Start this example';
  expect(starterStartLabel({ starterExamplesUsed: {} }, 'ZDEMO', visible)).toBe(visible);
  expect(starterStartLabel({ starterExamplesUsed: { ZDEMO: true } }, 'ZDEMO', visible)).toBe(`${visible} (${STARTER_BADGE_RAN_BEFORE})`);
  const src = read('components/StarterExamples.tsx');
  const button = src.slice(src.indexOf('onClick={() => start(startHere)}'), src.indexOf('data-home-start-example=""'));
  expect(button).toContain("aria-label={starterStartLabel(account, rec.name, wt('home.startExample'))}");
});

test('a failure of an earlier own-list subscription does not pass the workspace loading gate', () => {
  // Since 3.2.0 (AB-14b) the own rows are read from `/api/workspace-rows`, not a listener: the read that starts for an
  // account clears an earlier failure first, and only a failed read of its own sets it again.
  const src = read('components/workspace/WorkspaceListReport.tsx');
  const effect = src.slice(src.indexOf('// Read on arrival, and again whenever the page comes back into view'), src.indexOf('}, [user, refresh]);'));
  const reset = effect.indexOf('setOwnFailedFor(null);');
  expect(reset).toBeGreaterThan(0);
  expect(reset).toBeLessThan(effect.indexOf('void refresh(user);'));
  // A failed read of its own: the reader's `failed`, only for the newest request (`ownRowsReader`, played through in
  // tests/workspace-row-flow.spec.ts).
  expect(src).toContain('failed: (uid) => setOwnFailedFor(uid),');
  const flow = read('lib/workspace-row-flow.ts');
  expect(flow.indexOf('apply.failed(uid);')).toBeGreaterThan(flow.indexOf('const res = await request();'));
});

test('the process tour draws the names the main map shows, also while names arrive', () => {
  const src = read('components/workspace/WorkspaceProcess.tsx');
  expect(src).toMatch(/<ProcessTour tour=\{tour\} model=\{shownModel \?\? model\}/);
  expect(src).toMatch(/model=\{shownModel \?\? model\}\n\s*nameArrival=\{arrival\}/);
});

test('customer texts are written only while the project still stands, read again in the write\'s transaction', () => {
  const route = read('app/api/projects/[projectId]/customer-texts/route.ts');
  const post = route.slice(route.indexOf('export async function POST'));
  const tx = post.slice(post.indexOf('db.runTransaction('));
  expect(post.indexOf('db.runTransaction(')).toBeGreaterThan(0);
  const get = tx.indexOf('await tx.get(projectRef)');
  const guard = tx.indexOf('if (!fresh.exists || (fresh.data() || {}).userId !== gate.uid) return false;');
  const set = tx.indexOf('tx.set(projectRef.collection(COLLECTION).doc(DOC)');
  expect(get).toBeGreaterThan(0);
  expect(guard).toBeGreaterThan(get);
  expect(set).toBeGreaterThan(guard);
  expect(post).toContain('if (!written) return notFound();');
  // No write outside the transaction.
  expect(post.match(/\.doc\(DOC\)\.set\(/g)).toBeNull();
});
