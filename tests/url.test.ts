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

  it('handles multi-part TLDs (co.uk, com.au)', () => {
    expect(getRegistrableDomain('test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('sub.test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('a.b.c.com.au')).toBe('c.com.au');
  });

  it('handles IP addresses and localhost', () => {
    expect(getRegistrableDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(getRegistrableDomain('localhost')).toBe('localhost');
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
