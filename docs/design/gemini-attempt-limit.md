# Request-attempt limit for `/api/gemini` — analysis

Roadmap row "Request-attempt limit for `/api/gemini` — analyse before building"
(owner decision 13.10.2026; QA 7dd12d385189, 456824b829b3). Analysis of
5a559787, written 13.10.2026. No production code was changed.

## Outcome

1. **A refused request is cheap, but nothing limits how many arrive.** The
   costliest refused path reads 4 Firestore documents and costs about 10 ms of
   CPU. That path is a leased call that a later gate refuses. The over-quota
   path (429) reads 1 document and costs about 5 ms of CPU. Paths refused
   before any limiter (missing auth, bad token, bad body, 413, malformed lease)
   read nothing and cost 0.05–7 ms of CPU. Measured in-process, two runs of
   300 requests per path (table below).
2. **A per-instance in-memory limiter is enough for this item.** Production
   runs at most 20 instances, so even if every instance counts separately, one
   account can make at most 20 × its allowance. Today it is unbounded. An
   in-memory check costs no Firestore operation. A Firestore attempt counter
   would add 1 read and 1 write (about 25 ms wall time on the emulator) to
   every request, which costs more than the refusals it is meant to stop.
   Cloud Armor is the right layer for floods by address. It is not the right
   layer for this item: it cannot key on the account, and putting it in front
   of the app needs a load balancer, which production does not have today.
3. **A legitimate heavy user stays far below any sensible threshold.** The
   existing limits already cap successful model calls at
   **20 + 3 × 48 = 164 per account per hour**. One complete project journey
   sends 5–14 requests counted against the hourly limit, plus 2–48 leased
   Transformation calls. Platform-wide use was about 155 model calls in the
   30 days to 11.10.2026.

**Recommendation:** add an in-memory attempt limiter keyed on the verified
`uid`. Run it directly after `verifyRequestAuth` and before the body is read,
for every request, leased or not. It counts every attempt, admitted or not.
Proposed allowances: 60 a minute and 300 an hour per account per instance.
That is about twice the ceiling of what can succeed, so a real session never
reaches it. Its refusal is a 429 with its own `code`. Do not add a Firestore
counter. Treat Cloud Armor as a separate infrastructure decision, together
with retiring the preview domain mapping. Sonny makes that decision (see
"Needs Sonny").

## 1. What a refused request costs today (measured)

### How it was measured

`scripts/measure-gemini-refusals.ts` imports the `POST` handler of
`app/api/gemini/route.ts` and calls it in-process with real `NextRequest`
objects. It runs against the local Auth and Firestore emulators, and the
accounts carry real emulator ID tokens.

- The **rate limiter is live**. `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is left
  unset, because `assertRateLimit` skips itself under that flag. The Admin
  SDK reaches the emulators through `FIRESTORE_EMULATOR_HOST` and
  `FIREBASE_AUTH_EMULATOR_HOST` instead.
- **Firestore operations** are counted at the two funnels every Admin SDK call
  goes through: `Firestore.prototype.request` and `requestStream` in
  `@google-cloud/firestore` 8.6.0. Each RPC is counted by method, plus the
  documents it reads (`batchGetDocuments`) and writes (`commit`).
- **CPU** is `process.cpuUsage()` (user + system) of this process divided by
  the number of requests: 300 per path after 5 warm-up requests. The
  emulator's own CPU is not included. Production Firestore costs that as an
  RPC, not as our CPU.
- **Wall time** is the median per request. Against the emulator only the
  order of the paths means anything. Production adds a real network hop to
  Firestore for each RPC.
- **Not covered:** the emulator accepts unsigned tokens, so the RS256
  signature check that production does was measured separately:
  0.019–0.025 ms per token (`crypto.verify`, 2048-bit). The certificates are
  cached and no `checkRevoked` lookup happens for non-admin tokens
  (`lib/firebase-admin.ts:107`).
- Environment: Node 24.20.0 on Windows 11 (production's base image is
  `google-24`); firebase-admin 14.1.0. Windows CPU accounting is coarse, which
  is why the sub-millisecond values vary between runs.
- The harness's own share: building a small request costs 0.16 ms of CPU and
  building a 1.7 MB request costs 1.7 ms (a throwaway script in the gitignored `tmp/`). Both are
  included in the figures below.

Reproduce:

```
firebase emulators:start --only auth,firestore --project=cleancore-491216
npx tsx scripts/measure-gemini-refusals.ts 300
```

### Results (two runs, 300 requests per path each)

| Path (where it is refused) | Status | Firestore RPCs per request | Docs read | Docs written | CPU ms per request (run A / B) | Wall ms, median (emulator) |
|---|---|---|---|---|---|---|
| Missing `Authorization` header (`route.ts:202`) | 401 | 0 | 0 | 0 | 0.10 / 0.16 | 0.02 |
| Invalid token (`verifyRequestAuth`) | 401 | 0 | 0 | 0 | 0.05 / 0.05 | 0.03 |
| Body not JSON (`route.ts:222`) | 400 | 0 | 0 | 0 | 1.1 / 1.1 | 1.0–1.3 |
| 413, `Content-Length` declared (1.7 MB) | 413 | 0 | 0 | 0 | 5.0 / 6.7 (incl. 1.7 harness) | 1.2–1.5 |
| 413, streamed without a length (1.7 MB) | 413 | 0 | 0 | 0 | 5.7 / 4.2 | 1.1–1.6 |
| **Over the hourly quota** (`assertRateLimit`, 21st call) | 429 | 1 `batchGetDocuments` + 1 `rollback` | **1** | 0 | 6.0 / 4.6 | 22–23 |
| Lease named in a bad shape (`leaseReferenceOf`) | 400 | 0 | 0 | 0 | 0.9 / 1.0 | 0.7–0.9 |
| Lease, wrong stage (`route.ts:243`) | 400 | 0 | 0 | 0 | 0.7 / 0.6 | 0.6–0.8 |
| Lease, unknown id (`peekLease`) | 403 | 1 | **1** | 0 | 3.5 / 3.2 | 15 |
| Lease, expired (`peekLease`) | 403 | 1 | **1** | 0 | 4.3 / 3.2 | 15–16 |
| **Lease valid, a later gate refuses** (unknown answer shape, `route.ts:358`) | 400 | 4 | **4** | 0 | 10.3 / 9.5 | 48–49 |
| For comparison: every gate passed, stopped at "no model key" (503) | 503 | 5 | 5 | 0 | 13.2 / 11.4 | 61–62 |
| For comparison: **one admitted Firestore limiter transaction** (what an attempt counter would add) | — | 1 `batchGetDocuments` + 1 `commit` | 1 | **1** | 2.9 / 3.7 | 25 |

What the table says:

- **The over-quota path reads one document and writes none.** The
  transaction reads the window, throws `QuotaError`, and the SDK rolls back.
  A rollback is an RPC, not a billed write. In production that is about 5 ms
  of our CPU plus one Firestore round trip.
- **The most expensive refusal is a leased call that a later gate refuses.**
  It reads the lease once (`peekLease`) and `users/{uid}` three times:
  `assertMfaSatisfied`, `assertAccountActive`, and the stage switch at
  `route.ts:338`. None of these reads counts against any limit. With one
  valid lease (3 can be bought per hour, each open for 15 minutes), an
  account can repeat that request as fast as it likes. The three reads of
  the same profile document could be one read. That is a separate, free
  reduction (4 → 2 reads) and does not replace a limit.
- **A Firestore attempt counter costs more than the refusals it would stop.**
  One admitted limiter transaction is 1 read + 1 write and about 25 ms wall
  time on the emulator. Adding it to every request would cost more than the
  over-quota path itself (1 read, no write). The roadmap row was right about
  this.
- **The paths before any limiter cost no I/O.** A 413 caps memory at the
  bound (1,565,536 bytes). A slow body can hold a request open for up to the
  30-second read deadline (`GEMINI_BODY_LIMITS.timeoutMs`), which holds one
  of an instance's 80 concurrency slots.
- **An invalid token writes one `console.error` line per request**
  (`verifyRequestAuth`), so a token flood also floods the log.

### In money (list prices, to be checked on the pricing pages)

- **Firestore:** the database `clean-core-eu` is in `europe-west1` (read
  with `gcloud firestore databases describe`). Reads cost about $0.03 per
  100,000 beyond the free 50,000 a day. Europe rates may differ, so check
  them on the [Firestore pricing page](https://cloud.google.com/firestore/pricing).
  - Over-quota path: about $0.30 per million refused requests.
  - Leased later-gate path: about $1.20 per million refused requests.
- **Cloud Run** bills for instance time, not for our CPU. The default is
  request-based billing, for the time at least one request is in flight, on
  2 vCPU / 2 GiB, with up to 80 requests sharing that time. Even with no
  sharing at all, a 25 ms refusal costs about 25 ms × (2 × $0.000024 +
  2 × $0.0000025) ≈ $1.3 per million (tier 1;
  [Cloud Run pricing](https://cloud.google.com/run/pricing)). The ceiling is
  `maxScale` 20: 20 instances busy all day is about $90 a day, whatever the
  cause.
- **Conclusion:** one refused request costs fractions of a micro-dollar. What
  is missing is a bound on how many arrive. A single account looping the
  leased later-gate request at 50 requests per second reads about 17 million
  documents a day (≈ $5) and keeps instances busy. Nothing in the app stops
  it today.

## 2. Which layer: in-memory, Cloud Armor or API Gateway

### What production looks like

Read with `gcloud run services describe clean-core --region=europe-west1`
(read-only) and `.github/workflows/deploy.yml`, 13.10.2026:

| Setting | Value | Source |
|---|---|---|
| Max instances | **20** (`autoscaling.knative.dev/maxScale`) | describe. The deploy flags do not set it, so it is a value kept from the service. |
| Concurrency | **80** per instance (`containerConcurrency`) | describe (the default) |
| CPU / memory | 2 vCPU / 2 GiB | `deploy.yml` (`--cpu=2 --memory=2Gi`) |
| Request timeout | 300 s | describe |
| Ingress | `all` | describe |
| Session affinity | not set | describe (no annotation) |
| In front of it | **Cloud Run domain mapping**: no load balancer, no backend services, no Cloud Armor policies (`gcloud compute backend-services list` and `security-policies list` both return 0 items) | describe; `lib/rate-limit.ts:110` says the same |

Limits that already exist: the Firestore hourly limit `gemini:<uid>` at 20/h
(`route.ts:270`, admins exempt), the generation lease (3 an hour, 48 calls,
4 in flight, 15 minutes; `lib/transformation/lease.ts:43-50`), and the lease
route's own `transformation-lease-route:<uid>` limit at 30/h. **Nothing**
limits attempts. `middleware.ts` sets the CSP and headers only, and nothing
in front of Cloud Run filters requests.

### Options

| Option | What it bounds | Cost per request | Fixed cost / work | Weak points |
|---|---|---|---|---|
| **A. In-memory limiter per instance, keyed on `uid`** (recommended) | Attempts per account. The worst case across instances is ≤ 20 × the allowance, because `maxScale` is 20. In practice one session usually lands on 1–2 instances. | A map lookup: microseconds, no I/O | One small module plus a route change. No infrastructure. | Resets on instance start. The bound is per instance, not exact. It does not help against unauthenticated floods, but those cost 0.05–0.16 ms and no I/O today. |
| **B. Firestore attempt counter** | Attempts per account, exactly | **+1 read +1 write** and about 25 ms of wall time on **every** request, including admitted ones | None | Costs more than the over-quota refusal it guards. Every admitted call gets slower. Ruled out. |
| **C. Cloud Armor rate rule** (throttle or rate-based ban) | Requests per **IP** (also XFF IP, header, cookie, path, ASN …), per region | about $0.75 per million requests (global policy) | Needs a **global external Application Load Balancer with a serverless NEG** in place of the domain mapping. About $0.025 an hour per forwarding rule (≈ $18 a month), plus $5 a month per policy and $1 a month per rule. A DNS move, a managed certificate, and ingress set to `internal-and-cloud-load-balancing`. | Cannot key on the Firebase account. A header key on `Authorization` changes every hour and can be minted at will. The counts are "approximate and might not be strictly accurate" and are meant "only for abuse mitigation" ([Cloud Armor rate limiting](https://docs.cloud.google.com/armor/docs/rate-limiting-overview)). One account on many addresses goes through. |
| **D. API Gateway** | Quotas per *service producer project* or API key | an extra hop | A gateway config plus a hostname | Its documented quota has no per-user or per-JWT key ([API Gateway quotas](https://docs.cloud.google.com/api-gateway/docs/quotas)). It is built for API-key clients, not for a browser app with Firebase tokens. Ruled out. |

Why the Cloud Armor question does not go away: Google's own page calls Cloud
Run domain mappings "in the preview launch stage", "not production-ready"
and "not recommended for production services". It recommends a global
external Application Load Balancer, which is also where Cloud Armor comes
from ([mapping custom domains](https://docs.cloud.google.com/run/docs/mapping-custom-domains)).
That is a real infrastructure item: it protects against volumetric and
unauthenticated traffic, and it settles the preview mapping. It answers a
different question from "an account loops refused requests", and it should
be decided on its own. **A is the layer for this item. C is worth doing
later, for other reasons.**

### Design notes for A (for the build step, not built here)

- **Place it right after `verifyRequestAuth`, before `readBoundedJson`.** It
  then bounds every expensive path (the bounded parse, the lease peek, the
  three profile reads, the limiter transaction) and none of them can pass
  around it. Missing and invalid tokens never reach it. They are free today,
  and keying them on an address would bring back the `X-Forwarded-For`
  problem (`lib/rate-limit.ts:103-123`).
- **Count every attempt**, admitted or refused, leased or not. Admins too:
  an attempt limit is not a model quota, and the allowance is far above what
  an administrator sends.
- **Bound the memory:** a `Map<uid, timestamps>` with a sliding window,
  pruned on access, and capped at a few thousand keys by dropping the oldest
  key. 155 calls a month across the platform means a few dozen active keys.
- **The refusal:** a 429 with `code: 'attempt-limit'` and `Retry-After`, so
  the client can tell it apart from `model-hourly-limit`. The orchestrator
  does not retry a 429 except on fill calls (`lib/transformation/orchestrator.ts:270-298`,
  one retry), so a refusal does not snowball.
- **It must not skip itself under the emulator flag** the way
  `assertRateLimit` does. Otherwise the test below cannot see it. Specs that
  send many stubbed calls from one account must stay under the allowance.
  Check this with `grep -rn "api/gemini" tests/` before choosing the numbers.
- **The same pattern fits `/api/transformation/lease`.** Its refused paths
  also read before they are limited. That is outside this item; noted only.

## 3. What a legitimate heavy user sends

Read from the client code (no session was replayed). `lib/gemini.ts` sends
one `fetch` per call and does not retry. The route retries the provider
inside the same request (`callWithRetry`), which is not another POST.

| Stage | Requests to `/api/gemini` per pass (min / typical / max) | Counted against |
|---|---|---|
| Start (automatic on open) | 0 / 1 / 1, plus 1 for "Change target" | hourly |
| Analyze (re-run, or a row from the workspace list) | 0 / 0 / 1 each | hourly |
| Design (automatic when missing or stale) | 0 / 2 / 2, plus 1 for the wording button. Regenerate costs 2 more. | hourly |
| Transformation: lease purchase | 1 unit, 0 when the open lease is reused | hourly (`lease/route.ts:177`) |
| Transformation: fill and repair calls | planned ≈ ⌈units/4⌉, plus one retry per call on 429/5xx and up to 2 repair rounds. Capped by the lease budget `min(48, 2 × planned + 8)`. | lease |
| Transformation fallback (when no lease is possible) | 1 / 1 / 2 | hourly |
| Documentation (automatic once), statement proposals (button) | 0 / 1 / 2 | hourly |
| Process naming (button) | 0 / 0 / 1 | hourly |
| Testing: generate the suite / run it (2 heals and 1 explanation) | 1 / 1 / 2 and 0 / 0–1 / 3 | hourly |
| Delivery | 0 (imports `callGemini`, never calls it) | — |
| Glossary chatbot | 0 for a glossary hit, else 1 per question | hourly |

**One project, all seven stages:**

| Scenario | Hourly-counted requests | Leased requests | Total |
|---|---|---|---|
| Automatic steps only | 5 | about 2–10 | about 7–15 |
| Typical (with Testing) | about 7 | about 2–10 | about 9–17 |
| Every button and every retry | about 14 | ≤ 48 | about 62 |

**The ceiling in an hour**, set by limits that already exist:

- 20 hourly-counted calls (the lease purchases come out of these 20).
- 3 leases of at most 48 calls each.
- So **at most 164 successful model calls**. The burst is at most 4
  in-flight leased calls, each taking seconds.

Refused requests on top of that are rare in normal use. A lease refusal ends
a generation, and the client does not loop.

**The proposed allowance** is 60 a minute and 300 an hour per account per
instance. That is about 1.8 times the absolute hourly ceiling and well above
any burst four in-flight calls can produce. A session that reaches it is not
a session the product makes. Platform-wide use (about 155 calls in 30 days)
is two orders of magnitude below it.

## 4. Test plan (for the build step)

1. **Unit test of the limiter, without a server.** A pure module with an
   injected clock:
   - attempt 300 within an hour passes and attempt 301 is refused;
   - attempt 60 within a minute passes and attempt 61 is refused;
   - the window slides;
   - the key cap drops the oldest key;
   - two keys do not interfere.
   The module must not import Firebase, so a Playwright spec can load it
   (see `tests/admin-revocation.spec.ts` on `jose`).
2. **The loop test the roadmap asks for, as a route spec** (emulator and the
   test server, as in `tests/transformation-lease-route.spec.ts`). One
   account sends each refused request in a loop: a body that is not JSON, a
   lease in a bad shape, an unknown lease, a valid lease with an unknown
   answer shape, and a request without a lease. For each path:
   - the first N attempts get their own refusal (400 / 403 / 429
     `model-hourly-limit`);
   - every attempt after the allowance gets 429 `attempt-limit`;
   - a second account in the same loop is unaffected.
   Use a small allowance through a test-only setting so the loop stays
   short, the same way the stub is switched on per server.
3. **Proof that a refused attempt reads nothing.** Extend
   `scripts/measure-gemini-refusals.ts`: once the allowance is used up,
   every path must show 0 Firestore RPCs and less than 0.5 ms of CPU per
   request. Run it before the release and record the table in the backlog
   entry.
4. **Source-order guard.** The limiter call sits between `verifyRequestAuth`
   and `readBoundedJson` in `app/api/gemini/route.ts`, and before the first
   `getAdminDb()`. This is the same kind of guard the repo already uses for
   call order.
5. **A legitimate heavy session is never refused.** Simulate 20 hourly
   calls plus 3 × 48 leased calls inside one hour, with 4 in flight, on the
   unit clock. None may be refused by the attempt limiter.
6. **No spec regresses.** Run every rendered spec that sends `/api/gemini`
   from one account (`grep -rln "api/gemini" tests/`) against the production
   build with the emulator flag. None may hit `attempt-limit`.

## Needs Sonny

- **Nothing for the recommended step.** It is code only: no console setting,
  no cost.
- **Later, separately:** whether to replace the preview domain mapping with
  a global external Application Load Balancer and Cloud Armor. That needs
  the console or IaC, a DNS change and certificates, and about $18–25 a
  month before request charges. Under the GCP IaC rule, Claude prepares the
  script and Sonny runs it.
- **Check:** `maxScale` 20 is not set in `deploy.yml`, so it lives only in
  the service. It is also the cost ceiling the reasoning above relies on.
  Putting it into the deploy flags would make it a reviewed value.
