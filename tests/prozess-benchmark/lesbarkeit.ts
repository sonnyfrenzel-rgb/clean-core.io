/**
 * Business readability over the shipped examples and the LEARN half of the process benchmark (concept
 * "Business-Lesbarkeit" §4.1, 05.11.2026). Deterministic, no model, no server.
 *
 *   npx tsx tests/prozess-benchmark/lesbarkeit.ts [--engine 3.0.21] [--out <dir>] [--examples-only]
 *
 * Reads only the case ids listed under `learn` and `w3_learn` in split.json — never a holdout case. Writes the
 * per-program labels and the totals to `--out` (default: the OS temp folder); never `manifest.json` or
 * `results.json`, which `evaluate.ts` owns.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { measure, readBusiness, report, total, type BusinessReadingOut, type Readability } from '../helpers/business-readability';
import { EXAMPLES_DIR } from '../helpers/starter-example-files';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const ENGINE = arg('--engine', '3.0.21');
const OUT = arg('--out', join(tmpdir(), 'cc-lesbarkeit'));
const examplesOnly = process.argv.includes('--examples-only');

const ROOT = join(__dirname, 'cases');
const split = JSON.parse(readFileSync(join(__dirname, 'split.json'), 'utf8')) as Record<string, unknown>;
const learn = [...(split.learn as string[]), ...(split.w3_learn as string[])];

/** The same joining as `concatenate` in evaluate.ts and `source` in weg-b.ts. Refuses any id outside LEARN. */
function caseSource(id: string): string {
  if (!learn.includes(id)) throw new Error(`${id} is not a LEARN case`);
  const dir = join(ROOT, id);
  const files = readdirSync(dir).filter((f) => f.endsWith('.abap')).sort();
  const read = files.map((name) => ({ name, code: readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n') }));
  if (read.length === 1) return read[0].code;
  const head = (code: string) => /^\s*(REPORT|PROGRAM|FUNCTION-POOL)\b/im.test(code);
  read.sort((a, b) => Number(head(b.code)) - Number(head(a.code)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const lines: string[] = [];
  for (const file of read) {
    const own = file.code.split('\n');
    if (own[own.length - 1] === '') own.pop();
    lines.push(...own);
  }
  return lines.join('\n') + '\n';
}

function run(label: string, programs: Array<{ file: string; source: string }>): Readability {
  const readings: BusinessReadingOut[] = [];
  const scores: Readability[] = [];
  for (const p of programs) {
    try {
      const r = readBusiness(p.source, p.file, ENGINE);
      readings.push(r);
      scores.push(measure(r));
    } catch (e) {
      console.error(`${p.file}: ${(e as Error).message}`);
    }
  }
  const t = total(scores);
  console.log(`\n== ${label} (${scores.length} programs, engine ${ENGINE})\n${report(t)}`);
  writeFileSync(join(OUT, `${label}-${ENGINE}.json`), JSON.stringify(readings.map((r) => ({ ...r, segments: undefined })), null, 1));
  return t;
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const examples = readdirSync(EXAMPLES_DIR).sort().map((file) => ({ file, source: readFileSync(join(EXAMPLES_DIR, file), 'utf8') }));
const totals: Record<string, Readability> = { examples: run('examples', examples) };
if (!examplesOnly) {
  totals.learn = run('learn', learn.filter((id) => existsSync(join(ROOT, id))).map((id) => ({ file: id, source: caseSource(id) })));
}
writeFileSync(join(OUT, `totals-${ENGINE}.json`), JSON.stringify(totals, null, 1));
console.log(`\nwritten to ${OUT}`);
