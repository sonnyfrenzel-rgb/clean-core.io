'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, Check, Lock, Search, ShieldCheck } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import AuthLink from '@/components/landing/AuthLink';
import { BTP } from '@/lib/sap-naming';
import type { ShowcaseData } from '@/lib/demo-showcase';
import {
  SHOWCASE_CONTINUE_TARGET,
  SHOWCASE_END,
  SHOWCASE_OWN_CODE_TARGET,
  type ShowcaseLens,
  type ShowcasePart,
} from '@/lib/demo-showcase-copy';

/**
 * The four product screens of the showcase and its end — the product's
 * Analyze in Business, IT and Management and its Delivery, in the product's
 * look, filled with the engine's reading of the example (`lib/demo-showcase.ts`).
 * A control the product has but the showcase does not run is shown quiet
 * (`aria-disabled`, "In your own project"); nothing here signs, stores or
 * calls anyone. State and clicks belong to `DemoShowcase`.
 */

export interface ScreenState {
  plane: string;
  sel: string | null;
  marks: string[];
  scale: number;
  code: [number, number];
}

export interface ScreenActions {
  pick: (id: string) => void;
  openPlane: (plane: string) => void;
  zoom: (delta: -1 | 0 | 1) => void;
  showEnd: (index: number) => void;
  showChange: (index: number) => void;
  showLine: (line: number) => void;
  goStep: (step: number) => void;
  quiet: () => void;
}

const TOOLS: ReadonlyArray<readonly [string, string]> = [
  ['analyze', 'Analyze'],
  ['design', 'Design'],
  ['transformation', 'Transformation'],
  ['documentation', 'Documentation'],
  ['testing', 'Testing'],
  ['tco', 'Economics'],
  ['delivery', 'Delivery'],
];

/** The part a step explains carries `data-showcase-part`; the outline and the fit find it there. */
const part = (p: ShowcasePart) => ({ 'data-showcase-part': p });

function Quiet({ children, onQuiet }: { children: React.ReactNode; onQuiet: () => void }) {
  return (
    <button type="button" className="btn ghost q" aria-disabled="true" onClick={onQuiet}>
      {children}
    </button>
  );
}

const KEYWORDS =
  /\b(REPORT|CONSTANTS|TYPE|VALUE|DATA|FORM|ENDFORM|PERFORM|IF|ELSEIF|ELSE|ENDIF|CHECK|RETURN|MESSAGE|WITH|AND|OR|NOT|CASE|WHEN|ENDCASE|SELECT|SINGLE|FROM|INTO|WHERE|UPDATE|SET|INSERT|COMMIT|WORK|CALL|FUNCTION|TRANSACTION|USING|CHANGING|EXPORTING|IMPORTING|TABLES|LOOP|AT|ENDLOOP|START-OF-SELECTION|PARAMETERS|SELECT-OPTIONS|READ|TABLE|IS|INITIAL|CP)\b/;

/** ABAP, coloured as the product's code surface colours it: comments, literals, keywords. */
function AbapLine({ text }: { text: string }) {
  if (/^\s*\*/.test(text)) return <span className="c">{text}</span>;
  const out: React.ReactNode[] = [];
  text.split(/('[^']*')/).forEach((piece, i) => {
    if (i % 2) {
      out.push(<span key={`l${i}`} className="l">{piece}</span>);
      return;
    }
    const quote = piece.indexOf('"');
    const head = quote >= 0 ? piece.slice(0, quote) : piece;
    head.split(new RegExp(`(${KEYWORDS.source})`)).forEach((w, j) => {
      if (!w) return;
      out.push(j % 2 ? <span key={`k${i}-${j}`} className="k">{w}</span> : <React.Fragment key={`t${i}-${j}`}>{w}</React.Fragment>);
    });
    if (quote >= 0) out.push(<span key={`c${i}`} className="c">{piece.slice(quote)}</span>);
  });
  return <>{out}</>;
}

function CodeLines({ source, from, to, mark }: { source: string[]; from: number; to: number; mark: [number, number] | null }) {
  const rows: React.ReactNode[] = [];
  for (let n = Math.max(1, from); n <= Math.min(source.length, to); n++) {
    const hl = mark && n >= mark[0] && n <= mark[1];
    rows.push(
      <div key={n} className={hl ? 'ln hl' : 'ln'}>
        <span>{n}</span>
        <span>
          <AbapLine text={source[n - 1] ?? ''} />
        </span>
      </div>,
    );
  }
  return (
    <div className="code" tabIndex={0} aria-label="Source lines">
      {rows}
    </div>
  );
}

function Frame({
  data,
  tool,
  view,
  lead,
  actions,
  children,
}: {
  data: ShowcaseData;
  tool: 'analyze' | 'delivery';
  view: 'business' | 'it' | 'management';
  lead: string;
  actions: ScreenActions;
  children: React.ReactNode;
}) {
  const name = TOOLS.find((t) => t[0] === tool)?.[1] ?? '';
  return (
    <div className="app">
      <div className="subbar">
        <div className="crumb">
          <span>Demo project</span> › <span>{data.facts.subject}</span> › <b>{name}</b>
        </div>
        <span className="srch q" aria-disabled="true" role="button" tabIndex={0} onClick={actions.quiet}>
          <Search className="i" aria-hidden="true" /> Search this project
        </span>
      </div>
      <div className="body">
        <div className="toprow">
          <div className="tools" {...(tool === 'delivery' ? part('tools') : {})}>
            <span className="lb">Tools</span>
            {TOOLS.map(([key, label]) =>
              key === 'analyze' || key === 'delivery' ? (
                <button
                  key={key}
                  type="button"
                  className="tool"
                  aria-current={key === tool ? 'page' : undefined}
                  onClick={() => actions.goStep(key === 'delivery' ? 9 : 2)}
                >
                  {label}
                </button>
              ) : (
                <button key={key} type="button" className="tool q" aria-disabled="true" onClick={actions.quiet}>
                  {label}
                </button>
              ),
            )}
          </div>
          {tool === 'analyze' ? (
            <div className="seg views" role="group" aria-label="View">
              {(
                [
                  ['business', 'Business', 2],
                  ['it', 'IT', 6],
                  ['management', 'Management', 8],
                ] as const
              ).map(([key, label, step]) => (
                <button key={key} type="button" aria-pressed={key === view} onClick={() => actions.goStep(step)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="sh">
          <div className="ey">Tool · {data.facts.subject}</div>
          <h1>{name}</h1>
          <p>{lead}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function bar(n: number, max: number, stop = false) {
  return <span className={stop ? 'b stop' : 'b'} style={{ width: `${Math.max(6, Math.round((n / Math.max(1, max)) * 100))}%` }} />;
}

export function BusinessScreen({ data, state, actions }: { data: ShowcaseData; state: ScreenState; actions: ScreenActions }) {
  const { facts, ends, changes, rules, planes, elements, source } = data;
  const plane = planes.find((p) => p.id === state.plane) ?? planes[0];
  const w = Math.round(plane.w * state.scale);
  const h = Math.round(plane.h * state.scale);
  const svg = plane.svg.replace(
    /^<svg([^>]*?) width="[^"]*" height="[^"]*"/,
    `<svg$1 width="${w}" height="${h}" role="img" aria-label="BPMN map: ${plane.label.replace(/"/g, '')}"`,
  );
  const stopCount = ends.reduce((a, e) => a + (e.plane === 'process' ? 0 : e.ids.length), 0);
  const endCount = ends.reduce((a, e) => a + e.ids.length, 0);
  const maxEnd = Math.max(...ends.map((e) => e.ids.length));
  const endLines = [...new Set(ends.flatMap((e) => e.lines))].sort((a, b) => a - b);
  const sel = state.sel ? elements[state.sel] : null;
  const opens = (id: string) => planes.some((p) => p.id === id);

  return (
    <Frame data={data} tool="analyze" view="business" lead="What this program does, read from its code." actions={actions}>
      <div className="card sum">
        <div>
          <h3 className="chips">
            What this program does <CcProvenanceChip value="reconstructed" />
          </h3>
          <p>
            {facts.subject}: {facts.topSteps} steps on the top level, {facts.rules} rules in the code, {endCount} ways a case can end.
          </p>
          <p className="note chips">
            In your own project a model writes this in plain words, marked <CcProvenanceChip value="proposed" /> The demo calls no model.
          </p>
        </div>
        <Quiet onQuiet={actions.quiet}>Walk me through it</Quiet>
      </div>
      <div className="g2">
        <div className="card mapcard" {...part('map')}>
          <div className="mapbar">
            <Quiet onQuiet={actions.quiet}>Map</Quiet>
            <Quiet onQuiet={actions.quiet}>Steps</Quiet>
            <span className="sp" />
            <button type="button" className="btn ghost" aria-label="Zoom out" onClick={() => actions.zoom(-1)}>
              −
            </button>
            <span className="zv">{Math.round(state.scale * 100)}%</span>
            <button type="button" className="btn ghost" aria-label="Zoom in" onClick={() => actions.zoom(1)}>
              +
            </button>
            <button type="button" className="btn ghost" onClick={() => actions.zoom(0)}>
              Fit
            </button>
            <Quiet onQuiet={actions.quiet}>Export BPMN 2.0</Quiet>
            <Quiet onQuiet={actions.quiet}>Full screen</Quiet>
          </div>
          <div className="levels">
            {plane.id === 'process' ? (
              <>
                <span>Process</span> › <b>Top level</b>
                <span className="rt mono">{planes.length} levels</span>
              </>
            ) : (
              <>
                <button type="button" onClick={() => actions.openPlane('process')}>
                  Process
                </button>{' '}
                › <b>{plane.label}</b>
                <span className="rt">Opened from the step with the + marker</span>
              </>
            )}
          </div>
          <div
            className="mapview"
            data-showcase-map=""
            data-plane={plane.id}
            onClick={(e) => {
              const g = (e.target as Element).closest?.('[data-flow]');
              if (g) actions.pick(g.getAttribute('data-element-id') ?? '');
            }}
            onKeyDown={(e) => {
              const g = (e.target as Element).closest?.('[data-flow]');
              if (g && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                actions.pick(g.getAttribute('data-element-id') ?? '');
              }
            }}
            // The level's drawing, made by bpmn-js from the demo's own BPMN file at
            // `npx tsx scripts/regenerate-demo-showcase.ts` and committed with it — no reader's input.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="mapfoot">
            <CcProvenanceChip value="reconstructed" />
            <span>Structure read from the code. Tap a step for its lines; tap a step with + twice to open it.</span>
            <span className="bpmnio">
              drawn with bpmn-js ·{' '}
              <a href="https://bpmn.io" rel="noopener noreferrer" target="_blank">
                bpmn.io
              </a>
            </span>
          </div>
        </div>
        <div className="card codecard" {...part('code')}>
          {sel && sel[2] ? (
            <>
              <div className="hd">
                <div>
                  <div className="lbl">
                    The code behind it · line {sel[2]}
                    {sel[3] && sel[3] !== sel[2] ? `–${sel[3]}` : ''}
                  </div>
                  <h3>{sel[0]}</h3>
                </div>
              </div>
              <div className="chips" style={{ marginTop: 6 }}>
                <CcProvenanceChip value="reconstructed" />
                {state.sel && opens(state.sel) ? <span className="chip file">Tap again to open its level</span> : null}
              </div>
              <CodeLines source={source} from={sel[2] - 3} to={(sel[3] ?? sel[2]) + 3} mark={[sel[2], sel[3] ?? sel[2]]} />
              <p className="foot">The name on the map is the engine’s; in your own project a model may word it plainly, marked AI-generated.</p>
            </>
          ) : (
            <>
              <div className="hd">
                <div>
                  <div className="lbl">
                    The program · lines {state.code[0]}–{state.code[1]}
                  </div>
                  <h3>{facts.objectName}, as uploaded</h3>
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <span className="chip file">Your file, unchanged</span>
              </div>
              <CodeLines source={source} from={state.code[0]} to={state.code[1]} mark={null} />
              <p className="foot">Tap a step on the map to see its lines.</p>
            </>
          )}
        </div>
      </div>
      <div className="g3">
        <div className="card" {...part('ends')}>
          <h3>How a case can end</h3>
          <p className="s">
            {endCount} ways: {endCount - stopCount} at the normal end, {stopCount} stopped on the way.
          </p>
          <div style={{ marginTop: 8 }}>
            {ends.map((e, i) => (
              <button key={e.ids.join()} type="button" className="crow" data-end={i} onClick={() => actions.showEnd(i)}>
                <span>
                  {e.plane === 'process' ? 'Runs to its end' : `Stopped in “${e.planeLabel}”`}
                  <small>{e.plane === 'process' ? 'the end of the main flow' : [...new Set(e.names)].join(' · ')}</small>
                </span>
                <span>{bar(e.ids.length, maxEnd, e.plane !== 'process')}</span>
                <span className="n">{e.ids.length}</span>
              </button>
            ))}
          </div>
          <div className="cfoot">
            Lines {endLines.join(', ')} · <CcProvenanceChip value="reconstructed" />
          </div>
        </div>
        <div className="card" {...part('ends')}>
          <h3>What it changes, what it only reads</h3>
          <p className="s">
            It changes {changes.length} kinds of records and only reads {facts.readsOnly.length} others.
          </p>
          <div style={{ marginTop: 8 }}>
            {changes.map((c, i) => (
              <button key={c.object} type="button" className="crow" data-change={i} onClick={() => actions.showChange(i)}>
                <span>
                  {c.object}
                  <small>
                    {c.how} · line {c.line}
                  </small>
                </span>
                <span>{bar(1, 1)}</span>
                <span className="n">1</span>
              </button>
            ))}
          </div>
          <p className="s" style={{ marginTop: 6 }}>
            Only reads: {facts.readsOnly.join(', ')}.
          </p>
          <div className="cfoot">
            <CcProvenanceChip value="reconstructed" />
          </div>
        </div>
        <div className="card" {...part('rules')}>
          <h3>The rules it applies</h3>
          <p className="s">
            {facts.rules} limits and fixed values in the code; {rules.length} of them here.
          </p>
          <div style={{ marginTop: 6 }}>
            {rules.map((r, i) => (
              <div key={r.line} className="rule">
                <span>
                  <span className="v">{r.value}</span> · {r.text}
                </span>
                <button type="button" className="lnb" onClick={() => actions.showLine(r.line)}>
                  line {r.line}
                </button>
                {i === 0 ? (
                  <div className="dec">
                    {['Keep', 'Change', 'Drop', 'Clarify'].map((d) => (
                      <Quiet key={d} onQuiet={actions.quiet}>
                        {d}
                      </Quiet>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="cfoot">
            <CcProvenanceChip value="reconstructed" />
            <AuthLink to={SHOWCASE_OWN_CODE_TARGET} variant="ghost" size="sm" testId="showcase-rules-own">
              Find the rules in your own program
            </AuthLink>
          </div>
        </div>
      </div>
    </Frame>
  );
}

const levelClass = (level: string) => (level === 'Unknown' ? 'U' : level);
const useWord: Record<string, string> = { write: 'writes', read: 'reads', call: 'calls' };

export function ItScreen({ data, actions }: { data: ShowcaseData; actions: ScreenActions }) {
  const { facts, uses } = data;
  return (
    <Frame data={data} tool="analyze" view="it" lead="The code behind each step, the findings and the clean core level." actions={actions}>
      <div className="g3" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="lbl">Clean Core Score</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="hero">{facts.score}</span>
            <span className="s">of 100</span>
          </div>
          <table className="bd">
            <tbody>
              {facts.scoreLines.map((l) => (
                <tr key={l.label}>
                  <td>
                    {l.label} ({l.count})
                  </td>
                  <td>−{l.points}</td>
                </tr>
              ))}
              {facts.unassessedKinds ? (
                <tr>
                  <td>Kinds of code not assessed ({facts.unassessedKinds})</td>
                  <td>−{facts.unassessedPoints}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Findings</h3>
          <p className="s">
            {facts.distinctFindings} distinct, at {facts.findings} places in the code.
          </p>
          <div className="sev">
            <span className="e">{facts.severity.critical} critical</span>
            <span className="e">{facts.severity.high} high</span>
            <span className="w">{facts.severity.medium} medium</span>
            <span className="ne">{facts.severity.low} low</span>
            <span className="in">{facts.severity.info} info</span>
          </div>
          {facts.critical ? (
            <p className="s" style={{ marginTop: 10 }}>
              Critical: direct write to SAP table {facts.critical.object}, line {facts.critical.line}.
            </p>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <Quiet onQuiet={actions.quiet}>Open the worklist</Quiet>
          </div>
        </div>
        <div className="card">
          <h3 className="chips">
            Not determined <CcProvenanceChip value="not-determined" note={String(facts.notDeterminedCount)} />
          </h3>
          <ul className="plain">
            {data.facts.notDetermined.map((n) => (
              <li key={n.label}>
                {n.label} ({n.lines.length > 1 ? 'lines' : 'line'} {n.lines.join(', ')})
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="g2" style={{ marginTop: 12 }}>
        <div className="card" {...part('levels')}>
          <h3 className="chips">
            Clean core level per object <CcProvenanceChip value="imported" note="SAP classification" />
          </h3>
          <p className="s">A to D from SAP’s Cloudification Repository and classification file, with the line that uses the object.</p>
          <div className="tscroll">
            <table className="lt" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th scope="col">Object</th>
                  <th scope="col">Use</th>
                  <th scope="col">Level</th>
                  <th scope="col">Line</th>
                </tr>
              </thead>
              <tbody>
                {uses.map((u) => (
                  <tr key={`${u.object}@${u.use}`}>
                    <td className="mono">{u.object}</td>
                    <td>{useWord[u.use] ?? u.use}</td>
                    <td>
                      <span className={`lv ${levelClass(u.level)}`}>{u.level === 'Unknown' ? 'unknown' : u.level}</span>
                    </td>
                    <td className="mono">{u.lines.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card route" {...part('route')}>
          <div className="lbl">Recommended route</div>
          <div className="t">{facts.route}</div>
          <p className="s">Target: {facts.target}, inside SAP S/4HANA.</p>
          <div className="opt3">
            <div>
              <b>In-app · RAP</b>recommended
            </div>
            <div>
              <b>Side-by-side · {BTP}</b>not forced
            </div>
            <div>
              <b>Key user</b>
              {facts.keyUser.keyUser} of {facts.keyUser.total} parts
            </div>
          </div>
          <ul>
            {facts.writesDirect.map((wd) => (
              <li key={wd.object}>
                The direct {wd.object} write (line {wd.line}) is replaced by a released API or a RAP action.
              </li>
            ))}
            {facts.batchInputLine || facts.uploadLine ? (
              <li>
                {facts.batchInputLine ? `Batch input (line ${facts.batchInputLine})` : ''}
                {facts.batchInputLine && facts.uploadLine ? ' and ' : ''}
                {facts.uploadLine ? `the file upload (line ${facts.uploadLine})` : ''} force no side-by-side split.
              </li>
            ) : null}
            {facts.keyUser.candidates.length ? <li>Key-user candidates: {facts.keyUser.candidates.join(', ')} as Custom Business Objects.</li> : null}
          </ul>
        </div>
      </div>
    </Frame>
  );
}

export function ManagementScreen({ data, actions, changes }: { data: ShowcaseData; actions: ScreenActions; changes: number }) {
  const { facts } = data;
  return (
    <Frame data={data} tool="analyze" view="management" lead="What this program means for the business and what to decide." actions={actions}>
      <div className="g2">
        <div className="card">
          <div className="lbl">What it is for</div>
          <h3 className="purpose">
            {facts.subject}: it checks a purchase requisition, gets it approved and creates the purchase order.
          </h3>
          <p className="s chips">
            Read from the program’s steps and calls <CcProvenanceChip value="reconstructed" />
          </p>
        </div>
        <div className="card decide" {...part('decision')}>
          <div className="lbl">Your decision</div>
          <h3>Keep, rebuild or retire?</h3>
          <p style={{ fontSize: 13 }}>
            The analysis decides nothing. It gives the basis: the route if you rebuild is {facts.route}; {facts.notDeterminedCount} points are open.
          </p>
          <div className="row">
            {['Keep', 'Rebuild', 'Retire'].map((d) => (
              <Quiet key={d} onQuiet={actions.quiet}>
                {d}
              </Quiet>
            ))}
          </div>
          <p className="s" style={{ marginTop: 8 }}>
            Recorded with your name and reasons in your own project.
          </p>
        </div>
      </div>
      <div className="g4" style={{ marginTop: 12 }}>
        <div className="card tile">
          <div className="lbl">Distance to standard</div>
          <div className="fig">
            {facts.score} <small>of 100</small>
          </div>
          <p>Clean Core Score of this code.</p>
        </div>
        <div className="card tile">
          <div className="lbl">Records it changes</div>
          <div className="fig">
            {changes} <small>kinds</small>
          </div>
          <p>The requisition, the purchase order (posted or by screen) and its own tables.</p>
        </div>
        <div className="card tile">
          <div className="lbl">Rules in the code</div>
          <div className="fig">{facts.rules}</div>
          <p>Decided nowhere else.</p>
        </div>
        <div className="card tile">
          <div className="lbl">Effort and cost</div>
          <div className="fig" style={{ fontSize: 20 }}>
            Your figures
          </div>
          <p>Economics needs your two day rates; none are guessed.</p>
        </div>
      </div>
    </Frame>
  );
}

export function DeliveryScreen({ data, actions }: { data: ShowcaseData; actions: ScreenActions }) {
  const { facts } = data;
  return (
    <Frame data={data} tool="delivery" view="business" lead="Hand everything over as one package, sealed." actions={actions}>
      <div className="g2">
        <div className="card">
          <h3>The seven tools of this demo project</h3>
          <p className="s">Their state, as the demo states it.</p>
          <ol className="rail">
            {facts.rail.map((r, i) => (
              <li key={r.label}>
                <span className="no">{i + 1}</span>
                <b>{r.label}</b>
                <span className={`st ${r.state}`}>{r.badge}</span>
                <span className="d">{r.detail}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card pack" {...part('pack')}>
          <div className="lbl">Audit pack</div>
          <h3 className="chips" style={{ fontSize: 16, fontWeight: 800, margin: '4px 0' }}>
            Signed and verifiable <span className="chip demo">Not in the demo</span>
          </h3>
          <p style={{ fontSize: 13 }}>Signed by the server over the analysis run. It holds:</p>
          <div className="files">
            <div>
              <span>manifest.json</span>
              <span>SHA-256 of every file</span>
            </div>
            <div>
              <span>signature</span>
              <span>HMAC-SHA256</span>
            </div>
            <div>
              <span>signatureEd25519</span>
              <span>public key published</span>
            </div>
            <div>
              <span>07-user-attested.md</span>
              <span>your statements, not signed</span>
            </div>
          </div>
          <div className="verify">
            <ShieldCheck className="i" aria-hidden="true" />
            <span>
              <b>Verify it yourself.</b> In the browser at /verify-pack (the archive stays on your machine), or offline with the open verifier script.
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Quiet onQuiet={actions.quiet}>Download audit pack</Quiet>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>What a real handover still needs</h3>
        <ul className="plain">
          {facts.handoverMissing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

export function EndScreen({
  lens,
  onBack,
  onCopy,
}: {
  lens: ShowcaseLens;
  onBack: () => void;
  onCopy: (lens: ShowcaseLens) => void;
}) {
  const share: Array<[ShowcaseLens, string]> =
    lens === 'business'
      ? [['it', 'Send this to your IT colleague']]
      : lens === 'it'
        ? [['management', 'Send this to your manager']]
        : lens === 'management'
          ? [['it', 'Send this to your IT colleague']]
          : [
              ['it', 'Send to your IT colleague'],
              ['management', 'Send to your manager'],
            ];
  return (
    <div className="endwrap">
      <article className="end" aria-labelledby="showcase-end-title" data-showcase-end="">
        <div>
          <span className="chip turn">Your turn</span>
          <h2 id="showcase-end-title" tabIndex={-1}>
            {SHOWCASE_END.title[lens]}
          </h2>
          <p className="lead">{SHOWCASE_END.lead[lens]}</p>
          <div className="ctas">
            <AuthLink to={SHOWCASE_CONTINUE_TARGET} variant="primary" testId="showcase-cta-primary">
              {lens === 'all' ? SHOWCASE_END.primary : SHOWCASE_END.title[lens]} <ArrowRight size={16} aria-hidden="true" />
            </AuthLink>
            <AuthLink to={SHOWCASE_OWN_CODE_TARGET} variant="secondary" testId="showcase-cta-own">
              {SHOWCASE_END.ownCode}
            </AuthLink>
          </div>
          <ol className="steps3" aria-label="With your own code">
            {SHOWCASE_END.ownSteps.map(([title, text], i) => (
              <li key={title}>
                <span className="no">{i + 1}</span>
                <div>
                  <b>{title}</b>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ol>
          <div className="share">
            <span>Not your decision alone?</span>
            {share.map(([target, label]) => (
              <button key={target} type="button" className="btn ghost" data-showcase-share={target} onClick={() => onCopy(target)}>
                {label}
              </button>
            ))}
            <button type="button" className="btn ghost" onClick={() => window.print()}>
              Print the story
            </button>
          </div>
          <div className="already">
            <span>Already have an account?</span>
            <AuthLink to={SHOWCASE_CONTINUE_TARGET} variant="ghost" size="sm" testId="showcase-end-signin">
              Sign in
            </AuthLink>
            <span>and the demo project waits in your workspace.</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={onBack}>
              <ArrowLeft className="i" aria-hidden="true" /> Back
            </button>
          </div>
        </div>
        <div>
          <div className="acct">
            <h3>What the free account gives you</h3>
            <ul>
              {SHOWCASE_END.account.map((line) => (
                <li key={line}>
                  <Check className="i" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="note">{SHOWCASE_END.accountNote}</p>
          </div>
          <div className="acct">
            <h3>Your code, your data</h3>
            <ul>
              {SHOWCASE_END.privacy.map((line) => (
                <li key={line}>
                  <Lock className="i" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>
    </div>
  );
}
