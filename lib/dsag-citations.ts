/**
 * lib/dsag-citations.ts — what Clean-Core.io takes from the DSAG ABAP guide
 * ("DSAG ABAP-Leitfaden", DSAG e.V. and contributors, CC BY 4.0,
 * https://1dsag.github.io/ABAP-Leitfaden/), one row per item of the 13.10.2026
 * review (C1–C5 contradictions, B1–B10 gaps; owner decision 13.10.2026: all
 * built in 3.0.12).
 *
 * Owner rule (13.10.2026): the product does not take over outdated terminology,
 * or a point where the guide is wrong or contradicts itself. Every row says so:
 *   - `adopted` — taken over as the cited sections say;
 *   - `adopted-with-correction` — taken over, `correction` says what we changed and why;
 *   - `not-adopted` — the guide is wrong, inconsistent or outdated here; `correction` says why.
 * A section the product deliberately does not follow is listed under `watched`
 * of the row it belongs to, with the reason.
 *
 * The guide is German; descriptions here are our English paraphrase. Code that
 * implements a row cites it as `// DSAG ABAP guideline: <file> § <heading>`
 * (see `dsagGuidelineComment`), with file and heading exactly as below.
 *
 * `hashAtAdoption` is the section hash from `lib/generated/dsag-abap-guide.json`
 * at the commit the rule was reviewed against (`DSAG_REVIEWED_COMMIT`).
 * tests/dsag-citations.spec.ts fails when an adopted section is gone or its hash
 * moved — on the weekly bot branch that is the signal to re-read the section and
 * review the adopted rule by hand, then record the new hash here. Watched and
 * not-adopted sections only produce a soft signal (an annotation), so a guide
 * that corrects itself can be reconsidered.
 */

export type DsagAdoption = 'adopted' | 'adopted-with-correction' | 'not-adopted';

export interface DsagCitedSection {
  /** Path in the guide's repository below `docs/`, e.g. `clean-core/solution-approach.md`. */
  file: string;
  /** The heading exactly as the guide writes it (German). */
  heading: string;
  /** SHA-256 of the section's normalised text when the rule was reviewed. */
  hashAtAdoption: string;
}

export interface DsagWatchedSection extends DsagCitedSection {
  /** Why the product does not follow this section. */
  why: string;
}

export interface DsagCitation {
  id: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7' | 'B8' | 'B9' | 'B10';
  status: DsagAdoption;
  /** What the product takes over, in short English. */
  adopted: string;
  /** Required unless `status` is `adopted`: what we changed or did not take, and why. */
  correction?: string;
  /** The sections the rule rests on. For `not-adopted` rows these are the sections we decline. */
  sections: DsagCitedSection[];
  /** Sections of the guide that bear on the row but are deliberately not followed. */
  watched?: DsagWatchedSection[];
}

/** The guide commit every `hashAtAdoption` below was taken at. */
export const DSAG_REVIEWED_COMMIT = '100600dfc9d98136b1992bde20e201049cbb1116';

/** The comment that marks code implementing a row. */
export const DSAG_GUIDELINE_COMMENT_PREFIX = '// DSAG ABAP guideline: ';
export const dsagGuidelineComment = (file: string, heading: string) => `${DSAG_GUIDELINE_COMMENT_PREFIX}${file} § ${heading}`;

export const DSAG_CITATIONS: DsagCitation[] = [
  {
    id: 'C1',
    status: 'adopted',
    adopted:
      'ABAP Cloud is one development model on every stack, and a tightly coupled extension belongs on-stack: BDC, native SQL and (in Public Edition) writes to custom tables no longer force a side-by-side route by themselves; RFC drives side-by-side only for outbound calls to other systems.',
    sections: [
      { file: 'clean-core/solution-approach.md', heading: 'ABAP Cloud', hashAtAdoption: '947b5d0d46aa2c98c3438e9097d5119077c7d9f6ffad7f36789fbec4abaeeacd' },
      { file: 'clean-core/architectural-concepts.md', heading: 'Kopplung', hashAtAdoption: '8d7110c52b8afb5e7f962a1df2001c266ba38db0d991829d100e3773df3152db' },
    ],
  },
  {
    id: 'C2',
    status: 'adopted',
    adopted:
      'The Level A–D concept replaces the 3-tier model: no "Tier 2" or "3-tier" wording; an unreleased SAP API is reached through a wrapper together with an influence request to SAP.',
    sections: [{ file: 'clean-core/solution-approach.md', heading: 'Level Concept', hashAtAdoption: '683acb0e81cd1658b5ee6759605f77c50ab848a4a297563dcccedce4bae0907c' }],
  },
  {
    id: 'C3',
    status: 'adopted',
    adopted:
      'Authorizations are declared at the data layer with DCL: the RAP scaffold uses `#CHECK` with an access-control stub naming the original authorization objects, and its authorization method denies until filled.',
    sections: [{ file: 'security/security-secure-development.md', heading: 'Berechtigungen in CDS Views', hashAtAdoption: '2226aa3072c5e742f80942e9d2de50469012edb01ab5d1ed641da397c1e39f9b' }],
  },
  {
    id: 'C4',
    status: 'adopted',
    adopted: 'Level A equals ABAP Cloud (released objects only), so a heuristic estimate never yields Level A.',
    sections: [{ file: 'clean-core/solution-approach.md', heading: 'Level Concept', hashAtAdoption: '683acb0e81cd1658b5ee6759605f77c50ab848a4a297563dcccedce4bae0907c' }],
  },
  {
    id: 'C5',
    status: 'adopted-with-correction',
    adopted:
      'Classic technologies such as IDoc and the ALV grid are Level B (clean core) and may stay; replace them when a browser, Fiori or Public Edition requires it. Existing IDoc and RFC integrations are not retired prematurely, and IDoc remains the better fit for EDI mass data.',
    correction:
      'The guide contradicts itself: its Level concept grades classic technologies as Level B, while its integration table says to avoid RFC and IDoc and its clean core definition says they must be replaced. We follow the Level concept, which matches SAP\'s own level classification, and do not take over the blanket "avoid/replace" statements.',
    sections: [
      { file: 'clean-core/solution-approach.md', heading: 'Level Concept', hashAtAdoption: '683acb0e81cd1658b5ee6759605f77c50ab848a4a297563dcccedce4bae0907c' },
      { file: 'integration/index.md', heading: 'Bestand alter Technologien', hashAtAdoption: 'e6961213ef6b8856bda87c7d98d9454f24e7cda1c4d0c4878a282833d2721a54' },
      { file: 'integration/index.md', heading: 'Beispiel: Massendatentransferierung', hashAtAdoption: '3b40d983df0dd1c03a2aa97b9522d5a44df19f282f89fbc70019aaa82beec0b3' },
    ],
    watched: [
      {
        file: 'integration/index.md',
        heading: 'Clean Core',
        hashAtAdoption: '4b1d0f2e603041aaab27ce06ae9cf1f42b2344b1d8ea79198a7323ac3ec8d1f4',
        why: 'Its table lists RFC and IDoc under "avoid", which contradicts the guide\'s own Level B grading of classic technologies.',
      },
      {
        file: 'clean-core/what-is-clean-core.md',
        heading: 'Schnittstellen',
        hashAtAdoption: 'c11730074294771d8951ec716cec66274f23580613eacc44ce16d7893417a1b8',
        why: 'Says IDoc and RFC must be replaced step by step; under the Level concept they are Level B and may stay.',
      },
    ],
  },
  {
    id: 'B1',
    status: 'adopted',
    adopted:
      'Anchored security review tasks: AUTHORITY-CHECK without evaluating sy-subrc, dummy or blank fields, "*" values, SUBMIT … USER, dynamic WHERE clauses from input, CLIENT SPECIFIED and native SQL, OPEN DATASET with an input-built path, INSERT REPORT / GENERATE, EDITOR-CALL, COMMUNICATION, and CALL TRANSACTION without WITH or WITHOUT AUTHORITY-CHECK.',
    sections: [
      { file: 'security/security-secure-development.md', heading: 'Berechtigungsprüfungen richtig implementieren', hashAtAdoption: '446c863173c0052f40b73e397e124c250fff4c8ab46ef9231f2c0396da2f5ee6' },
      { file: 'security/security-secure-development.md', heading: 'Sichere Datenbankzugriffe: OpenSQL Best Practices', hashAtAdoption: '67e4d0955f5f671683add843534eb166e1af91cfaefb9e77d88c5cfe96ea0cb0' },
      { file: 'security/security-secure-development.md', heading: 'Mandantensicherheit: Datentrennungen garantieren', hashAtAdoption: '474d255f7b7be3dcc9a24db747686b348a72f2b4b892c0c19c19ff9f7b85b249' },
      { file: 'security/security-secure-development.md', heading: 'Sichere Dateizugriffe und Pfadtraversal-Schutz', hashAtAdoption: '3a91e4845c9dcdb53dba45f2156c4f6de7804c5692636547c063593359fc2dfe' },
      { file: 'security/security-examples.md', heading: 'Directory Traversal (Write Access)', hashAtAdoption: 'ccbe2718f43fe70f6d0f4287a07fa211c885a189dd2c5e8b083f5ad8c6794224' },
      { file: 'security/security-examples.md', heading: 'ABAP Command Injection (Report)', hashAtAdoption: '0a463bbb59a7d5d872831a0774a6c469494b312033b8bcd0bc5e05e298517c39' },
      { file: 'security/security-examples.md', heading: 'Dangerous ABAP Commands', hashAtAdoption: 'db752d86b647a82fe5065b16512a5ffc2e5b04b34459d846e0e9e4d0a22d534c' },
      { file: 'abap/clean_and_modern_abap.md', heading: 'Nutzung neuer Befehlsvarianten (CALL TRANSACTION WITH AUTHORITY-CHECK)', hashAtAdoption: 'fcad0ed3b59529c7857e22a83a4649fcabcfb62d365f8df6100f4989c7040ecf' },
    ],
  },
  {
    id: 'B2',
    status: 'adopted-with-correction',
    adopted:
      'A curated list of concept successors (application log → CL_BALI_*, background report/job → Application Job, CL_BCS → CL_BCS_MAIL_MESSAGE, BOPF → RAP, SM30 → Business Configuration, SE63 → Maintain Translations), labelled as the DSAG guide\'s list and kept outside signed evidence.',
    correction:
      'The guide heads its "old" column "Level B–D". We take no level from that table: the level of an object comes from SAP\'s Cloudification Repository, and the list is shown as the guide\'s advice, not as SAP\'s catalog.',
    sections: [{ file: 'clean-core/solution-approach.md', heading: 'Neue Konzepte', hashAtAdoption: 'b2e8929feb3808e8e12d1a9613c37df88da5370d6d10319302c61da7ac40da77' }],
  },
  {
    id: 'B3',
    status: 'adopted',
    adopted: 'Reports are not part of ABAP Cloud; their successors are a Fiori app on RAP or an Application Job, so background-only logic is offered an Application Job scaffold.',
    sections: [{ file: 'clean-core/solution-approach.md', heading: 'Migration von Reports', hashAtAdoption: '879cfb3f3d92a7a60e3c7d4a7e3e3483bf06e56766eb3dfac2790ff912274d11' }],
  },
  {
    id: 'B4',
    status: 'adopted',
    adopted:
      'SAP code, released or not, is called through an own access layer: injectable data access for ABAP Unit, and classic return codes turned into exception classes.',
    sections: [
      { file: 'abap/modern_development.md', heading: 'Verwendung von SAP Code - Gesetz von Demeter', hashAtAdoption: '8050da0566544379a0a458e358a875b47a1a58779e03ee2cf8d6adc02cad7667' },
      { file: 'abap/modern_development.md', heading: 'Testbarkeit durch gutes Design', hashAtAdoption: '62843e97c83d7a74d5d2ba3c376358a064f06cdc6bebf7b8a1a8e318960125a4' },
    ],
  },
  {
    id: 'B5',
    status: 'adopted',
    adopted: 'Record which checks actually ran on generated code — passed, failed or not run — and never present a proposed check as an executed one.',
    sections: [{ file: 'artificial-intelligence/index.md', heading: 'Systemkontext und ausgeführte Prüfungen bei MCP-gestützten Änderungen', hashAtAdoption: '4bcc6ee9ad2747f572cf5eed8e019560b7d1834e95020469d65f4cfc30111847' }],
  },
  {
    id: 'B6',
    status: 'adopted',
    adopted: 'Never copy SAP code: a heuristic review task flags custom objects that look like copies of SAP objects.',
    sections: [{ file: 'clean-core/what-is-clean-core.md', heading: '“NIEMALS SAP CODE KOPIEREN”', hashAtAdoption: '2eab3ff122690d68bba25ac4375036ab46fded95faefa6d3c26d3e201b8119f3' }],
  },
  {
    id: 'B7',
    status: 'adopted-with-correction',
    adopted:
      'Every detected modification is listed for export with three open questions — purpose, effect on upgrades, tested scenarios — and an approval process for Level D is recommended; the Documentation tool takes no input and no sign-off.',
    correction:
      'The guide\'s organisation chapter equates "Classical Extensibility" with Level D. Under the Level concept classic BAdIs and enhancement spots are Level B, so the approval question applies to modifications (Level D) only.',
    sections: [
      { file: 'clean-core/what-is-clean-core.md', heading: 'Saubere Modifikationen', hashAtAdoption: '2e4e57a9e562beae60ddd27ea28c6c146a1617547dd240a9f419b83ea58ca54f' },
      { file: 'organization/index.md', heading: 'Best Practice', hashAtAdoption: '0bb254c07402203893a25e7cecc48059e43957340bd0e7f89276e65b146222a0' },
    ],
  },
  {
    id: 'B8',
    status: 'adopted',
    adopted: 'Obsolete technologies in uploaded code are evidence of their own: BOPF, SEGW projects and DDIC-based CDS views (sqlViewName).',
    sections: [
      { file: 'core-data-services/index.md', heading: 'DDIC-based views - OBSOLET', hashAtAdoption: 'abd4dffae690fff846aea371be62be3bd1e56b8e19a1d02c92cad9b663b1e691' },
      { file: 'clean-core/problems-and-challenges.md', heading: 'Kundencode', hashAtAdoption: '890df71931e3adcbce7a0451eee121fb3d85a26bf18fe48ab9ff29c0c636a9ca' },
      { file: 'abap/restful_abap.md', heading: 'OData Veröffentlichung', hashAtAdoption: 'a9b302ecb47f19c38336fb6efa62eaa9b4325a0f6fc28875c565b9c9b39e49e2' },
    ],
  },
  {
    id: 'B9',
    status: 'adopted-with-correction',
    adopted: 'Comments in generated code say why, not what, in English, with ABAP Doc on public methods that carries the original line anchor.',
    correction: 'The guide gives the ABAP Doc prefix as `"!.` — the prefix is `"!`; the trailing period is a typo and is not taken over.',
    sections: [
      { file: 'documentation/dev_object_related_doc.md', heading: 'Dokumentationssprache', hashAtAdoption: '35cd337d2b15818efed234477b850a5ff1b487d0069ae6e6ca64151ca638b353' },
      { file: 'documentation/dev_object_related_doc.md', heading: 'Kommentare im Quellcode', hashAtAdoption: 'c17db0d4d6e19709a7b17b996bb365fef686de2f3d5ef18b8021ce42cc9b66c2' },
      { file: 'documentation/dev_object_related_doc.md', heading: 'ABAP Doc', hashAtAdoption: 'a9bcd779cdd66cd44d4749d7b98a60db1dc8c2240b3a7fffa4c6888c4611e676' },
    ],
  },
  {
    id: 'B10',
    status: 'adopted',
    adopted: 'Quality gates on joined ATC results: legacy findings may be baselined, security findings never are — zero tolerance.',
    sections: [{ file: 'application-lifecycle-management/ensuring-quality.md', heading: 'Quality Gates im Release-Prozess', hashAtAdoption: '90fd82966e71bc2d0405b599ca29c0a997dce872a7a8386b30e8681b283c3d8c' }],
  },
];
