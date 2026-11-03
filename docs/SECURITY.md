# Resource Guardian Security, Privacy & Threat Model

## Permissions & Least Privilege Rationale

Resource Guardian adheres strictly to the Principle of Least Privilege:

| Permission | Justification |
| :--- | :--- |
| `declarativeNetRequest` | Required to block trackers, ads, scripts, and media natively before network download. |
| `declarativeNetRequestWithHostAccess` | Required to dynamically bind rules to user-configured domains and initiator scopes. |
| `storage` | Stores user configuration, domain exceptions, and bounded counters in local browser storage. |
| `activeTab` | Grants temporary content script interaction on the currently active tab when the user clicks translation buttons. |
| `scripting` | Allows executing targeted actions on demand without maintaining background listeners on inactive tabs. |
| `<all_urls>` host permissions | Required for DNR request filtering across user-visited web pages and cross-origin resource classification. |

---

## Data Privacy Principles

- **No Remote Telemetry or Tracking:** Resource Guardian has zero analytics, zero external logging, and does not record or transmit browsing history.
- **No Silent Translation:** Webpage text is NEVER transmitted to external translation APIs automatically. Translation occurs only upon explicit user action (e.g. clicking "Translate Selection" or "Translate Main").
- **Credential Protection:** API keys entered for custom translation endpoints are never exported during settings backup.
- **DOM Safety:** Original DOM values are preserved in-memory via `WeakMap`. Code blocks (`<code>`, `<pre>`), passwords, input fields, and editable elements are excluded from translation.
