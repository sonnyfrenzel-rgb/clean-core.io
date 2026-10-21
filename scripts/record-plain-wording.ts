/**
 * Records real plain-wording answers for the guard of roadmap 3.0.20, owner decision 2.
 *
 *   npx tsx scripts/record-plain-wording.ts --env <path to a dotenv file with GEMINI_API_KEY>
 *
 * One call per scope (the walk-through and the rule explanations) on the 1,000-line starter
 * example, exactly the prompt the product sends (`plainWordingPrompt`), a JSON answer at the
 * thinking level the proxy gives the shape (LOW). The proxy also passes the shape's JSON schema
 * (`PLAIN_WORDING_SCHEMA`); this recording did not, so it is the stricter test of the guard. The answers and the token counts the provider reported are written to
 * `tests/fixtures/plain-wording.gemini-3.8-flash.json`, which `tests/plain-wording.spec.ts`
 * reads without touching the network. Two calls; a few cents. The key is never printed.
 */
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { readSource } from '../lib/first-look';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import { buildWalkGuide } from '../lib/process-walk-guide';
import { PRODUCT_GEMINI_MODEL } from '../lib/constants';
import { plainItemsOf, plainWordingPrompt, rulePlainSentences, walkPlainSentences, type PlainScope } from '../lib/plain-wording';

const ROOT = path.resolve(__dirname, '..');
const FILE = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const OUT = path.join(ROOT, 'tests', 'fixtures', `plain-wording.${PRODUCT_GEMINI_MODEL}.json`);

export function exampleSentences(scope: PlainScope): Array<{ text: string; anchor: { lineStart: number; lineEnd: number } | null }> {
  const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', FILE), 'utf8').split('\r\n').join('\n');
  if (scope === 'walk') {
    const { bpmn, technical } = buildReadingExports(source, { processName: FILE, sourceFileName: FILE });
    const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: FILE });
    return walkPlainSentences(buildWalkGuide(source, model, walkOrder(model, null)));
  }
  const reading = readSource(source);
  return rulePlainSentences(explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source)));
}

async function main() {
  const envFile = process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : null;
  const fromFile = envFile
    ? /^GEMINI_API_KEY=(.*)$/m.exec(fs.readFileSync(envFile, 'utf8'))?.[1]?.trim().replace(/^"|"$/g, '')
    : undefined;
  const key = process.env.GEMINI_API_KEY || fromFile;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');
  const ai = new GoogleGenAI({ apiKey: key });

  const recorded: Array<{ scope: PlainScope; items: number; usage: unknown; answer: string; ms: number }> = [];
  for (const scope of ['walk', 'rules'] as const) {
    const items = plainItemsOf(exampleSentences(scope));
    const started = Date.now();
    const result = await ai.models.generateContent({
      model: PRODUCT_GEMINI_MODEL,
      contents: plainWordingPrompt(scope, items),
      // The thinking level the proxy uses for this shape (`lib/model-thinking.ts`, 'plain-wording').
      config: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    recorded.push({ scope, items: items.length, usage: result.usageMetadata ?? null, answer: result.text ?? '', ms: Date.now() - started });
    console.log(scope, items.length, 'items', JSON.stringify(result.usageMetadata ?? null), `${Date.now() - started} ms`);
  }
  fs.writeFileSync(OUT, `${JSON.stringify({ model: PRODUCT_GEMINI_MODEL, example: FILE, recordedAt: new Date().toISOString().slice(0, 10), recorded }, null, 2)}\n`);
  console.log(`→ ${path.relative(ROOT, OUT)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
