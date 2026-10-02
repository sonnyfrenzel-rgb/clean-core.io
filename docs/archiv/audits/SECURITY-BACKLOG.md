# Security Backlog — Audit Findings (27.06.2026)

> Quelle: Externer Code Review Audit vom 27.06.2026
> Phase 1 deployed am 27.06.2026 (Commit `780f631`)

---

## Phase 2 — BYOK Server-Only Secret Store (F-01)

**Priorität:** Hoch | **Aufwand:** ~5h

- [x] `geminiApiKey` aus `users/{uid}` Firestore-Profil entfernen
- [x] Neue server-only Collection `user_secrets/{uid}/providers/gemini`
- [x] Neue API-Routes:
  - [x] `POST /api/secrets/gemini` — Key setzen/rotieren
  - [x] `GET /api/secrets/gemini/status` — nur Metadaten (`last4`, `rotatedAt`, `provider`)
  - [x] `DELETE /api/secrets/gemini` — Key löschen
- [x] `/api/gemini`: `customApiKey` Body-Feld entfernen, `useByok: true` Flag
- [x] Server lädt BYOK-Key aus `user_secrets`, decryptet, loggt Key-Fingerprint
- [x] User-Profil: nur noch `byokConfigured: boolean`, `byokLast4`, `byokRotatedAt`
- [x] Settings-UI auf neue API umstellen

**Betroffene Dateien:**
- `firestore.rules`, `hooks/useUserProfile.ts`, `app/(app)/settings/page.tsx`
- `lib/gemini.ts`, `app/api/gemini/route.ts`
- Neue: `app/api/secrets/gemini/route.ts`, `app/api/secrets/gemini/status/route.ts`

---

## Phase 3 — Audit-Pack Integrität (F-02)

**Priorität:** Hoch | **Aufwand:** ~8h

- [ ] Projekt-Ergebnisdaten in server-only Subcollections auslagern:
  - `projects/{id}/runs/{runId}` — AI Run Results
  - `projects/{id}/audit_events/{eventId}` — Audit Trail
  - `projects/{id}/exports/{exportId}` — Export History
- [ ] Client darf nur noch Draft-/UI-Felder schreiben (`name`, `status`, `legacyCode`)
- [ ] `runs`, `audit_events`, `exports` nur via Admin SDK
- [ ] Audit-Pack-Export mit Hash Chain:
  - Input Fingerprint, Rule Version, Model Card, Generated Files Hash, Export Timestamp
- [ ] `lib/audit-pack.ts` auf server-only Subcollections umstellen

**Betroffene Dateien:**
- `firestore.rules`, `lib/audit-pack.ts`, `lib/types.ts`
- `app/api/gemini/route.ts` (Run-Logging)

---

## Phase 4 — CSP Hardening (F-03)

**Priorität:** Mittel-Hoch | **Aufwand:** ~5h

- [ ] CSP von `unsafe-inline` auf Nonce/Hash migrieren
- [ ] Inline Styles in CSS/Tailwind auslagern
- [ ] JSON-LD Scripts mit Nonce versehen
- [ ] Playwright CSP-Regressionstest schreiben
- [ ] CSP-Violation Reporting Endpoint einrichten

**Betroffene Datei:** `middleware.ts`

---

## Weitere Backlog-Items

### S/4 Live Bridge Egress Policy
- [ ] `S4_HOST_ALLOWLIST` in Production verpflichtend machen
- [ ] Erlaubte Tenant-FQDNs pro Kunde dokumentieren

### Supply Chain und CI
- [ ] SBOM via CycloneDX erzeugen
- [ ] Dependency Audit in CI-Pipeline integrieren
- [ ] Firebase App Check evaluieren und aktivieren

### Admin-Panel Referenzen bereinigen
- [x] "e.g. Sonny Frenzel" aus Admin-Panelseiten entfernen:
  - `app/(app)/admin/approve-tenant/page.tsx:207`
  - `app/(app)/admin/approve/page.tsx:208`

---

## UX Backlog — Codex Audit „Enterprise-Architekten-Reife" (30.06.2026)

### UX-4: Business-Kritikalität editierbar + signierbar
**Priorität:** Mittel | **Aufwand:** ~3h | **Voraussetzung:** Woche 2 Immutable Runs
- [ ] Override-Button neben Criticality-Badge (Slider 1-10 + Freitext-Begründung)
- [ ] `criticalityOverride` Feld im Projekt (score, justification, overriddenBy, overriddenAt)
- [ ] UI zeigt: „8/10 (overridden from 5/10 by architect@corp.com)"
- [ ] Confluence/PDF-Export zeigt Override mit Begründung
- [ ] Kryptographische Signatur des Overrides (nach Immutable Runs)

### UX-5: Audit-Pack Review-Workflow
**Priorität:** Niedrig | **Aufwand:** ~8h+ | **Voraussetzung:** Woche 2 Immutable Runs + UX-4
- [ ] Neue Subcollection `projects/{id}/approvals/{approvalId}`
- [ ] Rollenbasierte Status-Machine (Draft → Prepared → Under Review → Approved)
- [ ] E-Mail-Notifications an Reviewer/Approver
- [ ] Signatur-Mechanismus (HMAC oder asymmetrisch)
- [ ] Audit-Trail für Status-Übergänge
- [ ] Zwischenlösung: Freitext-Felder „Prepared by / Reviewed by" im Audit-Pack

### UX-6: Revisionssicherer Export
**Priorität:** Mittel | **Aufwand:** ~3h | **Voraussetzung:** Woche 2 Immutable Runs
- [x] `manifest.json` im ZIP-Export mit SHA-256-Hashes aller Dateien
- [x] Projektmetadaten, Engine-Version, Katalogversion, Timestamp
- [x] SHA-256-Gesamthash als `documentHash`
- [x] HMAC-Signierung über neuen API-Endpunkt `/api/export/sign`
- [x] Verifizierungs-Upload-Funktion auf der Plattform
