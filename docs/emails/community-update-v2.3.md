# Community update email — v2.3 metering change

Bulk (non-transactional) send to all existing Free Community Edition accounts.
HTML body: [`community-update-v2.3.html`](./community-update-v2.3.html).

**Merge tags:** `{{FIRST_NAME}}` · `{{EMAIL}}` · `{{UNSUBSCRIBE_URL}}`

---

## Subject line

**Primary**

> We changed how we count — your five transformations are back

**Alternatives**

> Your five transformations, counted the way we promised
> One object, one transformation — and your balance is reset

Deliberately avoids the words that push a bulk mail toward the promotions tab or the
spam folder: no "free", no "act now", no exclamation marks, no ALL CAPS, no emoji in
the subject (the transactional welcome mail may carry one; a bulk send should not).

## Preheader

> One ABAP object now costs one transformation instead of six. Your balance is back to five.

## From / Reply-To

```
From:      Sonny Frenzel — Clean-Core.io <team@clean-core.io>
Reply-To:  info@clean-core.io
```

A personal from-name with the brand attached reads better than a bare brand for a
message that admits a mistake — and it makes "just reply, it reaches a person" true.

---

## Plain-text alternative

Send this as the `text` part alongside the HTML. A missing text part is one of the
cheapest ways to lose spam-score points.

```text
Hello {{FIRST_NAME}},

Short version: we were counting your transformations wrong, we fixed it, and
everyone's balance has been reset to a full five. Nothing you need to do - but
here is what happened, because you deserve the honest version.

Until now, every AI step counted as one transformation. Analysing an ABAP object,
drafting the solution design, generating the RAP or CAP code, writing the
documentation, building the tests - each one quietly took a unit off your balance.
A single object could consume six or seven of your five. Some of you ran out before
finishing your first one, and a few questions to the glossary assistant were enough
to end things early. That is not what the pricing card promised, and it is not what
we meant.

WHAT ONE TRANSFORMATION MEANS NOW

One ABAP object taken through the analysis. That is it. Everything downstream -
solution design, code transformation, documentation, testing, TCO and delivery - is
included and costs nothing extra. Re-analysing the same source is free, so a retry
or a second look never costs you a unit. The glossary assistant no longer counts at
all.

WHERE YOU STAND TODAY

* Five transformations, counted fairly. Your counter is back to zero. Whatever the
  old model charged you has been written off.
* The complete seven-stage workflow, per object. Analyse, design, transform,
  document, test, cost, deliver - with the signed audit evidence pack at the end.
* Your own Gemini key stays unlimited. If you have connected your own key, nothing
  about your account changes.

Launch your workspace: https://clean-core.io/dashboard

IN TWO WEEKS

We will send you a brief satisfaction survey - a couple of minutes, no sales pitch.
We want to know whether the platform now holds up when you put real legacy code
through it, and where it still does not. If you would rather tell us sooner, simply
reply to this message; it reaches a person.

Thanks for building this with us,
Sonny Frenzel
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
