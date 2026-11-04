import { StorageManager, DEFAULT_SETTINGS } from '../shared/settings';
import { AppSettings, ResourceCategory } from '../shared/types';
import { getRegistrableDomain } from '../shared/url';

async function initOptions(): Promise<void> {
  const settings = await StorageManager.getSettings();
  renderPolicies(settings);
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
    { id: 'thirdPartyScript', label: 'Third-Party Scripts', desc: 'Blocks cross-domain scripts from external tracking or advertising hosts.' },
    { id: 'script', label: 'All Scripts', desc: 'Blocks all JavaScript execution on pages (use cautiously).' },
    { id: 'iframe', label: 'Iframes', desc: 'Prevents embedded subframes and cross-origin documents.' },
    { id: 'image', label: 'Images', desc: 'Saves bandwidth by blocking image assets from loading.' },
    { id: 'media', label: 'Media (Video/Audio)', desc: 'Blocks video and audio streams from downloading.' },
    { id: 'stylesheet', label: 'Stylesheets', desc: 'Blocks CSS stylesheets from loading.' },
    { id: 'font', label: 'Fonts', desc: 'Blocks external web fonts.' },
    { id: 'worker', label: 'Web Workers', desc: 'Blocks background web worker execution.' },
    { id: 'popup', label: 'Popups', desc: 'Blocks popup subframe navigations.' }
  ];

  for (const cat of categories) {
    const card = document.createElement('div');
    card.className = 'policy-card';

    const info = document.createElement('div');
    const label = document.createElement('span');
    label.className = 'policy-title';
    label.textContent = cat.label;

    const desc = document.createElement('p');
    desc.className = 'policy-desc';
    desc.textContent = cat.desc;

    info.appendChild(label);
    info.appendChild(desc);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `Toggle ${cat.label}`);
    checkbox.checked = settings.resourcePolicies[cat.id]?.enabled || false;
    checkbox.addEventListener('change', async () => {
      const curr = await StorageManager.getSettings();
      curr.resourcePolicies[cat.id].enabled = checkbox.checked;
      await StorageManager.saveSettings(curr);
    });

    card.appendChild(info);
    card.appendChild(checkbox);
    container.appendChild(card);
  }
}

function renderExceptions(settings: AppSettings): void {
  const list = document.getElementById('exceptionsList');
  if (!list) return;

  list.innerHTML = '';
  for (const [domain, exception] of Object.entries(settings.siteExceptions)) {
    const li = document.createElement('li');
    li.className = 'exception-item';

    const span = document.createElement('span');
    span.textContent = `${domain} ${exception.paused ? '(Protection Paused)' : ''}`;

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

  if (modeSelect) modeSelect.value = settings.translation.mode;
  if (providerSelect) providerSelect.value = settings.translation.provider.type;
  if (endpointInput) endpointInput.value = settings.translation.provider.endpoint || '';
  if (apiKeyInput) apiKeyInput.value = settings.translation.provider.apiKey || '';
  if (maxCacheInput) maxCacheInput.value = String(settings.translation.maxCacheEntries || 500);

  if (customApiFields) {
    if (settings.translation.provider.type === 'custom_api') {
      customApiFields.classList.remove('hidden');
    } else {
      customApiFields.classList.add('hidden');
    }
  }
}

function renderPrivacySettings(settings: AppSettings): void {
  const consentCheckbox = document.getElementById('sendPageContentConsent') as HTMLInputElement;
  const clearStatsCheckbox = document.getElementById('clearStatsOnRestart') as HTMLInputElement;

  if (consentCheckbox) {
    consentCheckbox.checked = settings.privacy.sendPageContentConsent;
  }
  if (clearStatsCheckbox) {
    clearStatsCheckbox.checked = settings.privacy.clearStatsOnRestart;
  }
}

function setupListeners(): void {
  document.getElementById('addExceptionBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newExceptionDomain') as HTMLInputElement;
    if (!input || !input.value.trim()) return;

    const domain = getRegistrableDomain(input.value.trim());
    if (!domain) return;

    const settings = await StorageManager.getSettings();
    settings.siteExceptions[domain] = { domain, paused: false };
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
    if (!isNaN(val) && val >= 10 && val <= 2000) {
      const settings = await StorageManager.getSettings();
      settings.translation.maxCacheEntries = val;
      await StorageManager.saveSettings(settings);
    }
  });

  document.getElementById('sendPageContentConsent')?.addEventListener('change', async (e) => {
    const checkbox = e.target as HTMLInputElement;
    const settings = await StorageManager.getSettings();
    settings.privacy.sendPageContentConsent = checkbox.checked;
    await StorageManager.saveSettings(settings);
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
