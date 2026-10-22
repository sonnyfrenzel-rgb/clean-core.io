import { TERMS_VERSION } from '@/lib/constants';
import { archivedTerms } from '@/lib/terms-versions';

/**
 * What each version changed, newest first, keyed by the version id.
 *
 * The gate shows every entry newer than the version the account accepted, not
 * only the latest: an account still on Terms v2.0.0 meeting Terms v2.2.0 has not been told
 * about Terms v2.1.0 either, and a list that showed only the last step would ask it to
 * accept changes it was never shown. An account with no recorded acceptance
 * sees them all.
 */
export const WHAT_CHANGED: ReadonlyArray<{ version: string; items: ReadonlyArray<{ lead: string; text: string }> }> = [
  {
    // v2.3.0, Fassung 1.1 of the legal texts (3.0.21).
    version: '2026-10-23',
    items: [
      {
        lead: 'German or English.',
        text:
          'You can now conclude the contract in German or in English (section 1.4). The version you accept in ' +
          'that language is the one that governs, even if you later switch the interface language. The German ' +
          'version is at clean-core.io/terms/de.',
      },
      {
        lead: 'No right of withdrawal — but you can leave at any time.',
        text:
          'The platform is free and your account data is used only to provide it, so there is no statutory ' +
          'right of withdrawal (section 13). Nothing changes for you in practice: you can end the contract at ' +
          'any time by deleting your account, and you can withdraw any consent — community mail, surveys, your ' +
          'motivation note — whenever you like.',
      },
      {
        lead: 'Your own Claude key.',
        text:
          'Besides Google Gemini you can store your own Anthropic key — for a business account held with ' +
          'Anthropic Ireland — once you accept the separate Additional Agreement on Own Model Keys (section 5.2). ' +
          'Requests on that key are processed in the United States. Section 5.3 says who is responsible for ' +
          'what, and that no call ever falls back to the platform key.',
      },
      {
        lead: 'A record of what you accepted.',
        text:
          'We record which version you accepted, in which language and when, with the SHA-256 digest of its ' +
          'wording, and send you a confirmation by e-mail. After the contract ends we keep only that record, ' +
          'under a pseudonym, until the end of the third calendar year, and then delete it (sections 1.3 and 10.5).',
      },
      {
        lead: 'What the service is, in plain words.',
        text:
          'Sections 2.2, 3 and 4.1 describe the voluntary, one-person operation and what the platform delivers: ' +
          'results the engine computes without a model, and drafts a model writes — marked as AI-generated. ' +
          'If code must not leave the platform, switch the model steps off in the settings, the automatic ones ' +
          'included (section 5.4).',
      },
      {
        lead: '',
        text:
          'The Privacy Policy was rewritten at the same time: the own Anthropic key and who receives what, the ' +
          'proof log and how long each record is kept, and a shorter notice to the operator about new accounts ' +
          'that no longer carries your name, address or motivation.',
      },
    ],
  },
  {
    version: '2026-10-03',
    items: [
      {
        lead: 'What is computed, and what a model writes.',
        text:
          'Section 4.1 now names which results come from the deterministic engine, without a language model — the ' +
          'findings with their line references, the route, the Clean Core Score, the clean core levels, the process ' +
          'reconstructed from your code and the Economics calculation from your own figures — and which are written ' +
          'by a language model where you use those steps: summaries, business names and sentences, the solution ' +
          'design, generated code, documentation and tests. Engine results are evidence, not a guarantee; model ' +
          'output is a draft. Both are reviewed before use, as before.',
      },
    ],
  },
  {
    version: '2026-09-18',
    items: [
      {
        lead: 'Do not upload personal data of third parties.',
        text:
          "ABAP carries it more often than people expect: a developer's user id, a name in a comment, a real " +
          'customer number, a production record used as test data. Strip those before you upload. We do not offer ' +
          'a data processing agreement, so there is no contract under which we could process such data for you.',
      },
      {
        lead: 'You must be at least 18.',
        text: 'Accepting these Terms is entering into a contract, and this is a tool for professional software work.',
      },
      {
        lead: '',
        text:
          'The Privacy Policy was extended at the same time — server logs, concrete retention periods, and a German ' +
          'version that prevails if the two ever differ.',
      },
    ],
  },
];

/**
 * The changes since the version an account accepted. Only an archived, i.e.
 * published, version is a point to count from: an account that accepted a date
 * that was never published (on dev, the 6 October draft of the current Terms before the
 * release moved to 3 October) compared newer than every entry and saw an empty
 * "What changed" (owner, 03.10.2026). Such an account, and any case that would
 * leave nothing, sees the changes of the version in force.
 */
export function whatChangedSince(accepted: string | null | undefined) {
  const counted = accepted && archivedTerms(accepted)
    ? WHAT_CHANGED.filter((entry) => entry.version > accepted)
    : WHAT_CHANGED;
  return counted.length > 0 ? counted : WHAT_CHANGED.filter((entry) => entry.version === TERMS_VERSION);
}
