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

export interface RuleCompilationResult {
  rules: DNRRule[];
  totalGenerated: number;
  limitExceeded: boolean;
  warnings: string[];
}

/**
 * Maximum safe dynamic rules under Chrome declarativeNetRequest.
 * Chrome standard dynamic rule limit is 5,000 for regular dynamic rules.
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
 * Compiles extension AppSettings into declarativeNetRequest rules following a strict
 * 6-tier precedence model:
 *
 * Tier 1: Mandatory browser/extension safety constraints (Priority 5000)
 * Tier 2: Explicit user / site allow rules (Priority 1000 for paused domains, 210 for site allow, 110 for global allow)
 * Tier 3: Explicit user / site block rules (Priority 200 for site block, 100 for global block)
 * Tier 4: Per-site category overrides (Priority 60 for allow override, 50 for block override)
 * Tier 5: Global category settings (Priority 15 for allow, 10 for block)
 * Tier 6: Default allow behavior (implied DNR default when no block rule matches)
 */
export function compileSettingsToDNRRulesDetailed(settings: AppSettings): RuleCompilationResult {
  const warnings: string[] = [];
  if (!settings.globalProtectionEnabled) {
    return {
      rules: [],
      totalGenerated: 0,
      limitExceeded: false,
      warnings
    };
  }

  const generatedRules: DNRRule[] = [];
  let nextRuleId = 1;

  // Tier 1: Browser & Extension Safety Constraints (Priority 5000)
  // Ensure extension internal requests & critical protocol schemes are never blocked
  generatedRules.push({
    id: nextRuleId++,
    priority: 5000,
    action: { type: 'allow' },
    condition: {
      urlFilter: 'chrome-extension://*'
    }
  });

  // Tier 2A: Paused Sites - Allow all requests originating from this domain (Priority 1000)
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused && domain) {
      generatedRules.push({
        id: nextRuleId++,
        priority: 1000,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain]
        }
      });
    }
  }

  // Tier 2B & 3: Explicit User Allow/Block Rules
  // Site-scoped user rules take precedence over global user rules
  for (const rule of settings.customRules) {
    const isAllow = rule.action === 'allow';
    const isSiteScoped = !!rule.siteScope && rule.siteScope !== '*';
    const basePriority = isSiteScoped ? 200 : 100;
    // Allow rules get +10 to win over block rules at the same scope tier
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

    generatedRules.push({
      id: nextRuleId++,
      priority,
      action: { type: isAllow ? 'allow' : 'block' },
      condition
    });
  }

  // Tier 4: Per-site category overrides (Priority 60 for allow, 50 for block)
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

        generatedRules.push({
          id: nextRuleId++,
          priority: action === 'allow' ? 60 : 50,
          action: { type: action },
          condition
        });
      }
    }
  }

  // Tier 5: Global Category Policies (Priority 15 for allow, 10 for block)
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

    generatedRules.push({
      id: nextRuleId++,
      priority: policy.action === 'allow' ? 15 : 10,
      action: { type: policy.action },
      condition
    });
  }

  const totalGenerated = generatedRules.length;
  let limitExceeded = false;
  let finalRules = generatedRules;

  if (totalGenerated > MAX_SAFE_DYNAMIC_RULES) {
    limitExceeded = true;
    warnings.push(
      `Rule limit exceeded: Generated ${totalGenerated} rules, which exceeds the safe dynamic rule quota of ${MAX_SAFE_DYNAMIC_RULES}. Truncating to highest priority rules.`
    );
    // Sort descending by priority so most important rules survive truncation
    finalRules = [...generatedRules]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_SAFE_DYNAMIC_RULES);
  }

  return {
    rules: finalRules,
    totalGenerated,
    limitExceeded,
    warnings
  };
}

/**
 * Standard rule compilation returning DNRRule array for chrome API consumption.
 */
export function compileSettingsToDNRRules(settings: AppSettings): DNRRule[] {
  return compileSettingsToDNRRulesDetailed(settings).rules;
}
