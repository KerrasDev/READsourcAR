# Privacy Policy & Data Minimization

## Core Privacy Principles

1. **Zero Browsing History Tracking**: Resource Guardian does not record, store, or transmit your browsing history or visited URLs.
2. **Local Data Persistence**: All configuration settings, per-site exceptions, custom rules, and resource statistics are stored strictly on your device using local storage (`chrome.storage.local`).
3. **Explicit Consent for Content Transmission**: Page text is never sent to external servers without explicit user interaction. When using custom external API translation endpoints, explicit consent (`sendPageContentConsent`) must be enabled in the settings.
4. **Secret Protection**: Exported settings files automatically strip sensitive API keys to prevent accidental leaks.
5. **Bounded Statistics**: Request counters are stored as aggregate numbers (not URL logs) and can be configured to clear automatically upon browser restart or cleared manually at any time.
