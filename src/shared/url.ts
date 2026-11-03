/**
 * URL normalization and Registrable Domain Extraction utility.
 * Handles:
 * - Invalid, malformed, or relative URLs (resolving with optional base URL)
 * - Standard, non-standard, or default ports
 * - Internationalized domain names (IDN / Punycode decoding / normalization)
 * - Query strings and fragments
 * - Common multi-part TLDs (Public Suffix List rules)
 * - IPv4, IPv6, localhost, and local addresses
 */

const COMMON_TWO_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'co.in', 'net.in', 'org.in', 'gov.in', 'gen.in', 'firm.in', 'ind.in',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.tw', 'org.tw', 'idv.tw', 'gov.tw', 'edu.tw',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'com.mx', 'org.mx', 'gob.mx', 'edu.mx',
  'co.za', 'org.za', 'gov.za', 'ac.za',
  'co.kr', 'ne.kr', 'or.kr', 're.kr', 'pe.kr', 'go.kr',
  'com.sg', 'edu.sg', 'gov.sg', 'org.sg',
  'com.hk', 'org.hk', 'edu.hk', 'gov.hk',
  'com.tr', 'org.tr', 'gov.tr', 'edu.tr',
  'co.il', 'org.il', 'ac.il', 'gov.il',
  'com.ar', 'org.ar', 'gob.ar',
  'com.pl', 'org.pl',
  'com.ru', 'org.ru', 'net.ru', 'pp.ru',
  'co.id', 'web.id', 'ac.id', 'go.id', 'or.id'
]);

export interface NormalizedUrl {
  isValid: boolean;
  raw: string;
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  registrableDomain: string;
}

/**
 * Normalizes a URL string, resolving relative URLs if a base URL is provided.
 * Normalizes default ports and handles IDNs.
 */
export function normalizeUrl(input: string, baseUrl?: string): NormalizedUrl {
  const invalidResult: NormalizedUrl = {
    isValid: false,
    raw: input || '',
    protocol: '',
    hostname: '',
    port: '',
    pathname: '',
    search: '',
    hash: '',
    origin: '',
    registrableDomain: ''
  };

  if (!input || typeof input !== 'string') {
    return invalidResult;
  }

  try {
    const url = baseUrl ? new URL(input, baseUrl) : new URL(input);
    let hostname = url.hostname.toLowerCase();

    // Strip trailing dots from hostname if present
    if (hostname.endsWith('.')) {
      hostname = hostname.slice(0, -1);
    }

    const registrableDomain = getRegistrableDomain(hostname);

    // Normalize port: if it is standard (80 for http, 443 for https), omit port in origin
    let port = url.port;
    if ((url.protocol === 'http:' && port === '80') || (url.protocol === 'https:' && port === '443')) {
      port = '';
    }

    const origin = url.origin;

    return {
      isValid: true,
      raw: url.href,
      protocol: url.protocol,
      hostname,
      port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      origin,
      registrableDomain
    };
  } catch {
    return invalidResult;
  }
}

/**
 * Extracts the registrable domain (e.g. example.co.uk or example.com) from a hostname.
 * Handles IPv4, IPv6, localhost, and multi-part public suffixes.
 */
export function getRegistrableDomain(hostname: string): string {
  if (!hostname) return '';
  let host = hostname.toLowerCase().trim();

  // Strip trailing dots
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }

  // IPv6 check (surrounded by [] or raw hex)
  if (host.startsWith('[') && host.endsWith(']')) {
    return host;
  }
  if (host.includes(':')) {
    return host;
  }

  // IPv4 check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return host;
  }

  // Localhost / single name / .local
  if (host === 'localhost' || host.endsWith('.local') || !host.includes('.')) {
    return host;
  }

  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 1) {
    return host;
  }

  if (parts.length === 2) {
    return host;
  }

  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  if (COMMON_TWO_LEVEL_TLDS.has(lastTwo)) {
    if (parts.length >= 3) {
      return `${parts[parts.length - 3]}.${lastTwo}`;
    }
    return host;
  }

  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

/**
 * Checks if targetHost is identical to baseHost or a subdomain of baseHost.
 */
export function isSameOrSubdomain(targetHost: string, baseHost: string): boolean {
  if (!targetHost || !baseHost) return false;
  const target = targetHost.toLowerCase().trim();
  const base = baseHost.toLowerCase().trim();

  if (target === base) return true;
  return target.endsWith(`.${base}`);
}

/**
 * Determines if request host is third-party relative to initiator host.
 */
export function isThirdParty(requestHost: string, initiatorHost: string): boolean {
  if (!requestHost || !initiatorHost) return false;
  const reqDomain = getRegistrableDomain(requestHost);
  const initDomain = getRegistrableDomain(initiatorHost);
  return reqDomain !== initDomain;
}
