/**
 * Path B over the process benchmark with a selectable writer model, thinking level and output bound —
 * the evaluation harness behind the model-combination study (night/model-combo, 13.11.2026).
 *
 *   npx tsx tests/prozess-benchmark/weg-b-model.ts --out <folder> --ids <file> --model <id>
 *       [--thinking none|minimal|low|medium|high] [--max-out N] [--parallel 3]
 *       [--ledger <file>] [--cap-usd N]
 *       [--mode rewrite --from <folder>]
 *
 * Exactly the product's building blocks for the `statements` stage: `buildStatementContext`,
 * `buildStatementPrompt`, `validateStatementAnswer` (`lib/business-statement-prompt.ts`), JSON mode without
 * a schema (`responseSchemaForStage('statements')` is undefined), the stage's output bound unless
 * `--max-out` says otherwise. Only the transport differs from `/api/gemini`: the call goes straight to the
 * API with `GEMINI_API_KEY`, without sign-in and without a receipt — what is measured is the sentence.
 *
 * Every call is appended to the ledger (JSON lines: tokens, finish reason, cost at list price) and the
 * run stops before a call once the ledger's total reaches `--cap-usd`: the spend cap is a fact of the file,
 * not of one process.
 *
 * `--mode rewrite` is strategy c of the study: the statements of an earlier answer (`--from`) are reworded
 * for a business reader by the model named here, anchors, element and uncertainty untouched. A rewording
 * that moves an anchor, drops a number or a quoted literal, or does not pass the product's validator falls
 * back to the original sentence, and the fallback is counted.
 *
 * Nothing here reads an expected answer. Multi-file cases are joined as in `evaluate.ts` and `weg-b.ts`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { PRODUCT_GEMINI_MODEL } from '../../lib/constants';
import { STAGE_MAX_OUTPUT_TOKENS } from '../../lib/model-call-stage';
import {
  buildStatementContext,
  buildStatementPrompt,
  validateStatementAnswer,
  type StatementContext,
} from '../../lib/business-statement-prompt';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = arg('--out', 'tmp/weg-b-model');
const IDS = arg('--ids', '');
const MODEL = arg('--model', PRODUCT_GEMINI_MODEL);
const THINKING_ARG = arg('--thinking', 'none').toLowerCase();
const MAX_OUT = Number(arg('--max-out', String(STAGE_MAX_OUTPUT_TOKENS.statements)));
const PARALLEL = Number(arg('--parallel', '3'));
const LEDGER = arg('--ledger', '');
const CAP_USD = Number(arg('--cap-usd', '0'));
const MODE = arg('--mode', 'write');
const FROM = arg('--from', '');
const ROOT = join(process.cwd(), 'tests/prozess-benchmark/cases');

const LEVELS: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};
const THINKING: ThinkingConfig | undefined = LEVELS[THINKING_ARG] ? { thinkingLevel: LEVELS[THINKING_ARG] } : undefined;
if (THINKING_ARG !== 'none' && !THINKING) throw new Error(`unknown thinking level: ${THINKING_ARG}`);

/** List prices, USD per million tokens (input, output incl. thinking), as of 13.11.2026. */
const PRICES: Record<string, [number, number]> = {
  'gemini-3.8-flash': [0.75, 3.75],
  'gemini-3.6-flash': [0.75, 3.75],
  'gemini-4-hydrogen': [1.5, 7.5],
  'gemini-3.5-flash-lite': [0.1, 0.4],
};

function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='));
  const value = line?.slice('GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error('GEMINI_API_KEY is missing');
  return value;
}

/** The same joining as `concatenate` in evaluate.ts. */
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

/* ------------------------------------------------------------------ ledger */

function spent(): number {
  if (!LEDGER || !existsSync(LEDGER)) return 0;
  return readFileSync(LEDGER, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((sum, line) => sum + (Number((JSON.parse(line) as { costUsd?: number }).costUsd) || 0), 0);
}

function costOf(model: string, usage: Record<string, unknown>): number {
  const [pi, po] = PRICES[model] ?? [1.5, 7.5];
  const inp = Number(usage.promptTokenCount ?? 0);
  const out = Number(usage.candidatesTokenCount ?? 0) + Number(usage.thoughtsTokenCount ?? 0);
  return (inp * pi + out * po) / 1e6;
}

function record(entry: Record<string, unknown>): void {
  if (!LEDGER) return;
  appendFileSync(LEDGER, JSON.stringify(entry) + '\n');
}

/* ------------------------------------------------------------------ rewrite (strategy c) */

interface RawStatement {
  text: string;
  anchors: string;
  ranges: Array<[string, number, number]>;
  uncertainty: unknown;
  element: string | null;
}

/** Numbers and quoted literals a rewording must keep. */
function facts(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/'[^']*'|"[^"]*"|\b\d+(?:[.,]\d+)?\b/g)) out.push(m[0].replace(/^"|"$/g, "'").replace(/^(?!')/, '').trim());
  return out;
}

/**
 * The checked sentence carries its open rest already ("<core>; <note>", `validateStatementAnswer`), and the raw
 * record keeps the note as an object; so the rewording sees the whole sentence and no separate uncertainty, and
 * passes none back.
 */
function buildRewritePrompt(context: StatementContext, statements: RawStatement[]): string {
  const given = statements.map((s) => ({
    text: s.text,
    anchors: s.anchors.split(','),
    element: s.element,
    uncertainty: null,
  }));
  const lines: string[] = [
    'You reword business statements about a piece of ABAP code for a business reader who does not read ABAP.',
    '',
    'Below is a JSON list of statements. Each is anchored to code lines and may name a process element. Reword only the "text":',
    '1. Say what happens in business terms: name the business thing (the customer, the order quantity, the posting date), not the',
    '   variable or the technical field. A table or field name may stay at most once, in parentheses, where no business term is evident.',
    '2. Keep every fact: every literal value, number, comparison boundary, condition and outcome, every "not", "only", "unless".',
    '   Do not add a fact, an assessment or a consequence the statement does not state. Do not drop a clause.',
    '3. One sentence, English, passive voice, plain words, no Markdown, no backticks, at most 300 characters. Merge nothing, split nothing.',
    '4. Keep "anchors", "element" and "uncertainty" exactly as given, in the same order: one output statement per input statement.',
    '',
    'Answer with JSON only, in exactly this shape and with no other keys:',
    '{"statements":[{"text":"<reworded statement>","anchors":["<file>:<line>"],"element":"<as given>","uncertainty":"<as given>"}]}',
    '',
    'Statements:',
    JSON.stringify(given),
  ];
  for (const src of context.sources) {
    lines.push('', `Source ${src.name}, with line numbers (for the facts; describe nothing that is not in a statement above):`);
    src.code.split('\n').slice(0, src.lineCount).forEach((text, index) => {
      lines.push(`${String(index + 1).padStart(4)}  ${text}`);
    });
  }
  return lines.join('\n');
}

/**
 * The reworded answer, statement by statement against the original: a rewording that moved an anchor, changed the
 * element or the uncertainty, lost a number or a literal, or grew past the product's bound keeps the original text.
 */
function mergeRewrite(original: RawStatement[], answer: string): { text: string; kept: number; reworded: number } {
  let parsed: { statements?: unknown } = {};
  try {
    parsed = JSON.parse(answer) as { statements?: unknown };
  } catch {
    parsed = {};
  }
  const got = Array.isArray(parsed.statements) ? (parsed.statements as Array<Record<string, unknown>>) : [];
  let kept = 0;
  let reworded = 0;
  const merged = original.map((o, i) => {
    const r = got[i];
    const anchors = o.anchors.split(',');
    const same =
      r &&
      typeof r.text === 'string' &&
      Array.isArray(r.anchors) &&
      JSON.stringify([...(r.anchors as string[])].sort()) === JSON.stringify([...anchors].sort()) &&
      (r.element ?? null) === (o.element ?? null) &&
      (r.uncertainty ?? null) === null;
    const text = same ? (r.text as string).trim() : '';
    const keepsFacts = text && facts(o.text).every((f) => text.includes(f));
    if (same && keepsFacts && text.length > 0 && text.length <= 400) {
      reworded += 1;
      return { text, anchors, element: o.element, uncertainty: null };
    }
    kept += 1;
    return { text: o.text, anchors, element: o.element, uncertainty: null };
  });
  return { text: JSON.stringify({ statements: merged }), kept, reworded };
}

/* ------------------------------------------------------------------ run */

const ai = new GoogleGenAI({ apiKey: apiKey() });
mkdirSync(OUT, { recursive: true });
const wanted = IDS ? new Set(readFileSync(IDS, 'utf8').split(/\s+/).filter(Boolean)) : null;
const ids = readdirSync(ROOT)
  .filter((n) => /^BM-\d{3}$/.test(n) && (!wanted || wanted.has(n)))
  .sort()
  .filter((id) => !existsSync(join(OUT, `${id}.json`)))
  .filter((id) => MODE !== 'rewrite' || existsSync(join(FROM, `${id}.json`)));

let done = 0;
let stopped = false;

async function one(id: string): Promise<void> {
  if (CAP_USD > 0 && spent() >= CAP_USD) {
    if (!stopped) console.error(`spend cap reached (${spent().toFixed(2)} USD >= ${CAP_USD}); no further calls`);
    stopped = true;
    return;
  }
  const context = buildStatementContext([source(id)]);
  let original: RawStatement[] = [];
  let prompt: string;
  if (MODE === 'rewrite') {
    const from = JSON.parse(readFileSync(join(FROM, `${id}.json`), 'utf8')) as { complete: boolean; statements: RawStatement[] };
    original = from.complete ? from.statements : [];
    if (original.length === 0) {
      writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ id, model: MODEL, mode: MODE, from: FROM, complete: false, statements: [], discarded: { total: 0, byRule: {} }, error: 'nothing to reword' }, null, 1));
      return;
    }
    prompt = buildRewritePrompt(context, original);
  } else {
    prompt = buildStatementPrompt(context);
  }
  let text = '';
  let usage: Record<string, unknown> = {};
  let error: string | null = null;
  let finishReason: string | null = null;
  let modelVersion: string | null = null;
  let latencyMs: number | null = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= 6; attempt++) {
    attempts = attempt;
    const t0 = Date.now();
    try {
      const result = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          ...(THINKING ? { thinkingConfig: THINKING } : {}),
          maxOutputTokens: MAX_OUT,
        },
      });
      latencyMs = Date.now() - t0;
      text = result.text ?? '';
      usage = (result.usageMetadata ?? {}) as Record<string, unknown>;
      finishReason = (result.candidates?.[0]?.finishReason as string | undefined) ?? null;
      modelVersion = (result as { modelVersion?: string }).modelVersion ?? null;
      record({ at: new Date().toISOString(), id, model: MODEL, modelVersion, thinking: THINKING_ARG, maxOut: MAX_OUT, mode: MODE, finishReason, latencyMs,
        promptTokenCount: usage.promptTokenCount ?? null, candidatesTokenCount: usage.candidatesTokenCount ?? null, thoughtsTokenCount: usage.thoughtsTokenCount ?? null,
        costUsd: costOf(MODEL, usage) });
      error = null;
      if (text) break;
      error = 'empty answer';
    } catch (e) {
      error = String((e as Error).message ?? e).slice(0, 300);
      record({ at: new Date().toISOString(), id, model: MODEL, thinking: THINKING_ARG, mode: MODE, failed: true, error: error.slice(0, 120), costUsd: 0 });
      const transient = /429|503|500|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|fetch failed|ECONNRESET/i.test(error);
      if (!transient && attempt >= 2) break;
      await new Promise((r) => setTimeout(r, Math.min(60000, 5000 * 2 ** (attempt - 1))));
    }
  }
  const complete = finishReason === 'STOP' && !!text;
  let rewrite: { kept: number; reworded: number } | null = null;
  let answer = text;
  if (MODE === 'rewrite') {
    // An incomplete rewording keeps every original sentence; the fallback is what the product would show.
    const merged = complete ? mergeRewrite(original, text) : { text: JSON.stringify({ statements: original.map((o) => ({ text: o.text, anchors: o.anchors.split(','), element: o.element, uncertainty: null })) }), kept: original.length, reworded: 0 };
    answer = merged.text;
    rewrite = { kept: merged.kept, reworded: merged.reworded };
  }
  const validated = validateStatementAnswer(context, answer);
  writeFileSync(
    join(OUT, `${id}.json`),
    JSON.stringify(
      {
        id,
        model: MODEL,
        modelVersion,
        thinking: THINKING_ARG,
        maxOut: MAX_OUT,
        mode: MODE,
        ...(MODE === 'rewrite' ? { from: FROM, rewrite } : {}),
        finishReason,
        // A rewording run is complete when its sentences stand, reworded or kept: the fallback is deterministic.
        complete: MODE === 'rewrite' ? original.length > 0 : complete,
        latencyMs,
        attempts,
        promptChars: prompt.length,
        error,
        usage,
        costUsd: costOf(MODEL, usage),
        discarded: validated.discarded,
        statements: validated.statements.map((s) => ({
          text: s.text,
          anchors: s.anchors.map((a) => `${a.file}:${a.lineStart}`).join(','),
          ranges: s.anchors.map((a) => [a.file, a.lineStart, a.lineEnd]),
          uncertainty: (s as { uncertainty?: unknown }).uncertainty ?? null,
          element: s.element?.id ?? null,
        })),
        raw: text,
      },
      null,
      1,
    ),
  );
  done += 1;
  console.log(
    `${id} ${MODEL}/${THINKING_ARG} ${latencyMs}ms ${finishReason} think=${usage.thoughtsTokenCount ?? 0} out=${usage.candidatesTokenCount ?? 0} ` +
      `${validated.statements.length} sentences, ${validated.discarded.total} discarded${rewrite ? `, reworded ${rewrite.reworded}/${rewrite.reworded + rewrite.kept}` : ''}` +
      `${error ? `, error: ${error}` : ''} (${done}/${ids.length}, spent ${spent().toFixed(2)} USD)`,
  );
}

(async () => {
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (queue.length && !stopped) await one(queue.shift() as string);
    }),
  );
  console.log(`done ${done}/${ids.length}; ledger total ${spent().toFixed(2)} USD`);
})();
