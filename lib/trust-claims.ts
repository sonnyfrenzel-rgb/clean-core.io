/**
 * What the upload screen is allowed to say about your code — roadmap step 0.11,
 * `DESIGN.md` §6.1.3 (decision Sonny, 15.09.2026).
 *
 * The card "Your code and your trust" is not copy. Every line on it is a claim,
 * and a claim is only allowed here if a document in this repository already
 * carries it: the Terms, the Privacy Policy, or `SECURITY.md`. That is why the
 * text lives in this list next to the sentence that backs it, rather than in the
 * component: `tests/trust-card-guard.spec.ts` reads this file, opens each source
 * document, and fails when a claim's `evidence` is not in it verbatim. A claim
 * nobody can point at is the one thing this product must not print.
 *
 * Adding a line to the card therefore means writing it into the Terms or the
 * Privacy Policy first. That is the intended order, not an obstacle.
 */

/** The only documents a claim may cite. Anything else is not a source. */
export const TRUST_SOURCE_FILES = [
  'app/terms/page.tsx',
  'app/datenschutz/page.tsx',
  'SECURITY.md',
] as const;

export type TrustSourceFile = (typeof TRUST_SOURCE_FILES)[number];

export interface TrustSource {
  /** The document in this repository that carries the claim. */
  file: TrustSourceFile;
  /** Where the reader is sent to read it. */
  href: string;
  /** How the link reads on the card. */
  label: string;
  /**
   * Text that must occur, verbatim, in `file` — compared after tags, markdown
   * emphasis, HTML entities and line breaks are normalised away. These are the
   * sentences the claim is made of, not a paraphrase of them.
   */
  evidence: string[];
}

export interface TrustClaim {
  id: string;
  /** Exactly what the card says — the rendered card may print nothing else. */
  text: string;
  /** Resolved to a lucide icon by the card; kept out of this file so a test can read it. */
  icon:
    | 'residency'
    | 'access'
    | 'proxy'
    | 'seal'
    | 'tracking'
    | 'erasure'
    | 'training'
    | 'security'
    | 'free';
  sources: TrustSource[];
}

/** The public repository the product names as its own, and the file in it. */
export const SECURITY_MODEL_URL =
  'https://github.com/sonnyfrenzel-rgb/clean-core.io/blob/main/SECURITY.md';

/**
 * What you confirm by uploading — one line, and deliberately no checkbox: the
 * Terms were accepted at sign-up and a second tick would only pretend to add
 * consent that already exists (`DESIGN.md` §6.1.3).
 */
export const TRUST_PLEDGE: TrustClaim = {
  id: 'pledge',
  text: 'By uploading, you confirm you may share this code for analysis, including with the Google Gemini API.',
  icon: 'access',
  sources: [
    {
      file: 'app/terms/page.tsx',
      href: '/terms#third-party-ai',
      label: 'Terms §5',
      evidence: [
        'Do not submit any content to the Platform that you are not permitted to disclose to the relevant third-party AI provider',
      ],
    },
    {
      file: 'app/terms/page.tsx',
      href: '/terms#your-content',
      label: 'Terms §8',
      evidence: [
        'You warrant that you are entitled to upload and process any content, code, or data you submit to the Platform',
      ],
    },
  ],
};

export const TRUST_CARD_TITLE = 'Your code and your trust';
/** On small screens the card is collapsed behind this control. */
export const TRUST_CARD_DISCLOSURE = 'Why you can trust this';
export const TRUST_CARD_SHOW = 'Show';
export const TRUST_CARD_HIDE = 'Hide';

/**
 * The claim about who can open the project. What it is allowed to say is decided
 * by `firestore.rules`, not by us: for as long as the rule grants the admin read
 * access to `projects`, the card has to name that account; once it does not, the
 * card has to say the owner alone and must not name the admin as a reader.
 * `tests/trust-card-guard.spec.ts` reads the rule and fails in both directions.
 *
 * Sonny, 16.09.2026: the standing admin read on projects is removed, so the card
 * reads as below. The emergency case — a deliberate server-side act through the
 * Admin SDK, which bypasses the rules by design, and which leaves a record — is
 * not a standing permission and is spelled out in the Privacy Policy behind the
 * link, which is why the card says "standing access" and not "nobody can".
 */
export const ACCESS_CLAIM_ID = 'access';
/** What the card must say while the rule grants the admin a read. */
export const ACCESS_NAMES_ADMIN = 'administrator';
/** What the card must say once it does not. */
export const ACCESS_OWNER_ONLY = 'no one else has standing access';

export const TRUST_CLAIMS: TrustClaim[] = [
  {
    id: 'residency',
    text: 'Stored in the EU — Google Cloud, Belgium (europe-west1).',
    icon: 'residency',
    sources: [
      {
        file: 'app/datenschutz/page.tsx',
        href: '/datenschutz#hosting',
        label: 'Privacy Policy §4',
        evidence: [
          'on European servers in the Belgium (europe-west1) region — data residency in the EU',
        ],
      },
    ],
  },
  {
    id: ACCESS_CLAIM_ID,
    text: 'Only the account that created this project can open it; no one else has standing access.',
    icon: 'access',
    sources: [
      {
        file: 'app/datenschutz/page.tsx',
        href: '/datenschutz#project-access',
        label: 'Privacy Policy §8',
        evidence: [
          'Only the account that created a project can open it',
          'No other account has standing access, and our administrator account does not either',
        ],
      },
    ],
  },
  {
    id: 'proxy',
    text: 'Model calls go through our server; keys never reach the browser. Your own key is stored encrypted.',
    icon: 'proxy',
    sources: [
      {
        file: 'app/terms/page.tsx',
        href: '/terms#third-party-ai',
        label: 'Terms §5',
        evidence: [
          'stored encrypted and is used solely to forward your requests to the Google Gemini API on your behalf via a secure backend proxy; your key is never exposed to the browser',
        ],
      },
    ],
  },
  {
    id: 'seal',
    // "Every analysis" was more than the evidence says and more than the code
    // does. An analysis that fails — in the model call, in signing, in the
    // write — produces no run at all; the reservation goes back and nothing is
    // recorded (QA review of 5e27b10cac02). The sentence now claims exactly
    // what SECURITY.md §14.1 backs: the ones that complete.
    text: 'Every completed analysis is sealed as a signed, unchangeable run.',
    icon: 'seal',
    sources: [
      {
        file: 'SECURITY.md',
        href: SECURITY_MODEL_URL,
        label: 'Security model §14.1',
        evidence: [
          'Every successful analysis is persisted as a Run document',
          'signed with HMAC-SHA256',
          'Runs are immutable to clients',
        ],
      },
    ],
  },
  {
    id: 'tracking',
    text: 'No analytics, advertising or tracking cookies.',
    icon: 'tracking',
    sources: [
      {
        file: 'app/datenschutz/page.tsx',
        href: '/datenschutz#cookies',
        label: 'Privacy Policy §7',
        evidence: ['We do not use analytics, advertising, or tracking cookies'],
      },
    ],
  },
  {
    id: 'erasure',
    text: 'Delete your account and its projects at any time; backup copies age out within 30 days.',
    icon: 'erasure',
    sources: [
      {
        file: 'app/datenschutz/page.tsx',
        href: '/datenschutz#your-rights',
        label: 'Privacy Policy §5',
        evidence: [
          'which immediately deletes your live database and authentication entries, including every project and the source code in it',
          'Residual copies in encrypted backups age out within 30 days',
        ],
      },
    ],
  },
  {
    id: 'training',
    text: "With our community key, Google does not use your code to train its models — the paid Gemini API terms apply. With your own key, your Google account's terms apply.",
    icon: 'training',
    sources: [
      {
        file: 'app/datenschutz/page.tsx',
        href: '/datenschutz#source-code',
        label: 'Privacy Policy §3',
        evidence: [
          'The shared community key is a paid Gemini API key, so the paid Gemini API terms govern every request made with it: Google does not use your code to train its models',
          'When you use your own key (BYOK), the terms of your own Google account apply',
        ],
      },
    ],
  },
  {
    id: 'security',
    text: 'Our security model is public.',
    icon: 'security',
    sources: [
      {
        file: 'SECURITY.md',
        href: SECURITY_MODEL_URL,
        label: 'SECURITY.md',
        evidence: [
          'This document describes the security architecture and hardening measures implemented in the Clean-Core.io platform',
        ],
      },
    ],
  },
  {
    id: 'free',
    text: 'Clean-Core.io is a free community project: there is no paid tier, we accept no payment, and we do not sell, rent or commercially use your code.',
    icon: 'free',
    sources: [
      {
        file: 'app/terms/page.tsx',
        href: '/terms#free-community-edition',
        label: 'Terms §2',
        evidence: [
          'Clean-Core.io is a free community project: there is no paid tier',
          'No payment, subscription, or consideration is required or accepted',
        ],
      },
      {
        file: 'app/datenschutz/page.tsx',
        href: '/datenschutz#source-code',
        label: 'Privacy Policy §3',
        evidence: [
          'We do not sell, rent, or use your uploaded source code for commercial purposes',
        ],
      },
    ],
  },
];
