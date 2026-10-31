/**
 * URL normalization and Registrable Domain Extraction utility.
 * Uses an expanded list of common multi-part TLDs (Public Suffix List rules)
 * to accurately identify registrable domains without external HTTP requests.
 */

const COMMON_TWO_LEVEL_TLDS = new Set([
  // United Kingdom
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'net.uk', 'sch.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // Japan
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp', 'ed.jp', 'gr.jp', 'lg.jp',
  // Brazil
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'mil.br', 'art.br',
  // India
  'co.in', 'net.in', 'org.in', 'gov.in', 'gen.in', 'firm.in', 'ind.in', 'nic.in', 'ac.in', 'edu.in', 'res.in',
  // China
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  // Taiwan
  'com.tw', 'org.tw', 'idv.tw', 'gov.tw', 'edu.tw', 'net.tw',
  // New Zealand
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'geek.nz', 'gen.nz', 'school.nz',
  // Mexico
  'com.mx', 'org.mx', 'gob.mx', 'edu.mx', 'net.mx',
  // South Africa
  'co.za', 'org.za', 'gov.za', 'ac.za', 'net.za', 'web.za',
  // South Korea
  'co.kr', 'ne.kr', 'or.kr', 're.kr', 'pe.kr', 'go.kr', 'ac.kr',
  // Singapore
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg', 'per.sg',
  // Hong Kong
  'com.hk', 'org.hk', 'edu.hk', 'gov.hk', 'net.hk', 'idv.hk',
  // Turkey
  'com.tr', 'org.tr', 'gov.tr', 'edu.tr', 'net.tr', 'gen.tr', 'biz.tr', 'info.tr',
  // Israel
  'co.il', 'org.il', 'ac.il', 'gov.il', 'muni.il', 'k12.il',
  // Russia
  'com.ru', 'net.ru', 'org.ru', 'pp.ru',
  // Ukraine
  'com.ua', 'net.ua', 'org.ua', 'gov.ua', 'edu.ua',
  // Poland
  'com.pl', 'net.pl', 'org.pl', 'edu.pl', 'gov.pl',
  // France
  'asso.fr', 'nom.fr', 'prd.fr', 'presse.fr', 'tm.fr',
  // Italy
  'gov.it', 'edu.it',
  // Spain
  'com.es', 'nom.es', 'org.es', 'gob.es', 'edu.es',
  // Canada
  'gc.ca', 'ab.ca', 'bc.ca', 'mb.ca', 'nb.ca', 'nl.ca', 'ns.ca', 'nt.ca', 'nu.ca', 'on.ca', 'pe.ca', 'qc.ca', 'sk.ca', 'yk.ca'
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
 * Handles protocol-less input, trims whitespace, standardizes default ports,
 * and extracts registrable domains.
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

  const trimmed = input.trim();
  if (!trimmed) {
    return invalidResult;
  }

  // Prepend scheme if input is a domain/path without protocol and no baseUrl is given
  let candidate = trimmed;
  if (!baseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    if (candidate.startsWith('//')) {
      candidate = `https:${candidate}`;
    } else {
      candidate = `https://${candidate}`;
    }
  }

  try {
    const url = new URL(candidate, baseUrl);
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
 * Handles IP addresses, localhost, IDN/punycode, and multi-part public suffixes.
 */
export function getRegistrableDomain(hostname: string): string {
  if (!hostname) return '';
  const host = hostname.toLowerCase().trim();

  // Handle IP addresses (IPv4 or IPv6) or local domains
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.test')) {
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
  if (!reqDomain || !initDomain) return false;
  return reqDomain !== initDomain;
}
