/**
 * Shared SSRF protection: validates that a URL is safe for server-side fetching.
 * Blocks private/internal IPs, cloud metadata endpoints, localhost, and
 * production SAP tenant domains.
 */

/** Block private/internal IP ranges, cloud metadata, and dangerous URLs */
export function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTPS URLs are allowed.' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return { safe: false, reason: 'Cloud metadata endpoints are blocked.' };
    }

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return { safe: false, reason: 'Localhost addresses are blocked.' };
    }

    // Block private IP ranges (basic check on hostname)
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 169) {
        return { safe: false, reason: 'Private/internal IP addresses are blocked.' };
      }
    }

    // Block production SAP endpoints
    if (hostname.includes('-api.s4hana.ondemand.com')) {
      return { safe: false, reason: 'Production tenant API endpoints are blocked.' };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Invalid URL format.' };
  }
}
