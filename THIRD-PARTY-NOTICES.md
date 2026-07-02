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
