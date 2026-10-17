/**
 * SAP reference pattern for the target — roadmap 3.0.9, ADR-089.
 *
 * Server-free. Holds four things:
 *   1. every RA the hand-curated mapping names exists in the synced metadata
 *      (`lib/generated/sap-architecture-center.json`, written by
 *      `scripts/sync-sap-architecture-center.ts`) with the same slug, title,
 *      last update and archive state — a moved, retitled or archived RA fails
 *      here and is reviewed by hand, not missed;
 *   2. every target code and every building block has an entry, `none` included,
 *      and a `none` names no RA while every other fit names one;
 *   3. the layer reads the target and changes nothing before it: the router,
 *      the route drivers and the score do not import it, and no model prompt
 *      or route handler does either;
 *   4. the wording — "SAP reference pattern for the target", never SAP-approved,
 *      certified, validated or compliant near an RA reference (text guard).
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { TARGET_ARCHITECTURES } from '../lib/project-commands';
import { cloudServiceDetails } from '../components/design/CloudServiceIntegrations';
import { CLOUD_SERVICE_KEYS, getCloudServiceKey } from '../lib/cloud-service-key';
import {
  ARCHITECTURE_CENTER_SOURCE,
  ARCHIVED_DELIVERY,
  ARCHIVED_ONLY,
  DELIVERY_REFERENCE_OF_TARGET,
  RA0001_ABAP_QUOTE,
  REFERENCE_LINE_LEAD,
  REFERENCE_OF_SERVICE,
  REFERENCE_OF_TARGET,
  REFERENCE_WORDING,
  RFC_DRIVER_REFERENCE,
  SAP_REFERENCE_ARCHITECTURES,
  VERIFIED_AT,
  eventSourceSentence,
  raUrl,
  referenceAnswer,
  referencePatternLine,
  referencePatternsReadme,
  type ReferenceBinding,
} from '../lib/sap-reference-architectures';
import { isUpdate } from '../scripts/sync-sap-architecture-center';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

interface Synced {
  commit: string;
  architectures: { id: string; slug: string; title: string; lastUpdate: string | null; archived: boolean }[];
}
const SYNCED = JSON.parse(read('lib/generated/sap-architecture-center.json')) as Synced;

const allBindings = (): ReferenceBinding[] => [
  ...Object.values(REFERENCE_OF_TARGET).flat(),
  ...Object.values(REFERENCE_OF_SERVICE).flat(),
  ...Object.values(DELIVERY_REFERENCE_OF_TARGET).filter((b): b is ReferenceBinding => Boolean(b)),
  RFC_DRIVER_REFERENCE,
];

test.describe('every RA the mapping names exists, as SAP publishes it', () => {
  test('the synced metadata is the Architecture Center, RA0001 onwards', () => {
    expect(SYNCED.architectures.length).toBeGreaterThanOrEqual(34);
    expect(SYNCED.architectures.map((a) => a.id)).toContain('RA0001');
    expect(SYNCED.architectures.map((a) => a.id), 'RA0000 is the repository’s demo page').not.toContain('RA0000');
  });

  test('a sync writes only when the metadata changed, not for a new commit or date alone', () => {
    const same = SYNCED.architectures.map((a) => ({ ...a }));
    expect(isUpdate({ ...SYNCED, commit: 'f'.repeat(40), syncedAt: '2099-01-01' } as Parameters<typeof isUpdate>[0], same)).toBe(false);
    expect(isUpdate(SYNCED as Parameters<typeof isUpdate>[0], same.map((a, i) => (i === 0 ? { ...a, archived: !a.archived } : a)))).toBe(true);
    expect(isUpdate(SYNCED as Parameters<typeof isUpdate>[0], same.slice(1))).toBe(true);
    expect(isUpdate(null, same)).toBe(true);
    // And the sync asks it before it writes: the only write of main() comes after the isUpdate return.
    const src = read('scripts/sync-sap-architecture-center.ts');
    const main = src.slice(src.indexOf('async function main()'));
    expect(main.match(/writeFileSync\(/g), 'main() writes exactly once').toHaveLength(1);
    expect(main.indexOf('if (!isUpdate(before, architectures))'), 'main() asks isUpdate').toBeGreaterThan(-1);
    expect(main.indexOf('if (!isUpdate(before, architectures))')).toBeLessThan(main.indexOf('writeFileSync('));
  });

  test('the bindings name the commit they were checked against — the synced one', () => {
    expect(ARCHITECTURE_CENTER_SOURCE.commit, 'a new sync was not reviewed: check the bindings, then move the commit and VERIFIED_AT').toBe(SYNCED.commit);
  });

  test('each RA of the mapping is in the synced metadata with the same slug, title, date and archive state', () => {
    const synced = new Map(SYNCED.architectures.map((a) => [a.id, a]));
    for (const ra of Object.values(SAP_REFERENCE_ARCHITECTURES)) {
      const s = synced.get(ra.id);
      expect(s, `${ra.id} is not in the Architecture Center — never invent an RA`).toBeDefined();
      expect(ra.slug, `${ra.id} slug`).toBe(s!.slug);
      expect(ra.title, `${ra.id} title`).toBe(s!.title);
      expect(ra.lastUpdate, `${ra.id} last update`).toBe(s!.lastUpdate);
      expect(ra.archived, `${ra.id} archive state — SAP archived or restored it; review the binding`).toBe(s!.archived);
    }
  });

  test('no binding ever points at an RA SAP has archived (owner decision 10.10.2026)', () => {
    const synced = new Map(SYNCED.architectures.map((a) => [a.id, a]));
    const archived = allBindings().filter((b) => b.ra !== null && synced.get(b.ra)?.archived !== false);
    expect(archived.map((b) => b.ra), 'an archived (or unknown) RA is named — drop it and say none openly').toEqual([]);
    for (const ra of Object.values(SAP_REFERENCE_ARCHITECTURES)) expect(ra.archived, ra.id).toBe(false);
    // The synced metadata keeps the archive state: the RAs SAP archived on 09.10.2026 are recorded as such.
    // RA0023, the delivery pattern, followed (found by the sync of 17.10.2026).
    for (const id of ['RA0006', 'RA0007', 'RA0018', 'RA0019', 'RA0021', 'RA0022', 'RA0023', 'RA0025']) {
      expect(synced.get(id)?.archived, `${id} archive state in the synced metadata`).toBe(true);
    }
  });

  test('every binding names a known RA, and its link is the RA’s slug on SAP’s site', () => {
    for (const b of allBindings()) {
      if (b.ra) {
        expect(SAP_REFERENCE_ARCHITECTURES[b.ra]).toBeDefined();
        expect(raUrl(b.ra)).toBe(`https://architecture.learning.sap.com/docs/ref-arch/${SAP_REFERENCE_ARCHITECTURES[b.ra].slug}`);
      }
      expect(b.verifiedAt).toBe(VERIFIED_AT);
      expect(b.why.trim().length).toBeGreaterThan(20);
    }
  });

  test('the pins of the roadmap row, as decided — current RAs only', () => {
    // Roadmap 3.0.9 as amended by the owner on 10.10.2026: only current RAs;
    // where only archived ones fitted, none with the open reason.
    const of = (bs: readonly ReferenceBinding[]) => bs.map((b) => `${b.ra ?? '-'}:${b.fit}`);
    expect(of(REFERENCE_OF_TARGET.event)).toEqual(['RA0001:direct']);
    expect(of(REFERENCE_OF_SERVICE.eventmesh)).toEqual(['RA0001:direct']);
    for (const code of ['rap', 'keep', 'retire', 'standard', 'cap', 'integration'] as const) {
      expect(of(REFERENCE_OF_TARGET[code]), code).toEqual(['-:none']);
    }
    for (const code of ['cap', 'integration'] as const) expect(REFERENCE_OF_TARGET[code][0].why).toBe(ARCHIVED_ONLY);
    for (const key of ['xsuaa', 'iamRoles', 'destination'] as const) {
      expect(of(REFERENCE_OF_SERVICE[key]), key).toEqual(['-:none']);
      expect(REFERENCE_OF_SERVICE[key][0].why).toBe(ARCHIVED_ONLY);
    }
    expect(ARCHIVED_ONLY).toBe('No current SAP reference pattern — the ones that fitted were archived by SAP on 09.10.2026.');
    // RFC: no RA describes replacing it, and the nearest (RA0022) is archived.
    expect(`${RFC_DRIVER_REFERENCE.ra}:${RFC_DRIVER_REFERENCE.fit}`).toBe('null:none');
    // Delivery was RA0023 until SAP archived it: none, said openly.
    for (const code of ['cap', 'integration', 'event'] as const) {
      expect(`${DELIVERY_REFERENCE_OF_TARGET[code]?.ra}:${DELIVERY_REFERENCE_OF_TARGET[code]?.fit}`, code).toBe('null:none');
      expect(DELIVERY_REFERENCE_OF_TARGET[code]?.why, code).toBe(ARCHIVED_DELIVERY);
    }
    expect(DELIVERY_REFERENCE_OF_TARGET.rap).toBeUndefined();
    // Only RA0001 is named at all.
    expect([...new Set(allBindings().map((b) => b.ra).filter(Boolean))].sort()).toEqual(['RA0001']);
  });

  test('the RA0001 passage on ABAP is quoted as it stands', () => {
    expect(RA0001_ABAP_QUOTE).toContain('ABAP RESTful Application Programming Model(RAP) can be leveraged');
    expect(RA0001_ABAP_QUOTE).toContain('SAP Application Interface Framework(AIF)');
    expect(eventSourceSentence('public')).toMatch(/RAP/);
    expect(eventSourceSentence('public')).not.toMatch(/AIF|ECC/);
    expect(eventSourceSentence('private')).toMatch(/RAP.*AIF/);
    expect(eventSourceSentence(null)).toMatch(/ECC/);
  });
});

test.describe('every target and every building block has an entry', () => {
  test('every TargetArchitectureCode, none included', () => {
    expect(Object.keys(REFERENCE_OF_TARGET).sort()).toEqual([...TARGET_ARCHITECTURES].sort());
    for (const code of TARGET_ARCHITECTURES) expect(REFERENCE_OF_TARGET[code].length).toBeGreaterThan(0);
  });

  test('every block of cloudServiceDetails, and the key reader returns only those', () => {
    expect([...CLOUD_SERVICE_KEYS].sort()).toEqual(Object.keys(cloudServiceDetails).sort());
    expect(Object.keys(REFERENCE_OF_SERVICE).sort()).toEqual([...CLOUD_SERVICE_KEYS].sort());
    for (const name of ['XSUAA', 'SAP Destination Service', 'SAP Event Mesh', 'SAP HANA Cloud', 'Released CDS View I_Customer', 'Something']) {
      expect(CLOUD_SERVICE_KEYS).toContain(getCloudServiceKey(name));
    }
  });

  test('none names no RA; every other fit names one', () => {
    for (const b of allBindings()) {
      if (b.fit === 'none') expect(b.ra).toBeNull();
      else expect(b.ra).not.toBeNull();
    }
  });

  test('the one line says yes · partly · none, and says when SAP archived the pattern', () => {
    expect(referenceAnswer('event')).toBe('yes');
    expect(referenceAnswer('integration')).toBe('none');
    expect(referenceAnswer('cap')).toBe('none');
    expect(referenceAnswer('rap')).toBe('none');
    expect(referencePatternLine('event').text).toBe(`${REFERENCE_LINE_LEAD}: yes.`);
    expect(referencePatternLine('event').ras).toEqual(['RA0001']);
    expect(referencePatternLine('rap').text).toBe(`${REFERENCE_LINE_LEAD}: none.`);
    expect(referencePatternLine('integration').text).toBe(`${REFERENCE_LINE_LEAD}: none — the ones that fitted were archived by SAP on 09.10.2026.`);
    expect(referencePatternLine('cap').ras).toEqual([]);
  });

  test('the handover README section, by target code', () => {
    expect(referencePatternsReadme('rap')).toContain('No Architecture Center pattern — the ABAP transport path applies');
    for (const code of ['cap', 'integration', 'event'] as const) {
      expect(referencePatternsReadme(code)).toContain(`Delivery:\n- No SAP pattern: ${ARCHIVED_DELIVERY}`);
      expect(referencePatternsReadme(code)).not.toContain('RA0023');
    }
    expect(referencePatternsReadme('event', 'public')).toContain(eventSourceSentence('public'));
    expect(referencePatternsReadme(null)).toContain('no pattern is named');
    expect(referencePatternsReadme('cap')).toContain('## Reference patterns');
    expect(referencePatternsReadme('cap')).toContain(ARCHIVED_ONLY);
  });
});

test.describe('the layer reads the target and changes nothing before it', () => {
  test('router, route drivers, score and model calls do not import it', () => {
    const files = [
      'lib/abap/extensibility-router.ts',
      'lib/abap/code-assessment.ts',
      'lib/abap/evidence-model.ts',
      'lib/clean-core-score.ts',
      'lib/architecture-contract.ts',
      'lib/contract-build.ts',
      'lib/audit-pack.ts',
      'lib/audit-pack-build.ts',
      'lib/audit-pack-canonical.ts',
      'app/api/gemini/route.ts',
      'app/api/runs/create/route.ts',
    ];
    for (const rel of files) {
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      expect(read(rel), `${rel} reads the SAP reference layer`).not.toMatch(/sap-reference-architectures|sap-architecture-center/);
    }
  });

  test('the signed audit pack files do not carry an RA', () => {
    for (const rel of ['lib/audit-pack.ts', 'lib/audit-pack-build.ts', 'lib/audit-pack-canonical.ts']) {
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      expect(read(rel), `${rel} names an RA`).not.toMatch(/\bRA00\d\d\b/);
    }
  });

  test('the shown places read the mapping', () => {
    expect(read('components/design/RoutingRationale.tsx')).toContain('REFERENCE_OF_TARGET[target]');
    expect(read('components/design/CloudServiceIntegrations.tsx')).toContain('REFERENCE_OF_SERVICE[getCloudServiceKey(');
    expect(read('app/(app)/project/[projectId]/delivery/page.tsx')).toContain('referencePatternsReadme(');
    expect(read('lib/design-export.ts')).toContain('designReferenceSection(');
    expect(read('components/workspace/WorkspaceShell.tsx')).toContain('<TargetReferenceLine');
    expect(read('components/workspace/ManagementExecutive.tsx')).toContain('optionsView.reference');
    expect(read('components/demo/DemoDesign.tsx')).toContain('targetArchitecture={code}');
  });
});

/**
 * The text guard: no word that turns a link into a seal. A line that names an
 * RA, the Architecture Center or the reference pattern may not stand within two
 * lines of "SAP-approved", "certified", "validated" or "compliant". Comments
 * are left out — they may say what the wording must never be.
 */
const BANNED = /SAP[- ]approved|\bcertified\b|\bvalidated\b|\bcompliant\b/i;
const MENTION = /\bRA00\d\d\b|Architecture Center|reference pattern|REFERENCE_WORDING|REFERENCE_OF_|raUrl\(|SapReference/;

function withoutComments(src: string): string[] {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'));
}

test.describe('the wording is "SAP reference pattern for the target"', () => {
  test('the fixed wording', () => {
    expect(REFERENCE_WORDING).toBe('SAP reference pattern for the target');
    expect(REFERENCE_LINE_LEAD).toBe('SAP-documented pattern for this target');
  });

  test('no seal word near an RA reference in the files that show one', () => {
    const files = [
      'lib/sap-reference-architectures.ts',
      'lib/design-export.ts',
      'lib/decision-option-signals.ts',
      'components/design/SapReference.tsx',
      'components/design/RoutingRationale.tsx',
      'components/design/CloudServiceIntegrations.tsx',
      'components/workspace/TargetReferenceLine.tsx',
      'components/workspace/ManagementExecutive.tsx',
      'app/(app)/project/[projectId]/delivery/page.tsx',
    ];
    const offenders: string[] = [];
    for (const rel of files) {
      const lines = withoutComments(read(rel));
      lines.forEach((line, i) => {
        if (!MENTION.test(line)) return;
        for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
          if (BANNED.test(lines[j])) offenders.push(`${rel}:${j + 1}: ${lines[j].trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders, `a seal word stands near an RA reference:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('no seal word in any text the layer produces', () => {
    const texts: string[] = [
      ...allBindings().map((b) => b.why),
      ...Object.values(SAP_REFERENCE_ARCHITECTURES).map((r) => r.title),
      ...TARGET_ARCHITECTURES.map((c) => referencePatternLine(c).text),
      ...TARGET_ARCHITECTURES.map((c) => referencePatternsReadme(c, 'private')),
      eventSourceSentence(null),
    ];
    for (const t of texts) expect(t, t).not.toMatch(BANNED);
  });

  test('the guard catches what it is for', () => {
    expect(BANNED.test('RA0001 — SAP-approved pattern')).toBe(true);
    expect(BANNED.test('certified by SAP')).toBe(true);
    expect(BANNED.test('a compliant target')).toBe(true);
    expect(BANNED.test('SAP reference pattern for the target')).toBe(false);
  });
});
