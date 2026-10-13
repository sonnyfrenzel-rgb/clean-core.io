import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readBoundedJson, ResponseLimitError } from '../lib/url-validation';
import {
  MAX_APPLIES_TO,
  MAX_STATE_CHOICES,
  MAX_STATE_NOTE,
  MAX_VALUE_SOURCE_NOTE,
  PROCESS_STATES_BODY_LIMITS,
} from '../lib/process-states';

/**
 * `POST /api/projects/{id}/process-states` reads its body under a bound.
 *
 * Server-free: the bound is the shared reader (`readBoundedJson`) with the
 * constant the route passes, exercised on real `Request` bodies; the route's
 * use of it is checked in its source. The route's own 413, answered before the
 * process is opened, is executed against the emulators in
 * tests/process-states-route.spec.ts.
 */

const ROOT = path.resolve(__dirname, '..');
const ROUTE = 'app/api/projects/[projectId]/process-states/route.ts';

/** The file with its comments taken out, so an explanation cannot satisfy a guard. */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const asResponse = (req: Request) => new Response(req.body, { headers: req.headers });

/** The largest request `checkStateChoices` accepts, every field at its maximum, in three-byte characters. */
function largestLegitimateBody(): string {
  const wide = '€'; // three bytes in UTF-8
  const choices = Array.from({ length: MAX_STATE_CHOICES }, (_, i) => ({
    subject: `BR-${String(i).padStart(4, '0')}`,
    kind: 'rule',
    state: 'change',
    note: wide.repeat(MAX_STATE_NOTE),
    valueSource: { kind: 'business-requirement', note: wide.repeat(MAX_VALUE_SOURCE_NOTE) },
    appliesTo: Array.from({ length: MAX_APPLIES_TO }, (_, j) => `BR-${String(j + 1000).padStart(4, '0')}`),
  }));
  return JSON.stringify({ baseRevision: 12, choices });
}

test('the largest acceptable request fits under the bound and parses', async () => {
  const body = largestLegitimateBody();
  const bytes = Buffer.byteLength(body, 'utf8');
  expect(bytes).toBeLessThan(PROCESS_STATES_BODY_LIMITS.maxBytes);
  const req = new Request('http://localhost/x', { method: 'POST', body });
  const parsed = await readBoundedJson(asResponse(req), PROCESS_STATES_BODY_LIMITS);
  expect(parsed.choices).toHaveLength(MAX_STATE_CHOICES);
});

test('a body over the bound is refused before it is parsed', async () => {
  // Not JSON at all: a parse would throw SyntaxError. The bound answers first.
  const over = 'x'.repeat(PROCESS_STATES_BODY_LIMITS.maxBytes + 1);
  const streamed = new Request('http://localhost/x', { method: 'POST', body: over });
  await expect(readBoundedJson(asResponse(streamed), PROCESS_STATES_BODY_LIMITS)).rejects.toBeInstanceOf(ResponseLimitError);

  // A declared length above the bound is refused before a byte is read.
  const declared = new Request('http://localhost/x', {
    method: 'POST',
    body: '{}',
    headers: { 'content-length': String(PROCESS_STATES_BODY_LIMITS.maxBytes + 1) },
  });
  await expect(readBoundedJson(asResponse(declared), PROCESS_STATES_BODY_LIMITS)).rejects.toBeInstanceOf(ResponseLimitError);
});

test('the route reads its body through the bounded reader, before the project is opened', () => {
  const src = code(ROUTE);
  const post = src.slice(src.indexOf('export async function POST'));
  const read = post.indexOf('readBoundedJson(new Response(req.body, { headers: req.headers }), PROCESS_STATES_BODY_LIMITS)');
  expect(read, 'the POST no longer reads through the bounded reader').toBeGreaterThan(-1);
  expect(post, 'the POST buffers the whole request again').not.toMatch(/\breq\.(json|text)\(\)/);
  expect(read, 'the body is read after the project is opened').toBeLessThan(post.indexOf('await open(db, gate)'));
  expect(read).toBeLessThan(post.indexOf('checkStateChoices('));
  // Too large is its own answer, not a 500 and not "bad request".
  expect(post).toMatch(/bodyErr instanceof ResponseLimitError[\s\S]{0,200}status: 413/);
});
