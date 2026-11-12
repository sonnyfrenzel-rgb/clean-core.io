/**
 * SAP reference pattern for the target — roadmap 3.0.9, ADR-089.
 *
 * A static, hand-curated mapping from each target architecture code
 * (`TargetArchitectureCode`, `lib/project-commands.ts`) and each building block
 * of `cloudServiceDetails` (`components/design/CloudServiceIntegrations.tsx`) to
 * the matching reference architecture (RA) of the SAP Architecture Center
 * (https://github.com/SAP/architecture-center, Apache-2.0), in the style of
 * `lib/abap/support-matrix.ts`: one object, read by every place that shows it.
 *
 * What it is and is not:
 *   - It names the pattern SAP documents for the **kind of target** — never a
 *     statement by SAP about the reader's code, and never a reason for the
 *     route. Evidence → route → target → reference: this layer reads the
 *     target and changes nothing before it. It is not imported by the router,
 *     `routeDrivers()` or the score (`tests/sap-reference-architectures.spec.ts`
 *     holds that).
 *   - No model chooses, summarises or writes an RA ID. Every binding here was
 *     written by hand and checked against the repository on `VERIFIED_AT`.
 *   - Where SAP has no pattern, the binding says so (`fit: 'none'`) with the
 *     reason — `rap`, `keep`, `retire`, `standard` and the in-app blocks.
 *   - It is not in the signed files of the audit pack: there the target is a
 *     user-attested statement, and the reference may only stand beside it,
 *     like the Level A–D grade.
 *
 * The metadata of each RA (slug, title, last update, archive state) is copied
 * here by hand from `lib/generated/sap-architecture-center.json`, which
 * `scripts/sync-sap-architecture-center.ts` writes; the spec fails the day the
 * two disagree, so a moved, retitled or archived RA is reviewed, not missed.
 *
 * **Only current RAs (owner decision 10.10.2026).** An archived RA (tag
 * `archive`, shown on the page as "This content has been archived … should not be
 * relied on as current guidance") is never named here: where only archived ones
 * fit, the binding is `none` with a reason that is true today. The synced metadata
 * keeps the archive state, and the spec fails the day a binding points at an
 * archived RA. On 09.10.2026 SAP archived 18 RAs, among them every RA that fitted
 * `cap`, `integration`, `xsuaa`, `iamRoles` and `destination` (RA0007, RA0018,
 * RA0019, RA0021, RA0022) and the delivery pattern (RA0023, found by the sync of
 * 17.10.2026). On 27.10.2026 SAP restored RA0019, RA0021, RA0022, RA0023 and
 * RA0025 (sync of 09.11.2026); owner decision 12.11.2026 applies the same rule to
 * that state, so their bindings are named again. RA0007 and RA0018 are still
 * archived, so `cap` stays `none`.
 *
 * Wording is fixed: "SAP reference pattern for the target". Never "approved",
 * "certified", "validated" or "compliant" — the text guard in the spec fails on
 * those words near an RA reference — and no SAP logo.
 */
import type { TargetArchitectureCode } from '@/lib/project-commands';
import type { CloudServiceKey } from '@/lib/cloud-service-key';

export { CLOUD_SERVICE_KEYS, type CloudServiceKey } from '@/lib/cloud-service-key';

/** The day every binding and every RA's metadata below was checked against the repository. */
export const VERIFIED_AT = '2026-11-12';

/** The repository, branch and commit the bindings were checked against. */
export const ARCHITECTURE_CENTER_SOURCE = {
  repository: 'https://github.com/SAP/architecture-center',
  branch: 'dev',
  commit: '7e0f9af938a89ee2cbf4aac12aa77d78bf644e22',
  license: 'Apache-2.0',
} as const;

/** The fixed name of what this layer shows. */
export const REFERENCE_WORDING = 'SAP reference pattern for the target';

/** The fixed lead of the one line in the Business and Management views. */
export const REFERENCE_LINE_LEAD = 'SAP-documented pattern for this target';

export const ARCHITECTURE_CENTER_BASE = 'https://architecture.learning.sap.com/docs/ref-arch/';

/** The RAs this mapping names. Only these — never one that is not in the synced metadata. */
export type SapRaId = 'RA0001' | 'RA0019' | 'RA0021' | 'RA0022' | 'RA0023';

export interface SapReferenceArchitecture {
  id: SapRaId;
  /** The short ID SAP's site uses in the address: `/docs/ref-arch/{slug}`. */
  slug: string;
  title: string;
  /** `last_update.date` of the RA's front matter. */
  lastUpdate: string;
  /** SAP has tagged the RA `archive`. Always `false` here — an archived RA is never named (ADR-089); the spec holds it. */
  archived: boolean;
}

export const SAP_REFERENCE_ARCHITECTURES: Readonly<Record<SapRaId, SapReferenceArchitecture>> = Object.freeze({
  RA0001: { id: 'RA0001', slug: '196eba', title: 'Designing Event-Driven Applications on SAP BTP', lastUpdate: '2025-10-10', archived: false },
  RA0019: { id: 'RA0019', slug: '89ab6b', title: 'SAP IAM integration with SAP Cloud Identity Services', lastUpdate: '2026-10-27', archived: false },
  RA0021: { id: 'RA0021', slug: '6501d5', title: 'App2App Integration with SAP Integration Suite', lastUpdate: '2026-10-28', archived: false },
  RA0022: { id: 'RA0022', slug: '5f90af', title: 'API Managed Integration with SAP Integration Suite', lastUpdate: '2026-10-26', archived: false },
  RA0023: { id: 'RA0023', slug: 'b51e91', title: 'DevOps on SAP BTP with CI/CD and SAP Build', lastUpdate: '2026-10-28', archived: false },
});

export type ReferenceFit = 'direct' | 'partial' | 'none';

export interface ReferenceBinding {
  /** `null` exactly when `fit` is `none`. */
  ra: SapRaId | null;
  fit: ReferenceFit;
  /** One sentence: why this RA — or why there is none. */
  why: string;
  /** When we checked this binding. */
  verifiedAt: string;
}

const bind = (ra: SapRaId | null, fit: ReferenceFit, why: string): ReferenceBinding =>
  Object.freeze({ ra, fit, why, verifiedAt: VERIFIED_AT });

const NO_IN_APP_PATTERN =
  'The Architecture Center does not cover in-app ABAP Cloud, RAP, released APIs or Level A–D; SAP’s Cloudification Repository is the source for this path.';

/** Target architecture → RA. Every code has an entry; `none` is said, not left out. */
export const REFERENCE_OF_TARGET: Readonly<Record<TargetArchitectureCode, readonly ReferenceBinding[]>> = Object.freeze({
  rap: [bind(null, 'none', NO_IN_APP_PATTERN)],
  // Were RA0007 / RA0018 (partial) until SAP archived them on 09.10.2026; both are still archived and not named.
  // Owner decision 12.11.2026: CAP is SAP's standard for side-by-side extensions, so the current patterns that cover
  // it in part are named as partial, each for the part it covers.
  cap: [
    bind('RA0023', 'partial', 'Names building applications with the Cloud Application Programming (CAP) model on Cloud Foundry, with CI/CD through SAP Continuous Integration and Delivery, transport through SAP Cloud Transport Management and operation in SAP Cloud ALM — the lifecycle of the extension, not its design.'),
    bind('RA0021', 'partial', 'Connects an application to SAP S/4HANA through Cloud Integration and, for Cloud2OnPremise, the Connectivity service with a cloud connector and the Destination service — the integration side of a side-by-side extension, not the extension itself.'),
  ],
  integration: [
    bind('RA0022', 'direct', 'APIs exposed as governed API proxies through API Management in SAP Integration Suite, with Cloud Integration for mediation beyond it and the Connectivity and Destination services for on-premise back ends.'),
    bind('RA0021', 'direct', 'Transactional messages between applications through Cloud Integration in SAP Integration Suite, Cloud2Cloud and Cloud2OnPremise, with SAP AIF for monitoring on SAP S/4HANA or SAP ECC.'),
  ],
  event: [
    bind('RA0001', 'direct', 'Decoupling through SAP Event Mesh and advanced event mesh; its one passage on ABAP names RAP for custom and derived events.'),
  ],
  retire: [bind(null, 'none', 'Nothing is built when the object is retired, so there is no target architecture to compare with a pattern.')],
  keep: [bind(null, 'none', 'The object stays as it is; no target architecture is built.')],
  standard: [bind(null, 'none', 'SAP standard takes over the function; no extension architecture is built.')],
  keyuser: [bind(null, 'none', 'Key-user extensions are configured in the system with SAP\u2019s key-user apps; the Architecture Center does not cover them, and no extension architecture is built.')],
});

const IN_APP_BLOCK =
  'An in-app ABAP Cloud building block; the Architecture Center does not cover it — SAP’s Cloudification Repository is the source for released objects.';

/** Building block → RA. */
export const REFERENCE_OF_SERVICE: Readonly<Record<CloudServiceKey, readonly ReferenceBinding[]>> = Object.freeze({
  xsuaa: [
    bind('RA0019', 'direct', 'SAP Cloud Identity Services authenticates the users of SAP cloud applications or federates to the corporate identity provider, and the role collections of XS UAA-based SAP BTP applications are replicated into the Identity Directory and assigned there.'),
  ],
  destination: [
    bind('RA0021', 'partial', 'Names the SAP Connectivity service with a cloud connector and the SAP Destination service for Cloud2OnPremise connections, as one step of App2App integration.'),
    bind('RA0022', 'partial', 'Names the SAP Connectivity service with a cloud connector and the SAP Destination service for Cloud2OnPremise connections, as one step of API-managed integration.'),
  ],
  eventmesh: [bind('RA0001', 'direct', 'Event-driven decoupling with SAP Event Mesh and advanced event mesh is the subject of the pattern.')],
  postgresql: [bind(null, 'none', 'No Architecture Center pattern covers a PostgreSQL database of an extension.')],
  hanaCloud: [bind(null, 'none', 'No Architecture Center pattern covers an extension’s own HDI container on SAP HANA Cloud.')],
  cdsView: [bind(null, 'none', IN_APP_BLOCK)],
  iamRoles: [
    bind('RA0019', 'partial', 'Covers publishing SAP S/4HANA roles into the Identity Directory and assigning them to users centrally; the roles, their business catalogs and IAM apps stay in the system, which the pattern leaves domain-specific.'),
  ],
  luwManager: [bind(null, 'none', IN_APP_BLOCK)],
  badi: [bind(null, 'none', IN_APP_BLOCK)],
  rapService: [bind(null, 'none', IN_APP_BLOCK)],
  default: [bind(null, 'none', 'A generic service binding; no Architecture Center pattern is named for it.')],
});

/**
 * An RFC call among the route drivers. No RA describes replacing an RFC call
 * (RA0001 mentions BAPI/RFC interfaces only as what SAP AIF handles on older
 * releases), so the nearest one, RA0022, is named only as `partial` (roadmap
 * 3.0.9). It was `none` while SAP had RA0022 archived (09.10.–27.10.2026). Not
 * shown yet — the driver → RA marker is the optional rest after 3.0.
 */
export const RFC_DRIVER_REFERENCE: ReferenceBinding = bind(
  'RA0022',
  'partial',
  'No Architecture Center pattern names RFC; the nearest is an on-premise back end reached through the cloud connector and exposed as a governed API through API Management in SAP Integration Suite.',
);

/**
 * The delivery pattern of a target that ships a BTP application — the
 * "Reference patterns" section of the handover README. `rap` has none: its
 * path is the ABAP transport path.
 */
export const DELIVERY_REFERENCE_OF_TARGET: Readonly<Partial<Record<TargetArchitectureCode, ReferenceBinding>>> = Object.freeze({
  cap: bind('RA0023', 'direct', 'CI/CD pipeline templates for a side-by-side CAP extension on SAP BTP, transport through SAP Cloud Transport Management and operation in SAP Cloud ALM.'),
  integration: bind('RA0023', 'direct', 'CI/CD, transport and lifecycle on SAP BTP, with its own steps for integration flows and API artifacts of SAP Integration Suite.'),
  event: bind('RA0023', 'direct', 'CI/CD, transport and lifecycle of an application on SAP BTP, Cloud Foundry environment.'),
});

/** `rap`'s delivery line: SAP documents no BTP pattern for it, and the reader is told what applies instead. */
export const RAP_DELIVERY_LINE = 'No Architecture Center pattern — the ABAP transport path applies (abapGit import into a development package, then the transport landscape of the system).';

/**
 * RA0001's one passage on ABAP, verbatim (`docs/ref-arch/RA0001/readme.md:107`,
 * branch `dev`, checked 2026-10-10). Quoted, not paraphrased, because it is the
 * only place the Architecture Center names RAP.
 */
export const RA0001_ABAP_QUOTE =
  'SAP delivers standard events to support modular cloud ERP.For any development of derived events(extending SAP Standard events) or defining custom events,ABAP RESTful Application Programming Model(RAP) can be leveraged. For older releases of SAP S/4HANA and SAP ECC releases(since NW 7.31), the SAP Application Interface Framework(AIF) supports the development of custom events and customer interfaces for SAP Business Objects, IDoc Interfaces, and BAPI/RFC Functional Module interfaces.';

/**
 * Where custom and derived events come from for the `event` target — the
 * edition decides the sentence, and the sentence is RA0001's.
 */
export function eventSourceSentence(edition: 'public' | 'private' | null | undefined): string {
  if (edition === 'public') {
    return 'On SAP S/4HANA Cloud Public Edition, custom and derived events are built with RAP (RA0001).';
  }
  if (edition === 'private') {
    return 'On SAP S/4HANA, custom and derived events are built with RAP; on older SAP S/4HANA releases, SAP AIF supports custom events (RA0001).';
  }
  return 'On SAP S/4HANA, custom and derived events are built with RAP; on older SAP S/4HANA releases and SAP ECC (since NW 7.31), with SAP AIF (RA0001).';
}

export function raUrl(id: SapRaId): string {
  return `${ARCHITECTURE_CENTER_BASE}${SAP_REFERENCE_ARCHITECTURES[id].slug}`;
}

export const FIT_LABEL: Readonly<Record<ReferenceFit, string>> = Object.freeze({
  direct: 'Direct fit',
  partial: 'Partial fit',
  none: 'No SAP pattern',
});

export function referenceOfTarget(code: TargetArchitectureCode): readonly ReferenceBinding[] {
  return REFERENCE_OF_TARGET[code];
}

export function referenceOfService(key: CloudServiceKey): readonly ReferenceBinding[] {
  return REFERENCE_OF_SERVICE[key];
}

export type ReferenceAnswer = 'yes' | 'partly' | 'none';

/** yes · partly · none — the best fit among the target's bindings. */
export function referenceAnswer(code: TargetArchitectureCode): ReferenceAnswer {
  const fits = REFERENCE_OF_TARGET[code].map((b) => b.fit);
  if (fits.includes('direct')) return 'yes';
  if (fits.includes('partial')) return 'partly';
  return 'none';
}

/**
 * The one line of the Business and Management views:
 * "SAP-documented pattern for this target: yes · partly · none", the RA IDs it
 * rests on and, where it is `none` because SAP archived what fitted, that it did.
 */
export function referencePatternLine(code: TargetArchitectureCode): {
  answer: ReferenceAnswer;
  text: string;
  ras: SapRaId[];
} {
  const answer = referenceAnswer(code);
  const best = answer === 'yes' ? 'direct' : answer === 'partly' ? 'partial' : null;
  const ras = best
    ? REFERENCE_OF_TARGET[code].filter((b) => b.fit === best && b.ra !== null).map((b) => b.ra as SapRaId)
    : [];
  const text = `${REFERENCE_LINE_LEAD}: ${answer}.`;
  return { answer, text, ras };
}

function bindingMarkdown(b: ReferenceBinding): string {
  if (!b.ra) return `- ${FIT_LABEL.none}: ${b.why}`;
  const ra = SAP_REFERENCE_ARCHITECTURES[b.ra];
  return `- ${FIT_LABEL[b.fit]}: [${ra.id} ${ra.title}](${raUrl(b.ra)}) — last updated by SAP ${ra.lastUpdate}. ${b.why}`;
}

/**
 * The "Reference patterns" section of the handover README, by target code.
 * `null` — no target known — says so rather than guessing one.
 */
export function referencePatternsReadme(code: TargetArchitectureCode | null, edition?: 'public' | 'private' | null): string {
  const lines: string[] = ['## Reference patterns', ''];
  lines.push(
    `${REFERENCE_WORDING}, from the SAP Architecture Center (${ARCHITECTURE_CENTER_SOURCE.repository}, ${ARCHITECTURE_CENTER_SOURCE.license}), checked on ${VERIFIED_AT}. ` +
      'It names the pattern SAP documents for this kind of target — not a statement by SAP about this code, and not a reason for the route.',
    '',
  );
  if (code === null) {
    lines.push('No target architecture is known for this project, so no pattern is named.');
    return `${lines.join('\n')}\n`;
  }
  lines.push(`Target: \`${code}\``, '');
  for (const b of REFERENCE_OF_TARGET[code]) lines.push(bindingMarkdown(b));
  if (code === 'event') lines.push('', eventSourceSentence(edition));
  lines.push('', 'Delivery:');
  const delivery = DELIVERY_REFERENCE_OF_TARGET[code];
  if (delivery) lines.push(bindingMarkdown(delivery));
  else if (code === 'rap') lines.push(`- ${RAP_DELIVERY_LINE}`);
  else lines.push('- Nothing is delivered for this target, so no delivery pattern applies.');
  return `${lines.join('\n')}\n`;
}
