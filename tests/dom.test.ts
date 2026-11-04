// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { translateElement, restoreOriginalText } from '../src/content/content-script';
import { StorageManager, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('DOM Translation & Node Restoration', () => {
  beforeEach(async () => {
    await StorageManager.saveSettings(DEFAULT_SETTINGS);
    document.body.innerHTML = `
      <div id="test-container">
        <h1>Welcome Page</h1>
        <p>This is a test paragraph.</p>
        <code>const x = 10;</code>
        <input type="text" value="Input field should not be translated">
      </div>
    `;
  });

  it('translates visible text nodes while preserving code blocks and input fields', async () => {
    const container = document.getElementById('test-container')!;
    await translateElement(container, 'es');

    const h1 = container.querySelector('h1')!;
    const p = container.querySelector('p')!;
    const code = container.querySelector('code')!;
    const input = container.querySelector('input')!;

    expect(h1.textContent).toBe('[ES] Welcome Page');
    expect(p.textContent).toBe('[ES] This is a test paragraph.');
    expect(code.textContent).toBe('const x = 10;'); // Preserved
    expect(input.value).toBe('Input field should not be translated'); // Preserved
  });

  it('sets dir="rtl" for Arabic translation and restores clean direction', async () => {
    const container = document.getElementById('test-container')!;
    await translateElement(container, 'ar');

    expect(container.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('h1')!.textContent).toBe('[AR] Welcome Page');

    restoreOriginalText(container);
    expect(container.hasAttribute('dir')).toBe(false);
    expect(container.querySelector('h1')!.textContent).toBe('Welcome Page');
  });

  it('throws consent error when custom_api is selected without user consent', async () => {
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    settings.translation.provider.type = 'custom_api';
    settings.privacy.sendPageContentConsent = false;
    await StorageManager.saveSettings(settings);

    const container = document.getElementById('test-container')!;
    await expect(translateElement(container, 'es')).rejects.toThrow('User consent required');
  });

  it('restores original text node values cleanly', async () => {
    const container = document.getElementById('test-container')!;
    await translateElement(container, 'es');

    expect(container.querySelector('h1')!.textContent).toBe('[ES] Welcome Page');

    restoreOriginalText(container);

    expect(container.querySelector('h1')!.textContent).toBe('Welcome Page');
    expect(container.querySelector('p')!.textContent).toBe('This is a test paragraph.');
  });
});
