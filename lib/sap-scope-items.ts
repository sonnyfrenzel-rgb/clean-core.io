/**
 * SAP Best Practices scope items: the ID and SAP's title for it, each with the
 * public SAP Help Portal page that states both (CO review F13, 12.10.2026).
 *
 * Why it exists: a model gave scope item 1EG for cost center accounting. SAP
 * lists 1EG as "Bank Integration with File Interface". With no SAP list to
 * compare against, the check could only say "not verified"; a reader took that
 * as "probably right, unchecked". With SAP's title held here, a scope item the
 * model names for another area reads "name does not match SAP's", and SAP's
 * title stands beside it.
 *
 * A small, curated list — not a catalogue. It holds the finance and controlling
 * scope items the product's reviews met, plus the closest neighbours a model
 * confuses them with. Every row names a public SAP Help Portal page (no login)
 * on which SAP states the ID together with the title, and the release of that
 * page; the title is written exactly as that page writes it. An ID with no such
 * page is not here, and stays "not verified — check before use"; it is never
 * guessed. Checked 12.10.2026.
 *
 * Extend it the same way: the ID, SAP's title as the page writes it, the page,
 * its release. Read at build time only — nothing is fetched at run time.
 */

export interface SapScopeItem {
  id: string;
  /** SAP's title, as the source page writes it. */
  title: string;
  /** The public SAP page that states the ID with this title. */
  source: { label: string; url: string };
}

export const SAP_SCOPE_ITEM_CHECKED = '2026-10-12';

const HELP = 'https://help.sap.com/docs';

/** SAP Help, "Public Interfaces for Scope Items in SAP S/4HANA Cloud Public Edition" — Integration Scenarios, 2602 (the CO review's source S1 for 1EG). */
const INTEGRATION_SCENARIOS_2602 = {
  label: 'SAP Help, Integration Scenarios 2602',
  url: `${HELP}/s4hana-best-practices/s4cld-api/integration-scenarios?locale=en-US&state=PRODUCTION&version=2602`,
};

const page = (label: string, path: string) => ({ label: `SAP Help, ${label}`, url: `${HELP}/${path}` });

export const SAP_SCOPE_ITEMS: readonly SapScopeItem[] = Object.freeze([
  // Bank, planning — all four stated on the Integration Scenarios page, 2602.
  { id: '1EG', title: 'Bank Integration with File Interface', source: INTEGRATION_SCENARIOS_2602 },
  { id: '16R', title: 'Bank Integration with SAP Multi-Bank Connectivity', source: INTEGRATION_SCENARIOS_2602 },
  { id: '1HB', title: 'Financial Plan Data Upload from File', source: INTEGRATION_SCENARIOS_2602 },
  { id: '4RC', title: 'Integrated Financial Planning', source: INTEGRATION_SCENARIOS_2602 },
  // Controlling — SAP S/4HANA 2020 documentation pages headed "<title> (<ID>)".
  {
    id: 'J54',
    title: 'Overhead Cost Accounting',
    source: page('SAP S/4HANA 2020, Overhead Cost Accounting (J54)', 'SAP_S4HANA_ON-PREMISE/e296651f454c4284ade361292c633d69/5477419d953244b68a25da8a5b5f47cc.html?locale=en-US&state=PRODUCTION&version=2020.000'),
  },
  {
    id: '2QL',
    title: 'Universal Allocation',
    source: page('SAP S/4HANA 2020, Universal Allocation (2QL)', 'SAP_S4HANA_ON-PREMISE/e296651f454c4284ade361292c633d69/86dc0394f3814144a15d0307e55fc91d.html?locale=en-US&state=PRODUCTION&version=2020.000'),
  },
  {
    id: 'J55',
    title: 'Margin Analysis',
    source: page('SAP S/4HANA 2020, Margin Analysis (J55)', 'SAP_S4HANA_ON-PREMISE/e296651f454c4284ade361292c633d69/121a1c6b5a8a4192a5056358446d36d8.html?locale=en-US&state=PRODUCTION&version=2020.000'),
  },
  // Financial accounting, cash, procurement, sales — SAP Best Practices 2608 pages headed with the ID.
  {
    id: 'J58',
    title: 'Accounting and Financial Close',
    source: page('Best Practices 2608, Setting Up Accounting and Financial Close (J58)', 'SAP_S4HANA_BEST_PRACTICES/6da2b2a5ee8238a8c2f3752e98db6009/78cf77cd34ee4d86af22857f961b536e.html?locale=en-US&state=PRODUCTION&version=2608'),
  },
  {
    id: 'J60',
    title: 'Accounts Payable',
    source: page('Best Practices 2608, Setting Up Accounts Payable (J60)', 'SAP_S4HANA_BEST_PRACTICES/6c6078f233bd157ce4246fe7615f3007/4fc9a8e49b5b47dc9e3f8613ddff81e7.html?locale=en-US&state=PRODUCTION&version=2608'),
  },
  {
    id: 'J78',
    title: 'Advanced Cash Operations',
    source: page('Best Practices 2608, (J78) Advanced Cash Operations', 'SAP_S4HANA_CLOUD_BEST_PRACTICES/5335217412b370cfa46f0e772a0995c0/86fc89dbacf747209d0776c2a2aa2970.html?locale=en-US&state=PRODUCTION&version=2608'),
  },
  {
    id: '18J',
    title: 'Requisitioning',
    source: page('Best Practices 2608, Setting Up Requisitioning (18J)', 'SAP_S4HANA_BEST_PRACTICES/829951d1257a2b96f22215cbf43aae7c/acb380c86453489faa27759d894a0f5b.html?locale=en-US&state=PRODUCTION&version=2608'),
  },
  {
    id: 'J45',
    title: 'Procurement of Direct Materials',
    source: page('Best Practices 2608, Setting Up Procurement of Direct Materials (J45)', 'SAP_S4HANA_BEST_PRACTICES/47fe5fb3ea8515cab641f87fe7fb7145/3e8b9b961e534dd0a569dfdf03785dba.html?locale=en-US&state=PRODUCTION&version=2608'),
  },
  {
    id: 'BD9',
    title: 'Sell from Stock',
    source: page('Best Practices 2608, Setting Up Sell from Stock (BD9)', 'SAP_S4HANA_BEST_PRACTICES/e9718dcb7c964bb736ee48ffe4a2c207/b463122803354d38a7653ff324b7fce4.html?locale=en-US&state=PRODUCTION&version=2608'),
  },
] as SapScopeItem[]);
