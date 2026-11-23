import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  ENGINE_DIGEST_EXCLUDED,
  ENGINE_ENTRY_POINTS,
  computeEngineDigest,
  computeEngineDigestAt,
  runtimeImports,
} from '../scripts/engine/engine-digest.cjs';
import { frozenFiles, readFrozen, readReleases } from '../scripts/engine/frozen-digests';
import { engineDigestLabel, engineDigestLine, releasesOfDigest } from '../lib/engine-digest';
import { canonicalizeJson, computeRunHash, RUN_SIGNATURE_SCHEME, signRunHashV2, verifyRunIntegrity } from '../lib/run-signature';
import { generateModelCard } from '../lib/audit-pack';
import type { Project } from '../lib/types';

/**
 * Roadmap 3.4.0 item (3), owner decision 22.11.2026: `engineDigest` beside `engineVersion` on the model card and in
 * the signed run, computed at build time from the engine sources, "unreleased build" when it matches no frozen
 * release. Server-free.
 */
const ROOT = path.join(__dirname, '..');

/** The same closure, read by the TypeScript compiler instead of the digest's own scanner. */
function compilerClosure(): string[] {
  const seen = new Set<string>();
  const queue = [...ENGINE_ENTRY_POINTS];
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    else return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (/\.tsx?$/.test(c) && fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile()) return c;
    }
    return null;
  };
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file) || ENGINE_DIGEST_EXCLUDED.includes(file)) continue;
    seen.add(file);
    const sf = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const specs: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const allTypes = clause && !clause.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly);
        if (!clause?.isTypeOnly && !allTypes) specs.push(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
        specs.push(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        specs.push(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const spec of specs) {
      const target = resolve(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}

test('the digest covers exactly the modules the compiler reaches from the three engine entry points', () => {
  const { files } = computeEngineDigest(ROOT);
  expect(files).toEqual(compilerClosure());
  // What it is meant to hold, and what it is meant to leave out.
  for (const f of ['lib/abap/evidence-model.ts', 'lib/abap/extensibility-router.ts', 'lib/abap/code-assessment.ts', 'lib/abap/catalog-service.ts', 'lib/clean-core-score.ts', 'lib/engine4/references.ts']) {
    expect(files).toContain(f);
  }
  expect(files).not.toContain('lib/version.ts');
  expect(files.every((f) => /\.tsx?$/.test(f))).toBe(true);
});

test('the scanner skips type-only imports and comments, and follows every runtime form', () => {
  const text = [
    "import type { A } from './a';",
    "import { type B, type C } from './b';",
    "import { d, type E } from './d';",
    "export { f } from './f';",
    "export type { G } from './g';",
    "import './side';",
    "const h = await import('./h');",
    "// import { i } from './i';",
    "/* import { j } from './j'; */",
    'import {',
    '  k,',
    "} from '@/lib/k';",
  ].join('\n');
  expect(runtimeImports(text).sort()).toEqual(['./d', './f', './h', './side', '@/lib/k'].sort());
});

test('the digest is a SHA-256, stable, and does not depend on the line ends of the checkout', () => {
  const a = computeEngineDigest(ROOT);
  expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
  expect(computeEngineDigest(ROOT).digest).toBe(a.digest);
  // A CRLF copy of the tree hashes the same.
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'engine-digest-'));
  try {
    for (const f of a.files) {
      const to = path.join(tmp, ...f.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r?\n/g, '\r\n'));
    }
    expect(computeEngineDigest(tmp).digest).toBe(a.digest);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('every release fixture and the release registry agree, and every registered release has its fixture', () => {
  const releases = readReleases().releases;
  const fixtures = frozenFiles().map((n) => readFrozen(n));
  for (const f of fixtures) {
    if (f.format === 3) {
      expect(f.engineDigest, `${f.engine}: a format-3 fixture names its engine digest`).toMatch(/^[0-9a-f]{64}$/);
      expect(releases[f.engine]?.digest, `${f.engine}: lib/engine-releases.json holds the fixture's digest`).toBe(f.engineDigest);
    }
  }
  for (const [engine, r] of Object.entries(releases)) {
    expect(r.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(fixtures.some((f) => f.engine === engine), `${engine} has a frozen fixture`).toBe(true);
  }
});

/**
 * One test per release captured after the fact, so a commit one clone lacks skips that release only and never the
 * others (QA 5303a617dcd8). The skip is for a local shallow clone: CI's test jobs check out the full history
 * (`.github/workflows/deploy.yml`, e2e `fetch-depth: 0`, held by `tests/quality-gate-guard.spec.ts`), so under CI a
 * missing commit is a failure, never a silent pass (QA 92721e404824, c8edce86c25e, 1754b7686e51, ae3f17cccba5,
 * b5af81fb7c3f, 0b53bd088269). The fixture-and-registry agreement above needs no history and always runs.
 */
const AFTER_THE_FACT = Object.entries(readReleases().releases).filter(([, r]) => r.how === 'after the fact');

test('at least one release is checked against its commit', () => {
  expect(AFTER_THE_FACT.length).toBeGreaterThan(0);
});

for (const [engine, r] of AFTER_THE_FACT) {
  test(`${engine}, captured after the fact, recomputes from its commit ${r.commit}`, () => {
    let present = true;
    try {
      execFileSync('git', ['cat-file', '-e', `${r.commit}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
    } catch {
      present = false;
    }
    // GitHub Actions sets both; either one means CI, where the skip below can never apply (QA 4ba42a53b0a7).
    const inCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
    test.skip(!present && !inCi, `${r.commit} is not in this local clone (never skipped under CI)`);
    expect(present, `${engine}: ${r.commit} is not in this CI clone, so the release cannot be recomputed — CI test jobs must fetch the full history`).toBe(true);
    expect(computeEngineDigestAt(ROOT, r.commit).digest, engine).toBe(r.digest);
  });
}

test('the label: a release, an unreleased build, or not recorded', () => {
  const [engine, r] = Object.entries(readReleases().releases)[0];
  expect(releasesOfDigest(r.digest)).toContain(engine);
  expect(engineDigestLabel(r.digest)).toBe(`release ${releasesOfDigest(r.digest).join(', ')}`);
  expect(engineDigestLabel('0'.repeat(64))).toBe('unreleased build');
  expect(engineDigestLabel(undefined)).toBe('not recorded');
  expect(engineDigestLine('0'.repeat(64))).toBe(`${'0'.repeat(64)} (unreleased build)`);
});

test('next.config.mjs computes it at build time, the run signs it beside engineVersion, the model card mirrors it', () => {
  const config = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
  expect(config).toMatch(/CC_ENGINE_DIGEST:\s*computeEngineDigest\(/);
  const route = fs.readFileSync(path.join(ROOT, 'app', 'api', 'runs', 'create', 'route.ts'), 'utf8');
  expect(route.match(/\.\.\.\(ENGINE_DIGEST \? \{ engineDigest: ENGINE_DIGEST \} : \{\}\)/g)?.length).toBe(2);
  const lib = fs.readFileSync(path.join(ROOT, 'lib', 'engine-digest.ts'), 'utf8');
  expect(lib).toContain('process.env.CC_ENGINE_DIGEST');
});

test('the model card prints the digest and its release; an old project reads "not recorded"', () => {
  const project = (engineDigest?: string) =>
    ({ auditMetadata: { modelCard: { provider: null, model: null, engineVersion: 'v3.4.0', byokUsed: false, ...(engineDigest ? { engineDigest } : {}) } } }) as unknown as Project;
  const [, r] = Object.entries(readReleases().releases)[0];
  expect(generateModelCard(project(r.digest))).toContain(`| Engine Digest | ${r.digest} (${engineDigestLabel(r.digest)}) |`);
  expect(generateModelCard(project('a'.repeat(64)))).toContain('(unreleased build)');
  expect(generateModelCard(project())).toContain('| Engine Digest | not recorded |');
});

test('a run with engineDigest and a run signed before it both verify; changing the digest breaks the seal', () => {
  const key = 'k'.repeat(64);
  const seal = (model: Record<string, unknown>) => {
    const payload = { runId: 'r1', projectId: 'p1', model, evidenceReport: [], signatureScheme: RUN_SIGNATURE_SCHEME };
    const runHash = computeRunHash(payload);
    return { ...payload, runHash, signature: signRunHashV2(runHash, key) };
  };
  const old = seal({ provider: null, modelId: null, engineVersion: 'v3.2.0', byokUsed: false });
  expect(verifyRunIntegrity(old, key).valid).toBe(true);
  const now = seal({ provider: null, modelId: null, engineVersion: 'v3.4.0', engineDigest: 'b'.repeat(64), byokUsed: false });
  expect(verifyRunIntegrity(now, key).valid).toBe(true);
  expect(canonicalizeJson(now)).toContain('engineDigest');
  const forged = { ...now, model: { ...now.model, engineDigest: 'c'.repeat(64) } };
  expect(verifyRunIntegrity(forged, key).valid).toBe(false);
});
