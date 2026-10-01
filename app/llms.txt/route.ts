import { getFacts } from '@/lib/facts';
import { SCORE_BANDS_SOURCE, scoreBandsBullets, scoreDeductionsProse } from '@/lib/clean-core-score';

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

> From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of
> evidence you can check.

For the person who has to decide what happens to a custom ABAP program, Clean-Core.io
is the free workspace that reads the code before any model does, draws the business
process as BPMN with a line anchor on every element, or the reason it has none, shows SAP's clean core level for
every SAP object it touches — and then carries the same evidence through the whole way:
a target design, a transformed code draft and test scenarios, run in an isolated runner,
all traceable to the lines they came from and sealed as signed runs. Other tools explain
code, or rewrite it. Clean-Core.io does both on one chain of evidence — and says what it
could not determine.

In detail: a deterministic ABAP static code analysis reads the program, reconstructs its
business process as BPMN with a line anchor on every element, or the reason it has none, lists the business rules
hard-coded in the program, grades each SAP object it uses Level A–D from SAP's published
Cloudification Repository, and names what it could not determine. From that evidence it
drafts the target design, the transformed code, documentation and test scenarios for a
person to review; the test scenarios run against the generated code in an isolated
runner, against mocks — they do not show that the code runs in a real SAP S/4HANA
system. Economics calculates on the user's own figures. Every completed analysis is
sealed as an immutable, signed run, and the handover pack is signed over it.

One workspace, three views of the same facts: the Business view ("Do I still need this,
and what changes for me?"), the IT view ("What exactly, where to, and is it right?") and
the Management view ("What do I risk, what do I decide?"). A view orders what is shown;
it changes no result. The seven stages — Analyze, Design, Transformation, Documentation,
Testing, Economics, Delivery — are tools in that workspace. The process leaves as a
BPMN 2.0 XML file; there is no connection to a Signavio workspace. Generated RAP or CAP
code is a draft for a person to review.

Clean-Core.io is not affiliated with, endorsed by, or certified by SAP SE. It is
complementary to SAP's own tooling (SAP ADT, SAP ABAP Test Cockpit, SAP Cloud ALM),
which remain the authoritative in-system checks. SAP's AI agents for developers (Joule
for Developers, the Custom Code Migration Agent) tell developers what to fix inside their
system; Clean-Core.io shows the business what the code does and carries that evidence
through draft and test to a decision. ATC stays the authority.

Version: ${facts.engineVersion} (${facts.engineReleaseDate})

## What the workspace holds

- A workspace per project. The business process is reconstructed from the ABAP code as
  BPMN 2.0, with a line anchor on every element, or the reason it has none.
- A BPMN editor with revisions: every save is a new revision; the reconstruction itself
  is never overwritten. The process leaves and comes back as a BPMN 2.0 XML file. There
  is no connection to SAP Signavio, and import into SAP Signavio has not been verified.
- SAP's clean core level A–D for every SAP object the code touches, and the Clean Core
  Score (0–100, higher is better) in four bands.
- Business, IT and Management views of the same facts.
- Seven tools: Analyze, Design, Transformation, Documentation, Testing, Economics,
  Delivery. Their layout is oriented on SAP Fiori patterns; it is not an SAP Fiori app
  and not endorsed by SAP.
- Read access by invitation: a link bound to one confirmed e-mail address, including
  the source code, with expiry and revocation. No public links.
- A demo project with a guided tour in every account.
- Free, with no paid tier. Stored in the EU (Google Cloud, Belgium). No analytics,
  advertising or tracking cookies.

The full set of questions and answers from the start page, as plain text, is at
${baseUrl}/llms-full.txt.

## Figures worth citing

All figures are derived from the generated catalog artifact, not asserted by hand — the
full set, with the hash and sync date of both source files, is at ${baseUrl}/facts and
${baseUrl}/facts.json.

- ${classifiedObjects.toLocaleString('en-US')} SAP objects classified from the SAP Cloudification Repository (synced ${syncDate}).
- ${mappedWithSuccessor.toLocaleString('en-US')} legacy objects carry a mapped released successor (official repository data plus curated field-level mappings). The remainder are either already-released APIs that need no successor, or objects the repository lists with no released path at all — that distinction matters and is shown per object.
- Catalog provenance string: ${facts.catalogVersion}
- Level A–D rule version: ${facts.ruleVersion}

Source data: https://github.com/SAP/abap-atc-cr-cv-s4hc — © SAP SE and contributors,
Apache-2.0. Normalized and enriched by Clean-Core.io.

## Primary entry points

- [Facts](${baseUrl}/facts): the source for every public number on this site — object count, successor count, the Level A–D distribution, both synced catalog files with their hash and sync date, engine and rule version, reference-run figures. Also at ${baseUrl}/facts.json.
- [SAP Cloudification Repository Viewer / Object Catalog](${baseUrl}/catalog): look up any SAP standard object and its released successor. Individual object pages live at ${baseUrl}/catalog/<object>, e.g. ${baseUrl}/catalog/vbak.
- [Clean Core object classification A–D](${baseUrl}/sap-clean-core-object-classification): SAP's four clean core extensibility levels and how Clean-Core.io derives a readiness grade.
- [Clean Core Score](${baseUrl}/clean-core-score): how the deterministic score is calculated, and how it differs from SAP's own figures (see "Naming" below).
- [How Level A–D is derived](${baseUrl}/method/levels): the precedence rule that merges SAP's two Cloudification Repository files into one level, with the rule version that produced it.
- [Knowledge base](${baseUrl}/knowledge): Clean Core strategy, In-App RAP vs. Side-by-Side CAP, security architecture.
- [How it works](${baseUrl}/how-it-works): the evidence engine, the language model, and the boundary between them.
- [ABAP custom code analysis](${baseUrl}/abap-custom-code-analysis): free browser-based first-pass static analysis.
- [SAP cloudification explained](${baseUrl}/sap-cloudification): what "cloudify" means for custom ABAP.
- [Whitepaper](${baseUrl}/whitepaper): the whole story for the people who decide what happens to custom ABAP — the chain of evidence, the process as BPMN, levels A–D, the seven tools and their limits. Also as PDF: ${baseUrl}/Clean-Core_S4HANA_Modernization_Whitepaper.pdf.
- [Clean core explained](${baseUrl}/clean-core-explained): SAP clean core from first principles, without the jargon.
- [Your first run](${baseUrl}/first-run): what one analysis shows, step by step.
- [Reference analysis](${baseUrl}/reference-analysis): one published, reproducible run on real legacy ABAP.
- [Verify an audit pack](${baseUrl}/verify-pack): check that an exported pack is complete, unchanged and signed.
- [Trust and privacy](${baseUrl}/trust): where data is stored, who can read it, what is never done with it.

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

What a score means — ${SCORE_BANDS_SOURCE}, not an SAP measure:
${scoreBandsBullets()}

How it is computed: ${scoreDeductionsProse()}

No cost, saving or ROI figure is derived from the Clean Core Score anywhere in the
product. It is a measure of code structure, not of money.

## What this tool does not do

- It does not replace SAP ABAP Test Cockpit (ATC), SAP ABAP Development Tools (ADT),
  Joule for Developers or SAP's Custom Code Migration Agent.
- Its tests check the generated code against test scenarios in an isolated runner; they
  do not show that the code runs in a real SAP S/4HANA system.
- It does not claim SAP certification, endorsement, or affiliation.
- Its Level A–D is a derived orientation, not an authoritative SAP ATC classification,
  and is deliberately excluded from the signed audit pack.
- What a language model writes is marked as a Model proposal: generated code and text
  are drafts for a person to review, never a finished deliverable. Structurally untransformable patterns (Dynpro screens, dynamic call
  routing, kernel internals) are flagged rather than guessed at.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
