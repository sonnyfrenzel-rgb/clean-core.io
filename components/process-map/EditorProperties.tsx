'use client';

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcField from '@/components/cc/Field';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSelect from '@/components/cc/Select';
import CcTextarea from '@/components/cc/Textarea';
import { codeCardLines, type ReconstructionTrace } from '@/lib/process-map';
import { editorAnchorLabel, wt, type WorkspaceMessageKey } from '@/lib/workspace-messages';
import type { BpmnReplaceService, ModdleService, ModelingService, ModelerLike, Shape } from './editor-bpmn';

/**
 * The properties panel of the editor — what Camunda Modeler and Signavio show
 * beside the canvas, built from the product's own components rather than from
 * `bpmn-js-properties-panel` (a second UI toolkit with its own CSS, colours and
 * type scale, ~200 kB more, and no idea of a line anchor).
 *
 * The plain name is what is edited: it is what a business reader sees and what
 * the exported file carries as `name`. The technical name — the token in the
 * code — is shown read-only underneath and stays in the trace. The last
 * section is ours and cannot be edited: where the element comes from, its line
 * anchor and the lines themselves.
 */

/** How the element came to be in this draft — decided by the editor, shown here. */
export type ElementOrigin = 'reconstructed' | 'renamed' | 'drawn' | 'imported' | 'revision';

export interface EditorPropertiesProps {
  modeler: ModelerLike;
  element: Shape | null;
  /** Bumped on every change to the draft, so the fields re-read the element. */
  version: number;
  trace: ReconstructionTrace | null;
  origin: ElementOrigin;
  /** "Revision 3 · saved by …" when `origin` is `revision`. */
  revisionLine: string | null;
  /** The business name of 2.4 is a model proposal for this element. */
  proposal: boolean;
  /** The Technical names switch: the token first. */
  technical: boolean;
  source: string;
  fileName: string;
  onDelete: () => void;
  onNote: (note: string) => void;
}

type Option = { value: string; label: string; target: { type: string; eventDefinitionType?: string; isExpanded?: boolean } };

const TASK_TYPES: Array<[string, WorkspaceMessageKey]> = [
  ['bpmn:Task', 'mapEditor.task'],
  ['bpmn:UserTask', 'mapEditor.userTask'],
  ['bpmn:ServiceTask', 'mapEditor.serviceTask'],
  ['bpmn:SendTask', 'mapEditor.sendTask'],
  ['bpmn:ReceiveTask', 'mapEditor.receiveTask'],
  ['bpmn:ManualTask', 'mapEditor.manualTask'],
  ['bpmn:BusinessRuleTask', 'mapEditor.businessRuleTask'],
  ['bpmn:ScriptTask', 'mapEditor.scriptTask'],
  ['bpmn:CallActivity', 'editor.typeCallActivity'],
];
const GATEWAY_TYPES: Array<[string, WorkspaceMessageKey]> = [
  ['bpmn:ExclusiveGateway', 'mapEditor.exclusiveGateway'],
  ['bpmn:ParallelGateway', 'mapEditor.parallelGateway'],
  ['bpmn:InclusiveGateway', 'editor.typeInclusive'],
  ['bpmn:EventBasedGateway', 'editor.typeEventBased'],
];
const EVENT_TYPES: Array<[string, WorkspaceMessageKey]> = [
  ['bpmn:StartEvent', 'mapEditor.startEvent'],
  ['bpmn:IntermediateThrowEvent', 'mapEditor.intermediateEvent'],
  ['bpmn:IntermediateCatchEvent', 'editor.typeCatch'],
  ['bpmn:EndEvent', 'mapEditor.endEvent'],
];

const DEFINITIONS: Record<string, Array<[string, WorkspaceMessageKey]>> = {
  'bpmn:StartEvent': [['', 'editor.eventNone'], ['bpmn:MessageEventDefinition', 'editor.eventMessage'], ['bpmn:TimerEventDefinition', 'editor.eventTimer'], ['bpmn:SignalEventDefinition', 'editor.eventSignal'], ['bpmn:ConditionalEventDefinition', 'editor.eventConditional']],
  'bpmn:EndEvent': [['', 'editor.eventNone'], ['bpmn:MessageEventDefinition', 'editor.eventMessage'], ['bpmn:ErrorEventDefinition', 'editor.eventError'], ['bpmn:SignalEventDefinition', 'editor.eventSignal'], ['bpmn:EscalationEventDefinition', 'editor.eventEscalation'], ['bpmn:TerminateEventDefinition', 'editor.eventTerminate']],
  'bpmn:IntermediateThrowEvent': [['', 'editor.eventNone'], ['bpmn:MessageEventDefinition', 'editor.eventMessage'], ['bpmn:SignalEventDefinition', 'editor.eventSignal'], ['bpmn:EscalationEventDefinition', 'editor.eventEscalation']],
  'bpmn:IntermediateCatchEvent': [['bpmn:MessageEventDefinition', 'editor.eventMessage'], ['bpmn:TimerEventDefinition', 'editor.eventTimer'], ['bpmn:SignalEventDefinition', 'editor.eventSignal'], ['bpmn:ConditionalEventDefinition', 'editor.eventConditional']],
  'bpmn:BoundaryEvent': [['bpmn:MessageEventDefinition', 'editor.eventMessage'], ['bpmn:TimerEventDefinition', 'editor.eventTimer'], ['bpmn:ErrorEventDefinition', 'editor.eventError'], ['bpmn:SignalEventDefinition', 'editor.eventSignal'], ['bpmn:EscalationEventDefinition', 'editor.eventEscalation'], ['bpmn:ConditionalEventDefinition', 'editor.eventConditional']],
};

function typeOptions(type: string): Option[] {
  const family = TASK_TYPES.some(([t]) => t === type)
    ? TASK_TYPES
    : GATEWAY_TYPES.some(([t]) => t === type)
      ? GATEWAY_TYPES
      : EVENT_TYPES.some(([t]) => t === type)
        ? EVENT_TYPES
        : null;
  if (!family) return [];
  return family.map(([value, key]) => ({ value, label: wt(key), target: { type: value } }));
}

/** What the header calls an element whose type has no option list. */
function typeWord(type: string): string {
  const all = [...TASK_TYPES, ...GATEWAY_TYPES, ...EVENT_TYPES];
  const hit = all.find(([t]) => t === type);
  if (hit) return wt(hit[1]);
  if (type === 'bpmn:SubProcess') return wt('mapEditor.subProcess');
  if (type === 'bpmn:BoundaryEvent') return wt('editor.typeBoundary');
  if (type === 'bpmn:SequenceFlow') return wt('editor.typeFlow');
  if (type === 'bpmn:MessageFlow') return wt('mapEditor.messageFlow');
  if (type === 'bpmn:Participant') return wt('mapEditor.pool');
  if (type === 'bpmn:Lane') return wt('mapEditor.lane');
  if (type === 'bpmn:DataObjectReference') return wt('mapEditor.dataObject');
  if (type === 'bpmn:TextAnnotation') return wt('mapEditor.annotation');
  return wt('editor.typeOther');
}

/**
 * Change an element's type — through bpmn-js's own replace, the command the
 * wrench in the context pad runs. Replace builds a new element; the id and the
 * `cc:trace` are put back on it, so a step that was read from line 42 is still
 * read from line 42 after it became a user task.
 */
export function replaceKeepingTrace(
  modeler: ModelerLike,
  element: Shape,
  target: { type: string; eventDefinitionType?: string; isExpanded?: boolean },
): Shape | null {
  const id = element.id;
  const extensions = element.businessObject?.extensionElements;
  const replaced = modeler.get<BpmnReplaceService>('bpmnReplace').replaceElement(element, target);
  if (!replaced) return null;
  const modeling = modeler.get<ModelingService>('modeling');
  if (replaced.id !== id) modeling.updateProperties(replaced, { id });
  const now = replaced.businessObject?.extensionElements as { values?: Array<{ $type?: string }> } | undefined;
  const hadTrace = (extensions as { values?: Array<{ $type?: string }> } | undefined)?.values?.some((v) => v.$type === 'cc:trace');
  if (hadTrace && !now?.values?.some((v) => v.$type === 'cc:trace')) {
    modeling.updateProperties(replaced, { extensionElements: extensions });
  }
  return replaced;
}

export default function EditorProperties({
  modeler,
  element,
  version,
  trace,
  origin,
  revisionLine,
  proposal,
  technical,
  source,
  fileName,
  onDelete,
  onNote,
}: EditorPropertiesProps) {
  const bo = element?.businessObject;
  const type = element?.type ?? '';
  const isFlow = type === 'bpmn:SequenceFlow';
  const isAnnotation = type === 'bpmn:TextAnnotation';
  const currentName = (isAnnotation ? bo?.text : bo?.name) ?? '';
  const currentDoc = bo?.documentation?.[0]?.text ?? '';
  const currentCondition = bo?.conditionExpression?.body ?? '';
  const currentDefinition = bo?.eventDefinitions?.[0]?.$type ?? '';

  const [name, setName] = useState(currentName);
  const [doc, setDoc] = useState(currentDoc);
  const [condition, setCondition] = useState(currentCondition);

  // The fields follow the element and every change made elsewhere (the canvas,
  // undo): adjusted while rendering, React's pattern for state derived from props.
  const seenKey = `${element?.id ?? ''}|${version}|${currentName}|${currentDoc}|${currentCondition}`;
  const [seen, setSeen] = useState(seenKey);
  if (seen !== seenKey) {
    setSeen(seenKey);
    setName(currentName);
    setDoc(currentDoc);
    setCondition(currentCondition);
  }

  if (!element || !bo) {
    return (
      <p data-editor-properties="empty" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
        {wt('editor.nothingSelected')}
      </p>
    );
  }

  const modeling = modeler.get<ModelingService>('modeling');
  const moddle = modeler.get<ModdleService>('moddle');

  const applyName = () => {
    if (name === currentName) return;
    if (isAnnotation) modeling.updateProperties(element, { text: name });
    else modeling.updateLabel(element, name);
  };
  const applyDoc = () => {
    if (doc === currentDoc) return;
    modeling.updateProperties(element, {
      documentation: doc.trim() ? [moddle.create('bpmn:Documentation', { text: doc })] : [],
    });
  };
  const applyCondition = () => {
    if (condition === currentCondition) return;
    modeling.updateProperties(element, {
      conditionExpression: condition.trim() ? moddle.create('bpmn:FormalExpression', { body: condition }) : undefined,
    });
  };

  const options = typeOptions(type);
  const definitions = DEFINITIONS[type] ?? null;
  const sourceType = element.source?.type ?? '';
  const conditional = isFlow && /ExclusiveGateway|InclusiveGateway|ComplexGateway/.test(sourceType);
  const technicalName = trace?.technicalName ?? null;
  const anchor = trace && trace.lineStart !== null && trace.lineEnd !== null
    ? { lineStart: trace.lineStart, lineEnd: trace.lineEnd }
    : null;

  const nameField = (
    <CcField label={wt('editor.name')} help={wt('editor.nameHelp')} data-editor-name-field="">
      {(control) => (
        <div className="flex min-w-0 items-center gap-2">
          <input
            id={control.id}
            aria-describedby={control.describedBy}
            data-editor-name=""
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={applyName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyName();
              }
            }}
            className={control.className}
          />
          <CcButton data-editor-rename="" onClick={applyName}>
            {wt('editor.apply')}
          </CcButton>
        </div>
      )}
    </CcField>
  );

  const technicalField = technicalName ? (
    <div data-editor-technical-name="" className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-cc-ink">{wt('editor.technicalName')}</span>
      <span className="font-cc-mono text-[12px] font-medium break-all text-cc-ink">{technicalName}</span>
      <span className="text-[12px] font-medium text-cc-ink-muted">{wt('editor.technicalNameHelp')}</span>
    </div>
  ) : null;

  const originText = {
    reconstructed: wt('editor.reconstructed'),
    renamed: wt('editor.renamedHere'),
    drawn: wt('editor.drawnHere'),
    imported: wt('editor.importedOutside'),
    revision: revisionLine ?? wt('editor.drawnHere'),
  }[origin];

  return (
    <div data-editor-properties={element.id} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[12px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">{typeWord(type)}</span>
        <span data-editor-properties-title="" className="text-[14px] font-bold break-words text-cc-ink">
          {(technical && technicalName) || currentName || element.id}
        </span>
      </div>

      {technical ? technicalField : null}
      {nameField}
      {technical ? null : technicalField}

      {options.length > 1 ? (
        <CcSelect
          label={wt('editor.type')}
          value={type}
          options={options.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(value) => {
            const picked = options.find((o) => o.value === value);
            if (!picked || value === type) return;
            try {
              replaceKeepingTrace(modeler, element, picked.target);
              if (anchor) onNote(wt('editor.typeChangedNote'));
            } catch {
              /* BPMN refuses the change; the canvas keeps the element as it was */
            }
          }}
        />
      ) : null}

      {definitions ? (
        <CcSelect
          label={wt('editor.eventKind')}
          value={currentDefinition}
          options={definitions.map(([value, key]) => ({ value, label: wt(key) }))}
          onChange={(value) => {
            if (value === currentDefinition) return;
            try {
              replaceKeepingTrace(modeler, element, { type, ...(value ? { eventDefinitionType: value } : {}) });
            } catch {
              /* refused by BPMN: unchanged */
            }
          }}
        />
      ) : null}

      {conditional ? (
        <CcTextarea
          label={wt('editor.condition')}
          help={wt('editor.conditionHelp')}
          value={condition}
          rows={2}
          onChange={setCondition}
          onBlur={applyCondition}
        />
      ) : null}

      {!isAnnotation ? (
        <CcTextarea
          label={wt('editor.documentation')}
          help={wt('editor.documentationHelp')}
          value={doc}
          rows={3}
          maxLength={10000}
          onChange={setDoc}
          onBlur={applyDoc}
        />
      ) : null}

      <section data-editor-provenance={origin} aria-label={wt('editor.provenance')} className="flex flex-col gap-2 border-t border-cc-line pt-3">
        <h4 className="m-0 text-[13px] font-semibold text-cc-ink">{wt('editor.provenance')}</h4>
        <div className="flex flex-wrap items-center gap-2">
          {origin === 'reconstructed' || origin === 'renamed' ? <CcProvenanceChip value={trace?.status ?? 'reconstructed'} /> : null}
          {origin === 'imported' ? <CcProvenanceChip value="imported" /> : null}
          {proposal ? <CcProvenanceChip value="proposed" /> : null}
          {anchor ? (
            <CcAnchor label={editorAnchorLabel(anchor.lineStart, anchor.lineEnd, fileName)}>
              {anchor.lineStart === anchor.lineEnd ? `L${anchor.lineStart}` : `L${anchor.lineStart}–${anchor.lineEnd}`}
            </CcAnchor>
          ) : (
            <CcAnchor tone="unlinked">{wt('editor.noAnchor')}</CcAnchor>
          )}
        </div>
        <p data-editor-origin="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
          {originText}
          {proposal ? ` ${wt('editor.modelProposal')}` : ''}
        </p>
        {anchor && source ? (
          <CcCodeSurface
            lines={codeCardLines(source, anchor, 2)}
            label={editorAnchorLabel(anchor.lineStart, anchor.lineEnd, fileName)}
          />
        ) : null}
      </section>

      <div>
        <CcButton data-editor-delete="" tone="danger" icon={<Trash2 size={16} aria-hidden={true} />} onClick={onDelete}>
          {wt('editor.delete')}
        </CcButton>
      </div>
    </div>
  );
}
