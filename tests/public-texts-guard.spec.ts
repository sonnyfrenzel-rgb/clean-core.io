import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

/**
 * Alles Öffentliche aus einem Guss — Roadmap-Schritt 3.0.8.
 *
 * Das Repository ist öffentlich; jede eingecheckte Textdatei ist damit
 * Produktkommunikation. Am 24.09.2026 waren es 99 Dateien außerhalb von
 * `docs/archiv/` und `docs/korpus/`, und sie beschrieben fünf verschiedene
 * Produkte: den Modernisierungsassistenten von v1.9 (README), den
 * 7-Stufen-Workflow (CLAUDE.md, ARCHITECTURE.md, die Briefs der Agenten), den
 * Pilot mit Freischaltung (S4-Doku), das Zielbild 2.8 (DESIGN.md) und eine
 * Dunkel-Oberfläche, die es seit 1.6 nicht mehr gibt. Keiner dieser Texte war
 * falsch, als er geschrieben wurde. Nichts hat sie verglichen.
 *
 * Drei Prüfungen, wie die Roadmap sie verlangt:
 *
 *   (a) keine öffentliche Datei nennt, was 3.0 entfernt hat (Liste
 *       `retired` in `docs/registers/vocabulary.json`, aus 3.0.5 und §8);
 *   (b) jeder Kernbegriff hat genau eine Schreibweise (Liste `terms`);
 *   (c) jede Datei außerhalb von Archiv und Korpus steht in der Inventur
 *       `docs/registers/public-texts.json`, mit ihrer Entscheidung.
 *
 * **Die Texte werden mit 3.0 umgestellt, nicht vorher** — bis dahin beschreiben
 * sie, was ausgeliefert ist. Deshalb gilt heute nur (c) und der Selbsttest der
 * Ausdrücke. (a), (b) und der Vollzug der Entscheidungen hängen an einem
 * Schalter, `PUBLIC_TEXTS_ARMED`, der mit 3.0.1 auf `true` geht; bis dahin
 * laufen sie als `test.fixme`. Der Ausgangswert steht in der Inventur unter
 * `baseline` (am 24.09.2026: 30 Verstöße gegen (a), 39 gegen (b)); der Test
 * „Ausgangswert" misst ihn bei jedem Lauf neu und urteilt nicht.
 *
 * Warum ein Schalter statt einer Sperrklinke, die heute schon keine neuen
 * Verstöße zulässt: `docs/BACKLOG.md` und die Runbooks wachsen täglich und
 * dürfen bis 3.0 das Ausgelieferte beschreiben — auch den 7-Stufen-Workflow.
 * Eine Sperrklinke würde diese ehrlichen Einträge rot machen.
 */

/** Mit 3.0.1 auf `true` — dann gelten (a), (b) und der Vollzug der Entscheidungen. */
const PUBLIC_TEXTS_ARMED = false;

/**
 * Die Chronik — von (a) und (b) ausgenommen, ausdrücklich und hier, nicht nur in
 * der Inventur (Entscheidung Sonny 24.09.2026). Diese Dateien sind Geschichte
 * oder legen die Streichungen fest: ein datierter Eintrag, der den
 * 7-Stufen-Workflow oder Dark Mode nennt, beschreibt richtig, was damals galt,
 * und die Roadmap muss das Gestrichene nennen, um es zu streichen. Umschreiben
 * hieße, die Geschichte zu fälschen. Die Liste ist geschlossen: eine weitere
 * Ausnahme für Prosa verlangt einen Eintrag hier, mit Begründung.
 */
const CHRONICLE: Record<string, string> = {
  'CHANGELOG.md': 'Versionshistorie — jeder Eintrag beschreibt das Produkt seines Datums.',
  'docs/BACKLOG.md': 'Arbeitsprotokoll — datierte Abschnitte; die abgeschlossenen vor 3.0 werden mit 3.0 archiviert.',
  'DESIGN.md': 'Legt 3.0 und die Streichungen fest — nennt das Entfernte, um es zu verbieten.',
  'docs/ROADMAP.md': 'Die verbindliche Roadmap — Quelle der Streichliste und datierter Entscheidungen.',
  'docs/design/decisions.md': 'ADR-Log — Einträge werden nie geändert, nur ersetzt.',
};

/** Ausnahmen, die keine Prosa über das Produkt sind: Rechtstexte und ABAP-Quelltext. */
const NOT_PROSE_KINDS = ['legal', 'abap-sample'];

const ROOT = path.resolve(__dirname, '..');
const REGISTER = 'docs/registers/public-texts.json';
const VOCABULARY = 'docs/registers/vocabulary.json';

interface Guard { removed: 'check' | 'exempt'; terms: 'check' | 'exempt'; why?: string }
interface Entry {
  path: string;
  kind: string;
  purpose: string;
  audience: string;
  saysToday: string;
  wrongWith30: { lines: string; what: string }[];
  decision: 'update' | 'archive' | 'delete' | 'keep';
  archiveTarget?: string;
  reason: string;
  effort: 'none' | 'XS' | 'S' | 'M' | 'L';
  guard: Guard;
  /** Datum, an dem die Entscheidung vollzogen wurde (update, archive oder delete). */
  executed?: string;
}
interface Retired { id: string; patterns: string[]; allowIfLine?: string; samples: { hit: string; allowed: string } }
interface Term { id: string; en: string; de: string | null; variants: { pattern: string; flags: string; note: string }[] }

const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const register = () => JSON.parse(read(REGISTER)) as { files: Entry[]; served: { path: string; decision: string }[]; baseline: unknown };
const vocabulary = () => JSON.parse(read(VOCABULARY)) as { negationLine: string; terms: Term[]; retired: Retired[] };

/** Der Umfang von (c): dieselbe Regel wie `schema.scope` in der Inventur. */
const inScope = (f: string) =>
  (/\.(md|mdx|txt)$/i.test(f) || /^(LICENSE|NOTICE)$/.test(f)) && !/^docs\/(archiv|korpus)\//.test(f);

function trackedTexts(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(inScope);
}

/**
 * Eine Zeile verstößt gegen (a), wenn ein Muster trifft und weder die Zeile noch
 * ihre Vorgängerin das Entfernte ausdrücklich als entfernt nennt — Markdown
 * bricht „Deliberately not built: tenants, SSO," über zwei Zeilen um.
 */
function retiredHits(text: string, v: ReturnType<typeof vocabulary>) {
  const neg = new RegExp(v.negationLine, 'i');
  const lines = text.split(/\r?\n/);
  const hits: { id: string; line: number; text: string }[] = [];
  lines.forEach((line, i) => {
    const ctx = (i > 0 ? lines[i - 1] + ' ' : '') + line;
    for (const r of v.retired) {
      const allow = r.allowIfLine ? new RegExp(r.allowIfLine, 'i') : null;
      if (r.patterns.some((p) => new RegExp(p, 'i').test(line)) && !neg.test(ctx) && !(allow && allow.test(line))) {
        hits.push({ id: r.id, line: i + 1, text: line.trim().slice(0, 140) });
      }
    }
  });
  return hits;
}

/** (b): Bezeichner in Backticks sind Code, kein Text (`abcd-classification.ts`). */
function termHits(text: string, v: ReturnType<typeof vocabulary>) {
  const hits: { id: string; line: number; text: string }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const prose = line.replace(/`[^`]*`/g, '');
    for (const t of v.terms) {
      t.variants.forEach((variant) => {
        if (new RegExp(variant.pattern, variant.flags).test(prose)) {
          hits.push({ id: `${t.id}: "${variant.note || variant.pattern}" statt "${t.en}"`, line: i + 1, text: line.trim().slice(0, 140) });
        }
      });
    }
  });
  return hits;
}

/** Was (a) und (b) lesen: Dateien der Inventur, die es gibt und die nicht ausgenommen sind. */
function checkedFiles(kind: 'removed' | 'terms') {
  return register().files.filter((e) => !(e.path in CHRONICLE) && e.guard[kind] === 'check' && fs.existsSync(path.resolve(ROOT, e.path)));
}

const armed = PUBLIC_TEXTS_ARMED ? test : test.fixme;

test.describe('öffentliche Texte aus einem Guss (3.0.8)', () => {
  test('(c) jede Textdatei außerhalb von Archiv und Korpus steht in der Inventur', () => {
    const entries = register().files;
    const listed = new Set(entries.map((e) => e.path));
    const tracked = trackedTexts();
    // Die Probe gegen einen leeren Umfang: ohne git ls-files wäre (c) grün und leer.
    expect(tracked.length, 'git ls-files liefert keine Textdateien — der Umfang ist kaputt, nicht leer').toBeGreaterThan(50);

    const missing = tracked.filter((f) => !listed.has(f));
    expect(missing, `ohne Eintrag in ${REGISTER} — Zweck, Zielgruppe und Entscheidung nachtragen`).toEqual([]);

    // Ein Eintrag, der bleiben soll, dessen Datei aber fehlt, ist eine Inventur, die lügt.
    const vanished = entries.filter((e) => (e.decision === 'update' || e.decision === 'keep') && !fs.existsSync(path.resolve(ROOT, e.path)));
    expect(vanished.map((e) => e.path), 'in der Inventur als bleibend geführt, aber nicht mehr da').toEqual([]);

    const dupes = entries.map((e) => e.path).filter((p, i, a) => a.indexOf(p) !== i);
    expect(dupes, 'doppelte Einträge').toEqual([]);
  });

  test('(c) jede Entscheidung ist vollständig und begründet', () => {
    const bad: string[] = [];
    for (const e of register().files) {
      if (!['update', 'archive', 'delete', 'keep'].includes(e.decision)) bad.push(`${e.path}: Entscheidung "${e.decision}"`);
      if (!['none', 'XS', 'S', 'M', 'L'].includes(e.effort)) bad.push(`${e.path}: Aufwand "${e.effort}"`);
      for (const k of ['purpose', 'audience', 'saysToday', 'reason'] as const) if (!e[k]?.trim()) bad.push(`${e.path}: ${k} leer`);
      if (!Array.isArray(e.wrongWith30)) bad.push(`${e.path}: wrongWith30 fehlt`);
      if (e.decision === 'archive' && !e.archiveTarget?.startsWith('docs/archiv/')) bad.push(`${e.path}: archiveTarget muss unter docs/archiv/ liegen`);
      if (e.decision !== 'archive' && e.archiveTarget) bad.push(`${e.path}: archiveTarget ohne Entscheidung archive`);
      for (const k of ['removed', 'terms'] as const) {
        if (!['check', 'exempt'].includes(e.guard?.[k])) bad.push(`${e.path}: guard.${k}`);
      }
      if ((e.guard?.removed === 'exempt' || e.guard?.terms === 'exempt') && !e.guard.why?.trim()) bad.push(`${e.path}: Ausnahme ohne Begründung`);
      // Wer umgestellt werden muss, sagt, was falsch wird; wer bleibt, wie er ist, braucht es nicht.
      if (e.decision === 'update' && e.wrongWith30.length === 0) bad.push(`${e.path}: update ohne einen Punkt in wrongWith30`);
    }
    expect(bad).toEqual([]);
  });

  test('die Chronik ist von (a) und (b) ausgenommen, ausdrücklich und begründet — und nichts sonst ohne Grund', () => {
    const entries = register().files;
    const problems: string[] = [];
    for (const [file, why] of Object.entries(CHRONICLE)) {
      const e = entries.find((x) => x.path === file);
      if (!e) { problems.push(`${file}: steht in CHRONICLE, aber nicht in der Inventur`); continue; }
      if (!fs.existsSync(path.resolve(ROOT, file))) problems.push(`${file}: steht in CHRONICLE, gibt es aber nicht`);
      if (e.guard.removed !== 'exempt' || e.guard.terms !== 'exempt') problems.push(`${file}: Chronik, in der Inventur aber nicht von (a) und (b) ausgenommen`);
      if (!/Chronik/.test(e.guard.why ?? '')) problems.push(`${file}: guard.why nennt die Chronik nicht`);
      if (!why.trim()) problems.push(`${file}: ohne Begründung in CHRONICLE`);
    }
    // Die Liste ist geschlossen: jede andere Ausnahme ist kein Prosatext über das Produkt.
    for (const e of entries) {
      const exempt = e.guard.removed === 'exempt' || e.guard.terms === 'exempt';
      if (exempt && !(e.path in CHRONICLE) && !NOT_PROSE_KINDS.includes(e.kind)) {
        problems.push(`${e.path}: von (a)/(b) ausgenommen, aber weder Chronik noch ${NOT_PROSE_KINDS.join('/')}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('die ausgelieferten Texte der Inventur zeigen auf Quellen, die es gibt', () => {
    const missing = register().served.map((s) => s.path.split('#')[0]).filter((p) => !fs.existsSync(path.resolve(ROOT, p)));
    expect(missing).toEqual([]);
  });

  test('die Ausdrücke des Vokabulars treffen ihre Beispiele und nur sie', () => {
    const v = vocabulary();
    const problems: string[] = [];
    // Ein Muster, das nicht kompiliert, würde sonst erst mit 3.0.1 auffallen.
    for (const t of v.terms) for (const x of t.variants) {
      try { new RegExp(x.pattern, x.flags); } catch (err) { problems.push(`${t.id}: ${String(err)}`); }
    }
    for (const r of v.retired) {
      if (retiredHits(r.samples.hit, v).every((h) => h.id !== r.id)) problems.push(`${r.id}: trifft sein Beispiel nicht — "${r.samples.hit}"`);
      if (retiredHits(r.samples.allowed, v).length) problems.push(`${r.id}: meldet die erlaubte Zeile — "${r.samples.allowed}"`);
    }
    const ids = [...v.terms.map((t) => t.id), ...v.retired.map((r) => r.id)];
    ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => problems.push(`doppelte ID ${id}`));
    // Die kanonische Schreibweise darf von keiner eigenen Variante getroffen werden —
    // sonst verlangt (b) etwas, das es selbst verbietet.
    for (const t of v.terms) for (const x of t.variants) {
      if (new RegExp(x.pattern, x.flags).test(t.en)) problems.push(`${t.id}: Variante "${x.pattern}" trifft die kanonische Form "${t.en}"`);
    }
    expect(problems).toEqual([]);
  });

  test('die umgestellten Texte halten (a) und (b) schon heute', () => {
    // Was mit 3.0.8 umgestellt ist, soll nicht erst mit dem Schalter gegen den
    // Guard laufen. Die README war bis dahin der Entwurf docs/drafts/README-3.0.md;
    // er ist mit der Umstellung zur README.md geworden und geloescht. Jede Datei,
    // deren Umstellung die Inventur als vollzogen fuehrt (`executed` bei
    // update), wird hier sofort gemessen.
    const v = vocabulary();
    const done = register().files.filter((e) => e.decision === 'update' && e.executed && !(e.path in CHRONICLE));
    expect(done.map((e) => e.path)).toContain('README.md');
    for (const e of done) {
      expect(retiredHits(read(e.path), v), `${e.path} (a)`).toEqual([]);
      expect(termHits(read(e.path), v), `${e.path} (b)`).toEqual([]);
    }
  });

  test('die README selbst', () => {
    const v = vocabulary();
    const text = read('README.md');
    expect(retiredHits(text, v)).toEqual([]);
    expect(termHits(text, v)).toEqual([]);
  });

  test('Ausgangswert: misst (a) und (b), ohne zu urteilen', () => {
    const v = vocabulary();
    const a = checkedFiles('removed').flatMap((e) => retiredHits(read(e.path), v));
    const b = checkedFiles('terms').flatMap((e) => termHits(read(e.path), v));
    test.info().annotations.push(
      { type: '3.0.8 (a) Verstöße heute', description: String(a.length) },
      { type: '3.0.8 (b) Verstöße heute', description: String(b.length) },
    );
    // Kein Urteil über die Zahl — nur, dass gemessen wurde.
    expect(checkedFiles('removed').length).toBeGreaterThan(0);
  });

  armed('(a) keine öffentliche Datei nennt, was 3.0 entfernt hat', () => {
    const v = vocabulary();
    const found = checkedFiles('removed').flatMap((e) => retiredHits(read(e.path), v).map((h) => `${e.path}:${h.line} [${h.id}] ${h.text}`));
    expect(found, 'nennt Entferntes — umschreiben, archivieren oder als entfernt benennen').toEqual([]);
  });

  armed('(b) jeder Kernbegriff hat genau eine Schreibweise', () => {
    const v = vocabulary();
    const found = checkedFiles('terms').flatMap((e) => termHits(read(e.path), v).map((h) => `${e.path}:${h.line} ${h.id}`));
    expect(found, 'Abweichung vom Vokabular').toEqual([]);
  });

  armed('(c) die Entscheidungen der Inventur sind vollzogen', () => {
    const archiveIndex = read('docs/archiv/README.md');
    const open: string[] = [];
    for (const e of register().files) {
      const here = fs.existsSync(path.resolve(ROOT, e.path));
      if ((e.decision === 'archive' || e.decision === 'delete') && here) open.push(`${e.path}: ${e.decision} nicht vollzogen`);
      if (e.decision === 'archive') {
        const moved = path.posix.join(e.archiveTarget!, path.posix.basename(e.path));
        if (!fs.existsSync(path.resolve(ROOT, moved))) open.push(`${e.path}: fehlt unter ${moved}`);
        if (!archiveIndex.includes(path.posix.basename(e.path)) && !archiveIndex.includes(e.archiveTarget!.replace(/^docs\/archiv\//, ''))) {
          open.push(`${e.path}: kein Eintrag im Archiv-Index`);
        }
      }
    }
    expect(open).toEqual([]);
  });
});
