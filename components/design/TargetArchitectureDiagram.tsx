'use client';

import type { DesignData } from '@/lib/types';
import MermaidDiagram from '@/components/MermaidDiagram';

interface TargetArchitectureDiagramProps {
  data: DesignData;
  isAbapCloud: boolean;
}

/**
 * Generates a Mermaid flowchart from the DesignData JSON — deterministic,
 * no extra LLM call. Shows the full target architecture as an interactive diagram.
 */
export default function TargetArchitectureDiagram({ data, isAbapCloud }: TargetArchitectureDiagramProps) {
  const chart = isAbapCloud ? buildRapChart(data) : buildCapChart(data);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-[9px] font-bold tracking-widest text-emerald-600 uppercase font-mono">
            Auto-Generated from Design JSON
          </span>
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
            isAbapCloud
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-blue-50 text-blue-700 border border-blue-100'
          }`}>
            {isAbapCloud ? '⚙️ RAP Stack' : '☁️ CAP/BTP Stack'}
          </span>
        </div>
        <h4 className="text-xl font-black text-slate-900">Target Architecture Diagram</h4>
        <p className="text-xs text-slate-500 mt-1">
          Component topology derived from the project blueprint, service definitions, and cloud service bindings.
        </p>
      </div>

      {/* Mermaid Diagram */}
      <div className="px-4 pb-6">
        <MermaidDiagram chart={chart} />
      </div>
    </div>
  );
}

/** Build a RAP-style Mermaid chart from DesignData */
function buildRapChart(data: DesignData): string {
  const projectFiles = data.nodeAppBlueprint?.projectStructure || [];
  const services = data.cloudServices || [];
  const endpoints = data.nodeAppBlueprint?.apiEndpoints || [];

  // Identify key RAP layers from project structure
  const hasCDS = projectFiles.some(f => /cds|projection|view/i.test(f.path + f.purpose));
  const hasBDEF = projectFiles.some(f => /bdef|behavior/i.test(f.path + f.purpose));
  const hasSRVD = projectFiles.some(f => /srvd|service.*def/i.test(f.path + f.purpose));
  const hasSRVB = projectFiles.some(f => /srvb|service.*bind/i.test(f.path + f.purpose));
  const hasABP = projectFiles.some(f => /abp|handler|impl/i.test(f.path + f.purpose));

  const lines: string[] = [
    'graph TD',
    '  UI["🖥️ Fiori Elements UI"]',
  ];

  if (hasSRVB || endpoints.length > 0) {
    const epLabel = endpoints.length > 0 ? `${endpoints.length} Operations` : 'OData V4';
    lines.push(`  SRVB["🌐 Service Binding<br/>${sanitize(epLabel)}"]`);
    lines.push('  UI --> SRVB');
  }

  if (hasSRVD) {
    lines.push('  SRVD["📋 Service Definition<br/>SRVD"]');
    lines.push('  SRVB --> SRVD');
  }

  if (hasBDEF) {
    lines.push('  BDEF["⚙️ Behavior Definition<br/>BDEF + Validations"]');
    lines.push(`  ${hasSRVD ? 'SRVD' : 'SRVB'} --> BDEF`);
  }

  if (hasABP) {
    lines.push('  ABP["🔧 ABP Handler Class<br/>Business Logic"]');
    lines.push(`  ${hasBDEF ? 'BDEF' : 'SRVD'} --> ABP`);
  }

  if (hasCDS) {
    lines.push('  CDS["📊 CDS Projection View<br/>Data Model"]');
    lines.push(`  ${hasABP ? 'ABP' : hasBDEF ? 'BDEF' : 'SRVD'} --> CDS`);
  }

  lines.push('  CORE["🛡️ S/4HANA Core<br/>Protected Standard"]');
  lines.push(`  ${hasCDS ? 'CDS' : hasABP ? 'ABP' : 'BDEF'} --> CORE`);

  // Add IAM/Auth services if present
  const authService = services.find(s => /iam|auth|role/i.test(s.serviceName + s.purpose));
  if (authService) {
    lines.push(`  IAM["🔐 ${sanitize(authService.serviceName)}"]`);
    lines.push('  IAM -.-> SRVB');
  }

  // Style
  lines.push('  style CORE fill:#f0fdf4,stroke:#16a34a,stroke-width:2px');
  lines.push('  style UI fill:#eff6ff,stroke:#3b82f6,stroke-width:2px');

  return lines.join('\n');
}

/** Build a CAP/BTP-style Mermaid chart from DesignData */
function buildCapChart(data: DesignData): string {
  const services = data.cloudServices || [];
  const endpoints = data.nodeAppBlueprint?.apiEndpoints || [];

  const lines: string[] = [
    'graph TD',
    '  UI["🖥️ UI Consumer<br/>Fiori / API Client"]',
  ];

  // CAP Application
  const epLabel = endpoints.length > 0 ? `${endpoints.length} Endpoints` : 'REST/OData';
  lines.push(`  CAP["⚡ CAP Application<br/>Node.js · ${sanitize(epLabel)}"]`);
  lines.push('  UI --> CAP');

  // Cloud services
  const xsuaa = services.find(s => /xsuaa|auth|identity/i.test(s.serviceName));
  const dest = services.find(s => /destination|connect/i.test(s.serviceName));
  const eventMesh = services.find(s => /event|mesh|queue/i.test(s.serviceName));
  const db = services.find(s => /hana|postgres|db|database/i.test(s.serviceName));

  if (xsuaa) {
    lines.push(`  XSUAA["🔐 ${sanitize(xsuaa.serviceName)}"]`);
    lines.push('  XSUAA -.-> CAP');
  }

  if (db) {
    lines.push(`  DB["💾 ${sanitize(db.serviceName)}"]`);
    lines.push('  CAP --> DB');
  }

  if (dest) {
    lines.push(`  DEST["🔗 ${sanitize(dest.serviceName)}<br/>Secure Tunnel"]`);
    lines.push('  CAP --> DEST');
  } else {
    lines.push('  DEST["🔗 BTP Destination<br/>Secure Tunnel"]');
    lines.push('  CAP --> DEST');
  }

  if (eventMesh) {
    lines.push(`  EVT["📨 ${sanitize(eventMesh.serviceName)}"]`);
    lines.push('  CAP -.-> EVT');
  }

  // ERP Core
  lines.push('  API["📡 Released API<br/>Standard OData/REST"]');
  lines.push('  DEST --> API');
  lines.push('  ERP["🛡️ S/4HANA Core<br/>Protected Standard"]');
  lines.push('  API --> ERP');

  // Styles
  lines.push('  style ERP fill:#f0fdf4,stroke:#16a34a,stroke-width:2px');
  lines.push('  style UI fill:#eff6ff,stroke:#3b82f6,stroke-width:2px');
  lines.push('  style CAP fill:#fefce8,stroke:#ca8a04,stroke-width:2px');

  return lines.join('\n');
}

/**
 * F-03: Sanitize text for Mermaid labels — defense-in-depth against XSS.
 * Even though chart data is deterministic, we harden labels to prevent
 * accidental injection if data sources expand in the future.
 */
function sanitize(text: string): string {
  return text
    .replace(/[<>'"&`]/g, '')       // Strip HTML/XSS characters
    .replace(/[\[\]{}()|;#]/g, '')  // Strip Mermaid control tokens
    .replace(/-->/g, '')            // Strip Mermaid arrow syntax
    .replace(/javascript:/gi, '')   // Strip JS protocol
    .replace(/on\w+=/gi, '')        // Strip event handlers (onclick=, onerror=, etc.)
    .slice(0, 60)
    .trim();
}
