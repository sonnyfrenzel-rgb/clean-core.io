import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * SEC-2026-514: every document id a route takes from its caller goes through
 * `isFirestoreId` (lib/firestore-id.ts) before it forms a document path.
 *
 * Read from the source, route by route. A request-derived id is
 *   - every `...Id` name destructured from `await params`, and
 *   - every `...Id` name, and `uid`, destructured from the request body.
 * Each one must be passed to `isFirestoreId` in the same file, and that check
 * must come before the first `.doc(<name>)`. `tests/firestore-id-boundary.spec.ts`
 * proves the behaviour against the emulators; this spec keeps the next route
 * from forgetting it.
 */

/** Ids that never form a document path, each with the reason. */
const EXEMPT: Record<string, Record<string, string>> = {
  'app/api/survey/vote/route.ts': {
    questionId: 'looked up in the fixed survey catalogue; the document id comes from the verified identity',
    optionId: 'looked up in the fixed survey catalogue',
  },
  'app/api/send-tenant-approval-email/route.ts': { uid: 'passed to Firebase Auth getUser only, never to Firestore' },
  'app/api/send-tenant-revoke-email/route.ts': { uid: 'passed to Firebase Auth getUser only, never to Firestore' },
  // Emulator-only seeding route, closed (404) outside the test environment;
  // writing arbitrary paths is what it is for.
  'app/api/test/seed/route.ts': { docId: 'test-only', uid: 'test-only' },
};

/** Library functions that read an id out of a request body themselves. */
const LIBRARY_BODY_IDS: Record<string, string[]> = {
  'lib/repair-draft-store.ts': ['draftId', 'parentDraftId'],
};

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, out);
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

/** Local names bound by `const { a, b: c } = <rhs>` where rhs matches. */
function destructured(src: string, rhs: RegExp): string[] {
  const names: string[] = [];
  const re = new RegExp(String.raw`const\s*\{([^}]*)\}\s*(?::[^=]+)?=\s*(?:${rhs.source})`, 'g');
  for (const m of src.matchAll(re)) {
    for (const part of m[1].split(',')) {
      const bits = part.split(':').map((s) => s.trim()).filter(Boolean);
      if (bits.length === 0) continue;
      const key = bits[0];
      const local = (bits[1] || bits[0]).split('=')[0].trim();
      names.push(`${key}=>${local}`);
    }
  }
  return names;
}

function requestIds(src: string): string[] {
  const fromParams = destructured(src, /await\s+params\b/)
    .filter((n) => /Id$/.test(n.split('=>')[0]));
  const fromBody = destructured(src, /body\b|await\s+(?:req|request)\.json\(\)/)
    .filter((n) => { const key = n.split('=>')[0]; return /Id$/.test(key) || key === 'uid'; });
  return [...new Set([...fromParams, ...fromBody])];
}

test('the walk finds the routes it is meant to police', () => {
  const files = routeFiles(path.join(process.cwd(), 'app', 'api'));
  expect(files.length).toBeGreaterThan(20);
  const withIds = files.filter((f) => requestIds(fs.readFileSync(f, 'utf8')).length > 0);
  // runs/create, audit-pack/create, run-tests and the project routes at least.
  expect(withIds.length, withIds.join('\n')).toBeGreaterThanOrEqual(15);
});

test('every request-derived document id passes isFirestoreId before it forms a path', () => {
  const root = process.cwd();
  const missing: string[] = [];
  for (const file of routeFiles(path.join(root, 'app', 'api'))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const src = fs.readFileSync(file, 'utf8');
    for (const pair of requestIds(src)) {
      const [key, local] = pair.split('=>');
      if (EXEMPT[rel]?.[key]) continue;
      const check = src.indexOf(`isFirestoreId(${local})`);
      if (check < 0) {
        missing.push(`${rel}: ${key} is never passed to isFirestoreId`);
        continue;
      }
      // Between reading the id and checking it, no `.doc(<id>)`. A helper
      // defined further up the file is called later and does not count.
      const read = src.search(new RegExp(String.raw`\b${key}\b[^;]*\}\s*(?::[^=]+)?=\s*(?:await\s+params|body|await\s+(?:req|request)\.json)`));
      const between = src.slice(Math.max(0, read), check);
      if (new RegExp(String.raw`\.doc\(\s*${local}\s*\)`).test(between)) {
        missing.push(`${rel}: ${key} forms a path before it is checked`);
      }
    }
  }
  for (const [rel, names] of Object.entries(LIBRARY_BODY_IDS)) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const name of names) {
      if (!src.includes(`isFirestoreId(${name})`)) missing.push(`${rel}: ${name} is never passed to isFirestoreId`);
    }
  }
  expect(missing, missing.join('\n')).toEqual([]);
});

test('no route repairs an id by stripping characters instead of refusing it', () => {
  const root = process.cwd();
  const offenders = routeFiles(path.join(root, 'app', 'api'))
    .filter((f) => /\.replace\(\/\[\^a-zA-Z0-9_-\]\/g/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(root, f));
  expect(offenders, 'use isFirestoreId from lib/firestore-id.ts').toEqual([]);
});

test('the exemptions still name ids their routes actually read', () => {
  const root = process.cwd();
  for (const [rel, keys] of Object.entries(EXEMPT)) {
    const ids = requestIds(fs.readFileSync(path.join(root, rel), 'utf8')).map((p) => p.split('=>')[0]);
    for (const key of Object.keys(keys)) expect(ids, `${rel} no longer reads ${key}; drop the exemption`).toContain(key);
  }
});
