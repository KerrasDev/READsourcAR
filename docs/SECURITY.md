# Resource Guardian — Security & Privacy Architecture

## 1. Principles of Least Privilege

Resource Guardian requests only the minimal set of browser permissions strictly required to execute its declarative filtering and translation features:

| Permission | Technical Requirement | Justification |
|------------|-----------------------|---------------|
| `declarativeNetRequest` | Native request blocking | Blocks unwanted, tracking, and media resources at the network level before download. |
| `declarativeNetRequestWithHostAccess` | Site-scoped rule evaluation | Enables custom rules and site exceptions to take effect across user-configured domains. |
| `storage` | Configuration persistence | Persists versioned user preferences, site exceptions, and custom rules locally on the user's machine. |
| `activeTab` | Interactive DOM translation | Grants temporary access to the active page when the user initiates selection or main-content translation. |
| `scripting` | Content script messaging | Allows invoking DOM text extraction and translation functions on demand. |
| `<all_urls>` | Host permissions | Allows dynamic DNR rules to inspect cross-origin initiators and filter third-party tracker resources. |

---

## 2. Privacy & Data Handling Guarantee

- **Zero Browsing History Retention:** Resource Guardian does not track, collect, record, or store the user's browsing history or URL visits.
- **Bounded Local Counters:** Aggregated statistics (e.g. total blocked requests, blocked counts by category) are bounded integers stored strictly in local browser storage (`chrome.storage.local`). Counters can be cleared at any time via the options page or automatically reset on browser startup.
- **No External Telemetry:** The extension contains zero third-party telemetry, tracking libraries, or analytics SDKs.
- **Local Execution:** All rule compilation, URL normalization, domain classification, language heuristics, and caching logic run entirely on the local device.

---

## 3. Translation Privacy & API Credential Safety

### Explicit Consent Requirement for External APIs
When the user selects the `custom_api` provider:
- User-selected text will only be transmitted if the user has explicitly checked the `sendPageContentConsent` checkbox in Settings:
  `"I understand and consent that user-selected text will be transmitted to this configured endpoint for translation."`
- If consent is not enabled, any translation attempt via `custom_api` is immediately rejected with an error:
  `"Privacy consent required: Grant consent in extension settings to transmit text to external translation APIs."`

### API Credential Masking & Export Sanitization
- API keys configured for custom REST translation providers are rendered as masked password inputs (`type="password"`) in the options UI.
- When the user exports configuration to JSON via the **Export Settings** button, Resource Guardian **automatically strips the API key** (`exportable.translation.provider.apiKey = ''`) to prevent accidental credential leakage in exported backup files.

### Protection of Sensitive DOM Elements
During translation, the content script's `TreeWalker` filter strictly rejects:
- Password fields (`<input type="password">`)
- Form inputs, textareas, and select elements
- Content-editable elements (`isContentEditable`)
- Sensitive attributes and hidden elements
- Elements with `data-no-translate="true"` or `translate="no"`

---

## 4. Threat Model & Mitigations

### 1. Arbitrary Remote Code Execution (RCE)
- **Threat:** Extension loading remote scripts or evaluating arbitrary strings via `eval()`.
- **Mitigation:** Resource Guardian strictly adheres to Manifest V3 CSP (`script-src 'self'`). No `eval`, `new Function`, or external script loading is present in any bundle.

### 2. Malformed Configuration Import
- **Threat:** Malicious JSON files imported to corrupt memory or inject unexpected parameters.
- **Mitigation:** The `validateAndMigrateSettings` function validates all fields against strict type guards, bounds all numeric parameters, filters invalid custom rules, and applies defaults for any missing or invalid property.

### 3. Denial of Service via Oversized Payloads
- **Threat:** Very large web pages or text selections overwhelming memory.
- **Mitigation:** Text inputs are bounded by `MAX_CHUNK_LENGTH (800)` and chunked incrementally. Concurrency is limited by `ConcurrencyLimiter` (default 1 concurrent operation). LRU cache size is strictly bounded (max 500 entries) with 24-hour TTL eviction.
