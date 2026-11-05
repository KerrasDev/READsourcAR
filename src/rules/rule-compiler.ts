import { AppSettings, ResourceCategory } from '../shared/types';

/**
 * Chromium dynamic rule limit is typically 5000 (chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES).
 * We enforce a safe dynamic limit to prevent exceeding browser quotas.
 */
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
    excludedSchemes?: string[];
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

export interface CompilationResult {
  rules: DNRRule[];
  warning?: string;
  totalGenerated: number;
}

/**
 * Validates whether a custom pattern is syntactically safe for DNR.
 * Avoids patterns that could self-block chrome or extension schemes.
 */
function sanitizePattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (trimmed.startsWith('*') || trimmed.startsWith('||') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `*${trimmed}*`;
}

/**
 * Compiles extension AppSettings into chrome.declarativeNetRequest rules with explicit 6-tier precedence:
 * Tier 1 (1000): Paused Sites / Mandatory safety allow rules
 * Tier 2 (210): Site-scoped explicit user allow rules
 * Tier 3 (200): Site-scoped explicit user block rules
 * Tier 4 (110): Global explicit user allow rules
 * Tier 5 (100): Global explicit user block rules
 * Tier 6 (50-60): Site category overrides (Allow: 60, Block: 50)
 * Tier 7 (10-15): Global category defaults (Allow: 15, Block: 10)
 */
export function compileSettingsToDNRRules(settings: AppSettings): DNRRule[] {
  const result = compileSettingsWithDiagnostics(settings);
  return result.rules;
}

/**
 * Compiles settings with diagnostics, bounding to MAX_SAFE_DYNAMIC_RULES.
 */
export function compileSettingsWithDiagnostics(settings: AppSettings): CompilationResult {
  if (!settings.globalProtectionEnabled) {
    return { rules: [], totalGenerated: 0 };
  }

  const rules: DNRRule[] = [];
  let nextRuleId = 1;
  let ruleLimitReached = false;

  const pushRule = (rule: Omit<DNRRule, 'id'>): boolean => {
    if (rules.length >= MAX_SAFE_DYNAMIC_RULES) {
      ruleLimitReached = true;
      return false;
    }
    // Safety guard: ensure rules do not intercept chrome-extension internal schemes
    const condition = {
      ...rule.condition,
      excludedSchemes: ['chrome-extension', 'moz-extension', 'about', 'data']
    };
    rules.push({
      ...rule,
      id: nextRuleId++,
      condition
    });
    return true;
  };

  // 1. Paused Sites - Priority 1000 (Highest safety precedence)
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused && domain) {
      if (!pushRule({
        priority: 1000,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain.toLowerCase()]
        }
      })) break;
    }
  }

  // 2. Custom User Rules: Site-scoped (Priority 200-210) & Global (Priority 100-110)
  for (const rule of settings.customRules) {
    if (!rule.pattern || rule.pattern.trim().length === 0) continue;

    const isAllow = rule.action === 'allow';
    const isSiteScoped = Boolean(rule.siteScope && rule.siteScope !== '*');
    const basePriority = isSiteScoped ? 200 : 100;
    const priority = isAllow ? basePriority + 10 : basePriority;

    const condition: DNRRule['condition'] = {
      urlFilter: sanitizePattern(rule.pattern)
    };

    if (isSiteScoped && rule.siteScope) {
      condition.initiatorDomains = [rule.siteScope.toLowerCase()];
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

  // 3. Site Category Overrides - Priority 50 (Block) / 60 (Allow)
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

        if (!pushRule({
          priority: action === 'allow' ? 60 : 50,
          action: { type: action },
          condition
        })) break;
      }
    }
  }

  // 4. Global Category Rules - Priority 10 (Block) / 15 (Allow)
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

    if (!pushRule({
      priority: policy.action === 'allow' ? 15 : 10,
      action: { type: policy.action },
      condition
    })) break;
  }

  return {
    rules,
    warning: ruleLimitReached
      ? `Maximum safe DNR rule count (${MAX_SAFE_DYNAMIC_RULES}) reached. Additional rules were omitted.`
      : undefined,
    totalGenerated: rules.length
  };
}
