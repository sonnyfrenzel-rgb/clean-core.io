import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { APP_VERSION } from '../lib/version';
import {
  PHASES,
  workflowSteps,
  generationBlockers,
  handoverBlockers,
  type PhaseKey,
  type PhaseState,
} from '../lib/workflow-steps';
import { TRACKED_ARTEFACTS, sha256Hex, artefactDigest, type TrackedArtefact } from '../lib/artefact-digest';
import { LIVE_TEST_EXECUTION } from '../lib/locked-paths';
import type { Project } from '../lib/types';

/**
 * The preservation register, checked against the code (roadmap 1.1, QA24-A04, W22-A04).
 *
 * `docs/registers/preservation-register.json` says what the seven stages read,
 * write, require and do when something fails. A register nobody checks is a
 * belief, and preserving a belief through the 3.0 rebuild is worse than
 * preserving nothing: the rebuild would reproduce it and call the result a
 * migration. So every claim in that file is derived from the code here, and
 * where the two disagree this spec fails and the code wins.
 *
 * Three layers, in order of how cheap they are to run:
 *
 *   1. the contract — `lib/workflow-steps.ts` executed on the register's own
 *      reference cases: order, states, badges, blockers;
 *   2. the code — the stage sources, `firestore.rules` and
 *      `app/api/runs/create/route.ts` read and compared with what the register
 *      says about them, field by field;
 *   3. the reference cases — seeded into the Firestore emulator and opened in a
 *      browser, so the real hydration and the real rendering have to agree with
 *      layers 1 and 2. This is the layer roadmap step 3.0.3 re-runs against the
 *      new workspace.
 */

const ROOT = path.resolve(__dirname, '..');
const REGISTER_PATH = 'docs/registers/preservation-register.json';

/* ------------------------------------------------------------------ types */

interface InputEntry {
  field: string;
  from: 'project' | 'run';
  /** Read through this helper rather than as `project.<field>` in the page. */
  via?: string;
  why: string;
}

/**
 * The step from a field name to something on the screen.
 *
 * The rendered layer used to open every stage and check the stepper, the stale
 * notice and two delivery buttons — none of which is an output. A stage that
 * stopped rendering its own inventory, with a dead `.field` reference left in
 * the source to satisfy the code layer, still reported success (QA review
 * 96423cbf366f). So every output the register attributes to a stage is now
 * classified, and the ones that have a visible form are looked at.
 *
 * Four classes, because the honest answer is not always "visible":
 *   shows          — an element that exists only while the output does, named
 *                    by `[data-stage-output="<field>"]` in the page itself;
 *   onlyAfterARun  — rendered only after a generation or a test run in the same
 *                    session, so a seeded reload can never show it;
 *   notShown       — no visible form at all (prompt input, download payload,
 *                    write-only field);
 *   notYetAnchored — visible somewhere, but this register does not yet name the
 *                    element, and says where it is instead of pretending.
 */
interface ShowsEntry {
  field: string;
  locator: string;
  /** Accessible name of a control that has to be clicked first. */
  opensWith?: string;
  /** Text the seeded value must produce on screen; absent means presence only. */
  text?: string;
  why: string;
}

interface RenderedBlock {
  /** Reference case used to prove this stage's outputs; defaults to the stage's own. */
  provenBy?: string;
  shows: ShowsEntry[];
  onlyAfterARun: Array<{ field: string; why: string }>;
  notShown: Array<{ field: string; why: string }>;
  notYetAnchored: Array<{ field: string; where: string; why: string }>;
}

interface StageEntry {
  key: PhaseKey;
  n: number;
  label: string;
  route: string;
  page: string;
  alsoWrites: string[];
  inputs: { required: InputEntry[]; optional: InputEntry[] };
  outputs: {
    clientWrites: string[];
    otherCollections?: string[];
    /**
     * Roadmap 0.7: fields the stage still puts on the project, but through
     * `POST /api/projects/{projectId}/commands` rather than from the browser.
     * They are project writes like any other — they are simply not in the
     * client-writable allowlist of `firestore.rules` any more.
     */
    commandWrites?: { via: string; project: string[] };
  };
  /** Fields a stage puts on screen although it writes none of them (tco, delivery). */
  alsoDisplays?: string[];
  rendered: RenderedBlock;
  preconditions: {
    enforceActiveRun: boolean;
    generationBlockersTarget: 'transformation' | 'documentation' | 'testing' | null;
  };
  errors: Array<{ when: string; does: string }>;
  referenceCase: string;
}

interface ReferenceCase {
  id: string;
  stage: PhaseKey;
  title: string;
  seed: {
    previousSource?: string;
    project: Record<string, unknown>;
    run: Record<string, unknown>;
  };
  expect: {
    phaseStates: Record<PhaseKey, PhaseState>;
    badges: Partial<Record<PhaseKey, string>>;
    detailContains: Partial<Record<PhaseKey, string>>;
    generationBlockers: Record<'transformation' | 'documentation' | 'testing', string[]>;
    handoverBlockers: string[];
    staleNoticeOnOwnStage: boolean;
    handoverDownloadsDisabled?: boolean;
  };
}

interface Register {
  schemaVersion: number;
  roadmapStep: string;
  baseline: {
    verifiedAgainstCommit: string;
    appVersion: string;
    rules: {
      file: string;
      sha256OfLfNormalisedText: string;
      projectDocument: { clientWritableFields: string[] };
      runSubcollection: { write: string };
    };
  };
  trustChain: {
    run: { signedFields: string[]; unsignedFieldsOnTheRun: string[] };
    projectFieldsWrittenByRunsCreate: string[];
    projectFieldsDeletedByRunsCreate: string[];
    hydration: { projectLeadingFields: string[] };
    stalenessTrackedArtefacts: string[];
    stalenessUntrackedArtefacts: string[];
    clientWritableFieldsNoStageWrites: Record<string, string>;
    generationBlockerTargets: string[];
    generationBlockerMessages: Record<string, string>;
    handoverBlockerReasons: string[];
    auditPackServerBlockers: { route: string; status: number; codes: string[] };
  };
  lockedPaths: Array<{ id: string; source: string; stage: string }>;
  knownLimits: Array<{ id: string; subject: string; statement: string }>;
  stages: StageEntry[];
  referenceCases: ReferenceCase[];
}

const register: Register = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTER_PATH), 'utf8'));

/* ------------------------------------------------------- source utilities */

const raw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Comments removed: the notes beside a fix quote the very calls we are counting. */
const src = (rel: string) =>
  raw(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const stageSource = (stage: StageEntry) => [stage.page, ...stage.alsoWrites].map(src).join('\n');

/** The balanced `{...}` / `[...]` / `(...)` region starting at `open`, quotes respected. */
function balanced(text: string, open: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

/** Keys at depth 1 of an object literal — `a:`, `'a':`, `` [`a.b`]: `` and shorthand. */
function topLevelKeys(region: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let token = '';
  let i = 0;

  const take = () => {
    const t = token.trim();
    token = '';
    if (!t) return;
    const computed = /^\[\s*[`'"]([A-Za-z_$][\w$]*)/.exec(t);
    const plain = /^[`'"]?([A-Za-z_$][\w$]*)/.exec(t);
    const name = computed ? computed[1] : plain ? plain[1] : '';
    if (name) out.push(name);
  };

  const skipValue = () => {
    let d = 0;
    let q: string | null = null;
    for (i = i + 1; i < region.length; i++) {
      const c = region[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; continue; }
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') {
        if (d === 0) { i--; return; }
        d--;
      } else if (c === ',' && d === 0) return;
    }
  };

  for (i = 0; i < region.length; i++) {
    const c = region[i];
    if (quote) {
      token += c;
      if (c === '\\') { token += region[++i]; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; token += c; continue; }
    if (c === '{' || c === '[' || c === '(') {
      depth++;
      if (depth === 1) { token = ''; continue; }
      token += c;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0) { take(); break; }
      token += c;
      continue;
    }
    if (depth === 1 && c === ':') { take(); skipValue(); continue; }
    if (depth === 1 && c === ',') { take(); continue; }
    token += c;
  }
  return out;
}

/**
 * Every field name written to `collection` by this source, from the object
 * literal of each `updateDoc` / `setDoc` / `addDoc` / `tx.update` call. The
 * collection is the first quoted string in the reference expression, so
 * `doc(db, 'tenant_access_requests', uid)` is not counted as a project write
 * while `updateDoc(docRef, …)` — where the ref was built earlier — is.
 */
/**
 * The first `{` at or after `from` that is not inside a string.
 *
 * `indexOf('{')` was enough until a stage cleared stale keys with
 * ``updateDoc(ref, Object.fromEntries(stale.map((key) => [`exports.${key}`, deleteField()])))``:
 * the first brace in that call belongs to the template interpolation, and the
 * register then reported that the Analyze stage writes a field called `key`
 * (CI of 7fea4f4). `balanced` two functions up already tracks quotes; this is
 * the same knowledge, applied to finding the opening brace rather than the
 * closing one.
 */
function unquotedBrace(text: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') return i;
  }
  return -1;
}

function firestoreWriteKeys(text: string, collection = 'projects'): Set<string> {
  const keys = new Set<string>();
  const CALL = /(?:updateDoc|setDoc|addDoc)\s*\(|\b(?:tx|transaction|batch)\s*\.\s*(?:set|update)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = CALL.exec(text)) !== null) {
    // The whole argument list, so a call with no object literal in it is
    // recognised as such instead of borrowing the next `{` in the file.
    const args = balanced(text, m.index + m[0].length - 1);
    if (!args) continue;
    const end = m.index + m[0].length - 1 + args.length;
    const named = /['"]([A-Za-z_][\w-]*)['"]/.exec(args.slice(0, unquotedBrace(args, 0) + 1 || undefined));
    const target = named ? named[1] : 'projects';
    CALL.lastIndex = end;
    if (target !== collection) continue;

    const brace = unquotedBrace(text, m.index + m[0].length);
    const region = brace !== -1 && brace < end ? balanced(text, brace) : null;
    if (region) {
      for (const k of topLevelKeys(region)) keys.add(k);
      continue;
    }

    // No object literal — a dotted-path update built at runtime, as
    // `Object.fromEntries` does. The field is the root of the path, and it is
    // still a write to it: clearing `exports.<key>` touches `exports`. Read out
    // of the literal that names it, so a computed path cannot hide the field.
    const dotted = [...args.matchAll(/[`'"]([A-Za-z_$][\w$]*)\.[^`'"]*[`'"]/g)].map((d) => d[1]);
    expect(
      dotted.length,
      `a write to ${collection} in a form this register cannot read — neither an object literal nor a dotted path:\n${args.slice(0, 200)}`,
    ).toBeGreaterThan(0);
    for (const k of dotted) keys.add(k);
  }
  return keys;
}

/**
 * The object literal that follows `marker`, as its top-level keys.
 *
 * A marker that no longer matches is an error, not an empty result. The first
 * version returned `[]`, which makes the register blind in exactly the case it
 * exists for: when roadmap 0.6 moved the project write into a transaction,
 * `projectWrite.set(projectRef,` stopped matching, and the comparison degraded
 * from "these are the fields the route writes" to "the register's list is
 * empty" — a shape that passes as soon as the list is emptied too.
 */
function keysAfter(text: string, marker: string | RegExp): string[] {
  let end: number;
  if (typeof marker === 'string') {
    const at = text.indexOf(marker);
    if (at === -1) throw new Error(`preservation register: the marker ${marker} is no longer in the file`);
    end = at + marker.length;
  } else {
    const m = marker.exec(text);
    if (!m) throw new Error(`preservation register: the marker ${marker} no longer matches the file`);
    end = m.index + m[0].length;
  }
  const open = text.indexOf('{', end);
  if (open === -1) throw new Error(`preservation register: no object literal follows ${marker}`);
  const region = balanced(text, open);
  if (!region) throw new Error(`preservation register: the object literal after ${marker} does not close`);
  return topLevelKeys(region);
}

const sorted = (xs: Iterable<string>) => [...xs].sort();

/* ------------------------------------------------ reference case hydration */

const PLACEHOLDER = /^@(sha256|artefactDigest):(.+)$/;

/**
 * Resolves the register's three placeholder forms against the seed itself, so a
 * reference case never carries a hand-copied digest that could rot:
 *   `@sha256:legacyCode`         — digest of the project's current source
 *   `@sha256:previousSource`     — digest of the source the run analysed
 *   `@artefactDigest:<artefact>` — the digest `runs/create` would have recorded
 */
function resolvePlaceholders(value: unknown, rc: ReferenceCase, runId: string): unknown {
  if (typeof value === 'string') {
    if (value === '@runId') return runId;
    const m = PLACEHOLDER.exec(value);
    if (!m) return value;
    if (m[1] === 'sha256') {
      const text =
        m[2] === 'legacyCode'
          ? String(rc.seed.project.legacyCode ?? '')
          : String(rc.seed[m[2] as 'previousSource'] ?? '');
      expect(text, `${rc.id}: nothing to hash for ${value}`).not.toBe('');
      return sha256Hex(text);
    }
    return artefactDigest(m[2] as TrackedArtefact, rc.seed.project[m[2]]);
  }
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholders(v, rc, runId));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolvePlaceholders(v, rc, runId)]),
    );
  }
  return value;
}

const runIdOf = (rc: ReferenceCase) => `${rc.id}-run`;

/* --------------------------------------------- the seed, read as the screen */

/**
 * Everything the register accounts for on a stage: what it writes, plus what it
 * only displays.
 *
 * `commandWrites` counts. Roadmap 0.7 moved six release fields out of the
 * client-writable allowlist and behind `POST /api/projects/{id}/commands`, but
 * the stage still puts them on the project and still shows them — only the
 * writer changed. Leaving them out here would quietly drop six fields from the
 * rendered classification, which is the one layer that asks whether an output
 * reaches the screen at all.
 */
const accountedFields = (stage: StageEntry) => [
  ...stage.outputs.clientWrites,
  ...(stage.outputs.commandWrites?.project ?? []),
  ...(stage.alsoDisplays ?? []),
];

const classifiedEntries = (stage: StageEntry) => [
  ...stage.rendered.shows,
  ...stage.rendered.onlyAfterARun,
  ...stage.rendered.notShown,
  ...stage.rendered.notYetAnchored,
];

/** The reference case that proves this stage's rendered outputs. */
const provingCase = (stage: StageEntry) =>
  register.referenceCases.find((rc) => rc.id === (stage.rendered.provenBy ?? stage.referenceCase))!;

/**
 * Whether the seed carries the field at all — the key being there, not the
 * value being interesting. An empty worklist is a worklist: the panel that
 * renders it is on screen either way, and the question this layer asks is
 * whether the stage still renders it.
 */
function seedCarries(seed: SeededDocuments, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(seed.project, field)
    || Object.prototype.hasOwnProperty.call(seed.run, field);
}

/** `project.a.b`, `run.x`; a JSON string on the way is parsed when the path continues. */
function dig(seed: SeededDocuments, dotted: string): unknown {
  const parts = dotted.split('.');
  let value: unknown = parts[0] === 'run' ? seed.run : seed.project;
  for (const part of parts.slice(1)) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return undefined; }
    }
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/**
 * The text a seeded value has to produce on screen.
 *
 * `{project.a.b}` is the value, `{count:project.x}` the length of an array,
 * `{lines:project.x}` the line count of a string, `{json:…}` the same as the
 * plain form and written out where the path crosses a stored JSON string.
 * Anything outside braces is literal.
 */
function resolveText(template: string, seed: SeededDocuments): string {
  return template.replace(/\{([^}]+)\}/g, (_match, expr: string) => {
    const at = expr.indexOf(':');
    const fn = at === -1 ? 'value' : expr.slice(0, at);
    const dotted = at === -1 ? expr : expr.slice(at + 1);
    const value = dig(seed, dotted);
    if (fn === 'count') return String(Array.isArray(value) ? value.length : 0);
    if (fn === 'lines') return String(String(value ?? '').split('\n').length.toLocaleString());
    return String(value);
  });
}

interface SeededDocuments {
  runId: string;
  project: Record<string, unknown>;
  run: Record<string, unknown>;
}

function seedDocuments(rc: ReferenceCase, uid: string, projectId: string): SeededDocuments {
  const runId = runIdOf(rc);
  const project = resolvePlaceholders(rc.seed.project, rc, runId) as Record<string, unknown>;
  const run = resolvePlaceholders(rc.seed.run, rc, runId) as Record<string, unknown>;
  return {
    runId,
    project: { ...project, userId: uid, createdAt: new Date() },
    run: { ...run, runId, projectId, userId: uid },
  };
}

/**
 * What `loadProjectAndHydrate` hands a stage: the run spread over the project,
 * with three fields the project keeps. The rendered layer below is what proves
 * the real loader still does this; the check in "the code" section holds the
 * three names against `lib/project-loader.ts`.
 */
function hydrate(rc: ReferenceCase): Project {
  const { project, run } = seedDocuments(rc, 'uid-not-used-here', 'project-not-used-here');
  const merged = { ...project, ...run } as Record<string, unknown>;
  for (const field of register.trustChain.hydration.projectLeadingFields) {
    merged[field] = project[field] ? project[field] : run[field];
  }
  return merged as unknown as Project;
}

const byKey = (p: Project) => Object.fromEntries(workflowSteps(p).map((s) => [s.key, s]));

/* =================================================== 1. the contract runs */

test.describe('the register and the phase contract agree', () => {
  test('seven stages, the same order and the same labels as PHASES', () => {
    expect(register.stages.map((s) => s.key)).toEqual(PHASES.map((p) => p.key));
    expect(register.stages.map((s) => s.n)).toEqual(PHASES.map((p) => p.n));
    expect(register.stages.map((s) => s.label)).toEqual(PHASES.map((p) => p.label));
    for (const stage of register.stages) {
      expect(stage.route, `${stage.key} route`).toBe(`/project/{projectId}/${stage.key}`);
      expect(stage.page).toBe(`app/(app)/project/[projectId]/${stage.key}/page.tsx`);
    }
  });

  test('the artefacts a source change can strand are the ones the register lists', () => {
    expect(register.trustChain.stalenessTrackedArtefacts).toEqual([...TRACKED_ARTEFACTS]);
    // The other half of the same fact: what is written but never tracked. L-03
    // lives here — a business SOP and a test suite go into the delivery bundle
    // and neither can ever be reported as stale.
    for (const artefact of register.trustChain.stalenessUntrackedArtefacts) {
      expect(TRACKED_ARTEFACTS as readonly string[], `${artefact} is tracked after all`).not.toContain(artefact);
    }
    // Written by a stage — from the browser, or (since roadmap 0.7) through the
    // command route. Where the write is issued is a different question from
    // whether the artefact can go stale, which is what this test is about.
    const written = sorted(
      new Set(register.stages.flatMap((s) => [...s.outputs.clientWrites, ...(s.outputs.commandWrites?.project ?? [])])),
    );
    for (const artefact of register.trustChain.stalenessUntrackedArtefacts) {
      expect(written, `${artefact} is not written by any stage`).toContain(artefact);
    }
  });

  test('generationBlockers has exactly the three targets the register names, with these words', () => {
    const declared = register.stages
      .map((s) => s.preconditions.generationBlockersTarget)
      .filter((t): t is 'transformation' | 'documentation' | 'testing' => t !== null);
    expect(sorted(declared)).toEqual(sorted(register.trustChain.generationBlockerTargets));

    const base: Project = {
      name: 'blocker fixture',
      legacyCode: 'REPORT z_b.\n',
      activeRunId: 'run-b',
      solutionDesign: '{"a":1}',
      generatedCode: 'export const a = 1;\n',
      approvedByArchitect: true,
      architectSignOffAt: '2026-09-16T00:00:00.000Z',
    };
    const m = register.trustChain.generationBlockerMessages;

    // The source itself moved: one message, and nothing else is reported.
    const moved: Project = {
      ...base,
      auditMetadata: { inputFingerprint: { sha256: 'f'.repeat(64), fileName: 'x', lineCount: 1, byteSize: 1, uploadedAt: '', objectType: 'Report' } },
    };
    expect(generationBlockers(moved, 'transformation')).toEqual([m.sourceChanged]);
    expect(generationBlockers(moved, 'documentation')).toEqual([m.sourceChanged]);

    const unchangedFingerprint = {
      inputFingerprint: { sha256: sha256Hex(base.legacyCode!), fileName: 'x', lineCount: 1, byteSize: 1, uploadedAt: '', objectType: 'Report' },
    };
    const withRecord = (artefacts: Partial<Record<TrackedArtefact, string>>, signOff?: string): Project => ({
      ...base,
      auditMetadata: {
        ...unchangedFingerprint,
        sourceChange: { at: '2026-09-16T00:00:00.000Z', runId: 'run-a', previousSha256: 'a'.repeat(64), artefacts, ...(signOff ? { signOff } : {}) },
      },
    });

    expect(generationBlockers(withRecord({ solutionDesign: artefactDigest('solutionDesign', base.solutionDesign)! }), 'transformation'))
      .toEqual([m.designStale]);
    expect(generationBlockers(withRecord({}, base.architectSignOffAt as string), 'transformation'))
      .toEqual([m.signOffStale]);

    const codeStale = withRecord({ generatedCode: artefactDigest('generatedCode', base.generatedCode)! });
    expect(generationBlockers(codeStale, 'documentation')).toEqual([m.codeStale]);
    expect(generationBlockers(codeStale, 'testing')).toEqual([m.codeStale]);
    // Transformation is the stage that would rewrite the code, so its own
    // staleness is not a reason to stop it.
    expect(generationBlockers(codeStale, 'transformation')).toEqual([]);
  });

  test('handoverBlockers names the six reasons the register lists, in that order', () => {
    const everything: Project = {
      name: 'handover fixture',
      legacyCode: 'REPORT z_h.\n',
      activeRunId: 'run-h',
      solutionDesign: '{"a":1}',
      generatedCode: 'export const a = 1;\n',
      documentation: '{"l1_domain":"Sales"}',
      testCases: [{ id: 't1', name: 'a', category: 'Unit', description: 'd', priority: 'High' }],
      approvedByArchitect: true,
      architectSignOffAt: '2026-09-16T00:00:00.000Z',
      auditMetadata: { inputFingerprint: { sha256: 'f'.repeat(64), fileName: 'x', lineCount: 1, byteSize: 1, uploadedAt: '', objectType: 'Report' } },
    };
    expect(handoverBlockers(everything)).toEqual(register.trustChain.handoverBlockerReasons);
  });

  test('each stage names a reference case, and each reference case names its stage', () => {
    const ids = new Set(register.referenceCases.map((rc) => rc.id));
    for (const stage of register.stages) expect(ids, `${stage.key}`).toContain(stage.referenceCase);
    for (const rc of register.referenceCases) {
      const stage = register.stages.find((s) => s.key === rc.stage);
      expect(stage, `${rc.id} names an unknown stage`).toBeTruthy();
      expect(stage!.referenceCase).toBe(rc.id);
    }
    expect(register.referenceCases).toHaveLength(register.stages.length);
  });

  for (const rc of register.referenceCases) {
    test(`reference case ${rc.id} — ${rc.title}`, () => {
      const project = hydrate(rc);
      const steps = byKey(project);

      for (const key of PHASES.map((p) => p.key)) {
        expect(steps[key].state, `${rc.id}: phase ${key}`).toBe(rc.expect.phaseStates[key]);
      }
      for (const [key, badge] of Object.entries(rc.expect.badges)) {
        expect(steps[key as PhaseKey].badge, `${rc.id}: badge on ${key}`).toBe(badge);
      }
      for (const [key, fragment] of Object.entries(rc.expect.detailContains)) {
        expect(steps[key as PhaseKey].detail, `${rc.id}: detail on ${key}`).toContain(fragment);
      }
      for (const target of ['transformation', 'documentation', 'testing'] as const) {
        expect(generationBlockers(project, target), `${rc.id}: generationBlockers(${target})`)
          .toEqual(rc.expect.generationBlockers[target]);
      }
      expect(handoverBlockers(project), `${rc.id}: handoverBlockers`).toEqual(rc.expect.handoverBlockers);
    });
  }
});

/* ================================================= 2. the code is the source */

test.describe('the register matches the code', () => {
  test('every field a stage writes to its project document is in the register, and nothing else', () => {
    for (const stage of register.stages) {
      const found = firestoreWriteKeys(stageSource(stage), 'projects');
      expect(sorted(found), `${stage.key}: writes to projects/{id}`).toEqual(sorted(stage.outputs.clientWrites));
    }
  });

  test('a stage that writes another collection says which', () => {
    for (const stage of register.stages) {
      const text = stageSource(stage);
      const CALL = /(?:updateDoc|setDoc|addDoc)\s*\(/g;
      const others = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = CALL.exec(text)) !== null) {
        const open = text.indexOf('{', m.index + m[0].length);
        if (open === -1) continue;
        const named = /['"]([A-Za-z_][\w-]*)['"]/.exec(text.slice(m.index + m[0].length, open));
        if (named && named[1] !== 'projects') others.add(`${named[1]}/{uid}`);
      }
      expect(sorted(others), `${stage.key}: other collections`).toEqual(sorted(stage.outputs.otherCollections ?? []));
    }
  });

  test('every field the register says a stage reads is read there', () => {
    for (const stage of register.stages) {
      const text = stageSource(stage);
      for (const entry of [...stage.inputs.required, ...stage.inputs.optional]) {
        if (entry.via) {
          expect(text, `${stage.key}: ${entry.field} is read through ${entry.via}`).toContain(`${entry.via}(`);
        } else {
          expect(new RegExp(`\\.${entry.field}\\b`).test(text), `${stage.key}: ${entry.field} is not read`).toBe(true);
        }
      }
    }
  });

  test('a field the register says comes from the run really lives on the run', () => {
    const route = src('app/api/runs/create/route.ts');
    const runFields = sorted(
      new Set([...keysAfter(route, 'const unsignedRunPayload'), ...register.trustChain.run.unsignedFieldsOnTheRun]),
    );
    expect(runFields).toEqual(
      sorted([...register.trustChain.run.signedFields, ...register.trustChain.run.unsignedFieldsOnTheRun]),
    );
    for (const stage of register.stages) {
      for (const entry of [...stage.inputs.required, ...stage.inputs.optional]) {
        if (entry.from !== 'run') continue;
        expect(runFields, `${stage.key}: ${entry.field} is said to come from the run`).toContain(entry.field);
      }
    }
  });

  test('a field the register says comes from the project is not one runs/create deletes', () => {
    const route = src('app/api/runs/create/route.ts');
    const deleted = [...route.matchAll(/(\w+):\s*FieldValue\.delete\(\)/g)].map((m) => m[1]);
    expect(sorted(deleted)).toEqual(sorted(register.trustChain.projectFieldsDeletedByRunsCreate));

    // Roadmap 0.6 moved this write into the commit-time transaction, so the
    // call is `tx.set(projectRef, …)` and no longer a batch on `projectWrite`.
    const written = keysAfter(route, /tx\.set\(\s*projectRef,/);
    expect(sorted(written)).toEqual(sorted(register.trustChain.projectFieldsWrittenByRunsCreate));

    for (const stage of register.stages) {
      for (const entry of [...stage.inputs.required, ...stage.inputs.optional]) {
        if (entry.from !== 'project') continue;
        expect(deleted, `${stage.key}: ${entry.field} is deleted from the project by runs/create`).not.toContain(entry.field);
      }
    }
  });

  test('enforceActiveRun and the generation blockers are wired where the register says', () => {
    for (const stage of register.stages) {
      const text = src(stage.page);
      expect(text.includes('enforceActiveRun('), `${stage.key}: enforceActiveRun`).toBe(stage.preconditions.enforceActiveRun);
      const target = stage.preconditions.generationBlockersTarget;
      const used = [...text.matchAll(/generationBlockers\(\s*[^,]+,\s*'([a-z]+)'\s*\)/g)].map((m) => m[1]);
      expect(sorted(new Set(used)), `${stage.key}: generationBlockers target`).toEqual(target ? [target] : []);
    }
    // Delivery is the one stage that stops on handoverBlockers instead.
    expect(src('app/(app)/project/[projectId]/delivery/page.tsx')).toContain('handoverBlockers(project)');
  });

  test('the rules are fixed: the file, the allowlist and the run subcollection', () => {
    const rules = raw('firestore.rules').replace(/\r\n/g, '\n');
    expect(
      crypto.createHash('sha256').update(rules, 'utf8').digest('hex'),
      'firestore.rules changed — re-verify the register against the new rules and update baseline.rules.sha256OfLfNormalisedText',
    ).toBe(register.baseline.rules.sha256OfLfNormalisedText);

    const at = rules.indexOf('affectedKeys().hasOnly(');
    expect(at, 'the client-writable allowlist is gone from firestore.rules').toBeGreaterThan(-1);
    const list = balanced(rules, rules.indexOf('[', at))!;
    const allowed = [...list.matchAll(/'([A-Za-z_][\w]*)'/g)].map((m) => m[1]);
    expect(sorted(allowed)).toEqual(sorted(register.baseline.rules.projectDocument.clientWritableFields));

    // Every field a stage writes from the browser has to be in that allowlist.
    const written = new Set(register.stages.flatMap((s) => s.outputs.clientWrites));
    for (const stage of register.stages) {
      for (const field of stage.outputs.clientWrites) {
        expect(allowed, `${stage.key}: the client writes ${field}, the rules do not allow it`).toContain(field);
      }
    }
    // Roadmap 0.7, the mirror image: a field a stage writes through the command
    // route must NOT be in that allowlist. If it is, the route is decoration.
    for (const stage of register.stages) {
      for (const field of stage.outputs.commandWrites?.project ?? []) {
        expect(allowed, `${stage.key}: ${field} goes through the command route and the rules still allow a browser to write it`).not.toContain(field);
      }
    }
    // …and the other way round: a field the rules allow that no stage writes is
    // surface without a purpose, so the register has to say where it comes from.
    // `presentation` is the one nothing writes at all (L-09).
    const unwritten = sorted(allowed.filter((f) => !written.has(f)));
    expect(unwritten, 'a client-writable field nobody writes is unaccounted for').toEqual(
      sorted(Object.keys(register.trustChain.clientWritableFieldsNoStageWrites)),
    );
    expect(register.baseline.rules.runSubcollection.write).toContain('allow write: if false');
    expect(rules).toMatch(/match \/projects\/\{projectId\}\/runs\/\{runId\}[\s\S]*?allow write: if false/);
  });

  test('the baseline names this build and this commit', () => {
    expect(register.baseline.appVersion).toBe(APP_VERSION);
    expect(register.baseline.verifiedAgainstCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(raw('docs/PRESERVATION-REGISTER.md')).toContain(register.baseline.verifiedAgainstCommit);
  });

  test('hydration: the run wins, except for the three fields the register names', () => {
    const loader = src('lib/project-loader.ts');
    expect(loader).toContain('...data,');
    expect(loader).toContain('...runData,');
    for (const field of register.trustChain.hydration.projectLeadingFields) {
      expect(loader, `${field} is no longer project-leading`).toContain(`${field}: data.${field} || runData.${field}`);
    }
    const leading = [...loader.matchAll(/(\w+): data\.\w+ \|\| runData\.\w+/g)].map((m) => m[1]);
    expect(sorted(leading)).toEqual(sorted(register.trustChain.hydration.projectLeadingFields));
  });

  test('the audit pack refuses on the server with the codes the register lists', () => {
    const route = src(register.trustChain.auditPackServerBlockers.route);
    for (const code of register.trustChain.auditPackServerBlockers.codes) {
      expect(route, `audit-pack blocker ${code}`).toContain(`code: '${code}'`);
    }
    expect(route).toContain(`{ status: ${register.trustChain.auditPackServerBlockers.status} }`);
  });

  test('every output the register attributes to a stage is classified exactly once', () => {
    for (const stage of register.stages) {
      const accounted = sorted(accountedFields(stage));
      const classified = classifiedEntries(stage).map((e) => e.field);
      expect(sorted(classified), `${stage.key}: the four rendered lists do not cover its outputs`).toEqual(accounted);
      expect(new Set(classified).size, `${stage.key}: a field is classified twice`).toBe(classified.length);
      for (const entry of classifiedEntries(stage)) {
        // A record with no reason is the pretence this layer exists to stop.
        expect(entry.why.length, `${stage.key}: ${entry.field} is classified without a reason`).toBeGreaterThan(20);
      }
      for (const entry of stage.rendered.notYetAnchored) {
        expect(entry.where.length, `${stage.key}: ${entry.field} does not say where it is`).toBeGreaterThan(0);
      }
      // The proving reference case has to exist, and has to carry at least one
      // of the outputs — otherwise the rendered layer below looks at nothing.
      const rc = provingCase(stage);
      expect(rc, `${stage.key}: rendered.provenBy names an unknown reference case`).toBeTruthy();
    }
  });

  test('every anchor the register names is in the code, and every anchor in the code is in the register', () => {
    // `[data-stage-output="x"]` is the whole step from a field name to the
    // screen. A register that names an element nobody renders is back where it
    // started, and an attribute nobody declared is coverage nobody decided on.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { walk(rel); continue; }
        if (entry.name.endsWith('.tsx')) files.push(rel);
      }
    };
    walk('app');
    walk('components');

    const inCode = new Map<string, string[]>();
    for (const rel of files) {
      const text = raw(rel);
      for (const m of text.matchAll(/data-stage-output=(?:"(\w+)"|\{[^}]*?'(\w+)'[^}]*?\})/g)) {
        const name = m[1] ?? m[2];
        inCode.set(name, [...(inCode.get(name) ?? []), rel]);
      }
    }

    const declared = new Set(register.stages.flatMap((s) => s.rendered.shows.map((e) => e.field)));
    for (const stage of register.stages) {
      for (const entry of stage.rendered.shows) {
        expect(entry.locator, `${stage.key}: ${entry.field} uses a locator this layer does not own`).toBe(
          `[data-stage-output="${entry.field}"]`,
        );
        expect([...inCode.keys()], `${stage.key}: nothing in the code carries ${entry.locator}`).toContain(entry.field);
      }
    }
    for (const name of inCode.keys()) {
      expect([...declared], `data-stage-output="${name}" is in the code and in no register entry`).toContain(name);
    }
  });

  test('the locked path from G0:R0 is inherited, not restated', () => {
    const locked = register.lockedPaths.find((p) => p.id === LIVE_TEST_EXECUTION.id);
    expect(locked, 'the register lost the G0:R0 lock').toBeTruthy();
    expect(LIVE_TEST_EXECUTION.locked).toBe(true);
    expect(locked!.source).toContain('lib/locked-paths.ts');
    expect(locked!.stage).toBe('testing');
    expect(src(register.stages.find((s) => s.key === 'testing')!.page)).toContain('LIVE_TEST_EXECUTION');
  });

  test('the known limits still hold — a fix has to update the register', () => {
    const limit = (id: string) => register.knownLimits.find((l) => l.id === id)!;

    // L-01: a verdict is written by the server or by nobody.
    //
    // The old form of this line read "nothing writes a verdict back onto
    // testCases", which was true and was the defect: after E07-F02 the contract
    // wanted a verdict *and* a receipt, and no code path produced the first half,
    // so a real run could not make Testing green either (QA 6c38e0c7c620). The
    // half that has to keep holding is that no *client* writes one — that is what
    // keeps `Self-reported` meaningful — so the client half is asserted
    // unchanged and the server half is asserted beside it.
    expect(limit('L-01').subject).toBe('testing');
    expect(sorted(firestoreWriteKeys(src('hooks/useTestExecution.ts')))).not.toContain('testCases');
    expect(src('hooks/useTestGeneration.ts')).not.toMatch(/status:\s*'(Passed|Failed|Not run|Simulated)'/);
    // And the server writes both in one go: a receipt without the verdicts it
    // vouches for, or verdicts without the receipt that earns them, is a project
    // the phase contract cannot read honestly.
    //
    // Comments dropped line by line rather than through `src()`: the runner's
    // own prose contains `@sap-cloud-sdk/*` inside a `//` comment, and the
    // block-comment pass reads that `/*` as an opening and swallows the rest of
    // the file. A guard on a source it cannot see is a guard that passes for the
    // wrong reason.
    const runner = raw('app/api/run-tests/route.ts')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .join('\n');
    expect(runner, 'the runner no longer records the verdicts it observed').toContain(
      '{ testCases: executedCases, testRunReceipt: receipt }',
    );

    // L-02: a missing sign-off is not a delivery gap.
    const contract = src('lib/workflow-steps.ts');
    const gaps = balanced(contract, contract.indexOf('[', contract.indexOf('const gaps =')))!;
    expect(limit('L-02').subject).toBe('delivery');
    expect(gaps, 'a sign-off entered the delivery gaps — update L-02').not.toContain('approvedByArchitect');

    // L-03: both untracked artefacts really do leave in the bundle.
    const delivery = src('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(limit('L-03').subject).toBe('delivery');
    expect(delivery).toContain('project.testSuite.code');
    expect(delivery).toContain('project.businessDocumentation');

    // L-04 — resolved in 3.0.5 (Weg C). The limit stays in the register, marked
    // resolved, and what is asserted now is the fix: no slice, and the engine
    // builder reads the whole source.
    const l04 = register.knownLimits.find((l) => l.id === 'L-04') as { subject: string; status?: string; resolved?: { step?: string } };
    expect(l04.subject).toBe('documentation');
    expect(l04.status).toBe('resolved');
    expect(l04.resolved?.step).toBe('3.0.5');
    const docsPage = src('app/(app)/project/[projectId]/documentation/page.tsx');
    expect(docsPage, 'the documentation stage slices its input again — L-04 is back').not.toContain('.substring(0, 1000)');
    expect(docsPage).toContain("import('@/lib/process-documentation-build')");
    expect(src('lib/process-documentation-build.ts')).toContain('buildBusinessStatements(source)');

    // L-05: Analyze and Economics are still the two stages without a StaleNotice.
    const withoutNotice = register.stages.filter((s) => !src(s.page).includes('<StaleNotice')).map((s) => s.key);
    expect(limit('L-05').subject).toBe('analyze');
    expect(sorted(withoutNotice)).toEqual(['analyze', 'tco']);

    // L-06: design still has no blocker target and still generates by itself.
    expect(limit('L-06').subject).toBe('design');
    expect(register.stages.find((s) => s.key === 'design')!.preconditions.generationBlockersTarget).toBeNull();
    expect(src('app/(app)/project/[projectId]/design/page.tsx')).toContain('generateDesignRef.current(');

    // L-07: the run still carries a status that wins over the project's.
    expect(limit('L-07').subject).toBe('hydration');
    expect(src('app/api/runs/create/route.ts')).toContain("status: 'completed'");

    // L-09: no stage, no hook and no API route writes `presentation`.
    expect(limit('L-09').subject).toBe('rules');
    const writers = [
      ...register.stages.map((s) => stageSource(s)),
      src('app/api/runs/create/route.ts'),
      src('app/(app)/dashboard/page.tsx'),
    ];
    for (const text of writers) {
      expect(text, 'something writes `presentation` now — update L-09').not.toMatch(/\bpresentation:\s/);
    }

    // L-08: Economics is skipped by "continue" and can never be done.
    expect(limit('L-08').subject).toBe('economics');
    expect(contract).toContain("s.key !== 'tco'");
    const economics = contract.slice(contract.indexOf('const economics ='), contract.indexOf('const gaps ='));
    expect(economics.length).toBeGreaterThan(0);
    expect(economics, 'Economics can be done now — update L-08').not.toMatch(/state: 'done'/);
  });
});

/* ========================== 3. the reference cases against the emulator */

test.describe('the reference cases, seeded and opened', () => {
  test.describe.configure({ mode: 'serial' });

  const STAMP = Date.now();
  const EMAIL = `register-${STAMP}@cleancore-test.io`;
  // The `test-` prefix is the project's marker for a fixture, and the secret
  // scanner in `scripts/qa/lib/redact.mjs` reads it: without it, a 24-character
  // literal assigned to a name containing PASSWORD is a committed credential,
  // and the full review of v2.14.0 duly reported this line as `critical` —
  // "rotate the credential first". It was right about the shape and wrong about
  // the thing. The fixture carries the marker rather than the detector carrying
  // an exception for `tests/`, where a real pasted key should still be caught.
  const PASSWORD = 'test-preservation-register-emulator';
  const projectIdOf = (rc: ReferenceCase) => `${rc.id}-${STAMP}`;

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;

    await adminSetDoc('users', uid, {
      firstName: 'Preservation',
      lastName: 'Register',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      transformationsUsed: 1,
      transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION,
      createdAt: new Date(),
    });

    for (const rc of register.referenceCases) {
      const projectId = projectIdOf(rc);
      const { runId, project, run } = seedDocuments(rc, uid, projectId);
      await adminSetDoc('projects', projectId, project);
      await adminSetDoc(`projects/${projectId}/runs`, runId, run);
    }
  });

  async function signIn(page: Page) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.stop()).catch(() => {});
  }

  test('each stage opens on its reference case and reports what the register says', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await signIn(page);

    for (const rc of register.referenceCases) {
      const projectId = projectIdOf(rc);
      await page.goto(`/project/${projectId}/${rc.stage}`, { waitUntil: 'domcontentloaded' });

      const stepper = page.locator('nav[aria-label="Workflow phases"]');
      await stepper.waitFor({ timeout: 60000 });

      // The whole contract, on the screen, after the real hydration: seven
      // circles, each in the state the register predicted from the seed alone.
      for (const phase of PHASES) {
        await expect(
          stepper.locator(`[data-phase="${phase.key}"]`),
          `${rc.id}: ${phase.key} on the ${rc.stage} screen`,
        ).toHaveAttribute('data-phase-state', rc.expect.phaseStates[phase.key]);
      }
      await expect(stepper.locator(`[data-phase="${rc.stage}"]`)).toHaveAttribute('aria-current', 'step');

      const notice = page.locator('[data-stale-notice]');
      if (rc.expect.staleNoticeOnOwnStage) {
        await expect(notice, `${rc.id}: the stale notice is missing`).toBeVisible();
        const target = register.stages.find((s) => s.key === rc.stage)!.preconditions.generationBlockersTarget;
        if (target) {
          for (const reason of rc.expect.generationBlockers[target]) {
            await expect(notice, `${rc.id}: the notice does not say why`).toContainText(reason);
          }
        }
      } else {
        await expect(notice, `${rc.id}: an unexpected stale notice`).toHaveCount(0);
      }

      if (rc.expect.handoverDownloadsDisabled) {
        await expect(page.locator('[data-handover-bundle]')).toBeDisabled();
        await expect(page.locator('[data-handover-audit-pack]')).toBeDisabled();
      }
    }
  });

  /**
   * The step the layer above was missing: from the field name to the screen.
   *
   * The loop before this one proves the contract — stepper, stale notice,
   * handover controls. None of that is an output. A stage that stopped
   * rendering its own inventory, with a dead `.field` reference left behind to
   * satisfy the code layer, passed everything (QA review 96423cbf366f).
   *
   * Here every `shows` entry of every stage is looked at, and in both
   * directions: on screen when the seed carries the field, absent when it does
   * not — so an element that renders regardless of its value, which would make
   * the positive half meaningless, fails the negative half.
   */
  test('each stage shows the outputs the register attributes to it', async ({ page }) => {
    test.setTimeout(420 * 1000);
    await signIn(page);

    for (const stage of register.stages) {
      const rc = provingCase(stage);
      const projectId = projectIdOf(rc);
      const seed = seedDocuments(rc, 'uid-not-used-here', projectId);

      await page.goto(`/project/${projectId}/${stage.key}`, { waitUntil: 'domcontentloaded' });
      await page.locator('nav[aria-label="Workflow phases"]').waitFor({ timeout: 60000 });

      let proven = 0;
      for (const entry of stage.rendered.shows) {
        const element = page.locator(entry.locator).first();
        if (!seedCarries(seed, entry.field)) {
          await expect(
            page.locator(entry.locator),
            `${stage.key}: ${entry.field} is on screen although ${rc.id} carries none`,
          ).toHaveCount(0);
          continue;
        }
        if (entry.opensWith) {
          await page
            .getByRole('button', { name: new RegExp(entry.opensWith.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
            .first()
            .click();
        }
        await expect(
          element,
          `${stage.key}: ${entry.field} is not on the screen — ${entry.why}`,
        ).toBeVisible({ timeout: 30000 });
        if (entry.text) {
          const expected = resolveText(entry.text, seed);
          expect(expected, `${stage.key}: ${entry.field} resolved to nothing`).not.toContain('undefined');
          await expect(
            element,
            `${stage.key}: ${entry.field} is on screen but not with its own value`,
          ).toContainText(expected);
        }
        proven += 1;
      }
      expect(
        proven,
        `${stage.key}: ${rc.id} shows none of the stage's outputs — the rendered layer would prove nothing here`,
      ).toBeGreaterThan(0);
    }
  });
});
