# Permissions Rationale

Resource Guardian follows the principle of least privilege. Each permission requested in `manifest.json` is strictly necessary for extension features.

| Permission | Justification |
| :--- | :--- |
| `declarativeNetRequest` | Enables native, declarative browser filtering to block unwanted, tracking, or expensive network requests before download. |
| `declarativeNetRequestWithHostAccess` | Allows applying dynamic request rules across origins according to user-configured category policies and site exceptions. |
| `storage` | Safely persists local user settings, site exceptions, custom rules, and bounded statistics in `chrome.storage.local`. |
| `activeTab` | Permits reading selected page text and executing text replacement when the user explicitly triggers a translation action. |
| `scripting` | Enables content script execution for translation DOM processing on active pages. |
| `<all_urls>` (host_permissions) | Required for network request filtering and user-initiated translation across arbitrary websites visited by the user. |

No unnecessary or invasive permissions (such as `webRequestBlocking`, broad cookies access, or background history access) are requested.
