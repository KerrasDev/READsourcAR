import { detectLanguage } from '../translation/language-detector';
import { TranslationManager } from '../translation/translation-manager';
import { StorageManager } from '../shared/settings';

let translationManager: TranslationManager | null = null;
const originalNodeValues = new WeakMap<Node, string>();
const originalParentDirs = new WeakMap<HTMLElement, string>();

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'yi']);

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
 * Translates selected DOM element or main content area in bounded batches,
 * handling RTL text direction and preserving original values for restoration.
 */
export async function translateElement(element: HTMLElement, targetLang: string = 'en'): Promise<void> {
  const manager = await getManager();
  const textNodes = getTranslatableTextNodes(element);
  const isRTL = RTL_LANGUAGES.has(targetLang.toLowerCase());

  // Set RTL direction on container if applicable
  if (isRTL) {
    if (!originalParentDirs.has(element)) {
      originalParentDirs.set(element, element.getAttribute('dir') || '');
    }
    element.setAttribute('dir', 'rtl');
  }

  // Process text in bounded chunks (batch size: 10 nodes)
  const BATCH_SIZE = 10;
  for (let i = 0; i < textNodes.length; i += BATCH_SIZE) {
    const batch = textNodes.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (node) => {
        const originalText = node.nodeValue || '';
        if (!originalNodeValues.has(node)) {
          originalNodeValues.set(node, originalText);
        }

        // Bounded length protection (truncate excessively long text node to 800 chars per chunk)
        const textToTranslate = originalText.length > 800 ? originalText.slice(0, 800) : originalText;

        try {
          const res = await manager.translateText(textToTranslate, 'auto', targetLang);
          node.nodeValue = res.translatedText + (originalText.length > 800 ? originalText.slice(800) : '');
        } catch (err) {
          console.error('Failed to translate node:', err);
        }
      })
    );
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

  // Restore direction if previously altered
  if (originalParentDirs.has(element)) {
    const prevDir = originalParentDirs.get(element);
    if (prevDir) {
      element.setAttribute('dir', prevDir);
    } else {
      element.removeAttribute('dir');
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
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parentElem = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;

        if (parentElem) {
          translateElement(parentElem, message.targetLang).then(() => {
            sendResponse({ success: true });
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
        translateElement(main as HTMLElement, message.targetLang).then(() => {
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
