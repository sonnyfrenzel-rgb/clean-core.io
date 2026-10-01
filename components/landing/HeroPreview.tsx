import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import BpmnPlaneSvg, { anchorText } from '@/components/landing/BpmnPlaneSvg';
import type { LandingHero } from '@/lib/landing-process';
import type { CodeToken } from '@/lib/process-map';

/**
 * The hero's preview of the workspace — landing mockup, section `hero`
 * (mockups s0/s1): what the engine found, what it could not determine, one
 * routine as BPMN, and that routine's source beside it.
 *
 * Everything in it is read at render time from the engine's run over the demo
 * example (`lib/landing-process.ts`): the rule count and the rules, the
 * not-determined constructs, the plane with its anchors, the code lines. The
 * frame around it is the workspace's layout, not a capture of it.
 *
 * Focus or hover a step, or hover a line: the step and its code line light up
 * together. Only the steps are Tab stops (QA c912b926e44d): forty focusable
 * code lines would be forty stops with nothing to activate. Done in CSS with `:has()`, one rule per anchored line, so the
 * behaviour costs the page no JavaScript.
 */

const TOKEN_CLASS: Record<CodeToken['kind'], string> = {
  keyword: 'text-cc-code-keyword',
  literal: 'text-cc-code-literal',
  name: 'text-cc-code-name',
  comment: 'text-cc-code-muted italic',
  plain: 'text-cc-code-ink',
};

function Anchor({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-[4px] border border-cc-line bg-cc-surface-muted px-1 align-middle font-cc-mono text-[11px] font-semibold leading-[17px] whitespace-nowrap text-cc-ink">
      {children}
    </span>
  );
}

export default function HeroPreview({ hero, title }: { hero: LandingHero; title: string }) {
  const { plane, code, rules, notDetermined, includesNotRead } = hero;
  const linked = [...new Set(plane.nodes.flatMap((n) => (n.anchor ? [n.anchor.lineStart] : [])))];
  const css = linked
    .map(
      (l) =>
        `[data-hero-preview]:has([data-l="${l}"]:hover,[data-l="${l}"]:focus-visible) [data-l="${l}"] .cc-bpmn-shape{stroke:var(--cc-focus);stroke-width:3.5px;fill:var(--cc-information-bg)}` +
        `[data-hero-preview]:has([data-l="${l}"]:hover,[data-l="${l}"]:focus-visible) li[data-l="${l}"]{background:var(--cc-code-hl);box-shadow:inset 3px 0 0 var(--cc-code-hl-bar)}`,
    )
    .join('');
  const first = code[0]?.number ?? 0;
  const last = code[code.length - 1]?.number ?? 0;
  const calledAt = plane.anchor ? anchorText(plane.anchor) : null;

  return (
    <figure className="m-0" data-hero-preview="">
      <style>{css}</style>
      <figcaption className="mb-3 text-center text-sm font-medium text-cc-ink-muted">
        Demo project {hero.process.program} · fictitious code, read by the engine when this page was built. Focus or
        hover a step, or hover a code line — both light up together.
      </figcaption>
      <div className="overflow-hidden rounded-[20px] border border-cc-line bg-cc-surface text-left shadow-[0_24px_64px_rgb(11_28_48/0.10)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-cc-line px-4 py-3 sm:px-5">
          <span className="text-sm font-bold text-cc-ink">
            Clean-Core<span className="text-cc-brand-strong">.io</span>
          </span>
          <span className="text-sm font-medium text-cc-ink-muted">
            My workspace <span aria-hidden="true">›</span> <b className="font-semibold text-cc-ink">{title}</b>
          </span>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-cc-ink-muted">Your process</p>
            <CcProvenanceChip value="reconstructed" />
            <p className="text-sm font-medium text-cc-ink-muted">
              {hero.process.anchored} of {hero.process.flowNodes} flow elements carry a line anchor.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-cc-line p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-cc-ink-muted">Found in the code</p>
              <p className="mt-2 text-base font-semibold leading-relaxed text-cc-ink">
                {rules.total} business rules hard-coded in the program
              </p>
              <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-sm">
                {rules.shown.map((r) => (
                  <li key={r.id} data-l={r.line} className="flex flex-wrap items-center gap-2">
                    <code className="font-cc-mono text-cc-ink">{r.label}</code>
                    <Anchor>L{r.line}</Anchor>
                    <span className="font-cc-mono text-xs text-cc-ink-muted">{r.id}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-cc-line p-4">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-cc-ink">{notDetermined.total} not determined</span>
                <CcProvenanceChip value="not-determined" />
              </p>
              <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-sm font-medium text-cc-ink-muted">
                {notDetermined.groups.map((g) => (
                  <li key={g.label} className="flex flex-wrap items-center gap-2">
                    <span>
                      {g.label}
                      {g.anchors.length > 1 ? ` ×${g.anchors.length}` : ''}
                    </span>
                    {g.anchors.slice(0, 2).map((a) => (
                      <Anchor key={a}>{a}</Anchor>
                    ))}
                    {g.anchors.length > 2 && <span>…</span>}
                  </li>
                ))}
                {includesNotRead.length > 0 && (
                  <li className="flex flex-wrap items-center gap-2">
                    <span>
                      {includesNotRead.length === 1 ? 'An include' : `${includesNotRead.length} includes`} named, not part of the upload
                    </span>
                    {includesNotRead.map((i) => (
                      <Anchor key={i.line}>L{i.line}</Anchor>
                    ))}
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-cc-line">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-cc-line px-4 py-3">
              <p className="text-sm font-bold text-cc-ink">Process — reconstructed from code</p>
              <p className="font-cc-mono text-xs text-cc-ink-muted">
                {hero.process.program} <span aria-hidden="true">›</span> {plane.label}
                {calledAt ? ` · called at ${calledAt}` : ''}
              </p>
            </div>
            <div className="overflow-x-auto p-2">
              <BpmnPlaneSvg
                plane={plane}
                idPrefix="hero"
                scale={1.05}
                title={`The routine ${plane.label} of ${hero.process.program} as BPMN, reconstructed from the code. Every element carries its line anchor.`}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-cc-code-bg">
            <p className="flex flex-wrap items-center justify-between gap-2 border-b border-cc-on-dark/15 px-4 py-3 text-sm font-semibold text-cc-on-dark">
              <span>
                {hero.process.program} <span className="font-cc-mono text-xs font-medium text-cc-code-muted">L{first}–{last}</span>
              </span>
              <span className="text-xs font-medium text-cc-code-muted">Source</span>
            </p>
            <ol className="m-0 list-none overflow-x-auto p-0 py-2 font-cc-mono text-[13px] leading-6" aria-label={`Source lines ${first} to ${last}`}>
              {code.map((line) => (
                <li key={line.number} data-l={line.number} className="flex whitespace-pre pr-4">
                  <span className="w-12 shrink-0 select-none pr-3 text-right text-cc-code-muted" aria-hidden="true">
                    {line.number}
                  </span>
                  <span>
                    {line.tokens.length === 0
                      ? ' '
                      : line.tokens.map((t, i) => (
                        <span key={i} className={TOKEN_CLASS[t.kind]}>
                          {t.text}
                        </span>
                      ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </figure>
  );
}
