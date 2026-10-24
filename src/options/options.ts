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
  const categories: Array<{ id: ResourceCategory; label: string }> = [
    { id: 'thirdPartyScript', label: 'Third-Party Scripts' },
    { id: 'script', label: 'All Scripts' },
    { id: 'iframe', label: 'Iframes' },
    { id: 'image', label: 'Images' },
    { id: 'media', label: 'Media (Video/Audio)' },
    { id: 'stylesheet', label: 'Stylesheets' },
    { id: 'font', label: 'Fonts' },
    { id: 'worker', label: 'Web Workers' },
    { id: 'popup', label: 'Popups' }
  ];

  for (const cat of categories) {
    const card = document.createElement('div');
    card.className = 'policy-card';

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

    card.appendChild(label);
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

  if (modeSelect) modeSelect.value = settings.translation.mode;
  if (providerSelect) providerSelect.value = settings.translation.provider.type;
  if (endpointInput) endpointInput.value = settings.translation.provider.endpoint || '';
  if (apiKeyInput) apiKeyInput.value = settings.translation.provider.apiKey || '';

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
