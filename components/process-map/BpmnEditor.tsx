'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './process-map.css';
import { parseBpmn } from '@/lib/process-map';
import {
  bpmnlintHints,
  cleanCoreHints,
  type ProcessHint,
  type ProposedLane,
} from '@/lib/process-hints';
import ProcessHints from './ProcessHints';

/**
 * The editor — roadmap 3.1, and the hints of 3.3 that only exist inside it.
 *
 * 2.5 draws the reconstruction with a `NavigatedViewer`, which cannot change a
 * thing. This is the same diagram under a `Modeler`, and it is the one place in
 * the product where a person, not the engine, decides what the model says.
 *
 * ## The reconstructed Ist is never touched
 *
 * Phase 3's acceptance is explicit: *"die Ist-Revision nach dem Bearbeiten ist
 * unverändert"*. So the modeller is handed a **copy**: `initialXml` is read once
 * into the canvas, every change lives in the modeller and in the draft string
 * this component hands back, and nothing is ever written into the model the
 * reading view draws. Leaving the editor and coming back finds the draft again;
 * switching to the map finds the reconstruction, unchanged, because it was never
 * the thing being edited.
 *
 * ## Saving is roadmap 3.2, and this component does not guess at it
 *
 * `save` is a function this component is given, not one it implements. What a
 * revision is — who wrote it, when, how two of them compare — is step 3.2, and a
 * half-invented version of it here would be the thing 3.2 then has to undo.
 * Without one the footer says so in a sentence and the draft is kept; with one
 * the footer reports whatever it returns. The signature is
 * `SaveProcessModel` below.
 *
 * ## The palette is a list of buttons, not a drag source
 *
 * bpmn-js brings a palette of its own. It is a drag-and-drop surface: it cannot
 * be reached by Tab, it announces nothing, and a third of the elements the
 * roadmap names are not on it at all (the task types and the parallel gateway
 * live behind a replace menu that opens on a wrench). So the palette here is
 * plain HTML buttons with real names, each one an element of BPMN 2.0, and each
 * one placed **next to the element the reader is on** by bpmn-js's own auto
 * placement — which is exactly what its context pad does on a click. A reader
 * with a keyboard builds the same model as a reader with a mouse.
 *
 * The list beside the canvas is the other half of that: the canvas is an SVG and
 * an SVG is not a list of steps. Every element of the **draft** stands there as
 * a button with the name it carries, one tab stop for the whole list with a
 * roving `tabindex`, and it is the only way a step that was drawn a second ago
 * can be reached without a mouse — the outline of 2.9 is built from the
 * reconstruction and does not know it.
 *
 * ## Hints, never blocks
 *
 * Roadmap 3.3 in three words. The footer carries a count, the popover names
 * every element, a switch turns the whole thing off, and **nothing** here
 * consults a hint before drawing, deleting, renaming or saving.
 */

/* ------------------------------------------------------------------ *
 * What roadmap 3.2 will provide.
 * ------------------------------------------------------------------ */

export interface SaveProcessModelInput {
  /** The draft as BPMN 2.0 XML — what the modeller serialised, unchanged. */
  xml: string;
  /** The reconstruction this draft started from. Revision 1 is this and stays this. */
  baseXml: string;
  /** The file the signed run analysed — the model's subject. */
  fileName: string;
}

export interface SaveProcessModelResult {
  ok: boolean;
  /** One sentence for the footer: what was saved, or why nothing was. */
  message: string;
  /** The revision that was written, when one was. */
  revisionId?: string;
}

/** Roadmap 3.2 supplies this. Until it does, the footer says saving is not there yet. */
export type SaveProcessModel = (input: SaveProcessModelInput) => Promise<SaveProcessModelResult>;

const SAVING_ARRIVES_WITH_REVISIONS: SaveProcessModel = async () => ({
  ok: false,
  message: 'Keeping a model is a revision with an account and a time — roadmap step 3.2. Your draft is kept in this'
    + ' session and the reconstruction is untouched.',
});

/* ------------------------------------------------------------------ *
 * The palette.
 * ------------------------------------------------------------------ */

/** How an entry reaches the canvas. */
export type PaletteHow = 'append' | 'pool' | 'lane' | 'message-flow';

export interface PaletteEntry {
  /** `user-task` — what the button is found by. */
  id: string;
  /** What the button says. */
  label: string;
  /** The BPMN 2.0 type it creates. */
  type: string;
  /** The heading it stands under. */
  group: string;
  how: PaletteHow;
  /** Extra moddle properties — `isExpanded`, an event definition. */
  options?: Record<string, unknown>;
}

/**
 * The elements of BPMN 2.0 this editor can draw — roadmap 3.1, item by item.
 *
 * *Pools and lanes · start, intermediate and end events · exclusive and parallel
 * gateways · task types · sub-process · data object · message flow ·
 * annotation.* Written out rather than described, so the list on the screen and
 * the list in the roadmap can be compared without reading any code.
 */
export const EDITOR_PALETTE: readonly PaletteEntry[] = Object.freeze([
  { id: 'pool', label: 'Pool', type: 'bpmn:Participant', group: 'Structure', how: 'pool' },
  { id: 'lane', label: 'Lane', type: 'bpmn:Lane', group: 'Structure', how: 'lane' },
  { id: 'sub-process', label: 'Sub-process', type: 'bpmn:SubProcess', group: 'Structure', how: 'append' },

  { id: 'start-event', label: 'Start event', type: 'bpmn:StartEvent', group: 'Events', how: 'append' },
  {
    id: 'intermediate-event',
    label: 'Intermediate event',
    type: 'bpmn:IntermediateThrowEvent',
    group: 'Events',
    how: 'append',
  },
  { id: 'end-event', label: 'End event', type: 'bpmn:EndEvent', group: 'Events', how: 'append' },

  { id: 'exclusive-gateway', label: 'Exclusive gateway', type: 'bpmn:ExclusiveGateway', group: 'Gateways', how: 'append' },
  { id: 'parallel-gateway', label: 'Parallel gateway', type: 'bpmn:ParallelGateway', group: 'Gateways', how: 'append' },

  { id: 'task', label: 'Task', type: 'bpmn:Task', group: 'Tasks', how: 'append' },
  { id: 'user-task', label: 'User task', type: 'bpmn:UserTask', group: 'Tasks', how: 'append' },
  { id: 'service-task', label: 'Service task', type: 'bpmn:ServiceTask', group: 'Tasks', how: 'append' },
  { id: 'send-task', label: 'Send task', type: 'bpmn:SendTask', group: 'Tasks', how: 'append' },
  { id: 'receive-task', label: 'Receive task', type: 'bpmn:ReceiveTask', group: 'Tasks', how: 'append' },
  { id: 'manual-task', label: 'Manual task', type: 'bpmn:ManualTask', group: 'Tasks', how: 'append' },
  { id: 'business-rule-task', label: 'Business rule task', type: 'bpmn:BusinessRuleTask', group: 'Tasks', how: 'append' },
  { id: 'script-task', label: 'Script task', type: 'bpmn:ScriptTask', group: 'Tasks', how: 'append' },

  { id: 'data-object', label: 'Data object', type: 'bpmn:DataObjectReference', group: 'Artefacts', how: 'append' },
  { id: 'message-flow', label: 'Message flow', type: 'bpmn:MessageFlow', group: 'Artefacts', how: 'message-flow' },
  { id: 'annotation', label: 'Annotation', type: 'bpmn:TextAnnotation', group: 'Artefacts', how: 'append' },
] as PaletteEntry[]);

/** The groups, in the order they stand in the palette. */
export const PALETTE_GROUPS: readonly string[] = Object.freeze(
  EDITOR_PALETTE.reduce<string[]>((groups, entry) => (
    groups.includes(entry.group) ? groups : [...groups, entry.group]
  ), []),
);

/* ------------------------------------------------------------------ *
 * As much of bpmn-js as this file uses.
 * ------------------------------------------------------------------ */

interface Bounds {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface Shape extends Bounds {
  id: string;
  type?: string;
  parent?: Shape | null;
  children?: Shape[];
  businessObject?: { $type?: string; name?: string; id?: string };
}

interface CanvasService {
  zoom(level: string | number): void;
  getRootElement(): Shape | null;
  setRootElement(element: Shape): void;
  findRoot(id: string): Shape | undefined;
}

interface ModelingService {
  createShape(shape: Shape, position: { x: number; y: number }, parent: Shape): Shape;
  connect(source: Shape, target: Shape): unknown;
  removeElements(elements: Shape[]): void;
  updateProperties(element: Shape, properties: Record<string, unknown>): void;
  addLane(shape: Shape, location: string): Shape;
}

interface ElementFactoryService {
  createShape(attrs: Record<string, unknown>): Shape;
  createParticipantShape(attrs?: Record<string, unknown>): Shape;
}

interface AutoPlaceService {
  append(source: Shape, shape: Shape): Shape;
}

interface SelectionService {
  select(element: Shape | null): void;
  get(): Shape[];
}

interface ElementRegistryService {
  get(id: string): Shape | undefined;
  getAll(): Shape[];
}

interface RulesService {
  allowed(action: string, context: Record<string, unknown>): unknown;
}

interface CommandStackService {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
}

interface EventBusService {
  on(event: string, callback: (event?: unknown) => void): void;
}

interface ModelerLike {
  importXML(xml: string): Promise<{ warnings: unknown[] }>;
  saveXML(options?: { format?: boolean }): Promise<{ xml?: string }>;
  getDefinitions(): unknown;
  get<T>(service: string): T;
  destroy(): void;
}

/* ------------------------------------------------------------------ *
 * The component.
 * ------------------------------------------------------------------ */

export interface BpmnEditorProps {
  /**
   * What to open — the draft the reader left behind, or the reconstruction.
   *
   * A function rather than a string, and it matters: the draft changes on every
   * stroke, and a string prop would make the modeller its own effect input and
   * tear the canvas down under the reader's hand. This is read once, when the
   * canvas is built.
   */
  openWith: () => string;
  /** The reconstruction itself. Handed to `save` as the base of revision 1; never written to. */
  baseXml: string;
  /** The file the signed run analysed. */
  fileName: string;
  /** A sentence about the process as a whole, for the canvas's accessible name. */
  label: string;
  /** Element id → what a reader calls it, for the elements the reconstruction knows. */
  labels: ReadonlyMap<string, string>;
  /** The lanes roadmap 2.4 proposed — the third hint rule reads them. */
  proposedLanes: readonly ProposedLane[];
  /** The selection the reading view had. Restored into the modeller when it opens. */
  selected: string | null;
  /** Reported back **only** for elements the reconstruction knows — see the note below. */
  onSelectedChange: (elementId: string | null) => void;
  /** Every change to the draft, as BPMN 2.0 XML. The parent keeps it so the mode can be switched. */
  onDraftChange: (xml: string) => void;
  /** Throw the draft away and open the reconstruction again. */
  onDiscard: () => void;
  /** Roadmap 3.2. Omitted until it exists. */
  save?: SaveProcessModel;
}

/** A row of the list beside the canvas. */
interface DraftRow {
  id: string;
  label: string;
  kind: string;
  /** True when this element is not in the reconstruction. */
  drawn: boolean;
}

const KIND_WORDS: Record<string, string> = {
  startEvent: 'Start',
  endEvent: 'End',
  exclusiveGateway: 'Decision',
  parallelGateway: 'Parallel split',
  task: 'Step',
  serviceTask: 'Service step',
  sendTask: 'Message step',
  receiveTask: 'Message wait',
  userTask: 'User step',
  manualTask: 'Manual step',
  businessRuleTask: 'Business rule',
  scriptTask: 'Step',
  callActivity: 'Call',
  subProcess: 'Sub-process',
  boundaryEvent: 'Error boundary',
  intermediateCatchEvent: 'Wait',
  intermediateThrowEvent: 'Event',
};

export default function BpmnEditor({
  openWith,
  baseXml,
  fileName,
  label,
  labels,
  proposedLanes,
  selected,
  onSelectedChange,
  onDraftChange,
  onDiscard,
  save,
}: BpmnEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modelerRef = useRef<ModelerLike | null>(null);
  const [ready, setReady] = useState(false);
  const [draftXml, setDraftXml] = useState(openWith);
  const [dirty, setDirty] = useState(false);
  const [current, setCurrent] = useState<string | null>(selected);
  const [note, setNote] = useState<string | null>(null);
  const [hintsOn, setHintsOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  /**
   * The selection is reported upward only for elements the reconstruction
   * knows.
   *
   * The address in the URL is resolved against the reconstruction
   * (`resolveMapAddress`), so an id that is not in it is dropped on the way
   * back and the selection would flicker off the moment a reader clicked the
   * step they had just drawn. A drawn element is therefore the editor's own
   * business until it is part of a saved revision — which is roadmap 3.2.
   */
  const report = useCallback((id: string | null) => {
    setCurrent(id);
    if (id === null || labels.has(id)) onSelectedChange(id);
  }, [labels, onSelectedChange]);

  const reportRef = useRef(report);
  const draftChangeRef = useRef(onDraftChange);
  useEffect(() => {
    reportRef.current = report;
    draftChangeRef.current = onDraftChange;
  });

  /* ---------------- the modeller ---------------- */

  useEffect(() => {
    let cancelled = false;
    let modeler: ModelerLike | null = null;

    const build = async () => {
      const host = hostRef.current;
      if (!host) return;
      const { default: Modeler } = await import('bpmn-js/lib/Modeler');
      if (cancelled) return;
      modeler = new Modeler({ container: host }) as unknown as ModelerLike;
      modelerRef.current = modeler;

      try {
        await modeler.importXML(openWith());
      } catch {
        // A file this build wrote and cannot read back is a defect, not a state
        // to draw. The list beside the canvas is built from the same XML and is
        // unaffected, so the reader is not left with an empty box.
        return;
      }
      if (cancelled) return;

      const canvas = modeler.get<CanvasService>('canvas');
      canvas.zoom('fit-viewport');

      const eventBus = modeler.get<EventBusService>('eventBus');
      const commandStack = modeler.get<CommandStackService>('commandStack');
      const selection = modeler.get<SelectionService>('selection');

      const publish = () => {
        const held = modelerRef.current;
        if (!held) return;
        setDirty(commandStack.canUndo());
        void held.saveXML({ format: true }).then((result) => {
          if (cancelled || !result.xml) return;
          setDraftXml(result.xml);
          draftChangeRef.current(result.xml);
        }).catch(() => {
          /* a draft that cannot be serialised is still on the canvas */
        });
      };

      eventBus.on('commandStack.changed', publish);
      eventBus.on('selection.changed', () => {
        const picked = selection.get()[0];
        reportRef.current(picked?.id ?? null);
      });

      setReady(true);
    };

    void build();

    return () => {
      cancelled = true;
      try {
        modeler?.destroy();
      } catch {
        /* a modeller that never finished importing has nothing to tear down */
      }
      modelerRef.current = null;
    };
  }, [openWith]);

  /** The selection the reading view had, put back on the canvas once it is there. */
  useEffect(() => {
    if (!ready || !selected) return;
    const modeler = modelerRef.current;
    if (!modeler) return;
    const shape = modeler.get<ElementRegistryService>('elementRegistry').get(selected);
    if (shape) modeler.get<SelectionService>('selection').select(shape);
  }, [ready, selected]);

  /* ---------------- the draft, read back as a list ---------------- */

  const rows: DraftRow[] = useMemo(() => {
    const parsed = parseBpmn(draftXml);
    return parsed.elements.map((element) => ({
      id: element.id,
      label: labels.get(element.id) || element.name || element.id,
      kind: KIND_WORDS[element.tag] ?? 'Step',
      drawn: element.trace === null,
    }));
  }, [draftXml, labels]);

  /* ---------------- the hints ---------------- */

  /**
   * The four rules of the roadmap are pure, so they are a `useMemo` and are on
   * screen in the same paint as the change that caused them. bpmnlint needs the
   * modeller's tree and a dynamic import, so it arrives later and is held
   * **with the draft it was measured on** — a list of standard hints about an
   * older draft is not a shorter list, it is a wrong one.
   */
  const ownHints = useMemo(
    () => cleanCoreHints({ xml: draftXml, labels, proposedLanes }),
    [draftXml, labels, proposedLanes],
  );
  const [standard, setStandard] = useState<{ of: string; hints: ProcessHint[] }>({ of: '', hints: [] });

  useEffect(() => {
    let cancelled = false;
    const modeler = modelerRef.current;
    if (!ready || !modeler) return;
    bpmnlintHints(modeler.getDefinitions(), labels)
      .then((found) => {
        if (!cancelled) setStandard({ of: draftXml, hints: found });
      })
      .catch(() => {
        /* no standard rules is a shorter list, not a broken editor */
      });
    return () => {
      cancelled = true;
    };
  }, [draftXml, labels, ready]);

  const hints = useMemo(
    () => (standard.of === draftXml ? [...ownHints, ...standard.hints] : ownHints),
    [draftXml, ownHints, standard],
  );

  /* ---------------- drawing ---------------- */

  /** Where a new shape goes when there is nothing to append it to. */
  const freeSpot = (parent: Shape): { x: number; y: number } => {
    const children = parent.children ?? [];
    let bottom = (parent.y ?? 0) + 60;
    for (const child of children) bottom = Math.max(bottom, (child.y ?? 0) + (child.height ?? 0));
    return { x: (parent.x ?? 0) + 180, y: bottom + 80 };
  };

  const add = useCallback((entry: PaletteEntry) => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const modeling = modeler.get<ModelingService>('modeling');
    const factory = modeler.get<ElementFactoryService>('elementFactory');
    const registry = modeler.get<ElementRegistryService>('elementRegistry');
    const canvas = modeler.get<CanvasService>('canvas');
    const selection = modeler.get<SelectionService>('selection');
    const rules = modeler.get<RulesService>('rules');
    const root = canvas.getRootElement();
    if (!root) return;
    const source = current ? (registry.get(current) ?? null) : null;

    const participants = registry.getAll().filter((shape) => shape.type === 'bpmn:Participant');
    const participantOf = (shape: Shape | null): Shape | null => {
      let walk: Shape | null | undefined = shape;
      while (walk) {
        if (walk.type === 'bpmn:Participant') return walk;
        walk = walk.parent;
      }
      return null;
    };

    setNote(null);

    try {
      if (entry.how === 'pool') {
        const pool = factory.createParticipantShape({ isExpanded: true });
        const placed = modeling.createShape(pool, freeSpot(root), root);
        selection.select(placed);
        return;
      }

      if (entry.how === 'lane') {
        const host = participantOf(source) ?? participants[0] ?? null;
        if (!host) {
          setNote('A lane lives in a pool. Add a pool first, then a lane.');
          return;
        }
        const lane = modeling.addLane(host, 'bottom');
        selection.select(lane);
        return;
      }

      if (entry.how === 'message-flow') {
        const from = source;
        if (!from) {
          setNote('A message flow starts at a step. Pick one in the list first.');
          return;
        }
        const own = participantOf(from);
        const target = participants.find((pool) => pool !== own) ?? null;
        if (!target) {
          setNote('A message flow crosses a pool boundary. Add a second pool first.');
          return;
        }
        if (!rules.allowed('connection.create', { source: from, target })) {
          setNote(`BPMN does not allow a message flow from “${from.businessObject?.name || from.id}” to that pool.`);
          return;
        }
        modeling.connect(from, target);
        return;
      }

      const shape = factory.createShape({ type: entry.type, ...(entry.options ?? {}) });
      const appendable = source
        && !!rules.allowed('connection.create', { source, target: shape })
        && source.type !== 'bpmn:Participant';
      if (appendable && source) {
        const placed = modeler.get<AutoPlaceService>('autoPlace').append(source, shape);
        selection.select(placed);
        return;
      }
      // Nothing to hang it on: on the plane, inside the pool the reader is in.
      const parent = participantOf(source) ?? (root.type === 'bpmn:Collaboration' ? participants[0] : null) ?? root;
      const placed = modeling.createShape(shape, freeSpot(parent), parent);
      selection.select(placed);
    } catch {
      // bpmn-js refuses what BPMN refuses. That is the grammar of the notation
      // speaking, and it is said in a line of text rather than swallowed.
      setNote(`“${entry.label}” cannot go there. Pick another element in the list and try again.`);
    }
  }, [current]);

  const rename = useCallback(() => {
    const modeler = modelerRef.current;
    if (!modeler || !current) return;
    const shape = modeler.get<ElementRegistryService>('elementRegistry').get(current);
    if (!shape) return;
    modeler.get<ModelingService>('modeling').updateProperties(shape, { name });
    setName('');
  }, [current, name]);

  const remove = useCallback(() => {
    const modeler = modelerRef.current;
    if (!modeler || !current) return;
    const shape = modeler.get<ElementRegistryService>('elementRegistry').get(current);
    if (!shape) return;
    try {
      modeler.get<ModelingService>('modeling').removeElements([shape]);
      reportRef.current(null);
    } catch {
      setNote('bpmn-js will not remove that element on its own.');
    }
  }, [current]);

  const undo = useCallback(() => modelerRef.current?.get<CommandStackService>('commandStack').undo(), []);
  const redo = useCallback(() => modelerRef.current?.get<CommandStackService>('commandStack').redo(), []);

  const pick = useCallback((id: string) => {
    const modeler = modelerRef.current;
    report(id);
    const shape = modeler?.get<ElementRegistryService>('elementRegistry').get(id);
    if (shape && modeler) modeler.get<SelectionService>('selection').select(shape);
  }, [report]);

  /** One tab stop for the list, arrow keys inside it — the same contract as the map of 2.5. */
  const onListKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (rows.length === 0) return;
    const index = rows.findIndex((row) => row.id === current);
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;
    else {
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      const from = index >= 0 ? index : step > 0 ? -1 : rows.length;
      next = Math.min(rows.length - 1, Math.max(0, from + step));
    }
    const row = rows[next];
    if (!row) return;
    pick(row.id);
    const host = event.currentTarget;
    window.requestAnimationFrame(() => {
      host.querySelector<HTMLButtonElement>(`[data-draft-row="${CSS.escape(row.id)}"]`)?.focus();
    });
  }, [current, pick, rows]);

  const [saved, setSaved] = useState<string | null>(null);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const keep = save ?? SAVING_ARRIVES_WITH_REVISIONS;
      const result = await keep({ xml: draftXml, baseXml, fileName });
      setSaved(result.message);
      if (result.ok) setDirty(false);
    } catch {
      setSaved('The model could not be kept. Your draft is still on the canvas.');
    } finally {
      setSaving(false);
    }
  }, [baseXml, draftXml, fileName, save]);

  const activeRow = rows.find((row) => row.id === current) ?? null;

  return (
    <div data-process-editor="" className="flex min-w-0 flex-col gap-2">
      {/* ---------------- the palette ---------------- */}
      <div
        data-editor-palette=""
        role="group"
        aria-label="BPMN elements"
        className="flex flex-col gap-1.5 rounded-cc-card border border-cc-line bg-cc-surface-muted p-2"
      >
        {PALETTE_GROUPS.map((group) => (
          <div key={group} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">
              {group}
            </span>
            {EDITOR_PALETTE.filter((entry) => entry.group === group).map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-palette-item={entry.id}
                data-palette-type={entry.type}
                onClick={() => add(entry)}
                className="rounded-cc-row border border-cc-line bg-cc-surface px-2 py-0.5 text-[11px] font-semibold text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
              >
                {entry.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ---------------- what the selection can do ---------------- */}
      <div data-editor-actions="" className="flex flex-wrap items-center gap-1.5">
        <label className="text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase" htmlFor="cc-editor-name">
          Name
        </label>
        <input
          id="cc-editor-name"
          data-editor-name=""
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={activeRow ? activeRow.label : 'Pick an element'}
          className="h-8 min-w-0 flex-1 rounded-cc-row border border-cc-field-border bg-cc-surface px-2 text-[13px] font-medium text-cc-ink"
        />
        <button
          type="button"
          data-editor-rename=""
          onClick={rename}
          className="rounded-cc-row border border-cc-line bg-cc-surface px-2 py-0.5 text-[11px] font-semibold text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
        >
          Rename
        </button>
        <button
          type="button"
          data-editor-delete=""
          onClick={remove}
          className="rounded-cc-row border border-cc-line bg-cc-surface px-2 py-0.5 text-[11px] font-semibold text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
        >
          Delete
        </button>
        <button
          type="button"
          data-editor-undo=""
          onClick={undo}
          className="rounded-cc-row border border-cc-line bg-cc-surface px-2 py-0.5 text-[11px] font-semibold text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
        >
          Undo
        </button>
        <button
          type="button"
          data-editor-redo=""
          onClick={redo}
          className="rounded-cc-row border border-cc-line bg-cc-surface px-2 py-0.5 text-[11px] font-semibold text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
        >
          Redo
        </button>
      </div>

      {note ? (
        <p data-editor-note className="text-[12px] font-medium text-cc-ink-muted">{note}</p>
      ) : null}

      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        <div
          data-process-editor-canvas=""
          role="group"
          aria-label={`${label} Editing.`}
          className="cc-map-canvas h-[420px] w-full overflow-hidden rounded-cc-card border border-cc-line md:h-[520px]"
          ref={hostRef}
        />

        {/* The canvas is an SVG; this is the same draft as a list of controls. */}
        <div
          data-editor-elements=""
          role="listbox"
          aria-label="Elements of the draft"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="max-h-[420px] overflow-auto rounded-cc-card border border-cc-line bg-cc-surface p-1 md:max-h-[520px]"
        >
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={row.id === current}
              data-draft-row={row.id}
              data-drawn={row.drawn ? 'true' : 'false'}
              tabIndex={row.id === current || (!current && row === rows[0]) ? 0 : -1}
              onClick={() => pick(row.id)}
              className="block w-full truncate rounded-cc-row px-1.5 py-0.5 text-left text-[12px] font-medium text-cc-ink-muted hover:text-cc-ink aria-selected:bg-cc-surface-muted aria-selected:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
            >
              {row.kind}: {row.label}
              {row.drawn ? <span data-draft-drawn=""> · drawn</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- the editing footer, `DESIGN.md` §2.3 item 6 ---------------- */}
      <div
        data-process-editor-footer=""
        className="flex flex-wrap items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-2"
      >
        <button
          type="button"
          data-editor-save=""
          disabled={saving}
          onClick={() => void onSave()}
          className="rounded-cc-row bg-cc-brand-strong px-3 py-1 text-[12px] font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
        >
          Save
        </button>
        <button
          type="button"
          data-editor-discard=""
          onClick={onDiscard}
          className="rounded-cc-row px-3 py-1 text-[12px] font-semibold text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
        >
          Discard
        </button>
        {dirty ? (
          <span data-editor-dirty className="text-[12px] font-semibold text-cc-ink">Unsaved changes</span>
        ) : null}
        <ProcessHints hints={hints} on={hintsOn} onOnChange={setHintsOn} onJump={pick} />
      </div>

      {saved ? (
        <p data-editor-saved className="text-[12px] font-medium text-cc-ink-muted">{saved}</p>
      ) : null}
    </div>
  );
}
