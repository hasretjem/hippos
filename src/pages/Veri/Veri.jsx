// ============================================================
// VERİ SAYFASI — Supabase'deki tüm tabloları görme, düzenleme, silme.
// Yönetim Paneli > "Veri" butonundan açılır.
//
// Tarayıcı doğrudan Supabase'e bağlanıyor (yeni Vercel fonksiyonu YOK).
// Tablo listesi ve kolon bilgisi veritabanındaki iki fonksiyondan geliyor:
//   veri_tablo_listesi(), veri_tablo_kolonlari(tablo)
//
// Eski kasa PC'leri için: ağır tablo bileşeni yok, sayfa başına 50 satır,
// satır sayıları count(*) yerine Postgres istatistiğinden (anında gelir).
//
// KORUMA: Supabase, izin olmadığında güncelleme/silmeyi HATA VERMEDEN yok
// sayabiliyor (teslimat fotoğraflarında yaşadık). O yüzden her yazma işleminden
// sonra etkilenen satırları geri istiyor ve sayıyı doğruluyoruz.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Search, RefreshCw, Trash2, Download, X, ChevronLeft, ChevronRight,
  Undo2, Save, Wrench, Table2, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import './Veri.css';

const SAYFA_BOYUTU = 50;
const DB_LIMIT = 500 * 1024 * 1024; // Supabase ücretsiz plan: 500 MB
const TOPLU_SILME_LIMIT = 1000;
const CSV_LIMIT = 5000;
const TZ = 'Europe/Istanbul';

// Tablo adları ve grupları — teknik ad yerine anlaşılır ad.
// Listede olmayan yeni bir tablo açılırsa "Diğer" grubunda teknik adıyla görünür.
const TABLO_BILGI = {
  sales_history: ['Satış', 'Satışlar'],
  sold_items: ['Satış', 'Satılan ürünler'],
  table_state: ['Satış', 'Açık masalar'],
  orders: ['Satış', 'Siparişler'],
  order_items: ['Satış', 'Sipariş kalemleri'],
  tables: ['Satış', 'Masalar'],
  customers: ['Satış', 'Müşteriler'],
  action_history: ['Satış', 'İşlem geçmişi'],
  store_settings: ['Satış', 'Mağaza ayarları'],
  receipt_seq: ['Satış', 'Eski fiş sayacı'],
  products: ['Menü', 'Ürünler'],
  categories: ['Menü', 'Kategoriler'],
  subcategories: ['Menü', 'Alt kategoriler'],
  cariler: ['Cari', 'Cari kartlar'],
  cari_hareketler: ['Cari', 'Cari hareketleri'],
  cari_odemeler: ['Cari', 'Cari ödemeleri'],
  cari_faturalar: ['Cari', 'Cari faturaları'],
  cari_gecmis: ['Cari', 'Cari geçmişi'],
  cari_personel: ['Cari', 'Cari personeli'],
  packages: ['Paket ve teslimat', 'Paketler'],
  package_meta: ['Paket ve teslimat', 'Paket bilgileri'],
  paket_teslimatlari: ['Paket ve teslimat', 'Paket teslimatları'],
  cari_teslimat_bildirimleri: ['Paket ve teslimat', 'Cari teslimat bildirimleri'],
  mutfak_hazir_notlar: ['Paket ve teslimat', 'Mutfak hazır notları'],
  ds_kitchen_quick_notes: ['Paket ve teslimat', 'Mutfak hızlı notları'],
  ekmek_stok: ['Stok ve ekmek', 'Ekmek stoğu'],
  stok_sayimlari: ['Stok ve ekmek', 'Stok sayımları'],
  stok_takip_urunleri: ['Stok ve ekmek', 'Stok takip ürünleri'],
  bosvar_bildirimleri: ['Stok ve ekmek', 'Boş/var bildirimleri'],
  bosvar_kayitlari: ['Stok ve ekmek', 'Boş/var kayıtları'],
  gs_kayitlar: ['Gün sonu', 'Gün sonu kayıtları'],
  gunluk_harcama_taslak: ['Gün sonu', 'Günlük harcama taslağı'],
  mh_fatura_fis: ['Muhasebe', 'Fatura ve fişler'],
  mh_tahsilat: ['Muhasebe', 'Tahsilat makbuzları'],
  mh_giderler: ['Muhasebe', 'Giderler'],
  mh_gelirler: ['Muhasebe', 'Gelirler'],
  mh_kategoriler: ['Muhasebe', 'Gider kategorileri'],
  mh_firmalar: ['Muhasebe', 'Fatura firmaları'],
  mh_odeme_yontemleri: ['Muhasebe', 'Ödeme yöntemleri'],
  mh_banka_kart: ['Muhasebe', 'Banka ve kart hareketleri'],
  mh_ekstre: ['Muhasebe', 'Banka ekstresi'],
  mh_toptancilar: ['Muhasebe', 'Toptancılar'],
  mh_toptanci_hareketleri: ['Muhasebe', 'Toptancı hareketleri'],
  mh_ortak_hareketleri: ['Muhasebe', 'Ortak hareketleri'],
  mh_personel: ['Muhasebe', 'Personel'],
  mh_devamsizlik: ['Muhasebe', 'Devamsızlık'],
  mh_tahakkuklar: ['Muhasebe', 'Tahakkuklar'],
  mh_sabit_giderler: ['Muhasebe', 'Sabit giderler'],
  mh_yk_kartlar: ['Muhasebe', 'Yemek kartı tanımları'],
  mh_yk_faturalar: ['Muhasebe', 'Yemek kartı faturaları'],
  mh_ayarlar: ['Muhasebe', 'Muhasebe ayarları'],
  mh_tedarikci_kategori: ['Muhasebe', 'Tedarikçi kategori sözlüğü'],
  mh_eslestirme: ['Muhasebe', 'Malzeme eşleştirme sözlüğü'],
  mh_xml_log: ['Muhasebe', 'XML içe aktarma kaydı'],
  rc_malzemeler: ['Reçete ve malzeme', 'Malzeme havuzu'],
  rc_maliyet_gecmisi: ['Reçete ve malzeme', 'Malzeme maliyet geçmişi'],
  rc_receteler: ['Reçete ve malzeme', 'Reçeteler'],
  rc_recete_kalemleri: ['Reçete ve malzeme', 'Reçete kalemleri'],
  realtime_usage_log: ['Sistem', 'Realtime kullanım kaydı (ham)'],
  rt_kullanim: ['Sistem', 'Realtime kullanım özeti'],
};
const GRUP_SIRASI = ['Satış', 'Menü', 'Cari', 'Paket ve teslimat', 'Stok ve ekmek', 'Gün sonu', 'Muhasebe', 'Reçete ve malzeme', 'Sistem', 'Diğer'];
const GRUP_RENK = {
  'Satış': '#E94F37', 'Menü': '#E8A33D', 'Cari': '#4CA47D', 'Paket ve teslimat': '#3E8EB5',
  'Stok ve ekmek': '#9A7B4F', 'Gün sonu': '#7A6FA8', 'Muhasebe': '#2E6E5E',
  'Reçete ve malzeme': '#B5694F', 'Sistem': '#83786B', 'Diğer': '#B8B2A3',
};

function tabloGrup(ad) { return (TABLO_BILGI[ad] || ['Diğer'])[0]; }
function tabloEtiket(ad) { return (TABLO_BILGI[ad] || [null, ad])[1]; }

function boyutYaz(bayt) {
  if (bayt == null) return '—';
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} KB`;
  return `${(bayt / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}
function sayiYaz(n) { return Number(n || 0).toLocaleString('tr-TR'); }

// ---- Tip yardımcıları ----
function tipSinifi(tip) {
  const t = (tip || '').toLowerCase();
  if (t === 'boolean') return 'bool';
  if (t === 'jsonb' || t === 'json') return 'json';
  if (t.startsWith('timestamp') || t === 'date') return 'tarih';
  if (t === 'bigint' || t === 'integer' || t === 'smallint' || t.startsWith('numeric') || t === 'real' || t === 'double precision') return 'sayi';
  if (t === 'uuid') return 'uuid';
  return 'metin';
}
// "ts" gibi milisaniye zaman damgası tutan bigint kolonları tarih olarak göster.
function msZamanMi(kolon, deger) {
  return (kolon === 'ts' || kolon.endsWith('_ts')) && typeof deger === 'number' && deger > 1e12 && deger < 1e14;
}
function hucreYaz(kolon, deger) {
  if (deger === null || deger === undefined) return null;
  if (typeof deger === 'boolean') return deger ? 'Evet' : 'Hayır';
  if (msZamanMi(kolon, deger)) return new Date(deger).toLocaleString('tr-TR', { timeZone: TZ });
  if (typeof deger === 'object') return JSON.stringify(deger);
  return String(deger);
}
function kisalt(s, n = 60) { return s && s.length > n ? `${s.slice(0, n)}…` : s; }

// Formdaki metni kolon tipine çevir. Hatalıysa { hata } döner.
function degerCevir(tipSinif, metin) {
  if (tipSinif === 'bool') return { deger: !!metin };
  if (metin === '' || metin === null || metin === undefined) {
    return { deger: tipSinif === 'metin' ? '' : null };
  }
  if (tipSinif === 'sayi') {
    const n = Number(String(metin).replace(',', '.'));
    if (!Number.isFinite(n)) return { hata: 'Sayı bekleniyor' };
    return { deger: n };
  }
  if (tipSinif === 'json') {
    try { return { deger: JSON.parse(metin) }; } catch { return { hata: 'Geçerli JSON değil' }; }
  }
  return { deger: metin };
}
function formaCevir(tipSinif, deger) {
  if (tipSinif === 'bool') return !!deger;
  if (deger === null || deger === undefined) return '';
  if (tipSinif === 'json') return JSON.stringify(deger, null, 2);
  return String(deger);
}

function pkNesnesi(pkKolonlari, satir) {
  const o = {};
  pkKolonlari.forEach((k) => { o[k] = satir[k]; });
  return o;
}
function pkAnahtar(pkKolonlari, satir) {
  return pkKolonlari.map((k) => String(satir[k])).join('␟');
}
// PostgREST .or() filtresinde virgül/parantez/tırnak sözdizimini bozar — temizle.
function aramaTemizle(s) { return s.replace(/[,()"\\]/g, ' ').trim(); }

// ============================================================
export default function Veri({ onNavigate }) {
  const [sekme, setSekme] = useState('tablolar');
  const [liste, setListe] = useState([]);
  const [dbBoyut, setDbBoyut] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [secili, setSecili] = useState(null);

  const listeYukle = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    const [l, b] = await Promise.all([
      supabase.rpc('veri_tablo_listesi'),
      supabase.rpc('veri_db_boyutu'),
    ]);
    if (l.error) setHata(`Tablo listesi alınamadı: ${l.error.message}`);
    else setListe(l.data || []);
    if (!b.error) setDbBoyut(b.data);
    setYukleniyor(false);
  }, []);

  useEffect(() => { listeYukle(); }, [listeYukle]);

  const seciliBilgi = useMemo(() => liste.find((t) => t.tablo === secili) || null, [liste, secili]);

  return (
    <div className="vr-shell">
      <div className="vr-ust">
        <button className="vr-geri" onClick={() => (secili ? setSecili(null) : onNavigate('settings'))}>
          <ArrowLeft size={16} /> {secili ? 'Tablolar' : 'Geri'}
        </button>
        {!secili && (
          <div className="vr-sekmeler" role="tablist">
            <button role="tab" aria-selected={sekme === 'tablolar'} className={sekme === 'tablolar' ? 'active' : ''} onClick={() => setSekme('tablolar')}>
              <Table2 size={16} /> Tablolar
            </button>
            <button role="tab" aria-selected={sekme === 'bakim'} className={sekme === 'bakim' ? 'active' : ''} onClick={() => setSekme('bakim')}>
              <Wrench size={16} /> Bakım
            </button>
          </div>
        )}
      </div>

      <div className="vr-govde">
        {hata && <div className="vr-hata"><AlertTriangle size={16} /> {hata}</div>}
        {secili && seciliBilgi ? (
          <TabloGorunumu bilgi={seciliBilgi} onListeYenile={listeYukle} />
        ) : sekme === 'tablolar' ? (
          <TabloListesi liste={liste} dbBoyut={dbBoyut} yukleniyor={yukleniyor} onSec={setSecili} onYenile={listeYukle} />
        ) : (
          <BakimPaneli liste={liste} dbBoyut={dbBoyut} onListeYenile={listeYukle} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// TABLO LİSTESİ + KAPASİTE ŞERİDİ
// ============================================================
function TabloListesi({ liste, dbBoyut, yukleniyor, onSec, onYenile }) {
  const [arama, setArama] = useState('');

  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    const g = {};
    liste.forEach((t) => {
      const etiket = tabloEtiket(t.tablo);
      if (q && !etiket.toLocaleLowerCase('tr-TR').includes(q) && !t.tablo.includes(q)) return;
      const grup = tabloGrup(t.tablo);
      (g[grup] = g[grup] || []).push(t);
    });
    return GRUP_SIRASI.filter((ad) => g[ad]).map((ad) => ({
      ad,
      tablolar: g[ad].sort((a, b) => b.boyut_bayt - a.boyut_bayt),
      boyut: g[ad].reduce((s, t) => s + Number(t.boyut_bayt || 0), 0),
    }));
  }, [liste, arama]);

  // Kapasite şeridi arama filtresinden bağımsız: her zaman tüm veritabanını gösterir.
  const serit = useMemo(() => {
    const g = {};
    liste.forEach((t) => { const a = tabloGrup(t.tablo); g[a] = (g[a] || 0) + Number(t.boyut_bayt || 0); });
    return GRUP_SIRASI.filter((a) => g[a]).map((a) => ({ ad: a, boyut: g[a] }));
  }, [liste]);

  const toplamSatir = liste.reduce((s, t) => s + Number(t.satir || 0), 0);
  const doluluk = dbBoyut ? Math.min(100, (dbBoyut / DB_LIMIT) * 100) : 0;

  return (
    <>
      <section className="vr-kapasite" aria-label="Veritabanı doluluğu">
        <div className="vr-kapasite-baslik">
          <span className="vr-kapasite-sayi">{dbBoyut ? boyutYaz(dbBoyut) : '…'}</span>
          <span className="vr-kapasite-limit">/ 500 MB kullanılıyor</span>
          <span className="vr-kapasite-ozet">{liste.length} tablo, {sayiYaz(toplamSatir)} satır</span>
        </div>
        <div className="vr-serit" role="img" aria-label={`Veritabanı yüzde ${doluluk.toFixed(0)} dolu`}>
          {dbBoyut && serit.map((s) => (
            <span key={s.ad} className="vr-serit-dilim" style={{ width: `${(s.boyut / DB_LIMIT) * 100}%`, background: GRUP_RENK[s.ad] }} title={`${s.ad}: ${boyutYaz(s.boyut)}`} />
          ))}
        </div>
        <ul className="vr-lejant">
          {serit.map((s) => (
            <li key={s.ad}><span className="vr-nokta" style={{ background: GRUP_RENK[s.ad] }} />{s.ad} <b>{boyutYaz(s.boyut)}</b></li>
          ))}
        </ul>
      </section>

      <div className="vr-arac">
        <label className="vr-arama">
          <Search size={16} aria-hidden="true" />
          <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Tablo ara" aria-label="Tablo ara" />
        </label>
        <button className="vr-btn" onClick={onYenile} disabled={yukleniyor}><RefreshCw size={15} /> Yenile</button>
      </div>

      {yukleniyor && !liste.length ? (
        <p className="vr-bos">Tablolar yükleniyor…</p>
      ) : !gruplar.length ? (
        <p className="vr-bos">"{arama}" ile eşleşen tablo yok.</p>
      ) : (
        gruplar.map((g) => (
          <section key={g.ad} className="vr-grup">
            <h2 className="vr-grup-ad">
              <span className="vr-nokta" style={{ background: GRUP_RENK[g.ad] }} />
              {g.ad}
              <span className="vr-grup-boyut">{boyutYaz(g.boyut)}</span>
            </h2>
            <ul className="vr-tablolar">
              {g.tablolar.map((t) => (
                <li key={t.tablo}>
                  <button className="vr-tablo-satir" onClick={() => onSec(t.tablo)}>
                    <span className="vr-tablo-ad">
                      {tabloEtiket(t.tablo)}
                      {t.canli && <span className="vr-canli" title="Canlı yayında: değişiklik tüm ekranlara anında yansır">canlı</span>}
                      <small>{t.tablo}</small>
                    </span>
                    <span className="vr-tablo-sayi">{sayiYaz(t.satir)} <small>satır</small></span>
                    <span className="vr-tablo-boyut">{boyutYaz(t.boyut_bayt)}</span>
                    <ChevronRight size={16} className="vr-ok" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

// ============================================================
// TABLO İÇİ GÖRÜNÜM
// ============================================================
function TabloGorunumu({ bilgi, onListeYenile }) {
  const tablo = bilgi.tablo;
  const pk = bilgi.pk || [];
  const canli = bilgi.canli;

  const [kolonlar, setKolonlar] = useState([]);
  const [satirlar, setSatirlar] = useState([]);
  const [toplam, setToplam] = useState(null);
  const [sayfa, setSayfa] = useState(0);
  const [siralama, setSiralama] = useState(null);
  const [aramaGirdi, setAramaGirdi] = useState('');
  const [arama, setArama] = useState('');
  const [tarihBas, setTarihBas] = useState('');
  const [tarihBit, setTarihBit] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [secimler, setSecimler] = useState(new Set());
  const [acikSatir, setAcikSatir] = useState(null);
  const [geriAl, setGeriAl] = useState(null); // { satirlar, mesaj }
  const [mesgul, setMesgul] = useState(false);
  const geriAlZamanlayici = useRef(null);

  // Kolonlar + varsayılan sıralama (en yeni üstte)
  useEffect(() => {
    let iptal = false;
    (async () => {
      const { data, error } = await supabase.rpc('veri_tablo_kolonlari', { p_tablo: tablo });
      if (iptal) return;
      if (error) { setHata(`Kolonlar alınamadı: ${error.message}`); return; }
      const k = (data || []).map((c) => ({ ...c, sinif: tipSinifi(c.tip) }));
      setKolonlar(k);
      const adlar = k.map((c) => c.kolon);
      const vars = ['ts', 'created_at', 'sira'].find((a) => adlar.includes(a));
      setSiralama(vars ? { kolon: vars, artan: false } : { kolon: pk[0] || adlar[0], artan: true });
    })();
    return () => { iptal = true; };
  }, [tablo]); // eslint-disable-line react-hooks/exhaustive-deps

  const tarihKolonu = useMemo(() => {
    if (kolonlar.some((c) => c.kolon === 'ts' && c.sinif === 'sayi')) return { kolon: 'ts', ms: true };
    const t = kolonlar.find((c) => c.sinif === 'tarih');
    return t ? { kolon: t.kolon, ms: false } : null;
  }, [kolonlar]);

  const filtreliSorgu = useCallback((q) => {
    if (arama) {
      const temiz = aramaTemizle(arama);
      const kosullar = [];
      kolonlar.forEach((c) => {
        if (c.sinif === 'metin') kosullar.push(`${c.kolon}.ilike.*${temiz}*`);
        else if (c.sinif === 'sayi' && /^-?\d+([.,]\d+)?$/.test(temiz)) kosullar.push(`${c.kolon}.eq.${temiz.replace(',', '.')}`);
      });
      if (kosullar.length) q = q.or(kosullar.join(','));
    }
    if (tarihKolonu && (tarihBas || tarihBit)) {
      const cevir = (s, gunSonu) => {
        const [y, a, g] = s.split('-').map(Number);
        const d = gunSonu ? new Date(y, a - 1, g, 23, 59, 59, 999) : new Date(y, a - 1, g, 0, 0, 0, 0);
        return tarihKolonu.ms ? d.getTime() : d.toISOString();
      };
      if (tarihBas) q = q.gte(tarihKolonu.kolon, cevir(tarihBas, false));
      if (tarihBit) q = q.lte(tarihKolonu.kolon, cevir(tarihBit, true));
    }
    return q;
  }, [arama, kolonlar, tarihKolonu, tarihBas, tarihBit]);

  const yukle = useCallback(async () => {
    if (!siralama || !kolonlar.length) return;
    setYukleniyor(true);
    setHata('');
    const filtreVar = !!(arama || tarihBas || tarihBit);
    let q = supabase.from(tablo).select('*', { count: filtreVar ? 'exact' : 'estimated' });
    q = filtreliSorgu(q);
    q = q.order(siralama.kolon, { ascending: siralama.artan, nullsFirst: false });
    q = q.range(sayfa * SAYFA_BOYUTU, sayfa * SAYFA_BOYUTU + SAYFA_BOYUTU - 1);
    const { data, error, count } = await q;
    if (error) { setHata(`Veri alınamadı: ${error.message}`); setSatirlar([]); }
    else { setSatirlar(data || []); setToplam(count); }
    setYukleniyor(false);
  }, [tablo, siralama, kolonlar, sayfa, filtreliSorgu, arama, tarihBas, tarihBit]);

  useEffect(() => { yukle(); }, [yukle]);
  useEffect(() => { setSayfa(0); setSecimler(new Set()); }, [arama, tarihBas, tarihBit, siralama]);
  useEffect(() => () => clearTimeout(geriAlZamanlayici.current), []);

  function siralamaDegistir(kolon) {
    setSiralama((s) => (s && s.kolon === kolon ? { kolon, artan: !s.artan } : { kolon, artan: true }));
  }

  function geriAlGoster(silinenler, mesaj) {
    clearTimeout(geriAlZamanlayici.current);
    setGeriAl({ satirlar: silinenler, mesaj });
    geriAlZamanlayici.current = setTimeout(() => setGeriAl(null), 10000);
  }

  // Silme — etkilenen satırları geri isteyip sayıyı doğruluyoruz (sessiz izin reddine karşı).
  async function satirlariSil(hedefler) {
    if (!hedefler.length) return;
    if (hedefler.length > TOPLU_SILME_LIMIT) {
      alert(`Tek seferde en fazla ${sayiYaz(TOPLU_SILME_LIMIT)} satır silinebilir.`);
      return;
    }
    const uyari = canli
      ? `"${tabloEtiket(tablo)}" CANLI bir tablo — kasalar bu veriyi şu an kullanıyor olabilir.\n\n${hedefler.length} satır silinecek. Emin misin?`
      : `${hedefler.length} satır silinecek. Emin misin?`;
    if (!window.confirm(uyari)) return;

    setMesgul(true);
    const silinenler = [];
    let hataMesaji = '';
    try {
      if (pk.length === 1) {
        for (let i = 0; i < hedefler.length; i += 100) {
          const dilim = hedefler.slice(i, i + 100);
          const { data, error } = await supabase.from(tablo).delete().in(pk[0], dilim.map((s) => s[pk[0]])).select();
          if (error) throw new Error(error.message);
          silinenler.push(...(data || []));
        }
      } else {
        for (const s of hedefler) {
          const { data, error } = await supabase.from(tablo).delete().match(pkNesnesi(pk, s)).select();
          if (error) throw new Error(error.message);
          silinenler.push(...(data || []));
        }
      }
    } catch (e) {
      hataMesaji = e.message;
    }
    setMesgul(false);

    if (silinenler.length < hedefler.length) {
      const eksik = hedefler.length - silinenler.length;
      setHata(hataMesaji
        ? `Silme yarıda kaldı: ${hataMesaji} (${silinenler.length} satır silindi)`
        : `${eksik} satır silinemedi — Supabase izin vermedi ya da satır zaten silinmişti.`);
    }
    if (silinenler.length) {
      geriAlGoster(silinenler, `${silinenler.length} satır silindi`);
      setSecimler(new Set());
      setAcikSatir(null);
      yukle();
      onListeYenile();
    }
  }

  async function geriAlUygula() {
    if (!geriAl) return;
    clearTimeout(geriAlZamanlayici.current);
    setMesgul(true);
    const { data, error } = await supabase.from(tablo).insert(geriAl.satirlar).select();
    setMesgul(false);
    setGeriAl(null);
    if (error) setHata(`Geri alınamadı: ${error.message}`);
    else if ((data || []).length < geriAl.satirlar.length) setHata(`Sadece ${(data || []).length} / ${geriAl.satirlar.length} satır geri yüklendi.`);
    yukle();
    onListeYenile();
  }

  async function satirKaydet(eski, degisiklikler) {
    if (!Object.keys(degisiklikler).length) return { ok: true };
    if (canli && !window.confirm(`"${tabloEtiket(tablo)}" CANLI bir tablo — değişiklik tüm ekranlara anında yansır. Kaydedilsin mi?`)) {
      return { ok: false, iptal: true };
    }
    setMesgul(true);
    const { data, error } = await supabase.from(tablo).update(degisiklikler).match(pkNesnesi(pk, eski)).select();
    setMesgul(false);
    if (error) return { ok: false, hata: error.message };
    if (!data || !data.length) return { ok: false, hata: 'Kayıt güncellenmedi — Supabase izin vermedi ya da satır bu arada silinmiş.' };
    setSatirlar((prev) => prev.map((s) => (pkAnahtar(pk, s) === pkAnahtar(pk, eski) ? data[0] : s)));
    return { ok: true, yeni: data[0] };
  }

  async function csvIndir() {
    setMesgul(true);
    const hepsi = [];
    try {
      for (let bas = 0; bas < CSV_LIMIT; bas += 1000) {
        let q = supabase.from(tablo).select('*');
        q = filtreliSorgu(q);
        q = q.order(siralama.kolon, { ascending: siralama.artan, nullsFirst: false }).range(bas, bas + 999);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        hepsi.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    } catch (e) {
      setMesgul(false);
      setHata(`CSV hazırlanamadı: ${e.message}`);
      return;
    }
    setMesgul(false);
    const adlar = kolonlar.map((c) => c.kolon);
    const kacis = (v) => {
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Excel Türkçe ayarında ayraç noktalı virgül; BOM Türkçe karakterler bozulmasın diye.
    const csv = '\uFEFF' + [adlar.join(';'), ...hepsi.map((r) => adlar.map((a) => kacis(r[a])).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tablo}_${new Date().toLocaleDateString('tr-TR', { timeZone: TZ }).replace(/\./g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (hepsi.length >= CSV_LIMIT) setHata(`CSV ilk ${sayiYaz(CSV_LIMIT)} satırla sınırlandı. Daha fazlası için tarih filtresi kullan.`);
  }

  const gosterilenKolonlar = kolonlar;
  const tumuSecili = satirlar.length > 0 && satirlar.every((s) => secimler.has(pkAnahtar(pk, s)));
  const sayfaSayisi = toplam != null ? Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU)) : null;

  function secimDegistir(s) {
    const k = pkAnahtar(pk, s);
    setSecimler((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function tumunuSec() {
    setSecimler((prev) => {
      const n = new Set(prev);
      if (tumuSecili) satirlar.forEach((s) => n.delete(pkAnahtar(pk, s)));
      else satirlar.forEach((s) => n.add(pkAnahtar(pk, s)));
      return n;
    });
  }
  const seciliSatirlar = satirlar.filter((s) => secimler.has(pkAnahtar(pk, s)));

  return (
    <div className="vr-tablo-gorunum">
      <header className="vr-tg-baslik">
        <div>
          <h1>{tabloEtiket(tablo)} {canli && <span className="vr-canli">canlı</span>}</h1>
          <p>
            <code>{tablo}</code> · {toplam != null ? `${sayiYaz(toplam)} satır` : '…'} · {boyutYaz(bilgi.boyut_bayt)}
          </p>
        </div>
        <div className="vr-tg-eylem">
          <button className="vr-btn" onClick={yukle} disabled={yukleniyor}><RefreshCw size={15} /> Yenile</button>
          <button className="vr-btn" onClick={csvIndir} disabled={mesgul || !kolonlar.length}><Download size={15} /> CSV indir</button>
        </div>
      </header>

      {canli && (
        <p className="vr-canli-not">
          <AlertTriangle size={15} /> Bu tablo canlı: yaptığın değişiklik kasalara ve paketçi ekranlarına anında yansır. Servis saatinde dikkatli ol.
        </p>
      )}

      <div className="vr-filtre">
        <form className="vr-arama" onSubmit={(e) => { e.preventDefault(); setArama(aramaGirdi.trim()); }}>
          <Search size={16} aria-hidden="true" />
          <input value={aramaGirdi} onChange={(e) => setAramaGirdi(e.target.value)} placeholder="Bu tabloda ara (Enter)" aria-label="Bu tabloda ara" />
          {arama && <button type="button" className="vr-ikon-btn" aria-label="Aramayı temizle" onClick={() => { setAramaGirdi(''); setArama(''); }}><X size={15} /></button>}
        </form>
        {tarihKolonu && (
          <div className="vr-tarih">
            <label>Başlangıç <input type="date" value={tarihBas} onChange={(e) => setTarihBas(e.target.value)} /></label>
            <label>Bitiş <input type="date" value={tarihBit} onChange={(e) => setTarihBit(e.target.value)} /></label>
            {(tarihBas || tarihBit) && <button className="vr-ikon-btn" aria-label="Tarih filtresini temizle" onClick={() => { setTarihBas(''); setTarihBit(''); }}><X size={15} /></button>}
          </div>
        )}
      </div>

      {secimler.size > 0 && (
        <div className="vr-secim-cubugu">
          <span>{secimler.size} satır seçili</span>
          <button className="vr-btn" onClick={() => setSecimler(new Set())}>Seçimi kaldır</button>
          <button className="vr-btn vr-tehlike" onClick={() => satirlariSil(seciliSatirlar)} disabled={mesgul || !seciliSatirlar.length}>
            <Trash2 size={15} /> Seçilenleri sil
          </button>
        </div>
      )}

      {hata && <div className="vr-hata"><AlertTriangle size={16} /> {hata} <button className="vr-ikon-btn" aria-label="Kapat" onClick={() => setHata('')}><X size={14} /></button></div>}

      {yukleniyor && !satirlar.length ? (
        <p className="vr-bos">Yükleniyor…</p>
      ) : !satirlar.length ? (
        <p className="vr-bos">{arama || tarihBas || tarihBit ? 'Filtreye uyan satır yok. Aramayı ya da tarihi değiştir.' : 'Bu tablo boş.'}</p>
      ) : (
        <>
          {/* Geniş ekran: tablo */}
          <div className="vr-izgara-kap">
            <table className="vr-izgara">
              <thead>
                <tr>
                  <th className="vr-secim-hucre"><input type="checkbox" checked={tumuSecili} onChange={tumunuSec} aria-label="Bu sayfadakilerin hepsini seç" /></th>
                  {gosterilenKolonlar.map((c) => (
                    <th key={c.kolon} aria-sort={siralama?.kolon === c.kolon ? (siralama.artan ? 'ascending' : 'descending') : 'none'}>
                      <button className="vr-th-btn" onClick={() => siralamaDegistir(c.kolon)} title={c.tip}>
                        {c.kolon}{c.pk && <span className="vr-pk" title="Birincil anahtar">🔑</span>}
                        {siralama?.kolon === c.kolon && <span aria-hidden="true">{siralama.artan ? ' ▲' : ' ▼'}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => {
                  const k = pkAnahtar(pk, s);
                  return (
                    <tr key={k} className={secimler.has(k) ? 'secili' : ''}>
                      <td className="vr-secim-hucre"><input type="checkbox" checked={secimler.has(k)} onChange={() => secimDegistir(s)} aria-label="Satırı seç" /></td>
                      {gosterilenKolonlar.map((c) => {
                        const v = hucreYaz(c.kolon, s[c.kolon]);
                        return (
                          <td key={c.kolon} onClick={() => setAcikSatir(s)} className={c.sinif === 'sayi' ? 'sayi' : ''}>
                            {v === null ? <span className="vr-null">—</span> : kisalt(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Dar ekran: kartlar */}
          <ul className="vr-kartlar">
            {satirlar.map((s) => {
              const k = pkAnahtar(pk, s);
              return (
                <li key={k} className={secimler.has(k) ? 'secili' : ''}>
                  <input type="checkbox" checked={secimler.has(k)} onChange={() => secimDegistir(s)} aria-label="Satırı seç" />
                  <button className="vr-kart" onClick={() => setAcikSatir(s)}>
                    {gosterilenKolonlar.slice(0, 5).map((c) => {
                      const v = hucreYaz(c.kolon, s[c.kolon]);
                      return (
                        <span key={c.kolon} className="vr-kart-alan">
                          <small>{c.kolon}</small>
                          <span>{v === null ? '—' : kisalt(v, 40)}</span>
                        </span>
                      );
                    })}
                  </button>
                </li>
              );
            })}
          </ul>

          <nav className="vr-sayfalama" aria-label="Sayfalar">
            <button className="vr-btn" onClick={() => setSayfa((p) => Math.max(0, p - 1))} disabled={sayfa === 0 || yukleniyor}><ChevronLeft size={16} /> Önceki</button>
            <span>Sayfa {sayfa + 1}{sayfaSayisi ? ` / ${sayiYaz(sayfaSayisi)}` : ''}</span>
            <button className="vr-btn" onClick={() => setSayfa((p) => p + 1)} disabled={yukleniyor || satirlar.length < SAYFA_BOYUTU}>Sonraki <ChevronRight size={16} /></button>
          </nav>
        </>
      )}

      {acikSatir && (
        <SatirPaneli
          tablo={tablo}
          kolonlar={kolonlar}
          satir={acikSatir}
          mesgul={mesgul}
          onKapat={() => setAcikSatir(null)}
          onKaydet={satirKaydet}
          onSil={() => satirlariSil([acikSatir])}
          onGuncellendi={(yeni) => setAcikSatir(yeni)}
        />
      )}

      {geriAl && (
        <div className="vr-geri-al" role="status">
          <span>{geriAl.mesaj}</span>
          <button className="vr-btn" onClick={geriAlUygula} disabled={mesgul}><Undo2 size={15} /> Geri al</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SATIR DÜZENLEME PANELİ
// ============================================================
function SatirPaneli({ tablo, kolonlar, satir, mesgul, onKapat, onKaydet, onSil, onGuncellendi }) {
  const [form, setForm] = useState({});
  const [alanHata, setAlanHata] = useState({});
  const [durum, setDurum] = useState('');

  useEffect(() => {
    const f = {};
    kolonlar.forEach((c) => { f[c.kolon] = formaCevir(c.sinif, satir[c.kolon]); });
    setForm(f);
    setAlanHata({});
    setDurum('');
  }, [satir, kolonlar]);

  useEffect(() => {
    const kapat = (e) => { if (e.key === 'Escape') onKapat(); };
    window.addEventListener('keydown', kapat);
    return () => window.removeEventListener('keydown', kapat);
  }, [onKapat]);

  async function kaydet() {
    const degisiklikler = {};
    const hatalar = {};
    kolonlar.forEach((c) => {
      if (c.pk) return; // anahtar kolonları değiştirilmez — satırın kimliği
      const ilk = formaCevir(c.sinif, satir[c.kolon]);
      if (form[c.kolon] === ilk) return;
      const { deger, hata } = degerCevir(c.sinif, form[c.kolon]);
      if (hata) hatalar[c.kolon] = hata;
      else degisiklikler[c.kolon] = deger;
    });
    setAlanHata(hatalar);
    if (Object.keys(hatalar).length) { setDurum('Hatalı alanları düzelt.'); return; }
    if (!Object.keys(degisiklikler).length) { setDurum('Değişiklik yok.'); return; }
    const sonuc = await onKaydet(satir, degisiklikler);
    if (sonuc.iptal) return;
    if (!sonuc.ok) { setDurum(`Kaydedilemedi: ${sonuc.hata}`); return; }
    setDurum('Kaydedildi.');
    if (sonuc.yeni) onGuncellendi(sonuc.yeni);
  }

  return (
    <div className="vr-panel-arka" onClick={onKapat}>
      <aside className="vr-panel" role="dialog" aria-modal="true" aria-label={`${tabloEtiket(tablo)} satırı`} onClick={(e) => e.stopPropagation()}>
        <header className="vr-panel-baslik">
          <h2>Satırı düzenle</h2>
          <button className="vr-ikon-btn" onClick={onKapat} aria-label="Kapat"><X size={18} /></button>
        </header>

        <div className="vr-panel-govde">
          {kolonlar.map((c) => {
            const id = `vr-alan-${c.kolon}`;
            const msZaman = msZamanMi(c.kolon, satir[c.kolon]);
            return (
              <div key={c.kolon} className={`vr-alan ${c.pk ? 'anahtar' : ''}`}>
                <label htmlFor={id}>
                  {c.kolon} <span className="vr-tip">{c.tip}</span>
                  {c.pk && <span className="vr-tip">anahtar, değiştirilemez</span>}
                </label>
                {c.sinif === 'bool' ? (
                  <label className="vr-anahtar">
                    <input id={id} type="checkbox" checked={!!form[c.kolon]} disabled={c.pk}
                      onChange={(e) => setForm((f) => ({ ...f, [c.kolon]: e.target.checked }))} />
                    <span>{form[c.kolon] ? 'Evet' : 'Hayır'}</span>
                  </label>
                ) : c.sinif === 'json' || (typeof form[c.kolon] === 'string' && form[c.kolon].length > 80) ? (
                  <textarea id={id} rows={c.sinif === 'json' ? 6 : 3} value={form[c.kolon] ?? ''} readOnly={c.pk}
                    onChange={(e) => setForm((f) => ({ ...f, [c.kolon]: e.target.value }))} />
                ) : (
                  <input id={id} type="text" inputMode={c.sinif === 'sayi' ? 'decimal' : undefined}
                    value={form[c.kolon] ?? ''} readOnly={c.pk}
                    onChange={(e) => setForm((f) => ({ ...f, [c.kolon]: e.target.value }))} />
                )}
                {msZaman && <small className="vr-ipucu">{new Date(satir[c.kolon]).toLocaleString('tr-TR', { timeZone: TZ })}</small>}
                {alanHata[c.kolon] && <small className="vr-alan-hata">{alanHata[c.kolon]}</small>}
              </div>
            );
          })}
        </div>

        <footer className="vr-panel-alt">
          {durum && <span className="vr-durum" role="status">{durum}</span>}
          <button className="vr-btn vr-tehlike" onClick={onSil} disabled={mesgul}><Trash2 size={15} /> Sil</button>
          <button className="vr-btn vr-birincil" onClick={kaydet} disabled={mesgul}><Save size={15} /> Kaydet</button>
        </footer>
      </aside>
    </div>
  );
}

// ============================================================
// BAKIM
// ============================================================
function BakimPaneli({ liste, dbBoyut, onListeYenile }) {
  const logBilgi = liste.find((t) => t.tablo === 'realtime_usage_log');
  const [logGun, setLogGun] = useState('30');
  const [logDurum, setLogDurum] = useState('');
  const [fotoDurum, setFotoDurum] = useState('');
  const [fotoOzet, setFotoOzet] = useState(null);
  const [mesgul, setMesgul] = useState(false);

  const enBuyukler = useMemo(() => [...liste].sort((a, b) => b.boyut_bayt - a.boyut_bayt).slice(0, 10), [liste]);
  const enBuyukBoyut = enBuyukler[0]?.boyut_bayt || 1;

  async function logTemizle() {
    const gun = parseInt(logGun, 10);
    if (!Number.isFinite(gun) || gun < 1) { setLogDurum('Gün sayısı en az 1 olmalı.'); return; }
    if (!window.confirm(`Realtime kullanım kaydından ${gun} günden eski satırlar silinecek. Emin misin?`)) return;
    setMesgul(true);
    setLogDurum('Siliniyor…');
    const { data, error } = await supabase.rpc('veri_realtime_log_temizle', { p_gun: gun });
    setMesgul(false);
    setLogDurum(error ? `Silinemedi: ${error.message}` : `${sayiYaz(data)} satır silindi.`);
    onListeYenile();
  }

  const fotoTara = useCallback(async () => {
    const sinir = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const hepsi = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from('teslimat-fotograflari').list('', { limit: 1000, offset });
      if (error) { setFotoDurum(`Fotoğraflar listelenemedi: ${error.message}`); return; }
      if (!data || !data.length) break;
      hepsi.push(...data.filter((f) => f.id));
      if (data.length < 1000) break;
    }
    const eskiler = hepsi.filter((f) => f.created_at && new Date(f.created_at).getTime() < sinir);
    const boyut = (arr) => arr.reduce((s, f) => s + Number(f.metadata?.size || 0), 0);
    setFotoOzet({ toplam: hepsi.length, toplamBoyut: boyut(hepsi), eski: eskiler.map((f) => f.name), eskiBoyut: boyut(eskiler) });
  }, []);

  useEffect(() => { fotoTara(); }, [fotoTara]);

  async function fotoSil() {
    if (!fotoOzet?.eski.length) return;
    if (!window.confirm(`${fotoOzet.eski.length} teslimat fotoğrafı (7 günden eski) silinecek. Emin misin?`)) return;
    setMesgul(true);
    setFotoDurum('Siliniyor…');
    let silinen = 0;
    for (let i = 0; i < fotoOzet.eski.length; i += 100) {
      const { data, error } = await supabase.storage.from('teslimat-fotograflari').remove(fotoOzet.eski.slice(i, i + 100));
      if (error) { setFotoDurum(`Silme yarıda kaldı: ${error.message}`); break; }
      silinen += (data || []).length;
    }
    setMesgul(false);
    setFotoDurum(silinen === fotoOzet.eski.length
      ? `${silinen} fotoğraf silindi.`
      : `${silinen} / ${fotoOzet.eski.length} fotoğraf silinebildi — kalanlar için izin sorunu olabilir.`);
    fotoTara();
  }

  return (
    <div className="vr-bakim">
      <section className="vr-bakim-kart">
        <h2>Realtime kullanım kaydı</h2>
        <p>
          Canlı bağlantıların ham kaydı. Sadece sorun ararken işe yarıyor, zamanla büyüyor.
          Şu an {logBilgi ? <b>{sayiYaz(logBilgi.satir)} satır, {boyutYaz(logBilgi.boyut_bayt)}</b> : '…'}.
        </p>
        <div className="vr-bakim-eylem">
          <label>
            Şundan eski olanları sil:
            <input type="number" min="1" value={logGun} onChange={(e) => setLogGun(e.target.value)} aria-label="Gün" /> gün
          </label>
          <button className="vr-btn vr-tehlike" onClick={logTemizle} disabled={mesgul}><Trash2 size={15} /> Temizle</button>
        </div>
        {logDurum && <p className="vr-durum" role="status">{logDurum}</p>}
      </section>

      <section className="vr-bakim-kart">
        <h2>Teslimat fotoğrafları</h2>
        <p>
          Her gece 03:00'te 7 günden eskiler otomatik siliniyor. Beklemek istemezsen buradan hemen silebilirsin.
          {fotoOzet && <> Toplam <b>{fotoOzet.toplam} fotoğraf, {boyutYaz(fotoOzet.toplamBoyut)}</b>; 7 günden eski <b>{fotoOzet.eski.length}</b> ({boyutYaz(fotoOzet.eskiBoyut)}).</>}
        </p>
        <div className="vr-bakim-eylem">
          <button className="vr-btn vr-tehlike" onClick={fotoSil} disabled={mesgul || !fotoOzet?.eski.length}><Trash2 size={15} /> Eski fotoğrafları sil</button>
          <button className="vr-btn" onClick={fotoTara} disabled={mesgul}><RefreshCw size={15} /> Yeniden say</button>
        </div>
        {fotoDurum && <p className="vr-durum" role="status">{fotoDurum}</p>}
      </section>

      <section className="vr-bakim-kart">
        <h2>En çok yer kaplayan 10 tablo</h2>
        <p>Toplam {dbBoyut ? boyutYaz(dbBoyut) : '…'} / 500 MB.</p>
        <ol className="vr-buyukler">
          {enBuyukler.map((t) => (
            <li key={t.tablo}>
              <span className="vr-buyuk-ad">{tabloEtiket(t.tablo)} <small>{t.tablo}</small></span>
              <span className="vr-buyuk-cubuk"><span style={{ width: `${(t.boyut_bayt / enBuyukBoyut) * 100}%`, background: GRUP_RENK[tabloGrup(t.tablo)] }} /></span>
              <span className="vr-buyuk-boyut">{boyutYaz(t.boyut_bayt)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}