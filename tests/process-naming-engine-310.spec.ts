import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import {
  NAMING_FORMAT_VERSION,
  NAMING_MADE_FROM_FACTS,
  applyNaming,
  namingContextOf,
  validateNamingAnswer,
  type ProcessNamingRecord,
} from '../lib/process-naming';
import { aiNamesOfNaming, buildReadingExports } from '../lib/bpmn/export';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';

/**
 * A stored naming keeps applying to the map it was made for (hand-off of the engine-quality work, 06.11.2026): the
 * naming context reads the skeleton of the run's engine, so after the 3.1.0 bump an old project's naming — digest
 * made on the 3.0.21 map — still matches the 3.0.21 map the export draws for it. A minimal program written for this
 * spec: an arm that only sets a flag a later decision reads, which 3.1.0 draws as a step and 3.0.21 does not.
 */

const SRC = [
  'REPORT zt_flag.',
  'DATA: gv_approved TYPE abap_bool, gv_amount TYPE p DECIMALS 2.',
  'PARAMETERS p_amount TYPE p DECIMALS 2.',
  'START-OF-SELECTION.',
  '  gv_amount = p_amount.',
  '  IF gv_amount < 1000.',
  '    gv_approved = abap_true.',
  '  ELSE.',
  "    WRITE / 'needs approval'.",
  '  ENDIF.',
  '  IF gv_approved = abap_true.',
  "    WRITE / 'approved'.",
  '  ENDIF.',
].join('\n');

test('the naming context is read for the engine it is given: the 3.0.21 digest stays the 3.0.21 digest', () => {
  const old = namingContextOf(SRC, { engineVersion: '3.0.21' });
  const hotfix = namingContextOf(SRC, { engineVersion: '3.0.22' });
  const now = namingContextOf(SRC, { engineVersion: ENGINE_READS_310_FROM });
  // A 3.0.x hotfix reads the released map, so its digest is the 3.0.21 one.
  expect(hotfix.digest).toBe(old.digest);
  // The context's skeleton is the map of that engine, node for node.
  expect(old.skeleton.nodes.map((n) => n.id)).toEqual(buildProcessSkeleton(SRC, { engineVersion: '3.0.21' }).nodes.map((n) => n.id));
  expect(now.skeleton.nodes.map((n) => n.id)).toEqual(buildProcessSkeleton(SRC, { engineVersion: ENGINE_READS_310_FROM }).nodes.map((n) => n.id));
});

test('where 3.1.0 draws another map, its digest differs — so a naming is never applied to a map it was not made for', () => {
  const old = namingContextOf(SRC, { engineVersion: '3.0.21' });
  const now = namingContextOf(SRC, { engineVersion: ENGINE_READS_310_FROM });
  expect(now.digest).not.toBe(old.digest);
});

/** Every place that builds the naming context for a stored project reads it for the project's engine (source guard). */
test('the live map, the automatic naming and the naming route read the naming context for the project\'s engine', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', ...p.split('/')), 'utf8');
  const map = read('hooks/useProcessMap.ts');
  expect(map).toMatch(/namingContextOf\(source, engineVersion \? \{ engineVersion \} : \{\}\)/);
  expect(map).toMatch(/exporterVersion: engineVersion/);
  expect(read('hooks/useAutoProcessNaming.ts')).toMatch(/namingContextOf\(src, engineVersion \? \{ engineVersion \} : \{\}\)/);
  const route = read('app/api/projects/[projectId]/process-naming/route.ts');
  expect(route).toMatch(/engineVersion: engineVersionOfProject\(project\)/);
  expect(route).toMatch(/namingContextOf\(gate\.legacyCode, gate\.engineVersion \? \{ engineVersion: gate\.engineVersion \} : \{\}\)/);
  const workspace = read('components/workspace/WorkspaceProcess.tsx');
  expect(workspace.match(/engineVersion: engineVersionOfProject\(project\)/g)?.length).toBe(2);
  expect(read('app/(app)/project/[projectId]/documentation/page.tsx')).toMatch(/modelAvailability,\s+\{ engineVersion: engineVersionOfProject\(project\) \},/);
});

test('an old project\'s stored naming keeps applying: the context of its engine has the digest the naming was made with', () => {
  // What the 3.0.21 route stored is the digest of the 3.0.21 map; the live map of that project now reads that map.
  const stored = namingContextOf(SRC, { engineVersion: '3.0.21' }).digest;
  const live = namingContextOf(SRC, { engineVersion: '3.0.21' });
  expect(live.digest).toBe(stored);
  expect(namingContextOf(SRC, { engineVersion: ENGINE_READS_310_FROM }).digest).not.toBe(stored);
});

/**
 * A naming as the route stores it for the 3.1.0 reading: one name in the model's own words ("Mark approved", where
 * the engine says "Mark as approved"), citing the step's facts, validated against that reading; its digest; its origin.
 */
function storedNaming(): ProcessNamingRecord {
  const context = namingContextOf(SRC, { engineVersion: ENGINE_READS_310_FROM });
  const step = context.skeleton.nodes.find((n) => (context.facts?.get(n.id) ?? []).some((f) => f.kind === 'engine' && f.text === 'Mark as approved'));
  if (!step) throw new Error('the fixture has no "Mark as approved" step');
  const facts = (context.facts?.get(step.id) ?? []).map((f) => f.id);
  const validated = validateNamingAnswer(context, JSON.stringify({ names: [{ id: step.id, name: 'Mark approved', facts }], lanes: [] }));
  return {
    formatVersion: NAMING_FORMAT_VERSION,
    digest: context.digest,
    names: validated.names,
    lanes: validated.lanes,
    discarded: validated.discarded,
    origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-fixture', byok: false, issuedAt: Date.parse('2026-11-10T09:00:00.000Z'), textSha256: 'a'.repeat(64) },
    namedAt: '2026-11-10T09:00:05.000Z',
    madeFrom: NAMING_MADE_FROM_FACTS,
  };
}

test('a stored naming is applied by the map and the export of the engine it was made for, and by no other', () => {
  const record = storedNaming();
  expect(record.names.map((n) => n.name), 'the fixture names nothing').toEqual(['Mark approved']);
  const now = namingContextOf(SRC, { engineVersion: ENGINE_READS_310_FROM });
  const old = namingContextOf(SRC, { engineVersion: '3.0.21' });

  // The map (`hooks/useProcessMap.ts` and the export both read `applyNaming`).
  const live = applyNaming(now, record);
  expect(live.state).toBe('named');
  expect(live.counts.named).toBe(record.names.length);
  const other = applyNaming(old, record);
  expect(other.state, 'a naming made for the 3.1.0 map was applied to the 3.0.21 map').not.toBe('named');
  expect(other.nodes.every((n) => n.businessName === null)).toBe(true);

  // The export's names: on the matching map only.
  const names = aiNamesOfNaming(now, record);
  expect(Object.values(names?.names ?? {})).toEqual(['Mark approved']);
  expect(names?.authorship.modelId).toBe('gemini-fixture');
  expect(aiNamesOfNaming(old, record)).toBeUndefined();

  // And through the file a reader downloads: the model-written names are marked in the 3.1.0 file, and the
  // 3.0.21 file carries none.
  const opts = { processName: 'Flag', sourceFileName: 'ZT_FLAG.abap', naming: record };
  const mark = /<cc:origin value="ai" ai_provider="[^"]*" ai_model="gemini-fixture"/g;
  const file = buildReadingExports(SRC, { ...opts, exporterVersion: ENGINE_READS_310_FROM }).bpmn.xml;
  expect(file.match(mark)?.length ?? 0).toBeGreaterThan(0);
  expect(file).toContain('Mark approved');
  expect(buildReadingExports(SRC, { ...opts, exporterVersion: '3.0.21' }).bpmn.xml).not.toContain('gemini-fixture');
});
