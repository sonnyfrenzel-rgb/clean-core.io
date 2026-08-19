# Community update email — v2.3 release

Bulk (non-transactional) send to all Free Community Edition accounts.
HTML body: [`community-update-v2.3.html`](./community-update-v2.3.html).
Sent by [`scripts/send-community-mail.ts`](../../scripts/send-community-mail.ts).

**Merge tags:** `{{FIRST_NAME}}` · `{{EMAIL}}` · `{{UNSUBSCRIBE_URL}}`

---

## Subject line

**Primary**

> Clean-Core.io 2.3 is live — and everyone has five fresh transformations

**Alternatives**

> 2.3 is live: five fresh transformations, and examples to try them on
> Start without your own code — Clean-Core.io 2.3 is live

No "free", no urgency, no exclamation marks, no ALL CAPS, no emoji — all of them
push a bulk mail toward the promotions tab. The transactional welcome mail may
carry one; a message to the whole list should not.

## Preheader

> Five fresh transformations for every account, and ready-made examples so you can start without your own code.

## From / Reply-To

```
From:      Felix Frenzel — Clean-Core.io <info@clean-core.io>
Reply-To:  info@clean-core.io
```

`info@clean-core.io` is the address already printed in the imprint and on the site,
so the visible sender, the reply target and the published contact are one and the
same — what a receiving filter wants to see. The transactional mails go out as
`team@clean-core.io`; both addresses are on the same domain and therefore covered by
the same SPF/DKIM/DMARC setup.

---

## Plain-text alternative

Sent as the `text` part alongside the HTML. A missing text part is one of the
cheapest ways to lose spam-score points.

```text
Hello {{FIRST_NAME}},

Version 2.3 is live, and a warm welcome to everyone who joined recently - the
community is growing week by week. Two things worth a minute of your time.

EVERY ACCOUNT NOW HAS FIVE FRESH TRANSFORMATIONS

One transformation means one ABAP object, and the complete seven-stage workflow
around it is included - analysis, design, generated RAP or CAP code, tests,
documentation and the final package.

AND YOU NO LONGER NEED YOUR OWN CODE TO START

There are ready-made examples on the dashboard now - realistic legacy reports, from
a 99-line stock valuation to a 1,000-line order-fulfilment audit. One click and you
are in the analysis.

FIFTEEN MINUTES, CLICK BY CLICK

A short guide takes you from signing in to a downloadable package in seven steps -
which button, and what you should see after it. No SAP connection, no credentials,
no data.

  https://clean-core.io/first-run

Start with an example: https://clean-core.io/dashboard

Stuck anywhere, or the engine handles one of your objects badly? Write to
info@clean-core.io - a person answers, and awkward objects are exactly what we want
to see.

KNOW SOMEONE WRESTLING WITH CUSTOM ABAP?

Clean-Core.io is free for the SAP community and grows by word of mouth. If it is
useful to you, pass it on - to a colleague, in your SAP community group, or wherever
the Clean Core conversation is happening. Send them to https://clean-core.io

Thanks for building this with us,
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

```bash
npx tsx scripts/send-community-mail.ts                      # dry run: who would get it
npx tsx scripts/send-community-mail.ts --apply --only me@x  # one test recipient
npx tsx scripts/send-community-mail.ts --apply              # the real send
```

The script excludes CI accounts, anyone in `email_suppressions`, and anyone already
recorded in `email_sends` for this campaign — so an interrupted run resumes safely.
It sends in batches of 25 with a minute between them and sets the RFC 8058 headers
on every message.

## Deliverability

Verified in place on `clean-core.io`:

| | |
|---|---|
| SPF | `v=spf1 include:amazonses.com ~all` |
| DKIM | `resend._domainkey` publishes a key |
| DMARC | `v=DMARC1;p=reject;` |
| Domain in Resend | verified — a send from `info@` is accepted |
| One-click unsubscribe | `/api/unsubscribe`, RFC 8058 headers set by the sender |

The body itself carries no images, no tracking pixel and no link shorteners, has a
real text-to-link ratio, a physical imprint and a visible unsubscribe.

**One recommendation before the first bulk send:** the DMARC record is `p=reject`
with no `rua=`. Anything that fails alignment is rejected outright and you never find
out. Adding `rua=mailto:dmarc@clean-core.io` costs one DNS record and turns a silent
failure into a report.
