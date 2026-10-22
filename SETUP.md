# MarketNest — Seller Accounts (beginner setup)

This version adds Supabase email/password authentication and shared product listings. It is still a learning project: cart and checkout are demo-only, and there are no real orders, payments, shipping, refunds, or seller payouts.

## What you need
- A PC and your existing MarketNest folder
- A free Supabase account/project
- A text editor such as Notepad (VS Code is optional)
- Internet connection while testing, because Supabase JS is loaded from a CDN

## Part 1 — Create your free Supabase project
1. Go to https://supabase.com and sign in/create an account.
2. Create a new project. Pick a project name such as `marketnest-test`.
3. Save the database password somewhere private. The website does not need this password.
4. Wait until the project finishes starting.

## Part 2 — Create the database table and security rules
1. In the Supabase dashboard, open **SQL Editor**.
2. Choose **New query**.
3. Open `setup.sql` from this folder in Notepad.
4. Copy the entire file and paste it into the SQL Editor.
5. Click **Run**. Look for a successful result. If you see an error, stop and read it instead of continuing blindly.

The SQL enables Row Level Security (RLS). The browser can read published products; signed-in sellers can insert rows only with their own auth ID and delete only their own rows. Do not disable RLS.

## Part 3 — Connect MarketNest to Supabase
1. In Supabase, open **Project Settings → API** (the exact dashboard wording can vary), or use the project’s **Connect** panel.
2. Copy the **Project URL**.
3. Copy the **publishable key** or legacy **anon/public key**. This is not the service-role/secret key.
4. Open `supabase-config.js` in Notepad.
5. Replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` and `PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE` with the values you copied. Keep the quote marks.
6. Save the file.

Example shape only (not a real project):
```js
window.MARKETNEST_SUPABASE_URL = "https://your-project-id.supabase.co";
window.MARKETNEST_SUPABASE_ANON_KEY = "your-publishable-or-anon-key";
```

**Never put a `service_role` key, secret key, database password, or private API key in this file.** Browser code is visible to visitors. The publishable/anon key is safe for browser use only when your RLS policies are correct.

## Part 4 — Run the site on your PC
Opening `index.html` by double-clicking may work, but a local web server is more reliable.

### Easiest method if Python is already installed
1. Extract this ZIP to a normal folder, for example Desktop.
2. Open that folder in File Explorer.
3. Click the address bar, type `cmd`, and press Enter.
4. In the black Command Prompt window, run:
   `py -m http.server 8000`
5. Leave that window open.
6. In Chrome, visit `http://localhost:8000`.
7. To stop the server, return to the Command Prompt and press `Ctrl+C`.

If `py` is not recognised, try `python -m http.server 8000`. If neither works, install Python from https://www.python.org/downloads/ or use VS Code with the Live Server extension.

## Part 5 — Test seller accounts
1. In MarketNest, create an account with an email you can access and a new password of at least 8 characters.
2. If Supabase email confirmation is enabled, open the confirmation email and confirm your address.
3. Return to MarketNest and sign in.
4. Add a product and click **Publish listing**.
5. Refresh the page. The published listing should still appear because it is stored in Supabase.
6. Open a private/incognito window or another browser, visit the same local URL, and check that the listing appears there too.
7. Create a second test account and publish a different product. Each account should see only its own listings under **My listings**, while both published products appear in the public shop.
8. Try deleting one account’s listing from the other account: it should not appear in that account’s dashboard, and the database should reject unauthorised deletion.

## If account confirmation causes confusion
Supabase projects may require email confirmation by default. That is normal. Confirm the signup email before signing in. You can review the Email/Authentication settings in Supabase, but keep confirmation enabled for any real users.

## Common problems
- **“Setup needed”**: one or both values in `supabase-config.js` are still placeholders.
- **Products fail to load / permission error**: confirm you ran `setup.sql` in the same Supabase project whose URL/key you copied.
- **Sign-up succeeds but sign-in fails**: check email confirmation and the Supabase Auth logs.
- **The browser console reports a CDN/network error**: make sure you have internet access.
- **SQL says policy already exists**: the file drops these named policies first; check the exact error and whether you ran the full script.

## Security boundaries
- Do not share your account password or Supabase dashboard access.
- Do not use real customer information while learning.
- Do not accept payments or promise seller payouts from this build.
- This is not yet a production-ready marketplace. Before public launch, add server-side validation, moderation/admin tools, rate limits, product image storage rules, privacy/legal pages, backups, monitoring, and a secure order/payment design. Payment-provider accounts/contracts may require an adult/guardian because you are under 18.
