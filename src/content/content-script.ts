import { detectLanguage, isRTL } from '../translation/language-detector';
import { TranslationManager } from '../translation/translation-manager';
import { StorageManager } from '../shared/settings';

let translationManager: TranslationManager | null = null;
const originalNodeValues = new WeakMap<Node, string>();
const originalNodeDirections = new WeakMap<HTMLElement, string>();

async function getManager(): Promise<TranslationManager> {
  if (!translationManager) {
    const settings = await StorageManager.getSettings();
    translationManager = new TranslationManager(settings.translation);
  }
  return translationManager;
}

/**
 * Extracts visible text nodes safely from a container, skipping non-translatable elements.
 * Protects code blocks, script/style, input fields, textareas, and contenteditable nodes.
 */
export function getTranslatableTextNodes(root: Node): Text[] {
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
 * Translates selected DOM element or main content area, adjusting text direction (RTL/LTR)
 * when appropriate and preserving original text values in WeakMap for clean restoration.
 */
export async function translateElement(element: HTMLElement, targetLang?: string): Promise<void> {
  const manager = await getManager();
  const textNodes = getTranslatableTextNodes(element);

  // Direction handling
  const isTargetRTL = targetLang ? isRTL(targetLang) : false;
  if (!originalNodeDirections.has(element)) {
    originalNodeDirections.set(element, element.getAttribute('dir') || '');
  }
  if (isTargetRTL) {
    element.setAttribute('dir', 'rtl');
  }

  for (const node of textNodes) {
    const originalText = node.nodeValue || '';
    if (!originalNodeValues.has(node)) {
      originalNodeValues.set(node, originalText);
    }

    try {
      const res = await manager.translateText(originalText, 'auto', targetLang);
      node.nodeValue = res.translatedText;
    } catch (err) {
      console.error('Failed to translate node:', err);
    }
  }
}

/**
 * Restores original text for previously translated nodes and resets text direction.
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
    const origDir = originalNodeDirections.get(element);
    if (origDir) {
      element.setAttribute('dir', origDir);
    } else {
      element.removeAttribute('dir');
    }
  }
}

/**
 * Locates the main content element using robust semantic and ARIA heuristics.
 */
export function findMainContentElement(): HTMLElement | null {
  const selectors = [
    'main',
    'article',
    '[role="main"]',
    '#main-content',
    '#content',
    '.main-content',
    '.content'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el instanceof HTMLElement) {
      return el;
    }
  }

  return document.body;
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
            sendResponse({ success: true, text: selection.toString() });
          });
          return true;
        }
      }
      sendResponse({ success: false, error: 'No active selection found' });
      return true;
    }

    if (message.type === 'TRANSLATE_MAIN_CONTENT') {
      const main = findMainContentElement();
      if (main) {
        translateElement(main, message.targetLang).then(() => {
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
