# Stockroom plugin for Framer

Connects a Framer project to a Stockroom store: installs the store kit (cart, checkout, store buttons) and keeps products in the Framer CMS.

## Try it in Framer (development)
1. Open a terminal in this folder and run `npm install` (once), then `npm run dev`.
2. In Framer: main menu → Plugins → turn on **Developer Tools**.
3. In your project: Plugins (toolbar) → **Open Development Plugin**.
4. Paste the Store ID from the Stockroom dashboard (Settings → Website connection) and click Connect.

If Framer can't reach the plugin, pause any ad-blocker for localhost.

## Publish to the Framer Marketplace
Run `npm run pack`, then submit the generated `plugin.zip` at framer.com/marketplace/dashboard.
