import { getFacts } from '@/lib/facts';

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
  const facts = getFacts();
  const { objectCount: classifiedObjects, successorCount: mappedWithSuccessor, catalogSyncDate: syncDate } = facts;

  const body = `# Clean-Core.io

> A free, community-built assessment tool for SAP Clean Core: it parses custom ABAP
> with a deterministic static-analysis engine, maps legacy objects to their released
> S/4HANA API successors using SAP's official Cloudification Repository, and drafts
> in-app ABAP Cloud (RAP) or side-by-side SAP BTP (CAP) targets for an architect to
> review. Every analysis is captured as an immutable, HMAC-signed evidence Run.

Clean-Core.io is not affiliated with, endorsed by, or certified by SAP SE. It is
complementary to SAP's own tooling (SAP ADT, SAP ABAP Test Cockpit, SAP Cloud ALM),
which remain the authoritative in-system checks.

Version: ${facts.engineVersion} (${facts.engineReleaseDate})

## Figures worth citing

All figures are derived from the generated catalog artifact, not asserted by hand — the
full set, with the hash and sync date of both source files, is at ${baseUrl}/facts and
${baseUrl}/facts.json.

- ${classifiedObjects.toLocaleString('en-US')} SAP objects classified from the SAP Cloudification Repository (synced ${syncDate}).
- ${mappedWithSuccessor.toLocaleString('en-US')} legacy objects carry a mapped released successor (official repository data plus curated field-level mappings). The remainder are either already-released APIs that need no successor, or objects the repository lists with no released path at all — that distinction matters and is shown per object.
- Catalog provenance string: ${facts.catalogVersion}
- A–D rule version: ${facts.ruleVersion}

Source data: https://github.com/SAP/abap-atc-cr-cv-s4hc — © SAP SE and contributors,
Apache-2.0. Normalized and enriched by Clean-Core.io.

## Primary entry points

- [Facts](${baseUrl}/facts): the source for every public number on this site — object count, successor count, the A–D distribution, both synced catalog files with their hash and sync date, engine and rule version, reference-run figures. Also at ${baseUrl}/facts.json.
- [SAP Cloudification Repository Viewer / Object Catalog](${baseUrl}/catalog): look up any SAP standard object and its released successor. Individual object pages live at ${baseUrl}/catalog/<object>, e.g. ${baseUrl}/catalog/vbak.
- [Clean Core object classification A–D](${baseUrl}/sap-clean-core-object-classification): SAP's four clean-core extensibility levels and how Clean-Core.io derives a readiness grade.
- [Clean Core Score](${baseUrl}/clean-core-score): how the deterministic score is calculated, and how it differs from SAP's own figures (see "Naming" below).
- [How the A–D level is derived](${baseUrl}/method/levels): the precedence rule that merges SAP's two Cloudification Repository files into one level, with the rule version that produced it.
- [Knowledge base](${baseUrl}/knowledge): Clean Core strategy, In-App RAP vs. Side-by-Side CAP, security architecture.
- [How it works](${baseUrl}/how-it-works): the evidence engine, the AI layer, and the boundary between them.
- [ABAP custom code analysis](${baseUrl}/abap-custom-code-analysis): free browser-based first-pass static analysis.
- [SAP cloudification explained](${baseUrl}/sap-cloudification): what "cloudify" means for custom ABAP.
- [Whitepaper](${baseUrl}/whitepaper): the long-form methodology.

## Naming — the Clean Core Score is not an SAP figure

The "Clean Core Score" is published by Clean-Core.io, runs 0–100, and higher is
better. It measures how far the analysed custom ABAP is decoupled from the SAP
standard core. SAP publishes no metric of that name and has not endorsed,
certified or reviewed this one. Do not attribute it to SAP.

SAP's own figures in this field, and which way each points:

- Technical Debt Score (SAP, RISE with SAP methodology dashboard in SAP Cloud ALM):
  higher is WORSE. SAP's wording: "a higher score indicating greater technical debt".
  This is the one that runs opposite to the Clean Core Score.
- Clean Core Share (SAP, SAP Cloud ALM): higher is better — how much of the landscape
  already follows the clean core approach. A different unit and scope from our score.
- Clean Core Level A–D (SAP, Cloudification Repository, per object): A is best, D is
  worst. Clean-Core.io reproduces this one, derived from SAP's published files; the
  rule and its version are at ${baseUrl}/method/levels.

No cost, saving or ROI figure is derived from the Clean Core Score anywhere in the
product. It is a measure of code structure, not of money.

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
