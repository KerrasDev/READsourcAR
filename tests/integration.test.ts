import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateDNRRules, incrementStats } from '../src/background/service-worker';
import { StorageManager, DEFAULT_SETTINGS } from '../src/shared/settings';

describe('Service Worker & Extension Integration Flows', () => {
  beforeEach(async () => {
    // Reset settings in storage manager
    await StorageManager.saveSettings(DEFAULT_SETTINGS);
  });

  it('synchronizes DNR dynamic rules with mocked chrome API', async () => {
    let currentRules: any[] = [];

    // Mock chrome.declarativeNetRequest
    (global as any).chrome = {
      declarativeNetRequest: {
        getDynamicRules: vi.fn(async () => currentRules),
        updateDynamicRules: vi.fn(async ({ removeRuleIds, addRules }) => {
          currentRules = addRules;
        })
      }
    };

    const syncResult = await updateDNRRules();
    expect(syncResult.count).toBeGreaterThan(0);
    expect(currentRules.length).toBe(syncResult.count);

    // Rule 1 is Tier 1 safety rule
    expect(currentRules[0].priority).toBe(2000);
  });

  it('increments bounded statistics cleanly', async () => {
    await incrementStats('script');
    await incrementStats('image');
    await incrementStats('script');

    const stats = await StorageManager.getStats();
    expect(stats.totalBlocked).toBe(3);
    expect(stats.blockedByCategory.script).toBe(2);
    expect(stats.blockedByCategory.image).toBe(1);
    expect(stats.blockedByCategory.font).toBe(0);
  });

  it('safely disables all rules when global protection is turned off', async () => {
    let currentRules: any[] = [];
    (global as any).chrome = {
      declarativeNetRequest: {
        getDynamicRules: vi.fn(async () => currentRules),
        updateDynamicRules: vi.fn(async ({ addRules }) => {
          currentRules = addRules;
        })
      }
    };

    const settings = await StorageManager.getSettings();
    settings.globalProtectionEnabled = false;
    await StorageManager.saveSettings(settings);

    const syncResult = await updateDNRRules();
    expect(syncResult.count).toBe(0);
    expect(currentRules.length).toBe(0);
  });
});
