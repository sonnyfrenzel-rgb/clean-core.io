'use client';

interface ArchitecturalNextStepsProps {
  strategicNextSteps?: string[];
}

export default function ArchitecturalNextSteps({ strategicNextSteps }: ArchitecturalNextStepsProps) {
  if (!strategicNextSteps || strategicNextSteps.length === 0) return null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 md:p-8 shadow-cc">
      <div className="space-y-6">
        <div>
          <h3 className="cc-text-h2 text-cc-ink">Architectural Next Steps</h3>
          <p className="cc-text-cell text-cc-ink-muted mt-1">Action items for your engineering and configuration teams.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strategicNextSteps.map((step, idx) => (
            <div key={idx} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full border border-cc-line bg-cc-surface text-cc-ink flex items-center justify-center shrink-0 cc-text-meta">{idx + 1}</span>
              <p className="cc-text-cell text-cc-ink">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
