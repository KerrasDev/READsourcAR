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
- **Priority 1000:** Paused domains (User domain exceptions) -> ALLOW
- **Priority 200-210:** Site-scoped custom rules (Allow / Block)
- **Priority 100-110:** Global custom rules (Allow / Block)
- **Priority 50-60:** Per-site category overrides
- **Priority 10-15:** Global category default policies (e.g., block third-party scripts)

No heavy `MutationObserver` loops or DOM deletion hacks are used for network request blocking.

---

## Translation Optimization

- **Bounded Cache:** LRU cache capped at 500 entries with a 24-hour TTL to avoid unbounded memory growth.
- **Request Deduplication:** Duplicate in-flight requests for the same text and language pair return the active promise without sending extra network calls.
- **Safe DOM Extraction & RTL Support:** Skips `<code>`, `<pre>`, `<script>`, `<style>`, `<input>`, and `<textarea>` elements, protecting code blocks, inputs, and password fields. Sets `dir="rtl"` or `dir="ltr"` on element parents when translating RTL languages (e.g., Arabic). Original text nodes are stored using a `WeakMap` for instant, non-destructive restoration.
- **User Action Triggers:** Supports translating user selection or main content area (`<main>`, `<article>`, or `<body>`).

---

## User Interface & Features

- **Popup Interface:** Allows toggling global protection, pausing protection per domain, configuring resource category rules, selecting target translation languages, triggering selection or main content translation, restoring original text, and viewing total blocked request statistics.
- **Options Interface:** Provides configuration for resource guard policies, site exceptions, custom pattern rules (allow/block with site scopes), translation mode and providers (Mock, Manual, or Custom REST API), privacy settings, and settings import/export/reset.

---

## Permissions Rationale & Security

- `declarativeNetRequest` / `declarativeNetRequestWithHostAccess`: Required for native request filtering before download.
- `storage`: Persists lightweight options and per-site exceptions locally.
- `activeTab`: Permits on-demand text translation on user interaction.
- `<all_urls>` host permissions: Allows applying request rules and translating text across user-visited domains.

No user data or browsing history is tracked, collected, or transmitted.
