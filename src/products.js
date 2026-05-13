export const products = [
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
  },
  {
    id: "PICKLE-5G",
    name: "ナチュラルピクルス 5gal",
    spec: "5gal / pail",
    unit: "pail",
    price: 10200,
    category: "ピクルス",
    frequent: true
  },
  {
    id: "PICKLE-2G",
    name: "ナチュラルピクルス 2gal",
    spec: "2gal / pail",
    unit: "pail",
    price: 5800,
    category: "ピクルス",
    frequent: false
  },
  {
    id: "LINKS-20",
    name: "ソーセージリンクス 20pc",
    spec: "20pc / pack",
    unit: "pack",
    price: 815,
    category: "加工肉",
    frequent: true
  },
  {
    id: "LINKS-200",
    name: "ソーセージリンクス 200pc",
    spec: "200pc / case",
    unit: "cs",
    price: 5800,
    category: "加工肉",
    frequent: false
  },
  {
    id: "BUNS-CASE",
    name: "バンズ",
    spec: "case",
    unit: "cs",
    price: 7500,
    category: "パン",
    frequent: true
  }
];

export const demoLastOrder = {
  deliveryDateLabel: "前回：金曜午前",
  items: [
    { productId: "BACON-45", quantity: 2 },
    { productId: "PATTY-5K", quantity: 5 },
    { productId: "PICKLE-5G", quantity: 1 },
    { productId: "BUNS-CASE", quantity: 3 }
  ]
};
