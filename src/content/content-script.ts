import { detectLanguage, isRTL } from '../translation/language-detector';
import { TranslationManager } from '../translation/translation-manager';
import { StorageManager } from '../shared/settings';

let translationManager: TranslationManager | null = null;
let currentAbortController: AbortController | null = null;
const originalNodeValues = new WeakMap<Node, string>();
const originalDirAttributes = new WeakMap<HTMLElement, string | null>();

async function getManager(): Promise<TranslationManager> {
  const settings = await StorageManager.getSettings();
  if (!translationManager) {
    translationManager = new TranslationManager(settings.translation, settings.privacy.sendPageContentConsent);
  } else {
    translationManager.updateSettings(settings.translation, settings.privacy.sendPageContentConsent);
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
 * Translates selected DOM element or main content area with cancellation and RTL layout handling.
 */
export async function translateElement(element: HTMLElement, targetLang?: string, signal?: AbortSignal): Promise<void> {
  const manager = await getManager();
  const textNodes = getTranslatableTextNodes(element);

  if (targetLang && isRTL(targetLang)) {
    if (!originalDirAttributes.has(element)) {
      originalDirAttributes.set(element, element.getAttribute('dir'));
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
      const res = await manager.translateText(originalText, 'auto', targetLang, signal);
      if (signal?.aborted) break;
      node.nodeValue = res.translatedText;
    } catch (err: any) {
      if (err?.message === 'Translation aborted' || signal?.aborted) {
        break;
      }
      console.error('Failed to translate node:', err);
    }
  }
}

/**
 * Restores original text and text direction for previously translated nodes/elements.
 */
export function restoreOriginalText(element: HTMLElement): void {
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const node = walk.currentNode as Text;
    if (originalNodeValues.has(node)) {
      node.nodeValue = originalNodeValues.get(node)!;
    }
  }

  if (originalDirAttributes.has(element)) {
    const origDir = originalDirAttributes.get(element);
    if (origDir === null || origDir === undefined) {
      element.removeAttribute('dir');
    } else {
      element.setAttribute('dir', origDir);
    }
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

    if (message.type === 'TRANSLATE_SELECTION') {
      if (currentAbortController) {
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parentElem = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;

        if (parentElem) {
          translateElement(parentElem, message.targetLang, currentAbortController.signal).then(() => {
            sendResponse({ success: true });
          });
          return true;
        }
      }
      sendResponse({ success: false, error: 'No active selection found' });
      return true;
    }

    if (message.type === 'TRANSLATE_MAIN_CONTENT') {
      if (currentAbortController) {
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();

      const main = document.querySelector('main') || document.querySelector('article') || document.body;
      if (main) {
        translateElement(main as HTMLElement, message.targetLang, currentAbortController.signal).then(() => {
          sendResponse({ success: true });
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
