import { detectLanguage, isRTL } from '../translation/language-detector';
import { TranslationManager } from '../translation/translation-manager';
import { StorageManager } from '../shared/settings';

let translationManager: TranslationManager | null = null;
const originalNodeValues = new WeakMap<Node, string>();
const originalElementDirections = new WeakMap<HTMLElement, string>();

let activeAbortController: AbortController | null = null;

async function getManager(): Promise<TranslationManager> {
  if (!translationManager) {
    const settings = await StorageManager.getSettings();
    translationManager = new TranslationManager(settings.translation);
  }
  return translationManager;
}

/**
 * Extracts visible text nodes safely from a container, skipping non-translatable elements.
 */
export function getTranslatableTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName.toLowerCase();
      // Exclude non-content elements, code, input fields, passwords, scripts, styles
      if (['script', 'style', 'noscript', 'code', 'pre', 'input', 'textarea', 'kbd', 'samp'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.isContentEditable || parent.hasAttribute('data-no-translate') || parent.getAttribute('translate') === 'no') {
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
 * Translates selected DOM element or main content area, adjusting direction (RTL/LTR) as needed.
 */
export async function translateElement(element: HTMLElement, targetLang?: string, signal?: AbortSignal): Promise<void> {
  const manager = await getManager();
  const textNodes = getTranslatableTextNodes(element);

  const isTargetRTL = targetLang ? isRTL(targetLang) : false;

  // Track and update direction on parent element if needed
  if (!originalElementDirections.has(element)) {
    originalElementDirections.set(element, element.getAttribute('dir') || '');
  }
  if (isTargetRTL) {
    element.setAttribute('dir', 'rtl');
  }

  for (const node of textNodes) {
    if (signal?.aborted) {
      throw new Error('Translation cancelled by user');
    }

    const originalText = node.nodeValue || '';
    if (!originalNodeValues.has(node)) {
      originalNodeValues.set(node, originalText);
    }

    try {
      const res = await manager.translateText(originalText, 'auto', targetLang, signal);
      node.nodeValue = res.translatedText;
    } catch (err: any) {
      if (err.message === 'Translation cancelled by user' || err.message === 'Translation aborted') {
        throw err;
      }
      console.error('Failed to translate node:', err);
    }
  }
}

/**
 * Restores original text and element directions cleanly.
 */
export function restoreOriginalText(element: HTMLElement): void {
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const node = walk.currentNode as Text;
    if (originalNodeValues.has(node)) {
      node.nodeValue = originalNodeValues.get(node)!;
    }
  }

  // Restore direction
  if (originalElementDirections.has(element)) {
    const origDir = originalElementDirections.get(element);
    if (origDir) {
      element.setAttribute('dir', origDir);
    } else {
      element.removeAttribute('dir');
    }
  }
}

// Cancel any active translation job
export function cancelActiveTranslation(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

// Message Listener for Content Script Tasks
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DETECT_PAGE_LANGUAGE') {
      const docLang = document.documentElement.lang;
      const bodyText = document.body ? document.body.innerText.slice(0, 2000) : '';
      const detected = detectLanguage(bodyText, docLang);
      sendResponse(detected);
      return true;
    }

    if (message.type === 'CANCEL_TRANSLATION') {
      cancelActiveTranslation();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'TRANSLATE_SELECTION') {
      cancelActiveTranslation();
      activeAbortController = new AbortController();
      const signal = activeAbortController.signal;

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parentElem = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;

        if (parentElem) {
          translateElement(parentElem, message.targetLang, signal)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;
        }
      }
      sendResponse({ success: false, error: 'No active selection found' });
      return true;
    }

    if (message.type === 'TRANSLATE_MAIN_CONTENT') {
      cancelActiveTranslation();
      activeAbortController = new AbortController();
      const signal = activeAbortController.signal;

      const main = document.querySelector('main') || document.querySelector('article') || document.body;
      if (main) {
        translateElement(main as HTMLElement, message.targetLang, signal)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      sendResponse({ success: false, error: 'Main content area not found' });
      return true;
    }

    if (message.type === 'RESTORE_ORIGINAL') {
      cancelActiveTranslation();
      restoreOriginalText(document.body);
      sendResponse({ success: true });
      return true;
    }
  });
}
