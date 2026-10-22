# MarketNest

A static marketplace (HTML/CSS/vanilla JavaScript) hosted on Vercel with Supabase Auth, Postgres, Storage and Row Level Security. Start with `SETUP.md`.

## Features
- Public storefront: search, categories, sorting, price range, product details, product photos and shareable links
- Customer and seller accounts, email verification, password recovery, saved items and recently viewed products
- Seller dashboard: create, edit, remove listings; change price/stock/category/description; replace product photos (JPEG/PNG/WebP, max 2 MiB)
- Demo order placement backed by a database RPC that validates current prices and stock, creates order history, and decrements inventory atomically
- Seller order management and customer order tracking; cancelling an order item restores its stock
- Verified-buyer reviews with database-enforced eligibility and one review per customer/product
- Buyer/seller messaging limited to customers with an order for that product
- Database notifications for orders/status updates and messages
- Product reports, admin listing/review moderation, and admin account suspension/restore
- Basic Bengali/English switch in the tools area
- Responsive design and offline tests

## Important limits
**MarketNest does not process real payments.** Orders created in the current implementation are demo orders only. No payment gateway, shipping integration, seller payouts, refunds, tax invoices, or live chat is included. The admin panel can suspend marketplace actions but does not delete or ban a user's Supabase Auth identity.

## Files
- `index.html`, `styles.css`, `seller.css`, `features.css`: page structure and styling
- `app.js`, `helpers.js`, `features.js`: storefront and marketplace features
- `supabase-config.js`: public Supabase URL and publishable/anon key only
- `setup.sql`: original products table and policies
- `migration-v2-images-recovery.sql`: images, Storage bucket and policies
- `migration-v3-customers.sql`: wishlist and descriptions
- `migration-v4-marketplace.sql`: inventory, orders, reviews, messages, notifications, reports, admin and suspension policies
- `tests/run-tests.js`: offline checks (`node tests/run-tests.js`)

## Security
- The browser uses only a Supabase publishable/anon key; never expose a service-role/secret key.
- PostgreSQL RLS and Storage policies enforce access; frontend checks are not authorization.
- Admin membership is inserted manually by the project owner into `marketnest_admins`, not chosen during signup.
- Demo-order prices and stock are validated by `marketnest_place_order` inside Postgres.

## Setup
Follow `SETUP.md` in order. Apply v2, then v3, then v4 migrations. Replace the public key placeholder in `supabase-config.js`. Add the deployed Vercel URL to Supabase Auth redirect URLs. For admin setup, use the SQL snippet in `SETUP.md`.


Category expansion: run `migration-v5-categories.sql` after migration v4 to enable the 10 additional product categories on existing databases.
