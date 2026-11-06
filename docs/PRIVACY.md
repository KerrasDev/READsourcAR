# Resource Guardian Privacy & Security Rationale

## 1. Least-Privilege Permissions Model

Resource Guardian requests only the minimal set of browser permissions strictly necessary for its features:

| Permission | Purpose | Alternative Considered | Why Necessary |
|------------|---------|------------------------|---------------|
| `declarativeNetRequest` | Native request blocking before network download | `webRequestBlocking` (MV2 only) | Required for Manifest V3 declarative network filtering |
| `declarativeNetRequestWithHostAccess` | Applies blocking rules with host context | Content script DOM removal | Content scripts cannot prevent initial network requests |
| `storage` | Stores user rule policies and exceptions locally | IndexedDB / localStorage | Built-in asynchronous extension storage with sync capabilities |
| `activeTab` | Grants temporary tab access when user clicks popup action | `<all_urls>` content injection | Limits DOM reading to explicit user interactions |
| `scripting` | Enables user-initiated text copying and target translation | Invasive full-page observers | Runs only on-demand when user clicks action buttons |

---

## 2. Data Collection Policy

- **Zero Telemetry:** The extension has zero tracking scripts, analytics SDKs, or reporting beacons.
- **Local Storage Only:** All settings, custom rules, site exceptions, and translation caches are stored solely on the user's local device.
- **No Browsing History Recording:** The extension does not record, log, or export browsing history or page URLs visited.
- **Clear on Restart Option:** Users can configure statistics to clear automatically whenever the browser restarts.

---

## 3. Translation Privacy Consent

- Mode A (Default) processes text only when the user explicitly triggers translation.
- If a custom third-party REST API is configured (e.g. LibreTranslate, DeepL), an explicit consent notice is presented in settings warning that user-selected text will be sent to the configured host.
- API keys and tokens are excluded from export files by default to avoid accidental credential leaks.
