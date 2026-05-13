import { useEffect, useMemo, useState } from "react";
import liff from "@line/liff";
import {
  Minus,
  Plus,
  ShoppingCart,
  History,
  Send,
  CheckCircle2,
  AlertCircle,
  Search,
  RotateCcw
} from "lucide-react";
import { fetchProductsFromMaster } from "./productApi.js";

const LIFF_ID = import.meta.env.VITE_LIFF_ID || "";
const ORDER_API_URL = import.meta.env.VITE_ORDER_API_URL || "";
const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE ?? "true") === "true";


const translations = {
  ja: {
    appTitle: "LINE発注ミニアプリ",
    demo: "DEMO",
    master: "MASTER",
    customerSuffix: "様",
    sameAsLast: "{t.sameAsLast}",
    selectProducts: "{t.selectProducts}",
    reset: "{t.reset}",
    loadedMaster: (customerName, customerId) => `${customerName} 専用の商品・価格を読み込みました。顧客ID: ${customerId}`,
    deliveryRule: (text) => text,
    fallbackProducts: "デモ用の商品一覧で表示しています。",
    chooseProducts: "商品を選択",
    frequentProducts: "よく注文する商品を上に表示しています。",
    searchPlaceholder: "商品名・カテゴリで検索",
    frequent: "定番",
    noProducts: "表示できる商品がありません。商品マスタを確認してください。",
    selected: "選択中",
    orderConfirm: "{t.orderConfirm}",
    confirmTitle: "注文内容確認",
    confirmDesc: "納品希望日と時間帯を指定してください。",
    noProductSelected: "商品が選択されていません。",
    deliveryDate: "納品希望日",
    tomorrow: "明日",
    dayAfterTomorrow: "明後日",
    threeDaysLater: "3日後",
    deliveryTime: "時間帯",
    morning: "午前",
    afternoon: "午後",
    noPreference: "指定なし",
    note: "備考",
    notePlaceholder: "例：いつもの搬入口へ、欠品時は代替相談希望など",
    productSubtotal: "商品小計",
    shippingFee: "送料",
    freeShippingLine: "送料無料ライン",
    shippingByCase: "送料は都度確認です。注文後に担当者より確定連絡します。",
    grandTotal: "合計金額",
    finalAmountNote: "実際の請求額は在庫・単価確認後に確定します。",
    back: "{t.back}",
    sending: "送信中...",
    submitOrder: "注文を送信",
    orderReceived: "注文を受付しました",
    orderReceivedDesc: "在庫確認後、担当者より確定連絡を行います。",
    newOrder: "{t.newOrder}",
    stockFree: (status, qty, unit) => `${status || "未設定"} / フリー在庫 ${qty ?? 0}${unit}`,
    deliveryAllowed: "配送可能曜日",
    leadDays: "最短リード",
    days: "日",
    weekdays: ["日", "月", "火", "水", "木", "金", "土"],
    chooseDeliveryDate: "納品希望日を選択してください。",
    invalidDate: "日付形式が正しくありません。",
    minDeliveryDate: (date) => `最短納品日は${date}以降です。`,
    weekdayUnavailable: "この曜日は配送不可です。",
    noDeliveryDate: "この日は配送不可日に設定されています。",
    noItemError: "商品が選択されていません。数量を入力してください。",
    thankYou: "ご注文ありがとうございます。",
    accepted: "下記内容で受付しました。",
    deliveryDateLabel: "納品希望日",
    deliveryTimeLabel: "時間帯",
    productSubtotalLabel: "商品小計",
    shippingLabel: "送料",
    totalLabel: "合計",
    noteLabel: "備考",
    contactAfterStock: "在庫確認後、確定連絡いたします。",
    language: "English"
  },
  en: {
    appTitle: "LINE Order Mini App",
    demo: "DEMO",
    master: "MASTER",
    customerSuffix: "",
    sameAsLast: "Repeat last order",
    selectProducts: "Select items",
    reset: "Reset",
    loadedMaster: (customerName, customerId) => `Loaded dedicated products and prices for ${customerName}. Customer ID: ${customerId}`,
    deliveryRule: (text) => text,
    fallbackProducts: "Showing demo products instead.",
    chooseProducts: "Select products",
    frequentProducts: "Frequently ordered items are shown first.",
    searchPlaceholder: "Search by product name or category",
    frequent: "Frequent",
    noProducts: "No products available. Please check the product master.",
    selected: "Selected",
    orderConfirm: "Review order",
    confirmTitle: "Order confirmation",
    confirmDesc: "Please select the requested delivery date and time slot.",
    noProductSelected: "No product selected.",
    deliveryDate: "Requested delivery date",
    tomorrow: "Tomorrow",
    dayAfterTomorrow: "Day after tomorrow",
    threeDaysLater: "In 3 days",
    deliveryTime: "Time slot",
    morning: "Morning",
    afternoon: "Afternoon",
    noPreference: "No preference",
    note: "Notes",
    notePlaceholder: "e.g. Use the usual delivery entrance, contact us if an item is short",
    productSubtotal: "Product subtotal",
    shippingFee: "Shipping fee",
    freeShippingLine: "Free shipping threshold",
    shippingByCase: "Shipping fee will be confirmed case by case after order submission.",
    grandTotal: "Total",
    finalAmountNote: "Final billing amount will be confirmed after stock and price check.",
    back: "Back",
    sending: "Sending...",
    submitOrder: "Submit order",
    orderReceived: "Order received",
    orderReceivedDesc: "We will confirm stock and contact you with the final confirmation.",
    newOrder: "Create new order",
    stockFree: (status, qty, unit) => `${status || "Not set"} / Free stock ${qty ?? 0}${unit}`,
    deliveryAllowed: "Available delivery days",
    leadDays: "Minimum lead time",
    days: "day(s)",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    chooseDeliveryDate: "Please select a requested delivery date.",
    invalidDate: "Invalid date format.",
    minDeliveryDate: (date) => `The earliest delivery date is ${date}.`,
    weekdayUnavailable: "Delivery is not available on this weekday.",
    noDeliveryDate: "This date is set as unavailable for delivery.",
    noItemError: "No product selected. Please enter quantity.",
    thankYou: "Thank you for your order.",
    accepted: "We have received the following order.",
    deliveryDateLabel: "Requested delivery date",
    deliveryTimeLabel: "Time slot",
    productSubtotalLabel: "Product subtotal",
    shippingLabel: "Shipping fee",
    totalLabel: "Total",
    noteLabel: "Notes",
    contactAfterStock: "We will confirm stock and contact you with the final confirmation.",
    language: "日本語"
  }
};

function getInitialLanguage() {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get("lang");
  if (lang === "en" || lang === "ja") return lang;

  const saved = window.localStorage.getItem("lineOrderLang");
  if (saved === "en" || saved === "ja") return saved;

  return "ja";
}



function getCustomerIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("customerId") || "CUST-A";
}

const demoLastOrder = {
  deliveryDateLabel: "前回：金曜午前",
  items: [
    { productId: "BACON-45", quantity: 2 },
    { productId: "PATTY-5K", quantity: 5 },
    { productId: "PICKLE-5G", quantity: 1 },
    { productId: "BUNS-CASE", quantity: 3 }
  ]
};

function formatJPY(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY"
  }).format(value);
}

function calculateShippingFee(customer, productSubtotal) {
  const rule = customer?.shippingRule || "固定";
  const baseFee = Number(customer?.shippingFee || 0);
  const freeLine = Number(customer?.freeShippingLine || 0);

  if (rule === "無料") return 0;
  if (rule === "都度") return 0;
  if (freeLine > 0 && productSubtotal >= freeLine) return 0;

  return baseFee;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMinDeliveryDate(customer) {
  const leadDays = Number(customer?.deliverySettings?.leadDays || 1);
  const d = new Date();
  d.setDate(d.getDate() + leadDays);
  return formatDateKey(d);
}

function isDeliveryDateAllowed(customer, dateText, t) {
  if (!dateText) return { ok: false, reason: t.chooseDeliveryDate };

  const settings = customer?.deliverySettings || {};
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { ok: false, reason: t.invalidDate };

  const minDateText = getMinDeliveryDate(customer);
  if (dateText < minDateText) {
    return { ok: false, reason: t.minDeliveryDate(minDateText) };
  }

  const allowedWeekdays = settings.allowedWeekdays || [1, 2, 3, 4, 5];
  if (!allowedWeekdays.includes(date.getDay())) {
    return { ok: false, reason: t.weekdayUnavailable };
  }

  const noDeliveryDates = settings.noDeliveryDates || [];
  if (noDeliveryDates.includes(dateText)) {
    return { ok: false, reason: t.noDeliveryDate };
  }

  return { ok: true, reason: "" };
}

function getDeliveryRuleText(customer, t) {
  const settings = customer?.deliverySettings || {};
  const allowed = (settings.allowedWeekdays || [1, 2, 3, 4, 5]).map((d) => t.weekdays[d]).join("・");
  const leadDays = Number(settings.leadDays || 1);
  return `${t.deliveryAllowed}: ${allowed} / ${t.leadDays}: ${leadDays}${t.days}`;
}

function getTomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getRelativeDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildOrderMessage(order, t) {
  const lines = order.items.map((item) => {
    return `・${item.name}: ${item.quantity}${item.unit}`;
  });

  return [
    t.thankYou,
    t.accepted,
    "",
    ...lines,
    "",
    `${t.deliveryDateLabel}: ${order.deliveryDate}`,
    `${t.deliveryTimeLabel}: ${order.deliveryTime}`,
    "",
    `${t.productSubtotalLabel}: ${formatJPY(order.productSubtotal || 0)}`,
    `${t.shippingLabel}: ${formatJPY(order.shippingFee || 0)}`,
    `${t.totalLabel}: ${formatJPY(order.totalAmount || 0)}`,
    order.note ? `${t.noteLabel}: ${order.note}` : "",
    "",
    t.contactAfterStock
  ]
    .filter(Boolean)
    .join("\n");
}

export default function App() {
  const [lang, setLang] = useState(getInitialLanguage());
  const t = translations[lang];

  const [profile, setProfile] = useState({
    userId: "demo-user-001",
    displayName: "A商店",
    pictureUrl: ""
  });
  const [customerId] = useState(getCustomerIdFromUrl());
  const [customer, setCustomer] = useState({ customerId: "CUST-A", customerName: "A商店" });
  const [products, setProducts] = useState([]);
  const [productSource, setProductSource] = useState("loading");
  const [productError, setProductError] = useState("");
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [liffError, setLiffError] = useState("");
  const [screen, setScreen] = useState("order");
  const [query, setQuery] = useState("");
  const [quantities, setQuantities] = useState({});
  const [deliveryDate, setDeliveryDate] = useState(getTomorrowIso());
  const [deliveryTime, setDeliveryTime] = useState("午前");
  const [note, setNote] = useState("");
  const [deliveryDateError, setDeliveryDateError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  useEffect(() => {
    async function initLiff() {
      if (!LIFF_ID || DEMO_MODE) {
        setIsLiffReady(true);
        return;
      }

      try {
        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const lineProfile = await liff.getProfile();
        setProfile(lineProfile);
        setIsLiffReady(true);
      } catch (error) {
        setLiffError(error?.message || "LIFF初期化に失敗しました");
        setIsLiffReady(true);
      }
    }

    initLiff();
  }, [customerId]);

  useEffect(() => {
    async function loadProducts() {
      const result = await fetchProductsFromMaster(ORDER_API_URL, customerId);
      setProducts(result.products);
      setCustomer(result.customer || { customerId, customerName: profile.displayName || "A商店" });
      setProfile((current) => ({
        ...current,
        displayName: result.customer?.customerName || current.displayName
      }));
      setProductSource(result.source);
      setProductError(result.error || "");
    }

    loadProducts();
  }, [customerId]);

  useEffect(() => {
    if (customer?.deliverySettings) {
      const minDate = getMinDeliveryDate(customer);
      if (!deliveryDate || deliveryDate < minDate) {
        setDeliveryDate(minDate);
      }
    }
  }, [customer, deliveryDate]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) => {
      return [product.name, product.spec, product.category, product.id]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [query]);

  const orderItems = useMemo(() => {
    return products
      .map((product) => ({
        ...product,
        quantity: Number(quantities[product.id] || 0),
        subtotal: Number(quantities[product.id] || 0) * product.price
      }))
      .filter((item) => item.quantity > 0);
  }, [quantities]);

  const productSubtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + item.subtotal, 0);
  }, [orderItems]);

  const shippingFee = useMemo(() => {
    return calculateShippingFee(customer, productSubtotal);
  }, [customer, productSubtotal]);

  const totalAmount = productSubtotal + shippingFee;

  function updateQuantity(productId, delta) {
    const product = products.find((p) => p.id === productId);
    const maxQty = Number(product?.availableStock ?? 999999);

    if (product && product.canOrder === false) return;

    setQuantities((current) => {
      const next = Math.min(maxQty, Math.max(0, Number(current[productId] || 0) + delta));
      return { ...current, [productId]: next };
    });
  }

  function setQuantity(productId, value) {
    const product = products.find((p) => p.id === productId);
    const maxQty = Number(product?.availableStock ?? 999999);
    const parsed = Math.min(maxQty, Math.max(0, Number(value || 0)));
    setQuantities((current) => ({ ...current, [productId]: parsed }));
  }

  function applyLastOrder() {
    const next = {};
    demoLastOrder.items.forEach((item) => {
      next[item.productId] = item.quantity;
    });
    setQuantities(next);
    setScreen("confirm");
  }

  function clearOrder() {
    setQuantities({});
    setNote("");
    setDeliveryDate(getTomorrowIso());
    setDeliveryTime("午前");
    setSubmitResult(null);
    setScreen("order");
  }

  function toggleLanguage() {
    const next = lang === "ja" ? "en" : "ja";
    setLang(next);
    window.localStorage.setItem("lineOrderLang", next);
  }

  async function submitOrder() {
    if (orderItems.length === 0) {
      setSubmitResult({
        ok: false,
        message: t.noItemError
      });
      return;
    }

    const deliveryCheck = isDeliveryDateAllowed(customer, deliveryDate, t);
    if (!deliveryCheck.ok) {
      setDeliveryDateError(deliveryCheck.reason);
      setSubmitResult({
        ok: false,
        message: deliveryCheck.reason
      });
      return;
    }

    setDeliveryDateError("");
    setSubmitting(true);
    setSubmitResult(null);

    const order = {
      orderId: `ORD-${Date.now()}`,
      orderedAt: new Date().toISOString(),
      customer: {
        customerId,
        lineUserId: profile.userId,
        displayName: customer.customerName || profile.displayName
      },
      deliveryDate,
      deliveryTime,
      note,
      items: orderItems.map((item) => ({
        productId: item.id,
        name: item.name,
        spec: item.spec,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.subtotal
      })),
      productSubtotal,
      shippingFee,
      totalAmount
    };

    try {
      if (ORDER_API_URL) {
        const response = await fetch(ORDER_API_URL, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(order)
        });

        // Google Apps Script + no-corsではレスポンス本文を読めないため、送信成功として扱います。
        void response;
      } else {
        console.info("DEMO ORDER", order);
      }

      const message = buildOrderMessage({
        ...order,
        deliveryDate,
        deliveryTime,
        items: orderItems
      }, t);

      if (!DEMO_MODE && LIFF_ID && liff.isInClient() && liff.isApiAvailable("sendMessages")) {
        await liff.sendMessages([{ type: "text", text: message }]);
      }

      setSubmitResult({
        ok: true,
        message,
        order
      });
      setScreen("done");
    } catch (error) {
      setSubmitResult({
        ok: false,
        message: error?.message || "注文送信に失敗しました。"
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLiffReady) {
    return (
      <div className="app-shell center">
        <div className="loading-card">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t.appTitle}</p>
          <h1>{customer.customerName || profile.displayName || "Customer"}{t.customerSuffix}</h1>
        </div>
        <div className="top-actions">
          <button type="button" className="lang-toggle" onClick={toggleLanguage}>{t.language}</button>
          <div className="pill">{productSource === "master" ? t.master : (DEMO_MODE ? t.demo : "LIFF")}</div>
        </div>
      </header>

      {liffError && (
        <div className="notice error">
          <AlertCircle size={18} />
          <span>{liffError}</span>
        </div>
      )}

      {productSource === "master" && (
        <div className="notice success">
          <CheckCircle2 size={18} />
          <span>{t.loadedMaster(customer.customerName, customerId)}</span>
        </div>
      )}

      {productSource === "master" && (
        <div className="notice info">
          <AlertCircle size={18} />
          <span>{getDeliveryRuleText(customer, t)}</span>
        </div>
      )}

      {productError && (
        <div className="notice warning">
          <AlertCircle size={18} />
          <span>{productError} {t.fallbackProducts}</span>
        </div>
      )}

      <nav className="quick-actions">
        <button type="button" onClick={applyLastOrder}>
          <History size={18} />
          {t.sameAsLast}
        </button>
        <button type="button" onClick={() => setScreen("order")}>
          <ShoppingCart size={18} />
          {t.selectProducts}
        </button>
        <button type="button" onClick={clearOrder}>
          <RotateCcw size={18} />
          {t.reset}
        </button>
      </nav>

      {screen === "order" && (
        <main className="card">
          <section className="section-title">
            <h2>{t.chooseProducts}</h2>
            <p>{t.frequentProducts}</p>
          </section>

          <label className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
            />
          </label>

          <div className="product-list">
            {filteredProducts.length === 0 && (
              <div className="empty">{t.noProducts}</div>
            )}

            {filteredProducts
              .slice()
              .sort((a, b) => Number(b.frequent) - Number(a.frequent))
              .map((product) => {
                const quantity = Number(quantities[product.id] || 0);
                return (
                  <article className={`product ${quantity > 0 ? "selected" : ""}`} key={product.id}>
                    <div className="product-main">
                      <div>
                        <div className="product-name">
                          {product.name}
                          {product.frequent && <span>{t.frequent}</span>}
                        </div>
                        <p>{product.spec}</p>
                        <strong>{formatJPY(product.price)} / {product.unit}</strong>
                        <div className={`stock-badge ${product.canOrder ? "ok" : "ng"}`}>
                          {t.stockFree(product.stockStatus, product.availableStock, product.unit)}
                        </div>
                      </div>
                    </div>
                    <div className="quantity-control">
                      <button type="button" disabled={!product.canOrder} onClick={() => updateQuantity(product.id, -1)}>
                        <Minus size={18} />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={quantity}
                        disabled={!product.canOrder}
                        onChange={(e) => setQuantity(product.id, e.target.value)}
                      />
                      <button type="button" disabled={!product.canOrder} onClick={() => updateQuantity(product.id, 1)}>
                        <Plus size={18} />
                      </button>
                    </div>
                  </article>
                );
              })}
          </div>

          <div className="sticky-summary">
            <div>
              <span>{t.selected}</span>
              <strong>{orderItems.length}商品 / {formatJPY(totalAmount)}</strong>
            </div>
            <button type="button" className="primary" onClick={() => setScreen("confirm")}>
              {t.orderConfirm}
            </button>
          </div>
        </main>
      )}

      {screen === "confirm" && (
        <main className="card">
          <section className="section-title">
            <h2>{t.confirmTitle}</h2>
            <p>{t.confirmDesc}</p>
          </section>

          {orderItems.length === 0 ? (
            <div className="empty">{t.noProductSelected}</div>
          ) : (
            <div className="order-lines">
              {orderItems.map((item) => (
                <div className="order-line" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.quantity}{item.unit} × {formatJPY(item.price)}</p>
                  </div>
                  <span>{formatJPY(item.subtotal)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="form-grid">
            <label>
              {t.deliveryDate}
              <input
                type="date"
                value={deliveryDate}
                min={getMinDeliveryDate(customer)}
                onChange={(e) => {
                  const value = e.target.value;
                  setDeliveryDate(value);
                  const result = isDeliveryDateAllowed(customer, value);
                  setDeliveryDateError(result.ok ? "" : result.reason);
                }}
              />
              {deliveryDateError && <small className="field-error">{deliveryDateError}</small>}
            </label>

            <div className="date-buttons">
              <button type="button" onClick={() => {
                const d = getRelativeDate(1);
                setDeliveryDate(d);
                const r = isDeliveryDateAllowed(customer, d);
                setDeliveryDateError(r.ok ? "" : r.reason);
              }}>{t.tomorrow}</button>
              <button type="button" onClick={() => {
                const d = getRelativeDate(2);
                setDeliveryDate(d);
                const r = isDeliveryDateAllowed(customer, d);
                setDeliveryDateError(r.ok ? "" : r.reason);
              }}>{t.dayAfterTomorrow}</button>
              <button type="button" onClick={() => {
                const d = getRelativeDate(3);
                setDeliveryDate(d);
                const r = isDeliveryDateAllowed(customer, d);
                setDeliveryDateError(r.ok ? "" : r.reason);
              }}>{t.threeDaysLater}</button>
            </div>

            <label>
              {t.deliveryTime}
              <select value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)}>
                <option value="午前">{t.morning}</option>
                <option value="午後">{t.afternoon}</option>
                <option value="指定なし">{t.noPreference}</option>
              </select>
            </label>

            <label>
              {t.note}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.notePlaceholder}
              />
            </label>
          </div>

          <div className="total-box">
            <div className="price-row">
              <span>{t.productSubtotal}</span>
              <strong>{formatJPY(productSubtotal)}</strong>
            </div>
            <div className="price-row">
              <span>{t.shippingFee}</span>
              <strong>{formatJPY(shippingFee)}</strong>
            </div>
            {customer.freeShippingLine > 0 && shippingFee > 0 && (
              <small>{t.freeShippingLine}: {formatJPY(customer.freeShippingLine)}</small>
            )}
            {customer.shippingRule === "都度" && (
              <small>{t.shippingByCase}</small>
            )}
            <div className="price-row total">
              <span>{t.grandTotal}</span>
              <strong>{formatJPY(totalAmount)}</strong>
            </div>
            <small>{t.finalAmountNote}</small>
          </div>

          {submitResult && !submitResult.ok && (
            <div className="notice error">
              <AlertCircle size={18} />
              <span>{submitResult.message}</span>
            </div>
          )}

          <div className="button-row">
            <button type="button" className="secondary" onClick={() => setScreen("order")}>
              {t.back}
            </button>
            <button type="button" className="primary" disabled={submitting} onClick={submitOrder}>
              <Send size={18} />
              {submitting ? t.sending : t.submitOrder}
            </button>
          </div>
        </main>
      )}

      {screen === "done" && (
        <main className="card success-card">
          <CheckCircle2 size={52} />
          <h2>{t.orderReceived}</h2>
          <p>{t.orderReceivedDesc}</p>

          {submitResult?.message && (
            <pre className="message-preview">{submitResult.message}</pre>
          )}

          <button type="button" className="primary full" onClick={clearOrder}>
            {t.newOrder}
          </button>
        </main>
      )}
    </div>
  );
}
