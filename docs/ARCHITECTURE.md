# Resource Guardian — Architecture & Technical Design

## 1. Executive Summary

**Resource Guardian** is a high-performance, privacy-first Manifest V3 browser extension engineered to give users fine-grained declarative control over network resources and provide an on-demand, resource-efficient translation workflow.

Resource Guardian prioritizes:
- **Zero Idle Overhead:** Purely event-driven service worker without persistent background loops or polling.
- **Native Declarative Request Filtering:** Uses Chrome's native `declarativeNetRequest` (DNR) dynamic rules to block unwanted requests **before they touch the network or execute**.
- **Safe & Non-Destructive Translation:** Bounded text chunking, active `AbortController` cancellation, concurrency limiting, in-flight deduplication, bounded LRU caching, and `WeakMap` DOM tracking for zero-cost instant restoration.
- **Strict Privacy & Security:** No browsing history collection, no remote code execution, automatic API key sanitization on export, and explicit consent gates for external translation APIs.

---

## 2. Directory Structure

```
dist/                               # Production extension package
  manifest.json                     # MV3 extension manifest
  background/service-worker.js      # Event-driven service worker
  content/content-script.js         # On-demand DOM translation
  popup/popup.html, js, css         # Lightweight toolbar interface
  options/options.html, js, css     # Full settings & policy manager
  icons/                            # Extension iconography (16, 48, 128)

src/
  background/
    service-worker.ts               # DNR rules synchronization & lifecycle
  content/
    content-script.ts               # DOM traversal & WeakMap node restoration
  popup/
    popup.ts                        # Toolbar popup logic & tab telemetry
  options/
    options.ts                      # Configuration UI & import/export
  rules/
    rule-compiler.ts                # Deterministic 6-tier precedence compiler
  shared/
    types.ts                        # Central TypeScript contracts & models
    settings.ts                     # Schema migration & storage abstraction
    url.ts                          # Public suffix list & URL normalization
  translation/
    translation-manager.ts          # Cache, deduplicator, concurrency limiter
    language-detector.ts            # Progressive language heuristics & RTL
    provider.ts                     # Abstract translation provider interface

tests/                              # Automated test suites (32 tests)
  rules.test.ts                     # Rule compilation, precedence, truncation
  url.test.ts                       # URL normalization & registrable domains
  settings.test.ts                  # Settings validation & schema migration
  translation.test.ts               # Cache eviction, chunking, concurrency
  dom.test.ts                       # DOM element translation & restoration
  integration.test.ts               # Service worker DNR synchronization

docs/
  ARCHITECTURE.md                   # System architecture & data flow
  SECURITY.md                       # Permissions, threat model & privacy
  PERFORMANCE.md                    # Empirical benchmarks & resource analysis
  INSTALLATION.md                   # Installation & developer setup
  LIMITATIONS.md                    # Known boundaries & browser constraints
```

---

## 3. DeclarativeNetRequest & Rule Precedence Model

Resource Guardian replaces legacy, high-overhead `webRequest` or `MutationObserver` DOM element-removal hacks with browser-native `declarativeNetRequest` dynamic rules.

Requests are filtered at the browser engine level **before** DNS resolution and network dispatch.

### 6-Tier Precedence Model

Rules are compiled with strict numerical priorities to guarantee deterministic behavior:

| Tier | Priority Range | Description | Action |
|------|---------------|-------------|--------|
| **Tier 1: Safety Constraints** | `2000` | Whitelists browser internals and extension resources (`chrome-extension:*`, `moz-extension:*`, `about:*`, `data:*`) so the browser remains functional. | `allow` |
| **Tier 2: User Allow & Paused Sites** | `1500 - 1600` | Paused domains (`1600`), site-scoped custom allow rules (`1550`), and global custom allow rules (`1500`). Bypasses all lower-tier blocking. | `allow` |
| **Tier 3: User Block Rules** | `1000 - 1050` | Explicit site-scoped user block rules (`1050`) and global user block rules (`1000`). | `block` |
| **Tier 4: Site Category Overrides** | `500 - 550` | Domain-specific resource category overrides (e.g., allow 3rd-party scripts specifically on a trusted bank domain: `550`, or block images on a heavy news site: `500`). | `allow` / `block` |
| **Tier 5: Global Category Policies** | `100 - 150` | Extension-wide category rules (e.g. block 3rd-party scripts: `100`). | `allow` / `block` |
| **Tier 6: Default Allow** | `0` (Native) | Implicit default browser behavior if no rules match. | Browser default |

### Dynamic Rule Limits & Truncation Safety

Chromium sets a dynamic rule quota (typically 5,000 rules). If user configurations approach or exceed `MAX_SAFE_DYNAMIC_RULES (5000)`, the compiler sorts all rules by priority descending, truncates the lowest-priority rules, ensures sequential 1-based IDs, and generates a warning notification. High-priority safety and user allow rules are never discarded.

---

## 4. Resource Categories & DNR Mapping

Resource Guardian supports 9 granular resource categories:

1. **Third-Party Scripts (`thirdPartyScript`):** Blocks scripts where the request domain differs from the initiating site's registrable domain (`resourceTypes: ['script']`, `domainType: 'thirdParty'`).
2. **All Scripts (`script`):** Blocks all executable JavaScript (`resourceTypes: ['script']`).
3. **Iframes & Subframes (`iframe`):** Blocks nested HTML frame documents (`resourceTypes: ['sub_frame']`).
4. **Images (`image`):** Blocks raster and vector images before download (`resourceTypes: ['image']`).
5. **Media (`media`):** Blocks HTML5 audio and video streams (`resourceTypes: ['media']`).
6. **Stylesheets (`stylesheet`):** Blocks CSS stylesheets (`resourceTypes: ['stylesheet']`).
7. **Web Fonts (`font`):** Blocks custom web fonts (`resourceTypes: ['font']`).
8. **Web Workers (`worker`):** Blocks worker scripts and background WebSockets (`resourceTypes: ['script', 'websocket', 'other']`).
9. **Embedded Popups (`popup`):** Blocks secondary navigation subframes (`resourceTypes: ['sub_frame']`).

---

## 5. URL Normalization & Registrable Domain Extraction

Accurate first-party vs. third-party classification requires extracting the true registrable domain according to the Public Suffix List rules (e.g., `example.co.uk` registrable domain is `example.co.uk`, not `co.uk`).

`src/shared/url.ts`:
- Embeds a comprehensive registry of multi-part country-code top-level domains (ccTLDs) for the UK, Australia, Japan, Brazil, India, China, New Zealand, Israel, etc.
- Standardizes protocol-less URLs, relative paths with base URLs, IP addresses, IPv6, localhost, and query parameters.
- IDN / Punycode handling is automatically handled through standard WHATWG `URL` normalization.

---

## 6. Translation Optimizer Subsystem

The translation engine operates on-demand without running continuous polling or permanent listeners.

### Core Components:

1. **Progressive Language Detection (`language-detector.ts`):**
   - Step 1: Reads `document.documentElement.lang`.
   - Step 2: Reads `<meta http-equiv="content-language">` or `<meta name="language">`.
   - Step 3: Performs lightweight Unicode character block analysis (Arabic, Hebrew, Cyrillic, CJK, Latin).
   - Step 4: Identifies text directionality (`isRTL: true` for Arabic, Hebrew, Urdu, Persian, Yiddish).
   - Step 5: Evaluates stopwords for French and Spanish Latin scripts.

2. **Bounded LRU Cache (`translation-manager.ts`):**
   - Cache key: `${provider}:${sourceLang}:${targetLang}:${text.trim()}`.
   - Bounded size (default: 500 entries, configurable up to 2,000).
   - 24-hour TTL with automatic expiration.
   - Never caches aborted requests or API failures.

3. **In-Flight Request Deduplication:**
   - Active translation promises are indexed in a map. If an identical request is dispatched while in flight, the active promise is reused, eliminating duplicate HTTP calls.

4. **Bounded Text Chunking:**
   - Texts exceeding `MAX_CHUNK_LENGTH (800)` are split across paragraph, sentence, and word boundaries. Chunks are translated sequentially through the concurrency limiter and joined together.

5. **Concurrency Limiter:**
   - Limits simultaneous translation operations (default 1, max 5) to respect provider rate limits and preserve network bandwidth.

6. **Non-Destructive DOM Manipulation (`content-script.ts`):**
   - Traverses DOM with `TreeWalker(SHOW_TEXT)`.
   - Strictly ignores: `<code>`, `<pre>`, `<input>`, `<textarea>`, `<select>`, `<button>`, `<script>`, `<style>`, `isContentEditable`, and elements with `translate="no"` or `data-no-translate`.
   - Preserves original text nodes in a `WeakMap<Node, string>`.
   - Automatically applies `dir="rtl"` when translating into Arabic or Hebrew, and restores original layout direction upon restoration.
