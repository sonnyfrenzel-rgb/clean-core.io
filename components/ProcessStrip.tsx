import React from 'react';

/**
 * The process the legacy program actually runs, in the notation the tool emits.
 *
 * The showroom answered two of the three questions a reader has — what is this
 * (business context) and what does it become (the code) — and skipped the one in
 * the middle: what does it *do*. That is the question a business reader is
 * actually holding, and it is the one thing the product generates that no code
 * comparison can show.
 *
 * The vocabulary is the tool's own. `app/(app)/project/[projectId]/documentation`
 * instructs the model to classify every node as a BPMN 2.0 `startEvent`,
 * `serviceTask`, `userTask`, `gateway` or `endEvent`, and to name the role that
 * carries it. This strip uses exactly those five types and the same role field,
 * so what the landing page shows is the shape of what stage 4 hands over — not a
 * marketing diagram drawn to look like one.
 *
 * One band at every width: on a phone it scrolls horizontally rather than
 * stacking, because the sequence is the content and a vertical list of five
 * boxes is no longer a flow.
 */
export type ProcessNodeType = 'startEvent' | 'serviceTask' | 'userTask' | 'gateway' | 'endEvent';

export interface ProcessNode {
  name: string;
  type: ProcessNodeType;
  /** The actor, as stage 4 records it: System, Developer, Finance Analyst … */
  role: string;
  /** Set on the step where the released SAP API replaces the direct table read. */
  released?: boolean;
}

const TYPE_LABEL: Record<ProcessNodeType, string> = {
  startEvent: 'Start',
  serviceTask: 'Service task',
  userTask: 'User task',
  gateway: 'Gateway',
  endEvent: 'End',
};

/** BPMN draws events as circles, gateways as diamonds, tasks as rounded boxes. */
function NodeShape({ node }: { node: ProcessNode }) {
  const isEvent = node.type === 'startEvent' || node.type === 'endEvent';
  const isGateway = node.type === 'gateway';

  if (isEvent) {
    return (
      <span
        className={`h-9 w-9 shrink-0 rounded-full border-2 flex items-center justify-center ${
          node.type === 'startEvent'
            ? 'border-slate-400 bg-white'
            : 'border-slate-800 bg-white'
        }`}
        aria-hidden
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            node.type === 'startEvent' ? 'bg-slate-400' : 'bg-slate-800'
          }`}
        />
      </span>
    );
  }

  if (isGateway) {
    return (
      <span
        className="h-9 w-9 shrink-0 rotate-45 rounded-[4px] border-2 border-amber-400 bg-amber-50 flex items-center justify-center"
        aria-hidden
      >
        <span className="-rotate-45 text-[13px] font-black text-amber-600 leading-none">×</span>
      </span>
    );
  }

  return (
    <span
      className={`h-9 w-9 shrink-0 rounded-lg border-2 flex items-center justify-center ${
        node.released
          ? 'border-emerald-400 bg-emerald-50'
          : 'border-slate-300 bg-white'
      }`}
      aria-hidden
    >
      <svg
        className={`h-4 w-4 ${node.released ? 'text-emerald-600' : 'text-slate-400'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        {node.type === 'userTask' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        )}
      </svg>
    </span>
  );
}

export default function ProcessStrip({
  processArea,
  nodes,
}: {
  /** The L2 process area, as stage 4 labels it. */
  processArea: string;
  nodes: ProcessNode[];
}) {
  return (
    <div className="mb-6 rounded-xl border border-slate-200/80 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 sm:px-5 py-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          What it does
        </span>
        <span className="text-[10px] font-bold text-slate-400">·</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {processArea}
        </span>
        <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-slate-400">
          BPMN 2.0 · generated in stage 4
        </span>
      </div>

      {/* One row at every width. `snap` so a thumb lands on whole nodes. */}
      <div className="overflow-x-auto snap-x snap-mandatory">
        <ol className="flex items-stretch gap-0 px-4 sm:px-5 py-4 min-w-max">
          {nodes.map((node, i) => (
            <li key={node.name} className="flex items-stretch snap-start">
              <div className="flex w-[7.5rem] sm:w-[8.5rem] flex-col items-center text-center gap-1.5">
                <NodeShape node={node} />
                <span className="text-[11px] font-bold text-slate-700 leading-tight px-0.5">
                  {node.name}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-tight">
                  {node.role}
                </span>
                <span className="sr-only">{TYPE_LABEL[node.type]}</span>
              </div>
              {i < nodes.length - 1 && (
                <span className="flex items-start pt-[1.05rem] px-0.5 shrink-0" aria-hidden>
                  <svg className="h-3 w-4 text-slate-300" viewBox="0 0 16 12" fill="none">
                    <path d="M0 6h12M9 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
