import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The three confirmed findings of the QA full review of 3131afa that were fixed
 * on the day, and what each one holds.
 *
 * Two of the three are wiring rather than behaviour, and the tests say so
 * rather than pretending otherwise. A React closure reading stale state cannot
 * be driven without the page, and a function behind admin step-up MFA cannot be
 * called from a spec against the Auth emulator, which has no TOTP. Where a
 * guard reads source it names the exact shape that broke, so a regression that
 * reintroduces it fails here even though the value it would produce is not
 * observable from this process.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

/** The body of a function declared as `const <name> = async (` … up to the matching `};` at its own indent. */
function bodyOf(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  expect(start, `${declaration} is no longer in the file`).toBeGreaterThan(-1);
  const end = src.indexOf('\n  };', start);
  expect(end, `could not find the end of ${declaration}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

test.describe('the analysis runs under the deployment the reader chose (2878b5f8fae3)', () => {
  const page = () => read('app/(app)/project/[projectId]/analyze/page.tsx');

  test('handleAnalyze takes the deployment as an argument and never reads it from the closure', () => {
    const body = bodyOf(page(), 'const handleAnalyze = async (');

    // The signature carries it…
    expect(body, 'handleAnalyze no longer takes the deployment as a parameter').toMatch(
      /deployment: 'public' \| 'private' \| null = targetDeployment,/,
    );

    // …and nothing inside reads the state variable instead. This is the whole
    // defect in one line: `setTargetDeployment(x)` followed by
    // `handleAnalyze(code)` in the same handler left every use below holding
    // the previous render's value — `null` on a first analysis, the old edition
    // on a change — while the screen showed the new one. The evidence scan, the
    // extensibility routing, the prompt and `s4Deployment` on the signed run all
    // took it.
    // The parameter list is where `targetDeployment` belongs — it is the
    // default, so a caller that has nothing better still gets today's value.
    // Everything after `) => {` must use the argument.
    // `targetDeployment:` as a property name is the prompt builder's own field
    // and says nothing about where the value came from; a read is the bare
    // identifier, which is what the lookahead excludes.
    const statements = body.slice(body.indexOf(') => {'));
    const stateReads = statements
      .split('\n')
      .filter((line) => /\btargetDeployment\b(?!\s*:)/.test(line) && !/^\s*(\*|\/\/)/.test(line));
    expect(stateReads, 'handleAnalyze reads targetDeployment from the closure again').toEqual([]);

    // The four places that consume it, so a future edit cannot quietly drop one
    // back to the state variable while the signature keeps its parameter.
    expect(body).toMatch(/buildAbapEvidence\(codeToAnalyze, uploadedFileName \|\| 'main\.abap', deployment as/);
    expect(body).toMatch(/routeExtensibility\(evidenceReport, deployment \|\| 'private'\)/);
    expect(body).toMatch(/buildAnalysisPrompt\(\{ targetDeployment: deployment,/);
    expect(body.match(/s4Deployment: deployment/g) || [], 'both run writes must carry the argument').toHaveLength(2);
  });

  test('the dialog hands its choice to the call, not only to the screen', () => {
    const src = page();
    // `setTargetDeployment` is still right — the screen has to change too — but
    // it is not what the run reads.
    expect(src).toMatch(/setTargetDeployment\(modalSelection\);[\s\S]{0,400}?handleAnalyze\(legacyCode, modalSelection\);/);
  });
});

test.describe('suspending an account ends its sessions (b97e45a2976d)', () => {
  const admin = () => read('lib/firebase-admin.ts');
  const fn = (name: string) => {
    const src = admin();
    const start = src.indexOf(`export async function ${name}(`);
    expect(start, `${name} is gone`).toBeGreaterThan(-1);
    const end = src.indexOf('\n}', start);
    return src.slice(start, end);
  };

  test('revoking disables the sign-in and drops the refresh token', () => {
    // `status: 'suspended'` closed the server half — every mutating route passes
    // `assertAccountActive`. The client half stayed open: the browser keeps its
    // refresh token, renews indefinitely, and `firestore.rules` asks only
    // `userId == request.auth.uid` for the account's own projects.
    const body = fn('adminRevokeUser');
    expect(body, 'a revoked account keeps renewing its ID token').toMatch(/revokeRefreshTokens\(targetUid\)/);
    expect(body, 'a revoked account can sign in again and mint a fresh token').toMatch(/updateUser\(targetUid, \{ disabled: true \}\)/);
  });

  test('approving re-enables it, so a revocation is not a permanent lockout', () => {
    // Without this the pair is a trap: an account revoked and then approved
    // again reads `status: 'approved'` on every screen and still cannot sign in,
    // with no symptom an admin could see.
    expect(fn('adminApproveUser'), 'approve does not undo the disable that revoke sets').toMatch(
      /updateUser\(targetUid, \{ disabled: false \}\)/,
    );
  });
});

test.describe('a revocation cannot resurrect a deleted project (3e32d011b3c6)', () => {
  const route = () => read('app/api/projects/[projectId]/readers/route.ts');

  test('the transaction asks whether the project is still there before it writes', () => {
    const src = route();
    // The transaction already read the document; it just never asked. With
    // `{ merge: true }` a write to a missing document creates it — here one
    // holding nothing but `readers`, with no `userId`, which `firestore.rules`
    // then hides from the owner who thought it deleted.
    const tx = src.slice(src.indexOf('await gate.db.runTransaction('));
    const guard = tx.indexOf("if (!fresh.exists) throw new Error('project-gone');");
    const write = tx.indexOf('tx.set(projectRef, { readers:');
    expect(guard, 'the existence check is gone').toBeGreaterThan(-1);
    expect(write, 'the readers write is gone').toBeGreaterThan(-1);
    expect(guard, 'the check runs after the write it is meant to prevent').toBeLessThan(write);
  });

  test('a project that is gone answers 404, not 500', () => {
    // A 5xx invites a client that retries transient errors to send the same
    // doomed request again — the same reasoning that moved the approval route
    // from 500 to 400 on 22.09.2026.
    expect(route()).toMatch(/errMessage\(err\) === 'project-gone'[\s\S]{0,200}?status: 404/);
  });
});
