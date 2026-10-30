// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { translateElement, restoreOriginalText } from '../src/content/content-script';
import { MockTranslationProvider } from '../src/translation/provider';
import { ExtensionBrowser } from '../src/shared/browser';

describe('Integration & Extension Behavior Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="arabic-container">
        <p>This is test content for Arabic translation.</p>
      </div>
    `;
  });

  it('sets dir="rtl" attribute when translating to Arabic', async () => {
    const container = document.getElementById('arabic-container')!;
    await translateElement(container, 'ar');

    expect(container.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('p')!.textContent).toBe('[AR] This is test content for Arabic translation.');
  });

  it('handles provider cancellation via AbortSignal', async () => {
    const provider = new MockTranslationProvider();
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.translate({
        text: 'Sample',
        sourceLang: 'en',
        targetLang: 'fr',
        signal: controller.signal
      })
    ).rejects.toThrow('Translation aborted');
  });

  it('safely falls back when browser Extension API is not present', () => {
    expect(ExtensionBrowser.isAvailable()).toBe(false);
  });
});
