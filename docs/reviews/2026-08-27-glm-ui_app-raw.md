# GLM full-codebase review — Authenticated product shell

**Model:** `z-ai/glm-5.3` via OpenRouter · **Date:** 2026-08-27 · **Pass:** `ui_app`
**Bundle:** 25 files, 957 KB.
**Usage:** 226759 prompt / 2812 completion tokens, 69s.

Secrets, env files, keys, service accounts, the public Firebase web config and the generated SAP
catalog data were excluded from the bundle by path, and a pattern scan over the assembled text
refused nothing.

**This output is unedited.** It has NOT been verified against the code. Two of roughly twenty
findings in the comparable Grok 4.6 review were wrong; treat every claim below as a hypothesis until
it is reproduced. See `docs/reviews/2026-08-26-TRIAGE.md` for how that was done.

---

## Findings

**1. "Differential Sandbox Tester" fabricates a passing verification result**
- Severity: **Blocking**
- File: `app/(app)/project/[projectId]/transformation/page.tsx` — `runDiffTest` (around the `diffTestStatus` state / drawer Section 5)
- After a 1.2 s `setTimeout` with no HTTP call, no query, and no comparison, the UI renders "✅ ResultSet Equivalence Verified — S/4HANA: 243 rows fetched / TypeScript: 243 items compared / Type coercion holds". The "243 rows" is a hardcoded string. It also silently auto-signs off the `complex-sql-join` finding, inflating the compliance score. A customer photographs this as proof of data parity that was never measured — the exact worst defect class for this product.
- Fix: actually execute the differential query against the configured tenant (or disable the widget when no live connection exists), and render the real row counts. Remove the automatic sign-off.

**2. Displayed Clean Core Score diverges from the HMAC-signed run record**
- Severity: **High**
- File: `app/(app)/project/[projectId]/analyze/page.tsx` — `liveCleanCoreScore` useMemo
- The signed run stores `computedRouteReport.cleanCoreScore` (the deterministic engine's figure), but the gauge, sticky header and exported report show `liveCleanCoreScore` = 60 % construct coverage + 30 % AI `standardFit` + 10 % stored score, with a default `standardFitBonus = 80` when the analysis JSON can't be parsed. Same page, two numbers: the `Stepper` gets `project?.cleanCoreScore` (signed) while the big gauge shows the blended value. A customer recomputing the score from the audit pack gets a different figure than the one on screen — which destroys the product's core claim.
- Fix: display the signed run's score, or persist the blended value into the run at creation time so screen and pack agree. Never default `standardFitBonus` silently.

**3. Confluence export invents maintenance cost, asset score and ROI figures**
- Severity: **High**
- File: `app/(app)/project/[projectId]/analyze/page.tsx` — `bizFallback` in `exportToConfluence` (and the identical fallback in `renderAnalysisContent`)
- When Gemini omits `businessValueAnalysis`, the export shows "Estimated Annual Maintenance Cost: €X/yr" computed as `max(1500, (100−score)·180+1200)`, a `legacyAssetScore` of 82/55/35 picked from the fit label, and a "~40% reduction" ROI summary — none of which were measured or estimated by anyone. These land in a document formatted for steering committees.
- Fix: render "not estimated" when the AI did not supply the field; never synthesize currency figures from the score.

**4. Delivery page always shows green "Ready for Deployment"**
- Severity: **High**
- File: `app/(app)/project/[projectId]/delivery/page.tsx` — Integrity Report card, "QA Status" block
- The test-count and coverage lines were fixed to be honest, but the footer still unconditionally renders a pulsing green "Ready for Deployment" — including when `testCaseCount === 0`, coverage is undefined, or tests failed. False success state on the handover screen.
- Fix: derive the QA status from `testCaseCount`, `coveragePercentage` and the latest test results (e.g. "Not verified" when no suite exists).

**5. TCO calculator divides by zero for already-clean projects**
- Severity: **Medium**
- File: `app/(app)/project/[projectId]/tco/page.tsx` — `calculations` useMemo
- `scoreBefore = project?.cleanCoreScore || 30`; if the project scored ≥ 95, `factor ≈ 1`, `modernAnnualTotal ≈ legacyAnnualTotal`, so `annualSavings ≈ 0` and `paybackMonths = oneTimeCost/0·12` → `Infinity` and `roiYear1 = NaN`, rendered as "Infinity Months" / "NaN% Return" on the executive card. Also, a genuine score of 0 silently becomes 30 via `|| 30`.
- Fix: guard `annualSavings <= 0` and show "No savings projected at this score"; use `?? 30` instead of `|| 30`.

**6. Dashboard "Proceed" jumps to Delivery based on score alone**
- Severity: **Medium**
- File: `app/(app)/dashboard/page.tsx` — `handleProceed`
- `if (project.cleanCoreScore && project.cleanCoreScore > 90) router.push(delivery)` runs before the status checks, so a project still in `uploaded` status (code staged, nothing analyzed/generated/tested — the score can persist from an earlier run on different source) skips straight to handover, bypassing design, transformation, testing and documentation.
- Fix: remove the score shortcut or gate it on `status === 'completed'`.

**7. "Malicious Payload Check passed" badge shown for code that was never scanned**
- Severity: **Medium**
- File: `app/(app)/project/[projectId]/analyze/page.tsx` — Security Scan & Terms section
- `scanForMaliciousCode` runs only in `handleFile` (file upload/drop). Code pasted into the textarea bypasses it entirely, yet the green "Malicious Payload Check passed: the file is clean and safe for processing" panel renders whenever `legacyCode` is non-empty. A false security assurance for the paste path.
- Fix: run the same scan on textarea input (or only render the "passed" badge when a scan actually ran on the current content).

**Uncertain / not reported:** `getStats` in `testing/page.tsx` computes `passRate = passed/total` which is `NaN` if `testResults` is an empty array (empty array is truthy so the guard doesn't catch it) — I could not confirm from these files whether `TestingPieChart` renders that NaN, so I flag it rather than assert it. The `getModernMarkers` fallback in `transformation/page.tsx` also fabricates evenly-spread grounding markers when none are found in the generated code, but it only affects marker dots, not a stated figure.