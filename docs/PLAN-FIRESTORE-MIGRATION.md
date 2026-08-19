# Plan — Firestore aus us-west1 herausholen

**Erstellt:** 2026-08-19 · **Auszuführen:** ab 2026-08-20, nach Quota-Reset (~09:00 CEST)
**Status:** Entwurf, noch nichts ausgeführt

---

## 0. Was heute passiert ist

Das Aufräum-Skript für die 125 CI-Testaccounts hat das Tageslimit für Firestore-Lesevorgänge
aufgebraucht. Seither sind **alle Leseoperationen der Produktionsdatenbank gesperrt** — Logins
und Dashboard funktionieren nicht, zwei Stunden nachdem 31 Community-Mails rausgingen. Etwa
25–30 Testaccounts wurden vorher gelöscht, der Rest steht noch aus.

Das Limit setzt sich um **Mitternacht Pacific Time** zurück, also gegen **09:00 CEST**.

Der Auslöser war ein Skript. Die Ursache ist es nicht: die Datenbank hängt an einer Deckelung,
die sich mit Geld nicht lösen lässt — die Fehlermeldung sagt es wörtlich, *„cannot exceed free
quota limits even when a billing instrument is enabled"*, und Billing ist auf dem Projekt aktiv.
Dasselbe kann an jedem beliebigen Tag durch normale Nutzung passieren.

---

## 1. Warum migriert werden muss

Drei Gründe, nach Schwere sortiert. Der erste ist der, der nicht warten kann.

### 1.1 Die Daten liegen in den USA — den Nutzern wird Belgien zugesagt

```
locationId: us-west1        # Oregon, USA
```

Cloud Run läuft in `europe-west1`. Die Willkommens-Mail, die jeder freigeschaltete Nutzer
bekommt, sagt wörtlich:

> „To support GDPR (DSGVO) alignment, your projects are hosted in the **Belgium (europe-west1)**
> region."

Dieselbe Zusage steht auf der Trust-Seite und ist Teil des Verkaufsarguments gegenüber
SAP-Kunden, deren IT-Abteilungen genau danach fragen. **Die Aussage trifft für die Datenbank
nicht zu.** Für eine Plattform, die Prüfbarkeit und signierte Audit-Belege verkauft, ist das
das gravierendste Einzelproblem in diesem Dokument — und das einzige, das durch Warten
schlimmer wird, nicht besser.

### 1.2 Ein Tageslimit, das Billing nicht aufhebt

Der heutige Ausfall. Die `ai-studio-*`-Datenbanken werden von Firebase AI Studio angelegt und
behalten eine harte Tagesdeckelung. Mit wachsender Nutzerzahl trifft sie irgendwann ohne
Fremdverschulden zu — und dann ohne Vorwarnung mitten am Tag.

### 1.3 Jede Abfrage geht über den Atlantik

Cloud Run in Belgien, Datenbank in Oregon: etwa 150 ms Laufzeit pro Roundtrip, bei jedem
Dashboard-Aufruf mehrfach. Der billigste Performance-Gewinn, den das Projekt zu vergeben hat.

---

## 2. Was ich geprüft habe (Stand heute)

| | |
|---|---|
| Produktions-DB | `ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e`, FIRESTORE_NATIVE, **us-west1** |
| Point-in-Time Recovery | **deaktiviert** — kein Wiederherstellungspunkt |
| Delete Protection | **deaktiviert** — die DB lässt sich versehentlich löschen |
| Composite-Indizes | **keine** (0 Stück) — nichts nachzubauen |
| `firestore.indexes.json` | existiert nicht im Repo |
| Weitere DBs | `release` → `ai-studio-39b46c45-…`, `dev` → `ai-studio-030e1ee1-…`, dazu `ai-studio-d80950ff-…` (verwaist) und `(default)` in eur3 |
| Alle `ai-studio-*` | ebenfalls us-west1 |
| Billing | aktiv (`billingEnabled: true`) |

Dass es **keine Composite-Indizes** gibt, ist der wichtigste Befund für den Aufwand: die
Migration ist dadurch reines Export/Import ohne Index-Nachbau.

### Wo die Datenbank-ID verdrahtet ist

Vier Stellen, alle müssen mit:

1. `firebase-applet-config.json` → `firestoreDatabaseId` (Client-SDK, auch von den Tests gelesen)
2. `lib/constants.ts` → `FIRESTORE_DB_ID` (Fallback, wenn die Env-Variable fehlt)
3. `.github/workflows/deploy.yml` → `db_id` im `case "$REF_NAME"` (pro Branch je einmal)
4. Cloud Run Env `NEXT_PUBLIC_FIRESTORE_DB_ID` — wird aus (3) gesetzt, also automatisch

---

## 3. Der Ablauf

### Phase 0 — Sicherheitsnetz, direkt nach dem Reset (~09:00)

Vor jeder Änderung, solange das volle Tagesbudget zur Verfügung steht:

```bash
# 1. Löschschutz auf die Produktions-DB
gcloud firestore databases update \
  --database="ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e" \
  --project=cleancore-491216 \
  --delete-protection

# 2. Point-in-Time Recovery einschalten (7 Tage Rückblick)
gcloud firestore databases update \
  --database="ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e" \
  --project=cleancore-491216 \
  --enable-pitr
```

Beides ist auch unabhängig von der Migration richtig und sollte dauerhaft anbleiben.

### Phase 1 — Vollständiger Export

```bash
# EU-Bucket für den Export (einmalig)
gcloud storage buckets create gs://cleancore-firestore-backup \
  --location=europe-west1 --project=cleancore-491216

gcloud firestore export gs://cleancore-firestore-backup/2026-08-20-pre-migration \
  --database="ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e" \
  --project=cleancore-491216
```

Ohne `--collection-ids` werden **alle** Collections inklusive Subcollections exportiert — die
unveränderlichen `projects/{id}/runs/{runId}` kommen also mit. Das ist zwingend: sie tragen die
signierte Beweiskette.

> **Unsicherheit, die ich nicht auflösen konnte:** Ob ein Managed Export gegen dasselbe
> Tageslimit zählt, konnte ich nicht abschließend belegen. Deshalb der Export als erste
> Handlung nach dem Reset, wenn das Budget voll ist — und nicht am Ende eines Arbeitstags.

Nach dem Export den Umfang prüfen (`gcloud storage ls -r`), damit klar ist, dass er
vollständig ist, bevor irgendetwas anderes passiert.

### Phase 2 — Zieldatenbank anlegen

```bash
gcloud firestore databases create \
  --database=clean-core-prod \
  --location=europe-west1 \
  --type=firestore-native \
  --project=cleancore-491216
```

**Warum `europe-west1` und nicht `eur3`:** `eur3` wäre Multi-Region (höhere Verfügbarkeit),
aber `europe-west1` ist genau die Region, die in der Willkommens-Mail und auf der Trust-Seite
genannt wird — und es ist dieselbe Region wie Cloud Run, also minimale Latenz. Damit wird die
Zusage wahr, statt nur ungefähr wahr.

**Warum ein sprechender Name:** `clean-core-prod` statt einer weiteren `ai-studio-*`-UUID. Die
Datenbank ist dann in der Konsole als das erkennbar, was sie ist, und sie erbt die
AI-Studio-Deckelung nicht.

### Phase 3 — Import

```bash
gcloud firestore import gs://cleancore-firestore-backup/2026-08-20-pre-migration \
  --database=clean-core-prod \
  --project=cleancore-491216
```

Dann Rules auf die neue DB ausrollen. `firebase.json` kennt aktuell kein Datenbank-Ziel, also
entweder per CLI-Flag oder in der Konfiguration ergänzen:

```bash
npx firebase deploy --only firestore:rules --project=cleancore-491216
```

**Vor dem Umschalten prüfen** (jeweils gegen die neue DB):
- Zahl der Dokumente in `users` stimmt mit der Quelle überein
- Ein Projekt hat seine `runs`-Subcollection samt `runHash`/`signature`
- `email_suppressions` und `email_sends` sind vorhanden — sonst würde ein künftiger Versand
  Abmeldungen ignorieren und Leute doppelt anschreiben

### Phase 4 — Umschalten (das eigentliche Wartungsfenster)

Ab hier gilt: **Schreibvorgänge zwischen Export und Umschalten gehen verloren.** Firestore
repliziert nicht zwischen Datenbanken. Deshalb kurz halten und in eine ruhige Stunde legen.

1. `firebase-applet-config.json` → `firestoreDatabaseId: "clean-core-prod"`
2. `lib/constants.ts` → Fallback auf `clean-core-prod`
3. `.github/workflows/deploy.yml` → im `main)`-Zweig `db_id=clean-core-prod`
4. Commit, Push, Deploy abwarten
5. `/api/health` prüfen, einloggen, ein Projekt öffnen, einen Run ansehen

Bei einem Problem: Schritte 1–3 zurückdrehen und erneut deployen. Die alte Datenbank bleibt
unangetastet und vollständig — das ist die Rückfalloption.

### Phase 5 — Nachlauf

- Alte Produktions-DB **mindestens zwei Wochen behalten**, dann löschen
- `dev` und `release` nach demselben Muster (unkritisch, kann an anderen Tagen passieren)
- Verwaiste `ai-studio-d80950ff-…` prüfen und entfernen
- Das Aufräum-Skript für die restlichen ~95 Testaccounts laufen lassen — **auf der neuen DB**,
  ohne Tagesdeckelung, dann ist es unkritisch

---

## 4. Risiken

| Risiko | Bewertung |
|---|---|
| Schreibvorgänge im Wartungsfenster gehen verloren | Bei 31 Nutzern und früher Uhrzeit gering. Alternativ vorher eine kurze Wartungsmeldung. |
| Import unvollständig | Vor dem Umschalten prüfen (Phase 3). Alte DB bleibt als Rückfall. |
| Firebase Auth betroffen | **Nein.** Auth liegt auf Projektebene, nicht pro Datenbank. Niemand muss sich neu registrieren. |
| Rules greifen nicht auf der neuen DB | Vor dem Umschalten deployen und mit einem Nicht-Admin-Login prüfen. |
| Signierte Runs beschädigt | Export/Import kopiert Dokumente unverändert; `runHash` und `signature` bleiben gültig. Nach dem Import an einem Run stichprobenartig verifizieren. |

---

## 5. Unabhängig davon: die Lesezahl senken

Die Migration hebt das Limit auf, aber der Verbrauch ist trotzdem höher als nötig. Zwei
Stellen, die auffallen:

**`hooks/useUserProfile.ts`** feuert bei jedem Mount **beide** Wege — erst ein `getDoc`, dann
zusätzlich einen `onSnapshot` auf dasselbe Dokument. Das war eine bewusste Absicherung gegen
hängende Streams auf CI-Runnern, verdoppelt aber die Lesevorgänge auf jeder Seite, die das
Profil braucht — also praktisch jeder.

**`components/admin/UsageQuotaPanel.tsx`** (von mir) hält einen `onSnapshot` über die
**gesamte** `users`-Collection offen. Solange der Tab offen ist, erzeugt jede Änderung an
irgendeinem Nutzerdokument erneut Lesevorgänge über alle Dokumente. Für ein Admin-Panel
vertretbar, aber der Tab sollte nicht dauerhaft offen bleiben — oder das Panel bekommt eine
Snapshot-statt-Stream-Variante.

Beides ist kein Notfall, aber es sind die zwei größten Verstärker im aktuellen Code.

---

## 6. Zu entscheiden

1. **Wartungsfenster ansagen oder still umschalten?** Bei 31 Nutzern und morgens früh wäre
   still vertretbar. Eine kurze Mail wäre transparenter — nach der gestrigen Mail aber
   vielleicht eine zu viel.
2. **`europe-west1` oder `eur3`?** Meine Empfehlung ist `europe-west1`, weil es die
   kommunizierte Region ist und mit Cloud Run zusammenliegt. `eur3` wäre ausfallsicherer.
3. **Trust-Seite und Willkommens-Mail:** Sollen die Formulierungen bis zur Migration
   entschärft werden? Solange die Daten in Oregon liegen, stimmt die Aussage nicht.
