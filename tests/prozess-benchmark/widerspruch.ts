/**
 * Das Widerspruchsmodul (Roadmap 17.10) über den Prozess-Benchmark.
 *
 *   npx tsx tests/prozess-benchmark/widerspruch.ts --half learn    [--show]
 *   npx tsx tests/prozess-benchmark/widerspruch.ts --half holdout
 *
 * Gemessen wird `checkStatementAgainstCode` aus `lib/statement-contradiction.ts`
 * an den Sätzen von Weg B, wie die Schlussrichter sie gesehen haben
 * (`judge/schluss/in`, Zuordnung `judge/schluss/zuordnung.json`), gegen deren
 * Urteile (`judge/schluss/out`):
 *
 *   - **Treffer**: je Sollsatz, an dem die Richter Weg B den Mangel `falsch`
 *     gegeben haben, ob einer der B-Sätze dort markiert wird; dazu je Satz aus
 *     `verboten_verletzt` von Weg B, ob er markiert wird.
 *   - **Fehlalarme**: B-Sätze an Sollsätzen mit Urteil `gleich` und ohne
 *     `falsch`, die markiert werden.
 *
 * **Grenze der Messung:** die Richterdateien tragen je B-Satz nicht seine
 * eigenen Anker, sondern nur die Zeilen des Sollsatzes, unter dem er steht (die
 * Variante nennt alle ihre Sätze, die an einer dieser Zeilen verankert sind).
 * Diese Zeilen stehen hier als Anker. Im Produkt prüft das Modul gegen die
 * Anker, die `validateStatementAnswer` dem Satz gelassen hat.
 *
 * Entwickelt wurde nur an der Lernhälfte (`split.json → learn`); die
 * Prüfhälfte (`holdout`) wurde einmal gemessen, am Ende.
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
if (!Array.isArray(ids)) throw new Error(`keine Hälfte ${HALF} in split.json`);
const zuordnung = JSON.parse(readFileSync(join(ROOT, 'judge/schluss/zuordnung.json'), 'utf8')) as Record<string, { B: string }>;

/** Dieselbe Zusammenfügung wie `weg-b.ts` und `evaluate.ts` (BM_CONCAT=1). */
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

  // Ein Satz kann unter mehreren Sollsätzen stehen; seine Anker sind dann alle ihre Zeilen.
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
console.log(`Hälfte ${HALF}: ${ids.length} Fälle`);
console.log(`Sollsätze mit B-Mangel „falsch“: ${falschHit} von ${falschTotal} markiert (${pct(falschHit, falschTotal)})`);
console.log(`Verbotene Schlüsse von B: ${verbotenHit} von ${verbotenTotal} markiert (${pct(verbotenHit, verbotenTotal)}), ${verbotenOhneAnker} ohne Anker in den Richterdateien`);
console.log(`Fehlalarme an „gleich“-Sätzen: ${gleichFlagged} von ${gleichSentences} (${pct(gleichFlagged, gleichSentences)})`);
console.log(`Alle B-Sätze: ${allFlagged} von ${allSentences} markiert`, verdicts, byRule);
if (SHOW) {
  console.log('\nTreffer:\n' + hits.join('\n'));
  console.log('\nFehlalarme:\n' + alarms.join('\n'));
}
