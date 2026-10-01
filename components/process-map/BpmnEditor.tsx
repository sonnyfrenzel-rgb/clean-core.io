'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileUp,
  GitCompare,
  Keyboard,
  LayoutGrid,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Redo2,
  Scan,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import 'bpmn-js/dist/assets/diagram-js.css';
import { saveDraft } from './draft-save';
import CcButton from '@/components/cc/Button';
import CcDisclosure from '@/components/cc/Disclosure';
import CcIconButton from '@/components/cc/IconButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './process-map.css';
import { fitWithPadding, rendererColors, textRendererConfig, type ViewboxCanvas } from './bpmn-view';
import { EARLY_END_WORD, parseBpmn, type ReconstructionTrace } from '@/lib/process-map';
import { diffProcessRevisions, type RevisionDiff } from '@/lib/process-revisions';
import { bpmnFileName } from '@/lib/bpmn/export';
import { MAX_IMPORT_CHARS, type ImportOutcome } from '@/lib/bpmn/import';
import { saveAs } from '@/lib/fileSaver';
import {
  bpmnlintHints,
  cleanCoreHints,
  type ProcessHint,
  type ProposedLane,
} from '@/lib/process-hints';
import ProcessHints from './ProcessHints';
import EditorProperties, { type ElementOrigin } from './EditorProperties';
import EditorMinimap from './EditorMinimap';
import EditorImport from './EditorImport';
import {
  overlapsOnLevel,
  svgToPng,
  tidyLevel,
  type AutoPlaceService,
  type CanvasService,
  type CommandStackService,
  type CreateService,
  type ElementFactoryService,
  type ElementRegistryService,
  type EventBusService,
  type ModelerLike,
  type ModelingService,
  type RulesService,
  type SelectionService,
  type Shape,
} from './editor-bpmn';
import {
  editorAddedInRevision,
  editorEditingRevision,
  editorNewerRevision,
  editorOverlaps,
  editorZoomLabel,
  mapEditorCannotGoThere,
  mapEditorCanvasLabel,
  mapEditorMessageFlowRefused,
  wt,
} from '@/lib/workspace-messages';

/**
 * The editor — roadmap 3.1, the hints of 3.3 that only exist inside it, and
 * since 01.10.2026 a modelling surface on par with what process people know
 * from SAP Signavio and Camunda Modeler (owner: "a real professional BPMN
 * editor, before 3.0").
 *
 * ## The reconstructed Ist is never touched
 *
 * Phase 3's acceptance is explicit: *"die Ist-Revision nach dem Bearbeiten ist
 * unverändert"*. So the modeller is handed a **copy**: the draft lives in the
 * modeller and in the string this component hands back, and nothing is ever
 * written into the model the reading view draws. An import reads a file into
 * that copy; it never replaces revision 1, which only the server writes.
 *
 * ## Saving is the caller's
 *
 * `save` is a function this component is given (`SaveProcessModel` below): the
 * Documentation stage and the workspace both build it over
 * `lib/process-revisions-client.ts`, so the two write one history. `openLatest`
 * is its other half — the newest revision, whichever screen saved it — so a
 * revision saved in one place opens in the other.
 *
 * ## Two palettes, on purpose (ADR note in `docs/design/decisions.md`)
 *
 * bpmn-js's own tools are on: the palette on the canvas (hand, lasso, space,
 * connect, every element to drag), the context pad on a selection (append,
 * the wrench that changes the type, connect, delete), the replace menu,
 * snapping, align and distribute on a multi-selection, copy and paste,
 * keyboard shortcuts and the search. That is the surface pointer users know
 * from Signavio and Camunda.
 *
 * It is not a keyboard surface: a drag source cannot be reached by Tab and the
 * SVG announces nothing. So the row of real buttons above the canvas stays —
 * each one an element of BPMN 2.0, placed next to the element the reader is on
 * (click or Enter) or dragged onto the canvas (pointer) — and so does the list
 * of the draft's elements beside it, one tab stop with arrow keys, the only way
 * a step drawn a second ago is reached without a mouse. A reader with a
 * keyboard builds the same model as a reader with a mouse.
 *
 * ## Plain names are what is edited
 *
 * The canvas shows, and the name field changes, the plain-language name a
 * business reader sees (`lib/abap/plain-language.ts`). The token in the code
 * stays in the element's `cc:trace` and is shown read-only in the properties;
 * "Technical names" puts it first in the list and the panel. The exported file
 * keeps both, as the reading export does.
 *
 * ## Hints, never blocks
 *
 * Roadmap 3.3 in three words. The footer carries a count, the popover names
 * every element, a switch turns the whole thing off, and **nothing** here
 * consults a hint before drawing, deleting, renaming or saving. The overlap
 * count beside it is the same kind of thing: it offers "Tidy layout", it never
 * moves anything by itself.
 */

/* ------------------------------------------------------------------ *
 * What the caller provides — roadmap 3.2.
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

/** Supplied by whoever mounts the editor. In the product: the documentation stage. */
export type SaveProcessModel = (input: SaveProcessModelInput) => Promise<SaveProcessModelResult>;

/** No `save` prop: a statement about this mounting, not about the product. */
const NO_PLACE_TO_KEEP_IT: SaveProcessModel = async () => ({
  ok: false,
  message: wt('mapEditor.noPlaceToKeep'),
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
  {
    id: 'pool',
    label: wt('mapEditor.pool'),
    type: 'bpmn:Participant',
    group: wt('mapEditor.groupStructure'),
    how: 'pool',
  },
  {
    id: 'lane',
    label: wt('mapEditor.lane'),
    type: 'bpmn:Lane',
    group: wt('mapEditor.groupStructure'),
    how: 'lane',
  },
  {
    id: 'sub-process',
    label: wt('mapEditor.subProcess'),
    type: 'bpmn:SubProcess',
    group: wt('mapEditor.groupStructure'),
    how: 'append',
  },

  {
    id: 'start-event',
    label: wt('mapEditor.startEvent'),
    type: 'bpmn:StartEvent',
    group: wt('mapEditor.groupEvents'),
    how: 'append',
  },
  {
    id: 'intermediate-event',
    label: wt('mapEditor.intermediateEvent'),
    type: 'bpmn:IntermediateThrowEvent',
    group: wt('mapEditor.groupEvents'),
    how: 'append',
  },
  {
    id: 'end-event',
    label: wt('mapEditor.endEvent'),
    type: 'bpmn:EndEvent',
    group: wt('mapEditor.groupEvents'),
    how: 'append',
  },

  {
    id: 'exclusive-gateway',
    label: wt('mapEditor.exclusiveGateway'),
    type: 'bpmn:ExclusiveGateway',
    group: wt('mapEditor.groupGateways'),
    how: 'append',
  },
  {
    id: 'parallel-gateway',
    label: wt('mapEditor.parallelGateway'),
    type: 'bpmn:ParallelGateway',
    group: wt('mapEditor.groupGateways'),
    how: 'append',
  },

  {
    id: 'task',
    label: wt('mapEditor.task'),
    type: 'bpmn:Task',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },
  {
    id: 'user-task',
    label: wt('mapEditor.userTask'),
    type: 'bpmn:UserTask',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },
  {
    id: 'service-task',
    label: wt('mapEditor.serviceTask'),
    type: 'bpmn:ServiceTask',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },
  {
    id: 'send-task',
    label: wt('mapEditor.sendTask'),
    type: 'bpmn:SendTask',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },
  {
    id: 'receive-task',
    label: wt('mapEditor.receiveTask'),
    type: 'bpmn:ReceiveTask',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },
  {
    id: 'manual-task',
    label: wt('mapEditor.manualTask'),
    type: 'bpmn:ManualTask',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },
  {
    id: 'business-rule-task',
    label: wt('mapEditor.businessRuleTask'),
    type: 'bpmn:BusinessRuleTask',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },
  {
    id: 'script-task',
    label: wt('mapEditor.scriptTask'),
    type: 'bpmn:ScriptTask',
    group: wt('mapEditor.groupTasks'),
    how: 'append',
  },

  {
    id: 'data-object',
    label: wt('mapEditor.dataObject'),
    type: 'bpmn:DataObjectReference',
    group: wt('mapEditor.groupArtefacts'),
    how: 'append',
  },
  {
    id: 'message-flow',
    label: wt('mapEditor.messageFlow'),
    type: 'bpmn:MessageFlow',
    group: wt('mapEditor.groupArtefacts'),
    how: 'message-flow',
  },
  {
    id: 'annotation',
    label: wt('mapEditor.annotation'),
    type: 'bpmn:TextAnnotation',
    group: wt('mapEditor.groupArtefacts'),
    how: 'append',
  },
] as PaletteEntry[]);

/** The groups, in the order they stand in the palette. */
export const PALETTE_GROUPS: readonly string[] = Object.freeze(
  EDITOR_PALETTE.reduce<string[]>((groups, entry) => (
    groups.includes(entry.group) ? groups : [...groups, entry.group]
  ), []),
);

/* ------------------------------------------------------------------ *
 * The component.
 * ------------------------------------------------------------------ */

/** A saved revision the editor can open — what the caller's `openLatest` answers. */
export interface OpenedRevision {
  revision: number;
  xml: string;
  /** "Revision 3 · saved by Sonny Frenzel" — `revisionLine` of the store. */
  line: string;
  origin: 'reconstructed' | 'edited';
}

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
  /** The reconstruction in the plain reading the editor shows — what "Compare with Ist" and an import compare against. */
  istXml: string;
  /** The file the signed run analysed. */
  fileName: string;
  /** The source the signed run analysed — the properties show the anchored lines out of it. */
  source?: string;
  /** A sentence about the process as a whole, for the canvas's accessible name. */
  label: string;
  /** Element id → what a reader calls it, for the elements the reconstruction knows. */
  labels: ReadonlyMap<string, string>;
  /** Elements whose business name is a model proposal (roadmap 2.4). */
  proposals?: ReadonlySet<string>;
  /** The lanes roadmap 2.4 proposed — the third hint rule reads them. */
  proposedLanes: readonly ProposedLane[];
  /** The "Technical names" switch of the map: the source token first in the list and the properties. */
  technical?: boolean;
  /** The selection the reading view had. Restored into the modeller when it opens. */
  selected: string | null;
  /** Reported back **only** for elements the reconstruction knows — see the note below. */
  onSelectedChange: (elementId: string | null) => void;
  /** Every change to the draft, as BPMN 2.0 XML. The parent keeps it so the mode can be switched. */
  onDraftChange: (xml: string) => void;
  /** Throw the draft away and open the reconstruction again. */
  onDiscard: () => void;
  /** Roadmap 3.2 — keep the draft as a revision. Omitted means the footer says so. */
  save?: SaveProcessModel;
  /**
   * The newest saved revision of this process, and the base the next save is
   * written against. Omitted: the editor knows only the reconstruction.
   */
  openLatest?: () => Promise<OpenedRevision | null>;
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
  startEvent: wt('mapEditor.kindStart'),
  endEvent: wt('mapEditor.kindEnd'),
  exclusiveGateway: wt('mapEditor.kindDecision'),
  parallelGateway: wt('mapEditor.kindParallelSplit'),
  task: wt('mapEditor.kindStep'),
  serviceTask: wt('mapEditor.kindServiceStep'),
  sendTask: wt('mapEditor.kindMessageStep'),
  receiveTask: wt('mapEditor.kindMessageWait'),
  userTask: wt('mapEditor.kindUserStep'),
  manualTask: wt('mapEditor.kindManualStep'),
  businessRuleTask: wt('mapEditor.kindBusinessRule'),
  scriptTask: wt('mapEditor.kindStep'),
  callActivity: wt('mapEditor.kindCall'),
  subProcess: wt('mapEditor.kindSubProcess'),
  boundaryEvent: wt('mapEditor.kindErrorBoundary'),
  intermediateCatchEvent: wt('mapEditor.kindWait'),
  intermediateThrowEvent: wt('mapEditor.kindEvent'),
};

const DIFF_ADDED = 'cc-diff-added';
const DIFF_CHANGED = 'cc-diff-changed';

/** The surface colour, for a PNG that looks like the canvas. */
function surfaceColour(host: HTMLElement | null): string {
  if (!host) return 'white';
  return getComputedStyle(host).getPropertyValue('--cc-surface').trim() || 'white';
}

export default function BpmnEditor({
  openWith,
  baseXml,
  istXml,
  fileName,
  source = '',
  label,
  labels,
  proposals,
  proposedLanes,
  technical = false,
  selected,
  onSelectedChange,
  onDraftChange,
  onDiscard,
  save,
  openLatest,
}: BpmnEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const modelerRef = useRef<ModelerLike | null>(null);
  /** The modeller once it has drawn — state as well as a ref, so the panels can render from it. */
  const [modeler, setModeler] = useState<ModelerLike | null>(null);
  const [draftXml, setDraftXml] = useState(openWith);
  const [dirty, setDirty] = useState(false);
  const [current, setCurrent] = useState<string | null>(selected);
  const [note, setNote] = useState<string | null>(null);
  const [hintsOn, setHintsOn] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Bumped on every change and every selection — what the properties re-read on. */
  const [tick, setTick] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [comparing, setComparing] = useState(false);
  const [minimap, setMinimap] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [overlaps, setOverlaps] = useState(0);
  /** The revision the draft was opened from, when it is not the reconstruction. */
  const [startedFrom, setStartedFrom] = useState<OpenedRevision | null>(null);
  /** A newer revision than the reconstruction, offered rather than forced. */
  const [newer, setNewer] = useState<OpenedRevision | null>(null);
  /** Elements an imported file brought that the reconstruction does not know. */
  const [importedOutside, setImportedOutside] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState<{ fileName: string; outcome: ImportOutcome | null; saved: string | null; refused?: string | null } | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  /** Incremented on every change to the draft — see `draft-save.ts`. */
  const changeCountRef = useRef(0);
  /** An imported file on the canvas is unsaved even when the command stack is empty. */
  const loadedAsChangeRef = useRef(false);

  /**
   * The selection is reported upward only for elements the reconstruction
   * knows.
   *
   * The address in the URL is resolved against the reconstruction
   * (`resolveMapAddress`), so an id that is not in it is dropped on the way
   * back and the selection would flicker off the moment a reader clicked the
   * step they had just drawn. A drawn element is therefore the editor's own
   * business until it is part of a saved revision.
   */
  const report = useCallback((id: string | null) => {
    setCurrent(id);
    setTick((t) => t + 1);
    if (id === null || labels.has(id)) onSelectedChange(id);
  }, [labels, onSelectedChange]);

  const reportRef = useRef(report);
  const draftChangeRef = useRef(onDraftChange);
  const openLatestRef = useRef(openLatest);
  useEffect(() => {
    reportRef.current = report;
    draftChangeRef.current = onDraftChange;
    openLatestRef.current = openLatest;
  });

  /* ---------------- the modeller ---------------- */

  useEffect(() => {
    let cancelled = false;
    let built: ModelerLike | null = null;

    const build = async () => {
      const host = hostRef.current;
      if (!host) return;
      const { default: Modeler } = await import('bpmn-js/lib/Modeler');
      if (cancelled) return;
      built = new Modeler({
        container: host,
        textRenderer: textRendererConfig(host),
        bpmnRenderer: rendererColors(host),
      }) as unknown as ModelerLike;
      modelerRef.current = built;

      const opening = openWith();
      try {
        await built.importXML(opening);
      } catch {
        // A file this build wrote and cannot read back is a defect, not a state
        // to draw. The list beside the canvas is built from the same XML and is
        // unaffected, so the reader is not left with an empty box.
        return;
      }
      if (cancelled) return;

      const canvas = built.get<CanvasService>('canvas');
      // The reading map's fit: readable type, never above 100 %, the start of a wide level first.
      fitWithPadding(canvas as unknown as ViewboxCanvas);

      const eventBus = built.get<EventBusService>('eventBus');
      const commandStack = built.get<CommandStackService>('commandStack');
      const selection = built.get<SelectionService>('selection');

      const publish = () => {
        const held = modelerRef.current;
        if (!held) return;
        const ticket = ++changeCountRef.current;
        setDirty(commandStack.canUndo() || loadedAsChangeRef.current);
        setCanUndo(commandStack.canUndo());
        setCanRedo(commandStack.canRedo());
        setTick((t) => t + 1);
        void held.saveXML({ format: true }).then((result) => {
          // A later change has already been serialised or is on its way; an
          // earlier answer arriving after it must not overwrite it.
          if (cancelled || !result.xml || ticket !== changeCountRef.current) return;
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
      eventBus.on('canvas.viewbox.changed', () => {
        setZoom(Math.round(canvas.zoom() * 100));
      });
      setZoom(Math.round(canvas.zoom() * 100));

      setModeler(built);

      // The newest revision, whichever screen saved it. Asked once, offered
      // rather than forced: the reader may have opened the editor to start
      // again from the reconstruction.
      const latest = openLatestRef.current;
      if (latest && opening === istXml) {
        void latest().then((found) => {
          if (!cancelled && found && found.origin === 'edited') setNewer(found);
        }).catch(() => {
          /* no history is not an error the editor has to show */
        });
      }
    };

    void build();

    return () => {
      cancelled = true;
      try {
        built?.destroy();
      } catch {
        /* a modeller that never finished importing has nothing to tear down */
      }
      modelerRef.current = null;
      // A destroyed modeller must not stay in state: the minimap, the
      // properties and the selection read its canvas while rendering, and a
      // destroyed canvas throws (`getRootElement` → "reading 'length'"). That
      // took the whole Documentation stage down when a new model arrived while
      // the editor was open (`process-revisions-seam.spec.ts:122`, CI
      // 36909060803). Until the next one is built there is no modeller.
      const gone = built;
      if (gone) setModeler((held) => (held === gone ? null : held));
    };
  }, [openWith, istXml]);

  /** The selection the reading view had, put back on the canvas once it is there. */
  useEffect(() => {
    if (!modeler || !selected) return;
    const shape = modeler.get<ElementRegistryService>('elementRegistry').get(selected);
    if (shape) modeler.get<SelectionService>('selection').select(shape);
  }, [modeler, selected]);

  /** Replace what is on the canvas with another model — a revision or an imported file. */
  const load = useCallback(async (xml: string, asChange: boolean) => {
    const held = modelerRef.current;
    if (!held) return false;
    try {
      await held.importXML(xml);
    } catch {
      return false;
    }
    fitWithPadding(held.get<CanvasService>('canvas') as unknown as ViewboxCanvas);
    changeCountRef.current += 1;
    loadedAsChangeRef.current = asChange;
    setDraftXml(xml);
    onDraftChange(xml);
    setDirty(asChange);
    setCanUndo(false);
    setCanRedo(false);
    setCurrent(null);
    setTick((t) => t + 1);
    return true;
  }, [onDraftChange]);

  const openNewer = useCallback(async () => {
    if (!newer) return;
    if (await load(newer.xml, false)) {
      setStartedFrom(newer);
      setNewer(null);
      setImportedOutside(new Set());
    }
  }, [load, newer]);

  /* ---------------- the draft, read back ---------------- */

  const parsedDraft = useMemo(() => parseBpmn(draftXml), [draftXml]);
  const ist = useMemo(() => parseBpmn(istXml), [istXml]);
  const istById = useMemo(() => new Map(ist.elements.map((e) => [e.id, e])), [ist]);
  const startedIds = useMemo(
    () => new Set(startedFrom ? parseBpmn(startedFrom.xml).elements.map((e) => e.id) : []),
    [startedFrom],
  );
  const traces = useMemo(
    () => new Map<string, ReconstructionTrace | null>(parsedDraft.elements.map((e) => [e.id, e.trace])),
    [parsedDraft],
  );

  const rows: DraftRow[] = useMemo(() => parsedDraft.elements.map((element) => {
    const plain = element.name || labels.get(element.id) || wt('editor.unnamed');
    const shown = technical ? (element.trace?.technicalName || plain) : plain;
    return {
      id: element.id,
      label: shown,
      // ADR-054: an early end keeps its word in the editor too.
      kind: element.tag === 'endEvent' && element.trace?.early ? EARLY_END_WORD : (KIND_WORDS[element.tag] ?? wt('mapEditor.kindStep')),
      drawn: element.trace === null,
    };
  }), [parsedDraft, labels, technical]);

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
    if (!modeler) return;
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
  }, [draftXml, labels, modeler]);

  const hints = useMemo(
    () => (standard.of === draftXml ? [...ownHints, ...standard.hints] : ownHints),
    [draftXml, ownHints, standard],
  );

  /* ---------------- overlaps on the level on show ---------------- */

  useEffect(() => {
    if (!modeler) return;
    const handle = window.setTimeout(() => {
      try {
        setOverlaps(overlapsOnLevel(modeler));
      } catch {
        setOverlaps(0);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [modeler, tick]);

  /* ---------------- compare with the Ist ---------------- */

  const diff: RevisionDiff | null = useMemo(
    () => (comparing ? diffProcessRevisions({ revision: 1, xml: istXml }, { revision: 2, xml: draftXml }) : null),
    [comparing, draftXml, istXml],
  );
  const marked = useRef<Array<[string, string]>>([]);
  useEffect(() => {
    if (!modeler) return;
    const canvas = modeler.get<CanvasService>('canvas');
    const registry = modeler.get<ElementRegistryService>('elementRegistry');
    for (const [id, marker] of marked.current) {
      if (registry.get(id)) canvas.removeMarker(id, marker);
    }
    marked.current = [];
    if (!diff) return;
    for (const [list, marker] of [[diff.added, DIFF_ADDED], [diff.changed, DIFF_CHANGED]] as const) {
      for (const item of list) {
        if (!registry.get(item.id)) continue;
        canvas.addMarker(item.id, marker);
        marked.current.push([item.id, marker]);
      }
    }
  }, [diff, modeler]);

  /* ---------------- drawing ---------------- */

  /** Where a new shape goes when there is nothing to append it to. */
  const freeSpot = (parent: Shape): { x: number; y: number } => {
    const children = parent.children ?? [];
    let bottom = (parent.y ?? 0) + 60;
    for (const child of children) bottom = Math.max(bottom, (child.y ?? 0) + (child.height ?? 0));
    return { x: (parent.x ?? 0) + 180, y: bottom + 80 };
  };

  const add = useCallback((entry: PaletteEntry) => {
    const held = modelerRef.current;
    if (!held) return;
    const modeling = held.get<ModelingService>('modeling');
    const factory = held.get<ElementFactoryService>('elementFactory');
    const registry = held.get<ElementRegistryService>('elementRegistry');
    const canvas = held.get<CanvasService>('canvas');
    const selection = held.get<SelectionService>('selection');
    const rules = held.get<RulesService>('rules');
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
          setNote(wt('mapEditor.laneNeedsPool'));
          return;
        }
        const lane = modeling.addLane(host, 'bottom');
        selection.select(lane);
        return;
      }

      if (entry.how === 'message-flow') {
        const from = source;
        if (!from) {
          setNote(wt('mapEditor.messageFlowNeedsStep'));
          return;
        }
        const own = participantOf(from);
        const target = participants.find((pool) => pool !== own) ?? null;
        if (!target) {
          setNote(wt('mapEditor.messageFlowNeedsPools'));
          return;
        }
        if (!rules.allowed('connection.create', { source: from, target })) {
          setNote(mapEditorMessageFlowRefused(from.businessObject?.name || from.id));
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
        const placed = held.get<AutoPlaceService>('autoPlace').append(source, shape);
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
      setNote(mapEditorCannotGoThere(entry.label));
    }
  }, [current]);

  /** A pointer drag from a palette button: bpmn-js's own create, as its palette does it. */
  const dragOut = useCallback((entry: PaletteEntry, event: React.DragEvent<HTMLButtonElement>) => {
    const held = modelerRef.current;
    if (!held || entry.how !== 'append') return;
    event.preventDefault();
    const shape = held.get<ElementFactoryService>('elementFactory').createShape({ type: entry.type, ...(entry.options ?? {}) });
    held.get<CreateService>('create').start(event.nativeEvent, shape);
  }, []);

  const remove = useCallback(() => {
    const held = modelerRef.current;
    if (!held || !current) return;
    const shape = held.get<ElementRegistryService>('elementRegistry').get(current);
    if (!shape) return;
    try {
      held.get<ModelingService>('modeling').removeElements([shape]);
      reportRef.current(null);
    } catch {
      setNote(wt('mapEditor.cannotRemove'));
    }
  }, [current]);

  const undo = useCallback(() => modelerRef.current?.get<CommandStackService>('commandStack').undo(), []);
  const redo = useCallback(() => modelerRef.current?.get<CommandStackService>('commandStack').redo(), []);
  const zoomBy = useCallback((factor: number) => {
    const canvas = modelerRef.current?.get<CanvasService>('canvas');
    if (canvas) canvas.zoom(Math.min(4, Math.max(0.2, canvas.zoom() * factor)), 'auto');
  }, []);
  /** The whole level on screen, however small — the reader asked for the overview. */
  const fit = useCallback(() => modelerRef.current?.get<CanvasService>('canvas').zoom('fit-viewport', 'auto'), []);

  const pick = useCallback((id: string) => {
    const held = modelerRef.current;
    report(id);
    const shape = held?.get<ElementRegistryService>('elementRegistry').get(id);
    if (shape && held) {
      held.get<SelectionService>('selection').select(shape);
      try {
        held.get<CanvasService>('canvas').scrollToElement(shape);
      } catch {
        /* an element on another level is selected without scrolling */
      }
    }
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

  /* ---------------- tidy, export, import, full screen ---------------- */

  const tidy = useCallback(() => {
    const held = modelerRef.current;
    if (!held) return;
    const outcome = tidyLevel(held, traces);
    if (outcome.ok) {
      setNote(wt('editor.tidyDone'));
      fitWithPadding(held.get<CanvasService>('canvas') as unknown as ViewboxCanvas);
      return;
    }
    setNote(wt(({ nothing: 'editor.tidyNothing', lanes: 'editor.tidyLanes', expanded: 'editor.tidyExpanded', failed: 'editor.tidyFailed' } as const)[outcome.reason]));
  }, [traces]);

  const exportAs = useCallback(async (kind: 'bpmn' | 'svg' | 'png') => {
    const held = modelerRef.current;
    if (!held) return;
    const base = bpmnFileName(fileName.replace(/\.[^.]+$/, '') + '_process').replace(/\.bpmn$/, '');
    try {
      if (kind === 'bpmn') {
        const { xml } = await held.saveXML({ format: true });
        if (!xml) throw new Error('empty');
        await saveAs(new Blob([xml], { type: 'application/xml;charset=utf-8' }), `${base}.bpmn`);
        return;
      }
      const { svg } = await held.saveSVG();
      if (kind === 'svg') {
        await saveAs(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`);
        return;
      }
      await saveAs(await svgToPng(svg, surfaceColour(hostRef.current)), `${base}.png`);
    } catch {
      setNote(wt('editor.exportFailed'));
    }
  }, [fileName]);

  const onFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // The dialog opens over the page; in full screen only the editor is on show.
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    setImporting({ fileName: file.name, outcome: null, saved: null });
    // Bytes before characters: a file larger than any revision is never read into memory as text.
    if (file.size > MAX_IMPORT_CHARS * 4) {
      setImporting({ fileName: file.name, outcome: { ok: false, code: 'too-large', message: wt('editor.importFileTooLarge') }, saved: null });
      return;
    }
    const text = await file.text();
    const { importBpmn } = await import('@/lib/bpmn/import');
    const outcome = await importBpmn(text, { xml: istXml, revision: 1 });
    setImporting({ fileName: file.name, outcome, saved: null });
  }, [istXml]);

  const outsideOf = useCallback((xml: string) => new Set(
    parseBpmn(xml).elements.filter((e) => e.trace === null && !istById.has(e.id)).map((e) => e.id),
  ), [istById]);

  const openImported = useCallback(async () => {
    const outcome = importing?.outcome;
    if (!outcome?.ok) return;
    if (await load(outcome.xml, importing?.saved === null)) {
      setImportedOutside(outsideOf(outcome.xml));
      setStartedFrom(null);
      setNote(wt('editor.importLoaded'));
    }
    setImporting(null);
  }, [importing, load, outsideOf]);

  const saveImported = useCallback(async () => {
    const outcome = importing?.outcome;
    if (!outcome?.ok) return;
    setImportSaving(true);
    try {
      const keep = save ?? NO_PLACE_TO_KEEP_IT;
      const result = await keep({ xml: outcome.xml, baseXml, fileName });
      // Only a kept save closes the choice; a refusal leaves Save there to retry.
      setImporting((was) => (was ? (result.ok ? { ...was, saved: result.message, refused: null } : { ...was, refused: result.message }) : was));
      if (result.ok) {
        await load(outcome.xml, false);
        setImportedOutside(outsideOf(outcome.xml));
      }
    } catch {
      setImporting((was) => (was ? { ...was, refused: wt('mapEditor.saveFailed') } : was));
    } finally {
      setImportSaving(false);
    }
  }, [baseXml, fileName, importing, load, outsideOf, save]);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === rootRef.current && rootRef.current !== null);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    // The canvas measures its box; after the box changed it has to measure again.
    modeler?.get<CanvasService>('canvas').resized();
  }, [fullscreen, modeler]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  }, []);

  /* ---------------- saving ---------------- */

  const [saved, setSaved] = useState<string | null>(null);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const keep = save ?? NO_PLACE_TO_KEEP_IT;
      const held = modelerRef.current;
      const { result, clean } = await saveDraft({
        serialise: async () => (held ? (await held.saveXML({ format: true })).xml : undefined),
        fallbackXml: draftXml,
        changes: () => changeCountRef.current,
        keep: (xml) => keep({ xml, baseXml, fileName }),
      });
      setSaved(result.message);
      if (clean) loadedAsChangeRef.current = false;
      if (clean) setDirty(false);
    } catch {
      setSaved(wt('mapEditor.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [baseXml, draftXml, fileName, save]);

  const activeRow = rows.find((row) => row.id === current) ?? null;

  /* ---------------- the selected element, for the properties ---------------- */

  const selectedShape = modeler && current ? (modeler.get<ElementRegistryService>('elementRegistry').get(current) ?? null) : null;
  const selectedTrace = current ? (traces.get(current) ?? null) : null;
  const origin: ElementOrigin = (() => {
    if (!current) return 'drawn';
    const twin = istById.get(current);
    if (twin) {
      const now = parsedDraft.elements.find((e) => e.id === current);
      return now && now.name !== twin.name ? 'renamed' : 'reconstructed';
    }
    if (importedOutside.has(current)) return 'imported';
    if (startedFrom && startedIds.has(current)) return 'revision';
    return 'drawn';
  })();

  const canvasHeight = fullscreen ? 'h-[calc(100vh-16rem)]' : 'h-[460px] md:h-[600px]';

  return (
    <div
      ref={rootRef}
      data-process-editor=""
      data-editor-fullscreen={fullscreen ? 'true' : 'false'}
      className={fullscreen ? 'flex min-w-0 flex-col gap-2 overflow-auto bg-cc-page p-4' : 'flex min-w-0 flex-col gap-2'}
    >
      {/* ---------------- the toolbar ---------------- */}
      <div
        data-editor-toolbar=""
        role="group"
        aria-label={wt('editor.toolbarLabel')}
        className="flex flex-wrap items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-2"
      >
        <CcIconButton data-editor-undo="" label={wt('editor.undo')} disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} aria-hidden={true} />
        </CcIconButton>
        <CcIconButton data-editor-redo="" label={wt('editor.redo')} disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} aria-hidden={true} />
        </CcIconButton>
        <span aria-hidden={true} className="h-6 border-l border-cc-line" />
        <CcIconButton data-editor-zoom-out="" label={wt('editor.zoomOut')} onClick={() => zoomBy(1 / 1.2)}>
          <ZoomOut size={16} aria-hidden={true} />
        </CcIconButton>
        <span data-editor-zoom="" className="min-w-12 text-center text-[12px] font-semibold text-cc-ink-muted tabular-nums">
          {editorZoomLabel(zoom)}
        </span>
        <CcIconButton data-editor-zoom-in="" label={wt('editor.zoomIn')} onClick={() => zoomBy(1.2)}>
          <ZoomIn size={16} aria-hidden={true} />
        </CcIconButton>
        <CcIconButton data-editor-fit="" label={wt('editor.fit')} onClick={fit}>
          <Scan size={16} aria-hidden={true} />
        </CcIconButton>
        <span aria-hidden={true} className="h-6 border-l border-cc-line" />
        <CcButton data-editor-tidy="" icon={<LayoutGrid size={16} aria-hidden={true} />} onClick={tidy}>
          {wt('editor.tidy')}
        </CcButton>
        <CcButton
          data-editor-compare=""
          aria-pressed={comparing}
          icon={<GitCompare size={16} aria-hidden={true} />}
          onClick={() => setComparing((was) => !was)}
        >
          {wt('editor.compare')}
        </CcButton>
        <CcIconButton
          data-editor-minimap-toggle=""
          label={wt('editor.minimap')}
          aria-pressed={minimap}
          onClick={() => setMinimap((was) => !was)}
        >
          <MapIcon size={16} aria-hidden={true} />
        </CcIconButton>
        <span aria-hidden={true} className="h-6 border-l border-cc-line" />
        <CcButton data-editor-import="" icon={<FileUp size={16} aria-hidden={true} />} onClick={() => fileRef.current?.click()}>
          {wt('editor.import')}
        </CcButton>
        <input
          ref={fileRef}
          type="file"
          accept=".bpmn,.xml,application/xml,text/xml"
          data-editor-import-file=""
          className="sr-only"
          tabIndex={-1}
          aria-hidden={true}
          onChange={(event) => void onFile(event)}
        />
        <span className="text-[12px] font-semibold text-cc-ink-muted">{wt('editor.exportLabel')}</span>
        <CcButton data-editor-export="bpmn" icon={<Download size={16} aria-hidden={true} />} onClick={() => void exportAs('bpmn')}>
          {wt('editor.exportBpmn')}
        </CcButton>
        <CcButton data-editor-export="svg" onClick={() => void exportAs('svg')}>
          {wt('editor.exportSvg')}
        </CcButton>
        <CcButton data-editor-export="png" onClick={() => void exportAs('png')}>
          {wt('editor.exportPng')}
        </CcButton>
        <span className="ml-auto" />
        <CcIconButton
          data-editor-fullscreen-toggle=""
          label={fullscreen ? wt('editor.exitFullscreen') : wt('editor.fullscreen')}
          aria-pressed={fullscreen}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize2 size={16} aria-hidden={true} /> : <Maximize2 size={16} aria-hidden={true} />}
        </CcIconButton>
      </div>

      {newer ? (
        <CcMessageStrip
          state="information"
          actions={
            <CcButton data-editor-open-newer="" onClick={() => void openNewer()}>
              {wt('editor.openRevision')}
            </CcButton>
          }
        >
          <span data-editor-newer={newer.revision}>{editorNewerRevision(newer.line)}</span>
          {dirty ? <span data-editor-newer-replaces=""> {wt('editor.newerReplacesUnsaved')}</span> : null}
        </CcMessageStrip>
      ) : startedFrom ? (
        <p data-editor-started={startedFrom.revision} className="m-0 text-[12px] font-medium text-cc-ink-muted">
          {editorEditingRevision(startedFrom.line)}
        </p>
      ) : (
        <p data-editor-started="1" className="m-0 text-[12px] font-medium text-cc-ink-muted">
          {wt('editor.startedFromIst')}
        </p>
      )}

      {/* ---------------- the palette as buttons ---------------- */}
      <div
        data-editor-palette=""
        role="group"
        aria-label={wt('mapEditor.paletteLabel')}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-cc-card border border-cc-line bg-cc-surface-muted p-2"
      >
        <span className="w-full text-[12px] font-medium text-cc-ink-muted">{wt('editor.addLabel')}</span>
        {PALETTE_GROUPS.map((group) => (
          <div key={group} className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">
              {group}
            </span>
            {EDITOR_PALETTE.filter((entry) => entry.group === group).map((entry) => (
              <CcButton
                key={entry.id}
                data-palette-item={entry.id}
                data-palette-type={entry.type}
                draggable={entry.how === 'append'}
                onDragStart={(event) => dragOut(entry, event)}
                onClick={() => add(entry)}
              >
                {entry.label}
              </CcButton>
            ))}
          </div>
        ))}
      </div>

      {note ? (
        <p data-editor-note className="m-0 text-[12px] font-medium text-cc-ink-muted" role="status">{note}</p>
      ) : null}

      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="relative min-w-0">
          <div
            data-process-editor-canvas=""
            role="group"
            aria-label={mapEditorCanvasLabel(label)}
            className={`cc-editor-canvas w-full overflow-hidden rounded-cc-card border border-cc-line ${canvasHeight}`}
            ref={hostRef}
          />
          {modeler && minimap ? <EditorMinimap modeler={modeler} /> : null}
        </div>

        <div className={`flex min-w-0 flex-col gap-2 ${fullscreen ? 'max-h-[calc(100vh-16rem)]' : 'lg:max-h-[600px]'} lg:overflow-auto`}>
          {diff ? (
            <section
              data-editor-diff=""
              aria-label={wt('editor.compareTitle')}
              className="flex flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3"
            >
              <h4 className="m-0 text-[13px] font-semibold text-cc-ink">{wt('editor.compareTitle')}</h4>
              <p data-editor-diff-summary="" className="m-0 text-[12px] font-medium text-cc-ink-muted">
                {diff.identical ? wt('editor.compareIdentical') : diff.summary}
              </p>
              <div className="flex flex-wrap gap-3 text-[12px] font-medium text-cc-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden={true} className="cc-diff-swatch-added" /> {wt('editor.compareLegendAdded')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden={true} className="cc-diff-swatch-changed" /> {wt('editor.compareLegendChanged')}
                </span>
              </div>
              {(
                [
                  ['added', wt('editor.compareAdded'), diff.added],
                  ['changed', wt('editor.compareChanged'), diff.changed],
                ] as const
              ).map(([key, heading, items]) => (items.length ? (
                <div key={key} data-editor-diff-list={key} className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold text-cc-ink">{heading} ({items.length})</span>
                  {items.slice(0, 12).map((item) => (
                    <CcButton key={item.id} data-editor-diff-item={item.id} onClick={() => pick(item.id)}>
                      {item.kind}: {item.label}
                    </CcButton>
                  ))}
                </div>
              ) : null))}
              {diff.removed.length ? (
                <div data-editor-diff-list="removed" className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold text-cc-ink">
                    {wt('editor.compareRemoved')} ({diff.removed.length})
                  </span>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {diff.removed.slice(0, 12).map((item) => (
                      <li key={item.id} className="text-[12px] font-medium text-cc-ink-muted">
                        {item.kind}: {item.label}{item.anchor ? ` · ${item.anchor}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section
            data-editor-properties-panel=""
            aria-label={wt('editor.properties')}
            className="flex flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3"
          >
            <h4 className="m-0 text-[13px] font-semibold text-cc-ink">{wt('editor.properties')}</h4>
            {modeler ? (
              <EditorProperties
                modeler={modeler}
                element={selectedShape}
                version={tick}
                trace={selectedTrace}
                origin={origin}
                revisionLine={startedFrom ? editorAddedInRevision(startedFrom.line) : null}
                proposal={!!current && !!proposals?.has(current)}
                technical={technical}
                source={source}
                fileName={fileName}
                onDelete={remove}
                onNote={setNote}
              />
            ) : null}
          </section>

          {/* The canvas is an SVG; this is the same draft as a list of controls. */}
          <section className="flex flex-col gap-1 rounded-cc-card border border-cc-line bg-cc-surface p-1">
            <h4 className="m-0 px-2 pt-1 text-[13px] font-semibold text-cc-ink">{wt('editor.elementsHeading')}</h4>
            <div
              data-editor-elements=""
              data-editor-current={activeRow?.id ?? ''}
              role="listbox"
              aria-label={wt('mapEditor.elementsLabel')}
              tabIndex={-1}
              onKeyDown={onListKeyDown}
              className="max-h-[260px] overflow-auto"
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
                  className="block w-full truncate rounded-cc-row px-2 py-0.5 text-left text-[12px] font-medium text-cc-ink-muted hover:text-cc-ink aria-selected:bg-cc-surface-muted aria-selected:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
                >
                  {row.kind}: {row.label}
                  {row.drawn ? <span data-draft-drawn="">{' · '}{wt('mapEditor.drawn')}</span> : null}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <CcDisclosure title={wt('editor.shortcuts')}>
        <p data-editor-shortcuts="" className="m-0 flex items-start gap-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
          <Keyboard size={16} aria-hidden={true} className="mt-0.5 shrink-0" />
          {wt('editor.shortcutsBody')}
        </p>
      </CcDisclosure>

      {/* ---------------- the editing footer, `DESIGN.md` §2.3 item 6 ---------------- */}
      <div
        data-process-editor-footer=""
        className="flex flex-wrap items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-2"
      >
        <CcButton variant="primary" data-editor-save="" busy={saving} onClick={() => void onSave()}>
          {wt('mapEditor.save')}
        </CcButton>
        <CcButton data-editor-discard="" onClick={onDiscard}>
          {wt('mapEditor.discard')}
        </CcButton>
        {dirty ? (
          <span data-editor-dirty className="text-[12px] font-semibold text-cc-ink">{wt('mapEditor.unsaved')}</span>
        ) : null}
        <ProcessHints hints={hints} on={hintsOn} onOnChange={setHintsOn} onJump={pick} />
        <span data-editor-overlaps={overlaps} className="text-[12px] font-medium text-cc-ink-muted">
          {overlaps > 0 ? editorOverlaps(overlaps) : wt('editor.qualityClean')}
        </span>
        {overlaps > 0 ? (
          <CcButton data-editor-tidy-offer="" icon={<LayoutGrid size={16} aria-hidden={true} />} onClick={tidy}>
            {wt('editor.tidy')}
          </CcButton>
        ) : null}
        <span className="ml-auto text-[12px] font-medium text-cc-ink-muted">{wt('editor.everySave')}</span>
      </div>

      {saved ? (
        <p data-editor-saved className="m-0 text-[12px] font-medium text-cc-ink-muted">{saved}</p>
      ) : null}

      {importing ? (
        <EditorImport
          open={true}
          fileName={importing.fileName}
          outcome={importing.outcome}
          saving={importSaving}
          saved={importing.saved}
          refused={importing.refused ?? null}
          replacesUnsaved={dirty}
          onClose={() => setImporting(null)}
          onOpenInEditor={() => void openImported()}
          onSave={() => void saveImported()}
        />
      ) : null}
    </div>
  );
}
