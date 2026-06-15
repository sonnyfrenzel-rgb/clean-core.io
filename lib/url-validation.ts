/**
 * F-05: Hardened SSRF protection with DNS resolution, IPv6 blocking,
 * encoded-IP detection, redirect safety, and host allowlist.
 * 
 * Validates that a URL is safe for server-side fetching.
 * Blocks private/internal IPs, cloud metadata endpoints, localhost,
 * IPv6 addresses, encoded IP bypass attempts, and non-allowlisted hosts.
 */

import { resolve as dnsResolve } from 'dns';

// ── Private/reserved CIDR blocks ────────────────────────────────────────────
const PRIVATE_RANGES = [
  { start: 0x0A000000, end: 0x0AFFFFFF },   // 10.0.0.0/8
  { start: 0xAC100000, end: 0xAC1FFFFF },   // 172.16.0.0/12
  { start: 0xC0A80000, end: 0xC0A8FFFF },   // 192.168.0.0/16
  { start: 0xA9FE0000, end: 0xA9FEFFFF },   // 169.254.0.0/16 (link-local)
  { start: 0x7F000000, end: 0x7FFFFFFF },   // 127.0.0.0/8
  { start: 0x00000000, end: 0x00FFFFFF },   // 0.0.0.0/8
  { start: 0xC0000000, end: 0xC00000FF },   // 192.0.0.0/24
  { start: 0xC6120000, end: 0xC613FFFF },   // 198.18.0.0/15 (benchmarking)
  { start: 0xE0000000, end: 0xFFFFFFFF },   // 224.0.0.0/4 + 240.0.0.0/4 (multicast + reserved)
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const num = ipv4ToInt(ip);
  if (num === null) return false;
  return PRIVATE_RANGES.some(r => num >= r.start && num <= r.end);
}

// ── Hostname-based checks (pre-DNS) ────────────────────────────────────────

/** Detect IPv6 addresses including bracket-wrapped [::1] */
function isIPv6(hostname: string): boolean {
  // Bracket-wrapped IPv6 in URLs
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  // Raw IPv6 (contains multiple colons)
  if ((hostname.match(/:/g) || []).length >= 2) return true;
  return false;
}

/** Detect encoded/obfuscated IPs (hex, octal, decimal integer, mixed) */
function isEncodedIP(hostname: string): boolean {
  // Decimal integer IP: http://2130706433 → 127.0.0.1
  if (/^\d{8,10}$/.test(hostname)) return true;
  // Hex IP: 0x7f000001 or 0x7f.0x00.0x00.0x01
  if (/^0x[0-9a-f]+$/i.test(hostname) || /^0x[0-9a-f]+\./i.test(hostname)) return true;
  // Octal notation: 0177.0.0.01
  if (/^0\d+\./.test(hostname)) return true;
  // URL-encoded dots: 127%2e0%2e0%2e1
  if (/%2e/i.test(hostname)) return true;
  return false;
}

/** Blocked metadata hostnames */
const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.google.com',
  '100.100.100.200',      // Alibaba Cloud metadata
  'instance-data',         // AWS alias
]);

// ── Synchronous pre-flight check ────────────────────────────────────────────

export function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTPS URLs are allowed.' };
    }

    // Block credentials in URL (user:pass@host)
    if (parsed.username || parsed.password) {
      return { safe: false, reason: 'URLs with embedded credentials are blocked.' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block IPv6
    if (isIPv6(hostname)) {
      return { safe: false, reason: 'IPv6 addresses are blocked to prevent SSRF bypasses.' };
    }

    // Block encoded/obfuscated IPs
    if (isEncodedIP(hostname)) {
      return { safe: false, reason: 'Encoded or obfuscated IP addresses are blocked.' };
    }

    // Block cloud metadata endpoints
    if (METADATA_HOSTS.has(hostname)) {
      return { safe: false, reason: 'Cloud metadata endpoints are blocked.' };
    }

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return { safe: false, reason: 'Localhost addresses are blocked.' };
    }

    // Block dangerous internal TLDs/suffixes
    if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.localhost') || hostname.endsWith('.corp')) {
      return { safe: false, reason: 'Internal/local hostnames are blocked.' };
    }

    // Block private IP ranges (plain IPv4)
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      if (isPrivateIPv4(hostname)) {
        return { safe: false, reason: 'Private/internal IP addresses are blocked.' };
      }
    }

    // F-05: Host allowlist — if configured, only allow matching hosts
    const allowlist = (process.env.S4_HOST_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowlist.length > 0 && !ipv4Match) {
      const allowed = allowlist.some(suffix => hostname === suffix || hostname.endsWith(suffix));
      if (!allowed) {
        return { safe: false, reason: `Host "${hostname}" is not in the configured allowlist.` };
      }
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Invalid URL format.' };
  }
}

// ── Async DNS-based check (resolves hostname, checks resulting IPs) ─────────

function resolveHostname(hostname: string): Promise<string[]> {
  return new Promise((resolve) => {
    dnsResolve(hostname, (err, addresses) => {
      if (err || !addresses) {
        resolve([]);
      } else {
        resolve(addresses);
      }
    });
  });
}

/**
 * Full async SSRF check: runs isUrlSafe() + DNS resolution.
 * Use this for all server-side fetch operations.
 * DNS rebinding protection: resolves the hostname and checks the resulting IPs.
 */
export async function isUrlSafeWithDNS(urlString: string): Promise<{ safe: boolean; reason?: string }> {
  // Pre-flight checks
  const preflight = isUrlSafe(urlString);
  if (!preflight.safe) return preflight;

  // DNS resolution check
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname;

    // Skip DNS check for raw IPs (already checked above)
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return { safe: true };
    }

    const resolved = await resolveHostname(hostname);
    if (resolved.length === 0) {
      return { safe: false, reason: `DNS resolution failed for ${hostname}. Cannot verify target safety.` };
    }

    // Check every resolved IP
    for (const ip of resolved) {
      if (isPrivateIPv4(ip)) {
        return { safe: false, reason: `DNS for ${hostname} resolves to private IP ${ip}. Blocked to prevent SSRF.` };
      }
      // Block metadata IPs in resolved addresses
      if (METADATA_HOSTS.has(ip)) {
        return { safe: false, reason: `DNS for ${hostname} resolves to cloud metadata IP ${ip}. Blocked.` };
      }
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Failed to perform DNS safety check.' };
  }
}

/**
 * Safe fetch wrapper: validates URL + DNS before fetching,
 * follows redirects manually to validate each hop.
 * maxRedirects defaults to 5.
 */
export async function safeFetch(
  url: string,
  options: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i <= maxRedirects; i++) {
    const check = await isUrlSafeWithDNS(currentUrl);
    if (!check.safe) {
      throw new Error(`SSRF blocked: ${check.reason}`);
    }

    const response = await fetch(currentUrl, {
      ...options,
      redirect: 'manual', // Don't auto-follow — we need to validate each redirect target
    });

    // Handle redirects manually
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response missing Location header.');
      }
      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (max ${maxRedirects}).`);
}
