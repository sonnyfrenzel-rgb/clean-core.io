'use client';

import { Fragment, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import CcAnchor from '@/components/cc/Anchor';
import GlossaryTerm from '@/components/GlossaryTerm';
import { findGlossaryMentions } from '@/lib/glossary-lookup';
import { anchorTarget, answerTokens, type AnswerToken } from '@/lib/assistant-context';

/**
 * One answer of the assistant, as text a reader can act on (roadmap 3.5.4, item 5).
 *
 *   - **An anchor goes somewhere.** Every anchor the answer rests on is a `CcAnchor` that opens its place: in the IT
 *     view the source at that line, in Business the map element that holds it (`#L42`); `[DECISION]` opens
 *     Re-design's decision step, `[ROUTE]` the route in IT (`anchorTarget`). An anchor the answer does not rest on
 *     stays text.
 *   - **A technical term carries the glossary.** The first mention of each glossary term is the same popover the
 *     stages use (`GlossaryTerm`, roadmap 6.6), so "Released API" in an answer explains itself in place.
 *
 * Plain text, never HTML: what the model wrote is rendered as React text, so nothing in it is markup.
 */
export default function AssistantAnswer({
  text,
  anchors,
  projectId,
}: {
  text: string;
  /** The anchors the answer rests on. Outside a project: none. */
  anchors: readonly string[];
  projectId: string | null;
}) {
  const open = useOpenAnchor(projectId);
  const lines = useMemo(
    () => answerTokens(text, projectId ? anchors : [], (chunk) => findGlossaryMentions(chunk)),
    [text, anchors, projectId],
  );

  const render = (token: AnswerToken, i: number) => {
    if (token.kind === 'anchor') {
      return (
        <CcAnchor key={i} onOpen={() => open(token.anchor)} label={anchorLabel(token.anchor)}>
          {token.text}
        </CcAnchor>
      );
    }
    if (token.kind === 'term') {
      return (
        <GlossaryTerm key={i} termKey={token.key}>
          {token.text}
        </GlossaryTerm>
      );
    }
    return <Fragment key={i}>{token.text}</Fragment>;
  };

  // Paragraphs at an empty line; lines inside a paragraph keep their break.
  const paragraphs: AnswerToken[][][] = [[]];
  for (const line of lines) {
    if (line.length === 0) {
      if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
    } else {
      paragraphs[paragraphs.length - 1].push(line);
    }
  }

  return (
    <div className="chat-answer" data-chatbot-answer-text="">
      {paragraphs
        .filter((p) => p.length > 0)
        .map((paragraph, p) => (
          <p key={p} className="m-0 [&+p]:mt-2">
            {paragraph.map((line, l) => (
              <Fragment key={l}>
                {l > 0 ? <br /> : null}
                {line.map(render)}
              </Fragment>
            ))}
          </p>
        ))}
    </div>
  );
}

/**
 * Opens the place an anchor names (`anchorTarget`): the fragment on the page the reader is on, which the page
 * follows, or the page that shows it.
 */
export function useOpenAnchor(projectId: string | null): (anchor: string) => void {
  const router = useRouter();
  return (anchor: string) => {
    if (!projectId) return;
    const target = anchorTarget(anchor, projectId, window.location.pathname, window.location.search);
    if (!target) return;
    if (target.kind === 'navigate') {
      router.push(target.href);
      return;
    }
    // The same fragment again sends no `hashchange` of its own: the page is told once more.
    if (window.location.hash === `#${target.hash}`) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = target.hash;
    }
  };
}

/** An anchor outside the answer's text — the list under an answer — that opens its place as the text's anchors do. */
export function AnswerAnchor({ anchor, projectId }: { anchor: string; projectId: string | null }) {
  const open = useOpenAnchor(projectId);
  return (
    <CcAnchor onOpen={projectId ? () => open(anchor) : undefined} label={anchorLabel(anchor)}>
      {anchor}
    </CcAnchor>
  );
}

/** What a screen reader hears for an anchor: where it goes. */
function anchorLabel(anchor: string): string {
  if (anchor === 'DECISION') return 'The program decision, open it in Re-design';
  if (anchor === 'ROUTE') return 'The recommended route, open it in the IT view';
  return `Source ${anchor.replace(/^L/, 'line ').replace('-', ' to ')}, open it`;
}
