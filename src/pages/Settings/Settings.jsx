import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Settings.css';
import { TL, EKMEK_TURLERI_STOK } from '../../hooks/useHipposData';
import { supabase } from '../../services/supabase';
import GununMenusu from './GununMenusu';
import {
  ListChecks, Calculator, Eye, EyeOff, Share2, Search, X,
  Banknote, CreditCard, UtensilsCrossed, BookOpen, ExternalLink, ChevronRight,
  Undo2, Wifi, WifiOff, Printer, Database, FileSpreadsheet, Triangle, Image as ImageIcon, RefreshCw,
  Wheat, Copy, Check, Receipt, AlertTriangle,
} from 'lucide-react';

// Türkçe karakter duyarsız arama (İ/I/ı/i, ş/s, ğ/g, ü/u, ö/o, ç/c)
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

// Ekmek stok kritik seviyeye düşünce önerilecek sipariş listesi (kopyala-yapıştır için)
  const EKMEK_SIPARIS_LISTESI = [
  { kod: '1027053', metin: '2 Koli 1027053  Don.Baget Fransız  YP 1/2 (40*160 Gr) Ulker Marifet' },
  { kod: '4400064', metin: '2 Koli 4400064  1/3 Baget Sade 95 Gr. 50/36' },
  { kod: '1033506', metin: '1 Koli 1033506 1/3 Küçük Tahıl Ekmek (70 Ad )' },
  { kod: '4400191', metin: '1 Koli 4400191  1/2 Artısan Baget Domates&Fesleğen' },
];

export default function Settings({ data, onNavigate }) {
  const {
    products,
    categories,
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
    ekmekStok,
    ekmekStokEkle,
    harcamaTaslagi,
    saveHarcamaTaslagi,
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

  const [anaKasaDraft, setAnaKasaDraft] = useState(harcamaTaslagi.anaKasa.length ? harcamaTaslagi.anaKasa : [{ ad: '', tutar: '' }]);
  const [gunlukKasaDraft, setGunlukKasaDraft] = useState(harcamaTaslagi.gunlukKasa.length ? harcamaTaslagi.gunlukKasa : [{ ad: '', tutar: '' }]);
  const harcamaSeedRef = useRef(false);
  useEffect(() => {
    if (harcamaSeedRef.current) return;
    if (harcamaTaslagi.anaKasa.length || harcamaTaslagi.gunlukKasa.length) {
      harcamaSeedRef.current = true;
      setAnaKasaDraft(harcamaTaslagi.anaKasa.length ? harcamaTaslagi.anaKasa : [{ ad: '', tutar: '' }]);
      setGunlukKasaDraft(harcamaTaslagi.gunlukKasa.length ? harcamaTaslagi.gunlukKasa : [{ ad: '', tutar: '' }]);
    }
  }, [harcamaTaslagi]);
  const harcamaSaveTimerRef = useRef(null);
  function scheduleHarcamaSave(nextAna, nextGunluk) {
    if (harcamaSaveTimerRef.current) clearTimeout(harcamaSaveTimerRef.current);
    harcamaSaveTimerRef.current = setTimeout(() => {
      saveHarcamaTaslagi({
        anaKasa: nextAna.filter((r) => r.ad.trim() || r.tutar),
        gunlukKasa: nextGunluk.filter((r) => r.ad.trim() || r.tutar),
      });
    }, 600);
  }
  function updateHarcamaRow(which, idx, field, value) {
    const setter = which === 'ana' ? setAnaKasaDraft : setGunlukKasaDraft;
    setter((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
      scheduleHarcamaSave(which === 'ana' ? next : anaKasaDraft, which === 'gunluk' ? next : gunlukKasaDraft);
      return next;
    });
  }
  function addHarcamaRow(which) {
    const setter = which === 'ana' ? setAnaKasaDraft : setGunlukKasaDraft;
    setter((prev) => [...prev, { ad: '', tutar: '' }]);
  }
  function removeHarcamaRow(which, idx) {
    const setter = which === 'ana' ? setAnaKasaDraft : setGunlukKasaDraft;
    setter((prev) => {
      const next = prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ ad: '', tutar: '' }];
      scheduleHarcamaSave(which === 'ana' ? next : anaKasaDraft, which === 'gunluk' ? next : gunlukKasaDraft);
      return next;
    });
  }

  // ---- Menü Düzenleme ----
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [gununMenusuOpen, setGununMenusuOpen] = useState(false);
  const [menuSearchOpen, setMenuSearchOpen] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  // Accordion: hangi kategoriler açık (Set<string>). Başlangıçta hepsi kapalı.
  const [openCategories, setOpenCategories] = useState(new Set());

  useEffect(() => {
  if (!menuModalOpen) return;
  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key.length === 1 && /[a-zçğıöşüA-ZÇĞİÖŞÜ0-9]/.test(e.key)) {
      setMenuSearchOpen(true);
      setMenuSearchQuery((q) => q + e.key);
    } else if (e.key === 'Backspace') {
      setMenuSearchQuery((q) => q.slice(0, -1));
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [menuModalOpen]);
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
    const q = normalizeTr(menuSearchQuery.trim());
    const groups = {}; // kategori -> { altKategori -> [ürünler] }
    products.forEach((p) => {
      if (p.isAzVariant) return; // Az varyantı, ana ürünün "Az Porsiyonlu" tikiyle yönetiliyor
      if (q && !normalizeTr(p.ad).includes(q)) return;
      const alt = p.altKategori || '';
      groups[p.kategori] = groups[p.kategori] || {};
      (groups[p.kategori][alt] = groups[p.kategori][alt] || []).push(p);
    });
    return groups;
  }, [products, menuSearchQuery]);

  // Sadece "YEMEKLER" en başa alınıyor, geri kalan kategoriler eskisi gibi (ham ürün
  // listesindeki) sırada kalıyor — Satış sayfasındaki sıralamadan bilerek bağımsız.
  const sortedMenuGroupEntries = useMemo(() => {
    const entries = Object.entries(menuGroups);
    const yemeklerIdx = entries.findIndex(([kategori]) => kategori === 'YEMEKLER');
    if (yemeklerIdx <= 0) return entries;
    const yemekler = entries[yemeklerIdx];
    const rest = entries.filter((_, i) => i !== yemeklerIdx);
    return [yemekler, ...rest];
  }, [menuGroups]);

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

  // ---- Son işlemler / geri al (sağ alt) ----
  const [historyOpen, setHistoryOpen] = useState(false);

  // ---- Ekmek Stok Ekleme ----
  const [ekmekModalOpen, setEkmekModalOpen] = useState(false);
  const [ekmekGirisleri, setEkmekGirisleri] = useState({ buyukBeyaz: '', kucukBeyaz: '', domatesli: '', kucukKepek: '' });
  const [ekmekKaydediliyor, setEkmekKaydediliyor] = useState(false);
  const [kopyalananKod, setKopyalananKod] = useState(null);
  // Enter'a basınca sıradaki adet kutusuna geçebilmek için her input'un ref'i burada tutuluyor.
  const ekmekStokInputRefs = useRef({});

  function ekmekStokEnterNext(key) {
    const idx = EKMEK_TURLERI_STOK.findIndex((t) => t.key === key);
    if (idx === -1 || idx === EKMEK_TURLERI_STOK.length - 1) return; // son alanda Enter hiçbir şey yapmasın
    const nextKey = EKMEK_TURLERI_STOK[idx + 1].key;
    ekmekStokInputRefs.current[nextKey]?.focus();
  }

  function closeEkmekModal() {
    setEkmekModalOpen(false);
    setEkmekGirisleri({ buyukBeyaz: '', kucukBeyaz: '', domatesli: '', kucukKepek: '' });
  }

  async function handleEkmekKaydet() {
    setEkmekKaydediliyor(true);
    const sonuc = await ekmekStokEkle(ekmekGirisleri);
    setEkmekKaydediliyor(false);
    if (sonuc.success) {
      closeEkmekModal();
      showToast('Ekmek stoğu güncellendi');
    } else {
      showToast(sonuc.message || 'Kaydedilemedi, tekrar deneyin');
    }
  }

  async function kopyalaSiparis(metin, kod) {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalananKod(kod);
      setTimeout(() => setKopyalananKod(null), 1500);
    } catch {
      showToast('Kopyalanamadı');
    }
  }

  // Sağ kolonda gösterilecek, kritiğin altına düşmüş ekmek türleri — modal her açıldığında/
  // stok her değiştiğinde otomatik hesaplanır.
  const dusukStoklar = useMemo(
    () => EKMEK_TURLERI_STOK.filter((t) => (ekmekStok[t.key] || 0) < t.esik),
    [ekmekStok]
  );

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
  const isMeal = (i) => i.kategori === 'YEMEKLER';

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
  // Şifre kaldırıldı — sayfa açılır açılmaz göster, göz butonuyla gizle/göster.
  const [revenueRevealed, setRevenueRevealed] = useState(true);
  const [usageData, setUsageData] = useState(null);


  // Gün Sonu'nda kaydedilen sayımlarla Hippos'un kendi hesapladığı ciroyu karşılaştırmak için
  // — bugünün Gün Sonu kaydı varsa çekiyoruz. Realtime değil, düz fetch.
  const [bugunGunSonu, setBugunGunSonu] = useState(null);
  useEffect(() => {
    async function fetchGunSonu() {
      try {
        const res = await fetch('/api/gunsonu');
        const json = await res.json();
        const bugunTarih = new Date().toLocaleDateString('tr-TR');
        setBugunGunSonu((json.records || []).find((r) => r.tarih === bugunTarih) || null);
      } catch {
        setBugunGunSonu(null);
      }
    }
    fetchGunSonu();
    const id = setInterval(fetchGunSonu, 30000);
    return () => clearInterval(id);
  }, []);

  const [usageLoading, setUsageLoading] = useState(false);

  async function fetchUsage() {
    setUsageLoading(true);
    try {
      const res = await fetch('/api/usage');
      const json = await res.json();
      setUsageData(json);
    } catch {
      setUsageData(null);
    } finally {
      setUsageLoading(false);
    }
  }
  // Sayfa açılır açılmaz bir kere çek, sonra 30 saniyede bir tazele — düz fetch, Realtime
  // değil, kotaya hiç dokunmuyor.
  useEffect(() => {
    fetchUsage();
    const id = setInterval(fetchUsage, 30000);
    return () => clearInterval(id);
  }, []);

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

  const salesRowCount = todaysSales.length;
  const txCount = todaysSales.length;
  const avgTicket = txCount > 0 ? totals.total / txCount : 0;

  function toggleRevenue() {
    setRevenueRevealed((v) => !v);
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

          {/* Realtime Kullanım Sayacı — şifresiz, sayfaya girer girmez görünür. Kendisi
              Realtime kotasına hiç dokunmuyor, düz fetch ile 30sn'de bir tazeleniyor,
              tahmini bir rakamdır (Supabase'in kendi resmi rakamıyla birebir aynı olmayabilir). */}
          <div className="st-usage-panel standalone">
            <div className="st-usage-head">
              <span>Realtime Mesaj Kullanımı (tahmini)</span>
              <button onClick={fetchUsage} title="Tazele"><RefreshCw size={12} className={usageLoading ? 'spin' : ''} /></button>
            </div>
            {usageData ? (
              <>
                <div className={`st-usage-bar-wrap ${usageData.buAy >= 2000000 ? 'over' : usageData.buAy >= 1500000 ? 'warn' : 'ok'}`}>
                  <div className="st-usage-bar" style={{ width: `${Math.min(100, (usageData.buAy / 2000000) * 100)}%` }} />
                </div>
                <div className="st-usage-numbers">
                  <span>{usageData.buAy.toLocaleString('tr-TR')} / 2.000.000 (bu ay)</span>
                  <span className="st-usage-24h">son 24 saat: {usageData.son24Saat.toLocaleString('tr-TR')}</span>
                </div>

                {usageData.tabloKirilimi && Object.keys(usageData.tabloKirilimi).length > 0 && (
                  <div className="st-usage-breakdown">
                    {Object.entries(usageData.tabloKirilimi)
                      .sort((a, b) => b[1] - a[1])
                      .map(([table, count]) => (
                        <div key={table} className="st-usage-breakdown-row">
                          <span>{table}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                  </div>
                )}

                {usageData.sonMesajlar && usageData.sonMesajlar.length > 0 && (
                  <details className="st-usage-log">
                    <summary>Son {usageData.sonMesajlar.length} mesaj</summary>
                    <div className="st-usage-log-list">
                      {usageData.sonMesajlar.map((ev, i) => (
                        <div key={i} className="st-usage-log-row">
                          <div className="left">
                            <span className="table">{ev.table}</span>
                            {ev.detail && <span className="detail">{ev.detail}</span>}
                            {ev.dbTs && (
                              <span className="dbts">
                                DB'de gerçek değişme: {new Date(ev.dbTs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <span className="time">alındı: {new Date(ev.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <p className="st-usage-empty">{usageLoading ? 'Yükleniyor...' : 'Veri yok'}</p>
            )}
          </div>

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
            <button className="st-action-card" onClick={() => setGununMenusuOpen(true)}>
              <span className="st-action-ico"><ImageIcon size={22} /></span>
              <span className="st-action-title">Günün Menüsü</span>
              <span className="st-action-sub">Görsel önizleme oluştur (test aşaması)</span>
            </button>
            <button className="st-action-card" onClick={() => setEkmekModalOpen(true)}>
              <span className="st-action-ico"><Wheat size={22} /></span>
              <span className="st-action-title">Ekmek Stok Ekleme</span>
              <span className="st-action-sub">Fırından gelen ekmeği stoğa işle</span>
            </button>
            <button className="st-action-card" onClick={() => onNavigate('muhasebe')}>
              <span className="st-action-ico"><Receipt size={22} /></span>
              <span className="st-action-title">Muhasebe</span>
              <span className="st-action-sub">Fatura, makbuz, toptancı ve personel yönetimi</span>
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

        {/* SAĞ SÜTUN: Ciro Paneli + altında Harcamalar Paneli (dikey, sağda tek sütun) */}
        <div className="st-right-col">
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

            {/* 1000 satır uyarısı */}
            {salesRowCount >= 1000 && (
              <div className="st-revenue-limit-warn">
                <AlertTriangle size={14} />
                <span>GÜNLÜK VERİ EKSİK OLABİLİR — bugün 1000+ fiş var, Supabase bir kısmını kesmemiş olabilir. Ciro güvenilir değil.</span>
              </div>
            )}

            {revenueRevealed ? (
              <div className="st-revenue-body">
                <div className="st-revenue-row"><Banknote size={15} /><span>Nakit</span><strong>{TL(totals['NAKİT'])}</strong></div>
                <div className="st-revenue-row"><CreditCard size={15} /><span>Kredi Kartı</span><strong>{TL(totals['KREDİ KARTI'])}</strong></div>
                <div className="st-revenue-row"><UtensilsCrossed size={15} /><span>Yemek Kartı</span><strong>{TL(totals['YEMEK KARTI'])}</strong></div>
                <div className="st-revenue-row"><BookOpen size={15} /><span>Cari</span><strong>{TL(totals['CARİ'])}</strong></div>
                <div className="st-revenue-total"><span>TOPLAM CİRO</span><strong>{TL(totals.total)}</strong></div>

                <div className="st-gunsonu-compare">
                  <span className="st-usage-head-label">Gün Sonu ile Karşılaştırma</span>
                  {bugunGunSonu ? (
                    <>
                      {[
                        { label: 'Nakit', ciro: totals['NAKİT'], gs: bugunGunSonu.toplamNakitPara || 0 },
                        { label: 'Kredi Kartı', ciro: totals['KREDİ KARTI'], gs: bugunGunSonu.posToplam || 0 },
                        { label: 'Yemek Kartı', ciro: totals['YEMEK KARTI'], gs: bugunGunSonu.genelYemekToplami || 0 },
                        { label: 'Cari', ciro: totals['CARİ'], gs: bugunGunSonu.cariToplam || 0 },
                      ].map((row) => {
                        const fark = row.gs - row.ciro;
                        return (
                          <div key={row.label} className="st-gunsonu-row">
                            <span>{row.label}</span>
                            <span className={Math.abs(fark) > 0.5 ? 'fark warn' : 'fark ok'}>{TL(fark)}</span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <p className="st-gunsonu-empty">Bugün için henüz Gün Sonu kaydı yok</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="st-revenue-body st-revenue-hidden">
                <div className="st-revenue-total"><span>TOPLAM CİRO</span><strong>••••• ₺</strong></div>
              </div>
            )}
          </aside>

          {/* HARCAMALAR PANELİ — Ciro Panelinin ALTINDA, ama şifreye bağlı DEĞİL —
              herkes (şifresiz) buraya harcama yazabilsin diye her zaman görünür. */}
          <aside className="st-harcama-panel">
            <div className="st-harcama-head"><Calculator size={15} /><span>Harcamalar</span></div>
            <div className="st-harcama-hint">Buraya girdiklerin Gün Sonu Al sayfasına otomatik gelir</div>

            <span className="st-subhead">Günlük Kasadan Harcamalar</span>
            <div className="st-harcama-rows">
              {gunlukKasaDraft.map((row, idx) => (
                <div key={idx} className="st-harcama-row">
                  <input placeholder="Ne için" value={row.ad} onChange={(e) => updateHarcamaRow('gunluk', idx, 'ad', e.target.value)} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                  <input type="number" placeholder="0" value={row.tutar} onChange={(e) => updateHarcamaRow('gunluk', idx, 'tutar', e.target.value)} />
                  {gunlukKasaDraft.length > 1 && <button className="st-harcama-row-del" onClick={() => removeHarcamaRow('gunluk', idx)}><X size={12} /></button>}
                </div>
              ))}
              <button className="st-harcama-add-btn" onClick={() => addHarcamaRow('gunluk')}>+ Satır Ekle</button>
            </div>

            <span className="st-subhead" style={{ marginTop: 12 }}>Ana Kasadan Harcamalar</span>
            <div className="st-harcama-rows">
              {anaKasaDraft.map((row, idx) => (
                <div key={idx} className="st-harcama-row">
                  <input placeholder="Ne için" value={row.ad} onChange={(e) => updateHarcamaRow('ana', idx, 'ad', e.target.value)} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                  <input type="number" placeholder="0" value={row.tutar} onChange={(e) => updateHarcamaRow('ana', idx, 'tutar', e.target.value)} />
                  {anaKasaDraft.length > 1 && <button className="st-harcama-row-del" onClick={() => removeHarcamaRow('ana', idx)}><X size={12} /></button>}
                </div>
              ))}
              <button className="st-harcama-add-btn" onClick={() => addHarcamaRow('ana')}>+ Satır Ekle</button>
            </div>
          </aside>
        </div>
      </div>

      {toast && <div className="st-toast">{toast}</div>}

      {/* SON İŞLEMLER / GERİ AL (sağ alt) */}
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
                lang="tr"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
            )}

            <div className="st-menu-body">
              <div className="st-menu-list">
                {Object.keys(menuGroups).length === 0 && <p className="st-menu-empty">Sonuç bulunamadı</p>}
                {sortedMenuGroupEntries.map(([kategori, subMap]) => {
                  const isOpen = menuSearchQuery.trim() ? true : openCategories.has(kategori);
                  return (
                  <div key={kategori} className="st-menu-group">
                    <div
                      className="st-menu-group-head"
                      onClick={() => setOpenCategories((prev) => {
                        const next = new Set(prev);
                        if (next.has(kategori)) next.delete(kategori); else next.add(kategori);
                        return next;
                      })}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.18s' }} />
                        {kategori}
                      </span>
                      <div className="st-menu-bulk-btns" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => bulkSetCategoryStatus(kategori, 'AKTIF')}>Hepsini Aç</button>
                        <button onClick={() => bulkSetCategoryStatus(kategori, 'PASIF')}>Hepsini Kapat</button>
                      </div>
                    </div>
                  {isOpen && sortedSubKeys(kategori, subMap).map((alt) => {
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
                              <span className={isActive ? '' : 'inactive'}>
                                {!isActive && <span className="st-menu-pasif-tag">Pasif</span>}
                                {p.ad}
                              </span>
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
                );
              })}
              </div>

            {/* ANLIKT MENÜ ÖNİZLEME PANELİ */}
            <div className="st-menu-preview">
              <div className="st-menu-preview-head">Aktif Ürünler</div>
              {(() => {
                const sortedCats = [...new Set(
                  products.filter((p) => !p.isAzVariant).map((p) => p.kategori)
                )].sort((a, b) => {
                  const ca = categories?.find((c) => c.name === a);
                  const cb = categories?.find((c) => c.name === b);
                  return (ca?.menuSirasi ?? 50) - (cb?.menuSirasi ?? 50) || a.localeCompare(b, 'tr');
                });
                const aktifUrunler = sortedCats.map((kat) => ({
                  kat,
                  uruler: products
                    .filter((p) => !p.isAzVariant && p.kategori === kat && p.durum !== 'PASIF')
                    .sort((a, b) => a.menuSirasi - b.menuSirasi || a.ad.localeCompare(b.ad, 'tr')),
                })).filter((g) => g.uruler.length > 0);
                if (aktifUrunler.length === 0) return <p className="st-preview-empty">Tüm ürünler pasif</p>;
                return aktifUrunler.map(({ kat, uruler }) => (
                  <div key={kat} className="st-preview-group">
                    <div className="st-preview-cat">{kat}</div>
                    {uruler.map((p, i) => (
                      <div key={p.id} className="st-preview-item">
                        <span className="st-preview-num">{i + 1}</span>
                        <span className="st-preview-name">{p.ad}</span>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
            </div>{/* .st-menu-body */}

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

      {/* EKMEK STOK EKLEME MODALI — yatay 2 kolonlu: sol giriş listesi, sağ ikaz/sipariş */}
      {ekmekModalOpen && (
        <div className="st-modal-overlay" onClick={closeEkmekModal}>
          <div className="st-modal st-ekmek-stok-modal" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-head">
              <h3><Wheat size={16} /> Ekmek Stok Ekleme</h3>
              <button className="st-modal-x" onClick={closeEkmekModal}><X size={16} /></button>
            </div>

            <div className="st-ekmek-stok-cols">
              {/* SOL KOLON — sade giriş listesi, ikaz/sipariş içermez */}
              <div className="st-ekmek-stok-col-left">
                {EKMEK_TURLERI_STOK.map((t) => (
                  <div key={t.key} className="st-ekmek-stok-row">
                    <label>{t.label}</label>
                    <div className="st-ekmek-stok-row-inputs">
                      <span className="st-ekmek-stok-mevcut">Stok: <strong>{ekmekStok[t.key] || 0}</strong></span>
                      <input
                        ref={(el) => { ekmekStokInputRefs.current[t.key] = el; }}
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={ekmekGirisleri[t.key]}
                        onChange={(e) => setEkmekGirisleri((prev) => ({ ...prev, [t.key]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && ekmekStokEnterNext(t.key)}
                        placeholder="Adet"
                        className="st-ekmek-stok-input"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* SAĞ KOLON — sadece stok ikazı + sipariş kopyalama, giriş alanı içermez */}
              <div className="st-ekmek-stok-col-right">
                {dusukStoklar.length === 0 ? (
                  <p className="st-ekmek-stok-ok">✅ Tüm ekmek stokları yeterli seviyede</p>
                ) : (
                  <>
                    {dusukStoklar.map((t) => (
                      <div key={t.key} className="st-ekmek-stok-uyari">
                        ⚠️ {t.label} stoğu {t.esik}'nin altına düştü ({ekmekStok[t.key] || 0} adet kaldı).
                      </div>
                    ))}
                    <div className="st-ekmek-siparis-listesi">
                      <span className="st-ekmek-siparis-baslik">Sipariş edilecekler:</span>
                      {EKMEK_SIPARIS_LISTESI.map((s) => (
                        <div key={s.kod} className="st-ekmek-siparis-satir">
                          <span>{s.metin}</span>
                          <button
                            className="st-ekmek-kopyala-btn"
                            onClick={() => kopyalaSiparis(s.metin, s.kod)}
                          >
                            {kopyalananKod === s.kod ? (<><Check size={12} /> Kopyalandı</>) : (<><Copy size={12} /> Kopyala</>)}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="st-modal-footer">
              <button className="st-secondary" onClick={closeEkmekModal}>İptal</button>
              <button className="st-primary" disabled={ekmekKaydediliyor} onClick={handleEkmekKaydet}>
                {ekmekKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {gununMenusuOpen && <GununMenusu data={data} onClose={() => setGununMenusuOpen(false)} />}
    </div>
  );
}