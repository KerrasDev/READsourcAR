import { StorageManager } from '../shared/settings';
import { compileSettingsWithTelemetry, DNRRule } from '../rules/rule-compiler';
import { AppSettings, ResourceStats } from '../shared/types';

/**
 * Service Worker Event Handler & DNR Dynamic Rules Coordinator.
 * Strictly event-driven with zero persistent loops or background timers.
 */

export async function updateDNRRules(): Promise<{ count: number; warning?: string }> {
  const settings = await StorageManager.getSettings();
  const compilation = compileSettingsWithTelemetry(settings);

  if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const removeRuleIds = existingRules.map((r) => r.id);

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules: compilation.rules as unknown as chrome.declarativeNetRequest.Rule[]
      });

      if (compilation.warning) {
        console.warn(`[Resource Guardian] ${compilation.warning}`);
      }

      console.log(`[Resource Guardian] Synchronized ${compilation.rules.length} DNR dynamic rules.`);
      return { count: compilation.rules.length, warning: compilation.warning };
    } catch (err) {
      console.error('[Resource Guardian] Failed to synchronize DNR dynamic rules:', err);
      return { count: 0, warning: (err as Error).message };
    }
  }

  return { count: compilation.rules.length };
}

// Bounded Statistics update helper
export async function incrementStats(category: keyof ResourceStats['blockedByCategory']): Promise<void> {
  const stats = await StorageManager.getStats();
  stats.totalBlocked = (stats.totalBlocked || 0) + 1;
  stats.totalEvaluated = (stats.totalEvaluated || 0) + 1;
  if (!stats.blockedByCategory) {
    stats.blockedByCategory = {
      script: 0,
      thirdPartyScript: 0,
      iframe: 0,
      image: 0,
      media: 0,
      stylesheet: 0,
      font: 0,
      worker: 0,
      popup: 0
    };
  }
  stats.blockedByCategory[category] = (stats.blockedByCategory[category] || 0) + 1;
  stats.lastUpdated = Date.now();
  await StorageManager.saveStats(stats);
}

// Event-driven lifecycle listeners
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`[Resource Guardian] Extension installed/updated (reason: ${details.reason}).`);
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

  // Observe settings storage changes
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.settings) {
        updateDNRRules();
      }
    });
  }

  // Debug rule matching telemetry when supported (unpacked developer extension)
  if (chrome.declarativeNetRequest && 'onRuleMatchedDebug' in chrome.declarativeNetRequest) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
      const settings = await StorageManager.getSettings();
      if (!settings.privacy.collectStats) return;

      const rule = info.rule;
      const resType = info.request.type;
      let category: keyof ResourceStats['blockedByCategory'] = 'script';

      if (resType === 'sub_frame') category = 'iframe';
      else if (resType === 'image') category = 'image';
      else if (resType === 'media') category = 'media';
      else if (resType === 'stylesheet') category = 'stylesheet';
      else if (resType === 'font') category = 'font';
      else if (resType === 'script') category = 'script';

      await incrementStats(category);
    });
  }

  // Service Worker Message Dispatcher
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SETTINGS') {
      StorageManager.getSettings().then((settings) => sendResponse({ settings }));
      return true;
    }

    if (message.type === 'SAVE_SETTINGS') {
      StorageManager.saveSettings(message.settings as AppSettings).then(async () => {
        const syncResult = await updateDNRRules();
        sendResponse({ success: true, activeRules: syncResult.count, warning: syncResult.warning });
      });
      return true;
    }

    if (message.type === 'TOGGLE_GLOBAL_PROTECTION') {
      StorageManager.getSettings().then(async (settings) => {
        settings.globalProtectionEnabled = !settings.globalProtectionEnabled;
        await StorageManager.saveSettings(settings);
        const syncResult = await updateDNRRules();
        sendResponse({ success: true, enabled: settings.globalProtectionEnabled, activeRules: syncResult.count });
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
          const syncResult = await updateDNRRules();
          sendResponse({
            success: true,
            paused: settings.siteExceptions[domain].paused,
            activeRules: syncResult.count
          });
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

    if (message.type === 'GET_ACTIVE_RULES_COUNT') {
      if (chrome.declarativeNetRequest) {
        chrome.declarativeNetRequest.getDynamicRules().then((rules) => {
          sendResponse({ count: rules.length });
        }).catch(() => {
          sendResponse({ count: 0 });
        });
        return true;
      } else {
        sendResponse({ count: 0 });
        return false;
      }
    }
  });
}
