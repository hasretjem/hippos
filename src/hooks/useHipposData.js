import { useState, useEffect } from 'react';

// ---- Varsayılan ürün kataloğu (ileride Supabase'ten gelecek) ----
const DEFAULT_PRODUCTS = [
  { id: 101, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'ÇAY BÜYÜK', fiyat: 30.0 },
  { id: 102, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'ÇAY KÜÇÜK', fiyat: 20.0 },
  { id: 103, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Türk Kahvesi ( Orta Şekerli )', fiyat: 80.0 },
  { id: 104, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'COCA COLA', fiyat: 80.0 },
  { id: 105, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'AYRAN', fiyat: 50.0 },
  { id: 106, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Tabağı', ad: 'Standart Kahvaltı Tabağı', fiyat: 305.0 },
  { id: 107, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Köfte-Kaşar', fiyat: 230.0 },
  { id: 108, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'KAŞARLI MENEMEN', fiyat: 160.0 },
  { id: 109, kategori: 'ANA YEMEKLER', altKategori: 'Ev Yemekleri', ad: 'KURU FASÜLYE', fiyat: 130.0 },
  { id: 110, kategori: 'ANA YEMEKLER', altKategori: 'Ev Yemekleri', ad: 'PİRİNÇ PİLAVI', fiyat: 85.0 },
  { id: 111, kategori: 'Hazır Notlar', altKategori: 'Mutfak Notları', ad: 'Kepek Ekmek Olacak', fiyat: 0.0 },
  { id: 112, kategori: 'Hazır Notlar', altKategori: 'Mutfak Notları', ad: 'Servis İstemiyor.', fiyat: 0.0 },
];

export const TABLES = ['⚡ Hızlı Satış', 'Salon-01', 'Salon-02', 'Salon-03', 'Bahçe-01', 'Bahçe-02', 'Bar-01'];

export const TL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

function loadLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function emptyTableMap(fill) {
  const o = {};
  TABLES.forEach((t) => (o[t] = typeof fill === 'function' ? fill() : fill));
  return o;
}

// Tüm sayfaların (DirectSale, Tables, Reports...) paylaştığı tek veri kaynağı.
// App.jsx içinde BİR KEZ çağrılır, sonuçlar prop olarak sayfalara aktarılır.
export default function useHipposData() {
  const [products] = useState(() => loadLS('hippos_products', DEFAULT_PRODUCTS));
  const [favorites, setFavorites] = useState(() => loadLS('hippos_favorites', [104, 101, 105]));
  const [orders, setOrders] = useState(() => ({ ...emptyTableMap([]), ...loadLS('hippos_orders', {}) }));
  const [tableNotes, setTableNotes] = useState(() => ({ ...emptyTableMap(''), ...loadLS('hippos_table_notes', {}) }));
  const [tableDiscounts, setTableDiscounts] = useState(() => ({
    ...emptyTableMap(() => ({ type: null, value: 0 })),
    ...loadLS('hippos_table_discounts', {}),
  }));
  const [salesHistory, setSalesHistory] = useState(() => loadLS('hippos_sales_history', []));

  useEffect(() => localStorage.setItem('hippos_favorites', JSON.stringify(favorites)), [favorites]);
  useEffect(() => localStorage.setItem('hippos_orders', JSON.stringify(orders)), [orders]);
  useEffect(() => localStorage.setItem('hippos_table_notes', JSON.stringify(tableNotes)), [tableNotes]);
  useEffect(() => localStorage.setItem('hippos_table_discounts', JSON.stringify(tableDiscounts)), [tableDiscounts]);
  useEffect(() => localStorage.setItem('hippos_sales_history', JSON.stringify(salesHistory)), [salesHistory]);

  function updateOrder(table, updater) {
    setOrders((prev) => ({ ...prev, [table]: updater(prev[table] || []) }));
  }

  function toggleFavorite(id) {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  function getTableTotal(table) {
    const items = orders[table] || [];
    const subtotal = items.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
    const d = tableDiscounts[table];
    let discount = 0;
    if (d && d.value > 0) {
      discount = d.type === 'percent' ? (subtotal * d.value) / 100 : d.value;
    }
    return Math.max(0, subtotal - discount);
  }

  return {
    products,
    favorites,
    toggleFavorite,
    orders,
    setOrders,
    updateOrder,
    tableNotes,
    setTableNotes,
    tableDiscounts,
    setTableDiscounts,
    salesHistory,
    setSalesHistory,
    getTableTotal,
  };
}