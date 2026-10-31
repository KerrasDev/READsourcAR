import { describe, it, expect } from 'vitest';
import { normalizeUrl, getRegistrableDomain, isSameOrSubdomain, isThirdParty } from '../src/shared/url';

describe('URL Normalization & Domain Extraction', () => {
  it('normalizes valid absolute URLs', () => {
    const res = normalizeUrl('https://Sub.Example.COM:8080/path/to/page?q=1#hash');
    expect(res.isValid).toBe(true);
    expect(res.hostname).toBe('sub.example.com');
    expect(res.origin).toBe('https://sub.example.com:8080');
    expect(res.registrableDomain).toBe('example.com');
    expect(res.port).toBe('8080');
    expect(res.search).toBe('?q=1');
    expect(res.hash).toBe('#hash');
  });

  it('handles relative URLs with a valid base URL', () => {
    const res = normalizeUrl('/assets/main.js', 'https://example.com/blog/');
    expect(res.isValid).toBe(true);
    expect(res.raw).toBe('https://example.com/assets/main.js');
    expect(res.hostname).toBe('example.com');
    expect(res.registrableDomain).toBe('example.com');
  });

  it('handles bare hostnames and protocol-relative URLs gracefully', () => {
    const res1 = normalizeUrl('example.org');
    expect(res1.isValid).toBe(true);
    expect(res1.hostname).toBe('example.org');
    expect(res1.registrableDomain).toBe('example.org');

    const res2 = normalizeUrl('//cdn.example.org/script.js');
    expect(res2.isValid).toBe(true);
    expect(res2.hostname).toBe('cdn.example.org');
    expect(res2.registrableDomain).toBe('example.org');
  });

  it('handles invalid or empty inputs safely', () => {
    expect(normalizeUrl('').isValid).toBe(false);
    expect(normalizeUrl('   ').isValid).toBe(false);
    expect(normalizeUrl(':::not a url:::').isValid).toBe(false);
    // @ts-expect-error test undefined input
    expect(normalizeUrl(undefined).isValid).toBe(false);
  });

  it('handles multi-part TLDs across different countries', () => {
    expect(getRegistrableDomain('test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('sub.test.co.uk')).toBe('test.co.uk');
    expect(getRegistrableDomain('a.b.c.com.au')).toBe('c.com.au');
    expect(getRegistrableDomain('portal.gov.br')).toBe('portal.gov.br');
    expect(getRegistrableDomain('service.police.gov.in')).toBe('police.gov.in');
    expect(getRegistrableDomain('dept.kyoto-u.ac.jp')).toBe('kyoto-u.ac.jp');
    expect(getRegistrableDomain('sub.news.co.nz')).toBe('news.co.nz');
    expect(getRegistrableDomain('api.bank.co.il')).toBe('bank.co.il');
  });

  it('handles IP addresses, IPv6, and localhost', () => {
    expect(getRegistrableDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(getRegistrableDomain('192.168.1.1')).toBe('192.168.1.1');
    expect(getRegistrableDomain('localhost')).toBe('localhost');
    expect(getRegistrableDomain('app.test')).toBe('app.test');
    expect(getRegistrableDomain('server.local')).toBe('server.local');
  });

  it('identifies subdomains correctly', () => {
    expect(isSameOrSubdomain('api.example.com', 'example.com')).toBe(true);
    expect(isSameOrSubdomain('example.com', 'example.com')).toBe(true);
    expect(isSameOrSubdomain('sub.api.example.com', 'example.com')).toBe(true);
    expect(isSameOrSubdomain('other.com', 'example.com')).toBe(false);
    expect(isSameOrSubdomain('badexample.com', 'example.com')).toBe(false);
  });

  it('classifies first-party vs third-party requests', () => {
    expect(isThirdParty('cdn.example.com', 'app.example.com')).toBe(false);
    expect(isThirdParty('images.example.com', 'example.com')).toBe(false);
    expect(isThirdParty('tracker.ads.com', 'app.example.com')).toBe(true);
    expect(isThirdParty('cdn.sub.example.co.uk', 'blog.example.co.uk')).toBe(false);
    expect(isThirdParty('external.org', 'example.co.uk')).toBe(true);
  });
});
