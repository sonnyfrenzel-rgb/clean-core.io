/**
 * The contradiction module (roadmap 17.10) over the process benchmark.
 *
 *   npx tsx tests/prozess-benchmark/widerspruch.ts --half learn    [--show]
 *   npx tsx tests/prozess-benchmark/widerspruch.ts --half holdout
 *
 * What is measured is `checkStatementAgainstCode` from `lib/statement-contradiction.ts`
 * on the sentences of path B as the final judges saw them (`judge/schluss/in`,
 * assignment `judge/schluss/zuordnung.json`), against their verdicts
 * (`judge/schluss/out`):
 *
 *   - **Hits**: for each expected sentence where the judges gave path B the
 *     defect `falsch`, whether one of the B sentences there is flagged; plus, for
 *     each sentence in path B's `verboten_verletzt`, whether it is flagged.
 *   - **False alarms**: B sentences at expected sentences with verdict `gleich`
 *     and without `falsch` that are flagged.
 *
 * **Limit of the measurement:** the judge files do not carry each B sentence's
 * own anchors, only the lines of the expected sentence it sits under (the
 * variant lists all its sentences anchored at one of those lines). Those lines
 * serve as anchors here. In the product the module checks against the anchors
 * `validateStatementAnswer` left the sentence with.
 *
 * Development used only the learning half (`split.json → learn`); the holdout
 * half (`holdout`) was measured once, at the end.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { checkStatementAgainstCode, contradictionSourceOf, type StatementContradiction } from '../../lib/statement-contradiction';

const ROOT = join(process.cwd(), 'tests/prozess-benchmark');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const HALF = arg('--half', 'learn');
const SHOW = process.argv.includes('--show');

const split = JSON.parse(readFileSync(join(ROOT, 'split.json'), 'utf8')) as Record<string, string[]>;
const ids = split[HALF];
if (!Array.isArray(ids)) throw new Error(`no half ${HALF} in split.json`);
const zuordnung = JSON.parse(readFileSync(join(ROOT, 'judge/schluss/zuordnung.json'), 'utf8')) as Record<string, { B: string }>;

/** The same joining as `weg-b.ts` and `evaluate.ts` (BM_CONCAT=1). */
function source(id: string): string {
  const dir = join(ROOT, 'cases', id);
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

interface Satz { id: string; zeilen: number[]; [variant: string]: unknown }
interface Urteil { id: string; [variant: string]: { urteil: string; mangel: string[] } | string }

let falschTotal = 0;
let falschHit = 0;
let verbotenTotal = 0;
let verbotenHit = 0;
let verbotenOhneAnker = 0;
let gleichSentences = 0;
let gleichFlagged = 0;
let allSentences = 0;
let allFlagged = 0;
const byRule: Record<string, number> = {};
const verdicts: Record<string, number> = {};
const alarms: string[] = [];
const hits: string[] = [];

for (const id of ids) {
  const input = JSON.parse(readFileSync(join(ROOT, 'judge/schluss/in', `${id}.json`), 'utf8')) as { saetze: Satz[] };
  const output = JSON.parse(readFileSync(join(ROOT, 'judge/schluss/out', `${id}.json`), 'utf8')) as {
    urteile: Urteil[];
    verboten_verletzt: Array<{ variante: string; satz: string }>;
  };
  const B = zuordnung[id].B;
  const code = contradictionSourceOf(source(id));

  // A sentence can sit under several expected sentences; its anchors are then all their lines.
  const anchorsOf = new Map<string, number[]>();
  for (const satz of input.saetze) {
    for (const text of (satz[B] as string[]) ?? []) {
      anchorsOf.set(text, [...(anchorsOf.get(text) ?? []), ...satz.zeilen]);
    }
  }
  const marks = new Map<string, StatementContradiction | null>();
  for (const [text, lines] of anchorsOf) {
    const mark = checkStatementAgainstCode(code, { text, anchors: lines.map((l) => ({ lineStart: l, lineEnd: l })) });
    marks.set(text, mark);
    allSentences += 1;
    if (mark) {
      allFlagged += 1;
      byRule[mark.rule] = (byRule[mark.rule] ?? 0) + 1;
      verdicts[mark.verdict] = (verdicts[mark.verdict] ?? 0) + 1;
    }
  }

  for (const urteil of output.urteile) {
    const satz = input.saetze.find((s) => s.id === urteil.id);
    const b = urteil[B] as { urteil: string; mangel: string[] };
    const texts = ((satz?.[B] as string[]) ?? []);
    if (b.mangel.includes('falsch')) {
      falschTotal += 1;
      const hit = texts.find((t) => marks.get(t));
      if (hit) { falschHit += 1; hits.push(`${urteil.id} [${marks.get(hit)!.rule}] ${hit}`); }
    } else if (b.urteil === 'gleich') {
      for (const t of texts) {
        gleichSentences += 1;
        const mark = marks.get(t);
        if (mark) { gleichFlagged += 1; alarms.push(`${urteil.id} [${mark.rule}] ${t}\n    → ${mark.reason}`); }
      }
    }
  }
  for (const v of output.verboten_verletzt) {
    if (v.variante !== B) continue;
    verbotenTotal += 1;
    if (!anchorsOf.has(v.satz)) { verbotenOhneAnker += 1; continue; }
    if (marks.get(v.satz)) verbotenHit += 1;
  }
}

const pct = (a: number, b: number) => (b === 0 ? '–' : `${((100 * a) / b).toFixed(1)} %`);
console.log(`Half ${HALF}: ${ids.length} cases`);
console.log(`Expected sentences with B defect "falsch": ${falschHit} of ${falschTotal} flagged (${pct(falschHit, falschTotal)})`);
console.log(`Forbidden conclusions of B: ${verbotenHit} of ${verbotenTotal} flagged (${pct(verbotenHit, verbotenTotal)}), ${verbotenOhneAnker} without anchors in the judge files`);
console.log(`False alarms at "gleich" sentences: ${gleichFlagged} of ${gleichSentences} (${pct(gleichFlagged, gleichSentences)})`);
console.log(`All B sentences: ${allFlagged} of ${allSentences} flagged`, verdicts, byRule);
if (SHOW) {
  console.log('\nHits:\n' + hits.join('\n'));
  console.log('\nFalse alarms:\n' + alarms.join('\n'));
}
