import { describe, it, expect } from 'vitest';
import { compileSettingsToDNRRules, sanitizeUrlPattern, MAX_SAFE_DYNAMIC_RULES } from '../src/rules/rule-compiler';
import { validateAndMigrateSettings, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('DNR Rule Compilation & Precedence', () => {
  it('generates rules for default settings', () => {
    const settings = validateAndMigrateSettings(null);
    const rules = compileSettingsToDNRRules(settings);

    // Default policy enables thirdPartyScript blocking
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

    const globalBlock = rules.find((r) => r.priority === 100);
    expect(globalBlock).toBeDefined();
    expect(globalBlock?.action.type).toBe('block');
  });

  it('sanitizes URL patterns properly', () => {
    expect(sanitizeUrlPattern('tracker.com')).toBe('*tracker.com*');
    expect(sanitizeUrlPattern('*tracker.com*')).toBe('*tracker.com*');
    expect(sanitizeUrlPattern('||example.com^')).toBe('||example.com^');
    expect(sanitizeUrlPattern('')).toBe('*');
  });

  it('caps dynamic rules at MAX_SAFE_DYNAMIC_RULES to prevent quota exhaustion', () => {
    const settings = validateAndMigrateSettings(null);
    const massiveRules = [];
    for (let i = 0; i < 6000; i++) {
      massiveRules.push({
        id: `rule_${i}`,
        pattern: `test${i}.com`,
        action: 'block' as const,
        createdAt: Date.now()
      });
    }
    settings.customRules = massiveRules;

    const compiled = compileSettingsToDNRRules(settings);
    expect(compiled.length).toBeLessThanOrEqual(MAX_SAFE_DYNAMIC_RULES);
  });
});
