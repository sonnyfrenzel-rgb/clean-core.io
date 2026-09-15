# Clean-Core.io — Backlog 2.7 (Langversion)

**Alle Epics, Features und User Stories · 11. September 2026 · Dokumentrevision 2.7 (Enterprise-Spielwiese: virtuelle Rollen, Datensparsamkeit)**

> **Seit 15.09.2026 archiviert — Quellmaterial für [`docs/ROADMAP.md`](../../ROADMAP.md) (Fassung 2.8).**
> Verträge und Abnahmefälle (W22, C23, QA24, V25) werden weiter zitiert, **soweit
> sie ROADMAP.md §2 nicht widersprechen.** Nicht mehr gültig: `UX-E01-F04`
> („Playing as", Self-Play, V25-A16), der Datensparsamkeitsvertrag in `UX-E11-F03`
> (Konto = E-Mail + Handle), die Rechtestufen und der Rohcode-Schalter der
> Fallfreigabe, die Rollen-Mandate und der Decision Request in `UX-E05-F03`, die
> virtuellen Rollen und pseudonymen Signer-IDs in `UX-E16-F03`, der Fallzuschnitt
> in `UX-E02-F01:R1`. Gate-Zuordnungen und Größen hier gelten nicht mehr — die
> Reihenfolge steht in den Phasen der Roadmap.

**Status:** Umsetzungsauftrag zur späteren Realisierung, keine Produktfreigabe. Gehört zu `clean-core-roadmap-v2_5.md` (Prüfung, USP, Schnitte) sowie `clean-core-roadmap-v2_6-delta.md` (frei, privat, Community; Management-View auf den Einzelfall; MCP für Corporates) und `clean-core-roadmap-v2_7-delta.md` (virtuelle Rollen, Datensparsamkeit, Spielwiese). Zurückgezogene Features bleiben mit ID und Begründung stehen; ihre Stories sind durchgestrichen und zählen nicht. Die 13 Epics, 39 Features und 78 Stories der Fassung 2.4 sind vollständig und mit unveränderten IDs enthalten; drei Epics, elf Features und 22 Stories sind neu (UX-E14 bis UX-E16). Alle Abnahmekataloge (W22, C23, QA24) bleiben gültig und stehen mit den neuen V25-Fällen in Anhang A.

---

## 0. Konventionen

**IDs.** `UX-Exx` Epic, `UX-Exx-Fyy` Feature, `UX-Exx-Fyy-USzz` Story. `Feature:Gate` bezeichnet einen abnehmbaren Teilschnitt. IDs werden nie umbenannt; entfallene Inhalte bleiben als „zurückgezogen" markiert statt gelöscht.

**Rahmen 2.6.** Kostenloses, privates Community-Projekt: keine Enterprise-Edition, kein Organisationsbetrieb, keine Tenants, kein SSO, keine Gäste, keine unterstützte Self-Hosted Edition, kein ALM-Adapter. Teilen und Bearbeiten nur mit angemeldeten Community-Mitgliedern. **Rollen sind virtuell:** Hüte aus einer festen Liste, die das eingeloggte Mitglied pro Beitrag wählt („Playing as"); sie werden am Beitrag gespeichert, nie am Konto. Konto = E-Mail + Handle, sonst nichts. Ein Mitglied darf alle Rollen spielen (Self-Play, gekennzeichnet). Eine virtuelle Rolle ist nie ein organisatorisches Mandat. Corporates lesen über MCP und Open Evidence Format — nur virtuelle Rollen und pseudonyme Signer-IDs, keine Mitgliedsidentitäten.

**Gates und Versionen.** R0/G0 = v2.10 · R1 = v2.11 · R2 = v2.12 · 3.0 = v3.0 · 3.1–3.5 = v3.1–v3.5. Gates sind Abnahmen pro angebotenem Pfad; nicht angebotene Optionen erscheinen nicht als bestanden.

**Priorität.** P1 = erforderlich für den angegebenen Kernpfad; P2 = späterer Ausbau. Keine CVSS-Bewertung.

**Größenklasse je Teilschnitt.** S < 1 Woche · M 1–3 Wochen · L 3–8 Wochen · XL > 8 Wochen — jeweils inklusive Referenzfälle, unabhängigem Review, Betrieb und Doku. Planungshypothese für einen Maintainer mit AI-gestützter Entwicklung; nach Abnahme von Schnitt A neu zu schätzen.

**Feature-Vorlage.** Auftrag · Lieferumfang nach Gate · Priorität und Größe · Abhängigkeiten je Teilschnitt · Herkunft (historische IDs) · Vertrag · Stories mit Abnahme (Erfolgsfall/Negativfall) · Abnahmekataloge · Änderung gegenüber 2.4.

**Story-Regel.** Jede Story hat genau eine Zielrolle, ein Ziel und einen Nutzen; jede Abnahme hat einen Erfolgs- und einen Negativfall. Text darf keine höhere Sicherheit ausdrücken als die Daten hergeben.

**Gemeinsame Definition of Done** (RM-7B der 2.4, unverändert): serverseitig validierter und berechtigter Datenzustand; überprüfbare Quellen-/Revisionsbindung; positive und negative Story-Szenarien getestet; Kernflow funktioniert bei leeren Daten, Fehler, Unterbrechung und veralteten Grundlagen; Zielrolle kann Zweck und Aufgabe ohne technische Einweisung erklären; architektonische Entscheidungen wirken nachvollziehbar auf die Umsetzung; Nachweise nennen Umfang, Umgebung und Stand; Export, Übertragung, Empfang und fachlicher Abschluss sind getrennte Ereignisse; Warm-/Kalt-Budgets benannt; sicherheitskritische Funktionen nur in abgesicherter Betriebsform.

### Epic-Übersicht

| Epic | Auftrag | Schwerpunkt-Gate |
|---|---|---|
| UX-E01 | Aufgabenorientierte Oberfläche, gemeinsame Fallansicht und Spielwiese (Rollenwechsel, Spielfälle) | R1–R2 |
| UX-E02 | Eingang, Fallzuschnitt und sichtbare Wissenslücken | R0–R2 |
| UX-E03 | Bestätigter Geschäftsbedarf statt konservierter Altlogik | R1–R2 |
| UX-E04 | Standard-Gegenprobe mit Zielkontext | R2–3.0 |
| UX-E05 | Gezielte Beteiligung und verantwortete Entscheidung | R1–3.0 |
| UX-E06 | Sieben Fähigkeiten, ein integrierter Arbeitsraum | R0–3.0 |
| UX-E07 | Verbindliche Architektur und verständliche Veränderung | R0–3.3 |
| UX-E08 | Szenarien und ehrliche Ausführungsnachweise | R2–3.0 |
| UX-E09 | Passende Übergabe und kontrollierte SAP-Anbindung | 3.0–3.5 |
| UX-E10 | Änderung und Community-Wiederverwendung (Programmsteuerung zurückgezogen) | 3.3–3.4 |
| UX-E11 | Verlässliche, zugängliche und berechtigte Mitarbeit | R0–3.0 |
| UX-E12 | Nachgewiesener Nutzen statt unbewiesener Alleinstellung | R0–3.5 |
| UX-E13 | Frühe Decision Economics als gemeinsame Entscheidungsgrundlage | R0–3.5 |
| **UX-E14** | **Belegte Öffentlichkeit: Konsistenz, Verifizierbarkeit, Reichweite** (neu) | R0–3.1 |
| **UX-E15** | **Souveräner Betriebsweg: Zero-LLM, Provider** (neu; Self-Hosting zurückgezogen) | R0–3.5 |
| **UX-E16** | **Ökosystem-Anschluss: Importe, Open Evidence Format, MCP für Corporates** (neu) | R2–3.2 |

---

## Teil A — Epics UX-E01 bis UX-E13 (überarbeitet, IDs erhalten)

<a id="ux-e01"></a>
### UX-E01 — Aufgabenorientierte Oberfläche und gemeinsame Fallansicht

<a id="ux-e01-f01"></a>
#### UX-E01-F01 — Code-zentrierter Einstieg vor, während und nach Explore

**Auftrag.** Aufgabenlinks führen zur konkreten Frage. Business, Management und IT können einen Fall selbst öffnen, untersuchen oder eine Frage anstoßen; der Fachbereich ist nicht nur Empfänger einer Architektenanfrage. Persönliche Präferenz und Einstiegsanker bestimmen die erste Darstellung; kein verpflichtender Persona-Onboarding-Dialog.

**Lieferumfang nach Gate.** R1 (v2.11): Code-zentrierter Einstieg vor, während und nach Explore.
**Priorität/Größe.** P1 · R1: M.
**Abhängigkeiten.** UX-E01-F01:R1 ← UX-E02-F01:R1.
**Herkunft.** E01-F01, SR-E09.

**Vertrag.** Direktlinks führen nach Anmeldung auf den identischen Gegenstand, die passende Revision und gegebenenfalls den Thread. Fragen vor Explore, Klärung in Explore und historische Antworten nach Übergabe sind ohne neuen Pflichtworkflow möglich. Eine private Einzelanalyse bleibt ohne Einladung und Teamraum nutzbar.

**UX-E01-F01-US01** — Als Prozesseigner möchte ich selbst eine alte Individuallösung untersuchen oder eine Frage eröffnen, um nicht auf einen technischen Decision Request angewiesen zu sein.
- Erfolgsfall: Ein eigener Einstieg öffnet denselben Fallkern wie eine Einladung; eine neue Frage hat Scope, Anker und zuständige Rolle.
- Negativfall: Das Erstellen einer Frage erzeugt weder bestätigten Bedarf noch Zugriffsrechte auf geschützten Code.

**UX-E01-F01-US02** — Als eingeladener Experte möchte ich unmittelbar meine konkrete Aufgabe sehen, um ohne vollständige Analyselektüre beitragen zu können.
- Erfolgsfall: Ein Aufgabenlink bewahrt Fall, Anforderung und Revision; die gewünschte eigene Perspektive bleibt wählbar.
- Negativfall: Die Einladung setzt keine Zustimmung voraus und erzwingt keinen Durchlauf durch sieben Seiten.

**Abnahmekataloge.** C23-A04/A07/A10/A28/A33.
**Änderung gegenüber 2.4.** Keine inhaltliche; Größenklasse ergänzt.

<a id="ux-e01-f02"></a>
#### UX-E01-F02 — Gemeinsamer Artefaktarbeitsraum mit identitätserhaltendem View-Wechsel

**Auftrag.** Verstehen, Entscheiden und Absichern bestimmen die Aufgabe; Management, Business und IT bestimmen Verdichtung, Sprache und Reihenfolge. Beide Achsen sind unabhängig; keine neun Dashboards. Scope, Revision, selektierter fachlicher Anker und kritische Unsicherheit bleiben bei jedem Wechsel sichtbar; der Wechsel löst keinen LLM-Aufruf aus.

**Lieferumfang nach Gate.** R1 (v2.11): Gemeinsamer Artefaktarbeitsraum mit identitätserhaltendem View-Wechsel.
**Priorität/Größe.** P1 · R1: L.
**Abhängigkeiten.** UX-E01-F02:R1 ← UX-E02-F01:R1.
**Herkunft.** E01-F01, E04-F02.

**Vertrag.** Die Shell hält ausgewähltes Artefakt, fachlichen Anker, Scope, Revisionsmanifest, Option, TCO-Szenario und Entwurf. Views sind Darstellungen desselben Kerns. Der warme Wechsel benötigt keinen Analyse-/LLM-Auftrag und keinen blockierenden Datenabruf; Budgetvorschlag p95 ≤ 100 ms, p99 ≤ 200 ms unter dem Profil aus W-11 — gemessen bis zum bedienbaren Kerninhalt, nicht bis zum Spinner. Quellenstand, Artefaktmanifest und private View-Präferenz bleiben auseinander; ein geteilter View-Hinweis ändert weder Inhalt noch Rechte; eine historische Auswahl wird nicht still ersetzt. Teilen ist eine Aktion auf dem Arbeitsraum, kein neuer Berichtsprozess.

**UX-E01-F02-US01** — Als Workshop-Teilnehmer möchte ich denselben Sachverhalt mit einem Klick aus Management-, Business- oder IT-Sicht betrachten, um fremde Perspektiven ohne Kontextverlust zu verstehen.
- Erfolgsfall: Fall-, Anforderungs-, Options-, Kosten- und Entscheidungsrevision bleiben gleich; nur Präsentation und Priorisierung verändern sich.
- Negativfall: Ein Sichtwechsel verändert weder Fit-Status noch Empfehlung, Mandat, Analyse-Run oder Kostenannahmen.

**UX-E01-F02-US02** — Als Manager möchte ich bereits beim einzelnen Fall Entscheidung, Kostenrahmen und offenen Nachweis sehen, um nicht auf ein späteres Portfolio-Modul angewiesen zu sein.
- Erfolgsfall: Der frühe Einzelfall zeigt Optionsfolgen und Datenlücken mit Verweis auf denselben Beleg wie Business und IT.
- Negativfall: Eine verdichtete Managementdarstellung blendet keinen entscheidungskritischen Gegenbeleg aus.

**Management-View (2.6).** Derselbe Fall, anderer Blick: Optionskandidat mit Evidenzstufe, Kostenstand (Orientierung/Simulation/geprüft), offene Pflichtbedingungen mit Verantwortlichem, gebundene Revisionen, Beteiligte (Handle, Recht) und gespielte virtuelle Rollen, Verlauf, nächste Beiträge. Keine Aggregation über mehrere Fälle, keine Programm-Kennzahlen.

**Abnahmekataloge.** W22-A01/A02/A23; C23-A10/A11/A19/A35; QA24-A01, A15, A17.
**Änderung gegenüber 2.4.** QA-Vertrag (QA24-01/15/17) in den Vertrag integriert; keine parallelen Nachträge. 2.6: Inhalt des Management-Views festgelegt; Programmsteuerung (UX-E10-F01) zurückgezogen.

<a id="ux-e01-f03"></a>
#### UX-E01-F03 — Views, Layer und semantisches Zoom mit fachlicher und technischer Tiefe

**Auftrag.** Business bietet Kurzbrief und bei Bedarf Prozesse/BPMN, Regeln, Varianten, Value und Szenarien. IT bietet die Fokusse Applikation, Lösung und Enterprise — Inhaltsprojektionen, keine Berechtigungsrollen. Details öffnen direkt und mit semantischem Rückkehranker; Expertenwerkzeuge bleiben erreichbar.

**Lieferumfang nach Gate.** R1 (v2.11): Views, Layer und semantisches Zoom.
**Priorität/Größe.** P1 · R1: M.
**Abhängigkeiten.** UX-E01-F03:R1 ← UX-E01-F02:R1.
**Herkunft.** E04-F02, E09-F03.

**Vertrag.** Layer für Prozess/Bedarf, Standard-Fit, Kosten, Architektur, Nachweise und Änderungen erweitern dieselbe Auswahl. Details haben stabile fachliche Anker; technische Schichten (Interaktion, Geschäftslogik, Daten, Integration, Identität, Betrieb) sind innerhalb des Architektur-Layers erreichbar. Fehlendes Mapping wird als fehlend angezeigt. Ein optionaler Zweifenstervergleich synchronisiert die semantische Auswahl, nicht Pixelpositionen.

**UX-E01-F03-US01** — Als Application Consultant oder Architekt möchte ich meinen IT-Fokus auswählen und direkt zu relevanten Belegen gelangen, um die fachliche beziehungsweise technische Tiefe meiner Arbeit zu behalten.
- Erfolgsfall: Applikation priorisiert Prozess/Customizing, Lösung technische Schichten und NFRs, Enterprise Abhängigkeiten/Lifecycle; alle referenzieren dieselbe Fallrevision.
- Negativfall: Ein Fokuswechsel erfindet keine neue Zielarchitektur und versteckt keine kritische Voraussetzung der gewählten Option.

**UX-E01-F03-US02** — Als Prozessexperte möchte ich zwischen kurzer Erklärung und detailliertem Prozess-/Regelmodell wechseln, um fachlich tief zu arbeiten, ohne technische Begriffe erzwingen zu müssen.
- Erfolgsfall: Prozesskarte, BPMN-Verweis und Regelansicht führen auf stabile Anforderungs-/Aktivitäten-IDs mit Quellen und Status zurück.
- Negativfall: Weder verschachtelte Drawer noch ein allgemeiner Einfachmodus machen erforderliche Business-Details unauffindbar.

**Abnahmekataloge.** W22-A03/A20/A21.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e01-f04"></a>
#### UX-E01-F04 — Spielwiese: virtuelle Rollen, Self-Play und Spielfälle

**Auftrag.** Der eingeloggte Nutzer wählt beim Beitragen einen Hut („Playing as": Prozesseigner, Application Consultant, Solution Architect, Enterprise Architect, Controlling, QA, Betrieb, Management). Der Hut ist ein Attribut des Beitrags, nicht des Kontos. Ein Mitglied darf alle Rollen eines Falls spielen; die Entscheidung trägt dann `self_play: true`. Spielfälle aus dem Referenzkorpus erlauben das Üben ohne eigenen Code — mit Ground Truth zum Vergleichen.

**Lieferumfang nach Gate.** R1 (v2.11): „Playing as"-Umschalter im Fallkopf; virtuelle Rolle an Antwort, Bestätigung, Kommentar und Entscheidung; Self-Play-Kennzeichen; Signaturtext „Rollenspiel — kein organisatorisches Mandat". R2 (v2.12): Spielfälle aus dem Referenzkorpus (UX-E12-F02:R0) als kopierbare Fälle mit Ground Truth (Findings, Level beider Sichten, Nachfolger, Business-Sätze); Vergleich „meine Entscheidung vs. Ground Truth" ohne Wertung als richtig/falsch bei Entscheidungen.
**Priorität/Größe.** P1 · R1: S · R2: M.
**Abhängigkeiten.** UX-E01-F04:R1 ← UX-E01-F02:R1, UX-E11-F03:R1 · UX-E01-F04:R2 ← UX-E01-F04:R1, UX-E12-F02:R0.
**Herkunft.** Rahmenkorrektur 2.7; W-01 (Einzelnutzung bleibt), W-09 (Mandat ≠ Identität).

**Vertrag.** Feste Rollenliste, keine Freitextrollen, keine Rollenverwaltung, keine Zuweisung durch Dritte. Die Rolle steht am Beitrag mit `member_id` (pseudonym) und `virtual_role`; Journal und Pack führen sie mit. Self-Play wird nie als Mehrmitglieder-Entscheidung dargestellt. Ein Spielfall ist als Spielfall gekennzeichnet und wird nicht mit eigenem Kundencode vermischt; Ground Truth zeigt Fakten (Level, Nachfolger), keine „richtige Entscheidung" — Entscheidungen bleiben Abwägungen. Datensparsamkeit: Konto = E-Mail + Handle; keine Namens-, Firmen-, Positions- oder Profilrollenfelder.

**UX-E01-F04-US01** — Als eingeloggtes Mitglied möchte ich den Fall allein in wechselnden Rollen durchspielen, um zu verstehen, was Business, Architektur und Controlling voneinander brauchen, bevor ich Kollegen einbinde.
- Erfolgsfall: Jede Antwort und Entscheidung trägt die gespielte Rolle; das Pack kennzeichnet die Entscheidung als Self-Play; der Fall bleibt exportierbar und per MCP lesbar.
- Negativfall: Self-Play erzeugt kein organisatorisches Mandat und erscheint nirgends als Freigabe mehrerer Personen; ein Rollenwechsel ändert keine Rechte am Fall.

**UX-E01-F04-US02** — Als Einsteiger möchte ich einen Spielfall aus dem Referenzkorpus öffnen und den ganzen Entscheidungsfluss üben, ohne eigenen Code hochzuladen.
- Erfolgsfall: Der Spielfall enthält Code, Findings, beide Level-Sichten und Business-Sätze mit Ankern; nach der Entscheidung zeigt der Vergleich die Ground-Truth-Fakten und meine Abweichungen bei Level/Nachfolger.
- Negativfall: Ein Spielfall wird nicht als Kundencode signiert oder als Referenz-Run der Site ausgegeben; Entscheidungen werden nicht als „falsch" bewertet.

**Abnahmekataloge.** V25-A16 (neu); W22-A01–A03.
**Änderung gegenüber 2.6.** Neues Feature; Teilschnitte `UX-E01-F04:R1` und `UX-E01-F04:R2`.

<a id="ux-e02"></a>
### UX-E02 — Eingang, Fallzuschnitt und sichtbare Wissenslücken

<a id="ux-e02-f01"></a>
#### UX-E02-F01 — DecisionCase, stabile Artefaktreferenzen und Revisionsmanifest

**Auftrag.** Fälle verbinden mehrere technische Objekte, Jobs und manuelle Schritte; Objekte dürfen mehrere Fälle bedienen. Die erste Version ermöglicht manuelle Zuordnung und Zusammenführung, keine unbewiesene Vollautomatik.

**Lieferumfang nach Gate.** R0 (v2.10): Kanonischer Referenz-/Manifestvertrag und verträgliche Migration. R1 (v2.11): Bedienbarer Fallzuschnitt mit Scope, Quellen und stabiler Auswahl.
**Priorität/Größe.** P1 · R0: M · R1: L.
**Abhängigkeiten.** UX-E02-F01:R0 ← G0:R0 · UX-E02-F01:R1 ← UX-E02-F01:R0.
**Herkunft.** E01-F04, E03-F03, SR-E09.

**Vertrag.** Typisierte Artefakte mit ID, Revision, Scope, Provenienz und Beziehungen (SourceSnapshot, AnalysisRun/Finding, Requirement/ProcessActivity, Option/CoverageClaim, CostScenario, Decision/ArchitectureContract, ArtifactRevision/ChangeSet, Scenario/Receipt, Handover, Thread/CommentRevision, AccessGrant/ShareLink, AuditEvent). Ein CaseManifest bezeichnet den gemeinsamen Arbeitsstand mit expliziter Inputbindung. SourceSnapshots und Originalpakete bleiben unverändert referenziert; Migrationen behalten IDs und Signaturzustände. Navigation und Autorisierung sind getrennte Verträge; ein Anker ist mindestens an Artefakt/Revision gebunden. Ein UI-Perspektivwechsel erzeugt keine Domänenrevision. **Neu präzisiert:** Ableitungen führen `inputs[]` mit Revision und Hash statt Digest-Heuristik (QA24-13); die vier Datenklassen (Quellartefakte, Transaktions-/Testdaten, Ableitungen/Zusammenarbeit, Geheimnisse/Identität) sind im Manifest typisiert (QA24-14); Berechtigungstests decken Web-Client/Rules, Server/Admin-SDK, Exporte, Indizes und Jobs ab (QA24-12).

**UX-E02-F01-US01** — Als Architekt möchte ich mehrere zusammengehörige Objekte einem Fall zuordnen, um nicht jedes Include separat vom Business bestätigen zu lassen.
- Erfolgsfall: Eine Zusammenführung erhält ursprüngliche IDs, Quellen und Entscheidungen; Scopeänderung löst passende Prüfung aus.
- Negativfall: Eine gemeinsame Tabelle allein führt nicht automatisch zur fachlichen Zusammenführung.

**UX-E02-F01-US02** — Als Prozessverantwortlicher möchte ich den Fall nach Geschäftsbereich, Standort und betroffenen Abläufen abgrenzen, um nicht unbeabsichtigt für fremde Verbraucher zu entscheiden.
- Erfolgsfall: Die Entscheidung zeigt ihren expliziten Geltungsbereich und bekannte weitere Verbraucher.
- Negativfall: Die Stilllegung in einem Fall entfernt keine geteilte Komponente für einen anderen, noch aktiven Fall.

**Abnahmekataloge.** W22-A01/A06/A19; C23-A02/A05/A11/A12/A29; QA24-A03, A12, A13, A14.
**Änderung gegenüber 2.4.** Manifest-, Datenklassen- und Datenpfad-Anforderungen aus dem QA-Vertrag in den Vertrag übernommen.

<a id="ux-e02-f02"></a>
#### UX-E02-F02 — Einstieg ohne Code und nachträgliche Quellenanreicherung

**Auftrag.** Ein Fall kann aus einer Workshopfrage, einem alten Dokument, einer Transaktion oder einem manuellen Ablauf entstehen. Fehlende technische Quellen bleiben sichtbar und werden später verknüpft.

**Lieferumfang nach Gate.** R1 (v2.11).
**Priorität/Größe.** P1 · R1: S.
**Abhängigkeiten.** UX-E02-F02:R1 ← UX-E02-F01:R1.
**Herkunft.** E03-F01, E04-F02.

**Vertrag.** Ein früher Einstieg ohne Code ist ein gekennzeichneter Quellenauftrag, kein Ersatz des Code-zentrierten Produktkerns. Technische Aussagen dürfen erst mit passender Quelle als Befund geführt werden; Zukunftsbedarf und Kosten erhalten ihre eigene Herkunft statt erfundener Codeanker.

**UX-E02-F02-US01** — Als Business-Experte möchte ich einen bekannten Ausnahmeablauf beschreiben, obwohl ich keinen Quellcode habe, um seinen Bedarf rechtzeitig in Explore zu bringen.
- Erfolgsfall: Der Fall entsteht mit Herkunft „Business-Angabe" und markierter technischer Wissenslücke.
- Negativfall: Die Plattform erzeugt aus der Beschreibung keine angeblich gemessenen Aufrufzahlen oder Codezeilen.

**UX-E02-F02-US02** — Als Architekt möchte ich später vorhandene Repository- oder SAP-Prüfquellen ergänzen, um die gleiche fachliche Diskussion weiterzuführen.
- Erfolgsfall: Neue Quellen werden derselben Fallhistorie zugeordnet; Konflikte mit vorhandenen Aussagen erscheinen explizit.
- Negativfall: Ein später Upload überschreibt bestätigte Geschäftsaussagen nicht stillschweigend durch ein neues Narrativ.

**Abnahmekataloge.** C23-A05/A06.
**Änderung gegenüber 2.4.** Keine inhaltliche. Hinweis: Die Quellenanreicherung nutzt ab R2 die Importe aus UX-E16-F01 (ATC, Kernseife, SCMON).

<a id="ux-e02-f03"></a>
#### UX-E02-F03 — Scope- und Nutzungs-Blindspots als konkrete Prüfaufträge

**Auftrag.** Fehlende Includes, dynamische Verbraucher, Varianten, Zeiträume und manuelle Kontrollen werden als begrenzte Wissenslücken beschrieben. Eine Lücke erhält Verantwortlichen und Einfluss auf die Entscheidung, keinen pauschalen roten Gesamtscore.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: M.
**Abhängigkeiten.** UX-E02-F03:R2 ← UX-E02-F01:R1, UX-E03-F01:R1.
**Herkunft.** E03-F02, E03-F04, SR-E04.

**Vertrag.** Nutzungsaussagen tragen Beobachtungsfenster, Quelle (SCMON/UPL/ST03N-Import aus UX-E16-F01 oder manuelle Angabe) und Scope. Ohne passendes Fenster ist „null Aufrufe" keine Aussage. Pflicht-Blindspots sind eigene Verpflichtungen, die weder Filter, Export noch Umbenennung entfernen.

**UX-E02-F03-US01** — Als Fallverantwortlicher möchte ich sehen, welche fehlenden Informationen eine Stilllegung riskant machen, um seltene Vorgänge nicht aus einem kurzen Zeitraum heraus zu verwerfen.
- Erfolgsfall: Nutzungsangaben nennen Beobachtungsfenster, Quelle und Scope; fehlende Daten erzeugen eine konkrete Nachfrage.
- Negativfall: Null Aufrufe ohne passendes Beobachtungsfenster werden nicht als Nachweis sicherer Nichtnutzung ausgegeben.

**UX-E02-F03-US02** — Als Architekt möchte ich die Grenzen einer Analyse gezielt an die zuständige Rolle adressieren, um keinen vollständigen Neuworkshop wegen einer einzelnen unbekannten Schnittstelle auszulösen.
- Erfolgsfall: Die Frage benennt den unbekannten Verbraucher und die betroffene Entscheidung; weitere Fallarbeit bleibt möglich.
- Negativfall: Ein ungelöster Pflicht-Blindspot verschwindet nicht durch Wegfiltern, Export oder einen geänderten Falltitel.

**Abnahmekataloge.** C23-A05; V25-A05.
**Änderung gegenüber 2.4.** Nutzungsquelle explizit an den Import (UX-E16-F01) gebunden.

<a id="ux-e03"></a>
### UX-E03 — Bestätigter Geschäftsbedarf statt konservierter Altlogik

<a id="ux-e03-f01"></a>
#### UX-E03-F01 — Anforderungen mit Herkunft, Scope und Pflichtgrad

**Auftrag.** Eine Anforderung beschreibt gewünschtes Ergebnis, betroffene Situation, Verantwortlichkeit und Akzeptanzkriterium. Codebefund, menschliche Aussage und externe Quelle erhalten unterschiedliche Herkunftskennzeichnungen.

**Lieferumfang nach Gate.** R1 (v2.11).
**Priorität/Größe.** P1 · R1: M.
**Abhängigkeiten.** UX-E03-F01:R1 ← UX-E02-F01:R1.
**Herkunft.** E04-F01, E04-F03, SR-F07.

**Vertrag.** Istverhalten, zukünftiger Bedarf und technische Zielbedingungen bleiben getrennt (QA24-06). Geschäftsregeln und Dokumentation entstehen aus strukturierten referenzierten Artefakten mit sichtbarem Abdeckungsumfang; keine Vollständigkeitsbehauptung aus Ausschnitten (QA24-10). **Neu präzisiert:** Jede aus Code abgeleitete Regel trägt Zeilenanker; Sätze ohne Anker werden als „unbelegt" markiert. Die Traceability-Quote wird je Fall ausgewiesen.

**UX-E03-F01-US01** — Als Business-Analyst möchte ich einen Quellbefund als fachliche Hypothese formulieren, um ihn prüfen zu lassen, ohne ihn als bestätigten Bedarf auszugeben.
- Erfolgsfall: Die Hypothese verweist auf die konkrete Quelle; fachliche Bestätigung wird separat gespeichert.
- Negativfall: Eine gültige Zeilenreferenz allein setzt den Bedarf weder auf wahr noch auf geschäftlich erforderlich.

**UX-E03-F01-US02** — Als Prozesseigner möchte ich die zukünftige Anforderung unabhängig vom technischen Altverfahren bestätigen, um Standardabläufe statt alter Implementierungen bewerten zu können.
- Erfolgsfall: Das bestätigte Ergebnis enthält Scope, Bedingungen und Zuständigkeit; technische Lösungsnamen sind optional.
- Negativfall: Ein automatisch erkannter AUTHORITY-CHECK beweist weder die vollständige fachliche Kontrolle noch den künftigen Prozesseigner.

**Abnahmekataloge.** C23-A06; QA24-A06, A10; V25-A01.
**Änderung gegenüber 2.4.** Zeilenanker-Pflicht und Traceability-Quote als messbare USP-Größe ergänzt.

<a id="ux-e03-f02"></a>
#### UX-E03-F02 — Beibehalten, bewusst ändern oder entfallen lassen

**Auftrag.** Jedes entscheidungsrelevante Altverhalten wird mit der zukünftigen Anforderung verbunden oder bewusst abgegrenzt. Aufgeben einer Komfortregel ist ebenso zulässig wie Erhalten einer Pflichtkontrolle.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: M.
**Abhängigkeiten.** UX-E03-F02:R2 ← UX-E03-F01:R1.
**Herkunft.** E04-F03, SR-F08.

**Vertrag.** Zustände „beibehalten", „bewusst verändern", „entfallen lassen", „noch klären" je Anforderung mit verantwortlicher Rolle. Ein nicht beantworteter Decision Request gilt nicht als Zustimmung. Eine notwendige Kontrollwirkung wird nicht aus Zeitdruck still entfernt.

**UX-E03-F02-US01** — Als Prozesseigner möchte ich einen abweichenden Standardablauf bewusst akzeptieren, um unnötige Eigenentwicklung zu vermeiden.
- Erfolgsfall: Die Entscheidung dokumentiert bisheriges und akzeptiertes neues Verhalten, Auswirkungen und verantwortliche Rolle.
- Negativfall: Eine genehmigte Änderung wird später nicht als unbeabsichtigter Funktionsverlust gegen den Altcode getestet.

**UX-E03-F02-US02** — Als Qualitätsverantwortlicher möchte ich erkennen, welche alte Regel bewusst entfällt und welche unverändert gelten muss, um einen fachlich richtigen Testoracle zu verwenden.
- Erfolgsfall: Die Szenarioerwartung referenziert den genehmigten Zielbedarf und gegebenenfalls die Änderungsentscheidung.
- Negativfall: Eine kritische Regel verschwindet nicht nur deshalb aus Tests, weil der Generator sie im Zielcode ausgelassen hat.

**Abnahmekataloge.** W22-A14; C23-A22.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e03-f03"></a>
#### UX-E03-F03 — Fachlicher Arbeitsraum mit Prozess-, Regel- und Kurzbriefsicht

**Auftrag.** Ein fachlicher Arbeitsraum erklärt Auslöser, Rollen, Regeln, Ergebnisse, Kontrollen und Varianten. Kurzbrief, Prozesskarte, importiertes/referenziertes BPMN und Regelansicht sind Projektionen desselben Modells. Rekonstruiertes Ist, bestätigtes Ziel und nachgewiesene Umsetzung bleiben getrennt. Ein vollständiger BPMN-Editor ist kein 3.0-Muss.

**Lieferumfang nach Gate.** R1 (v2.11): Quellengebundener Kurzbrief und Regeln, keine ungestützten Geldbeträge. R2 (v2.12): Vertiefter Prozess-/BPMN-/Regelraum mit Varianten und Business-Einstieg.
**Priorität/Größe.** P1 · R1: M · R2: L.
**Abhängigkeiten.** UX-E03-F03:R1 ← UX-E03-F01:R1, UX-E01-F03:R1 · UX-E03-F03:R2 ← UX-E03-F01:R1, UX-E01-F03:R1, UX-E03-F03:R1.
**Herkunft.** E04-F02, E04-F04, SR-F08.

**Vertrag.** Monetäre Aussagen aller Module nur aus freigegebener Annahmenrevision (QA24-08); Regeln und Dokumentation aus strukturierten Artefakten mit sichtbarem Abdeckungsumfang (QA24-10). Der Kurzbrief entspricht dem „Object Brief" der Business-Bridge-Roadmap: was es tut, welcher Prozessschritt, welche Belege und Rollen, Nutzung (falls importiert), Standardabdeckung (ab R2 aus UX-E04-F01), Optionen, offene Fragen — jede Aussage mit Anker; Exporte Confluence/Word/PDF ab R2.

**UX-E03-F03-US01** — Als Prozessexperte möchte ich eine Regel oder Prozessaktivität fachlich korrigieren und ihre Wirkung in allen Ansichten sehen, um keine parallelen Berichte pflegen zu müssen.
- Erfolgsfall: Die Änderung erhält Autor, Quelle und Revision; Kurzbrief, Prozessansicht und zugeordnete Szenarien verweisen auf die geänderte Grundlage.
- Negativfall: Eine neu erzeugte Beschreibung überschreibt keine bestätigte Korrektur und bestätigt keine aus Code nur vermutete menschliche Rolle.

**UX-E03-F03-US02** — Als Architekt möchte ich vom fachlichen Prozessschritt zu den zugehörigen Objekten, Schnittstellen und offenen Quellen gelangen, um denselben Sachverhalt technisch zu überprüfen.
- Erfolgsfall: Ein Anker verbindet fachlichen Task, Beobachtungen, bestätigten Bedarf und vorhandene technische Nachweise.
- Negativfall: Ein syntaktisch korrektes BPMN-Modell wird nicht als belegter End-to-End-Istprozess ausgewiesen.

**Abnahmekataloge.** W22-A13/A14; QA24-A08, A10; V25-A01.
**Änderung gegenüber 2.4.** Object-Brief-Struktur und Exporte als konkreter Lieferumfang benannt.

<a id="ux-e04"></a>
### UX-E04 — Standard-Gegenprobe mit Zielkontext

<a id="ux-e04-f01"></a>
#### UX-E04-F01 — Abdeckungsbehauptung mit expliziter Evidenzstufe

**Auftrag.** Eine CoverageAssertion verbindet genau eine Anforderung, Option, Quelle und Zielkontext. E0–E4 unterscheiden unbekannt, Kandidat, dokumentierte Eignung, demonstriertes Szenario und kundenspezifische Abnahme. Daneben steht das fachliche Ergebnis: erfüllt, teilweise, nicht erfüllt, unbekannt, begründet nicht anwendbar.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: L.
**Abhängigkeiten.** UX-E04-F01:R2 ← UX-E03-F01:R1.
**Herkunft.** E05-F02, E02-F02, SR-F04.

**Vertrag.** Ein Kataloglink (Fiori Apps Reference Library, Best-Practice-Scope-Item, released API, Key-User-Option) erzeugt höchstens E1; Zielkontext (Edition, Release, Konfiguration, Landschaft) ist Teil der Behauptung. Ein fehlender Katalogtreffer beweist nicht, dass SAP eine Anforderung nicht unterstützt. Codebeobachtung und Sollregel-Nachweis werden getrennt geführt; strittige A–D-Regeln werden am versionierten Referenzkorpus (UX-E12-F02:R0) korrigiert, nicht durch vorsichtigere Klassen ersetzt (QA24-05). Ohne positive oder negative Gegenprobe bleibt Abdeckung unbekannt; Public-Routing erst anhand freigegebenem Zielkontext (QA24-06). Der Router (`extensibility-router.ts`) liefert Zielkontext-Bedingungen, keine Abdeckungsurteile.

**UX-E04-F01-US01** — Als funktionaler Berater möchte ich ein passendes Standardmerkmal zunächst als Kandidat erfassen, um es nutzbar zu machen, ohne mehr Sicherheit zu behaupten als vorhanden.
- Erfolgsfall: Ein Kataloglink erzeugt E1 und zeigt noch fehlenden Zielkontext oder Szenarionachweis.
- Negativfall: Ein Treffer oder hoher semantischer Match-Wert darf keine kundenvalidierte Abdeckung erzeugen.

**UX-E04-F01-US02** — Als Architekt möchte ich sehen, für welche Edition, Version und Konfiguration der Beleg gilt, um eine fremde Demonstration nicht als Zielnachweis zu übernehmen.
- Erfolgsfall: Abweichende oder unbekannte Voraussetzungen werden direkt an der Abdeckungsbehauptung angezeigt.
- Negativfall: Eine Demo in anderem Scope wird weder durch Kopieren noch durch manuelle Zusammenfassung zu E4.

**Abnahmekataloge.** QA24-A05, A06; V25-A02.
**Änderung gegenüber 2.4.** Öffentliche Kataloge als E1-Quellen benannt; Router auf Zielkontext beschränkt; Referenzkorpus als R0-Teilschnitt von UX-E12-F02 vorgezogen.

<a id="ux-e04-f02"></a>
#### UX-E04-F02 — Kleine aussagekräftige Standard-Gegenprobe

**Auftrag.** Aus bestätigtem Bedarf werden Normalfall, relevante Ausnahme und Kontroll-/Scopefrage gewählt. Der Auswahlgrund bleibt sichtbar. Ziel ist der kleinste angemessene Prüfumfang, nicht eine universelle Pflichtliste.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: M.
**Abhängigkeiten.** UX-E04-F02:R2 ← UX-E04-F01:R2, UX-E03-F02:R2.
**Herkunft.** E05-F02, E05-F04, E07-F04.

**Vertrag.** Die Gegenprobe richtet sich nicht gegen den Standard: Standard kann erfüllen; Business kann geänderten Ablauf akzeptieren; ein begründeter Gap kann bleiben; die Lage kann ungeklärt bleiben. Ein Fit-to-Standard-Workshop-Kit (Agenda, Objektkarten, Fragen) ist Export dieses Features ab 3.0, kein Pflichtprozess.

**UX-E04-F02-US01** — Als zeitknapper Workshopteilnehmer möchte ich die entscheidende Ausnahme statt sämtliche Altcodezweige prüfen, um einen möglichen Fehl-Fit früh aufzudecken.
- Erfolgsfall: Der Prüfauftrag benennt Eingangsbedingungen, erwartetes Geschäftsergebnis und warum dieses Szenario entscheidend ist.
- Negativfall: Ein bestandenes Normalszenario schließt eine ungeprüfte Pflichtausnahme nicht automatisch mit ab.

**UX-E04-F02-US02** — Als Prozesseigner möchte ich einen sachlich begründeten kleinen Prüfumfang akzeptieren, um keine künstliche Bürokratie für einen risikoarmen Fall zu erzeugen.
- Erfolgsfall: Die Auslassung nicht relevanter Szenarien ist begründet und an den bestätigten Scope gebunden.
- Negativfall: Eine zeitliche Deadline allein ist kein Beleg dafür, dass ein entscheidendes Szenario entfallen darf.

**Abnahmekataloge.** QA24-A06.
**Änderung gegenüber 2.4.** Workshop-Kit als späterer Export benannt.

<a id="ux-e04-f03"></a>
#### UX-E04-F03 — Belegablage mit Quellenauftrag und begrenzter Wiederverwendung

**Auftrag.** Für den ersten unterstützten Prozess werden wenige Quellen sauber kuratiert. Referenz, Beobachtung und Nachweisinhalt bleiben getrennt; eingeschränkter Zugriff führt zu einem überprüfbaren Quellenauftrag.

**Lieferumfang nach Gate.** R2 (v2.12): Persistente Referenz und Ergebnisaufnahme für jede entscheidungsrelevante Gegenprobe. 3.0 (v3.0): Validierung, geeignete Archivierung und kontrollierte Übernahme von Evidenz.
**Priorität/Größe.** P1 · R2: M · 3.0: M.
**Abhängigkeiten.** UX-E04-F03:R2 ← UX-E04-F01:R2, UX-E04-F02:R2 · UX-E04-F03:3.0 ← UX-E04-F01:R2, UX-E04-F02:R2, UX-E04-F03:R2.
**Herkunft.** E02-F03, E05-F02, E16-F04.

**Vertrag.** R2 erhält einen einfachen persistenten Demo-/Evidenzbeleg mit Herkunft; 3.0 ergänzt starke technische Ausführungsbindung. Geplant, demonstriert und tatsächlich ausgeführt bleiben verschieden (QA24-11). Kataloginhalte werden nur referenziert (IDs, Links), nie kopiert.

**UX-E04-F03-US01** — Als funktionaler Experte möchte ich einen Demo- oder Dokumentationsnachweis an die konkrete Gegenprobe hängen, um die gleiche Behauptung nicht in mehreren Dokumenten neu begründen zu müssen.
- Erfolgsfall: Der Beleg nennt Quelle, Zugriffskontext, Datum und begrenzte Aussage; die Anforderung verlinkt darauf.
- Negativfall: Ein nicht lesbarer Link wird nicht allein wegen seines Titels als bestätigender Nachweis gewertet.

**UX-E04-F03-US02** — Als Reviewer möchte ich eine bereits geprüfte Referenz nur unter ihren Voraussetzungen verwenden, um unnötige Recherche zu sparen, ohne Freigaben zu erben.
- Erfolgsfall: Der Wiederverwendungshinweis zeigt die passenden und abweichenden Voraussetzungen.
- Negativfall: Kundenspezifische Abnahme oder vertraulicher Inhalt eines anderen Falls wird nicht ungeprüft übertragen.

**Abnahmekataloge.** QA24-A11.
**Änderung gegenüber 2.4.** Lizenzregel für Kataloginhalte ergänzt.

<a id="ux-e05"></a>
### UX-E05 — Gezielte Beteiligung und verantwortete Entscheidung

<a id="ux-e05-f01"></a>
#### UX-E05-F01 — Schlanke Threads an Code und Artefakten mit nachvollziehbarem Abschluss

**Auftrag.** Anfragen und Einwände hängen an Anforderung, Aktivität, Coverage-Aussage, Kostenannahme oder Option. Business, IT und Controlling können initiieren, antworten und delegieren. Ein gemeinsamer Fokuslink bewahrt den Anker; ein Moderator ändert nicht ungefragt fremde Perspektiven. Echtzeit-Co-Editing ist keine Voraussetzung.

**Lieferumfang nach Gate.** R1 (v2.11): Basisthreads, Direktanker, sichere Erwähnung und expliziter Abschluss. R2 (v2.12): Gezielte fachliche Anfrage, Vorschlagsübernahme und verknüpfte Gegenprobe.
**Priorität/Größe.** P1 · R1: M · R2: M.
**Abhängigkeiten.** UX-E05-F01:R1 ← UX-E02-F01:R1, UX-E11-F03:R1 · UX-E05-F01:R2 ← UX-E05-F01:R1, UX-E03-F03:R2, UX-E04-F02:R2.
**Herkunft.** E05-F03, SR-F08, SR-F13.

**Vertrag.** R1 liefert Thread, Antwort, Erwähnung, Erledigen/Wiederöffnen und bearbeitbare Beiträge mit Historie am Originalanker. Threadabschluss ist keine Bedarfsbestätigung, Freigabe oder Prüfung. Erwähnungen erteilen keine Rechte. Keine Channels, Direktnachrichten, Aufgabenboards, Abstimmungsfreigaben oder unkontrollierten Anhänge. Kommentarübernahme in Anforderungen geschieht ausdrücklich und revisionsgebunden. Kommentare sind Daten, keine Befehle an Agenten.

**UX-E05-F01-US01** — Als Prozesseigner möchte ich eine vermutete Standardlücke am konkreten Szenario diskutieren, um eine nachvollziehbare Prüfung statt eines allgemeinen Chatverlaufs zu erhalten.
- Erfolgsfall: Die Frage hat Anker, Revision, Zuständigkeit und benötigten Nachweis; der Faden bleibt beim Perspektivwechsel identisch.
- Negativfall: Kommentar, Schweigen oder abgelaufene Frist werden nicht als Bedarfsgenehmigung oder bestätigter Fit behandelt.

**UX-E05-F01-US02** — Als falsch adressierter Experte möchte ich eine Anfrage begründet weitergeben, um die Klärung ohne Informationsverlust an die passende Rolle zu bringen.
- Erfolgsfall: Delegation bewahrt Historie und offenen Status; vorgeschlagene Empfänger werden auf Zugriff geprüft.
- Negativfall: Ein vorgeschlagener Name erhält keine zusätzlichen Rechte, und ein Moderator kann fremde Einwände nicht ohne dokumentierte Auflösung als erledigt schließen.

**Abnahmekataloge.** W22-A18; C23-A19–A25.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e05-f02"></a>
#### UX-E05-F02 — Gemeinsame Optionsentscheidung mit früher TCO-Simulation

**Auftrag.** Entscheiden zeigt konsistente Optionspakete aus bestätigtem Bedarf, akzeptierter Prozessänderung, Bestandsstrategie und technischer Variante: befristet erhalten, anpassen/migrieren, Standard mit Prozessänderung, Standard plus begrenzte Erweiterung, Side-by-Side, Teilstilllegung — nur im passenden Scope verglichen. TCO kommt aus UX-E13 und ist vor Zielcode zugänglich.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: L.
**Abhängigkeiten.** UX-E05-F02:R2 ← UX-E04-F01:R2, UX-E03-F02:R2, UX-E13-F01:R1.
**Herkunft.** E05-F01, E12-F02, SR-F11, SR-F12.

**Vertrag.** Jede Option nennt mindestens einen Beleg (CoverageAssertion, Coverage-Matrix, Nutzung); Optionen ohne Beleg erscheinen als „ungeprüft", nicht als „günstig". Der Optionen-Generator kennt Standard, Key-User, ABAP Cloud (RAP), Side-by-Side (CAP), Retire und befristete Übergangsoptionen (Level B/C mit Frist).

**UX-E05-F02-US01** — Als Prozesseigner möchte ich fachliche Folgen, Standardnachweis und wirtschaftliche Konsequenzen gemeinsam vergleichen, um nicht nach einer technischen Vorentscheidung nur noch zustimmen zu können.
- Erfolgsfall: Alle plausiblen Optionen verwenden denselben Bedarfsumfang und nennen offene Nachweise sowie Prozessänderungen; weitere Optionen bleiben erreichbar.
- Negativfall: Eine günstige, aber fachlich ungeprüfte Option wird weder automatisch gewählt noch als vollständig geeignet dargestellt.

**UX-E05-F02-US02** — Als Architekt möchte ich Prozessentscheidung und Zielarchitekturmuster getrennt modellieren, um nicht Erhalt, Migration und CAP fälschlich als gleichartige Alternativen zu behandeln.
- Erfolgsfall: Ein erhaltener Bedarf kann durch Standard erfüllt und zugehöriger Altcode stillgelegt werden; Hybridfälle bilden nachvollziehbare Teilentscheidungen.
- Negativfall: Ein bereits generierter CAP-Entwurf erzwingt weder das Optionsranking noch den Architekturvertrag.

**Abnahmekataloge.** W22-A10/A12; QA24-A08.
**Änderung gegenüber 2.4.** Optionsarten und Belegpflicht je Option ergänzt.

<a id="ux-e05-f03"></a>
#### UX-E05-F03 — Mandatierte gemeinsame Entscheidung mit Kosten- und Belegrevision

**Auftrag.** Die Entscheidung bindet Bedarf, Scope, Zielkontext, Option und Economics-Szenario. Fachliche Zustimmung, Architekturtragfähigkeit, Kostenprüfung und Gesamtentscheidung sind getrennte Mandate. **2.7:** Ein Mandat ist die virtuelle Rolle, die das eingeloggte Mitglied beim Beschluss spielt („Playing as: Prozesseigner"), signiert und protokolliert; spielt dasselbe Mitglied mehrere Rollen, trägt die Entscheidung `self_play: true`. Jede Signatur sagt: *Rollenspiel — kein organisatorisches Mandat.* Es gibt keine Organisations-Policy und keine Rollenprüfung; das echte Mandat entsteht im Unternehmen, nachdem die Unterlage dort angekommen ist. Bedingungen und Wiedervorlage bleiben sichtbar.

**Lieferumfang nach Gate.** **R2 (v2.12, neu):** Decision Request mit verifizierter Identität — der Eigner erhält einen Link, sieht Kurzbrief, fünf Fragen, Optionen und Empfehlung, antwortet nach Anmeldung als Community-Mitglied (E-Mail verifiziert); die Antwort wird als Anforderungs-/Optionsrevision übernommen, **ohne** Mandatswirkung. 3.0 (v3.0): Mandatierte gemeinsame Entscheidung mit Kosten- und Belegrevision.
**Priorität/Größe.** P1 · R2: M · 3.0: L.
**Abhängigkeiten.** UX-E05-F03:R2 ← UX-E05-F02:R2, UX-E11-F03:R1 · UX-E05-F03:3.0 ← UX-E05-F01:R2, UX-E05-F02:R2, UX-E11-F03:3.0, UX-E13-F02:R2.
**Herkunft.** E05-F03, E13-F01, SR-F13; Decision Request aus der Business-Bridge-Roadmap (F5.3).

**Vertrag.** Mandat und Identität werden getrennt von Kommentier-/Bearbeitungsrechten geprüft. Ein Link navigiert; eine Identität authentifiziert; ein Mandat attestiert — drei Dinge. Ein frei eingetippter Name hat keine Freigabewirkung. Die Entscheidung referenziert relevante Diskussionsversionen, Gegenpositionen und Kosten-/Belegstand. Mutation und Auditereignis werden gemeinsam dauerhaft erfasst; ein wiederholter Request erzeugt keine doppelte Entscheidung. Bestätigungen laufen ausschließlich über servervalidierte Commands; Clientfelder sind Entwürfe (QA24-12).

**UX-E05-F03-US01** — Als befugter Entscheider möchte ich eine Auswahl auf einer konkreten fachlichen und wirtschaftlichen Grundlage beschließen, um die Gründe später rekonstruieren zu können.
- Erfolgsfall: Der Snapshot hält exakte Revisionen, Alternativen, Begründung, notwendige Mandate und offene Bedingungen fest.
- Negativfall: Ein geänderter TCO-Entwurf, neuer Modelltext oder Sichtwechsel überschreibt den freigegebenen Stand nicht.

**UX-E05-F03-US02** — Als Programmleiter möchte ich eine noch offene Frage bewusst zur Prüfung oder Entscheidung weitergeben, um Explore ohne falschen Abschluss voranzubringen.
- Erfolgsfall: Prüfauftrag oder bedingte Entscheidung enthält Verantwortlichen, Umfang, Frist und Folge; die offene Pflicht bleibt sichtbar.
- Negativfall: Ein Klick ohne Mandat erzeugt keine Risikoakzeptanz, und Mehrheitsreaktionen ersetzen keine fachliche oder technische Freigabe.

**Abnahmekataloge.** C23-A21/A26/A27/A28/A29; QA24-A12; V25-A03.
**Änderung gegenüber 2.4.** Neuer R2-Teilschnitt „Decision Request" als Antwortweg ohne Mandat; Identitätsregel präzisiert (Mitgliedskonto statt Name). 2.6/2.7: Mandat als virtuelle Rolle des eingeloggten Mitglieds mit Self-Play-Kennzeichen.

<a id="ux-e06"></a>
### UX-E06 — Sieben Fähigkeiten, ein integrierter Arbeitsraum

<a id="ux-e06-f01"></a>
#### UX-E06-F01 — Integration und routenspezifische Anwendbarkeit aller sieben Fähigkeiten

**Auftrag.** Der Server bestimmt aus der gültigen Entscheidung, welche Leistungen erforderlich sind. Nicht anwendbar, offen, Entwurf, veraltet und nachgewiesen sind unterschiedliche Zustände. Eine UI-Checkbox ersetzt keine Serverprüfung.

**Lieferumfang nach Gate.** R0 (v2.10): Erhaltungsregister, unterstützter Baseline-Scope und kritische Referenzfälle; Commit/Build/Rules/Deployment fixiert (QA24-04). R1 (v2.11): Ein-/Ausgabeverträge und vorhandene kontextfähige Adapter. 3.0 (v3.0): Alle sieben Fähigkeiten im veröffentlichten Kernscope ohne parallele Wahrheiten.
**Priorität/Größe.** P1 · R0: M · R1: L · 3.0: XL.
**Abhängigkeiten.** UX-E06-F01:R0 ← G0:R0 · UX-E06-F01:R1 ← UX-E06-F01:R0, UX-E02-F01:R1, UX-E11-F03:R1 · UX-E06-F01:3.0 ← UX-E06-F01:R1, UX-E05-F03:3.0, UX-E07-F01:3.0.
**Herkunft.** E01-F03, E10-F03, SR-F18.

**Vertrag.** Das Funktionsregister führt Analyze, Design, Transformation, Documentation, Testing, TCO/Economics und Delivery mit Eingaben, Ausgaben, Rechten, Voraussetzungen, Fehlern und Abnahmen und wird zum Erhaltungsvertrag (heutiger Umfang, Grenzen, Referenzfall, neuer Zugriffspfad, Abnehmer). Direkte Aufrufe öffnen kontextfähige Module in derselben Arbeitsfläche; bestehende Funktionen werden über Adapter integriert, nicht neu implementiert. Bekannte fachliche Fehler werden kontrolliert korrigiert, nicht als Parität konserviert. Migrations- und Rollbacknachweis verlieren keine Diskussion oder historische Freigabe. Während der Migration ist sichtbar, was integriert ist und was über den alten Pfad läuft (QA24-01/03/04/07/13/16/18).

**UX-E06-F01-US01** — Als Fallverantwortlicher möchte ich eine bestätigte Stilllegung ohne neues Codeprojekt abschließen, um den wirklichen Nutzen statt eine fiktive Transformation abzubilden.
- Erfolgsfall: Die Stilllegungsroute verlangt passende Verbraucher-, Übergangs- und Übernahmeprüfungen; Generierung ist begründet nicht anwendbar.
- Negativfall: Nicht ausgeführte erforderliche Prüfungen können nicht durch Änderung eines lokalen UI-Status übersprungen werden.

**UX-E06-F01-US02** — Als Architekt möchte ich Standardkonfiguration und Eigenentwicklung unterschiedlich behandeln, um nur passende Artefakte anzufordern.
- Erfolgsfall: Die Standardroute referenziert Konfigurations- und Abnahmeverpflichtungen statt verpflichtender CAP-/RAP-Dateien.
- Negativfall: Nicht anwendbar wird nicht mit bestanden gleichgesetzt oder in den Testpass-Zähler aufgenommen.

**Abnahmekataloge.** W22-A04/A07/A08/A09/A17; C23-A01/A02/A03/A04/A31/A32; QA24-A01, A03, A04, A07, A13, A16, A18.
**Änderung gegenüber 2.4.** R0 enthält explizit die Fixierung von Commit/Build/Rules/Deployment; Migrationssichtbarkeit in den Vertrag aufgenommen.

<a id="ux-e06-f02"></a>
#### UX-E06-F02 — Living Documentation aus gemeinsamen Fall- und Entscheidungsdaten

**Auftrag.** Kurzbrief, fachliche Spezifikation, Architekturanhang und Entscheidungsbericht sind versionierte Projektionen derselben Quellen, Anforderungen und Entscheidungen. Economics ist eingebunden und wird in UX-E13 verantwortet. Dokumentation beginnt beim Verstehen, nicht erst nach Transformation.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: L.
**Abhängigkeiten.** UX-E06-F02:R2 ← UX-E03-F01:R1, UX-E01-F02:R1.
**Herkunft.** E09-F01, E09-F03, SR-F07.

**Vertrag.** Documentation ist dauerhaft im Arbeitsraum verfügbar; Brief, Prozess, BPMN, technische Spezifikation und Übergabeauszug verwenden dieselben strukturierten Fakten und Quellenbeziehungen. Neu formulierte fachliche Inhalte sind Entwürfe mit Reviewstatus, keine KI-Neuinterpretation beim View-Wechsel. Freigegebene Ausgaben sind unveränderliche Snapshots; Exporte binden sich an ein Manifest; rollenbezogene Kürzung kennzeichnet den Umfang. **Neu präzisiert:** Der historische Generatorpfad mit 1.000-Zeichen-Kontexten (`documentation/page.tsx`) wird abgelöst; bis dahin zeigt jede Ausgabe ihren Abdeckungsumfang und die nicht berücksichtigten Abschnitte (QA24-10). Keine Geldwerte außerhalb der Annahmenrevision (QA24-08).

**UX-E06-F02-US01** — Als Business-Analyst möchte ich den bestätigten Bedarf in Kurzbrief, Prozessbild und Übergabedokument identisch wiederfinden, um Übersetzungsfehler zwischen unabhängig generierten Texten zu vermeiden.
- Erfolgsfall: Alle Darstellungen referenzieren dieselben IDs und Revisionen; Annahmen und bestätigte Aussagen sind unterscheidbar.
- Negativfall: Eine längere Dokumentgenerierung erfindet keine Rollen, Zahlen oder bestätigten Regeln außerhalb der Quellenbasis.

**UX-E06-F02-US02** — Als Architekt möchte ich eine fachliche Änderung in betroffenen Entwürfen sehen, während alte Freigaben nachvollziehbar bleiben, um nicht aus einer überholten Spezifikation zu generieren.
- Erfolgsfall: Aktuelle Projektionen aktualisieren sich kontrolliert; historische Snapshots und ihr ursprünglicher Inhalt bleiben erhalten.
- Negativfall: Eine redaktionelle Perspektivänderung erzeugt keine fachliche Invalidierung; eine inhaltliche Änderung wird nicht als bloßer Textwechsel versteckt.

**Abnahmekataloge.** W22-A13/A14; C23-A06/A23/A28/A30; QA24-A08, A10.
**Änderung gegenüber 2.4.** Ablösung des Ausschnitt-Generators als konkreter Auftrag; Zwischenlösung „Abdeckung sichtbar" benannt.

<a id="ux-e06-f03"></a>
#### UX-E06-F03 — Nächster Beitrag mit erklärtem Grund

**Auftrag.** Ein regelbasierter Vorschlag verbindet offene Verpflichtung, passenden Akteur und begrenzte Aktion. Mehrere unabhängige Aufgaben dürfen parallel bestehen; eine starre Seitenreihenfolge entfällt.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: M.
**Abhängigkeiten.** UX-E06-F03:R2 ← UX-E01-F01:R1, UX-E03-F01:R1.
**Herkunft.** E01-F01, E01-F03, SR-E09.

**Vertrag.** Der Vorschlag ist deterministisch aus offenen Verpflichtungen abgeleitet; ein LLM darf ihn erläutern, nicht erzeugen. Parallelität erlaubt weder endgültige Generierungsfreigabe auf überholter Entscheidung noch stilles Schließen fremder Aufgaben.

**UX-E06-F03-US01** — Als Fachanwender möchte ich verstehen, warum meine Antwort jetzt gebraucht wird und was danach geschieht, um einen sinnvollen Beitrag statt eine formale Pflicht zu erledigen.
- Erfolgsfall: Die Aufgabenkarte verlinkt auf die abhängige Entscheidung und beschreibt den nächsten erwarteten Schritt.
- Negativfall: Ein generischer Weiter-Button erzeugt keinen Statuswechsel, solange die zugrundeliegende Verpflichtung offen ist.

**UX-E06-F03-US02** — Als Architekt möchte ich unabhängige Prüfungen parallel erledigen, um nicht auf eine fachlich unnötige Reihenfolge festgelegt zu sein.
- Erfolgsfall: Das System erlaubt parallele Quellenklärung und Optionsprüfung, markiert aber vorläufige Grundlagen.
- Negativfall: Parallelität erlaubt weder endgültige Generierungsfreigabe auf überholter Entscheidung noch stilles Schließen fremder Aufgaben.

**Abnahmekataloge.** W22-A04; C23-A33.
**Änderung gegenüber 2.4.** Deterministische Herkunft des Vorschlags festgeschrieben.

<a id="ux-e07"></a>
### UX-E07 — Verbindliche Architektur und verständliche Veränderung

<a id="ux-e07-f01"></a>
#### UX-E07-F01 — ArchitectureContract als gemeinsame Generierungseingabe

**Auftrag.** Zielkontext, Laufzeit, Persistenz, Schnittstellen und fachliche Verpflichtungen bilden einen typisierten, freigegebenen Vertrag. Bereits im Basisreview geforderte Korrekturen werden nicht verdoppelt, sondern für den neuen Flow präzisiert.

**Lieferumfang nach Gate.** 3.0 (v3.0).
**Priorität/Größe.** P1 · 3.0: L.
**Abhängigkeiten.** UX-E07-F01:3.0 ← UX-E05-F03:3.0.
**Herkunft.** E06-F01, SR-F05, SR-F06.

**Vertrag.** Ein ArchitectureContract mit exakten Inputrevisionen steuert Generierung und Tests; ein unterstützter Override muss im Abnahmetest den tatsächlichen Zielpfad ändern (QA24-07; heute liest `transformation/page.tsx` `extensibilityRoute`). Diskussion am alten Code, Anforderung oder Diff bleibt vom Ausführungsmandat getrennt. Experimente sind Entwurf/Sandbox; verbindliche Transformation konsumiert die gültige Vertragsrevision. Originalcode wird nie überschrieben. Geteiltes Bearbeitungsrecht gewährt keine Runner-/SAP- oder Modellbudgetrechte. **Übergangsregel bis 3.0 (Schnitt 0):** Ein architektonischer Override wird im UI als „dokumentiert, noch nicht wirksam für die Generierung" gekennzeichnet.

**UX-E07-F01-US01** — Als Architekt möchte ich eine bewusste Abweichung vom automatischen Routenvorschlag verbindlich festlegen, damit die Umsetzung meiner genehmigten Wahl folgt.
- Erfolgsfall: Ein Wechsel der genehmigten Route von CAP zu RAP führt zur entsprechenden Vertragsrevision; der Generator konsumiert exakt diese.
- Negativfall: Ein altes freies Routing-Textfeld darf die neue Architekturentscheidung nicht übersteuern.

**UX-E07-F01-US02** — Als Entwickler möchte ich für jede fachliche Verpflichtung ihre technische Umsetzungsvorgabe sehen, um wichtige Ausnahmen bei der Generierung nicht zu verlieren.
- Erfolgsfall: Das ChangeSet verweist auf Vertrags- und Anforderungsrevisionen; unzugeordnete Pflichtanforderungen blockieren die Freigabe.
- Negativfall: Unstrukturiertes oder unvollständiges Modelloutput wird nicht als erfolgreich transformiertes Zielprojekt markiert.

**Abnahmekataloge.** W22-A07; C23-A15/A24/A31; QA24-A07.
**Änderung gegenüber 2.4.** Story-Formulierung korrigiert („damit die Umsetzung"); Übergangsregel bis 3.0 ergänzt.

<a id="ux-e07-f02"></a>
#### UX-E07-F02 — Fachliches Prozessdelta und technische Schichten derselben Option

**Auftrag.** Business sieht, was bleibt, anders erfüllt wird, bewusst entfällt oder offen ist. IT sieht denselben Unterschied in Nutzerinteraktion, Geschäftslogik, Daten, Integration, Identität und Betrieb. Die drei IT-Fokusse ordnen die Inhalte anders, verändern aber weder Vertrag noch fachliche Verpflichtungen.

**Lieferumfang nach Gate.** 3.0 (v3.0).
**Priorität/Größe.** P1 · 3.0: M.
**Abhängigkeiten.** UX-E07-F02:3.0 ← UX-E07-F01:3.0, UX-E03-F02:R2, UX-E01-F03:R1.
**Herkunft.** E06-F01, E09-F01, SR-E03.

**Vertrag.** Jeder Reparaturversuch erzeugt eine neue Entwurfsrevision plus Diff; Elternrevision, beide Hashes und Reparaturgrund bleiben; das Ergebnis nennt den tatsächlich geprüften Prüfling und Test (QA24-09).

**UX-E07-F02-US01** — Als Prozesseigner möchte ich die Veränderung meines Ablaufs und meiner Kontrollen sehen, um die Folgen ohne Quellcodevergleich zu bewerten.
- Erfolgsfall: Ein Prozessdelta verknüpft jede wesentliche Änderung mit bestätigtem Bedarf und gewählter Option.
- Negativfall: Ein erfolgreicher Build kompensiert keinen fehlenden Kontrollnachweis und erklärt keine ausgelassene Regel zum genehmigten Wegfall.

**UX-E07-F02-US02** — Als Solution oder Enterprise Architect möchte ich zu demselben Prozessdelta die Schichten, Abhängigkeiten und Betriebsverpflichtungen prüfen, um eine lokal gute Lösung nicht an der Gesamtlandschaft vorbeizuplanen.
- Erfolgsfall: Ein ausgewählter Schritt führt zu Architekturvertrag, Daten-/Integrationsbezug und ChangeSet; gemeinsame Komponenten bleiben als gemeinsame Ressourcen markiert.
- Negativfall: Ein technischer Diagrammtext ohne Referenzen gilt nicht als Umsetzungsbeweis; ein unbekannter Verbraucher wird nicht als nicht vorhanden behandelt.

**Abnahmekataloge.** QA24-A09.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e07-f03"></a>
#### UX-E07-F03 — Gezielte Invalidierung und vergleichbarer Wiederprüfungsauftrag

**Auftrag.** Der Grundschutz gegen veraltete Freigaben bleibt vor 3.0 Pflicht. 3.3 verfeinert die Erkennung betroffener Ketten und reduziert unnötige Vollreviews. Fachlich relevante und rein redaktionelle Änderungen werden kontrolliert unterschieden.

**Lieferumfang nach Gate.** R0 (v2.10): Vertrag für exakte Inputbindung und konservative Ungültigkeit. R1 (v2.11): Schutz geteilter Änderungen und verzögert eintreffender Aufträge. 3.0 (v3.0): Bindung von Freigabe, Auto-Healing, Prüfling und Testrevision. 3.3 (v3.3): Feingranulare fachliche Auswirkungsanalyse.
**Priorität/Größe.** P1 · R0: S · R1: M · 3.0: M · 3.3: L.
**Abhängigkeiten.** UX-E07-F03:R0 ← UX-E02-F01:R0 · UX-E07-F03:R1 ← UX-E07-F03:R0, UX-E02-F01:R1, UX-E11-F03:R1 · UX-E07-F03:3.0 ← UX-E07-F03:R1, UX-E07-F01:3.0, UX-E08-F02:3.0 · UX-E07-F03:3.3 ← UX-E07-F03:3.0.
**Herkunft.** E01-F02, E15-F01, SR-F17.

**Vertrag.** Input-/Outputmanifest statt Frischeheuristik; Autorisierung bei Auftrag, vor externer Datenabgabe und vor Veröffentlichung; alte Ergebnisse bleiben an ihre Eingaben gebunden — blockieren/quarantänisieren statt still aktualisieren (QA24-13; heute Digest-Vergleich in `workflow-steps.ts`). Kommentare behalten ihren Anker nach Quellenänderung; mehrdeutige Anker bleiben offen. Wiederprüfungsbedarf ist eine eigene Verpflichtung. **G0-Regel:** Auto-Healing ist im geteilten Kontext deaktiviert, bis der 3.0-Teilschnitt Revisionen erzeugt.

**UX-E07-F03-US01** — Als Architekt möchte ich nach einer Anforderungsänderung gezielt betroffene Verträge und Nachweise sehen, um keinen kompletten Fall ohne Anlass neu prüfen zu müssen.
- Erfolgsfall: Die geänderte Pflichtregel erzeugt eine nachvollziehbare Liste betroffener Genehmigungen, Szenarien und Ausführungsbelege.
- Negativfall: Eine Änderung an Scope oder erwarteter Wirkung wird nicht allein wegen ähnlicher Formulierung als bedeutungslos abgetan.

**UX-E07-F03-US02** — Als Business-Reviewer möchte ich nur meinen tatsächlich betroffenen Beitrag erneut bestätigen, um Aufmerksamkeit für relevante Änderungen zu behalten.
- Erfolgsfall: Die Anfrage zeigt vorherige und neue Aussage sowie den Grund der Wiederprüfung.
- Negativfall: Ein globales erneutes Bestätigen darf keine geänderten Aussagen ohne sichtbaren Vergleich mit freigeben.

**Abnahmekataloge.** W22-A06/A14/A16; C23-A11/A12/A23/A28; QA24-A09, A13.
**Änderung gegenüber 2.4.** G0-Regel zur Deaktivierung des Auto-Healings im Teamraum ergänzt.

<a id="ux-e08"></a>
### UX-E08 — Szenarien und ehrliche Ausführungsnachweise

<a id="ux-e08-f01"></a>
#### UX-E08-F01 — Szenario aus bestätigtem Zielbedarf statt reinem Altcode

**Auftrag.** Akzeptanzszenarien stammen aus Bedarf, relevanter Ausnahme und genehmigter Prozessänderung. Technische Unit-Tests ergänzen sie; sie ersetzen keine unabhängige Erwartung an das Geschäftsergebnis.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: M.
**Abhängigkeiten.** UX-E08-F01:R2 ← UX-E03-F02:R2, UX-E04-F02:R2.
**Herkunft.** E07-F04, SR-F07.

**Vertrag.** Szenarien tragen Bedingungen, Aktion, Ergebnis und gültige Anforderungsrevision. Ein nur aus generiertem Code abgeleiteter Test ist kein unabhängiger fachlicher Erfüllungsbeleg. Regel → Szenario → Test wird als Abdeckungsquote ausgewiesen („Regeln mit Testfall").

**UX-E08-F01-US01** — Als fachlicher Tester möchte ich das erwartete Ergebnis aus der genehmigten Anforderung erhalten, um nicht versehentlich ein altes Fehlverhalten konservieren zu müssen.
- Erfolgsfall: Das Szenario nennt Bedingungen, Aktion, Ergebnis und gültige Anforderungsrevision; eine geänderte Erwartung ist begründet.
- Negativfall: Ein nur aus demselben generierten Code abgeleiteter Test gilt nicht als unabhängiger fachlicher Erfüllungsbeleg.

**UX-E08-F01-US02** — Als Prozesseigner möchte ich ein relevantes Abnahmeszenario schon in Explore verständlich sehen, um zu prüfen, ob der eigentliche Bedarf richtig erfasst wurde.
- Erfolgsfall: Normalfall und entscheidende Ausnahme lassen sich ohne technische Laufzeitdetails bestätigen.
- Negativfall: Ein bestätigter Szenarioentwurf wird nicht als tatsächlich durchgeführter Test angezeigt.

**Abnahmekataloge.** W22-A15.
**Änderung gegenüber 2.4.** Abdeckungsquote Regel→Test als Kennzahl ergänzt.

<a id="ux-e08-f02"></a>
#### UX-E08-F02 — Persistentes Test-/Demo-Receipt mit begrenztem Aussageumfang

**Auftrag.** Importierte oder tatsächlich erzeugte Nachweise enthalten Version, Umgebung, Zeitpunkt, Ausführung, Ergebnis und Abhängigkeiten. Manuelle Beobachtung, Mock-Lauf, Connectivity und Kundenabnahme bleiben getrennte Arten.

**Lieferumfang nach Gate.** R2 (v2.12): Dauerhafter Demo-/Prüfbeleg mit Scope, Quelle, Zustand und Einschränkung. 3.0 (v3.0): Ausführungsreceipt mit Code-/Testsuite-/Umgebungsbindung und Reparaturhistorie.
**Priorität/Größe.** P1 · R2: M · 3.0: L.
**Abhängigkeiten.** UX-E08-F02:R2 ← UX-E08-F01:R2, UX-E04-F03:R2, UX-E11-F03:R1 · UX-E08-F02:3.0 ← UX-E08-F02:R2, UX-E07-F01:3.0.
**Herkunft.** E07-F01, E07-F02, E07-F03, SR-F09, SR-F10.

**Vertrag.** Der Server speichert Receipts unveränderlich (heute: lokaler Hook-Zustand, QA24-11). Reparaturen erzeugen neue Revisionen mit Diff und Hashes (QA24-09). Fehlend, geplant, simuliert, nur Connectivity, übersprungen, fehlgeschlagen und bestanden bleiben verschieden. Der Verifikationsmechanismus wird benannt (abaplint/open-abap-Transpiler, BYOT-Sandbox, importierter Beleg) — „compiled and tested" ohne Mechanismus ist unzulässig (Audit F-16).

**UX-E08-F02-US01** — Als QA-Verantwortlicher möchte ich einen ausgeführten Test dauerhaft an Szenario und Umsetzungsversion binden, um seinen Nachweis in Delivery wiederzuverwenden.
- Erfolgsfall: Der Server speichert ein unveränderliches Receipt mit Ergebnis, Umfang und Referenzen; nach Neuladen bleibt es vorhanden.
- Negativfall: Prozess-Exitcode, Verbindungscheck oder lokal nicht gespeichertes UI-Ergebnis allein erzeugt kein fachlich bestandenes Receipt.

**UX-E08-F02-US02** — Als Architekt möchte ich die Begrenzung eines Nachweises sofort erkennen, um einen Mock-Lauf nicht mit realer SAP-Integration zu verwechseln.
- Erfolgsfall: Umgebung und ersetzte Abhängigkeiten sind am Ergebnis sichtbar; die passende Evidenzstufe folgt dem dokumentierten Umfang.
- Negativfall: Ein importiertes grünes Testlog ohne belastbare Zuordnung wird nicht als Abnahme der aktuellen Revision ausgegeben.

**Abnahmekataloge.** W22-A15/A16; C23-A32; QA24-A09, A11.
**Änderung gegenüber 2.4.** Mechanismus-Nennung als Pflicht ergänzt.

<a id="ux-e08-f03"></a>
#### UX-E08-F03 — Explore-Reife, Umsetzungsabnahme und Betrieb separat

**Auftrag.** Eine Entscheidung darf ihren Explore-Zweck erfüllen, ohne bereits in Produktion getestet zu sein. Spätere Abschlussarten haben eigene, routenspezifische Nachweisanforderungen.

**Lieferumfang nach Gate.** 3.0 (v3.0).
**Priorität/Größe.** P1 · 3.0: M.
**Abhängigkeiten.** UX-E08-F03:3.0 ← UX-E06-F01:R1, UX-E08-F02:3.0.
**Herkunft.** E10-F03, E10-F04, SR-F14, SR-F18.

**Vertrag.** Standardkonfiguration, Eigenentwicklung und Stilllegung haben explizite Abschlussregeln; ausgelassene Pflichtprüfungen oder veraltete Receipts erzeugen keine Übergabefreigabe.

**UX-E08-F03-US01** — Als Programmleiter möchte ich einen begründet entschiedenen Explore-Fall von noch offener Umsetzung unterscheiden, um Fortschritt ehrlich zu berichten.
- Erfolgsfall: Der Fall zeigt getrennt Entscheidungsergebnis, erfüllte Bedingungen und noch ausstehende Abnahmeverpflichtungen.
- Negativfall: Explore-Abschluss setzt weder Implementierung noch Betriebsübernahme automatisch auf abgeschlossen.

**UX-E08-F03-US02** — Als Qualitätsverantwortlicher möchte ich für die Übernahme genau den zur Route passenden Nachweis prüfen, um unnötige Codepflichten und unberechtigte grüne Häkchen zu vermeiden.
- Erfolgsfall: Standardkonfiguration, Eigenentwicklung und Stilllegung haben explizite, nachvollziehbare Abschlussregeln.
- Negativfall: Ausgelassene Pflichtprüfungen oder veraltete Receipts können keine passende Übergabefreigabe erzeugen.

**Abnahmekataloge.** W22-A08/A09/A17.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e09"></a>
### UX-E09 — Passende Übergabe und kontrollierte SAP-Anbindung

<a id="ux-e09-f01"></a>
#### UX-E09-F01 — Quellengebundene Übergabe, Evidence Pack und historischer Belegzugang

**Auftrag.** Ein Paket enthält Fallzweck, Scope, bestätigten Bedarf, Entscheidung, Bedingungen, passende Backlog-/Konfigurationsaufträge und Nachweisreferenzen. Dateiformate sind nachgelagerte Ausgabeoptionen.

**Lieferumfang nach Gate.** 3.0 (v3.0).
**Priorität/Größe.** P1 · 3.0: L.
**Abhängigkeiten.** UX-E09-F01:3.0 ← UX-E05-F03:3.0, UX-E06-F02:R2, UX-E08-F03:3.0.
**Herkunft.** E10-F01, E10-F03, SR-F14.

**Vertrag.** Die Übergabe bewahrt Originale, Signaturstatus und Revisionsmanifest. Historische HMAC-only- und Ed25519-Pakete behalten ihren Status und werden nicht neu signiert. Beleglinks zeigen nach Berechtigungsprüfung den historischen Stand. Ein beschränkter Export ist ein gekennzeichneter Auszug. Signatur, Quelle, Mandat, aktuelle Abhängigkeiten und Prüfdeckung werden getrennt gezeigt; ein Fingerprint ist kein Assurance-Label (QA24-17). Vier Datenklassen und Verantwortlichkeit sind dokumentiert (QA24-14).

**UX-E09-F01-US01** — Als Umsetzungsverantwortlicher möchte ich einen klaren Auftrag mit offenen Bedingungen und fachlichem Akzeptanzkriterium erhalten, um keinen neuen Interpretationsworkshop beginnen zu müssen.
- Erfolgsfall: Die Übergabe benennt Empfänger, gültige Revision, Pflichten, Nicht-Ziele und fehlende Nachweise.
- Negativfall: Ein ZIP-Download oder Versand erzeugt keine bestätigte Übernahme.

**UX-E09-F01-US02** — Als Business-Owner möchte ich im gleichen Paket erkennen, welche Prozessänderung vereinbart wurde, um die Umsetzung fachlich verfolgen zu können.
- Erfolgsfall: Eine kurze Business-Ansicht und technische Detailansicht verweisen auf dieselben Fall- und Anforderungs-IDs.
- Negativfall: Ein rollenbezogen gekürzter Export verschweigt keine für den Empfänger relevante Pflichtbedingung.

**Abnahmekataloge.** W22-A17; C23-A02/A28/A29/A30; QA24-A14, A17.
**Änderung gegenüber 2.4.** Keine inhaltliche; Offline-Verifikation des Pakets in UX-E14-F03 ausgelagert.

<a id="ux-e09-f02"></a>
#### UX-E09-F02 — Begrenzter Export mit stabilen IDs (ALM-Adapter zurückgezogen)

**Auftrag.** Versionierter Export und manuell bestätigte externe Referenz mit stabilen IDs. **Zurückgezogen (2.6):** der kontrollierte Kundenstack-Adapter (3.2). Integration in Jira, Cloud ALM oder LeanIX liegt beim Unternehmen — über das Open Evidence Format (UX-E16-F02) und MCP (UX-E16-F03).

**Lieferumfang nach Gate.** 3.0 (v3.0): Begrenzter Export und manuelle externe Referenz mit stabilen IDs.
**Priorität/Größe.** P2 · 3.0: S.
**Abhängigkeiten.** UX-E09-F02:3.0 ← UX-E09-F01:3.0, UX-E11-F03:3.0.
**Herkunft.** E14-F03, SR-F19.

**Vertrag.** Teams bleibt Gesprächsraum, Jira/ALM das im Kundenprozess bestimmte führende Aufgabensystem. Clean-Core.io hält den Code-, Artefakt- und Entscheidungszusammenhang und referenziert extern nur mit stabilen IDs. Kein Kopieren ganzer Threads, kein Synchronisationsversprechen, kein Adapterbetrieb.

**UX-E09-F02-US01** — Als umsetzungsverantwortliches Mitglied möchte ich Anforderungen und Entscheidungen mit Fall- und Herkunftsreferenzen exportieren, um sie in unserem eigenen Aufgabensystem weiterzuführen.
- Erfolgsfall: Der Export nennt Manifest, Revision und stabile IDs; eine manuell gepflegte externe Referenz führt zurück zum Fallstand.
- Negativfall: Ein Export erzeugt keine Übernahme und keinen Statuswechsel im Fall.

~~UX-E09-F02-US02~~ — zurückgezogen (Adapter-Wiederholung und Konfliktbehandlung); ersetzt durch den lesenden MCP-Zugang in UX-E16-F03.

**Abnahmekataloge.** C23-A36.
**Änderung gegenüber 2.5.** Adapter-Teilschnitt 3.2 und Story US02 zurückgezogen; Corporates integrieren auf ihrer Seite.

<a id="ux-e09-f03"></a>
#### UX-E09-F03 — Abnahme und Betriebsübernahme mit Reopen-Pfad

**Auftrag.** Der Betriebsabschluss ergänzt die technische Übergabe um tatsächliche Übernahme, definierte Beobachtung und Verantwortlichkeit. Für Stilllegung zählen sichere Abschaltung und betroffene Verbraucher, nicht ein Deploymentbeleg.

**Lieferumfang nach Gate.** 3.0 (v3.0): Getrennte einfache Übernahmebestätigung zum Übergabemanifest. 3.5 (v3.5): Beobachtete Wirkung, Betriebsübergang und kontrollierte Wiedereröffnung.
**Priorität/Größe.** P2 · 3.0: S · 3.5: M.
**Abhängigkeiten.** UX-E09-F03:3.0 ← UX-E09-F01:3.0, UX-E08-F02:3.0 · UX-E09-F03:3.5 ← UX-E09-F03:3.0, UX-E10-F03:3.3.
**Herkunft.** E10-F04, E15-F04, SR-F20.

**Vertrag.** Historische Lesbarkeit und Antworten nach Explore gehören zum Kern und kommen nicht erst mit der Wirkungsmessung. Ein neuer Kommentar eröffnet keine Vergangenheit neu; eine echte Scope-/Bedarfsänderung erzeugt einen neuen Prüfauftrag; bei Retentionende werden verlorene Nachweise benannt.

**UX-E09-F03-US01** — Als Betriebsverantwortlicher möchte ich einen definierten Stand samt Restrisiken bewusst übernehmen, um zu wissen, wofür mein Team künftig verantwortlich ist.
- Erfolgsfall: Die Übernahme referenziert Umsetzung beziehungsweise Stilllegung, relevante Prüfungen, Betriebsaufgaben und dokumentierte Restrisiken.
- Negativfall: Eine frühere Explore-Zustimmung oder ein Dateiversand genügt nicht als Betriebsübernahme.

**UX-E09-F03-US02** — Als Prozesseigner möchte ich einen Fall bei verfehltem Geschäftsergebnis wieder öffnen, um Betriebserfahrung in die ursprüngliche Entscheidung zurückzuführen.
- Erfolgsfall: Die Wiedereröffnung enthält Anlass, betroffene Anforderung und zuständige Stelle; die historische Entscheidung bleibt erhalten.
- Negativfall: Ein neues Problem überschreibt weder damalige Nachweise noch lässt es den Fall ohne sichtbare Verantwortung verschwinden.

**Abnahmekataloge.** C23-A28/A33/A34; QA24-A11.
**Änderung gegenüber 2.4.** Story-Formulierung korrigiert („um zu wissen").

<a id="ux-e10"></a>
### UX-E10 — Programmsteuerung, Änderung und vorsichtige Wiederverwendung

<a id="ux-e10-f01"></a>
#### UX-E10-F01 — Programmsteuerung (zurückgezogen 2.6)

**Status.** Zurückgezogen. Die Management-Perspektive ist ein anderer Blick auf **denselben Fall** (UX-E01-F02, R1) — Entscheidung, Optionen, Kostenstand, Bedingungen, Beteiligte, nächste Beiträge. Eine Aggregation über viele Fälle, Programm-KPIs, Wellen und Steering-Decks sind nicht Teil eines privaten Community-Projekts. Wer Portfolio-Sichten braucht, baut sie im eigenen Werkzeug aus den MCP-/Export-Daten mehrerer Fälle.

**Lieferumfang nach Gate.** — (kein Teilschnitt).
**Herkunft.** E13-F02, E13-F03, E12-F03 (historisch).

~~UX-E10-F01-US01~~ — zurückgezogen (Programmleiter, offene Entscheidungen nach Ursache über viele Fälle).
~~UX-E10-F01-US02~~ — zurückgezogen (Steering, Fortschritt vs. Restrisiko über viele Fälle).

**Änderung gegenüber 2.5.** Feature und Teilschnitt `UX-E10-F01:3.1` gestrichen; `UX-E12-F03:3.5` hängt jetzt an `UX-E09-F03:3.5` allein.

<a id="ux-e10-f02"></a>
#### UX-E10-F02 — Community-Musterbibliothek: bedingte Wiederverwendung geprüfter Fallmuster

**Auftrag.** Wiederverwendbar sind Anforderungs-/Szenariomuster, Quellen und Voraussetzungen, nicht die ungeprüfte Kundenfreigabe. Vor Übernahme werden Scope, Zielkontext und verbleibende Unterschiede sichtbar verglichen.

**Lieferumfang nach Gate.** 3.4 (v3.4).
**Priorität/Größe.** P2 · 3.4: M.
**Abhängigkeiten.** UX-E10-F02:3.4 ← UX-E04-F03:3.0, UX-E07-F03:3.3.
**Herkunft.** E13-F04, E16-F04.

**Vertrag.** Muster werden öffentlich in der Community-Bibliothek geteilt (CC-BY-4.0), anonymisiert und nach explizitem Veröffentlichungsreview des Fallbesitzers; automatische Anonymisierung allein veröffentlicht nichts. Ein Muster trägt Voraussetzungen, Zielkontext und Regelversion; es erbt weder Bestätigungen noch Teststatus. Veröffentlichte Muster fließen in den Bench-Korpus (UX-E14-F04) nur nach diesem Review.

**UX-E10-F02-US01** — Als Architekt eines weiteren Standorts möchte ich ein geprüftes Muster mit seinen Voraussetzungen übernehmen, um bewährte Arbeit nicht neu erstellen zu müssen.
- Erfolgsfall: Die Plattform zeigt passende und abweichende Bedingungen sowie neu benötigte Bestätigungen.
- Negativfall: Eine freigegebene Lösung eines anderen Standorts erbt im neuen Fall weder Business-Zustimmung noch Teststatus.

**UX-E10-F02-US02** — Als Datenverantwortlicher möchte ich zulässige Muster ohne vertrauliche Unternehmensdetails teilen, um Lernen zu ermöglichen, ohne Kundendaten offenzulegen.
- Erfolgsfall: Ein expliziter Veröffentlichungsreview prüft Inhalte, Quellenrechte und Kontextdaten vor Freigabe.
- Negativfall: Automatische Anonymisierung allein veröffentlicht kein Muster und überträgt keine personenbezogenen Nutzungsdaten.

**Abnahmekataloge.** C23-A30.
**Änderung gegenüber 2.4.** Verbindung zum Bench-Korpus ergänzt. 2.6: als öffentliche Community-Bibliothek statt Standort-Rollout.

<a id="ux-e10-f03"></a>
#### UX-E10-F03 — Änderung an Zielkontext oder Beleg als gezielte Wiedervorlage

**Auftrag.** Änderungen an Zielrelease, Konfiguration, Quelle oder Geschäftsbedarf werden auf betroffene Abdeckungsbehauptungen bezogen. Nicht jede Katalogänderung braucht einen Business-Workshop; wesentliche Änderungen dürfen nicht übersehen werden.

**Lieferumfang nach Gate.** 3.3 (v3.3).
**Priorität/Größe.** P2 · 3.3: M.
**Abhängigkeiten.** UX-E10-F03:3.3 ← UX-E07-F03:3.3, UX-E04-F01:R2.
**Herkunft.** E15-F01, E15-F02, SR-F17.

**Vertrag.** Ein neuer Stand des Cloudification Repository (Changelog aus UX-E16-F03) erzeugt Prüfaufträge nur für Fälle mit Bezug; ungeklärte Auswirkung gilt nie als keine Auswirkung.

**UX-E10-F03-US01** — Als Architekt möchte ich sehen, welche bestehende Entscheidung von einer geänderten Voraussetzung betroffen ist, um erneut nur den relevanten Teil zu prüfen.
- Erfolgsfall: Eine Änderung nennt Quelle, vorherige/neue Voraussetzung und betroffene Fälle mit passenden Prüfaufträgen.
- Negativfall: Ein neuer SAP-Katalogstand invalidiert nicht pauschal alle Business-Bestätigungen ohne Bezug.

**UX-E10-F03-US02** — Als Prozesseigner möchte ich nur bei tatsächlich geänderter Geschäftsfolge erneut eingebunden werden, um nicht durch irrelevante Technikmeldungen überlastet zu werden.
- Erfolgsfall: Eine fachlich relevante Folge führt zu einer verständlichen Differenzfrage; rein technische Klärung bleibt bei Architektur.
- Negativfall: Ungeklärte Auswirkung wird nicht automatisch als keine Auswirkung behandelt oder stillschweigend bestätigt.

**Abnahmekataloge.** W22-A14.
**Änderung gegenüber 2.4.** Katalog-Changelog als Auslöser benannt.

<a id="ux-e11"></a>
### UX-E11 — Verlässliche, zugängliche und berechtigte Mitarbeit

<a id="ux-e11-f01"></a>
#### UX-E11-F01 — Zugänglicher und reaktionsschneller Aufgaben- und Belegflow

**Auftrag.** Die neuen Kernabläufe erhalten überprüfbare Tastatur-, Screenreader-, Zoom- und Touch-Anforderungen. WCAG 2.2 AA ist Entwicklungsziel; Konformität wird nicht aus einer Komponentenbibliothek abgeleitet.

**Lieferumfang nach Gate.** R1 (v2.11): Tastatur, lesbare Kernansichten, Kontext/Fokus und Mobilbasis. 3.0 (v3.0): Accessibility-Abnahme sämtlicher angebotenen kritischen Pfade.
**Priorität/Größe.** P1 · R1: M · 3.0: M.
**Abhängigkeiten.** UX-E11-F01:R1 ← UX-E01-F02:R1 · UX-E11-F01:3.0 ← UX-E01-F02:R1, UX-E11-F01:R1.
**Herkunft.** E09-F03, E16-F01.

**Vertrag.** Tastatur, Screenreader und Touch decken den vollständigen View-/Layer-Wechsel ab; Tabs mit passendem Fokus-/Aktivierungsmodell; kein globaler Remount verliert Cursor, Auswahl oder Entwurf; Modulfehler blockieren nicht den ganzen Arbeitsraum. Messfälle getrennt: warmer lokaler View, warmer Direktlink, kalter Start, neuer Auftrag — kalte Rendererzeit zählt zum kalten Start (QA24-15). Ein Kommentar gilt erst nach dauerhafter Serverbestätigung als gespeichert.

**UX-E11-F01-US01** — Als Nutzer mit Tastatur oder Screenreader möchte ich Fragen, Antworten, Belege und Status vollständig bedienen, um gleichwertig an Entscheidungen teilnehmen zu können.
- Erfolgsfall: Fokusreihenfolge, Namen, Statusankündigungen und Rückkehr aus Belegen werden manuell im Kernflow geprüft.
- Negativfall: Keine Pflichtaktion setzt Hover oder Farberkennung voraus; keine Sticky-Leiste verdeckt den Fokus.

**UX-E11-F01-US02** — Als mobiler Prozesseigner möchte ich eine konkrete Anfrage ohne horizontale Matrixnavigation bearbeiten, um auch ohne Desktop einen verlässlichen Beitrag zu leisten.
- Erfolgsfall: Optionen und Nachweise werden linear dargestellt; Eingaben bleiben bei Orientierung und Tastaturwechsel erhalten.
- Negativfall: Der bestätigungsrelevante Scope verschwindet weder durch responsives Ausblenden noch unter einer fixierten Aktionsleiste.

**Abnahmekataloge.** W22-A21/A22/A23; C23-A10/A16/A25/A35; QA24-A15.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e11-f02"></a>
#### UX-E11-F02 — Speichern, Unterbrechen und Konflikte ohne Informationsverlust

**Auftrag.** Autosave, bestätigte Speicherung, wiederaufnehmbare Entwürfe und optimistische Nebenläufigkeitskontrolle gehören zum Business-Request. Lokale Speicherung folgt der Datenrichtlinie der Community-Edition.

**Lieferumfang nach Gate.** R1 (v2.11).
**Priorität/Größe.** P1 · R1: M.
**Abhängigkeiten.** UX-E11-F02:R1 ← UX-E02-F01:R1.
**Herkunft.** E01-F02, SR-E09.

**Vertrag.** Persönlicher UI-Zustand, eigener Entwurf und freigegebener gemeinsamer Stand sind getrennt; View-Wechsel bewahrt Entwürfe; verbindliche Aktionen prüfen den Serverstand. Privater Modus und geteilter Fall besitzen getrennt dokumentierte Speicherprofile; kein stilles Hochladen bisher lokaler Quellen; Retention, Indizes, Caches, Backups und Restore respektieren Widerruf/Löschung; Parallelität nutzt Revisionskontrolle und Idempotenz; Offline-Co-Editing ist kein Ziel. Auto-Healing erzeugt neue Revisionen (QA24-09).

**UX-E11-F02-US01** — Als unterbrochener Fachexperte möchte ich nach erneuter Anmeldung bei meiner begonnenen Antwort fortfahren, um keine Arbeit zu verlieren.
- Erfolgsfall: Erlaubte Entwürfe bleiben erhalten; nach Rückkehr werden aktuelle Revision und Server-Speicherstatus geprüft.
- Negativfall: Ein Netzfehler wird nicht als erfolgreiche Bestätigung ausgegeben; sensible Daten werden nicht unerlaubt dauerhaft lokal abgelegt.

**UX-E11-F02-US02** — Als gleichzeitig arbeitender Reviewer möchte ich einen Bearbeitungskonflikt erkennen und lösen, um keine frühere Entscheidung unwissentlich zu überschreiben.
- Erfolgsfall: Versionsabweichung erzeugt sichtbaren Vergleich und erneute Prüfung der betroffenen Aussage.
- Negativfall: Last-write-wins überschreibt keine bestätigungsrelevante Anforderung oder Freigabe ohne Konfliktbehandlung.

**Abnahmekataloge.** W22-A11/A19/A22/A24; C23-A04/A16/A17/A25/A26/A34; QA24-A09.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e11-f03"></a>
#### UX-E11-F03 — Sicheres Teilen mit Community-Mitgliedern, effektive Rechte und virtuelle Rollen

**Auftrag.** Business benötigt keinen Zugang zur gesamten technischen Analyse. Beitrag, Quelleinsicht und Freigabe werden getrennt berechtigt. Geteilt wird nur mit angemeldeten Community-Mitgliedern; Einladungen sind eng begrenzt und widerrufbar. Keine Gäste, keine Organisationskonten, kein SSO.

**Lieferumfang nach Gate.** R0 (v2.10): Autorisierungs-/Rollen-/Speicherkonzept der Community-Edition, negative Referenzfälle und **Freigabefelder nur über servervalidierte Commands** (heute clientseitig änderbar: `targetArchitecture`, `approvedByArchitect`, `architectSignOffAt`, `approvedBy` in `firestore.rules`). R1 (v2.11): Fallfreigabe an benannte Mitglieder auf beiden Datenpfaden, Rechte Lesen/Kommentieren/Bearbeiten, Widerruf und Journal. 3.0 (v3.0): Entscheidungen und Freigaben als signierte Commands mit virtueller Rolle und Self-Play-Kennzeichen; Ausführungs-/Exportbefugnisse im Kernscope.
**Priorität/Größe.** P1 · R0: M · R1: L · 3.0: M.
**Abhängigkeiten.** UX-E11-F03:R0 ← UX-E02-F01:R0 · UX-E11-F03:R1 ← UX-E11-F03:R0, UX-E02-F01:R1 · UX-E11-F03:3.0 ← UX-E11-F03:R1.
**Herkunft.** E13-F01, E08-F02, SR-F13.

**Vertrag.** Projektionen werden vor Auslieferung berechtigt; der View erteilt keine Rechte; Kurzfassungen, Suche, Cache, Deep Links und Exporte erhalten eigene oder explizit geerbte Sensitivitätsregeln. Berechtigungstests für Web-Client/Rules, Server/Admin-SDK, Exporte, Indizes, Jobs und MCP (QA24-12). Autorisierung bei Auftrag, vor externer Datenabgabe und vor Veröffentlichung (QA24-13). **Community-Modell (2.6):** Der Fall gehört dem anlegenden Mitglied; es erteilt und entzieht Rechte, exportiert und löscht. Beim Teilen wird angezeigt, ob Rohcode enthalten ist; eine Business-Freigabe ohne Rohcode ist möglich (Anker sichtbar, Quelle gesperrt). Arbeits- und Beleglink sind beide nur für berechtigte Mitglieder; Linkkopieren verändert keine Rechte; öffentliche Bearerlinks sind ausgeschlossen. Ein Mandat ist die virtuelle Rolle des Mitglieds am Beitrag, signiert mit der pseudonymen Mitglieds-ID und im Evidence Pack als *Rollenspiel — kein organisatorisches Mandat* gekennzeichnet. **Datensparsamkeit (2.7):** Konto = verifizierte E-Mail + Handle; keine Namens-, Firmen-, Positions- oder Profilrollenfelder; Mitgliederlisten zeigen Handle und Recht; Kommentare und Journal zeigen den Handle; Pack und MCP geben nur virtuelle Rolle und pseudonymen Signer-ID heraus; beim Löschen des Kontos werden Beiträge pseudonymisiert („ehemaliges Mitglied"), Fallartefakte bleiben beim Fallbesitzer. Jede Rechteänderung, Entscheidung und jeder MCP-Zugriff steht im Journal. Kein Tenant, keine Retention-Policy je Organisation, keine Delegationsketten, keine Rollenverwaltung.

**UX-E11-F03-US01** — Als Fallbesitzer möchte ich einem Community-Mitglied aus dem Fachbereich Beitragsrechte ohne Offenlegung des Quellcodes geben, um die Frage mit minimalen Rechten zu klären.
- Erfolgsfall: Der Server prüft Fall, Mitglied und erlaubte Inhalte bei jedem Zugriff; eine widerrufene Freigabe funktioniert nicht weiter; der Teilen-Dialog zeigt „Rohcode: nein".
- Negativfall: Ein geteilter Link, eine Suche, eine KI-Zusammenfassung oder ein MCP-Token erlaubt keinen Zugriff auf fremde Fallinhalte.

**UX-E11-F03-US02** — Als beteiligtes Mitglied möchte ich eine Entscheidung mit meiner Mitgliedsidentität und der gerade gespielten virtuellen Rolle abgeben, um eine nachvollziehbare, signierte Freigabe zu erzeugen — ohne mehr über mich preiszugeben als meinen Handle.
- Erfolgsfall: Die Freigabe prüft Mitgliedsidentität, gewählte virtuelle Rolle und konkrete Revision; das Pack führt virtuelle Rolle, pseudonymen Signer-ID und das Self-Play-Kennzeichen.
- Negativfall: Anonyme Eingabe, Freitextrolle oder technische Signatur allein wird nicht als Freigabe ausgegeben; eine virtuelle Rolle wird nirgends als organisatorisches Mandat dargestellt; kein Export enthält E-Mail oder Handle ohne ausdrückliche Wahl des Mitglieds.

**Abnahmekataloge.** W22-A20; C23-A07/A08/A09/A13–A18/A20/A27/A34; QA24-A12, A13, A14, A16; V25-A03.
**Änderung gegenüber 2.5.** R2-Teilschnitt (Gäste/Artefaktfreigaben nach Security-Abnahme) zurückgezogen; Organisations-Mandate durch virtuelle Rollen ersetzt; Community-Eigentumsregel und Datensparsamkeit ergänzt (2.7).

<a id="ux-e12"></a>
### UX-E12 — Nachgewiesener Nutzen statt unbewiesener Alleinstellung

<a id="ux-e12-f01"></a>
#### UX-E12-F01 — Beobachteter Mehrperspektiven-Pilot mit Performance- und Kontextabnahme

**Auftrag.** Ein gemischtes Team aus Business, Application Consulting, Solution/Enterprise Architecture und Management bearbeitet dieselben Fälle. Beobachtet werden Verständnis, Belegzugang, Kontextwechsel, Kostenannahmen und Gesamtaufwand einschließlich Vorbereitung und Nacharbeit.

**Lieferumfang nach Gate.** R1 (v2.11): Reproduzierbare Bestands-/Performance-Baseline und erster Mehrrollen-Beobachtungslauf. R2 (v2.12): Gesamter Aufwand und Fehlentscheidungen der Gegenprobe. 3.0 (v3.0): End-to-End-Teamabnahme und getrennter Produkt-/Dokument-Testbericht.
**Priorität/Größe.** P1 · R1: M · R2: M · 3.0: L.
**Abhängigkeiten.** UX-E12-F01:R1 ← UX-E01-F02:R1, UX-E03-F01:R1 · UX-E12-F01:R2 ← UX-E01-F02:R1, UX-E03-F01:R1, UX-E12-F01:R1 · UX-E12-F01:3.0 ← UX-E01-F02:R1, UX-E03-F01:R1, UX-E12-F01:R2.
**Herkunft.** E16, SR-E10.

**Vertrag.** Warme Interaktion, kalter Einstieg und neue Berechnung werden getrennt gemessen (Profile aus W-11). Die Abnahmesuite W22-A01–A24 ist verpflichtend für den unterstützten Scope; C23-A01–A36 gehören zum 3.0-Lieferumfang. Jeder Codebefund wird als statischer Abruf mit Datum geführt; vor Abnahme werden Commit/Build/Rules/Deployment fixiert (QA24-04). Keine Erfolgsaussage aus Kommentaren oder Links (QA24-18). **Neu:** Die USP-Messgrößen Traceability-Quote, CoverageAssertion-Anteil und „Frage → Entscheidung" werden im Pilot berichtet. **2.7:** Self-Play-Läufe (ein Mitglied, wechselnde Rollen) und Mehrmitglieder-Läufe werden getrennt gemessen und getrennt berichtet.

**UX-E12-F01-US01** — Als Produktverantwortlicher möchte ich prüfen, ob alle Rollen denselben offenen Sachverhalt korrekt verstehen, um einen hübschen Umschalter nicht mit echter Zusammenarbeit zu verwechseln.
- Erfolgsfall: Nach mehreren Perspektivwechseln können Beteiligte Bedarf, offene Bedingung, Optionsgrundlage und nächsten Auftrag korrekt benennen; Fehler werden pro Rolle dokumentiert.
- Negativfall: Klickzahl oder Zufriedenheit allein belegen weder Entscheidungsqualität noch Zeitersparnis.

**UX-E12-F01-US02** — Als Pilotverantwortlicher möchte ich Vorbereitungs-, Workshop- und Nachbearbeitungszeit aller Beteiligten erfassen, um keinen Aufwand nur vom Business in IT oder Beratung zu verschieben.
- Erfolgsfall: Gleiche Fälle und Quellen werden mit geeigneten Vergleichswerkzeugen bearbeitet; Erfahrung und Reihenfolge werden berücksichtigt.
- Negativfall: Eine kleine Stichprobe wird nicht als statistisch belastbare Marktüberlegenheit oder allgemeine Zeitersparnis veröffentlicht.

**Abnahmekataloge.** W22-A01–A24; C23-A01–A36; QA24-A04, A15, A16, A18.
**Änderung gegenüber 2.4.** USP-Messgrößen ergänzt.

<a id="ux-e12-f02"></a>
#### UX-E12-F02 — Fairer Vergleich auf Entscheidungsqualität und Gesamtaufwand

**Auftrag.** Verglichen werden der heutige Clean-Core.io-Ablauf, der tatsächlich vorhandene SAP-Prozess und bei autorisiertem Zugang relevante Wettbewerber. Gleiche Ausgangsfakten, ausbalancierte Reihenfolge und unabhängige Beurteilung verhindern Scheinsiege.

**Lieferumfang nach Gate.** **R0 (v2.10, neu):** Fachlicher Referenzkorpus v1 — 25 synthetische Legacy-Programme (die 7 Beispiele plus 18 neue über alle 11 Konstruktklassen) mit Ground Truth (Findings je Zeile, Nachfolger mit Typ, Level in beiden Sichten, Hand-Work, Business-Sätze mit Ankern), Regelversion und SAP-Primärquellen je Regel; von einem externen SAP-Architekten freigegeben. 3.0 (v3.0): Fachlicher Referenzkorpus und fairer Vergleich des unterstützten Kernfalls. *(3.2-Teilschnitt „Vergleich über Adapterwege" zurückgezogen — kein Adapter.)*
**Priorität/Größe.** P1 · R0: M · 3.0: L.
**Abhängigkeiten.** UX-E12-F02:R0 ← G0:R0 · UX-E12-F02:3.0 ← UX-E04-F02:R2, UX-E08-F03:3.0, UX-E12-F01:3.0.
**Herkunft.** E16-F02, SR-F20; Bench aus der Business-Bridge-Roadmap (F9.3).

**Vertrag.** Codebeobachtung und Sollregel-Nachweis werden separat geführt; der Korpus entscheidet Regelkorrekturen mit Regelversion (QA24-05). Die A–D-Vorrangregel (`released` → A; `notToBeReleased` → D vor `classicAPI`; `deprecated` → C/D; unklassifiziert → C) ist als Clean-Core.io-Lesart dokumentiert und am Korpus mit beiden Sichten geprüft. Wettbewerbervergleich nur mit autorisiertem Zugang, benanntem Stand, dokumentierter Methodik und nicht getesteten Funktionen (QA24-18); fehlende Website-Angabe ist keine fehlende Funktion.

**UX-E12-F02-US01** — Als Produktentscheider möchte ich den Aufwand aller beteiligten Rollen und fachliche Fehler messen, um Zeitersparnis nicht nur durch Arbeitsverlagerung zu behaupten.
- Erfolgsfall: Das Ergebnis zeigt aktive Zeit, Wartezeit, falsch bestätigte Fits, unnötige Gaps und offene Fälle getrennt.
- Negativfall: Klickreduktion oder schnellere Business-Antwort allein wird nicht als bewiesener Gesamtnutzen bewertet.

**UX-E12-F02-US02** — Als potenzieller Kunde möchte ich die Reichweite eines Wettbewerbsvergleichs nachvollziehen, um nicht auf unbelegte Einzigartigkeitsbehauptungen angewiesen zu sein.
- Erfolgsfall: Bericht nennt Tool-/Versionsstand, Zugang, Korpus, Methodik und nicht getestete Funktionen.
- Negativfall: Fehlender Zugang oder fehlende öffentliche Dokumentation wird nicht als Beweis fehlender Wettbewerbsfähigkeit ausgegeben.

**Abnahmekataloge.** QA24-A05, A18; V25-A04.
**Änderung gegenüber 2.4.** Neuer R0-Teilschnitt Referenzkorpus v1; A–D-Regel als Lesart mit Prüfpflicht.

<a id="ux-e12-f03"></a>
#### UX-E12-F03 — Wirkungsbeobachtung nach Umsetzung oder Stilllegung

**Auftrag.** Nach fachlicher Übernahme erfassen Fallbeteiligte vorab definierte Betriebs-/Geschäftsergebnisse **manuell** mit Quelle und Beobachtungsfenster (kein Betriebsanschluss). Istwerte ersetzen Szenarioannahmen nur innerhalb ihres Geltungsbereichs; Kausalität wird nicht behauptet.

**Lieferumfang nach Gate.** 3.5 (v3.5).
**Priorität/Größe.** P2 · 3.5: S.
**Abhängigkeiten.** UX-E12-F03:3.5 ← UX-E09-F03:3.5.
**Herkunft.** E12-F04, E15-F04, SR-F20.

**UX-E12-F03-US01** — Als Prozesseigner möchte ich prüfen, ob die gewählte Lösung den bestätigten Bedarf im Betrieb erfüllt, um aus Umsetzungserfahrung zu lernen.
- Erfolgsfall: Beobachtung nennt Messgröße, Datenquelle, Zeitraum und Scope; Abweichungen verlinken auf die ursprüngliche Anforderung.
- Negativfall: Eine Verbesserung ohne geeignete Vergleichsbasis wird nicht allein der Plattform zugerechnet.

**UX-E12-F03-US02** — Als Fallbesitzer möchte ich Annahmen und beobachtete Ergebnisse nachvollziehbar vergleichen, um spätere Entscheidungen mit belastbareren Daten zu treffen.
- Erfolgsfall: Szenarioannahme und Istwert bleiben getrennt versioniert; Unterschiede führen zu geeigneten Lern- oder Korrekturaufgaben.
- Negativfall: Nicht verfügbare Betriebsdaten werden weder als Nullfehler noch als bestätigter Nutzen ausgewiesen.

**Abnahmekataloge.** C23-A28.
**Änderung gegenüber 2.4.** 2.6: manuelle Erfassung statt Betriebsdaten-Import; Abhängigkeit von UX-E10-F01 entfällt.

<a id="ux-e13"></a>
### UX-E13 — Frühe Decision Economics als gemeinsame Entscheidungsgrundlage

<a id="ux-e13-f01"></a>
#### UX-E13-F01 — TCO-Grundlage direkt in Entscheiden

**Auftrag.** Ein EconomicsScenario besitzt Scope, Baseline, Horizont, Währung, Kostensicht, Annahmen und Reifegrad (Orientierung, Simulation, geprüfte Entscheidungsgrundlage). Kostenpositionen erhalten Kategorie, Zeitpunkt, Menge/Einheit, Quelle und Owner. Der Zugang ist ohne Zielcode möglich.

**Lieferumfang nach Gate.** **R0 (v2.10, neu):** Monetäre Felder aus dem Analyze-Prompt entfernt (`estimatedMaintenanceCostRange`, `cloudRoiSummary`); alle Anzeigen zeigen „nicht ermittelt", solange keine Annahmenrevision existiert; keine Score-zu-Euro-Ableitung. R1 (v2.11): TCO-Grundlage direkt in Entscheiden.
**Priorität/Größe.** P1 · R0: S · R1: M.
**Abhängigkeiten.** UX-E13-F01:R0 ← G0:R0 · UX-E13-F01:R1 ← UX-E02-F01:R1, UX-E03-F01:R1.
**Herkunft.** E12; SR-E06; extrahierter Economics-Scope aus UX-E05-F02/UX-E06-F02.

**Vertrag.** Eine Zahlenquelle für alle sieben Fähigkeiten (QA24-08). Dieselbe Szenario-ID und Annahmenrevision gelten in Management, Business und IT; historische TCO-Aufrufe führen in dieses Modul. Rechenbasis nach W-06 (diskrete Jahresperioden, Barwert mit explizitem r, Mehrkosten, kumulierter Cash-Vorteil, Amortisation ohne Infinity/negative Dauer, unbekannt bleibt unbekannt). Eine Kostenannahme ist teil- und kommentierbar; Kommentare verändern keine Werte. **Neu:** Die Formel wird öffentlich dokumentiert (UX-E14-F02) und mit dem mitgelieferten Python-Referenzkern (20 Tests) abgeglichen.

**UX-E13-F01-US01** — Als Prozesseigner möchte ich die Kostentreiber und Prozessfolgen schon bei der Optionsbildung sehen, um Erhalt, Standardisierung oder Neubau wirtschaftlich mitzudenken.
- Erfolgsfall: Entscheiden ist vor Transformation zugänglich; unbekannte Werte bleiben offen, bekannte Positionen erscheinen nur als Teilbetrag.
- Negativfall: Leere Felder werden weder null noch automatisch aus einem Clean-Core-Score in Euro umgerechnet.

**UX-E13-F01-US02** — Als Controller möchte ich Scope, Quelle und Kategorie jeder Annahme prüfen, um Cash-Wirkung, interne Kapazität und gemeinsame Kosten auseinanderzuhalten.
- Erfolgsfall: Kostenpositionen zeigen Einheit, Zeitraum, Verantwortlichkeit und Quelle; Baseline und Alternative sind auf vergleichbaren Bedarf bezogen.
- Negativfall: Historische versunkene Kosten werden nicht als zukünftige Ersparnis gezählt; vorhandene Plattformkapazität wird weder pauschal kostenlos noch doppelt voll angesetzt.

**Abnahmekataloge.** W22-A10/A12; C23-A10/A14/A19/A21; QA24-A08; V25-A06.
**Änderung gegenüber 2.4.** Neuer R0-Teilschnitt „monetäre Prompt-Felder entfernt"; Formel-Veröffentlichung.

<a id="ux-e13-f02"></a>
#### UX-E13-F02 — Optionssimulation und entscheidungsrelevante Sensitivität

**Auftrag.** Der deterministische Rechenkern vergleicht zulässige Optionspakete mit einmaligen, laufenden, Prozess- und Übergangskosten. Szenariowerte/Bandbreiten und wenige dominante Treiber zeigen, wann sich eine wirtschaftliche Einordnung ändert. Pflichtverletzungen werden nicht mit Kosten aufgehoben.

**Lieferumfang nach Gate.** R2 (v2.12).
**Priorität/Größe.** P1 · R2: M.
**Abhängigkeiten.** UX-E13-F02:R2 ← UX-E13-F01:R1, UX-E05-F02:R2.
**Herkunft.** E12; SR-E06.

**Vertrag.** Für fünf Optionen mit bis zu 100 Positionen je Option und 60 Modellperioden gilt p95 ≤ 150 ms als erstes Testbudget; kein Preisabruf oder LLM im Rechenpfad; eigene Szenarien überleben View-Wechsel und werden nur ausdrücklich übernommen.

**UX-E13-F02-US01** — Als Entscheider möchte ich sehen, welche Kostenannahme die Auswahl verändern könnte, um genau diese Unsicherheit prüfen zu lassen.
- Erfolgsfall: Veränderte Mengen, manueller Aufwand oder Servicekosten aktualisieren den eigenen Entwurf in allen Perspektiven und erzeugen einen nachvollziehbaren Prüfauftrag.
- Negativfall: Optimistisch/mittel/vorsichtig wird nicht als statistische Wahrscheinlichkeit ausgegeben; eine offene Pflichtkontrolle wird nicht durch günstige Kosten neutralisiert.

**UX-E13-F02-US02** — Als Reviewer möchte ich Rechenweg und Grenzfälle prüfen, um falsche TCO-/ROI-Aussagen zu verhindern.
- Erfolgsfall: Null-Differenz, Mehrkosten, fehlende Baseline, unterschiedliche Währung und Amortisation außerhalb des Horizonts besitzen verständliche Ergebnisse; Positionen werden nicht doppelt gezählt.
- Negativfall: Unvollständige Gesamtkosten erzeugen keinen Kostensieger; Ergebnisse enthalten niemals Infinity oder negative Amortisationszeiten.

**Abnahmekataloge.** W22-A11/A12/A23; QA24-A08.
**Änderung gegenüber 2.4.** Keine inhaltliche.

<a id="ux-e13-f03"></a>
#### UX-E13-F03 — Kostenrevision einfrieren und spätere Wirkung getrennt vergleichen

**Auftrag.** Persönliche Simulation, gemeinsamer Entwurf, geprüfte Entscheidungsgrundlage und spätere, manuell erfasste Istwerte bleiben getrennt. Die Entscheidung referenziert die freigegebene Kostenrevision; geänderte Architektur oder Mengen lösen die passende Wiederprüfung aus. Eine Budgetbewilligung ist ein separates Mandat.

**Lieferumfang nach Gate.** 3.0 (v3.0): Entscheidung bindet geprüfte Kostenrevision; Historie unverändert. 3.5 (v3.5): Getrennte Ist-/Wirkungsdaten ohne rückwirkende Änderung.
**Priorität/Größe.** P1 · 3.0: M · 3.5: M.
**Abhängigkeiten.** UX-E13-F03:3.0 ← UX-E13-F02:R2, UX-E05-F03:3.0 · UX-E13-F03:3.5 ← UX-E13-F02:R2, UX-E05-F03:3.0, UX-E13-F03:3.0.
**Herkunft.** E12; SR-E06.

**Vertrag.** Historischer Wirtschaftsbeleg: Entscheidungssnapshots bleiben über Beleglinks auf ihrem damaligen Stand; relevante Kommentarversionen über Annahmen bleiben referenziert; spätere Istwerte oder Kommentare schreiben den ursprünglichen Business Case nicht um. Abnahmen C23-A23, C23-A28 und C23-A30 gehören ausdrücklich zu diesem Feature (QA24-02).

**UX-E13-F03-US01** — Als Teammitglied möchte ich Annahmen gefahrlos ausprobieren, um Alternativen zu untersuchen, ohne die gemeinsame Entscheidung zu verändern.
- Erfolgsfall: Ein eigener Entwurf bleibt beim Sichtwechsel erhalten; Übernahme in den gemeinsamen Stand erfordert explizite Aktion und Revisionsprüfung.
- Negativfall: Ein Slider, Seitenwechsel oder neu geöffnetes Managementpanel schreibt keinen freigegebenen TCO um.

**UX-E13-F03-US02** — Als Managementverantwortlicher möchte ich spätere Kosten und Wirkung gegen die damaligen Annahmen sehen, um aus Entscheidungen zu lernen.
- Erfolgsfall: Der ursprüngliche Snapshot bleibt erhalten; Istwerte, Beobachtungszeitraum und Abweichungen erscheinen getrennt mit Herkunft.
- Negativfall: Eine spätere Kostenkorrektur wird nicht rückdatiert, und beobachtete Veränderung gilt nicht automatisch als kausal durch Clean-Core.io bewiesener Nutzen.

**Abnahmekataloge.** C23-A23/A28/A30; QA24-A02.
**Änderung gegenüber 2.4.** Keine inhaltliche (QA24-02 bereits in 2.4 integriert).

---

## Teil B — Neue Epics UX-E14 bis UX-E16

Diese Epics übernehmen aus der Business-Bridge-Roadmap (September 2026) nur, was die Gates der 2.4 voraussetzen oder die USP belegt. Alles Weitere bleibt nach 3.0 zurückgestellt. Kein bestehender Teilschnitt der 2.4 hängt von einem dieser Epics ab.

<a id="ux-e14"></a>
### UX-E14 — Belegte Öffentlichkeit: Konsistenz, Verifizierbarkeit, Reichweite

**Warum ein eigenes Epic.** Die Marke heißt „belegt, nicht behauptet". Am 11. September 2026 trägt die öffentliche Site (v2.9.11) noch die P0-Befunde des Audits vom 1. September: BSEG als „deprecated cluster table", eine CDS-View als „RAP Output", „auto-synced weekly" bei einer Release-Info vom 1. Juli, eine Vergleichstabelle mit „ATC flags only / manual only", „community-built" ohne Community, OG-URL des Katalogs auf der Startseite. Jede Außenabnahme (Pilot, Community-Post, Wettbewerbsvergleich) trifft auf diese Widersprüche zuerst.

<a id="ux-e14-f01"></a>
#### UX-E14-F01 — Facts-Service, Copy-CI und Korrektur der öffentlichen Aussagen

**Auftrag.** Eine Quelle für alle öffentlichen Zahlen und Regelsätze; ein Build, der bei Abweichung bricht; die offenen Copy-Befunde des Audits geschlossen.

**Lieferumfang nach Gate.** R0 (v2.10): `facts.json` (Objektzahl, Nachfolgerzahl, Level-Verteilung, Datei-Hashes und Sync-Daten beider Repository-Dateien, Engine-Version, Coverage 4/5/2, Referenz-Run-Zahlen) rendert alle Seiten; `/facts` und `llms.txt`; Copy-CI (Marker-Phrasen, Zahlen außerhalb `facts.json`, OG/Canonical, tote Links, Stufen-/Rollen-Texte außerhalb der Komponenten); Korrekturen H-01 (BSEG), H-02 (CDS-View statt RAP-Output, `.ddls.asddls`), H-05/H-06 (Vergleichstabelle Stand 09/2026), GLB-01 (Zahlen/Daten), GLB-03 (LLM-Rolle), GLB-05 (Stufenmodell), GLB-06 (Zeit-/TCO-Claims), GLB-11 (community-built/admin team), CAT-01 (OG), CAT-02/DS-01 (QA-Notizen), IMP-01 (TMG→DDG). R1 (v2.11): Site zeigt, was bereits im neuen Arbeitsraum integriert ist und was über den alten Pfad läuft; Override-Status „dokumentiert, nicht wirksam" sichtbar.
**Priorität/Größe.** P1 · R0: M · R1: S.
**Abhängigkeiten.** UX-E14-F01:R0 ← G0:R0 · UX-E14-F01:R1 ← UX-E14-F01:R0, UX-E06-F01:R1.
**Herkunft.** Audit 01.09.2026 (GLB-01–GLB-11, H-01–H-11, CAT-01–CAT-05, DS-01, IMP-01); Business-Bridge-Roadmap F0.1, F0.5, F0.6, F0.9.

**Vertrag.** Keine hartcodierte Zahl in Copy oder Meta. „Weekly" nur mit nachweisbarem Sync-Log. Nachfolger tragen Typ und Provenienz (SAP-Release-Daten, kuratiert, API Hub); VBAK zeigt I_SalesDocument (SAP), I_SalesOrder (kuratiert, Lesen), I_SalesOrderTP (kuratiert, transaktional) mit Regel. Ansprüche auf der Site nur mit Beleg in der Spalte „heute" des USP-Beweisplans.

**UX-E14-F01-US01** — Als SAP-Architekt, der die Site prüft, möchte ich auf jeder Seite dieselbe Objektzahl, dasselbe Sync-Datum und dieselbe Nachfolgerregel finden, um dem Werkzeug vor dem ersten Upload vertrauen zu können.
- Erfolgsfall: Startseite, How-it-works, Katalog, Referenz-Run und Whitepaper nennen identische Werte aus `facts.json`; `/facts` erklärt die Herkunft beider Repository-Dateien.
- Negativfall: Ein manuell geänderter Zahlenwert in einer Seite bricht den Build; eine Seite ohne Facts-Bindung wird nicht veröffentlicht.

**UX-E14-F01-US02** — Als Maintainer möchte ich, dass Redaktions- und QA-Notizen technisch nicht in die Produktion gelangen können, um die Glaubwürdigkeit nicht durch Versehen zu verlieren.
- Erfolgsfall: Copy-CI erkennt Marker-Phrasen („previously", „used to claim", „TODO") und blockiert das Deployment mit Fundstelle.
- Negativfall: Ein bestandener Build ist kein Nachweis fachlicher Richtigkeit; fachliche Korrekturen brauchen den Fach-Review aus UX-E12-F02:R0.

**Abnahmekataloge.** V25-A09, A10.

<a id="ux-e14-f02"></a>
#### UX-E14-F02 — Level-Regelseite mit beiden Sichten und veröffentlichte Economics-Formel

**Auftrag.** Die A–D-Ableitung und die Economics-Rechenbasis sind öffentlich, versioniert und am Referenzkorpus prüfbar.

**Lieferumfang nach Gate.** R0 (v2.10): `/method/levels` — ABAP-Cloud-Sicht (`objectReleaseInfo`) und Klassik-Sicht (`objectClassifications_SAP`) nebeneinander; Vorrangregel als Clean-Core.io-Lesart mit Begründung (22 Überlappungsobjekte mit released Nachfolger), Beispiele (VBAK, KONV, CL_HTTP_CLIENT), Regelversion, Hinweis auf ATC als Autorität; Score umbenannt („Clean-Core.io Score") mit Formel und Beispielrechnung am Referenz-Run; TCO-Versprechen von der Score-Seite entfernt. R2 (v2.12): `/method/economics` — Rechenbasis aus W-06 mit dem Python-Referenzkern und Grenzfällen, identisch zum Modul UX-E13.
**Priorität/Größe.** P1 · R0: M · R2: S.
**Abhängigkeiten.** UX-E14-F02:R0 ← UX-E14-F01:R0 · UX-E14-F02:R2 ← UX-E14-F02:R0, UX-E13-F02:R2.
**Herkunft.** Audit F-06, F-07, F-19; QA24-05; Business-Bridge F0.7, F0.8.

**Vertrag.** Der Katalog zeigt je Objekt beide Sichten und die abgeleitete Stufe mit Link auf die Regel. Eine Regeländerung erhält Regelversion, Referenzfall und Freigabegrund; alte Runs bleiben ihrer Regelversion zugeordnet. Der Begriff „SAP Clean Core Score" wird nicht verwendet.

**UX-E14-F02-US01** — Als Reviewer möchte ich die A–D-Ableitung eines Objekts mit beiden SAP-Dateien nachvollziehen, um eine strittige Stufe zu prüfen statt zu raten.
- Erfolgsfall: Die Objektseite zeigt Release-Status, Klassifikation, angewandte Regel und Regelversion; die Regelseite erklärt die Vorrangentscheidung mit Beispielen.
- Negativfall: Eine abweichende Meinung eines Reviewers ändert die Regel nicht ohne Korpusfall, Regelversion und Freigabe.

**UX-E14-F02-US02** — Als Controller möchte ich die TCO-Formel vor der Nutzung lesen, um zu wissen, was das Werkzeug rechnet und was nicht.
- Erfolgsfall: Die Formelseite nennt Perioden, Diskontierung, Kategorien, Ausschlüsse und Grenzfälle; die Beispielrechnung ist mit dem Referenzkern reproduzierbar.
- Negativfall: Ohne Annahmenrevision zeigt kein Modul einen Geldwert; die Formelseite verspricht keine Einsparung.

**Abnahmekataloge.** QA24-A05, A08; V25-A02, A06.

<a id="ux-e14-f03"></a>
#### UX-E14-F03 — Öffentlicher Signaturschlüssel und Offline-Verifier

**Auftrag.** „Anyone can verify" wird wahr: Ed25519-Signaturen mit veröffentlichtem Schlüssel und einem quelloffenen Verifier, der ein Evidence Pack ohne Server prüft.

**Lieferumfang nach Gate.** 3.0 (v3.0): Public Key unter `/.well-known/clean-core-io-signing.json`; Verifier (CLI, Apache-2.0); historische HMAC-only-Pakete behalten ihren Status; Trust-Seite und Whitepaper beschreiben den tatsächlichen Signaturumfang.
**Priorität/Größe.** P1 · 3.0: M.
**Abhängigkeiten.** UX-E14-F03:3.0 ← UX-E09-F01:3.0.
**Herkunft.** Audit F-18, TR-02, WP-03; `signEd25519` auf `main` bereits importiert.

**UX-E14-F03-US01** — Als Auditor möchte ich ein Evidence Pack Monate später offline gegen den veröffentlichten Schlüssel prüfen, um Integrität ohne Vertrauen in den Server nachzuweisen.
- Erfolgsfall: Der Verifier bestätigt Manifest-Hash und Signatur; ein manipuliertes Paket wird erkannt.
- Negativfall: Eine gültige Signatur wird nicht als fachliche Richtigkeit oder als qualifizierte elektronische Signatur ausgegeben.

**UX-E14-F03-US02** — Als Security-Reviewer möchte ich den Signaturumfang lesen, um zu wissen, welche Felder signiert sind und welche nicht.
- Erfolgsfall: Manifest und Doku nennen `covers[]`; das Narrativ ist ausgeschlossen, Findings, Nachfolger, Level, Entscheidungen eingeschlossen.
- Negativfall: Ein historisches HMAC-Paket wird nicht still als Ed25519-Paket ausgewiesen.

**Abnahmekataloge.** C23-A29; V25-A11.

<a id="ux-e14-f04"></a>
#### UX-E14-F04 — Clean Core Bench: veröffentlichter Referenzkorpus mit Harness

**Auftrag.** Der interne Referenzkorpus (UX-E12-F02:R0) wird zum öffentlichen Benchmark: Korpus, Ground Truth, Harness und reproduzierbare Ergebnisse — zuerst für Clean-Core.io selbst, dann für mindestens ein quelloffenes Fremdwerkzeug.

**Lieferumfang nach Gate.** R2 (v2.12): Harness intern; Korpus v1 gegen die Engine gelaufen; Kennzahlen Präzision/Recall der Findings, Nachfolger-Genauigkeit, Level-Genauigkeit in beiden Sichten, Halluzinationsquote im Narrativ (Sätze ohne Anker), ehrliche Abstinenz. 3.0 (v3.0): Veröffentlichung (Daten CC-BY-4.0, Harness Apache-2.0), Clean-Core.io-Ergebnis, mindestens ein Fremdvergleich (z. B. AWS Kiro-Agenten) mit benanntem Stand.
**Priorität/Größe.** P1 · R2: M · 3.0: L.
**Abhängigkeiten.** UX-E14-F04:R2 ← UX-E12-F02:R0 · UX-E14-F04:3.0 ← UX-E14-F04:R2, UX-E12-F02:3.0.
**Herkunft.** Business-Bridge F9.3; QA24-05, QA24-18.

**Vertrag.** Ein Benchmark ersetzt keinen Pilot: Er misst Werkzeugverhalten am Korpus, nicht Entscheidungsqualität im Team. Fremdvergleiche nur mit autorisiertem Zugang oder quelloffenem Werkzeug, benanntem Stand und veröffentlichter Methodik.

**UX-E14-F04-US01** — Als Entwickler möchte ich den Benchmark lokal laufen lassen, um Engine-Änderungen vor einem Release gegen Ground Truth zu prüfen.
- Erfolgsfall: Harness läuft ohne Cloud-Zugang; ein Regelwechsel zeigt sich als messbare Änderung der Level-Genauigkeit.
- Negativfall: Ein Korpus-Fall ohne Ground Truth wird nicht gewertet; ein bestandener Bench ist kein Pilotersatz.

**UX-E14-F04-US02** — Als Interessent möchte ich Clean-Core.io und ein anderes Werkzeug auf demselben Korpus vergleichen, um Aussagen über Genauigkeit nachvollziehen zu können.
- Erfolgsfall: Die Ergebnisseite nennt beide Stände, Methodik, nicht getestete Funktionen und Rohdaten.
- Negativfall: Fehlender Zugang zu einem Werkzeug erscheint als „nicht getestet", nie als Unterlegenheit.

**Abnahmekataloge.** QA24-A18; V25-A04.

<a id="ux-e14-f05"></a>
#### UX-E14-F05 — Reichweite: Vergleichsseiten, deutsche Kernseiten, Entity-Hygiene

**Auftrag.** Reichweite ohne Übertreibung: datierte Vergleichsseiten der öffentlichen Positionierung, deutsche Kernseiten, konsistente Entität, ein monatlicher Community-Beitrag, der Arbeit belegt.

**Lieferumfang nach Gate.** 3.1 (v3.1): Vergleichsseiten „öffentliche Positionierung, Stand <Datum>" für SAP Joule ABAP AI / Custom Code Migration Agent, Kernseife, AWS Kiro, smartShift/Lemongrass/Nova — jeweils mit „wann dieses Werkzeug, wann Clean-Core.io, wann beides" und ohne Funktionsurteile ohne autorisierten Zugang; Clean-Core.io positioniert sich als freie Vorbereitung und Evidenz, nicht als Projektlieferant; `/de/` für Startseite, Explainer, Klassifikation, Code-Analyse, Score, Datenschutz mit `hreflang`; Organization-/Person-Schema mit `sameAs`, About mit Credentials, GitHub-Org, Lizenz, Topics.
**Priorität/Größe.** P2 · 3.1: L.
**Abhängigkeiten.** UX-E14-F05:3.1 ← UX-E14-F01:R0.
**Herkunft.** Audit ABT-01, GLB-09/10, GH-01–GH-06, T-01–T-10; Business-Bridge F10.1–F10.6.

**UX-E14-F05-US01** — Als Kaufinteressent möchte ich lesen, wann welches Werkzeug passt, um Clean-Core.io richtig einzuordnen statt es als Ersatz für SAP-Tools zu missverstehen.
- Erfolgsfall: Jede Vergleichsseite nennt Datum, Quellen, Zweck des anderen Werkzeugs und die Fälle, in denen es die bessere Wahl ist.
- Negativfall: Keine Seite behauptet Vorsprung ohne Bench- oder Pilotbeleg.

**UX-E14-F05-US02** — Als deutschsprachiger Prozesseigner möchte ich die Kernseiten auf Deutsch lesen, um den Decision Request ohne Übersetzung zu verstehen.
- Erfolgsfall: Die sechs Kernseiten sind übersetzt, `hreflang` ist fehlerfrei, das Narrativ des Decision Request ist in DE und EN verfügbar.
- Negativfall: Der Katalog bleibt einsprachig; keine maschinelle Teilübersetzung ohne Review geht live.

**Abnahmekataloge.** V25-A10.

<a id="ux-e15"></a>
### UX-E15 — Souveräner Betriebsweg: Zero-LLM, Self-Hosting, Provider

**Warum ein eigenes Epic.** Wer Kundencode nicht an einen Modellanbieter geben darf, braucht einen deterministischen Weg (Zero-LLM) oder seinen eigenen Anbieter (BYOK). Beides bleibt Community-Funktion. **2.6:** Eine Self-Hosted Edition wird nicht angeboten — der Kern ist Open Source; wer selbst hostet, tut das ohne Zusage, Runbook oder Support. Organisationsverantwortung (W-09) entsteht nicht bei Clean-Core.io, sondern beim Unternehmen, das über MCP/Export in seine Systeme liest.

<a id="ux-e15-f01"></a>
#### UX-E15-F01 — Zero-LLM-Modus

**Auftrag.** Analyse, Level, Mapping, Routing-Bedingungen, Score, Manifest und Evidence Pack funktionieren vollständig ohne Modellaufruf; Narrativ, Spec und Entwurf werden als „nicht erzeugt" markiert.

**Lieferumfang nach Gate.** R0 (v2.10): Deterministischer Grundmodus als Sperrpfad — jeder Run läuft ohne API-Key bis zum signierten Evidenzstand; LLM-Stufen sind explizit zuschaltbar. R2 (v2.12): Zero-LLM-Run mit persistenter Gegenprobe und Economics; Coverage-Matrix zeigt, was ohne LLM fehlt.
**Priorität/Größe.** P1 · R0: S · R2: M.
**Abhängigkeiten.** UX-E15-F01:R0 ← G0:R0 · UX-E15-F01:R2 ← UX-E15-F01:R0, UX-E02-F01:R1.
**Herkunft.** Business-Bridge F1.6; QA24-08 (keine Geldwerte aus Modellen).

**UX-E15-F01-US01** — Als Security-Verantwortlicher möchte ich Kundencode analysieren, ohne dass er einen Modellanbieter erreicht, um die Freigabe meiner Organisation nicht zu verletzen.
- Erfolgsfall: Ein Run ohne API-Key liefert Findings, beide Level-Sichten, Nachfolger, Score und ein signiertes Pack; das Datenflussdiagramm zeigt keinen externen Aufruf.
- Negativfall: Kein Modul greift im Zero-LLM-Modus still auf den Community-Key zurück; fehlende Narrative erscheinen als „nicht erzeugt", nicht als leer.

**UX-E15-F01-US02** — Als Architekt möchte ich später gezielt einzelne LLM-Stufen zuschalten, um Narrativ oder Entwurf nur dort zu erzeugen, wo die Freigabe vorliegt.
- Erfolgsfall: Jede Stufe ist einzeln aktivierbar und im Manifest als Modell-/Promptversion vermerkt.
- Negativfall: Ein zugeschaltetes Narrativ verändert keine deterministischen Findings und wird nicht in den signierten Umfang aufgenommen.

**Abnahmekataloge.** V25-A12.

<a id="ux-e15-f02"></a>
#### UX-E15-F02 — Self-Hosted Edition (zurückgezogen 2.6)

**Status.** Zurückgezogen. Keine Preview, keine Edition, kein Runbook, keine Identitätsanbindung, keine Löschtests im Auftrag Dritter. Der Engine-Kern bleibt Open Source (UX-E14); eigenes Hosting ist möglich, aber kein Produkt. Ein Pilot mit echtem Code läuft im Community-Werkzeug in Verantwortung des Mitglieds — mit Zero-LLM-Modus (UX-E15-F01) und BYOK (UX-E15-F03) als Schutzwerkzeugen — oder das Unternehmen liest nur über MCP/Export.

**Lieferumfang nach Gate.** — (kein Teilschnitt).
**Herkunft.** Business-Bridge F7.3; W-09, W-15 der 2.4 (historisch).

~~UX-E15-F02-US01~~ — zurückgezogen (Betrieb in der eigenen Umgebung mit Runbook).
~~UX-E15-F02-US02~~ — zurückgezogen (Lösch-/Restore-Vorgänge nach Organisations-Policy).

**Änderung gegenüber 2.5.** Teilschnitte `UX-E15-F02:R2` und `UX-E15-F02:3.0` gestrichen.

<a id="ux-e15-f03"></a>
#### UX-E15-F03 — Provider-Abstraktion und Multi-Provider-BYOK

**Auftrag.** LLM-Stufen laufen hinter einer Provider-Schnittstelle; Kunden bringen Gemini (Developer API/Vertex), Azure OpenAI, Anthropic (Bedrock/Vertex), Mistral oder SAP AI Core mit; Output-Äquivalenz wird auf der Bench gemessen.

**Lieferumfang nach Gate.** 3.5 (v3.5).
**Priorität/Größe.** P2 · 3.5: L.
**Abhängigkeiten.** UX-E15-F03:3.5 ← UX-E15-F01:R2, UX-E12-F02:3.0.
**Herkunft.** Business-Bridge F7.1, F7.2; Audit GLB-13.

**UX-E15-F03-US01** — Als Enterprise-Architekt möchte ich den bei uns freigegebenen Modellanbieter nutzen, um Clean-Core.io ohne neue Anbieterfreigabe einzusetzen.
- Erfolgsfall: Provider-Auswahl je Projekt; Model Card, Region und Datennutzungsbedingungen werden angezeigt und im Manifest vermerkt.
- Negativfall: Kein Provider-Wechsel verändert deterministische Findings; ein nicht gelisteter Anbieter wird nicht als „unterstützt" ausgegeben.

**UX-E15-F03-US02** — Als Produktverantwortlicher möchte ich die Qualität je Anbieter auf demselben Korpus sehen, um keine Äquivalenz zu behaupten, die nicht gemessen ist.
- Erfolgsfall: Die Bench-Seite zeigt Halluzinationsquote und Anker-Quote je Anbieter/Modell mit Stand.
- Negativfall: Ein Anbieter ohne Bench-Lauf erscheint als „nicht gemessen".

**Abnahmekataloge.** V25-A12.

<a id="ux-e16"></a>
### UX-E16 — Ökosystem-Anschluss: Importe, Formate, Schnittstellen

**Warum ein eigenes Epic.** SAP-Werkzeuge liefern Messungen (ATC, Kernseife), Laufzeitdaten (SCMON/UPL) und agentische Ergebnisse (Joule). Clean-Core.io nimmt sie als Input und gibt Entscheidungen als Output zurück. **2.6:** Der Output-Weg für Unternehmen ist MCP plus Open Evidence Format — lesend, signiert, mit Scoped Tokens. Clean-Core.io betreibt keine Integration in Kundensysteme; das führende System bleibt beim Unternehmen.

<a id="ux-e16-f01"></a>
#### UX-E16-F01 — Importe: ATC-Ergebnisse, Kernseife-Export, SCMON/UPL/ST03N

**Auftrag.** Externe Messungen werden als eigene Provenienz neben den eigenen Findings geführt; Abgleiche zeigen Übereinstimmung und Abweichung; Nutzungsdaten tragen Beobachtungsfenster.

**Lieferumfang nach Gate.** R2 (v2.12): ATC-Export (ADT/CSV/XML) und Kernseife-Klassifikations-JSON/Ergebnisexport als „SAP-autoritativ" gekennzeichnet; SCMON/SUSG-, UPL- und ST03N-Exporte als Nutzungsquelle mit Fenster, Aufrufen, Nutzern; Abgleichbericht je Objekt.
**Priorität/Größe.** P1 · R2: L.
**Abhängigkeiten.** UX-E16-F01:R2 ← UX-E02-F01:R1, UX-E03-F01:R1.
**Herkunft.** Business-Bridge F3.2–F3.4; Audit ACA-05.

**Vertrag.** Importierte Findings überschreiben keine eigenen und umgekehrt; Abweichungen werden erklärt (Regelversion, Katalogstand). Nutzung ohne passendes Fenster bleibt „unbekannt" (UX-E02-F03). Formate werden nur für dokumentierte Exportwege unterstützt; keine Konnektor-Zusage.

**UX-E16-F01-US01** — Als Architekt möchte ich unsere ATC- und Kernseife-Ergebnisse einspielen, um Clean-Core.io als Entscheidungsschicht auf der autoritativen Messung zu nutzen statt sie zu duplizieren.
- Erfolgsfall: Der Fall zeigt je Objekt ATC-Befund, Kernseife-Rating und eigene Ableitung mit Abgleich; „Kernseife misst — Clean-Core.io entscheidet" ist als Workflow dokumentiert.
- Negativfall: Ein Import ohne Systemstand und Datum wird nicht als aktuell gewertet; Abweichungen werden nicht still zugunsten der eigenen Regel aufgelöst.

**UX-E16-F01-US02** — Als Prozesseigner möchte ich sehen, wann ein Programm zuletzt lief und wer es nutzt, um eine Stilllegung nicht aus einem zu kurzen Fenster zu beschließen.
- Erfolgsfall: Nutzungsangaben nennen Quelle, Fenster, Aufrufe/90 Tage und Nutzerzahl; ein zu kurzes Fenster erzeugt einen Prüfauftrag.
- Negativfall: Fehlende Nutzungsdaten erscheinen nie als „nicht genutzt".

**Abnahmekataloge.** V25-A05.

<a id="ux-e16-f02"></a>
#### UX-E16-F02 — Open Evidence Format v1

**Auftrag.** Ein JSON-Schema für Findings, Nachfolger, Level (beide Sichten), Nutzung, Routen, CoverageAssertions, Entscheidungen und Attestationen — als Export des Evidence Packs und als Importformat für Agenten- und Partnerergebnisse.

**Lieferumfang nach Gate.** 3.0 (v3.0): Schema, Validator, Beispiele, Exporter aus dem Evidence Pack; zwei Referenz-Importer (ATC-Export, ein quelloffener Agent).
**Priorität/Größe.** P1 · 3.0: M.
**Abhängigkeiten.** UX-E16-F02:3.0 ← UX-E09-F01:3.0, UX-E16-F01:R2.
**Herkunft.** Business-Bridge F9.2, F11.2.

**UX-E16-F02-US01** — Als Partner möchte ich Ergebnisse meines Werkzeugs in Clean-Core.io einliefern, um dort Entscheidung und Signatur zu nutzen.
- Erfolgsfall: Ein valides Dokument wird mit Provenienz „extern" importiert und im Abgleich gezeigt; Signaturumfang bleibt getrennt.
- Negativfall: Externe Findings erhalten keine Clean-Core.io-Signatur und keine autoritative Wirkung ohne Abgleich.

**UX-E16-F02-US02** — Als Auditor möchte ich ein Evidence Pack in einem offenen Format lesen, um es ohne die Plattform auswerten zu können.
- Erfolgsfall: Export und Verifier (UX-E14-F03) arbeiten auf demselben Format; das Schema ist versioniert.
- Negativfall: Ein Export mit rollenbedingter Kürzung ist als Auszug gekennzeichnet (C23-A30).

**Abnahmekataloge.** C23-A30; V25-A11.

<a id="ux-e16-f03"></a>
#### UX-E16-F03 — MCP für Corporates, Katalog-API und Changelog

**Auftrag.** Unternehmen lesen Katalog- und Fallinformationen in ihre eigenen Werkzeuge (Claude Code, ADT-MCP-Clients, Copilot, eigene Cloud-ALM-/Jira-Importe), ohne dass Clean-Core.io Enterprise-Funktionen betreibt. Alles lesend; Fallzugriff nur mit Scoped Token des Fallbesitzers.

**Lieferumfang nach Gate.** 3.1 (v3.1): Katalog-MCP öffentlich (`lookup_object`, `successors_for`, `level_for` mit beiden Sichten und Regelversion, `cr_changes_since`, `coverage_matrix`, `level_rules`); Fall-MCP mit Scoped Tokens (`case_manifest`, `case_findings`, `case_levels`, `case_requirements`, `case_coverage`, `case_options`, `case_decisions`, `case_receipts`, `case_evidence_pack` im Open Evidence Format, signiert); Scopes: Findings & Levels · Requirements & Decisions · Cost scenarios · Receipts · Comments · Raw code (Standard: Rohcode, Kommentare, Kosten aus); Token fallgebunden, ablaufend (30 Tage), widerrufbar; jeder Zugriff im Fall-Journal; Katalog-API `GET /api/catalog/{object}`, `/module/{m}`, `/level/{d}` mit CSV/JSON-Download. 3.2 (v3.2): Cloudification-Changelog (`/changes?since=`, Seite, RSS) als Auslöser für UX-E10-F03; Integrationsrezepte für Claude Code, ADT-MCP und Copilot.
**Priorität/Größe.** P1 · 3.1: L · 3.2: M.
**Abhängigkeiten.** UX-E16-F03:3.1 ← UX-E14-F01:R0, UX-E16-F02:3.0, UX-E14-F03:3.0 · UX-E16-F03:3.2 ← UX-E16-F03:3.1.
**Herkunft.** Business-Bridge F2.1–F2.3, F11.1; Audit CAT-04, CAT-07, GLB-14; Rahmenkorrektur 2.6.

**Vertrag.** Keine Schreib-Tools; kein Agent kann eine Entscheidung, Transformation oder Freigabe auslösen (RM-8). Antworten tragen Manifest, Revision, Regelversion, Signaturumfang und virtuelle Rollen mit pseudonymen Signer-IDs — keine Mitgliedsidentitäten, keine Handles. Ein Token öffnet genau einen Fall mit genau den gewählten Scopes; Rohcode nur bei ausdrücklichem Scope. Indexregeln des Katalogs: Objekte mit Nachfolger und Level-D-Objekte indexiert, Rest `noindex,follow`.

**UX-E16-F03-US01** — Als Architekt in einem Unternehmen möchte ich die belegten Ergebnisse eines geteilten Falls per MCP in unsere Werkzeuge lesen, um sie in unserem führenden System weiterzuführen, ohne dass Clean-Core.io in unsere Landschaft integriert wird.
- Erfolgsfall: Mit einem vom Fallbesitzer erzeugten Token liefert `case_evidence_pack` das signierte Open-Evidence-Dokument mit Manifest, Revisionen, virtuellen Rollen und Self-Play-Kennzeichen; Rohcode und Kommentare fehlen, solange der Scope sie nicht enthält; der Zugriff steht im Journal.
- Negativfall: Ein Token liest keinen zweiten Fall; ein abgelaufenes oder widerrufenes Token liefert nichts; kein MCP-Aufruf schreibt oder entscheidet.

**UX-E16-F03-US02** — Als Entwickler möchte ich Nachfolger, beide Level-Sichten und wöchentliche Katalogänderungen aus meiner IDE abfragen, um Entscheidungen bei neuem Repository-Stand gezielt wiedervorzulegen.
- Erfolgsfall: Katalog-MCP und API liefern beide Sichten, Nachfolger mit Typ und Provenienz, Regelversion und Repository-Hashes; der Changelog nennt neu released Objekte, neue Nachfolger und Statuswechsel.
- Negativfall: „Weekly" erscheint nur mit nachweisbarem Sync-Log; ein ausgefallener Sync wird angezeigt.

**Abnahmekataloge.** V25-A14; V25-A15 (neu).
**Änderung gegenüber 2.5.** MCP von 3.4 auf 3.1 vorgezogen und um den Fall-MCP mit Scoped Tokens erweitert; Changelog nach 3.2; ersetzt den zurückgezogenen ALM-Adapter.

---

## Anhang A — Abnahmekataloge

Die Kataloge W22, C23 und QA24 gelten unverändert (Wortlaut der Fassung 2.4). Produktstatus aller Fälle: `not_run`, bis Läufe mit Umgebung, Inputrevisionen und Ergebnissen vorliegen. V25 ergänzt die Fälle der neuen Teilschnitte.

### Gemeinsamer Workspace — W22

| ID | Prüfung | Erfolgsbedingung / bewusst zu verhindernder Fehler |
|---|---|---|
| W22-A01 | View-Wechsel auf derselben Regel. | ID, Revision, Scope und fachliche Auswahl bleiben erhalten. |
| W22-A02 | Business → IT → Management → Business. | Fachinhalt und Rückkehrkontext bleiben konsistent, keine neue Hypothese durch Umschaltung. |
| W22-A03 | Layer einschalten. | Vorhandene Beziehungen werden sichtbar; fehlende Zuordnung wird nicht erfunden. |
| W22-A04 | Alle sieben Werkzeuge öffnen. | Jedes erhält denselben Kontext; kein manuelles Wiederhochladen oder Kopieren zur Übergabe. |
| W22-A05 | Analyse läuft während View-Wechsel. | UI bleibt bedienbar; Job wird nicht erneut gestartet. |
| W22-A06 | Neue Analyse trifft nach Quellenänderung ein. | Ergebnis bleibt an alte Eingabe gebunden; kein stilles Überschreiben des aktuellen Stands. |
| W22-A07 | Genehmigte Architektur weicht von Empfehlung ab. | Transformation folgt dem Vertrag, nicht der alten Empfehlung. |
| W22-A08 | Standardübernahme ohne Zielcode. | Konfigurations-/Prozessverpflichtungen, Nachweise und Delivery bleiben vollständig. |
| W22-A09 | Stilllegung. | Passende Abschaltungsprüfungen bleiben erforderlich; Generierung ist begründet nicht anwendbar. |
| W22-A10 | Fehlendes TCO-Feld. | Fehlend bleibt fehlend; Option erhält keinen künstlichen Kostenvorteil. |
| W22-A11 | Wechsel während persönlicher TCO-Simulation. | Entwurf bleibt erhalten, gemeinsame Entscheidung bleibt unverändert. |
| W22-A12 | Gleicher Kostenstand in drei Views. | Laufzeit, Scope, Währung, Annahmenrevision und Ergebnis sind identisch. |
| W22-A13 | Dokumentansicht und Snapshot. | Fakten verweisen auf gleiche Revisionen; historische Ausgaben werden nicht nachträglich umgeschrieben. |
| W22-A14 | Business ändert eine bestätigte Regel. | Betroffene Ableitungen erhalten Wiederprüfungsbedarf, nicht pauschal alle Artefakte. |
| W22-A15 | Test simuliert, übersprungen oder nur Connectivity. | Kein View stellt dies als erfolgreiche fachliche Ausführung dar. |
| W22-A16 | Tatsächlicher Test auf anderem Codehash. | Nachweis gilt nicht stillschweigend für die aktuelle Ausgabe. |
| W22-A17 | Delivery-Export erstellt. | Erstellung ist nicht Übernahme; Manifest und Rollenverantwortung bleiben sichtbar. |
| W22-A18 | Diskussion in unterschiedlichen Views. | Beiträge referenzieren denselben Gegenstand; keine duplizierten Thread-Wahrheiten. |
| W22-A19 | Fremde Änderung während Bearbeitung. | Konflikt/Änderungshinweis statt stiller Verlust; bestätigungsrelevante Grundlage serverseitig geprüft. |
| W22-A20 | Unberechtigter IT-View, Suche oder Cachezugriff. | Kein Leak in Payload, Darstellung, Export oder abgeleiteter Kurzfassung. |
| W22-A21 | Tastatur-/Screenreader-Wechsel. | Logischer Fokus, verständlicher Status und keine Aktivierung mit störender unerwarteter Verzögerung. |
| W22-A22 | Normalnetz, langsames Netz, Abbruch. | Kern bleibt handhabbar; nicht gespeicherte Änderungen werden nicht als gespeichert bestätigt. |
| W22-A23 | Warm-/Kalt-Performance. | Budgets unter benanntem Profil und mit korrekt definiertem Ende gemessen, kein Spinner als View-Fertigstellung. |
| W22-A24 | Längere Sitzung und wiederholte Wechsel. | Kein fortschreitender Kontext-/Speicherverlust; Fehler und Tail-Latenzen werden ausgewiesen. |

### Code, Teilen, Diskussion und Audit — C23

| ID | Prüfung | Erwartung |
|---|---|---|
| C23-A01 | Bestehenden Referenzfall über alle sieben Fähigkeiten öffnen. | Keine Fähigkeit oder wesentliche Detailinformation geht durch die neue Shell verloren. |
| C23-A02 | Alten Originalcode und Evidence Pack migrieren. | Ursprüngliche Bytes, Hashes, Signaturen und wahrheitsgemäßer Verifikationsstatus bleiben erhalten. |
| C23-A03 | Fachregel wird gezielt korrigiert. | Geändertes Ergebnis nennt Regelversion und Freigabegrund; kein stiller Vergleich mit falschem Altoutput. |
| C23-A04 | Analyse als Einzelnutzer ohne Teilen. | Kein Zwang zu Teamraum, Einladung oder Business-Sign-off. |
| C23-A05 | Teilquelle ohne Include/Customizing untersuchen. | Antwort nennt die konkrete Lücke, statt vollständige Laufzeitkenntnis zu behaupten. |
| C23-A06 | Neuen Bedarf ohne Codebeleg erfassen. | Fachliche Herkunft zulässig; kein erfundener Codeanker und keine behauptete implementierte Regel. |
| C23-A07 | Link für bereits Berechtigte kopieren. | Kein AccessGrant und keine größere Sichtbarkeit entstehen. |
| C23-A08 | Benannte Person zum Fall einladen. | Gewähltes Recht und Inhaltsumfang einschließlich Code werden korrekt wirksam und protokolliert. |
| C23-A09 | Link an unberechtigte Person weiterleiten. | Kein Inhalt, sensibler Titel, Preview oder fremder Tenant wird offengelegt. |
| C23-A10 | Durch Anmeldung/Tenantwechsel unterbrochenen Link öffnen. | Rückkehr zum exakten Fall, Gegenstand, Thread und zulässigen Stand. |
| C23-A11 | Quellenrevision nach Teilen ändern. | Arbeitslink erklärt die Veränderung; Beleglink bleibt beim Originalstand. |
| C23-A12 | Alte Codeauswahl verschiebt sich oder verschwindet. | Originalanker bleibt; neue Zuordnung wird als überprüfte Zuordnung oder offene Lücke behandelt. |
| C23-A13 | Tiefenlink auf wenige Zeilen bei Fallfreigabe. | Dialog und Doku behaupten keine zeilenweise Sicherheitsgrenze. |
| C23-A14 | Business-Teilfreigabe ohne Raw-Code-Recht. | Kein Leak über Netzwerkpayload, Suche, Export, Thread, KI-Antwort oder Cache. |
| C23-A15 | Einem Kollegen Rechte außerhalb des eigenen Delegationsumfangs geben. | Server lehnt ab; ein Editor wird nicht automatisch Rechte-Owner. |
| C23-A16 | Grant widerrufen bei offener Sitzung. | Neue Requests abgewiesen, verbundener Client gemäß Budget gesperrt; schon exportierte Daten ausdrücklich nicht rückholbar. |
| C23-A17 | Einzelgrant entfernen, Gruppenrecht bleibt. | UI zeigt verbleibenden effektiven Zugriff; kein falsches „Zugang vollständig entzogen“. |
| C23-A18 | Linkvorschau oder Scanner ruft Einladung auf. | Keine Mutation, kein Inhaltsexport, keine automatische Annahme/Freigabe. |
| C23-A19 | Regel in Business kommentieren und in IT öffnen. | Derselbe Thread und dieselbe Ursprungsrevision; keine duplizierte Diskussion. |
| C23-A20 | Person ohne Zugang erwähnen. | Keine automatische Rechtevergabe oder sensible Benachrichtigung. |
| C23-A21 | Thread als erledigt markieren. | Keine Anforderung, Freigabe, Prüfung oder Transformation wird automatisch bestätigt. |
| C23-A22 | Kommentar zu bestätigter Regel übernehmen. | Explizite berechtigte Übernahme, Herkunft und neue Revision; gezielte Folgewirkung. |
| C23-A23 | Alten Beitrag editieren, zurückziehen oder moderieren. | Geschichte beziehungsweise erlaubter Löschvermerk bleibt; referenzierte Entscheidung wird nicht umgeschrieben. |
| C23-A24 | HTML, externes Bild oder Toolbefehl in Kommentar. | Sicheres Rendering, keine unkontrollierte Datenabgabe und keine vom Kommentar erteilten Ausführungsrechte. |
| C23-A25 | Kommentar gleichzeitig bearbeiten; Request doppelt senden. | Konflikt und Idempotenz verhindern Verlust oder doppelte verbindliche Handlung. |
| C23-A26 | Zwei Nutzer ändern bestätigungsrelevante Grundlagen. | Freigabe prüft den Serverstand; keine Zustimmung auf unbemerkt veralteter Basis. |
| C23-A27 | Auditjournal lokal nicht dauerhaft schreibbar. | Verbindliche Mutation wird nicht als erfolgreich bestätigt. Dauerhafte Outbox von externem Logexport unterschieden. |
| C23-A28 | Historischen Stand nach neuer Entscheidung öffnen. | Damalige Quellen, Kosten und Mandate bleiben; keine automatische Aktualisierung. |
| C23-A29 | Evidenz manipulieren oder Signaturumfang ändern. | Verifikation/Status erkennt die Abweichung; signierter Inhalt wird nicht als fachlich bewiesen überinterpretiert. |
| C23-A30 | Beschränkten Evidence-Auszug exportieren. | Eigener Scope und zulässiger Inhalt; keine versteckten Artefakte und keine vorgetäuschte Originalvollständigkeit. |
| C23-A31 | Transformation nach diskutierter, aber ungeprüfter Architekturänderung. | Verbindlicher Lauf bleibt am gültigen Vertrag beziehungsweise wird blockiert; Entwurf klar getrennt. |
| C23-A32 | Test auf anderem Codehash oder nur Simulation. | Kein View/Threadabschluss stellt produktive Prüfung des aktuellen Stands fest. |
| C23-A33 | Alte Frage nach Explore öffnen. | Historische Antwort ohne neuen Pflichtworkflow; echte Änderung wird gezielt angelegt. |
| C23-A34 | Fall/Benutzer löschen und alten Backupstand wiederherstellen. | Richtlinien zu Aufbewahrung, Datenentfernung und widerrufenen Grants bleiben wirksam. |
| C23-A35 | Shared-Lastprofil und häufige Viewwechsel testen. | Bestehende Budgets mit eingeschalteten Rechte-/Auditprüfungen messen; kein Content-/Fokus-/Entwurfsverlust. |
| C23-A36 | Verpflichtung nach Jira/ALM referenzieren und zurückspringen. | Stabile IDs, bezeichnetes führendes System, passender Code-/Entscheidungskontext; keine pauschale Sync-Behauptung. |

### Zusätzliche QA-Runde — QA24

| ID | Konkreter Abnahmefall | Erwartung |
|---|---|---|
| QA24-A01 | Alle aktiven Dokumente ohne Historie lesen/exportieren. | Eine eindeutige Produktdefinition, keine Pflichtfolge sieben isolierter Arbeitsplätze. |
| QA24-A02 | UX-E13-F03 alleine exportieren. | Historischer Kostensnapshot und C23-A23/A28/A30 bleiben enthalten. |
| QA24-A03 | Teilschnittgraph maschinell sortieren. | Keine fehlende Referenz, kein Zyklus, keine Abhängigkeit von späterem Gate. |
| QA24-A04 | Review gegen einen Build wiederholen. | Commit, Schema, Rules, Katalog und Deploymentbezug explizit erfasst. |
| QA24-A05 | Strittige SAP-Klassifikation prüfen. | Referenzrelease und freigegebene Sollregel belegt; fehlende Quelle bleibt offen. |
| QA24-A06 | Altprogramm mit Z-Persistenz, Standardkandidat unbekannt. | Kein automatisches „nicht abgedeckt“ allein aus alten Writes. |
| QA24-A07 | Empfehlung CAP, gültiger Vertrag unterstützt RAP. | Transformation und Testzuordnung folgen dem Vertrag oder erklären nicht unterstützten Weg. |
| QA24-A08 | Analyze/Brief/Export ohne Kostenannahmen öffnen. | Keine unbelegten Geldspannen oder prognostizierten Einsparungen; TCO-Wahrheit einheitlich. |
| QA24-A09 | Auto-Healing ändert Code oder Tests. | Neue Entwurfsrevision; alter Stand bleibt; Receipt nennt tatsächlich geprüfte Hashes. |
| QA24-A10 | Geschäftsregel liegt außerhalb erster 1.000 Zeichen. | Abdeckung korrekt oder konkrete Lücke; keine Vollständigkeit aus Ausschnitt. |
| QA24-A11 | R2-Gegenprobe schließen, Raum neu öffnen. | Quelle, Demoergebnis, Scope und Vorbehalte bleiben gespeichert und referenzierbar. |
| QA24-A12 | Direktclient, Server, Index und Export mit denselben Rollen prüfen. | Gleiche effektive Grenzen; keine autoritative Freigabe durch Clientfeld. |
| QA24-A13 | Berechtigung oder Quelle während Job ändern. | Vor Datenabgabe/Veröffentlichung erneut prüfen; kein still aktuelles Ergebnis aus altem Auftrag. |
| QA24-A14 | Ein Mitglied verlässt einen Teamraum; persönlicher Account wird entfernt. | Teamartefakte folgen Organisations-/Retentionpolicy, nicht blind einer persönlichen Löschkaskade. |
| QA24-A15 | Direktlink mit kaltem Renderer messen. | Download/Initialisierung zählen zum kalten Einstieg, nicht zum warmen Budget. |
| QA24-A16 | R1-Umfang planen. | Teilschnitte, Review und Betrieb separat geschätzt; Anzahl Elternfeatures ist keine Aufwandsgarantie. |
| QA24-A17 | Fingerprint vorhanden, Mandat oder Testnachweis fehlt. | Kein pauschal grüner Assurance-Status; Dimensionen getrennt. |
| QA24-A18 | Alt-/Neusystem mit denselben Fällen vergleichen. | Funktions- und Quellenparität sowie Teamaufwand gemessen; keine Marktüberlegenheit aus Dokumenttests. |

### Neue Abnahmefälle 2.5 — V25

| ID | Konkreter Abnahmefall | Erwartung |
|---|---|---|
| V25-A01 | Business-Narrativ eines Referenzfalls satzweise prüfen. | Jeder Satz trägt einen Zeilenanker oder ist als „unbelegt" markiert; die Traceability-Quote wird je Fall ausgewiesen. |
| V25-A02 | Objekt mit `classicAPI` und `notToBeReleased` (z. B. CL_HTTP_CLIENT) im Katalog öffnen. | Beide Sichten sichtbar; angewandte Vorrangregel, Regelversion und Korpusfall verlinkt; ATC als Autorität genannt. |
| V25-A03 | Decision Request per Link ohne Anmeldung öffnen und antworten. | Lesen des Kurzbriefs ist nach Anmeldung als Community-Mitglied möglich; die Antwort wird als Revision ohne Mandatswirkung übernommen; ein frei eingetippter Name hat keine Wirkung. |
| V25-A04 | Bench-Harness gegen Engine und ein Fremdwerkzeug laufen lassen. | Kennzahlen je Werkzeug mit Stand und Methodik; „nicht getestet" statt Unterlegenheit bei fehlendem Zugang. |
| V25-A05 | SCMON-Export mit 30-Tage-Fenster importieren; Objekt mit null Aufrufen. | Nutzung erscheint mit Fenster und Quelle; Stilllegung erhält Prüfauftrag „Fenster zu kurz", kein Nachweis der Nichtnutzung. |
| V25-A06 | Analyze, Brief und Export ohne Annahmenrevision öffnen. | Keine Geldwerte; Prompt enthält keine monetären Felder; Formelseite und Modul rechnen identisch. |
| V25-A07 | Override der Architektur vor 3.0 dokumentieren und transformieren. | UI kennzeichnet den Override als „dokumentiert, nicht wirksam"; der Generatorpfad wird nicht als vertragsgesteuert ausgegeben. |
| V25-A08 | Portfolio mit vertagten Fällen filtern. | Vertagte Fälle bleiben im Nenner; jede Kennzahl nennt Einheit, Nenner, Zeitraum, Abschlussart. |
| V25-A09 | Zahl in einer Seite hart ändern und bauen. | Copy-CI bricht mit Fundstelle; Seiten ohne Facts-Bindung werden nicht veröffentlicht. |
| V25-A10 | Startseite, Katalog, Referenz-Run, Whitepaper und `/facts` vergleichen. | Identische Objektzahl, Nachfolgerzahl, Sync-Daten, Hashes, Engine-Version; OG-URL je Seite korrekt; keine QA-Notizen im Text. |
| V25-A11 | Evidence Pack manipulieren und offline verifizieren. | Verifier erkennt Abweichung gegen den veröffentlichten Schlüssel; `covers[]` nennt den Signaturumfang; historische HMAC-Pakete behalten Status. |
| V25-A12 | Run ohne API-Key ausführen. | Findings, beide Level-Sichten, Nachfolger, Score, signiertes Pack vorhanden; kein externer Modellaufruf im Datenfluss; Narrativ als „nicht erzeugt". |
| V25-A13 | Self-Hosted Preview aufsetzen und Bench laufen lassen. | Deployment aus dem Runbook; Bench-Ergebnis identisch zur Cloud; keine Teamfunktionen ohne Abnahme. |
| V25-A14 | Changelog nach Repository-Update prüfen. | Neue released Objekte, Nachfolger und Statuswechsel mit beiden Hashes; ausgefallener Sync sichtbar; kein „weekly" ohne Log. |
| V25-A15 | Fall per MCP mit Scoped Token lesen; Token widerrufen; zweiten Fall anfragen. | Nur gewählte Scopes werden geliefert; Rohcode nur bei Scope; Widerruf wirkt sofort; fremder Fall liefert nichts; jeder Zugriff im Journal; virtuelle Rollen sind als Rollenspiel gekennzeichnet, keine Mitgliedsidentität wird herausgegeben. |
| V25-A16 | Fall allein in drei Rollen durchspielen und entscheiden; Spielfall aus dem Korpus öffnen. | Jeder Beitrag trägt die gespielte Rolle; die Entscheidung trägt `self_play: true` und den Text „Rollenspiel — kein organisatorisches Mandat"; der Spielfall ist als Spielfall gekennzeichnet; der Ground-Truth-Vergleich zeigt Level/Nachfolger-Abweichungen und bewertet die Entscheidung nicht als falsch. |

---

## Anhang B — Teilschnittgraph 2.7

76 Teilschnitte (74 aus 2.6 plus `UX-E01-F04:R1`, `UX-E01-F04:R2`): 60 aus der Fassung 2.4 abzüglich 4 zurückgezogener (`UX-E10-F01:3.1`, `UX-E09-F02:3.2`, `UX-E11-F03:R2`, `UX-E12-F02:3.2`), plus 18 aus 2.5/2.6 (2 zurückgezogen: `UX-E15-F02:R2`, `UX-E15-F02:3.0`). Maschinell geprüft: keine fehlende Referenz, keine Abhängigkeit von einem späteren Gate, kein Zyklus. Größenklassen sind Planungshypothesen.

| Teilschnitt | Nachweisbarer Umfang | Benötigt | Größe | Herkunft |
|---|---|---|---|---|
| `UX-E01-F04:R1` | „Playing as"-Umschalter, virtuelle Rolle am Beitrag, Self-Play-Kennzeichen | `UX-E01-F02:R1`, `UX-E11-F03:R1` | S | 2.7 |
| `UX-E01-F04:R2` | Spielfälle aus dem Referenzkorpus mit Ground-Truth-Vergleich | `UX-E01-F04:R1`, `UX-E12-F02:R0` | M | 2.7 |
| `G0:R0` | Fachliche/Sicherheitsblocker des angebotenen Pfads kennen und beheben oder Funktion begründet sperren | — | M | 2.4 |
| `UX-E01-F01:R1` | Code-zentrierter Einstieg vor, während und nach Explore | `UX-E02-F01:R1` | M | 2.4 |
| `UX-E01-F02:R1` | Gemeinsamer Artefaktarbeitsraum mit identitätserhaltendem View-Wechsel | `UX-E02-F01:R1` | L | 2.4 |
| `UX-E01-F03:R1` | Views, Layer und semantisches Zoom mit fachlicher und technischer Tiefe | `UX-E01-F02:R1` | M | 2.4 |
| `UX-E02-F01:R0` | Kanonischer Referenz-/Manifestvertrag und verträgliche Migration | `G0:R0` | M | 2.4 |
| `UX-E02-F01:R1` | Bedienbarer Fallzuschnitt mit Scope, Quellen und stabiler Auswahl | `UX-E02-F01:R0` | L | 2.4 |
| `UX-E02-F02:R1` | Einstieg ohne Code und nachträgliche Quellenanreicherung | `UX-E02-F01:R1` | S | 2.4 |
| `UX-E02-F03:R2` | Scope- und Nutzungs-Blindspots als konkrete Prüfaufträge | `UX-E02-F01:R1`, `UX-E03-F01:R1` | M | 2.4 |
| `UX-E03-F01:R1` | Anforderungen mit Herkunft, Scope und Pflichtgrad | `UX-E02-F01:R1` | M | 2.4 |
| `UX-E03-F02:R2` | Beibehalten, bewusst ändern oder entfallen lassen | `UX-E03-F01:R1` | M | 2.4 |
| `UX-E03-F03:R1` | Quellengebundener Kurzbrief und Regeln, keine ungestützten Geldbeträge | `UX-E03-F01:R1`, `UX-E01-F03:R1` | M | 2.4 |
| `UX-E03-F03:R2` | Vertiefter Prozess-/BPMN-/Regelraum mit Varianten und Business-Einstieg | `UX-E03-F01:R1`, `UX-E01-F03:R1`, `UX-E03-F03:R1` | L | 2.4 |
| `UX-E04-F01:R2` | Abdeckungsbehauptung mit expliziter Evidenzstufe | `UX-E03-F01:R1` | L | 2.4 |
| `UX-E04-F02:R2` | Kleine aussagekräftige Standard-Gegenprobe | `UX-E04-F01:R2`, `UX-E03-F02:R2` | M | 2.4 |
| `UX-E04-F03:R2` | Persistente Referenz und Ergebnisaufnahme für jede entscheidungsrelevante Gegenprobe | `UX-E04-F01:R2`, `UX-E04-F02:R2` | M | 2.4 |
| `UX-E04-F03:3.0` | Validierung, geeignete Archivierung und kontrollierte Übernahme von Evidenz | `UX-E04-F01:R2`, `UX-E04-F02:R2`, `UX-E04-F03:R2` | M | 2.4 |
| `UX-E05-F01:R1` | Basisthreads, Direktanker, sichere Erwähnung und expliziter Abschluss | `UX-E02-F01:R1`, `UX-E11-F03:R1` | M | 2.4 |
| `UX-E05-F01:R2` | Gezielte fachliche Anfrage, Vorschlagsübernahme und verknüpfte Gegenprobe | `UX-E05-F01:R1`, `UX-E03-F03:R2`, `UX-E04-F02:R2` | M | 2.4 |
| `UX-E05-F02:R2` | Gemeinsame Optionsentscheidung mit früher TCO-Simulation | `UX-E04-F01:R2`, `UX-E03-F02:R2`, `UX-E13-F01:R1` | L | 2.4 |
| `UX-E05-F03:3.0` | Mandatierte gemeinsame Entscheidung mit Kosten- und Belegrevision | `UX-E05-F01:R2`, `UX-E05-F02:R2`, `UX-E11-F03:3.0`, `UX-E13-F02:R2` | L | 2.4 |
| `UX-E06-F01:R0` | Erhaltungsregister, unterstützter Baseline-Scope und kritische Referenzfälle | `G0:R0` | M | 2.4 |
| `UX-E06-F01:R1` | Ein-/Ausgabeverträge und vorhandene kontextfähige Adapter | `UX-E06-F01:R0`, `UX-E02-F01:R1`, `UX-E11-F03:R1` | L | 2.4 |
| `UX-E06-F01:3.0` | Alle sieben Fähigkeiten im veröffentlichten Kernscope ohne parallele Wahrheiten | `UX-E06-F01:R1`, `UX-E05-F03:3.0`, `UX-E07-F01:3.0` | XL | 2.4 |
| `UX-E06-F02:R2` | Living Documentation aus gemeinsamen Fall- und Entscheidungsdaten | `UX-E03-F01:R1`, `UX-E01-F02:R1` | L | 2.4 |
| `UX-E06-F03:R2` | Nächster Beitrag mit erklärtem Grund | `UX-E01-F01:R1`, `UX-E03-F01:R1` | M | 2.4 |
| `UX-E07-F01:3.0` | ArchitectureContract als gemeinsame Generierungseingabe | `UX-E05-F03:3.0` | L | 2.4 |
| `UX-E07-F02:3.0` | Fachliches Prozessdelta und technische Schichten derselben Option | `UX-E07-F01:3.0`, `UX-E03-F02:R2`, `UX-E01-F03:R1` | M | 2.4 |
| `UX-E07-F03:R0` | Vertrag für exakte Inputbindung und konservative Ungültigkeit | `UX-E02-F01:R0` | S | 2.4 |
| `UX-E07-F03:R1` | Schutz geteilter Änderungen und verzögert eintreffender Aufträge | `UX-E07-F03:R0`, `UX-E02-F01:R1`, `UX-E11-F03:R1` | M | 2.4 |
| `UX-E07-F03:3.0` | Bindung von Freigabe, Auto-Healing, Prüfling und Testrevision | `UX-E07-F03:R1`, `UX-E07-F01:3.0`, `UX-E08-F02:3.0` | M | 2.4 |
| `UX-E07-F03:3.3` | Feingranulare fachliche Auswirkungsanalyse mit weniger unnötiger Wiederprüfung | `UX-E07-F03:3.0` | L | 2.4 |
| `UX-E08-F01:R2` | Szenario aus bestätigtem Zielbedarf statt reinem Altcode | `UX-E03-F02:R2`, `UX-E04-F02:R2` | M | 2.4 |
| `UX-E08-F02:R2` | Dauerhafter Demo-/Prüfbeleg mit Scope, Quelle, Zustand und Einschränkung | `UX-E08-F01:R2`, `UX-E04-F03:R2`, `UX-E11-F03:R1` | M | 2.4 |
| `UX-E08-F02:3.0` | Ausführungsreceipt mit Code-/Testsuite-/Umgebungsbindung und Reparaturhistorie | `UX-E08-F02:R2`, `UX-E07-F01:3.0` | L | 2.4 |
| `UX-E08-F03:3.0` | Explore-Reife, Umsetzungsabnahme und Betrieb separat | `UX-E06-F01:R1`, `UX-E08-F02:3.0` | M | 2.4 |
| `UX-E09-F01:3.0` | Quellengebundene Übergabe, Evidence Pack und historischer Belegzugang | `UX-E05-F03:3.0`, `UX-E06-F02:R2`, `UX-E08-F03:3.0` | L | 2.4 |
| `UX-E09-F02:3.0` | Begrenzter Export und manuelle externe Referenz mit stabilen IDs | `UX-E09-F01:3.0`, `UX-E11-F03:3.0` | S | 2.4 |
| `UX-E09-F03:3.0` | Getrennte einfache Übernahmebestätigung zum Übergabemanifest | `UX-E09-F01:3.0`, `UX-E08-F02:3.0` | S | 2.4 |
| `UX-E09-F03:3.5` | Beobachtete Wirkung, Betriebsübergang und kontrollierte Wiedereröffnung | `UX-E09-F03:3.0`, `UX-E10-F03:3.3` | M | 2.4 |
| `UX-E10-F02:3.4` | Community-Musterbibliothek: anonymisierte Muster nach Review, CC-BY | `UX-E04-F03:3.0`, `UX-E07-F03:3.3` | M | 2.6 |
| `UX-E10-F03:3.3` | Änderung an Zielkontext oder Beleg als gezielte Wiedervorlage | `UX-E07-F03:3.3`, `UX-E04-F01:R2` | M | 2.4 |
| `UX-E11-F01:R1` | Tastatur, lesbare Kernansichten, Kontext/Fokus und Mobilbasis | `UX-E01-F02:R1` | M | 2.4 |
| `UX-E11-F01:3.0` | Accessibility-Abnahme sämtlicher angebotenen kritischen Pfade | `UX-E01-F02:R1`, `UX-E11-F01:R1` | M | 2.4 |
| `UX-E11-F02:R1` | Speichern, Unterbrechen und Konflikte ohne Informationsverlust | `UX-E02-F01:R1` | M | 2.4 |
| `UX-E11-F03:R0` | Autorisierungs-/Mandats-/Speicherkonzept und negative Referenzfälle | `UX-E02-F01:R0` | M | 2.4 |
| `UX-E11-F03:R1` | Benannte interne Fallfreigabe auf beiden Datenpfaden, Widerruf und Journal | `UX-E11-F03:R0`, `UX-E02-F01:R1` | L | 2.4 |
| `UX-E11-F03:3.0` | Entscheidungen und Freigaben als signierte Commands mit virtueller Rolle und Self-Play-Kennzeichen; Ausführungs-/Exportbefugnisse | `UX-E11-F03:R1` | M | 2.6 |
| `UX-E12-F01:R1` | Reproduzierbare Bestands-/Performance-Baseline und erster Mehrrollen-Beobachtungslauf | `UX-E01-F02:R1`, `UX-E03-F01:R1` | M | 2.4 |
| `UX-E12-F01:R2` | Gesamter Aufwand und Fehlentscheidungen der Gegenprobe | `UX-E01-F02:R1`, `UX-E03-F01:R1`, `UX-E12-F01:R1` | M | 2.4 |
| `UX-E12-F01:3.0` | End-to-End-Teamabnahme und getrennter Produkt-/Dokument-Testbericht | `UX-E01-F02:R1`, `UX-E03-F01:R1`, `UX-E12-F01:R2` | L | 2.4 |
| `UX-E12-F02:3.0` | Fachlicher Referenzkorpus und fairer Vergleich des unterstützten Kernfalls | `UX-E04-F02:R2`, `UX-E08-F03:3.0`, `UX-E12-F01:3.0` | L | 2.4 |
| `UX-E12-F03:3.5` | Manuell erfasste Istwerte mit Quelle und Fenster (kein Betriebsanschluss) | `UX-E09-F03:3.5` | S | 2.6 |
| `UX-E13-F01:R1` | TCO-Grundlage direkt in Entscheiden | `UX-E02-F01:R1`, `UX-E03-F01:R1` | M | 2.4 |
| `UX-E13-F02:R2` | Optionssimulation und entscheidungsrelevante Sensitivität | `UX-E13-F01:R1`, `UX-E05-F02:R2` | M | 2.4 |
| `UX-E13-F03:3.0` | Entscheidung bindet geprüfte Kostenrevision; Historie unverändert | `UX-E13-F02:R2`, `UX-E05-F03:3.0` | M | 2.4 |
| `UX-E13-F03:3.5` | Getrennte, manuell erfasste Ist-/Wirkungsdaten ohne rückwirkende Änderung | `UX-E13-F02:R2`, `UX-E05-F03:3.0`, `UX-E13-F03:3.0` | M | 2.6 |
| `UX-E13-F01:R0` | Monetäre Prompt-Felder entfernt; Anzeigen „nicht ermittelt" ohne Annahmenrevision | `G0:R0` | S | 2.5 |
| `UX-E05-F03:R2` | Decision Request mit verifizierter Identität, ohne Mandatswirkung | `UX-E05-F02:R2`, `UX-E11-F03:R1` | M | 2.5 |
| `UX-E12-F02:R0` | Fachlicher Referenzkorpus v1 (25 Fälle, Ground Truth, Regelversion, SAP-Primärquellen, externer Fach-Review) | `G0:R0` | M | 2.5 |
| `UX-E14-F01:R0` | Facts-Service, Copy-CI, Korrektur der öffentlichen Aussagen (Audit-P0/P1) | `G0:R0` | M | 2.5 |
| `UX-E14-F01:R1` | Migrationssichtbarkeit und Override-Status „nicht wirksam" auf der Site | `UX-E14-F01:R0`, `UX-E06-F01:R1` | S | 2.5 |
| `UX-E14-F02:R0` | Level-Regelseite mit beiden Sichten; Score umbenannt mit Formel | `UX-E14-F01:R0` | M | 2.5 |
| `UX-E14-F02:R2` | Economics-Formelseite identisch zum Modul | `UX-E14-F02:R0`, `UX-E13-F02:R2` | S | 2.5 |
| `UX-E14-F03:3.0` | Öffentlicher Ed25519-Schlüssel und Offline-Verifier | `UX-E09-F01:3.0` | M | 2.5 |
| `UX-E14-F04:R2` | Bench-Harness intern; Korpus v1 gegen Engine gelaufen | `UX-E12-F02:R0` | M | 2.5 |
| `UX-E14-F04:3.0` | Bench veröffentlicht mit mindestens einem Fremdvergleich | `UX-E14-F04:R2`, `UX-E12-F02:3.0` | L | 2.5 |
| `UX-E14-F05:3.1` | Vergleichsseiten (öffentliche Positionierung), deutsche Kernseiten, Entity-Hygiene | `UX-E14-F01:R0` | L | 2.5 |
| `UX-E15-F01:R0` | Zero-LLM-Grundmodus als Sperrpfad bis zum signierten Evidenzstand | `G0:R0` | S | 2.5 |
| `UX-E15-F01:R2` | Zero-LLM-Run mit Gegenprobe und Economics; Lücken in der Coverage-Matrix | `UX-E15-F01:R0`, `UX-E02-F01:R1` | M | 2.5 |
| `UX-E15-F03:3.5` | Provider-Abstraktion und Multi-Provider-BYOK mit Bench-Äquivalenz | `UX-E15-F01:R2`, `UX-E12-F02:3.0` | L | 2.5 |
| `UX-E16-F01:R2` | Importe ATC, Kernseife, SCMON/UPL/ST03N mit Abgleich und Beobachtungsfenster | `UX-E02-F01:R1`, `UX-E03-F01:R1` | L | 2.5 |
| `UX-E16-F02:3.0` | Open Evidence Format v1 mit Validator, Exporter und zwei Importern | `UX-E09-F01:3.0`, `UX-E16-F01:R2` | M | 2.5 |
| `UX-E16-F03:3.1` | MCP für Corporates (Katalog öffentlich, Fall mit Scoped Tokens, lesend), Katalog-API | `UX-E14-F01:R0`, `UX-E16-F02:3.0`, `UX-E14-F03:3.0` | L | 2.6 |
| `UX-E16-F03:3.2` | Cloudification-Changelog mit RSS; Integrationsrezepte Claude Code / ADT-MCP / Copilot | `UX-E16-F03:3.1` | M | 2.6 |

---

## Anhang C — Glossar (Ergänzungen 2.5)

- **Facts-Service** — eine versionierte Datei mit allen öffentlichen Zahlen und Regelständen; jede Seite rendert daraus.
- **Copy-CI** — Build-Prüfung auf Marker-Phrasen, hartcodierte Zahlen, OG/Canonical, tote Links und Texte außerhalb der gemeinsamen Komponenten.
- **Level-Regelseite** — öffentliche Dokumentation der A–D-Ableitung mit ABAP-Cloud-Sicht, Klassik-Sicht, Vorrangregel, Beispielen und Regelversion.
- **Referenzkorpus / Clean Core Bench** — synthetische Legacy-Programme mit Ground Truth (Findings je Zeile, Nachfolger mit Typ, Level in beiden Sichten, Hand-Work, Business-Sätze mit Ankern); intern ab R0, öffentlich ab 3.0.
- **Decision Request** — Antwortweg für Prozesseigner per Link mit Anmeldung als Community-Mitglied; erzeugt eine Revision, kein Mandat.
- **Zero-LLM-Modus** — deterministischer Lauf ohne Modellaufruf bis zum signierten Evidenzstand; LLM-Stufen einzeln zuschaltbar.
- **Fall-MCP / Scoped Token** — lesender MCP-Zugang auf genau einen Fall mit gewählten Scopes, vom Fallbesitzer erzeugt, ablaufend, widerrufbar, protokolliert; der Corporate-Weg ohne Enterprise-Betrieb.
- **Virtuelle Rolle** — Hut aus einer festen Liste, den das eingeloggte Mitglied pro Beitrag wählt („Playing as"); am Beitrag gespeichert, nie am Konto; im Evidence Pack als *Rollenspiel — kein organisatorisches Mandat* gekennzeichnet.
- **Self-Play** — dasselbe Mitglied spielt mehrere Rollen eines Falls; Entscheidungen tragen `self_play: true`.
- **Spielfall** — Fall aus dem Referenzkorpus mit Ground Truth, zum Üben des Entscheidungsflusses ohne eigenen Code.
- **Datensparsamkeit** — Konto = E-Mail + Handle; keine Namens-, Firmen-, Positions- oder Profilrollenfelder; Exporte und MCP ohne Mitgliedsidentitäten.
- **Open Evidence Format** — versioniertes JSON-Schema zum Austausch von Findings, Nachfolgern, Levels, Nutzung, Routen, CoverageAssertions, Entscheidungen und Attestationen.
- **Traceability-Quote** — Anteil der Sätze eines Business-Narrativs mit Zeilenanker; USP-Messgröße.

**Nächster freizugebender Auftrag:** Schnitt 0 (Belegt) in der Reihenfolge aus `clean-core-roadmap-v2_5.md`, Abschnitt 11; danach Schnitt A.
