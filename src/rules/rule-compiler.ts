import { AppSettings, ResourceCategory } from '../shared/types';

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

/**
 * Safe upper bound for dynamic rules in Chromium Manifest V3.
 * Prevents exceeding MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES (5000).
 */
export const MAX_SAFE_DYNAMIC_RULES = 5000;

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
 * Strict 6-Tier Rule Precedence:
 * Tier 1: Paused Sites (Protection completely paused for domain) -> Priority 1000
 * Tier 2: Site-scoped Custom Rules (Allow: 210, Block: 200)
 * Tier 3: Global Custom Rules (Allow: 110, Block: 100)
 * Tier 4: Site Category Overrides (Allow: 60, Block: 50)
 * Tier 5: Global Category Policies (Allow: 15, Block: 10)
 * Tier 6: Default allow (Implicit browser behavior)
 */
export function compileSettingsToDNRRules(settings: AppSettings): DNRRule[] {
  if (!settings.globalProtectionEnabled) {
    return [];
  }

  const rules: DNRRule[] = [];
  let nextRuleId = 1;

  const pushRule = (rule: DNRRule): boolean => {
    if (rules.length >= MAX_SAFE_DYNAMIC_RULES) {
      console.warn(`Dynamic rule budget reached (${MAX_SAFE_DYNAMIC_RULES}). Truncating rules.`);
      return false;
    }
    rules.push(rule);
    return true;
  };

  // Tier 1. Paused Sites - Priority 1000 (Allow all on paused domains)
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused && domain) {
      const added = pushRule({
        id: nextRuleId++,
        priority: 1000,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain.toLowerCase()]
        }
      });
      if (!added) return rules;
    }
  }

  // Tier 2 & 3. Custom Rules
  for (const rule of settings.customRules) {
    if (!rule.pattern || rule.pattern.trim().length === 0) continue;

    const isAllow = rule.action === 'allow';
    const isSiteScoped = Boolean(rule.siteScope && rule.siteScope !== '*');
    const basePriority = isSiteScoped ? 200 : 100;
    const priority = isAllow ? basePriority + 10 : basePriority;

    const cleanPattern = rule.pattern.trim();
    const condition: DNRRule['condition'] = {
      urlFilter: cleanPattern.startsWith('*') || cleanPattern.startsWith('||') || cleanPattern.startsWith('http')
        ? cleanPattern
        : `*${cleanPattern}*`
    };

    if (isSiteScoped && rule.siteScope) {
      condition.initiatorDomains = [rule.siteScope.toLowerCase()];
    }

    if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
      condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
    }

    const added = pushRule({
      id: nextRuleId++,
      priority,
      action: { type: isAllow ? 'allow' : 'block' },
      condition
    });
    if (!added) return rules;
  }

  // Tier 4. Site Category Overrides
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused) continue;

    if (exception.categoryOverrides) {
      for (const [catStr, action] of Object.entries(exception.categoryOverrides)) {
        const cat = catStr as ResourceCategory;
        const resTypes = CATEGORY_RESOURCE_TYPES[cat];
        if (!resTypes) continue;

        const condition: DNRRule['condition'] = {
          initiatorDomains: [domain.toLowerCase()],
          resourceTypes: resTypes
        };

        if (cat === 'thirdPartyScript') {
          condition.domainType = 'thirdParty';
        }

        const added = pushRule({
          id: nextRuleId++,
          priority: action === 'allow' ? 60 : 50,
          action: { type: action },
          condition
        });
        if (!added) return rules;
      }
    }
  }

  // Tier 5. Global Category Policies
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

    const added = pushRule({
      id: nextRuleId++,
      priority: policy.action === 'allow' ? 15 : 10,
      action: { type: policy.action },
      condition
    });
    if (!added) return rules;
  }

  return rules;
}
