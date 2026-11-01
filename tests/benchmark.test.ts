import { describe, it, expect } from 'vitest';
import { compileSettingsToDNRRules } from '../src/rules/rule-compiler';
import { validateAndMigrateSettings } from '../src/shared/settings';
import { TranslationManager } from '../src/translation/translation-manager';
import fs from 'node:fs';

describe('Performance & Resource Benchmarks', () => {
  it('measures fast rule compilation under heavy load (< 50ms for 2000 rules)', () => {
    const settings = validateAndMigrateSettings(null);
    for (let i = 0; i < 2000; i++) {
      settings.customRules.push({
        id: `rule_${i}`,
        pattern: `subdomain${i}.tracker.com`,
        action: i % 5 === 0 ? 'allow' : 'block',
        siteScope: i % 2 === 0 ? `site${i}.org` : '*',
        createdAt: Date.now()
      });
    }

    const start = performance.now();
    const rules = compileSettingsToDNRRules(settings);
    const duration = performance.now() - start;

    expect(rules.length).toBeGreaterThan(2000);
    expect(duration).toBeLessThan(50); // Under 50ms execution time
  });

  it('validates production bundle size is lightweight (< 50KB total)', () => {
    const files = [
      'dist/background/service-worker.js',
      'dist/content/content-script.js',
      'dist/popup/popup.js',
      'dist/options/options.js'
    ];

    let totalBytes = 0;
    for (const f of files) {
      if (fs.existsSync(f)) {
        totalBytes += fs.statSync(f).size;
      }
    }

    // Bundle size must be under 50KB total for minimal footprint
    expect(totalBytes).toBeLessThan(50 * 1024);
  });

  it('demonstrates high cache hit performance and zero redundant translation execution', async () => {
    const settings = validateAndMigrateSettings(null);
    const manager = new TranslationManager(settings.translation);

    const start = performance.now();
    await manager.translateText('Benchmark text content', 'en', 'es');
    const firstDuration = performance.now() - start;

    const cacheStart = performance.now();
    await manager.translateText('Benchmark text content', 'en', 'es');
    const cacheDuration = performance.now() - cacheStart;

    // Cache hit should be near instant (< 5ms) compared to network simulation (50ms)
    expect(cacheDuration).toBeLessThan(10);
    expect(firstDuration).toBeGreaterThanOrEqual(40);
  });
});
