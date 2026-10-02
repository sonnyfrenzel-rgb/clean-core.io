# Codex v2.0.0 Delta / Tiefenanalyse (2026-07-10) — Remediation Part 2 (v2.2.0)

Part 2 addresses the findings **deferred from v2.1.0** (see
`CODEX-DELTA-2026-07-10-REMEDIATION.md`). Hard constraint for this release: the app
is in **live production**, so every change is non-breaking, the E2E suite stays
green, and infra/crypto-heavy items that could destabilise live were deliberately
deferred again. Work was structured and verified with the fable-method loop.

| ID | Sev | Status in v2.2.0 | What changed |
|---|---|---|---|
| F-01 | P0 | **Mitigated (egress block)** | `/api/run-tests` preloads `__netguard.mjs` (`--import`) into the sandboxed child. It neutralises `net.Socket.prototype.connect`, `net.connect`/`createConnection`, `dgram`, global `fetch`, `process.binding` and every `dns` entry point (c-ares `resolve*` + getaddrinfo `lookup`, which bypass `net.Socket`) **before** the test bundle loads. With the existing permission model (no child-process/worker/native-addon escape), pure-JS test code cannot open **any** outbound connection — closing the metadata-endpoint token-exfiltration path. **In-cloud CAP test execution is kept.** Skipped only when infra egress enforcement is on (`S4_TEST_RUNNER_EGRESS_ENFORCED`). |
| F-04 | P1 | **Done (provenance manifest)** | Audit pack now includes a hashed + HMAC-signed `00-provenance.md` labelling each evidence file and headline field by class (`server-computed` / `model-generated` / `user-attested` / `static`). Makes the signature's meaning explicit (package integrity, not per-value determinism). |
| F-05 | P1 | **Improved (still preview)** | A/B/C/D derivation adds an `Unknown` grade for insufficient evidence (no silent Medium default), unknown catalog state → `Unknown`, and a `worstGrade()` worst-finding rollup. Unit-tested (`tests/abcd-classification.spec.ts`). Still a labelled preview, excluded from the signed pack. |

## Verification

- **F-01**: reproduced the real `node:test` runner path locally with the netguard
  preloaded — `fetch('http://169.254.169.254/…')`, `net.Socket.connect` and
  `net.connect` all throw *"Network access is disabled…"*, while a normal unit test
  passes. So the guard blocks egress without breaking test execution.
- **F-05**: `gradeFromCoupling` / `gradeFromInventory` / `gradeFromCatalogState` /
  `worstGrade` / `gradeDistribution` all assert as expected (A/B/C/D/Unknown).
- `npm run lint` and `npx tsc --noEmit` green; the added `Unknown` union member
  did not break any exhaustive usage.

## Honest scope caveat

The egress block is **defense-in-depth** (permission model + code-level network
neutralisation), **not** a formal microVM/gVisor boundary. It closes the concrete,
documented token-exfiltration path for realistic pure-JS test code and keeps the
feature — but a determined permission-model bypass is not formally excluded. The
gold-standard fix (a separate zero-trust runner service with its own no-permission
identity and network-layer egress deny) remains the roadmap item.

## Still deferred (roadmap → v2.3+)

- **F-01 gold standard** — separate isolated zero-trust runner service.
- **F-04 full** — append-only `reviewEvents` provenance refactor of the trust chain.
- **F-05 full** — SAP target-release / system-flavor required fields + repository-lookup
  per object with worst-finding rollup surfaced in the UI.
- **F-12** — dedicated minimal runtime service account (infra; risks live Firestore/
  Secret access if mis-scoped, so out of a code release).
- **F-13** — operational control-evidence pack (GCP config evidence).
- **F-18** — asymmetric, offline-verifiable audit-pack signatures (Ed25519 / KMS).
