import { describe, it, expect } from 'vitest';
import { detectLanguage, isRTL } from '../src/translation/language-detector';
import { TranslationManager, chunkText, ConcurrencyLimiter } from '../src/translation/translation-manager';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Translation Engine & Language Detector', () => {
  it('detects language correctly based on text heuristics, doc lang, and meta tags', () => {
    // Declared docLang
    expect(detectLanguage('', 'fr').lang).toBe('fr');
    expect(detectLanguage('', 'ar').isRTL).toBe(true);
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('he')).toBe(true);
    expect(isRTL('en')).toBe(false);

    // Meta header language
    expect(detectLanguage('', undefined, 'es').lang).toBe('es');

    // Heuristics: Arabic script
    const arDetect = detectLanguage('مرحبا بكم في هذا الموقع الجديد', 'auto');
    expect(arDetect.lang).toBe('ar');
    expect(arDetect.isRTL).toBe(true);

    // Heuristics: Hebrew script
    const heDetect = detectLanguage('שלום עולם מה שלומך היום', 'auto');
    expect(heDetect.lang).toBe('he');
    expect(heDetect.isRTL).toBe(true);

    // Heuristics: French
    expect(detectLanguage('Bonjour tout le monde, bienvenue ici.', 'auto').lang).toBe('fr');

    // Heuristics: Russian Cyrillic
    expect(detectLanguage('Привет мир как поживаешь', 'auto').lang).toBe('ru');
  });

  it('deduplicates and caches translation requests', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);

    const res1 = await manager.translateText('Hello world', 'en', 'es');
    expect(res1.translatedText).toBe('[ES] Hello world');

    // Second call should return cached response instantly
    const res2 = await manager.translateText('Hello world', 'en', 'es');
    expect(res2.translatedText).toBe('[ES] Hello world');
    expect(manager.getCacheSize()).toBe(1);
  });

  it('evicts oldest cache entries when max cache limit is reached', async () => {
    const settings = { ...DEFAULT_SETTINGS.translation, maxCacheEntries: 2 };
    const manager = new TranslationManager(settings);

    await manager.translateText('Text 1', 'en', 'es');
    await manager.translateText('Text 2', 'en', 'es');
    expect(manager.getCacheSize()).toBe(2);

    await manager.translateText('Text 3', 'en', 'es');
    expect(manager.getCacheSize()).toBe(2);
  });

  it('splits long text into bounded chunks and translates them seamlessly', async () => {
    const sample = 'First sentence here. Second sentence here! Third sentence here? Fourth sentence.';
    const chunks = chunkText(sample, 25);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(25);
    }

    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    const longText = 'Paragraph one. ' + 'A'.repeat(500) + '. \n\nParagraph two. ' + 'B'.repeat(500) + '.';
    const result = await manager.translateText(longText, 'en', 'fr');
    expect(result.translatedText).toContain('[FR]');
  });

  it('supports cancellation via AbortSignal without caching aborted work', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    const controller = new AbortController();

    // Abort immediately
    controller.abort();

    await expect(
      manager.translateText('Will be cancelled', 'en', 'es', controller.signal)
    ).rejects.toThrow('Translation aborted');

    expect(manager.getCacheSize()).toBe(0);
  });

  it('limits concurrency using ConcurrencyLimiter', async () => {
    const limiter = new ConcurrencyLimiter(1);
    let active = 0;
    let maxObservedActive = 0;

    const task = async () => {
      return limiter.run(async () => {
        active++;
        maxObservedActive = Math.max(maxObservedActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active--;
      });
    };

    await Promise.all([task(), task(), task()]);
    expect(maxObservedActive).toBe(1);
  });

  it('enforces privacy consent check for external custom API translations', async () => {
    const customApiSettings = {
      ...DEFAULT_SETTINGS.translation,
      provider: {
        type: 'custom_api' as const,
        endpoint: 'https://example.com/api'
      }
    };

    // Consent not given
    const managerNoConsent = new TranslationManager(customApiSettings, {
      collectStats: true,
      clearStatsOnRestart: false,
      sendPageContentConsent: false
    });

    await expect(
      managerNoConsent.translateText('Sensitive text', 'en', 'es')
    ).rejects.toThrow('Privacy consent required');

    // Consent given
    const managerWithConsent = new TranslationManager(customApiSettings, {
      collectStats: true,
      clearStatsOnRestart: false,
      sendPageContentConsent: true
    });

    // Mock fetch for custom API
    global.fetch = async () =>
      new Response(JSON.stringify({ translatedText: 'Texto traducido', detectedSourceLang: 'en' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    const res = await managerWithConsent.translateText('Sensitive text', 'en', 'es');
    expect(res.translatedText).toBe('Texto traducido');
  });
});
