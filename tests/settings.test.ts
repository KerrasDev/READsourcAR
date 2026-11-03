import { describe, it, expect } from 'vitest';
import { validateAndMigrateSettings, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Settings Validation & Migration', () => {
  it('returns default settings when input is empty or invalid', () => {
    const res = validateAndMigrateSettings(null);
    expect(res.version).toBe(1);
    expect(res.globalProtectionEnabled).toBe(true);
    expect(res.resourcePolicies.thirdPartyScript.enabled).toBe(true);
  });

  it('preserves valid user settings without dropping values', () => {
    const input = {
      globalProtectionEnabled: false,
      resourcePolicies: {
        image: { enabled: true, action: 'block' }
      },
      siteExceptions: {
        'news.com': { domain: 'news.com', paused: true }
      },
      translation: {
        mode: 'selective',
        targetLang: 'ar'
      }
    };

    const res = validateAndMigrateSettings(input);
    expect(res.globalProtectionEnabled).toBe(false);
    expect(res.resourcePolicies.image.enabled).toBe(true);
    expect(res.siteExceptions['news.com'].paused).toBe(true);
    expect(res.translation.mode).toBe('selective');
    expect(res.translation.targetLang).toBe('ar');
  });

  it('clamps numerical limits to safe boundaries', () => {
    const input = {
      translation: {
        maxCacheEntries: 100000,
        concurrencyLimit: 20
      }
    };

    const res = validateAndMigrateSettings(input);
    expect(res.translation.maxCacheEntries).toBe(2000); // Clamped
    expect(res.translation.concurrencyLimit).toBe(5); // Clamped
  });
});
