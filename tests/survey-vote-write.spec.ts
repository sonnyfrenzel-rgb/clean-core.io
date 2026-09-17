import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { recordAnswer, summarise, type SurveyResponse } from '../lib/survey/store';

/**
 * An answer is only recorded if a reader can find it again.
 *
 * The vote route wrote ``{ [`answers.${q}`]: value }`` into `set(..., { merge:
 * true })`. A dot in a key of `set()` is a character in a field *name*, not a path
 * — only `update()` reads it as a path — so every answer to the live satisfaction
 * survey landed in a top-level field called `answers.ran` and `data.answers` stayed
 * `undefined`. The endpoint answered `ok: true` throughout, the page showed no
 * selection on a return visit, and the digest counted nobody (QA b22563b1cd74,
 * a0a649312df1).
 *
 * No spec in this repository imports a route handler, which is why this went
 * unnoticed by the tests as well as by the readers. So the write lives in
 * `lib/survey/store.ts` and is exercised here against the emulator the way
 * `tests/survey-link-fetch.spec.ts` exercises the link-fetch claim — the
 * assertions are on the document that comes back, not on the source.
 */

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

const CAMPAIGN = 'vote-write-spec';
const freshRef = () => {
  const uid = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return { uid, ref: db().collection('survey_responses').doc(`${CAMPAIGN}__${uid}`) };
};

test.describe.configure({ mode: 'serial' });

test('an answer lands in the nested answers map, not in a field called "answers.ran"', async () => {
  const { uid, ref } = freshRef();
  await recordAnswer(ref, {
    campaign: CAMPAIGN,
    uid,
    questionId: 'ran',
    value: 'yes',
    stamp: FieldValue.serverTimestamp(),
  });

  const stored = (await ref.get()).data() as Record<string, unknown>;
  expect(stored.answers, 'the readers read `answers`, so the answer has to be in it').toEqual({
    ran: 'yes',
  });
  expect(
    Object.keys(stored).filter((k) => k.includes('.')),
    'no field name may contain a dot — that is the bug this replaced',
  ).toEqual([]);
  expect((stored.answeredAt as Record<string, unknown>).ran, 'and it is stamped').toBeTruthy();
  expect(stored.confirmedAt, 'a real answer confirms the response').toBeTruthy();
  await ref.delete();
});

test('a second answer does not overwrite the first', async () => {
  const { uid, ref } = freshRef();
  const write = (questionId: string, value: string | string[]) =>
    recordAnswer(ref, { campaign: CAMPAIGN, uid, questionId, value, stamp: FieldValue.serverTimestamp() });

  await write('ran', 'no');
  await write('welcome_mail', 'spam');
  await write('build_next', ['german', 'atc_import']);

  const stored = (await ref.get()).data() as Record<string, unknown>;
  expect(stored.answers, 'all three questions are still there').toEqual({
    ran: 'no',
    welcome_mail: 'spam',
    build_next: ['german', 'atc_import'],
  });

  // Changing one's mind replaces that one answer and leaves the rest alone.
  await write('ran', 'yes');
  await write('build_next', ['mobile_diff']);
  const after = (await ref.get()).data() as Record<string, unknown>;
  expect(after.answers).toEqual({
    ran: 'yes',
    welcome_mail: 'spam',
    build_next: ['mobile_diff'],
  });
  await ref.delete();
});

test('the digest counts an answer written this way', async () => {
  const { uid, ref } = freshRef();
  await recordAnswer(ref, {
    campaign: CAMPAIGN,
    uid,
    questionId: 'ran',
    value: 'started',
    stamp: FieldValue.serverTimestamp(),
  });

  // Exactly the projection `scripts/send-survey-digest.ts` builds from the snapshot.
  const raw = (await ref.get()).data() as Record<string, unknown>;
  const responses: SurveyResponse[] = [
    {
      campaign: String(raw.campaign),
      uid: String(raw.uid),
      email: 'nobody@example.invalid',
      name: 'Spec',
      answers: (raw.answers as SurveyResponse['answers']) || {},
      comment: null,
    },
  ];

  const summary = summarise(CAMPAIGN, 30, responses);
  expect(summary.participants, 'one person answered, and the digest says one').toBe(1);
  const ran = summary.questions.find((q) => q.id === 'ran');
  expect(ran?.answered).toBe(1);
  expect(ran?.options.find((o) => o.id === 'started')?.count).toBe(1);
  await ref.delete();
});

test('the vote route uses this write rather than its own set()', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/survey/vote/route.ts'), 'utf8');
  expect(src).toContain('recordAnswer');
  expect(src, 'a dotted key in a set() payload is the bug, in any spelling').not.toMatch(
    /\[`answers\.|\[`answeredAt\./,
  );
});
