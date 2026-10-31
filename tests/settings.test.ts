import { describe, it, expect, beforeEach } from 'vitest';
import { validateAndMigrateSettings, DEFAULT_SETTINGS, StorageManager } from '../src/shared/settings';

describe('Settings Validation, Schema Migration & Privacy Sanitization', () => {
  it('returns valid default settings when passed null or invalid input', () => {
    const s1 = validateAndMigrateSettings(null);
    expect(s1.version).toBe(1);
    expect(s1.globalProtectionEnabled).toBe(true);
    expect(s1.resourcePolicies.thirdPartyScript.enabled).toBe(true);

    const s2 = validateAndMigrateSettings('corrupted string');
    expect(s2.version).toBe(1);
    expect(s2.globalProtectionEnabled).toBe(true);
  });

  it('safely merges partial or outdated settings without discarding valid fields', () => {
    const input = {
      globalProtectionEnabled: false,
      resourcePolicies: {
        image: { enabled: true, action: 'block' }
      },
      siteExceptions: {
        'mysite.org': { domain: 'mysite.org', paused: true }
      },
      translation: {
        targetLang: 'ar',
        concurrencyLimit: 2
      }
    };

    const migrated = validateAndMigrateSettings(input);
    expect(migrated.globalProtectionEnabled).toBe(false);
    expect(migrated.resourcePolicies.image.enabled).toBe(true);
    expect(migrated.resourcePolicies.thirdPartyScript.enabled).toBe(true); // Retains default
    expect(migrated.siteExceptions['mysite.org'].paused).toBe(true);
    expect(migrated.translation.targetLang).toBe('ar');
    expect(migrated.translation.concurrencyLimit).toBe(2);
  });

  it('sanitizes and bounds numerical settings', () => {
    const input = {
      translation: {
        maxCacheEntries: 999999,
        concurrencyLimit: 99
      }
    };

    const migrated = validateAndMigrateSettings(input);
    // Should be clamped to safe maximums
    expect(migrated.translation.maxCacheEntries).toBeLessThanOrEqual(2000);
    expect(migrated.translation.concurrencyLimit).toBeLessThanOrEqual(5);
  });

  it('filters out malformed custom rules', () => {
    const input = {
      customRules: [
        { id: 'valid-1', pattern: 'tracker.com', action: 'block' },
        { id: 123, pattern: null }, // Malformed
        null,
        'string-rule'
      ]
    };

    const migrated = validateAndMigrateSettings(input);
    expect(migrated.customRules.length).toBe(1);
    expect(migrated.customRules[0].id).toBe('valid-1');
  });

  it('persists and retrieves settings via StorageManager', async () => {
    const testSettings = validateAndMigrateSettings(null);
    testSettings.translation.targetLang = 'fr';
    await StorageManager.saveSettings(testSettings);

    const retrieved = await StorageManager.getSettings();
    expect(retrieved.translation.targetLang).toBe('fr');
  });
});
