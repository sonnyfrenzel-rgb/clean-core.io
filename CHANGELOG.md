# Changelog

All notable changes to the Clean-Core.io platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).






## [v2.20.0] — 2026-09-28

The process gets more accurate: measured against a new benchmark of 300 constructed,
blind-written and cross-checked ABAP cases (`docs/prozess-benchmark/BERICHT.md`),
the reconstructed process skeleton hits 81.1 % instead of 61.3 % of the target nodes, on the
hidden test half 82.1 %; on the hard, object-oriented third wave 72.3 %
instead of 39.5 %. The business statements say almost nothing wrong any more, and a Model proposal with
evidence and contradiction marking is ready for the workspace preview (17.10).
On top of that, the start of Block D — the whole app of a piece along `DESIGN.md`, before 3.0 —,
step A from the security audit of v2.19.0 and the findings of the full review.

### What everyone notices

- **The process from object-oriented code and from module pools is complete.**
  A method call used not to be a step: if a report called `go_x->run( )` on a
  class in the same source, the whole method body was missing from the process. Now it opens
  a subprocess like a `PERFORM`, and a call to a foreign method stands there as a
  call. Dynpro modules and function modules are entry points, even if the source
  additionally writes an event such as `LOAD-OF-PROGRAM`. A FORM called via `PERFORM`
  no longer additionally appears as a start of its own, and a popup
  (`MESSAGE … TYPE 'I'`) is a step the user confirms. Measured against a
  new benchmark of 200 constructed ABAP cases (`tests/prozess-benchmark/`):
  node hits across pasted programs with includes from 61.3 % to 69.4 %, on the
  test half that stayed hidden during development, from 61.9 % to 69.1 %.
- **Every level of the process has a visible start, and an early end is
  recognisable as such (ADR-054).** If you expand a subprocess, it begins at
  a start event on its `FORM` or `METHOD` line. A `RETURN`, an `EXIT`
  outside a loop or a `STOP` in the middle of a routine ends on an end event
  of its own, labelled "End (early)" and with the condition verbatim on the edge —
  instead of running silently into the shared end. A `CHECK` stays a conditional flow.
  Events count nowhere as a step. Measured on the process benchmark: node hits
  from 69.4 % to 78.7 %, on the hidden test half from 69.1 % to 78.8 %.
- **What the runtime calls also begins in the process.** A `RAISE EVENT` is no longer an
  error end that cut off the flow, but calls the handler bound via `SET HANDLER`
  — but only if the registration was passed through beforehand and is
  nowhere deregistered. After `LEAVE TO SCREEN` the flow no longer continues.
  Callbacks (`ON END OF TASK`), ALV event handlers, BAdI methods (`intf~meth`) and
  redefinitions of a superclass that is not in the upload are entry points instead of "not
  reached" — with the note that their trigger is not in the code. Final result on the
  benchmark: 81.1 % (test half 82.1 %); on the hard third wave 72.3 %.
- **The business statements of the Business view no longer say anything the code does not carry.**
  Five independent reviews over 2,273 target statements found the same errors: `CHECK` read
  everywhere "kleinere werden übersprungen, die Schleife läuft weiter", every `sy-subrc`
  became "Ohne Treffer", `GET PARAMETER ID` a logical database, every
  transaction an "Anlage", `MESSAGE … INTO` an output, and routines in the
  same source were called "im gelieferten Code nicht belegt". Now the statement follows the
  statement in the code: `CHECK` names the consequence of its location, after `sy-subrc` stands what the setting
  statement means ("Ist die Sperre nicht zu erhalten, …"), a called routine says
  what it does. On top of that, one statement instead of five identical ones, correct articles before field names and
  German terms for the SAP standard tables and fields. In the reference corpus
  no statement violates any of the 166 forbidden assertions any more (four before).
- **Business statements in plain language from the model, the statement from the code as evidence below
  (17.10, with the workspace preview).** A button in the Documentation lets the
  model propose a business statement per step and says beforehand what that costs: one
  model call, not on the analysis runs, but on the hourly limit. The proposal
  stands on top with *Model proposal*, the engine's statement below with *Reconstructed* —
  it never drops away. If the proposal says something the statements at its lines
  do not carry — a "displayed" message that `MESSAGE … INTO` only writes into variables,
  a "program end" before an `END-OF-SELECTION` —, it carries *Contradicts
  the evidence* or *Not supported by the code*, with the reason on request. The
  proposal lies outside every signature; without it the page stays as it was.
  The basis is a blind assessment of 2,273 target statements by five judges: the
  model hits the business meaning in 86.5 % of cases, the engine in 10.3 %, but the
  model invents more often (39 against 11 false assertions).
- **The seven stages have a header.** Every stage carries its name from the same
  list as the stepper, in 22 px / 800, with a neutral icon instead of a green bubble and
  "Back to workspace" above — the link leads back into the view and layer from which
  the stage was opened. The Documentation stage is called "Documentation" everywhere.
- **The Analyze stage is rebuilt (D.10a).** Colours from tokens instead of a palette of its own, one type scale, four button styles, no emojis and no AI symbolism; green only where something is evidenced. The title is now "Analyze", as in the stepper. An invented route rationale ("AI analyzed legacy database joins…") now honestly reads "No rationale was recorded for this route."
- **Stepper, notices and error pages speak one language.** Outdated states are
  a warning instead of pink, error pages and empty states use the same building blocks,
  the stage labels are no longer 9 px small.
- **Focus visible everywhere.** Every operable element shows the same
  focus ring when tabbing, also outside the new workspace; anyone who has set reduced
  motion no longer sees CSS animations.
- **Date and number look the same everywhere** — "15 Sep 2026", times with their zone,
  independent of the browser's language setting.
- **Blocked accounts no longer read anything via the API either.** The project routes check
  the account status like the Firestore rules.
- **The consent before the analysis can no longer be skipped via the address.**
  Only a saved example project is exempt from this.
- **A deletion stays a deletion.** Registration, MFA reconciliation and
  model settings no longer recreate a deleted profile; an invitation
  is not created under a deleted project.

### Security (audit of v2.19.0, step A)

- Document IDs from a request are checked in one place before they form a
  database path — in around twenty routes, held by a guard
  (SEC-2026-514).
- The S/4 routes no longer pass any response text of a token or metadata endpoint
  to the caller (SEC-2026-525); three routes answer with fixed wording instead of
  internal error texts (SEC-2026-481, -492, -497).
- The audit itself: 81 verified findings, 55 scheduled, 26 refuted — the first
  run with the batch check.

### Behind the scenes

- **Design guard with ratchet (D.1):** 19 rules from `DESIGN.md` across all
  UI files; per file and rule the count may only fall, new files have no
  exception. The stage frame is already at zero.
- **The building-block library is complete (D.5a–d):** dialog and message popover with
  a shared modal behaviour, checkbox, radio group, select, textarea, switch,
  skeleton, busy state on the button, expand, tabs, "Show all N" in tables,
  date display, the severity of a finding as the fifth fixed list and chart colours
  from tokens.
- **Foundations (D.3):** text roles `cc-text-*`, `lib/format.ts`, one print rule for
  the whole page.
- **`DESIGN.md` 1.5 (D.4):** the decisions of 24.09. as ADR-047 to ADR-053 —
  12 px for meta/chip, 2 px only in chips, stage header 22/800, severity as a fixed list,
  tokens in public too, dashboard and stage demo are rebuilt, the German
  Datenschutzerklärung as the legal-text exception.
- An overload at Gemini and a foreign time zone name no longer break tests;
  `CcButton` keeps a passed `aria-busy`.

## [v2.19.0] — 2026-09-24

The isolated test runner (8.9) is built and running, the mails arrive at Microsoft,
and the full review of v2.18.0 is worked through. The new start page and the workspace
for everyone stay held back for 3.0.

### What everyone notices

- **Mails land in the inbox instead of spam — at Microsoft and Gmail.** All mails to
  users have a plain layout: paragraphs, a single visible link at the end, no
  large button, no emojis, always with a text part. The address confirmation links to
  clean-core.io instead of a Firebase address. In the seed test Office 365 rose from 4 to
  7 of 8 mails in the inbox, Outlook.com from 1 to 8 of 8; Gmail stayed at 8 of 8.
  GMX and web.de keep filtering — there the sender's reputation counts, not the content.
- **An overload at Gemini no longer aborts the analysis at the first no.** If
  the model reports "high demand" (503), the server asks again up to three times, as it already did
  for a quota limit.
- **Two open tabs no longer overwrite each other's Transformation.** The server
  saves code, test suite and status in one transaction, checked against the state on
  which the generation began; a design changed in the meantime leads to an
  understandable rejection instead of silent overwriting.
- **Blocked accounts lose access immediately,** not only when their sign-in token
  expires. The Firestore rules read the account status; rolled out on 24.09.2026.
- **The route map shows the signed confidence,** never again a number from the
  model text.
- **"Not determined" no longer disappears** in the A–D display of the process map.
- **The BPMN editor saves what is on the canvas,** even if you save directly after
  a change.

### Test runner (8.9)

- Generated tests run in a Cloud Run service of their own without roles, without secrets and
  without an open network; a live run reaches the tenant only through a proxy of the app that
  inserts the credentials itself. The live path stays locked until the negative test on the
  deployed profile, the IAM check and an evidenced check of our own are in place (decision
  24.09.2026: no external audit).
- The runners' self-test runs from the admin console with one click; "incomplete"
  never looks like "passed".

### Behind the scenes

- The security agent checks its candidates de-duplicated and in batches with the code at the
  cited lines; what it could not check it names by name, and the report then
  no longer says "Risiko niedrig". Budget 5 USD per release.
- The UX agent measures against the binding target picture, the mockups 2.8.
- Tests with the Firebase client now run only against the emulator and with throwaway accounts.
- The automatic analysis via URL parameter is removed; sending to the model always checks
  the same preconditions as the button.
- A Transformation without a valid test suite is not saved.
- A `JOIN` in an SQL string no longer creates an invented table dependency.

## [v2.18.0] — 2026-09-24

Phase 8 of the roadmap, "Decide and hand over", except for the isolated test runner
(8.9). On top of that, the first parts of 3.0 behind the admin switch and the model measurements
from §17. v2.16 and v2.17 never appeared as versions of their own; their steps are
in v2.15.0 and in this one.

### What everyone notices

- **The Documentation stage reads the whole program.** Until now the model got the
  first 1,000 characters each of code, design and analysis and wrote from that a blueprint
  with roles, KPIs and durations that appear nowhere in the code. Now the
  documentation is created without a model call from the engine: process steps with line anchor,
  business statements, effect status of the update task and the lanes the code evidences. What the
  code does not say — process owner, roles, KPIs, duration — stands as "not determined"
  with a reason. In the purchase order approval example, the emergency limit from line 422 thus arrives in the
  document; with 1,000 characters it never got there. Older blueprints stay readable and
  are marked as an earlier form. The Business layer (RACI, SOP) is still written by the
  model.
- **The Transformation follows the architecture decision.** Until now it took its target from
  a toggle in the analysis that every click switched without a rationale, and did not read the
  justified approval at all. Now it generates against the architecture contract;
  a deviation from the recommendation is recorded and applied.
- **An approval is bound to the run you read.** If the analysis has changed
  since then, the server rejects and names what has changed, instead of silently hanging the
  approval onto the new state. A rejection used to look like
  success.
- **Auto-healing in the Testing stage works.** The server creates an immutable
  repair draft, the runner executes exactly this one, and it is adopted only
  if the state has not changed in the meantime. Before, the repetition ran against
  the old code.
- **A business gap that the model delivers as a single object instead of a list is no longer
  lost.** Measured, this occurred with the 1,000-line example in two of three
  runs; the gap fell silently out of the work list, and the signing route would have
  failed on it. Every other unreadable form is now stated instead of emptied.
- **The invitation page names, before acceptance, who is inviting and until when** — only to the
  signed-in account with the invited, confirmed address. The project name stays
  behind the acceptance.
- **Approval links for S/4 tenant access no longer act on opening and are valid
  exactly once.** Both links of a request expire as soon as one has been used, and
  with every new request. Links from mails before this version no longer work;
  anyone affected makes the request again.
- **The naming stage is faster.** It runs on `gemini-3.5-flash-lite` and explicitly requires
  start, end and branches by name: median 2.0 instead of 4.6 seconds,
  96 % of the load-bearing nodes named.
- Smaller corrections from the UX review: the admin tab "Not active" is named for what it
  contains; the read-only board no longer invites discussion; error pages
  show the technical message collapsed.

### The evidence chain in the audit pack

From format 4.0 (HMAC) and 4.1 (Ed25519), the signature manifest names the
handover chain — requirement, decision, receipt, delivery artefact — as `covers[]`
in the signed string, and `09-evidence-chain.json` says per link whether the signature
carries it, whether it is a self-declaration or whether it is not determined, with a reason. Today
the signature carries at most one link (the receipt, if the run has a
model receipt), a self-declaration a second one, and two are open; the pack
says so instead of showing a shorter chain. Web verifier and
`scripts/verify-pack.mjs` check it; older packs verify as before.

### Behind the admin switch (preparation for 3.0)

The new workspace gets the IT view (findings with both catalog views and the
honest chain requirement → anchor → finding → target draft), the decision card
(need, option, cost revision, contract; confirmation as a self-declaration, withdrawal with
a trace), the steering one-pager for printing, a Management overview with charts in
which "not determined" is an area of its own, and the evidence that every reference case
of the preservation register holds there. Existing projects open in every saved
form without anything being written; an unreadable run is now called that, instead of
counting green as present.

### Measurements (§17)

Three passes per model on all eight start examples: the same model fluctuates
between passes on average by 33 percentage points of anchor rate — more than any
model difference. The product default stays. Business statements from the model (path B) hit 7
to 9 of 173 target statements against 69 for the engine; the engine stays alone.

## [v2.15.0] — 2026-09-23

### Our own address was in a public log — and in the source code

The repository is public, and so is every Actions log. The weekly report
printed on every scheduled run the subject line ("9 von 43 Accounts aktiv"), the
weekly numbers on registrations, activations, runs and projects and the address
of the administrator directly there — demonstrably in run 35333168862 and eleven more since
20.08. The security warning was worse: it printed the recipient **and the
whole warning text**, i.e. the failed jobs of a security run.

It is the same class for which the survey scripts were switched off on 15.09. The fix
back then gave `send-survey-digest.ts` its bolt; the other two were overlooked,
**because nothing compared the senders**. The rule therefore now lives in
`tests/public-log-guard.spec.ts` over all four senders instead of in the scripts — the same
pattern as `SectionHeader` and `StageHeader`. Twelve published runs deleted, 404
re-checked.

On top of that, the address left the source code: four files held it as a string, now
`scripts/lib/report-recipient.ts` reads it from `REPORT_RECIPIENT`, without a fallback. **What
this does not fix and belongs here:** the same address is the author address of all 1,318
commits, and the GitHub API gives it out publicly. The source code is the only
copy that could be removed.

### The security audit was pinned to the cheapest endpoint, and it was broken

The morning's run failed with two empty CISO answers and **51 of 60 failed
consultant calls** — and the 51 were not in the log with a single word, only as a number.

Measured instead of guessed: the model is alive, 26 endpoints, all with plenty of output budget.
A single one is defective — **OpenInference, 0 of 7 calls with content**, independent of the
input size; the same request runs without error on Fireworks and CoreWeave. It is the
cheapest of the 26, OpenRouter sorts by price, and `allow_fallbacks: false` nailed the
audit to it. Now a named provider list; the data commitment stays at
`data_collection: deny` in both branches.

Two defects fixed independently of that: failures leave their reason behind — a word from a
closed vocabulary, never an error text, because the repo is public —, and an audit
aborts **before** the expensive CISO calls if less than 85 % of the planned code was
read. Before, a sealed report over 15 % of the code would have appeared and looked like
a complete audit.

**Left open, and the first live run showed it:** the basis for re-checking
breaks away on a different axis. The audit for this release ran through cleanly, but for
none of the 203 consultant findings did the cited code come along — the *input* limit of the
CISO prompt was reached. Result: "Risiko niedrig, 0 Befunde", and the CISO itself writes
that this is not a statement about security, but the lowest value of the
scale for an empty list.

### The weekly report ran with the deploy's rights

`usage-report.yml` and `deploy.yml` shared the project's default compute account.
The report needs one thing of it: read Firestore and write a snapshot. It now has
an account of its own with `roles/datastore.user` and nothing more.

### The Business view gets statements that fall out of the code (17.5, 17.7)

The corpus facet `fachsaetze` stood at 0 of 173 and read like a finding. It was
none: **the facet compared nothing.** It checked the anchor and did not hold the content
next to it at all — a statement, correctly anchored and completely wrong, got through. And
no module produced a business statement anyway.

Now it measures: the key is the ABAP statement at the anchor line, the text measure can be
recomputed by hand, and the threshold 0.50 is **recalibrated on the corpus on every run**
— different target statements reach at most 0.400, the mildest rewording does
not fall below 0.571.

On that basis, `lib/abap/business-statement.ts` produces the statements deterministically from the code,
without a model and without a network: **69 of 173 hit, coverage 167 of 173.** Vagueness is
resolved *and* flagged, in that order — "not determined" may never take the
place of a statement, and a throw during construction prevents an empty core statement.

The ceiling is measured too: **116.** No producer that invents nothing can hit more;
the missing target statements are judgement prose of the case book. Acceptance is therefore set at
90, the rest is carried by the model.

An error in it, found by the QA review: in the detection, a **real
backspace character (0x08)** stood in the place of the word boundary. ABAP contains no control characters,
so the rule never hit — the producer never distinguished whether an `UPDATE` hits a
specific row or the whole table.

### No cost winner as long as an option is incomplete (7.4, 7.11, 7.12)

Options with costs only from an assumption revision. Four reasons not to name a winner,
and the most instructive is the fourth: **overlapping ranges name no one** — if the
upper bound of the cheapest does not lie below the lower bound of the next, the difference is
within the effort range and thus not established. "Do nothing" is a mandatory option;
its upgrade backlog is named, not priced.

On top of that, two decisions: the page had eight hard euro signs and not a single
input field for the currency, while the panel below asked for it — now one currency
for the whole page, no number without a currency. And the set sensitivity radius of
±25 % is **gone without replacement**: the panel computes the tipping point, i.e. how far an assumption
has to move until the lead changes.

### The workspace (6.1, 6.3, 6.4, 6.10)

The three views in motion on "New project", derived from the example code instead of
copywritten. For Management the mockup sketches *"Rebuild — part of decision DEC-1"* — **that
is not there**, there is no DEC-1, and an object without a catalog entry falls under *not
assigned*. On the page that promises "never passes an assumption off as a fact", that would
be the most expensive invention; the absence now stands there.

Overlays on the process model: a join on the anchor alone hit **8 of 102**
object locations — the median anchor is one line, i.e. the line that *calls* a step,
not the code behind it. With the body of every `FORM` that a `PERFORM` in the anchor
names, it is 23 on 17 elements; the rest were looked up instead of rounded away.

The Management view answers four questions, but draws **no line through one
point** ("a history needs two runs measured by the same rule"), and "confirmed" means
`proven`, never `done`. Most recently it read in the wrong order — public cloud fit,
member list, only then the verdict; fixed, and in the process it turned out that **no
structure guard had ever pinned the order down**.

### A target profile that cannot be signed if it was rejected (7.10)

`AssessmentProfile` with three coverage states and nine gap codes;
`profileManifestInput()` throws on `rejected` — a rejection that can be signed
anyway is none. While building, an error came up that is in effect today: `catalog-service.ts`
knows neither `deployment` nor `edition`, and the only snapshot is the
release list of the **Public** Cloud. A Private Edition project is assessed against it
without the result saying which snapshot answered.

### Smaller changes

- The roadmap's status instrument reported "gesamt 0" (total 0) — an empty roadmap instead of a
  broken parser: it split on the bare line break, and `core.autocrlf=true` is the normal case under
  Windows.
- The QA delta review was allowed to spend 32,000 tokens and used them up, only 3,855 of them
  for thinking. The batching splits by *input*, and for this error that is the
  wrong axis; now 48,000, the number the full review has run with since 15.09.

### Two review agents judged code they had never seen

The security audit for v2.14.0 reported **"Risiko kritisch: 7 kritisch, 18 hoch"**. All
154 findings were checked against the code — **not a single critical one held.**
The consultant whose area of responsibility is `firestore.rules` never
got the file (ten of fifty-one model calls had failed) and writes that
himself in five of his findings; the frontend consultant never got `lib/sanitize-html.ts`
and rated five XSS findings with "Sanitizer nicht einsehbar". **19 of the
46 medium findings fall closed for the same reason.**

The QA full review had the same design: five critical "rotate credentials" were
three localStorage keys, one interpolated template and one public URL — each
as `RE-RAISED after refutation`, because the refutation lies in the register and the hit
arises anew in the scanner on every run. And it reported **470 files with 5.4 MB as
NOT REVIEWED**: half of the code base, and the newest half at that.

Both are repaired at the cause, not via an exception list. A file on the new
`PINNED` list rides along in *every* call of its consultant; the secret rule
decides by the value instead of by the path; and the full review runs on a model whose
price no longer decides how much of the product is read.

### The signed run ran under the wrong edition

In the analysis dialog, `setTargetDeployment(x)` and `handleAnalyze(code)` stood in the same
handler — but a state setter does not change the value that this closure has already
captured. On the **first** run the target platform was therefore `null`, on a switch the old one.
And everywhere at that: evidence run, extensibility routing, prompt and `s4Deployment` on the
**signed run** — while the screen showed the new selection. A result that
does not belong to the run that attests it. The edition is now an argument.

On top of that: a blocked account kept write access via the client SDK (`adminRevokeUser`
only marked, did not revoke tokens — the window is now one hour instead of unlimited,
it is closed with a rules change), and a revocation of read access could resurrect a
deleted project as a ghost document.

### 367 objects without a released path were called "clean-core-ready" (7.9)

`buildMerged()` never visited the classification file. What that means in the product is shown by
the test: a SCMON import with 90,000 calls to such a BAPI landed in the
quadrant `prioritize` — green, "you can postpone this". Now `no-released-api-path`
and `danger`. The catalog page also answers two questions separately instead of one
unclear one, and **183 of the 259 `deprecated` objects name no successor at all** — they
are flagged as a check, not as a finished verdict.

### The return code belongs to the step (2.15)

A `CALL FUNCTION … EXCEPTIONS` and an `IF sy-subrc <> 0` behind it were two
drawings of the same thing. 20 technical gateways are now boundary events on the step;
the share of purely technical XOR falls from **32.7 % to 14.6 %**. The target of ≤ 10 %
is thereby deliberately corrected: of the seven remaining, four set the
return code **without drawing a node** — steps are missing, not conditions.

The corpus caught a real defect in the process before it shipped: at
CC-055 the folding would have output "Fehlermeldung vorhanden?" as *Fehler der Transaktion*
— a statement the source does not contain.

### The workspace says which state it is on (6.9)

Revision display next to the title, a notice with two equivalent ways out when
the state moves, and a confirmation before the only writing action — a
revocation of read access cannot be undone. Cost: six reads per
minute per open tab, under any concurrency. The fragment anchor now also survives
the view switch when rendered.

### "Ask this case" (6.8)

In the project the assistant answers from anchored evidence about the uploaded code —
or it does not answer. Without evidence there is no `prompt` field, so nothing to send;
measured in the browser with an intercepted `/api/gemini`: no call. An answer that cites none
of the passed anchors is discarded and replaced by the evidence.

### Smaller changes

- The weekly report no longer names new accounts by name, but counts them.
- An audit pack with `"files": null` reports itself as invalid instead of throwing.
- `render()` in the circular mail escapes the first name that the browser is allowed to write.
- Two red workflows: the secret scanner's exception list quoted the name it
  excused; and an `HTTP 503` **4.5 seconds** after the start cost the whole
  UX review of a version — an immediate gateway error is now retried,
  a late one still is not.

## [v2.14.0] — 2026-09-22

### Both review agents have emptied their inbox — and the engine is a thousand times faster

**316 findings decided.** 90 open security findings and 226 high findings of the
QA full review of `b88c77b`, each checked at the cited line instead of against the report.
Result: **244 refutations with evidence**, around 65 findings had already been fixed since the reviewed
commit, around thirty real errors remain — the most urgent are built in
this version, the rest is scheduled.

What explains the number: the same location came up to **six times** under different
fingerprints; a batch of 26 findings consisted of four matters, one of
36 of thirteen. And several times the reviewer cited lines that contained neither today nor at the
reviewed commit what he claimed.

### The engine: 482 seconds to 447 milliseconds

`tokenize` rescanned the buffer on every line — quadratic. `buildAbapEvidence`
on a 378 kB source took **482 seconds**; now **447 milliseconds**. On top of that,
two stack overflows: `walk` is iterative, and the mutual recursion of the
skeleton, which tipped over between 800 and 1200 chain links, has a floor at 200 —
**with a named message** `expansion-depth-reached`. The engine says that it did not
read, instead of silently finding less.

**The equality is proven, not claimed:** the state `98f374d` in a
side tree, 92 real ABAP sources times four readings — 368 comparisons, zero
differences; `tokenize` additionally over 60,092 inputs. The only difference
at all is the new, reported floor. Not yet linear: double the source still costs
about three times as much, and that is in the test.

### An error message can no longer become a Transformation result

If the model did not answer with JSON — a refusal, a quota message, running text
—, the `catch` branch wrapped the text as a source file and saved it with
`status: 'transformed'`. No race, no special case: it happened whenever the model
once did not answer in the format. Now it is a generation error, and the
completeness gate checks the mandatory set per track — derived from the prompt itself.

### Two promises on the landing page that the code did not keep

The example advertised as "Real abapGit Package" was **non-functional**: the
SELECT aliases did not match the structure components, all eight fields stayed initial.
And the transformation animation showed "Compiled — 0 errors" from a
`setTimeout` — without a compiler, without a test, without a notice. The animation stays, but
now says visibly that it is an illustration; deliberately in slate instead of emerald,
because a green notice under a green check reads as a third check.

### Routes and interface

Thirteen places handed raw error messages to the caller. The two
outgoing metadata routes get a limit per account — they had none, and the
middleware excludes `api`. Three routes let a suspended account keep working;
the heaviest was the read access to the reader list, which skipped the limit **and** the account status.
`DELETE /projects/{id}` was an existence oracle and now answers like
the GET above it.

`/api/health` checks the Ed25519 key as well: a key that was set but unusable
was so far only logged, while signing carried on without it. The
deep probe deliberately gets **no** rate limit but a cooldown — the limiter
itself runs a Firestore transaction and would have cost exactly the read access
that it refuses.

The trust page promised hashed MFA backup codes, which have not existed since 16.09.
The project document grew without bound, because every export stored a full
HTML copy and nothing cleaned up. And the pepper of the rate limiter fell back to
a literal in the source code — in a public repository that is not a
pepper.

### The rules are rolled out

Commit `9d77219` had added a `delete` rule for `/abap_examples` without
updating the deploy record and the preservation register — that had kept the pipeline red since
21.09. Both registers are updated, and on 22.09. the rules were rolled out to all six
databases, with `npm run rules:verify` as the cross-check. The delete button
in the dashboard ran into default-deny before.

### A false alarm with a real cause

"Possible Google API key committed" appeared in the report as a critical finding on **every** push,
while `docs/QA-REVIEW-LOOP.md` next to it claimed it was suppressed.
Both were true: the suppression compares the *path* of a hit, the last
net before sending reports under `outgoing message`, and the delta review did not
filter at all. Now the *value* is compared as well. This is how a false alarm survives
two months: the prose was checked and the code was not.

### Roadmap

New is **§16**: the evaluation of an SAP process collection of 1,246 diagrams, from
which seven steps follow — 1.9 sharpened and brought forward, 2.15, 2.16 and 2.17 new,
plus additions to 2.4, 2.10, 2.14, 3.3 and 7.8. The collection is bound by licence;
nothing was taken over as content, only as insight. §16 also names
what was checked and **rejected**, and the six questions the collection cannot
answer.

**§9 No. 20 decided:** naming and provenance are separated. `sourceToken`
stays unchanged and carries the anchor, next to it an approved `businessLabel`.

### Tooling

`npm run lint` could no longer run locally — `eslint .` ran into the working copies
of parallel sessions and died of memory. CI never saw that.

One line per commit, newest first:

- `9e4e25d` docs(agents, roadmap): both inboxes emptied, the rules rolled out - and a false alarm that had a real cause
- `36b9a1b` sec(routes, engine, interface): 21 confirmed findings from two review agents - and an engine that is a thousand times faster
- `98f374d` sec(routes, audit-pack): two missing gates and a counter that believed the claimed count
- `b378e51` sec(audit-pack, evidence): two follow-ups from the QA review - a redaction in one place, and "uncounted" does not mean "clean"
- `9d77219` sec(audit): three findings from the b88c77b audit, each re-checked against the code - and the name resolution measured instead of claimed
- `351e169` sec(audit-pack): an alias of a signed path counts as the same path
- `c90fb65` chore(security): the allowlist no longer quotes the pattern it explains
- `fce3464` fix(test): the closing bracket the merge swallowed
- `36a5463` sec(trust-chain): bytes instead of text, one path instead of two, and a revocation that arrives
- `875bb99` fix(engine): a literal is text, not code - and three steps the reader overlooked
- `2af1890` fix(engine): the judging part no longer says more than it found - ten defects
- `8680352` docs: four cross-review findings marked as fixed, and a dead key in the history
- `50ac4b6` chore(security): three false alarms of the full run recorded, with a reason per entry
- `4f18fc6` fix(cross-review): CR-13, CR-14, CR-16 and CR-20 fixed, CR-09 gets its interim protection
- `4770b77` docs(roadmap): cross-review c5085bb taken in - 20 findings checked, eleven steps, four decisions
- `c5085bb` docs(end-of-day): status of 18.09.2026 - three decisions, the full review, Unreleased
- `acf09bb` docs(agents): three inboxes for b88c77b decided - UX 16, Security 83, QA full review 49 critical
- `1db8523` sec(audit): five medium findings from b88c77b fixed - one real href, three bindings, one ring
- `1a90b06` fix(ux): seven findings from the UX review of b88c77b, each with a guard
- `d6a2bfc` feat(7.6): What changes for users - four fields, each with status and source
- `076bfcf` docs(security): audit of b88c77b decided - 16 high, one real
- `f9f4ac1` sec(xss): a model URL reaches an anchor only as http(s)
- `ce7dd9c` feat(7.5): the panel is wired, checked rendered, and the static calls evidenced
- `4ddc262` feat(7.5): check tasks instead of pseudo-knowledge - three kinds of not-knowing become tasks
- `43b7fab` docs(backlog): observation on the QA delta review - a prose diff pushed along was treated as not included
- `13e474c` fix(mfa): a missing profile is a refusal where enrolment is required
- `a650a09` docs(backlog): scope items - no official machine-readable source, two ways remain
- `14ab490` docs(security): SEC-2026-135/136/137 fixed in 7a5a6b0, rows in ROADMAP paragraph 12
- `7a5a6b0` sec(mfa): mandatory enrolment for S/4 access and the own Gemini key
- `e61f26c` chore(rules): rolled out - production, register and working copy match

## [v2.13.0] — 2026-09-18

### The process now comes out of the code — as BPMN, named, navigable, and with one engine defect instead of twenty-four

**Phase 2 is complete.** Eleven steps, four of them on this day: the business
naming, the BPMN view, the export and the first look — plus the navigation of
large processes and the work on what the reference corpus found in the
engine.

**Navigating large processes (2.9).** The process map now carries programs the
size of real legacy reports. The overview opens with collapsed subprocesses,
each with a line range, counters (decisions · hard-coded · not determined) and
a problem line in plain language; below it a path line, an outline tree with a stable
number per step, a minimap across all levels, "Main path" and "Show paths to here",
overlays as filters, run variants from the selection switches and a search across
all levels. Level and selection are in the URL fragment: a shared link opens
the same place, Back and Forward do what is expected. **The acceptance is measured,
across all 65 nodes individually instead of by samples:** on the 1,000-line example
every step is reachable with the mouse in at most 2 and with the keyboard in exactly 3 actions
(`Ctrl+K`, outline number, `Enter`). The number exists because names
are not unique — 65 elements carry 42 different labels.

Along the way it became clear that **a guard is not a branch**: a leading
`CHECK p_rfc = abap_true.` is drawn in the BPMN as a conditional flow without a bypass edge.
Whoever follows it like a branch claims the program ends at the
switch — "31 of 65 steps do not run", where it is 59. The navigation
distinguishes the two; the clean solution in `lib/bpmn` is noted as a follow-up to
2.6.

**BPMN export from the skeleton of the signed run (2.6).** The export comes from
the code, not from a model flow: valid XML with escaping, stable IDs,
conditions on the edges, its own layout, anchor and state in a separate
namespace under `extensionElements`
(`https://clean-core.io/schema/bpmn/reconstruction/1`). Collapsed subprocesses
are real BPMN subprocesses, external systems a pool with message flow. The
schema check runs in the test.

**Business naming (2.4).** The model gets node ID, kind, technical label,
the condition texts of the edges and the AUTHORITY-CHECK objects — no source code,
no field values — and may return exactly two things: names for node IDs and
lane proposals. Whatever does not fit is discarded and counted, not repaired: 20
rules, from "unknown ID" and "node named twice" through "new nodes/edges"
to the lane named "CFO". The technical name stays, the business name next to it,
the anchor never moves, and an element without an anchor is called "Unanchored", even with
a nice name. Lanes carry the sentence *"Reconstructed from AUTHORITY-CHECK and
naming, not an organisational statement"*. A naming is stored only with a
valid receipt; without a key or with the stage switched off, the
complete skeleton appears with technical names and a sentence that says why.

**Dependencies the engine did not see (2.11, family c).** Nine corpus cases in
which nothing was reported or something invented. The string template of an
ADBC call *is* SQL; the macro placeholder `&1` is never an object, the effect
is at the call site; `(LC_TAB)` was never a table name, the constant next to it
names KNA1; and `(P_TAB)` stood where the source does not determine any target at all — an
unresolved target is now the coverage class `dynamic-target` ("Not determined"),
and the value next to it a *possible* target, marked and never as known. `TABLES:`,
`TYPE kna1`, `INCLUDE STRUCTURE`, `NODES`/`GET` and `ASSIGN ('(SAPMV45A)VBAK-VBELN')`
are dependencies with their own usage (`Reference`), not a read access. Both
engines read this from **one** file (`lib/abap/table-dependencies.ts`) instead of from
two copies of the same pattern, and the same file queries the declarations — which is why
`MODIFY gt_bp_data FROM gs_bp_data` is no longer an invented database coupling.

**The baseline, re-measured.** 340 pairs, **205** matches instead of 178, **one
engine defect instead of 24**. Not through a more lenient measurement: the comparison layer
got exactly *one* new bridge, and that where the engine
actually carries the statement; four cases moved from "not comparable" to a visible verdict,
because the engine now produces the statement class at all. Deliberately no
bridge for R29, R15, R26, R12 and R13b: there the engine carries no finding marker, and a
bridge would have counted "missed" where nothing is claimed.

### Security

**SEC-2026-025 — file read hole in the test-run sandbox (critical after review).**
The esbuild bundler in the parent process only rejected relative `.js` traversal. Two
plugins split the cases between them and left a gap in between: absolute paths and
relative imports of any other extension were passed unchanged to esbuild's default resolver,
which reads directly from the file system. A submitted test could thereby pull
service account JSON and application source code into the bundle and get it back
in the response field; the only precondition was a confirmed owner account. Now
a single `onResolve` plugin owns the whole import surface: everything relative or absolute
must resolve within `testDir` before the default resolver even sees the path. The
refusal is fixed and path-free, and the 500 branch no longer discloses internal
error messages.

### UX

**UX-102 — the how-to page describes the product that exists.** It kept two
phase lists of its own — one for the `HowTo` JSON-LD, one for the tour — with six
instead of seven phases, Testing before Documentation and Node.js/TypeScript/XSUAA on
both tracks. Both now derive count, order and titles from `PHASES`; the
texts sit per `PhaseKey` in `lib/how-to-content.ts`, so that an eighth phase without
text does not compile. Removed instead of reworded: the six screenshots from July
with their hotspots, the narrator text and the three concept cards under "SAP Verified
Strategy" — a corrected sentence next to a contradicting picture remains a
contradiction. Instead, every slide links to the same phase in the demo project.
Done along the way: **UX-008** (slideshow controls without names, hijacked arrow keys).

### QA

Four findings of the review of `13d1ffa` reported as `high` refuted — all four
the same misreading: the reviewer saw in the diff the deleted one-line assertion and
not the multi-line, stricter one that took its place. `expect(manifest.attested)`
has additionally bound the SHA-256 of the sealed bytes since `c69be3e`; the
provenance sentence now reads "user-attested — nobody vouches for what it says."
instead of "— not covered by the signature.", because manifest version 3 does bind the bytes
and the old sentence would thereby have become wrong.


**The last root of 2.11 family (a).** A DDIC type dependency (`TABLES`, `TYPE`,
`INCLUDE STRUCTURE`, `SELECT-OPTIONS … FOR`) is now a usage of its own and is
graded by the state of the object: **C** for a table that SAP does not release,
instead of the name grade **D**, which accused the program of bypassing the application,
although it does not touch a single row. A type reference to an *own* name deliberately stays
`Unknown`. Plus a second rule bridge for reading via a logical database at the
`GET` event. **Of 24 engine defects in the baseline of 17.09., one remains** —
CC-050, and that is not an error of the object grade, but the missing answer "level per
artefact": a product decision, not a bug fix.

**Three places still told the story of the product from July (UX-015, UX-104).** The chatbot
generated its `/how-to` tour from a handwritten list with six wrong
phases and named cards and exports that do not exist in Delivery, Documentation and Design
— it now reads the same source as the page. The landing page showed the same
six July screenshots that were thrown out of `/how-to`; they are **deleted, not
replaced** (hand-picked pictures from today are July pictures again in January, and roadmap
3.0.6 already owns this decision), in their place seven cards from the same
phase source, each with a link into the demo project, as a server component. The sitemap date
of a route is now read from everything it renders — twelve routes reported a
date that no content change could move. And eleven public pages had four
answers to the question of the way back; one of them, `router.back()`, did nothing at all for a
reader coming from search and sent signed-out users behind the login.

**The QA reviewer reads completely again.** The call budget of a delta review rises from
four to ten. Four was no longer a limit but a dead end: an incomplete
review leaves the checkpoint at its base, so the unread delta came back —
plus everything pushed since. Money was never the binding limit ($0.1031 against
a cap of $0.50), and the cap stays real: ten full calls are estimated
at $0.4983, the eleventh is refused.

**The full review of `a19945ef01dc` is fully triaged.** Of 504 reported
findings, all 30 critical and all 94 high ones are decided — of the high ones: 15
known, 14 refuted with evidence, 62 confirmed (39 distinct defects), 3 unclear. 21
of them were reproduced on the running code. The pattern behind the refutations: **the
reviewer reads a backward-compatibility test as a frozen defect** — six of
fourteen are this one fallacy.

### Modelling — Phase 3 complete

**Editor (3.1).** The process can be edited: the same modeller behind the same
props as the reading map, with a palette of 19 named buttons for pools,
lanes, events, gateways, all task types, subprocess, data object, message flow
and annotation, plus rename, delete, undo and redo. Operable with the keyboard, because
the same draft sits next to it as a list — the bpmn-js palette is not reachable with Tab
and does not know task types and the parallel gateway at all. **The reconstructed
as-is is never written in the process**: the editor works on a copy, and the test measures
that on the drawing of the reading map, not on the intention.

**Revisions (3.2).** Every save creates an immutable revision, written
only by the server via `DocumentReference.create()` — no `set`, no `update`, no
`merge`. Revision 1 is the as-is reconstructed from the signed source and cannot be set by
any request; for that the run is loaded and its signature checked
before reconstructing. Every further revision carries account and server clock. Two
revisions can be compared, per element via the stable ids from 2.6, so that a
renamed step appears as a rename and not as one that disappeared plus a
new one. The same bytes twice do not create a second revision; if someone else has
saved in the meantime, nothing is overwritten, and the sentence names the revision
to open.

**Check hints (3.3).** bpmnlint's standard rules plus four of our own — task without anchor,
gateway without condition, lane only reconstructed, element deviates from the code without a state.
On the 1,000-line example 28 hints, countable, switchable off, each with a jump to the element.
**No hint blocks anything.** Exactly one unlabelled branch is a default flow and
is never reported.

**States per element and rule (3.5).** Keep · change deliberately · drop ·
clarify, for every process element and every business rule `BR-nnn`. A confirmation is
a **requirement revision** with account and server time, immutable in its own
subcollection — not in the process revisions, because their route deliberately answers unchanged bytes
without a write, and states there would have softened exactly this rule.
**"Keep" means that the business still needs the thing; it does not preserve
an ABAP line** — that is stated above the list and on every card. Change and drop
require a reason. Undecided is not a state but its absence, and
is counted as such. A confirmed rule that moves marks only the
elements that were drawn from it.

**As-is and to-be (3.6).** The to-be is derived from the reconstructed map and the states:
what is kept stays, what is dropped disappears from it — but
keeps its lines in the comparison, because it is evidenced that the code existed —, what is deliberately changed stays
marked, and "clarify" like "undecided" stay open, counted separately. **An
element that exists only in the to-be has no anchor and does not get one either**: the function
that creates a requirement without code is not handed an element at all and has nothing to
copy. The comparison counts such an element as added, never as confirmed. A
to-be is not a statement about the code; it goes into no signed audit pack.

### The trust chain

**A test result is an observation by the server, not a claim by the browser.**
`/api/run-tests` executes the **stored** artefacts — code and tests from the body
are no longer read — and writes verdicts and an immutable receipt in
one go, bound to the signed run and to the checksums of code, suite and
case list. Testing and Delivery turn green only with that; a self-set "Passed"
stays visible and is called **"Self-reported"**.

**The signing route no longer accepts non-ABAP text** as a completed analysis, and
it checks this before a quota is booked. An architect approval is created in
a transaction and can therefore not end up on a run that nobody has checked.

**`/.well-known/` publishes a key ring instead of a single key.**
An evidence pack from yesterday still verifies after a rotation. A key no longer
listed yields "could not check", never "failed" — the difference
between not knowing and a verdict.

### Security

**Revoked rights now end where they apply.** An administrator no longer exports
someone else's evidence pack and no longer signs a run in someone else's project; a
suspended account no longer reaches an S/4 client; a withdrawn admin claim
is removed from the token instead of only being checked on the admin routes; and a rights grant
that went through only halfway leaves nothing usable behind. The signing key of the
trust chain has a floor of 32 characters. The four routes that talk to someone else's
S/4 client read its response through a shared helper with a time and
size limit instead of four times without limit.

### Engine

**Text is not code — the rule now exists once instead of eight times halfway.** Thirteen
engine defects of the full review shared one root: every detector brought its own
half masking, none knew the string template, two did not know comments
either. Six detectors now read the same preliminary stage; five separate literal copies are
deleted. That closes eleven findings, among them the two most serious — and neither invented
anything, they **deleted** something: a commented-out declaration made the critical
write access to VBAK disappear completely, and a word in a string template turned
a real write access into an internal table operation.

**A guard is not a branch.** Next to every folded switch the BPMN
now carries a bypass edge with the negated condition. With that, the file itself says that
the program does not end at the switch — even in someone else's modelling tool. On the
1,000-line example: with `p_rfc` off, exactly one step is not reached instead of everything
behind the switch.

### Honest statements

**Every answer to the running satisfaction survey was invisible.** A dot in the
key is not a field path in Firestore's `set()` but a character in the field name: the
route reported `ok`, the page showed returning users a blank sheet, the digest counted
nobody. Plus five places where the product claimed more than it does — the
landing page called static examples compiled and tested, the whitepaper promised
a compiled package, SAP HANA services got the PostgreSQL instructions, the
Confluence export invented routing evidence when the analysis supplied none, and the
auto-heal replaced the whole generated package with a single unchecked file. **Where
a sentence had no mechanism behind it, the sentence went, not its
wording.**

**The how-to page and the landing page describe the product that exists.** Both
kept phase lists with six instead of seven phases; the landing page also showed six
screenshots from July with "Upload" as a stage of its own, without Economics, Testing before
Documentation, and badges like "AI Verified" and "92 % Estimated Coverage". They are
deleted, not painted over, and in their place are seven cards from the same
phase source, each with a link into the demo project. The sitemap date of a route is now
read from everything it renders — twelve routes reported a date that no
content change could move. And eleven public pages had four answers to the
question of the way back; one of them sent signed-out users behind the login.

### QA

The checkpoint of the delta review stood still for two days, because an incomplete review leaves it
at its base and the unread delta grew with every push. The
call budget rises from four to ten; the cost cap of $0.50 stays and stays
real. Since then the review reads completely again.

Of 504 reported findings of the full review, **all 30 critical and all 94 high ones are
decided**. Of the high ones: 15 known, 14 refuted with evidence, 62 confirmed (39
distinct defects), 3 unclear. The pattern behind the refutations is more valuable than
their number: **the reviewer reads a backward-compatibility test as a frozen
defect** — he sees a manifest of version 2.0 stay green and concludes from it that the
spec pins the implementation, without opening the spec next to it, which demands exactly the opposite
for today's output format.

## [v2.12.0] — 2026-09-17

### A signed evidence pack was forgeable. The reference corpus now lives in the repository and checks the engine. And nine promises that held nothing are gone — four of them without replacement

**The most important thing first, because it concerned the core claim of the product:** a signed
evidence pack could be forged. The file name was allowed to carry the separator of the canonical form,
so two signed evidence files could be merged into one — same
canonical bytes, valid signature, one evidence file fewer in the archive, and
`scripts/verify-pack.mjs` answered "Verified." with exit 0. Reproduced before anything
was repaired: two different file lists, byte-identical canonical string.
On top of that, the check of the attested files bound only their *existence*
(`lib/audit-pack-verify.ts` asked `!!zip.file(path)`): `07-user-attested.md` could be rewritten from
"sign-off: not given" to an invented sign-off, and both verifiers stayed
green. And issue date and format version were not bound at all — a date set to 2019
was printed by the CLI as confirmed.

Fixed with format 3 of the canonical form: a uniqueness check, one digest per attested
file, the issue section before the hash. **All packs shipped so far keep verifying
byte-identically** — without `version` or under format 3 the canonical string is
unchanged, and the separator check closes the hole retroactively on them too. One
trap along the way that matters: the first, broader rule took down the issuer route with a 500,
because the real catalog status contains a colon *and* a comma and every previous pack is signed with exactly
this value. The run-binding fields therefore keep only the section character
free, from format 3 on it is masked, and a spec pins the live value.

**An administrator could delete any project of someone else.** `DELETE /api/projects/{id}` accepted
`decoded.admin === true` as ownership, and the only other hurdle — the
MFA gate — lets every token through if the account has not *enabled* a second factor
(`lib/mfa-gate.ts`: `if (!mfaEnabled) return null`). An administrator without a configured
second factor could thus delete other people's projects including signed
runs from an ordinary ID token — without step-up, without a mirror check, without a journal entry. Now: only the owner.
Nobody loses a function, because `firestore.rules` already took *reading* other people's projects away from the
operator on 16.09.

- **Roadmap 2.10 — the reference corpus lives in the repository and checks the engine.**
  `docs/korpus/referenzkorpus-v2.1.md` is the case book (68 cases), `tests/korpus/cases/` the
  bundle generated deterministically from it (209 files, every source file checked against the hash
  declared in the case book), `tests/korpus-engine.spec.ts` the ratchet. The baseline says
  for the first time in numbers how far the engine is from the corpus: 340 case-and-classes,
  178 matching, **24 engine defects**, 4 cases in which the corpus itself is wrong,
  and 134 statement classes that the engine does not produce at all yet. The 134 are not a
  weakness of the corpus — that is the measured status of Phase 2. The most expensive defect: an
  `UPDATE KNA1` via ADBC yields exactly one finding (`commit-work`), no data coupling, and
  the word KNA1 does not occur anywhere in the output. The three defect families are in the roadmap as
  step **2.11**. No foreign code in the repository: the occurrences carry
  class, lines and hash, no pointer, and a test turns red as soon as a hostname or a
  forty-character commit ID gets into `docs/korpus/`.
- **Roadmap 2.3 — the process skeleton is built from the code.** `lib/abap/process-skeleton.ts`
  builds, from branches and calls in *one* reading, nodes, edges with literal
  condition text, regions and entry points in runtime order; palette exactly per
  `DESIGN.md` §5.8, without a model call. Every node carries an anchor or a reason why
  not. Opaque calls do not end the caller's flow — except `SUBMIT` without `AND RETURN`
  and `LEAVE TO TRANSACTION`. Event blocks are entry points, even without `START-OF-SELECTION`.
  `CHECK` gets three different edges. `Z_ORDER_INTEGRITY_CHECK` gets **0 nodes and
  a note** instead of an invented start: the file has no entry point.
- **Roadmap 2.8 — hidden business rules.** `lib/abap/business-rules.ts` finds literals
  in conditions as rule candidates with an anchor: 140 across the eight examples. The price tolerance
  `lv_dev_pct > 5` in `Z_MM_PO_APPROVAL.abap:412` is such a case — a five in the code that in
  truth is a business rule nobody ever wrote down. Where a number looks like a
  monetary limit, it says "Amount, currency not derivable from the code" instead of a
  euro statement. 66 false alarms are excluded, each with a reason in the output instead of
  silently.
- **Roadmap 0.2 — nine UX findings, four promises removed without replacement.** The
  remediation switch switched text, never code: the generated code was byte-identical in both positions,
  the prompt did not even know the mode. The three "Transformation Insights" were
  the same for every project and named Express and TypeORM in the RAP track too. The
  SAP Build badge promised an export that does not exist. And the forum reported "Thread
  Posted Successfully!" after it had written to `useState` — the writing half is
  gone, the announcements stay readable and are labelled as read-only. Also: the green check
  now stands only for what was checked, the compatibility statement carries a permanently visible
  caveat instead of a hover tooltip, cancelling the onboarding blames nobody,
  the Jira modal invents no epics and no boards, and the first run quotes the
  quota like the header does. **Step 0.2 is not finished with this** — facts service and
  copy CI are outstanding, and §14 plans around thirty QA findings into the same step.
- **Two checks above the engine that need no expected answer.** `@abaplint/core` reads along
  since this release as a second, independent parser; nine deviations are in the register with a verdict and
  reasoning, and "we are right" is forbidden there. Plus five metamorphic
  properties (98 tests): renaming is invisible, formatting moves anchors and nothing
  else, a comment changes nothing, concatenating is union, every anchor points to
  its construct. Both found defects on day one that no test case would have seen:
  `IF lv = |Status: ok|.` made a gateway disappear from the diagram, and `ENDIF. " done`
  did not count as a closer — a program was considered more complex because it was commented.
- **The QA agent reads again.** The corpus bundle had driven the accumulated delta to 3.3 MB,
  80 % of it generated fixtures; the checkpoint could no longer advance, and
  the review of `5f84bb2` made **zero model calls** — and still reported
  `go_with_notes`. A green check over unread code is worse than a red one.
  `tests/korpus/cases/**` is now on the same exclusion list as the other generated
  paths; ratchet, manifest, spec and converter remain reviewed.

**The full review of v2.11.1 is complete:** all 30 critical findings decided —
6 were known, 13 refuted with evidence, 11 confirmed and fixed. Refuted were, among
others, `vercel.json` and two survey workflows that do not exist at all at the reviewed commit,
and three "secret-named literal" hits that refer to the public verifier and a
documented test key.

## [v2.11.1] — 2026-09-16

### Phase 1 is complete, Phase 0 except for one step, Phase 2 begins — and four places that claimed evidence nobody had checked

**What stays open in Phase 0, so that it does not disappear in a heading:** step **0.2**. Its
Signavio part went out in v2.10.2, the rest did not — the UX register still routes nine confirmed findings
there, among them UX-027 ("green tick for unchecked code"), UX-037 ("Transformation promises Node.js
in the RAP track too") and UX-059 ("forum pretends a public post, saves only locally"). That is
the same kind of untruth this release clears away in four other places, and it still stands. In addition,
one point from 0.17 stays open (`42a7d6a55d3b`): the security agent's loss tolerance is tested on its
building blocks, not at the entry point — a change to the agent itself and therefore a step of its own.

- **Roadmap 0.5 and 0.6 — a run says what it was computed from, and an old result stays bound to
  it.** A run named its inputs in five unconnected fields, and nobody ever compared
  more than the source digest: a catalog resync, a different rule set or a different target system
  shifted the findings, and every earlier result still read as current. `lib/input-manifest.ts`
  now carries six inputs with data class, revision and digest in the signed payload, mirrored to
  `auditMetadata.inputManifest` and in the pack as `08-input-manifest.json`. `binding` tells the truth about
  the hash — `value` means the bytes were read, `reference` means the input was bound under name and
  revision, never the claim that five megabytes of catalog were read. The freshness heuristic
  asked "does anything prove this is old?" and fell back to "current" when nothing proved it — an
  unreadable fingerprint, an empty source, an input never compared. Now the question is the other way round:
  which input can still be shown to be the same? The data class decides the consequence — source,
  catalog, rule set and target system block, engine build and narrative model only report, otherwise
  every release would invalidate every project. Plus W22-A06: an analysis that started on source A and
  committed after the project had switched to B silently wrote A, `activeRunId` included, over B; run and
  project state now go in one transaction that re-reads the source, the quota unit comes
  back, the route answers 409. The canonical form of the audit packs is untouched — every previously
  sealed pack verifies byte for byte.
- **Roadmap 0.7 — an approval is created on the server or not at all, and the rules have a
  deployment record.** Six fields leave the client-writable allowlist in `firestore.rules` — the
  five approval fields and the usage import — and are written only by
  `POST /api/projects/{projectId}/commands`. Until now the browser decided itself which
  address stood on the approval: it sent `auth.currentUser.email`. It now comes from the verified
  ID token, the timestamp from the server clock, ownership and not admin rights decides over the route,
  and every accepted change writes its `audit_events` line in the same `WriteBatch` —
  otherwise, after a failed second write, there stands a recorded architect approval
  that records nothing. Closes SEC-2026-008. **The rules deploy was the real finding:** CI never rolls out
  `firestore.rules`, and the first look via the Rules API — there had been none until then — showed
  the ruleset of 20 August in production, a month and three tightenings behind the repository. Rolled out
  with Sonny's go on 16.09. at 14:43:04Z and then re-checked on all six databases.
  `docs/registers/rules-deployment.json` records which text is live, `npm run deploy:rules` rolls out
  *and* writes it down, `npm run rules:verify` asks production. **This release changes the rules
  again and needs the same manual step before the app deploy.**
- **The administrator no longer reads projects** (decision Sonny, 16.09.2026). `firestore.rules`
  no longer grants admin read access on `projects/{id}` and `projects/{id}/runs/{runId}`, and the
  blanket admin `update` on projects is gone too — reading was the permission at issue, and an
  operator who edits someone else's evidence is the worse half of the same thing. The
  Datenschutzerklärung names the one exception: a credible report of malicious code in an
  upload is handled server-side via the Admin SDK, which bypasses the rules by design — a
  deliberate act with a log, not a standing permission. Found along the way: the GDPR deletion test proved
  its cascade by signing in as administrator and reading the documents as a client, that is, with exactly
  the permission that was removed; it now checks server-side.
- **Roadmap 0.9, 0.10 and 0.11 — the first look costs nothing and promises nothing.** A new account
  had to pay for the way to its first result out of the five runs it needs for its own code: the
  eight bundled examples are now free once each, recognised server-side by the fingerprint of the unchanged
  source — a client flag would print free runs, and an edited example is your own
  code and costs. Every further start of the same example is an ordinary analysis, deliberately past the
  repeat exemption, and the screen says so before the click. `/demo/{stage}` shows the seven
  stages on a real engine run over `Z_MM_PO_APPROVAL` — 30 findings with line anchors, Clean Core
  Score 43, every number computed at runtime instead of copied. The demo is kept out of the trust chain not
  by a flag but by construction: its own route, no project document, no run, no pack, no
  Firestore write, plus an executed invariant that throws at build time if a trust-chain field ever
  appears in it. Above the upload stands the card "Your code and your trust", and it is
  not copy: every line is a claim in `lib/trust-claims.ts` next to the sentence from the Terms, privacy policy
  or `SECURITY.md` that carries it — `tests/trust-card-guard.spec.ts` fails if a piece of evidence is not
  verbatim in the document or cannot be found on the rendered page. One line was left out because
  nothing carries it: "Others see it only if you invite them" — sharing does not exist yet.
- **Roadmap 0.3 — the score says what it is, whose it is and which way it points.** The name stays "Clean
  Core Score" (decision Sonny, 16.09.2026) and is made known; `/clean-core-score` keeps its URL,
  canonical and position. The page promised "predict your TCO savings" in the hero, named the reduction of
  test and development costs as one of the four pillars of the score, and served "A high score dramatically
  minimizes this testing effort" as a schema.org answer to answer engines. Five such promises on
  four surfaces are gone — and the guard that should have caught them so far only caught amounts with
  currency symbols, not the promise in words. `/method/levels` names the version of the level rule, and
  it is measured instead of typed: a fingerprint over all 48 inputs the derivation can
  distinguish, plus release and checksum of both SAP files. Chatbot knowledge, `/llms.txt` and the score page
  distinguish the score from SAP's `Technical Debt Score`, which points the other way (closes
  UX-088).
- **Roadmap 0.17 and 0.18 — checks that check, and known domain errors of the engine.** A
  `rejects.not.toThrow('…')` is satisfied by every error that is not exactly this one: the trust-chain suite
  was green while audit-pack generation, as far as it could see, was completely broken. It now runs
  against the emulators — 422 without a run, an archive whose signature the public
  `/api/export/verify` accepts and a one-byte difference does not, 409 for the run altered after the fact.
  Plus: the TCO guard computes the same function as the page instead of a copy of its arithmetic, the
  MFA refusal is proven on all routes that check for the factor (the catalog found three
  unlisted ones in doing so: account deletion, Jira URL, Gemini key test), the reference runs are matched instead of
  counted, and the preservation register knows the path from field name to visible element. From the engine:
  an internal table is not a database — `INSERT ls_item INTO TABLE lt_items` appeared as
  medium coupling to a table named LS_ITEM —, unassessed constructs lower the score and routing text
  instead of reporting "100 %, trivial", a SELECT in a text literal is not a query, and VBKD and LQUA
  are removed from the catalog instead of being replaced by a guess.
- **Roadmap 1.1 and 1.2 — the preservation register, and a run without a key.** Before rebuilding,
  what works is written down: the seven stages with inputs, outputs, preconditions, errors
  and one reference case each, plus commit, build and — because CI never rolls them out — `firestore.rules` together with
  the write allowlist, pinned to their hash. The register is data, not prose, so that a machine can compare it
  with the code: 25 tests re-derive every claim from the source and build the
  seven reference cases in the emulator without a single model call. It found nine limits while being
  written and recorded them as limits instead of preserving them as parity. — An account without a
  Gemini key used to get 503 and ended *without any run*: no evidence, no signature, nothing for
  the next stage, although every finding on this page is computed before any model. The model call is
  now a section of the analysis that may be missing; the run is signed over the deterministic evidence
  and carries `modelParticipation: 'none'`, instead of writing `provider: google-gemini` and a preset
  model ID into a signature nobody checked. Five model stages can be switched on
  individually, and where a narrative is missing it says "not generated" instead of an empty box — before, the
  Analyze stage showed the upload form again for a signed run without a narrative.
- **Roadmap 1.5, 1.4 and 1.8 — the new interface grows behind the switch.** `DESIGN.md` as code:
  semantic tokens instead of two colour dialects, a provenance list `lib/provenance.ts` with nine values, from
  which `CcProvenanceChip` takes its label — a wrong badge can no longer be
  written, only valued wrongly, and TypeScript catches that. No component takes a `className`; that is
  the hole through which every style guard leaks. `/project/{id}` has never delivered anything and now delivers
  the workspace shell — for administrators with the preview switched on, for everyone else
  unchanged nothing: header with the input manifest from 0.5 ("not recorded" instead of a dash, where
  nobody wrote anything down), seven status chips whose green is reachable only from `proven`,
  layer bar and the "Not determined" area with reason and line. Two chips say "not started" and
  name what is missing instead of borrowing the routing recommendation that sits on the project. Plus "My
  workspace" as a List Report: zero is not zero findings — a project nobody has analysed prints
  a word and not a number —, empty and "no match" are two components with two sentences, *Stale* stands
  as a provenance chip next to the object status and not as a status, and the price stands before the click.
- **Roadmap 1.6 and 1.7 — no dark mode, and green means proven.** What was removed was never a theme:
  58 lines of `.dark` overrides recoloured a hand-picked list of
  utility classes with `!important`, and everything the list did not name stayed light — the dashboard table kept
  its white background under an almost black body, the project row lost almost all its contrast.
  The UX review found the same from outside, without reading the code (UX-023, UX-044, UX-061, UX-062). The
  guard adds `class="dark"` to `<html>` and requires that not a single colour moves on around 600 elements;
  the profile field `theme` stays as a dead field, because deleting it would be a migration of
  account data. — The Verification Rail painted the phase the reader was on green before it asked
  anything else, and five of the seven greens stood for work that checked nothing: a
  design the account had approved itself, code the model wrote and nobody compiled.
  `phaseTone` in `lib/workflow-steps.ts` is now the one rule for stepper, rail and
  dashboard row: green exactly when a signed run, an executed verdict or a handover
  stands on it. The lock notice of the live test mode stood three times on one screen, and none of the three
  refusals said how to get the connection; now it stands once, with the BYOT path and the sentence that
  a BYOT approval does not lift G0:R0.
- **Phase 2 has begun: 2.1 and 2.2, both deterministic.** IF/ELSEIF/ELSE and CASE/WHEN come out of the code with the
  condition text in the wording of the source and each with its own line range, the nesting
  preserved instead of flattened; plus the FORM/PERFORM graph with recursion and missing targets,
  function modules with BAPIs marked, CALL TRANSACTION, SUBMIT with program names,
  AUTHORITY-CHECK with object and fields, and the write accesses. Until now the engine followed not a single
  PERFORM and captured AUTHORITY-CHECK without object and without fields. A name that is not a literal is
  not guessed: `CALL TRANSACTION c_tcode_va02` is resolved via the constant; if a
  variable stands there, the call is called `dynamic`. Reachability is not the same as "is called", and if
  there is a `PERFORM (name)` in the source, `reachabilityCertain` reports false, because the list is then an opinion.
  None of this goes into the signed run; the process skeleton comes with 2.3. **The phase is
  not finished with this** — 2.3 to 2.9 are outstanding, and the roadmap keeps them as open.
- **An indented asterisk is multiplication or comment, depending on what stands above it.**
  `declaration-parser.ts` and `select-parser.ts` threw away every line matching `^\s*\*`. In
  `Z_MM_PO_APPROVAL.abap:411` that is the second line of a multiplication written over two lines:
  the assignment never found its period and swallowed the statement below it — `IF lv_dev_pct > 5.`, the
  price tolerance check. The engine silently lost a branch in a file this product ships as a
  starter example, and every reader of this evidence was told there was nothing there. The
  opposite error costs just as much: `Z_SALES_ORDER_CREATOR.txt:70` has an indented asterisk
  as a real comment directly above a BAPI call. The rule now stands once, in
  `statement-reader.ts`, and all three parsers read it: column 1 is always a comment, indented only
  when no statement is open. Across the eight shipped examples exactly one number changes —
  `Z_MM_PO_APPROVAL.abap` from 387 to 388 statements and from 39 to 40 IFs; score, finding count,
  data coupling and complexity of all eight stay the same — the recovered branch goes into
  none of these metrics. With someone else's code it can, and that is the point.
- **The security agent's first complete audit: 247 reported findings, 24 decided, most of them
  refuted.** The report itself says that its verification stage did not come back — the findings are
  reported, not checked. Of the three reported as critical, not one holds: a "secret in the
  code" that is the public URL of the public signing key; an "unauthenticated"
  seed route that has three independent gates; and the claim that `firestore.rules` was not in the scope
  of the audit — refuted by two findings of the same report that quote line numbers from it. Of 29 reported as
  high, 21 are decided, fourteen of them refuted; the largest refuted block reads the
  calling line and not the function that receives it. Fixed and shipped:
  **SEC-2026-021** — `scripts/verify-export.ps1` ended on every path with `Verification complete: SUCCESS.`
  and exit code 0, also for an archive with no signature at all and for one whose signature nobody
  had checked for lack of a key; the sibling script `verify-pack.mjs` had the rule
  right all along (0 verified, 1 failed, 2 not checkable), and two verifiers of the same product must not
  answer the same question in opposite ways. **SEC-2026-023** — the recovery script for a
  lost authenticator, an administrator's most security-relevant action on someone else's
  account, wrote only a `mfaResetAt` stamp: a field that the next reset overwrites and that
  names nobody, while the Datenschutzerklärung promises an entry with acting administrator, account and
  time. It now writes to `audit_events` and requires `--operator <mail>` for it.
  **SEC-2026-024** — the `validate` job runs the whole Playwright suite and in doing so received
  `S4_ENCRYPTION_KEY`, `MFA_BACKUP_CODE_PEPPER` and `PILOT_APPROVAL_SECRET` from the same
  repository secrets with which the running service is deployed; it now receives no
  production secret any more, and two guards hold both halves. **SEC-2026-014 and -015** — the
  Analyze stage's Confluence export escapes every insertion through an escaper in one place
  (`lib/export-safety.ts`), and `sanitizeMermaidSvg` is no longer a chain of regular expressions but
  DOMPurify with `HTML_INTEGRATION_POINTS: { foreignobject: true }` — six of ten forms that have no business in an
  image passed through the old chain unchanged. Publicly only IDs stand
  (`docs/ROADMAP.md` §12).
- **UX review and around a dozen QA rounds.** The delta review of v2.11.0 brought seven decided
  findings, two of them refuted: the empty Blueprint page offered export of nothing because the action bar
  asked a different condition than the page below it; the package download failed silently; two
  icon buttons of the usage matrix had no name; and the 2FA copy button reported "copied to
  clipboard!" without awaiting the result of `navigator.clipboard.writeText` — where the browser refuses the
  clipboard, the reader then had pasted nothing and did not know it. `docs/ROADMAP.md`
  §13 has since been generated from the register instead of maintained beside it; the table had drifted. The
  most serious confirmed QA finding: **the audit pack attributed the engine's work to the model.** Under
  "Usage Context", *every* pack carried a fixed list of five things "the AI model did",
  two of them never true — the deterministic engine computes the clean core score and extensibility route before
  any model, and a signed run recomputes both server-side. Likewise "BYOK: No — platform
  key" stood in packs whose own data sheet says that no model ran at all. `modelParticipation` remains derived from
  the only fact the route can check — whether a narrative is in the request body —,
  and the data sheet now says so in a line of its own instead of leaving it to the reader. Turning it into a
  server-side observed fact needs a receipt from `/api/gemini` and is a
  step of its own.

## [v2.11.0] — 2026-09-16

### The second factor is Firebase's own, and four cut-0 steps work through the full review

- **Roadmap 0.13 — the second factor applies before the session.** The in-house TOTP apparatus checked the code
  only when the Firebase session was already established: entering the password meant being signed in, the prompt was
  a React state in front of it. Now the factor is Firebase's own (Identity Platform): Firebase issues
  no ID token before the code, and the token names the factor in
  `firebase.sign_in_second_factor`, which the server gates read (`lib/mfa-gate.ts`). Enrolment
  happens in the browser against Firebase Auth, `POST /api/mfa/enrolled` reads the factor back and sets
  the flag, `POST /api/mfa/disable` removes it via the Admin SDK — the factor first, the flag after,
  so that every error state is too strict rather than too lax; a flag without a factor is cleaned up by the same route
  without step-up. The old apparatus (own routes, `mfa_session` cookie, encrypted
  `mfa_secrets`, backup codes) is gone; recovery goes through the admin
  (`scripts/mfa-reset.ts`). **Not checkable in CI:** the Auth emulator cannot do TOTP — gate logic and
  negative paths are tested, enrolment and factor sign-in are checked on `dev` against the real Auth.
- **Roadmap 0.14 — account, keys and rights report only what happened.** A revoked
  admin claim kept working until the token expired, and the display mirror `users.isAdmin` was
  a second path to admin rights. Now only the claim grants, a revocation revokes the
  refresh tokens, a token with the claim is checked against the revocation — and the mirror refuses,
  even if revoking the tokens failed. Deleting a stored secret
  swallowed its own error and reported `ok`; account deletion removed the account first
  and could leave the rest standing. Plus: rate-limit key from the last
  `X-Forwarded-For` entry, size and time limit for S/4 responses, and a profile fetch from an
  old session no longer overwrites the new one.
- **Roadmap 0.15 — dashboard, admin and the seven stages say what they know.** The quota
  locked exactly the accounts that the same page advised to store their own Gemini key
  — the rule now stands once in `lib/run-quota-rule.ts` and matches the server's.
  "Is this ABAP?" was answered with "is the field not empty?": a pasted e-mail went to the
  model, cost an analysis and was signed as legacy code. The security scan now runs in the
  analysis start itself, on exactly the text that leaves the browser. Model copies of the signed
  metrics are discarded before saving, the Confluence export prints the signed score
  or "not computed". An empty model response is no longer saved as a finished transformation,
  and no second generation starts beside the first. The year-1 ROI includes the investment
  (before, "20 %" stood next to its own year-1 result of −80,000 €). Both Confluence exports
  escape every model word, the design preview no longer opens in its own origin. Plus: 1 MB applies,
  "Suspended" means "Suspended", undelivered admin mails are errors, and the abapGit package on
  the landing page can really be activated.
- **Roadmap 0.16 — scripts and workflows.** The review workflow downloaded an unversioned installer script
  from the net and ran it with the model key and PR write permission beside it; it now runs on
  an artefact pinned to SHA-256, without these rights in the step that reads PR content. The
  migration check declared documents intact after comparing three metadata fields —
  it now compares a canonical hash of every document and recomputes every signed run.
  The security agent also checks the briefs it loads as a prompt itself; the UX agent sees the
  text modules and all mail renderers. Mail: the community campaign sent before logging
  (outbox plus idempotency key), missing mail configuration in production reported success, a
  failed one-click opt-out answered 200, and a later scanner event overwrote the
  bounce reason.
- **The security agent no longer loses an audit to the last call.** The CISO wrote the verdict on
  every finding and the whole report around it in one response; three release audits in a row ended without a
  report, each time after around fifty consultant calls had been paid for and read. Now two calls: first
  the findings with the code beneath them, then the prose from the findings that remained — without code. If one
  half fails, the audit delivers the other and says in the report which one is missing.
- **QA rounds for every step.** The findings of the delta reviews are fixed in the same steps,
  refuted ones recorded with evidence in `docs/qa/refuted-findings.enc.json` (37 entries).
  Open and scheduled in 0.17: three guards that read source where only runtime evidence counts.

## [v2.10.8] — 2026-09-16

### Signed exports read only from the run, the board deck no longer seals anything, the full review is worked through

- **Roadmap 0.12 — the audit pack signs only what the server knows.** Until now the generators were
  given the whole project document under the run, and everything the owner may write in the
  browser — target architecture, sign-off, approver, justification, name — ended up in
  hashed, signed files: an approval typed into the form came out as server evidence with a
  signature. Now `lib/audit-pack-build.ts` builds the input of the signed generators from
  a named list of run fields; the account's statements are in `07-user-attested.md`,
  which `manifest.json` lists under `attested` — the name is bound into the signed hash, the
  content deliberately not. Web and offline verifiers show the file as "user-attested · not covered by
  the signature", reject a pack without it and allow no second one after sealing; packs from
  before this version canonicalise byte for byte as before. The model's narrative gaps go only
  into the project worklist, never into the signed run. An emulator test goes through both routes
  and compares every signed file field by field with the stored run.
- **Roadmap 0.8 — zero findings are not a verdict.** The board deck rolled an empty finding list up to
  "Fully Supported" and printed "Unconditional Go-Live Approved / LOW RISK" for an analysis that
  had returned nothing. Now it says "not determined" — without level, risk and recommendation —,
  and slides 2–5 say "coverage not established" instead of green rows. No more "Approved" from
  the static roll-up: the sign-off is reported as it is (recorded/self-attested/not
  recorded), the approval stays with the architect. "Resolved Objects" was object count minus finding count
  and is now called "Findings by Level". The Delivery page shows a detector error instead of passing it on as
  an empty list.
- **The full review of v2.10.7 is worked through:** 144 findings, 130 confirmed, 11 refuted with evidence,
  2 unclear. Fixed: test-account detection counts only the CI domain (a prefix like
  `security-user-` made real addresses deletion candidates); the migration's delta sync
  overwrites no target document that is not provably older; the survey scripts print neither
  addresses nor the digest into the public Actions log, claim every recipient transactionally
  before the provider call and count invitees from the records; the offline verifier follows no
  `signingKeyUrl` from the pack, rejects unlisted archive entries and ends an
  unsigned pack with 2 instead of 0; `vercel.json` (every route publicly cacheable) is gone. The
  remaining confirmed findings stand with step and status in `docs/ROADMAP.md` §14.
- **The QA loop delivers the review first.** A round on `dev` took 14–17 minutes, of which
  8–125 seconds were model; the rest was the deploy. `scripts/qa/await.mjs` prints the findings as soon as
  the review job is done, and waits for the smoke check only on a clean review. The
  security agent asks a truncated CISO call once more and runs with effort `medium`;
  the OpenRouter client names the stop reason and the token counts on an invalid response.
- **Roadmap:** adaptation options to the standard per operating model in process map, process chain and
  standard-fit tables (7.8); repo texts and mail deliverability with 3.0 (3.0.8, 3.0.9); a
  faster Cloud Run deploy as a Phase 0 step alongside.

## [v2.10.7] — 2026-09-15

### Target picture 3.0 accepted, current SAP catalog, an eighth example

- **DESIGN.md and the mockups 2.8 are accepted.** `DESIGN.md` (version 1.4.2) defines the look,
  structure and behaviour of the 3.0 interface: SAP Fiori patterns in the look of
  Clean-Core.io, green only for what is proven, fixed lists for provenance and status, Business · IT ·
  Management as views, BPMN from ABAP with navigation for large processes, "New project" with
  clean core at three glances, a demo project with a tour, and trust before the upload. The
  44 decisions stand with their occasion in `docs/design/decisions.md`. The 16 screens of the mockups
  and the likewise accepted new landing page (`docs/roadmap/clean-core-landing-v3_0.html`)
  are found 1:1 in `docs/ROADMAP.md` §5; `tests/mockup-roadmap-guard.spec.ts` holds that.
  The new start page belongs to 3.0, with real product views instead of mockup images.
- **The SAP catalog is current.** The release file of the Cloudification Repository dated from
  01.07.2026. Now: 25,467 instead of 23,696 entries, together with SAP's object classification
  33,864 classified objects instead of 32,103, 404 with a successor instead of 387. The catalog pages and
  the catalog sitemap thus show more objects.
- **An eighth starter example: `Z_MM_PO_APPROVAL`** (Emergency purchase approval, 668 lines,
  fictitious). The same case as in the mockups and the basis of the future demo project; the
  line anchors that `DESIGN.md` quotes are its real lines. Every example is now checked with
  file, test twin, line count and load path.
- **Pages with search reach stay.** According to Google Search Console, catalog, classification,
  Cloudification, Knowledge, code analysis, score, feature pages, how-to, whitepaper, licences,
  About and Trust have impressions. `tests/seo-surface-guard.spec.ts` holds routes, canonicals,
  sitemaps and robots.txt, so that the rebuild to 3.0 loses none of them.
- **The security audit no longer loses its report to a rate limit.** Two self-tests
  failed on the last call with HTTP 429 after around 100 seconds of retries. The
  security agent now waits with its own pauses for up to around 12 minutes per call; if the provider names
  its wait time (up to 120 seconds per attempt), it can be up to 16 minutes. The provider rule
  (no fallback, no provider that stores prompts) stays unchanged.

## [v2.10.6] — 2026-09-15

### QA review of bd0f380: the saved suite runs, money in words, no AI cost estimate

- **A saved test suite starts selected.** Since v2.10.5 the suite appears after
  reloading. But nothing was selected, and "Run Selected" stayed locked without
  anything saying that a tick was missing. The deploy pipeline failed on exactly that:
  `tests/full-pipeline.spec.ts` had always expected a preloaded suite, which until
  then never existed. Now a saved suite is fully selected when it first appears,
  like a freshly generated one. A later selection by the user stays.
- **Amounts in words.** The masking from v2.10.5 knew symbols and codes ("€5,000",
  "USD 40,000"), but no words. "5,000 dollars" and "3 million euros" are now
  replaced as well.
- **No AI cost estimate.** The chatbot glossary promised "AI-powered TCO estimation".
  Economics is a demonstration model on the user's own numbers; no model
  estimates costs. Glossary and limits section are corrected. A guard checks all
  pages, components and libraries for such claims.
- Eight findings of the review were wrong and are refuted with evidence:
  - the invalid test token as a "secret"
  - the supposedly missing callers of full review and UX fetch, which are in the same delta
  - the supposedly deleted guard assertions, which were replaced and not deleted
  - the batch limit, which is exactly right

## [v2.10.5] — 2026-09-15

### QA review of a0c1085: the whole prompt, money in prose, the stored test suite

- **The analysis prompt as a whole.** It now lives in `lib/analysis-prompt.ts` instead of inline
  in the page. A field comment still demanded `[F-id]`, although the CITATIONS block next to it
  was correct; the tests had only checked the block. The comment now points to the block. A test
  checks the assembled prompt, with findings and without: every citation example in it must be
  accepted by the parser.
- **No money amount in prose (step 0.4, finished).** A model can write
  "Projected annual savings: €5,000" into a value driver. An analysis stored before 0.4
  already contains such sentences. Every reader of a stored analysis now goes through
  `readStoredAnalysis` (`lib/money-honesty.ts`), which replaces every amount with
  "(amount removed: no approved cost assumptions)":
  - the Analyze stage
  - the Confluence export
  - the Markdown report in the dashboard and the Delivery bundle
  - the Design prompt

  The prompt says so itself as well. An emulator test opens such an analysis and downloads
  its export: the amounts are gone, the replacement text is there.
- **The stored test suite after a reload.** `useTestGeneration` read
  `project.testCases` once on the first render, while the project was still loading. Whoever
  reloaded the Testing page saw "Generate Your Test Suite" instead of their tests. Now the
  tests come from the project. With that, the lock test also checks execution:
  - In the Tenant tab with a test selected, "Run Selected" is locked, and a click
    does not reach the runner.
  - In the Mock tab, the same selection can be run.
- **UX agent, earlier reports.** The workflow searched for them in a window of 40 runs.
  Skipped dev pushes leave no artifact, and 40 of them made every earlier report
  impossible to find. `scripts/ux/fetch-reports.mjs` searches via the artifact list, like
  the session start.

## [v2.10.4] — 2026-09-15

### QA review of 7bdac5e: classes instead of single spots

The review found spots that the fixes of 0.1 and 1.3 had missed. They had only repaired
single occurrences, and the tests had only checked the repaired files. This round fixes the
whole class each time and checks the behaviour instead of the source text.

- **Locked live path (`G0:R0`).** `tests/locked-paths-guard.spec.ts` no longer reads
  fourteen fixed files but every file under `app/`, `components/`, `hooks/` and
  `lib/` (comments excluded) plus the README and the whitepaper template. Added to that are
  patterns for isolation the runner does not have: "isolated sandbox", "secure sandbox",
  "containerized", "code directly against your". Corrected were:
  - the Knowledge panel and the landing slideshow
  - the approval mail ("Execute dynamic SAP Cloud SDK code directly against your … sandbox")
  - the revocation mail ("fallback-routed to localized mock engines")
  - chatbot, How-to and the glossary box

  Everywhere it now says: the tests run against mocks in a restricted
  Node.js process.
- **The lock, observed.** `/api/run-tests` rejects a live run directly after reading
  the body, before the project lookup, temp directory, probe and credentials. New
  emulator tests:
  - A live run gets 403 with the lock notice and `locked: "G0:R0"`.
  - The same call on mocks gets 200.
  - The Testing page shows the notice and "Check only" in the Tenant tab and sends no run.
- **Anchors (1.3).** Non-numeric invented IDs such as `[F-credit-limit]` still count as
  invented. The instruction for a report without findings shows no finding ID. Its
  line example lies within the file.
- **UX agent, session start.** The artifact search pages by the raw page size.
  A full page with an expired artifact used to count as the last page. If the
  search ends at its limit, it says so instead of reporting "nothing open".
- Whitepaper and guide PDF regenerated.

Found along the way, not in this round: the Testing page does not show a stored test suite after
a reload (`hooks/useTestGeneration.ts:10` takes `project.testCases` only on the
first render, and at that point the project is still loading) — it is in the BACKLOG.

## [v2.10.3] — 2026-09-15

### Roadmap step 0.4: no money values without approved assumptions

The analysis asked the model for `estimatedMaintenanceCostRange` and a `cloudRoiSummary`
with "projected savings of approximately $Y–$Z per year". The Analyze stage showed that as
"Est. Maint. Cost: 3.000 €–8.000 €/yr" and "Estimated Cloud ROI". The Confluence export
carried it to the customer as "Estimated Annual Maintenance Cost" and "Expected Cloud ROI". Behind
none of these numbers stood an assumption that anyone had approved. Asking for a
range and a calibration note only turned an invented number into a
cautiously worded one.

**Now:**
- The prompt no longer asks for any money value, and the type knows none.
- The Analyze stage and the export say "not determined": a cost or ROI value needs
  approved cost assumptions, and the analysis has none. Calculations happen only in the
  Economics stage, with the figures the user enters themselves (since v2.9.8).
- The button is called "Economics: model with your own figures" instead of "C-Level TCO & ROI
  Calculator 📊".
- Corrected along the way:
  - "executive briefs with strategic ROI metrics" in the onboarding,
  - "summarizing the transformation, ROI" on the handover page (the deck contains no
    savings),
  - "TCO & ROI · Upgrade-impact calculator" in the whitepaper,
  - the chatbot, which still described an "AI-Powered Estimation" of the costs.

**Acceptance** (V25-A06: "Analyze, brief and export without an assumption revision show no
money value; the prompt contains no monetary fields"): `tests/money-honesty-guard.spec.ts`
checks:
- the prompt block,
- the type,
- "not determined" in the stage and the export,
- and that apart from the Economics page no file under `app/`, `components/` and `lib/`
  formats a money amount.

Without the change, all four tests fail.

## [v2.10.2] — 2026-09-15

### Roadmap step 0.2, first part: no more promise of a Signavio import that was never checked

Roadmap version 2.8 added a point to step 0.2: the Signavio statements
go back to "BPMN 2.0 XML" until step 4.3 proves the import with a real Signavio.
Twelve spots turned up, among them:
- the badge "Signavio-Importable" on the documentation page ("designed for seamless
  import into SAP Signavio Process Manager"),
- the comparison line of the home page ("hands the template to Signavio"),
- the alt text of the slideshow ("validated for SAP Signavio and SAP Build"),
- the features page ("SAP Signavio / SAP Build compatible"),
- How-to ("designed for direct import"), whitepaper including PDF ("importable into SAP
  Signavio"), Knowledge, capabilities guide including PDF and the chatbot's knowledge base.

They now say "BPMN 2.0 XML". Where Signavio is named, it says alongside that the import
has not been checked yet. Naming Signavio as a standalone SAP tool remains correct.
So does the note that Clean-Core.io has no Signavio certification.

And to be honest: even "BPMN 2.0 XML" does not yet hold up against every input. The
escaping of the export file is faulty (CR-21) and will be fixed in step 2.6.

**Acceptance** (Phase 0: "no page and no badge promises a Signavio import any more"):
`tests/signavio-claims-guard.spec.ts` reads every file under `app/` and `components/`
as well as features, capabilities, chatbot, whitepaper template and README:
- None of the ten forms of the promise may occur any more.
- Every visible sentence that names Signavio and "import" together must say "not checked".

The guard fires 12 times on the old texts.

### QA round 2 on the UX agent, and a bug the second run showed

- **The report fetch failed on itself.** In the loop, `[ "$found" -ge 10 ] &&
  break` was the last command. As long as fewer than ten reports had been found, the
  false test became the exit status of the whole step (run 34952723977). Now there are
  if statements there, and a guard forbids the pattern.
- **The baseline travels along** (`27096ea7fdbc`): every report names the complete
  full review it builds on. That way it does not drop out of the window of the ten most recently
  loaded reports, and there is no second full review by accident.
- **Session start** (`006ed32a72cc`): the search goes over the review artifacts, not over
  runs. Skipped runs have none, self-tests are passed over, no matter how many there are.
- **Images only count if they are in the call** (`115d8f705a0d`): a screenshot that the
  byte limit sorts out makes the review incomplete. That also applies to the synthesis.
- **Deleted files in full** (`a064a718fbb9`): no more silent truncation at 40,000 characters.
  The batch limit captures oversize and notes it.

## [v2.10.1] — 2026-09-15

### Roadmap step 1.3, brought forward: citations of the engine IDs finally count as evidenced

The analysis asks the model to back every sentence with an anchor and measures
the traceability rate from that. The engine has always numbered its findings `CC-001`; the parser
(`lib/abap/narrative-anchors.ts`), however, only recognised `[F-…]`. The consequences:
- A correct citation `[CC-003]` matched nothing and counted as "unevidenced".
- The example in the prompt, `[F-017]`, could only be an invention.
- The test used the same invented `F-` IDs and therefore ran green.
- The displayed rate was lower than what the model had actually evidenced.

**Fixed.**
- The parser reads every ID of the form `XX-017` as a finding citation and checks it against the
  report: a real ID is anchored, an invented one (including `[F-017]`) is counted as
  invented, not ignored.
- The prompt example is the first real ID of the report.

**Acceptance:** "Test with real engine IDs". `tests/narrative-anchors.spec.ts` builds the
evidence report with `buildAbapEvidence` from a small ABAP program:
- The real ID gets anchored.
- The example in the generated prompt resolves.
- `[F-017]` counts as invented.

The fixtures now use the engine's form. Without the fix, 6 of the 14 tests fail.

## [v2.10.0] — 2026-09-15

### Roadmap step 0.1 (`G0:R0`): live tests against a tenant are locked — and now that is stated everywhere they were offered

The first step of Phase 0 "Evidenced". Decided on 12.09. ("Route 2"): a known
blocker is fixed or locked with a reason. The lock already existed technically, because
`deploy.yml` never sets `S4_TEST_RUNNER_EGRESS_ENFORCED`. But nobody said so:
`SECURITY.md` described the live mode as "off unless enforced", and around 30
visible texts offered tests against one's own tenant as a feature. A live run from
the Testing page ended in a raw HTTP 403, which appeared as "Execution Error" in the terminal
and went to Gemini to explain an error that was a decision.

**One definition.** `lib/locked-paths.ts` (`LIVE_TEST_EXECUTION`) holds the lock in
one place:
- **Boundary:** locked is `POST /api/run-tests` with `s4Environment: "live"`. Open
  remain the sandbox against mocks, the connection test, reading the metadata and a
  reading OData call.
- **Reason:** generated code runs as a child process in the API service. The protection layers
  are defense in depth, not an isolation boundary, and the service has open egress (CR-15).
- **Reopening, all four conditions:**
  1. a dedicated short-lived runner service with a minimal service account,
  2. deny-by-default egress with the tenant as the only destination, proven in CI,
  3. an external review with closed findings,
  4. Sonny's decision.
- **Notice text** for the users.

**The route checks the lock first, and only then measures.** A passed egress probe
no longer opens anything, because two addresses are a sample, not a boundary.

**`SECURITY.md` v4.1, new §7.1.** It contains boundary, reason, conditions and
notice text verbatim from the definition. The summary, the findings table (F-02), the
flow diagram and the variables table now say "locked".

**The interface says so.**
- The Tenant tab is called "Check only", the panel names the lock.
- "Run Selected" is locked for CAP projects in tenant mode, and the hook does not even send the
  request.
- The simulated ABAP report no longer promises a "real verdict" through a tenant.

**Texts corrected:**
- Landing page: "Validated · Runs test suites against your S/4HANA sandbox" becomes
  "Sandbox + Connection Check".
- The pages Tenant Security, Knowledge, How-to (including hotspots), whitepaper and the
  chatbot's knowledge base.
- Approval mail for tenant access, capabilities guide and README.
- `ARCHITECTURE.md` and the bridge docs. Their header now marks that the sections
  on test execution describe the locked path.
- Whitepaper PDF and guide PDF are regenerated.

**Found along the way, same panels:** two security statements were not true.
- "Browser-side Encryption: … encrypted locally in the browser" is wrong. Encryption
  happens on the server with AES-256-GCM.
- An "isolated BTP proxy channel" does not exist. The calls run server-side via
  the SSRF-checked fetch.

**Acceptance** (`docs/roadmap/SCHNITT-0-UMFANG.md` §1): "The boundary is in `SECURITY.md`",
"No view, no text and no export presents the locked path as available".
`tests/locked-paths-guard.spec.ts`, 19 tests:
- `SECURITY.md` §7.1 against the definition.
- Route: lock before measurement, 403 before loading the credentials.
- Hook: no request, no model call.
- Page: notice and locked button.
- 14 surfaces against the 16 statements of 15.09. Plus the rule: every sentence about tests
  against a tenant must contain "locked".

## [v2.9.17] — 2026-09-15

### The UX agent: every version on main gets a UX review — the first one takes on the whole product

Sonny's assignment of 15.09.: an agent that checks every `main` state for UX problems,
questions design decisions, delivers improvements, looks at new features from the user's perspective
and checks end to end whether colours, shapes and fonts are consistent — with Muse
Spark 1.3 via OpenRouter, autonomously, cost-optimised, within guardrails. And: the first time,
check the whole code with respect to UX, with as precise a prompt as possible.

**The prompt** (`docs/ux/ux-brief.md`): a principal product designer with a single
goal. He knows the users (ABAP developer, architect, process owners, management,
first-time visitors) and the product rules as a UX requirement: missing stays missing,
reconstructed is never confirmed, and the interface must distinguish that *visibly*. The
mockups 2.7 are the target picture. He checks from ten perspectives, in this order:
journey, orientation, feedback, visual consistency across all screens, texts, WCAG 2.2
AA, phone, trust, design decisions, new features. Severity is measured in consequences for users.
No finding without a line, screenshot or scan figure. There are separate sections for
the full review per area, the end-to-end synthesis and the release review.

**What he sees.** A deterministic design scan of the whole product, without tokens. Even
the first trial run counts 207 colour shades, 78 different button styles across 84 buttons,
883 places with font size below 12 px, gray and slate as well as green and emerald side by side and
22 `dark:` variants. Plus screenshots from `tests/capture-screens.spec.ts`: a seeded
demo project, 16 screens on desktop and phone at screen heights instead of unreadable
full-page images, three screens in dark mode and the six views of the mockups. He gets the code
bundled per journey, from the import graph: access, knowledge, frame, analysis,
draft, evidence, system.

**Three jobs.** `scope` without secrets; `capture` builds and photographs the app without any
secret, with throwaway keys; `review` holds the model and seal keys and runs no
`npm ci`. Screenshots are only accepted as bytes with the expected name and JPEG signature.
The report is sealed; the log names mode, calls and cost.

**Cost.** Estimated budgets per mode, checked before every call against actual spending plus
a conservative estimate: full review $6, release $1.50, self-test $0.30; the hard
limit is the credit limit of the OpenRouter key. No guessed base — without a checkpoint and without a previous `main` state, the run aborts.

**Claude's side:** skill `ux-review-intake`. It fetches the report and the screenshots
(`scripts/ux/inbox.mjs`), checks each finding against line and image, decides
(`scripts/ux/register.mjs`) and schedules into the new **Roadmap §13**. At session start
a hook reports undecided findings; after a push to `main`, the post-push hook reminds.

**Taken along:** the QA agent's OpenRouter transport now takes model, image parts and
title per agent. Rejected calls name a fixed interpretation of the status code, for instance 403 =
model not enabled for account or key. That is exactly the current state: **Muse Spark 1.3
requires an 18+ confirmation in the OpenRouter settings that only Sonny can give.**

Revoke: `UX_REVIEW_ENABLED=false`. Runbook: `docs/UX-REVIEW-AGENT.md`.
`tests/ux-review-guard.spec.ts`, 23 tests.

### QA round 1 on the UX agent — seven findings fixed, and `dev` green again

- **The pipeline on `dev` was red.** `npm run lint` allows 661 warnings, the UX push
  brought 662: a `catch (err: any)` in the capture test. The warning is removed, the
  budget not raised. Now at 660.
- **No release delta before the full review** (`e4b1d7916a95`): scope now only decides *whether*
  a run takes place (`auto`); `review.mjs` opens the reports and makes every automatic
  run a full review as long as no complete one exists — on `main` as on `dev`.
- **Deleted screens count** (`25c4ed925224`): a removed file goes to the reviewer with its last
  content; a release that only deletes no longer counts as invisible.
- **Session start** (`c3109a9fdfb1`): looks for the newest real review behind skipped runs
  and self-tests.
- **Budget named honestly** (`504b555454c1`): estimated budget, not a hard limit; the
  estimate calculates with 2.5 instead of 3.5 characters per token.
- **Recurring findings stay open** (`4875aa3e7409`): a decision closes what was reported
  before it — not a later regression, even across someone else's release.
- **Mockups** (`b255c3fc77a5`): the selection asked for `m3`, the capture writes `m3-mockup`;
  one shared constant, tested with the real file names.
- **Screenshots per screen** (`a553413f50d9`): if the image of a screen that a call needs is missing,
  the review is incomplete — a single other image is no longer enough.

And the third round on the security agent: shallow clones and git errors no longer hide a
recurring finding (`9068756162e7`); exclusions in the attack surface map now name
only file types, never whole directories (`ffcb81ab61a8`).

### Security self-test: the cause of the HTTP 400 narrowed down

The third self-test also failed in the first turn ($0). From the fixed word list, only
`workspace` came this time. That fits the Anthropic message for a reached usage or
spend limit of the workspace. This message is now a class of its own, and the word list
knows the words for it (`limit`, `usage`, `spend`, `access` …). The next run confirms
or refutes the hypothesis. It is to be checked in the Anthropic Console at the workspace of the
key `SECURITY_AGENT`.

## [v2.9.16] — 2026-09-15

### No more "AI Studio" in the repo — where it is possible without effect on the code

Sonny's assignment of 15.09.: the project started in Firebase AI Studio, that was long
ago, and "AI Studio" sounds like a hobby. Removed is everything that can be renamed or deleted
without a change in behaviour.

- **Package name** `ai-studio-applet` → `clean-core-io` (`package.json`, both places in
  `package-lock.json`; checked with `npm ci --dry-run` on Node 22/npm 11).
- **`firebase-applet-config.json` → `firebase-config.json`**, with all 14 imports, the
  source export, SECURITY.md and the test docs. The gitleaks allowance for the public
  Firebase web key applies to the new name; the old one stays for the scan of the history.
- **Deleted, because nothing reads them:** `metadata.json` (applet description "Project
  Platform"), `firebase-blueprint.json` (draft schema from the setup), `.eslintrc.json.bak`.
- **Comments and docs** without AI Studio reference: `.env.example`, `next.config.mjs`,
  `JiraIntegrationModal.tsx`, `firestore-oversized-fields.ts`, DATA-RETENTION, BACKLOG, the
  migration plan; `docs/SCREENING-AISTUDIO-ALTLASTEN.md` is now called `SCREENING-GCP-ALTLASTEN.md`.

**Stays, because they are real resource names:** the Firestore database of `dev`
(`ai-studio-030e1ee1…`, us-west1), the retired `ai-studio-*` databases and the
bucket in the cleanup lists. A database cannot be renamed, only migrated — just
as production was on 20.08. to `clean-core-eu`. That is an infrastructure step with
Sonny's approval, not a rename.

### QA round 1 on the security agent — nine findings fixed, one refuted

- **No release without an audit:** the concurrency group held only one waiting run; a
  third push would have cancelled the second. The group is removed, every run stands on its own
  anyway (`0ea9860d60be`).
- **Delivery after "Re-run failed jobs":** the artifact name now comes as an output from the
  audit job, instead of being rebuilt in the delivery job with its new attempt number
  (`566a50b8581a`). The inbox likewise picks the artifact by name, not by
  extraction time (`4fb3804a2d49`).
- **Read the report only once it is written:** the result is read only after the flush of both
  output files (`9755c9d18aa8`; not reproducible locally, the waiting is pinned down with a
  test).
- **Recurring findings:** a finding marked as fixed that an audit of a
  commit *with* the fix reports again counts as open again (`cf4293a0d91a`).
  `register.mjs` works in a fresh clone without an inbox (`def5abdae94c`).
- **Honest coverage:** excluded files appear with reason and count in the map;
  whatever is shipped or runs (HTML in `public/`, SVG, scripts) is always included
  (`b9dfa00d5649`). An `npm audit` without a result means "did not run", not "clean"
  (`5be8e955fc64`).
- **Mail on the phone:** long words and URLs wrap in every card instead of being cut
  off; the test now checks every element, not only the page scrolling (`73eba29aa463`).
- **Refuted:** the "critical" finding in `envelope.mjs` is the path to the *public*
  key, which the redactor's name pattern `…_KEY…` took for a key (`8e1761103200`).

The first self-test failed with API error 400 in the first turn, $0. The log now names
an error class from a fixed list (e.g. "credit balance too low"), never the text.

### QA round 2 on the security agent — three remaining cases fixed, three false alarms refuted

- **Recurring findings, even without complete history:** if the clone lacks the fix or
  the checked commit, the finding is shown again instead of hidden — a failed
  git command is no proof (`71baa4a01baa`). One shared check for both inboxes.
- **Coverage:** whatever can run or render (scripts, JSX, shell, HTML, SVG, YAML) is never
  excluded, no matter which directory (`f9942b308569`). The SAP catalog no longer appears
  as "covered by the dependency audit" in the map — that only applies to the lockfile (`bdd2bd0a760c`).
- **Self-test diagnosis:** the second run showed `hint=unrecognised`. The log now additionally names
  which words of a fixed API vocabulary list occur in the error or in the stderr log.
- **Refuted:** the public Firebase web key after the file was renamed; the path to the
  public key (the constant is now called `AUDIT_PUBLIC_PEM`, so the name pattern
  no longer matches); and a hit in the outgoing prompt that my own
  refutation reasoning had triggered, because it quoted the line.

## [v2.9.15] — 2026-09-15

### The security agent: every version on main gets a full audit — the report comes by mail

Sonny's assignment of 15.09.: a second agent that works like a CISO with his security
consultants, knows current attack patterns, checks the entire code after every new `main` state
and delivers an evidenced, understandable report in German —
without changing anything itself.

**Who checks.** Claude Fable 5.1 in Claude Code, headless, with Ultracode: a CISO and
five consultants — API security, identity and cryptography, data and Firestore rules,
frontend and supply chain, CI/cloud/LLM. The CISO instruction (`docs/security/ciso-brief.md`)
names method, current attack patterns (Next.js middleware bypass, Firebase rules, OWASP
API and LLM Top 10, Actions injection, cloud metadata), severities and report structure.
No finding without a line that was read; hypotheses go under "Limits".

**Full analysis, frugal.** Before the model, a map of the attack surface is built — every
file with its domain, every API route with auth markers, every dangerous sink,
workflow permissions, rule blocks, CSP, `npm audit` — in two seconds and without tokens. The
consultants read from there in a targeted way; every file is covered by at least one method,
and the report names the coverage. Hard limit: `--max-budget-usd 25`.

**Read-only, technically enforced.** For the agent, exactly Read, Grep, Glob,
Agent and Workflow exist; Bash, PowerShell, Edit, Write, WebFetch and WebSearch are additionally
forbidden; `--restricted` and `--strict-mcp-config`. The consultants have Read, Grep, Glob.

**Three jobs, three trust levels.** `scope` without secrets; `audit` with the
Anthropic key and the **public** key — it can seal but cannot open a
report; `deliver` with the private key and Resend — opens, renders, mails and
runs no model. No third-party code next to a key: the map is our own code
using only `node:` modules, the mail job runs without `npm ci`.

**Nothing becomes public.** The CLI transcript goes into files, never into the log; the log carries
status fields and numbers. Report and register are sealed (RSA-OAEP + AES-256-GCM). The
roadmap gets §12 with a table that may only show ID, severity, priority, step and status.

**The mail** is in the Clean-Core.io look — the same responsive shell as all other mails,
a test keeps it character-identical —, reads at 320 px without horizontal scrolling (test in the
browser) and escapes every model text. It contains overall risk, short conclusion, every finding with
location, precondition, impact, evidence, recommendation and **Check before the fix**,
hardening, what is good, scope and limits, and an **evidence** section: version, commit, model,
duration, cost and the SHA-256 of the sealed report.

**Self-test.** If the agent itself changes on `dev`, the whole chain runs once with
Haiku 4.5 and a $1 budget — up to the real mail with `[SELBSTTEST]` in the subject. A
local trial run under Windows had failed at the 8,191-character limit of `cmd`;
what is checked is therefore the path that actually runs.

**Claude Code's side:** skill `security-audit-intake` — fetch (`scripts/security/inbox.mjs`),
check every finding at its location, decide in the register (`register.mjs accept |
refute | risk | fixed`), schedule by priority: critical immediately as a step of its own, high
into the running phase, medium into the next fitting step. At session start
a hook reports unassessed findings of the last audit.

Revoke: `SECURITY_AUDIT_ENABLED=false`. Runbook: `docs/SECURITY-AUDIT-AGENT.md`.
`tests/security-audit-guard.spec.ts`, 18 tests.

### QA round 3 on v2.9.14 — two findings fixed, four refuted with evidence

Seven findings, $0.91. **Fixed:** without any shared history with `main` (orphaned
history, missing `main` in the clone), the agent checked only the last commit and considered that
complete — now the run aborts and demands a base (`1b9c06bebe30`, which also
covers the remaining case of `80cae7cd7d5a`). The schema validator let `constructor` and
`__proto__` through as allowed fields because it also read the prototype chain (`8cc6caa6085a`).
**Refuted:** four findings about reports in the format before v2.9.14 — checked against all
stored reports: there is no refutation before this round, no re-raised
finding and no old report with unread code; the cases cannot occur.

And a false alarm in Security CI: gitleaks read a comment in `redact.mjs` that listed the
*names* of the key variables as an assignment. Comment reworded; the old
commit is in `.gitleaksignore` with commit, file, rule and line — no path, no pattern.

## [v2.9.14] — 2026-09-15

### QA round 2: ten findings by the agent about itself — and a test that was only green here

**v2.9.13 did not reach dev.** The `validate` job failed on a new test:
"without a checkpoint, everything that is not on `main`" was checked against the local Git state.
The pipeline checks out shallow, there is no `origin/main` there — `null`
instead of a commit. The red run was reported by the QA agent's smoke check
("pipeline failure; new revision serving: no"), and by the weekly check as well. The
range selection is now a pure function with its own tests, and `mergeBaseWithMain`
is checked in a Git repository created specifically for it — independent of how the
test is checked out.

The review of v2.9.13 ($1.28) brought three high and seven medium findings; each
was checked against the code, none was wrong:

| Finding | Severity | What has changed |
|---|---|---|
| Valid JSON without review fields (`{}`) became "go" via default values | high | the answer is checked locally against the schema; the error message names only the path in the schema |
| An old refutation made a re-raised finding disappear on the push after next | high | a refutation only applies to raisings *before* it; everything later stays open until it is fixed or refuted anew |
| A partial review got "go", and the checkpoint jumped over unread code | high | unread or truncated code makes the report **incomplete**: no clean "go", the loop stays open, the checkpoint stays put |
| A GitHub "Re-run" keeps the run ID — artifacts of earlier attempts could count | medium | artifact names and reports carry the attempt; only what a successful job of exactly this attempt produced is read |
| The cost budget was described as a hard limit but is an estimate | medium | statement corrected, response schema included in the calculation; **the hard limit is the credit limit on the OpenRouter key** |
| An unreadable pipeline state appeared as "all green" | medium | expired login, rate limit, network errors are called `UNKNOWN` and keep the check open; only a confirmed "does not exist" is a finding about the repository |
| Ten pushes could make a scheduled workflow look "asleep" | medium | the last scheduled run is queried separately |
| `finish_reason` let arbitrary lowercase letters into the public log | medium | only known values are named |
| The redaction did not know `QA_REVIEW_KEY`, `AUDIT_SIGNING_KEY`, `S4_ENCRYPTION_KEY` | medium | names ending in `…_KEY` are recognised |
| After a force push with an unusable checkpoint, only the last commit was checked | medium | without a usable checkpoint it always holds: everything that is not on `main`; the push's `before` is never taken, only a manual run sets a base |

`tests/qa-review-guard.spec.ts`, now 45 tests.

## [v2.9.13] — 2026-09-15

### The QA agent reviewed itself — nine findings, all confirmed, all fixed

The first real run on `dev` came back without a report: **"OpenRouter returned no
review content"**. With reasoning models the thinking tokens count towards `max_tokens`, and
at `effort: high` GPT-6 Astra had used up all 12,000 tokens on thinking.
The budget is now 32,000; from now on the error message names
`finish_reason` and the token counts — numbers only, no content. Proven locally on
exactly the range that failed: one call, **$0.81** actual.

This review was of v2.9.12, i.e. the agent itself. Every finding was checked against the
code before the fix; none was wrong:

| Finding | Severity | What changed |
|---|---|---|
| Commit subject lines bypassed redaction on the way to OpenRouter | critical | subject lines are redacted, and before every send a final redaction pass runs over the whole message |
| Without an earlier report an aborted delta was lost — exactly that would have happened on the next push | high | without a reviewed state the review covers everything not yet on `main`; the search goes back 50 runs instead of 15 |
| A refutation suppressed the same finding forever, even after a real regression | high | a finding raised again stays and is marked; only the *carry-over* of refuted findings is dropped |
| A stale artefact could make a failed rerun look green | medium | fresh folder per run; a report counts only for the commit it was made for |
| Retries after timeout, connection drop or 5xx could bill twice — outside the cap | medium | only a 429 is retried, a rejection before any generation |
| A broken 200 response could bring text into the public log via the `SyntaxError` message | medium | all error messages of the model call are fixed text plus numbers |
| A later batch overwrote "fixed" with "not touched" | medium | a verdict beats "not touched"; between "fixed" and "open", "open" wins |
| Deleted files lost their diff and the caller analysis | medium | deletions come with a diff; removed exports are looked up at their remaining callers |
| A missing cost figure was reported as $0 | medium | if it is missing, it says "unknown"; the cap then uses the estimate |

**The cost cap now calculates honestly.** It used to be estimated at the full
output limit of every call — with 32,000 tokens a second batch would
practically always have been dropped. Now each call is preceded by a check:
actual spend plus the worst-case estimate for exactly this call.

### Weekly: pipeline health — and the catalog sync is no longer red

Sonny's instruction of 15.09.: the QA agent also looks at the pipelines once a
week. Occasion: **"Sync SAP Cloudification Repository" was red on 7 and 14.09.**
The sync itself had worked — SAP had published new catalog data, it
sat on `chore/sync-cloudification-repo` —, only the last step failed:
*"GitHub Actions is not permitted to create or approve pull requests."* A red
scheduled run reports to nobody; the update sat unnoticed for a week.

- **The sync no longer opens a pull request** (decided: the repo setting stays
  off). It pushes the branch, ends green and writes in the summary that an
  update is ready; the PR permission is removed from the workflow.
- **`qa-weekly-health.yml`**, Mondays 07:30 UTC after the scheduled jobs: per workflow
  the latest result — red (with job, step and first error line, redacted),
  dormant, ok — and bot branches that are ahead of `main`. No model, no
  costs, read-only, result sealed.
- **At session start** the same check runs (`scripts/qa/health.mjs --brief`) and
  brings what is red and open into Claude's context, even without a push. If it fails, it says
  so — a silent hook would have hidden exactly its own error in the first test:
  a workflow not yet on `main` made the whole check abort. That
  is fixed; a workflow that cannot be queried counts as "unknown".

The pending catalog update (18,708 lines added, 9,751 removed, one file) is checked and taken over as
a separate step via `dev`. The sync stays red in the weekly check
until this workflow change is on `main` and it has run once.

`tests/qa-review-guard.spec.ts`, now 38 tests — new: no retry after possible
generation, no response excerpts in errors, final redaction pass,
unknown costs, checkpoint fallback, deleted exports, artefacts per run,
status merging across batches, findings raised again, weekly assessment,
sync without PR.

## [v2.9.12] — 2026-09-15

### The QA agent: every push to dev is reviewed — sealed, capped, only the delta

Decided by Sonny on 15.09.: from now on and until revoked, a QA agent reviews
every new state on `dev`, on its own and within fixed guardrails. Model: GPT-6
Astra via OpenRouter, fixed.

Two jobs in `.github/workflows/qa-review.yml`:

- **Delta review.** Only the commits since the last *reviewed* state — so an
  aborted run loses nothing. Before the model, a pre-check runs without
  tokens: risk tags per file, signals of weakened tests, quoted
  acceptance criteria from the CHANGELOG, code without a test in the same delta, and the
  callers of changed functions outside the delta. The model reviews like a
  QA engineer — intent and acceptance, correctness, security, trust chain,
  regression, tests, honesty of the claims — and looks for **simplifications, but only
  those with provably identical behaviour**. Open findings are carried into the next
  round until a review reports them as fixed.
- **Smoke check.** Waits for the deploy of the same commit, checks that
  `/api/health` reports exactly this commit, that the core pages respond and the
  security headers are set. No model, no costs.

**Nothing security-relevant becomes public.** The repository and its logs are
public, the dev revision is reachable. Both results leave the runner
only sealed (AES-256-GCM); the log says that a review took place and what it cost —
**no verdict, no count per severity**. Key patterns in the delta are redacted before
sending and reported as a critical finding, without the value.
Credential files are never read. OpenRouter gets `data_collection: deny` and
no fallback models.

**The agent can only read.** Token with `contents: read` and `actions: read`, no
stored checkout token, a model without tools. It does not comment, open
issues, push or deploy. Revoke with one variable:
`QA_REVIEW_ENABLED=false`.

**Costs capped.** At most $2.50 per review, estimated before the first call;
reasoning at `high` only for security, trust chain and CI; pure docs pushes
cost nothing. What does not fit the budget is listed in the report as "not reviewed".
In the dry run: a typical step estimated at $0.65–0.70, 16 commits at once
$2.33 with 26 named, unreviewed files.

**The loop.** `scripts/qa/await.mjs` fetches both results locally and unseals
them; a hook reminds of it after every push to `dev`. Every finding is checked
before code is changed; confirmed ones are fixed, refuted ones filed with evidence
(`scripts/qa/refute.mjs`, also sealed). At most three rounds per step,
`main` only after a clean round and only on Sonny's go. Working instructions in the
skill `qa-review-loop`, runbook in `docs/QA-REVIEW-LOOP.md`.

In passing: `/api/health` now also reports the revision's commit (`COMMIT_SHA` from
`deploy.yml`). The repository is public, the value reveals nothing new — but only
this way can the smoke check recognise a new revision when a fix is shipped
without a version bump.

Before its first real use, the dry run found a bug in the agent itself:
the check "is this commit an ancestor?" threw internally and was treated as
"no" — every delta would have shrunk to a single commit.

`tests/qa-review-guard.spec.ts`, 24 tests: workflow permissions and pinned actions,
secrets only as environment, seal with tamper detection, public line without
content, redaction, blocked credential files, a model without tools and fallbacks,
retry only on rate limit, cost cap and risk order, validation of the
workflow inputs, carry-over and refutation of findings, the post-push hook, the
commit in `/api/health`.

## [v2.9.11] — 2026-09-11

### A red scheduled run of Security CI now reaches the admin — by mail

Open since 10.09., decided on 11.09.: **mail to the admin.**

On 7 September the Monday run of Security CI went red on six high advisories
and stayed that way for three days, while a critical Next.js advisory was running in
production. A failed scheduled run reports to nobody,
and that week nobody pushed. The deploy gate would have caught it — on the
next deploy.

New job `alert-admin` in `security-ci.yml`: runs when a **scheduled** run
fails (push and PR runs do not — whoever pushed sees them anyway), after
all three gates and also when one of them is red (`always()`). It sends
a mail to the admin via Resend — the same key and sender as the weekly report —:
which job, what it means and what to do, link to the run.
No Firestore, no Google Cloud. If sending fails, the job turns red:
a warning that could not be delivered is exactly the silence this
is meant to end.

**No GitHub issue, on purpose:** the repository is public, and an issue
would announce the open window to everyone before the admin has read it. A
guard holds that the workflow opens no issues.

To check the whole path, Security CI now has a manual trigger
with `test_alert`; it sends a mail marked **[TEST]**.

`lib/security-alert-email.ts` (pure, tested), `scripts/send-security-alert.ts`,
`tests/security-alert-guard.spec.ts`: condition and order in the workflow, no
issues, context only via environment variables, mapping of the failed jobs,
content of the mail, TEST marking, and that nothing from the run context is
rendered as markup.

## [v2.9.10] — 2026-09-11

### The deploy now also waits for the typecheck — across the tests

Roadmap E16-F01-US02, release 2.9: **"Typecheck, tests and required
business approvals are set up as mandatory checks."**

`next build` checks the application's types and stops there. `tsc` never ran
over the tests, and two type errors in `tests/run-integrity-guard.spec.ts` had sat
unnoticed since 27 August — Playwright transpiles without checking. Fixed
(a generic signature for the test helper, the test checks the same as
before), and `npm run typecheck` — `tsc --noEmit` over the whole tsconfig — is
now a step in the `validate` job the deploy depends on: after the build,
so that the route types generated there are checked too, before the E2E tests.
`tests/quality-gate-guard.spec.ts` holds the script, order, dependency and the
coverage of the tests in the tsconfig.

The second part of the same story — a high finding blocks the deploy without an
approved, time-limited exception — was already met more strictly than required: the
deploy gate blocks on every high (`--audit-level=high`) and knows no
exception at all. The guard now holds that as well.

**Deliberately not in this release:** the notification on a red
scheduled run of Security CI. The obvious route — a job that opens a GitHub issue
— would announce in the public repository that a known
gap is currently open. That is a trade-off for Sonny (issue or mail to the admin),
not for the code.

## [v2.9.9] — 2026-09-11

### Passed only from a mapped result — and every other outcome with a name

Roadmap E07-F01, release 2.9, P0, from CR-12, CR-13 and CR-14. The acceptance criteria:
**"The regressions for TAP SKIP/TODO yield skipped and todo respectively."** and **"The
mock path writes simulated, a metadata call connectivity. Delivery
uses these types unchanged and must not produce an AUnit/compliance badge
from them."** Plus from the feature description: **"Stubs become visible."**

The finding register was half out of date here — `Simulated`, `Not run` and
the exact ID mapping already existed. Measured what was still open:

- **The live ABAP path wrote `Passed` for things that are not tests.** A
  "Live Tenant Validation Report" with six kinds of check — tenant
  reachable, login accepted, `$metadata` readable, EntitySets declared in the
  schema, one OData read per set, CSRF — all as `Passed`. None of them runs
  the generated code. The CSRF line was `Passed` as soon as the login worked,
  with the message "CSRF token can be fetched"; an x-csrf-token request was never
  made.
- **SKIP and TODO both became `Not run`** — honest about the pass, silent about the
  reason. A deliberately skipped test and one that nobody has written yet
  call for different actions.
- **The stubs were invisible.** The runner replaces every npm package the
  generated code imports with an empty proxy so that the module loads. A
  pass against a stubbed `express` says that the logic ran — not that it runs
  with express. Nothing said which packages were replaced.

**What holds now:** new states `Skipped`, `Todo`, `Connectivity`, `Error`.
The TAP reader lives in `lib/test-verdicts.ts` and is called directly by the tests.
The live checks write `Connectivity` or `Error`, CSRF is called
"Not checked", and the report is now called "Live Tenant *Connectivity* Report"
and says: "No test of the generated code was executed." `/api/run-tests` returns
`stubbedPackages`; the Testing page and the QA report name them. The
phase contract counts connectivity separately, never as a pass; Delivery names them as
"connectivity checks — not tests of the code".

`tests/test-verdicts-guard.spec.ts`: the reader over real TAP lines (pass,
failure with message, SKIP with reason, TODO), the live branch without a single
`Passed`, CSRF no longer derived from the login — and **a real run through
the sandbox**: a suite that imports `express`, with `test.skip` and
`test.todo`, against `/api/run-tests` → `stubbedPackages: ['express']`, TC_01
Passed, TC_02 Skipped, TC_03 Todo. `verdict-honesty-guard` now checks the parser
by calling it instead of searching for the right words.

**What remains:** verdicts are still not stored (see v2.9.5). A
signed, attributable test receipt is E07-F02 (3.0), as is a real ABAP Unit
run in the tenant.

## [v2.9.8] — 2026-09-11

### No savings forecast from numbers nobody entered

Roadmap E12-F01-US02, release 2.9, P0, triggered by CR-23. The acceptance criterion:
**"Without suitable cost inputs no savings forecast is shown. With
negative annual benefits there is no negative payback period, but
'no payback in the model'."** And from the feature description: score→euro and
the fixed 85 % improvement are removed **or clearly locked as a non-reliable
demonstration model**.

**The finding:** the Economics page opened with a developer day rate of
€900, a key-user rate of €650 and an investment of €15,000 — according to the
comment "standard enterprise SAP guidelines", nobody had supplied them — and
immediately showed annual savings, payback, ROI and a
five-year chart on that basis. The print button was called "Print Business Case", the footer
"Business Value Report", a badge claimed "Better Practice Mapped". The
inputs were sliders — and a slider cannot be empty.

**What holds now:**

- The three cost values are **empty number fields**. As long as one is missing, there is
  no savings, no payback, no ROI, no chart, but "No
  savings forecast yet — Missing: …". Deleting a value removes the forecast
  again.
- Above the forecast it says **what of it remains an assumption**: effort per 1,000 lines
  (2.5 / 0.8 / 1.8 / 0.6 days), 85 % less regression test effort, target score
  95 — none of it from observed effort. "A demonstration model, not a
  business case." The print button is called "Print Model Estimate", the printed
  footer says the same, the badge is called "Demonstration model".
- No payback: **"No payback in the model"**, not "Never" and never a
  negative number.
- "No baseline" remains a page of its own only for what no input can
  change (no signed score, score ≥ 95). An inventory that is too small is explained
  next to the inputs that would change it.

The safeguards from v2.8.6/v2.9.4 (guard before the division, finite
values, ROI at investment 0) are unchanged and still held in place
where they are. Nine unused imports of the page are removed; lint budget
671 → 662.

`tests/tco-cost-inputs-guard.spec.ts`: the cost values start empty, the guard
sits before the model, the wording, and rendered: no forecast without
values, none with two of three, forecast with all three, gone after
deleting a value.

**What remains:** CR-23 at its core. The coefficients are now marked
and locked as an assumption, not replaced. An options calculation on evidenced
costs is E12-F02 (2.10/2.11).

## [v2.9.7] — 2026-09-11

### A usage import you can believe — and one that is stored at all

Roadmap E03-F02, release 2.9, P1, triggered by CR-24. The acceptance criteria:
**"With locale de-DE, 05.04.2026 is stored as 5 April. The start of measurement
comes from declared capture, not from the first observed execution;
seasonality lying outside produces a warning."** and **"Negative
calls are quarantined. Empty counters stay unknown and are distinct
from measured zero values; ST03N and SCMON values are not added
without checking."**

Yesterday this item was missing from the 2.9 exit list. Reproduced today, and
worse than in the finding register: `05.04.2026` became **3 May**. `new Date()` reads
the string month first (4 May), and `toISOString()` converts
midnight to UTC and, in every time zone east of Greenwich, lands one
day earlier. A negative call count was taken over as a measurement. The
"measurement period" was the span between the first and last execution in the export —
and an export over six weeks turned a year-end closing program with
zero calls into a retirement candidate.

**Plus a find that weighs more than the roadmap items:** the import was
**never stored**. Every record from an export without a type column carried
`objectType: undefined`; the Firestore client rejects `undefined` as long as
`ignoreUndefinedProperties` is not set, and `getDb()` does not set it. The
rejection landed in the `catch` of the Analyze page and was only logged. Verified,
not assumed: passing the same data shape to the client yields
`Unsupported field value: undefined`. The report existed in a browser tab.

**What holds now:**

- **Date format is declared, not guessed.** Choice of de-DE / en-GB /
  en-US / ISO. ISO and SAP-internal (`YYYYMMDD`) are unambiguous and always work.
  Every other date is read in the declared order — assembled from its
  parts, without a date parser and without a time zone — or rejected with a reason:
  not declared, two-digit year, 31.02.
- **The monitoring window is declared.** The observed span is now called
  `observedFrom/observedTo` and stays separate from it; the old names
  `measuredFrom/To` are only carried by reports from before v2.9.7 and are read as
  observed. A window that would end before it begins, or in the
  future, is rejected before reading in.
- **A zero is evidence only over 13 months.** Without a declared window or
  with a shorter one, a measured zero becomes "Not seen (short window)",
  quadrant *unknown*, never *retire-candidate* — and the import warns, for a
  window without a year-end, explicitly with "no year-end". This also affects
  existing reports: none has a declared window, so none proposes
  a retirement on a zero any more.
- **Quarantine instead of silent take-over:** negative counters, dates that do not match the
  format or do not exist, dates after the window end or after the
  import day, rows without an object name. Each with row number and reason. An empty
  counter stays `null` (unknown), an unreadable one too — with a warning of how many.
- **Preview before take-over.** Declare → file → preview with all
  rejected rows → "Import N objects". A changed declaration re-reads
  immediately. Nothing is stored until confirmed.
- **No sum across sources.** A report has one source; the join
  refuses records from several instead of adding ST03N transaction steps and
  SCMON calls. The call now lives in the component, so that such a
  refusal lands in the SectionBoundary and does not take the whole Analyze page
  down with it.
- The report is free of `undefined` — it is stored.

`tests/usage-import-guard.spec.ts`: the acceptance criterion verbatim (`05.04.2026` → 5 April),
all formats and rejections, every quarantine rule with row and reason, window
against observed span, zero over 89 days (not retire) against zero over 426
days (retire), mixed sources, no `undefined`, and **the whole path in the
browser**: file without declared format → German date rejected → choose de-DE
→ re-read → nothing in Firestore before confirming → confirm → the
document says 5 April, 1234 calls, 89 days, one rejected row.
`tests/usage-unknown-guard.spec.ts` gets, for "a measured zero means
dormant", the window this statement now needs, and a counterpart without one.

Lint budget 672 → 671.

## [v2.9.6] — 2026-09-11

### After a source change nothing old counts as current any more

Roadmap E01-F01-US02, release 2.9, P0, the open remainder of CR-11 and the
2.9 part of CR-10. The acceptance criterion: **"If the source digest differs from the
analysis input used, Transformation and controlled
handover are blocked until reassessment. A client status change does not bypass the
block."**

**The finding:** a new analysis run with different source code left design, code,
tests, documentation and the architect sign-off standing — everything still read
as current. Transformation generated new code from the old design, and the
signed audit pack carried a sign-off that had been given for code
that was no longer the reviewed code. Exactly what the user story calls "do not
approve someone else's revision".

**How the block comes about — without a field the client can set:**

- `/api/runs/create` recognises that the source digest changes, and writes,
  **in the same batch** as the switch of the active run, the digests of design,
  code, tests, documentation and sign-off as they stood at that moment
  (`auditMetadata.sourceChange`). Nothing is deleted; it is the
  user's work.
- Everything that still carries the same digest afterwards has not been regenerated since
  and is therefore built for the previous source: **stale**. That is lifted only
  by regenerating it or giving the sign-off again — there is no flag
  to flip, and `auditMetadata` is not in the client allowlist. `status`
  plays no role anywhere.
- Tests are hashed **without their verdicts**: running a stale suite
  does not make it current.
- Independently of that, every view compares SHA-256 of the source code with the digest
  the run signed. The Analyze page never writes one without the
  other; a direct write could, and then the analysis itself is
  stale.

**Where it blocks:** Transformation does not generate from a stale design
or under a stale sign-off (not even the automatic first run when
the page opens). Documentation and Testing additionally do not generate from
stale code — otherwise a stale state could be laundered into a fresh-looking
artefact. Delivery blocks the bundle and the audit pack button.
Design allows "Continue to Transformation" only with a sign-off for the
current source. Stepper, rail and dashboard show `stale` in red, every
affected page says what has to be regenerated first.

**Server-side, because a button is not a block:** `/api/audit-pack/create`
answers with **409** and a machine-readable `blockers` list if

- the project's source code is not the one the run analysed
  (`source-changed`), or
- the sign-off the pack carries in its decision record was given for a previous
  source (`sign-off-stale`). For projects whose source changed
  *before* this release and that therefore have no entry, the run history
  determines since when the current source has been analysed,
  and the sign-off must come after that.

The Delivery bundle is created in the browser; there the page is the block, and
that is said here explicitly.

**No change to `firestore.rules`.** The rules are not deployed by CI;
a solution that needed new client fields would have required a manual
production deploy and broken the saving of designs if
the app had gone live first. The record is written with the Admin SDK.

`lib/artefact-digest.ts` is a synchronous SHA-256 without imports — the
phase contract runs during rendering, `crypto.subtle` can only do promises.
The server route that writes the record imports the same function;
producer and reader cannot hash differently.
`tests/source-change-guard.spec.ts` checks it against Node crypto (padding boundaries,
umlauts, emoji, 3,000 lines), the contract in all transitions and end-to-end
against the emulator: same source code → no entry; new source code → entry
with the right digests; the pack refuses the old sign-off, **even after
the client writes `status: 'completed'`** (with the owner's token, under the
real rules); the pages show the block, the buttons are off;
regenerating and signing off again lift it; source code written past the run
is rejected with `source-changed`.

**What this is not:** a tamper-proof revision chain. Whoever may
write a field can change its digest — what is protected against is the
reuse of something nobody has touched since the source change,
not against intent. Dependencies across stages (docs that, after a
code rerun, stem from the old code) are prevented here by blocking
generation on a stale state, not detected afterwards. The
immutable, parent-chained revision store is E01-F02 in 2.10.
Projects whose source changed before this release still show their old
artefacts in the views as current — only the sign-off is checked by the
server for them.

## [v2.9.5] — 2026-09-11

### Three views, three progress states — now one contract

Roadmap E01-F01, release 2.9, P0, triggered by CR-11 (and CR-16 in the same
box). The acceptance criterion for US01: **"Given generated but not executed
tests. When dashboard, stepper and Delivery load, then all show
'test draft present', not 'Testing complete'; Economics appears as the
sixth phase."**

Measured before, one project, three views:

- **Stepper:** Upload · Analyze · Design · Transformation · Testing ·
  Documentation · Delivery. Upload as a phase of its own, no Economics — the
  TCO page therefore showed itself as step 1, because it had no number of its own.
  And ticking off went by **position**: whoever opened Testing saw Design and
  Transformation as done, whether anything existed or not.
- **Rail:** Testing "done" as soon as test cases had been *generated*.
- **Dashboard:** read `status` — a field the client writes. When
  the tests are generated it is set to `'testing'`, the dashboard turned
  that into "Testing & QA (85%)". A project with `status: 'completed'` was
  "Completed (100%)", whatever was in it.

**And a find that was not in the roadmap:** the project tree in the dashboard
offered a downloadable "6. Quality Engineering Report". Without a stored
report — so for every project, since nothing stores one — it was
*invented*: "All test cases compiled and executed successfully", "Database
Persistency Sync: Verified via isolated PostgreSQL Mocking", a
Node runtime version. For a suite that had only been generated. It now counts
verdicts and says when there is no run.

**What holds now:** `lib/workflow-steps.ts` is the only place that knows the phases and
their state. Stepper, rail, dashboard and Delivery render it; no
view has a list or count of its own any more. Order per roadmap §7.0:
Analyze (with upload) · Design · Transformation · Documentation · Testing ·
**Economics** · Delivery. Every phase is `empty`, `partial` or `done`:

| Phase | `partial` means | `done` means |
|---|---|---|
| Analyze | source present, no signed run | signed run |
| Design | generated, target architecture not confirmed | confirmed (self-declaration) |
| Testing | **test draft** — generated, no run recorded; or partial/failed | every case `Passed` |
| Economics | model estimate from assumed coefficients | — not reachable in 2.9 |
| Delivery | review material only | code, docs and a passed test run recorded |

`status` is no longer read anywhere. The stepper shows state instead of position,
"Continue" in the dashboard goes to the first open phase (Economics excepted —
there is nothing to complete there in this release, and a continue button that
parks you there permanently is not one).

**Fixed in passing, because it was the same finding in another form:**

- The rail was rendered on Design, Transformation, Documentation and Delivery **only in the
  loading state** — it sat in the early `return` and nowhere else, and
  disappeared exactly when there was something to report.
- Delivery opened every project with "The transformation lifecycle is complete
  … ready for deployment". The QA status turned green for generated, never-run
  tests ("All artefacts present"). The tick of the test line also went green
  next to *simulated* cases — the condition checked for failures and
  missing verdicts, not for mocks.
- Two quality sub-lines claimed compliance with no check behind them
  ("Restricted clean ABAP syntax check compliant", "Strongly-typed model
  boundaries compliant") — CR-16.
- Navigation now follows the canonical order (Transformation →
  Documentation → Testing → Economics → Delivery). The product's own texts
  already called Documentation "stage 4"; only the buttons did not.
  The first-run guide and the welcome mail called Analyze "stage 2".

**What this means for real projects, explicitly:** the Testing page shows the
verdicts of a run on screen, **but does not store them**. That is why
Testing — and with it Delivery — stays `partial` in practice. That is the honest
statement about what is recorded; a run in a browser tab is not
evidence the next view can read. The solution is not a client write
of `Passed`, but a server-side test receipt (E07-F02).

`tests/workflow-phases-guard.spec.ts`: the contract as a unit (order,
test draft, simulation ≠ pass, `status` is ignored, Economics never done),
source guards (no position-driven stepper, every page renders rail and
stepper equally often, forward buttons in canonical order, no invented
report) and the acceptance criterion rendered: a project with a test draft and
`status: 'completed'`, dashboard, stepper and Delivery all show "Test draft",
Economics is the sixth circle.

**Still open from E01-F01:** US02 — after a source change, block Transformation and
controlled handover without a client status change bypassing the
block. Comes as a separate release.

## [v2.9.4] — 2026-09-10

### The division v2.8.6 missed because it stood one line above

Roadmap E12-F01, release 2.9, P0, triggered by CR-22 and CR-23. The acceptance for
US01 names the cases: **"The cases score 100, score 99,
zero investment and missing score deliver valid, clearly labelled results
or not computable. No chart receives non-finite numbers."**

v2.8.6 closed two unguarded divisions on this page — ROI at
investment 0, payback at savings 0. The third stood one line
above and stayed:

```
const factor = (100 - scoreAfter) / (100 - scoreBefore);
```

At score 100 the divisor is zero. `factor` becomes `Infinity`, and from there
it travels on: ROI `-Infinity`, "overhead reduction" `-Infinity`, and the
five-year chart gets `Infinity` for every modernised year. Exactly what
the acceptance rules out. The guards from v2.8.6 all sit *below*
this point and therefore do not catch it.

**The score 99 case is the nastier one.** Nothing divides by zero there, the
result is finite and therefore looks trustworthy: `factor` 5, the
model claims modernisation costs 3.35 times as much, ROI −749 %,
"overhead reduction" −235 %. A number that is obviously broken does
less damage than one that is wrong and looks like a statement.

Both have the same cause, and it is not a weakness in the arithmetic: `scoreAfter` is
a **fixed assumption of 95**. Code that is already at 95 or above has
nothing to improve in this model — so the model no longer calculates there
but declines. A negative business case that arises from an assumed
target value is not a statement about the customer's code but one about
the assumption.

The page now says so too, instead of claiming "no baseline", which would not
be true: the score is there after all. It states that the code already reaches the
assumed target value, that the model therefore has nothing to
price, and that this is a statement about the assumption.

On top of that a safety net, explicitly not as the primary defence: before
any number is returned, `everyFigureFinite` checks all figures
and every chart value. Every known path is secured above; this catches
the next input nobody thought of — because a chart is the one
place where a non-finite number is rendered without complaint.

`tests/tco-finite-guard.spec.ts` checks all four cases named by the acceptance
plus eight scores from 0 to 100 for finiteness, and additionally that the guard
stands in the source *before* the division it protects. The model lives inline in
the page component, so the test reproduces its arithmetic instead of
importing it — a real weakness, named in the test: whoever moves the model to
`lib/` takes this spec along.

**What this does not settle:** CR-23 at its core. The effort coefficients (2.5 /
0.8 / 1.8 / 0.6 days per 1,000 lines), the 85 % test automation assumption and
the target score 95 are still not derived from observed effort. The
alternatives calculation with evidenced costs is E12-F02 and belongs to 2.10.

## [v2.9.3] — 2026-09-10

### A custom Z table was no reason to leave the stack

Roadmap CR-04, P0, and named in the immediate measures as "the automatic CAP
obligation defused". The treatment there: **"No technology choice from a
single legacy symptom."**

A single write access to a custom Z table set the recommendation to
Side-by-Side (BTP) — in *both* operating models, with the rationale
"Custom tables and side-effect logging require decoupled Side-by-Side
architecture (CAP)". The same statement stood a second time in the architecture panel:
RAP was listed under `notFor` with "Custom Z-table persistence", CAP under
`bestFor` with "Custom data models (Z-tables)".

For Private Edition / RISE this is the wrong way round. Custom persistence in the
customer namespace is the textbook case for Developer Extensibility: the table
is a dictionary object, a RAP business object sits on top of it, and that runs
on-stack. A Z table is not a clean core violation — writing to *SAP*
tables is. So for the most common legacy pattern of all, the product
sent people off the stack to BTP, and in the same breath claimed that RAP
was not meant for exactly what RAP is meant for.

**The boundary runs along the operating model, not the construct** — and that is the
actual finding. In Public Edition the custom write remains a
Side-by-Side trigger, because the strict SaaS model there offers no on-stack path for
custom persistence. So the rule now reads `deploymentModel` instead of
the finding, and the two models reach different results for the same source.
Before, they did not: the deployment made no difference at all for this
construct.

The SAP boundary was clarified with the architect before the change, not inferred from the
code. That is deliberate: v2.9.0 showed what happens when a
derivation rule looks plausible and is still read wrongly.

The rationale now also says *why* — "writing to your own table is not a
clean core violation, writing to SAP's is" stands in the rationale and is held by a
test. A sentence that stops the next review from writing the same
finding again is cheaper than the discussion that would otherwise
follow.

What explicitly stays unchanged: RFC, BDC, Native SQL and
GUI file access still trigger Side-by-Side, in Private Edition too —
narrowing one rule must not silently narrow the neighbouring rules with it.
`tests/extensibility-route-guard.spec.ts` checks both, and also that panel
and router do not drift apart again: two surfaces for one rule, and
the reader believes the one they saw first.

The confidence value was affected as well — it counted custom writes as evidence for a
decision they no longer make in Private Edition. It now counts them only
where they were actually decisive.

## [v2.9.2] — 2026-09-10

### "No findings" and "nothing to find" are two different sentences

From the roadmap, CR-06, P0, and from the immediate measures in section 3.4:
**"Uncovered syntax must not come across as '100% clean'."** Plus the acceptance from
E03-F04-US02: "The UI shows the limited scope of the check; **no numeric score
may cover it up as fully checked.**"

Measured before the first change, against the seven bundled
starter examples:

| Example | Findings | what is actually in it |
|---|---|---|
| `Z_SALES_ORDER_CREATOR` | **0** | three local `CALL FUNCTION` (BAPIs) |
| `Z_EMPLOYEE_EXPENSE_VAL` | **0** | five `WRITE` list outputs |
| `Z_INVOICE_EXTRACTOR` | 2 | four file accesses (`OPEN DATASET`/`TRANSFER`), none of them among the findings |

The RFC detector only fires on `CALL FUNCTION ... DESTINATION`; a local
call — the classic BAPI — is looked at by no detector. For
file access there is no detector. And the classic UI detectors cover
Dynpro and classic ALV, not the plain `WRITE` list, which does not even exist in ABAP for
Cloud Development.

So whoever opens this product for the first time will very
likely land on a legacy example that the engine considers flawless.

**The fault today is not the missing detector but the silence.** The
detectors themselves are release 2.10 (E03-F04, size L, with a parser spike). What
can be corrected now is the statement: the engine says what it
passed over.

`lib/abap/coverage.ts` keeps a coverage report next to the findings —
explicitly **not** inside them. An unassessed construct is not a defect;
listing it as a finding would trade a false acquittal for a false
accusation. Recorded are file accesses, local function calls,
dynamic calls and field accesses, classic list output, macro definitions
and code generated at runtime — each with line anchor, statement and the
reason why the detector set cannot judge it.

Every hit runs through `tokenize()`, which removes comments and respects string and
backtick literals. So what the acceptance demands holds: "Comments,
string literals and `INSERT` into internal tables still produce no false
hits." Likewise excluded: `WRITE x TO y` is formatting and not
list output, and a `CALL FUNCTION` with `DESTINATION` stays with the
RFC detector instead of being counted twice.

On the analysis page the result stands next to the findings list — deliberately grey
and not red, because nobody is being accused of anything here. With full
coverage **nothing** appears: "We checked everything" is a claim with
its own burden of proof that this engine cannot carry.

`tests/coverage-honesty.spec.ts` holds the core, as a property
rather than a single case: for **each** of the seven examples, zero findings
are only permitted together with a stated scope of the check. An example that
neither finds anything nor says what it did not look at makes the suite
fail.

Tidied up along the way: `joinUsageWithEvidence` took the whole evidence report,
although it only reads the findings. That would have forced every caller to make up a
`coverage` — and the plausible value for a made-up one is "nothing
skipped", exactly the false acquittal this release removes.
The parameter is now as narrow as what is read.

## [v2.9.1] — 2026-09-10

### One variable that did two things — and checked neither

From the roadmap, release 2.9, P0: **E08-F01 — hard execution limit or
safe shutdown.** The acceptance for US02 is there verbatim: "With a
deactivated or unattested runner the API rejects new executions
server-side. **A frontend flag or merely setting an
egress environment variable does not activate it.**"

That is exactly what it did. `S4_TEST_RUNNER_EGRESS_ENFORCED=true` was the whole gate, and
it opened two at once:

1. It allowed the live run against S/4HANA — decrypted client credentials
   pass into the child process in it.
2. It **deleted `__netguard.mjs`** — the only defence that stops generated
   test code from reading the metadata endpoint `169.254.169.254` and
   thereby fetching the service account's runtime token.

The two effects cannot see each other at the call site. Whoever sets the variable
because they want to "switch on live mode" silently removes the network protection —
and for exactly the run that is the only one carrying real credentials. It was
never checked whether the egress rule the variable claims holds at all.

**A variable is a claim. Now it is measured.** Before every live run
the runtime attempts a TCP connection to the metadata endpoint and to a
public address. If either answers, egress is not restricted — the
run is rejected, stating what was reachable. The variable alone
grants nothing any more.

The details that carry the result: the public probe uses an
IP literal address, not a hostname — otherwise you test DNS along with it, and a container
without a resolver but with open egress would look closed. `ECONNREFUSED`
does **not** count as blocked: an RST comes from something that received the packet,
so the path exists and only the port is closed. And every unknown error
counts as reachable, so that it is not a surprise of all things that opens the gate.

**The network protection is no longer removed but narrowed.** It is now preloaded on
*every* run. An attested live run does not switch it off but
restricts TCP to the host suffixes from `S4_HOST_ALLOWLIST`: the
client call goes through, everything else keeps throwing. The metadata endpoint
is an IP literal address and matches no host suffix — so it stays unreachable
on this path too, and that is the property that matters.

Honest about the limits, because otherwise the same kind of error comes back: two
endpoints are a sample, not proof of a deny-by-default rule — a
policy that blocks exactly these two and allows a third would get through.
And on the narrowed path DNS stays available, because the client host must be
resolvable; DNS tunnelling is therefore possible again there. Both are stated in the
code at the place where it happens, not only here.

What changes for production today: nothing. The variable is not set in
`deploy.yml`, live mode was and stays off, the sandbox run
blocks network, DNS and `fetch` completely as before. What was closed was a
trap, not an ongoing incident — the path from "hardened" to "client credentials
in a process with open egress" was a single line long.

`tests/runner-egress-guard.spec.ts` holds both halves, and the executed one
is the one that counts: three of the thirteen tests actually set the variable to `true` on this
machine and check that the live run is rejected nonetheless
— because egress is open here and the claim is therefore false. A test that
only reads source code could be satisfied by a refactor that changes the
behaviour.

E08-F01-US01 — the real isolation: a dedicated one-off runner, minimal service account,
proven egress rules — stays open and is infrastructure work in GCP.

## [v2.9.0] — 2026-09-10

### Verifiable by someone who is not us

Three claims the product made that until now only we ourselves could
check. None of them was a calculation error — the numbers were right. What
was missing each time was the possibility for someone from outside to retrace it.

**"Anyone can check this" stood on the page while every signature was HMAC-SHA256
against `AUDIT_SIGNING_KEY`.** HMAC is symmetric: whoever can check a signature
can also forge it — the only place in the world that could verify an
audit pack was the server that issued it. An
auditor could not have checked anything without being handed the means to
forge. The sentence was true of nobody.

Ed25519 now runs **alongside** the HMAC, never in its place. Packs already
issued keep verifying as before; new ones carry both, over exactly
the same string, so that the two can never disagree about what was
signed. The public key sits unauthenticated at
`/.well-known/clean-core-io-signing.json`, and `scripts/verify-pack.mjs` checks
a pack against it — without an account, without a secret and without any call to us apart from
fetching that key. Every hash is re-derived from the ZIP instead of trusting the
manifest that describes it.

The private key is optional on purpose. Without `AUDIT_SIGNING_PRIVATE_KEY`
nothing changes: HMAC only, no `signatureEd25519` field, and the
well-known endpoint answers 503 and says so — instead of serving an empty
key set that an auditor could read as "revoked". So this ships
before any key exists, and on the day the secret is
set, packs carry the second signature without a code change.

The key ID is derived from the key — sixteen hex from SHA-256 over the
raw public bytes — in the issuer, in the verify route and in the CLI
alike. A configured ID can name the wrong key, and
an ID that lies about its key is worse than none at all. It also
makes rotation visible: a new key shows up as a new ID in every pack.

Checked end to end instead of in pieces: a real pack verifies (exit 0);
the same pack with one changed file names that file and fails
(exit 1); the same pack against a foreign key fails on the signature
and warns that the IDs diverge. The first version of the CLI also warned
about an ID conflict when the check was correct — a warning that fires on success
teaches people to ignore warnings.

**Two independent code reviews wrote the same priority-0 report in September,
and both were wrong.** SAP's classification file calls CL_BCS
a `classicAPI`, the page assigns D — so the release status supposedly overrules the
classification wrongly. The reasoning stood in the doc comment
directly above the function, which neither of the two reviews opened. Recalculated against the
artefacts instead of believing the comment: 21 of the 22 disputed
objects carry an explicit successor, one does not — exactly as it says there.
Level B means "acceptable where there is no A path"; where SAP names the A path,
B is the wrong answer.

So nothing changes in the grading. What the episode shows: the rule cannot be
read from its result. Two careful readers reconstructed it from the
source and both got it the wrong way round. An agent handed one of the
reviews would have reordered four lines and thereby silently regraded 22
objects.

So it is now visible. `GradedObject` carries `cloudView` and `classicView`
next to the grade — purely informative, they derive nothing. Object pages show a
two-column panel that names each of the two SAP files, what it says and what
that means; for the 22 objects where they contradict each other, a note explains
why the release status decides. And `/method/levels` publishes the
precedence rule in the order in which the code checks it, each branch with
its reason, the disputed case worked through on CL_BCS instead of asserted. The
page says explicitly that this is an interpretation of SAP's level definitions
and not a quote, and that one can see it differently — seeing it differently *by accident*
is what is supposed to stop here.

Every number there comes from `getLevelDerivationCensus()`, computed at build time over both
artefacts. Nothing is typed in, so that a catalog sync cannot make the page
silently wrong about its own data. Among them was a sentence
that arithmetic nearly made a lie: "21 of the 22 carry a successor"
stood as `total - 1` in the code — true today, and with the first data state that
moves, unchanged and wrong on the page.

**The analysis narrative now names lines of code — or says that it
cannot.** Both roadmaps of this product start with the same condition: a
business narrative without line reference is an LLM opinion, and in this market every consultancy
already sells LLM opinions. Both then schedule the implementation
for January 2027, behind two full releases, estimated at one to three
weeks. A precondition that is pushed back sixteen months is not one.

The estimate was expensively wrong in the cheap direction: `EvidenceFinding` has carried
`id`, `lineStart` and `lineEnd` since the engine was written. Everything
the model could point to was long there — what was missing was the contract. The model is
now asked to end every sentence about *this* program with `[F-017]` or
`[L380-412]`, and every reference is checked instead of believed: a
finding ID must exist in the evidence report passed in, a line range must fall
within the file. General advice stays unevidenced on purpose, and that is
a valid result.

The difference the parser holds is the one between *missing* and *made up*.
A sentence without evidence is honestly unevidenced; a sentence with `[F-999]` puts on show
evidence it does not have. Merging both into "not anchored"
would hide the serious case in the harmless one — they are counted separately,
coloured differently, and the made-up reference is named on screen.

Nothing is deleted. An unevidenced sentence stays, grey — removing it
would leave prose that looks fully evidenced and whose gaps are
invisible, that is, exactly the failure the anchors exist against. And the rate is
`null` over zero sentences, not 100 %. This kind of number is the one that has to
be got out of this codebase again and again.

The prompt instruction stands next to the parser that enforces it, and a test
sends every example from the instruction through the validator: a prompt whose
own examples the validator rejects trains every successor to
loosen the validator.

**And the key would never have arrived in production.** `.env.example`
documents `AUDIT_SIGNING_PRIVATE_KEY`, `.github/workflows/deploy.yml` did not
pass it through. The sentence "on the day the secret is set,
packs carry the second signature without a code change" would thus have been
wrong for exactly the environment where it counts: Cloud Run would never have seen the variable, the
well-known endpoint would have answered 503 permanently, and nobody could have
checked anything. It is now passed through — and deliberately *not* added to "Assert
Production Secrets Configured", because it stays optional. A feature
that needs a workflow change to activate is not optional but
unreachable.

### A critical RCE that had been in production for days

The push to `dev` turned both security gates red — and rightly so.
None of it came from this release: it changed nothing in the
dependencies. These are new advisories, and Security CI had therefore already been red since
07.09. without a push making that visible.

**Next.js itself, critical, two unauthenticated RCEs**
(`GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4`). The vulnerable range extends
up to 15.5.23, pinned was 15.5.22 — right in the middle, and with it what
was running on clean-core.io. One of the two affects only Windows hosts and is no concern of
Cloud Run; the other sits in the image optimization API and is.
Now 15.5.25 from the backport line: a patch step within 15.5, no
jump to 16. `npm audit fix --force` would have *downgraded* to 15.5.25 "outside the
stated range" — the same version, but sold as a downgrade,
because the pin was exact.

**And twice the same mistake as with `fast-uri` in v2.8.6: an override whose
lower bound sits exactly on the hole.** `sharp` stood at `^0.35.3`, vulnerable
is `<0.35.4` — the bound held the hole in place instead of excluding it, and
`^` alone raises nothing that already satisfies the range. Likewise `js-yaml` under
`firebase-tools` at `^3.15.1` with an advisory for `>=3.0.0 <3.15.2`. Both
floors raised, both now resolve to the patched version. That the same
form turns up for the third time is the actual finding: a caret over a
vulnerable version reads like maintenance and is not.

The lockfile was generated with the matching toolchain (`node@22` + `npm@11`,
`--package-lock-only`) and cross-checked with `npm ci --dry-run`, because npm 10.5
under local Node 20 silently drops nested override entries
and the deploy then only dies in Cloud Build. Both nested
`js-yaml` entries are demonstrably preserved. Both gates now run green:
`npm audit --omit=dev --audit-level=high` without findings, `audit-ci` against the empty
allowlist passed. The seven remaining moderates (`mermaid`, `qs`/`express`,
`protobufjs`) are below the threshold and stay open.

### Three things this release would not have let through

**The lint gate stood at 679 against a maximum of 677.** Two new warnings
from v2.8.6, both `(r: any)` in the Testing page — superfluous, because
`testResults` has long been `TestCase[]`. Without the annotation TypeScript checks the
status comparisons against the union v2.8.6 had only just introduced: a
`'passed'` with a lower-case p now fails the build instead of silently counting zero.
Six warnings gone, now at 673, and the ceiling pulled down to 673 — a
limit above the actual count allows exactly the regression it was
set against.

**`/method/levels` was in the sitemap and missing from the content date map.**
`contentDate()` falls back to the release date for unknown routes — so the
new page would have got its `lastmod` from the deploy, which v2.7.2 had just
stopped.

**And the map itself had not been regenerated since v2.7.2.** On rebuild
22 more routes move to 31.08.2026: that is the day v2.7.2
rolled `withTwitterCard()` out across all pages. The file is generated and
says so, so adding to it by hand was not an option — and a `lastmod`
claiming `/about` last changed on 07.07. was already
wrong before.

## [v2.8.6] — 2026-09-08

### Standing still

No new feature. Four places where the product claimed something that
the code does not back — and a licence without which a fifth claim was
legally empty.

**The testing step said "verified" about tests that never ran.** Two
paths led there. A TAP line with the directive `# SKIP` or `# TODO`
begins with `ok` according to the protocol — that is the notation for "was not
executed", not for "passed" — and a parser that only looks at the first word
read it as passed. And a test case about which the runner
reported nothing at all inherited its status from the exit code of the
overall run, with the message "Verified by Node.js Test Runner". Both carried through
to the Delivery page, where "Clean AUnit local test
doubles verified" stood next to a green tick — driven solely by the number of *generated*
test cases.

There are now two more states, `Not run` and `Simulated`, and only `Passed`
counts as verified. The ABAP mock, which set every selected test to `Passed`
and wrote `[SIMULATED]` into the message, now sets the status
the message already stated. The rate in the QA dashboard is computed over the tests with
a verdict instead of over all of them, because a pass rate over tests that never ran is no
rate, and tests without a verdict get their own colour instead of the red for
failure — "we don't know" is neither a passed nor a failed
check.

**The TCO view could show `Infinity`.** Two divisions without a guard,
both reachable from the page's sliders: an investment of 0 made the
ROI infinite, and code that already reaches the target value saves nothing per year
and made the payback infinite. Both now return "no value" with a
line that says why.

**The deploy gate was looser than the security CI.** The deploy only blocked
on `critical`, the security CI on `high` — two gates with two thresholds,
which makes the stricter one non-binding. On 7 September the security CI
was red because of six high advisories in `fast-uri` and `browserslist`, and a deploy
of the same commit would have gone through. One threshold now, and it is the
stricter one.

**And a `LICENSE`.** There was none. Code without a licence file is "all rights
reserved", whatever a roadmap promises — the self-hosting
promise could not be honoured legally. The repository is now under
Apache-2.0, with `NOTICE` for the synchronised SAP artefacts and the
nominative trademark use. The README previously said, correctly, "proprietary — all
rights reserved"; it now says what applies.

### The survey questioned mail gateways, not people

Twelve of the thirteen answers to the campaign of 2 September came about
between 07:13:39 and 07:15:01 — within the eighty-three seconds the
sending to thirty-seven recipients took. Four to twelve seconds
between link fetch and answer, each only to the question that was in the mail as a link,
none to the questions that live on the page.

The defence was built and aimed at the wrong half. The vote endpoint is
deliberately POST, on the reasoning that a gateway does not execute scripts. Defender
Safe Links, Proofpoint and Mimecast open every link in a headless browser
and execute the JavaScript to detect phishing — and the page submitted
the answer from the mail in a `useEffect` on mount, without any
interaction.

The effect is gone. The tapped answer arrives as a preselection, visible as
such and not counted until a real press confirms it; every press is
checked for `isTrusted`, which is false for an event triggered by script.
The mail question is now rendered on the page — before, it could only be answered
via the auto-POST. Count and review read from their own
copy of what the server actually has, so that the page cannot show anything as
saved before it is. The invitation said "One
tap records it" twice; that is no longer true like that and no longer stands there either.

Delivery was never the problem: all 55 events in the webhook are at
`email.delivered`, no bounce, no complaint. What the survey was meant to settle —
inbox or spam — is still open, because it asks over the same channel
it measures.

### Dependencies

Six high advisories that had kept the security CI red since 7 September.
`fast-uri` was already in `overrides`, pinned to `^3.1.5` — and `3.0.0–3.1.5`
is exactly the vulnerable range, the override held the hole in place. Floor now
at `^3.1.6`, `browserslist` newly at `^4.28.7`; both parent packages accepted
the patched versions anyway, no major bump was needed.

Plus `dompurify` from 3.4.11 to 3.4.15. Not a high and not a gate blocker, but it
is the XSS defence behind `lib/sanitize-html.ts`, and one of the two holes
leaves a detached subtree executable.

## [v2.8.5] — 2026-09-01

### The survey, one day before sending

Four changes, and none of them is a defect. Three are design mistakes that
only show once a person uses the thing, and one is a limit at the
provider that nobody would have seen, because it silently swallows recipients.

**The invitation now says thank you first.** It began with "four candidates
are up for a vote" — factually correct, and for a mail that asks
a favour, a cold first line. Now a thank-you stands before it, and one that
holds for all 36 recipients: *"Thank you for using Clean-Core.io — and if you
have not got round to it yet, thank you for signing up anyway."* The second
half is not politeness but accuracy. Part of this list has
never started an analysis — that is the reason the survey exists at
all — and a blanket "thanks for using it" would be demonstrably false for exactly these
readers.

**The only button on the page looked like "Submit".** Every question saves
on tap, without a button and without a page change. Only the free-text field cannot
do that, because typed text has to be sent on purpose — so it has a
button. That button carried the product's dark primary style, stood at the foot of a
questionnaire and was greyed out as long as nothing was typed. That is the
visual language of "this is where the form gets submitted", and whoever had answered everything
saw a dead submit button and concluded that nothing had arrived.

Three changes, each with one job:

1. **Secondary style instead of primary style.** White with a border. With that it stops
   being the page's closing action.
2. **The button sits in the box.** Text field and button share one outline,
   so it is visible what it belongs to. Label "Send this note" instead of "Send
   it", and above it a line that spells it out: *"Everything above is already
   saved — this box is the only thing on the page with a button."*
3. **The greyed-out state is no longer silent.** Next to the button there is always
   one of the four truths: *nothing typed, so nothing to send — your
   answers above are saved anyway* · *not sent yet* · *sent,
   thank you* · *that went wrong*. A greyed-out button that explains itself is
   not the same thing as one that does not.

The condition behind it is also new and more honest: the button is active exactly
when the field holds something that is not yet on the server — `comment !==
sentComment`. Before, it was tied to "field not empty", which stayed
active after saving and could not tell a correction apart.

**The page claimed something about readers who had not tapped anything.** "Your
answer is saved" is only true for someone who hit an answer area in the mail.
Whoever opens the bare link — a forward, a second visit, the
text part — got a first sentence about themselves that had not happened.
The line now depends on whether `?q=…&a=…` arrived at all.

### The sending outran Resend

Resend allows two requests per second. The loop waited for one response and
immediately started the next, which from a CI runner is four to eight per second.
Some of the 36 messages would have come back with `429` — and the old
loop wrote `FAILED` and moved on.

What that means: these people are never asked, the workflow still reports
success, and the survey closes after seven days, before the next scheduled
run could collect them. The same kind of error as yesterday's `localhost` links —
loud in its effect, silent in the log.

- **700 ms pause** between messages. With 36 recipients that costs 25
  seconds.
- **Three attempts** with growing wait time on `429` and `5xx`. Any other
  `4xx` is the message itself and is not retried.
- **`process.exitCode = 1`** as soon as anyone is left over. A run in which
  recipients are missing must not be green.

### Deliverability, final check

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

Two gaps were still open, both closed:

**The invitation gave no postal address.** `lib/welcome-email.ts` has carried it
since the first sending, this template did not — and that is the wrong way round: the
welcome mail is transactional, the survey is bulk mail, and the rule is written for
bulk mail. A named person at a real address is
also one of the few things a filter can credit to such a young
domain.

**The text part left out the unsubscribe.** That made it worse than the
HTML part, of all things for the reader most likely to see it — and a filter
that compares both parts has no reason to read the discrepancy kindly.
Address and unsubscribe link are now in both parts.

**Not touched, on purpose:** the DKIM key has 1024 bit; 2048 would be
somewhat stronger, but a key rotation on the eve of a sending is a
DNS change that could be in the middle of propagating tomorrow at 09:00. After,
not before.

### Six new guards

`tests/survey-guard.spec.ts` (28 checks, all green): address in both
parts, unsubscribe link in both parts, RFC 8058 headers in the send script, pause
between messages, retry instead of discard on `429`, red run on
lost recipients — and for the page: the note button does not carry
`bg-gray-950`, and a text exists for each of its states.

## [v2.8.4] — 2026-08-31

### All three test mails contained links to `localhost:3000`

That is why voting did not work. The mail looked right, Resend accepted it,
the workflow reported success — and every answer surface pointed at the
reader's own machine.

**Why nobody saw it.** `APP_BASE_URL` in `lib/constants.ts` reads
`NEXT_PUBLIC_APP_URL` and otherwise falls back to `http://localhost:3000`. The
deploy sets the variable for the running application, which is why welcome
and admin mails from Cloud Run are fine. A workflow step inherits none of that,
and `survey-send.yml` did not set it.

It was not the check page: single choice, multiple choice, progress and
overview worked flawlessly in a real browser against production —
I had checked the *page* and never the *address in the mail*.

**On Wednesday it would have hit all 36 recipients**, and silently: the
sending reports success in both cases. A survey with dead links is worse
than none — it uses up the one opportunity to ask.

### Three repairs, not one

1. **`survey-send.yml` sets `NEXT_PUBLIC_APP_URL`.** Fixes the case.
2. **`scripts/send-survey.ts` refuses to run** if the base URL does not
   start with `https://`. That is the safeguard that counts: it applies no matter which
   workflow forgets the variable in future and no matter where the script runs from.
3. **Two guards** in `tests/survey-guard.spec.ts` — one checks that the workflow
   passes a real base URL through, one that the refusal is in the script.

**The lesson, and it is an uncomfortable one:** nothing was wrong with the code. The error lived
in the gap between a module's default value and a workflow's
environment — exactly where no unit test looks. All checks in this session
aimed at the rendered page and at the arithmetic; none asked whether the
address in the message leads anywhere at all.

## [v2.8.3] — 2026-08-31

### The first real use found two errors

Both are design errors, not defects — API and storage answered with `200` the
whole time. That is exactly why they would not have been noticed without a human at the mail.

**The page reported completion before it asked anything.** Heading "Thank you
— that is recorded", below it a green confirmation box, and only below that the
questions. That is the visual language of an end state: on the phone the
visible area ends behind the box, the three questions below look like an appendix,
and someone who has just answered concludes they are done. The first person
who used it said exactly that.

The page now leads with what is outstanding instead of what is done:
heading **"The ballot for version 3.0"**, and in place of the
confirmation box a **progress bar** — "1 of 4 answered", four
segments, and the saved state as a small line next to it. A count
of what is missing cannot be mistaken for an end.

**And nowhere did the user see what they had answered overall.** The selection
was marked, but the only proof of a vote was a green border
somewhere further up. "Did that count?" is a fair question when you
tap something that navigates nowhere.

At the end of the page there is now **"Your answers"**: every question with your own answer,
multiple choice with all ticks, unanswered ones as "not answered" instead of as a
gap.

### The invitation, halved

151 words instead of a good twice that. Out are the paragraph about the groundwork
of recent months, the explanation of why guessing would be bad, and the
"What happens with it" box. What remains says the same in four blocks: the
heading, one sentence on the situation, the question with three surfaces, and the way to the first
run. The rest is one line about the deadline and the option to reply.

The reason for the brevity is the same as for everything else here: a mail
that asks for a minute of attention must not be three minutes long.

## [v2.8.2] — 2026-08-31

### The invitation now says where this is heading

Three beats instead of two, and the third was missing:

1. **On the way to 3.0.** The past months went into the parts that
   nobody asks for by name — evidence chain, object catalog, GDPR deletion cascade, a
   long list of corrections. This foundation stands. The next major version
   is a question of direction, not of repair.
2. **The vote has a say.** Four candidates, all documented and unbuilt. "I
   know what each of them costs. I do not know which one you would use."
3. **And a nudge to actually use it.** The part that was missing so far.

### Where the uncomfortable fact stands

That quite a few accounts have never started an analysis is back in the mail —
but **two thirds down, next to a link and a time estimate**, not in the
opening paragraph as a confession.

The difference is not cosmetic. "Most of you have never used this"
is a fact about the operator dressed as a fact about the reader, and
it asks for participation while declaring that participation is rare. In the
place where it now stands, the same sentence does work: it names the reader's
likely situation, names the real reason — getting started looked like
preparation — and answers it with two minutes and a button instead of with
an argument.

Concretely: a box "If you have not run one yet, it is shorter than it looks", with
the path via the ready-made ABAP examples on the dashboard — full
evidence report, RAP or CAP design and signed audit pack in about two
minutes, without an SAP connection and without your own code. Plus the pointer to
`/first-run` for those who would rather read first.

The subject is now **"On the way to v3.0 — your vote, and a two-minute first
run"**: both reasons to open it are in it, and neither of them is a request.

The ballot question is no longer "which of these would you use" but
**"Which of these should version 3.0 bring?"** — the same question, but with the
consequence visible next to it.

## [v2.8.1] — 2026-08-31

### The tone of the invitation, and a question that gives something back

**What is out.** The invitation explained in its second paragraph that most accounts
had never started an analysis. That is a fact about the operator, not
about the reader — and putting it before someone whose participation you are asking for buys
nothing. The questions still measure it just as well. The reasoning under the
delivery question ("nobody here knows, there are no events for those mails") has also
given way to a line that asks the same without spreading out one's own
blind spot.

**What has been added:** a fourth question, and it is the only one in which the
respondents get something instead of only giving. Four things that are on the list
and not built, as multiple choice — the vote decides the order.

| Idea | Documented in |
|---|---|
| German version of interface and docs | `docs/CONCEPT-DE-LOCALIZATION.md`, backlog S-05 |
| Import ATC results | `docs/CLEAN_CORE_ENRICHMENT_CONCEPT.md` §3 |
| Model choice: Claude alongside Gemini, own key | `docs/ROADMAP-2.0.md` |
| The before-after comparison on the phone | `docs/BACKLOG.md`, round 2 |

**And a guard for it.** `tests/survey-guard.spec.ts` checks that **every** option
on the ballot is documented in one of the concept or backlog documents. A
survey that offers features nobody has thought about is a survey
whose winner cannot be built — and a promise to 36 people that
is silently not kept.

**Multiple choice means: count people, not ticks.** Someone who ticks three things
is one answer and three counts. Dividing by the ticks would make every share
shrink the more people tick — and the one person who picks only one
would appear at 25 % instead of 50 % of respondents. The shares therefore add up
to more than 100, and the report **says so**, instead of letting the reader take a
bar of 180 % for an error.

The box is square where several answers are allowed, and round where exactly one
applies. That is the only signal a reader has before tapping.

## [v2.8.0] — 2026-08-31

### The activation survey

It was promised to the thirty accounts from the community activation "in fourteen
days", so by 02.09. It goes out on **Wednesday, 09:00 Berlin time** and
runs for a week.

**What it is meant to find out**, and why it is exactly these three questions: most
accounts here have never started an analysis, and there are two
completely different explanations for that — a usage problem or a delivery problem.
Those are two separate work sites, and so far it is unknown which one it is.

| Question | Where | What for |
|---|---|---|
| Have you started an analysis yet? | in the mail | the base number |
| What would help you most? | on the page | the question that changes something |
| Did the welcome mail ever arrive? | on the page | the most expensive open question about the platform |

Question three costs one line and has been unanswerable since the community activation,
because those thirty mails predate the Resend webhook and there are no
delivery events for them and never will be.

### "Vote directly in the mail" — what of it works and what does not

**There is no way to capture an answer from inside an e-mail
without the reader leaving it.** Mail programs do not run code. The
only exception, AMP for Email, requires sender registration with Google
and works only in Gmail — the wrong half of an SAP audience.

What is built is therefore the closest thing to it: **one tap, and that is all.**
No form, no login, nothing to type. The answer is captured before the
page has finished drawing. The two follow-up questions are on that very page,
again one tap per answer — where there is a reader who is already taking part anyway.

**And a trap that would have made the numbers worthless:** corporate mail gateways
fetch every link in a message before a human sees it. If a tap
on "Not yet" were a GET that writes a vote, the result would be a
census among security appliances. Capture is therefore done by a **POST** that
the page itself sends — a gateway does not run scripts and never gets that
far. The fetch itself is still noted: "link fetched, never answered"
describes a mail that reached an organisation and got stuck at its edge,
and that is exactly one of the two explanations that need to be
separated.

### The daily interim result

Once a day, 09:00 Berlin time, while the survey is running. **The charts
are tables** — every mail program renders a `<td>` with a percentage width and
background colour, almost none loads an external image unasked, and a chart
nobody sees is worse than a number.

What the report does not do: a question nobody has answered shows a
zero and the number of invitees — no percentages over a denominator that was
shrunk until it looked healthy. The heading says "3 of 36",
never "8 %", as long as the numbers are too small to carry a percentage. That
is the same rule that `no-fabricated-figures.spec.ts` enforces in the product, and
a survey about whether the product is used is the last place to start
rounding.

It stays silent before the invitation is out, and after a final result one
day after closing. A cron that sends "0 of 0" every morning trains its
reader to delete it unread — and the one morning on which it
matters is the one on which it gets deleted unread.

### The safeguard

`tests/survey-guard.spec.ts`, fourteen checks, against the four ways in which
a survey silently delivers a wrong result:

- **A forgeable link.** Tampered payloads, expired and nonsensical tokens
  are rejected; the signature carries its own namespace and can never pass as an
  approval token.
- **A question that suggests its answer.** All answer surfaces of the mail are
  checked for identical style. One of them as a dark primary button would be a way
  of asking the question and supplying the answer along with it.
- **Arithmetic that converts silence into agreement.** No answers, no
  percent signs; a gateway fetch is not a vote; an unanswered question
  does not borrow the answers of the others.
- **A mail that falls apart on the phone.** Both messages are rendered
  and measured at 320 pixels, and the bars must fit in their chart.

Sending and interim report run via two workflows whose slot selection depends on the
triggering cron and not on the wall clock — the same construction that
repaired the weekly report this morning.

## [v2.7.3] — 2026-08-31

### N-02: the two rows where the page was wrong against itself

The comparison table listed two capabilities as **✕ Not Available** at SAP:

| Row | Claim up to v2.7.2 |
|---|---|
| Sandbox Verification (BYOT) | "Requires separate manual testing frameworks." |
| Business Process Blueprinting | "No process flow visualization available." |

Both are wrong, and verifiably so. SAP ships ABAP Unit and the CDS Test
Double Framework; SAP provides Signavio and Cloud ALM for process modelling.
The same page writes two sections further on that its own BPMN output is **handed over to
Signavio** — and claims right next to it that SAP has no process visualisation.

The other four rows have long used the graded scale (`~`, `–`) correctly. Only
these two had stayed binary, and they were the only place where a
page whose whole argument is "evidenced, not claimed" itself claimed
without evidence. An SAP architect needs less than a minute for that.

Both are now at `~` and name what the tool actually adds
instead of inventing a gap — which is the stronger statement:

- **Sandbox Verification:** "ABAP Unit and the CDS Test Double Framework are on
  board; the test environment is assembled by hand."
- **Business Process Blueprinting:** "Not in the ATC/ADT core scope — covered by
  SAP Signavio and SAP Cloud ALM under their own licences." And next to it, what
  Clean-Core.io contributes: the BPMN 2.0 draft directly from the code analysis, handed
  over to Signavio.

That closes the last open point from finding v3, which the reviewer had carried as
priority 1 across three versions.

### The weekly report was never sent on 28.08.

GitHub started the scheduled run **four hours late** (14:01 instead of 10:00
UTC). The guard that is meant to decide which of the two DST slots is the right
one asked "is it 12 o'clock in Berlin now?" — and thereby accidentally
also answered "did GitHub start on time?". Both runs discarded themselves, **both
reported `success`**, and nothing said so.

On 21.08. it only ran because the delay was eight minutes. GitHub
explicitly does not guarantee punctual starts; so the check depended from the start on
something that is not guaranteed.

The slot is now determined via `github.event.schedule` — the triggering
cron expression, which does not shift — combined with the UTC offset for the
season. No matter how late GitHub is, exactly one of the two runs goes through.
The report of 28.08. was caught up manually on 31.08.

### The fourth overflow cause, and a guard that was only right in my time zone

The overflow guard from v2.7.1 found on the Linux runner what fit on Windows:
`PilotWarningBanner` puts three links, two separators, a dash and the
dismiss button into **one row with `shrink-0` and without `flex-wrap`** — 332px
of rigid content in a 320px window. Linux renders the text wider. That is the
fourth cause of a symptom of which the backlog knew one, and the reason
why the guard measures the rendered page in CI instead of relying on a screenshot.

And an error in this morning's sitemap guard: it compared timestamps against
`new Date(APP_RELEASE_DATE)`, which yields **local** midnight, while a
content date is built as `…T00:00:00Z`. On UTC+2 these are different moments, on the
UTC runner the same — the guard reported the start page as dateless, on the day
its content changed. It now reads the `on('<route>')` calls from
`app/sitemap.ts` and checks the keys. Route keys collide with no
time zone.

## [v2.7.2] — 2026-08-31

### V9 — the published fallback key is gone

In three production routes there was `process.env.AUDIT_SIGNING_KEY` with an `||` and
a fixed constant behind it. The repo is public, so the constant was
too.

The guard in front of it required `NODE_ENV === 'production'` **and** a
switched-off emulator flag before it refused to run without a real key.
Everything that slipped past either half — a
preview build, a container without `NODE_ENV` set, a revision outside
the pipeline — signed runs and audit packs with a string that anyone can
look up. And `/api/export/verify` verified against the same fallback: the
page whose only purpose is to say "this pack is genuine" would have said so
about a forged one.

**Why it survived five releases**, and that is the instructive part: two
tests in `audit-compliance-v181.spec.ts` signed their test data with the same
constant. Deleting it turned the suite red, and the suite is a mandatory stage before
every deploy. The note in the backlog concluded from this that CI needed its own
GitHub secret. It does not — the test key signs test data against a
test server and protects nothing. `playwright.config.ts` had long set exactly this pattern
for `PILOT_APPROVAL_SECRET` and `MFA_BACKUP_CODE_PEPPER`;
only the third line was missing.

Now:

- `lib/audit-signing-key.ts` is the only place that reads the key.
- No fallback, in **any** environment. If the key is missing, the three
  routes answer with 500 — production, preview, CI and laptop alike.
- `tests/signing-key-guard.spec.ts` fires if the constant comes back,
  if a route reads directly from `process.env` again, if an
  `isProduction` loophole appears — and checks on the running server that a
  pack forged with the old key comes back as invalid.
- `.env.example` now says that the key is needed everywhere.

**Not rotated, and on purpose.** The production key is a real
secret, `/api/health` confirms it on production and dev, and a change would
invalidate every run signature already issued and every audit pack delivered.
The constant was the problem, not the key.

### Finding v3: the evidenced points

External SEO/GEO review of 28.08. on v2.7.0. Five findings re-checked and
worked off; two of its open questions are answered from the inside.

**S-08 — the sitemap dated deploys, not content.** `app/sitemap.ts` stamped
`lastModified: new Date()` on around thirty URLs. The comment next to it defended
this as a "real freshness signal"; it was the opposite. With three releases in four
days, every page reported daily change, the legal texts from July
included. Google recognises the pattern and then devalues `lastmod`
**domain-wide** — so the damage hits precisely the new pages that need the signal.

`lib/content-dates.ts` now holds per route the date on which its content
was actually last changed, generated from the Git history of the files that
render the route (`npm run sync:content-dates`). **Twelve different dates across
two months**, each of them true. `tests/sitemap-guard.spec.ts` forbids any
timestamp after the release — which a build stamp would always be.

**S-09 — the Twitter card fell back to the domain default.** The finding found it
on `/knowledge`; measured, it is 21 pages. 22 pages set `openGraph`, exactly
one set `twitter`. Anyone who shared the clean core explainer got the heading
of the start page. `lib/page-metadata.ts` mirrors what the page has already
declared; `tests/social-card-guard.spec.ts` compares the **rendered**
tags, because a helper function is a convenience and not a guarantee.

**K-05 — two names for the same SAP hub.** SAP renamed the API Business Hub to
Business Accelerator Hub in 2023. The start page had the discontinued
name twice and the current one once — in the same section. Unified,
also in the shipped Markdown artefacts and in the product interface. The
two remaining occurrences in `lib/abap/` are source citations and still name the
source as it was called at the time.

**K-06 — the confidence badge took back the prose.** The BSEG case in the showroom
is clearly more cautious in its running text than the VBAK case — "candidate", and
currency, authorisations and client handling explicitly named as open.
Below it stood the same green badge as for the clean case. There are now three
levels instead of two: green means resolved, blue means candidate, yellow means the
engine refused to guess.

**K-03 — the VBAK discrepancy is called by its name.** The explanatory sentence under
the object list was correct and abstract. It now names the case: `VBAK` appears
there as `I_SALESDOCUMENT`, in the showroom as `I_SalesOrder`, and why.

**Two of the reviewer's open questions, answered from the inside:** `/catalog/[object]` is
statically pre-rendered (`generateStaticParams`, ISR 24h, its own
`catalog-sitemap.xml`) — so the individual URLs per object exist, which the reviewer
could not see from outside. And `llms.txt` has been at
`app/llms.txt/route.ts` since 26.08.

**Not touched, because it is positioning and not a correction:** N-02, the
two ✕ rows of the comparison table. And G-06, the author profile — the
`Person` schema with `sameAs` is already in `app/page.tsx`, what is missing is the
professional history on `/about`, and only its author can write that.

## [v2.7.1] — 2026-08-31

### The lint gate never checked what it was built for

`eslint.config.mjs` imported three plugins and enabled the rules of exactly
one. `@typescript-eslint` and `eslint-plugin-react-hooks` were registered and
switched on for nothing — the `rules` block spread only the
Next presets. `npm run lint` is a mandatory stage of the deploy pipeline.
With every release it thus reported a green tick for a check that
did not take place.

Switching it on brings **706 problems** to light. They are sorted, not
muted:

| Class | Count | Treatment |
|---|---|---|
| `no-explicit-any` | 365 | parked as a warning |
| `no-unused-vars` | 274 | parked as a warning |
| `set-state-in-effect` | 25 | parked as a warning |
| `no-require-imports` | 24 | switched off in `scripts/` and `tests/`, justified individually in `lib/` |
| React Hooks correctness | 13 | fixed |
| other TypeScript | 5 | fixed |

Errors are now at **zero**. The 677 remaining warnings are pinned with
`eslint . --max-warnings 677` — a number on record that can get smaller
and not bigger.

### What had passed through the green gate

**A click without effect.** In `testing/page.tsx`, after the access request, there was
`profile.s4TenantAccessRequested = true`, with the comment "Force profile update
trigger client-side". A mutation of a hook's return value re-renders nothing
— the line did exactly the opposite of what its comment claimed. It was
also superfluous: the route writes the flag into the user document, and
`useUserProfile` listens to it. So the button does toggle, but because of the server,
not because of this line.

**A ref written to during rendering.** `EvidenceSweep.tsx`
kept its completion callback up to date with `onCompleteRef.current = onComplete` in the
render body. Under StrictMode the render runs twice, and the
discarded pass writes into the same ref that the surviving one reads. Now
in the effect.

**Four constants from the temporal dead zone.** Two in `approve-tenant`, one
in `LandingModals`: an effect called functions that were only declared below it as `const`.
It works — but only because an effect runs after the render
in which the constant comes into being. That is a coincidence, not a promise.
Declaration and call are now in the right order.

**A metric that depended on render time.** `UsageQuotaPanel` computed
"active in 7 days" with `Date.now()` **inside** two `useMemo`. A
clock call is a hidden input the memo does not depend on: for
the same data a different number came out, depending on when React last
re-rendered. The boundary now hangs on `lastSync` — the moment the
data arrived.

**And an unchecked crypto signature.** `lib/totp.ts` fetched Web Crypto via
`require('crypto').webcrypto`, three times inline. The return value was `any`, so
the whole `subtle.importKey` call was untyped. A function with a real
`Crypto` return type immediately exposed that `base32ToBytes` returned a
`Uint8Array<ArrayBufferLike>` where `importKey` only accepts `ArrayBuffer`.
The build breaks on that — it just never saw it.

### The page slid sideways on the phone

One cause was known: the label "S/4HANA Sandbox Connection — Security
Profile", 340px wide, with `whitespace-nowrap` between two `flex-1` lines. It
could not shrink and pushed the document wider than the window.

The new guard found two more, both in the page header: the loading placeholder of the
sign-in button was a fixed 176px wide with `w-44`, and the resolved label "Get Free
Access or Login" does not fit next to the wordmark at 320px. The placeholder is
narrower below `sm`, the label below `sm` is "Get Free Access". **From `sm`
upwards — every width at which the page was ever reviewed — nothing
changes.**

`tests/landing-style-guard.spec.ts` now measures this at 320, 390 and 768 pixels,
and **twice per width**: once while the header is still loading, once
after. A page that slides sideways for half a second and then catches itself
is a page that slid sideways. If the check fires, it names the
elements that stick out past the right edge — and skips everything that sits in a
scroll container, because a snap strip *should* be 700px wide and otherwise
five innocents hide the culprit.





## [v2.7.0] — 2026-08-28

### One style, and it is measured instead of claimed

The interface did not have a style problem in the sense of "chose the wrong colours". It
had no chosen colours at all — every page carried its own copy of the classes,
and nothing compared them with each other.

**On the landing page:** three eyebrow variants, four heading sizes, an
emoji on one section, an `h3` where an `h2` belongs, and one section — the
seven steps — with no header at all, so that of all things the step that explains the flow
looked like a widget between two arguments.

**In the workflow it was worse.** Seven stages, seven titles:

| Stage | Size | Weight | Ink | Case |
|---|---|---|---|---|
| analyze | `text-4xl` fixed | extrabold | gray-900 | normal |
| design | `text-2xl sm:text-3xl` | **bold** | gray-900 | normal |
| transformation | `text-4xl` fixed | black | gray-900 | normal |
| testing | `text-3xl md:text-4xl` | black | `#0b1c30` | normal |
| documentation | `text-3xl md:text-4xl` | black | `#0b1c30` | **UPPERCASE** |
| delivery | `text-3xl md:text-5xl` | black | gray-900 | **UPPERCASE** |
| tco | `text-3xl md:text-4xl` | black | `#0b1c30` | **UPPERCASE** |

Three font weights, four sizes, two inks, two letter cases, and two stages
without any responsive step. The title jumped in size, weight
and colour at every step — exactly that makes a seven-stage flow feel like seven tools
instead of one product.

**`components/SectionHeader.tsx`** and **`components/StageHeader.tsx`** own
that now. `app/page.tsx` no longer writes an `<h2>`, no stage writes its
own title. The ink is `gray-950` in both, so that the two halves of the
product agree.

**And the reason nothing ever felt related:** 56 colour shades —
`slate-650`, `gray-955`, `green-150`, `emerald-505`, `blue-105`, `amber-205` and
fifty more — were written in 103 places, and **Tailwind generated no CSS for any
of them.** None is a standard shade, there was no `@theme` block.
Each of these elements silently inherited its colour.

It mostly looked close enough, which is why it survived. But two headings
side by side, one `text-gray-950` and one `text-gray-955`, were never two
shades apart: one was styled, the other was not, and the second
moved with whatever it happened to sit in. All 56 are now declared,
each interpolated in oklch between its two neighbours.

### The safeguard

`tests/landing-style-guard.spec.ts` and `tests/workflow-style-guard.spec.ts`.
Both load the **rendered page** and compare computed styles — size,
weight, family, letter-spacing, case, colour. That is the point: a pure
source check could be defeated by a component that quietly passes through a
`className`; computed style cannot. Plus a third check that searches
every `.tsx` for colour classes whose shade is declared nowhere.

### The landing page, content-wise

The order is now **Showroom → the seven steps → proof → the rest.** The
Showroom used to sit behind the carousel, the business-department argument and the tool matrix —
the only verifiable piece of evidence, four screens below the claim it
proves. Grok 4.6, GPT-5.6-sol and GLM-5v independently proposed the same
thing.

It now also carries the question it had left out. `ProcessStrip` places the
flow between "what is it" and "what becomes of it" — in the BPMN language that
stage 4 actually outputs, read per example from the ABAP in the same tab.
The heading reads "See a real ABAP program transformed" instead of
"Transformation Showroom": a name tells nobody that these are examples.

One filled button in the hero instead of two. The 21/17/4 as a proportional bar in
which every segment carries its own number. The scan bar was built and then
removed again — it caused more confusion than orientation.

### And the benefit card

It carried its heading inside: the section's argument dressed as a
card. That is why it read as something different from all the other sections. The
text moved up word for word, and the card became 80 words shorter.

The left half now mirrors the right — label, the generated output at
result size, provenance small underneath. Before, the sentence that matters stood in
small italics behind a hairline, under a caveat that you read before
you knew what it referred to.

### Verification Rail

`components/VerificationRail.tsx` keeps "where am I, what lies behind me, what is
open" on screen while the stepper scrolls away — the same circles, as a
column at the right edge from 1536 px, below that a button with the same list as a
sheet. It adds nothing: `lib/workflow-steps.ts` derives every state from
an existing artefact, never reports and never decides, and cannot report a
step as done because a page was opened.

401 tests, 399 green, one skipped.

## [v2.6.2] — 2026-08-28

### Ignored options, unearned confidence, four sentences too many

Release 5 of five, the conclusion of the implementation plan.

**`unordered` was in the interface and was never read.** Every comparison
in `result-diff.ts` was a set comparison, so `[A, B]` against `[B, A]` came back as
`equal: true` — even when the caller explicitly passed `{ unordered: false }`.
An option that exists and is ignored is worse than none,
because callers write it and believe it. The default stays set-based
— the docstring has always promised that, and an ABAP `SELECT` without `ORDER BY`
has no guaranteed row order —, but `unordered: false` now means what it
says.

**A matching table set was worth 0.95 confidence.** In something that
nobody had checked: join conditions, cardinality, selected fields and
filters are invisible to `matchCdsView`. `SELECT … FROM vbak CROSS JOIN vbap`
has the same table set as the join that `I_SalesOrderItem` models, and
got the same value. Now 0.6 for the exact set, 0.35 for a superset —
and the recommendation says "check", not "replace".

**`differentialVerified` is gone.** Nobody set the flag, but
its shape was the trap: **one** Boolean for a whole run would, combined
with `cds?.exact`, have marked *every* exact match as "fully verified" — on
the basis of a single test or none at all. Verification is a per-query thing.

**Four sentences that claimed more than they could:**

- The Datenschutzerklärung described only Google Sign-In. The e-mail/password path
  has always existed and processes data; it is in there now.
- It said "applicable terms", while the whitepaper in its "Honest
  boundary" box explicitly states that other Google terms apply to free-tier
  keys. Of the two documents, the Datenschutzerklärung is
  the authoritative one — the caveat belongs there.
- The catalog module pages counted "N objects … carry a released successor",
  while the table two rows below renders "no released
  path" for individual objects. It now counts what it claims.
- The reference page invites you to recompute ("you should see the same numbers")
  and listed the analysis time in milliseconds next to it — a wall-clock measurement on
  the Cloud Run instance that happened to serve the request, different on every call.
  Now as an order of magnitude.

### And the red pipeline

The tenant access test failed on CI, not locally: release 4 distinguished
"never attempted" from "rejected" via `NODE_ENV` — but CI builds for production and has
no `RESEND_API_KEY`, which is not a misconfiguration there. The criterion is
now the emulator marker that the rest of the code already uses for exactly this distinction
(`lib/firebase-admin.ts`).

New: `tests/engine-honesty-guard.spec.ts`, 12 checks. Two existing
assertions in `abap-sql-joins.spec.ts` were nailed to the old confidence values
and were rewritten to the statement that actually matters:
a superset lies below an exact set, and both well below anything
that reads like "verified".

388 tests, 387 green — the one failure is an `ECONNRESET` against the seed API.

## [v2.6.1] — 2026-08-28

### Session, delivery, second factor

Release 4 of five. Five findings with the same shape: **something reports a success
it has not established.**

**The QR code was decoration.** `MockQrCode` accepted the `value` property
and drew a hand-drawn SVG that was always the same — under the heading "1.
Scan Authenticator QR". Scanning set nothing up. So the documented
main path into two-factor authentication did not work at all; only
typing in the secret manually did.

A real QR code needs a vetted encoder, and a new dependency
means regenerating the lockfile here — according to `CLAUDE.md` a risk of its own. Until that is a deliberate decision, the two paths that
actually work are there: the `otpauth://` address that the server generates
anyway, as a button "Open in authenticator app", and the key for
typing in.

**A backup code could be redeemed twice.** Reading, checking and writing back
were three separate steps. Two concurrent requests with the same code
read the same list, both passed, and both wrote their own remaining list
— the second overwrote the first. One code, two twelve-hour sessions.
Single use is the whole promise of a backup code; that is worth a
transaction. If it fails, no session is issued.

**Two mail routes never looked at the provider's answer.**
`send-tenant-approval-email` and `send-tenant-revoke-email` logged
"Success", whatever Resend answered. `send-approval-email` logged
the error and reported `success: true` anyway. The admin console thus
reported that a customer had been notified while no message had been
accepted. All three now check, answer a rejection with 502, and
record the message ID — the link to the delivery events from v2.5.1.

**Tenant requests reported success without notification.** The requester
got "has been received", `s4TenantAccessRequested` was set, and nobody
held an approval token. The request is still stored — it is not
lost —, but the caller is no longer lied to, and
`s4TenantAccessNotified` makes an undelivered request findable. If the
key is missing outside production, the console output is the delivery path; in
production a missing key is the same outcome as a rejection.

**The profile listener outlived its user.**
`return () => unsubscribeProfile();` stood in the return value of the
`onAuthStateChanged` callback — which Firebase discards. The snapshot listener of the
previous account stayed active and could call `setProfile` with someone else's data. It
is now released on user change and on cleanup of the effect.

New: `tests/session-delivery-guard.spec.ts`, 12 checks.

376 tests, 375 green. `full-pipeline.spec.ts` failed once because Gemini returned
broken JSON during the run, and passes in isolation — the two users of
`getStats` are both safeguarded, the change from v2.6.0 cannot
trigger it.

## [v2.6.0] — 2026-08-28

### Green verdicts nobody earned

Release 3 of five. It is the class of defect for which the fake
sandbox tester was removed in v2.5.0 and for which `docs/ARCHITECTURE.md` §5.7
states the rule — both reviews found it again in ten places. The pattern is
always the same: **a value is missing, and the code substitutes the best possible one.**

**The displayed Clean Core Score was not the signed one.** The UI
recomputed it in the browser: 60 % construct coverage + 30 % a "standardFitBonus",
read from the Gemini prose via regex `/high|medium|low/` and defaulting to **80**
when nothing matched + 10 % the stored value. A
model answer "High" thus raised the display above what the immutable run
and the audit pack can prove — under the label on which the whole
trust chain rests. Shown now is what `/api/runs/create` signed.
Without a run there is a dash, not an 80.

**"Malicious Payload Check passed" for code that nothing checked.** On
upload the scan was real and blocking. On **paste** it was not: the text area
set `legacyCode` directly from `onChange`, and the banner depended only on
there being any code at all. The scan now lives in `lib/staged-code-scan.ts` and runs
on both paths; the banner shows the result, not the presence of text.
On a hit a red block with the reason appears instead.

**The delivery page declared unfinished projects finished.** Loading the page
wrote `status: 'completed'` — without looking at code, tests, documentation or
approval. Navigating directly to `/delivery` was enough. Next to it stood, unconditionally,
**"Ready for Deployment"** with a pulsing green dot, and the
integrity report handed out green ticks for artefacts it never looked at. The
write is gone; the report now checks what it reports on, and the
QA block names what is missing.

**"AI Verified" without a validator.** No compiler, no test run, no
deterministic check looked at the generated code — the path even accepts
arbitrary non-JSON text. It now says "AI Generated".

**Ticks raised compliance to 100.** `signedOffIds.size / signOffFindings.length`
pulled the displayed value from the signed 40 towards 100. The ticks are
browser state: not stored, bound to no person, no justification and no
check result, and no new signed run is created. Displayed is
the signed value; the review progress stays as a line of its own.

**The TCO page invented a business case.** `scoreBefore = cleanCoreScore || 30`,
`scoreAfter = 95` hard-wired, and `setLoc(Math.max(1000, Math.min(lineCount * 10, 50000)))`
turned ten uploaded lines into **a thousand**. From that came "Annual Net
Savings", payback months and ROI in euros. Without a signed score the
page now renders no model at all, but says why. The line count is the real one,
and the figure is called "Scenario".

**Four more substitutions:** a missing coverage summary became
"fully supported"; a missing deployment target became "Private Cloud (RISE)",
a concrete statement about the customer's system landscape; zero findings became
"Pristine Codebase Detected", a verdict on code that does not follow from the absence of
findings; and `standardFit` became **90 % / 50 % / 15 %** with
progress bars, where the model delivers one of three words. Plus `NaN%` as
pass rate for an empty test run.

New: `tests/unearned-verdicts-guard.spec.ts`, 19 checks. They read the
comment-free state, so that the explanations above the fixes do not satisfy their
own assertions.

364 tests green.

## [v2.5.5] — 2026-08-28

### The engine no longer invents decommissioning candidates

Release 2 of five from the implementation plan.

**Missing usage data was zero calls.** `usage-parser.ts` wrote
`callCount: callCount ?? 0`. `parseCallCount()` returns `undefined` when the
column is missing or unreadable — and that became a **0**.

`usage-join.ts` carries an explicit protection against exactly this case, with
the comment "Missing data is not evidence of non-use". The protection checks whether a
record *exists*. It says nothing about its content. So a record with an
invented zero got through, became `dormant`, and `dormant` yields the
`retire-candidate` quadrant for any feasibility.

An SCMON or UPL export whose call column is named differently than expected thus made
**every object in it a decommissioning candidate** — a recommendation
to delete productive code, derived from the absence of data.

`callCount` is now `number | null`; `null` becomes `unknown`, before any
further check. A *measured* zero stays `dormant` — the fix does not blunt the
function. And the import now warns when no call column was recognised,
instead of showing a matrix full of "unknown" without explanation.

**A finding no model reported.** While testing the neighbouring fix it became
apparent: `collectLocalDataObjects` treats the name after **every** `INTO` as a
local data object. Right for `LOOP AT it INTO wa` and `SELECT … INTO lt_x` —
wrong for `INSERT INTO <dbtab>`, the normal Open SQL insert. The table was
registered as a variable, `processTableAccess` aborted before it looked at it, and
**a direct write access to an SAP standard table in the most common
syntax produced no finding at all.** `INSERT INTO vbak VALUES @ls_order.`
was invisible. For standard as well as customer tables.

**And the opposite direction:** `INSERT <wa> INTO <itab>` is internal ABAP, but was
reported as a database write access — a **Critical** finding on a
local variable. The two protection levels behind it (declared in the source,
or `LS_`/`GS_` naming convention) do not apply to exactly the snippets
the tool is used for. The distinction is now made by where `INTO` stands:
after a name it is the internal form, directly after `INSERT` it is Open SQL.

**Missing ancestors no longer count as resolved.** If a superclass was missing from the
upload, it was not noted as missing as long as its name began with `CL_`, `CX_`,
`ZCL_` or `ZCX_`. For SAP's own namespaces that is defensible — the
classes exist in the system, just not in the upload. For `ZCL_`/`ZCX_`/`ZIF_` it is not:
those are customer objects, and if they are missing, they were not parsed.
"Inheritance chain fully resolved" was a statement about code nobody had
read.

**The "measurement period" was none.** It was formed from the earliest and latest
execution date: a year's export in which everything ran on 1 and 2 June
reported a **one-day** measurement window — displayed as "📅 1-day measurement
window". Execution times are not the observation window. The field is now called
`observedSpanDays` and the UI says "days of observed activity".

New: `tests/usage-unknown-guard.spec.ts` (11) and
`tests/abap-internal-insert-guard.spec.ts` (10). The usage tests run the
real parser over real CSV text, because the defect lay in the seam between two
modules that each looked right on their own.

345 tests green.

## [v2.5.4] — 2026-08-28

### Five tests that checked nothing

Release 1 of five from the implementation plan
(`docs/reviews/2026-08-28-UMSETZUNGSPLAN.md`). First, because what
all following test runs are worth depends on it.

Five specs wrapped their entire assertion in a condition on the existence
of the element they were supposed to check — `if (await locator.count() > 0)`.
If the element disappears, the test passes silently. That is worse than a
missing test, because it is counted as a safeguard.

**Three of them looked for things that do not exist at all:**

- `"Free Community Tool"` does not occur anywhere in the code. The page says
  "Free Community Edition".
- The title `"Search S/4HANA Glossary"` does not exist. The real one is
  "Open Clean Core Glossary Guide".
- The chatbot trigger lives in the signed-in shell layout, while the tests loaded the
  public start page. It was never to be found there.

All three passed for months without checking anything.

**What the tightening brought to light:** `GlossarySidebar` is imported in
`app/(app)/layout.tsx` and **never rendered**. Only the chatbot hangs
in the shell. Exactly the shape in which `UserOnboarding` was found yesterday — and
the test that should have shown it was the silently passing one. The
test now checks what is there; the dead inclusion stands as a finding in the plan instead of
being covered up by an assertion on a non-existent element.

The glossary test is called "toggle behavior" and now also toggles: open,
check, close, check.

New: `tests/no-vacuous-tests.spec.ts`. A deliberately coarse, repo-wide check —
no spec may make an assertion depend on the asserted
element existing.

324 tests green.

## [v2.5.3] — 2026-08-28

### Delivery figures in the weekly report

The webhook from v2.5.1 writes delivery events to Firestore and puts a
badge on the user row. What was missing was the summary: how much mail
went out, how much of it arrived, and if not — for whom and why.

The Friday report now has a section **Mailzustellung** (mail delivery): sent,
delivered (of which opened), delayed, bounced, reported as spam. Below it,
only when there is something to show, a red block **Nicht angekommen** (not arrived) with
recipient, type of mail, time and the reason in the provider's wording.

Three decisions in it:

- **`email.sent` gets its own line "Ohne Rückmeldung"** (no response), not 0 %
  delivered. Before the webhook every record stayed at `sent` forever; if
  this number goes up again while mail goes out, the report says explicitly
  that the webhook is not live — and not that delivery is broken.
- **Zero values produce no line.** A week without bounces shows no
  bounce entry; the section is meant to be read, not skimmed.
- **Test accounts are excluded**, by the same rule as everywhere else in the
  report. CI sends far more mail than real users.

### The other half of the race

Since v2.5.1 `recordEmailSent` has protected a verdict that had already arrived from
being overwritten by `email.sent`. The mirroring onto the user row was
not covered by that: `recordEmailEvent` reads `uid` and `kind` from the document, and
an event that arrives before the send record finds neither — the bounce
stood correctly in `email_events`, the red badge never appeared. Of all things
with the fastest bounce. `recordEmailSent` now mirrors after the fact when it finds a
document whose status is no longer `sent`.

### "Motivation / Use Case" is back in the sign-up form

The Google path never stopped asking. Since a rework, the e-mail/password path
had sent a hard-coded `motivation: ''` — backend, Firestore document
and the admin notification could handle the field all along, only nobody asked for
it any more. The mail printed a heading with nothing underneath.

Optional, 2000 characters, no `required`. Two sentences about the use case are the
difference between a line in a list and knowing who has
come — but making a hurdle of it would be the opposite of what
the approval was abolished for in v2.4.2.

### Operations

The Resend webhook is live. The GitHub secret alone is not enough:
it is injected as an environment variable at deploy, and until then the
route answered everyone with 503 — which could also be seen in the logs of a live sign-up at 06:03,
four times in eight seconds.

`CLAUDE.md` now carries the local emulator trap: without `--project=cleancore-491216`
the CLI falls back to `demo-no-project`, and the Admin SDK rejects every token with
`incorrect "aud" claim`. The symptom is four failing auth-dependent
specs in an otherwise green suite — it reads like a regression and is not one.

323 tests green.

## [v2.5.2] — 2026-08-27

### A page that argues from verifiability is measured by it

An external finding from 27.08. (`docs/reviews/2026-08-27-EXTERNAL-AUDIT-V2.md`)
found four contradictions on the start page: two object counts, two labels
for the same cell, two names for the same row, two dates. Three of them
had a common cause — **the comparison matrix stood twice, verbatim, in
the same file**, once for the stacked cards below `md`, once for the
desktop rows, and the copies had drifted apart.

Aligning four values would have left the mechanism standing that produced them.
The matrix is therefore now **one** definition, rendered twice. The object count
is interpolated from the same `catalogStats` that already shows the live number two centimetres
above — it stood as `23,000+` in the text while the trust bar
computed 32,103. And both renderers derive their presentation from `level` instead
of from the badge text; exactly that comparison had let "Not Supported" and "Not
Available" drift apart without either view looking wrong.

The same number was also typed in on `/how-it-works` and `/abap-custom-code-analysis`.
Both read it now.

### Privacy policy and Impressum were linked behind the login

The notice banner in the app shell pointed to `/settings#privacy` and
`/settings#legal`. The finding found that on `/knowledge`; in fact it weighs
more heavily, because this layout also wraps `/how-to` and `/first-run` — that is,
every public cluster page, all in the sitemap, all reachable without sign-in.
Datenschutzerklärung and Impressum must be available directly and without registration
(§ 5 DDG, Art. 12/13 GDPR). They now point to `/datenschutz`
and `/impressum`, as the footer of the same page always did.

For the same reason the logo leads to `/` for readers who are not signed in. A hard
link to `/dashboard` was a dead end for anyone who landed on
`/knowledge` via a search query — and a signal that distorted the internal link graph.

### Smaller fixes

- `{APP_VERSION} · July 2026` in the Showroom and in the example pack: one half
  updated with every release, the other did not. Both now come from
  `lib/version.ts`.
- The object list on the benefit card now says whose naming it shows.
  Without that sentence, `VBAK → I_SALESDOCUMENT` reads like an error when the
  run hands a developer `API_SALES_ORDER_SRV`. Both are
  defensible, but only one is SAP's — and SAP's is the claim that stands
  next to it.

New: `tests/landing-consistency-guard.spec.ts`, nine checks. They safeguard the
mechanism, not the values: that the matrix has one definition, that no
number stands in the text, that no date stands frozen next to a living version,
that the legal pages are linked publicly.

316 tests green.

## [v2.5.1] — 2026-08-27

### Mail delivery is now observable

A 200 from `POST https://api.resend.com/emails` means "put into the
queue" and nothing else. The platform logged that as success and
never learned anything again afterwards — a welcome mail in the quarantine of a
corporate filter and one in the inbox looked identical in the log.

That weighs more than it sounds: the entire registration flow hangs on this one
message. It carries the First-Start Guide and the security answers
someone needs before pasting ABAP into the tool. Thirty accounts from the
community activation were created without anyone being able to say whether the
mail arrived. The low usage of the platform is explained at least as well by unseen
mails as by anything about the product.

**New: `POST /api/webhooks/resend`.** Unauthenticated out of necessity — Resend
cannot carry a Firebase token —, the signature *is* the authentication:
Svix HMAC over `${svix-id}.${svix-timestamp}.${Rohtext}` with a five-minute
replay window, implemented in `lib/email-events.ts` itself instead of pulled in as a dependency.
Without `RESEND_WEBHOOK_SECRET` the route answers 503 and writes nothing.
For payloads it does not understand it answers 2xx — a webhook that returns an
error is retried.

**It becomes visible where people look anyway.** `email_events` is
server-only, because the documents carry recipient addresses; the admin console cannot
read them. The welcome mail's send record therefore keeps the `uid`, and
a delivery event mirrors its status onto `registration_requests/{uid}`. An
account that was created and never used now looks different from one whose
First-Start Guide lay in a quarantine. `email.sent` deliberately gets no
badge — that is the state the platform always knew, and exactly
the one that was worth nothing.

### Three things on the sending side

- The Resend message ID is recorded at sending. Without it, an
  event arriving later cannot be matched to a send.
- Every mail now carries a text part, generated from the same markup so that it
  cannot drift. Both registration mails were pure HTML — a spam signal known for
  years.
- Every mail carries `reply_to: info@clean-core.io`. `team@` and `system@` are
  sender identities, not mailboxes at the provider — a reply to them
  bounced, while the welcome mail asked people to reply. The
  authentication was never affected by this (SPF and DKIM apply to the domain),
  the reply path was simply broken.

### Still to do, and only possible by hand

Create the webhook endpoint in the Resend dashboard and store its signing secret as the
GitHub secret `RESEND_WEBHOOK_SECRET`. The pipeline already passes it
through. See `docs/BACKLOG.md`.

307 tests green.

## [v2.5.0] — 2026-08-27

Two more full-codebase reviews, run through OpenRouter against the same bundles
as the Grok pass the day before: GLM 5.3 and GPT-5.6-sol. Between them roughly a
hundred findings, of which thirty-odd were reproduced against the code and five
refuted. The three reviews overlap less than you would expect — about a third —
and the two worst defects in the product were each found by exactly one model.

The triage lives in `docs/reviews/2026-08-27-GLM-TRIAGE.md`; the raw output of
all passes sits beside it, unedited.

### Fixed — a stolen ID token was enough to replace someone's second factor

`mfa/setup/start` and `mfa/setup/verify` checked only that the caller held a
valid bearer token. For a first enrolment that is unavoidable — the factor cannot
be required before it exists. For an account that already had MFA it meant the
factor could be swapped for nothing: call start, take the fresh secret, compute
its current code, call verify, and both the stored secret and the `mfa_session`
cookie belong to the caller.

`tests/mfa-coverage-guard.spec.ts` listed both routes as MUST_NOT_GATE with the
right reasoning attached to the wrong scope, so a test held the hole open. The
rule is the enrolled state, not the route: no gate without a factor, full
step-up with one.

Found only by GPT-5.6-sol.

### Fixed — the audit pack signed runs it never verified

`audit-pack/create` confirmed `runHash` was a non-empty string and then signed a
manifest attesting to it. Nothing recomputed the hash; nothing checked the run's
HMAC. And it read two client-writable fields from the project in preference to
the run:

    worklist: projectData.worklist || runData.worklist,
    extensibilityRoute: projectData.extensibilityRoute || runData.extensibilityRoute,

Both are in the update allowlist in `firestore.rules`. So the owner could delete
an inconvenient finding, mark one fully mapped, or change the recommended route,
and the pack would sign the edited version and present it as bound to the
immutable run. For a product whose argument is a verifiable evidence chain, this
was the worst reachable defect in it.

Evidence now comes from `runData` only, and `verifyRunIntegrity` runs before
anything is signed. `lib/run-signature.ts` is new and holds the canonicaliser,
the hash and the HMAC in one place: the verifier has to rebuild the payload the
way the producer built it, and two implementations of "canonical" drift. A
verification that drifts is a verification that passes.

Also found only by GPT-5.6-sol.

### Removed — three things that reported work they had not done

**The "Differential Sandbox Tester" in stage 3.** A button that waited 1200ms on
a setTimeout and rendered "ResultSet Equivalence Verified" over "S/4HANA: 243
rows fetched / 243 items compared" — 243 a literal in the markup. It executed
nothing and contacted nothing, and the same callback added the complex-sql-join
finding to `signedOffIds`, which feeds the compliance figure on that page. A
timer raised a score and signed off the one finding class that most needs real
verification.

The capability it mimed already existed and was reachable from no UI at all:
`/api/test-s4-odata-read` reads records from the tenant the user connected.
Stage 5 had every step leading to it, so the read is the last step of that flow
now — one button per entity type, feeding the console already on the page. It
reports the count it actually got back, and says in the console that it is a read
and not a comparison.

**Savings figures in the board deck.** `weeksSaved = complexity * 0.4` and
`techDebtSaved = complexity * 850`, rendered as "N Weeks" and "€X/yr" in front of
a steering committee — from a complexity that itself defaulted to 50 when nothing
had been measured. Deleted rather than rewritten: there is no honest version of a
savings figure this product can compute. A test asserted one of those labels was
present, which is how the multipliers survived.

**Invented figures in the Confluence export.** An asset score of 82/55/35 chosen
by string comparison, a maintenance cost of `(100 - score) * 180 + 1200` rendered
as €/yr, value drivers picked by searching the context for the word "partner",
and a flat "~40%" ROI claim. The prompt three hundred lines above asks the model
for a range, hedged language and a calibration disclaimer; the fallback threw
that discipline away.

And `?? 100` on the board deck's score and coverage: a project that was never
scored presented 100/100 and 100 % coverage. That is Grok's V4 in a second file
the earlier fix never reached.

### Fixed — provenance, in three places

`buildMerged()` resolves SAP's published release data and a hand-curated layer
and knows which is which. `evidence-model.ts` discarded the distinction, stamped
every replacement `'Catalog Match'` and hung SAP's catalog version beside it, and
two UI sites relabelled `'Verified'` as `'Catalog Match'` on screen. Measured
against the shipped release data, all 21 findings in the reference run's settled
bucket resolve through the curated layer and none through SAP's — while the
landing page said "a released SAP successor from SAP's own data" next to six
pairs of names.

The card reads the repository layer directly now, so `VBAK → I_SALESDOCUMENT` is
SAP's own naming and the sentence beside it is true. `replacementProvenance()`
maps 'sap-official' to 'Catalog Match' with the catalog version and 'curated' to
'Verified' without it. `bucketOf` accepts both, so the published numbers do not
move.

`verifyAuditPack` returned `success: true` for any internally consistent ZIP,
including one anyone can assemble with `signed: false`. It means authentic now;
local consistency keeps its own field.

And consent recorded whatever the consenting party said it recorded —
`privacyVersion` and `contentSha256` came from the request body straight into the
append-only row. Both are server-derived now. That one was introduced in v2.4.2
while fixing V14: recording consent server-side was the right half, taking the
caller's word for what it covered was a smaller version of the same defect.

### Changed — the landing benefit card, and the section competing with it

A thousand pixels below the card stood "Verifiable Integrity — No AI Black-Box
Promises": the same argument, the same three categories, the same three colours,
in 5xl caps on dark. The card had the computed evidence and whispered; the
section had the typography and not one number in it. Two models were asked what
was visually wrong with the card and neither could see this — they were shown the
card, not the page.

The section is merged in. Its three descriptions are the sentence printed under
each computed number — they already existed in `lib/reference-analysis.ts`,
written for exactly this and rendered nowhere — and its dark treatment moved to
the half of the card that holds the proof. There is exactly one dark region on
the card now and it is the evidence: big tabular numbers, the split bar, the
object roll-call in monospace. The prose stays light, so a reader can tell a
measurement from a sentence somebody wrote.

Before that, the card had already been rebuilt around a sentence rather than a
layout: the old two-column premise was 2231px tall at 360px and its halves
stacked below 1024px, so the comparison it was built on never happened, and the
closing line still said "the question on the right" to a phone that has no right.

Page height 13,752px to 13,227px.

### Changed — registration, and both of its mails

Everything from v2.4.2 reaches production with this release, because main was
still on the previous build. Signing up is no longer an application: accounts
activate through `POST /api/account/register`, the two registration mails became
one, and the administrator gets a notification carrying no privileged action.

Both mails were rebuilt as fluid tables. They depended on a media query in the
document `<style>`, which mail clients are free to strip — reported from a real
phone as content being cut off. The welcome mail is half its former length, and
the recipient confirmed both on a device.

### Tests

292, all passing. New: `run-integrity-guard`, `fabricated-verification-guard`,
`benefit-card-guard`, `registration-email-guard`, `registration-flow-guard`.

Six existing tests were rewritten rather than deleted, because each was pinning a
defect in place: two asserted `'Catalog Match'` for a curated mapping, one
asserted the board deck's "Estimated Effort Saved" label existed, one asserted an
unsigned pack verifies successfully, one listed the MFA setup routes as ungated,
and one seeded a run with `runHash: 'testrunhash'`.

### Known, not fixed

- 24 GLM findings and most of GPT's remain unverified. Both triage files list
  them by name rather than implying coverage.
- **V9** still waits on a decision: the published fallback signing key cannot go
  until CI has its own `AUDIT_SIGNING_KEY`, because the suite signs with the
  fallback and asserts the result is valid. GPT adds that the guard is
  `NODE_ENV === 'production' && !emulator`, so a preview deployment signs with
  the committed constant.
- The landing page scrolls sideways on narrow screens under Linux font metrics.
  One cause, one line: `whitespace-nowrap` on the "S/4HANA Sandbox Connection"
  label in `app/page.tsx`.
- V15, V16 and V18 from the Grok triage.
- `eslint.config.mjs` imports the TypeScript and React-hooks plugins and enables
  neither, so `npm run lint` checks neither. That is how two Rules of Hooks
  violations reached production through a green gate. Left for its own change,
  because turning the rules on will surface a backlog.

## [v2.4.2] — 2026-08-27

Signing up stopped being an application. An account is now active the moment it
is created, the two registration mails became one, and the consent behind it is
recorded by the server instead of asserted by the browser — which is finding V14
from the same review, fixed in the flow it lives in.

### Changed — registration no longer waits for anybody

Creating an account produced a "we are reviewing your application" mail, a
waiting-room screen, and two HMAC-signed one-click links in an administrator's
mailbox. If one of those was ever clicked, a second, near-identical "approved"
mail followed. Until then the account could do nothing.

The browser still writes the profile as `pending` — the Firestore create rule
pins that value and rejects any other — and `POST /api/account/register` is now
the only thing that moves it to `approved`. Automatic is not client-decided: the
decision stays on the server, so a Firestore write cannot mint an active account.

- `activateAccount()` runs once per account, in a transaction, and refuses
  anything that is not `pending` or that already carries `activatedAt`.
- `adminRevokeUser` writes `status: 'suspended'` instead of pushing the account
  back to `pending`. As `pending`, a revoked account was indistinguishable from
  a fresh signup and would have reinstated itself on the next registration call.
- The admin console's tabs are `all / active / suspended`; the approve button is
  a **Reinstate** button, because there is nothing left to approve.

Removed with the gate: `/api/request-pilot`, `/api/send-pending-email`,
`/api/admin/approve-user`, `/admin/approve` and `approveUserWithToken`. A
privileged action that travels by email is not worth keeping for a decision
nobody makes any more. Live-tenant (BYOT) access is a separate approval that a
human still makes, and it keeps its HMAC token flow unchanged.

### Changed — one welcome mail that does the whole job

`lib/welcome-email.ts` replaces both registration mails. It leads with the
workspace link, then carries the five-step first run condensed from `/first-run`,
what "free" actually means (only the stage-2 analysis is metered), and a security
block written to be forwarded to whoever has to sign the platform off: EU
processing in europe-west1, code excluded from model training, keys never in the
browser, BYOK encrypted with AES-256-GCM, HMAC-signed runs, TOTP 2FA, and
self-service erasure under Art. 17.

`lib/admin-signup-email.ts` is the administrator's copy: every detail of the
signup, including whether a consent record exists, and no action in it at all —
the only link goes to the admin console, behind a login and a step-up check.

### Fixed — V14: consent was a claim, not a record

`termsVersionAccepted` and `termsAcceptedAt` sat in `userClientCreateKeys()`, so
a browser recorded its own Terms acceptance, timestamped by its own clock, with
no `consent_events` row behind it. Both fields are out of the allowlist.
`lib/consent.ts` is the single writer — append-only event plus the profile mirror,
both through the Admin SDK — and is shared by `POST /api/consent` and the
registration route.

While fixing it: `components/UserOnboarding.tsx` was **not mounted anywhere**. The
Google sign-in path deliberately created a profile without consent fields on the
grounds that "onboarding collects the agreement properly" — but the component
that would have collected it never rendered, so those accounts had no consent
record and no way to give one. The modal is now mounted in the app shell and the
silent auto-provisioning branch is gone; a first Google sign-in is asked for a
name and both agreements before an account exists. That path also now fails
closed on a profile read error, like the email and redirect paths already did.

### Changed — the landing benefit card says what people search for

`upgrade`, `audit` and "free SAP custom code assessment" are in the card because
each is true and checkable: clean core exists for upgrade stability, the pack
really is signed, and it really is free. The three benefit questions that already
place on this page are now marked up as question-and-answer pairs in the existing
`FAQPage` node, in both languages, with every answer restating visible copy.

The figures this market ranks for — "20–30% faster upgrades", "reduce TCO by 62%"
— stay out. One proposed edit was dropped on contact with the data: the reference
file's hand-work bucket renders as `dynpro, native-sql`, with no `modification` in
it, so calling those findings "the upgrade blockers" would have contradicted the
numbers printed beside them. The SPAU sentence now renders only when a
modification is actually present.

### Tests

`tests/registration-flow-guard.spec.ts` is new. `security-compliance.spec.ts`
gains emulator-backed proof that registration activates and records consent, that
a second call is a no-op, that a suspended account cannot reinstate itself, and
that a client create carrying the consent fields is refused by the rules.

One of those tests exists because of a hole found while writing them: an account
revoked *before* this release is `pending` with a zeroed quota and no
`activatedAt` to recognise it by, so the new endpoint would have reinstated it.
The zeroed quota is the discriminator — a client-created profile always carries a
limit of 5, because the Firestore create rule hardcodes it.

### Fixed — consent was recorded but not required

A GLM 5.3 review of the whole codebase, run against this release, found a defect
the release had introduced: `POST /api/account/register` recorded consent where it
was given but activated the account either way. A client posting
`acceptedTerms: false` came out `approved` with full API access and no
`consent_events` row — which makes the V14 mechanism above optional in practice.
`assertAccountActive` would not have caught it either; it grandfathers a *missing*
acceptance so pre-consent accounts are not locked out, and only blocks a
previously accepted version that has gone stale.

The route now refuses activation without a consent record. The full review, and
the one finding of its ~50 that was checked and refuted, are in
`docs/reviews/2026-08-27-GLM-INDEX.md`.

244 tests, 0 failed. Note for local runs: the suite is flaky at Playwright's
default worker count against `npm run dev` (ECONNRESET, `auth/email-already-in-use`
races between workers seeding the same emulator). Run it `--workers=1`, which is
what CI does.

### Known, not fixed in this release

- The landing benefit card's left column is still the hand-written credit-check
  story. The copy edits closed the keyword gap; they did not close the gap the
  review actually named — that the card asserts the differentiator and proves the
  commodity. Proposals 2 and 3 in `docs/reviews/2026-08-26-BENEFIT-NEXT-STEPS.md`
  are the work for that.
- V9, V15, V16 and V18 from the Grok triage remain open. V9 is a decision, not
  work: removing the published fallback signing key breaks the test that signs
  with it, so CI needs its own `AUDIT_SIGNING_KEY` first.

## [v2.4.1] — 2026-08-26

Everything an external code review found, worked through. A Grok 4.6 pass over
the whole codebase produced roughly twenty findings; each was reproduced against
the code before being acted on, and two were refuted rather than fixed. Five
engine defects shipped in v2.4.0; this release covers the rest, plus a rebuilt
benefit section on the landing page.

The full triage, and the raw review output unedited, are in `docs/reviews/`.

### Fixed — numbers nobody measured

The delivery handover screen read `project?.testCases?.length || 10` and
`coverageEstimate?.percentage || 92`. With those fields missing — and because
`length === 0` is falsy, also when a run generated nothing at all — it stated
**10 automated tests and 92% estimated coverage**, under a green tick, on the one
screen a customer photographs for a steering pack. Two more sites did the same
for confidence: 95% routing confidence in Analyze, and 75% recommendation
confidence in Design, the latter directly above the architect's signature.

All four now say what is true: "No test suite generated", "Coverage not
estimated", "Confidence not computed". `ArchitectSignOff.confidenceScore` is
optional, so a caller cannot silently default it, and the tick in front of each
line follows the fact rather than the layout. Product defaults are untouched —
the free tier's 5 transformations is configuration, not a measurement.

### Fixed — security

- **A rate-limited verification reported a valid pack as forged.** `QuotaError`
  carries `.status`; `/api/export/verify` and `/api/audit-pack/create` tested
  `.statusCode`, so the 429 branch was unreachable and the outer catch answered
  HTTP 200 `{ valid: false }`. The 31st verification in a minute told an auditor
  the signature was bad. Both now test the property the class sets, and the
  failure path returns 500 with no `valid` field: failing to check a signature is
  a different statement from checking it and finding it bad.
- **The trust chain did not require MFA.** Firebase Auth issues a valid ID token
  before any custom second factor runs — the TOTP prompt is a React state change,
  not an authentication step. `assertMfaSatisfied` guarded the S/4, Gemini and
  secrets routes but not the two that MINT signed runs and signed audit packs,
  nor project deletion, which destroys the runs underneath. Those three are now
  gated. An audit of every mutating route found the rest already covered:
  `account/delete` and `mfa/disable` use `assertMfaStepUp`, and the four admin
  routes use `assertAdminStepUp`, which also requires recent auth and an enrolled
  factor.
- **Two client sign-in paths let a session survive.** The email path read the
  profile inside the same `try` as the credential check, so a Firestore error
  surfaced as "Invalid email or password" while the session stayed live and the
  MFA branch never ran — the user was signed in by an error telling them they
  were not. The redirect path went straight to the dashboard without consulting
  the profile at all, skipping the second factor on that path only. Both now fail
  closed.
- **Stored S/4 credentials could be sent to a caller-supplied URL.** Four routes
  merged the stored connection field by field, so a request could ask for the
  vault and supply its own `url` — and the decrypted password went there.
  `resolveS4Connection()` now owns the invariant for all four: stored means the
  whole connection identity comes from storage, or nothing does.
- **Any non-boolean granted admin.** `isAdmin !== false` gave the claim to the
  string `"false"` and to `"0"`.
- **Shell injection in the weekly usage report.** `${{ inputs.recipient }}` was
  interpolated into a `run:` block in a job holding `id-token: write`, GCP
  workload identity federation and the Resend key. The input now reaches the
  shell only as an environment variable.
- **Consent was recorded where it was never given.** Google auto-provisioning
  wrote `termsVersionAccepted`, so the record existed and the person was never
  asked. Those fields are gone from that branch; the sign-up form's Google button
  is gated on the same checkboxes as its submit button. The email registration
  path also recorded `identityProvider: 'google'`.

### Fixed — four more, from the same review

- **An OData service path was constrained in one route and not its sibling.** The
  SSRF allowlist decides which *host* may be reached; nothing decided which
  *path*, so `/api/fetch-s4-metadata` concatenated the raw body value onto an
  allowlisted host and could read anything those credentials can — the vault's,
  under `useStoredCredentials`. `isSafeODataServicePath()` now lives in
  `lib/url-validation.ts` and both routes use it.
- **The audit pack export timestamp never landed.** Firestore's `set` does not
  interpret dotted field names — only `update` does — so
  `set({ 'auditMetadata.auditPackExportedAt': x }, { merge: true })` created a
  literal top-level field with a dot in its name and left the intended one unset.
  No exception, no warning. Written nested now; a scan confirmed it was the only
  instance.
- **The compliance HUD claimed 100 %.** Two substitutions:
  `project?.cleanCoreScore || 70` invented a baseline for an unscored project,
  and `signOffFindings.length > 0 ? … : 100` declared full compliance whenever no
  finding happened to require sign-off — which happens on a parse miss, on empty
  source, and whenever all findings are informational. It overrode a real stored
  score of 40 with a green ring. The project's own score now stands, and an
  unscored project shows "Not scored yet" rather than a number.
- **The Jira flow reported success it had not achieved.** The callback sent
  `JIRA_AUTH_SUCCESS` while token persistence is still a TODO, and the modal's
  sync ran a timer and jumped to a success screen. Nothing renders that modal
  today, but a fake success in the tree is a trap for whoever wires it up.

### Known, not fixed in this release

- Sign-offs in the transformation view are component state only, so a refresh
  discards them and the score moves back. Persisting them is a product change,
  not a fix.
- The published fallback signing key (`dev_audit_signing_key_fallback_clean_core`)
  remains in three routes, and `tests/audit-compliance-v181.spec.ts` signs with
  it and asserts the result is valid — so setting a real `AUDIT_SIGNING_KEY` in
  CI would break the suite. Production is protected by the deploy guard, which
  fails the deploy when the secret is missing. Closing this needs a decision
  about giving CI its own key.
- Four medium findings remain open and are listed in
  `docs/reviews/2026-08-26-TRIAGE.md`.

### Fixed — two Rules of Hooks violations

`UserOnboarding` returned on `!auth` before its `useEffect`: the server render
stopped early (auth is null there) while the browser render ran it, and React
throws on the hook-count mismatch during hydration. `RoutingRationale` returned
on a missing route before its `useMemo`, which fires whenever a project loads
asynchronously and the same instance renders again with a route. Both guards
moved below the hooks.

### Changed — the landing page benefit section

Rebuilt around the two questions every legacy decision waits on, and moved below
the slideshow. A competitor scan drove the shape: smartShift inventories code and
reports retain/retire/redesign; CoreAssess.AI produces a backlog and sells on
"up to 70% faster"; SAP Signavio is the only one facing the business and it mines
transaction data, so it can show a process is slow but not what a Z-program does
inside it. Everyone ships a backlog, and a backlog never says why the program
exists.

So "What does this thing actually do?" leads and takes three fifths of the
width, with the artifacts drawn rather than listed — a plain-language answer, a
BPMN flow, a RACI in business roles. "How much work is this?" sits beside it with
the 21/17/4 split. Still no time or percentage claim: against "70% faster" the
answer is a reproducible figure, not a larger one.

### Refuted — checked, not defects

- *"Unhandled release states are counted as residual C."* Both generated
  artifacts contain only `released`, `notToBeReleased`, `deprecated`,
  `classicAPI` and `noAPI`. Enumerated.
- *"`set({chargedInputs}, {merge:true})` replaces the map and breaks quota
  idempotency."* Firestore merges map fields recursively. Proven on the emulator:
  after writing a second fingerprint the first is still `true` and the counter
  reads 2.

### Added — guards for each class of defect

`no-fabricated-figures`, `credential-and-consent-guard` and `mfa-coverage-guard`
(37 tests). Mostly source-level, because each defect is a shape rather than a
behaviour: `|| <number>` on a measured value, a `${{ }}` expression inside
`run:`, a hook after an early return, a field-by-field merge of stored
credentials. The MFA spec lists both which routes must require the factor and
which must not — enrolment cannot depend on the factor being enrolled — so adding
a route forces a decision instead of defaulting to unguarded.

Also `reference-analysis.spec.ts`, which guards the published run's properties
rather than freezing its numbers: the buckets partition the findings exactly,
nothing counts as settled without a real catalog lookup, and the handed-back
bucket is never silently emptied. An empty red band would read as "we transform
everything".

223 passed, 0 failed.

## [v2.4.0] — 2026-08-26

Clean core levels stop being an estimate. SAP publishes a second classification
file that this repo was not syncing; with it, levels A, B and D become lookups
against SAP's own data instead of inferences from a risk heuristic. Alongside
that, the search-visibility fixes that three months of Search Console data
showed were losing traffic the site had already earned.

### Added
- **`objectClassifications_SAP.json` is now synced** (formatVersion 2, 8,587
  entries after normalisation). It carries the two states that separate level B
  from level D: `classicAPI` (8,116 — documented, upgrade-stable classic APIs)
  and `noAPI` (471 — not intended for customer use). It is near-disjoint from
  `objectReleaseInfoLatest.json` (196 keys overlap), so catalog coverage grows
  from 23,696 to **32,103** classified objects.
- **`gradeFromSapStates()` and `gradeSapObject()`** derive the clean core level
  from SAP data: `released` → A, `classicAPI` → B, `noAPI` / `notToBeReleased`
  → D, `deprecated` → C with a successor and D without. An SAP object listed in
  neither file is graded C, which is what the clean core level concept defines
  level C to be. Every result carries a `provenance` field (`catalog`,
  `catalog-residual`, `heuristic`).
- **`/api/abcd-classify`** — auth-gated, read-only batch lookup, capped at 500
  objects per call. It exists because the analyze panel is a client component
  and the catalog artifacts are ~4 MB: names go out, grades come back, and the
  analyze bundle stays at 161 kB.
- **A–D census on `/sap-clean-core-object-classification`** — the distribution
  across everything SAP publishes (A 72.1% · B 24.7% · C 0.2% · D 3.0% over
  32,103 objects), with both source files named by sha256 and fetch date so the
  figures can be reproduced. Labelled as a census of SAP's data, not a
  benchmark of any customer's code.
- **Enhancement and modification detection** — two new evidence kinds. Statement
  level: `ENHANCEMENT`, `ENHANCEMENT-POINT`, `ENHANCEMENT-SECTION` (level D
  technologies), `GET`/`CALL BADI` and `CL_EXITHANDLER=>GET_INSTANCE` (level B,
  reported at low severity so an SAP-provided extension point is not penalised
  like a modification). Modification markers (`*{ INSERT|REPLACE|DELETE`) are
  full-line comments that `tokenize()` drops by design, so they are matched
  against the raw source in a separate pass — without it, the most severe clean
  core violation was invisible to the engine. Both feed the Clean Core Score.
- **`/llms.txt`** — previously a 404. States what the site holds, the figures
  worth citing with their provenance, the entry points and the limits. Figures
  are read from the generated artifact, not hardcoded.
- Registry entries for the 2025 PCE releases and the BTP release file. A grade
  is release-dependent: an object released in 2025 is still unreleased against
  a 2023 target.

### Changed
- **The A–D grade is now presented in two tiers instead of one blanket
  disclaimer.** Looked-up grades are marked "SAP data" with the state that
  produced them; only customer Z/Y objects, which SAP cannot have classified,
  fall back to the heuristic and are marked "est.". The analyze panel states
  the split ("N of M grades come from SAP's published object data"). The grade
  remains outside the signed audit pack, and every surface still says so.
- **Catalog object pages show the clean core level** under the object name
  (VBAK → D, `notToBeReleased`; MAKT → C, listed in neither file).
- **`/knowledge` FAQ answers are in the server HTML.** They were rendered as
  `{isActive && (...)}` with `activeFaq` starting at `null`, so the page shipped
  five headings and no substance — 5,401 characters of visible text in a 63,719
  byte page, with the answers reachable only inside the JSON-LD block that text
  extractors strip. The answer now stays in the DOM and collapses visually; the
  header became a real button with `aria-expanded`/`aria-controls`. Visible
  text: 5,401 → 8,633 characters.
- **`dateModified` in the homepage JSON-LD tracks the release constant.** It was
  frozen at 2026-06-26. The new `APP_RELEASE_DATE_ISO` is an explicit literal:
  deriving it from `APP_RELEASE_DATE` via `toISOString()` shifts the date one
  day back in every positive UTC offset, CET included.
- **`/sap-cloudification` leads with the lookup.** It held position 8.4 on
  "cloudification repository (viewer)" queries at 0.11% CTR because its snippet
  read as an article. Title, description and an above-the-fold entry point now
  point at `/catalog`, which already carried the correct title but ranked lower.
- **`/whitepaper` retitled** to lead with the searched term rather than the
  product name (position 12, 0% CTR over three months).
- **SAP BAIP is documented alongside SAP BTP, not instead of it.** SAP announced
  the Business AI Platform at Sapphire 2026, but shipped "SAP BTP ABAP
  Environment — Release 2608" on 15 August 2026 under the old name. BTP stays
  as the name of the concrete services; BAIP is noted as the portfolio around
  them in the glossary, the chatbot knowledge base and on `/knowledge`.

### Fixed
- **The ATC severity mapping is no longer asserted as SAP doctrine.** `ABCD_META`
  published A/B/C/D = no message/P3/P2/P1 as fact, and no SAP source for that
  mapping could be cited. The field is now `atcReading` and is shown as our
  reading; the four places in public copy claiming the grades "map to ATC
  priorities" no longer say so.
- **FUGR rows in the classification file are indexed by function module.** SAP
  puts the function GROUP in `tadirObjName` and the MODULE in `objectKey`, and
  custom code calls the module — 5,246 entries would otherwise have been filed
  under a name nothing looks up.
- `released` takes precedence over `classicAPI` for the 196 objects listed in
  both files. Reversed, it would have silently downgraded released objects from
  A to B. Covered by test.
- The hero on the classification page said SAP grades "technical objects"; SAP
  grades extensions.

### Fixed — false positives found by an external code review

A Grok 4.6 review over the full codebase surfaced four defects in the evidence
engine, all reproduced before fixing. Three of them predate this release; they
are fixed here because they put wrong findings in front of architects.

- **Internal table operations were reported as database writes.** ABAP spells
  internal-table and database access with the same keywords, and the detectors
  matched the first token after INSERT/MODIFY/DELETE. `INSERT ls_wa INTO TABLE
  lt_vbap.` produced a Critical "direct write to SAP standard table LS_WA", and
  `INSERT LINES OF …` produced one against an object called LINES. Since every
  real ABAP program uses internal tables constantly, this inflated the Critical
  count, depressed the Clean Core Score and could flip the routing decision to
  side-by-side. The engine now collects the data objects declared in the source
  and excludes them, guards on the clauses that only exist in the internal-table
  form, and treats `DELETE itab WHERE` (no FROM) as internal. Where syntax alone
  cannot decide — `MODIFY lt_x FROM ls_y` and `MODIFY dbtab FROM ls_y` are
  identical — a conventional ABAP prefix decides, but only for names absent from
  both SAP artifacts: 103 real SAP objects (CS_BOM_EXPL_MAT_V2, RS_*, CT_*) share
  those prefixes and must stay detectable.
- **The correct ABAP Cloud pattern was reported as a violation.** `SELECT * FROM
  i_salesorder` was a High "illegal standard-table read" on public cloud, with
  the invented successor `I_I_SALESORDER`. I_SALESORDER is `released` in the
  artifact the engine already loads. Released objects are now the target state,
  not a finding.
- **Successors are no longer guessed.** An unmapped object produced
  `sapReplacement: I_${name}` at confidence "Candidate" — an object that does not
  exist, shown beside a catalog version. Only real catalog matches are emitted.
- **The release state now decides before the classification state.** 180 objects
  appear in both SAP files; 158 are released, and the other 22 are `classicAPI`
  together with `notToBeReleased` or `deprecated`. 21 of those 22 carry an
  explicit successor (CL_HTTP_CLIENT → IF_WEB_HTTP_CLIENT, CL_BCS →
  CL_BCS_MAIL_MESSAGE). Level B means "usable where no level A path exists", and
  here SAP names the path, so B was wrong. The published census moves
  accordingly: B 7,958 → 7,936, D 938 → 959, C 68 → 69.
- **Reserved-namespace objects are no longer claimed as SAP-internal.**
  `/ACME/TABLE1` was graded residual C, and a write to `/ACME/ZTAB` was a
  Critical standard-table violation. A `/NS/` name can belong to SAP, a partner
  or the customer; when it appears in neither artifact the grade falls through to
  the heuristic and is labelled estimated. Namespaced objects SAP does list
  (/AIF/CL_TRANSFORM_DATA) keep their catalog grade.

### Added — a guard against the class of bug above

`tests/false-positive-guard.spec.ts` (16 tests). The three existing engine specs
carry 116 assertions between them and not one asserts absence — no
`toHaveLength(0)`, no `.not.`, no `toBe(0)`. Every test states that a pattern
*produces* a finding, so a detector that fires on everything passes all 116. That
is how these defects survived. The new spec asserts what must NOT be reported,
with a "must still fire" block so suppression cannot regress the other way.
- **`tar` bumped past GHSA-r292-9mhp-454m.** The existing override pinned
  `^7.5.16`, which resolved to 7.5.19 — still inside the advisory's `<=7.5.20`
  range, so the Security CI gate (audit-ci, high+) failed while the deploy gate
  (`--omit=dev --audit-level=critical`) passed, because `tar` is a dev-only
  transitive. Override is now `^7.5.21`, resolving to 7.5.22. The lockfile was
  regenerated with the pinned Node 22 / npm 11 toolchain, and the nested
  `@apidevtools/json-schema-ref-parser/node_modules/js-yaml` entry that local
  npm 10.5 silently drops was verified present afterwards.

## [v2.3.1] — 2026-08-20

Community activation. A long-form Clean Core explainer built to be forwarded, a
paper edition of it as a PDF, and the sharing affordances around both. Nothing in
the analysis engine or the trust chain changed.

### Added
- **`/clean-core-explained` — the complete Clean Core explainer.** Seven parts,
  about twenty minutes, every term defined before it is used: from what "the core"
  is and why modifying it breaks upgrades, through the five dimensions and the
  in-app-versus-side-by-side decision, to the A–D grading model. Part 6 states what
  Clean-Core.io does per stage with its benefit, its effort and — as plainly —
  *where it stops*, followed by Honest Scope.
- **Content as data.** `lib/clean-core-guide.ts` and `lib/clean-core-capabilities.ts`
  hold the material; the visible text and the `Article` + `FAQPage` JSON-LD are
  generated from the same objects, so the two cannot drift.
- **`/clean-core-explained-print` and a PDF build step.** A second renderer over the
  same data with a cover, controlled page breaks and ink-frugal styling, printed to
  `public/clean-core-explained.pdf` by `npm run build:guide-pdf` (Chromium, so the
  result is vector text with real page numbers). `-- --check` compares a hash of the
  source files against `public/clean-core-explained.pdf.sha256` and fails if the PDF
  is stale. The route is `noindex` and outside the `(app)` group, so it inherits no
  header, footer or chatbot.
- **Share bar at the top of the guide** (`components/GuideShareBar.tsx`): copy the
  link, download the PDF, share on LinkedIn. Staggered entrance, hover lift and a
  copied-state confirmation; everything collapses to a plain fade under
  `prefers-reduced-motion`.
- **Landing announcement.** A "NEW" pill above the hero eyebrow pointing at the
  guide, plus nav, footer, sitemap and knowledge-hub entries.
- **Campaign registry in the bulk sender.** `scripts/send-community-mail.ts` now takes
  `--campaign`; the id recorded in `email_sends`, the subject and the two template
  files are registered together so they cannot drift apart.

### Changed
- **Landing header spacing.** A fourth nav item made the labels wrap onto two lines,
  which read as uneven spacing. Labels are now `whitespace-nowrap`; to make room the
  community badge appears from `2xl` and *Classification A–D* from `xl` (both remain
  reachable from the hero eyebrow and the footer). Verified at 390 / 768 / 1024 /
  1152 / 1280 / 1440 / 1536 / 1920 px.
- **Comparison tables restack on phones.** `.doc-table` (in `app/globals.css`) turns
  three-column tables into labelled blocks below 640px — one DOM, so crawlers and
  screen readers still receive a real `<table>` instead of a sideways scroll.
- **Print edition: 21 pages down to 15.** `break-inside: avoid` on `.chapter` was the
  cause; two chapters measured 1001px and 1090px against a 979px page, so the rule
  could not be honoured and the fragmenter stranded the pages before them at under
  16% full. Only small units stay atomic now, `.part:first-of-type` (which never
  matched, because the answer box is also a `<section>`) became an explicit class,
  and the setting is tighter — body leading 1.62 → 1.52, a narrower term column —
  so the vocabulary list and the FAQ each fit their page.

### Removed
- **`/api/share/guide`, the mail-the-PDF endpoint.** Removed at the owner's call
  before it saw real traffic. An unauthenticated endpoint that sends mail from this
  domain to an address a stranger types is a spam relay unless every defence holds
  at once, and the domain also carries the community list — one abuse incident would
  have cost deliverability for every recipient on it. The defences were in place
  (constant subject, name stripped to letters, per-IP and global rate limits,
  honeypot, nothing stored), but the downside was uncapped and the upside was saving
  a sharer one attachment step. The download covers the same intention.

### Operations
- Community mail `clean-core-explained` sent to 30 recipients (0 failures); the
  account holder had already received it as the test send.
- The manually-registered "Super Duper" test account was added to
  `email_suppressions` — `lib/test-accounts.ts` only recognises CI-created accounts,
  and `ifcoat.com` is a disposable-mail domain, so a bounce there would have cost
  reputation on the first bulk campaign.

## [v2.3.0] — 2026-08-19

Metering realignment. The free community quota now counts what the product actually
promises — ABAP-to-Cloud transformations — instead of individual AI calls, and the
Admin Control Room gained a live view of that consumption per user.

### Changed
- **The metered unit is now one analysis run, not one Gemini call (BREAKING for
  metering semantics).** The quota gate moved from `/api/gemini` to
  `/api/runs/create` (`reserveRunQuota` in `lib/firebase-admin.ts`). Previously every
  AI request was charged, so a single ABAP object cost 6–7 units across the seven
  workflow stages — a free account could not finish one project, which contradicted
  both "Up to 5 ABAP-to-Cloud transformations" and "Full 7-stage modernization
  workflow — every feature included" on the pricing card, and Terms §6. One object
  now costs exactly one unit; design, transformation, documentation, testing, TCO and
  delivery are unmetered.
- **The glossary chatbot no longer consumes quota.** It falls out of metering with the
  gate move, without a special case in the code. The same applies to the test-suite
  self-healing loop, which could previously burn up to five units in a single click.
- **Charging is idempotent per source fingerprint.** Re-analysing the same ABAP source
  — a retry, a tweak, the same object in a second project — is free. Paid-for
  fingerprints live in `users/{uid}.chargedInputs`, which the Firestore rules keep
  outside the client's write allowlist, so it cannot be forged.
- **Terms §6 now names the unit precisely** — what counts, what does not, and that
  re-analysis is free.

### Added
- **Starter examples for every account.** `abap_examples` is per-user and starts
  empty, so an approved account's first task was extracting custom ABAP out of a
  customer system — an IP and effort hurdle before any value had been shown, and
  two thirds of accounts never cleared it. Seven realistic, fictional legacy reports
  (87 to 1,000 lines, the same files the engine is regression-tested against) now sit
  on the dashboard above the personal library. One click creates the project with the
  source staged and lands in the analysis. Served from `public/starter-examples/` and
  fetched on demand, so the ABAP never enters the client bundle.
- **`/first-run` — the click-by-click first run.** Seven steps from signing in to a
  downloadable package, naming the literal on-screen labels and what should appear
  after each click. `/how-to` keeps the narrated tour and links here.
- **One-click unsubscribe (RFC 8058).** `POST /api/unsubscribe` honours an
  unauthenticated, signed-token opt-out — the `List-Unsubscribe` /
  `List-Unsubscribe-Post` target Gmail and Yahoo require of bulk senders. GET hands
  the reader the `/unsubscribe` confirmation page instead of acting, since scanners
  and prefetchers follow GETs. Opt-outs land in `email_suppressions`, server-only in
  the rules. Tokens are HMAC-signed with `PILOT_APPROVAL_SECRET` under a separate
  `unsub` purpose (`lib/unsubscribe-token.ts`), so no new deployment secret is needed.
- **`scripts/send-community-mail.ts`** — batched bulk sender. Dry run by default;
  excludes CI accounts, suppressions and anyone already recorded in `email_sends` for
  the campaign, so an interrupted run resumes without double-sending.

- **Admin Control Room: "Usage & Quota" section** (`components/admin/UsageQuotaPanel.tsx`).
  Live `onSnapshot` on `users` — no new API surface — with a KPI strip (units consumed
  vs. granted, distinct ABAP objects, active last 7 days, accounts at limit, BYOK,
  total), per-user meters, filters (at limit / active / unused / BYOK), search, sorting
  and an expandable per-user detail row.
- `tests/admin-usage-panel.spec.ts` — E2E coverage of the panel against a seeded cohort
  (fresh, partial, exhausted, BYOK, pending), including a clipping measurement on the
  expanded detail row.

### Removed
- The dead client-side charging path: the `incrementTransformations()` no-op in
  `useUserProfile` and the `charged`-flag guard in the analyze stage, both of which
  suggested a per-project charge that had not been in effect since F-06.

### Security
- `/api/gemini` keeps authentication, MFA, the account-state gate and `assertRateLimit`.
  With per-call metering gone, that rate limit (20/h per user+IP) is now the primary
  cost guard on the shared community Gemini key.

## [v2.2.0] — 2026-07-11

Codex Delta "part 2" — the trust-boundary items deferred from v2.1.0, done as
non-breaking changes with live-production safety as the hard constraint (E2E stays
green, the environment stays runnable). Structured and verified via the fable-method loop.

### Changed
- **Untrusted test runner is now network-egress-blocked (F-01, P0).** `/api/run-tests`
  preloads a guard into the sandboxed child (`--import __netguard.mjs`) that neutralises every
  outbound path — `net.Socket.prototype.connect`, `net.connect`/`createConnection`, `dgram`,
  global `fetch`, `process.binding`, and every `dns` entry point (c-ares/getaddrinfo bypass
  `net.Socket`) — BEFORE the test bundle loads. With the existing Node
  permission model (no child-process/worker/native-addon escape), pure-JS test code can no
  longer reach the GCP metadata endpoint (`169.254.169.254`) or any network — closing the
  runtime-identity token-exfiltration path. **In-cloud CAP test execution is kept.** Verified
  locally through the real `node:test` runner path (fetch/`net.connect` blocked, normal tests
  pass). Defense-in-depth, not a formal microVM boundary — the isolated runner service remains
  roadmap.
- **Audit pack ships a signed provenance manifest (F-04).** A new \`00-provenance.md\` (hashed +
  HMAC-signed like every other file) labels each evidence file and headline field by class —
  \`server-computed\` / \`model-generated\` / \`user-attested\` / \`static\` — making the
  signature's meaning explicit (package integrity, not per-value determinism) so auditors can
  separate deterministic facts from AI drafts and self-attested inputs.
- **A/B/C/D preview derivation is more honest (F-05).** Added an \`Unknown\` grade for
  insufficient evidence (no more silent default to Medium), unknown catalog state now maps to
  \`Unknown\`, and a \`worstGrade()\` worst-finding rollup helper — unit-tested
  (\`tests/abcd-classification.spec.ts\`). Still a labelled preview, excluded from the signed pack.

### Deferred (roadmap)
- Fully isolated zero-trust runner service (F-01 gold standard), append-only reviewEvents
  provenance refactor (F-04), full SAP target-release A/B/C/D model (F-05), dedicated runtime
  service account (F-12), operational control-evidence pack (F-13), and asymmetric
  offline-verifiable signatures (F-18) — infra/crypto-heavy, deferred to protect live stability.

## [v2.1.0] — 2026-07-10

Trust-boundary hardening per the Codex v2.0.0 Delta / Tiefenanalyse review (2026-07-10).
Closes the central-authorization, deletion, admin-MFA, provenance-labeling and claim-hygiene
findings (gates G0–G2). The untrusted test-runner network isolation (F-01, P0) is tracked
separately and intentionally deferred in this release.

### Added
- **Central account-state gate `assertAccountActive`** applied to every business API
  (`/api/gemini`, `/api/runs/create`, `/api/audit-pack/create`, `/api/run-tests`,
  `/api/secrets/gemini`): a `pending`/`suspended`/stale-Terms account is consistently 403 —
  **including the BYOK path**, which previously bypassed the shared-quota approval check (F-02).
- **Server-authoritative project deletion** `DELETE /api/projects/{id}` using Admin SDK
  `recursiveDelete`, so the immutable `runs/{runId}` subcollection is purged too. Client
  project deletes are disabled in Firestore rules; the account-erasure cascade gained a
  collection-group backstop for legacy orphaned runs (F-03).
- **Server-authoritative Terms consent** `POST /api/consent`: append-only `consent_events`
  (server timestamp + server-derived email), mirrored to the profile; the account gate
  enforces re-consent when a previously accepted version goes stale (F-16).

### Changed
- **A/B/C/D "Cloud Readiness Classification" is now an explicit Experimental Preview** in the
  analysis panel and knowledge page, and is **removed from the signed audit pack** — it is a
  heuristic estimate, not an authoritative SAP ATC classification (F-05).
- **Admin actions require enrolled MFA** — `assertAdminStepUp` fails closed without it in
  production (relaxed only under the Firebase emulator for CI/E2E) (F-06).
- **Account erasure no longer swallows partial failures** — errors are collected, a missing
  resource is tolerated as idempotent, and a partial erasure throws instead of reporting
  success (F-07).
- **Rate-limit records are pseudonymised** (HMAC document id) and carry an `expiresAt` for a
  Firestore TTL, so they hold no durable PII and self-expire (F-10).
- **Gemini model allowlist** cleaned — dead 2.0 IDs removed; GA vs. preview documented (F-09).
- **Overstated public claims corrected** across the whitepaper page + PDF, board deck,
  homepage, trust page, feature content, transactional emails, settings and onboarding:
  "deterministic AST engine" → deterministic evidence scanner; "credentials in memory only" →
  encrypted at rest, server-side only; "atomic/immediate erasure" → idempotent multi-system
  workflow; "GDPR-compliant by design" / "conform fully to GDPR" → GDPR-aligned; "all
  permissive licenses" → generated inventory reviewed per build; residual "Tier-2" → "classic";
  fixed the `vv2.0.0` double-`v` render (F-08, F-14).
- **Security dependency audit is now a required deploy gate** (`deploy.needs: [validate,
  security]`, `npm audit --omit=dev --audit-level=critical`); the client-bundled
  `NEXT_PUBLIC_GEMINI_API_KEY` test env var was removed (F-11).
- **Old `/sap-tier-2-extensions` URL** permanently redirects to
  `/sap-clean-core-object-classification` (F-17).

### Fixed
- **`scripts/verify-export.ps1`** uses `-LiteralPath` throughout, so Next.js dynamic-route
  files (`[projectId]` etc.) no longer report a false "File missing" (F-15).

### Security / deferred
- The mock purchase-order route and the incomplete Jira OAuth callback are gated out of
  production behind flags so they cannot return a simulated success (F-19, F-20).
- **Deferred (roadmap):** isolated zero-trust test runner (F-01, P0), full per-field audit
  provenance model (F-04), full SAP-exact A/B/C/D derivation (F-05), asymmetric offline-
  verifiable signatures (F-18), operational control-evidence (F-13) and the enterprise
  identity/governance track.

## [Unreleased] — Promo-readiness hardening (2026-07-07)

Claim-hygiene and a real GDPR erasure fix ahead of broader promotion, per the Codex
Promo-Readiness Delta review (2026-07-06). No feature changes.

### Fixed
- **Admin account deletion now runs the full GDPR Art. 17 cascade.** `adminDeleteUser`
  previously removed only `users` + `registration_requests`, orphaning projects, immutable
  runs, encrypted BYOK/S4 secrets, MFA data and the Firebase Auth account. It now delegates
  to `deleteUserDataAndAccount` (identical to self-service deletion); the Auth delete is
  idempotent (`auth/user-not-found` tolerated). Covered by a new emulator E2E test
  (_admin console delete-user runs the full GDPR erasure cascade_).

### Changed
- **Softened absolute GDPR/EU/sovereignty claims** to defensible wording across the trust
  page, landing page, about page and board deck: "GDPR-aligned", "EU-hosted storage", and
  explicit disclosure that AI (Gemini) and email (Resend) subprocessors process data under
  their own terms — instead of "GDPR Compliant", "data does not leave the EU",
  "strictly enforced / fully sovereign".
- **Landing `/whitepaper` page** now mirrors the downloadable PDF (LinkedIn whitepaper)
  content and drops the "fits enterprise procurement expectations" wording.
- **Business SOP & Compliance** documentation is generated in pure business language — no
  IT/technical terms (those already live in the Technical Blueprint).
- **Video subtitles** (en/de/es): "Pilot" → "Free Community Edition", "automated SaaS engine"
  → "free community assistant", "final deployable asset" → "reviewable handover package".
- **Footer & sitemap**: added `/terms` and `/licenses` to the shared site footer and sitemap.
- **Terms consent**: record `termsVersionAccepted` + `termsAcceptedAt` at signup (additive
  Firestore rule, deployed to all databases); `COMMUNITY_QUOTA` centralized.

### Removed
- **Stale public self-certification / marketing artifacts** carrying unsupported claims:
  `public/whitepaper-template.html` ("CISO APPROVED", "Customer-Grade", "fully sovereign"),
  `public/QE_Engineer_Report.pdf` + `public/report-template.html` ("RELEASE-TESTS PASSED",
  "This document certifies…"), the `generate-report.js` script + `build:report` npm script,
  and the admin "Quality Engineering Audit" banner.

## [v2.0.0] — 2026-07-02

Special milestone release: a **security-hardened, audit-friendly trust chain and operational readiness** for the Free Community Edition, plus a **sharpened community / complementary narrative**. This is not a certified, procurement-grade enterprise platform — enterprise identity/governance features (SSO, multi-role RBAC, formal DPA/TOMs, external pentest) are intentionally in the backlog for the current audience — see `docs/ROADMAP-2.0.md`.

### Added
- **Server-authoritative audit packs** (`POST /api/audit-pack/create`): evidence files are generated, hashed and HMAC-signed entirely server-side from the immutable run — the client never supplies content or hashes for signing.
- **Complete GDPR Art. 17 erasure**: the deletion cascade now purges `runs` subcollections, encrypted BYOK keys (`user_secrets`) and `mfa_pending`; enforced by an automated test.
- **Supply-chain CI** (`.github/workflows/security-ci.yml`): gitleaks secret scan, `audit-ci` High/Critical gate, and a CycloneDX SBOM.
- **`/api/health`** liveness/readiness probe and **structured JSON logging** on critical routes (`lib/logger.ts`).
- **Public `/trust` page**, `docs/DATA-RETENTION.md`, `docs/INCIDENT-RESPONSE.md`, `docs/OPERATIONS.md`, `docs/ROADMAP-2.0.md`, and **SECURITY.md v4.0** documenting the evidence trust chain.
- **Public SAP Object Catalog** (`/catalog`) — hundreds of SEO/GEO reference pages generated from the merged Cloudification catalog.
- **Test auto-healing**: on a compilation error the AI repairs the offending module/test code and retries automatically.
- Full emulator-backed trust-chain E2E tests (audit-pack + sign endpoint negatives: foreign user, stale run, missing runHash).

### Changed
- **Narrative**: removed monetization/locked-export UI and premium signals — every feature is free (5 transformations; BYOK for unlimited); retired visible "pilot" wording in favour of "Free Community Edition" (internal tier identifiers are kept for compatibility); positioned as **complementary** to SAP tooling (ADT/ATC), not a competitor.
- The **AI narrative is excluded from the signed run payload** — signatures attest to server-computed evidence, not client free-text.
- Global **SAP non-affiliation trademark disclaimer**; removed false "certified / SAP-approved" claims; unified ROI figures; hedged absolute claims.
- Migrated Excel parsing from `xlsx` (unfixed advisory) to `exceljs`; dropped `xlsx`.

### Fixed
- **Empty Solution Design** (production): Firestore rules had never been deployed to the named production database, so the `runs` subcollection was unreadable and analysis never reached downstream pages. Rules deployed to all databases + multi-database `firebase.json` and an `npm run deploy:rules` script.
- **Blank Target Architecture diagram**: the SVG sanitizer stripped mermaid's `<foreignObject>` labels; added a mermaid-aware sanitizer that preserves labels while stripping active content.
- **False "analyzed with an older engine" banner**: run-capability detection now reads findings from `evidenceReport`.
- **Test sandbox "esbuild not installed"**: moved `esbuild` to runtime dependencies.
- `loadProjectAndHydrate` now surfaces run-load failures instead of silently rendering an empty page.

## [v1.22.1] — 2026-07-02

### Fixed
- **Usage Persistence**: Added `usageReport` to Firestore Rules project update allowlist with `is map` validation. Usage imports now persist across page reloads.
- **Usage Bucketing (Low ≠ Dormant)**: Introduced new `low` usage bucket for objects with below-average but non-zero, recent usage. Low-frequency objects (monthly closings, year-end, audit reports) are no longer misclassified as `dormant` or `retire-candidate`.
- **Retire-Candidate Guardrails**: `retire-candidate` quadrant now requires zero usage or 13+ months dormancy. Description updated to require "business owner confirmation" before retirement.
- **Call Count Locale Parsing**: Fixed number format ambiguity where `1,234` (EN) was misinterpreted as `1.234` → rounded to `1`. New locale-aware parser correctly handles DE (`1.234`), EN (`1,234`), mixed (`1.234,00` / `1,234.00`), and space-separated (`1 234`) formats.
- **Solution Design Generation**: Fixed object/string type mismatch in `prepareAnalysisContext()` where Firestore hydration returned analysis as an object instead of a string. Added comprehensive `[Design]`-prefixed debug logging.
- **Evidence Scan Visual Overhaul**: SweepVerdictBar with stronger contrast, colored top borders, scale effects. SweepCodeViewer with larger fonts, line-level severity highlighting. Minimum scan duration increased to 6 seconds.
- **Export Script P0 Fix**: Replaced all `-Path` with `-LiteralPath` in `export-source.ps1` to correctly handle Next.js dynamic routes with square brackets (`[projectId]`).

### Changed
- **Risk Matrix UI**: Added `Low Usage` row with yellow color scheme between Moderate and Dormant. Tooltips for Low, Dormant, and Unknown rows explaining classification logic.
- **package-lock.json**: Regenerated from scratch to fix Cloud Build `npm ci` sync failures (missing `js-yaml@3.15.0`, `argparse@1.0.10`).

## [v1.22.0] — 2026-07-02

### Added
- **Usage Import & Risk Prioritization**: Upload SAP usage exports (SCMON, UPL, ST03N) for usage-weighted risk analysis. Format-tolerant parser with CSV delimiter sniffing and XLSX support via SheetJS.
- **Risk/Usage Matrix**: Interactive 2D quadrant visualization (Usage × Feasibility) with drill-down object detail flyout. Quadrants: Danger Zone, Prioritize, Retire Candidate, Low Priority, Unknown.
- **"Unknown ≠ Dormant" Safeguard**: Objects without usage data always show "Unknown" status with mandatory tooltip. Never classified as unused or retire-candidate without evidence.
- **Privacy-First Import Layer**: Whitelist-based PII sanitization strips usernames, terminals, IPs before persistence. Only object × frequency stored. 90-day retention TTL.
- **UPL Aggregation**: Procedure-level Usage & Procedure Logging exports automatically aggregated to object-level for evidence engine matching.
- **Run Capabilities Extension**: Shape-based `hasUsageData` capability. Usage is optional — absence does not trigger legacy run.
- **Solution Design Rendering Patch**: All design page sections wrapped in SectionBoundary for crash isolation. LegacyRunBanner for pre-v1.14 runs. RoutingRationale/TargetArchitectureDiagram data guards.

### Changed
- `lib/run-capabilities.ts` extended with `usageReport` field and `hasUsageData` capability
- `lib/types.ts` Project interface extended with `usageReport` field

## [v1.21.0] — 2026-07-02

### Added
- **Evidence Sweep Animation (v1.21 Roadmap)**: Real-time animated overlay during analysis that replays the instant `buildAbapEvidence()` scan results. Findings appear sequentially with a glowing scan-line sweeping through the source code, replacing the previous fake loading stages.
- **SweepCodeViewer**: Monospace ABAP code viewer with syntax highlighting, line numbers, finding badges pinned to exact code lines, and auto-scroll following the scan-line position.
- **SweepVerdictBar**: Animated severity counter tiles (Critical/High/Medium/Low) that tick up as findings appear. Verdict "locks in" with glow pulse on completion.
- **EvidenceSweep Orchestrator**: Sequences finding reveals over ~3.5s minimum duration. Gemini API call runs in parallel — results are buffered until the sweep animation completes.
- **Accessibility**: `prefers-reduced-motion` skips animation entirely and shows instant end-state. `aria-live` on verdict region. All new components fully responsive (mobile-first).

### Fixed
- **Solution Design 1000+ LOC Bug**: Fixed critical bug where Solution Design generation failed for large ABAP programs (1000+ LOC). Added `prepareAnalysisContext()` that extracts only design-relevant analysis fields (capped at 15K chars) instead of dumping the full 30-50KB raw analysis JSON into the design prompt.
- **Design Error State**: Replaced silent `alert()` with persistent `designError` state and visible error UI with retry button and contextual guidance.

## [v1.20.0] — 2026-07-02

### Added
- **SAP Cloudification Repository Integration**: Analysis engine now maps against SAP's official Cloudification Repository (23,696 classified objects) — the same authoritative source SAP's own ATC compliance checks use.
- **Layered Catalog Architecture**: Curated field-level entries (Layer 1) always take precedence; SAP repository entries (Layer 2) provide broad, authoritative coverage. Each finding carries its source layer (`curated` vs. `sap-official`) for full audit traceability.
- **No-Path Verdicts**: Objects without released successors now produce a positive "no clean path" signal backed by SAP's official classification — not just absence from a curated list.
- **Auto-Sync Pipeline**: Weekly GitHub Actions workflow (`sync-catalog.yml`) syncs the repository, generates a deterministic artifact (SHA-256 verified), and opens a PR. Catalog version in every Audit Pack includes commit hash, entry count, and fetch date.
- **Dynamic Catalog Badge**: Landing page comparison section shows live classified-object count from the synced artifact.

### Changed
- **Narrative Correction**: Corrected terminology from "SAP API Business Hub" to "SAP Cloudification Repository" across all public-facing pages (landing page, how-it-works, ABAP analysis, QuickAnswer blocks).
- **T005 Mapping Upgrade**: T005 (Countries) now correctly maps to `I_COUNTRY` (SAP-official) instead of guessed `I_T005`.

## [v1.19.0] — 2026-07-02

### Trust Chain Closure (Security / P0)
- **Downstream Run Enforcement**: All 6 downstream pages (Design, Transformation, Testing, Documentation, Delivery, TCO) now enforce `activeRunId` presence via `enforceActiveRun()` guard. Projects without an immutable analysis run are redirected to the Analyze page with an informational banner.
- **Run Guard Module**: New `lib/run-guard.ts` provides `hasActiveRun()` and `enforceActiveRun()` utilities for centralized Trust Chain enforcement across the platform.
- **Audit Pack Run Gate**: Audit Pack export now throws an explicit error when no `activeRunId` exists, preventing generation of unbound packs with empty run references.
- **Server-Authoritative Run Validation**: The `/api/export/sign` endpoint now validates that the requested run is the active run for the project (HTTP 409 if stale) and that the run has a valid `runHash` (HTTP 422 if incomplete).
- **E2E Trust Chain Test**: New `tests/trust-chain-e2e.spec.ts` with 15 test cases covering run guard logic, audit pack run gate, sign endpoint validation, downstream page guards, and module completeness.

## [v1.18.1] — 2026-07-01

### Added
- **Cryptographic Run Binding**: Server-side signing endpoint is now bound to the Firestore Run document by including the project ID, run ID, run hash, engine version, and SAP API catalog version in the signature input.
- **Unsigned Suffix Alignment**: Unsigned manifest exports also compute and check the same suffix metadata context, ensuring uniform integrity verification across all platforms.
- **Signature verification hardening**: Enforced input length and hex constraints on signature verification to protect the public API endpoint.

## [v1.18.0] — 2026-07-01

### Added
- **Enterprise Non-Functional Requirements**: Dedicated Gemini-powered call in Solution Design to generate detailed guidelines across 8 categories (Data Migration, Retention, Audit Trail, Authorization, Error Handling, Monitoring, SLAs, Cutover). Rendered using a premium accordion UI.
- **Credit Management Detection**: Deterministic finding for legacy Credit Management patterns (Z_CREDIT_*, FSCM) indicating SAP standard replacement paths and tagging for architect review.
- **Verify Pack Distinction**: Visual warning states in the Audit Verification page to clearly flag unsigned integrity-only packages from authentic (cryptographically signed) exports.
- **E2E Test Coverage**: Complete regression suite (`tests/evidence-engine-v118.spec.ts`) asserting new scanner mechanics and scoring calibrations.

### Changed
- **Verified -> Catalog Match**: Global rename of confidence labels to align with professional auditing terminology. Full backward compatibility maintained for existing Firestore runs.
- **Deployment-Aware Severity**: Calibration of Standard Fit severity where Public Cloud table reads trigger Critical/High severity warnings, and Private Cloud table reads show Medium severity upgrade risks.
- **Granular API Mappings**: Matched tables like MARD to `I_MaterialStockInStorageLocation` instead of broad Product master data, adding MARDH and MCHB mappings.
- **ROI Range Estimates**: Replaced single-value dollar figures with range-based TCO projections and baseline calibration warnings.
- **Signature Input Alignment**: Uniform HMAC-SHA256 calculation over the manifest SHA-256 hash across both PowerShell and Web-based exports.

## [v1.17.0] — 2026-07-01

### Audit Pack v2 & Signed Exports
- **Cryptographic Manifest**: Every Audit Pack ZIP now contains a `manifest.json` with SHA-256 hashes for all included files, engine metadata, and SAP API Catalog version.
- **Server-Side HMAC Signing**: New API endpoint `POST /api/export/sign` computes an HMAC-SHA256 signature over the canonical manifest using the server-only `AUDIT_SIGNING_KEY`, ensuring tamper-proof audit exports without exposing the signing key to the client.
- **Public Verification Endpoint**: New `POST /api/export/verify` endpoint allows external auditors (e.g., KPMG, SAP) to verify audit pack signatures without a platform account.
- **Verification Engine** (`lib/audit-pack-verify.ts`): Client-side ZIP integrity checker that validates file hashes, manifest consistency, and cryptographic signatures via the server endpoint.
- **Verify Pack Page** (`/verify-pack`): Drag-and-drop compliance verification page with real-time integrity badges, file-by-file hash status, signature verification, and export metadata display.
- **AnalysisRun Completeness**: Extended the `AnalysisRun` interface with `dataCoupling`, `codeInventory`, `worklist`, and recommendation fields to ensure audit packs contain all assessment data from immutable run documents.
- **Graceful Fallback**: If the signing service is unavailable, audit packs are exported with an unsigned manifest and a clear warning — no data loss or export failure.
- **Catalog Version Display**: Executive Summary and Model Card now include the SAP API Catalog version for full audit traceability.

## [v1.16.0] — 2026-07-01

### Security Hardening
- **Phase 2 — Immutable Analysis Runs & Fallback Hardening (F-01)**: Fully completed the transition to server-authoritative calculations for runs in [route.ts](app/api/runs/create/route.ts). Enforced that the server loads/validates inputs (`legacyCode` & `s4Deployment`) directly from the parent project, with a fallback to body parameters for initial uploads or re-analysis.
- **Run Metadata Cleanup**: Ensured the deletion of denormalized analysis result fields on the parent project document to prevent stale data conflicts.
- **Strict Firestore Rules Allowlist**: Overhauled update rules in [firestore.rules](firestore.rules) to enforce a strict allowlist of permitted client-writable draft/interactive fields (e.g. `status`, `s4Environment`, `solutionDesign`, `targetArchitecture`), ensuring all other metadata and results remain immutable.
- **Workflows Signing Key Verification**: Configured the GitHub Actions [deploy.yml](.github/workflows/deploy.yml) workflow to assert that the `AUDIT_SIGNING_KEY` environment secret is set before triggering compilation.
- **Cryptographic Export Signing**: Upgraded the [export-source.ps1](scripts/export-source.ps1) script to dynamically read the platform version from `package.json`, generate a `manifest.json` with file hashes, and compute an HMAC-SHA256 signature using the `AUDIT_SIGNING_KEY`.
- **Export Verification Utility**: Added a new PowerShell script [verify-export.ps1](scripts/verify-export.ps1) to verify manifest integrity and authenticate signatures of exported codebase zip archives.
- **Downstream Page Hydration**: Unified downstream page state loading by replacing direct `getDoc` calls with a shared `loadProjectAndHydrate()` resolver across all stage controllers.

## [v1.15.0] — 2026-06-30

### Security Hardening
- **Phase 2 — BYOK Server-Only Secret Store (F-01)**: Migrated Gemini API Key storage from client-readable Firestore profiles (`users/{uid}`) to a server-only encrypted collection (`user_secrets/{uid}/providers/gemini`). Credentials are encrypted at rest using AES-256-GCM under the `S4_ENCRYPTION_KEY` environment variable.
- **Client Profile Security Isolation**: Restricted Firestore client-side update access rules by removing `'geminiApiKey'` from the permitted client update keys and fully blocking direct client-side read/write access to the `user_secrets` collection.
- **Client-to-Server BYOK Endpoints**: Implemented new API routes `/api/secrets/gemini` (POST to save, DELETE to delete) and `/api/secrets/gemini/test` (POST to verify connectivity using server-side decrypted credentials) to ensure client-side code never handles cleartext keys in transit or at rest.
- **Playwright E2E Security Tests**: Added automated E2E test suites in `tests/security-compliance.spec.ts` asserting secure key rotation, API key deletion, connection testing, and Firestore rules blocking client-side access.
- **Admin Panel Reference Sanitization**: Verified and ensured the removal of name placeholders ("e.g. Sonny Frenzel") from the platform administrator and tenant approval panels.

## [v1.14.0] — 2026-06-29

### Added
- **Phase 2 & 3 — Deterministic Evidence Scanner:** Implemented a statement-based static scanner (`buildAbapEvidence` in `lib/abap/evidence-model.ts`) that extracts concrete legacy patterns (BDC, RFC, Native SQL, DB Writes, Dynpro, ALV, GUI Downloads) and persists the complete report as `evidenceReport` in Firestore.
- **Phase 4 & 7 — Extensibility Router & Score Calibration:** Added `lib/abap/extensibility-router.ts` to calculate Clean Core score, recommendation confidence, decision checkpoints, and target architectures (In-App RAP vs Side-by-Side CAP) mathematically from scanner findings, eliminating LLM hallucinations.
- **Class Model Resolver:** Created `lib/abap/class-model-resolver.ts` to build topological sort linearization and missing dependency trees, replacing the mocked `ClassModel` across all 5 analysis UI hooks.
- **Evidence Findings Table:** Added a dedicated evidence findings table to the Decision & Evidence tab — deduplicated by kind+objectName, sorted Critical→Low, with severity filter buttons and occurrence count aggregation.
- **Inline Code Viewer:** Replaced the external "DOCS ↗" link in the Gaps Worklist with an inline "View Code" toggle showing source code context (±2 lines) with amber line highlighting for each occurrence.
- **Confluence Export — Evidence & Worklist:** Added Evidence Findings table and Gaps Worklist table to the Confluence HTML export with Pattern, Lines, Snippet, Severity, SAP Replacement + Confidence, Target, Status.
- **Inheritance Unit Tests:** Added unit tests verifying inheritance linearization and missing dependencies in `tests/abap-inheritance.spec.ts`.

### Changed
- **Phase 5 & 6 — Unified Report Model & Grounding:** Restructured the Gemini prompt to act purely as a narrative generator, grounded on deterministic findings instead of raw legacy code.
- **Score Formula Recalibration:** Replaced linear per-finding deductions with diminishing returns per category and a 5% floor, producing realistic 12-18% scores for heavily legacy code (was 0%).
- **Criticality Score Boost:** Added business-critical process detection (Sales/Delivery/Credit/Audit/Partner tables and keywords) raising fulfillment code from 5/10 to 7-8/10.
- **Prompt Hardening:** Softened decommissioning language ("retire after validation and business sign-off"), added API confidence markers (Verified/Candidate/Needs Validation), hedged ROI claims with ranges and assumptions, instructed hybrid routing guidance.
- **Worklist Deduplication:** Grouped evidence findings by kind+objectName in both the Gaps Worklist and fallback builder, aggregating line numbers into a single row with `(N×)` count.
- **Sprint 1 Data Coupling:** Hardened data coupling table parser with `tokenize` statement grouping, blacklist filtering (MODE, RISK, SCREEN, LINE, ADJACENT), and correct data export mapping.
- **Dynamic Version in Exports:** Confluence report footer now uses `APP_VERSION` dynamically instead of hardcoded `v1.13`.

### Fixed
- **Language Consistency:** Translated remaining German UI text ("Aktion erforderlich" block) to English for consistent language across the entire platform.

### Security
- **Admin Rate-Limit Bypass:** Enabled admins (`admin: true`) to bypass the hourly quota limits in `app/api/gemini/route.ts` to prevent "Rate limit exceeded" blockages during large modernization runs.

---

## [v1.13.2] — 2026-06-28

### Security
- **F-15 — Seed Route Defense-in-Depth:** `/api/test/seed` now requires three independent gates (NODE_ENV ≠ production, emulator flag = true, secret header match). Returns 404 instead of 403.
- **F-03 — Mermaid Label Sanitizer:** Hardened `sanitize()` in TargetArchitectureDiagram to strip HTML tags, JS protocol, event handlers, and Mermaid control tokens.
- **F-08 — mfa_pending Firestore Rule:** Added explicit `allow read, write: if false` for audit clarity (was covered by default-deny).
- **CI Assertion:** Deploy workflow now fails if `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is accidentally set to `true` in production.

### Fixed
- **Google Auth on Production:** CSP `frame-src` was blocking `accounts.google.com`, preventing the OAuth popup from opening. Added Google OAuth domains to `frame-src` and `connect-src`.
- **F-05 — Email Registration Bearer Token:** Password sign-up now sends a Bearer token to `/api/request-pilot`, matching the Google sign-in flow. Previously, the approval email silently failed with 401.
- **Google Auth UX:** Improved error messages when both popup and redirect sign-in fail.

### Changed
- **F-10 — Admin Panel:** Replaced personal example name with generic "platform administrator" text.

---

## [v1.13.1] — 2026-06-28

### Fixed
- **Clean Core Score formula:** Redesigned from stale AI-only value to a generic weighted formula (60% deterministic construct coverage, 30% standard fit, 10% AI calibration). Scores now correctly reflect migration readiness.
- **Mermaid architecture diagrams:** Fixed empty boxes caused by DOMPurify stripping foreignObject HTML children. Diagrams now render with full labels.
- **Severity consistency:** Prioritization Matrix gap items now show Effort (complexity) matching the Worklist column instead of contradictory severity labels.
- **AI recommendation contradictions:** Reconciliation logic suppresses "rewrite" recommendations when an object is marked for decommission/retirement.

### Changed
- **Tab rename:** "Detailed Assessment" → "Assessment & Value" to surface the Business Value Audit / ROI section.
- **Cloud Service Integrations:** Labels and deep dives are now context-aware — SAP-native services (CDS Views, IAM, LUW Manager) show dedicated ABAP code patterns and "Released SAP Objects" instead of generic Node.js NPM content.
- 5 new SAP-native deep dive entries: Released CDS View, IAM Business Roles, LUW Manager, BAdI Enhancement, RAP Service Binding.

### Security
- MermaidDiagram component bypasses DOMPurify for deterministically generated chart content (no user input in chart data). All other HTML sanitization remains intact.

---

## [v1.13.0] — 2026-06-28

### Added
- **UX Concept Block A — Evidence Backbone:** Deterministic Coverage Verdict donut chart + Construct Findings checklist from `findings-detector`, replacing opaque LLM-generated coverage numbers.
- **UX Concept Block B — Progressive Output:** Sticky Decision-Header with route badge, Clean Core Score, deployment target, and "Continue to Design" CTA. Tabbed workspace layout (Evidence, Gaps Backlog, Detailed Assessment, Modernization Strategy). Sequential stage simulation logs during analysis.
- **UX Concept Block C — Interactive Gaps Worklist:** Sortable/filterable backlog table with per-row status management (Open → In Review → Signed Off), burndown progress bar, and Firestore-persisted `WorklistItem` data model.
- **UX Concept Block D — Target Architecture Diagram:** Auto-generated Mermaid flowchart from DesignData JSON (RAP/CAP). "Why This Routing" rationale panel binding Design back to Analyze evidence. Security Hardening ↔ Construct coupling badges.
- **UX Concept Block E — Input & Gap Guidance:** Missing Dependency Prompt for ancestor classes/interfaces. Pre-Analysis Preview showing LOC, recognized constructs, object type, and estimated coverage before the full analysis run.
- **UX Concept Block F — Monolith Split:** Design page decomposed into 9 modular components: `ArchitectureOverview`, `InteractiveTopology`, `ProjectBlueprintExplorer`, `ApiEndpointsCatalog`, `ApiBusinessHubMapping`, `CloudServiceIntegrations`, `SecurityHardeningChecklist`, `ModernizationRoadmap`, `SyncPatternCard`.
- 27 new component files in `components/analyze/` and `components/design/`.
- GDPR consent checkboxes and AI disclaimer integrated into the signup form.
- Inline legal consent notice ("By signing in, you agree to...") on the sign-in form.
- Auto-profile creation for Google sign-in users (no separate onboarding step).
- `CHANGELOG.md` and release process documentation.

### Changed
- Auth modal now fully responsive with `max-h-[95vh]`, scroll support, and mobile-optimized padding.
- Signup form requires GDPR + Terms acceptance before the Register button enables.

### Removed
- **Pilot Registration Modal (`UserOnboarding.tsx`):** The blocking post-login onboarding modal is removed from `layout.tsx`. Profile creation is now handled inline during authentication.

---

## [v1.12.2] — 2026-06-26

### Fixed
- Security patch A-01: `approveUserWithToken` reject branch now deletes the orphaned Firebase Auth user, preventing re-registration issues.

### Changed
- Bumped all version references from v1.12.0 to v1.12.2 across landing page, showroom, replay, sample package, and board-deck components.
- Updated `SECURITY.md` to v3.6 with A-01 finding documentation.

---

## [v1.12.0] — 2026-06-25

### Added
- Server-side two-factor authentication (MFA) via TOTP using AES-256-GCM encrypted secrets and hashed backup codes.
- Interactive Modernization Whitepaper page at `/whitepaper` (Edition 2.0) — 10-section enterprise guide.
- Firestore-backed API rate limiting on Gemini, MFA, pilot request, and tenant request endpoints.
- XSS protection (`escapeHtml`) on all email template name fields with length validation.
- S/4HANA test runner egress enforcement gate for live tenant connections.
- `rate_limits` collection in Firestore security rules (blocked from client access).

### Changed
- Hardened client-side onboarding by restricting default fields in Firestore security rules to prevent privilege escalation.
- Removed all hardcoded admin email checks — admin authorization now uses Firebase Custom Claims exclusively.
- Added `assertAdminStepUp` enforcement (recent auth + MFA) on all admin API routes.
- Enforced MFA backup code pepper minimum length (32 chars).
- Removed CSP-Report-Only header (report-only, no enforcement value).
- Updated hero CTA to link to whitepaper page instead of static PDF download.

---

## [v1.11.0] — 2026-06-25

### Added
- Redesigned Board Presentation (Stage 7): deterministic, evidence-based slides derived from project metrics and findings.
- Metrics, support-specification-matrix, and risk-register slide types in `PresentationViewer`.
- Word document (.doc) executive summary exports in client-generated Compliance Audit Pack ZIP.

### Changed
- Overall recommendation automatically downgrades based on findings severity (Worst-Case Rollup).
- Unified specifications from `SUPPORT_MATRIX` with deep links to how-it-works documentation.

### Security
- Hardened onboarding email links with action-bound cryptographic HMAC signatures and timing-safe verify routes.
- Secured Markdown and chat responses from HTML Injection / XSS using DOMPurify and `marked` sanitizers.
- Implemented strict sandbox `securityLevel` for Mermaid BPMN 2.0 flowcharts.

---

## [v1.10.0] — 2026-06-24

### Added
- Compliance Audit Pack — exportable ZIP evidence package for architecture governance and compliance reviews.
- Audit pack includes: executive summary, SHA-256 input fingerprint, architecture decision record, findings CSV, model card, and known limitations.
- Input fingerprint (SHA-256 hash) computed silently during analysis — only hashes code content, no secrets or PII.
- Model card metadata (provider, model, engine version, BYOK flag) logged per project analysis for full traceability.
- Audit Pack section in Delivery stage as collapsible accordion.

---

## [v1.9.0] — 2026-06-24

### Added
- Modernization Assessment engine computing complexity and business-criticality scores from uploaded ABAP code.
- Code Inventory and Data Coupling analysis panels with collapsible accordion UI pattern (Stage 1).
- Deterministic architecture recommendation logic (Decision Tree) based on parsed table access and code structure.
- Architect Sign-Off gate in Solution Design (Stage 2) requiring explicit target architecture confirmation.
- Override flow with justification tracking and audit trail for architecture decisions.

### Changed
- Gated Stage 3 navigation behind architecture approval to prevent mismatched transformation output.
- Created reusable `CollapsibleAccordion` and `ArchitectSignOff` UI components, fully responsive on mobile.
- Extended `Project` type with assessment fields (`complexityScore`, `criticalityScore`, `codeInventory`, `dataCoupling`, `targetArchitecture`).

---

## [v1.8.0] — 2026-06-24

### Security
- Moved GDPR account deletion to server-side transaction API, recursively purging credentials, projects, and metadata (Art. 17 compliance).
- Enforced cryptographic HMAC verification of onboarding email approval links.
- Admin-gated all live S/4HANA bridge connectivity (BYOT) endpoints behind strict role and custom-claim validation.
- Sanitized pilot welcome and administrator approval email templates against HTML injection.

### Changed
- Replaced dynamic site-generation dates with static constants in `sitemap.xml` for stable SEO crawl signals.
- Aligned documentation regarding live credentials storage (AES-256-GCM) and business data processing (stateless in-memory).
- Bumped Next.js from v15.5.14 to v15.5.19 (security advisory).
- Introduced comprehensive Playwright E2E security and compliance test suites.

---

## [v1.7.4] — 2026-06-17

### Added
- Visual Code-Transformation Compliance Shield (Hero HUD) showing dynamic scores.
- Interactive Code-Integrity Minimap heatmap scrollbar.
- Sliding Grounded Audit Drawer panel with CDS mappings, SQL quirk settings, and differential sandbox query tester.
- Realistic ABAP OO / SQL Join test script balloon in workspace for pilot testing.

### Changed
- Improved landing page with visual compliance highlights and direct links to Methodology page.
- Admin identification via Custom Claims instead of hardcoded email addresses (patch-F-10).
- Firestore log level set to silent; transient stream errors handled cleanly at point-of-use (F-09).

---

## [v1.7.3] — 2026-06-16

### Added
- Standalone `/impressum` and `/datenschutz` legal route pages for SEO and GDPR compliance.
- Transformation Showroom with real end-to-end code examples.
- `/how-it-works` page with honest coverage matrix.
- Mobile-optimized comparison table with stacked card layout.

### Fixed
- JSON-LD structured data: removed duplicate schema, added static dates for Google Rich Results.
- Improved Transformation Showroom ABAP-Unit test with proper CDS Test Double pattern.
- Corrected Quick Answer heading hierarchy (h2 → semantic span badge).
- Removed Jira Integration placeholders from Solution Design page.
- Enhanced SAP API Hub mapping accuracy for financial tables (BSEG, BKPF).

---

## [v1.7.0] — 2026-06-01

### Added
- BPMN 2.0 business process blueprinting.
- Level 5 SOP narrative generation.
- RACI matrix auto-generation.
- Side-by-side code transformation view improvements.

---

## [v1.6.0] — 2026-05-15

### Added
- Live S/4HANA tenant connection (BYOT) with admin approval gate.
- Enhanced sandbox test runner with real-time TAP output.
- Confluence blueprint export format.
- Improved abapGit ZIP packaging with proper directory structure.

---

## [v1.5.0] — 2026-04-28

### Added
- **Initial public pilot release.**
- Core ABAP parser and AST extraction engine.
- SAP API Business Hub integration.
- Dual-target code generation (RAP + CAP Node.js).
- ABAP-Unit test class generation.
- Clean Core compliance scoring.
