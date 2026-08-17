import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Products.css';
import { TL } from '../../hooks/useHipposData';
import {
  ArrowLeft, Search, Plus, Trash2, Pin, ChevronUp, ChevronDown,
  Check, X, RefreshCw, Save, Lock, Delete, Palette, Tag,
} 
from 'lucide-react';
import { DEFAULT_BTN_BG, DEFAULT_BTN_TEXT, DEFAULT_ICON_SIZE } from '../../constants/themeDefaults';
// Türkçe karakter duyarsız arama için normalize eder (İ/I, ı/i, ş/s, ğ/g, ü/u, ö/o, ç/c)
function normalizeTr(s) {
  return (s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

// Bu sayfadaki her değişiklik ARTIK ANINDA Supabase'e yazılır ve tüm cihazlara
// gerçek zamanlı yansır — "Kaydet/Vazgeç" ile bekletilen bir taslak kalmadı
// (Masalar/Cari sayfalarıyla aynı canlı çalışma mantığı).
// Sheet'ten Çek, Sheet'te toplu değişiklik yapılıp geri aktarılması gereken az sayıda,
// dikkatli kullanılması gereken bir işlem — yanlışlıkla basılmasın diye PIN korumalı.
const PULL_PIN = '0594';

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

  // ---- Kaydet — o an ekrandaki (Supabase'teki canlı) tüm kategori/alt kategori/ürün
  // durumunu Google Sheets'e YAZAR. Sheet'i, buradaki her şeyin bir kopyası haline getirir.
  const [pushLoading, setPushLoading] = useState(false);
  async function pushToSheets() {
    setPushLoading(true);
    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: data.categories,
          subcategories: data.subcategories,
          products: data.products,
        }),
      });
      if (!res.ok) throw new Error('push failed');
      showToast('Sheet güncellendi');
    } catch {
      showToast('Sheet\'e yazılamadı — bağlantıyı kontrol et');
    } finally {
      setPushLoading(false);
    }
  }

  // ---- Sheet'ten Çek (tek yönlü, manuel — Sheet'te toplu fiyat değiştirdiysen kullan) ----
  const [pullConfirmOpen, setPullConfirmOpen] = useState(false);
  const [pullPinModalOpen, setPullPinModalOpen] = useState(false);
  const [pullPinValue, setPullPinValue] = useState('');
  const [pullPinError, setPullPinError] = useState(false);
  const pullPinInputRef = useRef(null);

  useEffect(() => {
    if (pullPinModalOpen) {
      const t = setTimeout(() => pullPinInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [pullPinModalOpen]);

  function openPullPinModal() {
    setPullPinValue('');
    setPullPinError(false);
    setPullPinModalOpen(true);
  }
  function checkPullPin(digits) {
    if (digits === PULL_PIN) {
      setPullPinModalOpen(false);
      setPullPinValue('');
      setPullPinError(false);
      setPullConfirmOpen(true);
    } else {
      setPullPinError(true);
      setTimeout(() => {
        setPullPinValue('');
        setPullPinError(false);
      }, 550);
    }
  }
  function pressPullPinDigit(d) {
    setPullPinValue((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) setTimeout(() => checkPullPin(next), 100);
      return next;
    });
  }
  function pullPinBackspace() {
    setPullPinValue((prev) => prev.slice(0, -1));
  }

  async function confirmPull() {
    setPullConfirmOpen(false);
    showToast('Sheet\'ten çekiliyor, birkaç saniye sürebilir...');
    try {
      const res = await fetch('/api/sheets');
      if (!res.ok) throw new Error('pull failed');
      const json = await res.json();

      // Kategoriler — sıra/sabit bilgisini Sheet'ten uygula. Değişen kategoriler TEK bir
      // toplu istekte gönderiliyor (eskiden her biri ayrı bir istekti — 40 kategori değiştiyse
      // 40 ayrı ağ isteği demekti).
      const categoryPatches = [];
      (json.categories || []).forEach((c) => {
        const existing = data.categories.find((dc) => dc.name === c.name);
        if (existing) {
          if (existing.menuSirasi !== c.menuSirasi || existing.sabit !== c.sabit) {
            categoryPatches.push({ name: c.name, patch: { menuSirasi: c.menuSirasi, sabit: c.sabit } });
          }
        } else {
          data.addCategory(c.name);
          categoryPatches.push({ name: c.name, patch: { menuSirasi: c.menuSirasi, sabit: c.sabit } });
        }
      });
      data.bulkUpdateCategories(categoryPatches);

      // Alt kategoriler — aynı şekilde tek toplu istekte.
      const subcategoryPatches = [];
      (json.subcategories || []).forEach((s) => {
        const existing = data.subcategories.find((ds) => ds.kategori === s.kategori && ds.name === s.name);
        if (existing) {
          if (existing.menuSirasi !== s.menuSirasi) {
            subcategoryPatches.push({ kategori: s.kategori, name: s.name, patch: { menuSirasi: s.menuSirasi } });
          }
        } else {
          data.addSubcategory(s.kategori, s.name);
          subcategoryPatches.push({ kategori: s.kategori, name: s.name, patch: { menuSirasi: s.menuSirasi } });
        }
      });
      data.bulkUpdateSubcategories(subcategoryPatches);

      // Ürünler — yüzlerce ürün değişmiş olabilir, hepsi TEK toplu istekte gidiyor.
      const sheetProducts = (json.products || []).filter((p) => !p.isAzVariant);
      const productPatches = [];
      sheetProducts.forEach((p) => {
        const existing = data.products.find((dp) => dp.ad === p.ad && dp.kategori === p.kategori);
        if (existing) {
          productPatches.push({ id: existing.id, patch: { fiyat: p.fiyat, durum: p.durum, menuSirasi: p.menuSirasi, sabit: p.sabit } });
          if (p.azPorsiyon) data.setAzPorsiyon(existing.id, true, p.azFiyat);
        } else {
          data.addProduct({ kategori: p.kategori, altKategori: p.altKategori, ad: p.ad, fiyat: p.fiyat, menuSirasi: p.menuSirasi });
        }
      });
      data.bulkUpdateProducts(productPatches);
      showToast('Sheet\'ten güncellendi (kategoriler, alt kategoriler ve ürünler)');
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
    const q = searchQuery.trim();
    if (!q) return null;
    const matches = data.products.filter((p) => !p.isAzVariant && normalizeTr(p.ad).includes(normalizeTr(q)));
matches.sort((a, b) => {
  const nq = normalizeTr(q);
  const aStarts = normalizeTr(a.ad).startsWith(nq) ? 0 : 1;
  const bStarts = normalizeTr(b.ad).startsWith(nq) ? 0 : 1;
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
            lang="tr"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
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
              sortedCategories.map((cat) => (
                <CategoryBlock
                  key={cat.name}
                  cat={cat}
                  onUpdateCategoryMeta={localUpdateCategoryMeta}
                  onBulkSetStatus={localBulkSetCategoryStatus}
                  onOpenNewProduct={openNewProduct}
                  groupedByAlt={groupedByAlt}
                  localUpdateSubcategoryMeta={localUpdateSubcategoryMeta}
                  localToggleProductStatus={localToggleProductStatus}
                  localUpdateProduct={localUpdateProduct}
                  localDeleteProduct={localDeleteProduct}
                  localSetAzPorsiyon={localSetAzPorsiyon}
                />
              ))
            )}
          </div>
          <div className="pr-scroll-btns">
            <button onClick={() => scrollList(-1)}><ChevronUp size={16} /></button>
            <button onClick={() => scrollList(1)}><ChevronDown size={16} /></button>
          </div>
        </div>
      </div>

      <div className="pr-bottom-actions">
        <button className="pr-save-btn" onClick={pushToSheets} disabled={pushLoading}>
          <Save size={14} /> {pushLoading ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        <button className="pr-pull-btn" onClick={openPullPinModal}>
          <RefreshCw size={14} /> Sheet'ten Bilgi Çek
        </button>
      </div>

      {toast && <div className="pr-toast">{toast}</div>}

      {/* SHEET'TEN ÇEK — PIN */}
      {pullPinModalOpen && (
        <div className="pr-modal-overlay" onClick={() => setPullPinModalOpen(false)}>
          <div className={`pr-modal pr-pin-modal ${pullPinError ? 'shake' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="pr-modal-head">
              <h3><Lock size={15} /> Sheet'ten Çek</h3>
              <button className="pr-modal-x" onClick={() => setPullPinModalOpen(false)}><X size={16} /></button>
            </div>
            <div className="pr-pin-dots" onClick={() => pullPinInputRef.current?.focus()}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`pr-pin-dot ${pullPinValue.length > i ? 'filled' : ''}`} />
              ))}
              <input
                ref={pullPinInputRef}
                className="pr-pin-hidden-input"
                type="tel"
                inputMode="numeric"
                maxLength={4}
                value={pullPinValue}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                  setPullPinValue(digits);
                  if (digits.length === 4) setTimeout(() => checkPullPin(digits), 100);
                }}
              />
            </div>
            {pullPinError && <p className="pr-pin-error">Yanlış PIN, tekrar deneyin</p>}
            <div className="pr-pin-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button key={n} onClick={() => pressPullPinDigit(n)}>{n}</button>
              ))}
              <div />
              <button onClick={() => pressPullPinDigit('0')}>0</button>
              <button onClick={pullPinBackspace}><Delete size={16} /></button>
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
              lang="tr"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
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
              lang="tr"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
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
// Fare üzerine gelince (masaüstü) VEYA dokununca (tablet/telefon) açıklamayı gösterir.
// Öncesinde sadece tarayıcının "title" davranışına dayanıyordu — bu dokunmatik
// ekranlarda (kasa tabletleri/telefonlar) hiç çalışmıyordu, çünkü dokunmatik
// cihazlarda "hover" diye bir şey yok. Şimdi tıklanabilir/dokunulabilir.
// Fare üzerine gelince açıklama gösteren, çekilince kaybolan bilgi ikonu — sadece
// masaüstü/fare için, tarayıcının kendi "title" davranışını kullanıyor.
function InfoTip({ text }) {
  return <span className="pr-info-tip" title={text}>i</span>;
}

// Ürün VE kategori düzenlemede kullanılan ortak "Görünüm" popup'ı.
// showSaleName: ürün satırında true (Satış Sayfası Görünen İsim alanı gösterilir).
// showIconSize: kategori satırında true (ikon boyutu ayarı gösterilir).
// Kaydet'e basılana kadar hiçbir şey Supabase'e yazılmaz — tüm alanlar local taslakta tutulur.
function GorunumPopup({ target, showSaleName, showIconSize, onSave, onClose }) {
  const [saleName, setSaleName] = useState(target.satisAdi || '');
  const [btnColor, setBtnColor] = useState(target.butonRengi || '');
  const [txtColor, setTxtColor] = useState(target.butonYaziRengi || '');
  const [italic, setItalic] = useState(target.italik ?? false);
  const [iconSize, setIconSize] = useState(target.ikonBoyutu || DEFAULT_ICON_SIZE);
  const [emoji, setEmoji] = useState(target.ikon || '');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  function handleSave() {
    const patch = {
      butonRengi: btnColor.trim() || null,
      butonYaziRengi: txtColor.trim() || null,
      italik: italic,
      ikon: emoji || null,
    };
    if (showSaleName) patch.satisAdi = saleName.trim() || null;
    if (showIconSize) patch.ikonBoyutu = iconSize || null;
    onSave(patch);
    onClose();
  }
  return (
    <div className="gp-overlay" onClick={onClose}>
      <div className="gp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gp-header">
          <h3>Görünüm Ayarları — {target.ad || target.name}</h3>
          <button className="gp-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="gp-body">
          {showSaleName && (
            <div className="gp-field">
              <label>Satış Sayfası Görünen İsim</label>
              <input
                type="text"
                placeholder={target.ad}
                value={saleName}
                onChange={(e) => setSaleName(e.target.value)}
                lang="tr"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              <span className="gp-hint">Boş bırakılırsa satış ekranında ürünün normal adı ({target.ad}) görünür.</span>
            </div>
          )}
          <div className="gp-field-row">
            <div className="gp-field">
              <label>Buton Rengi (hex)</label>
              <div className="gp-color-input">
                <input
                  type="text"
                  placeholder={DEFAULT_BTN_BG}
                  value={btnColor}
                  onChange={(e) => setBtnColor(e.target.value)}
                />
                <span className="gp-swatch" style={{ background: btnColor || DEFAULT_BTN_BG }} />
              </div>
            </div>
            <div className="gp-field">
              <label>Yazı Rengi (hex)</label>
              <div className="gp-color-input">
                <input
                  type="text"
                  placeholder={DEFAULT_BTN_TEXT}
                  value={txtColor}
                  onChange={(e) => setTxtColor(e.target.value)}
                />
                <span className="gp-swatch" style={{ background: txtColor || DEFAULT_BTN_TEXT }} />
              </div>
            </div>
          </div>
         <div className="gp-field">
            <label>Emoji</label>
            <div className="gp-emoji-row">
              <button type="button" className="gp-emoji-pick-btn" onClick={() => setEmojiPickerOpen(true)}>
                <span className="gp-emoji-preview">{emoji || '—'}</span>
                <span>{emoji ? 'Değiştir' : 'Emoji Seç'}</span>
              </button>
              {emoji && (
                <button type="button" className="gp-emoji-clear-btn" onClick={() => setEmoji('')}>
                  <X size={14} /> Kaldır
                </button>
              )}
            </div>
          </div>
          <label className="gp-checkbox">
            <input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />
            İtalik yazı
          </label>
          {showIconSize && (
            <div className="gp-field">
              <label>İkon Boyutu (px)</label>
              <input
                type="number"
                min={12}
                max={48}
                value={iconSize}
                onChange={(e) => setIconSize(parseInt(e.target.value, 10) || DEFAULT_ICON_SIZE)}
              />
            </div>
          )}
        </div>
        <div className="gp-footer">
          <button className="gp-cancel" onClick={onClose}>Vazgeç</button>
          <button className="gp-save" onClick={handleSave}><Save size={14} /> Kaydet</button>
        </div>
      </div>
      {emojiPickerOpen && (
        <EmojiPickerModal
          current={emoji}
          onPick={(e) => { setEmoji(e); setEmojiPickerOpen(false); }}
          onClose={() => setEmojiPickerOpen(false)}
        />
      )}
    </div>
  );
}

// Sık kullanılan gıda/içecek emojileri — yaygın kasa menüsü kategorilerini kapsar.
const EMOJI_CHOICES = [
  '🍅', '🥒', '🧀', '🥚', '🫒', '🥓', '🍗', '🐟', '🍯', '🔪',
  '🥬', '🍟', '🍚', '🍞', '🥗', '🍲', '🍵', '☕', '🥤', '🥛',
  '🍮', '🥪', '🍽️', '🥩', '🍖', '🌶️', '🫑', '🥧', '🍫', '🥐',
];

// Ürün/kategori butonuna eklenecek emojiyi seçmek için ayrı, hafif popup.
// Sabit bir emoji listesi kullanır — ek dosya/network yükü yok.
function EmojiPickerModal({ current, onPick, onClose }) {
  return (
    <div className="gp-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
      <div className="gp-modal gp-emoji-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gp-header">
          <h3>Emoji Seç</h3>
          <button className="gp-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="gp-body">
          <div className="gp-emoji-grid">
            {EMOJI_CHOICES.map((e) => (
              <button
                type="button"
                key={e}
                className={`gp-emoji-choice ${current === e ? 'selected' : ''}`}
                onClick={() => onPick(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Bir kategori bloğunu (başlık + alt kategoriler + ürünler) render eder.
// Ayrı component olmasının sebebi: Görünüm popup'ının kendi state'i (useState) var,
// bu da onu inline .map() içinde değil, kendi fonksiyon bileşeninde tutmamızı gerektiriyor.
function CategoryBlock({
  cat, onUpdateCategoryMeta, onBulkSetStatus, onOpenNewProduct, groupedByAlt,
  localUpdateSubcategoryMeta, localToggleProductStatus, localUpdateProduct, localDeleteProduct, localSetAzPorsiyon,
}) {
  const [gorunumOpen, setGorunumOpen] = useState(false);

  return (
    <div className="pr-category-block">
      <div className="pr-category-head">
        <div className="pr-category-head-left">
          <span className="pr-category-name">{cat.name}</span>
          <input
            type="number"
            min={1}
            max={100}
            className="pr-order-input"
            value={cat.menuSirasi}
            onChange={(e) => onUpdateCategoryMeta(cat.name, { menuSirasi: parseInt(e.target.value, 10) || 1 })}
            title="Menü Sırası (1-100)"
          />
          <label className="pr-sabit-check" title="Sabit Kategori">
            <input
              type="checkbox"
              checked={cat.sabit}
              onChange={(e) => onUpdateCategoryMeta(cat.name, { sabit: e.target.checked })}
            />
            <Pin size={12} /> Sabit
          </label>
          <button className="pr-gorunum-btn" onClick={() => setGorunumOpen(true)} title="Görünüm Ayarları">
            <Palette size={14} />
          </button>
        </div>
        <div className="pr-category-head-actions">
          <button onClick={() => onBulkSetStatus(cat.name, 'AKTIF')}>Hepsini Aktif Yap</button>
          <button disabled={cat.sabit} title={cat.sabit ? 'Sabit kategori — önce Sabit işaretini kaldırın' : ''} onClick={() => onBulkSetStatus(cat.name, 'PASIF')}>
            Hepsini Pasife Al
          </button>
          <button className="pr-new-product-btn" onClick={() => onOpenNewProduct(cat.name)}><Plus size={13} /> Yeni Ürün</button>
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
      {gorunumOpen && (
        <GorunumPopup
          target={cat}
          showIconSize
          onSave={(patch) => onUpdateCategoryMeta(cat.name, patch)}
          onClose={() => setGorunumOpen(false)}
        />
      )}
    </div>
  );
}

function ProductRow({ product: p, onToggle, onUpdate, onDelete, onSetAz, tag }) {
  const [editingAd, setEditingAd] = useState(false);
  const [adDraft, setAdDraft] = useState(p.ad);
  const [azFiyatDraft, setAzFiyatDraft] = useState(p.azFiyat ?? '');
  const [gorunumOpen, setGorunumOpen] = useState(false);

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
        {!isActive && <span className="pr-pasif-tag">Pasif</span>}
        {editingAd ? (
          <input
            autoFocus
            className="pr-name-input"
            value={adDraft}
            onChange={(e) => setAdDraft(e.target.value)}
            onBlur={saveAd}
            onKeyDown={(e) => e.key === 'Enter' && saveAd()}
            lang="tr"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
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

        <button className="pr-gorunum-btn" onClick={() => setGorunumOpen(true)} title="Görünüm Ayarları">
          <Palette size={14} />
        </button>
        <InfoTip text="Satış sayfası görünen ismi, buton rengi, yazı rengi, italik ve ikonu buradan ayarlarsın." />

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
      {gorunumOpen && (
        <GorunumPopup
          target={p}
          showSaleName
          onSave={(patch) => onUpdate(patch)}
          onClose={() => setGorunumOpen(false)}
        />
      )}
    </div>
  );
}