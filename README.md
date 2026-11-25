# Clean-Core.io

**From custom ABAP nobody understands to a rebuild draft you review, on one chain of
evidence you can check.**

For the person who has to decide what happens to a custom ABAP program, Clean-Core.io is
the free workspace that reads the code before any model does, draws the business process
as BPMN with a line anchor on every element, or the reason it has none, shows SAP's clean core level for every SAP
object it touches — and then carries the same evidence through the whole way: a target
design, a transformed code draft and test scenarios, run in an isolated runner or in your
own SAP system, all traceable to the lines they came from and sealed as signed runs. Other tools explain
code, or rewrite it. Clean-Core.io does both on one chain of evidence — and says what it
could not determine.

The code is a draft for review, not a finished product. On the CAP track the tests check
it against test scenarios in an isolated runner, not that it runs in a real SAP S/4HANA
system; on the RAP track the ABAP Unit result comes from your own SAP system, as an
imported file or your own confirmation, never as proven. Clean-Core.io is
complementary to SAP's own tooling (ABAP Test Cockpit, ABAP Development Tools, Joule for
Developers and the Custom Code Migration Agent, SAP Cloud ALM), not a replacement, and it
is not affiliated with or endorsed by SAP SE.

[clean-core.io](https://clean-core.io) · source: [github.com/sonnyfrenzel-rgb/clean-core.io](https://github.com/sonnyfrenzel-rgb/clean-core.io) ·
Apache License 2.0 · release notes: [`CHANGELOG.md`](CHANGELOG.md)

See it without an account: [the demo](https://clean-core.io/demo) clicks through the shipped example
`Z_MM_PO_APPROVAL` (fictitious code), with every figure computed by the engine of the release.

Read more: [the whitepaper](https://clean-core.io/whitepaper) (also as PDF) · [how it works,
and its limits](https://clean-core.io/how-it-works).

---

## What it does

You bring one piece of custom ABAP. A deterministic engine reads it first; a language
model only proposes names and wording afterwards, and every proposal is marked as
AI-generated.

- **The process, read from the code.** The engine reconstructs the business process the
  program implements and draws it as BPMN. Every element carries the line it came from
  (`L243`), or the reason it has none, including the business rules that are hard-coded in
  the program. What the engine could not determine is listed as *not determined*, with
  the reason.
- **Three views of one result.** Each project opens in Analyze, in the Business view;
  the IT and Management views show the same content. The Business view asks *"Do I still need this, and what changes for
  me?"*, the IT view *"What exactly, where to, and is it right?"*, the Management view
  *"What do I risk, what do I decide?"*. A view orders and explains; it never changes the
  result and is never stored with it.
- **Business first.** The Business view is the process map itself, with a walk-through
  of it step by step, the code beside the map on click, and around it what the program
  does, how it runs, why it exists, who is involved and the questions for the business —
  every sentence with its line, and the AI mark only where a model wrote. Two charts below
  the map count how a case can end and what the program changes or only reads; a row lights
  its elements on the map. The Management view opens with the decision — keep, rebuild,
  move to SAP standard or retire — and what it rests on.
- **Every project in one list.** My workspace lists an account's projects (up to 2,000) with
  their status and next step, searchable and sortable, and says when one needs attention
  and why.
- **The seven stages as tools.** Analyze · Design · Transformation · Documentation ·
  Testing · Economics · Delivery open from the workspace toolbar. Since 3.0 they follow
  SAP Fiori patterns — object pages with key figures on top and details in tabs, Design
  and Documentation canvas-first — as an independent design, not affiliated with SAP.
- **A Clean Core Score that says what it means.** Analyze puts one figure on the code,
  5–100, higher is better, in four published bands (from *far from clean core* to *close
  to clean core*), with the deductions that moved it. A grade, not a compliance
  percentage, and not an SAP measure. A map shows where in the program each finding sits;
  a click opens the code at that line.
- **Clean Core Level A–D.** Each SAP object the code uses is graded Level A–D from SAP's
  published Cloudification Repository and object classification, or marked Unknown where
  neither holds an answer, with the rule version
  that produced it. The level is an orientation, not an ATC result, and is not part of
  the signed audit pack.
- **Where each statement comes from.** Every statement carries one of nine provenance
  values: Proven, Confirmed, Reconstructed, Imported, AI-generated, Simulation,
  Demonstrated · mock, Stale, Not determined. *Confirmed* means the signed-in account
  confirmed it: a self-declaration, not a mandate.
- **One chain of evidence.** Process → design → code draft → tests → handover. The
  process carries line anchors; the design and the code draft are AI-generated drafts built
  on the signed run, and the code's plan names every finding at its line; on the CAP track the test
  scenarios run against the generated code in an isolated runner, against mocks, and the
  server records what ran on which code, and on the RAP track the ABAP Unit result is
  recorded from your own SAP system; the handover pack is signed over the run.
- **Signed runs.** Every completed analysis is stored as an immutable run, signed by the
  server with HMAC. The audit pack exported from it is signed over the run, with HMAC
  and Ed25519, and the Ed25519 signature can be verified offline against the published
  public key.
- **A process editor, and BPMN 2.0 XML both ways.** The reconstructed process opens in a
  BPMN editor; every save is an immutable revision, the reconstruction stays revision 1,
  and two revisions can be compared. The model leaves as a BPMN 2.0 XML file and a file
  can be brought back in as a proposal for the next revision. There is no connection to a
  Signavio workspace or the Signavio API; the file is yours to take along.
  Whether SAP Signavio opens the file has not been verified.
- **Read access by invitation.** A project is shared with one confirmed e-mail address,
  including its source code, until the owner withdraws it; an invitation link nobody
  accepts expires.
- **Costs only as simulation.** Economics calculates on your own assumptions; any amount
  shown elsewhere carries the *Simulation* label and the assumption revision.
- **A demo project for every account.** The demo `Z_MM_PO_APPROVAL` — the engine's reading
  of the example on every stage — with a guided tour; nothing done there is saved or counted.
- **The SAP object catalog.** A free viewer of SAP's Cloudification Repository and object
  classification at [clean-core.io/catalog](https://clean-core.io/catalog), no account
  needed.

## What it deliberately does not do

Deliberately not built: tenants and organisation accounts, single sign-on, guest access,
role mandates, a self-hosted edition, ALM adapters, portfolio or wave planning, and any
write access through an API. Accountability stays with the signed-in account. The
reasons are in [`docs/ROADMAP.md`](docs/ROADMAP.md) §8.

## Cost

Free. There is no paid tier and no payment is accepted. An account has five analysis
runs, and each starter example is free the first time it runs; after that you continue
with your own Gemini API key, which Google bills under your own agreement with Google.

## Local development

Requirements: Node.js 22.8 or later.

```bash
git clone https://github.com/sonnyfrenzel-rgb/clean-core.io.git
cd clean-core.io
npm ci
cp .env.example .env.local   # Firebase keys, GEMINI_API_KEY, AUDIT_SIGNING_KEY, RESEND_API_KEY
npm run dev                  # http://localhost:3000
```

Tests run against the Firebase emulators:

```bash
firebase emulators:start --only auth,firestore --project=cleancore-491216
npx playwright test
```

Architecture and runbook: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · design rules:
[`DESIGN.md`](DESIGN.md) · working in this repository: [`CLAUDE.md`](CLAUDE.md).

## Security and data

Model keys never reach the browser; every mutating route verifies a Firebase ID token;
S/4HANA credentials are encrypted with AES-256-GCM in a collection no client can read.
Generated CAP tests run against mocks in an isolated test runner, a service of its own;
nothing here runs ABAP Unit, whose result is recorded from your own system.
Running generated tests against a connected tenant is locked until the isolated live
runner has passed its external review. Account deletion follows GDPR Art. 17; encrypted
backups age out within 30 days.

Details: [`SECURITY.md`](SECURITY.md) · retention and backups:
[`docs/DATA-RETENTION.md`](docs/DATA-RETENTION.md) · operations:
[`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Licence

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). You may run, fork
and build on the code under that licence; you own the output you generate. The object
catalog is derived from SAP's Apache-2.0-licensed
[Cloudification Repository](https://github.com/SAP/abap-atc-cr-cv-s4hc); those files keep
their own copyright ([`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)). SAP product names
are used nominatively.
