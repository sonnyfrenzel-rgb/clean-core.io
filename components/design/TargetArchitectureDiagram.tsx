'use client';

import type { DesignData } from '@/lib/types';
import MermaidDiagram from '@/components/MermaidDiagram';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { categoricalChartColor } from '@/lib/chart-colors';

interface TargetArchitectureDiagramProps {
  data: DesignData;
  isAbapCloud: boolean;
}

/**
 * Generates a Mermaid flowchart from the DesignData JSON — deterministic,
 * no extra LLM call. Shows the full target architecture as an interactive diagram.
 */
export default function TargetArchitectureDiagram({ data, isAbapCloud }: TargetArchitectureDiagramProps) {
  // Guard: never let a missing design payload crash the page (defense-in-depth).
  if (!data) return null;

  const chart = isAbapCloud ? buildRapChart(data) : buildCapChart(data);

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="cc-text-label text-cc-ink-muted">Drawn from the design above</span>
          {/* The boxes are drawn by code, but which services and layers exist is the model's design. */}
          <CcProvenanceChip value="proposed" />
          <CcTag>{isAbapCloud ? 'RAP Stack' : 'CAP/BTP Stack'}</CcTag>
        </div>
        <h4 className="cc-text-h2 text-cc-ink">Target Architecture Diagram</h4>
        <p className="cc-text-cell text-cc-ink-muted mt-1">
          Component topology derived from the project blueprint, service definitions, and cloud service bindings.
        </p>
      </div>

      <MermaidDiagram chart={chart} />
    </div>
  );
}

/**
 * The colours of the three layers the chart marks, as tokens (DESIGN.md §1.8,
 * `lib/chart-colors.ts`), never as hex. Mermaid's `style`/`classDef` grammar
 * cannot parse `var(…)`, so the classes carry only the line weight and the
 * colours come in as theme CSS through the init directive — a static string,
 * with no label text in it. The rendered SVG sits in the page, so the custom
 * properties resolve against `app/globals.css`.
 */
const LAYER_CLASSES = [
  { name: 'ccConsumer', color: categoricalChartColor(1).value },
  { name: 'ccExtension', color: categoricalChartColor(2).value },
  { name: 'ccCore', color: categoricalChartColor(0).value },
] as const;

const THEME_DIRECTIVE =
  '%%{init: {"themeCSS": "' +
  LAYER_CLASSES.map((c) => `.${c.name} rect { fill: var(--cc-surface); stroke: ${c.color}; }`).join(' ') +
  '"}}%%';

function layerStyles(assign: Array<[string, (typeof LAYER_CLASSES)[number]['name']]>): string[] {
  const used = new Set(assign.map(([, cls]) => cls));
  return [
    ...LAYER_CLASSES.filter((c) => used.has(c.name)).map((c) => `  classDef ${c.name} stroke-width:2px`),
    ...assign.map(([node, cls]) => `  class ${node} ${cls}`),
  ];
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

  // Every edge used to name a fallback node whether or not the design had it:
  // with no behavior definition anywhere in the structure, `BDEF --> CORE` still
  // went in, and Mermaid obligingly drew a BDEF box under the heading
  // "Auto-Generated from Design JSON" (QA review of 33471220d6e9, 4362479eb86e).
  // The chain is built from the layers that were actually detected, and
  // neighbours are connected to each other.
  const lines: string[] = [
    THEME_DIRECTIVE,
    'graph TD',
    '  UI["Fiori Elements UI"]',
  ];

  const epLabel = endpoints.length > 0 ? `${endpoints.length} Operations` : 'OData V4';
  const chain: Array<{ id: string; node: string }> = [];
  if (hasSRVB || endpoints.length > 0) chain.push({ id: 'SRVB', node: `  SRVB["Service Binding<br/>${sanitize(epLabel)}"]` });
  if (hasSRVD) chain.push({ id: 'SRVD', node: '  SRVD["Service Definition<br/>SRVD"]' });
  if (hasBDEF) chain.push({ id: 'BDEF', node: '  BDEF["Behavior Definition<br/>BDEF + Validations"]' });
  if (hasABP) chain.push({ id: 'ABP', node: '  ABP["ABP Handler Class<br/>Business Logic"]' });
  if (hasCDS) chain.push({ id: 'CDS', node: '  CDS["CDS Projection View<br/>Data Model"]' });

  for (const layer of chain) lines.push(layer.node);
  lines.push('  CORE["S/4HANA Core<br/>Protected Standard"]');

  const ids = ['UI', ...chain.map((l) => l.id), 'CORE'];
  for (let i = 0; i < ids.length - 1; i += 1) lines.push(`  ${ids[i]} --> ${ids[i + 1]}`);

  // A design that describes none of the RAP layers says so, rather than
  // letting the reader take the two remaining boxes for an architecture.
  if (chain.length === 0) {
    lines.push('  NOTE["Note: the design names no RAP artefacts<br/>(no CDS, BDEF, SRVD, SRVB or handler class)"]');
    lines.push('  UI -.-> NOTE');
  }

  // Add IAM/Auth services if present
  const authService = services.find(s => /iam|auth|role/i.test(s.serviceName + s.purpose));
  if (authService) {
    lines.push(`  IAM["${sanitize(authService.serviceName)}"]`);
    lines.push('  IAM -.-> SRVB');
  }

  // Style
  lines.push(...layerStyles([['UI', 'ccConsumer'], ['CORE', 'ccCore']]));

  return lines.join('\n');
}

/** Build a CAP/BTP-style Mermaid chart from DesignData */
function buildCapChart(data: DesignData): string {
  const services = data.cloudServices || [];
  const endpoints = data.nodeAppBlueprint?.apiEndpoints || [];

  const lines: string[] = [
    THEME_DIRECTIVE,
    'graph TD',
    '  UI["UI Consumer<br/>Fiori / API Client"]',
  ];

  // CAP Application
  const epLabel = endpoints.length > 0 ? `${endpoints.length} Endpoints` : 'REST/OData';
  lines.push(`  CAP["CAP Application<br/>Node.js · ${sanitize(epLabel)}"]`);
  lines.push('  UI --> CAP');

  // Cloud services
  const xsuaa = services.find(s => /xsuaa|auth|identity/i.test(s.serviceName));
  const dest = services.find(s => /destination|connect/i.test(s.serviceName));
  const eventMesh = services.find(s => /event|mesh|queue/i.test(s.serviceName));
  const db = services.find(s => /hana|postgres|db|database/i.test(s.serviceName));

  if (xsuaa) {
    lines.push(`  XSUAA["${sanitize(xsuaa.serviceName)}"]`);
    lines.push('  XSUAA -.-> CAP');
  }

  if (db) {
    lines.push(`  DB["${sanitize(db.serviceName)}"]`);
    lines.push('  CAP --> DB');
  }

  if (dest) {
    lines.push(`  DEST["${sanitize(dest.serviceName)}<br/>Secure Tunnel"]`);
    lines.push('  CAP --> DEST');
  } else {
    lines.push('  DEST["BTP Destination<br/>Secure Tunnel"]');
    lines.push('  CAP --> DEST');
  }

  if (eventMesh) {
    lines.push(`  EVT["${sanitize(eventMesh.serviceName)}"]`);
    lines.push('  CAP -.-> EVT');
  }

  // ERP Core
  lines.push('  API["Released API<br/>Standard OData/REST"]');
  lines.push('  DEST --> API');
  lines.push('  ERP["S/4HANA Core<br/>Protected Standard"]');
  lines.push('  API --> ERP');

  // Styles
  lines.push(...layerStyles([['UI', 'ccConsumer'], ['CAP', 'ccExtension'], ['ERP', 'ccCore']]));

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
