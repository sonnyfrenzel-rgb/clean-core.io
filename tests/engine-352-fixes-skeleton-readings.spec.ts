import { test, expect } from '@playwright/test';
import { buildProcessSkeleton, type ProcessSkeleton, type SkeletonNode, type SkeletonRegion } from '../lib/abap/process-skeleton';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { readLuwStates } from '../lib/abap/luw-states';
import { buildBusinessStatements } from '../lib/abap/business-statement';
import { collapseSmallRegions } from '../lib/abap/skeleton/collapse';
import type { SkeletonGraph } from '../lib/abap/skeleton/graph';
import { ENGINE_READS_352_FIXES_FROM, engineReads352FixesApply } from '../lib/abap/engine-reads-352-fixes-gate';

/**
 * Engine 3.5.2 (gated by `ENGINE_READS_352_FIXES_FROM`, `lib/abap/engine-reads-352-fixes-gate.ts`): two corrections of the
 * skeleton's reading. Each case is a repro: what engine 3.5.0 reads (and a signed run of it keeps) and what 3.5.2
 * reads. Server-free.
 */
const OLD = 'v3.5.0';
const NEW = 'v3.5.2';

test('the gate opens at 3.5.2 and not before', () => {
  expect(ENGINE_READS_352_FIXES_FROM).toBe('3.5.2');
  expect(engineReads352FixesApply('v3.5.1')).toBe(false);
  expect(engineReads352FixesApply('v3.5.2')).toBe(true);
  expect(engineReads352FixesApply(null)).toBe(false);
});

test.describe('a call site that only turns collapsed re-opens the routine above it', () => {
  // A parent routine P, visited first, calls C and writes; C asks a question and calls itself (a retry), so C folds
  // into a call site that keeps the kind `sub-process`. Only that `collapsed` state changes.
  const graph = (): SkeletonGraph => {
    const region = (key: string, endNodeId: string) => ({ key, kind: 'sub-process', label: key, anchor: null, endNodeId, entryNodeId: null }) as SkeletonRegion;
    const node = (id: string, kind: string, inRegion: string, expandsTo?: string) =>
      ({ id, kind, label: id, region: inRegion, anchor: null, ...(expandsTo ? { expandsTo } : {}) }) as unknown as SkeletonNode;
    return {
      regions: [region('form:P', 'p-end'), region('form:C', 'c-end')],
      nodes: [
        node('call-p', 'sub-process', 'entry:START', 'form:P'),
        node('call-c', 'sub-process', 'form:P', 'form:C'),
        node('write', 'write', 'form:P'),
        node('p-end', 'end', 'form:P'),
        node('ask', 'gateway', 'form:C'),
        node('self', 'sub-process', 'form:C', 'form:C'),
        node('c-end', 'end', 'form:C'),
      ],
    } as unknown as SkeletonGraph;
  };
  const callP = (g: SkeletonGraph) => g.nodes.find((n) => n.id === 'call-p')!;

  test('before 3.5.2 the pass stopped and P stayed a phase around a step', () => {
    const g = graph();
    collapseSmallRegions(g, { reads310: true, reads352Fixes: false });
    expect(g.nodes.find((n) => n.id === 'call-c')!.collapsed).toBe(true);
    expect(callP(g).kind).toBe('sub-process');
    expect(callP(g).collapsed).not.toBe(true);
  });

  test('from 3.5.2 the pass runs again and P folds onto its write', () => {
    const g = graph();
    collapseSmallRegions(g, { reads310: true, reads352Fixes: true });
    expect(callP(g).kind).toBe('write');
    expect(callP(g).collapsed).toBe(true);
  });
});

test.describe('IN PROGRAM is read in the statement, not in its literals', () => {
  const source = `REPORT zupd.
START-OF-SELECTION.
  PERFORM post USING 'IN PROGRAM'.
  COMMIT WORK.

FORM post USING p_note TYPE c.
  CALL FUNCTION 'Z_POST_UPDATE' IN UPDATE TASK
    EXPORTING iv_note = p_note.
ENDFORM.
`;
  const effect = (s: ProcessSkeleton) => s.nodes.filter((n) => n.detail?.effectState).map((n) => [n.label, n.detail?.effectEnd ?? null]);

  test('the unit-of-work reader follows the local PERFORM to its COMMIT WORK from 3.5.2', () => {
    const facts = buildProcessFacts(source);
    expect(readLuwStates(facts).registrations.map((r) => r.unresolved?.state ?? null)).toEqual(['not-determined']);
    expect(readLuwStates(facts, { reads352Fixes: true }).registrations.map((r) => r.unresolved?.state ?? null)).toEqual([null]);
  });

  test('the map and the business statements of 3.5.0 keep their reading; 3.5.2 reads the commit', () => {
    expect(effect(buildProcessSkeleton(source, { engineVersion: OLD }))).toEqual([['Z_POST_UPDATE', 'not-determined']]);
    expect(effect(buildProcessSkeleton(source, { engineVersion: NEW }))).toEqual([['Z_POST_UPDATE', null]]);
    const said = (v: string) => buildBusinessStatements(source, { engineVersion: v }).map((b) => b.text).join(' ');
    expect(said(OLD)).toContain('is not determined');
    expect(said(NEW)).toContain('It is only triggered by the COMMIT WORK in line 4.');
  });

  test('a real IN PROGRAM stays external at every engine', () => {
    const external = source.replace("PERFORM post USING 'IN PROGRAM'.", 'PERFORM post IN PROGRAM zother.');
    for (const reads352Fixes of [false, true]) {
      expect(readLuwStates(buildProcessFacts(external), { reads352Fixes }).registrations.map((r) => r.unresolved?.state ?? null)).toEqual(['not-determined']);
    }
  });
});
