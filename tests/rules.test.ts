import { describe, it, expect } from 'vitest';
import { compileSettingsToDNRRules, compileSettingsToDNRRulesDetailed } from '../src/rules/rule-compiler';
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

  it('compiles custom rules with appropriate precedence priorities', () => {
    const settings = validateAndMigrateSettings(null);
    settings.customRules = [
      { id: '1', pattern: 'global-block.com', action: 'block', createdAt: Date.now() },
      { id: '2', pattern: 'global-allow.com', action: 'allow', createdAt: Date.now() },
      { id: '3', pattern: 'site-block.com', action: 'block', siteScope: 'example.org', createdAt: Date.now() },
      { id: '4', pattern: 'site-allow.com', action: 'allow', siteScope: 'example.org', createdAt: Date.now() }
    ];

    const rules = compileSettingsToDNRRules(settings);

    const siteAllow = rules.find((r) => r.condition.urlFilter?.includes('site-allow.com'));
    const siteBlock = rules.find((r) => r.condition.urlFilter?.includes('site-block.com'));
    const globalAllow = rules.find((r) => r.condition.urlFilter?.includes('global-allow.com'));
    const globalBlock = rules.find((r) => r.condition.urlFilter?.includes('global-block.com'));

    expect(siteAllow?.priority).toBe(300);
    expect(siteBlock?.priority).toBe(200);
    expect(globalAllow?.priority).toBe(150);
    expect(globalBlock?.priority).toBe(100);
  });

  it('handles rule limits and indicates overflow', () => {
    const settings = validateAndMigrateSettings(null);

    // Create 15 custom rules
    settings.customRules = Array.from({ length: 15 }, (_, i) => ({
      id: `rule-${i}`,
      pattern: `tracker-${i}.com`,
      action: 'block',
      createdAt: Date.now()
    }));

    // Limit to max 5 rules
    const result = compileSettingsToDNRRulesDetailed(settings, 5);
    expect(result.overflow).toBe(true);
    expect(result.rules.length).toBe(5);
    expect(result.totalGenerated).toBeGreaterThan(5);
  });
});
