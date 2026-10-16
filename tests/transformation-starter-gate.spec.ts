import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { abapCheck } from '../lib/transformation/abap-check';
import { cdsCompileCandidate } from '../lib/transformation/cds-compile';
import { prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { NO_ENTRY_POINT } from '../lib/transformation/types';
import { STARTER_EXAMPLES } from '../lib/starter-examples';

/**
 * Acceptance criterion (13) of roadmap 3.0.17 (owner 16.10.2026): the checks of A run in CI on the cases the
 * repository holds. The seven acceptance programs of `scripts/acceptance/programs.json` are read from the owner's
 * machine, so on CI `tests/transformation-contract-gaps.spec.ts` checks only the PO demo and skips the rest; this
 * spec runs the same gate on every shipped starter example, on both routes, before any model fill:
 *   - the engine prepares the package (no refusal),
 *   - RAP: the scaffold is activatable for abaplint (no syntax or parser finding),
 *   - Node: `tsc` ran and found nothing — "not run" fails, as in criterion (2),
 *   - CAP: the shell compiles with no error,
 *   - criterion (4), the part the engine owns: every unit the model fills is anchored to lines of the original.
 * Server-free.
 */

const ROOT = path.resolve(__dirname, '..');

function prep(source: string, track: 'node' | 'rap'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(`${track}: ${p.reason}`);
  return p;
}

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

test.describe('every shipped starter example: the package is gate-clean before any fill', () => {
  test('the list is the registry — nine examples, each file present', () => {
    expect(STARTER_EXAMPLES.length).toBeGreaterThanOrEqual(9);
    for (const e of STARTER_EXAMPLES) expect(fs.existsSync(path.join(ROOT, 'public', 'starter-examples', e.file)), e.file).toBe(true);
  });

  for (const example of STARTER_EXAMPLES) {
    test(`${example.file}: RAP activatable, Node type-clean, CAP shell compiles, every unit anchored`, () => {
      test.setTimeout(120_000);
      const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', example.file), 'utf8');
      const lineCount = source.split(/\r?\n/).length;

      const rap = prep(source, 'rap');
      const abap = abapCheck(rap.scaffold.files);
      expect(abap.ran, abap.ran ? '' : abap.reason).toBe(true);
      if (abap.ran) {
        expect(abap.activation.activatable, JSON.stringify(abap.findings.filter((f) => f.kind === 'syntax' || f.kind === 'parser').slice(0, 5))).toBe(true);
      }

      const node = prep(source, 'node');
      expect(typeErrors(typeCheckCandidate(node.scaffold.files))).toEqual([]);
      const cds = cdsCompileCandidate(node.scaffold.files);
      expect(cds.ran, cds.ran ? '' : cds.reason).toBe(true);
      if (cds.ran) expect(cds.findings.filter((f) => f.severity === 'Error'), JSON.stringify(cds.findings.slice(0, 5))).toEqual([]);

      // No exception: a source with no entry point (Z_ORDER_INTEGRITY_CHECK) has its orchestrator written by the
      // engine, so no model-filled unit is without lines of the original (roadmap 3.0.17 item 6, scaffold 15).
      for (const p of [rap, node]) {
        for (const u of p.fillUnits) {
          const ranges = u.abap.ranges;
          expect(ranges.length, `${u.unitId} has no line of the original`).toBeGreaterThan(0);
          for (const r of ranges) {
            expect(r.lineStart >= 1 && r.lineEnd >= r.lineStart && r.lineEnd <= lineCount, `${u.unitId} L${r.lineStart}-${r.lineEnd} of ${lineCount}`).toBe(true);
          }
        }
      }
    });
  }

  test('a source with no entry point: the engine writes the process body and says why, the model is not asked', () => {
    const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', 'Z_ORDER_INTEGRITY_CHECK.txt'), 'utf8');
    for (const track of ['rap', 'node'] as const) {
      const p = prep(source, track);
      expect(p.fillUnits.map((u) => u.unitId), track).not.toContain('U00');
      expect(p.scaffold.regions.map((r) => r.regionId), track).not.toContain('U00');
      const body = p.scaffold.files.map((f) => f.content).join('\n');
      expect(body, track).toContain(NO_ENTRY_POINT[0]);
    }
  });
});
