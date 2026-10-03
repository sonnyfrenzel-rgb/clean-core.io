'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { useTestGeneration } from '@/hooks/useTestGeneration';
import { useProjectEvidence } from '@/hooks/useProjectEvidence';
import { findingsForOrigin, signedForOrigin, useScenarioOriginEngine } from '@/hooks/useScenarioOrigins';
import { useTestExecution } from '@/hooks/useTestExecution';
import { useSignedInUid } from '@/components/workspace/BusinessRulesEditor';
import type { Project } from '@/lib/types';
import { ArrowRight, Play, Terminal as TerminalIcon, RefreshCw, ListChecks, Download, ShieldCheck, AlertTriangle, BarChart3, Globe, Send, Eye, EyeOff, Clock, BookOpen, ExternalLink, HelpCircle, Database, Search, Layers, ChevronRight, MapPin, ArrowLeft, Check, Circle, Plug, Lock } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import CcCard from '@/components/cc/Card';
import CcDateText from '@/components/cc/DateText';
import CcStateText from '@/components/cc/StateText';
import CcMessageBox from '@/components/cc/MessageBox';
import CcDisclosure from '@/components/cc/Disclosure';
import CcTable from '@/components/cc/Table';
import CcField, { CC_CONTROL_HEIGHT } from '@/components/cc/Field';
import CcSelect from '@/components/cc/Select';
import CcTextarea from '@/components/cc/Textarea';
import { stateChartColor, NOT_DETERMINED_CHART } from '@/lib/chart-colors';
import { provenance } from '@/lib/provenance';
// The runner executes against mocks only, so a pass is "Demonstrated · mock", never "Proven" (QA f2dc77c6c912).
const RUNNER_PASS = provenance('demonstrated-mock').label;
import type { TestingPieSlice } from '@/components/TestingCharts';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { clsx } from 'clsx';
import { cn } from '@/lib/utils';
import StageFooter from '@/components/StageFooter';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });
const TestingPieChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingPieChart), { ssr: false });
const TestingBarChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingBarChart), { ssr: false });


import { useUserProfile } from '@/hooks/useUserProfile';
import { saveAs } from '@/lib/fileSaver';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import NotGenerated from '@/components/NotGenerated';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { workflowSteps, generationBlockers, generationPrerequisites, previousBasis } from '@/lib/workflow-steps';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import StaleNotice from '@/components/StaleNotice';
import { STORED_TEST_SUITE_REJECTED } from './test-suite-schema';
import TestingHeader, { TestingMetaLine, type MetaPart } from '@/components/testing/TestingHeader';
import ToolSection from '@/components/testing/ToolSection';
import TestPipeline from '@/components/testing/TestPipeline';
import HandChecks from '@/components/testing/HandChecks';
import type { StripTick } from '@/components/testing/ProgramStrip';
import { readProgram } from '@/components/testing/program-reading';
import { coveringTestRunReceipt } from '@/lib/test-receipt';
import { catalogForReader } from '@/lib/messages/demo';
import { normaliseSeverity } from '@/lib/severity';
import { lastRun, scenarios } from '@/components/testing/testing-summary';
import { isAbapUnitRoute, ABAP_UNIT_NOT_RUNNABLE } from '@/lib/test-runnability';
import ScenarioList, { type ScenarioCase, type ScenarioOutsideResult, type ScenarioRunResult } from '@/components/testing/ScenarioList';
import TestScopeLegend from '@/components/testing/TestScopeLegend';
import SapResultCard from '@/components/testing/SapResultCard';
import { outsideChipNote, outsideCountsLine, outsideReading, summaryOf, type OutsideTestRecord } from '@/lib/sap-test-results';
import { isProjectOwner } from '@/lib/project-readers';

const renderSafeValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    return val.map(item => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'object') {
        try {
          return JSON.stringify(item);
        } catch (e) {
          return String(item);
        }
      }
      return String(item);
    }).join('\n');
  }
  if (typeof val === 'object') {
    try {
      return typeof val.toString === 'function' && val.toString() !== '[object Object]' 
        ? val.toString() 
        : JSON.stringify(val, null, 2);
    } catch (e) {
      return String(val);
    }
  }
  return String(val);
};

/**
 * Excel's own rules for a worksheet name, applied before ExcelJS can throw over
 * them.
 *
 * The detail sheets were named `renderSafeValue(tc.id).slice(0, 30)` — a string
 * the model wrote, handed to `addWorksheet` untouched. ExcelJS throws on the
 * five characters Excel forbids plus the two bracket characters, on an empty
 * name, on the reserved name `History`, and on a name already in the workbook.
 * Any one of those ended the whole export in a `catch` that wrote to the
 * console: no file, no message, a button that looked broken. A test case id of
 * `FI/AP-01` or two cases sharing an id is all it took.
 *
 * So the name is repaired rather than trusted, and the repair is deliberately
 * visible: a replaced character stays as `-` in the tab so the reader can see
 * the name is not quite the id.
 */
const excelSheetName = (raw: string, fallback: string, taken: Set<string>): string => {
  // * ? : / \ [ ] — Excel's forbidden set, exactly as `exceljs` tests for it.
  // The 31-character cap comes before the apostrophe strip and not after:
  // cutting a long name can leave a quote as its last character, which is its
  // own refusal.
  let name = String(raw ?? '').replace(/[*?:/\\[\]]/g, '-').trim().slice(0, 31).replace(/^'+|'+$/g, '').trim();
  if (!name || name.toLowerCase() === 'history') {
    name = String(fallback || 'Sheet').slice(0, 31).replace(/^'+|'+$/g, '').trim() || 'Sheet';
  }

  let candidate = name;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
};

/**
 * Whether running the suite would test something other than the current
 * source: the suite itself is stale, or the code it runs against is
 * (`generationBlockers`). The stale notice at the top of the page names which.
 */
const testRunBlocked = (project: Project | null): boolean =>
  generationBlockers(project, 'testing').length > 0 ||
  workflowSteps(project).find((p) => p.key === 'testing')?.state === 'stale';

/** Main column and a 360 px side column, as in proposal A; one column below `lg`. */
const RAIL_GRID = 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start';

const AUTH_TYPE_OPTIONS = [
  { value: 'basic', label: 'Basic Authentication (Username + Password)' },
  { value: 'oauth2', label: 'OAuth 2.0 Client Credentials (Client ID + Secret)' },
  { value: 'sap_hub', label: 'SAP Business Accelerator Hub Sandbox (API Key only)' },
  { value: 'btp_destination', label: 'SAP Destination service (paste JSON)' },
] as const;

/** The plain name of a stored authentication type — the option label without its parenthesis. */
const authLabelOf = (authType: string): string =>
  (AUTH_TYPE_OPTIONS.find((o) => o.value === authType)?.label || authType).replace(/\s*\(.*\)$/, '');

const ODATA_PROPERTY_COLUMNS = [
  { key: 'name', label: 'Property' },
  { key: 'type', label: 'Type' },
  { key: 'nullable', label: 'Nullable' },
] as const;

export default function TestingSandboxPage() {
  const { projectId } = useParams();
  const router = useRouter();
  const { profile } = useUserProfile();
  /** Roadmap 1.2 — this stage calls a model, so it has a switch and it can be keyless. */
  const modelAvailability = useModelAvailability();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  /**
   * What is actually in the vault. The connection test runs server-side against
   * the stored credentials and nothing else — deliberately, so that asking for
   * stored credentials cannot redirect them to a URL of the caller's choosing.
   * The screen said it was testing whatever stood in the form, which was a
   * different statement as soon as the form had been edited since it was saved
   * (QA review of 33471220d6e9, 40e1db9fd37a).
   */
  const [savedS4, setSavedS4] = useState<{ url: string; username: string; authType: string; btpDestinationJson: string; legacy?: boolean } | null>(null);
  /** "You have not saved this yet" is not a failed connection — see the test handler. */
  const [unsavedNotice, setUnsavedNotice] = useState('');
  /** An export that fails has to say so on the page; see `exportTestCasesToExcel`. */
  const [exportError, setExportError] = useState('');
  const [selectedTestCases, setSelectedTestCases] = useState<number[]>([]);

  /**
   * Whether the tenant section is open. A section of the tool, not a mode of
   * it: opening it changes nothing about what Run does (owner 02.10.2026).
   */
  const [showTenant, setShowTenant] = useState(false);
  // S/4HANA Connection states
  const [s4Url, setS4Url] = useState('');
  const [s4Username, setS4Username] = useState('');
  const [s4Password, setS4Password] = useState('');
  const [s4AuthType, setS4AuthType] = useState<'basic' | 'oauth2' | 'sap_hub' | 'btp_destination'>('basic');
  const [btpDestinationJson, setBtpDestinationJson] = useState('');
  const [showS4Password, setShowS4Password] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [accessRequestedMotivation, setAccessRequestedMotivation] = useState('');
  /** Why the last access request did not go through. Empty when none has failed. */
  const [accessRequestError, setAccessRequestError] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'failed'>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(true);
  /**
   * The log of the tenant checks of this session — the connection check, the
   * metadata read and the read-only call. Its own state, not the run console's:
   * the check and the run are two different jobs, and a mock run must not overwrite the
   * record of the last check (or the other way round).
   */
  const [tenantLog, setTenantLog] = useState('');
  /** When the last connection check of this session answered, and whether it got through. Nothing is stored. */
  const [lastCheck, setLastCheck] = useState<{ at: Date; ok: boolean } | null>(null);
  const [showLastCheck, setShowLastCheck] = useState(false);
  /** The saved connection is shown as a summary; the form opens to change it. */
  const [editingConnection, setEditingConnection] = useState(false);
  const [showMoreChecks, setShowMoreChecks] = useState(false);
  const [confirmDeleteConnection, setConfirmDeleteConnection] = useState(false);
  const [deletingConnection, setDeletingConnection] = useState(false);
  const [deleteConnectionError, setDeleteConnectionError] = useState('');

  // OData Metadata Fetch states
  const [odataMode, setOdataMode] = useState<'idle' | 'loading' | 'catalog' | 'metadata' | 'error'>('idle');
  const [odataCatalog, setOdataCatalog] = useState<Array<{ title: string; path: string; serviceUrl: string }>>([]);
  const [odataSuggestedServices, setOdataSuggestedServices] = useState<Array<{ title: string; path: string }>>([]);
  const [odataEntityTypes, setOdataEntityTypes] = useState<Array<{ name: string; properties: Array<{ name: string; type: string; nullable: boolean }> }>>([]);
  const [odataServicePath, setOdataServicePath] = useState('');
  // Per-entity-set result of an actual read against the connected tenant.
  const [odataReadState, setOdataReadState] = useState<
    Record<string, { status: 'reading' | 'done' | 'failed'; message: string; recordCount?: number }>
  >({});
  const [odataSelectedService, setOdataSelectedService] = useState('');
  const [odataMessage, setOdataMessage] = useState('');
  const [odataTotalServices, setOdataTotalServices] = useState(0);
  const [odataExpandedEntity, setOdataExpandedEntity] = useState<string | null>(null);
  const [odataCatalogSearch, setOdataCatalogSearch] = useState('');

  /**
   * Owner decision 03.10.2026: a scenario states where in the legacy source it
   * comes from, and that statement is checked against the source the active
   * run signed — its rules and decision points derived here, its findings read
   * by the server with the run's catalog.
   */
  const originSha = useMemo(() => signedForOrigin(project).signed?.sha256 ?? null, [project]);
  const originEvidence = useProjectEvidence(projectId as string, !!originSha, `${project?.activeRunId ?? ''}#${originSha ?? ''}`);
  const originFindings = useMemo(() => findingsForOrigin(originEvidence, originSha), [originEvidence, originSha]);
  const originEngine = useScenarioOriginEngine(project, originFindings);
  const { isGenerating, testCases, generateTestCases, storedSuiteRejected } = useTestGeneration(projectId as string, project, setProject, originFindings);
  /** Why the last generation attempt produced nothing. Empty when none has failed. */
  const [genError, setGenError] = useState('');
  /**
   * The project as the run sees it: always against mocks. An earlier build
   * stored the tenant tab as `s4Environment: 'live'`, and with that value the
   * hook refuses the run as locked — so a project left on that tab would
   * have had a Run button that could never run, and no switch left to undo
   * it. The value stays as stored; the run does not read it from here.
   */
  const runProject = useMemo<Project | null>(
    () => (project && project.s4Environment === 'live' ? { ...project, s4Environment: 'mock' } : project),
    [project],
  );
  const { isRunning, testResults, sandboxOutput, aiExplanation, runTestCases, stubbedPackages, runError } = useTestExecution(projectId as string, runProject, setProject);
  const [showTestCode, setShowTestCode] = useState(false);
  /**
   * ADR-075 — the full record of a result from the reader's own SAP system
   * (`test_results/current`, per-scenario results and unmatched methods). The
   * summary the phase contract reads is on the project document already.
   */
  const [sapRecord, setSapRecord] = useState<OutsideTestRecord | null>(null);
  /** The run console is folded until a run (or the reader) opens it. */
  const [showConsole, setShowConsole] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchProject = async () => {
      // Without the catch, a rejected load left the page on "Loading" for good
      // and the rejection unhandled (QA review of 33471220d6e9, 03380a33a523).
      try {
        const data = await loadProjectAndHydrate(projectId as string);
        if (!enforceActiveRun(data, projectId as string)) return;
        if (data) {
          setProject(data);
          // A project an earlier build left on the tenant tab opens with the
          // tenant section open — where its reader last was. Only on load:
          // the reader opens and closes it from here on.
          if (data.s4Environment === 'live') setShowTenant(true);
        } else {
          setLoadError('This project could not be found.');
        }
      } catch (err) {
        console.error('Failed to load project:', err);
        setLoadError('The project could not be loaded. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  useEffect(() => {
    if (project) {
      // F-03: Load S4 metadata (non-secret) — password is write-only
      if (project.s4Meta?.configured) {
        setSavedS4({ url: project.s4Meta.url || '', username: project.s4Meta.username || '', authType: (project.s4Meta.authType as string) || 'basic', btpDestinationJson: '' });
        setS4Url(project.s4Meta.url || '');
        setS4Username(project.s4Meta.username || '');
        setS4AuthType((project.s4Meta.authType as any) || 'basic');
        setS4Password('');
        if (project.s4Meta.url) setShowSetupGuide(false);
      } else if (project.s4Config) {
        // Legacy fallback
        setSavedS4({ url: project.s4Config.url || '', username: project.s4Config.username || '', authType: project.s4Config.authType || 'basic', btpDestinationJson: project.s4Config.btpDestinationJson || '', legacy: true });
        setS4Url(project.s4Config.url || '');
        setS4Username(project.s4Config.username || '');
        setS4Password('');
        setS4AuthType(project.s4Config.authType || 'basic');
        setBtpDestinationJson(project.s4Config.btpDestinationJson || '');
        if (project.s4Config.url) setShowSetupGuide(false);
      } else if (profile?.s4Meta?.configured) {
        setSavedS4({ url: profile.s4Meta.url || '', username: profile.s4Meta.username || '', authType: (profile.s4Meta.authType as string) || 'basic', btpDestinationJson: '' });
        setS4Url(profile.s4Meta.url || '');
        setS4Username(profile.s4Meta.username || '');
        setS4AuthType((profile.s4Meta.authType as any) || 'basic');
        setS4Password('');
        if (profile.s4Meta.url) setShowSetupGuide(false);
      } else if (profile?.s4Config) {
        // Legacy fallback
        setSavedS4({ url: profile.s4Config.url || '', username: profile.s4Config.username || '', authType: profile.s4Config.authType || 'basic', btpDestinationJson: profile.s4Config.btpDestinationJson || '', legacy: true });
        setS4Url(profile.s4Config.url || '');
        setS4Username(profile.s4Config.username || '');
        setS4Password('');
        setS4AuthType(profile.s4Config.authType || 'basic');
        setBtpDestinationJson(profile.s4Config.btpDestinationJson || '');
        if (profile.s4Config.url) setShowSetupGuide(false);
      }
    }
  }, [project, profile]);

  /** Opens the tenant section and brings it into view — the side card's button. */
  const openTenant = () => {
    setShowTenant(true);
    requestAnimationFrame(() => document.getElementById('testing-tenant')?.scrollIntoView({ block: 'start' }));
  };

  const handleBtpJsonChange = (val: string) => {
    setBtpDestinationJson(val);
    try {
      const parsed = JSON.parse(val);
      if (parsed.URL) {
        setS4Url(parsed.URL);
      }
      if (parsed.Authentication === 'BasicAuthentication' && parsed.User) {
        setS4Username(parsed.User);
      }
    } catch(e) {
      // Invalid JSON typing - wait for completion
    }
  };

  const saveS4Config = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingConfig(true);
    try {
      // F-03: Save via encrypted server-side route
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/s4-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          url: s4Url,
          username: s4Username,
          password: s4Password,
          authType: s4AuthType,
          btpDestinationJson: s4AuthType === 'btp_destination' ? btpDestinationJson : '',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      // What the vault now holds — the connection test compares against this.
      setSavedS4({ url: s4Url, username: s4Username, authType: s4AuthType, btpDestinationJson });
      // The vault has it from here on: the password leaves the form and the save
      // is reported as done. Nothing else is written after it: the environment
      // preference that used to follow (and whose failure once reported a saved
      // connection as a failed save — QA full review of fc787674705f,
      // 983d23ce4dad) is gone with the tenant tab it remembered.
      setS4Password(''); // Clear from client state
      setEditingConnection(false);
      // A check of the previous connection says nothing about this one.
      setConnectionStatus('disconnected');
      setConnectionMessage("Configuration saved securely (encrypted).");
      setTimeout(() => setConnectionMessage(""), 3000);
    } catch (err: any) {
      console.error("Failed to save S/4 config:", err);
      setConnectionMessage(err.message || "Failed to save configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('disconnected');
    setConnectionMessage('');
    setUnsavedNotice('');
    
    const authLabel = s4AuthType === 'basic' ? 'Basic Auth' 
      : s4AuthType === 'oauth2' ? 'OAuth 2.0 Client Credentials' 
      : s4AuthType === 'sap_hub' ? 'SAP API Hub Sandbox Key'
      : 'SAP Destination service';

    // The test uses the saved connection, so it cannot run before there is one,
    // and it must not claim to be testing something the form has since changed.
    if (!savedS4 || !savedS4.url) {
      // Not `failed`: nothing was tested, so nothing failed. A red "connection
      // failed" for an unsaved form reads as a broken tenant
      // (UX review of 52f171091948, 1b84676d685d).
      setConnectionStatus('disconnected');
      setUnsavedNotice('Save the connection first — the test runs against the saved credentials, which never leave the server.');
      setTenantLog('');
      setTestingConnection(false);
      return;
    }
    // The password is write-only, so a filled password box is by definition a
    // change that has not been saved; the destination JSON is editable in the
    // same form and was left out of the comparison entirely
    // (QA review of 146ac2e1a724, 3909a7680413).
    const formChanged = savedS4.url !== s4Url
      || savedS4.username !== s4Username
      || savedS4.authType !== s4AuthType
      || savedS4.btpDestinationJson !== btpDestinationJson
      || s4Password.length > 0;
    if (formChanged) {
      setConnectionStatus('disconnected');
      setUnsavedNotice(`Unsaved changes — the test would run against the saved connection (${savedS4.url}), not what is in the form. Save first, then test.`);
      setTenantLog('');
      setTestingConnection(false);
      return;
    }

    setTenantLog(
      `[sandbox-runtime] Initiating live connectivity test...\n` +
      `[sandbox-runtime] Target tenant URL (saved): ${savedS4.url}\n` +
      `[sandbox-runtime] Authentication method: ${authLabel}\n` +
      `[sandbox-runtime] Sending server-side HTTP handshake via /api/test-s4-connection...\n`
    );

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const response = await fetch('/api/test-s4-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          useStoredCredentials: true,
        })
      });

      const result = await response.json();

      setLastCheck({ at: new Date(), ok: result.status === 'connected' });
      if (result.status === 'connected') {
        setConnectionStatus('connected');
        setConnectionMessage(result.message);
        setTenantLog(prev => prev +
          `[sandbox-runtime] [SUCCESS] ${result.message}\n` +
          (result.httpStatus ? `[sandbox-runtime] HTTP Status: ${result.httpStatus}\n` : '') +
          `[sandbox-runtime] Connection check complete.`
        );
      } else {
        setConnectionStatus('failed');
        setConnectionMessage(result.message);
        setTenantLog(prev => prev +
          `[sandbox-runtime] [ERROR] ${result.message}\n` +
          (result.httpStatus ? `[sandbox-runtime] HTTP Status: ${result.httpStatus}\n` : '') +
          `[sandbox-runtime] Connection check failed.`
        );
      }
    } catch (err) {
      setLastCheck({ at: new Date(), ok: false });
      setConnectionStatus('failed');
      const msg = err instanceof Error ? err.message : 'Network error — the test proxy may be unavailable.';
      setConnectionMessage(`Connection test failed: ${msg}`);
      setTenantLog(prev => prev +
        `[sandbox-runtime] [ERROR] ${msg}\n` +
        `[sandbox-runtime] Connection check failed.`
      );
    } finally {
      setTestingConnection(false);
    }
  };

  // --- OData Metadata Fetch ---
  const handleFetchODataCatalog = async () => {
    setOdataMode('loading');
    setOdataMessage('');
    setOdataEntityTypes([]);
    setOdataSelectedService('');
    setTenantLog(prev => prev + `\n[odata-explorer] Querying OData service catalog from ${savedS4?.url || 'the saved connection'} (saved connection)...\n`);

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const response = await fetch('/api/fetch-odata-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          useStoredCredentials: true,
        })
      });

      const result = await response.json();

      if (result.status === 'success') {
        setOdataCatalog(result.services || []);
        setOdataTotalServices(result.totalServices || 0);
        setOdataMode('catalog');
        setTenantLog(prev => prev + `[odata-explorer] [SUCCESS] Discovered ${result.totalServices} OData services on tenant.\n`);
      } else if (result.status === 'partial') {
        setOdataCatalog([]);
        setOdataSuggestedServices(result.suggestedServices || []);
        setOdataMessage(result.message || '');
        setOdataMode('catalog');
        setTenantLog(prev => prev + `[odata-explorer] [INFO] ${result.message}\n`);
      } else {
        setOdataMode('error');
        setOdataMessage(result.message || 'Failed to fetch catalog.');
        setTenantLog(prev => prev + `[odata-explorer] [ERROR] ${result.message}\n`);
      }
    } catch (err) {
      setOdataMode('error');
      const msg = err instanceof Error ? err.message : 'Network error';
      setOdataMessage(`Failed to fetch OData catalog: ${msg}`);
      setTenantLog(prev => prev + `[odata-explorer] [ERROR] ${msg}\n`);
    }
  };

  const handleFetchServiceMetadata = async (path: string) => {
    setOdataMode('loading');
    setOdataSelectedService(path);
    setOdataMessage('');
    setTenantLog(prev => prev + `\n[odata-explorer] Fetching $metadata for ${path}...\n`);

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const response = await fetch('/api/fetch-odata-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          useStoredCredentials: true,
          servicePath: path,
        })
      });

      const result = await response.json();

      if (result.status === 'success') {
        setOdataEntityTypes(result.entityTypes || []);
        setOdataMode('metadata');
        setOdataExpandedEntity(null);
        setTenantLog(prev => prev +
          `[odata-explorer] [SUCCESS] ${path}: ${result.totalEntityTypes} EntityTypes discovered.\n` +
          result.entityTypes.slice(0, 5).map((et: any) => `  → ${et.name} (${et.properties.length} properties)\n`).join('')
        );
      } else {
        setOdataMode('error');
        setOdataMessage(result.message || `Failed to fetch metadata for ${path}.`);
        setTenantLog(prev => prev + `[odata-explorer] [ERROR] ${result.message}\n`);
      }
    } catch (err) {
      setOdataMode('error');
      const msg = err instanceof Error ? err.message : 'Network error';
      setOdataMessage(`Metadata fetch failed: ${msg}`);
      setTenantLog(prev => prev + `[odata-explorer] [ERROR] ${msg}\n`);
    }
  };

  /**
   * Reads records from one entity set on the tenant the user has connected.
   *
   * This is the honest half of a widget that used to sit in stage 3 as a
   * "Differential Sandbox Tester": a setTimeout that announced "ResultSet
   * Equivalence Verified" over a hardcoded row count, having contacted nothing.
   * The route it should have been calling already existed and was reachable from
   * no UI at all.
   *
   * What this reports is exactly what came back — the record count and the field
   * names in the first record. It does NOT compare anything against the generated
   * TypeScript, so it does not use the word equivalence, and it does not sign
   * any finding off. A read that reaches the tenant proves the entity set is
   * there and readable with these credentials; that is worth knowing and it is
   * all it is worth calling.
   */
  const handleReadEntitySet = async (entitySet: string) => {
    setOdataReadState(prev => ({ ...prev, [entitySet]: { status: 'reading', message: '' } }));
    setTenantLog(prev => prev +
      `
[odata-explorer] Reading records from ${entitySet} via ${odataSelectedService || 'the selected service'}...
`);

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const response = await fetch('/api/test-s4-odata-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          useStoredCredentials: true,
          servicePath: odataSelectedService || undefined,
          entitySet,
        }),
      });
      const result = await response.json();

      if (result.status === 'success') {
        setOdataReadState(prev => ({
          ...prev,
          [entitySet]: { status: 'done', message: result.message || '', recordCount: result.recordCount },
        }));
        setTenantLog(prev => prev +
          `[odata-explorer] [SUCCESS] ${result.recordCount ?? 0} record(s) returned from ${entitySet}.
` +
          (result.sampleFields?.length
            ? `[odata-explorer] Fields in first record: ${result.sampleFields.join(', ')}
`
            : '') +
          `[odata-explorer] Read complete. Note: this is a read, not a comparison — nothing here checks the generated code against these rows.
`);
      } else {
        setOdataReadState(prev => ({
          ...prev,
          [entitySet]: { status: 'failed', message: result.message || 'Read failed.' },
        }));
        setTenantLog(prev => prev + `[odata-explorer] [ERROR] ${result.message || 'Read failed.'}
`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setOdataReadState(prev => ({ ...prev, [entitySet]: { status: 'failed', message: msg } }));
      setTenantLog(prev => prev + `[odata-explorer] [ERROR] ${msg}
`);
    }
  };

  const handleRequestAccess = async () => {
    const auth = getAuth();
    const uid = auth.currentUser?.uid;
    if (!uid || !profile) return;

    setIsRequestingAccess(true);
    setAccessRequestError('');
    try {
      // 1. The route first, and its answer read (QA full review of fc787674705f,
      // b1458e593475). It used to be awaited and ignored: a refused or failed
      // request left the reader with a button that had done nothing and no word
      // why. It also runs before the request log now, as it does in Settings —
      // the log is create-only for the requester (firestore.rules), so a log
      // written ahead of a failed request made every retry fail on the log.
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/request-tenant-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          uid,
          email: profile.email,
          name: `${profile.firstName} ${profile.lastName}`,
          motivation: accessRequestedMotivation || 'Live S/4HANA Public Cloud Sandbox Connection'
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'The access request could not be sent. Please try again.');
      }

      // 2. The request log in Firestore, once the request is in.
      const db = getDb();
      await setDoc(doc(db, 'tenant_access_requests', uid), {
        name: `${profile.firstName} ${profile.lastName}`,
        email: profile.email,
        motivation: (accessRequestedMotivation || 'Live S/4HANA Public Cloud Sandbox Connection').slice(0, 2000),
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // No local write here. The route sets `s4TenantAccessRequested` on the user
      // document and `useUserProfile` is subscribed to it, so the button flips to
      // "requested" when the write lands. The line that used to stand here mutated
      // the object the hook had handed out — which re-renders nothing and claimed
      // in its comment to do exactly that.
    } catch (err) {
      console.error("Failed to request tenant access:", err);
      setAccessRequestError(err instanceof Error && err.message ? err.message : 'The access request could not be sent. Please try again.');
    } finally {
      setIsRequestingAccess(false);
    }
  };

  /**
   * Removes the saved connection from the account — the vault entry and the
   * profile metadata that describes it (`DELETE /api/s4-credentials`, the same
   * erasure the route has always offered). Asked for in a Message Box first; a
   * refusal is said beside the card, and nothing is cleared until the server
   * has confirmed both deletes.
   */
  const handleDeleteConnection = async () => {
    setConfirmDeleteConnection(false);
    setDeletingConnection(true);
    setDeleteConnectionError('');
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/s4-credentials', {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The connection could not be deleted.');
      setSavedS4(null);
      setS4Url('');
      setS4Username('');
      setS4Password('');
      setBtpDestinationJson('');
      setConnectionStatus('disconnected');
      setConnectionMessage('');
      setUnsavedNotice('');
      setOdataMode('idle');
      setEditingConnection(false);
      setShowSetupGuide(true);
    } catch (err) {
      setDeleteConnectionError(err instanceof Error && err.message ? err.message : 'The connection could not be deleted.');
    } finally {
      setDeletingConnection(false);
    }
  };

  // A saved suite opens fully selected, as a freshly generated one does. Once the suite showed after a reload,
  // an empty selection left "Run Selected" disabled with nothing saying a tick was needed. Only the
  // first time the suite appears: a selection the reader changes afterwards stays theirs.
  const selectionSeeded = useRef(false);
  useEffect(() => {
    if (selectionSeeded.current || testCases.length === 0) return;
    selectionSeeded.current = true;
    setSelectedTestCases((prev) => (prev.length ? prev : testCases.map((_, i) => i)));
  }, [testCases]);

  /**
   * What generating the scenarios needs and does not have yet (owner report
   * 03.10.2026, the Transformation agent's finding): the button was
   * enabled, its click returned without a word when an input was stale, and
   * nothing checked for generated code or a design, so the prompt could carry
   * `undefined`. Each missing input is now a sentence with one action beside
   * the button, the button is disabled while one is missing, and an enabled
   * click always either starts (busy) or says why it did not.
   */
  const generatePrerequisites = generationPrerequisites(project, 'testing');
  const generateStale = generationBlockers(project, 'testing').length > 0;
  const generateBlocked = generatePrerequisites.length > 0 || generateStale;

  const handleGenerate = async () => {
    // Defensive: the button is disabled in both cases, and says why beside it.
    if (generateBlocked) {
      setGenError(
        generatePrerequisites.length > 0
          ? generatePrerequisites.map((p) => p.reason).join(' ')
          : 'The inputs were built for a previous source; the notice at the top of the page names the stage to regenerate first.',
      );
      return;
    }
    // Nor while the testing model stage is off or has no key: the proxy refuses
    // it, and "Regenerate Suite" used to start that request anyway
    // (QA full review of fc787674705f, 55b40120e11b).
    if (!modelAvailability.enabled('testing')) {
      setGenError(
        modelAvailability.keyAvailable
          ? 'Generating is off: turn the testing stage back on in Settings.'
          : 'Generating needs a model key: add your own Gemini API key in Settings.',
      );
      return;
    }
    setGenError('');
    try {
      const result = await generateTestCases();
      if (result && result.testCases) {
        setSelectedTestCases(result.testCases.map((_: any, i: number) => i));
        if (result.testCases.length === 0) {
          setGenError('The testing model answered without a single scenario. Generate again.');
        }
      }
    } catch (error) {
      // The console was the only place this went. A refused generation leaves
      // the page exactly as it was, which from the reader's side is a button
      // that does nothing — so the reason now stands next to the button
      // (roadmap 17.2), the way the documentation stage already does it.
      console.error("Failed to generate test cases:", error);
      setGenError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRun = async () => {
    // A suite written for a previous source tests nothing about the current one,
    // and neither does one built on stale upstream code — the notice at the top
    // of the page says which stage to regenerate (QA full review of
    // fc787674705f, a4439fbfd760).
    if (testRunBlocked(project)) return;
    const selected = testCases.filter((_, i) => selectedTestCases.includes(i));
    setShowConsole(true);
    try {
      await runTestCases(selected);
    } catch (error) {
      console.error("Failed to run test cases:", error);
    }
  };

  const getStats = () => {
    if (!testResults) return null;
    const total = testResults.length;
    // An empty result array is truthy, so `0 / 0` reached the dashboard as
    // `NaN%` and a broken chart. No tests executed is a state worth reporting;
    // it is not a pass rate.
    if (total === 0) return null;
    // `failed = total - passed` was true only while every test had a verdict.
    // A skipped test, or one the runner never mentioned, is neither passed nor
    // failed, and counting it as failed is as wrong as counting it as passed —
    // it just errs in the flattering direction for a different number.
    // Left to inference rather than annotated `any`: testResults is TestCase[],
    // so these comparisons are checked against the TestStatus union. A verdict
    // spelled 'passed' would now fail the build instead of counting as zero.
    const passed = testResults.filter((r) => r.status === 'Passed').length;
    const failed = testResults.filter((r) => r.status === 'Failed').length;
    const inconclusive = total - passed - failed;
    // A pass rate over tests that never ran is not a pass rate. The denominator
    // is the tests that actually returned a verdict, and null when none did.
    const verdicts = passed + failed;
    const passRate = verdicts > 0 ? Math.round((passed / verdicts) * 100) : null;

    const categories = Array.from(new Set(testResults.map((r) => r.category || 'Uncategorized')));
    const categoryStats = categories.map(cat => {
      const catTests = testResults.filter((r) => (r.category || 'Uncategorized') === cat);
      const catPassed = catTests.filter((r) => r.status === 'Passed').length;
      const catFailed = catTests.filter((r) => r.status === 'Failed').length;
      return {
        name: cat,
        passed: catPassed,
        failed: catFailed,
        inconclusive: catTests.length - catPassed - catFailed,
        total: catTests.length
      };
    });

    return { total, passed, failed, inconclusive, verdicts, passRate, categoryStats };
  };

  const stats = getStats();

  /**
   * A scenario's last verdict, from the same record as the facet tiles: the
   * covering receipt when there is one, else this session's run. Never the
   * status string stored on the case — a browser can write that.
   */
  const receiptVerdicts = new Map((coveringTestRunReceipt(project)?.verdicts ?? []).map((v) => [v.id, v.status as string]));
  const sessionVerdicts = new Map((testResults ?? []).map((r) => [String(r.id ?? ''), r.status as string | undefined]));
  const verdictOf = (tc: { id?: unknown }): string | null => {
    const id = String(tc.id ?? '');
    const v = run.kind === 'recorded' ? receiptVerdicts.get(id) : run.kind === 'session' ? sessionVerdicts.get(id) : undefined;
    return v ?? null;
  };
  /**
   * A scenario's last mock-run result for its details: the verdict as above,
   * and the runner's message — from this session's run, or the one
   * `/api/run-tests` stored on the case beside the receipt that covers it.
   */
  const sessionMessages = new Map((testResults ?? []).map((r) => [String(r.id ?? ''), r.message]));
  const scenarioResultOf = (tc: ScenarioCase): ScenarioRunResult => {
    const verdict = verdictOf(tc);
    if (!verdict) return { verdict: null, message: null };
    const id = String(tc.id ?? '');
    const message = run.kind === 'session' ? sessionMessages.get(id) : run.kind === 'recorded' ? tc.message : null;
    return { verdict, message: typeof message === 'string' && message.trim() ? message : null };
  };

  // Tests without a verdict get their own slice. Leaving them out would make a
  // chart of four passes and twenty skips look like a clean sweep. Colours from
  // `lib/chart-colors.ts` (§1.8): no chart is green, so a pass is `information`
  // there, a failure `error`, and "no verdict" the dashed not-determined area.
  const pieData: TestingPieSlice[] = stats ? [
    { name: RUNNER_PASS, value: stats.passed, color: stateChartColor('information').value },
    { name: 'Failed', value: stats.failed, color: stateChartColor('error').value },
    ...(stats.inconclusive > 0
      ? [{ name: 'Not determined', value: stats.inconclusive, color: 'var(--cc-surface-muted)', notDetermined: true }]
      : []),
  ] : [];

  const toggleTestCase = (index: number) => {
    setSelectedTestCases(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const exportTestCasesToExcel = async () => {
    setExportError('');
    try {
      if (!testCases || testCases.length === 0) return;

      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();

      // The names of the sheets already in the workbook, lower-cased — Excel
      // treats two names as the same if they differ only in case, and ExcelJS
      // refuses the second one.
      const takenSheetNames = new Set<string>();

      // 1. Summary sheet
      const wsSummary = wb.addWorksheet(excelSheetName("Test Suite Summary", "Summary", takenSheetNames));
      wsSummary.columns = [
        { header: 'ID', key: 'ID', width: 15 },
        { header: 'Name', key: 'Name', width: 35 },
        { header: 'Priority', key: 'Priority', width: 15 },
        { header: 'Status', key: 'Status', width: 15 }
      ];
      
      testCases.forEach(tc => {
        wsSummary.addRow({
          ID: renderSafeValue(tc.id) || 'N/A',
          Name: renderSafeValue(tc.name) || 'Untitled',
          Priority: renderSafeValue(tc.priority) || 'Medium',
          Status: 'Pending'
        });
      });

      // 2. Detail sheets
      testCases.forEach((tc, index) => {
        const safeId = renderSafeValue(tc.id) || `TC_${index}`;
        const wsDetail = wb.addWorksheet(excelSheetName(safeId, `TC_${index + 1}`, takenSheetNames));
        
        wsDetail.addRow(["Test Case ID", safeId]);
        wsDetail.addRow(["Test Case Name", renderSafeValue(tc.name) || 'Untitled']);
        wsDetail.addRow(["Priority", renderSafeValue(tc.priority) || 'Medium']);
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Description", renderSafeValue(tc.description) || '']);
        wsDetail.addRow(["Preconditions", renderSafeValue(tc.preconditions) || '']);
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Test Steps", ""]);
        
        const steps = Array.isArray(tc.steps) ? tc.steps : [tc.steps];
        steps.forEach((s: any, i: number) => {
          wsDetail.addRow([`Step ${i+1}`, renderSafeValue(s) || '']);
        });
        
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Expected Result", renderSafeValue(tc.expectedResult) || '']);
        wsDetail.addRow(["Test Data", renderSafeValue(tc.testData) || 'N/A']);
        wsDetail.addRow(["Validation Points", renderSafeValue(tc.validationPoints) || 'N/A']);
      });

      // 3. Generate file buffer and download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const projectName = project?.name?.replace(/\s+/g, '_') || 'Project';
      await saveAs(blob, `${projectName}_Test_Suite.xlsx`);
    } catch (err) {
      // The console was the only place this ever went. The button did nothing,
      // no file arrived, and the reader had no way to tell a refused download
      // from a browser that had swallowed it — so the failure is said out loud
      // now, next to the button that caused it.
      console.error("Excel export failed:", err);
      setExportError('The Excel export could not be produced. Please try again, and tell us if it keeps failing.');
    }
  };

  /** ABAP Cloud route: the suite is an ABAP Unit class, which nothing here can run (`lib/test-runnability.ts`). */
  const isAbapCloud = isAbapUnitRoute(project);
  /** ADR-075 — the result from the reader's own SAP system, as the phase contract reads it. */
  const outside = outsideReading(project);
  const outsideRecordedAt = outside.state === 'none' ? null : outside.summary.recordedAt;
  // Read through the auth store, not in render: on the server there is no auth (HTTP 500 on SSR otherwise).
  const signedInUid = useSignedInUid();
  const canRecordOutside = isProjectOwner(project, signedInUid);
  useEffect(() => {
    if (!isAbapCloud || !outsideRecordedAt) return undefined;
    let live = true;
    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/projects/${encodeURIComponent(String(projectId))}/test-results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as { record?: OutsideTestRecord | null } | null;
        if (live && res.ok && body?.record) setSapRecord(body.record);
      } catch (err) {
        // The summary on the project still drives the phase; only the per-scenario chips wait.
        console.error('The test results from your SAP system could not be read:', err);
      }
    })();
    return () => {
      live = false;
    };
  }, [isAbapCloud, outsideRecordedAt, projectId]);
  /** The record the server answered with, folded into the project the page holds. */
  const onOutsideRecorded = (record: OutsideTestRecord) => {
    setSapRecord(record);
    setProject((prev) => (prev ? { ...prev, outsideTestResult: summaryOf(record) } : prev));
  };
  /** Per scenario: the imported result, or the confirmation for the class — only while it is current. */
  const outsideOf = (index: number): ScenarioOutsideResult | null => {
    if (outside.state !== 'current') return null;
    if (outside.summary.kind === 'confirmed') {
      return { kind: 'confirmed', classPassed: outside.verifies, at: outside.summary.recordedAt };
    }
    if (!sapRecord || sapRecord.recordedAt !== outside.summary.recordedAt) return null;
    const r = sapRecord.results[index];
    return r ? { kind: 'imported', outcome: r.outcome, message: r.message, at: sapRecord.recordedAt } : null;
  };

  /** The engine's coverage report and the program's routines, read from the source on the project. */
  const program = useMemo(() => readProgram(project?.legacyCode), [project?.legacyCode]);
  /**
   * The findings for the strip's ticks. The evidence engine carries the SAP
   * catalog, so it is loaded after the page rather than in its bundle; until it
   * arrives the strip shows the routines and the hand-check marks only.
   */
  const [tickState, setTickState] = useState<{ code: string; ticks: StripTick[] } | null>(null);
  const evidenceFile = project?.auditMetadata?.inputFingerprint?.fileName || 'main.abap';
  const evidenceDeployment = project?.s4Deployment === 'public' ? 'public' : 'private';
  useEffect(() => {
    const code = project?.legacyCode;
    if (typeof code !== 'string' || !code.trim()) return undefined;
    let live = true;
    import('@/lib/abap/evidence-model')
      .then(({ buildAbapEvidence }) => {
        if (!live) return;
        const report = buildAbapEvidence(code, evidenceFile, evidenceDeployment);
        setTickState({
          code,
          ticks: report.findings.flatMap((f) => {
            const severity = normaliseSeverity(f.severity);
            return severity ? [{ id: f.id, line: f.lineStart, severity, title: f.title }] : [];
          }),
        });
      })
      .catch((err) => {
        // The strip still shows the routines and the hand-check marks.
        console.error('The evidence engine could not be loaded for the program strip:', err);
      });
    return () => {
      live = false;
    };
  }, [project?.legacyCode, evidenceFile, evidenceDeployment]);
  /** Ticks only for the source they were computed from. */
  const findingTicks: StripTick[] = tickState && tickState.code === project?.legacyCode ? tickState.ticks : [];

  /** The mono line under the lead: file, size, catalog and engine of the active run — only what was recorded. */
  const metaParts: MetaPart[] = [];
  {
    const fp = project?.auditMetadata?.inputFingerprint;
    const card = project?.auditMetadata?.modelCard;
    if (fp?.fileName) metaParts.push({ value: fp.fileName });
    const lineCount = fp?.lineCount ?? program?.lines;
    if (lineCount) metaParts.push({ value: `${lineCount} lines` });
    if (card?.catalogVersion) metaParts.push({ label: 'catalog', value: catalogForReader(card.catalogVersion), title: card.catalogVersion });
    if (card?.engineVersion) metaParts.push({ label: 'engine', value: card.engineVersion });
  }

  const phases = workflowSteps(project);
  /** The last run, from the receipt on the project or this session — never assumed. */
  const run = lastRun(project, testResults);
  /** Something to report on: scenarios, a suite that could not be read back, or a run. Until then the tool shows its first step, not a row of tiles saying None. */
  const hasTestingRecord = testCases.length > 0 || !!storedSuiteRejected || run.kind !== 'none';
  /**
   * The BYOT way as steps, each read from what the account and the vault hold.
   * An administrator has the connection without asking, so the request step is
   * not shown as a missing step for one.
   */
  const accessAllowed = !!profile?.s4TenantAccessAllowed;
  const byotSteps = [
    ...(profile?.isAdmin && !accessAllowed && !profile?.s4TenantAccessRequested
      ? []
      : [{ label: 'Access requested', done: !!profile?.s4TenantAccessRequested || accessAllowed }]),
    accessAllowed || !profile?.isAdmin
      ? { label: 'Reviewed by an admin', done: accessAllowed }
      : { label: 'Open to administrators', done: true },
    { label: 'Connection saved', done: !!savedS4?.url },
  ];


  // Block D (D.17a): one vocabulary of surfaces and type for the whole stage —
  // DESIGN.md §1.1–§1.4. A card is the workspace card, a field is the field, a
  // label is the micro label; nothing here picks its own colour any more.
  // Fields are the library's `CcField` (D.17b), so they have no class here.
  const CARD = 'bg-cc-surface border border-cc-line rounded-cc-card shadow-cc';
  const LABEL = 'cc-text-label text-cc-ink-muted';
  const CODE = 'bg-cc-surface px-1 py-0.5 rounded font-cc-mono text-[12px] border border-cc-line';
  const authOption = (selected: boolean) =>
    clsx(
      'p-3 rounded-cc-row border cc-text-meta font-medium leading-relaxed transition-colors',
      selected ? 'bg-cc-surface border-cc-ink ring-1 ring-cc-ink' : 'bg-cc-surface border-cc-line',
    );
  const STEP = 'bg-cc-ink text-cc-on-dark cc-text-meta w-6 h-6 rounded-cc-row flex items-center justify-center shrink-0';

  /** Why the scenarios cannot be generated now — beside the button, never in a hover title. */
  const generateWhy = generateBlocked ? (
    <div id="testing-generate-why" data-generation-prerequisites="" className="w-full">
      <CcMessageStrip
        state="information"
        headline={testCases.length > 0 ? 'The scenarios cannot be regenerated yet.' : 'The scenarios cannot be generated yet.'}
      >
        <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
          {generatePrerequisites.map((p) => (
            <li key={p.id} data-generation-prerequisite={p.id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">{p.reason}</span>
              <CcLinkButton href={`/project/${String(projectId)}/${p.action.stage}`} icon={<ArrowRight size={16} aria-hidden="true" />}>
                {p.action.label}
              </CcLinkButton>
            </li>
          ))}
          {generatePrerequisites.length === 0 && generateStale ? (
            <li data-generation-prerequisite="stale">
              The inputs were built for a previous source. The notice at the top of the page names the stage to regenerate first.
            </li>
          ) : null}
        </ul>
      </CcMessageStrip>
    </div>
  ) : null;

  if (loading) return <StageFrame stage="testing" className="cc-text-body text-cc-ink-muted">Loading...</StageFrame>;
  if (loadError) return (
    <StageFrame stage="testing">
      <div className="max-w-xl">
        <CcMessageStrip
          state="error"
          headline="This stage could not be opened"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          {loadError}
        </CcMessageStrip>
      </div>
    </StageFrame>
  );

  return (
    <StageFrame stage="testing" className="min-h-screen">
      <StaleNotice
        title={`Built for ${previousBasis(project)}`}
        reasons={[
          ...generationBlockers(project, 'testing'),
          ...(phases.find((p) => p.key === 'testing')?.state === 'stale'
            ? [`The test cases shown here were written for ${previousBasis(project)}. Running them tests nothing about the current one.`]
            : []),
        ]}
      />

      <StageHeader stage="testing" tools={{ steps: phases, current: 'testing' }} projectName={project?.name}>
        {/* What the tool does, in one sentence, before anything else (owner
            02.10.2026: "it is a tool, not a tab"). Said per route, because
            the two routes differ in the one thing a reader needs to know: on
            the CAP route the scenarios really run — in the isolated runner,
            against SAP mocks — and on the ABAP Cloud route nothing here can
            run an ABAP Unit class (lib/test-runnability.ts). */}
        <span data-testing-lead="">
          {isAbapCloud
            ? 'Writes test scenarios from the target code as an ABAP Unit class and lists what a tester must check by hand. Nothing is compiled or executed in SAP ADT here: ABAP Unit runs only in your own ABAP system, and tests on a tenant are locked.'
            : 'Writes test scenarios from the target code, runs them in an isolated runner against SAP mocks — not in your S/4HANA system — and lists what a tester must check by hand. Tests on a tenant are locked.'}
        </span>
      </StageHeader>

      <TestingMetaLine parts={metaParts} />

      {/* Where testing stands — only once there is something to stand on. On
          an empty project the four tiles said None, None, a count and Locked
          above the one thing to do; the first step now comes first, and the
          tiles arrive with the scenarios. */}
      {hasTestingRecord ? (
        <TestingHeader
          scenarios={{
            count: testCases.length,
            rejected: !!storedSuiteRejected,
            emptyReason: modelAvailability.enabled('testing')
              ? 'Generate them from the target code (step 1)'
              : 'Generating them needs the testing model, which is not available for this account',
          }}
          run={run}
          blocked={testRunBlocked(project)}
          isAbapCloud={isAbapCloud}
          outside={outside}
          handChecks={{
            count: program ? program.gaps.length : null,
            lines: program ? program.gaps.map((g) => g.firstLine) : [],
          }}
          tenantLocked={LIVE_TEST_EXECUTION.locked}
          status={[
            testCases.length > 0
              ? { label: 'Suite', value: 'model proposal', tone: 'proposal' }
              : { label: 'Suite', value: 'not written yet', tone: 'plain' },
            {
              label: 'Runner',
              value: isAbapCloud ? 'none for ABAP Unit here' : 'isolated runner, SAP mocks',
              tone: 'plain',
            },
            { label: 'Tenant', value: 'connection check only', tone: 'plain' },
          ]}
        />
      ) : null}

      {/* One guided flow instead of tabs, a segmented switch and cards inside
          them: write → run → check by hand, each a numbered step that says
          whether it is done, next or waiting. The tenant is not a mode of
          the tool any more — it is a folded section at the end and a card in
          the side column, and the run is always against mocks. */}
      <div data-testing-flow="" className={clsx(RAIL_GRID, 'mb-8')}>
        <div className="flex min-w-0 flex-col gap-5">
          {/* ── Step 1: write the scenarios ── */}
          <ToolSection
            id="testing-write"
            data-testing-step="write"
            step={{ n: 1, state: testCases.length > 0 ? 'done' : 'next' }}
            title="Write the scenarios"
            titleExtra={testCases.length > 0 ? <CcProvenanceChip value="proposed" /> : null}
            actions={
              // Only once the suite exists: before that the step's own button
              // below is the action, and one action is offered once.
              testCases.length > 0 ? (
                <>
                  <CcButton
                    variant="ghost"
                    onClick={exportTestCasesToExcel}
                    icon={<Download size={14} aria-hidden="true" />}
                  >
                    Export Excel
                  </CcButton>
                  <CcButton
                    onClick={handleGenerate}
                    disabled={isGenerating || !modelAvailability.enabled('testing') || generateBlocked}
                    aria-describedby={generateBlocked ? 'testing-generate-why' : undefined}
                    data-generate-scenarios=""
                    icon={isGenerating ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : undefined}
                  >
                    {isGenerating ? 'Generating...' : 'Regenerate Suite'}
                  </CcButton>
                </>
              ) : null
            }
            lead={
              testCases.length > 0
                ? `The testing model wrote ${scenarios(testCases.length)} from the target code. They are its proposal until a run gives them a verdict.`
                : 'The testing model writes them from the target code. They are its proposal until a run gives them a verdict.'
            }
          >
            {testCases.length === 0 && !modelAvailability.enabled('testing') ? (
              /* Roadmap 1.2 / V25-A12 — a button the server refuses tells the
                 reader nothing about why. */
              <NotGenerated
                what="Test suite"
                absence={modelAvailability.keyAvailable ? 'stage-off' : 'no-key'}
                stage="testing"
                hint={
                  modelAvailability.keyAvailable
                    ? 'Turn the testing stage back on in Settings to generate it.'
                    : 'Add your own Gemini API key in Settings to generate it.'
                }
              />
            ) : testCases.length === 0 ? (
              <div data-testing-generate="" className="flex flex-col items-start gap-3">
                {/* A stored suite that cannot be drawn is a fact about this
                    project, not the same thing as never having generated one.
                    Without this line the reader is told to start something he
                    already did, and the reason his last suite vanished is
                    nowhere on the screen. */}
                {storedSuiteRejected ? (
                  <p data-stored-test-suite-rejected className="m-0 cc-text-cell text-cc-ink-muted leading-relaxed">
                    {STORED_TEST_SUITE_REJECTED}
                  </p>
                ) : null}
                {/* No bounce, no second copy in a card header: the only action of
                    an empty tool, at the top of it. */}
                {generateWhy}
                <CcButton
                  variant="primary"
                  density="cozy"
                  onClick={handleGenerate}
                  disabled={isGenerating || generateBlocked}
                  aria-describedby={generateBlocked ? 'testing-generate-why' : undefined}
                  data-generate-scenarios=""
                  icon={isGenerating ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <ListChecks className="w-4 h-4" aria-hidden="true" />}
                >
                  {isGenerating ? 'Generating scenarios...' : 'Generate scenarios'}
                </CcButton>
                {genError && (
                  <p data-test-generation-error role="alert" className="m-0 cc-text-cell font-semibold leading-relaxed text-cc-error">
                    {genError}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {generateWhy}
                {/* The same message as in the empty state, because "Regenerate
                    Suite" can be refused too — and there the previous suite is
                    still on the screen, so without this the button simply
                    appears to do nothing. */}
                {genError && (
                  <div data-test-generation-error>
                    <CcMessageStrip state="error">{genError}</CcMessageStrip>
                  </div>
                )}

                {/* Why "Regenerate Suite" is disabled — the same way out the
                    empty state names. */}
                {!modelAvailability.enabled('testing') && (
                  <div data-regenerate-unavailable>
                    <CcMessageStrip state="neutral">
                      {modelAvailability.keyAvailable
                        ? 'Regenerating is off: turn the testing stage back on in Settings.'
                        : 'Regenerating needs a model key: add your own Gemini API key in Settings.'}
                    </CcMessageStrip>
                  </div>
                )}

                {exportError && (
                  <span data-export-error role="alert" className="flex items-center gap-2 cc-text-meta text-cc-error">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {exportError}
                  </span>
                )}

                <p className="m-0 cc-text-cell text-cc-ink">
                  {scenarios(testCases.length)} written ·{' '}
                  <a href="#testing-scenarios" className="font-semibold text-cc-information hover:underline">
                    See the list
                  </a>
                </p>
              </div>
            )}
          </ToolSection>

          {/* ── Step 2: run them against mocks ── */}
          <ToolSection
            id="testing-verified"
            data-testing-results=""
            data-testing-step="run"
            step={{
              n: 2,
              // ADR-075: on the ABAP Cloud route the step shows the result from
              // the reader's own SAP system once one is on record.
              word: isAbapCloud
                ? outside.state === 'current'
                  ? outside.verifies
                    ? 'No failure in your SAP system'
                    : 'Failing or incomplete in your SAP system'
                  : 'Not run here'
                : undefined,
              state: isAbapCloud
                ? outside.state === 'current' && outside.verifies
                  ? 'done'
                  : 'unavailable'
                : testCases.length === 0
                  ? 'waiting'
                  : run.kind === 'recorded' || run.kind === 'session'
                    ? 'done'
                    : 'next',
            }}
            title="Run them against mocks"
            actions={
              // Offered only where it can run: there are scenarios, and the
              // route's suite is one the isolated runner executes.
              !isAbapCloud && testCases.length > 0 ? (
                <CcButton
                  variant="primary"
                  onClick={handleRun}
                  disabled={isRunning || selectedTestCases.length === 0 || testRunBlocked(project)}
                  icon={isRunning ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Play className="w-4 h-4" />}
                >
                  {isRunning
                    ? 'Running...'
                    : selectedTestCases.length > 0 && selectedTestCases.length < testCases.length
                      ? `Run ${selectedTestCases.length} selected against mocks`
                      : 'Run tests against mocks'}
                </CcButton>
              ) : null
            }
            lead={
              isAbapCloud
                ? undefined
                : testCases.length === 0
                  ? 'Runs once the scenarios are written — in an isolated runner against SAP mocks, never in your S/4HANA system.'
                  : selectedTestCases.length > 0 && selectedTestCases.length < testCases.length
                    ? `Runs the ${selectedTestCases.length} selected of ${scenarios(testCases.length)} in an isolated runner against SAP mocks — not in your S/4HANA system. A pass here is “${RUNNER_PASS}”, not proof in your system.`
                    : `Runs all ${scenarios(testCases.length)} in an isolated runner against SAP mocks — not in your S/4HANA system. A pass here is “${RUNNER_PASS}”, not proof in your system.`
            }
          >
            {isAbapCloud && outside.state === 'current' ? (
              <p data-testing-run-outside={outside.summary.kind} className="m-0 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink">
                <CcProvenanceChip value={outside.summary.kind} note={outsideChipNote(outside.summary.kind)} />
                <span>{outsideCountsLine(outside.summary)} — run in your SAP system, not here.</span>
                <a href="#testing-sap-result" className="font-semibold text-cc-information hover:underline">
                  See the result
                </a>
              </p>
            ) : isAbapCloud ? (
              // Said before the click, not after it: the hook used to answer the
              // click with a run it made up in the browser.
              <div data-testing-run-unavailable="">
                <CcMessageStrip state="neutral">
                  {ABAP_UNIT_NOT_RUNNABLE}
                </CcMessageStrip>
              </div>
            ) : null}

            {/* The reason itself is in the notice at the top of the page. */}
            {!isAbapCloud && testRunBlocked(project) && testCases.length > 0 && (
              <div data-stale-run-hint className="mb-4">
                <CcMessageStrip state="neutral">Running is off until the suite is regenerated for the current source — the notice at the top says which stage comes first.</CcMessageStrip>
              </div>
            )}

            {/* Why the last run gave no verdict at all — on the page, not only
                in the folded console (owner report 02.10.2026). */}
            {runError && (
              <div data-test-run-error="" role="alert" className="mb-4">
                <CcMessageStrip state="error" headline="The run gave no result">
                  {runError}
                </CcMessageStrip>
              </div>
            )}

            {/* Counters once there is something to count: a run on record or
                in this session. Before that they were a row of zeros and
                dashes under a disabled button. */}
            {run.kind !== 'none' ? <TestPipeline written={testCases.length} run={run} /> : null}

                      {(testResults || aiExplanation) && (
                        <div className="mt-5 border-t border-cc-line pt-4">
                          <h3 id="testing-results-title" className="m-0 cc-text-h3 text-cc-ink">Results</h3>
                          <p className="m-0 mt-1 mb-4 cc-text-cell text-cc-ink-muted">
                            Results of the run in this session, in the isolated runner against mocks — real results for the code, not for a tenant.
                          </p>
                      {/* CR-14: the runner replaces every npm package the generated code
          imports with an empty proxy so the module can load. A pass against it
          says the logic ran — not that it works with those libraries — and until
          now nothing on this page said which ones had been replaced. */}
      {testResults && stubbedPackages.length > 0 && (
        <div className="mb-4" data-stubbed-packages>
          <CcMessageStrip state="warning" headline={`Ran against stubs for: ${stubbedPackages.join(', ')}.`}>
            These packages were replaced by an empty proxy so the code could load. A pass here shows the
            business logic ran — not that it works with them.
          </CcMessageStrip>
        </div>
      )}

      {aiExplanation && (
        <div className="mb-4 bg-cc-error-bg border border-cc-error-border rounded-cc-card p-4 md:p-6 flex flex-col sm:flex-row gap-4 items-start">
          <AlertTriangle className="w-6 h-6 text-cc-error shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="cc-text-h2 text-cc-ink">AI Test Analysis</h3>
              <CcProvenanceChip value="proposed" />
            </div>
            <div className="cc-prose">
              <ReactMarkdown>{aiExplanation}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {testResults && stats && (
        <div id="qa-report-dashboard" className="mt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div>
              <h3 className="cc-text-h3 text-cc-ink">Run report</h3>
              <p className="cc-text-cell text-cc-ink-muted">Automation report for {project?.name}</p>
            </div>
            <div className={clsx(CARD, 'px-4 py-2 flex items-center gap-4')}>
              <div className="flex items-center gap-2">
                <span data-chart-swatch aria-hidden="true" className={clsx('w-2 h-2 rounded-full', stateChartColor('information').bg)}></span>
                <span className="cc-text-meta text-cc-ink">{stats.passed} {RUNNER_PASS}</span>
              </div>
              <div className="flex items-center gap-2">
                <span data-chart-swatch aria-hidden="true" className={clsx('w-2 h-2 rounded-full', stateChartColor('error').bg)}></span>
                <span className="cc-text-meta text-cc-ink">{stats.failed} Failed</span>
              </div>
              {stats.inconclusive > 0 && (
                <div className="flex items-center gap-2">
                  <span data-chart-swatch data-not-determined aria-hidden="true" className={clsx('w-2 h-2 rounded-full', NOT_DETERMINED_CHART.bg)}></span>
                  <span className="cc-text-meta text-cc-ink">
                    {stats.inconclusive} Not determined
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
            {/* Pass Rate Card */}
            <div className={clsx(CARD, 'xl:col-span-4 p-6 flex flex-col items-center justify-center text-center')}>
              {mounted && <TestingPieChart pieData={pieData} stats={stats} />}
              <div className="mt-4 flex justify-center gap-8">
                <div className="text-center">
                  <p className="cc-text-title text-cc-ink">{stats.passed}</p>
                  <p className={clsx(LABEL, 'border-t border-cc-line pt-1')}>{RUNNER_PASS}</p>
                </div>
                <div className="text-center">
                  <p className="cc-text-title text-cc-ink">{stats.failed}</p>
                  <p className={clsx(LABEL, 'border-t border-cc-line pt-1')}>Failed</p>
                </div>
                {stats.inconclusive > 0 && (
                  <div className="text-center">
                    <p className="cc-text-title text-cc-ink">{stats.inconclusive}</p>
                    <p className={clsx(LABEL, 'border-t border-cc-line pt-1')}>Not determined</p>
                  </div>
                )}
              </div>
              {stats.inconclusive > 0 && (
                <p className="mt-4 cc-text-meta font-medium leading-relaxed text-cc-ink-muted max-w-[22rem]">
                  {stats.inconclusive} of {stats.total} produced no result — skipped, or the runner
                  never reported on them. The rate above is of the {stats.verdicts} that did.
                </p>
              )}
            </div>

            {/* Category Performance */}
            <div className={clsx(CARD, 'xl:col-span-8 p-4 md:p-6 overflow-hidden')}>
              <h4 className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cc-ink-muted" aria-hidden="true" />
                Results by category
              </h4>
              <div className="h-[250px] md:h-[300px]">
                {mounted && <TestingBarChart stats={stats} />}
              </div>
            </div>
          </div>

        </div>
      )}


                        </div>
                      )}
          </ToolSection>

          {/* ── The result from your SAP system — the ABAP Cloud route's way to a
              verdict (ADR-075, owner 03.10.2026). Its own section beside step
              2, so the step that cannot run here keeps no button. ── */}
          {isAbapCloud && testCases.length > 0 ? (
            <ToolSection
              id="testing-sap-result"
              data-testing-sap-result=""
              title="Record the result from your SAP system"
              lead="Nothing here runs ABAP Unit. Bring the result from the system that did: the result file, or your confirmation that the class ran."
            >
              <SapResultCard
                projectId={String(projectId)}
                canRecord={canRecordOutside}
                reading={outside}
                record={sapRecord}
                onRecorded={onOutsideRecorded}
              />
            </ToolSection>
          ) : null}

          {/* ── Step 3: what a tester checks by hand ── */}
          <ToolSection
            id="testing-hand"
            data-testing-hand=""
            data-testing-step="hand"
            step={{ n: 3, state: 'open' }}
            title="Check by hand"
            aside={program ? program.gaps.length : undefined}
            lead="What no generated test covers: every construct the engine did not judge, with the line it starts on."
          >
            <HandChecks
              noSource={!program}
              gaps={program?.gaps ?? []}
              strip={program ? { lines: program.lines, bands: program.bands, marks: program.marks, ticks: findingTicks } : null}
            />
            {/* What the testing model itself says no unit test here can cover —
                only your own system can. It used to appear only after a run in
                this session, and never on the ABAP Cloud route, which has no
                run; it is part of "what only works outside" and stands here
                whether anything ran or not. */}
            {!storedSuiteRejected && Array.isArray(project?.manualTestingRequirements) && project.manualTestingRequirements.length > 0 ? (
              <div data-manual-requirements="" className="mt-5 border-t border-cc-line pt-4">
                <h3 className="m-0 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
                  Only in your SAP system, as the testing model names it
                  <CcProvenanceChip value="proposed" />
                </h3>
                <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                  {project.manualTestingRequirements.map((req, i) => (
                    <li key={i} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                      <p className="m-0 cc-text-cell font-semibold text-cc-ink">{req.area}</p>
                      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{req.reason}</p>
                      {Array.isArray(req.verificationSteps) ? (
                        <ol className="m-0 mt-2 list-decimal pl-5 cc-text-cell text-cc-ink">
                          {req.verificationSteps.map((step, k) => (
                            <li key={k}>{step}</li>
                          ))}
                        </ol>
                      ) : req.verificationSteps ? (
                        <p className="m-0 mt-2 cc-text-cell text-cc-ink">{req.verificationSteps}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ToolSection>

          {/* ── The scenarios, one row each — once there are any ── */}
          {testCases.length > 0 ? (
            <ToolSection
              id="testing-scenarios"
              data-testing-scenarios=""
              title="Scenarios"
              titleExtra={<CcProvenanceChip value="proposed" />}
              aside={testCases.length}
              lead={
                isAbapCloud
                  ? outside.state === 'current'
                    ? 'Written by the testing model from the generated code — one row each, with the result from your SAP system; open a row for everything it holds.'
                    : 'Written by the testing model from the generated code — one row each; open a row for everything it holds. They have no verdict here: ABAP Unit runs in your own system.'
                  : 'Written by the testing model from the generated code — one row each, with its last verdict; open a row for everything it holds.'
              }
            >
              {/* Details, scope per scenario and what to do next (owner
                  03.10.2026). The selection exists only where there is a mock
                  run to select for — not on the ABAP Cloud route. */}
              <ScenarioList
                cases={testCases as unknown as ScenarioCase[]}
                isAbapCloud={isAbapCloud}
                suiteCode={!storedSuiteRejected && typeof project?.testSuite?.code === 'string' ? project.testSuite.code : null}
                selectable={!isAbapCloud}
                selected={selectedTestCases}
                onToggle={toggleTestCase}
                resultOf={scenarioResultOf}
                runAt={run.kind === 'recorded' ? run.at : null}
                tenantLocked={LIVE_TEST_EXECUTION.locked}
                projectName={project?.name}
                origin={originEngine}
                outsideOf={isAbapCloud ? outsideOf : undefined}
                onShowOutput={testResults ? () => {
                  setShowConsole(true);
                  requestAnimationFrame(() => document.querySelector('[data-testing-console]')?.scrollIntoView({ block: 'start' }));
                } : undefined}
              />
            </ToolSection>
          ) : null}

          {/* ── Run output: the console, one level deeper ── */}
          {/* Folded until there is something to read: a run opens it
              (see handleRun), and the module code is one click inside. */}
                    <section data-testing-console className={clsx(CARD, 'px-4 py-3')}>
                      <CcDisclosure title="Run output and module code" level={2} open={showConsole} onOpenChange={setShowConsole}>
                      {/* The terminal is code, and code is one of the two dark surfaces
            DESIGN.md §1.1 allows. */}
        <div className="bg-cc-code-bg rounded-cc-card border border-cc-line overflow-hidden flex flex-col h-80">
          <div className="bg-cc-code-bg border-b border-cc-code-muted/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 shrink-0" aria-hidden="true">
                <div className="w-2 h-2 rounded-full bg-cc-code-muted"></div>
                <div className="w-2 h-2 rounded-full bg-cc-code-muted"></div>
                <div className="w-2 h-2 rounded-full bg-cc-code-muted"></div>
              </div>
              <div className="flex items-center gap-2 text-cc-code-muted ml-1 md:ml-2 min-w-0">
                <TerminalIcon className="w-4 h-4 shrink-0" />
                <span className="text-[12px] font-cc-mono truncate">
                  {isAbapCloud ? 'abap-unit ~ test class, not run here' : 'isolated-runner ~ node --test'}
                </span>
              </div>
            </div>
            <CcButton variant="ghost" onClick={() => setShowTestCode(!showTestCode)}>
              {isAbapCloud
                ? (showTestCode ? 'View Output' : 'View ABAP Unit Class')
                : (showTestCode ? 'View Output' : 'View Module Code')
              }
            </CcButton>
          </div>
          <div className="p-4 md:p-6 font-cc-mono text-[12px] md:text-[13px] bg-cc-code-bg text-cc-code-ink flex-grow overflow-auto custom-scrollbar">
            {showTestCode ? (
              <pre
                data-stage-output={project?.testSuite?.code ? 'testSuite' : undefined}
                className="whitespace-pre-wrap leading-relaxed text-cc-code-name"
              >
                {(!storedSuiteRejected && project?.testSuite?.code) || (isAbapCloud ? 'No ABAP Unit class written yet. Generate the scenarios (step 1) to see it here.' : 'No test code generated yet.')}
              </pre>
            ) : (
              <pre className="whitespace-pre-wrap leading-relaxed" data-console-idle={sandboxOutput ? undefined : ''}>
                {/* Nothing is initialised before a run, and on the ABAP route
                    nothing runs here at all (owner, 03.10.2026: the header said
                    "not run here" over "Sandbox initialized. Waiting for
                    execution…"). */}
                {isAbapCloud
                  ? 'Nothing runs here. ABAP Unit runs in your SAP system: copy the test class into ADT and run it there (Ctrl+Shift+F10).'
                  : sandboxOutput || 'No run yet. Tick the scenarios and start a mock run; its console output appears here.'}
              </pre>
            )}
          </div>
        </div>
                      </CcDisclosure>
                      {!showConsole && (
                        <p className="cc-text-meta text-cc-ink-muted">The runner{"'"}s console and the generated test code — the technical detail behind the results.</p>
                      )}
                    </section>

          {/* ── The tenant: a connection check, not a mode of the tool ── */}
          {/* Folded at the end of the tool. It used to be the second tab, and
              choosing it switched the run button off: two jobs presented as
              one switch. It opens from the side card, and by itself for a
              project an earlier build left on the tenant tab. */}
          <section id="testing-tenant" data-testing-tenant="" className={clsx(CARD, 'scroll-mt-32 px-4 py-3')}>
            <CcDisclosure title="Tenant connection — check only" level={2} open={showTenant} onOpenChange={setShowTenant}>
              <div data-testing-panel="live" className="flex min-w-0 flex-col gap-4 pt-1">
                {/* Where the scenarios do run. Not a second lock notice — the one
                    below is the only one on this screen (roadmap 1.7). */}
                <p data-live-test-hint className="m-0 cc-text-cell text-cc-ink">
                  {isAbapCloud
                    ? 'Checks that your tenant answers, reads OData metadata and makes one read-only call. Running tests on a tenant is locked; ABAP Unit runs in your own system, never from here.'
                    : testCases.length > 0
                      ? `Checks that your tenant answers, reads OData metadata and makes one read-only call. Running tests on a tenant is locked: the ${scenarios(testCases.length)} run in step 2, against mocks.`
                      : 'Checks that your tenant answers, reads OData metadata and makes one read-only call. Running tests on a tenant is locked: scenarios run in step 2, against mocks.'}
                </p>
                    {LIVE_TEST_EXECUTION.locked && (
                      // The documented lock (lib/locked-paths.ts, G0:R0), said once, where
                      // the path would otherwise be offered — and with the way out named,
                      // so it is a boundary and not a dead end (roadmap 1.7, ADR-004).
                      // It stood in three places on this one screen before: here, as a
                      // pill on the tab, and beside the run button. Three copies of a
                      // refusal read as three different refusals.
                      <div data-live-test-lock>
                        <CcMessageStrip state="warning" headline="Tests against a tenant are locked">
                          <span className="block">{LIVE_TEST_EXECUTION.userNotice}</span>
                          <span className="block mt-2 font-semibold">
                            {profile?.s4TenantAccessAllowed || profile?.isAdmin
                              ? 'Bring your own tenant (BYOT) is granted for this account, so the connection check, the OData metadata read and the read-only call below are open to you.'
                              : profile?.s4TenantAccessRequested
                                ? 'Bring your own tenant (BYOT) is what opens the connection check, the OData metadata read and the read-only call — your request for it is with an administrator.'
                                : 'Bring your own tenant (BYOT) is what opens the connection check, the OData metadata read and the read-only call: ask for it with the form below and an administrator reviews it by hand.'}
                          </span>
                          <span className="block mt-1">That approval does not lift this lock: it is lifted when the isolated live runner has passed its proof on the deployed service and its review, not by a permission.</span>
                          {/* The way, as steps, each from what the account and the
                              vault hold. No dates: none of these steps is stored with
                              one, so none is shown. */}
                          <span data-byot-steps className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                            {byotSteps.map((step) => (
                              <span key={step.label} data-byot-step={step.done ? 'done' : 'open'} className="inline-flex items-center gap-2 cc-text-meta">
                                {step.done
                                  ? <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                                  : <Circle className="w-4 h-4 shrink-0" aria-hidden="true" />}
                                {step.label}
                                {!step.done && <span className="text-cc-ink-muted">— not yet</span>}
                              </span>
                            ))}
                          </span>
                        </CcMessageStrip>
                      </div>
                    )}

                    {profile?.s4TenantAccessAllowed || profile?.isAdmin ? (
                      <>
                        {savedS4?.url && !editingConnection ? (
                          // ── The saved connection, as a summary (s8) ──
                          <CcCard
                            title="Saved connection"
                            level={2}
                            meta={
                              connectionStatus === 'connected' && lastCheck?.ok ? (
                                <span className="inline-flex flex-wrap items-center gap-2">
                                  <CcProvenanceChip value="proven" />
                                  <span className="cc-text-meta text-cc-ink-muted">check passed <CcDateText value={lastCheck.at} format="datetime" /></span>
                                </span>
                              ) : connectionStatus === 'failed' ? (
                                <CcStateText state="error">Check failed</CcStateText>
                              ) : (
                                <CcStateText state="neutral" hollow>Not checked in this session</CcStateText>
                              )
                            }
                            actions={
                              <>
                                <CcButton variant="ghost" onClick={() => setEditingConnection(true)}>Edit</CcButton>
                                <CcButton
                                  variant="ghost"
                                  tone="danger"
                                  onClick={() => setConfirmDeleteConnection(true)}
                                  disabled={deletingConnection}
                                >
                                  {deletingConnection ? 'Deleting...' : 'Delete connection'}
                                </CcButton>
                              </>
                            }
                          >
                            <dl data-saved-connection className="m-0 grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-2">
                              <dt className={LABEL}>Tenant URL</dt>
                              <dd className="m-0 min-w-0"><code className="font-cc-mono text-[12px] text-cc-ink break-all">{savedS4.url}</code></dd>
                              <dt className={LABEL}>Authentication</dt>
                              <dd className="m-0 min-w-0 cc-text-cell text-cc-ink">
                                {authLabelOf(savedS4.authType)}
                                {savedS4.username ? (
                                  <> · {savedS4.authType === 'oauth2' ? 'client ID' : 'user'} <code className="font-cc-mono text-[12px] break-all">{savedS4.username}</code></>
                                ) : null}
                              </dd>
                              <dt className={LABEL}>Secret</dt>
                              <dd className="m-0 min-w-0 cc-text-cell text-cc-ink">
                                {savedS4.legacy
                                  ? 'Saved by an earlier version, not in the encrypted store — save the connection again to move it there.'
                                  : 'Stored encrypted (AES-256-GCM) on the server · never shown again'}
                              </dd>
                              <dt className={LABEL}>What it may do</dt>
                              <dd className="m-0 min-w-0 cc-text-cell text-cc-ink">Connection check · read OData metadata · one read-only OData call — nothing that writes</dd>
                            </dl>

                            <div className="mt-4 space-y-3">
                              {unsavedNotice && (
                                <CcMessageStrip state="warning">{unsavedNotice}</CcMessageStrip>
                              )}
                              {connectionMessage && (
                                <CcMessageStrip
                                  state={connectionStatus === 'connected' ? 'success' : connectionStatus === 'failed' ? 'error' : 'information'}
                                >
                                  {connectionMessage}
                                </CcMessageStrip>
                              )}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <CcButton
                                variant="primary"
                                density="cozy"
                                onClick={handleTestConnection}
                                disabled={testingConnection || !s4Url}
                                icon={testingConnection ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Plug className="w-4 h-4" />}
                              >
                                {testingConnection ? 'Checking...' : 'Check connection'}
                              </CcButton>
                              <span className="cc-text-meta text-cc-ink-muted">No model call</span>
                            </div>

                            {/* The metadata read and the read-only call, folded until
                                asked for (s8 "More checks"). They use the same saved
                                connection, so they open once the check has passed. */}
                            <div data-more-checks className="mt-4 border-t border-cc-line pt-3">
                              <CcDisclosure
                                title="More checks — OData metadata and one read-only call"
                                level={3}
                                open={showMoreChecks}
                                onOpenChange={setShowMoreChecks}
                              >
                                {connectionStatus === 'connected' ? (
                                  <div className="mt-3 border border-cc-line bg-cc-surface-muted rounded-cc-card p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-3">
                            <Database className="w-5 h-5 text-cc-ink-muted shrink-0" aria-hidden="true" />
                            <div>
                              <h4 className="cc-text-h3 text-cc-ink">OData Service Explorer</h4>
                              <p className="cc-text-meta font-medium text-cc-ink-muted">Browse live OData services exposed by your connected tenant.</p>
                            </div>
                          </div>
                          <CcButton
                            onClick={handleFetchODataCatalog}
                            disabled={odataMode === 'loading'}
                            icon={odataMode === 'loading' ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Search className="w-4 h-4" />}
                          >
                            {odataMode === 'loading' ? 'Fetching...' : 'Discover Services'}
                          </CcButton>
                        </div>

                        {/* Manual service input */}
                        <div className="flex items-end gap-2 mb-4">
                          <div className="flex-1 min-w-0">
                            <CcField label="Service name">
                              {(control) => (
                                <input
                                  id={control.id}
                                  type="text"
                                  aria-describedby={control.describedBy}
                                  value={odataServicePath}
                                  onChange={e => setOdataServicePath(e.target.value)}
                                  placeholder="Enter service name, e.g. API_BUSINESS_PARTNER"
                                  className={control.className}
                                />
                              )}
                            </CcField>
                          </div>
                          <CcButton
                            onClick={() => odataServicePath && handleFetchServiceMetadata(odataServicePath)}
                            disabled={!odataServicePath || odataMode === 'loading'}
                            icon={<Layers className="w-4 h-4" />}
                          >
                            Fetch $metadata
                          </CcButton>
                        </div>

                        {/* Error message */}
                        {odataMode === 'error' && odataMessage && (
                          <div className="mb-4">
                            <CcMessageStrip state="error">{odataMessage}</CcMessageStrip>
                          </div>
                        )}

                        {/* Info message (partial catalog) */}
                        {odataMode === 'catalog' && odataMessage && odataCatalog.length === 0 && (
                          <div className="mb-4">
                            <CcMessageStrip state="warning">
                              <span className="block">{odataMessage}</span>
                              {odataSuggestedServices.length > 0 && (
                                <span className="mt-2 flex flex-wrap gap-2">
                                  {odataSuggestedServices.map(svc => (
                                    <CcButton
                                      key={svc.path}
                                      onClick={() => handleFetchServiceMetadata(svc.path)}
                                      icon={<Database className="w-4 h-4" />}
                                    >
                                      {svc.title}
                                    </CcButton>
                                  ))}
                                </span>
                              )}
                            </CcMessageStrip>
                          </div>
                        )}

                        {/* Service Catalog Results */}
                        {odataMode === 'catalog' && odataCatalog.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-end justify-between gap-3 mb-2">
                              <span className={clsx(LABEL, 'pb-2')}>
                                {odataTotalServices} Services Discovered
                              </span>
                              <div className="w-48">
                                <CcField label="Filter services">
                                  {(control) => (
                                    <input
                                      id={control.id}
                                      type="text"
                                      aria-describedby={control.describedBy}
                                      value={odataCatalogSearch}
                                      onChange={e => setOdataCatalogSearch(e.target.value)}
                                      placeholder="Filter services..."
                                      className={control.className}
                                    />
                                  )}
                                </CcField>
                              </div>
                            </div>
                            {/* A list of services, each one a button that fetches
                                its $metadata. Rows of a list rather than buttons of
                                §1.5, so they carry no surface of their own — the
                                title underlines under the pointer, and the focus
                                ring is the app's own. */}
                            <ul className="max-h-60 overflow-y-auto rounded-cc-row border border-cc-line bg-cc-surface divide-y divide-cc-line m-0 p-0 list-none">
                              {odataCatalog
                                .filter(svc =>
                                  !odataCatalogSearch ||
                                  svc.title.toLowerCase().includes(odataCatalogSearch.toLowerCase()) ||
                                  svc.path.toLowerCase().includes(odataCatalogSearch.toLowerCase())
                                )
                                .slice(0, 50)
                                .map((svc, i) => (
                                  <li key={i}>
                                    <button
                                      type="button"
                                      onClick={() => handleFetchServiceMetadata(svc.path)}
                                      className="w-full flex items-center justify-between gap-2 px-4 py-2 text-left group"
                                    >
                                      <span className="min-w-0">
                                        <span className="cc-text-cell font-semibold text-cc-ink block truncate group-hover:underline">{svc.title}</span>
                                        <span className="text-[12px] font-cc-mono text-cc-ink-muted block truncate">{svc.path}</span>
                                      </span>
                                      <ChevronRight className="w-4 h-4 text-cc-ink-muted group-hover:text-cc-ink shrink-0 transition-colors" aria-hidden="true" />
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}

                        {/* Metadata Results (Entity Types) */}
                        {odataMode === 'metadata' && odataEntityTypes.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <CcButton
                                variant="ghost"
                                onClick={() => { setOdataMode('catalog'); setOdataEntityTypes([]); }}
                                icon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
                              >
                                Back to catalog
                              </CcButton>
                              <span className={LABEL}>
                                {odataSelectedService} — {odataEntityTypes.length} Entity Types
                              </span>
                            </div>
                            {/* One entity type open at a time, as before; its
                                count is on the closed row (§2.11). */}
                            <div className="max-h-80 overflow-y-auto rounded-cc-row border border-cc-line bg-cc-surface divide-y divide-cc-line">
                              {odataEntityTypes.map((et, i) => (
                                <div key={i} className="px-4 py-1">
                                  <CcDisclosure
                                    title={et.name}
                                    count={et.properties.length}
                                    open={odataExpandedEntity === et.name}
                                    onOpenChange={(open) => setOdataExpandedEntity(open ? et.name : null)}
                                  >
                                  {odataExpandedEntity === et.name && (
                                    <div className="pb-2">
                                      {/* Reads from the tenant that is actually connected. Reports
                                          what came back and nothing more — no comparison against the
                                          generated code happens here, so none is claimed. */}
                                      <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <CcButton
                                          onClick={() => handleReadEntitySet(et.name)}
                                          disabled={odataReadState[et.name]?.status === 'reading'}
                                        >
                                          {odataReadState[et.name]?.status === 'reading' ? 'Reading…' : 'Read records from tenant'}
                                        </CcButton>
                                        {odataReadState[et.name]?.status === 'done' && (
                                          <span className="cc-text-meta text-cc-ink">
                                            {odataReadState[et.name]?.recordCount ?? 0} record(s) returned
                                          </span>
                                        )}
                                        {odataReadState[et.name]?.status === 'failed' && (
                                          <span className="cc-text-meta text-cc-error">
                                            {odataReadState[et.name]?.message}
                                          </span>
                                        )}
                                      </div>
                                      <CcTable
                                        caption={`Properties of ${et.name}`}
                                        columns={ODATA_PROPERTY_COLUMNS}
                                        rows={et.properties.map((prop, pi) => ({
                                          key: `${pi}`,
                                          cells: {
                                            name: <span className="font-cc-mono">{prop.name}</span>,
                                            type: <span className="font-cc-mono text-cc-ink-muted">{prop.type.replace('Edm.', '')}</span>,
                                            nullable: prop.nullable
                                              ? <CcTag>Yes</CcTag>
                                              : <span className="cc-text-meta text-cc-error">Required</span>,
                                          },
                                        }))}
                                      />
                                    </div>
                                  )}
                                  </CcDisclosure>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Empty state */}
                        {odataMode === 'idle' && (
                          <div className="text-center py-6 text-cc-ink-muted">
                            <Database className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
                            <p className="cc-text-cell">Click "Discover Services" to browse the OData catalog, or enter a service name above.</p>
                          </div>
                        )}
                      </div>
                                ) : (
                                  <p className="cc-text-cell text-cc-ink-muted pt-1">
                                    These open once the connection check has passed in this session — they use the same saved connection.
                                  </p>
                                )}
                              </CcDisclosure>
                            </div>
                          </CcCard>
                        ) : (
                          // ── The connection form: no connection yet, or Edit ──
                          <CcCard
                            title={savedS4?.url ? 'Change the saved connection' : 'Connect a test system'}
                            level={2}
                            actions={editingConnection ? (
                              <CcButton variant="ghost" onClick={() => { setEditingConnection(false); setUnsavedNotice(''); }}>Cancel</CcButton>
                            ) : undefined}
                          >
                            <p className="cc-text-cell text-cc-ink-muted mb-4">
                              A non-productive S/4HANA Public Cloud endpoint, to check the connection and read OData metadata. Credentials are encrypted on the server and never shown again. Also in{' '}
                              <Link href="/settings" className="font-semibold text-cc-information hover:underline">Settings</Link>.
                            </p>
                            <form onSubmit={saveS4Config} className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Label above, hint under the label, asterisk and
                        `aria-required` on every field the form cannot be saved
                        without (§2.7). The native `required` stays on each
                        control, so the browser still refuses an incomplete
                        form exactly as before. */}
                    <CcField
                      label="Tenant HTTPS URL"
                      required
                      help={
                        s4AuthType === 'sap_hub'
                          ? 'Use the SAP Business Accelerator Hub sandbox base URL. Find it at api.sap.com on any S/4HANA Cloud API page.'
                          : s4AuthType === 'btp_destination'
                          ? 'Auto-filled from your destination JSON. You can also enter it manually.'
                          : 'Your S/4HANA Cloud API host. Format: https://myXXXXXX-api.s4hana.cloud.sap — found in your S/4HANA Launchpad under Communication Arrangements.'
                      }
                    >
                      {(control) => (
                        <input
                          id={control.id}
                          type="url"
                          required={control.required}
                          aria-required={control.ariaRequired}
                          aria-describedby={control.describedBy}
                          value={s4Url}
                          onChange={e => setS4Url(e.target.value)}
                          placeholder={s4AuthType === 'sap_hub' ? 'https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/' : 'https://my300120-api.s4hana.cloud.sap'}
                          className={cn(control.className, CC_CONTROL_HEIGHT.cozy)}
                        />
                      )}
                    </CcField>

                    <CcSelect
                      label="Authentication Type"
                      density="cozy"
                      options={AUTH_TYPE_OPTIONS}
                      value={s4AuthType}
                      onChange={setS4AuthType}
                      help={
                        s4AuthType === 'basic' ? 'Best for direct S/4HANA Cloud sandbox connections using a Communication User.'
                          : s4AuthType === 'oauth2' ? 'Use when your Communication Arrangement provides OAuth 2.0 token endpoints.'
                          : s4AuthType === 'sap_hub' ? 'No S/4HANA system needed — uses SAP\'s free public sandbox APIs for testing.'
                          : 'For enterprise setups routing through SAP BTP with Cloud Connector or direct proxy.'
                      }
                    />

                    {/* BTP Destination JSON */}
                    {s4AuthType === 'btp_destination' && (
                      <div className="col-span-1 md:col-span-2">
                        <CcField
                          label="SAP Destination service JSON configuration"
                          required
                          help="Paste the JSON from the SAP BTP cockpit → Connectivity → Destinations. The Name, URL, Authentication, and ProxyType fields are auto-extracted."
                        >
                          {(control) => (
                            <textarea
                              id={control.id}
                              required={control.required}
                              aria-required={control.ariaRequired}
                              aria-describedby={control.describedBy}
                              rows={7}
                              value={btpDestinationJson}
                              onChange={e => handleBtpJsonChange(e.target.value)}
                              placeholder={'{\n  "Name": "S4_CLOUDSANDBOX",\n  "Type": "HTTP",\n  "URL": "https://my300120-api.s4hana.cloud.sap",\n  "Authentication": "PrincipalPropagation",\n  "ProxyType": "OnPremise",\n  "tokenServiceURL": "https://tenant.authentication.eu10.hana.ondemand.com/oauth/token"\n}'}
                              className={cn(control.className, 'py-2 font-cc-mono resize-y leading-normal')}
                            />
                          )}
                        </CcField>
                      </div>
                    )}

                    {/* Username / Client ID + Password / Secret fields */}
                    {s4AuthType !== 'sap_hub' && s4AuthType !== 'btp_destination' && (
                      <>
                        <CcField
                          label={s4AuthType === 'oauth2' ? 'Client ID' : 'Username'}
                          required
                          help={
                            s4AuthType === 'oauth2'
                              ? 'Found in Communication Arrangements → OAuth 2.0 Details → Client ID. Starts with "sb-clone-".'
                              : 'The Communication User name from your Communication Arrangement. Example: CC_INTEGRATOR or INTEGRATION_USER.'
                          }
                        >
                          {(control) => (
                            <input
                              id={control.id}
                              type="text"
                              required={control.required}
                              aria-required={control.ariaRequired}
                              aria-describedby={control.describedBy}
                              value={s4Username}
                              onChange={e => setS4Username(e.target.value)}
                              placeholder={s4AuthType === 'oauth2' ? 'sb-clone-xxxx...' : 'CC_INTEGRATOR'}
                              className={cn(control.className, CC_CONTROL_HEIGHT.cozy)}
                            />
                          )}
                        </CcField>

                        <CcField
                          label={s4AuthType === 'oauth2' ? 'Client Secret' : 'Password'}
                          required
                          help={
                            s4AuthType === 'oauth2'
                              ? 'The Client Secret generated together with your Client ID. Only shown once when creating the Communication Arrangement.'
                              : 'The password set for the Communication User. If forgotten, reset it in the Communication Arrangement settings.'
                          }
                        >
                          {(control) => (
                            <div className="relative">
                              <input
                                id={control.id}
                                type={showS4Password ? "text" : "password"}
                                required={control.required}
                                aria-required={control.ariaRequired}
                                aria-describedby={control.describedBy}
                                value={s4Password}
                                onChange={e => setS4Password(e.target.value)}
                                placeholder="••••••••••••••••"
                                className={cn(control.className, CC_CONTROL_HEIGHT.cozy, 'pr-10')}
                              />
                              <button
                                type="button"
                                onClick={() => setShowS4Password(!showS4Password)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-cc-ink-muted hover:text-cc-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
                                aria-label="Show password"
                                aria-pressed={showS4Password}
                              >
                                {showS4Password ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                              </button>
                            </div>
                          )}
                        </CcField>
                      </>
                    )}
                  </div>

                              {/* Nothing was tested, so nothing failed: an unsaved form is
                                  its own state, in amber, not a red "connection failed"
                                  that reads as a broken tenant (UX review of 52f171091948,
                                  1b84676d685d). */}
                              {unsavedNotice && (
                                <CcMessageStrip state="warning">{unsavedNotice}</CcMessageStrip>
                              )}

                              {connectionMessage && (
                                <CcMessageStrip
                                  state={connectionStatus === 'connected' ? 'success' : connectionStatus === 'failed' ? 'error' : 'information'}
                                >
                                  {connectionMessage}
                                </CcMessageStrip>
                              )}

                              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-cc-line">
                                <CcButton
                                  type="submit"
                                  variant="primary"
                                  density="cozy"
                                  disabled={isSavingConfig}
                                  icon={isSavingConfig ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                >
                                  {isSavingConfig ? 'Saving...' : 'Save connection'}
                                </CcButton>
                                <CcButton
                                  variant="secondary"
                                  density="cozy"
                                  onClick={handleTestConnection}
                                  disabled={testingConnection || !s4Url}
                                  icon={testingConnection ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Plug className="w-4 h-4" />}
                                >
                                  {testingConnection ? 'Checking...' : 'Check connection'}
                                </CcButton>
                              </div>
                            </form>
                          </CcCard>
                        )}

                        {deleteConnectionError && (
                          <div data-delete-connection-error role="alert">
                            <CcMessageStrip state="error">{deleteConnectionError}</CcMessageStrip>
                          </div>
                        )}

                        {/* ─────── Setup guide (collapsible) ─────── */}
                        {/* Folded, never removed (§2.11): the guide stays in the page
                            while it is closed, and it opens by itself for a connection
                            that has not been saved yet (see the effect above). */}
                        <section data-setup-guide className={clsx(CARD, 'px-4 py-3')}>
                          <CcDisclosure
                            title="Setup guide — connect an S/4HANA test system"
                            level={2}
                            open={showSetupGuide}
                            onOpenChange={setShowSetupGuide}
                          >
                                                <div className="space-y-4 pt-1">
                      <p className="cc-text-meta font-medium text-cc-ink-muted flex items-center gap-2">
                        <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
                        Step-by-step instructions for every authentication method.
                      </p>

                      {/* Step 1 — Always visible */}
                      <div className="flex gap-3 items-start">
                        <span className={STEP}>1</span>
                        <div>
                          <p className="cc-text-h3 text-cc-ink">Choose your Authentication Type</p>
                          <p className="cc-text-cell text-cc-ink-muted leading-relaxed">
                            Select the method that matches your SAP system setup from the dropdown below. Not sure which to use? Here is a quick overview:
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            <div className={authOption(s4AuthType === 'basic')}>
                              <span className="font-bold text-cc-ink block mb-1">Basic Authentication</span>
                              <span className="text-cc-ink-muted">Username + Password. Use for S/4HANA Cloud test tenants with Communication Arrangements (API users).</span>
                            </div>
                            <div className={authOption(s4AuthType === 'oauth2')}>
                              <span className="font-bold text-cc-ink block mb-1">OAuth 2.0 Client Credentials</span>
                              <span className="text-cc-ink-muted">Client ID + Secret. Use when your S/4HANA tenant provides OAuth token endpoints via Communication Arrangements.</span>
                            </div>
                            <div className={authOption(s4AuthType === 'sap_hub')}>
                              <span className="font-bold text-cc-ink block mb-1">SAP Business Accelerator Hub Sandbox</span>
                              <span className="text-cc-ink-muted">Free sandbox API key. No own tenant needed — perfect for testing with SAP{"'"}s public demo APIs.</span>
                            </div>
                            <div className={authOption(s4AuthType === 'btp_destination')}>
                              <span className="font-bold text-cc-ink block mb-1">SAP Destination service (JSON)</span>
                              <span className="text-cc-ink-muted">Paste your destination JSON config. For enterprises routing via SAP BTP with Cloud Connector or Internet proxy.</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Step 2 — Dynamic based on auth type */}
                      <div className="flex gap-3 items-start">
                        <span className={STEP}>2</span>
                        <div>
                          <p className="cc-text-h3 text-cc-ink">Enter Your Connection Details</p>
                          {s4AuthType === 'basic' && (
                            <div className="cc-text-cell text-cc-ink-muted leading-relaxed space-y-1 mt-1">
                              <p>→ <strong>Tenant URL:</strong> Your API endpoint, e.g. <code className={CODE}>https://my300120-api.s4hana.cloud.sap</code></p>
                              <p>→ <strong>Username:</strong> The Communication User name from your Communication Arrangement (e.g. <code className={CODE}>CC_INTEGRATOR</code>)</p>
                              <p>→ <strong>Password:</strong> The password assigned to that Communication User</p>
                              <p className="cc-text-meta font-medium text-cc-ink mt-1"><MapPin className="inline w-3 h-3 mr-1" aria-hidden="true" />Where to find: S/4HANA Cloud → Communication Management → Communication Arrangements → Your arrangement → Inbound Communication → User Name</p>
                            </div>
                          )}
                          {s4AuthType === 'oauth2' && (
                            <div className="cc-text-cell text-cc-ink-muted leading-relaxed space-y-1 mt-1">
                              <p>→ <strong>Tenant URL:</strong> Your API endpoint, e.g. <code className={CODE}>https://my300120-api.s4hana.cloud.sap</code></p>
                              <p>→ <strong>Client ID:</strong> The OAuth client ID from your Communication Arrangement (starts with <code className={CODE}>sb-clone-...</code>)</p>
                              <p>→ <strong>Client Secret:</strong> The OAuth client secret generated alongside the Client ID</p>
                              <p className="cc-text-meta font-medium text-cc-ink mt-1"><MapPin className="inline w-3 h-3 mr-1" aria-hidden="true" />Where to find: S/4HANA Cloud → Communication Arrangements → OAuth 2.0 Details → Client ID / Client Secret</p>
                            </div>
                          )}
                          {s4AuthType === 'sap_hub' && (
                            <div className="cc-text-cell text-cc-ink-muted leading-relaxed space-y-1 mt-1">
                              <p>→ <strong>Tenant URL:</strong> Use SAP{"'"}s sandbox URL: <code className={CODE}>https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/</code></p>
                              <p>→ No username or password needed — only your API key is required</p>
                              <p className="cc-text-meta font-medium text-cc-ink mt-1"><MapPin className="inline w-3 h-3 mr-1" aria-hidden="true" />Where to find: <a href="https://api.sap.com" target="_blank" rel="noopener noreferrer" className="underline">api.sap.com</a> → Log in → Show API Key (top-right on any API page)</p>
                            </div>
                          )}
                          {s4AuthType === 'btp_destination' && (
                            <div className="cc-text-cell text-cc-ink-muted leading-relaxed space-y-1 mt-1">
                              <p>→ Paste the full JSON of your destination into the text area below</p>
                              <p>→ The system automatically extracts <strong>Name</strong>, <strong>URL</strong>, <strong>Authentication</strong>, and <strong>ProxyType</strong></p>
                              <p className="cc-text-meta font-medium text-cc-ink mt-1"><MapPin className="inline w-3 h-3 mr-1" aria-hidden="true" />Where to find: SAP BTP cockpit → Connectivity → Destinations → Select your destination → Export as JSON (or copy the config)</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Step 3 + 4 — Always visible. Save comes first: the test
                          runs against the saved connection and refuses an unsaved
                          form (QA full review of fc787674705f, 229511ee85db). */}
                      <div className="flex gap-3 items-start">
                        <span className={STEP}>3</span>
                        <div>
                          <p className="cc-text-h3 text-cc-ink">Save the Connection</p>
                          <p className="cc-text-cell text-cc-ink-muted">Click <strong>Save connection</strong> to store the config, encrypted on the server. The scenarios run in step 2 of this tool, against mocks — never on this connection.</p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-start">
                        <span className={STEP}>4</span>
                        <div>
                          <p className="cc-text-h3 text-cc-ink">Test the Connection</p>
                          <p className="cc-text-cell text-cc-ink-muted">Click <strong>Check connection</strong> to verify the handshake with the saved connection. The last check below keeps its log.</p>
                        </div>
                      </div>

                      {/* Security Notice */}
                      <CcMessageStrip state="information" headline="Security:">
                        Credentials travel over HTTPS and are encrypted at rest on the server (AES-256-GCM). Production domains (<code className={CODE}>*-api.s4hana.ondemand.com</code>) are automatically blocked. Only non-productive sandbox/test systems are allowed.
                      </CcMessageStrip>

                      {/* Quick links */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <CcLinkButton href="/knowledge" icon={<ExternalLink className="w-4 h-4" aria-hidden="true" />}>
                          Knowledge Hub
                        </CcLinkButton>
                        {/* This button is inside a project, so the one
                            assistant it opens is the case-bound one: it
                            answers from this project's evidence with
                            anchors, and from nothing else. It cannot
                            help with the S/4 connection this block is
                            about — the Knowledge Hub link next to it
                            can. Named for what opens, not for what one
                            would wish for here; see the report on this
                            step. */}
                        <CcButton
                          onClick={() => window.dispatchEvent(new CustomEvent('open-chatbot'))}
                          icon={<HelpCircle className="w-4 h-4" aria-hidden="true" />}
                        >
                          Ask this case
                        </CcButton>
                        <CcLinkButton href="/settings" icon={<ExternalLink className="w-4 h-4" aria-hidden="true" />}>
                          Manage in Profile Settings
                        </CcLinkButton>
                      </div>
                    </div>
                          </CcDisclosure>
                          {!showSetupGuide && (
                            <p className="cc-text-meta text-cc-ink-muted">
                              {savedS4?.url ? 'Collapsed because a connection is saved. ' : ''}Four authentication methods, and where to find each value.
                            </p>
                          )}
                        </section>

                        {/* ─────── Last check: the log of this session ─────── */}
                        <section data-last-check className={clsx(CARD, 'px-4 py-3')}>
                          <CcDisclosure title="Last check" level={2} open={showLastCheck} onOpenChange={setShowLastCheck}>
                            <pre className="whitespace-pre-wrap break-words rounded-cc-row bg-cc-code-bg p-4 font-cc-mono text-[12px] leading-relaxed text-cc-code-ink">
                              {tenantLog || 'No check in this session yet.'}
                            </pre>
                          </CcDisclosure>
                          <p className="cc-text-meta text-cc-ink-muted">
                            {lastCheck ? (
                              <>
                                <CcDateText value={lastCheck.at} format="datetime" />
                                {` · ${tenantLog.split('\n').filter(Boolean).length} lines · ${lastCheck.ok ? 'the tenant answered' : 'the check did not get through'}`}
                              </>
                            ) : 'No check in this session yet — checks are not stored.'}
                          </p>
                        </section>
                      </>
                    ) : (
                      // Locked Teaser Card / Guide & Access Request
              <div className={clsx(CARD, 'p-4 md:p-6')}>
                <div className="flex items-center gap-3 mb-6">
                  <Globe className="w-5 h-5 text-cc-ink-muted shrink-0" aria-hidden="true" />
                  <h2 className="cc-text-h2 text-cc-ink">
                    Connect your own test system
                  </h2>
                </div>

                <div className="space-y-4 max-w-4xl">
                  {/* Instructions */}
                  <div className="bg-cc-surface-muted border border-cc-line p-4 rounded-cc-card">
                    <h3 className="cc-text-h3 text-cc-ink mb-3 flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
                      Instructions (Setup Guide)
                    </h3>
                    <ol className="list-decimal pl-4 cc-text-cell text-cc-ink space-y-2">
                      <li><strong>Request access:</strong> Use the form below to request access for your organization.</li>
                      <li><strong>Provide HTTPS endpoint:</strong> Set up a secure HTTPS connection to your S/4HANA sandbox or test system.</li>
                      <li><strong>Configure credentials:</strong> Once approved, you can configure your credentials (Basic Auth or OAuth 2.0).</li>
                      <li><strong>Check the connection:</strong> Test the handshake, read OData metadata and make one read-only call from the Stage 5 testing environment. That is the whole of what this connection does; the notice above says what it does not.</li>
                    </ol>
                  </div>

                  {/* Security Measures */}
                  <div className="bg-cc-surface-muted border border-cc-line p-4 rounded-cc-card">
                    <h3 className="cc-text-h3 text-cc-ink mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
                      Security Measures & Explanations
                    </h3>
                    <ul className="list-disc pl-4 cc-text-cell text-cc-ink space-y-2">
                      <li><strong>Encrypted at rest:</strong> Passwords and tokens travel over HTTPS to the server, which encrypts them with AES-256-GCM in a server-only store. They are never returned to the browser.</li>
                      <li><strong>Production Block:</strong> Access to production interfaces (<code className={CODE}>*-api.s4hana.ondemand.com</code>) is blocked by the system.</li>
                      <li><strong>Server-side calls only:</strong> Your browser never talks to the tenant. The Clean-Core.io server makes each call through an SSRF-checked fetch that allows HTTPS to non-production hosts only.</li>
                    </ul>
                  </div>

                  {/* Disclaimer */}
                  <CcMessageStrip state="warning" headline="Warranty Disclaimer">
                    This is the Free Community Edition. Access is provided entirely without warranty, guarantee, or liability. Under no circumstances should you use productive ERP data or real passwords.
                  </CcMessageStrip>

                  {/* Request Form / Status */}
                  {profile?.s4TenantAccessRequested ? (
                    <div className="bg-cc-surface border border-cc-line p-4 rounded-cc-card flex items-start gap-3">
                      <Clock className="w-5 h-5 text-cc-ink-muted shrink-0" aria-hidden="true" />
                      <div>
                        <h3 className="cc-text-h3 text-cc-ink mb-1">Request in Review</h3>
                        <p className="cc-text-cell text-cc-ink-muted leading-relaxed">
                          Your request for live S/4HANA access is currently being reviewed by our system administrators. Approvals are usually processed within 24 hours.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 pt-2">
                      {/* The limit is the rule's (firestore.rules caps the
                          field) and the handler cuts to it again before the
                          write — the field only stops the typing earlier. */}
                      <CcTextarea
                        label="Description of your use case (Motivation)"
                        placeholder="E.g., connecting our non-productive S/4HANA Public Cloud Sandbox to validate OData interfaces..."
                        value={accessRequestedMotivation}
                        maxLength={2000}
                        rows={3}
                        onChange={setAccessRequestedMotivation}
                      />

                      <CcButton
                        variant="primary"
                        density="cozy"
                        onClick={handleRequestAccess}
                        disabled={isRequestingAccess}
                        icon={isRequestingAccess ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Send className="w-4 h-4" />}
                      >
                        {isRequestingAccess ? 'Sending...' : 'Request Access for Live S/4HANA'}
                      </CcButton>
                      {accessRequestError && (
                        <div data-access-request-error role="alert">
                          <CcMessageStrip state="error">{accessRequestError}</CcMessageStrip>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
                    )}
              </div>
            </CcDisclosure>
            {!showTenant && (
              <p className="m-0 cc-text-meta text-cc-ink-muted">
                Connection check, OData metadata and one read-only call. Running tests on a tenant stays locked.
              </p>
            )}
          </section>
        </div>

        <aside aria-label="About this tool" className="flex min-w-0 flex-col gap-4">
          {/* What can be tested where — once for the whole stage, before
              anything else in the side column (owner 03.10.2026). */}
          <TestScopeLegend isAbapCloud={isAbapCloud} tenantLocked={LIVE_TEST_EXECUTION.locked} />
          {/* The tenant in one card: what is open, what stays locked, and the
              way to the section that does it. The lock itself is said once,
              there. */}
          <CcCard
            title="Tenant connection"
            level={2}
            meta={
              connectionStatus === 'connected' && lastCheck?.ok ? (
                <CcProvenanceChip value="proven" />
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CcProvenanceChip value="not-determined" />
                  <span className="cc-text-meta text-cc-ink-muted">{savedS4?.url ? '· not checked' : '· not yet'}</span>
                </span>
              )
            }
          >
            <p data-tenant-summary className="m-0 cc-text-cell text-cc-ink">
              {profile?.s4TenantAccessAllowed || profile?.isAdmin
                ? `${profile?.s4TenantAccessAllowed ? 'BYOT is granted for this account' : 'Open to administrators'}: connection check, metadata read and one read-only OData call are open. Running tests on a tenant stays locked.`
                : profile?.s4TenantAccessRequested
                  ? 'Your request for bring your own tenant (BYOT) is with an administrator. Running tests on a tenant stays locked.'
                  : 'Bring your own tenant (BYOT) opens a connection check, a metadata read and one read-only OData call. Running tests on a tenant stays locked.'}
            </p>
            <div className="mt-3">
              <CcButton onClick={openTenant} icon={<Lock size={14} aria-hidden="true" />}>
                {savedS4?.url
                  ? 'Open the connection'
                  : profile?.s4TenantAccessAllowed || profile?.isAdmin
                    ? 'Set up connection'
                    : profile?.s4TenantAccessRequested
                      ? 'See the request'
                      : 'Request access'}
              </CcButton>
            </div>
          </CcCard>

          {/* The figure the third marketing tile used to carry, with its
              reasoning: a model's estimate, said to be one. Only where one
              was written — the facet tiles already say what is missing. */}
                    {project?.coverageEstimate && !storedSuiteRejected ? (
                      <CcCard title="Coverage estimate" level={2} meta={<CcProvenanceChip value="proposed" />}>
                        {typeof project?.coverageEstimate?.percentage === 'number'
                          ? <p className="cc-text-title text-cc-ink mb-2"><span data-stage-output="coverageEstimate">{`${project.coverageEstimate.percentage}%`}</span></p>
                          : null}
                        <div className="space-y-3">
                          <p className="cc-text-meta text-cc-ink-muted">The testing model{"'"}s estimate of how much of the logic the scenarios reach — not a measured coverage.</p>
                          {/* A suite made for a previous source carries its
                              estimate with it; said here, beside the figure,
                              not only in the notice at the top (carried QA
                              finding 763f13273cb3). */}
                          {workflowSteps(project).find((p) => p.key === 'testing')?.state === 'stale' ? (
                            <p className="cc-text-meta text-cc-warning" data-coverage-stale="">
                              Estimated for a previous source — it does not describe the code as it stands.
                            </p>
                          ) : null}
                          <div>
                            <h3 className={clsx(LABEL, 'mb-1')}>How it was estimated</h3>
                            <p className="cc-text-cell text-cc-ink leading-relaxed">{project.coverageEstimate.explanation || 'No explanation available.'}</p>
                          </div>
                          <div>
                            <h3 className={clsx(LABEL, 'mb-1')}>Gaps it names</h3>
                            <p className="cc-text-cell text-cc-ink">{project.coverageEstimate.missingCoverage || 'No missing coverage information.'}</p>
                          </div>
                        </div>
                      </CcCard>
                    ) : null}
        </aside>
      </div>




      {/* Removing the saved connection is asked for first; the box takes the
          first focus, so a stray Enter deletes nothing. */}
      <CcMessageBox
        open={confirmDeleteConnection}
        title="Delete the saved connection?"
        confirmLabel="Delete connection"
        onConfirm={handleDeleteConnection}
        onCancel={() => setConfirmDeleteConnection(false)}
      >
        The tenant URL, the user and the encrypted secret are removed from your account — for every project, not only this one. Checks need a new connection afterwards.
      </CcMessageBox>

      <StageFooter />
    </StageFrame>
  );
}
