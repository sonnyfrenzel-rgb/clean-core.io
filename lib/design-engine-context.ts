import { anchorList, type RequirementSet } from '@/lib/functional-requirements';
import type { ArchitectureContract } from '@/lib/architecture-contract';
import type { ItFindingRow } from '@/lib/it-findings';
import { routeDrivers, type KeyUserRouteBasis } from '@/lib/abap/extensibility-router';
import { engineOptionFacts } from '@/lib/design-option-comparison';

/**
 * What the solution-design prompt is given from the signed engine evidence —
 * (coordinator decision 03.10.2026).
 *
 * An engine-only signed run stores no model narrative (`analysis: ''`), and
 * the design used to be written from that narrative alone: with none, the
 * stage could write nothing and Transformation stopped behind it. The engine
 * evidence is enough to design from, and it is the better source anyway:
 *
 *   - the route the architecture contract recommends and the one it chose
 *     (`/api/projects/{id}/contract`);
 *   - the process steps, business rules, decisions and early ends with their
 *     lines, as the functional requirements state them
 *     (`lib/functional-requirements.ts`, read from the signed source);
 *   - the SAP objects with their use, clean core level and named successor
 *     (`/api/projects/{id}/findings`);
 *   - what the code cannot determine, so the model does not decide it.
 *
 * A narrative, where the run has one, is handed in beside this, not instead.
 * The design stays AI-generated either way. Pure; capped, so a large
 * program cannot crowd out the prompt's own instructions.
 */

export const ENGINE_CONTEXT_LIMIT = 14_000;

export interface EngineDesignInput {
  requirements: RequirementSet | null;
  contract: ArchitectureContract | null;
  findings: readonly ItFindingRow[];
  /**
   * The project's deployment and the signed run's engine version, for the
   * option comparison's facts (roadmap 3.0.12, F14): which constructs drive a
   * split is the router's rule for that deployment and engine. Absent, the
   * facts say the deployment is not bound and name no driver.
   */
  deployment?: 'public' | 'private' | null;
  engineVersion?: string | null;
  /**
   * The route report's key-user reading (`ExtensibilityRouteReport.keyUser`,
   * engine 3.0.19 on) for the key-user option's facts. Absent: the facts say
   * it was not read here.
   */
  keyUser?: KeyUserRouteBasis | null;
}

export function engineDesignContext({ requirements, contract, findings, deployment = null, engineVersion = null, keyUser = null }: EngineDesignInput): string {
  const context: Record<string, unknown> = {
    note: 'Read from the ABAP source of the signed run by the deterministic engine. Line numbers refer to that source. Do not contradict it; do not invent what it lists as not determined.',
  };
  if (contract) {
    context.route = {
      recommended: contract.route.recommended,
      chosen: contract.route.chosen,
      deviationDeclared: Boolean(contract.route.deviation),
      summary: contract.summary,
    };
  }
  // The facts the standard, RAP and CAP are compared on — before the design
  // rules the standard out (CO review F14, F15). Second in the object, so
  // the final cut below reaches them last; the lists are trimmed first.
  context.optionFacts = engineOptionFacts({
    recommended: contract ? contract.route.recommended : null,
    drivers: deployment ? routeDrivers({ findings: [...findings] }, deployment, engineVersion) : [],
    findings,
    requirements: requirements ? { total: requirements.counts.total, open: requirements.counts.open } : null,
    deployment,
    keyUser,
  });
  if (requirements) {
    context.program = requirements.program;
    context.processSteps = requirements.steps
      .filter((s) => s.requirementIds.length || s.objects.length)
      .map((s) => `${s.number}. ${s.label} (${s.routine}${s.anchor ? `, ${anchorList([s.anchor])}` : ''})`);
    context.requirements = requirements.requirements.map((r) => `${r.id} [${r.priority}] ${r.statement} (${anchorList(r.anchors)})`);
    context.notDetermined = requirements.open.map((o) => o.question);
  }
  const seen = new Set<string>();
  context.sapObjects = findings
    .filter((f) => f.objectName && !seen.has(f.objectName) && seen.add(f.objectName))
    .slice(0, 40)
    .map((f) => ({
      object: f.objectName,
      type: f.objectType,
      level: f.level,
      finding: f.kindLabel ?? f.kind,
      successor: f.successor,
      line: f.lineStart,
    }));
  let text = JSON.stringify(context);
  if (text.length > ENGINE_CONTEXT_LIMIT) {
    // Drop from the end of the longest lists first; the route and the steps stay.
    const trim = (key: string, keep: number) => {
      const list = context[key];
      if (Array.isArray(list) && list.length > keep) context[key] = [...list.slice(0, keep), `… ${list.length - keep} more`];
    };
    for (const [key, keep] of [['sapObjects', 20], ['requirements', 40], ['notDetermined', 8], ['requirements', 20], ['sapObjects', 10]] as const) {
      trim(key, keep);
      text = JSON.stringify(context);
      if (text.length <= ENGINE_CONTEXT_LIMIT) break;
    }
    if (text.length > ENGINE_CONTEXT_LIMIT) text = `${text.slice(0, ENGINE_CONTEXT_LIMIT)}\n... [engine evidence truncated]`;
  }
  return text;
}
