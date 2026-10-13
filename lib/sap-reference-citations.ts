/**
 * lib/sap-reference-citations.ts — what Clean-Core.io takes from four SAP
 * repositories on GitHub (roadmap 3.0.12, owner decision 13.10.2026), one row
 * per reviewed reference:
 *
 *   SAP-samples/abap-cheat-sheets            Apache-2.0  ABAP Cloud usage (RAP, application jobs, CL_BALI_*, mail, XCO, released APIs)
 *   SAP-samples/abap-platform-refscen-flight Apache-2.0  reference RAP app (CDS, BDEF, DCL, authorization, draft) — template for our RAP scaffold
 *   SAP/styleguides (Clean ABAP)             CC BY 3.0   rules for generated ABAP
 *   SAP/abap-file-formats                    MIT         JSON schemas of ABAP object files, to validate generated object files
 *
 * Same statuses as the DSAG registry (lib/dsag-citations.ts):
 *   - `adopted` — followed as the cited files or sections show;
 *   - `adopted-with-correction` — followed, `correction` says what we changed and why;
 *   - `not-adopted` — deliberately not followed; `correction` says why.
 * A file or section that bears on a row but is not followed goes under `watched`.
 *
 * From the samples we follow the structure; no code is copied. Clean ABAP
 * rules are cited and paraphrased (and partly enabled through abaplint). The
 * AFF schemas are the only content copied, unchanged (lib/generated/aff-schemas/).
 *
 * `hashAtAdoption` is the SHA-256 from `lib/generated/sap-references/<source>.json`
 * at the commit in `SAP_REFERENCE_REVIEWED`: of the whole file for a file ref, of
 * the section's normalised text for a ref with `section`. tests/sap-references.spec.ts
 * fails when an adopted file or section is gone or its hash moved — on the weekly
 * bot branch `chore/sync-sap-references` that is the signal to review the row by
 * hand, then record the new hash (and, once all rows of a source are reviewed,
 * the new commit). Watched and not-adopted refs only produce an annotation.
 *
 * Code that follows a row cites it with one of two comments, checked by the spec:
 *   `// SAP sample: <repo>@<sha8> <path>`   e.g. `// SAP sample: SAP-samples/abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#r_traveltp_cd.bdef.asbdef`
 *   `// Clean ABAP: <section>`              e.g. `// Clean ABAP: Prefer RETURNING to EXPORTING`
 * `<sha8>` is the first eight characters of the reviewed commit, `<path>` a file a
 * row adopts (or the Markdown file of an adopted section), `<section>` a heading a
 * `styleguides` row adopts. Rows `clean-abap-<section>` are added by the change
 * that enables a Clean ABAP rule.
 */
import type { SapReferenceKey } from './sap-references';

export type SapReferenceAdoption = 'adopted' | 'adopted-with-correction' | 'not-adopted';

export interface SapReferenceRef {
  /** Path in the source repository, e.g. `src/colldraft/#dmo#r_traveltp_cd.dcls.asdcls` or `22_Released_ABAP_Classes.md`. */
  path: string;
  /** For Markdown: the heading exactly as the source writes it. Without it the ref is the whole file. */
  section?: string;
  /** SHA-256 of the file, or of the section's normalised text, when the row was reviewed. */
  hashAtAdoption: string;
}

export interface SapReferenceWatchedRef extends SapReferenceRef {
  /** Why the product does not follow this file or section. */
  why: string;
}

export interface SapReferenceCitation {
  /** `flight-*`, `cheat-*`, `aff-*` or `clean-abap-*`. */
  id: string;
  source: SapReferenceKey;
  status: SapReferenceAdoption;
  /** What the product takes over, in short English. */
  adopted: string;
  /** Required unless `status` is `adopted`. */
  correction?: string;
  refs: SapReferenceRef[];
  watched?: SapReferenceWatchedRef[];
}

/** The commit of each source every `hashAtAdoption` below was taken at. */
export const SAP_REFERENCE_REVIEWED: Record<SapReferenceKey, { repo: string; branch: string; commit: string; licence: string; licenceUrl: string }> = {
  'abap-cheat-sheets': {
    repo: 'SAP-samples/abap-cheat-sheets',
    branch: 'main',
    commit: 'd43eb13c4c7c17599f5709a0314bca257b283137',
    licence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  'abap-platform-refscen-flight': {
    repo: 'SAP-samples/abap-platform-refscen-flight',
    branch: 'ABAP-platform-cloud',
    commit: '93f769170fa0b41591c3a4d39284f353cd90799e',
    licence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  styleguides: {
    repo: 'SAP/styleguides',
    branch: 'main',
    commit: '6279311f42bf1f91896935c071bec8dbca97cf59',
    licence: 'CC-BY-3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  'abap-file-formats': {
    repo: 'SAP/abap-file-formats',
    branch: 'main',
    commit: 'e42c8003d8aa7b7b510b6ff4a8f1ed83a97a835b',
    licence: 'MIT',
    licenceUrl: 'https://opensource.org/licenses/MIT',
  },
};

export const SAP_SAMPLE_COMMENT_PREFIX = '// SAP sample: ';
export const CLEAN_ABAP_COMMENT_PREFIX = '// Clean ABAP: ';
export const sapSampleComment = (source: SapReferenceKey, path: string) =>
  `${SAP_SAMPLE_COMMENT_PREFIX}${SAP_REFERENCE_REVIEWED[source].repo}@${SAP_REFERENCE_REVIEWED[source].commit.slice(0, 8)} ${path}`;
export const cleanAbapComment = (section: string) => `${CLEAN_ABAP_COMMENT_PREFIX}${section}`;

export const SAP_REFERENCE_CITATIONS: SapReferenceCitation[] = [
  /* ---------------------------------------------- SAP-samples/abap-platform-refscen-flight */
  {
    id: 'flight-dcl',
    source: 'abap-platform-refscen-flight',
    status: 'adopted',
    adopted:
      'Read access is declared at the data layer: one access control (DCL) per CDS entity of the business object, the projection inheriting the conditions of the base entity, and an authorization object of its own for the business object.',
    refs: [
      { path: 'src/colldraft/#dmo#r_traveltp_cd.dcls.asdcls', hashAtAdoption: '7eded62bcead711d1c68f7c2d2f8aa2de65b9a14990e3b4832b9294836dff400' },
      { path: 'src/colldraft/#dmo#c_traveltp_cd.dcls.asdcls', hashAtAdoption: '553633b7cd5d7fc6ddc0d2456bc00621214850d3f83f14673645a160b35c998b' },
      { path: 'src/colldraft/#dmo#tr_cd.suso.xml', hashAtAdoption: 'd78040fe25f33999eb4da8ccb9da82b31be0017616dee32986214afbfe03285c' },
    ],
  },
  {
    id: 'flight-bdef',
    source: 'abap-platform-refscen-flight',
    status: 'adopted',
    adopted:
      'The behavior definition of a managed business object: strict mode 2, draft, ETag and lock master, `authorization master ( global, instance )` with an own authorization context naming the authorization object, and a projection behavior that uses what the base exposes.',
    refs: [
      { path: 'src/colldraft/#dmo#r_traveltp_cd.bdef.asbdef', hashAtAdoption: '13602067e2f3a67bc0f91634ce265bbf7167f2cea32b5924594c8e4cf3334b19' },
      { path: 'src/colldraft/#dmo#c_traveltp_cd.bdef.asbdef', hashAtAdoption: 'e36bb3ca9954bda9a3a4941fb6c71c3353dac59d703e6f42905e5ab4d78c363d' },
      { path: 'src/draft/#dmo#r_travel_d.bdef.asbdef', hashAtAdoption: 'b31ccd2c71a347e5c6e21cb744c1a1f7a47d990955d31911285a4eb6366e4898' },
    ],
  },
  {
    id: 'flight-auth-impl',
    source: 'abap-platform-refscen-flight',
    status: 'adopted',
    adopted:
      'Global and instance authorization are implemented in the behavior pool (`get_global_authorizations`, `get_instance_authorizations`) with AUTHORITY-CHECK on the business object\'s own authorization object.',
    refs: [{ path: 'src/colldraft/#dmo#bp_r_traveltp_cd.clas.locals_imp.abap', hashAtAdoption: 'ec9c0875661138359a1917ac8d90daa68ad63b5dc600f978a8e96c5ee023ea6f' }],
  },

  /* ---------------------------------------------- SAP-samples/abap-cheat-sheets */
  {
    id: 'cheat-apj',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted:
      'Background work in ABAP Cloud is an application job: a class implementing IF_APJ_RT_RUN, an application job catalog entry and a job template, created and scheduled through CL_APJ_DT_CREATE_CONTENT and CL_APJ_RT_API.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'Application Jobs', hashAtAdoption: 'ddcfb75cea2c1c81b611e95d55f86165f62902c87b5da8bbdfaf6de0f89e917e' }],
  },
  {
    id: 'cheat-bali',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'Application logs in ABAP Cloud are written and read with the CL_BALI_* classes (log object, subobject and external ID in the header), not with the classic BAL function modules.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'Application Log', hashAtAdoption: 'eb629d7af57795737945fcc19a0ed7367b4f9fd547fc5e964fe7b000ff8165e5' }],
  },
  {
    id: 'cheat-mail',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'Mail in ABAP Cloud is sent with CL_BCS_MAIL_MESSAGE (synchronously or with send_async), which needs an e-mail configuration in the system.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'Sending Emails', hashAtAdoption: '941f24cd8fa96e80df22d17bd247e13d1c63fb082ab97368e636569bb693a18d' }],
  },
  {
    id: 'cheat-xco',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'System fields that ABAP Cloud does not offer directly (user, date, time, language and more) are read through the released XCO library.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'XCO Representations of SY Components', hashAtAdoption: '1391f9b48bb0fc667b599263280ae78d9ddbe06395dacd3f7f071a24e0a2aec7' }],
  },
  {
    id: 'cheat-released-apis',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'ABAP Cloud code uses released APIs only; whether an object is released is looked up, not assumed.',
    refs: [{ path: '19_ABAP_for_Cloud_Development.md', section: 'Finding Released APIs', hashAtAdoption: '163ce41da581ea8e858c401e778d7bbbba67b2fc00e827b83e7646ccdf009598' }],
  },
  {
    id: 'cheat-rap-auth',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'Read access is checked implicitly through CDS access control; changing access is checked through RAP authorization control in the behavior definition and its implementation.',
    refs: [
      { path: '25_Authorization_Checks.md', section: 'Implicit Authorization Checks Using CDS Access Control for Read Accesses', hashAtAdoption: '7ad824985e749a786f2625563455b0331dd2a861e9a93c55d413457fd63842f1' },
      { path: '25_Authorization_Checks.md', section: 'Excursion: Authorization Control in RAP', hashAtAdoption: 'd990e620c8ba6f5e466fde9f4b1f466e2f199d72bb8fc5ef9f19060e7e54fe00' },
    ],
  },

  /* ---------------------------------------------- SAP/abap-file-formats */
  {
    id: 'aff-schemas',
    source: 'abap-file-formats',
    status: 'adopted',
    adopted:
      'The JSON schemas of the object types our scaffolds write (TABL with its table type, DDLS, BDEF, SRVD, SRVB, CLAS, DCLS) and of the application job catalog entry and template (SAJC, SAJT), copied unchanged to validate generated object files.',
    refs: [
      { path: 'file-formats/bdef/bdef-v1.json', hashAtAdoption: 'bd89b642dbcbee06af6ad64735f926fe40f64f7c50c550289eefca23930fa335' },
      { path: 'file-formats/clas/clas-v1.json', hashAtAdoption: 'ad907fedc79293554a9189d4f2fbf29e3e71d0a588fcc589b8ade256a1d15cff' },
      { path: 'file-formats/dcls/dcls-v1.json', hashAtAdoption: 'caf2f8ad3facc88e10a644e9a28634a2de74f27c30d4c42a8ee2a14e41fc7b69' },
      { path: 'file-formats/ddls/ddls-v1.json', hashAtAdoption: 'ca662007557098a6692bbba6b5b651a8532e7e97fdd61922d0bd98f6afd71ed3' },
      { path: 'file-formats/sajc/sajc-v1.json', hashAtAdoption: 'b2108ef337ba133ea936793639199f95fae32dcff6af5d08ea59b02e303b168d' },
      { path: 'file-formats/sajt/sajt-v1.json', hashAtAdoption: '5ceede02d0d0a4eb0d5d969a11687c171dc949e2784cd9a453c70383c9006ab1' },
      { path: 'file-formats/srvb/srvb-v1.json', hashAtAdoption: '6c55659de34304c0f5a53dde7748c25d3efc711e28157f361fa8f3c59ce63b49' },
      { path: 'file-formats/srvd/srvd-v1.json', hashAtAdoption: '8022f453a976108f721bb7a869636cc91365786e8e92a04c214fae9b61a74795' },
      { path: 'file-formats/tabl/tabl-v1.json', hashAtAdoption: '2fa7e5d5ffd111972bd92f5aa48e7a11a666689b787883fe981a38a6b38f71e4' },
      { path: 'file-formats/tabl/tabt-v1.json', hashAtAdoption: '8b93d82547f4a7c2588c237e7634c481e6049a6261496e484cea422897b9d7d0' },
    ],
  },
];
