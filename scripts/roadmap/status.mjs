#!/usr/bin/env node
/**
 * Wo stehen wir? — abgeleitet, nicht gepflegt.
 *
 * `docs/ROADMAP.md` führt 86 Schritte und **keinen Status**: die letzte Spalte
 * jeder Zeile ist eine Größenschätzung (S/M/L). `docs/BACKLOG.md` sind zweitausend
 * Zeilen Fließtext über offene Punkte. Die Frage „wie weit sind wir bis 3.0" hatte
 * deshalb am 23.09.2026 keine Antwort, obwohl 3.0 der eine öffentliche Sprung ist.
 *
 * Eine Statusspalte von Hand wäre die falsche Antwort gewesen: sie driftet, wie die
 * Abschnittsüberschriften der Landingpage gedriftet sind, und aus demselben Grund —
 * niemand vergleicht sie mit der Wirklichkeit. Dieses Skript liest den Stand aus den
 * beiden Quellen, die ohnehin gepflegt werden, und nennt für jeden Schritt, **woher**
 * er ihn hat:
 *
 *   belegt     ein Commit nennt den Schritt im Betreff — `feat(2.15): …`
 *   behauptet  die Roadmap-Zeile sagt selbst „Gebaut", aber kein Commit nennt sie
 *   offen      keines von beidem
 *
 * Der Unterschied zwischen den ersten beiden ist der eigentliche Zweck. „Behauptet"
 * ist keine Schuldzuweisung: die meisten dieser Zeilen stammen aus einer Zeit vor der
 * Marker-Konvention. Aber es ist genau die Menge, bei der Planung wild wird, weil zwei
 * Leser sie verschieden lesen.
 *
 * Aufruf: `npm run roadmap:status` · `--json` für die Rohdaten · `--offen` nur das Offene.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Jede Tabellenzeile, die mit einer Schrittnummer beginnt, samt ihrer Überschrift. */
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
    const row = /^\|\s*(\d+\.\d+)\s*\|(.*)$/.exec(line);
    if (!row) continue;
    steps.push({ id: row[1], section, text: row[2] });
  }
  return steps;
}

/**
 * Sagt die Zeile selbst, sie sei gebaut?
 *
 * Bewusst eng: „gebaut wird" und „gebaut nach" sind Absichten, keine Meldungen, und
 * `behoben` gehört zu den Befundtabellen in §12–§14, nicht zu einem Schritt.
 */
export const claimsBuilt = (text) =>
  /\*\*(Gebaut|Ausgeliefert|Fertig gebaut)\b/.test(text) || /\bGebaut (in v[\d.]+|\d{2}\.\d{2}\.\d{4})/.test(text);

/** Die Schrittnummern, die ein Commit-Betreff nennt: `feat(2.15)`, `fix(1.9, 7.8, 3.3)`. */
export function idsFromSubjects(subjects) {
  const found = new Map();
  for (const subject of subjects) {
    const marker = /^[a-z]+\(([^)]*)\)/.exec(subject);
    if (!marker) continue;
    for (const id of marker[1].match(/\d+\.\d+/g) || []) {
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
    console.log('Abschnitt                          belegt  behauptet  offen   gesamt');
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
      'gesamt'.padEnd(34) +
        String(count(steps, 'belegt')).padStart(6) +
        String(count(steps, 'behauptet')).padStart(11) +
        String(count(steps, 'offen')).padStart(7) +
        String(steps.length).padStart(9),
    );
    console.log(
      '\nbelegt = ein Commit nennt den Schritt · behauptet = die Zeile sagt es, kein Commit nennt sie · offen = keines von beidem',
    );
  }

  const open = steps.filter((s) => s.state === 'offen');
  console.log(`\nOffen (${open.length}):`);
  for (const section of sections) {
    const ids = open.filter((s) => s.section === section).map((s) => s.id);
    if (ids.length) console.log(`  ${section.padEnd(32)} ${ids.join(' ')}`);
  }

  const claimed = steps.filter((s) => s.state === 'behauptet');
  if (claimed.length) {
    console.log(`\nBehauptet, aber von keinem Commit belegt (${claimed.length}) — hier lesen zwei Leser verschieden:`);
    for (const s of claimed) console.log(`  ${s.id.padEnd(6)} ${s.section}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('status.mjs')) main();
