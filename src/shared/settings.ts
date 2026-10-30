import { AppSettings, ResourceStats } from './types';

export const CURRENT_SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  version: CURRENT_SETTINGS_VERSION,
  globalProtectionEnabled: true,
  resourcePolicies: {
    script: { enabled: false, action: 'block' },
    thirdPartyScript: { enabled: true, action: 'block' },
    iframe: { enabled: false, action: 'block' },
    image: { enabled: false, action: 'block' },
    media: { enabled: false, action: 'block' },
    stylesheet: { enabled: false, action: 'block' },
    font: { enabled: false, action: 'block' },
    worker: { enabled: false, action: 'block' },
    popup: { enabled: false, action: 'block' }
  },
  siteExceptions: {},
  customRules: [],
  translation: {
    mode: 'manual',
    sourceLang: 'auto',
    targetLang: 'en',
    provider: {
      type: 'mock'
    },
    autoDetectLanguages: true,
    maxCacheEntries: 500,
    cacheTTLMs: 86400000, // 24 hours
    concurrencyLimit: 1
  },
  privacy: {
    collectStats: true,
    clearStatsOnRestart: false,
    sendPageContentConsent: false
  }
};

export const DEFAULT_STATS: ResourceStats = {
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
};

/**
 * Validates settings object and migrates/repairs schema if needed.
 */
export function validateAndMigrateSettings(input: any): AppSettings {
  if (!input || typeof input !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  const result: AppSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  if (typeof input.globalProtectionEnabled === 'boolean') {
    result.globalProtectionEnabled = input.globalProtectionEnabled;
  }

  if (input.resourcePolicies && typeof input.resourcePolicies === 'object') {
    for (const cat of Object.keys(result.resourcePolicies) as Array<keyof typeof result.resourcePolicies>) {
      if (input.resourcePolicies[cat] && typeof input.resourcePolicies[cat] === 'object') {
        if (typeof input.resourcePolicies[cat].enabled === 'boolean') {
          result.resourcePolicies[cat].enabled = input.resourcePolicies[cat].enabled;
        }
        if (input.resourcePolicies[cat].action === 'allow' || input.resourcePolicies[cat].action === 'block') {
          result.resourcePolicies[cat].action = input.resourcePolicies[cat].action;
        }
      }
    }
  }

  if (input.siteExceptions && typeof input.siteExceptions === 'object') {
    result.siteExceptions = input.siteExceptions;
  }

  if (Array.isArray(input.customRules)) {
    result.customRules = input.customRules.filter((r: any) => r && typeof r.id === 'string' && typeof r.pattern === 'string');
  }

  if (input.translation && typeof input.translation === 'object') {
    const t = input.translation;
    if (['manual', 'selective', 'assisted'].includes(t.mode)) {
      result.translation.mode = t.mode;
    }
    if (typeof t.sourceLang === 'string') result.translation.sourceLang = t.sourceLang;
    if (typeof t.targetLang === 'string') result.translation.targetLang = t.targetLang;
    if (typeof t.autoDetectLanguages === 'boolean') result.translation.autoDetectLanguages = t.autoDetectLanguages;
    if (typeof t.maxCacheEntries === 'number' && t.maxCacheEntries > 0) result.translation.maxCacheEntries = Math.min(2000, t.maxCacheEntries);
    if (typeof t.cacheTTLMs === 'number' && t.cacheTTLMs > 0) result.translation.cacheTTLMs = t.cacheTTLMs;
    if (typeof t.concurrencyLimit === 'number' && t.concurrencyLimit > 0) result.translation.concurrencyLimit = Math.min(5, t.concurrencyLimit);

    if (t.provider && typeof t.provider === 'object') {
      if (['mock', 'manual', 'custom_api'].includes(t.provider.type)) {
        result.translation.provider.type = t.provider.type;
      }
      if (typeof t.provider.endpoint === 'string') result.translation.provider.endpoint = t.provider.endpoint;
      if (typeof t.provider.apiKey === 'string') result.translation.provider.apiKey = t.provider.apiKey;
      if (t.provider.customHeaders && typeof t.provider.customHeaders === 'object') {
        result.translation.provider.customHeaders = t.provider.customHeaders;
      }
    }
  }

  if (input.privacy && typeof input.privacy === 'object') {
    if (typeof input.privacy.collectStats === 'boolean') result.privacy.collectStats = input.privacy.collectStats;
    if (typeof input.privacy.clearStatsOnRestart === 'boolean') result.privacy.clearStatsOnRestart = input.privacy.clearStatsOnRestart;
    if (typeof input.privacy.sendPageContentConsent === 'boolean') result.privacy.sendPageContentConsent = input.privacy.sendPageContentConsent;
  }

  return result;
}

/**
 * Storage Abstraction Layer for Chrome Extension Local Storage
 */
import { ExtensionBrowser } from './browser';

export const StorageManager = {
  async getSettings(): Promise<AppSettings> {
    const stored = await ExtensionBrowser.getStorage('settings');
    if (stored !== null) {
      return validateAndMigrateSettings(stored);
    }
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('rg_settings') : null;
    return validateAndMigrateSettings(saved ? JSON.parse(saved) : null);
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    const validated = validateAndMigrateSettings(settings);
    if (ExtensionBrowser.isAvailable()) {
      await ExtensionBrowser.setStorage('settings', validated);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rg_settings', JSON.stringify(validated));
    }
  },

  async getStats(): Promise<ResourceStats> {
    const stored = await ExtensionBrowser.getStorage('stats');
    if (stored !== null) {
      return stored as ResourceStats;
    }
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('rg_stats');
      return saved ? JSON.parse(saved) : DEFAULT_STATS;
    }
    return DEFAULT_STATS;
  },

  async saveStats(stats: ResourceStats): Promise<void> {
    if (ExtensionBrowser.isAvailable()) {
      await ExtensionBrowser.setStorage('stats', stats);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rg_stats', JSON.stringify(stats));
    }
  }
};
