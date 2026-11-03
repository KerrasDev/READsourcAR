# Resource Guardian Performance & Benchmark Report

## Production Bundle Sizes

Built with `esbuild --bundle --minify --target=es2022`:

| Output File | Size (Minified) | Purpose |
| :--- | :--- | :--- |
| `dist/background/service-worker.js` | 8.4 kB | Event-driven DeclarativeNetRequest coordination & storage listener |
| `dist/content/content-script.js` | 11.5 kB | Safe on-demand DOM text extraction & WeakMap restoration |
| `dist/popup/popup.js` | 9.9 kB | Toolbar quick controls & translation action UI |
| `dist/options/options.js` | 9.7 kB | Advanced policy configuration, exception manager, import/export |
| **Total JavaScript footprint** | **~39.5 kB** | Full extension runtime |

---

## Memory & CPU Efficiency Characteristics

1. **Declarative Request Blocking:**
   - Chrome's native `declarativeNetRequest` (DNR) engine filters requests at the network layer in C++ before browser rendering.
   - Zero JavaScript CPU overhead during web page navigation and idle browsing.
   - Service worker shuts down gracefully when inactive (Manifest V3 event-driven architecture).

2. **Translation Memory Bounds:**
   - Text node values stored using `WeakMap<Node, string>`. Garbage-collected automatically when DOM elements are removed.
   - Translation LRU cache capped at 500 entries (configurable, clamped to maximum 2,000 entries) with a 24-hour TTL.
   - Deduplication: In-flight duplicate requests share the active promise, avoiding redundant network fetches.
   - Bounded chunking: Long texts are split into ~800 character chunks to respect provider limits and avoid memory spikes.
