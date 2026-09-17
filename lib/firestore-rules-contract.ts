/**
 * What `firestore.rules` says, as data — and the record of what is deployed.
 *
 * `firestore.rules` is deployed **by hand** (`npm run deploy:rules`) and never
 * by CI. That ordering is load-bearing: rules first, app second. Ship an app
 * change that *depends* on tightened rules before the rules are live and there
 * is a window in which the old rules are the ones answering; ship an app change
 * that depends on *widened* rules before the rules are live and the app is
 * simply broken in production, which is how this repository learned the rule in
 * the first place (CHANGELOG, "Empty Solution Design": the rules had never been
 * deployed to the named production database at all).
 *
 * This is not a hypothesis. On 16.09.2026, before this record existed, the rules
 * actually serving `cleancore-491216` were read back out of the Firebase Rules
 * API and turned out to be the ruleset released on **20 August 2026** — three
 * tightenings behind the repository, and nobody knew:
 *
 *   · V14, the consent fields: `termsVersionAccepted` and `termsAcceptedAt` were
 *     still client-writable in production, so a browser could assert its own
 *     Terms acceptance — the exact finding the repository had closed weeks ago.
 *   · the `email_events` lock, which keeps recipient addresses off clients.
 *   · the removal of the administrator's read on projects and runs (same day).
 *
 * Sonny deployed, and the release hash matched the working copy. The record
 * below starts from that verified moment, which is the only kind of moment in
 * which seeding a "last deployed" value is honest.
 *
 * So the repository keeps a record of the deployed text —
 * `docs/registers/rules-deployment.json` — and this module is the pair of
 * functions that read the file and the record the same way in every place that
 * asks: `scripts/rules-deploy.ts`, `tests/rules-deploy-order.spec.ts` and
 * `tests/project-command-boundary.spec.ts`.
 *
 * The record is the offline half. The online half is `npm run rules:verify`,
 * which asks production what it is actually serving; it needs the gcloud login
 * on a developer's machine and is deliberately **not** in CI, because CI must
 * not hold credentials that can touch rules. Offline can catch "the rules
 * changed and were not deployed"; only the online half catches "the record was
 * updated without a deploy", which is the mistake that hid the August drift.
 *
 * The hash is taken over the LF-normalised text, exactly as
 * `docs/registers/preservation-register.json` already does it, so the value is
 * the same on Windows and on CI and the two registers can be compared.
 */

export const RULES_FILE = 'firestore.rules';
export const RULES_DEPLOYMENT_RECORD = 'docs/registers/rules-deployment.json';

/** CRLF to LF, so a checkout on Windows hashes to the same value as CI. */
export function normaliseRulesText(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** The substring from `[` at `open` to its matching `]`, brackets included. */
function balanced(text: string, open: number): string | null {
  if (text[open] !== '[') return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '[') depth += 1;
    else if (text[i] === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * The fields a browser may write on `projects/{projectId}`, read out of the
 * rules text itself rather than out of a comment about it.
 */
export function parseClientWritableProjectFields(rulesText: string): string[] {
  const text = normaliseRulesText(rulesText);
  const at = text.indexOf('affectedKeys().hasOnly(');
  if (at === -1) throw new Error('firestore.rules: the client-writable project allowlist is gone.');
  const list = balanced(text, text.indexOf('[', at));
  if (list === null) throw new Error('firestore.rules: the client-writable project allowlist is not a closed list.');
  return [...list.matchAll(/'([A-Za-z_]\w*)'/g)].map((m) => m[1]).sort();
}

/** Full-line `//` comments removed, which is the only comment form this file uses. */
function stripLineComments(text: string): string {
  return text.replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * The read rule of `projects/{projectId}`, as one collapsed line.
 *
 * The allowlist above answers "what may a browser *write*", and until roadmap
 * 5.4 that was the only half of the file an app change ever depended on. 5.4
 * depends on the other half: an invited reader can read a project only once the
 * widened *read* rule is live, and a record that tracks write fields alone
 * would have called that change "nothing to deploy". So the read rule is
 * recorded verbatim, the way it is written, and a change to it is visible.
 */
export function parseProjectReadRule(rulesText: string): string {
  const text = stripLineComments(normaliseRulesText(rulesText));
  const at = text.indexOf('match /projects/{projectId} {');
  if (at === -1) throw new Error('firestore.rules: the /projects/{projectId} block is gone.');
  const readAt = text.indexOf('allow read:', at);
  if (readAt === -1) throw new Error('firestore.rules: /projects/{projectId} has no read rule.');
  const end = text.indexOf(';', readAt);
  if (end === -1) throw new Error('firestore.rules: the read rule of /projects/{projectId} is not terminated.');
  return text.slice(readAt, end + 1).replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------- deployment record */

export interface RulesDeploymentRecord {
  schemaVersion: number;
  file: string;
  howToDeploy: string;
  deployed: {
    sha256OfLfNormalisedText: string;
    deployedAt: string;
    deployedBy: string;
    project: string;
    databases: string[];
    /** The ruleset the Firebase Rules API named at the time of the record. */
    rulesetName?: string;
    /** The client-writable project allowlist of the text that is live. */
    clientWritableProjectFields: string[];
    /**
     * The read rule of `projects/{projectId}` as the live text writes it.
     * Optional so that a record written before roadmap 5.4 still parses.
     */
    projectDocumentReadRule?: string;
  };
  /**
   * Present only while the working copy differs from what is deployed. The
   * check refuses a pending change that *adds* to the client allowlist: that is
   * the direction in which the app depends on rules that are not live yet.
   */
  pending?: {
    sha256OfLfNormalisedText: string;
    recordedAt: string;
    recordedFor: string;
    addsToClient: string[];
    removesFromClient: string[];
    /**
     * The read rule of `projects/{projectId}` in the working copy, when it
     * differs from the deployed one. Roadmap 5.4 is the first change whose app
     * half depends on a widened *read* rather than a widened write, and a
     * record that only listed write fields would have described it as no change
     * at all.
     */
    projectDocumentReadRule?: string;
    note: string;
  };
}

/**
 * Which way round the two texts are out of step. "The rules changed and were
 * not deployed" and "the record was updated without a deploy" are different
 * mistakes with different fixes, and a check that says only "mismatch" sends
 * the reader to the wrong one.
 */
export type RulesDeploymentDirection =
  /** The record, the working copy and (as far as this half can tell) production agree. */
  | 'in-sync'
  /** The working copy is ahead, and says so: deploy it. */
  | 'rules-changed-not-deployed'
  /** The working copy is ahead and nobody wrote it down: record it, then deploy. */
  | 'rules-changed-unrecorded'
  /** The record claims a change the file no longer has: the record is stale, not the rules. */
  | 'record-ahead-of-file';

export interface RulesDeploymentVerdict {
  ok: boolean;
  /** One line per problem, in the order they should be fixed. */
  problems: string[];
  /** True while the working copy has not been deployed. */
  pending: boolean;
  direction: RulesDeploymentDirection;
  /**
   * True when the working copy's read rule for `projects/{projectId}` is not
   * the one the record says is live. It does not by itself make the verdict
   * fail — a read rule that only *narrows* is the same safe direction as a
   * write field being taken away — but it is the one thing a reader of
   * `npm run rules:check` has to see, because an app half that depends on a
   * widened read is broken in production until the deploy.
   */
  readRuleChanged: boolean;
}

/**
 * The whole check, as a pure function of the two texts.
 *
 * It answers three questions, and only the third can fail because somebody
 * forgot to deploy:
 *
 *   1. Is the record current? A record that names neither the deployed nor the
 *      working text is a record of nothing.
 *   2. Do the recorded field lists agree with the two texts they describe?
 *   3. Does the app depend on rules that are not live? A pending change that
 *      only *removes* client-writable fields does not — the server route is the
 *      writer either way, and the old rules are merely looser than they need to
 *      be. A pending change that *adds* one does, and fails here.
 */
export function checkRulesDeployment(
  workingCopy: string,
  record: RulesDeploymentRecord,
  sha256: (text: string) => string,
): RulesDeploymentVerdict {
  const problems: string[] = [];
  const text = normaliseRulesText(workingCopy);
  const hash = sha256(text);
  const fields = parseClientWritableProjectFields(text);
  const pendingBlock = record.pending;
  const pending = hash !== record.deployed.sha256OfLfNormalisedText;
  // A text this function cannot find a read rule in is not its business to
  // reject — it compares two texts, and `parseProjectReadRule` throwing here
  // would turn every other check in the file into "the parser was unhappy".
  let readRule: string | null = null;
  try {
    readRule = parseProjectReadRule(text);
  } catch {
    readRule = null;
  }
  const readRuleChanged =
    readRule !== null &&
    record.deployed.projectDocumentReadRule !== undefined &&
    record.deployed.projectDocumentReadRule !== readRule;

  if (!pending) {
    if (pendingBlock) {
      problems.push(
        `RECORD AHEAD OF FILE — ${RULES_DEPLOYMENT_RECORD} carries a "pending" block, but ${RULES_FILE} is already the deployed text. The record is stale, not the rules: clear it with \`npm run rules:record -- --deployed\`. (It does NOT mean a deploy is owed.)`,
      );
    }
    const sorted = [...record.deployed.clientWritableProjectFields].sort();
    if (sorted.join(',') !== fields.join(',')) {
      problems.push(
        `${RULES_DEPLOYMENT_RECORD}: deployed.clientWritableProjectFields does not match ${RULES_FILE} — expected ${fields.join(', ')}.`,
      );
    }
    if (readRuleChanged) {
      problems.push(
        `${RULES_DEPLOYMENT_RECORD}: deployed.projectDocumentReadRule does not match ${RULES_FILE} — expected ${readRule}`,
      );
    }
    return {
      ok: problems.length === 0,
      problems,
      pending: false,
      direction: pendingBlock ? 'record-ahead-of-file' : 'in-sync',
      readRuleChanged,
    };
  }

  if (!pendingBlock) {
    problems.push(
      `RULES CHANGED, NOT DEPLOYED, NOT RECORDED — ${RULES_FILE} differs from the text ${RULES_DEPLOYMENT_RECORD} says is live, and nothing says why. Deploy with \`npm run deploy:rules\` (which records it), or, if the deploy has to wait, write it down with \`npm run rules:record -- --pending "<why>"\`.`,
    );
    return { ok: false, problems, pending: true, direction: 'rules-changed-unrecorded', readRuleChanged };
  }

  if (pendingBlock.sha256OfLfNormalisedText !== hash) {
    problems.push(
      `${RULES_DEPLOYMENT_RECORD}: the "pending" hash is ${pendingBlock.sha256OfLfNormalisedText.slice(0, 12)}…, ${RULES_FILE} hashes to ${hash.slice(0, 12)}… — re-record it.`,
    );
  }

  const deployedFields = new Set(record.deployed.clientWritableProjectFields);
  const nowFields = new Set(fields);
  const added = fields.filter((f) => !deployedFields.has(f)).sort();
  const removed = [...deployedFields].filter((f) => !nowFields.has(f)).sort();

  if (added.join(',') !== [...pendingBlock.addsToClient].sort().join(',')) {
    problems.push(`${RULES_DEPLOYMENT_RECORD}: pending.addsToClient should be [${added.join(', ')}].`);
  }
  if (removed.join(',') !== [...pendingBlock.removesFromClient].sort().join(',')) {
    problems.push(`${RULES_DEPLOYMENT_RECORD}: pending.removesFromClient should be [${removed.join(', ')}].`);
  }
  if (added.length > 0) {
    problems.push(
      `RULES CHANGED AND WERE NOT DEPLOYED — the app depends on them: ${added.join(', ')} ${added.length === 1 ? 'is' : 'are'} client-writable only in the undeployed ${RULES_FILE}. Deploy first — \`npm run deploy:rules\` — then ship the app.`,
    );
  }
  // A changed read rule has to be written down in the same breath as the
  // change. Not writing it down is the failure; writing it down is not,
  // because narrowing a read is as safe to sit pending as taking a write field
  // away. Which of the two it is, the two lines say for themselves.
  if (readRuleChanged && pendingBlock.projectDocumentReadRule !== readRule) {
    problems.push(
      `${RULES_DEPLOYMENT_RECORD}: the read rule of /projects/{projectId} changed and the "pending" block does not say so. Record it — pending.projectDocumentReadRule should be ${readRule}`,
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    pending: true,
    direction: 'rules-changed-not-deployed',
    readRuleChanged,
  };
}
