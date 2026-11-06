// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { translateElement, restoreOriginalText, getTranslatableTextNodes } from '../src/content/content-script';

describe('DOM Translation & Directionality Handling', () => {
  beforeEach(() => {
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
    const res = await translateElement(container, 'es');

    expect(res.translatedCount).toBe(2);
    expect(res.cancelled).toBe(false);

    const h1 = container.querySelector('h1')!;
    const p = container.querySelector('p')!;
    const code = container.querySelector('code')!;
    const input = container.querySelector('input')!;

    expect(h1.textContent).toBe('[ES] Welcome Page');
    expect(p.textContent).toBe('[ES] This is a test paragraph.');
    expect(code.textContent).toBe('const x = 10;'); // Preserved
    expect(input.value).toBe('Input field should not be translated'); // Preserved
  });

  it('sets dir="rtl" for Arabic target language and restores direction on restoreOriginalText', async () => {
    const container = document.getElementById('test-container')!;
    await translateElement(container, 'ar');

    expect(container.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('h1')!.textContent).toBe('[AR] Welcome Page');

    restoreOriginalText(container);

    expect(container.getAttribute('dir')).toBeNull();
    expect(container.querySelector('h1')!.textContent).toBe('Welcome Page');
    expect(container.querySelector('p')!.textContent).toBe('This is a test paragraph.');
  });

  it('handles cancellation gracefully via AbortSignal', async () => {
    const container = document.getElementById('test-container')!;
    const controller = new AbortController();
    controller.abort();

    const res = await translateElement(container, 'es', controller.signal);
    expect(res.cancelled).toBe(true);
  });
});
