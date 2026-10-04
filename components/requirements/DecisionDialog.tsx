'use client';

import React, { useState } from 'react';
import CcDialog from '@/components/cc/Dialog';
import CcButton from '@/components/cc/Button';
import CcRadioGroup from '@/components/cc/RadioGroup';
import CcTextarea from '@/components/cc/Textarea';
import CcSelect from '@/components/cc/Select';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { RichTextView } from '@/components/requirements/RichText';
import {
  DECISION_ORIGIN_LABEL,
  DECISION_OWNERS,
  DECISION_OWNER_LABEL,
  linesText,
  type DecisionAnswerKind,
  type DecisionOwner,
  type SpecDecision,
} from '@/lib/requirements-spec';

/**
 * One open question of the specification, answered — owner 04.10.2026: "the
 * corresponding user dialogs for decisions".
 *
 * A side panel beside the document (`CcDialog placement="side"`), so the
 * requirements it shapes stay in view on a wide screen. The answers on offer:
 *
 *   - the suggested answers, which are the product's starting points and say
 *     so — never read from the code;
 *   - a value of one's own;
 *   - *decide later*, which records the wish and keeps the decision open.
 *
 * Who decides is a label (Business · IT · Decision maker), not a role system.
 * A model's proposal stands apart with its chip; "Use the proposal" only puts
 * it into the value field — recording it stays the reader's act.
 */
export default function DecisionDialog({
  decision,
  open,
  readOnly,
  onClose,
  onDecide,
}: {
  decision: SpecDecision | null;
  open: boolean;
  readOnly: boolean;
  onClose: () => void;
  onDecide: (answer: { kind: DecisionAnswerKind; value: string }, owner: DecisionOwner) => void;
}) {
  if (!decision) return null;
  // A fresh form for every decision opened: its answer is read once, here.
  return <DecisionForm key={`${decision.id}-${open ? 'open' : 'closed'}`} decision={decision} open={open} readOnly={readOnly} onClose={onClose} onDecide={onDecide} />;
}

type Choice = `option-${number}` | 'value' | 'later';

function initialChoice(decision: SpecDecision): { choice: Choice | null; value: string } {
  const a = decision.answer;
  if (!a) return { choice: null, value: '' };
  if (a.kind === 'later') return { choice: 'later', value: '' };
  const at = decision.options.indexOf(a.value);
  if (a.kind === 'option' && at >= 0) return { choice: `option-${at}`, value: '' };
  return { choice: 'value', value: a.value };
}

function DecisionForm({
  decision,
  open,
  readOnly,
  onClose,
  onDecide,
}: {
  decision: SpecDecision;
  open: boolean;
  readOnly: boolean;
  onClose: () => void;
  onDecide: (answer: { kind: DecisionAnswerKind; value: string }, owner: DecisionOwner) => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(() => initialChoice(decision).choice);
  const [value, setValue] = useState(() => initialChoice(decision).value);
  const [owner, setOwner] = useState<DecisionOwner>(decision.owner);
  const [error, setError] = useState<string | null>(null);


  const options = [
    ...decision.options.map((o, i) => ({ value: `option-${i}` as Choice, label: o, help: i === 0 ? 'Suggested — not read from the code.' : undefined })),
    { value: 'value' as Choice, label: 'Another answer', help: 'Write the answer in the field below.' },
    { value: 'later' as Choice, label: 'Decide later', help: 'The decision stays open and is counted as open.' },
  ];

  const submit = () => {
    if (!choice) {
      setError('Choose an answer, or "Decide later".');
      return;
    }
    if (choice === 'later') {
      onDecide({ kind: 'later', value: '' }, owner);
      return;
    }
    if (choice === 'value') {
      if (!value.trim()) {
        setError('Write the answer, or choose another option.');
        return;
      }
      onDecide({ kind: 'value', value: value.trim() }, owner);
      return;
    }
    const index = Number(choice.slice('option-'.length));
    onDecide({ kind: 'option', value: decision.options[index] }, owner);
  };

  return (
    <CcDialog
      open={open}
      onClose={onClose}
      placement="side"
      size="wide"
      title={`Decision ${decision.id}`}
      lead={decision.question}
      data-spec-decision-dialog={decision.id}
      onSubmit={readOnly ? undefined : submit}
      actions={
        readOnly ? (
          <CcButton variant="ghost" onClick={onClose}>
            Close
          </CcButton>
        ) : (
          <>
            <CcButton variant="ghost" onClick={onClose}>
              Cancel
            </CcButton>
            <CcButton variant="primary" type="submit" data-spec-decision-record="">
              Record the decision
            </CcButton>
          </>
        )
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <dl className="m-0 grid min-w-0 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)]">
          <dt className="font-semibold text-cc-ink">Why it is asked</dt>
          <dd className="m-0 text-cc-ink [overflow-wrap:anywhere]">
            {DECISION_ORIGIN_LABEL[decision.origin]}. {decision.context}
          </dd>
          <dt className="font-semibold text-cc-ink">In the code</dt>
          <dd className="m-0 font-cc-mono text-cc-ink">{linesText(decision.lines) || 'The code is silent on it.'}</dd>
          <dt className="font-semibold text-cc-ink">Shapes</dt>
          <dd className="m-0 font-cc-mono text-cc-ink">{decision.affects.join(', ') || 'No requirement yet — the answer is recorded in section 7.'}</dd>
        </dl>

        {decision.proposal.trim() ? (
          <div data-spec-decision-proposal="" className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-dashed border-cc-field-border p-3">
            <span className="flex flex-wrap items-center gap-2">
              <CcProvenanceChip value="proposed" />
              <span className="text-[12px] font-semibold text-cc-ink-muted">Written by the design model; not checked against the code.</span>
            </span>
            <RichTextView text={decision.proposal} className="text-[13px]" />
            {readOnly ? null : (
              <span>
                <CcButton
                  variant="ghost"
                  data-spec-decision-use-proposal=""
                  onClick={() => {
                    setChoice('value');
                    setValue(decision.proposal);
                  }}
                >
                  Use the proposal as the answer
                </CcButton>
              </span>
            )}
          </div>
        ) : null}

        {readOnly ? (
          <CcMessageStrip state="information" headline={decision.answer && decision.answer.kind !== 'later' ? 'Answered' : 'Open'}>
            {decision.answer && decision.answer.kind !== 'later'
              ? `${decision.answer.value}${decision.answer.by ? ` — ${decision.answer.by}${decision.answer.at ? `, ${decision.answer.at.slice(0, 10)}` : ''}` : ''}`
              : 'The owner of this project records the answer. You read it.'}
          </CcMessageStrip>
        ) : (
          <>
            {error ? (
              <CcMessageStrip state="error" announce>
                {error}
              </CcMessageStrip>
            ) : null}
            <CcRadioGroup<Choice>
              legend="Answer"
              options={options}
              value={choice}
              onChange={(v) => {
                setChoice(v);
                setError(null);
              }}
              density="cozy"
            />
            {choice === 'value' ? (
              <CcTextarea label="Your answer" value={value} onChange={setValue} rows={3} maxLength={1000} help="A value an implementer can test against, e.g. “95 % of cases within 2 s”." />
            ) : null}
            <CcSelect<DecisionOwner>
              label="Who decides"
              value={owner}
              onChange={setOwner}
              options={DECISION_OWNERS.map((o) => ({ value: o, label: DECISION_OWNER_LABEL[o] }))}
              help="A label for the document, not a permission."
            />
          </>
        )}
      </div>
    </CcDialog>
  );
}
