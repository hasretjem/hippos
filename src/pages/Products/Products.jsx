import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Products.css';
import { TL } from '../../hooks/useHipposData';
import {
  ArrowLeft, Search, Plus, Trash2, Pin, ChevronUp, ChevronDown,
  Check, X, RefreshCw,
} from 'lucide-react';

// Bu sayfadaki her değişiklik ARTIK ANINDA Supabase'e yazılır ve tüm cihazlara
// gerçek zamanlı yansır — "Kaydet/Vazgeç" ile bekletilen bir taslak kalmadı
// (Masalar/Cari sayfalarıyla aynı canlı çalışma mantığı).
export default function Products({ data, onNavigate }) {
  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  // İsimler render bölümüyle uyumlu kalsın diye aynı bırakıldı, artık doğrudan canlı veriye yazıyor.
  const localToggleProductStatus = data.toggleProductStatus;
  const localBulkSetCategoryStatus = data.bulkSetCategoryStatus;
  const localUpdateProduct = data.updateProduct;
  const localDeleteProduct = data.deleteProduct;
  const localSetAzPorsiyon = data.setAzPorsiyon;
  const localAddCategory = data.addCategory;
  const localUpdateCategoryMeta = data.updateCategoryMeta;
  const localUpdateSubcategoryMeta = data.updateSubcategoryMeta;

  function localAddProduct(kategori, ad, fiyat, menuSirasi) {
    data.addProduct({ kategori, altKategori: '', ad, fiyat, menuSirasi });
  }

  // ---- Sheet'ten Çek (tek yönlü, manuel — Sheet'te toplu fiyat değiştirdiysen kullan) ----
  const [pullConfirmOpen, setPullConfirmOpen] = useState(false);

  async function confirmPull() {
    setPullConfirmOpen(false);
    showToast('Sheet\'ten çekiliyor, birkaç saniye sürebilir...');
    try {
      const res = await fetch('/api/sheets');
      if (!res.ok) throw new Error('pull failed');
      const json = await res.json();
      const sheetProducts = (json.products || []).filter((p) => !p.isAzVariant);
      sheetProducts.forEach((p) => {
        const existing = data.products.find((dp) => dp.ad === p.ad && dp.kategori === p.kategori);
        if (existing) {
          data.updateProduct(existing.id, { fiyat: p.fiyat, durum: p.durum, menuSirasi: p.menuSirasi, sabit: p.sabit });
          if (p.azPorsiyon) data.setAzPorsiyon(existing.id, true, p.azFiyat);
        } else {
          data.addProduct({ kategori: p.kategori, altKategori: p.altKategori, ad: p.ad, fiyat: p.fiyat, menuSirasi: p.menuSirasi });
        }
      });
      showToast('Sheet\'ten güncellendi (yeni ürünler eklendi, mevcutlar güncellendi)');
    } catch {
      showToast('Sheet\'ten çekilemedi — bağlantıyı kontrol et');
    }
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
    const matches = data.products.filter((p) => !p.isAzVariant && p.ad.toLowerCase().includes(q));
    matches.sort((a, b) => {
      const aStarts = a.ad.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.ad.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.ad.localeCompare(b.ad, 'tr');
    });
    return matches;
  }, [searchQuery, data.products]);

  // ---- Kategori/ürün sıralaması: menü sırası, eşitse alfabetik ----
  const sortedCategories = useMemo(
    () => [...data.categories].sort((a, b) => a.menuSirasi - b.menuSirasi || a.name.localeCompare(b.name, 'tr')),
    [data.categories]
  );

  function productsForCategory(kategori) {
    return data.products
      .filter((p) => p.kategori === kategori && !p.isAzVariant)
      .sort((a, b) => a.menuSirasi - b.menuSirasi || a.ad.localeCompare(b.ad, 'tr'));
  }

  function subcategoriesForCategory(kategori) {
    return data.subcategories
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
    return data.categories.find((c) => c.name === name);
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

      {toast && <div className="pr-toast">{toast}</div>}

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

const GUNUN_MENUSU_KATEGORILER = [
  { value: '', label: '— Seçilmedi —' },
  { value: 'corba', label: 'Günün Çorbası' },
  { value: 'ana_yemek', label: 'Ana Yemekler' },
  { value: 'yardimci_yemek', label: 'Yardımcı Yemekler' },
  { value: 'zeytinyagli', label: 'Zeytinyağlılar' },
];
// Bu sınıflandırma sadece bu iki alt kategorideki ürünler için anlamlı — Günün Menüsü
// görsel oluşturma sisteminin hangi ürünü hangi bölüme koyacağını bilmesi için var.
const GUNUN_MENUSU_ALT_KATEGORILER = ['Ana Yemekler', 'Yoğurt - Z.Yağlı'];
// Kesin alt kategori adı emin olmadığım için (daha önce Zeytinyağlılar'da da böyle bir
// uyumsuzluk çıkmıştı) esnek, büyük/küçük harf duyarsız bir eşleştirme kullanıyorum.
function isSandvicUrunu(p) {
  const a = (p.altKategori || '').toLocaleLowerCase('tr-TR');
  return a.includes('küçük sandviç') || a.includes('büyük sandviç');
}

// Fare üzerine gelince açıklama gösteren, çekilince kaybolan küçük bilgi ikonu.
// Tarayıcının kendi "title" davranışını kullanıyor — ekstra state gerekmiyor.
function InfoTip({ text }) {
  return <span className="pr-info-tip" title={text}>i</span>;
}

function ProductRow({ product: p, onToggle, onUpdate, onDelete, onSetAz, tag }) {
  const [editingAd, setEditingAd] = useState(false);
  const [adDraft, setAdDraft] = useState(p.ad);
  const [azFiyatDraft, setAzFiyatDraft] = useState(p.azFiyat ?? '');

  const isActive = p.durum !== 'PASIF';
  const showGununMenusuSecim = GUNUN_MENUSU_ALT_KATEGORILER.includes(p.altKategori);
  const showBicakToggle = isSandvicUrunu(p);
  const showEkmekToggle = isSandvicUrunu(p);

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
        <InfoTip text="Ürünün adı. Tıklayıp yazarak değiştirebilirsin, tüm cihazlarda anında güncellenir." />
        {tag && <span className="pr-row-tag">{tag}</span>}

        <input
          type="text"
          inputMode="decimal"
          className="pr-price-input"
          value={p.fiyat}
          onChange={(e) => onUpdate({ fiyat: parseFloat(e.target.value.replace(',', '.')) || 0 })}
        />
        <span className="pr-price-suffix">₺</span>
        <InfoTip text="Satış fiyatı. Değiştirince tüm satış ekranlarında ve Sheets'e kaydedince orada da anında güncellenir." />

        <input
          type="number"
          min={1}
          max={100}
          className="pr-order-input small"
          value={p.menuSirasi}
          onChange={(e) => onUpdate({ menuSirasi: parseInt(e.target.value, 10) || 1 })}
          title="Menü Sırası"
        />
        <InfoTip text="Bu ürünün, aynı alt kategorideki diğer ürünlere göre satış ekranındaki sırasını belirler. Küçük sayı önce/üstte görünür." />

        <label className="pr-sabit-check" title="Sabit Ürün">
          <input type="checkbox" checked={p.sabit} onChange={(e) => onUpdate({ sabit: e.target.checked })} />
          <Pin size={12} />
        </label>
        <InfoTip text="İşaretlenirse bu ürün 'Kategoriyi Toplu Pasife Al' işleminden etkilenmez — her zaman satışta kalır, tek tek kapatman gerekir." />

        {showGununMenusuSecim && (
          <>
            <select
              className="pr-gunun-menusu-select"
              value={p.gununMenusuKategori || ''}
              onChange={(e) => onUpdate({ gununMenusuKategori: e.target.value || null })}
              title="Günün Menüsü sınıflandırması"
            >
              {GUNUN_MENUSU_KATEGORILER.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className="pr-order-input small"
              placeholder="Sıra"
              value={p.gununMenusuSira ?? ''}
              onChange={(e) => onUpdate({ gununMenusuSira: e.target.value ? parseInt(e.target.value, 10) : null })}
              title="Günün Menüsü Sıra No"
            />
            <InfoTip text="Bu ürünün Günün Menüsü görselinde hangi bölümde (Çorba/Ana Yemek/Yardımcı Yemek/Zeytinyağlı) ve o bölüm içinde kaçıncı sırada görüneceğini belirler. Boş bırakılırsa Günün Menüsü ekranında otomatik seçilmez." />
          </>
        )}

        <button className={`pr-toggle ${isActive ? 'on' : ''}`} onClick={onToggle}>
          <span className="pr-toggle-knob" />
        </button>
        <InfoTip text="Kapatırsan bu ürün satış ekranlarında görünmez, sipariş edilemez. Açık/kapalı durumu tüm cihazlarda anında değişir." />

        {showBicakToggle && (
          <>
            <button
              className={`pr-bicak-toggle ${p.bicakGerekli ? 'on' : ''}`}
              onClick={() => onUpdate({ bicakGerekli: !p.bicakGerekli })}
              title="Bıçak gerekli"
            >
              🔪
            </button>
            <InfoTip text="İşaretlenirse bu ürün sipariş ekranında ve fişte bıçak simgesiyle işaretlenir — mutfağa/tezgaha 'kesilmesi gerekiyor' uyarısı verir." />
          </>
        )}

        {showEkmekToggle && (
          <>
            <button
              className={`pr-ekmek-toggle ${p.ekmekGerekli ? 'on' : ''}`}
              onClick={() => onUpdate({ ekmekGerekli: !p.ekmekGerekli })}
              title="Ekmek gerekli"
            >
              🥖
            </button>
            <InfoTip text="İşaretlenirse bu ürün sipariş ekranında ve fişte baget ekmek simgesiyle işaretlenir." />
          </>
        )}

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