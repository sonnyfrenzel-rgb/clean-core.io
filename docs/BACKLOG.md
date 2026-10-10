# Backlog

Open items, latest state first. Kept short: what, why, and how urgent.
Older sections stay as long as something in them is open.

## Session 10.10.2026 — 3.0.7 built on dev, release

**Built (main on Sonny's go, 10.10.2026):** the ZMM engine review completed (batch input field by field,
authorization check assessed, ABAP run order, one rule per CASE arm, decision tables, User/System lanes,
ignored input, data scope); the first screen named "First insights into your process", its main line kept
after the build-up; Documentation lean (ADR-082), the description along a reader's questions (ADR-084) and
its second round (chapter bar, appendix summary, two pictures, owner-editable RACI); the IT view's own content
and section bar (ADR-086); the Management view's own content (ADR-087) and the decision's conditions with deep
links (ADR-085); inputs honest first (ADR-083, block 1); a view switch that opens the new view at its top; the
steering one-pager on one A4 landscape sheet (ADR-088); Analyze declutter wave 1; the Private Edition release
asked at the start; My workspace row actions named; tests stub the model by default and a newer push cancels
the older run. CHANGELOG has the details.

**QA and security:** QA full review of v3.0.6 (`3b742fc`): 19 confirmed and fixed, 16 refuted with evidence;
delta reviews on dev fixed as they came. Security audit of v3.0.6: SEC-2026-751 to -755 fixed, six refuted.

**Open for Sonny:** deploy `firestore.rules` right after the release (SEC-2026-751/-752, tenant access request
and `extensibilityRoute` server-only; not before, the v3.0.6 app still writes `extensibilityRoute`); a
separate test key in its own Google project and read access to the spend for the health check (ROADMAP §7,
"before 3.0.7", parts 1 and 3); whether a later cost change should make a confirmed decision outdated
(ROADMAP §7, "after 3.0.7", point 4). A decision with an open need confirmed before 3.0.7 shows outdated until
it is confirmed again (ADR-085).

**Planned:** SEO/GEO after 3.0 (high priority), 3.0.8 deep links to every choice and back, 3.0.9 SAP
Architecture Center reference patterns; left for later from 3.0.7: Analyze score hero (needs a mockup),
Analyze wave 2, IT dependency graph, cost revision in the decision, ADR-083 block 2, unused layer code.

## Session 09.10.2026 — 3.0.6 built, three QA rounds, release

**Built (main on Sonny's go, 09.10.2026):** open questions instead of "Not determined" (ADR-081); Need &
process leaves the Business view (ADR-080); the catalog answers graded function-module calls (Sonny's go
for the grading step); COMMIT WORK as on-stack rework; MFA disable hardened; SEC-2026-728 to -744 fixed;
no "Run the analysis" while the start run signs; stale-tab notice; level chips everywhere; the open 3.0.5
QA items. CHANGELOG has the details.

**QA:** three rounds on dev (dd8e996, 1b75c99, ce3b4a5): 14 confirmed and fixed, 9 refuted with evidence,
round 3 clean.

**Open for Sonny:** deploy `firestore.rules` right after the release (not before: the 3.0.5 app writes the
model's test suite unfiltered, which the new rules deny); whether a function module SAP marks noAPI should
cost points (today a finding without a deduction).

**Planned:** 3.0.7 engine (ROADMAP §7); 3.0.8 deep links to every choice in every tool and back; 3.0.9 SAP
Architecture Center reference patterns (timing: open decision 20).

**Learned:** a stale `.next` cache makes `next build` die with "Cannot read properties of undefined
(reading 'length')" and no stack; delete `.next` before suspecting the change. The whitepaper PDF prints
APP_VERSION from the build, so rebuild after the version bump before rendering it.

## Session 06.10.2026 (evening) — 3.0.5 owner fix bundle on dev

**Built (owner requests of the day, bundled as v3.0.5; main on Sonny's go):** target edition asked at
start and changeable in the IT view (free for examples, also repeatedly); Management view rebuilt around
Keep · Rebuild · Move to SAP standard · Retire with distance to SAP standard, effort and cost (ADR-079);
German ABAP names in English; "Work from this process" band; two names for the two ways back; level
explanations in IT and Management; Transformation progress by real steps; "Back to top" fixed; safe engine
fixes from the ZMM_BESTELLUEBERSICHT review. CHANGELOG has the details.

**Planned:** 3.0.6 = security hardening (moved from 3.0.5) + "not determined" as closable open questions
(concept from 06.10., in the scratchpad until 3.0.6 starts) + level explanations on one-pager, print and
Analyze; 3.0.7 = the rest of the engine review (BDC fields, decision tables, CASE arms, run ends, ignored
input, authorization check, internal tables in the skeleton, GUI navigation). All in ROADMAP §7.

**Decided:** Need & process leaves the Business view in 3.0.6 (Sonny, 06.10.; needs an ADR).

**Learned:** seven agents on one working tree share one dev server on :3000 — their rendered specs failed
on each other's restarts, and the permission classifier refused some of their writes to shared files. The
final rendered run has to happen once, on a quiet server, after all of them are done.

## Session 06.10.2026 — 3.0.4 live, agents rebuilt, www fixed

**Live:** v3.0.4 on clean-core.io since 06.10.2026 ~13:40 (main `223fd701`); CHANGELOG has the details.
Firestore rules deployed by Sonny the same day (all six databases verified). `www.clean-core.io` now
works (Cloud Run domain mapping + Strato CNAME to ghs.googlehosted.com) and 308-redirects to
clean-core.io; in the 30 days before, not one request had reached it.

**Agents (owner decision):** pinned models instead of the Auto Router; security audit reads the release
delta; QA full review only for a larger change (`scripts/qa/full-scope.mjs`); UX review by hand. First
verified delta audit of 3.0.4: 50/50 candidates, $0.26, intake in §12 (SEC-2026-726 to -736). No spend
limit on the OpenRouter key (Sonny declined).

**Launch 07.10.2026:** LinkedIn post scheduled for 07:45 (v6 text, video v3h, thumbnail from second 5).
SAP Community post part 3 submitted for review. Video branch `video/launch-30` pushed as a backup, not
merged (1,400+ commits behind; merge after the launch). Landing page content frozen until the launch.

**Open, after the launch:**
- 3.0.6 security hardening (moved from 3.0.5, which is now the owner fix bundle of 06.10.2026): SEC-2026-728 (P2) and -729 to -736 (P3).
- Two carried high QA findings (BPMN draft identity across projects; profile re-creation after
  deletion) and a large carried QA backlog; one medium test gap on the deferred Auth fallback.
- Perf leftovers needing owner decisions (`docs/perf/REPORT.md`): 1.34 MB landing HTML, public pages
  in `app/(app)/`, project read waits for the profile.
- CI takes ~90 minutes per push; source-text guards that break on harmless refactors.
- Mail deliverability (3.0.9).

## Session 03.–04.10.2026 — 3.0.1, 3.0.2, 3.0.3 live

**Live:** v3.0.3 on clean-core.io since 04.10.2026 (main `b6716f07`); v3.0.1 and v3.0.2 went out the
same day. What each brought is in `CHANGELOG.md`. The CI runs the E2E suite in three shards on fresh
emulators (the emulator kept every abandoned Firestore channel and collapsed after an hour).

**On dev, not yet on main:** security intake of the 3.0.3 audit (§12, IDs only) — app fixes and the
register; waits for Sonny's go for main.

**Waits for Sonny:**
- Firestore rules: the next rules deploy carries the scheduled §12 items (draft and tests prepared
  outside the repository); Sonny deploys (`npm run deploy:rules`, then `npm run rules:verify`).
- CI hardening (§12): a workflow change, needs his go.
- UX review of a release: fails at the model's output limit (24k, 48k); parked for 3.0.x by Sonny.
  Recommendation: cap the findings per call. The capture branch `test/ux-capture-workspace` (workspace
  screens for the UX agent) waits with it — it needs an area in `scripts/ux` (machinery, his go).
- Security audit coverage: at the 46 USD cap the audit reads 318 files; the full surface needs ~58 USD.

**Open, small:**
- Six dependency advisories (high) with fixes available, from the 3.0.3 audit's dependency scan.
- The requirements card sits at the foot of the Design page — move it up.
- Some rule texts still carry code values (e.g. "Role DEPT_HEAD"); a field glossary would let the
  engine name them in business terms.
- Low QA findings on test quality (source-text guards where a rendered test would be stronger).

## Session 30.09.2026 — Block D, wave 2

**Done (on dev):** D.6 Shell Bar (56 px, path instead of "Back to My Workspace", ARIA menus, sign-out as a
Message Box, `MotionConfig reducedMotion="user"` app-wide) · D.10b Analyze page (CcDialog, CcTabs,
CcTable, radio cards, dropzone by keyboard, loading stages only after real events) · D.11
evidence components (no 6-s sweep any more, A blue, CcTable/CcDialog, Why on every number) · D.13
strategy components (390 → 0) · D.20a Settings (13 native dialogs and 2 overlays → cc; MFA
and deletion flow identical line by line, only an empty password is rejected earlier).
Two real bugs found and fixed along the way: complexity/criticality (1–10) were shown as "/100"
(`d3b88233`); a model gap without `strategy` brought the work list to a halt (`26e3ba43`).

**Test audit:** Sonny approved **all three stages** on 30.09.; stage 1 is built (shared sign-in helper, one smoke spec instead of five, `docs/testing.md`).

**Wave 3 (30.09.):** D.7, D.12, D.15, D.20b, D.21 done. Open: Terms gate R10 (waits for a non-closable `CcDialog`, D.5e), z-layer dialog vs. assistant FAB (D.5e/D.8).

**Security v2.20.0 (§12):** 39 findings fixed and 6 refuted (steps C, F, Phase 2). **Step B (32 rule findings) is built and tested, but only takes effect after Sonny's rules deploy** — until then "scheduled" in the register. Order: app via CI, then `npm run deploy:rules`, then `npm run rules:verify`. **Decisions with Sonny:** weekly report with names/addresses or numbers only (two findings); whether account deletion takes `email_suppressions` and `usage_reports` along; a collection-group index on `runs.userId` for the deletion backstop (GCP). **Dependencies:** the audit gate had been red since the advisories of 29.09. (undici, brace-expansion) — fixed.

**3.0.9:** acceptance without CSA and without T-Online (Sonny); Postmaster Tools set up, shows "Probleme festgestellt" — details open.

**Open from the wave:** banner sentence "Powered by Generative AI" (§3.1 or disclosure — Sonny) ·
sign-offs in `ConstructFindings` are only local state · the "account deleted" notice is covered by
`UserOnboarding` (→ D.7) · Ctrl K and project name in the shell path (→ D.29) · two
assistant entry points (→ D.8) · tooltip in `TargetScopeMapping` by hover only · R3/R11 of the
Confluence export (→ D.28) · check `ABCD_META.color`/`LEVEL_EMOJI` (→ D.29).

## Closing the day 28.09.2026 (session 27./28.09.)

**Shipped:** **v2.20.0** on `main` (`fc787674`, clean-core.io). Contains everything since v2.19.0:
Block D D.1–D.10a, security step A, the full review of v2.19.0, and the work of this session.

**Process benchmark** (`tests/prozess-benchmark/`, report `docs/prozess-benchmark/BERICHT.md`):
300 constructed ABAP cases in three waves (core modules · edge modules with borderline cases · hidden,
hard, OO), written blind, cross-checked (`review.json`), frozen (`frozen-*.json`,
`validate.py` checks the hashes), learning/test halves (`split.json`). Judge verdicts on the
business statements in `judge/`.

| Node hits | before | after |
|---|---|---|
| Wave 1+2 (test half) | 61.3 % (61.9 %) | **81.1 % (82.1 %)** |
| Wave 3 (test half, measured once) | 39.5 % (38.8 %) | **72.3 % (70.4 %)** |

**Built:** D1–D4 (method calls, dynpro modules/FMs as entry points, no double starts, popups),
ADR-054 (subprocess start, own end per early exit), RAISE EVENT/SET HANDLER
(conservative: only a traversed, unconditional, never deregistered registration per entry point), LEAVE TO
SCREEN, callbacks, ALV handlers, BAdI methods, redefinitions as entry points; business statements path A without
false statements (236 → 11, forbidden statements in the corpus 4 → 0); path B measured over 200 cases
(86.5 % identical in content) and as 17.10 into the Business view (proposal + evidence +
contradiction marking, receipt bound to the stage, Gemini test stub with three gates); two
omissions in the corpus comparer fixed (reported separately); the benchmark data do not go
to the QA model (otherwise its budget ran dry); `full-pipeline` looks for the renamed
button (CI had been red since 24.09.).

**QA loop:** ~25 findings confirmed and fixed in 14 rounds (among them method of the wrong
class, receipt without stage binding, contradiction rules, registration across branches/entry points,
release data), 1 partially refuted. **Omission:** the deploy pipeline was red from `bf5d4f69` to
`3fae0f20` (text inventory, demo digest), because only QA was being followed — fixed, rule in
memory: after every push, watch CI until it has a result.

**Sonny's decisions:** see `docs/ROADMAP.md` §9 "Closed on 27./28.09.2026".

**Intake for v2.20.0:** security audit (1 high, 15 medium, 50 low, 13 info; 0.79 $) —
75 new entries SEC-2026-555 to -629: 45 scheduled (§12), 30 refuted, ~60 of them in substance
repeats of earlier decisions; the high finding is refuted as it has been since v2.18 (the file
has no caller), deleting the file would end the noise — Sonny's decision.
UX review (0.48 $): 3 new findings, UX-174 scheduled (Block D), UX-172/-173 refuted.
The inboxes of v2.19.0 were already empty in the integration state; the warning at
session start came from the outdated working directory `Project-Platform`.
QA full review (2.11 $, 28 calls, **incomplete** — the budget was not enough for the whole
code): new 6 high, 334 medium, 23 low. The 6 high ones are checked and
fixed in this session (branch `fix/qa-full-220`); the medium and low ones are a **separate step**
"Work through the full review of v2.20.0" after the start of Block D, as with v2.18.0.
Result for the high ones: 5 confirmed and fixed (`f03c6c53`..`1e520bfa`), 1 refuted
(`48b1b259955f`). The QA round on them found 3 medium: 2 fixed (`ce8cccc1`, `109458d1`),
1 refuted (`1adcb710abb9` — one run describes all cases including receipt, `abd1e6aa`);
round on `abd1e6aa` without a new finding. **Open with Sonny:** `npm run deploy:rules` — only
after that does the admin revocation in `firestore.rules` take effect (finding `87d43759c2d3`), and the go for
a release of these fixes on `main`.

**Test audit (27.09.):** 4,699 tests, 26 min E2E; 304 browser tests cost 84 % of the time, ~12 min
of it fixed pauses after sign-in; real Gemini calls caused 4 of the last 9 red
runs; gaps: admin switch, registration through the UI, audit pack export→check,
invitee read view. Stages 1–3 proposed, **approval open**.

**Open, in this order:** Block D (next session) · loop levels with start ·
test audit stages after approval · wave 3 design questions (polymorphic calls, small methods) ·
language of the generated sentences (ADR-009) · BM-232 cluster ID · `process-states-view` shares a
`tmp/` bundle in a parallel run (no effect in CI with 1 worker).

## Closing the day 24.09.2026

**Shipped:** v2.18.0 and **v2.19.0** on `main` (clean-core.io). v2.19.0: isolated test runner (8.9) with production runners, mail layout (3.0.9), 3.0.11, 3.0.12 (rules live, `32e1970bb02e`), full review of v2.18.0 worked through, Gemini retry on 503, security pipeline with batch review, UX agent on mockups 2.8.

**On `dev` since v2.19.0** (CHANGELOG "Unreleased"): Block D D.1, D.3, D.4, D.5a–d, D.9, D.10a; security step A (SEC-2026-514/525/481/492/497); full review of v2.19.0 (6 fixed, 4 refuted).

**Sonny's decisions today:** external review for the live path dropped (documented own review); security pipeline with 5 USD; UX intake 7 key views from mockups 2.8; showroom cut; banner in the product dropped; landing captures with community account and "Explore the demo" → `/demo/workspace` with 3.0.1; Block D with E-1–E-7 as recommended, E-6 changed: dashboard and stage demo are rebuilt; new mail layout into the release.

**Mail (3.0.9):** seed test run e — O365 7/8, Outlook.com 8/8, Gmail 8/8 in the inbox; GMX and web.de all spam (reputation, amplified by >70 test mails on the same day). Re-measurement in about a week, at most 20 mails.

**Open, needs Sonny:**
- Subnet `app-egress` (runner-net, 10.10.2.0/24, Private Google Access) — without it the app's internal runners answer with 404; then set `APP_VPC_SUBNET=app-egress`, redeploy dev, self-test. *Done 01.10.2026: the subnet exists as `app-net` / `app-run-egress`.*
- `run.invoker` for `clean-core-runner` and `clean-core-runner-live` (main). *Done 01.10.2026: `run.invoker` on the runners names only `clean-core-run`.*
- Go for security step B (rule change + rules deploy: admin read access to customer ABAP, hasOnly/sizes in create rules).

**In progress (local branches, saved as `wip/*`):** D.6 shell (menu keyboard done, rest open — list in the plan), QA round on security step A (log without upstream texts, rendered error text tests, ID guard for query parameters, three test gaps from 3ee443a).

**Held back for 3.0:** branch `feat/3.0.6-landing` — landing page with timeline and real captures, showroom and banner cut, public texts (3.0.8, about half done).

**Block D after that, in this order:** D.10b–D.19 (tools), D.7/D.8/D.20–D.21/D.22a–c (frame, account, admin, dashboard and demo rebuilt), D.2, D.29, D.23–D.28 (public pages, partly after the landing merge), D.30 (everything to zero). Addenda per step are in the plan (`luecken-und-plan.md`, scratchpad of the session; copy at `docs/archiv/roadmap-2.8/block-d-plan.md`, archived 02.10.2026).

**Small, later:** type check `uploadedFileName` in `runs/create`; example flag settable by the client (own consent only); mail webhook can create an empty status entry after deletion; security steps C (sanitizer) and F (hardening); 2 carried-over critical QA findings on `usage-report.yml`.

## Decided and worked through on 18.09.2026

The seven decisions below have been made (`docs/ROADMAP.md` §9, "Closed on
18.09.2026"). What is already done as a result:

- **Item 5 — "Admin" struck from 5.4.** Just one roadmap line: `firestore.rules`
  never had the admin read branch, the contradiction stood in the line alone.
- **Item 2 — the rules deploy is out.** `88b5fe431436…`, on 18.09. on all five
  databases including `clean-core-eu`; `npm run rules:verify` says that production,
  record and working copy match. The comparison beforehand: exactly one
  read access is added, nothing is removed.
- **Item 6 — cap of three.** `INVITATION_MAX_OPEN`, enforced in the same
  transaction that creates the invitation: two overlapping requests cannot both
  find the same free slot. Only open invitations occupy one; a revocation frees
  the slot immediately.
- **Item 7 — the own PDF writer stays.** No change needed.
- **Item 8 — WIF condition narrowed.** It was `attribute.repository` alone; it is
  now repository **and** ref (`main`, `dev`) **and** the two workflows that
  fetch a token at all. Rolling back: the same `gcloud` line with the old
  condition.
  **Proven for the deploy:** run 35309005663 completed `deploy` green, so it
  got its OIDC token under the narrower condition. The second half —
  `usage-report.yml` — runs on Fridays; all previous runs ran on `main`, and
  `main` is the default branch, so the condition matches. The run at noon on
  18.09. is the live confirmation; if the weekly report fails to arrive, that is the cause.
- **Item 3 — survey: backup and dry run have run.** `scripts/survey-repair-dotted-answers.ts`,
  dry run is the default. Finding: 4 documents, 20 stranded fields, no
  collision with a later answer. **16 of those fields are three test probes
  (`preview-check__…`)** — really affected is exactly **one** person with four answers.
  The writing step waits for Sonny's look.
- **Item 4 — rotation prepared.** New Ed25519 pair generated, the previously active
  public key (`a2373c8c054f2b1a`) belongs in
  `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`. Set the retirement list first, then the
  private key — the other way round creates a window in which shipped
  evidence packs briefly count as unverifiable. `AUDIT_SIGNING_KEY` (HMAC) is **not**
  touched: it has no key ring.
- **Item 1 — the four texts are drafted** (privacy §8, trust card including
  evidence and guard, `SECURITY.md` §3.7, retention policy). They are on `dev`.
  **The Datenschutzerklärung and `SECURITY.md` only go to `main` after Sonny has read them.**

Unplanned on top: **the red pipeline** (run 35267830947) came from a guard that
was right — Phase 5 brought two routes that check for the second factor and were in
no catalog. Both are entered, 36 tests green. A second guard failed
after that, and it too had been right: `project-readers.spec.ts` required that the
new read rule stand as `pending` in the deploy record — which was true as long as the
deploy was outstanding. It was turned along with it rather than deleted: what is checked now is that file and
record say the same thing. **Run 35309005663 is fully green** (`validate`,
`security`, `deploy`).

And a **real GDPR gap**, found while writing the retention policy: the
deletion cascade only deleted what an account owns. Whoever was an invited reader left
their uid in other people's `readers` fields — not a leftover, but a standing read right, because
`firestore.rules` answers to exactly this field — and their address in other people's
invitations. Fixed, with a counter-test against the reverted fix.

**Two reviewer claims refuted, both with evidence.** A subagent claimed that a
Firestore index with collection-group scope was needed, otherwise every
account deletion in production would fail from now on; all three queries in question run without any
index exception against `clean-core-eu`. The QA reviewer reported that the new cascade imported
`FieldValue` wrongly; the red came from a broken `.next` of the dev server — the seed API
answered with a Next 500 (`loadManifest: Unexpected end of JSON input`). After
a restart 26 tests green. **Lesson for long sessions:** a single red test after
hours on the same dev server is re-checked on a fresh build before you believe it;
and two Playwright runs at the same time against one dev server kill it.

**QA loop:** three rounds, rounds 2 and 3 each `go_with_notes` without a new finding, one
finding resolved. What remains in the report (2 critical, 7 high) is all *carried* —
the triage stock from the release full review, item 12 below.

## The SAP catalog sits in the browser bundle — to be solved before 3.0

**Measured on the production build of 18.09.2026:** `/project/[projectId]/analyze` loads
**884 kB** on first access, `/admin/workspace` **708 kB** — against a shared
base load of 105 kB. The cause is `lib/abap/catalog-service.ts`, which imports
`generated/cloudification-repo.latest.json` (3.0 MB) and
`…classifications-sap.json` (1.2 MB) **statically**. Every client component
that pulls it indirectly takes the 4.2 MB along into the browser.

`CLAUDE.md` describes it differently: `gradeSapObject()` in `catalog-service.ts` is
**server-only**, clients fetch batch lookups via `/api/abcd-classify`. This
rule is already broken — `components/analyze/UsageRiskMatrix.tsx` is a
client component and pulls the same path via `lib/abap/usage-join.ts` —, and the
public cloud fit panel from step 6.7 now does the same.

**Why it counts now:** so far this hung on the Analyze page. With 6.7 it hangs on
the workspace shell, and with 3.0 that becomes the path for everyone. A rebuild afterwards is
more expensive than one before.

**The way:** put both calls (`gradeSapObjectUse`, `hasNoReleasedApiPath`) behind
`/api/abcd-classify` and let the panels fetch the answer instead of bringing the catalog
along. Both places move together, that is one change, not
two.

**Urgency:** medium, but before 3.0. No misbehaviour, only weight — and it
hits every first page load.

### The way has been taken — and the weight has stayed (18.09.2026)

Both calls now sit behind `/api/abcd-classify`: `usage-join.ts` gets
`hasNoPath` as a parameter, `public-cloud-fit-resolver.ts` has **no** default values
any more and therefore structurally cannot pull the catalog any more. Both panels show
real loading and error states instead of guessing a grade. 89 tests green.

**The numbers have not moved anyway:** analyze 883 kB before and after,
`/admin/workspace` 709 kB and 709 kB. Measured, not assumed — in a copy of the
tree, built twice, once with and once without the change, against the same state
of the other ongoing work.

The reason is a third path that the analysis above did not know:
`lib/abap/evidence-model.ts` itself imports `catalog-service.ts` statically, and
**both** call sites need `buildAbapEvidence` from exactly this file — for
reasons that have nothing to do with grading. The shared chunk
`static/chunks/5841-*.js` (3.47 MB) carries the payload identically in both builds.
`analyze/page.tsx` additionally pulls `getMergedCatalogVersion` directly.

**What remains open:** either move `buildAbapEvidence` to the server for these two call sites, or
extract the catalog-dependent lookups from `evidence-model.ts`. Both are considerably larger than this step and need their own
roadmap place — today the rule from `CLAUDE.md` is restored, the weight
is not. This distinction is the point: otherwise the entry above would have read as
done.

## From the two legal reviews of 18.09.2026 — open

The mandatory gaps are closed (commits `1c3476d`, `2f9eb4a`, `4f0e424`). What
remains from them as a step of its own, in the order in which it hurts:

1. **Consent path for changed ToS — blocks the version bump.** Since today the ToS carry
   a new obligation (no upload of personal data) and an
   age limit. `TERMS_VERSION` nevertheless stays at `2026-07-07`, **because there is
   no interface for consenting again**: `termsVersionAccepted` appears in
   exactly one component, in the admin panel, read-only, and no component calls
   `/api/consent`. A bump would lock all 158 accounts out of every protected
   route with *"The Terms of Service have
   been updated. Please re-accept them in the app to continue."* — the same trap as today's MFA lockout, only for everyone. First
   build the dialog, then bump (decision Sonny, 18.09.).
2. **The guard for personal data on upload** (decision Sonny, 18.09.).
   Purely deterministic, in the browser, **before** the upload: e-mail addresses, IBANs,
   phone numbers with area code, tax IDs, and the ABAP-specific hits — literals on
   `PERNR`, `GBDAT`, `SMTP_ADDR`, `NAME1`/`VORNA`/`NACHN`, `SY-UNAME` comparisons against
   a fixed user name. Hits with line and excerpt, and the uploader
   **confirms deliberately** before it goes on. **Also on the usage data import**, where it is
   even more important: an SAP usage report contains user IDs by design.
   It must **never** claim to detect personal data — it finds patterns
   that often point to it. Otherwise, instead of an honest rule, there is a
   control claim, and the ToS explicitly say the opposite.
3. **A gate must not look like an error.** The MFA lockout showed up as
   *"Failed to analyze the code"*. Whoever does not pass a protected route because of their account state
   must read that as account state — with the way to fix it, not as a
   failed action. Concerns the second factor, the ToS version and the suspension.
4. **Delete button for the motivation field.** Art. 7(3) sentence 4 GDPR requires that
   withdrawal be as easy as giving consent. Today only a mail to us works; the field
   is a profile field and belongs in the settings.
5. **Restore test.** The backups exist since today; the first one is available on
   19.09. An untested backup is not one. Restore once into a throwaway database
   and record the result.
6. **The invitation mail only in English.** The Art. 14 notice goes to people who
   typically sit in Germany; Art. 12(1) requires understandable language.
   A German variant plus a language choice at the link (`/datenschutz/de#project-access`).
7. **Deliberately open from the first review:** the ToS liability cascade (§ 4 contradicts
   itself between "only intent and gross negligence" and the cardinal-obligations
   clause), §§ 327 ff. BGB for free digital products, and the
   deemed-consent clause in § 10. That is contract design, not text maintenance — it
   needs Sonny's direction and probably a lawyer.

**No longer open, because checked and refuted:** the finding "Third-Party Notices
contain raw template code, component list missing" was a bug of the
Word export, not of the page. `clean-core.io/licenses` renders all five
license groups completely. Since then the export reads the rendered page.

## Open for 19.09.2026 — in this order

### Sonny's decisions, without which nothing moves on

1. **The four public texts, before Phase 5 may go to `main`.** `app/datenschutz/page.tsx` §8
   says literally *"There is no sharing feature today: no other user can be granted access to your
   project."* Plus `components/TrustBeforeUpload.tsx` ("access for the account only" — **before**
   the upload, i.e. exactly where trust is formed), `SECURITY.md` (knows only one read path)
   and `docs/DATA-RETENTION.md` (silent on the retention of the invited address).
   `tests/trust-card-guard.spec.ts:380` is called *"it promises no sharing, because there is none to
   promise"* and goes red — it is right. **Phase 5 is ready on `dev` and waits for this alone.**
   I can do the draft; the Datenschutzerklärung and `SECURITY.md` are legally
   relevant and do not go out without Sonny reading them.
2. **Roll out `firestore.rules`** (`npm run deploy:rules`), **before** the app release — 5.4 explicitly
   requires it that way. The change is ready and checked against nine attack cases: added
   is exactly one read access, nothing is removed, no field becomes client-writable, no `get()`.
3. **The survey migration.** The bug is fixed, new answers arrive. Everything since
   31.08. still sits under the literal field name and is invisible. The trap is
   documented: `update({'answers.ran': FieldValue.delete()})` deletes exactly the answer
   just rescued. First export as a backup, then dry run, then migration.
4. **The key rotation** — now safe, because the key ring is on `main`. The old
   public key moves into `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`.
5. **Strike "Admin" from roadmap line 5.4?** The line says "owner, admin or invitation", is
   from 15.09. and contradicts Sonny's withdrawal of operator reading from 16.09. Strand C2 took the
   later decision and reported the contradiction.
6. **Cap on concurrent invitations per project?** The concept proposes three.
7. **PDF: own writer or library?** 4.4 built a small, readable one (cross-checked with `pypdf`,
   11 pages), because a dependency required asking first. Alternative `pdf-lib`
   (MIT, ~1.5 MB) — the swap would only affect `lib/brief/pdf-writer.ts`.

### Security, in order of damage

8. **Narrow the WIF provider condition** (`gcloud`, needs Sonny). Since today the permission sits
   in the deploy job alone; the condition is still only `attribute.repository`, without ref and without
   workflow, for a service account with `roles/editor`, `run.admin`, `storage.admin`. **That is the
   second half of today's most urgent finding.**
9. **`clean-core-dev` holds production secrets** and is `--allow-unauthenticated`: the same
   `AUDIT_SIGNING_KEY` that signs production evidence packs, plus `S4_ENCRYPTION_KEY`,
   `RESEND_API_KEY`, `PILOT_APPROVAL_SECRET`, `MFA_BACKUP_CODE_PEPPER`. Lower it: separate
   dev secrets and GitHub Environments (M).
10. **Account suspension does not revoke direct Firestore access** (open from 0.14). The cheap way:
    custom claim `suspended` plus `revokeRefreshTokens`, then the rule asks the token instead of reading a
    document. **Caution:** must wrap the *whole* read condition, not only the
    owner branch — otherwise a suspended invited person keeps reading (finding from C2).
11. **Do not fix SEC-2026-077 as recommended.** First a redactor for the hit, then the
    `AIzaSy` exception. The other way round, a real key lands in the signed pack.

### Work that needs no decision

12. **Triage the 97 high findings of the release full review** — following today's pattern, with the
    rule of thumb "for `test-weakening`, first the net balance via `git show --stat`".
13. **The UX findings**: 58 from the release, 54 of them carried over, 61 open in the register. The eight
    open ones from `bc2f786` were decided on 18.09. — UX-121 to UX-127 fixed (`00212eb`),
    UX-128 (radius drift) to 1.5. Three of the eight were the same finding in three wordings.
14. ~~**Finish 0.2:** facts service and copy CI~~ — done on 18.09.2026 (`7635960`).
    Work packages 5 and 6 (audit copy corrections, successor type/provenance CR-08) remain open.
14a. **The full review of `bc2f786` is in and not yet triaged** (18.09.2026). In
    substance it is something different from item 12: around 55 entries, almost entirely **test gaps**
    ("build a test that proves X behaves"), no defect reports. Eleven earlier findings
    are noted as done. It blocks nothing. Recurring themes, by frequency:
    keyboard and screen reader operation across all dialogs and drawers; honesty of
    rendered claims against the actual provenance (Terms, whitepaper, FAQ,
    chatbot prompt, registration summary); races (two transformations at once,
    project switch with open requests, usage import with a delayed parser); and partial failures
    that leave half states (registration, tenant access, survey write order).
    Full text in `.qa-review/`.
    **Addendum 18.09., evening:** the full review of `def8262` (the second `main` push of the day)
    is in — 14 high, 41 medium, 3 low, again entirely test gaps, largely the same
    themes (account switch with an open query, deployment choice in the confirmation dialog, atomic
    persistence on double-click and two tabs, really unpacking and building archives). Both
    full reviews belong to be triaged **together**, not twice.
15. **0.18, the most worthwhile rest:** a finding marker for the type dependency (R29). Then
    CC-045 · befunde turns from "not comparable" into a real comparison instead of a silence.
16. **The auto-heal is ineffective** (finding from 0.17, noted in the roadmap). The likely
    way is a receipt-less candidate mode that executes but writes neither receipt nor verdicts
    — so that "tried out" never looks like "evidenced".
17. **Two flakers that deserve a fix of their own** (both reproduced on the unchanged tree):
    `process-editor.spec.ts › editing leaves the reconstructed Ist exactly as it was` reads the
    traceability line before and after editing, and the `ensureQuote` POST lands in between depending on timing
    — the `CLAUDE.md` trap "a test that waits for a window".
    `preservation-register.spec.ts › each stage opens on its reference case` fails only in a batch.
18. ~~**`tests/verdict-honesty-guard.spec.ts:27` is red locally, green in CI**~~ — done on
    18.09.2026. **The diagnosis here was wrong** and thereby kept the bug alive:
    it was *not* due to a makeshift configuration under `tmp/`. With the ordinary
    `playwright.config.ts` the test fails just the same — the reason is the **dynamic**
    `await import('../lib/test-verdicts')`. A dynamic import is resolved at runtime,
    when Playwright's transformation no longer stands in between; Node sees raw TypeScript and
    dies with `Unexpected token 'export'`. A static import at the top of the file goes through
    the same transformation as the spec itself. The repair is one line.

    **The lesson is the note itself.** It sounded plausible, was never checked, stood here for four
    days — and four work strands lost time on this red test, each with the
    note "known, ignore". A wrong diagnosis in the backlog is more expensive than none at all:
    it ends the thinking without ending the problem.
19. **The reference corpus still has no independent countersignature.** The case book says so itself:
    *"no case has been countersigned by an SAP architect."* Joule for Consultants was the
    obvious cross-checker and is discarded (direct SAP licensing needed). If someone with an
    SAP background is available, the **twelve cases with a deviation** are an hour of work and
    worth more than any further model.

20. **Resend the welcome mail — there is no way to do it.** The UX review (UX-125) found a
    notice in the admin that, on a failed mail, asked to approve again; an
    approved row, however, only offers *Revoke*, *Grant BYOT* and *Delete*
    (`app/(app)/admin/page.tsx:518`). Today the text is reduced to what is possible — "write to
    them directly" —, which is honest but cumbersome. The actual solution is a separate
    *Welcome mail resend* action in the row. Not built today, because it touches mail sending
    and that deserves its own review.

21. **E-mail addresses are not confirmed at registration.** Today no password account
    of this product is `emailVerified` — which means that the address a welcome mail
    goes to is that of the account, but proven by no one. Whoever registers with a
    stranger's address makes a clean-core.io mail go there on approval. That is the
    ordinary risk of every unconfirmed sign-up and considerably smaller than what was fixed on
    18.09. (`3b8ca34`: before that, the address was freely choosable in a document
    that the same browser had written). The right solution is a confirmation at
    sign-up. **Do not retrofit it as a hard check:** an `emailVerified` requirement in
    `/api/send-approval-email` would silently switch off the welcome mail for every existing account
    — the same lockout shape as with MFA and the ToS gate. First be able to
    confirm, then require it. Connected to the MFA question: Firebase refuses enrolling
    a second factor on an unconfirmed address.

22. **Refuted findings come back with a new fingerprint — in both agents.** On 18.09.
    observed twice, each time paid for with review time:
    - **Security:** the three "possible secret in code" hits on `lib/coach-marks.ts`,
      `lib/first-look.ts` and `scripts/verify-pack.mjs` were already in the register as `SEC-2026-082`,
      `-083` and `-001`, each refuted — and were reported again as **critical** in the run on `bc2f786`.
      They are identifiers that contain `KEY` or `secret`.
    - **QA:** the same timeout complaint about `tests/workspace-list-report.spec.ts` came in one
      round with three fingerprints (`815c4fd44312`, `c5fd53baae83`, `efd8c1bf7e9a`) and in the
      next with a fourth (`dea455186459`) — for a single statement about a file that
      the reviewed state does not even touch.

    The fingerprint is `sha256(file + title)`; if the model words the title differently, it is
    a new finding, and neither `refute.mjs` nor the security register apply any more.
    **More precisely, re-read in the evening:** `untriaged()` in `scripts/security/lib/register.mjs`
    correctly filters decided fingerprints out of the count — the inbox, however, prints the
    full list of findings *without* marking which of them are already decided, and a
    reworded title gets a new fingerprint. In the second run of the day (`def8262`),
    of 26 critical and high findings **four** were already refuted with an identical fingerprint
    (printed along, unmarked) and **three** the same statement under a new fingerprint. Two levers,
    both small: form the fingerprint over
    `file + category` instead of over the title, and apply secret detection to values instead of
    identifier names. **Both are a change to the agent machinery and, according to `CLAUDE.md`, need
    Sonny's go**, so they are deliberately noted here and not done.
    **Observation, not diagnosed (18.09., late):** the QA delta review on `13e474c` reported
    the backlog finding on scope items as "only in the commit message, no prose diff included" —
    but the push `14ab490..13e474c` contained `a650a09` with 29 lines in `docs/BACKLOG.md`
    (`git diff --stat` re-checked). Whether the reviewer sees only the HEAD commit or a filtered
    excerpt is open; a single case, therefore only recorded here.

23. **From 7.3 (18.09.2026, evening) — three decisions, decided by Sonny: a) leave, b) leave,
    c) leave (18.09., late). Two follow-up steps remain.** For traceability, the questions:
    Decisions: *(a)* may a run in the mock sandbox be called "passed" anywhere? What is built
    is: never on a capability (E3, `mock-only`, `demonstrated-mock`, never green); the word stays
    with the runner for its own output. Proposal: leave it like that, in the UI "Demonstrated
    in the mock sandbox". *(b)* The receipt version bump 1→2 retires every stored
    receipt — existing projects read as *self-reported* until the suite runs again.
    Proposal: leave it like that, a filled-in stub list would be the lie that 7.3 is meant to prevent.
    *(c)* A run with replaced packages (`@sap/xssec` by a mock) reaches E3 and *names* the
    stubs; the alternative would be a cap at E2. Proposal: leave it like that, E3 already means "against mocks".
    Follow-up steps: the mapping scenario→test case is **declared, never guessed** — today
    `scenarioDemonstrations` rejects with `not-linked` until someone declares it; when the test generator
    is next touched, output `CCS-nnn` as the case ID and let a reader confirm
    it. And: **no UI** — the Testing stage does not show the scenarios yet; "so that
    business departments can check them without ABAP" is only fulfilled when they see them. Unchecked remains
    whether the wording holds up for a business department: nobody but the agent has read it.

24. **Roll out the rules — outstanding since 7.1, Sonny only.** `docs/registers/rules-deployment.json` has carried
    a `pending` entry (`7a068dad…`) since `a81b30d`: the `atcReport is map` type check from 7.1 and
    a clarifying comment (`91c98ea`); no client allowlist, no read rule changed, `adds: []`,
    `removes: []`. Nothing in the app depends on it — `npm run rules:check` says so. Roll out with
    `npm run deploy:rules`, then `npm run rules:record` without `--pending`. CI is independent of it:
    `tests/project-readers.spec.ts:190` briefly required on 18.09. that *nothing* ever be outstanding — that
    was not its purpose (which is: production serves the widened read rule) and has been reverted.

25. **MFA requirement for S/4 is built — one account has to be written to.** Since 18.09. (evening)
    all six S/4 routes refuse an account without an enrolled second factor, with a message that
    names the way (Settings → Security). Measured in production before the release: **exactly one**
    account has S/4 approval and no MFA (no admin among them). This one person loses S/4 access with the
    next `main` push until they set up an authenticator — they should learn of it beforehand,
    not from the 403. I only count; Sonny has the address in the admin console.
    **Addendum (late):** the same requirement applies to the own Gemini key (save, test,
    delete) — measured: **zero** accounts with their own key, so nobody affected. Runs,
    audit pack and Jira remain optional (Sonny). The welcome mail recommends MFA to every account,
    explains the setup (Settings → Security, authenticator app, six digits) and
    names the two mandatory places — the existing accounts do not get this mail again; whoever
    wants to inform them needs a separate message.

26. **Signavio export (4.3): "definitely later"** (Sonny, 18.09.2026, evening). The barrier from
    `ROADMAP.md` "3.0 — Switch-over" stays unchanged — 3.0 does not appear without the logged
    export into SAP Signavio Process Manager by a member with a license, and until then no page says
    "tested with SAP Signavio". It is only decided that nobody runs it *now*. Who runs it
    and when is open; `tests/signavio-claims-guard.spec.ts` holds the restraint until then.

27. **Scope items (7.2): path 3 is none — there is no official, public, machine-readable
    complete source.** Researched on 18.09.2026 (agent, only fetched URLs; three load-bearing facts
    re-checked by myself):
    - `me.sap.com/processnavigator` (successor of the Best Practices Explorer): only a login stub, SAP
      Universal ID / S-user mandatory — even for SAP Notes such as 3450904. *Checked myself.*
    - `rapid.sap.com` (the old Explorer): DNS resolves, port 443 refuses the connection. Dead. *Checked
      myself.*
    - Whether the Process Navigator offers an Excel/PDF export of the scope item list is **contradictory
      within the SAP Community itself**: July 2025 "export the list as an Excel", December 2025 "can't
      download that list", January 2026 "the global link … also disappeared". All three quotes present in
      thread 14147981. *Checked myself.* No SAP statement on it.
    - SAP Help Portal renders client-side (empty SPA shell for non-browsers); the "Feature Scope
      Description" PDF officially declared PUBLIC also redirects to the login. Both a *fetch limit*, not a
      statement about content.
    - Individual "Scope Document" PDFs in the SAP Digital Marketplace are readable without login and contain
      exactly the table form (Business Process | Scope Item | Description, e.g. `18J Requisitioning`,
      `J45`, `BD9`) — but only a subset per packaged service (~60 of 700+), contract annexes with
      T&Cs, opaquely named, bucket listing 403, no license for reuse.
    - GitHub (`SAP`, `SAP-samples`, third parties) and npm: no catalog. One third-party project explicitly states
      that it mirrors no SAP data.

    **What remains:** *(1)* **account input** — the user enters a scope item per capability, provenance
    "self-reported", cap E1 as built; possible immediately. *(2)* **Import of a file that the operator
    pulls himself with his S-user** — requires that the export in the Process Navigator still
    exists today (only Sonny can check that with a real login in five minutes) **and** that SAP's
    terms of use for "SAP for Me" content allow display in a third-party, free product
    — unlike the Cloudification Repository, which as an open GitHub repo under a clear license
    exists precisely for that. Scraping the login UI: not without clarified terms.
    **As of 18.09., evening:** Sonny is fetching a Signavio export; path 1 waits until it is there.

28. **From 7.5 (18.09.2026, late) — four decisions, made by me, and three export gaps.**
    *(1)* `withheld` remains the named wrong conclusion ("is one nobody calls any more") — defensible
    **only** with the prefix "Not said while this is open:", which the guard pins since today (before,
    it stood in the component alone). *(2)* **One** window task with the objects as anchors, not
    one per object: the action is one; 7.8 can fan out per element, that then changes the IDs.
    *(3)* `ASSIGN (lv_field)` stays out (field access, not a call); the coverage gap
    `dynamic-target` (table/type named at runtime) is real pseudo-knowledge ("no table access
    found"), but not in the 7.5 line — **as a fourth task type in a small step of its own**,
    not silently added. *(4)* "394 days" in the task sentence, "13 months" next to it — both stay.
    **Export gaps, reported instead of built in:** `business-rule-set.ts` has no exported
    program name reader (7.5 therefore carries no `program`); `process-skeleton.ts` exports no
    `includesNotRead(facts)` — 7.5 **duplicates** the two-line `INCLUDE STRUCTURE` exception, the
    only real drift point of the step; `coverage.ts` has no predicate "is this construct a
    call". Three small exports, one cleanup step. Measured: `Z_MM_PO_APPROVAL` 3 tasks (two
    includes, one `CALL FUNCTION lv_fm_name`), Legacy-1000 none, the six small ones none.

29. **From the security audit on `b88c77b` (18.09., late) — three follow-up items, IDs in the sealed
    register.** *(a)* **SEC-2026-150, P2:** the transformation prompt puts the output contract *before* the
    untrusted ABAP sources; hardening: repeat the contract after the sources, validate the model output against a
    schema, set markers server-side — and **check whether an injection can flip displayed
    support levels** (unchecked, therefore assumed). *(b)* **SEC-2026-151, accepted
    risk with a wording problem:** an audit pack with an attested file without a digest is still called
    `authentic`; the verifier says in the same breath "presence was sealed, contents were not". That is
    by design (attested ≠ signed), but a reader sees the word first. Follow-up step: a separate
    status value for "signed, attestation unsealed". *(c)* **Cosmetic:** `lib/gemini.ts:72-79`
    sends `userId` and `idToken` along in the body; the route reads neither (0 hits) — dead
    baggage from an older version that leads every reviewer to the same false alarm. Remove.
    Of 20 critical and high findings of the run: 4 already refuted with an identical fingerprint (the
    name false alarms, for the third time), 12 refuted, 2 scheduled, 1 risk, **1 real** — the
    model URL in the presentation viewer (SEC-2026-152), fixed.

30. **From 7.6 (18.09.2026, late) — three decisions, made by me, and two friction points
    with 7.2.** *(1)* `carrierToday.level` stays `null` with provenance *Reconstructed* and line anchor —
    the 7.2 ladder measures how strongly a *standard candidate* is evidenced; "the code calls ME21N in L631"
    is not one, and E0 as well as E1 would be wrong for it. In the display, the provenance chip stands in the
    place of the E identifier. *(2)* Field name "Where the catalogue points" instead of "Carrier in future" —
    the heading must not be a promise, and the catalog names **not a single Fiori app** (measured
    on the sync of 15.09.: `ME21N`, `ME51N`, `VA01`, `VA02`, `MIGO` are missing; all 414 successors are
    DDLS/CLAS/INTF). *(3)* No "SAP GUI → Fiori" in sentence 3 — which client a report starts from
    is not in the source code; which app a released object delivers is not in the catalog.
    **Deterministic finding, built in:** `CALL TRANSACTION … USING <bdcdata>` is batch input — nobody
    sits there; both shipped programs drive their transaction that way. "Users work today
    in ME21N" would have been the most likely wrong sentence of the step.
    **Friction with 7.2, reported instead of changed:** `StandardCapability` does not name its routines
    directly (a `routines: string[]` saves 7.6 and 7.8 one pass each); `SCOPE_ITEM_NOTE` is also
    used for catalog pointers — a neutral name in `evidence-level.ts` would be cleaner. **Not
    built:** no panel. `lib/abap/user-change.ts` is **not client-safe** (pulls in the engine); a
    panel gets the report as a prop from a server component or route, never via import into a
    client component. Measured: 14 records across eight programs, two training notes, `E2+` = 0.

31. **UX review of `b88c77b` (18.09., late) — 16 undecided, all decided; and §13 had never received eight
    older decisions.** 4 refuted: the three ToS card findings (the component remembers
    "Not now" via `sessionStorage`, `TermsReacceptGate.tsx:69,87`; the screenshots show the card
    on every route because the capture never clicks) and the `&amp;` title (JSX decodes entities in
    string attributes — proven with `ts.transpileModule`). 1 deferred (UX-131: remember "Not now"
    across sessions — would be an account field, decision for Sonny; recommendation: leave it).
    7 fixed immediately: integrity green only for what has been checked (estimate and blueprint neutral like the
    code line, guard over all three), link from the refused bundle to Transformation, a sentence
    under the invalidated personal-data confirmation, "Search discussions" → announcements,
    roadmap numbers and `v1.22` out of the product UI, `<label>` without a field → `<p>`, workspace gate with
    `role="status"`. 4 scheduled (1.4/1.5). §13 was rewritten completely from `register.mjs table`:
    UX-121…128 were in the register, not in the roadmap.

32. **Security audit of `b88c77b`, the 83 medium ones (18.09., late) — 65 refuted, 6 risk, 12
    scheduled, 5 of them fixed immediately (SEC-2026-225/227/232/235/236).** The bulk: 22 rows are one
    single npm advisory (mermaid, moderate, fix without a major — scheduled as SEC-2026-234; the
    firebase-tools rows are a devDependency), 8 "sanitizer not supplied", 7 "firestore.rules not
    supplied", 4 mockup HTMLs. **Real:** `ApiBusinessHubMapping.tsx:53` set `map.apiHubUrl` raw
    on `href` — the same class as SEC-2026-152 (now `sapApiHubUrl`, host-bound, guard);
    `/api/gemini` measured an array `prompt` by its element count (now: string only); the tenant mails
    took the address from the body, which copied it from the document written by the applicant
    (now: `getUser(uid).email`, the response names `to`); a macro ring in the ABAP was a
    stack overflow in the effect reader (now: an `expanding` set); an e-mail in the client log. **Open,
    scheduled:** SEC-2026-228 (macro expansion is bounded in depth, not in breadth — a budget in the
    `table-dependencies` reader, P2), 226 (per-uid limit on the S/4 routes, P3), 229 (CSP twin of
    131), 230 (`jti` for the approval token), 231 (`isValidUser` is dead rule code), 233 (check the
    mail collections `email_sends`/`email_events`/survey outbox in the deletion cascade). **Found
    along the way:** the Datenschutzerklärung does not mention the survey (0 hits for "survey/Umfrage" in
    `app/datenschutz`) — a condition before the survey machine is switched on again.
    **Stopped by the classifier:** the exact gitleaks fingerprint for the second
    register write (`076bfcf…:docs/security/register.enc.json:generic-api-key:1`) — Security
    CI stays red until Sonny enters it or decides on a rule allowlist for the sealed registers
    (third case in one day; the file itself says "never a path").
    **As of 18.09., evening:** gitleaks is decided — rule allowlist for the two sealed registers in `.gitleaks.toml` (Sonny); the `.gitleaksignore` line is therefore no longer needed.

33. **Full QA review of `b88c77b` (`gpt-5.6-sol`, 769 files, 5.70 USD, `INCOMPLETE`) —
    1446 findings: 49 critical, 226 high, 1129 medium, 42 low; verdict no_go.** The 49 critical ones
    break down into ten themes: 34× workflows ("an employee changes scripts on `dev`/dispatches a
    branch and gets secrets") — refuted against the collaborator list (exactly one account with
    write access, 18.09.; fork PRs get no secrets), **with a condition in the register**: from the
    second account on, every one of them becomes true; 5 name false alarms (storage key names); 8 on
    the signature chain — `files[].bytes` is explicitly excluded in the header of `audit-pack-canonical.ts`
    (the content hash pins the file), the `provenance` label is read by no verifier
    (classification via the signed `attested` list); **2 open** (26350daa4493, 8f267dbfbd9b):
    the web verifier hashes `file.async('text')` instead of the archive bytes — an invalid
    UTF-8 byte that decodes to the same character passes; effect zero (same text), hardening
    small (hash `uint8array`, test with a broken byte), to be done. **Decision for Sonny:**
    the public dev service runs with the production secret set and the same Firebase project
    (`deploy.yml:240-257`) — the documented two-environment decision; every gap on dev is
    one on prod. Leave it deliberately as it is, or give dev its own set (a second Firebase project).
    **The 226 high ones are not triaged**; grouped by file they are ~55 files, the heaviest
    themes: router misroutes (`extensibility-router.ts`, 17), Open SQL read errors in
    `table-dependencies.ts` (17), concurrency in Transformation/Design/Documentation (stale
    inputs are saved as current), deleted projects are recreated by running runs/packs,
    locked accounts keep Firestore and S/4 access (the rules do not check `status`),
    model receipts not bound to source/project, stale artefacts become "current" through an edit.
    Proposal: by theme, one step per theme, most critical first (lock, deletion,
    receipt binding); the 1129 medium ones only by sampling.

34. **Cross-review c5085bb from the desktop (19.09.2026, morning) — 20 findings, all checked against the code,
    taken into the roadmap (§15, §9 no. 15–18, eleven new steps).** The package is of a different
    quality than the agent runs: it executed functions (router, classification, 74
    skeleton/BPMN runs, TCO, XML guard, six comparator mutants, Node permission probe) and
    cites SAP primary sources. 17 confirmed, 3 partly; nothing refuted — but two things are
    decisions, not errors (grade definition, transaction semantics), and one is positioning
    (A/B). **The heaviest point is CR-09** — thought through to the end on the real deployment; blast radius and
    sequence of events are only in the private report to Sonny of 19.09. and in the review package, not here
    (rule: IDs instead of details as long as it is not fixed). Decision with Sonny (§9 no. 16); recommendation:
    lock the mock path until 8.9, interim protection immediately. **In progress immediately (19.09.):** CR-13 (reader on four
    routes), CR-20 (XML guard with saxen), CR-14 (fragment), CR-16 (TCO validation), CR-09 interim
    protection; CR-03/04 and CR-07 are with the two engine agents. The review package lies privately on the
    desktop (OneDrive) and contains the code export — not into the repository.

35. **The red Security CI of 21.09.2026 (run 35566863748) had two causes, one of them
    unnoticed until now.** The Monday run is the only one that reads the **whole** history —
    a push run sees only the pushed commits. That is why it was red while every run on
    `dev` was green. (a) **Nineteen of the twenty-two hits** are the sealed security
    register: the allowlist for it has been in `.gitleaks.toml` since `c5085bb`, but `main`
    is on `b88c77b` and does not know it. It goes along with the next approval; nothing to
    do. (b) **Three real false alarms**, all three the rule `generic-api-key` on a *name*:
    the ABAP program name `ZCC_REF_056_CHILD` from reference case CC-056 (twice, in the
    expectation file and in the corpus document that quotes the same identity) and the loop in
    `tests/no-fabricated-figures.spec.ts` that checks that three secrets still reach the service
    — it lists their *names*, not a single value is in the file. Entered as exact fingerprints
    in `.gitleaksignore`, with a justification per entry; reproduced locally against `gitleaks 8.30.1`
    and proven: the history of `main` and that of `dev` are both
    clean. **Found along the way, and this is the actual finding:** a full run over *all* branches
    (`--log-opts=--all`, which CI does not do) reports five more hits in a 12 MB log
    of an IDE session in the very first commit of 28.05.2026 — a real Gemini key in
    plain text, publicly retrievable, because GitHub keeps serving dangling commits of public repositories.
    It is **dead** (`API_KEY_INVALID`), the blast radius therefore zero; the state
    remains. Decision for Sonny in ROADMAP §9 no. 19. Deliberately **not** entered in the allowlist:
    a real key does not belong in a false-alarm list, not even a dead one.

36. **`saxen` was a stowaway.** The new XML guard (CR-20) imports the parser
    that `bpmn-js` brings along anyway — but it was only in `node_modules` as a transitive dependency of
    `moddle-xml`, landed at the top because npm happens to hoist it. The import
    resolved locally and in the build and would have failed on the day `moddle-xml` shifts its
    range or npm installs nested: as a 500 when saving a
    revision and nowhere else. Now declared in `package.json` (`^11.1.1`, the same
    version, no new download); the lockfile generated with the prescribed toolchain
    (`node@22`/`npm@11`) — a one-line diff, the nested `js-yaml` entry is still there,
    `npm ci --dry-run` green.

### Hygiene before the next wave starts
    **As of 18.09., evening:** dev with production secrets — leave it deliberately as it is (Sonny); the condition "second account with write access" is in the QA register and in ROADMAP §9.

20. **Restart the emulator and dev server** before more than four agents run. The emulator stood
    at 6.3 GB and 20,000 CPU seconds this evening; its failures look like regressions.
21. **At most seven agents**, and preferably four. Beyond that the machine becomes the bottleneck —
    lint went from two to forty minutes and once died on the heap.
22. **Install after every merge with a new dependency** — and never `npm ci` in the main checkout
    while agents point at it via junctions.

---

**Closing time 18.09.2026 — v2.13.0 is on `main` (`a7c9e71`).** The day had three themes:
finish Phase 2, build Phase 3 completely, and work through the full review of `a19945ef01dc`
instead of continuing to triage it. Fourteen strands ran, mostly four to seven at a time.

**Built: eleven roadmap steps.** 2.4 Business naming · 2.5 BPMN view · 2.6 BPMN export ·
2.7 First look · 2.9 Navigating large processes — **Phase 2 is thereby complete**. 3.1 Editor ·
3.2 Revisions · 3.3 Review notes · 3.5 States per element and rule · 3.6 As-is and to-be —
**Phase 3 is complete**. In addition 4.4 Short brief and 5.1–5.5 Sharing, both on `dev` and not yet
on `main` (reason below).

**The engine: 24 corpus defects down to one.** Three families closed. The thirteen
engine defects of the full review had *one* root — every detector brought its own half
masking, none knew the string template, two did not know comments either. The rule
is now in `lib/abap/statement-reader.ts` once, six detectors read it, five copies of their own literal
handling are deleted. The two heaviest findings *deleted* something instead of inventing it:
a commented-out declaration made the critical write access to VBAK disappear
completely, and a word in a string template turned a real write access into an
internal table operation.

**The one remaining defect is not one.** CC-050 · level: the engine's A comes from the
released `I_CUSTOMER` and is correct as an object grade; the case's B is an **artefact level**
according to R03. What is missing is the language version — and a level per artefact is something
`/method/levels` publicly refuses. A product decision, not a bug fix.

**The full review is worked through, not just read.** Of 504 findings: all 30 critical and
all 94 high decided; 46 fixed (11 engine, 14 security, 10 honest statements and survey,
11 trust chain). The release v2.13.0 brought a second full review (25 critical, 97 high) and
a security audit (3 critical, 1 high) — the critical ones of both are decided, the 97 high ones
of the second are still open.

**Two real holes closed.** Zip slip in Delivery: model-generated paths went unchecked into the
archive and on unpacking would have overwritten files **on the customer's machine**; the check
now rejects instead of repairing. SSRF in the egress allowlist: `h.endsWith(s)` instead of
`h.endsWith('.' + s)` — so `evil-sap.com` matched `sap.com`. Plus SEC-2026-025 from the morning,
a file-read hole in the test-run sandbox.

**And the finding that was in no review report.** `id-token: write` at workflow level plus
`npm ci --foreground-scripts` plus a workload identity provider without a ref condition for a
service account with `roles/editor`: a malicious npm package would have become editor in the GCP project, without
humans, without a fork, without a pull request — and `usage-report.yml` runs on its own on Fridays. The
reviewer had reported fourteen workflow findings and named this path in none of them; it
assumed throughout a collaborator the repository does not have (one, zero forks). The
permission is now in the deploy job alone; the provider condition is still missing and needs `gcloud`.

**Honesty towards the outside.** The how-to page and the landing page describe the product that
exists: six screenshots from July deleted instead of painted over, seven phases instead of six, the chatbot
reads the same source as the page. Every answer of the running satisfaction survey was
invisible — a dot in the Firestore key is not a field path but a character in the field name.
Five places where the product claimed more than it does are gone instead of reworded.

**What the reviewers revealed about themselves.** 44 refutations today, and they fall into four
patterns: ten times "an assertion was removed" while the commit had replaced it multi-line and sharper
(check the net balance, do not read the hunk) · four times lines that did not exist at the reviewed
commit · three times a name pattern without substance (`_KEY` plus string) · twice the
comment of a guard read as a description of what the guard prevents. **Twice the
reviewer's advice was more dangerous than its finding** — with the proposal to remove the `AIzaSy` exception
(a real key would have landed in the signed pack), and with the fourteen workflow findings that
hung on an invented attacker.

**My own mistakes, so that they do not come back.** (1) Read the return value of a pipeline as the
test result — `tail` returned exit 0, Playwright had twenty failures. Only the line
`PASS (n) FAIL (m)` counts. (2) Ran `npm ci` in the main checkout while seven agents pointed at the
same `node_modules` via junctions; it deleted and then failed on a lock. My own briefing
forbids the agents exactly that. (3) Did not install after a merge with a new dependency — `bpmnlint` was missing,
and hours of local red came from that. (4) Cleared a ref during render (`react-hooks/refs`) and thereby turned the build on `dev`
red; strand Y reported it although the file was off-limits for it. (5) Recommended rebooking CC-050 in the baseline —
**the corpus ratchet caught it**, with an assertion someone wrote before there was
anything to gloss over: *"not a single engine defect across 68 cases — that would be the moment to distrust the
comparison, not to praise the engine."*

**What the machine taught about parallelism.** Seven agents are the limit of this
computer, not of the work: a lint run grew from two to forty minutes and once died at
6 GB heap; the Firestore emulator stood at 6.3 GB and 20,000 CPU seconds after one day and
had to be restarted, which cost one strand two hours. **A wandering failure in
a large spec set is an infrastructure sign, not a finding** — but only if you re-check it
individually.

**And the lesson about seams.** I assigned 3.1 and 3.2 in parallel without naming who owns the
place in between. Both strands delivered cleanly, and in between there was nothing: the editor
saved to nowhere. For 3.5/3.6 and for 5.1–5.3/5.4–5.5 I therefore fixed the data contract
**beforehand** and named myself as the owner of the seam — both times it held without a
line of adjustment.

**Closing time 17.09.2026 — v2.12.0 is on `main` (`e3817ce`).** The day had three themes: two
security holes, the reference corpus, and the start of Phase 2. Six strands ran
in parallel, each in its own worktree.

**Two real holes, both reproduced before the fix.** A signed evidence pack was
forgeable: the file name was allowed to carry the separator of the canonical form, so
two signed evidence files could be merged into one — same bytes, valid signature,
one evidence file fewer, and `verify-pack` said "Verified." with exit 0. In addition the
attestation checked only the *existence* of the file, not its content, and issue date and
format version were not bound at all. And: an administrator without a set-up second
factor could delete any other user's project including signed runs from an ordinary ID token,
because `decoded.admin === true` counted as ownership and the MFA gate lets every
token through if the account has not activated a factor. Both fixed; old packs
continue to verify byte-identically.

**The reference corpus is in the repository and checks the engine** (step 2.10). 68 cases as a
case book under `docs/korpus/`, 209 generated files under `tests/korpus/cases/`, a
ratchet in `tests/korpus-engine.spec.ts`. The baseline is the actual news: 340
case-and-class pairs, 178 matching, **24 engine defects**, 4 cases in which the corpus
itself is wrong, 134 statement classes the engine does not produce yet. The three
defect families are in the roadmap as step **2.11** — nine cases get D instead of C,
because the grade ignores access type and successor; five judge more leniently than allowed
(among them A for `WITH PRIVILEGED ACCESS`); nine do not see a dependency at all or see the
wrong one. The way there: four models unanimously rejected v1, a cross-review judged 35
rules (six did not hold), five authors built v2.1 from that, and a
pass through public repositories proved for nine cases that their construct really
occurs — without a single pointer in the repository, because fourteen of the fifteen sources carry no
licence and the ones that carry it are, by all indications, unauthorised uploads of
employer holdings.

**Phase 2 has visibly started:** 2.3 builds the process skeleton deterministically from code
(`Z_ORDER_INTEGRITY_CHECK` gets 0 nodes and a note instead of an invented start),
2.8 finds 140 hidden business rules with an anchor. Both carry the corpus rules.

**Nine UX findings, four promises removed without replacement** (step 0.2): the
remediation switch switched text instead of code, the "Transformation Insights" were the same for every
project, the SAP Build badge promised an export without a counterpart, and the forum
reported success after it had written to `useState`.

**The four loops after the release:** production serves v2.12.0 (`e3817ce`, 06:38Z).
The UX review calls the cut "more honest — sham forum, false TCO promises and
duplicate quota rules are gone"; its twelve open findings are triaged, six
accepted, six refuted (five of them duplicates, three times the same token list, the scale decided in
`DESIGN.md` §1.2/§1.5). Two of them are worth touching first
tomorrow: **UX-107** — a button on the admin path says "Sign In as Admin" and calls
`auth.signOut()` (checked myself, it says exactly that, S effort) — and **UX-102**, the
how-to page promises six phases while the product has seven; an architect reads that
*before* the first run. Security audit and full review of v2.12.0 were still running at
shutdown; their findings are the first thing to pick up the next day.

### What is open and why

1. **The QA agent no longer reads — and still reports green.** This is the most urgent
   point. A review over `5f84bb2` and one over `9edb37f` made **zero model calls**
   and returned `go_with_notes`; a green check mark over unread code is worse
   than a red one. Two causes, one fixed: the corpus bundle had driven the delta to 3.3 MB
   (`tests/korpus/cases/**` is now in the exclusion list, ratchet and
   converter stay checked) — but **262 carried-over findings with 288,335 characters** go into
   every request before a file is added, and blow the budget on their own. The checkpoint
   has been stuck since `a19945e`. Two ways: triage the backlog (the 222 medium ones are largely
   design-system gallery and workspace, i.e. roadmap work) or pass along only the *new* findings.
   Both change the agent machinery.
2. **Decisions 7 to 13 in ROADMAP §9** — secret rotation, CSP without `unsafe-inline`,
   S/4 credential proxy, the faulty ABAP in the shipped 1000-line example, the
   lenient decimal rule, comment lines in the complexity, the review budget.
3. **Does the forum stay?** The writing half is gone, the announcements are readable and labelled as
   read-only. Whether the board as a whole stays is not decided.
4. **Step 0.2 is not finished:** the facts service and copy CI are outstanding, and §14 schedules around
   thirty QA findings into the same step.
5. **The 80 high findings of the full review** of v2.11.1 are the next triage; the 30
   critical ones are all decided.
6. **The corpus still needs:** to pull every `source.abap` through abaplint and the metamorphic
   properties (then the cases carry these stages), to correct the four cases in
   which it contradicts itself, and the machine-readable case bundle with a context hash.
   `architekt` stays 0 for every case — that is the limitation it lives with.

**As of 16.09.2026, late — v2.11.1 went to `main` at 21:53Z (`a19945e`, 90 commits since
v2.11.0, fast-forward, CI green, rules rolled out beforehand at 20:25Z). Phase 0 and Phase 1 are
complete, Phase 2 has started.** Phase 0 finished with 0.5 and 0.6 (input manifest in the
signed run, conservative invalidity instead of a freshness heuristic), 0.9/0.10/0.11 (the eight examples each
free once, demo under `/demo/{stage}` from a real engine run, trust card with evidence register),
0.3 (rule version measured, five TCO promises gone, distinction from SAP's metrics), 0.7 (approval fields
only via `POST /api/projects/{id}/commands`, rules deploy with a record), 0.17 (the five open
points caught up) and 0.18 (engine corrections). Phase 1 complete: 1.1 preservation register, 1.2
zero-LLM path, 1.4 workspace shell, 1.5 design as components, 1.6 no dark mode, 1.7 green means
evidenced, 1.8 "My workspace" as a list report — 1.3 had been brought forward in v2.10.1. Phase 2 started: 2.1
branches, 2.2 calls, both deterministic and with a line range; **2.3 to 2.9 are outstanding, the
phase is not finished.** In addition the first complete security audit (247 reported, 24 decided, most
refuted), the UX delta review (7 decided, 2 refuted) and around a dozen QA rounds.

**Added late in the evening of 16.09.:** the race test for 0.6 now holds on the
production build too (`a19945e`, CI green — the 37 kB source keeps the window open, the sampler stops when
the request ends). Two independence checks above the engine, both as a ratchet in the test: **abaplint as
second parser** (`tests/abaplint-second-opinion.spec.ts`; nine deviations with a verdict in the register, "we
are right" is forbidden there; four defects on string template literals in three readers fixed — one
of them made an `IF lv = |Status: ok|.` disappear from the diagram) and **five metamorphic properties**
(`tests/abap-metamorphic.spec.ts`, 98 tests, a red proof per property; `ENDIF. " done` did not count
as a closer, complexity 10 instead of 9). Three further findings from it are in
ROADMAP §9 as decisions 10–12 and two as work in Phase 2. **Reference corpus:** four models with an identical starting position
say unanimously "do not approve"; decision Sonny: no external reviewer, v2 built with
independence stages and a negative list (ROADMAP §9, decision 1). And the QA checkpoint had been stuck
since `44a8715` because the accumulated delta did not fit into four calls — 16 findings of the large
delta refuted with evidence, the checkpoint was caught up to `a19945e` in six slices via `workflow_dispatch`,
the budget stayed untouched; a further twelve findings from the slices refuted (three
"model involvement client-controlled" — since `9585a6d` it comes from the receipt; four object `trim`;
rules-deploy family; switch intent).

**After the `main` push (a19945e, 21:53Z) during the night:** security audit v2.11.1 **without a confirmed finding**
(619 files, one pattern hit in the public verifier, done in the register). UX review: four findings,
all already decided. Full review: 30 critical / 94 high / 373 medium, INCOMPLETE — six known, eight
refuted during the night (`vercel.json` and the survey workflows do not exist at the commit), around 17 critical
hypotheses about audit pack canonicalisation and client-writable artefacts in signed packs are
**the first block on 17.09.** (ROADMAP §14). And the delta review of `04b4684` is stuck on the 52 kB diff of the
metamorphic spec — decision 13 in ROADMAP §9.

**`firestore.rules` must be rolled out by hand before the app deploy** (`npm run deploy:rules`) — changed twice
in this release: the admin read access to projects is gone, and 0.7 takes six fields out of the
client-writable allowlist. An app on rules that were not rolled out breaks exactly at these places.
The reason for this was a finding: the first look via the Rules API on 16.09. showed in production the
ruleset of 20.08., three tightenings behind the repository — for a month, without anything
reporting it. Rolled out at 14:43:04Z after Sonny's go, then checked on all six databases.
`docs/registers/rules-deployment.json` now records which text is live; `npm run rules:check`
compares offline, `npm run rules:verify` asks production, `tests/rules-deploy-order.spec.ts` breaks
on the one order that breaks production.

What only Sonny can decide or do:
- **Rotate the three CI secrets?** `S4_ENCRYPTION_KEY`, `MFA_BACKUP_CODE_PEPPER` and
  `PILOT_APPROVAL_SECRET` were in every run of the `validate` job until 16.09., i.e. in a job that runs the
  whole test suite and that any change to a spec can control (SEC-2026-024). The job no longer gets
  them; whether the values themselves are to be rotated is his decision.
- **The security register is lagging behind.** SEC-2026-008 (0.7), SEC-2026-014 and SEC-2026-015 are fixed in
  this release, but in the sealed register they are still at `eingeplant` — and therefore also in
  `docs/ROADMAP.md` §12, which is generated from it. A run of `scripts/security/register.mjs decide` catches
  that up; a status decision is not documentation work, which is why it is here.
- **SEC-2026-016 and SEC-2026-018 are waiting for him:** a hardening at a place where a tightening
  has already broken sign-in once (needs a test against the real login), and a design that no longer
  gives decrypted credentials to the environment of a child process.
- **0.2 is not ticked off.** The Signavio statements were withdrawn in v2.10.2, but the UX register
  still schedules nine findings into this step (UX-026, UX-027, UX-029, UX-037, UX-038, UX-040,
  UX-059, UX-076, UX-084). Either they belong elsewhere, or Phase 0 still has a remainder.
- **Open from 0.17, not caught up:** `42a7d6a55d3b` — the loss tolerance of the two CISO calls is tested on
  the building blocks, not at the entry point; for that `audit.mjs` would have to export its orchestration as a
  function instead of starting a check on import. Agent machinery, so his go.
- Still open from the state before: Identity Platform upgrade and the factor login on `dev` against the real
  Auth; the outdated bot branch `chore/sync-cloudification-repo`; the QA secret scanner that reports deleted
  lines; the Resend tracking setting (3.0.9).

**As of 16.09.2026, evening — v2.11.0 is on `dev` and waiting for Sonny's go.** Four cut-0 steps
built and integrated: 0.13 (Firebase-native second factor), 0.14 (account, keys, rights),
0.15 (dashboard, admin, the seven stages), 0.16 (scripts and workflows). Last delta check
`00f19f7d32a8`: 0 critical, 0 high, smoke OK, new revision served. Open and scheduled in 0.17:
four findings of the same kind — guards that read source text where only runtime evidence counts
(6a1e32c0b973, 1738da3d6e64, cca300dfb572, 6f7a14516006).

**Admin read access to projects removed (Sonny, 16.09.2026):** "take me out as admin on the topic of project
read access. it must be strict and only in emergencies of malicious code etc." `firestore.rules` no longer grants
admin read access on `projects/{id}` and `projects/{id}/runs/{runId}`, and the blanket admin `update`
on projects is gone as well — only the owner. A test in `tests/firestore-rules.spec.ts` signs in
with a real admin claim and proves reading, run reading and writing. The Datenschutzerklärung now says it
explicitly, including the one exception: an emergency (a credible report of malicious code in an upload) is a
deliberate server-side act via the Admin SDK, which bypasses the rules by design — not a standing
permission, and with a log.
**Sonny must deploy the rules by hand** (`npm run deploy:rules`), CI never does that. Until then the old version applies in
production.
Side finding: `tests/security-compliance.spec.ts` checked the GDPR deletion cascade by signing in as admin
and reading the documents as a client — that permission no longer exists; the check now runs server-side,
as for the collections that are locked anyway.

**Survey discontinued (Sonny, 16.09.2026):** "can stay off in general, it's over anyway without success." The
workflows `survey-send.yml` and `survey-digest.yml` stay off permanently — no longer "until the log fixes are on
`main`", but for good. No further effort on sending, digest or evaluation. The code stays
for now (removing it would be a decision of its own); the corrections from 0.16 to `send-survey.ts`,
`lib/survey/outbox.ts` and the survey page are built and stay, because they concern the same mail building blocks
as the rest.

What only Sonny can decide or do:
- **The security agent on `main` has failed for three runs** (most recently 35069919896): 52 consultant calls
  go through, then the CISO call twice does not answer with JSON and the whole audit is lost.
  Proposal: deliver the result even without the CISO summary **and** split the synthesis into two smaller
  calls. Both are agent machinery, so his go.
- **The QA secret scanner reports deleted lines** (`scripts/qa/lib/redact.mjs` reads the delta, i.e.
  `-` lines as well): a removed test constant was reported twice as a critical finding. A one-liner,
  but also agent machinery.
- **The bot branch `chore/sync-cloudification-repo` can be deleted**: same `sourceSha256`, same
  25,467 entries, 0 added/removed/changed, and its `fetchedAt` is older than the state on
  `main`. The 28,000 diff lines are formatting from an older script version. `push --delete` is
  refused to me.
- **Identity Platform**: after the upgrade in the Firebase console `npx tsx scripts/mfa-enable-totp.ts
  --apply`, then check the factor login on `dev` against the real Auth, then `scripts/mfa-reset.ts <mail>
  --apply` before his first sign-in — after that he sets up the factor again in the settings.

**As of 16.09.2026 — the full review of v2.10.7 worked through, on `dev`.** 144 findings from GPT-5.6 Sol
($4.91), each checked against the code, result in `docs/ROADMAP.md` §14: 130 confirmed, 11 refuted with evidence
(`docs/qa/refuted-findings.enc.json`, now 29 entries), 2 unclear, 1 done along the way. The lesson as yesterday:
the refuted ones were almost all components and functions that are rendered or called nowhere —
a model reads the file, not the call graph.

Fixed today (each with a test that is red without the fix): test account detection now counts only the
CI domain, no name prefix any more — `security-user-alice@example.com` was a deletion candidate; the
delta sync of the migration does not overwrite a target document that is not provably older; the survey scripts
print neither addresses nor the digest into the public Actions log, and a resumed send names the
stored end date and counts invitees per sent mail; the offline verifier follows no
`signingKeyUrl` from the pack, rejects archive entries the manifest does not name, and ends an
unsigned pack with 2 instead of 0 — the same for the web verification; `vercel.json` (every route publicly
cacheable, without effect on Cloud Run) is gone. The three remaining critical ones are steps of their own 0.12–0.13,
the high and medium ones fill 0.14–0.18.

Alongside: the security audit of 33471220d6e9 had no report after 70 minutes and 57 successful consultant runs,
because the CISO answer arrived truncated — `audit.mjs` now asks again exactly this one call
once (as a testable helper `askAgainIfTruncated`). **Attempt 2 failed differently:** 54 of 57
consultant runs ok, the CISO *answer* itself not valid JSON. Whether the CISO wrote prose or was truncated in the middle
of the JSON at `cisoOutputTokens: 40_000` (including reasoning, `cisoEffort: 'high'`, up to 300,000 characters of input),
the one error line could not say — `openrouter.mjs` now names `finish_reason` and the token counts on invalid
content (never the content). The budget decision — more output tokens
for the CISO or effort `medium` — is Sonny's: **`medium`** (16.09.2026, `scripts/security/lib/team.mjs`);
the next release audit shows whether it is enough. v2.10.7 has no security report. `refute.mjs` now also finds full reviews (before,
no finding of a full review could be refuted). The bot branch `chore/sync-cloudification-repo`
is outdated — `dev` carries the same `sourceSha256` of 15.09. —, only Sonny may delete it. `sync-catalog.yml`
has been red since 07.09. because the PR step failed on the repo setting until 14.09.; since
15.09. the job no longer opens a PR, the next Monday run will show it.

**Sonny's decisions today:** `CLAUDE.md`, README and every publicly outdated file are only brought up to date with
3.0 (3.0.8); the deliverability of the mails needs a 3.0 step of its own, because the mails
land in spam automatically despite correct SPF/DKIM/DMARC (3.0.9). For 0.12 variant A: signed files
only from the run, the account's statements in a separate file of their own, unsigned and named as such —
**built on the same day** (`07-user-attested.md`, name bound in the hash, content not; both verifiers
show it; narrative gaps no longer in the signed run). With that, 10 of the 11 critical findings of the
full review are closed, 0.13 remains open (second factor before the session).

**QA round 2 on 0.12 (`ca3264f`):** the `validate` job was red because two comments in
`lib/audit-pack-canonical.ts` carried a version literal (version drift guard) — fixed; the
pipeline E2E was "flaky" (Design page under parallel load, green on its own). Confirmed and fixed: the
survey outbox is claimed in a transaction (two `--apply` processes do not send twice), `invited`
is derived from the `sent` records after the run instead of being counted up; the offline CLI canonicalises packs without
`runHash` like the web verifier; a route test (`tests/audit-pack-route-boundary.spec.ts`, emulator) checks
the signature boundary through `/api/runs/create` and `/api/audit-pack/create`. Refuted: the redactor
had read my own refutation reasoning as a secret (assignment form) — reworded, cross-checked with
`redactSecrets`.

**QA round time (question Sonny 16.09.2026):** a round on `dev` takes 14–17 min — model 8–125 s,
`validate` ~7 min, Cloud Run deploy ~7 min. Another Flash model would be the wrong lever (Luna: 0.3–7 cents
per round). Decision Sonny: **option 1 now** — `await.mjs` delivers the findings as soon as the review job
is finished (exit 3, smoke "pending"), and waits for the smoke check only on a clean review
(`waitForJob` in `scripts/qa/lib/gh.mjs`; runbook §4 and skill adjusted); **option 2 as a roadmap item** —
Dockerfile with layer cache instead of buildpack, Phase 0 "alongside". Model and effort stay.

**Roadmap addition (Sonny 16.09.2026):** in the Business view, process map, process chain and
standard fit tables show directly, on every element with a standard candidate, the adjustment options that lead closer to
fit-to-standard per operating model (Public Edition, Private Edition/RISE) — new step **7.8**,
deterministic from catalog, level and scope item, with evidence level and *Not determined* instead of an invented path.

**0.8 built (16.09.2026, `dev`, after 0.12 on Sonny's "carry on"):** the board deck no longer seals zero findings
as "Unconditional Go-Live Approved / LOW RISK" (UX-002, critical), but says "not determined" — a
trivial program and a crashed detector both arrive as an empty list, and the Delivery page now shows the
error; no more "Approved" from the static roll-up, the sign-off is reported as it is; "Resolved
Objects" was object count minus finding count and is now called "Findings by Level". A test turns the old around.

**QA round 3 on 0.12 (`79e7577`, review-first live: findings after 2 min):** three mediums, all confirmed and fixed —
`invited` is counted and written in the same transaction, the route test derives its forbidden list from the
whole fixture, the survey guard checks the order again. CISO effort `medium` (decision Sonny).

**QA round 4 (`efb7d24`, 0.8 + round 3):** five mediums, all confirmed and fixed — the empty deck now also says
"not determined" on slides 2 and 5 instead of "Fully Supported"/"0 to do"; the route test checks the enum forgeries
field by field and uses a sentinel that does not contain the old value; the survey outbox is a module
(`lib/survey/outbox.ts`) with an emulator test (`tests/survey-outbox.spec.ts`: ten parallel claims → exactly one
wins; the counter is transactional and never falls below a stored value), the source-text guard checks only
the wiring. Notable: the Admin SDK runs from a Playwright spec against the emulator — that
opens an easy way for 0.17 (emulator tests instead of source-text greps).

**QA round 5 (`9f4cede`):** four mediums — the empty deck no longer shows the coverage metric as a
percentage either (the clean core score stays, labelled as a value of the signed run); my `` in the route test had
landed in the file as a backspace byte (heredoc) and is now a real word boundary, the enum forgeries are checked per
target location; the outbox test has a loop harness (five runs, one provider call), checks the monotonicity of the
committed counters and the convergence on the records. **Not provable against the emulator:** the forced
interleaving "another run writes underneath the transaction" — writes from the same admin client during
an open transaction were discarded on retry (emulator behaviour, documented in
`lib/survey/outbox.ts`); the assurance itself (campaign document in the read set, `max(stored, counted)`) stands.

**QA round 6 (`a3c2e16`):** the word boundaries in the route test were backspace bytes for the second time — now written as
character classes without a backslash, with a runtime self-test. Lesson: backslashes in Bash heredocs simply
arrive; patch scripts with escapes via the Write path or without escapes.

**0.13, variant 2 checked (16.09.2026):** the Auth emulator (firebase-tools 15.30.1) cannot do **TOTP MFA** —
`mfaEnrollment:start` requires `phoneEnrollmentInfo`; native TOTP would not be testable in CI. In addition
Firebase requires a verified e-mail before enrolment (`auth/unverified-email`), which our password accounts do not
have today, and the Identity Platform upgrade applies to the one Firebase project that dev and prod share.
Decision Sonny is pending (see report).

**v2.10.8 is on `main`** (go Sonny 16.09.2026, after a clean round: 0.12, 0.8, the answer to the
full review, review-first loop, CISO `medium`). The three release intakes (security, UX, QA full review)
are running; the UX review brought one undecided finding (33a920d6be30, raw error text in the deck banner —
fixed immediately: an understandable line with a next step, technical detail collapsible).

**Security agent without dev self-test** (decision Sonny 16.09.2026): the workflow now runs only on
`main`; the self-test can still be started by hand.

**0.13 built, variant 2** (decision Sonny 16.09.2026, after it was clear: he is the only MFA user,
his account is Google-verified, Identity Platform costs nothing up to 50,000 MAU): Firebase-native TOTP MFA.
No ID token before the second factor; the server gates read `firebase.sign_in_second_factor` from the token
(`lib/mfa-gate.ts`, pure and testable without the Admin SDK); enrolment in the browser against Firebase Auth, `enrolled`/
`disable` as routes; our own TOTP apparatus is gone (routes, `lib/mfa.ts`, `lib/totp.ts`, cookie, secrets,
backup codes). Recovery via `scripts/mfa-reset.ts`, TOTP activation via `scripts/mfa-enable-totp.ts`.
**Next steps, Sonny only:** Identity Platform upgrade in the Firebase console; then I say when the
activation script runs, check enrolment and login on `dev` against the real Auth, and he sets up his
factor again in the settings. Until the upgrade every enrolment fails with a Firebase error —
that is the expected state, not a bug. **Run the reset script once for his account** (`mfa-reset
<email> --apply`) before he signs in after the deploy: his profile flag comes from the old TOTP; until then the settings
show "Set up again", and the mutating routes require a factor that does not exist yet.

**0.14 runs in parallel** in a worktree of its own (agent), the result will be integrated here.

**Open for Sonny:** delete the outdated bot branch (`git push origin --delete chore/sync-cloudification-repo`);
`main` after a clean QA round; switch the survey workflows on again only after that; check the
Resend tracking setting (3.0.9, possible only with dashboard access).

**As of 15.09.2026, closing time — v2.9.12 → v2.10.7 on `main` (3347122); this closing entry is on `dev`
and goes to `main` with the next release, so that no pure docs push triggers the full audit again.** The day had two halves:
in the morning the three agents and the first roadmap steps of Phase 0, in the afternoon the target picture of 3.0.
The lesson: every draft that a model or an agent delivered carried at least one error that
only showed up when reading it against the code — "4 free runs" instead of five analysis runs, a level C for
a customer table, transparency that pushes text below 4.5 : 1.

| Version | What |
|---|---|
| v2.9.12–v2.9.16 | QA agent checks every push to `dev` (sealed, with smoke) and two rounds on itself; security agent audits every `main` version; no more "AI Studio" in the repo |
| v2.9.17 | UX agent reviews every `main` version with screenshots |
| v2.10.0 | Roadmap 0.1: live tests against a tenant locked, with reason and reopening (`G0:R0`) |
| v2.10.1 | Roadmap 1.3: anchor check recognises the engine IDs |
| v2.10.2 | Roadmap 0.2: no more Signavio import promise |
| v2.10.3 | Roadmap 0.4: no monetary amount without an assumptions revision |
| v2.10.4–v2.10.6 | QA rounds as class fixes; the saved test suite appears after reload and starts selected |
| v2.10.7 | DESIGN.md 1.4.2 and mockups 2.8 accepted, SAP catalog current, eighth example, SEO guard, audit survives rate limits |

Without a version number, but with effect: QA on GPT-5.6 Luna (`dev`) and Sol (full review on `main`),
security agent on DeepSeek V4.1 Flash as a pipeline without tools, the UX full review of 7bdac5e
triaged (69 confirmed, 15 refuted, 2 deferred).

**Sonny's decisions today (all in `docs/design/decisions.md` or `docs/ROADMAP.md`):**
- Fiori patterns, not the Fiori theme; no dark mode; everything English for now; views always
  Business · IT · Management.
- BPMN beyond the minimum (with user task and data store), navigation of large processes via layers.
- Four buckets per target platform, Retire from usage only from 13 months and transparently, "Blocked by SAP"
  only for catalog objects without a successor.
- Costs: seven mandatory fields, two day rates. Glossary with SAP and product terms, also in
  "Ask this case", which always runs through the embedded help AI.
- Coach marks only in the browser. Each example free once, after that every start counts; after five analyses
  only with your own key.
- One demo for all accounts based on `Z_MM_PO_APPROVAL`. Before upload a Terms notice and
  evidenced trust statements; the community key is a paid Gemini key.
- The new landing page with real product views belongs to 3.0; pages with search reach (catalog
  and others) stay with URL and content.
- The agents' provider rule stays (no fallback).

**After the push to `main` (3347122, evening):**
- **UX review** (delta, $0.26): 73 findings, almost all carried over from the full review; three new ones confirmed and
  scheduled — UX-087 (missing debt value in green) → 0.8, UX-088 ("Clean Core Score" without distinction from SAP's
  opposing score) → 0.3, UX-089 (four terms for one value) → 1.5.
- **QA full review** (GPT-5.6 Sol): `no_go`, 11 critical, 36 high, 95 medium, 2 low — it blocks nothing, but will be
  **verified tomorrow as the first step before 0.8** (decision Sonny); security-relevant findings go into the
  sealed register, publicly only IDs.
- **Contained immediately (decision Sonny):** the two survey workflows are disabled
  (`gh workflow enable` reverts it) and the logs of all 38 survey runs on GitHub deleted; the GitHub CLI's local
  log store is emptied. Findings d2006fdbfa95 and 4a593e8bd77b — the scripts are corrected first tomorrow,
  before the workflows run again. **Sonny checks whether a notification under GDPR Art. 33/34 is required.**
- **Security audit** on `main` without a report: 57 consultant calls error-free, the CISO call returned no
  readable JSON. Clarify the cause tomorrow (size of the CISO input, response format), then restart.

**Open and why:**
- **Roadmap 0.8** (UX-002, critical): an empty finding list still yields "Fully Supported" — the next step after the
  verification of the critical QA findings.
- **Terms §6** must be reworded for roadmap 0.9 (examples: repetition counts) — the wording
  needs Sonny's approval, probably a new Terms version with renewed consent.
- **Datenschutzerklärung** should name the paid tier of the community key explicitly, before
  the trust card (0.11) says it.
- **The UX agent still photographs the mockups 2.7** as the target picture — switching to 2.8 as its own small step.
- **Landing page 3.0 accepted** (`docs/roadmap/clean-core-landing-v3_0.html`), in the roadmap 1:1 (§5).
  Open before go-live: the Datenschutzerklärung names the admin read access to projects and the paid
  community key; whether `/catalog` reads a search parameter; whether the showroom moves to `/how-it-works`;
  Terms §6 still speaks of "5 transformations".
- `E08-F01-US01` (runner isolation) stays its own assignment after 2.10.

**15.09.2026 — step 0.1 (`G0:R0`) built, v2.10.0 on `dev`.** The lock on the live tests is in
`lib/locked-paths.ts` and `SECURITY.md` §7.1; the route checks it before every measurement, around 30 texts
are corrected. **`E08-F01-US01` stays open** (runner isolation) as its own assignment after 2.10 —
it is the only way to give back the live mode. Found and corrected along the way: "Browser-side
Encryption" and an "isolated BTP proxy channel", neither of which exists.

**15.09.2026 — roadmap switched to version 2.8 and simplified.** `docs/ROADMAP.md`
is now short and alone binding; gates and the 76 slices are replaced by
**Phases 0–8 with steps of size S/M**. Decisions by Sonny:

1. **Outwardly, 3.0 is what counts** — the big UX rebuild along the mockups 2.7. The
   working states v2.11–v2.18 build the new interface behind an admin switch.
2. **Sign-up and account stay unchanged.** The data minimisation from 2.7
   (handle, removing name fields, migration) is dropped.
3. **Roles are only views** (Management · Business · IT), without influence on
   auditability; no "Playing as", no `self_play`. Responsibility stays
   with the signed-in user.
4. **Sharing = read access by invitation**: a link to one e-mail address, opens only for
   an account with exactly this confirmed address; including source code, the dialog
   says so.
5. **The Business view grows considerably:** BPMN reconstruction from the code with
   line anchors, an editor close to Signavio (no copy), import/export as BPMN 2.0
   XML for Signavio licensees — Phases 2–4, directly after the scaffold.

Findings during the rebuild: **the anchor check did not recognise the engine IDs** (`CC-001` against
parser pattern `[F-…]`) — step 1.3, **fixed in v2.10.1**; the interface promises
a **Signavio import that was never checked** — step 0.2, **withdrawn in v2.10.2**
(facts service, copy CI and audit corrections from 0.2 are still open).

**Cleaned up the same day:** every earlier roadmap is now in `docs/archiv/`
(index `docs/archiv/README.md`) — `ROADMAP-2.0.md` and the bundle of version 2.7
under `docs/archiv/roadmap-2.7/`, which also holds version 2.7 itself as
`ROADMAP-2.7.md` and the review of 08.09., which older entries here call
`roadmap_chatgpt.md`. Only the mockups and `SCHNITT-0-UMFANG.md` stay active in
`docs/roadmap/`.

**The roadmap has been in the repo since 12.09.2026:** `docs/ROADMAP.md` (then
version 2.7 — gates R0/R1/R2/3.0, 76 slices).

**The scope of release 2.10 was agreed on 12.09.** — the item from 11.09.
("scope is agreed before starting") is thereby closed. Four
decisions by Sonny:

1. **Level "Core + Foundation"** — seven slices: `G0:R0`, facts service and
   copy CI, level rule page and score rebuild, no money values without
   assumption revision, manifest contract, conservative invalidation, approval fields
   only via server-validated commands. The reference corpus runs alongside, because it
   depends on an external reviewer. **Preservation register and zero-LLM lock path
   slip to v2.11.**
2. **`G0:R0` is closed via the documented lock**, not via runner
   isolation: boundary, reason and reopening condition per `SECURITY.md`,
   live mode stays closed. `E08-F01-US01` stays open as its own assignment after 2.10.
3. **Data minimisation postponed to cut A.** Nothing changes on the profile in 2.10
   (14 files, ~62 occurrences, three mail scripts addressing by first name).
   Condition: no interface claims beforehand that only handles are stored.
4. **Public texts only where they are wrong** — audit corrections plus
   score renaming and TCO promises. The playground positioning on the
   home page and README stays its own, later assignment.

Details per slice with files and acceptance case: `docs/archiv/roadmap-2.8/SCHNITT-0-UMFANG.md`.

**As of 11.09.2026, end of day — v2.9.5 → v2.9.11, seven releases, everything on
`main` and deployed (`clean-core-00298-kvn`, `main` = `dev` = branch = `c1349b5`).**
The day had a common thread and a lesson. The thread: the roadmap
(`roadmap_chatgpt.md`), release 2.9 "Truth & Safety", item by item — by the evening
the development scope of 2.9 is done. The lesson: the most expensive findings again did not come
from the roadmap, but from touching the code next to it.

| Release | What | Finding |
|---|---|---|
| v2.9.5 | One phase contract (`lib/workflow-steps.ts`) for stepper, rail, dashboard, Delivery; Economics is phase 6; `status` is no longer read; test draft ≠ tested | CR-11, E01-F01-US01 (+ CR-16 remainders) |
| v2.9.6 | A source change makes everything old `stale`; Transformation/Documentation/Testing/handover locked; audit pack 409 server-side | E01-F01-US02, CR-10 (2.9 part) |
| v2.9.7 | Usage import: date format and window declared, quarantine, preview — and saved at all | E03-F02, CR-24 |
| v2.9.8 | Economics: no savings forecast without your own cost values, model marked as a demonstration | E12-F01-US02, CR-23 (2.9 part) |
| v2.9.9 | Test status: Skipped/Todo/Connectivity/Error, live ABAP without a false `Passed`, stubs named | E07-F01, CR-12/13/14 |
| v2.9.10 | `npm run typecheck` (tests included) as a mandatory step before the deploy | E16-F01-US02 |
| v2.9.11 | Red scheduled run of Security CI → mail to the admin | Operations (10.09.) |

Tests: from 555 to **608**, every release locally CI-equivalent (production build,
fresh emulators, whole log searched) and afterwards checked on `dev` and in production
via `/api/health`, revision and logs. Lint budget 673 → **661**.

**The findings outside the roadmap — the actual yield:**
- The **usage import was never saved.** `undefined` in the report, the
  Firestore client rejects that, the Analyze page only logged it. Verified directly against the
  SDK. Anyone who uploaded usage data had it only in the tab.
- The dashboard **invented a "Quality Engineering Report"** ("All test cases
  compiled and executed successfully") for every generated suite.
- The live ABAP path reported reachability and login as **`Passed`**, the
  CSRF line without a CSRF request ever being made.
- The rail existed on four of six pages only in the loading state; Delivery
  opened every project with "lifecycle is complete"; Economics calculated with
  900/650/15,000 €, which nobody had entered.
- Two type errors in a test had been there since 27.08., because `tsc` never ran over
  the tests.

**Decisions by Sonny today:** Security CI alarm **by mail, not as an
issue** (the repo is public) — implemented, TEST mail accepted by Resend
(`549c4fe9-…`), delivery can only be checked in the inbox. **E08-F01-US01 later.**
**Release 2.10 is agreed in scope before starting** — do not start on its own.

**Open for the 2.9 exit:** only **E08-F01-US01 — real runner isolation**
(Felix, GCP). Until then the attestation from v2.9.1 keeps the live mode closed.
CR-28 is fulfilled in the 2.9 part (revocable, labelled as a self-declaration, bound to the
source since v2.9.6); roles/attestation are E05/E13 in 3.0. CR-23 at its
core is E12-F02.

**Deliberately left open, by name:**
- The Testing page **does not store verdicts**. Testing and Delivery therefore stay
  `partial` in real projects. The right thing is a server-side
  test receipt (E07-F02), not a client write of `Passed`.
- Projects whose source changed **before** v2.9.6 continue to show old artefacts
  in the views as current; only for the approval does the server re-check them
  (from the run history).
- **Header on project pages 22 px too wide at 390 px** (user menu +
  avatar) — pre-existing, noticed during the screenshot check, not touched.
- Existing usage reports have no declared window; since v2.9.7
  they therefore no longer propose a decommissioning on a zero. Intended.

**For the next person working here:**
- `firestore.rules` is **not deployed by CI**. If a feature needs a new
  client field, that is a manual production deploy before the app. v2.9.6 took
  the detour via server-written fields and did not need one.
- Version numbers in comments only as `pre-vX.Y.Z` or `// vX.Y.Z:` — anything
  else turns `version-drift-guard` red as soon as the version moves on (happened
  twice, 10.09. and 11.09., both times caught locally).
- The finding list in this file was incomplete yesterday (CR-24 was missing). An
  exit list is a claim; re-derive it from `Release 2.9` in §12 of the roadmap and the
  code.

**Still open:** the ~30 unchecked GLM/GPT findings, G-05/G-06,
V15/V16/V18, the three tenant mails, finding v4 mid-September, the seven
moderate advisories below the gate threshold, DKIM to 2048 bit.

---

**As of 10.09.2026, end of day — v2.9.0 → v2.9.4, five releases, everything on `main`
and deployed.** The day had a trigger and a common thread. The trigger:
five feature commits had been sitting unreleased on the branch since 08./09.09.,
and v2.8.6 had never reached `main`. The common thread from v2.9.1 on: the roadmap
(`roadmap_chatgpt.md`, 16 epics / 64 features / 128 stories) instead of our own
prioritisation.

**What went out:**

| Release | What | Finding |
|---|---|---|
| v2.9.0 | Ed25519 alongside HMAC, `/method/levels`, both SAP views on object pages, narrative anchors on code lines | CR-01, CR-26 |
| — | `fix(deps)`: critical Next.js RCE that **was running in production** | — |
| v2.9.1 | Runner egress is measured instead of claimed | CR-15 / E08-F01-US02 |
| v2.9.2 | "No findings" ≠ "nothing to find": coverage report alongside the findings | CR-06 |
| v2.9.3 | Your own Z table no longer forces you off the stack (Private on-stack, Public → BTP) | CR-04 |
| v2.9.4 | No non-finite number reaches a chart | E12-F01-US01 |

**The day in one line:** four of the five releases built nothing new,
but caught up with a claim the product was already making — and the
most expensive finding did not come from the roadmap, but from a push turning the
security gates red.

**Three things that came up along the way and that remain:**

1. **Security CI had been red since 07.09., and nobody saw it.** The
   Monday cron and the push triggers report nothing; without a push to
   `main`/`dev` a red dependency check goes unnoticed by everyone. For three days
   a critical Next.js RCE ran in production. **Open: a
   notification that makes a red scheduled run visible** (open/update an
   issue instead of failing silently).
2. **The same error shape for the third time:** an `overrides` entry whose
   lower bound sits exactly on the gap (`fast-uri` in v2.8.6, now `sharp`
   `^0.35.3` against `<0.35.4` and `js-yaml` `^3.15.1` against `<3.15.2`). A caret
   raises nothing that already satisfies the range. Three occurrences are a pattern,
   not a coincidence.
3. **The content date generator had been broken since v2.7.2** — that release
   pulled `withTwitterCard()` across 18 pages, and "newest commit wins" read
   that as 18 pages changed at the same time. Fixed; the generator now skips
   pure plumbing commits.

**Open for the 2.9 exit (from the finding register):**

| # | Item | Who | Why |
|---|---|---|---|
| 1 | **CR-11 — canonical phases** | Development | Upload/Analyze separate, TCO missing, Testing counts *generated* cases |
| 2 | **CR-28 — sign-off as a revisable self-declaration** (P1) | Development | Approval attributes are client-writable project fields |
| 3 | **E08-F01-US01 — real runner isolation** | **Felix (GCP)** | own one-shot runner, minimal service account, proven egress rules. Until then the attestation from v2.9.1 keeps the live mode closed — correctly, because the container has open egress |
| 4 | **CR-23 — TCO assumptions empirical** | Development | Coefficients (2.5/0.8/1.8/0.6 days per 1,000 lines), 85 % test assumption, target score 95 are not derived from observed effort → E12-F02, release 2.10 |

**Also newly open:** the seven remaining moderate advisories (`mermaid`,
`qs`/`express`, `protobufjs`) are below the gate threshold and stay put.
**DKIM to 2048 bit** was noted for "after 09.09." — possible from now on.

**Still open:** the ~30 unchecked GLM/GPT findings, G-06, the 673
parked lint warnings (pulled down from 677), G-05, V15/V16/V18, the three
tenant mails, finding v4 mid-September.

**A self-correction for the record:** v2.9.4 went red to `dev` because I
reported a green run that was not one. `rtk proxy` returned exit 0 for a
failed Playwright run *and* filtered the line `1 failed` out of
the output I read. Both signals agreed and both were wrong.
CI caught it, the deploy was blocked, production was never affected. Lesson:
run test commands unwrapped and search the whole log, not the end.

---

**As of 01.09.2026, end of day — v2.8.5, one release, on `main` and deployed
(`clean-core-00289-pf4`).** One single strand: the survey that goes out on its own to 36 people
tomorrow morning at 09:00.

1. **The invitation now says thank you first** — and in such a way that the thanks is true for
   all 36, including those who never started an analysis.
2. **The only button on the page looked like "Submit"** and was greyed out.
   Secondary style, in the box, and a state that explains itself.
3. **The sending overtook Resend** — 429s were logged and skipped.
   Paced, with retries, and red on lost recipients.
4. **Deliverability checked one last time**, against `8.8.8.8` and production. Two
   gaps closed, one thing needs Felix (see below).

**The day in one line:** three of the four items are not defects — the API
answered with `200` throughout. They are design errors and a provider limit,
and you find both only by using the thing or by calculating what it does
under load.

**Tomorrow morning, before 09:00 — the last two judgements are still pending:**

| # | Item | Who | Why now |
|---|---|---|---|
| 1 | **Check Resend tracking** | **Felix** | 30 seconds, and it is the only thing about deliverability that I cannot see — see below |
| 2 | **"two minutes" in the subject** | **Felix** | open since yesterday; the subject goes out as it is |
| 3 | **"Version 3.0" as a commitment** | **Felix** | open since yesterday; after that it is promised to 36 people |
| 4 | Resend webhook: look at the first delivery numbers | **Felix** | live since 28.08.; tomorrow 36 events are added |

**After that, unchanged:** the ~30 unchecked GLM/GPT findings, G-06, the 677
parked lint warnings, G-05, V15/V16/V18, the three tenant mails, finding v4
mid-September. New on top: **rotate DKIM to 2048 bit**, but only *after*
09.09. — a key rotation on the eve of a send may be in the middle of DNS
propagation the next morning.

**Done on 01.09., one release:**

| Release | What |
|---|---|
| v2.8.5 | Thanks first; the button that looked like "Submit"; pacing against Resend's limit; postal address and unsubscribe in both mail parts; six new guards |

---

**As of 31.08.2026, end of day — v2.7.0 → v2.8.4, eight releases, everything on `main`
and deployed.** The day ran in four strands:

1. **The lint gate** that never checked what it was built for. 706 problems,
   errors to zero, 677 warnings pinned with `--max-warnings`, six real
   defects among them.
2. **V9 done.** The published fallback key is out of all three routes,
   with no fallback in any environment.
3. **Finding v3** — five evidenced items worked off, N-02 closed as the last.
   `clean-core-test` torn down and the pipeline secured against it.
4. **The activation survey** built, tested four times, corrected three times.

**The day in one line:** every serious finding came from a measurement that did not
exist before — and the most expensive came from a human who actually
used the mail.

**Tomorrow first:**

| # | Item | Who | Why now |
|---|---|---|---|
| 1 | **Finish and approve the survey** | **together** | it fires **Wed 09:00 automatically** — see the section below |
| 2 | **Resend webhook: look at the first delivery numbers** | **Felix** | live since 28.08.; every day without a look costs data |
| 3 | Unify four inks (see below) | Development | the headings pull together, the body text does not |
| 4 | German-language cluster (S-05) | Decision Felix | biggest content gap — and the survey asks exactly about it |

**After that:**

| Item | Who | Urgency |
|---|---|---|
| ~30 unchecked findings from GLM/GPT (phase 1.3, 4, 5 of the plan) | together | high |
| G-06: author profile on `/about` with real professional history | **Felix writes, I build** | medium — `Person` schema with `sameAs` is already in place |
| Work off 677 parked lint warnings (see below) | Development | medium |
| Round-2 proposals that are still open (see below) | Decision Felix | medium |
| G-05: roll out the BPMN text representation to the feature pages | Development | medium |
| `dev.` and `test.clean-core.io` do not resolve | Felix (DNS/GCP) | low — the docs now name the run.app addresses |
| V15, V16, V18 from the Grok finding | Development | medium |
| Rebuild the three tenant mails on fluid tables | Development | medium |
| Mid-September: finding v4 / measure reindexing | together | appointment |
| Commit the review tooling into the computation state | Development | low |

**Done on 31.08., eight releases:**

| Release | What |
|---|---|
| v2.7.1 | eslint gate live; six defects it had let through; page overflow |
| v2.7.2 | **V9**; finding v3: S-08 sitemap, S-09 Twitter cards, K-03, K-05, K-06 |
| v2.7.3 | **N-02** — the two lines where the site was wrong against itself; weekly report fix; fourth overflow cause; time zone error in our own guard |
| v2.8.0 | The activation survey |
| v2.8.1 | Multiple-choice ballot with four evidenced v3.0 candidates |
| v2.8.2 | The v3.0 framing and the activation nudge in the mail |
| v2.8.3 | Mail halved; progress instead of a completion message; "Your answers" |
| v2.8.4 | The `localhost` links, fixed three ways |

Plus, without a version bump: `clean-core-test` deleted and the `release` track
retired, the weekly report of 28.08. caught up manually.

**Already done earlier and overlooked in the backlog:** `llms.txt` has been in place since
26.08. under `app/llms.txt/route.ts`. And `/catalog/[object]` is statically
prerendered with its own `catalog-sitemap.xml` — S-07, the "biggest lever" from three
findings, is thereby built; only the measurement in Search Console is still open.

**Newly found while re-checking V9:** `clean-core-test` is a three-month-old,
publicly reachable build. See directly below.

**Newly found on 31.08.:** the weekly report of 28.08. was never sent.
Cause found and fixed; the fix is on `main` with v2.8.0 and thereby live.

---

## The activation survey — status, open judgements, and the deadline

**Built, deployed, tested five times, corrected four times** (v2.8.0 to v2.8.5).
The deadline for the last two judgements is **tomorrow 09:00**.

### ⚠️ It fires on its own tomorrow morning

`survey-send.yml` runs **Wednesday, 02.09., 09:00 Berlin time** and sends to all 36 — without
further approval. Then the campaign document is written with opening and closing date,
a send record is created per recipient, from Thursday the interim result arrives daily
at 09:00, and one day after closing (**09.09.**) the
final result.

**If it has not been approved by then:** disable the workflow *Activation Survey —
send* in GitHub Actions. That is the off switch. A second run
later sends nothing twice and does not move any deadline.

### Deliverability — latest status, 01.09.

Checked against `8.8.8.8` and against production, not from memory:

| Check | Status |
|---|---|
| SPF `clean-core.io` | `v=spf1 include:amazonses.com ~all` |
| DKIM `resend._domainkey` | published, 1024 bit |
| DMARC | `p=reject; rua=mailto:dmarc@clean-core.io; fo=1` |
| Return-Path `send.clean-core.io` | own SPF + `feedback-smtp.eu-west-1.amazonses.com` → SPF alignment |
| `List-Unsubscribe` + One-Click | set; `POST /api/unsubscribe` answers live with `200` |
| Text part | present |
| Images, attachments, tracking pixels | none |
| Links | exclusively `clean-core.io` |
| `GET /api/survey/vote` | `405` — a mail gateway cannot vote |

Two gaps closed: the invitation named **no postal address** (the
welcome mail has carried it since the first send — the wrong way round, because bulk mail
is the category the rule is written for), and the **text part left out the
unsubscribe link**, of all things for the reader most likely to see it.

#### ⚠️ The only thing I cannot check

**Whether Resend's click tracking is on for the domain.** The `RESEND_API_KEY` in
`.env.local` is send-only; `GET /domains` answers `401 restricted_api_key`. DNS
and the received message are the only evidence that can be had
from here.

If it is on, Resend rewrites **every** `href` to a tracking host. That is
a foreign redirect domain in a mail from a young domain — and it
breaks the principle the survey is built on: the URL *is* the vote.

**Check, 30 seconds:** in the test mail, hover over an answer button. The
address must begin with `https://clean-core.io/survey/`. If it does not:
Dashboard → Domains → clean-core.io → Tracking off.

### What was corrected on 01.09. (v2.8.5)

**The invitation began with "four candidates are up for choice".** Factually correct,
and for a mail asking a favour, a cold first line. In front of it there is now a
thank-you — with a second half that is not politeness
but accuracy: *"and if you have not got round to it yet, thank you for
signing up anyway."* Part of this list never started an analysis; that is
the reason the survey exists. A blanket "thanks for using it"
would be demonstrably false for exactly these readers.

**The only button on the page looked like "Submit".** Every question saves
on tap. Only the free-text field cannot do that — typed text has to be sent
deliberately — so it has a button. It carried the product's dark primary style,
stood at the foot of a questionnaire and was greyed out as long as nothing had been
typed. Anyone who had answered everything saw a dead submit button and concluded
that nothing had arrived.

Three changes, each with a job: **secondary style** instead of primary style, the
button sits **in the box** along with the line *"Everything above is already saved — this
box is the only thing on the page with a button"*, and the **greyed-out state
is no longer silent** — next to it there is always one of four truths. The
condition is also more honest: active when the field holds something the server
does not have (`comment !== sentComment`), instead of on "field not empty".

**The page claimed something about readers who had not tapped anything.** "Your
answer is saved" is only true for someone who hit an answer area in the mail.
Anyone who opened the bare link got a first sentence about themselves that
had not happened.

**The sending overtook Resend.** Two requests per second are allowed; the
loop waited for one response and immediately started the next, which from a
CI runner is four to eight. A `429` was logged as `FAILED` and
skipped — the person is never asked, the run stays green, and the survey
closes before the next scheduled send. Now: **700 ms pause**, **three
attempts** on `429`/`5xx`, and **`exit 1`** as soon as anyone is left over. Cost
at 36 recipients: 25 seconds.

**The same error type as yesterday's `localhost` links** — loud in its
effect, silent in the log.

### What was re-measured on 01.09.

| Check | Result |
|---|---|
| `tests/survey-guard.spec.ts` | 28 green, six of them new |
| Production build locally | green, only old warnings |
| Pipeline on `main` | security / validate / deploy all green |
| Deployed page against a real token | new version is served, old texts gone |
| Fifth test mail | `99f0fe9f-761a-4551-8128-738054a02530` |
| Dry run | **36 recipients**, `alreadySent: 0` — Wednesday starts at zero |

**The fifth test mail says "Open until 8 September".** It was generated on 01.09.,
the deadline is send date + 7 days. Tomorrow it will say 09.09. Not
an error.

**Two of Felix' own accounts are among the 36** (`sonny.frenzel@gmail.com`
and `@googlemail.com`). The denominator in the interim result counts them.

### Two judgements still missing

1. **The "two minutes".** The subject says `two-minute first run`, the mail text
   now says "a couple of minutes". I derived the number from the flow,
   not timed it. Either align the subject — or measure an example run once
   and write the real number in both places. The latter
   fits the rest of the page.
2. **"Version 3.0" as a commitment.** Appears in four places and promises 36 people
   that there will be a 3.0 and that their tick influences it. Redeemable — the four
   candidates are evidenced and costable — but it is a promise. If too
   early: reword to "the next major version", one line.

### What was re-measured on 31.08.

| Check | Result |
|---|---|
| Dry run against the production database | **36 real recipients**; 110 CI accounts and 1 suppression filtered |
| Fourth test mail via the real workflow | `75c1f6a8-122d-43c2-a43a-ef4adcfd0718` |
| Landing page in a real browser against production | single choice, multiple choice, progress, overview — all POSTs 200, no console errors |
| Invalid token | page says "no longer valid", API answers 400 |
| Links under the workflow environment | `https://clean-core.io/survey/…` |

**36, not 30.** The number in the older sections dates from 19.08.

**No test send touched anything:** no campaign document, no
`email_sends` entry. Wednesday starts at zero.

### The three corrections, and what they say about checking

**Test mails 1–3 contained links to `localhost:3000`.** Without
`NEXT_PUBLIC_APP_URL`, `APP_BASE_URL` falls back to localhost; the deploy sets the variable for the
application, a workflow step does not inherit it. Fixed three ways: the workflow sets
it, **the script refuses to send without `https://`**, two guards hold both.

Nothing was wrong with the code. The error lived between a module's default value
and a workflow's environment — no unit test looks there.

**And I could have found it myself.** I tested the page thoroughly against
production — real browser, clicks, network capture — but each time
with a token I had generated, in a URL I had built. The chain
mail → link → page I never checked in one piece, although that is exactly the
user's path. A human found it on the first real tap.

**The second correction came from the same source:** the page reported completion before
it asked anything, and nobody saw what they had answered overall. Both are
design errors that no green test would ever have reported.

**Open and deliberately not built:** the open rate via Resend. The webhook
does not record `email.opened`, because scanners inflate the number. The survey
answers the question better — an answer proves that a human read it,
and "fetched the link, never answered" is the counter-proof. If you still want the raw
number: one more event type in the webhook route.

---

## The weekly report of 28.08. was never sent

**What happened** (read in the logs, not assumed):

| Run | scheduled | GitHub started | Berlin time | Decision |
|---|---|---|---|---|
| `33178078590` | 10:00 UTC | **14:01 UTC** | 16:01 CEST | "not 12:00 … skipping" |
| `33182942533` | 11:00 UTC | **14:59 UTC** | 16:59 CEST | "not 12:00 … skipping" |

GitHub started the cron **four hours late**. The clock guard, which is supposed to
decide which of the two DST slots is the right one, asked "is it
12 o'clock in Berlin now?" — and thereby accidentally also answered "did GitHub
start on time?". Both runs discarded themselves, **both reported
`success`**, and nothing raised an alarm.

On 21.08. it only worked because the delay was eight minutes. GitHub
states in its own documentation that scheduled runs are **not** guaranteed to
start on time; the check therefore relied from the start on something that is
explicitly not promised.

**Fixed on 31.08.:** the decision now hangs on `github.event.schedule` —
the triggering cron expression, which does not shift — and the season on the
UTC offset, which is just as stable. The job thereby picks the right slot no matter how
late GitHub is, and the report goes out late instead of not at all. The
28.08. report was caught up manually on 31.08.
(`sent 5e9c4b88-306a-4827-9d93-64a6b25c2310`).

**Still open — and this is the catch:** scheduled workflows on GitHub
**always run from the default branch**. As long as the fix is only on `dev`, the same thing happens again on
Friday. It has to go to `main`.

**What the fix does not cover:** under load GitHub can also drop scheduled runs
entirely. Then there is no run that could report. A guard for that
would need state outside Actions — say a "last sent" field in
Firestore that turns the admin console red when it is older than eight days. Small,
but a separate item.

**Urgency:** high, until the fix is on `main`.

---

## ~~`clean-core-test`~~ — cleared away on 31.08.2026

**What is** (measured on 31.08.2026):

| | |
|---|---|
| Serving revision | `clean-core-test-00045-z6h`, created **26.07.2026** |
| `origin/release` last commit | **09.06.2026** |
| Environment variables set | `NEXT_PUBLIC_FIRESTORE_DB_ID`, `NEXT_PUBLIC_APP_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `NODE_OPTIONS` |
| Missing | `AUDIT_SIGNING_KEY`, `S4_ENCRYPTION_KEY`, `S4_HOST_ALLOWLIST`, `MFA_BACKUP_CODE_PEPPER`, `PILOT_APPROVAL_SECRET`, `RESEND_WEBHOOK_SECRET` |
| Reachable | yes, `/` answers with 200 |

It came to light while re-checking V9: the service has no signing key
and would thus have been exactly the case the finding describes. **It is not** —
the build is so old that it has none of the signing routes.
`/api/runs/create`, `/api/audit-pack/create`, `/api/export/verify` and
`/api/health` all answer with 404. Measured: a signature forged with the old constant
is rejected on production with `valid: false`.

**What still bothers about it:** a publicly reachable copy of the application from
June, with `GEMINI_API_KEY` set and the access rules of that time. The same
kind of attack surface as the two legacy leftovers in us-west1 and europe-west3 further
down — only this one has a current name and therefore looks maintained.

**Decided and done on 31.08.:** the service is deleted, along with 45
revisions. Checked before deleting: no domain mapping (only `clean-core.io` →
`clean-core` exists), and the only traffic in thirty days was the
check requests from this session.

On top of that, a push to `release` would have rebuilt the service immediately — with
`NEXT_PUBLIC_APP_URL=https://test.clean-core.io` (no A record) and the
us-west1 database with the `freeTierLimited` cap that caused the outage on 19.08.
Three known broken things, restored by one push.
`.github/workflows/deploy.yml` now stops on this branch with an explanation
instead of silently deploying it.

**If the test environment is to come back:** create a europe-west1 database, restore the
domain mapping for `test.clean-core.io`, and enter the service name in the
`release)` block of the pipeline again. One block, documented in
place.

---

## The 677 parked lint warnings

**What is:** With v2.7.1 `npm run lint` checks TypeScript and React hooks for the first time.
Errors are at zero. What remains are two hygiene classes and two smaller ones, all
parked as warnings and pinned with `eslint . --max-warnings 677`:

```
@typescript-eslint/no-explicit-any     365
@typescript-eslint/no-unused-vars      274
react-hooks/set-state-in-effect         26
react-hooks/exhaustive-deps             12
```

**What to do:** `no-unused-vars` is the cheapest start — dead imports and
variables, each removal checkable on its own. `set-state-in-effect` is the
most interesting in substance: 26 places where an effect sets state and
thereby triggers a second render; some of them can be derived during rendering
instead of being set in the effect.

**Why not right away:** the same reasoning as for switching it on in the first place. 639
replacements in one release commit are not a change anyone reads.

**Important:** The number in `package.json` has to be lowered along with them. It is the only
reason the backlog cannot grow again.

**Urgency:** medium.

---

**Status 28.08.2026 — v2.7.0.** The day ran in two strands: in the morning the
five releases from the implementation plan (v2.5.4 to v2.6.2), in the afternoon the
interface. In between, a benchmark in which three models got the same 22
screenshots as I did — and two of them found a calculation error that I had
caused that same morning.

---

## Four inks, one product

**What is:** Since v2.7.0 the section and stage headers pull in the same direction —
all `gray-950`, enforced by `SectionHeader`, `StageHeader` and two guards
that compare the rendered style. The body text below them does not. Measured:

```
text-gray-900    239 Verwendungen
text-slate-900   102
[#0b1c30]         97
text-gray-950     81
```

519 occurrences, four inks, no recognisable system behind them — the same kind of
drift that was fixed for the headings, just one level deeper and
ten times as wide.

**What to do:** choose one ink (`gray-950` for headings is settled;
for body text the question is `gray-900` versus `slate-900`), replace the other three,
and extend the guard check from `landing-style-guard.spec.ts` with an
ink allowlist.

**Why not today:** 519 replacements are a pass of their own with their own need for
visual review. Done on the side means: something shifted unnoticed.

**Urgency:** medium. It does not look wrong today — it is just not
decided.

---

## Open proposals from the second model round

Built were: showroom moved up, one primary button in the hero, the 21/17/4 bar,
the Verification Rail. The scan bar was built and removed again after visual
review. What remains from the round:

- **Group the tool matrix** (Grok, GPT): a hairline after row 3 separates
  Scan/HUD/Mapping from Refactor/Sandbox/Blueprint. No new group titles.
- **Feature grid in two groups** (Grok, GLM): the same six cards,
  architecture versus governance.
- **Do not stack two-column views on the phone** (GPT, GLM): Transformation
  becomes a segmented control `ABAP | TypeScript`. The comparison is the
  whole point of the page, and stacked it is gone.
- **Analyze: do not make heroes of zeros** (Grok, GLM): if all three
  coverage values are 0, no dark hero card but a mono line — and the
  evidence table directly below the three top cards.

Raw data: `docs/archiv/reviews-2026-08/2026-08-28-ux-round2-*.md`.

---

## The test run and its two known wobblers

Both are measured, neither is code:

- **`full-pipeline.spec.ts`** occasionally hangs on the Gemini-backed
  suite generation — once the model returned broken JSON. Green in isolation.
- **`unsubscribe.spec.ts`** is the only test that visits `/unsubscribe`. The
  dev server compiles the route on first request; at the end of a
  six-minute run that is enough to hit the 30-second limit. Provable in the log as
  "Compiling /unsubscribe".
- **The dev server's memory guard** — added on 31.08. and probably the
  actual cause behind the previous item. After about forty compiled
  routes Next writes `⚠ Server is approaching the used memory threshold,
  restarting...` and restarts itself. If it hits a navigation in progress,
  `page.goto` waits for a response that nobody sends any more — in three consecutive
  runs it hit `/whitepaper`, with ~9,900 modules the largest
  compilation on the site. **Local only:** CI serves a
  finished build with `npm start`, nothing compiles there and the guard never fires.
  The tell-tale sign in the log is the restart line immediately before the timeout.

If one of them is red, **first check whether it really is that one** — today I
twice dismissed a real regression as a flake, and both times it was my
own change.

---


### ~~V9~~ — done on 31.08.2026 (v2.7.2)

The published fallback key sat in three production routes of a
**public** repo, and the guard in front of it required `NODE_ENV === 'production'`
*and* a switched-off emulator flag. Everything else signed with a
constant anyone can look up — and `/api/export/verify` verified against
the same one.

Option A was chosen: no fallback, in any environment. `lib/audit-signing-key.ts`
is the only place that reads the key, `tests/signing-key-guard.spec.ts` holds it.

**The assumption in this note was wrong, and that is the lesson:** it said here that CI
needed its own GitHub secret. It did not — the test key signs
test data against a test server and protects nothing. `playwright.config.ts` had long
used exactly this pattern for two other secrets. Five releases blocked on
a decision that was not one.

**Not rotated, deliberately:** a change of the production key invalidates every
run signature already issued and every audit pack already delivered. `/api/health`
confirms the real key on production and dev.

### The unchecked findings

`docs/archiv/reviews-2026-08/2026-08-27-GLM-TRIAGE.md` lists 24 by name, GPT's
raw files contain more. **They are hypotheses, not findings** — of 57 GLM claims
five were simply wrong, and two more were right about the defect and wrong about the
mechanism.

Cheapest first: the engine findings each need one ABAP snippet and are decided in
seconds. After that the class that all three models found independently
— invented figures in artefacts that end up with the customer. If even
half of them hold, the list in `tests/no-fabricated-figures.spec.ts` is clearly too
short.

### ~~The eslint gate~~ — done on 31.08.2026 (v2.7.1)

`eslint.config.mjs` imported `@typescript-eslint` and `eslint-plugin-react-hooks`
and activated **neither of them**. Now both. 706 problems came to light,
errors are at zero, 677 warnings are pinned with `--max-warnings` —
see "The 677 parked lint warnings" above.

A correction to the note of 28.08.: the two rules-of-hooks violations are in
`clean-core-video/`, a standalone Remotion project that ships nothing.
They were never in the application. What actually went through the green gate was
something else and worse — a button without effect, a ref written during rendering,
a metric that depended on render time.

### What there was to learn methodically from the reviews

The three reviews overlap **by about a third**. The two most severe defects
of the product were each found by exactly one model:

- **Only GPT:** MFA could be taken over with a stolen ID token; the audit pack signed
  runs without checking them and preferred the client-writable project worklist.
- **Only GLM:** the faked sandbox tester; the flattened provenance of
  catalog mappings; the blind eslint gate.

**A second model is not a control but a different searchlight.**
GLM shines broadly, GPT deeply. For the next round: both, and triage them separately.

### Benefit card

Proposal 3 from `2026-08-26-BENEFIT-NEXT-STEPS.md` is done — the object roll call
is on the card and shows SAP's own successors. **Proposal 2 is open:** replace the
invented credit-limit story with the real, frozen business pyramid from
the reference run. The handwritten sentence is now marked as such
and links the file for checking, but it is not generated.

### Small items with notice

- ~~**Page overflow:**~~ **done on 31.08.2026.** The `whitespace-nowrap` label
  was one of three causes. The guard that was meant to check it found the other
  two: the sign-in button's loading placeholder (fixed 176px) and the CTA label
  "Get Free Access or Login" did not fit next to the wordmark at 320px.
  Both are now narrower below `sm`; from `sm` up nothing changes.
- **Tenant mails:** the three remaining mails still use the `<div>` padding with
  a media query. Mail clients strip the `<style>` block; the two
  registration mails have therefore already been rebuilt on fluid tables.
- **Review tooling:** the bundler and consult scripts live only in the session scratchpad.
  Commit them as `scripts/ai-review.mjs` if this becomes a habit. Two notes:
  GLM 5.3 is a reasoning model and needs `reasoning: { effort: 'low' }` plus
  real `max_tokens` headroom, otherwise empty content comes back. For visual questions
  take a vision model and send screenshots along — but the models only see
  what you send them.

### Operations note

The Firestore emulator accumulates state over many suite runs until
`/api/test/seed` takes ~29 seconds and blows the 30s budget in `beforeAll`.
Two runs failed today because of it. **Restart the emulator, no suspicion of
regression.** And locally always `--workers=1` — CI does it that way too.

---

**Status 20.08.2026, the most important first:**

| Item | Who | Urgency |
|---|---|---|
| Publish the LinkedIn post (drafts are ready) | Felix | high — the page is live, the occasion expires |
| Clean up Artifact Registry, 143 GB | Felix (GCP console) | high — cost driver |
| Delete outdated Cloud Run services | Felix (GCP console) | medium |
| Prepare the satisfaction survey, due 02.09. | together | medium — the date is set |
| Hook the PDF drift check into the pipeline | decision Felix | low |

---

## `dev.` and `test.clean-core.io` do not resolve

**What is:** Neither hostname has an A record. Against 8.8.8.8 both return
NODATA — the name exists in the zone but points to nothing.
`clean-core.io` itself is unremarkable. The two environments are reachable only
via their Cloud Run addresses:

```
https://clean-core-dev-qcevuoi3uq-ew.a.run.app
https://clean-core-test-qcevuoi3uq-ew.a.run.app
```

**Why it was noticed:** while checking whether v2.5.1 really runs on dev (it does,
via the run.app address). That probably also explains why a changed
benefit card was not visible "on dev" this morning.

**What to do:** either restore the domain mappings in Cloud Run
and set the CNAMEs at Strato — or correct the table in `CLAUDE.md` and
`docs/ARCHITECTURE.md` to the run.app addresses, so that it does not
keep naming URLs that do not exist.

**Urgency:** low for operations, medium for the documentation — an
instruction that points to a dead address costs a quarter of an hour every time.

---

## Delivery status of the thirty community accounts

**Why:** The assumption of the day — that the low usage is explained by
the approval and welcome mails having been filtered — is plausible but
unproven. The webhook from v2.5.1 on answers it for **future** registrations.
For the thirty from the community activation there are no events and there will be
none; they predate the rebuild.

**What is possible anyway:**

1. In the Resend dashboard the sends from the activation can still be viewed
   individually. Grouping the recipient domains (`@knauf.com` and the like versus
   freemailers) gives a first indication of whether it is a corporate-filter pattern.
2. Our own case of 27.08. is the only one with a known outcome: own
   domain, correct SPF/DKIM/DMARC, delivery with delay **into the
   junk folder**. That is reputation building of a young domain, not a bug in
   the application — and it hits every corporate address equally.
3. The satisfaction survey on 02.09. is the first occasion to reach these people via
   a second channel. If it goes via LinkedIn instead of
   e-mail, the response rate is at the same time the measurement.

**What this means for the survey:** the question "did you get the welcome
mail?" belongs in it. It costs one line and answers the most expensive
open question about the platform.

**Urgency:** high, because whether the product has a usage or a delivery problem
hinges on this assumption. Those are completely different construction sites.

---

## Arm the Resend webhook

**Why:** The code is in place, the route is deployed, but it answers every request
with 503 as long as no signing key is set. That is intentional — an endpoint
that writes to Firestore on demand would be worse than none at all — but it also
means: until this is done, we know as little about delivered mails as
yesterday.

**Two steps, both only doable by you:**

1. In the Resend dashboard under *Webhooks* create an endpoint:
   `https://clean-core.io/api/webhooks/resend`. Events: `email.delivered`,
   `email.bounced`, `email.complained`, `email.delivery_delayed` (`opened`/`clicked`
   optional — they create noise from scanners that click links in advance).
2. Store the `whsec_…` signing secret shown there as the GitHub secret
   `RESEND_WEBHOOK_SECRET`. The pipeline already passes it through.

**Check that it works:** Resend has a test send in the webhook dialog. Afterwards
there should be no `signature rejected` in the Cloud Run logs — and a bounce
shows up as a red hint on the user's row in the admin console.

**What is still missing afterwards:** the thirty accounts from the community activation predate
this rebuild. For them there are no events and there will be none — what
happened to their welcome mails remains unknown. If the assumption is
right that many of them were filtered, the satisfaction survey on 02.09. is
the first occasion on which we could catch up on that via a second channel.

**Urgency:** high. It is the only open item where every day of waiting costs
data that cannot be recovered.

---

## LinkedIn post on the Clean Core guide

**Why:** The page `/clean-core-explained` is live, the community mail has gone out to
30 recipients, the share area at the top of the page is built. The post is
the last piece of the activation chain and the only one still outstanding.

**Where:** Three finished versions plus notes on timing and hashtags in
[docs/archiv/kommunikation/LINKEDIN-CLEAN-CORE-EXPLAINED.md](./archiv/kommunikation/LINKEDIN-CLEAN-CORE-EXPLAINED.md).
The recommendation is version A; version B suits a second attempt about
a week later.

**Best time window** for a German/European SAP audience: Tuesday to
Thursday, 07:30–09:00 CET. Answer every comment in the first two hours
— at this reach that is the entire distribution mechanism.

---

## Clear away old Cloud Run services and buckets

> The complete inventory with ready-made commands was in
> `docs/SCREENING-GCP-ALTLASTEN.md` until 24.09.2026 and has been taken out of the public repository
> (decision Sonny): a list of outdated resources together with delete commands helps
> third parties with reconnaissance. It is held by the operator.
> Largest item there: 676 container images in europe-west1, accumulated from
> 252 Cloud Run revisions that were never cleaned up.

**Why:** From the prototype phase two outdated deployments are still running,
both publicly reachable (HTTP 200) and both with old code — they still serve
HTML instead of JSON on `/api/health`, so they date from before the health route.

| Resource | Region | Status |
|---|---|---|
| Cloud Run `cleancore-io` | **us-west1** | live, old build |
| Cloud Run `clean-core` | **europe-west3** | live, old build |
| Bucket `ai-studio-bucket-819734065839-us-west1` | us-west1 | legacy stock |
| Bucket `run-sources-cleancore-491216-us-west1` | us-west1 | build sources |
| Bucket `run-sources-cleancore-491216-europe-west3` | europe-west3 | build sources |

The us-west1 service is the unpleasant one: a publicly retrievable copy of the application
in Oregon, problematic for the same reason the database was. Neither of the two
hangs off `clean-core.io` — the domain points to europe-west1 — but they are reachable.

**Check before deleting:** whether one of the URLs is linked anywhere or has ended up in a bookmark,
and whether `clean-core` in europe-west3 was perhaps intended as a failover after all.

**Urgency:** medium. No acute damage, but attack surface and a contradiction
of the EU promise.

---

## Migrate the dev and test databases to europe-west1

**Why:** Production moved to `clean-core-eu` (europe-west1) on 2026-08-20.
`release` → `ai-studio-39b46c45…` and `dev` → `ai-studio-030e1ee1…` are still in
**us-west1** and carry the same `freeTierLimited` cap that caused the outage on 19.08.

**Effort:** small, the path is proven — `docs/archiv/betrieb/PLAN-FIRESTORE-MIGRATION.md` plus the
scripts under `scripts/firestore-*`. Do not forget the Enterprise edition when creating it,
otherwise the import fails on the 1500-byte index limit.

**Urgency:** low. It is test data, and an outage there hits nobody.

---

## Delete the remaining CI test accounts

**Why:** The run of 19.08. got through about 15 of 125 accounts, then the daily limit
was reached. ~110 accounts from pipeline runs are still in `users`.

**With what:** `npx tsx scripts/cleanup-test-accounts.ts --apply` — idempotent, simply carries
on. Uncritical on `clean-core-eu` without a cap.

**Side finding:** Seven projects are already orphaned (their owner was deleted, the
projects were not, because the cascade broke off midway). The migration carried them over
faithfully. Take care of them during the clean-up.

**Urgency:** low, but it keeps growing with every pipeline run.

---

## Lower the read count in the admin panel

**Why:** `components/admin/UsageQuotaPanel.tsx` keeps an `onSnapshot` open over the
**entire** `users` collection. As long as the tab is open, every change to
any user document triggers reads over all documents again.

On top of that, `hooks/useUserProfile.ts` fires **both** paths on every mount — first `getDoc`, then
additionally `onSnapshot` on the same document. That was a safeguard against hanging
streams on CI runners, but doubles the reads on practically every page.

**Urgency:** much lower after the migration — `clean-core-eu` no longer has a
daily cap. It remains unnecessary consumption nonetheless.

---

## Satisfaction survey

**Why:** Announced in the community mail of 19.08. for "in fourteen days", so
**due on 2026-09-02**. The mail already names the core question: whoever has not started anything
yet — what kept them from it.

**Context:** At the time of sending, 20 of 30 accounts had never created a project.
Whether the starter examples changed anything about that can be read in the admin tab from the
"Objects" column.

**Urgency:** scheduled.

---

## Hook the PDF drift check into the pipeline

**Why:** `public/clean-core-explained.pdf` is a checked-in build artefact.
It is deliberately not generated per request — a headless Chromium in the Cloud Run image
costs hundreds of megabytes for a document that changes perhaps monthly.
The price for that is the possibility of silent drift: someone changes a chapter, the
website is current, and the PDF that people pass on keeps saying the old thing.

The check step already exists and needs neither browser nor server:

```bash
npm run build:guide-pdf -- --check
```

It hashes `lib/clean-core-guide.ts`, `lib/clean-core-capabilities.ts` and
`app/clean-core-explained-print/page.tsx` against `public/clean-core-explained.pdf.sha256`
and ends with exit code 1 if they diverge.

**What to do:** a step in the `validate` job of `.github/workflows/deploy.yml`,
between lint and build.

**Deliberately left open:** the step will then block every deploy in which content was
changed but the PDF was not regenerated. That is the purpose — but it is a
decision that should be made instead of being built in on the side.

**Urgency:** low, as long as content changes to the guide are rare.

---

## ~~Page count in the share area is not kept in step~~

**Done on 20.08.2026** — the page count is no longer in the tile. It
came from the same revision in which the mail sending was removed.
