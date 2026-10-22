#!/usr/bin/env node
'use strict';

/**
 * Offline smoke checks for the published static MarketNest project.
 * These checks validate repository wiring and security guardrails only.
 * They do not replace browser QA or a test against a disposable Supabase project.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const features = read('features.js');
const helpers = read('helpers.js');
const config = read('supabase-config.js');
const marketplaceSql = read('migration-v4-marketplace.sql');
const storageSql = read('migration-v2-images-recovery.sql');
const premiumCss = read('premium.css');

const checks = [];
function test(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error });
  }
}

test('HTML loads the core application modules in dependency order', () => {
  const order = ['supabase-config.js', 'helpers.js', 'app.js', 'features.js'];
  let last = -1;
  for (const file of order) {
    const at = html.indexOf('src="' + file + '"');
    assert.notEqual(at, -1, file + ' is missing from index.html');
    assert.ok(at > last, file + ' appears before its dependency');
    last = at;
  }
});

test('Premium stylesheet is loaded after existing styles', () => {
  const premiumAt = html.indexOf('href="premium.css"');
  assert.notEqual(premiumAt, -1, 'premium.css is not linked');
  assert.ok(premiumAt > html.indexOf('href="features.css"'));
  assert.ok(premiumCss.includes(':root'));
  assert.ok(premiumCss.includes('@media (prefers-reduced-motion:reduce)'));
});

test('Core storefront, account and dialog hooks are present', () => {
  for (const id of ['searchForm', 'productGrid', 'category', 'sort', 'minPrice', 'maxPrice',
    'productDialog', 'cartDrawer', 'loginForm', 'signupForm', 'productForm', 'customerArea']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing HTML hook: ' + id);
  }
  for (const fn of ['loadProducts', 'filteredProducts', 'renderProducts', 'openDetails', 'toggleSaved']) {
    assert.ok(app.includes('function ' + fn) || app.includes('async function ' + fn), 'Missing app function: ' + fn);
  }
});

test('Marketplace feature modules retain the admin and buyer/seller workflows', () => {
  for (const fn of ['loadBuyerOrders', 'loadSellerOrders', 'loadReviews', 'loadInbox', 'loadNotifications', 'loadReports', 'loadAdmin']) {
    assert.ok(features.includes('function ' + fn) || features.includes('async function ' + fn), 'Missing feature function: ' + fn);
  }
  assert.ok(features.includes('marketnest_place_order'));
  assert.ok(features.includes('marketnest_is_admin'));
});

test('Browser config does not contain known server-secret key markers', () => {
  assert.ok(config.includes('MARKETNEST_SUPABASE_URL'));
  assert.ok(config.includes('MARKETNEST_SUPABASE_ANON_KEY'));
  assert.doesNotMatch(config, /sb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(config, /service_role\s*[:=]\s*["'][^"']{12,}["']/i);
});

test('Storage migration scopes uploads to the authenticated owner folder', () => {
  assert.ok(storageSql.includes('storage.foldername(name)'));
  assert.ok(storageSql.includes('auth.uid()::text'));
  assert.ok(storageSql.includes('image/jpeg'));
  assert.ok(storageSql.includes('2097152'));
});

test('Marketplace SQL contains RLS and server-side order validation', () => {
  assert.ok(marketplaceSql.includes('alter table public.orders enable row level security'));
  assert.ok(marketplaceSql.includes('alter table public.order_items enable row level security'));
  assert.ok(marketplaceSql.includes('create or replace function public.marketnest_place_order'));
  assert.ok(marketplaceSql.includes('for update'));
  assert.ok(marketplaceSql.includes('marketnest_is_suspended'));
  assert.ok(marketplaceSql.includes('revoke all on function public.marketnest_place_order'));
});

test('Input helper functions keep image and auth parsing checks available', () => {
  for (const fn of ['validateEmail', 'validatePassword', 'validateImageBasics', 'detectImageType', 'isSafeImagePath', 'parseAuthHash']) {
    assert.ok(helpers.includes('function ' + fn), 'Missing helper: ' + fn);
  }
});


test('Private admin console is not linked from public storefront navigation', () => {
  const adminHtml = read('admin.html');
  assert.ok(!html.includes('href="admin.html"'), 'Public storefront should not link to the admin route');
  assert.ok(adminHtml.includes('name="robots" content="noindex,nofollow,noarchive"'));
  assert.ok(adminHtml.includes('id="adminLogin"'));
});

test('Admin console verifies server-side admin membership before loading data', () => {
  const adminJs = read('admin.js');
  const adminCss = read('admin.css');
  assert.ok(adminJs.includes("db.rpc('marketnest_is_admin')"));
  assert.ok(adminJs.includes('async function ensureAdmin()'));
  assert.ok(adminJs.includes('await ensureAdmin()'));
  assert.ok(adminJs.includes("signInWithPassword"));
  assert.ok(!adminJs.includes('signUp('), 'Admin console must not offer public signup');
  assert.ok(adminJs.includes('data-product-toggle'));
  assert.ok(adminJs.includes('data-report-save'));
  assert.ok(adminJs.includes('data-review-delete'));
  assert.ok(adminJs.includes('data-user-toggle'));
  assert.ok(adminCss.includes('.sidebar'));
  assert.ok(adminCss.includes('@media(max-width:760px)'));
});


test('Legacy admin controls are hidden from the public marketplace tools', () => {
  const premiumCss = read('premium.css');
  const featuresJs = read('features.js');
  assert.ok(premiumCss.includes('#features .mn-feature-tabs [data-tab="admin"]'));
  assert.ok(premiumCss.includes('#features .mn-feature-card[data-panel="admin"]'));
  assert.ok(featuresJs.includes('data-tab="admin"'));
});

test('Admin dashboard reports the exact Supabase query that failed', () => {
  const adminJs = read('admin.js');
  assert.ok(adminJs.includes('queryLabels'));
  assert.ok(adminJs.includes('result.error.message'));
  assert.ok(adminJs.includes('result.error.code'));
});

let failures = 0;
for (const check of checks) {
  if (check.ok) {
    process.stdout.write('PASS ' + check.name + '\n');
  } else {
    failures += 1;
    process.stderr.write('FAIL ' + check.name + '\n  ' + check.error.message + '\n');
  }
}
process.stdout.write('\n' + (checks.length - failures) + '/' + checks.length + ' offline smoke checks passed.\n');
if (failures) process.exitCode = 1;
