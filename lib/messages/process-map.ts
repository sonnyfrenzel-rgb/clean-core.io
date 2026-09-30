/**
 * Interface text of the process map — components/process-map.
 *
 * One part of the catalogue in `lib/workspace-messages.ts` (DESIGN.md §3,
 * block D, step D.29). Plain strings only; a sentence with a number in it is a
 * function beside the object, so where the number goes is the catalogue's
 * business and not the component's.
 */
export const PROCESS_MAP_MESSAGES = {
  // ProcessMap
  'map.sectionLabel': 'Process reconstructed from code',
  'map.title': 'Process — reconstructed from code',
  'map.viewLabel': 'Process view',
  'map.viewMap': 'Map',
  'map.viewSteps': 'Steps',
  'map.stopEditing': 'Stop editing',
  'map.editModel': 'Edit model',
  'map.businessNames': 'Business names',
  'map.lanesProposed': 'Lanes proposed:',
  'map.stepsLabel': 'Steps.',
  'map.measuredOn': 'Measured and kept with this model on',
  'map.hintBefore':
    'Select a step to open the code it was read from. With the keyboard: Ctrl+K to search any level, the outline number or a name, Enter to open. Inside the',
  'map.hintMap': 'map',
  'map.hintStepList': 'step list',
  'map.hintAfter':
    'and the outline, the arrow keys move, Enter opens, Escape closes, Alt+Up goes one level up.',

  // ProcessBreadcrumb
  'map.levelNav': 'Level',
  'map.levelUp': 'One level up (Alt+Up)',

  // ProcessCodeCard
  'map.sourceFor': 'Source for',
  'map.closeSource': 'Close the source',
  'map.noLineToOpen':
    'The reader drew this element from the shape of the program rather than from one statement, so there is no line to open.',

  // ProcessMapLegend
  'mapLegend.and': 'and',
  'mapLegend.is': 'is',
  'mapLegend.are': 'are',
  'mapLegend.emptyReason':
    'empty: this map is read out of the code. Nobody has confirmed a step of it, and nothing in it has been shown to run.',

  // ProcessMiniMap
  'mapMini.label': 'Mini map — every level, every step',
  'mapMini.in': 'in',

  // ProcessOutline
  'mapOutline.showing': 'Showing',
  'mapOutline.of': 'of',
  'mapOutline.elements': 'elements',
  'mapOutline.on': 'on',
  'mapOutline.levels': 'levels',
  'mapOutline.outlineOf': 'Outline of',
  'mapOutline.doesNotRun': 'does not run',
  'mapOutline.doesNotRunSentence': 'Does not run in this variant.',

  // ProcessSearch
  'mapSearch.label': 'Find a step in any level (Control K)',
  'mapSearch.placeholder': 'Find a step — 16.4, a name, L472  (Ctrl+K)',
  'mapSearch.of': 'of',
  'mapSearch.results': 'Search results',

  // ProcessStepList
  'mapSteps.technicalName': 'Technical name:',
  'mapSteps.otherwise': 'otherwise',

  // ProcessFilters
  'mapFilters.path': 'Path',
  'mapFilters.mainPath': 'Main path',
  'mapFilters.pathsToHere': 'Show paths to here',
  'mapFilters.overlays': 'Overlays',
  'mapFilters.runVariants': 'Run variants',
  'mapFilters.on': 'on',
  'mapFilters.off': 'off',
  'mapFilters.variantNote':
    'A step behind a switch is dimmed together with the level it opens. What comes after it is not: the code skips the step and goes on, and the file carries that way past the switch as a flow of its own.',

  // ProcessHints
  'mapHints.hints': 'Hints',
  'mapHints.show': 'Show check hints',
  'mapHints.offSentence': 'Check hints are off. They never stopped anything while they were on.',
  'mapHints.popoverLabel': 'Check hints',
  'mapHints.none': 'No check hints on this model.',
  'mapHints.off': 'Check hints are off.',

  // BpmnEditor — the palette
  'mapEditor.paletteLabel': 'BPMN elements',
  'mapEditor.groupStructure': 'Structure',
  'mapEditor.groupEvents': 'Events',
  'mapEditor.groupGateways': 'Gateways',
  'mapEditor.groupTasks': 'Tasks',
  'mapEditor.groupArtefacts': 'Artefacts',
  'mapEditor.pool': 'Pool',
  'mapEditor.lane': 'Lane',
  'mapEditor.subProcess': 'Sub-process',
  'mapEditor.startEvent': 'Start event',
  'mapEditor.intermediateEvent': 'Intermediate event',
  'mapEditor.endEvent': 'End event',
  'mapEditor.exclusiveGateway': 'Exclusive gateway',
  'mapEditor.parallelGateway': 'Parallel gateway',
  'mapEditor.task': 'Task',
  'mapEditor.userTask': 'User task',
  'mapEditor.serviceTask': 'Service task',
  'mapEditor.sendTask': 'Send task',
  'mapEditor.receiveTask': 'Receive task',
  'mapEditor.manualTask': 'Manual task',
  'mapEditor.businessRuleTask': 'Business rule task',
  'mapEditor.scriptTask': 'Script task',
  'mapEditor.dataObject': 'Data object',
  'mapEditor.messageFlow': 'Message flow',
  'mapEditor.annotation': 'Annotation',

  // BpmnEditor — the words of the draft list
  'mapEditor.kindStart': 'Start',
  'mapEditor.kindEnd': 'End',
  'mapEditor.kindDecision': 'Decision',
  'mapEditor.kindParallelSplit': 'Parallel split',
  'mapEditor.kindStep': 'Step',
  'mapEditor.kindServiceStep': 'Service step',
  'mapEditor.kindMessageStep': 'Message step',
  'mapEditor.kindMessageWait': 'Message wait',
  'mapEditor.kindUserStep': 'User step',
  'mapEditor.kindManualStep': 'Manual step',
  'mapEditor.kindBusinessRule': 'Business rule',
  'mapEditor.kindCall': 'Call',
  'mapEditor.kindSubProcess': 'Sub-process',
  'mapEditor.kindErrorBoundary': 'Error boundary',
  'mapEditor.kindWait': 'Wait',
  'mapEditor.kindEvent': 'Event',
  'mapEditor.drawn': 'drawn',

  // BpmnEditor — controls, notes and the footer
  'mapEditor.name': 'Name',
  'mapEditor.pickElement': 'Pick an element',
  'mapEditor.rename': 'Rename',
  'mapEditor.delete': 'Delete',
  'mapEditor.undo': 'Undo',
  'mapEditor.redo': 'Redo',
  'mapEditor.editing': 'Editing.',
  'mapEditor.elementsLabel': 'Elements of the draft',
  'mapEditor.save': 'Save',
  'mapEditor.discard': 'Discard',
  'mapEditor.unsaved': 'Unsaved changes',
  'mapEditor.noPlaceToKeep':
    'This editor was opened without somewhere to keep a revision, so nothing was saved. Your draft is kept in this session and the reconstruction is untouched.',
  'mapEditor.saveFailed': 'The model could not be kept. Your draft is still on the canvas.',
  'mapEditor.laneNeedsPool': 'A lane lives in a pool. Add a pool first, then a lane.',
  'mapEditor.messageFlowNeedsStep': 'A message flow starts at a step. Pick one in the list first.',
  'mapEditor.messageFlowNeedsPools': 'A message flow crosses a pool boundary. Add a second pool first.',
  'mapEditor.messageFlowRefusedBefore': 'BPMN does not allow a message flow from',
  'mapEditor.messageFlowRefusedAfter': 'to that pool.',
  'mapEditor.cannotGoThere': 'cannot go there. Pick another element in the list and try again.',
  'mapEditor.cannotRemove': 'bpmn-js will not remove that element on its own.',
} as const;

type ProcessMapKey = keyof typeof PROCESS_MAP_MESSAGES;
const m = (key: ProcessMapKey): string => PROCESS_MAP_MESSAGES[key];

/** "Measured and kept with this model on 2026-09-30." */
export function mapMeasuredOn(date: string): string {
  return `${m('map.measuredOn')} ${date}.`;
}

/** "Lanes proposed: Sales · Credit." — the statement of the proposal follows it. */
export function mapLanesProposed(names: readonly string[]): string {
  return `${m('map.lanesProposed')} ${names.join(' · ')}.`;
}

/** The accessible name of the step list: "Steps. <overview>". */
export function mapStepsLabel(overview: string): string {
  return `${m('map.stepsLabel')} ${overview}`;
}

/** The keyboard hint beside the map, naming the view that is on show. */
export function mapKeyboardHint(inMap: boolean): string {
  return `${m('map.hintBefore')} ${m(inMap ? 'map.hintMap' : 'map.hintStepList')} ${m('map.hintAfter')}`;
}

/** The accessible name of the code card. */
export function mapSourceForLabel(label: string): string {
  return `${m('map.sourceFor')} ${label}`;
}

/** "Confirmed and Proven are empty: …" — the sentence under the legend. */
export function mapLegendEmpty(empty: readonly string[]): string {
  const verb = empty.length === 1 ? m('mapLegend.is') : m('mapLegend.are');
  return `${empty.join(` ${m('mapLegend.and')} `)} ${verb} ${m('mapLegend.emptyReason')}`;
}

/** The spoken name of one mini-map cell: "16.4 in Decide and process actions". */
export function mapMiniCellLabel(outline: string, level: string): string {
  return `${outline} ${m('mapMini.in')} ${level}`;
}

/** The count over the outline — narrowed by an overlay, or the whole process. */
export function mapOutlineCount(visible: number | null, total: number, levels: number): string {
  return visible !== null
    ? `${m('mapOutline.showing')} ${visible} ${m('mapOutline.of')} ${total} ${m('mapOutline.elements')}`
    : `${total} ${m('mapOutline.elements')} ${m('mapOutline.on')} ${levels} ${m('mapOutline.levels')}`;
}

/** The accessible name of the outline tree. */
export function mapOutlineLabel(processName: string): string {
  return `${m('mapOutline.outlineOf')} ${processName}`;
}

/** The spoken name of one outline row, with its level's problem and whether it runs. */
export function mapOutlineRowLabel(
  outline: string,
  accessibleName: string,
  problem: string | null,
  excluded: boolean,
): string {
  return `${outline}. ${accessibleName}${problem !== null ? ` ${problem}` : ''}${
    excluded ? ` ${m('mapOutline.doesNotRunSentence')}` : ''
  }`;
}

/** "3 of 7" beside the search field; "0 of 0" when nothing matches. */
export function mapSearchCount(position: number, total: number): string {
  return total ? `${position} ${m('mapSearch.of')} ${total}` : `0 ${m('mapSearch.of')} 0`;
}

/** The accessible name of the modeller's canvas. */
export function mapEditorCanvasLabel(label: string): string {
  return `${label} ${m('mapEditor.editing')}`;
}

/** A message flow BPMN refuses, named by the element it would start at. */
export function mapEditorMessageFlowRefused(from: string): string {
  return `${m('mapEditor.messageFlowRefusedBefore')} “${from}” ${m('mapEditor.messageFlowRefusedAfter')}`;
}

/** A palette entry bpmn-js would not place where the reader is. */
export function mapEditorCannotGoThere(label: string): string {
  return `“${label}” ${m('mapEditor.cannotGoThere')}`;
}
