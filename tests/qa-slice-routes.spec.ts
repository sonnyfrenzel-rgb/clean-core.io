/**
 * Route findings of the QA slice reviews of 30.09.2026, each confirmed against
 * the current code and fixed.
 *
 * - f87ce9ae9496: a JSON `null` body made the consent route answer 500.
 * - e6a8d32f903a, 44f03f652da7: two write routes read their body without a byte
 *   bound; the contract store also derived a contract from a source the GET
 *   refuses as too large.
 * - 0d9a23f48357: the runner self-test cleared its deadline before reading the
 *   body, so a stalled body had none.
 * - 4688e78a3516: a destination with an unsupported authentication type was
 *   read anonymously.
 * - 33d5babb43a6: the web verifier read the whole archive before comparing its
 *   size with the ceiling.
 *
 * Source-level where the route needs a signed-in caller; the verifier runs.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { verifyAuditPack, PACK_LIMITS } from '../lib/audit-pack-verify';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const postOf = (src: string) => src.slice(src.indexOf('export async function POST'));

test('f87ce9ae9496 — the consent route reads optIn only from an object body', () => {
  const src = read('app/api/community-mail/route.ts');
  expect(src).not.toMatch(/const optIn = \(body as/);
  expect(src).toMatch(/const optIn = body && typeof body === 'object' \?/);
});

test('e6a8d32f903a — the repair-draft route reads a bounded body and answers 413 past it', () => {
  const src = read('app/api/projects/[projectId]/repair-drafts/route.ts');
  expect(src).not.toMatch(/req\.json\(/);
  expect(src).toMatch(/readBoundedJson\(new Response\(req\.body, \{ headers: req\.headers \}\), REPAIR_BODY_LIMITS\)/);
  expect(src).toMatch(/instanceof ResponseLimitError[\s\S]{0,200}status: 413/);
});

test('44f03f652da7 — the contract store reads a bounded body and bounds the source before deriving', () => {
  const post = postOf(read('app/api/projects/[projectId]/contract/route.ts'));
  expect(post).not.toMatch(/req\.json\(/);
  expect(post).toMatch(/readBoundedJson\(new Response\(req\.body, \{ headers: req\.headers \}\), STORE_BODY_LIMITS\)/);
  const sizeCheck = post.indexOf('> MAX_SOURCE_BYTES');
  const derive = post.indexOf('contractOfProject(');
  expect(sizeCheck).toBeGreaterThan(-1);
  expect(sizeCheck).toBeLessThan(derive);
});

test('0d9a23f48357 — the self-test deadline is cleared only after the body is read', () => {
  const src = read('app/api/admin/runner-selftest/route.ts');
  const probe = src.slice(src.indexOf('async function networkProbe'), src.indexOf('export async function POST'));
  expect(probe.indexOf('clearTimeout(timer)')).toBeGreaterThan(probe.indexOf('await res.json()'));
  expect(probe).toMatch(/finally \{\s*clearTimeout\(timer\);/);
});

test('4688e78a3516 — an unsupported destination authentication is refused, not read anonymously', () => {
  const src = read('app/api/test-s4-odata-read/route.ts');
  expect(src).toMatch(/else if \(auth && auth !== 'noauthentication'\) \{[\s\S]{0,200}throw new Error\('Destination authentication type is not supported/);
});

test('33d5babb43a6 — the web verifier refuses an oversized Blob without reading it', async () => {
  let read = false;
  const huge = {
    size: PACK_LIMITS.archiveBytes + 1,
    arrayBuffer: async () => {
      read = true;
      throw new Error('READ-BEFORE-SIZE');
    },
  } as unknown as Blob;
  const result = await verifyAuditPack(huge);
  expect(read).toBe(false);
  expect(result.success).toBe(false);
  expect(result.errors.join('\n')).toContain('The archive is larger than');
});

test('33d5babb43a6 — the verify page hands the file over unread', () => {
  const src = read('app/(app)/verify-pack/page.tsx');
  expect(src).not.toMatch(/await file\.arrayBuffer\(\)/);
  expect(src).toMatch(/verifyAuditPack\(file\)/);
});
