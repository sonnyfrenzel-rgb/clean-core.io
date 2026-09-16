'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ChevronDown,
  EyeOff,
  FileCheck2,
  HeartHandshake,
  Lock,
  MapPin,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  TRUST_CARD_DISCLOSURE,
  TRUST_CARD_HIDE,
  TRUST_CARD_SHOW,
  TRUST_CARD_TITLE,
  TRUST_CLAIMS,
  TRUST_PLEDGE,
  type TrustClaim,
} from '@/lib/trust-claims';

/**
 * Trust before uploading — roadmap step 0.11, `DESIGN.md` §6.1.3.
 *
 * Uploading your own ABAP is handing over something valuable, so the upload
 * screen says what applies and what we do, in a calm voice, next to the drop
 * zone. Two parts: the one line you confirm by uploading (no checkbox — the
 * Terms were accepted at sign-up), and the card "Your code and your trust".
 *
 * This component renders text; it does not write any. Every sentence comes from
 * `lib/trust-claims.ts`, where it sits beside the sentence in the Terms, the
 * Privacy Policy or `SECURITY.md` that backs it, and
 * `tests/trust-card-guard.spec.ts` fails the build when the card shows a line
 * that no document in this repository carries. Do not add prose here.
 */

const ICONS: Record<TrustClaim['icon'], LucideIcon> = {
  residency: MapPin,
  access: Lock,
  proxy: Server,
  seal: FileCheck2,
  tracking: EyeOff,
  erasure: Trash2,
  training: Sparkles,
  security: ShieldCheck,
  free: HeartHandshake,
};

function SourceLinks({ claim }: { claim: TrustClaim }) {
  return (
    <>
      {claim.sources.map((source, i) => {
        const external = source.href.startsWith('http');
        const shared = 'text-green-700 underline decoration-green-300 underline-offset-2 hover:decoration-green-600 font-semibold';
        return (
          <span key={source.href + source.label} className="whitespace-nowrap">
            {i > 0 && <span aria-hidden="true"> · </span>}
            {external ? (
              <a
                data-trust-source={claim.id}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className={shared}
              >
                {source.label}
              </a>
            ) : (
              <Link data-trust-source={claim.id} href={source.href} className={shared}>
                {source.label}
              </Link>
            )}
          </span>
        );
      })}
    </>
  );
}

export default function TrustBeforeUpload() {
  const [open, setOpen] = useState(false);

  return (
    <div data-trust-block className="space-y-4">
      {/* What you confirm by uploading — a line, not a second tick box. */}
      <p
        data-trust-pledge
        className="text-xs sm:text-sm text-gray-600 leading-relaxed text-center max-w-2xl mx-auto"
      >
        <span data-trust-claim={TRUST_PLEDGE.id}>{TRUST_PLEDGE.text}</span>{' '}
        <SourceLinks claim={TRUST_PLEDGE} />
      </p>

      <div
        data-trust-card
        className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8"
      >
        <div className="flex items-center justify-between gap-4">
          <h3 data-trust-title className="text-base font-bold text-gray-900 tracking-tight">
            {TRUST_CARD_TITLE}
          </h3>
          <button
            type="button"
            data-trust-toggle
            aria-expanded={open}
            aria-controls="trust-claim-list"
            onClick={() => setOpen((v) => !v)}
            className="md:hidden flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"
          >
            {TRUST_CARD_DISCLOSURE} · {open ? TRUST_CARD_HIDE : TRUST_CARD_SHOW}
            <ChevronDown
              size={14}
              className={clsx('transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </div>

        <ul
          id="trust-claim-list"
          className={clsx('mt-5 space-y-3', open ? 'block' : 'hidden md:block')}
        >
          {TRUST_CLAIMS.map((claim) => {
            const Icon = ICONS[claim.icon];
            return (
              <li key={claim.id} className="flex items-start gap-3">
                <Icon size={15} className="text-green-600 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                  <span data-trust-claim={claim.id}>{claim.text}</span>{' '}
                  <SourceLinks claim={claim} />
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
