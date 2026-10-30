/**
 * Cross-browser extension API abstraction layer.
 * Normalizes access to chrome.* and browser.* APIs across Chromium and Firefox environments.
 */

export function getBrowser() {
  if (typeof globalThis !== 'undefined' && (globalThis as any).browser) {
    return (globalThis as any).browser;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).chrome) {
    return (globalThis as any).chrome;
  }
  if (typeof window !== 'undefined' && (window as any).chrome) {
    return (window as any).chrome;
  }
  return null;
}

export const ExtensionBrowser = {
  get api() {
    return getBrowser();
  },

  isAvailable(): boolean {
    return getBrowser() !== null;
  },

  async getStorage<T = any>(key: string): Promise<T | null> {
    const b = getBrowser();
    if (b && b.storage && b.storage.local) {
      return new Promise((resolve) => {
        b.storage.local.get([key], (res: any) => {
          resolve(res ? res[key] : null);
        });
      });
    }
    return null;
  },

  async setStorage(key: string, value: any): Promise<void> {
    const b = getBrowser();
    if (b && b.storage && b.storage.local) {
      return new Promise((resolve) => {
        b.storage.local.set({ [key]: value }, () => resolve());
      });
    }
  },

  async getActiveTab(): Promise<{ id?: number; url?: string; title?: string } | null> {
    const b = getBrowser();
    if (b && b.tabs && b.tabs.query) {
      return new Promise((resolve) => {
        b.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
          if (tabs && tabs[0]) {
            resolve({
              id: tabs[0].id,
              url: tabs[0].url,
              title: tabs[0].title
            });
          } else {
            resolve(null);
          }
        });
      });
    }
    return null;
  },

  async sendMessageToTab(tabId: number, message: any): Promise<any> {
    const b = getBrowser();
    if (b && b.tabs && b.tabs.sendMessage) {
      return new Promise((resolve, reject) => {
        b.tabs.sendMessage(tabId, message, (response: any) => {
          const err = b.runtime && b.runtime.lastError;
          if (err) {
            reject(new Error(err.message || 'Failed to send message to tab'));
          } else {
            resolve(response);
          }
        });
      });
    }
  }
};
