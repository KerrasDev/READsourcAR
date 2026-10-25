import { describe, it, expect } from 'vitest';
import { compileSettingsToDNRRules } from '../src/rules/rule-compiler';
import { validateAndMigrateSettings, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('DNR Rule Compilation & Precedence', () => {
  it('generates rules for default settings', () => {
    const settings = validateAndMigrateSettings(null);
    const rules = compileSettingsToDNRRules(settings);

    // Default policy enables thirdPartyScript blocking & popup blocking
    expect(rules.length).toBeGreaterThan(0);
    const scriptRule = rules.find((r) => r.condition.domainType === 'thirdParty');
    expect(scriptRule).toBeDefined();
    expect(scriptRule?.action.type).toBe('block');
  });

  it('respects global protection toggle', () => {
    const settings = validateAndMigrateSettings(null);
    settings.globalProtectionEnabled = false;
    const rules = compileSettingsToDNRRules(settings);
    expect(rules.length).toBe(0);
  });

  it('gives priority 1000 to paused domain exceptions', () => {
    const settings = validateAndMigrateSettings(null);
    settings.siteExceptions['example.org'] = { domain: 'example.org', paused: true };

    const rules = compileSettingsToDNRRules(settings);
    const pausedRule = rules.find((r) => r.priority === 1000);
    expect(pausedRule).toBeDefined();
    expect(pausedRule?.action.type).toBe('allow');
    expect(pausedRule?.condition.initiatorDomains).toContain('example.org');
  });

  it('compiles custom rules with appropriate priorities', () => {
    const settings = validateAndMigrateSettings(null);
    settings.customRules = [
      { id: '1', pattern: 'ads.com', action: 'block', createdAt: Date.now() },
      { id: '2', pattern: 'trusted.com', action: 'allow', siteScope: 'example.org', createdAt: Date.now() }
    ];

    const rules = compileSettingsToDNRRules(settings);
    const siteRule = rules.find((r) => r.condition.initiatorDomains?.includes('example.org'));
    expect(siteRule).toBeDefined();
    expect(siteRule?.priority).toBe(210); // Site-scoped allow priority
  });

  it('enforces maximum rule limit against chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES', () => {
    // Mock chrome.declarativeNetRequest
    (globalThis as any).chrome = {
      declarativeNetRequest: {
        MAX_NUMBER_OF_DYNAMIC_RULES: 5
      }
    };

    const settings = validateAndMigrateSettings(null);
    settings.customRules = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`,
      pattern: `ad${i}.com`,
      action: 'block',
      createdAt: Date.now()
    }));

    const rules = compileSettingsToDNRRules(settings);
    expect(rules.length).toBe(5);

    // Clean up mock
    delete (globalThis as any).chrome;
  });
});
