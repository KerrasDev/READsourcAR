# Platform Limitations & Fallback Behaviors

## 1. DeclarativeNetRequest Rule Limits
- **Chromium Dynamic Rules Limit:** Chromium browsers typically impose a safe maximum of 5,000 dynamic rules (`MAX_NUMBER_OF_DYNAMIC_RULES`).
- **Graceful Handling:** Resource Guardian enforces `MAX_SAFE_DYNAMIC_RULES = 5000` inside `src/rules/rule-compiler.ts`. If user-configured custom rules and site exceptions exceed this threshold, higher-precedence rules (paused domains, site allow/blocks) are retained while lower-priority rules are safely omitted, accompanied by an explicit diagnostic warning.

## 2. Protected Schemes & Internal Domains
- Browser extensions cannot block or intercept requests originating from or targeting internal browser schemas:
  - `chrome://*`, `chrome-extension://*`, `about:*`, `edge://*`, `moz-extension://*`.
- Resource Guardian explicitly excludes internal extension schemes (`excludedSchemes: ['chrome-extension', 'moz-extension', 'about', 'data']`) to prevent accidental self-blocking or UI breakage.

## 3. Popups & Window Open
- Modern popup blocking in browser engines is handled at the network level by blocking `sub_frame` navigation or window navigation to unknown origins. Window popups opened via inline script APIs (`window.open`) that do not produce network navigations fall under browser native popup blockers.

## 4. Translation Provider Connectivity
- When using a Custom REST API Translation Provider:
  - An internet connection to the specified endpoint is required.
  - If the endpoint returns a non-200 HTTP code, the UI displays a non-destructive error message and preserves the original text nodes.
  - Built-in Mock and Manual providers require no network connectivity and work completely offline.
