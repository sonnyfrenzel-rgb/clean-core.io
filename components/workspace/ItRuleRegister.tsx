'use client';

import React from 'react';
import type { SourceReading } from '@/lib/first-look';
import type { Project } from '@/lib/types';
import BusinessRulesEditor, { BUSINESS_RULES_ID } from './BusinessRulesEditor';
import { wt } from '@/lib/workspace-messages';

/**
 * The full rule register in the IT view (owner decision 21.10.2026, the new
 * set-up of the business rules): every rule, grouped by basket — the business
 * rules by topic, then the technical rules with their one click "Technical
 * rules stay as coded", then the undetermined ones with why — each explained
 * with its lines and code — and, under them, the architecture options for IT
 * (configuration or SAP standard for a value the business answered), which
 * left Design by owner decision 22.10.2026. The Business view shows one
 * sentence instead and Design asks the questions.
 *
 * The reading is the page's own (`useSourceReading` in the shell: IT draws no
 * first look). Keeps the address `#business-rules` every earlier link to the
 * rules used.
 */
export default function ItRuleRegister({ project, projectId, reading }: { project: Project | null; projectId: string; reading: SourceReading | null }) {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  if (!source.trim()) return null;
  if (reading && reading.ruleSet.rules.length === 0) return null;
  return (
    <section id={BUSINESS_RULES_ID} data-it-rules="" aria-label={wt('rules.title')} className="scroll-mt-28">
      <BusinessRulesEditor project={project} projectId={projectId} reading={reading} withArchitectureOptions={true} />
    </section>
  );
}
