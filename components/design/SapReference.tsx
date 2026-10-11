'use client';

import { CcTag } from '@/components/cc/Tag';
import {
  FIT_LABEL,
  SAP_REFERENCE_ARCHITECTURES,
  raUrl,
  type ReferenceBinding,
} from '@/lib/sap-reference-architectures';

/**
 * The SAP reference pattern of a target or a building block (roadmap 3.0.9,
 * ADR-089), read from `lib/sap-reference-architectures.ts` and nothing else.
 *
 * The badge says the fit; the reason stands beside it, never in a tooltip —
 * a partial fit read without its reason reads as a fit. Only current RAs are
 * named (ADR-089); a link, its title and SAP's date of last update;
 * no SAP logo, and no word that would make the link read as SAP's approval.
 */
const LINK = 'font-semibold text-cc-ink underline underline-offset-2';

export function SapReferenceList({ bindings, compact = false }: { bindings: readonly ReferenceBinding[]; compact?: boolean }) {
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {bindings.map((b, i) => {
        const ra = b.ra ? SAP_REFERENCE_ARCHITECTURES[b.ra] : null;
        return (
          <li key={`${b.ra ?? 'none'}-${i}`} data-sap-reference={b.ra ?? 'none'} data-sap-reference-fit={b.fit} className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CcTag>{FIT_LABEL[b.fit]}</CcTag>
              {ra ? (
                <>
                  <a href={raUrl(ra.id)} target="_blank" rel="noopener noreferrer" className={`${LINK} cc-text-cell [overflow-wrap:anywhere]`}>
                    {ra.id} {ra.title}
                  </a>
                  <span className="cc-text-meta text-cc-ink-muted">updated by SAP {ra.lastUpdate}</span>
                </>
              ) : null}
            </div>
            {/* The reason beside the badge — for a partial fit and for none above all. */}
            {compact && b.fit === 'direct' ? null : (
              <p data-sap-reference-why="" className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                {b.why}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One row per building block: the RA as a link, or that SAP names none. */
export function SapReferenceInline({ bindings }: { bindings: readonly ReferenceBinding[] }) {
  const linked = bindings.filter((b) => b.ra !== null);
  return (
    <p data-sap-reference-inline="" className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
      SAP reference pattern:{' '}
      {linked.length === 0 ? (
        <span data-sap-reference="none">none</span>
      ) : (
        linked.map((b, i) => {
          const ra = SAP_REFERENCE_ARCHITECTURES[b.ra!];
          return (
            <span key={ra.id} data-sap-reference={ra.id} data-sap-reference-fit={b.fit}>
              {i > 0 ? ' · ' : null}
              <a href={raUrl(ra.id)} target="_blank" rel="noopener noreferrer" className={LINK} title={ra.title}>
                {ra.id}
              </a>{' '}
              ({FIT_LABEL[b.fit].toLowerCase()})
            </span>
          );
        })
      )}
    </p>
  );
}
