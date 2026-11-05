import { detectLanguage, isRTL } from '../translation/language-detector';
import { TranslationManager } from '../translation/translation-manager';
import { StorageManager } from '../shared/settings';

let translationManager: TranslationManager | null = null;
const originalNodeValues = new WeakMap<Node, string>();
const originalElementDirs = new WeakMap<HTMLElement, string>();

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
function getTranslatableTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'code', 'pre', 'input', 'textarea'].includes(tag)) {
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
 * Translates selected DOM element or main content area, adjusting direction (RTL/LTR)
 * when applicable and preserving original state.
 */
export async function translateElement(element: HTMLElement, targetLang?: string, signal?: AbortSignal): Promise<void> {
  const manager = await getManager();
  const textNodes = getTranslatableTextNodes(element);
  const target = targetLang || 'en';
  const rtlTarget = isRTL(target);

  // Preserve and adjust direction for the translated element
  if (!originalElementDirs.has(element)) {
    originalElementDirs.set(element, element.getAttribute('dir') || '');
  }

  if (rtlTarget) {
    element.setAttribute('dir', 'rtl');
  } else if (originalElementDirs.get(element) === '') {
    element.removeAttribute('dir');
  }

  for (const node of textNodes) {
    if (signal?.aborted) {
      throw new Error('Translation aborted');
    }

    const originalText = node.nodeValue || '';
    if (!originalNodeValues.has(node)) {
      originalNodeValues.set(node, originalText);
    }

    try {
      const res = await manager.translateText(originalText, 'auto', target, signal);
      node.nodeValue = res.translatedText;
    } catch (err: any) {
      if (err?.message === 'Translation aborted') {
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
  if (originalElementDirs.has(element)) {
    const originalDir = originalElementDirs.get(element)!;
    if (originalDir) {
      element.setAttribute('dir', originalDir);
    } else {
      element.removeAttribute('dir');
    }
  }
}

// Active translation abort controller
let activeTranslationController: AbortController | null = null;

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
      if (activeTranslationController) {
        activeTranslationController.abort();
        activeTranslationController = null;
      }
      sendResponse({ success: true, cancelled: true });
      return true;
    }

    if (message.type === 'TRANSLATE_SELECTION') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parentElem = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;

        if (parentElem) {
          if (activeTranslationController) {
            activeTranslationController.abort();
          }
          activeTranslationController = new AbortController();

          translateElement(parentElem, message.targetLang, activeTranslationController.signal)
            .then(() => {
              activeTranslationController = null;
              sendResponse({ success: true });
            })
            .catch((err) => {
              activeTranslationController = null;
              sendResponse({ success: false, error: err?.message || 'Translation failed' });
            });
          return true;
        }
      }
      sendResponse({ success: false, error: 'No active selection found' });
      return true;
    }

    if (message.type === 'TRANSLATE_MAIN_CONTENT') {
      const main = document.querySelector('main') || document.querySelector('article') || document.body;
      if (main) {
        if (activeTranslationController) {
          activeTranslationController.abort();
        }
        activeTranslationController = new AbortController();

        translateElement(main as HTMLElement, message.targetLang, activeTranslationController.signal)
          .then(() => {
            activeTranslationController = null;
            sendResponse({ success: true });
          })
          .catch((err) => {
            activeTranslationController = null;
            sendResponse({ success: false, error: err?.message || 'Translation failed' });
          });
        return true;
      }
      sendResponse({ success: false, error: 'Main content area not found' });
      return true;
    }

    if (message.type === 'RESTORE_ORIGINAL') {
      if (activeTranslationController) {
        activeTranslationController.abort();
        activeTranslationController = null;
      }
      restoreOriginalText(document.body);
      sendResponse({ success: true });
      return true;
    }
  });
}
