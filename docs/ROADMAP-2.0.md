# Clean-Core.io — v2.0 Status & Backlog Rationale

**Version 2.0.0 · 2026-07-02**

This document records what "v2.0" means for Clean-Core.io, and — importantly — **why several classic "enterprise 2.0" items are deliberately in the backlog rather than shipped.** The short answer is *audience*.

## Who Clean-Core.io is for

Clean-Core.io is a **free, community-built** tool for **individual** SAP practitioners:

- SAP **architects** evaluating custom-code Clean Core readiness,
- **developers** modernizing ABAP to RAP/CAP,
- **business/technical decision-makers** who want an evidence-based second opinion.

It is **not** positioned as a multi-tenant enterprise procurement product, and it is **complementary** to SAP's own tooling (ADT, ATC) — not a competitor or replacement. That positioning determines what "2.0" needs to contain.

## What v2.0 delivers (shipped)

The v2.0 milestone focused on the things that matter for *this* audience: **trustworthy evidence, sound data protection, and honest operation.**

| Area | Shipped in v2.0 |
|---|---|
| Evidence trust chain | Server-authoritative audit-pack generation + signing; AI narrative excluded from the signed payload; immutable runs; three-tier verification |
| Data protection | Complete GDPR Art. 17 erasure cascade (runs, BYOK keys, MFA) with an automated completeness test; EU-only residency; retention policy |
| Supply-chain security | CI secret scanning (gitleaks), dependency-audit gate, CycloneDX SBOM; removed the vulnerable `xlsx` dependency |
| Operational readiness | `/api/health` probe, structured JSON logging, incident-response & data-retention docs, SECURITY.md v4.0 |
| Transparency & narrative | Public `/trust` page, SAP non-affiliation disclaimer, removal of false "certified/approved" claims, honest hedged language, free/community framing |
| Reach | Public SAP Object Catalog (SEO/GEO) |

## Backlog — deliberately deferred (and why)

These are the traditional "enterprise-grade" items. They are **not** blockers for the community audience and are parked until a concrete need (e.g. a specific organizational deployment) justifies the complexity.

| Backlog item | Why it's deferred |
|---|---|
| **SSO (SAML/OIDC)** | Individual users authenticate with Google Sign-In. SSO only matters for centrally-managed enterprise identity — no current user needs it. |
| **Multi-role RBAC** (Viewer/Analyst/Architect/Auditor) + **org hierarchy / project sharing** | The product is single-owner per project by design. Roles and sharing add real access-control surface and risk that only pays off for *teams inside one org* — not the individual-practitioner audience. |
| **Formal DPA / TOMs / subprocessor contracts** | These are enterprise **procurement** artifacts. For a free community tool, the public `/trust` page + privacy policy + retention/incident docs provide the appropriate, honest transparency. Full contractual paperwork would be disproportionate. |
| **Run diff & progress tracking** (run-over-run) | Genuinely useful for a *transformation program office*, less so for a single practitioner doing a one-off assessment. The immutable-run data model already supports it, so it can be added later without rework. |
| **CSP nonce migration** (`script-src` without `'unsafe-inline'`) | High effort, small marginal gain: DOMPurify is the primary XSS defense and dynamic labels are already sanitized. Tracked as a documented, accepted residual risk in `SECURITY.md`. |
| **Commissioned external penetration test** | An external, point-in-time activity best run against the *final* stack just before a broad launch — not a code deliverable. |
| **Demo / shareable public verdict links** | Growth/marketing feature, not a readiness requirement. |

## Operational items outside code (do around launch)

- Firestore **scheduled backups** + a **tested restore** (see `docs/OPERATIONS.md`).
- Cloud Monitoring **alert policies** on 5xx error rate (structured logging + `/api/health` are in place to support this).
- **Signing-key rotation** on the documented cadence.

## Principle

The consistent thread — *"belegt, nicht behauptet"* (proven, not claimed) — is now applied at three levels: the **analysis output** is evidence-backed, the **platform operation** is documented and testable, and the **public narrative** claims only what is true. Enterprise identity/governance is a separate product stage, opened only when the audience calls for it.
