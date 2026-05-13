# LINE発注ミニアプリ MVP

食品卸・飲食店向けの「LINE内ミニ発注アプリ」MVPです。

## できること

- 商品一覧表示
- よく注文する商品表示
- 数量のプラス・マイナス入力
- 前回と同じ注文
- 納品希望日・時間帯・備考入力
- 注文確認
- Google Apps Script経由でGoogleスプレッドシートへ保存
- LIFF上では注文完了メッセージをLINEトークへ送信

## 構成

```text
LINE公式アカウント
↓
リッチメニュー「発注する」
↓
LIFFアプリ
↓
React/Vite
↓
Google Apps Script Web App
↓
Googleスプレッドシート
```

## ローカル起動

```bash
npm install
npm run dev
```

ブラウザで表示されたURLを開くと、デモモードで動きます。

## 環境変数

`.env.example` を `.env` にコピーして設定します。

```bash
cp .env.example .env
```

```env
VITE_LIFF_ID=LINE Developersで発行したLIFF ID
VITE_ORDER_API_URL=Google Apps ScriptのWebアプリURL
VITE_DEMO_MODE=true
```

本番LIFFで動かす場合は以下にします。

```env
VITE_DEMO_MODE=false
```

## Googleスプレッドシート連携

1. Googleスプレッドシートを作成
2. `拡張機能 > Apps Script`
3. `google-apps-script/Code.gs` の内容を貼り付ける
4. `デプロイ > 新しいデプロイ > ウェブアプリ`
5. 実行ユーザー: 自分
6. アクセスできるユーザー: 全員
7. 発行されたURLを `.env` の `VITE_ORDER_API_URL` に貼り付ける

## LIFF設定

1. LINE DevelopersでProviderを作成
2. Messaging API Channelを作成
3. LIFFアプリを追加
4. Endpoint URLにVercelなどで公開したURLを設定
5. 発行されたLIFF IDを `.env` の `VITE_LIFF_ID` に設定
6. LINE公式アカウントのリッチメニューにLIFF URLを設定

## Vercel公開

```bash
npm run build
```

GitHubにアップロードし、VercelでImportすると公開できます。

VercelのEnvironment Variablesに以下を設定してください。

- `VITE_LIFF_ID`
- `VITE_ORDER_API_URL`
- `VITE_DEMO_MODE`

## 商品マスタ変更

`src/products.js` を編集してください。

## 注意

このMVPは受注受付のデモ・初期運用向けです。
本格運用では以下を追加してください。

- 取引先認証
- 取引先別価格
- 商品別在庫
- 注文キャンセル
- 管理者画面
- Webhook署名検証
- GAS URLの保護
- DB化（Supabase / Firebase / PostgreSQLなど）


## 商品マスタ連動版の使い方

この版では、アプリの商品一覧を `src/products.js` ではなく、Googleスプレッドシートの `商品マスタ` から読み込みます。

### Apps Script側

`google-apps-script/Code_product_master_api.gs` をApps Scriptに貼り付けて保存してください。

その後、関数一覧から以下を実行します。

```text
initializeWorkbook
```

商品マスタを編集した後は、必要に応じて以下を実行します。

```text
syncProductMasterToInventory
```

### アプリ側

`.env` の `VITE_ORDER_API_URL` に、Apps ScriptのWebアプリURL `/exec` を設定してください。

```env
VITE_ORDER_API_URL=https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxx/exec
```

アプリ起動後、画面上部に `MASTER` と表示されれば、商品マスタから商品一覧を読み込めています。

### 商品追加の流れ

1. スプレッドシートの `商品マスタ` に商品を追加
2. `商品ステータス` を `有効` にする
3. Apps Scriptで `syncProductMasterToInventory` を実行
4. アプリを再読み込み

これで新商品がアプリの商品一覧に出ます。


## 顧客別ページ・価格・表示商品管理

この版では、URLの `customerId` によって表示商品・価格を切り替えます。

例:

```text
http://localhost:5173/?customerId=CUST-A
http://localhost:5173/?customerId=CUST-B
```

スプレッドシート側では以下を管理します。

- `顧客マスタ`: 顧客ID、顧客名、ステータス
- `顧客別商品設定`: 顧客ID、商品ID、表示可否、顧客別単価、表示順

### 商品を顧客別に出し分ける方法

`顧客別商品設定` に以下のように入力します。

```text
CUST-A / BACON-45 / 表示 / 18200 / 1
CUST-B / BACON-45 / 表示 / 18800 / 1
CUST-B / PATTY-5K / 非表示 / 10550 / 2
```

これにより、CUST-Bではビーフパティが表示されません。

### Apps Script

`google-apps-script/Code_customer_pricing_stock.gs` をApps Scriptに貼り付け、保存後に新バージョンで再デプロイしてください。


## 1〜4 運用強化版

追加機能:

1. 顧客別URL一覧
   - `顧客別URL一覧` シートに顧客別URLを自動作成
   - `設定` シートの `アプリ基本URL` をVercel URLへ変更すると本番URL化できます

2. 管理者通知メール
   - `設定` シートの `管理者通知メール` にメールアドレスを入れると、新規注文時に通知されます

3. 在庫不足時の注文制御
   - `設定` シートの `在庫不足時の注文` が `ブロック` の場合、フリー在庫を超える注文は受け付けません
   - アプリ画面にも在庫ステータスとフリー在庫が表示されます

4. 出荷済ステータスと在庫消化
   - `受注管理` のステータスを `出荷済` にした後、Apps Scriptで `syncOrderStatusToDetails` を実行してください
   - `受注明細` が出荷済になり、`在庫管理` の出荷済に反映されます

## 手動実行する関数

- `initializeWorkbook`: 初期セットアップ
- `refreshCustomerUrls`: 顧客別URL一覧の更新
- `syncProductMasterToInventory`: 商品マスタと在庫管理の同期
- `syncOrderStatusToDetails`: 受注ステータスを明細へ反映


## 送料対応版

顧客マスタに送料項目を追加しています。

- `送料ルール`: 固定 / 無料 / 都度
- `基本送料`: 送料額
- `送料無料ライン`: この金額以上で送料無料

例:

```text
CUST-A / A商店 / 有効 / 固定 / 1000 / 30000
CUST-B / Bレストラン / 有効 / 固定 / 1500 / 50000
```

注文確認画面では以下を表示します。

```text
商品小計
送料
合計金額
```

受注管理にも以下が記録されます。

```text
商品小計
送料
合計金額
```


## 顧客別配送可能日対応版

追加シート:

- `顧客別配送設定`
- `配送不可日`

### 顧客別配送設定

列:

```text
顧客ID / 月 / 火 / 水 / 木 / 金 / 土 / 日 / 祝日配送 / 最短リード日数 / 備考
```

例:

```text
CUST-A / 月〜金 true / 土日 false / 祝日配送 false / 最短リード 1
CUST-B / 月〜土 true / 日 false / 祝日配送 false / 最短リード 1
```

### 配送不可日

列:

```text
日付 / 名称 / 全顧客共通 / 対象顧客ID / 備考
```

- 全顧客共通 = true の場合、全顧客で配送不可
- 全顧客共通 = false の場合、対象顧客IDに入れた顧客だけ配送不可

### アプリ側

注文確認画面の日付入力で、顧客別の配送可能曜日・最短リード日数・配送不可日をチェックします。

### サーバー側

注文送信時にもApps Script側で再チェックします。
アプリ側だけでなくサーバー側でも弾くので、安全です。


## 日本語 / 英語切り替え

画面右上の `English` / `日本語` ボタンでUI言語を切り替えられます。

URLパラメータでも指定できます。

```text
https://your-app.vercel.app/?customerId=CUST-A&lang=ja
https://your-app.vercel.app/?customerId=CUST-A&lang=en
```

切り替え対象:

- 画面ラベル
- ボタン
- 注文確認画面
- 注文完了画面
- 配送ルール表示
- 在庫表示文言

商品名・顧客名はスプレッドシートの登録内容をそのまま表示します。
