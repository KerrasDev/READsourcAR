import { describe, it, expect } from 'vitest';
import { detectLanguage, isRTL } from '../src/translation/language-detector';
import { TranslationManager, chunkText, MAX_CHUNK_LENGTH } from '../src/translation/translation-manager';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Translation Engine & Language Detector', () => {
  it('detects language and text direction (RTL/LTR) correctly', () => {
    expect(detectLanguage('', 'fr').lang).toBe('fr');
    expect(detectLanguage('مرحبا بكم في الموقع', 'auto').lang).toBe('ar');
    expect(detectLanguage('مرحبا بكم في الموقع', 'auto').isRTL).toBe(true);
    expect(detectLanguage('Bonjour le monde', 'auto').lang).toBe('fr');
    expect(detectLanguage('Bonjour le monde', 'auto').isRTL).toBe(false);

    expect(isRTL('ar')).toBe(true);
    expect(isRTL('he')).toBe(true);
    expect(isRTL('en')).toBe(false);
    expect(isRTL('fr')).toBe(false);
  });

  it('chunks long text into bounded segments under MAX_CHUNK_LENGTH', () => {
    const sentence = 'This is a test sentence that is quite detailed and informative. ';
    const longText = sentence.repeat(30); // ~1920 chars
    expect(longText.length).toBeGreaterThan(MAX_CHUNK_LENGTH);

    const chunks = chunkText(longText, MAX_CHUNK_LENGTH);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_LENGTH);
    }
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

  it('translates chunked text seamlessly', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    const sentence = 'Sentence number one. Sentence number two. Sentence number three. ';
    const longText = sentence.repeat(20);

    const res = await manager.translateText(longText, 'en', 'es');
    expect(res.translatedText).toContain('[ES]');
    expect(res.translatedText.length).toBeGreaterThan(0);
  });

  it('supports cancellation via AbortSignal', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.translateText('Text to abort', 'en', 'es', controller.signal)
    ).rejects.toThrow('Translation aborted');
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
});
