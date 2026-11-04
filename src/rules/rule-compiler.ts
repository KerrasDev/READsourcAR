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
 * Precedence Tier Constants:
 * Tier 1: Paused Domains / Mandatory Extension Safety Constraints (1000)
 * Tier 2: Explicit User Site-Scoped Allow Rules (210)
 * Tier 3: Explicit User Site-Scoped Block Rules (200)
 * Tier 4: Explicit User Global Allow Rules (110)
 * Tier 5: Explicit User Global Block Rules (100)
 * Tier 6: Per-Site Category Allow Overrides (60)
 * Tier 7: Per-Site Category Block Overrides (50)
 * Tier 8: Global Category Allow Policies (15)
 * Tier 9: Global Category Block Policies (10)
 * Tier 10: Default Allow (implicit, priority 0/unmatched)
 */
export const DNR_PRIORITIES = {
  SAFETY_AND_PAUSED: 1000,
  USER_SITE_ALLOW: 210,
  USER_SITE_BLOCK: 200,
  USER_GLOBAL_ALLOW: 110,
  USER_GLOBAL_BLOCK: 100,
  SITE_CATEGORY_ALLOW: 60,
  SITE_CATEGORY_BLOCK: 50,
  GLOBAL_CATEGORY_ALLOW: 15,
  GLOBAL_CATEGORY_BLOCK: 10
} as const;

export interface CompileResult {
  rules: DNRRule[];
  truncated: boolean;
  totalGenerated: number;
  maxLimit: number;
}

/**
 * Compiles extension AppSettings into declarativeNetRequest rules with safe bounding.
 */
export function compileSettingsToDNRRules(settings: AppSettings, maxLimit = MAX_SAFE_DYNAMIC_RULES): DNRRule[] {
  return compileSettingsWithMetadata(settings, maxLimit).rules;
}

/**
 * Compiles rules and returns metadata regarding truncation/safety limits.
 */
export function compileSettingsWithMetadata(settings: AppSettings, maxLimit = MAX_SAFE_DYNAMIC_RULES): CompileResult {
  if (!settings.globalProtectionEnabled) {
    return { rules: [], truncated: false, totalGenerated: 0, maxLimit };
  }

  const rules: DNRRule[] = [];
  let nextRuleId = 1;
  let truncated = false;

  const pushRule = (priority: number, actionType: 'allow' | 'block', condition: DNRRule['condition']) => {
    if (rules.length >= maxLimit) {
      truncated = true;
      return false;
    }
    rules.push({
      id: nextRuleId++,
      priority,
      action: { type: actionType },
      condition
    });
    return true;
  };

  // 1. Paused Sites (Tier 1 - Highest user override)
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused && domain) {
      if (!pushRule(DNR_PRIORITIES.SAFETY_AND_PAUSED, 'allow', { initiatorDomains: [domain] })) {
        break;
      }
    }
  }

  // 2. User Custom Rules (Tiers 2 to 5)
  // Process site-scoped first, then global, allows before blocks
  const sortedCustomRules = [...settings.customRules].sort((a, b) => {
    const aSite = a.siteScope && a.siteScope !== '*';
    const bSite = b.siteScope && b.siteScope !== '*';
    if (aSite !== bSite) return aSite ? -1 : 1; // site scoped first
    if (a.action !== b.action) return a.action === 'allow' ? -1 : 1; // allow before block
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  for (const rule of sortedCustomRules) {
    const isAllow = rule.action === 'allow';
    const isSiteScoped = !!rule.siteScope && rule.siteScope !== '*';
    let priority: number;

    if (isSiteScoped) {
      priority = isAllow ? DNR_PRIORITIES.USER_SITE_ALLOW : DNR_PRIORITIES.USER_SITE_BLOCK;
    } else {
      priority = isAllow ? DNR_PRIORITIES.USER_GLOBAL_ALLOW : DNR_PRIORITIES.USER_GLOBAL_BLOCK;
    }

    const condition: DNRRule['condition'] = {
      urlFilter: rule.pattern.startsWith('*') ? rule.pattern : `*${rule.pattern}*`
    };

    if (isSiteScoped && rule.siteScope) {
      condition.initiatorDomains = [rule.siteScope];
    }

    if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
      condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
    }

    if (!pushRule(priority, isAllow ? 'allow' : 'block', condition)) {
      break;
    }
  }

  // 3. Site Category Overrides (Tiers 6 & 7)
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused) continue;

    if (exception.categoryOverrides) {
      for (const [catStr, action] of Object.entries(exception.categoryOverrides)) {
        const cat = catStr as ResourceCategory;
        const resTypes = CATEGORY_RESOURCE_TYPES[cat];
        if (!resTypes) continue;

        const condition: DNRRule['condition'] = {
          initiatorDomains: [domain],
          resourceTypes: resTypes
        };

        if (cat === 'thirdPartyScript') {
          condition.domainType = 'thirdParty';
        }

        const priority = action === 'allow' ? DNR_PRIORITIES.SITE_CATEGORY_ALLOW : DNR_PRIORITIES.SITE_CATEGORY_BLOCK;
        if (!pushRule(priority, action, condition)) {
          break;
        }
      }
    }
  }

  // 4. Global Category Policies (Tiers 8 & 9)
  for (const [catStr, policy] of Object.entries(settings.resourcePolicies)) {
    if (!policy.enabled) continue;

    const cat = catStr as ResourceCategory;
    const resTypes = CATEGORY_RESOURCE_TYPES[cat];
    if (!resTypes) continue;

    const condition: DNRRule['condition'] = {
      resourceTypes: resTypes
    };

    if (cat === 'thirdPartyScript') {
      condition.domainType = 'thirdParty';
    }

    const priority = policy.action === 'allow' ? DNR_PRIORITIES.GLOBAL_CATEGORY_ALLOW : DNR_PRIORITIES.GLOBAL_CATEGORY_BLOCK;
    if (!pushRule(priority, policy.action, condition)) {
      break;
    }
  }

  return {
    rules,
    truncated,
    totalGenerated: rules.length,
    maxLimit
  };
}
