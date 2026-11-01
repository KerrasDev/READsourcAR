import { describe, it, expect } from 'vitest';
import { validateAndMigrateSettings, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Settings Validation & Migration', () => {
  it('returns default settings when given null or empty object', () => {
    const s1 = validateAndMigrateSettings(null);
    expect(s1.globalProtectionEnabled).toBe(true);
    expect(s1.version).toBe(1);

    const s2 = validateAndMigrateSettings({});
    expect(s2.resourcePolicies.thirdPartyScript.enabled).toBe(true);
  });

  it('safely handles corrupted or invalid fields without crashing', () => {
    const corrupted = {
      globalProtectionEnabled: 'not-a-bool',
      resourcePolicies: {
        thirdPartyScript: { enabled: 'invalid', action: 'unknown' }
      },
      customRules: 'not-an-array',
      translation: {
        maxCacheEntries: -50,
        concurrencyLimit: 9999
      }
    };

    const migrated = validateAndMigrateSettings(corrupted);
    // Invalid types should fallback to default values safely
    expect(migrated.globalProtectionEnabled).toBe(true);
    expect(migrated.resourcePolicies.thirdPartyScript.enabled).toBe(true);
    expect(migrated.resourcePolicies.thirdPartyScript.action).toBe('block');
    expect(Array.isArray(migrated.customRules)).toBe(true);
    expect(migrated.translation.concurrencyLimit).toBeLessThanOrEqual(5);
  });
});
