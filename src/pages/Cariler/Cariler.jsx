import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Cariler.css';
import { TL } from '../../hooks/useHipposData';
import {
  Search, Plus, User, Building2, Phone, MapPin, Clock, Wallet,
  Copy, MessageCircle, X, ChevronUp, ChevronDown, FileText, History, Check,
  Banknote, CreditCard, UtensilsCrossed, Landmark, StickyNote, ArrowLeft, Download,
} from 'lucide-react';

function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString('tr-TR')} · ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('tr-TR');
}
function padLine(name, price, width = 28) {
  const priceStr = TL(price);
  const dots = '.'.repeat(Math.max(2, width - name.length - priceStr.length));
  return `${name} ${dots} ${priceStr}`;
}

export default function Cariler({ data, onNavigate }) {
  const {
    cariler, cariHareketler, cariOdemeler, cariFaturalar, cariGecmis,
    getCariBakiye, getCariSonHareket, getCariSonOdeme,
    addCari, updateCari, addCariOdeme, addCariFatura, getCariFaturalanmamisTutar, archiveCari,
    cariTeslimatBildirimleri, onaylaCariTeslimatBildirim, reddetCariTeslimatBildirim,
  } = data;

  function bekleyenBildirim(cariId) {
    return cariTeslimatBildirimleri.find((b) => b.cariId === cariId && b.durum === 'bekliyor') || null;
  }

  const [activeTab, setActiveTab] = useState('bireysel');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCariId, setSelectedCariId] = useState(null);
  const [detailTab, setDetailTab] = useState('hareketler');
  const searchRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key.length === 1 && /[a-zçğıöşüA-ZÇĞİÖŞÜ0-9]/.test(e.key)) {
        searchRef.current?.focus();
        setSearchQuery((q) => q + e.key);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const visibleCariler = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cariler
      .filter((c) => c.tip === activeTab)
      .filter((c) => getCariBakiye(c.id) > 0) // pasif (borcu sıfır) cariler otomatik gizlenir
      .filter((c) => !q || c.ad.toLowerCase().includes(q) || (c.telefon || '').includes(q) || (c.not || '').toLowerCase().includes(q))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [cariler, activeTab, searchQuery, cariHareketler, cariOdemeler]);

  const selectedCari = cariler.find((c) => c.id === selectedCariId) || null;

  // Seçili cari başka sekmeye geçince ya da listeden kaybolunca detay panelini temizle
  useEffect(() => {
    if (selectedCariId && !cariler.some((c) => c.id === selectedCariId)) setSelectedCariId(null);
  }, [cariler, selectedCariId]);

  // ---- Yeni Cari ----
  const [yeniCariModalOpen, setYeniCariModalOpen] = useState(false);
  const [yeniCariForm, setYeniCariForm] = useState({ ad: '', telefon: '', adres: '', not: '' });

  function openYeniCari() {
    setYeniCariForm({ ad: '', telefon: '', adres: '', not: '' });
    setYeniCariModalOpen(true);
  }
  function submitYeniCari() {
    if (!yeniCariForm.ad.trim()) return;
    const id = addCari({ tip: activeTab, ...yeniCariForm });
    setYeniCariModalOpen(false);
    setSelectedCariId(id);
    setDetailTab('bilgiler');
  }

  // ---- Ödeme Al ----
  const [odemeModalOpen, setOdemeModalOpen] = useState(false);
  const [odemeTutar, setOdemeTutar] = useState('');
  const [odemeTur, setOdemeTur] = useState('NAKİT');
  const [odemeShareOpen, setOdemeShareOpen] = useState(false);
  const [odemeShareText, setOdemeShareText] = useState('');
  const [lastOdemeKalan, setLastOdemeKalan] = useState(0);

  function openOdemeModal() {
    setOdemeTutar('');
    setOdemeTur('NAKİT');
    setOdemeModalOpen(true);
  }

  function submitOdeme() {
    const tutar = parseFloat(String(odemeTutar).replace(',', '.')) || 0;
    if (tutar <= 0 || !selectedCari) return;
    addCariOdeme(selectedCari.id, { tutar, tur: odemeTur });
    const kalan = Math.max(0, getCariBakiye(selectedCari.id) - tutar);
    setLastOdemeKalan(kalan);
    setOdemeModalOpen(false);
    setOdemeShareText(
      `Merhaba ${selectedCari.ad}, ${TL(tutar)} tahsilatınız alınmıştır.\nKalan bakiyeniz: ${TL(kalan)}.\nTeşekkürler.`
    );
    setOdemeShareOpen(true);
    if (kalan === 0) {
      setTimeout(() => archiveCari(selectedCari.id), 400);
    }
  }

  // wa.me, numarayı ülke koduyla (90...) ve başında 0 OLMADAN ister — kayıtlı numaralar
  // genelde yerel formatta (0532...) tutulduğu için bu dönüşüm olmadan link geçersiz oluyordu.
  function normalizeTrPhone(phone) {
    let digits = (phone || '').replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!digits.startsWith('90')) digits = '90' + digits;
    return digits;
  }
  function whatsappShare(text, phone) {
    const digits = normalizeTrPhone(phone);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Panoya kopyalandı');
    } catch {
      showToast('Kopyalanamadı');
    }
  }

  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  // ---- Fatura ----
  const [faturaModalOpen, setFaturaModalOpen] = useState(false);
  const [faturaForm, setFaturaForm] = useState({ tarih: '', faturaNo: '' });

  function openFaturaModal() {
    setFaturaForm({ tarih: new Date().toISOString().slice(0, 10), faturaNo: '' });
    setFaturaModalOpen(true);
  }
  function submitFatura() {
    if (!selectedCari || !faturaForm.faturaNo.trim()) return;
    const tutar = getCariFaturalanmamisTutar(selectedCari.id);
    if (tutar <= 0) return;
    addCariFatura(selectedCari.id, { tarih: faturaForm.tarih, faturaNo: faturaForm.faturaNo.trim(), tutar });
    setFaturaModalOpen(false);
    showToast('Faturalandırıldı');
  }

  // ---- Cari Özeti Oluştur (firma) ----
  const [ozetModalOpen, setOzetModalOpen] = useState(false);
  const [ozetText, setOzetText] = useState('');

  // ---- Hareket Dökümü (PDF) ----
  const [dokumModalOpen, setDokumModalOpen] = useState(false);
  const [dokumMode, setDokumMode] = useState('sifirdan'); // 'sifirdan' | 'aralik'
  const [dokumBaslangic, setDokumBaslangic] = useState('');
  const [dokumBitis, setDokumBitis] = useState('');
  const [dokumData, setDokumData] = useState(null);

  function openDokumModal() {
    setDokumMode('sifirdan');
    setDokumBaslangic('');
    setDokumBitis('');
    setDokumModalOpen(true);
  }

  function sonSifirlanmaTs(cariId) {
    const kayitlar = cariGecmis.filter((g) => g.cariId === cariId).sort((a, b) => b.ts - a.ts);
    return kayitlar[0]?.ts || null;
  }

  function generateDokum() {
    if (!selectedCari) return;
    const cariId = selectedCari.id;
    let baslangicTs, bitisTs;
    if (dokumMode === 'sifirdan') {
      baslangicTs = sonSifirlanmaTs(cariId) || 0;
      bitisTs = Date.now();
    } else {
      baslangicTs = dokumBaslangic ? new Date(dokumBaslangic + 'T00:00:00').getTime() : 0;
      bitisTs = dokumBitis ? new Date(dokumBitis + 'T23:59:59').getTime() : Date.now();
    }
    const rows = [
      ...cariHareketler
        .filter((h) => h.cariId === cariId && h.ts >= baslangicTs && h.ts <= bitisTs)
        .map((h) => ({ ts: h.ts, tip: 'siparis', aciklama: 'Sipariş', urunler: h.urunler, tutar: h.toplam })),
      ...cariOdemeler
        .filter((o) => o.cariId === cariId && o.ts >= baslangicTs && o.ts <= bitisTs)
        .map((o) => ({ ts: o.ts, tip: 'odeme', aciklama: `Ödeme Alındı — ${o.tur}`, urunler: null, tutar: -o.tutar })),
    ].sort((a, b) => a.ts - b.ts);
    setDokumData({ cari: selectedCari, rows, baslangicTs, bitisTs });
    setDokumModalOpen(false);
    setTimeout(() => window.print(), 150);
  }

  function openOzet() {
    if (!selectedCari) return;
    const now = Date.now();
    const bugunBaslangic = new Date().setHours(0, 0, 0, 0);
    const bugunkuHareketler = cariHareketler.filter((h) => h.cariId === selectedCari.id && h.ts >= bugunBaslangic);
    const bugunkuOdemeler = cariOdemeler.filter((o) => o.cariId === selectedCari.id && o.ts >= bugunBaslangic);
    const bugunToplam = bugunkuHareketler.reduce((s, h) => s + h.toplam, 0);
    const oncekiCari = getCariBakiye(selectedCari.id) - bugunToplam + bugunkuOdemeler.reduce((s, o) => s + o.tutar, 0);

    const urunSatirlari = [];
    bugunkuHareketler.forEach((h) => h.urunler.forEach((u) => urunSatirlari.push(padLine(u.ad, u.fiyat))));

    const text = [
      selectedCari.ad,
      '',
      'Önceki Cari',
      TL(Math.max(0, oncekiCari)),
      '',
      'Bugünkü Siparişler',
      '',
      ...(urunSatirlari.length ? urunSatirlari : ['(bugün sipariş yok)']),
      '',
      'Bugünkü Toplam',
      TL(bugunToplam),
      '',
      'Yeni Cari',
      TL(getCariBakiye(selectedCari.id)),
    ].join('\n');
    setOzetText(text);
    setOzetModalOpen(true);
  }

  // ---- Scroll yardımcı okları (liste) ----
  const listRef = useRef(null);
  function scrollList(direction) {
    listRef.current?.scrollBy({ top: direction * 220, behavior: 'smooth' });
  }

  // ---- Geçmiş Hareketler (arşiv) ----
  const [gecmisOpen, setGecmisOpen] = useState(false);

  const bakiye = selectedCari ? getCariBakiye(selectedCari.id) : 0;
  const sonHareket = selectedCari ? getCariSonHareket(selectedCari.id) : null;
  const sonOdeme = selectedCari ? getCariSonOdeme(selectedCari.id) : null;
  const hareketlerListe = selectedCari
    ? cariHareketler.filter((h) => h.cariId === selectedCari.id).sort((a, b) => b.ts - a.ts)
    : [];
  const odemelerListe = selectedCari
    ? cariOdemeler.filter((o) => o.cariId === selectedCari.id).sort((a, b) => b.ts - a.ts)
    : [];
  const toplamTahsilat = odemelerListe.reduce((s, o) => s + o.tutar, 0);
  // Hareketler ve Ödeme Hareketleri artık tek, kronolojik bir listede birleşik.
  const birlesikHareketler = selectedCari
    ? [
        ...hareketlerListe.map((h) => ({ tip: 'siparis', ts: h.ts, data: h })),
        ...odemelerListe.map((o) => ({ tip: 'odeme', ts: o.ts, data: o })),
      ].sort((a, b) => b.ts - a.ts)
    : [];
  const faturalanmamis = selectedCari ? getCariFaturalanmamisTutar(selectedCari.id) : 0;
  const faturalarListe = selectedCari ? cariFaturalar.filter((f) => f.cariId === selectedCari.id).sort((a, b) => b.eklenmeTs - a.eklenmeTs) : [];

  return (
    <div className="cr-shell">
      <div className="cr-columns">
        {/* SOL: LİSTE */}
        <div className="cr-left">
          <div className="cr-tabs">
            <button className={activeTab === 'bireysel' ? 'active' : ''} onClick={() => { setActiveTab('bireysel'); setSelectedCariId(null); }}>
              <User size={15} /> Bireysel
            </button>
            <button className={activeTab === 'firma' ? 'active' : ''} onClick={() => { setActiveTab('firma'); setSelectedCariId(null); }}>
              <Building2 size={15} /> Firmalar
            </button>
          </div>

          <div className="cr-search">
            <Search size={15} />
            <input ref={searchRef} type="text" placeholder="Ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          <div className="cr-list-wrap">
            <div className="cr-list" ref={listRef}>
              {visibleCariler.length === 0 && <p className="cr-empty">Aktif borcu olan cari yok</p>}
              {visibleCariler.map((c) => {
                const b = getCariBakiye(c.id);
                const sh = getCariSonHareket(c.id);
                const bekleyen = bekleyenBildirim(c.id);
                return (
                  <button key={c.id} className={`cr-item ${selectedCariId === c.id ? 'active' : ''}`} onClick={() => { setSelectedCariId(c.id); setDetailTab('hareketler'); }}>
                    <div className="cr-item-top">
                      <span className="cr-item-name">{c.ad}</span>
                      <span className="cr-item-balance">{TL(b)}</span>
                    </div>
                    {c.telefon && <div className="cr-item-phone">{c.telefon}</div>}
                    <div className="cr-item-bottom">
                      <span className="cr-item-date">{sh ? fmtDateTime(sh.ts) : '—'}</span>
                      {c.not && <span className="cr-item-note">{c.not}</span>}
                    </div>
                    {bekleyen && (
                      <div className="cr-pending-badge">🟡 Bekleyen ödeme talebi ({TL(bekleyen.tutar)})</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="cr-scroll-btns">
              <button onClick={() => scrollList(-1)}><ChevronUp size={16} /></button>
              <button onClick={() => scrollList(1)}><ChevronDown size={16} /></button>
            </div>
          </div>

          <button className="cr-add-btn" onClick={openYeniCari}>
            <Plus size={16} /> Yeni Cari
          </button>
          <button className="cr-history-link" onClick={() => setGecmisOpen(true)}>
            <History size={13} /> Geçmiş Hareketler
          </button>
        </div>

        {/* SAĞ: DETAY */}
        <div className="cr-right">
          {!selectedCari ? (
            <div className="cr-no-selection">
              <User size={32} />
              <p>Detayları görmek için sol taraftan bir cari seç</p>
            </div>
          ) : (
            <>
              {bekleyenBildirim(selectedCari.id) && (
                <CariBekleyenKart
                  bildirim={bekleyenBildirim(selectedCari.id)}
                  onOnayla={() => onaylaCariTeslimatBildirim(bekleyenBildirim(selectedCari.id).id)}
                  onReddet={(sebep) => reddetCariTeslimatBildirim(bekleyenBildirim(selectedCari.id).id, sebep)}
                />
              )}
              <div className="cr-summary-card">
                <div className="cr-summary-head">
                  <div>
                    <h2>{selectedCari.ad}</h2>
                    <span className="cr-summary-tip">{selectedCari.tip === 'firma' ? 'Firma' : 'Bireysel'}</span>
                  </div>
                  <div className="cr-summary-actions">
                    {selectedCari.tip === 'firma' && (
                      <button className="cr-ozet-btn" onClick={openOzet}><FileText size={14} /> Cari Özeti Oluştur</button>
                    )}
                    <button className="cr-pay-btn" onClick={openOdemeModal}><Wallet size={15} /> Ödeme Al</button>
                  </div>
                </div>
                <div className="cr-summary-grid">
                  <div><Phone size={13} /><span>{selectedCari.telefon || '—'}</span></div>
                  <div><MapPin size={13} /><span>{selectedCari.adres || '—'}</span></div>
                  <div><Clock size={13} /><span>Son Sipariş: {sonHareket ? fmtDateTime(sonHareket.ts) : '—'}</span></div>
                  <div><Wallet size={13} /><span>Son Tahsilat: {sonOdeme ? fmtDateTime(sonOdeme.ts) : '—'}</span></div>
                </div>
                <div className="cr-balance-row">
                  <span>Güncel Cari Bakiye</span>
                  <strong>{TL(bakiye)}</strong>
                </div>
              </div>

              <div className="cr-detail-tabs">
                <button className={detailTab === 'hareketler' ? 'active' : ''} onClick={() => setDetailTab('hareketler')}>Hareketler</button>
                <button className={detailTab === 'bilgiler' ? 'active' : ''} onClick={() => setDetailTab('bilgiler')}>Cari Bilgileri</button>
                <button className="cr-dokum-btn" onClick={openDokumModal}><Download size={13} /> Hareket Dökümü</button>
              </div>

              <div className="cr-detail-body">
                {detailTab === 'hareketler' && (
                  <div className="cr-hareket-list">
                    {birlesikHareketler.length === 0 && <p className="cr-empty">Henüz hareket yok</p>}
                    {odemelerListe.length > 0 && (
                      <div className="cr-odeme-total">
                        <span>Toplam Tahsilat</span>
                        <strong>{TL(toplamTahsilat)}</strong>
                      </div>
                    )}
                    {birlesikHareketler.map((entry) =>
                      entry.tip === 'siparis' ? (
                        <div key={`s-${entry.data.id}`} className="cr-hareket-card">
                          <div className="cr-hareket-head">
                            <span>{fmtDateTime(entry.data.ts)}</span>
                            <strong>{TL(entry.data.toplam)}</strong>
                          </div>
                          <div className="cr-hareket-items">
                            {entry.data.urunler.map((u, i) => (
                              <div key={i} className="cr-hareket-item">
                                <span>{u.ad}</span>
                                <span>{TL(u.fiyat)}</span>
                              </div>
                            ))}
                          </div>
                          {entry.data.mutfakNotu && <div className="cr-hareket-note"><StickyNote size={11} /> {entry.data.mutfakNotu}</div>}
                        </div>
                      ) : (
                        <div key={`o-${entry.data.id}`} className="cr-odeme-row">
                          <span className="cr-odeme-date">{fmtDateTime(entry.data.ts)}</span>
                          <span className="cr-odeme-tur">Ödeme Alındı — {entry.data.tur}</span>
                          <strong className="cr-odeme-tutar">-{TL(entry.data.tutar)}</strong>
                        </div>
                      )
                    )}
                  </div>
                )}

                {detailTab === 'bilgiler' && (
                  <div className="cr-bilgi-form">
                    <label>Telefon</label>
                    <input value={selectedCari.telefon} onChange={(e) => updateCari(selectedCari.id, { telefon: e.target.value })} />
                    <label>Adres</label>
                    <input value={selectedCari.adres} onChange={(e) => updateCari(selectedCari.id, { adres: e.target.value })} />
                    <label>Açıklama</label>
                    <input value={selectedCari.aciklama} onChange={(e) => updateCari(selectedCari.id, { aciklama: e.target.value })} />
                    <label>Not</label>
                    <input value={selectedCari.not} onChange={(e) => updateCari(selectedCari.id, { not: e.target.value })} />

                    {selectedCari.tip === 'firma' && (
                      <div className="cr-fatura-block">
                        <div className="cr-fatura-head">
                          <span>Faturalandırılmadı</span>
                          <strong>{TL(faturalanmamis)}</strong>
                        </div>
                        <button className="cr-fatura-btn" disabled={faturalanmamis <= 0} onClick={openFaturaModal}>
                          Faturalandır
                        </button>
                        {faturalarListe.length > 0 && (
                          <div className="cr-fatura-list">
                            {faturalarListe.map((f) => (
                              <div key={f.id} className="cr-fatura-row">
                                <span>{fmtDate(new Date(f.tarih).getTime())} · No: {f.faturaNo}</span>
                                <strong>{TL(f.tutar)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <div className="cr-toast">{toast}</div>}

      {/* YENİ CARİ */}
      {yeniCariModalOpen && (
        <div className="cr-modal-overlay" onClick={() => setYeniCariModalOpen(false)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3>Yeni Cari ({activeTab === 'firma' ? 'Firma' : 'Bireysel'})</h3>
              <button className="cr-modal-x" onClick={() => setYeniCariModalOpen(false)}><X size={16} /></button>
            </div>
            <input autoFocus className="cr-modal-input" placeholder="Ad Soyad / Firma Adı" value={yeniCariForm.ad} onChange={(e) => setYeniCariForm((f) => ({ ...f, ad: e.target.value }))} />
            <input className="cr-modal-input" placeholder="Telefon" value={yeniCariForm.telefon} onChange={(e) => setYeniCariForm((f) => ({ ...f, telefon: e.target.value }))} />
            <input className="cr-modal-input" placeholder="Adres" value={yeniCariForm.adres} onChange={(e) => setYeniCariForm((f) => ({ ...f, adres: e.target.value }))} />
            <input className="cr-modal-input" placeholder="Not (örn: Recep Abi, Kırmızılı Kadın)" value={yeniCariForm.not} onChange={(e) => setYeniCariForm((f) => ({ ...f, not: e.target.value }))} />
            <div className="cr-modal-footer">
              <button className="cr-secondary" onClick={() => setYeniCariModalOpen(false)}>Vazgeç</button>
              <button className="cr-primary" onClick={submitYeniCari}>Oluştur</button>
            </div>
          </div>
        </div>
      )}

      {/* ÖDEME AL */}
      {odemeModalOpen && selectedCari && (
        <div className="cr-modal-overlay" onClick={() => setOdemeModalOpen(false)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3>Ödeme Al — {selectedCari.ad}</h3>
              <button className="cr-modal-x" onClick={() => setOdemeModalOpen(false)}><X size={16} /></button>
            </div>
            <div className="cr-odeme-summary">
              <div><span>Güncel Cari Bakiyesi</span><strong>{TL(bakiye)}</strong></div>
            </div>
            <label className="cr-field-label">Tahsil Edilen Tutar</label>
            <input
              autoFocus
              className="cr-modal-input"
              inputMode="decimal"
              placeholder="0"
              value={odemeTutar}
              onChange={(e) => setOdemeTutar(e.target.value.replace(/[^0-9,]/g, ''))}
            />
            <label className="cr-field-label">Ödeme Türü</label>
            <div className="cr-odeme-tur-grid">
              {[
                { key: 'NAKİT', Icon: Banknote },
                { key: 'KREDİ KARTI', Icon: CreditCard },
                { key: 'YEMEK KARTI', Icon: UtensilsCrossed },
                { key: 'HAVALE', Icon: Landmark },
              ].map(({ key, Icon }) => (
                <button key={key} className={odemeTur === key ? 'active' : ''} onClick={() => setOdemeTur(key)}>
                  <Icon size={15} /> {key}
                </button>
              ))}
            </div>
            <div className="cr-odeme-summary">
              <div><span>Tahsilattan Sonra Kalan Bakiye</span><strong>{TL(Math.max(0, bakiye - (parseFloat(String(odemeTutar).replace(',', '.')) || 0)))}</strong></div>
            </div>
            <div className="cr-modal-footer">
              <button className="cr-secondary" onClick={() => setOdemeModalOpen(false)}>İptal</button>
              <button className="cr-primary" onClick={submitOdeme}>Tahsil Et</button>
            </div>
          </div>
        </div>
      )}

      {/* ÖDEME SONRASI PAYLAŞIM */}
      {odemeShareOpen && selectedCari && (
        <div className="cr-modal-overlay" onClick={() => setOdemeShareOpen(false)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3><Check size={15} /> Tahsilat Alındı</h3>
              <button className="cr-modal-x" onClick={() => setOdemeShareOpen(false)}><X size={16} /></button>
            </div>
            <textarea className="cr-share-textarea" rows={5} value={odemeShareText} onChange={(e) => setOdemeShareText(e.target.value)} />
            <div className="cr-share-actions">
              <button onClick={() => copyText(odemeShareText)}><Copy size={14} /> Kopyala</button>
              <button className="whatsapp" onClick={() => whatsappShare(odemeShareText, selectedCari.telefon)}><MessageCircle size={14} /> WhatsApp ile Paylaş</button>
            </div>
          </div>
        </div>
      )}

      {/* FATURALANDIR */}
      {faturaModalOpen && selectedCari && (
        <div className="cr-modal-overlay" onClick={() => setFaturaModalOpen(false)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3>Faturalandır — {TL(faturalanmamis)}</h3>
              <button className="cr-modal-x" onClick={() => setFaturaModalOpen(false)}><X size={16} /></button>
            </div>
            <label className="cr-field-label">Fatura Tarihi</label>
            <input type="date" className="cr-modal-input" value={faturaForm.tarih} onChange={(e) => setFaturaForm((f) => ({ ...f, tarih: e.target.value }))} />
            <label className="cr-field-label">Fatura No</label>
            <input className="cr-modal-input" placeholder="Fatura No" value={faturaForm.faturaNo} onChange={(e) => setFaturaForm((f) => ({ ...f, faturaNo: e.target.value }))} />
            <div className="cr-modal-footer">
              <button className="cr-secondary" onClick={() => setFaturaModalOpen(false)}>Vazgeç</button>
              <button className="cr-primary" onClick={submitFatura}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* CARİ ÖZETİ */}
      {ozetModalOpen && selectedCari && (
        <div className="cr-modal-overlay" onClick={() => setOzetModalOpen(false)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3><FileText size={15} /> Cari Özeti</h3>
              <button className="cr-modal-x" onClick={() => setOzetModalOpen(false)}><X size={16} /></button>
            </div>
            <textarea className="cr-share-textarea mono" rows={12} value={ozetText} onChange={(e) => setOzetText(e.target.value)} />
            <div className="cr-share-actions">
              <button onClick={() => copyText(ozetText)}><Copy size={14} /> Kopyala</button>
              <button className="whatsapp" onClick={() => whatsappShare(ozetText, selectedCari.telefon)}><MessageCircle size={14} /> WhatsApp ile Paylaş</button>
            </div>
          </div>
        </div>
      )}

      {/* HAREKET DÖKÜMÜ (PDF için tarih aralığı seçimi) */}
      {dokumModalOpen && selectedCari && (
        <div className="cr-modal-overlay" onClick={() => setDokumModalOpen(false)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3><Download size={15} /> Hareket Dökümü</h3>
              <button className="cr-modal-x" onClick={() => setDokumModalOpen(false)}><X size={16} /></button>
            </div>
            <div className="cr-dokum-mode">
              <label className={dokumMode === 'sifirdan' ? 'active' : ''}>
                <input type="radio" checked={dokumMode === 'sifirdan'} onChange={() => setDokumMode('sifirdan')} />
                Son bakiye sıfırlandığından bugüne
              </label>
              <label className={dokumMode === 'aralik' ? 'active' : ''}>
                <input type="radio" checked={dokumMode === 'aralik'} onChange={() => setDokumMode('aralik')} />
                Tarih aralığı seç
              </label>
            </div>
            {dokumMode === 'aralik' && (
              <div className="cr-dokum-range">
                <div>
                  <span>Başlangıç</span>
                  <input type="date" value={dokumBaslangic} onChange={(e) => setDokumBaslangic(e.target.value)} />
                </div>
                <div>
                  <span>Bitiş</span>
                  <input type="date" value={dokumBitis} onChange={(e) => setDokumBitis(e.target.value)} />
                </div>
              </div>
            )}
            <button className="cr-dokum-generate" onClick={generateDokum}>
              <Download size={14} /> PDF Oluştur (Yazdır ekranından "PDF olarak kaydet" seç)
            </button>
          </div>
        </div>
      )}

      {/* Yazdırma şablonu — sadece @media print'te görünür, normalde gizli */}
      {dokumData && (
        <div id="cr-print-statement">
          <h2>{dokumData.cari.ad}</h2>
          <p className="cr-print-range">
            {fmtDate(dokumData.baslangicTs)} — {fmtDate(dokumData.bitisTs)}
          </p>
          <div className="cr-print-rows">
            {dokumData.rows.length === 0 && <p>Bu aralıkta hareket bulunamadı.</p>}
            {dokumData.rows.map((r, i) => (
              <div key={i} className="cr-print-block">
                <div className="cr-print-block-head">
                  <span>{fmtDate(r.ts)}</span>
                  <span>{r.aciklama}</span>
                  <strong>{r.tutar < 0 ? '-' : ''}{TL(Math.abs(r.tutar))}</strong>
                </div>
                {r.urunler && r.urunler.length > 0 && (
                  <div className="cr-print-items">
                    {r.urunler.map((u, ui) => (
                      <div key={ui} className="cr-print-item-row">
                        <span>{u.ad}</span>
                        <span>{TL(u.fiyat)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="cr-print-total">
            <span>Dönem Bakiyesi</span>
            <strong>{TL(dokumData.rows.reduce((s, r) => s + r.tutar, 0))}</strong>
          </div>
        </div>
      )}

      {/* GEÇMİŞ HAREKETLER (arşiv) */}
      {gecmisOpen && (
        <div className="cr-modal-overlay" onClick={() => setGecmisOpen(false)}>
          <div className="cr-modal cr-gecmis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3><History size={15} /> Geçmiş Hareketler</h3>
              <button className="cr-modal-x" onClick={() => setGecmisOpen(false)}><X size={16} /></button>
            </div>
            <div className="cr-gecmis-list">
              {cariGecmis.length === 0 && <p className="cr-empty">Henüz arşivlenmiş cari yok</p>}
              {[...cariGecmis].sort((a, b) => b.ts - a.ts).map((g) => {
                const c = cariler.find((x) => x.id === g.cariId);
                return (
                  <div key={g.id} className="cr-gecmis-row">
                    <span>{fmtDate(g.ts)}</span>
                    <span>{c ? c.ad : 'Silinmiş cari'}</span>
                    <strong>{TL(g.toplamTutar)}</strong>
                    <span className="cr-gecmis-badge">{g.aciklama}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Paketçiden gelen, henüz onaylanmamış ödeme bildirimi kartı ----
// Onaylamadan önce cari bakiyesine ASLA dokunulmaz — sadece bu bildirim gösterilir.
function CariBekleyenKart({ bildirim, onOnayla, onReddet }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <div className="cr-pending-card">
      <div className="cr-pending-head">
        <span className="cr-pending-title">🟡 Bekleyen Paketçi İşlemi</span>
      </div>
      <div className="cr-pending-grid">
        <div><span>Paketçi</span><strong>{bildirim.paketciAdi}</strong></div>
        <div><span>İşlem</span><strong>{bildirim.tip === 'tam_odeme' ? 'Ödeme bildirimi' : 'Kısmi ödeme bildirimi'}</strong></div>
        <div><span>Talep Edilen Tutar</span><strong>{TL(bildirim.tutar)}</strong></div>
        <div><span>Ödeme Yöntemi</span><strong>{bildirim.odemeYontemi}</strong></div>
        <div><span>Tarih</span><strong>{fmtDateTime(bildirim.ts)}</strong></div>
      </div>
      {bildirim.notMetni && (
        <div className="cr-pending-note"><StickyNote size={12} /> "{bildirim.notMetni}"</div>
      )}
      {bildirim.fotoUrl && (
        <button className="cr-pending-foto-btn" onClick={() => setPhotoOpen(true)}>Fotoğrafı Gör</button>
      )}

      {!rejectOpen ? (
        <div className="cr-pending-actions">
          <button className="cr-pending-reject" onClick={() => setRejectOpen(true)}><X size={14} /> Reddet</button>
          <button className="cr-pending-approve" onClick={onOnayla}><Check size={14} /> Onayla</button>
        </div>
      ) : (
        <div className="cr-pending-reject-form">
          <textarea
            autoFocus
            placeholder='Red sebebi — örn: "Yanlış müşteri seçilmiş"'
            value={rejectText}
            onChange={(e) => setRejectText(e.target.value)}
          />
          <div className="cr-pending-actions">
            <button className="cr-pending-cancel" onClick={() => { setRejectOpen(false); setRejectText(''); }}>Vazgeç</button>
            <button className="cr-pending-reject" disabled={!rejectText.trim()} onClick={() => { onReddet(rejectText.trim()); setRejectOpen(false); }}>
              Reddi Onayla
            </button>
          </div>
        </div>
      )}

      {photoOpen && (
        <div className="cr-photo-modal-overlay" onClick={() => setPhotoOpen(false)}>
          <div className="cr-photo-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cr-photo-modal-x" onClick={() => setPhotoOpen(false)}><X size={18} /></button>
            <img src={bildirim.fotoUrl} alt="Paketçi fotoğrafı" />
          </div>
        </div>
      )}
    </div>
  );
}