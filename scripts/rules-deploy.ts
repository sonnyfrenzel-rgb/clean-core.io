/**
 * scripts/rules-deploy.ts — deploy `firestore.rules` by hand, and record it.
 *
 * CI never deploys the rules and must not start: the rules are the last line
 * under a customer's ABAP, and a pipeline that rewrites them on every merge is
 * one bad merge away from opening a database. So a human deploys, and the same
 * command writes down what is now live — because "I deployed it" is a memory,
 * and `docs/registers/rules-deployment.json` is a record two tests can read.
 *
 * Usage:
 *   npm run deploy:rules            # deploy to every database, then record
 *   npm run rules:check             # offline: record vs. working copy
 *   npm run rules:verify            # online: what production is actually serving
 *   npm run rules:record -- --pending "why"   # rules changed, deploy comes later
 *   npm run rules:record -- --deployed        # I deployed by hand, write it down
 *
 * The offline check refuses exactly one thing: a working copy that gives a
 * client a field the deployed rules do not, because that is the order in which
 * the app needs rules nobody has rolled out. Removing a client-writable field
 * may sit pending — the app does not depend on it, the rules are merely wider
 * than they need to be until the deploy happens.
 *
 * `--verify` is the half a committed hash cannot do. It reads the released
 * ruleset out of the Firebase Rules API with the gcloud login already on the
 * developer's machine and compares three things — production, the record and
 * the working copy — so that "the record was updated without a deploy" has a
 * name and not just a mismatch. It is deliberately not in CI: CI must not hold
 * credentials that can touch rules, and a check that needs them would be the
 * first step towards CI deploying them.
 */

import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  RULES_FILE,
  RULES_DEPLOYMENT_RECORD,
  checkRulesDeployment,
  normaliseRulesText,
  parseClientWritableProjectFields,
  type RulesDeploymentRecord,
} from '../lib/firestore-rules-contract';

const ROOT = process.cwd();
const rulesPath = path.join(ROOT, RULES_FILE);
const recordPath = path.join(ROOT, RULES_DEPLOYMENT_RECORD);

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const readRules = () => normaliseRulesText(readFileSync(rulesPath, 'utf8'));
const readRecord = (): RulesDeploymentRecord => JSON.parse(readFileSync(recordPath, 'utf8'));
const today = () => new Date().toISOString().slice(0, 10);

function writeRecord(record: RulesDeploymentRecord): void {
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

/* ------------------------------------------------- what production serves */

/** The databases the manual deploy targets, read from the deploy config itself. */
function deployTargets(): string[] {
  const config = JSON.parse(readFileSync(path.join(ROOT, 'firebase.rules-all-dbs.json'), 'utf8')) as {
    firestore: Array<{ database: string }>;
  };
  return config.firestore.map((entry) => entry.database);
}

async function productionRules(project: string, database: string): Promise<{ sha256: string; rulesetName: string; updateTime: string }> {
  const token = spawnSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (token.status !== 0) throw new Error('gcloud auth print-access-token failed — run `gcloud auth login` first.');
  // The Rules API bills against a quota project, and refuses without this header.
  const headers = { Authorization: `Bearer ${token.stdout.trim()}`, 'x-goog-user-project': project };

  const releaseRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore/${encodeURIComponent(database)}`,
    { headers },
  );
  if (!releaseRes.ok) throw new Error(`release ${database}: HTTP ${releaseRes.status} ${await releaseRes.text()}`);
  const release = (await releaseRes.json()) as { rulesetName: string; updateTime: string };

  const rulesetRes = await fetch(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`, { headers });
  if (!rulesetRes.ok) throw new Error(`ruleset ${release.rulesetName}: HTTP ${rulesetRes.status}`);
  const ruleset = (await rulesetRes.json()) as { source: { files: Array<{ content: string }> } };
  const content = normaliseRulesText(ruleset.source.files.map((f) => f.content).join('\n'));
  return { sha256: sha256(content), rulesetName: release.rulesetName, updateTime: release.updateTime };
}

async function verify(): Promise<number> {
  const rules = readRules();
  const record = readRecord();
  const working = sha256(rules);
  const recorded = record.deployed.sha256OfLfNormalisedText;
  let failed = false;

  console.log(`working copy: ${working.slice(0, 12)}…`);
  console.log(`record says live: ${recorded.slice(0, 12)}… (${record.deployed.deployedAt})`);

  for (const database of deployTargets()) {
    let live: Awaited<ReturnType<typeof productionRules>>;
    try {
      live = await productionRules(record.deployed.project, database);
    } catch (err) {
      console.error(`  ${database}: could not be read — ${(err as Error).message}`);
      failed = true;
      continue;
    }
    const tags: string[] = [];
    if (live.sha256 === recorded) tags.push('matches the record');
    else {
      tags.push('DOES NOT MATCH THE RECORD');
      failed = true;
    }
    if (live.sha256 === working) tags.push('matches the working copy');
    console.log(`  ${database}: ${live.sha256.slice(0, 12)}… released ${live.updateTime} — ${tags.join(', ')}`);
  }

  if (failed) {
    console.error(
      '\nRECORD WAS UPDATED WITHOUT A DEPLOY (or somebody deployed from elsewhere): production is not serving the text this record claims. Deploy with `npm run deploy:rules`, or correct the record with `npm run rules:record -- --deployed` once the file and production agree.',
    );
    return 1;
  }
  if (working !== recorded) {
    console.log('\nProduction matches the record. The working copy is ahead — see `npm run rules:check`.');
  } else {
    console.log('\nProduction, the record and the working copy all agree.');
  }
  return 0;
}

function check(): number {
  const rules = readRules();
  const record = readRecord();
  const verdict = checkRulesDeployment(rules, record, sha256);
  if (verdict.ok && !verdict.pending) {
    console.log(`OK — ${RULES_FILE} is the text recorded as deployed (${sha256(rules).slice(0, 12)}…).`);
    return 0;
  }
  if (verdict.ok && verdict.pending) {
    const pending = record.pending!;
    console.log(`PENDING — ${RULES_FILE} has changes that are not deployed.`);
    console.log(`  for:     ${pending.recordedFor}`);
    console.log(`  removes: ${pending.removesFromClient.join(', ') || '—'}`);
    console.log(`  adds:    ${pending.addsToClient.join(', ') || '—'}`);
    console.log('  Nothing in the app depends on them, so this is not an error. Deploy with `npm run deploy:rules`.');
    return 0;
  }
  console.error(`FAILED (${verdict.direction}) — ${RULES_DEPLOYMENT_RECORD} and ${RULES_FILE} do not agree:`);
  for (const problem of verdict.problems) console.error(`  · ${problem}`);
  return 1;
}

/** Fold the working copy into the record as the text that is now live. */
function recordDeployed(): number {
  const rules = readRules();
  const record = readRecord();
  record.deployed = {
    ...record.deployed,
    sha256OfLfNormalisedText: sha256(rules),
    deployedAt: today(),
    clientWritableProjectFields: parseClientWritableProjectFields(rules),
  };
  delete record.pending;
  writeRecord(record);
  console.log(`Recorded as deployed: ${record.deployed.sha256OfLfNormalisedText.slice(0, 12)}… on ${record.deployed.deployedAt}.`);
  return check();
}

/** Write down a rules change that has not been deployed yet, and why. */
function recordPending(reason: string): number {
  const rules = readRules();
  const record = readRecord();
  const hash = sha256(rules);
  if (hash === record.deployed.sha256OfLfNormalisedText) {
    delete record.pending;
    writeRecord(record);
    console.log('Nothing pending — the working copy is the deployed text.');
    return check();
  }
  const deployed = new Set(record.deployed.clientWritableProjectFields);
  const now = parseClientWritableProjectFields(rules);
  record.pending = {
    sha256OfLfNormalisedText: hash,
    recordedAt: today(),
    recordedFor: reason,
    addsToClient: now.filter((f) => !deployed.has(f)).sort(),
    removesFromClient: [...deployed].filter((f) => !now.includes(f)).sort(),
    note: record.pending?.note
      ?? 'Bis zum Deploy sind die alten Regeln live. `npm run deploy:rules` rollt aus und loescht diesen Block.',
  };
  writeRecord(record);
  console.log(`Recorded as pending: ${hash.slice(0, 12)}… — ${reason}`);
  return check();
}

function deploy(): number {
  const args = ['deploy', '--only', 'firestore:rules', '--config', 'firebase.rules-all-dbs.json', '--project', 'cleancore-491216'];
  console.log(`> firebase ${args.join(' ')}`);
  const result = spawnSync('firebase', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error('The deploy failed — the record is left untouched, so it still describes what is live.');
    return result.status ?? 1;
  }
  return recordDeployed();
}

async function main(): Promise<number> {
  const flags = process.argv.slice(2);
  const reasonAt = flags.indexOf('--pending');
  if (flags.includes('--verify')) return verify();
  if (flags.includes('--deploy')) return deploy();
  if (flags.includes('--deployed')) return recordDeployed();
  if (reasonAt !== -1) return recordPending(flags[reasonAt + 1] || 'not stated');
  return check();
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
