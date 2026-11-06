import { describe, it, expect } from 'vitest';
import {
  compileSettingsToDNRRulesDetailed,
  compileSettingsToDNRRules,
  MAX_SAFE_DYNAMIC_RULES
} from '../src/rules/rule-compiler';
import { validateAndMigrateSettings } from '../src/shared/settings';
import { CustomRule } from '../src/shared/types';

describe('DNR Rule Compilation & 6-Tier Precedence Engine', () => {
  it('generates rules for default settings with internal extension safety rule (Tier 1)', () => {
    const settings = validateAndMigrateSettings(null);
    const result = compileSettingsToDNRRulesDetailed(settings);

    expect(result.rules.length).toBeGreaterThan(0);
    // Safety rule
    const safetyRule = result.rules.find((r) => r.priority === 5000);
    expect(safetyRule).toBeDefined();
    expect(safetyRule?.action.type).toBe('allow');

    // Default policy enables thirdPartyScript blocking
    const scriptRule = result.rules.find((r) => r.condition.domainType === 'thirdParty');
    expect(scriptRule).toBeDefined();
    expect(scriptRule?.action.type).toBe('block');
  });

  it('respects global protection toggle', () => {
    const settings = validateAndMigrateSettings(null);
    settings.globalProtectionEnabled = false;
    const rules = compileSettingsToDNRRules(settings);
    expect(rules.length).toBe(0);
  });

  it('gives priority 1000 to paused domain exceptions (Tier 2)', () => {
    const settings = validateAndMigrateSettings(null);
    settings.siteExceptions['example.org'] = { domain: 'example.org', paused: true };

    const rules = compileSettingsToDNRRules(settings);
    const pausedRule = rules.find((r) => r.priority === 1000);
    expect(pausedRule).toBeDefined();
    expect(pausedRule?.action.type).toBe('allow');
    expect(pausedRule?.condition.initiatorDomains).toContain('example.org');
  });

  it('compiles custom rules with appropriate priorities (Tier 2/3)', () => {
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

  it('caps dynamic rules at MAX_SAFE_DYNAMIC_RULES and generates warning when limit exceeded', () => {
    const settings = validateAndMigrateSettings(null);
    const largeRules: CustomRule[] = [];
    for (let i = 0; i < MAX_SAFE_DYNAMIC_RULES + 100; i++) {
      largeRules.push({
        id: `r_${i}`,
        pattern: `badsite${i}.com`,
        action: 'block',
        createdAt: Date.now()
      });
    }
    settings.customRules = largeRules;

    const result = compileSettingsToDNRRulesDetailed(settings);
    expect(result.limitExceeded).toBe(true);
    expect(result.rules.length).toBe(MAX_SAFE_DYNAMIC_RULES);
    expect(result.warnings.length).toBeGreaterThan(0);
    // Ensure highest priority safety rule is preserved
    expect(result.rules[0].priority).toBe(5000);
  });
});
