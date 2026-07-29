import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Settings.css';
import { TL } from '../../hooks/useHipposData';
import {
  ListChecks, Calculator, Eye, EyeOff, Share2, Lock, Delete, Search, X,
  Banknote, CreditCard, UtensilsCrossed, BookOpen, ExternalLink, ChevronRight,
} from 'lucide-react';

// Ciro panelini açan PIN — ileride Gelişmiş Ayarlar'dan değiştirilebilir hale gelecek.
const REVENUE_PIN = '1234';

export default function Settings({ data, onNavigate }) {
  const { products, toggleProductStatus, bulkSetCategoryStatus, salesHistory } = data;

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1500);
  }

  // ---- Menü Düzenleme ----
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [menuSearchOpen, setMenuSearchOpen] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const menuSearchRef = useRef(null);

  useEffect(() => {
    if (menuSearchOpen) {
      const t = setTimeout(() => menuSearchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [menuSearchOpen]);

  function closeMenuModal() {
    setMenuModalOpen(false);
    setMenuSearchOpen(false);
    setMenuSearchQuery('');
  }

  const menuGroups = useMemo(() => {
    const q = menuSearchQuery.trim().toLowerCase();
    const groups = {};
    products.forEach((p) => {
      if (q && !p.ad.toLowerCase().includes(q)) return;
      (groups[p.kategori] = groups[p.kategori] || []).push(p);
    });
    return groups;
  }, [products, menuSearchQuery]);

  // ---- Gün Sonu ----
  const [eodConfirmOpen, setEodConfirmOpen] = useState(false);
  function confirmEod() {
    setEodConfirmOpen(false);
    onNavigate('endofday');
  }

  // ---- Anlık Ciro ----
  const [revenueRevealed, setRevenueRevealed] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);
  const pinInputRef = useRef(null);

  useEffect(() => {
    if (pinModalOpen) {
      const t = setTimeout(() => pinInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [pinModalOpen]);

  const todaysSales = useMemo(() => {
    const todayStr = new Date().toDateString();
    return (salesHistory || []).filter((s) => s.ts && new Date(s.ts).toDateString() === todayStr);
  }, [salesHistory]);

  const totals = useMemo(() => {
    const t = { NAKİT: 0, 'KREDİ KARTI': 0, 'YEMEK KARTI': 0, CARİ: 0 };
    todaysSales.forEach((s) => {
      if (t[s.method] !== undefined) t[s.method] += s.amount;
    });
    return { ...t, total: t['NAKİT'] + t['KREDİ KARTI'] + t['YEMEK KARTI'] + t['CARİ'] };
  }, [todaysSales]);

  function checkPin(digits) {
    if (digits === REVENUE_PIN) {
      setRevenueRevealed(true);
      setPinModalOpen(false);
      setPinValue('');
      setPinError(false);
    } else {
      setPinError(true);
      setTimeout(() => {
        setPinValue('');
        setPinError(false);
      }, 550);
    }
  }

  function pressPinDigit(d) {
    setPinValue((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) setTimeout(() => checkPin(next), 100);
      return next;
    });
  }
  function pinBackspace() {
    setPinValue((prev) => prev.slice(0, -1));
  }

  function toggleRevenue() {
    if (revenueRevealed) {
      setRevenueRevealed(false);
    } else {
      setPinValue('');
      setPinError(false);
      setPinModalOpen(true);
    }
  }

  async function shareRevenue() {
    if (!revenueRevealed) return;
    const lines = [
      `Bugünkü Ciro — ${now.toLocaleDateString('tr-TR')}`,
      `Nakit: ${TL(totals['NAKİT'])}`,
      `Kredi Kartı: ${TL(totals['KREDİ KARTI'])}`,
      `Yemek Kartı: ${TL(totals['YEMEK KARTI'])}`,
      `Cari: ${TL(totals['CARİ'])}`,
      `Toplam: ${TL(totals.total)}`,
    ].join('\n');
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Günlük Ciro', text: lines });
      } catch {
        /* kullanıcı paylaşımı iptal etti */
      }
    } else {
      try {
        await navigator.clipboard.writeText(lines);
        showToast('Ciro panoya kopyalandı');
      } catch {
        showToast('Paylaşılamadı');
      }
    }
  }

  const advancedCards = [
    'Yazıcı / Fiş Ayarları',
    'Ses Ayarları',
    'Masa / Paket Düzeni',
    'Yedekleme Durumu',
    'Kategori Sıralaması',
  ];

  return (
    <div className="st-shell">
      <div className="st-columns">
        <div className="st-left">
          <div className="st-actions-row">
            <button className="st-action-card" onClick={() => setMenuModalOpen(true)}>
              <span className="st-action-ico"><ListChecks size={22} /></span>
              <span className="st-action-title">Menü Düzenleme</span>
              <span className="st-action-sub">Bugünkü menüyü hızlıca aç/kapat</span>
            </button>
            <button className="st-action-card earth" onClick={() => setEodConfirmOpen(true)}>
              <span className="st-action-ico"><Calculator size={22} /></span>
              <span className="st-action-title">Gün Sonu Al</span>
              <span className="st-action-sub">Kasa kapanış sayfasına git</span>
            </button>
          </div>

          <div className="st-advanced">
            <h2 className="st-section-title">Gelişmiş Ayarlar</h2>
            <div className="st-advanced-grid">
              {advancedCards.map((label) => (
                <button key={label} className="st-advanced-card" onClick={() => showToast('Yakında')}>
                  <span>{label}</span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CİRO PANELİ */}
        <aside className="st-revenue-panel">
          <div className="st-revenue-head">
            <div className="st-revenue-datetime">
              <span className="date">{now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              <span className="time">{now.toLocaleTimeString('tr-TR')}</span>
            </div>
            <div className="st-revenue-icons">
              <button onClick={toggleRevenue} title={revenueRevealed ? 'Gizle' : 'Göster'}>
                {revenueRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button onClick={shareRevenue} disabled={!revenueRevealed} title="Paylaş">
                <Share2 size={16} />
              </button>
            </div>
          </div>

          {revenueRevealed ? (
            <div className="st-revenue-body">
              <div className="st-revenue-row"><Banknote size={15} /><span>Nakit</span><strong>{TL(totals['NAKİT'])}</strong></div>
              <div className="st-revenue-row"><CreditCard size={15} /><span>Kredi Kartı</span><strong>{TL(totals['KREDİ KARTI'])}</strong></div>
              <div className="st-revenue-row"><UtensilsCrossed size={15} /><span>Yemek Kartı</span><strong>{TL(totals['YEMEK KARTI'])}</strong></div>
              <div className="st-revenue-row"><BookOpen size={15} /><span>Cari</span><strong>{TL(totals['CARİ'])}</strong></div>
              <div className="st-revenue-total"><span>TOPLAM CİRO</span><strong>{TL(totals.total)}</strong></div>
            </div>
          ) : (
            <button className="st-revenue-masked" onClick={toggleRevenue}>
              <Lock size={20} />
              <span className="masked-amount">•••• ₺</span>
              <span className="hint">Görmek için dokun</span>
            </button>
          )}
        </aside>
      </div>

      {toast && <div className="st-toast">{toast}</div>}

      {/* MENÜ DÜZENLEME MODALI */}
      {menuModalOpen && (
        <div className="st-modal-overlay" onClick={closeMenuModal}>
          <div className="st-modal st-menu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-head">
              <h3>Menü Düzenleme</h3>
              <div className="st-modal-head-actions">
                <button className="st-icon-btn" onClick={() => setMenuSearchOpen((v) => !v)}>
                  <Search size={15} />
                </button>
                <button className="st-modal-x" onClick={closeMenuModal}><X size={16} /></button>
              </div>
            </div>

            {menuSearchOpen && (
              <input
                ref={menuSearchRef}
                className="st-menu-search-input"
                type="text"
                placeholder="Ürün ara..."
                value={menuSearchQuery}
                onChange={(e) => setMenuSearchQuery(e.target.value)}
              />
            )}

            <div className="st-menu-list">
              {Object.keys(menuGroups).length === 0 && <p className="st-menu-empty">Sonuç bulunamadı</p>}
              {Object.entries(menuGroups).map(([kategori, items]) => (
                <div key={kategori} className="st-menu-group">
                  <div className="st-menu-group-head">
                    <span>{kategori}</span>
                    <div className="st-menu-bulk-btns">
                      <button onClick={() => bulkSetCategoryStatus(kategori, 'AKTIF')}>Hepsini Aç</button>
                      <button onClick={() => bulkSetCategoryStatus(kategori, 'PASIF')}>Hepsini Kapat</button>
                    </div>
                  </div>
                  {items.map((p) => {
                    const isActive = p.durum !== 'PASIF';
                    return (
                      <div key={p.id} className="st-menu-item">
                        <span className={isActive ? '' : 'inactive'}>{p.ad}</span>
                        <button
                          className={`st-toggle ${isActive ? 'on' : ''}`}
                          onClick={() => toggleProductStatus(p.id)}
                        >
                          <span className="st-toggle-knob" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <button className="st-goto-products" onClick={() => onNavigate('products')}>
              Detaylı ürün yönetimi (fiyat / ekle / sil) için Ürünler sayfasına git
              <ExternalLink size={13} />
            </button>
          </div>
        </div>
      )}

      {/* GÜN SONU ONAY MODALI */}
      {eodConfirmOpen && (
        <div className="st-modal-overlay" onClick={() => setEodConfirmOpen(false)}>
          <div className="st-modal st-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Gün Sonu sayfasına gitmek istediğinize emin misiniz?</h3>
            <div className="st-modal-footer">
              <button className="st-secondary" onClick={() => setEodConfirmOpen(false)}>Vazgeç</button>
              <button className="st-primary" onClick={confirmEod}>Onayla</button>
            </div>
          </div>
        </div>
      )}

      {/* PIN MODALI */}
      {pinModalOpen && (
        <div className="st-modal-overlay" onClick={() => setPinModalOpen(false)}>
          <div className={`st-modal st-pin-modal ${pinError ? 'shake' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-head">
              <h3><Lock size={15} /> Ciroyu Görüntüle</h3>
              <button className="st-modal-x" onClick={() => setPinModalOpen(false)}><X size={16} /></button>
            </div>
            <div className="st-pin-dots" onClick={() => pinInputRef.current?.focus()}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`st-pin-dot ${pinValue.length > i ? 'filled' : ''}`} />
              ))}
              <input
                ref={pinInputRef}
                className="st-pin-hidden-input"
                type="tel"
                inputMode="numeric"
                maxLength={4}
                value={pinValue}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                  setPinValue(digits);
                  if (digits.length === 4) setTimeout(() => checkPin(digits), 100);
                }}
              />
            </div>
            {pinError && <p className="st-pin-error">Yanlış PIN, tekrar deneyin</p>}
            <div className="st-pin-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button key={n} onClick={() => pressPinDigit(n)}>{n}</button>
              ))}
              <div />
              <button onClick={() => pressPinDigit('0')}>0</button>
              <button onClick={pinBackspace}><Delete size={16} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}