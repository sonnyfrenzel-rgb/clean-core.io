# Implementation Plan - Week 2: Audit Integrity

This document outlines the detailed architecture and implementation plan for the **Week 2: Audit Integrity & Immutable Evidence** phase of the Clean-Core.io platform hardening.

---

## 1. Core Architecture Changes

### A. Immutable Runs Collection
We will transition from direct, client-driven mutations on the `projects/{projectId}` document to a server-managed, immutable run execution model under a new subcollection:
`projects/{projectId}/runs/{runId}`

#### Run Document Schema (`runs/{runId}`)
```typescript
interface AnalysisRun {
  runId: string;                 // Unique UUID v4
  projectId: string;             // Parent project reference
  actorUid: string;              // User who triggered the run
  timestamp: any;                // Server timestamp (Firestore FieldValue)
  
  // Inputs
  inputCodeHash: string;         // SHA-256 of raw ABAP source code
  legacyCode: string;            // Copy of input ABAP code
  
  // Immutable Results
  evidenceReport: {
    findings: Array<{
      kind: string;
      objectName: string;
      line: number;
      snippet: string;
      severity: 'critical' | 'warning' | 'info';
    }>;
    score: number;
    recommenderRoute: string;
  };
  analysis: string;              // Modernization recommendation (JSON)
  solutionDesign: string;        // Architecture blueprint markdown/JSON
  generatedCode: Array<{         // Generated TypeScript assets
    path: string;
    code: string;
  }>;
  documentation: string;         // Standard process blueprint
  
  // Compliance & Engine Metadata
  engineVersion: string;         // APP_VERSION (e.g. v1.15.0)
  rulesVersion: string;          // Version of buildAbapEvidence scanner rules
  modelCard: {
    provider: string;            // e.g. "google"
    model: string;               // e.g. "gemini-3-flash-preview"
    temperature: number;
  };
  
  // Tamper Evidence
  previousRunHash: string;       // SHA-256 hash of the previous run document (if any)
  documentSignature: string;     // HMAC-SHA256 signature of this run document fields
}
```

---

## 2. Step-by-Step Implementation Steps

### Task 1: Rebuilding Firestore Access Rules
We will update `firestore.rules` to prevent the client from modifying generated analysis results directly, while allowing the Server Admin SDK (which runs bypasses rules) to write them during runs.

```javascript
// Validate draft project fields permitted for client updates
function projectClientUpdateKeys() {
  return ['name', 'description', 'updatedAt', 'status'];
}

match /projects/{projectId} {
  allow read: if isAuthenticated() && (resource.data.ownerUid == request.auth.uid || isAdmin());
  
  // Client can only create projects with draft status
  allow create: if isAuthenticated() && 
                request.resource.data.ownerUid == request.auth.uid &&
                request.resource.data.get('status', 'draft') == 'draft';
                
  // Client can only update non-sensitive metadata (name, description, status)
  allow update: if isAuthenticated() && 
                resource.data.ownerUid == request.auth.uid &&
                request.resource.data.diff(resource.data).changedKeys().hasOnly(projectClientUpdateKeys());
                
  allow delete: if isAuthenticated() && (resource.data.ownerUid == request.auth.uid || isAdmin());
  
  // runs Subcollection - Block all client writes (Read-Only for clients)
  match /runs/{runId} {
    allow read: if isAuthenticated() && (get(/databases/$(database)/documents/projects/$(projectId)).data.ownerUid == request.auth.uid || isAdmin());
    allow write: if false; // Strict Server-Only write restriction
  }
}
```

---

### Task 2: Implementing the Server-Side `/api/run-analysis` Route
A new Next.js API route `app/api/run-analysis/route.ts` will coordinate the execution of the scanner, AI models, and database logging:

1. **Verify Authorization & MFA**: Authenticate user and assert MFA requirement.
2. **Retrieve Input**: Read `projectId` and `abapCode` from request payload.
3. **Execute Parser**: Run `buildAbapEvidence` and `calculateCleanCoreScore` locally.
4. **Invoke AI Core**: Call Gemini to generate the modern code, solution design, and documentation.
5. **Compute Signatures**:
   - Fetch the latest run document for the project.
   - Hash the new payload fields and append the previous run hash.
   - Sign using `crypto.createHmac('sha256', process.env.AUDIT_SIGNING_KEY)`.
6. **Write to Firestore (Admin SDK)**:
   - Save the immutable run document under `projects/{projectId}/runs/{runId}`.
   - Update `projects/{projectId}` with active status (`status: 'completed'`) and current run reference (`activeRunId: runId`).
7. **Write Audit Event**: Log `RUN_SUCCESS` or `RUN_FAIL` to the global `audit_events` collection.

---

### Task 3: Generating Audit Pack from Runs
- Modify `app/(app)/project/[projectId]/documentation/page.tsx` and related pages.
- Instead of loading the analysis data from `projects/{projectId}`, they will query the subcollection `projects/{projectId}/runs` and load the run document referenced by `project.activeRunId`.
- The "Audit Pack" will display the immutable `runId`, `inputCodeHash`, and the cryptographic `documentSignature` on the UI, with a validation badge ("Cryptographically Verified").

---

### Task 4: Export Hash Chain & Manifest
When exporting the project source code as a ZIP archive, the server-side export handler will write a `manifest.json` file inside the ZIP:

```json
{
  "manifestVersion": "1.0",
  "projectId": "PROJ-123",
  "runId": "RUN-ABC",
  "timestamp": "2026-06-30T15:30:00Z",
  "files": [
    { "path": "app.ts", "sha256": "8f3b...21e0" },
    { "path": "docs/process-blueprint.md", "sha256": "4a21...912f" }
  ],
  "engineMetadata": {
    "engineVersion": "v1.15.0",
    "scannerRulesVersion": "v1.2",
    "modelCard": "gemini-3-flash-preview"
  },
  "signature": "3c01...d8a2" // HMAC-SHA256 of the files array + metadata
}
```
A client-side verification button "Verify Export Integrity" will allow uploading a ZIP and validating it by computing the file hashes and verifying the server HMAC signature.

---

### Task 5: Broad Governance Logging (Audit Events)
Implement transaction-based triggers or route decorators to log all compliance events:

| Category | Event Code | Actor | Target | Payload logged |
| :--- | :--- | :--- | :--- | :--- |
| **BYOK** | `BYOK_SAVE`, `BYOK_DELETE` | User UID | User UID | Last 4, Timestamp |
| **BTP/S/4** | `S4_CRED_WRITE`, `S4_CRED_DELETE` | User UID | Tenant Host | Host, User, Action |
| **Analysis** | `RUN_START`, `RUN_SUCCESS` | User UID | `runId` | Input SHA, Output SHA |
| **Exports** | `EXPORT_ARCHIVE` | User UID | `projectId` | Archive Hash, Files Count |
| **Admin** | `APPROVE_USER`, `REVOKE_USER` | Admin UID | Target User UID | Status, Tenant permissions |

---

## 3. Verification Protocol
- **Rules Unit Tests**: Write unit tests inside `tests/firestore-rules.spec.ts` asserting that clients get `PERMISSION_DENIED` when attempting to write directly to `projects/{projectId}/runs/{runId}` or edit `projects/{projectId}.analysis`.
- **E2E Runs Test**: A Playwright E2E test verifying that executing an analysis generates a correct `manifest.json` and creates a signed run document.
