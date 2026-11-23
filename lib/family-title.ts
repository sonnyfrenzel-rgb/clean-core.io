/**
 * The title of a tool page in the family (mock-ups of 15.11.2026, ADR-126 – ADR-132, ADR-139, ADR-140): the
 * program's business name as the page's `h1` — "Emergency purchase approval" — with the tool as the eyebrow above it
 * ("Tool · Economics") and the program's technical name small below it ("Z_MM_PO_APPROVAL").
 *
 * The business name is the one My workspace's tile shows (3.3.0, owner decision 14.11.2026): the source header's title
 * line as the engine read it for the active run (`ProjectSummary.processTitle`, never a model's answer), and the
 * project's own name where there is none. The technical name is the uploaded file's name without its extension, or
 * the project's name when the business name took the title; it is left out where it would only repeat the title.
 *
 * Pure: no React, no Firestore.
 */
import { summaryOf } from '@/lib/project-summary';

export interface FamilyTitle {
  /** The page's `h1`. */
  title: string;
  /** The program's technical name, shown in mono under the title, or `null`. */
  programId: string | null;
}

type TitleSource = {
  name?: unknown;
  activeRunId?: unknown;
  summary?: unknown;
  auditMetadata?: { inputFingerprint?: { fileName?: unknown } | null } | null;
};

const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text : null;
};

export function familyTitleOf(project: TitleSource | null | undefined): FamilyTitle | null {
  if (!project) return null;
  const name = clean(project.name);
  const processTitle = summaryOf(project)?.processTitle ?? null;
  const rawFile = clean(project.auditMetadata?.inputFingerprint?.fileName);
  const fileName = rawFile ? rawFile.replace(/\.[^.]+$/, '') : null;
  const title = processTitle ?? name;
  if (!title) return null;
  const candidates = processTitle ? [fileName, name] : [fileName];
  const programId = candidates.find((c): c is string => !!c && c.toLowerCase() !== title.toLowerCase()) ?? null;
  return { title, programId };
}
