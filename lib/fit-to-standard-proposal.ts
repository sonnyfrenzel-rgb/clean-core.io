import { checkSapReferences, type SapIdCheck } from './sap-reference-check';
import { FIT_PROPOSAL_SCHEMA } from './model-response-schema';
import { FIT_DISPOSITION_LABELS, countEntries, type FitEntry, type FitRefKind } from './fit-to-standard-design';

/**
 * Model proposals for SAP standard references — roadmap 3.0.20, step F5
 * (`docs/design/fit-to-standard-concept.md` §4.3 step 6; owner decision 5: a
 * model may propose SAP apps and scope items — on the shared key within the
 * existing limits and with BYOK; every identifier is checked against SAP's own
 * data, a mismatch is dropped).
 *
 * Only on request, and only for the steps nobody resolved (`gap-open`). The
 * model answers in a constrained schema with an identifier and SAP's title per
 * step — nothing else of its text is shown: no reason, no description, so no
 * sentence of the model reaches the reader that the output guards would have
 * to judge. Every identifier goes through `checkSapReferences`
 * (`lib/sap-reference-check.ts`), which reads the identifier with the title
 * the model gave beside it:
 *
 *   - `mismatch`   → dropped; SAP's title is shown beside the dropped ID;
 *   - `verified`, `catalog`, `unverified` → kept as a candidate, E1 and no
 *     higher, provenance *Model proposal*, check word as the checker gave it;
 *   - an identifier the checker does not read as an SAP identifier at all →
 *     dropped ("not an SAP identifier the check can read").
 *
 * "Verified" says the identifier and its title are SAP's; it never says the
 * SAP object does the step (the checker says the same). Without a model the
 * design is the engine's and complete; this step only adds candidates.
 *
 * Pure: no React, no network.
 */

export { FIT_PROPOSAL_SCHEMA };

export const MAX_FIT_PROPOSALS = 60;

const KIND_WORDS: Readonly<Record<Exclude<FitRefKind, 'key-user-tool'>, string>> = {
  'fiori-app': 'SAP Fiori app',
  'scope-item': 'SAP Best Practices scope item',
  api: 'released API',
  'cds-view': 'released CDS view',
};

/** The prompt: the open steps, and the rule that an unknown ID is left out, never guessed. */
export function fitProposalPrompt(input: {
  programName: string;
  edition: 'public' | 'private';
  entries: readonly FitEntry[];
}): string {
  const open = input.entries.filter((e) => e.disposition === 'gap-open' && e.comparability === 'business-comparable');
  const lines = open.map((e) => `- ${e.elementId}: "${e.plainLabel ?? e.label}" (${e.anchor ? `lines ${e.anchor.lineStart}-${e.anchor.lineEnd}` : 'no line'})`);
  return [
    `You help a fit-to-standard workshop for the custom SAP ABAP program ${input.programName}, target SAP S/4HANA Cloud ${input.edition === 'public' ? 'Public' : 'Private'} Edition.`,
    'For each business step below, name at most one SAP standard object that may do the same step in SAP standard: a Fiori app (its F-number), a scope item (its ID), a released API or a released CDS view.',
    'Rules:',
    '- Give the identifier exactly as SAP writes it and SAP\'s own title of it.',
    '- Only identifiers you are certain SAP publishes. If you are not certain, leave the step out. Never invent or guess an identifier.',
    '- Leave out every step SAP standard does not do; an empty list is a correct answer.',
    '- Use the step ids exactly as given. Answer only with the JSON object of the schema.',
    '',
    'Steps:',
    ...lines,
  ].join('\n');
}

export interface DroppedProposal {
  elementId: string;
  id: string;
  /** SAP's title, where SAP data in the repository holds one. */
  sapTitle: string | null;
  reason: string;
}

export interface ProposalOutcome {
  entries: FitEntry[];
  kept: number;
  dropped: DroppedProposal[];
  /** The answer could not be read as the schema — nothing was applied. */
  unreadable: boolean;
}

function checkOf(kind: Exclude<FitRefKind, 'key-user-tool'>, id: string, title: string): SapIdCheck | null {
  // The checker reads the title the model wrote next to the ID; the kind word helps it read the kind.
  const text = `${KIND_WORDS[kind]} ${id} ${title ? `"${title}"` : ''}`.trim();
  const checks = checkSapReferences(text);
  return checks.find((c) => c.id.toUpperCase() === id.toUpperCase()) ?? null;
}

/**
 * The model's answer applied to the open steps of a design. Anything that is
 * not an open business step, not one of the four kinds, not an identifier the
 * check reads, or a mismatch, is not applied.
 */
export function applyFitProposals(entries: readonly FitEntry[], raw: unknown): ProposalOutcome {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      return { entries: [...entries], kept: 0, dropped: [], unreadable: true };
    }
  }
  const list = (parsed as { proposals?: unknown } | null)?.proposals;
  if (!Array.isArray(list)) return { entries: [...entries], kept: 0, dropped: [], unreadable: true };

  const open = new Map(entries.filter((e) => e.disposition === 'gap-open' && e.comparability === 'business-comparable').map((e) => [e.elementId, e]));
  const chosen = new Map<string, FitEntry>();
  const dropped: DroppedProposal[] = [];
  for (const p of list.slice(0, MAX_FIT_PROPOSALS)) {
    const q = p as { elementId?: unknown; kind?: unknown; id?: unknown; title?: unknown } | null;
    if (!q || typeof q.elementId !== 'string' || typeof q.id !== 'string' || typeof q.kind !== 'string') continue;
    const entry = open.get(q.elementId);
    if (!entry || chosen.has(q.elementId)) continue;
    if (!(q.kind in KIND_WORDS)) continue;
    const kind = q.kind as Exclude<FitRefKind, 'key-user-tool'>;
    const id = q.id.trim().slice(0, 60);
    const title = typeof q.title === 'string' ? q.title.trim().slice(0, 200) : '';
    const check = checkOf(kind, id, title);
    if (!check) {
      dropped.push({ elementId: q.elementId, id, sapTitle: null, reason: 'Not an SAP identifier the check can read — left out.' });
      continue;
    }
    if (check.status === 'mismatch') {
      dropped.push({
        elementId: q.elementId,
        id: check.id,
        sapTitle: check.sapName ?? check.sapTitle ?? null,
        reason: `Does not match SAP data${check.sapName ? `: SAP lists ${check.id} as "${check.sapName}"` : ''} — left out.`,
      });
      continue;
    }
    // A model proposal is "verified" only where SAP's own title was held and agreed with the
    // model's: an identifier SAP lists without a title to compare (API_JOURNALENTRYITEMBASIC_SRV
    // as a "replacement for BSID/BSAD/BSEG", FI review) is a name found in a list, nothing more.
    const status = check.status === 'verified' && !check.sapName ? 'catalog' : check.status;
    chosen.set(q.elementId, {
      ...entry,
      disposition: 'covered',
      // SAP's title only — never the model's words as SAP's.
      standardRef: { kind, id: check.id, title: check.sapName ?? check.sapTitle ?? null, check: status, source: 'Model proposal, checked against SAP data held in this product' },
      evidenceLevel: 'E1',
      provenance: 'model-proposal',
      why: `A model proposed ${check.id} for this step; ${status === 'verified' ? 'the identifier and its title are SAP\'s' : status === 'catalog' ? 'the name stands in an SAP list' : 'nothing in SAP data held here confirms it'} — whether it does the step is for the workshop. ${FIT_DISPOSITION_LABELS.covered.label}, to verify.`,
    });
  }
  const next = entries.map((e) => chosen.get(e.elementId) ?? e);
  return { entries: next, kept: chosen.size, dropped, unreadable: false };
}

/** The counts after a proposal — the same counter the design uses. */
export function proposalCounts(entries: readonly FitEntry[]) {
  return countEntries(entries);
}
