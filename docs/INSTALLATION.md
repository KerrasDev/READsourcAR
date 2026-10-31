# Resource Guardian — Installation & Developer Guide

## Prerequisites

- **Node.js:** v18.0.0 or later (tested on v22.14.0)
- **Package Manager:** `npm` (comes with Node.js)
- **Browser:** Chromium-based browser (Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi) or Mozilla Firefox (version 109+ for MV3).

---

## 1. Building from Source

Clone the repository and install development dependencies:

```bash
npm install
```

Run typechecking and test verification:

```bash
npm run typecheck
npm test
```

Build the production extension:

```bash
npm run build
```

This compiles TypeScript source files, bundles CSS and HTML, and outputs the production package into the `dist/` directory.

---

## 2. Loading the Extension in Google Chrome / Chromium Browsers

1. Open your browser and navigate to the extensions management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode** using the toggle in the upper-right corner.
3. Click the **Load unpacked** button.
4. Select the `dist/` folder located in the root of the Resource Guardian repository.
5. The **Resource Guardian** extension icon will now appear in your browser toolbar. Pin the extension for quick access.

---

## 3. Loading the Extension in Mozilla Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Navigate to the `dist/` directory and select the `manifest.json` file.
4. The extension will be loaded temporarily for testing and inspection.

---

## 4. Verification Steps

1. **Toolbar Popup:** Click the shield icon in the toolbar. The popup should display the current domain, global protection state (`ENABLED`), quick resource toggles, and translation controls.
2. **Settings Page:** Click the gear icon (`⚙️`) in the popup or right-click the extension icon and choose **Options**. Confirm that the Resource Guard policies, Site Exceptions, Custom Pattern Rules, Translation Optimizer, and Privacy settings load properly.
3. **Translation Verification:** Open any web page with text, select a passage, open the popup, select your target language (e.g. Spanish or Arabic), and click **Selection**. Verify that the text translates in place and can be restored using the **Restore** button.
