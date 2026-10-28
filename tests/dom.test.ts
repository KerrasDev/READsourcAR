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
    expect(container.getAttribute('dir')).toBe('ltr');
  });

  it('sets dir="rtl" on container when translating to Arabic', async () => {
    const container = document.getElementById('test-container')!;
    await translateElement(container, 'ar');

    expect(container.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('h1')!.textContent).toBe('[AR] Welcome Page');
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
