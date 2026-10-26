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

/**
 * Compiles extension AppSettings into chrome.declarativeNetRequest rules.
 */
export function compileSettingsToDNRRules(settings: AppSettings): DNRRule[] {
  if (!settings.globalProtectionEnabled) {
    return [];
  }

  const rules: DNRRule[] = [];
  let nextRuleId = 1;

  // 1. Paused Sites - Priority 1000 (Highest)
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused && domain) {
      rules.push({
        id: nextRuleId++,
        priority: 1000,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain]
        }
      });
    }
  }

  // 2. Global Custom Rules
  for (const rule of settings.customRules) {
    const isAllow = rule.action === 'allow';
    const isSiteScoped = !!rule.siteScope && rule.siteScope !== '*';
    const basePriority = isSiteScoped ? 200 : 100;
    const priority = isAllow ? basePriority + 10 : basePriority;

    const condition: DNRRule['condition'] = {
      urlFilter: rule.pattern.startsWith('*') ? rule.pattern : `*${rule.pattern}*`
    };

    if (isSiteScoped && rule.siteScope) {
      condition.initiatorDomains = [rule.siteScope];
    }

    if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
      condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
    }

    rules.push({
      id: nextRuleId++,
      priority,
      action: { type: isAllow ? 'allow' : 'block' },
      condition
    });
  }

  // 2b. Site-specific Custom Rules embedded in siteExceptions
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused || !exception.customRules) continue;

    for (const rule of exception.customRules) {
      const isAllow = rule.action === 'allow';
      const priority = isAllow ? 210 : 200;

      const condition: DNRRule['condition'] = {
        urlFilter: rule.pattern.startsWith('*') ? rule.pattern : `*${rule.pattern}*`,
        initiatorDomains: [domain]
      };

      if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
        condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
      }

      rules.push({
        id: nextRuleId++,
        priority,
        action: { type: isAllow ? 'allow' : 'block' },
        condition
      });
    }
  }

  // 3. Site Category Overrides - Priority 50
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

        rules.push({
          id: nextRuleId++,
          priority: action === 'allow' ? 60 : 50,
          action: { type: action },
          condition
        });
      }
    }
  }

  // 4. Global Category Rules - Priority 10
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

    rules.push({
      id: nextRuleId++,
      priority: policy.action === 'allow' ? 15 : 10,
      action: { type: policy.action },
      condition
    });
  }

  return rules;
}
