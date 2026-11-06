# Resource Guardian Architecture & Engineering Design

## 1. Overview

**Resource Guardian** is a lightweight, privacy-preserving browser extension built on the WebExtensions Manifest V3 standard. It provides two foundational capabilities:

1. **Resource Guard:** Native request filtering using the browser's `declarativeNetRequest` (DNR) API to block scripts, trackers, iframes, media, and unwanted network resources *before* they are downloaded.
2. **Translation Optimizer:** An on-demand text translation engine with bounded LRU caching, request deduplication, sentence-level chunking, and non-destructive DOM manipulation.

---

## 2. DeclarativeNetRequest Rule Precedence

Resource requests are filtered at the browser network layer without relying on inefficient DOM deletion hacks or `MutationObserver` loops. Rules are structured according to a deterministic 6-tier precedence model:

| Tier | Priority Range | Description | Action |
|------|---------------|-------------|--------|
| **Tier 1** | `5000` | Browser & Extension Safety Constraints (e.g. `chrome-extension://*`) | `allow` |
| **Tier 2A** | `1000` | Paused Domain Exceptions (Temporary full bypass for active domain) | `allow` |
| **Tier 2B** | `210` / `110` | Explicit User Allow Rules (Site-scoped `210`, Global `110`) | `allow` |
| **Tier 3** | `200` / `100` | Explicit User Block Rules (Site-scoped `200`, Global `100`) | `block` |
| **Tier 4** | `60` / `50` | Per-site Category Overrides (Allow override `60`, Block override `50`) | `allow` / `block` |
| **Tier 5** | `15` / `10` | Global Category Default Policies (e.g. block 3rd-party scripts) | `allow` / `block` |
| **Tier 6** | *Implied* | Default Allow (implied browser default when no blocking rule matches) | `allow` |

### Quota Safety (`MAX_SAFE_DYNAMIC_RULES`)
Chrome enforces strict dynamic rule quotas (5,000 standard dynamic rules). Resource Guardian monitors total generated rules against `MAX_SAFE_DYNAMIC_RULES = 5000`. If exceeded, it preserves high-priority safety and user rules, truncates low-priority defaults, and surfaces actionable diagnostic warnings.

---

## 3. Translation Optimizer Architecture

### 3.1 Bounded Chunking
Long text passages are chunked into bounded segments of at most 800 characters (`MAX_CHUNK_LENGTH = 800`) along sentence-ending punctuation or word boundaries to prevent unbounded payload transfers.

### 3.2 In-Flight Deduplication & LRU Cache
- Identical translation requests generate a canonical key: `${provider}:${sourceLang}:${targetLang}:${text}`.
- If an in-flight request is pending, duplicate calls join the existing Promise.
- Completed translations are cached in an LRU cache (capped at 500 entries by default, configurable up to 2000, with a 24-hour TTL).

### 3.3 Non-Destructive DOM Preservation
- Traversal uses `TreeWalker` skipping `<script>`, `<style>`, `<pre>`, `<code>`, `<input>`, `<textarea>`, and password/contenteditable fields.
- Original text node values and container directionality (`dir="rtl"` vs `dir="ltr"`) are preserved in a `WeakMap`, guaranteeing exact restoration without DOM reflow anomalies or memory leaks.

---

## 4. Cross-Browser Manifest V3 Compatibility

- **Chromium:** Standard MV3 with `service_worker` background entry (`npm run build` -> `dist/`).
- **Firefox:** MV3 with `background.scripts` array and `browser_specific_settings.gecko` (`npm run build:firefox` -> `dist-firefox/`).
