# Stockroom

One commerce platform for all your client stores: an admin dashboard, a till (POS) with kitchen screen and reservations, WhatsApp ordering, and a Framer plugin that turns any Framer design into a working shop.

## What's in this folder

| Folder | What it is |
|---|---|
| `src/` | The admin dashboard (React). One file per screen in `src/pages/`. |
| `src/data/store.tsx` | Loads and saves data. Uses Supabase when `.env` has keys, otherwise sample data. |
| `supabase/migrations/` | The database: tables for every store, and security rules so each client only sees their own store. **Already applied** to the `sitedesk` Supabase project. |
| `supabase/functions/store-api/` | Checkout, payments (Paystack, Flutterwave, Stripe, cash on delivery) and order confirmation. **Deployed.** |
| `supabase/functions/whatsapp/` | The WhatsApp ordering bot. **Deployed.** |
| `framer-kit/Stockroom.tsx` | The store kit the plugin installs into a Framer project: overrides and components. |
| `framer-plugin/` | The Framer plugin (connect store, install kit, sync products to the CMS). |

## Live services (sitedesk project)

- Database URL: `https://tziwxxsnhqetjcxgemen.supabase.co`
- Checkout API: `…/functions/v1/store-api/…`
- Paystack webhook: `…/functions/v1/store-api/paystack-webhook`
- WhatsApp webhook: `…/functions/v1/whatsapp/<store id>`

## Recipe: put the dashboard online (free, about 10 minutes)

1. Go to **app.netlify.com**, sign up (free) and open **Sites**.
2. Drag the `dist` folder (from `stockroom-dashboard-build.zip`, unzipped) onto the page that says "Drag and drop your site output folder here".
3. Netlify gives you an address like `stockroom-abc123.netlify.app`. Rename it under **Site configuration → Change site name** (e.g. `stockroom-admin`).
4. In Supabase → **Authentication → URL Configuration**, set **Site URL** to that address, so password-reset and sign-up emails link back to it.
5. Open the address, choose **Create an account**, confirm your email, sign in and create your first store.

Later, when the code is on GitHub, connect the repo in Netlify instead (build command `npm run build`, publish folder `dist`) so every change goes live by itself.

## Recipe: set up a new client

1. Dashboard → store menu (top left) → **Add another store**. Pick Shop or Restaurant.
2. **Settings → Payments**: turn on Paystack, paste the client's public and secret keys. In Paystack, set the webhook URL shown there.
3. **Settings → Delivery**: set zones and fees.
4. **Products**: add products, or **Import** a CSV (a Shopify export works).
5. Ask the client to open the dashboard and **Create an account** with their email. Then **Settings → Team → Invite staff** with that email and role Owner/Admin.
6. Restaurants: **Staff & shifts → Add staff** (each gets a PIN), **Reservations → Booking rules**, **Reservations → Tables**.
7. WhatsApp (optional): **WhatsApp → Set up** and follow the steps there.

## Recipe: build the client's Framer site

1. In a terminal: `cd framer-plugin`, then `npm install` (once) and `npm run dev`.
2. In Framer: main menu → Plugins → turn on **Developer Tools**. Then Plugins → **Open Development Plugin**.
3. Paste the **Store ID** (dashboard → Settings → Website connection) → Connect.
4. Click **Install store kit**, then **Sync products to CMS**.
5. Design your product page as a CMS page for the **Products** collection at `/products/:slug`.
6. Add **Cart Drawer** (from the plugin) to your navigation component, and **Order Confirmation** to a `/thank-you` page.
7. Make designed layers work: select a layer → **Code Overrides** → File **Stockroom** →
   - Buttons: `withAddToCart`, `withBuyNow`, `withOpenCart`, `withCheckout`, `withQuantityPlus`, `withQuantityMinus`, `withBookTable`, `withOrderOnWhatsApp`
   - Text: `withPrice`, `withComparePrice`, `withStockStatus`, `withCartCount`, `withCartTotal`, `withQuantity`
   - Size/colour pills: `withVariantOption` (name the layer after the value, e.g. `M`)
   - Show/hide: `withHideWhenSoldOut`, `withShowWhenSoldOut`, `withHideWhenCartEmpty`
8. In CMS product cards (lists), use the **Add To Cart** component instead of an override: connect its **Product** field to the CMS **Slug**, and put your own button design in its **Design** slot.
9. Restaurants: use the **Menu** and **Book Table** components.

## Run the dashboard on your computer

1. Install Node.js 20+ (nodejs.org).
2. In this folder: `npm install`, then `npm run dev`, and open the address it prints.
3. Remove the `.env` file (or its values) to use sample data instead of the live database.

## Not done yet

- Automatic Framer publishing when a brand-new product is added (Framer Server API). Until then, click **Sync products to CMS** in the plugin and publish.
- Offline mode for the till (orders during internet outages).
- Printing receipts to thermal printers.
- Email/SMS order notifications to customers (WhatsApp messages work once connected).
