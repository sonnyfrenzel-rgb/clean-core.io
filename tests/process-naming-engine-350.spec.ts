import { expect, test } from './helpers/test';
import { namingContextOf } from '../lib/process-naming';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { ENGINE_READS_350_FROM } from '../lib/abap/engine-reads-350-gate';

/**
 * A stored naming keeps applying to the map it was made for (hand-off of the engine-quality work, 06.11.2026): the
 * naming context reads the skeleton of the run's engine, so after the 3.5.0 bump an old project's naming — digest
 * made on the 3.0.21 map — still matches the 3.0.21 map the export draws for it. A minimal program written for this
 * spec: an arm that only sets a flag a later decision reads, which 3.5.0 draws as a step and 3.0.21 does not.
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
  const now = namingContextOf(SRC, { engineVersion: ENGINE_READS_350_FROM });
  // A 3.0.x hotfix reads the released map, so its digest is the 3.0.21 one.
  expect(hotfix.digest).toBe(old.digest);
  // The context's skeleton is the map of that engine, node for node.
  expect(old.skeleton.nodes.map((n) => n.id)).toEqual(buildProcessSkeleton(SRC, { engineVersion: '3.0.21' }).nodes.map((n) => n.id));
  expect(now.skeleton.nodes.map((n) => n.id)).toEqual(buildProcessSkeleton(SRC, { engineVersion: ENGINE_READS_350_FROM }).nodes.map((n) => n.id));
});

test('where 3.5.0 draws another map, its digest differs — so a naming is never applied to a map it was not made for', () => {
  const old = namingContextOf(SRC, { engineVersion: '3.0.21' });
  const now = namingContextOf(SRC, { engineVersion: ENGINE_READS_350_FROM });
  expect(now.digest).not.toBe(old.digest);
});
