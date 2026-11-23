/**
 * Nominative-use trademark disclaimer. Clean-Core.io references SAP marks
 * descriptively; this notice makes the independence explicit wherever SAP marks
 * appear (landing footer + in-app layout). Keep the wording nominative and the
 * non-affiliation statement unambiguous.
 */
import { BTP_FIRST } from '@/lib/sap-naming';

/** `tone="dark"`: on a dark footer (the landing's) the notice takes the light ink; muted ink there fails contrast. */
export default function SapTrademarkNotice({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <p className={`text-[11px] leading-relaxed ${tone === 'dark' ? 'text-cc-on-dark' : 'text-cc-ink-muted'} ${className}`}>
      SAP, S/4HANA, ABAP, {BTP_FIRST} and related names are trademarks or registered trademarks of SAP SE
      in Germany and other countries. Clean-Core.io is an independent, community-built tool and is{' '}
      <strong className="font-semibold">not affiliated with, sponsored, certified, or endorsed by SAP SE</strong>.
      All SAP marks are used nominatively for identification only.
    </p>
  );
}
