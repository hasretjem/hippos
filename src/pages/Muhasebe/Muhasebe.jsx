import React, { useState, useEffect, useMemo } from 'react';
import './Muhasebe.css';
import { TL } from '../../hooks/useHipposData';
import { supabase } from '../../services/supabase';
import FaturaXmlIce from './FaturaXmlIce/FaturaXmlIce';
import {
  ArrowLeft, TrendingDown, TrendingUp, Truck, Users, ChefHat,
  Plus, Upload, X, Check, Search, MessageCircle, Trash2,
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
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  return (
    <div className="mh-shell">
      <button className="mh-back" onClick={() => onNavigate('settings')}><ArrowLeft size={16} /> Geri</button>

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
        <button className={anaTab === 'receteler' ? 'active' : ''} onClick={() => setAnaTab('receteler')}>
          <ChefHat size={15} /> Reçeteler
        </button>
      </div>

      <div className="mh-body">
        {anaTab === 'giderler' && <GiderlerSekmesi showToast={showToast} />}
        {anaTab === 'gelirler' && <GelirlerSekmesi showToast={showToast} />}
        {anaTab === 'toptancilar' && <ToptancilarCariSekmesi showToast={showToast} />}
        {anaTab === 'ortaklar' && <OrtaklarCariSekmesi showToast={showToast} />}
        {anaTab === 'receteler' && <ReceteSekmesi showToast={showToast} />}
      </div>

      {toast && <div className="mh-toast">{toast}</div>}
    </div>
  );
}

// ================== 1) GİDERLER / ALIŞLAR ==================
// Üç alt sekme: resmi fatura/fiş kayıtları, ham banka-kart ekstresi ve ikisi
// arasında henüz eşleşmemiş harcamaların bekleme havuzu.
function GiderlerSekmesi({ showToast }) {
  const [altTab, setAltTab] = useState('faturalar');
  // Ekstre yüklendiğinde "Faturası Beklenenler" rozetindeki sayı anında güncellensin diye
  // sayaç üst bileşende tutuluyor (alt sekmeler arası paylaşılan tek durum bu).
  const [bekleyenSayisi, setBekleyenSayisi] = useState(null);

  async function bekleyenSayisiniTazele() {
    try {
      const r = await fetch('/api/muhasebe?resource=ekstre&durum=fatura_bekliyor');
      const j = await r.json();
      setBekleyenSayisi((j.records || []).length);
    } catch { /* sayaç kritik değil, sessiz geç */ }
  }
  useEffect(() => { bekleyenSayisiniTazele(); }, []);

  return (
    <div className="mh-yeni">
      <div className="mh-alt-tabs">
        <button className={altTab === 'faturalar' ? 'active' : ''} onClick={() => setAltTab('faturalar')}>
          📄 Faturalar & Fişler
        </button>
        <button className={altTab === 'ekstre' ? 'active' : ''} onClick={() => setAltTab('ekstre')}>
          💳 Kredi Kartı & Banka Ekstresi
        </button>
        <button className={altTab === 'bekleyen' ? 'active' : ''} onClick={() => setAltTab('bekleyen')}>
          ⏳ Faturası Beklenenler
          {bekleyenSayisi > 0 && <span className="mh-rozet-sayi">{bekleyenSayisi}</span>}
        </button>
      </div>

      {altTab === 'faturalar' && <FaturalarAltSekmesi showToast={showToast} />}
      {altTab === 'ekstre' && <EkstreAltSekmesi showToast={showToast} yon="GİDEN" onDegisti={bekleyenSayisiniTazele} />}
      {altTab === 'bekleyen' && <FaturaBekleyenlerAltSekmesi showToast={showToast} onDegisti={bekleyenSayisiniTazele} />}
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
  const [islenen, setIslenen] = useState('');

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

  async function komisyonYaz(kayit) {
    setIslenen(kayit.id);
    try {
      const res = await fetch('/api/muhasebe?resource=giderler', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarih: kayit.tarih, kategori: 'Yemek Kart-Banka Masf.',
          tedarikciAciklama: `POS komisyon kesintisi — ${kayit.ciroTarihi} cirosu`,
          tutar: kayit.fark, odemeDurumu: 'Ödendi', belgeNo: 'Hakediş Farkı',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'kaydedilemedi');
      await fetch('/api/muhasebe?resource=ekstre', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kayit.id, eslesenKayitId: json.record.id }),
      });
      setKayitlar((prev) => prev.map((k) => (k.id === kayit.id ? { ...k, eslesenKayitId: json.record.id } : k)));
      showToast('Komisyon gideri kaydedildi');
    } catch (err) {
      showToast('Kaydedilemedi: ' + err.message);
    } finally {
      setIslenen('');
    }
  }

  const kpi = useMemo(() => {
    const eslesen = kayitlar.filter((k) => k.ciroTutari !== null);
    const toplamHakedis = kayitlar.reduce((s, k) => s + k.tutar, 0);
    const toplamFark = eslesen.reduce((s, k) => s + (k.fark || 0), 0);
    const eslesmeyen = kayitlar.length - eslesen.length;
    return { toplamHakedis, toplamFark, eslesmeyen };
  }, [kayitlar]);

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
        Hakediş genelde ertesi gün yattığı için aynı gün ve bir önceki günün cirosuna bakılıp
        yakın olan eşleştirilir. Aradaki fark komisyon kesintisi adayıdır.
      </p>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : kayitlar.length === 0 ? (
          <p className="mh-empty">Henüz POS hakediş kaydı yok. Ekstre yükleyince buraya düşer.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Yatış Tarihi</th><th>Bankaya Yatan</th><th>Eşleşen Ciro Günü</th>
                <th>Gün Sonu POS Cirosu</th><th>Fark</th><th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {kayitlar.map((k) => (
                <tr key={k.id}>
                  <td>{k.tarih}</td>
                  <td className="mh-tutar-cell">{TL(k.tutar)}</td>
                  <td>{k.ciroTarihi || <span className="mh-durum mh-durum-notr">eşleşme yok</span>}</td>
                  <td className="mh-tutar-cell">{k.ciroTutari !== null ? TL(k.ciroTutari) : '—'}</td>
                  <td className="mh-tutar-cell">
                    {k.fark === null ? '—'
                      : Math.abs(k.fark) < 0.01 ? <span className="mh-durum mh-durum-yesil">🟢 Tam</span>
                      : <span className="mh-durum mh-durum-kirmizi">{TL(k.fark)}</span>}
                  </td>
                  <td>
                    {k.eslesenKayitId
                      ? <span className="mh-durum mh-durum-yesil">🟢 İşlendi</span>
                      : k.fark !== null && k.fark > 0.01
                        ? <button className="mh-mini-btn" disabled={islenen === k.id} onClick={() => komisyonYaz(k)}>
                            {islenen === k.id ? '…' : 'Komisyonu Gidere Yaz'}
                          </button>
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
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
  const [altTab, setAltTab] = useState('satislar');
  return (
    <div className="mh-yeni">
      <div className="mh-alt-tabs">
        <button className={altTab === 'satislar' ? 'active' : ''} onClick={() => setAltTab('satislar')}>
          📊 Satışlar & Gün Sonu
        </button>
        <button className={altTab === 'yatanlar' ? 'active' : ''} onClick={() => setAltTab('yatanlar')}>
          🏦 Bankaya Yatanlar
        </button>
        <button className={altTab === 'hakedis' ? 'active' : ''} onClick={() => setAltTab('hakedis')}>
          ⚖️ Ciro & Hakediş Eşleştirme
        </button>
      </div>

      {altTab === 'satislar' && <SatislarAltSekmesi showToast={showToast} />}
      {altTab === 'yatanlar' && <EkstreAltSekmesi showToast={showToast} yon="GELEN" />}
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

// ================== 3) TOPTANCILAR VE CARİ TAKİBİ ==================
// Bakiye artık Sheets'teki eski 'Bakiye' sütunundan DEĞİL, Toptancı Hareketleri
// tablosunun toplamından hesaplanıyor (fatura +, ödeme -). FIFO kapama: ödeme
// yapıldığında en eski açık faturadan başlanarak borç düşülür (ekstre görünümünde
// ve dip bakiyede yansır — ayrı bir "kapatma" alanı tutulmuyor, sadece toplamla hesaplanıyor).
function ToptancilarCariSekmesi({ showToast }) {
  const [toptancilar, setToptancilar] = useState([]);
  const [hareketler, setHareketler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [arama, setArama] = useState('');
  const [durumFiltre, setDurumFiltre] = useState('tumu');
  const [odemeDrawerToptanci, setOdemeDrawerToptanci] = useState(null);
  const [yeniCariModal, setYeniCariModal] = useState(false);
  const [ekstreToptanci, setEkstreToptanci] = useState(null);

  async function yukle() {
    setLoading(true);
    try {
      const [tRes, hRes] = await Promise.all([
        fetch('/api/toptancilar'),
        fetch('/api/muhasebe?resource=toptanciHareket'),
      ]);
      const tJson = await tRes.json();
      const hJson = await hRes.json();
      setToptancilar(tJson.records || []);
      setHareketler(hJson.records || []);
    } catch {
      showToast('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { yukle(); }, []);

  // Her toptancı için: toplam fatura, toplam ödeme, bakiye, son işlem tarihi — hareketlerden.
  const toptanciOzet = useMemo(() => {
    const map = {};
    toptancilar.forEach((t) => { map[t.id] = { ...t, toplamFatura: 0, toplamOdenen: 0, bakiye: 0, sonIslemTarihi: null, sonIslemTs: 0 }; });
    hareketler.forEach((h) => {
      const rec = map[h.toptanciId];
      if (!rec) return;
      if (h.tur === 'fatura') rec.toplamFatura += h.tutar;
      if (h.tur === 'odeme') rec.toplamOdenen += h.tutar;
      const ts = trTarihiCoz(h.tarih)?.getTime() || 0;
      if (ts >= rec.sonIslemTs) { rec.sonIslemTs = ts; rec.sonIslemTarihi = h.tarih; }
    });
    Object.values(map).forEach((rec) => { rec.bakiye = Math.round((rec.toplamFatura - rec.toplamOdenen) * 100) / 100; });
    return Object.values(map);
  }, [toptancilar, hareketler]);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    return toptanciOzet
      .filter((t) => !q || t.firmaAdi.toLocaleLowerCase('tr-TR').includes(q))
      .filter((t) => {
        if (durumFiltre === 'borclu') return t.bakiye > 0.01;
        if (durumFiltre === 'alacakli') return t.bakiye < -0.01;
        if (durumFiltre === 'sifir') return Math.abs(t.bakiye) <= 0.01;
        return true;
      })
      .sort((a, b) => b.sonIslemTs - a.sonIslemTs);
  }, [toptanciOzet, arama, durumFiltre]);

  const kpi = useMemo(() => {
    // Net borç = pozitif bakiyeler toplamı (gerçek borcumuz).
    // Avans = negatif bakiyeler toplamı (fazla ödediklerimiz/alacaklarımız).
    const netBorc = toptanciOzet.reduce((s, t) => s + Math.max(0, t.bakiye), 0);
    const toplamAvans = toptanciOzet.reduce((s, t) => s + Math.max(0, -t.bakiye), 0);

    // "Bu Ay Yapılan Ödeme" KPI'ı — sadece bu ayın ödemeleri.
    // ÖNCEDEN: bu faturaya bakiyeyle tutarsız görünüyordu çünkü "Toplam Ödenen" sütunu
    // tüm zamanları, KPI sadece bu ayı gösteriyordu. Şimdi KPI etiketi netleştirildi.
    const buAyOdemeler = hareketler.filter((h) => h.tur === 'odeme' && tarihAraliktaMi(h.tarih, 'buAy'));
    const buAyToplamOdeme = buAyOdemeler.reduce((s, h) => s + h.tutar, 0);

    // Tüm zamanların toplam ödemesi — tablodaki "Toplam Ödenen" sütunlarının genel toplamıyla tutarlı.
    const tumZamanlarToplamOdeme = hareketler.filter((h) => h.tur === 'odeme').reduce((s, h) => s + h.tutar, 0);

    // 30+ gün gecikmiş açık borç (FIFO hesaplaması).
    const otuzGunOnce = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let gecikenBorc = 0;
    const hareketlerByToptanci = {};
    hareketler.forEach((h) => {
      if (!hareketlerByToptanci[h.toptanciId]) hareketlerByToptanci[h.toptanciId] = [];
      hareketlerByToptanci[h.toptanciId].push(h);
    });
    Object.values(hareketlerByToptanci).forEach((hs) => {
      const kronolojik = [...hs].sort((a, b) => (trTarihiCoz(a.tarih)?.getTime() || 0) - (trTarihiCoz(b.tarih)?.getTime() || 0));
      const acikFaturalar = [];
      let odemeHavuzu = 0;
      kronolojik.forEach((h) => {
        if (h.tur === 'odeme') odemeHavuzu += h.tutar;
        else acikFaturalar.push({ tutar: h.tutar, ts: trTarihiCoz(h.tarih)?.getTime() || 0 });
      });
      for (const f of acikFaturalar) {
        if (odemeHavuzu <= 0) break;
        const dusulen = Math.min(odemeHavuzu, f.tutar);
        f.tutar -= dusulen;
        odemeHavuzu -= dusulen;
      }
      acikFaturalar.forEach((f) => {
        if (f.tutar > 0.01 && f.ts && f.ts < otuzGunOnce) gecikenBorc += f.tutar;
      });
    });

    return { netBorc, toplamAvans, buAyToplamOdeme, tumZamanlarToplamOdeme, gecikenBorc };
  }, [toptanciOzet, hareketler]);

  return (
    <div className="mh-yeni">
      <div className="mh-kpi-row mh-kpi-row-4">
        <div className="mh-kpi-card mh-kpi-danger">
          <span className="mh-kpi-label">Toplam Borcumuz</span>
          <span className="mh-kpi-value">{TL(kpi.netBorc)}</span>
          <span className="mh-kpi-alt">Toptancılara açık borç</span>
        </div>
        {kpi.toplamAvans > 0.01 && (
          <div className="mh-kpi-card mh-kpi-yesil">
            <span className="mh-kpi-label">Toptancıdaki Avansımız</span>
            <span className="mh-kpi-value">{TL(kpi.toplamAvans)}</span>
            <span className="mh-kpi-alt">Fazla ödeme / alacak</span>
          </div>
        )}
        <div className="mh-kpi-card mh-kpi-warning">
          <span className="mh-kpi-label">30+ Gün Geciken Borç</span>
          <span className="mh-kpi-value">{TL(kpi.gecikenBorc)}</span>
          <span className="mh-kpi-alt">FIFO'ya göre vadesi geçmiş</span>
        </div>
        <div className="mh-kpi-card">
          <span className="mh-kpi-label">Bu Ay Ödenen</span>
          <span className="mh-kpi-value">{TL(kpi.buAyToplamOdeme)}</span>
          <span className="mh-kpi-alt">Toplam tüm zaman: {TL(kpi.tumZamanlarToplamOdeme)}</span>
        </div>
      </div>

      <div className="mh-actionbar">
        <div className="mh-filter-left-search">
          <Search size={15} />
          <input placeholder="Tedarikçi / Firma Ara..." value={arama} onChange={(e) => setArama(e.target.value)} />
        </div>
        <div className="mh-actions">
          <button className="mh-secondary-btn" onClick={() => setYeniCariModal(true)}><Users size={15} /> Yeni Cari Kartı</button>
          <button className="mh-primary-btn" onClick={() => setOdemeDrawerToptanci({})}><Plus size={15} /> Ödeme Yap</button>
        </div>
      </div>

      <div className="mh-filter-pills">
        <button className={durumFiltre === 'tumu' ? 'active' : ''} onClick={() => setDurumFiltre('tumu')}>Tümü</button>
        <button className={durumFiltre === 'borclu' ? 'active' : ''} onClick={() => setDurumFiltre('borclu')}>🔴 Borcumuz Olanlar</button>
        <button className={durumFiltre === 'alacakli' ? 'active' : ''} onClick={() => setDurumFiltre('alacakli')}>🟢 Alacaklı Olduklarımız</button>
        <button className={durumFiltre === 'sifir' ? 'active' : ''} onClick={() => setDurumFiltre('sifir')}>⚪ Bakiyesi Sıfır</button>
      </div>

      <div className="mh-table-card">
        {loading ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : filtreli.length === 0 ? (
          <p className="mh-empty">Kayıt bulunamadı.</p>
        ) : (
          <table className="mh-excel-table">
            <thead>
              <tr>
                <th>Tedarikçi / Firma Adı</th><th>Ana Harcama Grubu</th><th>Son İşlem Tarihi</th>
                <th>Toplam Fatura</th><th>Toplam Ödenen</th><th>Güncel Bakiye (Borç)</th><th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtreli.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.firmaAdi}</strong></td>
                  <td>{t.kategori || '-'}</td>
                  <td>{t.sonIslemTarihi || '-'}</td>
                  <td className="mh-tutar-cell">{TL(t.toplamFatura)}</td>
                  <td className="mh-tutar-cell">{TL(t.toplamOdenen)}</td>
                  <td className="mh-tutar-cell">
                    {Math.abs(t.bakiye) <= 0.01
                      ? <span className="mh-durum mh-durum-notr">⚪ {TL(0)}</span>
                      : t.bakiye > 0
                        ? <span className="mh-durum mh-durum-kirmizi">🔴 {TL(t.bakiye)}</span>
                        : <span className="mh-durum mh-durum-yesil">🟢 {TL(Math.abs(t.bakiye))}</span>}
                  </td>
                  <td className="mh-islem-cell">
                    <button className="mh-mini-btn" onClick={() => setOdemeDrawerToptanci(t)}>Ödeme Yap</button>
                    <button className="mh-mini-btn mh-mini-btn-ghost" onClick={() => setEkstreToptanci(t)}>Ekstre</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Seçili Listenin Net Bakiyesi</td>
                <td className="mh-tutar-cell">{TL(filtreli.reduce((s, t) => s + t.toplamOdenen, 0))}</td>
                <td className="mh-tutar-cell">
                  {(() => {
                    const net = filtreli.reduce((s, t) => s + t.bakiye, 0);
                    return net > 0.01
                      ? <span className="mh-durum mh-durum-kirmizi">🔴 {TL(net)}</span>
                      : net < -0.01
                        ? <span className="mh-durum mh-durum-yesil">🟢 {TL(Math.abs(net))} avansımız var</span>
                        : <span className="mh-durum mh-durum-notr">⚪ Sıfır</span>;
                  })()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {odemeDrawerToptanci && (
        <ToptanciOdemeDrawer
          toptancilar={toptancilar}
          secili={odemeDrawerToptanci}
          onClose={() => setOdemeDrawerToptanci(null)}
          onSaved={(rec, kapatilan) => {
            setHareketler((prev) => [rec, ...prev]);
            setOdemeDrawerToptanci(null);
            showToast(kapatilan > 0 ? `Ödeme kaydedildi, ${kapatilan} fatura kalemi ödendi olarak işaretlendi` : 'Ödeme kaydedildi');
          }}
        />
      )}

      {yeniCariModal && (
        <YeniToptanciModal
          onClose={() => setYeniCariModal(false)}
          onSaved={(rec) => { setToptancilar((prev) => [...prev, rec]); setYeniCariModal(false); showToast('Cari kartı açıldı'); }}
        />
      )}

      {ekstreToptanci && (
        <ToptanciEkstreModal
          toptanci={ekstreToptanci}
          hareketler={hareketler.filter((h) => h.toptanciId === ekstreToptanci.id).sort((a, b) => (trTarihiCoz(a.tarih)?.getTime() || 0) - (trTarihiCoz(b.tarih)?.getTime() || 0))}
          onClose={() => setEkstreToptanci(null)}
        />
      )}
    </div>
  );
}

function ToptanciOdemeDrawer({ toptancilar, secili, onClose, onSaved }) {
  const [toptanciId, setToptanciId] = useState(secili.id || '');
  const [tutar, setTutar] = useState('');
  const [odemeYontemi, setOdemeYontemi] = useState('Banka Havalesi / EFT');
  const [tarih, setTarih] = useState(bugunInputISO());
  const [aciklama, setAciklama] = useState('');
  const [saving, setSaving] = useState(false);

  async function kaydet() {
    if (!toptanciId || !tutar) return;
    setSaving(true);
    try {
      const res = await fetch('/api/muhasebe?resource=toptanciHareket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toptanciId, tarih: inputISOtoTr(tarih), tutar: ondalikParse(tutar), odemeYontemi, aciklama }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'save failed');
      onSaved(json.record, json.kapatilanFaturaSayisi || 0);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="mh-drawer-overlay" onClick={onClose}>
      <div className="mh-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mh-drawer-head">
          <span>Ödeme / Tahsilat Yap</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mh-drawer-body">
          <div className="mh-field">
            <label>Firma</label>
            <select className="mh-tabbable" value={toptanciId} onChange={(e) => setToptanciId(e.target.value)} onKeyDown={handleTabEnter}>
              <option value="">Seçiniz</option>
              {toptancilar.map((t) => <option key={t.id} value={t.id}>{t.firmaAdi}</option>)}
            </select>
          </div>
          <div className="mh-field">
            <label>Ödeme Tutarı (TL)</label>
            <input className="mh-tabbable" value={tutar} onChange={(e) => setTutar(e.target.value)} onKeyDown={handleTabEnter} inputMode="decimal" />
          </div>
          <div className="mh-field">
            <label>Ödeme Yöntemi</label>
            <select className="mh-tabbable" value={odemeYontemi} onChange={(e) => setOdemeYontemi(e.target.value)} onKeyDown={handleTabEnter}>
              <option>Banka Havalesi / EFT</option><option>Nakit (Kasa)</option><option>Kredi Kartı</option>
            </select>
          </div>
          <div className="mh-field">
            <label>Tarih</label>
            <input className="mh-tabbable" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Açıklama / Dekont No</label>
            <input className="mh-tabbable" value={aciklama} onChange={(e) => setAciklama(e.target.value)} onKeyDown={handleTabEnter} />
          </div>
        </div>
        <div className="mh-drawer-foot">
          <button className="mh-primary-btn" disabled={saving || !toptanciId || !tutar || !tarih} onClick={kaydet}>
            <Check size={15} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function YeniToptanciModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ firmaAdi: '', kategori: '', telefon: '', yetkiliKisi: '', adres: '', not: '' });
  const [saving, setSaving] = useState(false);

  async function kaydet() {
    if (!form.firmaAdi.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/toptancilar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
          <span>Yeni Cari Kartı Aç</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mh-drawer-body">
          <div className="mh-field">
            <label>Firma Adı</label>
            <input className="mh-tabbable" autoFocus value={form.firmaAdi} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false"
              onChange={(e) => setForm((p) => ({ ...p, firmaAdi: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Ana Harcama Grubu</label>
            <input className="mh-tabbable" value={form.kategori} placeholder="örn. Tavuk Alışı"
              onChange={(e) => setForm((p) => ({ ...p, kategori: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Telefon</label>
            <input className="mh-tabbable" value={form.telefon} onChange={(e) => setForm((p) => ({ ...p, telefon: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Yetkili Kişi</label>
            <input className="mh-tabbable" value={form.yetkiliKisi} onChange={(e) => setForm((p) => ({ ...p, yetkiliKisi: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Adres</label>
            <textarea className="mh-tabbable" value={form.adres} onChange={(e) => setForm((p) => ({ ...p, adres: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Not</label>
            <textarea className="mh-tabbable" value={form.not} onChange={(e) => setForm((p) => ({ ...p, not: e.target.value }))} onKeyDown={handleTabEnter} />
          </div>
        </div>
        <div className="mh-drawer-foot">
          <button className="mh-primary-btn" disabled={saving || !form.firmaAdi.trim()} onClick={kaydet}>
            <Check size={15} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function ToptanciEkstreModal({ toptanci, hareketler, onClose }) {
  let kosuBakiye = 0;
  return (
    <div className="mh-drawer-overlay mh-drawer-overlay-center" onClick={onClose}>
      <div className="mh-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="mh-drawer-head">
          <span>{toptanci.firmaAdi} — Hesap Ekstresi</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mh-drawer-body">
          {hareketler.length === 0 ? (
            <p className="mh-empty">Hiç hareket yok.</p>
          ) : (
            <table className="mh-excel-table">
              <thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th>Tutar</th><th>Bakiye</th></tr></thead>
              <tbody>
                {hareketler.map((h) => {
                  kosuBakiye += h.tur === 'fatura' ? h.tutar : -h.tutar;
                  return (
                    <tr key={h.id}>
                      <td>{h.tarih}</td>
                      <td>{h.tur === 'fatura' ? 'Fatura (+)' : 'Ödeme (-)'}</td>
                      <td>{h.aciklama || '-'}</td>
                      <td className="mh-tutar-cell">{h.tur === 'fatura' ? TL(h.tutar) : `-${TL(h.tutar)}`}</td>
                      <td className="mh-tutar-cell">{TL(kosuBakiye)}</td>
                    </tr>
                  );
                })}
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