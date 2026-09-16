'use client';

import React from 'react';

/**
 * The Object Identifier — `DESIGN.md` §2.4, first line.
 *
 * A title at weight 600 with the identifier in monospace underneath. It is the
 * first cell of every table in this product: a finding, a rule, a project. Two
 * lines rather than one because the two halves answer different questions — what
 * a person called it, and what the system calls it — and a reader scanning a
 * column of thirty rows needs the first to be the one that stands out.
 *
 * The identifier is mono because §3 says identifiers are: line anchors, finding
 * ids, rule ids, ISO dates. A proportional font makes `P-0359` and `P-O359` look
 * the same, and in a list report that is the difference between two projects.
 *
 * `meta` is for what sits beside the title without being part of it — the Demo
 * tag of mockup s7. It takes an element rather than a string so this component
 * never has to know what vocabulary is being shown.
 */
export interface CcObjectIdentifierProps {
  title: React.ReactNode;
  /** The system's name for it, in mono. Omitted when there is none. */
  identifier?: React.ReactNode;
  /** A tag or chip beside the title. */
  meta?: React.ReactNode;
}

export default function CcObjectIdentifier({ title, identifier, meta }: CcObjectIdentifierProps) {
  return (
    <span data-cc-object-identifier="" className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span data-cc-object-identifier-title="" className="text-[13px] font-semibold text-cc-ink">
          {title}
        </span>
        {meta}
      </span>
      {identifier ? (
        <span
          data-cc-object-identifier-id=""
          className="font-cc-mono text-[11px] font-medium text-cc-ink-muted"
        >
          {identifier}
        </span>
      ) : null}
    </span>
  );
}
