/**
 * LINE発注ミニアプリ用 Google Apps Script
 * 商品マスタ管理版
 *
 * 方針:
 * - 商品は「商品マスタ」でのみ管理する
 * - 注文に含まれる商品IDが商品マスタに存在しない場合、受注登録しない
 * - 在庫管理は商品マスタを元に作成する
 * - 自由に商品が在庫登録される挙動を禁止
 *
 * 作成・整形されるシート:
 * - Dashboard
 * - 商品マスタ
 * - 受注管理
 * - 受注明細
 * - 在庫管理
 * - 商品別集計
 * - 設定
 */

const SHEET_DASHBOARD = "Dashboard";
const SHEET_PRODUCT_MASTER = "商品マスタ";
const SHEET_CUSTOMER_MASTER = "顧客マスタ";
const SHEET_CUSTOMER_PRODUCT_SETTINGS = "顧客別商品設定";
const SHEET_CUSTOMER_URLS = "顧客別URL一覧";
const SHEET_CUSTOMER_DELIVERY_SETTINGS = "顧客別配送設定";
const SHEET_NO_DELIVERY_DATES = "配送不可日";
const SHEET_ORDERS = "受注管理";
const SHEET_DETAILS = "受注明細";
const SHEET_INVENTORY = "在庫管理";
const SHEET_PRODUCT_SUMMARY = "商品別集計";
const SHEET_SETTINGS = "設定";

/**
 * 運用設定
 * 必要に応じて値を変更してください。
 */
const APP_BASE_URL_DEFAULT = "http://localhost:5173/";
const ADMIN_EMAIL_DEFAULT = "";



function doPost(e) {
  try {
    setupWorkbook_();

    const payload = JSON.parse(e.postData.contents);
    const items = payload.items || [];
    const customerId = payload.customer?.customerId || "CUST-A";
    const customer = getCustomerById_(customerId);

    if (!customer || customer.status !== "有効") {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: false,
          error: "顧客マスタに存在しない、または停止中の顧客です。",
          customerId
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const deliveryValidation = validateDeliveryDateForCustomer_(customerId, payload.deliveryDate);
    if (!deliveryValidation.ok) {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: false,
          error: deliveryValidation.reason,
          customerId,
          deliveryDate: payload.deliveryDate
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const invalidItems = validateOrderItemsForCustomer_(items, customerId);
    if (invalidItems.length > 0) {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: false,
          error: "商品マスタに存在しない商品が含まれています。",
          invalidItems
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orderSheet = ss.getSheetByName(SHEET_ORDERS);
    const detailSheet = ss.getSheetByName(SHEET_DETAILS);

    const orderId = payload.orderId || `ORD-${Date.now()}`;
    const orderedAt = payload.orderedAt ? new Date(payload.orderedAt) : new Date();

    const productSubtotal = calculateProductSubtotal_(items, customerId);
    const shippingFee = calculateShippingFee_(customerId, productSubtotal);
    const grandTotal = productSubtotal + shippingFee;

    orderSheet.appendRow([
      orderId,
      orderedAt,
      payload.customer?.lineUserId || "",
      customerId,
      customer.customerName,
      payload.deliveryDate || "",
      payload.deliveryTime || "",
      payload.note || "",
      productSubtotal,
      shippingFee,
      grandTotal,
      "未処理",
      "",
      "",
      "",
      "",
      "",
      "未確認",
      new Date()
    ]);

    const customerProductMap = getCustomerProductMap_(customerId);

    items.forEach((item) => {
      const cp = customerProductMap[item.productId];

      detailSheet.appendRow([
        orderId,
        orderedAt,
        customer.customerName,
        cp.productId,
        cp.productName,
        cp.spec,
        item.quantity || 0,
        cp.unit,
        cp.price,
        (item.quantity || 0) * cp.price,
        "未処理"
      ]);
    });

    syncOrderStatusToDetails_();
    syncInventoryFromProductMaster_();
    refreshInventoryFormulas_();
    sendAdminOrderNotification_(orderId, customer.customerName, items, customerId);
    formatWorkbook_();

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, orderId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  const callback = e && e.parameter && e.parameter.callback;
  const customerId = (e && e.parameter && e.parameter.customerId) || "CUST-A";

  // 商品一覧取得は高速化のため、setupWorkbook_ は実行しない
  if (action === "products") {
    try {
      const result = getProductsForCustomer_(customerId);
      const json = JSON.stringify({ ok: true, ...result });

      // ブラウザ側のCORS回避用。callback指定がある場合はJSONPとして返す。
      if (callback) {
        return ContentService
          .createTextOutput(`${callback}(${json});`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }

      return ContentService
        .createTextOutput(json)
        .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
      const json = JSON.stringify({ ok: false, error: error.message });

      if (callback) {
        return ContentService
          .createTextOutput(`${callback}(${json});`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }

      return ContentService
        .createTextOutput(json)
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 通常アクセス時だけ初期化
  setupWorkbook_();

  return ContentService
    .createTextOutput("LINE order app endpoint is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Apps Script画面で手動実行する初期化関数
 */
function initializeWorkbook() {
  setupWorkbook_();
}

/**
 * 商品マスタと在庫管理を同期する手動実行用関数
 * 商品マスタを編集したあとに実行してください。
 */
function syncProductMasterToInventory() {
  setupWorkbook_();
  syncInventoryFromProductMaster_();
  refreshInventoryFormulas_();
  refreshCustomerUrls_();
  formatWorkbook_();
}
/**
 * 顧客別URL一覧を更新する手動実行用関数
 */
function refreshCustomerUrls() {
  setupWorkbook_();
  refreshCustomerUrls_();
  formatWorkbook_();
}

/**
 * 受注ステータスに応じて明細ステータスを同期する手動実行用関数
 */
function syncOrderStatusToDetails() {
  syncOrderStatusToDetails_();
  refreshInventoryFormulas_();
  formatWorkbook_();
}

/**
 * 設定値を取得
 */
function getSettingValue_(label, defaultValue) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) return defaultValue;

  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().flat();
  const index = values.indexOf(label);
  if (index === -1) return defaultValue;

  const value = sh.getRange(index + 2, 1).getValue();
  return value === "" || value === null ? defaultValue : value;
}

/**
 * 顧客別URL一覧を作成
 */
function refreshCustomerUrls_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const customerSheet = ss.getSheetByName(SHEET_CUSTOMER_MASTER);
  const urlSheet = ss.getSheetByName(SHEET_CUSTOMER_URLS);
  if (!customerSheet || !urlSheet) return;

  const appBaseUrl = getSettingValue_("アプリ基本URL", APP_BASE_URL_DEFAULT);
  const normalizedBase = String(appBaseUrl).includes("?")
    ? String(appBaseUrl).split("?")[0]
    : String(appBaseUrl).replace(/\/$/, "/");

  const lastRow = customerSheet.getLastRow();
  if (lastRow < 2) return;

  const customers = customerSheet.getRange(2, 1, lastRow - 1, 8).getValues()
    .filter(row => row[0]);

  if (urlSheet.getLastRow() >= 2) {
    urlSheet.getRange(2, 1, urlSheet.getLastRow() - 1, 6).clearContent();
  }

  const rows = customers.map(row => {
    const customerId = row[0];
    const customerName = row[1];
    const status = row[3];
    const url = `${normalizedBase}?customerId=${encodeURIComponent(customerId)}`;
    return [customerId, customerName, status, url, url, row[4] || ""];
  });

  if (rows.length > 0) {
    urlSheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }
}



/**
 * 全体初期化
 */
function setupWorkbook_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  getOrCreateSheet_(ss, SHEET_SETTINGS, [
    ["ステータス"],
    ["未処理"],
    ["確認済"],
    ["出荷待ち"],
    ["出荷済"],
    ["キャンセル"],
    [""],
    ["在庫確認"],
    ["未確認"],
    ["在庫OK"],
    ["一部欠品"],
    ["欠品"],
    [""],
    ["時間帯"],
    ["午前"],
    ["午後"],
    ["指定なし"],
    [""],
    ["在庫ステータス"],
    ["在庫OK"],
    ["要確認"],
    ["不足"],
    ["未設定"],
    [""],
    ["商品ステータス"],
    ["有効"],
    ["停止"],
    [""],
    ["アプリ基本URL"],
    [APP_BASE_URL_DEFAULT],
    [""],
    ["管理者通知メール"],
    [ADMIN_EMAIL_DEFAULT],
    [""],
    ["在庫不足時の注文"],
    ["ブロック"]
  ]);

  getOrCreateSheet_(ss, SHEET_PRODUCT_MASTER, [
    [
      "商品ID",
      "商品名",
      "規格",
      "単位",
      "単価",
      "カテゴリ",
      "定番表示",
      "初期在庫",
      "入庫予定",
      "ファーム",
      "出荷済",
      "安全在庫",
      "商品ステータス",
      "備考"
    ],
    ["BACON-45", "JONES ベーコン", "4.5kg / case", "cs", 18200, "加工肉", true, 100, 0, 0, 0, 10, "有効", ""],
    ["PATTY-5K", "ビーフパティ 6mm", "5kg / case", "cs", 10550, "加工肉", true, 80, 0, 0, 0, 10, "有効", ""],
    ["PICKLE-5G", "ナチュラルピクルス 5gal", "5gal / pail", "pail", 10200, "ピクルス", true, 50, 0, 0, 0, 5, "有効", ""],
    ["PICKLE-2G", "ナチュラルピクルス 2gal", "2gal / pail", "pail", 5800, "ピクルス", false, 30, 0, 0, 0, 5, "有効", ""],
    ["LINKS-20", "ソーセージリンクス 20pc", "20pc / pack", "pack", 815, "加工肉", true, 120, 0, 0, 0, 20, "有効", ""],
    ["LINKS-200", "ソーセージリンクス 200pc", "200pc / case", "cs", 5800, "加工肉", false, 40, 0, 0, 0, 5, "有効", ""],
    ["BUNS-CASE", "バンズ", "case", "cs", 7500, "パン", true, 60, 0, 0, 0, 10, "有効", ""]
  ]);

  getOrCreateSheet_(ss, SHEET_CUSTOMER_MASTER, [
    ["顧客ID", "顧客名", "LINEユーザーID", "ステータス", "送料ルール", "基本送料", "送料無料ライン", "備考"],
    ["CUST-A", "A商店", "", "有効", "固定", 1000, 30000, "デモ顧客"],
    ["CUST-B", "Bレストラン", "", "有効", "固定", 1500, 50000, "価格・表示商品の違い確認用"],
    ["CUST-C", "Cカフェ", "", "停止", "固定", 1000, 30000, "停止顧客デモ"]
  ]);

  getOrCreateSheet_(ss, SHEET_CUSTOMER_PRODUCT_SETTINGS, [
    ["顧客ID", "商品ID", "表示可否", "顧客別単価", "表示順", "備考"],
    ["CUST-A", "BACON-45", "表示", 18200, 1, ""],
    ["CUST-A", "PATTY-5K", "表示", 10550, 2, ""],
    ["CUST-A", "PICKLE-5G", "表示", 10200, 3, ""],
    ["CUST-B", "BACON-45", "表示", 18800, 1, "B社向け価格"],
    ["CUST-B", "PATTY-5K", "非表示", 10550, 2, "B社には販売しない"],
    ["CUST-B", "BUNS-CASE", "表示", 7600, 3, ""]
  ]);

  getOrCreateSheet_(ss, SHEET_CUSTOMER_URLS, [[
    "顧客ID",
    "顧客名",
    "ステータス",
    "発注ページURL",
    "QRコード用URL",
    "備考"
  ]]);

  getOrCreateSheet_(ss, SHEET_CUSTOMER_DELIVERY_SETTINGS, [
    ["顧客ID", "月", "火", "水", "木", "金", "土", "日", "祝日配送", "最短リード日数", "備考"],
    ["CUST-A", true, true, true, true, true, false, false, false, 1, "土日祝不可"],
    ["CUST-B", true, true, true, true, true, true, false, false, 1, "日祝不可"],
    ["CUST-C", true, true, true, true, true, false, false, false, 2, "停止顧客デモ"]
  ]);

  getOrCreateSheet_(ss, SHEET_NO_DELIVERY_DATES, [
    ["日付", "名称", "全顧客共通", "対象顧客ID", "備考"],
    ["2026-01-01", "元日", true, "", "必要に応じて更新"],
    ["2026-01-12", "成人の日", true, "", "必要に応じて更新"],
    ["2026-02-11", "建国記念の日", true, "", "必要に応じて更新"],
    ["2026-02-23", "天皇誕生日", true, "", "必要に応じて更新"]
  ]);

  getOrCreateSheet_(ss, SHEET_ORDERS, [[
    "受注ID",
    "受注日時",
    "LINEユーザーID",
    "顧客ID",
    "取引先名",
    "納品希望日",
    "時間帯",
    "備考",
    "商品小計",
    "送料",
    "合計金額",
    "ステータス",
    "担当者",
    "出荷予定日",
    "配送方法",
    "送り状番号",
    "社内メモ",
    "在庫確認",
    "更新日時"
  ]]);

  getOrCreateSheet_(ss, SHEET_DETAILS, [[
    "受注ID",
    "受注日時",
    "取引先名",
    "商品ID",
    "商品名",
    "規格",
    "数量",
    "単位",
    "単価",
    "小計",
    "明細ステータス"
  ]]);

  getOrCreateSheet_(ss, SHEET_INVENTORY, [[
    "商品ID",
    "商品名",
    "規格",
    "単位",
    "初期在庫",
    "入庫予定",
    "ファーム",
    "受注済",
    "出荷済",
    "フリー在庫",
    "安全在庫",
    "在庫ステータス",
    "最終受注日",
    "備考"
  ]]);

  getOrCreateSheet_(ss, SHEET_DASHBOARD, [
    ["LINE発注管理 Dashboard", "", "", ""],
    ["総受注件数", "", "未処理件数", ""],
    ["本日受注件数", "", "当月受注金額", ""],
    ["出荷待ち件数", "", "欠品・一部欠品", ""],
    ["在庫不足商品数", "", "要確認商品数", ""],
    ["有効商品数", "", "停止商品数", ""],
    ["", "", "", ""],
    ["ステータス別件数", "", "", ""],
    ["ステータス", "件数", "", ""],
    ["未処理", "", "", ""],
    ["確認済", "", "", ""],
    ["出荷待ち", "", "", ""],
    ["出荷済", "", "", ""],
    ["キャンセル", "", "", ""]
  ]);

  getOrCreateSheet_(ss, SHEET_PRODUCT_SUMMARY, [
    ["商品別集計", "", "", ""],
    ["商品名", "数量合計", "売上合計", "最終受注日"]
  ]);

  syncInventoryFromProductMaster_();
  setDashboardFormulas_();
  setProductSummaryFormulas_();
  refreshInventoryFormulas_();
  refreshCustomerUrls_();
  setValidations_();
  formatWorkbook_();
}


/**
 * 顧客IDから顧客情報を取得
 */
function getCustomerById_(customerId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_CUSTOMER_MASTER);
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const values = sh.getRange(2, 1, lastRow - 1, 8).getValues();

  for (const row of values) {
    if (row[0] === customerId) {
      return {
        customerId: row[0],
        customerName: row[1],
        lineUserId: row[2],
        status: row[3] || "有効",
        shippingRule: row[4] || "固定",
        shippingFee: Number(row[5] || 0),
        freeShippingLine: Number(row[6] || 0),
        note: row[7] || ""
      };
    }
  }

  return null;
}


/**
 * 商品IDごとの在庫情報を取得
 */
function getInventoryInfo_(productId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_INVENTORY);
  if (!sh) {
    return { freeStock: 0, stockStatus: "未設定" };
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    return { freeStock: 0, stockStatus: "未設定" };
  }

  const values = sh.getRange(2, 1, lastRow - 1, 12).getValues();

  for (const row of values) {
    if (row[0] === productId) {
      return {
        freeStock: Number(row[9] || 0),
        stockStatus: row[11] || "未設定"
      };
    }
  }

  return { freeStock: 0, stockStatus: "未設定" };
}


/**
 * 顧客別配送設定を取得
 */
function getDeliverySettingsForCustomer_(customerId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_CUSTOMER_DELIVERY_SETTINGS);

  const defaultSettings = {
    allowedWeekdays: [1, 2, 3, 4, 5],
    holidayDelivery: false,
    leadDays: 1,
    noDeliveryDates: getNoDeliveryDatesForCustomer_(customerId)
  };

  if (!sh || sh.getLastRow() < 2) return defaultSettings;

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();

  for (const row of values) {
    if (row[0] !== customerId) continue;

    const allowedWeekdays = [];
    // JavaScript: 0=日, 1=月, 2=火, ..., 6=土
    if (row[1] === true) allowedWeekdays.push(1);
    if (row[2] === true) allowedWeekdays.push(2);
    if (row[3] === true) allowedWeekdays.push(3);
    if (row[4] === true) allowedWeekdays.push(4);
    if (row[5] === true) allowedWeekdays.push(5);
    if (row[6] === true) allowedWeekdays.push(6);
    if (row[7] === true) allowedWeekdays.push(0);

    return {
      allowedWeekdays,
      holidayDelivery: row[8] === true,
      leadDays: Number(row[9] || 1),
      noDeliveryDates: getNoDeliveryDatesForCustomer_(customerId)
    };
  }

  return defaultSettings;
}

/**
 * 配送不可日を取得
 */
function getNoDeliveryDatesForCustomer_(customerId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NO_DELIVERY_DATES);
  if (!sh || sh.getLastRow() < 2) return [];

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  const dates = [];

  values.forEach(row => {
    const rawDate = row[0];
    const isCommon = row[2] === true;
    const targetCustomerId = row[3];

    if (!rawDate) return;
    if (!isCommon && targetCustomerId !== customerId) return;

    const dateText = formatDateKey_(rawDate);
    if (dateText) dates.push(dateText);
  });

  return dates;
}

/**
 * 配送希望日を検証
 */
function validateDeliveryDateForCustomer_(customerId, deliveryDateText) {
  if (!deliveryDateText) {
    return { ok: false, reason: "納品希望日が未入力です。" };
  }

  const deliverySettings = getDeliverySettingsForCustomer_(customerId);
  const date = new Date(deliveryDateText + "T00:00:00");
  if (isNaN(date.getTime())) {
    return { ok: false, reason: "納品希望日の形式が正しくありません。" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + Number(deliverySettings.leadDays || 1));

  if (date < minDate) {
    return {
      ok: false,
      reason: `最短納品日は${formatDateKey_(minDate)}以降です。`
    };
  }

  const weekday = date.getDay();
  if (!deliverySettings.allowedWeekdays.includes(weekday)) {
    return { ok: false, reason: "指定された曜日は配送不可です。" };
  }

  const dateKey = formatDateKey_(date);
  if (deliverySettings.noDeliveryDates.includes(dateKey)) {
    return { ok: false, reason: "指定日は配送不可日に設定されています。" };
  }

  return { ok: true };
}

/**
 * yyyy-mm-dd形式に変換
 */
function formatDateKey_(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 顧客別の商品一覧を取得
 */
function getProductsForCustomer_(customerId) {
  const customer = getCustomerById_(customerId);
  if (!customer || customer.status !== "有効") {
    return {
      customer: {
        customerId,
        customerName: "未登録顧客"
      },
      products: []
    };
  }

  const customerProductMap = getCustomerProductMap_(customerId);

  const products = Object.keys(customerProductMap)
    .map((key) => customerProductMap[key])
    .filter((product) => product.displayStatus === "表示")
    .sort((a, b) => (a.displayOrder || 9999) - (b.displayOrder || 9999))
    .map((product) => {
      const stock = getInventoryInfo_(product.productId);
      return {
        id: product.productId,
        name: product.productName,
        spec: product.spec,
        unit: product.unit,
        price: product.price,
        category: product.category,
        frequent: product.frequent === true || String(product.frequent).toLowerCase() === "true",
        stockStatus: stock.stockStatus,
        availableStock: stock.freeStock,
        canOrder: stock.stockStatus !== "不足" && stock.freeStock > 0
      };
    });

  return {
    customer: {
      ...customer,
      shippingRule: customer.shippingRule || "固定",
      shippingFee: Number(customer.shippingFee || 0),
      freeShippingLine: Number(customer.freeShippingLine || 0),
      deliverySettings: getDeliverySettingsForCustomer_(customer.customerId)
    },
    products
  };
}

/**
 * 顧客別商品設定を反映した商品Map
 * 顧客別商品設定に明示された商品だけを表示対象にします。
 */
function getCustomerProductMap_(customerId) {
  const productMap = getProductMasterMap_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingSheet = ss.getSheetByName(SHEET_CUSTOMER_PRODUCT_SETTINGS);
  const result = {};

  if (!settingSheet) return result;

  const lastRow = settingSheet.getLastRow();
  if (lastRow < 2) return result;

  const settings = settingSheet.getRange(2, 1, lastRow - 1, 6).getValues();

  settings.forEach((row) => {
    const rowCustomerId = row[0];
    const productId = row[1];

    if (rowCustomerId !== customerId) return;
    if (!productId) return;

    const master = productMap[productId];
    if (!master) return;
    if (master.status !== "有効") return;

    const displayStatus = row[2] || "表示";
    const customPrice = row[3];
    const displayOrder = Number(row[4] || 9999);

    result[productId] = {
      ...master,
      price: customPrice !== "" && customPrice !== null ? Number(customPrice) : master.unitPrice,
      displayStatus,
      displayOrder
    };
  });

  return result;
}

/**
 * 顧客別条件で注文商品を検証
 */
function validateOrderItemsForCustomer_(items, customerId) {
  const customerProductMap = getCustomerProductMap_(customerId);
  const invalidItems = [];

  items.forEach((item) => {
    const productId = item.productId || "";
    const cp = customerProductMap[productId];

    if (!cp) {
      invalidItems.push({
        productId,
        name: item.name || "",
        reason: "この顧客には販売設定されていません"
      });
      return;
    }

    if (cp.displayStatus !== "表示") {
      invalidItems.push({
        productId,
        name: cp.productName,
        reason: "この顧客には非表示の商品です"
      });
      return;
    }

    const stockPolicy = getSettingValue_("在庫不足時の注文", "ブロック");
    const stock = getInventoryInfo_(productId);
    const requestedQty = Number(item.quantity || 0);

    if (stockPolicy === "ブロック" && requestedQty > stock.freeStock) {
      invalidItems.push({
        productId,
        name: cp.productName,
        reason: `在庫不足: 注文数 ${requestedQty} / フリー在庫 ${stock.freeStock}`
      });
    }
  });

  return invalidItems;
}

/**
 * サーバー側で商品小計を再計算
 */
function calculateProductSubtotal_(items, customerId) {
  const customerProductMap = getCustomerProductMap_(customerId);
  return items.reduce((sum, item) => {
    const cp = customerProductMap[item.productId];
    if (!cp) return sum;
    return sum + Number(item.quantity || 0) * Number(cp.price || 0);
  }, 0);
}

/**
 * 顧客別送料を計算
 * 送料ルール:
 * - 固定: 基本送料を加算。ただし送料無料ライン以上なら0円
 * - 無料: 送料0円
 * - 都度: 送料0円で登録し、備考・社内確認で調整
 */
function calculateShippingFee_(customerId, productSubtotal) {
  const customer = getCustomerById_(customerId);
  if (!customer) return 0;

  const rule = customer.shippingRule || "固定";
  const baseFee = Number(customer.shippingFee || 0);
  const freeLine = Number(customer.freeShippingLine || 0);

  if (rule === "無料") return 0;
  if (rule === "都度") return 0;

  if (freeLine > 0 && productSubtotal >= freeLine) {
    return 0;
  }

  return baseFee;
}

/**
 * 注文商品が商品マスタに存在するかチェック
 */
function validateOrderItems_(items) {
  const productMap = getProductMasterMap_();
  const invalidItems = [];

  items.forEach((item) => {
    const productId = item.productId || "";
    const master = productMap[productId];

    if (!master) {
      invalidItems.push({
        productId,
        name: item.name || "",
        reason: "商品マスタ未登録"
      });
      return;
    }

    if (master.status !== "有効") {
      invalidItems.push({
        productId,
        name: master.productName,
        reason: "商品ステータスが有効ではありません"
      });
    }
  });

  return invalidItems;
}

/**
 * 商品マスタをMap化
 */
function getProductMasterMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_PRODUCT_MASTER);
  const lastRow = sh.getLastRow();
  const map = {};

  if (lastRow < 2) return map;

  const values = sh.getRange(2, 1, lastRow - 1, 14).getValues();

  values.forEach((row) => {
    const productId = row[0];
    if (!productId) return;

    map[productId] = {
      productId: row[0],
      productName: row[1],
      spec: row[2],
      unit: row[3],
      unitPrice: Number(row[4] || 0),
      category: row[5],
      frequent: row[6],
      initialStock: Number(row[7] || 0),
      incomingStock: Number(row[8] || 0),
      firmStock: Number(row[9] || 0),
      shippedStock: Number(row[10] || 0),
      safetyStock: Number(row[11] || 0),
      status: row[12] || "有効",
      note: row[13] || ""
    };
  });

  return map;
}


/**
 * アプリ表示用の商品一覧を商品マスタから取得
 * 商品ステータス「有効」のみ返します。
 */
function getActiveProductsForApp_() {
  const productMap = getProductMasterMap_();

  return Object.keys(productMap)
    .map((key) => productMap[key])
    .filter((product) => product.status === "有効")
    .map((product) => ({
      id: product.productId,
      name: product.productName,
      spec: product.spec,
      unit: product.unit,
      price: product.unitPrice,
      category: product.category,
      frequent: product.frequent === true || String(product.frequent).toLowerCase() === "true"
    }));
}

/**
 * 商品マスタを在庫管理に同期
 * 在庫管理に勝手に商品を増やすのではなく、商品マスタを唯一の正とする
 */
function syncInventoryFromProductMaster_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_PRODUCT_MASTER);
  const inventorySheet = ss.getSheetByName(SHEET_INVENTORY);

  const masterLastRow = masterSheet.getLastRow();
  if (masterLastRow < 2) return;

  const masterValues = masterSheet.getRange(2, 1, masterLastRow - 1, 14).getValues();

  const existingLastRow = inventorySheet.getLastRow();
  const existingMap = {};
  if (existingLastRow >= 2) {
    const existingValues = inventorySheet.getRange(2, 1, existingLastRow - 1, 14).getValues();
    existingValues.forEach((row) => {
      if (row[0]) {
        existingMap[row[0]] = row;
      }
    });
  }

  if (existingLastRow >= 2) {
    inventorySheet.getRange(2, 1, existingLastRow - 1, 14).clearContent();
  }

  const inventoryRows = masterValues
    .filter((row) => row[0])
    .map((row) => {
      const productId = row[0];
      const existing = existingMap[productId] || [];

      return [
        productId,
        row[1],                              // 商品名
        row[2],                              // 規格
        row[3],                              // 単位
        row[7] || existing[4] || 0,           // 初期在庫
        row[8] || existing[5] || 0,           // 入庫予定
        row[9] || existing[6] || 0,           // ファーム
        "",                                  // 受注済 数式
        row[10] || existing[8] || 0,          // 出荷済
        "",                                  // フリー在庫 数式
        row[11] || existing[10] || 0,         // 安全在庫
        "",                                  // 在庫ステータス 数式
        "",                                  // 最終受注日 数式
        row[13] || existing[13] || ""         // 備考
      ];
    });

  if (inventoryRows.length > 0) {
    inventorySheet.getRange(2, 1, inventoryRows.length, 14).setValues(inventoryRows);
  }
}


/**
 * 管理者へ注文通知メールを送信
 */
function sendAdminOrderNotification_(orderId, customerName, items, customerId) {
  const adminEmail = getSettingValue_("管理者通知メール", ADMIN_EMAIL_DEFAULT);
  if (!adminEmail) return;

  const lines = items.map(item => {
    const cp = getCustomerProductMap_(customerId)[item.productId];
    const name = cp ? cp.productName : item.name;
    const unit = cp ? cp.unit : item.unit;
    return `・${name}: ${item.quantity}${unit}`;
  }).join("\\n");

  const productSubtotal = calculateProductSubtotal_(items, customerId);
  const shippingFee = calculateShippingFee_(customerId, productSubtotal);
  const grandTotal = productSubtotal + shippingFee;

  const subject = `【LINE発注】新規注文 ${orderId} / ${customerName}`;
  const body = `新規注文を受け付けました。

━━━━━━━━━━━━━━━━
■ 受注情報
━━━━━━━━━━━━━━━━

受注ID：${orderId}
顧客名：${customerName}

━━━━━━━━━━━━━━━━
■ 注文内容
━━━━━━━━━━━━━━━━

${lines}

━━━━━━━━━━━━━━━━
■ 金額
━━━━━━━━━━━━━━━━

商品小計：${productSubtotal.toLocaleString()}円
送料：${shippingFee.toLocaleString()}円
合計：${grandTotal.toLocaleString()}円

━━━━━━━━━━━━━━━━
■ 次の対応
━━━━━━━━━━━━━━━━

スプレッドシートの「受注管理」シートを確認し、在庫確認・出荷手配を行ってください。`;

  MailApp.sendEmail(adminEmail, subject, body);
}

/**
 * 受注管理のステータスを受注明細へ反映
 * 出荷済にした受注は、明細も出荷済になり、在庫管理の出荷済へ集計されます。
 */
function syncOrderStatusToDetails_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName(SHEET_ORDERS);
  const detailSheet = ss.getSheetByName(SHEET_DETAILS);
  if (!orderSheet || !detailSheet) return;

  const orderLastRow = orderSheet.getLastRow();
  const detailLastRow = detailSheet.getLastRow();
  if (orderLastRow < 2 || detailLastRow < 2) return;

  const orderValues = orderSheet.getRange(2, 1, orderLastRow - 1, 19).getValues();
  const statusMap = {};

  orderValues.forEach(row => {
    const orderId = row[0];
    const status = row[11]; // L列 ステータス
    if (orderId) statusMap[orderId] = status;
  });

  const detailValues = detailSheet.getRange(2, 1, detailLastRow - 1, 11).getValues();
  const newStatuses = detailValues.map(row => {
    const orderId = row[0];
    return [statusMap[orderId] || row[10] || "未処理"];
  });

  detailSheet.getRange(2, 11, newStatuses.length, 1).setValues(newStatuses);
}

/**
 * Dashboard数式
 */
function setDashboardFormulas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_DASHBOARD);

  sh.getRange("B2").setFormula(`=COUNTA('${SHEET_ORDERS}'!A2:A)`);
  sh.getRange("D2").setFormula(`=COUNTIF('${SHEET_ORDERS}'!L2:L,"未処理")`);
  sh.getRange("B3").setFormula(`=COUNTIFS('${SHEET_ORDERS}'!B2:B,">="&TODAY(),'${SHEET_ORDERS}'!B2:B,"<"&TODAY()+1)`);
  sh.getRange("D3").setFormula(`=SUMIFS('${SHEET_ORDERS}'!K2:K,'${SHEET_ORDERS}'!B2:B,">="&EOMONTH(TODAY(),-1)+1,'${SHEET_ORDERS}'!B2:B,"<"&EOMONTH(TODAY(),0)+1)`);
  sh.getRange("B4").setFormula(`=COUNTIF('${SHEET_ORDERS}'!L2:L,"出荷待ち")`);
  sh.getRange("D4").setFormula(`=COUNTIF('${SHEET_ORDERS}'!R2:R,"一部欠品")+COUNTIF('${SHEET_ORDERS}'!O2:O,"欠品")`);
  sh.getRange("B5").setFormula(`=COUNTIF('${SHEET_INVENTORY}'!L2:L,"不足")`);
  sh.getRange("D5").setFormula(`=COUNTIF('${SHEET_INVENTORY}'!L2:L,"要確認")`);
  sh.getRange("B6").setFormula(`=COUNTIF('${SHEET_PRODUCT_MASTER}'!M2:M,"有効")`);
  sh.getRange("D6").setFormula(`=COUNTIF('${SHEET_PRODUCT_MASTER}'!M2:M,"停止")`);

  sh.getRange("B10").setFormula(`=COUNTIF('${SHEET_ORDERS}'!L2:L,A10)`);
  sh.getRange("B11").setFormula(`=COUNTIF('${SHEET_ORDERS}'!L2:L,A11)`);
  sh.getRange("B12").setFormula(`=COUNTIF('${SHEET_ORDERS}'!L2:L,A12)`);
  sh.getRange("B13").setFormula(`=COUNTIF('${SHEET_ORDERS}'!L2:L,A13)`);
  sh.getRange("B14").setFormula(`=COUNTIF('${SHEET_ORDERS}'!L2:L,A14)`);
}

/**
 * 商品別集計数式
 */
function setProductSummaryFormulas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_PRODUCT_SUMMARY);

  sh.getRange("A3").setFormula(`=SORT(UNIQUE(FILTER('${SHEET_DETAILS}'!E2:E,'${SHEET_DETAILS}'!E2:E<>"")))`);
  sh.getRange("B3").setFormula(`=ARRAYFORMULA(IF(A3:A="","",SUMIF('${SHEET_DETAILS}'!E:E,A3:A,'${SHEET_DETAILS}'!G:G)))`);
  sh.getRange("C3").setFormula(`=ARRAYFORMULA(IF(A3:A="","",SUMIF('${SHEET_DETAILS}'!E:E,A3:A,'${SHEET_DETAILS}'!J:J)))`);
  sh.getRange("D3").setFormula(`=ARRAYFORMULA(IF(A3:A="","",MAXIFS('${SHEET_DETAILS}'!B:B,'${SHEET_DETAILS}'!E:E,A3:A)))`);
}

/**
 * 在庫管理数式更新
 */
function refreshInventoryFormulas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_INVENTORY);
  if (!sh) return;

  // L列「在庫ステータス」は数式で自動判定するため、既存の入力規則を削除
  sh.getRange("L2:L1000").clearDataValidations();

  const lastRow = Math.max(sh.getLastRow(), 2);
  if (lastRow < 2) return;

  for (let row = 2; row <= lastRow; row++) {
    const productId = sh.getRange(row, 1).getValue();
    if (!productId) continue;

    // 受注済: キャンセル・出荷済以外の明細数量
    sh.getRange(row, 8).setFormula(
      `=SUMIFS('${SHEET_DETAILS}'!G:G,'${SHEET_DETAILS}'!D:D,A${row},'${SHEET_DETAILS}'!K:K,"<>キャンセル",'${SHEET_DETAILS}'!K:K,"<>出荷済")`
    );

    // 出荷済: 明細ステータスが出荷済の数量
    sh.getRange(row, 9).setFormula(
      `=SUMIFS('${SHEET_DETAILS}'!G:G,'${SHEET_DETAILS}'!D:D,A${row},'${SHEET_DETAILS}'!K:K,"出荷済")`
    );

    sh.getRange(row, 10).setFormula(
      `=E${row}+F${row}-G${row}-H${row}-I${row}`
    );

    sh.getRange(row, 12).setFormula(
      `=IF(E${row}+F${row}=0,"未設定",IF(J${row}<0,"不足",IF(J${row}<=K${row},"要確認","在庫OK")))`
    );

    sh.getRange(row, 13).setFormula(
      `=IFERROR(MAXIFS('${SHEET_DETAILS}'!B:B,'${SHEET_DETAILS}'!D:D,A${row}),"")`
    );
  }
}

/**
 * プルダウン設定
 */
function setValidations_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName(SHEET_ORDERS);
  const detailSheet = ss.getSheetByName(SHEET_DETAILS);
  const inventorySheet = ss.getSheetByName(SHEET_INVENTORY);
  const masterSheet = ss.getSheetByName(SHEET_PRODUCT_MASTER);
  const settingsSheet = ss.getSheetByName(SHEET_SETTINGS);

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(settingsSheet.getRange("A2:A6"), true)
    .setAllowInvalid(false)
    .build();

  const stockCheckRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(settingsSheet.getRange("A9:A12"), true)
    .setAllowInvalid(false)
    .build();

  const productStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(settingsSheet.getRange("A26:A27"), true)
    .setAllowInvalid(false)
    .build();

  orderSheet.getRange("L2:L1000").setDataValidation(statusRule);
  orderSheet.getRange("R2:R1000").setDataValidation(stockCheckRule);
  detailSheet.getRange("K2:K1000").setDataValidation(statusRule);
  // 在庫管理 L列「在庫ステータス」は数式列のため、入力規則を設定しない
  inventorySheet.getRange("L2:L1000").clearDataValidations();
  masterSheet.getRange("M2:M1000").setDataValidation(productStatusRule);

  const customerSheet = ss.getSheetByName(SHEET_CUSTOMER_MASTER);
  const customerProductSheet = ss.getSheetByName(SHEET_CUSTOMER_PRODUCT_SETTINGS);

  const customerStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["有効", "停止"], true)
    .setAllowInvalid(false)
    .build();

  const displayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["表示", "非表示"], true)
    .setAllowInvalid(false)
    .build();

  customerSheet.getRange("D2:D1000").setDataValidation(customerStatusRule);

  const shippingRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["固定", "無料", "都度"], true)
    .setAllowInvalid(false)
    .build();

  customerSheet.getRange("E2:E1000").setDataValidation(shippingRule);
  customerProductSheet.getRange("C2:C1000").setDataValidation(displayRule);

  const deliverySheet = ss.getSheetByName(SHEET_CUSTOMER_DELIVERY_SETTINGS);
  const noDeliverySheet = ss.getSheetByName(SHEET_NO_DELIVERY_DATES);

  const checkboxRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  deliverySheet.getRange("B2:I1000").setDataValidation(checkboxRule);
  noDeliverySheet.getRange("C2:C1000").setDataValidation(checkboxRule);
}

/**
 * 全体整形
 */
function formatWorkbook_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  formatDashboard_(ss.getSheetByName(SHEET_DASHBOARD));
  formatProductMaster_(ss.getSheetByName(SHEET_PRODUCT_MASTER));
  formatCustomerMaster_(ss.getSheetByName(SHEET_CUSTOMER_MASTER));
  formatCustomerProductSettings_(ss.getSheetByName(SHEET_CUSTOMER_PRODUCT_SETTINGS));
  formatCustomerUrls_(ss.getSheetByName(SHEET_CUSTOMER_URLS));
  formatCustomerDeliverySettings_(ss.getSheetByName(SHEET_CUSTOMER_DELIVERY_SETTINGS));
  formatNoDeliveryDates_(ss.getSheetByName(SHEET_NO_DELIVERY_DATES));
  formatOrders_(ss.getSheetByName(SHEET_ORDERS));
  formatDetails_(ss.getSheetByName(SHEET_DETAILS));
  formatInventory_(ss.getSheetByName(SHEET_INVENTORY));
  formatProductSummary_(ss.getSheetByName(SHEET_PRODUCT_SUMMARY));
  formatSettings_(ss.getSheetByName(SHEET_SETTINGS));
}

function formatDashboard_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.getRange("A1:D1").merge();
  sh.getRange("A1")
    .setBackground("#1F4E79")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(16)
    .setHorizontalAlignment("center");

  sh.getRange("A2:D6")
    .setBackground("#EAF3F8")
    .setBorder(true, true, true, true, true, true);

  sh.getRange("A2:A6").setFontWeight("bold");
  sh.getRange("C2:C6").setFontWeight("bold");
  sh.getRange("B2:B6").setFontSize(14).setFontWeight("bold").setHorizontalAlignment("right");
  sh.getRange("D2:D6").setFontSize(14).setFontWeight("bold").setHorizontalAlignment("right");
  sh.getRange("D3").setNumberFormat("¥#,##0");

  sh.getRange("A8:B8")
    .setBackground("#1F4E79")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");
  sh.getRange("A9:B14").setBorder(true, true, true, true, true, true);
  sh.getRange("A9:B9").setBackground("#D9EAF7").setFontWeight("bold");

  sh.setColumnWidths(1, 4, 150);
  sh.setRowHeights(1, 14, 28);
}

function formatProductMaster_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  const lastCol = 14;
  sh.getRange(1, 1, 1, lastCol)
    .setBackground("#B45309")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sh.getRange("E:E").setNumberFormat("¥#,##0");
  sh.getRange("H:L").setNumberFormat("#,##0");
  sh.getRange("A1:N1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);

  const widths = [120,200,160,80,100,120,90,90,90,90,90,90,110,220];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));

  applyProductMasterConditionalFormatting_(sh);
}


function formatCustomerMaster_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 8)
    .setBackground("#2563EB")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const widths = [120,180,220,100,110,100,130,260];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange("A1:H1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);
}

function formatCustomerProductSettings_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.getRange(1, 1, 1, 6)
    .setBackground("#9333EA")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sh.getRange("D:D").setNumberFormat("¥#,##0");
  const widths = [120,140,100,110,90,260];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange("A1:F1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);
}


function formatCustomerUrls_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 6)
    .setBackground("#0EA5E9")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const widths = [120,180,100,360,360,220];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange("A1:F1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);
}


function formatCustomerDeliverySettings_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.getRange(1, 1, 1, 11)
    .setBackground("#059669")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const widths = [120,60,60,60,60,60,60,60,100,120,260];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange("A1:K1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);
}

function formatNoDeliveryDates_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 5)
    .setBackground("#BE123C")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sh.getRange("A:A").setNumberFormat("yyyy-mm-dd");
  const widths = [120,180,120,140,260];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange("A1:E1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);
}

function formatOrders_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  const lastCol = 19;
  sh.getRange(1, 1, 1, lastCol)
    .setBackground("#0F766E")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sh.getRange("A:S").setVerticalAlignment("middle");
  sh.getRange("B:B").setNumberFormat("yyyy-mm-dd hh:mm");
  sh.getRange("E:E").setNumberFormat("yyyy-mm-dd");
  sh.getRange("I:K").setNumberFormat("¥#,##0");
  sh.getRange("N:N").setNumberFormat("yyyy-mm-dd");
  sh.getRange("S:S").setNumberFormat("yyyy-mm-dd hh:mm");

  const widths = [160,140,180,110,140,110,90,220,110,90,110,100,100,110,120,150,220,110,140];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));

  sh.getRange("A1:S1000").setBorder(true, true, true, true, true, true, "#D9E2EC", SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange("A2:S1000").setWrap(true);

  applyOrderConditionalFormatting_(sh);
}

function formatDetails_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  const lastCol = 11;
  sh.getRange(1, 1, 1, lastCol)
    .setBackground("#374151")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sh.getRange("B:B").setNumberFormat("yyyy-mm-dd hh:mm");
  sh.getRange("G:G").setNumberFormat("#,##0");
  sh.getRange("I:J").setNumberFormat("¥#,##0");

  const widths = [160,140,140,120,180,160,80,80,100,100,110];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));

  sh.getRange("A1:K1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);
}

function formatInventory_(sh) {
  if (!sh) return;

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  const lastCol = 14;
  sh.getRange(1, 1, 1, lastCol)
    .setBackground("#7C3AED")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sh.getRange("E:K").setNumberFormat("#,##0");
  sh.getRange("M:M").setNumberFormat("yyyy-mm-dd hh:mm");
  sh.getRange("A1:N1000").setBorder(true, true, true, true, true, true, "#E5E7EB", SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange("A2:N1000").setWrap(true);

  const widths = [120,200,160,80,90,90,90,90,90,100,90,120,140,220];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));

  applyInventoryConditionalFormatting_(sh);
}

function formatProductSummary_(sh) {
  if (!sh) return;

  sh.getRange("A1:D1").merge();
  sh.getRange("A1")
    .setBackground("#1F4E79")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(14)
    .setHorizontalAlignment("center");

  sh.getRange("A2:D2")
    .setBackground("#D9EAF7")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sh.getRange("B:B").setNumberFormat("#,##0");
  sh.getRange("C:C").setNumberFormat("¥#,##0");
  sh.getRange("D:D").setNumberFormat("yyyy-mm-dd");

  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 100);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 130);
}

function formatSettings_(sh) {
  if (!sh) return;

  sh.getRange("A1:A1").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.getRange("A8:A8").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.getRange("A14:A14").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.getRange("A19:A19").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.getRange("A25:A25").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.getRange("A29:A29").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.getRange("A33:A33").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.getRange("A37:A37").setBackground("#0F766E").setFontColor("#FFFFFF").setFontWeight("bold");
  sh.setColumnWidth(1, 240);
}

function applyProductMasterConditionalFormatting_(sh) {
  const range = sh.getRange("A2:N1000");
  const rules = [];

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$M2="停止"')
    .setBackground("#E7E6E6")
    .setFontColor("#999999")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$M2="有効"')
    .setBackground("#FFFFFF")
    .setRanges([range])
    .build());

  sh.setConditionalFormatRules(rules);
}

function applyOrderConditionalFormatting_(sh) {
  const range = sh.getRange("A2:S1000");
  const rules = [];

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="未処理"')
    .setBackground("#FFF2CC")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="確認済"')
    .setBackground("#E2F0D9")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="出荷待ち"')
    .setBackground("#DDEBF7")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="出荷済"')
    .setBackground("#E7E6E6")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="キャンセル"')
    .setBackground("#F4CCCC")
    .setFontColor("#990000")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=OR($R2="欠品",$R2="一部欠品")')
    .setFontColor("#C00000")
    .setBold(true)
    .setRanges([sh.getRange("R2:R1000")])
    .build());

  sh.setConditionalFormatRules(rules);
}

function applyInventoryConditionalFormatting_(sh) {
  const range = sh.getRange("A2:N1000");
  const rules = [];

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="在庫OK"')
    .setBackground("#E2F0D9")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="要確認"')
    .setBackground("#FFF2CC")
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="不足"')
    .setBackground("#F4CCCC")
    .setFontColor("#990000")
    .setBold(true)
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2="未設定"')
    .setBackground("#E7E6E6")
    .setRanges([range])
    .build());

  sh.setConditionalFormatRules(rules);
}

function getOrCreateSheet_(ss, name, initialValues) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0 && initialValues && initialValues.length > 0) {
    sheet.getRange(1, 1, initialValues.length, initialValues[0].length).setValues(initialValues);
  }

  return sheet;
}
