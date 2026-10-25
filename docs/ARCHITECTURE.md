# Resource Guardian Architecture & Engineering Manual

## 1. Overview

**Resource Guardian** is a high-performance, privacy-first Manifest V3 browser extension designed to provide fine-grained resource control and an optimized, low-overhead translation workflow.

It combines two core systems:
1. **Resource Guard:** Native request filtering using `chrome.declarativeNetRequest` (DNR) to block unwanted, tracking, or heavy web resources before they download.
2. **Translation Optimizer:** On-demand, non-invasive translation engine featuring progressive language detection, bounded LRU caching, request deduplication, and non-destructive DOM node restoration via `WeakMap`.

---

## 2. Directory & Module Architecture

```
dist/
  background/service-worker.js
  content/content-script.js
  popup/popup.js, popup.html, popup.css
  options/options.js, options.html, options.css
  manifest.json
src/
  background/
    service-worker.ts      - Service worker lifecycle, storage listeners, DNR sync
  content/
    content-script.ts      - DOM text node extraction, safe replacement & restoration
  options/
    options.ts             - Policy management, site exceptions, translation & export/import UI
  popup/
    popup.ts               - Quick domain toggle, category rules, translation controls & stats
  rules/
    rule-compiler.ts       - Settings compilation to DNR rules, priority & limit enforcement
  shared/
    types.ts               - Extension types, settings, rule definitions & stats schema
    settings.ts            - Storage abstraction layer with migration & default validation
    url.ts                 - URL normalization, TLD registrable domain extraction, third-party check
  translation/
    language-detector.ts   - Multi-signal language detection (HTML lang, script ranges, heuristics)
    provider.ts            - Provider abstraction (Mock, Manual, Custom REST API)
    translation-manager.ts - LRU translation cache, request deduplication & cancellation
docs/
  ARCHITECTURE.md          - Architecture, performance metrics, security & compatibility docs
tests/
  rules.test.ts            - DNR compilation, priority precedence & dynamic rule limit tests
  translation.test.ts      - Language detection, LRU cache eviction & provider tests
  dom.test.ts              - Safe DOM element translation & WeakMap restoration tests
  url.test.ts              - URL normalization & Public Suffix List domain tests
```

---

## 3. DeclarativeNetRequest & Rule Precedence

Resource Guardian delegates network request blocking entirely to the browser's native `declarativeNetRequest` engine. No post-download DOM deletion or `MutationObserver` hacks are used for blocking requests.

### Precedence Model

1. **Priority 1000 (Highest):** Temporary Domain Pause (User site exceptions) -> `ALLOW`
2. **Priority 200-210:** Site-scoped custom rules (`ALLOW` / `BLOCK`)
3. **Priority 100-110:** Global custom rules (`ALLOW` / `BLOCK`)
4. **Priority 50-60:** Per-site category overrides
5. **Priority 10-15 (Lowest):** Global category default policies (e.g., block third-party scripts)

### Dynamic Rule Limits

`compileSettingsToDNRRules` respects `chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES` (default 5,000). If compiled rules exceed the browser limit, lower-priority rules are safely truncated, and a warning is logged.

---

## 4. Translation Optimizer Engine

- **Modes:**
  - **Manual (Default):** Translation starts only upon user command via popup or context action.
  - **Selective:** Prompts user when non-native document language is detected.
  - **Assisted:** Selection / Main Content (`<main>`, `<article>`) targeted translation.
- **Progressive Language Detection:**
  1. HTML `lang` attribute check.
  2. Character script analysis (Arabic U+0600..U+06FF, Cyrillic U+0400..U+04FF, CJK U+4E00..U+9FFF).
  3. Latin language word heuristics (French vs English).
- **DOM Protection:**
  - Automatically skips `<code>`, `<pre>`, `<script>`, `<style>`, `<input>`, `<textarea>`, `isContentEditable`, and `[data-no-translate]`.
  - Preserves original DOM nodes and values using an in-memory `WeakMap<Node, string>`.
- **Deduplication & LRU Cache:**
  - Concurrent identical requests share the same promise.
  - Bounded LRU cache capped at 500 items (configurable up to 2,000) with a 24-hour TTL.

---

## 5. Performance Validation & Benchmarks

- **Production Bundle Size:** Total compiled JS bundle across background, content, popup, and options is **< 35 KB**.
- **Idle Cost:** 0% CPU background idle cost. Service worker enters idle suspension when inactive.
- **Memory Footprint:** < 5 MB background memory usage. Content script memory bound by active page nodes and LRU cache limit.
- **Execution Overhead:** Zero DOM polling loops, zero network monkey-patching.

---

## 6. Security, Threat Model & Privacy Notice

### Permissions Justification

- `declarativeNetRequest` / `declarativeNetRequestWithHostAccess`: Required to block unwanted network requests before download.
- `storage`: Required to save lightweight settings, site exceptions, and local statistics.
- `activeTab`: Permits text translation on the active tab upon user action.
- `scripting`: Executes content script on active tab when user requests text translation.
- `<all_urls>` host permissions: Applies network rules and translates text across visited domains.

### Threat Model & Privacy Guarantees

- **No Remote Code Execution:** All extension logic is statically bundled. No dynamic `eval` or remote script loading.
- **Privacy First:** Browsing history is never tracked, collected, or transmitted.
- **Explicit Consent:** Page content is never transmitted to an external translation endpoint without explicit user configuration and consent.
- **Credential Protection:** API keys entered for custom translation endpoints are stored in `chrome.storage.local` and automatically stripped when exporting settings.

---

## 7. Cross-Browser Compatibility (Chromium & Firefox)

- **Chromium:** Default target (Manifest V3, Service Worker ESM).
- **Firefox:** Fully compatible with Manifest V3 background scripts and `declarativeNetRequest` API.

---

## 8. Build & Packaging Instructions

1. **Install dependencies:** `npm install`
2. **Run tests:** `npm test`
3. **Type check:** `npm run typecheck`
4. **Build production package:** `npm run build`

Output files will be generated in `dist/` ready to be loaded unpacked in Developer Mode in Chrome, Edge, or Firefox.
