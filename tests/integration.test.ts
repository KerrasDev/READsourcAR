import { describe, it, expect, beforeEach } from 'vitest';
import { validateAndMigrateSettings, StorageManager, DEFAULT_SETTINGS } from '../src/shared/settings';
import { AppSettings } from '../src/shared/types';
import { compileSettingsToDNRRules } from '../src/rules/rule-compiler';
import { TranslationManager } from '../src/translation/translation-manager';

describe('Integration & Settings Lifecycle', () => {
  it('migrates legacy or corrupted settings objects without data loss', () => {
    const corruptedInput = {
      globalProtectionEnabled: false,
      siteExceptions: {
        'github.com': { domain: 'github.com', paused: true }
      },
      // missing translation, resourcePolicies, version, etc.
    };

    const migrated = validateAndMigrateSettings(corruptedInput);
    expect(migrated.globalProtectionEnabled).toBe(false);
    expect(migrated.siteExceptions['github.com']?.paused).toBe(true);
    expect(migrated.resourcePolicies).toBeDefined();
    expect(migrated.resourcePolicies.script.enabled).toBe(false);
    expect(migrated.translation.mode).toBe('manual');
  });

  it('generates correct DNR rules after settings mutations and site exceptions', () => {
    const settings = validateAndMigrateSettings(null);
    settings.siteExceptions['news.example.com'] = {
      domain: 'news.example.com',
      paused: false,
      categoryOverrides: {
        image: 'block',
        font: 'block'
      }
    };

    const rules = compileSettingsToDNRRules(settings);
    const imageRule = rules.find(
      (r) => r.condition.initiatorDomains?.includes('news.example.com') && r.condition.resourceTypes?.includes('image')
    );
    expect(imageRule).toBeDefined();
    expect(imageRule?.priority).toBe(50);
  });

  it('handles translation cache expiration using TTL properly', async () => {
    // 50ms TTL for testing
    const settings = { ...DEFAULT_SETTINGS.translation, cacheTTLMs: 50 };
    const manager = new TranslationManager(settings);

    await manager.translateText('Temporary text', 'en', 'fr');
    expect(manager.getCacheSize()).toBe(1);

    // Wait past TTL
    await new Promise((resolve) => setTimeout(resolve, 60));

    // After expiration, asking for it again initiates a new translation and updates timestamp
    await manager.translateText('Temporary text', 'en', 'fr');
    expect(manager.getCacheSize()).toBe(1);
  });
});
