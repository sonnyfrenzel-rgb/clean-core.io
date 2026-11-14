import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { docProposalsCostLine } from '../lib/messages/documentation';

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
