/**
 * SAP naming — roadmap 3.0.15 (decision Sonny, 02.10.2026, ADR-064; replaces
 * his decision of 30.09.2026).
 *
 * SAP BTP keeps its name. The SAP Business AI Platform is the portfolio SAP
 * built around it — SAP BTP, AI Foundation, SAP Business Data Cloud and SAP
 * HANA Cloud — not a new name for it. Visible
 * copy therefore says "SAP BTP, part of the SAP Business AI Platform" at the
 * platform's first mention on a page or in a document and "SAP BTP" after
 * that. This module is the one place that spells those forms, the SAP service
 * names that carry BTP, and the stored route value —
 * `tests/sap-naming-guard.spec.ts` fails on a bare "BTP" (without "SAP"), on
 * "BAIP", on "formerly SAP BTP" and on the spelled-out "Business Technology
 * Platform" anywhere else in visible source.
 *
 * What "first mention" means here, because labels are reused across a page:
 *
 *   - **Prose** (a public page, an export, a mail, the assistant's knowledge,
 *     a summary sentence): the first mention in that page or document is
 *     `BTP_FIRST`, every later one `BTP`. An FAQ answer, a glossary entry and
 *     a JSON-LD answer are read on their own (a tooltip, a search result), so
 *     each counts as its own document.
 *   - **Labels** (route names, chips, tiles, table cells, chart rows, diagram
 *     boxes): always `BTP`. A label is read next to the page's own lead or
 *     summary, which carries `BTP_FIRST` where the platform is introduced.
 *   - **SAP's own service names** that carry BTP keep SAP's spelling
 *     (`SAP_BTP_ABAP_ENVIRONMENT`, `SAP_BTP_COCKPIT`); catalog and engine data
 *     from SAP sources (`lib/abap/generated/`) are SAP's words and stay as SAP
 *     wrote them.
 *
 * The stored route value `SIDE_BY_SIDE_ROUTE` is a data contract — projects,
 * runs and signed packs carry it — so it keeps its spelling; screens show it
 * through `routeLabel()`.
 */

/** Every mention after the first, and every compact label. */
export const BTP = 'SAP BTP';

/** The portfolio SAP BTP belongs to. Named on its own only where the portfolio itself is meant. */
export const BUSINESS_AI_PLATFORM = 'SAP Business AI Platform';

/** What the portfolio bundles, for the one glossary entry that explains it. */
export const BUSINESS_AI_PLATFORM_PARTS = `${BTP}, AI Foundation, SAP Business Data Cloud and SAP HANA Cloud`;

/** First mention of the platform on a page or in a document. */
export const BTP_FIRST = `${BTP}, part of the ${BUSINESS_AI_PLATFORM}`;

/** SAP's own product name for the ABAP environment. */
export const SAP_BTP_ABAP_ENVIRONMENT = 'SAP BTP, ABAP environment';

/** SAP's own name for the administration UI of a subaccount. */
export const SAP_BTP_COCKPIT = 'SAP BTP cockpit';

/**
 * Names a reader may type when asking what the platform is. Matching input
 * only — never displayed.
 */
export const PLATFORM_ALIASES = [
  'BTP',
  'SAP Business Technology Platform',
  'Business Technology Platform',
  BUSINESS_AI_PLATFORM,
  'BAIP',
] as const;

/**
 * The platform's name inside text whose bytes are fingerprinted: the
 * architecture contract hashes its summary, field statements and alternative
 * reasons, and generated code and decisions are bound to that hash, so
 * rewording them would unbind every existing project; a decision's summary
 * and option binding are hashed the same way (`lib/decision-draft.ts`). Only
 * those two modules may use these (the guard checks it); every screen shows
 * that text through `sapNamesForDisplay()`, which turns the bare short form
 * into `BTP`.
 */
export const FINGERPRINTED_PLATFORM_NAME = 'SAP BTP';
export const FINGERPRINTED_PLATFORM_SHORT = 'BTP';

/** The stored side-by-side route value (data contract). */
export const SIDE_BY_SIDE_ROUTE = 'Side-by-Side (SAP BTP)' as const;

/** The stored in-app route value. */
export const IN_APP_ROUTE = 'In-App (ABAP Cloud)' as const;

/**
 * The visible name of the side-by-side route, everywhere a label stands — the
 * compact form of `routeLabelFirst()`'s "Side-by-Side on SAP BTP, part of the
 * SAP Business AI Platform", and the words the Transformation flow uses. It is
 * deliberately not the stored value, so a screen that shows the stored value
 * as it is, past `routeLabel()`, is caught.
 */
export const SIDE_BY_SIDE_LABEL = `Side-by-Side on ${BTP}`;

/**
 * Whether a stored route names the side-by-side track. The test is the one
 * every caller used before 3.0.15 — the route contains the letters "BTP" — so
 * stored projects keep the track they had.
 */
export function isSideBySideRoute(route: string | null | undefined): boolean {
  return typeof route === 'string' && route.includes('BTP');
}

/**
 * SAP's ERP product names — owner decision 13.10.2026 (from SAP's product
 * pages). SAP's ERP product is SAP Cloud ERP:
 *
 *   - SAP S/4HANA Cloud Private Edition is now **SAP Cloud ERP Private**. Its
 *     first mention on a page, in a document or in a prompt is
 *     `CLOUD_ERP_PRIVATE_FIRST`; every later mention, and every label, is
 *     `CLOUD_ERP_PRIVATE`. The retired short forms ("Private Edition",
 *     "Private Cloud Edition", "PCE", "RISE") are not shown
 *     (`tests/sap-naming-guard.spec.ts`). SAP's offering name "RISE with SAP"
 *     and its methodology dashboard keep SAP's words.
 *   - SAP S/4HANA Cloud Public Edition keeps its name. Its first mention is
 *     `PUBLIC_EDITION_FIRST`, later ones `PUBLIC_EDITION`, or "Public Edition"
 *     where the sentence has just named it.
 *   - On-premise SAP S/4HANA stays SAP S/4HANA (on-premise).
 *   - Where a two-option control needs a short label: `PUBLIC_SHORT`,
 *     `PRIVATE_SHORT`.
 *
 * Stored values keep their spelling: the deployment keys `public`/`private`,
 * catalog file names such as `pce-2025-1`, release ids such as `PCE-2025-1`,
 * and SAP's own identifiers and document titles.
 */
export const CLOUD_ERP = 'SAP Cloud ERP';

/** Every mention of the private ERP after the first, and every label. */
export const CLOUD_ERP_PRIVATE = `${CLOUD_ERP} Private`;

/** First mention of the private ERP on a page, in a document or in a prompt. */
export const CLOUD_ERP_PRIVATE_FIRST = `${CLOUD_ERP_PRIVATE} (formerly SAP S/4HANA Cloud Private Edition)`;

/** SAP's public SaaS ERP, by its name. */
export const PUBLIC_EDITION = 'SAP S/4HANA Cloud Public Edition';

/** First mention of the public ERP on a page, in a document or in a prompt. */
export const PUBLIC_EDITION_FIRST = `${PUBLIC_EDITION} (part of ${CLOUD_ERP})`;

/** Short labels of a two-option Public/Private control. */
export const PUBLIC_SHORT = 'Public';
export const PRIVATE_SHORT = 'Private';

/** The two targets the engine assesses, by the name a label shows. */
export const TARGET_EDITION_NAMES: Readonly<Record<'public' | 'private', string>> = Object.freeze({
  public: PUBLIC_EDITION,
  private: CLOUD_ERP_PRIVATE,
});

/**
 * Names a reader may type for the private edition. Matching input only —
 * never displayed. "PCE" and "RISE" are left out: the lookup matches inside
 * words, and "enterprise" contains "rise".
 */
export const EDITION_ALIASES = [
  'Private Edition',
  'S/4HANA Cloud Private Edition',
  'SAP S/4HANA Cloud Private Edition',
  'Private Cloud Edition',
  'Public and Private Edition',
] as const;

/**
 * The edition names inside the fingerprinted architecture contract: its
 * summary and target-context statement are hashed and bound, so they keep
 * their bytes (as `FINGERPRINTED_PLATFORM_NAME` does). Only
 * `lib/architecture-contract.ts` may use them; screens show them through
 * `sapNamesForDisplay()`.
 */
export const FINGERPRINTED_EDITION_PUBLIC = 'S/4HANA Cloud, Public Edition';
export const FINGERPRINTED_EDITION_PRIVATE = 'S/4HANA Cloud, Private Edition';

/**
 * A text that has to keep its bytes — a stored route, a sentence inside a
 * fingerprinted contract, a model draft or summary stored before 02.10.2026 —
 * as the reader sees it now: a bare "BTP" reads "SAP BTP"; the spelled-out
 * former expansion, the 30.09 first mention "SAP Business AI Platform
 * (formerly SAP BTP)" and its "BAIP" read as today's forms. SAP's service
 * names stay.
 */
export function sapNamesForDisplay(text: string): string {
  return (
    text
      // The 30.09 first mention and its variants (landing FAQ, glossary, stored drafts).
      .replace(/SAP Business AI Platform \((?:BAIP, )?formerly SAP BTP(?: \(Business Technology Platform\))?\)/g, BTP_FIRST)
      // A model draft that spells the platform out.
      .replace(/SAP BTP \(Business Technology Platform\)|SAP Business Technology Platform(?: \(BTP\))?/g, BTP_FIRST)
      // "a BTP runtime" becomes "an SAP BTP runtime", not "a SAP BTP runtime".
      .replace(/\b([Aa]) (?=(?:BAIP|BTP)\b)/g, '$1n ')
      .replace(/\bBAIP\b/g, BTP)
      // A bare "BTP" that is not already part of "SAP BTP".
      .replace(/(?<!SAP )\bBTP\b/g, BTP)
      // The edition names a fingerprinted contract or a stored draft carries
      // (owner decision 13.10.2026): SAP Cloud ERP Private, and SAP S/4HANA
      // Cloud Public Edition by its full name.
      .replace(/(?<!formerly (?:SAP )?)(?:SAP )?S\/4HANA Cloud,? Private Edition(?: \/ RISE)?/g, CLOUD_ERP_PRIVATE)
      .replace(/(?:SAP )?S\/4HANA Cloud, Public Edition/g, PUBLIC_EDITION)
  );
}

/**
 * The visible name of a stored route value. Any other value — a reader's own
 * wording, an in-app route — is returned as it is, apart from the platform
 * name (`sapNamesForDisplay`).
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
  if (route === SIDE_BY_SIDE_ROUTE) return `Side-by-Side on ${BTP_FIRST}`;
  return sapNamesForDisplay(route);
}
