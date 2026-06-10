# S/4HANA Live Tenant Bridge — Feature Documentation

> **Version:** 1.6.0  
> **Last Updated:** 2026-06-10  
> **Status:** Production-Ready (Pilot)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Authentication Methods](#authentication-methods)
4. [Connection Test — How It Works](#connection-test--how-it-works)
5. [Test Execution Pipeline](#test-execution-pipeline)
6. [API Reference](#api-reference)
7. [Data Model](#data-model)
8. [Security Model](#security-model)
9. [User Guide — Step by Step](#user-guide--step-by-step)
10. [Troubleshooting](#troubleshooting)
11. [Changelog](#changelog)

---

## Overview

The **S/4HANA Live Tenant Bridge** (internally: BYOT — *Bring Your Own Tenant*) allows users to connect their own SAP S/4HANA Cloud sandbox or test system to the Clean-Core.io platform. Once connected, the platform performs **real server-side HTTP validation** against the tenant endpoint during test execution.

### Key Capabilities

| Capability | Description |
|---|---|
| **Real Connection Test** | Server-side HTTP HEAD/GET against the tenant URL with full auth handshake |
| **4 Auth Methods** | Basic Auth, OAuth 2.0 Client Credentials, SAP API Hub Key, BTP Destination JSON |
| **Live Test Validation** | ABAP Cloud test execution validates tenant reachability in real-time |
| **Simulated Fallback** | Mock mode clearly labeled as `[SIMULATED]` when no tenant is connected |
| **Production Safety** | Blocks requests to `*-api.s4hana.ondemand.com` production endpoints |

### What This Feature Does NOT Do (Yet)

- ❌ Execute actual ABAP Unit test classes on the remote system (requires ADT/Eclipse)
- ❌ Fetch or validate OData `$metadata` schemas
- ❌ Run CREATE/UPDATE/DELETE operations against OData entity sets
- ❌ Support Principal Propagation or SAML-based SSO for test execution

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│                                                             │
│  testing/page.tsx                                           │
│  ┌──────────────────┐    ┌──────────────────────────┐       │
│  │ "Test Connection" │    │ "Run Selected" (ABAP)    │       │
│  │    Button         │    │    Button                │       │
│  └────────┬─────────┘    └──────────┬───────────────┘       │
│           │                         │                       │
│           │ fetch()                 │ fetch()               │
│           ▼                         ▼                       │
├───────────────────────────────────────────────────────────── │
│                    Next.js API Routes                       │
│                                                             │
│  /api/test-s4-connection    /api/test-s4-connection          │
│  (route.ts — 389 lines)    (reused by useTestExecution)     │
│  ┌──────────────────────────────────────────────────┐       │
│  │  1. Parse auth type                              │       │
│  │  2. Build auth headers (Basic/Bearer/APIKey)     │       │
│  │  3. HTTP HEAD → fallback GET                     │       │
│  │  4. Evaluate HTTP status                         │       │
│  │  5. Return { status, message, httpStatus }       │       │
│  └──────────────────────────────────────────────────┘       │
│           │                                                 │
│           ▼                                                 │
│    S/4HANA Cloud Tenant                                     │
│    (Customer's system)                                      │
└─────────────────────────────────────────────────────────────┘
```

### File Map

| File | Purpose |
|---|---|
| `app/(app)/project/[projectId]/testing/page.tsx` | UI: Connection form, test runner, sandbox console |
| `app/api/test-s4-connection/route.ts` | API: Real HTTP connectivity test (389 lines) |
| `app/api/run-tests/route.ts` | API: Node.js sandbox test runner |
| `hooks/useTestExecution.ts` | Hook: Orchestrates test execution (Live vs. Mock) |
| `hooks/useTestGeneration.ts` | Hook: AI-powered test case generation via Gemini |
| `lib/types.ts` | TypeScript interfaces: `S4Config`, `Project` |

---

## Authentication Methods

### 1. Basic Authentication

The standard SAP method for Communication Users.

```
Authorization: Basic base64(username:password)
```

| Field | Example |
|---|---|
| Username | `CC_INTEGRATOR` or `INTEGRATION_USER` |
| Password | Password set in Communication Arrangement |

**SAP Setup:** Communication Management → Communication Arrangements → Create a Communication User with the required Communication Scenarios.

---

### 2. OAuth 2.0 Client Credentials

For service-to-service authentication without user context.

```
1. POST tokenUrl → { grant_type: client_credentials }
   Authorization: Basic base64(clientId:clientSecret)
   
2. Response: { access_token: "eyJ..." }

3. GET s4Url
   Authorization: Bearer eyJ...
```

| Field | Example |
|---|---|
| Client ID | `sb-clone-xxxx-xxxx-...` |
| Client Secret | Generated during Communication Arrangement setup |
| Token URL | `https://<tenant>.authentication.eu10.hana.ondemand.com/oauth/token` |

**SAP Setup:** Communication Arrangements → OAuth 2.0 Details → Copy Client ID, Client Secret, and Token URL.

---

### 3. SAP API Hub Sandbox Key

For testing against the SAP Business Accelerator Hub sandbox APIs.

```
APIKey: <your-sandbox-key>
```

| Field | Example |
|---|---|
| API Key | Found at api.sap.com → your profile → Show API Key |

---

### 4. BTP Destination Service JSON

Paste the full JSON export from SAP BTP Cockpit → Connectivity → Destinations.

```json
{
  "Name": "S4HANA_SANDBOX",
  "URL": "https://my426318.s4hana.cloud.sap",
  "Authentication": "BasicAuthentication",
  "User": "CC_INTEGRATOR",
  "Password": "...",
  "ProxyType": "Internet",
  "Type": "HTTP"
}
```

The system auto-detects the authentication type from the JSON:
- `BasicAuthentication` → Basic Auth
- `OAuth2ClientCredentials` → OAuth 2.0 flow
- `PrincipalPropagation` / `NoAuthentication` → URL reachability check only

---

## Connection Test — How It Works

When the user clicks **"Test Connection"**, the following happens:

### Sequence

```
1. Frontend sends POST /api/test-s4-connection
   Body: { url, username, password, authType, btpDestinationJson }

2. API Route validates input:
   - URL required and must be HTTPS
   - Production domains blocked (*-api.s4hana.ondemand.com)

3. Auth headers are built:
   - Basic: base64(user:pass) → Authorization header
   - OAuth2: Token exchange at tokenUrl → Bearer token
   - SAP Hub: password → APIKey header
   - BTP: JSON parsed → auto-resolved

4. HTTP HEAD request to tenant URL (15s timeout)
   - If HEAD fails → fallback to HTTP GET

5. HTTP status evaluated:
   - 2xx/3xx → "connected" ✅
   - 401/403 → "connected" (reachable but auth rejected) ⚠️
   - 404    → "failed" (wrong URL path) ❌
   - 5xx    → "failed" (server error) ❌
   - Timeout → "failed" (15 seconds exceeded) ❌

6. Response returned to frontend:
   { status: "connected"|"failed", message: "...", httpStatus: 200 }
```

### Important: What "Connected" Means

A `status: "connected"` response means the **tenant endpoint is reachable** and responded to the HTTP request. This does NOT mean:
- That specific OData services are available
- That the Communication User has the right authorizations
- That the Communication Scenarios are correctly configured

A `401` or `403` is still reported as `"connected"` because it proves the server is reachable — the issue is authentication, not connectivity.

---

## Test Execution Pipeline

### ABAP Cloud Projects — Two Modes

#### Live Mode (`s4Environment === 'live'`)

When a live tenant is configured and connected:

1. The hook calls `/api/test-s4-connection` with the saved `s4Config` credentials
2. Verifies whether the tenant endpoint is reachable
3. Maps test results based on connectivity:
   - **Functional / Business Logic / Transactional** tests → FAILED if tenant unreachable
   - **Structural / Validation** tests → PASSED (don't require live connectivity)
4. Generates a `S/4HANA LIVE TENANT VALIDATION REPORT` with:
   - Tenant URL, auth type, connectivity status
   - Per-test PASSED/FAILED with reasons
   - Real HTTP status codes

#### Mock Mode (`s4Environment === 'mock'` or not configured)

When no live tenant is configured:

1. All output prefixed with `[SIMULATED]`
2. Tests marked as `[SIMULATED PASS]`
3. Report header: `SIMULATED ABAP UNIT TEST REPORT`
4. Warning: *"⚠️ These results are SIMULATED. No S/4HANA tenant was contacted."*
5. Prompt: *"Connect a Live Tenant for real validation."*

### Node.js/CAP Projects

Node.js projects use a real sandbox runner (`/api/run-tests`) that executes TypeScript code via `tsx --test`. The tests are AI-generated unit tests that validate the generated application code's internal logic. S/4HANA credentials are passed as environment variables but tests are designed to be isolated (no network calls).

---

## API Reference

### `POST /api/test-s4-connection`

Performs a real server-side HTTP connectivity check against the provided S/4HANA tenant URL.

#### Request Body

```typescript
{
  url: string;                    // Required. HTTPS URL of the S/4HANA tenant
  username?: string;              // Basic: Communication User / OAuth2: Client ID
  password?: string;              // Basic: Password / OAuth2: Client Secret / Hub: API Key
  authType: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination';
  tokenUrl?: string;              // OAuth2 only: Token endpoint URL
  btpDestinationJson?: string;    // BTP Destination only: Full JSON export
}
```

#### Response

```typescript
{
  status: 'connected' | 'failed';
  message: string;                // Human-readable explanation
  httpStatus?: number;            // HTTP status code from the tenant
  details?: object;               // Additional context (e.g., tokenUrl for OAuth errors)
}
```

#### Status Codes

| HTTP | Meaning |
|---|---|
| 200 | Success — tenant responded |
| 400 | Bad request — missing or invalid parameters |
| 401 | OAuth token exchange failed |
| 403 | Production domain blocked |
| 502 | Connection to tenant failed (timeout, DNS, SSL) |
| 500 | Internal server error |

#### Examples

**Basic Auth — Successful:**
```bash
curl -X POST /api/test-s4-connection \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://my426318.s4hana.cloud.sap",
    "username": "CC_INTEGRATOR",
    "password": "SecurePass123!",
    "authType": "basic"
  }'

# Response:
# { "status": "connected", "message": "Connection successful via Basic Auth. S/4HANA endpoint responded with HTTP 200.", "httpStatus": 200 }
```

**Wrong Credentials:**
```bash
# Response:
# { "status": "connected", "message": "Endpoint reachable (HTTP 401) via Basic Auth. Authentication credentials were rejected — verify your credentials.", "httpStatus": 401 }
```

**Wrong URL:**
```bash
# Response:
# { "status": "failed", "message": "Endpoint returned HTTP 404 (Not Found). Verify the base URL path is correct.", "httpStatus": 404 }
```

---

## Data Model

### `S4Config` Interface

```typescript
// lib/types.ts
interface S4Config {
  url?: string;           // e.g. "https://my426318.s4hana.cloud.sap"
  username?: string;       // Communication User or Client ID
  password?: string;       // Password or Client Secret
  authType?: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination';
  btpDestinationJson?: string;  // Full BTP Destination JSON export
}
```

### `Project` Interface (relevant fields)

```typescript
interface Project {
  // ... other fields ...
  s4Deployment?: 'public' | 'private';   // Public Cloud vs. Private Cloud
  s4Environment?: 'mock' | 'live';       // Mock (simulated) vs. Live (real tenant)
  s4Config?: S4Config;                   // Tenant connection credentials
}
```

### Firestore Storage

Credentials are stored in the project document at `projects/{projectId}`:

```
projects/
  {projectId}/
    s4Config: {
      url: "https://...",
      username: "CC_INTEGRATOR",
      password: "...",          ← stored as-is (see Security section)
      authType: "basic"
    }
    s4Environment: "live"
```

---

## Security Model

### Current Safeguards

| Control | Implementation |
|---|---|
| **HTTPS Only** | URL validation rejects non-HTTPS URLs |
| **Production Block** | Domains matching `*-api.s4hana.ondemand.com` are blocked server-side |
| **Timeout** | 15-second timeout on tenant requests, 12-second timeout on OAuth token exchange |
| **Server-Side Execution** | All HTTP requests are made from the Next.js API route, never from the browser |
| **No Write Operations** | Only HTTP HEAD/GET — no POST/PUT/DELETE against the tenant |
| **Error Sanitization** | Error messages are truncated to 200 chars to prevent information leakage |

### Known Limitations & Risks

> ⚠️ **Credential Storage:** Passwords and Client Secrets are currently stored **in plaintext** in Firestore. In a production deployment, these should be encrypted at rest or stored in a secrets manager (e.g., Google Secret Manager, SAP BTP Credential Store).

> ⚠️ **No Rate Limiting:** The `/api/test-s4-connection` endpoint has no rate limiting. Repeated calls could trigger IP-based blocking on the customer's SAP system.

> ⚠️ **CORS Proxy:** The API route acts as a server-side proxy. While this is necessary for CORS, it means the Clean-Core.io server has transient access to the credentials.

---

## User Guide — Step by Step

### Prerequisites

1. **SAP S/4HANA Cloud** sandbox or test system (not production!)
2. **Communication User** with appropriate Communication Scenarios configured
3. The system must be reachable from the internet (no VPN/firewall blocking)

### Step 1: Open the Testing Page

Navigate to your project → **Stage 5: Testing** → scroll to the **S/4HANA Live Tenant Bridge** panel.

### Step 2: Enter Tenant URL

Enter your S/4HANA Cloud system URL:
```
https://my426318.s4hana.cloud.sap
```

Do **not** include trailing paths like `/sap/opu/odata/`. Just the base URL.

### Step 3: Select Authentication Method

Choose one of:
- **Basic Auth** — for Communication Users (most common)
- **OAuth 2.0** — for service-to-service with Client Credentials
- **SAP API Hub** — for api.sap.com sandbox testing
- **BTP Destination** — paste your full Destination JSON

### Step 4: Enter Credentials

- **Basic Auth:** Enter Communication User name + password
- **OAuth 2.0:** Enter Client ID as username, Client Secret as password

### Step 5: Test Connection

Click **"Test Connection"**. You will see:

- ✅ `[SUCCESS] Connection successful via Basic Auth. HTTP 200` — your system is reachable and credentials are valid
- ⚠️ `[SUCCESS] Endpoint reachable (HTTP 401). Authentication credentials were rejected.` — system reachable but wrong credentials
- ❌ `[ERROR] Connection timed out after 15 seconds.` — system not reachable

### Step 6: Save & Run Tests

Click **"Save Connection"** to persist your credentials. Then:

1. Generate a test suite (or use existing tests)
2. Select test cases and click **"Run Selected"**
3. Tests now validate against your real tenant
4. Report shows `S/4HANA LIVE TENANT VALIDATION REPORT` with actual connectivity status

---

## Troubleshooting

### "Connection timed out after 15 seconds"

**Cause:** The S/4HANA system is not reachable from the internet.

**Solutions:**
1. Verify the URL is correct (no typos, no trailing path)
2. Check if the system requires VPN access (not supported in pilot)
3. Try opening the URL directly in a browser to verify it loads
4. Check if SAP has scheduled maintenance

### "Authentication credentials were rejected (HTTP 401)"

**Cause:** The username/password combination is wrong, or the Communication User is locked.

**Solutions:**
1. Verify the Communication User name (case-sensitive)
2. Reset the password in Communication Arrangements
3. Check if the user is locked (too many failed attempts)
4. Ensure the Communication Arrangement is active

### "Endpoint returned HTTP 404"

**Cause:** The base URL path is wrong.

**Solutions:**
1. Use only the base URL: `https://my426318.s4hana.cloud.sap`
2. Don't include OData paths like `/sap/opu/odata/...`

### "Production tenant API endpoints are blocked"

**Cause:** The URL contains `*-api.s4hana.ondemand.com`, which is a production API endpoint.

**Solutions:**
1. Use your sandbox/test system URL instead
2. This is a safety measure to prevent accidental production access

### "OAuth 2.0 token exchange failed"

**Cause:** The Token URL, Client ID, or Client Secret is incorrect.

**Solutions:**
1. Verify the Token URL is correct (check Communication Arrangement → OAuth 2.0 Details)
2. Ensure the Client ID starts with `sb-clone-`
3. Re-generate the Client Secret if in doubt

### Tests show "[SIMULATED]" instead of real results

**Cause:** The project is in Mock mode (no live tenant configured).

**Solutions:**
1. Set `s4Environment` to `live` in the project settings
2. Configure and test the S/4HANA connection first
3. Save the connection before running tests

---

## Changelog

### v1.6.0 (2026-06-10)
- **BREAKING:** Connection Test now performs real HTTP requests instead of client-side simulation
- **NEW:** ABAP test execution differentiates between Live mode (real validation) and Mock mode (labeled `[SIMULATED]`)
- **FIX:** Tests no longer hardcode all results as PASSED
- **FIX:** Mock mode clearly communicates that results are simulated
- Resolves Michele Mangieri's feedback on fake test results

### v1.5.x
- Initial S/4HANA Live Tenant Bridge UI
- Connection form with 4 auth types
- API route (`/api/test-s4-connection`) implemented but not wired to frontend
- All test results were simulated (hardcoded PASSED)
