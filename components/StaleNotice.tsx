import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * Says why something on this page was built for a previous source, and what
 * has to be regenerated first (roadmap E01-F01-US02).
 *
 * Renders nothing when there is nothing to say. The reasons come from
 * `generationBlockers` / `handoverBlockers` in `lib/workflow-steps.ts`, the same
 * contract the stepper and the rail read, so this box and the circle above it
 * cannot disagree about *what* is out of date.
 *
 * A `warning` Message Strip since Block D (D.9), not a rose alert box: stale
 * means "rebuild", not "wrong" (`DESIGN.md` §1.1, "Veraltet ist nicht falsch"),
 * and a notice that is on the page from the first paint is a status, not an
 * alert that interrupts a screen reader.
 */
export default function StaleNotice({ title, reasons }: { title: string; reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <div data-stale-notice className="mb-8">
      <CcMessageStrip state="warning" headline={title}>
        <ul className="m-0 mt-1 list-none space-y-1 p-0">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </CcMessageStrip>
    </div>
  );
}
