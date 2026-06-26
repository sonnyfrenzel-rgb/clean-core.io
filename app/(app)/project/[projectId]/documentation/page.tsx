'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import NavigationButtons from '@/components/NavigationButtons';
import { Download, ArrowLeft, ArrowRight, RefreshCw, AlertCircle, FileCode2, Briefcase, Target, Users, Settings, Activity, Layers, Cpu, Database, Box, Lock, CheckCircle2, X, Rocket } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { motion, AnimatePresence } from 'motion/react';
import dynamic from 'next/dynamic';
import { clsx } from 'clsx';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { formatDocsToMarkdown, formatBusinessDocsToMarkdown } from '@/lib/markdownFormatter';
import { saveAs } from '@/lib/fileSaver';

const addOrUpdateFileInWorkspace = (generatedCode: string | undefined, filePath: string, fileContent: string): string => {
  let files: Array<{ path: string, content: string }> = [];
  if (generatedCode) {
    try {
      const parsed = JSON.parse(generatedCode);
      if (Array.isArray(parsed)) {
        files = parsed;
      }
    } catch (e) {
      files = [
        {
          path: 'srv/service.ts',
          content: generatedCode
        }
      ];
    }
  }
  const existingFileIdx = files.findIndex(f => f.path === filePath);
  if (existingFileIdx !== -1) {
    files[existingFileIdx].content = fileContent;
  } else {
    files.push({ path: filePath, content: fileContent });
  }
  return JSON.stringify(files);
};

// Dynamically import ProcessFlow to avoid SSR issues
const ProcessFlow = dynamic(() => import('@/components/ProcessFlow'), { ssr: false });

// Robust JSON Extractor
const extractJSON = (text: string) => {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = match ? match[1] : text;
    const cleaned = jsonString.trim().replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON parsing failed", e);
    try {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      }
    } catch (innerE) {
      console.error("Aggressive JSON parsing failed", innerE);
    }
    throw new Error("Failed to parse AI response into structured data. Please try regenerating.");
  }
};

const escapeXML = (str: string) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// Enterprise BPMN 2.0 XML Generator for SAP Signavio & SAP Build
const generateBPMN = (flow: any[], businessDoc?: any) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"\n`;
  xml += `                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"\n`;
  xml += `                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"\n`;
  xml += `                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"\n`;
  xml += `                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">\n`;
  
  xml += `  <bpmn:collaboration id="Collaboration_1">\n`;
  xml += `    <bpmn:participant id="Participant_1" name="Modernized Clean Core Process Flow" processRef="Process_1" />\n`;
  xml += `  </bpmn:collaboration>\n`;

  xml += `  <bpmn:process id="Process_1" isExecutable="false">\n`;
  
  const sequenceFlows: {id: string, source: string, target: string}[] = [];
  
  if (Array.isArray(flow)) {
    // 1. Gather all unique roles for lanes mapping
    const roles = Array.from(new Set(flow.map(node => node.role || 'System').filter(Boolean)));
    
    // 2. Generate LaneSet & Lanes
    if (roles.length > 0) {
      xml += `    <bpmn:laneSet id="LaneSet_1">\n`;
      roles.forEach((role, rIdx) => {
        xml += `      <bpmn:lane id="Lane_${rIdx}" name="${role}">\n`;
        flow.forEach(node => {
          const nodeRole = node.role || 'System';
          if (nodeRole === role) {
            xml += `        <bpmn:flowNodeRef>${node.id}</bpmn:flowNodeRef>\n`;
          }
        });
        xml += `      </bpmn:lane>\n`;
      });
      xml += `    </bpmn:laneSet>\n`;
    }

    // 3. Generate Flow Nodes
    flow.forEach((node) => {
      const type = node.type === 'startEvent' ? 'bpmn:startEvent' :
                   node.type === 'endEvent' ? 'bpmn:endEvent' :
                   node.type === 'gateway' || node.type === 'exclusiveGateway' ? 'bpmn:exclusiveGateway' :
                   node.type === 'serviceTask' ? 'bpmn:serviceTask' :
                   node.type === 'userTask' ? 'bpmn:userTask' :
                   node.type === 'sendTask' ? 'bpmn:sendTask' :
                   node.type === 'receiveTask' ? 'bpmn:receiveTask' : 'bpmn:task';
                   
      let documentationText = '';
      if (businessDoc) {
        const sop = businessDoc.sop_details?.find((s: any) => s.stepId === node.id);
        const raci = businessDoc.raci_matrix?.find((r: any) => r.stepId === node.id);
        if (sop) {
          documentationText += `SOP narrative: ${sop.narrative}\nKPI target: ${sop.kpiTarget}\nException fallback: ${sop.businessException}\n\n`;
        }
        if (raci) {
          documentationText += `RACI assignments: R=${raci.r}, A=${raci.a}, C=${raci.c}, I=${raci.i}\n`;
        }
      }

      xml += `    <${type} id="${node.id}" name="${node.name || node.id}">\n`;
      if (documentationText) {
        xml += `      <bpmn:documentation>${escapeXML(documentationText)}</bpmn:documentation>\n`;
      }
      if (node.next && Array.isArray(node.next)) {
        node.next.forEach((targetId: string, i: number) => {
          const flowId = `Flow_${node.id}_${targetId}_${i}`;
          xml += `      <bpmn:outgoing>${flowId}</bpmn:outgoing>\n`;
          sequenceFlows.push({
            id: flowId,
            source: node.id,
            target: targetId
          });
        });
      }
      xml += `    </${type}>\n`;
    });

    // 4. Generate Sequence Flows
    sequenceFlows.forEach(f => {
      xml += `    <bpmn:sequenceFlow id="${f.id}" sourceRef="${f.source}" targetRef="${f.target}" />\n`;
    });
  }
  
  xml += `  </bpmn:process>\n`;

  // 5. Generate BPMN Diagram Interchange (BPMNDI) for visual layout rendering in Signavio
  if (Array.isArray(flow)) {
    const roles = Array.from(new Set(flow.map(node => node.role || 'System').filter(Boolean)));
    const totalWidth = flow.length * 200 + 150;
    const totalHeight = Math.max(200, roles.length * 160 + 60);

    xml += `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n`;
    xml += `    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">\n`;
    
    // Participant Pool Bounds
    xml += `      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">\n`;
    xml += `        <dc:Bounds x="80" y="40" width="${totalWidth}" height="${totalHeight}" />\n`;
    xml += `      </bpmndi:BPMNShape>\n`;

    // Lanes Bounds
    roles.forEach((role, rIdx) => {
      xml += `      <bpmndi:BPMNShape id="Lane_${rIdx}_di" bpmnElement="Lane_${rIdx}" isHorizontal="true">\n`;
      xml += `        <dc:Bounds x="110" y="${rIdx * 160 + 40}" width="${totalWidth - 30}" height="160" />\n`;
      xml += `      </bpmndi:BPMNShape>\n`;
    });

    // Nodes Bounds (Grid placement coordinates)
    flow.forEach((node, idx) => {
      const role = node.role || 'System';
      const rIdx = roles.indexOf(role);
      const yPos = rIdx * 160 + 80;
      const xPos = idx * 200 + 160;
      
      let width = 120;
      let height = 80;
      let offset = 0; // Center offset for circular events
      if (node.type === 'startEvent' || node.type === 'endEvent') {
        width = 36;
        height = 36;
        offset = 22;
      } else if (node.type === 'gateway' || node.type === 'exclusiveGateway') {
        width = 50;
        height = 50;
        offset = 15;
      }

      xml += `      <bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}">\n`;
      xml += `        <dc:Bounds x="${xPos}" y="${yPos + offset}" width="${width}" height="${height}" />\n`;
      xml += `      </bpmndi:BPMNShape>\n`;
    });

    // Connections Edges (Sequence Flows Waypoints)
    sequenceFlows.forEach(f => {
      const sourceNode = flow.find(n => n.id === f.source);
      const targetNode = flow.find(n => n.id === f.target);
      if (sourceNode && targetNode) {
        const sourceRole = sourceNode.role || 'System';
        const targetRole = targetNode.role || 'System';
        const sIdx = flow.indexOf(sourceNode);
        const tIdx = flow.indexOf(targetNode);
        
        const srIdx = roles.indexOf(sourceRole);
        const trIdx = roles.indexOf(targetRole);

        const sX = sIdx * 200 + 160 + (sourceNode.type === 'startEvent' || sourceNode.type === 'endEvent' ? 36 : sourceNode.type === 'gateway' || sourceNode.type === 'exclusiveGateway' ? 50 : 120);
        const sY = srIdx * 160 + 80 + (sourceNode.type === 'startEvent' || sourceNode.type === 'endEvent' ? 40 : sourceNode.type === 'gateway' || sourceNode.type === 'exclusiveGateway' ? 40 : 40);

        const tX = tIdx * 200 + 160;
        const tY = trIdx * 160 + 80 + (targetNode.type === 'startEvent' || targetNode.type === 'endEvent' ? 40 : targetNode.type === 'gateway' || targetNode.type === 'exclusiveGateway' ? 40 : 40);

        xml += `      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">\n`;
        xml += `        <di:waypoint x="${sX}" y="${sY}" />\n`;
        xml += `        <di:waypoint x="${tX}" y="${tY}" />\n`;
        xml += `      </bpmndi:BPMNEdge>\n`;
      }
    });

    xml += `    </bpmndi:BPMNPlane>\n`;
    xml += `  </bpmndi:BPMNDiagram>\n`;
  }

  xml += `</bpmn:definitions>`;
  return xml;
};

export default function DocumentationPage() {
  const { projectId } = useParams();
  const router = useRouter();
  const { profile } = useUserProfile();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [documentation, setDocumentation] = useState('');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [docError, setDocError] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<any | null>(null);

  // Stage 2 Business Documentation States
  const [businessDocumentation, setBusinessDocumentation] = useState('');
  const [isGeneratingBusinessDoc, setIsGeneratingBusinessDoc] = useState(false);
  const [businessDocError, setBusinessDocError] = useState('');
  const [activeTab, setActiveTab] = useState<'technical' | 'business'>('technical');

  const handleNodeClick = (nodeId: string) => {
    setHighlightedTaskId(nodeId);
    if (parsedDoc?.l4_tasks) {
      const task = parsedDoc.l4_tasks.find((t: any) => t.stepId === nodeId);
      if (task) {
        setActiveTask(task);
      }
    }
    const element = document.getElementById(`task-${nodeId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      setHighlightedTaskId(prev => prev === nodeId ? null : prev);
    }, 3000);
  };

  // Fetch Project Data
  useEffect(() => {
    let isMounted = true;
    const fetchProject = async () => {
      if (!projectId) return;
      const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
      try {
        const db = getDb();
        const docSnap = await getDoc(doc(db, 'projects', idStr));
        if (docSnap.exists() && isMounted) {
          const data = docSnap.data();
          setProject({ id: docSnap.id, ...data } as unknown as Project);
          if (data.documentation) {
            setDocumentation(data.documentation);
          }
          if (data.businessDocumentation) {
            setBusinessDocumentation(data.businessDocumentation);
          }
        }
      } catch (err) {
        console.error("Error fetching project:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchProject();
    return () => { isMounted = false; };
  }, [projectId]);

  const generateDocumentation = useCallback(async () => {
    if (!project || !projectId) return;
    
    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    
    setIsGeneratingDoc(true);
    setDocError('');
    
    try {
      const context = `
        Project Name: ${project.name || 'Untitled Project'}
        Code Snippet: ${(project.generatedCode || '').substring(0, 1000)}
        Design Snippet: ${(project.solutionDesign || '').substring(0, 1000)}
        Analysis Snippet: ${(project.analysis || '').substring(0, 1000)}
      `;

      const prompt = `Act as an Enterprise Business Process Architect.
Based on the context, generate a comprehensive Process Documentation focusing heavily on Business Value, KPIs, and Roles.

Return ONLY a JSON object wrapped in a markdown code block (\`\`\`json ... \`\`\`). 
DO NOT include any text before or after the JSON.

CRITICAL BPMN 2.0 & SAP SIGNAVIO INTEGRATION GUIDELINES:
- In "l3_flow", you MUST map the role responsible for executing each task. Ensure that roles are standard enterprise actors (e.g. "System", "Finance Analyst", "CISO", "Developer").
- Node "type" inside "l3_flow" MUST utilize standard BPMN 2.0 task classifications:
  - "startEvent": The trigger point.
  - "endEvent": The final state.
  - "gateway" or "exclusiveGateway": Decisions.
  - "serviceTask": Fully automated backend systems (e.g., calling standard released OData APIs).
  - "userTask": Steps requiring human action (e.g., CISO approval, manual code check).
  - "sendTask" / "receiveTask": Asynchronous messaging events.

Structure exactly like this:
{
  "l1_domain": { "name": "...", "strategicGoal": "...", "owner": "..." },
  "l2_group": { "name": "...", "processArea": "...", "kpis": ["...", "..."] },
  "l3_flow": [
    { "id": "Start", "name": "Process Trigger", "type": "startEvent", "role": "System", "next": ["Task1"] },
    { "id": "Task1", "name": "First Step", "type": "serviceTask|userTask|gateway|endEvent", "role": "System|Developer|CISO|User", "next": ["End"] },
    { "id": "End", "name": "Process Complete", "type": "endEvent", "role": "System", "next": [] }
  ],
  "l4_tasks": [
    { 
      "stepId": "Task1", 
      "name": "...",
      "description": "...", 
      "inputs": ["..."], 
      "outputs": ["..."], 
      "systems": ["..."],
      "complexity": "Low|Medium|High",
      "estimatedDuration": "...",
      "technicalMapping": "..." 
    }
  ]
}

Context:
${context}`;

      console.log('Generating documentation for project:', project.name);

      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', false, profile?.geminiApiKey);
      
      if (!responseText) {
        throw new Error('Gemini returned an empty response.');
      }
      
      const jsonString = responseText || '';
      // Validate parsing before saving
      const parsed = extractJSON(jsonString);
      
      setDocumentation(jsonString);
      
      const updatedCode = addOrUpdateFileInWorkspace(project.generatedCode, 'docs/process-blueprint.md', formatDocsToMarkdown(jsonString));

      const db = getDb();
      await updateDoc(doc(db, 'projects', idStr), {
        documentation: jsonString,
        generatedCode: updatedCode,
        status: 'documented'
      });

      setProject(prev => prev ? { ...prev, documentation: jsonString, generatedCode: updatedCode, status: 'documented' } : null);
      
    } catch (err: unknown) {
      console.error('Documentation generation error:', err);
      setDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingDoc(false);
    }
  }, [projectId, project, profile?.geminiApiKey]);

  const parsedDoc = useMemo(() => {
    if (!documentation) return null;
    try {
      const parsed = extractJSON(documentation);
      // Basic validation of the structure
      if (typeof parsed !== 'object' || parsed === null || !parsed.l1_domain) {
        throw new Error("Invalid documentation structure");
      }
      return parsed;
    } catch (e) {
      console.error("Parsed documentation is invalid:", e);
      return null;
    }
  }, [documentation]);

  const parsedBusinessDoc = useMemo(() => {
    if (!businessDocumentation) return null;
    try {
      return extractJSON(businessDocumentation);
    } catch (e) {
      console.error("Parsed business documentation is invalid:", e);
      return null;
    }
  }, [businessDocumentation]);

  const generateBusinessDocumentation = useCallback(async () => {
    if (!project || !projectId || !documentation) return;
    
    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    
    setIsGeneratingBusinessDoc(true);
    setBusinessDocError('');
    
    try {
      const prompt = `Act as an Enterprise Business Process Compliance & SOP Expert.
Based on the following Process Blueprint (BPMN flow and Level 4 tasks), generate the corresponding Business SOP & RACI Matrix layer.

Return ONLY a JSON object wrapped in a markdown code block (\`\`\`json ... \`\`\`).
DO NOT include any text before or after the JSON.

Process Blueprint Context:
${documentation}

Structure the JSON exactly like this:
{
  "raci_matrix": [
    { 
      "stepId": "Task1", 
      "r": "Responsible Role (matching roles in l3_flow e.g. System, Developer, CISO, User)", 
      "a": "Accountable Role (e.g. Service Owner, Process Owner)", 
      "c": "Consulted Role (e.g. CISO, Senior Architect)", 
      "i": "Informed Role (e.g. IT Operations, finance)" 
    }
  ],
  "sop_details": [
    { 
      "stepId": "Task1", 
      "narrative": "Detailed step-by-step description of how this process step is handled (3-4 sentences).", 
      "businessException": "Fallback guidance on what to do if this step fails (e.g., fallback process, manual controls).", 
      "kpiTarget": "KPI metrics target for this task (e.g. Process time < 30min, 100% compliance score)." 
    }
  ],
  "audit_controls": [
    { 
      "stepId": "Task1", 
      "controlObjective": "Compliance risk control goal (e.g. Prevent unauthorized direct database modification).", 
      "mitigationAction": "Mitigation steps (e.g. Use Tier 1 custom API proxy or released standard API mapping).", 
      "assertionMethod": "Verification method (e.g. automated pipeline code verification, unit tests verification)." 
    }
  ]
}`;

      console.log('Generating business process compliance for project:', project.name);
      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', false, profile?.geminiApiKey);
      
      if (!responseText) {
        throw new Error('Gemini returned an empty response.');
      }
      
      const parsed = extractJSON(responseText);
      if (!parsed.raci_matrix || !parsed.sop_details || !parsed.audit_controls) {
        throw new Error("Invalid business documentation schema returned by AI");
      }
      
      setBusinessDocumentation(responseText);
      
      const updatedCode = addOrUpdateFileInWorkspace(project.generatedCode, 'docs/business-documentation.md', formatBusinessDocsToMarkdown(responseText));

      const db = getDb();
      await updateDoc(doc(db, 'projects', idStr), {
        businessDocumentation: responseText,
        generatedCode: updatedCode
      });

      setProject(prev => prev ? { ...prev, businessDocumentation: responseText, generatedCode: updatedCode } : null);
      
    } catch (err: unknown) {
      console.error('Business documentation generation error:', err);
      setBusinessDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingBusinessDoc(false);
    }
  }, [projectId, project, documentation, profile?.geminiApiKey]);

  const downloadBPMN = () => {
    if (profile?.tier === 'pilot') {
      setShowUpgradeModal(true);
      return;
    }
    if (!parsedDoc?.l3_flow) return;
    const xml = generateBPMN(parsedDoc.l3_flow, parsedBusinessDoc);
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
    saveAs(blob, `${fileName}_Process.bpmn`);
  };

  const downloadConfluenceHTML = () => {
    if (profile?.tier === 'pilot') {
      setShowUpgradeModal(true);
      return;
    }
    if (!parsedDoc) return;
    
    const confluenceCSS = `
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #172B4D; line-height: 1.6; padding: 20px; }
        .doc-header { background: #0747A6; color: white; padding: 24px; border-radius: 8px; margin-bottom: 30px; }
        .doc-header h1 { margin: 0; font-size: 28px; font-weight: 800; text-transform: uppercase; }
        .doc-header p { margin: 8px 0 0 0; opacity: 0.8; font-weight: 500; }
        h2 { color: #0747A6; border-bottom: 2px solid #DFE1E6; padding-bottom: 8px; margin-top: 40px; font-size: 20px; text-transform: uppercase; }
        .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .meta-card { background: #F4F5F7; padding: 20px; border-radius: 8px; border: 1px solid #DFE1E6; }
        .meta-card h3 { margin: 0 0 10px 0; color: #42526E; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; }
        .meta-card p { margin: 0; font-weight: 600; font-size: 15px; }
        .meta-card .badge { display: inline-block; background: #DEEBFF; color: #0747A6; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 8px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        th, td { border: 1px solid #DFE1E6; padding: 12px; text-align: left; }
        th { background-color: #F4F5F7; font-weight: 700; color: #42526E; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .complexity-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .complexity-high { background: #FFEBE6; color: #BF2600; }
        .complexity-medium { background: #FFF0B3; color: #172B4D; }
        .complexity-low { background: #EAE6FF; color: #403294; }
        .tech-pill { display: inline-block; background: #E3FCEF; color: #006644; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-right: 4px; }
      </style>
    `;

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          ${confluenceCSS}
        </head>
        <body>
          <div class="doc-header">
            <h1>${parsedDoc.l1_domain?.name || 'Process Blueprint'}</h1>
            <p>Enterprise Integration Specifications & Workflow Definition</p>
          </div>
          
          <div class="meta-grid">
            <div class="meta-card">
              <h3>Level 1: Business Domain Blueprint</h3>
              <p><strong>Strategic Goal:</strong> ${parsedDoc.l1_domain?.strategicGoal || 'N/A'}</p>
              <div class="badge">Owner: ${parsedDoc.l1_domain?.owner || 'N/A'}</div>
            </div>
            
            <div class="meta-card">
              <h3>Level 2: Process Area Group</h3>
              <p><strong>Process Area:</strong> ${parsedDoc.l2_group?.processArea || 'N/A'}</p>
              <p style="margin-top: 10px;"><strong>KPI Framework:</strong></p>
              <div style="margin-top: 5px;">
                ${(parsedDoc.l2_group?.kpis || []).map((kpi: string) => `<span class="tech-pill">${kpi}</span>`).join('')}
              </div>
            </div>
          </div>
          
          <h2>Level 4: Architectural Task Specifications</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 10%">ID</th>
                <th style="width: 25%">Task Name</th>
                <th style="width: 35%">Functional Description</th>
                <th style="width: 15%">Complexity</th>
                <th style="width: 15%">Technology Stack</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedDoc.l4_tasks || []).map((task: any) => `
                <tr>
                  <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${task.stepId}</td>
                  <td><strong>${task.name || `Task ${task.stepId}`}</strong></td>
                   <td>
                     <p style="margin: 0;">${task.description}</p>
                     <p style="margin: 6px 0 0 0; font-size: 11px; color: #6B778C;">
                       <strong>Inputs:</strong> ${(task.inputs || []).join(', ') || 'N/A'} | 
                       <strong>Outputs:</strong> ${(task.outputs || []).join(', ') || 'N/A'}
                     </p>
                   </td>
                  <td>
                    <span class="complexity-badge ${
                      task.complexity === 'High' ? 'complexity-high' :
                      task.complexity === 'Medium' ? 'complexity-medium' :
                      'complexity-low'
                    }">${task.complexity || 'Low'}</span>
                  </td>
                  <td>
                    ${(task.systems || []).map((sys: string) => `<span class="tech-pill">${sys}</span>`).join('')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          ${parsedBusinessDoc ? `
            <h2>Level 5: Standard Operating Procedures (SOP) & RACI Assignment</h2>
            
            <h3>RACI Assignment Matrix</h3>
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Responsible (R)</th>
                  <th>Accountable (A)</th>
                  <th>Consulted (C)</th>
                  <th>Informed (I)</th>
                </tr>
              </thead>
              <tbody>
                ${(parsedBusinessDoc.raci_matrix || []).map((raci: any) => `
                  <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${raci.stepId}</td>
                    <td>${raci.r || 'N/A'}</td>
                    <td>${raci.a || 'N/A'}</td>
                    <td>${raci.c || 'N/A'}</td>
                    <td>${raci.i || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h3>SOP Operational Playbook</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 15%">Task ID</th>
                  <th style="width: 50%">Operational SOP Description</th>
                  <th style="width: 20%">Business Exception Fallback</th>
                  <th style="width: 15%">KPI Success Metric</th>
                </tr>
              </thead>
              <tbody>
                ${(parsedBusinessDoc.sop_details || []).map((sop: any) => `
                  <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${sop.stepId}</td>
                    <td>${sop.narrative || 'N/A'}</td>
                    <td style="color: #BF2600; font-weight: 500;">${sop.businessException || 'N/A'}</td>
                    <td style="font-weight: 600; color: #006644;">${sop.kpiTarget || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h3>Internal Audit Compliance & Risk Controls</h3>
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Control Objective</th>
                  <th>Mitigation Action</th>
                  <th>Assertion Verification Method</th>
                </tr>
              </thead>
              <tbody>
                ${(parsedBusinessDoc.audit_controls || []).map((ctrl: any) => `
                  <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${ctrl.stepId}</td>
                    <td><strong>${ctrl.controlObjective || 'N/A'}</strong></td>
                    <td>${ctrl.mitigationAction || 'N/A'}</td>
                    <td style="font-family: monospace; font-size: 11px;">${ctrl.assertionMethod || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
        </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
    saveAs(blob, `${fileName}_Confluence.html`);
  };

  if (loading) return (
    <div className="animate-in fade-in duration-500">
      <Stepper currentStep={6} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      <div className="h-[60vh] flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
          <p className="text-lg font-medium text-gray-400">Loading documentation...</p>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 bg-[#f8f9ff] min-h-screen p-4 md:p-8">
      <Stepper currentStep={6} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10 mt-6 md:mt-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-[#0b1c30] tracking-tight uppercase">Process Blueprint & Mapping</h1>
          <p className="text-[#0b1c30]/70 font-medium">Business Architecture & BPMN Map</p>
          
          {/* SAP Compatibility Badges */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Integrations:</span>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded text-[9px] font-black uppercase tracking-tight shadow-sm cursor-help group/signavio relative">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>BPMN-Compatible</span>
              <div className="absolute top-full left-0 mt-1 w-64 p-3 bg-slate-900 border border-slate-800 text-[10px] rounded-xl shadow-xl opacity-0 pointer-events-none group-hover/signavio:opacity-100 transition-opacity duration-200 text-left leading-relaxed text-slate-300 z-50 normal-case">
                <div className="font-extrabold text-emerald-400 mb-1 uppercase tracking-wider text-[9px]">Signavio-Importable</div>
                The generated BPMN 2.0 XML is designed for seamless import into SAP Signavio Process Manager and other BPMN 2.0 compliant tools.
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 rounded text-[9px] font-black uppercase tracking-tight shadow-sm cursor-help group/sapbuild relative">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
              <span>SAP Build-Compatible</span>
              <div className="absolute top-full left-0 mt-1 w-64 p-3 bg-slate-900 border border-slate-800 text-[10px] rounded-xl shadow-xl opacity-0 pointer-events-none group-hover/sapbuild:opacity-100 transition-opacity duration-200 text-left leading-relaxed text-slate-300 z-50 normal-case">
                <div className="font-extrabold text-cyan-400 mb-1 uppercase tracking-wider text-[9px]">SAP Build-Compatible</div>
                Process flow structures mapped for compatibility with SAP Build Process Automation pipelines. Not an official SAP certification.
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative group/tooltip">
            <button 
              onClick={downloadBPMN}
              disabled={!parsedDoc?.l3_flow || isGeneratingDoc}
              className={clsx(
                "flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-xs md:text-sm uppercase tracking-widest border",
                profile?.tier === 'pilot' ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-white border-[#eff4ff] text-[#0b1c30] hover:bg-[#eff4ff] opacity-100 disabled:opacity-50"
              )}
            >
              <FileCode2 size={16} /> Export BPMN {profile?.tier === 'pilot' && <Lock size={12} className="ml-1" />}
            </button>
            {profile?.tier === 'pilot' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 pointer-events-none text-center">
                BPMN 2.0 Exports are reserved for <span className="text-green-400 font-bold tracking-widest uppercase">Starter</span> & Premium users.
              </div>
            )}
          </div>

          <div className="relative group/tooltip">
            <button 
              onClick={downloadConfluenceHTML}
              disabled={!parsedDoc || isGeneratingDoc}
              className={clsx(
                "flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-xs md:text-sm uppercase tracking-widest border",
                profile?.tier === 'pilot' ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-white border-[#eff4ff] text-[#0b1c30] hover:bg-[#eff4ff] opacity-100 disabled:opacity-50"
              )}
            >
              <Download size={16} /> Export Confluence {profile?.tier === 'pilot' && <Lock size={12} className="ml-1" />}
            </button>
            {profile?.tier === 'pilot' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 pointer-events-none text-center">
                Confluence HTML format is a <span className="text-green-400 font-bold uppercase tracking-widest">Starter</span> feature.
              </div>
            )}
          </div>

          <button 
            onClick={generateDocumentation}
            disabled={isGeneratingDoc}
            className="flex items-center gap-2 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white px-6 py-3 rounded-xl hover:shadow-lg transition-all font-bold text-xs md:text-sm uppercase tracking-widest disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isGeneratingDoc ? 'animate-spin' : ''}`} /> 
            {documentation ? 'Regenerate' : 'Generate Blueprint'}
          </button>
        </div>
      </div>

      {docError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-[2rem] mb-10 flex items-start gap-4 shadow-sm">
          <div className="p-2 bg-red-100 rounded-xl text-red-600">
            <AlertCircle className="w-6 h-6 shrink-0" />
          </div>
          <div>
            <h3 className="font-bold text-red-900 uppercase tracking-tight">Generation Blocked</h3>
            <p className="text-sm text-red-700 font-medium mt-1 leading-relaxed">{docError}</p>
          </div>
        </div>
      )}

      {isGeneratingDoc ? (
        <div className="min-h-[40vh] bg-white flex flex-col items-center justify-center p-8 text-center rounded-[2.5rem] md:rounded-[3rem] border border-gray-100 shadow-sm mb-12">
          <div className="relative w-20 h-20 md:w-24 md:h-24 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-green-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-green-600 border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Architecting Process</div>
          <p className="text-gray-500 font-medium text-sm md:text-base">Analyzing business domains and generating BPMN structures...</p>
        </div>
      ) : parsedDoc ? (
        <div id="documentation-report" className="space-y-8 mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Tab Switcher */}
          <div className="flex border-b border-gray-200 mb-8 mt-4 overflow-x-auto gap-4">
            <button
              onClick={() => setActiveTab('technical')}
              className={clsx(
                "px-6 py-3 font-bold text-xs md:text-sm uppercase tracking-wider border-b-2 transition-all shrink-0",
                activeTab === 'technical' ? "border-[#006b2c] text-[#006b2c]" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              Technical Blueprint
            </button>
            <button
              onClick={() => setActiveTab('business')}
              className={clsx(
                "px-6 py-3 font-bold text-xs md:text-sm uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 shrink-0",
                activeTab === 'business' ? "border-[#006b2c] text-[#006b2c]" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              Business SOP & Compliance
              {!parsedBusinessDoc && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              )}
            </button>
          </div>

          {activeTab === 'technical' ? (
            <div className="space-y-8">
              {/* L1 & L2 Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* L1 Domain */}
            <div className="bg-gradient-to-br from-slate-900 to-[#0b1c30] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-green-500/10 transition-all duration-500"></div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-500/10 text-green-400 rounded-xl border border-green-500/20"><Briefcase size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-green-400 uppercase tracking-widest">Level 1 Blueprint</h2>
                  <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Business Domain</h3>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Integration Domain</p>
                  <p className="text-base md:text-lg font-black text-white tracking-tight">{parsedDoc.l1_domain?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Strategic Goal</p>
                  <p className="text-gray-300 font-medium text-sm leading-relaxed">{parsedDoc.l1_domain?.strategicGoal}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Service Owner</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-lg text-[11px] font-black uppercase tracking-widest text-green-400 border border-green-500/20">
                    <Users size={12} /> {parsedDoc.l1_domain?.owner}
                  </div>
                </div>
              </div>
            </div>

            {/* L2 Group */}
            <div className="bg-gradient-to-br from-slate-900 to-[#0b1c30] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-green-500/10 transition-all duration-500"></div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-500/10 text-green-400 rounded-xl border border-green-500/20"><Target size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-green-400 uppercase tracking-widest">Level 2 Blueprint</h2>
                  <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Process Area Group</h3>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Process Area</p>
                  <p className="text-base md:text-lg font-black text-white tracking-tight">{parsedDoc.l2_group?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Functional Context</p>
                  <p className="text-gray-300 font-medium text-sm leading-relaxed">{parsedDoc.l2_group?.processArea}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">KPI Framework</p>
                  <div className="flex flex-wrap gap-2">
                    {(parsedDoc.l2_group?.kpis || []).map((kpi: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-md text-[10px] font-black uppercase tracking-tight border border-green-500/20">
                        {kpi}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Process Flow Map */}
          <div className="bg-[#ffffff] p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-sm border border-gray-100 relative group">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#eff4ff] text-[#006b2c] rounded-xl"><Activity size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 3 Flow</h2>
                  <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Interactive BPMN Map</h3>
                </div>
              </div>
              
              {/* BPMN Legend */}
              <div className="flex flex-wrap items-center gap-3 bg-gray-55/50 px-4 py-2.5 rounded-2xl border border-gray-100">
                <span className="text-[9px] font-black text-gray-400 uppercase mr-1">Legend:</span>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-100 border border-green-500"></div>
                  <span className="text-[9px] font-bold text-gray-600">Start</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-2.5 rounded bg-blue-50 border border-blue-200"></div>
                  <span className="text-[9px] font-bold text-gray-600">Task</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-amber-50 border border-amber-500 rotate-45"></div>
                  <span className="text-[9px] font-bold text-gray-600">Gateway</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-100 border-2 border-red-500"></div>
                  <span className="text-[9px] font-bold text-gray-600">End</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-100 h-[400px] md:h-[500px] shadow-inner relative">
              {parsedDoc.l3_flow && (
                <ProcessFlow flow={parsedDoc.l3_flow} tasks={parsedDoc.l4_tasks} onNodeClick={handleNodeClick} />
              )}
              <div className="absolute bottom-4 left-4 bg-gray-900/80 text-white text-[9px] px-3 py-1.5 rounded-lg backdrop-blur-sm pointer-events-none font-bold uppercase tracking-wider">
                💡 Tip: Click nodes to scroll to Task Specs
              </div>
            </div>
          </div>

          {/* Task Definitions */}
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#eff4ff] text-[#00873a] rounded-xl"><Settings size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 4</h2>
                  <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Architectural Task Index</h3>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4 bg-white/60 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Low Complexity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Medium Logic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">High Integration</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(parsedDoc.l4_tasks || []).map((task: any, i: number) => {
                const isHighlighted = highlightedTaskId === task.stepId;
                return (
                  <motion.div 
                    key={i} 
                    id={`task-${task.stepId}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setActiveTask(task)}
                    className={clsx(
                      "p-6 rounded-[2rem] shadow-sm flex flex-col transition-all duration-300 border relative overflow-hidden cursor-pointer hover:-translate-y-1 group active:scale-[0.99]",
                      isHighlighted 
                        ? "border-green-500 ring-4 ring-green-500/20 bg-green-50/20 scale-[1.02] shadow-xl"
                        : task.complexity === 'High' ? "bg-white border-red-100 hover:border-red-300 hover:shadow-red-500/10" :
                          task.complexity === 'Medium' ? "bg-white border-amber-100 hover:border-amber-300 hover:shadow-amber-500/10" :
                          "bg-white border-green-100 hover:border-green-300 hover:shadow-green-500/10"
                    )}
                  >
                    {isHighlighted && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 animate-pulse"></div>
                    )}
                    <div className="flex items-start justify-between mb-4">
                      <div className="inline-block px-3 py-1 bg-[#0b1c30] text-white text-[9px] font-black rounded-lg uppercase tracking-tight shrink-0">
                        Task: {task.stepId}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] font-black text-green-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all">Deep Dive</span>
                        <div className={clsx(
                          "px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border",
                          task.complexity === 'High' ? "bg-red-50 text-red-600 border-red-100" :
                          task.complexity === 'Medium' ? "bg-amber-50 text-amber-600 border-amber-100" :
                          "bg-green-50 text-green-600 border-green-100"
                        )}>
                          {task.complexity || 'Low'}
                        </div>
                      </div>
                    </div>

                    <h4 className="text-base font-black text-[#0b1c30] mb-2 leading-tight uppercase tracking-tight group-hover:text-green-700 transition-colors">{task.name || `Task ${task.stepId}`}</h4>
                    <p className="text-xs md:text-sm text-[#0b1c30]/70 font-medium mb-6 flex-grow leading-relaxed">{task.description}</p>

                    <div className="mt-auto space-y-4 pt-4 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                          <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <Layers size={10} className="shrink-0" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Inputs</span>
                          </div>
                          <p className="text-[10px] font-bold text-[#0b1c30] break-words mt-1 leading-normal" title={(task.inputs || []).join(', ')}>
                            {(task.inputs || []).join(', ') || 'N/A'}
                          </p>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                          <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <Box size={10} className="shrink-0" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Outputs</span>
                          </div>
                          <p className="text-[10px] font-bold text-[#0b1c30] break-words mt-1 leading-normal" title={(task.outputs || []).join(', ')}>
                            {(task.outputs || []).join(', ') || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-[11px] pt-1 flex-wrap">
                        <div className="flex items-center gap-1.5 text-slate-500 font-medium min-w-0 flex-1">
                          <Cpu size={12} className="text-green-600 shrink-0" />
                          <span className="break-words text-xs leading-none">
                            {Array.isArray(task.systems) ? task.systems.join(', ') : (task.systems || 'Node.js')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600 font-mono font-bold shrink-0">
                          <FileCode2 size={12} />
                          <span>Specs</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
          ) : (
            <div className="space-y-8">
              {isGeneratingBusinessDoc ? (
                <div className="min-h-[40vh] bg-[#0b1c30] border border-slate-800 flex flex-col items-center justify-center p-8 text-center rounded-[2.5rem] md:rounded-[3rem] shadow-sm mb-12 text-white relative overflow-hidden">
                  <div className="relative w-20 h-20 md:w-24 md:h-24 mx-auto mb-8">
                    <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-green-500 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-xl md:text-2xl font-black mb-2 uppercase tracking-tight text-white">Mapping SOP & RACI Matrix</div>
                  <p className="text-slate-400 font-medium text-sm md:text-base max-w-md leading-relaxed">
                    Gemini is evaluating executing roles, drafting operational playbook instructions, and defining target compliance checkpoints...
                  </p>
                </div>
              ) : parsedBusinessDoc ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  {/* RACI Matrix Section */}
                  <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-[#eff4ff] text-[#0b1c30] rounded-xl"><Users size={24} /></div>
                        <div>
                          <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 5</h2>
                          <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">RACI Assignment Matrix</h3>
                        </div>
                      </div>
                      
                      {/* RACI Legend */}
                      <div className="flex flex-wrap items-center gap-3 bg-gray-55 px-4 py-2.5 rounded-2xl border border-gray-100">
                        <span className="text-[9px] font-black text-gray-400 uppercase mr-1">RACI Guide:</span>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-100 text-[8px] font-black uppercase">R</span>
                          <span className="text-[8px] font-bold text-gray-600">Responsible</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 text-[8px] font-black uppercase">A</span>
                          <span className="text-[8px] font-bold text-gray-600">Accountable</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 text-[8px] font-black uppercase">C</span>
                          <span className="text-[8px] font-bold text-gray-600">Consulted</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 text-[8px] font-black uppercase">I</span>
                          <span className="text-[8px] font-bold text-gray-600">Informed</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-inner">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Step ID</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Responsible (R)</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Accountable (A)</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Consulted (C)</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Informed (I)</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100 font-medium text-xs text-gray-700">
                          {(parsedBusinessDoc.raci_matrix || []).map((raci: any, rIdx: number) => (
                            <tr key={rIdx} className="hover:bg-gray-50/50">
                              <td className="px-6 py-4 font-mono font-black text-green-600">{raci.stepId}</td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-100 font-bold uppercase text-[10px] tracking-tight">{raci.r || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 font-bold uppercase text-[10px] tracking-tight">{raci.a || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-bold uppercase text-[10px] tracking-tight">{raci.c || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-bold uppercase text-[10px] tracking-tight">{raci.i || 'N/A'}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SOP Narratives Section */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-[#eff4ff] text-[#00873a] rounded-xl"><Briefcase size={24} /></div>
                      <div>
                        <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 5 SOP</h2>
                        <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Standard Operating Procedures</h3>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {(parsedBusinessDoc.sop_details || []).map((sop: any, sIdx: number) => (
                        <div key={sIdx} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-center justify-between mb-4">
                            <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-tight font-mono">Step: {sop.stepId}</span>
                            <span className="text-[10px] font-black text-green-600 uppercase tracking-wider flex items-center gap-1">
                              <Activity className="w-3.5 h-3.5" /> Target: {sop.kpiTarget}
                            </span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-mono">Operational Narrative</h4>
                              <p className="text-xs text-gray-700 leading-relaxed font-semibold">{sop.narrative}</p>
                            </div>
                            <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                              <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-1 font-mono">Business Exception Fallback</h4>
                              <p className="text-xs text-rose-950 leading-relaxed font-semibold">{sop.businessException}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Internal Controls Section */}
                  <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-[#eff4ff] text-[#006b2c] rounded-xl"><Lock size={24} /></div>
                      <div>
                        <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Compliance Audit</h2>
                        <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Risk & Control Checkpoints</h3>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-inner">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Step</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Control Objective</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Mitigation Action</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Assertion Method</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100 font-medium text-xs text-gray-700">
                          {(parsedBusinessDoc.audit_controls || []).map((ctrl: any, cIdx: number) => (
                            <tr key={cIdx} className="hover:bg-gray-50/50">
                              <td className="px-6 py-4 font-mono font-black text-green-600">{ctrl.stepId}</td>
                              <td className="px-6 py-4 font-extrabold text-gray-900 leading-normal">{ctrl.controlObjective}</td>
                              <td className="px-6 py-4 text-gray-600 leading-normal">{ctrl.mitigationAction}</td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded font-mono text-[9px] font-bold uppercase">{ctrl.assertionMethod}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0b1c30] border border-slate-800 rounded-[2.5rem] p-8 md:p-12 text-white shadow-xl relative overflow-hidden group">
                  {/* Decorative gradient blur */}
                  <div className="absolute top-0 right-0 w-80 h-80 bg-green-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-green-500/15 transition-all duration-700"></div>
                  
                  <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs font-black uppercase tracking-widest mb-6">
                      <Cpu className="w-4 h-4 animate-pulse" /> AI Business Extension
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-4">Generate Enterprise Business SOP & RACI Matrix</h3>
                    <p className="text-slate-300 font-medium mb-8 text-sm md:text-base leading-relaxed">
                      Unlock business-level mapping to align technical Clean Core changes with corporate compliance frameworks and operational execution procedures.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                      <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                        <div className="flex items-center gap-2 text-green-400 mb-2">
                          <Users size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest font-mono">RACI Assignment</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">Maps Responsible, Accountable, Consulted, and Informed roles across all process tasks.</p>
                      </div>
                      <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                        <div className="flex items-center gap-2 text-cyan-400 mb-2">
                          <Layers size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest font-mono">Level 5 Narratives</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">Drafts standard operating narratives, KPI targets, and functional exception handling guidance.</p>
                      </div>
                      <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                        <div className="flex items-center gap-2 text-rose-400 mb-2">
                          <Lock size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest font-mono">Internal Audit Controls</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">Identifies key clean core control objectives, mitigating actions, and assertion evidence methods.</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={generateBusinessDocumentation}
                      disabled={isGeneratingBusinessDoc}
                      className="relative inline-flex items-center gap-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black uppercase tracking-widest text-xs md:text-sm px-10 py-4.5 rounded-2xl shadow-xl hover:shadow-green-600/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Rocket className="w-4 h-4" />
                      <span>Generate Business Layer (AI)</span>
                    </button>
                    
                    {businessDocError && (
                      <p className="text-rose-400 font-medium text-xs mt-4 animate-pulse">{businessDocError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 md:p-20 text-center bg-gray-50/50 rounded-[2.5rem] md:rounded-[3rem] border-2 border-dashed border-gray-200 mb-12">
          <p className="text-gray-500 mb-6 font-medium">No enterprise specifications yet.</p>
          <button 
            onClick={generateDocumentation}
            className="bg-[#0b1c30] text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#006b2c] transition-all shadow-xl hover:shadow-green-600/20"
          >
            Start Architectural Mapping
          </button>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-xl z-[110] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowUpgradeModal(false)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] p-8 md:p-12 max-w-xl w-full shadow-2xl relative" 
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setShowUpgradeModal(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-colors">
              <X size={24} className="text-gray-400" />
            </button>
            
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-green-50 rounded-3xl flex items-center justify-center mb-8 shadow-inner shadow-green-100">
                <Rocket size={40} className="text-green-600" />
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-950 tracking-tighter mb-4 uppercase">Unlock BPMN Experts</h2>
              <p className="text-gray-600 font-medium mb-10 leading-relaxed">
                Exporting professional **BPMN 2.0 XML** and **Confluence Blueprints** is a feature reserved for our higher license tiers. Modernize your documentation pipeline with Starter.
              </p>
              
              <div className="w-full bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-10 text-left">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Starter Benefits</h4>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> BPMN 2.0 Interoperability
                  </li>
                  <li className="flex items-center gap-3 text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> Professional Documentation Exports
                  </li>
                  <li className="flex items-center gap-3 text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> Enhanced Data Transformation Quota
                  </li>
                </ul>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <button 
                  onClick={() => router.push('/settings')}
                  className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-black shadow-lg hover:shadow-green-600/30 transition-all uppercase tracking-widest text-sm"
                >
                  Upgrade Now
                </button>
                <button 
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all uppercase tracking-widest text-sm"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Level 4 Task Deep-Dive Drawer Overlay */}
      <AnimatePresence>
        {activeTask && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveTask(null)}
              className="fixed inset-0 bg-slate-950 z-[110]"
            />
            
            {/* Slide-out Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-screen w-full md:w-[480px] xl:w-[550px] bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-[120] text-white p-6 md:p-8 flex flex-col overflow-hidden"
            >
              {/* Close Button */}
              <button 
                onClick={() => setActiveTask(null)}
                className="absolute top-6 right-6 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-2 rounded-full transition-colors z-10"
              >
                <X size={18} />
              </button>

              {/* Decorative background blob */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>
              
              {/* Header */}
              <div className="flex items-center gap-3.5 mb-6 pb-6 border-b border-slate-800/80 shrink-0">
                <div className="bg-green-500/20 p-2.5 rounded-2xl text-green-400 border border-green-500/30">
                  <Settings className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest font-mono">Level 4 Task Specification</span>
                  <h3 className="text-xl font-extrabold text-white mt-0.5 uppercase tracking-tight">{activeTask.name || `Task ${activeTask.stepId}`}</h3>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-6 text-sm scrollbar-thin scrollbar-thumb-slate-800">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Functional Description & Role Responsibility</h4>
                  <p className="text-slate-200 leading-relaxed font-medium">{activeTask.description}</p>
                </div>

                {/* Grid Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-800 py-4 my-2 shrink-0">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Step ID</span>
                    <span className="text-sm font-black text-slate-200 mt-1 block uppercase">{activeTask.stepId}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Logic Complexity</span>
                    <span className={clsx(
                      "text-xs font-black uppercase tracking-widest mt-1.5 inline-block px-2.5 py-0.5 rounded border",
                      activeTask.complexity === 'High' ? "bg-red-950/40 text-red-400 border-red-900/60" :
                      activeTask.complexity === 'Medium' ? "bg-amber-950/40 text-amber-400 border-amber-900/60" :
                      "bg-green-950/40 text-green-400 border-green-900/60"
                    )}>
                      {activeTask.complexity || 'Low'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Estimated Effort</span>
                    <span className="text-sm font-bold text-emerald-400 mt-1.5 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      {activeTask.estimatedDuration || '2 Days'}
                    </span>
                  </div>
                </div>

                {/* Inputs & Outputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 shrink-0">
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Layers size={14} className="text-green-500" />
                      <span className="text-[9px] font-black uppercase tracking-widest font-mono">Input Parameters</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-200 list-disc pl-4 font-semibold">
                      {(activeTask.inputs || []).map((inp: string, idx: number) => (
                        <li key={idx}>{inp}</li>
                      ))}
                      {(!activeTask.inputs || activeTask.inputs.length === 0) && <li>N/A</li>}
                    </ul>
                  </div>

                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Box size={14} className="text-green-500" />
                      <span className="text-[9px] font-black uppercase tracking-widest font-mono">Output Results</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-200 list-disc pl-4 font-semibold">
                      {(activeTask.outputs || []).map((out: string, idx: number) => (
                        <li key={idx}>{out}</li>
                      ))}
                      {(!activeTask.outputs || activeTask.outputs.length === 0) && <li>N/A</li>}
                    </ul>
                  </div>
                </div>

                {/* Target Systems */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono">Target Platform & Tech Stack</h4>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(activeTask.systems) ? activeTask.systems : [activeTask.systems || 'Node.js']).map((sys: string, idx: number) => (
                      <code key={idx} className="bg-slate-950 text-emerald-400 border border-slate-800 text-xs px-3 py-1.5 rounded-xl font-mono">
                        {sys}
                      </code>
                    ))}
                  </div>
                </div>

                {/* Technical Mapping Snippet */}
                <div className="space-y-2.5 pt-2 shrink-0">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Technical & Execution Mapping</h4>
                  <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
                    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">{activeTask.stepId}.ts</span>
                      <div className="w-12"></div>
                    </div>
                    <pre className="p-5 text-xs font-mono text-emerald-300 overflow-x-auto max-h-[220px] select-all scrollbar-thin scrollbar-thumb-slate-800">
                      <code>{activeTask.technicalMapping || '// Transformed execution handler\nrouter.post(\'/sync\', async (req, res) => {\n  // Implementation code mapping detailed above...\n});'}</code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-slate-800/80 flex justify-between items-center shrink-0">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">Clean-Core.io Architecture Mapping Standard</span>
                <button
                  onClick={() => setActiveTask(null)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-950/20 active:scale-95"
                >
                  Close Specification
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <NavigationButtons 
        backPath={`/project/${projectId}/testing`}
        backLabel="Back to Testing"
        proceedPath={`/project/${projectId}/delivery`}
        proceedLabel="Proceed to Delivery"
      />
    </div>
  );
}
