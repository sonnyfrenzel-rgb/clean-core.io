import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * QA full review of v2.20.0 (fc787674705f), slice H: the pages under
 * `app/(app)/` outside `project/`.
 *
 * Most of the findings were sentences that claimed more than the product does —
 * a successor "for each" table access, a compiled target, a Belgium-only
 * service chain, a score no money figure is derived from although the Economics
 * stage uses it. The rest were small state defects on the dashboard, the admin
 * console and the settings page. These guards pin each correction to its file,
 * so the sentence cannot come back unnoticed. They read source because none of
 * them needs a server to be checked; the rendered text guards
 * (`claims-honesty-guard`, `copy-ci-guard`) keep running beside them.
 */
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const slice = (s: string, from: string, len = 4000) => {
  const i = s.indexOf(from);
  expect(i, `marker not found: ${from}`).toBeGreaterThanOrEqual(0);
  return s.slice(i, i + len);
};

test.describe('public copy claims no more than the product does', () => {
  test('ABAP custom code analysis: successors and function modules are qualified', () => {
    const s = read('app/(app)/abap-custom-code-analysis/page.tsx');
    expect(s).not.toContain('successor for each');
    expect(s).not.toContain('and function modules, checked against');
    expect(s).toContain('is not assessed yet');
  });

  test('About: hosting and the draft are not overstated', () => {
    const s = read('app/(app)/about/page.tsx');
    expect(s).not.toContain('All infrastructure runs');
    expect(s).not.toContain('Clean-Core-compliant draft');
  });

  test('Clean Core explained: the cloud restriction is not generalised', () => {
    const s = read('app/(app)/clean-core-explained/page.tsx');
    expect(s).not.toMatch(/cloud offerings\s+simply do not run/);
  });

  test('Clean Core Score: 100, money and provenance are stated as they are', () => {
    const s = read('app/(app)/clean-core-score/page.tsx');
    expect(s).not.toContain('all analyzed customer-specific extensions align');
    expect(s).not.toMatch(/derived from it\s+anywhere/);
    expect(s).toContain('The Economics stage is the one place');
    expect(s).not.toMatch(/traced to the SAP\s+object it came from/);
    expect(s).not.toContain('Every verdict traceable to SAP&rsquo;s own object data');
  });

  test('First run: the cost card knows the starter-example exemption', () => {
    const s = read('app/(app)/first-run/page.tsx');
    const card = slice(s, "t: 'What it costs'", 300);
    expect(card).toContain('starter example');
  });

  test('How it works: generation is model output, tests are per route', () => {
    const s = read('app/(app)/how-it-works/page.tsx');
    expect(s).not.toContain('static targets are fully supported');
    expect(s).not.toContain('Target code is compiled');
    expect(s).not.toContain('Every transformation produces a package laid out for abapGit');
    expect(s).not.toContain('ABAP-Unit test classes are generated alongside');
    expect(s).not.toContain('Three deterministic stages');
    expect(s).not.toContain('The LLM handles only semantic tasks');
  });

  test('Knowledge: no instant upgrades, no tenant configuration, grade provenance split', () => {
    const s = read('app/(app)/knowledge/page.tsx');
    expect(s).not.toContain('upgrade their core ERP system instantly');
    expect(s).not.toContain('Zero impact');
    expect(s).not.toContain('Clean-Core.io configures secure tunnels');
    expect(s).not.toContain('derived from SAP’s own published object data');
  });

  test('Object classification: custom objects are estimates, not lookups', () => {
    const s = read('app/(app)/sap-clean-core-object-classification/page.tsx');
    expect(s).not.toContain('so a graded object is a lookup');
    expect(s).toContain('Only your own Z/Y objects');
  });

  test('Cloudification: no universal lookup, no complete inventory, no compliant draft', () => {
    const s = read('app/(app)/sap-cloudification/page.tsx');
    expect(s).not.toContain('Any Object');
    expect(s).not.toMatch(/\bany SAP (standard )?object/);
    expect(s).not.toContain('every standard object your code touches');
    expect(s).not.toContain('drafts the first clean-core-compliant');
  });

  test('Tenant security: reads, regions and the request are described as built', () => {
    const s = read('app/(app)/tenant-security/page.tsx');
    expect(s).not.toContain('one read-only OData call');
    expect(s).not.toContain('ATC/SCI');
    expect(s).not.toContain('All processing happens');
    expect(s).not.toContain('verify the legitimacy of the connection details');
  });

  test('Admin: an open or click event is not reported as a read', () => {
    const s = read('app/(app)/admin/page.tsx');
    expect(s).not.toContain("'Welcome mail read'");
  });
});

test.describe('state defects on dashboard, admin and settings', () => {
  test('Admin: only the latest registration snapshot may land', () => {
    const s = read('app/(app)/admin/page.tsx');
    const effect = slice(s, "query(collection(db, 'registration_requests')", 3000);
    // The guard sits between the awaited per-row reads and the state write.
    expect(effect).toMatch(/const mine = \+\+generation;/);
    expect(effect).toMatch(/if \(!active \|\| mine !== generation\) return;\s*setRequests\(fetched\);/);
    expect(effect).toMatch(/active = false;\s*unsubscribe\(\);/);
  });

  test('Dashboard: the one-time project fetch cannot land after cleanup or after the listener', () => {
    const s = read('app/(app)/dashboard/page.tsx');
    const effect = slice(s, "where('userId', '==', user.uid),", 2000);
    expect(effect).toMatch(/getDocs\(q\)\.then\(\(snapshot\) => \{\s*if \(cancelled \|\| live\) return;/);
    expect(effect).toMatch(/onSnapshot\(q, \(snapshot\) => \{\s*live = true;/);
    expect(effect).toMatch(/cancelled = true;\s*unsubscribe\(\);/);
  });

  test('Dashboard: static announcements carry no invented timestamp', () => {
    const s = read('app/(app)/dashboard/page.tsx');
    expect(s).not.toContain("'Just now'");
    expect(s).not.toContain('activePost.createdAt');
  });

  test('Dashboard: a stale deliverable is marked in the list, the viewer and the file name', () => {
    const s = read('app/(app)/dashboard/page.tsx');
    const fn = slice(s, 'function ProjectDeliverables(', 9000);
    expect(fn).toContain('staleness(project)');
    expect(fn).toContain('<CcProvenanceChip value="stale" note="source changed" />');
    expect(fn).toContain("item.stale ? '_STALE' : ''");
    expect(fn).toContain('(stale: built for a previous source)');
  });

  test('Settings: a password change resolves the second factor', () => {
    const s = read('app/(app)/settings/page.tsx');
    const fn = slice(s, 'const handleChangePassword', 2500);
    expect(fn).toContain('reauthenticateWithFactor(currentUser, currentPassword');
    expect(fn).not.toContain('reauthenticateWithCredential(');
    // And the form asks for the code when a factor is enrolled.
    const form = slice(s, '<form onSubmit={handleChangePassword}', 2000);
    expect(form).toContain('value={pwChangeMfaCode}');
  });

  test('Settings: MFA setup cannot advance without a secret', () => {
    const s = read('app/(app)/settings/page.tsx');
    const dialog = slice(s, 'open={showMfaSetup}', 9000);
    expect(dialog).toMatch(/mfaSetupStep === 1 && !totpSecret \?/);
    expect(dialog).toMatch(/\{totpSecret \? \(\s*<>\s*<p className="m-0 text-cc-ink-muted">\s*Open your authenticator app/);
  });

  test('Settings: a save does not inherit the last connection test colour', () => {
    const s = read('app/(app)/settings/page.tsx');
    const fn = slice(s, 'const saveS4Config', 2000);
    expect(fn).toMatch(/setConnectionStatus\('disconnected'\);\s*setConnectionMessage\("Configuration saved/);
  });

  test('Settings: the erasure copy names what deletion does not reach', () => {
    const s = read('app/(app)/settings/page.tsx');
    expect(s).not.toContain('user account and all associated data');
    expect(s).not.toContain('permanently and irrevocably erase all your personal data');
    expect(s).toContain('The security audit record');
  });
});
