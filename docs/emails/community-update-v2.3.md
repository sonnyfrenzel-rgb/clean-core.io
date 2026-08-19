# Community update email — v2.3 metering change

Bulk (non-transactional) send to all existing Free Community Edition accounts.
HTML body: [`community-update-v2.3.html`](./community-update-v2.3.html).

**Merge tags:** `{{FIRST_NAME}}` · `{{EMAIL}}` · `{{UNSUBSCRIBE_URL}}`

---

## Subject line

**Primary**

> We keep growing — and everyone gets five fresh transformations

**Alternatives**

> One object, one transformation — and your five are back
> A welcome, a fix, and five fresh transformations for everyone

Deliberately free of the words that push a bulk mail toward the promotions tab or the
spam folder: no "free", no urgency, no exclamation marks, no ALL CAPS, no emoji. The
transactional welcome mail may carry one; a message going to the whole list should not.

## Preheader

> One ABAP object now counts as one transformation. Every account starts again with a full five.

## From / Reply-To

```
From:      Felix Frenzel — Clean-Core.io <info@clean-core.io>
Reply-To:  info@clean-core.io
```

Sent from `info@clean-core.io`, the address already printed in the imprint and on the
site — so the visible sender, the reply target and the published contact are one and the
same, which is exactly what a receiving filter wants to see. The personal from-name with
the brand attached matches the signature and makes "just reply, it reaches a person" true.

Note that the existing transactional mails go out as `team@clean-core.io`. Both
addresses must be covered by the same SPF/DKIM/DMARC setup on the domain before this
send; adding a new envelope sender that is not aligned is a fast way into the spam
folder.

---

## Plain-text alternative

Send this as the `text` part alongside the HTML. A missing text part is one of the
cheapest ways to lose spam-score points.

```text
Hello {{FIRST_NAME}},

A warm welcome to everyone who joined us recently - the Clean-Core.io community is
growing week by week, and it is good to have you here.

With that growth came a fix worth telling you about. Until now, every AI step counted
against your quota: the analysis, the solution design, the generated code, the
documentation, the tests. A single ABAP object could eat six or seven of your five.
That was never the intention. From today, one transformation means one ABAP object -
and because nobody should be left short by the old count, every account has been reset
to a full five.

WHAT ONE TRANSFORMATION COVERS NOW

The complete seven-stage workflow for that object - analyse, design, transform,
document, test, cost, deliver - including the signed audit evidence pack.
Re-analysing the same source is free, and the glossary assistant no longer counts at
all. Your own Gemini key stays unlimited, as always.

Launch your workspace: https://clean-core.io/dashboard

IN TWO WEEKS

We will send you a brief satisfaction survey - a couple of minutes, no sales pitch.
We want to know whether the platform holds up against real legacy code, and where it
still does not. If you would rather tell us sooner, just reply to this message; it
reaches a person.

Thanks for building this with us,
Felix Frenzel
Clean-Core.io - Free Community Edition Program

---
You are receiving this message at {{EMAIL}} because you hold a Clean-Core.io Free
Community Edition account. It describes a change to the usage terms of that account.

Imprint: Felix Frenzel, Hellerstrasse 9, 96047 Bamberg, Germany, info@clean-core.io
Clean-Core.io System-Version: v2.3.0

Unsubscribe from community updates: {{UNSUBSCRIBE_URL}}
Privacy Policy: https://clean-core.io/datenschutz
Terms of Service: https://clean-core.io/terms
```

---

## Before this goes out — deliverability checklist

The HTML is already spam-resilient by construction: no images, no tracking pixel, no
link shorteners, a real text-to-link ratio, a physical imprint, and a visible
unsubscribe. Three things sit outside the template and must be true at send time.

1. **`List-Unsubscribe` headers.** Gmail and Yahoo require these for bulk senders, and
   their absence is on its own enough to get filtered. Set both:
   ```
   List-Unsubscribe: <{{UNSUBSCRIBE_URL}}>, <mailto:unsubscribe@clean-core.io>
   List-Unsubscribe-Post: List-Unsubscribe=One-Click
   ```
   One-click unsubscribe must work without a login and within two days.
2. **Authentication on `clean-core.io`.** SPF, DKIM and a DMARC record with at least
   `p=none` — Resend signs DKIM once the domain is verified. Bulk mail without DMARC
   is rejected outright by the large providers.
3. **Send in batches, not one blast.** A first-ever bulk send from a domain that has
   only sent transactional mail is a reputation event. Roughly 25–50 recipients per
   batch with a pause between them, real users first, and the E2E test accounts
   (`*@cleancore-test.io`) excluded from the recipient list entirely.

Not yet built: `{{UNSUBSCRIBE_URL}}` needs a token endpoint and a suppression list that
the sender consults. Until that exists, this email cannot be sent as bulk mail
compliantly.
