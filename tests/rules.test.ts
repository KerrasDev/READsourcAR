import { describe, it, expect } from 'vitest';
import { compileSettingsToDNRRules, compileSettingsWithTelemetry, MAX_SAFE_DYNAMIC_RULES } from '../src/rules/rule-compiler';
import { validateAndMigrateSettings, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('DNR Rule Compilation & 6-Tier Precedence Model', () => {
  it('generates rules for default settings including safety constraints and third-party script blocking', () => {
    const settings = validateAndMigrateSettings(null);
    const rules = compileSettingsToDNRRules(settings);

    expect(rules.length).toBeGreaterThan(0);

    // Tier 1 safety constraints present
    const safetyRule = rules.find((r) => r.condition.urlFilter === 'chrome-extension:*');
    expect(safetyRule).toBeDefined();
    expect(safetyRule?.priority).toBe(2000);
    expect(safetyRule?.action.type).toBe('allow');

    // Tier 5 global category policy (third-party script blocking)
    const scriptRule = rules.find((r) => r.condition.domainType === 'thirdParty');
    expect(scriptRule).toBeDefined();
    expect(scriptRule?.action.type).toBe('block');
    expect(scriptRule?.priority).toBe(100);
  });

  it('respects global protection toggle', () => {
    const settings = validateAndMigrateSettings(null);
    settings.globalProtectionEnabled = false;
    const rules = compileSettingsToDNRRules(settings);
    expect(rules.length).toBe(0);
  });

  it('gives priority 1600 (Tier 2 User Allow) to paused domain exceptions', () => {
    const settings = validateAndMigrateSettings(null);
    settings.siteExceptions['example.org'] = { domain: 'example.org', paused: true };

    const rules = compileSettingsToDNRRules(settings);
    const pausedRule = rules.find((r) => r.priority === 1600);
    expect(pausedRule).toBeDefined();
    expect(pausedRule?.action.type).toBe('allow');
    expect(pausedRule?.condition.initiatorDomains).toContain('example.org');
  });

  it('compiles user custom rules with strict precedence (Tier 2 allow > Tier 3 block)', () => {
    const settings = validateAndMigrateSettings(null);
    settings.customRules = [
      { id: '1', pattern: 'ads.com', action: 'block', createdAt: Date.now() },
      { id: '2', pattern: 'tracker.com', action: 'block', siteScope: 'example.org', createdAt: Date.now() },
      { id: '3', pattern: 'trusted.com', action: 'allow', siteScope: 'example.org', createdAt: Date.now() },
      { id: '4', pattern: 'cdn.global.com', action: 'allow', createdAt: Date.now() }
    ];

    const rules = compileSettingsToDNRRules(settings);

    const siteScopedAllow = rules.find((r) => r.condition.initiatorDomains?.includes('example.org') && r.action.type === 'allow');
    expect(siteScopedAllow?.priority).toBe(1550);

    const globalAllow = rules.find((r) => r.condition.urlFilter === '*cdn.global.com*' && r.action.type === 'allow');
    expect(globalAllow?.priority).toBe(1500);

    const siteScopedBlock = rules.find((r) => r.condition.initiatorDomains?.includes('example.org') && r.action.type === 'block');
    expect(siteScopedBlock?.priority).toBe(1050);

    const globalBlock = rules.find((r) => r.condition.urlFilter === '*ads.com*' && r.action.type === 'block');
    expect(globalBlock?.priority).toBe(1000);
  });

  it('compiles site-specific category overrides (Tier 4)', () => {
    const settings = validateAndMigrateSettings(null);
    settings.siteExceptions['special.com'] = {
      domain: 'special.com',
      paused: false,
      categoryOverrides: {
        image: 'block',
        thirdPartyScript: 'allow'
      }
    };

    const rules = compileSettingsToDNRRules(settings);
    const siteScriptAllow = rules.find((r) => r.condition.initiatorDomains?.includes('special.com') && r.condition.domainType === 'thirdParty');
    expect(siteScriptAllow).toBeDefined();
    expect(siteScriptAllow?.action.type).toBe('allow');
    expect(siteScriptAllow?.priority).toBe(550);

    const siteImageBlock = rules.find((r) => r.condition.initiatorDomains?.includes('special.com') && r.condition.resourceTypes?.includes('image'));
    expect(siteImageBlock).toBeDefined();
    expect(siteImageBlock?.action.type).toBe('block');
    expect(siteImageBlock?.priority).toBe(500);
  });

  it('handles dynamic rule limits safely without discarding higher-priority rules', () => {
    const settings = validateAndMigrateSettings(null);
    // Create excessive number of custom rules
    const extraRules = [];
    for (let i = 0; i < 5100; i++) {
      extraRules.push({
        id: `rule-${i}`,
        pattern: `badsite${i}.com`,
        action: 'block' as const,
        createdAt: Date.now()
      });
    }
    settings.customRules = extraRules;

    const result = compileSettingsWithTelemetry(settings);
    expect(result.rules.length).toBe(MAX_SAFE_DYNAMIC_RULES);
    expect(result.totalCompiled).toBeGreaterThan(MAX_SAFE_DYNAMIC_RULES);
    expect(result.totalTruncated).toBeGreaterThan(0);
    expect(result.warning).toContain('Rule limit reached');

    // Verify continuous 1-based sequential IDs required by Chrome DNR
    expect(result.rules[0].id).toBe(1);
    expect(result.rules[result.rules.length - 1].id).toBe(MAX_SAFE_DYNAMIC_RULES);

    // Verify top priority safety rules were retained
    expect(result.rules[0].priority).toBe(2000);
  });
});
