# Resource Guardian Architecture & Documentation

## Overview

**Resource Guardian** is a high-performance, privacy-focused Manifest V3 browser extension that provides two core capabilities:
1. **Resource Guard:** Fine-grained, declarative request filtering to block unwanted, tracking, or expensive web resources before download.
2. **Translation Optimizer:** Low-overhead translation workflow with request deduplication, bounded LRU caching, and safe DOM manipulation.

---

## Architecture & Directory Structure

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

## DeclarativeNetRequest & Request Blocking

Resource Guardian uses Chrome's native `declarativeNetRequest` (DNR) dynamic rules to filter network requests **before they download**:
- **Priority 1000:** Paused domains (User domain safety overrides) -> ALLOW
- **Priority 300:** Custom Site-Scoped Allow Rules
- **Priority 200:** Custom Site-Scoped Block Rules
- **Priority 150:** Custom Global Allow Rules
- **Priority 100:** Custom Global Block Rules
- **Priority 60:** Per-site Category Allow Overrides
- **Priority 50:** Per-site Category Block Overrides
- **Priority 15:** Global Category Allow Policies
- **Priority 10:** Global Category Block Policies

Dynamic rules are compiled with hard safety bounds capped at Chrome's limit (`MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES = 5000`) with overflow detection and logging.

No heavy `MutationObserver` loops or DOM deletion hacks are used for network request blocking.

---

## Translation Optimization

- **Bounded Cache:** LRU cache capped at 500 entries with a 24-hour TTL to avoid unbounded memory growth.
- **Request Deduplication:** Duplicate in-flight requests for the same text and language pair return the active promise without sending extra network calls.
- **Safe DOM Extraction:** Skips `<code>`, `<pre>`, `<script>`, `<style>`, `<input>`, and `<textarea>` elements, protecting code blocks, inputs, and password fields. Original text nodes are stored using a `WeakMap` for instant, non-destructive restoration.
- **Cancellation & Concurrency:** Supports `AbortController` cancellation for in-flight translation jobs on user action or selection changes.
- **RTL Support:** Automatically applies `dir="rtl"` to container elements when translating to Right-to-Left target languages (e.g., Arabic `ar`, Hebrew `he`), and restores original text direction upon reset.
- **Privacy & Consent:** Enforces explicit user consent (`sendPageContentConsent`) before transmitting text to custom external API providers.

---

## Permissions Rationale & Security

- `declarativeNetRequest` / `declarativeNetRequestWithHostAccess`: Required for native request filtering before download.
- `storage`: Persists lightweight options and per-site exceptions locally.
- `activeTab`: Permits on-demand text translation on user interaction.
- `<all_urls>` host permissions: Allows applying request rules and translating text across user-visited domains.

No user data or browsing history is tracked, collected, or transmitted.
