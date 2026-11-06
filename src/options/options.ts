import { StorageManager, DEFAULT_SETTINGS } from '../shared/settings';
import { AppSettings, ResourceCategory, CustomRule } from '../shared/types';
import { getRegistrableDomain } from '../shared/url';

async function initOptions(): Promise<void> {
  const settings = await StorageManager.getSettings();
  renderPolicies(settings);
  renderCustomRules(settings);
  renderExceptions(settings);
  renderTranslationSettings(settings);
  renderPrivacySettings(settings);
  setupListeners();
}

function renderPolicies(settings: AppSettings): void {
  const container = document.getElementById('policyContainer');
  if (!container) return;

  container.innerHTML = '';
  const categories: Array<{ id: ResourceCategory; label: string; desc: string }> = [
    {
      id: 'thirdPartyScript',
      label: 'Third-Party Scripts',
      desc: 'Blocks scripts hosted on domains external to the main website (trackers, ad libraries).'
    },
    {
      id: 'script',
      label: 'All Scripts',
      desc: 'Blocks all JavaScript execution on all pages. Warning: May break interactive web pages.'
    },
    {
      id: 'iframe',
      label: 'Iframes & Embedded Frames',
      desc: 'Prevents loading nested subframes and third-party embeds.'
    },
    {
      id: 'image',
      label: 'Images',
      desc: 'Prevents fetching raster and vector images before download.'
    },
    {
      id: 'media',
      label: 'Media (Video/Audio)',
      desc: 'Blocks streaming video and audio network requests.'
    },
    {
      id: 'stylesheet',
      label: 'Stylesheets',
      desc: 'Blocks CSS stylesheet network downloads.'
    },
    {
      id: 'font',
      label: 'Fonts',
      desc: 'Blocks web font downloads (@font-face).'
    },
    {
      id: 'worker',
      label: 'Web Workers',
      desc: 'Blocks worker thread scripts and web socket connections.'
    },
    {
      id: 'popup',
      label: 'Popups & Unwanted Navigation',
      desc: 'Filters popup navigation and window openings.'
    }
  ];

  for (const cat of categories) {
    const card = document.createElement('div');
    card.className = 'policy-card';

    const header = document.createElement('div');
    header.className = 'policy-card-header';

    const label = document.createElement('span');
    label.textContent = cat.label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = settings.resourcePolicies[cat.id]?.enabled || false;
    checkbox.addEventListener('change', async () => {
      const curr = await StorageManager.getSettings();
      curr.resourcePolicies[cat.id].enabled = checkbox.checked;
      await StorageManager.saveSettings(curr);
    });

    header.appendChild(label);
    header.appendChild(checkbox);

    const desc = document.createElement('p');
    desc.className = 'policy-explanation';
    desc.textContent = cat.desc;

    card.appendChild(header);
    card.appendChild(desc);
    container.appendChild(card);
  }
}

function renderCustomRules(settings: AppSettings): void {
  const list = document.getElementById('customRulesList');
  if (!list) return;

  list.innerHTML = '';
  if (!settings.customRules || settings.customRules.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'rule-item';
    empty.textContent = 'No custom rules defined yet.';
    list.appendChild(empty);
    return;
  }

  for (const rule of settings.customRules) {
    const li = document.createElement('li');
    li.className = 'rule-item';

    const span = document.createElement('span');
    const scopeStr = rule.siteScope && rule.siteScope !== '*' ? ` [Scope: ${rule.siteScope}]` : ' [Global]';
    span.textContent = `${rule.action.toUpperCase()}: ${rule.pattern}${scopeStr}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'danger-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      const curr = await StorageManager.getSettings();
      curr.customRules = curr.customRules.filter((r) => r.id !== rule.id);
      await StorageManager.saveSettings(curr);
      renderCustomRules(curr);
    });

    li.appendChild(span);
    li.appendChild(removeBtn);
    list.appendChild(li);
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
    empty.textContent = 'No site exceptions added.';
    list.appendChild(empty);
    return;
  }

  for (const [domain, exception] of entries) {
    const li = document.createElement('li');
    li.className = 'exception-item';

    const span = document.createElement('span');
    span.textContent = `${domain} ${exception.paused ? '(Paused)' : '(Custom Active)'}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'danger-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      const curr = await StorageManager.getSettings();
      delete curr.siteExceptions[domain];
      await StorageManager.saveSettings(curr);
      renderExceptions(curr);
    });

    li.appendChild(span);
    li.appendChild(removeBtn);
    list.appendChild(li);
  }
}

function renderTranslationSettings(settings: AppSettings): void {
  const modeSelect = document.getElementById('transMode') as HTMLSelectElement;
  const providerSelect = document.getElementById('providerType') as HTMLSelectElement;
  const customApiFields = document.getElementById('customApiFields');
  const endpointInput = document.getElementById('apiEndpoint') as HTMLInputElement;
  const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  const maxCacheInput = document.getElementById('maxCacheEntries') as HTMLInputElement;
  const concurrencyInput = document.getElementById('concurrencyLimit') as HTMLInputElement;

  if (modeSelect) modeSelect.value = settings.translation.mode;
  if (providerSelect) providerSelect.value = settings.translation.provider.type;
  if (endpointInput) endpointInput.value = settings.translation.provider.endpoint || '';
  if (apiKeyInput) apiKeyInput.value = settings.translation.provider.apiKey || '';
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
  const clearStatsCheckbox = document.getElementById('clearStatsOnRestart') as HTMLInputElement;
  if (clearStatsCheckbox) {
    clearStatsCheckbox.checked = settings.privacy.clearStatsOnRestart;
  }
}

function setupListeners(): void {
  document.getElementById('addRuleBtn')?.addEventListener('click', async () => {
    const patternInput = document.getElementById('newRulePattern') as HTMLInputElement;
    const actionSelect = document.getElementById('newRuleAction') as HTMLSelectElement;
    const scopeInput = document.getElementById('newRuleScope') as HTMLInputElement;

    const pattern = patternInput.value.trim();
    if (!pattern) return;

    const newRule: CustomRule = {
      id: 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      pattern,
      action: (actionSelect.value as 'allow' | 'block') || 'block',
      siteScope: scopeInput.value.trim() || undefined,
      createdAt: Date.now()
    };

    const settings = await StorageManager.getSettings();
    settings.customRules.push(newRule);
    await StorageManager.saveSettings(settings);

    patternInput.value = '';
    scopeInput.value = '';
    renderCustomRules(settings);
  });

  document.getElementById('addExceptionBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newExceptionDomain') as HTMLInputElement;
    if (!input || !input.value.trim()) return;

    const domain = getRegistrableDomain(input.value.trim());
    if (!domain) return;

    const settings = await StorageManager.getSettings();
    settings.siteExceptions[domain] = { domain, paused: true };
    await StorageManager.saveSettings(settings);

    input.value = '';
    renderExceptions(settings);
  });

  document.getElementById('transMode')?.addEventListener('change', async (e) => {
    const select = e.target as HTMLSelectElement;
    const settings = await StorageManager.getSettings();
    settings.translation.mode = select.value as any;
    await StorageManager.saveSettings(settings);
  });

  document.getElementById('providerType')?.addEventListener('change', async (e) => {
    const select = e.target as HTMLSelectElement;
    const settings = await StorageManager.getSettings();
    settings.translation.provider.type = select.value as any;
    await StorageManager.saveSettings(settings);
    renderTranslationSettings(settings);
  });

  document.getElementById('apiEndpoint')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.translation.provider.endpoint = input.value.trim();
    await StorageManager.saveSettings(settings);
  });

  document.getElementById('apiKey')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.translation.provider.apiKey = input.value.trim();
    await StorageManager.saveSettings(settings);
  });

  document.getElementById('maxCacheEntries')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val > 0) {
      const settings = await StorageManager.getSettings();
      settings.translation.maxCacheEntries = Math.min(2000, Math.max(50, val));
      await StorageManager.saveSettings(settings);
    }
  });

  document.getElementById('concurrencyLimit')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val > 0) {
      const settings = await StorageManager.getSettings();
      settings.translation.concurrencyLimit = Math.min(5, Math.max(1, val));
      await StorageManager.saveSettings(settings);
    }
  });

  document.getElementById('clearStatsOnRestart')?.addEventListener('change', async (e) => {
    const checkbox = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.privacy.clearStatsOnRestart = checkbox.checked;
    await StorageManager.saveSettings(settings);
  });

  document.getElementById('resetDefaultsBtn')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      await StorageManager.saveSettings(DEFAULT_SETTINGS);
      initOptions();
    }
  });

  document.getElementById('exportSettingsBtn')?.addEventListener('click', async () => {
    const settings = await StorageManager.getSettings();
    // Strip sensitive fields
    const exportable = JSON.parse(JSON.stringify(settings));
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
      } catch (err) {
        alert('Failed to parse settings JSON file.');
      }
    };
    reader.readAsText(file);
  });
}

document.addEventListener('DOMContentLoaded', initOptions);
