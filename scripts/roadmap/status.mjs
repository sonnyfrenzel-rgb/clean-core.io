#!/usr/bin/env node
/**
 * Where do we stand? — derived, not maintained.
 *
 * `docs/ROADMAP.md` lists 86 steps and **no status**: the last column of each
 * row is a size estimate (S/M/L). `docs/BACKLOG.md` is two thousand lines of
 * running text about open points. So on 23.09.2026 the question "how far are we
 * from 3.0" had no answer, although 3.0 is the one public jump.
 *
 * A status column kept by hand would have been the wrong answer: it drifts, as
 * the landing page's section headings drifted, and for the same reason — nobody
 * compares it with reality. This script reads the state from the two sources
 * that are maintained anyway, and names for every step **where** it got it from:
 *
 *   belegt     (evidenced) a commit names the step in its subject — `feat(2.15): …`
 *   behauptet  (claimed) the roadmap row itself says "Built", but no commit names it
 *   offen      (open) neither
 *
 * The difference between the first two is the actual purpose. "Claimed" is not
 * a reproach: most of these rows date from before the marker convention. But it
 * is exactly the set where planning goes wild, because two readers read it
 * differently.
 *
 * Usage: `npm run roadmap:status` · `--json` for the raw data · `--offen` only what is open.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every table row that starts with a step number, together with its heading. */
export function readSteps(markdown) {
  const steps = [];
  let section = '(ohne Abschnitt)';
  // Split on either ending. `core.autocrlf=true` is the default on Windows, so a
  // developer's checkout of ROADMAP.md is CRLF while the blob and every CI
  // runner are LF. A bare newline split leaves a trailing carriage return on
  // each line, and the row regex below then reads no step at all: the whole
  // instrument reported "gesamt 0" on 23.09.2026 and looked like an empty
  // roadmap rather than a broken parser. `.gitattributes` documents three
  // earlier false alarms of exactly this shape in the workflow guards.
  for (const line of markdown.split(/\r?\n/)) {
    const phase = /^### Phase (\d+) — (\S+)/.exec(line);
    if (phase) section = `Phase ${phase[1]} (${phase[2]})`;
    else {
      const chapter = /^## (\d+)\. (.+)$/.exec(line);
      if (chapter) section = `§${chapter[1]} ${chapter[2].split('(')[0].trim()}`;
    }
    // Two OR three number parts. Until 23.09.2026 the ten steps 3.0.1–3.0.10 (the
    // public relaunch) were invisible to this instrument: the rule required exactly
    // two, and "3.0.6" did not match it. It reported 98 steps where there are 108 —
    // and the missing block was precisely the one that makes up 3.0.
    const row = /^\|\s*(\d+(?:\.\d+){1,2})\s*\|(.*)$/.exec(line);
    if (!row) continue;
    steps.push({ id: row[1], section, text: row[2] });
  }
  return steps;
}

/**
 * Does the row itself say it is built?
 *
 * Deliberately narrow: "gebaut wird" (is being built) and "gebaut nach" (built
 * to) are intentions, not reports, and `behoben` (fixed) belongs to the
 * finding tables in §12–§14, not to a step.
 *
 * Since the roadmap is English (3.0.14, 02.10.2026) a row reports "**Built",
 * "**Shipped" or "**Fully built"; the German forms stay accepted. "to be built"
 * and "built to" are intentions, and "fixed" belongs to the finding tables.
 */
export const claimsBuilt = (text) =>
  /\*\*(Gebaut|Ausgeliefert|Fertig gebaut|Built|Shipped|Fully built)\b/.test(text) ||
  /\b(Gebaut|Built) (in v[\d.]+|\d{2}\.\d{2}\.\d{4})/.test(text);

/** The step numbers a commit subject names: `feat(2.15)`, `fix(1.9, 7.8, 3.3)`. */
export function idsFromSubjects(subjects) {
  const found = new Map();
  for (const subject of subjects) {
    const marker = /^[a-z]+\(([^)]*)\)/.exec(subject);
    // A version number in the scope is not a step. `release(v2.12.0): …` reported
    // step 2.12 as built for ages, because the old rule took the first two number
    // parts from "v2.12.0" — a release that had nothing to do with the step. Found
    // on 23.09.2026 while widening the rule to three parts.
    if (marker && /^v\d/.test(marker[1].trim())) continue;
    if (!marker) continue;
    for (const id of marker[1].match(/\d+(?:\.\d+){1,2}/g) || []) {
      if (!found.has(id)) found.set(id, subject);
    }
  }
  return found;
}

function gitSubjects() {
  try {
    return execFileSync('git', ['log', '--format=%s'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function buildStatus(markdown, subjects) {
  const byCommit = idsFromSubjects(subjects);
  return readSteps(markdown).map((step) => ({
    ...step,
    state: byCommit.has(step.id) ? 'belegt' : claimsBuilt(step.text) ? 'behauptet' : 'offen',
    commit: byCommit.get(step.id) || null,
  }));
}

function main() {
  const args = process.argv.slice(2);
  const steps = buildStatus(readFileSync(join(ROOT, 'docs/ROADMAP.md'), 'utf8'), gitSubjects());

  if (args.includes('--json')) {
    console.log(JSON.stringify(steps, null, 2));
    return;
  }

  const sections = [...new Set(steps.map((s) => s.section))];
  const count = (list, state) => list.filter((s) => s.state === state).length;

  if (!args.includes('--offen')) {
    console.log('Section                            belegt  behauptet  offen    total');
    console.log('─'.repeat(70));
    for (const section of sections) {
      const list = steps.filter((s) => s.section === section);
      console.log(
        section.padEnd(34) +
          String(count(list, 'belegt')).padStart(6) +
          String(count(list, 'behauptet')).padStart(11) +
          String(count(list, 'offen')).padStart(7) +
          String(list.length).padStart(9),
      );
    }
    console.log('─'.repeat(70));
    console.log(
      'total'.padEnd(34) +
        String(count(steps, 'belegt')).padStart(6) +
        String(count(steps, 'behauptet')).padStart(11) +
        String(count(steps, 'offen')).padStart(7) +
        String(steps.length).padStart(9),
    );
    console.log(
      '\nbelegt = a commit names the step · behauptet = the row says so, no commit names it · offen = neither',
    );
  }

  const open = steps.filter((s) => s.state === 'offen');
  console.log(`\nOpen — offen (${open.length}):`);
  for (const section of sections) {
    const ids = open.filter((s) => s.section === section).map((s) => s.id);
    if (ids.length) console.log(`  ${section.padEnd(32)} ${ids.join(' ')}`);
  }

  const claimed = steps.filter((s) => s.state === 'behauptet');
  if (claimed.length) {
    console.log(`\nClaimed (behauptet), but no commit names it (${claimed.length}) — here two readers read differently:`);
    for (const s of claimed) console.log(`  ${s.id.padEnd(6)} ${s.section}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('status.mjs')) main();
