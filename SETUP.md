# MarketNest: Setup Guide (beginner friendly)

You do **not** need a new Supabase project. Your existing project, products, accounts and SMTP email settings stay as they are. Nothing here deletes data.

Legend: **[REQUIRED]** must do · **[OPTIONAL]** nice to have.

---

## A. Extract the ZIP [REQUIRED]
1. Download `marketnest-v2.zip`.
2. Right-click it → **Extract All…** (Windows) or double-click it (Mac).
3. Open the extracted `marketnest` folder. You should see `index.html`, `app.js`, `helpers.js`, `supabase-config.js`, `migration-v2-images-recovery.sql` and more.

## B. Add your Supabase publishable key [REQUIRED]
Your uploaded `supabase-config.js` still had a placeholder, so I could not copy your key. I did not invent one.
1. Supabase Dashboard → your project → **Project Settings → API Keys** (or click **Connect**).
2. Copy the **Publishable key** (starts with `sb_publishable_`) or the legacy **anon** key.
3. Open `supabase-config.js` in Notepad. Replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE` with the key. Keep the quote marks. Save.
4. The project URL (`https://cmzlrdisctubakuatvlb.supabase.co`) is already filled in.

⚠️ Never paste the **secret / service_role** key, database password, or any SMTP/Gmail password into this file or into GitHub. The publishable key is meant for browsers and is safe because the database rules protect your data.

## C. Apply the database migration [REQUIRED]
1. Supabase → **SQL Editor → New query**.
2. Open `migration-v2-images-recovery.sql`, copy **everything**, paste, click **Run**.
3. It is safe to run more than once. It only: adds an `image_path` column, adds a safety rule for image paths, makes the shop name come from the signed-in account, creates the storage bucket and its security policies.
4. At the bottom you'll see two result tables (bucket + policies). Check them in step F.

> Until you run this, the website still works but photos are switched off and a notice appears.

## C2. Apply the v3 migration (customer accounts + descriptions) [REQUIRED for the new features]
1. SQL Editor → New query → paste **everything** from `migration-v3-customers.sql` → **Run**. Run it **after** step C.
2. It adds a product `description` column and a `wishlist` table where each person can see, add and remove **only their own** saved items (anonymous visitors get nothing).
3. Check the result tables at the bottom: `description` is listed, and `wishlist` shows 3 policies (SELECT, INSERT, DELETE).

> Until you run it, the site still works; saving items and descriptions are switched off with a notice.

## D. The `product-images` bucket [REQUIRED, done by the SQL]
The migration creates it automatically. To double-check: **Storage → product-images**. It should say **Public**. Do not make it private (photos would not show to visitors).

## E. The 2 MiB limit [REQUIRED, done by the SQL; please verify]
The SQL sets `file_size_limit = 2097152` bytes. Verify: **Storage → Files → ⚙ (bucket settings / three-dots → Edit bucket)**: "Restrict file upload size" should show **2 MB** (2,097,152 bytes) and allowed types `image/jpeg, image/png, image/webp`. If the dashboard shows something else, set it by hand to `2097152` bytes.
Note: your Supabase plan also has a *global* upload limit (Project Settings → Storage). It must be ≥ 2 MB (the free plan default is higher).

## F. Verify storage security [REQUIRED, 2 minutes]
**Storage → Policies → storage.objects** should list exactly three policies starting with `product-images:`:
- sellers upload to own folder (INSERT)
- sellers read own folder (SELECT)
- sellers delete own files (DELETE)

There must be **no** UPDATE policy (this stops overwriting) and **no** policy for `anon`/public that allows upload or delete. Public viewing of images works through the bucket's public URL, not through a policy.

What the SQL does vs. the Dashboard:
| Thing | Done by SQL | Dashboard |
|---|---|---|
| `image_path` column, constraint, trigger | ✅ | – |
| Bucket, 2 MiB limit, allowed types | ✅ | verify only |
| Storage policies | ✅ | verify only |
| Products RLS (public read, own insert/delete) | ✅ already from `setup.sql` | – |
| Redirect URLs for password reset | ❌ | **you do this (section G)** |
| SMTP | already configured | leave unchanged |

## G. Password-reset redirect URLs [REQUIRED]
1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: your live address, e.g. `https://your-project.vercel.app` (no localhost).
3. **Redirect URLs** → add:
   - `https://your-project.vercel.app/` (and `https://your-project.vercel.app/**`)
   - If you use a custom domain, add it the same way.
   - [OPTIONAL, testing on your PC only] `http://localhost:8000/`. Remove it before going public if you like.
4. Save. Without this, reset links are rejected or sent to the wrong page.

Optional: if you want emails to always use one fixed address, put it in `MARKETNEST_SITE_URL` in `supabase-config.js`. Leave it empty otherwise.

## H. Test email recovery with your existing SMTP [REQUIRED]
Needs your real inbox, so **I could not test this for you.**
1. On the live site: **Seller studio → Sign in → Forgot Password?**
2. Enter a registered email → **Send reset link**. You'll see a neutral message (it is the same whether or not the email exists, on purpose).
3. Open the email (check spam) → click the link. You land on MarketNest with the **Choose a new password** form.
4. Enter a new password twice → **Update password** → you're returned to Sign in → log in with the new password.
5. Click the same email link again: you should see "invalid, expired, or already used".
6. If no email arrives: Supabase → **Authentication → Logs**, and check your SMTP provider's sending limits. Supabase limits how many auth emails can be sent per hour.

## I. Upload to GitHub [REQUIRED]
Easiest (no tools):
1. Open https://github.com/prohhh405s/MarketNest → **Add file → Upload files**.
2. Drag in **all files from the extracted folder** (index.html, styles.css, seller.css, features.css, app.js, helpers.js, features.js, supabase-config.js, setup.sql, migration-v2-images-recovery.sql, migration-v3-customers.sql, migration-v4-marketplace.sql, migration-v5-categories.sql, SETUP.md, README.md, and the `tests` folder). Same names replace the old ones.
3. Write a message like "MarketNest v2" → **Commit changes** (to `main`).

## J. Vercel redeploy [REQUIRED, automatic]
If the repo is connected to Vercel, a new deployment starts by itself after the commit. Watch **Vercel → your project → Deployments** until it says **Ready**, then hard-refresh the site (Ctrl+Shift+R). No build settings are needed: it's a static site (framework "Other", no build command, output = root).

## K. Test everything [REQUIRED]
Tick each item on the live site:
- [ ] **Customer account:** Create account → choose "Shop & save items" → verify email → sign in. You see a customer area (no seller dashboard).
- [ ] Tap ♡ on a product: it fills in, the Saved counter goes up, refresh the page: still saved. Click **Saved** in the header to see only saved items.
- [ ] Signed out, tap ♡: you are asked to sign in.
- [ ] Customer area → **Enable seller tools** with a shop name: the seller dashboard appears.
- [ ] Customer area → **Change password** works.
- [ ] Price filter (min/max), **Clear filters**, and a product's **Copy link** (open the link in a new tab: the product opens), **More from this seller**.
- [ ] Publish a product with a description: it shows in the details window.
- [ ] Homepage loads; empty state shows if no products exist.
- [ ] Search by name works; category buttons and dropdown filter; sort by newest / price both ways.
- [ ] Click a product: details window opens (Esc closes it).
- [ ] Create a seller account → verification email arrives → click it → you're signed in.
- [ ] Sign out, sign in. Refresh the page: still signed in.
- [ ] Publish a product **with** a JPEG/PNG/WebP photo under 2 MB: preview shows, product appears with the image.
- [ ] Choose a file over 2 MB: clear error, nothing uploaded.
- [ ] Choose a `.gif`, `.svg` or `.pdf`: rejected. Rename a `.txt` to `.png`: rejected ("doesn't look like a real image").
- [ ] Publish without a photo: emoji placeholder shows.
- [ ] Delete your listing: it disappears and its image is removed (Storage → product-images → your user-id folder).
- [ ] Second account: it cannot see the first account's "My listings" or delete its products.
- [ ] Signed out in a private window: you can browse but not publish.
- [ ] Forgot password flow (section H).
- [ ] Phone check: open on your phone or press F12 → device toolbar; menus, forms and the details window should fit the screen.

## Run locally [OPTIONAL]
In the folder: `py -m http.server 8000` then open http://localhost:8000 (add that URL in section G to test reset emails locally).

## Run my automated checks [OPTIONAL]
With Node.js installed: `node tests/run-tests.js` (offline; no Supabase needed).

## Troubleshooting
- **"Setup needed"** → key still a placeholder (section B).
- **Photos not showing / "Photos need the SQL migration"** → run section C.
- **Upload says bucket isn't set up** → run section C.
- **Reset link says expired** → links work once and expire; request a new one.
- **Sign-in says verify your email first** → click the link in the confirmation email.

## C2. Apply the v4 marketplace migration [REQUIRED for advanced features]
1. Supabase Dashboard → **SQL Editor → New query**.
2. Open `migration-v4-marketplace.sql`, copy the entire file, paste it, and click **Run**.
3. Open `migration-v5-categories.sql`, copy the entire file, paste it, and click **Run** to enable the 10 additional product categories.
3. This adds stock and listing edits, demo order records, server-validated stock/price calculations, verified-buyer reviews, buyer/seller messaging, notifications, reports, admin moderation, and suspended-account controls. It does not delete existing products or accounts and does not process payments.
4. Check the verification result tables at the bottom. If Supabase reports an SQL error, stop and share the exact error text (without passwords or keys) rather than repeatedly running partial snippets.
5. New products begin with stock 10 by default. Open **MarketNest Tools → Stock & seller orders** to change stock or edit a listing.

### Give one account admin access (project owner only)
Admin is **not** a public signup role. First sign up and verify the account you want to use as the administrator. In Supabase SQL Editor, replace `ADMIN_EMAIL_HERE` with that account's exact email and run:

```sql
insert into public.marketnest_admins(user_id)
select id from auth.users where lower(email) = lower('ADMIN_EMAIL_HERE')
on conflict (user_id) do nothing;
```

Then sign out and back in on MarketNest and open **MarketNest Tools → Admin**. If no row is inserted, check that the email is verified and spelled correctly. Keep the admin account secure and never add admin controls to public signup. The admin panel can review reports, remove listings/reviews, and suspend/restore marketplace activity for accounts. Suspended users may still authenticate, but the database blocks marketplace actions. This does not delete their Supabase login.

## Features and important limits
- **Demo orders:** pressing “Place demo order from cart” creates a database order and decrements stock using a server-side Supabase function. Prices are read from the database, not trusted from the browser. Cancelling a line returns its stock. This is not a payment gateway, shipping integration, or legal checkout flow.
- **Reviews:** only delivered order items are eligible, and one review per customer/product is enforced by database constraints and RLS.
- **Messages:** a buyer must have an order for that product to message its seller; sellers can reply to buyers who ordered that product.
- **Notifications:** order/status changes and messages create database notifications. Users can mark their own notifications read.
- **Reports/admin:** signed-in users can report listings. Admins can update report status and moderate listings/reviews and suspend/restore accounts.
- **Inventory:** sellers can edit name, description, category, price, stock, and replace product photos. Replacing a photo uploads a new unique file before updating the listing.
- **Recently viewed:** stored only in the current browser, not in the account or database.
- **Languages:** the language control provides a basic Bengali/English switch for the tools area; some existing storefront copy and product-supplied text remain in the language entered by the seller.
- **Still not included:** real payments, shipping labels, seller payouts, refunds, tax invoices, email/SMS order notifications, live chat, or deletion/ban of Supabase Auth users. Real payments require a secure server-side payment integration and an adult account holder where required by the provider.

## Final verification checklist for v4
- [ ] Run the v4 SQL migration without errors.
- [ ] Set one verified admin user using the SQL above.
- [ ] Publish a product, edit its name/description/category/price/stock, and replace its photo.
- [ ] Create a second customer account, add a product to the demo cart, and place a demo order.
- [ ] Verify stock decreases and the order appears in buyer history and seller orders.
- [ ] As seller, update item status to `delivered`; confirm the buyer receives a notification and can submit one review.
- [ ] Send a message between the buyer and seller; confirm the recipient sees it and a notification.
- [ ] Submit a listing report; as admin, change its status and test removing a listing/review.
- [ ] As admin, suspend a test account; confirm it cannot place orders, sell, send messages, or report content. Restore it afterward.
- [ ] Test a product at stock 0; the storefront should disable adding it to the demo cart, and the database must reject an order that exceeds stock.
- [ ] Confirm there is no service-role/secret key in any frontend file or GitHub commit.

## Private admin control room

After `migration-v4-marketplace.sql` and its prerequisites have succeeded, authorize a verified existing account using the project-owner SQL above. Then open `https://YOUR-VERCEL-DOMAIN/admin.html` and sign in with that account. The route is not linked from the storefront, but it is not a secret security boundary: the admin RPC and database RLS policies must authorize every privileged operation.

The panel can monitor listings, demo orders, reports, reviews and account profiles. Hiding a listing retains its row; suspending a profile does not delete its Supabase Auth identity; removing a review is permanent and prompts for confirmation. The orders area is read-only and order totals represent demo order values, not collected payments. Do not use a production customer account for moderation tests.

Before merging or deploying admin changes:
1. Run `node tests/run-tests.js`.
2. Test the page using a disposable admin account and non-admin account.
3. Verify a non-admin account cannot load protected records or perform moderation.
4. Verify product hide/restore, report status changes, review removal, and account suspend/restore against a disposable Supabase project first.
5. Never add a service-role/secret key to browser files. The browser uses only the public publishable/anon key.


## L. Admin account management [OPTIONAL]
To enable account creation/deletion, password setting, and admin-role management in the Control Room:
1. Install and sign in to the Supabase CLI, then link it to the existing Supabase project.
2. From the repository folder, run `supabase functions deploy admin-user-management`.
3. In Supabase Dashboard → Edge Functions → Secrets, confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are configured for the project. The service-role key is server-only and must never be pasted into browser files or GitHub.
4. Open Admin Control Room → Users and test with a non-critical test account first. Creating an account this way marks its email confirmed; only do that when you are authorized to create the account. Deleting an account is permanent.
