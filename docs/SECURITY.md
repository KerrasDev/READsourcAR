# Security & Privacy Documentation

## Least Privilege Permissions

| Permission | Justification |
| :--- | :--- |
| `declarativeNetRequest` | Used to block unwanted scripts, ads, and network resources natively before download. |
| `declarativeNetRequestWithHostAccess` | Applies dynamic request filtering rules across user-visited network endpoints. |
| `storage` | Stores user configuration, category policies, and domain exceptions locally. |
| `activeTab` | Allows the user to initiate on-demand DOM text translation on the current page. |
| `scripting` | Coordinates content operations on user action without background telemetry. |
| `<all_urls>` | Required for DNR request filtering across arbitrary domains visited by the user. |

## Privacy Safeguards
- **Zero Telemetry**: No analytics or tracking code is bundled or executed.
- **No Browsing History Stored**: The extension does not record, log, or export visited URLs.
- **Export Sanitization**: Exported settings files automatically strip API keys and credentials.
- **No Remote Code Execution**: Strictly enforces Manifest V3 rules against arbitrary remote script evaluation.
- **Explicit Translation Actions**: Page content is never transmitted without intentional user action (e.g. clicking Translate).
