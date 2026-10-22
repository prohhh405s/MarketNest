(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var db = null;
  var user = null;
  var adminVerified = false;
  var currentView = 'overview';
  var state = { products: [], orders: [], reports: [], reviews: [], users: [] };
  var cfgOk = window.MARKETNEST_SUPABASE_URL && window.MARKETNEST_SUPABASE_ANON_KEY &&
    window.MARKETNEST_SUPABASE_URL.indexOf('PASTE_YOUR') === -1 &&
    window.MARKETNEST_SUPABASE_ANON_KEY.indexOf('PASTE_YOUR') === -1 &&
    window.supabase && window.supabase.createClient;

  if (cfgOk) {
    db = window.supabase.createClient(window.MARKETNEST_SUPABASE_URL, window.MARKETNEST_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } else {
    showLoginMessage('Supabase setup is incomplete. Check supabase-config.js.', true);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(value) {
    return '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  function date(value) {
    if (!value) return '—';
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function shortId(value) { return String(value || '').slice(0, 8); }
  function statusBadge(value) {
    var v = String(value || 'unknown').toLowerCase();
    var cls = (['active', 'resolved', 'delivered', 'completed', 'placed'].indexOf(v) >= 0) ? 'green' :
      (['open', 'reviewing', 'processing', 'placed'].indexOf(v) >= 0) ? 'orange' :
      (['suspended', 'dismissed', 'cancelled', 'hidden'].indexOf(v) >= 0) ? 'red' : 'blue';
    return '<span class="badge ' + cls + '">' + esc(v.replace(/_/g, ' ')) + '</span>';
  }
  function showLoginMessage(text, error) {
    var el = $('loginMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!error);
  }
  function notify(text, error) {
    var el = $('globalMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!error);
    el.hidden = !text;
    if (text) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.idleText = button.textContent;
      button.disabled = true;
      button.textContent = label || 'Working…';
    } else {
      button.disabled = false;
      if (button.dataset.idleText) button.textContent = button.dataset.idleText;
    }
  }
  function setGate(message, error) {
    $('authGate').hidden = false;
    $('adminApp').hidden = true;
    if (message) showLoginMessage(message, error);
  }
  function showApp() {
    $('authGate').hidden = true;
    $('adminApp').hidden = false;
    $('adminAvatar').textContent = (user && (user.email || 'A').charAt(0) || 'A').toUpperCase();
  }

  async function verifyAdmin() {
    if (!db || !user) return false;
    try {
      var result = await db.rpc('marketnest_is_admin');
      adminVerified = !result.error && result.data === true;
      return adminVerified;
    } catch (_) {
      adminVerified = false;
      return false;
    }
  }

  async function handleSession(session) {
    user = session && session.user ? session.user : null;
    adminVerified = false;
    if (!user) {
      setGate('Sign in with your existing authorized admin account.');
      return;
    }
    var allowed = await verifyAdmin();
    if (!allowed) {
      setGate('This account does not have admin access. The project owner must authorize its user ID in marketnest_admins. No admin data was loaded.', true);
      return;
    }
    showApp();
    await loadAll();
  }

  async function ensureAdmin() {
    if (!db || !user) throw new Error('Please sign in again.');
    if (!await verifyAdmin()) {
      adminVerified = false;
      setGate('Admin authorization could not be verified. Access to admin actions has been blocked.', true);
      throw new Error('Admin authorization could not be verified.');
    }
  }

  function setView(name) {
    var allowed = ['overview', 'products', 'orders', 'reports', 'reviews', 'users'];
    if (allowed.indexOf(name) < 0) return;
    currentView = name;
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });
    document.querySelectorAll('.nav-item[data-view]').forEach(function (button) {
      var active = button.dataset.view === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    var titles = {
      overview: ['Overview', 'A clear view of what’s happening across your marketplace.'],
      products: ['Products', 'Moderate listings while retaining the underlying product records.'],
      orders: ['Orders', 'Monitor demo order history without triggering payments or shipping.'],
      reports: ['Reports', 'Review user-submitted content reports and record outcomes.'],
      reviews: ['Reviews', 'Review public feedback and remove content that violates your rules.'],
      users: ['Users', 'Manage marketplace access for registered customer and seller profiles.']
    };
    $('crumbTitle').textContent = titles[name][0];
    $('pageTitle').textContent = titles[name][0];
    $('pageSubtitle').textContent = titles[name][1];
    $('sidebar').classList.remove('open');
    if (name === 'products') renderProducts();
    if (name === 'orders') renderOrders();
    if (name === 'reports') renderReports();
    if (name === 'reviews') renderReviews();
    if (name === 'users') renderUsers();
  }

  function table(headers, rows, emptyText) {
    if (!rows.length) return '<div class="empty-row">' + esc(emptyText || 'Nothing to show yet.') + '</div>';
    return '<table><thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }
  function loadingOrError(result, label) {
    return result && result.error ? '<div class="empty-row">' + esc(label) + ' could not be loaded. Check migration versions and Supabase RLS policies.</div>' : null;
  }

  async function loadAll() {
    await ensureAdmin();
    $('lastUpdated').textContent = 'Refreshing data…';
    notify('');
    var queries = await Promise.all([
      db.from('products').select('id,name,seller_name,seller_id,price,category,stock,is_active,created_at').order('created_at', { ascending: false }).limit(300),
      db.from('orders').select('id,total_amount,status,created_at,buyer_id').order('created_at', { ascending: false }).limit(300),
      db.from('marketnest_reports').select('id,product_id,reporter_id,reason,status,created_at').order('created_at', { ascending: false }).limit(300),
      db.from('reviews').select('id,product_id,rating,body,created_at').order('created_at', { ascending: false }).limit(300),
      db.from('marketnest_profiles').select('user_id,email,display_name,account_type,suspended,created_at').order('created_at', { ascending: false }).limit(300),
      db.from('products').select('id', { count: 'exact', head: true }),
      db.from('marketnest_profiles').select('user_id', { count: 'exact', head: true }),
      db.from('orders').select('id', { count: 'exact', head: true }),
      db.from('marketnest_reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'reviewing'])
    ]);
    await ensureAdmin();
    state.products = queries[0].error ? [] : (queries[0].data || []);
    state.orders = queries[1].error ? [] : (queries[1].data || []);
    state.reports = queries[2].error ? [] : (queries[2].data || []);
    state.reviews = queries[3].error ? [] : (queries[3].data || []);
    state.users = queries[4].error ? [] : (queries[4].data || []);
    try {
      var managed = await db.functions.invoke('admin-user-management', { body: { action: 'list' } });
      if (!managed.error && managed.data && Array.isArray(managed.data.users)) state.users = managed.data.users;
      else if (managed.error) notify('User directory could not be fully refreshed. Deploy the admin-user-management Edge Function and configure its secrets.', true);
    } catch (_) { /* Keep the RLS-protected profile list visible if the function is not deployed yet. */ }

    $('statProducts').textContent = queries[5].error ? '—' : Number(queries[5].count || 0).toLocaleString('en-IN');
    $('statUsers').textContent = queries[6].error ? '—' : Number(queries[6].count || 0).toLocaleString('en-IN');
    $('statOrders').textContent = queries[7].error ? '—' : Number(queries[7].count || 0).toLocaleString('en-IN');
    $('statReports').textContent = queries[8].error ? '—' : Number(queries[8].count || 0).toLocaleString('en-IN');
    $('navProductCount').textContent = queries[5].error ? '—' : Number(queries[5].count || 0).toLocaleString('en-IN');
    $('navOrderCount').textContent = queries[7].error ? '—' : Number(queries[7].count || 0).toLocaleString('en-IN');
    $('navReportCount').textContent = queries[8].error ? '—' : Number(queries[8].count || 0).toLocaleString('en-IN');

    var queryLabels = ['Products', 'Orders', 'Reports', 'Reviews', 'User profiles', 'Product count', 'User count', 'Order count', 'Open report count'];
    var failures = queries.map(function (result, index) {
      if (!result.error) return null;
      return queryLabels[index] + ': ' + (result.error.message || 'Unknown Supabase error') +
        (result.error.code ? ' [code ' + result.error.code + ']' : '');
    }).filter(Boolean);
    if (failures.length) {
      notify('Some data could not be loaded. Details: ' + failures.join(' | '), true);
    }

    renderOverview();
    renderProducts();
    renderOrders();
    renderReports();
    renderReviews();
    renderUsers();
    $('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function renderOverview() {
    var recent = state.orders.slice(0, 6).map(function (o) {
      return '<tr><td><span class="primary-cell">#' + esc(shortId(o.id)) + '</span><span class="secondary-cell">' + esc(date(o.created_at)) + '</span></td>' +
        '<td>' + money(o.total_amount) + '<span class="secondary-cell">Demo value only</span></td><td>' + statusBadge(o.status) + '</td></tr>';
    });
    $('overviewOrders').innerHTML = table(['Order', 'Order value', 'Status'], recent, 'No order records yet.');
    var recentReports = state.reports.filter(function (r) { return r.status === 'open' || r.status === 'reviewing'; }).slice(0, 5);
    $('overviewReports').innerHTML = recentReports.length ? recentReports.map(function (r) {
      return '<article class="mini-report"><div class="mini-meta"><strong>Report #' + esc(shortId(r.id)) + '</strong>' + statusBadge(r.status) + '</div><p>' + esc(r.reason) + '</p><div class="mini-meta"><span class="secondary-cell">' + esc(date(r.created_at)) + '</span><button class="text-btn" data-go="reports">Review →</button></div></article>';
    }).join('') : '<div class="empty-row">No open reports. All quiet for now.</div>';
  }

  function renderProducts() {
    var search = ($('productSearch') && $('productSearch').value || '').trim().toLowerCase();
    var items = state.products.filter(function (p) {
      return [p.name, p.seller_name, p.category, p.id].join(' ').toLowerCase().includes(search);
    });
    var rows = items.map(function (p) {
      var active = p.is_active !== false;
      return '<tr><td><span class="primary-cell">' + esc(p.name) + '</span><span class="secondary-cell">' + esc(p.category || 'Uncategorised') + '</span></td>' +
        '<td>' + esc(p.seller_name || shortId(p.seller_id)) + '</td><td>' + money(p.price) + '</td><td>' + esc(p.stock == null ? '—' : p.stock) + '</td>' +
        '<td>' + statusBadge(active ? 'active' : 'hidden') + '</td><td><button class="action-btn ' + (active ? 'danger' : '') + '" data-product-toggle="' + esc(p.id) + '" data-active="' + active + '">' + (active ? 'Hide listing' : 'Restore') + '</button></td></tr>';
    });
    $('productsTable').innerHTML = table(['Product', 'Seller', 'Price', 'Stock', 'Visibility', 'Action'], rows, 'No matching products.');
  }

  function renderOrders() {
    var search = ($('orderSearch') && $('orderSearch').value || '').trim().toLowerCase();
    var items = state.orders.filter(function (o) { return [o.id, o.buyer_id, o.status].join(' ').toLowerCase().includes(search); });
    var rows = items.map(function (o) {
      return '<tr><td><span class="primary-cell">#' + esc(shortId(o.id)) + '</span><span class="secondary-cell">' + esc(o.id) + '</span></td>' +
        '<td>' + esc(shortId(o.buyer_id)) + '<span class="secondary-cell">Buyer ID</span></td><td>' + money(o.total_amount) + '<span class="secondary-cell">Demo order value</span></td>' +
        '<td>' + statusBadge(o.status) + '</td><td>' + esc(date(o.created_at)) + '</td></tr>';
    });
    $('ordersTable').innerHTML = table(['Order ID', 'Buyer', 'Value', 'Status', 'Created'], rows, 'No matching orders.');
  }

  function renderReports() {
    var filter = $('reportFilter') ? $('reportFilter').value : 'all';
    var items = state.reports.filter(function (r) { return filter === 'all' || r.status === filter; });
    var rows = items.map(function (r) {
      var opts = ['open', 'reviewing', 'resolved', 'dismissed'].map(function (s) {
        return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + s + '</option>';
      }).join('');
      return '<tr><td><span class="primary-cell">#' + esc(shortId(r.id)) + '</span><span class="secondary-cell">' + esc(date(r.created_at)) + '</span></td>' +
        '<td><span class="primary-cell">' + esc(r.reason) + '</span><span class="secondary-cell">Product: ' + esc(shortId(r.product_id) || 'not specified') + '</span></td>' +
        '<td>' + statusBadge(r.status) + '</td><td><div class="row-actions"><select class="table-select" aria-label="Report status" data-report-select="' + esc(r.id) + '">' + opts + '</select><button class="action-btn" data-report-save="' + esc(r.id) + '">Save</button></div></td></tr>';
    });
    $('reportsTable').innerHTML = table(['Report', 'Reason', 'Status', 'Update status'], rows, 'No reports match this filter.');
  }

  function renderReviews() {
    var rows = state.reviews.map(function (r) {
      var stars = '★'.repeat(Math.max(0, Math.min(5, Number(r.rating) || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Number(r.rating) || 0)));
      return '<tr><td><span class="primary-cell">' + esc(stars) + '</span><span class="secondary-cell">Product #' + esc(shortId(r.product_id)) + '</span></td>' +
        '<td><span class="primary-cell">' + esc(r.body || 'Rating only') + '</span></td><td>' + 'Verified buyer</td><td>' + esc(date(r.created_at)) + '</td>' +
        '<td><button class="action-btn danger" data-review-delete="' + esc(r.id) + '">Remove</button></td></tr>';
    });
    $('reviewsTable').innerHTML = table(['Rating / product', 'Review', 'Buyer', 'Date', 'Action'], rows, 'No reviews have been submitted.');
  }

  function renderUsers() {
    var search = ($('userSearch') && $('userSearch').value || '').trim().toLowerCase();
    var items = state.users.filter(function (u) {
      return [u.display_name, u.email, u.account_type, u.user_id].join(' ').toLowerCase().includes(search);
    });
    var rows = items.map(function (u) {
      var id = u.user_id || u.id;
      var self = user && id === user.id;
      var isAdmin = !!u.is_admin;
      var type = isAdmin ? 'admin' : (u.account_type || 'customer');
      return '<tr><td><span class="primary-cell">' + esc(u.display_name || u.email || 'MarketNest user') + '</span><span class="secondary-cell">' + esc(u.email || 'No email') + '</span></td>' +
        '<td>' + esc(type) + '</td><td>' + statusBadge(u.suspended ? 'suspended' : 'active') + '</td><td>' + esc(date(u.created_at)) + '</td><td class="user-actions">' +
        (self ? '<span class="badge blue">Current admin</span>' : '<button class="action-btn" data-user-password="' + esc(id) + '" data-user-email="' + esc(u.email || '') + '">Set password</button> ' +
        '<button class="action-btn" data-user-admin="' + esc(id) + '" data-admin="' + isAdmin + '">' + (isAdmin ? 'Remove admin' : 'Make admin') + '</button> ' +
        '<button class="action-btn danger" data-user-delete="' + esc(id) + '" data-user-email="' + esc(u.email || '') + '">Delete</button>') + '</td></tr>';
    });
    $('usersTable').innerHTML = table(['Account', 'Type', 'Access', 'Created', 'Actions'], rows, 'No matching accounts.');
  }

  async function managedUserAction(payload, successText) {
    await ensureAdmin();
    var result = await db.functions.invoke('admin-user-management', { body: payload });
    if (result.error || !result.data || result.data.error) throw new Error((result.data && result.data.error) || (result.error && result.error.message) || 'User management request failed. Deploy the Edge Function and configure its secrets.');
    notify(successText);
    await loadAll();
  }

  $('createManagedUserForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    var data = new FormData(form);
    var button = $('createManagedUserBtn');
    var accountType = String(data.get('accountType') || 'customer');
    setBusy(button, true, 'Creating…');
    try {
      await managedUserAction({
        action: 'create',
        email: String(data.get('email') || '').trim(),
        password: String(data.get('password') || ''),
        display_name: String(data.get('displayName') || '').trim(),
        account_type: accountType
      }, (accountType === 'admin' ? 'Admin' : accountType === 'seller' ? 'Seller' : 'Buyer') + ' account created without email verification.');
      form.reset();
    } catch (err) { notify(err.message || 'Account creation failed.', true); }
    finally { setBusy(button, false); }
  });

  async function setManagedPassword(button) {
    var email = button.dataset.userEmail || 'this user';
    var password = window.prompt('Set a new password for ' + email + '. Use at least 8 characters.');
    if (password === null) return;
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    await managedUserAction({ action: 'set_password', user_id: button.dataset.userPassword, password: password }, 'Password updated.');
  }

  async function toggleManagedAdmin(button) {
    var makeAdmin = button.dataset.admin !== 'true';
    if (!window.confirm((makeAdmin ? 'Grant admin access to ' : 'Remove admin access from ') + (button.dataset.userAdmin || 'this account') + '?')) return;
    await managedUserAction({ action: 'set_admin', user_id: button.dataset.userAdmin, is_admin: makeAdmin }, makeAdmin ? 'Admin access granted.' : 'Admin access removed.');
  }

  async function deleteManagedUser(button) {
    var email = button.dataset.userEmail || 'this account';
    if (!window.confirm('Permanently delete ' + email + '? This removes the Supabase login and may remove related records. This cannot be undone.')) return;
    await managedUserAction({ action: 'delete', user_id: button.dataset.userDelete }, 'Account permanently deleted.');
  }

  async function moderateProduct(button) {
    await ensureAdmin();
    var id = button.dataset.productToggle;
    var current = button.dataset.active === 'true';
    var next = !current;
    if (!window.confirm((next ? 'Restore' : 'Hide') + ' this listing? The product record will be retained.')) return;
    setBusy(button, true, 'Saving…');
    var result = await db.from('products').update({ is_active: next, updated_at: new Date().toISOString() }).eq('id', id).select('id,is_active');
    setBusy(button, false);
    if (result.error || !result.data || !result.data.length) throw new Error('Listing update failed. Verify the migration and admin RLS policy.');
    notify(next ? 'Listing restored.' : 'Listing hidden from the public marketplace.');
    await loadAll();
  }

  async function moderateUser(button) {
    await ensureAdmin();
    var id = button.dataset.userToggle;
    if (id === user.id) throw new Error('You cannot suspend your own admin account.');
    var suspended = button.dataset.suspended !== 'true';
    if (!window.confirm(suspended ? 'Suspend this account from marketplace actions? This does not delete the login.' : 'Restore this account’s marketplace access?')) return;
    setBusy(button, true, 'Saving…');
    var result = await db.from('marketnest_profiles').update({ suspended: suspended }).eq('user_id', id).select('user_id,suspended');
    setBusy(button, false);
    if (result.error || !result.data || !result.data.length) throw new Error('Account update failed. Verify admin profile policies.');
    notify(suspended ? 'Account suspended from marketplace activity.' : 'Account restored.');
    await loadAll();
  }

  async function moderateReport(button) {
    await ensureAdmin();
    var id = button.dataset.reportSave;
    var select = document.querySelector('[data-report-select="' + CSS.escape(id) + '"]');
    var status = select && select.value;
    if (['open', 'reviewing', 'resolved', 'dismissed'].indexOf(status) < 0) throw new Error('Invalid report status.');
    setBusy(button, true, 'Saving…');
    var result = await db.from('marketnest_reports').update({ status: status }).eq('id', id).select('id,status');
    setBusy(button, false);
    if (result.error || !result.data || !result.data.length) throw new Error('Report update failed. Verify the admin report policy.');
    notify('Report status updated.');
    await loadAll();
  }

  async function removeReview(button) {
    await ensureAdmin();
    if (!window.confirm('Permanently remove this review? This action cannot be undone.')) return;
    setBusy(button, true, 'Removing…');
    var result = await db.from('reviews').delete().eq('id', button.dataset.reviewDelete).select('id');
    setBusy(button, false);
    if (result.error || !result.data || !result.data.length) throw new Error('Review removal failed. Verify the admin review policy.');
    notify('Review removed.');
    await loadAll();
  }

  document.querySelectorAll('.nav-item[data-view]').forEach(function (button) {
    button.addEventListener('click', function () { setView(button.dataset.view); });
  });
  document.querySelectorAll('[data-go]').forEach(function (button) {
    button.addEventListener('click', function () { setView(button.dataset.go); });
  });
  $('productsTable').addEventListener('click', function (e) {
    var button = e.target.closest('[data-product-toggle]');
    if (button) moderateProduct(button).catch(function (err) { notify(err.message, true); });
  });
  $('usersTable').addEventListener('click', function (e) {
    var button = e.target.closest('[data-user-toggle]');
    if (button) return moderateUser(button).catch(function (err) { notify(err.message, true); });
    button = e.target.closest('[data-user-password]');
    if (button) return setManagedPassword(button).catch(function (err) { notify(err.message, true); });
    button = e.target.closest('[data-user-admin]');
    if (button) return toggleManagedAdmin(button).catch(function (err) { notify(err.message, true); });
    button = e.target.closest('[data-user-delete]');
    if (button) return deleteManagedUser(button).catch(function (err) { notify(err.message, true); });
  });
  $('reportsTable').addEventListener('click', function (e) {
    var button = e.target.closest('[data-report-save]');
    if (button) moderateReport(button).catch(function (err) { notify(err.message, true); });
  });
  $('reviewsTable').addEventListener('click', function (e) {
    var button = e.target.closest('[data-review-delete]');
    if (button) removeReview(button).catch(function (err) { notify(err.message, true); });
  });
  ['productSearch', 'orderSearch', 'userSearch'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (id === 'productSearch') renderProducts();
      if (id === 'orderSearch') renderOrders();
      if (id === 'userSearch') renderUsers();
    });
  });
  $('reportFilter').addEventListener('change', renderReports);
  $('refreshBtn').addEventListener('click', function () {
    loadAll().catch(function (err) { notify(err.message || 'Refresh failed.', true); });
  });
  $('menuBtn').addEventListener('click', function () { $('sidebar').classList.toggle('open'); });
  $('signOutBtn').addEventListener('click', async function () {
    if (!db) return;
    await db.auth.signOut();
    user = null;
    adminVerified = false;
    setGate('You have signed out.');
  });
  $('adminLogin').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!db) return showLoginMessage('Supabase configuration is missing.', true);
    var button = $('loginBtn');
    setBusy(button, true, 'Verifying…');
    showLoginMessage('');
    var form = new FormData(e.currentTarget);
    var result = await db.auth.signInWithPassword({ email: String(form.get('email') || '').trim(), password: String(form.get('password') || '') });
    setBusy(button, false);
    if (result.error) {
      showLoginMessage('Sign-in failed. Check your email and password.', true);
      return;
    }
    user = result.data.user;
    if (!await verifyAdmin()) {
      showLoginMessage('This account is not authorized for admin access. Ask the project owner to grant admin membership.', true);
      return;
    }
    showApp();
    try { await loadAll(); } catch (err) { notify(err.message || 'Admin data could not be loaded.', true); }
  });

  if (db) {
    db.auth.getSession().then(function (result) {
      if (result.error) return setGate('Could not read the current session. Please sign in again.', true);
      handleSession(result.data.session).catch(function (err) { setGate(err.message || 'Admin verification failed.', true); });
    });
    db.auth.onAuthStateChange(function (_event, session) {
      window.setTimeout(function () {
        handleSession(session).catch(function (err) { setGate(err.message || 'Admin verification failed.', true); });
      }, 0);
    });
  }

  // A hidden URL is not an authorization mechanism. The database RPC and RLS policies are.
})();
