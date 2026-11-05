import { StorageManager } from '../shared/settings';
import { compileSettingsWithDiagnostics } from '../rules/rule-compiler';
import { AppSettings, ResourceStats, ResourceCategory } from '../shared/types';

/**
 * Service Worker Event Handler & DNR Coordinator
 */

export async function updateDNRRules(): Promise<void> {
  const settings = await StorageManager.getSettings();
  const compilation = compileSettingsWithDiagnostics(settings);

  if (compilation.warning) {
    console.warn(`[Resource Guardian] ${compilation.warning}`);
  }

  if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const removeRuleIds = existingRules.map((r) => r.id);

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules: compilation.rules as unknown as chrome.declarativeNetRequest.Rule[]
      });
      console.log(`Updated declarativeNetRequest with ${compilation.rules.length} active rules.`);
    } catch (err) {
      console.error('Failed to update DNR rules:', err);
    }
  }
}

// Map DNR matched request type to ResourceCategory
function mapResourceTypeToCategory(type?: string): ResourceCategory {
  switch (type) {
    case 'script':
      return 'script';
    case 'sub_frame':
      return 'iframe';
    case 'image':
      return 'image';
    case 'media':
      return 'media';
    case 'stylesheet':
      return 'stylesheet';
    case 'font':
      return 'font';
    case 'websocket':
    case 'other':
      return 'worker';
    default:
      return 'script';
  }
}

// Service worker listeners initialization
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(async () => {
    console.log('Resource Guardian installed/updated.');
    await updateDNRRules();
  });

  chrome.runtime.onStartup.addListener(async () => {
    const settings = await StorageManager.getSettings();
    if (settings.privacy.clearStatsOnRestart) {
      await StorageManager.saveStats({
        totalEvaluated: 0,
        totalBlocked: 0,
        blockedByCategory: {
          script: 0,
          thirdPartyScript: 0,
          iframe: 0,
          image: 0,
          media: 0,
          stylesheet: 0,
          font: 0,
          worker: 0,
          popup: 0
        },
        lastUpdated: Date.now()
      });
    }
    await updateDNRRules();
  });

  // Track matched DNR rules if onRuleMatchedDebug API is available (e.g. unpacked/debug extension)
  if (chrome.declarativeNetRequest && (chrome.declarativeNetRequest as any).onRuleMatchedDebug) {
    (chrome.declarativeNetRequest as any).onRuleMatchedDebug.addListener(async (info: any) => {
      try {
        const stats = await StorageManager.getStats();
        stats.totalBlocked++;
        const cat = mapResourceTypeToCategory(info?.request?.type);
        if (stats.blockedByCategory[cat] !== undefined) {
          stats.blockedByCategory[cat]++;
        }
        stats.lastUpdated = Date.now();
        await StorageManager.saveStats(stats);
      } catch (e) {
        // Safe silent fail for stats
      }
    });
  }

  // Listen for settings change messages from popup/options or chrome storage changes
  if (chrome.storage) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.settings) {
        updateDNRRules();
      }
    });
  }

  // Handle messages from UI or content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SETTINGS') {
      StorageManager.getSettings().then((settings) => sendResponse({ settings }));
      return true; // async
    }

    if (message.type === 'SAVE_SETTINGS') {
      StorageManager.saveSettings(message.settings as AppSettings).then(() => {
        updateDNRRules();
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'TOGGLE_GLOBAL_PROTECTION') {
      StorageManager.getSettings().then(async (settings) => {
        settings.globalProtectionEnabled = !settings.globalProtectionEnabled;
        await StorageManager.saveSettings(settings);
        await updateDNRRules();
        sendResponse({ success: true, enabled: settings.globalProtectionEnabled });
      });
      return true;
    }

    if (message.type === 'TOGGLE_SITE_PAUSE') {
      const domain = message.domain;
      if (domain) {
        StorageManager.getSettings().then(async (settings) => {
          if (!settings.siteExceptions[domain]) {
            settings.siteExceptions[domain] = { domain, paused: false };
          }
          settings.siteExceptions[domain].paused = !settings.siteExceptions[domain].paused;
          await StorageManager.saveSettings(settings);
          await updateDNRRules();
          sendResponse({ success: true, paused: settings.siteExceptions[domain].paused });
        });
        return true;
      }
    }

    if (message.type === 'GET_STATS') {
      StorageManager.getStats().then((stats) => sendResponse({ stats }));
      return true;
    }

    if (message.type === 'CLEAR_STATS') {
      StorageManager.saveStats({
        totalEvaluated: 0,
        totalBlocked: 0,
        blockedByCategory: {
          script: 0,
          thirdPartyScript: 0,
          iframe: 0,
          image: 0,
          media: 0,
          stylesheet: 0,
          font: 0,
          worker: 0,
          popup: 0
        },
        lastUpdated: Date.now()
      }).then(() => sendResponse({ success: true }));
      return true;
    }
  });
}
