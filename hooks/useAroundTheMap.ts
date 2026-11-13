import { useEffect, useMemo, useState } from 'react';
import { useCustomerTexts } from '@/hooks/useCustomerTexts';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { usePlainWording } from '@/hooks/usePlainWording';
import { aroundPlainSentences, aroundTheMap, type AroundTheMapText } from '@/lib/around-the-map';
import { readProcess, readRules, readTableAccess, tablesOf, type SourceReading } from '@/lib/first-look';
import { engineReads3020Apply } from '@/lib/abap/engine-reads-3020-gate';
import { plainModelEnabled, type PlainRange, type WordedSentence } from '@/lib/plain-wording';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import type { Project } from '@/lib/types';

/**
 * The reading behind the text around the map (`components/analyze/AroundTheMap.tsx`, plan AB-6), read once
 * per project and source, after the first paint — the map never waits for it, and the blocks stand as
 * placeholders until it is in. Handed out whole so the summary above the map and the blocks below it read
 * the same text without a context (CLAUDE.md: no React Context).
 *
 * The plain wording (`usePlainWording`, scope `firstlook`) rewords the engine's sentences of "What this program
 * does" and the steps of "How it runs" under the rules it always had: the owner only, once per project, source and
 * engine, by itself only where the account's automatic steps allow it (`autoAllowed`), otherwise on a click
 * (`askNow`). An invited reader and the demo (`model: false`) ask nothing.
 */
export interface AroundTheMapReading {
  /** `reading` until the text is in; `failed` when the source could not be read — finite and true. */
  state: 'reading' | 'ready' | 'failed';
  text: AroundTheMapText | null;
  /** The skeleton, rule set and tables the text was read from — for the project search (⌘K) and the demo's rules. */
  reading: SourceReading | null;
  /** A sentence in plain words where a rewording is on record; the engine's otherwise. */
  say: (text: string, anchor: PlainRange | null) => WordedSentence;
  /** Set when the rewording waits for the owner's click. */
  askNow: (() => void) | null;
}

const AS_IS = (text: string): WordedSentence => ({ text, engine: text, worded: false });

export function useAroundTheMap({
  project,
  projectId,
  owner,
  model = true,
  source: sourceIn,
}: {
  project: Project | null;
  /** The source the map is drawn from (the signed run's), so every line here is a line of the map; the project's otherwise. */
  source?: string | null;
  projectId: string;
  /** Only the owner's visit may ask for a rewording (P8: a reader's visit triggers no model call). */
  owner: boolean;
  /** False for the demo, which has no project record and calls no model. */
  model?: boolean;
}): AroundTheMapReading {
  const source = typeof sourceIn === 'string' && sourceIn.trim() ? sourceIn : typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const engineVersion = engineVersionOfProject(project);
  const narrative = model && typeof project?.analysis === 'string' ? project.analysis : null;
  const customerTexts = useCustomerTexts(model ? projectId : null);
  const [read, setRead] = useState<{ key: string; text: AroundTheMapText | null; reading: SourceReading | null; failed: boolean } | null>(null);
  const key = `${projectId}\u0000${engineVersion ?? ''}\u0000${source}`;

  useEffect(() => {
    if (!source.trim()) return;
    let cancelled = false;
    // After the paint: the map and the summary's placeholder stand first (DESIGN.md §5.2, the model never holds up the page).
    const handle = window.setTimeout(() => {
      try {
        const proc = readProcess(source);
        const ruleSet = readRules(source, proc, engineVersion);
        const text = aroundTheMap({
          source,
          skeleton: proc.skeleton,
          ruleSet,
          processFacts: proc.facts,
          engineVersion,
          customerTexts,
          narrative,
        });
        const reading: SourceReading = { skeleton: proc.skeleton, context: proc.context, ruleSet, tables: tablesOf(readTableAccess(source)) };
        if (!cancelled) setRead({ key, text, reading, failed: false });
      } catch {
        if (!cancelled) setRead({ key, text: null, reading: null, failed: true });
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [key, source, engineVersion, customerTexts, narrative]);

  const current = read && read.key === key ? read : null;
  const text = current?.text ?? null;
  const availability = useModelAvailability();
  const sentences = useMemo(() => (text && engineReads3020Apply(engineVersion) ? aroundPlainSentences(text) : null), [text, engineVersion]);
  const plain = usePlainWording({
    projectId: model ? projectId : null,
    scope: 'firstlook',
    source: source.trim() ? source : null,
    sentences,
    owner,
    active: model && sentences !== null,
    modelEnabled: plainModelEnabled(availability),
    // 3.0.21 (owner decision B6): by itself only on the platform key or with "Automatic steps" on for the own key.
    autoAllowed: availability.autoSteps,
  });

  return {
    state: !source.trim() ? 'failed' : current ? (current.failed ? 'failed' : 'ready') : 'reading',
    text,
    reading: current?.reading ?? null,
    say: plain.state === 'worded' ? plain.say : AS_IS,
    askNow: plain.askNow,
  };
}
