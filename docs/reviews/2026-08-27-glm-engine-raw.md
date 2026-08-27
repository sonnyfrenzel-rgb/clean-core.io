# GLM full-codebase review — ABAP evidence engine

**Model:** `z-ai/glm-5.3` via OpenRouter · **Date:** 2026-08-27 · **Pass:** `engine`
**Bundle:** 33 files, 231 KB.
**Usage:** 61282 prompt / 10512 completion tokens, 248s.

Secrets, env files, keys, service accounts, the public Firebase web config and the generated SAP
catalog data were excluded from the bundle by path, and a pattern scan over the assembled text
refused nothing.

**This output is unedited.** It has NOT been verified against the code. Two of roughly twenty
findings in the comparable Grok 4.6 review were wrong; treat every claim below as a hypothesis until
it is reproduced. See `docs/reviews/2026-08-26-TRIAGE.md` for how that was done.

---

## Findings

---

**1. RAP `MODIFY ENTITIES` — the correct ABAP Cloud pattern — is reported as a Critical direct write to a standard table**
- Severity: **High**
- File: `lib/abap/evidence-model.ts`, the `MODIFY` branch of the statement loop (`modifyMatch` / `processTableAccess`)
- Scenario: `MODIFY ENTITIES OF ro_salesorder IN LOCAL MODE ...` — the canonical RAP statement. `modifyMatch[1]` is `ENTITIES`, which is not in `['SCREEN','LINE','TABLE']`, not in `FAKE_TABLES`, not a declared local object, not SAP-listed, no Z/Y prefix → `processTableAccess('ENTITIES', true, …)` emits a **Critical** "Direct Write to SAP Standard Table ENTITIES". On public cloud this also flips `needsBtp` in `extensibility-router.ts` and forces the Side-by-Side route — a false Critical that changes the recommended architecture for the one code style that is already clean.
- Fix: skip the write path when the first token is `ENTITIES`/`ENTITY` (and ideally recognize `MODIFY ENTITIES` as a positive signal, like the released-CDS check).

**2. A usage export without a call-count column classifies every object as dormant → "retire-candidate"**
- Severity: **High**
- File: `lib/abap/usage-parser.ts`, record loop (`callCount: callCount ?? 0`) + `lib/abap/usage-join.ts` `classifyUsageBucket`
- Scenario: upload a CSV with `PROGRAM` and `LAST_USED` columns but no `CALLS`/`EXECUTIONS` column. `mapping.callCount` is undefined, `parseCallCount(undefined)` → undefined → `?? 0` → every record has `callCount === 0` → bucket `dormant` → quadrant `retire-candidate`. This directly violates the module's own §5 safeguard ("missing data is not evidence of non-use") and puts a retire recommendation in front of the customer built on absent data.
- Fix: when no call-count column is mapped, either hard-error like the missing object-name column, or mark those records so they bucket as `unknown` (e.g., keep `callCount` undefined and treat `undefined` ≠ 0 in `classifyUsageBucket`).

**3. Seed catalog entries the file itself marks "VERIFY" are published as `Catalog Match` with a catalog version — several successor names appear not to exist**
- Severity: **High**
- File: `lib/abap/sap-api-catalog.ts` (entries `DD03L→I_TableField`, `USR02→I_UserAccount`, `TVARV→I_VariantVariable`, `CDHDR/CDPOS→I_ChangeDocument(Item)`, `NAST→I_OutputManagement`, `TSTC→I_TransactionCode`); consumed in `evidence-model.ts` `processTableAccess` as `confidence: 'Catalog Match'` + `catalogVersion`
- Scenario: `SELECT * FROM dd03l …` produces a finding whose replacement is `I_TableField` at confidence "Catalog Match" stamped with `2024.FPS02` — i.e., presented as a looked-up fact from SAP's data. The file header says "Source: SAP API Business Hub …" but the entries are a hand-seeded list with no verification artifact behind it; I am not certain about every individual name, but `I_TableField`, `I_UserAccount` and `I_VariantVariable` do not correspond to released views I can identify, and the code comment ("VERIFY … before use") concedes the point. For a product whose argument is recomputable numbers, an invented successor shown next to a version string is the worst failure mode. (`lib/abap/code-assessment.ts` `STANDARD_TABLE_MAP` repeats several of the same names.)
- Fix: verify each entry against the released-objects list (the Cloudification artifact is already in the build — cross-check `CR.entries` for the successor being `released`), and drop or downgrade to `Candidate` anything that cannot be confirmed.

**4. `extractDataCoupling` reports internal-table operations as database writes**
- Severity: **High**
- File: `lib/abap/code-assessment.ts`, `extractDataCoupling` (INSERT/UPDATE/MODIFY/DELETE branches)
- Scenario: `INSERT ls_wa INTO TABLE lt_items.` → `insertMatch[1]` = `LS_WA` → a High-risk "write" to table `LS_WA`; `DELETE lt_itab WHERE flag = 'X'.` → write to `LT_ITAB`. `evidence-model.ts` fixed exactly this (local-object collection + internal-table clause guards, see `tests/false-positive-guard.spec.ts`), but the parallel assessment path in `code-assessment.ts` never got the fix, so any surface calling `extractDataCoupling` (it is exported and exercised by `tests/abap-data-coupling.spec.ts`) still produces fabricated coupling entries that feed `recommendArchitecture` (custom-table writes → CAP route).
- Fix: port the `collectLocalDataObjects` + `INTERNAL_TABLE_CLAUSE` guards from `evidence-model.ts`, or route this path through the same detector.

**5. `DELETE dbtab WHERE …` (valid Open SQL database delete) is silently missed**
- Severity: **Medium**
- File: `lib/abap/evidence-model.ts`, DELETE branch (`isInternalDelete` logic)
- Scenario: `DELETE vbak WHERE vbeln = '1'.` — legal database form without `FROM`. `isDbDelete` is false, `isInternalDelete` (`DELETE x WHERE`) is true → skipped entirely. A real standard-table delete produces no finding, no score deduction, no routing impact — a false negative on exactly the class of statement the engine exists to catch.
- Fix: only treat `DELETE x WHERE` as internal when `x` is a declared local data object; otherwise treat as a database delete.

**6. Parameterized CDS views and association paths are mangled into phantom table names**
- Severity: **Medium**
- File: `lib/abap/evidence-model.ts`, SELECT branch (`words[0]?.replace(/[~,]/g, '')`)
- Scenario: `SELECT * FROM i_salesorder( p_display = 'X' ) …` yields name `I_SALESORDER(` — the released-state lookup misses, so the correct ABAP Cloud pattern is reported as a "Direct Read from SAP Standard Table I_SALESORDER(" (High on public cloud). Same for association paths `FROM i_salesorder\_item` → `I_SALESORDER\_ITEM`. The released-object guard added for `i_salesorder` is defeated by syntax variants of the same view.
- Fix: strip a trailing `(...)` parameter list and `\…` association path from the token before the catalog/released lookup.

**7. Hardcoded-value detector fires on any string literal starting with PRD/SYS/CLNT**
- Severity: **Medium**
- File: `lib/abap/evidence-model.ts`, hardcoded-value branch (`/(?:['"](?:C:\\|PRD|CLNT|SYS|HTTP…))/i`)
- Scenario: `lv_type = 'SYSTEM_MODE'.` or `IF lv_env = 'PRD_CHECK' …` → a **High**-severity "Hardcoded Environmental Parameter" finding with Medium confidence on ordinary business literals. The prefix match has no word boundary after the token.
- Fix: require the literal to be exactly the environment token (`'PRD'`, `'SYS'`, …) or a system-ID-shaped value, not a prefix.

**8. Credit-management detector fires on any `CALL FUNCTION` statement merely containing "credit"/"FSCM" anywhere**
- Severity: **Medium**
- File: `lib/abap/evidence-model.ts`, credit-management branch (`/Z_CREDIT|CREDIT.*EXPOSURE|CREDIT.*RISK|FSCM/i.test(text) && /CALL\s+FUNCTION/i`)
- Scenario: `CALL FUNCTION 'Z_GET_NOTES' EXPORTING iv_text = 'Credit note required'.` → High-severity "Credit Management Custom Logic" with `needsBusinessDecision: true`, which also forces feasibility `needs-architect` in `usage-join.ts`. The keyword test runs against the whole statement including parameter literals.
- Fix: match the keyword against the function-module name (or a `Z_CREDIT*` name pattern), not the full statement text.

**9. A missing `CL_*` superclass is silently dropped, and the model then claims the hierarchy is fully resolved**
- Severity: **Medium**
- File: `lib/abap/class-model-resolver.ts`, superclass branch (`if (!parent && !node.superClass.startsWith('CL_') …)`)
- Scenario: `CLASS zcl_x DEFINITION INHERITING FROM cl_gui_alv_grid.` with the SAP source not uploaded. The superclass is neither added to `missing` nor present in `nodesMap`; `visit()` pushes the key anyway, `resolved` stays true, and `findings-detector.ts` emits "Inheritance chain fully resolved" — an unprovable success claim about a chain whose ancestor was never seen.
- Fix: record standard-prefixed missing superclasses as `reduces-confidence` missing dependencies (they can never be uploaded), and let the deep-inheritance finding reflect that.

**10. Run-level `differentialVerified` flag marks every exact-match SELECT as verified**
- Severity: **Medium**
- File: `lib/abap/complex-join-findings.ts` (`const verified = opts.differentialVerified && cds?.exact`)
- Scenario: a caller sets `differentialVerified: true` after differential-testing *one* query; every other exact CDS match in the run is then emitted at level `fully` with `requiresSignOff: false` — a false success state for queries that were never tested. The option's own doc comment says "for this select", but it is applied to all selects in the call.
- Fix: key the flag per select (e.g., pass a set of verified source locations) instead of a single boolean.

**11. `resolveConstants` is computed but never used — BDC findings name the variable, not the transaction**
- Severity: **Low**
- File: `lib/abap/evidence-model.ts` (`constantsMap` built at top of `buildAbapEvidence`; `tcodeMatch` in the BDC branch)
- Scenario: `CONSTANTS c_tcode_va02 VALUE 'VA02'.` + `CALL TRANSACTION c_tcode_va02 …` → finding titled "Legacy BDC to TCode C_TCODE_VA02" instead of `VA02`; the constant-resolution machinery exists precisely for this and is dead code.
- Fix: look `tcode` up in `constantsMap` before using the raw token.

**12. Comma-separated `FROM` lists record only the first table**
- Severity: **Low**
- File: `lib/abap/evidence-model.ts` and `lib/abap/code-assessment.ts`, SELECT branch (split on `JOIN` only)
- Scenario: legacy `SELECT … FROM vbak, vbap INTO …` — the split produces one part `"vbak, vbap"`; `words[0]` strips the comma but `VBAP` is never extracted → the second table's read goes unreported in both engines.
- Fix: also split the FROM area on top-level commas before taking the first token of each part.

---

**Not reported (checked and judged fine or out of scope):** the `gradeFromSapStates` precedence order (release-before-classification) is correct and well-tested; the FUGR keying by function module in `normalizeClassificationFile` matches how `CALL FUNCTION` names are looked up; `tokenize`'s quote handling is correct for ABAP's non-spanning literals; `result-diff` normalization matches its tests. One item I looked at and am **explicitly unsure** about: `gradeFromCatalogState('deprecated', hasSuccessor=true) → 'C'` — SAP semantics for deprecated-with-successor arguably belong in B/D rather than C, but the code documents its reasoning and I cannot cite SAP doctrine either way, so I am not asserting it as a defect.