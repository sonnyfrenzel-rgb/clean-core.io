'use client';

import { useState } from 'react';
import { ArrowUpRight, Network, X } from 'lucide-react';
import clsx from 'clsx';

interface CloudService {
  serviceName: string;
  purpose: string;
  npmPackages: string[];
}

interface CloudServiceIntegrationsProps {
  cloudServices?: CloudService[];
}

export const cloudServiceDetails: Record<string, {
  title: string;
  details: string;
  whyCritical: string;
  npmPackages: string[];
  codeSnippet: string;
}> = {
  xsuaa: {
    title: 'XSUAA Identity Federation',
    details: 'XSUAA acts as the OAuth 2.0 authorization server on SAP BTP. It handles authentications, validates incoming JSON Web Tokens (JWTs), and resolves user roles/scopes. This keeps identity federation and access management separate from application logic.',
    whyCritical: 'Ensures secure, audited cloud access that adheres strictly to clean-core guidelines. User identities are resolved dynamically via federated identity providers (like SAP IAS or Azure AD) rather than database-level hardcoding in legacy layers.',
    npmPackages: ['@sap/xssec', 'passport'],
    codeSnippet: `const express = require('express');
const passport = require('passport');
const { JWTStrategy } = require('@sap/xssec');
const xsenv = require('@sap/xsenv');

const app = express();

// Retrieve service credentials from container environment
const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });

// Initialize Passport with XSUAA OAuth Strategy
passport.use(new JWTStrategy(services.uaa));
app.use(passport.initialize());

// Secure custom API endpoint with role assertion
app.get('/api/extension/orders',
  passport.authenticate('JWT', { session: false }),
  (req, res) => {
    if (req.authInfo.checkLocalScope('Admin')) {
      res.json({ status: 'Authorized', data: [] });
    } else {
      res.status(403).send('Forbidden: Insufficient Scopes');
    }
  }
);`
  },
  destination: {
    title: 'Destination & Connectivity Service',
    details: 'The SAP BTP Destination Service serves as a secure, centralized vault for configuring outbound target connection profiles (URLs, protocols, and authentication settings). Combined with BTP Connectivity and Cloud Connector, it establishes secure tunnels to on-premises ERP systems and cloud-based REST/OData APIs.',
    whyCritical: 'Completely separates environment-specific endpoints and credentials from source code. Connections, protocols, or routing can be modified dynamically at runtime without altering or redeploying the Node.js application.',
    npmPackages: ['@sap-cloud-sdk/connectivity'],
    codeSnippet: `const axios = require('axios');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

async function fetchLegacyData(orderId, userJwt) {
  // Securely retrieve the target destination
  const destination = await getDestination({
    destinationName: 'S4HANA_GATEWAY',
    jwt: userJwt // Auto-propagates user context
  });

  // Execute authenticated outbound call using BTP proxy
  const response = await axios({
    url: \`\${destination.url}/sap/opu/odata/sap/ZELEMENTS_SRV/Orders('\${orderId}')\`,
    headers: {
      ...destination.authHeaders, // Dynamically injected principal headers
      'Accept': 'application/json'
    }
  });
  return response.data;
}`
  },
  eventmesh: {
    title: 'Event Mesh / Enterprise Messaging',
    details: 'SAP Event Mesh is a fully managed cloud messaging service. It provides reliable asynchronous messaging capabilities, enabling systems to communicate via event-driven pub/sub queues and topics. It is ideal for separating heavy transactional events from legacy cores.',
    whyCritical: 'Achieves near-zero synchronization coupling. Instead of legacy systems blocking web APIs during long transactional updates, events are pushed asynchronously to Event Mesh, letting the Node.js application process them independently in real-time.',
    npmPackages: ['amqplib', '@sap/xsenv'],
    codeSnippet: `const amqp = require('amqplib');
const xsenv = require('@sap/xsenv');

async function startListening() {
  // Retrieve messaging service credentials
  const services = xsenv.getServices({ messaging: { label: 'enterprise-messaging' } });
  const amqpUrl = services.messaging.credentials.uri;
  
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();
  const queue = 'transformed/salesorders/created';

  await channel.assertQueue(queue, { durable: true });
  console.log(\`[*] Listening for S/4HANA events on queue: \${queue}\`);

  // Async subscriber processing S/4HANA sales order creation events
  channel.consume(queue, (msg) => {
    if (msg !== null) {
      const eventPayload = JSON.parse(msg.content.toString());
      console.log(\`[x] Received Order ID: \${eventPayload.OrderId}\`);
      
      // Process transaction logic asynchronously
      channel.ack(msg);
    }
  });
}`
  },
  postgresql: {
    title: 'PostgreSQL Relational Database',
    details: 'PostgreSQL on SAP BTP or AWS is an enterprise-grade relational database. It is utilized to store extension-specific application states, customer metadata, and transactional caches, fully isolating side-by-side data from the ERP legacy schema.',
    whyCritical: 'Guarantees zero database-level pollution. Custom tables are kept out of the core S/4HANA database, avoiding schema upgrade lockouts and keeping the ERP core pristine and easily upgradeable.',
    npmPackages: ['pg', '@sap/xsenv'],
    codeSnippet: `const { Pool } = require('pg');
const xsenv = require('@sap/xsenv');

// Resolve PostgreSQL credentials from Cloud Binding environment variables
const pgServices = xsenv.getServices({ db: { tag: 'postgresql' } });
const config = pgServices.db.credentials;

const pool = new Pool({
  host: config.hostname,
  port: config.port,
  database: config.dbname,
  user: config.username,
  password: config.password,
  ssl: { rejectUnauthorized: false }
});

async function queryExtensionData(userId) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT * FROM extension_users WHERE id = $1', 
      [userId]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}`
  },
  // ── SAP-Native / RAP Deep Dives ──────────────────────────────
  cdsView: {
    title: 'Released CDS View Integration',
    details: 'Released CDS Views (e.g., I_Customer, I_Product, I_SalesOrder) are the official, upgrade-stable data access layer in S/4HANA. They replace direct table access (SELECT from KNA1, MARA, VBAK) with semantically enriched, versioned data models maintained by SAP. Consuming released CDS views ensures your extensions survive kernel upgrades without modification.',
    whyCritical: 'Direct table SELECTs on SAP standard tables (KNA1, MARA, VBAK) are the #1 reason custom code breaks during S/4HANA upgrades. Released CDS views provide a stable contract — SAP guarantees backward compatibility across releases. This is the foundational principle of Clean Core.',
    npmPackages: [],
    codeSnippet: `" Before (Legacy — breaks on upgrade):
SELECT SINGLE kunnr name1 ort01
  FROM kna1
  INTO @DATA(ls_customer)
  WHERE kunnr = @lv_customer_id.

" After (Clean Core — upgrade-stable):
SELECT SINGLE CustomerID, CustomerName, CityName
  FROM I_Customer
  INTO @DATA(ls_customer)
  WHERE Customer = @lv_customer_id.`
  },
  iamRoles: {
    title: 'SAP IAM Business Role Mapping',
    details: 'SAP Identity and Access Management (IAM) in S/4HANA Cloud provides a role-based authorization framework. IAM Business Roles map business users to SAP Fiori apps and OData services via Business Catalogs. In the RAP context, IAM apps are bound to Service Bindings, controlling who can access which RAP business objects and operations.',
    whyCritical: 'Legacy authorization checks (AUTHORITY-CHECK on custom objects like Z_AUTH_*) are not portable to cloud. IAM Business Roles provide a standardized, auditable authorization model that integrates with SAP BTP Identity Authentication Service (IAS) and supports federation with corporate identity providers.',
    npmPackages: [],
    codeSnippet: `" IAM App Registration (ADT metadata):
" 1. Create IAM App in ADT → links to Service Binding
" 2. Assign to Business Catalog
" 3. Business Catalog → Business Role → User Assignment

" In RAP Behavior Definition — authorization control:
managed implementation in class zbp_customer;
strict;

define behavior for ZR_Customer alias Customer
  authorization master ( instance )
{
  // IAM controls access to create/update/delete
  create;
  update;
  delete;
}`
  },
  luwManager: {
    title: 'SAP LUW & Transaction Consistency',
    details: 'The SAP Logical Unit of Work (LUW) Manager in RAP handles transactional consistency natively. RAP managed scenarios automatically orchestrate COMMIT WORK, ROLLBACK, and save sequencing across all entities in a business object hierarchy. This replaces legacy patterns like explicit CALL FUNCTION ... IN UPDATE TASK, COMMIT WORK, and manual BAPI transaction control.',
    whyCritical: 'Legacy transaction patterns (UPDATE TASK, explicit COMMIT/ROLLBACK, FM-based BAPI calls) create tight coupling to the ABAP runtime and are error-prone in cloud scenarios. RAP\'s managed LUW ensures ACID compliance, automatic draft handling, and optimistic concurrency — all built into the framework without custom transaction code.',
    npmPackages: [],
    codeSnippet: `" Legacy LUW Pattern (problematic):
CALL FUNCTION 'Z_UPDATE_CUSTOMER' IN UPDATE TASK
  EXPORTING customer_data = ls_data.
COMMIT WORK AND WAIT.

" RAP Managed LUW (automatic):
" The RAP framework handles save sequencing automatically.
" No explicit COMMIT needed — the framework orchestrates it.
CLASS lhc_Customer DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS save_modified FOR MODIFY
      IMPORTING keys FOR ACTION Customer~save.
ENDCLASS.

" Draft-enabled transactional processing is built-in:
" - Optimistic locking via ETag
" - Draft persistence in managed scenarios
" - Automatic cleanup of stale drafts`
  },
  badi: {
    title: 'BAdI Enhancement Spot Integration',
    details: 'Business Add-Ins (BAdIs) are SAP\'s official enhancement framework for injecting custom logic into standard processes without modifying the original code. Released BAdIs in S/4HANA provide stable enhancement points for validation, determination, and side-effect logic. They replace legacy user exits, customer exits, and modification-based enhancements.',
    whyCritical: 'User exits and customer exits are deprecated in S/4HANA Cloud. BAdIs provide a clean, upgrade-stable mechanism for extensions. SAP releases new BAdIs with each S/4HANA version specifically to cover common extension scenarios, making them the preferred pattern for in-stack customization.',
    npmPackages: [],
    codeSnippet: `" BAdI Implementation for Custom Validation:
CLASS zcl_badi_customer_validation DEFINITION
  PUBLIC FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_badi_customer_check.
ENDCLASS.

CLASS zcl_badi_customer_validation IMPLEMENTATION.
  METHOD if_badi_customer_check~validate.
    " Custom validation logic injected via BAdI
    IF customer-region IS INITIAL.
      APPEND VALUE #( id = 'REGION_MISSING'
                      message = 'Region is mandatory'
                      severity = 'E' ) TO messages.
    ENDIF.
  ENDMETHOD.
ENDCLASS.`
  },
  rapService: {
    title: 'RAP Service Binding & OData Exposure',
    details: 'RAP Service Bindings expose Business Objects as OData V4 (or V2) services. They are the deployment artifact that makes RAP entities accessible to Fiori UIs and external consumers. A Service Binding references a Service Definition, which in turn references CDS projection views defining the public API surface of the business object.',
    whyCritical: 'Service Bindings replace the legacy pattern of manually creating OData services via SEGW transaction. They provide automatic protocol handling, metadata generation, and deep integration with SAP Fiori Elements — enabling UI5 apps to be generated directly from the service metadata without custom frontend code.',
    npmPackages: [],
    codeSnippet: `" Service Definition (SRVD):
define service ZUI_Customer_O4 {
  expose ZC_Customer as Customer;
  expose ZC_CustomerAddress as CustomerAddress;
}

" Service Binding (SRVB) created in ADT:
" → Protocol: OData V4 - UI
" → Binding Type: /IWBEP/V4_UI
" → Publish: Local Service Endpoint

" The Fiori Elements app consumes this service directly:
" → No custom UI5 controller needed
" → List Report / Object Page generated from annotations`
  },
  default: {
    title: 'Cloud Service Binding Integration',
    details: 'Cloud service bindings allow the application to connect securely and dynamically with platform-managed systems, including databases, identity providers, routing gateways, and messaging queues, utilizing externalized environment injections.',
    whyCritical: 'Avoids static configuration files or hardcoded server details, satisfying modern Cloud Native standards (12-Factor App design).',
    npmPackages: ['@sap/xsenv'],
    codeSnippet: `const xsenv = require('@sap/xsenv');
// Load generic credentials from platform-bound services
try {
  const credentials = xsenv.getServices({ myService: { tag: 'custom-tag' } });
  console.log('Credentials loaded successfully');
} catch (err) {
  console.error('Failed to resolve cloud service bindings:', err.message);
}`
  }
};

export const getCloudServiceDetails = (serviceName: string) => {
  const name = serviceName.toLowerCase();
  // BTP / Node.js services
  if (name.includes('xsuaa') || (name.includes('identity') && !name.includes('iam'))) return cloudServiceDetails.xsuaa;
  if (name.includes('destination') || name.includes('connectivity') || name.includes('sdk')) return cloudServiceDetails.destination;
  if (name.includes('mesh') || name.includes('messaging') || name.includes('amqp')) return cloudServiceDetails.eventmesh;
  if (name.includes('postgres') || name.includes('hana') || name.includes('database')) return cloudServiceDetails.postgresql;
  // SAP-native / RAP services
  if (name.includes('cds') || name.includes('view') || name.includes('i_') || name.includes('projection')) return cloudServiceDetails.cdsView;
  if (name.includes('iam') || name.includes('role') || name.includes('auth')) return cloudServiceDetails.iamRoles;
  if (name.includes('luw') || name.includes('transaction') || name.includes('session')) return cloudServiceDetails.luwManager;
  if (name.includes('badi') || name.includes('enhancement') || name.includes('exit')) return cloudServiceDetails.badi;
  if (name.includes('service') || name.includes('srvb') || name.includes('srvd') || name.includes('rap') || name.includes('odata')) return cloudServiceDetails.rapService;
  return cloudServiceDetails.default;
};

export default function CloudServiceIntegrations({ cloudServices }: CloudServiceIntegrationsProps) {
  const [activeService, setActiveService] = useState<CloudService | null>(null);
  const [copied, setCopied] = useState(false);

  if (!cloudServices || cloudServices.length === 0) return null;

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Cloud Service Integrations</h3>
        <p className="text-sm text-slate-500 mt-1">Platform service bindings and technical dependencies required for the target architecture.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cloudServices.map((service, idx) => (
          <div 
            key={idx} 
            onClick={() => setActiveService(service)}
            className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-emerald-500/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer relative group active:scale-[0.98]"
          >
            <div>
              <div className="flex justify-between items-start gap-4 mb-2">
                <h4 className="font-extrabold text-slate-955 text-base group-hover:text-emerald-600 transition-colors">{service.serviceName}</h4>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-emerald-505 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all">Deep Dive</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                </div>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed mb-4">{service.purpose}</p>
            </div>
            <div className="border-t border-slate-50 pt-3 mt-4">
              {(() => {
                const isAbapNative = !service.npmPackages?.length || 
                  /CDS|View|RAP|IAM|LUW|BADI|BRF|Fiori|ABAP/i.test(service.serviceName);
                const label = isAbapNative ? 'Released SAP Objects' : 'NPM Package Dependencies';
                const packages = service.npmPackages?.length ? service.npmPackages : ['No external dependencies'];
                return (
                  <>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{label}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {packages.map((pkg, pIdx) => (
                        <code key={pIdx} className="bg-slate-100 text-slate-800 text-[10px] px-2 py-0.5 rounded-md font-mono border border-slate-150 group-hover:bg-emerald-50 group-hover:text-emerald-805 group-hover:border-emerald-200 transition-colors">
                          {pkg}
                        </code>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* Cloud Services Deep-Dive Drawer Overlay */}
      {activeService && (() => {
        const details = getCloudServiceDetails(activeService.serviceName);

        return (
          <div 
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-[90] flex justify-end animate-in fade-in duration-300"
            onClick={() => setActiveService(null)}
          >
            <div 
              className="bg-slate-900 border-l border-slate-800 text-white w-full max-w-2xl h-full shadow-2xl z-[90] flex flex-col justify-between animate-in slide-in-from-right duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-800/80 flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-12 -mt-12"></div>
                <div className="flex items-center gap-3.5 relative z-10">
                  <div className="bg-emerald-500/20 p-2.5 rounded-2xl text-emerald-400 border border-emerald-500/30">
                    <Network className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Service Integration Blueprint</span>
                    <h3 className="text-xl font-extrabold text-white mt-0.5">{details.title}</h3>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveService(null)}
                  className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-2 rounded-full transition-colors relative z-10"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6 text-sm">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Service Binding Role</h4>
                  <p className="text-slate-200 leading-relaxed font-semibold">{activeService.purpose}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Detailed Architectural Overview</h4>
                  <p className="text-slate-350 leading-relaxed">{details.details}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 font-mono">Why This is Critical for Clean Core</h4>
                  <p className="text-slate-300 leading-relaxed text-xs border-l-2 border-emerald-500/40 pl-4 py-1.5 italic bg-emerald-950/20 rounded-r-xl">{details.whyCritical}</p>
                </div>

                {details.npmPackages && details.npmPackages.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono">NPM Package Dependencies</h4>
                  <div className="flex flex-wrap gap-2">
                    {details.npmPackages.map((pkg, idx) => (
                      <code key={idx} className="bg-slate-955 text-emerald-400 border border-slate-800 text-xs px-3 py-1 rounded-xl font-mono">
                        {pkg}
                      </code>
                    ))}
                  </div>
                </div>
                )}

                <div className="space-y-2.5 pt-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                      {details.npmPackages && details.npmPackages.length > 0 ? 'Node.js Integration Code Guide' : 'ABAP Code Pattern'}
                    </h4>
                    <button
                      onClick={() => handleCopyCode(details.codeSnippet)}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-900/60 px-3 py-1.5 rounded-xl transition-all"
                    >
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-xs font-mono text-emerald-350 overflow-x-auto max-h-[280px] select-all scrollbar-thin scrollbar-thumb-slate-800">
                    <code>{details.codeSnippet}</code>
                  </pre>
                </div>
              </div>

              {/* Footer */}
              <div className="p-8 border-t border-slate-800/80 bg-slate-950/20 flex justify-between items-center gap-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Clean-Core.io Transformed Standard</span>
                <button
                  onClick={() => setActiveService(null)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-955/20"
                >
                  Return to Design Board
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
