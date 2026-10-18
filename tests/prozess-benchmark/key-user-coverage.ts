/**
 * Key-user coverage over the 300 benchmark cases (roadmap 3.0.19: "the
 * 300-case benchmark reports how many programs, or parts of them, the key-user
 * route would cover").
 *
 * Invocation (from the repo root):
 *   npx tsx tests/prozess-benchmark/key-user-coverage.ts [--engine <version>] [--out <file.json>]
 *
 * Per case and deployment: the scope of the key-user reading
 * (`whole-program` · `partial` · `none`), the parts that are candidates, per
 * tool, and the blockers that keep the other parts in code. The engine version
 * is passed explicitly (default 3.0.19, `KEY_USER_FROM`); an earlier one has
 * no reading at all.
 *
 * Measured on 18.10.2026 (engine 3.0.19, both editions read the same): of 300
 * programs 16 are key user as a whole, 102 split (some parts key user, some
 * code), 182 have no key-user part — 118 programs with at least one key-user
 * part; of 604 parts 171 are candidates, 430 stay code, 3 are not determined.
 *
 * Not a spec and not part of CI: a measurement, not a ratchet.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';

const ROOT = join(__dirname, 'cases');
const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : null;
};
const ENGINE = arg('--engine') ?? '3.0.19';
const OUT = arg('--out');

interface Row {
  id: string;
  deployment: 'public' | 'private';
  scope: string;
  parts: { total: number; keyUser: number; code: number; notDetermined: number };
  tools: string[];
  blockers: string[];
}

const rows: Row[] = [];
for (const id of readdirSync(ROOT).filter((n) => /^BM-\d{3}$/.test(n)).sort()) {
  const dir = join(ROOT, id);
  const files = readdirSync(dir).filter((n) => n.endsWith('.abap')).sort();
  if (!files.length) continue;
  const code = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  for (const deployment of ['private', 'public'] as const) {
    const evidence = buildAbapEvidence(code, files[0], deployment, undefined, ENGINE.startsWith('v') ? ENGINE : `v${ENGINE}`);
    const ku = evidence.keyUser;
    rows.push({
      id,
      deployment,
      scope: ku?.scope ?? 'no-reading',
      parts: ku?.parts ?? { total: 0, keyUser: 0, code: 0, notDetermined: 0 },
      tools: ku ? ku.candidates.map((c) => c.tool) : [],
      blockers: ku ? [...new Set(ku.rejected.flatMap((r) => r.blockers.map((b) => b.code)))] : [],
    });
  }
}

const count = <T,>(xs: readonly T[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [String(x)]: (m[String(x)] ?? 0) + 1 }), {});
for (const deployment of ['private', 'public'] as const) {
  const mine = rows.filter((r) => r.deployment === deployment);
  const parts = mine.reduce((s, r) => ({ total: s.total + r.parts.total, keyUser: s.keyUser + r.parts.keyUser, code: s.code + r.parts.code, notDetermined: s.notDetermined + r.parts.notDetermined }), { total: 0, keyUser: 0, code: 0, notDetermined: 0 });
  console.log(`\n${deployment}: ${mine.length} programs`);
  console.log(`  scope: ${JSON.stringify(count(mine.map((r) => r.scope)))}`);
  console.log(`  programs with at least one key-user part: ${mine.filter((r) => r.parts.keyUser > 0).length}`);
  console.log(`  parts: ${JSON.stringify(parts)}`);
  console.log(`  candidates per tool: ${JSON.stringify(count(mine.flatMap((r) => r.tools)))}`);
  console.log(`  programs per blocker: ${JSON.stringify(count(mine.flatMap((r) => r.blockers)))}`);
  console.log(`  whole-program cases: ${mine.filter((r) => r.scope === 'whole-program').map((r) => r.id).join(', ') || 'none'}`);
}
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 2));
