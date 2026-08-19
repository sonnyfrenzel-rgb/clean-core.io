# Konzept — Admin Console: Live-Verbrauch der freien Transformationen

**Status:** Phase 0 umgesetzt · **Datum:** 2026-08-19 · **Scope:** Admin Control Room (`/admin`)
**Ziel:** Als Admin in Echtzeit sehen, wie viele der 5 freien Community-Transformationen
jeder User verbraucht hat — inkl. Verlauf, Kontext und Handlungsoptionen.

---

## 0. Umsetzungsstand (2026-08-19)

Zwei Dinge sind bereits gebaut und gegen den Firestore-Emulator verifiziert:

**(a) Zähleinheit umgestellt.** Gemessen wird nicht mehr jeder Gemini-Call, sondern der
**Analyse-Run** in `/api/runs/create` (`reserveRunQuota` in `lib/firebase-admin.ts`).
Damit kostet ein ABAP-Objekt genau eine Einheit, alle sechs Folge-Stages und der
Glossar-Chatbot sind frei, und die Abrechnung ist idempotent pro Quell-Fingerprint —
eine erneute Analyse derselben Quelle kostet nichts. Die bezahlten Fingerprints liegen
in `users/{uid}.chargedInputs`, das die Firestore-Rules dem Client entziehen
(`userClientUpdateKeys`), also nicht fälschbar. Details und Vorgeschichte: §2.1.

**(b) Admin-Tab „Usage & Quota"** in `components/admin/UsageQuotaPanel.tsx`, eingehängt
in `app/(app)/admin/page.tsx`. Live-`onSnapshot` auf `users`, KPI-Leiste, Filter,
Sortierung, aufklappbare User-Details.

Offen bleiben Ebene 2 und 3 aus §3 — der Event-Ledger und die Rollups (Phasen 1–3, §11).

---

## 1. Ist-Zustand (verifiziert im Code)

### 1.1 Wie Quota heute funktioniert

| Baustein | Ort | Verhalten |
|---|---|---|
| Limit-Konstante | `lib/constants.ts` → `COMMUNITY_QUOTA = 5` | Einmaliges Lifetime-Kontingent, kein Reset |
| Zähler | `users/{uid}.transformationsUsed` / `.transformationsLimit` | Zwei Zahlen, sonst nichts |
| Reservierung | `lib/firebase-admin.ts` → `reserveRunQuota()` | Firestore-Transaktion: prüft `status === 'approved'`, Fingerprint, `used < limit`, dann `increment(1)` |
| Aufrufer | `app/api/runs/create/route.ts` | seit v2.3; BYOK und `tier === 'enterprise'` sind ungemessen |
| Rückbuchung | `refundRunQuota()` | Best-effort `increment(-1)` + Fingerprint löschen, wenn der Run scheitert |
| Client-Anzeige | `hooks/useUserProfile.ts` | `onSnapshot` auf das eigene User-Dokument |

### 1.2 Was die Admin Console heute kann

`app/(app)/admin/page.tsx` (466 Zeilen) liest **`registration_requests`**, nicht `users`, und
holt pro Zeile per zusätzlichem `getDoc(users/{uid})` nur zwei S/4-Flags nach (N+1-Reads).
Verbrauchsdaten kommen dort **nirgends** vor. Aktionen laufen über
`POST /api/admin/console-action` mit `verifyAdminRequest()` + `assertAdminStepUp()`
(Re-Auth + MFA), jede Aktion schreibt via `logAuditEvent()` nach `audit_events`.

### 1.3 Rechte-Lage

- `firestore.rules:63` — `users/{userId}` ist für `isAdmin()` (Custom Claim `admin`) **lesbar**,
  inklusive `list`. Ein Live-Listener über alle User ist also heute schon erlaubt.
- `firestore.rules:255` — `audit_events` ist client-seitig komplett dicht (`read, write: if false`).

---

## 2. Warum der heutige Zähler nicht reicht

| # | Lücke | Konsequenz für dich als Admin |
|---|---|---|
| L1 | Nur ein Zählerstand, **keine Events** | Du siehst „3 von 5", aber nicht *wann*, *wofür*, *wie oft heute* |
| L2 | Refunds machen den Zähler **nicht-monoton** | Ein Verlauf lässt sich aus dem Zähler prinzipiell nicht rekonstruieren |
| L3 | `adminApproveUser()` setzt `transformationsUsed: 0` **bei jeder Freigabe** | Re-Approval nach Revoke schenkt still 5 neue Einheiten — heute unsichtbar |
| L4 | `adminRevokeUser()` setzt `transformationsLimit: 0` | Anzeige wird „3 / 0" — UI muss das abfangen |
| L5 | BYOK-User werden **nicht gemessen** | Sie stehen ewig auf `0 / 5` und sehen aus wie inaktive Karteileichen |
| L6 | Enterprise/Admin überspringen das Metering komplett | Kein Aktivitätssignal für die wichtigsten Accounts |
| L7 | ~~Eine Quota-Einheit = ein Gemini-Call~~ | **behoben in v2.3** — siehe 2.1 |

### 2.1 Die Metering-Einheit passte nicht zum Produktversprechen — behoben

`callGemini()` (`lib/gemini.ts`) wird an **10 Stellen** aufgerufen:

```
analyze/page.tsx        1×      documentation/page.tsx  2×
design/page.tsx         2×      useTestGeneration.ts    1×
transformation/page.tsx 1×      useTestExecution.ts     2×
GlossaryChatbot.tsx     1×   <- verbrennt Quota ohne jede Transformation
```

Vor v2.3 kostete **jeder** dieser Aufrufe eine Einheit. Ein vollständiger Durchlauf des
7-Stufen-Workflows kostet 6–7 Einheiten — der freie Nutzer war nach Stage 4 von 7 gesperrt,
beim allerersten Projekt, und drei Chatbot-Fragen vorher reichten, um die Transformation gar
nicht mehr zu erreichen. Das widersprach direkt „Up to 5 ABAP-to-Cloud transformations"
und „Full 7-stage modernization workflow — every feature included" (beide im selben
Pricing-Kärtchen, `app/page.tsx`) sowie Terms §6.

**Behoben:** Die Einheit ist jetzt der Analyse-Run. Ein ABAP-Objekt = eine Einheit, danach
läuft der komplette Workflow ungemessen. Damit sind beide Zusagen gleichzeitig wahr.
Verifiziert gegen den Firestore-Emulator (18 Fälle): Erstanalyse belastet, Re-Analyse
derselben Quelle ist frei, Refund gibt Einheit *und* Fingerprint zurück, BYOK/Enterprise
ungemessen, `pending` blockiert, und 8 parallele Runs auf einem 5er-Konto belasten exakt 5.

Verbleibende Konsequenz: `/api/gemini` ist nicht mehr durch die Quota gedeckelt. Der
Kostenschutz auf dem geteilten Community-Key ist damit allein das Rate-Limit
(`assertRateLimit`, 20/h pro User+IP) — siehe §10.

---

## 3. Zielbild — drei Ebenen

```
Ebene 3  usage_rollup/*        ->  KPI-Kacheln, O(1)-Lesekosten
Ebene 2  usage_events/*        ->  Live-Feed + Timeline pro User   <- neu, Kern des Konzepts
Ebene 1  users/{uid}.used      ->  Live-Balken „3 / 5"             <- existiert bereits
```

Ebene 1 liefert sofort den „Live-Verbrauch" (Firestore-Listener, keine Schema-Änderung).
Ebene 2 liefert Verlauf, Kontext und Beweisbarkeit. Ebene 3 hält die Konsole billig.

---

## 4. Datenmodell

### 4.1 `usage_events/{eventId}` — append-only Ledger

```ts
{
  uid: string;                 // Firebase UID
  email: string;               // denormalisierter Snapshot (Konsole ohne Join)
  tier: 'pilot' | 'pilot_byok' | 'premium' | 'unlimited' | 'enterprise';

  type: 'consume' | 'refund' | 'grant' | 'reset';
  billing: 'community_quota' | 'byok' | 'unmetered';  // warum (nicht) gezählt wurde

  // Kontext — vom Client mitgeliefert, NICHT vertrauenswürdig, reine Telemetrie
  stage: 'analyze' | 'design' | 'transformation' | 'documentation'
       | 'testing' | 'tco' | 'delivery' | 'chatbot' | 'unknown';
  projectId?: string;
  runId?: string;              // sofern der Call in einen Run mündet

  model: string;               // z. B. 'gemini-3-flash-preview'
  promptChars: number;
  latencyMs?: number;
  ok: boolean;

  usedAfter: number;           // Zählerstand NACH diesem Event
  limitAtTime: number;         // Limit zum Zeitpunkt des Events
  createdAt: Timestamp;        // serverTimestamp
}
```

**Indizes:** `(uid, createdAt desc)` für die Drill-down-Timeline,
`(createdAt desc)` für den globalen Live-Feed.

### 4.2 `usage_rollup/global` und `usage_rollup/{uid}`

Per `FieldValue.increment` in derselben Transaktion fortgeschrieben:
`totalConsumed`, `totalRefunded`, `byStage.{stage}`, `activeUsers`, `lastEventAt`.
Damit kosten die KPI-Kacheln **einen** Dokument-Read statt einer Collection-Aggregation.

---

## 5. Schreibpfad

Der Event-Write gehört **in dieselbe Transaktion** wie der Zähler-Increment in
`reserveTransformationQuota()`. Nur so kann der Ledger nie vom Zähler abweichen:

```ts
await db.runTransaction(async (tx) => {
  // ... bestehende Prüfungen (approved, used < limit) ...
  tx.update(ref, { transformationsUsed: FieldValue.increment(1), updatedAt: … });
  tx.create(db.collection('usage_events').doc(), {
    uid, email: data.email, tier, type: 'consume', billing: 'community_quota',
    stage, projectId, model, promptChars,
    usedAfter: used + 1, limitAtTime: limit, ok: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  tx.set(rollupRef, { totalConsumed: FieldValue.increment(1) }, { merge: true });
});
```

**Konsequenzen:**

- `refundTransformationQuota()` schreibt ein **kompensierendes** `refund`-Event —
  niemals ein Delete. Der Ledger bleibt append-only und damit audit-tauglich
  (gleiche Logik wie `audit_events` und die Run-Signaturkette).
- **BYOK & Enterprise:** Auch dort ein Event schreiben, mit `billing: 'byok'` bzw.
  `'unmetered'` und **ohne** Zähler-Increment. Löst L5/L6 — du siehst echte Aktivität
  statt eines eingefrorenen `0 / 5`.
- **Kontext-Übergabe:** `/api/gemini` kennt heute weder `projectId` noch `stage`.
  `callGemini()` bekommt einen additiven, optionalen Parameter
  `context: { stage, projectId }`, den die Route gegen ein Enum whitelisted.
  Diese Felder sind **rein deskriptiv** — sie dürfen die Quota-Entscheidung nie
  beeinflussen (gleiche Trennlinie wie `aiNarrativeMeta.evidentiary: false` in `runs`).

---

## 6. Lesepfad — zwei Optionen

### Option A — Rules öffnen (empfohlen)

```
match /usage_events/{eventId} {
  allow read: if isAdmin();     // Custom Claim, wie users/*
  allow write: if false;        // ausschließlich Admin SDK
}
```

- **Pro:** echter `onSnapshot`-Live-Feed, null Polling, null neue API-Fläche,
  konsistent mit der bereits erlaubten `users`-Leseregel.
- **Contra:** Verbrauchsmetadaten liegen im Client-Lesepfad. Enthalten sind
  keine Prompts, kein Code, keine Secrets — nur UID, E-Mail, Stage, Modell, Zeit.

### Option B — Admin-API

`GET /api/admin/usage?scope=live|user&uid=…` mit `verifyAdminRequest()`, Rückgabe via
server-seitigem Fetch. Kein Rules-Change, aber Polling nötig (oder SSE), mehr Code.

**Empfehlung:** Option A für den Feed, Option B zusätzlich für **CSV-Export**
und teure Aggregationen. Mutationen (`grant`/`reset`) laufen ohnehin über
`console-action` mit Step-up.

---

## 7. UI-Konzept — neuer Tab „Usage & Quota"

Der Control Room bekommt eine Tab-Leiste auf oberster Ebene:
`Applications` (heutige Ansicht) · **`Usage & Quota`** (neu).

```
┌────────────────────────────────────────────────────────────────────────────┐
│  USAGE & QUOTA                                          ● live · 12:04:31  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 47 / 210 │ │    9     │ │    3     │ │    5     │ │    2     │          │
│  │ Einheiten│ │ heute    │ │ am Limit │ │ BYOK     │ │ Refunds  │          │
│  │verbraucht│ │ aktiv    │ │ (0 frei) │ │unmetered │ │   24 h   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├────────────────────────────────────────────────────────────────────────────┤
│  LIVE FEED                                                                 │
│  12:04:28  m.huber@acme.de   analyze         4/5  ▓▓▓▓░  gemini-3-flash    │
│  12:03:55  s.klein@beta.io   chatbot         2/5  ▓▓░░░  gemini-3-flash    │
│  12:01:12  j.roth@gamma.com  transformation  5/5  ▓▓▓▓▓  ! LIMIT ERREICHT  │
│  11:58:40  m.huber@acme.de   design       refund  3/5                      │
├────────────────────────────────────────────────────────────────────────────┤
│  [Suche…]      Filter: ( Alle | Am Limit | Aktiv 7 T | Ungenutzt | BYOK )  │
│                                                                            │
│  User                 Tier    Verbrauch      Letzte Nutzung   Projekte     │
│  ────────────────────────────────────────────────────────────────────────  │
│  Jonas Roth           pilot   ▓▓▓▓▓ 5/5 !    vor 3 Min           2   [⋯]   │
│  Maria Huber          pilot   ▓▓▓▓░ 4/5      vor 6 Min           1   [⋯]   │
│  Sabine Klein         pilot   ▓▓░░░ 2/5      vor 8 Min           1   [⋯]   │
│  Tim Bauer        pilot_byok   ∞ BYOK        gestern             4   [⋯]   │
│  Lena Vogt            pilot   ░░░░░ 0/5      nie                 0   [⋯]   │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Drill-down (Drawer je User)

Klick auf eine Zeile öffnet die Timeline aus `usage_events` — die 5 Einheiten
einzeln, jede mit Zeitstempel, Stage, Projekt-Link, Modell, Prompt-Größe,
Refund-Markierung. Plus Kontext aus dem bestehenden Modell: `status`, `tier`,
`byokConfigured`, `s4TenantAccessAllowed`, `mfaEnabled`, `termsVersionAccepted`,
Anzahl Projekte und Runs.

### 7.2 Farbcodierung

`0–2` grün · `3–4` amber · `5/5` rot mit Badge „Limit erreicht" ·
BYOK blau mit `∞` · `limit === 0` (revoked) grau mit Badge „Zugriff entzogen" (löst L4).

---

## 8. Neue Admin-Aktionen

Ergänzung im `switch` von `app/api/admin/console-action/route.ts` — gleiche
Step-up-Absicherung, gleicher `logAuditEvent()`-Pfad:

| Aktion | Wirkung | Ledger |
|---|---|---|
| `grant-quota` (`amount`) | `transformationsLimit += amount` | `type: 'grant'` |
| `reset-quota` | `transformationsUsed = 0` | `type: 'reset'` |

**Blocker vor `grant-quota`:** `hooks/useUserProfile.ts` überschreibt für
`tier === 'pilot'` das Limit hart auf `5` — an zwei Stellen (`getDoc`-Pfad und
`onSnapshot`-Pfad). Ein gewährtes Kontingent wäre client-seitig unsichtbar.
Diese Klammer muss weg; die Firestore-Regel `transformationsLimit == 5` gilt
ohnehin nur beim **Create** durch den User, nicht beim Admin-Update.

---

## 9. Sicherheit & Datenschutz

- **Zugriff:** ausschließlich Custom Claim `admin`; Mutationen zusätzlich mit
  `assertAdminStepUp()` (Re-Auth + frisches MFA) — wie alle bestehenden Admin-Aktionen.
- **Kein Inhalt im Ledger:** niemals Prompt-Text, ABAP-Code oder Gemini-Antworten
  speichern. Nur `promptChars` als Größenmaß.
- **Löschung:** `adminDeleteUser()` muss die `usage_events` des Users
  anonymisieren (UID → Salt-Hash) oder löschen — sonst überlebt ein
  personenbezogener Datensatz die Kontolöschung. Anonymisieren erhält die KPIs.
- **Retention:** Firestore-TTL-Policy auf ein `ttlAt`-Feld, Vorschlag 400 Tage.
- **Datenschutzerklärung:** Verbrauchsmessung ist als Vertragserfüllung/berechtigtes
  Interesse in `app/datenschutz/page.tsx` zu ergänzen.

---

## 10. Kosten & Performance

- Ledger-Write: **+1 Dokument-Write pro Gemini-Call** in einer bereits laufenden Transaktion —
  vernachlässigbar gegenüber den Gemini-Kosten.
- KPI-Kacheln: 1 Read auf `usage_rollup/global` statt einer Collection-Aggregation.
- Live-Feed: `limit(50)` + `orderBy('createdAt','desc')`, keine offene Collection.
- **Nebenbei:** Der Usage-Tab liest `users` **einmal** als Query — im Gegensatz zum
  bestehenden N+1-Muster im Applications-Tab, das bei wachsender User-Zahl teuer wird.
- **Kostenschutz auf dem Community-Key:** Seit v2.3 ist `/api/gemini` nicht mehr durch die
  Quota begrenzt — ein User mit einem einzigen Run kann Design/Transformation/Doku beliebig
  oft neu generieren. Gedeckelt wird das allein durch `assertRateLimit` (20/h pro User+IP,
  Admins ausgenommen), also max. 480 Calls/Tag pro Account. Das ist die Stellschraube, an
  der Kosten und Nutzerkomfort jetzt hängen (§12.4).

---

## 11. Rollout in Phasen

| Phase | Inhalt | Aufwand | Ergebnis |
|---|---|---|---|
| **0 ✅** | Tab „Usage & Quota", `onSnapshot` auf `users`, Tabelle + Meter + Filter + Detail-Drawer | erledigt | Live-Zähler pro User. Keine Rules-Änderung nötig — der Admin-`list`-Zugriff auf `users` ist gegen den Emulator verifiziert (Admin darf, normaler User nicht). |
| **1** | `usage_events` + Transaktions-Write + Rules + Live-Feed | ~4 h | Verlauf statt Momentaufnahme; Refunds sichtbar |
| **2** | `context: { stage, projectId }` in `callGemini()`/`/api/gemini`, Drill-down-Drawer, `usage_rollup`, CSV-Export | ~5 h | „Wofür wurde verbraucht" — inkl. Chatbot-Befund aus §2.1 |
| **3** | `grant-quota` / `reset-quota` + Fix `useUserProfile`, E-Mail-Alert bei 5/5 (Sales-Signal), Anomalie-Flag (> N Calls/Stunde) | ~3 h | Handlungsfähigkeit statt reiner Beobachtung |

Phase 0 ist bewusst so geschnitten, dass sie **ohne** Migration und ohne Rules-Deploy
live gehen kann. Phasen 1–3 sind additiv und einzeln deploybar.

---

## 12. Offene Entscheidungen

1. **Rules öffnen oder API?** (§6) — Empfehlung: Rules für Lesen, API für Export. *Offen.*
2. ~~**Chatbot metern?**~~ — **entschieden: nein.** Mit der Verlagerung des Gates nach
   `/api/runs/create` ist der Chatbot vollständig aus der Quota, ohne Sonderfall im Code.
3. ~~**5 Gemini-Calls oder 5 Runs?**~~ — **entschieden: 5 Runs**, umgesetzt in v2.3 (§0/§2.1).
4. **Rate-Limit auf `/api/gemini`** (§10) — mit dem Wegfall der Call-Metrierung der einzige
   Kostenschutz auf dem geteilten Key. Aktuell 20/h; ein Projektdurchlauf braucht ~7 Calls
   plus bis zu 5 für die Test-Selbstheilung. Tunen oder so lassen? *Offen.*
5. **Retention-Dauer** für `usage_events` (Vorschlag 400 Tage). *Offen.*
6. **Historie-Nacherfassung:** Für Bestands-User existiert nur der Zählerstand.
   Optional ein einmaliges Backfill-Event `type: 'grant'` mit `usedAfter = heutiger Stand`,
   damit die Timeline nicht bei Null anfängt. *Offen.*
