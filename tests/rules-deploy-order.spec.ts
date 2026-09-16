import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  RULES_FILE,
  RULES_DEPLOYMENT_RECORD,
  checkRulesDeployment,
  normaliseRulesText,
  parseClientWritableProjectFields,
  type RulesDeploymentRecord,
} from '../lib/firestore-rules-contract';

/**
 * Rules first, app second — and the repository can tell which is which.
 *
 * `firestore.rules` is deployed by hand (`npm run deploy:rules`) and never by
 * CI. Nothing enforced the order. Ship an app change that needs a widened rule
 * before the rule is live and the app is simply broken in production, which is
 * how this repository learned the lesson: the rules had never been deployed to
 * the named production database at all, the `runs` subcollection was unreadable
 * and every analysis stopped at the Design page ("Empty Solution Design",
 * CHANGELOG). "Deploy the rules" was a sentence in a runbook.
 *
 * It is now a record: `docs/registers/rules-deployment.json` carries the SHA-256
 * of the deployed text and the client-writable fields it grants.
 * `lib/firestore-rules-contract.ts` compares it with the working copy, this spec
 * and `npm run rules:check` run the comparison, and the one order that breaks
 * production fails here.
 *
 * What does *not* fail here: a pending change that only takes a field away from
 * the browser. The app does not depend on it — the server route is the writer
 * either way — so the rules are merely wider than they need to be until the
 * deploy. Making that red would teach people to deploy blind, which is the
 * habit this is trying to prevent.
 *
 * And the drift was real. On 16.09.2026 production was read back for the first
 * time and turned out to be serving the ruleset of **20 August**: three
 * tightenings behind the repository, including client-writable consent fields
 * the repo had closed weeks earlier. That is the offline half's blind spot —
 * a committed hash cannot tell you that the *record* is wrong — so the online
 * half is `npm run rules:verify`, which asks production. It is not asserted
 * here: a test that needs credentials belongs nowhere near CI.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (text: string) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const rules = () => normaliseRulesText(read(RULES_FILE));
const record = (): RulesDeploymentRecord => JSON.parse(read(RULES_DEPLOYMENT_RECORD));

test.describe('the deployed rules are recorded, and the record is current', () => {
  test('the working copy is either the deployed text or an accounted-for pending change', () => {
    const verdict = checkRulesDeployment(rules(), record(), sha256);
    expect(verdict.problems, verdict.problems.join('\n')).toEqual([]);
    expect(verdict.ok).toBe(true);
  });

  test('the record describes the two texts it names', () => {
    const r = record();
    expect(r.file).toBe(RULES_FILE);
    expect(r.howToDeploy).toBe('npm run deploy:rules');
    expect(r.deployed.sha256OfLfNormalisedText).toMatch(/^[0-9a-f]{64}$/);
    expect(r.deployed.databases, 'the named production database is deployed to').toContain('clean-core-eu');
    // The record was seeded from a verified moment, not from a guess: the
    // ruleset production named when it was written.
    expect(r.deployed.rulesetName, 'the record names the ruleset it was taken from')
      .toMatch(/^projects\/cleancore-491216\/rulesets\/[0-9a-f-]{36}$/);
    // Every database the manual deploy targets is a database the record covers.
    const targets = JSON.parse(read('firebase.rules-all-dbs.json')).firestore.map((e: { database: string }) => e.database);
    for (const named of r.deployed.databases) expect(targets, `${named} is not a deploy target`).toContain(named);
    if (r.pending) {
      expect(r.pending.sha256OfLfNormalisedText).toBe(sha256(rules()));
      expect(r.pending.recordedFor.length, 'a pending rules change says what it is for').toBeGreaterThan(20);
      // The working copy's own allowlist, read out of the file rather than
      // described: pending.removesFromClient has to be the difference.
      const now = new Set(parseClientWritableProjectFields(rules()));
      for (const field of r.pending.removesFromClient) expect(now.has(field)).toBe(false);
      for (const field of r.pending.addsToClient) expect(now.has(field)).toBe(true);
    } else {
      expect(r.deployed.clientWritableProjectFields.slice().sort()).toEqual(parseClientWritableProjectFields(rules()));
    }
  });

  test('the preservation register points at the deployment record', () => {
    const register = JSON.parse(read('docs/registers/preservation-register.json'));
    expect(register.baseline.rules.deploymentRecord).toBe(RULES_DEPLOYMENT_RECORD);
    // Both registers hash the same text the same way.
    expect(register.baseline.rules.sha256OfLfNormalisedText).toBe(sha256(rules()));
  });
});

test.describe('the check refuses the order that breaks production', () => {
  const deployedFields = ['solutionDesign', 'status'];
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
      clientWritableProjectFields: deployedFields,
    },
  };
  // Two working copies whose only difference is the direction of the change.
  const rulesWith = (fields: string[]) =>
    `match /projects/{projectId} {\n  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly([\n    ${fields.map((f) => `'${f}'`).join(', ')}\n  ]);\n}\n`;

  test('an undeployed rule that GIVES a client a field is a failure, and names the command', () => {
    const working = rulesWith([...deployedFields, 'newToy']);
    const verdict = checkRulesDeployment(working, {
      ...base,
      pending: {
        sha256OfLfNormalisedText: sha256(working),
        recordedAt: '2026-09-16',
        recordedFor: 'a field the app already writes',
        addsToClient: ['newToy'],
        removesFromClient: [],
        note: '',
      },
    }, sha256);
    expect(verdict.ok).toBe(false);
    expect(verdict.direction).toBe('rules-changed-not-deployed');
    expect(verdict.problems.join('\n')).toContain('npm run deploy:rules');
    expect(verdict.problems.join('\n')).toContain('newToy');
  });

  test('an undeployed rule that TAKES a field away is allowed to sit pending', () => {
    const working = rulesWith(['status']);
    const verdict = checkRulesDeployment(working, {
      ...base,
      pending: {
        sha256OfLfNormalisedText: sha256(working),
        recordedAt: '2026-09-16',
        recordedFor: 'roadmap 0.7',
        addsToClient: [],
        removesFromClient: ['solutionDesign'],
        note: '',
      },
    }, sha256);
    expect(verdict.problems).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.pending).toBe(true);
  });

  test('a rules change nobody recorded at all is a failure', () => {
    const verdict = checkRulesDeployment(rulesWith(['status']), base, sha256);
    expect(verdict.ok).toBe(false);
    expect(verdict.direction).toBe('rules-changed-unrecorded');
    expect(verdict.problems.join('\n')).toContain('RULES CHANGED, NOT DEPLOYED, NOT RECORDED');
  });

  test('a pending block whose hash no longer matches the file is a failure', () => {
    const working = rulesWith(['status']);
    const verdict = checkRulesDeployment(working, {
      ...base,
      pending: {
        sha256OfLfNormalisedText: 'a'.repeat(64),
        recordedAt: '2026-09-16',
        recordedFor: 'edited again after recording',
        addsToClient: [],
        removesFromClient: ['solutionDesign'],
        note: '',
      },
    }, sha256);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join('\n')).toContain('re-record');
  });

  test('a "pending" block left behind after the deploy says the RECORD is stale, not the rules', () => {
    // The two mistakes have different fixes, so the message has to pick one:
    // "the rules changed and were not deployed" sends you to `deploy:rules`,
    // this one sends you to `rules:record -- --deployed`.
    const working = rulesWith(deployedFields);
    const verdict = checkRulesDeployment(working, {
      ...base,
      deployed: { ...base.deployed, sha256OfLfNormalisedText: sha256(working) },
      pending: {
        sha256OfLfNormalisedText: sha256(working),
        recordedAt: '2026-09-16',
        recordedFor: 'already deployed',
        addsToClient: [],
        removesFromClient: [],
        note: '',
      },
    }, sha256);
    expect(verdict.ok).toBe(false);
    expect(verdict.direction).toBe('record-ahead-of-file');
    expect(verdict.problems.join('\n')).toContain('RECORD AHEAD OF FILE');
    expect(verdict.problems.join('\n')).toContain('--deployed');
    expect(verdict.problems.join('\n'), 'this is not a missing deploy').not.toContain('RULES CHANGED');
  });
});

test.describe('CI still does not deploy the rules, and a human still can in one command', () => {
  test('no workflow deploys firestore rules', () => {
    const dir = path.join(ROOT, '.github', 'workflows');
    for (const name of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      expect(text, `${name} deploys the rules`).not.toContain('deploy:rules');
      expect(text, `${name} deploys the rules`).not.toMatch(/firebase\s+deploy/);
    }
  });

  test('deploy:rules deploys and records; rules:check only reports', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['deploy:rules']).toContain('rules-deploy.ts --deploy');
    expect(pkg.scripts['rules:check']).toContain('rules-deploy.ts');
    expect(pkg.scripts['rules:verify']).toContain('--verify');
    const script = read('scripts/rules-deploy.ts');
    // The deploy path records only after the deploy actually succeeded — a
    // record written ahead of the deploy is the failure this whole file is about.
    expect(script).toContain("if (result.status !== 0)");
    expect(script.indexOf('return recordDeployed();')).toBeGreaterThan(script.indexOf("if (result.status !== 0)"));
  });

  test('the online check asks production and stays out of CI', () => {
    const script = read('scripts/rules-deploy.ts');
    // It reads the released ruleset rather than trusting the record…
    expect(script).toContain('firebaserules.googleapis.com');
    expect(script).toContain('releases/cloud.firestore');
    // …with the developer's own gcloud login, and the quota-project header that
    // API refuses to work without.
    expect(script).toContain("'gcloud', ['auth', 'print-access-token']");
    expect(script).toContain("'x-goog-user-project'");
    // …and it checks every database the manual deploy targets, not just one.
    expect(script).toContain('firebase.rules-all-dbs.json');
    // A record that no longer matches production is its own named failure.
    expect(script).toContain('RECORD WAS UPDATED WITHOUT A DEPLOY');
    // Nowhere near CI: a workflow that could read rules is one step from a
    // workflow that deploys them.
    const dir = path.join(ROOT, '.github', 'workflows');
    for (const name of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      expect(text, `${name} runs the online rules check`).not.toContain('rules:verify');
      expect(text, `${name} talks to the Rules API`).not.toContain('firebaserules.googleapis.com');
    }
  });
});
