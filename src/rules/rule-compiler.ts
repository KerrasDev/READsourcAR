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

const CATEGORY_RESOURCE_TYPES: Record<ResourceCategory, string[]> = {
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

export const MAX_DNR_DYNAMIC_RULES = 5000;

export interface CompilationResult {
  rules: DNRRule[];
  overflow: boolean;
  totalGenerated: number;
}

/**
 * Compiles extension AppSettings into chrome.declarativeNetRequest rules with precedence and safety limits.
 */
export function compileSettingsToDNRRules(
  settings: AppSettings,
  maxRules: number = MAX_DNR_DYNAMIC_RULES
): DNRRule[] {
  const result = compileSettingsToDNRRulesDetailed(settings, maxRules);
  return result.rules;
}

/**
 * Detailed compilation function returning rules along with overflow state.
 */
export function compileSettingsToDNRRulesDetailed(
  settings: AppSettings,
  maxRules: number = MAX_DNR_DYNAMIC_RULES
): CompilationResult {
  if (!settings.globalProtectionEnabled) {
    return { rules: [], overflow: false, totalGenerated: 0 };
  }

  const allRules: DNRRule[] = [];
  let nextRuleId = 1;

  // 1. Paused Sites (Safety Constraint / User Override) - Priority 1000
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused && domain) {
      allRules.push({
        id: nextRuleId++,
        priority: 1000,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain]
        }
      });
    }
  }

  // 2. Custom Rules (Explicit user rules)
  // Precedence: Site Allow (300) > Site Block (200) > Global Allow (150) > Global Block (100)
  for (const rule of settings.customRules) {
    const isAllow = rule.action === 'allow';
    const isSiteScoped = !!rule.siteScope && rule.siteScope !== '*';
    let priority: number;

    if (isSiteScoped) {
      priority = isAllow ? 300 : 200;
    } else {
      priority = isAllow ? 150 : 100;
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

    allRules.push({
      id: nextRuleId++,
      priority,
      action: { type: isAllow ? 'allow' : 'block' },
      condition
    });
  }

  // 3. Site Category Overrides - Priority 60 (Allow) / 50 (Block)
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

        allRules.push({
          id: nextRuleId++,
          priority: action === 'allow' ? 60 : 50,
          action: { type: action },
          condition
        });
      }
    }
  }

  // 4. Global Category Rules - Priority 15 (Allow) / 10 (Block)
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

    allRules.push({
      id: nextRuleId++,
      priority: policy.action === 'allow' ? 15 : 10,
      action: { type: policy.action },
      condition
    });
  }

  const overflow = allRules.length > maxRules;
  const rules = overflow ? allRules.slice(0, maxRules) : allRules;

  return {
    rules,
    overflow,
    totalGenerated: allRules.length
  };
}
