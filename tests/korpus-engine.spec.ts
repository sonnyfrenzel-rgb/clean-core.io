import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import {
  compareAll,
  readCases,
  readManifest,
  readWithEngine,
  readBaseline,
  resultId,
  RULE_BRIDGES,
  STATEMENT_CLASSES,
  type BaselineEntry,
  type ClassResult,
} from './helpers/korpus-comparison';

/**
 * Der Referenzkorpus gegen die Engine (Roadmap 2.10).
 *
 * Das Fallbuch `docs/korpus/referenzkorpus-v2.1.md` hält für 68 ABAP-Fälle die
 * richtige Antwort fest, bevor die Engine gefragt wird.
 * `scripts/korpus/build-bundle.mjs` übersetzt es nach `tests/korpus/`, und
 * dieser Spec lässt `lib/abap/` über jeden Fall laufen und vergleicht — je
 * Aussageklasse getrennt, weil der Korpus und die Engine nicht dieselben
 * Aussagen führen.
 *
 * **Die Ratsche.** `tests/korpus/baseline.json` hält den Stand jeder
 * Fall-und-Klasse fest: `agree`, oder `disagree` mit Urteil und Grund. Der Lauf
 * fällt, wenn
 *
 *   (a) ein `agree` zu `disagree` wird — eine Übereinstimmung ist verloren
 *       gegangen,
 *   (b) eine `disagree` verschwindet, ohne dass der Eintrag gestrichen wurde —
 *       gute Nachrichten, und sie gehören aufgeschrieben,
 *   (c) sich das Urteil zu einer Abweichung ändert, ohne dass die Baseline
 *       nachgezogen wurde,
 *   (d) das Bündel nicht mehr zum Fallbuch passt,
 *   (e) `manifest.json` einen anderen Fallbuch-Hash trägt als die Datei in
 *       `docs/korpus/`.
 *
 * Was die Ratsche **nicht** ist: eine Erlaubnisliste. Jede `disagree` trägt ein
 * Urteil aus genau drei Möglichkeiten und einen Grund mit Substanz, und ein
 * Test weiter unten besteht darauf. `engine-defekt` heißt: der Fall hat recht
 * und die Engine nicht — das ist ein Punkt für Phase 2, hier wird er gezählt
 * und benannt, nicht behoben. `korpus-offen` heißt: die Sollantwort selbst ist
 * fraglich; sie wird trotzdem nicht geändert, sondern geht als Frage an die
 * Fallautoren zurück. `nicht-vergleichbar` heißt: die Engine führt diese
 * Aussage nicht — keine Schwäche des Korpus, sondern eine Aussage über den
 * Stand von Phase 2.
 *
 * Ohne Server, ohne Emulator, ohne Modell: reine Funktionen über Text.
 */

const BASELINE = readBaseline();
const LIVE: ClassResult[] = compareAll();
const LIVE_BY_ID = new Map(LIVE.map((result) => [resultId(result), result]));
const BASE_BY_ID = new Map(BASELINE.entries.map((entry) => [resultId(entry), entry]));

const VERDICTS = ['engine-defekt', 'korpus-offen', 'nicht-vergleichbar'] as const;

function describe(result: ClassResult): string {
  return `  ${result.case} [${result.class}] ${result.state}${result.verdict ? ` · ${result.verdict}` : ''}\n      ${result.evidence}`;
}

function describeEntry(entry: BaselineEntry): string {
  return `  ${entry.case} [${entry.class}] ${entry.state}${entry.verdict ? ` · ${entry.verdict}` : ''}\n      ${entry.reason}`;
}

// ---------------------------------------------------------------------------
// Die Ratsche
// ---------------------------------------------------------------------------

test.describe('die Ratsche', () => {
  test('keine Übereinstimmung ist verloren gegangen', () => {
    const lost = LIVE.filter((result) => {
      const recorded = BASE_BY_ID.get(resultId(result));
      return recorded != null && recorded.state === 'agree' && result.state === 'disagree';
    });
    expect(
      lost.map(describe).join('\n'),
      'Diese Fälle stimmten mit dem Korpus überein und tun es nicht mehr. Entweder hat eine Änderung an ' +
        'lib/abap/ eine Aussage gekippt — dann ist das die Regression, die dieser Korpus fangen soll —, oder ' +
        'das Fallbuch hat die Sollantwort geändert. Beides wird hier entschieden, nicht in der Baseline nachgezogen.',
    ).toEqual('');
  });

  test('keine Abweichung verschwindet still', () => {
    const resolved = BASELINE.entries.filter((entry) => {
      const live = LIVE_BY_ID.get(resultId(entry));
      return entry.state === 'disagree' && live != null && live.state === 'agree';
    });
    expect(
      resolved.map(describeEntry).join('\n'),
      'Diese Abweichungen gibt es nicht mehr. Das ist eine gute Nachricht und sie gehört aufgeschrieben: ' +
        'streichen Sie die Einträge aus tests/korpus/baseline.json, damit die Ratsche den neuen Stand hält ' +
        'und nicht auf den alten zurückfallen kann.',
    ).toEqual('');
  });

  test('kein Urteil ändert sich unbemerkt', () => {
    const changed: string[] = [];
    for (const result of LIVE) {
      const recorded = BASE_BY_ID.get(resultId(result));
      if (!recorded || recorded.state !== 'disagree' || result.state !== 'disagree') continue;
      if (recorded.verdict !== result.verdict) {
        changed.push(
          `  ${result.case} [${result.class}]\n      festgehalten: ${recorded.verdict}\n      jetzt:         ${result.verdict}\n      ${result.evidence}`,
        );
      }
    }
    expect(
      changed.join('\n'),
      'Die Abweichung besteht, aber ihre Art hat sich geändert — aus einer nicht vergleichbaren Klasse ist ein ' +
        'Defekt geworden oder umgekehrt. Lesen Sie den Grund, entscheiden Sie neu und ziehen Sie die Baseline nach.',
    ).toEqual('');
  });

  test('jede Fall-und-Klasse steht in der Baseline', () => {
    const missing = LIVE.filter((result) => !BASE_BY_ID.has(resultId(result))).map(describe);
    const orphaned = BASELINE.entries
      .filter((entry) => !LIVE_BY_ID.has(resultId(entry)))
      .map((entry) => `  ${entry.case} [${entry.class}] steht in der Baseline, kommt im Lauf nicht vor`);
    expect(
      [...missing, ...orphaned].join('\n'),
      'Das Fallbuch und die Baseline sind auseinandergelaufen. Neue Fälle brauchen einen Eintrag je ' +
        'Aussageklasse mit Urteil und Grund; entfallene Fälle gehören aus der Baseline gestrichen.',
    ).toEqual('');
  });
});

// ---------------------------------------------------------------------------
// Die Baseline als Register, nicht als Erlaubnisliste
// ---------------------------------------------------------------------------

test.describe('die Baseline trägt Substanz', () => {
  test('jede Abweichung hat ein Urteil und einen Grund', () => {
    // Eine Baseline, deren Einträge nichts sagen, ist eine Erlaubnisliste, und
    // eine Erlaubnisliste ist, wie ein Befund zur Tatsache des Lebens wird.
    expect(BASELINE.entries.length).toBeGreaterThan(0);
    const thin: string[] = [];
    for (const entry of BASELINE.entries) {
      if (entry.state === 'agree') {
        if (entry.verdict !== null) thin.push(`  ${entry.case} [${entry.class}]: agree mit Urteil ${entry.verdict}`);
        continue;
      }
      if (!VERDICTS.includes(entry.verdict as (typeof VERDICTS)[number])) {
        thin.push(`  ${entry.case} [${entry.class}]: Urteil „${entry.verdict}" ist keines der drei`);
      }
      if ((entry.reason ?? '').length < 40) {
        thin.push(`  ${entry.case} [${entry.class}]: Grund zu dünn (${(entry.reason ?? '').length} Zeichen)`);
      }
    }
    expect(thin.join('\n'), 'Ohne Urteil und Grund ist ein Baselineeintrag ein Achselzucken.').toEqual('');
  });

  test('die Baseline ist nicht leer und nicht einfarbig', () => {
    const disagreements = BASELINE.entries.filter((entry) => entry.state === 'disagree');
    const agreements = BASELINE.entries.filter((entry) => entry.state === 'agree');
    expect(disagreements.length, 'eine Baseline ohne Abweichung hätte nichts gemessen').toBeGreaterThan(0);
    expect(agreements.length, 'eine Baseline ohne Übereinstimmung hätte nichts verglichen').toBeGreaterThan(0);
    const byVerdict = new Map<string, number>();
    for (const entry of disagreements) byVerdict.set(entry.verdict ?? '?', (byVerdict.get(entry.verdict ?? '?') ?? 0) + 1);
    expect(
      byVerdict.get('engine-defekt') ?? 0,
      'kein einziger Engine-Defekt über 68 Fälle — das wäre der Moment, den Vergleich zu misstrauen, nicht die Engine zu loben',
    ).toBeGreaterThan(0);
    expect(
      byVerdict.get('nicht-vergleichbar') ?? 0,
      'keine einzige nicht vergleichbare Klasse — dann vergleicht der Lauf etwas anderes als das, was der Korpus behauptet',
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Ein Lauf, der nichts liest, meldet auch nichts — das ist der Unterschied
// ---------------------------------------------------------------------------

test.describe('der Vergleich liest wirklich', () => {
  test('jeder Fall liefert Quelltext, und die Engine liest ihn', () => {
    const cases = readCases();
    expect(cases.length, 'das Bündel ist leer oder unvollständig').toBeGreaterThanOrEqual(60);
    const empty: string[] = [];
    for (const korpusCase of cases) {
      expect(korpusCase.sources.length, `${korpusCase.id} hat keine Quelldatei`).toBeGreaterThan(0);
      const reading = readWithEngine(korpusCase);
      for (const entry of reading.perFile) {
        if (entry.statements.length === 0) empty.push(`${korpusCase.id}/${entry.file}: 0 Anweisungen gelesen`);
      }
      if (reading.routeCount === 0) empty.push(`${korpusCase.id}: routeExtensibility lieferte keine Prüfpunkte`);
    }
    expect(empty.join('\n'), 'Ein Leser, der nichts liest, widerspricht nie.').toEqual('');
  });

  test('jede Aussageklasse kommt für jeden Fall genau einmal vor', () => {
    const counts = new Map<string, number>();
    for (const result of LIVE) counts.set(resultId(result), (counts.get(resultId(result)) ?? 0) + 1);
    const wrong = [...counts.entries()].filter(([, count]) => count !== 1);
    expect(wrong.map(([id, count]) => `  ${id}: ${count}×`).join('\n')).toEqual('');
    expect(LIVE.length).toBe(readManifest().cases.length * STATEMENT_CLASSES.length);
  });

  test('jede Regelbrücke nennt ein Konstrukt und eine Begründung', () => {
    // Die Brücken sind die einzige Auslegung in diesem Vergleich. Eine ohne
    // Begründung wäre eine Zuordnung, die niemand nachlesen kann.
    for (const bridge of RULE_BRIDGES) {
      expect(bridge.kinds.length, `${bridge.rule} ohne Befundmarke`).toBeGreaterThan(0);
      expect(bridge.why.length, `${bridge.rule} ohne Begründung`).toBeGreaterThan(40);
      expect(bridge.construct.source.length, `${bridge.rule} ohne Konstrukt`).toBeGreaterThan(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Bündel, Fallbuch und Hashes
// ---------------------------------------------------------------------------

test.describe('das Bündel steht zum Fallbuch', () => {
  test('ein erneuter Lauf des Konverters erzeugt keine Änderung', () => {
    const manifest = readManifest();
    const out = execFileSync(
      process.execPath,
      ['scripts/korpus/build-bundle.mjs', '--book', manifest.book.path, '--check'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(out).toContain('0 abweichend');
  });

  test('der Fallbuch-Hash im Manifest ist der Hash der Datei in docs/korpus/', () => {
    const manifest = readManifest();
    const book = readFileSync(join(process.cwd(), manifest.book.path), 'utf8').replace(/\r\n/g, '\n');
    expect(
      createHash('sha256').update(book, 'utf8').digest('hex'),
      `${manifest.book.path} ist nicht mehr die Datei, aus der tests/korpus/ gebaut wurde`,
    ).toBe(manifest.book.sha256);
    expect(BASELINE.book.sha256, 'die Baseline wurde gegen ein anderes Fallbuch geschrieben').toBe(manifest.book.sha256);
  });

  test('jede Quelldatei trägt den Hash, den das Fallbuch für sie nennt', () => {
    const manifest = readManifest();
    const wrong: string[] = [];
    for (const entry of manifest.cases) {
      for (const file of entry.files) {
        const body = readFileSync(join(process.cwd(), 'tests/korpus/cases', entry.id, file.name), 'utf8').replace(
          /\r\n/g,
          '\n',
        );
        const digest = createHash('sha256').update(body, 'utf8').digest('hex');
        if (digest !== file.sha256) wrong.push(`  ${entry.id}/${file.name}: ${digest} statt ${file.sha256}`);
      }
    }
    expect(wrong.join('\n')).toEqual('');
  });
});

// ---------------------------------------------------------------------------
// Kein Zeiger auf fremden Code
// ---------------------------------------------------------------------------

test('docs/korpus/ trägt keinen Zeiger auf ein fremdes Repository', () => {
  // Neun Fälle sind an echtem Produktivcode belegt, und vierzehn der fünfzehn
  // Quellen tragen keine Lizenz; die tragenden sind nach allen Indizien
  // unautorisiert hochgeladene Arbeitgeberbestände. Dieses Repository ist
  // öffentlich, und Git vergisst nichts: ein URL mit Commit und Zeilennummer
  // wäre ein dauerhafter, indizierter Zeiger auf eine fremde Offenlegung —
  // auch nachdem jemand ihn wieder herausnimmt. Die Fundstellen sind deshalb
  // nur als Hash belegt; der vollständige Nachweis liegt außerhalb.
  const root = join(process.cwd(), 'docs/korpus');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/\.(md|json|csv|txt|py|abap)$/i.test(name)) continue;
      const body = readFileSync(abs, 'utf8');
      const rel = relative(process.cwd(), abs).replace(/\\/g, '/');
      const host = body.match(/\b(?:github|gitlab|bitbucket)\.com\b/i);
      if (host) offenders.push(`  ${rel}: nennt ${host[0]}`);
      // Die Quellenhashes des Korpus sind 64-stellig; ein 40-stelliger
      // Hex-String ist eine Git-Commit-ID und damit ein Zeiger.
      const commit = body.match(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/);
      if (commit) offenders.push(`  ${rel}: trägt eine 40-stellige Commit-ID (${commit[0].slice(0, 12)}…)`);
    }
  };
  walk(root);
  expect(
    offenders.join('\n'),
    'Kein Zeiger auf fremden Code in docs/korpus/ — weder Host noch Commit-ID. Der Beleg einer Fundstelle ist ' +
      'der SHA-256 des Ausschnitts; die Quelle wird einem Prüfer außerhalb des Repositories gezeigt.',
  ).toEqual('');
});
