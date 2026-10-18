import { readStoredAnalysis, withoutUnapprovedMoney } from './money-honesty';
import { sapApiHubUrl } from './export-safety';
import {
  LEGACY_BLUEPRINT_NOTICE,
  processDocumentationToMarkdown,
  readStoredDocumentation,
} from './process-documentation';
import { readModelGaps, gapsUnreadableSentence } from './model-gaps';
import { businessSopMarkdown } from './business-sop-markdown';
import { BTP, BTP_FIRST, sapNamesForDisplay } from './sap-naming';
import {
  COVERAGE_CLAIM_NOTE,
  annotateSapReferences as checked,
  catalogNoteForMapping,
  coverageClaims,
  sapCheckedNarrative,
  sapReferenceAppendixMarkdown,
} from './sap-reference-check';
import { checkModelLineRefs, engineLineAnchors } from './abap/narrative-anchors';
import {
  CERTIFIED_SNAPSHOT_NOTE,
  CUSTOM_ENTITY_AUTH_NOTE,
  DESIGN_ROUTE_WORDS,
  MVCC_REFUSAL,
  RAP_VARIANT_WORDS,
  annotateSapReferencesCompact,
  postCheckDesign,
  prePostingDecisionWords,
} from './design-post-checks';

/** What the exports of model text may be given beside it. */
export interface ModelTextExportOptions {
  /** The analysed ABAP source: the model's raw line references are checked against the engine's anchors of it. */
  code?: string | null;
  /**
   * The paths of the generated package, when one is at hand (the delivery ZIP): the design's list of
   * delivered objects is read from them instead of from the source (3.0.18 item 13, QM-07 / FI-F02).
   */
  packageFiles?: readonly string[] | null;
}

/**
 * The model's raw line references in an export, held against the engine's
 * anchors of the source (SD review CC-R32, 12.10.2026: "L24–L31" for lines
 * 4–13). A reference that disagrees is dropped, and so is every one when no
 * source is at hand — and the document says how many went.
 */
function withCheckedLineRefs(md: string, options?: ModelTextExportOptions): string {
  const index = typeof options?.code === 'string' && options.code ? engineLineAnchors(options.code) : null;
  const { text, dropped } = checkModelLineRefs(md, index);
  if (!dropped.length) return text;
  const why = index
    ? "they do not agree with the engine's line anchors of the source"
    : 'no source was at hand to check them against';
  return `${text.replace(/\s+$/, '')}

> ${dropped.length} line reference${dropped.length === 1 ? '' : 's'} the model wrote ${dropped.length === 1 ? 'was' : 'were'} dropped: ${why}. Finding ids ([CC-…]) and the engine's own anchors are unaffected.
`;
}

/**
 * Professional Markdown Formatting Engine
 * Synthesizes raw structured JSON data fields from GCP Gemini AI 
 * into beautifully readable, corporate-grade executive reports.
 */

export function formatAnalysisToMarkdown(rawJson: string, options?: ModelTextExportOptions): string {
  if (!rawJson) return '';
  try {
    // The shared reader of a stored analysis: code fences stripped, amounts of money masked (lib/money-honesty.ts).
    // Typed like JSON.parse, which it replaces: the fields below are read defensively one by one.
    const data: ReturnType<typeof JSON.parse> = readStoredAnalysis(rawJson);
    if (!data) return withoutUnapprovedMoney(rawJson);

    let md = `# Business Analysis Report: ${data.projectTitle || 'ABAP Modernization'}\n\n`;
    // One name for the score everywhere: the Clean Core Score, a grade, never named after compliance (CO review F17, 12.10.2026).
    md += `## Clean Core Score\n`;
    // A missing score is not computed, never 0 (CO review F17, 12.10.2026).
    const score = typeof data.cleanCoreScore === 'number' && Number.isFinite(data.cleanCoreScore) ? data.cleanCoreScore : null;
    md += score === null
      ? `**Clean Core Score:** not computed\n\n`
      : `**Clean Core Score:** \`${score} / 100\` (a grade, not a compliance percentage)\n\n`;
    md += `> **Executive Summary:** ${checked(data.summary || '')}\n\n`;

    md += `## As-Is Process & Legacy Context\n`;
    md += `${checked(data.asIsContext || 'No context available.')}\n\n`;

    if (data.standardFit) {
      // The fit is the model's word. SAP identifiers in it are checked, and a
      // claim of full coverage is said to be unbacked (external review F-03/F-09).
      md += `## Target Standard Process & SAP Fit\n`;
      md += `> Model proposal. SAP identifiers below are checked against SAP data this product holds.\n\n`;
      md += `- **Fit Potential (model's estimate, not a measured fit):** ${data.standardFit.potential || 'N/A'}\n`;
      // 3.0.18 item 13 (QM-08, FI-F12): a sentence whose SAP ID contradicts SAP's data is dropped, SAP's title shown.
      md += `- **Target Standard Process:** \`${sapCheckedNarrative(data.standardFit.targetStandardProcess || 'N/A')}\`\n`;
      md += `- **Technical Rationale:** ${sapCheckedNarrative(data.standardFit.rationale || 'N/A')}\n`;
      if (data.standardFit.potential === 'High' || coverageClaims(`${data.standardFit.rationale ?? ''} ${data.recommendations?.cloudReadiness ?? ''}`).length) {
        md += `- **Note:** ${COVERAGE_CLAIM_NOTE}\n`;
      }
      md += `\n`;
    }
    
    // A single object is one gap; any other shape is said, not left out (lib/model-gaps.ts).
    const gapsReading = readModelGaps(data.gaps);
    if (gapsReading.gaps.length > 0 || gapsReading.unreadable) {
      md += `## Functional Gaps & Extensibility Strategies\n`;
      if (gapsReading.gaps.length > 0) {
        md += `The following customization gaps have been identified compared to the standard S/4HANA core:\n\n`;
        md += `| Gap / Capability | Severity | Complexity | Recommended Extensibility Strategy | Technical Rationale |\n`;
        md += `| :--- | :---: | :---: | :--- | :--- |\n`;
        gapsReading.gaps.forEach((g) => {
          md += `| **${checked(g.title || 'Untitled Gap')}** | \`${g.severity || 'Medium'}\` | \`${g.complexity || 'Medium'}\` | **${checked(g.strategy || 'Side-by-Side')}** | ${checked(g.rationale || '')} |\n`;
        });
        md += `\n`;
      }
      if (gapsReading.unreadable) {
        md += `> ${gapsUnreadableSentence(gapsReading.unreadable)}\n\n`;
      }
    }
    
    if (data.recommendations) {
      md += `## Clean Core Architecture Recommendations\n`;
      md += `- **Keep Core Clean Strategy:** ${checked(data.recommendations.keepCoreClean || 'N/A')}\n`;
      md += `- **Decommissioning / Deactivation Strategy:** ${checked(data.recommendations.decommissioning || 'N/A')}\n`;
      md += `- **Transformed Cloud Readiness:** ${checked(data.recommendations.cloudReadiness || 'N/A')}\n\n`;
    }

    if (Array.isArray(data.strategicNextSteps) && data.strategicNextSteps.length > 0) {
      md += `## Architectural Next Steps\n`;
      data.strategicNextSteps.forEach((step: string, idx: number) => {
        md += `${idx + 1}. **${checked(step)}**\n`;
      });
      md += `\n`;
    }

    // Every SAP identifier of the report, with its state and SAP source (external review F-03).
    md += sapReferenceAppendixMarkdown(
      data.summary, data.asIsContext, data.standardFit?.targetStandardProcess, data.standardFit?.rationale,
      ...gapsReading.gaps.flatMap((g) => [g.title, g.strategy, g.rationale]),
      data.recommendations?.keepCoreClean, data.recommendations?.decommissioning, data.recommendations?.cloudReadiness,
      ...(Array.isArray(data.strategicNextSteps) ? data.strategicNextSteps : []),
    );

    return withCheckedLineRefs(md, options);
  } catch (e) {
    return withoutUnapprovedMoney(rawJson);
  }
}

export function formatDesignToMarkdown(rawJson: string, options?: ModelTextExportOptions): string {
  if (!rawJson) return '';
  try {
    const cleanedJson = rawJson.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    const parsed = JSON.parse(cleanedJson);
    if (!parsed || typeof parsed !== 'object') return rawJson;
    // 3.0.13 (SD review CR-D7, A03, A04, 2.5): the route's own words, the scaffold's object names,
    // no consistency promise from MVCC, short SAP marks — `lib/design-post-checks.ts`.
    const post = postCheckDesign(parsed, options?.code ?? null, options?.packageFiles ?? null);
    const data = post.design;
    const rap = post.route === 'rap';
    const words = DESIGN_ROUTE_WORDS[post.route];
    // In a design the evidence sentence of a catalog or verified name goes to the identifier table, not into the sentence.
    const checked = annotateSapReferencesCompact;

    let md = `# Target Architecture Blueprint: ${data.projectName || 'Transformed Cloud Service'}\n\n`;

    if (data.architectureOverview) {
      md += `## Architecture Overview\n`;
      md += `${checked(data.architectureOverview.approachDescription || '')}\n\n`;
      md += `- **${words.framework}:** \`${data.architectureOverview.nodeFramework || (rap ? 'SAP RAP' : 'Express')}\`\n`;
      md += `- **Recommended Runtime Platform:** \`${data.architectureOverview.runtimePlatform ? sapNamesForDisplay(data.architectureOverview.runtimePlatform) : BTP_FIRST}\`\n\n`;
    }
    
    if (data.nodeAppBlueprint) {
      md += `## Transformed Folder Structure & Artifacts\n`;
      md += `${words.layoutLead}\n\n`;
      if (rap && post.program) {
        const renamed = post.renamed.length ? ` Renamed from the model's proposal: ${post.renamed.map((r) => `\`${r.from}\` → \`${r.to}\``).join(', ')}.` : '';
        const beyond = post.beyond.length ? ` Not in the package (a proposal beyond it): ${post.beyond.map((b) => `\`${b}\``).join(', ')}.` : '';
        md += `> Object names as the engine's RAP scaffold generates them for ${post.program} — the names the delivered package carries.${renamed}${beyond}\n\n`;
        // 3.0.18 item 13 (QM-07, FI-F02): what the package delivers, from its files (or the scaffold's reading of the source).
        if (post.delivered && post.delivered.objects.length) {
          const from = post.delivered.basis === 'package' ? "read from the package's files" : 'as the scaffold writes them for this source';
          const variant = post.delivered.variant ? ` The package is ${RAP_VARIANT_WORDS[post.delivered.variant]}.` : '';
          md += `> Delivered objects (${from}): ${post.delivered.objects.map((o) => `\`${o.name}\` (${o.type.toUpperCase()})`).join(', ')}.${variant}\n\n`;
        }
        if (post.delivered?.variant === 'custom-entity') md += `> ${CUSTOM_ENTITY_AUTH_NOTE}\n\n`;
      } else if (rap) {
        md += `> Object names are the model's proposal: no source was at hand to derive the names the engine's RAP scaffold generates.\n\n`;
      }
      md += `| File/Folder Path | Purpose & Content |\n`;
      md += `| :--- | :--- |\n`;
      if (Array.isArray(data.nodeAppBlueprint.projectStructure)) {
        data.nodeAppBlueprint.projectStructure.forEach((item: any) => {
          md += `| \`${item.path}\` | ${item.purpose} |\n`;
        });
      }
      md += `\n`;
      
      md += `## Modernized REST/OData API Method Catalog\n`;
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
      md += rap ? `## Released Services & Extension Points\n` : `## ${BTP} & Native Cloud Services Integration\n`;
      data.cloudServices.forEach((service: any) => {
        md += `### ${checked(service.serviceName)}\n`;
        md += `**Purpose in Project:** ${checked(service.purpose)}\n\n`;
        if (!rap && Array.isArray(service.npmPackages) && service.npmPackages.length > 0) {
          md += `**Required Node.js SDK Packages:** ${service.npmPackages.map((pkg: string) => `\`${checked(pkg)}\``).join(', ')}\n\n`;
        }
      });
    }
    
    if (data.dataSync) {
      md += `## Data Synchronization & Integration Pattern\n`;
      md += `### **Pattern:** \`${data.dataSync.patternName || 'Event-Driven'}\`\n`;
      md += `${checked(data.dataSync.description || '')}\n\n`;
    }
    if (post.mvccRefused.length || post.twoCutoffs) {
      if (!data.dataSync) md += `## Data Synchronization & Integration Pattern\n`;
      if (post.mvccRefused.length) md += `> ${MVCC_REFUSAL}\n\n`;
      if (post.twoCutoffs) md += `> ${CERTIFIED_SNAPSHOT_NOTE} (Read from the names of the program's selection parameters.)\n\n`;
    }
    // 3.0.18 item 13 (FI-F01): where the original posts, one binding pre-posting check point, every channel through it.
    if (post.prePosting) {
      md += `## Architecture Decision: Binding Pre-Posting Check Point\n`;
      for (const line of prePostingDecisionWords(post.prePosting)) md += `${line}\n\n`;
      md += `| Channel | Reaches the posting through |\n`;
      md += `| :--- | :--- |\n`;
      for (const c of post.prePosting.channels) md += `| ${c.channel} | ${c.reaches} |\n`;
      md += `\n> Read by the engine from the source: the posting calls and the original's own check before them — not the model's proposal.\n\n`;
    }
    
    if (Array.isArray(data.sapStandardApiMapping) && data.sapStandardApiMapping.length > 0) {
      md += `## SAP Business Accelerator Hub Mappings\n`;
      md += `Model proposal: the released SAP APIs the model names in place of direct database access. Every identifier is checked against SAP data this product holds; a verified ID is SAP's, not a proof that it covers this use, and “name found in catalog” means the name is in a list and nothing more.\n\n`;
      md += `| Legacy Object | Proposed SAP API | Business Accelerator Hub ID | Integration Role / Context | Link |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      data.sapStandardApiMapping.forEach((map: any) => {
        const note = catalogNoteForMapping(map.legacyTableOrFunction, map.sapStandardApiName, map.apiId);
        md += `| \`${map.legacyTableOrFunction}\` | **${checked(map.sapStandardApiName)}** | \`${checked(map.apiId)}\` | ${checked(map.description)}${note ? ` ${note}` : ''} | ${sapApiHubUrl(map.apiHubUrl) ? `[API Hub Reference](${sapApiHubUrl(map.apiHubUrl)})` : 'no API Hub link'} |\n`;
      });
      md += `\n`;
    }
    
    if (Array.isArray(data.securityHardening) && data.securityHardening.length > 0) {
      md += `## Security Hardening Checklist\n`;
      md += `| Category | Hardening Rule / Requirement | Concrete Implementation Detail |\n`;
      md += `| :--- | :--- | :--- |\n`;
      data.securityHardening.forEach((item: any) => {
        md += `| **${item.category}** | ${item.requirement} | \`${item.packageOrConfig}\` |\n`;
      });
      md += `\n`;
    }
    if (post.dclRefused.length) {
      if (!(Array.isArray(data.securityHardening) && data.securityHardening.length > 0)) md += `## Security Hardening Checklist\n`;
      md += `> Refused — CDS access control proposed for a custom entity: ${post.dclRefused.map((r) => `“${r}”`).join('; ')}. ${CUSTOM_ENTITY_AUTH_NOTE}\n\n`;
    }
    
    if (Array.isArray(data.roadmap) && data.roadmap.length > 0) {
      md += `## Modernization Execution Roadmap\n`;
      data.roadmap.forEach((phase: any) => {
        md += `### ${phase.phase || 'Phase'}: ${phase.title}\n`;
        if (Array.isArray(phase.deliverables) && phase.deliverables.length > 0) {
          phase.deliverables.forEach((del: string) => {
            md += `- [ ] ${del}\n`;
          });
        }
        md += `\n`;
      });
    }

    const npmOnRap = rap && Array.isArray(data.cloudServices) && data.cloudServices.some((sv: { npmPackages?: unknown } | null) => Array.isArray(sv?.npmPackages) && sv.npmPackages.length > 0);
    if (rap && (post.remnants.length || npmOnRap)) {
      md += `## Template text refused\n`;
      md += `This design is for the in-app route (ABAP Cloud, RAP). Side-by-side wording the model wrote into it does not apply to the package`;
      md += post.remnants.length ? `: ${post.remnants.map((r) => `\`${r}\``).join('; ')}.` : '.';
      md += npmOnRap ? ` The npm packages the model listed are left out.\n\n` : `\n\n`;
    }

    // Every SAP identifier of the design, with its state and SAP source (external review F-03).
    md += sapReferenceAppendixMarkdown(
      data.architectureOverview?.approachDescription, data.dataSync?.description,
      ...(Array.isArray(data.cloudServices)
        ? data.cloudServices.flatMap((sv: any) => [sv?.serviceName, sv?.purpose, ...(Array.isArray(sv?.npmPackages) ? sv.npmPackages : [])])
        : []),
      ...(Array.isArray(data.sapStandardApiMapping) ? data.sapStandardApiMapping.flatMap((m: any) => [m?.sapStandardApiName, m?.apiId, m?.description]) : []),
    );

    return withCheckedLineRefs(md, options);
  } catch (e) {
    return rawJson;
  }
}

/**
 * `project.documentation` as Markdown, whichever form is stored — roadmap 3.0.5.
 *
 * The engine document (`lib/process-documentation.ts`) renders itself. A
 * blueprint a language model wrote before 3.0.5 is rendered as it always was,
 * under the notice that says what it is; nothing is migrated. This is what the
 * delivery bundle's documentation file (`process-documentation.md`) and the
 * dashboard export read.
 */
export function formatDocumentationToMarkdown(raw: string | undefined | null): string {
  const stored = readStoredDocumentation(raw);
  if (stored.kind === 'none') return '';
  if (stored.kind === 'engine') return processDocumentationToMarkdown(stored.doc);
  if (stored.kind === 'engine-invalid') {
    return `# Process documentation\n\nA process documentation is stored for this project, but it is not in a shape this build can read. `
      + `Read it again from the code in the documentation stage.\n`;
  }
  return `> ${LEGACY_BLUEPRINT_NOTICE}\n\n${formatDocsToMarkdown(stored.raw)}`;
}

/** The legacy L1–L4 blueprint. Kept for projects that stored one before 3.0.5. */
export function formatDocsToMarkdown(rawJson: string): string {
  if (!rawJson) return '';
  try {
    const cleanedJson = rawJson.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    const data = JSON.parse(cleanedJson);
    if (!data || typeof data !== 'object') return rawJson;

    let md = `# Process documentation\n\n`;
    
    if (data.l1_domain) {
      md += `## Level 1: Business Domain\n`;
      md += `- **Domain Name:** **${data.l1_domain.name || 'N/A'}**\n`;
      md += `- **Strategic Modernization Goal:** ${data.l1_domain.strategicGoal || 'N/A'}\n`;
      md += `- **Process Executive Owner:** \`${data.l1_domain.owner || 'N/A'}\`\n\n`;
    }
    
    if (data.l2_group) {
      md += `## Level 2: Process Group & Metrics\n`;
      md += `- **Process Group Name:** **${data.l2_group.name || 'N/A'}**\n`;
      md += `- **Process Area:** \`${data.l2_group.processArea || 'N/A'}\`\n\n`;
      
      if (Array.isArray(data.l2_group.kpis) && data.l2_group.kpis.length > 0) {
        md += `**Target Business KPIs:**\n`;
        data.l2_group.kpis.forEach((kpi: string) => {
          md += `- ${kpi}\n`;
        });
        md += `\n`;
      }
    }
    
    if (Array.isArray(data.l3_flow) && data.l3_flow.length > 0) {
      md += `## Level 3: Logical BPMN Process Flow\n`;
      md += `Below is the logical sequencing of the modernized workflow:\n\n`;
      data.l3_flow.forEach((flow: any) => {
        const typeWord = flow.type === 'startEvent' ? 'Start:' : flow.type === 'endEvent' ? 'End:' : 'Task:';
        const roleLabel = flow.role ? ` (Role: **${flow.role}**)` : '';
        md += `- ${typeWord} **[${flow.id}] ${flow.name}**${roleLabel}`;
        if (Array.isArray(flow.next) && flow.next.length > 0) {
          md += ` Triggers: \`${flow.next.join(', ')}\``;
        }
        md += `\n`;
      });
      md += `\n`;
    }
    
    if (Array.isArray(data.l4_tasks) && data.l4_tasks.length > 0) {
      md += `## Level 4: Technical Task Specifications\n`;
      md += `Detailed technical specifications for each business operation block:\n\n`;
      data.l4_tasks.forEach((task: any) => {
        md += `### [${task.stepId || 'Task'}] ${task.name}\n`;
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

    let md = `# Executive Summary Slide Deck: ${data.title || 'Project Handover'}\n\n`;
    md += `**Date:** ${data.date || 'N/A'} | **Author:** ${data.author || 'Clean-Core Transformation Engine'}\n\n`;
    md += `---\n\n`;
    
    if (Array.isArray(data.slides)) {
      data.slides.forEach((slide: any, idx: number) => {
        md += `## Slide ${idx + 1}: ${slide.title || 'Untitled Slide'}\n`;
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
          md += `### Technical Context & Metrics\n\n`;
          md += `| Sandbox & Testing Metrics | Platform Service Bindings |\n`;
          md += `| :--- | :--- |\n`;
          md += `| ${slide.leftContent || 'N/A'} | ${slide.rightContent || 'N/A'} |\n\n`;
        } else {
          // Standard bullets/text slide
          if (Array.isArray(slide.content)) {
            slide.content.forEach((bullet: string) => {
              md += `- ${bullet}\n`;
            });
          } else if (slide.content) {
            md += `${slide.content}\n`;
          }
          md += `\n`;
        }
        
        if (slide.speakerNotes) {
          md += `#### Presenter Talking Points\n`;
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

/**
 * The business SOP and RACI as the delivery package's `business-documentation.md`.
 * Owner 11.10.2026 (external review F-06/F-07): steps by their business name,
 * every sentence with its basis, organisational elements as a proposal not in
 * the program — `lib/business-sop-markdown.ts`. `documentation`, when given, is
 * the stored process documentation, for the names and order of a layer stored
 * before its rows carried them.
 */
export function formatBusinessDocsToMarkdown(rawJson: string, documentation?: string | null): string {
  return businessSopMarkdown(rawJson, documentation ?? null);
}
