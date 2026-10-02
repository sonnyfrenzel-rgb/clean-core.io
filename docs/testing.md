# Testing

How the Clean-Core.io test suite is built today, how to run it, and how to check a
spec the way CI will. Rewritten on 30.09.2026 (test audit, stage 1); the previous
version described three browsers and a stage-by-stage E2E flow that the suite no
longer has.

Everything below is taken from `playwright.config.ts`, `.github/workflows/deploy.yml`
(job `validate`) and the files under `tests/`. Where a number appears, the command
that produced it is next to it.

---

## 1. One runner, one browser

Every test in the repository runs under **Playwright** (`@playwright/test`, see
`package.json`). There is no second runner — pure function tests and source guards
use Playwright's `test`/`expect` too, they simply never ask for a `page`.

- `testDir` is `./tests`; Playwright picks up `tests/*.spec.ts` and the one
  `tests/board-deck.integrity.test.ts`. Shared code lives in `tests/helpers/`,
  data in `tests/fixtures/`, `tests/korpus/` and `tests/prozess-benchmark/`.
- **Chromium only.** The config defines a single project, `chromium`
  (`devices['Desktop Chrome']`), and CI installs only Chromium
  (`npx playwright install chromium`). Firefox and WebKit are not run anywhere.
- `fullyParallel: true`; `reporter: 'line'`; `trace: 'on-first-retry'`.

Size at the time of writing:

```bash
ls tests/*.spec.ts | wc -l          # spec files
npx playwright test --list | tail -1   # "Total: N tests in M files"
```

## 2. What kinds of test there are

The suite mixes four kinds of test, often in the same file. They differ in what
they need to run, and that is what decides how fast and how fragile they are.

| Kind | What it does | Needs |
|---|---|---|
| **Pure function test** | Imports a module from `lib/` (or a page's pure helper) and calls it — the ABAP engine, the trust chain, the cost model. | Nothing but Node. |
| **Source guard** | Reads repository files with `fs` and asserts a shape: a call that must not come back, a register that must match the code, a pattern that hid a defect once. | Nothing but Node — and the file paths it names. |
| **Route test** | Calls the running app's API routes through Playwright's `request` fixture, usually after seeding Firestore. | Dev or production server, emulators. |
| **Browser test** | Drives the real UI through the `page` fixture: signs in, opens a project, reads what is rendered. | Server, emulators, Chromium. |

Two properties of this mix are worth knowing before you add or move anything:

- **Source guards name files and count call sites.** A guard may assert that a page
  contains exactly two calls of a reader, or read a file by its path. Moving or
  renaming a module, or adding a legitimate call, can turn an unrelated spec red.
  Before pushing such a change: `grep -rl <file> tests/` and run what it finds.
- **The web server starts for every run.** `webServer` is global in the config, so
  even a run of pure tests waits for the server. That is a cost, not a bug.

### Helpers every server-side spec uses

- `tests/helpers/admin-seed.ts` — writes Firestore documents through
  `/api/test/seed`. That route answers `404` unless three gates hold: `K_SERVICE`
  is unset (it is set on every Cloud Run service), `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`
  is exactly `true`, and the request header `x-test-seed-token` equals the server's
  `PILOT_APPROVAL_SECRET`. The helper targets `TEST_BASE_URL`, default
  `http://localhost:3000`.
- `tests/helpers/emulator-guard.ts` — fail-closed connection of the client Firebase
  SDK to the emulators. `firebase-config.json` names the real project; a spec that
  connected only "if the flag is set" would create accounts in production when run
  outside this config. These helpers throw instead.
- `tests/helpers/sign-in.ts` — `signInViaLanding(page, email, password, options)`,
  the sign-in through the real landing-page form. Browser specs used to carry their
  own copy of this sequence; they call the helper now. It still ends in a **fixed
  pause** after the submit (4000 ms by default; some specs pass 3500 or 3000), exactly
  as the copies did. Replacing the pause with a wait for a real signal is the next
  step of the test audit, and it happens in this one file.

### Model calls

`/api/gemini` has a provider stub for tests (`lib/gemini-test-stub.ts`): it replaces
the provider call, and nothing else, when the server runs the emulator build outside
Cloud Run **and** the request carries `x-test-gemini-stub` equal to
`PILOT_APPROVAL_SECRET`. `tests/gemini-test-stub-guard.spec.ts` holds those gates.
Some browser specs stub model answers in the page instead, with `page.route(...)`. CI additionally hands
the server a test key (`TEST_GEMINI_API_KEY` → `GEMINI_API_KEY`), so a spec that
neither stubs nor sends the header reaches the real model there — and not locally,
where no key is set.

## 3. The environment

### Emulators

```bash
npx firebase emulators:start --only auth,firestore --project=cleancore-491216
```

Auth on `:9099`, Firestore on `:8080`. **The `--project` flag is not optional.**
There is no `.firebaserc`; without the flag the CLI uses `demo-no-project`, the
browser mints tokens for that project, and the Admin SDK rejects every one of them
with `incorrect "aud" claim`. It looks like a handful of auth-dependent specs
regressing; it is the flag.

A Firestore emulator that has run for a whole day can grow large enough to slow
everything down (`beforeAll` timeouts on account creation). Restart it before
believing a wave of those.

### What `playwright.config.ts` sets

At module scope, for the test process — and, through `...process.env`, for the
server it starts:

- `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`,
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`;
- visibly-test values for `PILOT_APPROVAL_SECRET`, `RATE_LIMIT_PEPPER`,
  `AUDIT_SIGNING_KEY`, `S4_ENCRYPTION_KEY` and `BYOK_ENCRYPTION_KEY`, unless the
  environment already has them. No production secret reaches a test run.

In `webServer.env` it also sets `RESEND_API_KEY` to empty, so no mail leaves a
test run.

### The server: Playwright owns it

| | Local | CI (`CI` is set) |
|---|---|---|
| Command | `npm run dev` | `npm start` (production build from the step before) |
| `reuseExistingServer` | yes | no |
| Workers | Playwright default | 1 |
| Retries | 0 | 2 |
| `test.only` | allowed | fails the run (`forbidOnly`) |

**Do not start the dev server by hand for a test run.** The seed route compares its
`PILOT_APPROVAL_SECRET` with the one the test process sends, and signing routes use
`AUDIT_SIGNING_KEY`; a hand-started server reads `.env.local` instead, and every
seeding spec fails with `Seeding API failed: {"error":"Not Found"}` — which reads like
a broken route. Because `reuseExistingServer` is on locally, Playwright will adopt
such a server silently. Leave the port free and let the config start it. A run whose
log has no `[WebServer]` lines reused a server it did not start.

## 4. Running tests locally

```bash
# 1. emulators (see above), in their own terminal
# 2. then:
npx playwright test                                  # everything
npx playwright test tests/public-pages-smoke.spec.ts # one file
npx playwright test -g "imprint"                     # by title
npx playwright show-report                           # after a failure
```

- **Node.** `package.json` asks for `>=22.8`, and CI runs Node 22. Run Playwright on
  the machine's default Node, not through a Node 22 shim: Node 22 can `require()` an
  ES module and Node 20 cannot, so a spec that loads fine under a shim may not load
  at all on the default install — and the reverse is what CI sees.
- **Another port.** Several checkouts can have a dev server up at once. For a second
  one, use a local, uncommitted config that imports `playwright.config.ts` and
  overrides `use.baseURL`, `webServer.url` and `webServer.command`
  (`npm run dev -- -p <port>`), and sets `TEST_BASE_URL` to the same origin so
  `admin-seed.ts` seeds the right server. Run it with `-c <that file>`.
- **Two runs against one dev server** can take the server down. Run one at a time.

## 5. CI — job `validate` in `.github/workflows/deploy.yml`

Runs on every push to `dev`, `release` and `main` (the trigger list still names
`release`; its deploy is retired and stops with an error). Both deploy jobs `need`
it. In order:

1. checkout with full history (`fetch-depth: 0`; `tests/terms-version-archive.spec.ts`
   checks recorded commits against git and would skip on a shallow clone);
2. Node 22, `npm ci --foreground-scripts`;
3. `npm run lint`;
4. `npx playwright install chromium` (no `--with-deps`, timeout 10 min);
5. Java 21, then the emulators with `--project=cleancore-491216`;
6. `npm run build` with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` and both emulator
   hosts **set for the build**;
7. `npm run typecheck` — the whole project, specs included (`next build` checks
   application code only);
8. `npx playwright test` with the same emulator variables and `GEMINI_API_KEY`
   from `TEST_GEMINI_API_KEY`.

A red `validate` blocks every deploy.

## 6. Checking a spec the way CI will

The local dev server compiles on demand and is several times slower than the
production server CI runs. Two consequences cut in opposite directions:

- **Green here, red in CI.** A spec that samples for a state which exists only
  *during* a request (a reservation between two writes, say) catches it against the
  slow dev server and misses it against the fast production build. Either make the
  window unnecessary, or sample in a tight loop that stops when the request settles,
  with input large enough that there is a window at all.
- **Red here, green in CI.** The dev server sometimes fails to serve a freshly added
  client chunk; `app/error.tsx` reloads the page and the running `page.goto` dies with
  `net::ERR_ABORTED`. A long dev session can also corrupt `.next`
  (`Unexpected end of JSON input at loadManifest` behind a seed failure). Stop the
  server, delete `.next`, re-run — and before believing a navigation-level failure,
  re-run it on a production build.

To run like CI, with the emulators up and the port free:

```bash
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
npm run build

CI=1 npx playwright test tests/<spec>.spec.ts
```

The emulator flag must be set **for the build**, not only for the run:
`NEXT_PUBLIC_*` values are compiled into the browser bundle. Without it the bundle
talks to real Firebase and every signed-in page test fails for a reason that is not
in your change. `CI=1` makes the config start `npm start`, use one worker and two
retries, and refuse to reuse a running server.

## 7. Writing tests

- **No conditional assertions.** `if (await x.count() > 0) { expect(...) }` makes the
  assertion optional; three specs asserted nothing for months that way.
  `tests/no-vacuous-tests.spec.ts` rejects the shape repo-wide.
- **Titles say what is checked.** A test named after a stage tool opens that
  tool. The public-page smoke checks live in `tests/public-pages-smoke.spec.ts`,
  which replaced five May specs whose titles named stages they never visited.
- **Seed through the helpers**, not the client SDK against security rules:
  `admin-seed.ts` for Firestore, `emulator-guard.ts` for Auth.
- **Sign in through `tests/helpers/sign-in.ts`**, not a new copy of the form sequence.
- **Locate by stable attributes** (`data-*`, `getByTestId`), not by layout classes or
  by wording that is a product decision.
- **Rendered style is enforced by specs**: `tests/landing-style-guard.spec.ts`
  (section headers of the landing page) and `tests/workflow-style-guard.spec.ts`
  (stage titles) compare computed styles; see `CLAUDE.md`.

## 8. Troubleshooting

| Symptom | Usual cause |
|---|---|
| `incorrect "aud" claim`, "There is no user record" in a few auth specs | Emulators started without `--project=cleancore-491216`. |
| `Seeding API failed: {"error":"Not Found"}` | The server was not started by this config (wrong `PILOT_APPROVAL_SECRET`), or `TEST_BASE_URL` points at another server. |
| `Seeding API failed: <!DOCTYPE html>…` | A corrupted `.next` in a long dev session; stop the server, delete `.next`. |
| `net::ERR_ABORTED` on `page.goto`, only locally | Dev-server chunk failure; re-run on a production build. |
| `fetch failed` / `ERR_CONNECTION_REFUSED` in several specs at once | The server went down — often two runs against one server. |
| Many `beforeAll` timeouts creating accounts | A long-running Firestore emulator; restart it. |
| Every signed-in page test red after a local production build | The build ran without `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`. |
| `Port 8080/9099 already in use` | An emulator from an earlier session still runs; stop it by the PID holding the port. |
