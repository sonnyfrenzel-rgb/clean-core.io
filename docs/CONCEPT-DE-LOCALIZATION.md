# Concept: German version of Clean-Core.io

**As of 24 September 2026 · for the product from 3.0 · Status: concept, not built**

The German interface comes **after 3.0** (`docs/ROADMAP.md` §7, line 3.1 "German core pages";
`DESIGN.md` §3). Until then everything is English — the interface **and** what the product generates
(ADR-009). This concept describes how the German version comes to the 3.0 product: the
workspace with three views and six layers, the seven stages as tools, the public
pages. It replaces the version of 6 July 2026, which still assumed the stage workflow as the product;
that one is in the Git history.

---

## 1. Starting point (checked against the code, 24.09.2026)

| Aspect | Status |
|---|---|
| i18n framework | none (no `next-intl`, no locale routing) |
| Text keys | in place: `lib/cc-messages.ts` for the components in `components/cc/`, the provenance values as keys in `lib/provenance.ts`, Level A–D in `lib/clean-core-level.ts` (`DESIGN.md` §3: every visible string of new interfaces goes through text keys, even while there is only English) |
| Language markup | `<html lang="en">` in `app/layout.tsx`; individual German contents carry `lang="de"`; the German FAQ answer on the home page has been removed since 01.10.2026 (Sonny: "everything English"), its English version stands directly before it |
| German pages | `/datenschutz/de` as a page of its own, indexable, with `hreflang` to the English one |
| Product | English: home page, knowledge and catalog pages, workspace (Business, IT and Management view, six layers), the seven stages as tools, settings, mails |
| Model output | English, fixed in the prompts; marked as *Model proposal* |
| Numbers, date, money | `Intl.NumberFormat('en')`; money arises only in Economics, with a currency code, as a simulation (ADR-022) |

**Conclusion:** The scaffolding for text keys stands where 3.0 built anew. A German
version is nevertheless not a swap of texts, but locale routing, a second
message catalog, German model output and editorial work.

---

## 2. Why German

Most SAP installed-base customers, architects and consultants work in the German-speaking
region. For a tool that prepares custom ABAP for a clean core decision, German is
a lever for reach and trust — and one of the options offered in the activation survey.

**The language paradox of the target group:** It speaks German, but uses English SAP technical terms
(Clean Core, RAP, CAP, ABAP Cloud, BTP, Released API). What is translated is the explanatory and
operating layer, not the technical language.

**Register:** factual German, formal "Sie" address, no superlatives; every statement evidenced as in
English ("evidenced, not asserted").

---

## 3. Scope by layer

| Layer | Content | Localisation | Priority |
|---|---|---|---|
| **A. Public pages** | Home page (3.0.6), knowledge pages, Clean Core explained, How-to, Whitepaper | fully German, own URL | high (reach) |
| **B. Legal texts** | Impressum, Datenschutz (German exists), terms of use | German version; in case of discrepancy the German one is authoritative | high |
| **C. Workspace** | view switcher and its questions, layers, cards, "Next step", Message Strips, the seven stages as tools, settings | via the text keys | medium |
| **D. Fixed lists** | provenance values (Proven, Confirmed, Reconstructed, Imported, Model proposal, Simulation, Demonstrated · mock, Stale, Not determined), Level A–D, the four buckets, object status | one German value per key, fixed once | high — they carry meaning |
| **E. Model output** | business names, plain-language sentence, documentation text | **generate** German, do not translate | medium |
| **F. Mails** | Welcome, invitation to read access, approvals | German | low |
| **G. Catalog and SEO** | object catalog, JSON-LD, metadata, sitemap | German variants with `hreflang` | medium |
| **H. Formats** | numbers, date | `Intl` with `de-DE`; money stays a simulation with a currency code | low |

**Language-neutral — do not translate:** ABAP object and table names, code, line anchors
(`L243`), finding and rule IDs (`CC-017`, `BR-004`), JSON keys, SAP API and CDS names.
German code stays verbatim where it is quoted (`DESIGN.md` §3).

**The view is not a language and not a role:** Business, IT and Management remain views on
the same facts; the language changes nothing about that and, like the view, is never stored with a project,
a run, a signature or an audit pack.

---

## 4. Technical concept (Next.js 15 App Router)

### 4.1 Framework
The built-in i18n routing of Next.js applies only to the Pages Router. Recommendation: `next-intl`
(App Router and RSC native, static generation and ISR, locale routing, `hreflang` helpers,
`Intl`). The existing keys from `lib/cc-messages.ts` and `lib/provenance.ts` become the
start of the English catalog, not a second system alongside it.

### 4.2 URL strategy
Subpath on the same domain: `clean-core.io/` (English, default) and `clean-core.io/de/…`.
One domain, one Cloud Run service, one certificate. Today's English URLs remain
unchanged — they have the search reach (`tests/seo-surface-guard.spec.ts`).

### 4.3 Language choice
- **Fixed URLs per language.** `/de/…` always delivers German, all of today's URLs always English —
  regardless of the browser. Crawlers, direct links and shared links reach each version
  deterministically.
- **Hint instead of redirect.** A browser with German language gets a hint on English pages
  "Diese Seite gibt es auf Deutsch" ("This page is available in German"), no automatic redirect. That keeps the
  English URLs stable that are found today.
- **Language switcher** in header and footer; the choice lives as a cookie in the browser, not in the account.

### 4.4 Message catalogs
```
messages/
  en.json   # from lib/cc-messages.ts and the further keys
  de.json
```
Namespaces per place (`landing.*`, `workspace.*`, `provenance.*`, `level.*`, `legal.*`, `errors.*`).
Server components load on the server; client components only where they are interactive.

### 4.5 SEO duties
- `alternates.languages` per page: `de-DE` ↔ `en` plus `x-default`.
- `canonical` per language URL, never across languages.
- `sitemap.ts` with both variants and alternates.
- JSON-LD per language (`inLanguage`), visible FAQ and `FAQPage` congruent as today.

---

## 5. Model output in German

1. **Generate instead of translate.** The proxy `/api/gemini` receives the output language as a
   parameter; human-readable fields are produced in German, the structure (keys, enums, object
   and API names, code) stays neutral.
2. **Technical terms in English in the German text**, as an instruction in the prompt.
3. **The chip states the provenance, not the text** (`DESIGN.md` §3.1): *Model proposal* remains the
   marking; the clean-up in `lib/model-text.ts` gets the German list of stock phrases.

**Trust chain untouched:** Model text is not part of the signed run. The output language
changes no number, no finding, no fingerprint and no signature.

**Quality assurance:** The workspace is walked through once completely in German with the demo project `Z_MM_PO_APPROVAL` and one
corpus case — all three views, all six layers,
each of the seven stages as a tool — and proofread editorially before the version
is approved.

---

## 6. Legal texts

- **Datenschutz:** German version exists (`/datenschutz/de`).
- **Impressum:** German law (§ 5 DDG); the German version is a pure translation.
- **Terms of use:** German law already applies; a German version is proofread
  by a lawyer. A new, binding version updates `termsVersionAccepted` — the
  sign-up itself stays unchanged.

---

## 7. Terminology (excerpt)

| English | German |
|---|---|
| Clean Core, RAP, CAP, ABAP Cloud, BTP, Released API, CDS view | beibehalten |
| workspace | Arbeitsraum |
| Business view · IT view · Management view | Business-Sicht · IT-Sicht · Management-Sicht |
| the seven stages as tools | die sieben Stufen als Werkzeuge |
| Level A–D | Level A–D (unverändert, SAPs Begriff) |
| Proven · Confirmed · Reconstructed · Imported · Not determined | Belegt · Bestätigt · Rekonstruiert · Importiert · Nicht bestimmt |
| Model proposal · Simulation · Stale | Modellvorschlag · Simulation · Veraltet |
| a self-declaration, not a mandate | eine Selbstauskunft, kein Mandat |
| read access by invitation | Einsicht per Einladung |
| Retire · Keep · Rebuild · No catalogued path | to be fixed in the glossary before the interface is translated |
| Free Community Edition | beibehalten (Eigenname) |

The glossary is part of the catalog, not a document alongside it; the German values of the fixed
lists stand with the respective key, so that interface, mails and prompts use the same words
(`docs/registers/vocabulary.json` holds the English spellings).

---

## 8. Order

| Step | Content | Result | Size |
|---|---|---|---|
| **0 — Scaffolding** | `next-intl`, `/de` routes, `lang`, switcher, `hreflang`, sitemap, canonical; existing keys into the catalog | `/de` reachable | M |
| **1 — Public pages** | home page, knowledge pages, metadata and JSON-LD in German | reach in the DACH region | M–L |
| **2 — Legal texts** | Impressum, terms of use (Datenschutz is in place) | basis of trust | S–M |
| **3 — Workspace** | views, layers, cards, fixed lists, stages as tools, settings | usable in German | L |
| **4 — Model output** | output language as a parameter, German list of stock phrases, walk-through with demo and corpus case | German business names and texts | M |
| **5 — Mails and help** | mails, How-to, Ask this case | throughout | M |

The smallest sensible version is steps 0 to 2: public pages and legal texts in German,
the workspace English for now — defensible for an SAP specialist audience. Every step is
shipped completely, never a half-translated page.

---

## 9. Risks

| Risk | Countermeasure |
|---|---|
| English and German drift apart | one catalog per language, a guard for missing keys; no hard-coded strings in new interfaces (`DESIGN.md` §3) |
| German pages displace English ones in search | `hreflang` in both directions, canonical per language URL, English URLs unchanged |
| Clumsy model output | prompt instruction on technical terms, German clean-up, walk-through before approval |
| A fixed value gets two translations | German values with the key, fixed once |
| A legal text does not take effect as a mere translation | have the terms of use proofread by a lawyer |

## 10. Non-goals

- no machine translation without editorial review;
- no second code base — one code base, two languages;
- no translation of technical terms, code, object names or JSON;
- no change to runs, signatures or audit pack;
- no language as an account setting on the server — the choice stays in the browser.

> Not legal advice. The German legal texts are checked by a lawyer before publication.
