# SEO / GEO / AEO Plan & Changelog — 2026-07-15

Based on the Google Search Console export (Coverage + Performance, 2026-07-15) and an
on-page audit (`seo-geo-optimizer` skill + direct source review).

## Diagnosis (data-grounded)

- **Indexing is healthy.** 83 pages indexed (up from 2; big jump on 2026-07-01 when the
  SAP object catalog was crawled). Of the 14 "not indexed": **12 are intentional `noindex`**
  (catalog `/catalog/[object]` pages with *no released-API successor* — thin "no-path"
  boilerplate deliberately kept out of the index, `page.tsx` `robots.index:false`), 1 redirect,
  1 normal crawl-not-indexed. Nothing to fix.
- **Visibility solved, clicks are the bottleneck.** Impressions 45–296/day, average position
  30 → ~12–17, but ~0.8% CTR (~12 clicks in 7 weeks). Cause: ranking depth (money queries on
  page 2–3) + weak title CTR.
- **Winning pattern:** distinctive "thing" titles get clicks — `/sap-clean-core-object-classification`
  **(A–D) 11% CTR** @9, `/clean-core-score` **(Score) 3.5% CTR** @7.5. Generic explainer titles
  get 0% (`/abap-custom-code-analysis` @33, `/knowledge` @27).
- **GEO infra already present:** FAQPage JSON-LD + `QuickAnswer` on 7 pages; a German
  answer-style query already ranks **position 1** — so the gap is query-matching + CTR, not schema.

## What was implemented in this pass (narrative preserved, no over-claiming)

### `/abap-custom-code-analysis` (biggest lever — 234 impr @33, 0 clicks)
- **Title/meta** → query-matched: `Free ABAP Static Code Analysis Tool for S/4HANA Clean Core`
  (adds "free", "static", "tool" — the exact high-volume queries).
- **H1** `ABAP Custom Code Analysis` → `ABAP Static Code Analysis`; subtitle reframed as a
  free static-analysis **tool**.
- **New content section** "What the ABAP static analysis detects" (table access, unreleased
  objects, modifications/native SQL, dynpro/BDC/RFC) — real depth, query-rich, honest.
- **+3 FAQs** matching real queries ("Is there a free ABAP static code analysis tool?", "How do
  I find custom code that breaks an S/4HANA upgrade?", "Does static ABAP analysis replace SAP
  ATC?") — feed FAQPage schema + on-page.
- **Honesty fix:** removed the residual "Static AST / abstract syntax tree" over-claim →
  "deterministic, token- and rule-based static analysis" (consistent with the v2.1 claim-hygiene).

### Homepage (`app/layout.tsx`)
- **SERP title** `Clean-Core.io — Free SAP Clean Core Modernization Assistant` →
  `SAP Clean Core — Free ABAP Analysis & Clean Core Score` (head term first, two concrete
  offerings). OG/Twitter titles kept brand-first (narrative preserved for social).
- **Meta description** front-loaded with "SAP Clean Core / ABAP custom-code analysis / Clean
  Core Score / released SAP APIs", keeping "free, community-built, complementary to SAP ADT/ATC".

### `/knowledge` (134 impr @27)
- **Title** → `SAP Clean Core Guide: RAP vs CAP & Extensibility Patterns` (matches the page's
  RAP-vs-CAP comparison + the "guide" intent).
- **Related tools & guides** internal-link block added (→ ABAP analysis, Clean Core Score, A–D).

### Internal linking (WS4)
- Catalog object pages (`/catalog/[object]` — most impressions, page-1) now link to
  `/abap-custom-code-analysis` with a descriptive anchor ("ABAP static code analysis") — passes
  link equity to the biggest lever from hundreds of ranking pages.
- Reciprocal links: `/knowledge` ↔ `/abap-custom-code-analysis` ↔ `/clean-core-score` ↔ `/sap-clean-core-object-classification`.

### Left unchanged (already working)
- `/clean-core-score` and `/sap-clean-core-object-classification` titles (3.5% / 11% CTR) — the templates.

## Not implemented here (manual / off-page)

- **Authority / backlinks** (the long game for head terms like "clean core" @48, "abap code
  analysis"): publish the pending SAP Community blog, link from LinkedIn, a dev.to post — 2–3
  quality links. Off-page, owner action.
- A dedicated "SAP Cloudify / Cloudification" page for "sap cloudify"/"cloudify sap" (53+34 impr
  @14–21) — candidate for the next pass.

## Measurement

Re-pull GSC in **2–4 weeks**. Watch:
- CTR on the retitled pages (homepage, `/abap-custom-code-analysis`, `/knowledge`).
- Position of `/abap-custom-code-analysis` for "abap (static) code analysis" (target: page 33 → page 1–2).
- Whether the catalog→analysis internal links lift the analysis page's ranking.
