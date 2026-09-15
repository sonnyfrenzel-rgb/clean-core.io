# Schnitt A — der echte Neubau: Fall, Freigabe, virtuelle Rollen

**Bau- und Prüfplan · Stand 12.09.2026 · Anhang zu [`ROADMAP-2.7.md`](ROADMAP-2.7.md) §6**
**Plan, keine Umsetzung** — Schnitt 0 geht vor (`UX-E11-F03:R0` liefert die
servervalidierten Commands, auf denen hier alles aufsetzt).

> **Abgelöst am 15.09.2026 durch [`docs/ROADMAP.md`](../../ROADMAP.md) (Fassung 2.8).**
> Die vier Grundannahmen dieses Plans gelten nicht mehr: **Projekt = Fall** (kein
> Fallzuschnitt), **Einsicht per E-Mail-gebundener Einladung inklusive Quellcode**
> statt Rechtestufen und Rohcode-Schalter (Phase 5), **Rollen nur als Sichten**
> ohne Attribut am Beitrag (Phase 6), **Konto unverändert** (Suite S8 und
> Bauabschnitt A7 entfallen). Brauchbar bleiben einzelne Testideen — der
> weitergeleitete Link, der Widerruf auf Regelebene, die Stale-Kaskade.

---

## 0. Warum das ein Neubau ist und kein Umbau

`firestore.rules`, Projektregel: `allow read: if isAuthenticated() && (isAdmin() ||
resource.data.userId == request.auth.uid)`. Es gibt heute **keinen zweiten Leser**.
Kein Grant, keine Rechte, kein Widerruf, kein Journal für Mitglieder, keine Rolle
am Beitrag. Alles, was R1 verlangt, hat im Code kein Gegenstück — das ist das
erste Freigabemodell des Produkts, nicht die Erweiterung eines vorhandenen.

**Der Befund, der den Entwurf bestimmt:** `loadProjectAndHydrate()` liest das
**ganze** Projektdokument im Client, und `legacyCode` liegt in genau diesem
Dokument (`lib/types.ts:70`). Firestore-Regeln greifen dokumentweise. „Rohcode:
nein" ist deshalb mit Regeln allein **nicht** erreichbar, solange der Rohcode im
Falldokument steht. Daraus folgt die zentrale Architekturentscheidung in §2.

**Umfang.** Vier Teilschnitte tragen den Neubau — `UX-E02-F01:R1` (L),
`UX-E01-F02:R1` (L), `UX-E11-F03:R1` (L), `UX-E01-F04:R1` (S); die übrigen
dreizehn R1-Schnitte hängen daran.

---

## 1. Was neu ist, was bleibt

| Gegenstand | Heute | Schnitt A | Wiederverwendbar |
|---|---|---|---|
| Eigentum | `projects.userId`, Einzelbesitz | Fall mit Besitzer **und** Mitgliedern | Besitzerlogik |
| Zugriff | Rules dokumentweise | Recht je Mitglied × Inhaltsklasse | `isAuthenticated()`, Admin-Pfad |
| Rohcode | Feld im Projektdokument | eigenes Dokument mit eigener Regel | Snapshot-/Hash-Logik |
| Freigabe | client-schreibbare Felder | servervalidierte Commands (aus R0) | `verifyRequestAuth` |
| Journal | `audit_events`, client unlesbar | Projektion je Fall, für Mitglieder lesbar | `logAuditEvent` |
| Rolle | keine | `virtual_role` am Beitrag, Self-Play-Kennzeichen | — |
| Phasen | `lib/workflow-steps.ts` | unverändert, der Fall klammert sie | vollständig |
| Runs | unveränderlich, signiert | unverändert | vollständig |

---

## 2. Datenmodell und die eine Architekturentscheidung

```
cases/{caseId}                      Besitzer, Titel, Scope, Manifest, aktuelle Revision
cases/{caseId}/members/{uid}        right: read|comment|edit · rawCode: bool ·
                                    grantedBy · grantedAt · revokedAt · lastRole
cases/{caseId}/source/{revision}    ← Rohcode getrennt, eigene Regel, eigener Grant
cases/{caseId}/contributions/{id}   authorUid · virtual_role · kind · anchor · revision
cases/{caseId}/journal/{eventId}    server-geschrieben, für Mitglieder lesbar (Handle, kein Klartextname)
projects/{projectId}                bleibt; der Fall referenziert Projekt, Run und Snapshot
```

**Die Entscheidung: Rohcode auslagern statt Projektion über den Server.**
Ein Servertunnel für Nicht-Besitzer wäre die kleinere Änderung, aber er verlagert
die Berechtigung in Anwendungscode, den kein Regeltest erwischt — und QA24-12
verlangt ausdrücklich dieselben Grenzen auf **beiden** Datenpfaden. Ein eigenes
Dokument mit eigener Regel macht „Rohcode: nein" auf dem Client-Pfad prüfbar und
im Admin-SDK-Pfad nachvollziehbar. Kosten: eine Migration bestehender Projekte
und ein Lesepfad mehr.

**Migration.** Jedes bestehende Projekt bekommt einen Fall mit seinem Eigner als
einzigem Mitglied (`right: edit`, `rawCode: true`); `legacyCode` wandert nach
`cases/{id}/source/{rev}`, IDs, Hashes und Signaturzustände bleiben (C23-A02).

---

## 3. Berechtigungsvertrag

| Fläche | `read` | `comment` | `edit` | `rawCode: false` |
|---|---|---|---|---|
| Fall-Shell, Views, Layer | ✓ | ✓ | ✓ | ✓ (Anker sichtbar) |
| Rohcode-Ansicht | — | — | nur mit `rawCode` | **gesperrt** |
| Threads schreiben | — | ✓ | ✓ | ✓ |
| Anforderungen/Artefakte ändern | — | — | ✓ | ✓ |
| Rechte vergeben/entziehen | — | — | — (nur Besitzer) | — |
| Export / Audit-Pack | Auszug, gekennzeichnet | Auszug | Auszug | **ohne Quelltext** |
| Suche im Fall | ✓ | ✓ | ✓ | **keine Quelltexttreffer** |
| Journal lesen | ✓ | ✓ | ✓ | ✓ |
| Generierte Texte (Doku, Zusammenfassung) | ✓ | ✓ | ✓ | **ohne Quelltextzitate** |

Ein Link vergibt keine Rechte. Eine Erwähnung vergibt keine Rechte. Ein Widerruf
wirkt sofort für neue Anfragen; bereits Exportiertes ist ausdrücklich nicht
rückholbar (C23-A16).

---

## 4. Bauabschnitte

| # | Abschnitt | Fertig, wenn |
|---|---|---|
| **A1** | Datenmodell, Regeln, Migration | Ein migriertes Projekt verhält sich wie vorher; der Rohcode liegt getrennt; Regeltests decken jede Kombination Recht × Inhaltsklasse |
| **A2** | Server-Commands: `grant`, `revoke`, `changeRight`, `setRawCode` + Journal-Projektion | Kein Client schreibt Mitgliedsdaten; jede Änderung steht mit Handle im Journal |
| **A3** | Fall-Shell mit identitätserhaltendem View-Wechsel | Wechsel Management/Business/IT erhält Artefakt, Anker, Scope, Revision, Entwurf — und löst keinen Modellaufruf aus |
| **A4** | Rohcode-Dichtheit über alle Ausgabewege | Der Kanarienvogel aus §5.2 taucht in keiner Antwort, keinem Export, keinem generierten Text eines Mitglieds ohne `rawCode` auf |
| **A5** | „Playing as" | Jeder Beitrag trägt `virtual_role`; mehrere Rollen desselben Mitglieds erzeugen `self_play: true`; jede Signatur trägt den Rollenspiel-Text |
| **A6** | Threads am Anker (`UX-E05-F01:R1`) | Ein Thread bleibt beim View-Wechsel derselbe; Erledigen ist keine Freigabe |
| **A7** | **Datensparsamkeit** — am 12.09. aus Schnitt 0 hierher vertagt | Handle eingeführt (eindeutig, änderbar); `firstName`/`lastName`, `tier 'enterprise'`, `orgId`, `maxTeamMembers` und die Okta-/Azure-Felder entfernt; bestehende Konten migriert; Mitgliederliste, Journal und Mails zeigen den Handle |

Reihenfolge ist bindend: A1 → A2 → (A3 ∥ A4) → A5 → A6. A4 vor A5, weil ein
Rollenwechsel auf einer undichten Ausgabe nur die Verwechslung hübscher macht.

**A7 hat eine harte Kopplung an A2:** die Mitgliederliste und das Journal sind die
erste Stelle, an der ein Mitglied etwas über ein anderes sieht. Solange das Profil
Namen führt, darf dort **nicht** stehen „handles and rights only" — entweder A7
kommt vor der sichtbaren Liste, oder die Liste sagt bis dahin die Wahrheit über
das, was sie zeigt. Umfang laut Bestandsaufnahme vom 12.09.: 14 Dateien, rund 62
Fundstellen, darunter Registrierung, Onboarding, Einstellungen, Kopfzeile, zwei
Admin-Panels und drei Mail-Skripte mit Vornamensanrede, dazu die GDPR-Pfade.

---

## 5. Der E2E-Prüfplan

### 5.1 Was die Infrastruktur heute kann

- Playwright gegen Emulatoren (`playwright.config.ts`: Auth 9099, Firestore 8080,
  `fullyParallel`, CI `workers: 1`, `retries: 2`). Der `--project`-Flag beim
  Emulatorstart ist nicht optional (siehe `CLAUDE.md`).
- **Das Zwei-Konten-Muster existiert:** `tests/firestore-rules.spec.ts` legt
  Owner und Attacker per `createUserWithEmailAndPassword` an, mit
  laufeindeutigen Adressen (`${branchSuffix}-${Date.now()}`).
- Admin-Seeding über `tests/helpers/admin-seed.ts` → `/api/test/seed`
  (`setDoc`, `mergeDoc`, `setCustomClaim`, `existsDoc`).
- 608 Tests, alle Guards laufen lokal CI-gleich.

**Was fehlt:** ein Vier-Konten-Fixture, ein Leck-Scanner, ein Journal-Helfer und
Regeltests für die neuen Kollektionen.

### 5.2 Neue Helfer

```
tests/helpers/case-fixture.ts   owner · editor · commenter · reader (+ outsider)
                                legt Fall, Run, Snapshot an, gibt IDs und ID-Tokens
                                zurück, räumt am Ende auf; eindeutige IDs je Test
tests/helpers/leak-scan.ts      durchsucht Antwort, DOM, ZIP, JSON und Text nach
                                dem Kanarienvogel
tests/helpers/journal.ts        liest die Journal-Projektion, prüft Typ, Akteur
                                (Handle!), Ziel und Reihenfolge
```

**Der Kanarienvogel.** Der Fixture-Quelltext enthält genau einen eindeutigen
Marker, z. B. `Z_CANARY_<uuid>`, in einem ABAP-Kommentar und in einem Literal.
Jeder Test, der „kein Rohcode" behauptet, sucht diesen Marker in Netzwerk-Payload,
gerendertem DOM, Export-ZIP, Suchergebnis und generiertem Text. Damit ist ein Leck
ein **Fund**, keine Einschätzung — dieselbe Logik, mit der v2.9.1 den Runner-Egress
gemessen statt behauptet hat.

### 5.3 Die Suiten

**S1 — Rechte auf beiden Datenpfaden** · `tests/case-access-rules.spec.ts` · QA24-A12, C23-A08/A13/A15

1. Besitzer liest Fall, Mitgliederliste, Quelle.
2. `read`-Mitglied liest den Fall, **nicht** die Quelle.
3. `comment`-Mitglied schreibt einen Thread, **keine** Anforderung.
4. `edit`-Mitglied ändert eine Anforderung, **keine** Mitgliedschaft.
5. Außenstehender bekommt bei Fall, Quelle, Journal, Beiträgen je `permission-denied`.
6. `edit` + `rawCode: false` liest die Quelle nicht — direkt über das Client-SDK.
7. Dieselben sechs Fälle über die Server-Routen (Admin-SDK-Pfad) mit identischem Ergebnis.
8. Ein Mitglied kann sich nicht selbst hochstufen (`changeRight` auf sich).
9. Ein `edit`-Mitglied wird nicht automatisch Rechteinhaber (C23-A15).
10. Admin-Pfad bleibt wie bisher und steht im Journal.
11. Tiefenlink auf wenige Zeilen behauptet keine zeilenweise Sicherheitsgrenze (C23-A13).
12. Client-Schreibversuch auf `members` scheitert (Rules), Server-Command gelingt.

**S2 — Teilen, Weiterleiten, Widerruf** · `tests/case-sharing.spec.ts` · C23-A07/A09/A16/A17/A18

1. Link kopieren erzeugt keinen Grant und keine größere Sichtbarkeit.
2. Weitergeleiteter Link an Unberechtigte: kein Inhalt, kein Titel, keine Vorschau.
3. Einladung an ein registriertes Mitglied wirkt mit genau dem gewählten Recht.
4. Einladung an eine unbekannte Adresse erzeugt kein Konto und keinen Zugriff.
5. Widerruf bei offener Sitzung: nächste Anfrage abgewiesen.
6. Widerruf während eines laufenden Exports: kein neuer Download, bereits
   heruntergeladenes ausdrücklich nicht rückholbar (Text geprüft).
7. Einzelgrant entfernen, während ein zweiter besteht → UI zeigt den verbleibenden
   effektiven Zugriff, nicht „vollständig entzogen" (C23-A17).
8. Linkvorschau/Scanner ruft die Einladung ab: keine Mutation, keine Annahme (C23-A18).
9. Rechtewechsel `edit` → `read` wirkt sofort auf Schreibpfade.
10. Der Teilen-Dialog zeigt „Rohcode: ja/nein" und das Ergebnis stimmt mit §3 überein.

**S3 — Rohcode-Dichtheit** · `tests/case-rawcode-leak.spec.ts` · W22-A20, C23-A14

Alle Tests laufen als Mitglied mit `rawCode: false` und suchen den Kanarienvogel:

1. Fallseite: DOM und alle Netzwerkantworten.
2. Anforderungs-/Ankeransicht: Anker sichtbar, Quelltext nicht.
3. Suche im Fall: keine Quelltexttreffer, auch kein Snippet.
4. Export/Audit-Pack: ZIP entpacken, jede Datei scannen; der Auszug ist als
   Auszug gekennzeichnet (C23-A30).
5. Generierte Dokumentation: kein Quelltextzitat.
6. KI-Zusammenfassung: kein Quelltextzitat (der Prompt bekommt ihn nicht).
7. Cache/Deep-Link nach Rechtewechsel: kein Nachladen aus altem Zustand.
8. Gegenprobe: Mitglied **mit** `rawCode` findet den Kanarienvogel überall dort,
   wo er hingehört — ein Test, der nie grün wird, weil nichts geliefert wird, ist wertlos.

**S4 — Fall-Shell und View-Wechsel** · `tests/case-workspace.spec.ts` · W22-A01/A02/A05/A18

1. Management → Business → IT → Management: Artefakt, Anker, Scope, Revision, Auswahl bleiben.
2. Kein Modellaufruf beim Wechsel (Netzwerk auf `/api/gemini` beobachtet).
3. Ein laufender Auftrag wird durch den Wechsel nicht neu gestartet (W22-A05).
4. Entwurf im Eingabefeld überlebt den Wechsel (`UX-E11-F02:R1`).
5. Derselbe Thread erscheint in allen drei Views ohne Duplikat (W22-A18).
6. Fehlendes Mapping wird als fehlend angezeigt, nicht erfunden (W22-A03).
7. Historische Auswahl wird nicht still ersetzt.
8. Deep Link nach Anmeldung landet auf demselben Gegenstand und derselben Revision (C23-A10).

**S5 — Virtuelle Rollen und Self-Play** · `tests/virtual-roles.spec.ts` · V25-A16

1. „Playing as" bietet genau die feste Liste, kein Freitext.
2. Antwort, Bestätigung, Kommentar und Entscheidung tragen die gespielte Rolle.
3. Rollenwechsel ändert **keine** Rechte am Fall.
4. Ein Mitglied in drei Rollen → Entscheidung trägt `self_play: true`.
5. Zwei Mitglieder → `self_play: false`, und nirgends erscheint es als
   Mehrpersonenfreigabe, wenn es keine ist.
6. Jede Signatur trägt „Rollenspiel — kein organisatorisches Mandat".
7. Die Rolle steht am Beitrag, **nicht** am Konto: Profil bleibt unverändert.
8. Journal und späterer Export führen Rolle und pseudonyme Signer-ID, keinen Klartextnamen.

**S6 — Nebenläufigkeit und Idempotenz** · `tests/case-concurrency.spec.ts` · C23-A25/A26, W22-A19

1. Zwei Mitglieder ändern dieselbe Anforderung → sichtbarer Konflikt statt Verlust.
2. Doppelt gesendeter Grant-Command erzeugt einen Grant und einen Journaleintrag.
3. Freigabe auf veralteter Grundlage wird serverseitig abgewiesen (C23-A26).
4. Fremde Änderung während der Bearbeitung erzeugt einen Hinweis, keinen stillen Verlust.
5. Gleichzeitiger Widerruf und Schreibversuch: der Widerruf gewinnt.
6. Kommentar gilt erst nach dauerhafter Serverbestätigung als gespeichert.

**S7 — Journal** · `tests/case-journal.spec.ts` · C23-A27, QA24-A13

1. Grant, Widerruf, Rechtewechsel, Rohcode-Schalter, Entscheidung stehen im Journal.
2. Der Eintrag nennt **Handle**, Zeitpunkt vom Server, Ziel und Recht — keine E-Mail.
3. Mitglieder lesen das Journal; Außenstehende nicht.
4. Kein Client kann ins Journal schreiben.
5. Ist das Journal nicht schreibbar, wird die verbindliche Mutation **nicht** als
   erfolgreich bestätigt (C23-A27).
6. Reihenfolge und Vollständigkeit über eine Kette von zehn Aktionen.

**S8 — Datensparsamkeit** · `tests/data-minimisation.spec.ts` · `UX-E11-F03`-Vertrag

1. Mitgliederliste zeigt Handle und Recht — kein Name, keine Firma, keine Position.
2. Registrierung akzeptiert keine Namensfelder mehr.
3. Kein Export enthält E-Mail oder Handle ohne ausdrückliche Wahl.
4. Kontolöschung pseudonymisiert Beiträge („ehemaliges Mitglied"), Fallartefakte
   bleiben beim Fallbesitzer.
5. Der Journal-Schreiber führt keinen `actorEmail` mehr (siehe §7).
6. Ein geteilter Fall gibt über die API keine Mitgliedsidentität heraus.

**S9 — Leistung und Zugänglichkeit** · erweitert vorhandene Guards · W22-A21/A23, QA24-A15

1. Warmer View-Wechsel gegen das Budget (p95 ≤ 100 ms bis zum bedienbaren
   Kerninhalt, **nicht** bis zum Spinner) unter benanntem Profil.
2. Kalter Direktlink getrennt gemessen — Download und Initialisierung zählen zum
   kalten Einstieg (QA24-A15).
3. Geteiltes Lastprofil mit eingeschalteten Rechte- und Journalprüfungen (C23-A35).
4. Tastaturweg durch Teilen-Dialog, Rollenumschalter und Thread.
5. Fokusreihenfolge und Statusansagen im Kernflow.
6. Mobile: der bestätigungsrelevante Scope verschwindet nicht unter einer fixierten Leiste.

**Summe: 70 neue Tests** auf heute 608 — plus die Regeltests aus A1, die in
S1 aufgehen.

### 5.4 Die fünf Tests, die den meisten Wert haben

S3.4 (Export-ZIP gescannt), S3.6 (KI-Zusammenfassung), S1.6 (`edit` ohne
`rawCode` direkt über das Client-SDK), S2.5 (Widerruf bei offener Sitzung),
S7.5 (nicht schreibbares Journal blockiert die Mutation). Vier davon sind
Negativtests auf Wegen, die eine Oberflächenprüfung nie berührt — und genau dort
lagen in 2.9 die teuersten Funde.

### 5.5 Was E2E hier nicht leisten kann

Der Regel-Deploy (CI rollt `firestore.rules` nicht aus — der Test prüft die
Regeln, nicht ihre Veröffentlichung), das Urteil eines echten Screenreaders,
Mehrbenutzerlatenz unter realer Last und die Frage, ob ein Mitglied den Fall
**versteht** — das misst der Beobachtungslauf `UX-E12-F01:R1`, nicht die Suite.

---

## 6. Abhängigkeit zu Schnitt 0

`UX-E11-F03:R0` liefert die servervalidierten Commands und das negative
Referenzmaterial; `UX-E02-F01:R0` die Inputbindung, an der Fall und Revision
hängen. Vor A1 steht ein **manueller Regel-Deploy**. Wer A1 ohne R0 beginnt, baut
die Freigabe auf client-schreibbaren Feldern — also genau den Zustand, den CR-28
beschreibt.

---

## 7. Risiken und offene Punkte

- **`logAuditEvent` speichert `actorEmail`** (`lib/firebase-admin.ts`). Sobald das
  Journal für Mitglieder sichtbar wird, widerspricht das der Datensparsamkeit. Die
  Projektion muss den Handle führen, und der Schreiber sollte die Adresse gar
  nicht erst aufnehmen.
- **`audit_events` ist client-unlesbar** (`allow read, write: if false`) — richtig
  für Admin-Ereignisse, unbrauchbar als Mitglieder-Journal. Deshalb die eigene
  Projektion je Fall.
- **Rohcode-Trennung ist eine Migration**, kein Feldumzug: bestehende Projekte,
  Runs, Exporte und Hashes müssen danach identisch verifizieren.
- **Schnitt A trägt jetzt zwei Migrationen** (Rohcode und Konto/Handle, A7), weil
  die Datensparsamkeit am 12.09. hierher vertagt wurde. Beide berühren bestehende
  Nutzerdaten, beide brauchen einen Regel-Deploy vor der App — sie sollten nicht
  im selben Release-Schritt laufen.
- **`fullyParallel` plus geteilte Emulatordaten**: jedes Fixture braucht
  laufeindeutige IDs — das Muster steht in `tests/firestore-rules.spec.ts`.
- **Die Suite wächst um ~12 %.** Bei `workers: 1` in CI ist das Laufzeit; wenn es
  drückt, gehören S9 und die Gegenproben in einen eigenen, selteneren Lauf — aber
  nie die Negativtests aus §5.4.
