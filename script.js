"use strict";

const STORAGE_KEYS = Object.freeze({
  products: "sipstation_products_v1",
  transactions: "sipstation_transactions_v1",
  settings: "sipstation_settings_v1",
  meta: "sipstation_meta_v1"
});

const CATEGORIES = ["Coffee", "Tea", "Milk Tea", "Matcha", "Non-Coffee"];
const SUGAR_LEVELS = ["0%", "25%", "50%", "75%", "100%"];
const ICE_LEVELS = ["No Ice", "Less Ice", "Normal"];
const TOPPINGS = ["Pearl", "Jelly", "Cheese Foam"];
const PAYMENT_METHODS = Object.freeze({ cash: "Tunai", qris: "QRIS", debit: "Debit" });
const LOW_STOCK_THRESHOLD = 5;

const PAGE_META = Object.freeze({
  dashboard: { title: "Dashboard", kicker: "Ringkasan bisnis" },
  kasir: { title: "Kasir", kicker: "Buat pesanan pelanggan" },
  menu: { title: "Menu Minuman", kicker: "Kelola produk & stok" },
  riwayat: { title: "Riwayat Transaksi", kicker: "Arsip pembayaran" },
  laporan: { title: "Laporan Penjualan", kicker: "Analisis performa" },
  pengaturan: { title: "Pengaturan", kicker: "Profil & preferensi" }
});

const DEFAULT_SETTINGS = Object.freeze({
  shopName: "SipStation",
  cashierName: "Ayu",
  address: "Jl. Melati Raya No. 12, Bandung",
  contact: "0812 3456 7890",
  largeFee: 3000,
  toppings: Object.freeze({ Pearl: 3000, Jelly: 2500, "Cheese Foam": 5000 })
});

const STORAGE_ERROR_TITLE = "Penyimpanan tidak tersedia";
const STORAGE_ERROR_MESSAGE = "Data mungkin tidak tersimpan permanen. Periksa pengaturan browser Anda.";

/* Utilities */
function uid(prefix = "id") {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[character];
  });
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function nonNegativeInt(value, fallback = 0) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  return `Rp${new Intl.NumberFormat("id-ID").format(amount)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Math.max(0, Math.round(Number(value) || 0)));
}

function shortRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  if (amount >= 1000000) {
    return `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(amount / 1000000)}jt`;
  }
  if (amount >= 1000) {
    const ribuan = amount / 1000;
    return `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: ribuan < 100 ? 1 : 0 }).format(ribuan)}rb`;
  }
  return `Rp${amount}`;
}

function todayKey() {
  return dateToKey(new Date());
}

function dateToKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyToDate(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function isValidDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key)) && !Number.isNaN(dateKeyToDate(key).getTime());
}

function shiftDateKey(key, days) {
  const date = dateKeyToDate(key);
  date.setDate(date.getDate() + days);
  return dateToKey(date);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatLongDateKey(key) {
  return formatLongDate(dateKeyToDate(key));
}

function formatShortDateKey(key, includeYear = false) {
  const options = { day: "numeric", month: "short" };
  if (includeYear) options.year = "numeric";
  return new Intl.DateTimeFormat("id-ID", options).format(dateKeyToDate(key));
}

function formatDateShortWithDay(key) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(dateKeyToDate(key));
}

function dayNameShort(key) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(dateKeyToDate(key));
}

function formatTime(isoOrDate) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${formatShortDateKey(dateToKey(date), true)} · ${formatTime(date)}`;
}

function formatDateRange(from, to) {
  if (from === to) return formatLongDateKey(from);
  return `${formatShortDateKey(from, true)} – ${formatShortDateKey(to, true)}`;
}

function capitalizeFirst(value) {
  const text = String(value ?? "").trim();
  return text ? text.charAt(0).toUpperCase() : "?";
}

function safeImageUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (/^(https?:\/\/|data:image\/)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return "";
  return url;
}

function receiptCustomizationText(item) {
  const parts = [item.size || "Regular", `Gula ${item.sugar || "50%"}`, `Es ${item.ice || "Normal"}`];
  if (Array.isArray(item.toppings) && item.toppings.length > 0) {
    parts.push(item.toppings.map((topping) => typeof topping === "string" ? topping : topping.name).join(", "));
  }
  return parts.join(" · ");
}

function productVariantText(line) {
  return receiptCustomizationText(line);
}

/* Icons */
function icon(name, extraClass = "") {
  return `<svg class="icon ${extraClass}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

/* Storage */
function readRaw(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return clone(fallback);
    return JSON.parse(raw);
  } catch {
    return clone(fallback);
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showToast("error", STORAGE_ERROR_TITLE, STORAGE_ERROR_MESSAGE);
    return false;
  }
}

function removeStored(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Data tetap tersedia di memori selama sesi berjalan.
  }
}

function markInitialized(extra = {}) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.meta, JSON.stringify({
      initialized: true,
      version: 1,
      updatedAt: new Date().toISOString(),
      ...extra
    }));
  } catch {
    // Tidak memblokir penggunaan aplikasi.
  }
}

function buildDemoProducts() {
  const now = new Date().toISOString();
  return [
    {
      id: "prd_demo_es_teh_lemon",
      name: "Es Teh Lemon",
      category: "Tea",
      price: 12000,
      stock: 24,
      description: "Teh hitam segar dengan perasan lemon asli.",
      image: "assets/es-teh-lemon.svg",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prd_demo_original_milk_tea",
      name: "Original Milk Tea",
      category: "Milk Tea",
      price: 15000,
      stock: 18,
      description: "Milk tea klasik dengan boba kenyal.",
      image: "assets/original-milk-tea.svg",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prd_demo_brown_sugar_milk",
      name: "Brown Sugar Milk",
      category: "Milk Tea",
      price: 18000,
      stock: 16,
      description: "Susu creamy dengan brown sugar dan boba.",
      image: "assets/brown-sugar-milk.svg",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prd_demo_matcha_latte",
      name: "Matcha Latte",
      category: "Matcha",
      price: 20000,
      stock: 14,
      description: "Matcha lembut berpadu susu segar.",
      image: "assets/matcha-latte.svg",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prd_demo_caramel_latte",
      name: "Caramel Latte",
      category: "Coffee",
      price: 22000,
      stock: 15,
      description: "Espresso, susu, dan saus karamel manis.",
      image: "assets/caramel-latte.svg",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prd_demo_americano",
      name: "Americano",
      category: "Coffee",
      price: 15000,
      stock: 20,
      description: "Espresso dan air dingin dengan aroma kuat.",
      image: "assets/americano.svg",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prd_demo_chocolate_milk",
      name: "Chocolate Milk",
      category: "Non-Coffee",
      price: 17000,
      stock: 12,
      description: "Cokelat pekat dipadukan susu creamy.",
      image: "assets/chocolate-milk.svg",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prd_demo_strawberry_yakult",
      name: "Strawberry Yakult",
      category: "Non-Coffee",
      price: 18000,
      stock: 10,
      description: "Stroberi segar, yakult, dan soda dingin.",
      image: "assets/strawberry-yakult.svg",
      createdAt: now,
      updatedAt: now
    }
  ];
}

function normalizeSettings(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const savedToppings = saved.toppings && typeof saved.toppings === "object" ? saved.toppings : {};
  const toppings = {};
  for (const name of TOPPINGS) {
    toppings[name] = nonNegativeInt(savedToppings[name], DEFAULT_SETTINGS.toppings[name]);
  }
  return {
    shopName: String(saved.shopName || DEFAULT_SETTINGS.shopName).trim().slice(0, 50) || DEFAULT_SETTINGS.shopName,
    cashierName: String(saved.cashierName || DEFAULT_SETTINGS.cashierName).trim().slice(0, 40) || DEFAULT_SETTINGS.cashierName,
    address: String(saved.address || DEFAULT_SETTINGS.address).trim().slice(0, 180) || DEFAULT_SETTINGS.address,
    contact: String(saved.contact || "").trim().slice(0, 30),
    largeFee: nonNegativeInt(saved.largeFee, DEFAULT_SETTINGS.largeFee),
    toppings
  };
}

function normalizeProducts(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map((item) => {
    if (!item || typeof item !== "object") return null;
    const name = String(item.name || "").trim();
    const price = numberValue(item.price, 0);
    if (!name || price <= 0) return null;
    const id = String(item.id || uid("prd"));
    if (seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name: name.slice(0, 80),
      category: CATEGORIES.includes(item.category) ? item.category : "Non-Coffee",
      price,
      stock: nonNegativeInt(item.stock, 0),
      description: String(item.description || "").trim().slice(0, 180),
      image: safeImageUrl(item.image),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString()
    };
  }).filter(Boolean);
}

function normalizeTransactionItem(item) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name || "").trim();
  const qty = nonNegativeInt(item.qty, 0);
  if (!name || qty <= 0) return null;
  const unitPrice = Math.max(0, numberValue(item.unitPrice, 0));
  const toppings = Array.isArray(item.toppings)
    ? item.toppings.map((topping) => {
        if (typeof topping === "string") return { name: topping, price: 0 };
        return {
          name: String(topping?.name || "").trim(),
          price: nonNegativeInt(topping?.price, 0)
        };
      }).filter((topping) => topping.name)
    : [];
  return {
    productId: String(item.productId || ""),
    name: name.slice(0, 80),
    category: CATEGORIES.includes(item.category) ? item.category : "Lainnya",
    image: safeImageUrl(item.image),
    size: String(item.size || "Regular"),
    sugar: String(item.sugar || "50%"),
    ice: String(item.ice || "Normal"),
    toppings,
    basePrice: Math.max(0, numberValue(item.basePrice, unitPrice)),
    sizeFee: Math.max(0, numberValue(item.sizeFee, 0)),
    unitPrice,
    qty,
    lineTotal: Math.max(0, numberValue(item.lineTotal, unitPrice * qty))
  };
}

function normalizeTransactions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") return null;
    const items = Array.isArray(item.items) ? item.items.map(normalizeTransactionItem).filter(Boolean) : [];
    if (items.length === 0) return null;
    const created = new Date(item.createdAt);
    if (Number.isNaN(created.getTime())) return null;
    let id = String(item.id || uid("trx"));
    if (seen.has(id)) id = uid("trx");
    seen.add(id);
    const dateKey = isValidDateKey(item.dateKey) ? item.dateKey : dateToKey(created);
    const subtotal = Math.max(0, numberValue(
      item.subtotal,
      items.reduce((total, line) => total + line.lineTotal, 0)
    ));
    const discount = Math.min(subtotal, Math.max(0, numberValue(item.discount, 0)));
    const total = Math.max(0, numberValue(item.total, subtotal - discount));
    const paid = Math.max(0, numberValue(item.paid, total));
    const status = item.status === "cancelled" ? "cancelled" : "completed";
    return {
      id,
      number: String(item.number || `TRX-LAMA-${index + 1}`),
      createdAt: created.toISOString(),
      dateKey,
      cashierName: String(item.cashierName || "Kasir").slice(0, 40),
      items,
      subtotal,
      discount,
      total,
      paymentMethod: Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, item.paymentMethod) ? item.paymentMethod : "cash",
      paid,
      change: Math.max(0, numberValue(item.change, paid - total)),
      status,
      cancelledAt: status === "cancelled" ? (item.cancelledAt || created.toISOString()) : null,
      stockRestored: Boolean(item.stockRestored)
    };
  }).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* Application state */
const state = {
  page: "dashboard",
  products: [],
  transactions: [],
  settings: normalizeSettings({}),
  cart: [],
  cartDiscount: 0,
  paymentMethod: "cash",
  paymentPaidInput: "",
  isProcessing: false,
  posFilter: { search: "", category: "all" },
  menuFilter: { search: "", category: "all" },
  historyFilter: { search: "", date: "", method: "all" },
  report: {
    range: "today",
    from: shiftDateKey(todayKey(), -6),
    to: todayKey()
  }
};

function initializeData() {
  const metaRaw = readRaw(STORAGE_KEYS.meta);
  const hasData = [
    STORAGE_KEYS.products,
    STORAGE_KEYS.transactions,
    STORAGE_KEYS.settings
  ].some((key) => readRaw(key) !== null);

  if (!metaRaw && !hasData) {
    state.products = buildDemoProducts();
    state.transactions = [];
    state.settings = normalizeSettings({});
    writeStored(STORAGE_KEYS.products, state.products);
    writeStored(STORAGE_KEYS.transactions, state.transactions);
    writeStored(STORAGE_KEYS.settings, state.settings);
    markInitialized({ seededWithDemo: true });
    return;
  }

  state.products = normalizeProducts(readStored(STORAGE_KEYS.products, []));
  state.transactions = normalizeTransactions(readStored(STORAGE_KEYS.transactions, []));
  state.settings = normalizeSettings(readStored(STORAGE_KEYS.settings, {}));
  if (!metaRaw) markInitialized({ seededWithDemo: false });
}

/* Modal manager */
const modalRoot = document.getElementById("modalRoot");
let activeModal = {
  lastFocused: null,
  onClose: null,
  dismissible: true
};

function focusableElements(container) {
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function openModal({ title, subtitle = "", body = "", footer = "", size = "", dismissible = true, onMount = null, onClose = null, bodyClass = "" }) {
  if (modalRoot.firstElementChild) closeModal({ skipFocus: true });
  activeModal.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeModal.onClose = onClose;
  activeModal.dismissible = dismissible;

  const titleId = "modalTitle";
  modalRoot.innerHTML = `
    <div class="modal-overlay" data-modal-overlay>
      <div class="modal-card ${size ? `modal-${size}` : ""}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <header class="modal-header">
          <div>
            <h2 id="${titleId}">${escapeHtml(title)}</h2>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          <button type="button" class="modal-close" data-modal-close aria-label="Tutup dialog">${icon("x")}</button>
        </header>
        <div class="modal-body ${bodyClass}">${body}</div>
        ${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}
      </div>
    </div>
  `;
  document.body.classList.add("modal-open");
  modalRoot.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.addEventListener("click", () => closeModal());
  });
  const overlay = modalRoot.querySelector("[data-modal-overlay]");
  if (dismissible) {
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) closeModal();
    });
  }
  const card = modalRoot.querySelector(".modal-card");
  requestAnimationFrame(() => {
    const preferred = card.querySelector("[data-autofocus]");
    if (preferred) {
      preferred.focus();
      if (typeof preferred.select === "function" && preferred.tagName === "INPUT") preferred.select();
    } else {
      card.focus();
    }
  });
  if (typeof onMount === "function") onMount(card);
}

function closeModal(options = {}) {
  const hadModal = Boolean(modalRoot.firstElementChild);
  const onClose = activeModal.onClose;
  const lastFocused = activeModal.lastFocused;
  modalRoot.innerHTML = "";
  document.body.classList.remove("modal-open");
  activeModal = { lastFocused: null, onClose: null, dismissible: true };
  if (hadModal && typeof onClose === "function") onClose();
  if (!options.skipFocus && lastFocused && lastFocused.isConnected) {
    lastFocused.focus();
  }
}

document.addEventListener("keydown", (event) => {
  if (!modalRoot.firstElementChild) return;
  if (event.key === "Escape" && activeModal.dismissible) {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const card = modalRoot.querySelector(".modal-card");
  if (!card) return;
  const focusable = focusableElements(card);
  if (focusable.length === 0) {
    event.preventDefault();
    card.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = document.activeElement;
  if (event.shiftKey && (current === first || current === card)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
});

/* Toasts */
const toastStack = document.getElementById("toastStack");

function showToast(type, title, message = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const iconName = type === "success" ? "check-circle" : type === "error" ? "alert" : "info";
  toast.innerHTML = `
    <span class="toast-icon">${icon(iconName)}</span>
    <div class="toast-copy">
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<p>${escapeHtml(message)}</p>` : ""}
    </div>
    <button type="button" class="toast-close" data-toast-close aria-label="Tutup notifikasi">${icon("x")}</button>
  `;
  toastStack.appendChild(toast);
  const timeout = window.setTimeout(() => dismissToast(toast), type === "error" ? 5200 : 3600);
  toast.dataset.timeout = String(timeout);
}

function dismissToast(toast) {
  if (!toast || !toast.isConnected) return;
  const timeout = Number(toast.dataset.timeout || 0);
  if (timeout) window.clearTimeout(timeout);
  toast.classList.add("is-leaving");
  window.setTimeout(() => toast.remove(), 190);
}

document.addEventListener("click", (event) => {
  const toastClose = event.target.closest("[data-toast-close]");
  if (toastClose) {
    dismissToast(toastClose.closest(".toast"));
  }
});

/* Shared UI builders */
function emptyState(iconName, title, text, action = "", compact = false) {
  return `
    <div class="empty-state ${compact ? "compact" : ""}">
      <span class="empty-icon">${icon(iconName)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${action}
    </div>
  `;
}

function imageMarkup(product, alt = "", className = "") {
  const image = safeImageUrl(product.image);
  if (image) {
    return `<img src="${escapeHtml(image)}" alt="${escapeHtml(alt || product.name)}" loading="lazy" data-drink-image class="${escapeHtml(className)}">`;
  }
  return `<span class="product-fallback ${escapeHtml(className)}">${icon("cup")}</span>`;
}

function statusBadge(status) {
  if (status === "cancelled") return `<span class="status-badge status-danger">Dibatalkan</span>`;
  return `<span class="status-badge status-success">Selesai</span>`;
}

function paymentIcon(method) {
  if (method === "qris") return icon("qr");
  if (method === "debit") return icon("card");
  return icon("banknote");
}

function getProduct(productId) {
  return state.products.find((product) => product.id === productId) || null;
}

function getToppingPrice(name) {
  return nonNegativeInt(state.settings.toppings?.[name], 0);
}

function lineUnitPrice(line) {
  const product = getProduct(line.productId);
  if (!product) return 0;
  const sizeFee = line.size === "Large" ? nonNegativeInt(state.settings.largeFee, 0) : 0;
  const toppingFee = (line.toppings || []).reduce((total, topping) => total + getToppingPrice(topping), 0);
  return Math.max(0, product.price) + sizeFee + toppingFee;
}

function cartSubtotal() {
  return state.cart.reduce((total, line) => total + lineUnitPrice(line) * line.qty, 0);
}

function cartItemCount() {
  return state.cart.reduce((total, line) => total + line.qty, 0);
}

function cartQtyForProduct(productId) {
  return state.cart
    .filter((line) => line.productId === productId)
    .reduce((total, line) => total + line.qty, 0);
}

function cartDiscountValue() {
  return Math.min(Math.max(0, state.cartDiscount), cartSubtotal());
}

function cartTotal() {
  return Math.max(0, cartSubtotal() - cartDiscountValue());
}

function paymentPaid() {
  if (state.paymentMethod !== "cash") return cartTotal();
  const raw = String(state.paymentPaidInput ?? "").trim();
  if (!raw) return 0;
  return nonNegativeInt(raw, 0);
}

function paymentChange() {
  return Math.max(0, paymentPaid() - cartTotal());
}

function isCashShort() {
  const hasEnteredPayment = String(state.paymentPaidInput ?? "").trim() !== "";
  return state.paymentMethod === "cash"
    && state.cart.length > 0
    && hasEnteredPayment
    && paymentPaid() < cartTotal();
}

function makeLineKey(productId, customization) {
  const toppings = [...(customization.toppings || [])].sort().join("|");
  return [productId, customization.size, customization.sugar, customization.ice, toppings].join("::");
}

function updateCartBadges() {
  const count = cartItemCount();
  document.querySelectorAll(".nav-badge, .mobile-cart-badge").forEach((badge) => {
    badge.textContent = String(count);
    badge.hidden = count <= 0;
  });
}

/* Routing and branding */
function updateHeaderDate() {
  const element = document.getElementById("headerDate");
  if (!element) return;
  const compact = window.matchMedia("(max-width: 620px)").matches;
  element.textContent = compact
    ? new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())
    : formatLongDate(new Date());
}

function updateBranding() {
  const settings = state.settings;
  const cashier = settings.cashierName || "Kasir";
  const shop = settings.shopName || "SipStation";
  const cashierNameElement = document.getElementById("topbarCashierName");
  const cashierAvatar = document.getElementById("cashierAvatar");
  const welcomeCashier = document.getElementById("welcomeCashierName");
  const welcomeShop = document.getElementById("welcomeShopName");
  if (cashierNameElement) cashierNameElement.textContent = cashier;
  if (cashierAvatar) cashierAvatar.textContent = capitalizeFirst(cashier);
  if (welcomeCashier) welcomeCashier.textContent = cashier;
  if (welcomeShop) welcomeShop.textContent = shop;
  updateHeaderDate();
  updateCartBadges();
}

function updateActiveNavigation(page) {
  document.querySelectorAll(".nav-link[data-nav-page], .mobile-nav-link[data-nav-page]").forEach((link) => {
    const active = link.dataset.navPage === page;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function renderPage(page) {
  const targetPage = PAGE_META[page] ? page : "dashboard";
  const meta = PAGE_META[targetPage];
  const changed = state.page !== targetPage;
  state.page = targetPage;

  document.querySelectorAll(".page").forEach((section) => {
    section.hidden = section.dataset.pageSection !== targetPage;
  });
  updateActiveNavigation(targetPage);

  const pageTitle = document.getElementById("pageTitle");
  const kicker = document.getElementById("pageKicker");
  if (pageTitle) pageTitle.textContent = meta.title;
  if (kicker) kicker.textContent = meta.kicker;
  document.title = `${meta.title} · ${state.settings.shopName || "SipStation"}`;

  updateBranding();
  if (targetPage === "dashboard") renderDashboard();
  if (targetPage === "kasir") renderPOS();
  if (targetPage === "menu") renderMenu();
  if (targetPage === "riwayat") renderHistory();
  if (targetPage === "laporan") renderReports();
  if (targetPage === "pengaturan") populateSettingsForm();

  if (changed) window.scrollTo({ top: 0, behavior: "auto" });
}

function navigateTo(page) {
  const targetPage = PAGE_META[page] ? page : "dashboard";
  if (window.location.hash === `#${targetPage}`) {
    renderPage(targetPage);
    return;
  }
  window.location.hash = targetPage;
}

function handleRoute() {
  const requested = window.location.hash.replace(/^#/, "");
  if (PAGE_META[requested]) {
    renderPage(requested);
  } else {
    window.history.replaceState(null, "", "#dashboard");
    renderPage("dashboard");
  }
}

/* Confirmation modal */
function openConfirm({
  title,
  subtitle = "",
  message,
  details = "",
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  tone = "danger",
  iconName = "alert",
  onConfirm
}) {
  openModal({
    title,
    subtitle,
    size: "small",
    body: `
      <div class="confirm-center">
        <span class="confirm-icon-box ${tone === "danger" ? "danger" : "green"}">${icon(iconName)}</span>
        <p class="confirm-message">${message}</p>
        ${details}
      </div>
    `,
    footer: `
      <button type="button" class="btn btn-secondary" data-modal-close>${escapeHtml(cancelLabel)}</button>
      <button type="button" class="btn ${tone === "danger" ? "btn-danger" : "btn-primary"}" id="confirmActionButton">${escapeHtml(confirmLabel)}</button>
    `,
    onMount(card) {
      const confirmButton = card.querySelector("#confirmActionButton");
      if (!confirmButton) return;
      confirmButton.addEventListener("click", async () => {
        if (confirmButton.disabled) return;
        confirmButton.disabled = true;
        const originalLabel = confirmButton.innerHTML;
        confirmButton.textContent = "Memproses...";
        try {
          const result = onConfirm ? await onConfirm() : undefined;
          if (result === false) {
            if (confirmButton.isConnected) {
              confirmButton.disabled = false;
              confirmButton.innerHTML = originalLabel;
            }
            return;
          }
          closeModal();
        } catch (error) {
          console.error(error);
          showToast("error", "Tindakan gagal", "Silakan coba lagi.");
          if (confirmButton.isConnected) {
            confirmButton.disabled = false;
            confirmButton.innerHTML = originalLabel;
          }
        }
      });
    }
  });
}

/* Dashboard */
function renderDashboard() {
  const todayTransactions = state.transactions.filter(
    (transaction) => transaction.status === "completed" && transaction.dateKey === todayKey()
  );
  const todayRevenue = todayTransactions.reduce((total, transaction) => total + transaction.total, 0);
  const todayItems = todayTransactions.reduce(
    (total, transaction) => total + transaction.items.reduce((sum, item) => sum + item.qty, 0),
    0
  );
  const lowStockProducts = state.products.filter((product) => product.stock <= LOW_STOCK_THRESHOLD);

  const revenueElement = document.getElementById("dashRevenue");
  if (revenueElement) revenueElement.textContent = formatRupiah(todayRevenue);
  const revenueFoot = document.getElementById("dashRevenueFoot");
  if (revenueFoot) {
    revenueFoot.textContent = todayTransactions.length
      ? `Dari ${formatNumber(todayTransactions.length)} transaksi berhasil`
      : "Belum ada transaksi berhasil.";
  }
  const transactionCount = document.getElementById("dashTransactionCount");
  if (transactionCount) transactionCount.textContent = formatNumber(todayTransactions.length);
  const transactionFoot = document.getElementById("dashTransactionFoot");
  if (transactionFoot) {
    transactionFoot.textContent = todayTransactions.length
      ? "Transaksi berhasil hari ini"
      : "Transaksi berhasil hari ini";
  }
  const itemCount = document.getElementById("dashItemCount");
  if (itemCount) itemCount.textContent = formatNumber(todayItems);
  const itemFoot = document.getElementById("dashItemFoot");
  if (itemFoot) itemFoot.textContent = todayItems ? "Total item minuman hari ini" : "Belum ada item terjual.";
  const lowStockElement = document.getElementById("dashLowStock");
  if (lowStockElement) lowStockElement.textContent = formatNumber(lowStockProducts.length);
  const lowStockFoot = document.getElementById("dashLowStockFoot");
  if (lowStockFoot) {
    lowStockFoot.textContent = lowStockProducts.length
      ? "Perlu segera diisi ulang"
      : `Produk dengan stok ${LOW_STOCK_THRESHOLD} atau kurang`;
  }

  renderWeeklyChart();
  renderDashboardTopProducts();
  renderDashboardRecentTransactions();
}

function renderWeeklyChart() {
  const chart = document.getElementById("weeklyChart");
  const chartTotal = document.getElementById("weeklyChartTotal");
  if (!chart) return;

  const today = todayKey();
  const days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const dateKey = shiftDateKey(today, -index);
    const revenue = state.transactions
      .filter((transaction) => transaction.status === "completed" && transaction.dateKey === dateKey)
      .reduce((total, transaction) => total + transaction.total, 0);
    days.push({ dateKey, revenue });
  }
  const total = days.reduce((sum, day) => sum + day.revenue, 0);
  if (chartTotal) chartTotal.textContent = `Total ${formatRupiah(total)}`;

  if (total === 0) {
    chart.innerHTML = emptyState(
      "chart",
      "Belum ada penjualan",
      "Grafik akan muncul setelah transaksi pertama berhasil diproses.",
      `<button class="btn btn-small btn-primary" type="button" data-nav-page="kasir">${icon("cart")} Buka Kasir</button>`,
      true
    );
    return;
  }

  const maximum = Math.max(...days.map((day) => day.revenue), 1);
  chart.innerHTML = `
    <div class="bar-chart" role="img" aria-label="Grafik penjualan tujuh hari terakhir dengan total ${escapeHtml(formatRupiah(total))}">
      <div class="chart-gridlines" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="chart-cols">
        ${days.map((day) => {
          const height = day.revenue === 0 ? 0 : Math.max(7, Math.round((day.revenue / maximum) * 100));
          const date = dateKeyToDate(day.dateKey);
          const label = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit" }).format(date);
          return `
            <div class="chart-col" title="${escapeHtml(`${dayNameShort(day.dateKey)} ${formatShortDateKey(day.dateKey, true)}: ${formatRupiah(day.revenue)}`)}">
              <span class="chart-value">${day.revenue > 0 ? escapeHtml(shortRupiah(day.revenue)) : ""}</span>
              <div class="chart-track">
                <div class="chart-bar ${day.revenue === 0 ? "is-empty" : ""}" style="height:${day.revenue === 0 ? "3px" : `${height}%`}"></div>
              </div>
              <span class="chart-label"><strong>${escapeHtml(dayNameShort(day.dateKey))}</strong><span>${escapeHtml(label)}</span></span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderDashboardTopProducts() {
  const container = document.getElementById("topProducts");
  if (!container) return;
  const today = todayKey();
  const start = shiftDateKey(today, -6);
  const sales = new Map();

  state.transactions
    .filter((transaction) => transaction.status === "completed" && transaction.dateKey >= start && transaction.dateKey <= today)
    .forEach((transaction) => {
      transaction.items.forEach((item) => {
        const key = item.productId || item.name;
        const existing = sales.get(key) || {
          key,
          productId: item.productId,
          name: item.name,
          image: item.image,
          qty: 0,
          revenue: 0
        };
        existing.name = item.name || existing.name;
        existing.image = item.image || existing.image;
        existing.qty += item.qty;
        existing.revenue += item.lineTotal;
        sales.set(key, existing);
      });
    });

  const ranked = [...sales.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
  if (ranked.length === 0) {
    container.innerHTML = emptyState(
      "flame",
      "Belum ada produk terlaris",
      "Produk terlaris akan muncul setelah ada transaksi.",
      "",
      true
    );
    return;
  }

  container.innerHTML = `
    <div class="top-product-list">
      ${ranked.map((product, index) => {
        const currentProduct = getProduct(product.productId) || { name: product.name, image: product.image };
        return `
          <div class="top-product-item">
            <span class="top-product-rank">${index + 1}</span>
            <span class="top-product-thumb">${imageMarkup(currentProduct, product.name)}</span>
            <div class="top-product-copy">
              <strong>${escapeHtml(product.name)}</strong>
              <span>${formatNumber(product.qty)} terjual</span>
            </div>
            <span class="top-product-revenue">${escapeHtml(formatRupiah(product.revenue))}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDashboardRecentTransactions() {
  const container = document.getElementById("recentTransactions");
  if (!container) return;
  const recent = [...state.transactions]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = emptyState(
      "receipt",
      "Belum ada transaksi",
      "Transaksi yang berhasil diproses akan tampil di sini.",
      `<button class="btn btn-small btn-primary" type="button" data-nav-page="kasir">${icon("cart")} Mulai Transaksi</button>`,
      true
    );
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table responsive-table">
        <thead>
          <tr>
            <th scope="col">Transaksi</th>
            <th scope="col">Item</th>
            <th scope="col">Metode</th>
            <th scope="col">Total</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody>
          ${recent.map((transaction) => {
            const itemCount = transaction.items.reduce((total, item) => total + item.qty, 0);
            const itemNames = transaction.items.map((item) => item.name).join(", ");
            return `
              <tr>
                <td data-label="Transaksi">
                  <span class="table-id">${escapeHtml(transaction.number)}</span>
                  <span class="table-subcopy">${escapeHtml(formatDateTime(transaction.createdAt))}</span>
                </td>
                <td data-label="Item">
                  <span class="table-items-copy">${escapeHtml(itemNames)}</span>
                  <span class="table-subcopy">${formatNumber(itemCount)} item</span>
                </td>
                <td data-label="Metode"><span class="tag">${escapeHtml(PAYMENT_METHODS[transaction.paymentMethod])}</span></td>
                <td data-label="Total"><span class="money">${escapeHtml(formatRupiah(transaction.total))}</span></td>
                <td data-label="Status">${statusBadge(transaction.status)}</td>
                <td data-label="">
                  <button class="icon-button" type="button" data-action="view-transaction" data-id="${escapeHtml(transaction.id)}" aria-label="Lihat detail transaksi ${escapeHtml(transaction.number)}">${icon("receipt")}</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* Point of sale */
function renderPOS() {
  const searchInput = document.getElementById("posSearch");
  if (searchInput && searchInput.value !== state.posFilter.search) {
    searchInput.value = state.posFilter.search;
  }
  updateSearchClearButton("posSearch", "clear-pos-search");
  renderPOSCategories();
  renderPOSProducts();
  renderCart();
}

function updateSearchClearButton(inputId, actionName) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const button = document.querySelector(`[data-action="${actionName}"]`);
  if (button) button.hidden = !input.value.trim();
}

function renderPOSCategories() {
  const container = document.getElementById("posCategories");
  if (!container) return;
  const allCount = state.products.length;
  const buttons = [
    `<button type="button" class="category-chip ${state.posFilter.category === "all" ? "active" : ""}" data-action="filter-pos-category" data-category="all" aria-pressed="${state.posFilter.category === "all"}">Semua <span>${formatNumber(allCount)}</span></button>`,
    ...CATEGORIES.map((category) => {
      const count = state.products.filter((product) => product.category === category).length;
      const active = state.posFilter.category === category;
      return `<button type="button" class="category-chip ${active ? "active" : ""}" data-action="filter-pos-category" data-category="${escapeHtml(category)}" aria-pressed="${active}">${escapeHtml(category)} <span>${formatNumber(count)}</span></button>`;
    })
  ];
  container.innerHTML = buttons.join("");
}

function renderPOSProducts() {
  const grid = document.getElementById("posProductGrid");
  const resultCount = document.getElementById("posResultCount");
  const catalogSummary = document.getElementById("posCatalogSummary");
  if (!grid) return;

  const search = state.posFilter.search.trim().toLowerCase();
  const category = state.posFilter.category;
  const filtered = state.products.filter((product) => {
    const matchesSearch = !search || product.name.toLowerCase().includes(search);
    const matchesCategory = category === "all" || product.category === category;
    return matchesSearch && matchesCategory;
  });

  if (resultCount) {
    resultCount.textContent = search || category !== "all"
      ? `${formatNumber(filtered.length)} produk ditemukan`
      : `Menampilkan ${formatNumber(filtered.length)} produk`;
  }
  if (catalogSummary) {
    const availableCount = state.products.filter((product) => product.stock > 0).length;
    catalogSummary.textContent = `${formatNumber(availableCount)} produk tersedia`;
  }

  if (filtered.length === 0) {
    const hasFilter = search || category !== "all";
    grid.innerHTML = emptyState(
      "search",
      hasFilter ? "Menu tidak ditemukan" : "Belum ada menu",
      hasFilter
        ? "Coba kata kunci lain atau ubah filter kategori."
        : "Tambahkan menu minuman terlebih dahulu melalui halaman Menu Minuman.",
      hasFilter
        ? `<button class="btn btn-small btn-secondary" type="button" data-action="reset-pos-filter">Reset Filter</button>`
        : `<button class="btn btn-small btn-primary" type="button" data-nav-page="menu">${icon("plus")} Tambah Menu</button>`
    );
    grid.querySelector(".empty-state")?.classList.add("empty-state-grid");
    return;
  }

  grid.innerHTML = filtered.map((product) => {
    const isAvailable = product.stock > 0;
    const stockClass = !isAvailable ? "out" : product.stock <= LOW_STOCK_THRESHOLD ? "low" : "";
    const stockLabel = !isAvailable
      ? "Habis"
      : product.stock <= LOW_STOCK_THRESHOLD
        ? `Sisa ${formatNumber(product.stock)}`
        : `Stok ${formatNumber(product.stock)}`;
    const actionAttributes = isAvailable ? "" : "disabled";
    return `
      <article class="product-card ${isAvailable ? "" : "is-unavailable"}">
        <button class="product-image-button" type="button" data-action="open-customizer" data-id="${escapeHtml(product.id)}" ${actionAttributes} aria-label="${isAvailable ? `Pesan ${escapeHtml(product.name)}` : `${escapeHtml(product.name)} habis`}">
          ${imageMarkup(product, product.name)}
          <span class="stock-float ${stockClass}">${escapeHtml(stockLabel)}</span>
        </button>
        <div class="product-body">
          <span class="product-category">${escapeHtml(product.category)}</span>
          <h3 class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
          <div class="product-footer">
            <span class="product-price">${escapeHtml(formatRupiah(product.price))}</span>
            <button class="add-product-button" type="button" data-action="open-customizer" data-id="${escapeHtml(product.id)}" ${actionAttributes} aria-label="Tambahkan ${escapeHtml(product.name)} ke pesanan">${icon("plus")}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function quickCashAmounts(total) {
  if (total <= 0) return [];
  const values = new Set([total]);
  [10000, 20000, 50000, 100000].forEach((amount) => {
    if (amount > total) values.add(amount);
  });
  const rounded = Math.ceil(total / 10000) * 10000;
  if (rounded > total) values.add(rounded);
  return [...values].sort((a, b) => a - b).slice(0, 4);
}

function renderCart() {
  const panel = document.getElementById("cartPanel");
  if (!panel) return;

  if (state.cart.length === 0) {
    state.cartDiscount = 0;
    state.paymentPaidInput = "";
    state.paymentMethod = "cash";
    panel.innerHTML = `
      <div class="cart-header">
        <div>
          <span class="section-kicker">Pesanan</span>
          <h2>Pesanan baru</h2>
          <p>0 item di keranjang</p>
        </div>
      </div>
      <div class="cart-empty">
        ${emptyState(
          "cart",
          "Keranjang masih kosong",
          "Pilih minuman dari daftar menu untuk mulai membuat pesanan.",
          "",
          true
        )}
      </div>
      <div class="cart-actions" style="padding:0 19px 19px">
        <p class="cart-note">Pesanan akan tersimpan setelah pembayaran dikonfirmasi.</p>
      </div>
    `;
    updateCartBadges();
    return;
  }

  state.cartDiscount = Math.min(Math.max(0, state.cartDiscount), cartSubtotal());
  const itemCount = cartItemCount();
  const subtotal = cartSubtotal();
  const discount = cartDiscountValue();
  const total = cartTotal();
  const paid = paymentPaid();
  const short = isCashShort();
  const isCash = state.paymentMethod === "cash";
  const quickAmounts = quickCashAmounts(total);

  const itemMarkup = state.cart.map((line) => {
    const product = getProduct(line.productId);
    if (!product) return "";
    const unitPrice = lineUnitPrice(line);
    const stockRemaining = Math.max(0, product.stock - cartQtyForProduct(line.productId));
    return `
      <div class="cart-item">
        <div class="cart-item-main">
          <span class="cart-thumb">${imageMarkup(product, product.name)}</span>
          <div class="cart-item-copy">
            <span class="cart-item-name">${escapeHtml(product.name)}</span>
            <p class="cart-item-variant">${escapeHtml(productVariantText(line))}</p>
            <span class="cart-item-unit">${escapeHtml(formatRupiah(unitPrice))} / item</span>
          </div>
          <button class="cart-remove" type="button" data-action="cart-remove" data-key="${escapeHtml(line.key)}" aria-label="Hapus ${escapeHtml(product.name)} dari keranjang">${icon("x")}</button>
        </div>
        <div class="cart-item-bottom">
          <div class="qty-control" aria-label="Atur jumlah ${escapeHtml(product.name)}">
            <button class="qty-button" type="button" data-action="cart-qty" data-key="${escapeHtml(line.key)}" data-direction="-1" ${line.qty <= 1 ? "disabled" : ""} aria-label="Kurangi jumlah">${icon("minus")}</button>
            <span class="qty-value" aria-live="polite">${formatNumber(line.qty)}</span>
            <button class="qty-button" type="button" data-action="cart-qty" data-key="${escapeHtml(line.key)}" data-direction="1" ${stockRemaining <= 0 ? "disabled" : ""} aria-label="Tambah jumlah">${icon("plus")}</button>
          </div>
          <span class="cart-line-total">${escapeHtml(formatRupiah(unitPrice * line.qty))}</span>
        </div>
      </div>
    `;
  }).join("");

  const changeValue = short ? cartTotal() - paid : Math.max(0, paid - total);
  panel.innerHTML = `
    <div class="cart-header">
      <div>
        <span class="section-kicker">Pesanan</span>
        <h2>Pesanan baru</h2>
        <p>${formatNumber(itemCount)} item di keranjang</p>
      </div>
      <button class="cart-clear-button" type="button" data-action="clear-cart">${icon("trash")} Kosongkan</button>
    </div>
    <div class="cart-items">${itemMarkup}</div>
    <div class="cart-summary">
      <div class="summary-row">
        <span>Subtotal</span>
        <strong id="cartSubtotalText">${escapeHtml(formatRupiah(subtotal))}</strong>
      </div>
      <div class="summary-row discount-row">
        <label for="cartDiscount">Diskon</label>
        <span class="discount-field">
          <span>Rp</span>
          <input type="number" id="cartDiscount" min="0" step="500" inputmode="numeric" value="${state.cartDiscount > 0 ? state.cartDiscount : ""}" placeholder="0" aria-label="Nominal diskon dalam rupiah">
        </span>
      </div>
      <hr class="summary-divider">
      <div class="summary-row total-row">
        <span>Total pembayaran</span>
        <strong id="cartTotalText">${escapeHtml(formatRupiah(total))}</strong>
      </div>
      <div class="payment-block">
        <span class="field-label">Metode pembayaran</span>
        <div class="payment-methods" role="group" aria-label="Pilih metode pembayaran">
          ${Object.entries(PAYMENT_METHODS).map(([method, label]) => `
            <button type="button" class="payment-method ${state.paymentMethod === method ? "active" : ""}" data-action="select-payment" data-method="${method}" aria-pressed="${state.paymentMethod === method}">
              ${paymentIcon(method)}
              ${escapeHtml(label)}
            </button>
          `).join("")}
        </div>
        ${isCash ? `
          <label class="field-label" for="cashReceived">Uang diterima</label>
          <div class="cash-input-wrap ${short ? "is-invalid" : ""}" id="cashInputWrap">
            <span>Rp</span>
            <input type="number" id="cashReceived" min="0" step="1000" inputmode="numeric" value="${escapeHtml(state.paymentPaidInput)}" placeholder="0" aria-describedby="paymentFeedback">
          </div>
          <div class="cash-quick-actions">
            ${quickAmounts.map((amount) => `
              <button type="button" class="quick-cash" data-action="quick-cash" data-amount="${amount}">${amount === total ? "Uang pas" : escapeHtml(shortRupiah(amount))}</button>
            `).join("")}
          </div>
        ` : `
          <div class="noncash-note">
            ${icon("info")}
            <span>Pembayaran ${escapeHtml(PAYMENT_METHODS[state.paymentMethod])} dicatat sebesar total transaksi.</span>
          </div>
        `}
        <div class="change-row ${short ? "is-short" : ""}" id="changeRow">
          <span id="changeLabel">${short ? "Uang masih kurang" : "Kembalian"}</span>
          <strong data-cart-change id="changeValue">${escapeHtml(formatRupiah(changeValue))}</strong>
        </div>
        <p class="payment-error" id="paymentFeedback" ${short ? "" : "hidden"}>${short ? `Uang diterima kurang ${escapeHtml(formatRupiah(cartTotal() - paid))}.` : ""}</p>
      </div>
      <div class="cart-actions">
        <button class="checkout-button" type="button" data-action="checkout">
          ${icon("check")}
          Proses Pembayaran · ${formatRupiah(total)}
        </button>
        <p class="cart-note">Stok akan berkurang setelah pembayaran dikonfirmasi.</p>
      </div>
    </div>
  `;
  updateCartBadges();
}

function updateCartTotals() {
  if (state.cart.length === 0) return;
  state.cartDiscount = Math.min(Math.max(0, state.cartDiscount), cartSubtotal());
  const subtotal = cartSubtotal();
  const discount = cartDiscountValue();
  const total = cartTotal();
  const paid = paymentPaid();
  const short = isCashShort();

  const subtotalEl = document.getElementById("cartSubtotalText");
  if (subtotalEl) subtotalEl.textContent = formatRupiah(subtotal);
  const totalEl = document.getElementById("cartTotalText");
  if (totalEl) totalEl.textContent = formatRupiah(total);
  const totalLabel = document.querySelector('[data-action="checkout"]');
  if (totalLabel) {
    totalLabel.innerHTML = `${icon("check")} Proses Pembayaran · ${formatRupiah(total)}`;
  }

  const changeRow = document.getElementById("changeRow");
  const changeLabel = document.getElementById("changeLabel");
  const changeValue = document.getElementById("changeValue");
  if (changeRow && changeLabel && changeValue) {
    changeRow.classList.toggle("is-short", short);
    changeLabel.textContent = short ? "Uang masih kurang" : "Kembalian";
    changeValue.textContent = formatRupiah(short ? total - paid : Math.max(0, paid - total));
  }
  const cashWrap = document.getElementById("cashInputWrap");
  if (cashWrap) cashWrap.classList.toggle("is-invalid", short);
  const feedback = document.getElementById("paymentFeedback");
  if (feedback) {
    feedback.hidden = !short;
    feedback.textContent = short ? `Uang diterima kurang ${formatRupiah(total - paid)}.` : "";
  }
}

function handleCartInput(event) {
  if (event.target.id === "cartDiscount") {
    const raw = String(event.target.value).trim();
    state.cartDiscount = raw ? nonNegativeInt(raw, 0) : 0;
    updateCartTotals();
    return;
  }
  if (event.target.id === "cashReceived") {
    state.paymentPaidInput = String(event.target.value);
    updateCartTotals();
  }
}

function handleCartFocusOut(event) {
  if (event.target.id === "cartDiscount") {
    const subtotal = cartSubtotal();
    if (nonNegativeInt(event.target.value, 0) > subtotal) {
      state.cartDiscount = subtotal;
      event.target.value = subtotal ? String(subtotal) : "";
      updateCartTotals();
      showToast("info", "Diskon disesuaikan", "Diskon tidak boleh melebihi subtotal pesanan.");
    } else {
      state.cartDiscount = nonNegativeInt(event.target.value, 0);
      updateCartTotals();
    }
  }
  if (event.target.id === "cashReceived") {
    state.paymentPaidInput = String(event.target.value);
    updateCartTotals();
  }
}

function selectPaymentMethod(method) {
  if (!PAYMENT_METHODS[method] || state.paymentMethod === method) return;
  const wasCash = state.paymentMethod === "cash";
  state.paymentMethod = method;
  state.paymentPaidInput = method === "cash" ? "" : String(cartTotal());
  if (wasCash && method === "cash") state.paymentPaidInput = "";
  renderCart();
}

function syncCartWithProducts() {
  let changed = false;
  const productIds = [...new Set(state.cart.map((line) => line.productId))];
  for (const productId of productIds) {
    const product = getProduct(productId);
    const lines = state.cart.filter((line) => line.productId === productId);
    if (!product) {
      state.cart = state.cart.filter((line) => line.productId !== productId);
      changed = true;
      continue;
    }
    let remaining = Math.max(0, product.stock);
    for (const line of lines) {
      const nextQty = Math.min(line.qty, remaining);
      if (nextQty <= 0) {
        state.cart = state.cart.filter((item) => item.key !== line.key);
        changed = true;
      } else if (nextQty !== line.qty) {
        line.qty = nextQty;
        changed = true;
      }
      remaining = Math.max(0, remaining - nextQty);
    }
  }
  if (changed) {
    state.cartDiscount = Math.min(state.cartDiscount, cartSubtotal());
    if (state.cart.length === 0) {
      state.cartDiscount = 0;
      state.paymentPaidInput = "";
      state.paymentMethod = "cash";
    }
  }
  return changed;
}

function addToCart(product, customization) {
  const currentQty = cartQtyForProduct(product.id);
  if (currentQty >= product.stock) {
    showToast("info", "Stok tidak mencukupi", `${product.name} hanya tersedia ${formatNumber(product.stock)} porsi.`);
    return false;
  }
  const key = makeLineKey(product.id, customization);
  const existing = state.cart.find((line) => line.key === key);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      key,
      productId: product.id,
      size: customization.size,
      sugar: customization.sugar,
      ice: customization.ice,
      toppings: [...customization.toppings],
      qty: 1
    });
  }
  renderCart();
  const price = lineUnitPrice({ ...customization, productId: product.id });
  showToast("success", "Ditambahkan ke pesanan", `${product.name} · ${formatRupiah(price)}`);
  return true;
}

function openCustomizer(productId) {
  const product = getProduct(productId);
  if (!product) {
    showToast("error", "Produk tidak ditemukan", "Menu mungkin sudah dihapus.");
    return;
  }
  if (product.stock <= 0) {
    showToast("info", "Stok habis", `${product.name} sedang tidak tersedia.`);
    return;
  }
  const remaining = Math.max(0, product.stock - cartQtyForProduct(product.id));
  if (remaining <= 0) {
    showToast("info", "Stok sudah di keranjang", `Semua stok ${product.name} sudah ada di pesanan.`);
    return;
  }
  const largeFee = nonNegativeInt(state.settings.largeFee, 0);

  openModal({
    title: "Kustomisasi minuman",
    subtitle: "Atur ukuran dan tambahan sesuai permintaan pelanggan.",
    body: `
      <form id="customizeForm">
        <div class="customize-product">
          <span class="customize-image">${imageMarkup(product, product.name)}</span>
          <div class="customize-copy">
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.category)} · Tersedia ${formatNumber(remaining)} porsi</p>
          </div>
          <span class="customize-base-price">${escapeHtml(formatRupiah(product.price))}</span>
        </div>

        <div class="option-group">
          <span class="option-label">Ukuran <small>Wajib dipilih</small></span>
          <div class="choice-row">
            <label class="choice-pill">
              <input type="radio" name="size" value="Regular" checked>
              <span>Regular <small>Tanpa biaya</small></span>
            </label>
            <label class="choice-pill">
              <input type="radio" name="size" value="Large">
              <span>Large <small>${largeFee > 0 ? `+${formatRupiah(largeFee)}` : "Gratis"}</small></span>
            </label>
          </div>
        </div>

        <div class="option-group">
          <span class="option-label">Level gula</span>
          <div class="choice-row">
            ${SUGAR_LEVELS.map((sugar) => `
              <label class="choice-pill">
                <input type="radio" name="sugar" value="${sugar}" ${sugar === "50%" ? "checked" : ""}>
                <span>${sugar}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="option-group">
          <span class="option-label">Level es</span>
          <div class="choice-row">
            ${ICE_LEVELS.map((ice) => `
              <label class="choice-pill">
                <input type="radio" name="ice" value="${ice}" ${ice === "Normal" ? "checked" : ""}>
                <span>${ice}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="option-group" style="margin-bottom:4px">
          <span class="option-label">Topping <small>Opsional</small></span>
          <div class="topping-list">
            ${TOPPINGS.map((topping) => {
              const fee = getToppingPrice(topping);
              return `
                <label class="topping-row">
                  <span class="topping-main">
                    <input type="checkbox" name="toppings" value="${escapeHtml(topping)}">
                    ${escapeHtml(topping)}
                  </span>
                  <span class="topping-price">${fee > 0 ? `+${formatRupiah(fee)}` : "Gratis"}</span>
                </label>
              `;
            }).join("")}
          </div>
        </div>
      </form>
    `,
    footer: `
      <div class="customize-total">
        <span>Total per item</span>
        <strong id="customizerPrice">${escapeHtml(formatRupiah(product.price))}</strong>
      </div>
      <button type="submit" form="customizeForm" class="btn btn-primary" id="addCustomizedButton">${icon("plus")} Tambah ke Pesanan</button>
    `,
    onMount(card) {
      const form = card.querySelector("#customizeForm");
      const priceElement = card.querySelector("#customizerPrice");
      if (!form || !priceElement) return;

      const getCustomization = () => {
        const checkedToppings = [...form.querySelectorAll('input[name="toppings"]:checked')].map((input) => input.value);
        return {
          size: form.querySelector('input[name="size"]:checked')?.value || "Regular",
          sugar: form.querySelector('input[name="sugar"]:checked')?.value || "50%",
          ice: form.querySelector('input[name="ice"]:checked')?.value || "Normal",
          toppings: TOPPINGS.filter((topping) => checkedToppings.includes(topping))
        };
      };

      const calculatePrice = () => {
        const customization = getCustomization();
        return product.price
          + (customization.size === "Large" ? largeFee : 0)
          + customization.toppings.reduce((total, topping) => total + getToppingPrice(topping), 0);
      };

      const updatePrice = () => {
        priceElement.textContent = formatRupiah(calculatePrice());
      };

      form.addEventListener("change", updatePrice);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const customization = getCustomization();
        if (addToCart(product, customization)) {
          closeModal();
        }
      });
    }
  });
}

function applyPOSFilters() {
  renderPOSCategories();
  renderPOSProducts();
  updateSearchClearButton("posSearch", "clear-pos-search");
}

function clearCart(showToastAfter = false) {
  state.cart = [];
  state.cartDiscount = 0;
  state.paymentPaidInput = "";
  state.paymentMethod = "cash";
  renderCart();
  if (showToastAfter) showToast("info", "Keranjang dikosongkan", "Pesanan saat ini telah dihapus.");
}

function requestClearCart() {
  if (state.cart.length === 0) return;
  openConfirm({
    title: "Kosongkan keranjang?",
    subtitle: "Semua item pada pesanan saat ini akan dihapus.",
    message: "Keranjang akan dikosongkan. Tindakan ini tidak memengaruhi transaksi yang sudah tersimpan.",
    confirmLabel: "Ya, kosongkan",
    cancelLabel: "Kembali",
    tone: "danger",
    iconName: "trash",
    onConfirm() {
      clearCart(true);
    }
  });
}

/* Checkout and transactions */
function generateTransactionNumber() {
  const datePart = todayKey().replace(/-/g, "");
  const prefix = `TRX-${datePart}-`;
  let maxSequence = 0;
  const existing = new Set(state.transactions.map((transaction) => transaction.number));
  state.transactions.forEach((transaction) => {
    if (!String(transaction.number).startsWith(prefix)) return;
    const sequence = Number(String(transaction.number).slice(prefix.length));
    if (Number.isFinite(sequence)) maxSequence = Math.max(maxSequence, sequence);
  });
  let sequence = maxSequence + 1;
  let number = `${prefix}${String(sequence).padStart(4, "0")}`;
  while (existing.has(number)) {
    sequence += 1;
    number = `${prefix}${String(sequence).padStart(4, "0")}`;
  }
  return number;
}

function persistCheckout(nextProducts, nextTransactions, failure = {}) {
  let previousProducts = null;
  let previousTransactions = null;
  try {
    previousProducts = window.localStorage.getItem(STORAGE_KEYS.products);
    previousTransactions = window.localStorage.getItem(STORAGE_KEYS.transactions);
    window.localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(nextProducts));
    window.localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(nextTransactions));
    return true;
  } catch {
    try {
      if (previousProducts === null) window.localStorage.removeItem(STORAGE_KEYS.products);
      else window.localStorage.setItem(STORAGE_KEYS.products, previousProducts);
      if (previousTransactions === null) window.localStorage.removeItem(STORAGE_KEYS.transactions);
      else window.localStorage.setItem(STORAGE_KEYS.transactions, previousTransactions);
    } catch {
      // Lewati pemulihan jika localStorage sepenuhnya tidak tersedia.
    }
    showToast(
      "error",
      failure.title || "Transaksi gagal disimpan",
      failure.message || "Penyimpanan browser tidak tersedia. Keranjang tidak diubah."
    );
    return false;
  }
}

function validateCheckoutPayment() {
  if (state.cart.length === 0) {
    showToast("error", "Keranjang kosong", "Tambahkan minuman sebelum memproses pembayaran.");
    return false;
  }
  if (state.paymentMethod === "cash") {
    const total = cartTotal();
    if (total > 0 && String(state.paymentPaidInput).trim() === "") {
      showToast("error", "Uang diterima belum diisi", "Masukkan nominal pembayaran dari pelanggan.");
      document.getElementById("cashReceived")?.focus();
      return false;
    }
    if (paymentPaid() < total) {
      showToast("error", "Nominal pembayaran kurang", `Kekurangan ${formatRupiah(total - paymentPaid())}.`);
      document.getElementById("cashReceived")?.focus();
      return false;
    }
  }
  return true;
}

function startCheckout() {
  if (state.isProcessing) return;
  if (state.cart.length === 0) {
    showToast("info", "Keranjang kosong", "Pilih minuman terlebih dahulu.");
    return;
  }
  if (syncCartWithProducts()) {
    renderPOSProducts();
    renderCart();
    showToast("info", "Stok diperbarui", "Jumlah pesanan disesuaikan dengan stok yang tersedia.");
    return;
  }
  if (!validateCheckoutPayment()) return;
  openPaymentConfirmation();
}

function openPaymentConfirmation() {
  const total = cartTotal();
  const subtotal = cartSubtotal();
  const discount = cartDiscountValue();
  const paid = paymentPaid();
  const change = Math.max(0, paid - total);
  const itemCount = cartItemCount();
  const method = PAYMENT_METHODS[state.paymentMethod];

  openModal({
    title: "Konfirmasi pembayaran",
    subtitle: "Periksa ringkasan pesanan sebelum transaksi disimpan.",
    body: `
      <div class="confirm-summary">
        <div class="confirm-row"><span>Jumlah item</span><strong>${formatNumber(itemCount)} minuman</strong></div>
        <div class="confirm-row"><span>Metode pembayaran</span><strong>${escapeHtml(method)}</strong></div>
        <div class="confirm-row"><span>Subtotal</span><strong>${escapeHtml(formatRupiah(subtotal))}</strong></div>
        ${discount > 0 ? `<div class="confirm-row"><span>Diskon</span><strong>−${escapeHtml(formatRupiah(discount))}</strong></div>` : ""}
        <div class="confirm-row"><span>Uang diterima</span><strong>${escapeHtml(formatRupiah(paid))}</strong></div>
        <div class="confirm-row"><span>Kembalian</span><strong>${escapeHtml(formatRupiah(change))}</strong></div>
        <div class="confirm-total"><span>Total pembayaran</span><strong>${escapeHtml(formatRupiah(total))}</strong></div>
        <p class="payment-confirm-note">${icon("info")} Setelah dikonfirmasi, stok akan dikurangi dan transaksi tidak dapat diedit. Pembatalan tetap dapat dilakukan dari riwayat.</p>
      </div>
    `,
    footer: `
      <button type="button" class="btn btn-secondary" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" data-action="complete-payment" id="completePaymentButton">${icon("check")} Konfirmasi Pembayaran</button>
    `
  });
}

async function completePayment() {
  if (state.isProcessing) return;
  const button = document.getElementById("completePaymentButton");
  if (syncCartWithProducts()) {
    closeModal();
    renderPOSProducts();
    renderCart();
    showToast("info", "Stok berubah", "Keranjang telah disesuaikan. Silakan periksa kembali pesanan.");
    return;
  }
  if (!validateCheckoutPayment()) return;

  state.isProcessing = true;
  if (button) {
    button.disabled = true;
    button.innerHTML = `${icon("clock")} Memproses...`;
  }
  activeModal.dismissible = false;

  const cartSnapshot = clone(state.cart);
  const subtotal = cartSubtotal();
  const discount = cartDiscountValue();
  const total = cartTotal();
  const paid = state.paymentMethod === "cash" ? paymentPaid() : total;
  const change = Math.max(0, paid - total);
  const transaction = {
    id: uid("trx"),
    number: generateTransactionNumber(),
    createdAt: new Date().toISOString(),
    dateKey: todayKey(),
    cashierName: state.settings.cashierName,
    items: cartSnapshot.map((line) => {
      const product = getProduct(line.productId);
      const sizeFee = line.size === "Large" ? nonNegativeInt(state.settings.largeFee, 0) : 0;
      const toppings = TOPPINGS
        .filter((topping) => line.toppings.includes(topping))
        .map((topping) => ({ name: topping, price: getToppingPrice(topping) }));
      const unitPrice = product.price + sizeFee + toppings.reduce((sum, topping) => sum + topping.price, 0);
      return {
        productId: product.id,
        name: product.name,
        category: product.category,
        image: product.image,
        size: line.size,
        sugar: line.sugar,
        ice: line.ice,
        toppings,
        basePrice: product.price,
        sizeFee,
        unitPrice,
        qty: line.qty,
        lineTotal: unitPrice * line.qty
      };
    }),
    subtotal,
    discount,
    total,
    paymentMethod: state.paymentMethod,
    paid,
    change,
    status: "completed",
    cancelledAt: null,
    stockRestored: false
  };

  const quantityByProduct = cartSnapshot.reduce((accumulator, line) => {
    accumulator[line.productId] = (accumulator[line.productId] || 0) + line.qty;
    return accumulator;
  }, {});
  const nextProducts = state.products.map((product) => {
    const sold = quantityByProduct[product.id] || 0;
    if (!sold) return product;
    return {
      ...product,
      stock: Math.max(0, product.stock - sold),
      updatedAt: new Date().toISOString()
    };
  });
  const nextTransactions = [transaction, ...state.transactions];

  if (!persistCheckout(nextProducts, nextTransactions)) {
    state.isProcessing = false;
    activeModal.dismissible = true;
    if (button?.isConnected) {
      button.disabled = false;
      button.innerHTML = `${icon("check")} Konfirmasi Pembayaran`;
    }
    return;
  }

  state.products = nextProducts;
  state.transactions = nextTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  state.cart = [];
  state.cartDiscount = 0;
  state.paymentPaidInput = "";
  state.paymentMethod = "cash";
  state.isProcessing = false;

  renderPOSProducts();
  renderCart();
  updateCartBadges();
  closeModal();
  openReceipt(transaction, { justCompleted: true });
  showToast("success", "Pembayaran berhasil", `${transaction.number} berhasil disimpan.`);
}

function receiptMarkup(transaction) {
  const isCancelled = transaction.status === "cancelled";
  const shop = state.settings;
  const totalItems = transaction.items.reduce((total, item) => total + item.qty, 0);
  return `
    <article class="receipt-paper">
      ${isCancelled ? `<div class="receipt-void-banner">TRANSAKSI DIBATALKAN</div>` : ""}
      <div class="receipt-brand">
        <span class="receipt-brand-mark">${icon("cup")}</span>
        <h3>${escapeHtml(shop.shopName)}</h3>
        <p>${escapeHtml(shop.address)}</p>
        ${shop.contact ? `<p>${escapeHtml(shop.contact)}</p>` : ""}
      </div>
      <div class="receipt-separator"></div>
      <div class="receipt-meta">
        <div class="receipt-meta-row"><span>No. transaksi</span><strong>${escapeHtml(transaction.number)}</strong></div>
        <div class="receipt-meta-row"><span>Tanggal</span><strong>${escapeHtml(formatDateTime(transaction.createdAt))}</strong></div>
        <div class="receipt-meta-row"><span>Kasir</span><strong>${escapeHtml(transaction.cashierName)}</strong></div>
        <div class="receipt-meta-row"><span>Metode</span><strong>${escapeHtml(PAYMENT_METHODS[transaction.paymentMethod])}</strong></div>
      </div>
      <div class="receipt-separator"></div>
      <div class="receipt-items">
        ${transaction.items.map((item) => `
          <div class="receipt-item">
            <div class="receipt-item-main">
              <strong>${escapeHtml(item.name)}</strong>
              <p>${escapeHtml(receiptCustomizationText(item))}</p>
            </div>
            <div class="receipt-item-price">
              ${escapeHtml(formatRupiah(item.lineTotal))}
              <span>${formatNumber(item.qty)} × ${escapeHtml(formatRupiah(item.unitPrice))}</span>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="receipt-separator"></div>
      <div class="receipt-totals">
        <div class="receipt-row"><span>Subtotal (${formatNumber(totalItems)} item)</span><strong>${escapeHtml(formatRupiah(transaction.subtotal))}</strong></div>
        ${transaction.discount > 0 ? `<div class="receipt-row"><span>Diskon</span><strong>−${escapeHtml(formatRupiah(transaction.discount))}</strong></div>` : ""}
        <div class="receipt-row grand-total"><span>Total pembayaran</span><strong>${escapeHtml(formatRupiah(transaction.total))}</strong></div>
        <div class="receipt-row"><span>Dibayar (${escapeHtml(PAYMENT_METHODS[transaction.paymentMethod])})</span><strong>${escapeHtml(formatRupiah(transaction.paid))}</strong></div>
        <div class="receipt-row"><span>Kembalian</span><strong>${escapeHtml(formatRupiah(transaction.change))}</strong></div>
      </div>
      <div class="receipt-separator"></div>
      <div class="receipt-footer">
        <strong>Terima kasih!</strong>
        <p>Semoga minumannya menyegarkan hari Anda.</p>
        <p>Struk ini dicetak dari ${escapeHtml(shop.shopName)}.</p>
      </div>
    </article>
  `;
}

function openReceipt(transaction, options = {}) {
  if (!transaction) return;
  const markup = receiptMarkup(transaction);
  const printRoot = document.getElementById("printRoot");
  if (printRoot) printRoot.innerHTML = markup;

  openModal({
    title: options.justCompleted ? "Pembayaran berhasil" : "Struk pembayaran",
    subtitle: options.justCompleted
      ? "Transaksi tersimpan. Struk siap dicetak."
      : `Cetak ulang struk ${transaction.number}.`,
    size: "receipt",
    body: `<div class="receipt-stage">${markup}</div>`,
    footer: `
      <button type="button" class="btn btn-secondary" data-modal-close>Tutup</button>
      <button type="button" class="btn btn-primary" data-action="print-receipt">${icon("printer")} Cetak Struk</button>
    `,
    onClose() {
      if (printRoot) printRoot.innerHTML = "";
    }
  });
}

function printCurrentReceipt() {
  const printRoot = document.getElementById("printRoot");
  if (!printRoot || !printRoot.innerHTML.trim()) {
    showToast("error", "Struk tidak tersedia", "Buka struk terlebih dahulu sebelum mencetak.");
    return;
  }
  window.print();
}

/* Menu management */
function filteredMenuProducts() {
  const search = state.menuFilter.search.trim().toLowerCase();
  const category = state.menuFilter.category;
  return state.products.filter((product) => {
    const matchesSearch = !search
      || product.name.toLowerCase().includes(search)
      || product.description.toLowerCase().includes(search);
    const matchesCategory = category === "all" || product.category === category;
    return matchesSearch && matchesCategory;
  });
}

function renderMenu() {
  const searchInput = document.getElementById("menuSearch");
  if (searchInput && searchInput.value !== state.menuFilter.search) {
    searchInput.value = state.menuFilter.search;
  }
  const categorySelect = document.getElementById("menuCategory");
  if (categorySelect && categorySelect.value !== state.menuFilter.category) {
    categorySelect.value = state.menuFilter.category;
  }
  updateSearchClearButton("menuSearch", "clear-menu-search");

  const countElement = document.getElementById("menuCount");
  const wrap = document.getElementById("menuTableWrap");
  if (!wrap) return;
  const filtered = filteredMenuProducts();
  const isFiltering = Boolean(state.menuFilter.search.trim()) || state.menuFilter.category !== "all";

  if (countElement) {
    countElement.textContent = isFiltering
      ? `${formatNumber(filtered.length)} dari ${formatNumber(state.products.length)} menu`
      : `${formatNumber(state.products.length)} menu`;
  }

  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div class="menu-empty-wrap">
        ${emptyState(
          isFiltering ? "search" : "cup",
          isFiltering ? "Menu tidak ditemukan" : "Belum ada menu",
          isFiltering
            ? "Coba kata kunci lain atau ubah filter kategori."
            : "Tambahkan menu minuman pertama untuk mulai berjualan.",
          isFiltering
            ? `<button class="btn btn-small btn-secondary" type="button" data-action="reset-menu-filter">Reset Filter</button>`
            : `<button class="btn btn-small btn-primary" type="button" data-action="add-product">${icon("plus")} Tambah Menu</button>`
        )}
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table responsive-table menu-table">
        <thead>
          <tr>
            <th scope="col">Produk</th>
            <th scope="col">Kategori</th>
            <th scope="col">Harga</th>
            <th scope="col">Stok</th>
            <th scope="col"><span class="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((product) => {
            const stockClass = product.stock <= 0 ? "out" : product.stock <= LOW_STOCK_THRESHOLD ? "low" : "";
            const stockLabel = product.stock <= 0
              ? "Habis"
              : `${formatNumber(product.stock)} porsi`;
            return `
              <tr>
                <td data-label="Produk">
                  <div class="menu-product-cell">
                    <span class="menu-thumb">${imageMarkup(product, product.name)}</span>
                    <div class="menu-product-copy">
                      <strong>${escapeHtml(product.name)}</strong>
                      <span>${escapeHtml(product.description || "Belum ada deskripsi.")}</span>
                    </div>
                  </div>
                </td>
                <td data-label="Kategori"><span class="menu-category-text">${escapeHtml(product.category)}</span></td>
                <td data-label="Harga"><span class="money">${escapeHtml(formatRupiah(product.price))}</span></td>
                <td data-label="Stok">
                  <span class="stock-number"><span class="stock-dot ${stockClass}"></span>${escapeHtml(stockLabel)}</span>
                </td>
                <td data-label="Aksi">
                  <div class="table-actions">
                    <button class="icon-button" type="button" data-action="edit-product" data-id="${escapeHtml(product.id)}" aria-label="Edit ${escapeHtml(product.name)}">${icon("edit")}</button>
                    <button class="icon-button danger" type="button" data-action="delete-product" data-id="${escapeHtml(product.id)}" aria-label="Hapus ${escapeHtml(product.name)}">${icon("trash")}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function openProductForm(productId = "") {
  const existing = productId ? getProduct(productId) : null;
  if (productId && !existing) {
    showToast("error", "Menu tidak ditemukan", "Produk mungkin sudah dihapus.");
    return;
  }
  const product = existing || {
    name: "",
    category: "Coffee",
    price: "",
    stock: "",
    description: "",
    image: ""
  };

  openModal({
    title: existing ? "Edit menu" : "Tambah menu",
    subtitle: existing ? "Perbarui informasi produk dan ketersediaan stok." : "Lengkapi informasi menu minuman baru.",
    body: `
      <div class="modal-error" id="productFormError" hidden>${icon("alert")}<span></span></div>
      <form id="productForm" novalidate>
        <div class="form-modal-grid">
          <label class="form-field form-span-2">
            <span>Nama menu</span>
            <input type="text" id="productName" maxlength="80" value="${escapeHtml(product.name)}" autocomplete="off" required data-autofocus>
          </label>
          <label class="form-field">
            <span>Kategori</span>
            <select id="productCategory" required>
              ${CATEGORIES.map((category) => `<option value="${escapeHtml(category)}" ${product.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
            </select>
          </label>
          <label class="form-field">
            <span>Harga jual</span>
            <div class="input-prefix">
              <span>Rp</span>
              <input type="number" id="productPrice" min="1" step="500" inputmode="numeric" value="${escapeHtml(product.price)}" placeholder="15000" required>
            </div>
          </label>
          <label class="form-field">
            <span>Stok tersedia</span>
            <input type="number" id="productStock" min="0" step="1" inputmode="numeric" value="${escapeHtml(product.stock)}" placeholder="20" required>
          </label>
          <label class="form-field">
            <span>Gambar <em>Opsional</em></span>
            <input type="text" id="productImage" maxlength="300" value="${escapeHtml(product.image)}" placeholder="assets/nama-file.svg" autocomplete="off">
            <small>Gunakan path lokal atau URL gambar. Kosongkan untuk ikon bawaan.</small>
          </label>
          <label class="form-field form-span-2">
            <span>Deskripsi <em>Opsional</em></span>
            <textarea id="productDescription" maxlength="180" rows="3" placeholder="Deskripsi singkat minuman...">${escapeHtml(product.description)}</textarea>
          </label>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn-secondary" data-modal-close>Batal</button>
      <button type="submit" form="productForm" class="btn btn-primary">${icon("check")} ${existing ? "Simpan Perubahan" : "Tambah Menu"}</button>
    `,
    onMount(card) {
      const form = card.querySelector("#productForm");
      const errorBox = card.querySelector("#productFormError");
      if (!form) return;

      const showError = (message, field) => {
        errorBox.hidden = false;
        errorBox.querySelector("span").textContent = message;
        if (field) {
          field.setAttribute("aria-invalid", "true");
          field.focus();
        }
      };
      const clearFieldError = (event) => {
        const field = event.target.closest("input, select, textarea");
        if (field) field.removeAttribute("aria-invalid");
        if (!card.querySelector('[aria-invalid="true"]')) errorBox.hidden = true;
      };
      form.addEventListener("input", clearFieldError);
      form.addEventListener("change", clearFieldError);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const nameField = card.querySelector("#productName");
        const categoryField = card.querySelector("#productCategory");
        const priceField = card.querySelector("#productPrice");
        const stockField = card.querySelector("#productStock");
        const imageField = card.querySelector("#productImage");
        const descriptionField = card.querySelector("#productDescription");
        const name = nameField.value.trim();
        const category = categoryField.value;
        const rawPrice = Number(priceField.value);
        const rawStock = Number(stockField.value);
        const rawImage = imageField.value.trim();
        const description = descriptionField.value.trim();
        const duplicateName = state.products.some(
          (candidate) => candidate.id !== existing?.id && candidate.name.toLowerCase() === name.toLowerCase()
        );

        card.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
        errorBox.hidden = true;
        if (name.length < 2) return showError("Nama menu minimal 2 karakter.", nameField);
        if (duplicateName) return showError("Nama menu sudah digunakan. Gunakan nama lain.", nameField);
        if (!CATEGORIES.includes(category)) return showError("Pilih kategori menu yang valid.", categoryField);
        if (!Number.isFinite(rawPrice) || rawPrice <= 0) return showError("Harga jual harus lebih dari Rp0.", priceField);
        if (rawPrice > 100000000) return showError("Harga jual terlalu besar.", priceField);
        if (!Number.isFinite(rawStock) || rawStock < 0) return showError("Stok tidak boleh negatif.", stockField);
        if (rawStock > 1000000) return showError("Jumlah stok terlalu besar.", stockField);
        const image = safeImageUrl(rawImage);
        if (rawImage && !image) return showError("Path gambar tidak valid. Gunakan path lokal atau URL http(s).", imageField);

        const now = new Date().toISOString();
        const nextProduct = {
          id: existing?.id || uid("prd"),
          name,
          category,
          price: Math.round(rawPrice),
          stock: Math.round(rawStock),
          description,
          image,
          createdAt: existing?.createdAt || now,
          updatedAt: now
        };
        const nextProducts = existing
          ? state.products.map((item) => item.id === existing.id ? nextProduct : item)
          : [...state.products, nextProduct];

        if (!writeStored(STORAGE_KEYS.products, nextProducts)) return;
        state.products = nextProducts;
        const cartChanged = syncCartWithProducts();
        closeModal();
        renderMenu();
        updateCartBadges();
        if (cartChanged) {
          renderCart();
          showToast("info", "Keranjang disesuaikan", "Jumlah pesanan diperbarui mengikuti ketersediaan stok terbaru.");
        }
        showToast("success", existing ? "Menu diperbarui" : "Menu ditambahkan", `${name} berhasil disimpan.`);
      });
    }
  });
}

function requestDeleteProduct(productId) {
  const product = getProduct(productId);
  if (!product) {
    showToast("error", "Menu tidak ditemukan", "Produk mungkin sudah dihapus.");
    return;
  }
  const cartQty = cartQtyForProduct(product.id);
  openConfirm({
    title: "Hapus menu?",
    subtitle: "Produk akan dihapus dari daftar menu dan kasir.",
    message: `Menu <strong>${escapeHtml(product.name)}</strong> akan dihapus permanen. Riwayat transaksi lama tetap menyimpan data produk sebagai arsip.`,
    details: cartQty > 0
      ? `<div class="availability-hint">${icon("info")} ${formatNumber(cartQty)} item produk ini ada di keranjang dan akan ikut dihapus.</div>`
      : "",
    confirmLabel: "Hapus menu",
    cancelLabel: "Batal",
    tone: "danger",
    iconName: "trash",
    onConfirm() {
      const nextProducts = state.products.filter((item) => item.id !== product.id);
      if (!writeStored(STORAGE_KEYS.products, nextProducts)) return false;
      state.products = nextProducts;
      const cartChanged = syncCartWithProducts();
      renderMenu();
      if (cartChanged) {
        renderCart();
        updateCartBadges();
      }
      showToast("success", "Menu dihapus", `${product.name} telah dihapus dari daftar menu.`);
    }
  });
}

function resetMenuFilters() {
  state.menuFilter = { search: "", category: "all" };
  const searchInput = document.getElementById("menuSearch");
  if (searchInput) searchInput.value = "";
  const categorySelect = document.getElementById("menuCategory");
  if (categorySelect) categorySelect.value = "all";
  renderMenu();
}

/* Transaction history */
function filteredHistoryTransactions() {
  const search = state.historyFilter.search.trim().toLowerCase();
  return state.transactions.filter((transaction) => {
    const matchesSearch = !search || transaction.number.toLowerCase().includes(search);
    const matchesDate = !state.historyFilter.date || transaction.dateKey === state.historyFilter.date;
    const matchesMethod = state.historyFilter.method === "all" || transaction.paymentMethod === state.historyFilter.method;
    return matchesSearch && matchesDate && matchesMethod;
  });
}

function renderHistory() {
  const searchInput = document.getElementById("historySearch");
  if (searchInput && searchInput.value !== state.historyFilter.search) {
    searchInput.value = state.historyFilter.search;
  }
  const dateInput = document.getElementById("historyDate");
  if (dateInput && dateInput.value !== state.historyFilter.date) dateInput.value = state.historyFilter.date;
  const methodSelect = document.getElementById("historyMethod");
  if (methodSelect && methodSelect.value !== state.historyFilter.method) methodSelect.value = state.historyFilter.method;
  updateSearchClearButton("historySearch", "clear-history-search");

  const wrap = document.getElementById("historyTableWrap");
  const countElement = document.getElementById("historyResultCount");
  if (!wrap) return;
  const filtered = filteredHistoryTransactions();
  const isFiltering = Boolean(state.historyFilter.search.trim())
    || Boolean(state.historyFilter.date)
    || state.historyFilter.method !== "all";

  if (countElement) {
    countElement.textContent = isFiltering
      ? `${formatNumber(filtered.length)} dari ${formatNumber(state.transactions.length)} transaksi`
      : `${formatNumber(state.transactions.length)} transaksi`;
  }

  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div class="empty-panel">
        ${emptyState(
          isFiltering ? "search" : "receipt",
          isFiltering ? "Transaksi tidak ditemukan" : "Belum ada transaksi",
          isFiltering
            ? "Ubah kata kunci, tanggal, atau metode pembayaran untuk menemukan transaksi."
            : "Transaksi yang selesai diproses akan muncul di halaman ini.",
          isFiltering
            ? `<button class="btn btn-small btn-secondary" type="button" data-action="reset-history-filters">Reset Filter</button>`
            : `<button class="btn btn-small btn-primary" type="button" data-nav-page="kasir">${icon("cart")} Mulai Transaksi</button>`
        )}
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table responsive-table">
        <thead>
          <tr>
            <th scope="col">Transaksi</th>
            <th scope="col">Item</th>
            <th scope="col">Metode</th>
            <th scope="col">Total</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((transaction) => {
            const itemCount = transaction.items.reduce((total, item) => total + item.qty, 0);
            const itemNames = transaction.items.map((item) => item.name).join(", ");
            return `
              <tr>
                <td data-label="Transaksi">
                  <span class="table-id">${escapeHtml(transaction.number)}</span>
                  <span class="table-subcopy">${escapeHtml(formatDateTime(transaction.createdAt))}</span>
                </td>
                <td data-label="Item">
                  <span class="table-items-copy" title="${escapeHtml(itemNames)}">${escapeHtml(itemNames)}</span>
                  <span class="table-subcopy">${formatNumber(itemCount)} item · ${escapeHtml(transaction.cashierName)}</span>
                </td>
                <td data-label="Metode"><span class="tag">${escapeHtml(PAYMENT_METHODS[transaction.paymentMethod])}</span></td>
                <td data-label="Total"><span class="money">${escapeHtml(formatRupiah(transaction.total))}</span></td>
                <td data-label="Status">${statusBadge(transaction.status)}</td>
                <td data-label="Aksi">
                  <div class="table-actions">
                    <button class="icon-button" type="button" data-action="view-transaction" data-id="${escapeHtml(transaction.id)}" aria-label="Lihat detail ${escapeHtml(transaction.number)}">${icon("receipt")}</button>
                    ${transaction.status === "completed" ? `<button class="icon-button danger" type="button" data-action="cancel-transaction" data-id="${escapeHtml(transaction.id)}" aria-label="Batalkan ${escapeHtml(transaction.number)}">${icon("x")}</button>` : ""}
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function openTransactionDetail(transactionId) {
  const transaction = state.transactions.find((item) => item.id === transactionId);
  if (!transaction) {
    showToast("error", "Transaksi tidak ditemukan", "Data mungkin sudah dihapus.");
    return;
  }
  const itemCount = transaction.items.reduce((total, item) => total + item.qty, 0);
  const isCancelled = transaction.status === "cancelled";
  const missingStock = isCancelled && !transaction.stockRestored;

  openModal({
    title: "Detail transaksi",
    subtitle: `Transaksi ${transaction.number}`,
    body: `
      <div class="detail-head">
        <div>
          <h3>${escapeHtml(transaction.number)}</h3>
          <p>${escapeHtml(formatDateTime(transaction.createdAt))} · ${escapeHtml(transaction.cashierName)}</p>
          <div style="margin-top:7px">${statusBadge(transaction.status)}</div>
        </div>
        <div class="detail-total">
          <span>Total</span>
          <strong>${escapeHtml(formatRupiah(transaction.total))}</strong>
        </div>
      </div>
      <div class="detail-items">
        ${transaction.items.map((item) => `
          <div class="detail-item">
            <div class="detail-item-main">
              <strong>${escapeHtml(item.name)}</strong>
              <p>${escapeHtml(receiptCustomizationText(item))}</p>
            </div>
            <div class="detail-item-price">
              ${escapeHtml(formatRupiah(item.lineTotal))}
              <small>${formatNumber(item.qty)} × ${escapeHtml(formatRupiah(item.unitPrice))}</small>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="detail-grid">
        <div class="detail-row"><span>Jumlah item</span><strong>${formatNumber(itemCount)}</strong></div>
        <div class="detail-row"><span>Metode</span><strong>${escapeHtml(PAYMENT_METHODS[transaction.paymentMethod])}</strong></div>
        <div class="detail-row"><span>Subtotal</span><strong>${escapeHtml(formatRupiah(transaction.subtotal))}</strong></div>
        <div class="detail-row"><span>Diskon</span><strong>${transaction.discount > 0 ? `−${escapeHtml(formatRupiah(transaction.discount))}` : "Tidak ada"}</strong></div>
        <div class="detail-row"><span>Dibayar</span><strong>${escapeHtml(formatRupiah(transaction.paid))}</strong></div>
        <div class="detail-row"><span>Kembalian</span><strong>${escapeHtml(formatRupiah(transaction.change))}</strong></div>
        <div class="detail-row full"><span>Kasir</span><strong>${escapeHtml(transaction.cashierName)}</strong></div>
        ${isCancelled ? `<div class="detail-row full"><span>Dibatalkan pada</span><strong>${escapeHtml(formatDateTime(transaction.cancelledAt))}</strong></div>` : ""}
      </div>
      ${isCancelled ? `
        <div class="detail-cancelled-note">
          ${icon("alert")}
          <span>Transaksi ini dibatalkan${transaction.stockRestored ? " dan stok telah dikembalikan" : ""}. Transaksi batal tidak dihitung dalam omzet laporan.</span>
        </div>
      ` : ""}
      ${missingStock ? `
        <div class="detail-cancelled-note">
          ${icon("info")} Status pengembalian stok belum tercatat pada data lama.
        </div>
      ` : ""}
    `,
    footer: `
      <button type="button" class="btn btn-secondary" data-modal-close>Tutup</button>
      ${transaction.status === "completed" ? `<button type="button" class="btn btn-danger-outline" data-action="cancel-transaction" data-id="${escapeHtml(transaction.id)}">${icon("x")} Batalkan</button>` : ""}
      <button type="button" class="btn btn-primary" data-action="open-receipt" data-id="${escapeHtml(transaction.id)}">${icon("receipt")} Lihat Struk</button>
    `
  });
}

function requestCancelTransaction(transactionId) {
  const transaction = state.transactions.find((item) => item.id === transactionId);
  if (!transaction) {
    showToast("error", "Transaksi tidak ditemukan", "Data mungkin sudah dihapus.");
    return;
  }
  if (transaction.status !== "completed") {
    showToast("info", "Transaksi sudah dibatalkan", "Tidak ada tindakan tambahan yang diperlukan.");
    return;
  }
  if (transaction.stockRestored) {
    showToast("info", "Stok sudah dikembalikan", "Transaksi ini tidak dapat diproses ulang.");
    return;
  }
  const itemCount = transaction.items.reduce((total, item) => total + item.qty, 0);

  openConfirm({
    title: "Batalkan transaksi?",
    subtitle: "Stok produk akan dikembalikan ke inventaris.",
    message: `Transaksi <strong>${escapeHtml(transaction.number)}</strong> senilai <strong>${escapeHtml(formatRupiah(transaction.total))}</strong> akan ditandai batal. Tindakan ini tidak dapat dibatalkan.`,
    details: `<div class="availability-hint">${icon("info")} Stok dari ${formatNumber(itemCount)} item akan dikembalikan satu kali. Omzet laporan akan dihitung ulang.</div>`,
    confirmLabel: "Batalkan transaksi",
    cancelLabel: "Kembali",
    tone: "danger",
    iconName: "alert",
    onConfirm() {
      const current = state.transactions.find((item) => item.id === transaction.id);
      if (!current || current.status !== "completed" || current.stockRestored) {
        showToast("info", "Transaksi sudah diproses", "Status transaksi telah berubah.");
        return false;
      }

      const restoreQty = current.items.reduce((accumulator, item) => {
        if (!item.productId) return accumulator;
        accumulator[item.productId] = (accumulator[item.productId] || 0) + item.qty;
        return accumulator;
      }, {});
      let restoredTotal = 0;
      const nextProducts = state.products.map((product) => {
        const qty = restoreQty[product.id] || 0;
        if (!qty) return product;
        restoredTotal += qty;
        return {
          ...product,
          stock: product.stock + qty,
          updatedAt: new Date().toISOString()
        };
      });
      const cancelledAt = new Date().toISOString();
      const nextTransactions = state.transactions.map((item) => item.id === current.id
        ? {
            ...item,
            status: "cancelled",
            cancelledAt,
            stockRestored: true
          }
        : item
      );

      if (!persistCheckout(nextProducts, nextTransactions, {
        title: "Pembatalan gagal disimpan",
        message: "Penyimpanan browser tidak tersedia. Status transaksi tidak diubah."
      })) return false;

      state.products = nextProducts;
      state.transactions = nextTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      renderHistory();
      const missingQty = itemCount - restoredTotal;
      showToast(
        "success",
        "Transaksi dibatalkan",
        missingQty > 0
          ? `${formatNumber(restoredTotal)} item stok dikembalikan. ${formatNumber(missingQty)} item tidak lagi ada di menu.`
          : `Stok ${formatNumber(restoredTotal)} item telah dikembalikan.`
      );
    }
  });
}

function resetHistoryFilters() {
  state.historyFilter = { search: "", date: "", method: "all" };
  const searchInput = document.getElementById("historySearch");
  if (searchInput) searchInput.value = "";
  const dateInput = document.getElementById("historyDate");
  if (dateInput) dateInput.value = "";
  const methodSelect = document.getElementById("historyMethod");
  if (methodSelect) methodSelect.value = "all";
  renderHistory();
}

/* Reports */
function resolveReportRange() {
  const today = todayKey();
  if (state.report.range === "7days") {
    return { from: shiftDateKey(today, -6), to: today };
  }
  if (state.report.range === "month") {
    const current = dateKeyToDate(today);
    return {
      from: dateToKey(new Date(current.getFullYear(), current.getMonth(), 1)),
      to: today
    };
  }
  if (state.report.range === "custom") {
    let from = isValidDateKey(state.report.from) ? state.report.from : shiftDateKey(today, -6);
    let to = isValidDateKey(state.report.to) ? state.report.to : today;
    if (from > to) [from, to] = [to, from];
    return { from, to };
  }
  return { from: today, to: today };
}

function reportRangeLabel(range, from, to) {
  if (range === "today") return `Hari ini · ${formatLongDateKey(from)}`;
  if (range === "7days") return `7 hari terakhir · ${formatDateRange(from, to)}`;
  if (range === "month") {
    const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(dateKeyToDate(to));
    return `Bulan ini · ${label}`;
  }
  return `Rentang khusus · ${formatDateRange(from, to)}`;
}

function completedTransactionsInRange(from, to) {
  return state.transactions.filter(
    (transaction) => transaction.status === "completed"
      && transaction.dateKey >= from
      && transaction.dateKey <= to
  );
}

function aggregateReportProducts(transactions) {
  const sales = new Map();
  transactions.forEach((transaction) => {
    transaction.items.forEach((item) => {
      const key = item.productId || item.name;
      const existing = sales.get(key) || {
        name: item.name,
        qty: 0,
        revenue: 0
      };
      existing.name = item.name;
      existing.qty += item.qty;
      existing.revenue += item.lineTotal;
      sales.set(key, existing);
    });
  });
  return [...sales.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
}

function renderReportTopProducts(transactions) {
  const container = document.getElementById("reportTopProducts");
  if (!container) return;
  const ranked = aggregateReportProducts(transactions).slice(0, 5);
  if (ranked.length === 0) {
    container.innerHTML = emptyState(
      "flame",
      "Belum ada penjualan",
      "Produk terlaris akan muncul setelah transaksi pada rentang ini.",
      "",
      true
    );
    return;
  }
  container.innerHTML = `
    <div class="report-top-products">
      ${ranked.map((product, index) => `
        <div class="report-product-row">
          <span class="report-rank">${index + 1}</span>
          <div class="report-product-copy">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${formatNumber(product.qty)} terjual</span>
          </div>
          <span class="report-product-value">${escapeHtml(formatRupiah(product.revenue))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReportCategories(transactions) {
  const container = document.getElementById("reportCategories");
  if (!container) return;
  const categories = new Map();
  transactions.forEach((transaction) => {
    transaction.items.forEach((item) => {
      const category = item.category || "Lainnya";
      categories.set(category, (categories.get(category) || 0) + item.lineTotal);
    });
  });
  const rows = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, entry) => sum + entry[1], 0);
  if (rows.length === 0 || total === 0) {
    container.innerHTML = emptyState(
      "chart",
      "Belum ada data kategori",
      "Komposisi kategori akan tampil setelah ada penjualan.",
      "",
      true
    );
    return;
  }
  container.innerHTML = `
    <div class="category-list">
      ${rows.map(([category, revenue]) => {
        const share = Math.round((revenue / total) * 100);
        return `
          <div class="category-item">
            <div class="category-item-head">
              <span class="category-name"><span class="category-color"></span>${escapeHtml(category)}</span>
              <span class="category-value">${escapeHtml(formatRupiah(revenue))} · ${share}%</span>
            </div>
            <div class="category-track">
              <div class="category-fill" style="width:${share}%"></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReportDaily(transactions) {
  const container = document.getElementById("reportDaily");
  if (!container) return;
  const daily = new Map();
  transactions.forEach((transaction) => {
    const existing = daily.get(transaction.dateKey) || {
      dateKey: transaction.dateKey,
      transactions: 0,
      items: 0,
      revenue: 0
    };
    existing.transactions += 1;
    existing.items += transaction.items.reduce((total, item) => total + item.qty, 0);
    existing.revenue += transaction.total;
    daily.set(transaction.dateKey, existing);
  });
  const rows = [...daily.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  if (rows.length === 0) {
    container.innerHTML = emptyState(
      "calendar",
      "Belum ada rincian harian",
      "Rincian omzet per hari akan muncul setelah transaksi berhasil.",
      "",
      true
    );
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table responsive-table report-daily-table">
        <thead>
          <tr>
            <th scope="col">Tanggal</th>
            <th scope="col">Transaksi</th>
            <th scope="col">Minuman terjual</th>
            <th scope="col">Omzet</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td data-label="Tanggal">
                <span class="table-id">${escapeHtml(formatShortDateKey(row.dateKey, true))}</span>
                <span class="table-subcopy">${escapeHtml(formatDateShortWithDay(row.dateKey))}</span>
              </td>
              <td data-label="Transaksi">${formatNumber(row.transactions)}</td>
              <td data-label="Minuman terjual">${formatNumber(row.items)}</td>
              <td data-label="Omzet"><span class="money">${escapeHtml(formatRupiah(row.revenue))}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReports() {
  const range = state.report.range;
  const { from, to } = resolveReportRange();
  const completed = completedTransactionsInRange(from, to);
  const revenue = completed.reduce((total, transaction) => total + transaction.total, 0);
  const items = completed.reduce(
    (total, transaction) => total + transaction.items.reduce((sum, item) => sum + item.qty, 0),
    0
  );
  const average = completed.length ? revenue / completed.length : 0;

  const rangeLabel = document.getElementById("reportRangeLabel");
  if (rangeLabel) rangeLabel.textContent = reportRangeLabel(range, from, to);
  const revenueElement = document.getElementById("reportRevenue");
  if (revenueElement) revenueElement.textContent = formatRupiah(revenue);
  const transactionsElement = document.getElementById("reportTransactions");
  if (transactionsElement) transactionsElement.textContent = formatNumber(completed.length);
  const itemsElement = document.getElementById("reportItems");
  if (itemsElement) itemsElement.textContent = formatNumber(items);
  const averageElement = document.getElementById("reportAverage");
  if (averageElement) averageElement.textContent = formatRupiah(average);

  document.querySelectorAll("[data-report-range]").forEach((button) => {
    const active = button.dataset.reportRange === range;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const customRange = document.getElementById("customRange");
  if (customRange) customRange.hidden = range !== "custom";
  const fromInput = document.getElementById("reportDateFrom");
  const toInput = document.getElementById("reportDateTo");
  if (fromInput) fromInput.value = state.report.from;
  if (toInput) toInput.value = state.report.to;

  renderReportTopProducts(completed);
  renderReportCategories(completed);
  renderReportDaily(completed);
}

function selectReportRange(range) {
  if (!["today", "7days", "month", "custom"].includes(range)) return;
  if (range === "custom" && state.report.range !== "custom") {
    const current = resolveReportRange();
    state.report.from = current.from;
    state.report.to = current.to;
  }
  state.report.range = range;
  renderReports();
  if (range === "custom") {
    document.getElementById("reportDateFrom")?.focus();
  }
}

function applyCustomReportRange() {
  const fromInput = document.getElementById("reportDateFrom");
  const toInput = document.getElementById("reportDateTo");
  if (!fromInput || !toInput) return;
  const from = fromInput.value;
  const to = toInput.value;
  if (!isValidDateKey(from) || !isValidDateKey(to)) {
    showToast("error", "Rentang belum lengkap", "Pilih tanggal mulai dan tanggal akhir terlebih dahulu.");
    (!isValidDateKey(from) ? fromInput : toInput).focus();
    return;
  }
  if (from > to) {
    showToast("error", "Rentang tanggal tidak valid", "Tanggal mulai tidak boleh setelah tanggal akhir.");
    fromInput.focus();
    return;
  }
  state.report.range = "custom";
  state.report.from = from;
  state.report.to = to;
  renderReports();
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportReportCsv() {
  const { from, to } = resolveReportRange();
  const transactions = completedTransactionsInRange(from, to);
  if (transactions.length === 0) {
    showToast("info", "Belum ada data untuk diekspor", "Tidak ada transaksi berhasil pada rentang laporan ini.");
    return;
  }
  const rows = [
    ["No. Transaksi", "Tanggal", "Waktu", "Kasir", "Metode", "Jumlah Item", "Rincian Item", "Subtotal", "Diskon", "Total", "Dibayar", "Kembalian"]
  ];
  transactions.forEach((transaction) => {
    const itemCount = transaction.items.reduce((total, item) => total + item.qty, 0);
    const itemDetail = transaction.items
      .map((item) => `${item.name} (${receiptCustomizationText(item)}) x${item.qty}`)
      .join("; ");
    rows.push([
      transaction.number,
      transaction.dateKey,
      formatTime(transaction.createdAt),
      transaction.cashierName,
      PAYMENT_METHODS[transaction.paymentMethod],
      itemCount,
      itemDetail,
      transaction.subtotal,
      transaction.discount,
      transaction.total,
      transaction.paid,
      transaction.change
    ]);
  });
  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const shopName = (state.settings.shopName || "SipStation").replace(/[^\w-]+/g, "_");
  link.href = url;
  link.download = `${shopName}_Laporan_${from}_${to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("success", "Laporan diekspor", `${formatNumber(transactions.length)} transaksi diunduh sebagai CSV.`);
}

/* Settings and local data */
function settingsField(id) {
  return document.getElementById(id);
}

function populateSettingsForm() {
  const form = document.getElementById("settingsForm");
  if (!form) return;
  const settings = state.settings;
  const values = {
    settingShopName: settings.shopName,
    settingCashierName: settings.cashierName,
    settingAddress: settings.address,
    settingContact: settings.contact,
    settingLargeFee: settings.largeFee,
    settingPearlFee: settings.toppings.Pearl,
    settingJellyFee: settings.toppings.Jelly,
    settingCheeseFee: settings.toppings["Cheese Foam"]
  };
  Object.entries(values).forEach(([id, value]) => {
    const field = settingsField(id);
    if (!field) return;
    field.value = value;
    field.removeAttribute("aria-invalid");
  });
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const shopNameField = settingsField("settingShopName");
  const cashierField = settingsField("settingCashierName");
  const addressField = settingsField("settingAddress");
  const contactField = settingsField("settingContact");
  const largeField = settingsField("settingLargeFee");
  const pearlField = settingsField("settingPearlFee");
  const jellyField = settingsField("settingJellyFee");
  const cheeseField = settingsField("settingCheeseFee");
  form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));

  const shopName = shopNameField.value.trim();
  const cashierName = cashierField.value.trim();
  const address = addressField.value.trim();
  const contact = contactField.value.trim();
  const feeFields = [largeField, pearlField, jellyField, cheeseField];
  const invalidFee = feeFields.find((field) => {
    const value = Number(field.value);
    return !Number.isFinite(value) || value < 0 || value > 1000000;
  });

  const firstInvalid = (() => {
    if (shopName.length < 2) return shopNameField;
    if (cashierName.length < 2) return cashierField;
    if (address.length < 5) return addressField;
    if (contact.length > 30) return contactField;
    return invalidFee || null;
  })();

  if (firstInvalid) {
    firstInvalid.setAttribute("aria-invalid", "true");
    firstInvalid.focus();
    showToast("error", "Pengaturan belum valid", "Periksa kembali kolom yang ditandai.");
    return;
  }

  const nextSettings = normalizeSettings({
    shopName,
    cashierName,
    address,
    contact,
    largeFee: nonNegativeInt(largeField.value, 0),
    toppings: {
      Pearl: nonNegativeInt(pearlField.value, 0),
      Jelly: nonNegativeInt(jellyField.value, 0),
      "Cheese Foam": nonNegativeInt(cheeseField.value, 0)
    }
  });
  if (!writeStored(STORAGE_KEYS.settings, nextSettings)) return;
  state.settings = nextSettings;
  updateBranding();
  document.title = `${PAGE_META[state.page]?.title || "Dashboard"} · ${state.settings.shopName}`;
  renderCart();
  populateSettingsForm();
  showToast("success", "Pengaturan disimpan", "Profil kedai dan biaya kustomisasi telah diperbarui.");
}

function reloadDemoData() {
  openConfirm({
    title: "Muat ulang data demo?",
    subtitle: "Daftar menu akan diganti dengan 8 produk contoh.",
    message: "Produk yang Anda tambahkan akan dihapus dari daftar menu. Riwayat transaksi dan pengaturan kedai tidak diubah.",
    details: `<div class="availability-hint">${icon("info")} Item keranjang yang produknya tidak termasuk data demo akan ikut dihapus.</div>`,
    confirmLabel: "Muat data demo",
    cancelLabel: "Batal",
    tone: "primary",
    iconName: "refresh",
    onConfirm() {
      const demoProducts = buildDemoProducts();
      if (!writeStored(STORAGE_KEYS.products, demoProducts)) return false;
      state.products = demoProducts;
      const cartChanged = syncCartWithProducts();
      renderMenu();
      updateCartBadges();
      if (cartChanged) renderCart();
      showToast("success", "Data demo dimuat", "8 menu contoh telah dikembalikan.");
    }
  });
}

function wipeLocalData() {
  const keys = [STORAGE_KEYS.products, STORAGE_KEYS.transactions, STORAGE_KEYS.settings, STORAGE_KEYS.meta];
  const backup = {};
  try {
    keys.forEach((key) => {
      backup[key] = window.localStorage.getItem(key);
    });
    keys.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(STORAGE_KEYS.meta, JSON.stringify({
      initialized: true,
      version: 1,
      seededWithDemo: false,
      wipedAt: new Date().toISOString()
    }));
    return true;
  } catch {
    try {
      keys.forEach((key) => {
        if (backup[key] === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, backup[key]);
      });
    } catch {
      // Data di memori tetap dipakai jika pemulihan storage juga gagal.
    }
    showToast("error", "Gagal menghapus data", "Penyimpanan browser menolak operasi. Coba lagi setelah memuat ulang halaman.");
    return false;
  }
}

function requestWipeData() {
  openModal({
    title: "Hapus seluruh data?",
    subtitle: "Tindakan ini permanen dan tidak dapat dibatalkan.",
    size: "small",
    body: `
      <div class="confirm-center">
        <span class="confirm-icon-box danger">${icon("trash")}</span>
        <p class="confirm-message">Semua <strong>produk, transaksi, pengaturan, dan keranjang</strong> akan dihapus dari browser ini.</p>
        <div class="warning-note" style="margin-top:14px;text-align:left">
          ${icon("alert")}
          <p>Data yang sudah dihapus tidak dapat dipulihkan. Buat cadangan laporan terlebih dahulu jika diperlukan.</p>
        </div>
        <label class="form-field" style="margin-top:16px;text-align:left">
          <span>Ketik <strong>HAPUS</strong> untuk melanjutkan</span>
          <input type="text" id="wipeConfirmInput" autocomplete="off" spellcheck="false" data-autofocus aria-describedby="wipeConfirmHint">
          <small id="wipeConfirmHint">Konfirmasi ini mencegah penghapusan data secara tidak sengaja.</small>
        </label>
      </div>
    `,
    footer: `
      <button type="button" class="btn btn-secondary" data-modal-close>Batal</button>
      <button type="button" class="btn btn-danger" id="wipeConfirmButton" disabled>${icon("trash")} Hapus Semua Data</button>
    `,
    onMount(card) {
      const input = card.querySelector("#wipeConfirmInput");
      const button = card.querySelector("#wipeConfirmButton");
      if (!input || !button) return;
      const updateButton = () => {
        button.disabled = input.value.trim().toUpperCase() !== "HAPUS";
      };
      input.addEventListener("input", updateButton);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !button.disabled) {
          event.preventDefault();
          button.click();
        }
      });
      button.addEventListener("click", () => {
        if (input.value.trim().toUpperCase() !== "HAPUS") return;
        button.disabled = true;
        button.textContent = "Menghapus data...";
        if (!wipeLocalData()) {
          button.disabled = false;
          button.innerHTML = `${icon("trash")} Hapus Semua Data`;
          return;
        }
        state.products = [];
        state.transactions = [];
        state.settings = normalizeSettings({});
        state.cart = [];
        state.cartDiscount = 0;
        state.paymentMethod = "cash";
        state.paymentPaidInput = "";
        state.menuFilter = { search: "", category: "all" };
        state.posFilter = { search: "", category: "all" };
        state.historyFilter = { search: "", date: "", method: "all" };
        state.report = { range: "today", from: shiftDateKey(todayKey(), -6), to: todayKey() };
        updateBranding();
        renderCart();
        closeModal();
        window.history.replaceState(null, "", "#dashboard");
        renderPage("dashboard");
        showToast("success", "Seluruh data dihapus", "SipStation kembali ke kondisi kosong dengan pengaturan awal.");
      });
    }
  });
}

/* Event handling */
function handleDocumentClick(event) {
  const navTarget = event.target.closest("[data-nav-page]");
  if (navTarget) {
    event.preventDefault();
    navigateTo(navTarget.dataset.navPage);
    return;
  }

  const reportRangeButton = event.target.closest("[data-report-range]");
  if (reportRangeButton) {
    selectReportRange(reportRangeButton.dataset.reportRange);
    return;
  }

  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;

  switch (action) {
    case "clear-pos-search": {
      state.posFilter.search = "";
      const input = document.getElementById("posSearch");
      if (input) {
        input.value = "";
        input.focus();
      }
      applyPOSFilters();
      break;
    }
    case "filter-pos-category": {
      const category = trigger.dataset.category || "all";
      state.posFilter.category = category === "all" || CATEGORIES.includes(category) ? category : "all";
      applyPOSFilters();
      break;
    }
    case "reset-pos-filter": {
      state.posFilter = { search: "", category: "all" };
      const input = document.getElementById("posSearch");
      if (input) input.value = "";
      applyPOSFilters();
      break;
    }
    case "open-customizer":
      openCustomizer(trigger.dataset.id);
      break;
    case "cart-remove": {
      const key = trigger.dataset.key;
      state.cart = state.cart.filter((line) => line.key !== key);
      renderCart();
      break;
    }
    case "cart-qty": {
      const line = state.cart.find((item) => item.key === trigger.dataset.key);
      if (!line) break;
      const direction = Number(trigger.dataset.direction);
      if (direction > 0) {
        const product = getProduct(line.productId);
        if (!product) break;
        if (cartQtyForProduct(product.id) >= product.stock) {
          showToast("info", "Stok tidak mencukupi", `${product.name} hanya tersedia ${formatNumber(product.stock)} porsi.`);
          break;
        }
        line.qty += 1;
      } else if (line.qty > 1) {
        line.qty -= 1;
      }
      renderCart();
      break;
    }
    case "clear-cart":
      requestClearCart();
      break;
    case "select-payment":
      selectPaymentMethod(trigger.dataset.method);
      break;
    case "quick-cash": {
      const amount = nonNegativeInt(trigger.dataset.amount, 0);
      state.paymentPaidInput = String(amount);
      const input = document.getElementById("cashReceived");
      if (input) input.value = String(amount);
      updateCartTotals();
      break;
    }
    case "checkout":
      startCheckout();
      break;
    case "complete-payment":
      completePayment().catch((error) => {
        console.error(error);
        state.isProcessing = false;
        activeModal.dismissible = true;
        showToast("error", "Pembayaran gagal", "Terjadi kesalahan saat memproses transaksi. Silakan coba lagi.");
      });
      break;
    case "print-receipt":
      printCurrentReceipt();
      break;
    case "add-product":
      openProductForm();
      break;
    case "edit-product":
      openProductForm(trigger.dataset.id);
      break;
    case "delete-product":
      requestDeleteProduct(trigger.dataset.id);
      break;
    case "clear-menu-search": {
      state.menuFilter.search = "";
      const input = document.getElementById("menuSearch");
      if (input) {
        input.value = "";
        input.focus();
      }
      renderMenu();
      break;
    }
    case "reset-menu-filter":
      resetMenuFilters();
      break;
    case "clear-history-search": {
      state.historyFilter.search = "";
      const input = document.getElementById("historySearch");
      if (input) {
        input.value = "";
        input.focus();
      }
      renderHistory();
      break;
    }
    case "reset-history-filters":
      resetHistoryFilters();
      break;
    case "view-transaction":
      openTransactionDetail(trigger.dataset.id);
      break;
    case "cancel-transaction":
      requestCancelTransaction(trigger.dataset.id);
      break;
    case "open-receipt": {
      const transaction = state.transactions.find((item) => item.id === trigger.dataset.id);
      if (transaction) openReceipt(transaction);
      break;
    }
    case "export-csv":
      exportReportCsv();
      break;
    case "apply-custom-range":
      applyCustomReportRange();
      break;
    case "reload-demo":
      reloadDemoData();
      break;
    case "wipe-data":
      requestWipeData();
      break;
    default:
      break;
  }
}

function handleDocumentInput(event) {
  const id = event.target.id;
  if (id === "posSearch") {
    state.posFilter.search = event.target.value;
    applyPOSFilters();
    return;
  }
  if (id === "menuSearch") {
    state.menuFilter.search = event.target.value;
    renderMenu();
    return;
  }
  if (id === "historySearch") {
    state.historyFilter.search = event.target.value;
    renderHistory();
    return;
  }
  handleCartInput(event);
  if (event.target.closest("#settingsForm")) {
    event.target.removeAttribute("aria-invalid");
  }
}

function handleDocumentChange(event) {
  const id = event.target.id;
  if (id === "menuCategory") {
    const value = event.target.value;
    state.menuFilter.category = value === "all" || CATEGORIES.includes(value) ? value : "all";
    renderMenu();
    return;
  }
  if (id === "historyDate") {
    state.historyFilter.date = isValidDateKey(event.target.value) ? event.target.value : "";
    renderHistory();
    return;
  }
  if (id === "historyMethod") {
    const value = event.target.value;
    state.historyFilter.method = Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, value) ? value : "all";
    renderHistory();
  }
}

function handleImageError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches("img[data-drink-image]")) return;
  const fallback = document.createElement("span");
  fallback.className = ["product-fallback", image.className].filter(Boolean).join(" ");
  fallback.innerHTML = icon("cup");
  image.replaceWith(fallback);
}

let resizeFrame = 0;
function handleWindowResize() {
  if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    updateHeaderDate();
    resizeFrame = 0;
  });
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("input", handleDocumentInput);
  document.addEventListener("change", handleDocumentChange);
  document.addEventListener("focusout", handleCartFocusOut);
  document.addEventListener("error", handleImageError, true);
  document.getElementById("settingsForm")?.addEventListener("submit", handleSettingsSubmit);
  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("resize", handleWindowResize);
}

function init() {
  initializeData();
  bindEvents();
  if (!PAGE_META[window.location.hash.replace(/^#/, "")]) {
    window.history.replaceState(null, "", "#dashboard");
  }
  handleRoute();
}

document.addEventListener("DOMContentLoaded", init);








