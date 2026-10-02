import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

/**
 * Everything public of a piece — roadmap step 3.0.8.
 *
 * The repository is public; every checked-in text file is therefore product
 * communication. On 24.09.2026 there were 99 files outside `docs/archiv/` and
 * `docs/korpus/`, and they described five different products: the
 * modernisation assistant of v1.9 (README), the seven stages as the product
 * (CLAUDE.md, ARCHITECTURE.md, the agents' briefs), the pilot with activation
 * (S4 documentation), the target picture 2.8 (DESIGN.md) and a dark surface
 * that has not existed since 1.6. None of these texts was wrong when it was
 * written. Nothing compared them.
 *
 * Three checks, as the roadmap asks for them:
 *
 *   (a) no public file names what 3.0 removed (list `retired` in
 *       `docs/registers/vocabulary.json`, from 3.0.5 and §8);
 *   (b) every core term has exactly one spelling (list `terms`);
 *   (c) every file outside archive and corpus stands in the inventory
 *       `docs/registers/public-texts.json`, with its decision.
 *
 * **The texts were switched with 3.0, not before** — until then they described
 * what was shipped. (a), (b) and the execution of the decisions hang on a
 * switch, `PUBLIC_TEXTS_ARMED`, armed with the 3.0.8 text step on 02.10.2026
 * (after 3.0.1); before that they ran as `test.fixme`. The starting value is in
 * the inventory under `baseline` (on 24.09.2026: 30 violations of (a), 39 of
 * (b)); the "baseline" test measures it again on every run and does not judge.
 *
 * Why a switch rather than a ratchet that allowed no new violations from the
 * start: `docs/BACKLOG.md` and the runbooks grew daily and were allowed to
 * describe what was shipped until 3.0 — the seven stages as the product
 * included. A ratchet would have turned those honest entries red.
 */

/** Armed with the 3.0.8 text step (02.10.2026): (a), (b) and the execution of the decisions apply. */
const PUBLIC_TEXTS_ARMED = true;

/**
 * The chronicle — exempt from (a) and (b), explicitly and here, not only in the
 * inventory (decision Sonny 24.09.2026). These files are history or fix the
 * removals: a dated entry that names the seven stages as the product, or dark
 * mode, describes correctly what applied then, and the roadmap has to name what
 * it removes in order to remove it. Rewriting them would falsify history. The
 * list is closed: a further exception for prose needs an entry here, with a
 * reason.
 */
const CHRONICLE: Record<string, string> = {
  'CHANGELOG.md': 'Version history — every entry describes the product of its date.',
  'docs/BACKLOG.md': 'Work log — dated sections; the ones completed before 3.0 are archived with 3.0.',
  'DESIGN.md': 'Fixes 3.0 and the removals — names what was removed in order to forbid it.',
  'docs/ROADMAP.md': 'The binding roadmap — source of the removal list and of dated decisions.',
  'docs/design/decisions.md': 'ADR log — entries are never changed, only superseded.',
};

/** Exceptions that are not prose about the product: legal texts and ABAP source. */
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
  /** Date on which the decision was executed (update, archive or delete). */
  executed?: string;
}
interface Retired { id: string; patterns: string[]; allowIfLine?: string; samples: { hit: string; allowed: string } }
interface Term { id: string; en: string; de: string | null; variants: { pattern: string; flags: string; note: string }[] }

const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const register = () => JSON.parse(read(REGISTER)) as { files: Entry[]; served: { path: string; decision: string }[]; baseline: unknown };
const vocabulary = () => JSON.parse(read(VOCABULARY)) as { negationLine: string; terms: Term[]; retired: Retired[] };

/** The scope of (c): the same rule as `schema.scope` in the inventory. */
const inScope = (f: string) =>
  (/\.(md|mdx|txt)$/i.test(f) || /^(LICENSE|NOTICE)$/.test(f)) && !/^docs\/(archiv|korpus)\//.test(f);

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function trackedTexts(): string[] {
  return trackedFiles().filter(inScope);
}

/**
 * A line violates (a) when a pattern matches and neither the line nor the one
 * before it names the removed item explicitly as removed — Markdown wraps
 * "Deliberately not built: tenants, SSO," over two lines.
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

/** (b): identifiers in backticks are code, not text (`abcd-classification.ts`). */
function termHits(text: string, v: ReturnType<typeof vocabulary>) {
  const hits: { id: string; line: number; text: string }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const prose = line.replace(/`[^`]*`/g, '');
    for (const t of v.terms) {
      t.variants.forEach((variant) => {
        if (new RegExp(variant.pattern, variant.flags).test(prose)) {
          hits.push({ id: `${t.id}: "${variant.note || variant.pattern}" instead of "${t.en}"`, line: i + 1, text: line.trim().slice(0, 140) });
        }
      });
    }
  });
  return hits;
}

/** What (a) and (b) read: inventory files that exist and are not exempt. */
function checkedFiles(kind: 'removed' | 'terms') {
  return register().files.filter((e) => !(e.path in CHRONICLE) && e.guard[kind] === 'check' && fs.existsSync(path.resolve(ROOT, e.path)));
}

const armed = PUBLIC_TEXTS_ARMED ? test : test.fixme;

test.describe('public texts of a piece (3.0.8)', () => {
  test('(c) every text file outside archive and corpus stands in the inventory', () => {
    const entries = register().files;
    const listed = new Set(entries.map((e) => e.path));
    const tracked = trackedTexts();
    // The probe against an empty scope: without git ls-files, (c) would be green and empty.
    // On 02.10.2026, after the archive decisions were executed, there are 43 files.
    expect(tracked.length, 'git ls-files returns no text files — the scope is broken, not empty').toBeGreaterThan(30);

    const missing = tracked.filter((f) => !listed.has(f));
    expect(missing, `no entry in ${REGISTER} — add purpose, audience and decision`).toEqual([]);

    // An entry that is meant to stay but whose file is missing is an inventory that lies.
    const vanished = entries.filter((e) => (e.decision === 'update' || e.decision === 'keep') && !fs.existsSync(path.resolve(ROOT, e.path)));
    expect(vanished.map((e) => e.path), 'listed in the inventory as staying, but no longer there').toEqual([]);

    const dupes = entries.map((e) => e.path).filter((p, i, a) => a.indexOf(p) !== i);
    expect(dupes, 'duplicate entries').toEqual([]);
  });

  test('(c) every decision is complete and has a reason', () => {
    const bad: string[] = [];
    for (const e of register().files) {
      if (!['update', 'archive', 'delete', 'keep'].includes(e.decision)) bad.push(`${e.path}: decision "${e.decision}"`);
      if (!['none', 'XS', 'S', 'M', 'L'].includes(e.effort)) bad.push(`${e.path}: effort "${e.effort}"`);
      for (const k of ['purpose', 'audience', 'saysToday', 'reason'] as const) if (!e[k]?.trim()) bad.push(`${e.path}: ${k} empty`);
      if (!Array.isArray(e.wrongWith30)) bad.push(`${e.path}: wrongWith30 missing`);
      if (e.decision === 'archive' && !e.archiveTarget?.startsWith('docs/archiv/')) bad.push(`${e.path}: archiveTarget must lie under docs/archiv/`);
      if (e.decision !== 'archive' && e.archiveTarget) bad.push(`${e.path}: archiveTarget without decision archive`);
      for (const k of ['removed', 'terms'] as const) {
        if (!['check', 'exempt'].includes(e.guard?.[k])) bad.push(`${e.path}: guard.${k}`);
      }
      if ((e.guard?.removed === 'exempt' || e.guard?.terms === 'exempt') && !e.guard.why?.trim()) bad.push(`${e.path}: exemption without a reason`);
      // A file that has to be switched says what becomes wrong; one that stays as it is does not need to.
      if (e.decision === 'update' && e.wrongWith30.length === 0) bad.push(`${e.path}: update without a point in wrongWith30`);
    }
    expect(bad).toEqual([]);
  });

  test('the chronicle is exempt from (a) and (b), explicitly and with a reason — and nothing else without one', () => {
    const entries = register().files;
    const problems: string[] = [];
    for (const [file, why] of Object.entries(CHRONICLE)) {
      const e = entries.find((x) => x.path === file);
      if (!e) { problems.push(`${file}: in CHRONICLE, but not in the inventory`); continue; }
      if (!fs.existsSync(path.resolve(ROOT, file))) problems.push(`${file}: in CHRONICLE, but does not exist`);
      if (e.guard.removed !== 'exempt' || e.guard.terms !== 'exempt') problems.push(`${file}: chronicle, but not exempt from (a) and (b) in the inventory`);
      if (!/chronicle/i.test(e.guard.why ?? '')) problems.push(`${file}: guard.why does not name the chronicle`);
      if (!why.trim()) problems.push(`${file}: no reason in CHRONICLE`);
    }
    // The list is closed: every other exemption is something that is not prose about the product.
    for (const e of entries) {
      const exempt = e.guard.removed === 'exempt' || e.guard.terms === 'exempt';
      if (exempt && !(e.path in CHRONICLE) && !NOT_PROSE_KINDS.includes(e.kind)) {
        problems.push(`${e.path}: exempt from (a)/(b), but neither chronicle nor ${NOT_PROSE_KINDS.join('/')}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('the served texts of the inventory point to sources that exist', () => {
    const missing = register().served.map((s) => s.path.split('#')[0]).filter((p) => !fs.existsSync(path.resolve(ROOT, p)));
    expect(missing).toEqual([]);
  });

  test('the vocabulary expressions match their samples and only them', () => {
    const v = vocabulary();
    const problems: string[] = [];
    // A pattern that does not compile would otherwise surface only in an armed check.
    for (const t of v.terms) for (const x of t.variants) {
      try { new RegExp(x.pattern, x.flags); } catch (err) { problems.push(`${t.id}: ${String(err)}`); }
    }
    for (const r of v.retired) {
      if (retiredHits(r.samples.hit, v).every((h) => h.id !== r.id)) problems.push(`${r.id}: does not match its sample — "${r.samples.hit}"`);
      if (retiredHits(r.samples.allowed, v).length) problems.push(`${r.id}: reports the allowed line — "${r.samples.allowed}"`);
    }
    const ids = [...v.terms.map((t) => t.id), ...v.retired.map((r) => r.id)];
    ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => problems.push(`duplicate ID ${id}`));
    // The canonical spelling must not be matched by any of its own variants —
    // otherwise (b) demands something it forbids itself.
    for (const t of v.terms) for (const x of t.variants) {
      if (new RegExp(x.pattern, x.flags).test(t.en)) problems.push(`${t.id}: variant "${x.pattern}" matches the canonical form "${t.en}"`);
    }
    expect(problems).toEqual([]);
  });

  test('the switched texts hold (a) and (b)', () => {
    // What 3.0.8 switched was measured against the guard as soon as it was
    // switched, before the switch above was armed. The README was the draft
    // docs/drafts/README-3.0.md until then; with the switch it became README.md
    // and the draft was deleted. Every file whose switch the inventory records
    // as executed (`executed` on an update) is measured here.
    const v = vocabulary();
    const done = register().files.filter((e) => e.decision === 'update' && e.executed && !(e.path in CHRONICLE));
    expect(done.map((e) => e.path)).toContain('README.md');
    for (const e of done) {
      expect(retiredHits(read(e.path), v), `${e.path} (a)`).toEqual([]);
      expect(termHits(read(e.path), v), `${e.path} (b)`).toEqual([]);
    }
  });

  test('the README itself', () => {
    const v = vocabulary();
    const text = read('README.md');
    expect(retiredHits(text, v)).toEqual([]);
    expect(termHits(text, v)).toEqual([]);
  });

  test('baseline: measures (a) and (b) without judging', () => {
    const v = vocabulary();
    const a = checkedFiles('removed').flatMap((e) => retiredHits(read(e.path), v));
    const b = checkedFiles('terms').flatMap((e) => termHits(read(e.path), v));
    test.info().annotations.push(
      { type: '3.0.8 (a) violations today', description: String(a.length) },
      { type: '3.0.8 (b) violations today', description: String(b.length) },
    );
    // No judgement on the number — only that it was measured.
    expect(checkedFiles('removed').length).toBeGreaterThan(0);
  });

  armed('(a) no public file names what 3.0 removed', () => {
    const v = vocabulary();
    const found = checkedFiles('removed').flatMap((e) => retiredHits(read(e.path), v).map((h) => `${e.path}:${h.line} [${h.id}] ${h.text}`));
    expect(found, 'names a removed item — rewrite it, archive the file, or name the item as removed').toEqual([]);
  });

  armed('(b) every core term has exactly one spelling', () => {
    const v = vocabulary();
    const found = checkedFiles('terms').flatMap((e) => termHits(read(e.path), v).map((h) => `${e.path}:${h.line} ${h.id}`));
    expect(found, 'deviation from the vocabulary').toEqual([]);
  });

  armed('(c) the decisions of the inventory are executed', () => {
    const archiveIndex = read('docs/archiv/README.md');
    const open: string[] = [];
    for (const e of register().files) {
      const here = fs.existsSync(path.resolve(ROOT, e.path));
      if ((e.decision === 'archive' || e.decision === 'delete') && here) open.push(`${e.path}: ${e.decision} not executed`);
      if (e.decision === 'archive') {
        const moved = path.posix.join(e.archiveTarget!, path.posix.basename(e.path));
        if (!fs.existsSync(path.resolve(ROOT, moved))) open.push(`${e.path}: missing under ${moved}`);
        if (!archiveIndex.includes(path.posix.basename(e.path)) && !archiveIndex.includes(e.archiveTarget!.replace(/^docs\/archiv\//, ''))) {
          open.push(`${e.path}: no entry in the archive index`);
        }
      }
    }
    expect(open).toEqual([]);
  });
});

/**
 * Roadmap 3.0.14 — everything public is English, and only English (decision
 * Sonny 30.09.2026). The named exceptions, and nothing else:
 *
 * - `docs/archiv/` (history) and the German privacy notice `app/datenschutz/de`
 *   (a legal text whose German version prevails, E-7); `docs/korpus/` is the
 *   domain source and outside the inventory's scope as well;
 * - decided by Sonny on 02.10.2026, the frozen measurement material: the corpus
 *   and benchmark cases (`tests/korpus/`, `tests/prozess-benchmark/` — data, not
 *   code, so the code half below never reads them) and the two judge briefs
 *   (`GERMAN_FROZEN` below), because translating them would mean measuring
 *   again; and the security and UX reports mailed to the owner, which are
 *   sealed, not public — their German is in string literals, which the code
 *   half does not read.
 *
 * What is measured is German *prose*: a sentence with three or more distinct
 * German function words, after inline code, fenced code, link targets and
 * quoted strings are removed. A German string the text is about — a mail
 * subject the pipeline sends, a label of the German privacy page, a corpus
 * sentence — stays quotable; a German sentence that explains something does not.
 */
const GERMAN_FROZEN: Record<string, string> = {
  // Benchmark fixtures, not documentation: the judge reads these prompts, and the
  // benchmark is frozen (docs/prozess-benchmark/BERICHT.md). Translating them
  // would change the measurement (decision Sonny 02.10.2026: they stay German).
  'tests/prozess-benchmark/judge/richter-brief.md': 'judge prompt of the frozen process benchmark — stays German (Sonny, 02.10.2026)',
  'tests/prozess-benchmark/judge/richter-brief-schluss.md': 'judge prompt of the frozen process benchmark — stays German (Sonny, 02.10.2026)',
};

const GERMAN_WORDS = /(?<![\p{L}])(und|nicht|wird|werden|wurde|oder|dass|keine?n?|sind|auch|noch|wenn|eine[nmrs]?|für|über|bleibt|steht|kein|nach|beim|zum|zur|vom|sich|schon|nur|weil|jede[rsn]?|diese[rsnm]?|dem|des|ohne|gegen|seit|ein|im|auf|aus|bei|mit|von|der|das|hat|haben|kann|muss|soll|statt|heute|damit|dann|aber|doch|sondern)(?![\p{L}])/giu;

/** German sentences in a Markdown/text file, outside code and quotes. */
function germanSentences(text: string): string[] {
  const paragraphs: string[] = [];
  let fence = false;
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    if (!line.trim()) { paragraphs.push(current.join(' ')); current = []; continue; }
    current.push(line);
  }
  paragraphs.push(current.join(' '));
  const found: string[] = [];
  for (const p of paragraphs) {
    const prose = p
      .replace(/`[^`]*`/g, ' ')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/"[^"]*"/g, ' ')
      .replace(/„[^“"]*[“"]/g, ' ')
      .replace(/‚[^‘']*[‘']/g, ' ');
    for (const sentence of prose.split(/(?<=[.!?;:|])\s+/)) {
      const words = new Set((sentence.match(GERMAN_WORDS) || []).map((w) => w.toLowerCase()));
      if (words.size >= 3) found.push(sentence.trim().slice(0, 160));
    }
  }
  return found;
}

/**
 * The code half reads with the release scan's own lexer (`scripts/release/text-scan.mjs`),
 * so the guard and the measure in `docs/release/3.0-text-scan.md` cannot drift apart.
 */
type CodeHit = { line: number; text: string };
interface TextScan {
  GERMAN_WORDS: RegExp;
  isCodeInScope: (rel: string) => boolean;
  scanCode: (rel: string, src: string) => { comments: CodeHit[]; titles: CodeHit[]; strings: CodeHit[]; jsx: CodeHit[] };
}
const textScan = () => import(pathToFileURL(path.resolve(ROOT, 'scripts/release/text-scan.mjs')).href) as Promise<TextScan>;

test.describe('everything public is English (3.0.14)', () => {
  test('the measure finds German prose and lets quoted German and English pass', () => {
    expect(germanSentences('Die Engine baut kein Prozessskelett, wenn der Code fehlt.')).toHaveLength(1);
    expect(germanSentences('The subject reads "nicht vollständig geprüft: X von Y Kandidaten verifiziert" when calls fail.')).toEqual([]);
    expect(germanSentences('Run `node scripts/qa/refute.mjs <fp> "<reason>"` — the die is cast, as in the docs.')).toEqual([]);
    expect(germanSentences('```\n# wird nicht gelesen und bleibt hier\n```')).toEqual([]);
  });

  test('no public text file outside the named exceptions has German prose', () => {
    const files = trackedTexts();
    expect(files.length).toBeGreaterThan(30);
    for (const frozen of Object.keys(GERMAN_FROZEN)) expect(files, `${frozen} is listed as frozen but not tracked`).toContain(frozen);
    const found = files
      .filter((f) => !(f in GERMAN_FROZEN))
      .flatMap((f) => germanSentences(read(f)).map((s) => `${f}: ${s}`));
    expect(found, 'German prose in a public file — translate it, or quote the German string the text is about').toEqual([]);
  });

  test('the code measure finds German comments and titles and lets German data pass', async () => {
    const scan = await textScan();
    // Same word list as the prose measure — one measure, two readers.
    expect(scan.GERMAN_WORDS.source).toBe(GERMAN_WORDS.source);
    const sample = [
      '// Die Engine baut kein Skelett, wenn der Code fehlt.',
      "test('der Fachsatz bleibt stehen, wenn die Regel fehlt', () => {",
      "  const prompt = 'Du bist ein Prüfer und schreibst auf Deutsch, weil der Bericht an den Owner geht.';",
      '  // A quoted German output stays: "nicht bestimmt, weil der Code fehlt".',
      '});',
    ].join('\n');
    const hit = scan.scanCode('tests/sample.spec.ts', sample);
    expect(hit.comments.map((h) => h.line)).toEqual([1]);
    expect(hit.titles.map((h) => h.line)).toEqual([2]);
    // A German string literal — a prompt, a mail to the owner, a fixture — is data: counted, not guarded.
    expect(hit.strings).toHaveLength(1);
    expect(scan.isCodeInScope('lib/abap/business-statement.ts')).toBe(true);
    expect(scan.isCodeInScope('docs/archiv/old.ts')).toBe(false);
  });

  test('no comment or test title in code outside the named exceptions is German', async () => {
    // This half reads tests/ as well: it is green only once lib/, app/, components/,
    // hooks/, scripts/ and tests/ are all English (3.0.14, both halves of 02.10.2026).
    const scan = await textScan();
    const files = trackedFiles().filter(scan.isCodeInScope);
    // The probe against an empty scope.
    expect(files.length, 'git ls-files returns no code files — the scope is broken, not empty').toBeGreaterThan(500);
    const found: string[] = [];
    for (const f of files) {
      const hit = scan.scanCode(f, read(f));
      for (const h of hit.comments) found.push(`${f}:${h.line} comment: ${h.text}`);
      for (const h of hit.titles) found.push(`${f}:${h.line} title: ${h.text}`);
    }
    expect(found, 'German comment or test title in code — translate it; a German string the code is about stays quoted').toEqual([]);
  });
});
