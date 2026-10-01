import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';

/**
 * The findings go into the signed run through the Admin SDK, which refuses an
 * `undefined` value anywhere in a document. A standard table with no mapped
 * successor left `sapReplacement: undefined` on its finding, and every run of
 * the shipped Z_MM_PO_APPROVAL example ended in a 500 from /api/runs/create.
 * Every starter example, both editions, at any depth.
 */

const DIR = path.resolve(__dirname, '..', 'public', 'starter-examples');

function undefinedPaths(value: unknown, at: string, out: string[]): void {
  if (value === undefined) {
    out.push(at);
    return;
  }
  if (Array.isArray(value)) value.forEach((v, i) => undefinedPaths(v, `${at}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) undefinedPaths(v, `${at}.${k}`, out);
  }
}

test('no evidence finding carries an undefined value Firestore would refuse', () => {
  const files = fs.readdirSync(DIR);
  expect(files.length).toBeGreaterThan(0);
  const found: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(DIR, file), 'utf8');
    for (const edition of ['public', 'private'] as const) {
      undefinedPaths(buildAbapEvidence(source, file, edition).findings, `${file}/${edition}`, found);
    }
  }
  expect(found).toEqual([]);
});
