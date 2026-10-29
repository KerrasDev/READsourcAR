/**
 * URL normalization and Registrable Domain Extraction utility.
 * Uses a compact list of common multi-part TLDs (Public Suffix List rules)
 * to accurately identify registrable domains without external HTTP requests.
 */

const COMMON_TWO_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'co.in', 'net.in', 'org.in', 'gov.in', 'gen.in',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'com.tw', 'org.tw', 'idv.tw',
  'co.nz', 'net.nz', 'org.nz',
  'com.mx', 'org.mx', 'gob.mx',
  'co.za', 'org.za', 'gov.za',
  'co.kr', 'ne.kr', 'or.kr', 're.kr',
  'com.sg', 'edu.sg', 'gov.sg',
  'com.hk', 'org.hk', 'edu.hk',
  'com.tr', 'org.tr', 'gov.tr',
  'co.il', 'org.il', 'ac.il'
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
 */
export function normalizeUrl(input: string, baseUrl?: string): NormalizedUrl {
  const invalidResult: NormalizedUrl = {
    isValid: false,
    raw: input,
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
    const url = new URL(input, baseUrl);
    const hostname = url.hostname.toLowerCase();
    const registrableDomain = getRegistrableDomain(hostname);

    return {
      isValid: true,
      raw: url.href,
      protocol: url.protocol,
      hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      origin: url.origin,
      registrableDomain
    };
  } catch {
    return invalidResult;
  }
}

/**
 * Extracts the registrable domain (e.g. example.co.uk or example.com) from a hostname.
 */
export function getRegistrableDomain(hostname: string): string {
  if (!hostname) return '';
  // Strip default ports or paths if accidentally passed
  let cleanHost = hostname.trim();
  if (cleanHost.includes('/')) {
    cleanHost = cleanHost.split('/')[0];
  }

  // Handle bracketed IPv6 address e.g. [2001:db8::1]:8080
  if (cleanHost.startsWith('[')) {
    const closingBracket = cleanHost.indexOf(']');
    if (closingBracket !== -1) {
      return cleanHost.slice(0, closingBracket + 1).toLowerCase();
    }
  }

  if (cleanHost.includes(':')) {
    cleanHost = cleanHost.split(':')[0];
  }

  const host = cleanHost.toLowerCase();

  // Handle IP addresses or localhost
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost' || host.endsWith('.local')) {
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
 * Checks if targetHost is a sub-domain of baseHost or exact match.
 */
export function isSameOrSubdomain(targetHost: string, baseHost: string): boolean {
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
