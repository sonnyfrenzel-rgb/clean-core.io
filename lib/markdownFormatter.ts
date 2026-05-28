/**
 * Professional Markdown Formatting Engine
 * Synthesizes raw structured JSON data fields from GCP Gemini AI 
 * into beautifully readable, corporate-grade executive reports.
 */

export function formatAnalysisToMarkdown(rawJson: string): string {
  if (!rawJson) return '';
  try {
    // Strip markdown wrappers if present
    const cleanedJson = rawJson.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    const data = JSON.parse(cleanedJson);
    if (!data || typeof data !== 'object') return rawJson;

    let md = `# 📊 Business Analysis Report: ${data.projectTitle || 'ABAP Modernization'}\n\n`;
    md += `## 🛡️ Clean Core Compliance Baseline\n`;
    md += `**Compliance Score:** \`${data.cleanCoreScore || 0} / 100\`\n\n`;
    md += `> 💡 **Executive Summary:** ${data.summary || ''}\n\n`;
    
    md += `## 📂 As-Is Process & Legacy Context\n`;
    md += `${data.asIsContext || 'No context available.'}\n\n`;
    
    if (data.standardFit) {
      md += `## 🎯 Target Standard Process & SAP Fit\n`;
      md += `- **Fit Potential:** **${data.standardFit.potential || 'N/A'}**\n`;
      md += `- **Target Standard Process:** \`${data.standardFit.targetStandardProcess || 'N/A'}\`\n`;
      md += `- **Technical Rationale:** ${data.standardFit.rationale || 'N/A'}\n\n`;
    }
    
    if (Array.isArray(data.gaps) && data.gaps.length > 0) {
      md += `## ⚠️ Functional Gaps & Extensibility Strategies\n`;
      md += `The following customization gaps have been identified compared to the standard S/4HANA core:\n\n`;
      md += `| Gap / Capability | Severity | Complexity | Recommended Extensibility Strategy | Technical Rationale |\n`;
      md += `| :--- | :---: | :---: | :--- | :--- |\n`;
      data.gaps.forEach((g: any) => {
        md += `| **${g.title || 'Untitled Gap'}** | \`${g.severity || 'Medium'}\` | \`${g.complexity || 'Medium'}\` | **${g.strategy || 'Side-by-Side'}** | ${g.rationale || ''} |\n`;
      });
      md += `\n`;
    }
    
    if (data.recommendations) {
      md += `## 💡 Clean Core Architecture Recommendations\n`;
      md += `- **Keep Core Clean Strategy:** ${data.recommendations.keepCoreClean || 'N/A'}\n`;
      md += `- **Decommissioning / Deactivation Strategy:** ${data.recommendations.decommissioning || 'N/A'}\n`;
      md += `- **Transformed Cloud Readiness:** ${data.recommendations.cloudReadiness || 'N/A'}\n\n`;
    }
    
    if (Array.isArray(data.strategicNextSteps) && data.strategicNextSteps.length > 0) {
      md += `## 🚀 Architectural Next Steps\n`;
      data.strategicNextSteps.forEach((step: string, idx: number) => {
        md += `${idx + 1}. **${step}**\n`;
      });
      md += `\n`;
    }
    
    return md;
  } catch (e) {
    return rawJson;
  }
}

export function formatDesignToMarkdown(rawJson: string): string {
  if (!rawJson) return '';
  try {
    const cleanedJson = rawJson.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    const data = JSON.parse(cleanedJson);
    if (!data || typeof data !== 'object') return rawJson;

    let md = `# 🏗️ Target Architecture Blueprint: ${data.projectName || 'Transformed Cloud Service'}\n\n`;
    
    if (data.architectureOverview) {
      md += `## 🌐 Architecture Overview\n`;
      md += `${data.architectureOverview.approachDescription || ''}\n\n`;
      md += `- **Target Node.js Framework:** \`${data.architectureOverview.nodeFramework || 'Express'}\`\n`;
      md += `- **Recommended Runtime Platform:** \`${data.architectureOverview.runtimePlatform || 'SAP BTP'}\`\n\n`;
    }
    
    if (data.nodeAppBlueprint) {
      md += `## 📁 Transformed Folder Structure & Artifacts\n`;
      md += `Below is the recommended side-by-side microservice project layout:\n\n`;
      md += `| File/Folder Path | Purpose & Content |\n`;
      md += `| :--- | :--- |\n`;
      if (Array.isArray(data.nodeAppBlueprint.projectStructure)) {
        data.nodeAppBlueprint.projectStructure.forEach((item: any) => {
          md += `| \`${item.path}\` | ${item.purpose} |\n`;
        });
      }
      md += `\n`;
      
      md += `## 🔌 Modernized REST/OData API Method Catalog\n`;
      md += `| HTTP Method | API Endpoint Path | Functional Scope & Capability |\n`;
      md += `| :---: | :--- | :--- |\n`;
      if (Array.isArray(data.nodeAppBlueprint.apiEndpoints)) {
        data.nodeAppBlueprint.apiEndpoints.forEach((item: any) => {
          md += `| \`${item.method}\` | \`${item.path}\` | ${item.description} |\n`;
        });
      }
      md += `\n`;
    }
    
    if (Array.isArray(data.cloudServices) && data.cloudServices.length > 0) {
      md += `## ☁️ SAP BTP & Native Cloud Services Integration\n`;
      data.cloudServices.forEach((service: any) => {
        md += `### 🔹 ${service.serviceName}\n`;
        md += `**Purpose in Project:** ${service.purpose}\n\n`;
        if (Array.isArray(service.npmPackages) && service.npmPackages.length > 0) {
          md += `**Required Node.js SDK Packages:** ${service.npmPackages.map((pkg: string) => `\`${pkg}\``).join(', ')}\n\n`;
        }
      });
    }
    
    if (data.dataSync) {
      md += `## 🔄 Data Synchronization & Integration Pattern\n`;
      md += `### **Pattern:** \`${data.dataSync.patternName || 'Event-Driven'}\`\n`;
      md += `${data.dataSync.description || ''}\n\n`;
    }
    
    if (Array.isArray(data.sapStandardApiMapping) && data.sapStandardApiMapping.length > 0) {
      md += `## 🌐 SAP API Business Hub Mappings\n`;
      md += `The side-by-side extension communicates with S/4HANA via released standard interfaces to keep the core clean:\n\n`;
      md += `| Legacy Object | Target Released SAP Public API | API Business Hub ID | Integration Role / Context | Link |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      data.sapStandardApiMapping.forEach((map: any) => {
        md += `| \`${map.legacyTableOrFunction}\` | **${map.sapStandardApiName}** | \`${map.apiId}\` | ${map.description} | [API Hub Reference](${map.apiHubUrl}) |\n`;
      });
      md += `\n`;
    }
    
    if (Array.isArray(data.securityHardening) && data.securityHardening.length > 0) {
      md += `## 🛡️ Security Hardening Checklist\n`;
      md += `| Category | Hardening Rule / Requirement | Concrete Implementation Detail |\n`;
      md += `| :--- | :--- | :--- |\n`;
      data.securityHardening.forEach((item: any) => {
        md += `| **${item.category}** | ${item.requirement} | \`${item.packageOrConfig}\` |\n`;
      });
      md += `\n`;
    }
    
    if (Array.isArray(data.roadmap) && data.roadmap.length > 0) {
      md += `## 🗺️ Modernization Execution Roadmap\n`;
      data.roadmap.forEach((phase: any) => {
        md += `### 📍 ${phase.phase || 'Phase'}: ${phase.title}\n`;
        if (Array.isArray(phase.deliverables) && phase.deliverables.length > 0) {
          phase.deliverables.forEach((del: string) => {
            md += `- [ ] ${del}\n`;
          });
        }
        md += `\n`;
      });
    }
    
    return md;
  } catch (e) {
    return rawJson;
  }
}

export function formatDocsToMarkdown(rawJson: string): string {
  if (!rawJson) return '';
  try {
    const cleanedJson = rawJson.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    const data = JSON.parse(cleanedJson);
    if (!data || typeof data !== 'object') return rawJson;

    let md = `# 📋 Process Blueprint Documentation\n\n`;
    
    if (data.l1_domain) {
      md += `## 🏢 Level 1: Business Domain\n`;
      md += `- **Domain Name:** **${data.l1_domain.name || 'N/A'}**\n`;
      md += `- **Strategic Modernization Goal:** ${data.l1_domain.strategicGoal || 'N/A'}\n`;
      md += `- **Process Executive Owner:** \`${data.l1_domain.owner || 'N/A'}\`\n\n`;
    }
    
    if (data.l2_group) {
      md += `## 📊 Level 2: Process Group & Metrics\n`;
      md += `- **Process Group Name:** **${data.l2_group.name || 'N/A'}**\n`;
      md += `- **Process Area:** \`${data.l2_group.processArea || 'N/A'}\`\n\n`;
      
      if (Array.isArray(data.l2_group.kpis) && data.l2_group.kpis.length > 0) {
        md += `**Target Business KPIs:**\n`;
        data.l2_group.kpis.forEach((kpi: string) => {
          md += `- 📈 ${kpi}\n`;
        });
        md += `\n`;
      }
    }
    
    if (Array.isArray(data.l3_flow) && data.l3_flow.length > 0) {
      md += `## 🔀 Level 3: Logical BPMN Process Flow\n`;
      md += `Below is the logical sequencing of the modernized workflow:\n\n`;
      data.l3_flow.forEach((flow: any) => {
        const typeIcon = flow.type === 'startEvent' ? '🟢' : flow.type === 'endEvent' ? '🔴' : '⚙️';
        const roleLabel = flow.role ? ` (Role: **${flow.role}**)` : '';
        md += `- ${typeIcon} **[${flow.id}] ${flow.name}**${roleLabel}`;
        if (Array.isArray(flow.next) && flow.next.length > 0) {
          md += ` ➔ Triggers: \`${flow.next.join(', ')}\``;
        }
        md += `\n`;
      });
      md += `\n`;
    }
    
    if (Array.isArray(data.l4_tasks) && data.l4_tasks.length > 0) {
      md += `## 🛠️ Level 4: Technical Task Specifications\n`;
      md += `Detailed technical specifications for each business operation block:\n\n`;
      data.l4_tasks.forEach((task: any) => {
        md += `### 🔹 [${task.stepId || 'Task'}] ${task.name}\n`;
        md += `**Functional Description:**\n${task.description || ''}\n\n`;
        
        md += `| Attribute | Specification Details |\n`;
        md += `| :--- | :--- |\n`;
        md += `| **Inputs** | ${Array.isArray(task.inputs) ? task.inputs.join(', ') : (task.inputs || 'None')} |\n`;
        md += `| **Outputs** | ${Array.isArray(task.outputs) ? task.outputs.join(', ') : (task.outputs || 'None')} |\n`;
        md += `| **Systems & Platforms** | ${Array.isArray(task.systems) ? task.systems.map((s: string) => `\`${s}\``).join(', ') : (task.systems || 'None')} |\n`;
        md += `| **Transformation Complexity** | \`${task.complexity || 'Low'}\` |\n`;
        md += `| **Estimated Execution Duration** | ${task.estimatedDuration || 'N/A'} |\n`;
        md += `| **Modern Technical Code Mapping** | \`${task.technicalMapping || 'N/A'}\` |\n\n`;
      });
    }
    
    return md;
  } catch (e) {
    return rawJson;
  }
}

export function formatPresentationToMarkdown(rawJson: string): string {
  if (!rawJson) return '';
  try {
    const cleanedJson = rawJson.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    const data = JSON.parse(cleanedJson);
    if (!data || typeof data !== 'object') return rawJson;

    let md = `# 👔 Executive Summary Slide Deck: ${data.title || 'Project Handover'}\n\n`;
    md += `**Date:** ${data.date || 'N/A'} | **Author:** ${data.author || 'Clean-Core Transformation Engine'}\n\n`;
    md += `---\n\n`;
    
    if (Array.isArray(data.slides)) {
      data.slides.forEach((slide: any, idx: number) => {
        md += `## 🛝 Slide ${idx + 1}: ${slide.title || 'Untitled Slide'}\n`;
        if (slide.subtitle) {
          md += `### *${slide.subtitle}*\n\n`;
        }
        
        if (slide.type === 'quote') {
          md += `> "${slide.quote || ''}"\n`;
          if (slide.author) {
            md += `> — **${slide.author}**\n`;
          }
          md += `\n`;
        } else if (slide.type === 'split') {
          md += `### 📊 Technical Context & Metrics\n\n`;
          md += `| 🧪 Sandbox & Testing Metrics | ⚙️ Platform Service Bindings |\n`;
          md += `| :--- | :--- |\n`;
          md += `| ${slide.leftContent || 'N/A'} | ${slide.rightContent || 'N/A'} |\n\n`;
        } else {
          // Standard bullets/text slide
          if (Array.isArray(slide.content)) {
            slide.content.forEach((bullet: string) => {
              md += `- 📝 ${bullet}\n`;
            });
          } else if (slide.content) {
            md += `${slide.content}\n`;
          }
          md += `\n`;
        }
        
        if (slide.speakerNotes) {
          md += `#### 🗣️ Presenter Talking Points\n`;
          md += `*${slide.speakerNotes}*\n\n`;
        }
        
        md += `---\n\n`;
      });
    }
    
    return md;
  } catch (e) {
    return rawJson;
  }
}
