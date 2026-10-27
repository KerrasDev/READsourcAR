# Known Limitations & Browser Compatibility

## Browser API Limitations

1. **DeclarativeNetRequest Dynamic Rule Caps**: Chrome enforces a limit of dynamic rules (`MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES = 5000`). Resource Guardian detects rule compiler overflow and caps dynamic rules gracefully while notifying the user.
2. **DOM-Level Post-Insertion Fallback**: Removing inserted DOM elements (e.g. `<script>` or `<iframe>`) after insertion does not guarantee preventing the network fetch if the browser has already initiated the request. Resource Guardian relies on native `declarativeNetRequest` filtering prior to download.
3. **Debug Listener Availability**: Detailed per-request blocked counts via `onRuleMatchedDebug` are available primarily in unpacked/developer extension builds per Chrome security policies. General aggregated counts are retained in local storage.
4. **Editable Form Inputs & Code Blocks**: To prevent data corruption, translation intentionally skips form inputs (`<input>`, `<textarea>`), contenteditable regions, and code blocks (`<code>`, `<pre>`).
