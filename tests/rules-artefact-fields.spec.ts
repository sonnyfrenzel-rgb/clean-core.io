import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { parseClientWritableProjectFields } from '../lib/firestore-rules-contract';

/**
 * The model's artefacts on a project — generated code, both documentations, the test suite and its coverage — are
 * written by the server routes (artefacts, contract), which check them, bind them to the run and mark what a model
 * wrote. A browser that could write them onto the project document would land before the stored parts ("inline
 * wins") and past every one of those checks, so the rules do not let it.
 */
const ROOT = path.resolve(__dirname, '..');
const ARTEFACT_FIELDS = ['generatedCode', 'documentation', 'businessDocumentation', 'testSuite', 'coverageEstimate'];

test('no artefact field is client-writable on a project', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const allowed = parseClientWritableProjectFields(rules);
  expect(allowed.length).toBeGreaterThan(0);
  expect(allowed.filter((f) => ARTEFACT_FIELDS.includes(f))).toEqual([]);
});
