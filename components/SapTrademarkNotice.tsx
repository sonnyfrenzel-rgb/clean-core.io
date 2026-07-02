/**
 * Nominative-use trademark disclaimer. Clean-Core.io references SAP marks
 * descriptively; this notice makes the independence explicit wherever SAP marks
 * appear (landing footer + in-app layout). Keep the wording nominative and the
 * non-affiliation statement unambiguous.
 */
export default function SapTrademarkNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[10px] sm:text-[11px] leading-relaxed text-slate-400 ${className}`}>
      SAP, S/4HANA, ABAP, SAP BTP and related names are trademarks or registered trademarks of SAP SE
      in Germany and other countries. Clean-Core.io is an independent, community-built tool and is{' '}
      <strong className="font-semibold">not affiliated with, sponsored, certified, or endorsed by SAP SE</strong>.
      All SAP marks are used nominatively for identification only.
    </p>
  );
}
