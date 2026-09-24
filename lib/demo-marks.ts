/**
 * How the demo is marked, and what it may never carry.
 *
 * Roadmap step 0.10 (`DESIGN.md` §6.1.2) puts one fully worked project in front
 * of every account so that the first click costs nothing. That project is not a
 * measurement of anybody's system: it is one starter example, analysed by the
 * engine that ships with this release. Which makes it the one artefact in the
 * product that a reader could mistake for evidence about their own code — and
 * the product's whole claim is that it says nothing the data does not support.
 *
 * So the marking is not decoration. Two rules, and both are executable rather
 * than written down and hoped for:
 *
 *  1. Every surface the demo reaches says "demo" in the same words. The strings
 *     live here once, so a screen cannot quietly drop the word while another
 *     keeps it.
 *
 *  2. The demo may not carry a field of the trust chain. `findTrustChainField`
 *     walks whatever the demo builder produced and names the first offender;
 *     `lib/demo-project.ts` calls it and throws, so a future edit that copies a
 *     `runHash` or a `userId` into the demo breaks the demo page instead of
 *     shipping a fabricated run. A signature is a statement that a named account
 *     analysed a named source at a named time. None of that happened here, and
 *     an unsigned demo is the only honest kind.
 *
 * Client-safe on purpose: `lib/demo-project.ts` reads the filesystem and runs
 * the ABAP engine, so the strings a browser component needs cannot live there.
 */

/** Where the demo lives. One route, one demo, for every account. */
export const DEMO_ROUTE = '/demo';

/**
 * The same demo in the 3.0 workspace, with its tour (roadmap 3.0.7). Behind the
 * workspace switch until 3.0, so it is linked only from screens behind it.
 */
export const DEMO_WORKSPACE_ROUTE = '/demo/workspace';

/** The eighth starter example — the case the 3.0 mockups are drawn around. */
export const DEMO_SOURCE_FILE = 'Z_MM_PO_APPROVAL.abap';
export const DEMO_OBJECT_NAME = 'Z_MM_PO_APPROVAL';
export const DEMO_SUBJECT = 'Emergency purchase approval';

/**
 * The prefix that keeps the demo from ever reading as somebody's own project.
 * An account that starts the same example itself gets a project called
 * `Z_MM_PO_APPROVAL`, without it (`DESIGN.md` §6.1.2).
 */
export const DEMO_TITLE_PREFIX = 'Demo · ';
export const DEMO_PROJECT_TITLE = `${DEMO_TITLE_PREFIX}${DEMO_OBJECT_NAME}`;

/** The tag on the list row. */
export const DEMO_TAG = 'Demo';
export const DEMO_LIST_TAGLINE = 'Fully worked example · fictitious code';

/** The message strip at the top of every demo screen. */
export const DEMO_STRIP_NOTICE =
  'Demo project — fully worked, fictitious code. Nothing you do here is saved.';

/** The recurring invitation. At most one per screen, never a dialog. */
export const DEMO_INVITATION = 'Try an example or your own code';

/**
 * Said on every demo screen, not only on the one where it would be missed.
 *
 * The demo is real engine output over a real file, which is exactly what makes
 * it dangerous: the findings, the line numbers and the score are the same ones a
 * paid run would produce, and nothing but this sentence separates the two.
 */
export const DEMO_UNSIGNED_NOTICE =
  'A demo run is never signed. No signed run, no audit pack and no export comes out of this screen — ' +
  'a signature says a named account analysed a named source, and none of that happened here.';

/** The demo costs nothing, because nothing about it reaches the server. */
export const DEMO_QUOTA_NOTICE =
  'Nothing here counts against your five free analyses: the demo is the same for every account, ' +
  'and what you change lives in this browser only.';

/** The browser key the demo's own state lives under. Cleared by "Reset demo". */
export const DEMO_STORAGE_KEY = 'cleancore.demo.v1';

/** The label of the control that throws that state away. */
export const DEMO_RESET_LABEL = 'Reset demo';

/**
 * Fields that mean "this happened, to this account, and here is the proof".
 *
 * A demo carrying any of them is a forgery whatever the banner above it says, so
 * the list is checked rather than remembered. Account fields are in it for the
 * second half of the rule: one demo for all accounts means the demo knows no
 * account, so a `userId` on it would be a copy per account by another name.
 */
export const TRUST_CHAIN_FIELDS: readonly string[] = [
  'activeRunId',
  'runId',
  'runHash',
  'runSignature',
  'signature',
  'signatureAlgorithm',
  'signedAt',
  'signingKeyId',
  'publicKey',
  'publicKeyId',
  'ed25519Signature',
  'hmacSignature',
  'manifest',
  'manifestVersion',
  'auditPack',
  'auditPackHash',
  'auditMetadata',
  'inputsHash',
  'packHash',
  'sealedAt',
  'chargedInputs',
  'approvalToken',
  'userId',
  'ownerUid',
  'uid',
  'email',
];

const TRUST_CHAIN_SET = new Set(TRUST_CHAIN_FIELDS.map((f) => f.toLowerCase()));

/**
 * The first trust-chain field anywhere in `value`, as a dotted path, or null.
 *
 * Recursive because the offending field is never at the top: it arrives nested
 * inside a finding, a manifest or a copied project document. Cycles are tracked
 * so a future caller cannot hang the demo page by handing in a graph.
 */
export function findTrustChainField(value: unknown, pathSoFar = '', seen = new WeakSet<object>()): string | null {
  if (!value || typeof value !== 'object') return null;
  if (seen.has(value as object)) return null;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findTrustChainField(value[i], `${pathSoFar}[${i}]`, seen);
      if (hit) return hit;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = pathSoFar ? `${pathSoFar}.${key}` : key;
    if (TRUST_CHAIN_SET.has(key.toLowerCase())) return here;
    const hit = findTrustChainField(child, here, seen);
    if (hit) return hit;
  }
  return null;
}
