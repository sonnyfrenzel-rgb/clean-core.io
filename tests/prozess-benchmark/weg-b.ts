/**
 * Weg B (Roadmap 17.8) über den Prozess-Benchmark: das Modell erzeugt die Fachsätze.
 *
 *   npx tsx tests/prozess-benchmark/weg-b.ts --out <ordner> [--range 1-200] [--parallel 4]
 *
 * Genau die Bausteine des Produkts: `buildStatementContext`, `buildStatementPrompt`,
 * `validateStatementAnswer` aus `lib/business-statement-prompt.ts`, das Produktmodell
 * `PRODUCT_GEMINI_MODEL` und JSON-Antwort wie `/api/gemini`. Nur der Weg dorthin ist ein
 * anderer: der Aufruf geht direkt an die Gemini-API (Schlüssel `GEMINI_API_KEY` aus der
 * Umgebung oder `.env.local`), ohne Anmeldung und ohne Quittung — gemessen wird der Satz,
 * nicht der Transport.
 *
 * Mehrdateifälle werden wie in `evaluate.ts` (BM_CONCAT=1) zu einer Quelle zusammengefügt,
 * weil das Produkt genau eine Quelle annimmt. Je Fall entsteht `<ordner>/BM-nnn.json` mit
 * Rohantwort, geprüften Sätzen, Verwerfungen und Tokenzahlen; vorhandene Dateien werden
 * übersprungen, der Lauf lässt sich also fortsetzen.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GoogleGenAI } from '@google/genai';
import { PRODUCT_GEMINI_MODEL } from '../../lib/constants';
import {
  buildStatementContext,
  buildStatementPrompt,
  validateStatementAnswer,
} from '../../lib/business-statement-prompt';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = arg('--out', 'tmp/weg-b');
const [LO, HI] = arg('--range', '1-200').split('-').map(Number);
const PARALLEL = Number(arg('--parallel', '4'));
const ROOT = join(process.cwd(), 'tests/prozess-benchmark/cases');

function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='));
  const value = line?.slice('GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error('GEMINI_API_KEY fehlt');
  return value;
}

/** Dieselbe Zusammenfügung wie `concatenate` in evaluate.ts. */
function source(id: string): { name: string; code: string } {
  const dir = join(ROOT, id);
  const files = readdirSync(dir).filter((f) => f.endsWith('.abap')).sort();
  const read = files.map((name) => ({ name, code: readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n') }));
  if (read.length === 1) return read[0];
  const head = (code: string) => /^\s*(REPORT|PROGRAM|FUNCTION-POOL)\b/im.test(code);
  read.sort((a, b) => Number(head(b.code)) - Number(head(a.code)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const lines: string[] = [];
  for (const file of read) {
    const own = file.code.split('\n');
    if (own[own.length - 1] === '') own.pop();
    lines.push(...own);
  }
  return { name: 'combined.abap', code: lines.join('\n') + '\n' };
}

const ai = new GoogleGenAI({ apiKey: apiKey() });
mkdirSync(OUT, { recursive: true });
const ids = readdirSync(ROOT)
  .filter((n) => /^BM-\d{3}$/.test(n) && Number(n.slice(3)) >= LO && Number(n.slice(3)) <= HI)
  .sort()
  .filter((id) => !existsSync(join(OUT, `${id}.json`)));

let tokensIn = 0;
let tokensOut = 0;
let done = 0;

async function one(id: string): Promise<void> {
  const context = buildStatementContext([source(id)]);
  const prompt = buildStatementPrompt(context);
  let text = '';
  let usage: Record<string, unknown> = {};
  let error: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: PRODUCT_GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      text = result.text ?? '';
      usage = (result.usageMetadata ?? {}) as Record<string, unknown>;
      error = null;
      if (text) break;
      error = 'leere Antwort';
    } catch (e) {
      error = String((e as Error).message ?? e).slice(0, 300);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
  const validated = validateStatementAnswer(context, text);
  tokensIn += Number(usage.promptTokenCount ?? 0);
  tokensOut += Number(usage.candidatesTokenCount ?? 0) + Number(usage.thoughtsTokenCount ?? 0);
  writeFileSync(
    join(OUT, `${id}.json`),
    JSON.stringify(
      {
        id,
        model: PRODUCT_GEMINI_MODEL,
        error,
        usage,
        discarded: validated.discarded,
        statements: validated.statements.map((s) => ({
          text: s.text,
          anchors: s.anchors.map((a) => `${a.file}:${a.lineStart}`).join(','),
          element: s.element?.id ?? null,
        })),
        raw: text,
      },
      null,
      1,
    ),
  );
  done += 1;
  console.log(`${id} ${validated.statements.length} Sätze, ${validated.discarded.total} verworfen${error ? `, Fehler: ${error}` : ''} (${done}/${ids.length})`);
}

(async () => {
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (queue.length) await one(queue.shift() as string);
    }),
  );
  console.log(`Tokens: Eingabe ${tokensIn}, Ausgabe inkl. Denken ${tokensOut}`);
})();
