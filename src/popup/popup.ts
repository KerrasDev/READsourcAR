import { StorageManager } from '../shared/settings';
import { getRegistrableDomain } from '../shared/url';
import { AppSettings, ResourceCategory } from '../shared/types';

let currentDomain = '';

async function initPopup(): Promise<void> {
  const settings = await StorageManager.getSettings();

  // Query active tab URL
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        const url = new URL(tab.url);
        currentDomain = getRegistrableDomain(url.hostname);
        const domainBadge = document.getElementById('currentDomain');
        if (domainBadge) {
          domainBadge.textContent = currentDomain || 'N/A';
          domainBadge.title = tab.url;
        }
      }
    } catch {
      currentDomain = '';
    }
  }

  updateUI(settings);
  await refreshStats();
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
      toggleProtectionBtn.setAttribute('aria-pressed', 'false');
    } else {
      globalStatus.textContent = 'PAUSED';
      globalStatus.className = 'status-disabled';
      toggleProtectionBtn.textContent = 'Resume Global Protection';
      toggleProtectionBtn.setAttribute('aria-pressed', 'true');
    }
  }

  // Domain state
  const toggleSitePauseBtn = document.getElementById('toggleSitePauseBtn');
  if (toggleSitePauseBtn) {
    if (currentDomain) {
      const isPaused = settings.siteExceptions[currentDomain]?.paused;
      toggleSitePauseBtn.textContent = isPaused ? `Resume for ${currentDomain}` : `Pause for ${currentDomain}`;
      toggleSitePauseBtn.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
      (toggleSitePauseBtn as HTMLButtonElement).disabled = false;
    } else {
      toggleSitePauseBtn.textContent = 'No Domain Detected';
      (toggleSitePauseBtn as HTMLButtonElement).disabled = true;
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

async function refreshStats(): Promise<void> {
  const stats = await StorageManager.getStats();
  const statsSummary = document.getElementById('statsSummary');
  if (statsSummary) {
    statsSummary.textContent = `${stats.totalBlocked || 0} requests blocked`;
  }

  const rulesSummary = document.getElementById('rulesSummary');
  if (rulesSummary && typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
    try {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      rulesSummary.textContent = `Active native rules: ${rules.length}`;
    } catch {
      rulesSummary.textContent = 'Active native rules: 0';
    }
  }
}

function showTranslationStatus(msg: string, isError = false): void {
  const el = document.getElementById('translationStatus');
  if (el) {
    el.textContent = msg;
    el.style.color = isError ? 'var(--danger)' : 'var(--subtext-color)';
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
    await refreshStats();
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
    await refreshStats();
  });

  const categories: ResourceCategory[] = ['thirdPartyScript', 'script', 'iframe', 'image', 'media', 'popup'];
  for (const cat of categories) {
    document.getElementById(`cat-${cat}`)?.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const settings = await StorageManager.getSettings();
      if (settings.resourcePolicies[cat]) {
        settings.resourcePolicies[cat].enabled = target.checked;
        await StorageManager.saveSettings(settings);
        await refreshStats();
      }
    });
  }

  document.getElementById('targetLangSelect')?.addEventListener('change', async (e) => {
    const target = e.target as HTMLSelectElement;
    const settings = await StorageManager.getSettings();
    settings.translation.targetLang = target.value;
    await StorageManager.saveSettings(settings);
  });

  // Translate Selection
  document.getElementById('translateSelectionBtn')?.addEventListener('click', async () => {
    showTranslationStatus('Translating selection...');
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TRANSLATE_SELECTION',
          targetLang: targetLangSelect?.value || 'en'
        }, (res) => {
          if (chrome.runtime.lastError) {
            showTranslationStatus('Could not communicate with tab.', true);
          } else if (res && res.success) {
            showTranslationStatus('Selection translated.');
          } else {
            showTranslationStatus(res?.error || 'No text selected.', true);
          }
        });
      }
    }
  });

  // Translate Main Content
  document.getElementById('translateMainBtn')?.addEventListener('click', async () => {
    showTranslationStatus('Translating main content...');
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TRANSLATE_MAIN_CONTENT',
          targetLang: targetLangSelect?.value || 'en'
        }, (res) => {
          if (chrome.runtime.lastError) {
            showTranslationStatus('Could not communicate with tab.', true);
          } else if (res && res.success) {
            showTranslationStatus('Main content translated.');
          } else {
            showTranslationStatus(res?.error || 'Main content not found.', true);
          }
        });
      }
    }
  });

  // Cancel Translation
  document.getElementById('cancelTranslationBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_TRANSLATION' }, () => {
          showTranslationStatus('Translation cancelled.');
        });
      }
    }
  });

  // Restore Original Text
  document.getElementById('restoreTextBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_ORIGINAL' }, () => {
          showTranslationStatus('Original text restored.');
        });
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
