/**
 * SAP naming — roadmap 3.0.15 (decision Sonny, 30.09.2026).
 *
 * SAP presented the SAP Business AI Platform (BAIP) at Sapphire 2026 as the
 * portfolio that contains SAP BTP. Visible copy names the platform
 * "SAP Business AI Platform (formerly SAP BTP)" at its first mention and
 * "BAIP" after that. This module is the one place that spells either form, the
 * SAP service names that still carry BTP, and the stored route value that
 * contains the letters — `tests/sap-naming-guard.spec.ts` fails on a bare
 * "BTP" anywhere else in visible source.
 *
 * What "first mention" means here, because labels are reused across a page:
 *
 *   - **Prose** (a public page, an export, a mail, the assistant's knowledge,
 *     a summary sentence): the first mention in that page or document is
 *     `BAIP_FIRST`, every later one `BAIP`. An FAQ answer, a glossary entry
 *     and a JSON-LD answer are read on their own (a tooltip, a search result),
 *     so each counts as its own document.
 *   - **Labels** (route names, chips, tiles, table cells, chart rows, diagram
 *     boxes): always `BAIP`. A label is read next to the page's own lead or
 *     summary, which carries `BAIP_FIRST` where the platform is introduced.
 *   - **SAP's own names** that still carry BTP keep SAP's spelling
 *     (`SAP_NAMES_WITH_BTP`); catalog and engine data from SAP sources
 *     (`lib/abap/generated/`) are SAP's words and stay as SAP wrote them.
 *
 * The stored route value `SIDE_BY_SIDE_ROUTE` is a data contract — projects,
 * runs and signed packs carry it — so it keeps its old spelling and is never
 * shown as it is: `routeLabel()` turns it into the visible name.
 */

/** The former name, as the first mention carries it. */
export const BAIP_FORMERLY = 'formerly SAP BTP';

/** First mention of the platform on a page or in a document. */
export const BAIP_FIRST = `SAP Business AI Platform (${BAIP_FORMERLY})`;

/** Every later mention, and every compact label. */
export const BAIP = 'BAIP';

/** The platform's full name without the former name, for a sentence that already introduced it. */
export const BAIP_NAME = 'SAP Business AI Platform';

/** SAP's own product name for the ABAP environment; SAP still names it with BTP. */
export const SAP_BTP_ABAP_ENVIRONMENT = 'SAP BTP, ABAP environment';

/** SAP's own name for the administration UI of a subaccount. */
export const SAP_BTP_COCKPIT = 'SAP BTP cockpit';

/**
 * Names SAP itself still uses with BTP. They are SAP's names, not ours to
 * rename; the guard accepts exactly these spellings and nothing else.
 */
export const SAP_NAMES_WITH_BTP = [
  SAP_BTP_ABAP_ENVIRONMENT,
  'SAP BTP ABAP environment',
  SAP_BTP_COCKPIT,
] as const;

/**
 * Names a reader may still type when asking what the platform is. Matching
 * input only — never displayed.
 */
export const FORMER_PLATFORM_NAMES = ['SAP BTP', 'BTP', 'SAP Business Technology Platform'] as const;

/**
 * The former name inside text whose bytes are fingerprinted: the architecture
 * contract hashes its summary, field statements and alternative reasons, and
 * generated code and decisions are bound to that hash, so rewording them would
 * unbind every existing project; a decision's summary and option binding are
 * hashed the same way (`lib/decision-draft.ts`). Only those two modules may use
 * these (the guard checks it); every screen shows that text through
 * `sapNamesForDisplay()`.
 */
export const FINGERPRINTED_FORMER_NAME = 'SAP BTP';
export const FINGERPRINTED_FORMER_SHORT = 'BTP';

/** The stored side-by-side route value (data contract — never displayed as is). */
export const SIDE_BY_SIDE_ROUTE = 'Side-by-Side (SAP BTP)' as const;

/** The stored in-app route value. */
export const IN_APP_ROUTE = 'In-App (ABAP Cloud)' as const;

/** The visible name of the side-by-side route. */
export const SIDE_BY_SIDE_LABEL = `Side-by-Side (${BAIP})`;

/**
 * Whether a stored route names the side-by-side track. The test is the one
 * every caller used before 3.0.15 — the route contains the letters "BTP" — so
 * stored projects keep the track they had.
 */
export function isSideBySideRoute(route: string | null | undefined): boolean {
  return typeof route === 'string' && route.includes('BTP');
}

/**
 * A text written before 3.0.15 that has to keep its bytes — a stored route, a
 * sentence inside a fingerprinted contract (`lib/architecture-contract.ts`
 * hashes its summary, statements and reasons, and generated code and decisions
 * are bound to that hash) — as the reader sees it: the former platform name
 * reads as `BAIP`; SAP's own names and the prescribed first mention stay.
 */
export function sapNamesForDisplay(text: string): string {
  const kept = [BAIP_FORMERLY, ...SAP_NAMES_WITH_BTP];
  const parts: string[] = [];
  // A model draft written before 3.0.15 spells the platform out; it reads as the first mention.
  const spelled = text.replace(/SAP BTP \(Business Technology Platform\)|SAP Business Technology Platform(?: \(BTP\))?/g, BAIP_FIRST);
  const masked = kept.reduce((acc, name) => acc.split(name).join(`\u0000${parts.push(name) - 1}\u0000`), spelled);
  return masked
    .replace(/\bSAP BTP\b/g, BAIP)
    .replace(/\bBTP\b/g, BAIP)
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => parts[Number(i)]);
}

/**
 * The visible name of a stored route value. Any other value — a reader's own
 * wording, an in-app route — is returned as it is, apart from the former
 * platform name (`sapNamesForDisplay`).
 */
export function routeLabel(route: string): string {
  if (route === SIDE_BY_SIDE_ROUTE) return SIDE_BY_SIDE_LABEL;
  return sapNamesForDisplay(route);
}

/**
 * The route where it is the platform's first mention on a page — a public page
 * that names the route once, a document's first line about it.
 */
export function routeLabelFirst(route: string): string {
  if (route === SIDE_BY_SIDE_ROUTE) return `Side-by-Side on ${BAIP_FIRST}`;
  return sapNamesForDisplay(route);
}
