import { describe, it, expect } from 'vitest';
import { normalizeUrl, getRegistrableDomain, isSameOrSubdomain, isThirdParty } from '../src/shared/url';

describe('URL Normalization & Domain Extraction', () => {
  it('normalizes valid absolute URLs and strips default ports', () => {
    const res = normalizeUrl('https://Sub.Example.COM:443/path/to/page?q=1#hash');
    expect(res.isValid).toBe(true);
    expect(res.hostname).toBe('sub.example.com');
    expect(res.port).toBe(''); // 443 default port stripped
    expect(res.origin).toBe('https://sub.example.com');
    expect(res.registrableDomain).toBe('example.com');
  });

  it('preserves non-default ports', () => {
    const res = normalizeUrl('https://Sub.Example.COM:8080/path');
    expect(res.isValid).toBe(true);
    expect(res.port).toBe('8080');
  });

  it('handles multi-part TLDs (co.uk, com.au, com.ar)', () => {
    expect(getRegistrableDomain('test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('sub.test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('a.b.c.com.au')).toBe('c.com.au');
    expect(getRegistrableDomain('news.site.com.ar')).toBe('site.com.ar');
  });

  it('handles IP addresses, IPv6, and localhost', () => {
    expect(getRegistrableDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(getRegistrableDomain('localhost')).toBe('localhost');
    expect(getRegistrableDomain('::1')).toBe('::1');
  });

  it('identifies subdomains correctly', () => {
    expect(isSameOrSubdomain('api.example.com', 'example.com')).toBe(true);
    expect(isSameOrSubdomain('example.com', 'example.com')).toBe(true);
    expect(isSameOrSubdomain('other.com', 'example.com')).toBe(false);
  });

  it('classifies first-party vs third-party requests', () => {
    expect(isThirdParty('cdn.example.com', 'app.example.com')).toBe(false);
    expect(isThirdParty('tracker.ads.com', 'app.example.com')).toBe(true);
  });
});
