import { describe, it, expect } from 'vitest';
import {
  compileSettingsToDNRRules,
  compileSettingsWithDiagnostics,
  MAX_SAFE_DYNAMIC_RULES
} from '../src/rules/rule-compiler';
import { validateAndMigrateSettings, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('DNR Rule Compilation & Precedence', () => {
  it('generates rules for default settings with excluded schemes', () => {
    const settings = validateAndMigrateSettings(null);
    const rules = compileSettingsToDNRRules(settings);

    // Default policy enables thirdPartyScript blocking
    expect(rules.length).toBeGreaterThan(0);
    const scriptRule = rules.find((r) => r.condition.domainType === 'thirdParty');
    expect(scriptRule).toBeDefined();
    expect(scriptRule?.action.type).toBe('block');
    expect(scriptRule?.condition.excludedSchemes).toContain('chrome-extension');
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

  it('bounds dynamic rules and produces warning when MAX_SAFE_DYNAMIC_RULES is reached', () => {
    const settings = validateAndMigrateSettings(null);
    // Create rules exceeding MAX_SAFE_DYNAMIC_RULES
    const excessiveRules = [];
    for (let i = 0; i < MAX_SAFE_DYNAMIC_RULES + 50; i++) {
      excessiveRules.push({
        id: `rule-${i}`,
        pattern: `tracker${i}.adnetwork.com`,
        action: 'block' as const,
        createdAt: Date.now()
      });
    }
    settings.customRules = excessiveRules;

    const diag = compileSettingsWithDiagnostics(settings);
    expect(diag.rules.length).toBe(MAX_SAFE_DYNAMIC_RULES);
    expect(diag.warning).toBeDefined();
    expect(diag.warning).toContain(`Maximum safe DNR rule count (${MAX_SAFE_DYNAMIC_RULES}) reached`);
  });
});
