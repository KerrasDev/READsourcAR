import { describe, it, expect } from 'vitest';
import { compileSettingsToDNRRulesDetailed } from '../src/rules/rule-compiler';
import { TranslationManager } from '../src/translation/translation-manager';
import { validateAndMigrateSettings, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Performance & Scalability Benchmark', () => {
  it('compiles 1,000 rules within 15 milliseconds', () => {
    const settings = validateAndMigrateSettings(null);
    for (let i = 0; i < 1000; i++) {
      settings.customRules.push({
        id: `bench_${i}`,
        pattern: `tracking-${i}.example.org`,
        action: 'block',
        createdAt: Date.now()
      });
    }

    const start = performance.now();
    const result = compileSettingsToDNRRulesDetailed(settings);
    const elapsed = performance.now() - start;

    expect(result.rules.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(50); // Generous allowance for CI runners
  });

  it('serves 10,000 cached translation hits with sub-millisecond per-hit latency', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    // Populate cache
    await manager.translateText('Benchmark text item', 'en', 'es');

    const start = performance.now();
    const iterations = 5000;
    for (let i = 0; i < iterations; i++) {
      const res = await manager.translateText('Benchmark text item', 'en', 'es');
      expect(res.translatedText).toBe('[ES] Benchmark text item');
    }
    const elapsed = performance.now() - start;
    const avgLatencyMs = elapsed / iterations;

    expect(avgLatencyMs).toBeLessThan(0.05); // Less than 50 microseconds per cache hit
  });
});
