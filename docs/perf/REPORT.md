# Load times — measured, changed, measured again

Branch `perf/load-times`, base `b6716f07` (the build production served on 06.10.2026), merged into `dev`
the same day. Same machine, same method before and after. Raw summaries: `docs/perf/data/`; `next build`
route tables: `docs/perf/build-baseline.txt`, `docs/perf/build-after.txt`. Lighthouse HTML/JSON reports
(~1 MB each) were kept out of git.

## Method
- Windows 11, Node 20.12.2, Lighthouse 12 (`npx --yes lighthouse@12`), Playwright 1.61.
- One build per state: `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run build`, then `next start`
  against the Auth and Firestore emulators (`--project=cleancore-491216`).
- Landing: `node scripts/perf/lighthouse-median.mjs <url> <dir> <runs> <label>`, performance
  category only, mobile preset (simulated slow 4G, 4x CPU) and `--preset=desktop`, median per
  metric. Baseline 5 runs; after 5 runs and 9 runs. `jsBeforeDcl` = script bytes requested
  before the observed DOMContentLoaded.
- Product: `npx playwright test -c scripts/perf/playwright.perf.config.ts`. Seeds one populated
  project, signs in through the real dialog, opens Dashboard, Workspace, Analyze, Design and
  Testing 1 warm-up + 5 times each in fresh tabs, cache disabled, CPU 4x via DevTools protocol.
  "Ready" = `[data-workspace-shell]` / `[data-stage-title]` / `[data-cc-workspace]` in the DOM.
- Bundle composition: `ANALYZE=true` and the build table.
- Visual: full-page screenshots of `/` at 1440 px and 390 px (reduced motion), local after vs
  production at the base commit: 0 differing pixels, same heights. Signed-in Workspace and the
  Analyze treemap checked by eye after the change.

## Causes found (evidence)
1. Firestore on the start page: `lib/firebase.ts` imports Firestore at module level; header,
   CTAs and sign-in dialog imported `getAuth` from it. Lighthouse: Firestore 65 KiB, RE2JS
   47 KiB, WebChannel 38 KiB before first paint. The page writes to Firestore only on
   registration.
2. `LandingModals` (65 kB source) shipped with the page although it renders nothing until
   `?auth=`/`?legal=`.
3. `StageTimeline` imported `STAGE_WORKER_LABEL` from `lib/landing-stages.ts`, which imports
   `lib/workflow-steps.ts` and the economics modules (21 KiB).
4. `motion/react` 12.42 builds `m` and `motion` from one namespace object, so `motion.div`
   brought projection, drag and gestures (44 KiB).
5. Auth SDK before first paint for a header button that shows a placeholder until it knows.
6. recharts on Analyze (~85 kB gzip, analyzer estimate) for the module treemap below the score;
   JSZip on Delivery (~28 kB) for a bundle built on click.

Mobile LCP is the hero paragraph (text); Lighthouse puts 90 % of it in render delay, so taking
scripts off the critical path moved LCP while FCP (bound by 148 KB gzip HTML + CSS) did not move.

## Commits and why each is safe
- `e917f9d9` measurement scripts — no runtime code; outside `tests/`, so CI never runs them.
- `c36dce5d` `lib/firebase-app.ts` holds app + Auth; `lib/firebase.ts` re-exports them unchanged
  (one app, one Auth instance). The registration handler loads Firestore, `getDb` and
  `finishRegistration` via `import()` before creating the account, so a failed chunk load
  creates nothing. `webpackExports` keeps tree-shaking: a plain namespace `import()` had grown
  every signed-in route by 31 kB in an intermediate build (measured, fixed before commit).
- `781458f5` `LandingModalsLazy`: mounted at once for `?auth=`/`?legal=`, otherwise on idle
  (timeout 2 s), so the Google redirect result and the signed-in hand-off still run — up to about
  2 s later than before. `StageTimeline` gets the label as a prop and uses `m` from
  `motion/react-m` under `LazyMotion` (`initial={false}` as before; reduced motion still via
  `MotionConfig`).
- `86143dda` `lib/auth-subscribe.ts`: header button and `AuthLink` load Auth after hydration;
  same server HTML. These components only choose a link; no auth check moved.
- `5d98b93f` Analyze treemap in `components/analyze/ModuleTreemap.tsx` via `next/dynamic`
  (`ssr: false`) in the same fixed 340 px box; heading, legend and data table render at once.
  Delivery `import('jszip')` in the handler, as Documentation already does.

No change to middleware/CSP, `next.config.mjs`, headers, routes, `verifyRequestAuth`,
sanitization, Firestore rules, metadata, JSON-LD, sitemap, robots. Landing is still ISR
(`revalidate = 300`, `x-nextjs-cache: HIT`) with the enforced CSP from the middleware.

## Results
| Landing `/`, median | Mobile before | Mobile after (9 runs / 5 runs) | Desktop before | Desktop after |
|---|---|---|---|---|
| LCP | 4777 ms | 3253 / 3429 ms | 997 ms | 717 ms |
| FCP | 2112 ms | 2117 ms | 492 ms | 499 ms |
| TBT | 63 ms | 21 / 35 ms | 0 | 0 |
| CLS | 0.0014 | 0.0014 | 0.0015 | 0.0015 |
| Score | 81 | 91 / 89 | 99 | 100 |
| JS before DOMContentLoaded | 408 KiB | 167 KiB | 408 KiB | 167 KiB |
| All JS | 448 KiB | 280 KiB | 646 KiB | 661 KiB (incl. link prefetch after load) |

Baseline mobile LCP spread 4769–4786 ms; the 9 runs after were 3251–3417 ms; the 5-run set had two
outliers at 4987 and 5183 ms. Production reference before the changes (3 runs): mobile score 63,
FCP 5.20 s, LCP 7.33 s, 530 KiB JS; desktop 99, LCP 866 ms.

| First Load JS (`next build`) | Before | After |
|---|---|---|
| `/` | 396 kB | 156 kB |
| `/whitepaper` | 303 kB | 126 kB |
| `/project/[id]/analyze` | 713 kB | 619 kB |
| `/demo/[stage]` | 798 kB | 702 kB |
| `/project/[id]/delivery` | 563 kB | 536 kB |

Other routes +1 kB (shared runtime 104 → 105 kB); `/clean-core-explained` +6 kB (motion's modules
split across three chunks).

| Signed-in, median of 5, 4x CPU | Ready | LCP | JS transferred |
|---|---|---|---|
| Analyze | 1673 → 1164 ms | 2028 → 1408 ms | 918 → 796 KiB |
| Workspace | 1268 → 1099 ms | 1632 → 1192 ms | 879 → 850 KiB |
| Testing | 1536 → 1131 ms | 1636 → 1268 ms | 1160 → 1128 KiB |
| Dashboard | 1332 → 1229 ms | 216 → 200 ms | 930 → 927 KiB |

Only Analyze is claimed as an improvement: the other pages' code did not change, their run spreads
overlap, and their smaller JS comes from lighter prefetched stage chunks. Design's LCP varies too
much in both sets to read.

## Tests, build, lint
`npm run build` passes, `tsc --noEmit` clean, `npm run lint` 0 errors / 421 warnings (limit 661).
Playwright, 28 related spec files: 1162 passed, 0 failed, no retries, against the production build
with emulators.

## Not done, and why
- Start page HTML 1.34 MB raw / 148 KB gzip (79 KB Brotli); 59 % is the RSC payload repeating
  the hidden process-map SVGs. Holds mobile FCP at ~2.1 s. Needs rendering hidden phases on
  demand or Brotli at an edge — owner decision; the landing page stays unchanged until the launch.
- Firestore + Auth remain ~160 kB of every signed-in route. RE2JS is reachable from Firestore's
  code (marking it side-effect-free: measured, no change, reverted).
- Public pages under `app/(app)/` (288–330 kB) inherit the app layout with Firestore; moving
  them touches routing and path guards — owner decision.
- Project read waits for the profile (`const enabled = profile != null`, held by specs); running
  them in parallel would save about one Firestore round trip — owner decision.
- Lazy-loading the assistant's heavy imports: measured, no First Load change, reverted.
- Desktop link prefetch after load is kept (instant navigation; idle-time).
