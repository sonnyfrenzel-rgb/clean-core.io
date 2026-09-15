# Clean-Core.io — Rahmenkorrektur 2.7: Enterprise-Spielwiese mit echter Evidenz

**12. September 2026 · Dokumentrevision 2.7 · präzisiert 2.6 (Rollenmodell, Datensparsamkeit, Positionierung)**

> **Abgelöst am 15.09.2026 durch [`docs/ROADMAP.md`](../../ROADMAP.md) (Fassung 2.8).**
> Der Rahmen dieser Korrektur gilt nicht mehr: Rollen sind **nur Sichten** ohne
> Attribut am Beitrag und ohne Einfluss auf das Audit, die Verantwortung liegt beim
> angemeldeten Konto, und das **Konto bleibt unverändert** (kein Handle, keine
> Migration). Geteilt wird per E-Mail-gebundener Einladung zur Einsicht.

---

## 1. Der Rahmen in vier Sätzen

1. **Rollen sind virtuell und gehören dem eingeloggten Mitglied.** Ein Mitglied setzt sich beim Beitragen einen Hut auf — Prozesseigner, Application Consultant, Solution Architect, Controlling, Betrieb, Management. Der Hut ist ein Attribut des Beitrags, nie des Kontos. Es wird kein einziges personenbezogenes Datum mehr gespeichert als Login-E-Mail und ein Handle.
2. **Clean-Core.io ist die Enterprise-Spielwiese der Community — mit wahrhaftigem Inhalt.** Der Entscheidungsfluss eines Unternehmens (Verstehen → Gegenprobe → Wirtschaftlichkeit → Entscheidung → Umsetzung → Übergabe) wird vollständig durchgespielt; allein mit Rollenwechsel oder mit anderen Mitgliedern. Virtuell sind nur die Rollen. Die Evidenz ist echt: echter Code, echte SAP-Katalogdaten, veröffentlichte Regeln, signierte Ergebnisse.
3. **Kein Wettbewerb mit Nova, Lemongrass oder SI-Plattformen.** Sie liefern in Projekten mit Gewährleistung; Clean-Core.io liefert die freie Vorbereitung und die Evidenz, die ein Mitglied in seine Organisation mitnimmt — als Export oder per MCP, auch in ein Nova-Projekt hinein.
4. **Maximaler Mehrwert für die Community ist das Ziel**, nicht Enterprise-Umsatz: Spielfälle ohne eigenen Code, Rollenwechsel, mitnehmbare Entscheidungsunterlagen, öffentliche Datenprodukte, Musterbibliothek, Zero-LLM/BYOK, MCP.

Die USP bleibt und wird konkreter: **Vom unverstandenen Z-Programm zur belegten Entscheidung — frei, verifizierbar, ohne SAP-Lizenz. Die Enterprise-Spielwiese der Community: echte Evidenz, virtuelle Rollen, echte Vorbereitung.**

---

## 2. Rollenmodell 2.7: virtuell, pro Beitrag, ohne Profil

| Gegenstand | Regel |
|---|---|
| Was eine Rolle ist | Ein Hut aus einer festen Liste (Prozesseigner · Application Consultant · Solution Architect · Enterprise Architect · Controlling · QA · Betrieb · Management), gewählt beim Beitragen über „Playing as". Frei eingetippte Rollen gibt es nicht |
| Wo sie gespeichert wird | Am Beitrag (Antwort, Bestätigung, Entscheidung, Kommentar, Signatur): `member_id` (pseudonym) + `virtual_role`. Nicht am Konto, nicht als Profilfeld, nicht als Organisationsangabe |
| Wer welche Rolle spielen darf | Jedes Mitglied jede Rolle. Es gibt keine Prüfung, keine Zuweisung, keine Hierarchie |
| Self-Play | Spielt dasselbe Mitglied mehrere Rollen eines Falls, trägt die Entscheidung das Kennzeichen `self_play: true`. Das Evidence Pack sagt es offen: „Rollenspiel eines Mitglieds" vs. „mehrere Mitglieder" |
| Was der Pack und der MCP herausgeben | Virtuelle Rolle + pseudonymer Signer-ID; keine E-Mail, kein Handle, kein Name — es sei denn, das Mitglied fügt seinen Handle beim Export ausdrücklich hinzu |
| Was eine Rolle nie ist | Ein organisatorisches Mandat. Jede Signatur trägt: *Rollenspiel — kein organisatorisches Mandat.* Das echte Mandat entsteht im Unternehmen, nachdem die Unterlage dort angekommen ist |

**Datensparsamkeit als Vertrag.** Konto = E-Mail (verifiziert) + Handle (frei wählbar, änderbar). Keine Namensfelder, keine Firma, keine Position, kein Foto, keine Telefonnummer. Kommentare und Journal zeigen den Handle. Beim Löschen des Kontos werden Beiträge pseudonymisiert („ehemaliges Mitglied"); die Fallartefakte bleiben beim Fallbesitzer. Kein Tracking, keine Analytics-Cookies. Das ersetzt Abschnitt 4 („Community-Modell") der Rahmenkorrektur 2.6 in den Punkten Mandat und Identität; Eigentum, Rechte, Journal und Grenzen bleiben.

---

## 3. Positionierung: Enterprise-Spielwiese, wahrhaftiger Inhalt

**Der Satz für die Site:**

> Clean-Core.io ist die Enterprise-Spielwiese der SAP-Community: Führe den vollständigen Entscheidungsfluss eines Unternehmens für ein Stück Custom Code durch — allein mit virtuellen Rollen oder mit anderen Mitgliedern — auf echtem Code, echten SAP-Katalogdaten und veröffentlichten Regeln. Virtuell sind nur die Rollen. Die Evidenz ist echt, signiert und mitnehmbar.

**Was „Spielwiese" bedeutet und was nicht:**

| Bedeutet | Bedeutet nicht |
|---|---|
| Man darf üben, durchspielen, verwerfen, neu entscheiden | Spielzeugdaten, erfundene Nachfolger, geschönte Level |
| Eine Person kann alle Rollen durchlaufen | Dass ein Self-Play-Ergebnis ein Mandat wäre |
| Spielfälle aus dem Referenzkorpus ohne eigenen Code | Dass eigener Code nicht möglich wäre |
| Ergebnisse gehen als Export/MCP in die echte Organisation | Dass Clean-Core.io in der Organisation betrieben würde |
| Wahrhaftig: deterministische Engine, beide Katalogsichten, Regelversion, Signatur | Behauptete Konformitätsprozente, Geldwerte ohne Annahmen, Empfehlungen ohne Beleg |

**Wettbewerbsstellung (ehrlich):** Nova, Lemongrass, Kyndryl, smartShift gewinnen Projekte mit Skalierung, Laufzeitdaten und Gewährleistung. Das ist nicht das Spielfeld eines Sole Entrepreneurs. Clean-Core.io besetzt, was diese Anbieter aus Geschäftslogik nicht besetzen: die freie, verifizierbare Vorbereitung durch die Person, die den Code kennt — bevor ein Projekt beginnt oder während es läuft. Die Vergleichsseiten (UX-E14-F05) sagen genau das: „Wann Nova, wann Clean-Core.io, wann beides."

---

## 4. Maximaler Mehrwert für die Community — acht Hebel

| # | Hebel | Was das Mitglied bekommt | Backlog |
|---|---|---|---|
| 1 | **Spielfälle** | Den Entscheidungsfluss an 25 Referenzfällen üben, ohne eigenen Code hochzuladen; jeder Spielfall hat Ground Truth zum Vergleichen | UX-E01-F04:R2 (neu) |
| 2 | **Rollenwechsel / Self-Play** | Den ganzen Unternehmensfluss allein durchspielen — verstehen, was Business, Architektur und Controlling voneinander brauchen | UX-E01-F04:R1 (neu) |
| 3 | **Mitnehmbare Unterlagen** | Kurzbrief, Optionen mit Belegen, Entscheidungsentwurf, Evidence Pack — als Export in die eigene Organisation | UX-E03-F03, UX-E05-F02/F03, UX-E09-F01/F02 |
| 4 | **Öffentliche Datenprodukte** | Katalog mit beiden Sichten, Level-Regeln, Changelog, Bench — zitierbar, prüfbar, kostenlos | UX-E14-F01–F04, UX-E16-F03 |
| 5 | **Musterbibliothek** | Anonymisierte Muster anderer Mitglieder, CC-BY | UX-E10-F02 |
| 6 | **Zero-LLM und BYOK** | Sensiblen Code analysieren, ohne ihn einem Modellanbieter zu geben | UX-E15-F01, UX-E15-F03 |
| 7 | **MCP** | Ergebnisse in die eigenen Werkzeuge lesen — auch in ein laufendes SI-Projekt | UX-E16-F03 |
| 8 | **Diskussion mit minimalen Daten** | Threads am Gegenstand mit anderen Mitgliedern, nur Handles | UX-E05-F01, UX-E11-F03 |

Was nicht gebaut wird, weil es der Community nichts bringt und Enterprise-Erwartungen weckt: Rollenverwaltung, Organisationskonten, Mandats-Policies, Portfolio-Aggregation, Betrieb beim Kunden.

---

## 5. Änderungen am Backlog (2.6 → 2.7)

| Feature | Änderung |
|---|---|
| **UX-E01-F04 (neu)** — Spielwiese: Rollenwechsel und Spielfälle | R1: „Playing as"-Umschalter, virtuelle Rolle am Beitrag, Self-Play-Kennzeichen. R2: Spielfälle aus dem Referenzkorpus mit Ground-Truth-Vergleich |
| UX-E05-F03 | Mandat = virtuelle Rolle des eingeloggten Mitglieds; `self_play`-Kennzeichen; Signaturtext „Rollenspiel — kein organisatorisches Mandat" |
| UX-E11-F03 | Datensparsamkeit als Vertrag; Mitglieder nur mit Handle und Recht; keine Profil-Rollen; Pseudonymisierung beim Kontolöschen |
| UX-E16-F03 | MCP und Evidence Pack geben virtuelle Rolle + pseudonymen Signer-ID heraus; keine Mitgliedsidentitäten |
| UX-E12-F01 | Pilot mit Self-Play-Läufen und Mehrmitglieder-Läufen getrennt gemessen |
| UX-E14-F05 | Vergleichsseiten mit „wann Nova, wann Clean-Core.io, wann beides" |
| Glossar, V25 | „Virtuelle Rolle", „Self-Play"; Abnahmefall V25-A16 |

Teilschnitte: 76 (74 + `UX-E01-F04:R1`, `UX-E01-F04:R2`). Graph erneut geprüft: keine fehlende Referenz, keine Abhängigkeit von einem späteren Gate, kein Zyklus. Langversion `clean-core-backlog-v2_7.md`, Graph `delivery-slices-v2_7.json`, Mockups `clean-core-mockups-v2_7.html`.

---

## 6. Was das für Schnitt 0 und A bedeutet

Nichts verschiebt sich. Schnitt 0 (Belegt) bleibt zuerst. In Schnitt A kommt der „Playing as"-Umschalter zur R1-Fallfreigabe hinzu — er ist klein (ein Enum am Beitrag) und macht den R1-Beobachtungslauf erst möglich: Ein Mitglied kann den Fall allein durchspielen, bevor drei Mitglieder gefunden sind.
