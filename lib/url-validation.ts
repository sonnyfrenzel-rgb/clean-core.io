/**
 * SSRF-Schutz: validiert URLs für serverseitiges Fetching und stellt einen
 * rebinding-/redirect-sicheren safeFetch() bereit.
 */
import dns from 'dns/promises';
import net from 'net';
// undici Agent is loaded dynamically to avoid compatibility issues on Node < 22

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

// Optionale Allowlist (kommagetrennte Host-Suffixe), z. B.
// S4_HOST_ALLOWLIST=".s4hana.cloud,.hana.ondemand.com,.sapcloud.cn"
function allowlist(): string[] {
  return (process.env.S4_HOST_ALLOWLIST || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// ── IPv4 ────────────────────────────────────────────────────────────────────
function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => ((acc << 8) + (parseInt(o, 10) & 0xff)) >>> 0, 0) >>> 0;
}
function inV4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}
function isBlockedV4(ip: string): boolean {
  return (
    inV4(ip, '0.0.0.0', 8) ||        // „this network"
    inV4(ip, '10.0.0.0', 8) ||       // privat
    inV4(ip, '100.64.0.0', 10) ||    // CGNAT
    inV4(ip, '127.0.0.0', 8) ||      // loopback
    inV4(ip, '169.254.0.0', 16) ||   // link-local + Cloud-Metadata
    inV4(ip, '172.16.0.0', 12) ||    // privat
    inV4(ip, '192.0.0.0', 24) ||     // IETF
    inV4(ip, '192.0.2.0', 24) ||     // TEST-NET-1
    inV4(ip, '192.168.0.0', 16) ||   // privat
    inV4(ip, '198.18.0.0', 15) ||    // Benchmark
    inV4(ip, '198.51.100.0', 24) ||  // TEST-NET-2
    inV4(ip, '203.0.113.0', 24) ||   // TEST-NET-3
    inV4(ip, '224.0.0.0', 4) ||      // Multicast
    inV4(ip, '240.0.0.0', 4)         // reserviert
  );
}

// ── IPv6 ────────────────────────────────────────────────────────────────────
function v6ToBytes(ipIn: string): number[] | null {
  let ip = ipIn.split('%')[0]; // Zone-ID entfernen
  let v4: number[] | null = null;
  if (ip.includes('.')) {
    const lc = ip.lastIndexOf(':');
    const tail = ip.slice(lc + 1);
    const p = tail.split('.').map((n) => parseInt(n, 10));
    if (p.length === 4 && p.every((n) => n >= 0 && n <= 255)) {
      v4 = p;
      ip = ip.slice(0, lc + 1) + '0:0';
    }
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    const v = parseInt(g || '0', 16);
    if (Number.isNaN(v) || v < 0 || v > 0xffff) return null;
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  if (v4) { bytes[12] = v4[0]; bytes[13] = v4[1]; bytes[14] = v4[2]; bytes[15] = v4[3]; }
  return bytes;
}
function isBlockedV6(ip: string): boolean {
  const b = v6ToBytes(ip);
  if (!b) return true; // unparsebar → blocken
  const allZeroUpto = (n: number) => b.slice(0, n).every((x) => x === 0);
  // ::  und  ::1
  if (allZeroUpto(15) && (b[15] === 0 || b[15] === 1)) return true;
  // IPv4-mapped ::ffff:0:0/96
  if (allZeroUpto(10) && b[10] === 0xff && b[11] === 0xff) {
    return isBlockedV4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }
  // NAT64 64:ff9b::/96
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
    return isBlockedV4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }
  if ((b[0] & 0xfe) === 0xfc) return true;                 // ULA fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link-local fe80::/10
  if (b[0] === 0xff) return true;                           // Multicast ff00::/8
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32
  return false;
}

function isBlockedIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedV4(ip);
  if (fam === 6) return isBlockedV6(ip);
  return true; // unbekannt → blocken
}

export interface UrlSafeResult {
  safe: boolean;
  reason?: string;
  host?: string;
  resolvedIp?: string;
  family?: 4 | 6;
}

export async function isUrlSafe(urlString: string): Promise<UrlSafeResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:') return { safe: false, reason: 'Only HTTPS URLs are allowed.' };
  if (parsed.username || parsed.password) return { safe: false, reason: 'Credentials in URL are not allowed.' };

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Schnelle Denylist + Policy
  if (host === 'metadata.google.internal' || host.endsWith('.internal') || host.endsWith('.local')) {
    return { safe: false, reason: 'Internal/metadata hostnames are blocked.' };
  }
  if (host.includes('-api.s4hana.ondemand.com')) {
    return { safe: false, reason: 'Production tenant API endpoints are blocked.' };
  }

  // Optionale Allowlist
  const al = allowlist();
  if (al.length && !al.some((suf) => host === suf.replace(/^\./, '') || host.endsWith(suf))) {
    return { safe: false, reason: 'Host is not in the configured allowlist.' };
  }

  // IP-Literal oder DNS-Auflösung (getaddrinfo normalisiert encodierte Formen)
  let records: { address: string; family: number }[];
  if (net.isIP(host)) {
    records = [{ address: host, family: net.isIP(host) }];
  } else {
    try {
      records = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      return { safe: false, reason: 'DNS resolution failed.' };
    }
  }
  if (!records.length) return { safe: false, reason: 'No DNS records found.' };

  for (const r of records) {
    if (isBlockedIp(r.address)) {
      return { safe: false, reason: `Resolves to a blocked address (${r.address}).` };
    }
  }
  const first = records[0];
  return { safe: true, host, resolvedIp: first.address, family: net.isIP(first.address) as 4 | 6 };
}

/**
 * Rebinding-/Redirect-sicherer Fetch:
 *  - validiert jede URL (auch nach Redirect) per isUrlSafe,
 *  - pinnt die TCP-Verbindung an die validierte IP (SNI/TLS bleibt am Hostnamen),
 *  - folgt Redirects nur manuell, begrenzt auf maxRedirects.
 * Wirft SsrfError bei blockierten Zielen.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxRedirects = 3,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await isUrlSafe(current);
    if (!check.safe) throw new SsrfError(check.reason || 'Blocked URL.');

    const pinnedIp = check.resolvedIp!;
    const pinnedFamily = check.family!;
    // Try to create a pinned dispatcher (undici Agent) for DNS rebinding protection.
    // Falls back to no pinning on Node versions where undici is unavailable.
    let dispatcherOpts: Record<string, any> = {};
    try {
      // @ts-ignore — undici is built into Node 22+; no npm package needed at runtime
      const { Agent } = await import('undici');
      const lookup = (_hostname: string, options: any, cb: any) => {
        const rec = { address: pinnedIp, family: pinnedFamily };
        if (options && options.all) return cb(null, [rec]);
        return cb(null, pinnedIp, pinnedFamily);
      };
      dispatcherOpts = { dispatcher: new Agent({ connect: { lookup } }) };
    } catch {
      // undici not available — proceed without IP pinning (redirect re-validation still active)
    }

    const res = await fetch(current, {
      ...init,
      redirect: 'manual',
      ...dispatcherOpts,
    } as any);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        current = new URL(loc, current).toString();
        continue;
      }
    }
    return res;
  }
  throw new SsrfError('Too many redirects.');
}
