# Mail-Seed-Test (Roadmap 3.0.9)

„Erst messen, dann drehen": Bevor an DKIM, Subdomains, Absendernamen oder
Tracking gedreht wird, geht **jede Mail, die das Produkt verschickt**, einmal an
eine Handvoll Seed-Postfächer (Gmail, Outlook, GMX/web.de, T-Online, optional
mail-tester.com) — und das Ergebnis (Posteingang, Werbung, Spam, Quarantäne,
nicht angekommen) wird je Mail-Typ und Anbieter festgehalten. Vor jedem Dreh an
einem Hebel und vor jeder Kampagne wieder, nicht einmal.

Werkzeug: `scripts/mail-seed-test.ts` (Logik in `scripts/lib/mail-seed.ts`,
Specs in `tests/mail-seed-test.spec.ts`).

## Was gemessen wird

Die echte Mail, nicht eine ähnliche. Jeder Typ übernimmt den Resend-Aufruf
seiner Produktionsstelle Feld für Feld: Absender, `reply_to`, HTML aus der
echten Vorlage, Textteil, `List-Unsubscribe`/`List-Unsubscribe-Post` (nur die
Umfrage). Einziger
Unterschied: der Empfänger und ein Präfix im Betreff,
`[Seed 3.0.9 <typ> <run-id>] <Original-Betreff>`.

`npx tsx scripts/mail-seed-test.ts --list-types` zeigt die Typen mit Quelle.
Stand 24.09.2026: `welcome`, `welcome-approval`, `invitation`,
`address-confirmation`, `tenant-pending`, `tenant-approval`, `tenant-revoke`,
`survey` (an Nutzer) sowie `admin-signup`, `tenant-request`, `survey-digest`,
`usage-report`, `security-alert` (an den Betreiber). Eine Spec prüft, dass jede
Stelle im Code, die an Resend sendet, als Typ vorkommt.

## Was nicht passiert

- Kein Firestore-Zugriff, kein Outbox-Eintrag, keine Unsubscribe-Registrierung,
  kein Nutzer-Ereignis. `sendTransactionalMail` wird bewusst nicht benutzt (es
  schreibt `email_events`); das Werkzeug ruft Resend direkt mit derselben
  Konfiguration auf.
- Kein signiertes Token. Jeder Link, den die Produktion signiert (Umfrage,
  Abmelden, Einladung, Tenant-Freigabe, Adressbestätigung), trägt ein Token in
  der richtigen Form, das niemand signiert hat — Klick oder Vorab-Abruf durch
  ein Gateway endet auf der „ungültiger Link"-Seite, nichts wird gespeichert.
- Kein Lauf in CI: das Werkzeug bricht ab, wenn `CI` oder `GITHUB_ACTIONS`
  gesetzt ist (die Actions-Logs sind öffentlich).
- Außerhalb der Kontrolle des Werkzeugs: Resend meldet Zustellereignisse der
  Seed-Mails an `/api/webhooks/resend`, die sie wie jede andere Mail in
  `email_events` ablegt — ohne uid und ohne `sentAt`, also ohne Spiegelung auf
  eine Nutzerzeile und ohne Zählung im Wochenbericht. Erkennbar am Präfix im
  Betreff.

## Ablauf

1. **Empfängerliste** außerhalb des Repos oder in `scratch/` (gitignored) anlegen,
   eine Zeile je Postfach, `#` für Kommentare. Im Repository steht keine
   Seed-Adresse — auch nicht in Tests oder Kommentaren; eine Spec prüft das.

   ```text
   # scratch/seed-recipients.txt
   gmail    seed-gmail@example.com
   outlook  seed-outlook@example.com
   gmx      seed-gmx@example.com
   tonline  seed-tonline@example.com
   ```

   Das Label ist der Name in der Auswertung (`anbieter`).

2. **Trockenlauf** (Standard, sendet nichts):

   ```bash
   npx tsx scripts/mail-seed-test.ts scratch/seed-recipients.txt --run-id 20260925-a
   ```

   Ausgabe je Typ: Absender, Betreff, Größe von HTML und Text, Header,
   Anzahl der Links und Link-Hosts — und die **Regelprüfung** (`WARNING  : …`
   je Verstoß, am Ende `POLICY    : …`). Die Regeln stammen aus Lauf
   20260924-a und üblicher Praxis (`mailPolicyWarnings` in
   `scripts/lib/mail-seed.ts`): jede Mail hat einen Textteil; kein Emoji und
   kein Ausrufezeichen im Betreff; jeder Link beginnt mit
   `https://clean-core.io/` (Ausnahme mit Begründung in `LINK_EXCEPTIONS`:
   der GitHub-Link im Security-Alarm an den Betreiber); jede Nutzer-Mail kommt
   von `Clean-Core.io <team@clean-core.io>` mit Antwort an
   `info@clean-core.io` (`USER_MAIL_FROM` in `lib/constants.ts`). Eine Warnung
   wird im Produkt behoben, nie im Werkzeug — `tests/mail-seed-test.spec.ts`
   ist rot, solange eine Produktions-Mail eine Regel verletzt. Die gerenderten Mails liegen danach unter
   `scratch/mail-seed-20260925-a/<typ>__<label>.html`, dazu `plan.json` und die
   leere Auswertung `placement.csv`.

3. **Echter Versand** — nur mit `--send` **und** der Bestätigung, die genau
   diesen Lauf nennt:

   ```bash
   MAIL_SEED_CONFIRM=20260925-a npx tsx scripts/mail-seed-test.ts scratch/seed-recipients.txt --run-id 20260925-a --send
   ```

   `RESEND_API_KEY` kommt aus der Umgebung oder `.env.local`. Gesendet wird mit
   700 ms Abstand (Resend erlaubt zwei Anfragen pro Sekunde), jede Nachricht mit
   `Idempotency-Key` (Lauf, Typ, Hash der Adresse — nie die Adresse selbst).
   Ergebnis: `scratch/mail-seed-<run-id>/send-log.json` mit Typ, Label, Domain
   und Resend-Message-ID. Ein erneuter Aufruf mit derselben Run-ID überspringt,
   was schon gesendet ist.

   Nur einzelne Typen: `--only welcome,survey`.

4. **mail-tester.com** (optional): mail-tester bewertet eine Nachricht je
   Adresse, also einen Typ pro Lauf:

   ```bash
   npx tsx scripts/mail-seed-test.ts scratch/seed-recipients.txt --run-id 20260925-mt1 --only welcome --mail-tester test-abc123@example.com
   ```

   (Die echte mail-tester-Adresse steht auf deren Startseite.)

5. **Auswerten**: Postfächer ansehen, je Zeile in `placement.csv` den Ordner
   eintragen — `inbox`, `promotions`, `spam`, `quarantaene` oder
   `nicht-angekommen` — und in `notiz` Auffälliges (Header `Authentication-Results`,
   Warnbanner, Absendername). Die Datei bleibt in `scratch/`.

## Fertig im Sinne von 3.0.9

Der Seed-Test landet bei allen vier Anbietern im Posteingang und Google
Postmaster nennt die Domain-Reputation nicht „schlecht" — geprüft vor jedem
Versand, nicht einmal (`docs/ROADMAP.md`, Zeile 3.0.9).
