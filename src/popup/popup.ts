import { StorageManager } from '../shared/settings';
import { getRegistrableDomain } from '../shared/url';
import { compileSettingsToDNRRules } from '../rules/rule-compiler';
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
    } catch (e) {
      console.warn('Could not query current tab:', e);
    }
  }

  updateUI(settings);
  updateStatsDisplay(stats);
  setupListeners();
}

function updateStatsDisplay(stats: any): void {
  const statsSummary = document.getElementById('statsSummary');
  if (statsSummary) {
    statsSummary.textContent = `${stats.totalBlocked || 0} requests blocked`;
  }
}

function setTranslationStatus(message: string, isError = false): void {
  const statusEl = document.getElementById('transStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = isError ? 'trans-status error' : 'trans-status';
  if (!isError && message) {
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.textContent = '';
      }
    }, 4000);
  }
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

  // Active DNR rules count badge
  const activeRulesBadge = document.getElementById('activeRulesCount');
  if (activeRulesBadge) {
    const rules = compileSettingsToDNRRules(settings);
    activeRulesBadge.textContent = `${rules.length} Rules`;
  }

  // Domain state
  const toggleSitePauseBtn = document.getElementById('toggleSitePauseBtn');
  if (toggleSitePauseBtn && currentDomain) {
    const isPaused = settings.siteExceptions[currentDomain]?.paused;
    toggleSitePauseBtn.textContent = isPaused ? 'Resume for Domain' : 'Pause for Domain';
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

  const categories: ResourceCategory[] = ['thirdPartyScript', 'script', 'iframe', 'image', 'media', 'popup'];
  for (const cat of categories) {
    document.getElementById(`cat-${cat}`)?.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const settings = await StorageManager.getSettings();
      settings.resourcePolicies[cat].enabled = target.checked;
      await StorageManager.saveSettings(settings);
      updateUI(settings);
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
      setTranslationStatus('Translating selection...');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
      if (tab?.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'TRANSLATE_SELECTION',
            targetLang: targetLangSelect?.value || 'en'
          },
          (res) => {
            if (chrome.runtime.lastError || !res?.success) {
              setTranslationStatus(res?.error || 'No selection or page not ready', true);
            } else {
              setTranslationStatus('Selection translated.');
            }
          }
        );
      }
    }
  });

  document.getElementById('translateMainBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      setTranslationStatus('Translating main content...');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
      if (tab?.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'TRANSLATE_MAIN_CONTENT',
            targetLang: targetLangSelect?.value || 'en'
          },
          (res) => {
            if (chrome.runtime.lastError || !res?.success) {
              setTranslationStatus(res?.error || 'Could not translate page', true);
            } else {
              setTranslationStatus('Main content translated.');
            }
          }
        );
      }
    }
  });

  document.getElementById('restoreTextBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      setTranslationStatus('Restoring original text...');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_ORIGINAL' }, (res) => {
          if (chrome.runtime.lastError || !res?.success) {
            setTranslationStatus('Restore failed', true);
          } else {
            setTranslationStatus('Original text restored.');
          }
        });
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
