# Privacy Policy & Data Handling

**Resource Guardian** is committed to absolute user privacy and minimal data retention.

## Core Privacy Principles

1. **Local-First Execution:** All request filtering occurs locally using the browser's native `declarativeNetRequest` engine. No network proxy or remote filtering servers are involved.
2. **No Analytics or Telemetry:** There are no analytics libraries, tracking pixels, crash reporting endpoints, or telemetry probes bundled into Resource Guardian.
3. **No Browsing History Recording:** The extension does not record, log, or export browsing history. Statistics are strictly aggregate numeric counters (e.g., number of third-party scripts blocked).
4. **Explicit Translation Consent:**
   - In **Manual Mode** (default), translation is initiated solely upon explicit user click ("Translate Selection" or "Translate Main").
   - Text is sent to an external REST endpoint only if the user explicitly configures a Custom API provider in Settings.
   - Built-in Mock and Manual providers run 100% locally on the device without any external network calls.
5. **Secure Configuration Export:** When exporting configuration files for backup, all sensitive credentials (such as Custom Translation API keys) are automatically stripped before file creation.
6. **Data Erasure:**
   - Translation cache can be cleared at any time via Settings -> Clear Translation Cache.
   - Request statistics can be set to clear automatically on browser restart.
