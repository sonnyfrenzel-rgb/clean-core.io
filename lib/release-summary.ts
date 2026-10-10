import { APP_VERSION, APP_RELEASE_DATE_ISO } from '@/lib/version';
import { DECISION_OPTIONS, DECISION_OPTION_LABELS } from '@/lib/decision-options';

/**
 * What Clean-Core.io is as of the current release, and what 3.0 changed — once.
 *
 * Roadmap 3.0.8 (SEO/GEO after 3.0, item 4, decision Sonny 10.10.2026): answer
 * engines still answered with 2.x facts. Three readers take these two answers
 * from here and must not get three versions of them: `/facts`, `/llms.txt` and
 * the landing FAQ (`lib/landing-faq.ts`, which also feeds the FAQPage JSON-LD
 * and `/llms-full.txt`).
 *
 * Nothing in here goes stale on a release: the version and the date are read
 * from `lib/version.ts`, the decision options from `lib/decision-options.ts`.
 * The one typed date is the date 3.0.0 shipped, which is history and does not
 * move (`CHANGELOG.md`, the 3.0.0 entry of 2026-10-03).
 *
 * Every statement rests on the code or the changelog:
 *   - process as BPMN with line anchors, or the reason there is none —
 *     `lib/abap/process-skeleton.ts` (`anchor: NodeAnchor | null`, `unanchoredReason`);
 *   - Level A–D per SAP object under a versioned rule — `lib/abap/abcd-classification.ts`,
 *     `lib/abap/level-rule-version.ts`, `/method/levels`;
 *   - the four decision options in the Management view — `lib/decision-options.ts`;
 *   - Model proposal, not determined — `lib/provenance.ts`;
 *   - a run signed with HMAC — `app/api/runs/create/route.ts`; the audit pack with
 *     HMAC and Ed25519 — `lib/audit-pack.ts`, `/verify-pack`;
 *   - CAP tests against mocks in an isolated runner, RAP ABAP Unit result recorded from
 *     the user's own system — `hooks/useTestExecution.ts`.
 */

/** The release series the public texts speak of: "v3.0.x" for any 3.0 patch release. */
export const RELEASE_SERIES = APP_VERSION.replace(/^v(\d+)\.(\d+)\..*$/, 'v$1.$2.x');

/** The day 3.0.0 shipped (CHANGELOG.md). History — it does not follow the release. */
export const V3_RELEASE_DATE_ISO = '2026-10-03';

/** "keep, rebuild, move to SAP standard or retire" — the labels of lib/decision-options.ts, in a sentence. */
const decisionWords = (() => {
  const words = DECISION_OPTIONS.map((o) => {
    const label = DECISION_OPTION_LABELS[o];
    return label.charAt(0).toLowerCase() + label.slice(1);
  });
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
})();

/** The heading of the dated paragraph: "Clean-Core.io as of v3.0.x". */
export const AS_OF_TITLE = `Clean-Core.io as of ${RELEASE_SERIES}`;

/**
 * The dated paragraph: what the product is, as of the version that serves it.
 * Written to be quoted on its own — it names its subject and its date.
 */
export const AS_OF_PARAGRAPH =
  `As of ${APP_VERSION} (released ${APP_RELEASE_DATE_ISO}), Clean-Core.io is a free, independent web workspace for deciding what happens to one custom ABAP program. ` +
  'A deterministic engine reads the code before any language model does and reconstructs the business process as BPMN, with a line anchor on every element or the reason it has none, including the business rules hard-coded in the program. ' +
  'Every SAP object the code uses gets a Level A–D under a versioned rule, read from SAP’s published Cloudification Repository and object classification. ' +
  `On that evidence the Management view asks for one decision — ${decisionWords} — and Design, Transformation and Testing carry the same evidence to a target design, a code draft and test scenarios, each marked as a Model proposal for a person to review. ` +
  'Every completed analysis is stored as an immutable run signed by the server with HMAC; the audit pack exported from it is signed with HMAC and Ed25519, and its Ed25519 signature can be verified offline. ' +
  'What the engine could not determine is listed as not determined, not guessed.';

/** The question, as the landing FAQ, /facts and llms.txt ask it. */
export const WHAT_CHANGED_QUESTION = 'What changed in Clean-Core.io 3.0?';

/** The answer — from CHANGELOG.md, the 3.0.0 and 3.0.1 entries. */
export const WHAT_CHANGED_ANSWER =
  `Clean-Core.io 3.0, released ${V3_RELEASE_DATE_ISO}, gives every project one workspace, and the seven stages are no longer the product: they are tools inside it. ` +
  'A project opens on the business process reconstructed from its ABAP code as BPMN, shown in three views of the same facts — Business, IT and Management. A view orders what is shown; it changes no result and is never stored on a run or a signature. ' +
  `The Management view leads with the decision — ${decisionWords}. ` +
  'Also new in 3.0: a BPMN editor in which every save is an immutable revision and the reconstruction stays revision 1, with BPMN 2.0 XML files in and out and no connection to a Signavio workspace; documentation written from the engine’s reading of the code, no longer by a model reading only the start of it; and a demo project with a guided tour in every account. ' +
  `Sign-up and accounts did not change. The releases since then, up to ${APP_VERSION} (${APP_RELEASE_DATE_ISO}), refine 3.0; the release notes are in CHANGELOG.md of the public repository, github.com/sonnyfrenzel-rgb/clean-core.io.`;
