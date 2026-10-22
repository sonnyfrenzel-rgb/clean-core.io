import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { auditRowNamesActorEmail } from '../lib/firebase-admin';

/**
 * PRV-01 — the security journal records an address only for administrative
 * actions. Self-service actions are recorded by uid alone; the erasure half
 * (pseudonymising the address of an erased account) is proven against the
 * emulator in `tests/account-erasure.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');

test('administrative actions name the actor, self-service actions do not', () => {
  for (const action of ['GRANT_ADMIN', 'REVOKE_ADMIN', 'APPROVE_USER', 'REVOKE_USER', 'GRANT_S4', 'REVOKE_S4', 'GRANT_S4_LINK', 'REJECT_S4_LINK', 'DELETE_USER_CASCADE', 'RUNNER_SELFTEST:pass']) {
    expect(auditRowNamesActorEmail(action), action).toBe(true);
  }
  for (const action of ['BYOK_SAVE', 'BYOK_SAVE_FAIL', 'BYOK_DELETE', 'BYOK_DELETE_FAIL', 'BYOK_TEST_FAIL', 'project.reader.revoke:p1', 'PROJECT_REPAIR_DRAFT_ADOPTED:p1:d1']) {
    expect(auditRowNamesActorEmail(action), action).toBe(false);
  }
});

test('the self-service routes write no address into the journal', () => {
  for (const rel of [
    'app/api/projects/[projectId]/commands/route.ts',
    'app/api/projects/[projectId]/readers/route.ts',
    'app/api/projects/[projectId]/invitations/[invitationId]/route.ts',
    'app/api/projects/[projectId]/repair-drafts/route.ts',
    'lib/repair-draft-store.ts',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src, rel).not.toContain('actorEmail');
    expect(src, rel).not.toContain('auditActorEmail');
  }
});
