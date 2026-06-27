# Security Backlog — Audit Findings (27.06.2026)

> Quelle: Externer Code Review Audit vom 27.06.2026
> Phase 1 deployed am 27.06.2026 (Commit `780f631`)

---

## Phase 2 — BYOK Server-Only Secret Store (F-01)

**Priorität:** Hoch | **Aufwand:** ~5h

- [ ] `geminiApiKey` aus `users/{uid}` Firestore-Profil entfernen
- [ ] Neue server-only Collection `user_secrets/{uid}/providers/gemini`
- [ ] Neue API-Routes:
  - `POST /api/secrets/gemini` — Key setzen/rotieren
  - `GET /api/secrets/gemini/status` — nur Metadaten (`last4`, `rotatedAt`, `provider`)
  - `DELETE /api/secrets/gemini` — Key löschen
- [ ] `/api/gemini`: `customApiKey` Body-Feld entfernen, `useByok: true` Flag
- [ ] Server lädt BYOK-Key aus `user_secrets`, decryptet, loggt Key-Fingerprint
- [ ] User-Profil: nur noch `byokConfigured: boolean`, `byokLast4`, `byokRotatedAt`
- [ ] Settings-UI auf neue API umstellen

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
- [ ] "e.g. Sonny Frenzel" aus Admin-Panelseiten entfernen:
  - `app/(app)/admin/approve-tenant/page.tsx:207`
  - `app/(app)/admin/approve/page.tsx:208`
