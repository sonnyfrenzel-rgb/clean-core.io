import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * A profile read by one sign-in does not reach the next (QA review of
 * 0ce6b0b508e6).
 *
 * `releaseProfile` tears the snapshot listener down when the user changes; the
 * one-time `getDoc` started beside it has no such handle and used to call
 * `setProfile` whenever it settled. After a sign-out, or a switch to another
 * account, the previous account's profile could land on the next one's screen.
 *
 * Read from the source, comments stripped, as `session-delivery-guard.spec.ts`
 * reads the same hook: the race is a timing between Firestore and Firebase
 * Auth inside a React effect, and neither runs in this process.
 */
const ROOT = path.resolve(__dirname, '..');
const rendered = () =>
  fs
    .readFileSync(path.resolve(ROOT, 'hooks/useUserProfile.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('each auth change takes a generation before it starts the fetch', () => {
  const src = rendered();
  expect(src).toMatch(/let generation = 0;/);
  expect(src).toMatch(/onAuthStateChanged\(async \(user\) => \{\s*const thisGeneration = \+\+generation;/);
});

test('the fetched document becomes the profile only for the sign-in that fetched it', () => {
  const src = rendered();
  // Compared before anything is set: generation, and the user the fetch was
  // started for against the one signed in now.
  expect(src).toMatch(
    /getDoc\(userDocRef\)\.then\(\(docSnap\) => \{\s*if \(thisGeneration !== generation \|\| auth\.currentUser\?\.uid !== user\.uid\) return;/,
  );
});

test('unmounting retires the generation, so a fetch that settles afterwards is dropped', () => {
  const src = rendered();
  expect(src).toMatch(/return \(\) => \{\s*generation \+= 1;\s*releaseProfile\(\);\s*unsubscribeAuth\(\);/);
});
