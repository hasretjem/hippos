import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Muhasebe.css';
import { TL } from '../../hooks/useHipposData';
import { supabase } from '../../services/supabase';
import FaturaXmlIce from './FaturaXmlIce/FaturaXmlIce';
import {
  ArrowLeft, TrendingDown, TrendingUp, Truck, Users, ChefHat,
  Plus, Upload, X, Check, Search, MessageCircle, Trash2, FileSpreadsheet,
} from 'lucide-react';

// KRİTİK: Number("0,04") -> NaN döner (Türkçe ondalık virgülü). Tutar/oran input'larında
// kullanıcı virgülle yazınca sessizce 0 kabul edilmesin diye tek bir güvenli ayrıştırıcı.
function ondalikParse(deger) {
  if (deger === '' || deger === null || deger === undefined) return 0;
  const n = Number(String(deger).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Enter'a basınca DOM sırasındaki bir sonraki "mh-tabbable" alanına odaklanır.
function handleTabEnter(e) {
  if (e.key !== 'Enter') return;
  if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const all = Array.from(document.querySelectorAll('.mh-tabbable'));
  const idx = all.indexOf(e.target);
  if (idx !== -1 && idx < all.length - 1) all[idx + 1].focus();
}

function normalizeTrPhone(phone) {
  let digits = (phone || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('90')) digits = '90' + digits;
  return digits;
}

// Türkçe tarih (GG.AA.YYYY veya GG/AA/YYYY) -> Date. Sıralama/filtreleme için.
function trTarihiCoz(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

// <input type="date"> HER ZAMAN "YYYY-MM-DD" ister; sistemin geri kalanı ise TR formatı
// ("GG.AA.YYYY") kullanıyor. Tarih alanlarını controlled tutabilmek için state'te ISO
// saklanıp gönderim anında TR'ye çevriliyor — önceden value hiç verilmediği (ya da
// nokta içerdiği için hep boşa düştüğü) için tarih kutuları açılışta boş görünüyordu.
function bugunInputISO() {
  const d = new Date();
  const tr = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const ay = String(tr.getMonth() + 1).padStart(2, '0');
  const gun = String(tr.getDate()).padStart(2, '0');
  return `${tr.getFullYear()}-${ay}-${gun}`;
}

function inputISOtoTr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// "Bu Ay" / "Geçen Ay" filtresi için tarih aralığı kontrolü.
function tarihAraliktaMi(trTarihStr, aralik) {
  if (aralik === 'tumu') return true;
  const tarih = trTarihiCoz(trTarihStr);
  if (!tarih) return false;
  const now = new Date();
  if (aralik === 'buAy') {
    return tarih.getFullYear() === now.getFullYear() && tarih.getMonth() === now.getMonth();
  }
  if (aralik === 'gecenAy') {
    const gecenAy = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return tarih.getFullYear() === gecenAy.getFullYear() && tarih.getMonth() === gecenAy.getMonth();
  }
  return true;
}

const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const GIDER_KATEGORILERI = [
  'Gıda Alışı',
  'Kahvaltı Malzeme Alışı',
  'Tavuk Alışı',
  'Kırmızı Et Alışı',
  'İçecek Alışları',
  'Personel Gideri',
  'Ambalaj Malzeme Alışı',
  'Temizlik Malzemesi Alışı',
  'Fatura ( Elektrik + Su + Dogalgaz + Telefon + İnternet ) Gideri',
  'Diğer Giderler',
  'Kira + Aidat + Otopark Gideri',
  'Vergi + Ssk + Diğer. Giderler',
  'Yemek Kart-Banka Masf.',
];

const GELIR_KATEGORILERI = [
  'Kurumsal Satış / Catering Faturası',
  'Yemek Kartı Şirket Faturası',
  'Diğer Gelirler',
];

const ORTAKLAR = ['Hasret Cem Arslan', 'Hasan Arslan'];
const ORTAK_ISLEM_TURLERI = ['Kasadan Nakit Çekim', 'Cepten Ödeme', 'Bağkur / Şahsi Ödeme', 'Sermaye Ekleme', 'Şahsi Kredi Kartı Ödemesi', 'Diğer'];

export default function Muhasebe({ onNavigate }) {
  const [anaTab, setAnaTab] = useState('giderler'); // giderler | gelirler | toptancilar | ortaklar | receteler
  const [toast, setToast] = useState('');
  const [xmlModalAcikGlobal, setXmlModalAcikGlobal] = useState(false);
  const [ekstreYukleniyor, setEkstreYukleniyor] = useState(false);
  const ekstreDosyaRef = React.useRef(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  // Sağ üst köşedeki global ekstre yükleme
  async function globalDosyaIsle(file) {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { showToast('Lütfen .xlsx uzantılı ekstre dosyası seçin'); return; }
    setEkstreYukleniyor(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let ikili = '';
      const parcaBoyu = 8192;
      for (let i = 0; i < bytes.length; i += parcaBoyu) {
        ikili += String.fromCharCode.apply(null, bytes.subarray(i, i + parcaBoyu));
      }
      const b64 = btoa(ikili);
      const res = await fetch('/api/muhasebe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'ekstreYukle', dosyaBase64: b64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'yükleme başarısız');
      showToast(`${json.ozet?.eklenen ?? 0} yeni hareket işlendi`);
    } catch (err) {
      showToast('Yüklenemedi: ' + err.message);
    } finally {
      setEkstreYukleniyor(false);
      if (ekstreDosyaRef.current) ekstreDosyaRef.current.value = '';
    }
  }

  return (
    <div className="mh-shell">
      <div className="mh-header-row">
        <button className="mh-back" onClick={() => onNavigate('settings')}><ArrowLeft size={16} /> Geri</button>
        <div className="mh-global-actions">
          <button className="mh-secondary-btn" onClick={() => setXmlModalAcikGlobal(true)}>
            <Upload size={14} /> XML Yükle
          </button>
          <button className="mh-secondary-btn" disabled={ekstreYukleniyor}
            onClick={() => ekstreDosyaRef.current?.click()}>
            <FileSpreadsheet size={14} /> {ekstreYukleniyor ? 'İşleniyor…' : 'Ekstre Yükle'}
          </button>
          <input ref={ekstreDosyaRef} type="file" accept=".xlsx,.xls" hidden
            onChange={(e) => { globalDosyaIsle(e.target.files?.[0]); }} />
        </div>
      </div>

      <div className="mh-tabs">
        <button className={anaTab === 'giderler' ? 'active' : ''} onClick={() => setAnaTab('giderler')}>
          <TrendingDown size={15} /> Giderler/Alışlar
        </button>
        <button className={anaTab === 'gelirler' ? 'active' : ''} onClick={() => setAnaTab('gelirler')}>
          <TrendingUp size={15} /> Gelirler/Satışlar
        </button>
        <button className={anaTab === 'toptancilar' ? 'active' : ''} onClick={() => setAnaTab('toptancilar')}>
          <Truck size={15} /> Toptancılar ve Cari Takibi
        </button>
        <button className={anaTab === 'ortaklar' ? 'active' : ''} onClick={() => setAnaTab('ortaklar')}>
          <Users size={15} /> Ortaklar Cari Takip
        </button>
        <button className={anaTab === 'personel' ? 'active' : ''} onClick={() => setAnaTab('personel')}>
          <Users size={15} /> Personel
        </button>
        <button className={anaTab === 'sabitGiderler' ? 'active' : ''} onClick={() => setAnaTab('sabitGiderler')}>
          <FileSpreadsheet size={15} /> Sabit Giderler
        </button>
        <button className={anaTab === 'receteler' ? 'active' : ''} onClick={() => setAnaTab('receteler')}>
          <ChefHat size={15} /> Reçeteler
        </button>
      </div>

      <div className="mh-body">
        {anaTab === 'giderler' && <GiderlerSekmesi showToast={showToast} />}
        {anaTab === 'gelirler' && <GelirlerSekmesi showToast={showToast} />}
        {anaTab === 'toptancilar' && <ToptancilarCariSekmesi showToast={showToast} />}
        {anaTab === 'ortaklar' && <OrtaklarCariSekmesi showToast={showToast} />}
        {anaTab === 'personel' && <PersonelSekmesi showToast={showToast} />}
        {anaTab === 'sabitGiderler' && <SabitGiderlerSekmesi showToast={showToast} />}
        {anaTab === 'receteler' && <ReceteSekmesi showToast={showToast} />}
      </div>

      {toast && <div className="mh-toast">{toast}</div>}

      {/* Global XML Fatura Yükleme Modal */}
      {xmlModalAcikGlobal && (
        <div className="mh-drawer-overlay" onClick={() => setXmlModalAcikGlobal(false)}>
          <div className="mh-modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:560}}>
            <div className="mh-drawer-head">
              <span>XML Fatura Yükle</span>
              <button onClick={() => setXmlModalAcikGlobal(false)}><X size={18} /></button>
            </div>
            <div className="mh-drawer-body">
              <FaturaXmlIce showToast={showToast} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================== 1) GİDERLER / ALIŞLAR ==================
// Üç alt sekme: resmi fatura/fiş kayıtları, ham banka-kart ekstresi ve ikisi
// arasında henüz eşleşmemiş harcamaların bekleme havuzu.
function GiderlerSekmesi({ showToast }) {
  const [altTab, setAltTab] = useState('faturaGiris');
  const [bekleyenSayisi, setBekleyenSayisi] = useState(null);

  async function bekleyenSayisiniTazele() {
    try {
      const r = await fetch('/api/muhasebe?resource=ekstre&durum=fatura_bekliyor');
      const j = await r.json();
      setBekleyenSayisi((j.records || []).length);
    } catch { /* sessiz */ }
  }
  useEffect(() => { bekleyenSayisiniTazele(); }, []);

  const [devirTarihi, setDevirTarihi] = useState('');
  const [devirInput, setDevirInput] = useState('');
  const [devirKaydediyor, setDevirKaydediyor] = useState(false);
  useEffect(() => {
    fetch('/api/muhasebe?resource=muhasebeAyar')
      .then(r => r.json())
      .then(j => { setDevirTarihi(j.devirTarihi || ''); setDevirInput(j.devirTarihi || ''); })
      .catch(() => {});
  }, []);

  async function devirKaydet() {
    const deger = devirInput.trim();
    if (deger && !/^\d{2}\.\d{2}\.\d{4}$/.test(deger)) { showToast('Tarih GG.AA.YYYY olmalı (örn. 30.09.2026)'); return; }
    setDevirKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=muhasebeAyar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devirTarihi: deger }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      setDevirTarihi(deger);
      showToast(deger ? 'Devir tarihi kaydedildi' : 'Devir tarihi kaldırıldı');
    } catch (e) { showToast('Kaydedilemedi: ' + e.message); }
    finally { setDevirKaydediyor(false); }
  }

  return (
    <div className="mh-yeni">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
        <strong>Devir tarihi:</strong>
        <input className="ff-input" style={{ width: 130 }} value={devirInput}
          onChange={e => setDevirInput(e.target.value)} placeholder="GG.AA.YYYY" />
        <button className="mh-secondary-btn" disabled={devirKaydediyor || devirInput.trim() === devirTarihi} onClick={devirKaydet}>
          {devirKaydediyor ? '…' : 'Kaydet'}
        </button>
        <span style={{ opacity: 0.7 }}>
          {devirTarihi
            ? `${devirTarihi} ve öncesine ait XML faturalar ve ekstre ödemeleri kart olarak gösterilmez.`
            : 'Belirlenmedi, tüm kartlar gösteriliyor.'}
        </span>
      </div>
      <div className="mh-alt-tabs">
        <button className={altTab === 'faturaGiris' ? 'active' : ''} onClick={() => setAltTab('faturaGiris')}>
          🧾 Fatura ve Fiş Girişi
        </button>
        <button className={altTab === 'tahsilat' ? 'active' : ''} onClick={() => setAltTab('tahsilat')}>
          💰 Tahsilat Makbuzu
        </button>
        <button className={altTab === 'bankaKart' ? 'active' : ''} onClick={() => setAltTab('bankaKart')}>
          🏦 Banka / Kart Takip
        </button>
      </div>

      {altTab === 'faturaGiris' && <FaturaFisGirisiSekmesi key={'ff-' + devirTarihi} showToast={showToast} />}
      {altTab === 'tahsilat' && <TahsilatMakbuzuSekmesi key={'th-' + devirTarihi} showToast={showToast} />}
      {altTab === 'bankaKart' && <BankaKartTakipSekmesi showToast={showToast} devirTarihi={devirTarihi} />}
    </div>
  );
}

function FaturalarAltSekmesi({ showToast }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [toptancilar, setToptancilar] = useState([]);
  const [kategoriler, setKategoriler] = useState(GIDER_KATEGORILERI);
  const [loading, setLoading] = useState(true);
  const [kategoriFiltre, setKategoriFiltre] = useState('tumu');
  const [tarihFiltre, setTarihFiltre] = useState('buAy');
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [xmlModalAcik, setXmlModalAcik] = useState(false);

  async function yukle() {
    setLoading(true);
    try {
      const [gRes, tRes, kRes] = await Promise.all([
        fetch('/api/muhasebe?resource=giderler'),
        fetch('/api/toptancilar'),
        fetch('/api/muhasebe?resource=kategoriler'),
      ]);
      const gJson = await gRes.json();
      const tJson = await tRes.json();
      const kJson = await kRes.json();
      setKayitlar(gJson.records || []);
      setToptancilar(tJson.records || []);
      if (kJson.kategoriler?.length) setKategoriler(kJson.kategoriler);
    } catch {
      showToast('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { yukle(); }, []);

  // XML'den gelen faturalar kalem kalem Sheets'e yazılıyor (aynı faturaId'yi paylaşırlar) —
  // burada UI'da tek satıra gruplanıyor. Kalem detayı (hangi ürün, ne kadar) gruplamada
  // kaybolmuyor, sadece görünmüyor — ileride ayrı bir sayfada kullanılabilir.
  const faturaGruplari = useMemo(() => {
    const gruplar = {};
    kayitlar.forEach((k) => {
      const anahtar = k.faturaId || k.id;
      if (!gruplar[anahtar]) {
        gruplar[anahtar] = {
          faturaId: anahtar, tarih: k.tarih, kategori: k.kategori, tedarikciAciklama: k.tedarikciAciklama,
          tutar: 0, odemeDurumu: k.odemeDurumu, belgeNo: k.belgeNo, toptanciId: k.toptanciId,
          kalemSayisi: 0, kategoriler: new Set(),
        };
      }
      gruplar[anahtar].tutar += k.tutar;
      gruplar[anahtar].kalemSayisi += 1;
      gruplar[anahtar].kategoriler.add(k.kategori);
      // Herhangi bir kalem "Ödeme Bekliyor" ise fatura genelinde de öyle gösterilir.
      if (k.odemeDurumu === 'Ödeme Bekliyor') gruplar[anahtar].odemeDurumu = 'Ödeme Bekliyor';
    });
    return Object.values(gruplar).map((g) => ({
      ...g, tutar: Math.round(g.tutar * 100) / 100,
      kategoriGoster: g.kategoriler.size > 1 ? `${[...g.kategoriler][0]} +${g.kategoriler.size - 1}` : g.kategori,
    }));
  }, [kayitlar]);

  const filtreli = useMemo(() => {
    return faturaGruplari
      .filter((g) => kategoriFiltre === 'tumu' || g.kategoriler.has(kategoriFiltre))
      .filter((g) => tarihAraliktaMi(g.tarih, tarihFiltre))
      .sort((a, b) => (trTarihiCoz(b.tarih)?.getTime() || 0) - (trTarihiCoz(a.tarih)?.getTime() || 0));
  }, [faturaGruplari, kategoriFiltre, tarihFiltre]);

  const kpi = useMemo(() => {
    const buAyKayitlar = kayitlar.filter((k) => tarihAraliktaMi(k.tarih, 'buAy'));
    const toplamGider = buAyKayitlar.reduce((s, k) => s + k.tutar, 0);
    const bekleyen = buAyKayitlar.filter((k) => k.odemeDurumu === 'Ödeme Bekliyor').reduce((s, k) => s + k.tutar, 0);
    const kategoriToplamlari = {};
    buAyKayitlar.forEach((k) => { kategoriToplamlari[k.kategori] = (kategoriToplamlari[k.kategori] || 0) + k.tutar; });
    let enYuksekKat = null, enYuksekTutar = 0;
    Object.entries(kategoriToplamlari).forEach(([kat, t]) => { if (t > enYuksekTutar) { enYuksekTutar = t; enYuksekKat = kat; } });
    const yuzde = toplamGider > 0 ? Math.round((enYuksekTutar / toplamGider) * 100) : 0;
    return { toplamGider, bekleyen, enYuksekKat, yuzde };
  }, [kayitlar]);

  const dipToplam = useMemo(() => filtreli.reduce((s, g) => s + g.tutar, 0), [filtreli]);

  function toptanciAdi(id) {
    const t = toptancilar.find((x) => x.id === id);
    return t ? t.firmaAdi : null;
  }

  return (
    <>
      <div className="mh-kpi-row">
        <div className="mh-kpi-card">
          <span className="mh-kpi-label">Bu Ayki Toplam Gider</span>
          <span className="mh-kpi-value">{TL(kpi.toplamGider)}</span>
        </div>
        <div className="mh-kpi-card mh-kpi-danger">
          <span className="mh-kpi-label">Bekleyen Ödemeler</span>
          <span className="mh-kpi-value">{TL(kpi.bekleyen)}</span>
        </div>
        <div className="mh-kpi-card">
          <span className="mh-kpi-label">En Yüksek Harcama Kalemi</span>
          <span className="mh-kpi-value mh-kpi-value-small">{kpi.enYuksekKat ? `%${kpi.yuzde} ${kpi.enYuksekKat}` : '-'}</span>
        </div>
      </div>

      <div className="mh-actionbar">
        <div className="mh-date-pills">
          <button className={tarihFiltre === 'buAy' ? 'active' : ''} onClick={() => setTarihFiltre('buAy')}>Bu Ay</button>
          <button className={tarihFiltre === 'gecenAy' ? 'active' : ''} onClick={() => setTarihFiltre('gecenAy')}>Geçen Ay</button>
          <button className={tarihFiltre === 'tumu' ? 'active' : ''} onClick={() => setTarihFiltre('tumu')}>Tümü</button>
        </div>
        <div className="mh-actions">
          <button className="mh-secondary-btn" onClick={() => setXmlModalAcik(true)}><Upload size={15} /> XML Fatura Yükle</button>
          <button className="mh-primary-btn" onClick={() => setDrawerAcik(true)}><Plus size={15} /> Manuel Gider Ekle</button>
        </div>
      </div>

      <div className="mh-filter-pills">
        <button className={kategoriFiltre === 'tumu' ? 'active' : ''} onClick={() => setKategoriFiltre('tumu')}>Tümü</button>
        {kategoriler.map((k) => (
          <button key={k} className={kategoriFiltre === k ? 'active' : ''} onClick={() => setKategoriFiltre(k)}>{k}</button>
        ))}
      </div>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : filtreli.length === 0 ? (
          <p className="mh-empty">Bu filtrede kayıt yok.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Tarih</th><th>Kategori</th><th>Tedarikçi / Açıklama</th><th>Tutar (TL)</th><th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {filtreli.map((g) => (
                <tr key={g.faturaId}>
                  <td>{g.tarih}</td>
                  <td><span className="mh-badge mh-badge-mavi">{g.kategoriGoster}</span></td>
                  <td>{g.tedarikciAciklama || toptanciAdi(g.toptanciId) || '-'}{g.belgeNo ? ` (${g.belgeNo})` : ''}{g.kalemSayisi > 1 ? ` — ${g.kalemSayisi} kalem` : ''}</td>
                  <td className="mh-tutar-cell">{TL(g.tutar)}</td>
                  <td>
                    {g.odemeDurumu === 'Ödeme Bekliyor'
                      ? <span className="mh-durum mh-durum-kirmizi">🔴 Ödeme Bekliyor</span>
                      : <span className="mh-durum mh-durum-yesil">🟢 Ödendi</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Toplam</td>
                <td className="mh-tutar-cell">{TL(dipToplam)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="mh-hint">Ödemeler "Toptancılar ve Cari Takibi" sekmesinden, toptancı bazında toplu yapılır.</p>

      {drawerAcik && (
        <GiderDrawer
          toptancilar={toptancilar}
          kategoriler={kategoriler}
          onClose={() => setDrawerAcik(false)}
          onSaved={(rec, yeniToptanciAcildi) => {
            setKayitlar((prev) => [rec, ...prev]);
            setDrawerAcik(false);
            showToast(yeniToptanciAcildi ? 'Gider kaydedildi, yeni cari kartı açıldı' : 'Gider kaydedildi');
            // Yeni toptancı açıldıysa firma listesi tazelensin (autocomplete güncel kalsın).
            if (yeniToptanciAcildi) fetch('/api/toptancilar').then((r) => r.json()).then((j) => setToptancilar(j.records || [])).catch(() => {});
          }}
        />
      )}

      {xmlModalAcik && (
        <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={() => { setXmlModalAcik(false); yukle(); }}>
          <div className="mh-modal-wide mh-modal-xxl" onClick={(e) => e.stopPropagation()}>
            <div className="mh-drawer-head">
              <span>XML Fatura Yükle</span>
              <button onClick={() => { setXmlModalAcik(false); yukle(); }}><X size={18} /></button>
            </div>
            <div className="mh-drawer-body">
              <FaturaXmlIce showToast={showToast} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Sağ çekmece — manuel gider ekleme formu.
// Manuel gider ekleme. İKİ FARKLI gider tipi var ve bunlar farklı davranıyor:
//  - "İşletme Gideri" (kira, elektrik, personel, vergi...): cari takibi YOK, karşı tarafın
//    bakiyesi tutulmaz, sadece Giderler'e yazılır. Firma alanı serbest metin (opsiyonel).
//  - "Toptancı Alışı": Toptancılar sekmesindeki bir cariye bağlanır, borç hareketi düşülür,
//    ödeme o sekmeden FIFO ile kapatılır. Firma seçimi zorunlu (yoksa yenisi açılabilir).
function GiderDrawer({ toptancilar, kategoriler, onClose, onSaved }) {
  const [giderTipi, setGiderTipi] = useState('isletme'); // isletme | toptanci
  const [form, setForm] = useState({
    kategori: '', firma: '', tutar: '', kdvOrani: '%20', odemeDurumu: 'Ödendi', belgeNo: '', tarih: bugunInputISO(), toptanciId: '',
  });
  const [saving, setSaving] = useState(false);
  const [firmaOnerAcik, setFirmaOnerAcik] = useState(false);

  const firmaFiltreli = useMemo(() => {
    const q = (form.firma || '').trim().toLocaleLowerCase('tr-TR');
    if (!q) return toptancilar.slice(0, 8);
    return toptancilar.filter((t) => t.firmaAdi.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 8);
  }, [toptancilar, form.firma]);

  // Yazılan ad mevcut bir toptancıyla birebir eşleşiyor mu (yeni kart açılacak mı)?
  const tamEslesme = useMemo(() => {
    const q = (form.firma || '').trim().toLocaleLowerCase('tr-TR');
    if (!q) return null;
    return toptancilar.find((t) => t.firmaAdi.trim().toLocaleLowerCase('tr-TR') === q) || null;
  }, [toptancilar, form.firma]);

  function firmaSec(t) {
    setForm((p) => ({ ...p, firma: t.firmaAdi, toptanciId: t.id }));
    setFirmaOnerAcik(false);
  }

  const toptanciModu = giderTipi === 'toptanci';
  // Tarih HER ZAMAN zorunlu; toptancı modunda ayrıca firma adı gerekli.
  const gecerli = form.kategori && form.tutar && form.tarih && (!toptanciModu || form.firma.trim());

  async function kaydet() {
    if (!gecerli) return;
    setSaving(true);
    try {
      const res = await fetch('/api/muhasebe?resource=giderler', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarih: inputISOtoTr(form.tarih), kategori: form.kategori, tedarikciAciklama: form.firma,
          tutar: ondalikParse(form.tutar), kdvOrani: form.kdvOrani, odemeDurumu: form.odemeDurumu,
          belgeNo: form.belgeNo,
          // Sadece toptancı modunda cari bağlantısı kurulur. toptanciId boş ama
          // yeniToptanciAdi doluysa backend yeni bir toptancı kartı açıp ona bağlar.
          toptanciId: toptanciModu ? (form.toptanciId || '') : '',
          yeniToptanciAdi: toptanciModu && !form.toptanciId ? form.firma.trim() : '',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'save failed');
      onSaved(json.record, json.yeniToptanciAcildi);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="mh-drawer-overlay" onClick={onClose}>
      <div className="mh-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mh-drawer-head">
          <span>Manuel Gider Ekle</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="mh-gider-tipi">
          <button className={giderTipi === 'isletme' ? 'active' : ''} onClick={() => setGiderTipi('isletme')}>
            İşletme Gideri
            <small>Kira, elektrik, personel, vergi…</small>
          </button>
          <button className={giderTipi === 'toptanci' ? 'active' : ''} onClick={() => setGiderTipi('toptanci')}>
            Toptancı Alışı
            <small>Cari hesaba borç yazılır</small>
          </button>
        </div>

        <div className="mh-drawer-body mh-drawer-2col">
          <div className="mh-field">
            <label>Kategori</label>
            <select className="mh-tabbable" value={form.kategori} onChange={(e) => setForm((p) => ({ ...p, kategori: e.target.value }))} onKeyDown={handleTabEnter}>
              <option value="">Seçiniz</option>
              {kategoriler.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="mh-field">
            <label>Tutar (TL, KDV Dahil)</label>
            <input className="mh-tabbable" value={form.tutar} onChange={(e) => setForm((p) => ({ ...p, tutar: e.target.value }))} onKeyDown={handleTabEnter} inputMode="decimal" />
          </div>
          <div className="mh-field mh-field-rel mh-field-full">
            <label>{toptanciModu ? 'Toptancı / Firma (zorunlu)' : 'Firma / Açıklama (isteğe bağlı)'}</label>
            <input
              className="mh-tabbable" value={form.firma} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false"
              placeholder={toptanciModu ? 'Ara veya yeni firma adı yaz…' : 'örn. Perpa Dükkan Kirası, BEDAŞ'}
              onChange={(e) => { setForm((p) => ({ ...p, firma: e.target.value, toptanciId: '' })); setFirmaOnerAcik(true); }}
              onFocus={() => setFirmaOnerAcik(true)} onKeyDown={handleTabEnter}
            />
            {toptanciModu && firmaOnerAcik && firmaFiltreli.length > 0 && (
              <div className="mh-firma-oneri">
                {firmaFiltreli.map((t) => (
                  <div key={t.id} className="mh-firma-oneri-item" onClick={() => firmaSec(t)}>{t.firmaAdi}</div>
                ))}
              </div>
            )}
            {toptanciModu && form.firma.trim() && !tamEslesme && (
              <span className="mh-field-hint">Bu firma kayıtlı değil — kaydedince yeni cari kartı açılacak.</span>
            )}
          </div>
          <div className="mh-field">
            <label>KDV Oranı</label>
            <select className="mh-tabbable" value={form.kdvOrani} onChange={(e) => setForm((p) => ({ ...p, kdvOrani: e.target.value }))} onKeyDown={handleTabEnter}>
              <option value="%1">%1</option><option value="%10">%10</option><option value="%20">%20</option>
            </select>
          </div>
          <div className="mh-field">
            <label>Fatura/Fiş Tarihi</label>
            <input className="mh-tabbable" type="date" required value={form.tarih}
              onChange={(e) => setForm((p) => ({ ...p, tarih: e.target.value }))} onKeyDown={handleTabEnter} />
            {!form.tarih && <span className="mh-field-hint mh-field-hint-err">Tarih zorunlu.</span>}
          </div>
          <div className="mh-field mh-field-full">
            <label>Ödeme Durumu</label>
            <select className="mh-tabbable" value={form.odemeDurumu} onChange={(e) => setForm((p) => ({ ...p, odemeDurumu: e.target.value }))} onKeyDown={handleTabEnter}>
              <option value="Ödendi">Ödendi</option><option value="Ödeme Bekliyor">Ödeme Bekliyor</option>
            </select>
          </div>
          <div className="mh-field mh-field-full">
            <label>Belge No / Not</label>
            <input className="mh-tabbable" value={form.belgeNo} onChange={(e) => setForm((p) => ({ ...p, belgeNo: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
        </div>
        <div className="mh-drawer-foot">
          <button className="mh-primary-btn" disabled={saving || !gecerli} onClick={kaydet}>
            <Check size={15} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}



// ---------- Ortak: ekstre satır listesi + yükleme ----------
// Hem Giderler (GİDEN) hem Gelirler (GELEN) tarafında aynı bileşen kullanılıyor,
// yon prop'u hangi tarafın gösterileceğini belirliyor.
function EkstreAltSekmesi({ showToast, yon, onDegisti }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [toptancilar, setToptancilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [surukleAktif, setSurukleAktif] = useState(false);
  const [sonOzet, setSonOzet] = useState(null);
  const dosyaRef = React.useRef(null);

  async function yukle() {
    setLoading(true);
    try {
      const [eRes, tRes] = await Promise.all([
        fetch(`/api/muhasebe?resource=ekstre&yon=${encodeURIComponent(yon)}`),
        fetch('/api/toptancilar'),
      ]);
      const eJson = await eRes.json();
      const tJson = await tRes.json();
      setKayitlar(eJson.records || []);
      setToptancilar(tJson.records || []);
    } catch {
      showToast('Ekstre verisi yüklenemedi');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { yukle(); }, [yon]);

  async function dosyaIsle(file) {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { showToast('Lütfen .xlsx uzantılı ekstre dosyası seçin'); return; }
    setYukleniyor(true);
    setSonOzet(null);
    try {
      const buf = await file.arrayBuffer();
      // Büyük dosyalarda tek seferde String.fromCharCode(...) çağrısı call-stack taşırdığı
      // için parça parça base64'e çeviriyoruz.
      const bytes = new Uint8Array(buf);
      let ikili = '';
      const parcaBoyu = 8192;
      for (let i = 0; i < bytes.length; i += parcaBoyu) {
        ikili += String.fromCharCode.apply(null, bytes.subarray(i, i + parcaBoyu));
      }
      const b64 = btoa(ikili);
      const res = await fetch('/api/muhasebe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'ekstreYukle', dosyaBase64: b64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'yükleme başarısız');
      setSonOzet(json.ozet);
      showToast(`${json.ozet.eklenen} yeni hareket işlendi`);
      await yukle();
      onDegisti?.();
    } catch (err) {
      showToast('Yüklenemedi: ' + err.message);
    } finally {
      setYukleniyor(false);
    }
  }

  const gidenMi = yon === 'GİDEN';
  const toplam = useMemo(() => kayitlar.reduce((s, k) => s + k.tutar, 0), [kayitlar]);
  const sirali = useMemo(() => [...kayitlar].sort(
    (a, b) => (trTarihiCoz(b.tarih)?.getTime() || 0) - (trTarihiCoz(a.tarih)?.getTime() || 0)
  ), [kayitlar]);

  function toptanciAdi(id) {
    const t = toptancilar.find((x) => x.id === id);
    return t ? t.firmaAdi : null;
  }

  return (
    <>
      <div
        className={`mh-drop-alan ${surukleAktif ? 'aktif' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setSurukleAktif(true); }}
        onDragLeave={() => setSurukleAktif(false)}
        onDrop={(e) => { e.preventDefault(); setSurukleAktif(false); dosyaIsle(e.dataTransfer.files?.[0]); }}
        onClick={() => dosyaRef.current?.click()}
      >
        <Upload size={20} />
        <div>
          <strong>{yukleniyor ? 'İşleniyor…' : 'Ekstre dosyasını buraya sürükle'}</strong>
          <small>kart-islemlerim.xlsx — veya tıklayıp seç. Aynı dosyayı tekrar yüklersen mükerrer kayıt oluşmaz.</small>
        </div>
        <input ref={dosyaRef} type="file" accept=".xlsx,.xls" hidden
          onChange={(e) => { dosyaIsle(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {sonOzet && (
        <div className="mh-ozet-serit">
          <span><b>{sonOzet.eklenen}</b> yeni</span>
          {sonOzet.mukerrer > 0 && <span><b>{sonOzet.mukerrer}</b> mükerrer atlandı</span>}
          {sonOzet.faturaBekliyor > 0 && <span className="uyari"><b>{sonOzet.faturaBekliyor}</b> faturası bekleniyor — "Faturası Beklenenler" sekmesinden işle</span>}
          {sonOzet.posHakedis > 0 && <span className="ok"><b>{sonOzet.posHakedis}</b> POS hakedişi</span>}
        </div>
      )}

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : sirali.length === 0 ? (
          <p className="mh-empty">Henüz ekstre yüklenmedi.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Tarih</th><th>İşlem</th><th>{gidenMi ? 'Satıcı / Açıklama' : 'Açıklama'}</th>
                <th>Tutar (TL)</th><th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {sirali.map((k) => (
                <tr key={k.id}>
                  <td>{k.tarih}</td>
                  <td>
                    <span className={`mh-durum ${k.islemTuru === 'PROVİZYON' ? 'mh-durum-notr' : ''}`}>
                      {k.islemTuru === 'PROVİZYON' ? '⏱ Provizyon' : 'Gerçekleşti'}
                    </span>
                  </td>
                  <td>{k.saticiAdi || k.aciklama}</td>
                  <td className="mh-tutar-cell">{TL(k.tutar)}</td>
                  <td>{ekstreDurumEtiketi(k, toptanciAdi)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Toplam</td>
                <td className="mh-tutar-cell">{TL(toplam)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}

// Ekstre satırının eşleşme durumunu okunur bir etikete çevirir.
function ekstreDurumEtiketi(k, toptanciAdiCoz) {
  switch (k.eslesmeDurumu) {
    case 'fintek_komisyon':
      return <span className="mh-durum mh-durum-notr">💳 Komisyon (Giderler'e işlenecek)</span>;
    case 'toptanci_odemesi':
      return <span className="mh-durum mh-durum-yesil">🟢 Cariye işlendi{toptanciAdiCoz?.(k.eslesenToptanciId) ? ` — ${toptanciAdiCoz(k.eslesenToptanciId)}` : ''}</span>;
    case 'fatura_bekliyor':
      return <span className="mh-durum mh-durum-kirmizi">⏳ Fatura bekliyor</span>;
    case 'gidere_islendi':
      return <span className="mh-durum mh-durum-yesil">🟢 Giderlere işlendi</span>;
    case 'pos_hakedis':
      return <span className="mh-durum mh-durum-yesil">🟢 POS hakedişi</span>;
    case 'gelir_diger':
      return <span className="mh-durum mh-durum-notr">Gelen ödeme</span>;
    case 'yoksayildi':
      return <span className="mh-durum mh-durum-notr">Kapsam dışı</span>;
    default:
      return <span className="mh-durum mh-durum-notr">—</span>;
  }
}

// ---------- Faturası Beklenenler havuzu ----------
// Karttan para çıkmış ama Uyumsoft'tan faturası gelmemiş harcamalar. Fatura sonradan
// gelirse XML akışı zaten Giderler'e yazıyor; gelmeyecekse buradan elle Giderler'e aktarılır.
function FaturaBekleyenlerAltSekmesi({ showToast, onDegisti }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [kategoriler, setKategoriler] = useState(GIDER_KATEGORILERI);
  const [loading, setLoading] = useState(true);
  const [islenen, setIslenen] = useState('');
  const [secilenKategori, setSecilenKategori] = useState({});

  async function yukle() {
    setLoading(true);
    try {
      const [eRes, kRes] = await Promise.all([
        fetch('/api/muhasebe?resource=ekstre&durum=fatura_bekliyor'),
        fetch('/api/muhasebe?resource=kategoriler'),
      ]);
      const eJson = await eRes.json();
      const kJson = await kRes.json();
      const recs = eJson.records || [];
      setKayitlar(recs);
      if (kJson.kategoriler?.length) setKategoriler(kJson.kategoriler);
      // Sunucunun MCC koduna göre önerdiği kategori varsa seçili gelsin.
      const on = {};
      recs.forEach((r) => { if (r.kategori) on[r.id] = r.kategori; });
      setSecilenKategori((p) => ({ ...on, ...p }));
    } catch {
      showToast('Bekleyenler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { yukle(); }, []);

  async function gidereIsle(kayit) {
    const kategori = secilenKategori[kayit.id];
    if (!kategori) { showToast('Önce kategori seçin'); return; }
    setIslenen(kayit.id);
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'ekstreGidereIsle', ekstreId: kayit.id, kategori }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'işlenemedi');
      setKayitlar((prev) => prev.filter((k) => k.id !== kayit.id));
      showToast('Giderlere işlendi');
      onDegisti?.();
    } catch (err) {
      showToast('İşlenemedi: ' + err.message);
    } finally {
      setIslenen('');
    }
  }

  // Ödeme yapıldı, fatura ayrıca Uyumsoft'tan gelecek — cari hesabına 'odeme' düşülür,
  // Giderler'e yazılmaz (fatura XML'den gelince ayrıca yazılacak).
  async function cariyeOdemeOlarakIsle(kayit) {
    if (!kayit.eslesenToptanciId) {
      showToast('Bu satır bir toptancıya bağlı değil, önce Toptancılar\'dan manuel eşleştir');
      return;
    }
    setIslenen(kayit.id + '_cari');
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'ekstreGidereIsle', ekstreId: kayit.id, cariyeOdemeOlarakIsle: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'işlenemedi');
      setKayitlar((prev) => prev.filter((k) => k.id !== kayit.id));
      showToast('Cari hesaba ödeme olarak işlendi — fatura gelince XML\'den eşleşecek');
      onDegisti?.();
    } catch (err) {
      showToast('İşlenemedi: ' + err.message);
    } finally {
      setIslenen('');
    }
  }

  async function yoksay(kayit) {
    try {
      await fetch('/api/muhasebe?resource=ekstre', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kayit.id, eslesmeDurumu: 'yoksayildi' }),
      });
      setKayitlar((prev) => prev.filter((k) => k.id !== kayit.id));
      showToast('Kapsam dışı bırakıldı');
      onDegisti?.();
    } catch {
      showToast('Güncellenemedi');
    }
  }

  const toplam = useMemo(() => kayitlar.reduce((s, k) => s + k.tutar, 0), [kayitlar]);

  return (
    <>
      <div className="mh-kpi-row mh-kpi-row-2">
        <div className="mh-kpi-card mh-kpi-warning">
          <span className="mh-kpi-label">Faturası Beklenen Tutar</span>
          <span className="mh-kpi-value">{TL(toplam)}</span>
        </div>
        <div className="mh-kpi-card">
          <span className="mh-kpi-label">Bekleyen İşlem Sayısı</span>
          <span className="mh-kpi-value">{kayitlar.length}</span>
        </div>
      </div>

      <p className="mh-hint">
        Karttan çıkmış ama Uyumsoft faturası henüz gelmemiş harcamalar. Fatura geldiğinde XML
        içe aktarımı bunları Giderler'e yazar. Faturası hiç gelmeyecekse kategori seçip elle işleyin.
      </p>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : kayitlar.length === 0 ? (
          <p className="mh-empty">Bekleyen harcama yok — her şey eşleşmiş görünüyor.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr><th>Tarih</th><th>Satıcı</th><th>Tutar (TL)</th><th>Kategori</th><th>İşlem</th></tr>
            </thead>
            <tbody>
              {kayitlar.map((k) => (
                <tr key={k.id}>
                  <td>{k.tarih}</td>
                  <td>{k.saticiAdi || k.aciklama}</td>
                  <td className="mh-tutar-cell">{TL(k.tutar)}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <select className="mh-satir-select" value={secilenKategori[k.id] || ''}
                        onChange={(e) => setSecilenKategori((p) => ({ ...p, [k.id]: e.target.value }))}>
                        <option value="">Kategori seç</option>
                        {kategoriler.map((kat) => <option key={kat} value={kat}>{kat}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="mh-islem-cell" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
                    {/* Toptancıya bağlıysa: ödeme cariye işlenebilir (fatura ayrıca gelecek)
                        ya da fatura hiç gelmeyecekse direkt Giderler'e aktarılabilir. */}
                    {k.eslesenToptanciId && (
                      <button className="mh-mini-btn" disabled={!!islenen} onClick={() => cariyeOdemeOlarakIsle(k)}
                        title="Ödemeyi Toptancı Carisine işle — fatura XML'den gelince ayrıca eşleşecek">
                        {islenen === k.id + '_cari' ? '…' : '🏦 Cariye Ödeme İşle'}
                      </button>
                    )}
                    <button className="mh-mini-btn mh-mini-btn-ghost" disabled={!!islenen} onClick={() => gidereIsle(k)}
                      title="Fatura hiç gelmeyecekse kategori seçip doğrudan Giderler'e aktar">
                      {islenen === k.id ? '…' : 'Giderlere Aktar'}
                    </button>
                    <button className="mh-mini-btn mh-mini-btn-ghost" style={{ opacity: 0.6 }} onClick={() => yoksay(k)}>Yoksay</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2}>Toplam</td><td className="mh-tutar-cell">{TL(toplam)}</td><td colSpan={2}></td></tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- Ciro & Hakediş Eşleştirme (Gelirler 3. alt sekmesi) ----------
// Gün Sonu'nda girilen POS cirosu ile bankaya fiilen yatan hakediş arasındaki farkı
// gösterir; fark komisyon adayıdır ve tek tıkla Giderler'e yazılabilir.
function HakedisEslestirmeAltSekmesi({ showToast }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [loading, setLoading] = useState(true);

  // Yıl/Ay/Gün filtresi — sayfa ilk açıldığında içinde bulunulan ay seçili gelir
  // (kullanıcı kararı, 8 Eylül). "Tümü" seçilirse o kırılım filtre dışı bırakılır.
  const simdi = new Date();
  const [yilFiltre, setYilFiltre] = useState(String(simdi.getFullYear()));
  const [ayFiltre, setAyFiltre] = useState(String(simdi.getMonth() + 1));
  const [gunFiltre, setGunFiltre] = useState('tumu');

  async function yukle() {
    setLoading(true);
    try {
      const res = await fetch('/api/muhasebe?resource=hakedisEslestir');
      const json = await res.json();
      setKayitlar(json.records || []);
    } catch {
      showToast('Hakediş verisi yüklenemedi');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { yukle(); }, []);

  const yillar = useMemo(() => {
    const s = new Set(kayitlar.map((k) => trTarihiCoz(k.tarih)?.getFullYear()).filter(Boolean));
    s.add(simdi.getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [kayitlar]);

  const filtreli = useMemo(() => {
    return kayitlar.filter((k) => {
      const d = trTarihiCoz(k.tarih);
      if (!d) return false;
      if (yilFiltre !== 'tumu' && d.getFullYear() !== Number(yilFiltre)) return false;
      if (ayFiltre !== 'tumu' && d.getMonth() + 1 !== Number(ayFiltre)) return false;
      if (gunFiltre !== 'tumu' && d.getDate() !== Number(gunFiltre)) return false;
      return true;
    }).sort((a, b) => (trTarihiCoz(b.tarih)?.getTime() || 0) - (trTarihiCoz(a.tarih)?.getTime() || 0));
  }, [kayitlar, yilFiltre, ayFiltre, gunFiltre]);

  const kpi = useMemo(() => {
    const eslesen = filtreli.filter((k) => k.ciroTutari !== null);
    const toplamHakedis = filtreli.reduce((s, k) => s + k.tutar, 0);
    const toplamFark = eslesen.reduce((s, k) => s + (k.fark || 0), 0);
    const eslesmeyen = filtreli.length - eslesen.length;
    return { toplamHakedis, toplamFark, eslesmeyen };
  }, [filtreli]);

  return (
    <>
      <div className="mh-kpi-row">
        <div className="mh-kpi-card">
          <span className="mh-kpi-label">Bankaya Yatan POS Hakedişi</span>
          <span className="mh-kpi-value">{TL(kpi.toplamHakedis)}</span>
        </div>
        <div className="mh-kpi-card mh-kpi-warning">
          <span className="mh-kpi-label">Toplam Kesinti / Fark</span>
          <span className="mh-kpi-value">{TL(kpi.toplamFark)}</span>
        </div>
        <div className="mh-kpi-card">
          <span className="mh-kpi-label">Ciro Eşleşmeyen</span>
          <span className="mh-kpi-value">{kpi.eslesmeyen}</span>
        </div>
      </div>

      <p className="mh-hint">
        Bankaya yatan POS hakedişi ile Gün Sonu'nda girdiğiniz POS cirosu karşılaştırılır.
        Hakediş her zaman ertesi gün yattığı için bir önceki günün cirosuyla eşleştirilir.
        Aradaki fark varsa sağda ikaz gösterilir.
      </p>

      <div className="mh-filter-pills">
        <select className="mh-tabbable" value={yilFiltre} onChange={(e) => setYilFiltre(e.target.value)}>
          {yillar.map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="tumu">Tüm Yıllar</option>
        </select>
        <select className="mh-tabbable" value={ayFiltre} onChange={(e) => setAyFiltre(e.target.value)}>
          <option value="tumu">Tüm Aylar</option>
          {AY_ADLARI.map((ad, i) => <option key={i} value={i + 1}>{ad}</option>)}
        </select>
        <select className="mh-tabbable" value={gunFiltre} onChange={(e) => setGunFiltre(e.target.value)}>
          <option value="tumu">Tüm Günler</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : filtreli.length === 0 ? (
          <p className="mh-empty">Bu filtrede POS hakediş kaydı yok.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Yatış Tarihi</th><th>Bankaya Yatan</th><th>Eşleşen Ciro Günü</th>
                <th>Gün Sonu POS Cirosu</th><th>Fark</th>
              </tr>
            </thead>
            <tbody>
              {filtreli.map((k) => (
                <tr key={k.id}>
                  <td>{k.tarih}</td>
                  <td className="mh-tutar-cell">{TL(k.tutar)}</td>
                  <td>{k.ciroTarihi || <span className="mh-durum mh-durum-notr">eşleşme yok</span>}</td>
                  <td className="mh-tutar-cell">{k.ciroTutari !== null ? TL(k.ciroTutari) : '—'}</td>
                  <td className="mh-tutar-cell">
                    {k.fark === null ? '—'
                      : Math.abs(k.fark) < 0.01 ? <span className="mh-durum mh-durum-yesil">🟢 Tam</span>
                      : <span className="mh-durum mh-durum-kirmizi">🔴 {TL(k.fark)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Toplam</td>
                <td className="mh-tutar-cell">{TL(kpi.toplamHakedis)}</td>
                <td colSpan={2}></td>
                <td className="mh-tutar-cell">{TL(kpi.toplamFark)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}

// ================== 2) GELİRLER / SATIŞLAR ==================
// Giderler tarafıyla simetrik üç alt sekme: kendi kayıtlarımız, bankaya fiilen
// yatanlar ve ikisi arasındaki farkın çözüldüğü hakediş havuzu.
function GelirlerSekmesi({ showToast }) {
  const [altTab, setAltTab] = useState('gunsonu');
  return (
    <div className="mh-yeni">
      <div className="mh-alt-tabs">
        <button className={altTab === 'gunsonu' ? 'active' : ''} onClick={() => setAltTab('gunsonu')}>
          🧾 Gün Sonu Kayıtları
        </button>
        <button className={altTab === 'hakedis' ? 'active' : ''} onClick={() => setAltTab('hakedis')}>
          ⚖️ Ciro & Hakediş Eşleştirme
        </button>
      </div>

      {altTab === 'gunsonu' && <GunSonuKayitlariTablosu />}
      {altTab === 'hakedis' && <HakedisEslestirmeAltSekmesi showToast={showToast} />}
    </div>
  );
}

function SatislarAltSekmesi({ showToast }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kategoriFiltre, setKategoriFiltre] = useState('tumu');
  const [tarihFiltre, setTarihFiltre] = useState('buAy');
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [xmlModalAcik, setXmlModalAcik] = useState(false);

  async function yukle() {
    setLoading(true);
    try {
      const res = await fetch('/api/muhasebe?resource=gelirler');
      const json = await res.json();
      setKayitlar(json.records || []);
    } catch {
      showToast('Gelirler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { yukle(); }, []);

  const filtreli = useMemo(() => {
    return kayitlar
      .filter((k) => kategoriFiltre === 'tumu' || k.kategori === kategoriFiltre)
      .filter((k) => tarihAraliktaMi(k.tarih, tarihFiltre))
      .sort((a, b) => (trTarihiCoz(b.tarih)?.getTime() || 0) - (trTarihiCoz(a.tarih)?.getTime() || 0));
  }, [kayitlar, kategoriFiltre, tarihFiltre]);

  const kpi = useMemo(() => {
    const buAyKayitlar = kayitlar.filter((k) => tarihAraliktaMi(k.tarih, 'buAy'));
    const toplamResmi = buAyKayitlar.reduce((s, k) => s + k.tutar, 0);
    const kurumsalBekleyen = buAyKayitlar
      .filter((k) => k.kategori === 'Kurumsal Satış / Catering Faturası' && k.tahsilatDurumu === 'Tahsilat Bekliyor')
      .reduce((s, k) => s + k.tutar, 0);
    const yemekKartiBekleyen = buAyKayitlar
      .filter((k) => k.kategori === 'Yemek Kartı Şirket Faturası' && k.tahsilatDurumu === 'Tahsilat Bekliyor')
      .reduce((s, k) => s + k.tutar, 0);
    return { toplamResmi, kurumsalBekleyen, yemekKartiBekleyen };
  }, [kayitlar]);

  const dipToplam = useMemo(() => filtreli.reduce((s, k) => s + k.tutar, 0), [filtreli]);

  async function tahsilDurumuDegistir(kayit, yeniDurum) {
    try {
      await fetch('/api/muhasebe?resource=gelirler', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kayit.id, tahsilatDurumu: yeniDurum }),
      });
      setKayitlar((prev) => prev.map((k) => (k.id === kayit.id ? { ...k, tahsilatDurumu: yeniDurum } : k)));
      showToast(yeniDurum === 'Tahsil Edildi' ? 'Tahsil edildi olarak işaretlendi' : 'Tahsilat geri alındı');
    } catch {
      showToast('Güncellenemedi');
    }
  }

  return (
    <>
      <div className="mh-kpi-row">
        <div className="mh-kpi-card">
          <span className="mh-kpi-label">Bu Ay Kesilen Resmi Faturalar</span>
          <span className="mh-kpi-value">{TL(kpi.toplamResmi)}</span>
        </div>
        <div className="mh-kpi-card mh-kpi-warning">
          <span className="mh-kpi-label">Tahsil Edilecek Kurumsal Alacaklar</span>
          <span className="mh-kpi-value">{TL(kpi.kurumsalBekleyen)}</span>
        </div>
        <div className="mh-kpi-card mh-kpi-warning">
          <span className="mh-kpi-label">Yemek Kartı Bekleyen Tahsilat</span>
          <span className="mh-kpi-value">{TL(kpi.yemekKartiBekleyen)}</span>
        </div>
      </div>

      <div className="mh-actionbar">
        <div className="mh-date-pills">
          <button className={tarihFiltre === 'buAy' ? 'active' : ''} onClick={() => setTarihFiltre('buAy')}>Bu Ay</button>
          <button className={tarihFiltre === 'gecenAy' ? 'active' : ''} onClick={() => setTarihFiltre('gecenAy')}>Geçen Ay</button>
          <button className={tarihFiltre === 'tumu' ? 'active' : ''} onClick={() => setTarihFiltre('tumu')}>Tümü</button>
        </div>
        <div className="mh-actions">
          <button className="mh-secondary-btn" onClick={() => setXmlModalAcik(true)}><Upload size={15} /> XML Fatura Yükle</button>
          <button className="mh-primary-btn" onClick={() => setDrawerAcik(true)}><Plus size={15} /> Yeni Satış Faturası</button>
        </div>
      </div>

      <div className="mh-filter-pills">
        <button className={kategoriFiltre === 'tumu' ? 'active' : ''} onClick={() => setKategoriFiltre('tumu')}>Tümü</button>
        {GELIR_KATEGORILERI.map((k) => (
          <button key={k} className={kategoriFiltre === k ? 'active' : ''} onClick={() => setKategoriFiltre(k)}>{k}</button>
        ))}
      </div>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : filtreli.length === 0 ? (
          <p className="mh-empty">Bu filtrede kayıt yok.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Tarih</th><th>Kategori</th><th>Müşteri / Firma Adı</th><th>Fatura No</th><th>Tutar (TL)</th><th>Vade / Durum</th><th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtreli.map((k) => (
                <tr key={k.id}>
                  <td>{k.tarih}</td>
                  <td><span className="mh-badge mh-badge-mor">{k.kategori}</span></td>
                  <td>{k.musteriFirma}</td>
                  <td>{k.faturaNo || '-'}</td>
                  <td className="mh-tutar-cell">{TL(k.tutar)}</td>
                  <td>
                    {k.tahsilatDurumu === 'Tahsilat Bekliyor'
                      ? <span className="mh-durum mh-durum-kirmizi">🔴 Tahsilat Bekliyor{k.vadeTarihi ? ` (Vade: ${k.vadeTarihi})` : ''}</span>
                      : <span className="mh-durum mh-durum-yesil">🟢 Tahsil Edildi</span>}
                  </td>
                  <td>
                    {k.tahsilatDurumu === 'Tahsilat Bekliyor'
                      ? <button className="mh-mini-btn" onClick={() => tahsilDurumuDegistir(k, 'Tahsil Edildi')}>Tahsil Et</button>
                      : <button className="mh-mini-btn mh-mini-btn-ghost" title="Tahsilatı geri al" onClick={() => tahsilDurumuDegistir(k, 'Tahsilat Bekliyor')}>Geri Al</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Toplam</td>
                <td className="mh-tutar-cell">{TL(dipToplam)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {drawerAcik && (
        <GelirDrawer
          onClose={() => setDrawerAcik(false)}
          onSaved={(rec) => { setKayitlar((prev) => [rec, ...prev]); setDrawerAcik(false); showToast('Gelir faturası kaydedildi'); }}
        />
      )}

      {xmlModalAcik && (
        <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={() => { setXmlModalAcik(false); yukle(); }}>
          <div className="mh-modal-wide mh-modal-xxl" onClick={(e) => e.stopPropagation()}>
            <div className="mh-drawer-head">
              <span>XML Fatura Yükle</span>
              <button onClick={() => { setXmlModalAcik(false); yukle(); }}><X size={18} /></button>
            </div>
            <div className="mh-drawer-body">
              <FaturaXmlIce showToast={showToast} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// api/gunsonu.js'teki ciro objesinde toplam alanı YOK, sadece nakit/kart/yemek/cari
// kırılımı var — toplam ciro bu dördünün toplamı olarak burada hesaplanıyor.
function ciroToplam(ciro) {
  if (!ciro) return 0;
  return (Number(ciro.nakit) || 0) + (Number(ciro.kart) || 0) + (Number(ciro.yemek) || 0) + (Number(ciro.cari) || 0);
}

// Sadece görüntüleme — veri girişi mevcut "Gün Sonu Al" ekranından (api/gunsonu.js) devam
// ediyor, buradan yeni kayıt girilmez. Tasarım 8 Eylül'de netleşti: Yıl/Ay/Gün filtresi
// (varsayılan bu ay), detay JSON alanları küçük butonla açılıyor, altta filtrelenmiş
// toplam satırı var.
function GunSonuKayitlariTablosu() {
  const [kayitlar, setKayitlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState(false);
  const [detay, setDetay] = useState(null); // { tip, kayit }

  const simdi = new Date();
  const [yilFiltre, setYilFiltre] = useState(String(simdi.getFullYear()));
  const [ayFiltre, setAyFiltre] = useState(String(simdi.getMonth() + 1));
  const [gunFiltre, setGunFiltre] = useState('tumu');

  async function veriYukle() {
    setLoading(true);
    setHata(false);
    for (let deneme = 0; deneme < 2; deneme++) {
      try {
        const res = await fetch('/api/gunsonu');
        if (!res.ok) throw new Error('http ' + res.status);
        const json = await res.json();
        setKayitlar(json.records || []);
        setLoading(false);
        return;
      } catch {
        if (deneme === 0) await new Promise((r) => setTimeout(r, 1200));
      }
    }
    setHata(true);
    setLoading(false);
  }

  useEffect(() => { veriYukle(); }, []);

  const yillar = useMemo(() => {
    const s = new Set(kayitlar.map((k) => trTarihiCoz(k.tarih)?.getFullYear()).filter(Boolean));
    s.add(simdi.getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [kayitlar]);

  const filtreli = useMemo(() => {
    return kayitlar.filter((k) => {
      const d = trTarihiCoz(k.tarih);
      if (!d) return false;
      if (yilFiltre !== 'tumu' && d.getFullYear() !== Number(yilFiltre)) return false;
      if (ayFiltre !== 'tumu' && d.getMonth() + 1 !== Number(ayFiltre)) return false;
      if (gunFiltre !== 'tumu' && d.getDate() !== Number(gunFiltre)) return false;
      return true;
    }).sort((a, b) => (trTarihiCoz(b.tarih)?.getTime() || 0) - (trTarihiCoz(a.tarih)?.getTime() || 0));
  }, [kayitlar, yilFiltre, ayFiltre, gunFiltre]);

  const toplam = useMemo(() => filtreli.reduce((acc, k) => {
    acc.nakit += k.toplamNakitPara || 0;
    acc.pos += k.posToplam || 0;
    acc.anaKasa += k.anaKasaToplam || 0;
    acc.anaKasaHarcama += (k.anaKasaHarcamalar || []).reduce((s, x) => s + (Number(x.tutar) || 0), 0);
    acc.gunlukKasaHarcama += (k.gunlukKasaHarcamalar || []).reduce((s, x) => s + (Number(x.tutar) || 0), 0);
    acc.cari += k.cariToplam || 0;
    acc.yemek += k.genelYemekToplami || 0;
    acc.ciro += ciroToplam(k.ciro);
    return acc;
  }, { nakit: 0, pos: 0, anaKasa: 0, anaKasaHarcama: 0, gunlukKasaHarcama: 0, cari: 0, yemek: 0, ciro: 0 }), [filtreli]);

  function detayAc(tip, kayit) { setDetay({ tip, kayit }); }

  return (
    <div className="mh-gunsonu-blok">
      <div className="mh-filter-pills">
        <select className="mh-tabbable" value={yilFiltre} onChange={(e) => setYilFiltre(e.target.value)}>
          {yillar.map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="tumu">Tüm Yıllar</option>
        </select>
        <select className="mh-tabbable" value={ayFiltre} onChange={(e) => setAyFiltre(e.target.value)}>
          <option value="tumu">Tüm Aylar</option>
          {AY_ADLARI.map((ad, i) => <option key={i} value={i + 1}>{ad}</option>)}
        </select>
        <select className="mh-tabbable" value={gunFiltre} onChange={(e) => setGunFiltre(e.target.value)}>
          <option value="tumu">Tüm Günler</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : hata ? (
          <p className="mh-empty">
            Kayıtlar yüklenemedi (geçici bir bağlantı sorunu olabilir).{' '}
            <button className="mh-secondary-btn small" onClick={veriYukle}>Tekrar Dene</button>
          </p>
        ) : filtreli.length === 0 ? (
          <p className="mh-empty">Bu filtrede gün sonu kaydı yok.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Yıl</th><th>Ay</th><th>Gün</th><th>Saat</th>
                <th>Nakit</th><th>POS</th><th>Ana Kasa</th><th>Ana Kasa Harc.</th>
                <th>Günlük Kasa Harc.</th><th>Cari</th><th>Yemek Kartı</th><th>Ciro</th><th>Ana Kasa Takibi</th>
              </tr>
            </thead>
            <tbody>
              {filtreli.map((k) => {
                const d = trTarihiCoz(k.tarih);
                const anaKasaHarcTop = (k.anaKasaHarcamalar || []).reduce((s, x) => s + (Number(x.tutar) || 0), 0);
                const gunlukKasaHarcTop = (k.gunlukKasaHarcamalar || []).reduce((s, x) => s + (Number(x.tutar) || 0), 0);
                return (
                  <tr key={k.tarih}>
                    <td>{d ? d.getFullYear() : '-'}</td>
                    <td>{d ? AY_ADLARI[d.getMonth()] : '-'}</td>
                    <td>{d ? d.getDate() : '-'}</td>
                    <td>{k.kaydedenSaat || '-'}</td>
                    <td className="mh-tutar-cell">{TL(k.toplamNakitPara || 0)}</td>
                    <td className="mh-tutar-cell">{TL(k.posToplam || 0)}</td>
                    <td className="mh-tutar-cell">{TL(k.anaKasaToplam || 0)}</td>
                    <td className="mh-tutar-cell">
                      {TL(anaKasaHarcTop)}
                      {anaKasaHarcTop > 0 && <button className="mh-mini-btn mh-mini-btn-ghost" onClick={() => detayAc('anaKasaHarcamalar', k)}>detay</button>}
                    </td>
                    <td className="mh-tutar-cell">
                      {TL(gunlukKasaHarcTop)}
                      {gunlukKasaHarcTop > 0 && <button className="mh-mini-btn mh-mini-btn-ghost" onClick={() => detayAc('gunlukKasaHarcamalar', k)}>detay</button>}
                    </td>
                    <td className="mh-tutar-cell">
                      {TL(k.cariToplam || 0)}
                      {k.cariToplam > 0 && <button className="mh-mini-btn mh-mini-btn-ghost" onClick={() => detayAc('cariDetay', k)}>detay</button>}
                    </td>
                    <td className="mh-tutar-cell">
                      {TL(k.genelYemekToplami || 0)}
                      {k.genelYemekToplami > 0 && <button className="mh-mini-btn mh-mini-btn-ghost" onClick={() => detayAc('yemekDetay', k)}>detay</button>}
                    </td>
                    <td className="mh-tutar-cell">{TL(ciroToplam(k.ciro))}</td>
                    <td className="mh-tutar-cell">
                      {k.anaKasaTakibi ? <button className="mh-mini-btn mh-mini-btn-ghost" onClick={() => detayAc('anaKasaTakibi', k)}>detay</button> : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Toplam</td>
                <td className="mh-tutar-cell">{TL(toplam.nakit)}</td>
                <td className="mh-tutar-cell">{TL(toplam.pos)}</td>
                <td className="mh-tutar-cell">{TL(toplam.anaKasa)}</td>
                <td className="mh-tutar-cell">{TL(toplam.anaKasaHarcama)}</td>
                <td className="mh-tutar-cell">{TL(toplam.gunlukKasaHarcama)}</td>
                <td className="mh-tutar-cell">{TL(toplam.cari)}</td>
                <td className="mh-tutar-cell">{TL(toplam.yemek)}</td>
                <td className="mh-tutar-cell">{TL(toplam.ciro)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {detay && <GunSonuDetayModal tip={detay.tip} kayit={detay.kayit} onClose={() => setDetay(null)} />}
    </div>
  );
}

function GunSonuDetayModal({ tip, kayit, onClose }) {
  const basliklar = {
    anaKasaHarcamalar: 'Ana Kasa Harcamaları',
    gunlukKasaHarcamalar: 'Günlük Kasa Harcamaları',
    cariDetay: 'Cari Detay',
    yemekDetay: 'Yemek Kartı Detay',
    anaKasaTakibi: 'Ana Kasa Takibi',
  };

  function icerik() {
    if (tip === 'anaKasaHarcamalar' || tip === 'gunlukKasaHarcamalar') {
      const liste = kayit[tip] || [];
      return (
        <table className="mh-excel-table">
          <thead><tr><th>Ad</th><th>Tutar</th></tr></thead>
          <tbody>
            {liste.filter((x) => x.ad).map((x, i) => (
              <tr key={i}><td>{x.ad}</td><td className="mh-tutar-cell">{TL(Number(x.tutar) || 0)}</td></tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (tip === 'cariDetay') {
      const detayObj = kayit.cariDetay || {};
      const sabitler = Object.entries(detayObj.sabitler || {});
      const ekstra = detayObj.ekstra || [];
      return (
        <table className="mh-excel-table">
          <thead><tr><th>Ad</th><th>Tutar</th></tr></thead>
          <tbody>
            {sabitler.map(([ad, tutar]) => (
              <tr key={ad}><td>{ad}</td><td className="mh-tutar-cell">{TL(Number(tutar) || 0)}</td></tr>
            ))}
            {ekstra.filter((x) => x.ad).map((x, i) => (
              <tr key={'ek' + i}><td>{x.ad}</td><td className="mh-tutar-cell">{TL(Number(x.tutar) || 0)}</td></tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (tip === 'yemekDetay') {
      const detayObj = kayit.yemekDetay || {};
      const kolonlar = detayObj.kolonlar || [];
      const tutarlar = detayObj.tutarlar || {};
      return (
        <table className="mh-excel-table">
          <thead><tr><th>Marka</th>{kolonlar.map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>
            {Object.entries(tutarlar).map(([marka, satir]) => (
              <tr key={marka}>
                <td>{marka}</td>
                {kolonlar.map((k) => <td key={k} className="mh-tutar-cell">{satir[k] ? TL(Number(satir[k]) || 0) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (tip === 'anaKasaTakibi') {
      const t = kayit.anaKasaTakibi || {};
      return (
        <table className="mh-excel-table">
          <tbody>
            <tr><td>Dünden Devir</td><td className="mh-tutar-cell">{TL(Number(t.dundenDevir) || 0)}</td></tr>
            <tr><td>Bugünkü Nakit</td><td className="mh-tutar-cell">{TL(Number(t.bugunkuNakit) || 0)}</td></tr>
            <tr><td>Ana Kasa Harcama</td><td className="mh-tutar-cell">{TL(Number(t.anaKasaHarcama) || 0)}</td></tr>
            <tr><td>Yarına Devir</td><td className="mh-tutar-cell">{TL(Number(t.yarinaDevir) || 0)}</td></tr>
          </tbody>
        </table>
      );
    }
    return null;
  }

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="mh-drawer-head">
          <span>{basliklar[tip]} — {kayit.tarih}</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mh-drawer-body">{icerik()}</div>
      </div>
    </div>
  );
}

function GelirDrawer({ onClose, onSaved }) {
  const [form, setForm] = useState({
    kategori: '', musteriFirma: '', faturaNo: '', tutar: '', kdvOrani: '%20',
    tarih: bugunInputISO(), vadeTarihi: '', tahsilatDurumu: 'Tahsilat Bekliyor',
  });
  const [saving, setSaving] = useState(false);

  async function kaydet() {
    if (!form.kategori || !form.musteriFirma || !form.tutar) return;
    setSaving(true);
    try {
      const res = await fetch('/api/muhasebe?resource=gelirler', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarih: inputISOtoTr(form.tarih), kategori: form.kategori, musteriFirma: form.musteriFirma,
          faturaNo: form.faturaNo, tutar: ondalikParse(form.tutar), kdvOrani: form.kdvOrani,
          vadeTarihi: inputISOtoTr(form.vadeTarihi), tahsilatDurumu: form.tahsilatDurumu,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'save failed');
      onSaved(json.record);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="mh-drawer-overlay" onClick={onClose}>
      <div className="mh-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mh-drawer-head">
          <span>Yeni Satış Faturası Ekle</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mh-drawer-body mh-drawer-2col">
          <div className="mh-field">
            <label>Müşteri / Cari</label>
            <input className="mh-tabbable" value={form.musteriFirma} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false"
              onChange={(e) => setForm((p) => ({ ...p, musteriFirma: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Kategori</label>
            <select className="mh-tabbable" value={form.kategori} onChange={(e) => setForm((p) => ({ ...p, kategori: e.target.value }))} onKeyDown={handleTabEnter}>
              <option value="">Seçiniz</option>
              {GELIR_KATEGORILERI.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="mh-field">
            <label>Fatura / Belge No</label>
            <input className="mh-tabbable" value={form.faturaNo} onChange={(e) => setForm((p) => ({ ...p, faturaNo: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Toplam Tutar (TL)</label>
            <input className="mh-tabbable" value={form.tutar} onChange={(e) => setForm((p) => ({ ...p, tutar: e.target.value }))} onKeyDown={handleTabEnter} inputMode="decimal" />
          </div>
          <div className="mh-field">
            <label>KDV Oranı</label>
            <select className="mh-tabbable" value={form.kdvOrani} onChange={(e) => setForm((p) => ({ ...p, kdvOrani: e.target.value }))} onKeyDown={handleTabEnter}>
              <option value="%1">%1</option><option value="%10">%10</option><option value="%20">%20</option>
            </select>
          </div>
          <div className="mh-field">
            <label>Fatura Tarihi</label>
            <input className="mh-tabbable" type="date" value={form.tarih} onChange={(e) => setForm((p) => ({ ...p, tarih: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Vade Tarihi</label>
            <input className="mh-tabbable" type="date" value={form.vadeTarihi} onChange={(e) => setForm((p) => ({ ...p, vadeTarihi: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Tahsilat Durumu</label>
            <select className="mh-tabbable" value={form.tahsilatDurumu} onChange={(e) => setForm((p) => ({ ...p, tahsilatDurumu: e.target.value }))} onKeyDown={handleTabEnter}>
              <option value="Tahsilat Bekliyor">Tahsilat Bekliyor</option>
              <option value="Tahsil Edildi">Tahsil Edildi</option>
            </select>
          </div>
        </div>
        <div className="mh-drawer-foot">
          <button className="mh-primary-btn" disabled={saving || !form.kategori || !form.musteriFirma || !form.tutar || !form.tarih} onClick={kaydet}>
            <Check size={15} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

// ================== 3) TOPTANCILAR VE CARİ TAKİP ==================
// Artık sadece "Fatura Firmaları" sheet'indeki firmalar listelenir.
// Bakiye = Fatura ve Fişler toplamı − Tahsilat Makbuzları toplamı (backend hesaplar).
// Ekstre: fatura+tahsilat girişleri koşu bakiyesiyle, en yeniden eskiye.
function ToptancilarCariSekmesi({ showToast }) {
  const [firmalar, setFirmalar] = useState([]); // { firmaAdi, bakiye, durum, giderKategorisi }
  const [faturaKayitlari, setFaturaKayitlari] = useState([]);
  const [tahsilatlar, setTahsilatlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [arama, setArama] = useState('');
  const [durumFiltre, setDurumFiltre] = useState('tumu');
  const [ekstreFirma, setEkstreFirma] = useState(null);

  async function yukle() {
    setLoading(true);
    try {
      const res = await fetch('/api/muhasebe?resource=faturaFis');
      const j = await res.json();
      setFirmalar(j.firmalar || []);
      setFaturaKayitlari(j.records || []);
      // tahsilatları da çek
      const tRes = await fetch('/api/muhasebe?resource=tahsilat');
      const tJ = await tRes.json();
      setTahsilatlar(tJ.records || []);
    } catch { showToast('Veriler yüklenemedi'); }
    finally { setLoading(false); }
  }
  useEffect(() => { yukle(); }, []);

  const filtreli = useMemo(() => {
    return firmalar.filter(f => {
      if (arama && !f.firmaAdi.toLocaleLowerCase('tr').includes(arama.toLocaleLowerCase('tr'))) return false;
      if (durumFiltre === 'borclu' && f.bakiye <= 0) return false;
      if (durumFiltre === 'alacakli' && f.bakiye >= 0) return false;
      return true;
    });
  }, [firmalar, arama, durumFiltre]);

  const kpi = useMemo(() => {
    const toplamBorc = firmalar.filter(f => f.bakiye > 0.01).reduce((s, f) => s + f.bakiye, 0);
    const toplamAlacak = firmalar.filter(f => f.bakiye < -0.01).reduce((s, f) => s + Math.abs(f.bakiye), 0);
    const borcluSayisi = firmalar.filter(f => f.bakiye > 0.01).length;
    const alacakliSayisi = firmalar.filter(f => f.bakiye < -0.01).length;
    return { toplamBorc, toplamAlacak, borcluSayisi, alacakliSayisi, net: toplamBorc - toplamAlacak };
  }, [firmalar]);

  return (
    <div className="mh-yeni">

      {/* KPI Kartları */}
      <div className="mh-kpi-row" style={{marginBottom: 16, gridTemplateColumns:'1fr 1fr 1fr'}}>
        <div className="mh-kpi-card mh-kpi-danger">
          <span className="mh-kpi-label">Toplam Borç</span>
          <span className="mh-kpi-value">{TL(kpi.toplamBorc)}</span>
          <span className="mh-kpi-alt">{kpi.borcluSayisi} firma borçlu</span>
        </div>
        <div className="mh-kpi-card" style={{borderColor:'rgba(46,139,87,.3)', background:'rgba(46,139,87,.05)'}}>
          <span className="mh-kpi-label">Toplam Alacak</span>
          <span className="mh-kpi-value" style={{color:'#2E8B57'}}>{TL(kpi.toplamAlacak)}</span>
          <span className="mh-kpi-alt">{kpi.alacakliSayisi} firma alacaklı</span>
        </div>
        <div className={`mh-kpi-card ${kpi.net > 0.01 ? 'mh-kpi-danger' : kpi.net < -0.01 ? '' : ''}`}
          style={kpi.net < -0.01 ? {borderColor:'rgba(46,139,87,.3)', background:'rgba(46,139,87,.05)'} : {}}>
          <span className="mh-kpi-label">Net Pozisyon</span>
          <span className="mh-kpi-value" style={{color: kpi.net > 0.01 ? '#C0392B' : kpi.net < -0.01 ? '#2E8B57' : '#83786B'}}>
            {kpi.net > 0.01 ? `−${TL(kpi.net)}` : kpi.net < -0.01 ? `+${TL(Math.abs(kpi.net))}` : '0 ₺'}
          </span>
          <span className="mh-kpi-alt">
            {kpi.net > 0.01 ? 'Net borçlusunuz' : kpi.net < -0.01 ? 'Net alacaklısınız' : 'Sıfır bakiye'}
          </span>
        </div>
      </div>

      {/* Arama + Filtre Barı */}
      <div className="tc-arama-bar">
        <div className="tc-arama-input-wrap">
          <Search size={14} className="tc-arama-ikon" />
          <input
            className="tc-arama-input"
            placeholder="Firma adı ara…"
            value={arama}
            onChange={e => setArama(e.target.value)}
          />
        </div>
        <div className="mh-filter-pills">
          {[['tumu','Tümü'],['borclu','Borçlu'],['alacakli','Alacaklı']].map(([k,l]) => (
            <button key={k} className={durumFiltre===k ? 'active' : ''} onClick={() => setDurumFiltre(k)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <p className="mh-empty">Yükleniyor…</p> : filtreli.length === 0 ? (
        <p className="mh-empty">Kayıtlı firma yok. Fatura ve Fiş Girişi'nden firma ekleyin.</p>
      ) : (
        <div className="mh-table-card">
          <table className="mh-excel-table">
            <thead>
              <tr><th>Firma</th><th>Kategori</th><th>Durum</th><th>Bakiye</th><th></th></tr>
            </thead>
            <tbody>
              {filtreli.map(f => (
                <tr key={f.firmaAdi}>
                  <td>{f.firmaAdi}</td>
                  <td>{f.giderKategorisi || '—'}</td>
                  <td>
                    <span className={`mh-durum ${f.bakiye > 0.01 ? 'mh-durum-kirmizi' : f.bakiye < -0.01 ? 'mh-durum-yesil' : 'mh-durum-notr'}`}>
                      {f.bakiye > 0.01 ? 'Borçlu' : f.bakiye < -0.01 ? 'Alacaklı' : 'Alacak/Borç Yok'}
                    </span>
                  </td>
                  <td className="mh-tutar-cell">
                    {f.bakiye > 0.01 ? TL(f.bakiye) : f.bakiye < -0.01 ? TL(Math.abs(f.bakiye)) : '0 ₺'}
                  </td>
                  <td>
                    <button className="mh-mini-btn" onClick={() => setEkstreFirma(f)}>Ekstre</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ekstreFirma && (
        <ToptanciEkstreModal
          firma={ekstreFirma}
          faturaKayitlari={faturaKayitlari.filter(k => k.firmaAdi === ekstreFirma.firmaAdi)}
          tahsilatlar={tahsilatlar.filter(t => t.firmaAdi === ekstreFirma.firmaAdi)}
          onClose={() => setEkstreFirma(null)}
        />
      )}
    </div>
  );
}

function ToptanciEkstreModal({ firma, faturaKayitlari, tahsilatlar, onClose }) {
  // Fatura ve tahsilat hareketlerini birleştir, en yeniden eskiye sırala
  const hareketler = useMemo(() => {
    const faturalar = faturaKayitlari.map(k => ({
      id: k.id, tarih: k.tarih, tur: 'fatura',
      aciklama: `${k.faturaNo ? k.faturaNo + ' — ' : ''}${k.aciklama || k.giderKategorisi || 'Fatura'}`,
      tutar: k.faturaTutari,
    }));
    const odemeler = tahsilatlar.map(t => ({
      id: t.id, tarih: t.tarih, tur: 'odeme',
      aciklama: `${t.faturaNo ? t.faturaNo + ' — ' : ''}${t.aciklama || t.odemeTuru || 'Ödeme'}`,
      tutar: t.tutar,
    }));
    return [...faturalar, ...odemeler].sort((a, b) => {
      // DD.MM.YYYY → karşılaştırılabilir
      const ts = s => { const m = String(s||'').match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}${m[2]}${m[1]}` : ''; };
      return ts(b.tarih).localeCompare(ts(a.tarih));
    });
  }, [faturaKayitlari, tahsilatlar]);

  // Koşu bakiyesi: yukarıdan aşağıya (en yeni → en eski) koşu bakiyesi hesaplanır.
  // En son hareketlerden geriye doğru gidilir — önce son bakiyeden başla, geri hesapla.
  const toplamBakiye = faturaKayitlari.reduce((s, k) => s + k.faturaTutari, 0)
    - tahsilatlar.reduce((s, t) => s + t.tutar, 0);

  let kosuBakiye = toplamBakiye;
  const satirlar = hareketler.map(h => {
    const satir = { ...h, kosuBakiye };
    kosuBakiye = h.tur === 'fatura' ? kosuBakiye - h.tutar : kosuBakiye + h.tutar;
    return satir;
  });

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" style={{maxWidth:660}} onClick={e => e.stopPropagation()}>
        <div className="mh-drawer-head">
          <span>{firma.firmaAdi} — Cari Hareketler</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mh-drawer-body">
          <div style={{marginBottom:10,display:'flex',justifyContent:'flex-end',gap:16,fontSize:13}}>
            <span>Toplam Bakiye:</span>
            <strong className={toplamBakiye > 0.01 ? 'ff-borc' : toplamBakiye < -0.01 ? 'ff-alacak' : ''}>
              {toplamBakiye > 0.01 ? 'Borçlu' : toplamBakiye < -0.01 ? 'Alacaklı' : 'Alacak/Borç Yok'} — {TL(Math.abs(toplamBakiye))}
            </strong>
          </div>
          {satirlar.length === 0 ? <p className="mh-empty">Hiç hareket yok.</p> : (
            <table className="mh-excel-table">
              <thead>
                <tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th>Tutar</th><th>Koşu Bakiye</th></tr>
              </thead>
              <tbody>
                {satirlar.map(h => (
                  <tr key={h.id}>
                    <td>{h.tarih}</td>
                    <td>
                      <span className={`mh-durum ${h.tur === 'fatura' ? 'mh-durum-kirmizi' : 'mh-durum-yesil'}`}>
                        {h.tur === 'fatura' ? 'Borç (+)' : 'Ödeme (−)'}
                      </span>
                    </td>
                    <td>{h.aciklama}</td>
                    <td className="mh-tutar-cell">
                      {h.tur === 'fatura' ? `+${TL(h.tutar)}` : `−${TL(h.tutar)}`}
                    </td>
                    <td className={`mh-tutar-cell ${h.kosuBakiye > 0.01 ? 'ff-borc' : h.kosuBakiye < -0.01 ? 'ff-alacak' : ''}`}>
                      {TL(Math.abs(h.kosuBakiye))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ================== 4) ORTAKLAR CARİ TAKİP ==================
// Bu sayfaya girilen hiçbir işlem dükkanın operasyonel P&L'ini etkilemez — ayrı defter.
// yon='cekim': ortağa ödendi/şahsi çekim -> borcu (bize olan) artar, bakiye azalır.
// yon='yatirim': ortak dükkana cepten ödedi/sermaye ekledi -> alacağı artar, bakiye artar.
function OrtaklarCariSekmesi({ showToast }) {
  const [hareketler, setHareketler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ortakFiltre, setOrtakFiltre] = useState('tumu');
  const [drawerAcik, setDrawerAcik] = useState(false);

  async function yukle() {
    setLoading(true);
    try {
      const res = await fetch('/api/muhasebe?resource=ortakHareket');
      const json = await res.json();
      setHareketler(json.records || []);
    } catch {
      showToast('Ortak hareketleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { yukle(); }, []);

  // Her ortak için kronolojik bakiye: yatirim +, cekim -.
  const ortakBakiye = useMemo(() => {
    const map = {};
    ORTAKLAR.forEach((o) => { map[o] = { ad: o, bakiye: 0, sonIslem: null, sonIslemTs: 0 }; });
    const kronolojik = [...hareketler].sort((a, b) => (trTarihiCoz(a.tarih)?.getTime() || 0) - (trTarihiCoz(b.tarih)?.getTime() || 0));
    kronolojik.forEach((h) => {
      const rec = map[h.ortakAdi];
      if (!rec) return;
      rec.bakiye += h.yon === 'yatirim' ? h.tutar : -h.tutar;
      const ts = trTarihiCoz(h.tarih)?.getTime() || 0;
      if (ts >= rec.sonIslemTs) { rec.sonIslemTs = ts; rec.sonIslem = h; }
    });
    return map;
  }, [hareketler]);

  const filtreliHareketler = useMemo(() => {
    return hareketler
      .filter((h) => ortakFiltre === 'tumu' || h.ortakAdi === ortakFiltre)
      .sort((a, b) => (trTarihiCoz(b.tarih)?.getTime() || 0) - (trTarihiCoz(a.tarih)?.getTime() || 0));
  }, [hareketler, ortakFiltre]);

  function dekontGonder(h) {
    const bakiye = ortakBakiye[h.ortakAdi]?.bakiye || 0;
    const metin = `🧾 *PERPA SANDVİÇ - İÇ KASA DEKONTU*\n🗓 *Tarih:* ${h.tarih}\n👤 *Ortak:* ${h.ortakAdi}\n📝 *İşlem:* ${h.islemTuru}\n💰 *Tutar:* ${TL(h.tutar)}\n📊 *Güncel Alacak Bakiyeniz:* ${TL(bakiye)}`;
    const url = `https://wa.me/?text=${encodeURIComponent(metin)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="mh-yeni">
      <div className="mh-kpi-row mh-kpi-row-2">
        {ORTAKLAR.map((o) => {
          const rec = ortakBakiye[o];
          return (
            <div key={o} className="mh-kpi-card mh-partner-card">
              <span className="mh-kpi-label">{o}</span>
              <span className="mh-kpi-value">{TL(rec.bakiye)}</span>
              <span className={`mh-durum ${rec.bakiye >= 0 ? 'mh-durum-yesil' : 'mh-durum-kirmizi'}`}>
                {rec.bakiye >= 0 ? '🟢 Alacaklı' : '🔴 Borçlu'}
              </span>
              {rec.sonIslem && (
                <span className="mh-partner-son-islem">Son İşlem: {rec.sonIslem.tarih} - {rec.sonIslem.islemTuru} ({TL(rec.sonIslem.tutar)})</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mh-actionbar">
        <div className="mh-filter-pills mh-filter-pills-inline">
          <button className={ortakFiltre === 'tumu' ? 'active' : ''} onClick={() => setOrtakFiltre('tumu')}>Tüm İşlemler</button>
          {ORTAKLAR.map((o) => (
            <button key={o} className={ortakFiltre === o ? 'active' : ''} onClick={() => setOrtakFiltre(o)}>{o}</button>
          ))}
        </div>
        <div className="mh-actions">
          <button className="mh-primary-btn" onClick={() => setDrawerAcik(true)}><Plus size={15} /> Ortak Hareketi Ekle</button>
        </div>
      </div>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : filtreliHareketler.length === 0 ? (
          <p className="mh-empty">Kayıt yok.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Tarih</th><th>Ortak</th><th>İşlem Türü</th><th>Açıklama</th>
                <th>Borç / Çekilen</th><th>Alacak / Yatan</th><th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {filtreliHareketler.map((h) => (
                <tr key={h.id}>
                  <td>{h.tarih}</td>
                  <td><strong>{h.ortakAdi}</strong></td>
                  <td>{h.islemTuru}</td>
                  <td>{h.aciklama || '-'}</td>
                  <td className="mh-tutar-cell">{h.yon === 'cekim' ? TL(h.tutar) : '-'}</td>
                  <td className="mh-tutar-cell">{h.yon === 'yatirim' ? TL(h.tutar) : '-'}</td>
                  <td>
                    <button className="mh-mini-btn" onClick={() => dekontGonder(h)}><MessageCircle size={13} /> Dekont Gönder</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerAcik && (
        <OrtakHareketDrawer
          onClose={() => setDrawerAcik(false)}
          onSaved={(rec) => { setHareketler((prev) => [rec, ...prev]); setDrawerAcik(false); showToast('Ortak hareketi kaydedildi'); }}
        />
      )}
    </div>
  );
}

function OrtakHareketDrawer({ onClose, onSaved }) {
  const [ortakAdi, setOrtakAdi] = useState(ORTAKLAR[0]);
  const [yon, setYon] = useState('cekim');
  const [islemTuru, setIslemTuru] = useState(ORTAK_ISLEM_TURLERI[0]);
  const [tutar, setTutar] = useState('');
  const [kasaBanka, setKasaBanka] = useState('Ana Kasa');
  const [tarih, setTarih] = useState(bugunInputISO());
  const [aciklama, setAciklama] = useState('');
  const [saving, setSaving] = useState(false);

  async function kaydet() {
    if (!ortakAdi || !tutar) return;
    setSaving(true);
    try {
      const res = await fetch('/api/muhasebe?resource=ortakHareket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ortakAdi, tarih: inputISOtoTr(tarih), islemTuru, yon, tutar: ondalikParse(tutar), kasaBanka, aciklama }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'save failed');
      onSaved(json.record);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="mh-drawer-overlay" onClick={onClose}>
      <div className="mh-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mh-drawer-head">
          <span>Ortak Hareket / Makbuz Ekle</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mh-drawer-body">
          <div className="mh-field">
            <label>Ortak</label>
            <select className="mh-tabbable" value={ortakAdi} onChange={(e) => setOrtakAdi(e.target.value)} onKeyDown={handleTabEnter}>
              {ORTAKLAR.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="mh-field">
            <label>İşlem Yönü</label>
            <select className="mh-tabbable" value={yon} onChange={(e) => setYon(e.target.value)} onKeyDown={handleTabEnter}>
              <option value="cekim">Ortağa Ödeme Yapıldı / Şahsi Çekim</option>
              <option value="yatirim">Ortak Dükkana Para Verdi / Cepten Ödedi</option>
            </select>
          </div>
          <div className="mh-field">
            <label>İşlem Türü</label>
            <select className="mh-tabbable" value={islemTuru} onChange={(e) => setIslemTuru(e.target.value)} onKeyDown={handleTabEnter}>
              {ORTAK_ISLEM_TURLERI.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="mh-field">
            <label>Tutar (TL)</label>
            <input className="mh-tabbable" value={tutar} onChange={(e) => setTutar(e.target.value)} onKeyDown={handleTabEnter} inputMode="decimal" />
          </div>
          <div className="mh-field">
            <label>Kasa / Banka</label>
            <select className="mh-tabbable" value={kasaBanka} onChange={(e) => setKasaBanka(e.target.value)} onKeyDown={handleTabEnter}>
              <option>Ana Kasa</option><option>Şirket Banka Hesabı</option>
            </select>
          </div>
          <div className="mh-field">
            <label>Tarih</label>
            <input className="mh-tabbable" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Açıklama</label>
            <textarea className="mh-tabbable" value={aciklama} onChange={(e) => setAciklama(e.target.value)} onKeyDown={handleTabEnter} />
          </div>
        </div>
        <div className="mh-drawer-foot">
          <button className="mh-primary-btn" disabled={saving || !ortakAdi || !tutar || !tarih} onClick={kaydet}>
            <Check size={15} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceteSekmesi({ showToast }) {
  const [urunler, setUrunler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aramaMetni, setAramaMetni] = useState('');
  const [seciliUrun, setSeciliUrun] = useState(null);
  const [receteHesap, setReceteHesap] = useState(null);
  const [receteYukleniyor, setReceteYukleniyor] = useState(false);

  const [malzemeler, setMalzemeler] = useState([]);
  const [kalemler, setKalemler] = useState([]);
  const [malzemeEkleAcik, setMalzemeEkleAcik] = useState(false);
  const [malzemeAramaMetni, setMalzemeAramaMetni] = useState('');
  const [yeniMalzemeModal, setYeniMalzemeModal] = useState(false);
  const [yeniMalzemeForm, setYeniMalzemeForm] = useState({ ad: '', birim: 'kg' });
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('products').select('id, ad, kategori, alt_kategori, fiyat').eq('durum', 'AKTIF').order('ad');
      setUrunler(data || []);
      setLoading(false);
    }
    load();
    fetch('/api/recete?resource=malzemeler').then((r) => r.json()).then((j) => setMalzemeler(j.records || [])).catch(() => {});
  }, []);

  const filtreliUrunler = useMemo(() => {
    const q = aramaMetni.toLocaleLowerCase('tr').trim();
    if (!q) return urunler;
    return urunler.filter((u) => u.ad.toLocaleLowerCase('tr').includes(q));
  }, [urunler, aramaMetni]);

  async function urunSec(u) {
    setSeciliUrun(u);
    setReceteHesap(null);
    setReceteYukleniyor(true);
    try {
      const res = await fetch(`/api/recete?resource=recete&urunId=${u.id}`);
      const json = await res.json();
      setReceteHesap(json);
      setKalemler((json.kalemler || []).map((k) => ({ malzemeId: k.malzemeId, malzemeAdi: k.malzemeAdi, miktar: k.miktar, birim: k.birim })));
    } catch {
      showToast('Reçete yüklenemedi');
    } finally {
      setReceteYukleniyor(false);
    }
  }

  function kalemMiktarGuncelle(idx, miktar) {
    setKalemler((prev) => prev.map((k, i) => (i === idx ? { ...k, miktar } : k)));
  }
  function kalemSil(idx) {
    setKalemler((prev) => prev.filter((_, i) => i !== idx));
  }
  function malzemeKalemeEkle(m) {
    if (kalemler.some((k) => k.malzemeId === m.id)) { showToast('Bu malzeme zaten reçetede'); return; }
    setKalemler((prev) => [...prev, { malzemeId: m.id, malzemeAdi: m.ad, miktar: '', birim: m.birim }]);
    setMalzemeEkleAcik(false);
    setMalzemeAramaMetni('');
  }

  async function yeniMalzemeKaydet() {
    if (!yeniMalzemeForm.ad.trim()) { showToast('Malzeme adı gerekli'); return; }
    try {
      const res = await fetch('/api/recete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'malzemeler', ...yeniMalzemeForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setMalzemeler((prev) => [...prev, json.record]);
      malzemeKalemeEkle(json.record);
      setYeniMalzemeModal(false);
      setYeniMalzemeForm({ ad: '', birim: 'kg' });
      showToast('Malzeme oluşturuldu');
    } catch {
      showToast('Malzeme oluşturulamadı');
    }
  }

  async function receteKaydet() {
    if (!seciliUrun) return;
    const gecerliKalemler = kalemler.filter((k) => k.malzemeId && ondalikParse(k.miktar) > 0);
    if (gecerliKalemler.length === 0) { showToast('En az bir malzeme + miktar girin'); return; }
    setKaydediliyor(true);
    try {
      const res = await fetch('/api/recete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'recete', urunId: seciliUrun.id, urunAdi: seciliUrun.ad, kalemler: gecerliKalemler }),
      });
      if (!res.ok) throw new Error();
      showToast('Reçete kaydedildi');
      urunSec(seciliUrun);
    } catch {
      showToast('Reçete kaydedilemedi');
    } finally {
      setKaydediliyor(false);
    }
  }

  const guncelMaliyet = receteHesap && !receteHesap.receteYok ? receteHesap.maliyet : null;
  const satisFiyati = seciliUrun ? Number(seciliUrun.fiyat) || 0 : 0;
  const brutKar = guncelMaliyet !== null ? satisFiyati - guncelMaliyet : null;
  const maliyetOrani = guncelMaliyet !== null && satisFiyati > 0 ? (guncelMaliyet / satisFiyati) * 100 : null;

  function durumRozeti(hesap) {
    if (!hesap) return null;
    if (hesap.receteYok) return <span className="rc-rozet rc-rozet-yok" title="Reçete Tanımlanmamış">⚠️</span>;
    if (hesap.eksikMalzemeler && hesap.eksikMalzemeler.length > 0) return <span className="rc-rozet rc-rozet-eksik" title="Maliyet Verisi Eksik">🔴</span>;
    return <span className="rc-rozet rc-rozet-tam" title="Maliyeti Güncel ve Eksiksiz">🟢</span>;
  }

  return (
    <div className="rc-shell">
      <div className="rc-col-left">
        <div className="rc-search">
          <Search size={14} />
          <input placeholder="Ürün ara..." value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
        </div>
        {loading && <p className="mh-empty">Yükleniyor...</p>}
        <div className="rc-urun-list">
          {filtreliUrunler.map((u) => (
            <button key={u.id} className={`rc-urun-row ${seciliUrun?.id === u.id ? 'active' : ''}`} onClick={() => urunSec(u)}>
              <span className="rc-urun-ad">{u.ad}</span>
              <span className="rc-urun-fiyat">{TL(Number(u.fiyat) || 0)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rc-col-right">
        {!seciliUrun ? (
          <p className="mh-empty">Soldan bir ürün seç, reçetesini düzenle</p>
        ) : receteYukleniyor ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : (
          <>
            <div className="rc-urun-head">
              <h3>{seciliUrun.ad} {durumRozeti(receteHesap)}</h3>
              <div className="rc-metrikler">
                <div><span>Satış Fiyatı</span><strong>{TL(satisFiyati)}</strong></div>
                <div><span>Güncel Maliyet</span><strong>{guncelMaliyet !== null ? TL(guncelMaliyet) : '⚠️ Hesaplanamıyor'}</strong></div>
                <div><span>Brüt Kâr</span><strong>{brutKar !== null ? TL(brutKar) : '—'}</strong></div>
                <div><span>Maliyet Oranı</span><strong>{maliyetOrani !== null ? `%${maliyetOrani.toFixed(1)}` : '—'}</strong></div>
              </div>
              {receteHesap?.eksikMalzemeler?.length > 0 && (
                <p className="rc-uyari">⚠️ Maliyet bilgisi bulunamadı: {receteHesap.eksikMalzemeler.join(', ')}</p>
              )}
            </div>

            <div className="rc-kalem-list">
              <div className="rc-kalem-head"><span>Malzeme</span><span>Miktar</span><span>Birim</span><span></span></div>
              {kalemler.length === 0 && <p className="mh-empty">Henüz malzeme eklenmedi</p>}
              {kalemler.map((k, idx) => (
                <div key={idx} className="rc-kalem-row">
                  <span>{k.malzemeAdi}</span>
                  <input type="number" step="any" value={k.miktar} onChange={(e) => kalemMiktarGuncelle(idx, e.target.value)} />
                  <span>{k.birim}</span>
                  <button onClick={() => kalemSil(idx)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>

            <div className="rc-malzeme-ekle-wrap">
              <button className="mh-secondary-btn small" onClick={() => setMalzemeEkleAcik((v) => !v)}><Plus size={13} /> Malzeme Ekle</button>
              {malzemeEkleAcik && (
                <div className="mh-malzeme-dropdown rc-malzeme-dropdown">
                  <input placeholder="Malzeme ara..." value={malzemeAramaMetni} onChange={(e) => setMalzemeAramaMetni(e.target.value)} autoFocus lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                  {malzemeler
                    .filter((m) => !malzemeAramaMetni.trim() || m.ad.toLocaleLowerCase('tr').includes(malzemeAramaMetni.toLocaleLowerCase('tr')))
                    .slice(0, 8)
                    .map((m) => (
                      <button key={m.id} onClick={() => malzemeKalemeEkle(m)}>{m.ad} <span>({m.birim})</span></button>
                    ))}
                  <button className="mh-malzeme-yeni-btn" onClick={() => { setYeniMalzemeForm({ ad: malzemeAramaMetni, birim: 'kg' }); setYeniMalzemeModal(true); setMalzemeEkleAcik(false); }}>
                    <Plus size={12} /> Yeni Malzeme Oluştur
                  </button>
                </div>
              )}
            </div>

            <button className="mh-primary-btn" disabled={kaydediliyor} onClick={receteKaydet}>
              <Check size={14} /> Kaydet
            </button>
          </>
        )}
      </div>

      {yeniMalzemeModal && (
        <div className="mh-malzeme-modal-overlay" onClick={() => setYeniMalzemeModal(false)}>
          <div className="mh-malzeme-modal" onClick={(e) => e.stopPropagation()}>
            <span className="mh-subhead">Yeni Malzeme Oluştur</span>
            <label>Malzeme Adı</label>
            <input className="mh-tabbable" autoFocus value={yeniMalzemeForm.ad} onChange={(e) => setYeniMalzemeForm((p) => ({ ...p, ad: e.target.value }))} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
            <label>Birim</label>
            <select className="mh-tabbable" value={yeniMalzemeForm.birim} onChange={(e) => setYeniMalzemeForm((p) => ({ ...p, birim: e.target.value }))}>
              <option value="gr">gr</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="litre">litre</option>
              <option value="adet">adet</option>
              <option value="porsiyon">porsiyon</option>
            </select>
            <div className="mh-malzeme-modal-btns">
              <button onClick={() => setYeniMalzemeModal(false)}>İptal</button>
              <button className="mh-primary-btn small" onClick={yeniMalzemeKaydet}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ============================================================
// Ortak yardımcılar — Fatura/Fiş Girişi + Tahsilat için
// ============================================================

const GUNLER_KISA = ['Pts','Sal','Çar','Per','Cum','Cts','Paz'];

function bugunTR() {
  return new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
}

function trStrToDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function dateToTrStr(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// Takvim + yazılabilir input kombinasyonu (Cariler FuturaModal deseninden adapte edildi).
function TarihSecici({ value, onChange }) {
  const [acik, setAcik] = useState(false);
  const [input, setInput] = useState(value || bugunTR());
  const [takvimYil, setTakvimYil] = useState(() => { const d = trStrToDate(value || bugunTR()); return d ? d.getFullYear() : new Date().getFullYear(); });
  const [takvimAy, setTakvimAy] = useState(() => { const d = trStrToDate(value || bugunTR()); return d ? d.getMonth() : new Date().getMonth(); });
  const ref = useRef(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  useEffect(() => {
    function dis(e) { if (ref.current && !ref.current.contains(e.target)) setAcik(false); }
    document.addEventListener('mousedown', dis);
    return () => document.removeEventListener('mousedown', dis);
  }, []);

  function buildCal(y, m) {
    const ilk = new Date(y, m, 1);
    const son = new Date(y, m + 1, 0);
    const bosluk = (ilk.getDay() + 6) % 7;
    const gunler = [];
    for (let i = 0; i < bosluk; i++) gunler.push(null);
    for (let d = 1; d <= son.getDate(); d++) gunler.push(new Date(y, m, d));
    return gunler;
  }

  function gunSec(d) {
    const s = dateToTrStr(d);
    setInput(s);
    onChange(s);
    setAcik(false);
  }

  function inputDegisti(e) {
    const v = e.target.value;
    setInput(v);
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) {
      const d = trStrToDate(v);
      if (d) { onChange(v); setTakvimYil(d.getFullYear()); setTakvimAy(d.getMonth()); }
    }
  }

  const secili = trStrToDate(value || '');
  const gunler = buildCal(takvimYil, takvimAy);

  return (
    <div className="ff-tarih-wrap" ref={ref}>
      <div className="ff-tarih-row">
        <button type="button" className="ff-takvim-ikon" onClick={() => setAcik(a => !a)}>📅</button>
        <input className="ff-input ff-tarih-input" value={input} onChange={inputDegisti}
          placeholder="GG.AA.YYYY" maxLength={10} />
      </div>
      {acik && (
        <div className="ff-takvim-popup">
          <div className="ff-takvim-head">
            <button type="button" onClick={() => { if (takvimAy===0) { setTakvimYil(y=>y-1); setTakvimAy(11); } else setTakvimAy(m=>m-1); }}>‹</button>
            <span>{AY_ADLARI[takvimAy]} {takvimYil}</span>
            <button type="button" onClick={() => { if (takvimAy===11) { setTakvimYil(y=>y+1); setTakvimAy(0); } else setTakvimAy(m=>m+1); }}>›</button>
          </div>
          <div className="ff-takvim-grid">
            {GUNLER_KISA.map(g => <div key={g} className="ff-takvim-label">{g}</div>)}
            {gunler.map((d, i) => (
              <button key={i} type="button"
                className={`ff-takvim-gun ${!d ? 'ff-takvim-bos' : ''} ${d && secili && d.toDateString()===secili.toDateString() ? 'ff-takvim-secili' : ''}`}
                disabled={!d} onClick={() => d && gunSec(d)}>
                {d ? d.getDate() : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Firma autocomplete + yeni firma kaydı.
function FirmaSecici({ value, onChange, firmalar, kategoriler, showToast, onFirmaEklendi }) {
  const [input, setInput] = useState(value || '');
  const [acik, setAcik] = useState(false);
  const [yeniModal, setYeniModal] = useState(false);
  const [yeniAd, setYeniAd] = useState('');
  const [yeniKat, setYeniKat] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  useEffect(() => {
    function dis(e) { if (ref.current && !ref.current.contains(e.target)) setAcik(false); }
    document.addEventListener('mousedown', dis);
    return () => document.removeEventListener('mousedown', dis);
  }, []);

  const oneri = useMemo(() => {
    if (input.length < 2) return [];
    const norm = input.toLocaleLowerCase('tr');
    return firmalar.filter(f => f.firmaAdi.toLocaleLowerCase('tr').includes(norm)).slice(0, 8);
  }, [input, firmalar]);

  function sec(firma) { setInput(firma.firmaAdi); onChange(firma); setAcik(false); }

  function inputDegisti(e) {
    setInput(e.target.value);
    onChange(null);
    setAcik(true);
  }

  function inputKeyDown(e) {
    if (e.key === 'Enter' && acik && oneri.length === 1) {
      e.preventDefault();
      sec(oneri[0]);
    }
  }

  async function firmaEkle() {
    if (!yeniAd.trim()) return;
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=faturaFisFirmaEkle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaAdi: yeniAd.trim(), giderKategorisi: yeniKat }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast(j.zatenVar ? 'Bu firma zaten kayıtlı' : 'Firma eklendi');
      onFirmaEklendi(yeniAd.trim());
      setYeniModal(false); setYeniAd(''); setYeniKat('');
    } catch(e) { showToast('Firma eklenemedi: ' + e.message); }
    finally { setKaydediyor(false); }
  }

  return (
    <div className="ff-firma-wrap" ref={ref}>
      <div className="ff-firma-row">
        <input className="ff-input" value={input} onChange={inputDegisti} onKeyDown={inputKeyDown}
          onFocus={() => setAcik(true)} placeholder="Firma adı ara..." />
        <button type="button" className="ff-yeni-btn" title="Yeni firma ekle" onClick={() => setYeniModal(true)}>
          <Plus size={14} /> Yeni
        </button>
      </div>
      {acik && oneri.length > 0 && (
        <div className="ff-dropdown">
          {oneri.map((f, i) => (
            <button key={i} type="button" className="ff-dropdown-item" onClick={() => sec(f)}>
              <span className="ff-dropdown-ad">{f.firmaAdi}</span>
              <span className={`ff-bakiye-rozet ${f.durum === 'Borçlu' ? 'ff-borc' : f.durum === 'Alacaklı' ? 'ff-alacak' : 'ff-hesap-yok'}`}>
                {f.durum}
              </span>
            </button>
          ))}
        </div>
      )}
      {yeniModal && (
        <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={() => setYeniModal(false)}>
          <div className="mh-modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:360}}>
            <div className="mh-drawer-head">
              <span>Yeni Firma Ekle</span>
              <button onClick={() => setYeniModal(false)}><X size={18} /></button>
            </div>
            <div className="mh-drawer-body">
              <label className="ff-label">Firma Adı</label>
              <input className="ff-input" value={yeniAd} onChange={e => setYeniAd(e.target.value)}
                placeholder="Firma adı" autoFocus />
              <label className="ff-label" style={{marginTop:10}}>Gider Kategorisi</label>
              <select className="ff-select" value={yeniKat} onChange={e => setYeniKat(e.target.value)}>
                <option value="">— Seçin —</option>
                {(kategoriler || []).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
                <button className="mh-secondary-btn" onClick={() => setYeniModal(false)}>Vazgeç</button>
                <button className="mh-primary-btn" disabled={kaydediyor || !yeniAd.trim()} onClick={firmaEkle}>
                  {kaydediyor ? '…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Ödeme türü seçici — ağaç yapısı (Nakit / Kredi Kartı → kart / Banka Havalesi → banka / Cari / yeni ekle).
function OdemeTuruSecici({ tur, detay, onChange, odemeYontemleri, showToast, onYontemiEklendi }) {
  const [yeniModal, setYeniModal] = useState(null); // 'kart' | 'banka' | 'nakit' | 'diger'
  const [yeniAd, setYeniAd] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);

  const kartlar = odemeYontemleri.filter(o => o.tur === 'Kredi Kartı' && o.ad);
  const bankalar = odemeYontemleri.filter(o => o.tur === 'Banka Havalesi' && o.ad);

  async function yeniEkle(yeniTur) {
    if (!yeniAd.trim()) return;
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=odemeYontemiEkle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tur: yeniTur, ad: yeniAd.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast(j.zatenVar ? 'Bu yöntem zaten var' : 'Eklendi');
      onYontemiEklendi();
      setYeniModal(null); setYeniAd('');
    } catch(e) { showToast('Eklenemedi: ' + e.message); }
    finally { setKaydediyor(false); }
  }

  return (
    <div className="ff-odeme-wrap">
      <div className="ff-odeme-row">
        {['Nakit','Kredi Kartı','Banka Havalesi','Cari','Devir'].map(t => (
          <button key={t} type="button"
            className={`ff-odeme-btn ${tur===t ? 'ff-odeme-secili' : ''}`}
            onClick={() => onChange(t, '')}>
            {t}
          </button>
        ))}
        <button type="button" className="ff-odeme-btn ff-odeme-yeni" onClick={() => setYeniModal('diger')}>
          + Yeni Yöntem
        </button>
      </div>

      {tur === 'Devir' && (
        <p className="mh-hint" style={{ margin: '6px 0 0' }}>
          Eski sistemden açılış bakiyesi. Kasa veya banka hareketi oluşturmaz.
        </p>
      )}

      {tur === 'Nakit' && (
        <div className="ff-alt-secim">
          {['Günlük Kasa','Çelik Kasa'].map(k => (
            <button key={k} type="button"
              className={`ff-odeme-btn ff-alt-btn ${detay===k ? 'ff-alt-secili' : ''}`}
              onClick={() => onChange('Nakit', k)}>
              {k}
            </button>
          ))}
        </div>
      )}

      {tur === 'Kredi Kartı' && (
        <div className="ff-alt-secim">
          {kartlar.map(k => (
            <button key={k.id} type="button"
              className={`ff-odeme-btn ff-alt-btn ${detay===k.ad ? 'ff-alt-secili' : ''}`}
              onClick={() => onChange('Kredi Kartı', k.ad)}>
              {k.ad}
            </button>
          ))}
          <button type="button" className="ff-odeme-btn ff-odeme-yeni" onClick={() => setYeniModal('kart')}>
            + Yeni Kart
          </button>
        </div>
      )}

      {tur === 'Banka Havalesi' && (
        <div className="ff-alt-secim">
          {bankalar.map(b => (
            <button key={b.id} type="button"
              className={`ff-odeme-btn ff-alt-btn ${detay===b.ad ? 'ff-alt-secili' : ''}`}
              onClick={() => onChange('Banka Havalesi', b.ad)}>
              {b.ad}
            </button>
          ))}
          <button type="button" className="ff-odeme-btn ff-odeme-yeni" onClick={() => setYeniModal('banka')}>
            + Yeni Banka
          </button>
        </div>
      )}

      {yeniModal && (
        <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={() => setYeniModal(null)}>
          <div className="mh-modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:360}}>
            <div className="mh-drawer-head">
              <span>{yeniModal==='kart' ? 'Yeni Kart Ekle' : yeniModal==='banka' ? 'Yeni Banka Ekle' : 'Yeni Ödeme Yöntemi'}</span>
              <button onClick={() => setYeniModal(null)}><X size={18}/></button>
            </div>
            <div className="mh-drawer-body">
              <input className="ff-input" value={yeniAd} onChange={e=>setYeniAd(e.target.value)} autoFocus
                placeholder={yeniModal==='kart' ? 'Kart adı (örn. Garanti Kredi Kartı)' : yeniModal==='banka' ? 'Banka adı' : 'Ödeme yöntemi adı'}
                onKeyDown={e=>e.key==='Enter' && yeniEkle(yeniModal==='kart'?'Kredi Kartı':yeniModal==='banka'?'Banka Havalesi':'Diğer')} />
              <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
                <button className="mh-secondary-btn" onClick={()=>setYeniModal(null)}>Vazgeç</button>
                <button className="mh-primary-btn" disabled={kaydediyor||!yeniAd.trim()}
                  onClick={() => yeniEkle(yeniModal==='kart'?'Kredi Kartı':yeniModal==='banka'?'Banka Havalesi':'Diğer')}>
                  {kaydediyor ? '…' : 'Ekle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Backend'deki DEVIR_KATEGORI ile birebir aynı olmalı.
const DEVIR_KATEGORI = 'Devir (Gider Değil)';

// Alt kırılım gerekli mi kontrol eden yardımcı (Cari hariç tüm türlerde detay zorunlu)
function odemeTuruGecerli(tur, detay) {
  if (!tur) return false;
  if (tur === 'Cari' || tur === 'Devir') return true;
  return !!detay; // Nakit→Günlük Kasa/Çelik Kasa, Kredi Kartı→hangi kart, Banka→hangi banka
}

// ============================================================
// 1. Fatura ve Fiş Girişi sekmesi
// ============================================================
function FaturaFisGirisiSekmesi({ showToast }) {
  const simdi = bugunTR();
  const [tarih, setTarih] = useState(simdi);
  const [seciliFirma, setSeciliFirma] = useState(null);
  const [firmaAdi, setFirmaAdi] = useState('');
  const [faturaNo, setFaturaNo] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [giderKat, setGiderKat] = useState('');
  const [odemeTuru, setOdemeTuru] = useState('');
  const [odemeDetay, setOdemeDetay] = useState('');
  const [faturaTutari, setFaturaTutari] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);

  const [firmalar, setFirmalar] = useState([]);
  const [kategoriler, setKategoriler] = useState([]);
  const [odemeYontemleri, setOdemeYontemleri] = useState([]);
  const [bekleyenFaturalar, setBekleyenFaturalar] = useState([]);
  const [loadingForm, setLoadingForm] = useState(true);
  const [loadingKartlar, setLoadingKartlar] = useState(true);

  async function yukle() {
    setLoadingForm(true);
    try {
      const [ffRes, kRes] = await Promise.all([
        fetch('/api/muhasebe?resource=faturaFis'),
        fetch('/api/muhasebe?resource=kategoriler'),
      ]);
      const ffJson = await ffRes.json();
      const kJson = await kRes.json();
      setFirmalar(ffJson.firmalar || []);
      setOdemeYontemleri(ffJson.odemeYontemleri || []);
      if (kJson.kategoriler?.length) setKategoriler(kJson.kategoriler);
    } catch { showToast('Veriler yüklenemedi'); }
    finally { setLoadingForm(false); }
  }

  // Firma seçili değilse tüm bekleyen faturalar, seçiliyse sadece o firmaya ait.
  async function bekleyenYukle(firma) {
    setLoadingKartlar(true);
    try {
      const url = firma
        ? `/api/muhasebe?resource=bekleyenFaturalar&firmaAdi=${encodeURIComponent(firma.firmaAdi)}`
        : '/api/muhasebe?resource=bekleyenFaturalar';
      const j = await (await fetch(url)).json();
      setBekleyenFaturalar(j.records || []);
    } catch { setBekleyenFaturalar([]); }
    finally { setLoadingKartlar(false); }
  }

  useEffect(() => { yukle(); bekleyenYukle(null); }, []);

  function firmaSecildi(firma) {
    setSeciliFirma(firma);
    setFirmaAdi(firma ? firma.firmaAdi : '');
    // Firma seçilince kayıtlı gider kategorisi otomatik gelsin
    if (firma && firma.giderKategorisi) setGiderKat(firma.giderKategorisi);
    bekleyenYukle(firma);
  }

  function faturaOnayla(f) {
    // Firma henüz seçilmediyse, karttan otomatik seç
    if (!seciliFirma && f.firmaAdi) {
      const bulunan = firmalar.find(fi => fi.firmaAdi === f.firmaAdi);
      if (bulunan) { setSeciliFirma(bulunan); setFirmaAdi(bulunan.firmaAdi); }
    }
    setFaturaNo(f.faturaNo || '');
    setAciklama('');
    setGiderKat(f.kategori || '');
    setFaturaTutari(String(f.tutar || ''));
  }

  async function kaydet(e) {
    e.preventDefault();
    if (!seciliFirma) { showToast('Önce bir firma seçin'); return; }
    if (!giderKat) { showToast('Gider kategorisi seçin'); return; }
    if (!odemeTuruGecerli(odemeTuru, odemeDetay)) { showToast('Ödeme türünü seçin'); return; }
    if (!faturaTutari) { showToast('Fatura tutarı gerekli'); return; }
    setKaydediyor(true);
    try {
      // 1) Fatura kaydı (Fatura ve Fişler sheet'ine)
      const res = await fetch('/api/muhasebe?resource=faturaFis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarih, firmaAdi: seciliFirma.firmaAdi, faturaNo, aciklama,
          giderKategorisi: giderKat, odemeTuru, odemeDetay, faturaTutari,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');

      // 2) Cari HARİÇ peşin ödemelerde: otomatik tahsilat kaydı da oluştur
      //    (Tahsilat Makbuzları sheet'ine aynı tutarda ödeme yazılır)
      if (odemeTuru !== 'Cari' && odemeTuru !== 'Devir') {
        const tRes = await fetch('/api/muhasebe?resource=tahsilat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tarih, firmaAdi: seciliFirma.firmaAdi, faturaNo,
            aciklama: `Peşin ödeme — ${odemeTuru}${odemeDetay ? ' / ' + odemeDetay : ''}`,
            odemeTuru, odemeDetay, tutar: faturaTutari,
          }),
        });
        const tJ = await tRes.json();
        if (!tRes.ok) console.error('Tahsilat kaydı oluşturulamadı:', tJ.error);
      }

      showToast(odemeTuru === 'Cari' ? 'Fatura kaydedildi (cariye atıldı)'
        : odemeTuru === 'Devir' ? 'Devir bakiyesi kaydedildi' : 'Fatura + ödeme kaydedildi');
      setFaturaNo(''); setAciklama(''); setGiderKat(''); setFaturaTutari('');
      setOdemeTuru(''); setOdemeDetay('');
      await yukle();
      await bekleyenYukle(seciliFirma);
    } catch(err) { showToast('Kaydedilemedi: ' + err.message); }
    finally { setKaydediyor(false); }
  }

  const guncelBakiye = seciliFirma ? seciliFirma.bakiye : null;

  return (
    <div className="ff-ana-grid">
      {/* SOL ÜST — Form */}
      <div className="ff-form-panel">
        <h3 className="ff-panel-baslik">Fatura / Fiş Girişi</h3>
        {loadingForm ? <p className="mh-empty">Yükleniyor…</p> : (
          <form onSubmit={kaydet} className="ff-form">
            <label className="ff-label">Tarih</label>
            <TarihSecici value={tarih} onChange={setTarih} />

            <label className="ff-label">Firma <span className="ff-zorunlu">*</span></label>
            <FirmaSecici value={firmaAdi} onChange={firmaSecildi} firmalar={firmalar}
              kategoriler={kategoriler} showToast={showToast} onFirmaEklendi={() => yukle()} />

            {seciliFirma && (
              <div className="ff-bakiye-blok">
                <div className="ff-bakiye-satir">
                  <span className="ff-bakiye-etiket">Bakiye Durumu</span>
                  <span className={`ff-bakiye-deger ${guncelBakiye > 0.01 ? 'ff-borc' : guncelBakiye < -0.01 ? 'ff-alacak' : ''}`}>
                    {guncelBakiye > 0.01 ? 'Borçlu' : guncelBakiye < -0.01 ? 'Alacaklı' : 'Hesap Yok'}
                  </span>
                </div>
                <div className="ff-bakiye-satir">
                  <span className="ff-bakiye-etiket">Bakiye Tutarı</span>
                  <span className={`ff-bakiye-deger ${guncelBakiye > 0.01 ? 'ff-borc' : guncelBakiye < -0.01 ? 'ff-alacak' : ''}`}>
                    {guncelBakiye > 0.01 ? '+' : guncelBakiye < -0.01 ? '-' : ''}{TL(Math.abs(guncelBakiye))}
                  </span>
                </div>
              </div>
            )}

            <label className="ff-label">Fatura No</label>
            <input className="ff-input" value={faturaNo} onChange={e=>setFaturaNo(e.target.value)} placeholder="Opsiyonel" />

            <label className="ff-label">Açıklama</label>
            <input className="ff-input" value={aciklama} onChange={e=>setAciklama(e.target.value)} placeholder="Opsiyonel" />

            <label className="ff-label">Gider Kategorisi</label>
            <div className="ff-kat-wrap">
              <select className="ff-select" value={giderKat} onChange={e=>setGiderKat(e.target.value)}>
                <option value="">— Seçin —</option>
                {kategoriler.map(k=><option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <label className="ff-label">Ödeme Türü</label>
            <OdemeTuruSecici tur={odemeTuru} detay={odemeDetay}
              onChange={(t,d)=>{setOdemeTuru(t);setOdemeDetay(d);if(t==='Devir')setGiderKat(DEVIR_KATEGORI);}}
              odemeYontemleri={odemeYontemleri} showToast={showToast}
              onYontemiEklendi={yukle} />

            <label className="ff-label">Fatura Tutarı <span className="ff-zorunlu">*</span></label>
            <input className="ff-input ff-tutar" type="number" step="0.01" min="0"
              value={faturaTutari} onChange={e=>setFaturaTutari(e.target.value)} placeholder="0,00" />

            <button type="submit" className="mh-primary-btn ff-kaydet-btn"
              disabled={kaydediyor || !seciliFirma || !faturaTutari || !giderKat || !odemeTuruGecerli(odemeTuru, odemeDetay)}>
              {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </form>
        )}
      </div>

      {/* SAĞ + ALT — Uyumsoft fatura kartları (firma seçili değilse hepsi, seçiliyse filtreli) */}
      <div className="ff-kart-panel">
        <h3 className="ff-panel-baslik">
          {seciliFirma
            ? `${seciliFirma.firmaAdi} — İşlenmemiş Faturalar (${bekleyenFaturalar.length})`
            : `Tüm İşlenmemiş Faturalar (${bekleyenFaturalar.length})`}
        </h3>
        {loadingKartlar
          ? <p className="mh-empty">Yükleniyor…</p>
          : bekleyenFaturalar.length === 0
            ? <p className="mh-empty">İşlenmemiş XML fatura yok.</p>
            : (
              <div className="ff-kart-grid">
                {bekleyenFaturalar.map(f => (
                  <div key={f.faturaID} className="ff-fatura-kart">
                    <div className="ff-kart-ust">
                      <span className="ff-kart-tarih">{f.tarih}</span>
                      <span className="ff-kart-no">{f.faturaNo || '—'}</span>
                    </div>
                    <div className="ff-kart-firma">{f.firmaAdi}</div>
                    <div className="ff-kart-kat">{f.kategori}</div>
                    <div className="ff-kart-tutarlar">
                      <span>Tutar: <strong>{TL(f.tutar)}</strong></span>
                      {f.kdvTutari > 0 && <span>KDV: {TL(f.kdvTutari)}</span>}
                      <span className="ff-kart-satirsayisi">{f.satirSayisi} kalem</span>
                    </div>
                    <button type="button" className="ff-kart-onayla" onClick={() => faturaOnayla(f)}>
                      Formu Doldur
                    </button>
                  </div>
                ))}
              </div>
            )
        }
      </div>
    </div>
  );
}

// ============================================================
// 2. Tahsilat Makbuzu sekmesi
// ============================================================
function TahsilatMakbuzuSekmesi({ showToast }) {
  const simdi = bugunTR();
  const [tarih, setTarih] = useState(simdi);
  const [seciliFirma, setSeciliFirma] = useState(null);
  const [firmaAdi, setFirmaAdi] = useState('');
  const [faturaNo, setFaturaNo] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [odemeTuru, setOdemeTuru] = useState('');
  const [odemeDetay, setOdemeDetay] = useState('');
  const [tutar, setTutar] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);

  const [firmalar, setFirmalar] = useState([]);
  const [odemeYontemleri, setOdemeYontemleri] = useState([]);
  const [kategoriler, setKategoriler] = useState([]);
  const [bekleyenOdemeler, setBekleyenOdemeler] = useState([]);
  const [loading, setLoading] = useState(true);

  async function yukle() {
    setLoading(true);
    try {
      const [tRes, oRes, kRes] = await Promise.all([
        fetch('/api/muhasebe?resource=tahsilat'),
        fetch('/api/muhasebe?resource=bekleyenOdemeler'),
        fetch('/api/muhasebe?resource=kategoriler'),
      ]);
      const tJson = await tRes.json();
      const oJson = await oRes.json();
      const kJson = await kRes.json();
      setFirmalar(tJson.firmalar || []);
      setOdemeYontemleri(tJson.odemeYontemleri || []);
      setBekleyenOdemeler(oJson.records || []);
      if (kJson.kategoriler?.length) setKategoriler(kJson.kategoriler);
    } catch { showToast('Veriler yüklenemedi'); }
    finally { setLoading(false); }
  }
  useEffect(() => { yukle(); }, []);

  function firmaSecildi(firma) {
    setSeciliFirma(firma);
    setFirmaAdi(firma ? firma.firmaAdi : '');
  }

  function ekstreEslestir(ekstre) {
    setTutar(String(ekstre.tutar));
    setFaturaNo('');
    setAciklama(ekstre.aciklama || '');
  }

  async function kaydet(e) {
    e.preventDefault();
    if (!seciliFirma) { showToast('Önce firma seçin'); return; }
    if (!tutar) { showToast('Tutar gerekli'); return; }
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=tahsilat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarih, firmaAdi: seciliFirma.firmaAdi, faturaNo, aciklama, odemeTuru, odemeDetay, tutar }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast('Tahsilat kaydedildi');
      setFaturaNo(''); setAciklama(''); setTutar('');
      await yukle();
      setSeciliFirma(prev => prev ? firmalar.find(f=>f.firmaAdi===prev.firmaAdi) || prev : null);
    } catch(err) { showToast('Kaydedilemedi: ' + err.message); }
    finally { setKaydediyor(false); }
  }

  const guncelBakiye = seciliFirma ? seciliFirma.bakiye : null;
  const yeniTutar = Number(tutar) || 0;
  const yeniBakiye = guncelBakiye !== null ? Math.round((guncelBakiye - yeniTutar) * 100) / 100 : null;

  return (
    <div className="ff-ana-grid">
      {/* SOL ÜST — Form */}
      <div className="ff-form-panel">
        <h3 className="ff-panel-baslik">Tahsilat Makbuzu</h3>
        {loading ? <p className="mh-empty">Yükleniyor…</p> : (
          <form onSubmit={kaydet} className="ff-form">
            <label className="ff-label">Tarih</label>
            <TarihSecici value={tarih} onChange={setTarih} />

            <label className="ff-label">Firma <span className="ff-zorunlu">*</span></label>
            <FirmaSecici value={firmaAdi} onChange={firmaSecildi} firmalar={firmalar}
              kategoriler={kategoriler} showToast={showToast} onFirmaEklendi={yukle} />

            {seciliFirma && (
              <div className="ff-bakiye-blok">
                <div className="ff-bakiye-satir">
                  <span className="ff-bakiye-etiket">Önceki Bakiyesi</span>
                  <span className={`ff-bakiye-deger ${guncelBakiye > 0.01 ? 'ff-borc' : guncelBakiye < -0.01 ? 'ff-alacak' : ''}`}>
                    {guncelBakiye > 0.01 ? '+' : guncelBakiye < -0.01 ? '-' : ''}{TL(Math.abs(guncelBakiye))}
                  </span>
                </div>
                {tutar && (
                  <div className="ff-bakiye-satir">
                    <span className="ff-bakiye-etiket">
                      {yeniBakiye > 0.01 ? 'Borç Bakiyesi' : yeniBakiye < -0.01 ? 'Alacaklı Bakiyesi' : 'Bakiye'}
                    </span>
                    <span className={`ff-bakiye-deger ${yeniBakiye > 0.01 ? 'ff-borc' : yeniBakiye < -0.01 ? 'ff-alacak' : 'ff-hesap-yok'}`}>
                      {yeniBakiye > 0.01 ? '+' : yeniBakiye < -0.01 ? '-' : ''}{TL(Math.abs(yeniBakiye))}
                    </span>
                  </div>
                )}
              </div>
            )}

            <label className="ff-label">Fatura No</label>
            <input className="ff-input" value={faturaNo} onChange={e=>setFaturaNo(e.target.value)} placeholder="Opsiyonel" />

            <label className="ff-label">Açıklama</label>
            <input className="ff-input" value={aciklama} onChange={e=>setAciklama(e.target.value)} placeholder="Opsiyonel" />

            <label className="ff-label">Ödeme Türü</label>
            <OdemeTuruSecici tur={odemeTuru} detay={odemeDetay}
              onChange={(t,d)=>{setOdemeTuru(t);setOdemeDetay(d);}}
              odemeYontemleri={odemeYontemleri} showToast={showToast} onYontemiEklendi={yukle} />

            <label className="ff-label">Ödeme Tutarı <span className="ff-zorunlu">*</span></label>
            <input className="ff-input ff-tutar" type="number" step="0.01" min="0" value={tutar} onChange={e=>setTutar(e.target.value)} placeholder="0,00" />

            <button type="submit" className="mh-primary-btn ff-kaydet-btn" disabled={kaydediyor || !seciliFirma || !tutar || !odemeTuruGecerli(odemeTuru, odemeDetay)}>
              {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </form>
        )}
      </div>

      {/* SAĞ + ALT — Ekstre ödeme kartları */}
      <div className="ff-kart-panel">
        <h3 className="ff-panel-baslik">Banka Ekstresinden Gelen Ödemeler ({bekleyenOdemeler.length})</h3>
        {bekleyenOdemeler.length === 0 && <p className="mh-empty">Eşleştirilmemiş ödeme yok.</p>}
        <div className="ff-kart-grid">
          {bekleyenOdemeler.map(e => (
            <div key={e.id} className="ff-fatura-kart ff-odeme-kart">
              <div className="ff-kart-ust">
                <span className="ff-kart-tarih">{e.tarih}</span>
                <span className="ff-kart-tutar-buyuk">{TL(e.tutar)}</span>
              </div>
              <div className="ff-kart-aciklama">{e.aciklama || '—'}</div>
              {e.saticiAdi && <div className="ff-kart-firma">{e.saticiAdi}</div>}
              <button type="button" className="ff-kart-onayla" onClick={() => ekstreEslestir(e)}>
                Tutarı Aktar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 3. Banka / Kart Takip sekmesi
// ============================================================
function BankaKartTakipSekmesi({ showToast, devirTarihi }) {
  const [hareketler, setHareketler] = useState([]);
  const [hesaplar, setHesaplar] = useState([]);
  const [ozet, setOzet] = useState([]);
  const [seciliHesap, setSeciliHesap] = useState('');
  const [loading, setLoading] = useState(true);
  const [ayarModal, setAyarModal] = useState(null); // ozet satırı

  async function yukle(hesap) {
    setLoading(true);
    try {
      const url = `/api/muhasebe?resource=bankaKartHareket${hesap ? '&hesapAdi='+encodeURIComponent(hesap) : ''}`;
      const res = await fetch(url);
      const j = await res.json();
      setHareketler(j.records || []);
      if (j.hesaplar) setHesaplar(j.hesaplar);
      if (j.ozet) setOzet(j.ozet);
    } catch { showToast('Veriler yüklenemedi'); }
    finally { setLoading(false); }
  }
  useEffect(() => { yukle(''); }, []);

  function hesapSec(ad) { setSeciliHesap(ad); yukle(ad); }

  const toplamGiren = hareketler.filter(h=>h.yon==='GİREN').reduce((s,h)=>s+h.tutar,0);
  const toplamGiden = hareketler.filter(h=>h.yon==='GİDEN').reduce((s,h)=>s+h.tutar,0);
  const seciliOzet = seciliHesap ? ozet.find(o => o.ad === seciliHesap) : null;
  const acilisDate = seciliOzet ? trStrToDate(seciliOzet.acilisTarihi) : null;

  function hesapDurumu(o) {
    if (o.kartModu) return <span style={{ color: "#c62828" }}>Borç {TL(o.borc)}</span>;
    return <span>{TL(o.bakiye)}</span>;
  }

  return (
    <div className="ff-banka-wrap">
      <div className="ff-banka-hesap-serim">
        <button className={`ff-odeme-btn ${!seciliHesap ? 'ff-odeme-secili':''}`} onClick={()=>hesapSec('')}>Tümü</button>
        {hesaplar.map(h=>(
          <button key={h.id} className={`ff-odeme-btn ${seciliHesap===h.ad ? 'ff-odeme-secili':''}`} onClick={()=>hesapSec(h.ad)}>
            {h.tur==='Kredi Kartı' ? '💳' : '🏦'} {h.ad}
          </button>
        ))}
      </div>

      {!seciliHesap && (
        <div className="mh-table-card" style={{ marginBottom: 12 }}>
          <table className="mh-excel-table">
            <thead>
              <tr><th>Hesap</th><th>Açılış</th><th>Güncel Bakiye / Borç</th><th>Limit</th><th>Kullanılabilir</th><th></th></tr>
            </thead>
            <tbody>
              {ozet.map(o => (
                <tr key={o.id}>
                  <td>{o.ad}</td>
                  <td>{o.acilisTarihi ? `${o.acilisTarihi} — ${TL(o.acilisBakiyesi)}` : 'Girilmedi'}</td>
                  <td className="mh-tutar-cell">{hesapDurumu(o)}</td>
                  <td className="mh-tutar-cell">{o.kartModu ? TL(o.limit) : '—'}</td>
                  <td className="mh-tutar-cell">{o.kartModu ? TL(o.kullanilabilir) : '—'}</td>
                  <td><button className="mh-secondary-btn" onClick={() => setAyarModal(o)}>Açılış / Limit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seciliOzet ? (
        <div className="ff-banka-kpi">
          {seciliOzet.kartModu ? (<>
            <div className="mh-kpi-card"><span className="mh-kpi-label">Kart Borcu</span><span className="mh-kpi-value mh-kpi-kirmizi-val">{TL(seciliOzet.borc)}</span></div>
            <div className="mh-kpi-card"><span className="mh-kpi-label">Limit</span><span className="mh-kpi-value">{TL(seciliOzet.limit)}</span></div>
            <div className="mh-kpi-card"><span className="mh-kpi-label">Kullanılabilir Limit</span><span className="mh-kpi-value mh-kpi-yesil-val">{TL(seciliOzet.kullanilabilir)}</span></div>
          </>) : (<>
            <div className="mh-kpi-card"><span className="mh-kpi-label">Açılış Bakiyesi</span><span className="mh-kpi-value">{TL(seciliOzet.acilisBakiyesi)}</span></div>
            <div className="mh-kpi-card"><span className="mh-kpi-label">Açılıştan Sonra Giren / Giden</span><span className="mh-kpi-value">{TL(seciliOzet.giren)} / {TL(seciliOzet.giden)}</span></div>
            <div className="mh-kpi-card"><span className="mh-kpi-label">Güncel Bakiye</span><span className="mh-kpi-value">{TL(seciliOzet.bakiye)}</span></div>
          </>)}
          <button className="mh-secondary-btn" onClick={() => setAyarModal(seciliOzet)}>Açılış / Limit</button>
        </div>
      ) : (
        <div className="ff-banka-kpi">
          <div className="mh-kpi-card"><span className="mh-kpi-label">Toplam Giren</span><span className="mh-kpi-value mh-kpi-yesil-val">{TL(toplamGiren)}</span></div>
          <div className="mh-kpi-card"><span className="mh-kpi-label">Toplam Giden</span><span className="mh-kpi-value mh-kpi-kirmizi-val">{TL(toplamGiden)}</span></div>
          <div className="mh-kpi-card"><span className="mh-kpi-label">Hareket Farkı</span><span className="mh-kpi-value">{TL(toplamGiren-toplamGiden)}</span></div>
        </div>
      )}

      <div className="mh-table-card">
        {loading ? <p className="mh-empty">Yükleniyor…</p> : hareketler.length === 0 ? (
          <p className="mh-empty">Bu hesapta henüz hareket yok.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr><th>Tarih</th><th>Hesap</th><th>Yön</th><th>Tutar</th><th>Açıklama</th></tr>
            </thead>
            <tbody>
              {hareketler.map(h=>{
                const t = trStrToDate(h.tarih);
                const oncesi = acilisDate && t && t.getTime() <= acilisDate.getTime();
                return (
                  <tr key={h.id} style={oncesi ? { opacity: 0.45 } : undefined}
                    title={oncesi ? 'Açılış tarihi ve öncesi: açılış bakiyesine dahil, tekrar sayılmaz' : undefined}>
                    <td>{h.tarih}</td>
                    <td>{h.hesapTuru}{h.hesapAdi ? ` — ${h.hesapAdi}` : ''}</td>
                    <td><span className={`mh-durum ${h.yon==='GİREN' ? 'mh-durum-yesil':'mh-durum-kirmizi'}`}>{h.yon}</span></td>
                    <td className="mh-tutar-cell">{TL(h.tutar)}</td>
                    <td>{h.aciklama}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Toplam Giren / Giden</td><td className="mh-tutar-cell">{TL(toplamGiren)} / {TL(toplamGiden)}</td><td></td></tr>
            </tfoot>
          </table>
        )}
      </div>

      {ayarModal && (
        <HesapAyarModal hesap={ayarModal} devirTarihi={devirTarihi} showToast={showToast}
          onClose={() => setAyarModal(null)}
          onSaved={() => { setAyarModal(null); yukle(seciliHesap); }} />
      )}
    </div>
  );
}

function HesapAyarModal({ hesap, devirTarihi, showToast, onClose, onSaved }) {
  const [acilisTarihi, setAcilisTarihi] = useState(hesap.acilisTarihi || devirTarihi || bugunTR());
  const [acilisBakiyesi, setAcilisBakiyesi] = useState(hesap.acilisBakiyesi ? String(hesap.acilisBakiyesi) : '');
  const [limit, setLimit] = useState(hesap.limit ? String(hesap.limit) : '');
  const [kaydediyor, setKaydediyor] = useState(false);
  const kartModu = (Number(String(limit).replace(',', '.')) || 0) > 0;

  async function kaydet() {
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=hesapAyarKaydet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: hesap.id, acilisTarihi, acilisBakiyesi, limit }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast('Hesap ayarı kaydedildi');
      onSaved();
    } catch (e) { showToast('Kaydedilemedi: ' + e.message); }
    finally { setKaydediyor(false); }
  }

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="mh-drawer-head">
          <span>{hesap.ad} — Açılış / Limit</span>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="mh-drawer-body">
          <label className="ff-label">Açılış tarihi</label>
          <TarihSecici value={acilisTarihi} onChange={setAcilisTarihi} />
          <p className="mh-hint">Bu tarih dahil önceki hareketler açılış tutarının içinde sayılır, sadece sonraki hareketler eklenir.</p>

          <label className="ff-label">Limit (sadece kredi kartı, yoksa boş bırak)</label>
          <input className="ff-input" type="number" step="any" min="0" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="0" />

          <label className="ff-label">{kartModu ? 'Açılıştaki kart borcu' : 'Açılıştaki hesap bakiyesi'}</label>
          <input className="ff-input" type="number" step="any" value={acilisBakiyesi} onChange={e=>setAcilisBakiyesi(e.target.value)} placeholder="0" />

          <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
            <button className="mh-secondary-btn" onClick={onClose}>Vazgeç</button>
            <button className="mh-primary-btn" disabled={kaydediyor || !acilisTarihi} onClick={kaydet}>
              {kaydediyor ? '…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PERSONEL + SABİT GİDERLER (tahakkuk modülü)
// Tahakkuk = ayın 1'ine cari borç. Ödeme = cari borçtan düşen tahsilat.
// ============================================================

function donemBugun() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function donemEtiket(donem) {
  if (!donem) return '';
  const [y, a] = donem.split('-');
  const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${aylar[Number(a) - 1]} ${y}`;
}

function PersonelSekmesi({ showToast }) {
  const [donem, setDonem] = useState(donemBugun());
  const [personeller, setPersoneller] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formModal, setFormModal] = useState(null);      // {} = yeni, kayıt = düzenle
  const [odemeModal, setOdemeModal] = useState(null);
  const [devamsizlikModal, setDevamsizlikModal] = useState(null);
  const [hareketModal, setHareketModal] = useState(null);
  const [tahakkukEdiliyor, setTahakkukEdiliyor] = useState(false);

  async function yukle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/muhasebe?resource=personel&donem=${donem}`);
      const j = await res.json();
      setPersoneller(j.personeller || []);
    } catch { showToast('Personel listesi yüklenemedi'); }
    finally { setLoading(false); }
  }
  useEffect(() => { yukle(); }, [donem]);

  async function tahakkuk(kayit) {
    setTahakkukEdiliyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=tahakkukEt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kayit ? { tip: 'Personel', kayitId: kayit.id, donem } : { tip: 'Personel', toplu: true, donem }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      const atl = (j.atlanan || []).filter(a => !a.tutarsiz);
      showToast(
        (j.yazilan || []).length
          ? `${j.yazilan.length} tahakkuk yazıldı${atl.length ? `, ${atl.length} zaten edilmişti (mükerrer kayıt yok)` : ''}`
          : (atl.length ? `Bu dönem zaten tahakkuk edilmiş (${donemEtiket(donem)}) — mükerrer kayıt yapılmadı` : 'Tahakkuk edilecek kayıt yok')
      );
      yukle();
    } catch (e) { showToast('Tahakkuk edilemedi: ' + e.message); }
    finally { setTahakkukEdiliyor(false); }
  }

  const aktifler = personeller.filter(p => !p.cikisTarihi || (p.bakiye > 0.01) || cikisBuDonem(p, donem));
  const bekleyenTahakkuk = aktifler.filter(p => !p.tahakkukEdildi && !p.cikisTarihi).length;

  return (
    <div className="mh-yeni">
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, marginBottom:12 }}>
        <strong>Dönem:</strong>
        <input type="month" className="ff-input" style={{width:160}} value={donem} onChange={e=>setDonem(e.target.value)} />
        <button className="mh-primary-btn" disabled={tahakkukEdiliyor} onClick={()=>tahakkuk(null)}>
          {tahakkukEdiliyor ? '…' : `Toplu Tahakkuk Et (${donemEtiket(donem)})`}
        </button>
        <button className="mh-secondary-btn" onClick={()=>setFormModal({})}>+ Yeni Personel</button>
        {bekleyenTahakkuk > 0 && <span style={{color:'#c62828'}}>{bekleyenTahakkuk} personel bu dönem tahakkuk edilmedi</span>}
      </div>

      <div className="mh-table-card">
        {loading ? <p className="mh-empty">Yükleniyor…</p> : aktifler.length === 0 ? (
          <p className="mh-empty">Henüz personel eklenmemiş.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Ad Soyad</th><th>Görev</th><th>Telefon</th><th>İşe Giriş</th>
                <th>Net Maaş</th><th>Kalan Nakit</th><th>Kalan Havale</th><th>Toplam Kalan</th>
                <th>Son Tahakkuk</th><th>Durum</th><th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {aktifler.map(p => (
                <tr key={p.id}>
                  <td>{p.adSoyad}</td>
                  <td>{p.gorev}</td>
                  <td>{p.telefon}</td>
                  <td>{p.iseGiris}</td>
                  <td className="mh-tutar-cell">{TL(p.netMaas)}</td>
                  <td className="mh-tutar-cell">{TL(p.kalanNakit)}</td>
                  <td className="mh-tutar-cell">{TL(p.kalanHavale)}</td>
                  <td className="mh-tutar-cell"><strong>{TL(p.bakiye)}</strong></td>
                  <td>{p.sonTahakkukDonem ? `${donemEtiket(p.sonTahakkukDonem)} (${p.sonTahakkukTarih})` : '—'}</td>
                  <td>
                    <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'flex-start'}}>
                      {p.cikisTarihi && <span className="mh-durum mh-durum-kirmizi">Çıkış yapıldı</span>}
                      {!p.tahakkukEdildi && !p.cikisTarihi && <span className="mh-durum mh-durum-kirmizi">Bu ay tahakkuk yok</span>}
                      {p.eskiBorcVar && <span className="mh-durum mh-durum-kirmizi">Geçen aydan ödenmemiş maaş var</span>}
                      {p.devamsizGun > 0 && (
                        <button className="mh-durum mh-durum-kirmizi" style={{cursor:'pointer',border:'none'}}
                          onClick={()=>setDevamsizlikModal(p)}>
                          Bu ay {p.devamsizGun} gün gelmedi
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {!p.tahakkukEdildi && !p.cikisTarihi && (
                        <button className="mh-secondary-btn" onClick={()=>setFormModal({ ...p, tahakkukIste:true })}>Tahakkuk Et</button>
                      )}
                      <button className="mh-secondary-btn" onClick={()=>setOdemeModal(p)}>Ödeme Yap</button>
                      <button className="mh-secondary-btn" onClick={()=>setDevamsizlikModal(p)}>İşe Gelmedi</button>
                      <button className="mh-secondary-btn" onClick={()=>setHareketModal({ ad:p.adSoyad })}>Hareketler</button>
                      <button className="mh-secondary-btn" onClick={()=>setFormModal(p)}>Düzenle</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formModal && (
        <PersonelFormModal kayit={formModal} donem={donem} showToast={showToast}
          onTahakkuk={(k,tutar)=>tahakkukTekil('Personel',k,tutar,donem,showToast,()=>{setFormModal(null);yukle();})}
          onClose={()=>setFormModal(null)} onSaved={()=>{setFormModal(null);yukle();}} />
      )}
      {odemeModal && (
        <TahakkukOdemeModal tip="Personel" kayit={odemeModal} donem={donem} showToast={showToast}
          onClose={()=>setOdemeModal(null)} onSaved={()=>{setOdemeModal(null);yukle();}} />
      )}
      {devamsizlikModal && (
        <DevamsizlikModal personel={devamsizlikModal} donem={donem} showToast={showToast}
          onClose={()=>setDevamsizlikModal(null)} onSaved={()=>{setDevamsizlikModal(null);yukle();}} />
      )}
      {hareketModal && (
        <HareketDokumuModal ad={hareketModal.ad} onClose={()=>setHareketModal(null)} />
      )}
    </div>
  );
}

function cikisBuDonem(p, donem) {
  if (!p.cikisTarihi) return false;
  const d = trStrToDate(p.cikisTarihi);
  if (!d) return false;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === donem;
}

// Tekil tahakkuk — hem personel hem sabit gider için.
async function tahakkukTekil(tip, kayit, tutar, donem, showToast, bitince) {
  try {
    const res = await fetch('/api/muhasebe?resource=tahakkukEt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tip, kayitId: kayit.id, donem, tutar }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'hata');
    if ((j.atlanan || []).some(a => !a.tutarsiz)) {
      const a = j.atlanan[0];
      showToast(`Bu kaydı ${donemEtiket(donem)} döneminde zaten tahakkuk ettiniz — mükerrer kayıt yapılmadı`);
    } else if ((j.yazilan || []).length) {
      showToast('Tahakkuk edildi');
    } else {
      showToast('Tutar girilmediği için tahakkuk yapılmadı');
    }
    bitince?.();
  } catch (e) { showToast('Tahakkuk edilemedi: ' + e.message); }
}

function PersonelFormModal({ kayit, donem, showToast, onClose, onSaved, onTahakkuk }) {
  const yeni = !kayit.id;
  const [adSoyad, setAdSoyad] = useState(kayit.adSoyad || '');
  const [telefon, setTelefon] = useState(kayit.telefon || '');
  const [gorev, setGorev] = useState(kayit.gorev || '');
  const [iseGiris, setIseGiris] = useState(kayit.iseGiris || bugunTR());
  const [netMaas, setNetMaas] = useState(kayit.netMaas ? String(kayit.netMaas) : '');
  const [nakitLimit, setNakitLimit] = useState(kayit.nakitLimit ? String(kayit.nakitLimit) : '');
  const [havaleLimit, setHavaleLimit] = useState(kayit.havaleLimit ? String(kayit.havaleLimit) : '');
  const [cikisTarihi, setCikisTarihi] = useState(kayit.cikisTarihi || '');
  const [kaydediyor, setKaydediyor] = useState(false);
  // Tahakkuk isteğiyle açıldıysa ilk ay kıst önerisi hesaplanır.
  const [tahakkukTutar, setTahakkukTutar] = useState('');

  const maas = Number(String(netMaas).replace(',', '.')) || 0;
  const nl = Number(String(nakitLimit).replace(',', '.')) || 0;
  const hl = Number(String(havaleLimit).replace(',', '.')) || 0;
  const sinirHatasi = maas > 0 && Math.abs(nl + hl - maas) > 0.01;

  useEffect(() => {
    if (!kayit.tahakkukIste) return;
    // İlk ay kıstı: işe giriş bu dönemdeyse (maaş / 30) x kalan gün önerilir.
    const g = trStrToDate(kayit.iseGiris || '');
    const [y, a] = donem.split('-');
    if (g && g.getFullYear() === Number(y) && g.getMonth() + 1 === Number(a)) {
      const calisilan = 30 - g.getDate() + 1;
      setTahakkukTutar(String(Math.round((kayit.netMaas / 30) * calisilan * 100) / 100));
    } else {
      setTahakkukTutar(String(kayit.netMaas || ''));
    }
  }, []);

  async function kaydet() {
    if (!adSoyad.trim()) { showToast('Ad soyad gerekli'); return; }
    if (sinirHatasi) { showToast('Nakit + havale sınırı net maaşa eşit olmalı'); return; }
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=personel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kayit.id, adSoyad, telefon, gorev, iseGiris, netMaas, nakitLimit, havaleLimit, cikisTarihi }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast(yeni ? 'Personel eklendi' : 'Güncellendi');
      onSaved();
    } catch (e) { showToast('Kaydedilemedi: ' + e.message); }
    finally { setKaydediyor(false); }
  }

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <div className="mh-drawer-head">
          <span>{kayit.tahakkukIste ? 'Tahakkuk Et' : (yeni ? 'Yeni Personel' : 'Personel Düzenle')}</span>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="mh-drawer-body">
          {kayit.tahakkukIste ? (
            <>
              <p className="mh-hint">{kayit.adSoyad} — {donemEtiket(donem)} dönemi. Tahakkuk ayın 1'ine cari borç olarak yazılır.</p>
              <label className="ff-label">Tahakkuk tutarı (ilk ay için gün hesabıyla önerildi, değiştirebilirsiniz)</label>
              <input className="ff-input" type="number" step="any" value={tahakkukTutar} onChange={e=>setTahakkukTutar(e.target.value)} />
              <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
                <button className="mh-secondary-btn" onClick={onClose}>Vazgeç</button>
                <button className="mh-primary-btn" onClick={()=>onTahakkuk(kayit, tahakkukTutar)}>Tahakkuk Et</button>
              </div>
            </>
          ) : (
            <>
              <label className="ff-label">Ad Soyad *</label>
              <input className="ff-input" value={adSoyad} onChange={e=>setAdSoyad(e.target.value)} />
              <label className="ff-label">Görev</label>
              <input className="ff-input" value={gorev} onChange={e=>setGorev(e.target.value)} placeholder="Aşçı yardımcısı, tezgahtar…" />
              <label className="ff-label">Cep Telefonu</label>
              <input className="ff-input" value={telefon} onChange={e=>setTelefon(e.target.value)} />
              <label className="ff-label">İşe Giriş Tarihi</label>
              <TarihSecici value={iseGiris} onChange={setIseGiris} />
              <label className="ff-label">Net Maaş</label>
              <input className="ff-input" type="number" step="any" value={netMaas} onChange={e=>setNetMaas(e.target.value)} />
              <label className="ff-label">Nakit Ödeme Üst Sınırı</label>
              <input className="ff-input" type="number" step="any" value={nakitLimit} onChange={e=>setNakitLimit(e.target.value)} />
              <label className="ff-label">Havale Ödeme Üst Sınırı</label>
              <input className="ff-input" type="number" step="any" value={havaleLimit} onChange={e=>setHavaleLimit(e.target.value)} />
              {sinirHatasi && (
                <p className="mh-hint" style={{color:'#c62828'}}>
                  Nakit + havale = {TL(nl+hl)}, net maaş {TL(maas)}. İkisinin toplamı net maaşa eşit olmalı.
                </p>
              )}
              {!yeni && (
                <>
                  <label className="ff-label">İşten Çıkış Tarihi (boşsa çalışıyor)</label>
                  <TarihSecici value={cikisTarihi || ''} onChange={setCikisTarihi} />
                  {cikisTarihi && <p className="mh-hint">Çıkış verilen personel dönem bitince listeden düşer; borcu varsa görünmeye devam eder.</p>}
                </>
              )}
              <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
                <button className="mh-secondary-btn" onClick={onClose}>Vazgeç</button>
                <button className="mh-primary-btn" disabled={kaydediyor || sinirHatasi} onClick={kaydet}>
                  {kaydediyor ? '…' : 'Kaydet'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// Ödeme modalı — personel ve sabit gider için ortak.
function TahakkukOdemeModal({ tip, kayit, donem, showToast, onClose, onSaved }) {
  const ad = tip === 'Personel' ? kayit.adSoyad : kayit.ad;
  const [tarih, setTarih] = useState(bugunTR());
  const [odemeTuru, setOdemeTuru] = useState('Nakit');
  const [odemeDetay, setOdemeDetay] = useState('');
  const [kasaKaynak, setKasaKaynak] = useState('gunlukKasa');
  const [tutar, setTutar] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const [odemeYontemleri, setOdemeYontemleri] = useState([]);
  const [avansAcik, setAvansAcik] = useState(false);
  const [avansGun, setAvansGun] = useState('');

  const bugunMu = tarih === bugunTR();
  useEffect(() => { if (!bugunMu && kasaKaynak === 'gunlukKasa') setKasaKaynak('anaKasa'); }, [tarih]);

  useEffect(() => {
    fetch('/api/muhasebe?resource=faturaFis').then(r=>r.json())
      .then(j => setOdemeYontemleri(j.odemeYontemleri || [])).catch(()=>{});
  }, []);

  // Cepten ödemeler her zaman seçilebilir (işletme kartı yanımızda değilken).
  const hesaplar = (tur) => {
    const liste = odemeYontemleri.filter(o => o.tur === tur).map(o => o.ad);
    return [...new Set([...liste, 'Hasret Cepten', 'Hasan Cepten'])];
  };

  const gunlukUcret = tip === 'Personel' && kayit.netMaas ? kayit.netMaas / 30 : 0;
  const avansSonuc = gunlukUcret * (Number(avansGun) || 0);

  async function kaydet() {
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=tahakkukOdeme', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tip, kayitId: kayit.id, tarih, odemeTuru, odemeDetay, tutar, kasaKaynak, aciklama }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast(`Ödeme kaydedildi — kalan borç ${TL(j.yeniBakiye)}`);
      onSaved();
    } catch (e) { showToast(e.message); }
    finally { setKaydediyor(false); }
  }

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <div className="mh-drawer-head">
          <span>{ad} — Ödeme Yap</span>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="mh-drawer-body">
          <div className="ff-banka-kpi" style={{marginBottom:10}}>
            <div className="mh-kpi-card"><span className="mh-kpi-label">Kalan Borç</span><span className="mh-kpi-value">{TL(kayit.bakiye)}</span></div>
            {tip === 'Personel' && (<>
              <div className="mh-kpi-card"><span className="mh-kpi-label">Kalan Nakit</span><span className="mh-kpi-value">{TL(kayit.kalanNakit)}</span></div>
              <div className="mh-kpi-card"><span className="mh-kpi-label">Kalan Havale</span><span className="mh-kpi-value">{TL(kayit.kalanHavale)}</span></div>
            </>)}
          </div>
          {tip === 'Personel' && kayit.devamsizGun > 0 && (
            <p className="mh-hint" style={{color:'#c62828'}}>
              Bu ay {kayit.devamsizGun} gün devamsızlık var — karşılığı yaklaşık {TL(gunlukUcret * kayit.devamsizGun)}.
              Kesinti yapmak için listedeki devamsızlık rozetini kullanın.
            </p>
          )}

          <label className="ff-label">Ödeme Tarihi</label>
          <TarihSecici value={tarih} onChange={setTarih} />

          <label className="ff-label">Ödeme Türü</label>
          <div className="ff-odeme-turleri">
            {['Nakit','Banka Havalesi','Kredi Kartı'].map(t => (
              <button key={t} type="button" className={`ff-odeme-btn ${odemeTuru===t?'ff-odeme-secili':''}`}
                onClick={()=>{setOdemeTuru(t);setOdemeDetay('');}}>{t}</button>
            ))}
          </div>

          {odemeTuru === 'Nakit' && (
            <>
              <label className="ff-label">Kasa</label>
              <div className="ff-odeme-turleri">
                <button type="button" className={`ff-odeme-btn ${kasaKaynak==='anaKasa'?'ff-odeme-secili':''}`}
                  onClick={()=>setKasaKaynak('anaKasa')}>Ana Kasa</button>
                {bugunMu && (
                  <button type="button" className={`ff-odeme-btn ${kasaKaynak==='gunlukKasa'?'ff-odeme-secili':''}`}
                    onClick={()=>setKasaKaynak('gunlukKasa')}>Günlük Kasa</button>
                )}
              </div>
              {!bugunMu && <p className="mh-hint">Geçmiş tarihli ödeme: o günün günsonu kapandığı için sadece ana kasa seçilebilir.</p>}
            </>
          )}

          {(odemeTuru === 'Banka Havalesi' || odemeTuru === 'Kredi Kartı') && (
            <>
              <label className="ff-label">Hesap / Kart</label>
              <select className="ff-select" value={odemeDetay} onChange={e=>setOdemeDetay(e.target.value)}>
                <option value="">— Seçin —</option>
                {hesaplar(odemeTuru).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              {(odemeDetay === 'Hasret Cepten' || odemeDetay === 'Hasan Cepten') && (
                <p className="mh-hint">Bu ödeme ortaklar carisine alacak olarak da yazılır.</p>
              )}
            </>
          )}

          {tip === 'Personel' && (
            <>
              <button className="mh-secondary-btn" style={{marginTop:10}} onClick={()=>setAvansAcik(a=>!a)}>
                Avans Hesapla
              </button>
              {avansAcik && (
                <div className="mh-table-card" style={{padding:10,marginTop:8}}>
                  <p className="mh-hint">Günlük ücret: {TL(gunlukUcret)} (net maaş ÷ 30)</p>
                  <label className="ff-label">Çalışılan gün</label>
                  <input className="ff-input" type="number" step="0.5" value={avansGun} onChange={e=>setAvansGun(e.target.value)} />
                  <p style={{marginTop:6}}><strong>Hesaplanan: {TL(avansSonuc)}</strong></p>
                  <p className="mh-hint">Tutarı aşağıya kendiniz yazın.</p>
                </div>
              )}
            </>
          )}

          <label className="ff-label">Ödeme Tutarı *</label>
          <input className="ff-input" type="number" step="any" value={tutar} onChange={e=>setTutar(e.target.value)} />
          <label className="ff-label">Açıklama</label>
          <input className="ff-input" value={aciklama} onChange={e=>setAciklama(e.target.value)} placeholder="Avans, maaş, kısmi ödeme…" />

          <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
            <button className="mh-secondary-btn" onClick={onClose}>Vazgeç</button>
            <button className="mh-primary-btn" disabled={kaydediyor || !tutar} onClick={kaydet}>
              {kaydediyor ? '…' : 'Ödemeyi Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Devamsızlık: kayıt ekle/sil + kesinti uygula.
function DevamsizlikModal({ personel, donem, showToast, onClose, onSaved }) {
  const [tarih, setTarih] = useState(bugunTR());
  const [tur, setTur] = useState('Tam');
  const [aciklama, setAciklama] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const [kesintiAcik, setKesintiAcik] = useState(false);
  const [kesintiKaynak, setKesintiKaynak] = useState('Nakit');
  const [kesintiTutar, setKesintiTutar] = useState('');

  const gunlukUcret = personel.netMaas ? personel.netMaas / 30 : 0;
  const onerilen = Math.round(gunlukUcret * (personel.devamsizGun || 0) * 100) / 100;

  async function ekle() {
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=devamsizlik', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personelId: personel.id, tarih, tur, aciklama }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast('Devamsızlık kaydedildi');
      onSaved();
    } catch (e) { showToast('Kaydedilemedi: ' + e.message); }
    finally { setKaydediyor(false); }
  }

  async function sil(id) {
    try {
      const res = await fetch('/api/muhasebe?resource=devamsizlik', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ islem: 'sil', id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'hata');
      showToast('Silindi'); onSaved();
    } catch (e) { showToast('Silinemedi: ' + e.message); }
  }

  async function kesintiYap() {
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=tahakkukOdeme', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tip: 'Personel', kayitId: personel.id, tarih: bugunTR(),
          odemeTuru: 'Kesinti', limitKaynak: kesintiKaynak, tutar: kesintiTutar,
          aciklama: `Devamsızlık kesintisi (${personel.devamsizGun} gün)`,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast(`Kesinti uygulandı — kalan borç ${TL(j.yeniBakiye)}`);
      onSaved();
    } catch (e) { showToast(e.message); }
    finally { setKaydediyor(false); }
  }

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <div className="mh-drawer-head">
          <span>{personel.adSoyad} — Devamsızlık</span>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="mh-drawer-body">
          <p><strong>{donemEtiket(donem)} toplam: {personel.devamsizGun || 0} gün</strong></p>
          {(personel.devamsizlik || []).length > 0 && (
            <table className="mh-excel-table" style={{marginBottom:10}}>
              <thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th></th></tr></thead>
              <tbody>
                {personel.devamsizlik.map(d => (
                  <tr key={d.id}>
                    <td>{d.tarih}</td><td>{d.tur}</td><td>{d.aciklama}</td>
                    <td><button className="mh-secondary-btn" onClick={()=>sil(d.id)}>Sil</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <label className="ff-label">Gelmediği Gün</label>
          <TarihSecici value={tarih} onChange={setTarih} />
          <label className="ff-label">Tür</label>
          <div className="ff-odeme-turleri">
            {['Tam','Yarım'].map(t => (
              <button key={t} type="button" className={`ff-odeme-btn ${tur===t?'ff-odeme-secili':''}`}
                onClick={()=>setTur(t)}>{t} gün</button>
            ))}
          </div>
          <label className="ff-label">Açıklama</label>
          <input className="ff-input" value={aciklama} onChange={e=>setAciklama(e.target.value)} />
          <button className="mh-primary-btn" style={{marginTop:10}} disabled={kaydediyor} onClick={ekle}>
            Devamsızlık Ekle
          </button>

          <hr style={{margin:'14px 0',opacity:0.3}} />
          <p className="mh-hint">Günlük ücret {TL(gunlukUcret)} — {personel.devamsizGun || 0} gün karşılığı {TL(onerilen)}</p>
          <button className="mh-secondary-btn" onClick={()=>{setKesintiAcik(a=>!a);setKesintiTutar(String(onerilen||''));}}>
            Kesinti Yap
          </button>
          {kesintiAcik && (
            <div className="mh-table-card" style={{padding:10,marginTop:8}}>
              <label className="ff-label">Nereden düşülsün?</label>
              <div className="ff-odeme-turleri">
                {['Nakit','Havale'].map(k => (
                  <button key={k} type="button" className={`ff-odeme-btn ${kesintiKaynak===k?'ff-odeme-secili':''}`}
                    onClick={()=>setKesintiKaynak(k)}>{k} sınırından</button>
                ))}
              </div>
              <label className="ff-label">Kesinti tutarı</label>
              <input className="ff-input" type="number" step="any" value={kesintiTutar} onChange={e=>setKesintiTutar(e.target.value)} />
              <p className="mh-hint">Kesinti cari borçtan düşer, gider o kadar azalır.</p>
              <button className="mh-primary-btn" style={{marginTop:8}} disabled={kaydediyor || !kesintiTutar} onClick={kesintiYap}>
                Kesintiyi Uygula
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HareketDokumuModal({ ad, onClose }) {
  const [veri, setVeri] = useState(null);
  useEffect(() => {
    fetch(`/api/muhasebe?resource=tahakkukHareket&ad=${encodeURIComponent(ad)}`)
      .then(r=>r.json()).then(setVeri).catch(()=>setVeri({ hareketler: [] }));
  }, [ad]);

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:640}}>
        <div className="mh-drawer-head">
          <span>{ad} — Hareket Dökümü</span>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="mh-drawer-body">
          {!veri ? <p className="mh-empty">Yükleniyor…</p> : (veri.hareketler || []).length === 0 ? (
            <p className="mh-empty">Hareket yok.</p>
          ) : (
            <>
              <p><strong>Güncel bakiye: {TL(veri.bakiye || 0)}</strong></p>
              <table className="mh-excel-table">
                <thead><tr><th>Tarih</th><th>Tür</th><th>Kanal</th><th>Tutar</th><th>Açıklama</th></tr></thead>
                <tbody>
                  {veri.hareketler.map(h => (
                    <tr key={h.id}>
                      <td>{h.tarih}</td>
                      <td><span className={`mh-durum ${h.tip==='Tahakkuk'?'mh-durum-kirmizi':'mh-durum-yesil'}`}>{h.tip}</span></td>
                      <td>{h.kanal}</td>
                      <td className="mh-tutar-cell">{TL(h.tutar)}</td>
                      <td>{h.aciklama}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SabitGiderlerSekmesi({ showToast }) {
  const [donem, setDonem] = useState(donemBugun());
  const [giderler, setGiderler] = useState([]);
  const [kategoriler, setKategoriler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formModal, setFormModal] = useState(null);
  const [odemeModal, setOdemeModal] = useState(null);
  const [hareketModal, setHareketModal] = useState(null);
  const [tahakkukEdiliyor, setTahakkukEdiliyor] = useState(false);

  async function yukle() {
    setLoading(true);
    try {
      const [gRes, kRes] = await Promise.all([
        fetch(`/api/muhasebe?resource=sabitGider&donem=${donem}`),
        fetch('/api/muhasebe?resource=kategoriler'),
      ]);
      const g = await gRes.json();
      const k = await kRes.json();
      setGiderler(g.giderler || []);
      setKategoriler(k.kategoriler || []);
    } catch { showToast('Liste yüklenemedi'); }
    finally { setLoading(false); }
  }
  useEffect(() => { yukle(); }, [donem]);

  async function topluTahakkuk() {
    setTahakkukEdiliyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=tahakkukEt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tip: 'SabitGider', toplu: true, donem }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      const atl = (j.atlanan || []).filter(a => !a.tutarsiz);
      showToast((j.yazilan || []).length
        ? `${j.yazilan.length} tahakkuk yazıldı${atl.length ? `, ${atl.length} zaten edilmişti (mükerrer kayıt yok)` : ''}`
        : (atl.length ? 'Bu dönem zaten tahakkuk edilmiş — mükerrer kayıt yapılmadı' : 'Tahakkuk edilecek kayıt yok'));
      yukle();
    } catch (e) { showToast('Tahakkuk edilemedi: ' + e.message); }
    finally { setTahakkukEdiliyor(false); }
  }

  const aktifler = giderler.filter(g => !g.pasif || g.bakiye > 0.01);

  return (
    <div className="mh-yeni">
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, marginBottom:12 }}>
        <strong>Dönem:</strong>
        <input type="month" className="ff-input" style={{width:160}} value={donem} onChange={e=>setDonem(e.target.value)} />
        <button className="mh-primary-btn" disabled={tahakkukEdiliyor} onClick={topluTahakkuk}>
          {tahakkukEdiliyor ? '…' : `Toplu Tahakkuk Et (${donemEtiket(donem)})`}
        </button>
        <button className="mh-secondary-btn" onClick={()=>setFormModal({})}>+ Yeni Sabit Gider</button>
      </div>

      <div className="mh-table-card">
        {loading ? <p className="mh-empty">Yükleniyor…</p> : aktifler.length === 0 ? (
          <p className="mh-empty">Henüz sabit gider tanımlanmamış.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr><th>Gider</th><th>Kategori</th><th>Aylık Tutar</th><th>Ödeme Günü</th><th>Kalan Borç</th><th>Son Tahakkuk</th><th>Durum</th><th>İşlemler</th></tr>
            </thead>
            <tbody>
              {aktifler.map(g => (
                <tr key={g.id}>
                  <td>{g.ad}</td>
                  <td>{g.kategori}</td>
                  <td className="mh-tutar-cell">{TL(g.tutar)}</td>
                  <td>{g.odemeGunu ? `Her ayın ${g.odemeGunu}'i` : '—'}</td>
                  <td className="mh-tutar-cell"><strong>{TL(g.bakiye)}</strong></td>
                  <td>{g.sonTahakkukDonem ? `${donemEtiket(g.sonTahakkukDonem)} (${g.sonTahakkukTarih})` : '—'}</td>
                  <td>
                    {g.pasif && <span className="mh-durum mh-durum-kirmizi">Pasif</span>}
                    {!g.pasif && !g.tahakkukEdildi && <span className="mh-durum mh-durum-kirmizi">Bu ay tahakkuk yok</span>}
                  </td>
                  <td>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {!g.tahakkukEdildi && !g.pasif && (
                        <button className="mh-secondary-btn"
                          onClick={()=>tahakkukTekil('SabitGider', g, g.tutar, donem, showToast, yukle)}>Tahakkuk Et</button>
                      )}
                      <button className="mh-secondary-btn" onClick={()=>setOdemeModal(g)}>Ödeme Yap</button>
                      <button className="mh-secondary-btn" onClick={()=>setHareketModal({ ad:g.ad })}>Hareketler</button>
                      <button className="mh-secondary-btn" onClick={()=>setFormModal(g)}>Düzenle</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formModal && (
        <SabitGiderFormModal kayit={formModal} kategoriler={kategoriler} showToast={showToast}
          onClose={()=>setFormModal(null)} onSaved={()=>{setFormModal(null);yukle();}} />
      )}
      {odemeModal && (
        <TahakkukOdemeModal tip="SabitGider" kayit={odemeModal} donem={donem} showToast={showToast}
          onClose={()=>setOdemeModal(null)} onSaved={()=>{setOdemeModal(null);yukle();}} />
      )}
      {hareketModal && <HareketDokumuModal ad={hareketModal.ad} onClose={()=>setHareketModal(null)} />}
    </div>
  );
}

function SabitGiderFormModal({ kayit, kategoriler, showToast, onClose, onSaved }) {
  const yeni = !kayit.id;
  const [ad, setAd] = useState(kayit.ad || '');
  const [kategori, setKategori] = useState(kayit.kategori || '');
  const [tutar, setTutar] = useState(kayit.tutar ? String(kayit.tutar) : '');
  const [odemeGunu, setOdemeGunu] = useState(kayit.odemeGunu || '');
  const [pasif, setPasif] = useState(!!kayit.pasif);
  const [kaydediyor, setKaydediyor] = useState(false);

  async function kaydet() {
    if (!ad.trim()) { showToast('Gider adı gerekli'); return; }
    setKaydediyor(true);
    try {
      const res = await fetch('/api/muhasebe?resource=sabitGider', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kayit.id, ad, kategori, tutar, odemeGunu, pasif }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'hata');
      showToast(yeni ? 'Sabit gider eklendi' : 'Güncellendi');
      onSaved();
    } catch (e) { showToast('Kaydedilemedi: ' + e.message); }
    finally { setKaydediyor(false); }
  }

  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
        <div className="mh-drawer-head">
          <span>{yeni ? 'Yeni Sabit Gider' : 'Sabit Gider Düzenle'}</span>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="mh-drawer-body">
          <label className="ff-label">Gider Adı *</label>
          <input className="ff-input" value={ad} onChange={e=>setAd(e.target.value)} placeholder="Perpa Yönetim — Kira" />
          <label className="ff-label">Kategori</label>
          <select className="ff-select" value={kategori} onChange={e=>setKategori(e.target.value)}>
            <option value="">— Seçin —</option>
            {kategoriler.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <label className="ff-label">Aylık Tutar</label>
          <input className="ff-input" type="number" step="any" value={tutar} onChange={e=>setTutar(e.target.value)} />
          <label className="ff-label">Ödeme Günü (ayın kaçı)</label>
          <input className="ff-input" type="number" min="1" max="31" value={odemeGunu} onChange={e=>setOdemeGunu(e.target.value)} />
          <p className="mh-hint">Bu tarih sadece hatırlatma amaçlıdır, o gün ödemek zorunda değilsiniz.</p>
          {!yeni && (
            <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}>
              <input type="checkbox" checked={pasif} onChange={e=>setPasif(e.target.checked)} />
              Pasif (artık tahakkuk edilmesin)
            </label>
          )}
          <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
            <button className="mh-secondary-btn" onClick={onClose}>Vazgeç</button>
            <button className="mh-primary-btn" disabled={kaydediyor} onClick={kaydet}>{kaydediyor ? '…' : 'Kaydet'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}