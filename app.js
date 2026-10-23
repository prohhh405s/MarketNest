/* MarketNest app logic (vanilla JS + Supabase).
   SECURITY NOTE: this JavaScript is only a convenience layer. The real security boundary is
   PostgreSQL Row Level Security and Supabase Storage policies (see migration-v2-images-recovery.sql). */
(function () {
  "use strict";
  var H = window.MNHelpers;
  var BUCKET = "product-images";
  var CART_KEY = "marketnest_demo_cart_v1";
  var $ = function (id) { return document.getElementById(id); };

  // Read any auth error in the URL (e.g. expired reset link) BEFORE the Supabase client touches the hash.
  var urlAuth = H.parseAuthHash(window.location.hash);

  var cfgOk = window.MARKETNEST_SUPABASE_URL && window.MARKETNEST_SUPABASE_ANON_KEY &&
    window.MARKETNEST_SUPABASE_URL.indexOf("PASTE_YOUR") === -1 &&
    window.MARKETNEST_SUPABASE_ANON_KEY.indexOf("PASTE_YOUR") === -1 &&
    window.supabase && window.supabase.createClient;
  var db = cfgOk ? window.supabase.createClient(window.MARKETNEST_SUPABASE_URL, window.MARKETNEST_SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

  // Where Supabase emails send people back to. Uses your Vercel address, never a hardcoded localhost.
  function siteUrl() {
    var cfg = (window.MARKETNEST_SITE_URL || "").trim().replace(/\/+$/, "");
    return (cfg || window.location.origin) + "/";
  }

  var products = [];
  var cart = loadCart();
  var currentUser = null;
  var recoveryMode = false;     // true while the user is choosing a new password
  var publishing = false;
  var selectedFile = null;
  var previewUrl = null;
  var imageColumnMissing = false;
  var productsLoaded = false;
  var activeProduct = null;
  var lastFocus = null;
  var saved = new Set();        // ids of products the signed-in user saved
  var savedOnly = false;
  var wishlistMissing = false;  // true if the v3 migration has not been run
  var hashHandled = false;

  /* ---------- small UI helpers ---------- */
  function setMsg(id, text, isError) {
    var el = $(id); if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error-message", !!isError);
  }
  var toastTimer;
  function toast(text, isError) {
    var t = $("toast"); t.textContent = text; t.classList.toggle("error", !!isError); t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }
  function setBusy(btn, busy, busyText, idleText) { btn.disabled = busy; btn.textContent = busy ? busyText : idleText; }
  function imageUrl(path) {
    if (!db || !H.isSafeImagePath(path)) return "";
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || "";
  }
  // A product picture: emoji placeholder underneath, photo on top. A broken photo is removed (see error listener).
  function mediaHtml(p) {
    var url = imageUrl(p.image_path);
    var img = url ? '<img src="' + H.escapeHtml(url) + '" alt="' + H.escapeHtml(p.name) + '" loading="lazy" decoding="async">' : "";
    return '<span aria-hidden="true">' + H.escapeHtml(p.emoji || "📦") + "</span>" + img;
  }
  document.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "IMG" && e.target.closest(".product-art,.dlg-media,.cart-thumb")) e.target.remove();
  }, true);

  /* ---------- cart (demo only: no orders, no payments) ---------- */
  function loadCart() {
    try {
      var s = JSON.parse(localStorage.getItem(CART_KEY));
      return Array.isArray(s) ? s.filter(function (x) { return x && typeof x.id === "string" && Number.isInteger(x.qty) && x.qty > 0; }) : [];
    } catch (e) { return []; }
  }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* storage blocked */ } }
  function addToCart(id) {
    var p = products.find(function (x) { return x.id === id; }); if (!p) return;
    var ex = cart.find(function (x) { return x.id === id; });
    if (p.stock !== null && p.stock !== undefined && p.stock < 1) { toast("This item is out of stock.", true); return; }
    if (ex) ex.qty = Math.min(ex.qty + 1, 99, p.stock == null ? 99 : p.stock); else cart.push({ id: id, qty: 1 });
    saveCart(); renderCart(); toast(p.name + " added to demo cart");
  }
  function renderCart() {
    var lines = cart.map(function (i) { return { i: i, p: products.find(function (x) { return x.id === i.id; }) }; })
      .filter(function (l) { return l.p; });
    $("cartCount").textContent = lines.reduce(function (s, l) { return s + l.i.qty; }, 0);
    $("cartItems").innerHTML = lines.length ? lines.map(function (l) {
      return '<div class="cart-line"><div class="cart-thumb">' + mediaHtml(l.p) + '</div><div><strong>' + H.escapeHtml(l.p.name) +
        "</strong><small>" + l.i.qty + " × " + H.formatMoney(l.p.price) + '</small><div class="cart-quantity" aria-label="Quantity controls">' +
        '<button class="quantity-btn" type="button" data-qty-minus="' + H.escapeHtml(l.p.id) + '" aria-label="Decrease quantity of ' + H.escapeHtml(l.p.name) + '"' + (l.i.qty <= 1 ? ' disabled' : '') + '>−</button>' +
        '<span class="quantity-value" aria-live="polite">' + l.i.qty + '</span>' +
        '<button class="quantity-btn" type="button" data-qty-plus="' + H.escapeHtml(l.p.id) + '" aria-label="Increase quantity of ' + H.escapeHtml(l.p.name) + '"' + (l.i.qty >= 99 || (l.p.stock != null && l.i.qty >= l.p.stock) ? ' disabled' : '') + '>+</button>' +
        '<button class="remove-btn" type="button" data-remove="' + H.escapeHtml(l.p.id) + '">Remove</button></div></div><strong>' + H.formatMoney(l.p.price * l.i.qty) + "</strong></div>";
    }).join("") : '<div class="empty">Your demo cart is empty.</div>';
    $("cartTotal").textContent = H.formatMoney(lines.reduce(function (s, l) { return s + l.p.price * l.i.qty; }, 0));
  }
  function openCart() {
    lastFocus = document.activeElement;
    $("cartDrawer").classList.add("open"); $("cartDrawer").setAttribute("aria-hidden", "false"); $("overlay").classList.add("show");
    $("closeCart").focus();
  }
  function closeCart() {
    $("cartDrawer").classList.remove("open"); $("cartDrawer").setAttribute("aria-hidden", "true"); $("overlay").classList.remove("show");
    if (lastFocus) lastFocus.focus();
  }

  /* ---------- storefront ---------- */
  function showSkeletons() {
    $("productGrid").setAttribute("aria-busy", "true");
    $("productGrid").innerHTML = new Array(8).join('<div class="skeleton"><i></i><i></i><i></i></div>') + '<div class="skeleton"><i></i><i></i><i></i></div>';
    $("resultInfo").textContent = "Loading listings…";
  }
  async function loadProducts() {
    if (!db) {
      productsLoaded = true; renderProducts();
      $("resultInfo").textContent = "Setup needed: add your Supabase publishable key in supabase-config.js (see SETUP.md).";
      return;
    }
    showSkeletons();
    var cols = "id,name,price,category,seller_name,emoji,created_at";
    var res = await db.from("products").select(cols + ",image_path,description,stock").order("created_at", { ascending: false }).limit(200);
    if (res.error) {
      // Graceful fallback for projects that have not yet run every migration.
      res = await db.from("products").select(cols + ",image_path,description").order("created_at", { ascending: false }).limit(200);
      if (res.error && /image_path|description/.test(res.error.message || "")) {
        imageColumnMissing = true;
        res = await db.from("products").select(cols).order("created_at", { ascending: false }).limit(200);
      } else { imageColumnMissing = false; }
    } else { imageColumnMissing = false; }
    $("productGrid").setAttribute("aria-busy", "false");
    if (res.error) {
      console.error("Could not load products:", res.error.message);
      $("resultInfo").textContent = "";
      $("productGrid").innerHTML = '<div class="empty"><strong>We couldn\'t load listings.</strong>Check your internet connection and that setup.sql was run in Supabase.<br><br><button class="secondary-btn" type="button" id="retryLoad">Try again</button></div>';
      return;
    }
    products = (res.data || []).map(function (p) {
      return { id: String(p.id), name: String(p.name || ""), price: Number(p.price) || 0, category: String(p.category || ""),
        seller: p.seller_name || "MarketNest seller", emoji: p.emoji || "📦", image_path: p.image_path || "", description: p.description || "", stock: Number.isInteger(p.stock) ? p.stock : null, created_at: p.created_at || "" };
    });
    productsLoaded = true;
    cart = cart.filter(function (c) { return products.some(function (p) { return p.id === c.id; }); }); saveCart();
    renderProducts(); renderCart();
    if (!hashHandled) { hashHandled = true; openFromHash(); }
    if (imageColumnMissing) setMsg("accountStatus", "Photos and descriptions are off until the SQL migrations are run (see SETUP.md, steps C and C2).", true);
  }
  function filteredProducts() {
    var q = $("search").value.trim().toLowerCase();
    var cat = $("category").value;
    var min = parseInt($("minPrice").value, 10), max = parseInt($("maxPrice").value, 10);
    var list = products.filter(function (p) {
      return (cat === "All" || p.category === cat) && (!q || p.name.toLowerCase().indexOf(q) !== -1 || p.seller.toLowerCase().indexOf(q) !== -1) &&
        (isNaN(min) || p.price >= min) && (isNaN(max) || p.price <= max) && (!savedOnly || saved.has(p.id));
    });
    var s = $("sort").value;
    if (s === "price-asc") list.sort(function (a, b) { return a.price - b.price; });
    else if (s === "price-desc") list.sort(function (a, b) { return b.price - a.price; });
    else list.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
    return list;
  }
  function renderProducts() {
    if (!productsLoaded) return;
    var shown = filteredProducts();
    var grid = $("productGrid");
    $("resultInfo").textContent = shown.length + " listing" + (shown.length === 1 ? "" : "s") + (savedOnly ? " · showing your saved items" : "");
    if (!shown.length) {
      grid.innerHTML = savedOnly ? '<div class="empty"><strong>No saved items here yet.</strong>Tap the ♡ on any product to save it, or clear your filters.</div>' : products.length
        ? '<div class="empty"><strong>No products match your search.</strong>Try a different word, or choose another category.</div>'
        : '<div class="empty"><strong>No products have been listed yet.</strong>Sellers can create an account below and publish the first listing.</div>';
      return;
    }
    grid.innerHTML = shown.map(function (p) {
      var id = H.escapeHtml(p.id);
      return '<article class="product-card">' + heartHtml(p.id) + '<button type="button" class="product-art" data-view="' + id + '" aria-label="View details for ' + H.escapeHtml(p.name) + '">' + mediaHtml(p) + "</button>" +
        '<button type="button" class="product-name" data-view="' + id + '">' + H.escapeHtml(p.name) + "</button>" +
        '<p class="seller-name">Sold by ' + H.escapeHtml(p.seller) + " · " + H.escapeHtml(p.category) + "</p>" +
        '<div class="price-row"><span class="price">' + H.formatMoney(p.price) + '</span><button class="add-btn" type="button" data-add="' + id + '" ' + (p.stock === 0 ? 'disabled' : '') + '>' + (p.stock === 0 ? 'Out of stock' : '＋ Demo cart') + '</button></div></article>';
    }).join("");
  }
  function setCategory(cat) {
    $("category").value = cat;
    Array.prototype.forEach.call($("subnav").querySelectorAll("button"), function (b) {
      var on = b.dataset.cat === cat; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on));
    });
    renderProducts();
  }
  function openDetails(id) {
    var p = products.find(function (x) { return x.id === id; }); if (!p) return;
    activeProduct = p; lastFocus = document.activeElement;
    document.dispatchEvent(new CustomEvent("mn-product-viewed", { detail: p }));
    $("dlgMedia").innerHTML = mediaHtml(p);
    $("dlgCategory").textContent = p.category.toUpperCase();
    $("dlgName").textContent = p.name;
    $("dlgPrice").textContent = H.formatMoney(p.price);
    $("dlgSeller").textContent = "Sold by " + p.seller;
    $("dlgDate").textContent = p.created_at ? "Listed " + new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
    $("dlgDesc").textContent = p.description || ""; $("dlgDesc").hidden = !p.description; syncDlgSave();
    var d = $("productDialog");
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  }

  /* ---------- saved items (stored in Supabase "wishlist", protected by RLS) ---------- */
  function heartHtml(id) {
    var on = saved.has(id);
    return '<button type="button" class="heart' + (on ? " on" : "") + '" data-save="' + H.escapeHtml(id) + '" aria-pressed="' + on +
      '" aria-label="' + (on ? "Remove from saved items" : "Save item") + '">' + (on ? "♥" : "♡") + "</button>";
  }
  function updateSavedUI() {
    $("savedCount").textContent = saved.size;
    $("savedToggle").setAttribute("aria-pressed", String(savedOnly)); $("savedToggle").classList.toggle("active", savedOnly);
    $("custSaved").textContent = "You have " + saved.size + " saved item" + (saved.size === 1 ? "" : "s") + ".";
  }
  function syncDlgSave() {
    if (!activeProduct) return;
    var on = saved.has(activeProduct.id);
    $("dlgSave").textContent = on ? "♥ Saved" : "♡ Save item"; $("dlgSave").setAttribute("aria-pressed", String(on));
  }
  async function loadSaved() {
    saved = new Set();
    if (db && currentUser) {
      var r = await db.from("wishlist").select("product_id").eq("user_id", currentUser.id);
      if (r.error) { wishlistMissing = true; console.warn("Saved items unavailable:", r.error.message); }
      else { wishlistMissing = false; saved = new Set((r.data || []).map(function (x) { return String(x.product_id); })); }
    }
    updateSavedUI(); renderProducts(); syncDlgSave();
  }
  async function toggleSaved(id) {
    if (!db) return;
    if (!currentUser || recoveryMode) { toast("Create a free account or sign in to save items.", true); scrollToSeller(); return; }
    if (wishlistMissing) { toast("Saved items need the v3 SQL migration (see SETUP.md).", true); return; }
    var was = saved.has(id);
    if (was) saved.delete(id); else saved.add(id);
    updateSavedUI(); renderProducts(); syncDlgSave();
    var t = db.from("wishlist");
    var r = was ? await t.delete().eq("user_id", currentUser.id).eq("product_id", id) : await t.insert({ user_id: currentUser.id, product_id: id });
    if (r.error) { // the database said no: undo the change on screen
      if (was) saved.add(id); else saved.delete(id);
      updateSavedUI(); renderProducts(); syncDlgSave(); toast("Couldn't update saved items. Try again.", true);
    }
  }
  function showSaved(on) {
    if (on && !currentUser) { toast("Sign in to see your saved items.", true); scrollToSeller(); return; }
    savedOnly = on; updateSavedUI(); renderProducts(); if (on) $("products").scrollIntoView({ behavior: "smooth" });
  }
  function openFromHash() { // product links look like  https://your-site/#product=<id>
    var m = /^#product=([0-9a-f-]{36})$/i.exec(window.location.hash || "");
    if (m && products.some(function (p) { return p.id === m[1].toLowerCase(); })) openDetails(m[1].toLowerCase());
  }

  /* ---------- auth views ---------- */
  function showAuthView(name) {
    Array.prototype.forEach.call(document.querySelectorAll("#authPanel form[data-view]"), function (f) { f.hidden = f.dataset.view !== name; });
    $("authTabs").hidden = (name === "forgot" || name === "reset");
    Array.prototype.forEach.call($("authTabs").querySelectorAll("button"), function (b) {
      var on = b.dataset.authView === name; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on));
    });
    $("authTitle").textContent = name === "forgot" ? "Reset your password" : name === "reset" ? "Choose a new password" : "Seller account";
    setMsg("authMessage", "");
  }
  function setSignedInUI(user) {
    var changed = (currentUser && currentUser.id) !== (user && user.id);
    currentUser = user || null;
    renderAdminControlLink(currentUser);
    var show = !!currentUser && !recoveryMode;
    var meta = (currentUser && currentUser.user_metadata) || {};
    var customer = meta.account_type === "customer";   // accounts made before v3 have no type and count as sellers
    $("authPanel").hidden = show; $("dashboard").hidden = !(show && !customer); $("customerArea").hidden = !(show && customer);
    if (show && !customer) {
      $("welcomeSeller").textContent = meta.store_name || "Your shop";
      $("sellerEmail").textContent = currentUser.email || "";
    }
    if (show && customer) {
      $("custName").textContent = meta.display_name || "Your account";
      $("custEmail").textContent = currentUser.email || "";
    }
    if (changed) {
      if (!currentUser) { saved = new Set(); savedOnly = false; updateSavedUI(); renderProducts(); }
      else if (show) {
        setTimeout(function () { loadSaved(); if (!customer) refreshMyListings(); }, 0); // setTimeout: never call Supabase inside its own auth callback
      }
    }
    if (document.dispatchEvent && typeof CustomEvent === "function") document.dispatchEvent(new CustomEvent("marketnest-auth-changed", { detail: { user: currentUser } }));
  }
  function friendlyAuthError(err) {
    var c = err && err.code, m = (err && err.message) || "";
    if (c === "email_not_confirmed" || /not confirmed/i.test(m)) return "Please verify your email first: open the confirmation email we sent, then sign in.";
    if (c === "invalid_credentials" || /invalid login/i.test(m)) return "Sign-in failed. Check your email and password.";
    if (c === "over_email_send_rate_limit" || err && err.status === 429 || /rate limit/i.test(m)) return "Too many requests. Please wait a minute and try again.";
    if (c === "weak_password" || /password/i.test(m)) return m || "That password isn't accepted. Try a longer one.";
    if (c === "user_already_exists" || /already registered/i.test(m)) return "An account with that email may already exist. Try signing in or resetting your password.";
    if (/network|failed to fetch/i.test(m)) return "Network problem. Check your connection and try again.";
    return "Something went wrong. Please try again.";
  }
  async function initialiseAuth() {
    var status = $("accountStatus");
    if (!db) {
      status.textContent = "Not connected yet. Add your Supabase publishable key (see SETUP.md).";
      Array.prototype.forEach.call(document.querySelectorAll("#authPanel button[type=submit]"), function (b) { b.disabled = true; });
      return;
    }
    status.textContent = "Connected. Create an account or sign in.";
    // Subscribe first so the PASSWORD_RECOVERY event from a reset link is never missed.
    db.auth.onAuthStateChange(function (event, session) {
      if (event === "PASSWORD_RECOVERY") { enterRecoveryMode(session); return; }
      if (event === "SIGNED_OUT") { recoveryMode = false; setSignedInUI(null); return; }
      if (recoveryMode) return;
      setSignedInUI(session ? session.user : null);
    });
    if (urlAuth.error || urlAuth.errorCode) {
      var expired = /expired|invalid/i.test(urlAuth.errorDescription + urlAuth.errorCode);
      showAuthView("forgot");
      setMsg("authMessage", expired ? "This link is invalid, has expired, or was already used. Enter your email to get a new reset link."
        : "That link couldn't be used. Please try again.", true);
      scrollToSeller();
    } else if (urlAuth.type === "signup" && urlAuth.hasTokens) {
      toast("Email verified. You're signed in.");
    }
    var r = await db.auth.getSession();
    if (r.error) console.warn("Session check failed:", r.error.message);
    if (!recoveryMode) setSignedInUI(r.data && r.data.session ? r.data.session.user : null);
    // Only now (after Supabase has read the URL) is it safe to remove tokens/errors from the address bar.
    if (urlAuth.error || urlAuth.errorCode || urlAuth.type || urlAuth.hasTokens) cleanUrl();
  }
  function cleanUrl() { try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) { /* ignore */ } }
  function scrollToSeller() { var s = $("seller"); if (s) s.scrollIntoView({ behavior: "smooth" }); }
  function enterRecoveryMode(session) {
    recoveryMode = true; currentUser = session ? session.user : null;
    $("authPanel").hidden = false; $("dashboard").hidden = true;
    showAuthView("reset"); scrollToSeller();
    setMsg("authMessage", "Link accepted. Choose your new password.");
  }

  /* ---------- auth forms ---------- */
  $("authTabs").addEventListener("click", function (e) { var b = e.target.closest("[data-auth-view]"); if (b) showAuthView(b.dataset.authView); });
  $("forgotForm").addEventListener("click", function (e) { var b = e.target.closest("[data-auth-view]"); if (b) showAuthView(b.dataset.authView); });
  $("forgotLink").addEventListener("click", function () {
    var email = $("loginForm").elements.email.value.trim();
    showAuthView("forgot"); $("forgotForm").elements.email.value = email; $("forgotForm").elements.email.focus();
  });

  $("signupForm").addEventListener("submit", async function (e) {
    e.preventDefault(); if (!db) return;
    var f = e.currentTarget, btn = f.querySelector("button[type=submit]"); if (btn.disabled) return;
    var accountType = f.elements.accountType.value === "seller" ? "seller" : "customer";
    var storeName = f.elements.storeName.value.trim(), email = f.elements.email.value.trim(), pw = f.elements.password.value;
    var sellerPhone = f.elements.sellerPhone.value.trim();
    if (storeName.length < 2) return setMsg("authMessage", (accountType === "seller" ? "Shop name" : "Name") + " must have at least 2 characters.", true);
    if (accountType === "seller" && !/^[+]?[0-9 ()-]{7,20}$/.test(sellerPhone)) return setMsg("authMessage", "Enter a valid contact phone number for your seller account.", true);
    if (!H.validateEmail(email)) return setMsg("authMessage", "Enter a valid email address.", true);
    var pwErr = H.validatePassword(pw); if (pwErr) return setMsg("authMessage", pwErr, true);
    setBusy(btn, true, "Creating account…");
    var r = await db.auth.signUp({ email: email, password: pw, options: { data: accountType === "seller" ? { store_name: storeName, account_type: "seller", seller_phone: sellerPhone } : { display_name: storeName, account_type: "customer" }, emailRedirectTo: siteUrl() } });
    setBusy(btn, false, "", accountType === "seller" ? "Create seller account" : "Create buyer account");
    if (r.error) return setMsg("authMessage", friendlyAuthError(r.error), true);
    f.reset();
    if (r.data.session) { setMsg("authMessage", "Account created and signed in."); setSignedInUI(r.data.user); }
    else setMsg("authMessage", "Almost done! We sent a verification link to your email. Open it, then come back and sign in.");
  });

  $("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault(); if (!db) return;
    var f = e.currentTarget, btn = f.querySelector("button[type=submit]"); if (btn.disabled) return;
    var email = f.elements.email.value.trim(), pw = f.elements.password.value;
    if (!H.validateEmail(email) || !pw) return setMsg("authMessage", "Enter your email and password.", true);
    setBusy(btn, true, "Signing in…");
    var r = await db.auth.signInWithPassword({ email: email, password: pw });
    setBusy(btn, false, "", "Sign in");
    if (r.error) return setMsg("authMessage", friendlyAuthError(r.error), true);
    f.reset(); setMsg("authMessage", ""); setSignedInUI(r.data.user);

    // Redirect only after an explicit storefront sign-in, never when an existing
    // session is restored while the admin visits the marketplace.
    var signedInId = r.data.user && r.data.user.id;
    try {
      var adminResult = await db.rpc("marketnest_is_admin");
      if (!adminResult.error && adminResult.data === true &&
          !recoveryMode && currentUser && currentUser.id === signedInId) {
        window.location.replace(new URL("admin.html", window.location.href).href);
      }
    } catch (error) {
      console.warn("Could not check admin redirect:", error && error.message ? error.message : error);
    }
  });

  var forgotCooldown = false;
  $("forgotForm").addEventListener("submit", async function (e) {
    e.preventDefault(); if (!db || forgotCooldown) return;
    var f = e.currentTarget, btn = f.querySelector("button[type=submit]");
    var email = f.elements.email.value.trim();
    if (!H.validateEmail(email)) return setMsg("authMessage", "Enter a valid email address.", true);
    setBusy(btn, true, "Sending…");
    var r = await db.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (r.error) { setBusy(btn, false, "", "Send reset link"); return setMsg("authMessage", friendlyAuthError(r.error), true); }
    // Same wording whether or not the email exists, so account emails can't be guessed.
    setMsg("authMessage", "If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.");
    forgotCooldown = true; var left = 60; btn.disabled = true; btn.textContent = "Resend in " + left + "s";
    var t = setInterval(function () {
      left--; if (left <= 0) { clearInterval(t); forgotCooldown = false; setBusy(btn, false, "", "Send reset link"); } else btn.textContent = "Resend in " + left + "s";
    }, 1000);
  });

  $("resetForm").addEventListener("submit", async function (e) {
    e.preventDefault(); if (!db) return;
    var f = e.currentTarget, btn = f.querySelector("button[type=submit]"); if (btn.disabled) return;
    var pw = f.elements.password.value, confirmPw = f.elements.confirm.value;
    var pwErr = H.validatePassword(pw); if (pwErr) return setMsg("authMessage", pwErr, true);
    if (pw !== confirmPw) return setMsg("authMessage", "The two passwords don't match.", true);
    setBusy(btn, true, "Updating…");
    var r = await db.auth.updateUser({ password: pw });
    setBusy(btn, false, "", "Update password");
    if (r.error) {
      var gone = /session|expired|not authenticated|jwt/i.test(r.error.message || "");
      if (gone) { recoveryMode = false; showAuthView("forgot"); }
      return setMsg("authMessage", gone ? "Your reset link has expired or was already used. Request a new one." : friendlyAuthError(r.error), true);
    }
    f.reset();
    recoveryMode = false;
    await db.auth.signOut(); // make them sign in with the new password
    setSignedInUI(null); showAuthView("login");
    setMsg("authMessage", "Password updated. Please sign in with your new password.");
  });

  async function doLogout() {
    if (!db) return;
    var r = await db.auth.signOut();
    if (r.error) return toast("Sign-out failed. Try again.", true);
    setSignedInUI(null); showAuthView("login"); setMsg("authMessage", "You are signed out.");
  }
  $("logoutBtn").addEventListener("click", doLogout);
  $("customerLogout").addEventListener("click", doLogout);
  $("signupForm").addEventListener("change", function (e) { // label follows the chosen account type
    if (!e.target || e.target.name !== "accountType") return;
    var seller = e.target.value === "seller";
    $("nameLabel").textContent = seller ? "Shop name" : "Your name";
    $("signupForm").elements.storeName.placeholder = seller ? "e.g. BrightNest" : "e.g. Aarav";
    $("sellerPhoneField").hidden = !seller;
    $("sellerPhoneHint").hidden = !seller;
    $("signupForm").querySelector("button[type=submit]").textContent = seller ? "Create seller account" : "Create buyer account";
    $("signupForm").elements.sellerPhone.required = seller;
    $("signupForm").elements.sellerPhone.setCustomValidity("");
  });
  $("changePwForm").addEventListener("submit", async function (e) {
    e.preventDefault(); if (!db || !currentUser) return;
    var f = e.currentTarget, btn = f.querySelector("button[type=submit]"); if (btn.disabled) return;
    var pw = f.elements.password.value, err = H.validatePassword(pw);
    if (err) return setMsg("pwMessage", err, true);
    if (pw !== f.elements.confirm.value) return setMsg("pwMessage", "The two passwords don't match.", true);
    setBusy(btn, true, "Updating…");
    var r = await db.auth.updateUser({ password: pw });
    setBusy(btn, false, "", "Update password");
    if (r.error) return setMsg("pwMessage", friendlyAuthError(r.error), true);
    f.reset(); setMsg("pwMessage", "Password updated.");
  });
  $("becomeSellerForm").addEventListener("submit", async function (e) {
    e.preventDefault(); if (!db || !currentUser) return;
    var f = e.currentTarget, btn = f.querySelector("button[type=submit]"); if (btn.disabled) return;
    var name = f.elements.shopName.value.trim();
    if (name.length < 2) return setMsg("sellerMessage", "Shop name must have at least 2 characters.", true);
    setBusy(btn, true, "Enabling…");
    var r = await db.auth.updateUser({ data: { account_type: "seller", store_name: name } });
    setBusy(btn, false, "", "Enable seller tools");
    if (r.error) return setMsg("sellerMessage", friendlyAuthError(r.error), true);
    if (db.auth.refreshSession) await db.auth.refreshSession(); // so the new shop name is in your sign-in token
    f.reset(); setSignedInUI(r.data.user); refreshMyListings(); toast("Seller tools enabled");
  });

  /* ---------- image selection ---------- */
  function clearImage() {
    selectedFile = null;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $("imageInput").value = ""; $("imagePreviewBox").hidden = true; $("imagePreview").removeAttribute("src");
  }
  $("imageInput").addEventListener("change", async function (e) {
    setMsg("imageError", "");
    var file = e.target.files && e.target.files[0];
    if (!file) return clearImage();
    var err = H.validateImageBasics(file);
    if (!err) { var mime = await H.detectImageType(file); if (!mime || mime !== file.type) err = "That file doesn't look like a real JPEG, PNG or WebP image."; }
    if (err) { clearImage(); return setMsg("imageError", err, true); }
    selectedFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    $("imagePreview").onerror = function () { clearImage(); setMsg("imageError", "That image could not be read. Please choose another file.", true); };
    $("imagePreview").src = previewUrl; $("imagePreviewBox").hidden = false;
  });
  $("removeImage").addEventListener("click", function () { clearImage(); setMsg("imageError", ""); });

  /* ---------- publish / delete ---------- */
  function uploadErrorText(err) {
    var m = ((err && err.message) || "") + " " + ((err && (err.statusCode || err.status)) || "");
    if (/413|exceed|too large|maximum/i.test(m)) return "The server rejected the image because it is over 2 MB.";
    if (/mime|type/i.test(m)) return "The server rejected this image type. Use JPEG, PNG or WebP.";
    if (/row-level|policy|403|unauthor/i.test(m)) return "You aren't allowed to upload that file. Try signing in again.";
    if (/bucket/i.test(m)) return "The product-images storage bucket isn't set up yet (see SETUP.md, Step 2).";
    return "Image upload failed. Check your connection and try again.";
  }
  $("productForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (publishing) return;                         // duplicate-submission guard
    if (!db || !currentUser) return setMsg("productMessage", "Sign in before publishing.", true);
    var f = e.currentTarget, btn = $("publishBtn");
    var name = f.elements.name.value.trim(), price = Number(f.elements.price.value);
    var category = f.elements.category.value;
    var emoji = Array.from(f.elements.emoji.value.trim() || "📦").slice(0, 4).join("");
    var desc = (f.elements.description.value || "").trim().slice(0, 500);
    if (name.length < 2 || name.length > 80) return setMsg("productMessage", "Product name must be 2 to 80 characters.", true);
    if (!Number.isInteger(price) || price < 1 || price > 1000000) return setMsg("productMessage", "Enter a whole-number price between ₹1 and ₹10,00,000.", true);
    if (selectedFile && imageColumnMissing) return setMsg("productMessage", "Photos need the SQL migration first (see SETUP.md, Step 2).", true);
    publishing = true; setBusy(btn, true, "Publishing…"); $("uploadBar").hidden = false; setMsg("productMessage", "");
    var uploadedPath = null;
    try {
      var sess = await db.auth.getSession();
      var user = sess.data && sess.data.session && sess.data.session.user;
      if (!user) throw new Error("Your session expired. Please sign in again.");
      var row = { seller_id: user.id, name: name, price: price, category: category, emoji: emoji,
        seller_name: (user.user_metadata && user.user_metadata.store_name) || "MarketNest seller" };
      if (desc && !imageColumnMissing) row.description = desc;
      if (selectedFile) {
        var err = H.validateImageBasics(selectedFile); if (err) throw new Error(err);
        var mime = await H.detectImageType(selectedFile);
        if (!mime || mime !== selectedFile.type) throw new Error("That file doesn't look like a real JPEG, PNG or WebP image.");
        var path = H.buildStoragePath(user.id, mime);
        setMsg("productMessage", "Uploading photo…");
        var up = await db.storage.from(BUCKET).upload(path, selectedFile, { contentType: mime, cacheControl: "31536000", upsert: false });
        if (up.error) { console.error("Upload failed:", up.error.message); throw new Error(uploadErrorText(up.error)); }
        uploadedPath = path; row.image_path = path;
      }
      setMsg("productMessage", "Saving listing…");
      var ins = await db.from("products").insert(row);
      if (ins.error) { console.error("Insert failed:", ins.error.message); throw new Error("Your listing was not saved. Please try again."); }
      f.reset(); f.elements.emoji.value = "📦"; clearImage(); uploadedPath = null;
      setMsg("productMessage", "Published! Your listing is live."); toast("Listing published");
      await loadProducts(); await refreshMyListings();
    } catch (ex) {
      if (uploadedPath) { // product row failed: remove the orphaned image
        var rm = await db.storage.from(BUCKET).remove([uploadedPath]);
        if (rm.error) console.warn("Could not clean up image:", rm.error.message);
      }
      setMsg("productMessage", ex.message || "Something went wrong.", true);
    } finally {
      publishing = false; setBusy(btn, false, "", "＋ Publish listing"); $("uploadBar").hidden = true;
    }
  });

  var myRows = [];
  function renderMyListings(rows) {
    var box = $("myListings"); myRows = rows || [];
    if (!myRows.length) { box.innerHTML = '<p class="small-muted">You have not published any listings yet.</p>'; return; }
    box.innerHTML = myRows.map(function (p) {
      return '<div class="my-listing"><div class="cart-thumb">' + mediaHtml(p) + "</div><div><strong>" + H.escapeHtml(p.name) + "</strong><span>" +
        H.formatMoney(p.price) + " · " + H.escapeHtml(p.category) + '</span></div><button class="remove-listing" type="button" data-delete-listing="' + H.escapeHtml(p.id) + '">Delete</button></div>';
    }).join("");
  }
  async function refreshMyListings() {
    if (!db || !currentUser) return;
    var cols = "id,name,price,category,emoji";
    var r = await db.from("products").select(imageColumnMissing ? cols : cols + ",image_path").eq("seller_id", currentUser.id).order("created_at", { ascending: false });
    if (r.error) { setMsg("productMessage", "Could not load your listings.", true); console.error(r.error.message); return; }
    renderMyListings(r.data || []);
  }
  $("myListings").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-delete-listing]"); if (!b || !db || !currentUser) return;
    var id = b.dataset.deleteListing, row = myRows.find(function (x) { return x.id === id; });
    if (!window.confirm("Delete this listing? This cannot be undone.")) return;
    b.disabled = true;
    // .select() returns the deleted rows, so we can tell if the database really deleted something (RLS hides other sellers' rows).
    var r = await db.from("products").delete().eq("id", id).select("id");
    if (r.error || !r.data || !r.data.length) {
      b.disabled = false; setMsg("productMessage", "Could not delete this listing. It may not belong to you.", true); return;
    }
    if (row && row.image_path && H.isSafeImagePath(row.image_path)) {
      var rm = await db.storage.from(BUCKET).remove([row.image_path]);
      if (rm.error) console.warn("Listing deleted, but its image could not be removed:", rm.error.message);
    }
    setMsg("productMessage", "Listing deleted.");
    await loadProducts(); await refreshMyListings();
  });

  /* ---------- account sidebar ---------- */
  async function renderAdminControlLink(user) {
    var body = $("accountDrawerBody");
    function removeAdminControlLinks() {
      document.querySelectorAll('[id="adminControlRoomLink"]').forEach(function (link) {
        link.remove();
      });
    }

    // Clean up any duplicates left by earlier renders or older cached scripts.
    removeAdminControlLinks();
    if (!body || !db || !user || recoveryMode) return;
    try {
      var result = await db.rpc("marketnest_is_admin");
      // A stale permission response must never add a link for a different signed-in user.
      if (result.error || result.data !== true || !currentUser || currentUser.id !== user.id || recoveryMode) return;

      // Auth events can trigger overlapping checks. Re-check and ensure there is only one button.
      removeAdminControlLinks();
      if (body.querySelector('[id="adminControlRoomLink"]')) return;

      var button = document.createElement("button");
      button.type = "button";
      button.id = "adminControlRoomLink";
      button.className = "primary-btn full";
      button.textContent = "Open Admin Control Room ↗";
      button.addEventListener("click", function () {
        window.location.href = new URL("admin.html", window.location.href).href;
      });
      body.insertBefore(button, accountWorkspace || body.firstChild);
    } catch (error) {
      console.warn("Could not verify admin control-room link:", error && error.message ? error.message : error);
    }
  }
  var accountDrawer = $("accountDrawer");
  var accountToggle = $("accountToggle");
  var accountOverlay = $("accountOverlay");
  var accountWorkspace = document.querySelector(".seller-workspace");
  // Keep the existing forms and their event handlers intact, but render them inside the slide-out account panel.
  if (accountWorkspace) $("accountDrawerBody").appendChild(accountWorkspace);
  function openAccount() {
    lastFocus = document.activeElement;
    accountDrawer.classList.add("open");
    accountDrawer.setAttribute("aria-hidden", "false");
    accountToggle.setAttribute("aria-expanded", "true");
    accountOverlay.classList.add("show");
    var firstInput = accountDrawer.querySelector("#loginForm input, #signupForm input, button");
    if (firstInput) firstInput.focus();
  }
  function closeAccount() {
    accountDrawer.classList.remove("open");
    accountDrawer.setAttribute("aria-hidden", "true");
    accountToggle.setAttribute("aria-expanded", "false");
    accountOverlay.classList.remove("show");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  accountToggle.addEventListener("click", openAccount);
  $("closeAccount").addEventListener("click", closeAccount);
  accountOverlay.addEventListener("click", closeAccount);

  /* ---------- page events ---------- */
  $("productGrid").addEventListener("click", function (e) {
    var v = e.target.closest("[data-view]"); if (v) return openDetails(v.dataset.view);
    var a = e.target.closest("[data-add]"); if (a) return addToCart(a.dataset.add);
    var h = e.target.closest("[data-save]"); if (h) return toggleSaved(h.dataset.save);
    if (e.target.id === "retryLoad") loadProducts();
  });
  $("cartItems").addEventListener("click", function (e) {
    var plus = e.target.closest("[data-qty-plus]");
    var minus = e.target.closest("[data-qty-minus]");
    var remove = e.target.closest("[data-remove]");
    if (plus || minus) {
      var id = (plus || minus).dataset.qtyPlus || (plus || minus).dataset.qtyMinus;
      var item = cart.find(function (x) { return x.id === id; });
      var product = products.find(function (x) { return x.id === id; });
      if (!item || !product) return;
      if (plus) {
        var maxQty = product.stock == null ? 99 : Math.min(99, product.stock);
        if (item.qty >= maxQty) { toast("Maximum available quantity reached.", true); return; }
        item.qty += 1;
      } else {
        item.qty = Math.max(1, item.qty - 1);
      }
      saveCart(); renderCart(); return;
    }
    if (!remove) return;
    cart = cart.filter(function (x) { return x.id !== remove.dataset.remove; }); saveCart(); renderCart();
  });
  $("subnav").addEventListener("click", function (e) { var b = e.target.closest("[data-cat]"); if (b) setCategory(b.dataset.cat); });
  $("category").addEventListener("change", function () { setCategory($("category").value); });
  $("sort").addEventListener("change", renderProducts);
  $("search").addEventListener("input", renderProducts);
  $("searchForm").addEventListener("submit", function (e) { e.preventDefault(); renderProducts(); $("products").scrollIntoView({ behavior: "smooth" }); });
  $("cartToggle").addEventListener("click", openCart);
  $("closeCart").addEventListener("click", closeCart);
  $("overlay").addEventListener("click", closeCart);
  $("dlgClose").addEventListener("click", function () { $("productDialog").close(); });
  $("dlgAdd").addEventListener("click", function () { if (activeProduct) addToCart(activeProduct.id); });
  $("productDialog").addEventListener("click", function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); }); // click on backdrop
  $("productDialog").addEventListener("close", function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeCart(); closeAccount(); } });
  $("checkout").addEventListener("click", function () {
    closeCart();
    var section = document.getElementById("features"); if (section) { section.scrollIntoView({ behavior: "smooth" }); var place = document.getElementById("mnPlaceOrder"); if (place) place.focus(); }
    else toast("Marketplace tools are still loading. Please try again.", true);
  });

  ["minPrice", "maxPrice"].forEach(function (id) { $(id).addEventListener("input", renderProducts); });
  $("clearFilters").addEventListener("click", function () {
    $("search").value = ""; $("minPrice").value = ""; $("maxPrice").value = ""; $("sort").value = "newest"; savedOnly = false; updateSavedUI(); setCategory("All");
  });
  $("savedToggle").addEventListener("click", function () { showSaved(!savedOnly); });
  $("viewSaved").addEventListener("click", function () { showSaved(true); });
  $("dlgSave").addEventListener("click", function () {
    if (!activeProduct) return;
    if (!currentUser) $("productDialog").close();
    toggleSaved(activeProduct.id);
  });
  $("dlgShare").addEventListener("click", function () {
    if (!activeProduct) return;
    var link = siteUrl() + "#product=" + activeProduct.id;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { toast("Link copied"); }, function () { window.prompt("Copy this link:", link); });
    else window.prompt("Copy this link:", link);
  });
  $("dlgMore").addEventListener("click", function () { // show everything by this seller
    if (!activeProduct) return;
    var seller = activeProduct.seller; $("productDialog").close();
    $("search").value = seller; setCategory("All"); $("products").scrollIntoView({ behavior: "smooth" });
  });

  renderCart();
  updateSavedUI();
  loadProducts();
  initialiseAuth();
})();
