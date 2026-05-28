import React from 'react';
import { 
  Briefcase, 
  Activity, 
  TrendingUp, 
  ShieldCheck, 
  Target, 
  Cpu, 
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
  'technical snapshot': Cpu,
  'key findings': Search,
  'next steps': Rocket,
  'executive summary': FileText,
  'transformation strategy': Zap,
  'design principles': Layers,
  'architecture': Layers,
  'technical design': Cpu,
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
    <div className="bg-white border border-gray-100 rounded-2xl md:rounded-[2rem] p-6 md:p-12 shadow-lg my-8 md:my-12 relative overflow-hidden group hover:shadow-xl transition-shadow duration-300">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-green-600 group-hover:w-2 transition-all duration-300"></div>
      <div className="flex items-center gap-4 mb-6 md:mb-8">
        {Icon && (
          <div className="p-3 bg-green-50 rounded-xl text-green-600">
            <Icon size={24} />
          </div>
        )}
        <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
      </div>
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
