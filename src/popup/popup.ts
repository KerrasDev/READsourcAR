import { StorageManager } from '../shared/settings';
import { getRegistrableDomain } from '../shared/url';
import { AppSettings, ResourceCategory } from '../shared/types';

let currentDomain = '';

async function initPopup(): Promise<void> {
  const settings = await StorageManager.getSettings();
  const stats = await StorageManager.getStats();

  // Fetch active tab
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        try {
          const url = new URL(tab.url);
          currentDomain = getRegistrableDomain(url.hostname);
          const domainBadge = document.getElementById('currentDomain');
          if (domainBadge) domainBadge.textContent = currentDomain || 'N/A';
        } catch {
          currentDomain = '';
        }
      }
    } catch {
      currentDomain = '';
    }
  }

  updateUI(settings);
  updateStats(stats);
  setupListeners();
}

function updateUI(settings: AppSettings): void {
  const globalStatus = document.getElementById('globalStatus');
  const toggleProtectionBtn = document.getElementById('toggleProtectionBtn');

  if (globalStatus && toggleProtectionBtn) {
    if (settings.globalProtectionEnabled) {
      globalStatus.textContent = 'ENABLED';
      globalStatus.className = 'status-active';
      toggleProtectionBtn.textContent = 'Pause Global Protection';
    } else {
      globalStatus.textContent = 'PAUSED';
      globalStatus.className = 'status-disabled';
      toggleProtectionBtn.textContent = 'Resume Global Protection';
    }
  }

  // Domain state
  const toggleSitePauseBtn = document.getElementById('toggleSitePauseBtn');
  const sitePolicySummary = document.getElementById('sitePolicySummary');

  if (toggleSitePauseBtn && currentDomain) {
    const isPaused = settings.siteExceptions[currentDomain]?.paused;
    toggleSitePauseBtn.textContent = isPaused ? 'Resume for Domain' : 'Pause for Domain';

    if (sitePolicySummary) {
      if (isPaused) {
        sitePolicySummary.innerHTML = `<small style="color: #ea580c;">Domain Status: Protection Paused</small>`;
      } else if (settings.siteExceptions[currentDomain]?.categoryOverrides) {
        sitePolicySummary.innerHTML = `<small style="color: #2563eb;">Domain Status: Custom overrides active</small>`;
      } else {
        sitePolicySummary.innerHTML = `<small>Domain Status: Default Global Rules</small>`;
      }
    }
  }

  // Category Checkboxes
  const categories: ResourceCategory[] = ['thirdPartyScript', 'script', 'iframe', 'image', 'media', 'popup'];
  for (const cat of categories) {
    const el = document.getElementById(`cat-${cat}`) as HTMLInputElement;
    if (el && settings.resourcePolicies[cat]) {
      el.checked = settings.resourcePolicies[cat].enabled;
    }
  }

  // Target Lang
  const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
  if (targetLangSelect && settings.translation) {
    targetLangSelect.value = settings.translation.targetLang;
  }
}

function updateStats(stats: any): void {
  const statsSummary = document.getElementById('statsSummary');
  if (statsSummary) {
    const blocked = stats?.totalBlocked || 0;
    statsSummary.textContent = `${blocked} requests blocked`;
  }
}

function showStatus(msg: string, isError = false): void {
  const statusEl = document.getElementById('transStatus');
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#dc2626' : '#16a34a';
    setTimeout(() => {
      if (statusEl.textContent === msg) {
        statusEl.textContent = '';
      }
    }, 4000);
  }
}

function setupListeners(): void {
  document.getElementById('optionsBtn')?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });

  document.getElementById('toggleProtectionBtn')?.addEventListener('click', async () => {
    const settings = await StorageManager.getSettings();
    settings.globalProtectionEnabled = !settings.globalProtectionEnabled;
    await StorageManager.saveSettings(settings);
    updateUI(settings);
  });

  document.getElementById('toggleSitePauseBtn')?.addEventListener('click', async () => {
    if (!currentDomain) return;
    const settings = await StorageManager.getSettings();
    if (!settings.siteExceptions[currentDomain]) {
      settings.siteExceptions[currentDomain] = { domain: currentDomain, paused: false };
    }
    settings.siteExceptions[currentDomain].paused = !settings.siteExceptions[currentDomain].paused;
    await StorageManager.saveSettings(settings);
    updateUI(settings);
  });

  document.getElementById('resetSiteBtn')?.addEventListener('click', async () => {
    if (!currentDomain) return;
    const settings = await StorageManager.getSettings();
    if (settings.siteExceptions[currentDomain]) {
      delete settings.siteExceptions[currentDomain];
      await StorageManager.saveSettings(settings);
      updateUI(settings);
      showStatus(`Reset overrides for ${currentDomain}`);
    }
  });

  const categories: ResourceCategory[] = ['thirdPartyScript', 'script', 'iframe', 'image', 'media', 'popup'];
  for (const cat of categories) {
    document.getElementById(`cat-${cat}`)?.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const settings = await StorageManager.getSettings();
      settings.resourcePolicies[cat].enabled = target.checked;
      await StorageManager.saveSettings(settings);
    });
  }

  document.getElementById('targetLangSelect')?.addEventListener('change', async (e) => {
    const target = e.target as HTMLSelectElement;
    const settings = await StorageManager.getSettings();
    settings.translation.targetLang = target.value;
    await StorageManager.saveSettings(settings);
  });

  document.getElementById('translateSelectionBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
      if (tab?.id) {
        showStatus('Translating selection...');
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'TRANSLATE_SELECTION',
            targetLang: targetLangSelect?.value || 'en'
          },
          (res) => {
            if (chrome.runtime.lastError || !res?.success) {
              showStatus(res?.error || 'Selection translation failed', true);
            } else {
              showStatus('Selection translated successfully');
            }
          }
        );
      }
    }
  });

  document.getElementById('translateMainBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
      if (tab?.id) {
        showStatus('Translating main content...');
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'TRANSLATE_MAIN_CONTENT',
            targetLang: targetLangSelect?.value || 'en'
          },
          (res) => {
            if (chrome.runtime.lastError || !res?.success) {
              showStatus(res?.error || 'Main translation failed', true);
            } else {
              showStatus('Main content translated successfully');
            }
          }
        );
      }
    }
  });

  document.getElementById('cancelTransBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_TRANSLATION' }, () => {
          showStatus('Translation cancelled');
        });
      }
    }
  });

  document.getElementById('restoreTextBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_ORIGINAL' }, () => {
          showStatus('Original text restored');
        });
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
