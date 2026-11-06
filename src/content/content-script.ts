import { detectLanguage, isRTL } from '../translation/language-detector';
import { TranslationManager } from '../translation/translation-manager';
import { StorageManager } from '../shared/settings';

let translationManager: TranslationManager | null = null;
const originalNodeValues = new WeakMap<Node, string>();
const originalNodeDirections = new WeakMap<HTMLElement, string>();

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
      // Skip non-translatable and sensitive elements
      if (['script', 'style', 'noscript', 'code', 'pre', 'input', 'textarea', 'kbd', 'samp'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.isContentEditable || parent.hasAttribute('data-no-translate')) {
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
 * Translates selected DOM element or main content area, adjusting directionality (RTL/LTR)
 * and providing cancellation capability.
 */
export async function translateElement(
  element: HTMLElement,
  targetLang = 'en',
  signal?: AbortSignal
): Promise<{ translatedCount: number; cancelled: boolean }> {
  const manager = await getManager();
  const textNodes = getTranslatableTextNodes(element);

  const targetIsRTL = isRTL(targetLang);

  // Store element's original directionality if not recorded
  if (!originalNodeDirections.has(element)) {
    originalNodeDirections.set(element, element.getAttribute('dir') || '');
  }

  let translatedCount = 0;

  for (const node of textNodes) {
    if (signal?.aborted) {
      return { translatedCount, cancelled: true };
    }

    const originalText = node.nodeValue || '';
    if (!originalNodeValues.has(node)) {
      originalNodeValues.set(node, originalText);
    }

    try {
      const res = await manager.translateText(originalText, 'auto', targetLang, signal);
      node.nodeValue = res.translatedText;
      translatedCount++;
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        return { translatedCount, cancelled: true };
      }
      console.warn('Failed to translate node:', err);
    }
  }

  // Adjust text direction for the container based on target language
  if (targetIsRTL) {
    element.setAttribute('dir', 'rtl');
  } else {
    element.setAttribute('dir', 'ltr');
  }

  return { translatedCount, cancelled: false };
}

/**
 * Restores original text and original text direction for previously translated nodes in element.
 */
export function restoreOriginalText(element: HTMLElement): void {
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const node = walk.currentNode as Text;
    if (originalNodeValues.has(node)) {
      node.nodeValue = originalNodeValues.get(node)!;
    }
  }

  if (originalNodeDirections.has(element)) {
    const originalDir = originalNodeDirections.get(element);
    if (originalDir) {
      element.setAttribute('dir', originalDir);
    } else {
      element.removeAttribute('dir');
    }
  }
}

// Content script message listener
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CANCEL_TRANSLATION') {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'DETECT_PAGE_LANGUAGE') {
      const docLang = document.documentElement.lang;
      const bodyText = document.body ? document.body.innerText.slice(0, 2000) : '';
      const detected = detectLanguage(bodyText, docLang);
      sendResponse(detected);
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
          translateElement(parentElem, message.targetLang, activeAbortController.signal).then((res) => {
            sendResponse({ success: true, ...res });
          });
          return true;
        }
      }
      sendResponse({ success: false, error: 'No active selection found' });
      return true;
    }

    if (message.type === 'TRANSLATE_MAIN_CONTENT') {
      if (activeAbortController) activeAbortController.abort();
      activeAbortController = new AbortController();

      const main = document.querySelector('main') || document.querySelector('article') || document.body;
      if (main) {
        translateElement(main as HTMLElement, message.targetLang, activeAbortController.signal).then((res) => {
          sendResponse({ success: true, ...res });
        });
        return true;
      }
      sendResponse({ success: false, error: 'Main content area not found' });
      return true;
    }

    if (message.type === 'RESTORE_ORIGINAL') {
      restoreOriginalText(document.body);
      sendResponse({ success: true });
      return true;
    }
  });
}
