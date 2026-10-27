# Resource Guardian User Guide

## Installation

1. Clone or download the repository.
2. Install dependencies and build the extension:
   ```bash
   npm install
   npm run build
   ```
3. Open Chrome / Edge and navigate to `chrome://extensions`.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the `dist/` directory.

## Features & Usage

### 1. Resource Guard
- **Toolbar Popup**: Toggle global protection state or pause protection for the current domain with a single click.
- **Resource Categories**: Enable or disable default blocking for 3rd-party scripts, all scripts, iframes, images, media, or popups.
- **Options Page**: Configure domain-specific rule exceptions and custom allow/block rules.

### 2. Translation Optimizer
- **Translate Selection**: Highlight text on any web page, select a target language in the toolbar popup, and click **Translate Selection**.
- **Restore Text**: Click **Restore Text** in the popup to instantly revert translated DOM elements to their original text and layout.
- **RTL Language Support**: Selecting Right-to-Left languages (e.g., Arabic) automatically formats the translated container with `dir="rtl"`.
- **Custom Translation API**: Set up custom REST endpoints in the Options page. Ensure explicit consent is enabled before transmitting page content.
