'use client';

import React, { useState } from 'react';
import CcCard from '@/components/cc/Card';
import CcCheckbox from '@/components/cc/Checkbox';
import { CcRequiredNote } from '@/components/cc/Field';
import CcRadioGroup from '@/components/cc/RadioGroup';
import CcSelect from '@/components/cc/Select';
import CcSwitch from '@/components/cc/Switch';
import CcTextarea from '@/components/cc/Textarea';

/**
 * The form controls of block D, step D.5b — every state of every control,
 * because a state that is not on the gallery is a state no guard measures
 * (see the header of `page.tsx`).
 *
 * A file of its own rather than more lines in `page.tsx`, so the steps that
 * add to the gallery in parallel each add one import and one section there.
 * `tests/cc-form-controls.spec.ts` drives what is on this page.
 */
type Scope = 'program' | 'package' | 'transport';
type Decision = 'keep' | 'replace' | 'retire';
type SystemChoice = 'prd' | 'prd-qas' | 'all';

export default function FormControlsGallery() {
  const [includeTest, setIncludeTest] = useState(false);
  const [yearEnd, setYearEnd] = useState(false);
  const [anchors, setAnchors] = useState(true);
  const [mail, setMail] = useState(false);
  const [scope, setScope] = useState<Scope | null>('program');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [systems, setSystems] = useState<SystemChoice | ''>('');
  const [period, setPeriod] = useState<'13' | '24'>('13');
  const [note, setNote] = useState('Exported by the basis team after the quarter close.');
  const [reason, setReason] = useState('');

  return (
    <div data-cc-demo="form-controls" className="grid gap-3 md:grid-cols-2">
      <CcCard title="Checkbox and switch">
        <div className="flex flex-col gap-2">
          <CcCheckbox
            label="Include test systems"
            checked={includeTest}
            onChange={setIncludeTest}
            help="QAS and DEV calls are counted separately from production."
          />
          <CcCheckbox
            label="The export covers a year-end close"
            required
            checked={yearEnd}
            onChange={setYearEnd}
            valueState={yearEnd ? undefined : 'error'}
            message={
              yearEnd
                ? undefined
                : 'Tick this once the file includes a year-end close. Without one, yearly jobs look unused.'
            }
          />
          <CcCheckbox label="Signed runs only" checked disabled onChange={() => undefined} help="Always on for an audit pack." />
          <CcCheckbox label="Remember this filter" checked={false} onChange={() => undefined} density="cozy" />
          <CcSwitch
            label="Show line anchors"
            checked={anchors}
            onChange={setAnchors}
            help="Takes effect immediately, on every view."
          />
          <CcSwitch label="E-mail me when a reader comments" checked={mail} onChange={setMail} />
          <CcSwitch
            label="Share with invited readers"
            checked={false}
            disabled
            onChange={() => undefined}
            valueState="information"
            message="Available once the project has a signed run."
          />
        </div>
      </CcCard>

      <CcCard title="Radio group" actions={<CcRequiredNote />}>
        <div className="flex flex-col gap-4">
          <CcRadioGroup
            legend="Scope of the analysis"
            required
            value={scope}
            onChange={setScope}
            options={[
              { value: 'program', label: 'One program', help: 'The source you pasted, with its includes.' },
              { value: 'package', label: 'A package', help: 'Every object in the package, read one by one.' },
              { value: 'transport', label: 'A transport request', disabled: true, help: 'Needs a connected system.' },
            ]}
          />
          <CcRadioGroup
            legend="Decision"
            required
            orientation="horizontal"
            value={decision}
            onChange={setDecision}
            valueState={decision ? undefined : 'error'}
            message={decision ? undefined : 'Choose one option. The decision is recorded with your account.'}
            options={[
              { value: 'keep', label: 'Keep' },
              { value: 'replace', label: 'Replace' },
              { value: 'retire', label: 'Retire' },
            ]}
          />
        </div>
      </CcCard>

      <CcCard title="Select and textarea">
        <div className="grid gap-3">
          <CcSelect
            label="Systems"
            required
            placeholder="Choose the systems"
            value={systems}
            onChange={setSystems}
            valueState={systems === 'all' ? 'warning' : undefined}
            message={systems === 'all' ? 'The file also holds DEV — check whether it belongs in.' : undefined}
            options={[
              { value: 'prd', label: 'PRD' },
              { value: 'prd-qas', label: 'PRD, QAS' },
              { value: 'all', label: 'All systems' },
            ]}
          />
          <CcSelect
            label="Usage period"
            density="cozy"
            value={period}
            onChange={setPeriod}
            valueState="success"
            message="Checked: the file spans 13 months."
            options={[
              { value: '13', label: '13 months' },
              { value: '24', label: '24 months' },
            ]}
          />
          <CcSelect
            label="Connected system"
            disabled
            value=""
            placeholder="No system connected"
            onChange={() => undefined}
            options={[]}
          />
        </div>
      </CcCard>

      <CcCard title="Text">
        <div className="grid gap-3">
          <CcTextarea
            label="Note for the project"
            help="Shown with the import. It does not change any number."
            value={note}
            onChange={setNote}
          />
          <CcTextarea
            label="Reason for the decision"
            required
            value={reason}
            onChange={setReason}
            valueState={reason.trim() ? undefined : 'error'}
            message={reason.trim() ? undefined : 'Write one sentence on why. It is signed with the decision.'}
          />
          <CcTextarea
            label="Recorded assumption"
            readOnly
            rows={2}
            value="Year-end jobs run in period 12 only."
            onChange={() => undefined}
          />
        </div>
      </CcCard>
    </div>
  );
}
