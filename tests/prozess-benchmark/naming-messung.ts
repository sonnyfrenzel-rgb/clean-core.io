/**
 * Measurement run for the naming stage with the engine's facts (concept "Business-Lesbarkeit" §5, "Modelltest für H7";
 * owner decision of 06.11.2026). Baseline naming (the prompt of 3.0.21) against naming with facts and the checker
 * (3.0.22, `lib/naming-facts.ts`), on LEARN cases only, with the model the naming stage uses.
 *
 *   npx tsx tests/prozess-benchmark/naming-messung.ts --cases 30 --out <dir> [--budget 2]
 *
 * The key is read from the environment or the main checkout's `.env.local` at run time and never printed. The run
 * stops before a call that could take the estimated cost past the budget (priced high on purpose: USD 0.50 per
 * million tokens in, USD 3.00 out, thinking counted as output). Never reads a holdout case.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GoogleGenAI } from '@google/genai';
import { NAMING_GEMINI_MODEL } from '../../lib/constants';
import { buildNamingPrompt, namingContextOf, validateNamingAnswer, type NamingContext } from '../../lib/process-naming';
import { uncoveredWords } from '../../lib/naming-facts';
import { plainLabels } from '../../lib/abap/plain-language';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const COUNT = Number(arg('--cases', '30'));
const OUT = arg('--out', join(process.cwd(), 'scratch', 'naming-messung'));
const BUDGET = Number(arg('--budget', '2'));
const PRICE_IN = 0.5 / 1e6;
const PRICE_OUT = 3.0 / 1e6;

const ROOT = join(__dirname, 'cases');
const split = JSON.parse(readFileSync(join(__dirname, 'split.json'), 'utf8')) as Record<string, string[]>;
const learn = [...split.learn, ...split.w3_learn];

function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const file of ['.env.local', join(__dirname, '..', '..', '..', '..', '..', '.env.local')]) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='));
    const value = line?.slice('GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
    if (value) return value;
  }
  throw new Error('GEMINI_API_KEY is missing');
}

/** The same joining as `concatenate` in evaluate.ts. Refuses any id outside LEARN. */
function caseSource(id: string): string {
  if (!learn.includes(id)) throw new Error(`${id} is not a LEARN case`);
  const dir = join(ROOT, id);
  const files = readdirSync(dir).filter((f) => f.endsWith('.abap')).sort();
  const read = files.map((name) => ({ name, code: readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n') }));
  if (read.length === 1) return read[0].code;
  const head = (code: string) => /^\s*(REPORT|PROGRAM|FUNCTION-POOL)\b/im.test(code);
  read.sort((a, b) => Number(head(b.code)) - Number(head(a.code)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return read.map((f) => f.code.replace(/\n$/, '')).join('\n') + '\n';
}

const ai = new GoogleGenAI({ apiKey: apiKey() });
let spent = 0;

async function call(prompt: string): Promise<{ text: string; ms: number; tokensIn: number; tokensOut: number; error: string | null }> {
  const estimate = (prompt.length / 3.5) * PRICE_IN + 6000 * PRICE_OUT;
  if (spent + estimate > BUDGET) return { text: '', ms: 0, tokensIn: 0, tokensOut: 0, error: 'budget' };
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await ai.models.generateContent({ model: NAMING_GEMINI_MODEL, contents: prompt, config: { responseMimeType: 'application/json' } });
      const u = (result.usageMetadata ?? {}) as Record<string, number>;
      const tokensIn = Number(u.promptTokenCount ?? 0);
      const tokensOut = Number(u.candidatesTokenCount ?? 0) + Number(u.thoughtsTokenCount ?? 0);
      spent += tokensIn * PRICE_IN + tokensOut * PRICE_OUT;
      return { text: result.text ?? '', ms: Date.now() - t0, tokensIn, tokensOut, error: null };
    } catch (e) {
      if (attempt === 3) return { text: '', ms: Date.now() - t0, tokensIn: 0, tokensOut: 0, error: String((e as Error).message ?? e).slice(0, 200) };
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  return { text: '', ms: 0, tokensIn: 0, tokensOut: 0, error: 'unreachable' };
}

interface NodeRow { id: string; kind: string; technical: string; engine: string; facts: string[]; baseline?: string; withFacts?: string; baselineUncovered?: string[] }

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const ids = [...learn].sort((a, b) => createHash('sha256').update(`naming-2026-11-06:${a}`).digest('hex').localeCompare(createHash('sha256').update(`naming-2026-11-06:${b}`).digest('hex'))).slice(0, COUNT);
  const summary: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    const source = caseSource(id);
    const base: NamingContext = namingContextOf(source, { engineVersion: '3.0.21', facts: false });
    const withFacts: NamingContext = namingContextOf(source, { engineVersion: '3.0.22', facts: true });
    const engine = plainLabels(withFacts.skeleton, source, { engineVersion: '3.0.22' });
    const r0 = await call(buildNamingPrompt(base));
    const r1 = await call(buildNamingPrompt(withFacts));
    const v0 = validateNamingAnswer(base, r0.text);
    const v1 = validateNamingAnswer(withFacts, r1.text);
    const rows: NodeRow[] = withFacts.skeleton.nodes.map((n) => ({
      id: n.id, kind: n.kind, technical: n.label, engine: engine.nodes.get(n.id) ?? '',
      facts: (withFacts.facts?.get(n.id) ?? []).map((f) => `[${f.id}] ${f.kind}: ${f.text}`),
    }));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const name of v0.names) {
      const row = byId.get(name.id);
      if (!row) continue;
      row.baseline = name.name;
      const node = withFacts.skeleton.nodes.find((n) => n.id === name.id)!;
      const evidence = [...(withFacts.facts?.get(name.id) ?? []).map((f) => f.text), node.label,
        ...withFacts.skeleton.edges.filter((e) => e.from === node.id && e.condition).map((e) => e.condition),
        withFacts.skeleton.regions.find((r) => r.key === node.region)?.label ?? ''];
      row.baselineUncovered = uncoveredWords(name.name, evidence);
    }
    for (const name of v1.names) { const row = byId.get(name.id); if (row) row.withFacts = name.name; }
    const levels = new Set(withFacts.skeleton.nodes.map((n) => n.region)).size;
    const entry = {
      id, nodes: rows.length, levels,
      baseline: { ms: r0.ms, tokensIn: r0.tokensIn, tokensOut: r0.tokensOut, error: r0.error, accepted: v0.names.length, discarded: v0.discarded },
      withFacts: { ms: r1.ms, tokensIn: r1.tokensIn, tokensOut: r1.tokensOut, error: r1.error, accepted: v1.names.length, discarded: v1.discarded },
      baselineUncovered: rows.filter((r) => r.baselineUncovered?.length).length,
    };
    summary.push(entry);
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ ...entry, rows }, null, 1));
    console.log(`${id} nodes ${rows.length} | base ${v0.names.length} named ${r0.ms} ms (${entry.baselineUncovered} uncovered) | facts ${v1.names.length} named ${r1.ms} ms, dropped ${JSON.stringify(v1.discarded.byRule)} | spent ~$${spent.toFixed(3)}`);
    if (r0.error === 'budget' || r1.error === 'budget') break;
  }
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ model: NAMING_GEMINI_MODEL, spentEstimateUsd: spent, cases: summary }, null, 1));
  console.log(`done, estimated spend (high prices) $${spent.toFixed(3)}`);
}

main().catch((e) => { console.error(String((e as Error).message ?? e).slice(0, 300)); process.exit(1); });
