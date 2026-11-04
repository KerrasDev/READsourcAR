# Resource Guardian Architecture & Documentation

## Overview

**Resource Guardian** is a high-performance, privacy-focused Manifest V3 browser extension that provides two core capabilities:
1. **Resource Guard:** Fine-grained, declarative request filtering to block unwanted, tracking, or expensive web resources before download.
2. **Translation Optimizer:** Low-overhead translation workflow with request deduplication, bounded LRU caching, sentence-aware chunking, text direction handling (RTL/LTR), and safe DOM manipulation.

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

Resource Guardian uses Chrome's native `declarativeNetRequest` (DNR) dynamic rules to filter network requests **before they download**, adhering to a 6-tier precedence hierarchy:

1. **Priority 1000 (Tier 1):** Paused domains (User domain exceptions) -> `ALLOW`
2. **Priority 210 (Tier 2):** Explicit user site-scoped allow rules
3. **Priority 200 (Tier 3):** Explicit user site-scoped block rules
4. **Priority 110 (Tier 4):** Explicit user global allow rules
5. **Priority 100 (Tier 5):** Explicit user global block rules
6. **Priority 60 (Tier 6):** Per-site category allow overrides
7. **Priority 50 (Tier 7):** Per-site category block overrides
8. **Priority 15 (Tier 8):** Global category default allow policies
9. **Priority 10 (Tier 9):** Global category default block policies (e.g., third-party scripts)
10. **Priority 0 (Tier 10):** Default allow behavior for unblocked requests

Dynamic rules are strictly bounded to `MAX_SAFE_DYNAMIC_RULES` (5000) to protect against Chrome API overflow limits.

---

## Translation Optimization

- **Sentence-Aware Chunking:** Long text passages exceeding `MAX_CHUNK_LENGTH` (800 characters) are safely segmented at natural sentence or whitespace boundaries before translating.
- **Bounded LRU Cache:** In-memory LRU cache capped at 500 entries (configurable up to 2000) with a 24-hour TTL to prevent unbounded memory growth.
- **In-flight Request Deduplication:** Concurrent requests for identical text and language pairs return the active promise, avoiding redundant network trips.
- **RTL & Text Direction Support:** Automatically toggles `dir="rtl"` / `dir="ltr"` on translated containers when handling RTL languages such as Arabic (`ar`), and cleans up direction attributes upon restoring original text.
- **Safe DOM Extraction & WeakMap Restoration:** Skips `<code>`, `<pre>`, `<script>`, `<style>`, `<input>`, `<textarea>`, and `[contenteditable]` elements to protect code blocks and password inputs. Original node values and directions are held in `WeakMap` structures for non-destructive restoration.

---

## Permissions Rationale & Security

- `declarativeNetRequest` / `declarativeNetRequestWithHostAccess`: Required for native request filtering before download.
- `storage`: Persists lightweight options and per-site exceptions locally.
- `activeTab`: Permits on-demand text translation on user interaction.
- `scripting`: Enables content script messaging and DOM translation.
- `<all_urls>` host permissions: Allows applying request rules and translating text across user-visited domains.

### Privacy Guarantees
- No user browsing history is tracked, stored, or transmitted.
- When using external custom API translation providers, explicit consent (`sendPageContentConsent`) is strictly required before any text leaves the browser.
