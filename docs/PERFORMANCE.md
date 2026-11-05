# Performance Benchmarking & Resource Footprint

## 1. Production Bundle Sizes

Production builds are compiled and minified with `esbuild` target `es2022`:

| Output Bundle | Uncompressed Size | Gzipped Size (est) | Purpose |
| :--- | :--- | :--- | :--- |
| `background/service-worker.js` | 8.6 KB | ~2.9 KB | Event-driven DNR coordination & messaging |
| `content/content-script.js` | 11.3 KB | ~3.8 KB | On-demand DOM text extraction & restoration |
| `popup/popup.js` | 10.8 KB | ~3.4 KB | Toolbar interface & status updates |
| `options/options.js` | 9.8 KB | ~3.1 KB | Settings and exceptions manager |
| **Total Production JS Footprint** | **~40.5 KB** | **~13.2 KB** | **Zero external runtime libraries** |

---

## 2. Memory Footprint & Cache Limits

- **Translation LRU Cache:** Hard-capped at 500 entries (configurable up to 2000). Peak memory footprint under max cache capacity is < 400 KB.
- **Cache Eviction:** Strict LRU eviction removes the oldest unaccessed translation entry when capacity is reached.
- **TTL Expiration:** 24-hour default time-to-live prevents stale cache retention.
- **WeakMap DOM Association:** `WeakMap<Node, string>` and `WeakMap<HTMLElement, string>` hold node restoration data without preventing garbage collection of removed DOM nodes.

---

## 3. Network & CPU Optimization

- **Request Deduplication:** Concurrent requests for identical text and language pairs reuse the in-flight Promise, guaranteeing zero duplicate network calls.
- **Bounded Chunking:** Text passages > 800 characters are broken down into sentence-bounded chunks to prevent oversized payloads.
- **Native Declarative Filtering:** Network requests are blocked directly inside the browser's C++ network stack via `declarativeNetRequest`, eliminating background CPU overhead during ordinary browsing.
- **Event-Driven Service Worker:** No `setInterval` polling or background execution loops; service worker stays idle and terminates according to standard MV3 lifecycle.
