const FALLBACK_PRODUCTS = [
  {
    id: "BACON-45",
    name: "JONES ベーコン",
    spec: "4.5kg / case",
    unit: "cs",
    price: 18200,
    category: "加工肉",
    frequent: true
  },
  {
    id: "PATTY-5K",
    name: "ビーフパティ 6mm",
    spec: "5kg / case",
    unit: "cs",
    price: 10550,
    category: "加工肉",
    frequent: true
  }
];

function loadJsonp(url, customerId) {
  return new Promise((resolve, reject) => {
    const callbackName = `productMasterCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");

    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}action=products&customerId=${encodeURIComponent(customerId)}&callback=${callbackName}`;
    script.async = true;

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("商品マスタの読み込みがタイムアウトしました。Apps Scriptの再デプロイ状況を確認してください。"));
    }, 30000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();

      if (!data?.ok || !Array.isArray(data.products)) {
        reject(new Error("商品マスタの形式が正しくありません。"));
        return;
      }

      resolve({ products: data.products, customer: data.customer });
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("商品マスタの読み込みに失敗しました。"));
    };

    document.body.appendChild(script);
  });
}

export async function fetchProductsFromMaster(orderApiUrl, customerId = "CUST-A") {
  if (!orderApiUrl) {
    return {
      products: FALLBACK_PRODUCTS,
      customer: { customerId, customerName: "A商店" },
      source: "fallback",
      error: "VITE_ORDER_API_URL が未設定です。"
    };
  }

  try {
    const result = await loadJsonp(orderApiUrl, customerId);

    return {
      products: result.products,
      customer: result.customer,
      source: "master",
      error: ""
    };
  } catch (error) {
    return {
      products: FALLBACK_PRODUCTS,
      customer: { customerId, customerName: "A商店" },
      source: "fallback",
      error: error?.message || "商品マスタの読み込みに失敗しました。"
    };
  }
}
