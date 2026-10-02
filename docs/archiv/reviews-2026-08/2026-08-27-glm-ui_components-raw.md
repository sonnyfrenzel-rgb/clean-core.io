# GLM full-codebase review — Shared components and hooks

**Model:** `z-ai/glm-5.3` via OpenRouter · **Date:** 2026-08-27 · **Pass:** `ui_components`
**Bundle:** 85 files, 688 KB.
**Usage:** 169433 prompt / 4759 completion tokens, 116s.

Secrets, env files, keys, service accounts, the public Firebase web config and the generated SAP
catalog data were excluded from the bundle by path, and a pattern scan over the assembled text
refused nothing.

**This output is unedited.** It has NOT been verified against the code. Two of roughly twenty
findings in the comparable Grok 4.6 review were wrong; treat every claim below as a hypothesis until
it is reproduced. See `docs/reviews/2026-08-26-TRIAGE.md` for how that was done.

---

## Findings

### 1. Stale-user profile listener leak in `useUserProfile`
**Severity: High** — `hooks/useUserProfile.ts`, the `onAuthStateChanged` callback (~line 90)

The callback returns `() => unsubscribeProfile()`, but `onAuthStateChanged` ignores values returned by its callback — only the outer subscription's cleanup (which the effect *does* return) runs. Every auth-state change therefore attaches a new `onSnapshot` on `users/{uid}` that is never detached.

Failure scenario: user A signs in (snapshot A attached), signs out, user B signs in on the same tab (snapshot B attached). Snapshot A is still live; any write to A's user document calls `setProfile(A's data)` — the app now shows user A's quota/tier/name while user B is authenticated. Repeated sign-in/out also accumulates listeners.

Fix: keep the inner unsubscribe in a ref (or a local variable captured by the effect cleanup) and call it when the user changes or the effect unmounts.

### 2. MFA gate leaves a fully live session before the second factor
**Severity: High** — `components/LandingModals.tsx` (`handleEmailSignIn`, `handleSignIn`, `handleVerifyMfa`)

After `signInWithEmailAndPassword` / `signInWithPopup` succeeds, the Firebase session is completely live — only the client-side modal flow routes the user into the MFA screen. If the user refreshes the page, opens `/dashboard` directly, or any code path uses the ID token while the MFA screen is showing, the second factor is bypassed entirely. `closeAuthModal` signs out, but nothing covers navigation away from the modal or a page reload mid-MFA.

Fix: enforce server-side — e.g. only set an `mfaVerified` custom claim in `/api/mfa/verify` and have all authenticated APIs (and the dashboard shell) reject tokens without it; or at minimum sign out on modal unmount/`beforeunload` while `pendingMfaUser` is set.

### 3. Live-tenant report marks an unexecuted CSRF check as "Passed"
**Severity: High** — `hooks/useTestExecution.ts`, `TC_CSRF` block in the live-mode branch

The test case `TC_CSRF` is pushed with `status: 'Passed'` and the message "CSRF token can be fetched via x-csrf-token: fetch header" whenever the connection is authenticated — but no CSRF token is ever fetched. This puts an unverified success claim into a report the customer is invited to hand to reviewers, in a product whose argument is that its numbers are recomputable.

Fix: either actually perform a token fetch (`x-csrf-token: fetch` HEAD/GET) and report the real result, or mark the case as informational/skipped rather than Passed.

### 4. `FileUpload` never recovers from an upload failure
**Severity: Medium** — `components/FileUpload.tsx`, `handleFileChange` / `reader.onload`

The `addDoc` call runs inside the `FileReader.onload` async callback, so a rejection there is *not* caught by the surrounding `try/catch` (which has already returned). Scenario: Firestore write fails (quota, permission, offline) → the exception is an unhandled rejection, `setUploading(false)` never runs, the input stays disabled on "Uploading…" forever, and no error is shown.

Fix: move the Firestore write out of `onload` (read the file with a promise wrapper) so the existing `try/catch/finally` actually governs it.

### 5. `FileList` never loads on a page reload
**Severity: Medium** — `components/FileList.tsx`, the `useEffect`

The effect bails with `if (!auth.currentUser) return;`. Firebase auth state restoration is asynchronous, so on a hard reload of a page rendering this component `currentUser` is still `null` at effect time, the snapshot listener is never attached, and the list permanently shows "No files uploaded yet" even though the user is signed in a moment later.

Fix: subscribe with `onAuthStateChanged` and build the query inside it (as other components in this codebase already do).

### 6. Email signup can strand an auth account with no profile
**Severity: Medium** — `components/LandingModals.tsx`, `handleEmailSignUp`

`createUserWithEmailAndPassword` runs first; the Firestore profile write and `finishRegistration` come after. If either throws (network blip, rules rejection), the outer catch shows "Error creating account" — but the Firebase Auth account *was* created. The user retries and now hits `auth/email-already-in-use`, with no profile and no path to recover except password reset.

Fix: on failure after the auth account exists, sign out and delete the user (`user.delete()`), or detect the already-created case on retry and resume at the profile-write step.

### 7. Auto-heal silently overwrites the persisted transformed code
**Severity: Medium** — `hooks/useTestExecution.ts`, `executeWithHealing` build-error branch

When a compile error occurs, `autoHealCode` asks Gemini for a fix and immediately `updateDoc`s it into `projects/{id}.generatedCode` — the project's canonical "transformed code" is replaced by an AI-repaired version with no user review and no indication in the artifact itself that it was mutated post-generation. For a product whose pitch is an immutable, signed audit chain anchoring what the engine produced, the stored artifact silently diverging from the run is a real integrity problem (the console log line is the only trace).

Fix: persist healed code under a separate field (e.g. `generatedCodeHealed`) or require explicit user confirmation before overwriting, and record the healing event alongside the run.

### 8. Crash on pending server timestamp in `FileList`
**Severity: Low** — `components/FileList.tsx`, the date rendering

`file.createdAt?.toDate ? file.createdAt.toDate().toLocaleDateString() : new Date(file.createdAt).toLocaleDateString()` — for a locally-cached write whose `serverTimestamp()` has not resolved, the sentinel is a Timestamp whose `toDate()` returns `null`, so `null.toLocaleDateString()` throws. Path: upload a file with `FileUpload`, the local `onSnapshot` fires immediately, `FileList` renders the pending document and crashes.

Fix: guard the result of `toDate()` for null before formatting.

---

**Not reported (checked and judged fine or out of reach):** the `dangerouslySetInnerHTML` uses in `GlossaryChatbot`/`MermaidDiagram`/`ProcessDocumentation` all route through the sanitize-html helpers; `JiraIntegrationModal`'s fake-sync timer was already removed and the modal is unreferenced; `UserOnboarding`'s hook ordering is correct as written; `EvidenceSweep`'s timer logic resolves correctly including the single-finding edge case. One thing I could not verify from this pass: whether the dashboard or any API actually enforces MFA server-side (finding 2 assumes it does not — if a `mfaVerified` claim check exists in the API layer, downgrade that finding to the refresh-path UX gap only).