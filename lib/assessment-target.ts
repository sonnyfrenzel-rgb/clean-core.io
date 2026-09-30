/**
 * The target profile, wired — roadmap 7.10 (CR-02), the step after the model.
 *
 * `lib/assessment-profile.ts` says what a profile is, when it is covered and
 * how a profile becomes a signed input. It deliberately did not say where the
 * facts come from. This file does, for the five stations the roadmap names:
 *
 *   1. **Analysis** — `/api/runs/create` builds the profile with
 *      `buildAssessmentProfile()` from the edition (`s4Deployment`), what the
 *      owner declared (`AssessmentTarget`: release, component levels, the ABAP
 *      language version per object), the catalog snapshot the engine actually
 *      read and the rule version. A rejected profile gets no run.
 *   2. **Catalog lookup** — the snapshot is `getCatalogSnapshotRef()` of
 *      `lib/abap/catalog-service.ts`: registry key *and* the digest of the file
 *      SAP served, so `latest` a month apart is two snapshots, not one.
 *   3. **Result** — the run carries the profile, the coverage (`state` and the
 *      gap codes) and the subject hash inside its signed payload.
 *   4. **Decision** — `liveProfileRevision()` rebuilds the profile from what
 *      the project says *now*; a sign-off or a decision whose run was assessed
 *      under another profile is refused (`profile-changed`, 409), and the
 *      manifest comparison of 0.6 marks the run's inputs unverified.
 *   5. **Receipt** — the signed audit pack carries the manifest entry
 *      `profile:assessment`, whose revision begins with `unconfirmed:` when the
 *      coverage was not complete, and the profile record itself.
 *
 * What the owner declares is kept apart from what the server derives. The
 * owner can say "release 2023 FPS02" and "ZCL_FOO is ABAP for Cloud
 * Development"; the owner cannot say which catalog was read or which rule
 * version graded — those come from the build.
 *
 * Pure: no React, no Firestore, no `node:crypto`. The browser rebuilds the live
 * revision from the same function the server uses, like `lib/input-manifest.ts`.
 */

import {
  LANGUAGE_VERSIONS,
  PROFILE_GAP_CODES,
  PROFILE_INPUT_ID,
  PROFILE_VERSION,
  assessmentSubjectHash,
  profileCoverage,
  profileRevision,
  type AbapLanguageVersion,
  type AssessmentProfile,
  type CatalogSnapshotRef,
  type ComponentLevel,
  type ObjectLanguageVersion,
  type ProfileCoverageState,
  type ProfileGapCode,
  type ProfileGapSeverity,
} from './assessment-profile';
import { referenceDigest } from './input-manifest';

/* ---------- what the owner declares ---------- */

/**
 * The part of the profile only the owner can know. Stored on the project by
 * `/api/runs/create` (Admin SDK) — not client-writable, so it changes only
 * together with a run, and a run that changes it is a new subject.
 */
export interface AssessmentTarget {
  /** e.g. `2023 FPS02`, `2508`, `PCE-2025-1`. Empty when not named. */
  release: string;
  components: ComponentLevel[];
  /** Only for objects the source defines; anything else is dropped at build time. */
  languageVersions: ObjectLanguageVersion[];
}

export const EMPTY_ASSESSMENT_TARGET: AssessmentTarget = { release: '', components: [], languageVersions: [] };

/** Ceilings — the profile is inside a signed payload, and a declaration is not a document. */
export const TARGET_LIMITS = {
  releaseChars: 40,
  components: 40,
  componentChars: 30,
  levelChars: 40,
  objects: 200,
  objectChars: 40,
} as const;

/**
 * A value that enters the canonical form must not carry its separators
 * (`|`, `,`, `:`, `=`, `@`, `#`, `+`, `/`). Letters, digits, space, dot,
 * underscore and hyphen are every release and SP level SAP names.
 */
const SAFE_VALUE = /^[A-Za-z0-9 ._-]*$/;
/** Repository object names: upper case, digits, underscore, and the namespace slash. */
const OBJECT_NAME = /^[A-Z0-9_/]+$/;

/**
 * Code-unit order, the order `Array.prototype.sort()` and the canonical form
 * use - not the runtime's locale order, which the browser and the server need
 * not share.
 */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type TargetParse = { ok: true; target: AssessmentTarget } | { ok: false; error: string };

/**
 * Read a declaration the way the server has to: a closed key set, closed
 * vocabularies, ceilings, and a sentence saying what is wrong. `undefined` and
 * `null` are "nothing declared", which is valid and leaves every fact open.
 */
export function normaliseAssessmentTarget(raw: unknown): TargetParse {
  if (raw === undefined || raw === null) return { ok: true, target: { ...EMPTY_ASSESSMENT_TARGET } };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'targetProfile must be an object.' };
  const r = raw as Record<string, unknown>;

  const release = r.release === undefined || r.release === null ? '' : r.release;
  if (typeof release !== 'string') return { ok: false, error: 'targetProfile.release must be text.' };
  const rel = release.trim().replace(/\s+/g, ' ');
  if (rel.length > TARGET_LIMITS.releaseChars) {
    return { ok: false, error: `The release is longer than ${TARGET_LIMITS.releaseChars} characters.` };
  }
  if (!SAFE_VALUE.test(rel)) {
    return { ok: false, error: 'The release may contain letters, digits, spaces, dots, hyphens and underscores only.' };
  }

  const comps = r.components === undefined || r.components === null ? [] : r.components;
  if (!Array.isArray(comps)) return { ok: false, error: 'targetProfile.components must be a list.' };
  if (comps.length > TARGET_LIMITS.components) {
    return { ok: false, error: `At most ${TARGET_LIMITS.components} component levels can be declared.` };
  }
  const components: ComponentLevel[] = [];
  const seenComponents = new Set<string>();
  for (const c of comps) {
    if (!c || typeof c !== 'object') return { ok: false, error: 'A component level is { component, level }.' };
    const component = String((c as Record<string, unknown>).component ?? '').trim().toUpperCase();
    const level = String((c as Record<string, unknown>).level ?? '').trim().replace(/\s+/g, ' ');
    if (!component || component.length > TARGET_LIMITS.componentChars || !OBJECT_NAME.test(component)) {
      return { ok: false, error: `"${component.slice(0, 40)}" is not a software component name.` };
    }
    if (!level || level.length > TARGET_LIMITS.levelChars || !SAFE_VALUE.test(level)) {
      return { ok: false, error: `The level of ${component} is empty or contains characters a level does not have.` };
    }
    if (seenComponents.has(component)) return { ok: false, error: `${component} is declared twice.` };
    seenComponents.add(component);
    components.push({ component, level });
  }

  const langs = r.languageVersions === undefined || r.languageVersions === null ? [] : r.languageVersions;
  if (!Array.isArray(langs)) return { ok: false, error: 'targetProfile.languageVersions must be a list.' };
  if (langs.length > TARGET_LIMITS.objects) {
    return { ok: false, error: `At most ${TARGET_LIMITS.objects} language versions can be declared.` };
  }
  const languageVersions: ObjectLanguageVersion[] = [];
  const seenObjects = new Set<string>();
  for (const l of langs) {
    if (!l || typeof l !== 'object') return { ok: false, error: 'A language version is { object, languageVersion }.' };
    const object = String((l as Record<string, unknown>).object ?? '').trim().toUpperCase();
    const languageVersion = (l as Record<string, unknown>).languageVersion;
    if (!object || object.length > TARGET_LIMITS.objectChars || !OBJECT_NAME.test(object)) {
      return { ok: false, error: `"${object.slice(0, 40)}" is not an object name.` };
    }
    if (typeof languageVersion !== 'string' || !(LANGUAGE_VERSIONS as readonly string[]).includes(languageVersion)) {
      return { ok: false, error: `The language version of ${object} must be one of ${LANGUAGE_VERSIONS.join(', ')}.` };
    }
    if (seenObjects.has(object)) return { ok: false, error: `${object} is declared twice.` };
    seenObjects.add(object);
    languageVersions.push({ object, languageVersion: languageVersion as AbapLanguageVersion });
  }

  components.sort((a, b) => byCodeUnit(a.component, b.component));
  languageVersions.sort((a, b) => byCodeUnit(a.object, b.object));
  return { ok: true, target: { release: rel, components, languageVersions } };
}

/**
 * The repository objects a source defines — the objects a language version is
 * a property of.
 *
 * Read from the code inventory (`extractCodeInventory`), whose names the caller
 * passes in, so this file stays free of the ABAP reader. Local classes and
 * interfaces (`LCL_`, `LTC_`, `LTH_`, `LIF_`) share the language version of the
 * program they live in and are not objects of their own; form routines and
 * includes are not either. A local class that does not follow the naming
 * convention is listed — conservatively, because it then reads *unknown* and
 * never quietly *standard*.
 */
export function repositoryObjectsOf(inventory: ReadonlyArray<{ objectName?: unknown; type?: unknown }>): string[] {
  const kinds = new Set(['Class', 'Report', 'Function Module', 'Interface']);
  const out = new Set<string>();
  for (const item of inventory) {
    const name = typeof item.objectName === 'string' ? item.objectName.trim().toUpperCase() : '';
    const type = typeof item.type === 'string' ? item.type : '';
    if (!name || !kinds.has(type)) continue;
    if (/^(LCL|LTC|LTH|LIF)_/.test(name)) continue;
    if (name.length > TARGET_LIMITS.objectChars || !OBJECT_NAME.test(name)) continue;
    out.add(name);
  }
  return [...out].sort().slice(0, TARGET_LIMITS.objects);
}

/* ---------- the profile a run is assessed against ---------- */

/**
 * The profile, from its two halves. Every object the source defines gets a
 * language version: the declared one, or `unknown` — never a default.
 * Declarations for objects the source does not define are not part of this
 * subject and are dropped.
 */
export function buildAssessmentProfile(args: {
  edition: string;
  target: AssessmentTarget;
  objects: ReadonlyArray<string>;
  catalogSnapshot: CatalogSnapshotRef;
  ruleVersion: string;
}): AssessmentProfile {
  const declared = new Map(args.target.languageVersions.map((l) => [l.object.toUpperCase(), l.languageVersion]));
  const objects = [...new Set(args.objects.map((o) => o.toUpperCase()))].sort();
  return {
    profileVersion: PROFILE_VERSION,
    edition: args.edition as AssessmentProfile['edition'],
    release: args.target.release,
    components: [...args.target.components].sort((a, b) => byCodeUnit(a.component, b.component)),
    catalogSnapshot: { registryKey: args.catalogSnapshot.registryKey, sourceSha256: args.catalogSnapshot.sourceSha256 },
    ruleVersion: args.ruleVersion,
    languageVersions: objects.map((object) => ({ object, languageVersion: declared.get(object) ?? 'unknown' })),
  };
}

/** The coverage as the run stores it: state and gap codes. Sentences are derived when shown. */
export interface RecordedProfileCoverage {
  state: ProfileCoverageState;
  gaps: { code: ProfileGapCode; severity: ProfileGapSeverity; subject: string | null }[];
}

export function coverageRecord(profile: AssessmentProfile): RecordedProfileCoverage {
  const c = profileCoverage(profile);
  return { state: c.state, gaps: c.gaps.map((g) => ({ code: g.code, severity: g.severity, subject: g.subject })) };
}

/** Everything the signed run records about its profile, in one place. */
export interface RunProfileRecord {
  assessmentProfile: AssessmentProfile;
  profileCoverage: RecordedProfileCoverage;
  /** `assessmentSubjectHash()` — the source under this profile. */
  assessmentSubject: string;
}

export function runProfileRecord(profile: AssessmentProfile, sourceSha256: string): RunProfileRecord {
  return {
    assessmentProfile: profile,
    profileCoverage: coverageRecord(profile),
    assessmentSubject: assessmentSubjectHash({ sourceSha256, profile }),
  };
}

/* ---------- reading it back ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The profile a run recorded, or `null` for a run signed before 7.10 — or one
 * whose record does not read as a profile. `null` is not "covered" and not
 * "rejected": it is *not recorded*, and the reader says so (`lib/legacy-project.ts`).
 */
export function recordedProfileOf(run: unknown): AssessmentProfile | null {
  if (!isObj(run)) return null;
  const p = run.assessmentProfile;
  if (!isObj(p) || p.profileVersion !== PROFILE_VERSION) return null;
  const snap = p.catalogSnapshot;
  if (typeof p.edition !== 'string' || typeof p.release !== 'string' || typeof p.ruleVersion !== 'string') return null;
  if (!isObj(snap) || typeof snap.registryKey !== 'string' || typeof snap.sourceSha256 !== 'string') return null;
  if (!Array.isArray(p.components) || !Array.isArray(p.languageVersions)) return null;
  return p as unknown as AssessmentProfile;
}

/** The recorded coverage, re-derived from the recorded profile — the stored codes are a copy, not the authority. */
export function recordedCoverageOf(run: unknown): ReturnType<typeof profileCoverage> | null {
  const p = recordedProfileOf(run);
  return p ? profileCoverage(p) : null;
}

/** Whether a stored gap code is one this build knows — a reader never renders a code it cannot explain. */
export function isKnownGapCode(code: unknown): code is ProfileGapCode {
  return typeof code === 'string' && (PROFILE_GAP_CODES as readonly string[]).includes(code);
}

/**
 * The target a project declares now, or the empty declaration. Read from the
 * Admin-written `assessmentTarget`; anything that does not parse is treated as
 * nothing declared — which leaves every fact open (unconfirmed), never covered.
 */
export function declaredTargetOf(project: unknown): AssessmentTarget {
  const raw = isObj(project) ? project.assessmentTarget : undefined;
  const parsed = normaliseAssessmentTarget(raw);
  return parsed.ok ? parsed.target : { ...EMPTY_ASSESSMENT_TARGET };
}

/**
 * The profile the project stands on *now*, rebuilt against a recorded one.
 *
 * The edition and the declaration come from the project; the object list from
 * the recorded profile (the source is compared on its own, as `source:abap`);
 * the catalog snapshot from `catalogSnapshot` when the caller can read the live
 * catalog (the server) and from the recorded profile otherwise (the browser —
 * the catalog is the server's to compare, like `catalog:sap-api`); the rule
 * version always from the recorded profile, as `ruleset:clean-core` does.
 *
 * `null` when the project names no edition: an input that cannot be read is
 * unverified, never assumed.
 */
export function liveProfileOf(args: {
  project: unknown;
  recorded: AssessmentProfile;
  catalogSnapshot?: CatalogSnapshotRef | null;
}): AssessmentProfile | null {
  const p = isObj(args.project) ? args.project : {};
  const edition = typeof p.s4Deployment === 'string' && p.s4Deployment ? p.s4Deployment : null;
  if (!edition) return null;
  return buildAssessmentProfile({
    edition,
    target: declaredTargetOf(p),
    objects: args.recorded.languageVersions.map((l) => l.object),
    catalogSnapshot: args.catalogSnapshot ?? args.recorded.catalogSnapshot,
    ruleVersion: args.recorded.ruleVersion,
  });
}

/** `liveProfileOf` as the manifest digest `unverifiedInputs()` compares, or `null`. */
export function liveProfileDigest(args: Parameters<typeof liveProfileOf>[0]): string | null {
  const live = liveProfileOf(args);
  return live ? referenceDigest(PROFILE_INPUT_ID, profileRevision(live)) : null;
}

/**
 * Why a decision on this run would be a decision under a different profile —
 * or `null` when it would not.
 *
 * `null` too for a run that recorded no profile: such a run is *labelled* as
 * signed before 7.10, not reinterpreted, and its deployment is compared as it
 * always was (`target:s4-deployment`).
 */
export function profileDrift(args: Parameters<typeof liveProfileOf>[0]): { recorded: string; now: string } | null {
  const recorded = profileRevision(args.recorded);
  const live = liveProfileOf(args);
  const now = live ? profileRevision(live) : 'not readable';
  return now === recorded ? null : { recorded, now };
}

/** One line for a reader: `private @ 2023 FPS02 · catalog latest@407843e4 · rules-v1.0`. */
export function profileSummaryLine(profile: AssessmentProfile): string {
  const release = profile.release || 'release not named';
  return `${profile.edition} @ ${release} · catalog ${profile.catalogSnapshot.registryKey}@${profile.catalogSnapshot.sourceSha256.slice(0, 8)} · ${profile.ruleVersion}`;
}
