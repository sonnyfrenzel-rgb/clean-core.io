import { getCatalogStats, getMergedCatalogVersion } from '@/lib/abap/catalog-service';
import { APP_VERSION, APP_RELEASE_DATE_ISO } from '@/lib/version';

/**
 * /llms.txt — a compact, machine-readable orientation file for LLM crawlers and
 * answer engines (llmstxt.org convention).
 *
 * Rationale: the AI crawlers allow-listed in app/robots.ts land on marketing HTML
 * and have to infer what this site actually holds. This file states it plainly,
 * carries the figures worth citing (with their provenance), and names the limits —
 * so a generative answer that cites us cites something true.
 *
 * Numbers are read from the generated catalog artifact, never hardcoded, so they
 * cannot drift away from the data they describe.
 */
export const revalidate = 86400; // refresh daily

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
  const { classifiedObjects, mappedWithSuccessor, syncDate } = getCatalogStats();

  const body = `# Clean-Core.io

> A free, community-built assessment tool for SAP Clean Core: it parses custom ABAP
> with a deterministic static-analysis engine, maps legacy objects to their released
> S/4HANA API successors using SAP's official Cloudification Repository, and drafts
> in-app ABAP Cloud (RAP) or side-by-side SAP BTP (CAP) targets for an architect to
> review. Every analysis is captured as an immutable, HMAC-signed evidence Run.

Clean-Core.io is not affiliated with, endorsed by, or certified by SAP SE. It is
complementary to SAP's own tooling (SAP ADT, SAP ABAP Test Cockpit, SAP Cloud ALM),
which remain the authoritative in-system checks.

Version: ${APP_VERSION} (${APP_RELEASE_DATE_ISO})

## Figures worth citing

All figures are derived from the generated catalog artifact, not asserted by hand.

- ${classifiedObjects.toLocaleString('en-US')} SAP objects classified from the SAP Cloudification Repository (synced ${syncDate}).
- ${mappedWithSuccessor.toLocaleString('en-US')} legacy objects carry a mapped released successor (official repository data plus curated field-level mappings). The remainder are either already-released APIs that need no successor, or objects the repository lists with no released path at all — that distinction matters and is shown per object.
- Catalog provenance string: ${getMergedCatalogVersion()}

Source data: https://github.com/SAP/abap-atc-cr-cv-s4hc — © SAP SE and contributors,
Apache-2.0. Normalized and enriched by Clean-Core.io.

## Primary entry points

- [SAP Cloudification Repository Viewer / Object Catalog](${baseUrl}/catalog): look up any SAP standard object and its released successor. Individual object pages live at ${baseUrl}/catalog/<object>, e.g. ${baseUrl}/catalog/vbak.
- [Clean Core object classification A–D](${baseUrl}/sap-clean-core-object-classification): SAP's four clean-core extensibility levels and how Clean-Core.io derives a readiness grade.
- [Clean Core Score](${baseUrl}/clean-core-score): how the deterministic score is calculated.
- [Knowledge base](${baseUrl}/knowledge): Clean Core strategy, In-App RAP vs. Side-by-Side CAP, security architecture.
- [How it works](${baseUrl}/how-it-works): the evidence engine, the AI layer, and the boundary between them.
- [ABAP custom code analysis](${baseUrl}/abap-custom-code-analysis): free browser-based first-pass static analysis.
- [SAP cloudification explained](${baseUrl}/sap-cloudification): what "cloudify" means for custom ABAP.
- [Whitepaper](${baseUrl}/whitepaper): the long-form methodology.

## What this tool does not do

- It does not replace SAP ABAP Test Cockpit (ATC) or SAP ABAP Development Tools (ADT).
- It does not claim SAP certification, endorsement, or affiliation.
- Its A–D readiness grade is a derived orientation aid, not an authoritative SAP ATC
  classification, and is deliberately excluded from the signed audit pack.
- AI-generated code and narrative are drafts for architect review, never a finished
  deliverable. Structurally untransformable patterns (Dynpro screens, dynamic call
  routing, kernel internals) are flagged rather than guessed at.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
