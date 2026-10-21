import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deriveEngineCasesOf, engineCaseProvenance } from '../lib/engine-case-provenance';
import { engineCasesFile } from '../lib/testing-engine-cases';
import { testFactsOf } from '../lib/delivery-facts';
import { sha256Hex } from '../lib/artefact-digest';

/**
 * QA review of 56bd195dc92d — the engine-case provenance (server-free).
 *   663172392dc6  a stored engine case duplicated by id is not counted or exported as derived twice;
 *   e04537f4bb66,
 *   0297134b3b87  engineCasesFile and planEngineRun take only VerifiedEngineCase, which
 *                 engineCaseProvenance alone produces — no other file casts to it.
 */

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = [
  'REPORT zq.',
  'DATA gv_total TYPE p LENGTH 8 DECIMALS 2.',
  'PARAMETERS p_amount TYPE p LENGTH 8 DECIMALS 2.',
  'START-OF-SELECTION.',
  '  IF p_amount > 100.',
  '    MESSAGE e001(zq).',
  '    RETURN.',
  '  ENDIF.',
  '  gv_total = p_amount.',
].join('\n');
const signed = { activeRunId: 'run-1', legacyCode: SOURCE, inputFingerprint: { sha256: sha256Hex(SOURCE) } };
const derived = deriveEngineCasesOf(SOURCE)!;
const stored = () => JSON.parse(JSON.stringify(derived.cases)) as Array<Record<string, unknown>>;

test.describe('663172392dc6 — a duplicated engine case is no second derivation', () => {
  test('the duplicated id is unverified, once; every other case stays verified, once', () => {
    const list = [...stored(), stored()[0]];
    const p = engineCaseProvenance(list, derived);
    const dup = derived.cases[0].id;
    expect(p.unverified).toEqual([dup]);
    expect(p.verified.map((c) => c.id)).toEqual(derived.cases.slice(1).map((c) => c.id));
    // the count of cases past the caps is not said for a list that does not match the derivation
    expect(p.notCovered).toBeNull();
  });

  test('the export names it as unverified and ships no copy of it under cases', () => {
    const p = engineCaseProvenance([...stored(), stored()[0]], derived);
    const file = JSON.parse(engineCasesFile(p.verified, p.unverified)!);
    const ids = file.cases.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(derived.cases[0].id);
    expect(file.unverified.ids).toEqual([derived.cases[0].id]);
  });

  test('STATUS counts both copies as not derived by Clean-Core.io, never twice as derived', () => {
    const list = [...stored(), stored()[0]];
    const text = testFactsOf({ testCases: list, ...signed } as unknown as Parameters<typeof testFactsOf>[0], []).detail.join('\n');
    expect(text).toContain(`2 cases written by the testing model · ${derived.cases.length - 1} derived by Clean-Core.io from the original`);
    // QA 796fe8bcbadd: the sentence counts the two stored entries the line above moved, and names the duplicate as one
    expect(text).toContain(
      `2 stored as engine cases are not reproduced from the signed source and counted as not derived by Clean-Core.io: ${derived.cases[0].id} (stored 2 times; one derivation yields each id once).`,
    );
    const p = engineCaseProvenance(list, derived);
    expect([p.unverified, p.unverifiedEntries, p.duplicates]).toEqual([[derived.cases[0].id], 2, [[derived.cases[0].id, 2]]]);
    // without the duplicate every case counts as derived
    const clean = testFactsOf({ testCases: stored(), ...signed } as unknown as Parameters<typeof testFactsOf>[0], []).detail.join('\n');
    expect(clean).toContain(`0 cases written by the testing model · ${derived.cases.length} derived by Clean-Core.io from the original`);
  });
});

test.describe('e04537f4bb66, 0297134b3b87 — only recomputed cases reach the export and the run plan', () => {
  test('engineCasesFile and planEngineRun are typed to take VerifiedEngineCase only', () => {
    expect(read('lib/testing-engine-cases.ts')).toMatch(/export function engineCasesFile\(cases: readonly VerifiedEngineCase\[\], unverified: readonly string\[\] = \[\]\)/);
    expect(read('lib/engine-case-run.ts')).toMatch(/export function planEngineRun\(\s*verified: readonly VerifiedEngineCase\[\],/);
    // the brand is a symbol nobody outside the provenance can name
    const provenance = read('lib/engine-case-provenance.ts');
    expect(provenance).toContain('declare const VERIFIED_ENGINE_CASE: unique symbol;');
    expect(provenance).not.toMatch(/export\s+(declare\s+)?const VERIFIED_ENGINE_CASE/);
  });

  test('no file but the provenance casts anything to VerifiedEngineCase', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.next', 'tmp', 'scratch', 'dist'].includes(entry.name)) walk(rel);
        } else if (/\.(ts|tsx)$/.test(entry.name) && rel !== 'lib/engine-case-provenance.ts') {
          if (/\bas\s+(unknown\s+as\s+)?(readonly\s+)?VerifiedEngineCase\b/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) offenders.push(rel);
        }
      }
    };
    for (const dir of ['app', 'lib', 'components', 'hooks', 'tests', 'scripts', 'runner']) walk(dir);
    expect(offenders).toEqual([]);
  });

  test('the route plans the engine pass from the provenance, the delivery exports from it', () => {
    const route = read('app/api/run-tests/route.ts');
    expect(route).toMatch(/planEngineRun\(\s*engineCaseProvenance\(/);
    expect(route).toContain('deriveEngineCasesOf(signedSourceOf(projectData as unknown as HandoverProject)?.source ?? null, engineVersionOfProject(projectData))');
    expect(read('app/(app)/project/[projectId]/delivery/page.tsx')).toContain('engineCasesFile(provenance.verified, provenance.unverified)');
  });

  test('a client-written case with the engine markers is not planned: only its recomputed twin is', () => {
    const forged = stored();
    (forged[0] as { engineCase: { examples: Array<{ expected: string }> } }).engineCase.examples[0].expected = 'whatever the client wants';
    const p = engineCaseProvenance(forged, derived);
    const file = JSON.parse(engineCasesFile(p.verified, p.unverified)!);
    expect(JSON.stringify(file.cases)).not.toContain('whatever the client wants');
    expect(file.cases.map((c: { id: string }) => c.id)).not.toContain(derived.cases[0].id);
  });
});
