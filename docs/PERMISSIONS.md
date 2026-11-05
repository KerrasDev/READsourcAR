# Permissions Rationale & Threat Model

## 1. Extension Manifest Permissions

Resource Guardian adheres strictly to the principle of least privilege. The table below details every permission requested in `manifest.json`, the corresponding feature, and its justification:

| Permission | Feature | Justification | Can Extension Function Without It? |
| :--- | :--- | :--- | :--- |
| `declarativeNetRequest` | Resource Guard Request Blocking | Used to instruct the browser engine to block unwanted resources (scripts, images, iframes) natively *before* network requests initiate. | No. Without DNR, blocking before download cannot occur. |
| `declarativeNetRequestWithHostAccess` | Site-scoped DNR Rules | Required to register dynamic rules that match initiator origins for per-site overrides and paused domains. | No. Without this, per-site allow/block rules cannot be registered. |
| `storage` | Settings & Site Exceptions Persistence | Persists user policies, custom domain rules, and translation configurations locally via `chrome.storage.local`. | No. Settings would reset on every browser session. |
| `activeTab` | Translation Triggering | Grants temporary, user-initiated interaction access to the current active tab when clicking "Translate Selection" or "Translate Main Content". | Yes, but required for secure user-initiated DOM translation. |
| `scripting` | Dynamic Content Operations | Allows the extension to interact with active pages on explicit user gesture without permanent background observation. | Yes, if content scripts are statically registered. |
| `<all_urls>` (Host Permission) | Universal DNR Request Filtering | Required to filter third-party trackers, scripts, and embedded frames across web destinations visited by the user. | No. DNR requires host permissions for dynamic request interception. |

---

## 2. Privacy Guarantees

- **Zero Browsing History Collection:** Resource Guardian never records visited URLs, tab navigation histories, or query parameters.
- **Bounded Counters Only:** Resource statistics maintain only bounded numerical counters (`totalBlocked`, category tallies). No full request logs or initiator histories are stored.
- **Consent-First Translation:** The extension never transmits page content to external third parties without user gesture and configured provider consent.
- **Credential Protection:** Translation API keys are kept in local storage and excluded automatically during settings export.
