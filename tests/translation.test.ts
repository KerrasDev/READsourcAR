import { describe, it, expect, beforeEach } from 'vitest';
import { detectLanguage } from '../src/translation/language-detector';
import { TranslationManager } from '../src/translation/translation-manager';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Translation Engine & Language Detector', () => {
  it('detects language correctly based on text heuristics and doc lang', () => {
    expect(detectLanguage('', 'fr').lang).toBe('fr');
    expect(detectLanguage('مرحبا بكم في الموقع', 'auto').lang).toBe('ar');
    expect(detectLanguage('Bonjour le monde', 'auto').lang).toBe('fr');
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
});
