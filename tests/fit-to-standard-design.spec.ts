/**
 * Roadmap 3.0.20, step F2 — the engine's fit-to-standard design
 * (`docs/design/fit-to-standard-concept.md` §4.2–§4.3, §8 F2).
 *
 * Acceptance: every anchor copied from the as-is (`anchor !== null` ⇔ basis
 * code); no technical or structural element is `covered` or `gap-open`; class A
 * hook logic is given up (or a key-user gap) with its lines; catalog successors
 * only as E1 candidates; the same source gives a byte-identical design.
 *
 * Server-free.
 */
import { test, expect } from '@playwright/test';
import { readFitToStandard, designFromReading } from '../lib/fit-to-standard-read';
import {
  AGAINST_GATE_SENTENCE,
  buildFitToStandardDesign,
  fitDesignLists,
  fitDesignSummary,
  FIT_DISPOSITIONS,
  FIT_DISPOSITION_LABELS,
  type FitDesignInput,
} from '../lib/fit-to-standard-design';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { readExample } from './helpers/starter-example-files';

const reading = (file: string, edition: 'public' | 'private' = 'public') =>
  readFitToStandard({
    source: readExample(file),
    fileName: file,
    edition,
    catalogSnapshot: catalogSnapshotKeyForProject({ s4Deployment: edition }),
    engineVersion: 'v3.0.19',
    mode: 'demo',
    hasRun: true,
    analyzeState: 'done',
    signedSourceSha256: null,
  });

const CASES: Array<[string, 'public' | 'private', boolean]> = [
  ['Z_SD_DELIVERY_PRIORITY.abap', 'public', false],
  ['Z_MATERIAL_STOCK_CALC.txt', 'public', false],
  ['Z_SALES_ORDER_CREATOR.txt', 'private', false],
  ['Z_SD_FREIGHT_RATE_CHECK.abap', 'public', true],
  ['ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'public', true],
];

test.describe('fit-to-standard design invariants on the shipped examples', () => {
  for (const [file, edition, against] of CASES) {
    test(`${file} (${edition}${against ? ', against the gate' : ''})`, () => {
      const r = reading(file, edition);
      const design = designFromReading(r, against)!;
      expect(design).not.toBeNull();
      const nodes = new Map(r.skeleton.nodes.map((n) => [n.id, n]));
      const deviations = r.findings.filter((f) => ['enhancement', 'hook-implementation', 'modification'].includes(f.kind));
      for (const e of design.entries) {
        // The anchor is copied — from the element, or for an undrawn deviation from its finding.
        expect(e.anchor !== null).toBe(e.anchorBasis === 'code');
        const node = nodes.get(e.elementId);
        if (node) {
          expect(e.anchor).toEqual(node.anchor ? { lineStart: node.anchor.lineStart, lineEnd: node.anchor.lineEnd } : null);
        } else {
          expect(e.kind).toBe('deviation');
          expect(deviations.some((f) => f.lineStart === e.anchor!.lineStart)).toBe(true);
        }
        if (e.comparability === 'technical' || e.comparability === 'structural') {
          expect(e.disposition).toBe('goes-with-program');
        }
        if (e.disposition === 'covered') {
          expect(e.evidenceLevel).toBe('E1');
          expect(e.standardRef?.check).toBe('catalog');
          expect(e.provenance).toBe('reconstructed');
        }
        expect(['E0', 'E1']).toContain(e.evidenceLevel);
      }
      // Same source, same design, byte for byte.
      expect(JSON.stringify(designFromReading(reading(file, edition), against))).toBe(JSON.stringify(design));
      expect(design.againstGate?.sentence ?? null).toBe(against ? AGAINST_GATE_SENTENCE : null);
    });
  }

  test('Z_SD_DELIVERY_PRIORITY: the BAdI implementation at L49–L81 is the deviation, kept as a key-user gap (Custom Logic)', () => {
    const design = designFromReading(reading('Z_SD_DELIVERY_PRIORITY.abap'), false)!;
    const hook = design.entries.find((e) => e.gateClass === 'A')!;
    expect(hook.anchor).toEqual({ lineStart: 49, lineEnd: 81 });
    expect(hook.disposition).toBe('gap-key-user');
    expect(hook.standardRef).toMatchObject({ kind: 'key-user-tool', title: 'Custom Logic' });
    expect(hook.why).toContain('L49–L81');
    const covered = design.entries.find((e) => e.disposition === 'covered')!;
    expect(covered.standardRef).toMatchObject({ id: 'API_SALES_ORDER_SRV', check: 'catalog' });
    expect(covered.why).toContain('a candidate, to verify');
  });

  test('a program the gate does not offer gets no design unless asked for against the gate', () => {
    expect(designFromReading(reading('Z_SD_FREIGHT_RATE_CHECK.abap'), false)).toBeNull();
  });
});

const INPUT: FitDesignInput = {
  gate: {
    outcome: 'offered',
    classes: ['A'],
    primary: 'A',
    strength: 'strong',
    edition: 'public',
    editionAssumed: false,
    signals: [],
    sentence: '',
    editionNote: null,
  },
  requestedAgainstGate: false,
  edition: 'public',
  elements: [
    { id: 'hook', kind: 'business-rule-task', label: 'CHECK_PRICE', anchor: { lineStart: 12, lineEnd: 12 }, comparability: 'business-comparable', mayCarryCandidate: true },
    { id: 'read', kind: 'read', label: 'VBAK', anchor: { lineStart: 30, lineEnd: 30 }, comparability: 'technical', mayCarryCandidate: false },
    { id: 'end', kind: 'end', label: 'END', anchor: null, comparability: 'structural', mayCarryCandidate: false },
    { id: 'step', kind: 'sub-process', label: 'LOAD', anchor: { lineStart: 40, lineEnd: 40 }, comparability: 'business-comparable', mayCarryCandidate: true, routine: { lineStart: 50, lineEnd: 60 } },
    { id: 'cfg', kind: 'task', label: 'X', anchor: { lineStart: 70, lineEnd: 70 }, comparability: 'business-comparable', mayCarryCandidate: true },
    { id: 'open', kind: 'task', label: 'Y', anchor: { lineStart: 80, lineEnd: 80 }, comparability: 'business-comparable', mayCarryCandidate: true },
    { id: 'opaque', kind: 'call-opaque', label: 'Z', anchor: { lineStart: 90, lineEnd: 90 }, comparability: 'unknown', mayCarryCandidate: false },
  ],
  findings: [
    { kind: 'enhancement', lineStart: 10, lineEnd: 20 },
    { kind: 'standard-table-read', lineStart: 55, objectName: 'MARA' },
  ],
  objects: [{ name: 'MARA', path: 'successor', called: false, line: 55 }],
  successors: new Map([['MARA', 'I_Product']]),
  customizing: [{ ruleId: 'BR-004', lineStart: 70 }],
};

test.describe('fit-to-standard design rules', () => {
  test('each disposition from its rule', () => {
    const d = buildFitToStandardDesign(INPUT)!;
    const of = (id: string) => d.entries.find((e) => e.elementId === id)!;
    expect(of('hook')).toMatchObject({ disposition: 'given-up', gateClass: 'A' });
    expect(of('read').disposition).toBe('goes-with-program');
    expect(of('end')).toMatchObject({ disposition: 'goes-with-program', anchor: null, anchorBasis: 'unanchored' });
    // The routine's read is what the step does; the anchor stays the call's.
    expect(of('step')).toMatchObject({ disposition: 'covered', evidenceLevel: 'E1', anchor: { lineStart: 40, lineEnd: 40 } });
    expect(of('step').standardRef).toMatchObject({ kind: 'cds-view', id: 'I_Product', check: 'catalog', title: null });
    expect(of('cfg').disposition).toBe('configuration');
    expect(of('open').disposition).toBe('gap-open');
    expect(of('opaque').disposition).toBe('unknown');
    expect(d.counts).toMatchObject({ givenUp: 1, covered: 1, configuration: 1, gapOpen: 1, goesWithProgram: 2, unknown: 1 });
    expect(fitDesignSummary(d.counts)).toBe('1 given up, 1 gap (0 key user, 0 organisational, 1 open)');
    const lists = fitDesignLists(d);
    expect(lists.givenUp.map((e) => e.elementId)).toEqual(['hook']);
    expect(lists.standardDoes.map((e) => e.elementId)).toEqual(['step', 'cfg']);
    // A step the engine cannot read is a gap nobody resolved (QA review of 4ea0324a13cb, 357cd43a6983).
    expect(lists.gaps.map((e) => e.elementId)).toEqual(['open', 'opaque']);
  });

  test('a key-user candidate on the deviation\'s lines makes it a key-user gap', () => {
    const d = buildFitToStandardDesign({ ...INPUT, keyUser: [{ id: 'KU-1', app: 'Custom Logic', replaced: [{ lineStart: 11, lineEnd: 19 }] }] })!;
    expect(d.entries.find((e) => e.elementId === 'hook')).toMatchObject({ disposition: 'gap-key-user', standardRef: { id: 'KU-1', title: 'Custom Logic' } });
  });

  test('a deviation the skeleton does not draw gets its own entry on the finding\'s lines', () => {
    const d = buildFitToStandardDesign({ ...INPUT, findings: [...INPUT.findings, { kind: 'hook-implementation', lineStart: 100, lineEnd: 120, objectName: 'IF_BADI~CHECK' }] })!;
    expect(d.entries.find((e) => e.elementId === 'deviation-L100')).toMatchObject({
      kind: 'deviation',
      anchor: { lineStart: 100, lineEnd: 120 },
      anchorBasis: 'code',
      disposition: 'given-up',
      plainLabel: 'BAdI or exit implementation IF_BADI~CHECK',
    });
  });

  test('not determined gives no design; not offered gives one only on request, marked against the gate', () => {
    expect(buildFitToStandardDesign({ ...INPUT, gate: { outcome: 'not-determined', missing: 'no-run', reason: 'x', signals: [] } })).toBeNull();
    const notOffered = { outcome: 'not-offered' as const, exclusion: 'integration' as const, reason: 'Integration.', signals: [] };
    expect(buildFitToStandardDesign({ ...INPUT, gate: notOffered })).toBeNull();
    const d = buildFitToStandardDesign({ ...INPUT, gate: notOffered, requestedAgainstGate: true })!;
    expect(d.againstGate).toEqual({ sentence: AGAINST_GATE_SENTENCE, gateReason: 'Integration.' });
    expect(d.gateClasses).toEqual([]);
    // Without a gate class nothing is given up by the gate's reading; the business steps stay open.
    expect(d.entries.find((e) => e.elementId === 'hook')!.disposition).toBe('gap-open');
  });

  test('every disposition has a label and a mark — never colour only', () => {
    for (const d of FIT_DISPOSITIONS) {
      expect(FIT_DISPOSITION_LABELS[d].label.length).toBeGreaterThan(3);
      expect(FIT_DISPOSITION_LABELS[d].mark.length).toBeGreaterThan(0);
    }
    expect(new Set(FIT_DISPOSITIONS.map((d) => FIT_DISPOSITION_LABELS[d].mark)).size).toBe(FIT_DISPOSITIONS.length);
  });
});
