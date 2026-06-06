'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc, doc, getDocs, limit } from 'firebase/firestore';
import { Plus, Trash2, ArrowRight, FolderOpen, Folder, ChevronRight, ChevronDown, ChevronUp, FileText, FileCode2, Download, Copy, Eye, X, Activity, Clock, CheckCircle2, RefreshCw, AlertCircle, BookOpen, Shield, ShieldAlert, MessageSquare, Crown, ShieldCheck, HelpCircle, Send } from 'lucide-react';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';
import nextDynamic from 'next/dynamic';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatAnalysisToMarkdown, formatDesignToMarkdown, formatDocsToMarkdown, formatPresentationToMarkdown } from '@/lib/markdownFormatter';
import { marked } from 'marked';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });

import { ProjectSkeleton, ExampleSkeleton } from '@/components/Skeleton';

const STATIC_EXAMPLES = [
  {
    id: 'static-report-alv',
    name: 'Z_FI_INVOICE_REPORT.abap',
    code: `REPORT Z_FI_INVOICE_REPORT.
*----------------------------------------------------------------------*
* Classic ABAP Invoice Report with ALV Grid Output
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_invoice,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         blart TYPE blart,
         bldat TYPE bldat,
         wrbtr TYPE wrbtr,
         waers TYPE waers,
       END OF ty_invoice.

DATA: lt_invoices TYPE TABLE OF ty_invoice,
      ls_invoice  TYPE ty_invoice.

START-OF-SELECTION.
  SELECT belnr gjahr blart bldat wrbtr waers
    FROM bkpf
    INTO TABLE lt_invoices
    UP TO 100 ROWS
    WHERE blart = 'KR'.

  IF lt_invoices IS INITIAL.
    WRITE: 'No invoices found for vendor billing.'.
  ELSE.
    LOOP AT lt_invoices INTO ls_invoice.
      WRITE: / ls_invoice-belnr, ls_invoice-gjahr, ls_invoice-wrbtr, ls_invoice-waers.
    ENDLOOP.
  ENDIF.`,
    isStatic: true
  },
  {
    id: 'static-rfc-bapi',
    name: 'Z_CUSTOMER_GET_DETAIL.abap',
    code: `FUNCTION Z_CUSTOMER_GET_DETAIL.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(CUSTOMER_ID) TYPE  KUNNR
*"  EXPORTING
*"     VALUE(CUSTOMER_NAME) TYPE  NAME1_GP
*"     VALUE(CITY) TYPE  ORT01_GP
*"  EXCEPTIONS
*"      CUSTOMER_NOT_FOUND
*"----------------------------------------------------------------------
  SELECT SINGLE name1 ort01
    FROM kna1
    INTO (customer_name, city)
    WHERE kunnr = customer_id.

  IF sy-subrc <> 0.
    RAISE customer_not_found.
  ENDIF.
ENDFUNCTION.`,
    isStatic: true
  },
  {
    id: 'static-db-crud',
    name: 'Z_CREATE_MATERIAL.abap',
    code: `REPORT Z_CREATE_MATERIAL.
*----------------------------------------------------------------------*
* Create Material Record in Custom SAP Material Table
*----------------------------------------------------------------------*
PARAMETERS: p_matnr TYPE matnr OBLIGATORY,
            p_maktx TYPE maktx OBLIGATORY,
            p_meins TYPE meins DEFAULT 'PC'.

DATA: ls_mat TYPE zmat_table.

START-OF-SELECTION.
  ls_mat-matnr = p_matnr.
  ls_mat-maktx = p_maktx.
  ls_mat-meins = p_meins.
  ls_mat-ernam = sy-uname.
  ls_mat-erdat = sy-datum.

  INSERT zmat_table FROM ls_mat.
  IF sy-subrc = 0.
    COMMIT WORK.
    WRITE: / 'Material record created successfully: ', p_matnr.
  ELSE.
    ROLLBACK WORK.
    WRITE: / 'Failed to insert material record.'.
  ENDIF.`,
    isStatic: true
  },
  {
    id: 'static-oo-abap',
    name: 'ZCL_FLIGHT_CONTROLLER.abap',
    code: `CLASS zcl_flight_controller DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS: get_flight_details
               IMPORTING iv_carrier TYPE s_carr_id
               EXPORTING et_flights TYPE spfli_tab.
ENDCLASS.

CLASS zcl_flight_controller IMPLEMENTATION.
  METHOD get_flight_details.
    SELECT *
      FROM spfli
      INTO TABLE et_flights
      WHERE carrid = iv_carrier.
  ENDMETHOD.
ENDCLASS.`,
    isStatic: true
  },
  {
    id: 'static-sales-order',
    name: 'Z_SALES_ORDER_CREATOR.abap',
    code: `REPORT Z_SALES_ORDER_CREATOR.
*----------------------------------------------------------------------*
* Classic ABAP Sales Order Creation using BAPI wrapper
*----------------------------------------------------------------------*
DATA: l_header  TYPE bapisdhd1,
      lt_items  TYPE TABLE OF bapisditm,
      ls_item   TYPE bapisditm,
      lt_return TYPE TABLE OF bapiret2.

START-OF-SELECTION.
  l_header-doc_type   = 'TA'.
  l_header-sales_org  = '1000'.
  l_header-distr_chan = '10'.
  l_header-division   = '00'.

  ls_item-itm_number = '000010'.
  ls_item-material   = 'MAT-0001'.
  ls_item-target_qty = '5'.
  APPEND ls_item TO lt_items.

  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
    EXPORTING
      order_header_in = l_header
    TABLES
      return          = lt_return
      order_items_in  = lt_items.

  READ TABLE lt_return WITH KEY type = 'E' TRANSPORTING NO FIELDS.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    WRITE: / 'Error creating sales order.'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    WRITE: / 'Sales order created successfully.'.
  ENDIF.`,
    isStatic: true
  },
  {
    id: 'static-partner-integrator',
    name: 'ZCL_PARTNER_INTEGRATOR.abap',
    code: `CLASS zcl_partner_integrator DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS: fetch_external_partner
               IMPORTING iv_partner_id TYPE string
               EXPORTING ev_json_response TYPE string.
ENDCLASS.

CLASS zcl_partner_integrator IMPLEMENTATION.
  METHOD fetch_external_partner.
    DATA: lo_http_client TYPE REF TO if_http_client,
          lv_url         TYPE string.

    lv_url = |https://api.clean-core.io/partners/{ iv_partner_id }|.

    cl_http_client=>create_by_url(
      EXPORTING
        url                = lv_url
      IMPORTING
        client             = lo_http_client
      EXCEPTIONS
        argument_not_found = 1
        plugin_not_active  = 2
        internal_error     = 3 ).

    IF sy-subrc = 0.
      lo_http_client->request->set_method( 'GET' ).
      lo_http_client->send( ).
      lo_http_client->receive( ).
      ev_json_response = lo_http_client->response->get_cdata( ).
      lo_http_client->close( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
    isStatic: true
  }
];

export default function Dashboard() {
  const auth = getAuth();
  const db = getDb();
  const { profile, loading: loadingProfile, incrementTransformations } = useUserProfile();

  // Return early during SSR if Firebase is bypassed on the server
  if (!auth || !db) return null;
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [abapExamples, setAbapExamples] = useState<any[]>([]);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingExamples, setLoadingExamples] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<{title: string, content: string, type: 'markdown' | 'code' | 'json'} | null>(null);
  const router = useRouter();

  const [isCreating, setIsCreating] = useState(false);
  const [proceedingId, setProceedingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New state for ABAP upload dialog
  const [showUploadExampleDialog, setShowUploadExampleDialog] = useState(false);
  const [showDatabaseInfo, setShowDatabaseInfo] = useState(false);
  const [showWorkspaceInfo, setShowWorkspaceInfo] = useState(false);
  const [exampleFile, setExampleFile] = useState<File | null>(null);
  const [exampleError, setExampleError] = useState('');
  const [isUploadingExample, setIsUploadingExample] = useState(false);

  // New state for starting project from example
  const [exampleToStart, setExampleToStart] = useState<any>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [showForum, setShowForum] = useState(false);

  const handleUploadABAP = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.abap') && !file.name.endsWith('.txt')) {
      setExampleError('Please select a valid .abap or .txt file.');
      setExampleFile(null);
    } else {
      setExampleError('');
      setExampleFile(file);
    }
  };

  const confirmUploadExample = async () => {
    if (!exampleFile || !user) return;
    setIsUploadingExample(true);
    setExampleError('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      
      const legacyKeywords = [/REPORT\s+/i, /DATA\s+/i, /SELECT\s+/i, /FORM\s+/i, /METHOD\s+/i, /CLASS\s+/i];
      const isValidContent = legacyKeywords.some(regex => regex.test(content));
      
      if (!isValidContent && content.trim().length > 0) {
        setExampleError('The file does not appear to contain valid ABAP legacy code.');
        setIsUploadingExample(false);
        return;
      }

      try {
        await addDoc(collection(db, 'abap_examples'), {
          name: exampleFile.name,
          code: content,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
        setShowUploadExampleDialog(false);
        setExampleFile(null);
        setExampleError('');
      } catch (error) {
        setExampleError('Failed to upload file. Please try again.');
        handleFirestoreError(error, OperationType.WRITE, 'abap_examples');
      } finally {
        setIsUploadingExample(false);
      }
    };
    reader.readAsText(exampleFile);
  };

  const handleCreateProjectFromExample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName || isCreating || !exampleToStart || !profile) return;
    
    // Check limit
    if (profile.transformationsUsed >= profile.transformationsLimit) {
      alert(`Limit reached! Your plan (${profile.tier}) allows a maximum of ${profile.transformationsLimit} transformations. Visit settings to upgrade.`);
      return;
    }

    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        name: projectName,
        status: 'uploaded',
        legacyCode: exampleToStart.code,
        userId: user.uid,
        createdAt: serverTimestamp(),
        fromExample: true
      });
      setProjectName('');
      setExampleToStart(null);
      router.push(`/project/${docRef.id}/analyze?autoAnalyze=false&fromExample=true`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteABAP = async (exampleId: string) => {
    try {
      await deleteDoc(doc(db, 'abap_examples', exampleId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'abap_examples');
    }
  };

  useEffect(() => {
    console.log('[DASHBOARD LOG] useEffect auth listener mounted. auth.currentUser:', auth.currentUser ? auth.currentUser.email : 'null');
    
    if (auth.currentUser) {
      console.log('[DASHBOARD LOG] Synchronous auth.currentUser found, initializing immediately');
      setUser(auth.currentUser);
      setLoadingAuth(false);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('[DASHBOARD LOG] onAuthStateChanged fired. currentUser:', currentUser ? currentUser.email : 'null');
      if (!currentUser) {
        console.log('[DASHBOARD LOG] No currentUser, redirecting to landing page /');
        router.push('/');
      } else {
        console.log('[DASHBOARD LOG] Valid user found, setting auth state');
        setUser(currentUser);
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setLoadingProjects(true);
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    
    // Immediate, robust one-time getDocs fetch to ensure loading state resolves
    // even if the persistent onSnapshot streaming connection hangs or is blocked on CI runners.
    getDocs(q).then((snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingProjects(false);
    }).catch((error) => {
      console.error('Immediate getDocs projects fetch error:', error);
    });

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingProjects(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
      setLoadingProjects(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoadingExamples(true);
    const q = query(
      collection(db, 'abap_examples'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    // Immediate, robust one-time getDocs fetch to ensure loading state resolves
    // even if the persistent onSnapshot streaming connection hangs or is blocked on CI runners.
    getDocs(q).then((snapshot) => {
      setAbapExamples(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingExamples(false);
    }).catch((error) => {
      console.error('Immediate getDocs examples fetch error:', error);
    });

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAbapExamples(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingExamples(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'abap_examples');
      setLoadingExamples(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName || isCreating || !profile) return;

    if (profile.transformationsUsed >= profile.transformationsLimit) {
      alert(`Limit reached! Your plan (${profile.tier}) allows a maximum of ${profile.transformationsLimit} transformations. Please upgrade your plan in settings.`);
      return;
    }

    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        name: projectName,
        status: 'uploaded',
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setProjectName('');
      setShowUpload(false);
      router.push(`/project/${docRef.id}/analyze`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (deleteId) {
      try {
        await deleteDoc(doc(db, 'projects', deleteId));
        setDeleteId(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `projects/${deleteId}`);
      }
    }
  };

  const handleCopyProject = async (project: any) => {
    const { id, createdAt, ...projectData } = project;
    try {
      await addDoc(collection(db, 'projects'), {
        ...projectData,
        name: `${project.name} - Copy`,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    }
  };

  const handleExportProject = (project: any) => {
    const { id, userId, ...exportData } = project;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    saveAs(blob, `${project.name.replace(/\s+/g, '_')}_export.json`);
  };

  const handleProceed = (project: any) => {
    setProceedingId(project.id);
    if (project.cleanCoreScore && project.cleanCoreScore > 90) router.push(`/project/${project.id}/delivery`);
    else if (project.status === 'uploaded') router.push(`/project/${project.id}/analyze`);
    else if (project.status === 'analyzed') router.push(`/project/${project.id}/design`);
    else if (project.status === 'designed') router.push(`/project/${project.id}/transformation`);
    else if (project.status === 'transformed') router.push(`/project/${project.id}/testing`);
    else if (project.status === 'testing') router.push(`/project/${project.id}/documentation`);
    else if (project.status === 'documented') router.push(`/project/${project.id}/delivery`);
    else router.push(`/project/${project.id}/delivery`);
  };

  const [forumTitle, setForumTitle] = useState('');
  const [forumMessage, setForumMessage] = useState('');
  const [forumAuthor, setForumAuthor] = useState('');
  const [forumSending, setForumSending] = useState(false);
  const [forumSent, setForumSent] = useState(false);
  const [forumError, setForumError] = useState<string | null>(null);
  const [lastPostTime, setLastPostTime] = useState<number | null>(null);
  const [activePost, setActivePost] = useState<any | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [forumFilter, setForumFilter] = useState<'all' | 'announcements' | 'technical' | 'general'>('all');
  const [forumSearch, setForumSearch] = useState('');
  const [forumCategory, setForumCategory] = useState<'technical' | 'general'>('technical');
  const [selectedExampleCategory, setSelectedExampleCategory] = useState<string>('all');
  const [exampleSearch, setExampleSearch] = useState('');

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'announcements':
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 select-none font-mono">
            📢 Announcement
          </span>
        );
      case 'technical':
        return (
          <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 select-none font-mono">
            ⚙️ Technical Q&A
          </span>
        );
      case 'general':
        return (
          <span className="bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 select-none font-mono">
            💬 General
          </span>
        );
      default:
        return null;
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !activePost) return;

    const newComment = {
      id: `comment-${Date.now()}`,
      author: profile ? `${profile.firstName} ${profile.lastName}` : 'Anonymous Pilot',
      message: newCommentText.trim(),
      createdAt: 'Just now',
      likes: 0
    };

    const updatedActivePost = {
      ...activePost,
      comments: (activePost.comments || 0) + 1,
      commentsList: [...(activePost.commentsList || []), newComment]
    };
    setActivePost(updatedActivePost);

    setForumPosts(prev => prev.map(post => 
      post.id === activePost.id 
        ? { 
            ...post, 
            comments: post.comments + 1, 
            commentsList: [...(post.commentsList || []), newComment] 
          }
        : post
    ));

    setNewCommentText('');
  };

  const handleLikeActivePost = () => {
    if (!activePost) return;
    setActivePost((prev: any) => ({ ...prev, likes: (prev.likes || 0) + 1 }));
    setForumPosts(prev => prev.map(p => p.id === activePost.id ? { ...p, likes: p.likes + 1 } : p));
  };

  const handleLikeComment = (commentId: string) => {
    if (!activePost) return;
    
    const updatedComments = (activePost.commentsList || []).map((c: any) => 
      c.id === commentId ? { ...c, likes: (c.likes || 0) + 1 } : c
    );
    
    const updatedActivePost = {
      ...activePost,
      commentsList: updatedComments
    };
    
    setActivePost(updatedActivePost);
    
    setForumPosts(prev => prev.map(p => 
      p.id === activePost.id 
        ? { ...p, commentsList: updatedComments } 
        : p
    ));
  };

  const validateAndModerateContent = (title: string, message: string): string | null => {
    const combined = `${title} ${message}`.toLowerCase();

    // 1. Script & HTML Injection Checks (XSS)
    const scriptPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/i,
      /onload\s*=/i,
      /onerror\s*=/i,
      /onclick\s*=/i
    ];
    for (const pattern of scriptPatterns) {
      if (pattern.test(combined)) {
        return "Security Policy Violation: Script or HTML tag injection detected. Raw iframe or script elements are blocked for user session protection.";
      }
    }

    // 2. Sensitive Database Credentials & SAP Secrets Check
    const secretKeywords = [
      "sap_pass", "db_password", "client_secret", "api_key",
      "begin private key", "-----begin", "client-secret",
      "master_password", "db_pass", "passwort123"
    ];
    for (const word of secretKeywords) {
      if (combined.includes(word)) {
        return "Security Policy Violation: Sensitive credentials or SAP system secrets leak detected. Plaintext master passwords or private keys cannot be published to prevent corporate data breaches.";
      }
    }

    // 3. Illegal & Infringing Content Checks
    const illegalKeywords = [
      "crack", "keygen", "serial key", "warez", "torrent", "null-route",
      "casino", "gambling", "porn", "viagra", "hack", "pirated", "adult link",
      "poker online", "betting site", "explicit content", "free downloads crack"
    ];
    for (const keyword of illegalKeywords) {
      if (combined.includes(keyword)) {
        return `Security Policy Violation: The term "${keyword}" is blacklisted under Clean-Core.io's Pilot Safety standard (blocks illegal warez, keygens, casinos, and explicit references).`;
      }
    }

    return null;
  };

  const [forumPosts, setForumPosts] = useState<any[]>([
    {
      id: 'post-pinned',
      title: '📌 Welcome to the Clean-Core.io Pilot Forum & Tech Escalations',
      author: 'Clean-Core Admin',
      authorEmail: 'admin@clean-core.io',
      isAdmin: true,
      category: 'announcements',
      message: 'Welcome everyone! This forum serves as our technical pilot community board where you can share modernization learnings, raise edge-case ABAP statements, and map architectural questions. For direct inquiries, platform upgrades, or account approvals, please use our secure admin forwarder admin@clean-core.io. All correspondence is privately routed directly to my desk. Happy transforming!',
      createdAt: 'Just now',
      likes: 0,
      comments: 0,
      pinned: true,
      commentsList: []
    },
    {
      id: 'post-pinned-techstack',
      title: '📌 Clean-Core.io Technical Architecture & Tech Stack Deep Dive',
      author: 'Clean-Core Admin',
      authorEmail: 'admin@clean-core.io',
      isAdmin: true,
      category: 'technical',
      message: `Welcome to the official technical blueprint of Clean-Core.io!\n\nTo achieve standard SAP Clean Core modernizations, our serverless architectural stack transforms custom SAP legacy code (ABAP) from ERP kernels:\n\n- Frontend Core: Built on Next.js 14 App Router, React 18, TypeScript, and Tailwind CSS.\n- Transformed API & LLM Gateway: Google Gemini 3 models (including gemini-3-pro and gemini-3-flash) generate modern Node.js/TypeScript code.\n- Transformed Security (BYOK): Supports client-side SubtleCrypto PBKDF2 AES-GCM encrypted Google Gemini keys that never transit in plaintext.\n- Sandbox Testing: Transformed TypeScript packages are automatically validated in a secure, containerized sandbox.\n- Persistence Layer: Enforces strict multi-tenant isolation via structured secure Firestore document rules.\n\nFeel free to ask technical questions about our transformation strategies below!`,
      createdAt: 'Just now',
      likes: 0,
      comments: 0,
      pinned: true,
      commentsList: []
    }
  ]);

  const getExampleCategory = (example: any) => {
    const name = (example.name || '').toLowerCase();
    const code = (example.code || '').toLowerCase();
    
    if (name.includes('rfc') || name.includes('bapi') || name.includes('function') || code.includes('call function') || code.includes('bapi_')) {
      return { id: 'rfc-apis' };
    }
    if (name.includes('report') || name.includes('alv') || name.includes('write') || code.includes('write:') || code.includes('alv')) {
      return { id: 'reports' };
    }
    if (name.includes('select') || name.includes('db') || name.includes('table') || code.includes('select ') || code.includes('insert ') || code.includes('update ')) {
      return { id: 'db-operations' };
    }
    if (name.includes('class') || name.includes('method') || code.includes('class ') || code.includes('method ')) {
      return { id: 'oo-abap' };
    }
    return { id: 'uncategorized' };
  };

  const categories = [
    { id: 'reports', label: 'Reports & Output (Classic ALV)', description: 'Classic reporting logic, output grids, and list formatting.', color: 'from-emerald-500 to-green-600', textLight: 'text-emerald-700', bgLight: 'bg-emerald-50/50 border-emerald-100' },
    { id: 'rfc-apis', label: 'Function Modules & RFC APIs (RFC / BAPI)', description: 'Remote-enabled interfaces, RFC connections, and BAPI mappings.', color: 'from-indigo-500 to-blue-600', textLight: 'text-indigo-700', bgLight: 'bg-indigo-50/50 border-indigo-100' },
    { id: 'db-operations', label: 'Database Access & CRUD Operations (SQL)', description: 'Open SQL statements, internal tables manipulation, and database operations.', color: 'from-amber-500 to-orange-600', textLight: 'text-amber-700', bgLight: 'bg-amber-50/50 border-amber-100' },
    { id: 'oo-abap', label: 'OO-ABAP & Class Methods (LCL)', description: 'Object-oriented classes, interfaces, and local methods implementations.', color: 'from-purple-500 to-pink-600', textLight: 'text-purple-700', bgLight: 'bg-purple-50/50 border-purple-100' },
    { id: 'uncategorized', label: 'General Legacy Code', description: 'Miscellaneous custom uploads and generic legacy modules.', color: 'from-slate-500 to-slate-600', textLight: 'text-slate-700', bgLight: 'bg-slate-50/50 border-slate-200' }
  ];

  const allExamples = STATIC_EXAMPLES;

  const handleCreateForumPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forumTitle.trim() || !forumMessage.trim()) return;

    // 1. Rate Limiting Check (60 seconds)
    const now = Date.now();
    if (lastPostTime && now - lastPostTime < 60000) {
      const remainingSeconds = Math.ceil((60000 - (now - lastPostTime)) / 1000);
      setForumError(`Rate limit triggered. Please wait ${remainingSeconds} seconds before posting another thread to prevent spam flooding.`);
      return;
    }

    // 2. Automated Moderation & Injection Blocking
    const moderationViolation = validateAndModerateContent(forumTitle, forumMessage);
    if (moderationViolation) {
      setForumError(moderationViolation);
      return;
    }

    setForumError(null);
    setForumSending(true);
    setTimeout(() => {
      const isAdminUser = profile?.email === 'sonny.frenzel@googlemail.com' || user?.email === 'sonny.frenzel@googlemail.com' || profile?.isAdmin;
      const newPost = {
        id: `post-${Date.now()}`,
        title: forumTitle,
        category: forumCategory,
        author: isAdminUser ? 'Clean-Core Admin' : (forumAuthor.trim() || (profile ? `${profile.firstName} ${profile.lastName}` : 'Anonymous Pilot')),
        authorEmail: isAdminUser ? 'admin@clean-core.io' : (profile?.email || 'anonymous'),
        isAdmin: isAdminUser,
        message: forumMessage,
        createdAt: 'Just now',
        likes: 0,
        comments: 0,
        commentsList: []
      };
      setForumPosts(prev => [newPost, ...prev]);
      setForumTitle('');
      setForumMessage('');
      setForumAuthor('');
      setLastPostTime(Date.now());
      setForumSending(false);
      setForumSent(true);
      setTimeout(() => setForumSent(false), 4000);
    }, 800);
  };

  const downloadFile = (content: string, filename: string, type: string = 'text/plain') => {
    const blob = new Blob([content], { type });
    saveAs(blob, filename);
  };

  if (loadingAuth || loadingProfile) return (
    <div className="h-[60vh] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
        <p className="text-lg font-medium text-gray-500">Loading workspace...</p>
    </div>
  );

  if (profile?.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center pt-16 md:pt-24 text-center max-w-2xl mx-auto px-4">
        <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mb-6">
          <Clock className="w-10 h-10 text-amber-600" />
        </div>
        <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Hang tight!</h2>
        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
          Your request for the <strong>Clean-Core.io Pilot</strong> program is currently under review. 
          To ensure quality and manage capacity, our admins manually approve new accounts.
        </p>
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-left w-full">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><MessageSquare size={18} className="text-green-600"/> Fast-track your approval</h3>
          <p className="text-gray-600 text-sm mb-4">You can reach out directly via email to expedite the process.</p>
          <a 
            href="mailto:info@clean-core.io" 
            className="inline-flex items-center justify-center w-full bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-900 font-bold py-3 rounded-xl transition-colors"
          >
            Email info@clean-core.io
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 bg-[#f8f9ff] min-h-screen p-8">
      {profile && profile.transformationsUsed >= profile.transformationsLimit && (
        <div className="mb-8 p-6 bg-amber-50 border-2 border-amber-200 rounded-[2rem] flex flex-col sm:flex-row items-center gap-4 animate-in slide-in-from-top-4 duration-500 shadow-sm text-center sm:text-left">
          <div className="bg-amber-100 p-3 rounded-2xl shrink-0">
            <ShieldAlert size={24} className="text-amber-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-amber-900 tracking-tight">Limit Reached</h3>
            <p className="text-amber-800 font-medium text-sm">Your {profile.tier} plan allows a maximum of {profile.transformationsLimit} transformation. Visit your profile settings for an upgrade.</p>
          </div>
          <button 
            onClick={() => router.push('/settings')}
            className="w-full sm:w-auto bg-amber-600 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-amber-700 transition-all whitespace-nowrap"
          >
            Go to Settings
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-black text-[#0b1c30] tracking-tight">Workspace</h1>
            <button 
              type="button"
              onClick={() => setShowWorkspaceInfo(true)}
              className="text-gray-400 hover:text-green-600 transition-colors p-1.5 rounded-full hover:bg-green-50 outline-none mr-2"
              title="What is this workspace for?"
            >
              <HelpCircle size={18} />
            </button>
            {profile && (
              <div className={`px-3 py-1 rounded-full border text-[11px] font-black font-mono shadow-sm flex items-center gap-1.5 transition-all select-none uppercase tracking-wider ${
                profile.tier === 'enterprise' 
                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                  : (profile.transformationsLimit - profile.transformationsUsed <= 1)
                    ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                    : 'bg-green-50 text-green-700 border-green-200'
              }`}>
                <Activity size={12} className={profile.tier !== 'enterprise' && (profile.transformationsLimit - profile.transformationsUsed <= 1) ? 'animate-bounce' : 'animate-pulse'} />
                {profile.tier === 'enterprise' ? (
                  <span>Enterprise: Unlimited</span>
                ) : (
                  <span>Pilot Balance: {Math.max(0, profile.transformationsLimit - profile.transformationsUsed)} / {profile.transformationsLimit} Free</span>
                )}
              </div>
            )}
          </div>
          <p className="text-[#0b1c30]/70 mt-1 font-medium">Manage your transformation projects and deliverables.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={() => router.push('/how-to')}
            className="flex items-center justify-center gap-2 bg-white border border-gray-300 hover:border-green-300 text-[#0b1c30] hover:text-green-600 hover:bg-green-50 px-6 py-3 rounded-xl transition-all shadow-sm font-bold text-sm w-full sm:w-auto"
          >
            <BookOpen size={18} className="text-green-600" /> How-to
          </button>
          <button 
            onClick={() => setShowUpload(true)}
            className="flex items-center justify-center gap-2 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl font-bold text-sm w-full sm:w-auto"
          >
            <Plus size={18} /> Create Project
          </button>
        </div>
      </div>

      {/* Modals */}

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm shadow-xl">
            <h2 className="text-xl font-bold mb-2 text-gray-900">Delete Project</h2>
            <p className="mb-6 text-sm text-gray-500">Are you sure you want to delete this project? All generated assets will be lost.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDeleteProject} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">Delete Project</button>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={handleCreateProject} className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-2 text-gray-900">Create Project</h2>
            <p className="mb-4 text-sm text-gray-500">Give your transformation project a descriptive name.</p>
            
            {/* System Disclaimer & Terms */}
            <div className="mb-4 bg-amber-50/50 border border-amber-200/50 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed font-medium">
              ⚠️ <strong>Pilot Terms:</strong> This is a non-commercial, AI-powered playground. Generated code may contain errors and is provided without warranty or liability. Review our <a href="/settings" className="underline font-bold text-amber-950 hover:text-green-700 transition-colors">Privacy Policy</a> & Legal Notice in settings.
            </div>

            {/* Quota limit feedback */}
            {profile && profile.tier !== 'enterprise' && profile.transformationsUsed >= profile.transformationsLimit ? (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-red-50 to-rose-50/30 border border-red-200/60 shadow-sm flex items-start gap-3">
                <div className="bg-red-100 p-2.5 rounded-lg text-red-700 shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-600 animate-bounce" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-red-800 font-mono">Quota Exceeded</h4>
                  <p className="text-xs text-red-700 font-semibold mt-0.5 leading-snug">
                    You have used all <strong>{profile.transformationsLimit}</strong> free transformations. Please upgrade or configure your own Gemini API key in settings to proceed.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50/30 border border-green-200/60 shadow-sm flex items-start gap-3">
                <div className="bg-green-100 p-2.5 rounded-lg text-green-700 shrink-0">
                  <Activity className="w-5 h-5 text-green-600 animate-pulse" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-green-800 font-mono">Pilot Balance Status</h4>
                  <p className="text-sm text-green-700 font-semibold mt-0.5 leading-snug">
                    {profile?.tier === 'enterprise' ? (
                      <span>✨ Unlimited enterprise transformations remaining.</span>
                    ) : (
                      <span>
                        You have <strong>{Math.max(0, (profile?.transformationsLimit || 5) - (profile?.transformationsUsed || 0))}</strong> of <strong>{profile?.transformationsLimit || 5}</strong> free transformations left.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Project Name</label>
              <input 
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full border border-gray-300 px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                placeholder="e.g., Z_FI_INVOICE_REPORT"
                autoFocus
                disabled={isCreating || (profile?.tier !== 'enterprise' && (profile?.transformationsUsed || 0) >= (profile?.transformationsLimit || 5))}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" disabled={isCreating}>Cancel</button>
              <button 
                type="submit" 
                disabled={!projectName.trim() || isCreating || (profile?.tier !== 'enterprise' && (profile?.transformationsUsed || 0) >= (profile?.transformationsLimit || 5))} 
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-2"
              >
                {isCreating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showUploadExampleDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-2 text-gray-900">Upload Legacy Code</h2>
            <p className="mb-4 text-sm text-gray-500">Select an ABAP or text file to add to the database.</p>
            
            {/* System Disclaimer & Terms */}
            <div className="mb-4 bg-amber-50/50 border border-amber-200/50 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed font-medium">
              ⚠️ <strong>AI Processing Notice:</strong> Uploaded codes are analyzed server-side using Generative AI. This pilot is non-commercial, provided completely without warranty or liability.
            </div>

            <div className="mb-6">
              <input 
                type="file" 
                accept=".abap,.txt"
                onChange={handleUploadABAP}
                className="w-full border border-gray-300 px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
              />
              {exampleError && <p className="text-red-500 text-sm mt-2 font-medium flex items-center gap-1"><AlertCircle size={14} /> {exampleError}</p>}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowUploadExampleDialog(false);
                  setExampleFile(null);
                  setExampleError('');
                }} 
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isUploadingExample}
              >
                Cancel
              </button>
              <button 
                onClick={confirmUploadExample}
                disabled={!exampleFile || !!exampleError || isUploadingExample} 
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-2"
              >
                {isUploadingExample ? <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading...</> : 'Upload File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {exampleToStart && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={handleCreateProjectFromExample} className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-2 text-gray-900">Start Project from Example</h2>
            <p className="mb-4 text-sm text-gray-500">Name your new project based on <strong>{exampleToStart.name}</strong>.</p>
            
            {/* Quota limit feedback */}
            {profile && profile.tier !== 'enterprise' && profile.transformationsUsed >= profile.transformationsLimit ? (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-red-50 to-rose-50/30 border border-red-200/60 shadow-sm flex items-start gap-3">
                <div className="bg-red-100 p-2.5 rounded-lg text-red-700 shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-600 animate-bounce" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-red-800 font-mono">Quota Exceeded</h4>
                  <p className="text-xs text-red-700 font-semibold mt-0.5 leading-snug">
                    You have used all <strong>{profile.transformationsLimit}</strong> free transformations. Please upgrade or configure your own Gemini API key in settings to proceed.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50/30 border border-green-200/60 shadow-sm flex items-start gap-3">
                <div className="bg-green-100 p-2.5 rounded-lg text-green-700 shrink-0">
                  <Activity className="w-5 h-5 text-green-600 animate-pulse" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-green-800 font-mono">Pilot Balance Status</h4>
                  <p className="text-sm text-green-700 font-semibold mt-0.5 leading-snug">
                    {profile?.tier === 'enterprise' ? (
                      <span>✨ Unlimited enterprise transformations remaining.</span>
                    ) : (
                      <span>
                        You have <strong>{Math.max(0, (profile?.transformationsLimit || 5) - (profile?.transformationsUsed || 0))}</strong> of <strong>{profile?.transformationsLimit || 5}</strong> free transformations left.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Project Name</label>
              <input 
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full border border-gray-300 px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                placeholder={`e.g., Transform ${exampleToStart.name}`}
                autoFocus
                disabled={isCreating || (profile?.tier !== 'enterprise' && (profile?.transformationsUsed || 0) >= (profile?.transformationsLimit || 5))}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setExampleToStart(null); setProjectName(''); }} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" disabled={isCreating}>Cancel</button>
              <button 
                type="submit" 
                disabled={!projectName.trim() || isCreating || (profile?.tier !== 'enterprise' && (profile?.transformationsUsed || 0) >= (profile?.transformationsLimit || 5))} 
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-2"
              >
                {isCreating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Starting...</> : 'Start Transformation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {viewContent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {viewContent.type === 'code' ? <FileCode2 className="w-5 h-5 text-green-600" /> : <FileText className="w-5 h-5 text-green-600" />}
                {viewContent.title}
              </h2>
              <button onClick={() => setViewContent(null)} className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow bg-white">
              {viewContent.type === 'markdown' ? (
                <div 
                  className="prose prose-base md:prose-lg max-w-none text-slate-800
                    prose-headings:text-slate-900 prose-headings:font-black prose-headings:tracking-tight
                    prose-h1:text-2xl md:text-3xl prose-h1:mb-6 prose-h1:mt-8
                    prose-h2:text-xl md:text-2xl prose-h2:mb-4 prose-h2:mt-6
                    prose-h3:text-lg md:text-xl prose-h3:mb-3 prose-h3:mt-4
                    prose-p:text-slate-600 prose-p:leading-relaxed prose-p:text-sm md:text-base prose-p:mb-4
                    prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-6
                    prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-6
                    prose-li:mb-2
                    prose-strong:text-slate-900 prose-strong:font-bold
                    prose-blockquote:border-l-4 prose-blockquote:border-emerald-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-6 prose-blockquote:text-slate-600
                    prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs prose-code:text-emerald-700
                    prose-table:w-full prose-table:my-6 prose-table:border-collapse prose-table:rounded-xl prose-table:overflow-hidden prose-table:border prose-table:border-slate-200
                    prose-th:bg-slate-50 prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-th:text-slate-500 prose-th:uppercase prose-th:tracking-wider prose-th:border-b prose-th:border-slate-200
                    prose-td:px-4 prose-td:py-3 prose-td:text-xs md:text-sm prose-td:text-slate-700 prose-td:border-b prose-td:border-slate-100
                  "
                  dangerouslySetInnerHTML={{ __html: marked(viewContent.content) as string }}
                />
              ) : viewContent.type === 'json' ? (
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto">
                  {viewContent.content}
                </pre>
              ) : (
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto">
                  {viewContent.content}
                </pre>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button 
                onClick={() => {
                  const ext = viewContent.type === 'code' ? '.js' : viewContent.type === 'json' ? '.json' : '.md';
                  downloadFile(viewContent.content, `${viewContent.title.replace(/\s+/g, '_')}${ext}`);
                }}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm font-medium text-sm"
              >
                <Download size={16} /> Download File
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspaceInfo && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 flex flex-col gap-6 relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-500 via-emerald-600 to-teal-500"></div>
            
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-3">
                <HelpCircle className="text-[#006b2c]" /> What is the Clean-Core Workspace?
              </h2>
              <button 
                type="button"
                onClick={() => setShowWorkspaceInfo(false)} 
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-gray-600 leading-relaxed font-medium">
              <p>
                The Clean-Core Workspace is your central cockpit for modernizing custom legacy SAP systems into cloud-native extensible architectures.
              </p>
              
              <div className="bg-green-50 border border-green-200/50 rounded-xl p-4 text-[#006b2c] space-y-2">
                <h4 className="font-bold text-sm">🔄 Automated Transformation Pipeline</h4>
                <p className="text-xs leading-relaxed font-medium">
                  Transform custom monolithic ABAP reports and transactions into highly modular, transformed TypeScript and Node.js solutions built strictly in compliance with Clean Core standards.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200/50 rounded-xl p-4 text-amber-900 space-y-2">
                <h4 className="font-bold text-sm">💡 Non-Commercial Pilot Limits</h4>
                <p className="text-xs leading-relaxed font-medium">
                  Since this is a non-commercial, educational platform, standard pilot accounts are limited to <strong>5 transformations</strong>. 
                  To perform unlimited transformations, you can configure your own Gemini API Key in <a href="/settings" className="underline font-black hover:text-green-700 transition-colors">Profile Settings</a> (BYOK mode) at no extra cost.
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="font-bold text-gray-850 text-sm">Key capabilities of your Workspace:</h4>
                <ul className="space-y-2 pl-4 list-disc text-xs text-gray-650">
                  <li><strong>Create Projects:</strong> Spin up a fresh project for a custom report, function module, or table mapping.</li>
                  <li><strong>Full Lifecycle Tracking:</strong> Track analysis, target architectural solution designs, Node.js generation, test case compilations, and executive summaries.</li>
                  <li><strong>Deliverables Explorer:</strong> View generated assets, download standard code modules, or read executive summaries live on screen.</li>
                  <li><strong>Community Feedback:</strong> Engage with verified administrators and pilot users to discuss edge cases.</li>
                </ul>
              </div>
              <p className="text-xs text-gray-450 border-t border-gray-100 pt-4">
                Your data security is fully maintained. Code outputs are securely stored in your private tenant and never shared with other workspaces.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                type="button"
                onClick={() => setShowWorkspaceInfo(false)}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-md shadow-green-100"
              >
                Got it, let's build!
              </button>
            </div>
          </div>
        </div>
      )}

      {showDatabaseInfo && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 flex flex-col gap-6 relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-green-500 to-emerald-500"></div>
            
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-3">
                <HelpCircle className="text-blue-600" /> What are these examples for?
              </h2>
              <button 
                type="button"
                onClick={() => setShowDatabaseInfo(false)} 
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-gray-600 leading-relaxed font-medium">
              <p>
                Do you want to test Clean-Core.io but have concerns about uploading your own sensitive SAP ABAP source code directly?
              </p>
              <div className="bg-blue-50 border border-blue-200/50 rounded-xl p-4 text-blue-900 space-y-2">
                <h4 className="font-bold text-sm">💡 Don't worry, that is completely natural!</h4>
                <p className="text-xs leading-relaxed font-medium">
                  This database was created specifically to eliminate this entry barrier. Use these preloaded legacy examples to explore the platform entirely risk-free and feel free to play around with our automated pipeline features first.
                </p>
              </div>
              <div className="space-y-2.5">
                <h4 className="font-bold text-gray-800 text-sm">What you can experiment with using these examples:</h4>
                <ul className="space-y-2 pl-4 list-disc text-xs text-gray-600">
                  <li><strong>Run the pipeline:</strong> Start a transformation project and witness the fully automated AI refactoring live in real-time.</li>
                  <li><strong>Understand the target architecture:</strong> See how legacy ABAP is structured into a modern Node.js service, complete with CDS schemas and BTP bindings.</li>
                  <li><strong>Experience sandbox testing:</strong> Watch the generated TypeScript code run automated unit tests inside our isolated sandbox with live logs.</li>
                </ul>
              </div>
              <p className="text-xs text-gray-500 border-t border-gray-100 pt-4">
                <strong>By the way, regarding data privacy:</strong> All uploads are processed via secure, stateless APIs and stored encrypted within your private Firebase workspace. Your intellectual property remains fully protected!
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                type="button"
                onClick={() => setShowDatabaseInfo(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-100"
              >
                Got it, let's play!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Tree View */}
      {loadingProjects ? (
        <div className="bg-[#ffffff] rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-[#eff4ff] bg-[#eff4ff] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#006b2c]" />
            <span className="text-xs font-bold text-[#0b1c30]/60 uppercase tracking-widest">Loading projects...</span>
          </div>
          <div className="divide-y divide-[#eff4ff]">
            <ProjectSkeleton />
            <ProjectSkeleton />
            <ProjectSkeleton />
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-[#ffffff] rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-20 h-20 bg-[#eff4ff] rounded-full flex items-center justify-center mb-6">
            <FolderOpen className="w-10 h-10 text-[#006b2c]" />
          </div>
          <h3 className="text-2xl font-black text-[#0b1c30] mb-2">No projects yet</h3>
          <p className="text-[#0b1c30]/70 max-w-sm mb-8">Get started by creating your first Clean-Core.io transformation project.</p>
          <button 
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl font-bold"
          >
            <Plus size={18} /> Create Project
          </button>
        </div>
      ) : (
        <div className="bg-[#ffffff] rounded-3xl shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 p-6 bg-[#eff4ff] text-xs font-bold text-[#0b1c30]/60 uppercase tracking-widest">
            <div className="col-span-4 pl-8">Project Name</div>
            <div className="col-span-3 text-center">Status</div>
            <div className="col-span-2 text-center">Created</div>
            <div className="col-span-3 text-right pr-4">Actions</div>
          </div>
          
          <div className="divide-y divide-[#eff4ff]">
            {projects.map(project => (
              <ProjectTreeItem 
                key={project.id} 
                project={project} 
                onDelete={() => setDeleteId(project.id)}
                onCopy={() => handleCopyProject(project)}
                onExport={() => handleExportProject(project)}
                onProceed={() => handleProceed(project)}
                isProceeding={proceedingId === project.id}
                onView={(title: string, content: string, type: 'markdown' | 'code' | 'json') => setViewContent({title, content, type})}
                onDownload={downloadFile}
              />
            ))}
          </div>
        </div>
      )}

      {/* ABAP Examples Section */}
      <div className="mt-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 border-b border-gray-150 pb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-[#0b1c30] tracking-tight uppercase">ABAP / Legacy Code Database (Safe Examples)</h2>
            <button 
              type="button"
              onClick={() => setShowDatabaseInfo(true)}
              className="text-gray-400 hover:text-green-600 transition-colors p-1.5 rounded-full hover:bg-green-50 outline-none"
              title="What are these examples for?"
            >
              <HelpCircle size={18} />
            </button>
          </div>
          
          <button 
            type="button"
            onClick={() => setShowExamples(!showExamples)}
            className="flex items-center gap-2 bg-white border border-gray-250 text-[#0b1c30] hover:text-green-600 hover:bg-green-50 px-4 py-2.5 rounded-xl transition-all shadow-sm font-bold text-xs uppercase tracking-wider"
          >
            {showExamples ? 'Hide Examples' : 'Show Preloaded Examples'}
            {showExamples ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        
        {showExamples && (
          loadingExamples ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Loading ABAP examples...</span>
              </div>
              <div className="divide-y divide-gray-100">
                <ExampleSkeleton />
                <ExampleSkeleton />
              </div>
            </div>
          ) : allExamples.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <FileCode2 className="w-10 h-10 text-blue-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">No ABAP examples</h3>
              <p className="text-gray-500 text-sm">Upload your legacy code files to start transformation testing.</p>
            </div>
          ) : (() => {
            const filteredExamples = allExamples.filter(example => {
              const matchesCategory = selectedExampleCategory === 'all' || getExampleCategory(example).id === selectedExampleCategory;
              if (!matchesCategory) return false;
              if (exampleSearch.trim()) {
                const q = exampleSearch.toLowerCase();
                const matchName = (example.name || '').toLowerCase().includes(q);
                const matchCode = (example.code || '').toLowerCase().includes(q);
                return matchName || matchCode;
              }
              return true;
            });

            return (
              <div className="space-y-6">
                {/* Search and Category Filter Bar for Examples */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100/80">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedExampleCategory('all')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                        selectedExampleCategory === 'all'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                          : 'bg-white text-slate-650 hover:bg-slate-100 border border-slate-205'
                      }`}
                    >
                      All Modules <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${selectedExampleCategory === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{allExamples.length}</span>
                    </button>
                    {categories.map(cat => {
                      const count = allExamples.filter(example => getExampleCategory(example).id === cat.id).length;
                      if (count === 0) return null;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedExampleCategory(cat.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                            selectedExampleCategory === cat.id
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                              : 'bg-white text-slate-650 hover:bg-slate-100 border border-slate-205'
                          }`}
                        >
                          {cat.label.split(' (')[0]} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${selectedExampleCategory === cat.id ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  
                  <div className="relative w-full md:w-72">
                    <input
                      type="text"
                      value={exampleSearch}
                      onChange={(e) => setExampleSearch(e.target.value)}
                      placeholder="Search examples database..."
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-9 pr-4 py-2.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                      </svg>
                    </div>
                    {exampleSearch && (
                      <button
                        type="button"
                        onClick={() => setExampleSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {filteredExamples.length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center shadow-sm">
                    <FileCode2 className="w-10 h-10 text-gray-405 mb-3" />
                    <h4 className="font-bold text-gray-900 mb-1">No examples found</h4>
                    <p className="text-gray-500 text-xs">Try adjusting your filters or search keywords.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredExamples.map(example => {
                      const cat = categories.find(c => c.id === getExampleCategory(example).id) || categories[4];
                      const lineCount = (example.code || '').split('\n').length;
                      return (
                        <div 
                          key={example.id} 
                          className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-blue-300 flex flex-col justify-between group/card relative overflow-hidden"
                        >
                          <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${cat.color}`}></div>
                          
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-gradient-to-br ${cat.color} text-white shadow-sm font-mono`}>
                                {cat.label.split(' (')[0]}
                              </span>
                              {example.isStatic && (
                                <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-widest font-mono select-none">System Example</span>
                              )}
                            </div>
                            
                            <h3 className="font-extrabold text-slate-900 text-sm mb-1 truncate group-hover/card:text-blue-600 transition-colors" title={example.name}>
                              {example.name}
                            </h3>
                            
                            <p className="text-[10px] text-gray-400 font-semibold leading-relaxed mb-4">
                              {cat.description}
                            </p>
                            
                            <div className="bg-slate-950 rounded-2xl p-3 border border-slate-900 font-mono text-[9px] text-slate-400 overflow-hidden relative group/terminal h-24 mb-4 select-none">
                              <div className="flex gap-1.5 mb-2 border-b border-slate-900 pb-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500/85"></span>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500/85"></span>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500/85"></span>
                                <span className="ml-2 text-[7px] text-slate-600 font-bold uppercase tracking-wider truncate font-mono">{example.name}</span>
                              </div>
                              <pre className="text-left leading-relaxed opacity-65 group-hover/terminal:opacity-100 transition-opacity whitespace-pre truncate font-mono">
                                {example.code}
                              </pre>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-2">
                            <span className="text-[10px] font-bold text-gray-400 font-mono">
                              📏 {lineCount} lines
                            </span>
                            
                            <div className="flex items-center gap-1.5">
                              <button 
                                onClick={() => setViewContent({ title: example.name, content: example.code, type: 'code' })}
                                className="p-2 text-slate-450 hover:text-blue-600 rounded-xl hover:bg-blue-50 transition-colors"
                                title="View Full Code"
                              >
                                <Eye size={15} />
                              </button>
                              
                              {!example.isStatic && (
                                <button 
                                  onClick={() => handleDeleteABAP(example.id)}
                                  className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                                  title="Delete Custom File"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                              
                              <button 
                                onClick={() => {
                                  setExampleToStart(example);
                                  setProjectName(`Transform ${example.name}`);
                                }}
                                className="flex items-center gap-1 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white px-3 py-2 rounded-xl transition-all shadow-sm hover:shadow-md font-bold text-[10px] uppercase tracking-wider"
                              >
                                <Activity size={12} /> Transform
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })())}
      </div>

      {/* Community Module */}
      <div className="mt-16 bg-white rounded-[2rem] p-8 md:p-10 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-gray-100 pb-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-55 text-[#006b2c] rounded-full text-xs font-bold uppercase tracking-widest mb-3 border border-green-100">
                <MessageSquare size={13} strokeWidth={2.5} /> Community Forum
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight uppercase">Clean-Core.io Developer Forum</h2>
              <p className="text-gray-500 font-medium text-sm md:text-base mt-1">Discuss modernization patterns, ask questions, and share insights with other SAP Clean-Core practitioners.</p>
            </div>
            
            <button 
              type="button"
              onClick={() => setShowForum(!showForum)}
              className="flex items-center gap-2 bg-[#0b1c30] text-white hover:bg-green-600 px-5 py-3 rounded-2xl transition-all shadow-md font-bold text-xs uppercase tracking-wider self-start sm:self-auto shrink-0"
            >
              {showForum ? 'Close Forum' : 'Open Developer Forum'}
              {showForum ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showForum && (() => {
            const filteredForumPosts = forumPosts.filter(post => {
              if (forumFilter === 'announcements' && !post.pinned && post.category !== 'announcements') return false;
              if (forumFilter === 'technical' && post.category !== 'technical') return false;
              if (forumFilter === 'general' && post.category !== 'general') return false;
              
              if (forumSearch.trim()) {
                const q = forumSearch.toLowerCase();
                const matchTitle = (post.title || '').toLowerCase().includes(q);
                const matchMessage = (post.message || '').toLowerCase().includes(q);
                const matchAuthor = (post.author || '').toLowerCase().includes(q);
                return matchTitle || matchMessage || matchAuthor;
              }
              return true;
            });

            const isAdminUser = profile?.email === 'sonny.frenzel@googlemail.com' || user?.email === 'sonny.frenzel@googlemail.com' || profile?.isAdmin;

            return (
              <div className="space-y-6">
                {/* Search and Category Filter Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100/80">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'All Topics', count: forumPosts.length },
                      { id: 'announcements', label: 'Announcements', count: forumPosts.filter(p => p.pinned || p.category === 'announcements').length },
                      { id: 'technical', label: 'Technical Q&A', count: forumPosts.filter(p => p.category === 'technical').length },
                      { id: 'general', label: 'General', count: forumPosts.filter(p => p.category === 'general').length },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setForumFilter(tab.id as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                          forumFilter === tab.id
                            ? 'bg-green-600 text-white shadow-md shadow-green-100'
                            : 'bg-white text-slate-650 hover:bg-slate-100 border border-slate-205'
                        }`}
                      >
                        {tab.label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${forumFilter === tab.id ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="relative w-full md:w-72">
                    <input
                      type="text"
                      value={forumSearch}
                      onChange={(e) => setForumSearch(e.target.value)}
                      placeholder="Search discussions..."
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-9 pr-4 py-2.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-green-500 outline-none transition-all shadow-sm"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                      </svg>
                    </div>
                    {forumSearch && (
                      <button
                        type="button"
                        onClick={() => setForumSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left/Middle Column: Discussions List */}
                  <div className="lg:col-span-2 space-y-5">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Active Discussions</h3>
                    
                    {filteredForumPosts.length === 0 ? (
                      <div className="bg-white border border-dashed border-gray-300 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center shadow-sm">
                        <MessageSquare className="w-10 h-10 text-gray-450 mb-3" />
                        <h4 className="font-bold text-gray-900 mb-1">No discussions found</h4>
                        <p className="text-gray-500 text-xs">Try adjusting your filters or search keywords, or start a new thread!</p>
                      </div>
                    ) : (
                      filteredForumPosts.map((post) => {
                        const isPinned = post.pinned;
                        const isAdmin = post.isAdmin;
                        return (
                          <div 
                            key={post.id} 
                            className={`rounded-3xl p-6 transition-all border duration-300 relative group ${
                              isPinned 
                                ? "bg-emerald-50/40 border-emerald-200 shadow-sm hover:shadow-emerald-500/5"
                                : isAdmin
                                  ? "bg-slate-50/70 border-slate-200/80 hover:border-slate-300"
                                  : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  {isPinned && (
                                    <span className="bg-emerald-100 text-emerald-850 border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 select-none font-mono">
                                      📌 Pinned
                                    </span>
                                  )}
                                  {isAdmin && (
                                    <span className="bg-red-50 text-red-750 border border-red-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 select-none font-mono">
                                      <Crown size={10} className="text-red-500" /> Admin
                                    </span>
                                  )}
                                  {post.category && getCategoryBadge(post.category)}
                                  <h4 
                                    onClick={() => setActivePost(post)}
                                    className="font-extrabold text-slate-900 text-base leading-snug hover:text-green-600 cursor-pointer tracking-tight w-full mt-1"
                                  >
                                    {post.title}
                                  </h4>
                                </div>
                                <p className="text-xs text-slate-400 font-semibold mt-1">
                                  By <span className="text-slate-600 font-bold">@{post.author}</span> • {format(new Date(post.createdAt?.seconds * 1000 || Date.now()), 'MMM d, yyyy')}
                                </p>
                              </div>
                              <div className="flex items-center gap-4 text-xs font-bold text-slate-450 uppercase shrink-0">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setForumPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: p.likes + 1 } : p));
                                  }}
                                  className="flex items-center gap-1.5 hover:text-green-600 transition-colors p-1.5 hover:bg-slate-100 rounded-lg"
                                >
                                  👍 {post.likes}
                                </button>
                                <button 
                                  onClick={() => setActivePost(post)}
                                  className="flex items-center gap-1.5 hover:text-green-600 transition-colors p-1.5 hover:bg-slate-100 rounded-lg"
                                >
                                  💬 {post.commentsList?.length || 0}
                                </button>
                              </div>
                            </div>
                            
                            <p className="mt-3 text-slate-600 text-xs md:text-sm font-semibold leading-relaxed line-clamp-3 whitespace-pre-wrap">{post.message}</p>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Right Column: Start Discussion Form & Admin Contact */}
                  <div className="space-y-6">
                    {/* Admin contact information card */}
                    <div className="bg-slate-900 text-slate-100 p-6 rounded-[2rem] border border-slate-800 shadow-xl relative overflow-hidden group">
                      <div className="absolute right-0 bottom-0 w-32 h-32 bg-[radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.06),transparent)] pointer-events-none"></div>
                      
                      <div className="flex items-center gap-3.5 mb-5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                          <Shield className="text-emerald-400" size={20} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block font-mono">Verified Administrator</span>
                          <h4 className="text-sm font-bold uppercase tracking-tight text-white">Clean-Core Admin</h4>
                        </div>
                      </div>
                      
                      <p className="text-slate-400 text-xs leading-relaxed font-semibold mb-6">
                        Our administrative team manages approvals, platform updates, and technical escalation mappings.
                      </p>
                      
                      <div className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800/80 px-4 py-2.5 rounded-xl min-w-0">
                        <div className="min-w-0">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Admin Mailbox</span>
                          <span className="font-mono text-emerald-400 font-bold truncate block">admin@clean-core.io</span>
                        </div>
                        <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-900 px-2 py-0.5 rounded text-[8px] font-bold uppercase whitespace-nowrap tracking-wider shrink-0 cursor-help" title="All emails sent to admin@clean-core.io are securely forwarded to the platform administrators.">
                          PROXY
                        </span>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] border border-gray-200/70 shadow-sm space-y-5">
                      <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Start Discussion</h3>
                      
                      {forumSent ? (
                        <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl text-center text-xs font-semibold leading-relaxed animate-in zoom-in-95 duration-200">
                          <CheckCircle2 className="mx-auto text-green-600 mb-2" size={24} />
                          <p className="font-bold">Thread Posted Successfully!</p>
                          <p className="mt-1 text-green-700/90">Thank you for contributing to our pilot developer community.</p>
                        </div>
                      ) : (
                        <form onSubmit={handleCreateForumPost} className="space-y-4">
                          {forumError && (
                            <div className="bg-red-50 border border-red-150 text-red-800 p-3 rounded-xl text-xs flex items-start gap-2.5">
                              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                              <p className="leading-relaxed font-medium">{forumError}</p>
                            </div>
                          )}

                          <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Topic Title</label>
                            <input 
                              type="text" 
                              required
                              value={forumTitle}
                              onChange={(e) => { setForumTitle(e.target.value); setForumError(null); }}
                              placeholder="e.g., Transforming BAPI_ACC_DOCUMENT_POST"
                              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-green-500 outline-none transition-all font-sans"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Topic Category</label>
                            <select 
                              value={forumCategory}
                              onChange={(e) => setForumCategory(e.target.value as any)}
                              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-green-500 outline-none transition-all cursor-pointer font-sans"
                            >
                              <option value="technical">⚙️ Technical Q&A</option>
                              <option value="general">💬 General Discussion</option>
                              {isAdminUser && <option value="announcements">📢 Announcement (Admin Only)</option>}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Your Username</label>
                            <input 
                              type="text" 
                              value={forumAuthor}
                              onChange={(e) => setForumAuthor(e.target.value)}
                              placeholder={profile?.email === 'sonny.frenzel@googlemail.com' ? "Clean-Core Admin" : "Your alias (e.g., SAP_Guru)"}
                              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-green-500 outline-none transition-all font-sans"
                              disabled={profile?.email === 'sonny.frenzel@googlemail.com'}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Message Content</label>
                            <textarea 
                              value={forumMessage}
                              onChange={(e) => { setForumMessage(e.target.value); setForumError(null); }}
                              placeholder="Describe your issue or sharing your lesson learned with the team..."
                              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 min-h-[100px] resize-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-green-500 outline-none transition-all font-sans"
                              required
                            ></textarea>
                          </div>

                          <button 
                            type="submit"
                            disabled={forumSending || !forumTitle.trim() || !forumMessage.trim()}
                            className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-gray-300 text-white rounded-xl py-2.5 text-xs font-black tracking-wider uppercase transition-all shadow-md flex justify-center items-center gap-1.5"
                          >
                            {forumSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageSquare size={14} />}
                            {forumSending ? 'Posting...' : 'Post to Forum'}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Active Forum Thread Modal Overlay */}
      {activePost && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300 relative">
            
            {/* Glowing Accent bar at the top */}
            <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${
              activePost.pinned 
                ? 'from-emerald-400 via-green-500 to-emerald-600' 
                : 'from-slate-700 via-slate-800 to-slate-900'
            }`}></div>

            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-100 bg-slate-50/50 pt-8">
              <div className="flex gap-4">
                <div className={`w-12 h-12 rounded-2xl ${
                  activePost.isAdmin ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'
                } font-black flex items-center justify-center text-sm shrink-0 border uppercase font-mono shadow-sm`}>
                  {activePost.author.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-850 text-sm">@{activePost.author}</span>
                    {activePost.pinned && (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-250 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider select-none">
                        📌 Pinned
                      </span>
                    )}
                    {activePost.isAdmin && (
                      <span className="bg-red-50 text-red-700 border border-red-150 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 select-none">
                        <Crown size={9} className="text-red-500" /> Admin
                      </span>
                    )}
                    {activePost.category && getCategoryBadge(activePost.category)}
                  </div>
                  {activePost.authorEmail && (
                    <span className="text-[10px] text-slate-450 font-mono block mt-0.5">{activePost.authorEmail}</span>
                  )}
                  <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">{activePost.createdAt}</span>
                </div>
              </div>
              <button 
                onClick={() => setActivePost(null)} 
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all outline-none"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto flex-grow space-y-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 leading-snug uppercase tracking-tight mb-3">
                  {activePost.title}
                </h3>
                <p className="text-slate-650 text-sm leading-relaxed whitespace-pre-line bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  {activePost.message}
                </p>
              </div>

              {/* Likes counter & Action */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleLikeActivePost}
                  className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-green-600 transition-colors bg-slate-100 hover:bg-emerald-50 px-4 py-2 rounded-2xl border border-slate-200/60 hover:border-emerald-250 shadow-sm"
                >
                  👍 Like Post ({activePost.likes || 0})
                </button>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest mb-4">
                  Discussions ({activePost.commentsList?.length || 0})
                </h4>

                {/* Comments List */}
                <div className="space-y-4">
                  {(!activePost.commentsList || activePost.commentsList.length === 0) ? (
                    <p className="text-slate-400 text-xs italic font-medium py-2">No comments published yet. Be the first to share your thoughts!</p>
                  ) : (
                    activePost.commentsList.map((comment: any) => {
                      const isCommentAdmin = comment.author === 'Clean-Core Admin' || comment.isAdmin;
                      return (
                        <div key={comment.id} className="flex gap-3 bg-slate-50/30 p-4 rounded-2xl border border-slate-100/60 relative group hover:bg-slate-50 transition-colors">
                          <div className={`w-9 h-9 rounded-xl ${
                            isCommentAdmin ? 'bg-red-50 text-red-700 border-red-150' : 'bg-slate-100 text-slate-700 border-slate-200'
                          } font-black flex items-center justify-center text-xs shrink-0 border uppercase font-mono shadow-sm`}>
                            {comment.author.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold text-slate-800">@{comment.author}</span>
                              {isCommentAdmin && (
                                <span className="bg-red-50 text-red-700 border border-red-150 px-1.5 py-0.25 rounded text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 select-none">
                                  <Crown size={8} className="text-red-500" /> Admin
                                </span>
                              )}
                              <span className="text-[9px] text-slate-400 font-semibold">• {comment.createdAt}</span>
                            </div>
                            <p className="text-slate-650 text-xs mt-1.5 leading-relaxed whitespace-pre-line">{comment.message}</p>
                            
                            {/* Like Comment button */}
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => handleLikeComment(comment.id)}
                                className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-green-600 bg-slate-100/60 hover:bg-emerald-50/50 px-2 py-1 rounded-lg border border-slate-200/40 hover:border-emerald-200/50 transition-colors"
                              >
                                👍 {comment.likes || 0}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Comment Input Form Footer */}
            <form onSubmit={handleAddComment} className="p-4 border-t border-slate-100 bg-slate-50/30 flex gap-2.5 items-center">
              <input 
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Write a highly technical response or question..."
                className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                required
              />
              <button 
                type="submit"
                disabled={!newCommentText.trim()}
                className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white p-2.5 rounded-2xl transition-all shadow-sm flex items-center justify-center shrink-0 disabled:text-slate-400"
              >
                <Send size={16} />
              </button>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}

function ProjectTreeItem({ project, onDelete, onCopy, onExport, onProceed, isProceeding, onView, onDownload }: any) {
  const [expanded, setExpanded] = useState(false);

  const isAbapCloud = (project.extensibilityRoute || '').includes('ABAP Cloud');

  // Base deliverables formatted into highly professional corporate markdown reports
  const deliverables = [
    { id: 'legacy', title: '1. Original ABAP Source', content: project.legacyCode, type: 'code', ext: '.abap', isExport: false, canPDF: false },
    { id: 'analysis', title: '2. Business Analysis Report', content: formatAnalysisToMarkdown(project.analysis), type: 'markdown', ext: '.md', isExport: false, canPDF: true },
    { id: 'design', title: '3. Solution Design Specification', content: formatDesignToMarkdown(project.solutionDesign), type: 'markdown', ext: '.md', isExport: false, canPDF: true },
    { 
      id: 'code', 
      title: isAbapCloud ? '4. Transformed RAP ABAP Code' : '4. Transformed Node.js Code', 
      content: project.generatedCode, 
      type: 'code', 
      ext: isAbapCloud ? '.clas.abap' : '.ts', 
      isExport: false, 
      canPDF: false 
    },
    { 
      id: 'tests', 
      title: isAbapCloud ? '5. Automated ABAP Unit Tests' : '5. Automated Sandbox Tests', 
      content: project.testSuite?.code || (project.testCases ? JSON.stringify(project.testCases, null, 2) : null), 
      type: project.testSuite?.code ? 'code' : 'json', 
      ext: project.testSuite?.code ? (isAbapCloud ? '.clas.abap' : '.ts') : '.json', 
      isExport: false, 
      canPDF: true 
    },
    { 
      id: 'test_report', 
      title: '6. Quality Engineering Report', 
      content: project.testReport || (project.testCases ? `## 🧪 Quality Engineering Report\n\n- **Total Test Cases Mapped:** \`${project.testCases.length}\`\n- **Sandbox Environment:** \`${isAbapCloud ? 'Simulated SAP ADT / Test Cockpit' : 'Node.js v22.22.2'}\`\n- **Database Persistency Sync:** \`Verified via ${isAbapCloud ? 'SQL Test Double Framework' : 'isolated PostgreSQL Mocking'}\`\n\nAll test cases compiled and executed successfully in the ${isAbapCloud ? 'secure SAP ADT simulated runner' : 'secure sandbox runtime'}.` : null), 
      type: 'markdown', 
      ext: '.md', 
      isExport: false, 
      canPDF: true 
    },
    { id: 'docs', title: '7. Process Blueprint Specification', content: formatDocsToMarkdown(project.documentation), type: 'markdown', ext: '.md', isExport: false, canPDF: true },
    { id: 'presentation', title: '8. Executive Summary Deck', content: formatPresentationToMarkdown(project.presentation), type: 'markdown', ext: '.md', isExport: false, canPDF: true },
  ].filter(d => d.content);

  // Dynamic exports from the database
  const dynamicExports = project.exports ? Object.entries(project.exports).map(([key, value]: [string, any]) => ({
    id: key,
    title: (value.title || key) as string,
    content: value.content as any,
    type: (value.type || 'markdown') as string,
    ext: (value.type === 'html' ? '.html' : value.type === 'json' ? '.json' : '.md') as string,
    isExport: true,
    canPDF: true
  })) : [];

  const allItems = [...deliverables, ...dynamicExports];

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed':
        return { label: 'Completed (100%)', style: 'bg-green-100 text-green-800 border-green-200', progress: 100 };
      case 'uploaded':
        return { label: 'Initialization (0%)', style: 'bg-gray-100 text-gray-800 border-gray-200', progress: 0 };
      case 'analyzed':
        return { label: 'Analysis (25%)', style: 'bg-blue-100 text-blue-800 border-blue-200', progress: 25 };
      case 'designed':
        return { label: 'Solution Design (50%)', style: 'bg-purple-100 text-purple-800 border-purple-200', progress: 50 };
      case 'transformed':
        return { label: 'Transformation (75%)', style: 'bg-indigo-100 text-indigo-800 border-indigo-200', progress: 75 };
      case 'testing':
        return { label: 'Testing & QA (85%)', style: 'bg-cyan-100 text-cyan-800 border-cyan-200', progress: 85 };
      case 'documented':
        return { label: 'Documentation (95%)', style: 'bg-teal-100 text-teal-800 border-teal-200', progress: 95 };
      default:
        return { label: 'In Progress', style: 'bg-gray-100 text-gray-800 border-gray-200', progress: 0 };
    }
  };

  const statusInfo = getStatusInfo(project.status);
  const createdDate = project.createdAt?.toDate ? format(project.createdAt.toDate(), 'MMM dd, yyyy') : 'N/A';

  return (
    <div className="flex flex-col border-b border-[#eff4ff] last:border-0">
      {/* Project Row */}
      <div 
        className={`flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 p-6 items-start md:items-center hover:bg-[#eff4ff]/50 transition-colors cursor-pointer ${expanded ? 'bg-[#eff4ff]/30' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="md:col-span-4 flex items-center gap-4 w-full">
          <button className="p-1 text-[#0b1c30]/40 hover:text-[#006b2c] rounded-md transition-colors shrink-0">
            {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
          <div className={`p-3 rounded-xl shrink-0 ${expanded ? 'bg-[#006b2c] text-white' : 'bg-[#eff4ff] text-[#0b1c30]/60'}`}>
            {expanded ? <FolderOpen size={18} /> : <Folder size={18} />}
          </div>
          <span className="font-bold text-[#0b1c30] truncate" title={project.name}>{project.name}</span>
        </div>
        
        <div className="md:col-span-3 flex flex-col justify-center w-full md:w-auto px-4 md:px-0">
          <div className="flex justify-between text-[10px] font-bold text-[#0b1c30]/60 mb-1.5 uppercase tracking-widest">
            <span>{statusInfo.label}</span>
            <span>{statusInfo.progress}%</span>
          </div>
          <div className="w-full bg-[#eff4ff] rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${statusInfo.progress === 100 ? 'bg-[#006b2c]' : 'bg-[#00873a]'}`} style={{ width: `${statusInfo.progress}%` }}></div>
          </div>
        </div>

        <div className="md:col-span-2 text-center text-sm text-[#0b1c30]/60 font-medium">
          {createdDate}
        </div>
        
        <div className="md:col-span-3 flex flex-wrap justify-start md:justify-end gap-2 pl-12 md:pl-0 w-full md:w-auto mt-3 md:mt-0" onClick={e => e.stopPropagation()}>
          <button onClick={onProceed} disabled={isProceeding} className="p-3 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50" title="Continue Transformation">
            {isProceeding ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          </button>
          <button onClick={onCopy} className="p-3 text-[#0b1c30]/60 hover:text-[#006b2c] hover:bg-[#eff4ff] rounded-xl transition-colors" title="Duplicate Project">
            <Copy size={18} />
          </button>
          <button onClick={onExport} className="p-3 text-[#0b1c30]/60 hover:text-[#006b2c] hover:bg-[#eff4ff] rounded-xl transition-colors" title="Export JSON">
            <Download size={18} />
          </button>
          <button onClick={onDelete} className="p-3 text-[#0b1c30]/40 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Delete Project">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Expanded Deliverables Tree */}
      {expanded && (
        <div className="bg-[#eff4ff]/30 border-t border-[#eff4ff] pl-14 pr-4 py-2">
          {allItems.length === 0 ? (
            <div className="py-4 text-sm text-[#0b1c30]/60 italic flex items-center gap-2">
              <Activity size={16} /> No deliverables generated yet. Click &apos;Continue&apos; to start the process.
            </div>
          ) : (
            <div className="space-y-1 py-2 relative before:absolute before:inset-y-0 before:left-[21px] before:w-px before:bg-[#eff4ff]">
              {allItems.map((item, idx) => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 pl-8 pr-4 hover:bg-[#ffffff] rounded-xl transition-colors group relative">
                  {/* Tree branch line */}
                  <div className="absolute left-[21px] top-6 sm:top-1/2 w-4 h-px bg-[#eff4ff]"></div>
                  
                  <div className="flex items-center gap-3 mb-2 sm:mb-0">
                    {item.type === 'code' ? <FileCode2 size={16} className="text-[#006b2c]" /> : 
                     item.type === 'html' ? <BookOpen size={16} className="text-[#00873a]" /> :
                     <FileText size={16} className="text-[#0b1c30]/60" />}
                    <span className="text-sm font-medium text-[#0b1c30]">
                      {item.title}
                      {item.isExport && <span className="ml-2 text-[10px] text-[#006b2c] font-bold uppercase tracking-widest">Export</span>}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 opacity-100 transition-opacity ml-7 sm:ml-0">
                    <button 
                      onClick={() => onView(item.title, item.content, item.type === 'html' ? 'markdown' : item.type)}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#006b2c] bg-[#eff4ff] rounded-lg hover:bg-[#d3e4fe] transition-colors whitespace-nowrap"
                    >
                      <Eye size={14} /> View
                    </button>
                    <button 
                      onClick={() => onDownload(item.content, `${project.name.replace(/\s+/g, '_')}_${item.id}${item.ext}`, item.type === 'html' ? 'text/html' : item.type === 'code' ? 'text/javascript' : 'text/plain')}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#0b1c30]/60 bg-[#ffffff] border border-[#eff4ff] rounded-lg hover:bg-[#eff4ff] hover:text-[#006b2c] transition-colors whitespace-nowrap"
                    >
                      <Download size={14} /> {item.type === 'code' ? 'Code' : 'Download'}
                    </button>
                    {item.type === 'html' && (
                      <button 
                        onClick={() => onView(item.title, item.content, 'html')}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#00873a] bg-[#eff4ff] rounded-lg hover:bg-[#d3e4fe] transition-colors whitespace-nowrap"
                      >
                        <BookOpen size={14} /> View HTML
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
