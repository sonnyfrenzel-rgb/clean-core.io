import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * QA full review of v3.0.6 — source guards for the confirmed findings that
 * cannot be reached without a running server. Server-free.
 *
 * The tenant request document (04ad2108af07) is held in
 * tests/qa-a7e0ae36.spec.ts and tests/testing-page-qa220.spec.ts, the BYOK
 * delete (0ce264ac607d) in tests/secret-erasure.spec.ts.
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('no mail log names its recipient (73f480886489)', () => {
  // The recipient's address went to the production log on every send, and the
  // register route printed name, address and uid when no mail key was set.
  for (const rel of ['app/api/account/register/route.ts', 'lib/transactional-mail.ts']) {
    const src = read(rel);
    expect(src, `${rel} logs the recipient again`).not.toMatch(/console\.log\(`\[Email\] Sent [^`]*\$\{msg\.to\}/);
    expect(src).toContain("console.log(`[Email] Sent ${msg.label}. id=${messageId ?? 'unknown'}`)");
  }
  const register = read('app/api/account/register/route.ts');
  const suppressed = register.slice(register.indexOf('MAILS SUPPRESSED'), register.indexOf('return NextResponse.json({ ok: true, activated: true'));
  expect(suppressed.length).toBeGreaterThan(0);
  expect(suppressed, 'the suppressed-mail banner names the person again').not.toMatch(/console\.log\([^;]*(rawName|rawEmail)/);
});

test('a revocation reads the accepted invitations inside its transaction (cb7ed86b0d3b)', () => {
  const src = read('app/api/projects/[projectId]/readers/route.ts');
  const del = src.slice(src.indexOf('export async function DELETE'));
  const tx = del.indexOf('await gate.db.runTransaction(');
  const query = del.indexOf("projectRef.collection('invitations').where('acceptedBy.uid', '==', uid)");
  expect(tx).toBeGreaterThan(-1);
  expect(query, 'the invitations are no longer read inside the transaction').toBeGreaterThan(tx);
  expect(del.slice(tx, query)).toContain('await tx.get(');
  expect(del).toContain("data.status === 'accepted'");
  // Nothing reads the invitations outside the transaction any more.
  expect(del.slice(0, tx)).not.toContain(".collection('invitations')");
});

test('a failed invitation mail withdraws with an update, never a merge-set (2632d2f80642)', () => {
  const src = read('app/api/projects/[projectId]/invitations/route.ts');
  const failed = src.slice(src.indexOf('if (!outcome.delivered)'), src.indexOf('invitationNotSentMessage('));
  expect(failed.length).toBeGreaterThan(0);
  expect(failed).toContain(".update({ status: 'revoked'");
  expect(failed, 'the withdrawal can recreate the invitation again').not.toMatch(/\.set\([^;]*merge:\s*true/);
  // A missing invitation is as withdrawn as it can be.
  expect(failed).toMatch(/code === 5 \|\| code === 'not-found'\) return true;/);
});
