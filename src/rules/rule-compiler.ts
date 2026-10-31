import { AppSettings, ResourceCategory } from '../shared/types';

export interface DNRRule {
  id: number;
  priority: number;
  action: {
    type: 'block' | 'allow';
  };
  condition: {
    urlFilter?: string;
    regexFilter?: string;
    resourceTypes?: string[];
    domainType?: 'firstParty' | 'thirdParty';
    initiatorDomains?: string[];
    excludedInitiatorDomains?: string[];
    requestDomains?: string[];
    excludedRequestDomains?: string[];
  };
}

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

export interface CompilationResult {
  rules: DNRRule[];
  warning?: string;
  totalCompiled: number;
  totalTruncated: number;
}

/**
 * Compiles extension AppSettings into chrome.declarativeNetRequest dynamic rules
 * using a deterministic 6-tier precedence model:
 *
 * Tier 1 (Priority 2000): Browser & Extension safety constraints
 * Tier 2 (Priority 1500-1600): Explicit User Allow Rules & Paused Site Exceptions
 * Tier 3 (Priority 1000-1050): Explicit User Block Rules
 * Tier 4 (Priority 500-550): Per-site Category Overrides
 * Tier 5 (Priority 100-150): Global Category Settings
 * Tier 6 (Default): Browser native allow
 */
export function compileSettingsToDNRRules(settings: AppSettings): DNRRule[] {
  const result = compileSettingsWithTelemetry(settings);
  return result.rules;
}

export function compileSettingsWithTelemetry(settings: AppSettings): CompilationResult {
  if (!settings.globalProtectionEnabled) {
    return {
      rules: [],
      totalCompiled: 0,
      totalTruncated: 0
    };
  }

  const rawRules: DNRRule[] = [];
  let tempId = 1;

  // --- Tier 1: Safety Constraints (Priority 2000) ---
  // Ensure extension internals and critical data URIs are never inadvertently blocked
  const internalSchemes = ['chrome-extension:', 'moz-extension:', 'about:', 'data:'];
  for (const scheme of internalSchemes) {
    rawRules.push({
      id: tempId++,
      priority: 2000,
      action: { type: 'allow' },
      condition: {
        urlFilter: `${scheme}*`
      }
    });
  }

  // --- Tier 2: Explicit User Allow Rules (Priority 1500 - 1600) ---
  // Paused Sites bypass all protection for requests initiated from that site
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    if (exception.paused && domain) {
      rawRules.push({
        id: tempId++,
        priority: 1600,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain]
        }
      });
    }
  }

  // Custom User Allow Rules
  for (const rule of settings.customRules) {
    if (rule.action !== 'allow') continue;

    const isSiteScoped = Boolean(rule.siteScope && rule.siteScope !== '*');
    const priority = isSiteScoped ? 1550 : 1500;

    const condition: DNRRule['condition'] = {
      urlFilter: rule.pattern.startsWith('*') ? rule.pattern : `*${rule.pattern}*`
    };

    if (isSiteScoped && rule.siteScope) {
      condition.initiatorDomains = [rule.siteScope];
    }

    if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
      condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
    }

    rawRules.push({
      id: tempId++,
      priority,
      action: { type: 'allow' },
      condition
    });
  }

  // --- Tier 3: Explicit User Block Rules (Priority 1000 - 1050) ---
  for (const rule of settings.customRules) {
    if (rule.action !== 'block') continue;

    const isSiteScoped = Boolean(rule.siteScope && rule.siteScope !== '*');
    const priority = isSiteScoped ? 1050 : 1000;

    const condition: DNRRule['condition'] = {
      urlFilter: rule.pattern.startsWith('*') ? rule.pattern : `*${rule.pattern}*`
    };

    if (isSiteScoped && rule.siteScope) {
      condition.initiatorDomains = [rule.siteScope];
    }

    if (rule.category && CATEGORY_RESOURCE_TYPES[rule.category]) {
      condition.resourceTypes = CATEGORY_RESOURCE_TYPES[rule.category];
    }

    rawRules.push({
      id: tempId++,
      priority,
      action: { type: 'block' },
      condition
    });
  }

  // --- Tier 4: Per-Site Category Overrides (Priority 500 - 550) ---
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

        const isAllow = action === 'allow';
        rawRules.push({
          id: tempId++,
          priority: isAllow ? 550 : 500,
          action: { type: action },
          condition
        });
      }
    }
  }

  // --- Tier 5: Global Category Settings (Priority 100 - 150) ---
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

    const isAllow = policy.action === 'allow';
    rawRules.push({
      id: tempId++,
      priority: isAllow ? 150 : 100,
      action: { type: policy.action },
      condition
    });
  }

  // Safety Truncation & ID Reassignment:
  // Sort rules by priority descending so high-priority safety & user allow rules are preserved
  rawRules.sort((a, b) => b.priority - a.priority);

  const totalCompiled = rawRules.length;
  let finalRules = rawRules;
  let totalTruncated = 0;
  let warning: string | undefined;

  if (rawRules.length > MAX_SAFE_DYNAMIC_RULES) {
    totalTruncated = rawRules.length - MAX_SAFE_DYNAMIC_RULES;
    finalRules = rawRules.slice(0, MAX_SAFE_DYNAMIC_RULES);
    warning = `Rule limit reached (${MAX_SAFE_DYNAMIC_RULES}). Truncated ${totalTruncated} lower-priority rules.`;
  }

  // Re-assign continuous, 1-based IDs required by declarativeNetRequest
  finalRules.forEach((rule, idx) => {
    rule.id = idx + 1;
  });

  return {
    rules: finalRules,
    warning,
    totalCompiled,
    totalTruncated
  };
}
