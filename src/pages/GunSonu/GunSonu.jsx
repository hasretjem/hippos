import React, { useState, useEffect, useMemo, useRef } from 'react';
import './GunSonu.css';
import { TL } from '../../hooks/useHipposData';
// NOT: html2canvas npm paketi olarak KURULMUYOR — proje github.dev üzerinden yönetildiği
// için terminal/npm install her zaman pratik olmuyor. Bunun yerine ihtiyaç anında CDN'den
// tarayıcıya doğrudan yükleniyor (loadHtml2Canvas fonksiyonu, aşağıda).
import {
  ArrowLeft, Save, Banknote, Calculator, CreditCard, Users, Utensils,
  Plus, Trash2, AlertTriangle, Check, Lock, Delete, Pencil, Share2, MoreVertical,
} from 'lucide-react';

const DENOMS = [5, 10, 20, 50, 100, 200];
const HEDEF_KUPUR = { 5: 20, 10: 40, 20: 30, 50: 10, 100: 4, 200: 0 };
const HEDEF_TOPLAM = Object.entries(HEDEF_KUPUR).reduce((s, [k, v]) => s + Number(k) * v, 0);

const YEMEK_KARTLARI = ['Edenred', 'Pluxee', 'Setcard', 'Multinet', 'Metropol', 'Tokenflex'];

const EKMEK_TURLERI = [
  { key: 'buyukBeyaz', label: 'Büyük Beyaz Ekmeği' },
  { key: 'kucukBeyaz', label: 'Küçük Beyaz Ekmeği' },
  { key: 'domatesli', label: 'Domatesli/Fesleğenli Ekmeği' },
  { key: 'kucukKepek', label: 'Küçük Kepek Ekmeği' },
];

const SABIT_CARILER = ['FG Garanti Sigorta', 'Hukuk Bürosu', 'Murat Bey Marsa No:191', 'Anıl Şahin - Light 212', 'Wow Teknoloji', 'Buhur Mühendislik'];

const KASA_AVANS_PIN = '1234';

function parseNum(v) {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0;
}

export default function GunSonu({ data, onNavigate }) {
  const { salesHistory, cariler, cariHareketler, cariOdemeler } = data;

  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  const bugunTarih = useMemo(() => new Date().toLocaleDateString('tr-TR'), []);

  const todaysSales = useMemo(() => {
    const todayStr = new Date().toDateString();
    return (salesHistory || []).filter((s) => s.ts && new Date(s.ts).toDateString() === todayStr);
  }, [salesHistory]);
  const ciro = useMemo(() => {
    const t = { NAKİT: 0, 'KREDİ KARTI': 0, 'YEMEK KARTI': 0, CARİ: 0 };
    todaysSales.forEach((s) => {
      if (t[s.method] !== undefined) t[s.method] += s.amount;
    });
    return { ...t, total: t['NAKİT'] + t['KREDİ KARTI'] + t['YEMEK KARTI'] + t['CARİ'] };
  }, [todaysSales]);

  const ayCiroKarsilastirma = useMemo(() => {
    const now = new Date();
    const buAyBaslangic = new Date(now.getFullYear(), now.getMonth(), 1);
    const gecenAyBaslangic = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const gecenAyBitis = new Date(now.getFullYear(), now.getMonth(), 0);
    const gunNo = now.getDate();

    let buAy = 0, gecenAy = 0, gecenAyAyniGune = 0;
    (salesHistory || []).forEach((s) => {
      if (!s.ts) return;
      const d = new Date(s.ts);
      if (d >= buAyBaslangic) buAy += s.amount;
      else if (d >= gecenAyBaslangic && d <= gecenAyBitis) {
        gecenAy += s.amount;
        if (d.getDate() <= gunNo) gecenAyAyniGune += s.amount;
      }
    });
    return { buAy, gecenAy, gecenAyAyniGune, farkTamAy: buAy - gecenAy, farkAyniGune: buAy - gecenAyAyniGune };
  }, [salesHistory]);

  const [gecmisKayitlar, setGecmisKayitlar] = useState([]);
  const [ekmekToplam, setEkmekToplam] = useState({ buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      try {
        const [gsRes, ekRes] = await Promise.all([fetch('/api/gunsonu'), fetch('/api/ekmek')]);
        const gsJson = await gsRes.json();
        const ekJson = await ekRes.json();
        setGecmisKayitlar(gsJson.records || []);
        const toplam = { buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 };
        (ekJson.records || []).forEach((r) => {
          toplam.buyukBeyaz += r.buyukBeyaz || 0;
          toplam.kucukBeyaz += r.kucukBeyaz || 0;
          toplam.domatesli += r.domatesli || 0;
          toplam.kucukKepek += r.kucukKepek || 0;
        });
        setEkmekToplam(toplam);
      } catch {
        showToast('Geçmiş veriler yüklenemedi — bağlantıyı kontrol et');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  // Sheets'teki satır sırasına güvenmiyoruz (elle düzenlenmiş/yeniden sıralanmış olabilir) —
  // "Tarih" alanını (GG.AA.YYYY) gerçek tarihe çevirip en son güne göre buluyoruz. Bu sayede
  // Sheet'te bir gün sonu kaydını sonradan elle düzeltirsen, o değişiklik burada da yansır.
  function parseTrTarih(t) {
    const [g, a, y] = (t || '').split('.').map(Number);
    return new Date(y, (a || 1) - 1, g || 1).getTime();
  }
  const dunkuKayit = useMemo(() => {
    const others = gecmisKayitlar.filter((r) => r.tarih !== bugunTarih);
    if (others.length === 0) return null;
    return [...others].sort((a, b) => parseTrTarih(b.tarih) - parseTrTarih(a.tarih))[0];
  }, [gecmisKayitlar, bugunTarih]);

  const [nakitAdet, setNakitAdet] = useState({});
  const sayilanNakitToplami = DENOMS.reduce((s, d) => s + d * (parseInt(nakitAdet[d], 10) || 0), 0);

  const [kasaAvansi, setKasaAvansi] = useState(-2000);
  const toplamNakitPara = sayilanNakitToplami + kasaAvansi;

  const [avansPinOpen, setAvansPinOpen] = useState(false);
  const [avansPinValue, setAvansPinValue] = useState('');
  const [avansPinError, setAvansPinError] = useState(false);
  const [avansDraft, setAvansDraft] = useState('');
  const [avansStep, setAvansStep] = useState('pin');
  function openAvansPin() {
    setAvansPinValue('');
    setAvansPinError(false);
    setAvansDraft(String(Math.abs(kasaAvansi)));
    setAvansStep('pin');
    setAvansPinOpen(true);
  }
  function checkAvansPin(digits) {
    if (digits === KASA_AVANS_PIN) {
      setAvansStep('edit');
    } else {
      setAvansPinError(true);
      setTimeout(() => { setAvansPinValue(''); setAvansPinError(false); }, 550);
    }
  }
  function pressAvansPinDigit(d) {
    setAvansPinValue((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) setTimeout(() => checkAvansPin(next), 100);
      return next;
    });
  }
  function saveAvansDraft() {
    setKasaAvansi(-Math.abs(parseNum(avansDraft)));
    setAvansPinOpen(false);
  }

  const [posTutarlari, setPosTutarlari] = useState([{ label: 'POS 1', tutar: '' }, { label: 'POS 2', tutar: '' }]);
  const posToplam = posTutarlari.reduce((s, r) => s + parseNum(r.tutar), 0);
  function addPosRow() { setPosTutarlari((prev) => [...prev, { label: `POS ${prev.length + 1}`, tutar: '' }]); }
  function updatePosRow(idx, field, value) { setPosTutarlari((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))); }
  function removePosRow(idx) { setPosTutarlari((prev) => prev.filter((_, i) => i !== idx)); }

  const harcamaTaslagi = data.harcamaTaslagi || { anaKasa: [], gunlukKasa: [] };
  const [anaKasaHarcamalar, setAnaKasaHarcamalar] = useState(() =>
    harcamaTaslagi.anaKasa.length ? harcamaTaslagi.anaKasa : [{ ad: '', tutar: '' }, { ad: '', tutar: '' }, { ad: '', tutar: '' }]
  );
  const anaKasaToplam = anaKasaHarcamalar.reduce((s, r) => s + parseNum(r.tutar), 0);
  const [gunlukKasaHarcamalar, setGunlukKasaHarcamalar] = useState(() =>
    harcamaTaslagi.gunlukKasa.length ? harcamaTaslagi.gunlukKasa : [{ ad: '', tutar: '' }, { ad: '', tutar: '' }, { ad: '', tutar: '' }]
  );
  const gunlukKasaToplam = gunlukKasaHarcamalar.reduce((s, r) => s + parseNum(r.tutar), 0);
  const harcamaSeedRef = useRef(false);
  useEffect(() => {
    if (harcamaSeedRef.current) return;
    if (!harcamaTaslagi.anaKasa.length && !harcamaTaslagi.gunlukKasa.length) return;
    const anaBos = anaKasaHarcamalar.every((r) => !r.ad.trim() && !r.tutar);
    const gunlukBos = gunlukKasaHarcamalar.every((r) => !r.ad.trim() && !r.tutar);
    if (!anaBos || !gunlukBos) { harcamaSeedRef.current = true; return; }
    harcamaSeedRef.current = true;
    if (harcamaTaslagi.anaKasa.length) setAnaKasaHarcamalar(harcamaTaslagi.anaKasa);
    if (harcamaTaslagi.gunlukKasa.length) setGunlukKasaHarcamalar(harcamaTaslagi.gunlukKasa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harcamaTaslagi]);
  function addRow(setter) { setter((prev) => [...prev, { ad: '', tutar: '' }]); }
  function updateRow(setter, idx, field, value) { setter((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))); }
  function removeRow(setter, idx) { setter((prev) => prev.filter((_, i) => i !== idx)); }

  const [yemekKolonlari, setYemekKolonlari] = useState(['Şirket Telefonu', 'Paket']);
  const [yemekTutarlari, setYemekTutarlari] = useState({});
  function addYemekKolon() { setYemekKolonlari((prev) => [...prev, `Ek ${prev.length - 1}`]); }
  function removeYemekKolon(idx) {
    if (idx < 2) return; // ilk iki kolon (Şirket Telefonu/Paket) sabit, silinemez
    const kolonAdi = yemekKolonlari[idx];
    setYemekKolonlari((prev) => prev.filter((_, i) => i !== idx));
    setYemekTutarlari((prev) => {
      const next = {};
      Object.entries(prev).forEach(([marka, row]) => {
        const { [kolonAdi]: _drop, ...rest } = row;
        next[marka] = rest;
      });
      return next;
    });
  }
  function updateYemekTutar(marka, kolon, value) {
    setYemekTutarlari((prev) => ({ ...prev, [marka]: { ...(prev[marka] || {}), [kolon]: value } }));
  }
  function yemekMarkaToplam(marka) {
    const row = yemekTutarlari[marka] || {};
    return yemekKolonlari.reduce((s, k) => s + parseNum(row[k]), 0);
  }
  const genelYemekToplami = YEMEK_KARTLARI.reduce((s, m) => s + yemekMarkaToplam(m), 0);

  const bugunFirmaTutarlari = useMemo(() => {
    const gunBaslangic = new Date(); gunBaslangic.setHours(0, 0, 0, 0);
    const ts0 = gunBaslangic.getTime();
    const map = {};
    (cariler || []).filter((c) => c.tip === 'firma').forEach((c) => {
      const tutar = (cariHareketler || []).filter((h) => h.cariId === c.id && h.ts >= ts0).reduce((s, h) => s + h.toplam, 0);
      map[c.ad] = (map[c.ad] || 0) + tutar;
    });
    return map;
  }, [cariler, cariHareketler]);

  const otomatikCariListesi = useMemo(() => {
    // Firma carileri: sabit liste + bugün cari hareketi olan ve bakiyesi > 0 olanlar
    const digerCariler = Object.keys(bugunFirmaTutarlari).filter(
      (ad) => !SABIT_CARILER.includes(ad) && bugunFirmaTutarlari[ad] > 0
    );
    return [...SABIT_CARILER, ...digerCariler];
  }, [bugunFirmaTutarlari]);

  // Bireysel cariler: bugün cari hareketi olan ve bakiyesi > 0 olan tip=bireysel cariler
  const bugunBireyselCariler = useMemo(() => {
    const gunBaslangic = new Date(); gunBaslangic.setHours(0, 0, 0, 0);
    const ts0 = gunBaslangic.getTime();
    return (cariler || [])
      .filter((c) => c.tip === 'bireysel')
      .map((c) => {
        const bugunTutar = (cariHareketler || [])
          .filter((h) => h.cariId === c.id && h.ts >= ts0)
          .reduce((s, h) => s + h.toplam, 0);
        return { ...c, bugunTutar };
      })
      .filter((c) => c.bugunTutar > 0);
  }, [cariler, cariHareketler]);
  const bireyselCariToplam = bugunBireyselCariler.reduce((s, c) => s + c.bugunTutar, 0);

  // Bugün tahsil edilen cari ödemeleri (havale hariç) — bilgi amaçlı, cirodan düşülmez
  const bugunCariOdemeOzeti = useMemo(() => {
    const gunBaslangic = new Date(); gunBaslangic.setHours(0, 0, 0, 0);
    const ts0 = gunBaslangic.getTime();
    const ozet = {};
    (cariOdemeler || [])
      .filter((o) => o.ts >= ts0 && o.tur !== 'HAVALE')
      .forEach((o) => { ozet[o.tur] = (ozet[o.tur] || 0) + o.tutar; });
    return ozet;
  }, [cariOdemeler]);
  const bugunCariOdemeToplamı = Object.values(bugunCariOdemeOzeti).reduce((s, v) => s + v, 0);

  const [cariOverrides, setCariOverrides] = useState({});
  const [cariEditingFor, setCariEditingFor] = useState(null);
  const [cariEditDraft, setCariEditDraft] = useState('');
  const [ekstraCariler, setEkstraCariler] = useState([]);

  function cariGosterilenTutar(ad) {
    return cariOverrides[ad] !== undefined ? cariOverrides[ad] : (bugunFirmaTutarlari[ad] || 0);
  }
  function startCariEdit(ad) { setCariEditingFor(ad); setCariEditDraft(String(cariGosterilenTutar(ad))); }
  function saveCariEdit() { setCariOverrides((prev) => ({ ...prev, [cariEditingFor]: parseNum(cariEditDraft) })); setCariEditingFor(null); }
  function addEkstraCari() { setEkstraCariler((prev) => [...prev, { ad: '', tutar: '' }]); }
  function updateEkstraCari(idx, field, value) { setEkstraCariler((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))); }
  function removeEkstraCari(idx) { setEkstraCariler((prev) => prev.filter((_, i) => i !== idx)); }
  const cariToplam = otomatikCariListesi.reduce((s, ad) => s + cariGosterilenTutar(ad), 0) + ekstraCariler.reduce((s, r) => s + parseNum(r.tutar), 0) + bireyselCariToplam;

  // Cari tahsilatlar (havale hariç) cirodan DÜŞÜLÜR — müşteri cari borcunu ödediğinde
  // bu ayrı bir gelir değil, daha önce cari olarak atılmış satışın tahsilat dönüşümüdür.
  // Bu tutar zaten cariToplam içinde sayılıyor olurdu, çift sayımı önlemek için düşülür.
  const bugunCariTahsilatDusulen = bugunCariOdemeToplamı;

  // TOPLAM CİRO: Nakit + POS + Yemek Kartı + Cari (bugün atılan)
  // − Günlük Kasa Harcamaları (o günün giderleri)
  // − Cari Tahsilatlar (havale hariç) = o günün NET geliri
  const toplamCiro = toplamNakitPara + cariToplam + posToplam + genelYemekToplami - gunlukKasaToplam - bugunCariTahsilatDusulen;
  // gelir (yoksa 0). Düzeltmek gerekirse Sheets'ten yapılmalı, buradan değil.
  // Yeni Sheet yapısında bu değer anaKasaTakibi.yarinaDevir altında geliyor — api/gunsonu.js
  // eski (3 sütunlu) kayıtları da aynı şekle çevirip döndürdüğü için burada tek bir okuma
  // yeterli, format farkını düşünmeye gerek yok.
  const dundenDevirAnaKasa = dunkuKayit ? (dunkuKayit.anaKasaTakibi?.yarinaDevir ?? dunkuKayit.yarinaDevirAnaKasa ?? dunkuKayit.yarinaDevir ?? 0) : 0;
  // "Bugünkü Nakit" satırı SAF (hiçbir şey çıkarılmamış) toplamNakitPara'yı gösterir —
  // Ana Kasa harcaması AYRI bir satırda gösterilip SADECE Yarına Devir hesabında düşülür.
  // Böylece ekranda hangi rakamın nereden geldiği (sayılan nakit, ana kasa harcaması,
  // sonuç) karışmadan ayrı ayrı görülebiliyor.
  const yarinaDevirAnaKasa = dundenDevirAnaKasa + toplamNakitPara - anaKasaToplam;

  // Enter'a basınca fareyle sıradaki alana tıklamayı beklemeden, DOM sırasındaki bir sonraki
  // "gs-tabbable" alanına odaklanır — sayfadaki neredeyse her giriş kutusunda kullanılıyor.
  function handleTabEnter(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const all = Array.from(document.querySelectorAll('.gs-tabbable'));
    const idx = all.indexOf(e.target);
    if (idx !== -1 && idx < all.length - 1) all[idx + 1].focus();
  }

  const [saving, setSaving] = useState(false);
  const contentRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  // html2canvas'ı sadece "Paylaş"a ilk basıldığında, tarayıcıya CDN'den yükler — sayfa hep
  // yavaşlamasın diye ihtiyaç anına kadar hiç indirilmiyor, bir kere yüklenince tekrar
  // indirmiyor (window.html2canvas zaten varsa direkt onu kullanır).
  function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const existing = document.getElementById('html2canvas-cdn-script');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.html2canvas));
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.id = 'html2canvas-cdn-script';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function paylasFoto() {
    if (!contentRef.current) return;
    setSharing(true);
    try {
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(contentRef.current, { scale: 2, backgroundColor: '#F1FBF6', useCORS: true });
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('Fotoğraf kopyalandı — WhatsApp\'a yapıştırabilirsin');
        } catch {
          showToast('Kopyalanamadı — tarayıcı izin vermiyor olabilir');
        }
        setSharing(false);
      }, 'image/png');
    } catch {
      showToast('Fotoğraf oluşturulamadı — bağlantıyı kontrol et');
      setSharing(false);
    }
  }

  async function kaydet() {
    setSaving(true);
    try {
      // ARTIK sayfada girilen HER ŞEY ayrı ayrı gönderiliyor — api/gunsonu.js bunları
      // Sheet'te ayrı sütunlara yazıyor (listeler kendi hücrelerinde JSON, toplamlar düz
      // sayı). Önceki sürümde sadece özet toplamlar gidiyordu; nakit kupür kırılımı, POS
      // satırları, harcama satırları, cari override/ekstra detayları ve yemek kartı kolon
      // bazlı dökümü hiç kaydedilmiyordu.
      const payload = {
        tarih: bugunTarih,

        toplamNakitPara,
        nakitKupurDetayi: nakitAdet, // { "5": "3", "10": "2", ... } — girilmemişler zaten yok
        kasaAvansi,

        posToplam,
        posTutarlari, // [{ label, tutar }]

        anaKasaToplam,
        anaKasaHarcamalar, // [{ ad, tutar }]

        gunlukKasaToplam,
        gunlukKasaHarcamalar, // [{ ad, tutar }]

        cariToplam,
        cariDetay: {
          sabitler: otomatikCariListesi.reduce((acc, ad) => {
            acc[ad] = cariGosterilenTutar(ad);
            return acc;
          }, {}),
          ekstra: ekstraCariler, // [{ ad, tutar }]
          bireysel: bugunBireyselCariler.map((c) => ({ ad: c.ad, tutar: c.bugunTutar })),
          bugunCariOdemeOzeti, // havale hariç tahsil edilen ödemeler, bilgi amaçlı
        },

        genelYemekToplami,
        yemekDetay: {
          kolonlar: yemekKolonlari,
          tutarlar: yemekTutarlari, // { marka: { kolon: tutar } }
        },

        // Sheets'e artık Hippos'un Supabase'den hesapladığı ciro DEĞİL, kasiyerin bu ekranda
        // elle girdiği tutarlar yazılıyor (kullanıcı kararı, 9 Eylül) — Ciro Karşılaştırma
        // paneli hâlâ ekranda canlı gösteriliyor ama sadece anlık kontrol amaçlı, kayda
        // girmiyor. Kasiyer bir alanı boş bırakırsa Sheets'te de 0 olarak kalır.
        ciro: {
          nakit: toplamNakitPara,
          kart: posToplam,
          yemek: genelYemekToplami,
          cari: cariToplam,
          cariTahsilat: -bugunCariTahsilatDusulen,
          toplam: toplamCiro,
        },

        anaKasaTakibi: {
          dundenDevir: dundenDevirAnaKasa,
          bugunkuNakit: toplamNakitPara,
          anaKasaHarcama: anaKasaToplam,
          yarinaDevir: yarinaDevirAnaKasa,
        },
      };
      const res = await fetch('/api/gunsonu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      showToast('Gün sonu kaydedildi');
      if (data.clearHarcamaTaslagi) data.clearHarcamaTaslagi();
      const gsRes = await fetch('/api/gunsonu');
      const gsJson = await gsRes.json();
      setGecmisKayitlar(gsJson.records || []);
    } catch {
      showToast('Kaydedilemedi — bağlantıyı kontrol et');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gs-shell">
      <button className="gs-float-back" onClick={() => onNavigate('settings')}><ArrowLeft size={16} /></button>

      <div className="gs-float-menu-wrap">
        <button className="gs-float-menu-btn" onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={18} /></button>
        {menuOpen && (
          <>
            <div className="gs-float-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="gs-float-menu-dropdown">
              <div className="gs-float-menu-tarih">{bugunTarih}</div>
              <button className="gs-share-btn" onClick={() => { paylasFoto(); setMenuOpen(false); }} disabled={sharing}>
                <Share2 size={15} /> {sharing ? 'Hazırlanıyor...' : 'Paylaş'}
              </button>
              <button className="gs-save-btn" onClick={() => { kaydet(); setMenuOpen(false); }} disabled={saving}>
                <Save size={16} /> {saving ? 'Kaydediliyor...' : 'Gün Sonu Kaydet'}
              </button>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <p className="gs-loading">Yükleniyor...</p>
      ) : (
        <div className="gs-content-3col" ref={contentRef}>

          <div className="gs-col">
            <section className="gs-card">
              <h2><Banknote size={16} /> Toplam Nakit Para</h2>
              <div className="gs-nakit-table">
                <div className="gs-nakit-head"><span>Kupür</span><span>Adet</span><span>Tutar</span></div>
                {DENOMS.map((d) => (
                  <div key={d} className="gs-nakit-row">
                    <span className="gs-nakit-denom">{d} ₺</span>
                    <input type="number" min={0} className="gs-tabbable" value={nakitAdet[d] || ''} onChange={(e) => setNakitAdet((prev) => ({ ...prev, [d]: e.target.value }))} onKeyDown={handleTabEnter} />
                    <span className="gs-nakit-tutar">{TL(d * (parseInt(nakitAdet[d], 10) || 0))}</span>
                  </div>
                ))}
              </div>
              <div className="gs-row-total"><span>Sayılan Nakit Toplamı</span><strong>{TL(sayilanNakitToplami)}</strong></div>

              <div className="gs-avans-row">
                <div className="gs-avans-info">
                  <span>Sabah Kasaya Konan Bozukluk</span>
                  <strong className="neg">{TL(kasaAvansi)}</strong>
                </div>
                <button className="gs-avans-edit-btn" onClick={openAvansPin}><Lock size={12} /> Değiştir</button>
              </div>
              <div className="gs-row-total main"><span>TOPLAM NAKİT PARA</span><strong>{TL(toplamNakitPara)}</strong></div>
            </section>

            <section className="gs-card">
              <h2><Users size={16} /> Cari Müşteriler <span className="gs-auto-tag">otomatik</span></h2>
              <div className="gs-cari-list">
                {otomatikCariListesi.map((ad) => (
                  <div key={ad} className="gs-cari-row">
                    {cariEditingFor === ad ? (
                      <>
                        <span className="ad">{ad}</span>
                        <input type="number" autoFocus value={cariEditDraft} onChange={(e) => setCariEditDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCariEdit()} />
                        <button className="gs-cari-save" onClick={saveCariEdit}><Check size={12} /></button>
                      </>
                    ) : (
                      <>
                        <span className="ad">{ad}</span>
                        <strong>{TL(cariGosterilenTutar(ad))}</strong>
                        <button className="gs-cari-edit" onClick={() => startCariEdit(ad)}><Pencil size={11} /></button>
                      </>
                    )}
                  </div>
                ))}
                {ekstraCariler.map((row, idx) => (
                  <div key={idx} className="gs-cari-row extra">
                    <input className="ad-input gs-tabbable" placeholder="Cari adı" value={row.ad} onChange={(e) => updateEkstraCari(idx, 'ad', e.target.value)} onKeyDown={handleTabEnter} />
                    <input type="number" placeholder="0" className="gs-tabbable" value={row.tutar} onChange={(e) => updateEkstraCari(idx, 'tutar', e.target.value)} onKeyDown={handleTabEnter} />
                    <button className="gs-row-del" onClick={() => removeEkstraCari(idx)}><Trash2 size={12} /></button>
                  </div>
                ))}
                <button className="gs-add-row-btn" onClick={addEkstraCari}><Plus size={13} /> Cari Ekle</button>
              </div>
              <div className="gs-row-total main"><span>FİRMA CARİ TOPLAMI</span><strong>{TL(otomatikCariListesi.reduce((s, ad) => s + cariGosterilenTutar(ad), 0) + ekstraCariler.reduce((s, r) => s + parseNum(r.tutar), 0))}</strong></div>

              {/* Bireysel Cariler */}
              {bugunBireyselCariler.length > 0 && (
                <>
                  <span className="gs-subhead" style={{marginTop:12}}>Bireysel Cariler</span>
                  <div className="gs-cari-list">
                    {bugunBireyselCariler.map((c) => (
                      <div key={c.id} className="gs-cari-row">
                        <span className="ad">{c.ad}</span>
                        <strong>{TL(c.bugunTutar)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="gs-row-total"><span>BİREYSEL CARİ TOPLAMI</span><strong>{TL(bireyselCariToplam)}</strong></div>
                </>
              )}

              <div className="gs-row-total main" style={{marginTop:8}}><span>TOPLAM CARİ TUTARI</span><strong>{TL(cariToplam)}</strong></div>

              {/* Ödenen Cari Tutarları — havale hariç, cirodan DÜŞÜLÜR */}
              {bugunCariOdemeToplamı > 0 && (
                <div className="gs-cari-odeme-panel">
                  <span className="gs-subhead">Ödenen Cari Tutarları</span>
                  <p className="gs-hint" style={{margin:'2px 0 6px',fontSize:11}}>Havale hariç tahsilatlar toplam cirodan düşülür</p>
                  {Object.entries(bugunCariOdemeOzeti).map(([tur, tutar]) => (
                    <div key={tur} className="gs-cari-row">
                      <span className="ad">{tur}</span>
                      <strong>{TL(tutar)}</strong>
                    </div>
                  ))}
                  <div className="gs-row-total"><span>TOPLAM TAHSİLAT</span><strong className="neg">−{TL(bugunCariOdemeToplamı)}</strong></div>
                </div>
              )}
            </section>
          </div>

          <div className="gs-col">
            <section className="gs-card">
              <h2><CreditCard size={16} /> Kart Tutarları</h2>
              <div className="gs-dynrow-list">
                {posTutarlari.map((row, idx) => (
                  <div key={idx} className="gs-dynrow">
                    <input className="gs-dynrow-label gs-tabbable" value={row.label} onChange={(e) => updatePosRow(idx, 'label', e.target.value)} onKeyDown={handleTabEnter} />
                    <input type="number" placeholder="0" className="gs-tabbable" value={row.tutar} onChange={(e) => updatePosRow(idx, 'tutar', e.target.value)} onKeyDown={handleTabEnter} />
                    {posTutarlari.length > 1 && <button className="gs-row-del" onClick={() => removePosRow(idx)}><Trash2 size={12} /></button>}
                  </div>
                ))}
                <button className="gs-add-row-btn" onClick={addPosRow}><Plus size={13} /> Satır Ekle</button>
              </div>
              <div className="gs-row-total main"><span>POS TOPLAMI</span><strong>{TL(posToplam)}</strong></div>
            </section>

            <section className="gs-card">
              <h2><Utensils size={16} /> Yemek Kartları</h2>
              <div className="gs-yemek-table">
                <div className="gs-yemek-head" style={{ gridTemplateColumns: `88px repeat(${yemekKolonlari.length}, 1fr) 76px` }}>
                  <span></span>
                  {yemekKolonlari.map((k, i) => (
                    <span key={k} className="gs-yemek-head-col">
                      {k}
                      {i >= 2 && <button className="gs-yemek-kolon-sil" onClick={() => removeYemekKolon(i)}><Trash2 size={10} /></button>}
                    </span>
                  ))}
                  <span>Toplam</span>
                </div>
                {YEMEK_KARTLARI.map((marka) => (
                  <div key={marka} className="gs-yemek-row" style={{ gridTemplateColumns: `88px repeat(${yemekKolonlari.length}, 1fr) 76px` }}>
                    <span className="marka">{marka}</span>
                    {yemekKolonlari.map((k) => (
                      <input key={k} type="number" placeholder="0" className="gs-tabbable" value={(yemekTutarlari[marka] || {})[k] || ''} onChange={(e) => updateYemekTutar(marka, k, e.target.value)} onKeyDown={handleTabEnter} />
                    ))}
                    <strong className="gs-yemek-toplam">{TL(yemekMarkaToplam(marka))}</strong>
                  </div>
                ))}
              </div>
              <button className="gs-add-row-btn" onClick={addYemekKolon}><Plus size={13} /> Kolon Ekle</button>
              <div className="gs-row-total main"><span>GENEL YEMEK KARTLARI TOPLAMI</span><strong>{TL(genelYemekToplami)}</strong></div>
            </section>
          </div>

          <div className="gs-col">
            <section className="gs-card">
              <h2><Calculator size={16} /> Harcamalar</h2>

              <span className="gs-subhead">Ana Kasadan Harcamalar <span className="gs-hint">(günlük ciroyu etkilemez)</span></span>
              <MiniHarcamaFormu baslik="" showToast={showToast} />
              <div className="gs-row-total main"><span>ANA KASA TOPLAMI</span><strong>{TL(anaKasaToplam)}</strong></div>

              <span className="gs-subhead" style={{ marginTop: 14 }}>Günlük Kasadan Harcamalar</span>
              <MiniHarcamaFormu baslik="" showToast={showToast} />
              <div className="gs-row-total main"><span>GÜNLÜK KASA TOPLAMI</span><strong>{TL(gunlukKasaToplam)}</strong></div>
            </section>

            <section className="gs-card">
              <h2><Banknote size={16} /> Yarına Bozukluk Hedefi</h2>
              <div className="gs-hedef-table">
                <div className="gs-hedef-head"><span>Kupür</span><span>Gereken</span><span>Girilen</span><span>Eksik</span></div>
                {Object.entries(HEDEF_KUPUR).filter(([, adet]) => adet > 0).map(([d, hedefAdet]) => {
                  const girilen = parseInt(nakitAdet[d], 10) || 0;
                  const fark = hedefAdet - girilen;
                  let label, cls;
                  if (fark > 0) { label = fark; cls = 'warn'; }
                  else if (fark < 0) { label = `+${-fark}`; cls = 'fazla'; }
                  else { label = '✓'; cls = 'ok'; }
                  return (
                    <div key={d} className="gs-hedef-row">
                      <span>{d} ₺</span>
                      <span>{hedefAdet}</span>
                      <span>{girilen}</span>
                      <strong className={cls}>{label}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="gs-row-total"><span>Hedef Toplam</span><strong>{TL(HEDEF_TOPLAM)}</strong></div>
            </section>
          </div>

          {/* SAĞ SÜTUN — Bilgi. En dikkat çekici sütun: büyük tarih/gün başlığı + Hippos'un
              hesapladığı ciro ile burada girdiklerimiz arasındaki farkı canlı gösteriyor. */}
          <div className="gs-col">
            <section className="gs-card gs-bilgi-card">
              <div className="gs-bilgi-tarih">
                <span className="gun">{new Date().toLocaleDateString('tr-TR', { weekday: 'long' })}</span>
                <span className="tarih">{new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                <div className="gs-bilgi-toplam-ciro"><span>TOPLAM CİRO</span><strong>{TL(toplamCiro)}</strong></div>
              </div>

              <span className="gs-subhead big">Ciro Karşılaştırma</span>
              <div className="gs-canli-karsilastirma">
                {[
                  { label: 'Nakit', hippos: ciro['NAKİT'], gs: toplamNakitPara },
                  { label: 'Kredi Kartı', hippos: ciro['KREDİ KARTI'], gs: posToplam },
                  { label: 'Yemek Kartı', hippos: ciro['YEMEK KARTI'], gs: genelYemekToplami },
                  { label: 'Cari', hippos: ciro['CARİ'], gs: cariToplam },
                ].map((r) => {
                  const fark = r.gs - r.hippos;
                  return (
                    <div key={r.label} className="gs-karsilastirma-row">
                      <span className="ad">{r.label}</span>
                      <span className="hp">H: {TL(r.hippos)}</span>
                      <span className="gsv">G: {TL(r.gs)}</span>
                      <strong className={Math.abs(fark) > 0.5 ? 'warn' : 'ok'}>{TL(fark)}</strong>
                    </div>
                  );
                })}
                <div className="gs-karsilastirma-toplam">
                  <span>Toplam Fark</span>
                  <strong className={Math.abs((toplamNakitPara - ciro['NAKİT']) + (posToplam - ciro['KREDİ KARTI']) + (genelYemekToplami - ciro['YEMEK KARTI']) + (cariToplam - ciro['CARİ'])) > 0.5 ? 'warn' : 'ok'}>
                    {TL((toplamNakitPara - ciro['NAKİT']) + (posToplam - ciro['KREDİ KARTI']) + (genelYemekToplami - ciro['YEMEK KARTI']) + (cariToplam - ciro['CARİ']))}
                  </strong>
                </div>
              </div>

              <span className="gs-subhead big" style={{ marginTop: 14 }}>Bugünkü Ekmek Çıkışı</span>
              <div className="gs-ekmek-mini">
                {EKMEK_TURLERI.map((t) => (
                  <div key={t.key}><span>{t.label}</span><strong>{ekmekToplam[t.key]}</strong></div>
                ))}
                <div className="total"><span>Toplam</span><strong>{EKMEK_TURLERI.reduce((s, t) => s + (ekmekToplam[t.key] || 0), 0)} adet</strong></div>
              </div>

              <span className="gs-subhead big" style={{ marginTop: 14 }}>Aylık Ciro Karşılaştırma</span>
              <div className="gs-ciro-karsilastirma">
                <div><span>Bu Ay Ciro</span><strong>{TL(ayCiroKarsilastirma.buAy)}</strong></div>
                <div><span>Geçen Ay Ciro (tam ay)</span><strong>{TL(ayCiroKarsilastirma.gecenAy)}</strong></div>
                <div className={ayCiroKarsilastirma.farkTamAy >= 0 ? 'pos' : 'neg'}><span>Fark</span><strong>{TL(ayCiroKarsilastirma.farkTamAy)}</strong></div>
                <div><span>Geçen Ay (aynı güne kadar)</span><strong>{TL(ayCiroKarsilastirma.gecenAyAyniGune)}</strong></div>
                <div className={ayCiroKarsilastirma.farkAyniGune >= 0 ? 'pos' : 'neg'}><span>Fark</span><strong>{TL(ayCiroKarsilastirma.farkAyniGune)}</strong></div>
              </div>

              <span className="gs-subhead big" style={{ marginTop: 14 }}>Ana Kasa Takibi</span>
              <div className="gs-anakasa-takip">
                <div>
                  <span>Dünden Devir Ana Kasa {!dunkuKayit && <em className="gs-no-record">(kayıt yok)</em>}</span>
                  <strong>{TL(dundenDevirAnaKasa)}</strong>
                </div>
                <div><span>Bugünkü Nakit</span><strong>{TL(toplamNakitPara)}</strong></div>
                <div><span>Ana Kasa Harcama</span><strong>{TL(-anaKasaToplam)}</strong></div>
                <div className="total"><span>Yarına Devir Ana Kasa</span><strong>{TL(yarinaDevirAnaKasa)}</strong></div>
              </div>
            </section>
          </div>

        </div>
      )}

      {avansPinOpen && (
        <div className="gs-modal-overlay" onClick={() => setAvansPinOpen(false)}>
          {avansStep === 'pin' ? (
            <div className={`gs-modal gs-pin-modal ${avansPinError ? 'shake' : ''}`} onClick={(e) => e.stopPropagation()}>
              <h3><Lock size={15} /> Kasa Avansını Değiştir</h3>
              <div className="gs-pin-dots">
                {[0, 1, 2, 3].map((i) => <span key={i} className={`gs-pin-dot ${avansPinValue.length > i ? 'filled' : ''}`} />)}
              </div>
              {avansPinError && <p className="gs-pin-error">Yanlış PIN, tekrar deneyin</p>}
              <div className="gs-pin-keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                  <button key={n} onClick={() => pressAvansPinDigit(n)}>{n}</button>
                ))}
                <div />
                <button onClick={() => pressAvansPinDigit('0')}>0</button>
                <button onClick={() => setAvansPinValue((p) => p.slice(0, -1))}><Delete size={16} /></button>
              </div>
            </div>
          ) : (
            <div className="gs-modal" onClick={(e) => e.stopPropagation()}>
              <h3><Banknote size={15} /> Yeni Tutar</h3>
              <input
                autoFocus
                type="number"
                className="gs-modal-input"
                value={avansDraft}
                onChange={(e) => setAvansDraft(e.target.value)}
              />
              <div className="gs-modal-footer two">
                <button className="gs-secondary-btn" onClick={() => setAvansPinOpen(false)}>Vazgeç</button>
                <button className="gs-primary-btn" onClick={saveAvansDraft}>Kaydet</button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <div className="gs-toast">{toast}</div>}
    </div>
  );
}
// ============================================================
// Mini Fiş Girişi — Kasa Harcama bölümünde kullanılır.
// Girilen bilgiler Fatura ve Fişler sheet'ine GunlukHarcama=TRUE olarak kaydedilir.
// ============================================================
export function MiniHarcamaFormu({ baslik, showToast }) {
  const [satirlar, setSatirlar] = useState([{ id: null, neIcin: '', tutar: '', aciklama: '' }]);
  const [firmalar, setFirmalar] = useState([]); // { firmaAdi, giderKategorisi }
  const [yeniGiderModal, setYeniGiderModal] = useState(false);
  const [yeniGiderAd, setYeniGiderAd] = useState('');
  const [yeniGiderKat, setYeniGiderKat] = useState('');
  const [kategoriler, setKategoriler] = useState([]);
  const [aciklamaAcik, setAciklamaAcik] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [fRes, kRes] = await Promise.all([
          fetch('/api/muhasebe?resource=gunlukHarcamaFirmalar'),
          fetch('/api/muhasebe?resource=kategoriler'),
        ]);
        const fj = await fRes.json();
        const kj = await kRes.json();
        setFirmalar(fj.firmalar || []);
        if (kj.kategoriler?.length) setKategoriler(kj.kategoriler);
      } catch { /* sessiz */ }
    })();
  }, []);

  function satirGuncelle(idx, field, val) {
    setSatirlar(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  function satirEkle() {
    setSatirlar(prev => [...prev, { id: null, neIcin: '', tutar: '', aciklama: '' }]);
  }

  async function satirKaydet(idx) {
    const s = satirlar[idx];
    if (!s.neIcin || !s.tutar) { showToast('Firma ve tutar gerekli'); return; }
    const firma = firmalar.find(f => f.firmaAdi === s.neIcin);
    try {
      const res = await fetch('/api/muhasebe?resource=gunlukHarcamaKaydet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmaAdi: s.neIcin, giderKategorisi: firma?.giderKategorisi || '',
          aciklama: s.aciklama, faturaTutari: s.tutar, giderId: s.id || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      showToast('Kaydedildi');
      setSatirlar(prev => prev.map((r, i) => i === idx ? { ...r, id: j.id } : r));
    } catch(e) { showToast('Kaydedilemedi: ' + e.message); }
  }

  async function yeniGiderEkle() {
    if (!yeniGiderAd.trim()) return;
    try {
      const res = await fetch('/api/muhasebe?resource=faturaFisFirmaEkle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaAdi: yeniGiderAd.trim(), giderKategorisi: yeniGiderKat, gunlukHarcama: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      showToast(j.zatenVar ? 'Bu firma zaten var' : 'Gider yeri eklendi');
      if (!j.zatenVar) setFirmalar(prev => [...prev, { firmaAdi: yeniGiderAd.trim(), giderKategorisi: yeniGiderKat }]);
      setYeniGiderModal(false); setYeniGiderAd(''); setYeniGiderKat('');
    } catch(e) { showToast('Eklenemedi: ' + e.message); }
  }

  return (
    <div className="gs-mini-fis">
      <div className="gs-mini-fis-head">
        <span className="gs-subhead">{baslik}</span>
        <button className="gs-mini-yeni-btn" onClick={() => setYeniGiderModal(true)}>+ Yeni Gider</button>
      </div>
      {satirlar.map((s, idx) => (
        <div key={idx} className="gs-mini-satir">
          {s.id && <span className="gs-gider-kod" title="Gider Kodu">{String(s.id).slice(-6)}</span>}
          <select className="gs-mini-select gs-tabbable" value={s.neIcin} onChange={e => satirGuncelle(idx, 'neIcin', e.target.value)}>
            <option value="">Ne için?</option>
            {firmalar.map(f => <option key={f.firmaAdi} value={f.firmaAdi}>{f.firmaAdi}</option>)}
          </select>
          <input type="number" placeholder="0" className="gs-mini-tutar gs-tabbable" value={s.tutar}
            onChange={e => satirGuncelle(idx, 'tutar', e.target.value)} />
          <button className="gs-mini-aciklama-btn" title="Not ekle"
            onClick={() => setAciklamaAcik(prev => ({ ...prev, [idx]: !prev[idx] }))}>📝</button>
          <button className="gs-mini-kaydet" onClick={() => satirKaydet(idx)}>✓</button>
        </div>
      ))}
      {satirlar.some((s, idx) => aciklamaAcik[idx]) && satirlar.map((s, idx) =>
        aciklamaAcik[idx] ? (
          <div key={'ac' + idx} className="gs-mini-aciklama-pop">
            <input className="gs-tabbable" placeholder="Not (opsiyonel)" value={s.aciklama}
              onChange={e => satirGuncelle(idx, 'aciklama', e.target.value)} />
          </div>
        ) : null
      )}
      <button className="gs-add-row-btn" onClick={satirEkle}><Plus size={13} /> Satır Ekle</button>

      {yeniGiderModal && (
        <div className="gs-mini-modal-overlay" onClick={() => setYeniGiderModal(false)}>
          <div className="gs-mini-modal" onClick={e => e.stopPropagation()}>
            <strong>Yeni Gider Yeri</strong>
            <input className="gs-tabbable" placeholder="Ne için? (örn. Manav)" value={yeniGiderAd}
              onChange={e => setYeniGiderAd(e.target.value)} autoFocus />
            <select className="gs-mini-select" value={yeniGiderKat} onChange={e => setYeniGiderKat(e.target.value)}>
              <option value="">Kategori seç</option>
              {kategoriler.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <div className="gs-mini-modal-footer">
              <button onClick={() => setYeniGiderModal(false)}>Vazgeç</button>
              <button className="gs-primary-btn" onClick={yeniGiderEkle}>Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}