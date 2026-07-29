import { useState, useEffect, useMemo } from 'react';

// ---- Varsayılan ürün kataloğu (ileride Supabase'ten gelecek) ----
const DEFAULT_PRODUCTS = [
  { id: 101, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'ÇAY BÜYÜK', fiyat: 30.0, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 102, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'ÇAY KÜÇÜK', fiyat: 20.0, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 103, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Türk Kahvesi ( Orta Şekerli )', fiyat: 80.0, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 104, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'COCA COLA', fiyat: 80.0, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 105, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'AYRAN', fiyat: 50.0, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 106, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Tabağı', ad: 'Standart Kahvaltı Tabağı', fiyat: 305.0, durum: 'AKTIF', menuSirasi: 20, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 107, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Köfte-Kaşar', fiyat: 230.0, durum: 'AKTIF', menuSirasi: 30, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 108, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'KAŞARLI MENEMEN', fiyat: 160.0, durum: 'AKTIF', menuSirasi: 40, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 109, kategori: 'ANA YEMEKLER', altKategori: 'Ev Yemekleri', ad: 'KURU FASÜLYE', fiyat: 130.0, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 110, kategori: 'ANA YEMEKLER', altKategori: 'Ev Yemekleri', ad: 'PİRİNÇ PİLAVI', fiyat: 85.0, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 111, kategori: 'Hazır Notlar', altKategori: 'Mutfak Notları', ad: 'Kepek Ekmek Olacak', fiyat: 0.0, durum: 'AKTIF', menuSirasi: 60, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 112, kategori: 'Hazır Notlar', altKategori: 'Mutfak Notları', ad: 'Servis İstemiyor.', fiyat: 0.0, durum: 'AKTIF', menuSirasi: 60, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
];

const DEFAULT_CATEGORIES = [
  { name: 'İÇECEKLER', menuSirasi: 10, sabit: false },
  { name: 'KAHVALTI', menuSirasi: 20, sabit: false },
  { name: 'SICAK SANDVİÇ', menuSirasi: 30, sabit: false },
  { name: 'SICAK YUMURTA', menuSirasi: 40, sabit: false },
  { name: 'ANA YEMEKLER', menuSirasi: 50, sabit: false },
  { name: 'Hazır Notlar', menuSirasi: 60, sabit: false },
];

export const QUICK_SALE = '⚡ Hızlı Satış';
export const SALON_TABLES = ['Masa 1', 'Masa 2', 'Masa 3', 'Masa 4', 'Masa 5', 'Masa 6', 'Masa 7', 'Masa 8', 'Masa 9', 'Masa 10', 'Masa 11'];
export const ALT_TABLES = ['Alt Masa 1', 'Alt Masa 2', 'Alt Masa 3', 'Alt Masa 4', 'Alt Masa 5', 'Alt Masa 6'];
// Fiziksel olarak birleşik duran masalar (görsel gruplama için) — birleştirme yine serbest.
export const TABLE_PAIRS = [['Masa 3', 'Masa 4'], ['Masa 10', 'Masa 11']];
const FIXED_TABLES = [QUICK_SALE, ...SALON_TABLES, ...ALT_TABLES];

export const TL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

function loadLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function emptyTableMap(tables, fill) {
  const o = {};
  tables.forEach((t) => (o[t] = typeof fill === 'function' ? fill() : fill));
  return o;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Masa rengi: geçen süreye göre kademe (30 dk aralıklarla) ----
export function getElapsedMinutes(openedAt) {
  if (!openedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - openedAt) / 60000));
}
export function getColorTier(openedAt) {
  if (!openedAt) return -1; // boş masa
  const mins = getElapsedMinutes(openedAt);
  if (mins < 30) return 0;
  if (mins < 60) return 1;
  if (mins < 90) return 2;
  return 3;
}

// Tüm sayfaların (DirectSale, Tables, Reports...) paylaştığı tek veri kaynağı.
// App.jsx içinde BİR KEZ çağrılır, sonuçlar prop olarak sayfalara aktarılır.
export default function useHipposData() {
  const [products, setProducts] = useState(() => loadLS('hippos_products', DEFAULT_PRODUCTS));
  const [categories, setCategories] = useState(() => loadLS('hippos_categories', DEFAULT_CATEGORIES));
  const [favorites, setFavorites] = useState(() => loadLS('hippos_favorites', [104, 101, 105]));
  const [packages, setPackages] = useState(() => loadLS('hippos_packages', [])); // [{name:'Paket 1', num:1}]
  const [packageMeta, setPackageMeta] = useState(() => loadLS('hippos_package_meta', { date: todayStr(), next: 1 }));

  const allTables = useMemo(() => [...FIXED_TABLES, ...packages.map((p) => p.name)], [packages]);

  const [orders, setOrders] = useState(() => ({ ...emptyTableMap(FIXED_TABLES, []), ...loadLS('hippos_orders', {}) }));
  const [tableNotes, setTableNotes] = useState(() => ({ ...emptyTableMap(FIXED_TABLES, ''), ...loadLS('hippos_table_notes', {}) }));
  const [tableDiscounts, setTableDiscounts] = useState(() => ({
    ...emptyTableMap(FIXED_TABLES, () => ({ type: null, value: 0 })),
    ...loadLS('hippos_table_discounts', {}),
  }));
  const [tableOpenedAt, setTableOpenedAt] = useState(() => loadLS('hippos_table_opened_at', {}));
  const [salesHistory, setSalesHistory] = useState(() => loadLS('hippos_sales_history', []));
  const [soldItems, setSoldItems] = useState(() => loadLS('hippos_sold_items', []));
  const [actionHistory, setActionHistory] = useState(() => loadLS('hippos_action_history', []));

  useEffect(() => localStorage.setItem('hippos_favorites', JSON.stringify(favorites)), [favorites]);
  useEffect(() => localStorage.setItem('hippos_products', JSON.stringify(products)), [products]);
  useEffect(() => localStorage.setItem('hippos_categories', JSON.stringify(categories)), [categories]);
  useEffect(() => localStorage.setItem('hippos_orders', JSON.stringify(orders)), [orders]);
  useEffect(() => localStorage.setItem('hippos_table_notes', JSON.stringify(tableNotes)), [tableNotes]);
  useEffect(() => localStorage.setItem('hippos_table_discounts', JSON.stringify(tableDiscounts)), [tableDiscounts]);
  useEffect(() => localStorage.setItem('hippos_table_opened_at', JSON.stringify(tableOpenedAt)), [tableOpenedAt]);
  useEffect(() => localStorage.setItem('hippos_sales_history', JSON.stringify(salesHistory)), [salesHistory]);
  useEffect(() => localStorage.setItem('hippos_sold_items', JSON.stringify(soldItems)), [soldItems]);
  useEffect(() => localStorage.setItem('hippos_action_history', JSON.stringify(actionHistory)), [actionHistory]);
  useEffect(() => localStorage.setItem('hippos_packages', JSON.stringify(packages)), [packages]);
  useEffect(() => localStorage.setItem('hippos_package_meta', JSON.stringify(packageMeta)), [packageMeta]);

  // Sayfa açılışında: ürünü ya da notu olmayan "hayalet" paketleri temizle
  useEffect(() => {
    setPackages((prev) =>
      prev.filter((p) => (orders[p.name] && orders[p.name].length > 0) || (tableNotes[p.name] && tableNotes[p.name].trim()))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paket, ilk ürün ya da not eklendiğinde "gerçek" hale gelir (Paketler listesine kaydolur).
  // Öncesinde hiçbir yerde görünmez — boş bırakılıp vazgeçilirse kutu hiç açılmamış olur.
  function registerPackageIfNeeded(table) {
    if (!table.startsWith('Paket ')) return;
    setPackages((prev) => {
      if (prev.some((p) => p.name === table)) return prev;
      const num = parseInt(table.replace('Paket ', ''), 10) || 0;
      return [...prev, { name: table, num }];
    });
  }

  function updateTableNote(table, value) {
    if (value.trim()) registerPackageIfNeeded(table);
    setTableNotes((prev) => ({ ...prev, [table]: value }));
  }

  // Sipariş güncellemesi — masa boştan doluya geçince açılış saatini otomatik damgalar,
  // doluyken boşalınca damgayı siler (masa "kapanmış" sayılır).
  function updateOrder(table, updater) {
    setOrders((prev) => {
      const before = prev[table] || [];
      const after = updater(before);
      const wasEmpty = before.length === 0;
      const nowEmpty = after.length === 0;
      if (wasEmpty && !nowEmpty) {
        setTableOpenedAt((p) => (p[table] ? p : { ...p, [table]: Date.now() }));
        registerPackageIfNeeded(table);
      } else if (!wasEmpty && nowEmpty) {
        setTableOpenedAt((p) => {
          if (!(table in p)) return p;
          const n = { ...p };
          delete n[table];
          return n;
        });
      }
      return { ...prev, [table]: after };
    });
  }

  function toggleFavorite(id) {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  // Ödemesi alınan ürünleri (Bugün paneli / en çok satanlar için) kalıcı günlüğüe yazar.
  function logSoldItems(items, table) {
    if (!items || items.length === 0) return;
    const ts = Date.now();
    setSoldItems((prev) => [
      ...items
        .filter((i) => !i.note)
        .map((i) => ({
          id: `${ts}-${i.id}`,
          ad: i.ad,
          fiyat: i.fiyat,
          kategori: i.kategori || '',
          altKategori: i.altKategori || '',
          table,
          ts,
        })),
      ...prev,
    ]);
  }

  // Bir ürünü aç/kapa — "Az X" varyantı varsa onu da aynı duruma çeker (bağımsız açık olamaz).
  function toggleProductStatus(id) {
    setProducts((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      const nextDurum = target.durum === 'PASIF' ? 'AKTIF' : 'PASIF';
      return prev.map((p) => {
        if (p.id === id) return { ...p, durum: nextDurum };
        if (p.parentId === id) return { ...p, durum: nextDurum };
        return p;
      });
    });
  }

  // Kategori bazlı toplu aç/kapa — "Sabit Ürün" işaretli ürünler pasife alınırken atlanır.
  function bulkSetCategoryStatus(kategori, durum) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.kategori !== kategori) return p;
        if (durum === 'PASIF' && p.sabit) return p; // sabit ürün pasife düşmez
        // Az varyantı, ana ürünle birlikte hareket eder (bağımsız kalmasın)
        if (p.isAzVariant) {
          const parent = prev.find((q) => q.id === p.parentId);
          if (parent && parent.sabit && durum === 'PASIF') return p;
        }
        return { ...p, durum };
      })
    );
  }

  // ---- Kategori yönetimi ----
  function addCategory(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => {
      if (prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const maxOrder = prev.reduce((m, c) => Math.max(m, c.menuSirasi), 0);
      return [...prev, { name: trimmed, menuSirasi: Math.min(100, maxOrder + 10) || 10, sabit: false }];
    });
  }

  function updateCategoryMeta(name, patch) {
    setCategories((prev) => prev.map((c) => (c.name === name ? { ...c, ...patch } : c)));
  }

  // ---- Ürün yönetimi (Ürünler sayfası) ----
  function addProduct(product) {
    const id = Date.now() + Math.random();
    setProducts((prev) => [
      ...prev,
      {
        id,
        kategori: product.kategori,
        altKategori: product.altKategori || '',
        ad: product.ad,
        fiyat: product.fiyat || 0,
        durum: 'AKTIF',
        menuSirasi: product.menuSirasi ?? 50,
        sabit: false,
        azPorsiyon: false,
        azFiyat: null,
        parentId: null,
        isAzVariant: false,
      },
    ]);
    return id;
  }

  function updateProduct(id, patch) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function deleteProduct(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id && p.parentId !== id));
  }

  // Az Porsiyon işaretlenince "Az <ad>" varyantını otomatik oluşturur/kaldırır.
  function setAzPorsiyon(id, enabled, azFiyat) {
    setProducts((prev) => {
      const parent = prev.find((p) => p.id === id);
      if (!parent) return prev;
      if (enabled) {
        const already = prev.find((p) => p.parentId === id);
        if (already) {
          return prev.map((p) =>
            p.id === id ? { ...p, azPorsiyon: true, azFiyat }
            : p.id === already.id ? { ...p, ad: `Az ${parent.ad}`, fiyat: azFiyat }
            : p
          );
        }
        const azProduct = {
          id: Date.now() + Math.random(),
          kategori: parent.kategori,
          altKategori: parent.altKategori,
          ad: `Az ${parent.ad}`,
          fiyat: azFiyat || 0,
          durum: parent.durum,
          menuSirasi: parent.menuSirasi,
          sabit: false,
          azPorsiyon: false,
          azFiyat: null,
          parentId: id,
          isAzVariant: true,
        };
        return [
          ...prev.map((p) => (p.id === id ? { ...p, azPorsiyon: true, azFiyat } : p)),
          azProduct,
        ];
      }
      // kapatılınca varyantı tamamen kaldır
      return prev
        .filter((p) => p.parentId !== id)
        .map((p) => (p.id === id ? { ...p, azPorsiyon: false, azFiyat: null } : p));
    });
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

  // ---- Paketler ----
  function openPackage() {
    let meta = packageMeta;
    if (meta.date !== todayStr()) meta = { date: todayStr(), next: 1 };
    const num = meta.next;
    const name = `Paket ${num}`;
    // NOT: burada henüz packages listesine eklenmiyor — ürün ya da not girilmeden
    // paket "gerçek" sayılmıyor (bkz. registerPackageIfNeeded).
    setPackageMeta({ date: meta.date, next: num + 1 });
    setTableNotes((prev) => ({ ...prev, [name]: '' }));
    setTableDiscounts((prev) => ({ ...prev, [name]: { type: null, value: 0 } }));
    return name;
  }

  function removePackageRecord(name) {
    setPackages((prev) => prev.filter((p) => p.name !== name));
    setTableOpenedAt((p) => {
      if (!(name in p)) return p;
      const n = { ...p };
      delete n[name];
      return n;
    });
  }

  // ---- Geri al geçmişi (son 5 işlem, tam durum anlık görüntüsü ile) ----
  function snapshotState() {
    return { orders, tableNotes, tableDiscounts, tableOpenedAt, packages, packageMeta };
  }
  function pushHistory(description) {
    setActionHistory((prev) =>
      [{ id: Date.now() + Math.random(), description, time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), snapshot: snapshotState() }, ...prev].slice(0, 5)
    );
  }
  function undoLastAction() {
    setActionHistory((prev) => {
      if (prev.length === 0) return prev;
      const [last, ...rest] = prev;
      const s = last.snapshot;
      setOrders(s.orders);
      setTableNotes(s.tableNotes);
      setTableDiscounts(s.tableDiscounts);
      setTableOpenedAt(s.tableOpenedAt);
      setPackages(s.packages);
      setPackageMeta(s.packageMeta);
      return rest;
    });
  }

  // ---- Masa taşı / birleştir (Masalar ekranından, herhangi iki masa arasında) ----
  function transferTable(from, to) {
    if (from === to) return;
    pushHistory(`${from} → ${to} taşındı`);
    setOrders((prev) => ({ ...prev, [to]: prev[from] || [], [from]: [] }));
    setTableNotes((prev) => ({ ...prev, [to]: prev[from] || '', [from]: '' }));
    setTableDiscounts((prev) => ({ ...prev, [to]: prev[from] || { type: null, value: 0 }, [from]: { type: null, value: 0 } }));
    setTableOpenedAt((prev) => {
      const n = { ...prev };
      if (prev[from]) n[to] = prev[from]; else delete n[to];
      delete n[from];
      return n;
    });
    if (from.startsWith('Paket ')) removePackageRecord(from);
  }

  function mergeTable(from, to) {
    if (from === to) return;
    pushHistory(`${from} + ${to} birleştirildi`);
    setOrders((prev) => ({ ...prev, [to]: [...(prev[to] || []), ...(prev[from] || [])], [from]: [] }));
    setTableNotes((prev) => {
      const merged = [prev[to], prev[from]].filter(Boolean).join(' | ');
      return { ...prev, [to]: merged, [from]: '' };
    });
    setTableOpenedAt((prev) => {
      const n = { ...prev };
      const a = prev[to];
      const b = prev[from];
      if (a && b) n[to] = Math.min(a, b);
      else if (b) n[to] = b;
      delete n[from];
      return n;
    });
    if (from.startsWith('Paket ')) removePackageRecord(from);
  }

  // ---- Masayı ödeme ile tamamen kapat (Masalar ekranından, 3 nokta > Masayı Kapat) ----
  function closeTableWithPayment(table, method) {
    const items = orders[table] || [];
    const payable = items.filter((i) => !i.note);
    if (payable.length === 0) return;
    const totalPay = payable.reduce((s, i) => s + i.fiyat, 0);
    logSoldItems(payable, table);
    pushHistory(`${table} kapatıldı (${method})`);
    setSalesHistory((prev) => [
      { id: Date.now(), ts: Date.now(), table, amount: totalPay, method, itemsCount: payable.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);
    setOrders((prev) => ({ ...prev, [table]: [] }));
    setTableNotes((prev) => ({ ...prev, [table]: '' }));
    setTableDiscounts((prev) => ({ ...prev, [table]: { type: null, value: 0 } }));
    setTableOpenedAt((prev) => {
      if (!(table in prev)) return prev;
      const n = { ...prev };
      delete n[table];
      return n;
    });
    if (table.startsWith('Paket ')) removePackageRecord(table);
  }

  return {
    products,
    setProducts,
    toggleProductStatus,
    bulkSetCategoryStatus,
    addProduct,
    updateProduct,
    deleteProduct,
    setAzPorsiyon,
    categories,
    setCategories,
    addCategory,
    updateCategoryMeta,
    favorites,
    toggleFavorite,
    allTables,
    packages,
    openPackage,
    orders,
    setOrders,
    updateOrder,
    tableNotes,
    setTableNotes,
    updateTableNote,
    tableDiscounts,
    setTableDiscounts,
    tableOpenedAt,
    salesHistory,
    setSalesHistory,
    soldItems,
    logSoldItems,
    getTableTotal,
    actionHistory,
    undoLastAction,
    transferTable,
    mergeTable,
    closeTableWithPayment,
  };
}