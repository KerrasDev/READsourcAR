# Resource Guardian User Guide & Installation

## 1. Installation

### Chromium (Chrome, Edge, Brave, Opera)
1. Build the production package:
   ```bash
   npm run build
   ```
2. Navigate to `chrome://extensions/` in your browser.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the `dist/` directory.

### Mozilla Firefox
1. Build the Firefox-compatible package:
   ```bash
   npm run build:firefox
   ```
2. Navigate to `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on...** and select `dist-firefox/manifest.json`.

---

## 2. Using Resource Guard

- **Global Toggle:** Use the toolbar popup to pause or enable protection across all sites.
- **Per-Site Pause:** Click "Pause for Domain" in the popup to allow all resources on the current website without disabling global rules.
- **Resource Categories:** Toggle blocking for:
  - 3rd-Party Scripts (default: enabled)
  - All Scripts
  - Iframes
  - Images
  - Media (Audio/Video)
  - Stylesheets
  - Fonts
  - Web Workers
  - Popups
- **Custom Rules:** In Settings (Options), add specific URL patterns (e.g. `*tracker.com*`) and site scopes (`example.org`).

---

## 3. Using Translation Optimizer

1. **Translate Selection:** Highlight any text passage on a web page, click the extension icon, choose a target language (e.g. English, Spanish, French, Arabic), and click **Translate Selection**.
2. **Translate Main Content:** Click **Translate Main** to translate the central `<main>` or `<article>` body.
3. **Cancel:** If a long translation is running, click the **Cancel** button to abort in-flight work immediately.
4. **Restore Original:** Click **Restore Original** to revert all translated elements back to their exact original text and text direction.
5. **Copy Text:** Click **Copy Text** to copy the selected text directly to your clipboard.
