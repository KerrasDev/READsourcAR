# Resource Guardian Architecture & Documentation

## Overview

**Resource Guardian** is a high-performance, privacy-focused Manifest V3 browser extension that provides two core capabilities:
1. **Resource Guard:** Fine-grained, declarative request filtering to block unwanted, tracking, or expensive web resources before download.
2. **Translation Optimizer:** Low-overhead translation workflow with request deduplication, bounded LRU caching, and safe DOM manipulation.

---

## 1. Initial Repository Audit Summary

### 1.1 Evaluated Paradigm: Native DeclarativeNetRequest vs DOM Mutation Interception
- **Legacy DOM Interception Fallacy:** Prototype or userscript approaches frequently monitor DOM mutations or remove elements (`<script>`, `<img>`, `<iframe>`) after insertion. As verified in Chromium/W3C specifications, removing an element after DOM insertion **does not cancel network fetch or script execution**.
- **DeclarativeNetRequest (DNR) Superiority:** Resource Guardian strictly employs native browser `declarativeNetRequest` dynamic rules. This ensures requests are blocked at the browser engine network layer **prior to initiation**, eliminating network bandwidth, CPU execution time, and security risks.

### 1.2 Audit Findings & Functional Gaps
- **Rule Limits:** Chrome's `declarativeNetRequest` imposes a quota on dynamic rules (`MAX_NUMBER_OF_DYNAMIC_RULES`, typically 5000). The rule compiler must enforce `MAX_SAFE_DYNAMIC_RULES` and provide deterministic truncation and logging if users add oversized lists.
- **Bi-directional Text (RTL):** Languages such as Arabic require explicit directionality (`dir="rtl"`) on modified container elements to preserve natural reading order and layout integrity.
- **Passage Batching & Chunking:** Content script translation should process text nodes in bounded batches to keep the main thread responsive on long-form documents.
- **UI & Telemetry:** Popup requires live display of active rules and blocked requests, plus on-demand triggers for "Translate Main Content" and domain-specific rule resets.

---

## 2. Architecture & Directory Structure

```
dist/
  background/service-worker.js
  content/content-script.js
  popup/popup.js, popup.html, popup.css
  options/options.js, options.html, options.css
  manifest.json
src/
  background/ - Service worker and Chrome event listeners
  content/    - DOM text extraction and translation replacement
  options/    - Settings & advanced policy management UI
  popup/      - Quick action toolbar popup
  rules/      - DeclarativeNetRequest rule compiler & precedence engine
  shared/     - Settings schema, URL normalization, domain classification
  translation/- Language detector, provider interface, LRU cache, queue manager
docs/         - Extension architecture, security & performance documentation
tests/        - Unit, rule compilation, translation, and DOM JSDOM tests
```

---

## 3. DeclarativeNetRequest & Request Blocking

Resource Guardian uses Chrome's native `declarativeNetRequest` (DNR) dynamic rules to filter network requests **before they download**:
- **Priority 1000:** Paused domains (User domain exceptions) -> ALLOW
- **Priority 210:** Site-scoped custom ALLOW rules
- **Priority 200:** Site-scoped custom BLOCK rules
- **Priority 110:** Global custom ALLOW rules
- **Priority 100:** Global custom BLOCK rules
- **Priority 60:** Per-site category ALLOW overrides
- **Priority 50:** Per-site category BLOCK overrides
- **Priority 15:** Global category ALLOW policies
- **Priority 10:** Global category BLOCK policies (e.g., block third-party scripts)

No heavy `MutationObserver` loops or DOM deletion hacks are used for network request blocking.

---

## 4. Translation Optimization

- **Bounded Cache:** LRU cache capped at 500 entries (user-configurable up to 2000) with a 24-hour TTL to avoid unbounded memory growth.
- **Request Deduplication:** Duplicate in-flight requests for the same text and language pair return the active promise without sending extra network calls.
- **Safe DOM Extraction:** Skips `<code>`, `<pre>`, `<script>`, `<style>`, `<input>`, `<textarea>`, and elements marked with `data-no-translate`, protecting code blocks, inputs, and password fields. Original text nodes are stored using a `WeakMap` for instant, non-destructive restoration.
- **RTL Support:** Detects RTL target languages (e.g., Arabic `ar`, Hebrew `he`) and sets appropriate `dir="rtl"` styling on modified nodes.

---

## 5. Permissions Rationale & Security

- `declarativeNetRequest` / `declarativeNetRequestWithHostAccess`: Required for native request filtering before download.
- `storage`: Persists lightweight options and per-site exceptions locally.
- `activeTab`: Permits on-demand text translation on user interaction.
- `scripting`: Allows targeted script execution on the active tab for translation workflows.
- `<all_urls>` host permissions: Allows applying request rules and translating text across user-visited domains.

No user data or browsing history is tracked, collected, or transmitted.
