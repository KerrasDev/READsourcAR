# Installation and Verification Guide

## 1. Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

## 2. Building Unpacked Extensions

Build the extension for Chromium (Google Chrome, Brave, Microsoft Edge, Opera):
```bash
npm run build
```
The output will be placed in the `dist/` directory.

Build the extension for Firefox:
```bash
npm run build:firefox
```
The output will be placed in the `dist-firefox/` directory.

---

## 3. Loading in Chromium Browsers
1. Open Google Chrome (or any Chromium browser).
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the `dist/` directory in this repository.
6. The **Resource Guardian** extension icon will appear in your browser toolbar.

---

## 4. Loading in Firefox
1. Open Mozilla Firefox.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `dist-firefox/manifest.json`.
5. The **Resource Guardian** add-on is now loaded for testing.

---

## 5. Verification Checklist
- Click the toolbar popup: verify domain detection and global protection toggle.
- Toggle "Block 3rd-Party Scripts" or "Block Iframes".
- Open Settings (gear icon): configure site exceptions or adjust translation settings.
- Select text on a test page and click "Translate Selection": verify inline translation and RTL direction handling.
