/**
 * Owner decisions of 21.10.2026: fit to standard and the rules workshop view
 * are removed from 3.0.20 again. Fit to standard waits for SAP's scope items,
 * capabilities and best-practice processes in machine-readable form
 * (`docs/design/fit-to-standard-concept.md` stays as the plan); the workshop
 * view "puts people off".
 *
 * What these checks hold: a confirmed "Move to SAP standard" decision reads
 * the phases as v3.0.19 did (no phase state *not applicable*), the model has
 * no fit-proposal answer shape, no project API route or component folder of
 * the module is left, the Business view offers no fit-to-standard card and the
 * process-states read has no history mode. The "Move to SAP standard" rule
 * answer stays (`tests/rule-decision-flow.spec.ts`). Server-free.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { workflowSteps, workflowSummary } from '../lib/workflow-steps';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { SELF_DECLARATION } from '../lib/project-decision';
import { RESPONSE_SHAPES } from '../lib/model-response-schema';
import { sha256Hex } from '../lib/artefact-digest';
import type { Project } from '../lib/types';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const RUN_ID = 'run-1';
const SOURCE = "REPORT z_std.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\nWRITE / 'x'.";
const SHA = sha256Hex(SOURCE);

const draftFacts = (architecture: string): DecisionDraftFacts => ({
  runId: RUN_ID,
  evidenceDigest: 'd'.repeat(64),
  runSignedAt: '2026-10-01T08:00:00.000Z',
  contract: null,
  signedOffArchitecture: architecture,
  signOff: { by: 'owner@example.invalid', at: '2026-10-02T08:00:00.000Z', reason: 'The standard covers it.', notCurrent: null },
  need: { revision: 1, confirmedDrops: 0, undecided: 0 },
  handedOver: false,
  stored: undefined,
  now: '2026-10-03T10:00:00.000Z',
});

const project = (architecture: string): Project =>
  ({
    id: 'p1',
    name: 'Z_STD',
    legacyCode: SOURCE,
    activeRunId: RUN_ID,
    cleanCoreScore: 72,
    auditMetadata: { inputFingerprint: { sha256: SHA, fileName: 'z_std.abap', lineCount: 3 } },
    decision: {
      ...deriveDecisionDraft(draftFacts(architecture)).draft,
      status: 'confirmed',
      confirmation: { account: 'owner@example.invalid', at: '2026-10-03T11:00:00.000Z', selfDeclaration: SELF_DECLARATION },
    },
  }) as unknown as Project;

test('a confirmed "Move to SAP standard" reads the seven phases as v3.0.19 did — none is "not applicable"', () => {
  const standard = workflowSteps(project('standard'));
  const other = workflowSteps(project('cap'));
  expect(standard.map((s) => s.key)).toEqual(other.map((s) => s.key));
  for (const s of standard) expect(String(s.state), s.key).not.toBe('not-applicable');
  expect(workflowSummary(standard).total).toBe(7);
  expect(workflowSummary(standard)).not.toHaveProperty('notApplicable');
});

test('the model has no fit-proposal answer shape', () => {
  expect(RESPONSE_SHAPES).toEqual(['transformation-fill', 'documentation-business', 'plain-wording']);
});

test('no route, component folder or Business-view card of the module is left', () => {
  expect(fs.existsSync(path.join(ROOT, 'app', 'api', 'projects', '[projectId]', 'fit-to-standard'))).toBe(false);
  expect(fs.existsSync(path.join(ROOT, 'components', 'fit'))).toBe(false);
  const shell = read('components/workspace/WorkspaceShell.tsx');
  const process = read('components/workspace/WorkspaceProcess.tsx');
  const design = read('app/(app)/project/[projectId]/design/page.tsx');
  for (const text of [shell, process, design]) expect(text).not.toMatch(/fit-to-standard|FitToStandard|FitMap/);
});

test('the process-states read has no history mode', () => {
  const route = read('app/api/projects/[projectId]/process-states/route.ts');
  expect(route).not.toMatch(/searchParams\.get\('history'\)/);
});
