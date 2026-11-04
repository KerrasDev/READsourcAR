import { describe, it, expect } from 'vitest';
import {
  compileSettingsToDNRRules,
  compileSettingsWithMetadata,
  DNR_PRIORITIES,
  MAX_SAFE_DYNAMIC_RULES
} from '../src/rules/rule-compiler';
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
    expect(scriptRule?.priority).toBe(DNR_PRIORITIES.GLOBAL_CATEGORY_BLOCK);
  });

  it('respects global protection toggle', () => {
    const settings = validateAndMigrateSettings(null);
    settings.globalProtectionEnabled = false;
    const rules = compileSettingsToDNRRules(settings);
    expect(rules.length).toBe(0);
  });

  it('gives highest priority (1000) to paused domain exceptions', () => {
    const settings = validateAndMigrateSettings(null);
    settings.siteExceptions['example.org'] = { domain: 'example.org', paused: true };

    const rules = compileSettingsToDNRRules(settings);
    const pausedRule = rules.find((r) => r.priority === DNR_PRIORITIES.SAFETY_AND_PAUSED);
    expect(pausedRule).toBeDefined();
    expect(pausedRule?.action.type).toBe('allow');
    expect(pausedRule?.condition.initiatorDomains).toContain('example.org');
  });

  it('compiles custom rules with appropriate priorities and precedence ordering', () => {
    const settings = validateAndMigrateSettings(null);
    settings.customRules = [
      { id: '1', pattern: 'ads.com', action: 'block', createdAt: 100 },
      { id: '2', pattern: 'trusted.com', action: 'allow', siteScope: 'example.org', createdAt: 200 },
      { id: '3', pattern: 'blocked-site.com', action: 'block', siteScope: 'example.org', createdAt: 300 }
    ];

    const rules = compileSettingsToDNRRules(settings);
    const siteAllowRule = rules.find((r) => r.condition.initiatorDomains?.includes('example.org') && r.action.type === 'allow');
    const siteBlockRule = rules.find((r) => r.condition.initiatorDomains?.includes('example.org') && r.action.type === 'block');
    const globalBlockRule = rules.find((r) => !r.condition.initiatorDomains && r.action.type === 'block');

    expect(siteAllowRule?.priority).toBe(DNR_PRIORITIES.USER_SITE_ALLOW);
    expect(siteBlockRule?.priority).toBe(DNR_PRIORITIES.USER_SITE_BLOCK);
    expect(globalBlockRule?.priority).toBe(DNR_PRIORITIES.USER_GLOBAL_BLOCK);

    // Site Allow > Site Block > Global Allow > Global Block
    expect(siteAllowRule!.priority).toBeGreaterThan(siteBlockRule!.priority);
    expect(siteBlockRule!.priority).toBeGreaterThan(globalBlockRule!.priority);
  });

  it('bounds dynamic rules cleanly and sets truncated flag when exceeding max limit', () => {
    const settings = validateAndMigrateSettings(null);
    // Create 15 custom rules with limit set to 5
    settings.customRules = Array.from({ length: 15 }, (_, i) => ({
      id: `rule-${i}`,
      pattern: `tracker${i}.com`,
      action: 'block' as const,
      createdAt: i
    }));

    const result = compileSettingsWithMetadata(settings, 5);
    expect(result.rules.length).toBe(5);
    expect(result.truncated).toBe(true);
    expect(result.maxLimit).toBe(5);
  });
});
