/**
 * The JSON-RPC side of the MCP beta (docs/design/mcp-beta.md): one message in,
 * one response out (or none for a notification). No transport, no store, no
 * clock — the HTTP half is `lib/mcp/http.ts`.
 *
 * Protocol: the initialize-based revisions 2025-11-25, 2025-06-18 and
 * 2025-03-26 over Streamable HTTP, served statelessly — no `Mcp-Session-Id`,
 * every POST answered with one JSON body, no server-to-client stream. A client
 * of the 2026-07-28 revision that also speaks the older ones falls back to
 * `initialize` when its first request is refused with HTTP 400 and a JSON-RPC
 * error that is not one of that revision's own (`lib/mcp/http.ts`).
 *
 * Three read-only tools, all deterministic: `analyze_abap`,
 * `lookup_sap_object_level`, `export_bpmn`. `tools/list` is static and sorted.
 */
import { APP_VERSION } from '../version';
import { ANALYZE_PARTS, DEFAULT_MAX_ITEMS, MAX_MAX_ITEMS, MAX_SOURCE_BYTES, ToolInputError, analyzeAbap, exportBpmn, type AnalyzePart } from './analyze';
import { MAX_NAMES, NAME_PATTERN, lookupSapObjectLevel } from './lookup';
import type { ObjectUse } from '../abap/abcd-classification';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INFO = { name: 'clean-core-io', title: 'Clean-Core.io (beta)', version: APP_VERSION.replace(/^v/, '') };

const INSTRUCTIONS =
  'Clean-Core.io reads SAP ABAP source with a deterministic evidence engine. No AI model is called and nothing is stored. ' +
  'Fields whose names end in _quoted hold text copied from the ABAP source the user supplied; comment text is removed from them.';

/** JSON-RPC 2.0 error codes used here. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const EDITION_PROPERTY = {
  type: 'string',
  enum: ['private', 'public'],
  default: 'private',
  description: 'Target edition: "private" for SAP Cloud ERP Private, "public" for SAP S/4HANA Cloud Public Edition. Default: private.',
};

/** The tool list, sorted by name. Static: nothing in it depends on a request. */
export const TOOLS = [
  {
    name: 'analyze_abap',
    title: 'Analyze ABAP source',
    description:
      'Reads one ABAP program with the Clean-Core.io evidence engine and returns what it found, with line numbers: the process steps, ' +
      'hard-coded business rules, clean core findings with the level of each SAP object (A to D, or Unknown where the catalog does not grade it), the places where nothing is processed, ' +
      'and what the engine could not assess. Deterministic: the same source and engine version give the same result. No AI model is called, ' +
      'the source is not stored, and the result is not a signed run. Comment text of the source is not returned. ' +
      `Limit: ${MAX_SOURCE_BYTES / 1024} KB of source per call. The input block returns the SHA-256, line count and first code line of the source as received.`,
    inputSchema: {
      type: 'object',
      required: ['source'],
      additionalProperties: false,
      properties: {
        source: { type: 'string', maxLength: MAX_SOURCE_BYTES, description: 'The ABAP source text exactly as the user provided it.' },
        edition: EDITION_PROPERTY,
        include: {
          type: 'array',
          uniqueItems: true,
          items: { type: 'string', enum: [...ANALYZE_PARTS] },
          description: 'Parts to return. Default: all parts, each shortened to max_items entries.',
        },
        max_items: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_MAX_ITEMS,
          default: DEFAULT_MAX_ITEMS,
          description: 'Most entries returned per list. The truncated block says how many were left out.',
        },
      },
    },
    annotations: { title: 'Analyze ABAP source', ...ANNOTATIONS },
  },
  {
    name: 'export_bpmn',
    title: 'Export the process map as BPMN',
    description:
      'Returns the process map the Clean-Core.io engine reconstructs from one ABAP program as a BPMN 2.0 XML file, with the engine\'s own labels ' +
      'and a line range on each element. No AI model names or writes anything; the source is not stored. The XML can be saved as a .bpmn file ' +
      `and opened in SAP Signavio or another BPMN tool. Limit: ${MAX_SOURCE_BYTES / 1024} KB of source per call; the answer can be large.`,
    inputSchema: {
      type: 'object',
      required: ['source'],
      additionalProperties: false,
      properties: {
        source: { type: 'string', maxLength: MAX_SOURCE_BYTES, description: 'The ABAP source text exactly as the user provided it.' },
        edition: EDITION_PROPERTY,
        process_name: { type: 'string', maxLength: 80, description: 'Name of the process in the file. Default: "ABAP process".' },
      },
    },
    annotations: { title: 'Export the process map as BPMN', ...ANNOTATIONS },
  },
  {
    name: 'lookup_sap_object_level',
    title: 'Look up the clean core level of SAP objects',
    description:
      'Returns the clean core level (A to D, or Unknown) of SAP objects such as tables, CDS views, classes or function modules, from SAP\'s ' +
      'published Cloudification Repository files as included in Clean-Core.io. Optional: how the object is used (read, write or reference), ' +
      'which can change the level. Public reference data; no AI model is called.',
    inputSchema: {
      type: 'object',
      required: ['names'],
      additionalProperties: false,
      properties: {
        names: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_NAMES,
          items: { type: 'string', pattern: NAME_PATTERN.source },
          description: 'SAP object names such as MARA, I_PRODUCT or BAPI_PO_CREATE1.',
        },
        use: { type: 'string', enum: ['read', 'write', 'reference'], description: 'How the code uses the objects. Omit to grade by name alone.' },
        edition: EDITION_PROPERTY,
      },
    },
    annotations: { title: 'Look up the clean core level of SAP objects', ...ANNOTATIONS },
  },
] as const;

type Json = Record<string, unknown>;

/** What the transport may log about one message: never an argument, only its shape. */
export interface MessageLog {
  method: string;
  tool?: string;
  outcome: string;
  /** Bytes of the `source` argument, for the size bucket; never the source. */
  sourceBytes?: number;
}

export interface HandleResult {
  /** The JSON-RPC response, or null for a notification. */
  response: Json | null;
  log: MessageLog;
}

export interface Hooks {
  /** Runs before a tool executes — the transport's rate limit. A thrown {@link ToolRefusal} becomes a tool error. */
  beforeToolCall?: (tool: string) => Promise<void>;
}

/** A refusal of the transport around a tool call (a rate limit), returned as a tool error with its sentence. */
export class ToolRefusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function rpcError(id: unknown, code: number, message: string, data?: unknown): Json {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function rpcResult(id: unknown, result: unknown): Json {
  return { jsonrpc: '2.0', id, result };
}

function toolError(code: string, message: string): Json {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { origin: 'engine', ai_generated: false, error: { code, message } },
    isError: true,
  };
}

function toolOk(structured: unknown): Json {
  return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured };
}

const ALLOWED_ARGS: Record<string, readonly string[]> = {
  analyze_abap: ['source', 'edition', 'include', 'max_items'],
  export_bpmn: ['source', 'edition', 'process_name'],
  lookup_sap_object_level: ['names', 'use', 'edition'],
};

/** Argument checks in the words a model can act on; null when the arguments are usable. */
function argumentDefect(tool: string, args: Json): string | null {
  const unknown = Object.keys(args).filter((k) => !ALLOWED_ARGS[tool].includes(k));
  if (unknown.length) return `Unknown argument: ${unknown.slice(0, 3).map((k) => k.slice(0, 40)).join(', ')}.`;
  if (args.edition !== undefined && typeof args.edition !== 'string') return 'edition must be "private" or "public".';
  if (tool === 'analyze_abap' || tool === 'export_bpmn') {
    if (typeof args.source !== 'string') return 'source is required and must be the ABAP source as text.';
  }
  if (tool === 'analyze_abap') {
    if (args.include !== undefined) {
      if (!Array.isArray(args.include) || args.include.some((p) => !(ANALYZE_PARTS as readonly unknown[]).includes(p))) {
        return `include must be a list of: ${ANALYZE_PARTS.join(', ')}.`;
      }
    }
    if (args.max_items !== undefined) {
      const n = args.max_items;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_MAX_ITEMS) return `max_items must be a whole number from 1 to ${MAX_MAX_ITEMS}.`;
    }
  }
  if (tool === 'export_bpmn' && args.process_name !== undefined) {
    if (typeof args.process_name !== 'string' || args.process_name.length > 80) return 'process_name must be text of at most 80 characters.';
  }
  if (tool === 'lookup_sap_object_level') {
    const names = args.names;
    if (!Array.isArray(names) || names.length < 1 || names.length > MAX_NAMES) return `names must be a list of 1 to ${MAX_NAMES} SAP object names.`;
    const bad = names.find((n) => typeof n !== 'string' || !NAME_PATTERN.test(n));
    if (bad !== undefined) return 'Each name may hold only letters, digits, "_" and "/", at most 40 characters.';
    if (args.use !== undefined && args.use !== 'read' && args.use !== 'write' && args.use !== 'reference') {
      return 'use must be "read", "write" or "reference".';
    }
  }
  return null;
}

function runTool(tool: string, args: Json): unknown {
  switch (tool) {
    case 'analyze_abap':
      return analyzeAbap({
        source: args.source as string,
        edition: args.edition,
        include: args.include as AnalyzePart[] | undefined,
        maxItems: args.max_items as number | undefined,
      });
    case 'export_bpmn':
      return exportBpmn({ source: args.source as string, edition: args.edition, processName: args.process_name as string | undefined });
    case 'lookup_sap_object_level':
      return lookupSapObjectLevel({ names: args.names as string[], use: (args.use as ObjectUse | undefined) ?? null, edition: args.edition });
    default:
      throw new Error('unreachable');
  }
}

/** Handle one JSON-RPC message (a parsed body that is not an array). */
export async function handleMessage(message: unknown, hooks: Hooks = {}): Promise<HandleResult> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { response: rpcError(null, RPC.INVALID_REQUEST, 'Invalid request: expected one JSON-RPC 2.0 object.'), log: { method: '-', outcome: 'invalid-request' } };
  }
  const msg = message as Json;
  const id = msg.id;
  const method = typeof msg.method === 'string' ? msg.method : '';
  const isNotification = !('id' in msg);
  const logMethod = method.length <= 60 && /^[\w/.-]+$/.test(method) ? method : '-';

  if (msg.jsonrpc !== '2.0' || !method) {
    // A response from the client (we never send requests) is acknowledged without an answer.
    if (msg.jsonrpc === '2.0' && !method && ('result' in msg || 'error' in msg)) return { response: null, log: { method: '-', outcome: 'ignored-response' } };
    return { response: rpcError(id, RPC.INVALID_REQUEST, 'Invalid request: jsonrpc must be "2.0" and method a string.'), log: { method: logMethod, outcome: 'invalid-request' } };
  }
  if (!isNotification && (typeof id !== 'string' && typeof id !== 'number')) {
    return { response: rpcError(null, RPC.INVALID_REQUEST, 'Invalid request: id must be a string or a number.'), log: { method: logMethod, outcome: 'invalid-request' } };
  }

  if (isNotification) {
    // notifications/initialized, notifications/cancelled and any other: nothing to answer, nothing kept.
    return { response: null, log: { method: logMethod, outcome: 'notification' } };
  }

  const params = (msg.params && typeof msg.params === 'object' && !Array.isArray(msg.params) ? msg.params : {}) as Json;

  switch (method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : LATEST_PROTOCOL_VERSION;
      return {
        response: rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        }),
        log: { method, outcome: 'ok' },
      };
    }
    case 'ping':
      return { response: rpcResult(id, {}), log: { method, outcome: 'ok' } };
    case 'tools/list':
      return { response: rpcResult(id, { tools: TOOLS }), log: { method, outcome: 'ok' } };
    case 'tools/call': {
      const name = params.name;
      const tool = typeof name === 'string' && name in ALLOWED_ARGS ? name : null;
      if (!tool) {
        return { response: rpcError(id, RPC.INVALID_PARAMS, 'Unknown tool. Call tools/list for the available tools.'), log: { method, outcome: 'unknown-tool' } };
      }
      const rawArgs = params.arguments ?? {};
      if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
        return { response: rpcError(id, RPC.INVALID_PARAMS, 'arguments must be an object.'), log: { method, tool, outcome: 'invalid-params' } };
      }
      const args = rawArgs as Json;
      const sourceBytes = typeof args.source === 'string' ? Buffer.byteLength(args.source, 'utf8') : undefined;
      const log: MessageLog = { method, tool, outcome: 'ok', ...(sourceBytes !== undefined ? { sourceBytes } : {}) };
      const defect = argumentDefect(tool, args);
      if (defect) return { response: rpcResult(id, toolError('invalid-arguments', defect)), log: { ...log, outcome: 'tool-error:invalid-arguments' } };
      try {
        await hooks.beforeToolCall?.(tool);
      } catch (err) {
        if (err instanceof ToolRefusal) return { response: rpcResult(id, toolError(err.code, err.message)), log: { ...log, outcome: `tool-error:${err.code}` } };
        throw err;
      }
      try {
        return { response: rpcResult(id, toolOk(runTool(tool, args))), log };
      } catch (err) {
        if (err instanceof ToolInputError) return { response: rpcResult(id, toolError(err.code, err.message)), log: { ...log, outcome: `tool-error:${err.code}` } };
        // Never the error's text: it can carry a piece of the input.
        return {
          response: rpcResult(id, toolError('engine-error', 'The engine could not read this source. Nothing was stored. Try a smaller part of the program.')),
          log: { ...log, outcome: 'tool-error:engine-error' },
        };
      }
    }
    default:
      return { response: rpcError(id, RPC.METHOD_NOT_FOUND, 'Method not found.'), log: { method: logMethod, outcome: 'method-not-found' } };
  }
}
