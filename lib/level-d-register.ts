/**
 * The level D register (DSAG guideline review B7, owner 13.10.2026): every
 * change to SAP code the engine already detects — modifications and
 * enhancement implementations, points and sections, the findings the engine
 * grades level D — listed with the three points the guideline asks every
 * modification to be documented with, as OPEN QUESTIONS.
 *
 * DSAG ABAP guideline: clean-core/what-is-clean-core.md § Saubere Modifikationen
 * (purpose of the change, effect on future upgrades, tested scenarios) and
 * organization/index.md § Best Practice (an approval process for level D
 * developments).
 *
 * Owner rule (Documentation is a help): the Documentation tool has no inputs
 * and no sign-off. The register only shows and exports — the answers are
 * written in the company's own documentation, and the approval of a level D
 * development is decided there, not here.
 *
 * Read from the engine's findings; it adds no finding and changes none, and
 * nothing here enters the signed run. Pure: no network, no React.
 */

import type { EvidenceFinding } from '@/lib/abap/evidence-model';

/** The enhancement object types the engine grades level D (BAdIs and the classic exit handler are not). */
const LEVEL_D_ENHANCEMENTS = new Set(['Enhancement Implementation', 'Enhancement Point', 'Enhancement Section']);

export type LevelDKind = 'modification' | 'enhancement';

export interface LevelDQuestion {
  key: 'purpose' | 'upgrade-effect' | 'tested-scenarios';
  question: string;
}

export interface LevelDEntry {
  findingId: string;
  kind: LevelDKind;
  title: string;
  /** The transport request of a modification, or the enhancement's name. */
  objectName: string | null;
  objectType: string | null;
  line: number;
  snippet: string;
  questions: LevelDQuestion[];
}

// DSAG ABAP guideline: clean-core/what-is-clean-core.md § Saubere Modifikationen
const QUESTIONS: Record<LevelDKind, LevelDQuestion[]> = {
  modification: [
    { key: 'purpose', question: 'Purpose: what does the change do, and which requirement makes it necessary?' },
    { key: 'upgrade-effect', question: 'Effect on upgrades: what has to be adjusted in SPAU at an upgrade or support package, and what breaks if SAP changes the modified code?' },
    { key: 'tested-scenarios', question: 'Tested scenarios: which business scenarios were tested with the change, and where is that recorded?' },
  ],
  enhancement: [
    { key: 'purpose', question: 'Purpose: what does the enhancement do, and which requirement makes it necessary?' },
    { key: 'upgrade-effect', question: 'Effect on upgrades: what has to be checked in SPAU_ENH at an upgrade or support package, and what breaks if SAP changes the enhanced code?' },
    { key: 'tested-scenarios', question: 'Tested scenarios: which business scenarios were tested with the enhancement, and where is that recorded?' },
  ],
};

/** The approval line every register carries — said, never collected here. */
export const LEVEL_D_APPROVAL_NOTE =
  'The DSAG ABAP guideline recommends an approval process for level D developments. Whether one was given is decided and recorded outside this tool.';

export const LEVEL_D_ATTRIBUTION =
  'Questions after the “DSAG ABAP-Leitfaden” by DSAG e.V. and contributors (CC BY 4.0), translated from German and paraphrased.';

export const LEVEL_D_NONE = 'The engine found no modification and no level D enhancement in this code.';

/** The level D findings of a run, in line order. */
export function levelDRegister(findings: readonly EvidenceFinding[]): LevelDEntry[] {
  return findings
    .filter((f) => f.kind === 'modification' || (f.kind === 'enhancement' && LEVEL_D_ENHANCEMENTS.has(f.objectType ?? '')))
    .map((f): LevelDEntry => {
      const kind: LevelDKind = f.kind === 'modification' ? 'modification' : 'enhancement';
      return {
        findingId: f.id,
        kind,
        title: f.title,
        objectName: f.objectName ?? null,
        objectType: f.objectType ?? null,
        line: f.lineStart,
        snippet: f.snippet,
        questions: QUESTIONS[kind],
      };
    })
    .sort((a, b) => a.line - b.line);
}

/** One table cell of Markdown: pipes and line breaks would break the row. */
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ').trim();

/** The register as a Markdown file — the export of the Documentation tool. */
export function levelDRegisterMarkdown(
  entries: readonly LevelDEntry[],
  meta: { projectName: string; date: string },
): string {
  const out: string[] = [
    `# Level D register — ${cell(meta.projectName)}`,
    '',
    `Read from the engine's findings on ${meta.date}. Every entry is a change to SAP code; its three questions are open until your own documentation answers them.`,
    '',
    LEVEL_D_APPROVAL_NOTE,
    '',
  ];
  if (entries.length === 0) {
    out.push(LEVEL_D_NONE, '');
  }
  entries.forEach((e, i) => {
    out.push(`## ${i + 1}. ${cell(e.title)}`, '');
    out.push('| | |', '|---|---|');
    out.push(`| Kind | ${e.kind === 'modification' ? 'Modification of SAP code' : 'Enhancement of SAP code'} |`);
    if (e.objectName) out.push(`| ${e.kind === 'modification' ? 'Object / request' : 'Enhancement'} | \`${cell(e.objectName)}\` |`);
    out.push(`| Line | ${e.line} |`);
    out.push(`| As written | \`${cell(e.snippet).replace(/`/g, "'")}\` |`);
    out.push('', '**Open questions**', '');
    for (const q of e.questions) out.push(`- Open — ${q.question}`);
    out.push('');
  });
  out.push('---', '', LEVEL_D_ATTRIBUTION, '');
  return out.join('\n');
}

/** The file name of the register. */
export function levelDRegisterFileName(projectName: string | undefined): string {
  return `${(projectName || 'Project').replace(/\s+/g, '_')}_Level_D_register.md`;
}
