#!/usr/bin/env node
/**
 * Does every model in the server-side register still answer?
 *
 * Roadmap 17.1. `gemini-2.5-pro` sat in `app/api/gemini/route.ts` as
 * "GA — stable fallback" for months while a `generateContent` call with the
 * production key answered HTTP 404, "no longer available to new users". The
 * model is still in that key's `ListModels` answer, so a listing-based check
 * would have reported it healthy. Only the call tells the two apart, and only
 * a person making it by hand ever did.
 *
 * So the call lives here, in a script that is run on purpose, and not in the
 * Playwright suite: the suite runs on every push, with no key in most
 * environments and no network in some, and a spec that reaches the provider
 * would go red for the environment rather than for the register — which is
 * worse than no check at all. What the suite holds instead is this script's
 * written record: `tests/gemini-model-pin.spec.ts` compares the register
 * against `tests/gemini-register-liveness.json` and fails when an entry has no
 * record, or a record that says it did not answer. Adding a model to the
 * register therefore means running this script; forgetting to is what turns
 * the suite red, offline and for free.
 *
 * Usage
 *   node scripts/check-gemini-register.mjs           # verify, exit 1 on a dead entry
 *   node scripts/check-gemini-register.mjs --write   # same, and record the result
 *
 * The key is read from `GEMINI_API_KEY` in the environment or in `.env.local`.
 * Without one the script exits 2 and writes nothing — it does not invent a
 * passing record, and it does not claim the register is healthy.
 *
 * Cost: one request per entry with `maxOutputTokens: 1` and a two-character
 * prompt. It is not a quality check and says nothing about how good an answer
 * is; it distinguishes "the endpoint serves this model for this key" from
 * "it does not".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = path.join(ROOT, 'app/api/gemini/route.ts');
const LEDGER = path.join(ROOT, 'tests/gemini-register-liveness.json');

/** The register, read out of the route rather than duplicated here. */
export function readRegister(source) {
  const start = source.indexOf('const ALLOWED_MODELS');
  if (start === -1) throw new Error('ALLOWED_MODELS not found in app/api/gemini/route.ts');
  const end = source.indexOf('])', start);
  const block = source.slice(start, end);
  const models = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (models.length === 0) throw new Error('the register block contains no model names');
  return models;
}

function readKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const envFile = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envFile)) return null;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*GEMINI_API_KEY\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function probe(model, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'hi' }] }],
      generationConfig: { maxOutputTokens: 1 },
    }),
  });
  const record = { httpStatus: res.status, answered: res.status === 200 };
  if (!record.answered) {
    const body = await res.text();
    let message = body.slice(0, 400);
    try {
      message = JSON.parse(body)?.error?.message ?? message;
    } catch {
      /* the body was not JSON; the raw prefix above is what there is to report */
    }
    record.providerMessage = message;
  }
  return record;
}

async function main() {
  const write = process.argv.includes('--write');
  const models = readRegister(fs.readFileSync(ROUTE, 'utf8'));
  const key = readKey();
  if (!key) {
    console.error('No GEMINI_API_KEY in the environment or .env.local. Nothing was checked and nothing was written.');
    process.exit(2);
  }

  const checkedAt = new Date().toISOString().slice(0, 10);
  const records = {};
  let dead = 0;
  for (const model of models) {
    const record = await probe(model, key);
    records[model] = { ...record, checkedAt };
    if (!record.answered) dead += 1;
    console.log(
      `${record.answered ? 'answers' : 'DEAD   '}  ${model}  HTTP ${record.httpStatus}` +
        (record.providerMessage ? `\n          ${record.providerMessage}` : ''),
    );
  }

  if (write) {
    const ledger = {
      note:
        'Written by scripts/check-gemini-register.mjs. One real generateContent call per entry of ' +
        'ALLOWED_MODELS in app/api/gemini/route.ts. tests/gemini-model-pin.spec.ts reads this file ' +
        'instead of the network. Re-run the script with --write after changing the register.',
      endpoint: 'POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
      models: records,
    };
    fs.writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
    console.log(`\nWritten: ${path.relative(ROOT, LEDGER)}`);
  }

  if (dead > 0) {
    console.error(`\n${dead} of ${models.length} register entries did not answer.`);
    process.exit(1);
  }
  console.log(`\nAll ${models.length} register entries answered.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(3);
  });
}
