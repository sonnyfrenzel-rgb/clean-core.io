# Konzept: Einsicht per Einladung

**Stand 16.09.2026 · Konzeptteil von Roadmap-Schritt 0.7 · nichts davon ist gebaut**

`docs/ROADMAP.md` (Fassung 2.8) legt die Form fest, und nur diese Form:

> **Sharing = read access by invitation**: a link bound to one confirmed e-mail
> address, including source code, with expiry and revocation.

Dieses Dokument beschreibt, was das heisst, wenn man es baut: was der Eingeladene
sieht, wie die Bindung an eine Adresse bewiesen wird, wie Ablauf und Widerruf
wirken, was aufgezeichnet wird, welcher Satz der Datenschutzerklaerung sich
dadurch aendert und was es kostet. Es ist ein Entwurf zur Entscheidung, keine
Zusage. Schritt 0.7 baut davon nichts.

**Was ausdruecklich nicht dazugehoert** (`docs/ROADMAP.md`, Fassung 2.8, Zeile
0.7 — sie schlaegt den aelteren Text in `docs/roadmap/SCHNITT-0-UMFANG.md` §8):
Rechtestufen (Lesen / Kommentieren / Bearbeiten), ein Rohcode-Schalter und
virtuelle Rollen. Es gibt genau eine Stufe: Lesen, mit Quelltext. Der Abschnitt
„Datensparsamkeit" ist ebenfalls gestrichen; am Konto aendert sich nichts.

---

## 1. Was es ist

Der Besitzer eines Projekts laedt **eine** Person ein, indem er **eine**
E-Mail-Adresse eintraegt. Diese Person bekommt einen Link. Wer den Link oeffnet
und nachweist, dass er diese Adresse kontrolliert, sieht das Projekt — lesend,
vollstaendig, einschliesslich des hochgeladenen ABAP.

Was es nicht ist:

- **Kein Konto.** Der Eingeladene registriert sich nicht, wird kein Mitglied,
  bekommt kein Kontingent und taucht in keiner Mitgliederliste auf. Anmeldung und
  Konto bleiben unveraendert — das ist eine Regel der Roadmap, keine Vorliebe.
- **Kein oeffentlicher Link.** Ein Link ohne die zugehoerige Adresse ist wertlos.
  Weitergeleitet nuetzt er niemandem.
- **Keine Zusammenarbeit.** Kein Kommentar, keine Aenderung, kein zweiter
  Schreiber. Das Projekt hat weiterhin genau einen Besitzer.

## 2. Was der Eingeladene sieht — und was nicht

**Er sieht**, in einer eigenen, nur lesenden Ansicht:

- den hochgeladenen Quelltext,
- den signierten Lauf: Befunde, beide Level-Sichten, Nachfolger, Score, Manifest,
- die abgeleiteten Artefakte, die es gibt (Entwurf, generierter Code,
  Dokumentation, Testfaelle, Economics, Delivery-Stand),
- die Freigabefelder als das, was sie sind: eine Selbsterklaerung des
  angemeldeten Kontos, mit Adresse und Zeitpunkt,
- die Hinweise auf Veralterung, wenn die Quelle sich nach dem Lauf geaendert hat,
- das signierte Audit-Pack zum Herunterladen.

**Er sieht nicht:**

- andere Projekte desselben Besitzers — die Einladung gilt fuer genau eines,
- das Profil des Besitzers ausser der Adresse, die auf der Freigabe steht,
- irgendetwas, das ein Schreiben ausloest: keine Analyse starten, kein Modell
  aufrufen, keinen Export signieren lassen, kein Feld aendern. Jede Schaltflaeche,
  die etwas schreibt, ist in dieser Ansicht nicht vorhanden — nicht ausgegraut,
  sondern nicht gerendert, und die Serverrouten lehnen sie zusaetzlich ab.
- den Zugang selbst: er kann nicht weiterverteilen, nicht verlaengern, nicht
  widerrufen.

**Entscheidung, die dahintersteckt:** die Ansicht ist ein eigener Renderpfad, kein
Schalter in den sieben bestehenden Stufen. Die Stufenseiten sind fuer einen
angemeldeten Besitzer mit Firestore-Lesezugriff geschrieben (`getDb()`,
`loadProjectAndHydrate`), und ein `isReadOnly`-Flag durch sieben Seiten zu ziehen
hiesse, sich auf sieben Seiten darauf zu verlassen, dass niemand eine
Schaltflaeche vergisst. Der teure Teil dieses Konzepts ist genau das (siehe §7).

## 3. Die Bindung an eine bestaetigte Adresse

Der Link traegt einen zufaelligen, undurchsichtigen Token (32 Byte, nur der Hash
wird gespeichert — wie ein Passwort, nicht wie eine ID). Der Token allein oeffnet
nichts.

**Der Nachweis** laeuft ueber die eingeladene Adresse selbst:

1. Der Besucher oeffnet den Link. Die Seite fragt nach nichts als einem Klick auf
   „Code anfordern".
2. Der Server schickt an die **eingeladene** Adresse — nie an eine, die der
   Besucher eintippt — einen sechsstelligen Einmalcode mit kurzer Lebensdauer
   (10 Minuten, hoechstens fuenf Versuche, danach ist die Einladung gesperrt und
   der Besitzer wird benachrichtigt).
3. Mit dem richtigen Code entsteht eine **Lesesitzung**: ein serverseitig
   signiertes, kurzlebiges Cookie (30 Minuten, verlaengerbar durch Weiterlesen,
   Hoechstdauer 8 Stunden), das genau auf diese Einladung und dieses Projekt
   lautet. Kein Firebase-Konto, kein ID-Token, kein Eintrag in `users`.

Wer bereits ein Clean-Core-Konto mit genau dieser bestaetigten Adresse hat, kann
sich stattdessen anmelden; der Server vergleicht die verifizierte Adresse des
Tokens mit der eingeladenen. Das ist eine Bequemlichkeit, kein zweiter Weg mit
anderen Rechten.

**Warum der Umweg ueber den Code:** ohne ihn ist der Link die Berechtigung, und
ein Link, der in einem weitergeleiteten Postfach oder einem Ticketsystem landet,
ist dann der Zugang zum Quelltext eines Kunden. Der Code macht den Unterschied
zwischen „wer den Link hat" und „wer die Adresse hat".

**Was dabei nicht passiert:** die Firestore-Regeln aendern sich nicht. Der
Eingeladene liest nie direkt aus Firestore. Alles geht ueber eine Serverroute,
die die Einladung prueft und die Daten mit dem Admin-SDK holt. Das ist
ausdruecklich Absicht: ein Freigabefeld wie `sharedWith` auf dem Projektdokument
waere entweder client-schreibbar (dann kann sich der Browser selbst einladen) oder
es waere ein weiteres Admin-SDK-Feld, fuer das die Regeln trotzdem eine zweite
Lesebedingung braeuchten. Kein neues Feld in den Regeln ist die kleinere
Angriffsflaeche — und es erspart einen manuellen Regel-Deploy.

## 4. Ablauf, Widerruf — und der bereits geoeffnete Link

- **Ablauf.** Jede Einladung hat ein Ablaufdatum. Vorgabe 14 Tage, Hoechstwert 90
  Tage, vom Besitzer beim Einladen waehlbar. Nach Ablauf antwortet die Route auf
  jeden Zugriff mit „abgelaufen" und nennt keinen Inhalt, auch keinen Projektnamen.
- **Widerruf.** Der Besitzer sieht in seinem Projekt eine Liste der Einladungen
  (Adresse, Ablauf, zuletzt geoeffnet) und kann jede sofort entziehen. Der
  Widerruf setzt `revokedAt`; **jede** Route prueft das bei **jedem** Aufruf, nicht
  nur beim Anmelden. Eine laufende Lesesitzung endet damit beim naechsten Klick.
- **Loeschung des Projekts** widerruft alle seine Einladungen mit.
- **Konto geloescht** widerruft alle Einladungen des Besitzers mit.

**Was mit einem bereits geoeffneten Link geschieht** — die Frage, bei der man
ehrlich sein muss:

Ein Widerruf beendet den Zugriff, nicht die Erinnerung. Was der Eingeladene
bereits gesehen, kopiert oder heruntergeladen hat, ist bei ihm. Ein Audit-Pack,
das er geladen hat, bleibt bei ihm; es ist signiert und bleibt es. Technisch
heisst Widerruf:

- die offene Seite zeigt beim naechsten Datenzugriff (spaetestens nach 30
  Minuten, bei jedem Klick sofort) „Der Zugang wurde entzogen" und nichts sonst,
- kein weiterer Download, kein erneutes Laden, kein Weiterblaettern,
- der Einmalcode-Weg fuehrt nicht mehr zu einer neuen Sitzung.

Dieser Absatz gehoert so auch in die Oberflaeche, an die Stelle, an der der
Besitzer einlaedt. Wer einlaedt, soll wissen, dass er etwas hergibt, das er
zurueckziehen, aber nicht ungeschehen machen kann.

## 5. Was aufgezeichnet wird

Serverseitig, ueber das Admin-SDK, in einer Sammlung, die kein Client liest oder
schreibt (wie `audit_events`, `consent_events`, `email_events` heute):

| Ereignis | Festgehalten |
|---|---|
| Einladung erstellt | Projekt, Besitzer-UID, eingeladene Adresse, Ablaufdatum, Zeitpunkt |
| Code angefordert | Einladung, Zeitpunkt (die Adresse steht schon in der Einladung) |
| Code falsch | Einladung, Zeitpunkt, Zaehler; beim fuenften Mal Sperre + Mail an den Besitzer |
| Zugang geoeffnet | Einladung, Zeitpunkt |
| Audit-Pack geladen | Einladung, Zeitpunkt, `runId` |
| Widerrufen / abgelaufen | Einladung, Zeitpunkt, durch wen |

Der Besitzer sieht davon: Adresse, Ablauf, „zuletzt geoeffnet", „entzogen". Mehr
braucht er nicht, und mehr ueber eine Person zu fuehren, die kein Konto hat, waere
schwer zu begruenden.

**Aufbewahrung.** Einladungen und ihr Protokoll werden 12 Monate nach Ablauf oder
Widerruf geloescht; `docs/DATA-RETENTION.md` bekommt dafuer eine Zeile. Die
Adresse des Eingeladenen ist ein personenbezogenes Datum eines Menschen, der hier
kein Konto hat — sie darf nicht laenger liegen als noetig.

**Was nicht aufgezeichnet wird:** keine IP-Adresse, kein User-Agent, kein
Lesefortschritt, keine Verweildauer. Es gibt kein Tracking im Produkt, und eine
Einladung ist kein Anlass, damit anzufangen.

## 6. Was die Datenschutzerklaerung dann sagen muesste

Ein Satz wird falsch, in dem Moment, in dem die erste Einladung verschickt werden
kann. `app/datenschutz/page.tsx`, §8 „Who Can Open Your Projects", Anker
`#project-access`, letzter Absatz:

> „**There is no sharing feature today:** no other user can be granted access to
> your project, and we do not pass project content to anyone other than the
> subprocessors named in section 4."

Der erste Halbsatz muss weg und durch die Beschreibung ersetzt werden. Der zweite
Halbsatz bleibt richtig und wichtig: wir geben nichts weiter — der Besitzer gibt
etwas frei.

Vorgeschlagene Ersetzung, sinngemaess: Ausser dem Besitzer kann genau die Person
ein Projekt lesen, die der Besitzer selbst per E-Mail-Adresse eingeladen hat; sie
weist diese Adresse mit einem Einmalcode nach, sieht das Projekt einschliesslich
Quelltext nur lesend, und der Besitzer kann die Einladung jederzeit entziehen. Sie
laeuft ausserdem von selbst ab. Wir speichern dazu die eingeladene Adresse und
wann der Zugang genutzt wurde, und loeschen beides 12 Monate nach Ablauf oder
Widerruf.

Ausserdem betroffen:

- **§4 Subprocessors** — Resend steht schon dort; die Einladungs- und Code-Mails
  gehen denselben Weg und brauchen keinen neuen Eintrag, wohl aber eine
  Erwaehnung, dass auch Nicht-Nutzer Mails von uns bekommen koennen.
- **Nutzungsbedingungen** — wer einlaedt, gibt Quelltext an einen Dritten. Ein
  Satz, dass der Besitzer dafuer verantwortlich ist, wen er einlaedt, gehoert in
  §5/§8.
- **`components/TrustBeforeUpload.tsx`** (Karte „Your code and your trust",
  Schritt 0.11) — die Zeile „Zugriff nur fuer das Konto" stimmt dann nicht mehr
  ohne Zusatz. Der Guard aus 0.11 prueft, dass jede Zeile der Karte von Terms,
  Datenschutzerklaerung oder `SECURITY.md` getragen wird; er wird rot, und das ist
  die gewuenschte Wirkung.
- **`SECURITY.md`** — das Zugriffsmodell bekommt den zweiten Lesepfad.

**Reihenfolge:** die Texte zuerst, die Funktion danach. Eine Datenschutzerklaerung,
die „es gibt kein Teilen" sagt, waehrend das Teilen live ist, ist ein
Dokumentationsfehler mit Rechtsfolge, kein Schoenheitsfehler.

## 7. Was es kostet

Geschaetzt in Arbeitstagen, in der Groessenordnung, in der die Roadmap rechnet.
Die Zahlen sind eine Schaetzung und keine Zusage.

| Teil | Tage | Warum |
|---|---|---|
| Datenmodell + Serverrouten (Einladung anlegen, widerrufen, auflisten; Code anfordern, Code pruefen; Lesesitzung; Leseroute fuer Projekt und Lauf) | 3–4 | Sechs Routen, alle mit Ratenlimit, alle mit demselben Ablauf-/Widerrufscheck; der Token wird gehasht gespeichert |
| Mailversand (Einladung + Einmalcode) | 0,5–1 | Die Mechanik steht: `lib/email-layout.ts`, Resend, Outbox mit Idempotenzschluessel aus 0.16. Zwei Vorlagen, zwei Betreffzeilen |
| Leseansicht | 3–4 | **Der teure Teil.** Ein eigener Renderpfad, der aus denselben Daten dieselben Abschnitte zeigt, aber keine Schaltflaeche besitzt, die schreibt. Die sieben Stufenseiten sind fuer den Besitzer geschrieben und lesen selbst aus Firestore |
| Oberflaeche beim Besitzer (einladen, Liste, entziehen, der ehrliche Hinweis aus §4) | 1 | Ein Abschnitt im Projekt |
| Tests | 2 | Der Link ohne die Adresse bekommt nichts · falscher Code fuenfmal sperrt · abgelaufen zeigt nicht einmal den Namen · Widerruf wirkt beim naechsten Zugriff, nicht erst beim naechsten Anmelden · der Eingeladene kann keine Schreibroute aufrufen (der Katalog aus `tests/helpers/gated-routes.ts` als Vorlage) · das Projekt eines Dritten bleibt zu |
| Rechtstexte, Trust-Karte, `SECURITY.md`, `DATA-RETENTION.md` | 0,5 | Siehe §6 |
| **Summe** | **10–12,5** | In den Groessen der Roadmap: **L**. Das ist kein Schritt, das sind zwei bis drei |

**Was es nicht kostet:** keinen Regel-Deploy (§3), keine Aenderung an Anmeldung
oder Konto, keine neue Abhaengigkeit.

**Die billigere Haelfte, falls die Zeit nicht reicht:** das signierte Audit-Pack
gibt es bereits, und wer es bekommt, kann es mit `/verify-pack` selbst pruefen,
ohne Konto und ohne Einladung. Es ist nicht dasselbe — es enthaelt nicht den
Quelltext und nicht die Oberflaeche —, aber es ist der Teil, der heute schon
weitergegeben werden kann, und er deckt den haeufigsten Anlass ab: jemandem das
Ergebnis zeigen. Wer den Quelltext zeigen will, braucht die Einladung.

## 8. Offene Entscheidungen

Drei Punkte, die eine Entscheidung brauchen, bevor gebaut wird:

1. **Wie viele Einladungen je Projekt?** Vorschlag: hoechstens drei gleichzeitig
   aktive. Eine Grenze, die man spaeter anheben kann, ist leichter als eine, die
   man einfuehren muss.
2. **Darf der Eingeladene das Audit-Pack herunterladen?** Vorschlag: ja — es ist
   das Ergebnis, es ist signiert, und es zurueckzuhalten waere eine Rechtestufe
   durch die Hintertuer, die Fassung 2.8 gerade gestrichen hat.
3. **Was steht in der Einladungsmail?** Der Projektname verraet unter Umstaenden
   mehr, als der Besitzer beabsichtigt (Kundenname im Titel). Vorschlag: der
   Besitzer sieht beim Einladen, was in der Mail stehen wird, und kann eine
   neutrale Bezeichnung waehlen.
