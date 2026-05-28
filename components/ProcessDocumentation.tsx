'use client';

import React, { useEffect, useRef } from 'react';
import { Shield, Cpu, GitBranch, Terminal, CheckCircle2, Activity, Lock, Zap, FileCheck } from 'lucide-react';
import { clsx } from 'clsx';

const Mermaid = ({ chart }: { chart: string }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current || !chart || !chart.trim()) return;
    
    const renderChart = async () => {
      // Small delay to ensure DOM is ready and avoid race conditions
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: true,
          theme: 'neutral',
          securityLevel: 'loose',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis',
          },
        });
        // Use a unique ID starting with a letter
        const id = 'm' + Math.random().toString(36).substr(2, 9);
        const { svg } = await mermaid.render(id, chart);
        if (ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (ref.current) {
          ref.current.innerHTML = '<div class="p-4 text-red-500 text-xs bg-red-50 rounded-xl border border-red-100">Failed to render process flow diagram.</div>';
        }
      }
    };
    
    renderChart();
  }, [chart]);

  return <div ref={ref} className="mermaid-container w-full overflow-x-auto flex justify-center py-8 bg-gray-50 rounded-3xl border border-gray-100 shadow-inner" />;
};

export interface ProcessData {
  title: string;
  version: string;
  lastReviewed: string;
  mermaidFlow?: string;
  
  l1: {
    id: string;
    name: string;
    strategicGoal: string;
    businessOwner: string;
    stakeholders: string[];
    status: string;
  };

  l2: {
    id: string;
    name: string;
    processArea: string;
    keyBenefits: string[];
    sla: string;
    upstreamProcess: string;
    downstreamProcess: string;
  };

  l3: {
    id: string;
    name: string;
    businessTrigger: string;
    processOwner: string;
    businessRules: string;
    exceptionHandling: string;
    flowSteps: {
      trigger: string;
      step1: string;
      step2: string;
      outcome: string;
    };
  };

  l4: {
    id: string;
    name: string;
    userAction: string;
    inputRequirements: string;
    expectedOutcome: string;
    performanceMetrics: string;
    sla: string;
    criticalIssues: string[];
  };

  concerns: {
    businessValue: string;
    compliance: string;
    userExperience: string;
    riskManagement: string;
  };
}

interface ProcessDocumentationProps {
  data: ProcessData;
}

const LevelHeader = ({ level, title, icon: Icon, color }: { level: string; title: string; icon: any; color: string }) => (
  <div className={`flex items-center gap-3 mb-6 p-4 rounded-xl ${color} border-l-4 border-current`}>
    <div className="p-2 bg-white/20 rounded-lg">
      {Icon && <Icon className="w-6 h-6" />}
    </div>
    <div>
      <span className="text-xs font-bold uppercase tracking-wider opacity-80">{level}</span>
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
  </div>
);

const DataItem = ({ label, value }: { label: string; value: any }) => {
  const renderValue = () => {
    if (Array.isArray(value)) {
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {value.map((v, i) => (
            <span key={i} className="px-2 py-0.5 bg-[#003D7C]/5 rounded text-xs border border-[#003D7C]/10">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          ))}
        </div>
      );
    }
    
    if (typeof value === 'object' && value !== null) {
      return <span>{JSON.stringify(value)}</span>;
    }
    
    return <span>{String(value || 'N/A')}</span>;
  };

  return (
    <div className="mb-3">
      <span className="text-xs font-semibold text-[#003D7C]/50 uppercase block mb-0.5">{label}</span>
      <div className="text-[#003D7C] font-medium">
        {renderValue()}
      </div>
    </div>
  );
};

export const ProcessDocumentation: React.FC<ProcessDocumentationProps> = ({ data }) => {
  if (!data) return <div className="p-8 text-center text-gray-500">No data available.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="bg-[#003D7C] text-white p-8 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <FileCheck className="w-32 h-32" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-3 py-1 bg-[#009EE3] rounded-full text-xs font-bold uppercase tracking-widest">Node.js Framework</span>
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-medium">v{data?.version || '1.0.0'}</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-2">{data?.title || 'Process Documentation'}</h1>
          <p className="text-[#009EE3] font-medium">Last Reviewed: {data?.lastReviewed || 'N/A'} • Semantic Versioning Applied</p>
        </div>
      </div>

      {/* L1: Business Domain */}
      <div className="bg-white p-8 rounded-2xl border border-[#003D7C]/10 shadow-sm">
        <LevelHeader level="Level 1" title="Business Domain Map" icon={Shield} color="bg-blue-50 text-blue-700" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          <DataItem label="Domain ID" value={data?.l1?.id || 'N/A'} />
          <DataItem label="Domain Name" value={data?.l1?.name || 'N/A'} />
          <DataItem label="Strategic Goal" value={data?.l1?.strategicGoal || 'N/A'} />
          <DataItem label="Business Owner" value={data?.l1?.businessOwner || 'N/A'} />
          <DataItem label="Stakeholders" value={data?.l1?.stakeholders || []} />
          <DataItem label="Status" value={data?.l1?.status || 'N/A'} />
        </div>
      </div>

      {/* L2: Process Group */}
      <div className="bg-white p-8 rounded-2xl border border-[#003D7C]/10 shadow-sm">
        <LevelHeader level="Level 2" title="Process Group" icon={Cpu} color="bg-orange-50 text-orange-700" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          <DataItem label="Group ID" value={data?.l2?.id || 'N/A'} />
          <DataItem label="Group Name" value={data?.l2?.name || 'N/A'} />
          <DataItem label="Process Area" value={data?.l2?.processArea || 'N/A'} />
          <DataItem label="SLA Target" value={data?.l2?.sla || 'N/A'} />
          <DataItem label="Key Benefits" value={data?.l2?.keyBenefits || []} />
          <div className="flex gap-8">
            <DataItem label="Upstream Process" value={data?.l2?.upstreamProcess || 'N/A'} />
            <DataItem label="Downstream Process" value={data?.l2?.downstreamProcess || 'N/A'} />
          </div>
        </div>
      </div>

      {/* L3: Process Flow */}
      <div className="bg-white p-8 rounded-2xl border border-[#003D7C]/10 shadow-sm">
        <LevelHeader level="Level 3" title="Process Flow" icon={GitBranch} color="bg-emerald-50 text-emerald-700" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 mb-8">
          <DataItem label="Flow ID" value={data?.l3?.id || 'N/A'} />
          <DataItem label="Flow Name" value={data?.l3?.name || 'N/A'} />
          <DataItem label="Business Trigger" value={data?.l3?.businessTrigger || 'N/A'} />
          <DataItem label="Process Owner" value={data?.l3?.processOwner || 'N/A'} />
          <DataItem label="Business Rules" value={data?.l3?.businessRules || 'N/A'} />
          <DataItem label="Exception Handling" value={data?.l3?.exceptionHandling || 'N/A'} />
        </div>
        
        <div className="space-y-4">
          <span className="text-xs font-bold text-[#003D7C]/50 uppercase tracking-widest">Process Flow</span>
          
          {data?.mermaidFlow && (
            <div className="mb-8">
              <Mermaid key={data.mermaidFlow} chart={data.mermaidFlow} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            {[
              { label: 'Trigger', value: data?.l3?.flowSteps?.trigger || 'N/A', color: 'bg-orange-500' },
              { label: 'Step 1', value: data?.l3?.flowSteps?.step1 || 'N/A', color: 'bg-orange-600' },
              { label: 'Step 2', value: data?.l3?.flowSteps?.step2 || 'N/A', color: 'bg-orange-700' },
              { label: 'Outcome', value: data?.l3?.flowSteps?.outcome || 'N/A', color: 'bg-orange-800' },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-4 group">
                <div className={`w-32 py-2 px-4 ${step.color} text-white text-xs font-bold rounded-lg text-center shadow-sm`}>
                  {step.label}
                </div>
                <div className="flex-grow p-3 bg-[#f0f5fa] rounded-lg text-sm font-medium text-[#003D7C] border border-[#003D7C]/5">
                  {step.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* L4: Task Detail */}
      <div className="bg-white p-8 rounded-2xl border border-[#003D7C]/10 shadow-sm">
        <LevelHeader level="Level 4" title="Task Definition" icon={Terminal} color="bg-purple-50 text-purple-700" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          <DataItem label="Task ID" value={data?.l4?.id || 'N/A'} />
          <DataItem label="Task Name" value={data?.l4?.name || 'N/A'} />
          <DataItem label="User Action" value={data?.l4?.userAction || 'N/A'} />
          <DataItem label="SLA" value={data?.l4?.sla || 'N/A'} />
          <DataItem label="Input Requirements" value={data?.l4?.inputRequirements || 'N/A'} />
          <DataItem label="Expected Outcome" value={data?.l4?.expectedOutcome || 'N/A'} />
          <DataItem label="Critical Issues" value={data?.l4?.criticalIssues || []} />
          <DataItem label="Performance Metrics" value={data?.l4?.performanceMetrics || 'N/A'} />
        </div>
      </div>

      {/* Cross-Cutting Concerns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { icon: Activity, title: 'Business Value', desc: data?.concerns?.businessValue || 'N/A', color: 'text-blue-600' },
          { icon: Lock, title: 'Compliance', desc: data?.concerns?.compliance || 'N/A', color: 'text-emerald-600' },
          { icon: Zap, title: 'User Experience', desc: data?.concerns?.userExperience || 'N/A', color: 'text-orange-600' },
          { icon: CheckCircle2, title: 'Risk Management', desc: data?.concerns?.riskManagement || 'N/A', color: 'text-purple-600' },
        ].map((concern, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-[#003D7C]/10 shadow-sm flex gap-4">
            <div className={`p-3 rounded-xl bg-[#f0f5fa] ${concern.color}`}>
              <concern.icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-[#003D7C] mb-1">{concern.title}</h3>
              <p className="text-sm text-[#003D7C]/60 leading-relaxed">{concern.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

