
/* MarketNest v4 frontend.
   Supabase RLS and SQL RPCs remain the security boundary. */
(function () {
  'use strict';

  var cfg = window.MARKETNEST_SUPABASE_URL &&
    window.MARKETNEST_SUPABASE_ANON_KEY &&
    !window.MARKETNEST_SUPABASE_ANON_KEY.includes('PASTE_YOUR') &&
    window.supabase;

  if (!cfg) return;

  var db = window.supabase.createClient(
    window.MARKETNEST_SUPABASE_URL,
    window.MARKETNEST_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  var user = null;
  var isAdmin = false;
  var products = [];
  var activeTab = 'orders';
  var CART_KEY = 'marketnest_demo_cart_v1';

  var $ = function (id) {
    return document.getElementById(id);
  };

  var panel = document.createElement('section');
  panel.id = 'features';
  panel.className = 'mn-features';

  panel.innerHTML = `
    <div class="mn-feature-head">
      <div>
        <p class="eyebrow">MARKETNEST TOOLS</p>
        <h2 data-en="Orders, trust & seller tools"
            data-bn="অর্ডার, বিশ্বাস ও বিক্রেতার টুল">
          Orders, trust &amp; seller tools
        </h2>
        <p class="mn-note" id="mnAccount">
          Sign in above to use orders, messaging and reviews.
        </p>
      </div>
      <button id="mnLanguage" class="mn-language"
              type="button" aria-label="Switch language">বাংলা</button>
    </div>

    <div class="mn-feature-tabs" role="tablist"
         aria-label="Marketplace tools">
      <button type="button" data-tab="orders" role="tab"
              aria-selected="true">Orders</button>
      <button type="button" data-tab="inventory" role="tab"
              aria-selected="false">Stock &amp; seller orders</button>
      <button type="button" data-tab="reviews" role="tab"
              aria-selected="false">Reviews</button>
      <button type="button" data-tab="messages" role="tab"
              aria-selected="false">Messages</button>
      <button type="button" data-tab="notifications" role="tab"
              aria-selected="false">Notifications</button>
      <button type="button" data-tab="reports" role="tab"
              aria-selected="false">Report listing</button>
      <button type="button" data-tab="admin" role="tab" hidden
              aria-selected="false">Admin</button>
    </div>

    <p id="mnMessage" class="mn-feature-msg"
       role="status" aria-live="polite"></p>

    <div class="mn-feature-grid">
      <section class="mn-feature-card" data-panel="orders">
        <h3>Demo order checkout</h3>
        <p class="mn-note">
          Creates an order and updates stock, but takes no payment.
          Prices are recalculated by the database.
        </p>
        <button id="mnPlaceOrder" class="mn-primary" type="button">
          Place demo order from cart
        </button>
        <h3 style="margin-top:1.2rem">My order history</h3>
        <div id="mnMyOrders" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="orders">
        <h3>Order status</h3>
        <p class="mn-note">
          Sellers update only their own order-line status.
          Customers can track each item.
        </p>
        <div id="mnOrderStatuses" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="inventory">
        <h3>Inventory management</h3>
        <p class="mn-note">
          Change stock for your listings. Updates are protected
          by seller ownership rules.
        </p>
        <div id="mnInventory" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="inventory">
        <h3>Seller orders</h3>
        <div id="mnSellerOrders" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="inventory">
        <h3>Seller overview</h3>
        <div id="mnSellerStats" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="reviews">
        <h3>Write a verified-buyer review</h3>
        <form id="mnReviewForm">
          <label>Delivered product
            <select id="mnReviewItem" required>
              <option value="">Loading eligible purchases…</option>
            </select>
          </label>
          <label>Rating
            <select id="mnRating">
              <option value="5">5 — Excellent</option>
              <option value="4">4 — Good</option>
              <option value="3">3 — Okay</option>
              <option value="2">2 — Poor</option>
              <option value="1">1 — Very poor</option>
            </select>
          </label>
          <label>Review (optional)
            <textarea id="mnReviewBody" maxlength="1000" rows="3"
              placeholder="Share an honest, helpful review"></textarea>
          </label>
          <button class="mn-primary" type="submit">Submit review</button>
        </form>
        <p class="mn-note">
          The database accepts one review per product, only after
          an item is marked delivered.
        </p>
      </section>

      <section class="mn-feature-card" data-panel="reviews">
        <h3>Product reviews</h3>
        <label>Choose product
          <select id="mnReviewProduct">
            <option value="">Choose a product</option>
          </select>
        </label>
        <div id="mnReviews" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="reviews">
        <h3>Recently viewed</h3>
        <p class="mn-note">Saved only in this browser on this device.</p>
        <div id="mnRecent" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="messages">
        <h3>Customer–seller messages</h3>
        <p class="mn-note">
          Messaging is limited to the listing's seller and customers
          with an order for that item.
        </p>
        <form id="mnMessageForm">
          <label>Product
            <select id="mnMessageProduct" required>
              <option value="">Choose product</option>
            </select>
          </label>
          <label>Send to
            <select id="mnRecipient" required>
              <option value="">Choose recipient</option>
            </select>
          </label>
          <label>Message
            <textarea id="mnMessageBody" maxlength="2000" required
              rows="3" placeholder="Write a message (max 2,000 characters)"></textarea>
          </label>
          <button class="mn-primary" type="submit">Send message</button>
        </form>
        <h3 style="margin-top:1rem">Inbox &amp; sent messages</h3>
        <div id="mnInbox" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="notifications">
        <h3>Your notifications</h3>
        <button id="mnRefreshNotifications" type="button">Refresh</button>
        <div id="mnNotifications" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="reports">
        <h3>Report a listing</h3>
        <form id="mnReportForm">
          <label>Listing
            <select id="mnReportProduct" required>
              <option value="">Choose listing</option>
            </select>
          </label>
          <label>Reason
            <textarea id="mnReportReason" required minlength="5"
              maxlength="1000" rows="3"
              placeholder="Explain the concern"></textarea>
          </label>
          <button class="mn-primary" type="submit">Submit report</button>
        </form>
        <h3 style="margin-top:1rem">My reports</h3>
        <div id="mnMyReports" class="mn-list"></div>
      </section>

      <section class="mn-feature-card" data-panel="admin" hidden>
        <h3>Admin moderation</h3>
        <p class="mn-note">
          Admin access must be granted by the project owner using
          the SQL instructions in SETUP.md. Signing up does not grant
          admin access.
        </p>
        <div id="mnAdminArea" class="mn-list">
          Checking admin permission…
        </div>
      </section>
    </div>
  `;

  var seller = $('seller');
  if (seller) {
    seller.insertAdjacentElement('afterend', panel);
  } else {
    document.body.appendChild(panel);
  }

  function message(text, error) {
    var el = $('mnMessage');
    el.textContent = text || '';
    el.classList.toggle('error', !!error);
  }

  function money(v) {
    return '₹' + Number(v || 0).toLocaleString('en-IN');
  }

  function safe(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }

  function needUser() {
    if (user) return true;
    message('Please sign in using the account panel above first.', true);
    var el = $('seller');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    return false;
  }

  function empty(msg) {
    return '<p class="mn-note">' + safe(msg) + '</p>';
  }

  function updateAdminVisibility() {
    var tab = panel.querySelector('[data-tab="admin"]');
    var adminPanel = panel.querySelector('[data-panel="admin"]');
    if (tab) tab.hidden = !isAdmin;
    if (adminPanel) adminPanel.hidden = !isAdmin;
    if (!isAdmin && activeTab === 'admin') switchTab('orders');
  }

  function switchTab(tab) {
    if (tab === 'admin' && !isAdmin) return;
    activeTab = tab;
    panel.querySelectorAll('[data-panel]').forEach(function (el) {
      el.classList.toggle('mn-hidden', el.dataset.panel !== tab);
    });
    panel.querySelectorAll('[data-tab]').forEach(function (el) {
      el.setAttribute(
        'aria-selected',
        String(el.dataset.tab === tab)
      );
    });
  }

  panel.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      switchTab(b.dataset.tab);
      if (b.dataset.tab === 'admin') loadAdmin();
    });
  });

  switchTab('orders');

  /* Recently viewed products */

  function renderRecent() {
    var ids = [];

    try {
      ids = JSON.parse(
        localStorage.getItem('marketnest_recent_v1') || '[]'
      );
    } catch (e) {
      ids = [];
    }

    if (!Array.isArray(ids)) ids = [];

    var recent = ids.map(function (id) {
      return products.find(function (p) {
        return p.id === id;
      });
    }).filter(Boolean);

    $('mnRecent').innerHTML = recent.map(function (p) {
      return '<article class="mn-item">' +
        '<strong>' + safe(p.name) + '</strong>' +
        '<p>' + money(p.price) + '</p>' +
        '<button type="button" data-open-recent="' +
        safe(p.id) + '">View listing</button>' +
        '</article>';
    }).join('') || empty(
      'Open product details to build your recent list.'
    );
  }

  panel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open-recent]');
    if (!b) return;

    var id = b.dataset.openRecent;
    var search = $('search');
    var cat = $('category');

    if (search) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (cat) {
      cat.value = 'All';
      cat.dispatchEvent(new Event('change', { bubbles: true }));
    }

    var target = document.querySelector(
      '#productGrid [data-view="' + id + '"]'
    );

    if (target) {
      target.click();
    } else {
      message('This listing is no longer available.', true);
    }
  });

  document.addEventListener('mn-product-viewed', function (e) {
    var p = e.detail;
    if (!p || !p.id) return;

    var ids = [];

    try {
      ids = JSON.parse(
        localStorage.getItem('marketnest_recent_v1') || '[]'
      );
    } catch (err) {
      ids = [];
    }

    ids = [p.id].concat(
      Array.isArray(ids)
        ? ids.filter(function (id) { return id !== p.id; })
        : []
    ).slice(0, 8);

    try {
      localStorage.setItem('marketnest_recent_v1', JSON.stringify(ids));
    } catch (err) {}

    renderRecent();
  });

  /* Products */

  async function loadProducts() {
    var r = await db.from('products')
      .select('id,name,price,category,seller_id,seller_name,stock,created_at,image_path')
      .order('created_at', { ascending: false })
      .limit(500);

    if (r.error) {
      message('Could not load marketplace tools: ' + r.error.message, true);
      return;
    }

    products = r.data || [];
    renderRecent();

    [
      'mnReviewProduct',
      'mnMessageProduct',
      'mnReportProduct'
    ].forEach(function (id) {
      var el = $(id);
      var prev = el.value;

      el.innerHTML = '<option value="">Choose a product</option>' +
        products.map(function (p) {
          return '<option value="' + safe(p.id) + '">' +
            safe(p.name) + ' — ' + money(p.price) +
            '</option>';
        }).join('');

      el.value = prev;
    });

    if (user) {
      await loadInventory();
      await loadBuyerOrders();
      await loadSellerOrders();
      await loadEligibleReviews();
      await loadInbox();
      await loadNotifications();
      await loadReports();
      await refreshRecipients();
    }
  }

  /* Buyer orders */

  async function loadBuyerOrders() {
    var r = await db.from('orders')
      .select('id,total_amount,status,created_at')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (r.error) {
      $('mnMyOrders').innerHTML = empty(
        'Could not load orders. Check migration v4 and RLS policies.'
      );
      return;
    }

    if (!r.data.length) {
      $('mnMyOrders').innerHTML = empty(
        'No orders yet. Add items to the demo cart first.'
      );
      $('mnOrderStatuses').innerHTML = empty('No order items yet.');
      return;
    }

    var html = [];
    function statusLabel(value) {
      return ({ placed: 'Order placed', processing: 'Seller preparing', ready_for_pickup: 'Ready for pickup', pickup_scheduled: 'Delivery partner pickup scheduled', picked_up: 'Picked up by delivery partner', shipped: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' })[value] || value;
    }

    for (var o of r.data) {
      var ir = await db.from('order_items')
        .select('id,product_name,unit_price,quantity,status,seller_id')
        .eq('order_id', o.id);

      var items = ir.data || [];

      html.push(
        '<article class="mn-item">' +
        '<strong>Order ' + safe(o.id.slice(0, 8)) + '</strong>' +
        '<p>' + money(o.total_amount) + ' · ' + safe(statusLabel(o.status)) +
        ' · ' + safe(new Date(o.created_at).toLocaleDateString()) +
        '</p>' +
        items.map(function (i) {
          return '<p>' + safe(i.product_name) + ' × ' +
            safe(i.quantity) + ' — ' +
            money(i.unit_price * i.quantity) +
            ' <span class="mn-badge">' + safe(statusLabel(i.status)) +
            '</span></p>';
        }).join('') +
        '</article>'
      );
    }

    $('mnMyOrders').innerHTML = html.join('');
    $('mnOrderStatuses').innerHTML = empty(
      'Track item status in your order history above.'
    );
  }

  /* Inventory */

  async function loadInventory() {
    var r = await db.from('products')
      .select('id,name,price,stock,category,description,image_path')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });

    if (r.error) {
      $('mnInventory').innerHTML = empty(
        'Could not load listings. Check migration v4 and RLS.'
      );
      return;
    }

    var categories = [
      'Electronics', 'Home', 'Fashion', 'Books',
      'Beauty & Personal Care', 'Sports & Outdoors',
      'Toys & Games', 'Grocery', 'Health & Wellness',
      'Automotive', 'Pet Supplies', 'Garden & Outdoors',
      'Stationery & Office', 'Kitchen & Dining'
    ];

    $('mnInventory').innerHTML = (r.data || []).map(function (p) {
      return '<article class="mn-item">' +
        '<strong>' + safe(p.name) + '</strong>' +
        '<p>' + money(p.price) + ' · stock: ' + safe(p.stock) + '</p>' +
        '<form class="mn-stock-form" data-id="' + safe(p.id) + '">' +
        '<label>Product name<input name="name" maxlength="80" required value="' +
        safe(p.name) + '"></label>' +
        '<label>Description<textarea name="description" maxlength="500" rows="2">' +
        safe(p.description || '') + '</textarea></label>' +
        '<label>Category<select name="category">' +
        categories.map(function (c) {
          return '<option ' + (c === p.category ? 'selected' : '') +
            '>' + safe(c) + '</option>';
        }).join('') +
        '</select></label>' +
        '<label>New stock<input type="number" name="stock" min="0" max="100000" required value="' +
        safe(p.stock) + '"></label>' +
        '<label>Price (₹)<input type="number" name="price" min="1" max="1000000" required value="' +
        safe(p.price) + '"></label>' +
        '<label>Replace product photo (optional)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>' +
        '<small class="mn-note">JPEG, PNG or WebP; max 2 MiB.</small>' +
        '<button type="submit">Save listing</button>' +
        '</form></article>';
    }).join('') || empty(
      'No listings yet. Publish a product in the seller dashboard above.'
    );
  }

  $('mnInventory').addEventListener('submit', async function (e) {
    var f = e.target.closest('.mn-stock-form');
    if (!f) return;

    e.preventDefault();
    if (!needUser()) return;

    var stock = Number(f.elements.stock.value);
    var price = Number(f.elements.price.value);
    var name = f.elements.name.value.trim();
    var description = f.elements.description.value.trim();
    var category = f.elements.category.value;

    var categories = [
      'Electronics', 'Home', 'Fashion', 'Books',
      'Beauty & Personal Care', 'Sports & Outdoors',
      'Toys & Games', 'Grocery', 'Health & Wellness',
      'Automotive', 'Pet Supplies', 'Garden & Outdoors',
      'Stationery & Office', 'Kitchen & Dining'
    ];

    if (
      name.length < 2 ||
      name.length > 80 ||
      description.length > 500 ||
      categories.indexOf(category) < 0
    ) {
      message('Check the product name, description and category.', true);
      return;
    }

    if (
      !Number.isInteger(stock) || stock < 0 || stock > 100000 ||
      !Number.isInteger(price) || price < 1 || price > 1000000
    ) {
      message('Check stock and price values.', true);
      return;
    }

    var row = {
      name: name,
      description: description,
      category: category,
      stock: stock,
      price: price,
      updated_at: new Date().toISOString()
    };

    var photo = f.elements.photo && f.elements.photo.files[0];
    var oldProduct = products.find(function (p) {
      return p.id === f.dataset.id;
    });

    var uploadedPath = null;

    if (photo) {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) ||
        photo.size < 1 ||
        photo.size > 2097152
      ) {
        message(
          'Photo must be a non-empty JPEG, PNG or WebP no larger than 2 MiB.',
          true
        );
        return;
      }

      var bytes = new Uint8Array(
        await photo.slice(0, 16).arrayBuffer()
      );

      var valid =
        (photo.type === 'image/jpeg' &&
          bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
        (photo.type === 'image/png' &&
          bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 &&
          bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 &&
          bytes[6] === 26 && bytes[7] === 10) ||
        (photo.type === 'image/webp' &&
          String.fromCharCode.apply(null, bytes.slice(0, 4)) === 'RIFF' &&
          String.fromCharCode.apply(null, bytes.slice(8, 12)) === 'WEBP');

      if (!valid) {
        message('The selected file does not match its image type.', true);
        return;
      }

      var ext = photo.type === 'image/jpeg'
        ? 'jpg'
        : photo.type === 'image/png' ? 'png' : 'webp';

      uploadedPath = user.id + '/' + crypto.randomUUID() + '.' + ext;

      var up = await db.storage.from('product-images').upload(
        uploadedPath,
        photo,
        {
          contentType: photo.type,
          cacheControl: '31536000',
          upsert: false
        }
      );

      if (up.error) {
        message('Photo upload failed: ' + up.error.message, true);
        return;
      }

      row.image_path = uploadedPath;
    }

    var r = await db.from('products')
      .update(row)
      .eq('id', f.dataset.id)
      .eq('seller_id', user.id)
      .select('id');

    if (r.error || !r.data || !r.data.length) {
      if (uploadedPath) {
        await db.storage.from('product-images').remove([uploadedPath]);
      }

      message(
        'Save failed. Check migration v4 and seller ownership.',
        true
      );
      return;
    }

    if (
      uploadedPath &&
      oldProduct &&
      oldProduct.image_path &&
      oldProduct.image_path.startsWith(user.id + '/')
    ) {
      await db.storage.from('product-images').remove([
        oldProduct.image_path
      ]);
    }

    message('Listing and inventory updated.');
    await loadProducts();
  });

  /* Seller orders and overview */

  async function loadSellerOrders() {
    var r = await db.from('order_items')
      .select('id,order_id,product_id,product_name,unit_price,quantity,status,created_at,orders!inner(id,buyer_id,created_at)')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (r.error) {
      $('mnSellerOrders').innerHTML = empty(
        'Could not load seller orders. Check migration v4 and RLS.'
      );
      return;
    }

    var rows = r.data || [];

    $('mnSellerStats').innerHTML =
      '<article class="mn-item"><strong>' + rows.length +
      '</strong><p>Order items</p></article>' +
      '<article class="mn-item"><strong>' +
      money(rows.filter(function (i) {
        return i.status === 'delivered';
      }).reduce(function (sum, i) {
        return sum + i.unit_price * i.quantity;
      }, 0)) +
      '</strong><p>Delivered sales total (not net profit)</p></article>' +
      '<article class="mn-item"><strong>' +
      rows.filter(function (i) {
        return i.status === 'placed' || i.status === 'processing';
      }).length +
      '</strong><p>Orders needing action</p></article>';

    $('mnSellerOrders').innerHTML = rows.map(function (i) {
      var orderDate = i.orders && i.orders.created_at
        ? new Date(i.orders.created_at).toLocaleString()
        : (i.created_at ? new Date(i.created_at).toLocaleString() : 'Date unavailable');
      return '<article class="mn-item mn-seller-order">' +
        '<strong>' + safe(i.product_name) + '</strong>' +
        '<p>' + safe(i.quantity) + ' × ' + money(i.unit_price) +
        ' · ' + safe(i.status) + '</p>' +
        '<small>Order ' + safe(i.order_id.slice(0, 8)) + '</small>' +
        '<button type="button" class="mn-order-details-toggle" data-order-details="' + safe(i.id) + '" aria-expanded="false">View order details</button>' +
        '<div class="mn-order-details" data-order-details-panel="' + safe(i.id) + '" hidden>' +
          '<p><strong>Order ID:</strong> ' + safe(i.order_id) + '</p>' +
          '<p><strong>Order date:</strong> ' + safe(orderDate) + '</p>' +
          '<p><strong>Your product:</strong> ' + safe(i.product_name) + '</p>' +
          '<p><strong>Quantity ordered:</strong> ' + safe(i.quantity) + '</p>' +
          '<p><strong>Unit price:</strong> ' + money(i.unit_price) + '</p>' +
          '<p><strong>Your item total:</strong> ' + money(i.unit_price * i.quantity) + '</p>' +
          '<p><strong>Item status:</strong> ' + safe(i.status) + '</p>' +
        '</div>' +
        '<form class="mn-status-form" data-id="' + safe(i.id) + '">' +
        '<label>Update status<select name="status">' +
        ['placed', 'processing', 'ready_for_pickup', 'pickup_scheduled', 'picked_up', 'shipped', 'out_for_delivery', 'delivered', 'cancelled']
          .map(function (s) {
            return '<option value="' + s + '" ' + (s === i.status ? 'selected' : '') +
              '>' + ({ placed: 'Order placed', processing: 'Preparing order', ready_for_pickup: 'Ready for pickup', pickup_scheduled: 'Pickup scheduled with delivery partner', picked_up: 'Picked up by delivery partner', shipped: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' }[s] || s) + '</option>';
          }).join('') +
        '</select></label>' +
        '<button type="submit">Update status</button>' +
        '</form></article>';
    }).join('') || empty('No orders for your products yet.');
  }

  $('mnSellerOrders').addEventListener('click', function (e) {
    var b = e.target.closest('[data-order-details]');
    if (!b) return;
    var id = b.dataset.orderDetails;
    var panel = $('mnSellerOrders').querySelector('[data-order-details-panel="' + id + '"]');
    if (!panel) return;
    var expanded = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!expanded));
    b.textContent = expanded ? 'View order details' : 'Hide order details';
    panel.hidden = expanded;
  });


  $('mnSellerOrders').addEventListener('submit', async function (e) {
    var form = e.target.closest('.mn-status-form');
    if (!form) return;
    e.preventDefault();
    if (!needUser()) return;
    var id = form.dataset.id;
    var status = form.elements.status.value;
    var allowed = ['placed', 'processing', 'ready_for_pickup', 'pickup_scheduled', 'picked_up', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
    if (allowed.indexOf(status) < 0) {
      message('Choose a valid delivery status.', true);
      return;
    }
    var button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Updating…'; }
    try {
      var result = await db.from('order_items')
        .update({ status: status })
        .eq('id', id)
        .eq('seller_id', user.id)
        .select('id');
      if (result.error || !result.data || !result.data.length) {
        throw new Error(result.error ? result.error.message : 'This order item could not be updated.');
      }
      message('Order status updated. The customer can track it in their account.');
      await loadSellerOrders();
      await loadBuyerOrders();
      await loadNotifications();
    } catch (err) {
      message('Could not update delivery status: ' + (err.message || 'Please try again.'), true);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Update status'; }
    }
  });

  /* Demo checkout */

  $('mnPlaceOrder').addEventListener('click', async function () {
    if (!needUser()) return;

    var cart;

    try {
      cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch (e) {
      cart = [];
    }

    if (!Array.isArray(cart) || !cart.length) {
      message('Your demo cart is empty.', true);
      return;
    }

    var items = cart.filter(function (x) {
      return x &&
        typeof x.id === 'string' &&
        Number.isInteger(x.qty) &&
        x.qty > 0 &&
        x.qty <= 99;
    }).map(function (x) {
      return { product_id: x.id, quantity: x.qty };
    });

    if (!items.length) {
      message('Cart contents are invalid.', true);
      return;
    }

    var button = this;
    button.disabled = true;
    button.textContent = 'Creating order…';

    try {
      var r = await db.rpc('marketnest_place_order', {
        p_items: items
      });

      if (r.error) throw r.error;

      localStorage.removeItem(CART_KEY);
      message(
        'Demo order created: ' + String(r.data).slice(0, 8) +
        '. No payment was taken.'
      );

      var cartCount = $('cartCount');
      if (cartCount) cartCount.textContent = '0';

      var cartItems = $('cartItems');
      if (cartItems) cartItems.innerHTML = empty('Your cart is empty.');

      var cartTotal = $('cartTotal');
      if (cartTotal) cartTotal.textContent = '₹0';

      // Email delivery is separate from checkout: a mail-provider failure must not undo a valid order.
      try {
        var mailResult = await db.functions.invoke('seller-order-email', {
          body: { order_id: r.data }
        });
        if (mailResult.error) {
          console.warn('Order was created, but seller email notification failed:', mailResult.error.message);
          message('Order created. In-app seller notifications are available; email setup may still be needed.');
        }
      } catch (mailError) {
        console.warn('Order was created, but seller email notification could not be sent:', mailError);
      }

      await loadProducts();
    } catch (e) {
      message(
        'Could not place order: ' +
        (e.message || 'Please check stock and sign-in.'),
        true
      );
    } finally {
      button.disabled = false;
      button.textContent = 'Place demo order from cart';
    }
  });

  /* Verified-buyer reviews */

  async function loadEligibleReviews() {
    var s = $('mnReviewItem');

    var r = await db.from('order_items')
      .select('id,product_id,product_name,orders!inner(buyer_id)')
      .eq('status', 'delivered')
      .eq('orders.buyer_id', user.id)
      .limit(100);

    if (r.error) {
      s.innerHTML = '<option value="">Could not load purchases</option>';
      return;
    }

    var done = await db.rpc('marketnest_my_reviewed_purchases');

    if (done.error) {
      s.innerHTML = '<option value="">Could not check existing reviews</option>';
      return;
    }

    var reviewed = done.data || [];
    var used = new Set(reviewed.map(function (x) {
      return x.order_item_id;
    }));
    var reviewedProducts = new Set(reviewed.map(function (x) {
      return x.product_id;
    }));

    var rows = (r.data || []).filter(function (x) {
      return !used.has(x.id) && !reviewedProducts.has(x.product_id);
    });

    s.innerHTML = '<option value="">Choose delivered purchase</option>' +
      rows.map(function (x) {
        return '<option value="' + safe(x.id) +
          '" data-product="' + safe(x.product_id) + '">' +
          safe(x.product_name) + '</option>';
      }).join('');
  }

  $('mnReviewForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!needUser()) return;

    var opt = $('mnReviewItem').selectedOptions[0];

    if (!opt || !opt.value || !opt.dataset.product) {
      message('Choose a delivered purchase first.', true);
      return;
    }

    var rating = Number($('mnRating').value);
    var body = $('mnReviewBody').value.trim();

    if (
      !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      body.length > 1000
    ) {
      message('Check the rating and review length.', true);
      return;
    }

    var r = await db.from('reviews').insert({
      product_id: opt.dataset.product,
      buyer_id: user.id,
      order_item_id: opt.value,
      rating: rating,
      body: body
    });

    if (r.error) {
      message('Review not submitted: ' + r.error.message, true);
      return;
    }

    message('Thanks! Your verified-buyer review was submitted.');
    $('mnReviewBody').value = '';
    await loadEligibleReviews();
    await loadReviews();
  });

  async function loadReviews() {
    var id = $('mnReviewProduct').value;

    if (!id) {
      $('mnReviews').innerHTML = empty('Choose a product to view reviews.');
      return;
    }

    var r = await db.from('reviews')
      .select('rating,body,created_at')
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    $('mnReviews').innerHTML = r.error
      ? empty('Could not load reviews.')
      : ((r.data || []).map(function (x) {
          return '<article class="mn-item">' +
            '<strong>' + '★'.repeat(Math.max(0, Math.min(5, Number(x.rating) || 0))) +
            '</strong><p>' + safe(x.body || 'No written comment.') +
            '</p><small>' +
            safe(new Date(x.created_at).toLocaleDateString()) +
            '</small></article>';
        }).join('') || empty('No reviews yet.'));
  }

  $('mnReviewProduct').addEventListener('change', loadReviews);

  /* Buyer–seller messaging */

  async function refreshRecipients() {
    var p = $('mnMessageProduct').value;
    var previous = $('mnRecipient').value;

    if (!p || !user) {
      $('mnRecipient').innerHTML =
        '<option value="">Choose recipient</option>';
      return;
    }

    var product = products.find(function (x) {
      return x.id === p;
    });

    var options = [];

    if (product && product.seller_id !== user.id) {
      options.push({
        id: product.seller_id,
        label: product.seller_name || 'Seller'
      });
    }

    if (product && product.seller_id === user.id) {
      var r = await db.from('order_items')
        .select('orders!inner(buyer_id)')
        .eq('product_id', p)
        .eq('seller_id', user.id);

      if (r.error) {
        message('Could not load customers for this product.', true);
      }

      (r.data || []).forEach(function (x) {
        var id = x.orders && x.orders.buyer_id;

        if (id && !options.some(function (o) {
          return o.id === id;
        })) {
          options.push({
            id: id,
            label: 'Customer ' + id.slice(0, 8)
          });
        }
      });
    }

    $('mnRecipient').innerHTML =
      '<option value="">Choose recipient</option>' +
      options.map(function (x) {
        return '<option value="' + safe(x.id) + '">' +
          safe(x.label) + '</option>';
      }).join('');

    if (options.some(function (x) { return x.id === previous; })) {
      $('mnRecipient').value = previous;
    }
  }

  $('mnMessageProduct').addEventListener('change', refreshRecipients);

  $('mnMessageForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!needUser()) return;

    var productId = $('mnMessageProduct').value;
    var recipientId = $('mnRecipient').value;
    var body = $('mnMessageBody').value.trim();

    if (
      !productId || !recipientId ||
      recipientId === user.id ||
      body.length < 1 || body.length > 2000
    ) {
      message(
        'Choose a valid product and recipient, and write a message.',
        true
      );
      return;
    }

    var r = await db.from('marketnest_messages').insert({
      product_id: productId,
      sender_id: user.id,
      recipient_id: recipientId,
      body: body
    });

    if (r.error) {
      message(
        'Message not sent. Check buyer–seller eligibility and migration v4.',
        true
      );
      return;
    }

    message('Message sent.');
    $('mnMessageBody').value = '';
    await loadInbox();
  });

  async function loadInbox() {
    if (!user) return;

    var r = await db.from('marketnest_messages')
      .select('id,product_id,sender_id,recipient_id,body,created_at,read_at')
      .or('sender_id.eq.' + user.id + ',recipient_id.eq.' + user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (r.error) {
      $('mnInbox').innerHTML = empty(
        'Could not load messages. Check migration v4 and RLS.'
      );
      return;
    }

    var map = new Map(products.map(function (p) {
      return [p.id, p.name];
    }));

    $('mnInbox').innerHTML = (r.data || []).map(function (m) {
      return '<article class="mn-item">' +
        '<strong>' +
        (m.sender_id === user.id ? 'Sent' : 'Received') +
        ' · ' + safe(map.get(m.product_id) || 'Product') +
        '</strong><p>' + safe(m.body) + '</p><small>' +
        safe(new Date(m.created_at).toLocaleString()) +
        '</small>' +
        (m.recipient_id === user.id && !m.read_at
          ? '<p><button type="button" data-mark-message="' +
            safe(m.id) + '">Mark read</button></p>'
          : '') +
        '</article>';
    }).join('') || empty('No messages yet.');
  }

  $('mnInbox').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-mark-message]');
    if (!b || !needUser()) return;

    var r = await db.from('marketnest_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', b.dataset.markMessage)
      .eq('recipient_id', user.id);

    if (r.error) {
      message('Could not mark message read.', true);
      return;
    }

    await loadInbox();
  });

  /* Notifications */

  async function loadNotifications() {
    if (!user) return;

    var r = await db.from('marketnest_notifications')
      .select('id,kind,message,link,created_at,read_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (r.error) {
      $('mnNotifications').innerHTML = empty(
        'Could not load notifications. Check migration v4 and RLS.'
      );
      return;
    }

    $('mnNotifications').innerHTML = (r.data || []).map(function (n) {
      return '<article class="mn-item mn-notification ' +
        (!n.read_at ? 'mn-unread' : '') + '">' +
        '<p>' + safe(n.message) + '</p><small>' +
        safe(new Date(n.created_at).toLocaleString()) +
        '</small> ' +
        (!n.read_at
          ? '<button type="button" data-read="' + safe(n.id) +
            '">Mark read</button>'
          : '<span class="mn-badge">Read</span>') +
        '</article>';
    }).join('') || empty('You are all caught up.');
  }

  $('mnNotifications').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-read]');
    if (!b || !needUser()) return;

    var r = await db.from('marketnest_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', b.dataset.read)
      .eq('user_id', user.id);

    if (r.error) {
      message('Could not mark notification read.', true);
      return;
    }

    await loadNotifications();
  });

  $('mnRefreshNotifications').addEventListener('click', function () {
    if (needUser()) loadNotifications();
  });

  /* Listing reports */

  $('mnReportForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!needUser()) return;

    var reason = $('mnReportReason').value.trim();
    var productId = $('mnReportProduct').value;

    if (reason.length < 5 || reason.length > 1000 || !productId) {
      message(
        'Choose a listing and explain the concern (at least 5 characters).',
        true
      );
      return;
    }

    var r = await db.from('marketnest_reports').insert({
      reporter_id: user.id,
      product_id: productId,
      reason: reason
    });

    if (r.error) {
      message('Report could not be submitted: ' + r.error.message, true);
      return;
    }

    message('Report submitted for review.');
    $('mnReportReason').value = '';
    await loadReports();
  });

  async function loadReports() {
    if (!user) return;

    var r = await db.from('marketnest_reports')
      .select('id,product_id,reason,status,created_at')
      .eq('reporter_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (r.error) {
      $('mnMyReports').innerHTML = empty(
        'Could not load reports. Check migration v4 and RLS.'
      );
      return;
    }

    $('mnMyReports').innerHTML = (r.data || []).map(function (x) {
      return '<article class="mn-item">' +
        '<strong>' + safe(x.status) + '</strong>' +
        '<p>' + safe(x.reason) + '</p><small>' +
        safe(new Date(x.created_at).toLocaleDateString()) +
        '</small></article>';
    }).join('') || empty('No reports submitted.');
  }

  /* Admin permissions and moderation */

  async function checkAdmin() {
    var r = await db.rpc('marketnest_is_admin');
    isAdmin = !r.error && r.data === true;
    return isAdmin;
  }

  async function loadAdmin() {
    var box = $('mnAdminArea');

    if (!needUser()) {
      isAdmin = false;
      box.innerHTML = empty('Sign in to check admin access.');
      return;
    }

    box.innerHTML = empty('Checking admin permissions…');

    var ok;

    try {
      ok = await checkAdmin();
    } catch (e) {
      isAdmin = false;
      box.innerHTML = empty(
        'Could not verify admin permissions. Check the marketnest_is_admin RPC.'
      );
      return;
    }

    if (!ok) {
      box.innerHTML = empty(
        'Admin access is not enabled. The project owner must authorize ' +
        'your user ID in marketnest_admins and verify the SQL permissions.'
      );
      return;
    }

    var results;

    try {
      results = await Promise.all([
        db.from('marketnest_reports')
          .select('id,product_id,reason,status,created_at')
          .order('created_at', { ascending: false })
          .limit(100),

        db.from('products')
          .select('id,name,seller_name,price,is_active')
          .order('created_at', { ascending: false })
          .limit(100),

        db.from('reviews')
          .select('id,product_id,rating,body,created_at')
          .order('created_at', { ascending: false })
          .limit(100),

        db.from('marketnest_profiles')
          .select('user_id,email,display_name,account_type,suspended,created_at')
          .order('created_at', { ascending: false })
          .limit(200)
      ]);
    } catch (e) {
      box.innerHTML = empty('Could not load admin data. Please try again.');
      return;
    }

    var rr = results[0];
    var pp = results[1];
    var rev = results[2];
    var users = results[3];

    var failed = [];

    if (rr.error) failed.push('reports');
    if (pp.error) failed.push('products');
    if (rev.error) failed.push('reviews');
    if (users.error) failed.push('users');

    if (failed.length) {
      box.innerHTML = empty(
        'Could not load admin data for: ' + failed.join(', ') +
        '. Check Supabase permissions and RLS policies.'
      );
      return;
    }

    var userHtml = (users.data || []).map(function (u) {
      var self = user && u.user_id === user.id;

      return '<article class="mn-item">' +
        '<strong>' + safe(u.display_name || 'MarketNest user') +
        '</strong><p>' + safe(u.email || 'No email') +
        ' · ' + safe(u.account_type || 'Account') + '</p>' +
        '<small>User ID: ' + safe(u.user_id) + '</small><p>' +
        '<span class="mn-badge">' +
        (u.suspended ? 'Suspended' : 'Active') +
        '</span></p>' +
        (self
          ? '<p class="mn-note">Your current account</p>'
          : '<button type="button" data-suspend-user="' +
            safe(u.user_id) + '" data-suspend="' +
            (!u.suspended) + '">' +
            (u.suspended ? 'Restore account' : 'Suspend account') +
            '</button>') +
        '</article>';
    }).join('') || empty('No profiles found.');

    var reportHtml = (rr.data || []).map(function (x) {
      return '<article class="mn-item">' +
        '<strong>Report ' + safe(x.id.slice(0, 8)) + '</strong>' +
        '<p>' + safe(x.reason) + '</p>' +
        '<label>Status<select data-report-status="' + safe(x.id) + '">' +
        ['open', 'reviewing', 'resolved', 'dismissed'].map(function (s) {
          return '<option ' + (s === x.status ? 'selected' : '') +
            '>' + s + '</option>';
        }).join('') +
        '</select></label>' +
        '<button type="button" data-save-report="' + safe(x.id) +
        '">Save status</button></article>';
    }).join('') || empty('No reports.');

    var productHtml = (pp.data || []).map(function (x) {
      var active = x.is_active !== false;

      return '<article class="mn-item">' +
        '<strong>' + safe(x.name) + '</strong>' +
        '<p>' + safe(x.seller_name || 'Seller') +
        ' · ' + money(x.price) + '</p>' +
        '<span class="mn-badge">' +
        (active ? 'Active' : 'Hidden') + '</span> ' +
        '<button type="button" data-archive-product="' +
        safe(x.id) + '" data-active="' + active + '">' +
        (active ? 'Hide listing' : 'Restore listing') +
        '</button></article>';
    }).join('') || empty('No listings.');

    var reviewHtml = (rev.data || []).map(function (x) {
      return '<article class="mn-item">' +
        '<strong>' +
        '★'.repeat(Math.max(0, Math.min(5, Number(x.rating) || 0))) +
        '</strong><p>' + safe(x.body || 'No written comment.') +
        '</p><small>' +
        safe(new Date(x.created_at).toLocaleDateString()) +
        '</small><p><button type="button" data-delete-review="' +
        safe(x.id) + '">Remove review</button></p></article>';
    }).join('') || empty('No reviews.');

    box.innerHTML =
      '<h4>User management</h4>' +
      '<p class="mn-note">Suspended accounts can still sign in unless ' +
      'authentication is separately disabled. Database rules must ' +
      'block prohibited marketplace actions. Never suspend your own ' +
      'admin account.</p>' + userHtml +
      '<h4>Reported content</h4>' + reportHtml +
      '<h4>Product moderation</h4>' + productHtml +
      '<h4>Review moderation</h4>' + reviewHtml;
  }

  $('mnAdminArea').addEventListener('click', async function (e) {
    var b = e.target.closest('button');
    if (!b) return;

    if (!isAdmin || !user) {
      message('Admin permission required.', true);
      return;
    }

    /* Prevent an outdated admin screen from acting after sign-out. */
    var verified = await checkAdmin();

    if (!verified) {
      message('Admin permission could not be verified.', true);
      await loadAdmin();
      return;
    }

    if (b.dataset.suspendUser) {
      if (b.dataset.suspendUser === user.id) {
        message('You cannot suspend your own account here.', true);
        return;
      }

      var suspend = b.dataset.suspend === 'true';

      if (!confirm(
        suspend
          ? 'Suspend this account from marketplace activity?'
          : 'Restore this account?'
      )) return;

      var su = await db.from('marketnest_profiles')
        .update({ suspended: suspend })
        .eq('user_id', b.dataset.suspendUser);

      if (su.error) {
        message('User moderation failed: ' + su.error.message, true);
        return;
      }

      message('User account status updated.');
      await loadAdmin();
      return;
    }

    if (b.dataset.saveReport) {
      var sel = $('mnAdminArea').querySelector(
        '[data-report-status="' + b.dataset.saveReport + '"]'
      );

      if (!sel) {
        message('Report status control was not found.', true);
        return;
      }

      var allowedStatuses = ['open', 'reviewing', 'resolved', 'dismissed'];

      if (allowedStatuses.indexOf(sel.value) < 0) {
        message('Invalid report status.', true);
        return;
      }

      var r = await db.from('marketnest_reports')
        .update({ status: sel.value })
        .eq('id', b.dataset.saveReport);

      if (r.error) {
        message('Report update failed: ' + r.error.message, true);
      } else {
        message('Report updated.');
        await loadAdmin();
      }

      return;
    }

    if (b.dataset.archiveProduct) {
      var nextActive = b.dataset.active !== 'true';

      if (!confirm(
        nextActive
          ? 'Restore this listing publicly?'
          : 'Hide this listing from the public marketplace?'
      )) return;

      var ar = await db.from('products')
        .update({
          is_active: nextActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', b.dataset.archiveProduct)
        .select('id');

      if (ar.error || !ar.data || !ar.data.length) {
        message(
          'Listing update failed. Check the is_active column and admin RLS policy.',
          true
        );
        return;
      }

      message(nextActive ? 'Listing restored.' : 'Listing hidden.');
      await loadAdmin();
      await loadProducts();
      return;
    }

    if (b.dataset.deleteReview) {
      if (!confirm('Remove this review?')) return;

      var r3 = await db.from('reviews')
        .delete()
        .eq('id', b.dataset.deleteReview)
        .select('id');

      if (r3.error || !r3.data || !r3.data.length) {
        message(
          'Review removal failed. Check the admin RLS policy.',
          true
        );
        return;
      }

      message('Review removed.');
      await loadAdmin();

      if ($('mnReviewProduct').value) await loadReviews();
    }
  });

  /* English/Bengali language switch */

  var bn = false;

  var enToBn = {
    'Orders': 'অর্ডার',
    'Stock & seller orders': 'স্টক ও বিক্রেতার অর্ডার',
    'Reviews': 'রিভিউ',
    'Messages': 'বার্তা',
    'Notifications': 'বিজ্ঞপ্তি',
    'Report listing': 'লিস্টিং রিপোর্ট',
    'Admin': 'অ্যাডমিন',
    'Orders, trust & seller tools': 'অর্ডার, বিশ্বাস ও বিক্রেতার টুল',
    'Sign in above to use orders, messaging and reviews.':
      'অর্ডার, বার্তা ও রিভিউ ব্যবহার করতে উপরে সাইন ইন করুন।',
    'Demo order checkout': 'ডেমো অর্ডার চেকআউট',
    'Place demo order from cart': 'কার্ট থেকে ডেমো অর্ডার দিন',
    'My order history': 'আমার অর্ডার ইতিহাস',
    'Order status': 'অর্ডারের অবস্থা',
    'Inventory management': 'ইনভেন্টরি পরিচালনা',
    'Seller orders': 'বিক্রেতার অর্ডার',
    'Write a verified-buyer review': 'যাচাইকৃত ক্রেতার রিভিউ লিখুন',
    'Delivered product': 'ডেলিভারি হওয়া পণ্য',
    'Rating': 'রেটিং',
    'Review (optional)': 'রিভিউ (ঐচ্ছিক)',
    'Submit review': 'রিভিউ জমা দিন',
    'Product reviews': 'পণ্যের রিভিউ',
    'Choose a product': 'পণ্য বেছে নিন',
    'Recently viewed': 'সম্প্রতি দেখা',
    'Saved only in this browser on this device.':
      'শুধু এই ডিভাইসের ব্রাউজারে সংরক্ষিত।',
    'Customer–seller messages': 'ক্রেতা–বিক্রেতার বার্তা',
    'Product': 'পণ্য',
    'Send to': 'প্রাপক',
    'Message': 'বার্তা',
    'Send message': 'বার্তা পাঠান',
    'Inbox & sent messages': 'ইনবক্স ও পাঠানো বার্তা',
    'Your notifications': 'আপনার বিজ্ঞপ্তি',
    'Refresh': 'রিফ্রেশ',
    'Report a listing': 'লিস্টিং রিপোর্ট করুন',
    'Reason': 'কারণ',
    'Submit report': 'রিপোর্ট জমা দিন',
    'Admin moderation': 'অ্যাডমিন পর্যালোচনা',
    'User management': 'ব্যবহারকারী পরিচালনা',
    'Reported content': 'রিপোর্ট করা বিষয়',
    'Product moderation': 'পণ্য পর্যালোচনা',
    'Review moderation': 'রিভিউ পর্যালোচনা',
    'Save listing': 'লিস্টিং সংরক্ষণ',
    'New stock': 'নতুন স্টক',
    'Product name': 'পণ্যের নাম',
    'Description': 'বিবরণ',
    'Category': 'বিভাগ',
    'Price (₹)': 'দাম (₹)',
    'No orders yet. Add items to the demo cart first.':
      'এখনও অর্ডার নেই। আগে ডেমো কার্টে পণ্য যোগ করুন।',
    'No listings yet. Publish a product in the seller dashboard above.':
      'এখনও কোনো লিস্টিং নেই। উপরের বিক্রেতা ড্যাশবোর্ডে পণ্য প্রকাশ করুন।',
    'No messages yet.': 'এখনও কোনো বার্তা নেই।',
    'You are all caught up.': 'সব বিজ্ঞপ্তি দেখা হয়েছে।',
    'No reports submitted.': 'কোনো রিপোর্ট জমা হয়নি।'
  };

  var bnToEn = Object.fromEntries(
    Object.entries(enToBn).map(function (x) {
      return [x[1], x[0]];
    })
  );

  $('mnLanguage').addEventListener('click', function () {
    bn = !bn;
    document.documentElement.lang = bn ? 'bn' : 'en';

    var walker = document.createTreeWalker(
      panel,
      NodeFilter.SHOW_TEXT
    );

    var nodes = [];

    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (n) {
      var parent = n.parentElement;

      if (
        !parent ||
        /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION)$/.test(parent.tagName) ||
        parent.closest('.mn-item')
      ) return;

      var value = n.nodeValue.trim();
      var translated = bn ? enToBn[value] : bnToEn[value];

      if (translated) {
        var lead = n.nodeValue.match(/^\s*/)[0];
        var tail = n.nodeValue.match(/\s*$/)[0];
        n.nodeValue = lead + translated + tail;
      }
    });

    $('mnLanguage').textContent = bn ? 'English' : 'বাংলা';
    message(bn ? 'ভাষা বদলানো হয়েছে।' : 'Language switched.');
  });

  /* Authentication and initial loading */

  async function refresh() {
    var r = await db.auth.getSession();

    user = r.data && r.data.session
      ? r.data.session.user
      : null;

    isAdmin = false;
    updateAdminVisibility();

    $('mnAccount').textContent = user
      ? 'Signed in as ' + (user.email || user.id) +
        '. Demo checkout takes no payment.'
      : 'Sign in above to use orders, messaging and reviews.';

    if (!user) {
      [
        'mnMyOrders',
        'mnOrderStatuses',
        'mnInventory',
        'mnSellerOrders',
        'mnSellerStats',
        'mnReviews',
        'mnInbox',
        'mnNotifications',
        'mnMyReports'
      ].forEach(function (id) {
        $(id).innerHTML = empty('Sign in to view this section.');
      });

      $('mnReviewItem').innerHTML =
        '<option value="">Sign in to view eligible purchases</option>';

      $('mnAdminArea').innerHTML = empty(
        'Sign in to check admin access.'
      );

      return;
    }

    await loadProducts();

    try {
      var adminResult = await db.rpc('marketnest_is_admin');
      isAdmin = !adminResult.error && adminResult.data === true;
    } catch (e) {
      isAdmin = false;
    }
    updateAdminVisibility();
    if (activeTab === 'admin' && isAdmin) await loadAdmin();
  }

  document.addEventListener('marketnest-auth-changed', function (e) {
    user = e.detail && e.detail.user ? e.detail.user : null;
    setTimeout(function () {
      refresh().catch(function (err) {
        message('Marketplace tools error: ' + err.message, true);
      });
    }, 0);
  });

  db.auth.onAuthStateChange(function () {
    setTimeout(function () {
      refresh().catch(function (err) {
        message('Marketplace tools error: ' + err.message, true);
      });
    }, 0);
  });

  refresh().catch(function (e) {
    message('Marketplace tools error: ' + e.message, true);
  });
})();
