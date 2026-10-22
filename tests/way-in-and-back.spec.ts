import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  OWN_KEY_ACTION,
  OWN_KEY_HREF,
  QUOTA_NAME,
  quotaSpentSentence,
  runsLeftLabel,
} from '../lib/run-quota-rule';
import { safeReturnPath, signInLinkFor, signUpLinkFor } from '../lib/return-path';
import { invitationLinkPath } from '../lib/invitations';
import { ownDomainVerifyEmailLink, withReturnPath } from '../lib/auth-action-link';
import { stageErrorCopy } from '../lib/stage-error';
import { ownCodeStartNext, wt } from '../lib/workspace-messages';
import { CLOUD_ERP_PRIVATE } from '../lib/sap-naming';
import {
  isOtherBuild,
  learnBuild,
  NEW_VERSION_CHECK_INTERVAL_MS,
  NEW_VERSION_HEADLINE,
  servedBuild,
} from '../lib/new-version';
import { markTyping, readerIsTyping, reloadOnceForStaleBuild, TYPING_PAUSE_MS } from '../lib/stale-build';
import {
  accessFromAnswer,
  NO_ACCESS_SENTENCE,
  projectGate,
  readerFacingOwnerName,
  readerStripSentence,
} from '../lib/project-gate';

/**
 * Roadmap 3.0.21 — "The way in and the way back work" (owner decisions
 * 22.10.2026 on the whole-app usability analysis). Server-free: the pure
 * modules the screens read, and the source of the screens where a rendered
 * check needs a signed-in account with a spent quota. The rendered half is
 * `tests/way-in-and-back-rendered.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
// CRLF in a Windows checkout; the source patterns below match on a bare line feed.
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test.describe('(1) a project link signed out goes to sign-in and back; without access, one sentence', () => {
  test('the frame decides from the restored session and the server\'s answer', () => {
    expect(projectGate(undefined, undefined)).toBe('checking');
    expect(projectGate(false, undefined)).toBe('sign-in');
    expect(projectGate(false, { kind: 'owner' })).toBe('sign-in');
    expect(projectGate(true, undefined)).toBe('open');
    expect(projectGate(true, { kind: 'owner' })).toBe('open');
    expect(projectGate(true, { kind: 'reader', ownerName: 'Ada Lovelace' })).toBe('open');
    expect(projectGate(true, { kind: 'none' })).toBe('no-access');
    // A read that failed is not "no access": the page says what it says about a failed load.
    expect(projectGate(true, { kind: 'unknown' })).toBe('open');
  });

  test('only the route\'s 404 means "no access"; anything else it could not say is unknown', () => {
    expect(accessFromAnswer(404, { error: 'Project not found.' })).toEqual({ kind: 'none' });
    expect(accessFromAnswer(200, { role: 'owner', ownerName: null })).toEqual({ kind: 'owner' });
    expect(accessFromAnswer(200, { role: 'reader', ownerName: ' Ada Lovelace ' })).toEqual({ kind: 'reader', ownerName: 'Ada Lovelace' });
    expect(accessFromAnswer(200, { role: 'reader', ownerName: '' })).toEqual({ kind: 'reader', ownerName: null });
    for (const status of [401, 403, 500]) expect(accessFromAnswer(status, { error: 'x' })).toEqual({ kind: 'unknown' });
    expect(accessFromAnswer(200, null)).toEqual({ kind: 'unknown' });
    expect(accessFromAnswer(200, { role: 'admin' })).toEqual({ kind: 'unknown' });
  });

  test('every project and tool link is a target the sign-in returns to', () => {
    for (const stage of ['', '/analyze', '/design', '/transformation', '/documentation', '/testing', '/tco', '/delivery']) {
      const here = `/project/p-42${stage}`;
      expect(signInLinkFor(here)).toBe(`/?auth=signin&next=${encodeURIComponent(here)}`);
    }
  });

  test('the frame wraps the workspace and all seven tools, and the workspace no longer 404s a good link', () => {
    expect(read('app/(app)/project/[projectId]/layout.tsx')).toContain('<ProjectFrame>{children}</ProjectFrame>');
    const frame = read('components/ProjectFrame.tsx');
    expect(frame).toContain('auth.authStateReady()');
    expect(frame).toContain("router.replace(signInLinkFor(pathname ?? '/'))");
    expect(frame).toContain('`/api/projects/${encodeURIComponent(projectId)}?for=access`');
    expect(frame).toContain("if (gate === 'no-access') return <ProjectNoAccess />;");
    const page = read('app/(app)/project/[projectId]/page.tsx');
    expect(page).toContain('if (profileLoading || (!enabled && !getAuth().currentUser)) {');
    const missing = page.slice(page.indexOf("if (state === 'missing')"));
    expect(missing.slice(0, missing.indexOf('}'))).toContain('return <ProjectNoAccess />;');
    const noAccess = read('components/ProjectNoAccess.tsx');
    expect(noAccess).toContain('{NO_ACCESS_SENTENCE}');
    expect(noAccess).toContain('href="/dashboard"');
    expect(noAccess).toContain("nav('nav.goToMyWorkspace')");
    expect(NO_ACCESS_SENTENCE).toBe('This project does not exist or is not shared with this account.');
  });

  test('the access answer tells nobody more than the project read did', () => {
    const route = read('app/api/projects/[projectId]/route.ts');
    const access = route.slice(route.indexOf("get('for') === 'access'"), route.indexOf('const activeRunId'));
    // After the one 404 for "not there" and "not yours", never before it.
    expect(route.indexOf("get('for') === 'access'")).toBeGreaterThan(route.indexOf('if (!mayReadProject(project, decoded.uid))'));
    expect(access, 'the run is not read for the access answer').not.toContain("collection('runs')");
    expect(access, 'only a reader is told the owner name').toContain("role === 'reader'");
    expect(access).toContain('readerFacingOwnerName(owner.firstName, owner.lastName)');
    expect(access).toContain('return NextResponse.json({ role, ownerName });');
    expect(readerFacingOwnerName(' Ada ', 'Lovelace')).toBe('Ada Lovelace');
    expect(readerFacingOwnerName(undefined, null)).toBeNull();
    expect(readerFacingOwnerName('x'.repeat(100), '')!.length).toBe(80);
  });

  test('the shell\'s Sign in link and the dashboard\'s signed-out redirect carry the way back', () => {
    const layout = read('app/(app)/layout.tsx');
    expect(layout).toMatch(/href=\{signInLinkFor\(pathname \?\? '\/'\)\}\s*\n\s*data-shell-sign-in=""/);
    const dashboard = read('app/(app)/dashboard/page.tsx');
    expect(dashboard).toContain("router.push(signInLinkFor('/dashboard'));");
    expect(dashboard).not.toContain("router.push('/');");
  });
});

test.describe('(13) an invited reader sees one strip, on the workspace and on every tool', () => {
  test('the strip names the owner and says it is read only', () => {
    expect(readerStripSentence('Ada Lovelace')).toBe('Shared with you for reading by Ada Lovelace — read only.');
    expect(readerStripSentence(null)).toBe('Shared with you for reading — read only.');
    const frame = read('components/ProjectFrame.tsx');
    expect(frame).toMatch(/current\?\.kind === 'reader' \? \(\s*\n\s*<div data-reader-strip=""/);
    expect(frame).toContain('headline={readerStripSentence(current.ownerName)}');
    expect(frame).toContain('{INVITATION_LIMITS_SENTENCE_RECIPIENT}');
  });

  test('the page-wide owner-only notes the strip replaces are gone; the ones beside a control stay', () => {
    for (const rel of [
      'app/(app)/project/[projectId]/transformation/page.tsx',
      'app/(app)/project/[projectId]/testing/page.tsx',
      'app/(app)/project/[projectId]/tco/page.tsx',
    ]) {
      expect(read(rel), `${rel} still repeats the strip as a note`).not.toContain('<OwnerOnlyNote');
    }
    for (const rel of ['components/process-map/ProcessMap.tsx', 'components/ArchitectSignOff.tsx', 'components/design/DesignCanvasStage.tsx', 'components/documentation/BusinessLayer.tsx']) {
      expect(read(rel), `${rel} lost the note beside its control`).toContain('<OwnerOnlyNote');
    }
  });
});

test.describe('(4) a new invited reader: the invitation path survives the confirmation, sign-up is offered, acceptance opens the project', () => {
  const here = invitationLinkPath('proj-1', 'Ab3-_xyz');

  test('the confirmation link carries the invitation path, and nothing it would refuse', () => {
    const base = ownDomainVerifyEmailLink(
      'https://x.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=AbC-12_xyz890&apiKey=k',
      'https://clean-core.io',
    );
    const withNext = withReturnPath(base, here);
    const url = new URL(withNext);
    expect(url.pathname).toBe('/auth/action');
    expect(url.searchParams.get('oobCode')).toBe('AbC-12_xyz890');
    expect(url.searchParams.get('next')).toBe(here);
    // An unknown target leaves the link exactly as it was.
    for (const bad of ['https://evil.example', '/dashboard#@evil', '//evil', '/project/a/secrets']) {
      expect(withReturnPath(base, bad), bad).toBe(base);
    }
    const route = read('app/api/projects/[projectId]/invitations/[invitationId]/accept/route.ts');
    expect(route).toMatch(/withReturnPath\(\s*ownDomainVerifyEmailLink\([\s\S]*?\),\s*invitationLinkPath\(projectId, invitationId\),\s*\)/);
  });

  test('the confirmation page checks the path again and leads back to the invitation in one click', () => {
    const page = read('app/auth/action/page.tsx');
    expect(page).toContain('const returnTo = safeReturnPath(next);');
    expect(page).toContain('returnTo={returnTo}');
    const client = read('app/auth/action/AuthActionClient.tsx');
    const done = client.slice(client.indexOf("if (state === 'done')"), client.indexOf("if (state === 'error')"));
    expect(done).toContain('href={signInLinkFor(returnTo)}');
    expect(done).toContain('Open the invitation');
  });

  test('signed out, the invitation offers sign-in and "Create an account", both coming back to it', () => {
    expect(signUpLinkFor(here)).toBe(`/?auth=signup&next=${encodeURIComponent(here)}`);
    expect(signUpLinkFor('https://evil.example')).toBe('/?auth=signup');
    const src = read('app/(app)/invitation/[projectId]/[invitationId]/page.tsx');
    expect(src).toMatch(/data-invitation-signup="" href=\{signUpLinkFor\(here\)\}>\s*Create an account/);
    expect(src).toContain('href={signInLinkFor(here)}');
  });

  test('signed in, it says which account, offers another, and accepting opens the project directly', () => {
    const src = read('app/(app)/invitation/[projectId]/[invitationId]/page.tsx');
    expect(src).toMatch(/Signed in as <span[^>]*>\{user\.email \?\? 'this account'\}<\/span>/);
    expect(src).toMatch(/data-invitation-switch=""[\s\S]{0,400}Use another account/);
    const switchAccount = src.slice(src.indexOf('const switchAccount'), src.indexOf('}, [router, here]);'));
    expect(switchAccount).toContain('await signOut(getAuth())');
    expect(switchAccount).toContain('router.push(signInLinkFor(here));');
    const accept = src.slice(src.indexOf('const accept = useCallback'), src.indexOf('const switchAccount'));
    expect(accept).toContain('router.replace(`/project/${projectId}`);');
    expect(src, 'the in-between page is back').not.toContain('You now have read access');
    expect(src).not.toContain('Open the project</CcLinkButton>');
  });
});

test.describe('(7) one error boundary for every tool, with "Back to project workspace" and the stale-build recovery', () => {
  test('it sits at the project segment, and no tool keeps a copy of its own', () => {
    const dir = path.join(ROOT, 'app', '(app)', 'project', '[projectId]');
    expect(fs.existsSync(path.join(dir, 'error.tsx'))).toBe(true);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      expect(fs.existsSync(path.join(dir, entry.name, 'error.tsx')), `${entry.name} has its own boundary again`).toBe(false);
    }
    const src = read('app/(app)/project/[projectId]/error.tsx');
    expect(src).toContain('const staleBuild = isStaleBuildError(error);');
    expect(src).toContain('if (staleBuild) reloadOnceForStaleBuild();');
    expect(src.indexOf('<NewVersionAvailable />')).toBeLessThan(src.indexOf('error.message'));
    expect(src).toContain('workspaceBackHref({ projectId, search:');
    expect(src).toContain('{copy.backLabel}');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'the old hard-coded way to one stage').not.toMatch(/\/transformation`|previous stage/);
    expect(src, 'sentence case').not.toContain('Try Again');
    expect(src).not.toContain('min-h-screen');
  });

  test('on a tool it names the tool and leads back to the project workspace; on the workspace, to My workspace', () => {
    for (const [stage, label] of [['analyze', 'Analyze'], ['design', 'Design'], ['transformation', 'Transformation'], ['documentation', 'Documentation'], ['testing', 'Testing'], ['tco', 'Economics'], ['delivery', 'Delivery']]) {
      const copy = stageErrorCopy(`/project/p1/${stage}`);
      expect(copy.onTool, stage).toBe(true);
      expect(copy.subject).toBe(label);
      expect(copy.body.startsWith(`${label} stopped`)).toBe(true);
      expect(copy.backLabel).toBe('Back to project workspace');
    }
    expect(stageErrorCopy('/project/p1/design/requirements').subject).toBe('Design');
    const workspace = stageErrorCopy('/project/p1');
    expect(workspace.onTool).toBe(false);
    expect(workspace.backLabel).toBe('Go to My workspace');
  });
});

test.describe('(8) a tab left open across a deploy says so when it comes back, and never reloads while the reader types', () => {
  test('another version, or another commit of the same version, is another build', () => {
    const tab = { version: 'v3.0.21', commit: null };
    expect(servedBuild({ status: 'ok', version: 'v3.0.21', commit: 'abc123def456' })).toEqual({ version: 'v3.0.21', commit: 'abc123def456' });
    expect(servedBuild({ status: 'degraded' })).toBeNull();
    expect(servedBuild(null)).toBeNull();
    expect(isOtherBuild(tab, { version: 'v3.0.22', commit: null })).toBe(true);
    expect(isOtherBuild(tab, { version: 'v3.0.21', commit: 'abc' })).toBe(false);
    expect(isOtherBuild(tab, null), 'an answer without a build says nothing').toBe(false);
    // The commit is learnt from the first answer of the tab's own version…
    const learnt = learnBuild(tab, { version: 'v3.0.21', commit: 'abc' });
    expect(learnt).toEqual({ version: 'v3.0.21', commit: 'abc' });
    expect(isOtherBuild(learnt, { version: 'v3.0.21', commit: 'def' }), 'a fix without a version bump').toBe(true);
    expect(isOtherBuild(learnt, { version: 'v3.0.21', commit: 'abc' })).toBe(false);
    // …never from an answer that already names another version, and only once.
    expect(learnBuild(tab, { version: 'v3.0.22', commit: 'def' })).toBe(tab);
    expect(learnBuild(learnt, { version: 'v3.0.21', commit: 'zzz' })).toBe(learnt);
  });

  test('the shell asks on mount and when the tab comes back into view, at most once a minute, and the reload is a click', () => {
    expect(NEW_VERSION_CHECK_INTERVAL_MS).toBe(60_000);
    expect(NEW_VERSION_HEADLINE).toBe('Clean-Core.io was updated.');
    const watcher = read('components/NewVersionWatcher.tsx');
    expect(watcher).toContain("document.addEventListener('visibilitychange', onVisible);");
    expect(watcher).toContain("fetch('/api/health', { cache: 'no-store' })");
    expect(watcher).toContain('if (Date.now() - lastAsked.current < NEW_VERSION_CHECK_INTERVAL_MS) return;');
    // The only reload is the button's.
    expect(watcher.match(/window\.location\.reload\(\)/g)).toHaveLength(1);
    expect(watcher).toMatch(/onClick=\{\(\) => window\.location\.reload\(\)\}/);
    expect(read('app/(app)/layout.tsx')).toMatch(/<NewVersionWatcher \/>\s*\n\s*\{children\}/);
  });

  test('the automatic reload after a missing chunk waits while the reader types', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const hadWindow = 'window' in g;
    const prevStorage = g.sessionStorage;
    let reloads = 0;
    const store = new Map<string, string>();
    g.window = { location: { reload: () => { reloads += 1; } } };
    g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    try {
      const t = 1_000_000_000_000;
      markTyping(t);
      expect(readerIsTyping(t + 1_000)).toBe(true);
      expect(reloadOnceForStaleBuild(t + 1_000), 'reloaded while the reader was typing').toBe(false);
      expect(reloads).toBe(0);
      expect(readerIsTyping(t + TYPING_PAUSE_MS + 1)).toBe(false);
      expect(reloadOnceForStaleBuild(t + TYPING_PAUSE_MS + 1)).toBe(true);
      expect(reloads).toBe(1);
    } finally {
      markTyping(0);
      if (!hadWindow) delete g.window;
      g.sessionStorage = prevStorage;
      if (prevStorage === undefined) delete g.sessionStorage;
    }
  });
});

test.describe('(12) the start names the target as one line, and the own-code footer names the edition chosen', () => {
  test('the footer sentence follows the chosen edition (bug: it always said SAP Cloud ERP Private)', () => {
    for (const model of [true, false]) {
      expect(ownCodeStartNext(model, 'SAP S/4HANA Cloud Public Edition')).toContain('assessed against SAP S/4HANA Cloud Public Edition');
      expect(ownCodeStartNext(model, 'SAP S/4HANA Cloud Public Edition')).not.toContain('Private');
      expect(ownCodeStartNext(model, CLOUD_ERP_PRIVATE)).toContain(`assessed against ${CLOUD_ERP_PRIVATE}`);
    }
    const src = read('components/workspace/OwnCodeImport.tsx');
    expect(src).toContain('ownCodeStartNext(startCallsModel, targetEditionTitle(edition))');
    // No fixed edition left in the catalogue's start sentences.
    expect(read('lib/messages/own-code.ts')).not.toMatch(/'ownCode\.startNext/);
    const choice = read('components/TargetEditionChoice.tsx');
    expect(choice).toMatch(/export function targetEditionTitle\(value: TargetEdition\): string \{\s*return \(TARGET_EDITION_OPTIONS\.find/);
  });

  test('both start screens fold the target to "Assessed against … · Change"; the preselection keeps the one-click start', () => {
    expect(wt('tgt.assessedAgainst')).toBe('Assessed against');
    expect(wt('tgt.changeAtStart')).toBe('Change');
    for (const file of ['components/StarterExamples.tsx', 'components/workspace/OwnCodeImport.tsx']) {
      const src = read(file);
      const use = src.slice(src.indexOf('<TargetEditionChoice'), src.indexOf('/>', src.indexOf('<TargetEditionChoice')));
      expect(use, file).toMatch(/\n\s*folded\n/);
      expect(src, file).toContain("useState<TargetEdition>('private')");
    }
    const choice = read('components/TargetEditionChoice.tsx');
    const folded = choice.slice(choice.indexOf('if (folded && !open)'), choice.indexOf('  return (\n    <div data-target-edition-choice="" data-target-edition={value} className'));
    expect(folded).toContain('data-target-edition-folded=""');
    expect(folded).toContain("{wt('tgt.assessedAgainst')} <b className=\"font-semibold text-cc-ink\">{targetEditionTitle(value)}</b>");
    expect(folded).toContain('onClick={() => setOpen(true)}');
    // The "Change target" dialog in the workspace keeps the full choice.
    expect(read('components/workspace/TargetChange.tsx')).toContain('<TargetEditionChoice value={edition} onChange={chooseEdition} />');
  });
});

test.describe('(15) the sign-in dialog: a neutral title, a way on from "already registered", sentence case — the sign-up fields unchanged', () => {
  const src = read('components/LandingModals.tsx');

  test('the step every call to action opens has a neutral title', () => {
    const titles = src.slice(src.indexOf('const AUTH_TITLE'), src.indexOf('};', src.indexOf('const AUTH_TITLE')));
    expect(titles).toContain("signin: 'Sign in or create a free account',");
    expect(titles).toContain("signup: 'Create a free account',");
    expect(titles).toContain("forgot: 'Reset password',");
    expect(titles).toContain("success: 'Check your inbox',");
    expect(titles).toContain("mfa: 'Two-factor authentication',");
    expect(titles).not.toContain(": 'Welcome Back'");
  });

  test('"already registered" offers "Sign in instead" and "Reset password"', () => {
    expect(src).toContain("setAlreadyRegistered(error.code === 'auth/email-already-in-use');");
    const strip = src.slice(src.indexOf("data-auth-error={alreadyRegistered ? 'already-registered' : ''}"), src.indexOf('{authError}', src.indexOf('data-auth-error=')));
    expect(strip).toMatch(/data-auth-signin-instead=""\s*>\s*Sign in instead/);
    expect(strip).toMatch(/data-auth-reset-instead=""\s*>\s*Reset password/);
    expect(strip).toContain("updateQueryParams('auth', 'signin')");
    expect(strip).toContain("updateQueryParams('auth', 'forgot')");
  });

  test('the dialog\'s own words are in sentence case', () => {
    for (const titleCase of ['>Sign In<', "'Sign In'", 'Back to Sign In', 'Create Account\n', 'Forgot Password?', 'Send Reset Link', 'Signing In']) {
      expect(src.replace(/\s*\n\s*/g, '\n').replace(/>\n/g, '>').replace(/\n</g, '<'), titleCase).not.toContain(titleCase);
    }
  });

  test('the sign-up fields are the ones they were — names, address, passwords, the optional motivation and both agreements', () => {
    const signup = src.slice(src.indexOf("authMode === 'signup' ? ("), src.indexOf('/* Sign In Screen (Default) */'));
    for (const label of ['label="First Name" required', 'label="Last Name" required', 'label="Email Address" required', 'label="Motivation / Use Case (Optional)"']) {
      expect(signup, label).toContain(label);
    }
    expect(signup.match(/<CcCheckbox/g)).toHaveLength(2);
    // The five fields of v3.0.20, counted so that none is added or dropped unnoticed.
    expect(signup.match(/<CcField /g)?.length).toBe(5);
  });
});

test.describe('(2) the quota has one name — analysis runs, counted as left', () => {
  test('the header, Settings and the notices count what is left, in runs', () => {
    expect(runsLeftLabel({ transformationsUsed: 1, transformationsLimit: 5 })).toBe('4 of 5 runs left');
    expect(runsLeftLabel({ transformationsUsed: 0, transformationsLimit: 5 })).toBe('5 of 5 runs left');
    expect(runsLeftLabel({ transformationsUsed: 9, transformationsLimit: 5 })).toBe('0 of 5 runs left');
    expect(runsLeftLabel({ byokConfigured: true, transformationsUsed: 3, transformationsLimit: 5 })).toBe('Unlimited');
    expect(runsLeftLabel({ tier: 'enterprise' })).toBe('Unlimited');
    expect(runsLeftLabel({ transformationsUsed: 0, transformationsLimit: 1000 })).toBe('Unlimited');
    expect(QUOTA_NAME).toBe('Analysis runs');
  });

  test('the server refuses in the words the screens use', () => {
    const sentence = quotaSpentSentence(5);
    expect(sentence).toContain('5 free analysis runs');
    expect(sentence).not.toMatch(/transformation/i);
    const admin = read('lib/firebase-admin.ts');
    expect(admin).toContain('throw new QuotaError(quotaSpentSentence(limit), 403);');
    expect(admin).not.toMatch(/free transformations/);
  });

  test('no screen names the quota "transformations" or "Plan and usage" any more (UX-084 regressed)', () => {
    for (const rel of [
      'app/(app)/layout.tsx',
      'app/(app)/settings/page.tsx',
      'app/(app)/dashboard/page.tsx',
      'app/(app)/first-run/page.tsx',
      'components/StarterExamples.tsx',
      'components/GlossaryChatbot.tsx',
      'lib/chatbot-knowledge.ts',
    ]) {
      // Comments may tell the history; what a reader sees may not.
      const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, `${rel} still says "Plan and usage"`).not.toContain('Plan and usage');
      expect(src, `${rel} still counts "transformations used"`).not.toMatch(/Transformations used/);
      // A number of transformations is the old name of the quota; the stage is still called Transformation.
      expect(src, `${rel} still names the quota in transformations`).not.toMatch(/(\d|\}|five) (free )?transformations\b/i);
    }
    const layout = read('app/(app)/layout.tsx');
    expect(layout).toContain('{runsLeftLabel(profile)}');
    const settings = read('app/(app)/settings/page.tsx');
    expect(settings).toContain('title={QUOTA_NAME}');
    expect(settings).toMatch(/data-settings-quota=""[\s\S]{0,200}runsLeftLabel\(profile\)/);
    expect(read('app/(app)/first-run/page.tsx')).toContain('"5 of 5 runs left"');
  });
});

test.describe('(3) the way to an own key links every hop', () => {
  test('every limit notice offers "Add your own key", pointing at the key card', () => {
    expect(OWN_KEY_HREF).toBe('/settings#own-key');
    expect(OWN_KEY_ACTION).toBe('Add your own key');
    const starter = read('components/StarterExamples.tsx');
    const strip = starter.slice(starter.indexOf('headline="Limit reached."'), starter.indexOf('</CcMessageStrip>', starter.indexOf('headline="Limit reached."')));
    expect(strip).toContain('href={OWN_KEY_HREF}');
    expect(strip).toContain('{OWN_KEY_ACTION}');
    const dashboard = read('app/(app)/dashboard/page.tsx');
    const limitStrips = dashboard.split('headline="Limit reached."').slice(1);
    expect(limitStrips.length).toBe(3);
    for (const after of limitStrips) {
      expect(after.slice(0, after.indexOf('</CcMessageStrip>'))).toContain('href={OWN_KEY_HREF}');
    }
  });

  test('the key card is the anchor, and its two-factor sentence links to Sign-in security', () => {
    const settings = read('app/(app)/settings/page.tsx');
    expect(settings).toContain("const OWN_KEY_ID = OWN_KEY_HREF.slice(OWN_KEY_HREF.indexOf('#') + 1);");
    expect(settings).toContain("const SIGN_IN_SECURITY_ID = 'sign-in-security';");
    expect(settings).toMatch(/title="Your own model key \(BYOK\)"\s*\n\s*id=\{OWN_KEY_ID\}/);
    expect(settings).toContain('<CcCard level={2} title="Sign-in security" id={SIGN_IN_SECURITY_ID}>');
    expect(settings).toMatch(/<a href=\{`#\$\{SIGN_IN_SECURITY_ID\}`\} data-own-key-mfa-link=""[^>]*>\s*set it up under Sign-in security/);
    // The card component carries the anchor on its own element.
    expect(read('components/cc/Card.tsx')).toMatch(/<section\s+id=\{id\}/);
  });

  test('after two-factor is turned on, the new sign-in comes back to the key', () => {
    const settings = read('app/(app)/settings/page.tsx');
    expect(settings).toContain("router.push(signInLinkFor(isPilotTier ? OWN_KEY_HREF : '/settings'))");
    expect(settings).not.toContain("router.push('/?auth=signin')");
    // …and the return path honours exactly that place, and no other fragment.
    expect(safeReturnPath('/settings#own-key')).toBe('/settings#own-key');
    expect(safeReturnPath('/settings#sign-in-security')).toBe('/settings#sign-in-security');
    expect(signInLinkFor(OWN_KEY_HREF)).toBe(`/?auth=signin&next=${encodeURIComponent('/settings#own-key')}`);
    for (const refused of ['/settings#own-key2', '/settings#Own-key', '/settings#own-key#x', '/dashboard#own-key', '/settings##own-key', '/settings#']) {
      expect(safeReturnPath(refused), refused).toBeNull();
    }
  });
});
