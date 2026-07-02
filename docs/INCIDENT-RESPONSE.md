# Incident Response Playbook

**Version 1.0 · Clean-Core.io**

Documented procedure so security incidents are handled by plan, not improvisation. Clean-Core.io runs as a small/solo operation; this playbook is deliberately lean but covers the scenarios that matter.

## Roles

- **Incident Lead** (Felix/Sonny Frenzel): decides, coordinates, communicates. For a solo operation the Lead also executes; if unavailable, the documented escalation contact acts.
- All privileged actions are recorded in `audit_events`.

## Severity classification

| Severity | Definition | Target response |
|---|---|---|
| **P0** | Data exfiltration, key/credential compromise, auth bypass | Immediate (< 1h to contain) |
| **P1** | Vulnerability exploitable in prod, integrity of signed evidence in doubt | Same day |
| **P2** | Limited-impact bug, degraded service | 2–3 days |
| **P3** | Minor issue, no data/security impact | Next release |

## Runbooks

### R1 — Key / credential compromise (P0)
Applies to `AUDIT_SIGNING_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `S4_ENCRYPTION_KEY`, `MFA_BACKUP_CODE_PEPPER`, `PILOT_APPROVAL_SECRET`, Firebase service account.
1. **Rotate** the affected secret in the Cloud Run env (and provider console) immediately; redeploy.
2. **Revoke** the old value at the provider (Google AI, Resend, Firebase).
3. If `AUDIT_SIGNING_KEY` was exposed: all previously signed audit packs are now forgeable — **re-sign** active runs and publish a notice; treat old signatures as `integrity-only`.
4. If `S4_ENCRYPTION_KEY` was exposed: rotate, re-encrypt stored S/4 credentials, notify affected BYOT users.
5. Record timeline in `audit_events` + post-mortem.

### R2 — Data breach / exfiltration (P0)
1. **Contain**: revoke access, disable the affected route/endpoint, rotate related keys.
2. **Scope**: identify affected users and data categories (use the collection registry in `DATA-RETENTION.md`).
3. **GDPR obligations**: notify the supervisory authority within **72 hours** of becoming aware; notify affected users without undue delay if high risk.
4. **Remediate & document** root cause; post-mortem.

### R3 — Exposed test/seed endpoint or misconfiguration (P1)
Reference: the `/api/test/seed` endpoint is triple-gated (`K_SERVICE` block, emulator flag, secret token) and the CI asserts the emulator flag never leaks to prod (`deploy.yml`).
1. Confirm exposure via `/api/health` and Cloud Run logs.
2. Redeploy from a known-good commit; verify the guard assertions pass.
3. Rotate `PILOT_APPROVAL_SECRET` (the seed token) if it may have leaked.

## Detection

- Cloud Run logs (`gcloud logging read`), CI security-scan alerts (gitleaks / npm audit), `/api/health` degraded status, `audit_events` review.

## Post-mortem template (blameless)
- **What happened** · **Timeline** · **Impact** · **Root cause** · **What went well / poorly** · **Actions (owner + date)** · **Prevention**.

## Exercise
Run one tabletop walkthrough of R1 annually; record the outcome.
