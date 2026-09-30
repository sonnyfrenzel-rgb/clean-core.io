import React from 'react';
import { 
  Briefcase, 
  Activity, 
  TrendingUp, 
  ShieldCheck, 
  Target, 
  Code2, 
  Database, 
  GitBranch, 
  Layers, 
  Zap, 
  FileText, 
  AlertTriangle,
  Search,
  Rocket
} from 'lucide-react';

const iconMap: { [key: string]: React.ElementType } = {
  'business context': Briefcase,
  'process narrative': Activity,
  'business value': TrendingUp,
  'value scoring': Target,
  'risk profile': AlertTriangle,
  'technical snapshot': Code2,
  'key findings': Search,
  'next steps': Rocket,
  'executive summary': FileText,
  'transformation strategy': Zap,
  'design principles': Layers,
  'architecture': Layers,
  'technical design': Code2,
  'cloud service': Database,
  'data model': Database,
  'extension patterns': GitBranch,
  'deployment': Rocket,
  'security': ShieldCheck,
  'performance': Activity,
  'modernization roadmap': TrendingUp,
};

export function DocumentSection({ title, children }: { title: string, children?: React.ReactNode }) {
  const normalizedTitle = title.toLowerCase();
  const Icon = Object.entries(iconMap).find(([key]) => normalizedTitle.includes(key))?.[1];

  return (
    <div className="bg-cc-surface border border-cc-line rounded-cc-card p-6 md:p-8 shadow-cc my-8">
      <div className="flex items-center gap-3 mb-4">
        {Icon && (
          <div className="p-2 bg-cc-surface-muted border border-cc-line rounded-cc-row text-cc-ink-muted">
            <Icon size={20} aria-hidden />
          </div>
        )}
        <h2 className="cc-text-h2 text-cc-ink">{title}</h2>
      </div>
      <div>
        {children}
      </div>
    </div>
  );
}
