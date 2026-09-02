import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Cariler.css';
import { TL } from '../../hooks/useHipposData';
import {
  Search, Plus, User, Building2, Phone, MapPin, Clock, Wallet,
  Copy, MessageCircle, X, ChevronUp, ChevronDown, FileText, History, Check,
  Banknote, CreditCard, UtensilsCrossed, Landmark, StickyNote, ArrowLeft, Download, Trash2,
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

function FuturaModal({ onClose, futuraBaslangic, futuraBitis, futuraGunSec, onSubmit }) {
  const GUNLER = ['Pts', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
  const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const bugun = new Date();
  const [takvimYil, setTakvimYil] = useState(bugun.getFullYear());
  const [takvimAy, setTakvimAy] = useState(bugun.getMonth());

  function buildCalendar(yil, ay) {
    const ilkGun = new Date(yil, ay, 1);
    const sonGun = new Date(yil, ay + 1, 0);
    const bosluk = (ilkGun.getDay() + 6) % 7;
    const gunler = [];
    for (let i = 0; i < bosluk; i++) gunler.push(null);
    for (let d = 1; d <= sonGun.getDate(); d++) gunler.push(new Date(yil, ay, d));
    return gunler;
  }
  function toStr(d) {
    if (!d) return null;
    const yil = d.getFullYear();
    const ay = String(d.getMonth() + 1).padStart(2, '0');
    const gun = String(d.getDate()).padStart(2, '0');
    return `${yil}-${ay}-${gun}`;
  }
  function gunSinif(d) {
    if (!d) return '';
    const s = toStr(d);
    if (futuraBaslangic && futuraBitis && s >= futuraBaslangic && s <= futuraBitis) return 'futura-range';
    if (s === futuraBaslangic || s === futuraBitis) return 'futura-selected';
    return '';
  }
  const gunler = buildCalendar(takvimYil, takvimAy);
  const sonrakiAy = takvimAy === 11 ? { yil: takvimYil + 1, ay: 0 } : { yil: takvimYil, ay: takvimAy + 1 };
  const sonrakiGunler = buildCalendar(sonrakiAy.yil, sonrakiAy.ay);

  return (
    <div className="cr-modal-overlay" onClick={onClose}>
      <div className="cr-modal cr-futura-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cr-modal-head">
          <h3>Tarih Aralığı Seç</h3>
          <button className="cr-modal-x" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="futura-cal-wrap">
          <div className="futura-cal">
            <div className="futura-cal-head">
              <button onClick={() => { if (takvimAy === 0) { setTakvimYil(y => y-1); setTakvimAy(11); } else setTakvimAy(m => m-1); }}>‹</button>
              <span>{AYLAR[takvimAy]} {takvimYil}</span>
              <span />
            </div>
            <div className="futura-cal-grid">
              {GUNLER.map((g) => <div key={g} className="futura-cal-label">{g}</div>)}
              {gunler.map((d, i) => (
                <button key={i} className={`futura-cal-day ${d ? gunSinif(d) : 'futura-empty'}`}
                  disabled={!d} onClick={() => d && futuraGunSec(toStr(d))}>
                  {d ? d.getDate() : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="futura-cal">
            <div className="futura-cal-head">
              <span />
              <span>{AYLAR[sonrakiAy.ay]} {sonrakiAy.yil}</span>
              <button onClick={() => { if (takvimAy === 11) { setTakvimYil(y => y+1); setTakvimAy(0); } else setTakvimAy(m => m+1); }}>›</button>
            </div>
            <div className="futura-cal-grid">
              {GUNLER.map((g) => <div key={g} className="futura-cal-label">{g}</div>)}
              {sonrakiGunler.map((d, i) => (
                <button key={i} className={`futura-cal-day ${d ? gunSinif(d) : 'futura-empty'}`}
                  disabled={!d} onClick={() => d && futuraGunSec(toStr(d))}>
                  {d ? d.getDate() : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
        {futuraBaslangic && (() => {
          function trFmt(s) { const [y,m,d] = s.split('-'); return `${d}.${m}.${y}`; }
          return (
            <div className="futura-secim-info">
              {trFmt(futuraBaslangic)} {futuraBitis ? `→ ${trFmt(futuraBitis)}` : '→ (bitiş seçin)'}
            </div>
          );
        })()}
        <div className="cr-modal-footer">
          <button className="cr-secondary" onClick={onClose}>Vazgeç</button>
          <button className="cr-primary" disabled={!futuraBaslangic || !futuraBitis} onClick={onSubmit}>Faturalandır</button>
        </div>
      </div>
    </div>
  );
}

export default function Cariler({ data, onNavigate }) {
  const {
    cariler, cariHareketler, cariOdemeler, cariFaturalar, cariGecmis,
    getCariBakiye, getCariSonHareket, getCariSonOdeme,
    addCari, updateCari, deleteCari, addCariOdeme, addCariFatura, futuraTamOde, futuraKismiOde, deleteCariHareketler, getCariFaturalanmamisTutar, archiveCari,
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

  const [showAllCariler, setShowAllCariler] = useState(false);
  const [deleteCariConfirm, setDeleteCariConfirm] = useState(null); // { cari, bakiye }

  function askDeleteCari(cari) {
    const bakiye = getCariBakiye(cari.id);
    setDeleteCariConfirm({ cari, bakiye });
  }
  function confirmDeleteCari() {
    if (!deleteCariConfirm) return;
    deleteCari(deleteCariConfirm.cari.id);
    setSelectedCariId(null);
    setDeleteCariConfirm(null);
    showToast('Cari silindi');
  }
  const visibleCariler = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cariler
      .filter((c) => c.tip === activeTab)
      .filter((c) => showAllCariler || getCariBakiye(c.id) > 0) // "Hepsini Göster" kapalıyken pasif (borcu sıfır) cariler gizlenir
      .filter((c) => !q || c.ad.toLowerCase().includes(q) || (c.telefon || '').includes(q) || (c.not || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const bugunBaslangic = new Date().setHours(0, 0, 0, 0);
        const aHareket = getCariSonHareket(a.id);
        const bHareket = getCariSonHareket(b.id);
        const aYeni = aHareket && aHareket.ts >= bugunBaslangic ? 1 : 0;
        const bYeni = bHareket && bHareket.ts >= bugunBaslangic ? 1 : 0;
        if (bYeni !== aYeni) return bYeni - aYeni;
        return a.ad.localeCompare(b.ad, 'tr');
      });
  }, [cariler, activeTab, searchQuery, cariHareketler, cariOdemeler, showAllCariler]);

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

  async function submitOdeme() {
    const tutar = parseFloat(String(odemeTutar).replace(',', '.')) || 0;
    if (tutar <= 0 || !selectedCari) return;
    const kalan = Math.max(0, getCariBakiye(selectedCari.id) - tutar);
    await addCariOdeme(selectedCari.id, { tutar, tur: odemeTur });
    setLastOdemeKalan(kalan);
    setOdemeModalOpen(false);
    setOdemeShareText(
      [
        `💚 Merhaba ${selectedCari.ad},`,
        '',
        `✅ ${TL(tutar)} tutarındaki tahsilatınız alınmıştır.`,
        `📊 Güncel bakiyeniz: ${TL(kalan)}`,
        '',
        'Teşekkürler, iyi günler! 🙏✨',
      ].join('\n')
    );
    setOdemeShareOpen(true);
    if (kalan === 0) {
      archiveCari(selectedCari.id);
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
    if (!digits || digits === '90') {
      showToast('Bu caride kayıtlı telefon numarası yok');
      return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    const win = window.open(url, '_blank');
    if (!win) {
      // Tarayıcı popup'ı sessizce engellemiş olabilir — hiç sekme açılmaz, hata da
      // fırlatmaz. Bu durumda kullanıcıya açıkça haber veriyoruz.
      showToast('Tarayıcı pencereyi engelledi — adres çubuğundaki popup ikonundan izin ver');
    }
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

  // ---- Futura (tarih aralıklı faturalandırma) ----
  const [futuraOpen, setFuturaOpen] = useState(false);
  const [futuraBaslangic, setFuturaBaslangic] = useState(null); // 'YYYY-MM-DD'
  const [futuraBitis, setFuturaBitis] = useState(null);         // 'YYYY-MM-DD'
  const [futuraTahsilatModal, setFuturaTahsilatModal] = useState(null); // { faturaId, kalan, mod: 'tam'|'kismi', odemeTur }
  const [futuraTahsilatInput, setFuturaTahsilatInput] = useState('');

  function futuraDonemStr(f) {
    if (!f.donemBaslangic || !f.donemBitis) return '';
    function trFmt(s) {
      const [y, m, d] = s.split('-');
      return `${d}.${m}.${y}`;
    }
    return `${trFmt(f.donemBaslangic)} – ${trFmt(f.donemBitis)}`;
  }
  function futuraBekleyenGun(f) {
    const gun = Math.floor((Date.now() - f.eklenmeTs) / 86400000);
    return gun;
  }
  function futuraKalanTutar(f) {
    return Math.max(0, f.tutar - f.tahsilatTutar);
  }

  function futuraGunSec(gunStr) {
    // Takvimde gün seçimi: ilk tık başlangıç, ikinci tık bitiş (başlangıç > bitiş ise sıfırla)
    if (!futuraBaslangic || (futuraBaslangic && futuraBitis)) {
      setFuturaBaslangic(gunStr);
      setFuturaBitis(null);
    } else {
      if (gunStr < futuraBaslangic) {
        setFuturaBaslangic(gunStr);
        setFuturaBitis(null);
      } else {
        setFuturaBitis(gunStr);
      }
    }
  }

  async function submitFutura() {
    if (!selectedCari || !futuraBaslangic || !futuraBitis) return;
    const bas = new Date(futuraBaslangic + 'T00:00:00').getTime();
    const bit = new Date(futuraBitis + 'T23:59:59').getTime();
    const hareketler = cariHareketler.filter((h) => h.cariId === selectedCari.id && h.ts >= bas && h.ts <= bit);
    if (hareketler.length === 0) { showToast('Bu aralıkta hareket yok'); return; }
    const toplamHareket = hareketler.reduce((s, h) => s + h.toplam, 0);
    // Aynı dönemdeki ödemeleri de hesaba kat
    const donemOdemeleri = cariOdemeler.filter((o) => o.cariId === selectedCari.id && o.ts >= bas && o.ts <= bit);
    const toplamOdeme = donemOdemeleri.reduce((s, o) => s + o.tutar, 0);
    const tutar = Math.max(0, toplamHareket - toplamOdeme);
    const tarih = new Date().toISOString().slice(0, 10);
    // Hareketleri sil
    const hareketIds = hareketler.map((h) => h.id);
    await deleteCariHareketler(hareketIds);
    // Dönemdeki ödemeleri de sil (fatura tutarına dahil edildi)
    if (donemOdemeleri.length > 0) {
      const odemeIds = donemOdemeleri.map((o) => o.id);
      setCariOdemeler((prev) => prev.filter((o) => !odemeIds.includes(o.id)));
      await Promise.all(odemeIds.map((oid) =>
        supabase.from('cari_odemeler').delete().eq('id', oid).then(({ error }) => { if (error) console.error(error.message); })
      ));
    }
    // Faturayı oluştur
    addCariFatura(selectedCari.id, { tarih, faturaNo: '', tutar, donemBaslangic: futuraBaslangic, donemBitis: futuraBitis });
    setFuturaOpen(false);
    setFuturaBaslangic(null);
    setFuturaBitis(null);
    showToast('Faturalandırıldı');
  }

  async function submitFuturaTamOde(odemeTur) {
    if (!futuraTahsilatModal || !odemeTur) return;
    await futuraTamOde(futuraTahsilatModal.faturaId, odemeTur);
    setFuturaTahsilatModal(null);
    showToast('Fatura tahsil edildi');
  }

  async function submitFuturaKismiOde(odemeTur) {
    const tutar = parseFloat(String(futuraTahsilatInput).replace(',', '.')) || 0;
    if (!futuraTahsilatModal || tutar <= 0 || !odemeTur) return;
    await futuraKismiOde(futuraTahsilatModal.faturaId, tutar, odemeTur);
    setFuturaTahsilatModal(null);
    setFuturaTahsilatInput('');
    showToast('Kısmi ödeme kaydedildi');
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
    const iskonto = selectedCari.iskonto || 0;
    // h.toplam zaten iskontolu kaydedildiği için tekrar iskonto uygulanmaz
    const bugunToplam = bugunkuHareketler.reduce((s, h) => s + h.toplam, 0);
    // Ham tutar = iskontolu tutardan geri hesaplanır (sadece şablon gösterimi için)
    const bugunToplamHam = iskonto > 0 ? Math.round(bugunToplam / (1 - iskonto / 100)) : bugunToplam;
    const oncekiCari = getCariBakiye(selectedCari.id) - bugunToplam + bugunkuOdemeler.reduce((s, o) => s + o.tutar, 0);

    const urunSatirlari = [];
    bugunkuHareketler.forEach((h) => h.urunler.forEach((u) => urunSatirlari.push(padLine(u.ad, u.fiyat))));

    const simdi = new Date();
    const tarihSaat = `${simdi.toLocaleDateString('tr-TR')} · ${simdi.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    const text = [
      `🌟 ${selectedCari.ad}`,
      `📅 ${tarihSaat}`,
      '',
      '📋 Önceki Cari Bakiye',
      TL(Math.max(0, oncekiCari)),
      '',
      '🛒 Bugünkü Siparişler',
      '━━━━━━━━━━━━━━',
      ...(urunSatirlari.length ? urunSatirlari : ['(bugün sipariş yok)']),
      '━━━━━━━━━━━━━━',
      ...(iskonto > 0 ? [`🏷️ %${iskonto} İskonto: -${TL(Math.round(bugunToplamHam * (iskonto / 100)))}`, ''] : []),
      `💰 Bugünkü Toplam: ${TL(bugunToplam)}`,
      '',
      ...(() => {
        if (selectedCari.tip !== 'firma') {
          return [`\uD83D\uDCCA G\u00FCncel Cari Bakiye: ${TL(getCariBakiye(selectedCari.id))}`];
        }
        const faturaEdilmis = cariFaturalar
          .filter((f) => f.cariId === selectedCari.id)
          .reduce((s, f) => s + (f.tutar - (f.tahsilatTutar || 0)), 0);
        const faturaEdilmemis = cariHareketler
          .filter((h) => h.cariId === selectedCari.id)
          .reduce((s, h) => s + h.toplam, 0)
          - cariOdemeler.filter((o) => o.cariId === selectedCari.id).reduce((s, o) => s + o.tutar, 0);
        const toplam = getCariBakiye(selectedCari.id);
        const satirlar = [];
        if (faturaEdilmis > 0) satirlar.push(`\uD83D\uDCCB Fatura Edilmi\u015f Bakiye: ${TL(faturaEdilmis)}`);
        if (faturaEdilmemis > 0) satirlar.push(`\uD83D\uDCDD Hen\u00FCz Fatura Edilmemi\u015f Bakiye: ${TL(faturaEdilmemis)}`);
        satirlar.push(`\uD83D\uDCCA Toplam G\u00FCncel Bakiye: ${TL(toplam)}`);
        return satirlar;
      })(),
      '',
      'Afiyet olsun, iyi günler! 😇🍽️✨',
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

          <label className="cr-show-all">
            <input type="checkbox" checked={showAllCariler} onChange={(e) => setShowAllCariler(e.target.checked)} />
            Borcu sıfır olanları da göster
          </label>

          <div className="cr-list-wrap">
            <div className="cr-list" ref={listRef}>
              {visibleCariler.length === 0 && <p className="cr-empty">{showAllCariler ? 'Kayıtlı cari yok' : 'Aktif borcu olan cari yok'}</p>}
              {visibleCariler.map((c) => {
                const b = getCariBakiye(c.id);
                const sh = getCariSonHareket(c.id);
                const bekleyen = bekleyenBildirim(c.id);
                const bugunBaslangic = new Date().setHours(0, 0, 0, 0);
                const bugunYeni = sh && sh.ts >= bugunBaslangic;
                const bugunStr = new Date().toISOString().slice(0, 10);
                const ozetGonderildi = c.ozetTarih === bugunStr;
                return (
                  <button key={c.id} className={`cr-item ${selectedCariId === c.id ? 'active' : ''}`} onClick={() => { setSelectedCariId(c.id); setDetailTab('hareketler'); }}>
                    <div className="cr-item-top">
                      <span className="cr-item-name">
                        {c.ad}
                        {bugunYeni && <span className="cr-yeni-badge">BUGÜN</span>}
                        {bugunYeni && (
                          c.telefon
                            ? <span className={`cr-wa-durum ${ozetGonderildi ? 'gonderildi' : 'gonderilmedi'}`} title={ozetGonderildi ? 'Özet gönderildi' : 'Özet gönderilmedi'}>
                                {ozetGonderildi ? '\u2713' : '\u2717'}
                              </span>
                            : <span className="cr-wa-durum gri" title="Telefon numarası yok">—</span>
                        )}
                      </span>
                      <span className="cr-item-balance">{TL(b)}</span>
                    </div>
                    {c.telefon
                      ? <div className="cr-item-phone">{c.telefon}</div>
                      : c.tip === 'bireysel' && <div className="cr-item-phone missing">📵 Numara yok</div>}
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
                    <div className="cr-ozet-btn-wrap">
                      <button className="cr-ozet-btn" onClick={openOzet}><FileText size={14} /> Cari Özeti Oluştur</button>
                      {(() => {
                        const bugunStr = new Date().toISOString().slice(0, 10);
                        const gonderildi = selectedCari.ozetTarih === bugunStr;
                        if (!selectedCari.telefon) return (
                          <span className="cr-wa-etiket gri" title="Telefon yok">—</span>
                        );
                        return (
                          <button
                            className={`cr-wa-etiket ${gonderildi ? 'gonderildi' : 'gonderilmedi'}`}
                            title={gonderildi ? 'Gönderildi — iptal etmek için tıkla' : 'Gönderilmedi — tıkla işaretle'}
                            onClick={() => updateCari(selectedCari.id, { ozetTarih: gonderildi ? null : bugunStr })}
                          >
                            {gonderildi ? '\u2705 Gönderildi' : '\u274C Gönderilmedi'}
                          </button>
                        );
                      })()}
                    </div>
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
                {selectedCari.tip === 'firma' && (
                  <button className={detailTab === 'fatura' ? 'active' : ''} onClick={() => setDetailTab('fatura')}>Fatura</button>
                )}
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
                            {(() => {
                              const isk = selectedCari.iskonto || 0;
                              if (isk <= 0) return <strong>{TL(entry.data.toplam)}</strong>;
                              const ham = Math.round(entry.data.toplam / (1 - isk / 100));
                              const indirim = ham - entry.data.toplam;
                              return (
                                <div className="cr-hareket-iskonto-wrap">
                                  <span className="cr-hareket-iskonto-detay">
                                    {TL(ham)} × %{isk} = -{TL(indirim)}
                                  </span>
                                  <strong>{TL(entry.data.toplam)}</strong>
                                </div>
                              );
                            })()}
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

                {detailTab === 'fatura' && selectedCari.tip === 'firma' && (() => {
                  const futuraFaturalar = cariFaturalar
                    .filter((f) => f.cariId === selectedCari.id)
                    .sort((a, b) => b.eklenmeTs - a.eklenmeTs);
                  return (
                    <div className="cr-futura-wrap">
                      <button className="cr-fatura-btn" onClick={() => { setFuturaBaslangic(null); setFuturaBitis(null); setFuturaOpen(true); }}>
                        + Tarih Aralığı Faturalandır
                      </button>
                      {futuraFaturalar.length === 0 && <p className="cr-empty">Henüz fatura yok</p>}
                      {futuraFaturalar.map((f) => {
                        const kalan = futuraKalanTutar(f);
                        const gun = futuraBekleyenGun(f);
                        return (
                          <div key={f.id} className="cr-futura-card">
                            <div className="cr-futura-donem">{futuraDonemStr(f) || f.tarih}</div>
                            <div className="cr-futura-info">
                              <span className="cr-futura-gun">{gun} gündür ödeme bekliyor</span>
                              <strong className="cr-futura-tutar">{TL(f.tutar)}</strong>
                            </div>
                            {(f.odemeLog || []).map((log, i) => (
                              <div key={i} className="cr-futura-kismi">
                                -{TL(log.tutar)} · {log.tarih} tarihinde ödendi
                              </div>
                            ))}
                            {f.tahsilatTutar > 0 && (
                              <div className="cr-futura-kismi cr-futura-kalan">
                                Kalan: <strong>{TL(kalan)}</strong>
                              </div>
                            )}
                            <div className="cr-futura-butonlar">
                              <button
                                className="cr-tahsilat-btn cr-tahsilat-tam"
                                onClick={() => { setFuturaTahsilatModal({ faturaId: f.id, kalan, mod: 'tam' }); setFuturaTahsilatInput(''); }}
                              >
                                Tahsil Et
                              </button>
                              <button
                                className="cr-tahsilat-btn cr-tahsilat-kismi"
                                onClick={() => { setFuturaTahsilatModal({ faturaId: f.id, kalan, mod: 'kismi' }); setFuturaTahsilatInput(''); }}
                              >
                                Kısmi Ödeme Al
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {detailTab === 'bilgiler' && (
                  <div className="cr-bilgi-form">
                    <label>Cari Adı</label>
                    <input
                      value={selectedCari.ad}
                      onChange={(e) => updateCari(selectedCari.id, { ad: e.target.value })}
                      lang="tr"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                    />
                    <label>Telefon</label>
                    <input value={selectedCari.telefon} onChange={(e) => updateCari(selectedCari.id, { telefon: e.target.value })} />
                    <label>Adres</label>
                    <input value={selectedCari.adres} onChange={(e) => updateCari(selectedCari.id, { adres: e.target.value })} />
                    <label>Açıklama</label>
                    <input value={selectedCari.aciklama} onChange={(e) => updateCari(selectedCari.id, { aciklama: e.target.value })} />
                    <label>Not</label>
                    <input value={selectedCari.not} onChange={(e) => updateCari(selectedCari.id, { not: e.target.value })} />

                    {selectedCari.tip === 'firma' && (
                      <>
                      <label>İskonto (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={selectedCari.iskonto || 0}
                        onChange={(e) => {
                          const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                          updateCari(selectedCari.id, { iskonto: v });
                        }}
                      />
                      </>
                    )}

                    <label>Ön Ödeme (₺)</label>
                    <input
                      type="number"
                      min="0"
                      value={selectedCari.onOdeme || 0}
                      onChange={(e) => {
                        const v = Math.max(0, parseInt(e.target.value) || 0);
                        updateCari(selectedCari.id, { onOdeme: v });
                      }}
                    />

                    <button className="cr-delete-cari-btn" onClick={() => askDeleteCari(selectedCari)}>
                      <Trash2 size={14} /> Cariyi Sil
                    </button>
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

      {futuraOpen && selectedCari && (
        <FuturaModal
          onClose={() => setFuturaOpen(false)}
          futuraBaslangic={futuraBaslangic}
          futuraBitis={futuraBitis}
          futuraGunSec={futuraGunSec}
          onSubmit={submitFutura}
        />
      )}

      {futuraTahsilatModal && (
        <div className="cr-modal-overlay" onClick={() => setFuturaTahsilatModal(null)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3>{futuraTahsilatModal.mod === 'tam' ? 'Tahsil Et' : 'Kısmi Ödeme Al'}</h3>
              <button className="cr-modal-x" onClick={() => setFuturaTahsilatModal(null)}><X size={16} /></button>
            </div>
            <p style={{marginBottom: '12px'}}>Kalan tutar: <strong>{TL(futuraTahsilatModal.kalan)}</strong></p>
            {futuraTahsilatModal.mod === 'kismi' && (
              <input
                className="cr-modal-input"
                type="number"
                placeholder="Ödeme tutarı"
                value={futuraTahsilatInput}
                onChange={(e) => setFuturaTahsilatInput(e.target.value)}
                autoFocus
                style={{marginBottom: '12px'}}
              />
            )}
            <p style={{fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px'}}>Ödeme yöntemi seç:</p>
            <div className="cr-odeme-tur-grid">
              {['NAKİT', 'KREDİ KARTI', 'HAVALE', 'ÇEK'].map((tur) => (
                <button
                  key={tur}
                  className="cr-odeme-tur-btn"
                  onClick={() => futuraTahsilatModal.mod === 'tam' ? submitFuturaTamOde(tur) : submitFuturaKismiOde(tur)}
                >
                  {tur}
                </button>
              ))}
            </div>
            <div className="cr-modal-footer">
              <button className="cr-secondary" onClick={() => setFuturaTahsilatModal(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}

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
            <textarea className="cr-share-textarea mono" rows={20} value={ozetText} onChange={(e) => setOzetText(e.target.value)} />
            <div className="cr-share-actions">
              <button onClick={() => copyText(ozetText)}><Copy size={14} /> Kopyala</button>
              <button className="whatsapp" onClick={() => whatsappShare(ozetText, selectedCari.telefon)}><MessageCircle size={14} /> WhatsApp ile Paylaş</button>
            </div>
            {(() => {
              const bugunStr = new Date().toISOString().slice(0, 10);
              const gonderildi = selectedCari.ozetTarih === bugunStr;
              return (
                <button
                  className={`cr-ozet-gonderildi-btn ${gonderildi ? 'aktif' : ''}`}
                  onClick={() => updateCari(selectedCari.id, { ozetTarih: gonderildi ? null : bugunStr })}
                >
                  {gonderildi ? '\u2705 Gönderildi olarak işaretlendi — iptal et' : '\u274C Gönderildi olarak işaretle'}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* CARİ SİL — ONAY */}
      {deleteCariConfirm && (
        <div className="cr-modal-overlay" onClick={() => setDeleteCariConfirm(null)}>
          <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <h3><Trash2 size={15} /> Cariyi Sil</h3>
              <button className="cr-modal-x" onClick={() => setDeleteCariConfirm(null)}><X size={16} /></button>
            </div>
            {deleteCariConfirm.bakiye > 0 ? (
              <>
                <p className="cr-delete-warning">
                  <strong>{deleteCariConfirm.cari.ad}</strong> adlı carinin ödenmemiş <strong>{TL(deleteCariConfirm.bakiye)}</strong> bakiyesi var.
                  Önce bu bakiyeyi kapatmadan (ödeme alarak) silmeni önermiyoruz — yine de silmek istiyorsan onaylayabilirsin.
                </p>
              </>
            ) : (
              <p className="cr-delete-warning">
                <strong>{deleteCariConfirm.cari.ad}</strong> ve bu cariye ait TÜM hareket/ödeme/fatura geçmişi kalıcı olarak silinecek. Bu işlem geri alınamaz.
              </p>
            )}
            <div className="cr-share-actions">
              <button onClick={() => setDeleteCariConfirm(null)}>Vazgeç</button>
              <button className="danger" onClick={confirmDeleteCari}>Evet, Sil</button>
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