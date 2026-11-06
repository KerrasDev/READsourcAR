import { StorageManager } from '../shared/settings';
import { getRegistrableDomain } from '../shared/url';
import { AppSettings, ResourceCategory } from '../shared/types';
import { compileSettingsToDNRRules } from '../rules/rule-compiler';

let currentDomain = '';

async function initPopup(): Promise<void> {
  const settings = await StorageManager.getSettings();
  const stats = await StorageManager.getStats();

  // Fetch active tab
  if (typeof chrome !== 'undefined' && chrome.tabs) {
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
  }

  updateUI(settings, stats);
  setupListeners();
}

function updateUI(settings: AppSettings, stats?: any): void {
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
  if (toggleSitePauseBtn && currentDomain) {
    const isPaused = settings.siteExceptions[currentDomain]?.paused;
    toggleSitePauseBtn.textContent = isPaused ? 'Resume for Domain' : 'Pause for Domain';
  }

  // Active rules count
  const activeRules = compileSettingsToDNRRules(settings);
  const activeRulesBadge = document.getElementById('activeRulesCount');
  if (activeRulesBadge) {
    activeRulesBadge.textContent = `${activeRules.length} rules active`;
  }

  // Category Checkboxes
  const categories: ResourceCategory[] = [
    'thirdPartyScript',
    'script',
    'iframe',
    'image',
    'media',
    'stylesheet',
    'font',
    'worker',
    'popup'
  ];
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

  // Stats footer
  const statsSummary = document.getElementById('statsSummary');
  if (statsSummary && stats) {
    statsSummary.textContent = `${stats.totalBlocked || 0} requests blocked`;
  }
}

function showStatus(msg: string, isError = false): void {
  const statusEl = document.getElementById('translationStatus');
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
    if (isError) {
      statusEl.style.backgroundColor = '#fee2e2';
      statusEl.style.color = '#b91c1c';
    } else {
      statusEl.style.backgroundColor = '#e0f2fe';
      statusEl.style.color = '#0369a1';
    }
  }
}

function hideStatus(): void {
  const statusEl = document.getElementById('translationStatus');
  if (statusEl) {
    statusEl.classList.add('hidden');
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

  const categories: ResourceCategory[] = [
    'thirdPartyScript',
    'script',
    'iframe',
    'image',
    'media',
    'stylesheet',
    'font',
    'worker',
    'popup'
  ];
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

  const cancelBtn = document.getElementById('cancelTranslationBtn');

  document.getElementById('translateSelectionBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
      if (tab?.id) {
        showStatus('Translating selection...');
        cancelBtn?.classList.remove('hidden');

        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'TRANSLATE_SELECTION',
            targetLang: targetLangSelect?.value || 'en'
          },
          (response) => {
            cancelBtn?.classList.add('hidden');
            if (response?.success) {
              if (response.cancelled) {
                showStatus('Translation cancelled.');
              } else {
                showStatus(`Translated ${response.translatedCount || 0} text elements.`);
              }
            } else {
              showStatus(response?.error || 'No selection found.', true);
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
        cancelBtn?.classList.remove('hidden');

        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'TRANSLATE_MAIN_CONTENT',
            targetLang: targetLangSelect?.value || 'en'
          },
          (response) => {
            cancelBtn?.classList.add('hidden');
            if (response?.success) {
              if (response.cancelled) {
                showStatus('Translation cancelled.');
              } else {
                showStatus(`Translated ${response.translatedCount || 0} text elements.`);
              }
            } else {
              showStatus(response?.error || 'Content area not found.', true);
            }
          }
        );
      }
    }
  });

  cancelBtn?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_TRANSLATION' });
        showStatus('Cancelling translation...');
      }
    }
  });

  document.getElementById('restoreTextBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_ORIGINAL' }, (response) => {
          if (response?.success) {
            showStatus('Original text restored.');
          }
        });
      }
    }
  });

  document.getElementById('copySelectionBtn')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            func: () => window.getSelection()?.toString() || ''
          },
          (results) => {
            const text = results?.[0]?.result;
            if (text) {
              navigator.clipboard.writeText(text);
              showStatus('Copied text to clipboard!');
            } else {
              showStatus('No text selected to copy.', true);
            }
          }
        );
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
