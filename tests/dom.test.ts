// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { translateElement, restoreOriginalText } from '../src/content/content-script';

describe('DOM Translation & Node Restoration', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="test-container">
        <h1>Welcome Page</h1>
        <p>This is a test paragraph.</p>
        <code>const x = 10;</code>
        <pre><code>function test() {}</code></pre>
        <input type="text" value="Input field should not be translated">
        <textarea>Textarea content should not be translated</textarea>
        <span translate="no">Do not translate me</span>
        <div data-no-translate="true">Ignored content</div>
      </div>
    `;
  });

  it('translates visible text nodes while preserving code blocks, inputs, and no-translate flags', async () => {
    const container = document.getElementById('test-container')!;
    await translateElement(container, 'es');

    const h1 = container.querySelector('h1')!;
    const p = container.querySelector('p')!;
    const code = container.querySelector('code')!;
    const pre = container.querySelector('pre')!;
    const input = container.querySelector('input')!;
    const textarea = container.querySelector('textarea')!;
    const noTranslate = container.querySelector('[translate="no"]')!;
    const dataNoTranslate = container.querySelector('[data-no-translate]')!;

    expect(h1.textContent).toBe('[ES] Welcome Page');
    expect(p.textContent).toBe('[ES] This is a test paragraph.');
    expect(code.textContent).toBe('const x = 10;'); // Preserved
    expect(pre.textContent).toContain('function test() {}'); // Preserved
    expect(input.value).toBe('Input field should not be translated'); // Preserved
    expect(textarea.value).toBe('Textarea content should not be translated'); // Preserved
    expect(noTranslate.textContent).toBe('Do not translate me'); // Preserved
    expect(dataNoTranslate.textContent).toBe('Ignored content'); // Preserved
  });

  it('sets dir="rtl" for Arabic target language and restores original direction', async () => {
    const container = document.getElementById('test-container')!;
    expect(container.getAttribute('dir')).toBeNull();

    await translateElement(container, 'ar');
    expect(container.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('h1')!.textContent).toBe('[AR] Welcome Page');

    restoreOriginalText(container);
    expect(container.getAttribute('dir')).toBeNull();
    expect(container.querySelector('h1')!.textContent).toBe('Welcome Page');
  });

  it('restores original text node values cleanly without residual mutations', async () => {
    const container = document.getElementById('test-container')!;
    await translateElement(container, 'es');

    expect(container.querySelector('h1')!.textContent).toBe('[ES] Welcome Page');

    restoreOriginalText(container);

    expect(container.querySelector('h1')!.textContent).toBe('Welcome Page');
    expect(container.querySelector('p')!.textContent).toBe('This is a test paragraph.');
  });
});
