'use client';

import { useState } from 'react';
import { ArrowUpRight, Copy } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';

/** A snippet as plain lines for the code surface — no highlighting is claimed. */
function snippetLines(code: string): CcCodeLine[] {
  return code.split('\n').map((text, index) => ({ number: index + 1, tokens: [{ kind: 'plain', text }] }));
}

interface CloudService {
  serviceName: string;
  purpose: string;
  npmPackages: string[];
}

interface CloudServiceIntegrationsProps {
  cloudServices?: CloudService[];
  /**
   * Inside a group of the design document (03.10.2026): no provenance chip of
   * its own — the group carries "Model proposal" once.
   */
  embedded?: boolean;
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
    details: 'The SAP Destination service serves as a secure, centralized vault for configuring outbound target connection profiles (URLs, protocols, and authentication settings). Combined with the SAP Connectivity service and Cloud Connector, it establishes secure tunnels to on-premises ERP systems and cloud-based REST/OData APIs.',
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

  // Execute authenticated outbound call through the destination proxy
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
  hanaCloud: {
    title: 'SAP HANA Cloud Database',
    details: 'SAP HANA Cloud is the managed database behind an HDI container on SAP BTP. A side-by-side extension binds to its own container, so the extension schema is separate from the S/4HANA core schema while still sitting on the same database technology. Node.js reaches it through the SAP HANA client, not through a PostgreSQL driver.',
    whyCritical: 'Extension tables belong in the extension’s own HDI container, never in the S/4HANA core schema — that is what keeps an upgrade from colliding with custom data. The binding is injected by the platform, so nothing about the host, schema or certificate is written into the application.',
    npmPackages: ['@sap/hana-client', '@sap/xsenv'],
    codeSnippet: `const hana = require('@sap/hana-client');
const xsenv = require('@sap/xsenv');

// Resolve the HDI container binding the platform injected (VCAP_SERVICES)
const { db } = xsenv.getServices({ db: { label: 'hana' } });
const c = db.credentials;

const connection = hana.createConnection();
connection.connect({
  serverNode: \`\${c.host}:\${c.port}\`,
  uid: c.user,
  pwd: c.password,
  currentSchema: c.schema,
  encrypt: 'true',
  sslValidateCertificate: 'true'
});

function queryExtensionData(userId) {
  const stmt = connection.prepare(
    'SELECT * FROM "EXTENSION_USERS" WHERE "ID" = ?'
  );
  return stmt.exec([userId])[0];
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
    whyCritical: 'Legacy authorization checks (AUTHORITY-CHECK on custom objects like Z_AUTH_*) are not portable to cloud. IAM Business Roles provide a standardized, auditable authorization model that integrates with SAP Cloud Identity Services, Identity Authentication (IAS) and supports federation with corporate identity providers.',
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

/**
 * "SAP S/4HANA …" is the ERP system, not a database service. The substring `hana`
 * sits inside it, so any rule that matches on `hana` alone claims every S/4HANA
 * destination, OData service and extension name as a database.
 */
const S4 = /s\/?4\s*hana/;

export const getCloudServiceDetails = (serviceName: string) => {
  const name = serviceName.toLowerCase();
  // BTP / Node.js services
  if (name.includes('xsuaa') || (name.includes('identity') && !name.includes('iam'))) return cloudServiceDetails.xsuaa;
  if (name.includes('destination') || name.includes('connectivity') || name.includes('sdk')) return cloudServiceDetails.destination;
  if (name.includes('mesh') || name.includes('messaging') || name.includes('amqp')) return cloudServiceDetails.eventmesh;
  /*
   * One rule used to read `postgres || hana || database` and return the PostgreSQL
   * guide for all three. "SAP HANA Cloud Database" therefore handed an architect the
   * `pg` package, PostgreSQL credentials and a PostgreSQL connection — for a service
   * that speaks none of it (QA 62c08912d745, 498a8c35f988). The guide was not merely
   * unhelpful; it was copyable, and it cannot connect.
   *
   * So each database is matched by its own name, and a service that only says
   * "database" gets the generic binding guide at the bottom rather than a driver
   * picked by guesswork. Naming the wrong client is worse than naming none.
   */
  if (name.includes('postgres')) return cloudServiceDetails.postgresql;
  if (name.includes('hana') && !S4.test(name)) return cloudServiceDetails.hanaCloud;
  // A database with no vendor in its name: the generic service-binding guide,
  // before the RAP branch below can read the word "service" in it.
  if (name.includes('database') || /\bdb\b/.test(name)) return cloudServiceDetails.default;
  // SAP-native / RAP services
  if (name.includes('cds') || name.includes('view') || name.includes('i_') || name.includes('projection')) return cloudServiceDetails.cdsView;
  if (name.includes('iam') || name.includes('role') || name.includes('auth')) return cloudServiceDetails.iamRoles;
  if (name.includes('luw') || name.includes('transaction') || name.includes('session')) return cloudServiceDetails.luwManager;
  if (name.includes('badi') || name.includes('enhancement') || name.includes('exit')) return cloudServiceDetails.badi;
  if (name.includes('service') || name.includes('srvb') || name.includes('srvd') || name.includes('rap') || name.includes('odata')) return cloudServiceDetails.rapService;
  return cloudServiceDetails.default;
};

export default function CloudServiceIntegrations({ cloudServices, embedded = false }: CloudServiceIntegrationsProps) {
  const [activeService, setActiveService] = useState<CloudService | null>(null);
  const [copied, setCopied] = useState(false);

  if (!cloudServices || cloudServices.length === 0) return null;

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const details = activeService ? getCloudServiceDetails(activeService.serviceName) : null;
  const hasPackages = Boolean(details?.npmPackages && details.npmPackages.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={embedded ? 'cc-text-h3 text-cc-ink' : 'cc-text-h2 text-cc-ink'}>Cloud Service Integrations</h3>
          {/* Which services, what for and which packages: the model's design.
              The details behind each row are our own reference text. */}
          {embedded ? null : <CcProvenanceChip value="proposed" />}
        </div>
        <p className="cc-text-cell text-cc-ink-muted mt-1">Platform service bindings and technical dependencies required for the target architecture.</p>
      </div>

      {/* One compact row per service (owner 03.10.2026: five large cards were
          a wall); the details open beside the list. */}
      <ul className="m-0 flex list-none flex-col divide-y divide-cc-line rounded-cc-card border border-cc-line p-0">
        {cloudServices.map((service, idx) => {
          const isAbapNative = !service.npmPackages?.length ||
            /CDS|View|RAP|IAM|LUW|BADI|BRF|Fiori|ABAP/i.test(service.serviceName);
          const label = isAbapNative ? 'Released SAP objects' : 'npm packages';
          const packages = service.npmPackages?.length ? service.npmPackages : ['No external dependencies'];
          return (
            <li
              key={idx}
              data-cloud-service={idx}
              data-design-service={service.serviceName}
              className="grid min-w-0 grid-cols-1 gap-2 px-4 py-3 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] min-[900px]:items-center min-[900px]:gap-4"
            >
              <div className="min-w-0">
                <h4 className="m-0 text-[14px] font-bold text-cc-ink [overflow-wrap:anywhere]">{service.serviceName}</h4>
                <p className="m-0 cc-text-cell text-cc-ink">{service.purpose}</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span className="sr-only">{label}:</span>
                {packages.map((pkg, pIdx) => (
                  <code key={pIdx} className="max-w-full font-cc-mono cc-text-meta text-cc-ink [overflow-wrap:anywhere]">
                    <CcTag>{pkg}</CcTag>
                  </code>
                ))}
              </div>
              <div className="justify-self-start min-[900px]:justify-self-end">
                <CcButton
                  variant="ghost"
                  icon={<ArrowUpRight size={16} aria-hidden={true} />}
                  onClick={() => setActiveService(service)}
                  aria-haspopup="dialog"
                >
                  Details<span className="sr-only"> of {service.serviceName}</span>
                </CcButton>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Cloud service deep dive */}
      <CcDialog
        open={Boolean(activeService && details)}
        title={details?.title ?? ''}
        lead="Service Integration Blueprint"
        size="wide"
        placement="side"
        onClose={() => setActiveService(null)}
        actions={
          <CcButton variant="ghost" onClick={() => setActiveService(null)}>
            Close
          </CcButton>
        }
      >
        {activeService && details ? (
          <div className="space-y-6">
            <div>
              <h3 className="cc-text-label text-cc-ink-muted mb-2">Service Binding Role</h3>
              <p className="cc-text-body font-semibold text-cc-ink">{activeService.purpose}</p>
            </div>

            <div>
              <h3 className="cc-text-label text-cc-ink-muted mb-2">Detailed Architectural Overview</h3>
              <p className="cc-text-body text-cc-ink">{details.details}</p>
            </div>

            <div>
              <h3 className="cc-text-label text-cc-ink-muted mb-2">Why This is Critical for Clean Core</h3>
              <p className="cc-text-cell text-cc-ink border-l-2 border-cc-line pl-4 py-1">{details.whyCritical}</p>
            </div>

            {hasPackages && (
              <div>
                <h3 className="cc-text-label text-cc-ink-muted mb-2">NPM Package Dependencies</h3>
                <div className="flex flex-wrap gap-2">
                  {details.npmPackages.map((pkg, idx) => (
                    <code key={idx} className="font-cc-mono cc-text-meta text-cc-ink">
                      <CcTag>{pkg}</CcTag>
                    </code>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center gap-2">
                <h3 className="cc-text-label text-cc-ink-muted">
                  {hasPackages ? 'Node.js Integration Code Guide' : 'ABAP Code Pattern'}
                </h3>
                <CcButton
                  variant="ghost"
                  icon={<Copy size={16} aria-hidden={true} />}
                  onClick={() => handleCopyCode(details.codeSnippet)}
                >
                  {copied ? 'Copied!' : 'Copy Code'}
                </CcButton>
              </div>
              <div className="max-h-[280px] overflow-y-auto rounded-cc-card">
                <CcCodeSurface label={`${details.title} — code`} lines={snippetLines(details.codeSnippet)} />
              </div>
            </div>

            <p className="cc-text-meta text-cc-ink-muted">Clean-Core.io Transformed Standard</p>
          </div>
        ) : null}
      </CcDialog>
    </div>
  );
}
