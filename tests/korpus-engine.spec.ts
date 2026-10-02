import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import {
  compareAll,
  readCases,
  readManifest,
  readWithEngine,
  readBaseline,
  resultId,
  RULE_BRIDGES,
  STATEMENT_CLASSES,
  type BaselineEntry,
  type ClassResult,
} from './helpers/korpus-comparison';

/**
 * The reference corpus against the engine (roadmap 2.10).
 *
 * The case book `docs/korpus/referenzkorpus-v2.1.md` records the right answer
 * for 68 ABAP cases before the engine is asked.
 * `scripts/korpus/build-bundle.mjs` translates it into `tests/korpus/`, and
 * this spec runs `lib/abap/` over every case and compares — separately per
 * statement class, because the corpus and the engine do not carry the same
 * statements.
 *
 * **The ratchet.** `tests/korpus/baseline.json` records the state of every
 * case-and-class: `agree`, or `disagree` with a verdict and a reason. The run
 * fails when
 *
 *   (a) an `agree` turns into `disagree` — an agreement has been lost,
 *   (b) a `disagree` disappears without its entry being struck — good news,
 *       and it belongs on record,
 *   (c) the verdict on a disagreement changes without the baseline being
 *       updated,
 *   (d) the bundle no longer matches the case book,
 *   (e) `manifest.json` carries a different case-book hash than the file in
 *       `docs/korpus/`.
 *
 * What the ratchet is **not**: an allowlist. Every `disagree` carries a
 * verdict from exactly three options and a reason with substance, and a test
 * further down insists on it. `engine-defekt` means: the case is right and the
 * engine is not — that is an item for Phase 2; here it is counted and named,
 * not fixed. `korpus-offen` means: the expected answer itself is
 * questionable; it is still not changed, but goes back to the case authors as
 * a question. `nicht-vergleichbar` means: the engine does not carry this
 * statement — not a weakness of the corpus, but a statement about where
 * Phase 2 stands.
 *
 * No server, no emulator, no model: pure functions over text.
 */

const BASELINE = readBaseline();
const LIVE: ClassResult[] = compareAll();
const LIVE_BY_ID = new Map(LIVE.map((result) => [resultId(result), result]));
const BASE_BY_ID = new Map(BASELINE.entries.map((entry) => [resultId(entry), entry]));

const VERDICTS = ['engine-defekt', 'korpus-offen', 'nicht-vergleichbar'] as const;

function describe(result: ClassResult): string {
  return `  ${result.case} [${result.class}] ${result.state}${result.verdict ? ` · ${result.verdict}` : ''}\n      ${result.evidence}`;
}

function describeEntry(entry: BaselineEntry): string {
  return `  ${entry.case} [${entry.class}] ${entry.state}${entry.verdict ? ` · ${entry.verdict}` : ''}\n      ${entry.reason}`;
}

// ---------------------------------------------------------------------------
// The ratchet
// ---------------------------------------------------------------------------

test.describe('the ratchet', () => {
  test('no agreement has been lost', () => {
    const lost = LIVE.filter((result) => {
      const recorded = BASE_BY_ID.get(resultId(result));
      return recorded != null && recorded.state === 'agree' && result.state === 'disagree';
    });
    expect(
      lost.map(describe).join('\n'),
      'These cases agreed with the corpus and no longer do. Either a change to ' +
        'lib/abap/ flipped a statement — then this is the regression this corpus exists to catch — or ' +
        'the case book changed the expected answer. Both are decided here, not patched over in the baseline.',
    ).toEqual('');
  });

  test('no disagreement disappears silently', () => {
    const resolved = BASELINE.entries.filter((entry) => {
      const live = LIVE_BY_ID.get(resultId(entry));
      return entry.state === 'disagree' && live != null && live.state === 'agree';
    });
    expect(
      resolved.map(describeEntry).join('\n'),
      'These disagreements no longer exist. That is good news and it belongs on record: ' +
        'strike the entries from tests/korpus/baseline.json so the ratchet holds the new state ' +
        'and cannot fall back to the old one.',
    ).toEqual('');
  });

  test('no verdict changes unnoticed', () => {
    const changed: string[] = [];
    for (const result of LIVE) {
      const recorded = BASE_BY_ID.get(resultId(result));
      if (!recorded || recorded.state !== 'disagree' || result.state !== 'disagree') continue;
      if (recorded.verdict !== result.verdict) {
        changed.push(
          `  ${result.case} [${result.class}]\n      recorded: ${recorded.verdict}\n      now:      ${result.verdict}\n      ${result.evidence}`,
        );
      }
    }
    expect(
      changed.join('\n'),
      'The disagreement persists, but its kind has changed — a non-comparable class has become a ' +
        'defect or the other way round. Read the reason, decide again and update the baseline.',
    ).toEqual('');
  });

  test('no disagreement silently deepens', () => {
    // State, verdict and denominator alone let an existing disagreement
    // grow: if CC-048 loses another matched edge, the facet stays
    // `disagree` · `engine-defekt` with 8 of 15 compared edges — only
    // "5 matched, 2 missing" becomes "4 matched, 3 missing". The reason in
    // the baseline is the comparator's finding as
    // `tests/helpers/korpus-baseline-write.ts` wrote it; it names every
    // missing edge and every missing node. If the finding differs, something
    // has moved inside the disagreement — read, decide, rewrite the baseline.
    const moved: string[] = [];
    for (const result of LIVE) {
      const recorded = BASE_BY_ID.get(resultId(result));
      if (!recorded || recorded.state !== 'disagree' || result.state !== 'disagree') continue;
      const scopeMoved =
        recorded.scope.compared !== result.scope.compared || recorded.scope.total !== result.scope.total;
      if (scopeMoved || recorded.reason !== result.evidence) {
        moved.push(
          `  ${result.case} [${result.class}]\n      recorded: ${recorded.reason}\n      now:      ${result.evidence}`,
        );
      }
    }
    expect(
      moved.join('\n'),
      'The disagreement persists, but its finding has changed — another statement may have been lost ' +
        'without state or verdict flipping. Read the difference; if it is intended, ' +
        'rewrite the baseline with tests/helpers/korpus-baseline-write.ts.',
    ).toEqual('');
  });

  test('every case-and-class is in the baseline', () => {
    const missing = LIVE.filter((result) => !BASE_BY_ID.has(resultId(result))).map(describe);
    const orphaned = BASELINE.entries
      .filter((entry) => !LIVE_BY_ID.has(resultId(entry)))
      .map((entry) => `  ${entry.case} [${entry.class}] is in the baseline but does not occur in the run`);
    expect(
      [...missing, ...orphaned].join('\n'),
      'The case book and the baseline have drifted apart. New cases need one entry per ' +
        'statement class with a verdict and a reason; dropped cases belong struck from the baseline.',
    ).toEqual('');
  });
});

// ---------------------------------------------------------------------------
// The baseline as a register, not as an allowlist
// ---------------------------------------------------------------------------

test.describe('the baseline carries substance', () => {
  test('every disagreement has a verdict and a reason', () => {
    // A baseline whose entries say nothing is an allowlist, and an allowlist
    // is how a finding becomes a fact of life.
    expect(BASELINE.entries.length).toBeGreaterThan(0);
    const thin: string[] = [];
    for (const entry of BASELINE.entries) {
      if (entry.state === 'agree') {
        if (entry.verdict !== null) thin.push(`  ${entry.case} [${entry.class}]: agree with verdict ${entry.verdict}`);
        continue;
      }
      if (!VERDICTS.includes(entry.verdict as (typeof VERDICTS)[number])) {
        thin.push(`  ${entry.case} [${entry.class}]: verdict "${entry.verdict}" is none of the three`);
      }
      if ((entry.reason ?? '').length < 40) {
        thin.push(`  ${entry.case} [${entry.class}]: reason too thin (${(entry.reason ?? '').length} characters)`);
      }
    }
    expect(thin.join('\n'), 'Without a verdict and a reason, a baseline entry is a shrug.').toEqual('');
  });

  test('the baseline is neither empty nor uniform', () => {
    const disagreements = BASELINE.entries.filter((entry) => entry.state === 'disagree');
    const agreements = BASELINE.entries.filter((entry) => entry.state === 'agree');
    expect(disagreements.length, 'a baseline without a disagreement would have measured nothing').toBeGreaterThan(0);
    expect(agreements.length, 'a baseline without an agreement would have compared nothing').toBeGreaterThan(0);
    const byVerdict = new Map<string, number>();
    for (const entry of disagreements) byVerdict.set(entry.verdict ?? '?', (byVerdict.get(entry.verdict ?? '?') ?? 0) + 1);
    expect(
      byVerdict.get('engine-defekt') ?? 0,
      'not a single engine defect across 68 cases — that would be the moment to distrust the comparison, not to praise the engine',
    ).toBeGreaterThan(0);
    expect(
      byVerdict.get('nicht-vergleichbar') ?? 0,
      'not a single non-comparable class — then the run compares something other than what the corpus claims',
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// A run that reads nothing reports nothing either — that is the difference
// ---------------------------------------------------------------------------

test.describe('the comparison really reads', () => {
  test('every case supplies source code, and the engine reads it', () => {
    const cases = readCases();
    expect(cases.length, 'the bundle is empty or incomplete').toBeGreaterThanOrEqual(60);
    const empty: string[] = [];
    for (const korpusCase of cases) {
      expect(korpusCase.sources.length, `${korpusCase.id} has no source file`).toBeGreaterThan(0);
      const reading = readWithEngine(korpusCase);
      for (const entry of reading.perFile) {
        if (entry.statements.length === 0) empty.push(`${korpusCase.id}/${entry.file}: 0 statements read`);
      }
      if (reading.routeCount === 0) empty.push(`${korpusCase.id}: routeExtensibility returned no checkpoints`);
    }
    expect(empty.join('\n'), 'A reader that reads nothing never disagrees.').toEqual('');
  });

  test('every statement class occurs exactly once per case', () => {
    const counts = new Map<string, number>();
    for (const result of LIVE) counts.set(resultId(result), (counts.get(resultId(result)) ?? 0) + 1);
    const wrong = [...counts.entries()].filter(([, count]) => count !== 1);
    expect(wrong.map(([id, count]) => `  ${id}: ${count}×`).join('\n')).toEqual('');
    expect(LIVE.length).toBe(readManifest().cases.length * STATEMENT_CLASSES.length);
  });

  test('every rule bridge names a construct and a justification', () => {
    // The bridges are the only interpretation in this comparison. One without
    // a justification would be a mapping nobody can look up.
    for (const bridge of RULE_BRIDGES) {
      expect(bridge.kinds.length, `${bridge.rule} without a finding kind`).toBeGreaterThan(0);
      expect(bridge.why.length, `${bridge.rule} without a justification`).toBeGreaterThan(40);
      expect(bridge.construct.source.length, `${bridge.rule} without a construct`).toBeGreaterThan(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Bundle, case book and hashes
// ---------------------------------------------------------------------------

test.describe('the bundle matches the case book', () => {
  test('re-running the converter produces no change', () => {
    const manifest = readManifest();
    const out = execFileSync(
      process.execPath,
      ['scripts/korpus/build-bundle.mjs', '--book', manifest.book.path, '--check'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(out).toContain('0 abweichend');
  });

  test('the case-book hash in the manifest is the hash of the file in docs/korpus/', () => {
    const manifest = readManifest();
    const book = readFileSync(join(process.cwd(), manifest.book.path), 'utf8').replace(/\r\n/g, '\n');
    expect(
      createHash('sha256').update(book, 'utf8').digest('hex'),
      `${manifest.book.path} is no longer the file tests/korpus/ was built from`,
    ).toBe(manifest.book.sha256);
    expect(BASELINE.book.sha256, 'the baseline was written against a different case book').toBe(manifest.book.sha256);
  });

  test('every source file carries the hash the case book names for it', () => {
    const manifest = readManifest();
    const wrong: string[] = [];
    for (const entry of manifest.cases) {
      for (const file of entry.files) {
        const body = readFileSync(join(process.cwd(), 'tests/korpus/cases', entry.id, file.name), 'utf8').replace(
          /\r\n/g,
          '\n',
        );
        const digest = createHash('sha256').update(body, 'utf8').digest('hex');
        if (digest !== file.sha256) wrong.push(`  ${entry.id}/${file.name}: ${digest} instead of ${file.sha256}`);
      }
    }
    expect(wrong.join('\n')).toEqual('');
  });
});

// ---------------------------------------------------------------------------
// No pointer to third-party code
// ---------------------------------------------------------------------------

/**
 * A Git source beyond the three big hosts: an SSH remote (`git@host:`), a URL
 * ending in `.git`, a host starting with `git.`, or a known self-hosted
 * service.
 */
const GIT_POINTER =
  /\bgit@[\w.-]+:|\b(?:https?|ssh|git):\/\/[^\s"'<>)]+?\.git\b|\b(?:https?:\/\/)?git\.[a-z0-9-]+(?:\.[a-z0-9-]+)+|\b(?:codeberg\.org|sr\.ht|gitea\.|forgejo\.|gogs\.|gerrit\.)/i;

test('the Git pointer test recognises self-hosted hosts and remotes', () => {
  for (const pointer of [
    'git@git.corp.example:team/repo.git',
    'https://git.corp.example/team/repo',
    'https://code.corp.example/team/repo.git',
    'ssh://scm.example/repo.git',
    'https://codeberg.org/someone/repo',
  ]) {
    expect(GIT_POINTER.test(pointer), pointer).toBe(true);
  }
  for (const harmless of ['DATA lv_git TYPE string.', 'see README.md', 'the .gitignore file']) {
    expect(GIT_POINTER.test(harmless), harmless).toBe(false);
  }
});

test('docs/korpus/ and tests/korpus/ carry no pointer to a third-party repository', () => {
  // Nine cases are evidenced in real production code, and fourteen of the
  // fifteen sources carry no licence; by every indication the load-bearing
  // ones are employer assets uploaded without authorisation. This repository
  // is public, and Git forgets nothing: a URL with commit and line number
  // would be a permanent, indexed pointer to someone else's disclosure —
  // even after someone takes it out again. The locations are therefore
  // evidenced only as a hash; the full proof lives outside.
  // Carried QA finding 338ce6c1f72f: the cases under tests/korpus/ are corpus
  // too, and a self-hosted Git server is as much a pointer as github.com.
  const roots = ['docs/korpus', 'tests/korpus'].map((r) => join(process.cwd(), r));
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/\.(md|json|csv|txt|py|abap)$/i.test(name)) continue;
      const body = readFileSync(abs, 'utf8');
      const rel = relative(process.cwd(), abs).replace(/\\/g, '/');
      const host = body.match(/\b(?:github|gitlab|bitbucket)\.com\b/i);
      if (host) offenders.push(`  ${rel}: names ${host[0]}`);
      const remote = body.match(GIT_POINTER);
      if (remote) offenders.push(`  ${rel}: names a Git source (${remote[0]})`);
      // The corpus's source hashes are 64 hex digits; a 40-digit hex
      // string is a Git commit ID and therefore a pointer.
      const commit = body.match(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/);
      if (commit) offenders.push(`  ${rel}: carries a 40-digit commit ID (${commit[0].slice(0, 12)}…)`);
    }
  };
  for (const root of roots) walk(root);
  expect(
    offenders.join('\n'),
    'No pointer to third-party code in docs/korpus/ — neither host nor commit ID. The evidence for a location is ' +
      'the SHA-256 of the excerpt; the source is shown to a reviewer outside the repository.',
  ).toEqual('');
});
