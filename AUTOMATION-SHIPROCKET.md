# MarketNest + Shiprocket: safe integration guide

## What this package does and does not do

This adds a **dry-run-first Shiprocket backend** and a database migration. By default, `shiprocket-dispatch` never calls Shiprocket. When live mode is explicitly enabled, it can create a Shiprocket order through `POST /orders/create/adhoc`; it does **not** yet assign a courier, generate a label, or schedule pickup. `shiprocket-webhook` records tracking events after a shipment's AWB has been saved.

This does not yet wire a checkout/address form or a seller-dashboard shipping button into the current static UI, and it does not implement a payment gateway. The existing site's demo order flow remains demo-only until a separate secure checkout integration is finished. Do not accept real customer payments or orders based on this shipping starter alone.

Shiprocket's public API docs warn that valid credentials can affect the real Shiprocket account. Do not assume the documentation website is an API sandbox. `SHIPROCKET_DRY_RUN=true` is the safe test mode here: it sends no provider request.

## Prerequisites

- Supabase project and Vercel site already deployed.
- Run `setup.sql`, then migrations v2, v3, v4 and v5 in the order specified in `SETUP.md`.
- A parent/guardian or adult business owner should handle provider account, KYC, billing and live shipment approval. Do not paste credentials into chat or commit them to GitHub.
- One existing Shiprocket pickup location for the MVP. This starter supports one seller per order and one configured pickup location. A multi-seller marketplace needs separate order/shipment records per seller and a pickup-location mapping before live use.

## Step 1 — apply migration v6

1. Back up the database first.
2. Supabase Dashboard → SQL Editor → New query.
3. Paste all of `migration-v6-shiprocket.sql` and run it after v2-v5.
4. Confirm the final query returns `payment_method`, `payment_status`, `shipping_address`, `shipping_status` and `shiprocket_awb`.
5. This migration does not create shipments or charge anyone. Existing orders default to `payment_method='demo'`.

## Step 2 — install Supabase CLI and link project

Install the Supabase CLI using the official installation guide, then from this extracted project folder run:

```sh
supabase login
supabase link --project-ref cmzlrdisctubakuatvlb
```

Check `supabase --help` if your installed CLI version differs.

## Step 3 — set secrets (do not put them in frontend files)

Start with dry run. The only required settings for a dry run are the Supabase project environment values managed by Supabase and a pickup-location name:

```sh
supabase secrets set SHIPROCKET_DRY_RUN=true SHIPROCKET_PICKUP_LOCATION="YOUR_EXISTING_PICKUP_LOCATION_NAME"
```

Replace the example pickup name with the exact pickup-location name configured in Shiprocket. Do not invent a location. Dry-run mode does not need Shiprocket credentials.

Deploy functions:

```sh
supabase functions deploy shiprocket-dispatch
supabase functions deploy shiprocket-webhook --no-verify-jwt
```

`shiprocket-webhook` has `verify_jwt=false` in `supabase/config.toml` because Shiprocket sends an `x-api-key`, not a Supabase user JWT. It independently checks `SHIPROCKET_WEBHOOK_TOKEN`. Keep that token long and random.

Set a webhook token in Supabase:

```sh
supabase secrets set SHIPROCKET_WEBHOOK_TOKEN="PASTE_A_LONG_RANDOM_TOKEN_HERE"
```

In Shiprocket, open **Settings → API → Webhooks**, add the deployed `shiprocket-webhook` URL, enable it, and enter the same token as the webhook security token. Shiprocket sends it in `x-api-key`. Use the exact URL shown by Supabase after deployment; do not guess it.

## Step 4 — test dry run only

The dispatch function requires an authenticated MarketNest user who is an order seller or admin, all order items to belong to one seller, every item status to be `processing`, a valid address, and payment status to be appropriate:

- Online: `payment_method='online'` and `payment_status='paid'` (payment must be verified by a separate payment webhook before this is safe).
- COD: `payment_method='cod'` and `payment_status='cod_pending'`.

The current demo checkout does not yet collect the address or set these fields. Do not edit a real customer order to fake payment. For development, create a separate test order and test account, then set only that test order's fields using the SQL editor after confirming its UUID. Never set a real order to paid manually to bypass gateway verification.

Invoke `shiprocket-dispatch` from a logged-in test session with body:

```json
{"order_id":"YOUR-TEST-ORDER-UUID"}
```

With dry run enabled, expected response includes `"simulated": true` and `payload_preview`. No Shiprocket order, label, AWB or pickup is created. Check `marketnest_shipping_events` for the event.

## Step 5 — create a Shiprocket API user (not required for dry run)

In the Shiprocket panel, go to **Settings → API → Add New API User** (menu wording may vary), create a dedicated API user and grant only required modules. Use its credentials in Supabase secrets, not in JavaScript or GitHub:

```sh
supabase secrets set SHIPROCKET_EMAIL="API_USER_EMAIL" SHIPROCKET_PASSWORD="API_USER_PASSWORD"
```

The API docs say tokens last 10 days; this starter obtains a token per dispatch rather than storing it. Treat the credentials as live-account credentials.

## Step 6 — before enabling live mode

**Do not do this until an adult account owner approves live test shipments and billing.** Shiprocket API requests with valid credentials may affect the live account.

1. Confirm the exact pickup location, parcel weight/dimensions, Indian pincode and address formatting.
2. Verify prices are in whole INR rupees; MarketNest's current product schema stores whole rupees. This starter maps them to Shiprocket `selling_price` and `sub_total`.
3. Verify COD eligibility and whether COD collection is enabled for the account and destination.
4. Confirm payment gateway webhook marks online orders paid only after signature and amount verification.
5. Confirm the order is a single-seller order. This starter intentionally rejects mixed-seller orders.
6. Only then set `SHIPROCKET_DRY_RUN=false`. The next dispatch can create a real provider order. It still does not assign a courier or schedule pickup.
7. Reconcile provider order IDs against MarketNest before retrying any failed request. Never blindly retry a request that might have created a shipment.

## Step 7 — tracking webhook

The webhook matches `awb`/`awb_code` to `orders.shiprocket_awb`, stores raw payloads in `marketnest_shipping_events`, and updates a limited set of recognized statuses. It cannot match until a later integration step saves the AWB onto the order. A delivery status is **not** proof COD funds were remitted; verify settlement separately before marking COD collected.

## Important limitations before launch

- Current storefront checkout is demo-only; no real payment integration is included here.
- Address capture and secure order creation for online/COD still need to be implemented and wired into the UI.
- Shipment assignment, label generation, pickup scheduling, cancellation, NDR/RTO handling and return labels are not included yet.
- No live provider call or real shipment was tested by generating this package.
- Multi-seller orders are rejected. Proper marketplace shipping needs one shipment per seller/pickup location, and order splitting/fee handling.
- Ask a qualified adult business owner to review applicable consumer, tax, privacy, refund and COD obligations before accepting real orders.

## Step 8 — separate AWB + pickup function

The package also includes `shiprocket-book-pickup`. It is restricted to a MarketNest admin and, in dry-run mode, only logs what it would do. Deploy it:

```sh
supabase functions deploy shiprocket-book-pickup
```

Keep `SHIPROCKET_DRY_RUN=true` and invoke it with a test order only after `shiprocket-dispatch` returned a simulated preview (dry run) or a Shiprocket shipment ID (live provider order). Dry run makes no provider request. This function's live path assigns a courier/AWB and requests pickup, so setting dry run false can trigger real shipping activity. Do not enable live mode without an adult account owner's approval.

After the AWB is saved, the configured webhook can match tracking events and update the order. Before real automation, add a seller UI action with an explicit packed/ready confirmation and an admin approval/exception path. Do not invoke live booking automatically from a page load or a repeatable button without idempotency controls.
