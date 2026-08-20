# Community email — the Clean Core explainer

Bulk (non-transactional) send to all Free Community Edition accounts.
HTML body: [`clean-core-explained.html`](./clean-core-explained.html).
Sent by [`scripts/send-community-mail.ts`](../../scripts/send-community-mail.ts).

**Merge tags:** `{{FIRST_NAME}}` · `{{EMAIL}}` · `{{UNSUBSCRIBE_URL}}`

**Campaign id:** `clean-core-explained` — the send script skips anyone already
recorded under this id, so the previous `community-update-v2.3` send is untouched
and this one can be resumed safely if it is interrupted.

---

## Subject line

**Primary**

> SAP Clean Core, explained without the jargon

**Alternatives**

> The Clean Core guide I wish someone had handed me
> Clean Core, from scratch — and the platform is back up
> What Clean Core actually means (20 minutes, no jargon)

**Preheader**

> A complete plain-language guide to SAP Clean Core — and the platform is fully back up.

The primary subject is deliberately about the guide, not about maintenance. The
maintenance note belongs in the first paragraph — leading a subject line with an
apology trains people to skip the sender.

---

## What it says, and why

1. **Maintenance is done, everything works.** First paragraph, plainly, no excuses
   and no detail nobody asked for.
2. **There is a complete guide now.** The actual reason for the mail. Framed as a
   guide, not a product page, because that is what it is.
3. **What is in it** — five bullets, so the reader can judge relevance in ten seconds.
4. **Read the guide** — one primary call to action.
5. **It is forwardable.** Free, no sign-in. The explicit permission to pass it on is
   the growth mechanism; the whole page was built to survive being forwarded.
6. **Your five transformations are still there** — reading is not the goal, running
   an analysis is.
7. **Corrections wanted.** A real invitation with a real address behind it.

No survey mention, no version-number celebration, no consultant register.

---

## Plain-text alternative

Sent as the `text` part alongside the HTML. A missing text part is one of the
cheapest ways to lose spam-score points.

```text
Hello {{FIRST_NAME}},

Two things. First: the platform maintenance is finished. Everything is back up and
running normally - sign-in, analysis, all seven stages, exports. Thank you for your
patience if you hit the maintenance window.

Second, and the actual reason I am writing: there is now a complete guide to Clean
Core on the site. Not a product page - a guide. It starts from "what even is the
core" and goes all the way to grading every object in your estate A to D. Every term
is defined before it is used, so it works whether you have been doing ABAP for twenty
years or are trying to follow what your SAP team is talking about.

ABOUT 20 MINUTES, SEVEN PARTS

  - Why modifications break upgrades - from scratch
  - The twelve terms you actually need, plainly
  - In-app or side-by-side: RAP or CAP, and how to decide
  - The A-D grading model, and what each grade costs you
  - What Clean-Core.io does - with the benefit, the effort, and where it stops

Read the guide: https://clean-core.io/clean-core-explained

It is a normal web page, free, no sign-in. Forward it, print it, drop it in a Teams
channel - whatever is useful. If your management keeps asking what Clean Core means
and why it matters, that page is the answer you can send instead of writing one.

YOUR FIVE TRANSFORMATIONS ARE STILL THERE

Reading about it only gets you so far. There are ready-made ABAP examples on the
dashboard, so you can watch a full analysis run without extracting anything from your
own system. About fifteen minutes, click by click.

  https://clean-core.io/first-run

Something in the guide wrong, unclear, or missing? Tell me - info@clean-core.io.
Corrections from people who do this daily are worth more to that page than anything I
can write alone, and I will credit them.

Thanks for reading,
Felix Frenzel
Clean-Core.io - Free Community Edition Program

---
You are receiving this message at {{EMAIL}} because you hold a Clean-Core.io Free
Community Edition account.

Imprint: Felix Frenzel, Hellerstrasse 9, 96047 Bamberg, Germany, info@clean-core.io
Clean-Core.io System-Version: v2.3.0

Unsubscribe from community updates: {{UNSUBSCRIBE_URL}}
Privacy Policy: https://clean-core.io/datenschutz
Terms of Service: https://clean-core.io/terms
```

---

## Sending it

The campaign id, subject, and template paths live at the top of
`scripts/send-community-mail.ts`. Set them to:

```ts
const CAMPAIGN = 'clean-core-explained';
const SUBJECT  = 'SAP Clean Core, explained without the jargon';
// templates: docs/emails/clean-core-explained.{html,md}
```

Then:

```bash
npx tsx scripts/send-community-mail.ts                      # dry run: who would get it
npx tsx scripts/send-community-mail.ts --apply --only me@x  # one test recipient
npx tsx scripts/send-community-mail.ts --apply              # the real send
```

The script excludes CI accounts, anyone in `email_suppressions`, and anyone already
recorded in `email_sends` for this campaign. It sends in batches of 25 with a minute
between them and sets the RFC 8058 headers on every message.

## Deliverability

Verified in place on `clean-core.io`:

| | |
|---|---|
| SPF (apex) | `v=spf1 include:amazonses.com ~all` |
| SPF (`send.clean-core.io`) | present — this is the envelope domain Resend uses, and the one DMARC actually checks for SPF alignment |
| DKIM | `resend._domainkey` publishes a key |
| DMARC | `v=DMARC1;p=reject;rua=…` |
| Domain in Resend | verified — a send from `info@` is accepted |
| One-click unsubscribe | `/api/unsubscribe`, RFC 8058 headers set by the sender |
