import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import {
  PHASES,
  generationBlockers,
  handoverBlockers,
  workflowSteps,
  type PhaseKey,
  type PhaseState,
} from '../lib/workflow-steps';
import { sha256Hex, artefactDigest, type TrackedArtefact } from '../lib/artefact-digest';
import { STATUS_FACETS, workspaceStatusLine, workspaceTools, type WorkspaceStatus } from '../lib/workspace-model';
import { nextOpenPoint } from '../lib/next-step';
import type { Project } from '../lib/types';

/**
 * The preservation register in the new workspace — roadmap 3.0.3.
 *
 * `tests/preservation-register.spec.ts` proves that the seven stages still do
 * what the register says. This spec asks the question the rebuild adds: for
 * every entry of that register — each stage, each reference case, each known
 * limit — **where is it met in the workspace**, or is it a gap?
 *
 * The answer is data, in the register itself: a `workspace` field on every
 * entry, and a top-level `workspace` block that says how each kind of
 * reference-case expectation is met (`shown` in the workspace, `linked` to the
 * stage tool that holds it, `inherited` because the workspace reads the same
 * contract) and which gaps are open with the roadmap step that owns them. A
 * register entry naming a module and a line of evidence that is not in that
 * module fails here, and so does a workspace that stops saying what a
 * reference case expects of it.
 *
 * Three layers, the same order as the register's own spec:
 *
 *   1. the register's `workspace` data is complete and every piece of evidence
 *      it cites is in the code it names;
 *   2. the reference cases run through the workspace's own derivations —
 *      `workspaceStatusLine`, `nextOpenPoint`, `workspaceTools` — without a
 *      page: every phase state, badge, detail, blocker and stale mark the case
 *      expects is somewhere a reader of the workspace can find it;
 *   3. the same cases seeded into the emulator and opened in the workspace
 *      itself (needs the dev server and the emulators).
 */

const ROOT = path.resolve(__dirname, '..');
const REGISTER_PATH = 'docs/registers/preservation-register.json';
const SELF = 'tests/preservation-workspace.spec.ts';

/* ------------------------------------------------------------------ types */

type Kind = 'shown' | 'linked' | 'inherited' | 'gap';

interface Where {
  module: string;
  evidence: string;
}

interface EntryWorkspace {
  kind: Kind;
  where?: Where[];
  note?: string;
}

interface StageWorkspace extends EntryWorkspace {
  facet: string | null;
}

interface CaseWorkspace {
  kind: Kind;
  /** facet → `status` or `status/provenance` as `workspaceStatusLine` derives it. */
  statusLine: Record<string, string>;
  nextStep: PhaseKey | null;
}

interface ReferenceCase {
  id: string;
  stage: PhaseKey;
  seed: { previousSource?: string; project: Record<string, unknown>; run: Record<string, unknown> };
  expect: {
    phaseStates: Record<PhaseKey, PhaseState>;
    badges: Partial<Record<PhaseKey, string>>;
    detailContains: Partial<Record<PhaseKey, string>>;
    generationBlockers: Record<'transformation' | 'documentation' | 'testing', string[]>;
    handoverBlockers: string[];
    staleNoticeOnOwnStage: boolean;
    handoverDownloadsDisabled?: boolean;
  };
  workspace: CaseWorkspace;
}

interface Register {
  trustChain: { hydration: { projectLeadingFields: string[] } };
  knownLimits: Array<{ id: string; subject: string; workspace?: EntryWorkspace }>;
  stages: Array<{ key: PhaseKey; label: string; route: string; workspace: StageWorkspace }>;
  referenceCases: ReferenceCase[];
  workspace: {
    roadmapStep: string;
    page: string;
    shell: string;
    model: string;
    guard: string;
    reachability: string;
    kinds: Record<Kind, string>;
    phaseFacets: Record<PhaseKey, string | null>;
    unfacetedPhasesReadBy: string;
    expectations: Record<string, EntryWorkspace>;
    notAssessedHere: Record<string, string>;
    openGaps: Array<{ id: string; subject: string; statement: string; step: string }>;
  };
}

const register: Register = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTER_PATH), 'utf8'));
const raw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const KINDS: Kind[] = ['shown', 'linked', 'inherited', 'gap'];

/* ------------------------------------------ reference case hydration */

/*
 * The same three placeholder forms and the same hydration rule as
 * `tests/preservation-register.spec.ts`, restated rather than shared: that spec
 * registers tests at import, and a helper extracted from it would put two
 * roadmap steps' edits into one file while 3.0.5 changes it on its own branch.
 * The rule itself is one line and the register's own spec holds it against
 * `lib/project-loader.ts`.
 */
const PLACEHOLDER = /^@(sha256|artefactDigest):(.+)$/;

function resolvePlaceholders(value: unknown, rc: ReferenceCase, runId: string): unknown {
  if (typeof value === 'string') {
    if (value === '@runId') return runId;
    const m = PLACEHOLDER.exec(value);
    if (!m) return value;
    if (m[1] === 'sha256') {
      const text =
        m[2] === 'legacyCode'
          ? String(rc.seed.project.legacyCode ?? '')
          : String(rc.seed[m[2] as 'previousSource'] ?? '');
      expect(text, `${rc.id}: nothing to hash for ${value}`).not.toBe('');
      return sha256Hex(text);
    }
    return artefactDigest(m[2] as TrackedArtefact, rc.seed.project[m[2]]);
  }
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholders(v, rc, runId));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolvePlaceholders(v, rc, runId)]),
    );
  }
  return value;
}

const runIdOf = (rc: ReferenceCase) => `${rc.id}-run`;

function seedDocuments(rc: ReferenceCase) {
  const runId = runIdOf(rc);
  return {
    runId,
    project: resolvePlaceholders(rc.seed.project, rc, runId) as Record<string, unknown>,
    run: resolvePlaceholders(rc.seed.run, rc, runId) as Record<string, unknown>,
  };
}

function hydrate(rc: ReferenceCase): Project {
  const { project, run } = seedDocuments(rc);
  const merged = { ...project, ...run } as Record<string, unknown>;
  for (const field of register.trustChain.hydration.projectLeadingFields) {
    merged[field] = project[field] ? project[field] : run[field];
  }
  return merged as unknown as Project;
}

const cell = (s: WorkspaceStatus) => (s.provenance ? `${s.status}/${s.provenance}` : s.status);

/**
 * The object statuses a phase state may come out as — `statusOfPhase` plus the
 * two statuses Execution adds of its own (`mock-only`, `failed`). A state that
 * lands outside its row is a workspace saying something else than the phase
 * contract the reference case was written against.
 */
const ALLOWED: Record<PhaseState, string[]> = {
  empty: ['not-started'],
  partial: ['partial', 'mock-only', 'failed'],
  done: ['done', 'draft', 'failed'],
  stale: ['partial'],
};

/** "Regenerate it in stage 3 first." → transformation. */
function stageNamedBy(message: string): PhaseKey {
  const m = /stage (\d)/.exec(message);
  expect(m, `a blocker names no stage: "${message}"`).not.toBeNull();
  return PHASES[Number(m![1]) - 1].key;
}

/* ========================= 1. the register's workspace data is complete */

test.describe('every register entry says where it is met in the workspace', () => {
  test('the workspace block names this step, this guard and files that exist', () => {
    const w = register.workspace;
    expect(w, 'the register has no `workspace` block').toBeTruthy();
    expect(w.roadmapStep).toBe('3.0.3');
    expect(w.guard).toBe(SELF);
    for (const rel of [w.page, w.shell, w.model]) expect(exists(rel), `${rel} does not exist`).toBe(true);
    expect(Object.keys(w.kinds).sort()).toEqual([...KINDS].sort());
  });

  test('every stage, reference case and known limit carries a `workspace` of a known kind', () => {
    for (const stage of register.stages) {
      expect(stage.workspace, `stage ${stage.key} has no workspace entry`).toBeTruthy();
      expect(KINDS).toContain(stage.workspace.kind);
    }
    for (const rc of register.referenceCases) {
      expect(rc.workspace, `${rc.id} has no workspace entry`).toBeTruthy();
      expect(KINDS).toContain(rc.workspace.kind);
    }
    for (const limit of register.knownLimits) {
      if (limit.id in register.workspace.notAssessedHere) {
        // Left to the roadmap step that retires it; stated in the block, never silently skipped.
        expect(register.workspace.notAssessedHere[limit.id].length).toBeGreaterThan(20);
        continue;
      }
      expect(limit.workspace, `${limit.id} has no workspace entry`).toBeTruthy();
      expect(KINDS).toContain(limit.workspace!.kind);
    }
    // An exemption for an entry that is gone is a dead line in the register.
    for (const id of Object.keys(register.workspace.notAssessedHere)) {
      const limit = register.knownLimits.find((l) => l.id === id);
      if (limit) expect(limit.workspace, `${id} is exempt and assessed at once`).toBeUndefined();
    }
  });

  test('every piece of evidence the register cites is in the module it names', () => {
    const cited: Array<[string, Where]> = [];
    const collect = (owner: string, entry?: EntryWorkspace) =>
      (entry?.where ?? []).forEach((w) => cited.push([owner, w]));
    register.stages.forEach((s) => collect(`stage ${s.key}`, s.workspace));
    register.knownLimits.forEach((l) => collect(l.id, l.workspace));
    Object.entries(register.workspace.expectations).forEach(([k, e]) => collect(`expectation ${k}`, e));

    expect(cited.length).toBeGreaterThan(20);
    for (const [owner, where] of cited) {
      expect(exists(where.module), `${owner}: ${where.module} does not exist`).toBe(true);
      expect(raw(where.module), `${owner}: "${where.evidence}" is no longer in ${where.module}`).toContain(
        where.evidence,
      );
    }
  });

  test('every entry that is not met says why and which step owns it', () => {
    const entries: Array<[string, EntryWorkspace | undefined]> = [
      ...register.stages.map((s) => [`stage ${s.key}`, s.workspace] as [string, EntryWorkspace]),
      ...register.knownLimits.map((l) => [l.id, l.workspace] as [string, EntryWorkspace | undefined]),
      ...Object.entries(register.workspace.expectations),
    ];
    for (const [owner, entry] of entries) {
      if (entry?.kind !== 'gap') continue;
      expect(entry.note ?? '', `${owner} is a gap without a roadmap step`).toMatch(/\b\d+\.\d+(\.\d+)?\b/);
    }
    for (const gap of register.workspace.openGaps) {
      expect(gap.id).toMatch(/^WG-\d{2}$/);
      expect(gap.step).toMatch(/^\d+\.\d+(\.\d+)?$/);
    }
  });

  test('every expectation of a reference case has a place in the workspace', () => {
    const kinds = new Set<string>();
    for (const rc of register.referenceCases) Object.keys(rc.expect).forEach((k) => kinds.add(k));
    expect([...kinds].sort()).toEqual(Object.keys(register.workspace.expectations).sort());
  });

  test('the facet map is the one the status line actually reads', () => {
    const line = workspaceStatusLine(null);
    const fromLine = Object.fromEntries(
      PHASES.map((p) => [p.key, line.find((s) => s.from === p.key)?.facet ?? null]),
    );
    expect(fromLine).toEqual(register.workspace.phaseFacets);
    for (const stage of register.stages) expect(stage.workspace.facet).toBe(register.workspace.phaseFacets[stage.key]);

    // The two phases without a facet are read by the one the register names —
    // otherwise their state would exist on the stage pages and nowhere here.
    const reader = line.find((s) => s.facet === register.workspace.unfacetedPhasesReadBy)!;
    const unfaceted = PHASES.filter((p) => register.workspace.phaseFacets[p.key] === null).map((p) => p.key);
    expect(unfaceted.length).toBeGreaterThan(0);
    for (const key of unfaceted) expect(reader.restsOn.map((p) => p.key)).toContain(key);
  });
});

/* ======================== 2. the reference cases, through the workspace */

test.describe('each reference case holds in the workspace', () => {
  test('the seven stages are the workspace tools, at the routes the register names', () => {
    const tools = workspaceTools(null);
    expect(tools.map((t) => t.key)).toEqual(register.stages.map((s) => s.key));
    for (const stage of register.stages) {
      const tool = tools.find((t) => t.key === stage.key)!;
      expect(`/project/{projectId}/${tool.path}`, `the ${stage.key} tool`).toBe(stage.route);
      expect(tool.label).toBe(stage.label);
    }
  });

  test('every phase is stated by exactly one status, with a link to its tool', () => {
    for (const rc of register.referenceCases) {
      const line = workspaceStatusLine(hydrate(rc));
      const stated = line.flatMap((s) => s.restsOn.map((p) => p.key));
      expect([...stated].sort(), `${rc.id}: a phase missing or stated twice`).toEqual(
        PHASES.map((p) => p.key).sort(),
      );
      const steps = workflowSteps(hydrate(rc));
      for (const s of line) {
        expect(s.restsOn.length === 0, `${rc.id}: ${s.facet} rests on phases without naming one`).toBe(
          s.from === null,
        );
        for (const phase of s.restsOn) {
          expect(phase.path).toBe(steps.find((x) => x.key === phase.key)!.path);
        }
      }
    }
  });

  for (const rc of register.referenceCases) {
    test(`${rc.id} — the workspace says what the case expects`, () => {
      const project = hydrate(rc);
      const line = workspaceStatusLine(project);
      const by = Object.fromEntries(line.map((s) => [s.facet, s])) as Record<string, WorkspaceStatus>;
      const phase = (key: PhaseKey) => line.flatMap((s) => s.restsOn).find((p) => p.key === key)!;

      // What the register records for this case, as the workspace derives it.
      expect(Object.keys(rc.workspace.statusLine)).toEqual([...STATUS_FACETS]);
      expect(Object.fromEntries(line.map((s) => [s.facet, cell(s)])), `${rc.id}: status line`).toEqual(
        rc.workspace.statusLine,
      );
      expect(nextOpenPoint(project, null)?.key ?? null, `${rc.id}: next step`).toBe(rc.workspace.nextStep);

      // phaseStates — a faceted phase as an object status within its row; a
      // stale one with the Stale chip; every phase's detail reachable.
      for (const p of PHASES) {
        const expected = rc.expect.phaseStates[p.key];
        const facet = register.workspace.phaseFacets[p.key];
        if (facet) {
          expect(ALLOWED[expected], `${rc.id}: ${p.key} is ${expected}, ${facet} says ${by[facet].status}`).toContain(
            by[facet].status,
          );
          expect(by[facet].provenance === 'stale', `${rc.id}: Stale chip on ${facet}`).toBe(expected === 'stale');
        }
        const stated = phase(p.key);
        expect(stated, `${rc.id}: ${p.key} is stated nowhere in the workspace`).toBeTruthy();
      }

      // badges and details — word for word, in the "Why?" of the status that rests on the phase.
      for (const [key, badge] of Object.entries(rc.expect.badges)) {
        expect(phase(key as PhaseKey).badge, `${rc.id}: badge of ${key}`).toBe(badge);
      }
      for (const [key, fragment] of Object.entries(rc.expect.detailContains)) {
        expect(phase(key as PhaseKey).detail, `${rc.id}: detail of ${key}`).toContain(fragment);
      }

      // generationBlockers — the workspace generates nothing; it sends the
      // reader to the stage the blocker names, and never past it.
      const blocking = (['transformation', 'documentation', 'testing'] as const).flatMap(
        (t) => rc.expect.generationBlockers[t],
      );
      expect(blocking).toEqual(
        (['transformation', 'documentation', 'testing'] as const).flatMap((t) => generationBlockers(project, t)),
      );
      if (blocking.length > 0) {
        const named = [...new Set(blocking.map(stageNamedBy))];
        const earliest = PHASES.find((p) => named.includes(p.key))!.key;
        expect(rc.workspace.nextStep, `${rc.id}: a blocker stands and Next step points elsewhere`).toBe(earliest);
      }

      // handoverBlockers — every one of them in the detail of Handover.
      expect(handoverBlockers(project)).toEqual(rc.expect.handoverBlockers);
      for (const reason of rc.expect.handoverBlockers) {
        expect(by.handover.detail, `${rc.id}: handover blocker "${reason}"`).toContain(reason);
      }

      // staleNoticeOnOwnStage — the own stage's staleness is on the workspace
      // too: a chip where the stage has a facet, the stale detail where not.
      if (rc.expect.staleNoticeOnOwnStage) {
        // The notice on a stage page is about what that stage builds on, which
        // is not always the stage itself (Documentation shows it for stale
        // code). So the workspace-side question is: is every stale phase of
        // this case marked stale where the workspace states it?
        const stalePhases = PHASES.filter((p) => rc.expect.phaseStates[p.key] === 'stale').map((p) => p.key);
        expect(stalePhases.length, `${rc.id}: a stale notice with nothing stale`).toBeGreaterThan(0);
        for (const key of stalePhases) {
          const facet = register.workspace.phaseFacets[key] ?? register.workspace.unfacetedPhasesReadBy;
          expect(by[facet].provenance, `${rc.id}: ${key} is stale and ${facet} carries no Stale chip`).toBe('stale');
          expect(phase(key).detail.length).toBeGreaterThan(0);
        }
      }

      // handoverDownloadsDisabled — blocked Handover, and the downloads only behind its tool.
      if (rc.expect.handoverDownloadsDisabled) {
        expect(by.handover.provenance).toBe('stale');
        expect(by.handover.restsOn[0].key).toBe('delivery');
      }
    });
  }
});

/* ============================== the open gaps, held so a fix updates them */

test.describe('the open gaps are still open — closing one has to update the register', () => {
  const gap = (id: string) => register.workspace.openGaps.find((g) => g.id === id);

  test('WG-01: the workspace is still behind the admin-only switch (3.0.1)', () => {
    expect(gap('WG-01')?.step).toBe('3.0.1');
    const page = raw(register.workspace.page);
    expect(page).toContain('const enabled = workspaceShellEnabled(profile);');
    expect(page).toContain('notFound();');
  });

  test('WG-02: the way back from a stage still leads to the dashboard (3.0.1)', () => {
    expect(gap('WG-02')?.step).toBe('3.0.1');
    const layout = raw('app/(app)/layout.tsx');
    const at = layout.indexOf('{isProjectStep && (');
    expect(at, 'the back link moved — re-read WG-02').toBeGreaterThan(-1);
    expect(layout.slice(at, at + 400)).toContain('href="/dashboard"');
  });

  test('WG-03: the "Why?" of a status is still its own 24-px target (3.0.4)', () => {
    expect(gap('WG-03')?.step).toBe('3.0.4');
    expect(raw('components/cc/WhyPopover.tsx')).toContain('h-6 w-6');
    expect(raw('components/workspace/StatusLine.tsx')).toContain('<CcWhyPopover');
  });

  test('L-07 and L-09 stay inherited: the workspace reads neither a project status nor `presentation`', () => {
    const sources = [
      register.workspace.model,
      register.workspace.shell,
      'components/workspace/StatusLine.tsx',
      'components/workspace/ToolBar.tsx',
      'components/workspace/NextStepCard.tsx',
      'lib/next-step.ts',
    ].map(raw);
    for (const text of sources) {
      expect(text).not.toMatch(/project\??\.status\b/);
      expect(text).not.toMatch(/\.presentation\b/);
    }
  });
});

/* ==================== 3. the reference cases, seeded and opened (server) */

test.describe('the reference cases, opened in the workspace', () => {
  test.describe.configure({ mode: 'serial' });

  const STAMP = Date.now();
  const EMAIL = `register-workspace-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'test-preservation-workspace-emulator';
  const projectIdOf = (rc: ReferenceCase) => `${rc.id}-ws-${STAMP}`;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      /* already connected */
    }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    // The workspace is the admin preview until 3.0.1 (WG-01): claim first, so
    // the token minted at sign-in already carries it.
    await adminSetCustomClaim(uid, { admin: true });
    await adminSetDoc('users', uid, {
      firstName: 'Preservation',
      lastName: 'Workspace',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      isAdmin: true,
      workspaceShell: true,
      transformationsUsed: 1,
      transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION,
      createdAt: new Date(),
    });
    for (const rc of register.referenceCases) {
      const projectId = projectIdOf(rc);
      const { runId, project, run } = seedDocuments(rc);
      await adminSetDoc('projects', projectId, { ...project, userId: uid, createdAt: new Date() });
      await adminSetDoc(`projects/${projectId}/runs`, runId, { ...run, runId, projectId, userId: uid });
    }
  });

  async function signIn(page: Page) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);
  }

  test('each case paints the statuses the register records, and every phase is one "Why?" away', async ({
    page,
  }) => {
    test.setTimeout(420 * 1000);
    await signIn(page);

    for (const rc of register.referenceCases) {
      const projectId = projectIdOf(rc);
      // IT opens the status line and the toolbar (ADR-026).
      await page.goto(`/project/${projectId}?view=it`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-workspace-status-line]', { timeout: 60000 });

      for (const [facet, value] of Object.entries(rc.workspace.statusLine)) {
        await expect(
          page.locator(`[data-workspace-status="${facet}"]`),
          `${rc.id}: ${facet} on screen`,
        ).toHaveAttribute('data-status', value.split('/')[0]);
      }

      // Every tool, at its route.
      for (const stage of register.stages) {
        await expect(
          page.locator(`[data-workspace-tools] a[href="/project/${projectId}/${stage.route.split('/').pop()}"]`),
          `${rc.id}: the ${stage.key} tool`,
        ).toHaveCount(1);
      }

      // Handover's "Why?" states the two phases without a facet, with their tools.
      const handover = page.locator('[data-workspace-status="handover"]');
      await handover.locator('[data-cc-why]').click();
      for (const key of ['delivery', 'transformation', 'documentation'] as const) {
        await expect(handover.locator(`[data-workspace-status-phase="${key}"]`)).toBeVisible();
        await expect(handover.locator(`[data-workspace-status-tool="${key}"]`)).toHaveAttribute(
          'href',
          `/project/${projectId}/${key}`,
        );
      }
      for (const [key, badge] of Object.entries(rc.expect.badges)) {
        const facet = register.workspace.phaseFacets[key as PhaseKey] ?? register.workspace.unfacetedPhasesReadBy;
        if (facet !== 'handover') continue;
        await expect(handover.locator(`[data-workspace-status-phase="${key}"]`)).toContainText(badge);
      }
      await page.keyboard.press('Escape');

      // And every other status: its "Why?" opens, names each phase it rests
      // on with that phase's badge, and links to that phase's tool. Opening
      // only Handover's left a broken control or a wrong detail on the other
      // four invisible to this test (QA review of 4b4586aff273, b30189096d30).
      const stageRoute = (key: string) =>
        register.stages.find((stage: { key: string }) => stage.key === key)?.route.split('/').pop() ?? key;
      for (const facet of Object.keys(rc.workspace.statusLine)) {
        if (facet === 'handover') continue;
        const status = page.locator(`[data-workspace-status="${facet}"]`);
        await status.locator('[data-cc-why]').click();
        await expect(status.locator('[data-workspace-status-basis]'), `${rc.id}: ${facet} "Why?"`).toBeVisible();
        const phases = (Object.keys(register.workspace.phaseFacets) as PhaseKey[]).filter(
          (key) => (register.workspace.phaseFacets[key] ?? register.workspace.unfacetedPhasesReadBy) === facet,
        );
        for (const key of phases) {
          await expect(status.locator(`[data-workspace-status-phase="${key}"]`), `${rc.id}: ${facet} names ${key}`).toBeVisible();
          await expect(status.locator(`[data-workspace-status-tool="${key}"]`)).toHaveAttribute(
            'href',
            `/project/${projectId}/${stageRoute(key)}`,
          );
          const badge = (rc.expect.badges as Record<string, string>)[key];
          if (badge) await expect(status.locator(`[data-workspace-status-phase="${key}"]`)).toContainText(badge);
        }
        await page.keyboard.press('Escape');
      }

      if (rc.workspace.nextStep) {
        await expect(page.locator('[data-next-step-state="open"]')).toHaveAttribute(
          'data-next-step-key',
          rc.workspace.nextStep,
        );
      }
    }
  });
});
