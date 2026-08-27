# GLM 5.3 review — 27 August 2026, triage

Every finding below was reproduced or refuted against the code before being
recorded here. Where a claim was partly right, the part that survives is stated
and the part that does not is stated too — a review is only useful if the wrong
half is recorded as wrong.

Raw output: `2026-08-27-glm-{engine,security,meta,ui_app,ui_components,ui_public}-raw.md`,
index and method: `2026-08-27-GLM-INDEX.md`.

**Coverage is partial and this file says where it stops.** 57 findings; 25
reproduced, 5 refuted, 3 were already on the Grok list, and 24 have not been
worked through yet. They are listed at the bottom, unexamined, rather than
quietly dropped.

---

## Blocking

**U1 · The "Differential Sandbox Tester" fabricates a passing verification and
signs a finding off on the strength of it.**

[transformation/page.tsx:141](../../app/(app)/project/[projectId]/transformation/page.tsx#L141):

```ts
const runDiffTest = () => {
  setDiffTestStatus('running');
  setTimeout(() => {
    setDiffTestStatus('success');
    // …then adds the complex-sql-join finding to signedOffIds
  }, 1200);
};
```

It waits 1.2 seconds and declares success. Nothing is executed, no S/4HANA system
is contacted, nothing is compared. The panel then renders **ResultSet Equivalence
Verified** over three green ticks — *"S/4HANA: 243 rows fetched. TypeScript
Node.js: 243 items compared. Type coercion holds."* — where 243 is a literal in
the markup.

Worse than a fabricated figure: the same callback adds the `complex-sql-join`
finding to `signedOffIds`, so the fake result marks the one finding class that
most needs real verification as reviewed. A screenshot of this panel is evidence
of nothing, and it is exactly the shape a customer photographs.

This is the defect class `tests/no-fabricated-figures.spec.ts` exists to prevent,
at the highest severity it can occur at. Twenty lines below it sits a comment
explaining two substitutions that were removed for the same reason.

---

## High — reproduced

**E1 · The canonical ABAP Cloud statement is reported as a Critical violation,
and it changes the recommended architecture.**

`MODIFY ENTITIES OF i_salesorder IN LOCAL MODE …` — the RAP write, the thing the
whole product is steering people towards — produces:

    [Critical] standard-table-write | object=ENTITIES
    "CRITICAL: Direct Write to SAP Standard Table ENTITIES"

`modifyMatch[1]` is `ENTITIES`, which is not in `['SCREEN','LINE','TABLE']`, not a
declared local object and has no Z/Y prefix, so it falls through to
`processTableAccess('ENTITIES', true, …)`. Reproduced end to end: the same snippet
routed on public cloud comes back **Side-by-Side (SAP BTP)** — the correct in-app
pattern is routed away from in-app.

**E3 · Curated mappings were published as lookups in SAP's data.** Fixed today;
see "What was fixed while verifying" below.

**E4 · `extractDataCoupling` reports work areas and internal tables as writes to
SAP standard tables.**

```abap
INSERT ls_wa INTO TABLE lt_items.
DELETE lt_items WHERE table_line = 'X'.
```

produces coupling entries for `LS_WA` and `LT_ITEMS` with `accessType: 'Write'`,
`isCustom: false` and the recommendation *"Verify API availability in SAP API
Hub"*. This is Grok finding E1 exactly. It was fixed in `evidence-model.ts` with
`collectLocalDataObjects` and the internal-table clause guards, and never ported
to the parallel path in `code-assessment.ts`.

**S2 · Client-supplied data is inside the HMAC-signed run.**

[runs/create:181](../../app/api/runs/create/route.ts#L181) takes
`gapsList = analysisObj.gaps` out of the client-posted narrative,
[line 216](../../app/api/runs/create/route.ts#L216) maps it into
`initialWorklist`, [line 281](../../app/api/runs/create/route.ts#L281) puts that
into `unsignedRunPayload.worklist`, and line 289 hashes the payload and signs it.

The route deliberately excludes the narrative from the hash — the comment says so
— and then admits a field parsed out of that same narrative. Crafted gap titles,
severities and effort values end up inside the immutable signed record.

**M2 · The lint gate checks nothing for TypeScript or React hooks.**

[eslint.config.mjs:32](../../eslint.config.mjs#L32) imports `tsPlugin` and
`pluginReactHooks` and then enables neither:

```js
rules: {
  ...pluginNext.configs.recommended.rules,
  ...pluginNext.configs["core-web-vitals"].rules,
},
```

`npm run lint` is a required step in the deploy pipeline. This is how two Rules of
Hooks violations (Grok V6 and V11) reached production through a green gate.

**P1 · The board deck invents effort and money from arbitrary multipliers.**

[board-deck.ts:211](../../lib/board-deck.ts#L211):

```ts
const weeksSaved   = Math.max(1, Math.round(complexity * 0.4));
const techDebtSaved = Math.round(complexity * 850);
```

rendered as *"Estimated Effort Saved: N Weeks"* and *"Annual Tech-Debt Saved:
€X/yr"*, and restated in the speaker notes as fact. `0.4` and `850` are not
measurements of anything.

**P2 · A missing score renders as a perfect score, in the board deck.**

`project.cleanCoreScore ?? 100` and `project.coverageEstimate?.percentage ?? 100`
(slides 1 and 2). A project that was never scored presents **100/100** and **100 %
coverage** to a steering committee. This is Grok V4 — `|| 10` tests and `|| 92`
coverage on the delivery screen — in a second file the earlier fix never touched.

**U3 · The Confluence export invents a maintenance cost and an ROI percentage.**

[analyze/page.tsx:556](../../app/(app)/project/[projectId]/analyze/page.tsx#L556):
`estimatedMaintenanceCost` falls back to
`Math.max(1500, (100 - cleanCoreScore) * 180 + 1200)` and is rendered into the
exported document as **€X/yr**; `legacyAssetScore` falls back to 82 / 55 / 35 by
string comparison; `cloudRoiSummary` falls back to a sentence promising *"reduce
core upgrade testing costs by ~40%"*. All three land in a document a customer
keeps.

---

## Medium — reproduced

**E5 · A real standard-table delete is silently missed.** `DELETE vbak WHERE
vbeln = '1'.` — legal Open SQL without `FROM` — produces **no findings at all**.
`isInternalDelete` matches `DELETE x WHERE` without checking whether `x` is a
declared local object. A false negative on exactly the statement class the engine
exists to catch. (Control: `DELETE lt_items WHERE …` correctly produces nothing.)

**E6 · Parameterised CDS views and association paths become phantom objects.**
`SELECT * FROM i_salesorder( p_display = 'X' )` yields object name
`I_SALESORDER(` — with the bracket — and is reported as a direct read on an SAP
standard table. `SELECT * FROM i_salesorder\_Item` yields `I_SALESORDER\_ITEM`,
backslash included. The released-object guard added for `i_salesorder` is
defeated by two ordinary syntax variants of the same view.

**E7 · Ordinary literals are reported as hardcoded environment parameters.**
`lv_type = 'SYSTEM_MODE'.` and `IF lv_env = 'PRD_CHECK'.` each produce a **High**
"Hardcoded Environmental Parameter". The prefix alternation has no boundary after
the token.

**E8 · The credit-management detector fires on unrelated calls — narrower than
claimed, still wrong.** GLM said "anywhere in the file"; the test is against the
statement, so a mention in a comment does nothing. But a credit word in a
*parameter value* is enough:

```abap
CALL FUNCTION 'Z_PRINT_LABEL' EXPORTING iv_text = 'credit risk disclaimer'.
```

produces a **High** "Credit Management Custom Logic". Worth knowing, because that
finding is the one now shown on the landing page as the business-decision example.

**E12 · A comma-separated `FROM` list records only the first table.**
`SELECT … FROM vbak AS a, vbap AS b` reports `VBAK` and misses `VBAP` entirely.

**S4 · One of three sibling OData routes never got the path guard.**
[fetch-odata-metadata:382](../../app/api/fetch-odata-metadata/route.ts#L382)
validates with `/^[A-Za-z0-9_./-]{1,120}$/`, which accepts any path shape;
`fetch-s4-metadata` and `test-s4-odata-read` both call `isSafeODataServicePath`,
which requires `^/sap/opu/odata/` and rejects `%2e`/`%2f`/`%5c`. With
`useStoredCredentials: true`, a caller can therefore request an arbitrary path on
the tenant host with the decrypted vault credentials attached. The doc comment on
`isSafeODataServicePath` states this is precisely what it exists to prevent, and
names the two routes it was unified across.

**S5 · `safeFetch` re-sends the Authorization header across a redirect.**
[url-validation.ts:206](../../lib/url-validation.ts#L206) follows redirects
manually with `{ ...init }` unchanged, so `Authorization: Basic <vault password>`
— or the Bearer token minted from the vault's OAuth secret — is sent again to
whatever host the response points at. No cross-origin stripping.

**S6 · Per-IP rate limits are bypassable.**
[rate-limit.ts:69](../../lib/rate-limit.ts#L69) takes
`x-forwarded-for?.split(',')[0]` — the **first** entry, which the client supplies;
proxies append the real address after it. Most damaging on the unauthenticated
`/api/export/verify` (30/min), which becomes an unlimited signature-verification
oracle.

**S7 · An OAuth token failure becomes an unauthenticated request that can report
success.** [test-s4-odata-read:67](../../app/api/test-s4-odata-read/route.ts#L67)
does `await tokenResp.json()` with no `tokenResp.ok` check. On a 400 or 401 the
token is absent, no header is set, and the OData GET proceeds anonymously — and
answers `status: 'success'` if the endpoint happens to respond.

**S9 · A partial failure charges the user twice for one run.**
`newRunDoc.set()` persists the signed run first; the two project writes follow.
If either of those throws, the catch refunds the unit *and* deletes the input
fingerprint, so the retry is charged as a fresh analysis. One successful run, two
units, plus an orphaned signed run with no `activeRunId`.

**S10 · A rejected credential reports `status: 'connected'`.**
[test-s4-connection:210](../../app/api/test-s4-connection/route.ts#L210) returns
`status: 'connected'` for HTTP 401 and 403. The human-readable message is honest
("credentials were rejected"); any UI branching on the status field shows green.

**C5 · The file list never loads after a page reload.**
`components/FileList.tsx` bails on `if (!auth.currentUser) return;` inside a
`useEffect(…, [])`. Firebase restores the session asynchronously, so on a reload
`currentUser` is null at mount, the effect returns, and the empty dependency
array means it never runs again.

**P3 · The landing page states 23,000+ objects beside its own computed 32,103.**
Hardcoded in both the mobile and desktop comparison tables
([page.tsx:519](../../app/page.tsx#L519), 603) while `catalogStats.classifiedObjects`
renders 32,103 further down the same page. Understated and drifting.

**E11 · `resolveConstants` is computed and never read.** `constantsMap` is built
at the top of `buildAbapEvidence` and appears nowhere else, so BDC findings name
the constant rather than the transaction code — `C_TCODE_VA02` instead of `VA02`,
which is what the reference run shows.

---

## Refuted — checked, not a defect

| # | Claim | Why it is wrong |
|---|---|---|
| S1 | The MFA session cookie is truncated by its own base64 padding, failing ~75 % of checks | The parser is naive, but Next.js serialises cookie values through `cookie.serialize`, which percent-encodes them (`=` → `%3D`), and the reader calls `decodeURIComponent`. Reproduced: `YWJj…bG8=` is sent as `…bG8%3D`. A live request in the CI log has the same shape, and the MFA lifecycle test would be failing three runs in four. |
| E3a | The catalog file marks the suspect entries "VERIFY" | The string appears **zero** times in `sap-api-catalog.ts`. The substance of E3 holds and is fixed; this detail was invented. |
| E8a | The credit detector fires on any `CALL FUNCTION` in a file mentioning credit | The test is against the statement, not the file. A mention in a comment produces nothing. The narrower defect is real and is recorded above. |
| M7 | `tsx` is declared twice with conflicting ranges | It appears once, `"tsx": "^4.21.0"`. The other three occurrences are `npm run` script bodies. |
| M8 | Marketing scripts hardcode a personal Windows desktop path | No such path in `scripts/`. |

## Already on the Grok list

| # | Restates |
|---|---|
| S3, M1 | **V9** — the published fallback signing key. GLM adds one detail worth keeping: the guard is `NODE_ENV === 'production' && !emulator`, so a preview deployment signs with the committed constant. |
| M3 | **V18** — tests that pass vacuously when the element they name is absent. |

---

## What was fixed while verifying

**S8 · Registration activated an account whether or not the terms were accepted.**
A defect v2.4.2 introduced. `/api/account/register` recorded consent where it was
given and activated either way, so `acceptedTerms: false` produced an `approved`
account with no `consent_events` row — which makes the V14 fix optional in
practice. Fixed; guarded by an emulator test.

**E3 · Curated mappings were presented as lookups in SAP's published data.**

`buildMerged()` resolves two layers and knows which is which — the repository
layer is SAP's release data (`confidence: 'sap-official'`), the curated layer in
`sap-api-catalog.ts` is hand-written field-level knowledge (`'curated'`), and the
curated one wins. `evidence-model.ts` then discarded the distinction, stamped
every replacement `'Catalog Match'`, and hung SAP's catalog version beside it.
Two UI sites went further and relabelled `'Verified'` as `'Catalog Match'` on
screen. Two tests pinned the behaviour, one of them named *"should produce
Catalog Match instead of Verified for known SAP tables"* — a decision, not an
oversight.

Measured against the shipped `objectReleaseInfoLatest.json`: **all 21 findings in
the reference run's settled bucket resolve through the curated layer; none
through SAP's data.** The landing page said "a released SAP successor from SAP's
own data" next to six pairs, and it was true of none of them.

    VBAK   shown: API_SALES_ORDER_SRV              SAP: I_SALESDOCUMENT
    VBAP   shown: API_SALES_ORDER_SRV              SAP: I_SALESDOCUMENTITEM
    MARA   shown: API_PRODUCT_SRV                  SAP: I_PRODUCT (+4)
    KNA1   shown: API_BUSINESS_PARTNER             SAP: I_CUSTOMER
    KNB1   shown: I_CustomerCompany                SAP: I_CUSTOMERCOMPANY
    MARD   shown: I_MaterialStockInStorageLocation SAP: I_PRODUCTSTORAGELOCATIONBASIC

Most are defensible mappings — `API_SALES_ORDER_SRV` is a real SAP OData service.
`MARD` is not: `I_MaterialStockInStorageLocation` appears nowhere among the 6,784
released `I_*` views in SAP's list, while SAP names a different one.

Fixed in two commits: the roll-call now reads the repository layer directly, and
`replacementProvenance()` maps `'sap-official'` to `'Catalog Match'` with the
catalog version and `'curated'` to `'Verified'` without it. `bucketOf` accepts
both as settled, so the published numbers do not move. The two UI sites stopped
relabelling. Both pinning tests were rewritten to assert the invariant that
actually matters: nothing is inferred, and the catalog version only ever rides on
a genuine lookup.

---

## Not yet worked through

Listed so the count is honest. None of these has been reproduced or refuted.

- **Engine:** E2 (a usage export with no call-count column buckets everything as
  dormant → "retire-candidate"), E9 (a missing `CL_*` superclass is dropped while
  the model reports the hierarchy resolved), E10 (`differentialVerified` marks
  every exact-match SELECT verified).
- **Meta:** M4 (unpinned remote installer in a workflow holding a PR-writing
  token — the workflow's own comment already documents the trade-off), M5, M6.
- **Product shell:** U2 (displayed Clean Core Score diverges from the signed run),
  U4 (delivery page always green), U6 (Proceed jumps to Delivery on score alone),
  U7 ("Malicious Payload Check passed" for code never scanned). U5 (TCO divides by
  zero for a clean project) is unverified, but its `scoreBefore =
  project?.cleanCoreScore || 30` is the same substitution class as U3 and P2.
- **Components:** C1, C2, C3, C4, C6, C7. C8 (crash on a pending server
  timestamp) looks wrong on reading — `new Date(null)` yields the epoch, not a
  crash — but was not confirmed either way.
- **Public content:** P4 through P12, including the privacy-policy finding (§3
  makes an unconditional "not used for training" promise that the whitepaper's own
  "Honest boundary" box qualifies). That one deserves attention regardless of
  severity.

## Method note

Five of fifty-seven claims were wrong, and two more were right about a defect
while wrong about its mechanism. The pattern from the Grok pass repeats: the
model is a good finder and an unreliable witness. Reproduce first — for the
engine that means one ABAP snippet, which settles most of them in seconds.
