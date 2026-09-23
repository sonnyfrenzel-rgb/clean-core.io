import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Der Standmesser misst, und er erfindet nicht.
 *
 * `docs/ROADMAP.md` führt Schritte und **keinen Status** — die letzte Spalte ist
 * eine Größenschätzung. Am 23.09.2026 konnte deshalb niemand sagen, wie weit 3.0
 * ist. `scripts/roadmap/status.mjs` leitet den Stand aus den beiden Quellen ab,
 * die ohnehin gepflegt werden: den Commit-Betreffen und der Roadmap selbst.
 *
 * Abgeleitet statt gepflegt, weil eine Statusspalte von Hand driftet. Aber ein
 * Messgerät, das falsch zählt, ist schlimmer als keines: es sieht aus wie eine
 * Antwort. Was hier gehalten wird, ist deshalb die Messung selbst — nicht ihr
 * Ergebnis, das sich mit jedem Commit ändern soll.
 */
const ROOT = path.resolve(__dirname, '..');
const lib = () => import(path.resolve(ROOT, 'scripts/roadmap/status.mjs'));
const roadmap = () => fs.readFileSync(path.resolve(ROOT, 'docs/ROADMAP.md'), 'utf8');

test.describe('der Standmesser', () => {
  test('sieht jeden Schritt der Roadmap, und keinen, den es nicht gibt', async () => {
    const { readSteps } = await lib();
    const source = roadmap();
    const seen = readSteps(source).map((s: { id: string }) => s.id);

    // Der Gegenzähler liest dieselbe Datei mit einem anderen Ausdruck: eine
    // Tabellenzeile, die mit einer Schrittnummer beginnt. Zwei Wege zur selben
    // Menge — ein Parser, der eine Zeile verschluckt, fällt hier auf.
    const expected = (source.match(/^\|\s*\d+\.\d+\s*\|/gm) || []).map((m) => m.replace(/[|\s]/g, ''));
    expect(seen.sort()).toEqual(expected.sort());
    expect(seen.length, 'die Roadmap hat keine Schritte mehr — das ist kein Erfolg, das ist ein Parserfehler').toBeGreaterThan(50);
  });

  test('jeder Schritt bekommt seinen Abschnitt, keiner landet im Niemandsland', async () => {
    const { readSteps } = await lib();
    const orphans = readSteps(roadmap()).filter((s: { section: string }) => s.section === '(ohne Abschnitt)');
    expect(orphans.map((s: { id: string }) => s.id), 'diese Schritte hängen unter keiner Überschrift').toEqual([]);
  });

  test('ein Commit-Betreff mit mehreren Schritten zählt für jeden von ihnen', async () => {
    const { idsFromSubjects } = await lib();
    // Die Form gibt es wirklich: `feat(1.9, 7.8, 3.3): der Korpus misst endlich …`.
    // Ein Parser, der nur den ersten nimmt, meldet zwei gebaute Schritte als offen.
    const found = idsFromSubjects([
      'feat(1.9, 7.8, 3.3): der Korpus misst endlich das Skelett',
      'test(5.6): die Leseabnahme über alle Projektrouten',
      'docs(qa): warum eine Widerlegung nicht mehr greift',
      'chore(release): v2.14.0',
    ]);
    expect([...found.keys()].sort()).toEqual(['1.9', '3.3', '5.6', '7.8']);
    // Ein Betreff ohne Schrittnummer bringt keine mit — `v2.14.0` ist eine Version.
    expect(found.has('2.14')).toBe(false);
  });

  test('„gebaut wird" ist eine Absicht, keine Meldung', async () => {
    const { claimsBuilt } = await lib();
    expect(claimsBuilt('**Gebaut 16.09.2026 (`dev`):** der Modellaufruf ist ein Abschnitt')).toBe(true);
    expect(claimsBuilt('**Gebaut in v2.10.3**')).toBe(true);
    // Und die drei Formen, die nicht zählen dürfen: eine Absicht, ein Verweis, und
    // das Wort aus den Befundtabellen in §12–§14, das zu einem Befund gehört und
    // nicht zu einem Schritt.
    expect(claimsBuilt('was noch gebaut wird, wird benannt')).toBe(false);
    expect(claimsBuilt('gebaut nach [`DESIGN.md`]')).toBe(false);
    expect(claimsBuilt('behoben (dev) — derselbe Defekt wie UX-012')).toBe(false);
  });

  test('ein Schritt, den ein Commit nennt, gilt als belegt — und die Herkunft steht dabei', async () => {
    const { buildStatus } = await lib();
    const markdown = ['### Phase 9 — v9.9 „Probe"', '| 9.1 | etwas | M |', '| 9.2 | **Gebaut 01.01.2026** etwas | M |', '| 9.3 | etwas | M |'].join('\n');
    const steps = buildStatus(markdown, ['feat(9.1): gebaut']);
    expect(steps.map((s: { id: string; state: string }) => [s.id, s.state])).toEqual([
      ['9.1', 'belegt'],
      ['9.2', 'behauptet'],
      ['9.3', 'offen'],
    ]);
    // Die Herkunft ist der Punkt: „belegt" nennt den Commit, „behauptet" kann es nicht.
    expect(steps[0].commit).toBe('feat(9.1): gebaut');
    expect(steps[1].commit).toBeNull();
  });
});
