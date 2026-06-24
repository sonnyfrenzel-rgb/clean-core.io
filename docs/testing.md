# Testing Architecture & Guidelines

This document outlines the testing strategy, core frameworks, emulator integration, and execution procedures for the **Clean-Core.io** platform.

The testing infrastructure ensures that both client-side UI workflows and server-side compliance/security gates function flawlessly under local development conditions and inside the CI/CD pipeline.

---

## 1. Testing Strategy & Hermetic Isolation

We adhere to the principle of **hermetic (isolated) testing**. This means:
*   **No Dependency on Live Systems:** Tests never access production or staging environments of Firebase or SAP.
*   **Local Emulation:** All database and authentication operations are executed against the Firebase Emulator Suite.
*   **Determinism & Reproducibility:** Every test run starts with a clean, well-defined dataset seeded programmatically during the test setup.

---

## 2. Testing Stack & Frameworks

Our testing stack consists of three main components:
1.  **Playwright (v1.59+):** An E2E test runner executing parallel browser automation tests across Chromium, Firefox, and WebKit in headless or headed modes.
2.  **Firebase Emulator Suite:** Local emulators for **Firestore** (Port `8080`) and **Firebase Authentication** (Port `9099`). This enables local validation of security rules (`firestore.rules`) without incurring cloud costs or polluting databases.
3.  **Next.js Dev Server:** Local compilation and hosting of the React application on Port `3000` during test execution.

---

## 3. Test Suite Classification

All tests are located in the [tests/](file:///c:/Users/felix/antigravity/Project-Platform/tests) directory and are classified into three distinct categories:

### A. Parser & Compiler Unit Tests
These tests verify the mathematical and logical correctness of the modernization engine (ABAP parser and SQL converter).
*   **[`tests/abap-inheritance.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/abap-inheritance.spec.ts):** Tests class inheritance hierarchies, abstract classes, method overrides, and correct Method Resolution Order (MRO) linearization for ABAP class structures.
*   **[`tests/abap-sql-joins.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/abap-sql-joins.spec.ts):** Validates the translation of complex ABAP `JOIN` statements, table mappings, and the correction of legacy structures such as `FOR ALL ENTRIES`.
*   **[`tests/support-matrix-drift.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/support-matrix-drift.spec.ts):** Prevents documentation drift. Asserts that the feature capability matrix rendered in the UI matches the engine's internal source-of-truth constants.

### B. End-to-End (E2E) Pipeline Tests
These tests simulate complete user journeys, stepping through all stages of the Clean-Core accelerator assistant.
*   **[`tests/landing.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/landing.spec.ts):** Verifies the landing page, navigation links, Legal Notice (Impressum), and responsive layouts.
*   **[`tests/stage1-2.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/stage1-2.spec.ts):** Simulates uploading legacy ABAP files in Stage 1 and generating the solution architecture catalog in Stage 2.
*   **[`tests/full-pipeline.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/full-pipeline.spec.ts):** The primary E2E flow. It automates login (Stage 0), code upload (Stage 1), architecture generation (Stage 2), interactive code refactoring (Stage 3), abapGit ZIP and Confluence blueprints export (Stage 4), and final sandbox handover (Stage 5/6).
*   **[`tests/sandbox-delivery.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/sandbox-delivery.spec.ts):** Checks validation and handback steps in the deployment sandbox.

### C. Security, Compliance & Gating Tests
These tests validate server-side API routes, permissions, and regulatory data protection (GDPR).
*   **[`tests/security-compliance.spec.ts`](file:///c:/Users/felix/antigravity/Project-Platform/tests/security-compliance.spec.ts):** Asserts critical security gates:
    1.  **S/4HANA Connection Gating:** Restricts unapproved users (lacking the `s4TenantAccessAllowed: true` flag) from hitting S/4HANA live credentials/connection routes, returning a `403 Forbidden` response.
    2.  **Admin Onboarding Access:** Verifies that approving user roles via admin API endpoints strictly requires valid administrator claims inside the client token.
    3.  **Cryptographic HMAC Tokens:** Cryptographically verifies onboarding/registration links via server-side SHA-256 HMAC signatures to prevent tampering.
    4.  **Cascading Deletion (Art. 17 GDPR / Right to Erasure):** Ensures that deleting a user account via `/api/account/delete` cascadingly purges all user-related documents (`users`, `projects`, `abap_examples`) from Firestore and deletes the Auth credentials.

---

## 4. Local Test Execution (Step-by-Step)

To run the test suite locally, the Firebase emulator and Playwright must be synchronized.

### Step 1: Start the Firebase Emulator
Open a terminal in the project directory and boot the Authentication and Firestore emulators:
```powershell
npx firebase emulators:start --only auth,firestore --project=cleancore-491216
```
*The emulators will run on port 9099 (Auth) and port 8080 (Firestore).*

### Step 2: Set Environment Variables (Preventing Split-Brain)
To avoid a **split-brain connection** (where the Playwright runner process in Node.js targets production Firebase in the cloud, while the headless browser targets the emulator), you must set the emulator environment flags on the shell process running Playwright.

**On Windows (PowerShell):**
```powershell
$env:NEXT_PUBLIC_USE_FIREBASE_EMULATOR="true"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
```

**On macOS / Linux (Bash/Zsh):**
```bash
export NEXT_PUBLIC_USE_FIREBASE_EMULATOR="true"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
```

### Step 3: Execute Playwright Tests
Once environment variables are defined, run the test suites:
```powershell
npx playwright test
```

To run a single test file (e.g., security and compliance tests):
```powershell
npx playwright test tests/security-compliance.spec.ts
```

To run tests with a visible browser UI (headed mode):
```powershell
npx playwright test --headed
```

### Step 4: Inspect Test Reports
If any test fails, open the interactive HTML test report to review screenshots, trace timelines, and logs:
```powershell
npx playwright show-report
```

---

## 5. Developer Guidelines (Test Design Best Practices)

When writing new tests or adapting existing components, adhere to these development standards:

### A. Emulator Connection in Seed Code
Any test file that uses the Firebase SDK directly in the Node.js context to set up (seed) or verify mock data must establish an emulator connection:
```typescript
import { initializeApp } from 'firebase/app';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
```

### B. Firestore Rules Adherence
Because the local Firestore emulator strictly enforces [`firestore.rules`](file:///c:/Users/felix/antigravity/Project-Platform/firestore.rules), write operations will fail if seeded mock documents lack required fields.
*   **Projects (`projects`):** Must contain `name`, `status`, `userId`, and `createdAt`.
*   **ABAP Examples (`abap_examples`):** Must contain `name`, `code`, `userId`, and `createdAt`.

*Omitting these fields will trigger a `FirebaseError: 7 PERMISSION_DENIED` during execution.*

### C. Handling Next.js Hydration Lag
When running against the local Next.js dev server, React hydration on the homepage `/` can take a few hundred milliseconds. If Playwright attempts to click links before hydration finishes, client-side React routes might not execute.

**Resolution:** When navigating to the home route, wait for the network to settle or add a brief timeout:
```typescript
await page.goto('/');
await page.waitForLoadState('networkidle'); // Wait for scripts to load
await page.waitForTimeout(1000);            // Brief buffer for React hydration to complete
```

### D. Locator Selection
*   Avoid brittle CSS paths that fluctuate with layout changes (e.g., `.mt-4 > div:nth-child(2)`).
*   Prefer robust attributes such as `data-testid` (e.g., `page.getByTestId('analyze-button')`) or deterministic semantic queries (e.g., `a[href="/impressum"]`).

---

## 6. CI/CD Integration

Tests run automatically on GitHub Actions for every pull request and push to the `main` branch. 

The pipeline execution flow is:
1.  **Repository Checkout & Node Setup**
2.  **Install Dependencies:** `npm ci`
3.  **Install Playwright Browsers:** `npx playwright install --with-deps`
4.  **Install Firebase CLI**
5.  **Build Phase:** `npm run build` (ensures compiling finishes clean of typescript errors)
6.  **Startup Emulator & Dev Server**
7.  **Run Tests:** Runs the Playwright command with environment flags.
8.  **Archive Artifacts:** Traces, screenshots, and reports are uploaded as build artifacts upon failure.

---

## 7. Troubleshooting & FAQs

### Problem 1: `FirebaseError: Permission Denied (403)` during database seed
*   **Cause:** A document seeded via the test runner lacks schema-required fields required by `firestore.rules`, or is written under a mismatched `userId`.
*   **Solution:** Compare the document structure in your `setDoc` calls with the match statements in `firestore.rules` (e.g., Match `/projects/{projectId}`).

### Problem 2: Playwright tests timeout or fail to locate elements
*   **Cause:** The Next.js dev server is compiling pages on-demand.
*   **Solution:** Increase the default locator/page timeouts in `playwright.config.ts` or leverage explicit `page.waitForSelector()` calls.

### Problem 3: Port conflict (`Port 8080/9099 already in use`)
*   **Cause:** A background Firebase emulator process failed to terminate correctly.
*   **Solution:** Terminate the processes manually:
    *   *Windows (PowerShell):* `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process -Force`
    *   *macOS/Linux:* `kill -9 $(lsof -t -i:8080)`
