# Third-Party Notices

This product includes data from the **SAP Cloudification Repository**
(https://github.com/SAP/abap-atc-cr-cv-s4hc), © 2020–2026 SAP SE or an SAP
affiliate company and abap-atc-cr-cv-s4hc contributors.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this data except in compliance with the License. A copy of the License is
available at:

    http://www.apache.org/licenses/LICENSE-2.0

## Modifications

The data has been transformed by Clean-Core.io:
- normalized from the repository's `objectReleaseInfo` schema into Clean-Core.io's
  internal catalog schema (see `lib/abap/cloudification-repo.ts`);
- merged with Clean-Core.io's own curated, field-level mappings, which take
  precedence (see `lib/abap/catalog-service.ts`).

## SAP Architecture Center (metadata and one quoted passage)

This product includes metadata (IDs, short IDs, titles, last-update dates and
archive state) of the reference architectures in the **SAP Architecture Center**
(https://github.com/SAP/architecture-center), and quotes one passage of
`docs/ref-arch/RA0001/readme.md`, © 2024 SAP SE or an SAP affiliate company and
architecture-center contributors, licensed under the Apache License, Version 2.0
(http://www.apache.org/licenses/LICENSE-2.0). Used in
`lib/generated/sap-architecture-center.json` (written by
`scripts/sync-sap-architecture-center.ts`) and `lib/sap-reference-architectures.ts`;
the mapping of Clean-Core.io targets to these reference architectures is
Clean-Core.io's own. No diagram is included — the reference architectures are
linked, not embedded. The upstream repository ships no `NOTICE` file (checked
10.10.2026; REUSE.toml carries the copyright and license per path).

## DSAG ABAP-Leitfaden (adapted guidance, metadata and section hashes)

Some rules of Clean-Core.io's ABAP analysis and generated code are adapted from
the **"DSAG ABAP-Leitfaden"** by DSAG e.V. (Deutschsprachige SAP-Anwendergruppe)
and contributors (https://1dsag.github.io/ABAP-Leitfaden/authors/), published at
https://1dsag.github.io/ABAP-Leitfaden/ from the repository
https://github.com/1DSAG/ABAP-Leitfaden (reviewed at commit
`100600dfc9d98136b1992bde20e201049cbb1116`), licensed under the Creative Commons
Attribution 4.0 International License (CC BY 4.0,
https://creativecommons.org/licenses/by/4.0/).

**Changes:** translated from German, excerpted, paraphrased and corrected where
outdated or inconsistent; metadata and section hashes synced weekly. What was
taken over, corrected or declined is listed per item, with the guide section it
rests on, in `lib/dsag-citations.ts`. `lib/generated/dsag-abap-guide.json` (written
by `scripts/sync-dsag-guide.ts`) holds page titles, headings, anchors and a
SHA-256 per section — no text of the guide. No image of the guide is reused (some
of its figures are SAP's). Use of the guide does not imply that DSAG e.V. or its
authors endorse Clean-Core.io or the way it uses the guide.

## Trademarks

SAP, S/4HANA, ABAP and other SAP product and service names are trademarks or
registered trademarks of SAP SE (or an SAP affiliate company). They are used on
the public catalog pages for identification and reference (nominative) purposes
only. Clean-Core.io is not affiliated with, or endorsed by, SAP SE.

## NOTICE file — verified: none present

The upstream repository does **not** ship an Apache `NOTICE` text file. Verified via:
- the repository README "Licensing" section, which references only `LICENSE` and the
  REUSE tool (no NOTICE);
- REUSE compliance (106/106 files carry per-file copyright + license headers — the REUSE
  mechanism that replaces a central NOTICE file).

Apache-2.0 §4(d) ("If the Work includes a NOTICE text file…") therefore does not apply.
The attribution above satisfies Apache-2.0 §4(a)(b)(c). No further NOTICE reproduction is
required. (Re-verify if you later pull from a different upstream release.)
