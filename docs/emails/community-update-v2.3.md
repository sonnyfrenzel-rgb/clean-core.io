# Community update email — v2.3 metering change

Bulk (non-transactional) send to all existing Free Community Edition accounts.
HTML body: [`community-update-v2.3.html`](./community-update-v2.3.html).

**Merge tags:** `{{FIRST_NAME}}` · `{{EMAIL}}` · `{{UNSUBSCRIBE_URL}}`

---

## Subject line

**Primary**

> Five fresh transformations — and something to try them on

**Alternatives**

> Your five are back, and you no longer need your own code to start
> One object, one transformation — plus examples to try it on

Deliberately free of the words that push a bulk mail toward the promotions tab or the
spam folder: no "free", no urgency, no exclamation marks, no ALL CAPS, no emoji. The
transactional welcome mail may carry one; a message going to the whole list should not.

## Preheader

> Five fresh transformations, and ready-made examples so you can try it without your own code.

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

Two things have changed for you. First, we were counting wrong: every AI step used
to draw on your quota, so a single ABAP object could eat six or seven of your five.
From today one transformation means one ABAP object, with the whole seven-stage
workflow included - and every account has been reset to a full five.

Second, and more useful: you no longer need your own code to try it. Getting custom
ABAP out of a customer system just to see whether a tool is any good is a lot to
ask, and we suspect it is why many of you never got past the dashboard. So there are
now ready-made starter examples waiting there - realistic, fictional legacy reports,
from a 99-line stock valuation to a 1,000-line order-fulfilment audit. One click and
you are in the analysis.

FIFTEEN MINUTES, START TO FINISH

The guide walks one object through all seven stages - analysis and Clean Core Score,
target design, generated RAP or CAP code, tests, BPMN documentation, and the abapGit
package with its signed audit evidence. What each stage gives you, and what it costs.

  https://clean-core.io/how-to

Start with an example: https://clean-core.io/dashboard

If anything is unclear, or the engine handles one of your objects badly, write to
info@clean-core.io - or simply reply to this message. A person answers, and awkward
objects are exactly what we want to see.

IN TWO WEEKS

We will send you a brief survey - a couple of minutes, no sales pitch. The question
we most want answered is a simple one: if you have not run anything yet, what got in
the way? That answer is worth more to us than any feature request.

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
