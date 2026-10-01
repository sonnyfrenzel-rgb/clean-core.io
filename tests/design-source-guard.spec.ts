import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  RULE_IDS,
  RULE_TITLES,
  countHits,
  isPublicFile,
  isWorkspaceFile,
  scanFile,
} from './helpers/design-rules';
import { REPO_ROOT, measureAll } from './helpers/design-source-files';

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
 * It demands zero: no file may hold a hit of any rule (D.30). From D.1 to
 * D.30 it demanded *no worse, and progress recorded* — a ceiling per file and
 * rule in `tests/design-baseline/<group>.json`, one list per group of the
 * plan's steps, lowered in the same commit as the code (`npm run
 * design:baseline`). Every list reached zero; D.30 deleted the folder and the
 * script. What is left are named exceptions, each written in
 * `tests/helpers/design-rules.ts` as a rule with its reason, never as a list:
 * the standalone exports (R3 in `lib/export-style.ts`, R11 in the templates),
 * the public pages (R12, §1.4), and the two library cases of D.33.
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

function hitsFor(rel: string, rule?: string) {
  return scanFile(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'))
    .filter((h) => !rule || h.rule === rule)
    .slice(0, 6)
    .map((h) => `      L${h.line} ${h.rule} ${h.snippet}`)
    .join('\n');
}

test.describe('design source guard (DESIGN.md, app-wide, zero)', () => {
  test('the guard reads the app: every page and component is measured', () => {
    // A walk that silently found nothing would make every test below vacuous.
    expect(counts.size).toBeGreaterThan(200);
    expect(counts.has('app/(app)/project/[projectId]/analyze/page.tsx')).toBe(true);
    expect(counts.has('components/cc/Button.tsx')).toBe(true);
    expect([...counts.keys()].some((r) => r.startsWith('app/api/'))).toBe(false);
  });

  test('no file has a hit of any rule', () => {
    const found: string[] = [];
    for (const [rel, c] of counts) {
      for (const rule of RULE_IDS) {
        if ((c[rule] ?? 0) > 0) found.push(`${rel}: ${rule} (${RULE_TITLES[rule]}) ${c[rule]}\n${hitsFor(rel, rule)}`);
      }
    }
    expect(
      found,
      'Replace the hit with the design-system equivalent (block-d-plan.md §4, translation table): the components in components/cc and the tokens in app/globals.css. There is no exception list.',
    ).toEqual([]);
  });

  test('no exception list has come back', () => {
    // D.30 deleted the per-group ceilings. A folder of them coming back would be
    // an exception list this spec no longer reads — green for the wrong reason.
    const folder = path.join(REPO_ROOT, 'tests', 'design-baseline');
    expect(fs.existsSync(folder), `${folder} exists — there are no ceilings since D.30; fix the code instead`).toBe(false);
  });

  test('the guard bites: a new hit in a clean file or a new file turns it red', () => {
    // Negative probes, in memory: the same functions the test above uses, fed
    // with a source that has one more violation than the file on disk.
    const probe = (rel: string, source: string) => countHits(scanFile(rel, source));

    // 10 px in a workspace component that is clean on disk.
    const nextStep = 'components/workspace/NextStepCard.tsx';
    const original = fs.readFileSync(path.join(REPO_ROOT, nextStep), 'utf8');
    expect(counts.get(nextStep)?.R1 ?? 0).toBe(0);
    const worse = original.replace(/className="/, 'className="text-[10px] ');
    expect(worse).not.toBe(original);
    expect(probe(nextStep, worse).R1).toBe(1);

    // A native alert in a file that does not exist yet.
    const fresh = 'components/NewThing.tsx';
    expect(probe(fresh, "export function NewThing() {\n  return <button onClick={() => alert('saved')}>Save</button>;\n}\n").R6).toBe(1);

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

  test('the named library exceptions are exactly as wide as their case (D.33)', () => {
    const rules = (rel: string, source: string) => scanFile(rel, source).map((h) => h.rule);
    // TOUCH_TARGET_COMPENSATION: -m-2.5 only where the same variant grows 24 px to 44 px.
    const why = 'h-6 w-6 max-[600px]:-m-2.5 max-[600px]:h-11 max-[600px]:w-11';
    expect(rules('components/cc/Probe.tsx', `<button className="${why}">?</button>`)).toEqual([]);
    expect(rules('components/cc/Probe.tsx', '<button className="h-6 w-6 max-[600px]:-m-2.5 pointer-coarse:h-11 pointer-coarse:w-11">?</button>')).toEqual(['R18']);
    expect(rules('components/cc/Probe.tsx', '<button className="h-8 w-8 max-[600px]:-m-2.5 max-[600px]:h-11 max-[600px]:w-11">?</button>')).toEqual(['R18']);
    expect(rules('components/cc/Probe.tsx', '<div className="-m-2.5">x</div>')).toEqual(['R18']);
    // TABLE_ROW_OPEN: the library table's row, and nothing else.
    expect(rules('components/cc/Table.tsx', '<tr data-cc-table-row={k} onClick={go}><td /></tr>')).toEqual([]);
    expect(rules('components/cc/Table.tsx', '<tr onClick={go}><td /></tr>')).toEqual(['R9']);
    expect(rules('components/workspace/Probe.tsx', '<tr data-cc-table-row={k} onClick={go}><td /></tr>')).toEqual(['R9']);
    // No exception for a look: a hand-built segment row counts, the library's shared look does not.
    const segment = '<button role="radio" className="bg-cc-ink px-2">x</button>';
    expect(rules('components/cc/SegmentedControl.tsx', segment)).toEqual(['R7']);
    expect(rules('components/process-states/Probe.tsx', '<button role="radio" className={ccSegmentClass(on)}>x</button>')).toEqual([]);
  });

  test('a `//` that is not a comment hides nothing after it (QA c07adecd2fb5, 01bcfd747ee8)', () => {
    // The comment stripper used to be a regex that blanked the rest of a line
    // from any `//` not preceded by a colon or a quote — an attribute value, a
    // sentence in JSX text or a template literal took the violation after it
    // out of the count.
    const hidden = [
      '<span title="x//" className="text-[10px]">y</span>',
      '<p>see // this <span className="text-[10px]">y</span></p>',
      'const u = `a//b ${x} text-[10px]`;',
      "const p = 'app/**/*.tsx'; const q = 'text-[10px]';",
    ];
    for (const source of hidden) {
      expect(scanFile('components/Probe.tsx', source).map((h) => h.rule), source).toContain('R1');
    }
    // Real comments still carry prose, in every form the files use.
    const comments = 'const a = 1; // text-[10px]\n/* text-[9px] */\nconst b = <div>{/* text-[8px] */}</div>;';
    expect(scanFile('components/Probe.tsx', comments)).toEqual([]);
  });

  test('2 px (`*-0.5`) is counted outside a chip, an identifier or an icon, and only there (dc7435453a94)', () => {
    expect(scanFile('components/Probe.tsx', '<div className="p-0.5">x</div>').map((h) => h.rule)).toEqual(['R18']);
    expect(scanFile('components/Probe.tsx', '<span className="rounded-full p-0.5">chip</span>')).toEqual([]);
  });

  test('D.5e: the three rule corrections bite where they should and nowhere else', () => {
    const rules = (source: string) => scanFile('components/Probe.tsx', source).map((h) => h.rule);

    // R8 — Tailwind v4 draws nothing for `outline-none focus-visible:outline-2`:
    // the width utility reads `--tw-outline-style`, which `outline-none` set to none.
    expect(rules('<button className="outline-none focus-visible:outline-2 focus-visible:outline-cc-focus">x</button>')).toEqual(['R8']);
    expect(rules('<button className="focus:outline-none focus:outline-2">x</button>')).toEqual(['R8']);
    // With a style of its own, a ring, a shadow or a border it is a replacement.
    expect(rules('<button className="outline-none focus-visible:outline-solid focus-visible:outline-2">x</button>')).toEqual([]);
    expect(rules('<button className="outline-none focus-visible:ring-2">x</button>')).toEqual([]);

    // R18 — 2 px on an element with the library's row radius is a chip, like `rounded-sm`.
    expect(rules('<span className="rounded-cc-row px-1 py-0.5">chip</span>')).toEqual([]);
    // … and 6/10/14 px still count there.
    expect(rules('<span className="rounded-cc-row gap-1.5">x</span>')).toEqual(['R18']);

    // R7 — a hover tint on a hand-built button still counts; on a menu item or
    // a listbox option it is the look of a list row, not a fifth button.
    expect(rules('<button className="p-2 rounded-cc-row hover:bg-cc-surface-muted">x</button>')).toEqual(['R7']);
    expect(rules('<button role="menuitem" className="px-3 py-2 hover:bg-cc-surface-muted">x</button>')).toEqual([]);
    expect(rules('<button role="option" className="px-3 py-2 hover:bg-cc-surface-muted">x</button>')).toEqual([]);

    // R12 knows the two rooms apart: public pages may keep their radii and
    // mesh (§1.4, E-5), the workspace may not.
    expect(isPublicFile('app/page.tsx')).toBe(true);
    expect(isPublicFile('app/datenschutz/de/page.tsx')).toBe(true);
    expect(isWorkspaceFile('app/(app)/project/[projectId]/analyze/page.tsx')).toBe(true);
    expect(isWorkspaceFile('components/workspace/NextStepCard.tsx')).toBe(true);
    expect(isWorkspaceFile('lib/export-style.ts')).toBe(false);
    const big = '<div className="rounded-3xl shadow-2xl">x</div>';
    expect(scanFile('app/page.tsx', big).map((h) => h.rule)).toEqual([]);
    expect(scanFile('components/workspace/Probe.tsx', big).map((h) => h.rule)).toEqual(['R12', 'R12']);
  });
});
