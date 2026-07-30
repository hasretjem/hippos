import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Settings.css';
import { TL } from '../../hooks/useHipposData';
import { supabase } from '../../services/supabase';
import {
  ListChecks, Calculator, Eye, EyeOff, Share2, Lock, Delete, Search, X,
  Banknote, CreditCard, UtensilsCrossed, BookOpen, ExternalLink, ChevronRight,
  Undo2, Wifi, WifiOff, Printer, Database, FileSpreadsheet, Triangle,
} from 'lucide-react';

// Ciro panelini açan PIN — ileride Gelişmiş Ayarlar'dan değiştirilebilir hale gelecek.
const REVENUE_PIN = '1234';

export default function Settings({ data, onNavigate }) {
  const {
    products,
    toggleProductStatus,
    bulkSetCategoryStatus,
    subcategories,
    updateSubcategoryMeta,
    salesHistory,
    soldItems,
    allTables,
    orders,
    actionHistory,
    undoLastAction,
  } = data;

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
    const groups = {}; // kategori -> { altKategori -> [ürünler] }
    products.forEach((p) => {
      if (p.isAzVariant) return; // Az varyantı, ana ürünün "Az Porsiyonlu" tikiyle yönetiliyor
      if (q && !p.ad.toLowerCase().includes(q)) return;
      const alt = p.altKategori || '';
      groups[p.kategori] = groups[p.kategori] || {};
      (groups[p.kategori][alt] = groups[p.kategori][alt] || []).push(p);
    });
    return groups;
  }, [products, menuSearchQuery]);

  function sortedSubKeys(kategori, subMap) {
    return Object.keys(subMap).sort((a, b) => {
      const sa = subcategories.find((s) => s.kategori === kategori && s.name === a);
      const sb = subcategories.find((s) => s.kategori === kategori && s.name === b);
      return (sa?.menuSirasi ?? 50) - (sb?.menuSirasi ?? 50) || a.localeCompare(b, 'tr');
    });
  }

  // ---- Gün Sonu ----
  const [eodConfirmOpen, setEodConfirmOpen] = useState(false);
  const [eodBlockedOpen, setEodBlockedOpen] = useState(false);

  const openTables = useMemo(
    () => allTables.filter((t) => orders[t] && orders[t].length > 0),
    [allTables, orders]
  );

  function handleEodClick() {
    if (openTables.length > 0) {
      setEodBlockedOpen(true);
    } else {
      setEodConfirmOpen(true);
    }
  }

  function confirmEod() {
    setEodConfirmOpen(false);
    onNavigate('endofday');
  }

  // ---- Son işlemler / geri al (sol alt) ----
  const [historyOpen, setHistoryOpen] = useState(false);

  // ---- Bugün paneli: en çok satanlar + genel istatistik ----
  const [sandwichShowAll, setSandwichShowAll] = useState(false);
  const [mealShowAll, setMealShowAll] = useState(false);

  const todaysSoldItems = useMemo(() => {
    const todayStr = new Date().toDateString();
    return (soldItems || []).filter((i) => i.ts && new Date(i.ts).toDateString() === todayStr);
  }, [soldItems]);

  function topSellers(filterFn, limit) {
    const counts = {};
    todaysSoldItems.filter(filterFn).forEach((i) => {
      counts[i.ad] = (counts[i.ad] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([ad, count]) => ({ ad, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  const isSandwich = (i) => i.kategori && i.kategori.includes('SANDVİÇ');
  const isMeal = (i) => i.altKategori === 'Ev Yemekleri';

  const sandwichSellers = useMemo(() => topSellers(isSandwich, sandwichShowAll ? 10 : 5), [todaysSoldItems, sandwichShowAll]);
  const mealSellers = useMemo(() => topSellers(isMeal, mealShowAll ? 10 : 5), [todaysSoldItems, mealShowAll]);
  const sandwichTotalQty = useMemo(() => todaysSoldItems.filter(isSandwich).length, [todaysSoldItems]);
  const mealTotalQty = useMemo(() => todaysSoldItems.filter(isMeal).length, [todaysSoldItems]);

  // ---- Bağlantı durumu ----
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    function goOnline() { setOnline(true); }
    function goOffline() { setOnline(false); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const [supabaseOk, setSupabaseOk] = useState(null);
  const [supabaseLastSync, setSupabaseLastSync] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const { error } = await supabase.from('tables').select('*').limit(1);
        if (cancelled) return;
        setSupabaseOk(!error);
        if (!error) setSupabaseLastSync(new Date());
      } catch {
        if (!cancelled) setSupabaseOk(false);
      }
    }
    check();
    const id = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const [sheetsOk, setSheetsOk] = useState(null);
  const [sheetsLastSync, setSheetsLastSync] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/sheets');
        if (cancelled) return;
        setSheetsOk(res.ok);
        if (res.ok) setSheetsLastSync(new Date());
      } catch {
        if (!cancelled) setSheetsOk(false);
      }
    }
    check();
    const id = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // NOT: Yazıcı bağlantısı tarayıcıdan okunamıyor (web platformunun sınırı) — nötr gösteriliyor.
  // Google Sheets: /api/sheets uç noktasına gerçek bir istek atılıp gerçek durum ölçülüyor.
  // Vercel: sayfa zaten oradan yüklendiği için doğası gereği bağlı.
  const connections = [
    { key: 'internet', label: 'İnternet', status: online ? 'ok' : 'down', Icon: online ? Wifi : WifiOff },
    { key: 'printer', label: 'Yazıcı', status: 'unknown', Icon: Printer, note: 'Tarayıcıdan kontrol edilemiyor' },
    { key: 'supabase', label: 'Supabase', status: supabaseOk === null ? 'checking' : supabaseOk ? 'ok' : 'down', Icon: Database, lastSync: supabaseLastSync },
    { key: 'sheets', label: 'Google Sheets', status: sheetsOk === null ? 'checking' : sheetsOk ? 'ok' : 'down', Icon: FileSpreadsheet, lastSync: sheetsLastSync },
    { key: 'vercel', label: 'Vercel', status: 'ok', Icon: Triangle },
  ];
  const overallOk = online && supabaseOk !== false && sheetsOk !== false;

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

  const txCount = todaysSales.length;
  const avgTicket = txCount > 0 ? totals.total / txCount : 0;

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
            <button className="st-action-card earth" onClick={handleEodClick}>
              <span className="st-action-ico"><Calculator size={22} /></span>
              <span className="st-action-title">Gün Sonu Al</span>
              <span className="st-action-sub">Kasa kapanış sayfasına git</span>
            </button>
          </div>

          {/* BUGÜN PANELİ */}
          <div className="st-today-panel">
            <h2 className="st-section-title">Bugün</h2>
            <div className="st-today-stats">
              <div className="st-stat-box">
                <strong>{txCount}</strong>
                <span>İşlem</span>
              </div>
              <div className="st-stat-box">
                <strong>{TL(avgTicket)}</strong>
                <span>Ortalama Fiş</span>
              </div>
            </div>

            <div className="st-bestseller-block">
              <div className="st-bestseller-head">
                <span>Sandviç — en çok satılanlar</span>
                <span className="st-bestseller-qty">bugün {sandwichTotalQty} adet</span>
              </div>
              <ol className="st-bestseller-list">
                {sandwichSellers.length === 0 && <li className="empty">Henüz satış yok</li>}
                {sandwichSellers.map((s, i) => (
                  <li key={s.ad}>
                    <span className="rank">{i + 1}</span>
                    <span className="name">{s.ad}</span>
                    <span className="count">{s.count} adet</span>
                  </li>
                ))}
              </ol>
              <button className="st-showall-btn" onClick={() => setSandwichShowAll((v) => !v)}>
                {sandwichShowAll ? 'Daha az göster' : 'Tümünü Gör (10)'}
              </button>
            </div>

            <div className="st-bestseller-block">
              <div className="st-bestseller-head">
                <span>Ev Yemekleri — en çok satılanlar</span>
                <span className="st-bestseller-qty">bugün {mealTotalQty} adet</span>
              </div>
              <ol className="st-bestseller-list">
                {mealSellers.length === 0 && <li className="empty">Henüz satış yok</li>}
                {mealSellers.map((s, i) => (
                  <li key={s.ad}>
                    <span className="rank">{i + 1}</span>
                    <span className="name">{s.ad}</span>
                    <span className="count">{s.count} adet</span>
                  </li>
                ))}
              </ol>
              <button className="st-showall-btn" onClick={() => setMealShowAll((v) => !v)}>
                {mealShowAll ? 'Daha az göster' : 'Tümünü Gör (10)'}
              </button>
            </div>
          </div>

          {/* BAĞLANTI PANELİ */}
          <div className="st-conn-panel">
            <div className="st-conn-head">
              <span className={`st-conn-dot ${overallOk ? 'ok' : 'down'}`} />
              <h2 className="st-section-title" style={{ margin: 0 }}>Bağlantı Durumu</h2>
            </div>
            <div className="st-conn-list">
              {connections.map(({ key, label, status, Icon, lastSync, note }) => (
                <div key={key} className="st-conn-row">
                  <span className={`st-conn-dot ${status}`} />
                  <Icon size={15} className="st-conn-ico" />
                  <span className="st-conn-label">{label}</span>
                  {lastSync && (
                    <span className="st-conn-sync">Son Senk. {lastSync.toLocaleTimeString('tr-TR')}</span>
                  )}
                  {note && <span className="st-conn-note">{note}</span>}
                </div>
              ))}
            </div>
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

      {/* SON İŞLEMLER / GERİ AL (sol alt) */}
      <div className="st-history-wrap">
        {historyOpen && (
          <div className="st-history-panel">
            <div className="st-history-head">
              <span>Son İşlemler</span>
              <button onClick={() => setHistoryOpen(false)}><X size={14} /></button>
            </div>
            {actionHistory.length === 0 && <p className="st-history-empty">Henüz işlem yok</p>}
            {actionHistory.map((h, idx) => (
              <div key={h.id} className={`st-history-item ${idx === 0 ? 'latest' : ''}`}>
                <div>
                  <p className="desc">{h.description}</p>
                  <p className="time">{h.time}</p>
                </div>
                {idx === 0 && (
                  <button className="st-undo-btn" onClick={undoLastAction}>
                    <Undo2 size={12} /> Geri Al
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <button className="st-history-fab" onClick={() => setHistoryOpen((v) => !v)}>
          <Undo2 size={19} />
          {actionHistory.length > 0 && <span className="st-history-badge">{actionHistory.length}</span>}
        </button>
      </div>

      {/* AÇIK MASA — GÜN SONU ENGELLENDİ */}
      {eodBlockedOpen && (
        <div className="st-modal-overlay" onClick={() => setEodBlockedOpen(false)}>
          <div className="st-modal st-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Açık masa olduğu için Gün Sonu alınamıyor</h3>
            <p className="st-modal-hint">
              Önce şu masaları kapatman gerekiyor: <strong>{openTables.join(', ')}</strong>
            </p>
            <div className="st-modal-footer">
              <button className="st-primary" onClick={() => setEodBlockedOpen(false)}>Tamam</button>
            </div>
          </div>
        </div>
      )}

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
              {Object.entries(menuGroups).map(([kategori, subMap]) => (
                <div key={kategori} className="st-menu-group">
                  <div className="st-menu-group-head">
                    <span>{kategori}</span>
                    <div className="st-menu-bulk-btns">
                      <button onClick={() => bulkSetCategoryStatus(kategori, 'AKTIF')}>Hepsini Aç</button>
                      <button onClick={() => bulkSetCategoryStatus(kategori, 'PASIF')}>Hepsini Kapat</button>
                    </div>
                  </div>
                  {sortedSubKeys(kategori, subMap).map((alt) => {
                    const sub = subcategories.find((s) => s.kategori === kategori && s.name === alt);
                    return (
                      <div key={alt || '_'} className="st-submenu-group">
                        {alt && (
                          <div className="st-submenu-head">
                            <span>{alt}</span>
                            {sub && (
                              <input
                                type="number"
                                min={1}
                                max={100}
                                className="st-submenu-order"
                                value={sub.menuSirasi}
                                onChange={(e) => updateSubcategoryMeta(kategori, alt, { menuSirasi: parseInt(e.target.value, 10) || 1 })}
                                title="Menü Sırası (1-100)"
                              />
                            )}
                          </div>
                        )}
                        {subMap[alt].map((p) => {
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