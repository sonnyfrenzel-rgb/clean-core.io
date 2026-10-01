'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { useTestGeneration } from '@/hooks/useTestGeneration';
import { useTestExecution } from '@/hooks/useTestExecution';
import StageProgress from '@/components/StageProgress';
import type { Project } from '@/lib/types';
import { Play, Terminal as TerminalIcon, RefreshCw, ListChecks, Download, ShieldCheck, AlertTriangle, BarChart3, Globe, Send, Eye, EyeOff, Clock, BookOpen, ExternalLink, HelpCircle, Database, Search, Layers, ChevronRight, MapPin, ArrowLeft, Check, Circle, Plug, Lock, TestTube } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import CcTabs from '@/components/cc/Tabs';
import CcCard from '@/components/cc/Card';
import CcDateText from '@/components/cc/DateText';
import CcStateText from '@/components/cc/StateText';
import CcMessageBox from '@/components/cc/MessageBox';
import CcDisclosure from '@/components/cc/Disclosure';
import CcDialog from '@/components/cc/Dialog';
import CcTable from '@/components/cc/Table';
import CcField, { CC_CONTROL_HEIGHT } from '@/components/cc/Field';
import CcSelect from '@/components/cc/Select';
import CcTextarea from '@/components/cc/Textarea';
import { STATE_CLASSES } from '@/components/cc/state';
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
import { motion } from 'motion/react';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });
const TestingPieChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingPieChart), { ssr: false });
const TestingBarChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingBarChart), { ssr: false });


import { useUserProfile } from '@/hooks/useUserProfile';
import { saveAs } from '@/lib/fileSaver';
import StageHeader from '@/components/StageHeader';
import NotGenerated from '@/components/NotGenerated';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { workflowSteps, generationBlockers, previousBasis } from '@/lib/workflow-steps';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import StaleNotice from '@/components/StaleNotice';
import { STORED_TEST_SUITE_REJECTED } from './test-suite-schema';
import TestingHeader, { TestingMetaLine, type MetaPart } from '@/components/testing/TestingHeader';
import SectionAnchorBar from '@/components/testing/SectionAnchorBar';
import ToolSection from '@/components/testing/ToolSection';
import TestPipeline from '@/components/testing/TestPipeline';
import HandChecks from '@/components/testing/HandChecks';
import type { StripTick } from '@/components/testing/ProgramStrip';
import { readProgram } from '@/components/testing/program-reading';
import { coveringTestRunReceipt } from '@/lib/test-receipt';
import { catalogForReader } from '@/lib/messages/demo';
import { normaliseSeverity } from '@/lib/severity';
import LastRunRow from '@/components/testing/LastRunRow';
import TabExplainer from '@/components/testing/TabExplainer';
import { lastRun, scenarios } from '@/components/testing/testing-summary';

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

/** The two tabs of the stage, named after what each one does (mockup s8, ADR-004). */
const ENV_SEGMENTS = [
  { value: 'mock', label: 'Run tests against mocks' },
  { value: 'live', label: 'Check tenant connection' },
] as const;

/** Main column and a 360 px side column, as in proposal A; one column below `lg`. */
const RAIL_GRID = 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start';

const AUTH_TYPE_OPTIONS = [
  { value: 'basic', label: 'Basic Authentication (Username + Password)' },
  { value: 'oauth2', label: 'OAuth 2.0 Client Credentials (Client ID + Secret)' },
  { value: 'sap_hub', label: 'SAP Business Accelerator Hub Sandbox (API Key only)' },
  { value: 'btp_destination', label: 'SAP BTP Destination Service (Paste JSON)' },
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
  const [selectedResult, setSelectedResult] = useState<any>(null);

  // S/4HANA Connection states
  const [activeEnvTab, setActiveEnvTab] = useState<'mock' | 'live'>('mock');
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
   * the two tabs are two different jobs, and a mock run must not overwrite the
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

  const { isGenerating, testCases, generateTestCases, storedSuiteRejected } = useTestGeneration(projectId as string, project, setProject);
  /** Why the last generation attempt produced nothing. Empty when none has failed. */
  const [genError, setGenError] = useState('');
  const { isRunning, testResults, sandboxOutput, aiExplanation, runTestCases, stubbedPackages } = useTestExecution(projectId as string, project, setProject);
  const [showTestCode, setShowTestCode] = useState(false);
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
      if (project.s4Environment) {
        setActiveEnvTab(project.s4Environment);
      }
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

  const handleEnvChange = async (env: 'mock' | 'live') => {
    setActiveEnvTab(env);
    try {
      const db = getDb();
      const projectRef = doc(db, 'projects', projectId as string);
      await setDoc(projectRef, { s4Environment: env }, { merge: true });
      setProject(prev => prev ? { ...prev, s4Environment: env } : null);
    } catch (err) {
      console.error("Failed to save environment choice:", err);
    }
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
      // is reported as done. The environment preference below is a separate,
      // optional write — its failure used to land in this catch and report a
      // saved connection as a failed save, with the password still in the box
      // (QA full review of fc787674705f, 983d23ce4dad).
      setS4Password(''); // Clear from client state
      setEditingConnection(false);
      // A check of the previous connection says nothing about this one.
      setConnectionStatus('disconnected');
      setConnectionMessage("Configuration saved securely (encrypted).");
      setTimeout(() => setConnectionMessage(""), 3000);

      try {
        const db = getDb();
        const projectRef = doc(db, 'projects', projectId as string);
        await setDoc(projectRef, { s4Environment: activeEnvTab }, { merge: true });
        setProject(prev => prev ? { ...prev, s4Environment: activeEnvTab } : null);
      } catch (prefErr) {
        console.error("Failed to save environment choice:", prefErr);
      }
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
      : 'BTP Destination Service';

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

  const handleGenerate = async () => {
    // Not against code generated from a previous source (E01-F01-US02). The
    // notice at the top of the page says which stage to regenerate first.
    if (generationBlockers(project, 'testing').length > 0) return;
    // Nor while the testing model stage is off or has no key: the proxy refuses
    // it, and "Regenerate Suite" used to start that request anyway
    // (QA full review of fc787674705f, 55b40120e11b).
    if (!modelAvailability.enabled('testing')) return;
    setGenError('');
    try {
      const result = await generateTestCases();
      if (result && result.testCases) {
        setSelectedTestCases(result.testCases.map((_: any, i: number) => i));
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
   * Three outcomes, not two.
   *
   * Every surface here read `status === 'Passed'` and painted everything else
   * red. That was safe while the only other value was `Failed`; with `Not run`
   * and `Simulated` it turns "we do not know" into "it failed", which is a
   * different lie in the opposite direction.
   */
  const verdictTone = (status?: string): 'pass' | 'fail' | 'none' =>
    status === 'Passed' ? 'pass' : status === 'Failed' ? 'fail' : 'none';

  /**
   * The state each verdict is drawn in (DESIGN.md §1.1, §4). Green only where a
   * test really passed; a failure is `error`; everything without a verdict —
   * Not run, Skipped, Todo, Simulated — is *not determined*, neutral, and not
   * the amber it used to be: amber says "watch out", and "we do not know" is
   * not a warning about the code.
   */
  const VERDICT_STATE = { pass: 'success', fail: 'error', none: 'neutral' } as const;

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

  const isAbapCloud = (project?.extensibilityRoute || '').includes('ABAP Cloud');

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

  if (loading) return <div className="p-8 cc-text-body text-cc-ink-muted">Loading...</div>;
  if (loadError) return (
    <div className="p-8 max-w-xl">
      <CcMessageStrip
        state="error"
        headline="This stage could not be opened"
        actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
      >
        {loadError}
      </CcMessageStrip>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Where am I, what is behind me, what is still open — kept on
          screen while the stepper scrolls away. Both read the same contract;
          neither decides anything. */}

      <StageProgress steps={phases} current="testing" projectId={projectId as string} />

      <StaleNotice
        title={`Built for ${previousBasis(project)}`}
        reasons={[
          ...generationBlockers(project, 'testing'),
          ...(phases.find((p) => p.key === 'testing')?.state === 'stale'
            ? [`The test cases shown here were written for ${previousBasis(project)}. Running them tests nothing about the current one.`]
            : []),
        ]}
      />

      <StageHeader stage="testing" projectName={project?.name}>
        {isAbapCloud
          ? 'Generate ABAP Unit test class stubs. Nothing is compiled or executed in SAP ADT here: a mock run is simulated, and a tenant is only checked for connectivity.'
          : 'Generate test cases and run them against mocks in a restricted Node.js process.'}
      </StageHeader>

      {/* The answer first (proposal A, owner decision 01.10.2026): the meta line,
          four facet tiles and the status line — where testing stands, from the
          case list, the receipt and this session — before any tab. */}
      <TestingMetaLine parts={metaParts} />
      <TestingHeader
        scenarios={{
          count: testCases.length,
          rejected: !!storedSuiteRejected,
          emptyReason: modelAvailability.enabled('testing')
            ? 'Generate them from the target code, then run them against mocks'
            : 'Generating them needs the testing model, which is not available for this account',
        }}
        run={run}
        blocked={testRunBlocked(project)}
        isAbapCloud={isAbapCloud}
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
            value: isAbapCloud ? 'mocks, not an ABAP Unit run' : 'restricted Node.js process, mocks',
            tone: 'plain',
          },
          { label: 'Tenant', value: 'connection check only', tone: 'plain' },
        ]}
      />

      {/* The sections of the mock tab, as an anchor bar under the app header.
          The tenant tab has no sections of its own to jump between. */}
      {activeEnvTab === 'mock' ? (
        <SectionAnchorBar
          items={[
            { id: 'testing-verified', label: 'From written to verified' },
            { id: 'testing-scenarios', label: 'Scenarios', count: testCases.length },
            { id: 'testing-hand', label: 'Check by hand', count: program ? program.gaps.length : undefined },
          ]}
        />
      ) : null}

      {/* Two parts of the stage, so two tabs (DESIGN.md §2, mockup s8) — they
          replace the "Validation Environment" switch. The choice is still the
          project's `s4Environment` and still goes through `handleEnvChange`:
          what the run button may do has not changed, only where it stands. The
          lock is not on a tab: it stands once, inside the tenant tab it applies
          to (ADR-004). */}
      <div data-testing-tabs className="mb-8">
        <CcTabs
          label="Testing"
          density="cozy"
          appearance="pill"
          value={activeEnvTab}
          onChange={(env) => handleEnvChange(env)}
          tabs={[
            {
              value: ENV_SEGMENTS[0].value,
              label: testCases.length > 0 ? `${ENV_SEGMENTS[0].label} (${scenarios(testCases.length)})` : ENV_SEGMENTS[0].label,
              icon: <TestTube size={14} aria-hidden="true" />,
              content: (
                <div data-testing-panel="mock" className={RAIL_GRID}>
                  <div className="flex min-w-0 flex-col gap-5">
                    {/* ── From written to verified: the pipeline, the run button, and this session's results ── */}
                    <ToolSection
                      id="testing-verified"
                      data-testing-results=""
                      title="From written to verified"
                      actions={
                        <CcButton
                          variant="primary"
                          onClick={handleRun}
                          disabled={isRunning || selectedTestCases.length === 0 || (activeEnvTab === 'live' && !s4Url) || (activeEnvTab === 'live' && !isAbapCloud && LIVE_TEST_EXECUTION.locked) || testRunBlocked(project)}
                          icon={isRunning ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Play className="w-4 h-4" />}
                        >
                          {isRunning
                            ? 'Running...'
                            : selectedTestCases.length > 0 && selectedTestCases.length < testCases.length
                              ? `Run ${selectedTestCases.length} selected against mocks`
                              : 'Run tests against mocks'}
                        </CcButton>
                      }
                      lead={
                        testCases.length === 0
                          ? 'Nothing to run yet — the scenarios are written first.'
                          : isAbapCloud
                            ? `Simulates a run of the ${scenarios(testCases.length)} against mocks — nothing is compiled or executed here, and never on a tenant.`
                            : selectedTestCases.length > 0 && selectedTestCases.length < testCases.length
                              ? `Runs the ${selectedTestCases.length} selected of ${scenarios(testCases.length)} in the restricted test runner, against mocks — never on a tenant.`
                              : `Runs all ${scenarios(testCases.length)} in the restricted test runner, against mocks — never on a tenant.`
                      }
                    >
                      {/* The reason itself is in the notice at the top of the page. */}
                      {testRunBlocked(project) && testCases.length > 0 && (
                        <div data-stale-run-hint className="mb-4">
                          <CcMessageStrip state="neutral">Running is off until the suite is regenerated for the current source — the notice at the top says which stage comes first.</CcMessageStrip>
                        </div>
                      )}

                      <TestPipeline written={testCases.length} run={run} />

                      {(testResults || aiExplanation) && (
                        <div className="mt-5 border-t border-cc-line pt-4">
                          <h3 id="testing-results-title" className="m-0 cc-text-h3 text-cc-ink">Results</h3>
                          <p className="m-0 mt-1 mb-4 cc-text-cell text-cc-ink-muted">
                            {isAbapCloud
                              ? 'This run was simulated against mocks — it is not an ABAP Unit run, and no scenario has a verdict from it.'
                              : 'Results of the run in this session, against mocks — real results for the code, not for a tenant.'}
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

      {testResults && (
        <div className="grid grid-cols-1 gap-4 mb-4">
          {project?.manualTestingRequirements && project.manualTestingRequirements.length > 0 && (
            <div className={clsx(CARD, 'p-4 md:p-6')}>
              <h3 className="cc-text-h2 text-cc-ink mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-cc-warning" aria-hidden="true" />
                Human-in-the-Loop Verification
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {project.manualTestingRequirements.map((req: any, i: number) => (
                  <div key={i} className="bg-cc-surface-muted p-4 rounded-cc-row border border-cc-line">
                    <h4 className="cc-text-h3 text-cc-ink mb-1">{req.area}</h4>
                    <p className="cc-text-cell text-cc-ink-muted mb-3 leading-relaxed">{req.reason}</p>
                    <div className="text-[12px] text-cc-ink font-cc-mono bg-cc-surface p-2 rounded-cc-row border border-cc-line">
                      <strong>VERIFY:</strong> {req.verificationSteps}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {testResults.map((res: any, i: number) => {
              const tone = verdictTone(res.status);
              const state = STATE_CLASSES[VERDICT_STATE[tone]];
              return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                data-verdict-tone={tone}
                className={clsx(
                  "group relative p-4 rounded-cc-card border transition-colors bg-cc-surface shadow-cc hover:border-cc-field-border",
                  tone === 'fail' ? 'border-cc-error-border' : tone === 'none' ? 'border-dashed border-cc-field-border' : 'border-cc-line'
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className={state.text}>
                    {tone === 'pass' ? <ShieldCheck size={20} aria-hidden="true" />
                      : tone === 'fail' ? <AlertTriangle size={20} aria-hidden="true" />
                      : <HelpCircle size={20} aria-hidden="true" />}
                  </span>
                  <span className="font-cc-mono text-[12px] text-cc-ink-muted">{renderSafeValue(res.id)}</span>
                </div>
                {/* The name is the button, stretched over the card: the whole
                    card still opens the report on click, and the keyboard now
                    reaches it too — the report dialog hands the focus back
                    here when it closes. */}
                <h4 className="cc-text-h3 text-cc-ink mb-2 line-clamp-2 leading-tight">
                  <button
                    type="button"
                    onClick={() => setSelectedResult(res)}
                    className="text-left cursor-pointer after:absolute after:inset-0 after:rounded-cc-card"
                  >
                    {renderSafeValue(res.name)}
                  </button>
                </h4>
                <div className="flex items-center gap-2 pt-2">
                  <CcTag>{renderSafeValue(res.category)}</CcTag>
                  <span className={clsx("cc-text-meta ml-auto", state.text)}>
                    {renderSafeValue(res.status)}
                  </span>
                </div>
              </motion.div>
              );
            })}
          </div>
        </div>
      )}


                        </div>
                      )}
                    </ToolSection>

                    {/* ── Scenarios ── */}
                    <ToolSection
                      id="testing-scenarios"
                      data-testing-scenarios=""
                      title="Scenarios"
                      titleExtra={testCases.length > 0 ? <CcProvenanceChip value="proposed" /> : null}
                      actions={
                        // Only once the suite exists. Before that this button and the one in
                        // the empty state below were the same action, offered twice on one
                        // screen — "Generate Suite" here, "Generate Test Suite" in the
                        // middle of the card.
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
                              disabled={isGenerating || !modelAvailability.enabled('testing')}
                              icon={isGenerating ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : undefined}
                            >
                              {isGenerating ? 'Generating...' : 'Regenerate Suite'}
                            </CcButton>
                          </>
                        ) : null
                      }
                      lead={
                        testCases.length > 0
                          ? 'Written by the testing model from the generated code — one row each, with its last verdict. Untick a scenario to leave it out of the next run.'
                          : undefined
                      }
                    >
                        {testCases.length === 0 && !modelAvailability.enabled('testing') ? (
              /* Roadmap 1.2 / V25-A12 — "Generate Your Test Suite" over a button
                 the server refuses tells the reader nothing about why. */
              <div className="flex items-center justify-center px-4 py-8">
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
              </div>
            ) : testCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-4 py-8 bg-cc-surface-muted rounded-cc-card border border-dashed border-cc-field-border">
                <ListChecks className="w-10 h-10 text-cc-ink-muted mb-4" aria-hidden="true" />
                <h3 className="cc-text-h2 text-cc-ink">Generate the scenarios</h3>
                {/* A stored suite that cannot be drawn is a fact about this
                    project, not the same thing as never having generated one.
                    Without this line the reader is told to start something he
                    already did, and the reason his last suite vanished is
                    nowhere on the screen. */}
                {storedSuiteRejected ? (
                  <p data-stored-test-suite-rejected className="cc-text-cell text-cc-ink-muted mt-2 max-w-sm leading-relaxed">
                    {STORED_TEST_SUITE_REJECTED}
                  </p>
                ) : (
                  <p className="cc-text-cell text-cc-ink-muted mt-2 max-w-sm leading-relaxed">
                    The testing model writes the scenarios from the target code. Generate them first, then run them here against mocks.
                  </p>
                )}

                {genError && (
                  <p data-test-generation-error role="alert" className="mt-4 max-w-sm cc-text-cell font-semibold leading-relaxed text-cc-error">
                    {genError}
                  </p>
                )}

                {/* `animate-bounce` removed. It made the only action on an empty
                    step bounce for ever — an attention-grab aimed at something the
                    reader is already looking at, and the loudest element on a page
                    whose other primaries sit still. It also made the button
                    impossible to click under test: Playwright waits for an element
                    to stop moving, and this one never did. */}
                <div className="mt-6">
                  <CcButton
                    variant="primary"
                    density="cozy"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    icon={isGenerating ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : undefined}
                  >
                    {isGenerating ? 'Generating Suite...' : 'Generate Test Suite'}
                  </CcButton>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
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

                <p data-stage-output="testCases" className={clsx(LABEL, 'm-0')}>{selectedTestCases.length} of {testCases.length} selected</p>
                {/* The whole row is the checkbox's label, so a click anywhere on
                    it ticks the box and the box is what the keyboard reaches —
                    a clickable row alone was out of reach of Tab and Space. The
                    label's text (id, category, description) is the box's name. */}
                <div className="max-h-[640px] space-y-2 overflow-auto">
                {testCases.map((tc, i) => {
                  const verdict = verdictOf(tc);
                  return (
                  <label
                    key={i}
                    className={clsx(
                      "flex items-start gap-3 p-3 rounded-cc-row border transition-colors cursor-pointer",
                      selectedTestCases.includes(i) ? "border-cc-ink bg-cc-surface" : "border-cc-line hover:border-cc-field-border hover:bg-cc-surface-muted"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTestCases.includes(i)}
                      onChange={() => toggleTestCase(i)}
                      className="mt-1 w-4 h-4 shrink-0 cursor-pointer rounded border-cc-field-border accent-cc-ink"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-cc-mono text-[12px] font-semibold text-cc-ink">{renderSafeValue(tc.id)}</span>
                        {tc.category && (
                          <CcTag>{renderSafeValue(tc.category)}</CcTag>
                        )}
                      </div>
                      {/* The scenario's name first — what it checks, in words — and
                          its description under it where the model wrote one. */}
                      <p className="cc-text-cell font-semibold text-cc-ink truncate sm:whitespace-normal">{renderSafeValue(tc.name) || renderSafeValue(tc.description)}</p>
                      {tc.name && tc.description ? (
                        <p className="cc-text-meta text-cc-ink-muted truncate sm:whitespace-normal">{renderSafeValue(tc.description)}</p>
                      ) : null}
                    </div>
                    {/* The last verdict, from the receipt or this session — never
                        the status string stored on the case. */}
                    <span data-scenario-verdict={verdict ? verdictTone(verdict) : 'not-run'} className="shrink-0">
                      {verdict === 'Passed' ? (
                        // A pass here is against mocks — "Demonstrated · mock", never green.
                        <CcProvenanceChip value="demonstrated-mock" />
                      ) : verdict === 'Failed' ? (
                        <CcStateText state="error">Failed</CcStateText>
                      ) : verdict ? (
                        <CcStateText state="neutral" hollow>{verdict}</CcStateText>
                      ) : (
                        <CcStateText state="neutral" hollow>Not run</CcStateText>
                      )}
                    </span>
                  </label>
                  );
                })}
                </div>
              </div>
            )}
                    </ToolSection>

                    {/* ── What a tester checks by hand: the engine's coverage report ── */}
                    <ToolSection
                      id="testing-hand"
                      data-testing-hand=""
                      title="What a tester checks by hand"
                      aside={program ? program.gaps.length : undefined}
                      lead="Straight from the engine’s coverage report: every construct it did not judge."
                    >
                      <HandChecks
                        noSource={!program}
                        gaps={program?.gaps ?? []}
                        strip={program ? { lines: program.lines, bands: program.bands, marks: program.marks, ticks: findingTicks } : null}
                      />
                    </ToolSection>

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
                  {isAbapCloud ? 'abap-unit-stubs ~ simulated run' : 'sandbox-runtime ~ node app.js'}
                </span>
              </div>
            </div>
            <CcButton variant="ghost" onClick={() => setShowTestCode(!showTestCode)}>
              {isAbapCloud
                ? (showTestCode ? 'View Simulated Output' : 'View ABAP Unit Class')
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
                {(!storedSuiteRejected && project?.testSuite?.code) || (isAbapCloud ? 'No test suite generated yet. Generate a suite to inspect local ABAP stubs.' : 'No test code generated yet.')}
              </pre>
            ) : (
              <pre className="whitespace-pre-wrap leading-relaxed">{sandboxOutput || '// Waiting for execution...'}</pre>
            )}
          </div>
        </div>
                      </CcDisclosure>
                      {!showConsole && (
                        <p className="cc-text-meta text-cc-ink-muted">The runner{"'"}s console and the generated test code — the technical detail behind the results.</p>
                      )}
                    </section>
                  </div>

                  <aside aria-label="About running tests against mocks" className="flex min-w-0 flex-col gap-4">
                    <TabExplainer
                      items={isAbapCloud ? [
                        { text: 'Writes ABAP Unit local test class stubs for the RAP behaviour' },
                        { text: 'Stands in for database access with SQL test doubles' },
                        { text: 'Does not compile or run the stubs — a run here is simulated', not: true },
                        { text: 'Does not run generated tests on a tenant', not: true },
                      ] : [
                        { text: 'Runs the generated suite in a restricted Node.js process' },
                        { text: 'Uses SAP mocks, not your system' },
                        { text: 'Names every package it had to replace with an empty stand-in' },
                        { text: 'Does not run generated tests on a tenant', not: true },
                      ]}
                    />

                    {/* The tenant in one card: what is open, what stays locked, and the
                        way to the other tab. The lock itself is said once, there. */}
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
                        <CcButton onClick={() => handleEnvChange('live')} icon={<Lock size={14} aria-hidden="true" />}>
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
              ),
            },
            {
              value: ENV_SEGMENTS[1].value,
              label: ENV_SEGMENTS[1].label,
              icon: <Lock size={14} aria-hidden="true" />,
              content: (
                <div data-testing-panel="live" className={RAIL_GRID}>
                  <div className="flex min-w-0 flex-col gap-4">
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
                          ? 'Auto-filled from your BTP Destination JSON. You can also enter it manually.'
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
                          label="SAP BTP Destination JSON Configuration"
                          required
                          help="Paste the JSON from SAP BTP Cockpit → Connectivity → Destinations. The Name, URL, Authentication, and ProxyType fields are auto-extracted."
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
                              <span className="font-bold text-cc-ink block mb-1">BTP Destination Service (JSON)</span>
                              <span className="text-cc-ink-muted">Paste your BTP destination JSON config. For enterprises routing via SAP BTP with Cloud Connector or Internet proxy.</span>
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
                              <p>→ Paste the full JSON from your BTP Destination into the text area below</p>
                              <p>→ The system automatically extracts <strong>Name</strong>, <strong>URL</strong>, <strong>Authentication</strong>, and <strong>ProxyType</strong></p>
                              <p className="cc-text-meta font-medium text-cc-ink mt-1"><MapPin className="inline w-3 h-3 mr-1" aria-hidden="true" />Where to find: SAP BTP Cockpit → Connectivity → Destinations → Select your destination → Export as JSON (or copy the config)</p>
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
                          <p className="cc-text-cell text-cc-ink-muted">Click <strong>Save connection</strong> to store the config, encrypted on the server. The <strong>Run tests against mocks</strong> tab is where the generated suite runs.</p>
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
                      <li><strong>Check the connection:</strong> Test the handshake, read OData metadata and make one read-only call from the Stage 5 testing environment. That is the whole of what this tab does; the notice above says what it does not.</li>
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

                  <aside aria-label="About checking the tenant connection" className="flex min-w-0 flex-col gap-4">
                    {/* Where the suite does run. Not a second lock notice — the one
                        on the left is the only one on this screen (roadmap 1.7). */}
                    <CcCard title="Run tests against mocks" level={2}>
                      <p data-live-test-hint className="cc-text-cell text-cc-ink mb-3">
                        {testCases.length > 0
                          ? `The other tab runs the ${scenarios(testCases.length)} in the restricted test runner, against mocks — never on this tenant.`
                          : 'Scenarios are written and run on the other tab, against mocks — never on this tenant.'}
                      </p>
                      <LastRunRow run={run} />
                      <div className="mt-3">
                        <CcButton variant="secondary" onClick={() => handleEnvChange('mock')}>
                          Run tests against mocks
                        </CcButton>
                      </div>
                    </CcCard>

                    <TabExplainer
                      items={[
                        { text: 'Checks that the tenant answers' },
                        { text: 'Reads OData metadata' },
                        { text: 'Makes one read-only OData call' },
                        { text: 'Does not run generated tests on the tenant', not: true },
                      ]}
                      note="Use a non-productive tenant. Credentials are encrypted at rest and used only for these reads; production hosts are blocked."
                    />
                  </aside>
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* The report of one test case: the library's dialog (§2.6) — the page
          behind is inert, Escape and the close button leave, and the focus
          returns to the card that opened it. A click on the dimmed page no
          longer closes it: that is the dialog's rule, not this page's. */}
      <CcDialog
        open={!!selectedResult}
        title={selectedResult ? renderSafeValue(selectedResult.name) : ''}
        onClose={() => setSelectedResult(null)}
        size="wide"
        data-test-report=""
        actions={
          <CcButton variant="ghost" density="cozy" onClick={() => setSelectedResult(null)}>
            Close report
          </CcButton>
        }
      >
        {selectedResult && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="font-cc-mono text-[13px] font-semibold text-cc-ink">{renderSafeValue(selectedResult.id)}</span>
              <CcTag>{renderSafeValue(selectedResult.category)}</CcTag>
              <span className={clsx(
                "ml-auto px-3 py-1 rounded-cc-row border cc-text-meta",
                STATE_CLASSES[VERDICT_STATE[verdictTone(selectedResult.status)]].bg,
                STATE_CLASSES[VERDICT_STATE[verdictTone(selectedResult.status)]].border,
                STATE_CLASSES[VERDICT_STATE[verdictTone(selectedResult.status)]].text,
              )}>
                {renderSafeValue(selectedResult.status)}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className={clsx(LABEL, 'mb-2')}>Goal</h3>
                  <p className="cc-text-body text-cc-ink">{renderSafeValue(selectedResult.description)}</p>
                </div>
                <div>
                  <h3 className={clsx(LABEL, 'mb-2')}>Preconditions</h3>
                  <div className="bg-cc-surface-muted p-4 rounded-cc-row border border-cc-line">
                    <p className="cc-text-cell text-cc-ink whitespace-pre-wrap">{renderSafeValue(selectedResult.preconditions)}</p>
                  </div>
                </div>
                <div>
                  <h3 className={clsx(LABEL, 'mb-2')}>Requirement Metadata</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-cc-surface-muted p-3 rounded-cc-row border border-cc-line">
                      <span className={clsx(LABEL, 'block mb-1')}>Priority</span>
                      <span className="cc-text-cell font-semibold text-cc-ink">{renderSafeValue(selectedResult.priority) || 'Medium'}</span>
                    </div>
                    <div className="bg-cc-surface-muted p-3 rounded-cc-row border border-cc-line">
                      <span className={clsx(LABEL, 'block mb-1')}>Test Data</span>
                      <span className="cc-text-cell font-semibold text-cc-ink truncate block">{renderSafeValue(selectedResult.testData) || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className={clsx(LABEL, 'mb-2')}>Execution Sequence</h3>
                  <div className="space-y-2">
                    {Array.isArray(selectedResult.steps) ? selectedResult.steps.map((step: any, idx: number) => (
                      <div key={idx} className="flex gap-4 p-3 bg-cc-surface-muted rounded-cc-row border border-cc-line">
                        <span className="font-bold text-cc-ink cc-text-cell">{idx + 1}.</span>
                        <span className="cc-text-cell text-cc-ink leading-relaxed">{renderSafeValue(step)}</span>
                      </div>
                    )) : <p className="cc-text-cell text-cc-ink">{renderSafeValue(selectedResult.steps)}</p>}
                  </div>
                </div>
                <div>
                  <h3 className={clsx(LABEL, 'mb-2')}>Validation Logic</h3>
                  <div className={clsx(
                    "p-4 rounded-cc-row border font-cc-mono text-[12px] text-cc-ink",
                    STATE_CLASSES[VERDICT_STATE[verdictTone(selectedResult.status)]].bg,
                    STATE_CLASSES[VERDICT_STATE[verdictTone(selectedResult.status)]].border,
                  )}>
                    <div className="mb-4">
                      <span className={clsx(LABEL, 'block mb-1')}>Execution Message</span>
                      <p className="font-semibold">{renderSafeValue(selectedResult.message)}</p>
                    </div>
                    {selectedResult.expectedResult && (
                      <div>
                        <span className={clsx(LABEL, 'block mb-1')}>Expected Invariant</span>
                        <p className="font-semibold">{renderSafeValue(selectedResult.expectedResult)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CcDialog>


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

      <StageFooter
        backPath={`/project/${projectId}/documentation`}
        backLabel="Back to Documentation"
        proceedPath={`/project/${projectId}/tco`}
        proceedLabel="Proceed to Economics"
        incomplete={testCases.length === 0}
        incompleteReason="no test suite has been generated"
      />
    </div>
  );
}
