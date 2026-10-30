import { StorageManager } from '../shared/settings';
import { compileSettingsToDNRRules } from '../rules/rule-compiler';
import { AppSettings, ResourceStats } from '../shared/types';

/**
 * Service Worker Event Handler & DNR Coordinator
 */

export async function updateDNRRules(): Promise<void> {
  const settings = await StorageManager.getSettings();
  const rules = compileSettingsToDNRRules(settings);

  if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const removeRuleIds = existingRules.map((r) => r.id);

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules: rules as unknown as chrome.declarativeNetRequest.Rule[]
      });
      console.log(`Updated declarativeNetRequest with ${rules.length} active rules.`);
    } catch (err) {
      console.error('Failed to update DNR rules:', err);
    }
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

  // Listen for settings change messages from popup/options or chrome storage changes
  if (chrome.storage) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.settings) {
        updateDNRRules();
      }
    });
  }

  // Listen for declarativeNetRequest rule execution / matching events if supported for stats
  if (chrome.declarativeNetRequest && (chrome.declarativeNetRequest as any).onRuleMatchedDebug) {
    (chrome.declarativeNetRequest as any).onRuleMatchedDebug.addListener(async (info: any) => {
      const settings = await StorageManager.getSettings();
      if (!settings.privacy.collectStats) return;

      const stats = await StorageManager.getStats();
      stats.totalEvaluated++;
      if (info.rule.action && info.rule.action.type === 'block') {
        stats.totalBlocked++;
      }
      stats.lastUpdated = Date.now();
      await StorageManager.saveStats(stats);
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
