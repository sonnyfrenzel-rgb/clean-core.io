# GLM full-codebase review — Public pages and content

**Model:** `z-ai/glm-5.3` via OpenRouter · **Date:** 2026-08-27 · **Pass:** `ui_public`
**Bundle:** 67 files, 527 KB.
**Usage:** 132332 prompt / 7385 completion tokens, 154s.

Secrets, env files, keys, service accounts, the public Firebase web config and the generated SAP
catalog data were excluded from the bundle by path, and a pattern scan over the assembled text
refused nothing.

**This output is unedited.** It has NOT been verified against the code. Two of roughly twenty
findings in the comparable Grok 4.6 review were wrong; treat every claim below as a hypothesis until
it is reproduced. See `docs/reviews/2026-08-26-TRIAGE.md` for how that was done.

---

## Findings

### 1. Board deck fabricates savings figures from arbitrary multipliers
- **Severity:** High
- **File:** `lib/board-deck.ts` (slide 5, ~lines with `weeksSaved` / `techDebtSaved`)
- **What goes wrong:** `weeksSaved = Math.round(complexity * 0.4)` and `techDebtSaved = Math.round(complexity * 850)` are invented constants with no basis in any measurement, yet the slide is titled "Evidentiary estimation of savings and impact" and the speaker notes assert "This translates to an estimated effort savings of X person-weeks … roughly €Y annually". A customer puts a complexity-50 project in and the deck tells their board "20 Weeks saved, €42,500/yr tech-debt saved" — a number no code can recompute, in the artifact whose entire selling point is recomputability.
- **Fix:** Remove the euro/week figures or derive them from inputs the customer supplies (rates, effort model) and label them user-supplied assumptions in the provenance manifest — never present a multiplier as engine evidence.

### 2. Board deck renders missing scores as perfect scores
- **Severity:** High
- **File:** `lib/board-deck.ts` (slide 1 and slide 2)
- **What goes wrong:** `project.cleanCoreScore ?? 100` and `project.coverageEstimate?.percentage ?? 100`. A project whose analysis run failed to populate scores (e.g. a legacy pre-router run, exactly the case `lib/run-capabilities.ts` exists for) produces a board slide reading "Clean Core Score 100/100, Coverage 100%" — a false success state handed to a governance audience. Additionally, `fullySupportedCount = inventoryCount - partialCount - notSupportedCount` subtracts *finding occurrences* from *inventory objects*; a file with 10 inventory items and 15 partial findings reports 0/10 (or, clamped, a silently wrong number).
- **Fix:** Default missing scores to "—" / "not available" and flag the slide, and compute the supported count from per-object rollup levels rather than subtracting finding counts from inventory counts.

### 3. Landing page hardcodes "23,000+ objects" next to the computed catalog count
- **Severity:** Medium
- **File:** `app/page.tsx` (comparison table, both mobile and desktop variants — "Maps against SAP's official Cloudification Repository (23,000+ objects)")
- **What goes wrong:** The same page renders `{catalogStats.classifiedObjects}` (≈357 per the catalog comments) as the badge "N classified SAP objects", while the comparison table claims mapping "against … (23,000+ objects) with curated field-level precision". The product's merged catalog classifies ~357 objects; the 23,000 figure is typed into the copy, describes the upstream repo, and implies a mapping coverage the engine does not have. It is precisely the "figure no code computes" this product promises not to publish. ("Auto-synced weekly" in the same row is likewise asserted, not derived from the sync artifact.)
- **Fix:** Use `getCatalogStats()` figures in the comparison row, or state the upstream repository size and the classified count as two separate, sourced numbers.

### 4. Landing FAQ structured data claims fully automatic conversion
- **Severity:** Medium
- **File:** `app/page.tsx` (FAQPage JSON-LD, "How does Clean-Core.io help with ABAP modernization?")
- **What goes wrong:** The marked-up answer says the tool "automatically analyzes ABAP code and **converts** it to SAP BTP CAP Node.js services or cloud-ready RAP components." Every other surface (Terms §3, the honesty section on the same page, `lib/clean-core-capabilities.ts`) states output is an AI draft requiring architect review and that Dynpro/dynamic/native-SQL patterns are handed back, not converted. An answer engine quotes the structured data, putting the strongest false version of the claim in front of customers.
- **Fix:** Reword to "drafts a first Clean-Core-compliant RAP/CAP implementation for architect review", matching the visible copy.

### 5. Catalog module pages claim every listed object "carries a released successor"
- **Severity:** Medium
- **File:** `app/catalog/module/[area]/page.tsx` (intro paragraph and `generateMetadata` description); same wording on `app/catalog/page.tsx` area cards ("N objects with a released successor")
- **What goes wrong:** `getObjectsByModule` returns classified objects, and the page's own table renders a "no released path" cell for rows without a successor. Yet the visible copy says "{rows.length} objects in this area carry a released S/4HANA successor" and the meta description repeats it. For any area containing no-path objects, the stated count is simply wrong — an incorrect figure on the reference pages whose value proposition is factual accuracy.
- **Fix:** Count only rows with `r.successor` for that sentence (and the area `objectCount` labels), or reword to "N classified objects, M with a released successor".

### 6. Signed audit pack falls back to a hardcoded catalog version
- **Severity:** Medium
- **File:** `lib/audit-pack.ts` (`generateExecutiveSummary`, `generateModelCard`, `generateArchitectureDecisionRecord` — `(mc as any)?.catalogVersion || '2024.FPS02'`)
- **What goes wrong:** If `modelCard.catalogVersion` is absent (older runs, or a code path that never set it), the audit pack — the HMAC-signed, "reproducible" evidence artifact — asserts "SAP API Catalog: 2024.FPS02", a version that may never have been used for the analysis. The signature then attests to a false provenance figure. The real merged version is available from `getMergedCatalogVersion()`.
- **Fix:** Fall back to `getMergedCatalogVersion()` (or render "—") instead of a hardcoded version string.

### 7. Privacy policy makes an unconditional "not used for training" promise the whitepaper itself disclaims
- **Severity:** Medium
- **File:** `app/datenschutz/page.tsx` (§3) vs `app/whitepaper/page.tsx` (security section 04, "Honest boundary" box)
- **What goes wrong:** The Datenschätterklärung states flatly: "Under Google's applicable API data-use terms, this content is not used to train Google's foundational AI models." The whitepaper explicitly says this only holds for the paid Gemini API and that "if you bring a free-tier key, Google's free-tier data-use terms govern instead. We state the applicable terms rather than an absolute promise we cannot control." A BYOK user on a free-tier key is being told something in the GDPR privacy policy that the product's own documentation says is not guaranteed — a legal-copy-vs-reality mismatch.
- **Fix:** Qualify §3 the way the whitepaper does (paid-tier terms vs. free-tier/BYOK terms), or restrict the claim to platform-key processing.

### 8. Licenses page presents hardcoded counts as a generated SBOM inventory
- **Severity:** Low
- **File:** `app/licenses/page.tsx` (`TREE_SUMMARY`, counts 540/89/69/…)
- **What goes wrong:** The copy says "A CycloneDX SBOM is generated by our security workflow and reviewed per build … the license inventory breaks down approximately as follows", but the numbers are literals in the page. They will silently drift from the actual tree on every dependency change while still reading as build-generated. Not customer-facing financial figures, but the same "computed, not asserted" principle the site advertises.
- **Fix:** Generate the summary at build time from the SBOM artifact, or drop the "generated by our security workflow" framing for these static numbers.

### 9. Homepage JSON-LD breadcrumb trail doesn't exist on the page
- **Severity:** Low
- **File:** `app/page.tsx` (`BreadcrumbList` in `schemaJson`)
- **What goes wrong:** The homepage emits a 6-item BreadcrumbList (Home → How It Works → … → About) but renders no breadcrumb navigation; a breadcrumb trail whose first item is the page itself and whose remaining items are unrelated top-level pages is structured data that disagrees with the visible page and is invalid per Google's guidelines (the last item should be the current page).
- **Fix:** Remove the BreadcrumbList from the homepage graph; keep it for the pages that actually render breadcrumbs (e.g. catalog object pages, which do it correctly).

### 10. Homepage JSON-LD bypasses the `<`-escaping helper used everywhere else
- **Severity:** Low
- **File:** `app/page.tsx` (`dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}`)
- **What goes wrong:** All other pages use `jsonLdHtml()` specifically because `JSON.stringify` does not escape `<` and a value containing `</script>` breaks out of the script element. The homepage is the one page that inlines raw stringify. Today the content is static so there's no live injection path, but any future field sourced from user/project data (e.g. a testimonial or dynamic stat label) becomes an XSS vector on the highest-traffic page.
- **Fix:** Use `jsonLdHtml(schemaJson)` like the catalog, features and reference pages do.

### 11. Catalog object FAQ can answer "Use the released successor undefined" (uncertain)
- **Severity:** Low (uncertain — depends on `catalog-service` internals not in this batch)
- **File:** `app/catalog/[object]/page.tsx` (FAQPage, second question)
- **What goes wrong:** The answer branch is `noPath ? "…not released…" : "Use the released successor ${successor}…"`. If a state exists where `hasNoReleasedApiPath(name)` is false but `successor` is undefined (entry present, no successors, no view), the FAQ emits "Use the released successor undefined instead of …" while the visible page shows the amber "no clean path" box. I cannot confirm this state is reachable without `resolveApi`/`hasNoReleasedApiPath`; if those two are strictly complementary, this is a non-issue.
- **Fix:** Gate the second branch on `successor` rather than `noPath`, so the FAQ can never reference an undefined successor.

### 12. Glossary calls released interfaces "certified by SAP"
- **Severity:** Low
- **File:** `lib/glossary.ts` ("Released Interface" entry)
- **What goes wrong:** "An official SAP object … explicitly **certified** by SAP as stable and released." SAP *releases* APIs; it does not certify them, and the site elsewhere is careful to state it makes no SAP-certification claims itself ("Never claim 'SAP-approved', 'SAP-certified'" — chatbot knowledge base). The wording invites exactly the conflation the trademark notices disclaim.
- **Fix:** Change "certified" to "released" / "published as stable".

**Not reported (checked and fine):** the reference-analysis figures (genuinely computed at request time from the shipped file), llms.txt (all figures from `getCatalogStats()`), the terms/quota copy vs `reserveRunQuota` (metering unit and BYOK exemption match), the unsubscribe token parsing (dot-safe), and the sitemap/robots split. I could not verify the "Transformation Showroom — verified, compiled, and tested" claim or the whitepaper's `I_SalesOrderTP` mapping from the files provided; if you want those checked, they need their own pass.