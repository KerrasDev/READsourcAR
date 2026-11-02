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
 * Sanitizes pattern input into a valid DNR urlFilter.
 */
export function sanitizeUrlFilter(pattern: string): string {
  const trimmed = pattern.trim();
  if (!trimmed) return '*';
  // If pattern already begins or ends with wildcard or separator, preserve
  if (trimmed.startsWith('*') || trimmed.startsWith('||') || trimmed.startsWith('|') || trimmed.startsWith('http')) {
    return trimmed;
  }
  return `*${trimmed}*`;
}

/**
 * Compiles extension AppSettings into chrome.declarativeNetRequest rules with
 * quota enforcement and strict precedence ordering:
 * 1. Paused Sites (Priority 1000)
 * 2. Site-Scoped Custom Allow (Priority 210)
 * 3. Site-Scoped Custom Block (Priority 200)
 * 4. Global Custom Allow (Priority 110)
 * 5. Global Custom Block (Priority 100)
 * 6. Site Category Allow Overrides (Priority 60)
 * 7. Site Category Block Overrides (Priority 50)
 * 8. Global Category Policies (Priority 15 for allow, 10 for block)
 */
export function compileSettingsToDNRRules(settings: AppSettings): DNRRule[] {
  if (!settings.globalProtectionEnabled) {
    return [];
  }

  const rules: DNRRule[] = [];
  let nextRuleId = 1;

  const pushRule = (rule: DNRRule): boolean => {
    if (rules.length >= MAX_SAFE_DYNAMIC_RULES) {
      console.warn(`Dynamic rule quota reached (${MAX_SAFE_DYNAMIC_RULES}). Truncating further rules.`);
      return false;
    }
    rules.push(rule);
    return true;
  };

  // 1. Paused Sites - Priority 1000 (Highest)
  for (const [domain, exception] of Object.entries(settings.siteExceptions || {})) {
    if (exception.paused && domain) {
      if (!pushRule({
        id: nextRuleId++,
        priority: 1000,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain]
        }
      })) break;
    }
  }

  // 2. Custom Rules (Site-scoped first, then global)
  for (const rule of settings.customRules || []) {
    const isAllow = rule.action === 'allow';
    const isSiteScoped = !!rule.siteScope && rule.siteScope !== '*';
    const basePriority = isSiteScoped ? 200 : 100;
    const priority = isAllow ? basePriority + 10 : basePriority;

    const condition: DNRRule['condition'] = {
      urlFilter: sanitizeUrlFilter(rule.pattern)
    };

    if (isSiteScoped && rule.siteScope) {
      condition.initiatorDomains = [rule.siteScope];
    }

    if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
      condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
    }

    if (!pushRule({
      id: nextRuleId++,
      priority,
      action: { type: isAllow ? 'allow' : 'block' },
      condition
    })) break;
  }

  // 3. Site Category Overrides
  for (const [domain, exception] of Object.entries(settings.siteExceptions || {})) {
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

        if (!pushRule({
          id: nextRuleId++,
          priority: action === 'allow' ? 60 : 50,
          action: { type: action },
          condition
        })) break;
      }
    }
  }

  // 4. Global Category Rules
  for (const [catStr, policy] of Object.entries(settings.resourcePolicies || {})) {
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

    if (!pushRule({
      id: nextRuleId++,
      priority: policy.action === 'allow' ? 15 : 10,
      action: { type: policy.action },
      condition
    })) break;
  }

  return rules;
}
