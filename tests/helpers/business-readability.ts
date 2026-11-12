import fs from 'node:fs';
import path from 'node:path';
import { buildProcessSkeleton } from '../../lib/abap/process-skeleton';
import { FIELD_TERMS_EN, TABLE_TERMS_EN, FUNCTION_TERMS_EN, TRANSACTION_TERMS_EN } from '../../lib/abap/plain-glossary';
import { dictionaryWords } from '../../lib/abap/sap-dictionary';
import { buildExportModel, type ExportContainer, type ExportNode } from '../../lib/bpmn/model';
import { businessLevelOf } from '../../lib/bpmn/export';
import { buildProcessFacts } from '../../lib/abap/process-facts';
import { deriveBusinessRulesFrom } from '../../lib/abap/business-rule-set';
import { explainBusinessRules } from '../../lib/abap/business-rule-set-explain';
import { programSummaryFactsOf } from '../../lib/program-summary-facts';
import { businessInShort, programSummary } from '../../lib/program-summary-text';
import { processStory } from '../../lib/process-story';
import { reachableWrites } from '../../lib/abap/reachable-writes';
import { editorRules } from '../../lib/rules-editor';
import { plainWordingFor } from '../../lib/business-card';

/**
 * The deterministic readability measure of the Business view (concept "Business-Lesbarkeit" §4.1, 05.11.2026).
 *
 * It reads a program the way the Business view does — the BPMN map at the business level with plain labels, the
 * numbered story, "In short", the rule titles and the questions for the business — and counts, per surface, what a
 * process owner without ABAP knowledge cannot read:
 *
 *   L1 raw identifier — a word of the label that is a name out of this source and no English word, or a code token
 *      (`ZSD_MINMENGE`, `REGUV`) — outside parentheses and quotes, where a code is said *as* a code;
 *   L2 empty formula — a placeholder that says nothing (`Condition met?`, `Which case applies?`, "their own handling");
 *   L3 technique on the business level — a lock, a log, an ALV set-up as a step of its own, and the same name twice
 *      in a row on one level;
 *   L4 decision quality — (a) asks positively, (b) names at least one branch by its effect, (c) has two targets;
 *   L5 size per level; L6 verb–object task names; L9 truth ("does not post" against what a run reaches).
 *
 * It is a linter, not a reader: calibrated by hand in the concept (97 % precision where it flags, but it lets
 * through more than a reader would). It measures; it decides nothing in the product. Test-side only.
 */

/* ------------------------------------------------------------- vocabulary */

let LEXICON: Set<string> | null = null;

/** English words: every word of a sentence-like string literal in the product's code, plus the glossary. */
export function englishLexicon(): Set<string> {
  if (LEXICON) return LEXICON;
  const words = new Set<string>(EXTRA_ENGLISH);
  const root = path.join(__dirname, '..', '..');
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'generated' || entry.name.startsWith('.')) continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const code = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
        for (const m of code.matchAll(/'([^'\n]{8,})'|`([^`]{8,})`/g)) {
          const text = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ');
          if ((text.match(/ /g) ?? []).length < 2 || /[_=<>{}]/.test(text)) continue;
          for (const w of text.match(/[A-Za-z]+/g) ?? []) if (/^[A-Za-z][a-z]+$/.test(w)) words.add(w.toLowerCase());
        }
      }
    }
  };
  for (const dir of ['lib', 'components', 'app']) walk(path.join(root, dir));
  const add = (text: string) => {
    for (const w of text.match(/[A-Za-z]+/g) ?? []) if (/^[A-Za-z][a-z]+$/.test(w)) words.add(w.toLowerCase());
  };
  for (const t of Object.values(FIELD_TERMS_EN)) add(`${t.singular} ${t.plural}`);
  for (const t of Object.values(TABLE_TERMS_EN)) add(`${t.singular} ${t.plural}`);
  for (const t of Object.values(FUNCTION_TERMS_EN)) add(t);
  for (const t of Object.values(TRANSACTION_TERMS_EN)) add(t);
  // The dictionary of 3.1.0 (`sap-dictionary.ts`) is English, curated by hand, like the glossary.
  for (const t of dictionaryWords()) add(t);
  LEXICON = words;
  return words;
}

/** Plain English words the product's strings happen not to use; never a word only an ABAP name carries. */
const EXTRA_ENGLISH = [
  'yes', 'no', 'next', 'done', 'other', 'otherwise', 'stop', 'stopped', 'ends', 'early', 'start', 'starts',
  'given', 'missing', 'set', 'selected', 'found', 'nothing', 'any', 'more', 'each', 'for', 'entry', 'entries',
  'calculate', 'calculates', 'initialize', 'enrich', 'notify', 'collect', 'chargeable', 'weekend', 'overdue', 'creator',
  'charge', 'parcel', 'pc', 'kg', 'persist', 'execute', 'fetch', 'export', 'import',
];

/** Acronyms and units a business reader knows. */
const KNOWN_CODES = new Set(['SAP', 'ALV', 'IDOC', 'BAPI', 'PDF', 'CSV', 'XML', 'ID', 'IDS', 'OK', 'VAT', 'EUR', 'USD', 'RFC', 'HR', 'MRP', 'ATP', 'EDI', 'API', 'URL', 'PO', 'GR', 'IR', 'KG', 'UTC', 'CHF', 'GBP', 'JSON', 'FTP', 'BOM', 'IBAN', 'BIC', 'ABAP', 'GUI', 'IT', 'MM', 'SD', 'FI', 'CO', 'PM', 'PP', 'QM', 'WM', 'HCM', 'CRM', 'BW', 'ERP']);

/** Identifier segments of a source: `gt_auftr` → auftr; `ls_fmci-potyp` → fmci, potyp. */
export function identifierSegments(source: string): Set<string> {
  const segs = new Set<string>();
  const code = source.split(/\r?\n/).filter((l) => !l.startsWith('*')).map((l) => l.replace(/"[^"]*$/, '').replace(/'(?:[^']|'')*'/g, ' ')).join('\n');
  for (const m of code.matchAll(/[A-Za-z][\w-]*/g)) {
    for (const s of m[0].toLowerCase().split(/[_-]+/)) if (s.length >= 2) segs.add(s);
  }
  return segs;
}

/** The part of a label a reader takes as prose: without parentheses and quoted text. */
function prose(label: string): string {
  return label.replace(/\([^()]*\)/g, ' ').replace(/“[^”]*”|"[^"]*"|'[^']*'/g, ' ');
}

export interface RawHit { word: string; why: 'code' | 'identifier' }

/** L1: the raw words of a label. */
export function rawWords(label: string, segments: ReadonlySet<string>): RawHit[] {
  const lex = englishLexicon();
  const out: RawHit[] = [];
  for (const token of prose(label).split(/[\s,;:?!.…→–/]+/).filter(Boolean)) {
    const t = token.replace(/^[^\w]+|[^\w]+$/g, '');
    if (!t || /^\d+$/.test(t)) continue;
    // A code: a name with an underscore, or an upper-case name the source uses as an identifier (`REGUV`). An
    // upper-case value the code compares with (`'EUR'`, `'Z9'`) is data the reader may need, not a name.
    if (/_/.test(t) || (/^[A-Z0-9]{2,}$/.test(t) && /[A-Z]/.test(t) && !KNOWN_CODES.has(t) && segments.has(t.toLowerCase()))) {
      out.push({ word: t, why: 'code' });
      continue;
    }
    if (/^[A-Z0-9]{2,}$/.test(t)) continue;
    const w = t.toLowerCase();
    if (lex.has(w) || lex.has(w.replace(/s$/, '')) || lex.has(w.replace(/es$/, '')) || lex.has(w.replace(/ies$/, 'y'))) continue;
    const stem = [w, w.replace(/s$/, ''), w.replace(/es$/, '')];
    if (stem.some((s) => segments.has(s))) out.push({ word: t, why: 'identifier' });
  }
  return out;
}

/** L2: placeholders and empty formulas. */
export const EMPTY_FORMULAS: readonly RegExp[] = [
  /^Condition met\??$/i, /^Which case applies\?$/i, /^Repeat\?$/i, /^OK\?$/i, /^Subrc\?$/i, /^Return code\b/i,
  /^(?:Step|Call|Call routine|Result)$/i, /^(?:Successful|Failed|Call successful|Call failed)\?$/i,
  /their own handling/i, /^It carries out\b/i, /^A read-only \w+ on \d+ tables?\.$/i, /^It applies \d+ checks?\.$/i,
  /^Entry exists(?: or entry exists)*\?$/i, /contains any of [A-Z]{1,3}\?$/,
];
export function isEmptyFormula(label: string): boolean {
  const s = label.trim();
  if (EMPTY_FORMULAS.some((re) => re.test(s))) return true;
  // A one-word step without an object ("Compare", "Check").
  return /^[A-Z][a-z]+$/.test(s) && !/^(?:Done|Start|Next|Yes|No|Other|Otherwise)$/.test(s);
}

/** L3: a technical step on the business level. */
export const TECHNICAL_STEPS: readonly RegExp[] = [
  /^Lock data for editing$/i, /^Release the lock$/i, /\block\b/i, /\b(?:application )?log\b/i, /^Prepare the result list$/i,
  /^Bal\b/i, /\bfield catalog\b|\blist columns\b/i, /^Open a file on the server$|^Close the file on the server$/i,
];
export function isTechnicalStep(label: string): boolean {
  return TECHNICAL_STEPS.some((re) => re.test(label.trim()));
}

/** L4 (a): a negated question. */
export function isNegativeQuestion(q: string): boolean {
  return /^(?:No|Not|Nothing)\b/i.test(q.trim()) || /\b(?:not|no longer|never)\b/i.test(q);
}

/** Branch labels that say nothing about the effect. */
const BARE_ARMS = new Set(['yes', 'no', 'next', 'done', 'other', 'otherwise', '']);

const VERBS = new Set(('read create check update show print save delete send post calculate determine get set build prepare start run go '
  + 'enter lock release open close write add remove collect select validate approve reject notify upload download convert format fill '
  + 'initialize compute sort assign change process transfer map load store clear display output copy generate split merge find decide '
  + 'apply evaluate keep discard ask take mark count sum total compare look block unblock confirm book cancel release record list '
  + 'transmit receive import export extract reverse derive group simulate schedule submit wait').split(' '));

/* ------------------------------------------------------------- reading */

export interface BpmnItem {
  level: number;
  container: string;
  tag: string;
  kind: string;
  name: string;
  anchor: string;
  arms?: Array<{ label: string; target: string }>;
}

export interface BusinessReadingOut {
  file: string;
  tasks: BpmnItem[];
  gateways: BpmnItem[];
  ends: BpmnItem[];
  levels: Array<{ container: string; level: number; steps: number }>;
  story: string[];
  inShort: string[];
  rules: string[];
  questions: string[];
  writes: number;
  segments: Set<string>;
}

function anchorOf(n: ExportNode): string {
  if (n.anchorLabel) return n.anchorLabel;
  const a = n.source.anchor;
  if (!a) return '';
  return a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`;
}

/** Everything the Business view shows about a program, read as the engine `engineVersion` reads it. */
export function readBusiness(source: string, file: string, engineVersion: string): BusinessReadingOut {
  // The map of the engine read for (3.1.0 draws flag steps, calculations and loop starts the released one does not).
  const skeleton = buildProcessSkeleton(source, { engineVersion });
  const model = buildExportModel(skeleton, businessLevelOf(skeleton, source, engineVersion));
  const levelOf = new Map<string, number>([[model.root.id, 0]]);
  const walk = (c: ExportContainer, depth: number) => {
    levelOf.set(c.id, depth);
    for (const n of c.nodes) if (n.inner) walk(n.inner, depth + 1);
  };
  walk(model.root, 0);
  const tasks: BpmnItem[] = [];
  const gateways: BpmnItem[] = [];
  const ends: BpmnItem[] = [];
  const levels: BusinessReadingOut['levels'] = [];
  for (const c of model.containers) {
    const level = levelOf.get(c.id) ?? 0;
    const flows = new Map(c.flows.map((f) => [f.id, f]));
    let steps = 0;
    for (const n of c.nodes) {
      const item: BpmnItem = { level, container: c.id, tag: n.tag, kind: n.source.kind, name: n.name, anchor: anchorOf(n) };
      if (n.tag === 'exclusiveGateway') {
        item.arms = n.outgoing.map((id) => flows.get(id)).filter(Boolean).map((f) => ({ label: f!.label ?? '', target: f!.targetId }));
        gateways.push(item);
        steps++;
      } else if (/Task$|^task$|callActivity|subProcess/.test(n.tag)) {
        tasks.push(item);
        steps++;
      } else if (n.tag === 'endEvent' && n.name !== 'Done') {
        ends.push(item);
      }
    }
    levels.push({ container: c.id, level, steps });
  }
  const facts = buildProcessFacts(source);
  const ruleSet = deriveBusinessRulesFrom(source, facts, skeleton, engineVersion);
  let story: string[] = [];
  try {
    story = processStory(skeleton, source, null, engineVersion).steps.map((s) => s.text);
  } catch { /* measured as empty */ }
  let inShort: string[] = [];
  try {
    const sf = programSummaryFactsOf(source, { skeleton, ruleSet, engineVersion });
    inShort = businessInShort(programSummary(sf), { codes: false }).map((l) => l.text).filter(Boolean);
  } catch { /* measured as empty */ }
  let rules: string[] = [];
  let questions: string[] = [];
  try {
    const ex = explainBusinessRules(source, ruleSet, facts, engineVersion);
    const titled = new Map(editorRules(ruleSet, plainWordingFor(source, skeleton)).map((r) => [r.id, r.title]));
    rules = ex.baskets.business.map((id) => ex.rules.find((r) => r.id === id)?.headline ?? titled.get(id) ?? id);
    questions = ex.questions.map((q) => q.statement.text);
  } catch { /* measured as empty */ }
  let writes = 0;
  try {
    const f = facts;
    writes = reachableWrites({ source, statements: f.statements, graph: f.calls }).length;
  } catch { /* none */ }
  return { file, tasks, gateways, ends, levels, story, inShort, rules, questions, writes, segments: identifierSegments(source) };
}

/* ------------------------------------------------------------- measures */

export interface SurfaceScore { n: number; raw: number; empty: number; technical: number; readable: number }

function score(labels: readonly string[], segments: ReadonlySet<string>, technical = false): SurfaceScore {
  let raw = 0;
  let empty = 0;
  let tech = 0;
  let readable = 0;
  for (const l of labels) {
    const r = rawWords(l, segments).length > 0;
    const e = isEmptyFormula(l);
    const t = technical && isTechnicalStep(l);
    if (r) raw++;
    if (e) empty++;
    if (t) tech++;
    if (!r && !e && !t) readable++;
  }
  return { n: labels.length, raw, empty, technical: tech, readable };
}

export interface Readability {
  tasks: SurfaceScore & { duplicates: number; verbObject: number; levelOneTechnical: number };
  gateways: SurfaceScore & { positive: number; effectArm: number; twoTargets: number };
  ends: SurfaceScore;
  story: SurfaceScore;
  inShort: SurfaceScore & { untrue: number };
  rules: SurfaceScore;
  questions: SurfaceScore;
  levels: { top: number; largest: number; over12: number };
}

export function measure(r: BusinessReadingOut): Readability {
  const seg = r.segments;
  const taskNames = r.tasks.map((t) => t.name);
  let duplicates = 0;
  const seen = new Map<string, number>();
  for (const t of r.tasks) {
    const key = `${t.container}|${t.name}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const n of seen.values()) if (n > 1) duplicates += n - 1;
  const verbObject = r.tasks.filter((t) => {
    const words = t.name.split(/\s+/);
    return words.length >= 2 && VERBS.has(words[0].toLowerCase());
  }).length;
  const levelOneTechnical = r.tasks.filter((t) => t.level === 0 && isTechnicalStep(t.name)).length;
  const gw = score(r.gateways.map((g) => g.name), seg);
  const positive = r.gateways.filter((g) => !isNegativeQuestion(g.name)).length;
  const effectArm = r.gateways.filter((g) => (g.arms ?? []).some((a) => !BARE_ARMS.has(a.label.trim().toLowerCase()))).length;
  const twoTargets = r.gateways.filter((g) => new Set((g.arms ?? []).map((a) => a.target)).size >= 2).length;
  const inShort = score(r.inShort, seg);
  const untrue = r.writes > 0 && r.inShort.some((l) => /does not post or change data/i.test(l)) ? 1 : 0;
  const tops = r.levels.filter((l) => l.level === 0).reduce((n, l) => n + l.steps, 0);
  return {
    tasks: { ...score(taskNames, seg, true), duplicates, verbObject, levelOneTechnical },
    gateways: { ...gw, positive, effectArm, twoTargets },
    ends: score(r.ends.map((e) => e.name), seg),
    story: score(r.story, seg),
    inShort: { ...inShort, untrue },
    rules: score(r.rules, seg),
    questions: score(r.questions, seg),
    levels: { top: tops, largest: Math.max(0, ...r.levels.map((l) => l.steps)), over12: r.levels.filter((l) => l.steps > 12).length },
  };
}

/** Sums the readability of several programs. */
export function total(all: readonly Readability[]): Readability {
  const add = <T extends object>(a: T, b: T): T => {
    const out = { ...(a as Record<string, number>) };
    for (const [k, v] of Object.entries(b as Record<string, number>)) out[k] = (out[k] ?? 0) + v;
    return out as T;
  };
  return all.reduce((acc, r) => ({
    tasks: add(acc.tasks, r.tasks),
    gateways: add(acc.gateways, r.gateways),
    ends: add(acc.ends, r.ends),
    story: add(acc.story, r.story),
    inShort: add(acc.inShort, r.inShort),
    rules: add(acc.rules, r.rules),
    questions: add(acc.questions, r.questions),
    levels: { top: Math.max(acc.levels.top, r.levels.top), largest: Math.max(acc.levels.largest, r.levels.largest), over12: acc.levels.over12 + r.levels.over12 },
  }));
}

/** Per-mille shares, for a ratchet that does not move on rounding. */
export const share = (part: number, n: number) => (n ? Math.round((1000 * part) / n) / 10 : 0);

/** A plain table of the measure: one line per surface. */
export function report(r: Readability): string {
  const line = (name: string, s: SurfaceScore, extra = '') =>
    `${name.padEnd(10)} n=${String(s.n).padStart(5)}  readable ${String(share(s.readable, s.n)).padStart(5)} %  raw ${String(share(s.raw, s.n)).padStart(5)} %  empty ${String(share(s.empty, s.n)).padStart(5)} %${s.technical ? `  technical ${share(s.technical, s.n)} %` : ''}${extra}`;
  return [
    line('tasks', r.tasks, `  dup ${r.tasks.duplicates}  verb-object ${share(r.tasks.verbObject, r.tasks.n)} %  L1-technical ${r.tasks.levelOneTechnical}`),
    line('gateways', r.gateways, `  positive ${share(r.gateways.positive, r.gateways.n)} %  effect-arm ${share(r.gateways.effectArm, r.gateways.n)} %  two-targets ${share(r.gateways.twoTargets, r.gateways.n)} %`),
    line('ends', r.ends),
    line('story', r.story),
    line('in short', r.inShort, `  untrue ${r.inShort.untrue}`),
    line('rules', r.rules),
    line('questions', r.questions),
    `levels     top(max) ${r.levels.top}  largest ${r.levels.largest}  levels>12 ${r.levels.over12}`,
  ].join('\n');
}
