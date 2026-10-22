// MarketNest seller-account learning build.
// Security boundary: Supabase Row Level Security (RLS), not this JavaScript, enforces product ownership.
const seedProducts = [
  {id:"sample-p1",name:"Wireless headphones",price:1499,category:"Electronics",seller:"SoundStreet",emoji:"🎧",badge:"SAMPLE"},
  {id:"sample-p2",name:"Minimal desk lamp",price:899,category:"Home",seller:"BrightNest",emoji:"💡",badge:"SAMPLE"},
  {id:"sample-p3",name:"Everyday backpack",price:1199,category:"Fashion",seller:"Trail & Town",emoji:"🎒",badge:"SAMPLE"},
  {id:"sample-p4",name:"Mechanical keyboard",price:2499,category:"Electronics",seller:"KeyCraft",emoji:"⌨️",badge:"SAMPLE"},
  {id:"sample-p5",name:"Ceramic coffee mug",price:349,category:"Home",seller:"Clay Corner",emoji:"☕",badge:"SAMPLE"},
  {id:"sample-p6",name:"Classic sneakers",price:1899,category:"Fashion",seller:"Stepwise",emoji:"👟",badge:"SAMPLE"},
  {id:"sample-p7",name:"Notebook set",price:299,category:"Books",seller:"Paper Trail",emoji:"📚",badge:"SAMPLE"},
  {id:"sample-p8",name:"Portable speaker",price:999,category:"Electronics",seller:"SoundStreet",emoji:"🔊",badge:"SAMPLE"}
];
const CART_KEY = "marketnest_demo_cart_v1";
const configured = window.MARKETNEST_SUPABASE_URL &&
  window.MARKETNEST_SUPABASE_ANON_KEY &&
  !window.MARKETNEST_SUPABASE_URL.includes("PASTE_YOUR") &&
  !window.MARKETNEST_SUPABASE_ANON_KEY.includes("PASTE_YOUR") &&
  window.supabase && window.supabase.createClient;
const db = configured ? window.supabase.createClient(
  window.MARKETNEST_SUPABASE_URL,
  window.MARKETNEST_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
) : null;

let products = [...seedProducts];
let cart = loadCart();
let currentUser = null;

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(saved) ? saved.filter(x => x && typeof x.id === "string" && Number.isInteger(x.qty) && x.qty > 0) : [];
  } catch { return []; }
}
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function money(n) { return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n); }
function safeText(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function showMessage(id, message, isError=false) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.toggle("error-message", isError);
}
function showToast(message) {
  const toast=document.getElementById("toast");
  toast.textContent=message;toast.classList.add("show");
  window.setTimeout(()=>toast.classList.remove("show"),2400);
}
function renderProducts() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const category = document.getElementById("category").value;
  const shown = products.filter(p => (category === "All" || p.category === category) &&
    [p.name,p.category,p.seller].some(v => String(v || "").toLowerCase().includes(query)));
  document.getElementById("resultInfo").textContent = `${shown.length} product${shown.length===1?"":"s"} · sample items plus published seller listings`;
  const grid = document.getElementById("productGrid");
  if (!shown.length) { grid.innerHTML = '<div class="empty">No products found. Try another search or category.</div>'; return; }
  grid.innerHTML = shown.map(p => `<article class="product-card">
    <div class="product-art"><span class="label">${safeText(p.badge || "SELLER PICK")}</span><span aria-hidden="true">${safeText(p.emoji || "📦")}</span></div>
    <p class="product-name">${safeText(p.name)}</p><p class="seller-name">Sold by ${safeText(p.seller || "MarketNest seller")} · ${safeText(p.category)}</p>
    <div class="price-row"><span class="price">${money(p.price)}</span><button class="add-btn" data-add="${safeText(p.id)}">＋ Add</button></div>
  </article>`).join("");
}
function renderCart() {
  const count = cart.reduce((sum,x)=>sum+x.qty,0);
  document.getElementById("cartCount").textContent = count;
  const container = document.getElementById("cartItems");
  if (!cart.length) container.innerHTML = '<div class="empty">Your cart is empty. Add a product to get started.</div>';
  else container.innerHTML = cart.map(item => {
    const p = products.find(product => product.id === item.id);
    if (!p) return "";
    return `<div class="cart-line"><div class="cart-emoji">${safeText(p.emoji||"📦")}</div><div><strong>${safeText(p.name)}</strong><small>${item.qty} × ${money(p.price)}</small><button class="remove-btn" data-remove="${safeText(p.id)}">Remove</button></div><strong>${money(p.price*item.qty)}</strong></div>`;
  }).join("");
  const total = cart.reduce((sum,item)=>{const p=products.find(x=>x.id===item.id);return sum+(p?p.price*item.qty:0)},0);
  document.getElementById("cartTotal").textContent = money(total);
}
function openCart() {
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden","false");
  document.getElementById("overlay").classList.add("show");
}
function closeCart() {
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden","true");
  document.getElementById("overlay").classList.remove("show");
}
async function loadPublishedProducts() {
  if (!db) {
    document.getElementById("resultInfo").textContent = "Setup needed: add your Supabase URL/key and run setup.sql. Showing sample products only.";
    renderProducts();
    return;
  }
  const { data, error } = await db.from("products")
    .select("id,name,price,category,seller_name,emoji,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    renderProducts();
    showMessage("accountStatus", "Database setup needed or connection failed. Check setup.sql and your Supabase config.", true);
    console.error("Could not load products:", error.message);
    return;
  }
  const remote = (data || []).map(p => ({
    id: p.id, name: p.name, price: Number(p.price), category: p.category,
    seller: p.seller_name || "MarketNest seller", emoji: p.emoji || "📦", badge: "SELLER LISTING"
  }));
  products = [...seedProducts, ...remote];
  renderProducts();
  renderCart();
}
function renderMyListings(rows) {
  const box = document.getElementById("myListings");
  if (!rows || !rows.length) {
    box.innerHTML = '<p class="small-muted">You have not published any listings yet.</p>';
    return;
  }
  box.innerHTML = rows.map(p => `<div class="my-listing">
    <div><strong>${safeText(p.name)}</strong><span>${money(Number(p.price))} · ${safeText(p.category)}</span></div>
    <button class="remove-listing" type="button" data-delete-listing="${safeText(p.id)}">Delete</button>
  </div>`).join("");
}
async function refreshMyListings() {
  if (!db || !currentUser) return;
  const { data, error } = await db.from("products")
    .select("id,name,price,category")
    .eq("seller_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) {
    showMessage("productMessage", "Could not load your listings. Check database setup.", true);
    console.error(error.message); return;
  }
  renderMyListings(data || []);
}
function setSignedInUI(user) {
  currentUser = user || null;
  const authPanel = document.getElementById("authPanel");
  const dashboard = document.getElementById("dashboard");
  authPanel.hidden = !!currentUser;
  dashboard.hidden = !currentUser;
  if (currentUser) {
    const shop = currentUser.user_metadata?.store_name || "Your shop";
    document.getElementById("welcomeSeller").textContent = shop;
    document.getElementById("sellerEmail").textContent = currentUser.email || "";
    refreshMyListings();
  }
}
async function initialiseAuth() {
  const status = document.getElementById("accountStatus");
  if (!db) {
    status.textContent = "Not connected yet — follow SETUP.md to connect a free Supabase project.";
    document.getElementById("authPanel").classList.add("not-configured");
    document.getElementById("signupForm").querySelector("button").disabled = true;
    document.getElementById("loginForm").querySelector("button").disabled = true;
    return;
  }
  status.textContent = "Connected to Supabase. Create an account or sign in.";
  const { data, error } = await db.auth.getSession();
  if (error) console.warn("Session check:", error.message);
  setSignedInUI(data?.session?.user || null);
  db.auth.onAuthStateChange((_event, session) => {
    setSignedInUI(session?.user || null);
  });
}
document.getElementById("signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!db) return;
  const form = e.currentTarget;
  const data = new FormData(form);
  const storeName = String(data.get("storeName") || "").trim();
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  if (storeName.length < 2) { showMessage("authMessage", "Shop name must have at least 2 characters.", true); return; }
  if (password.length < 8) { showMessage("authMessage", "Use at least 8 characters for the password.", true); return; }
  const button = form.querySelector("button");
  button.disabled = true; button.textContent = "Creating account…";
  const { data: result, error } = await db.auth.signUp({
    email, password, options: { data: { store_name: storeName } }
  });
  button.disabled = false; button.textContent = "Create seller account";
  if (error) { showMessage("authMessage", error.message, true); return; }
  form.reset();
  if (result.session) {
    showMessage("authMessage", "Account created and signed in. Your seller studio is ready.");
    setSignedInUI(result.user);
  } else {
    showMessage("authMessage", "Account request created. Check your email to confirm it, then return and sign in.");
  }
});
document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!db) return;
  const form = e.currentTarget;
  const data = new FormData(form);
  const button = form.querySelector("button");
  button.disabled = true; button.textContent = "Signing in…";
  const { data: result, error } = await db.auth.signInWithPassword({
    email: String(data.get("email") || "").trim(),
    password: String(data.get("password") || "")
  });
  button.disabled = false; button.textContent = "Sign in";
  if (error) { showMessage("authMessage", "Sign-in failed. Check your email/password and email confirmation setting.", true); return; }
  form.reset();
  showMessage("authMessage", "Signed in successfully.");
  setSignedInUI(result.user);
});
document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (!db) return;
  const { error } = await db.auth.signOut();
  if (error) { showMessage("productMessage", "Sign-out failed. Try again.", true); return; }
  setSignedInUI(null);
  showMessage("authMessage", "You are signed out.");
});
document.getElementById("productForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!db || !currentUser) { showMessage("productMessage", "Sign in before publishing.", true); return; }
  const form = e.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const price = Number(data.get("price"));
  const category = String(data.get("category") || "Home");
  const emoji = String(data.get("emoji") || "📦").trim().slice(0, 8) || "📦";
  if (name.length < 2 || !Number.isInteger(price) || price < 1 || price > 1000000) {
    showMessage("productMessage", "Enter a product name and a whole-number price between ₹1 and ₹10,00,000.", true); return;
  }
  const button = form.querySelector("button");
  button.disabled = true; button.textContent = "Publishing…";
  const { error } = await db.from("products").insert({
    seller_id: currentUser.id,
    name, price, category, emoji,
    seller_name: currentUser.user_metadata?.store_name || "MarketNest seller"
  });
  button.disabled = false; button.textContent = "＋ Publish listing";
  if (error) {
    showMessage("productMessage", "Listing was not saved. Check setup.sql and try again.", true);
    console.error("Publish failed:", error.message); return;
  }
  form.reset();
  form.elements.emoji.value = "📦";
  showMessage("productMessage", "Published! Your listing is saved in the shared database.");
  await loadPublishedProducts();
  await refreshMyListings();
});
document.getElementById("myListings").addEventListener("click", async e => {
  const button = e.target.closest("[data-delete-listing]");
  if (!button || !db || !currentUser) return;
  const id = button.dataset.deleteListing;
  if (!confirm("Delete this listing? This cannot be undone.")) return;
  button.disabled = true;
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) {
    showMessage("productMessage", "Could not delete this listing. Database security rules may have blocked it.", true);
    console.error(error.message); button.disabled = false; return;
  }
  showMessage("productMessage", "Listing deleted.");
  await loadPublishedProducts();
  await refreshMyListings();
});
document.getElementById("productGrid").addEventListener("click", e => {
  const button = e.target.closest("[data-add]");
  if (!button) return;
  const id = button.dataset.add;
  const p = products.find(x => x.id === id);
  if (!p) return;
  const existing = cart.find(x => x.id === id);
  if (existing) existing.qty = Math.min(existing.qty + 1, 99); else cart.push({id,qty:1});
  saveCart(); renderCart(); showToast(`${p.name} added to demo cart`);
});
document.getElementById("cartItems").addEventListener("click", e => {
  const button = e.target.closest("[data-remove]");
  if (!button) return;
  cart = cart.filter(x => x.id !== button.dataset.remove);
  saveCart(); renderCart();
});
document.getElementById("search").addEventListener("input", renderProducts);
document.getElementById("searchBtn").addEventListener("click", renderProducts);
document.getElementById("category").addEventListener("change", renderProducts);
document.getElementById("cartToggle").addEventListener("click", openCart);
document.getElementById("closeCart").addEventListener("click", closeCart);
document.getElementById("overlay").addEventListener("click", closeCart);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeCart(); });
document.getElementById("checkout").addEventListener("click", () => {
  if (!cart.length) { showToast("Add a product first"); return; }
  alert("Demo only. No order or payment was created. Real checkout requires a secure server-side order flow and payment-provider integration.");
});

renderProducts();
renderCart();
loadPublishedProducts();
initialiseAuth();
