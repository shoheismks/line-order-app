/**
 * LINE発注ミニアプリ用 Google Apps Script
 *
 * 使い方:
 * 1. Googleスプレッドシートを作成
 * 2. 拡張機能 > Apps Script を開く
 * 3. このコードを貼り付ける
 * 4. デプロイ > 新しいデプロイ > ウェブアプリ
 * 5. 実行ユーザー: 自分
 * 6. アクセスできるユーザー: 全員
 * 7. 発行されたURLをReact側の VITE_ORDER_API_URL に設定
 */

const SHEET_NAME = "受注管理";
const DETAIL_SHEET_NAME = "受注明細";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const orderSheet = getOrCreateSheet_(ss, SHEET_NAME, [
      "受注ID",
      "受注日時",
      "LINEユーザーID",
      "取引先名",
      "納品希望日",
      "時間帯",
      "備考",
      "合計金額",
      "ステータス"
    ]);

    const detailSheet = getOrCreateSheet_(ss, DETAIL_SHEET_NAME, [
      "受注ID",
      "商品ID",
      "商品名",
      "規格",
      "数量",
      "単位",
      "単価",
      "小計"
    ]);

    orderSheet.appendRow([
      payload.orderId,
      payload.orderedAt,
      payload.customer?.lineUserId || "",
      payload.customer?.displayName || "",
      payload.deliveryDate || "",
      payload.deliveryTime || "",
      payload.note || "",
      payload.totalAmount || 0,
      "未処理"
    ]);

    (payload.items || []).forEach((item) => {
      detailSheet.appendRow([
        payload.orderId,
        item.productId,
        item.name,
        item.spec,
        item.quantity,
        item.unit,
        item.unitPrice,
        item.subtotal
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, orderId: payload.orderId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput("LINE order app endpoint is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}
