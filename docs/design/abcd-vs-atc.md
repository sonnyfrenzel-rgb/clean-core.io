# Clean core level A–D against what ATC reports

Roadmap 3.0.13, row "Level C/D against what ATC reports" (owner decision 14.10.2026).
Status: research done 14.10.2026 from public sources only; **not yet verified in an SAP
system**. Section 6 is the recipe for that. Nothing here changes a grade except the
customer's own enhancement point (section 4), which is engine-version gated.

## 1. The question

Our grade (`lib/abap/abcd-classification.ts`, `docs/ARCHITECTURE.md` §4.2) merges SAP's two
Cloudification Repository files. The customer's own tool is the ABAP Test Cockpit with the
clean core check variant. Where the two disagree, a reader who runs ATC sees our "Level D"
next to an ATC information message and stops trusting either. The row asks: what does the
clean core ATC check report for each state, and where does our grade differ?

## 2. What the public sources say

How the research was done: web search snippets, SAP's GitHub repositories
([SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc),
[SAP/project-kernseife](https://github.com/SAP/project-kernseife)) and public blogs. SAP Help,
the SAP API Business Hub and the Fiori apps library were **not** fetched (their terms forbid
automated access); SAP notes are behind a login and were not read — what is said about Note
3565942 comes from secondary sources. Certainty: **high** = SAP's own public artifact says it;
**medium** = two or more independent secondary sources agree; **low** = one secondary source or
an inference.

| Topic | Finding | Certainty | Source |
|---|---|---|---|
| The check | SAP Note 3565942 brings the clean core checks "Usage of APIs" and "Allowed Enhancement Technologies" (check object `SYCM_USAGE_OF_APIS`, class `CL_YCM_CC_CHECK_API_USAGE`); they read `objectClassifications_SAP.json`. | high | repository README of SAP/abap-atc-cr-cv-s4hc; Kernseife source (subclass of `CL_YCM_CC_CHECK_API_USAGE`) |
| Variant | The variant is `ABAP_CLEAN_CORE_DEVELOPMENT`; shipped on SAP BTP ABAP environment and S/4HANA 2025 FPS01+, by note on 2023. A further note analyser (3627152) is recommended on 2023. | medium | [saptechnicalguru.com](https://www.saptechnicalguru.com/abap-clean-core-development/), [SAP PRESS blog](https://blog.sap-press.com/configuring-the-abap-test-cockpit-and-transport-gate-in-sap-s4hana) |
| Level ↔ priority | The level of an object is the highest ATC priority it triggers: no finding = A, priority 3 (information) = B, priority 2 (warning) = C, priority 1 (error) = D. | medium | SAP Learning course snippet "Setting Up For Clean Core Development"; [SAP community member blog on the A–D levels](https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956) (search snippet) |
| States of the classification file | `classicAPI`, `noAPI`, and — in the schema, not yet in the data — `internalAPI`. Labels `remote-enabled`, `transactional-consistent`. | high | [`schema/classicAPI-schema.json`](https://github.com/SAP/abap-atc-cr-cv-s4hc/blob/main/schema/classicAPI-schema.json) |
| Classification first | The check asks the classification file first; the release file (`objectReleaseInfo…`) only answers *released* (no message) and *deprecated*. Everything else falls through. | medium | Kernseife's override of `evaluate_message_code` mirrors that order (inference from SAP-authored code, not SAP's own class) |
| Unclassified SAP object | Reported as **"Usage of internal API"**, which makes the object level **C**. | medium | GitHub issue [#90](https://github.com/SAP/abap-atc-cr-cv-s4hc/issues/90) (a classic API wrongly reported as internal API "rates … Level C instead of … Level B"); SAP KBA 3707815 snippet names the message "Usage of Internal API" |
| Classic API | Reported as information (priority 3) → B; a "transactional-consistent classic API" message exists. | medium | level ↔ priority mapping above; KBA 3707815 snippet |
| noAPI | Error (priority 1) → D. | medium | software-heroes.com level article; level ↔ priority mapping |
| Deprecated | A message code `deprecated` exists in the check. Its priority is **not determined**: one community post reports the "with successor" and "without successor" messages both at priority 2 and asks to lower the latter. | low | Kernseife source (`message_codes-deprecated`); community thread snippet |
| Tables | The check has separate message codes for reading an SAP table, updating it, and using it in a CDS view; a table used only as a type falls through to the classification. Priorities **not determined**. Kernseife's own (SAP-authored, not ATC's) matrix rates read C, update D, type use B. | low | Kernseife `evaluate_tabl_message_code`, `defaultSetup.json` |
| Object types | The standard check skips data elements (`get_allowed_usage_object_types`); Kernseife adds `PROG`, which suggests the standard list may not cover programs — i.e. `SUBMIT` of an SAP program may produce **no** message. | low | community snippet; Kernseife source |
| Enhancements | "Allowed Enhancement Technologies" accepts only BAdIs at present; enhancement implementations and modifications are reported. Whether an `ENHANCEMENT-POINT` declared in the customer's own program is reported: **not found**. | medium / not found | software-heroes.com; no source on own points |

## 3. Our grade next to the expected ATC message, state by state

| State (release file / classification file) | Our level today | ATC expected | Agree? |
|---|---|---|---|
| released / — | A | no finding | yes |
| released / classicAPI (158 objects) | A | no finding (released is asked first) | yes |
| — / classicAPI | B | classic API · priority 3 | yes |
| — / noAPI | D | noAPI · priority 1 | yes |
| SAP object in neither file (incl. `REUSE_ALV_GRID_DISPLAY`) | C (residual) | internal API · priority 2 | yes |
| **notToBeReleased / classicAPI** (31 in `latest`, 21 in `pce-latest`; e.g. `CL_HTTP_UTILITY`, `CL_BCS`) | **D** | classic API · priority 3 → **B** | **no** |
| **notToBeReleased / —**, called or named (not a table use) | **D** | internal API · priority 2 → **C** | **no** |
| notToBeReleased / —, table read or type use | C (since 2.11) | not determined (table messages) | open |
| SAP object written directly | D | not determined (update message) | open |
| deprecated with successor / — | C | not determined | open |
| deprecated without successor / — | D | not determined (community: priority 2) | open |
| deprecated / classicAPI (1: `IF_AUNIT_CONSTANTS`) | C | classic API · priority 3 → B (classification first) | probably no |
| `notToBeReleasedStable` (262 in the PCE files) | **not determined** (state not mapped) | not determined | open — see decision 5 |
| SAP program in `SUBMIT` (no file lists programs) | C (residual) | possibly no message (programs may not be checked) | open |

Two further answers the row asked for:

- **Forms.** `SSF_FUNCTION_MODULE_NAME`, `OPEN_FORM`, `WRITE_FORM`, `CLOSE_FORM`,
  `FP_JOB_OPEN` and `FP_FUNCTION_MODULE_NAME` are **in** the classification file as
  `classicAPI` (level B) — the row's premise that they are absent and graded C by the
  residual rule is wrong for them. Only `REUSE_ALV_GRID_DISPLAY` (and the other `REUSE_ALV_*`
  modules) is absent and residual C; `CL_SALV_TABLE` and `CL_GUI_ALV_GRID` are classicAPI.
- **C1 vs C2.** The release file we sync carries only the state, no release contract; its
  *released* means usable in ABAP Cloud on the same system (C1). Remote use (C2) is a separate
  contract the file does not state; the classification file's `remote-enabled` label means
  RFC-enabled, which is classic. A text search of `lib/` found no place that reads *released*
  as remotely usable.
- **User and customer exits.** Neither file lists exits (no `CMOD`/`SMOD` objects, no user exit
  forms); a user exit is code inside an SAP include, which "Allowed Enhancement Technologies"
  would see as a modification-type enhancement (inference). Since 3.0.13 the engine reports how
  much logic stands in each exit (`hook-implementation`, section 5).

## 4. Implemented now (3.0.13)

1. **The expected ATC message stands next to every catalog grade** —
   `expectedAtcMessage()` in `lib/abap/abcd-classification.ts`, shown in the per-object table
   of the analysis ("ATC expected: classic API · priority 3 (information)" or
   "ATC: not determined") and on every `/catalog/<object>` page. It derives nothing; the level
   rule's fingerprint does not move. Where section 2 has no source, it says "not determined".
2. **The customer's own enhancement point is no longer level D** (suspected defect,
   confirmed by reading the code: every `ENHANCEMENT-POINT`/`-SECTION` became an `enhancement`
   finding, level D, 12 score points, whatever program it stood in). From engine 3.0.13
   (`PRECISION_FIXES_FROM`) a point declared in a program of the customer namespace, for spots
   that are all in the customer namespace, is `own-enhancement-point`: Low, no score points,
   on-stack rework only (ABAP Cloud has no enhancement points). A point for an SAP spot, in an
   SAP program, or in a source that does not name its program stays level D. Signed runs keep
   theirs. Benchmark: no case has one (no change).

No grade of section 3 was changed.

## 5. The four small engine rules (roadmap row "Four small engine rules")

All from engine 3.0.13, none costs score points or chooses the route (`lib/abap/engine-rules.ts`,
`tests/engine-rules-3013.spec.ts`): `system-time` (sy-datum/sy-uzeit compared, used for a
deadline, stored, or `JOB_CLOSE` with a start date), `hook-implementation` (statements in the
hook, delegated to a class yes/no — also in the route rationale), `form-output` (SAPscript,
Smart Forms, Adobe Forms; output management as an optional item), `abap-proxy` (regenerated,
not transported; the retire question).

## 6. Decisions for the owner (§9 No. 18, put again)

Each is a grade change, engine-version gated if taken; signed runs keep their grade.

| # | Case | Today | Proposal | Why |
|---|---|---|---|---|
| 1 | notToBeReleased + classicAPI (31/21 objects) | D | **B**, with the ABAP Cloud successor shown beside it | ATC is expected to report classic API (priority 3); D contradicts the customer's tool. The cloud view keeps saying "not for ABAP Cloud". |
| 2 | notToBeReleased alone, called or named | D | **C** | ATC is expected to report internal API (priority 2). Reads and type uses are already C. |
| 3 | deprecated with / without successor | C / D | **keep until verified**; if ATC reports priority 2 for both, C for both | no source for the priority. |
| 4 | deprecated + classicAPI (1 object) | C | B if decision 1 is B | same precedence as decision 1. |
| 5 | `notToBeReleasedStable` (PCE files, 262 objects) | not determined | **C** ("stable" internal object) — or keep not determined until SAP documents the state | the state is unmapped today, so a Private Edition target shows "not determined" for 262 objects. |
| 6 | SAP table used only as a type | C | **B** after verification | Kernseife (SAP-authored) rates type use B; ATC priority not found. |
| 7 | `SUBMIT` of an SAP program no file lists | C (residual) | keep C, ATC line "not determined" | the standard check may not look at programs at all. |
| 8 | Legend text "D · Priority 1 · error" | per level | keep, it is the documented level ↔ priority mapping; the per-object line now says what ATC is expected to report for that object | — |

## 7. Manual test recipe (SAP BTP ABAP environment trial, release 2608)

**What the trial can and cannot settle.** The trial is an ABAP Cloud system: objects are
written in the language version *ABAP for Cloud Development*, where a reference to an object
that is not released is a **syntax error**, not a clean core message. The trial also has no
application tables (no KNA1, VBAK). So it settles the check's **configuration** (messages and
priorities) and the behaviour for BASIS objects; the object-by-object classic behaviour needs a
classic system (S/4HANA 2023 with Note 3565942, or 2025 FPS01+). Record "not in system" where
an object does not exist.

**Step 1 — read the variant (settles section 2 directly).**
1. ADT, the trial project → `Ctrl+Shift+A` → type *CHKV* → open `ABAP_CLEAN_CORE_DEVELOPMENT`
   (also open `ABAP_CLOUD_DEVELOPMENT_DEFAULT` for comparison).
2. Record the list of checks in it.
3. For "Usage of APIs" and "Allowed Enhancement Technologies": open the check's message list
   (*Messages* / priorities tab). Record **every message code, its text and its priority** —
   in particular the ones for classic API, internal API, noAPI, deprecated (with / without
   successor), database read, database update, database table in CDS, type use.
4. Record the check's parameters (e.g. which object types it covers — is `PROG` among them?).

**Step 2 — a probe class.** Package: a new package under `ZLOCAL` (if the ATC run on it returns
nothing at all, note that — some systems skip local packages; then use a transportable package
if the trial offers one). Class `ZCL_CC_ATC_PROBE`, one method per case so each finding has its
own line:

| Method | Statement | State |
|---|---|---|
| `m_released` | `DATA(d) = cl_abap_context_info=>get_system_date( ).` | released |
| `m_ntbr_classic_succ` | `DATA o TYPE REF TO cl_http_utility.` | notToBeReleased + classicAPI, successor `CL_WEB_HTTP_UTILITY` |
| `m_ntbr_classic` | `DATA o TYPE REF TO cl_http_client.` | notToBeReleased + classicAPI, no successor |
| `m_ntbr_table_read` | `SELECT SINGLE obj_name FROM tadir INTO @DATA(n).` | notToBeReleased, table read |
| `m_ntbr_table_type` | `DATA r TYPE dd04t.` | notToBeReleased, type use only |
| `m_dep_succ` | `DATA o TYPE REF TO cl_aunit_assert.` | deprecated, successor `CL_ABAP_UNIT_ASSERT` |
| `m_dep_nosucc` | `DATA o TYPE REF TO cl_apj_scp_tools.` | deprecated, no successor |
| `m_dep_classic` | `DATA c TYPE REF TO if_aunit_constants.` | deprecated + classicAPI |
| `m_classic` | `CALL FUNCTION 'POPUP_TO_CONFIRM' ...` (or `JOB_OPEN`) | classicAPI only |
| `m_noapi` | `CALL FUNCTION 'RFC_READ_TABLE' ...` | noAPI |
| `m_unlisted` | `CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' ...` | in neither file |

Run ATC with `ABAP_CLEAN_CORE_DEVELOPMENT` on the class (ADT: *Run As → ABAP Test Cockpit
With…*), then with `ABAP_CLOUD_DEVELOPMENT_DEFAULT`.

**Step 3 — record, per method:** the check that reported, the message code and text, the
priority, whether a successor is named, and whether the line is a syntax error instead (then
the classic behaviour stays open). One table row per method, like section 3; send it back and
section 3's "ATC expected" column becomes "ATC reports (verified 2608)".

**Step 4 — enhancement points.** Not testable in the trial (ABAP Cloud has no
`ENHANCEMENT-POINT`). On a classic system: a report `ZCC_EP_PROBE` with
`ENHANCEMENT-POINT zep_probe SPOTS zes_probe.` (create the spot `ZES_PROBE` first), run the
variant, record whether "Allowed Enhancement Technologies" reports it and at which priority.
