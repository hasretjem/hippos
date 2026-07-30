import React, { useState, useMemo, useRef, useEffect } from 'react';
import './DirectSale.css';
import { TL, QUICK_SALE } from '../../hooks/useHipposData';
import {
  Pencil, ArrowLeftRight, Link2, ClipboardPaste, X, StickyNote,
  Percent, Banknote, CreditCard, UtensilsCrossed, BookOpen, Printer, Undo2,
  Trash2, Star, Check, AlertTriangle, Wallet, Send, ChevronDown, ChevronUp,
} from 'lucide-react';

export default function DirectSale({ data, selectedTable, setSelectedTable, onNavigate }) {
  const {
    products,
    favorites,
    toggleFavorite,
    allTables,
    orders,
    setOrders,
    updateOrder,
    tableNotes,
    setTableNotes,
    updateTableNote,
    tableDiscounts,
    setTableDiscounts,
    setSalesHistory,
    logSoldItems,
    writeReceiptToSheets,
    getTableTotal,
    categories: rawCategories,
    subcategories,
    cariler,
    addCari,
    addCariHareket,
  } = data;

  // ---- Ekran durumu ----
  const categories = useMemo(() => {
    const sorted = [...rawCategories].sort((a, b) => a.menuSirasi - b.menuSirasi || a.name.localeCompare(b.name, 'tr'));
    return ['TÜMÜ', ...sorted.map((c) => c.name)];
  }, [rawCategories]);
  const [activeCategory, setActiveCategory] = useState('TÜMÜ');
  const [searchQuery, setSearchQuery] = useState('');
  const [payMode, setPayMode] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const tablePickerListRef = useRef(null);

  function scrollTablePicker(direction) {
    if (tablePickerListRef.current) {
      tablePickerListRef.current.scrollBy({ top: direction * 160, behavior: 'smooth' });
    }
  }

  const [numpadOpen, setNumpadOpen] = useState(false);
  const numpadInputRef = useRef(null);

  useEffect(() => {
    if (numpadOpen) {
      const t = setTimeout(() => numpadInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [numpadOpen]);
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
        kategori: product.kategori,
        altKategori: product.altKategori,
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

  // ---- Masa notu ----
  function handleNoteChange(value) {
    updateTableNote(selectedTable, value);
  }

  async function pasteToTableNote() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const current = tableNotes[selectedTable] || '';
      updateTableNote(selectedTable, current ? `${current} ${text}` : text);
    } catch {
      showToast('Panoya erişilemedi');
    }
  }

  async function pasteKitchenNote() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      updateOrder(selectedTable, (items) => [
        ...items,
        { id: Date.now() + Math.random(), ad: text.trim(), fiyat: 0, selected: false, note: true, persistentHighlight: false },
      ]);
    } catch {
      showToast('Panoya erişilemedi');
    }
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
    const emptyTables = allTables.filter((t) => t !== selectedTable && (!orders[t] || orders[t].length === 0));
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
    const occupied = allTables.filter((t) => t !== selectedTable && orders[t] && orders[t].length > 0);
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
      { id: Date.now(), ts: Date.now(), table: selectedTable, amount: totalPay, method, itemsCount: toClose.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);
    logSoldItems(toClose, selectedTable);
    writeReceiptToSheets({
      tur: selectedTable.startsWith('Paket ') ? 'Paket' : selectedTable === QUICK_SALE ? 'Hızlı Satış' : 'Masa',
      masa: selectedTable,
      toplam: totalPay,
      odemeTuru: method,
      urunler: toClose.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
    });

    const remaining = currentOrder.filter((i) => !closedIds.has(i.id));
    setOrders((prev) => ({ ...prev, [selectedTable]: remaining }));
    if (remaining.length === 0) {
      setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type: null, value: 0 } }));
    }
    showToast(`${method} ile ödeme alındı`);
    setPayMode(false);
  }

  function handleSend() {
    onNavigate('tables');
  }

  // ---- Cariye gönder ----
  const [cariPickerOpen, setCariPickerOpen] = useState(false);
  const [cariSearch, setCariSearch] = useState('');
  const [cariYeniForm, setCariYeniForm] = useState(null); // { ad, telefon }

  function openCariPicker() {
    setCariSearch('');
    setCariYeniForm(null);
    setCariPickerOpen(true);
  }

  function handlePayToCari(cariId) {
    const payable = currentOrder.filter((i) => !i.note);
    if (payable.length === 0) return;
    const selected = payable.filter((i) => i.selected);
    const toClose = selected.length > 0 ? selected : payable;
    const closedIds = new Set(toClose.map((i) => i.id));
    const totalPay = toClose.reduce((s, i) => s + i.fiyat, 0);
    const mutfakNotu = currentOrder.filter((i) => i.note).map((i) => i.ad).join(' · ');

    setSalesHistory((prev) => [
      { id: Date.now(), ts: Date.now(), table: selectedTable, amount: totalPay, method: 'CARİ', itemsCount: toClose.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);
    logSoldItems(toClose, selectedTable);
    addCariHareket(cariId, {
      urunler: toClose.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
      toplam: totalPay,
      mutfakNotu,
    });
    const cariAdi = (cariler || []).find((c) => c.id === cariId)?.ad || 'Cari';
    writeReceiptToSheets({
      tur: 'Cari',
      masa: cariAdi,
      toplam: totalPay,
      odemeTuru: 'CARİ',
      urunler: toClose.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
    });

    const remaining = currentOrder.filter((i) => !closedIds.has(i.id));
    setOrders((prev) => ({ ...prev, [selectedTable]: remaining }));
    if (remaining.length === 0) {
      setTableDiscounts((prev) => ({ ...prev, [selectedTable]: { type: null, value: 0 } }));
    }
    setCariPickerOpen(false);
    setPayMode(false);
    showToast('Cariye gönderildi');
  }

  function submitYeniCariFromPos() {
    if (!cariYeniForm || !cariYeniForm.ad.trim()) return;
    const id = addCari({ tip: 'bireysel', ad: cariYeniForm.ad.trim(), telefon: cariYeniForm.telefon || '', adres: '', not: '' });
    handlePayToCari(id);
  }

  const filteredCariler = (cariler || []).filter(
    (c) => !cariSearch.trim() || c.ad.toLowerCase().includes(cariSearch.trim().toLowerCase())
  );

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

  useEffect(() => {
    setPayMode(false);
  }, [selectedTable]);

  const printRef = useRef(null);
  const orderListRef = useRef(null);

  useEffect(() => {
    if (orderListRef.current) {
      orderListRef.current.scrollTop = orderListRef.current.scrollHeight;
    }
  }, [currentOrder.length, selectedTable]);

  function handlePrint() {
    if (currentOrder.length === 0) return;
    window.print();
  }

  // ---- Ürün listesi filtreleme ----
  const { filteredProducts, groupedProducts, headerTitle, productCount } = useMemo(() => {
    const activeProducts = products.filter((p) => p.durum !== 'PASIF');
    const q = searchQuery.toLowerCase();
    let filtered;
    let title;
    if (q) {
      title = `Arama: "${searchQuery}"`;
      filtered = activeProducts.filter((p) => p.ad.toLowerCase().includes(q));
    } else if (activeCategory === 'TÜMÜ') {
      title = 'TÜM ÜRÜNLER';
      filtered = activeProducts;
    } else {
      title = activeCategory;
      filtered = activeProducts.filter((p) => p.kategori === activeCategory);
    }
    const subOrderMap = new Map(subcategories.map((s) => [`${s.kategori}|${s.name}`, s.menuSirasi]));
    const subOrder = (p) => subOrderMap.get(`${p.kategori}|${p.altKategori}`) ?? 50;
    const sortKey = (p) => (p.menuSirasi ?? 50) + (p.isAzVariant ? 0.5 : 0);
    filtered = [...filtered].sort(
      (a, b) => subOrder(a) - subOrder(b) || sortKey(a) - sortKey(b) || a.ad.localeCompare(b.ad, 'tr')
    );
    const groups = {};
    filtered.forEach((p) => {
      const sub = p.altKategori || p.kategori || 'Genel';
      (groups[sub] = groups[sub] || []).push(p);
    });
    return { filteredProducts: filtered, groupedProducts: groups, headerTitle: title, productCount: filtered.length };
  }, [products, searchQuery, activeCategory, subcategories]);

  const favoriteProducts = products.filter((p) => favorites.includes(p.id) && p.durum !== 'PASIF');

  return (
    <div className="ds-shell">
      <div className="ds-body">
        {/* ANA GÖVDE */}
        <main className="ds-main">
          <header className="ds-header">
            <div className="ds-header-title">
              <h1>{headerTitle}</h1>
              <span className="ds-count-badge">{productCount} Ürün</span>
            </div>
            <div className="ds-header-table">
              <button
                className="ds-table-select-mini"
                onClick={() => setTablePickerOpen((v) => !v)}
              >
                <span>
                  {selectedTable} {(orders[selectedTable] && orders[selectedTable].length > 0) ? `(${TL(getTableTotal(selectedTable))})` : '[Boş]'}
                </span>
                <ChevronDown size={14} />
              </button>
              {tablePickerOpen && (
                <div className="ds-modal-overlay" onClick={() => setTablePickerOpen(false)}>
                  <div className="ds-modal ds-table-picker-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="ds-modal-head">
                      <h3>Masa Seç</h3>
                      <button className="ds-modal-x" onClick={() => setTablePickerOpen(false)}><X size={16} /></button>
                    </div>
                    <div className="ds-table-picker-list" ref={tablePickerListRef}>
                      {allTables.map((t) => {
                        const tot = getTableTotal(t);
                        const hasOrder = orders[t] && orders[t].length > 0;
                        const note = tableNotes[t];
                        return (
                          <button
                            key={t}
                            className={t === selectedTable ? 'active' : ''}
                            onClick={() => { setSelectedTable(t); setTablePickerOpen(false); }}
                          >
                            <span className="name">{t}</span>
                            <span className="meta">
                              {hasOrder ? TL(tot) : 'Boş'}
                              {note ? ` — ${note}` : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="ds-table-picker-scrollbtns">
                      <button onClick={() => scrollTablePicker(-1)}><ChevronUp size={16} /></button>
                      <button onClick={() => scrollTablePicker(1)}><ChevronDown size={16} /></button>
                    </div>
                  </div>
                </div>
              )}
              <button className="ds-mini-btn" onClick={handleTableTransfer} title="Masayı taşı"><ArrowLeftRight size={15} /></button>
              <button className="ds-mini-btn purple" onClick={handleTableMerge} title="Masaları birleştir"><Link2 size={15} /></button>
            </div>
            <div className="ds-header-note">
              <button className="ds-paste-btn" onClick={pasteToTableNote} title="Panodan yapıştır"><ClipboardPaste size={14} /></button>
              <input
                type="text"
                placeholder="Masa notu..."
                value={tableNotes[selectedTable] || ''}
                onChange={(e) => handleNoteChange(e.target.value)}
              />
            </div>
          </header>

          {/* KATEGORİ ŞERİDİ */}
          <div className="ds-category-strip">
            {categories.map((cat) => {
              const isActive = cat === activeCategory && !searchQuery;
              return (
                <button
                  key={cat}
                  className={`ds-cat-card ${isActive ? 'active' : ''}`}
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

          {/* FAVORİLER */}
          <section className="ds-favorites">
            <div className="ds-favorites-head">
              <span className="ds-favorites-label"><Star size={12} /> HIZLI FAVORİLER</span>
              <button className="ds-edit-fav-btn" onClick={() => setFavModalOpen(true)}>
                <Pencil size={12} /> Düzenle
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
                          {isFav && <Star size={11} className="ds-star" fill="currentColor" />}
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
          <div
            ref={orderListRef}
            className={`ds-order-list ${currentOrder.length > 14 ? 'ultra-compact' : currentOrder.length > 7 ? 'compact' : ''}`}
          >
            {currentOrder.length === 0 && <div className="ds-empty">Sipariş boş — ürüne dokunarak ekleyin</div>}
            {currentOrder.map((item) => {
              if (item.note) {
                return (
                  <div key={item.id} className="ds-order-line note">
                    <span className="ds-order-line-name"><StickyNote size={13} /> {item.ad}</span>
                    <button className="ds-remove-btn" onClick={() => removeItem(item.id)}><X size={16} /></button>
                  </div>
                );
              }
              const styleClass = item.selected ? 'selected' : item.persistentHighlight ? 'duplicate' : '';
              return (
                <div key={item.id} className={`ds-order-line ${styleClass}`}>
                  <button className="ds-remove-btn" onClick={() => removeItem(item.id)}><X size={16} /></button>
                  <div className="ds-order-line-mid" onClick={() => toggleSelectItem(item.id)}>
                    <span className="ds-order-line-name">{item.ad}</span>
                    {item.selected && <span className="ds-tag selected"><Check size={10} /> SEÇİLİ</span>}
                    {!item.selected && item.persistentHighlight && <span className="ds-tag duplicate"><AlertTriangle size={10} /> İKAZ</span>}
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
              <button className="ds-paste-btn" onClick={pasteKitchenNote} title="Panodan not olarak yapıştır"><ClipboardPaste size={14} /></button>
              <button className="ds-note-btn" onClick={openKitchenNoteModal}><StickyNote size={13} /> + Mutfağa Not Ekle</button>
              <button className="ds-numpad-toggle" onClick={() => setNumpadOpen((v) => !v)}><Percent size={13} /> İndirim Tuşluğu</button>
            </div>
            {numpadOpen && (
              <div className="ds-numpad-box">
                <div className="ds-numpad-display-row">
                  <span>GİRİLEN DEĞER:</span>
                  <input
                    ref={numpadInputRef}
                    type="text"
                    inputMode="decimal"
                    value={numpadValue}
                    onChange={(e) => setNumpadValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="0"
                  />
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
            {(selectedItems.length > 0 || currentOrder.length > 0) && (
              <div className="ds-payment-hint">
                {selectedItems.length > 0
                  ? `Ödeme yalnızca seçili ${selectedItems.length} ürüne uygulanacak`
                  : 'Ödeme tüm siparişe uygulanacak'}
              </div>
            )}
          </div>

          <div className="ds-payment-row">
            <button disabled={isOrderEmpty} className="ds-pay-cta" onClick={() => setPayMode(true)}>
              <Wallet size={17} /> Ödeme Al
            </button>
            <button className="ds-send-btn" onClick={handleSend}>
              <Send size={16} /> Gönder
            </button>
          </div>
          <div className="ds-bottom-actions">
            <button disabled={isOrderEmpty} onClick={handlePrint}><Printer size={14} /> Yazdır</button>
            <button disabled={isOrderEmpty} onClick={handleUndoLastItem}><Undo2 size={14} /> Geri Al</button>
            <button disabled={isOrderEmpty} className="danger" onClick={handleClearTable}><Trash2 size={14} /> Boşalt</button>
          </div>
        </aside>
      </div>

      {toast && <div className="ds-toast">{toast}</div>}

      {/* FAVORİLERİ DÜZENLE MODALI */}
      {favModalOpen && (
        <div className="ds-modal-overlay" onClick={() => setFavModalOpen(false)}>
          <div className="ds-modal ds-fav-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3><Star size={14} /> Hızlı Favorileri Düzenle</h3>
              <button className="ds-modal-x" onClick={() => setFavModalOpen(false)}><X size={16} /></button>
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
                        <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
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
              <button className="ds-modal-x" onClick={() => setPriceModal(null)}><X size={16} /></button>
            </div>
            <div className="ds-price-display">
              <span className="label">YENİ FİYAT (₺):</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                className="value-input"
                value={priceModal.value}
                onChange={(e) => setPriceModal((pm) => ({ ...pm, value: e.target.value.replace(/[^0-9,]/g, '') }))}
                placeholder="0"
              />
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

      {/* ÖDEME YÖNTEMİ MODALI */}
      {payMode && (
        <div className="ds-modal-overlay" onClick={() => setPayMode(false)}>
          <div className="ds-modal ds-pay-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3>Ödeme Yöntemi Seç</h3>
              <button className="ds-modal-x" onClick={() => setPayMode(false)}><X size={16} /></button>
            </div>
            <div className="ds-pay-modal-total">
              <span>Ödenecek Tutar</span>
              <strong>{TL(selectedItems.length > 0 ? selectedTotal : finalTotal)}</strong>
            </div>
            <div className="ds-pay-grid">
              <button className="cash" onClick={() => handlePay('NAKİT')}>
                <Banknote size={19} /><span className="lbl">Nakit</span>
              </button>
              <button className="card" onClick={() => handlePay('KREDİ KARTI')}>
                <CreditCard size={19} /><span className="lbl">Kredi K.</span>
              </button>
              <button className="meal" onClick={() => handlePay('YEMEK KARTI')}>
                <UtensilsCrossed size={19} /><span className="lbl">Yemek K.</span>
              </button>
              <button className="credit" onClick={openCariPicker}>
                <BookOpen size={19} /><span className="lbl">Cari</span>
              </button>
            </div>
            <button className="ds-pay-back-btn" onClick={() => setPayMode(false)}>
              <Undo2 size={14} /> Geri
            </button>
          </div>
        </div>
      )}

      {/* CARİ SEÇ MODALI */}
      {cariPickerOpen && (
        <div className="ds-modal-overlay" onClick={() => setCariPickerOpen(false)}>
          <div className="ds-modal ds-table-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3>Cariye Gönder</h3>
              <button className="ds-modal-x" onClick={() => setCariPickerOpen(false)}><X size={16} /></button>
            </div>
            {cariYeniForm ? (
              <>
                <input
                  autoFocus
                  className="ds-modal-search"
                  placeholder="Ad Soyad"
                  value={cariYeniForm.ad}
                  onChange={(e) => setCariYeniForm((f) => ({ ...f, ad: e.target.value }))}
                />
                <input
                  className="ds-modal-search"
                  placeholder="Telefon (opsiyonel)"
                  value={cariYeniForm.telefon}
                  onChange={(e) => setCariYeniForm((f) => ({ ...f, telefon: e.target.value }))}
                />
                <div className="ds-modal-footer two">
                  <button className="ds-secondary-btn" onClick={() => setCariYeniForm(null)}>Geri</button>
                  <button className="ds-primary-btn" onClick={submitYeniCariFromPos}>Oluştur ve Gönder</button>
                </div>
              </>
            ) : (
              <>
                <input
                  autoFocus
                  className="ds-modal-search"
                  placeholder="Cari ara..."
                  value={cariSearch}
                  onChange={(e) => setCariSearch(e.target.value)}
                />
                <div className="ds-table-picker-list">
                  {filteredCariler.map((c) => (
                    <button key={c.id} onClick={() => handlePayToCari(c.id)}>
                      <span className="name">{c.ad}</span>
                      <span className="meta">{c.tip === 'firma' ? 'Firma' : 'Bireysel'}{c.telefon ? ` — ${c.telefon}` : ''}</span>
                    </button>
                  ))}
                  {filteredCariler.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--ink-soft)', fontStyle: 'italic', padding: '8px 4px' }}>
                      Sonuç yok
                    </p>
                  )}
                </div>
                <button className="ds-primary-btn" style={{ width: '100%', marginTop: '10px' }} onClick={() => setCariYeniForm({ ad: '', telefon: '' })}>
                  + Yeni Cari
                </button>
              </>
            )}
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
              <span>{item.note ? `• ${item.ad}` : item.ad}</span>
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
            autoFocus
            rows={2}
            placeholder={modal.placeholder || 'Metin yazın...'}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirm();
              }
            }}
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