/**
 * What the approver read, in a form the server can compare and a person can read.
 *
 * Roadmap 8.8, finding CR-11: *„Freigabe nicht an den Run gebunden"*. The
 * sign-off command named an architecture and nothing else, so the server bound
 * the decision to whatever `projects/{id}.activeRunId` happened to point at when
 * the request arrived. Two tabs are enough to make that the wrong run: read the
 * design of run A, let the other tab finish an analysis that becomes run B, sign
 * off — and the audit pack carries an architect's approval for evidence that
 * architect never saw. The transaction in the command route (0.7, QA review of
 * a19945ef01dc) already stops the *project* from moving between the decision and
 * the write; it cannot notice that the run moved before the request was sent.
 *
 * **Where the digest comes from, and why that is the whole point.** Every fact
 * below is read out of `projects/{projectId}/runs/{runId}` — the immutable run
 * document, which `firestore.rules:253-269` gives the owner `allow read` and
 * `allow write: if false`. Not one of them is taken from the project document,
 * whose `targetArchitecture`, `solutionDesign`, `extensibilityRoute` and the
 * rest the owner writes from the browser. A binding to something the approver
 * can rewrite is not a binding, and `lib/audit-pack-build.ts` made exactly this
 * distinction for the signed half of the audit pack: evidence from the run,
 * self-declarations attested beside it. This module is that boundary again, one
 * command further in.
 *
 * **Why the digest is legible rather than hashed.** A hash can only ever say
 * "different", and 8.8 asks for more than a 409: the approver has to learn
 * *what* changed since they read. So the digest is a short, ordered, canonical
 * line of named facts — `ev1|source=…|findings=…|route=…` — and a mismatch can
 * be reported as a field name and two values. It is still a digest in the sense
 * that matters here: `run=` carries the first twelve characters of `runHash`,
 * the sha256 the run signs itself with, so a change anywhere in the signed
 * payload moves the line even when none of the named facts does. What this is
 * not is a secret and not a signature — it detects movement, it does not
 * authenticate; the authentication is the run document itself, which the server
 * reads for every comparison.
 *
 * Pure on purpose, and free of imports like `lib/abap/abcd-classification.ts`:
 * the browser computes the same line from the run it rendered, the route
 * computes it from the run document inside the transaction, and a spec computes
 * it from a literal.
 */

/** Bumped when the fact list changes, so an older tab's line is recognisably old. */
export const EVIDENCE_DIGEST_VERSION = 'ev1';

/** A ceiling on what the route will even parse. Eight facts do not need more. */
export const EVIDENCE_DIGEST_MAX_CHARS = 1000;

/** How much of a sha256 goes into the line — the `fp12` of `lib/assessment-profile.ts`. */
const FINGERPRINT_CHARS = 12;

/** What a value says when the run does not carry the fact at all. */
export const NOT_RECORDED = 'not recorded';

export interface EvidenceFact {
  /** The key in the digest line. */
  key: string;
  /** What a person is shown instead of the key. */
  label: string;
  value: string;
}

/** One field, two values: the whole reason this is not a hash. */
export interface EvidenceChange {
  key: string;
  label: string;
  /** What the caller says it read. */
  read: string;
  /** What the run says now. */
  now: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `|` and `=` separate the line, so a value may not contain them, and a value
 * long enough to hide a structure is not a fact. Truncating rather than
 * refusing: a recommendation of 400 characters is odd, not hostile, and the
 * first 120 still identify it in a diff.
 */
function safeValue(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return NOT_RECORDED;
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : String(raw);
  const flat = text.replace(/[|=\r\n\t]+/g, ' ').trim();
  if (flat.length === 0) return NOT_RECORDED;
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

function shortHash(raw: unknown): string {
  return typeof raw === 'string' && raw.length > 0 ? safeValue(raw.slice(0, FINGERPRINT_CHARS)) : NOT_RECORDED;
}

/**
 * The facts, in a fixed order, out of a run document.
 *
 * `extensibilityRoute` is deliberately **not** among them although the run
 * carries one: `hydrate()` in `lib/project-loader.ts:18-20` lets the *project's*
 * copy win on that key, so a browser computing this line from the hydrated
 * project would be reading the owner-writable half. `originalRecommendation`
 * holds the same answer and is deleted off the project by `runs/create`
 * (`app/api/runs/create/route.ts`, the cleanup after the transaction), so the
 * hydrated value can only be the run's.
 */
export function evidenceFacts(run: unknown): EvidenceFact[] {
  const r = isObject(run) ? run : {};
  const fp = isObject(r.inputFingerprint) ? r.inputFingerprint : {};
  const findings = Array.isArray(r.evidenceReport) ? r.evidenceReport.length : undefined;
  return [
    { key: 'source', label: 'source fingerprint', value: shortHash(fp.sha256) },
    { key: 'lines', label: 'lines analysed', value: safeValue(fp.lineCount) },
    { key: 'findings', label: 'findings', value: safeValue(findings) },
    { key: 'route', label: 'recommended route', value: safeValue(r.originalRecommendation) },
    { key: 'rules', label: 'rule version', value: safeValue(r.rulesetVersion) },
    { key: 'catalog', label: 'catalog version', value: safeValue(r.sapApiCatalogVersion) },
    { key: 'engine', label: 'engine version', value: safeValue(r.analyzerVersion) },
    { key: 'run', label: 'run hash', value: shortHash(r.runHash) },
  ];
}

/** The canonical line. Same run, same string, on both sides of the request. */
export function evidenceDigest(run: unknown): string {
  return [EVIDENCE_DIGEST_VERSION, ...evidenceFacts(run).map((f) => `${f.key}=${f.value}`)].join('|');
}

/**
 * The line back into facts, or `null` when it is not one of ours.
 *
 * A line from a future version parses to `null` rather than to a partial set:
 * comparing `ev2` facts against `ev1` facts would produce a diff describing the
 * format rather than the evidence, and the honest answer to an unreadable claim
 * is that it is unreadable.
 */
export function parseEvidenceDigest(line: unknown): EvidenceFact[] | null {
  if (typeof line !== 'string' || line.length === 0 || line.length > EVIDENCE_DIGEST_MAX_CHARS) return null;
  const parts = line.split('|');
  if (parts[0] !== EVIDENCE_DIGEST_VERSION) return null;
  const labels = new Map(evidenceFacts({}).map((f) => [f.key, f.label]));
  const facts: EvidenceFact[] = [];
  for (const part of parts.slice(1)) {
    const at = part.indexOf('=');
    if (at <= 0) return null;
    const key = part.slice(0, at);
    if (!labels.has(key)) return null;
    facts.push({ key, label: labels.get(key) as string, value: part.slice(at + 1) });
  }
  return facts.length === labels.size ? facts : null;
}

/**
 * What moved between the line the caller read and the line the run carries now.
 *
 * The left column is the caller's own claim about its own screen — there is no
 * server-side copy of what a browser rendered, and inventing one by re-reading
 * the run the caller *names* would describe a run, not a screen. Nothing is
 * decided on it: the refusal is decided by comparing the caller's line with the
 * line the server computed from the project's active run, and a caller that
 * misreports its left column only misdescribes what it is being refused for.
 */
export function evidenceDiff(read: unknown, now: unknown): EvidenceChange[] {
  const before = parseEvidenceDigest(read);
  const after = parseEvidenceDigest(now);
  if (!before || !after) return [];
  const byKey = new Map(before.map((f) => [f.key, f.value]));
  const changes: EvidenceChange[] = [];
  for (const fact of after) {
    const was = byKey.get(fact.key);
    if (was !== undefined && was !== fact.value) {
      changes.push({ key: fact.key, label: fact.label, read: was, now: fact.value });
    }
  }
  return changes;
}

/**
 * The diff as one sentence fragment, for the refusal a person actually reads.
 *
 * Empty when nothing named moved — which is a real outcome, not a bug: the
 * `run=` fact can differ while every other one matches, because `runHash`
 * covers the whole signed payload including the narrative and the worklist.
 * The caller says so rather than printing nothing.
 */
export function describeEvidenceDiff(changes: EvidenceChange[]): string {
  if (changes.length === 0) return '';
  return changes.map((c) => `${c.label} ${c.read} → ${c.now}`).join('; ');
}
