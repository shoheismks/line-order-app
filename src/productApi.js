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

function loadJsonp(url, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `lineOrderCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");

    const search = new URLSearchParams({
      ...params,
      callback: callbackName
    });

    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}${search.toString()}`;
    script.async = true;

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("APIの読み込みがタイムアウトしました。Apps Scriptの再デプロイ状況を確認してください。"));
    }, 30000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();

      if (!data?.ok) {
        reject(new Error(data?.error || "APIの形式が正しくありません。"));
        return;
      }

      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("APIの読み込みに失敗しました。"));
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
    const result = await loadJsonp(orderApiUrl, {
      action: "products",
      customerId
    });

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

export async function fetchOrderHistory(orderApiUrl, customerId = "CUST-A") {
  if (!orderApiUrl) {
    return {
      orders: [],
      customer: { customerId, customerName: "A商店" },
      source: "fallback",
      error: "VITE_ORDER_API_URL が未設定です。"
    };
  }

  try {
    const result = await loadJsonp(orderApiUrl, {
      action: "orders",
      customerId
    });

    return {
      orders: result.orders || [],
      customer: result.customer,
      source: "master",
      error: ""
    };
  } catch (error) {
    return {
      orders: [],
      customer: { customerId, customerName: "A商店" },
      source: "fallback",
      error: error?.message || "注文履歴の読み込みに失敗しました。"
    };
  }
}
