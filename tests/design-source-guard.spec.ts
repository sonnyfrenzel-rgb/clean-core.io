import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  GROUP_NAMES,
  RULE_IDS,
  countHits,
  ratchet,
  scanFile,
  validateBaseline,
  type RuleCounts,
} from './helpers/design-rules';
import { BASELINE_DIR, REPO_ROOT, measureAll, mergedBaseline, readBaselineFiles } from './helpers/design-baseline-io';

/**
 * DESIGN.md for the whole app, not only for the new namespace — Block D, step D.1.
 *
 * `cc-token-guard` and `cc-style-guard` hold `components/cc`, the workspace and
 * the process map to the design system. Everything else — the seven stage
 * pages, settings, admin, the knowledge and public pages, the shared older
 * components — was measured on 24.09.2026 at 7,450 palette classes, 977 × 900,
 * 729 × type below 11 px, and no guard reached it. This spec reaches all of
 * `app/**` and `components/**` (not `app/api`), with nineteen source rules R1–R19
 * defined and explained in `tests/helpers/design-rules.ts`.
 *
 * It cannot demand zero today, so it demands *no worse, and progress recorded*:
 *
 *   - `tests/design-baseline/<group>.json` holds, per file and rule, today's
 *     count as a ceiling. One file per group of the plan's steps, so two steps
 *     running in parallel never edit the same list.
 *   - More than the ceiling is red (test 1). A file without an entry has
 *     ceiling 0 — a new file has no exception (test 3).
 *   - **Fewer than the ceiling is also red** (test 2) until the ceiling is
 *     lowered in the same commit. That is the ratchet: progress cannot be made
 *     silently and then lost silently.
 *   - Every exception names the step D.x that removes it (test 4).
 *
 * How a step lowers its ceiling
 * -----------------------------
 * After removing hits, run
 *
 *     npm run design:baseline -- --group <group>
 *
 * It rewrites `tests/design-baseline/<group>.json` with every ceiling that went
 * DOWN, drops rules and files that reached zero, and refuses (exit 1, naming
 * the line) if any count went UP — ceilings are never raised, by the script or
 * by hand. `npm run design:baseline -- --report --group <group>` shows the
 * difference without writing. Commit the JSON with the code. The group of a
 * file is in `groupOf()` in `tests/helpers/design-rules.ts`; the failure
 * message of test 2 names it as well.
 *
 * Accepted decisions this enforces (24.09.2026): E-1 / ADR-047 — 12 px is the
 * "meta/chip" step of the type scale, so R19 allows 11/12/13/14/15/22 px;
 * E-2 / ADR-048 — 2 px (`*-0.5`) only inside chips/identifiers and for icon
 * alignment, 6/10/14 px (`*-1.5`, `*-2.5`, `*-3.5`) never (R18).
 *
 * Pure source reading, no server, no network; the whole file runs in about a
 * second. The rendered counterpart is D.2 (`design-rendered-guard`).
 */

const counts = measureAll();
const baseline = mergedBaseline();

function hitsFor(rel: string, rule?: string) {
  return scanFile(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'))
    .filter((h) => !rule || h.rule === rule)
    .slice(0, 6)
    .map((h) => `      L${h.line} ${h.rule} ${h.snippet}`)
    .join('\n');
}

test.describe('design source guard (DESIGN.md, app-wide ratchet)', () => {
  test('the guard reads the app: every page and component is measured', () => {
    // A walk that silently found nothing would make every test below vacuous.
    expect(counts.size).toBeGreaterThan(200);
    expect(counts.has('app/(app)/project/[projectId]/analyze/page.tsx')).toBe(true);
    expect(counts.has('components/cc/Button.tsx')).toBe(true);
    expect([...counts.keys()].some((r) => r.startsWith('app/api/'))).toBe(false);
  });

  test('1 · no file is above its ceiling', () => {
    const over = ratchet(counts, baseline).filter((f) => f.kind === 'over');
    expect(
      over.map((f) => `${f.message}\n${hitsFor(f.rel, f.rule)}`),
      'A file got worse. Replace the hit with the design-system equivalent (luecken-und-plan.md §4, translation table); ceilings are never raised.',
    ).toEqual([]);
  });

  test('2 · no ceiling is above today\'s count — progress is written down', () => {
    const under = ratchet(counts, baseline).filter((f) => f.kind === 'under');
    expect(
      under.map((f) => f.message),
      'Hits were removed — good. Lower the ceiling in the same commit: npm run design:baseline -- --group <group>.',
    ).toEqual([]);
  });

  test('3 · a file without an entry has no hits, and no entry outlives its file', () => {
    const findings = ratchet(counts, baseline).filter((f) => f.kind === 'unlisted' || f.kind === 'stale');
    expect(
      findings.map((f) => (f.kind === 'unlisted' ? `${f.message} (no exception for this file)\n${hitsFor(f.rel, f.rule)}` : f.message)),
      'New files have no exception. Use the components in components/cc and the tokens in app/globals.css.',
    ).toEqual([]);
  });

  test('4 · every exception names its step, sits in its group, and no file is listed twice', () => {
    const files = readBaselineFiles();
    const problems: string[] = [];
    const seen = new Map<string, string>();
    for (const { fileName, data } of files) {
      if (!GROUP_NAMES.includes(data.group)) problems.push(`${fileName}: unknown group "${data.group}"`);
      problems.push(...validateBaseline(data, fileName));
      for (const rel of Object.keys(data.files ?? {})) {
        if (seen.has(rel)) problems.push(`${rel}: listed in ${seen.get(rel)} and ${fileName}`);
        seen.set(rel, fileName);
      }
    }
    expect(problems).toEqual([]);
  });

  test('the guard bites: a new hit in a clean file or a new file turns it red', () => {
    // Negative probes, in memory: the same functions the tests above use, fed
    // with a source that has one more violation than the file on disk.
    const probe = (rel: string, source: string) => {
      const c = new Map<string, RuleCounts>(counts);
      c.set(rel, countHits(scanFile(rel, source)));
      return ratchet(c, baseline).filter((f) => f.kind === 'over' || f.kind === 'unlisted');
    };

    // 10 px in a workspace component (a file the library already holds clean on R1).
    const nextStep = 'components/workspace/NextStepCard.tsx';
    const original = fs.readFileSync(path.join(REPO_ROOT, nextStep), 'utf8');
    expect(counts.get(nextStep)?.R1 ?? 0).toBe(baseline.get(nextStep)?.entry.R1 ?? 0);
    const worse = original.replace(/className="/, 'className="text-[10px] ');
    expect(worse).not.toBe(original);
    expect(probe(nextStep, worse).map((f) => `${f.rel} ${f.rule}`)).toContain(`${nextStep} R1`);

    // A native alert in a file that does not exist yet.
    const fresh = 'components/NewThing.tsx';
    const found = probe(fresh, "export function NewThing() {\n  return <button onClick={() => alert('saved')}>Save</button>;\n}\n");
    expect(found.map((f) => `${f.kind} ${f.rule}`)).toContain('unlisted R6');

    // And each rule fires on a line written for it, so a regex that stopped
    // matching cannot pass as "no hits".
    const samples: Record<string, string> = {
      R1: '<p className="text-[9px]">x</p>',
      R2: '<p className="font-black">x</p>',
      R3: "const c = '#0b1c30';",
      R4: '<p className="text-slate-600">x</p>',
      R5: '<p className="bg-emerald-50">x</p>',
      R6: "window.confirm('sure?');",
      R7: '<button className="bg-green-600 px-4">Go</button>',
      R8: '<input className="outline-none" />',
      R9: '<div onClick={go}>x</div>',
      R10: '<div className="fixed inset-0 z-50">x</div>',
      R11: '<table><tbody /></table>',
      R12: '<div className="rounded-3xl shadow-2xl">x</div>',
      R13: '<span className="animate-pulse">x</span>',
      R14: "const s = '\u{1F680} Launch';",
      R15: "import { Sparkles } from 'lucide-react';\nconst x = <Sparkles />;",
      R16: 'const d = new Date().toLocaleDateString();',
      R17: '<span className="px-2 py-0.5 rounded-full text-xs bg-amber-100">Draft</span>',
      R18: '<div className="gap-2.5">x</div>',
      R19: '<p className="text-[17px]">x</p>',
    };
    const silent = RULE_IDS.filter((r) => !scanFile('components/Probe.tsx', samples[r]).some((h) => h.rule === r));
    expect(silent, 'rules that did not fire on their own sample').toEqual([]);

    // And the allowed forms stay allowed (E-1, E-2, motion-safe, 'en').
    const allowed = [
      '<span className="text-[12px] text-[11px] text-[13px] text-[22px]">meta</span>',
      "import { Check } from 'lucide-react';\nconst i = <Check className=\"mt-0.5 h-4 w-4\" />;",
      '<span className="rounded-full px-2 py-0.5">chip</span>',
      '<span className="motion-safe:animate-pulse">x</span>',
      "const d = new Date().toLocaleDateString('en-US');",
      '<input className="outline-none focus-visible:ring-2" />',
      '<div data-backdrop onClick={close} />',
    ].join('\n');
    expect(scanFile('components/workspace/Probe.tsx', allowed).map((h) => `${h.rule} ${h.snippet}`)).toEqual([]);
  });

  test('every group of the plan has its own baseline file', () => {
    // Parallel steps edit different JSON files; that only holds if each group
    // exists as its own file (an empty `files` is fine — it means "clean").
    const onDisk = fs.existsSync(BASELINE_DIR) ? fs.readdirSync(BASELINE_DIR).filter((n) => n.endsWith('.json')) : [];
    expect(onDisk.sort()).toEqual(GROUP_NAMES.map((g) => `${g}.json`).sort());
  });
});
