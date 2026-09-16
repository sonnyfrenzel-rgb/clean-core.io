import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The one condition the struck Datensparsamkeit package left behind.
 *
 * `docs/roadmap/SCHNITT-0-UMFANG.md` §8 package 4 ("Datensparsamkeit beginnen")
 * was struck on 12.09.2026 and deferred to Schnitt A, and roadmap Fassung 2.8
 * struck it outright from step 0.7. The profile therefore keeps `firstName`,
 * `lastName`, `tier 'enterprise'`, `orgId`, `maxTeamMembers` and the Okta/Azure
 * AD fields for now.
 *
 * Deferring the work did not defer the obligation. §13 of the same document:
 * *„Solange das Profil Namen führt, darf keine Oberfläche und kein Text
 * behaupten, es würden nur Handles gespeichert."* The sentence belongs to the
 * member list in Schnitt A, after the migration — never before it.
 *
 * This is the smallest thing that keeps that promise: the claim cannot appear in
 * a product surface while the profile still carries a name. When the migration
 * lands, the last test here says so and this file goes with it.
 */

const ROOT = path.resolve(__dirname, '..');

/**
 * Ways of saying "we keep no names", in both languages.
 *
 * Every English pattern has to see the *storing* as well as the *handle*: on its
 * own, "handles only" is a verb — "the LLM handles only semantic tasks" sits in
 * `app/(app)/how-it-works/page.tsx` and is not a claim about anybody's profile.
 * A guard that cried wolf there would be turned off within a week.
 */
const CLAIMS: Array<{ pattern: RegExp; says: string }> = [
  {
    pattern: /(?:stor\w+|sav\w+|keep\w*|kept|held)[^.\n]{0,60}\bonly\s+(?:your\s+|a\s+|the\s+)?handles?\b/i,
    says: 'we store only handles',
  },
  {
    pattern: /\bonly\s+(?:your\s+|a\s+|the\s+)?handles?\b[^.\n]{0,60}(?:stored|saved|kept|held)\b/i,
    says: 'only handles are stored',
  },
  { pattern: /\bhandle\b[^.\n]{0,60}instead\s+of\s+(?:your\s+|the\s+)?(?:real\s+)?name/i, says: 'a handle instead of your name' },
  { pattern: /nur\s+(?:noch\s+)?(?:dein\s+|Ihr\s+)?Handles?\b/, says: 'nur Handles' },
  { pattern: /(?:we|clean-core\.io)\s+(?:do\s+not|don't|never)\s+store\s+(?:your\s+)?(?:real\s+)?names?\b/i, says: 'we do not store names' },
  { pattern: /no\s+(?:real\s+)?names?\s+(?:are|is)\s+stored\b/i, says: 'no names are stored' },
  { pattern: /kein[e]?\s+(?:Klar)?[Nn]amen\s+(?:werden|wird)\s+gespeichert\b/i, says: 'keine Namen werden gespeichert' },
];

/** Product surfaces: what a reader can see. Docs and the roadmap state the rule itself. */
const SURFACES = ['app', 'components', 'lib', 'hooks'];
const READABLE = /\.(ts|tsx|md)$/;

function files(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'generated' || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (READABLE.test(entry.name)) out.push(full);
    }
  };
  for (const surface of SURFACES) walk(path.join(ROOT, surface));
  return out;
}

test.describe('nothing claims that only handles are stored', () => {
  test('no product surface makes the claim', () => {
    const offences: string[] = [];
    for (const file of files()) {
      const text = fs.readFileSync(file, 'utf8');
      // This file names the claims in order to forbid them.
      for (const { pattern, says } of CLAIMS) {
        if (pattern.test(text)) {
          offences.push(`${path.relative(ROOT, file).split(path.sep).join('/')} — "${says}"`);
        }
      }
    }
    expect(
      offences,
      'the profile still stores names (Datensparsamkeit is deferred to Schnitt A), so this claim would be false',
    ).toEqual([]);
  });

  test('and the claim is still false — the profile still carries a name', () => {
    // The day this fails, the migration has happened: delete this file with the
    // same commit that makes the sentence true, and put it in the member list.
    const profile = fs.readFileSync(path.join(ROOT, 'hooks', 'useUserProfile.ts'), 'utf8');
    expect(profile, 'the profile no longer carries firstName — Datensparsamkeit has landed').toContain('firstName');
    expect(profile).toContain('lastName');
  });
});
