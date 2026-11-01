import { AppSettings, ResourceCategory } from '../shared/types';

export const MAX_SAFE_DYNAMIC_RULES = 5000;

export interface DNRRule {
  id: number;
  priority: number;
  action: {
    type: 'block' | 'allow';
  };
  condition: {
    urlFilter?: string;
    resourceTypes?: string[];
    domainType?: 'firstParty' | 'thirdParty';
    initiatorDomains?: string[];
    excludedInitiatorDomains?: string[];
    requestDomains?: string[];
    excludedRequestDomains?: string[];
  };
}

export const CATEGORY_RESOURCE_TYPES: Record<ResourceCategory, string[]> = {
  script: ['script'],
  thirdPartyScript: ['script'],
  iframe: ['sub_frame'],
  image: ['image'],
  media: ['media'],
  stylesheet: ['stylesheet'],
  font: ['font'],
  worker: ['script', 'websocket', 'other'],
  popup: ['sub_frame']
};

/**
 * Sanitizes a URL filter pattern for DNR compliance.
 * Strips unsupported characters and ensures valid pattern formatting.
 */
export function sanitizeUrlPattern(pattern: string): string {
  if (!pattern) return '*';
  let cleaned = pattern.trim().toLowerCase();

  // DNR urlFilter must only contain ASCII characters
  cleaned = cleaned.replace(/[^\x20-\x7E]/g, '');

  if (!cleaned) return '*';

  // If pattern is a domain or path without wildcard or protocol prefix, wrap with wildcards
  if (!cleaned.includes('*') && !cleaned.startsWith('||') && !cleaned.startsWith('|')) {
    return `*${cleaned}*`;
  }

  return cleaned;
}

/**
 * Compiles extension AppSettings into chrome.declarativeNetRequest rules adhering to a
 * strict 6-tier precedence hierarchy:
 *
 * Tier 1: Emergency & Paused sites (Priority 1000) -> Highest Allow Override
 * Tier 2: Site-scoped custom allow (210) & block (200) rules
 * Tier 3: Global custom allow (110) & block (100) rules
 * Tier 4: Site-scoped category allow (60) & block (50) overrides
 * Tier 5: Global category allow (15) & block (10) default policies
 * Tier 6: Default allow (Implicit DNR behavior)
 *
 * Safety limit: Caps total rules at MAX_SAFE_DYNAMIC_RULES (5000) to avoid exceeding
 * browser dynamic rules quota.
 */
export function compileSettingsToDNRRules(settings: AppSettings): DNRRule[] {
  if (!settings.globalProtectionEnabled) {
    return [];
  }

  const rules: DNRRule[] = [];
  let nextRuleId = 1;

  const pushRule = (rule: Omit<DNRRule, 'id'>): boolean => {
    if (rules.length >= MAX_SAFE_DYNAMIC_RULES) {
      console.warn(`[Resource Guardian] Exceeded maximum dynamic rules limit (${MAX_SAFE_DYNAMIC_RULES}). Truncating further rules.`);
      return false;
    }
    rules.push({ id: nextRuleId++, ...rule });
    return true;
  };

  // 1. Paused Sites - Priority 1000 (Tier 1 Highest Allow)
  if (settings.siteExceptions) {
    for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
      if (exception && exception.paused && domain) {
        const cleanDomain = domain.toLowerCase().trim();
        if (cleanDomain) {
          if (!pushRule({
            priority: 1000,
            action: { type: 'allow' },
            condition: {
              initiatorDomains: [cleanDomain]
            }
          })) break;
        }
      }
    }
  }

  // 2. Custom Rules (Tier 2: Site-scoped 200-210, Tier 3: Global 100-110)
  if (Array.isArray(settings.customRules)) {
    for (const rule of settings.customRules) {
      if (!rule || !rule.pattern) continue;

      const isAllow = rule.action === 'allow';
      const isSiteScoped = Boolean(rule.siteScope && rule.siteScope !== '*');
      const basePriority = isSiteScoped ? 200 : 100;
      const priority = isAllow ? basePriority + 10 : basePriority;

      const condition: DNRRule['condition'] = {
        urlFilter: sanitizeUrlPattern(rule.pattern)
      };

      if (isSiteScoped && rule.siteScope) {
        condition.initiatorDomains = [rule.siteScope.toLowerCase().trim()];
      }

      if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
        condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
      }

      if (!pushRule({
        priority,
        action: { type: isAllow ? 'allow' : 'block' },
        condition
      })) break;
    }
  }

  // 3. Site Category Overrides (Tier 4: Site-scoped 50-60)
  if (settings.siteExceptions) {
    for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
      if (!exception || exception.paused || !domain) continue;

      if (exception.categoryOverrides) {
        for (const [catStr, action] of Object.entries(exception.categoryOverrides)) {
          const cat = catStr as ResourceCategory;
          const resTypes = CATEGORY_RESOURCE_TYPES[cat];
          if (!resTypes) continue;

          const condition: DNRRule['condition'] = {
            initiatorDomains: [domain.toLowerCase().trim()],
            resourceTypes: resTypes
          };

          if (cat === 'thirdPartyScript') {
            condition.domainType = 'thirdParty';
          }

          if (!pushRule({
            priority: action === 'allow' ? 60 : 50,
            action: { type: action },
            condition
          })) break;
        }
      }
    }
  }

  // 4. Global Category Rules (Tier 5: Global 10-15)
  if (settings.resourcePolicies) {
    for (const [catStr, policy] of Object.entries(settings.resourcePolicies)) {
      if (!policy || !policy.enabled) continue;

      const cat = catStr as ResourceCategory;
      const resTypes = CATEGORY_RESOURCE_TYPES[cat];
      if (!resTypes) continue;

      const condition: DNRRule['condition'] = {
        resourceTypes: resTypes
      };

      if (cat === 'thirdPartyScript') {
        condition.domainType = 'thirdParty';
      }

      if (!pushRule({
        priority: policy.action === 'allow' ? 15 : 10,
        action: { type: policy.action },
        condition
      })) break;
    }
  }

  return rules;
}
