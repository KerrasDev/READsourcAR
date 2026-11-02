# Resource Guardian 🛡️

A high-performance, privacy-focused Manifest V3 browser extension offering fine-grained resource filtering via native `declarativeNetRequest` and smart, low-overhead translation optimization.

---

## Key Features

### 1. Resource Guard (Declarative Request Filtering)
- **Zero In-flight Interception:** Filter requests *before* network download via Chrome's native `declarativeNetRequest` (DNR) dynamic rules engine. No expensive `MutationObserver` loops or post-render DOM deletions.
- **Granular Category Controls:**
  - Third-party scripts (trackers, analytics)
  - Scripts (all first & third party)
  - Iframes & embedded documents
  - Images
  - Video and Audio media
  - Web Workers & WebSocket connections
  - Stylesheets & Web Fonts
  - Popups and unwanted subframe navigations
- **Strict Precedence Hierarchy:**
  1. Paused Sites (Priority 1000)
  2. Site-Scoped Custom Allow (Priority 210)
  3. Site-Scoped Custom Block (Priority 200)
  4. Global Custom Allow (Priority 110)
  5. Global Custom Block (Priority 100)
  6. Site Category Overrides (Priority 50-60)
  7. Global Category Policies (Priority 10-15)
- **Quota Safeguard:** Automatically caps dynamic rules at safe browser limits (5,000 rules) to protect stability.

### 2. Smart Translation Optimizer
- **On-Demand Processing:** Only translates explicit user selection or main article area when requested. No continuous document scanning or passive tracking.
- **Bounded LRU Cache:** In-memory LRU cache with configurable size (default 500, max 2000) and 24h TTL.
- **Request Deduplication:** Identical in-flight requests share the same active promise, preventing redundant network queries.
- **Bidirectional Support:** Automatically applies `dir="rtl"` layout for Arabic, Hebrew, Urdu, and Farsi.
- **Non-Destructive Restoration:** Uses `WeakMap` node tracking to instantly restore original text without reloading the page.
- **Element Shielding:** Automatically skips `<code>`, `<pre>`, `<input>`, `<textarea>`, passwords, and content marked with `data-no-translate`.

---

## Performance & Resource Benchmarks

| Metric | Measured Baseline |
| :--- | :--- |
| **Production Bundle Size** | Content script: ~10.2 KB, Service Worker: ~7.7 KB, Popup: ~9.9 KB, Options: ~9.3 KB |
| **Idle Background CPU** | 0% (Manifest V3 service worker suspends completely when idle) |
| **Background Memory** | Suspends to 0 MB resident after inactivity; ~5 MB active |
| **Translation In-Flight Calls** | Deduplicated (1 network call per identical text/lang batch) |
| **Cache Hit Latency** | < 1 ms (LRU memory lookup) |

---

## Installation & Browser Compatibility

### Chromium Browsers (Google Chrome, Brave, Edge, Chromium)
1. Clone or download the repository.
2. Run `npm install` and `npm run build`.
3. Open `chrome://extensions` in your browser.
4. Enable **Developer mode** (top-right switch).
5. Click **Load unpacked** and select the `dist/` directory.

### Firefox (Gecko)
- Uses standard WebExtension APIs. To run in Firefox Developer Edition / Nightly:
  1. Build the extension: `npm run build`.
  2. Open `about:debugging#/runtime/this-firefox`.
  3. Click **Load Temporary Add-on...** and choose `dist/manifest.json`.

---

## Permissions Rationale

- `declarativeNetRequest` / `declarativeNetRequestWithHostAccess`: Required to block requests before download at the network engine layer.
- `storage`: Persists local user preferences, custom rules, and site exceptions.
- `activeTab`: Grants temporary access to translate selected text on the active tab upon user invocation.
- `scripting`: Executes content script translation routines on the active tab.
- `<all_urls>` host permissions: Needed to enforce request blocking rules and allow translation across web domains.

---

## Security & Privacy Policy

- **No Remote Code Execution:** The extension complies with Manifest V3 CSP; all scripts are bundled locally.
- **No Data Exfiltration:** Resource Guardian does not track, store, or transmit your browsing history or visited URLs.
- **Export Safety:** The settings export function automatically strips sensitive credentials such as custom API keys.
- **Manual Consent:** External translation endpoints are only contacted when explicitly triggered by the user.

---

## Development & Testing

```bash
# Install dependencies
npm install

# Run Vitest unit & integration test suite
npm test

# Run TypeScript typechecker
npm run typecheck

# Build unpacked extension bundle into dist/
npm run build
```
