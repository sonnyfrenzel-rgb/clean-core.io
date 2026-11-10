import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  PROCESS_REVISION_PAGE_SIZE,
  REVISION_SUMMARY_FIELDS,
  parseRevisionCursor,
  readRevisionPage,
  type RevisionQuery,
} from '../lib/process-revision-page';

/**
 * The revision history is read in pages and without the BPMN (SEC-2026-908).
 *
 * Server-free: a fake query stands in for Firestore and records what was asked
 * of it, so the test sees the shape of the read — which fields, how many
 * documents, from where — not only its result.
 */

interface Asked {
  select: string[] | null;
  order: [string, string] | null;
  where: [string, string, number] | null;
  limit: number | null;
}

/** `n` stored revisions, each with a large drawing, behind a recording fake. */
function store(n: number) {
  const docs = Array.from({ length: n }, (_, i) => ({
    formatVersion: 1,
    revision: i + 1,
    origin: i === 0 ? 'reconstructed' : 'edited',
    xml: 'x'.repeat(1000),
  }));
  const asked: Asked = { select: null, order: null, where: null, limit: null };
  const query: RevisionQuery = {
    select(...fields) {
      asked.select = fields;
      return query;
    },
    orderBy(field, direction) {
      asked.order = [field, direction];
      return query;
    },
    where(field, op, value) {
      asked.where = [field, op, value];
      return query;
    },
    limit(k) {
      asked.limit = k;
      return query;
    },
    async get() {
      let rows = [...docs];
      if (asked.where) rows = rows.filter((d) => d.revision < asked.where![2]);
      if (asked.order?.[1] === 'desc') rows.reverse();
      if (asked.limit !== null) rows = rows.slice(0, asked.limit);
      // What `select` does in Firestore: only the named fields come back.
      const pick = (d: Record<string, unknown>) =>
        asked.select ? Object.fromEntries(Object.entries(d).filter(([k]) => asked.select!.includes(k))) : d;
      return { docs: rows.map((d) => ({ data: () => pick(d) })) };
    },
  };
  return { query, asked };
}

test('the list asks for the summary fields only, never the drawing', async () => {
  const { query, asked } = store(3);
  const page = await readRevisionPage(query, null);
  expect(asked.select).not.toBeNull();
  expect(asked.select).not.toContain('xml');
  expect([...asked.select!].sort()).toEqual([...REVISION_SUMMARY_FIELDS].sort());
  for (const d of page.docs) expect(d).not.toHaveProperty('xml');
});

test('one page at a time, newest page first, oldest first within it', async () => {
  const total = PROCESS_REVISION_PAGE_SIZE * 2 + 7;
  const { query, asked } = store(total);
  const first = await readRevisionPage(query, null);
  expect(asked.limit).toBe(PROCESS_REVISION_PAGE_SIZE + 1);
  expect(first.docs).toHaveLength(PROCESS_REVISION_PAGE_SIZE);
  expect(first.docs[first.docs.length - 1].revision).toBe(total);
  expect(first.docs[0].revision).toBe(total - PROCESS_REVISION_PAGE_SIZE + 1);
  expect(first.nextBefore).toBe(total - PROCESS_REVISION_PAGE_SIZE + 1);

  // Walk back to revision 1: every revision exactly once, and the last page says there is no older one.
  const seen = first.docs.map((d) => d.revision as number);
  let cursor = first.nextBefore;
  while (cursor !== null) {
    const { query: q } = store(total);
    const page = await readRevisionPage(q, cursor);
    expect(page.docs.length).toBeLessThanOrEqual(PROCESS_REVISION_PAGE_SIZE);
    seen.unshift(...page.docs.map((d) => d.revision as number));
    cursor = page.nextBefore;
  }
  expect(seen).toEqual(Array.from({ length: total }, (_, i) => i + 1));
});

test('a history that fits one page has no cursor', async () => {
  const { query } = store(PROCESS_REVISION_PAGE_SIZE);
  const page = await readRevisionPage(query, null);
  expect(page.docs).toHaveLength(PROCESS_REVISION_PAGE_SIZE);
  expect(page.nextBefore).toBeNull();
});

test('the cursor from a query string is a whole number from 2 upwards, or refused', () => {
  expect(parseRevisionCursor(null)).toBeNull();
  expect(parseRevisionCursor('2')).toBe(2);
  expect(parseRevisionCursor('51')).toBe(51);
  for (const bad of ['', '1', '0', '-3', '1e3', '2.5', 'abc', '9999999999']) expect(parseRevisionCursor(bad), bad).toBe('bad');
});

test('the route reads the history list through the page, not the whole collection', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/api/projects/[projectId]/process-revisions/route.ts'),
    'utf8',
  );
  const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'));
  expect(get).toContain('readRevisionPage(');
  expect(get).toContain('parseRevisionCursor(');
  // An unbounded read of every revision document, drawings included, is what this replaced.
  expect(get).not.toMatch(/orderBy\('revision', 'asc'\)\s*\.get\(\)/);
});
