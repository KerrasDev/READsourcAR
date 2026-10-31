import { detectLanguage, isRTL } from '../translation/language-detector';
import { TranslationManager } from '../translation/translation-manager';
import { StorageManager } from '../shared/settings';

let translationManager: TranslationManager | null = null;
const originalNodeValues = new WeakMap<Node, string>();
const originalDirValues = new WeakMap<HTMLElement, string>();

async function getManager(): Promise<TranslationManager> {
  if (!translationManager) {
    const settings = await StorageManager.getSettings();
    translationManager = new TranslationManager(settings.translation, settings.privacy);
  }
  return translationManager;
}

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'code',
  'pre',
  'input',
  'textarea',
  'select',
  'button',
  'svg',
  'canvas',
  'kbd'
]);

/**
 * Extracts visible text nodes safely from a container, strictly skipping
 * non-translatable elements, code blocks, form controls, and editable content.
 */
export function getTranslatableTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (
        parent.isContentEditable ||
        parent.hasAttribute('data-no-translate') ||
        parent.getAttribute('translate') === 'no' ||
        parent.closest('[data-no-translate], [translate="no"], code, pre')
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = node.nodeValue?.trim();
      if (!text || text.length === 0) {
        return NodeFilter.FILTER_SKIP;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walk.nextNode()) {
    textNodes.push(walk.currentNode as Text);
  }

  return textNodes;
}

/**
 * Translates selected DOM element or main content area, preserving code blocks,
 * user inputs, and updating text direction if RTL.
 */
export async function translateElement(element: HTMLElement, targetLang?: string, signal?: AbortSignal): Promise<void> {
  const manager = await getManager();
  const textNodes = getTranslatableTextNodes(element);

  const tgt = targetLang || 'en';
  const shouldSetRTL = isRTL(tgt);

  if (shouldSetRTL) {
    if (!originalDirValues.has(element)) {
      originalDirValues.set(element, element.getAttribute('dir') || '');
    }
    element.setAttribute('dir', 'rtl');
  }

  for (const node of textNodes) {
    if (signal?.aborted) break;

    const originalText = node.nodeValue || '';
    if (!originalNodeValues.has(node)) {
      originalNodeValues.set(node, originalText);
    }

    try {
      const res = await manager.translateText(originalText, 'auto', tgt, signal);
      node.nodeValue = res.translatedText;
    } catch (err) {
      if ((err as Error).message === 'Translation aborted') break;
      console.error('[Resource Guardian] Failed to translate node:', err);
    }
  }
}

/**
 * Restores original text and layout direction for previously translated nodes in element.
 */
export function restoreOriginalText(element: HTMLElement): void {
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const node = walk.currentNode as Text;
    if (originalNodeValues.has(node)) {
      node.nodeValue = originalNodeValues.get(node)!;
    }
  }

  if (originalDirValues.has(element)) {
    const origDir = originalDirValues.get(element);
    if (origDir) {
      element.setAttribute('dir', origDir);
    } else {
      element.removeAttribute('dir');
    }
  }
}

// Event-driven message listener for translation operations
if (typeof chrome !== 'undefined' && chrome.runtime) {
  let activeAbortController: AbortController | null = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DETECT_PAGE_LANGUAGE') {
      const docLang = document.documentElement.lang;
      const metaLangElem = document.querySelector('meta[http-equiv="content-language"], meta[name="language"]') as HTMLMetaElement | null;
      const metaLang = metaLangElem ? metaLangElem.content : undefined;
      const bodyText = document.body ? document.body.innerText.slice(0, 2000) : '';

      const detected = detectLanguage(bodyText, docLang, metaLang);
      sendResponse(detected);
      return true;
    }

    if (message.type === 'CANCEL_TRANSLATION') {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
      sendResponse({ cancelled: true });
      return true;
    }

    if (message.type === 'TRANSLATE_SELECTION') {
      if (activeAbortController) activeAbortController.abort();
      activeAbortController = new AbortController();

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parentElem = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;

        if (parentElem) {
          translateElement(parentElem, message.targetLang, activeAbortController.signal)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;
        }
      }
      sendResponse({ success: false, error: 'No active text selection found on page.' });
      return true;
    }

    if (message.type === 'TRANSLATE_MAIN_CONTENT') {
      if (activeAbortController) activeAbortController.abort();
      activeAbortController = new AbortController();

      const main = document.querySelector('main, article, [role="main"]') || document.body;
      if (main) {
        translateElement(main as HTMLElement, message.targetLang, activeAbortController.signal)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      sendResponse({ success: false, error: 'Main content area not found.' });
      return true;
    }

    if (message.type === 'RESTORE_ORIGINAL') {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
      restoreOriginalText(document.body);
      sendResponse({ success: true });
      return true;
    }
  });
}
