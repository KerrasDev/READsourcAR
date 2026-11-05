import { describe, it, expect } from 'vitest';
import { chunkText } from '../src/translation/translation-manager';
import { TranslationManager } from '../src/translation/translation-manager';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Bounded Text Chunking & Abort Cancellation', () => {
  it('does not split text shorter than max chunk length', () => {
    const text = 'Short sentence that fits into one chunk.';
    const chunks = chunkText(text, 800);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits long paragraph on sentence boundaries', () => {
    const sentence1 = 'This is the first sentence of the article. '.repeat(10);
    const sentence2 = 'This is the second long part of the text. '.repeat(10);
    const fullText = `${sentence1} ${sentence2}`;

    const chunks = chunkText(fullText, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(400);
    }
  });

  it('translates large texts using chunking transparently', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    const largeText = 'Hello world! This is a long story. '.repeat(40); // > 1000 chars

    const res = await manager.translateText(largeText, 'en', 'es');
    expect(res.translatedText).toContain('[ES]');
    expect(res.translatedText.length).toBeGreaterThan(0);
  });

  it('aborts translation gracefully when signal is triggered', async () => {
    const manager = new TranslationManager(DEFAULT_SETTINGS.translation);
    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.translateText('Hello world', 'en', 'es', controller.signal)
    ).rejects.toThrow('Translation aborted');
  });
});
