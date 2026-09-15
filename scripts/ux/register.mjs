#!/usr/bin/env node
/**
 * Decide on UX review findings. Every decision goes into docs/ux/register.json —
 * commit it together with the roadmap change it causes.
 *
 *   node scripts/ux/register.mjs list
 *   node scripts/ux/register.mjs accept <fingerprint> --step "1.5" [--severity medium]   verified severity, when it differs
 *   node scripts/ux/register.mjs refute <fingerprint> "<why it does not hold, with file:line or screenshot>"
 *   node scripts/ux/register.mjs defer  <fingerprint> "<why not now>"
 *   node scripts/ux/register.mjs fixed  <fingerprint> <commit>
 *   node scripts/ux/register.mjs table                 rows for docs/ROADMAP.md §13
 *
 * Finding details come from the reports opened by scripts/ux/inbox.mjs under .ux-review/inbox/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegister, nextId, roadmapRows, saveRegister, STATUSES } from './lib/register.mjs';

const [cmd, fp, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : null;
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const register = loadRegister();

if (cmd === 'list') {
  for (const e of register.entries) console.log(`${e.id} [${e.fingerprint}] ${e.severity} · ${e.status}${e.step ? ` · ${e.step}` : ''} — ${e.title}`);
  process.exit(0);
}
if (cmd === 'table') {
  console.log('| ID | Schwere | Befund | Roadmap-Schritt | Status |\n|---|---|---|---|---|');
  for (const row of roadmapRows(register)) console.log(row);
  process.exit(0);
}

if (!/^[0-9a-f]{12}$/.test(fp || '')) fail('A 12-character fingerprint is required (shown by scripts/ux/inbox.mjs).');

const INBOX = '.ux-review/inbox';
const reports = (existsSync(INBOX) ? readdirSync(INBOX) : [])
  .filter((f) => f.endsWith('.json'))
  .map((f) => join(INBOX, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  .map((p) => JSON.parse(readFileSync(p, 'utf8')));
const finding = reports.flatMap((r) => r.findings.map((f) => ({ ...f, head: r.range.head }))).find((f) => f.fingerprint === fp);
const existing = register.entries.find((e) => e.fingerprint === fp);
if (!finding && !existing) fail(`No finding ${fp} in the opened reports or the register.`);

const now = new Date().toISOString();
const entry = existing || { id: nextId(register), fingerprint: fp, title: finding.title, severity: finding.severity, area: finding.area, firstSeenHead: finding.head, createdAt: now };
const note = rest.filter((r) => !r.startsWith('--') && r !== flag('step') && r !== flag('severity')).join(' ').trim();

switch (cmd) {
  case 'accept':
    if (!flag('step')) fail('accept needs --step "<roadmap step, e.g. 1.5 or 3.0>".');
    Object.assign(entry, { status: STATUSES.accepted, step: flag('step') });
    // Verification may rate it differently; the roadmap schedules by the verified severity, and the reported one is kept.
    if (flag('severity')) {
      if (!['critical', 'high', 'medium', 'low'].includes(flag('severity'))) fail('--severity must be critical, high, medium or low.');
      if (flag('severity') !== entry.severity) Object.assign(entry, { reportedSeverity: entry.reportedSeverity || entry.severity, severity: flag('severity') });
    }
    break;
  case 'refute':
    if (note.length < 20) fail('refute needs a reason of at least 20 characters, with evidence.');
    Object.assign(entry, { status: STATUSES.refuted, reason: note });
    break;
  case 'defer':
    if (note.length < 20) fail('defer needs a reason of at least 20 characters.');
    Object.assign(entry, { status: STATUSES.deferred, reason: note });
    break;
  case 'fixed':
    if (!/^[0-9a-f]{7,40}$/.test(note)) fail('fixed needs the commit that fixed it.');
    Object.assign(entry, { status: STATUSES.fixed, fixedIn: note });
    break;
  default:
    fail('Unknown command. Use list, accept, refute, defer, fixed or table.');
}
entry.updatedAt = now;
if (!existing) register.entries.push(entry);
saveRegister(register);
console.log(`${entry.id} [${fp}] → ${entry.status}. Commit docs/ux/register.json.`);
