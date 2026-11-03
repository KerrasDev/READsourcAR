import { describe, it, expect } from 'vitest';
import { normalizeUrl, getRegistrableDomain, isSameOrSubdomain, isThirdParty } from '../src/shared/url';

describe('URL Normalization & Domain Extraction', () => {
  it('normalizes valid absolute URLs', () => {
    const res = normalizeUrl('https://Sub.Example.COM:8080/path/to/page?q=1#hash');
    expect(res.isValid).toBe(true);
    expect(res.hostname).toBe('sub.example.com');
    expect(res.origin).toBe('https://sub.example.com:8080');
    expect(res.registrableDomain).toBe('example.com');
  });

  it('normalizes standard default ports', () => {
    const httpRes = normalizeUrl('http://example.com:80/path');
    expect(httpRes.isValid).toBe(true);
    expect(httpRes.port).toBe('');

    const httpsRes = normalizeUrl('https://example.com:443/secure');
    expect(httpsRes.isValid).toBe(true);
    expect(httpsRes.port).toBe('');
  });

  it('handles relative URLs with a base URL', () => {
    const res = normalizeUrl('/api/v1/data', 'https://example.org/dashboard/');
    expect(res.isValid).toBe(true);
    expect(res.raw).toBe('https://example.org/api/v1/data');
    expect(res.hostname).toBe('example.org');
    expect(res.registrableDomain).toBe('example.org');
  });

  it('handles malformed and empty URLs safely', () => {
    expect(normalizeUrl('').isValid).toBe(false);
    expect(normalizeUrl('not-a-url').isValid).toBe(false);
    expect(normalizeUrl(null as any).isValid).toBe(false);
  });

  it('handles multi-part TLDs (co.uk, com.au, com.br)', () => {
    expect(getRegistrableDomain('test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('sub.test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('a.b.c.com.au')).toBe('c.com.au');
    expect(getRegistrableDomain('gov.br')).toBe('gov.br');
    expect(getRegistrableDomain('site.gov.br')).toBe('site.gov.br');
  });

  it('handles IP addresses, IPv6, and localhost', () => {
    expect(getRegistrableDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(getRegistrableDomain('192.168.1.1')).toBe('192.168.1.1');
    expect(getRegistrableDomain('[::1]')).toBe('[::1]');
    expect(getRegistrableDomain('localhost')).toBe('localhost');
  });

  it('identifies subdomains correctly', () => {
    expect(isSameOrSubdomain('api.example.com', 'example.com')).toBe(true);
    expect(isSameOrSubdomain('example.com', 'example.com')).toBe(true);
    expect(isSameOrSubdomain('other.com', 'example.com')).toBe(false);
    expect(isSameOrSubdomain('fakeexample.com', 'example.com')).toBe(false);
  });

  it('classifies first-party vs third-party requests', () => {
    expect(isThirdParty('cdn.example.com', 'app.example.com')).toBe(false);
    expect(isThirdParty('tracker.ads.com', 'app.example.com')).toBe(true);
  });
});
