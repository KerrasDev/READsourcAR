// Resource Guardian Shared Types

export type ResourceCategory =
  | 'script'
  | 'thirdPartyScript'
  | 'iframe'
  | 'image'
  | 'media'
  | 'stylesheet'
  | 'font'
  | 'worker'
  | 'popup';

export interface CategoryPolicy {
  enabled: boolean; // whether blocking for this category is active
  action: 'block' | 'allow';
}

export type ResourcePolicies = Record<ResourceCategory, CategoryPolicy>;

export interface CustomRule {
  id: string;
  pattern: string; // e.g. "example.com", "*.ads.com", "https://tracker.org/*"
  action: 'allow' | 'block';
  category?: ResourceCategory;
  siteScope?: string; // e.g. "example.org" or "*" for global
  createdAt: number;
}

export interface SiteException {
  domain: string; // Registrable domain or exact hostname
  paused: boolean; // Temporary protection pause
  categoryOverrides?: Partial<Record<ResourceCategory, 'allow' | 'block'>>;
  customRules?: CustomRule[];
}

export type TranslationMode = 'manual' | 'selective' | 'assisted';

export type TranslationProviderType = 'mock' | 'manual' | 'custom_api';

export interface TranslationProviderConfig {
  type: TranslationProviderType;
  endpoint?: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
}

export interface TranslationSettings {
  mode: TranslationMode;
  sourceLang: string; // e.g., 'auto' or 'en'
  targetLang: string; // e.g., 'es', 'fr', 'ar'
  provider: TranslationProviderConfig;
  autoDetectLanguages: boolean;
  maxCacheEntries: number; // e.g. 500
  cacheTTLMs: number; // e.g. 86400000 (24 hrs)
  concurrencyLimit: number; // e.g. 1 or 2
}

export interface PrivacySettings {
  collectStats: boolean;
  clearStatsOnRestart: boolean;
  sendPageContentConsent: boolean;
}

export interface AppSettings {
  version: number;
  globalProtectionEnabled: boolean;
  resourcePolicies: ResourcePolicies;
  siteExceptions: Record<string, SiteException>; // key: domain
  customRules: CustomRule[];
  translation: TranslationSettings;
  privacy: PrivacySettings;
}

export interface ResourceStats {
  totalEvaluated: number;
  totalBlocked: number;
  blockedByCategory: Record<ResourceCategory, number>;
  lastUpdated: number;
}

export interface TranslationCacheEntry {
  key: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
  timestamp: number;
}
