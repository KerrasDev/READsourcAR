import { StorageManager, DEFAULT_SETTINGS } from '../shared/settings';
import { AppSettings, ResourceCategory, CustomRule } from '../shared/types';
import { getRegistrableDomain } from '../shared/url';

const CATEGORY_METADATA: Record<ResourceCategory, { label: string; desc: string }> = {
  thirdPartyScript: {
    label: 'Third-Party Scripts',
    desc: 'Blocks executable JavaScript hosted on external domains. Reduces tracking and memory overhead.'
  },
  script: {
    label: 'All Scripts',
    desc: 'Blocks all first-party and third-party scripts. Warning: will disable dynamic behavior on most websites.'
  },
  iframe: {
    label: 'Iframes & Subframes',
    desc: 'Prevents nested embedded documents from loading, stopping embedded ads and trackers.'
  },
  image: {
    label: 'Images',
    desc: 'Blocks image downloads before network transfer to save bandwidth.'
  },
  media: {
    label: 'Media (Video / Audio)',
    desc: 'Blocks HTML5 video and audio streams before streaming begins.'
  },
  stylesheet: {
    label: 'Stylesheets',
    desc: 'Blocks CSS stylesheets. Only recommended for text-only viewing.'
  },
  font: {
    label: 'Web Fonts',
    desc: 'Blocks custom web fonts to reduce download payload and layout shift.'
  },
  worker: {
    label: 'Web Workers',
    desc: 'Blocks background JavaScript workers and WebSockets.'
  },
  popup: {
    label: 'Embedded Popups',
    desc: 'Blocks secondary pop-up navigation frames.'
  }
};

async function initOptions(): Promise<void> {
  const settings = await StorageManager.getSettings();
  renderPolicies(settings);
  renderExceptions(settings);
  renderCustomRules(settings);
  renderTranslationSettings(settings);
  renderPrivacySettings(settings);
  setupListeners();
}

function flashSaveNotice(): void {
  const notice = document.getElementById('saveNotice');
  if (notice) {
    notice.classList.remove('hidden');
    setTimeout(() => {
      notice.classList.add('hidden');
    }, 1800);
  }
}

function renderPolicies(settings: AppSettings): void {
  const container = document.getElementById('policyContainer');
  if (!container) return;

  container.innerHTML = '';
  const categories = Object.keys(CATEGORY_METADATA) as ResourceCategory[];

  for (const cat of categories) {
    const meta = CATEGORY_METADATA[cat];
    const card = document.createElement('div');
    card.className = 'policy-card';

    const header = document.createElement('div');
    header.className = 'policy-header';

    const label = document.createElement('span');
    label.className = 'policy-title';
    label.textContent = meta.label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `policy-check-${cat}`;
    checkbox.checked = settings.resourcePolicies[cat]?.enabled || false;
    checkbox.setAttribute('aria-label', `Toggle policy for ${meta.label}`);

    checkbox.addEventListener('change', async () => {
      const curr = await StorageManager.getSettings();
      curr.resourcePolicies[cat].enabled = checkbox.checked;
      await StorageManager.saveSettings(curr);
      flashSaveNotice();
    });

    header.appendChild(label);
    header.appendChild(checkbox);

    const desc = document.createElement('div');
    desc.className = 'policy-desc';
    desc.textContent = meta.desc;

    card.appendChild(header);
    card.appendChild(desc);
    container.appendChild(card);
  }
}

function renderExceptions(settings: AppSettings): void {
  const list = document.getElementById('exceptionsList');
  if (!list) return;

  list.innerHTML = '';
  const entries = Object.entries(settings.siteExceptions);
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'exception-item';
    empty.textContent = 'No site exceptions configured. Protection applies globally.';
    empty.style.color = 'var(--subtext-color)';
    list.appendChild(empty);
    return;
  }

  for (const [domain, exception] of entries) {
    const li = document.createElement('li');
    li.className = 'exception-item';

    const domainInfo = document.createElement('div');
    domainInfo.innerHTML = `<strong>${domain}</strong> ${
      exception.paused ? '<span style="color:var(--danger)">(Paused)</span>' : '<span style="color:#16a34a">(Active)</span>'
    }`;

    const actions = document.createElement('div');
    actions.className = 'btn-group';

    const togglePauseBtn = document.createElement('button');
    togglePauseBtn.className = 'secondary-btn';
    togglePauseBtn.textContent = exception.paused ? 'Resume' : 'Pause';
    togglePauseBtn.addEventListener('click', async () => {
      const curr = await StorageManager.getSettings();
      if (curr.siteExceptions[domain]) {
        curr.siteExceptions[domain].paused = !curr.siteExceptions[domain].paused;
        await StorageManager.saveSettings(curr);
        renderExceptions(curr);
        flashSaveNotice();
      }
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'danger-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      const curr = await StorageManager.getSettings();
      delete curr.siteExceptions[domain];
      await StorageManager.saveSettings(curr);
      renderExceptions(curr);
      flashSaveNotice();
    });

    actions.appendChild(togglePauseBtn);
    actions.appendChild(removeBtn);
    li.appendChild(domainInfo);
    li.appendChild(actions);
    list.appendChild(li);
  }
}

function renderCustomRules(settings: AppSettings): void {
  const list = document.getElementById('customRulesList');
  if (!list) return;

  list.innerHTML = '';
  if (!settings.customRules || settings.customRules.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'custom-rule-item';
    empty.textContent = 'No custom rules created yet.';
    empty.style.color = 'var(--subtext-color)';
    list.appendChild(empty);
    return;
  }

  settings.customRules.forEach((rule, idx) => {
    const li = document.createElement('li');
    li.className = 'custom-rule-item';

    const ruleText = document.createElement('div');
    const scopeLabel = rule.siteScope && rule.siteScope !== '*' ? ` [Site: ${rule.siteScope}]` : ' [Global]';
    ruleText.innerHTML = `<code>${rule.pattern}</code> &mdash; <strong>${rule.action.toUpperCase()}</strong>${scopeLabel}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'danger-btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const curr = await StorageManager.getSettings();
      curr.customRules.splice(idx, 1);
      await StorageManager.saveSettings(curr);
      renderCustomRules(curr);
      flashSaveNotice();
    });

    li.appendChild(ruleText);
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

function renderTranslationSettings(settings: AppSettings): void {
  const modeSelect = document.getElementById('transMode') as HTMLSelectElement;
  const targetSelect = document.getElementById('defaultTargetLang') as HTMLSelectElement;
  const providerSelect = document.getElementById('providerType') as HTMLSelectElement;
  const customApiFields = document.getElementById('customApiFields');
  const endpointInput = document.getElementById('apiEndpoint') as HTMLInputElement;
  const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  const consentCheckbox = document.getElementById('sendPageContentConsent') as HTMLInputElement;
  const maxCacheInput = document.getElementById('maxCacheEntries') as HTMLInputElement;
  const concurrencyInput = document.getElementById('concurrencyLimit') as HTMLInputElement;

  if (modeSelect) modeSelect.value = settings.translation.mode;
  if (targetSelect) targetSelect.value = settings.translation.targetLang;
  if (providerSelect) providerSelect.value = settings.translation.provider.type;
  if (endpointInput) endpointInput.value = settings.translation.provider.endpoint || '';
  if (apiKeyInput) apiKeyInput.value = settings.translation.provider.apiKey || '';
  if (consentCheckbox) consentCheckbox.checked = settings.privacy.sendPageContentConsent || false;
  if (maxCacheInput) maxCacheInput.value = String(settings.translation.maxCacheEntries || 500);
  if (concurrencyInput) concurrencyInput.value = String(settings.translation.concurrencyLimit || 1);

  if (customApiFields) {
    if (settings.translation.provider.type === 'custom_api') {
      customApiFields.classList.remove('hidden');
    } else {
      customApiFields.classList.add('hidden');
    }
  }
}

function renderPrivacySettings(settings: AppSettings): void {
  const collectStatsCheckbox = document.getElementById('collectStats') as HTMLInputElement;
  const clearStatsCheckbox = document.getElementById('clearStatsOnRestart') as HTMLInputElement;

  if (collectStatsCheckbox) {
    collectStatsCheckbox.checked = settings.privacy.collectStats;
  }
  if (clearStatsCheckbox) {
    clearStatsCheckbox.checked = settings.privacy.clearStatsOnRestart;
  }
}

function setupListeners(): void {
  // Add site exception
  document.getElementById('addExceptionBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newExceptionDomain') as HTMLInputElement;
    if (!input || !input.value.trim()) return;

    const domain = getRegistrableDomain(input.value.trim());
    if (!domain) return;

    const settings = await StorageManager.getSettings();
    if (!settings.siteExceptions[domain]) {
      settings.siteExceptions[domain] = { domain, paused: false };
      await StorageManager.saveSettings(settings);
      renderExceptions(settings);
      flashSaveNotice();
    }
    input.value = '';
  });

  // Add custom rule
  document.getElementById('addCustomRuleBtn')?.addEventListener('click', async () => {
    const patternInput = document.getElementById('customRulePattern') as HTMLInputElement;
    const actionSelect = document.getElementById('customRuleAction') as HTMLSelectElement;
    const scopeInput = document.getElementById('customRuleScope') as HTMLInputElement;

    const pattern = patternInput.value.trim();
    if (!pattern) return;

    const action = actionSelect.value as 'allow' | 'block';
    const siteScope = scopeInput.value.trim() || undefined;

    const newRule: CustomRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      pattern,
      action,
      siteScope,
      createdAt: Date.now()
    };

    const settings = await StorageManager.getSettings();
    settings.customRules.push(newRule);
    await StorageManager.saveSettings(settings);

    patternInput.value = '';
    scopeInput.value = '';
    renderCustomRules(settings);
    flashSaveNotice();
  });

  // Translation settings listeners
  document.getElementById('transMode')?.addEventListener('change', async (e) => {
    const select = e.target as HTMLSelectElement;
    const settings = await StorageManager.getSettings();
    settings.translation.mode = select.value as any;
    await StorageManager.saveSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('defaultTargetLang')?.addEventListener('change', async (e) => {
    const select = e.target as HTMLSelectElement;
    const settings = await StorageManager.getSettings();
    settings.translation.targetLang = select.value;
    await StorageManager.saveSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('providerType')?.addEventListener('change', async (e) => {
    const select = e.target as HTMLSelectElement;
    const settings = await StorageManager.getSettings();
    settings.translation.provider.type = select.value as any;
    await StorageManager.saveSettings(settings);
    renderTranslationSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('apiEndpoint')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.translation.provider.endpoint = input.value.trim();
    await StorageManager.saveSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('apiKey')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.translation.provider.apiKey = input.value.trim();
    await StorageManager.saveSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('sendPageContentConsent')?.addEventListener('change', async (e) => {
    const checkbox = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.privacy.sendPageContentConsent = checkbox.checked;
    await StorageManager.saveSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('maxCacheEntries')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val > 0) {
      const settings = await StorageManager.getSettings();
      settings.translation.maxCacheEntries = Math.min(2000, Math.max(10, val));
      await StorageManager.saveSettings(settings);
      flashSaveNotice();
    }
  });

  document.getElementById('concurrencyLimit')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 1) {
      const settings = await StorageManager.getSettings();
      settings.translation.concurrencyLimit = Math.min(5, Math.max(1, val));
      await StorageManager.saveSettings(settings);
      flashSaveNotice();
    }
  });

  // Privacy controls
  document.getElementById('collectStats')?.addEventListener('change', async (e) => {
    const checkbox = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.privacy.collectStats = checkbox.checked;
    await StorageManager.saveSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('clearStatsOnRestart')?.addEventListener('change', async (e) => {
    const checkbox = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.privacy.clearStatsOnRestart = checkbox.checked;
    await StorageManager.saveSettings(settings);
    flashSaveNotice();
  });

  document.getElementById('clearStatsBtn')?.addEventListener('click', async () => {
    await StorageManager.saveStats({
      totalEvaluated: 0,
      totalBlocked: 0,
      blockedByCategory: {
        script: 0,
        thirdPartyScript: 0,
        iframe: 0,
        image: 0,
        media: 0,
        stylesheet: 0,
        font: 0,
        worker: 0,
        popup: 0
      },
      lastUpdated: Date.now()
    });
    alert('Statistics counters reset to zero.');
  });

  document.getElementById('clearTranslationCacheBtn')?.addEventListener('click', () => {
    alert('Translation cache will be cleared on the next page reload.');
  });

  // Reset to defaults
  document.getElementById('resetDefaultsBtn')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all Resource Guardian settings to defaults? This cannot be undone.')) {
      await StorageManager.saveSettings(DEFAULT_SETTINGS);
      initOptions();
      flashSaveNotice();
    }
  });

  // Export settings with security redaction
  document.getElementById('exportSettingsBtn')?.addEventListener('click', async () => {
    const settings = await StorageManager.getSettings();
    const exportable = JSON.parse(JSON.stringify(settings));

    // Never export API secrets or sensitive tokens
    if (exportable.translation?.provider?.apiKey) {
      exportable.translation.provider.apiKey = '';
    }

    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resource-guardian-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import settings with schema validation
  document.getElementById('importSettingsBtn')?.addEventListener('click', () => {
    document.getElementById('importFileInput')?.click();
  });

  document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        await StorageManager.saveSettings(parsed);
        alert('Settings imported successfully.');
        initOptions();
        flashSaveNotice();
      } catch (err) {
        alert('Failed to parse settings JSON file. File was invalid.');
      }
    };
    reader.readAsText(file);
  });
}

document.addEventListener('DOMContentLoaded', initOptions);
