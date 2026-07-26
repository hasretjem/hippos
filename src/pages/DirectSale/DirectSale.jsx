import React, { useState, useMemo, useEffect, useRef } from 'react';

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

const TABLES = ['⚡ Hızlı Satış', 'Salon-01', 'Salon-02', 'Salon-03', 'Bahçe-01', 'Bahçe-02', 'Bar-01'];

const TL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

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

export default function DirectSale() {
  // ---- Kalıcı durum (localStorage) ----
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

  // ---- Ekran durumu ----
  const categories = useMemo(() => ['TÜMÜ', ...new Set(products.map((p) => p.kategori))], [products]);
  const [activeCategory, setActiveCategory] = useState('TÜMÜ');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState(TABLES[0]);

  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadValue, setNumpadValue] = useState('');

  const [priceModal, setPriceModal] = useState(null); // { item, value }
  const [genericModal, setGenericModal] = useState(null); // { title, showInput, showSelect, selectOptions, placeholder, onConfirm }
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [favModalCategory, setFavModalCategory] = useState('Tümü');
  const [favModalSearch, setFavModalSearch] = useState('');
  const [toast, setToast] = useState('');

  const currentOrder = orders[selectedTable] || [];

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1500);
  }

  // ---- Yardımcılar ----
  function updateOrder(table, updater) {
    setOrders((prev) => ({ ...prev, [table]: updater(prev[table] || []) }));
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

  const subtotal = currentOrder.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
  const discountObj = tableDiscounts[selectedTable];
  const discountAmount = discountObj && discountObj.value > 0
    ? (discountObj.type === 'percent' ? (subtotal * discountObj.value) / 100 : discountObj.value)
    : 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);
  const selectedItems = currentOrder.filter((i) => i.selected);
  const selectedTotal = selectedItems.reduce((s, i) => s + i.fiyat, 0);
  const isOrderEmpty = currentOrder.length === 0;

  // ---- Ürün işlemleri ----
  function addProductToOrder(product) {
    updateOrder(selectedTable, (items) => {
      let isDuplicate = false;
      let base = items;
      if (items.length > 0) {
        const last = items[items.length - 1];
        if (!last.note && last.ad === product.ad) {
          isDuplicate = true;
          base = items.map((it, i) => (i === items.length - 1 ? { ...it, persistentHighlight: true } : it));
        }
      }
      const newItem = {
        id: Date.now() + Math.random(),
        ad: product.ad,
        fiyat: product.fiyat,
        selected: false,
        note: product.fiyat === 0,
        persistentHighlight: isDuplicate,
      };
      return [...base, newItem];
    });
  }

  function removeItem(id) {
    updateOrder(selectedTable, (items) => items.filter((i) => i.id !== id));
  }

  function toggleSelectItem(id) {
    updateOrder(selectedTable, (items) => items.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  }

  function handleUndoLastItem() {
    updateOrder(selectedTable, (items) => items.slice(0, -1));
  }

  function handleClearSelection() {
    updateOrder(selectedTable, (items) => items.map((i) => ({ ...i, selected: false })));
  }

  function toggleFavorite(id) {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  // ---- Masa notu ----
  function handleNoteChange(value) {
    setTableNotes((prev) => ({ ...prev, [selectedTable]: value }));
  }

  // ---- Mutfak notu ekleme (genel modal ile) ----
  function openKitchenNoteModal() {
    setGenericModal({
      title: 'Mutfağa Not Ekle (Fiyatsız Satır)',
      placeholder: 'Örn: Acısız olsun / Paket saat 13:00',
      showInput: true,
      onConfirm: (text) => {
        if (!text.trim()) return;
        updateOrder(selectedTable, (items) => [
          ...items,
          { id: Date.now() + Math.random(), ad: text.trim(), fiyat: 0, selected: false, note: true, persistentHighlight: false },
        ]);
      },
    });
  }

  // ---- İndirim tuşluğu ----
  function pressNumpad(val) {
    setNumpadValue((prev) => (prev === '0' ? val : prev + val));
  }
  function applyDiscount(type) {
    const val = parseFloat(numpadValue);
    if (isNaN(val) || val <= 0) return;
    setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type, value: val } }));
    setNumpadValue('');
  }

  // ---- Fiyat değiştirme modalı ----
  function openPriceModal(item) {
    setPriceModal({ item, value: item.fiyat ? item.fiyat.toString().replace('.', ',') : '' });
  }
  function pressPriceNum(val) {
    setPriceModal((pm) => {
      if (!pm) return pm;
      if (val === ',' && pm.value.includes(',')) return pm;
      const next = pm.value === '0' && val !== ',' ? val : pm.value + val;
      return { ...pm, value: next };
    });
  }
  function confirmPriceModal() {
    if (!priceModal) return;
    const parsed = parseFloat(priceModal.value.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      updateOrder(selectedTable, (items) => items.map((i) => (i.id === priceModal.item.id ? { ...i, fiyat: parsed } : i)));
    }
    setPriceModal(null);
  }

  // ---- Masa taşı / birleştir ----
  function handleTableTransfer() {
    if (currentOrder.length === 0) {
      setGenericModal({ title: 'Transfer edilecek sipariş yok!', showInput: false });
      return;
    }
    const emptyTables = TABLES.filter((t) => t !== selectedTable && (!orders[t] || orders[t].length === 0));
    if (emptyTables.length === 0) {
      setGenericModal({ title: 'Transfer edilebilecek boş masa bulunamadı!', showInput: false });
      return;
    }
    setGenericModal({
      title: `${selectedTable} Masasını Başka Masaya Taşı`,
      showInput: false,
      showSelect: true,
      selectOptions: emptyTables.map((t) => ({ value: t, label: `${t} [Boş]` })),
      onConfirm: (_, targetTable) => {
        setOrders((prev) => ({ ...prev, [targetTable]: prev[selectedTable], [selectedTable]: [] }));
        setTableNotes((prev) => ({ ...prev, [targetTable]: prev[selectedTable], [selectedTable]: '' }));
        setTableDiscounts((prev) => ({ ...prev, [targetTable]: prev[selectedTable], [selectedTable]: { type: null, value: 0 } }));
        setSelectedTable(targetTable);
      },
    });
  }

  function handleTableMerge() {
    if (currentOrder.length === 0) {
      setGenericModal({ title: 'Birleştirilecek sipariş bulunmuyor!', showInput: false });
      return;
    }
    const occupied = TABLES.filter((t) => t !== selectedTable && orders[t] && orders[t].length > 0);
    if (occupied.length === 0) {
      setGenericModal({ title: 'Birleştirilecek başka dolu masa bulunamadı!', showInput: false });
      return;
    }
    setGenericModal({
      title: `${selectedTable} Masasını Dolu Masa İle Birleştir`,
      showInput: false,
      showSelect: true,
      selectOptions: occupied.map((t) => ({ value: t, label: `${t} (${TL(getTableTotal(t))})` })),
      onConfirm: (_, targetTable) => {
        setOrders((prev) => ({ ...prev, [targetTable]: [...prev[targetTable], ...prev[selectedTable]], [selectedTable]: [] }));
        setTableNotes((prev) => ({
          ...prev,
          [targetTable]: prev[selectedTable] ? `${prev[targetTable] ? prev[targetTable] + ' | ' : ''}${prev[selectedTable]}` : prev[targetTable],
          [selectedTable]: '',
        }));
        setSelectedTable(targetTable);
      },
    });
  }

  // ---- Ödeme / yazdırma / boşaltma ----
  function handlePay(method) {
    const payable = currentOrder.filter((i) => !i.note);
    if (payable.length === 0) return;
    const selected = payable.filter((i) => i.selected);
    const toClose = selected.length > 0 ? selected : payable;
    const closedIds = new Set(toClose.map((i) => i.id));
    const totalPay = toClose.reduce((s, i) => s + i.fiyat, 0);

    setSalesHistory((prev) => [
      { id: Date.now(), table: selectedTable, amount: totalPay, method, itemsCount: toClose.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);

    const remaining = currentOrder.filter((i) => !closedIds.has(i.id));
    setOrders((prev) => ({ ...prev, [selectedTable]: remaining }));
    if (remaining.length === 0) {
      setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type: null, value: 0 } }));
    }
    showToast(`${method} ile ödeme alındı`);
  }

  function handleClearTable() {
    if (currentOrder.length === 0) return;
    setGenericModal({
      title: `${selectedTable} masasındaki tüm siparişleri silmek istiyor musunuz?`,
      showInput: false,
      onConfirm: () => {
        setOrders((prev) => ({ ...prev, [selectedTable]: [] }));
        setTableNotes((prev) => ({ ...prev, [selectedTable]: '' }));
        setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type: null, value: 0 } }));
      },
    });
  }

  const printRef = useRef(null);
  function handlePrint() {
    if (currentOrder.length === 0) return;
    window.print();
  }

  // ---- Ürün listesi filtreleme ----
  const { filteredProducts, groupedProducts, headerTitle, productCount } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let filtered;
    let title;
    if (q) {
      title = `Arama: "${searchQuery}"`;
      filtered = products.filter((p) => p.ad.toLowerCase().includes(q));
    } else if (activeCategory === 'TÜMÜ') {
      title = 'TÜM ÜRÜNLER';
      filtered = products;
    } else {
      title = activeCategory;
      filtered = products.filter((p) => p.kategori === activeCategory);
    }
    const groups = {};
    filtered.forEach((p) => {
      const sub = p.altKategori || p.kategori || 'Genel';
      (groups[sub] = groups[sub] || []).push(p);
    });
    return { filteredProducts: filtered, groupedProducts: groups, headerTitle: title, productCount: filtered.length };
  }, [products, searchQuery, activeCategory]);

  const favoriteProducts = products.filter((p) => favorites.includes(p.id));

  return (
    <div className="ds-shell">
      <style>{`
.ds-shell {
  --ink: #2b2620;
  --paper: #faf7f0;
  --paper-2: #f0ebe0;
  --line: #ddd5c4;
  --accent: #2f5233;
  --accent-dark: #254228;
  --accent-soft: #e7efe8;
  --gold: #b8873a;
  --muted: #8a8474;
  --muted-2: #6b6558;
  --danger: #b04a3a;
  --blue: #2f4a66;
  --blue-dark: #233a52;
  --purple: #6b4c9a;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  color: var(--ink);
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  user-select: none;
}

.ds-body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding-bottom: 56px; /* alt nav yüksekliği */
}

/* ---- Kategori sidebar ---- */
.ds-category-sidebar {
  width: 100px;
  background: #22201b;
  color: #e8e2d4;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-right: 1px solid #332f28;
}
.ds-brand {
  padding: 10px;
  text-align: center;
  border-bottom: 1px solid #332f28;
  background: #1a1814;
}
.ds-brand-name {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--gold);
  display: block;
}
.ds-brand-sub {
  font-size: 9px;
  color: var(--gold);
  font-weight: 700;
}
.ds-category-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.ds-category-btn {
  display: block;
  width: 100%;
  text-align: center;
  background: none;
  border: none;
  border-left: 4px solid transparent;
  color: #cfc9ba;
  padding: 10px 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.ds-category-btn:hover { background: #2d2a24; }
.ds-category-btn.active {
  background: var(--accent);
  color: #fff;
  border-left-color: var(--gold);
}

/* ---- Ana gövde ---- */
.ds-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ds-header {
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ds-header-title { display: flex; align-items: center; gap: 8px; }
.ds-header-title h1 { font-size: 15px; font-weight: 800; margin: 0; }
.ds-count-badge {
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.ds-search input {
  width: 220px;
  max-width: 40vw;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 13px;
  background: var(--paper);
}
.ds-search input:focus { background: #fff; outline: 2px solid var(--accent); }

/* ---- Favoriler ---- */
.ds-favorites {
  background: #f2ece0;
  padding: 8px 12px;
  border-bottom: 1px solid #e2d7c3;
}
.ds-favorites-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ds-favorites-label { font-size: 10px; font-weight: 900; letter-spacing: 0.06em; color: #736a58; text-transform: uppercase; }
.ds-edit-fav-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.ds-edit-fav-btn:hover { background: var(--accent-dark); }
.ds-favorites-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  min-height: 46px;
  align-items: center;
  padding-bottom: 4px;
}
.ds-favorites-empty { font-size: 11px; color: var(--muted); font-style: italic; }
.ds-fav-chip {
  background: #fff;
  border: 1px solid #b8a88a;
  border-radius: 10px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.1s, transform 0.05s;
}
.ds-fav-chip:hover { border-color: var(--accent); }
.ds-fav-chip:active { transform: scale(0.96); }
.ds-fav-chip-name { font-size: 12px; font-weight: 700; }
.ds-fav-chip-price { font-size: 12px; font-weight: 900; color: var(--accent); }

/* ---- Ürün grid ---- */
.ds-products { flex: 1; overflow-y: auto; padding: 12px; }
.ds-product-group { margin-bottom: 12px; }
.ds-subcat-label {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7a7263;
  padding-bottom: 4px;
  margin: 0 0 6px;
  border-bottom: 1px solid #e2d8c3;
}
.ds-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.ds-product-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  text-align: left;
  height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: border-color 0.08s, transform 0.05s;
}
.ds-product-card:hover { border-color: var(--accent); }
.ds-product-card:active { transform: scale(0.96); }
.ds-product-card.fav { border-color: var(--gold); background: #fffdfa; }
.ds-product-card-top { display: flex; justify-content: space-between; align-items: flex-start; }
.ds-product-name { font-size: 12px; font-weight: 700; line-height: 1.25; }
.ds-star { font-size: 10px; }
.ds-product-price { font-size: 12px; font-weight: 900; color: var(--accent); margin-top: 4px; }
.ds-empty { text-align: center; padding: 40px 0; color: var(--muted); font-size: 12px; }

/* ---- Sipariş / sepet paneli ---- */
.ds-order-panel {
  width: 340px;
  flex-shrink: 0;
  background: #fff;
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 12px rgba(0,0,0,0.04);
}
.ds-table-head {
  padding: 10px;
  border-bottom: 1px dashed var(--line);
  background: #fdfbf7;
}
.ds-table-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.ds-table-label {
  font-size: 11px;
  font-weight: 800;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid #b8d1bc;
  flex-shrink: 0;
}
.ds-table-select {
  flex: 1;
  min-width: 0;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  font-size: 12px;
  border: 1px solid #1e3621;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
}
.ds-table-actions-row { display: flex; gap: 6px; margin-bottom: 8px; }
.ds-table-actions-row .ds-mini-btn { flex: 1; text-align: center; }
.ds-mini-btn {
  background: var(--paper-2);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: 11px;
  font-weight: 700;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.ds-mini-btn:hover { background: #e4ddcc; }
.ds-mini-btn.purple { color: var(--purple); background: #f2ece0; border-color: #d6c9b3; }
.ds-table-note {
  width: 100%;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  resize: none;
  height: 36px;
  font-family: inherit;
  background: #fff;
}
.ds-table-note:focus { outline: 1px solid var(--accent); }

.ds-order-list { flex: 1; overflow-y: auto; padding: 8px 10px; }
.ds-order-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid #eee7db;
  background: #fff;
  font-size: 12px;
  margin-bottom: 6px;
  transition: background 0.15s, border-color 0.15s;
}
.ds-order-line:hover { border-color: var(--line); }
.ds-order-line.note {
  border-color: #fde68a;
  background: rgba(255, 251, 235, 0.6);
  font-style: italic;
  color: var(--muted-2);
  justify-content: space-between;
}
.ds-order-line.selected {
  background: #e0f2fe;
  border-color: #0284c7;
  box-shadow: inset 0 0 0 1px #0284c7;
  color: #0369a1;
}
.ds-order-line.duplicate {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #78350f;
}
.ds-remove-btn {
  background: var(--danger);
  color: #fff;
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
.ds-remove-btn:hover { background: #c0392b; }
.ds-order-line-mid { flex: 1; min-width: 0; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.ds-order-line-name { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-tag {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 6px;
  color: #fff;
  flex-shrink: 0;
}
.ds-tag.selected { background: #0284c7; }
.ds-tag.duplicate { background: #d97706; }
.ds-order-line-price {
  font-size: 13px;
  font-weight: 900;
  background: rgba(231, 239, 232, 0.8);
  color: var(--accent);
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.08);
  cursor: pointer;
  flex-shrink: 0;
}
.ds-order-line.selected .ds-order-line-price { background: rgba(186, 230, 253, 0.8); color: #0c4a6e; }

.ds-order-tools { padding: 6px 10px; background: #fbf9f4; border-top: 1px solid #eee7db; }
.ds-order-tools-row { display: flex; justify-content: space-between; align-items: center; }
.ds-note-btn {
  padding: 5px 8px;
  border: 1px dashed #b8a88a;
  background: #fffdf7;
  color: #52493a;
  font-size: 11px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
}
.ds-note-btn:hover { background: #f2ece0; }
.ds-numpad-toggle {
  background: none;
  border: none;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}
.ds-numpad-box {
  margin-top: 8px;
  padding: 8px;
  background: var(--paper-2);
  border-radius: 10px;
  border: 1px solid var(--line);
}
.ds-numpad-display-row {
  display: flex;
  justify-content: space-between;
  background: #fff;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #ccc3b0;
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 6px;
}
.ds-numpad-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 6px; }
.ds-numpad-grid button {
  background: #fff;
  border: 1px solid #ccc3b0;
  border-radius: 8px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.ds-numpad-grid button:hover { background: #fef3c7; }
.ds-numpad-actions { display: flex; gap: 4px; }
.ds-numpad-actions button {
  flex: 1;
  border: none;
  border-radius: 8px;
  padding: 6px 0;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  cursor: pointer;
}
.ds-numpad-actions .blue { background: var(--blue); }
.ds-numpad-actions .blue:hover { background: var(--blue-dark); }
.ds-numpad-actions .green { background: var(--accent); }
.ds-numpad-actions .green:hover { background: var(--accent-dark); }
.ds-numpad-actions .red { flex: 0 0 44px; background: var(--danger); }
.ds-numpad-actions .red:hover { background: #c0392b; }

.ds-selection-bar {
  background: #e0f2fe;
  padding: 6px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-top: 1px solid #0284c7;
  font-weight: 800;
  color: #0369a1;
}
.ds-selection-bar button { background: none; border: none; color: #0369a1; text-decoration: underline; font-weight: 700; cursor: pointer; }

.ds-total-box { padding: 8px 12px; border-top: 1px solid var(--line); background: var(--paper); }
.ds-discount-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--danger); font-weight: 700; }
.ds-total-row { display: flex; justify-content: space-between; align-items: center; }
.ds-total-row span:first-child { font-size: 11px; font-weight: 900; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.05em; }
.ds-total-row span:last-child { font-size: 22px; font-weight: 900; color: var(--accent); }
.ds-payment-hint { padding: 0 12px; font-size: 10px; text-align: center; color: var(--muted); height: 14px; margin-bottom: 4px; }

.ds-pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 10px 10px; }
.ds-pay-grid button {
  border: none;
  border-radius: 10px;
  padding: 12px 0;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  cursor: pointer;
}
.ds-pay-grid button:disabled { opacity: 0.35; cursor: not-allowed; }
.ds-pay-grid .cash { background: var(--accent); }
.ds-pay-grid .cash:not(:disabled):hover { background: var(--accent-dark); }
.ds-pay-grid .card { background: var(--blue); }
.ds-pay-grid .card:not(:disabled):hover { background: var(--blue-dark); }
.ds-pay-grid .meal { background: var(--purple); }
.ds-pay-grid .meal:not(:disabled):hover { background: #533a78; }
.ds-pay-grid .credit { background: var(--gold); }
.ds-pay-grid .credit:not(:disabled):hover { background: #966d2f; }

.ds-bottom-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding: 0 10px 10px; }
.ds-bottom-actions button {
  border: 1px solid var(--line);
  background: var(--paper-2);
  color: var(--ink);
  padding: 8px 0;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.ds-bottom-actions button:disabled { opacity: 0.4; cursor: not-allowed; }
.ds-bottom-actions button.danger { background: #fdf2ee; border-color: #e0c3bb; color: var(--danger); }

/* ---- Alt navigasyon ---- */
.ds-bottom-nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 56px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(6px);
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 50;
}
.ds-bottom-nav button {
  background: none;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--muted);
  font-weight: 600;
  cursor: pointer;
}
.ds-bottom-nav button .ico { font-size: 17px; }
.ds-bottom-nav button .label { font-size: 10px; }
.ds-bottom-nav button.active { color: var(--accent); font-weight: 800; }

.ds-toast {
  position: fixed;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  background: #22201b;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 999px;
  z-index: 60;
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
}

/* ---- Modallar ---- */
.ds-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  padding: 16px;
}
.ds-modal {
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.3);
  border: 1px solid #eee7db;
}
.ds-modal h3 { font-size: 13px; font-weight: 800; margin: 0 0 10px; }
.ds-modal textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 12px;
  font-family: inherit;
  resize: none;
  margin-bottom: 10px;
}
.ds-modal-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee7db; padding-bottom: 8px; margin-bottom: 10px; }
.ds-modal-head h3 { margin: 0; }
.ds-modal-head button { background: none; border: none; font-size: 15px; color: var(--muted); cursor: pointer; }
.ds-modal-select-wrap { margin-bottom: 10px; }
.ds-modal-select-wrap label { display: block; font-size: 11px; font-weight: 700; color: var(--muted-2); margin-bottom: 4px; }
.ds-modal-select-wrap select { width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 10px; font-size: 12px; font-weight: 700; background: var(--paper); }
.ds-modal-footer { display: flex; justify-content: flex-end; padding-top: 8px; }
.ds-modal-footer.two { gap: 8px; }
.ds-modal-footer.two button { flex: 1; }
.ds-primary-btn, .ds-secondary-btn {
  padding: 9px 18px;
  border-radius: 10px;
  border: none;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.ds-primary-btn { background: var(--accent); color: #fff; }
.ds-primary-btn:hover { background: var(--accent-dark); }
.ds-secondary-btn { background: var(--paper-2); color: var(--ink); }
.ds-secondary-btn:hover { background: #e4ddcc; }

.ds-fav-modal { max-width: 520px; max-height: 85vh; display: flex; flex-direction: column; }
.ds-modal-search {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 12px;
  margin-bottom: 8px;
}
.ds-modal-cat-pills { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 8px; }
.ds-modal-cat-pills button {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--muted-2);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.ds-modal-cat-pills button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.ds-modal-hint { font-size: 11px; color: var(--muted-2); margin: 0 0 8px; }
.ds-fav-modal-list { flex: 1; overflow-y: auto; padding-right: 2px; }
.ds-fav-modal-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #eee7db;
  background: var(--paper);
  margin-bottom: 6px;
  cursor: pointer;
}
.ds-fav-modal-item:hover { border-color: var(--accent); }
.ds-fav-modal-item.active { background: #fffdfa; border-color: var(--gold); }
.ds-fav-modal-item-left { display: flex; align-items: center; gap: 8px; }
.ds-fav-modal-item-left .name { font-size: 12px; font-weight: 700; margin: 0; }
.ds-fav-modal-item-left .cat { font-size: 10px; color: var(--muted); margin: 0; }
.ds-fav-modal-item button { border: none; border-radius: 8px; padding: 5px 10px; font-size: 11px; font-weight: 700; color: #fff; cursor: pointer; }
.ds-fav-modal-item button.add { background: var(--accent); }
.ds-fav-modal-item button.remove { background: var(--danger); }

.ds-price-modal { max-width: 300px; }
.ds-price-display { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; text-align: right; margin-bottom: 10px; }
.ds-price-display .label { display: block; text-align: left; font-size: 10px; font-weight: 700; color: var(--muted); }
.ds-price-display .value { font-size: 24px; font-weight: 900; color: var(--accent); }
.ds-price-numgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
.ds-price-numgrid button { background: var(--paper-2); border: 1px solid #ccc3b0; border-radius: 10px; padding: 10px 0; font-size: 14px; font-weight: 800; cursor: pointer; }
.ds-price-numgrid button:hover { background: #e4ddcc; }
.ds-price-numgrid button.clear { background: var(--danger); color: #fff; border: none; }

/* ---- Yazdırma şablonu ---- */
#print-receipt { display: none; }
@media print {
  .ds-shell > *:not(#print-receipt) { display: none !important; }
  #print-receipt {
    display: block;
    font-family: "SF Mono", monospace;
    width: 280px;
    margin: auto;
    padding: 12px;
  }
  #print-receipt h2 { text-align: center; font-size: 16px; margin: 0 0 6px; }
  .print-meta { display: flex; justify-content: space-between; font-size: 11px; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
  .print-items { font-size: 12px; line-height: 1.5; margin-bottom: 8px; }
  .print-row { display: flex; justify-content: space-between; }
  .print-total-box { border-top: 1px dashed #000; padding-top: 6px; font-weight: 700; font-size: 13px; }
  .print-row.big { font-size: 15px; margin-top: 4px; }
}

`}</style>
      
      <div className="ds-body">
        {/* KATEGORİ SIDEBAR */}
        <aside className="ds-category-sidebar">
          <div className="ds-brand">
            <span className="ds-brand-name">HIPPOS</span>
            <span className="ds-brand-sub">⚡ HIZLI SATIŞ</span>
          </div>
          <div className="ds-category-list">
            {categories.map((cat) => {
              const isActive = cat === activeCategory && !searchQuery;
              return (
                <button
                  key={cat}
                  className={`ds-category-btn ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveCategory(cat);
                    setSearchQuery('');
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ANA GÖVDE */}
        <main className="ds-main">
          <header className="ds-header">
            <div className="ds-header-title">
              <h1>{headerTitle}</h1>
              <span className="ds-count-badge">{productCount} Ürün</span>
            </div>
            <div className="ds-search">
              <input
                type="text"
                placeholder="Ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </header>

          {/* FAVORİLER */}
          <section className="ds-favorites">
            <div className="ds-favorites-head">
              <span className="ds-favorites-label">⭐ HIZLI FAVORİLER</span>
              <button className="ds-edit-fav-btn" onClick={() => setFavModalOpen(true)}>
                ✏️ Düzenle
              </button>
            </div>
            <div className="ds-favorites-row">
              {favoriteProducts.length === 0 && (
                <span className="ds-favorites-empty">Favori bulunmuyor. "Düzenle" butonundan ekleyebilirsiniz.</span>
              )}
              {favoriteProducts.map((product) => (
                <button key={product.id} className="ds-fav-chip" onClick={() => addProductToOrder(product)}>
                  <span className="ds-fav-chip-name">{product.ad}</span>
                  <span className="ds-fav-chip-price">{TL(product.fiyat)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ÜRÜN GRID */}
          <div className="ds-products">
            {Object.keys(groupedProducts).length === 0 && (
              <div className="ds-empty">Aradığınız kriterde ürün bulunamadı.</div>
            )}
            {Object.entries(groupedProducts).map(([subCat, items]) => (
              <div key={subCat} className="ds-product-group">
                {subCat && subCat !== 'Genel' && <h3 className="ds-subcat-label">{subCat}</h3>}
                <div className="ds-product-grid">
                  {items.map((product) => {
                    const isFav = favorites.includes(product.id);
                    return (
                      <button
                        key={product.id}
                        className={`ds-product-card ${isFav ? 'fav' : ''}`}
                        onClick={() => addProductToOrder(product)}
                      >
                        <div className="ds-product-card-top">
                          <span className="ds-product-name">{product.ad}</span>
                          {isFav && <span className="ds-star">⭐</span>}
                        </div>
                        <span className="ds-product-price">{TL(product.fiyat)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* SİPARİŞ / SEPET PANELİ */}
        <aside className="ds-order-panel">
          <div className="ds-table-head">
            <div className="ds-table-row">
              <label className="ds-table-label">Satış Masası</label>
              <select
                className="ds-table-select"
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
              >
                {TABLES.map((t) => {
                  const tot = getTableTotal(t);
                  const hasOrder = orders[t] && orders[t].length > 0;
                  return (
                    <option key={t} value={t}>
                      {t} {hasOrder ? `(${TL(tot)})` : '[Boş]'}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="ds-table-actions-row">
              <button className="ds-mini-btn" onClick={handleTableTransfer}>⇄ Taşı</button>
              <button className="ds-mini-btn purple" onClick={handleTableMerge}>🔗 Birleştir</button>
            </div>
            <textarea
              className="ds-table-note"
              placeholder="Masa notu (örn: Müşteri 10 dk sonra gelecek)"
              value={tableNotes[selectedTable] || ''}
              onChange={(e) => handleNoteChange(e.target.value)}
            />
          </div>

          <div className="ds-order-list">
            {currentOrder.length === 0 && <div className="ds-empty">Sipariş boş — ürüne dokunarak ekleyin</div>}
            {currentOrder.map((item) => {
              if (item.note) {
                return (
                  <div key={item.id} className="ds-order-line note">
                    <span className="ds-order-line-name">📝 {item.ad}</span>
                    <button className="ds-remove-btn" onClick={() => removeItem(item.id)}>✕</button>
                  </div>
                );
              }
              const styleClass = item.selected ? 'selected' : item.persistentHighlight ? 'duplicate' : '';
              return (
                <div key={item.id} className={`ds-order-line ${styleClass}`}>
                  <button className="ds-remove-btn" onClick={() => removeItem(item.id)}>✕</button>
                  <div className="ds-order-line-mid" onClick={() => toggleSelectItem(item.id)}>
                    <span className="ds-order-line-name">{item.ad}</span>
                    {item.selected && <span className="ds-tag selected">✓ SEÇİLİ</span>}
                    {!item.selected && item.persistentHighlight && <span className="ds-tag duplicate">⚠️ İKAZ</span>}
                  </div>
                  <span className="ds-order-line-price" onClick={() => openPriceModal(item)}>
                    {TL(item.fiyat)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="ds-order-tools">
            <div className="ds-order-tools-row">
              <button className="ds-note-btn" onClick={openKitchenNoteModal}>📝 + Mutfağa Not Ekle</button>
              <button className="ds-numpad-toggle" onClick={() => setNumpadOpen((v) => !v)}>🔢 İndirim Tuşluğu</button>
            </div>
            {numpadOpen && (
              <div className="ds-numpad-box">
                <div className="ds-numpad-display-row">
                  <span>GİRİLEN DEĞER:</span>
                  <span>{numpadValue || '0'}</span>
                </div>
                <div className="ds-numpad-grid">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((n) => (
                    <button key={n} onClick={() => pressNumpad(n)}>{n}</button>
                  ))}
                </div>
                <div className="ds-numpad-actions">
                  <button className="blue" onClick={() => applyDiscount('percent')}>% İndirim Yap</button>
                  <button className="green" onClick={() => applyDiscount('amount')}>₺ İndirim Yap</button>
                  <button className="red" onClick={() => setNumpadValue('')}>C</button>
                </div>
              </div>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="ds-selection-bar">
              <span>{selectedItems.length} ürün seçili — {TL(selectedTotal)}</span>
              <button onClick={handleClearSelection}>Seçimi kaldır</button>
            </div>
          )}

          <div className="ds-total-box">
            {discountAmount > 0 && (
              <div className="ds-discount-row">
                <span>Uygulanan İndirim:</span>
                <span>-{TL(discountAmount)}</span>
              </div>
            )}
            <div className="ds-total-row">
              <span>TOPLAM</span>
              <span>{TL(finalTotal)}</span>
            </div>
          </div>
          <div className="ds-payment-hint">
            {selectedItems.length > 0
              ? `Ödeme yalnızca seçili ${selectedItems.length} ürüne uygulanacak`
              : currentOrder.length > 0 ? 'Ödeme tüm siparişe uygulanacak' : ''}
          </div>

          <div className="ds-pay-grid">
            <button disabled={isOrderEmpty} className="cash" onClick={() => handlePay('NAKİT')}>💵 NAKİT</button>
            <button disabled={isOrderEmpty} className="card" onClick={() => handlePay('KREDİ KARTI')}>💳 KREDİ KARTI</button>
            <button disabled={isOrderEmpty} className="meal" onClick={() => handlePay('YEMEK KARTI')}>🍽 YEMEK KARTI</button>
            <button disabled={isOrderEmpty} className="credit" onClick={() => handlePay('CARİ')}>📖 CARİYE YAZ</button>
          </div>
          <div className="ds-bottom-actions">
            <button disabled={isOrderEmpty} onClick={handlePrint}>🖨 Yazdır</button>
            <button disabled={isOrderEmpty} onClick={handleUndoLastItem}>↩️ Geri Al</button>
            <button disabled={isOrderEmpty} className="danger" onClick={handleClearTable}>🗑 Boşalt</button>
          </div>
        </aside>
      </div>

      {/* ALT NAVİGASYON */}
      <nav className="ds-bottom-nav">
        <button className="active">
          <span className="ico">🏠</span>
          <span className="label">Ana Sayfa (POS)</span>
        </button>
        <button onClick={() => showToast('Masalar sayfası yakında')}>
          <span className="ico">🪑</span>
          <span className="label">Masalar</span>
        </button>
        <button onClick={() => showToast('Kasa & Rapor sayfası yakında')}>
          <span className="ico">📊</span>
          <span className="label">Kasa & Rapor</span>
        </button>
        <button onClick={() => showToast('Ayarlar sayfası yakında')}>
          <span className="ico">⚙️</span>
          <span className="label">Ayarlar</span>
        </button>
      </nav>

      {toast && <div className="ds-toast">{toast}</div>}

      {/* FAVORİLERİ DÜZENLE MODALI */}
      {favModalOpen && (
        <div className="ds-modal-overlay" onClick={() => setFavModalOpen(false)}>
          <div className="ds-modal ds-fav-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3>⭐ Hızlı Favorileri Düzenle</h3>
              <button onClick={() => setFavModalOpen(false)}>✕</button>
            </div>
            <input
              type="text"
              className="ds-modal-search"
              placeholder="Modalda ürün ara..."
              value={favModalSearch}
              onChange={(e) => setFavModalSearch(e.target.value.toLowerCase())}
            />
            <div className="ds-modal-cat-pills">
              {['Tümü', ...categories.filter((c) => c !== 'TÜMÜ')].map((cat) => (
                <button
                  key={cat}
                  className={favModalCategory === cat ? 'active' : ''}
                  onClick={() => setFavModalCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <p className="ds-modal-hint">Favori paneline eklemek veya çıkarmak istediğiniz ürünlerin butonuna dokunun:</p>
            <div className="ds-fav-modal-list">
              {products
                .filter((p) => favModalCategory === 'Tümü' || p.kategori === favModalCategory)
                .filter((p) => !favModalSearch || p.ad.toLowerCase().includes(favModalSearch))
                .map((prod) => {
                  const isFav = favorites.includes(prod.id);
                  return (
                    <div key={prod.id} className={`ds-fav-modal-item ${isFav ? 'active' : ''}`} onClick={() => toggleFavorite(prod.id)}>
                      <div className="ds-fav-modal-item-left">
                        <span>{isFav ? '⭐' : '☆'}</span>
                        <div>
                          <p className="name">{prod.ad}</p>
                          <p className="cat">{prod.kategori}{prod.altKategori ? ` • ${prod.altKategori}` : ''}</p>
                        </div>
                      </div>
                      <button className={isFav ? 'remove' : 'add'}>{isFav ? 'Çıkar' : '+ Favori Yap'}</button>
                    </div>
                  );
                })}
            </div>
            <div className="ds-modal-footer">
              <button className="ds-primary-btn" onClick={() => setFavModalOpen(false)}>Tamam ve Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* FİYAT DEĞİŞTİRME MODALI */}
      {priceModal && (
        <div className="ds-modal-overlay" onClick={() => setPriceModal(null)}>
          <div className="ds-modal ds-price-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3>{priceModal.item.ad} - Fiyat Değiştir</h3>
              <button onClick={() => setPriceModal(null)}>✕</button>
            </div>
            <div className="ds-price-display">
              <span className="label">YENİ FİYAT (₺):</span>
              <span className="value">{priceModal.value || '0'}</span>
            </div>
            <div className="ds-price-numgrid">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'].map((n) => (
                <button key={n} onClick={() => pressPriceNum(n)}>{n}</button>
              ))}
              <button className="clear" onClick={() => setPriceModal((pm) => ({ ...pm, value: '' }))}>C</button>
            </div>
            <div className="ds-modal-footer two">
              <button className="ds-secondary-btn" onClick={() => setPriceModal(null)}>Vazgeç</button>
              <button className="ds-primary-btn" onClick={confirmPriceModal}>Onayla</button>
            </div>
          </div>
        </div>
      )}

      {/* GENEL DİYALOG MODALI */}
      {genericModal && (
        <GenericModal modal={genericModal} onClose={() => setGenericModal(null)} />
      )}

      {/* YAZDIRMA ŞABLONU */}
      <div id="print-receipt" ref={printRef}>
        <h2>{selectedTable}</h2>
        <div className="print-meta">
          <span>{new Date().toLocaleDateString('tr-TR')}</span>
          <span>{new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="print-items">
          {currentOrder.map((item) => (
            <div key={item.id} className="print-row">
              <span>{item.note ? `📝 ${item.ad}` : item.ad}</span>
              <span>{item.note ? '' : TL(item.fiyat)}</span>
            </div>
          ))}
        </div>
        <div className="print-total-box">
          {discountAmount > 0 && (
            <div className="print-row">
              <span>İNDİRİM</span>
              <span>-{TL(discountAmount)}</span>
            </div>
          )}
          <div className="print-row big">
            <span>TOPLAM</span>
            <span>{TL(finalTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenericModal({ modal, onClose }) {
  const [inputVal, setInputVal] = useState('');
  const [selectVal, setSelectVal] = useState(modal.selectOptions?.[0]?.value || '');

  function confirm() {
    if (modal.onConfirm) modal.onConfirm(inputVal, selectVal);
    onClose();
  }

  return (
    <div className="ds-modal-overlay" onClick={onClose}>
      <div className="ds-modal ds-generic-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{modal.title}</h3>
        {modal.showInput && (
          <textarea
            rows={2}
            placeholder={modal.placeholder || 'Metin yazın...'}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
          />
        )}
        {modal.showSelect && (
          <div className="ds-modal-select-wrap">
            <label>Hedef Masa Seçin:</label>
            <select value={selectVal} onChange={(e) => setSelectVal(e.target.value)}>
              {modal.selectOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="ds-modal-footer two">
          <button className="ds-secondary-btn" onClick={onClose}>Vazgeç</button>
          <button className="ds-primary-btn" onClick={confirm}>Onayla</button>
        </div>
      </div>
    </div>
  );
}