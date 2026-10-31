# Resource Guardian — Known Limitations & Browser Constraints

## 1. Browser API Boundaries (Manifest V3)

### DeclarativeNetRequest Rule Limits
- **Constraint:** Chromium engines enforce a quota on dynamic rules (typically up to 5,000 dynamic rules per extension).
- **Resource Guardian Handling:** The extension compiles rules through `compileSettingsWithTelemetry`. If rule sets exceed `MAX_SAFE_DYNAMIC_RULES (5000)`, lower-priority global rules are truncated safely while preserving Tier 1 safety rules and Tier 2 user allow rules. A warning is surfaced to the console.

### Inability to Filter Requests on Browser Internal Pages
- **Constraint:** Extensions cannot intercept or filter requests initiated by internal browser schemes, such as `chrome://`, `chrome-extension://`, `about:`, `edge://`, or the Chrome Web Store.
- **Resource Guardian Handling:** Resource Guardian explicitly excludes these schemes via Tier 1 safety rules to prevent unexpected extension faults.

---

## 2. Resource Category Limitations

### Web Workers & WebSocket Blocking
- **Constraint:** DeclarativeNetRequest can filter worker creation scripts and WebSockets when initiated over HTTP(S). However, dedicated inline workers created via `blob:` URLs may require document-level Content Security Policy (CSP) headers to block entirely if script blocking is not enabled globally.
- **Recommendation:** Enable **All Scripts** or **Third-Party Scripts** blocking to prevent inline worker instantiation at the source.

### Embedded Frames vs. Window Popups
- **Constraint:** `sub_frame` filtering blocks nested iframes and embedded frame documents. Window popups spawned via direct `window.open()` calls without a URL navigation may be managed by the browser's native popup blocker.

---

## 3. Translation Optimization Boundaries

### Dynamic Single-Page Application (SPA) Updates
- **Constraint:** When a website replaces whole DOM subtrees dynamically via client-side routing, newly rendered elements will display in the site's original language until the user triggers translation again.
- **Design Decision:** Resource Guardian intentionally avoids attaching permanent `MutationObserver` listeners across the entire DOM to eliminate background CPU cycles and prevent race conditions.

### External Custom Translation API Requirements
- **Constraint:** Custom translation APIs require a functional HTTP REST endpoint supporting JSON payloads (`{ q, source, target }`). If the external endpoint requires custom authorization or has strict CORS policies, proper headers or proxying must be configured in Settings.
