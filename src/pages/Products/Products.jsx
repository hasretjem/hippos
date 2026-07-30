import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Products.css';
import { TL } from '../../hooks/useHipposData';
import {
  ArrowLeft, Search, Plus, Trash2, Pin, ChevronUp, ChevronDown,
  Check, X, RefreshCw, Save,
} from 'lucide-react';

export default function Products({ data, onNavigate }) {
  // ---- Taslak (draft) durumu — Kaydet'e basılana kadar hiçbir şey canlıya yansımaz ----
  const [draftProducts, setDraftProducts] = useState(() => data.products);
  const [draftCategories, setDraftCategories] = useState(() => data.categories);
  const [draftSubcategories, setDraftSubcategories] = useState(() => data.subcategories);
  const [dirty, setDirty] = useState(false);

  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  // ---- Yerel (taslak üzerinde çalışan) mutasyon fonksiyonları ----
  function localToggleProductStatus(id) {
    setDraftProducts((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      const nextDurum = target.durum === 'PASIF' ? 'AKTIF' : 'PASIF';
      return prev.map((p) => (p.id === id || p.parentId === id ? { ...p, durum: nextDurum } : p));
    });
    setDirty(true);
  }

  function localBulkSetCategoryStatus(kategori, durum) {
    setDraftProducts((prev) =>
      prev.map((p) => {
        if (p.kategori !== kategori) return p;
        if (durum === 'PASIF' && p.sabit) return p;
        if (p.isAzVariant) {
          const parent = prev.find((q) => q.id === p.parentId);
          if (parent && parent.sabit && durum === 'PASIF') return p;
        }
        return { ...p, durum };
      })
    );
    setDirty(true);
  }

  function localUpdateProduct(id, patch) {
    setDraftProducts((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      if (patch.ad !== undefined) {
        return updated.map((p) => (p.parentId === id ? { ...p, ad: `Az ${patch.ad}` } : p));
      }
      return updated;
    });
    setDirty(true);
  }

  function localDeleteProduct(id) {
    setDraftProducts((prev) => prev.filter((p) => p.id !== id && p.parentId !== id));
    setDirty(true);
  }

  function localAddProduct(kategori, ad, fiyat, menuSirasi) {
    const id = Date.now() + Math.random();
    setDraftProducts((prev) => [
      ...prev,
      { id, kategori, altKategori: '', ad, fiyat: fiyat || 0, durum: 'AKTIF', menuSirasi: menuSirasi ?? 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
    ]);
    setDirty(true);
  }

  function localSetAzPorsiyon(id, enabled, azFiyat) {
    setDraftProducts((prev) => {
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
          id: Date.now() + Math.random(), kategori: parent.kategori, altKategori: parent.altKategori,
          ad: `Az ${parent.ad}`, fiyat: azFiyat || 0, durum: parent.durum, menuSirasi: parent.menuSirasi,
          sabit: false, azPorsiyon: false, azFiyat: null, parentId: id, isAzVariant: true,
        };
        return [...prev.map((p) => (p.id === id ? { ...p, azPorsiyon: true, azFiyat } : p)), azProduct];
      }
      return prev.filter((p) => p.parentId !== id).map((p) => (p.id === id ? { ...p, azPorsiyon: false, azFiyat: null } : p));
    });
    setDirty(true);
  }

  function localAddCategory(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDraftCategories((prev) => {
      if (prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const maxOrder = prev.reduce((m, c) => Math.max(m, c.menuSirasi), 0);
      return [...prev, { name: trimmed, menuSirasi: Math.min(100, maxOrder + 10) || 10, sabit: false }];
    });
    setDirty(true);
  }

  function localUpdateCategoryMeta(name, patch) {
    setDraftCategories((prev) => prev.map((c) => (c.name === name ? { ...c, ...patch } : c)));
    setDirty(true);
  }

  function localUpdateSubcategoryMeta(kategori, name, patch) {
    setDraftSubcategories((prev) => prev.map((s) => (s.kategori === kategori && s.name === name ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  // ---- Kaydet / Vazgeç ----
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pullConfirmOpen, setPullConfirmOpen] = useState(false);

  function handleDiscard() {
    setDraftProducts(data.products);
    setDraftCategories(data.categories);
    setDraftSubcategories(data.subcategories);
    setDirty(false);
    showToast('Değişiklikler geri alındı');
  }

  function confirmSave() {
    data.setProducts(draftProducts);
    data.setCategories(draftCategories);
    data.setSubcategories(draftSubcategories);
    setDirty(false);
    setSaveConfirmOpen(false);
    showToast('Kaydedildi');
  }

  function confirmPull() {
    setPullConfirmOpen(false);
    showToast('Google Sheets bağlantısı henüz kurulmadı');
  }

  // ---- Yeni kategori / yeni ürün modalları ----
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProductModal, setNewProductModal] = useState(null); // { kategori }
  const [newProductForm, setNewProductForm] = useState({ ad: '', fiyat: '', menuSirasi: '' });

  function openNewProduct(kategori) {
    setNewProductForm({ ad: '', fiyat: '', menuSirasi: '' });
    setNewProductModal({ kategori });
  }
  function submitNewProduct() {
    if (!newProductForm.ad.trim()) return;
    localAddProduct(
      newProductModal.kategori,
      newProductForm.ad.trim(),
      parseFloat(newProductForm.fiyat.replace(',', '.')) || 0,
      newProductForm.menuSirasi ? parseInt(newProductForm.menuSirasi, 10) : undefined
    );
    setNewProductModal(null);
  }

  // ---- Arama: 2. harften itibaren başta eşleşenler önce; sayfa açıkken direkt yazınca arama kutusuna girer ----
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key.length === 1 && /[a-zçğıöşüA-ZÇĞİÖŞÜ0-9]/.test(e.key)) {
        searchRef.current?.focus();
        setSearchQuery((q) => q + e.key);
      } else if (e.key === 'Backspace') {
        setSearchQuery((q) => q.slice(0, -1));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matches = draftProducts.filter((p) => !p.isAzVariant && p.ad.toLowerCase().includes(q));
    matches.sort((a, b) => {
      const aStarts = a.ad.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.ad.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.ad.localeCompare(b.ad, 'tr');
    });
    return matches;
  }, [searchQuery, draftProducts]);

  // ---- Kategori/ürün sıralaması: menü sırası, eşitse alfabetik ----
  const sortedCategories = useMemo(
    () => [...draftCategories].sort((a, b) => a.menuSirasi - b.menuSirasi || a.name.localeCompare(b.name, 'tr')),
    [draftCategories]
  );

  function productsForCategory(kategori) {
    return draftProducts
      .filter((p) => p.kategori === kategori && !p.isAzVariant)
      .sort((a, b) => a.menuSirasi - b.menuSirasi || a.ad.localeCompare(b.ad, 'tr'));
  }

  function subcategoriesForCategory(kategori) {
    return draftSubcategories
      .filter((s) => s.kategori === kategori)
      .sort((a, b) => a.menuSirasi - b.menuSirasi || a.name.localeCompare(b.name, 'tr'));
  }

  function groupedByAlt(kategori) {
    const items = productsForCategory(kategori);
    const subs = subcategoriesForCategory(kategori);
    const map = {};
    items.forEach((p) => {
      const alt = p.altKategori || '';
      (map[alt] = map[alt] || []).push(p);
    });
    // alt kategori sırasını subs listesine göre kur, subs'ta olmayan (ör. boş) grupları sona ekle
    const ordered = subs.filter((s) => map[s.name]).map((s) => s.name);
    Object.keys(map).forEach((k) => { if (!ordered.includes(k)) ordered.push(k); });
    return ordered.map((alt) => ({ alt, items: map[alt], sub: subs.find((s) => s.name === alt) }));
  }

  // ---- Scroll yardımcı okları ----
  const listRef = useRef(null);
  function scrollList(direction) {
    listRef.current?.scrollBy({ top: direction * 240, behavior: 'smooth' });
  }

  function categoryFor(name) {
    return draftCategories.find((c) => c.name === name);
  }

  return (
    <div className="pr-shell">
      <header className="pr-header">
        <button className="pr-back" onClick={() => onNavigate('settings')}><ArrowLeft size={16} /> Yönetim Paneli</button>
        <h1>Ürün Yönetimi</h1>
        <div className="pr-search">
          <Search size={15} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Ürün ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="pr-search-clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
          )}
        </div>
        <button className="pr-new-cat-btn" onClick={() => { setNewCategoryName(''); setNewCategoryModal(true); }}>
          <Plus size={14} /> Yeni Kategori
        </button>
      </header>

      <div className="pr-body">
        <div className="pr-list-wrap">
          <div className="pr-list" ref={listRef}>
            {searchResults ? (
              <div className="pr-search-results">
                {searchResults.length === 0 && <p className="pr-empty">Sonuç bulunamadı</p>}
                {searchResults.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    onToggle={() => localToggleProductStatus(p.id)}
                    onUpdate={(patch) => localUpdateProduct(p.id, patch)}
                    onDelete={() => localDeleteProduct(p.id)}
                    onSetAz={(enabled, fiyat) => localSetAzPorsiyon(p.id, enabled, fiyat)}
                    tag={p.kategori}
                  />
                ))}
              </div>
            ) : (
              sortedCategories.map((cat) => {
                return (
                  <div key={cat.name} className="pr-category-block">
                    <div className="pr-category-head">
                      <div className="pr-category-head-left">
                        <span className="pr-category-name">{cat.name}</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          className="pr-order-input"
                          value={cat.menuSirasi}
                          onChange={(e) => localUpdateCategoryMeta(cat.name, { menuSirasi: parseInt(e.target.value, 10) || 1 })}
                          title="Menü Sırası (1-100)"
                        />
                        <label className="pr-sabit-check" title="Sabit Kategori">
                          <input
                            type="checkbox"
                            checked={cat.sabit}
                            onChange={(e) => localUpdateCategoryMeta(cat.name, { sabit: e.target.checked })}
                          />
                          <Pin size={12} /> Sabit
                        </label>
                      </div>
                      <div className="pr-category-head-actions">
                        <button onClick={() => localBulkSetCategoryStatus(cat.name, 'AKTIF')}>Hepsini Aktif Yap</button>
                        <button disabled={cat.sabit} title={cat.sabit ? 'Sabit kategori — önce Sabit işaretini kaldırın' : ''} onClick={() => localBulkSetCategoryStatus(cat.name, 'PASIF')}>
                          Hepsini Pasife Al
                        </button>
                        <button className="pr-new-product-btn" onClick={() => openNewProduct(cat.name)}><Plus size={13} /> Yeni Ürün</button>
                      </div>
                    </div>

                    {groupedByAlt(cat.name).length === 0 && <p className="pr-empty">Bu kategoride ürün yok</p>}
                    {groupedByAlt(cat.name).map(({ alt, items, sub }) => (
                      <div key={alt || '_'} className="pr-subcat-block">
                        {alt && (
                          <div className="pr-subcat-head">
                            <span>{alt}</span>
                            {sub && (
                              <input
                                type="number"
                                min={1}
                                max={100}
                                className="pr-order-input small"
                                value={sub.menuSirasi}
                                onChange={(e) => localUpdateSubcategoryMeta(cat.name, alt, { menuSirasi: parseInt(e.target.value, 10) || 1 })}
                                title="Alt Kategori Menü Sırası (1-100)"
                              />
                            )}
                          </div>
                        )}
                        {items.map((p) => (
                          <ProductRow
                            key={p.id}
                            product={p}
                            onToggle={() => localToggleProductStatus(p.id)}
                            onUpdate={(patch) => localUpdateProduct(p.id, patch)}
                            onDelete={() => localDeleteProduct(p.id)}
                            onSetAz={(enabled, fiyat) => localSetAzPorsiyon(p.id, enabled, fiyat)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
          <div className="pr-scroll-btns">
            <button onClick={() => scrollList(-1)}><ChevronUp size={16} /></button>
            <button onClick={() => scrollList(1)}><ChevronDown size={16} /></button>
          </div>
        </div>
      </div>

      <button className="pr-pull-btn" onClick={() => setPullConfirmOpen(true)}>
        <RefreshCw size={14} /> Sheet'ten Bilgi Çek
      </button>

      {dirty && (
        <div className="pr-save-bar">
          <span>Kaydedilmemiş değişiklikler var</span>
          <div className="pr-save-actions">
            <button className="pr-discard" onClick={handleDiscard}>Vazgeç</button>
            <button className="pr-save" onClick={() => setSaveConfirmOpen(true)}><Save size={14} /> Kaydet</button>
          </div>
        </div>
      )}

      {toast && <div className="pr-toast">{toast}</div>}

      {/* KAYDET ONAY */}
      {saveConfirmOpen && (
        <div className="pr-modal-overlay" onClick={() => setSaveConfirmOpen(false)}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Değişiklikleri kaydet</h3>
            <p className="pr-modal-hint">
              Değişiklikler Hippos'a kaydedilecek. <strong>Not:</strong> Google Sheets senkronizasyonu henüz kurulmadığı için şimdilik yalnızca burada saklanacak.
            </p>
            <div className="pr-modal-footer">
              <button className="pr-secondary" onClick={() => setSaveConfirmOpen(false)}>Vazgeç</button>
              <button className="pr-primary" onClick={confirmSave}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* SHEET'TEN ÇEK ONAY */}
      {pullConfirmOpen && (
        <div className="pr-modal-overlay" onClick={() => setPullConfirmOpen(false)}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sheet'ten bilgi çek</h3>
            <p className="pr-modal-hint">
              Google Sheets'teki veriler buraya aktarılacak ve mevcut kaydedilmemiş değişiklikler kaybolacak.
            </p>
            <div className="pr-modal-footer">
              <button className="pr-secondary" onClick={() => setPullConfirmOpen(false)}>Vazgeç</button>
              <button className="pr-primary" onClick={confirmPull}>Onayla</button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ KATEGORİ */}
      {newCategoryModal && (
        <div className="pr-modal-overlay" onClick={() => setNewCategoryModal(false)}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Yeni Kategori</h3>
            <input
              autoFocus
              className="pr-modal-input"
              placeholder="Kategori adı..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (localAddCategory(newCategoryName), setNewCategoryModal(false))}
            />
            <div className="pr-modal-footer">
              <button className="pr-secondary" onClick={() => setNewCategoryModal(false)}>Vazgeç</button>
              <button className="pr-primary" onClick={() => { localAddCategory(newCategoryName); setNewCategoryModal(false); }}>Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ ÜRÜN */}
      {newProductModal && (
        <div className="pr-modal-overlay" onClick={() => setNewProductModal(null)}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Yeni Ürün — {newProductModal.kategori}</h3>
            <input
              autoFocus
              className="pr-modal-input"
              placeholder="Ürün adı..."
              value={newProductForm.ad}
              onChange={(e) => setNewProductForm((f) => ({ ...f, ad: e.target.value }))}
            />
            <input
              className="pr-modal-input"
              placeholder="Fiyat (₺)"
              inputMode="decimal"
              value={newProductForm.fiyat}
              onChange={(e) => setNewProductForm((f) => ({ ...f, fiyat: e.target.value.replace(/[^0-9,]/g, '') }))}
            />
            <input
              className="pr-modal-input"
              placeholder="Menü Sırası (1-100, boş bırakılabilir)"
              inputMode="numeric"
              value={newProductForm.menuSirasi}
              onChange={(e) => setNewProductForm((f) => ({ ...f, menuSirasi: e.target.value.replace(/[^0-9]/g, '') }))}
            />
            <div className="pr-modal-footer">
              <button className="pr-secondary" onClick={() => setNewProductModal(null)}>Vazgeç</button>
              <button className="pr-primary" onClick={submitNewProduct}>Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductRow({ product: p, onToggle, onUpdate, onDelete, onSetAz, tag }) {
  const [editingAd, setEditingAd] = useState(false);
  const [adDraft, setAdDraft] = useState(p.ad);
  const [azFiyatDraft, setAzFiyatDraft] = useState(p.azFiyat ?? '');

  const isActive = p.durum !== 'PASIF';

  function saveAd() {
    if (adDraft.trim() && adDraft !== p.ad) onUpdate({ ad: adDraft.trim() });
    setEditingAd(false);
  }

  return (
    <div className={`pr-row ${isActive ? '' : 'inactive'}`}>
      <div className="pr-row-main">
        {editingAd ? (
          <input
            autoFocus
            className="pr-name-input"
            value={adDraft}
            onChange={(e) => setAdDraft(e.target.value)}
            onBlur={saveAd}
            onKeyDown={(e) => e.key === 'Enter' && saveAd()}
          />
        ) : (
          <span className="pr-row-name" onClick={() => { setAdDraft(p.ad); setEditingAd(true); }}>{p.ad}</span>
        )}
        {tag && <span className="pr-row-tag">{tag}</span>}

        <input
          type="text"
          inputMode="decimal"
          className="pr-price-input"
          value={p.fiyat}
          onChange={(e) => onUpdate({ fiyat: parseFloat(e.target.value.replace(',', '.')) || 0 })}
        />
        <span className="pr-price-suffix">₺</span>

        <input
          type="number"
          min={1}
          max={100}
          className="pr-order-input small"
          value={p.menuSirasi}
          onChange={(e) => onUpdate({ menuSirasi: parseInt(e.target.value, 10) || 1 })}
          title="Menü Sırası"
        />

        <label className="pr-sabit-check" title="Sabit Ürün">
          <input type="checkbox" checked={p.sabit} onChange={(e) => onUpdate({ sabit: e.target.checked })} />
          <Pin size={12} />
        </label>

        <button className={`pr-toggle ${isActive ? 'on' : ''}`} onClick={onToggle}>
          <span className="pr-toggle-knob" />
        </button>

        <button className="pr-delete-btn" onClick={onDelete}><Trash2 size={14} /></button>
      </div>

      <div className="pr-row-sub">
        <label className="pr-az-check">
          <input
            type="checkbox"
            checked={p.azPorsiyon}
            onChange={(e) => {
              const enabled = e.target.checked;
              if (enabled) {
                const fiyat = parseFloat(String(azFiyatDraft).replace(',', '.')) || Math.round(p.fiyat * 0.7);
                setAzFiyatDraft(fiyat);
                onSetAz(true, fiyat);
              } else {
                onSetAz(false, null);
              }
            }}
          />
          Az Porsiyonlu
        </label>
        {p.azPorsiyon && (
          <span className="pr-az-price-wrap">
            Az Porsiyon Fiyatı:
            <input
              type="text"
              inputMode="decimal"
              className="pr-az-price-input"
              value={azFiyatDraft}
              onChange={(e) => setAzFiyatDraft(e.target.value)}
              onBlur={() => onSetAz(true, parseFloat(String(azFiyatDraft).replace(',', '.')) || 0)}
            />
            ₺
          </span>
        )}
      </div>
    </div>
  );
}