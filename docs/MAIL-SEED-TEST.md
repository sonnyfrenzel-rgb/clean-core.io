# Mail seed test (Roadmap 3.0.9)

"Measure first, then turn": before anyone turns DKIM, subdomains, sender names or
tracking, **every mail the product sends** goes once to
a handful of seed mailboxes (Gmail, Outlook, GMX/web.de, T-Online, optionally
mail-tester.com) — and the result (inbox, promotions, spam, quarantine,
not delivered) is recorded per mail type and provider. Again before every turn of
a lever and before every campaign, not once.

Tool: `scripts/mail-seed-test.ts` (logic in `scripts/lib/mail-seed.ts`,
specs in `tests/mail-seed-test.spec.ts`).

## What is measured

The real mail, not a similar one. Each type takes over the Resend call
of its production site field by field: sender, `reply_to`, HTML from the
real template, text part, `List-Unsubscribe`/`List-Unsubscribe-Post` (only the
survey). The only
difference: the recipient and a prefix in the subject,
`[Seed 3.0.9 <typ> <run-id>] <Original-Betreff>`.

`npx tsx scripts/mail-seed-test.ts --list-types` shows the types with their source.
As of 24.09.2026: `welcome`, `welcome-approval`, `invitation`,
`address-confirmation`, `tenant-pending`, `tenant-approval`, `tenant-revoke`,
`survey` (to users) as well as `admin-signup`, `tenant-request`, `survey-digest`,
`usage-report`, `security-alert` (to the operator). A spec checks that every
place in the code that sends to Resend appears as a type.

## What does not happen

- No Firestore access, no outbox entry, no unsubscribe registration,
  no user event. `sendTransactionalMail` is deliberately not used (it
  writes `email_events`); the tool calls Resend directly with the same
  configuration.
- No signed token. Every link that production signs (survey,
  unsubscribe, invitation, tenant approval, address confirmation) carries a token in
  the right form that nobody has signed — a click or a prefetch by
  a gateway ends on the "invalid link" page, nothing is stored.
- No run in CI: the tool aborts if `CI` or `GITHUB_ACTIONS`
  is set (the Actions logs are public).
- Outside the tool's control: Resend reports delivery events of the
  seed mails to `/api/webhooks/resend`, which stores them like any other mail in
  `email_events` — without uid and without `sentAt`, so without mirroring onto
  a user row and without counting in the weekly report. Recognisable by the prefix in the
  subject.

## Procedure

1. Create the **recipient list** outside the repo or in `scratch/` (gitignored),
   one line per mailbox, `#` for comments. The repository contains no
   seed address — not in tests or comments either; a spec checks that.

   ```text
   # scratch/seed-recipients.txt
   gmail    seed-gmail@example.com
   outlook  seed-outlook@example.com
   gmx      seed-gmx@example.com
   tonline  seed-tonline@example.com
   ```

   The label is the name in the evaluation (`anbieter`).

2. **Dry run** (default, sends nothing):

   ```bash
   npx tsx scripts/mail-seed-test.ts scratch/seed-recipients.txt --run-id 20260925-a
   ```

   Output per type: sender, subject, size of HTML and text, headers,
   number of links and link hosts — and the **policy check** (`WARNING  : …`
   per violation, at the end `POLICY    : …`). The rules come from run
   20260924-a and common practice (`mailPolicyWarnings` in
   `scripts/lib/mail-seed.ts`): every mail has a text part; no emoji and
   no exclamation mark in the subject; every link starts with
   `https://clean-core.io/` (exception with justification in `LINK_EXCEPTIONS`:
   the GitHub link in the security alert to the operator); every user mail comes
   from `Clean-Core.io <team@clean-core.io>` with replies to
   `info@clean-core.io` (`USER_MAIL_FROM` in `lib/constants.ts`). A warning
   is fixed in the product, never in the tool — `tests/mail-seed-test.spec.ts`
   is red as long as a production mail violates a rule. The rendered mails are then in
   `scratch/mail-seed-20260925-a/<typ>__<label>.html`, together with `plan.json` and the
   empty evaluation `placement.csv`.

3. **Real send** — only with `--send` **and** the confirmation that names exactly
   this run:

   ```bash
   MAIL_SEED_CONFIRM=20260925-a npx tsx scripts/mail-seed-test.ts scratch/seed-recipients.txt --run-id 20260925-a --send
   ```

   `RESEND_API_KEY` comes from the environment or `.env.local`. Sending happens with
   700 ms spacing (Resend allows two requests per second), each message with an
   `Idempotency-Key` (run, type, hash of the address — never the address itself).
   Result: `scratch/mail-seed-<run-id>/send-log.json` with type, label, domain
   and Resend message ID. Calling again with the same run ID skips
   what has already been sent.

   Only individual types: `--only welcome,survey`.

4. **mail-tester.com** (optional): mail-tester rates one message per
   address, so one type per run:

   ```bash
   npx tsx scripts/mail-seed-test.ts scratch/seed-recipients.txt --run-id 20260925-mt1 --only welcome --mail-tester test-abc123@example.com
   ```

   (The real mail-tester address is on their home page.)

5. **Evaluate**: look at the mailboxes, enter the folder for each row in `placement.csv`
   — `inbox`, `promotions`, `spam`, `quarantaene` or
   `nicht-angekommen` — and in `notiz` anything notable (header `Authentication-Results`,
   warning banner, sender name). The file stays in `scratch/`.

## Done in the sense of 3.0.9

Decision Sonny, 30.09.2026: no CSA certification, T-Online is dropped. The seed test lands in the inbox at **Gmail
and Microsoft (Microsoft 365 and Outlook.com)**, and Google Postmaster does not call the domain reputation
"bad" — checked before every send, not once (`docs/ROADMAP.md`, line 3.0.9). **GMX/web.de** is
measured and reported in every run, but does not block (known limitation; levers: time, low
steady volume, sender in the contacts).
