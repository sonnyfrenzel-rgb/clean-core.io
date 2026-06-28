'use client';

interface RoadmapPhase {
  phase: string;
  title: string;
  deliverables: string[];
}

interface ModernizationRoadmapProps {
  roadmap?: RoadmapPhase[];
}

export default function ModernizationRoadmap({ roadmap }: ModernizationRoadmapProps) {
  if (!roadmap || roadmap.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
      <div className="mb-6">
        <h4 className="font-extrabold text-slate-900 text-lg">Modernization Roadmap</h4>
        <p className="text-xs text-slate-400 mt-1">Phased execution roadmap for the side-by-side target transition.</p>
      </div>
      
      <div className="relative pl-6 border-l-2 border-slate-100 space-y-8 my-2">
        {roadmap.map((phase, idx) => (
          <div key={idx} className="relative">
            {/* Circle timeline bullet */}
            <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 shadow-sm flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wider">{phase.phase}</span>
                <h5 className="font-extrabold text-slate-900 text-sm">{phase.title}</h5>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-500 list-disc pl-4">
                {phase.deliverables?.map((del, dIdx) => (
                  <li key={dIdx} className="leading-relaxed">{del}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
