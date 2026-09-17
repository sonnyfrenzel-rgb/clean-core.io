'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, Map as MapIcon, Pencil } from 'lucide-react';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { useProcessRules } from '@/hooks/useProcessRules';
import { UNANCHORED } from '@/lib/process-naming';
import { elementsOfPlane, type ProcessMapElement, type ProcessMapModel } from '@/lib/process-map';
import {
  buildNavigation,
  buildOverlays,
  levelOf,
  mainPath,
  miniMap,
  pathsToHere,
  planePath,
  planeProblems,
  readRunSwitches,
  runVariant,
  searchProcess,
  type PlaneProblems,
  type ProcessSearchHit,
} from '@/lib/process-navigation';
import BpmnCanvas from './BpmnCanvas';
import BpmnEditor, { type SaveProcessModel } from './BpmnEditor';
import ProcessBreadcrumb from './ProcessBreadcrumb';
import ProcessCodeCard from './ProcessCodeCard';
import ProcessFilters, { type PathHighlight } from './ProcessFilters';
import ProcessMapLegend from './ProcessMapLegend';
import ProcessMiniMap from './ProcessMiniMap';
import ProcessOutline from './ProcessOutline';
import ProcessSearch from './ProcessSearch';
import ProcessStepList from './ProcessStepList';

/**
 * The process map in the workspace — roadmap 2.5, navigable at size since 2.9.
 *
 * What it shows is the BPMN 2.6 writes out of the signed source, with the
 * business names 2.4 proposed beside the technical ones. It calls no model and
 * stores no change: there is nothing here to edit, and the editor is roadmap
 * 3.1.
 *
 * Three things 2.5 is measured on:
 *
 *   1. **The legend is Reconstructed · Confirmed · Proven**, counted out of the
 *      file's own `cc:trace/@status`, and an element without a line anchor is
 *      visibly `Unanchored` rather than quietly tidy.
 *   2. **Selecting an element opens its code card with its lines marked** — the
 *      real lines of the source the run signed.
 *   3. **It works without a mouse, as an equal.** "Map | Steps" are two
 *      renderings of one model: same elements, same order, same names, same
 *      anchors. Each is **one** tab stop with a roving `tabindex`, and the key
 *      handling below is shared, so the two navigate identically. Enter opens
 *      the code card, Escape closes it and puts the focus back on the node.
 *      Every node is a control with a spoken name — never a bare id.
 *
 * ## Roadmap 2.9 — the same map, at the size of a real program
 *
 * The 1.000-line example is 65 flow nodes on 8 levels. A canvas of 65 shapes is
 * a picture of a haystack and a flat list of 65 rows is a haystack; neither is
 * navigation. So this view grew the parts `DESIGN.md` §5.9 asks for — a path
 * line, an outline tree with the phases collapsed and a problem line on each, a
 * mini map, path highlighting, run variants, overlays as filters, search across
 * every level, and an address in the URL — and it is measured on one number:
 *
 * > **every step reachable in at most three actions, by keyboard as by mouse.**
 *
 * `tests/process-navigation.spec.ts` counts those actions for all 65 steps of
 * that example, in the browser, one at a time. An *action* there is one decision
 * a reader commits: a click on a named control, a key press, or one typed
 * address. Scrolling, hovering and reading are not actions. The two paths it
 * measures are the two the view offers:
 *
 *   - **mouse** — click a row of the outline (1), or its phase's twisty and then
 *     the row (2);
 *   - **keyboard** — `Ctrl+K` (1), the outline number (2), `Enter` (3).
 *
 * ## The API roadmap 3.1 inherits
 *
 * `selected` / `onSelectedChange` and `plane` / `onPlaneChange` are controlled
 * when given and local otherwise. 2.9 puts both in the URL
 * (`#map=<plane>&node=<element>`); opening a level is `plane = <sub-process
 * element id>`, and `null` is the top level. 3.1 swaps `BpmnCanvas` for a
 * modeller behind the same two, so a selection survives the switch into editing.
 * Nothing in that contract changed in 2.9.
 *
 * ## Roadmap 3.1 — and what editing may not do
 *
 * *Edit model* puts `BpmnEditor` where `BpmnCanvas` was, behind exactly those
 * two props: the element a reader had open is the element the modeller opens
 * with. The props of this component did not change to make that possible, which
 * is the point of the paragraph above.
 *
 * The draft lives **here**, in `draft`, and never in `model`. Phase 3's
 * acceptance says the Ist revision is unchanged after editing, so the one way to
 * be sure of it is that nothing writes to the model at all: the editor is handed
 * a string and hands a string back, *Discard* forgets the string, and the map
 * beside it goes on drawing `model.xml`. Whether a draft becomes a revision is
 * roadmap 3.2 and is not decided in this file.
 *
 * ## Roadmap 3.2 — `save`, and why it is only handed through
 *
 * This component takes a model and a source. It has no `projectId`, it makes no
 * request, and it is not going to get one: the moment a view knows how to reach
 * a store, every caller has to think about which store. So `save` is a function
 * the caller supplies and this file passes to `BpmnEditor` unread. The page that
 * mounts the map knows the project and builds it (`documentation/page.tsx`).
 *
 * Optional and additive: every other prop is what it was, and a caller that
 * omits `save` gets the editor's own footer sentence. 3.1 and 3.6 inherit the
 * interface unchanged, which was the whole point of writing it down in 2.9.
 */
export type ProcessMapView = 'map' | 'steps';

export interface ProcessMapProps {
  /** `buildProcessMapModel(...)` — memoised by the caller; it is an effect input. */
  model: ProcessMapModel;
  /** The source the active run signed. The code card is built from this and nothing else. */
  source: string;
  /** The selected element's id. Controlled when given. */
  selected?: string | null;
  onSelectedChange?: (elementId: string | null) => void;
  /** The open level: null for the top plane, otherwise a sub-process element id. Controlled when given. */
  plane?: string | null;
  onPlaneChange?: (plane: string | null) => void;
  view?: ProcessMapView;
  onViewChange?: (view: ProcessMapView) => void;
  /** Starting view when uncontrolled. `steps` on a phone — `DESIGN.md` §5.7. */
  defaultView?: ProcessMapView;
  /** When the quote was last measured and stored for this source. */
  measuredAt?: string | null;
  /**
   * Roadmap 3.2 — keep the draft as a revision. Handed straight to the editor.
   *
   * Omitted here means omitted there, and the editor's footer says saving is not
   * wired up rather than pretending to have saved.
   */
  save?: SaveProcessModel;
}

export default function ProcessMap({
  model,
  source,
  selected: selectedProp,
  onSelectedChange,
  plane: planeProp,
  onPlaneChange,
  view: viewProp,
  onViewChange,
  defaultView = 'map',
  measuredAt = null,
  save,
}: ProcessMapProps) {
  const [viewLocal, setViewLocal] = useState<ProcessMapView>(defaultView);
  const [selectedLocal, setSelectedLocal] = useState<string | null>(null);
  const [planeLocal, setPlaneLocal] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [treeFocusToken, setTreeFocusToken] = useState(0);
  /** Which branch of a decision the arrow keys last stepped to. */
  const branch = useRef<{ id: string; index: number }>({ id: '', index: -1 });

  const view = viewProp ?? viewLocal;
  const selected = selectedProp !== undefined ? selectedProp : selectedLocal;
  const plane = planeProp !== undefined ? planeProp : planeLocal;

  /* ---------------- the outline, and everything derived from it ---------------- */

  const nav = useMemo(() => buildNavigation(model), [model]);
  const nodeIds = useMemo(
    () => model.elements.map((element) => element.nodeId).filter((id): id is string => !!id),
    [model],
  );
  const rules = useProcessRules(source, nodeIds);

  const problems = useMemo(() => {
    const out = new Map<string | null, PlaneProblems>();
    for (const id of nav.planes.keys()) out.set(id, planeProblems(model, nav, id, rules.byNode));
    return out;
  }, [model, nav, rules.byNode]);

  const overlays = useMemo(
    () => buildOverlays(model, nav, rules.byNode),
    [model, nav, rules.byNode],
  );
  const switches = useMemo(() => readRunSwitches(source, model), [source, model]);
  const rows = useMemo(() => miniMap(model, nav), [model, nav]);

  /* ---------------- reader state that is not an address ---------------- */

  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<PathHighlight>('none');
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set());
  const [variantOpen, setVariantOpen] = useState(false);
  const [positions, setPositions] = useState<Map<string, boolean>>(new Map());
  const [found, setFound] = useState<Set<string>>(new Set());

  /**
   * Editing — roadmap 3.1.
   *
   * The draft is a **ref**, and that is the whole design. A state would re-render
   * this component on every stroke of the modeller, and the modeller is an
   * effect input: the canvas would be torn down and rebuilt while somebody was
   * drawing on it. A ref changes nothing on screen and survives the switch to
   * *Steps* and back, which is all the draft has to do until 3.2 gives it
   * somewhere to go.
   *
   * `session` is what *Discard* bumps: the editor is keyed on it, so throwing a
   * draft away is a fresh modeller over the reconstruction rather than a
   * modeller talked into forgetting. Neither of the two ever touches `model` —
   * the Ist revision after editing is the Ist revision before it.
   */
  const [editing, setEditing] = useState(false);
  const [session, setSession] = useState(0);

  /**
   * A draft belongs to the source it was drawn on, and carries it.
   *
   * `openWith` prefers the draft over `model.xml`, which is right while the
   * reader works on one process and wrong the moment this instance is handed
   * another. React keeps a component at the same position in the tree alive
   * across a route change, so moving from one project to the next would leave a
   * bare `string` ref full of the last one's drawing. On its own that was a
   * display fault. Since the save path arrived it is worse: *Save* would send the
   * first project's XML under the second project's id and write it there as an
   * edited revision.
   *
   * The first attempt cleared the ref during render. That reads like React's
   * "adjusting state when a prop changes", but it is not: mutating a ref while
   * rendering is exactly what `react-hooks/refs` forbids, and rightly — a render
   * can be thrown away and run again, and the lost draft does not come back.
   *
   * So the draft carries its own identity instead. `openWith` hands over a
   * drawing only when it was drawn on the source now on screen; anything else is
   * simply not this process's draft, and no clearing step has to remember to
   * run. The editor is keyed on the source as well as on `session`, so a new
   * source builds a new modeller rather than leaving one alive with the old
   * drawing inside it. `model` is untouched either way — the Ist revision after
   * editing is the Ist revision before it.
   */
  const draftRef = useRef<{ source: string; xml: string } | null>(null);

  /**
   * What the tree has open: what the reader opened, plus the way down to the
   * level on show.
   *
   * Derived rather than kept, and that is what makes a shared link work. The
   * address arrives as props — `#map=…&node=…` opens the level on the canvas
   * and opens the code card — and an outline that only followed its own clicks
   * stayed standing on the overview with the row the link names nowhere on
   * screen. Here the level on show is *by definition* reachable in the tree,
   * whoever opened it: the reader, a crumb, the mini map, a search hit or a
   * link somebody sent.
   */
  const expanded = useMemo(() => {
    const onTheWay = planePath(nav, plane);
    if (onTheWay.length === 0) return opened;
    return new Set([...opened, ...onTheWay]);
  }, [nav, opened, plane]);

  /** Every switch stands where the code declares it until a reader moves it. */
  const chosen = useMemo(() => {
    const out = new Map<string, boolean>();
    for (const entry of switches) out.set(entry.name, positions.get(entry.name) ?? entry.defaultOn ?? true);
    return out;
  }, [positions, switches]);

  const variant = useMemo(
    () => runVariant(model, nav, switches, variantOpen ? chosen : new Map()),
    [chosen, model, nav, switches, variantOpen],
  );

  const visible = useMemo(() => {
    if (activeOverlays.size === 0) return null;
    const out = new Set<string>();
    for (const overlay of overlays) {
      if (!activeOverlays.has(overlay.key)) continue;
      for (const id of overlay.ids) out.add(id);
    }
    return out;
  }, [activeOverlays, overlays]);

  const marks = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const overlay of overlays) {
      if (!activeOverlays.has(overlay.key)) continue;
      for (const [id, text] of overlay.marks) {
        const held = out.get(id);
        if (held) held.push(text);
        else out.set(id, [text]);
      }
    }
    return out;
  }, [activeOverlays, overlays]);

  const lit = useMemo(() => {
    if (highlight === 'main') return new Set(mainPath(model, nav, plane));
    if (highlight === 'to-selected' && selected) return pathsToHere(model, nav, plane, selected);
    return null;
  }, [highlight, model, nav, plane, selected]);

  /* ---------------- setters ---------------- */

  const setView = useCallback((next: ProcessMapView) => {
    setViewLocal(next);
    onViewChange?.(next);
  }, [onViewChange]);

  const setSelected = useCallback((next: string | null) => {
    setSelectedLocal(next);
    onSelectedChange?.(next);
  }, [onSelectedChange]);

  const setPlane = useCallback((next: string | null) => {
    setPlaneLocal(next);
    onPlaneChange?.(next);
  }, [onPlaneChange]);

  const planeElements = useMemo(() => elementsOfPlane(model, plane), [model, plane]);
  const byId = useMemo(() => new Map(model.elements.map((e) => [e.id, e])), [model]);
  const canvasNodes = useMemo(
    () => new Map(model.elements.map((e) => [e.id, {
      accessibleName: e.accessibleName,
      unanchored: e.anchor === null,
      unanchoredLabel: UNANCHORED,
    }])),
    [model],
  );

  const selectedElement: ProcessMapElement | null = selected ? (byId.get(selected) ?? null) : null;

  /** Element id → what a reader calls it. The editor names its hints with these. */
  const labels = useMemo(
    () => new Map(model.elements.map((element) => [element.id, element.label])),
    [model],
  );

  /**
   * What the modeller opens with: this source's draft if there is one, the
   * reconstruction otherwise. A drawing made on another source is not a draft
   * here — it is somebody else's process, and it is dropped by not matching.
   */
  const openWith = useCallback(
    () => (draftRef.current?.source === source ? draftRef.current.xml : model.xml),
    [model, source],
  );
  const keepDraft = useCallback((xml: string) => {
    draftRef.current = { source, xml };
  }, [source]);
  const discardDraft = useCallback(() => {
    draftRef.current = null;
    setSession((token) => token + 1);
  }, []);

  /**
   * Open a step: its level, its selection and the focus, in that order.
   *
   * The one place that knows what "reach a step" means, so the outline, the
   * mini map, a crumb and a search hit all do the same thing — and so the
   * action counts the acceptance measures are the same number whichever of them
   * the reader used.
   */
  const reach = useCallback((id: string, moveFocus: boolean) => {
    const entry = nav.entries.get(id);
    if (!entry) return;
    setPlane(levelOf(nav, id));
    setActive(id);
    setSelected(id);
    if (moveFocus) setTreeFocusToken((token) => token + 1);
  }, [nav, setPlane, setSelected]);

  const onJump = useCallback((hit: ProcessSearchHit) => {
    setFound(new Set(searchProcess(model, nav, hit.outline).map((entry) => entry.id)));
    reach(hit.id, true);
  }, [model, nav, reach]);

  /** `Alt+↑` — one level up, from anywhere in the view (`DESIGN.md` §5.9 item 12). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.key !== 'ArrowUp') return;
      const entry = plane ? nav.entries.get(plane) : null;
      if (!entry) return;
      event.preventDefault();
      setPlane(entry.plane);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nav, plane, setPlane]);

  /* ---------------- the map and the step list, unchanged from 2.5 ---------------- */

  /** Move the roving focus, and keep an open code card on the node the reader is on. */
  const focusTo = useCallback((id: string | undefined) => {
    if (!id) return;
    setActive(id);
    setFocusToken((token) => token + 1);
    // `DESIGN.md` §5.7: focus is hover. While the source column is open it
    // follows the node, so arrowing along the flow reads the code along with it.
    if (selected !== null) setSelected(id);
  }, [selected, setSelected]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const order = planeElements;
    if (!order.length) return;

    if (event.key === 'Escape') {
      if (selected === null) return;
      event.preventDefault();
      setSelected(null);
      // Back to the node it was opened from — not to the top of the page.
      setFocusToken((token) => token + 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      if (!active) return;
      event.preventDefault();
      // Enter on a collapsed sub-process opens it as its own level — §5.9 item
      // 12 — and selects it, which is what the map's own double-click does.
      const entry = nav.entries.get(active);
      if (entry?.opensPlane) setPlane(entry.opensPlane);
      setSelected(active);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusTo(order[0]?.id);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusTo(order[order.length - 1]?.id);
      return;
    }

    const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
    if (!vertical && !horizontal) return;
    event.preventDefault();

    const index = order.findIndex((element) => element.id === active);
    const current = index >= 0 ? order[index] : null;

    // At a decision the vertical keys choose the branch — `DESIGN.md` §5.7.
    if (vertical && current && current.branches.length > 1) {
      const targets = current.branches.map((b) => b.to).filter((id) => order.some((e) => e.id === id));
      if (targets.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const at = branch.current.id === current.id ? branch.current.index : -1;
        const next = at < 0
          ? (step > 0 ? 0 : targets.length - 1)
          : (at + step + targets.length) % targets.length;
        branch.current = { id: current.id, index: next };
        focusTo(targets[next]);
        return;
      }
    }

    branch.current = { id: '', index: -1 };
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const from = index >= 0 ? index : step > 0 ? -1 : order.length;
    const next = Math.min(order.length - 1, Math.max(0, from + step));
    focusTo(order[next]?.id);
  }, [active, focusTo, nav, planeElements, selected, setPlane, setSelected]);

  const activate = useCallback((id: string) => {
    setActive(id);
    setSelected(id);
  }, [setSelected]);

  const crumbs = useMemo(() => {
    const path = planePath(nav, plane);
    return [
      { plane: null as string | null, label: model.processName, outline: '' },
      ...path.map((id) => ({
        plane: id as string | null,
        label: byId.get(id)?.label ?? id,
        outline: nav.entries.get(id)?.outline ?? '',
      })),
    ];
  }, [byId, model.processName, nav, plane]);

  const openProblem = problems.get(plane);

  return (
    <section data-process-map="" aria-label="Process reconstructed from code" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 data-process-map-title className="text-[15px] font-bold text-cc-ink">
            Process — reconstructed from code
          </h3>
          <p data-process-map-overview className="mt-0.5 text-[13px] font-medium text-cc-ink-muted">
            {model.overview}
          </p>
          <p data-process-map-traceability className="mt-0.5 text-[13px] font-medium text-cc-ink-muted">
            {model.traceability.sentence}
            {measuredAt ? ` Measured and kept with this model on ${measuredAt.slice(0, 10)}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CcSegmentedControl<ProcessMapView>
            label="Process view"
            value={view}
            onChange={setView}
            segments={[
              { value: 'map', label: 'Map', icon: <MapIcon size={14} aria-hidden={true} /> },
              { value: 'steps', label: 'Steps', icon: <List size={14} aria-hidden={true} /> },
            ]}
          />
          {/* Roadmap 3.1. Editing is a mode, not a view: *Map* and *Steps* are
              two renderings of the same thing, and a modeller is a third state
              of the first one. The reading view stays reachable at all times. */}
          <button
            type="button"
            data-process-edit-toggle=""
            aria-pressed={editing}
            onClick={() => {
              setView('map');
              setEditing((was) => !was);
            }}
            className="inline-flex items-center gap-1 rounded-cc-row border border-cc-line bg-cc-surface px-2 py-1 text-[12px] font-semibold text-cc-ink-muted hover:text-cc-ink aria-pressed:border-cc-ink aria-pressed:bg-cc-surface-muted aria-pressed:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
          >
            <Pencil size={14} aria-hidden={true} />
            {editing ? 'Stop editing' : 'Edit model'}
          </button>
        </div>
      </div>

      <ProcessMapLegend
        entries={model.legend}
        unanchored={model.traceability.unanchored}
        unanchoredLabel={UNANCHORED}
      />

      {model.naming.notice ? (
        <CcMessageStrip state="neutral" headline="Business names">
          {model.naming.notice}
        </CcMessageStrip>
      ) : null}

      {model.lanes.length > 0 ? (
        <p data-process-map-lanes className="text-[12px] font-medium text-cc-ink-muted">
          Lanes proposed: {model.lanes.map((lane) => lane.name).join(' · ')}. {model.lanes[0].statement}
        </p>
      ) : null}

      <ProcessBreadcrumb crumbs={crumbs} onOpen={setPlane} />

      {openProblem ? (
        <p
          data-process-map-level
          data-determined={openProblem.determined ? 'true' : 'false'}
          className="text-[12px] font-medium text-cc-ink-muted"
        >
          {openProblem.counters}. {openProblem.text}
        </p>
      ) : null}

      <ProcessFilters
        highlight={highlight}
        onHighlightChange={setHighlight}
        canShowPathsToHere={!!selected}
        overlays={overlays}
        activeOverlays={activeOverlays}
        onOverlaysChange={setActiveOverlays}
        switches={switches}
        positions={chosen}
        onPositionsChange={setPositions}
        variantOpen={variantOpen}
        onVariantOpenChange={setVariantOpen}
        variant={variant}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <ProcessSearch model={model} nav={nav} onJump={onJump} />
          <ProcessMiniMap
            rows={rows}
            plane={plane}
            selected={selected}
            found={found}
            excluded={variant.excluded}
            onSelect={(id) => reach(id, false)}
          />
          <ProcessOutline
            model={model}
            nav={nav}
            problems={problems}
            expanded={expanded}
            onExpandedChange={setOpened}
            active={active}
            onActiveChange={setActive}
            selected={selected}
            onActivate={(id) => reach(id, false)}
            visible={visible}
            excluded={variant.excluded}
            lit={lit}
            marks={marks}
            focusToken={treeFocusToken}
          />
        </div>

        <div className="min-w-0">
          {view === 'map' && editing ? (
            <BpmnEditor
              // `session` is what *Discard* bumps; `source` is what a different
              // process changes. Either one has to build a new modeller: keeping
              // the old instance would keep the old drawing inside it, whatever
              // `openWith` now returns.
              key={`${session}|${source}`}
              openWith={openWith}
              baseXml={model.xml}
              fileName={model.fileName}
              label={`${model.processName}. ${model.overview}`}
              labels={labels}
              proposedLanes={model.lanes}
              selected={selected}
              onSelectedChange={setSelected}
              onDraftChange={keepDraft}
              onDiscard={discardDraft}
              save={save}
            />
          ) : view === 'map' ? (
            <BpmnCanvas
              xml={model.xml}
              label={`${model.processName}. ${model.overview}`}
              nodes={canvasNodes}
              plane={plane}
              onPlaneChange={setPlane}
              active={active}
              onActivate={activate}
              onActiveChange={setActive}
              focusToken={focusToken}
              onKeyDown={handleKeyDown}
              lit={lit}
              excluded={variant.excluded}
            />
          ) : (
            <ProcessStepList
              elements={planeElements}
              label={`Steps. ${model.overview}`}
              active={active}
              selected={selected}
              onActivate={activate}
              onActiveChange={setActive}
              focusToken={focusToken}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>

        {selectedElement ? (
          <ProcessCodeCard
            element={selectedElement}
            source={source}
            fileName={model.fileName}
            onClose={() => {
              setSelected(null);
              setFocusToken((token) => token + 1);
            }}
          />
        ) : (
          <p
            data-process-map-hint
            className="rounded-cc-card border border-cc-line bg-cc-surface-muted p-3 text-[13px] font-medium text-cc-ink-muted"
          >
            Select a step to open the code it was read from. With the keyboard: Ctrl+K to search any level, the
            outline number or a name, Enter to open. Inside the {view === 'map' ? 'map' : 'step list'} and the
            outline, the arrow keys move, Enter opens, Escape closes, Alt+Up goes one level up.
          </p>
        )}
      </div>
    </section>
  );
}
