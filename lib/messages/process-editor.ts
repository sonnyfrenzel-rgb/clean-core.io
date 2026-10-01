/**
 * Interface text of the BPMN editor — components/process-map/BpmnEditor and the
 * panels beside it (properties, import, compare, minimap).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings only;
 * a sentence with a number in it is a function below the object.
 */
export const PROCESS_EDITOR_MESSAGES = {
  // Toolbar
  'editor.toolbarLabel': 'Editor tools',
  'editor.undo': 'Undo',
  'editor.redo': 'Redo',
  'editor.zoomIn': 'Zoom in',
  'editor.zoomOut': 'Zoom out',
  'editor.fit': 'Fit to screen',
  'editor.tidy': 'Tidy layout',
  'editor.compare': 'Compare with the as-is process',
  'editor.minimap': 'Overview map',
  'editor.import': 'Import BPMN',
  'editor.exportBpmn': 'BPMN 2.0',
  'editor.exportSvg': 'SVG',
  'editor.exportPng': 'PNG',
  'editor.exportLabel': 'Export',
  'editor.fullscreen': 'Full screen',
  'editor.exitFullscreen': 'Leave full screen',
  'editor.shortcuts': 'Keyboard and mouse',
  'editor.shortcutsBody':
    'Drag from the tool column on the canvas or from the element buttons above it. Select an element for its quick menu: append the next step, change its type with the wrench, connect, delete. Ctrl+Z undo · Ctrl+Y redo · Ctrl+C / Ctrl+V copy and paste · Delete removes · E renames · H hand · L lasso · S make space · C connect · Ctrl+A select all · Ctrl+F find · arrow keys move the selection · Ctrl+scroll zooms. The element list on the right reaches every element by keyboard.',

  // The add strip
  'editor.addLabel': 'Add next to the selection, or drag onto the canvas',

  // Properties
  'editor.properties': 'Properties',
  'editor.nothingSelected': 'Select an element on the canvas or in the list to see and change its properties.',
  'editor.planeSelected': 'This is the level itself. Select an element on it to change it.',
  'editor.name': 'Name',
  'editor.nameHelp': 'The name a business reader sees. The technical name stays in the file.',
  'editor.apply': 'Apply',
  'editor.technicalName': 'Technical name',
  'editor.technicalNameHelp': 'The token in the code this element was read from. Read-only.',
  'editor.type': 'Element type',
  'editor.typeCallActivity': 'Call activity',
  'editor.typeInclusive': 'Inclusive gateway',
  'editor.typeEventBased': 'Event-based gateway',
  'editor.typeCatch': 'Intermediate catch event',
  'editor.typeBoundary': 'Boundary event',
  'editor.typeFlow': 'Sequence flow',
  'editor.typeOther': 'BPMN element',
  'editor.eventKind': 'Event definition',
  'editor.eventNone': 'None',
  'editor.eventMessage': 'Message',
  'editor.eventTimer': 'Timer',
  'editor.eventError': 'Error',
  'editor.eventSignal': 'Signal',
  'editor.eventConditional': 'Conditional',
  'editor.eventEscalation': 'Escalation',
  'editor.eventTerminate': 'Terminate',
  'editor.condition': 'Condition',
  'editor.conditionHelp': 'The condition under which this branch is taken, in words or as an expression.',
  'editor.flowLabel': 'Label on the line',
  'editor.documentation': 'Documentation',
  'editor.documentationHelp': 'Kept in the BPMN file and shown in SAP Signavio and other tools.',
  'editor.delete': 'Delete element',
  'editor.provenance': 'Where this comes from',
  'editor.reconstructed': 'Reconstructed from the code.',
  'editor.renamedHere': 'Renamed in this draft. The line anchor stays.',
  'editor.drawnHere': 'Drawn in this draft — not in the code, no line anchor.',
  'editor.importedOutside': 'Added outside Clean-Core.io (imported file) — no line anchor.',
  'editor.modelProposal': 'The business name is a model proposal, unchecked.',
  'editor.anchor': 'Line anchor',
  'editor.noAnchor': 'No line anchor',
  'editor.typeChangedNote': 'The element type was changed; the line anchor and its provenance are kept.',

  // Element list
  'editor.elementsHeading': 'Elements',
  'editor.unnamed': 'Unnamed',

  // Compare
  'editor.compareTitle': 'Compared with the reconstructed as-is process',
  'editor.compareLegendAdded': 'added',
  'editor.compareLegendChanged': 'changed',
  'editor.compareRemoved': 'Removed from the as-is process',
  'editor.compareAdded': 'Added',
  'editor.compareChanged': 'Changed',
  'editor.compareIdentical': 'Nothing differs from the reconstructed as-is process.',

  // Revisions
  'editor.openRevision': 'Open this revision',
  'editor.startedFromIst': 'Started from the reconstructed as-is process (revision 1). It stays unchanged whatever you save.',

  // Tidy and quality
  'editor.tidyDone': 'Laid out again with the product’s layout. Undo puts every element back where it was.',
  'editor.tidyNothing': 'There is nothing on this level to lay out.',
  'editor.tidyLanes': 'Tidy layout leaves a level with drawn lanes as it is, so no element changes its lane.',
  'editor.tidyExpanded': 'Tidy layout leaves a level with an expanded sub-process as it is. Collapse it or open it as its own level.',
  'editor.tidyFailed': 'The layout could not be applied to this level. Nothing was moved.',
  'editor.qualityClean': 'No overlaps on this level.',
  'editor.everySave': 'Every save is a revision.',

  // Import
  'editor.importTitle': 'Import a BPMN 2.0 file',
  'editor.importLead':
    'The file becomes a proposal for the next revision. The reconstructed as-is process (revision 1) is never replaced.',
  'editor.importReading': 'Reading the file…',
  'editor.importRefusedHeadline': 'This file was not imported',
  'editor.importOpen': 'Open in the editor',
  'editor.importSave': 'Save as revision',
  'editor.importCancel': 'Cancel',
  'editor.importClose': 'Close',
  'editor.importAnchorsKept': 'keep their line anchor from the reconstruction',
  'editor.importOutside': 'added outside Clean-Core.io, no line anchor',
  'editor.importByName': 'recognised by name because the tool rewrote their ids',
  'editor.importClaims': 'Line anchors or statuses written in the file itself were not taken over.',
  'editor.importCleaned': 'Some names contained invisible control characters; they were removed.',
  'editor.importFileTooLarge': 'The file is larger than a process revision can hold. Export a smaller part of the model.',
  'editor.importReplacesUnsaved':
    'Opening or saving this file replaces your unsaved changes in the editor. Save them first if you want to keep them.',
  'editor.importRefusedSave': 'Not saved',
  'editor.newerReplacesUnsaved': 'Opening it replaces your unsaved changes.',
  'editor.importLoaded': 'The imported model is on the canvas. Nothing is saved until you press Save.',

  // Export
  'editor.exportFailed': 'The export could not be written. The draft is unchanged.',

  // Phone
  'editor.phoneTitle': 'Editing needs a larger screen',
  'editor.phoneBody':
    'Modelling BPMN by touch on a phone is not practical, so the editor opens on a tablet or computer. Here you can read the map and the steps; every saved revision is the same on every screen.',
} as const;

/** "Revision 3 · saved by Sonny Frenzel is newer than the reconstruction." */
export function editorNewerRevision(line: string): string {
  return `${line} is the newest model of this process. The editor opened the reconstruction; open the revision to continue from it.`;
}

/** "Editing revision 3 · saved by Sonny Frenzel." */
export function editorEditingRevision(line: string): string {
  return `Editing ${line.charAt(0).toLowerCase()}${line.slice(1)}. Saving writes the next revision; this one stays as it is.`;
}

/** "3 overlaps on this level." */
export function editorOverlaps(count: number): string {
  return `${count} ${count === 1 ? 'overlap' : 'overlaps'} on this level — lines through shapes or shapes on shapes.`;
}

/** "12 elements read" and the like, for the import summary. */
export function editorImportCount(count: number, what: string): string {
  return `${count} ${what}`;
}

/** "84 elements read from Order.bpmn." */
export function editorImportRead(count: number, fileName: string): string {
  return `${count} ${count === 1 ? 'element' : 'elements'} read from ${fileName}.`;
}

/** "Added in revision 3 · saved by …" */
export function editorAddedInRevision(line: string): string {
  return `Added in ${line.charAt(0).toLowerCase()}${line.slice(1)} — no line anchor.`;
}

/** The anchor as a reader says it. */
export function editorAnchorLabel(lineStart: number, lineEnd: number, fileName: string): string {
  return lineStart === lineEnd ? `${fileName}, line ${lineStart}` : `${fileName}, lines ${lineStart} to ${lineEnd}`;
}

/** "and 4 more" under a shortened list. */
export function editorMore(count: number): string {
  return `and ${count} more`;
}

export function editorZoomLabel(percent: number): string {
  return `${percent} %`;
}
