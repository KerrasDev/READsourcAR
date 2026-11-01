# Resource Guardian 🛡️

A high-performance, lightweight Manifest V3 browser extension for fine-grained resource control and smart translation optimization.

## Features

### 1. Resource Guard
- **Pre-download network filtering**: Utilizes Chrome's native `declarativeNetRequest` (DNR) dynamic rules to block requests before network initiation.
- **Strict 6-tier precedence model**:
  1. Temporary paused domains / Emergency overrides (Priority 1000)
  2. Site-scoped custom allow (210) & block (200) rules
  3. Global custom allow (110) & block (100) rules
  4. Site-specific category overrides (60 allow / 50 block)
  5. Global category default rules (15 allow / 10 block)
  6. Browser default allow behavior
- **Granular resource categories**: Scripts, third-party scripts & trackers, iframes, images, media (audio/video), stylesheets, fonts, web workers, and popups.
- **Rule safety limits**: Hard cap at 5,000 rules (`MAX_SAFE_DYNAMIC_RULES`) to protect dynamic rule quotas.

### 2. Translation Optimizer
- **Bounded chunking**: Text segmented into 800-character chunks respecting punctuation and sentence boundaries.
- **In-flight deduplication & LRU Cache**: Duplicate requests return identical active promises; cached with configurable TTL (default 24h) and capacity (default 500 entries).
- **DOM protection**: Preserves `<code>`, `<pre>`, `<input>`, `<textarea>`, and password fields. Text values stored in `WeakMap` for non-destructive instant restoration.
- **RTL & Multilingual support**: Auto-detects text direction (e.g. Arabic `dir="rtl"`) and languages.

## Installation & Build

### Development
```bash
# Install dependencies
npm install

# Run test suite
npm test

# Type check
npm run typecheck

# Production build
npm run build
```

### Loading the Extension in Chromium
1. Open Google Chrome or any Chromium-based browser.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the upper right corner.
4. Click **Load unpacked** and select the `dist/` directory in this repository.

## Documentation
- [Architecture & Mechanics](docs/ARCHITECTURE.md)
- [Performance & Benchmarks](docs/PERFORMANCE.md)
- [Security & Privacy](docs/SECURITY.md)
