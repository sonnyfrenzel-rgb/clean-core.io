#!/usr/bin/env node
/**
 * Decide on security audit findings. Every decision is written to the sealed
 * register (docs/security/register.enc.json) — commit it with the change.
 *
 *   node scripts/security/register.mjs list
 *   node scripts/security/register.mjs accept <fingerprint> --priority P1 --step "Phase 0 · 0.7"
 *   node scripts/security/register.mjs refute <fingerprint> "<why it does not hold, with file:line or test>"
 *   node scripts/security/register.mjs risk   <fingerprint> "<why the risk is accepted, and by whom>"
 *   node scripts/security/register.mjs fixed  <fingerprint> <commit>
 *   node scripts/security/register.mjs public          rows for the roadmap: ID, severity, priority, step, status
 *
 * Finding details come from the newest opened report under .security-audit/inbox/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotEnv } from '../qa/lib/store.mjs';
import { privateKeyFrom } from './lib/envelope.mjs';
import { numbered } from './lib/mail.mjs';
import { loadRegister, nextId, publicRows, saveRegister } from './lib/register.mjs';

const [cmd, fp, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : null;
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const privateKey = privateKeyFrom(process.env.SECURITY_AUDIT_PRIVATE_KEY || loadDotEnv().SECURITY_AUDIT_PRIVATE_KEY);
const register = loadRegister(privateKey);

if (cmd === 'list') {
  for (const e of register.entries) console.log(`${e.id} [${e.fingerprint}] ${e.severity} · ${e.status}${e.priority ? ` · ${e.priority}` : ''}${e.step ? ` · ${e.step}` : ''} — ${e.title}`);
  process.exit(0);
}
if (cmd === 'public') {
  console.log('| ID | Schwere | Priorität | Roadmap-Schritt | Status |\n|---|---|---|---|---|');
  for (const row of publicRows(register)) console.log(row);
  process.exit(0);
}

if (!/^[0-9a-f]{12}$/.test(fp || '')) fail('A 12-character fingerprint is required (shown by scripts/security/inbox.mjs).');

// A fresh clone has no inbox yet; an existing entry can still be updated (finding def5abdae94c).
const INBOX = '.security-audit/inbox';
const reports = (existsSync(INBOX) ? readdirSync(INBOX) : [])
  .filter((f) => f.endsWith('.json'))
  .map((f) => join(INBOX, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  .map((p) => JSON.parse(readFileSync(p, 'utf8')));
const finding = reports.flatMap((p) => numbered(p).map((f) => ({ ...f, head: p.head }))).find((f) => f.fingerprint === fp);
const existing = register.entries.find((e) => e.fingerprint === fp);
if (!finding && !existing) fail(`No finding ${fp} in the opened reports or the register.`);

const now = new Date().toISOString();
const entry = existing || { id: nextId(register), fingerprint: fp, title: finding.title, severity: finding.severity, firstSeenHead: finding.head, createdAt: now };
const note = rest.filter((r) => !r.startsWith('--') && r !== flag('priority') && r !== flag('step')).join(' ').trim();

switch (cmd) {
  case 'accept':
    if (!['P1', 'P2', 'P3'].includes(flag('priority'))) fail('accept needs --priority P1|P2|P3.');
    if (!flag('step')) fail('accept needs --step "<roadmap phase and step>".');
    Object.assign(entry, { status: 'eingeplant', priority: flag('priority'), step: flag('step') });
    break;
  case 'refute':
    if (note.length < 20) fail('refute needs a reason of at least 20 characters, with evidence.');
    Object.assign(entry, { status: 'widerlegt', reason: note });
    break;
  case 'risk':
    if (note.length < 20) fail('risk needs a reason of at least 20 characters, naming who accepted it.');
    Object.assign(entry, { status: 'akzeptiertes Risiko', reason: note });
    break;
  case 'fixed':
    if (!/^[0-9a-f]{7,40}$/.test(note)) fail('fixed needs the commit that fixed it.');
    Object.assign(entry, { status: 'behoben', fixedIn: note });
    break;
  default:
    fail('Unknown command. Use list, accept, refute, risk, fixed or public.');
}
entry.updatedAt = now;
if (!existing) register.entries.push(entry);
saveRegister(register);
console.log(`${entry.id} [${fp}] → ${entry.status}. Commit docs/security/register.enc.json.`);
