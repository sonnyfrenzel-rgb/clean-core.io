import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  mayReadProject,
  isProjectOwner,
  projectReaders,
  readersAfterGrant,
  readersAfterRevoke,
  projectReaderOverview,
} from '../lib/project-readers';
import {
  RULES_FILE,
  RULES_DEPLOYMENT_RECORD,
  checkRulesDeployment,
  normaliseRulesText,
  parseClientWritableProjectFields,
  parseProjectReadRule,
  type RulesDeploymentRecord,
} from '../lib/firestore-rules-contract';
import type { Invitation } from '../lib/invitation-types';

/**
 * Roadmap 5.4/5.5, the half that needs no emulator: the one field the rule
 * believes, and the record that says the rule is not live yet.
 *
 * `tests/firestore-rules-readers.spec.ts` is the half that matters most — it
 * asks the rules engine itself. This file guards the two things that cannot be
 * seen from there: that the *source* keeps the shape the engine test depends on
 * (one carrier, no `get()`, `readers` in neither client allowlist), and that a
 * widened **read** rule is recorded before it is shipped. Until 5.4 every app
 * change that depended on the rules depended on a widened *write*; the
 * deployment record tracked only those, and would have called this change
 * nothing to deploy.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (text: string) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const rules = () => normaliseRulesText(read(RULES_FILE));

const invitation = (over: Partial<Invitation> = {}): Invitation => ({
  id: 'inv-1',
  projectId: 'p1',
  email: 'reader@example.org',
  invitedBy: { uid: 'owner', name: 'Owner User' },
  invitedAt: '2026-09-10T08:00:00.000Z',
  expiresAt: '2026-09-24T08:00:00.000Z',
  status: 'accepted',
  acceptedBy: { uid: 'reader', email: 'reader@example.org' },
  acceptedAt: '2026-09-11T09:30:00.000Z',
  revokedAt: null,
  ...over,
});

test.describe('who may read a project, as a function', () => {
  test('absence, emptiness and a stranger all mean no', () => {
    expect(mayReadProject({ userId: 'owner' }, 'reader')).toBe(false);
    expect(mayReadProject({ userId: 'owner', readers: [] }, 'reader')).toBe(false);
    expect(mayReadProject({ userId: 'owner', readers: ['someone-else'] }, 'reader')).toBe(false);
    expect(mayReadProject({ userId: 'owner', readers: ['reader'] }, 'reader')).toBe(true);
    expect(mayReadProject({ userId: 'owner' }, 'owner')).toBe(true);
    // Not a list, not a grant — and not a crash either.
    expect(projectReaders({ readers: 'reader' })).toEqual([]);
    expect(projectReaders({ readers: [1, '', 'reader'] })).toEqual(['reader']);
    expect(mayReadProject(null, 'reader')).toBe(false);
    expect(mayReadProject({ userId: 'owner', readers: ['reader'] }, null)).toBe(false);
  });

  test('a reader is not an owner, which is the whole point of 5.4', () => {
    const project = { userId: 'owner', readers: ['reader'] };
    expect(isProjectOwner(project, 'reader')).toBe(false);
    expect(isProjectOwner(project, 'owner')).toBe(true);
  });

  test('granting is idempotent and revoking is total', () => {
    expect(readersAfterGrant({ readers: ['a'] }, 'b')).toEqual(['a', 'b']);
    expect(readersAfterGrant({ readers: ['a', 'b'] }, 'b')).toEqual(['a', 'b']);
    expect(readersAfterRevoke({ readers: ['a', 'b', 'a'] }, 'a')).toEqual(['b']);
    expect(readersAfterRevoke({ readers: ['a'] }, 'nobody')).toEqual(['a']);
    expect(readersAfterRevoke({}, 'a')).toEqual([]);
  });
});

test.describe('the owner sees who has Einsicht, and since when', () => {
  test('an accepted invitation whose uid is still on the list is a row', () => {
    const { entries, unaccountedUids } = projectReaderOverview({ readers: ['reader'] }, [invitation()]);
    expect(entries).toHaveLength(1);
    expect(entries[0].email).toBe('reader@example.org');
    expect(entries[0].since, 'the date is the server\'s acceptance, not the invitation').toBe('2026-09-11T09:30:00.000Z');
    expect(entries[0].invitedByName).toBe('Owner User');
    expect(unaccountedUids).toEqual([]);
  });

  test('a revoked invitation is not a row, and neither is a pending one', () => {
    const revoked = invitation({ id: 'inv-2', status: 'revoked', revokedAt: '2026-09-12T00:00:00.000Z' });
    expect(projectReaderOverview({ readers: [] }, [revoked]).entries).toEqual([]);
    const pending = invitation({ id: 'inv-3', status: 'pending', acceptedBy: null, acceptedAt: null });
    expect(projectReaderOverview({ readers: ['reader'] }, [pending]).entries).toEqual([]);
  });

  test('an accepted invitation the readers list no longer names is gone — the list decides', () => {
    // The uid list is what the rule believes. An invitation that says
    // "accepted" while the list does not name the uid grants nothing, and the
    // overview must not claim otherwise.
    expect(projectReaderOverview({ readers: [] }, [invitation()]).entries).toEqual([]);
  });

  test('a uid on the list with no invitation behind it is surfaced, not swallowed', () => {
    const { entries, unaccountedUids } = projectReaderOverview({ readers: ['reader', 'ghost'] }, [invitation()]);
    expect(entries.map((e) => e.uid)).toEqual(['reader']);
    expect(unaccountedUids).toEqual(['ghost']);
  });
});

test.describe('the rules keep the shape the emulator test depends on', () => {
  test('one carrier, and no get() anywhere in the file', () => {
    const text = rules();
    expect(text, 'the read grant reads the document it is already fetching')
      .toContain("request.auth.uid in data.get('readers', [])");
    expect(text, 'a missing field defaults to the empty list').toContain("data.get('readers', []) is list");
    // A get() costs a document read per evaluation and has produced evaluation
    // errors in this emulator twice before; the file says so itself.
    expect(text, 'no rule reads a second document').not.toContain('get(/databases/');
    expect(text).not.toContain('exists(/databases/');
  });

  test('`readers` is in neither client allowlist — not to write, not to create', () => {
    const text = rules();
    expect(parseClientWritableProjectFields(text), 'the update allowlist').not.toContain('readers');
    const createAt = text.indexOf("keys().hasOnly(['name', 'status', 'userId', 'createdAt'");
    expect(createAt, 'the create allowlist is gone').toBeGreaterThan(-1);
    expect(text.slice(createAt, text.indexOf(']', createAt)), 'the create allowlist').not.toContain('readers');
  });

  test('the run subcollection did not move with it, and the invitations are shut', () => {
    const text = rules();
    expect(text).toMatch(
      /match \/projects\/\{projectId\}\/runs\/\{runId\}[\s\S]*?allow read: if isAuthenticated\(\) && resource != null && resource\.data\.userId == request\.auth\.uid;/,
    );
    expect(text).toMatch(
      /match \/projects\/\{projectId\}\/invitations\/\{invitationId\} \{\s*allow read, write: if false;/,
    );
  });

  test('the routes that change or show the access list ask for ownership, not for read access', () => {
    const route = read('app/api/projects/[projectId]/readers/route.ts');
    expect(route, 'the gate is ownership').toContain('isProjectOwner(project, decoded.uid)');
    expect(route, 'and an admin claim is not a way in').not.toContain('decoded.admin');
    expect(route, 'the revocation writes the one list the rule reads').toContain('readersAfterRevoke(project, uid)');
    expect(route, 'and it is recorded').toContain("action: `project.reader.revoke:${gate.projectId}`");
    // The read route is the reader's, and the reader's only — it hands out the
    // run, never a write.
    const project = read('app/api/projects/[projectId]/route.ts');
    expect(project).toContain('mayReadProject(project, decoded.uid)');
    expect(project, 'GET writes nothing').not.toMatch(/export async function GET[\s\S]*?\.set\(/);
  });
});

test.describe('a widened READ rule is recorded before it is shipped', () => {
  const OLD_READ = 'allow read: if isAuthenticated() && resource != null && resource.data.userId == request.auth.uid;';
  const NEW_READ =
    'allow read: if isAuthenticated() && resource != null && (resource.data.userId == request.auth.uid || invitedReader(resource.data));';

  test('the read rule is read out of the file, comments and line breaks and all', () => {
    expect(parseProjectReadRule(rules()), 'the working copy widened it').toBe(NEW_READ);
    // Not the run subcollection's read, which sits below it in the same file.
    expect(parseProjectReadRule(rules())).not.toContain('runs');
  });

  test('the deployment record says the read rule changed, and what it changed to', () => {
    const record = JSON.parse(read(RULES_DEPLOYMENT_RECORD)) as RulesDeploymentRecord;
    expect(record.deployed.projectDocumentReadRule, 'what production serves').toBe(OLD_READ);
    expect(record.pending?.projectDocumentReadRule, 'what the working copy says').toBe(parseProjectReadRule(rules()));
    expect(record.pending?.sha256OfLfNormalisedText).toBe(sha256(rules()));
    expect(record.pending?.note, 'and that the deploy comes first').toContain('Regel-Deploy vor der App');
    const verdict = checkRulesDeployment(rules(), record, sha256);
    expect(verdict.readRuleChanged, 'the check sees it').toBe(true);
    expect(verdict.problems, verdict.problems.join('\n')).toEqual([]);
  });

  const base: RulesDeploymentRecord = {
    schemaVersion: 1,
    file: RULES_FILE,
    howToDeploy: 'npm run deploy:rules',
    deployed: {
      sha256OfLfNormalisedText: 'f'.repeat(64),
      deployedAt: '2026-09-01',
      deployedBy: 'by hand',
      project: 'cleancore-491216',
      databases: ['(default)', 'clean-core-eu'],
      clientWritableProjectFields: ['status'],
      projectDocumentReadRule: OLD_READ,
    },
  };
  const rulesWith = (readRule: string) =>
    `match /projects/{projectId} {\n  // a comment that must not become part of the rule\n  ${readRule}\n  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly([\n    'status'\n  ]);\n}\n`;

  test('a read rule that changed without a word in the record is a failure', () => {
    const working = rulesWith(NEW_READ);
    const verdict = checkRulesDeployment(working, {
      ...base,
      pending: {
        sha256OfLfNormalisedText: sha256(working),
        recordedAt: '2026-09-17',
        recordedFor: 'a change that forgot to mention the read rule',
        addsToClient: [],
        removesFromClient: [],
        note: '',
      },
    }, sha256);
    expect(verdict.readRuleChanged).toBe(true);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join('\n')).toContain('pending.projectDocumentReadRule');
  });

  test('the same change, written down, is allowed to sit pending', () => {
    const working = rulesWith(NEW_READ);
    const verdict = checkRulesDeployment(working, {
      ...base,
      pending: {
        sha256OfLfNormalisedText: sha256(working),
        recordedAt: '2026-09-17',
        recordedFor: 'roadmap 5.4 — Einsicht by invitation, rules first',
        addsToClient: [],
        removesFromClient: [],
        projectDocumentReadRule: NEW_READ,
        note: '',
      },
    }, sha256);
    expect(verdict.problems).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.pending).toBe(true);
    expect(verdict.readRuleChanged).toBe(true);
  });

  test('a deployed record whose read rule is not the file\'s is a failure', () => {
    const working = rulesWith(NEW_READ);
    const verdict = checkRulesDeployment(working, {
      ...base,
      deployed: { ...base.deployed, sha256OfLfNormalisedText: sha256(working) },
    }, sha256);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join('\n')).toContain('deployed.projectDocumentReadRule');
  });
});
