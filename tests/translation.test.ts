import { describe, it, expect } from 'vitest';
import { detectLanguage, isRTL } from '../src/translation/language-detector';
import { TranslationManager, chunkText } from '../src/translation/translation-manager';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Translation Engine & Language Detector', () => {
  it('detects language and text direction correctly', () => {
    expect(detectLanguage('', 'fr').lang).toBe('fr');
    expect(detectLanguage('', 'fr').isRTL).toBe(false);

    const arabicDetect = detectLanguage('مرحبا بكم في موقعنا الجديد', 'auto');
    expect(arabicDetect.lang).toBe('ar');
    expect(arabicDetect.isRTL).toBe(true);

    const frenchDetect = detectLanguage('Bonjour le monde, ceci est un test magnifique.', 'auto');
    expect(frenchDetect.lang).toBe('fr');
    expect(frenchDetect.isRTL).toBe(false);

    expect(isRTL('ar')).toBe(true);
    expect(isRTL('he')).toBe(true);
    expect(isRTL('en')).toBe(false);
  });

  it('splits long text into bounded chunks respecting sentences', () => {
    const text = 'Sentence one. Sentence two. Sentence three. Sentence four.';
    const chunks = chunkText(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(text);
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

  it('handles cancellation using AbortSignal', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    const controller = new AbortController();
    controller.abort();

    await expect(manager.translateText('Cancelled text', 'en', 'es', controller.signal)).rejects.toThrow(
      'Translation aborted'
    );
  });
});
