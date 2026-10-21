/**
 * QA a0d83666d683: the key-user checks recorded as run were read against the
 * current step list only where the caller held the list (Testing); the
 * dashboard and the rail call `workflowSteps(project)` without one. For one
 * signed run the list changes only when its builder does, so the record
 * carries the builder's `KEY_USER_CHECKS_VERSION`, and a record of another
 * version reads as recorded for another list on every screen.
 *
 * The pin below fails when the builder writes other checks for the example:
 * bump `KEY_USER_CHECKS_VERSION` in `lib/key-user-acceptance.ts` and re-pin.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { buildKeyUserSteps } from '../lib/key-user-steps';
import {
  KEY_USER_CHECKS_VERSION,
  isKeyUserAcceptanceSummary,
  keyUserAcceptanceReading,
  keyUserCheckIds,
  keyUserListDigest,
  mergeKeyUserAcceptance,
} from '../lib/key-user-acceptance';
import { sha256Hex } from '../lib/artefact-digest';
import { readExample } from './helpers/starter-example-files';

const FILE = 'Z_SD_DELIVERY_PRIORITY.abap';
const SOURCE = readExample(FILE).replace(/\r\n/g, '\n');
const list = () => buildKeyUserSteps(buildAbapEvidence(SOURCE, FILE, 'private', undefined, 'v3.0.19').keyUser)!;

const PINNED = { version: 1, digest: 'd37e9552dfa17081826eeff787d620b61e1200479f605851e509a27a43f520c8' };

test('the builder\'s checks for the example are the ones of its version', () => {
  expect(
    { version: KEY_USER_CHECKS_VERSION, digest: keyUserListDigest(list()) },
    'the key-user checks changed: bump KEY_USER_CHECKS_VERSION and re-pin',
  ).toEqual(PINNED);
});

test('with and without the list, a record reads the same; another builder version is another list on both', () => {
  const l = list();
  const ids = keyUserCheckIds(l);
  const sha = sha256Hex(SOURCE);
  const recorded = mergeKeyUserAcceptance(
    null,
    {
      subject: { runId: 'run-1', sourceSha256: sha },
      listDigest: keyUserListDigest(l),
      total: ids.length,
      checkIds: ids,
      recordedAt: '2026-10-21T10:00:00.000Z',
      recordedBy: 'owner@example.invalid',
      system: 'S4D',
      ranOn: '2026-10-21',
      note: null,
    },
    ids,
  );
  expect(recorded.checksVersion).toBe(KEY_USER_CHECKS_VERSION);
  const project = (summary: unknown) => ({ activeRunId: 'run-1', inputFingerprint: { sha256: sha }, keyUserAcceptance: summary });

  // Testing (with the list) and the dashboard (without) agree.
  expect(keyUserAcceptanceReading(project(recorded), l)).toMatchObject({ state: 'current', complete: true });
  expect(keyUserAcceptanceReading(project(recorded))).toMatchObject({ state: 'current', complete: true });

  // A record written before the stamp is version 1.
  const { checksVersion: _v, ...unstamped } = recorded;
  void _v;
  expect(isKeyUserAcceptanceSummary(unstamped)).toBe(true);
  expect(keyUserAcceptanceReading(project(unstamped))).toMatchObject({ state: 'current', complete: true });

  // A record of another builder version: another list, on the screen without the list too.
  const other = { ...recorded, checksVersion: KEY_USER_CHECKS_VERSION + 1 };
  expect(keyUserAcceptanceReading(project(other))).toMatchObject({ state: 'earlier', because: 'list' });
  expect(isKeyUserAcceptanceSummary({ ...recorded, checksVersion: 'x' })).toBe(false);
});
