// Muhasebe2 API — Fişler/Faturalar ve Makbuzlar + Datalar (düzenle/sil/geri al) + Hesap Özetleri + Yemek Kartları
// + Personel Klasörü (puantaj, izin, avans) + Tahakkuklar (personel maaşı ve sabit giderler)
// + Günsonları (gün sonu kayıtlarını görme, düzenleme, silme, ana kasa devir zinciri)
// + Hızlı gider modülü (Ayarlar + Gün Sonu ortak harcama paneli) ve Günsonu Geliri (TL Kasa'ya nakit ciro girişi).
// + İade faturası (pozitif tutar + iade işareti; bakiyeden düşer, ekstrede Borç, Datalar'da eksi) ve izin kesintisi iadeleri.
// Veri Supabase'de (m2_* tabloları), eski mh_* tablolarından bağımsız.
//
// Defter kuralı:
//  - Her fiş/fatura firmanın borcunu doğurur.
//  - Cari DIŞI bir yöntemle (nakit/kart/havale) girilen fatura iki OTOMATİK makbuz üretir:
//      1) firmaya "Ödeme (Tediye) Makbuzu"  -> firmanın borcu kapanır
//      2) ödeme şekli carisine (kasa/banka/kart/cepten) "Tahsilat Makbuzu"
//         -> ödeme şekli cari olarak borçlanır / bizden çıkan para yazılır
//  - Elle girilen makbuzda da aynı mantık: ters yönde otomatik karşı makbuz ödeme şekli carisine yazılır.
// Firma bakiyesi (m2_firma_bakiye): fatura - ödeme makbuzu + tahsilat makbuzu (pozitif = borcumuz).
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHash } from 'node:crypto';

export const FATURA_ODEME_TURLERI = ['Cari', 'Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Ortaklar'];
export const MAKBUZ_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Ortaklar'];
export const MAKBUZ_TURLERI = ['Tahsilat', 'Ödeme'];
export const YONTEM_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Ortaklar'];
// Datalar tüm kayıtları sayfa sayfa (1000'er) yükler; üst sınır 20.000 satır.
const DATALAR_SAYFA = 1000;
const DATALAR_MAKS_SAYFA = 20;
const YK_KATEGORI = 'Yemek Kart-Banka Masrafı';
const PERSONEL_KATEGORI = 'Personel Gideri';

class HataMesaji extends Error {
  constructor(durum, mesaj) {
    super(mesaj);
    this.durum = durum;
  }
}

function dbAl() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HataMesaji(500, 'SUPABASE_URL / SUPABASE_ANON_KEY tanımlı değil');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Supabase hata nesnesini anlaşılır mesaja çevirir.
function kontrol(error) {
  if (!error) return;
  const kod = error.code;
  if (kod === '23505') throw new HataMesaji(409, 'Bu isimde bir kayıt zaten var');
  if (kod === '23514') throw new HataMesaji(400, 'Kayıt kurallara uymuyor (eksik veya geçersiz alan)');
  if (kod === '23503') throw new HataMesaji(400, 'Bağlı kayıt bulunamadı');
  if (kod === '22007' || kod === '22008') throw new HataMesaji(400, 'Tarih geçersiz');
  throw new HataMesaji(500, error.message || 'Veritabanı hatası');
}

export function tutarCoz(v) {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// KDV opsiyoneldir: boşsa null. Tutara dahil KDV tutarıdır, 0 ile fatura tutarı arasında olmalı.
export function kdvCoz(v, faturaTutari) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new HataMesaji(400, 'KDV tutarı geçersiz');
  const kdv = Math.round(n * 100) / 100;
  if (kdv > faturaTutari) throw new HataMesaji(400, 'KDV tutarı fatura tutarından büyük olamaz');
  return kdv;
}

export function bugunIstanbul() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }); // YYYY-MM-DD
}

// "İş günü": gece 02:00'ye kadar önceki gün sayılır (gün sonu 00:00-02:00 arasında da alınabilsin).
export function isGunuIstanbul(simdi = new Date()) {
  return new Date(simdi.getTime() - 2 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }); // YYYY-MM-DD
}
// Günsonu Geliri gün başına TEK kayıt: grup_id tarihten türetilir (tekrar kaydedince aynı kayıt güncellenir).
export function gelirGrupId(iso) {
  const h = createHash('md5').update(`gunsonu-${iso}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Ödeal POS (kredi kartı) geliri de gün başına TEK kayıt: ayrı bir grup_id (nakit geliriyle karışmaz).
export function odealGrupId(iso) {
  const h = createHash('md5').update(`gunsonu-odeal-${iso}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function tarihKontrol(tarih) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tarih || ''))) throw new HataMesaji(400, 'Tarih geçersiz');
  return tarih;
}

const metin = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};
const sayiOrNull = (v) => (v === null || v === undefined ? null : Number(v));

async function bakiyeGetir(db, firmaId) {
  const { data, error } = await db.from('m2_firma_bakiye').select('bakiye').eq('firma_id', firmaId).maybeSingle();
  kontrol(error);
  return data ? Number(data.bakiye) : 0;
}

async function firmaGetir(db, firmaId) {
  if (!firmaId) throw new HataMesaji(400, 'Firma seçin');
  const { data, error } = await db.from('m2_firmalar').select('id,ad').eq('id', firmaId).maybeSingle();
  kontrol(error);
  if (!data) throw new HataMesaji(400, 'Firma bulunamadı');
  return data;
}

// Ödeme şekli (kasa/banka/kart/cepten) de bir cari firmadır; yoksa oluşturulur.
async function yontemFirmasi(db, ad) {
  const { data, error } = await db.from('m2_firmalar').select('id,ad').eq('ad', ad).maybeSingle();
  kontrol(error);
  if (data) return data;
  const ekle = await db.from('m2_firmalar').insert({ ad, firma_turu: 'Ödeme Şekli' }).select('id,ad').single();
  if (ekle.error?.code === '23505') {
    // Aynı isim farklı büyük/küçük harfle zaten var.
    const { data: hepsi, error: hata2 } = await db.from('m2_firmalar').select('id,ad');
    kontrol(hata2);
    const bulunan = (hepsi || []).find((f) => f.ad.trim().toLowerCase() === ad.trim().toLowerCase());
    if (bulunan) return bulunan;
  }
  kontrol(ekle.error);
  return ekle.data;
}

// Ödeme türüne göre deftere yazılacak odeme_hesabi / kasa alanlarını doğrular.
async function yontemAlanlari(db, odemeTuru, odemeHesabi, kasa) {
  if (odemeTuru === 'Cari') return { odeme_hesabi: null, kasa: null };

  if (odemeTuru === 'Nakit') {
    const kasaAdi = String(kasa || '').trim();
    if (!kasaAdi) throw new HataMesaji(400, 'Nakit ödemede kasayı seçin');
    const { data: k, error: kHata } = await db
      .from('m2_odeme_yontemleri')
      .select('id')
      .eq('odeme_turu', 'Nakit')
      .eq('ad', kasaAdi)
      .maybeSingle();
    kontrol(kHata);
    if (!k) throw new HataMesaji(400, 'Bu kasa bulunamadı');
    return { odeme_hesabi: null, kasa: kasaAdi };
  }

  const ad = String(odemeHesabi || '').trim();
  if (!ad) throw new HataMesaji(400, odemeTuru === 'Banka Havalesi' ? 'Bankayı seçin' : odemeTuru === 'Ortaklar' ? 'Ortağı seçin' : 'Kartı seçin');
  const { data, error } = await db
    .from('m2_odeme_yontemleri')
    .select('id')
    .eq('odeme_turu', odemeTuru)
    .eq('ad', ad)
    .maybeSingle();
  kontrol(error);
  if (!data) throw new HataMesaji(400, 'Bu ödeme yöntemi bulunamadı');
  return { odeme_hesabi: ad, kasa: null };
}

const norm = (s) => String(s || '').trim().toLowerCase();

// Cari hangi gruba giriyor? Cariler = firmalar + kredi kartları + cepten; Kasa ve Banka ayrı.
export function grupBul(firma, yontemler) {
  if (firma.firma_turu === 'Yemek Kartı') return { grup: 'Yemek Kartı', bolum: 'cariler' };
  if (firma.firma_turu === 'Personel') return { grup: 'Personel', bolum: 'cariler' };
  if (firma.firma_turu === 'Sabit Gider') return { grup: 'Sabit Gider', bolum: 'cariler' };
  if (firma.firma_turu !== 'Ödeme Şekli') return { grup: 'Firma', bolum: 'cariler' };
  const turler = (yontemler || []).filter((y) => norm(y.ad) === norm(firma.ad)).map((y) => y.odeme_turu);
  if (turler.includes('Nakit')) return { grup: 'Kasa', bolum: 'kasaBanka' };
  if (turler.includes('Ortaklar')) return { grup: 'Cepten', bolum: 'cariler' };
  if (turler.includes('Kredi Kartı') && turler.includes('Banka Havalesi')) return { grup: 'Cepten', bolum: 'cariler' };
  if (turler.includes('Kredi Kartı')) return { grup: 'Kredi Kartı', bolum: 'cariler' };
  if (turler.includes('Banka Havalesi')) return { grup: 'Banka', bolum: 'kasaBanka' };
  return { grup: 'Ödeme şekli', bolum: 'cariler' };
}

const kurus = (v) => Math.round((Number(v) || 0) * 100);

// Ekstre satırları: Fatura/Fiş -> Alacak, Tahsilat -> Alacak, Ödeme (Tediye) -> Borç, İade Faturası -> Borç.
// Sıralama: tarih, kayıt zamanı, sıra (fatura, elle makbuz, otomatik ödeme, otomatik tahsilat).
export function ekstreHesapla(faturalar, makbuzlar) {
  const ham = [
    ...faturalar.map((f) => ({
      id: f.id,
      tarih: f.tarih,
      zaman: f.kayit_zamani || '',
      sira: 1,
      evrakTuru: f.kaynak === 'devir' ? 'Devir' : f.iade ? 'İade Faturası' : 'Fatura/Fiş',
      belgeNo: f.fatura_no || '',
      aciklama: f.aciklama || '',
      odemeSekli: f.kasa || f.odeme_hesabi || '',
      borcK: f.iade ? kurus(f.fatura_tutari) : 0,
      alacakK: f.iade ? 0 : kurus(f.fatura_tutari),
      grupId: f.grup_id || null,
      otomatik: false,
      kaynak: f.kaynak || null,
    })),
    ...makbuzlar.map((m) => {
      const odeme = m.makbuz_turu === 'Ödeme';
      return {
        id: m.id,
        tarih: m.tarih,
        zaman: m.kayit_zamani || '',
        sira: !m.otomatik ? 2 : odeme ? 3 : 4,
        evrakTuru: m.kaynak === 'gunsonu' ? 'Günsonu Geliri' : odeme ? 'Ödeme (Tediye) Makbuzu' : 'Tahsilat Makbuzu',
        belgeNo: m.fatura_no || '',
        aciklama: m.aciklama || '',
        odemeSekli: m.kasa || m.odeme_hesabi || '',
        borcK: odeme ? kurus(m.tutar) : 0,
        alacakK: odeme ? 0 : kurus(m.tutar),
        grupId: m.grup_id || null,
        otomatik: !!m.otomatik,
        kaynak: m.kaynak || null,
      };
    }),
  ].sort((a, b) => {
    if (a.tarih !== b.tarih) return a.tarih < b.tarih ? -1 : 1;
    if (a.zaman !== b.zaman) return a.zaman < b.zaman ? -1 : 1;
    if (a.sira !== b.sira) return a.sira - b.sira;
    return String(a.id).localeCompare(String(b.id));
  });

  let bakiyeK = 0;
  let toplamBorcK = 0;
  let toplamAlacakK = 0;
  const satirlar = ham.map((r) => {
    bakiyeK += r.borcK - r.alacakK;
    toplamBorcK += r.borcK;
    toplamAlacakK += r.alacakK;
    return {
      id: r.id,
      tarih: r.tarih,
      evrakTuru: r.evrakTuru,
      belgeNo: r.belgeNo,
      aciklama: r.aciklama,
      odemeSekli: r.odemeSekli,
      borc: r.borcK ? r.borcK / 100 : null,
      alacak: r.alacakK ? r.alacakK / 100 : null,
      bakiye: bakiyeK / 100,
      grupId: r.grupId,
      otomatik: r.otomatik,
      kaynak: r.kaynak,
    };
  });
  return { satirlar, toplamBorc: toplamBorcK / 100, toplamAlacak: toplamAlacakK / 100, bakiye: bakiyeK / 100 };
}

// Personel Hakediş Dökümü: personel carisinin ekstresi, bakiye "ödenecek maaş" yönünde (alacak - borç).
// + bakiye: personele borcumuz (ödenecek); - bakiye: personel bize borçlu (avans / izin kesintisi tahakkuktan önce girilmiş).
function dokumTuru(r) {
  if (r.evrakTuru === 'İade Faturası') return r.kaynak === 'izin' ? 'İzin Kesintisi' : 'İade Faturası';
  if (r.evrakTuru === 'Fatura/Fiş') return r.kaynak === 'tahakkuk' ? 'Maaş Tahakkuku' : 'Fatura/Fiş';
  if (r.kaynak === 'avans') return 'Avans';
  return r.evrakTuru;
}
export function personelDokumHesapla(faturalar, makbuzlar) {
  const e = ekstreHesapla(faturalar, makbuzlar);
  return {
    satirlar: e.satirlar.map((r) => ({ id: r.id, tarih: r.tarih, tur: dokumTuru(r), borc: r.borc, alacak: r.alacak, aciklama: r.kaynak === 'avans' ? String(r.aciklama || '').replace(/^Avans(?: — )?/, '') : r.aciklama, bakiye: 0 - r.bakiye, kaynak: r.kaynak || null })),
    toplamBorc: e.toplamBorc,
    toplamAlacak: e.toplamAlacak,
    bakiye: 0 - e.bakiye,
  };
}

// ---------------------------------------------------------------------------
// Yemek kartları
// ---------------------------------------------------------------------------
// Hesap, kuruş (tam sayı) üzerinden ve yuvarlama EN SONDA yapılır; Excel ile aynı sonucu verir.
//   Fatura toplamı  = matrah x (1 + fatura KDV)
//   Kesinti toplamı = matrah x oran x (1 + kesinti KDV)
//   Bankaya yatacak = fatura toplamı - kesinti toplamı (ekrandaki iki rakamın farkı; defterde artık kuruş kalmaz)
const yariYukari = (pay, payda) => (pay + payda / 2n) / payda; // BigInt, negatif olmayan sayılar
export function yemekKartiHesapla(matrah, kart) {
  const orani = (x, varsayilan) => BigInt(Math.round(Number(x ?? varsayilan) * 10000));
  const M = BigInt(Math.round((Number(matrah) || 0) * 100));
  const fk = orani(kart.faturaKdv, 0.1);
  const ko = orani(kart.komisyonOrani, 0);
  const kk = orani(kart.kesintiKdv, 0.2);
  const B = 10000n;
  const faturaKdvK = yariYukari(M * fk, B);
  const faturaToplamiK = yariYukari(M * (B + fk), B);
  const kesintiMatrahK = yariYukari(M * ko, B);
  const kesintiKdvK = yariYukari(M * ko * kk, B * B);
  const kesintiToplamiK = yariYukari(M * ko * (B + kk), B * B);
  const n = (k) => Number(k) / 100;
  return {
    matrah: n(M),
    kdv: n(faturaKdvK),
    faturaToplami: n(faturaToplamiK),
    kesintiMatrah: n(kesintiMatrahK),
    kesintiKdv: n(kesintiKdvK),
    kesintiToplami: n(kesintiToplamiK),
    bankayaYatacak: n(faturaToplamiK - kesintiToplamiK),
  };
}

// ---------------------------------------------------------------------------
// Günsonu aralığı (her kesimin kendi başlangıç ve bitişi, İKİSİ DE DAHİL)
//  - Bitiş varsayılan olarak fatura tarihidir: 11'inde kesilen fatura 11'inin günsonunu da kapsar.
//  - Başlangıç, aynı kartın önceki kesiminin bitişinden bir gün sonrasıdır.
//  - Önceki kesim yoksa kartın kendi takvimine göre standart başlangıç kullanılır
//    (örn. yalnızca ayın 30'unda kesilen kart için ayın 1'i).
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const gunMs = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const gunEkle = (iso, n) => new Date(gunMs(iso) + n * 86400000).toISOString().slice(0, 10);
export const gunFarki = (a, b) => Math.round((gunMs(b) - gunMs(a)) / 86400000); // b - a (gün)
const isoToTR = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const trToIso = (tr) => {
  const [g, a, y] = String(tr).split('.');
  return y && a && g ? `${y}-${pad2(a)}-${pad2(g)}` : '';
};
function gunListesi(bas, bit) {
  const l = [];
  for (let g = bas; g <= bit; g = gunEkle(g, 1)) l.push(g);
  return l;
}
const MAKS_ARALIK_GUN = 92;

// Kartın kendi kesim takvimine göre standart aralık.
export function standartAralik(donem, kesim, kart) {
  const [y, a] = String(donem).split('-').map(Number);
  const sonGun = new Date(Date.UTC(y, a, 0)).getUTCDate();
  const oncekiler = [10, 20, 30].filter((g) => kart[`kesim${g}`] && g < Number(kesim));
  const onceki = oncekiler.length ? oncekiler[oncekiler.length - 1] : 0;
  return {
    bas: `${donem}-${pad2(onceki + 1)}`,
    bit: Number(kesim) === 30 ? `${donem}-${pad2(sonGun)}` : `${donem}-${pad2(kesim)}`,
  };
}

// Aynı kartın, verilen kesimden ÖNCEKİ en son kesimi (yoksa null).
function oncekiKesimBul(kesimlerKart, donem, kesim) {
  const anahtar = `${donem}-${pad2(kesim)}`;
  return (
    kesimlerKart
      .map((k) => ({ ...k, anahtar: `${k.donem}-${pad2(k.kesim)}` }))
      .filter((k) => k.anahtar < anahtar)
      .sort((x, y) => (x.anahtar < y.anahtar ? 1 : -1))[0] || null
  );
}

// Önerilen aralık: başlangıç = önceki kesimin bitişi + 1 gün, bitiş = fatura tarihi.
export function aralikOneri({ kart, kesimlerKart, donem, kesim, faturaTarihi }) {
  const std = standartAralik(donem, kesim, kart);
  let bas = std.bas;
  let onceki = null;
  const aday = oncekiKesimBul(kesimlerKart, donem, kesim);
  if (aday) {
    const sonrasi = gunEkle(aday.gunsonu_bit, 1);
    // Çok eski bir kesimi (aylar önce) önceki saymayız; standart başlangıca döneriz.
    if (gunFarki(sonrasi, std.bas) <= 31) {
      bas = sonrasi;
      onceki = { donem: aday.donem, kesim: aday.kesim, bit: aday.gunsonu_bit };
    }
  }
  const bit = faturaTarihi && ISO_RE.test(faturaTarihi) ? faturaTarihi : std.bit;
  if (gunFarki(bas, bit) < 0) bas = gunFarki(std.bas, bit) >= 0 ? std.bas : bit;
  return { bas, bit, onceki, onceKesimYok: !onceki };
}

// Seçilen başlangıcın önceki kesime göre durumu: boşluk (bugün hiçbir faturada olmayan gün) veya çakışma.
function aralikUyarisi(onceki, bas) {
  if (!onceki) return null;
  const fark = gunFarki(gunEkle(onceki.bit, 1), bas); // >0 boşluk, <0 çakışma
  if (fark === 0) return null;
  return { tur: fark > 0 ? 'bosluk' : 'cakisma', gun: Math.abs(fark) };
}

function aralikDogrula(bas, bit) {
  if (!ISO_RE.test(String(bas || '')) || !ISO_RE.test(String(bit || ''))) throw new HataMesaji(400, 'Günsonu aralığı tarihleri geçersiz');
  if (gunFarki(bas, bit) < 0) throw new HataMesaji(400, 'Günsonu bitişi başlangıçtan önce olamaz');
  if (gunFarki(bas, bit) + 1 > MAKS_ARALIK_GUN) throw new HataMesaji(400, `Günsonu aralığı en fazla ${MAKS_ARALIK_GUN} gün olabilir`);
}

function sayiCozTR(v) {
  let t = String(v ?? '').trim();
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

// Günsonu kayıtlarını (gün başına tek satır) verilen tarih aralığı için okur.
// Dönen: Map(ISO tarih -> { marka: { markaAdi(norm) -> o günün toplamı } })
async function gunsonuGunluk(db, bas, bit) {
  const gunler = gunListesi(bas, bit);
  const { data, error } = await db.from('gs_kayitlar').select('tarih,yemek_detay').in('tarih', gunler.map(isoToTR));
  kontrol(error);
  const harita = new Map();
  (data || []).forEach((r) => {
    const iso = trToIso(r.tarih);
    if (!iso) return;
    let detay = {};
    try {
      detay = JSON.parse(r.yemek_detay || '{}') || {};
    } catch {
      detay = {};
    }
    const marka = {};
    const tutarlar = detay.tutarlar || {};
    Object.keys(tutarlar).forEach((m) => {
      const satir = tutarlar[m] || {};
      marka[norm(m)] = Math.round(Object.keys(satir).reduce((x, k) => x + sayiCozTR(satir[k]), 0) * 100) / 100;
    });
    harita.set(iso, { marka });
  });
  return harita;
}

// Bir kartın aralıktaki gün gün günsonu tutarları. kayit=false: o gün için günsonu kaydı hiç yok.
function kartGunleri(kartAd, harita, bas, bit) {
  const anahtar = norm(kartAd);
  const gunler = gunListesi(bas, bit).map((g) => {
    const k = harita.get(g);
    return { tarih: g, kayit: !!k, toplam: k ? k.marka[anahtar] || 0 : 0 };
  });
  const toplam = Math.round(gunler.reduce((x, g) => x + g.toplam, 0) * 100) / 100;
  return { gunler, toplam, eksikGunler: gunler.filter((g) => !g.kayit).map((g) => g.tarih) };
}

const sayiN = (v) => (v === null || v === undefined ? 0 : Number(v));
const kartCamel = (k) => ({
  id: k.id,
  ad: k.ad,
  sira: k.sira,
  komisyonOrani: sayiN(k.komisyon_orani),
  faturaKdv: sayiN(k.fatura_kdv),
  kesintiKdv: sayiN(k.kesinti_kdv),
  kesim10: !!k.kesim10,
  kesim20: !!k.kesim20,
  kesim30: !!k.kesim30,
  pasif: !!k.pasif,
});
const kesimCamel = (k) => ({
  id: k.id,
  faturaTarihi: k.fatura_tarihi,
  vade: k.vade || '',
  matrah: sayiN(k.matrah),
  kdv: sayiN(k.fatura_kdv),
  faturaToplami: sayiN(k.fatura_toplami),
  kesintiOran: sayiN(k.kesinti_oran),
  kesintiMatrah: sayiN(k.kesinti_matrah),
  kesintiKdv: sayiN(k.kesinti_kdv),
  kesintiToplami: sayiN(k.kesinti_toplami),
  bankayaYatacak: sayiN(k.bankaya_yatacak),
  gunsonuBas: k.gunsonu_bas || '',
  gunsonuBit: k.gunsonu_bit || '',
});

// SQL fonksiyonlarının özel hata mesajlarını kullanıcı diline çevirir.
function ykKontrol(error) {
  if (!error) return;
  const m = String(error.message || '');
  if (m.includes('PARA_GELDI_VAR')) {
    throw new HataMesaji(409, 'Bu kesim için para geldi kaydı var. Önce para geldi kayıtlarını geri alın.');
  }
  if (m.includes('KESIM_YOK')) throw new HataMesaji(404, 'Kesim bulunamadı');
  if (m.includes('ODEME_YOK')) throw new HataMesaji(404, 'Para geldi kaydı bulunamadı');
  kontrol(error);
}

async function ykKartGetir(db, kartId) {
  if (!kartId) throw new HataMesaji(400, 'Kart seçin');
  const { data, error } = await db.from('m2_yk_kartlar').select('*').eq('id', kartId).maybeSingle();
  kontrol(error);
  if (!data) throw new HataMesaji(404, 'Yemek kartı bulunamadı');
  return data;
}

// Kartın o kesimdeki carisi (Edenred10 gibi). Yoksa açılır ve karta bağlanır.
async function ykCarisi(db, kart, kesim) {
  const kolon = `firma${kesim}_id`;
  if (kart[kolon]) {
    const { data, error } = await db.from('m2_firmalar').select('id,ad').eq('id', kart[kolon]).maybeSingle();
    kontrol(error);
    if (data) return data;
  }
  const ad = `${kart.ad}${kesim}`;
  const ekle = await db.from('m2_firmalar').insert({ ad, firma_turu: 'Yemek Kartı' }).select('id,ad').single();
  let cari = ekle.data;
  if (ekle.error?.code === '23505') {
    const { data: hepsi, error: hata2 } = await db.from('m2_firmalar').select('id,ad');
    kontrol(hata2);
    cari = (hepsi || []).find((f) => norm(f.ad) === norm(ad));
  } else {
    kontrol(ekle.error);
  }
  if (!cari) throw new HataMesaji(500, 'Yemek kartı carisi açılamadı');
  const { error } = await db.from('m2_yk_kartlar').update({ [kolon]: cari.id }).eq('id', kart.id);
  kontrol(error);
  return cari;
}

async function kategoriBulVeyaAc(db, ad) {
  const { data, error } = await db.from('m2_kategoriler').select('ad').eq('ad', ad).maybeSingle();
  kontrol(error);
  if (data) return data.ad;
  const ekle = await db.from('m2_kategoriler').insert({ ad, sira: 50 });
  if (ekle.error && ekle.error.code !== '23505') kontrol(ekle.error);
  return ad;
}

// ---------------------------------------------------------------------------
// Fatura ve makbuz grupları: kayıt VE düzenleme aynı satır üretimini kullanır.
// ---------------------------------------------------------------------------
// İade faturası: tutar POZİTİF girilir, iade=true işaretiyle bakiyeden düşer (firma ekstresinde Borç, Datalar'da eksi).
// Cari dışı iadede para bize GERİ GELİR: firmadan otomatik tahsilat + ödeme şekline giriş (satış faturasının tam tersi).
async function faturaGrubuUret(db, body, grupId, zaman) {
  const iade = body.iade === true || body.iade === 'true';
  const tutar = tutarCoz(body.faturaTutari);
  if (tutar <= 0) throw new HataMesaji(400, 'Tutar sıfırdan büyük olmalı');
  const kdv = kdvCoz(body.kdv, tutar);
  const tarih = tarihKontrol(body.tarih);
  const firma = await firmaGetir(db, body.firmaId);

  const kategori = String(body.giderKategorisi || '').trim();
  if (!kategori) throw new HataMesaji(400, 'Gider kategorisini seçin');
  const { data: kat, error: katHata } = await db.from('m2_kategoriler').select('id').eq('ad', kategori).maybeSingle();
  kontrol(katHata);
  if (!kat) throw new HataMesaji(400, 'Kategori bulunamadı');

  const odemeTuru = body.odemeTuru;
  if (!FATURA_ODEME_TURLERI.includes(odemeTuru)) throw new HataMesaji(400, 'Ödeme türünü seçin');
  const alan = await yontemAlanlari(db, odemeTuru, body.odemeHesabi, body.kasa);

  const faturaNo = metin(body.faturaNo);
  const aciklama = metin(body.aciklama);
  const z = zaman ? { kayit_zamani: zaman } : {};
  const fatura = {
    id: randomUUID(),
    tarih,
    firma_id: firma.id,
    firma_adi: firma.ad,
    fatura_no: faturaNo,
    aciklama,
    gider_kategorisi: kategori,
    odeme_turu: odemeTuru,
    odeme_hesabi: alan.odeme_hesabi,
    kasa: alan.kasa,
    fatura_tutari: tutar,
    kdv,
    iade,
    grup_id: grupId,
    ...z,
  };

  // Cari dışı ödemede iki otomatik makbuz: firmaya ödeme + ödeme şekline tahsilat (iadede ters yön).
  const makbuzlar = [];
  if (odemeTuru !== 'Cari' && iade) {
    const yontemAdi = alan.kasa || alan.odeme_hesabi;
    const yf = await yontemFirmasi(db, yontemAdi);
    if (yf.id === firma.id) throw new HataMesaji(400, 'Firma ile ödeme şekli aynı olamaz');
    makbuzlar.push({
      id: randomUUID(),
      tarih,
      makbuz_turu: 'Tahsilat',
      firma_id: firma.id,
      firma_adi: firma.ad,
      fatura_no: faturaNo,
      aciklama: `Otomatik: iade tahsilatı${aciklama ? ` — ${aciklama}` : ''}`,
      odeme_turu: odemeTuru,
      odeme_hesabi: alan.odeme_hesabi,
      kasa: alan.kasa,
      tutar,
      otomatik: true,
      grup_id: grupId,
      ...z,
    });
    makbuzlar.push({
      id: randomUUID(),
      tarih,
      makbuz_turu: 'Ödeme',
      firma_id: yf.id,
      firma_adi: yf.ad,
      fatura_no: faturaNo,
      aciklama: `Otomatik: ${firma.ad} iade tahsilatı`,
      odeme_turu: null,
      odeme_hesabi: null,
      kasa: null,
      tutar,
      otomatik: true,
      grup_id: grupId,
      ...z,
    });
  } else if (odemeTuru !== 'Cari') {
    const yontemAdi = alan.kasa || alan.odeme_hesabi;
    const yf = await yontemFirmasi(db, yontemAdi);
    if (yf.id === firma.id) throw new HataMesaji(400, 'Firma ile ödeme şekli aynı olamaz');
    makbuzlar.push({
      id: randomUUID(),
      tarih,
      makbuz_turu: 'Ödeme',
      firma_id: firma.id,
      firma_adi: firma.ad,
      fatura_no: faturaNo,
      aciklama: `Otomatik: fatura ödemesi${aciklama ? ` — ${aciklama}` : ''}`,
      odeme_turu: odemeTuru,
      odeme_hesabi: alan.odeme_hesabi,
      kasa: alan.kasa,
      tutar,
      otomatik: true,
      grup_id: grupId,
      ...z,
    });
    makbuzlar.push({
      id: randomUUID(),
      tarih,
      makbuz_turu: 'Tahsilat',
      firma_id: yf.id,
      firma_adi: yf.ad,
      fatura_no: faturaNo,
      aciklama: `Otomatik: ${firma.ad} faturası ödemesi`,
      odeme_turu: null,
      odeme_hesabi: null,
      kasa: null,
      tutar,
      otomatik: true,
      grup_id: grupId,
      ...z,
    });
  }
  return { fatura, makbuzlar, firma };
}

async function makbuzGrubuUret(db, body, grupId, zaman) {
  const tutar = tutarCoz(body.tutar);
  if (tutar <= 0) throw new HataMesaji(400, 'Tutar sıfırdan büyük olmalı');
  const tarih = tarihKontrol(body.tarih);
  const firma = await firmaGetir(db, body.firmaId);
  if (!MAKBUZ_TURLERI.includes(body.makbuzTuru)) throw new HataMesaji(400, 'Makbuz türü geçersiz');
  const odemeTuru = body.odemeTuru;
  if (!MAKBUZ_ODEME_TURLERI.includes(odemeTuru)) throw new HataMesaji(400, 'Ödeme türünü seçin');
  const alan = await yontemAlanlari(db, odemeTuru, body.odemeHesabi, body.kasa);

  const yontemAdi = alan.kasa || alan.odeme_hesabi;
  const yf = await yontemFirmasi(db, yontemAdi);
  if (yf.id === firma.id) throw new HataMesaji(400, 'Firma ile ödeme şekli aynı olamaz');

  const tahsilatMi = body.makbuzTuru === 'Tahsilat';
  const faturaNo = metin(body.faturaNo);
  const z = zaman ? { kayit_zamani: zaman } : {};
  const makbuzlar = [
    {
      id: randomUUID(),
      tarih,
      makbuz_turu: body.makbuzTuru,
      firma_id: firma.id,
      firma_adi: firma.ad,
      fatura_no: faturaNo,
      aciklama: metin(body.aciklama),
      odeme_turu: odemeTuru,
      tutar,
      otomatik: false,
      grup_id: grupId,
      ...alan,
      ...z,
    },
    {
      id: randomUUID(),
      tarih,
      makbuz_turu: tahsilatMi ? 'Ödeme' : 'Tahsilat',
      firma_id: yf.id,
      firma_adi: yf.ad,
      fatura_no: faturaNo,
      aciklama: `Otomatik: ${firma.ad} ${tahsilatMi ? 'tahsilatı' : 'ödemesi'}`,
      odeme_turu: null,
      odeme_hesabi: null,
      kasa: null,
      tutar,
      otomatik: true,
      grup_id: grupId,
      ...z,
    },
  ];
  return { makbuzlar, firma };
}

// ---------------------------------------------------------------------------
// Kayıt grubu (fatura + makbuzlar): anlık görüntü, düzenleme, silme, geri alma
// ---------------------------------------------------------------------------
const FF_KOLON = ['id', 'tarih', 'firma_id', 'firma_adi', 'fatura_no', 'aciklama', 'gider_kategorisi', 'odeme_turu', 'odeme_hesabi', 'kasa', 'fatura_tutari', 'kdv', 'iade', 'kasa_grubu', 'grup_id', 'kaynak', 'kayit_zamani'];
const MK_KOLON = ['id', 'tarih', 'makbuz_turu', 'firma_id', 'firma_adi', 'fatura_no', 'aciklama', 'odeme_turu', 'odeme_hesabi', 'kasa', 'tutar', 'otomatik', 'grup_id', 'kaynak', 'kasa_grubu', 'kayit_zamani'];
const sec = (r, kolonlar) => Object.fromEntries(kolonlar.map((k) => [k, r[k] === undefined ? null : r[k]]));
const idSirala = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const KAYNAK_YER = { yemek_karti: 'Yemek Kartları sekmesinden', tahakkuk: 'Tahakkuklar sekmesinden', avans: "Personel Klasörü'nden", izin: "Personel Klasörü'nden", hizli_gider: 'Harcama modülünden', gunsonu: "Gün Sonu sayfasından", devir: 'Devir aktarımından' };

async function grupOku(db, grupId) {
  if (!grupId) throw new HataMesaji(400, 'grupId gerekli');
  const [f, m] = await Promise.all([
    db.from('m2_fis_faturalar').select('*').eq('grup_id', grupId),
    db.from('m2_makbuzlar').select('*').eq('grup_id', grupId),
  ]);
  kontrol(f.error);
  kontrol(m.error);
  return {
    faturalar: (f.data || []).map((r) => sec(r, FF_KOLON)).sort(idSirala),
    makbuzlar: (m.data || []).map((r) => sec(r, MK_KOLON)).sort(idSirala),
  };
}
const grupBosMu = (g) => g.faturalar.length === 0 && g.makbuzlar.length === 0;
const grupKaynagi = (g) => [...g.faturalar, ...g.makbuzlar].map((r) => r.kaynak).find(Boolean) || null;
const grupEsitMi = (a, b) =>
  JSON.stringify({ f: (a.faturalar || []).map((r) => sec(r, FF_KOLON)).sort(idSirala), m: (a.makbuzlar || []).map((r) => sec(r, MK_KOLON)).sort(idSirala) }) ===
  JSON.stringify({ f: (b.faturalar || []).map((r) => sec(r, FF_KOLON)).sort(idSirala), m: (b.makbuzlar || []).map((r) => sec(r, MK_KOLON)).sort(idSirala) });

function kilitKontrol(grup) {
  const kaynak = grupKaynagi(grup);
  if (kaynak) throw new HataMesaji(409, `Bu kayıt ${KAYNAK_YER[kaynak] || 'başka bir sekmeden'} yönetiliyor, buradan değiştirilemez.`);
}

// Özel SQL hata kodlarını kullanıcı diline çevirir.
function ozelKontrol(error) {
  if (!error) return;
  const m = String(error.message || '');
  if (m.includes('DONEM_KILITLI')) throw new HataMesaji(409, 'Bu dönem veya sonrası için tahakkuk edilmiş; maaş değişikliği bu dönemden itibaren yapılamaz.');
  if (m.includes('KILITLI')) throw new HataMesaji(409, 'Bu kayıt başka bir sekmeden yönetiliyor, buradan değiştirilemez.');
  if (m.includes('PERSONEL_YOK')) throw new HataMesaji(404, 'Personel bulunamadı');
  if (m.includes('AVANS_YOK')) throw new HataMesaji(404, 'Avans kaydı bulunamadı');
  if (m.includes('GIDER_YOK')) throw new HataMesaji(404, 'Sabit gider bulunamadı');
  if (m.includes('TAHAKKUK_YOK')) throw new HataMesaji(404, 'Bu dönem için tahakkuk yok');
  kontrol(error);
}

async function grupDegistir(db, grupId, yeni) {
  const { error } = await db.rpc('m2_grup_degistir', { p_grup: grupId, p_faturalar: yeni.faturalar || [], p_makbuzlar: yeni.makbuzlar || [] });
  ozelKontrol(error);
}

// ---------------------------------------------------------------------------
// Maaş ve puantaj hesabı
//  - Günlük maaş HER ZAMAN maaş / 30'dur (ay kaç çekerse çeksin).
//  - Tam ay (ayın 1'inden son gününe kadar çalışan): 30 gün sayılır.
//  - Kısmi ay (ay ortasında girdi veya çıktı): çalışılan takvim günü kadar (giriş ve çıkış günü dahil).
//  - İzin kesintisi: izin günü x maaş/30 (yarım gün 0,5), netten düşer. Yuvarlama EN SONDA.
// ---------------------------------------------------------------------------
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const donemYazi = (d) => `${AYLAR[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const DONEM_RE = /^\d{4}-\d{2}$/;
const r2 = (x) => Math.round(x * 100) / 100;
const kurusYari = (pay, payda) => Math.floor((pay + Math.floor(payda / 2)) / payda); // negatif olmayan tam sayılar

export function donemGunleri(donem) {
  const [y, a] = donem.split('-').map(Number);
  const son = new Date(Date.UTC(y, a, 0)).getUTCDate();
  return { ilk: `${donem}-01`, son: `${donem}-${pad2(son)}`, gunSayisi: son };
}

// Maaş geçmişi: dönemin maaşı = geçerli_dönemi o dönemden küçük/eşit EN SON kayıt (yoksa en eski kayıt).
export function maasBul(gecmis, donem) {
  const sirali = [...gecmis].sort((a, b) => (a.gecerli_donem < b.gecerli_donem ? -1 : 1));
  let m = sirali.length ? Number(sirali[0].maas) : 0;
  sirali.forEach((g) => {
    if (g.gecerli_donem <= donem) m = Number(g.maas);
  });
  return m;
}

export function puantajHesapla({ maas, donem, iseGiris, cikisTarihi, izinler }) {
  const { ilk, son, gunSayisi } = donemGunleri(donem);
  const bas = iseGiris > ilk ? iseGiris : ilk;
  const bit = cikisTarihi && cikisTarihi < son ? cikisTarihi : son;
  const calisiyor = bas <= bit;
  const calisilanGun = calisiyor ? gunFarki(bas, bit) + 1 : 0;
  const tamAy = calisiyor && bas === ilk && bit === son;
  const ucretliGun = !calisiyor ? 0 : tamAy ? 30 : calisilanGun;
  const c = Math.round(Number(maas) * 100);
  const brutK = kurusYari(c * ucretliGun, 30);
  const izinMap = new Map((izinler || []).filter((i) => i.tarih >= ilk && i.tarih <= son).map((i) => [i.tarih, i]));
  let izinGun = 0;
  let kesintiK = 0;
  let toplamGun = 0;
  const gunler = [];
  for (let d = 1; d <= gunSayisi; d++) {
    const t = `${donem}-${pad2(d)}`;
    const calisma = calisiyor && t >= bas && t <= bit;
    const iz = izinMap.get(t);
    if (!calisma) {
      gunler.push({ tarih: t, deger: null, izin: null });
    } else if (iz) {
      const yarim = iz.tur === 'Yarım';
      izinGun += yarim ? 0.5 : 1;
      kesintiK += Math.round(Number(iz.kesinti) * 100);
      toplamGun += yarim ? 0.5 : 0;
      gunler.push({ tarih: t, deger: yarim ? 0.5 : 0, izin: iz.tur });
    } else {
      toplamGun += 1;
      gunler.push({ tarih: t, deger: 1, izin: null });
    }
  }
  return {
    gunler,
    calisilanGun,
    tamAy,
    ucretliGun,
    izinGun,
    toplamGun,
    gunlukMaas: r2(Number(maas) / 30),
    brut: brutK / 100,
    kesinti: kesintiK / 100,
    net: Math.max(0, brutK - kesintiK) / 100,
  };
}

// Otomatik izin kesintisi (kuruş): her gün için o günün dönemindeki maaş / 30 (yarım gün için / 60); yuvarlama toplamda.
export function izinKesintisiK(gecmis, gunler, tur) {
  const pay = gunler.reduce((x, g) => x + Math.round(maasBul(gecmis, g.slice(0, 7)) * 100) * (tur === 'Yarım' ? 1 : 2), 0);
  return kurusYari(pay, 60);
}
function kurusDagit(toplamK, n) {
  const taban = Math.floor(toplamK / n);
  const liste = Array(n).fill(taban);
  liste[n - 1] += toplamK - taban * n;
  return liste;
}

const personelCamel = (p, bugun) => ({
  id: p.id,
  adSoyad: p.ad_soyad,
  gorev: p.gorev || '',
  iseGiris: p.ise_giris,
  sgkBaslama: p.sgk_baslama || '',
  sgkYok: !!p.sgk_yok,
  cikisTarihi: p.cikis_tarihi || '',
  cikisSebebi: p.cikis_sebebi || '',
  telefon: p.telefon || '',
  adres: p.adres || '',
  aktif: !p.cikis_tarihi || p.cikis_tarihi >= bugun,
  firmaId: p.firma_id,
});

async function personelGetir(db, id) {
  if (!id) throw new HataMesaji(400, 'Personel seçin');
  const { data, error } = await db.from('m2_personel').select('*').eq('id', id).maybeSingle();
  kontrol(error);
  if (!data) throw new HataMesaji(404, 'Personel bulunamadı');
  return data;
}
async function maasGecmisiGetir(db, personelId) {
  const { data, error } = await db.from('m2_personel_maas').select('*').eq('personel_id', personelId);
  kontrol(error);
  return data || [];
}
async function tahakkukluDonemler(db, donemler) {
  const { data, error } = await db.from('m2_tahakkuklar').select('donem,tarih').in('donem', donemler);
  kontrol(error);
  return data || [];
}
async function donemKilidiKontrol(db, donemler, ne) {
  const liste = await tahakkukluDonemler(db, [...new Set(donemler)]);
  if (liste.length) {
    throw new HataMesaji(409, `${donemYazi(liste[0].donem)} dönemi tahakkuk edilmiş; ${ne} yapılamaz. Önce Tahakkuklar sekmesinden tahakkuku geri alın.`);
  }
}

// Tahakkuk ekranının verisi: o dönem için personel ve sabit gider satırları (tahakkuk edilmişse kayıtlı değerler).
const gunYaz = (n) => `${String(n).replace('.', ',')} gün`;
function izinAciklamasi(satirlar) {
  const sirali = [...satirlar].sort((x, y) => (x.tarih < y.tarih ? -1 : 1));
  const ilk = sirali[0].tarih;
  const son = sirali[sirali.length - 1].tarih;
  const gun = sirali.reduce((x, z) => x + (z.tur === 'Yarım' ? 0.5 : 1), 0);
  const sebep = (sirali.find((z) => z.sebep) || {}).sebep;
  return `İzin kesintisi — ${ilk === son ? isoToTR(ilk) : `${isoToTR(ilk)} – ${isoToTR(son)}`} (${gunYaz(gun)}${sebep ? `, ${sebep}` : ''})`;
}
// Bir izin GİRİŞİNİN (aralık dahil) personel carisindeki TEK iade faturası; toplam kesinti 0 ise yazılmaz.
function izinGrubuIade(per, satirlar, kategori, grupId) {
  const toplamK = satirlar.reduce((x, z) => x + Math.round(Number(z.kesinti) * 100), 0);
  if (!satirlar.length || toplamK <= 0) return null;
  const ilk = [...satirlar].sort((x, y) => (x.tarih < y.tarih ? -1 : 1))[0];
  return { id: randomUUID(), tarih: ilk.tarih, firma_id: per.firma_id, firma_adi: per.ad_soyad, gider_kategorisi: kategori, fatura_tutari: toplamK / 100, aciklama: izinAciklamasi(satirlar), grup_id: grupId };
}

async function tahakkukVeri(db, donem) {
  const [pr, mr, ir, ar, sr, tr, br] = await Promise.all([
    db.from('m2_personel').select('*'),
    db.from('m2_personel_maas').select('*'),
    db.from('m2_personel_izin').select('*'),
    db.from('m2_personel_avans').select('*'),
    db.from('m2_sabit_giderler').select('*'),
    db.from('m2_tahakkuklar').select('*'),
    db.from('m2_firma_bakiye').select('firma_id,bakiye'),
  ]);
  [pr, mr, ir, ar, sr, tr, br].forEach((x) => kontrol(x.error));
  const tahakkuk = (tr.data || []).find((t) => t.donem === donem) || null;
  let kalemler = [];
  if (tahakkuk) {
    const k = await db.from('m2_tahakkuk_kalemleri').select('*').eq('tahakkuk_id', tahakkuk.id);
    kontrol(k.error);
    kalemler = k.data || [];
  }
  const bakiye = new Map((br.data || []).map((x) => [x.firma_id, Number(x.bakiye)]));

  const personeller = [];
  (pr.data || []).forEach((p) => {
    const izinler = (ir.data || []).filter((i) => i.personel_id === p.id);
    const maas = maasBul((mr.data || []).filter((m) => m.personel_id === p.id), donem);
    const pt = puantajHesapla({ maas, donem, iseGiris: p.ise_giris, cikisTarihi: p.cikis_tarihi, izinler });
    const kalem = kalemler.find((k) => k.tur === 'Personel' && k.kaynak_id === p.id);
    if (tahakkuk ? !kalem : pt.calisilanGun === 0) return;
    const snap = kalem
      ? { maas: sayiN(kalem.maas), calisilanGun: sayiN(kalem.calisilan_gun), ucretliGun: sayiN(kalem.ucretli_gun), izinGun: sayiN(kalem.izin_gun), brut: sayiN(kalem.brut), kesinti: sayiN(kalem.kesinti), net: sayiN(kalem.net) }
      : { maas, calisilanGun: pt.calisilanGun, ucretliGun: pt.ucretliGun, izinGun: pt.izinGun, brut: pt.brut, kesinti: pt.kesinti, net: pt.net };
    const avans = r2((ar.data || []).filter((a) => a.personel_id === p.id && String(a.tarih).startsWith(donem)).reduce((x, a) => x + Number(a.tutar), 0));
    const b = bakiye.get(p.firma_id) || 0;
    personeller.push({ id: p.id, adSoyad: p.ad_soyad, gorev: p.gorev || '', firmaId: p.firma_id, ...snap, avans, bakiye: r2(b), odenecek: r2(b + (tahakkuk ? 0 : snap.brut)), fisYazilir: snap.brut > 0 });
  });
  personeller.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));

  const giderler = (sr.data || []).map((g) => ({
    id: g.id, ad: g.ad, tutar: sayiN(g.tutar), kdv: g.kdv === null || g.kdv === undefined ? null : Number(g.kdv), kategori: g.kategori,
    baslangicDonem: g.baslangic_donem, pasifDonem: g.pasif_donem || '', firmaId: g.firma_id,
  }));
  const gecerli = (g) => g.baslangicDonem <= donem && (!g.pasifDonem || donem < g.pasifDonem);
  let sabitGiderler;
  if (tahakkuk) {
    sabitGiderler = kalemler
      .filter((k) => k.tur === 'Sabit Gider')
      .map((k) => {
        const g = giderler.find((x) => x.id === k.kaynak_id);
        return { id: k.kaynak_id, ad: k.ad, tutar: sayiN(k.net), kdv: g ? g.kdv : null, kategori: g ? g.kategori : '', baslangicDonem: g ? g.baslangicDonem : '', pasifDonem: g ? g.pasifDonem : '', firmaId: k.firma_id };
      });
  } else {
    sabitGiderler = giderler.filter(gecerli);
  }
  sabitGiderler.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const pasifGiderler = giderler.filter((g) => g.pasifDonem && donem >= g.pasifDonem).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const donemler = (tr.data || []).map((t) => ({ donem: t.donem, tarih: t.tarih })).sort((a, b) => (a.donem < b.donem ? 1 : -1));
  return { tahakkuk, personeller, sabitGiderler, pasifGiderler, donemler };
}

// ---------------------------------------------------------------------------
// Günsonları (gs_kayitlar): her günün kapanış kaydı. Anahtar TARİH ('GG.AA.YYYY', gün başına tek satır);
// tüm sütunlar metindir. Düzenleme TOPLAMLARI otomatik hesaplar, CARİ bilgisine dokunmaz (yalnızca görülür),
// ana kasa DEVİR ZİNCİRİNİ (her günün dünden devri = önceki günün yarına devri) sonraki günlere yayar.
//   Toplam nakit   = kupür adet x değer toplamı + kasa avansı
//   POS toplamı    = POS satırları toplamı        Yemek kartı = marka/kolon tutarları toplamı
//   Ciro           = nakit + günlük kasa + cari + POS + yemek + cari tahsilat (eksi)
//   Yarına devir   = dünden devir + bugünkü nakit - ana kasa harcaması
// ---------------------------------------------------------------------------
const GS_KOLON = ['tarih', 'sira', 'toplam_nakit', 'nakit_kupur', 'kasa_avansi', 'pos_toplam', 'pos_satirlari', 'ana_kasa_toplam', 'ana_kasa_harcamalar',
  'gunluk_kasa_toplam', 'gunluk_kasa_harcamalar', 'cari_toplam', 'cari_detay', 'yemek_toplam', 'yemek_detay', 'ciro', 'ana_kasa_takibi', 'kaydeden_saat'];
const gsSatir = (r) => Object.fromEntries(GS_KOLON.map((k) => [k, r[k] === undefined || r[k] === null ? (k === 'sira' ? null : '') : r[k]]));
const gsParse = (t, v) => {
  if (!t) return v;
  try {
    const x = JSON.parse(t);
    return x === null || x === undefined ? v : x;
  } catch {
    return v;
  }
};
export const gsSayi = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
export function gsTarihIso(t) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(t || '').trim());
  return m ? `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` : '';
}
const gsYaz = (n) => String(Math.round((Number(n) || 0) * 100) / 100);
const gsTopla = (...l) => Math.round(l.reduce((x, n) => x + Math.round((Number(n) || 0) * 100), 0)) / 100;
const gsEs = (a, b) => Math.abs(gsSayi(a) - gsSayi(b)) < 0.005;

// Satırı ekranın kullandığı yapıya çevirir. Eski (tek JSON'lu) biçimli satırlar yalnızca görülür.
export function gsKayit(r) {
  const eskiBicim = String(r.toplam_nakit || '').trim().startsWith('{');
  if (eskiBicim) return { tarih: r.tarih, sira: r.sira, eskiBicim: true, ...gsParse(r.toplam_nakit, {}), kaydedenSaat: r.nakit_kupur || '' };
  return {
    tarih: r.tarih,
    sira: r.sira,
    eskiBicim: false,
    toplamNakitPara: gsSayi(r.toplam_nakit),
    nakitKupurDetayi: gsParse(r.nakit_kupur, {}),
    kasaAvansi: gsSayi(r.kasa_avansi),
    posToplam: gsSayi(r.pos_toplam),
    posTutarlari: gsParse(r.pos_satirlari, []),
    anaKasaToplam: gsSayi(r.ana_kasa_toplam),
    gunlukKasaToplam: gsSayi(r.gunluk_kasa_toplam),
    cariToplam: gsSayi(r.cari_toplam),
    cariDetay: gsParse(r.cari_detay, {}),
    genelYemekToplami: gsSayi(r.yemek_toplam),
    yemekDetay: gsParse(r.yemek_detay, {}),
    ciro: gsParse(r.ciro, {}),
    anaKasaTakibi: gsParse(r.ana_kasa_takibi, {}),
    kaydedenSaat: r.kaydeden_saat || '',
  };
}

function gsTutarGir(v, ad, eksiOlabilir = false) {
  if (v === undefined || v === null || String(v).trim() === '') return 0;
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw new HataMesaji(400, `${ad} geçersiz`);
  if (!eksiOlabilir && n < 0) throw new HataMesaji(400, `${ad} eksi olamaz`);
  return Math.round(n * 100) / 100;
}

// Bir günsonu satırını verilen alanlarla düzenler. Verilmeyen bölümler olduğu gibi kalır.
// alanlar: nakitKupurDetayi {değer: adet}, kasaAvansi, posTutarlari [{label, tutar}], anaKasaToplam, gunlukKasaToplam,
//          yemekTutarlari {marka: {kolon: tutar}}, dundenDevir, kaydedenSaat
export function gsDuzenle(eskiRow, alanlar = {}) {
  const e = gsKayit(eskiRow);
  if (e.eskiBicim) throw new HataMesaji(400, 'Eski biçimli kayıt düzenlenemez, yalnızca silinebilir');
  const yeni = { ...eskiRow };

  // --- nakit
  let kupur = e.nakitKupurDetayi;
  let nakitDegisti = false;
  if (alanlar.nakitKupurDetayi !== undefined) {
    kupur = {};
    Object.entries(alanlar.nakitKupurDetayi || {}).forEach(([k, v]) => {
      const kk = String(k).trim();
      if (!/^\d+(\.\d+)?$/.test(kk) || Number(kk) <= 0) throw new HataMesaji(400, 'Kupür değeri geçersiz');
      const adet = gsTutarGir(v, `${kk} TL adedi`);
      if (!Number.isInteger(adet)) throw new HataMesaji(400, `${kk} TL adedi tam sayı olmalı`);
      if (adet > 0) kupur[kk] = String(adet);
    });
    yeni.nakit_kupur = JSON.stringify(kupur);
    nakitDegisti = true;
  }
  let kasaAvansi = e.kasaAvansi;
  if (alanlar.kasaAvansi !== undefined) {
    kasaAvansi = gsTutarGir(alanlar.kasaAvansi, 'Kasa avansı', true);
    yeni.kasa_avansi = gsYaz(kasaAvansi);
    nakitDegisti = true;
  }
  let toplamNakit = e.toplamNakitPara;
  if (nakitDegisti) {
    const kupurK = Object.entries(kupur).reduce((x, [k, v]) => x + Math.round(Number(k) * 100) * Number(v), 0);
    toplamNakit = (kupurK + Math.round(kasaAvansi * 100)) / 100;
    yeni.toplam_nakit = gsYaz(toplamNakit);
  }

  // --- POS
  let posToplam = e.posToplam;
  if (alanlar.posTutarlari !== undefined) {
    if (!Array.isArray(alanlar.posTutarlari)) throw new HataMesaji(400, 'POS satırları geçersiz');
    const satirlar = alanlar.posTutarlari.map((p, i) => {
      const label = String(p?.label || `POS ${i + 1}`).trim().slice(0, 40);
      const t = gsTutarGir(p?.tutar, `${label} tutarı`);
      return { label, tutar: t > 0 ? gsYaz(t) : '' };
    });
    posToplam = gsTopla(...satirlar.map((x) => gsSayi(x.tutar)));
    yeni.pos_satirlari = JSON.stringify(satirlar);
    yeni.pos_toplam = gsYaz(posToplam);
  }

  // --- yemek kartı (marka x kolon)
  let yemekToplam = e.genelYemekToplami;
  if (alanlar.yemekTutarlari !== undefined) {
    const kolonlar = Array.isArray(e.yemekDetay.kolonlar) ? e.yemekDetay.kolonlar : [];
    const tutarlar = {};
    Object.entries(alanlar.yemekTutarlari || {}).forEach(([marka, satir]) => {
      const m = String(marka).trim();
      if (!m || m.length > 40) throw new HataMesaji(400, 'Marka adı geçersiz');
      const girilen = {};
      let var_ = false;
      Object.entries(satir || {}).forEach(([kolon, v]) => {
        if (!kolonlar.includes(kolon)) throw new HataMesaji(400, `"${kolon}" bu kayıtta yemek kartı kolonu değil`);
        const t = gsTutarGir(v, `${m} ${kolon}`);
        girilen[kolon] = t > 0 ? gsYaz(t) : '';
        if (t > 0) var_ = true;
      });
      if (var_) tutarlar[m] = Object.fromEntries(kolonlar.map((k) => [k, girilen[k] ?? '']));
    });
    yemekToplam = gsTopla(...Object.values(tutarlar).flatMap((x) => Object.values(x).map(gsSayi)));
    yeni.yemek_detay = JSON.stringify({ kolonlar, tutarlar });
    yeni.yemek_toplam = gsYaz(yemekToplam);
  }

  // --- kasalar
  let anaKasa = e.anaKasaToplam;
  if (alanlar.anaKasaToplam !== undefined) {
    anaKasa = gsTutarGir(alanlar.anaKasaToplam, 'Ana kasa harcaması');
    yeni.ana_kasa_toplam = gsYaz(anaKasa);
  }
  let gunluk = e.gunlukKasaToplam;
  if (alanlar.gunlukKasaToplam !== undefined) {
    gunluk = gsTutarGir(alanlar.gunlukKasaToplam, 'Günlük kasa harcaması');
    yeni.gunluk_kasa_toplam = gsYaz(gunluk);
  }
  if (alanlar.kaydedenSaat !== undefined) yeni.kaydeden_saat = String(alanlar.kaydedenSaat ?? '').trim().slice(0, 10);

  // --- ana kasa takibi ve ciro (yalnızca sayısal olarak değiştiyse yeniden yazılır; CARİ değerleri korunur)
  const t0 = e.anaKasaTakibi;
  const dunden = alanlar.dundenDevir !== undefined ? gsTutarGir(alanlar.dundenDevir, 'Dünden devir', true) : gsSayi(t0.dundenDevir);
  const takip = { dundenDevir: dunden, bugunkuNakit: toplamNakit, anaKasaHarcama: anaKasa, yarinaDevir: gsTopla(dunden, toplamNakit, -anaKasa) };
  if (!(gsEs(t0.dundenDevir, takip.dundenDevir) && gsEs(t0.bugunkuNakit, takip.bugunkuNakit) && gsEs(t0.anaKasaHarcama, takip.anaKasaHarcama) && gsEs(t0.yarinaDevir, takip.yarinaDevir))) {
    yeni.ana_kasa_takibi = JSON.stringify(takip);
  }
  const cariTahsilat = gsSayi(e.ciro.cariTahsilat);
  const ciro = { nakit: toplamNakit, kart: posToplam, yemek: yemekToplam, cari: e.cariToplam, cariTahsilat, toplam: gsTopla(toplamNakit, gunluk, e.cariToplam, posToplam, yemekToplam, cariTahsilat) };
  const c0 = e.ciro;
  if (!['nakit', 'kart', 'yemek', 'cari', 'cariTahsilat', 'toplam'].every((k) => gsEs(c0[k], ciro[k]))) yeni.ciro = JSON.stringify(ciro);
  return { row: yeni, kayit: gsKayit(yeni) };
}

const gsSirala = (satirlar) =>
  [...satirlar].sort((a, b) => {
    const x = gsTarihIso(a.tarih);
    const y = gsTarihIso(b.tarih);
    return x < y ? -1 : x > y ? 1 : (a.sira || 0) - (b.sira || 0);
  });

// liste[baslangicIdx]'ten itibaren devri yeniden hesaplar (liste yerinde güncellenir). İlk değişmeyen günde durur:
// zaten tutarlı olan sonraki günlere ve eskiden kalma tutarsızlıklara dokunulmaz.
export function gsZincir(liste, baslangicIdx) {
  const degisen = [];
  for (let j = Math.max(1, baslangicIdx); j < liste.length; j++) {
    const k = gsKayit(liste[j]);
    const onceki = gsKayit(liste[j - 1]);
    if (k.eskiBicim || onceki.eskiBicim || onceki.anaKasaTakibi.yarinaDevir === undefined) break;
    const dunden = gsSayi(onceki.anaKasaTakibi.yarinaDevir);
    const yarina = gsTopla(dunden, k.toplamNakitPara, -k.anaKasaToplam);
    const t = k.anaKasaTakibi;
    if (gsEs(t.dundenDevir, dunden) && gsEs(t.yarinaDevir, yarina) && gsEs(t.bugunkuNakit, k.toplamNakitPara) && gsEs(t.anaKasaHarcama, k.anaKasaToplam)) break;
    liste[j] = { ...liste[j], ana_kasa_takibi: JSON.stringify({ dundenDevir: dunden, bugunkuNakit: k.toplamNakitPara, anaKasaHarcama: k.anaKasaToplam, yarinaDevir: yarina }) };
    degisen.push({ tarih: k.tarih, eskiDunden: gsSayi(t.dundenDevir), yeniDunden: dunden, eskiYarina: gsSayi(t.yarinaDevir), yeniYarina: yarina });
  }
  return degisen;
}

async function gsHepsi(db) {
  const { data, error } = await db.from('gs_kayitlar').select('*').order('sira', { ascending: true });
  kontrol(error);
  return gsSirala((data || []).filter((r) => r.tarih).map(gsSatir));
}

// Formlardaki "Çekmeceden verildi" işareti: yalnızca BUGÜNÜN nakit ödemelerinde geçerli (kapanmış güne günlük kasa yazılmaz).
function kasaGrubuUygula(body, satirlar, tarih) {
  const g = body.kasaGrubu;
  if (!g || body.odemeTuru !== 'Nakit') return;
  if (g !== 'gunluk' && g !== 'ana') throw new HataMesaji(400, 'Kasa grubu geçersiz');
  if (g === 'gunluk' && tarih !== isGunuIstanbul()) throw new HataMesaji(400, 'Günlük kasa yalnızca bugünün nakit ödemelerinde seçilebilir');
  satirlar.forEach((r) => (r.kasa_grubu = g));
}

const DIGER_GIDERLER = 'Diğer Giderler';
const DIGER_KATEGORI = 'Diğer Giderler'; // mevcut kategori; serbest harcamanın varsayılanı

async function digerGiderlerFirmasi(db) {
  const oku = async () => {
    const { data, error } = await db.from('m2_firmalar').select('id,ad').eq('ad', DIGER_GIDERLER).maybeSingle();
    kontrol(error);
    return data;
  };
  const var_ = await oku();
  if (var_) return var_;
  const { error } = await db.from('m2_firmalar').insert({ ad: DIGER_GIDERLER, firma_turu: 'Firma', varsayilan_kategori: DIGER_KATEGORI });
  if (error && error.code !== '23505') kontrol(error);
  return oku();
}

// Günsonu Geliri: TL Kasa'ya giren nakit ciro = kayıttaki toplam nakit (sayılan) + günlük kasa harcaması. Kayıt yoksa gelir de yoktur.
async function gelirSenkron(db, tr) {
  const iso = gsTarihIso(tr);
  if (!iso) return;
  const { data: tl, error: tlHata } = await db.from('m2_firmalar').select('id').eq('ad', 'TL Kasa').maybeSingle();
  kontrol(tlHata);
  if (!tl) return;
  const { data: gs, error: gsHata } = await db.from('gs_kayitlar').select('toplam_nakit,gunluk_kasa_toplam,pos_toplam').eq('tarih', tr).maybeSingle();
  kontrol(gsHata);
  const sayilan = gs ? gsSayi(gs.toplam_nakit) : 0;
  const gunluk = gs ? (await tlKasaOzeti(db)).gun(iso).gunluk : 0; // günlük harcama defterden (kayıttaki değer kaynak değil)
  const fmt = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const { error } = await db.rpc('m2_gunsonu_geliri', {
    p_grup: gelirGrupId(iso),
    p_tarih: iso,
    p_firma: tl.id,
    p_tutar: gs ? gsTopla(sayilan, gunluk) : 0,
    p_aciklama: `Günsonu geliri — sayılan ${fmt(sayilan)} + günlük harcama ${fmt(gunluk)}`,
  });
  kontrol(error);

  // Kredi kartı (POS) toplamı: tek anlaşmalı POS (Ödeal), komisyon yok → Ödeal Kredi Kartı'na otomatik makbuz.
  const { data: od, error: odHata } = await db.from('m2_firmalar').select('id').eq('ad', 'Ödeal Kredi Kartı').maybeSingle();
  kontrol(odHata);
  if (!od) return;
  const pos = gs ? gsSayi(gs.pos_toplam) : 0;
  const { error: odYaz } = await db.rpc('m2_gunsonu_geliri', {
    p_grup: odealGrupId(iso),
    p_tarih: iso,
    p_firma: od.id,
    p_tutar: pos,
    p_aciklama: `Günsonu kredi kartı (POS) — ${fmt(pos)}`,
  });
  kontrol(odYaz);
}

// Harcama paneli verisi: günün TL Kasa nakit çıkışları, günlük/ana bloklara ayrılmış, toplamlar ve giriş kutusu seçenekleri.
async function hizliGiderVeri(db, iso) {
  const tr = isoToTR(iso);
  const { data: tl, error: tlHata } = await db.from('m2_firmalar').select('id').eq('ad', 'TL Kasa').maybeSingle();
  kontrol(tlHata);
  let satirlar = [];
  if (tl) {
    const { data: kar, error: karHata } = await db
      .from('m2_makbuzlar')
      .select('id,grup_id,tutar,kasa_grubu,kayit_zamani,makbuz_turu,kaynak')
      .eq('firma_id', tl.id).eq('otomatik', true).eq('tarih', iso);
    kontrol(karHata);
    // Kasadan çıkan: TL Kasa'ya yazılan otomatik tahsilat (+). Kasaya giren: bu panelden yazılan otomatik ödeme (−, iade / ortak girişi).
    // Başka formların kasa girişleri (Günsonu Geliri, Tahsilat makbuzu...) bu panele girmez.
    const karKayitlar = (kar || []).filter((k) => k.makbuz_turu === 'Tahsilat' || (k.makbuz_turu === 'Ödeme' && k.kaynak === 'hizli_gider'));
    const idler = [...new Set(karKayitlar.map((k) => k.grup_id).filter(Boolean))];
    if (idler.length) {
      const [fa, mk, av] = await Promise.all([
        db.from('m2_fis_faturalar').select('id,firma_id,firma_adi,aciklama,gider_kategorisi,fatura_tutari,kaynak,grup_id').in('grup_id', idler),
        db.from('m2_makbuzlar').select('id,firma_id,firma_adi,aciklama,tutar,otomatik,kaynak,grup_id').in('grup_id', idler),
        db.from('m2_personel_avans').select('id,personel_id,grup_id').in('grup_id', idler),
      ]);
      kontrol(fa.error);
      kontrol(mk.error);
      kontrol(av.error);
      const mFirmaIdler = [...new Set((mk.data || []).filter((x) => !x.otomatik && x.kaynak === 'hizli_gider').map((x) => x.firma_id))];
      const mFirmalar = new Map();
      if (mFirmaIdler.length) {
        const mf = await db.from('m2_firmalar').select('id,firma_turu').in('id', mFirmaIdler);
        kontrol(mf.error);
        (mf.data || []).forEach((x) => mFirmalar.set(x.id, x.firma_turu));
      }
      satirlar = idler.map((g) => {
        const k = karKayitlar.find((x) => x.grup_id === g);
        const isaret = k.makbuz_turu === 'Ödeme' ? -1 : 1;
        const f = (fa.data || []).find((x) => x.grup_id === g);
        const m = (mk.data || []).find((x) => x.grup_id === g && !x.otomatik);
        const a = (av.data || []).find((x) => x.grup_id === g);
        const temel = { id: g, kasaGrubu: k.kasa_grubu === 'gunluk' ? 'gunluk' : 'ana', zaman: k.kayit_zamani || '' };
        if (f && f.kaynak === 'hizli_gider') {
          if (f.firma_adi === DIGER_GIDERLER) {
            const [ad, ...rest] = String(f.aciklama || '').split(' — ');
            return { ...temel, tur: 'serbest', ad, aciklama: rest.join(' — '), tutar: isaret * Number(f.fatura_tutari), firmaId: f.firma_id, kategori: f.gider_kategorisi, kilitli: false };
          }
          return { ...temel, tur: 'cari', ad: f.firma_adi, aciklama: f.aciklama || '', tutar: isaret * Number(f.fatura_tutari), firmaId: f.firma_id, kategori: f.gider_kategorisi, kilitli: false };
        }
        if (f) return { ...temel, tur: 'diger', ad: f.firma_adi, aciklama: f.aciklama || '', tutar: Number(f.fatura_tutari), kilitli: true, kilitEtiketi: 'Fişler formundan' };
        if (m && m.kaynak === 'avans') return { ...temel, tur: 'personel', ad: m.firma_adi, aciklama: String(m.aciklama || '').replace(/^Avans(?: — )?/, ''), tutar: Number(m.tutar), firmaId: m.firma_id, avansId: a ? a.id : null, personelId: a ? a.personel_id : null, kilitli: false };
        if (m && m.kaynak === 'hizli_gider') {
          const ft = mFirmalar.get(m.firma_id);
          const tur = ft === 'Personel' ? 'personel' : ft === 'Ödeme Şekli' ? 'ortak' : 'sabit';
          return { ...temel, tur, ad: m.firma_adi, aciklama: m.aciklama || '', tutar: isaret * Number(m.tutar), firmaId: m.firma_id, kilitli: false };
        }
        return { ...temel, tur: 'diger', ad: m ? m.firma_adi : 'Nakit ödeme', aciklama: m ? m.aciklama || '' : '', tutar: Number(k.tutar), kilitli: true, kilitEtiketi: 'Makbuz formundan' };
      }).sort((x, y) => (x.zaman < y.zaman ? -1 : x.zaman > y.zaman ? 1 : 0));
    }
  }
  const topla = (l) => gsTopla(...l.map((x) => x.tutar));
  const gunluk = satirlar.filter((x) => x.kasaGrubu === 'gunluk');
  const ana = satirlar.filter((x) => x.kasaGrubu !== 'gunluk');
  const { data: gs, error: gsHata } = await db.from('gs_kayitlar').select('gunluk_kasa_toplam,toplam_nakit,kaydeden_saat').eq('tarih', tr).maybeSingle();
  kontrol(gsHata);

  const [fr, pr, sg, kt, fk, mk2, oy, of] = await Promise.all([
    db.from('m2_firmalar').select('id,ad,firma_turu,varsayilan_kategori').in('firma_turu', ['Firma', 'Personel', 'Sabit Gider']),
    db.from('m2_personel').select('id,firma_id,cikis_tarihi'),
    db.from('m2_sabit_giderler').select('firma_id,pasif_donem'),
    db.from('m2_kategoriler').select('ad'),
    db.from('m2_fis_faturalar').select('firma_id,firma_adi,aciklama,tarih').eq('kaynak', 'hizli_gider'),
    db.from('m2_makbuzlar').select('firma_id,tarih').in('kaynak', ['avans', 'hizli_gider']).eq('otomatik', false),
    db.from('m2_odeme_yontemleri').select('ad').eq('odeme_turu', 'Ortaklar'),
    db.from('m2_firmalar').select('id,ad').eq('firma_turu', 'Ödeme Şekli'),
  ]);
  [fr, pr, sg, kt, fk, mk2, oy, of].forEach((x) => kontrol(x.error));
  const ortakAdlari = new Set((oy.data || []).map((x) => norm(x.ad)));
  const personeller = new Map((pr.data || []).filter((x) => !x.cikis_tarihi).map((x) => [x.firma_id, x.id]));
  const sabitler = new Set((sg.data || []).filter((x) => !x.pasif_donem).map((x) => x.firma_id));
  const cariler = [];
  (fr.data || []).forEach((f) => {
    if (f.ad === DIGER_GIDERLER) return;
    if (f.firma_turu === 'Firma') cariler.push({ id: f.id, ad: f.ad, tur: 'cari', kategori: f.varsayilan_kategori || null });
    else if (f.firma_turu === 'Personel' && personeller.has(f.id)) cariler.push({ id: f.id, ad: f.ad, tur: 'personel', personelId: personeller.get(f.id) });
    else if (f.firma_turu === 'Sabit Gider' && sabitler.has(f.id)) cariler.push({ id: f.id, ad: f.ad, tur: 'sabit' });
  });
  (of.data || []).filter((f) => ortakAdlari.has(norm(f.ad))).forEach((f) => cariler.push({ id: f.id, ad: f.ad, tur: 'ortak' }));
  const kullanim = new Map();
  const say = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const bas120 = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  (fk.data || []).filter((x) => x.tarih >= bas120 && x.firma_adi !== DIGER_GIDERLER).forEach((x) => say(kullanim, x.firma_id));
  (mk2.data || []).filter((x) => x.tarih >= bas120).forEach((x) => say(kullanim, x.firma_id));
  const sikCariler = cariler.filter((c) => kullanim.has(c.id)).sort((a, b) => kullanim.get(b.id) - kullanim.get(a.id)).slice(0, 6);
  const serbest = new Map();
  (fk.data || []).filter((x) => x.tarih >= bas120 && x.firma_adi === DIGER_GIDERLER).forEach((x) => say(serbest, String(x.aciklama || '').split(' — ')[0]));
  const sikSerbest = [...serbest.entries()].filter(([ad]) => ad).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ad]) => ad);

  return {
    tarih: iso,
    tarihTR: tr,
    gunlukKasa: gunluk,
    anaKasa: ana,
    gunlukKasaToplam: topla(gunluk),
    anaKasaToplam: topla(ana),
    kapali: !!gs,
    kayitliGunlukToplam: gs ? gsSayi(gs.gunluk_kasa_toplam) : null,
    kayitliSaat: gs ? gs.kaydeden_saat || '' : '',
    cariler: cariler.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')),
    sikCariler,
    sikSerbest,
    kategoriler: (kt.data || []).map((x) => x.ad),
    varsayilanKategori: DIGER_KATEGORI,
  };
}


// ---------------------------------------------------------------------------
// TL Kasa defteri = devir ve harcama toplamlarının TEK kaynağı.
// Günsonu kaydındaki devir / ana kasa / günlük kasa değerleri artık kaynak değildir; okunurken defterden türetilir.
//   Bakiye: fiş (iade +, fatura −), makbuz (Ödeme +, Tahsilat −)  — TL Kasa firmasının satırları.
//   Harcama: TL Kasa'ya yazılan otomatik makbuzlar (Tahsilat +, hızlı gider ödemesi −), kasa_grubu 'gunluk' ise günlük kasa.
// ---------------------------------------------------------------------------
async function sayfaSayfaOku(kur) {
  const hepsi = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await kur().range(bas, bas + 999);
    kontrol(error);
    hepsi.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return hepsi;
}

export function tlKasaOzetiHesapla(fislar, makbuzlar) {
  const gunler = new Map();
  const gun = (iso) => {
    if (!gunler.has(iso)) gunler.set(iso, { net: 0, gelir: 0, ana: 0, gunluk: 0 });
    return gunler.get(iso);
  };
  const kr = (v) => Math.round(Number(v || 0) * 100);
  fislar.forEach((f) => { gun(f.tarih).net += (f.iade ? 1 : -1) * kr(f.fatura_tutari); });
  makbuzlar.forEach((m) => {
    const g = gun(m.tarih);
    const t = kr(m.tutar);
    g.net += (m.makbuz_turu === 'Ödeme' ? 1 : -1) * t;
    if (m.kaynak === 'gunsonu') g.gelir += (m.makbuz_turu === 'Ödeme' ? 1 : -1) * t;
    if (m.otomatik && (m.makbuz_turu === 'Tahsilat' || (m.makbuz_turu === 'Ödeme' && m.kaynak === 'hizli_gider'))) {
      const isaret = m.makbuz_turu === 'Ödeme' ? -1 : 1;
      if (m.kasa_grubu === 'gunluk') g.gunluk += isaret * t;
      else g.ana += isaret * t;
    }
  });
  const gunler100 = [...gunler.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const bakiye = (iso, dahil) => gunler100.reduce((x, [d, v]) => (d < iso || (dahil && d === iso) ? x + v.net : x), 0) / 100;
  const al = (iso) => {
    const v = gunler.get(iso) || { net: 0, gelir: 0, ana: 0, gunluk: 0 };
    return { net: v.net / 100, gelir: v.gelir / 100, ana: v.ana / 100, gunluk: v.gunluk / 100 };
  };
  return { bakiyeOnce: (iso) => bakiye(iso, false), bakiyeKadar: (iso) => bakiye(iso, true), gun: al };
}

async function tlKasaOzeti(db) {
  const { data: tl, error } = await db.from('m2_firmalar').select('id').eq('ad', 'TL Kasa').maybeSingle();
  kontrol(error);
  if (!tl) return tlKasaOzetiHesapla([], []);
  const [fa, mk] = await Promise.all([
    sayfaSayfaOku(() => db.from('m2_fis_faturalar').select('tarih,fatura_tutari,iade').eq('firma_id', tl.id).order('id')),
    sayfaSayfaOku(() => db.from('m2_makbuzlar').select('tarih,tutar,makbuz_turu,otomatik,kaynak,kasa_grubu').eq('firma_id', tl.id).order('id')),
  ]);
  return tlKasaOzetiHesapla(fa, mk);
}

// Günsonu satırlarının devir / ana kasa / günlük kasa / ciro alanlarını defterden türetir (saklanan değer yok sayılır).
// gelirOverride {tarih: gelir}: önizleme için, o günün TL Kasa geliri "bu kadar olsaydı" hesabı.
export function gsTurevle(ozet, liste, gelirOverride = {}) {
  let delta = 0;
  return liste.map((satir) => {
    const k = gsKayit(satir);
    if (k.eskiBicim) return satir;
    const iso = gsTarihIso(satir.tarih);
    const g = ozet.gun(iso);
    const sayilan = gsSayi(satir.toplam_nakit);
    const gelirYeni = gelirOverride[satir.tarih] !== undefined ? gelirOverride[satir.tarih] : gsTopla(sayilan, g.gunluk);
    const dunden = gsTopla(ozet.bakiyeOnce(iso), delta);
    delta = gsTopla(delta, gelirYeni, -g.gelir);
    const yarina = gsTopla(ozet.bakiyeKadar(iso), delta);
    const diger = gsTopla(yarina, -dunden, -sayilan, g.ana);
    const takip = { dundenDevir: dunden, bugunkuNakit: sayilan, anaKasaHarcama: g.ana, yarinaDevir: yarina };
    if (Math.abs(diger) >= 0.005) takip.digerHareket = diger;
    const yeni = { ...satir, ana_kasa_toplam: gsYaz(g.ana), gunluk_kasa_toplam: gsYaz(g.gunluk), ana_kasa_takibi: JSON.stringify(takip) };
    const ciro = gsParse(satir.ciro, null);
    if (ciro && ciro.toplam !== undefined) yeni.ciro = JSON.stringify({ ...ciro, toplam: gsTopla(ciro.toplam, g.gunluk, -gsSayi(satir.gunluk_kasa_toplam)) });
    return yeni;
  });
}

// TL Kasa'yı etkileyen bir işlemden sonra, etkilenen günlerin Günsonu Geliri'ni defterdeki günlük harcamaya göre yeniler.
const TL_YAZAN = new Set(['fisFaturaKaydet', 'makbuzKaydet', 'kayitDuzenle', 'kayitAlan', 'kayitSil', 'kayitGeriYaz', 'avansKaydet', 'avansSil', 'hizliGiderKaydet', 'hizliGiderSil', 'hizliGiderGeriYaz', 'harcamaDegistir', 'harcamaSil']);

async function etkilenenGunler(db, body) {
  const kume = new Set([isGunuIstanbul()]);
  try { if (body.tarih) kume.add(tarihKontrol(body.tarih)); } catch { /* geçersiz tarih zaten işlem hatası verir */ }
  for (const id of [body.grupId, body.id]) {
    if (!id) continue;
    const [f, m] = await Promise.all([
      db.from('m2_fis_faturalar').select('tarih').eq('grup_id', id),
      db.from('m2_makbuzlar').select('tarih').eq('grup_id', id),
    ]);
    [...(f.data || []), ...(m.data || [])].forEach((r) => kume.add(r.tarih));
  }
  return kume;
}

async function gelirTazele(db, isoKume) {
  for (const iso of isoKume) {
    const tr = isoToTR(iso);
    const { data, error } = await db.from('gs_kayitlar').select('tarih').eq('tarih', tr).maybeSingle();
    kontrol(error);
    if (data) await gelirSenkron(db, tr);
  }
}

export default async function handler(req, res) {
  try {
    const db = dbAl();
    const resource = req.query?.resource;
    const body = req.body || {};

    if (req.method === 'POST' && TL_YAZAN.has(resource)) {
      const once = await etkilenenGunler(db, body);
      const jsonAsil = res.json.bind(res);
      res.json = (v) => {
        if ((res.statusCode || 200) >= 400 || !v || v.error) return jsonAsil(v);
        etkilenenGunler(db, body)
          .then((sonra) => gelirTazele(db, new Set([...once, ...sonra])))
          .catch((e) => console.error('Günsonu geliri yenilenemedi:', e))
          .finally(() => jsonAsil(v));
        return res;
      };
    }

    // ---------- Okuma ----------
    if (req.method === 'GET' && resource === 'baslangic') {
      const [fi, ba, ka, yo] = await Promise.all([
        db.from('m2_firmalar').select('id,ad,varsayilan_kategori,firma_turu'),
        db.from('m2_firma_bakiye').select('firma_id,bakiye'),
        db.from('m2_kategoriler').select('ad').order('sira').order('ad'),
        db.from('m2_odeme_yontemleri').select('id,odeme_turu,ad').order('kayit_zamani').order('ad'),
      ]);
      [fi, ba, ka, yo].forEach((r) => kontrol(r.error));
      const bakiyeHaritasi = new Map((ba.data || []).map((x) => [x.firma_id, Number(x.bakiye)]));
      const firmalar = (fi.data || [])
        .map((f) => ({ ...f, bakiye: bakiyeHaritasi.get(f.id) || 0 }))
        .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      return res.status(200).json({
        firmalar,
        kategoriler: (ka.data || []).map((k) => k.ad),
        odemeYontemleri: yo.data || [],
        bugun: bugunIstanbul(),
      });
    }

    // Hesap Özetleri: her cari için kart bilgisi. Bakiye = Borç - Alacak (eksi = firma alacaklı, bizim borcumuz).
    //   Borç   : ödeme (tediye) makbuzları
    //   Alacak : fatura/fişler + tahsilat makbuzları
    if (req.method === 'GET' && resource === 'hesapOzetleri') {
      const [oz, yo, ka] = await Promise.all([
        db.from('m2_firma_ozet').select('firma_id,ad,firma_turu,varsayilan_kategori,borc,alacak,son_islem,islem_sayisi'),
        db.from('m2_odeme_yontemleri').select('odeme_turu,ad'),
        db.from('m2_kategoriler').select('ad').order('sira').order('ad'),
      ]);
      [oz, yo, ka].forEach((r) => kontrol(r.error));
      const yontemler = yo.data || [];
      const firmalar = (oz.data || [])
        .map((f) => {
          const borc = Number(f.borc) || 0;
          const alacak = Number(f.alacak) || 0;
          const { grup, bolum } = grupBul(f, yontemler);
          return {
            id: f.firma_id,
            ad: f.ad,
            varsayilanKategori: f.varsayilan_kategori || '',
            firmaTuru: f.firma_turu,
            grup,
            bolum,
            borc,
            alacak,
            bakiye: Math.round((borc - alacak) * 100) / 100,
            sonIslem: f.son_islem || null,
            islemSayisi: Number(f.islem_sayisi) || 0,
          };
        })
        .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      return res.status(200).json({ firmalar, kategoriler: (ka.data || []).map((k) => k.ad) });
    }

    // Ekstre: bir carinin tüm hareketleri, eskiden yeniye, satır satır yürüyen bakiyeyle (Borç - Alacak).
    if (req.method === 'GET' && resource === 'ekstre') {
      const firmaId = req.query?.firmaId;
      if (!firmaId) throw new HataMesaji(400, 'firmaId gerekli');
      const { data: firma, error: fHata } = await db
        .from('m2_firmalar')
        .select('id,ad,firma_turu')
        .eq('id', firmaId)
        .maybeSingle();
      kontrol(fHata);
      if (!firma) throw new HataMesaji(404, 'Firma bulunamadı');
      const [fa, mk, yo] = await Promise.all([
        db
          .from('m2_fis_faturalar')
          .select('id,tarih,fatura_no,aciklama,odeme_hesabi,kasa,fatura_tutari,grup_id,kayit_zamani,iade,kaynak')
          .eq('firma_id', firmaId),
        db
          .from('m2_makbuzlar')
          .select('id,tarih,makbuz_turu,fatura_no,aciklama,odeme_hesabi,kasa,tutar,otomatik,grup_id,kayit_zamani,kaynak')
          .eq('firma_id', firmaId),
        db.from('m2_odeme_yontemleri').select('odeme_turu,ad'),
      ]);
      [fa, mk, yo].forEach((r) => kontrol(r.error));
      const { grup, bolum } = grupBul({ ad: firma.ad, firma_turu: firma.firma_turu }, yo.data || []);
      return res.status(200).json({ firma: { id: firma.id, ad: firma.ad, grup, bolum }, ...ekstreHesapla(fa.data || [], mk.data || []) });
    }

    // Datalar: bütün fatura/fiş ve makbuz kayıtları Excel düzeninde (en yeni üstte).
    if (req.method === 'GET' && resource === 'datalar') {
      // Tüm kayıtlar 1000'erlik sayfalarla çekilir (filtreler yüklenen satırlar üzerinde çalışır).
      let tum = [];
      for (let sayfa = 0; sayfa < DATALAR_MAKS_SAYFA; sayfa++) {
        const { data, error } = await db
          .from('m2_datalar')
          .select(
            'id,tarih,evrak_turu,firma_adi,fatura_no,aciklama,gider_kategorisi,odeme_turu,odeme_sekli,tutar,kdv,tahsilat,odeme_tediye,otomatik,kayit_zamani,sira,grup_id,kaynak',
          )
          .order('tarih', { ascending: false })
          .order('kayit_zamani', { ascending: false })
          .order('sira', { ascending: true })
          .order('id', { ascending: true })
          .range(sayfa * DATALAR_SAYFA, sayfa * DATALAR_SAYFA + DATALAR_SAYFA - 1);
        kontrol(error);
        tum = tum.concat(data || []);
        if (!data || data.length < DATALAR_SAYFA) break;
      }
      const kayitlar = tum.map((r) => ({
        id: r.id,
        tarih: r.tarih,
        evrakTuru: r.kaynak === 'devir' ? 'Devir' : r.evrak_turu,
        firmaAdi: r.firma_adi,
        faturaNo: r.fatura_no || '',
        aciklama: r.aciklama || '',
        giderKategorisi: r.gider_kategorisi || '',
        odemeTuru: r.odeme_turu || '',
        odemeSekli: r.odeme_sekli || '',
        tutar: sayiOrNull(r.tutar),
        kdv: sayiOrNull(r.kdv),
        tahsilat: sayiOrNull(r.tahsilat),
        odemeTediye: sayiOrNull(r.odeme_tediye),
        otomatik: !!r.otomatik,
        grupId: r.grup_id || null,
        kaynak: r.kaynak || null,
      }));
      return res.status(200).json({ kayitlar, sinirli: kayitlar.length >= DATALAR_SAYFA * DATALAR_MAKS_SAYFA });
    }

    // Yemek Kartları: seçili dönem ve kesim için her kartın durumu.
    // Günsonu aralığı KARTA ve KESİME özeldir (kesilmişse kayıtlı aralık, kesilmemişse öneri).
    if (req.method === 'GET' && resource === 'yemekKarti') {
      const donem = String(req.query?.donem || bugunIstanbul().slice(0, 7));
      const kesim = Number(req.query?.kesim || 10);
      if (!/^\d{4}-\d{2}$/.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      if (![10, 20, 30].includes(kesim)) throw new HataMesaji(400, 'Kesim geçersiz');
      const [kr, ks] = await Promise.all([
        db.from('m2_yk_kartlar').select('*').order('sira'),
        db.from('m2_yk_kesimler').select('*'),
      ]);
      [kr, ks].forEach((r) => kontrol(r.error));
      const kartlar = kr.data || [];
      const tumKesimler = ks.data || [];
      const buKesimler = tumKesimler.filter((x) => x.donem === donem && x.kesim === kesim);

      // Her kartın günsonu aralığı
      const aralik = new Map();
      kartlar.forEach((k) => {
        const kesimlerKart = tumKesimler.filter((x) => x.kart_id === k.id);
        const kes = buKesimler.find((x) => x.kart_id === k.id) || null;
        const oneri = aralikOneri({ kart: kartCamel(k), kesimlerKart, donem, kesim });
        if (kes) {
          const uyari = aralikUyarisi(oneri.onceki, kes.gunsonu_bas);
          aralik.set(k.id, { bas: kes.gunsonu_bas, bit: kes.gunsonu_bit, oneri: false, uyari, onceKesimYok: oneri.onceKesimYok });
        } else {
          aralik.set(k.id, { bas: oneri.bas, bit: oneri.bit, oneri: true, uyari: null, onceKesimYok: oneri.onceKesimYok });
        }
      });
      const hepsiBas = [...aralik.values()].map((x) => x.bas).sort()[0];
      const hepsiBit = [...aralik.values()].map((x) => x.bit).sort().slice(-1)[0];

      const firmaIdleri = kartlar.map((k) => k[`firma${kesim}_id`]).filter(Boolean);
      const [fr, od, harita] = await Promise.all([
        firmaIdleri.length ? db.from('m2_firmalar').select('id,ad').in('id', firmaIdleri) : { data: [], error: null },
        buKesimler.length ? db.from('m2_yk_odemeler').select('*').in('kesim_id', buKesimler.map((k) => k.id)) : { data: [], error: null },
        hepsiBas && hepsiBit ? gunsonuGunluk(db, hepsiBas, hepsiBit).catch(() => new Map()) : new Map(),
      ]);
      [fr, od].forEach((r) => kontrol(r.error));
      const firmaHaritasi = new Map((fr.data || []).map((f) => [f.id, f]));
      const bugun = bugunIstanbul();
      const r2 = (x) => Math.round(x * 100) / 100;
      const satirlar = kartlar
        .filter((k) => !k.pasif)
        .map((k) => {
          const kes = buKesimler.find((x) => x.kart_id === k.id) || null;
          const cari = firmaHaritasi.get(k[`firma${kesim}_id`]) || null;
          const odemeler = kes
            ? (od.data || [])
                .filter((o) => o.kesim_id === kes.id)
                .sort((a, b) => (a.gelis_tarihi < b.gelis_tarihi ? -1 : 1))
                .map((o) => ({ id: o.id, tutar: sayiN(o.tutar), gelisTarihi: o.gelis_tarihi, hesapAdi: o.hesap_adi }))
            : [];
          const gelenToplam = r2(odemeler.reduce((x, o) => x + o.tutar, 0));
          const ar = aralik.get(k.id);
          const gg = kartGunleri(k.ad, harita, ar.bas, ar.bit);
          const kesimObj = kes ? kesimCamel(kes) : null;
          const kalan = kesimObj ? r2(kesimObj.bankayaYatacak - gelenToplam) : 0;
          const sonGelis = odemeler.length ? odemeler[odemeler.length - 1].gelisTarihi : '';
          return {
            kart: kartCamel(k),
            kesilirMi: !!k[`kesim${kesim}`],
            cari: cari ? { id: cari.id, ad: cari.ad } : null,
            kesim: kesimObj,
            odemeler,
            gelenToplam,
            kalan,
            gunsonu: { bas: ar.bas, bit: ar.bit, oneri: ar.oneri, uyari: ar.uyari, onceKesimYok: ar.onceKesimYok, eksikGunSayisi: gg.eksikGunler.length },
            gunsonuToplam: gg.toplam,
            gunsonuFark: kesimObj ? r2(kesimObj.faturaToplami - gg.toplam) : 0,
            vadeFarkliMi: !!(kesimObj && sonGelis && kesimObj.vade && sonGelis !== kesimObj.vade),
            vadeGecti: !!(kesimObj && kesimObj.vade && kesimObj.vade < bugun && kalan > 0.005),
          };
        });
      return res.status(200).json({ satirlar, donem, kesim });
    }

    // Fatura Kes penceresi için: önerilen/seçilen günsonu aralığı, gün gün döküm, boşluk/çakışma uyarısı.
    if (req.method === 'GET' && resource === 'yemekKartiOnizleme') {
      const donem = String(req.query?.donem || '');
      const kesim = Number(req.query?.kesim);
      if (!/^\d{4}-\d{2}$/.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      if (![10, 20, 30].includes(kesim)) throw new HataMesaji(400, 'Kesim geçersiz');
      const kart = await ykKartGetir(db, req.query?.kartId);
      const { data: kesimlerKart, error: kkHata } = await db.from('m2_yk_kesimler').select('*').eq('kart_id', kart.id);
      kontrol(kkHata);
      const faturaTarihi = ISO_RE.test(String(req.query?.faturaTarihi || '')) ? req.query.faturaTarihi : '';
      const oneri = aralikOneri({ kart: kartCamel(kart), kesimlerKart: kesimlerKart || [], donem, kesim, faturaTarihi });
      const bas = req.query?.bas ? String(req.query.bas) : oneri.bas;
      const bit = req.query?.bit ? String(req.query.bit) : oneri.bit;
      aralikDogrula(bas, bit);
      const harita = await gunsonuGunluk(db, bas, bit);
      const gg = kartGunleri(kart.ad, harita, bas, bit);
      return res.status(200).json({
        bas,
        bit,
        oneriBas: oneri.bas,
        oneriBit: oneri.bit,
        onceki: oneri.onceki,
        onceKesimYok: oneri.onceKesimYok,
        uyari: aralikUyarisi(oneri.onceki, bas),
        gunler: gg.gunler,
        toplam: gg.toplam,
        eksikGunler: gg.eksikGunler,
      });
    }

    // ---------- Kayıt grubu ----------
    if (req.method === 'GET' && resource === 'kayitGrubu') {
      const g = await grupOku(db, req.query?.grupId);
      if (grupBosMu(g)) throw new HataMesaji(404, 'Kayıt bulunamadı');
      return res.status(200).json({ ...g, kaynak: grupKaynagi(g) });
    }

    // ---------- Personel Klasörü ----------
    if (req.method === 'GET' && resource === 'personelListe') {
      const { data, error } = await db.from('m2_personel').select('*');
      kontrol(error);
      const bugun = bugunIstanbul();
      const liste = (data || []).map((p) => personelCamel(p, bugun)).sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
      return res.status(200).json({ personeller: liste.map((p) => ({ id: p.id, adSoyad: p.adSoyad, gorev: p.gorev, aktif: p.aktif })) });
    }

    // Maaş, notlar ve parasal puantaj değerleri YALNIZCA goster=1 ise döner (göz butonu açıkken ayrı istekle çekilir).
    if (req.method === 'GET' && resource === 'personelDetay') {
      const per = await personelGetir(db, req.query?.id);
      const donem = DONEM_RE.test(String(req.query?.donem || '')) ? req.query.donem : bugunIstanbul().slice(0, 7);
      const goster = String(req.query?.goster || '') === '1';
      const bugun = bugunIstanbul();
      const [gecmis, iz, av, nt, tk] = await Promise.all([
        maasGecmisiGetir(db, per.id),
        db.from('m2_personel_izin').select('*').eq('personel_id', per.id),
        db.from('m2_personel_avans').select('*').eq('personel_id', per.id),
        goster ? db.from('m2_personel_notlar').select('*').eq('personel_id', per.id) : { data: null, error: null },
        db.from('m2_tahakkuklar').select('donem,tarih').eq('donem', donem).maybeSingle(),
      ]);
      [iz, av, nt, tk].forEach((x) => kontrol(x.error));
      const izinler = (iz.data || []).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
      const maas = maasBul(gecmis, donem);
      const pt = puantajHesapla({ maas, donem, iseGiris: per.ise_giris, cikisTarihi: per.cikis_tarihi, izinler });
      const puantaj = { gunler: pt.gunler, toplamGun: pt.toplamGun, calisilanGun: pt.calisilanGun, ucretliGun: pt.ucretliGun, tamAy: pt.tamAy, izinGun: pt.izinGun };
      if (goster) Object.assign(puantaj, { gunlukMaas: pt.gunlukMaas, brut: pt.brut, kesinti: pt.kesinti, net: pt.net });
      const personel = personelCamel(per, bugun);
      if (goster) Object.assign(personel, { maas, maasGecmisi: gecmis.map((g) => ({ gecerliDonem: g.gecerli_donem, maas: Number(g.maas) })).sort((a, b) => (a.gecerliDonem < b.gecerliDonem ? -1 : 1)) });
      return res.status(200).json({
        personel,
        donem,
        kilitli: !!tk.data,
        tahakkukTarihi: tk.data ? tk.data.tarih : null,
        puantaj,
        izinler: izinler
          .filter((i) => String(i.tarih).startsWith(donem))
          .map((i) => ({ id: i.id, tarih: i.tarih, tur: i.tur, sebep: i.sebep || '', grupId: i.grup_id || null, ...(goster ? { kesinti: Number(i.kesinti) } : {}) })),
        avanslar: (av.data || [])
          .filter((a) => String(a.tarih).startsWith(donem))
          .sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
          .map((a) => ({ id: a.id, tarih: a.tarih, tutar: Number(a.tutar), odemeTuru: a.odeme_turu, odemeSekli: a.kasa || a.odeme_hesabi || '', aciklama: a.aciklama || '' })),
        notlar: goster ? (nt.data || []).sort((a, b) => (a.kayit_zamani < b.kayit_zamani ? 1 : -1)).map((n) => ({ id: n.id, tarih: n.kayit_zamani, metin: n.metin })) : null,
      });
    }

    // Hakediş Dökümü: maaş bilgisi içerdiği için YALNIZCA goster=1 ise döner (göz butonuyla aynı kural).
    if (req.method === 'GET' && resource === 'personelDokum') {
      const per = await personelGetir(db, req.query?.id);
      if (String(req.query?.goster || '') !== '1') return res.status(200).json({ gizli: true });
      const [fa, mk] = await Promise.all([
        db.from('m2_fis_faturalar').select('id,tarih,fatura_no,aciklama,odeme_hesabi,kasa,fatura_tutari,grup_id,kayit_zamani,iade,kaynak').eq('firma_id', per.firma_id),
        db.from('m2_makbuzlar').select('id,tarih,makbuz_turu,fatura_no,aciklama,odeme_hesabi,kasa,tutar,otomatik,grup_id,kayit_zamani,kaynak').eq('firma_id', per.firma_id),
      ]);
      kontrol(fa.error);
      kontrol(mk.error);
      return res.status(200).json(personelDokumHesapla(fa.data || [], mk.data || []));
    }

    // İzin formu: otomatik kesinti önerisi
    if (req.method === 'GET' && resource === 'izinOnizleme') {
      const per = await personelGetir(db, req.query?.personelId);
      const bas = tarihKontrol(req.query?.bas);
      const bit = req.query?.bit ? tarihKontrol(req.query.bit) : bas;
      if (gunFarki(bas, bit) < 0 || gunFarki(bas, bit) + 1 > 31) throw new HataMesaji(400, 'Tarih aralığı geçersiz (en fazla 31 gün)');
      const tur = req.query?.tur === 'Yarım' ? 'Yarım' : 'Tam';
      const gunler = gunListesi(bas, bit);
      const gecmis = await maasGecmisiGetir(db, per.id);
      return res.status(200).json({ gun: tur === 'Yarım' ? 0.5 : gunler.length, kesinti: izinKesintisiK(gecmis, gunler, tur) / 100 });
    }

    // ---------- Tahakkuklar ----------
    if (req.method === 'GET' && resource === 'tahakkukOnizleme') {
      const donem = String(req.query?.donem || '');
      if (!DONEM_RE.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      const v = await tahakkukVeri(db, donem);
      // Tahakkuk BRÜT maaşı yazar; izin kesintileri izin girilirken iade faturası olarak cariye zaten işlenmiştir.
      const toplam = r2(v.personeller.reduce((x, p) => x + (p.fisYazilir ? p.brut : 0), 0) + v.sabitGiderler.reduce((x, g) => x + g.tutar, 0));
      return res.status(200).json({
        donem,
        guncelDonem: bugunIstanbul().slice(0, 7),
        tahakkuk: v.tahakkuk ? { id: v.tahakkuk.id, tarih: v.tahakkuk.tarih, yapildiZaman: v.tahakkuk.yapildi_zaman, toplam: sayiN(v.tahakkuk.toplam) } : null,
        personeller: v.personeller,
        sabitGiderler: v.sabitGiderler,
        pasifGiderler: v.pasifGiderler,
        toplam,
        donemler: v.donemler,
      });
    }
    if (req.method === 'GET' && resource === 'tahakkukDetay') {
      const donem = String(req.query?.donem || '');
      if (!DONEM_RE.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      const per = await personelGetir(db, req.query?.personelId);
      const [iz, av] = await Promise.all([
        db.from('m2_personel_izin').select('*').eq('personel_id', per.id),
        db.from('m2_personel_avans').select('*').eq('personel_id', per.id),
      ]);
      [iz, av].forEach((x) => kontrol(x.error));
      return res.status(200).json({
        adSoyad: per.ad_soyad,
        donem,
        izinler: (iz.data || []).filter((i) => String(i.tarih).startsWith(donem)).sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
          .map((i) => ({ id: i.id, tarih: i.tarih, tur: i.tur, kesinti: Number(i.kesinti), sebep: i.sebep || '' })),
        avanslar: (av.data || []).filter((a) => String(a.tarih).startsWith(donem)).sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
          .map((a) => ({ id: a.id, tarih: a.tarih, tutar: Number(a.tutar), odemeSekli: a.kasa || a.odeme_hesabi || '', aciklama: a.aciklama || '' })),
      });
    }

    // ---------- Hızlı gider paneli ----------
    if (req.method === 'GET' && resource === 'hizliGiderListe') {
      const iso = req.query?.tarih ? tarihKontrol(req.query.tarih) : isGunuIstanbul();
      return res.status(200).json(await hizliGiderVeri(db, iso));
    }

    // ---------- Günsonları ----------
    // Günün ana/günlük kasa harcama satırları (Muhasebe2 defterinden); toplamlar günsonu kaydının kendisindedir.
    if (req.method === 'GET' && resource === 'gunsonuHarcama') {
      const iso = gsTarihIso(req.query?.tarih);
      if (!iso) throw new HataMesaji(400, 'Tarih geçersiz');
      const v = await hizliGiderVeri(db, iso);
      const donustur = (l) => l.map((x) => ({ id: x.id, firmaAdi: x.ad, aciklama: x.aciklama || '', tutar: x.tutar }));
      return res.status(200).json({ anaKasa: donustur(v.anaKasa), gunlukKasa: donustur(v.gunlukKasa) });
    }

    // İlk Gün Sonu için açılış devri: önceki Gün Sonu kaydı yokken "dünden devir ana kasa" = TL Kasa'nın o günden ÖNCEKİ bakiyesi.
    // Bakiye (borç − alacak): devir kaydı + makbuzlar (ödeme +, tahsilat −) + fişler; günün kendi hareketleri dahil değildir.
    if (req.method === 'GET' && resource === 'gunsonuAcilisDevri') {
      const iso = gsTarihIso(req.query?.tarih);
      if (!iso) throw new HataMesaji(400, 'Tarih geçersiz');
      const { data: tl, error: tlHata } = await db.from('m2_firmalar').select('id').eq('ad', 'TL Kasa').maybeSingle();
      kontrol(tlHata);
      if (!tl) return res.status(200).json({ devir: 0 });
      const [fa, mk] = await Promise.all([
        db.from('m2_fis_faturalar').select('fatura_tutari,iade').eq('firma_id', tl.id).lt('tarih', iso),
        db.from('m2_makbuzlar').select('tutar,makbuz_turu').eq('firma_id', tl.id).lt('tarih', iso),
      ]);
      kontrol(fa.error);
      kontrol(mk.error);
      const k = (fa.data || []).reduce((t, f) => t + (f.iade ? 1 : -1) * kurus(f.fatura_tutari), 0)
        + (mk.data || []).reduce((t, m) => t + (m.makbuz_turu === 'Ödeme' ? 1 : -1) * kurus(m.tutar), 0);
      return res.status(200).json({ devir: k / 100 });
    }

    // Gün Sonu ekranı için devir: dünden devir = TL Kasa'nın o günden ÖNCEKİ bakiyesi; bugunHareket = o günün TL Kasa hareketleri
    // (Günsonu Geliri hariç). Yarına devir = dünden devir + bugunHareket + sayılan nakit + günlük harcama.
    if (req.method === 'GET' && resource === 'gunsonuDevir') {
      const iso = gsTarihIso(req.query?.tarih);
      if (!iso) throw new HataMesaji(400, 'Tarih geçersiz');
      const oz = await tlKasaOzeti(db);
      const g = oz.gun(iso);
      return res.status(200).json({ dunden: oz.bakiyeOnce(iso), bugunHareket: gsTopla(g.net, -g.gelir) });
    }

    // Alacak/Borç Raporu: tüm carilerin güncel bakiyesi (borç − alacak). Eksi = bizim borcumuz, artı = bizim alacağımız. Sıfır bakiyeler dışarıda.
    if (req.method === 'GET' && resource === 'alacakBorcRaporu') {
      const [oz, yo] = await Promise.all([
        db.from('m2_firma_ozet').select('firma_id,ad,firma_turu,borc,alacak,son_islem'),
        db.from('m2_odeme_yontemleri').select('ad,odeme_turu'),
      ]);
      kontrol(oz.error);
      kontrol(yo.error);
      const yontemTuru = new Map((yo.data || []).map((x) => [norm(x.ad), x.odeme_turu]));
      const YONTEM_ETIKET = { Nakit: 'Kasa', 'Banka Havalesi': 'Banka', 'Kredi Kartı': 'Kredi Kartı', Ortaklar: 'Ortaklar' };
      const satirlar = (oz.data || [])
        .map((r) => ({
          id: r.firma_id,
          ad: r.ad,
          tur: r.firma_turu === 'Ödeme Şekli' ? YONTEM_ETIKET[yontemTuru.get(norm(r.ad))] || 'Kasa / Banka' : r.firma_turu,
          bakiye: Math.round((Number(r.borc || 0) - Number(r.alacak || 0)) * 100) / 100,
          sonIslem: r.son_islem || null,
        }))
        .filter((r) => Math.abs(r.bakiye) >= 0.005);
      return res.status(200).json({ satirlar, zaman: new Date().toISOString() });
    }

    if (req.method === 'GET' && resource === 'gunsonuListe') {
      const liste = await gsHepsi(db);
      return res.status(200).json({ kayitlar: gsTurevle(await tlKasaOzeti(db), liste).map(gsKayit) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ---------- Fiş / Fatura girişi ----------
    if (resource === 'fisFaturaKaydet') {
      const { fatura, makbuzlar, firma } = await faturaGrubuUret(db, body, randomUUID());
      if (!fatura.iade) kasaGrubuUygula(body, [fatura, ...makbuzlar], fatura.tarih);
      // Fonksiyon fatura ve makbuzlarını TEK işlemde yazar: ya hepsi yazılır ya hiçbiri.
      const { error } = await db.rpc('m2_fatura_yaz', { p_fatura: fatura, p_makbuzlar: makbuzlar });
      kontrol(error);
      return res.status(200).json({ ok: true, bakiye: await bakiyeGetir(db, firma.id), otomatikMakbuz: makbuzlar.length });
    }

    if (resource === 'makbuzKaydet') {
      const { makbuzlar, firma } = await makbuzGrubuUret(db, body, randomUUID());
      if (body.makbuzTuru === 'Ödeme') kasaGrubuUygula(body, makbuzlar, makbuzlar[0].tarih);
      // Tek insert = tek işlem: makbuz ve karşı makbuzu birlikte yazılır.
      const { error } = await db.from('m2_makbuzlar').insert(makbuzlar);
      kontrol(error);
      return res.status(200).json({ ok: true, bakiye: await bakiyeGetir(db, firma.id) });
    }

    // ---------- Firma bilgisi düzenleme ----------
    // Ad değişirse tüm eski kayıtlarda da değişir (SQL fonksiyonu tek işlemde yapar).
    // Varsayılan kategori sadece forma otomatik gelen değerdir; eski faturaları değiştirmez.
    if (resource === 'firmaGuncelle') {
      const ad = String(body.ad || '').trim();
      if (!ad) throw new HataMesaji(400, 'Firma adı gerekli');
      const firma = await firmaGetir(db, body.firmaId);
      const kategori = metin(body.varsayilanKategori);
      if (kategori) {
        const { data: kat, error: katHata } = await db.from('m2_kategoriler').select('id').eq('ad', kategori).maybeSingle();
        kontrol(katHata);
        if (!kat) throw new HataMesaji(400, 'Kategori bulunamadı');
      }
      const { error } = await db.rpc('m2_firma_guncelle', {
        p_firma_id: firma.id,
        p_ad: ad,
        p_varsayilan_kategori: kategori,
      });
      if (error?.code === '23505') throw new HataMesaji(409, 'Bu isimde bir firma zaten var');
      kontrol(error);
      return res.status(200).json({ ok: true });
    }

    // ---------- Tanımlar ----------
    if (resource === 'firmaEkle') {
      const ad = String(body.ad || '').trim();
      if (!ad) throw new HataMesaji(400, 'Firma adı gerekli');
      const { data, error } = await db
        .from('m2_firmalar')
        .insert({ ad, varsayilan_kategori: metin(body.varsayilanKategori), firma_turu: 'Firma' })
        .select('id,ad,varsayilan_kategori,firma_turu')
        .single();
      if (error?.code === '23505') throw new HataMesaji(409, 'Bu isimde bir firma zaten var');
      kontrol(error);
      return res.status(200).json({ ok: true, firma: { ...data, bakiye: 0 } });
    }

    if (resource === 'kategoriEkle') {
      const ad = String(body.ad || '').trim();
      if (!ad) throw new HataMesaji(400, 'Kategori adı gerekli');
      const { data, error } = await db.from('m2_kategoriler').insert({ ad, sira: 50 }).select('ad').single();
      if (error?.code === '23505') throw new HataMesaji(409, 'Bu isimde bir kategori zaten var');
      kontrol(error);
      return res.status(200).json({ ok: true, kategori: data.ad });
    }

    // Yeni ödeme yöntemi: aynı isimde bir cari firma da otomatik açılır.
    if (resource === 'yontemEkle') {
      const ad = String(body.ad || '').trim();
      if (!ad) throw new HataMesaji(400, 'Ad gerekli');
      if (!YONTEM_TURLERI.includes(body.odemeTuru)) throw new HataMesaji(400, 'Tür geçersiz');
      const { data, error } = await db
        .from('m2_odeme_yontemleri')
        .insert({ odeme_turu: body.odemeTuru, ad })
        .select('id,odeme_turu,ad')
        .single();
      if (error?.code === '23505') throw new HataMesaji(409, 'Bu yöntem zaten var');
      kontrol(error);
      await yontemFirmasi(db, ad);
      return res.status(200).json({ ok: true, yontem: data });
    }

    // ---------- Yemek kartı: fatura kes / düzenle ----------
    // Kesim kaydı + (varsa) kesinti faturası + tediye makbuzu TEK işlemde yazılır.
    //   Ödeme (Tediye) Makbuzu = fatura toplamı  -> kart carisi bize borçlu olur
    //   Fatura/Fiş            = kesinti toplamı (KDV'si ayrı) -> gider, cariden düşer
    if (resource === 'yemekKartiKaydet') {
      const donem = String(body.donem || '');
      const kesim = Number(body.kesim);
      if (!/^\d{4}-\d{2}$/.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      if (![10, 20, 30].includes(kesim)) throw new HataMesaji(400, 'Kesim geçersiz');
      const matrah = tutarCoz(body.matrah);
      if (matrah <= 0) throw new HataMesaji(400, 'Matrah sıfırdan büyük olmalı');
      const faturaTarihi = tarihKontrol(body.faturaTarihi);
      const vade = body.vade ? tarihKontrol(body.vade) : null;
      const kart = await ykKartGetir(db, body.kartId);
      const { data: kesimlerKart, error: kkHata } = await db.from('m2_yk_kesimler').select('*').eq('kart_id', kart.id);
      kontrol(kkHata);
      // Günsonu aralığı gönderilmezse öneri kullanılır: başlangıç = önceki kesim + 1 gün, bitiş = fatura tarihi.
      const oneri = aralikOneri({ kart: kartCamel(kart), kesimlerKart: kesimlerKart || [], donem, kesim, faturaTarihi });
      const gunsonuBas = body.gunsonuBas ? String(body.gunsonuBas) : oneri.bas;
      const gunsonuBit = body.gunsonuBit ? String(body.gunsonuBit) : oneri.bit;
      aralikDogrula(gunsonuBas, gunsonuBit);

      const { data: mevcut, error: mevcutHata } = await db
        .from('m2_yk_kesimler')
        .select('id')
        .eq('kart_id', kart.id)
        .eq('donem', donem)
        .eq('kesim', kesim)
        .maybeSingle();
      kontrol(mevcutHata);
      if (mevcut) {
        const { data: od, error: odHata } = await db.from('m2_yk_odemeler').select('id').eq('kesim_id', mevcut.id);
        kontrol(odHata);
        if ((od || []).length) ykKontrol({ message: 'PARA_GELDI_VAR' });
      }

      const cari = await ykCarisi(db, kart, kesim);
      const kategori = await kategoriBulVeyaAc(db, YK_KATEGORI);
      const h = yemekKartiHesapla(matrah, kartCamel(kart));
      const grupId = randomUUID();
      const kesimId = mevcut ? mevcut.id : randomUUID();
      const donemYazi = `${donem} / ${kesim} kesimi`;

      const kesimKaydi = {
        id: kesimId,
        kart_id: kart.id,
        donem,
        kesim,
        firma_id: cari.id,
        fatura_tarihi: faturaTarihi,
        vade,
        matrah: h.matrah,
        fatura_kdv: h.kdv,
        fatura_toplami: h.faturaToplami,
        kesinti_oran: sayiN(kart.komisyon_orani),
        kesinti_matrah: h.kesintiMatrah,
        kesinti_kdv: h.kesintiKdv,
        kesinti_toplami: h.kesintiToplami,
        bankaya_yatacak: h.bankayaYatacak,
        grup_id: grupId,
        gunsonu_bas: gunsonuBas,
        gunsonu_bit: gunsonuBit,
      };
      const fatura =
        h.kesintiToplami > 0
          ? {
              id: randomUUID(),
              tarih: faturaTarihi,
              firma_id: cari.id,
              firma_adi: cari.ad,
              fatura_no: null,
              aciklama: `Otomatik: yemek kartı komisyonu (${donemYazi})`,
              gider_kategorisi: kategori,
              odeme_turu: 'Cari',
              odeme_hesabi: null,
              kasa: null,
              fatura_tutari: h.kesintiToplami,
              kdv: h.kesintiKdv,
              grup_id: grupId,
            }
          : null;
      const tediye = {
        id: randomUUID(),
        tarih: faturaTarihi,
        makbuz_turu: 'Ödeme',
        firma_id: cari.id,
        firma_adi: cari.ad,
        fatura_no: null,
        aciklama: `Otomatik: yemek kartı faturası (${donemYazi})`,
        odeme_turu: null,
        odeme_hesabi: null,
        kasa: null,
        tutar: h.faturaToplami,
        otomatik: true,
        grup_id: grupId,
      };
      const { error } = await db.rpc('m2_yk_kesim_yaz', {
        p_kesim: kesimKaydi,
        p_fatura: fatura,
        p_tediye: tediye,
        p_eski_kesim_id: mevcut ? mevcut.id : null,
      });
      ykKontrol(error);
      return res.status(200).json({
        ok: true,
        hesap: h,
        duzenlendi: !!mevcut,
        cari: cari.ad,
        gunsonu: { bas: gunsonuBas, bit: gunsonuBit, uyari: aralikUyarisi(oneri.onceki, gunsonuBas) },
      });
    }

    if (resource === 'yemekKartiSil') {
      if (!body.kesimId) throw new HataMesaji(400, 'kesimId gerekli');
      const { error } = await db.rpc('m2_yk_kesim_sil', { p_kesim_id: body.kesimId });
      ykKontrol(error);
      return res.status(200).json({ ok: true });
    }

    // Para geldi: tahsilat makbuzu (kart carisine) + banka carisine karşı makbuz, tek işlemde.
    if (resource === 'yemekKartiParaGeldi') {
      const tutar = tutarCoz(body.gelenTutar);
      if (tutar <= 0) throw new HataMesaji(400, 'Gelen tutar sıfırdan büyük olmalı');
      const tarih = body.gelisTarihi ? tarihKontrol(body.gelisTarihi) : bugunIstanbul();
      if (!body.kesimId) throw new HataMesaji(400, 'kesimId gerekli');
      const { data: ks, error: ksHata } = await db.from('m2_yk_kesimler').select('*').eq('id', body.kesimId).maybeSingle();
      kontrol(ksHata);
      if (!ks) throw new HataMesaji(404, 'Kesim bulunamadı');
      const alan = await yontemAlanlari(db, 'Banka Havalesi', body.hesapAdi, null);
      const banka = await yontemFirmasi(db, alan.odeme_hesabi);
      const cari = await firmaGetir(db, ks.firma_id);
      if (banka.id === cari.id) throw new HataMesaji(400, 'Firma ile ödeme şekli aynı olamaz');
      const grupId = randomUUID();
      const { error } = await db.rpc('m2_yk_odeme_yaz', {
        p_odeme: { id: randomUUID(), kesim_id: ks.id, tutar, gelis_tarihi: tarih, hesap_adi: banka.ad, grup_id: grupId },
        p_makbuzlar: [
          {
            id: randomUUID(),
            tarih,
            makbuz_turu: 'Tahsilat',
            firma_id: cari.id,
            firma_adi: cari.ad,
            fatura_no: null,
            aciklama: `Yemek kartı ödemesi (${ks.donem} / ${ks.kesim} kesimi)`,
            odeme_turu: 'Banka Havalesi',
            odeme_hesabi: banka.ad,
            kasa: null,
            tutar,
            otomatik: false,
            grup_id: grupId,
          },
          {
            id: randomUUID(),
            tarih,
            makbuz_turu: 'Ödeme',
            firma_id: banka.id,
            firma_adi: banka.ad,
            fatura_no: null,
            aciklama: `Otomatik: ${cari.ad} tahsilatı`,
            odeme_turu: null,
            odeme_hesabi: null,
            kasa: null,
            tutar,
            otomatik: true,
            grup_id: grupId,
          },
        ],
      });
      ykKontrol(error);
      return res.status(200).json({ ok: true });
    }

    if (resource === 'yemekKartiParaGeriAl') {
      if (!body.odemeId) throw new HataMesaji(400, 'odemeId gerekli');
      const { error } = await db.rpc('m2_yk_odeme_sil', { p_odeme_id: body.odemeId });
      ykKontrol(error);
      return res.status(200).json({ ok: true });
    }

    // Kart tanımı: komisyon oranı ve hangi kesimlerde fatura kesildiği.
    if (resource === 'yemekKartiTanim') {
      const kart = await ykKartGetir(db, body.id);
      const oran = Number(String(body.komisyonOrani ?? '').replace(',', '.'));
      if (!Number.isFinite(oran) || oran < 0 || oran >= 1) {
        throw new HataMesaji(400, 'Komisyon oranı 0 ile 1 arasında olmalı (örn. %6 için 0,06)');
      }
      const { error } = await db
        .from('m2_yk_kartlar')
        .update({ komisyon_orani: oran, kesim10: !!body.kesim10, kesim20: !!body.kesim20, kesim30: !!body.kesim30 })
        .eq('id', kart.id);
      kontrol(error);
      return res.status(200).json({ ok: true });
    }

    // ---------- Kayıt düzenle / sil / geri al (Datalar, Düzenleme Modu) ----------
    // Her işlem {oncesi, sonrasi} anlık görüntüsü döner; arayüz bunlarla 3 adım geri/ileri alır.
    if (resource === 'kayitDuzenle') {
      const grupId = body.grupId;
      const eski = await grupOku(db, grupId);
      if (grupBosMu(eski)) throw new HataMesaji(404, 'Kayıt bulunamadı');
      kilitKontrol(eski);
      const zaman = [...eski.faturalar, ...eski.makbuzlar].map((r) => r.kayit_zamani).filter(Boolean).sort()[0];
      let yeni;
      if (eski.faturalar.length) {
        // Fatura <-> iade türü düzenlemede değişmez (yanlışlıkla işaret değişmesin); gerekirse silip yeniden girilir.
        const u = await faturaGrubuUret(db, { ...body, iade: !!eski.faturalar[0].iade }, grupId, zaman);
        yeni = { faturalar: [u.fatura], makbuzlar: u.makbuzlar };
      } else {
        const u = await makbuzGrubuUret(db, body, grupId, zaman);
        yeni = { faturalar: [], makbuzlar: u.makbuzlar };
      }
      const kg = eski.faturalar[0]?.kasa_grubu ?? eski.makbuzlar[0]?.kasa_grubu ?? null;
      if (kg) [...yeni.faturalar, ...yeni.makbuzlar].forEach((r) => (r.kasa_grubu = kg));
      await grupDegistir(db, grupId, yeni);
      return res.status(200).json({ ok: true, grupId, oncesi: eski, sonrasi: await grupOku(db, grupId) });
    }

    // Tek alan düzeltme: tarih ve fatura no TÜM gruba, açıklama yalnızca o satıra, kategori fatura satırına uygulanır.
    if (resource === 'kayitAlan') {
      const grupId = body.grupId;
      const eski = await grupOku(db, grupId);
      if (grupBosMu(eski)) throw new HataMesaji(404, 'Kayıt bulunamadı');
      kilitKontrol(eski);
      const yeni = JSON.parse(JSON.stringify(eski));
      const tumu = [...yeni.faturalar, ...yeni.makbuzlar];
      const satir = tumu.find((r) => r.id === body.satirId);
      if (body.alan === 'tarih') {
        const t = tarihKontrol(body.deger);
        tumu.forEach((r) => (r.tarih = t));
      } else if (body.alan === 'faturaNo') {
        const no = metin(body.deger);
        tumu.forEach((r) => (r.fatura_no = no));
      } else if (body.alan === 'aciklama') {
        if (!satir) throw new HataMesaji(404, 'Satır bulunamadı');
        if (satir.otomatik) throw new HataMesaji(400, 'Otomatik satırın açıklaması değiştirilemez');
        satir.aciklama = metin(body.deger);
      } else if (body.alan === 'giderKategorisi') {
        if (!satir || !yeni.faturalar.includes(satir)) throw new HataMesaji(400, 'Kategori yalnızca fatura/fiş satırında değişir');
        const kat = String(body.deger || '').trim();
        const { data, error } = await db.from('m2_kategoriler').select('id').eq('ad', kat).maybeSingle();
        kontrol(error);
        if (!data) throw new HataMesaji(400, 'Kategori bulunamadı');
        satir.gider_kategorisi = kat;
      } else {
        throw new HataMesaji(400, 'Bu alan buradan değiştirilemez');
      }
      await grupDegistir(db, grupId, yeni);
      return res.status(200).json({ ok: true, grupId, oncesi: eski, sonrasi: await grupOku(db, grupId) });
    }

    if (resource === 'kayitSil') {
      const grupId = body.grupId;
      const eski = await grupOku(db, grupId);
      if (grupBosMu(eski)) throw new HataMesaji(404, 'Kayıt bulunamadı');
      kilitKontrol(eski);
      await grupDegistir(db, grupId, { faturalar: [], makbuzlar: [] });
      return res.status(200).json({ ok: true, grupId, oncesi: eski, sonrasi: { faturalar: [], makbuzlar: [] } });
    }

    // Geri al / ileri al: grup, işlemden SONRAKİ haliyle birebir aynıysa istenen hale yazılır.
    // Başka biri bu arada değiştirmişse reddedilir (üzerine yazılmaz).
    if (resource === 'kayitGeriYaz') {
      const { grupId, beklenen, yazilacak } = body;
      if (!beklenen || !yazilacak) throw new HataMesaji(400, 'beklenen ve yazilacak gerekli');
      const simdi = await grupOku(db, grupId);
      if (!grupEsitMi(simdi, beklenen)) throw new HataMesaji(409, 'Bu kayıt bu arada değiştirilmiş; geri alınamadı.');
      await grupDegistir(db, grupId, yazilacak);
      return res.status(200).json({ ok: true, grupId, sonrasi: await grupOku(db, grupId) });
    }

    // ---------- Personel ----------
    if (resource === 'personelKaydet') {
      const adSoyad = String(body.adSoyad || '').trim();
      if (!adSoyad) throw new HataMesaji(400, 'Ad soyad gerekli');
      const iseGiris = tarihKontrol(body.iseGiris);
      const cikis = body.cikisTarihi ? tarihKontrol(body.cikisTarihi) : null;
      if (cikis && cikis < iseGiris) throw new HataMesaji(400, 'Çıkış tarihi işe girişten önce olamaz');
      const sgkYok = !!body.sgkYok;
      const payload = {
        ad_soyad: adSoyad,
        gorev: body.gorev || '',
        ise_giris: iseGiris,
        sgk_baslama: sgkYok || !body.sgkBaslama ? null : tarihKontrol(body.sgkBaslama),
        sgk_yok: sgkYok,
        cikis_tarihi: cikis,
        cikis_sebebi: cikis ? body.cikisSebebi || '' : '',
        telefon: body.telefon || '',
        adres: body.adres || '',
      };
      if (!body.id) {
        const maas = tutarCoz(body.maas);
        if (!(maas > 0)) throw new HataMesaji(400, 'Maaş girin');
        const { data, error } = await db.rpc('m2_personel_ekle', { p: { ...payload, maas } });
        ozelKontrol(error);
        return res.status(200).json({ ok: true, id: data });
      }
      const per = await personelGetir(db, body.id);
      const p = { ...payload, id: per.id };
      if (String(body.maas ?? '').trim() !== '') {
        const maas = tutarCoz(body.maas);
        if (maas < 0) throw new HataMesaji(400, 'Maaş geçersiz');
        const maasDonem = DONEM_RE.test(String(body.maasDonem || '')) ? body.maasDonem : bugunIstanbul().slice(0, 7);
        const gecmis = await maasGecmisiGetir(db, per.id);
        if (maasBul(gecmis, maasDonem) !== maas) Object.assign(p, { yeni_maas: maas, maas_donem: maasDonem });
      }
      const { error } = await db.rpc('m2_personel_guncelle', { p });
      ozelKontrol(error);
      return res.status(200).json({ ok: true, id: per.id });
    }

    if (resource === 'notEkle') {
      const per = await personelGetir(db, body.personelId);
      const metinS = String(body.metin || '').trim();
      if (!metinS) throw new HataMesaji(400, 'Not boş olamaz');
      const { error } = await db.from('m2_personel_notlar').insert({ personel_id: per.id, metin: metinS });
      kontrol(error);
      return res.status(200).json({ ok: true });
    }
    if (resource === 'notSil') {
      if (!body.id) throw new HataMesaji(400, 'id gerekli');
      const { error } = await db.from('m2_personel_notlar').delete().eq('id', body.id);
      kontrol(error);
      return res.status(200).json({ ok: true });
    }

    // İzin: tek gün veya aralık (her gün ayrı kayıt). Kesinti toplamı elle değiştirilebilir; günlere paylaştırılır.
    if (resource === 'izinKaydet') {
      const per = await personelGetir(db, body.personelId);
      if (body.tur && !['Tam', 'Yarım'].includes(body.tur)) throw new HataMesaji(400, 'İzin türü geçersiz');
      const tur = body.tur === 'Yarım' ? 'Yarım' : 'Tam';
      const id = body.id || null;
      const bas = tarihKontrol(body.bas || body.tarih);
      const bit = id ? bas : tarihKontrol(body.bit || bas);
      if (gunFarki(bas, bit) < 0) throw new HataMesaji(400, 'Bitiş tarihi başlangıçtan önce olamaz');
      if (gunFarki(bas, bit) + 1 > 31) throw new HataMesaji(400, 'İzin aralığı en fazla 31 gün olabilir');
      if (tur === 'Yarım' && bas !== bit) throw new HataMesaji(400, 'Yarım gün izin tek bir güne yazılır');
      const gunler = gunListesi(bas, bit);
      gunler.forEach((g) => {
        if (g < per.ise_giris || (per.cikis_tarihi && g > per.cikis_tarihi)) {
          throw new HataMesaji(400, `${isoToTR(g)} tarihinde personel çalışmıyor (işe giriş / çıkış tarihi dışında)`);
        }
      });
      const { data: mevcut, error: mevcutHata } = await db.from('m2_personel_izin').select('*').eq('personel_id', per.id);
      kontrol(mevcutHata);
      const eskiKayit = id ? (mevcut || []).find((x) => x.id === id) : null;
      if (id && !eskiKayit) throw new HataMesaji(404, 'İzin kaydı bulunamadı');
      const donemler = gunler.map((g) => g.slice(0, 7));
      if (eskiKayit) donemler.push(String(eskiKayit.tarih).slice(0, 7));
      await donemKilidiKontrol(db, donemler, 'izin kaydı eklenemez veya değiştirilemez');
      const cakisan = gunler.find((g) => (mevcut || []).some((x) => x.tarih === g && x.id !== id));
      if (cakisan) throw new HataMesaji(409, `${isoToTR(cakisan)} tarihine zaten izin kaydı var`);
      const gecmis = await maasGecmisiGetir(db, per.id);
      const otomatikK = izinKesintisiK(gecmis, gunler, tur);
      const girilen = body.kesinti !== undefined && body.kesinti !== null && String(body.kesinti).trim() !== '';
      const toplamK = girilen ? Math.round(tutarCoz(body.kesinti) * 100) : otomatikK;
      if (toplamK < 0) throw new HataMesaji(400, 'Kesinti eksi olamaz');
      const paylar = kurusDagit(toplamK, gunler.length);
      const sebep = metin(body.sebep);
      // Her izin GİRİŞİ personel carisine TEK bir İADE FATURASI olarak yazılır (kesinti 0 ise yazılmaz); tahakkuk maaşı etkilemez.
      const katAd = await kategoriBulVeyaAc(db, PERSONEL_KATEGORI);
      let izinSatirlari;
      if (id) {
        izinSatirlari = [{ id, personel_id: per.id, tarih: bas, tur, kesinti: paylar[0] / 100, sebep, grup_id: eskiKayit.grup_id || id }];
      } else {
        // Ay sınırını aşan aralıkta her ay ayrı grup (ayrı iade faturası): tahakkuk kilidi aya göre çalışır.
        const ayGrup = {};
        izinSatirlari = gunler.map((g, i) => {
          const ay = g.slice(0, 7);
          ayGrup[ay] = ayGrup[ay] || randomUUID();
          return { id: randomUUID(), personel_id: per.id, tarih: g, tur, kesinti: paylar[i] / 100, sebep, grup_id: ayGrup[ay] };
        });
      }
      const degisen = new Set(izinSatirlari.map((z) => z.id));
      const sonuc = [...(mevcut || []).filter((x) => !degisen.has(x.id)), ...izinSatirlari];
      const gruplar = [...new Set(izinSatirlari.map((z) => z.grup_id))];
      const iadeler = gruplar.map((g) => izinGrubuIade(per, sonuc.filter((z) => (z.grup_id || z.id) === g), katAd, g)).filter(Boolean);
      const { error: izinHata } = await db.rpc('m2_izin_degistir', { p_izinler: izinSatirlari, p_faturalar: iadeler, p_silinen: [], p_gruplar: gruplar });
      ozelKontrol(izinHata);
      return res.status(200).json({ ok: true, gun: gunler.length, kesinti: toplamK / 100 });
    }
    if (resource === 'izinSil') {
      if (!body.id) throw new HataMesaji(400, 'id gerekli');
      const { data, error } = await db.from('m2_personel_izin').select('*').eq('id', body.id).maybeSingle();
      kontrol(error);
      if (!data) throw new HataMesaji(404, 'İzin kaydı bulunamadı');
      await donemKilidiKontrol(db, [String(data.tarih).slice(0, 7)], 'izin kaydı silinemez');
      // Silinen gün iade faturasından düşer; grupta gün kalmadıysa iade faturası da silinir.
      const per = await personelGetir(db, data.personel_id);
      const gk = data.grup_id || data.id;
      const { data: hepsi, error: hepsiHata } = await db.from('m2_personel_izin').select('*').eq('personel_id', data.personel_id);
      kontrol(hepsiHata);
      const katAd = await kategoriBulVeyaAc(db, PERSONEL_KATEGORI);
      const iade = izinGrubuIade(per, (hepsi || []).filter((z) => (z.grup_id || z.id) === gk && z.id !== data.id), katAd, gk);
      const sil = await db.rpc('m2_izin_degistir', { p_izinler: [], p_faturalar: iade ? [iade] : [], p_silinen: [body.id], p_gruplar: [gk] });
      ozelKontrol(sil.error);
      return res.status(200).json({ ok: true });
    }

    // Avans: personel carisine otomatik ÖDEME makbuzu + ödeme şekline karşı makbuz (mini makbuz girişi)
    if (resource === 'avansKaydet') {
      const per = await personelGetir(db, body.personelId);
      const tarih = tarihKontrol(body.tarih);
      const tutar = tutarCoz(body.tutar);
      if (tutar <= 0) throw new HataMesaji(400, 'Avans tutarı sıfırdan büyük olmalı');
      if (!MAKBUZ_ODEME_TURLERI.includes(body.odemeTuru)) throw new HataMesaji(400, 'Ödeme türünü seçin');
      const alan = await yontemAlanlari(db, body.odemeTuru, body.odemeHesabi, body.kasa);
      const yf = await yontemFirmasi(db, alan.kasa || alan.odeme_hesabi);
      if (yf.id === per.firma_id) throw new HataMesaji(400, 'Personel ile ödeme şekli aynı olamaz');
      const firma = await firmaGetir(db, per.firma_id);
      if (body.id) {
        const { data: v, error: vh } = await db.from('m2_personel_avans').select('id').eq('id', body.id).maybeSingle();
        kontrol(vh);
        if (!v) throw new HataMesaji(404, 'Avans kaydı bulunamadı');
      }
      const grupId = randomUUID();
      const aciklama = metin(body.aciklama);
      // Düzenlemede kasa grubu gönderilmediyse mevcut işaret (günlük/ana) korunur.
      let miras = null;
      if (body.id) {
        const { data: vv } = await db.from('m2_personel_avans').select('grup_id').eq('id', body.id).maybeSingle();
        if (vv) {
          const { data: mm } = await db.from('m2_makbuzlar').select('kasa_grubu').eq('grup_id', vv.grup_id);
          miras = ((mm || []).find((x) => x.kasa_grubu) || {}).kasa_grubu || null;
        }
      }
      const kgUygula = (rows) => {
        if (body.kasaGrubu === undefined && miras) rows.forEach((r) => (r.kasa_grubu = miras));
        else kasaGrubuUygula(body, rows, tarih);
        return rows;
      };
      const { error } = await db.rpc('m2_avans_yaz', {
        p_avans: { id: body.id || randomUUID(), personel_id: per.id, tarih, tutar, odeme_turu: body.odemeTuru, odeme_hesabi: alan.odeme_hesabi, kasa: alan.kasa, aciklama, grup_id: grupId },
        p_makbuzlar: kgUygula([
          { id: randomUUID(), tarih, makbuz_turu: 'Ödeme', firma_id: firma.id, firma_adi: firma.ad, fatura_no: null, aciklama: `Avans${aciklama ? ` — ${aciklama}` : ''}`, odeme_turu: body.odemeTuru, odeme_hesabi: alan.odeme_hesabi, kasa: alan.kasa, tutar, otomatik: false, grup_id: grupId },
          { id: randomUUID(), tarih, makbuz_turu: 'Tahsilat', firma_id: yf.id, firma_adi: yf.ad, fatura_no: null, aciklama: `Otomatik: ${firma.ad} avansı`, odeme_turu: null, odeme_hesabi: null, kasa: null, tutar, otomatik: true, grup_id: grupId },
        ]),
        p_eski: body.id || null,
      });
      ozelKontrol(error);
      return res.status(200).json({ ok: true });
    }
    if (resource === 'avansSil') {
      if (!body.id) throw new HataMesaji(400, 'id gerekli');
      const { error } = await db.rpc('m2_avans_sil', { p_id: body.id });
      ozelKontrol(error);
      return res.status(200).json({ ok: true });
    }

    // ---------- Sabit giderler ----------
    if (resource === 'sabitGiderKaydet') {
      const ad = String(body.ad || '').trim();
      if (!ad) throw new HataMesaji(400, 'Gider ismi gerekli');
      const tutar = tutarCoz(body.tutar);
      if (tutar <= 0) throw new HataMesaji(400, 'Gider tutarı sıfırdan büyük olmalı');
      if (!DONEM_RE.test(String(body.baslangicDonem || ''))) throw new HataMesaji(400, 'Başlangıç dönemi geçersiz');
      const kategori = String(body.kategori || '').trim();
      if (!kategori) throw new HataMesaji(400, 'Gider kategorisini seçin');
      const { data: kat, error: katHata } = await db.from('m2_kategoriler').select('id').eq('ad', kategori).maybeSingle();
      kontrol(katHata);
      if (!kat) throw new HataMesaji(400, 'Kategori bulunamadı');
      const kdv = kdvCoz(body.kdv, tutar);
      const p = { ad, tutar, baslangic_donem: body.baslangicDonem, kategori, kdv };
      if (!body.id) {
        const { data, error } = await db.rpc('m2_sabit_gider_ekle', { p });
        ozelKontrol(error);
        return res.status(200).json({ ok: true, id: data });
      }
      const { error } = await db.rpc('m2_sabit_gider_guncelle', { p: { ...p, id: body.id } });
      ozelKontrol(error);
      return res.status(200).json({ ok: true, id: body.id });
    }
    // "Sil" = pasife al: belirtilen dönemden itibaren tahakkuk edilmez, eski fişler kalır. Boş dönem = yeniden etkinleştir.
    if (resource === 'sabitGiderPasif') {
      if (!body.id) throw new HataMesaji(400, 'id gerekli');
      const d = String(body.pasifDonem || '').trim();
      if (d && !DONEM_RE.test(d)) throw new HataMesaji(400, 'Dönem geçersiz');
      const { data, error } = await db.from('m2_sabit_giderler').select('id').eq('id', body.id).maybeSingle();
      kontrol(error);
      if (!data) throw new HataMesaji(404, 'Sabit gider bulunamadı');
      const g = await db.from('m2_sabit_giderler').update({ pasif_donem: d || null }).eq('id', body.id);
      kontrol(g.error);
      return res.status(200).json({ ok: true });
    }

    // ---------- Tahakkuk et / geri al ----------
    // Dönem başına YALNIZCA 1 kez. Fiş tarihi = tahakkuk edilen gün. Personel: net (brüt - kesinti), avans tahakkuka girmez.
    if (resource === 'tahakkukEt') {
      const donem = String(body.donem || '');
      if (!DONEM_RE.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      const bugun = bugunIstanbul();
      if (donem >= bugun.slice(0, 7)) throw new HataMesaji(400, 'İçinde bulunulan veya gelecek ay tahakkuk edilemez');
      const v = await tahakkukVeri(db, donem);
      if (v.tahakkuk) throw new HataMesaji(409, `${donemYazi(donem)} dönemi ${isoToTR(v.tahakkuk.tarih)} tarihinde zaten tahakkuk edilmiş`);
      if (!v.personeller.length && !v.sabitGiderler.length) throw new HataMesaji(400, 'Bu dönem için tahakkuk edilecek kayıt yok');
      const tid = randomUUID();
      const yaziAy = donemYazi(donem);
      const personelKat = await kategoriBulVeyaAc(db, PERSONEL_KATEGORI);
      const kalemler = [];
      const faturalar = [];
      v.personeller.forEach((p) => {
        kalemler.push({ tur: 'Personel', kaynak_id: p.id, firma_id: p.firmaId, ad: p.adSoyad, maas: p.maas, calisilan_gun: p.calisilanGun, ucretli_gun: p.ucretliGun, izin_gun: p.izinGun, brut: p.brut, kesinti: p.kesinti, net: p.net });
        if (p.fisYazilir) {
          faturalar.push({ id: randomUUID(), tarih: bugun, firma_id: p.firmaId, firma_adi: p.adSoyad, gider_kategorisi: personelKat, fatura_tutari: p.brut, kdv: null, aciklama: `Maaş tahakkuku — ${yaziAy}` });
        }
      });
      v.sabitGiderler.forEach((g) => {
        kalemler.push({ tur: 'Sabit Gider', kaynak_id: g.id, firma_id: g.firmaId, ad: g.ad, brut: g.tutar, kesinti: 0, net: g.tutar });
        faturalar.push({ id: randomUUID(), tarih: bugun, firma_id: g.firmaId, firma_adi: g.ad, gider_kategorisi: g.kategori, fatura_tutari: g.tutar, kdv: g.kdv, aciklama: `Sabit gider tahakkuku — ${yaziAy}` });
      });
      const toplam = r2(faturalar.reduce((x, f) => x + f.fatura_tutari, 0));
      const { error } = await db.rpc('m2_tahakkuk_yaz', { p_tahakkuk: { id: tid, donem, tarih: bugun, toplam }, p_kalemler: kalemler, p_faturalar: faturalar });
      if (error && error.code === '23505') throw new HataMesaji(409, `${yaziAy} dönemi zaten tahakkuk edilmiş`);
      ozelKontrol(error);
      return res.status(200).json({ ok: true, tarih: bugun, toplam, fisSayisi: faturalar.length, personel: v.personeller.length, sabitGider: v.sabitGiderler.length });
    }
    if (resource === 'tahakkukGeriAl') {
      const donem = String(body.donem || '');
      if (!DONEM_RE.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      const { data, error } = await db.from('m2_tahakkuklar').select('id').eq('donem', donem).maybeSingle();
      kontrol(error);
      if (!data) throw new HataMesaji(404, 'Bu dönem için tahakkuk yok');
      const sil = await db.rpc('m2_tahakkuk_sil', { p_id: data.id });
      ozelKontrol(sil.error);
      return res.status(200).json({ ok: true });
    }

    // ---------- Hızlı gider: kaydet / sil / geri yaz ----------
    // cari ve serbest: Nakit fatura (fiş + otomatik ödeme makbuzu + TL Kasa karşı makbuzu), serbest harcama "Diğer Giderler" carisine yazılır.
    // sabit: yalnız ödeme makbuzu (sabit giderin kendisi tahakkukta fiş olur). Personel avansı avansKaydet ile yazılır.
    if (resource === 'hizliGiderKaydet') {
      if (!['cari', 'serbest', 'sabit', 'ortak', 'personel'].includes(body.tur)) throw new HataMesaji(400, 'Harcama türü geçersiz');
      // Tutar işaretlidir: artı = kasadan çıkan harcama, eksi = kasaya giren para (iade / ortak girişi).
      const imzali = tutarCoz(body.tutar);
      if (imzali === 0) throw new HataMesaji(400, 'Tutar sıfır olamaz');
      const eksi = imzali < 0;
      const tutar = Math.abs(imzali);
      if (body.tur === 'personel' && !eksi) throw new HataMesaji(400, 'Personel avansı Personel Klasörü akışıyla yazılır');
      const kasaGrubu = body.kasaGrubu === 'gunluk' ? 'gunluk' : 'ana';
      const tarih = isGunuIstanbul();
      const not = metin(body.aciklama);
      let grupId = body.id;
      let eski = null;
      let zaman;
      if (grupId) {
        eski = await grupOku(db, grupId);
        if (grupBosMu(eski)) throw new HataMesaji(404, 'Kayıt bulunamadı');
        const satirlar0 = [...eski.faturalar, ...eski.makbuzlar];
        if (satirlar0.some((r) => r.kaynak !== 'hizli_gider')) throw new HataMesaji(409, 'Bu kayıt başka bir yerden yönetiliyor, buradan değiştirilemez.');
        if (satirlar0.some((r) => r.tarih !== tarih)) throw new HataMesaji(409, 'Yalnızca bugünün harcamaları düzenlenir.');
        zaman = satirlar0.map((r) => r.kayit_zamani).filter(Boolean).sort()[0];
      } else {
        grupId = randomUUID();
      }
      let fatura = null;
      let makbuzlar;
      if (body.tur === 'sabit' || body.tur === 'personel' || body.tur === 'ortak') {
        const { data: f, error: fh } = await db.from('m2_firmalar').select('id,ad,firma_turu').eq('id', body.firmaId).maybeSingle();
        kontrol(fh);
        if (body.tur === 'sabit' && (!f || f.firma_turu !== 'Sabit Gider')) throw new HataMesaji(400, 'Sabit gider seçin');
        if (body.tur === 'personel' && (!f || f.firma_turu !== 'Personel')) throw new HataMesaji(400, 'Personel seçin');
        if (body.tur === 'ortak') {
          const { data: oy, error: oh } = await db.from('m2_odeme_yontemleri').select('id').eq('odeme_turu', 'Ortaklar').eq('ad', f ? f.ad : '').maybeSingle();
          kontrol(oh);
          if (!f || f.firma_turu !== 'Ödeme Şekli' || !oy) throw new HataMesaji(400, 'Ortak seçin');
        }
        // Fiş açılmaz, yalnız makbuz: artı = firmaya ödeme (TL Kasa'dan çıkar), eksi = firmadan tahsilat (TL Kasa'ya girer).
        // Ortakta ters bakılır gibi görünse de aynı kural: eksi = ortak kasaya para koydu → ortak alacaklı (tahsilat), TL Kasa borçlu.
        makbuzlar = (await makbuzGrubuUret(db, { makbuzTuru: eksi ? 'Tahsilat' : 'Ödeme', tarih, firmaId: body.firmaId, aciklama: not, tutar, odemeTuru: 'Nakit', kasa: 'TL Kasa' }, grupId, zaman)).makbuzlar;
      } else {
        let firmaId = body.firmaId;
        let kategori;
        let aciklama;
        if (body.tur === 'serbest') {
          const ad = metin(body.ad);
          if (!ad) throw new HataMesaji(400, 'Ne için harcandığını yazın');
          firmaId = (await digerGiderlerFirmasi(db)).id;
          kategori = metin(body.kategori) || DIGER_KATEGORI;
          aciklama = not ? `${ad} — ${not}` : ad;
        } else {
          const { data: f, error: fh } = await db.from('m2_firmalar').select('id,firma_turu,varsayilan_kategori').eq('id', firmaId).maybeSingle();
          kontrol(fh);
          if (!f || f.firma_turu !== 'Firma') throw new HataMesaji(400, 'Bu cari için hızlı gider girilemez');
          kategori = f.varsayilan_kategori || metin(body.kategori) || DIGER_KATEGORI;
          aciklama = not;
        }
        await kategoriBulVeyaAc(db, kategori);
        // Eksi tutar = iade faturası + firmadan tahsilat + TL Kasa'ya giriş (faturaGrubuUret iade yolu).
        const u = await faturaGrubuUret(db, { tarih, firmaId, faturaNo: '', aciklama, giderKategorisi: kategori, faturaTutari: tutar, kdv: '', odemeTuru: 'Nakit', kasa: 'TL Kasa', iade: eksi }, grupId, zaman);
        fatura = u.fatura;
        makbuzlar = u.makbuzlar;
      }
      [fatura, ...makbuzlar].filter(Boolean).forEach((r) => (r.kasa_grubu = kasaGrubu));
      const { error } = await db.rpc('m2_hizli_yaz', { p_grup: grupId, p_faturalar: fatura ? [fatura] : [], p_makbuzlar: makbuzlar });
      ozelKontrol(error);
      kontrol(error);
      return res.status(200).json({ ok: true, id: grupId, oncesi: eski });
    }

    if (resource === 'hizliGiderSil') {
      const eski = await grupOku(db, body.id);
      if (grupBosMu(eski)) throw new HataMesaji(404, 'Kayıt bulunamadı');
      const { error } = await db.rpc('m2_hizli_sil', { p_grup: body.id });
      ozelKontrol(error);
      kontrol(error);
      return res.status(200).json({ ok: true, oncesi: eski });
    }

    if (resource === 'hizliGiderGeriYaz') {
      const faturalar = Array.isArray(body.faturalar) ? body.faturalar : [];
      const makbuzlar = Array.isArray(body.makbuzlar) ? body.makbuzlar : [];
      const g = (faturalar[0] || makbuzlar[0] || {}).grup_id;
      if (!g) throw new HataMesaji(400, 'Geri yazılacak kayıt yok');
      const { error } = await db.rpc('m2_hizli_yaz', { p_grup: g, p_faturalar: faturalar, p_makbuzlar: makbuzlar });
      ozelKontrol(error);
      kontrol(error);
      return res.status(200).json({ ok: true, id: g });
    }

    // ---------- Günsonları'ndan harcama düzeltme: kaydın (fiş/makbuz grubunun) tutar, açıklama ve tarihi yerinde değişir ----------
    // Yalnızca Fişler/Makbuz formundan ve Harcama panelinden girilen kayıtlar; tahakkuk, avans, yemek kartı vb. kendi sekmesinden yönetilir.
    // Tutar grubun TÜM satırlarında (fiş, ödeme makbuzu, TL Kasa makbuzu) birlikte değişir.
    if (resource === 'harcamaDegistir' || resource === 'harcamaSil') {
      const grupId = body.grupId;
      const eski = await grupOku(db, grupId);
      if (grupBosMu(eski)) throw new HataMesaji(404, 'Kayıt bulunamadı');
      const kaynak = grupKaynagi(eski);
      if (kaynak && kaynak !== 'hizli_gider') throw new HataMesaji(409, `Bu kayıt ${KAYNAK_YER[kaynak] || 'başka bir sekmeden'} yönetiliyor, buradan değiştirilemez.`);
      if (resource === 'harcamaSil') {
        await grupDegistir(db, grupId, { faturalar: [], makbuzlar: [] });
        return res.status(200).json({ ok: true, grupId, oncesi: eski, sonrasi: { faturalar: [], makbuzlar: [] } });
      }
      const yeni = JSON.parse(JSON.stringify(eski));
      const tumu = [...yeni.faturalar, ...yeni.makbuzlar];
      if (body.tutar !== undefined) {
        const t = tutarCoz(body.tutar);
        if (!(t > 0)) throw new HataMesaji(400, 'Tutar sıfırdan büyük olmalı');
        yeni.faturalar.forEach((f) => {
          const eskiTutar = Number(f.fatura_tutari) || 0;
          if (f.kdv !== null && f.kdv !== undefined && eskiTutar > 0) f.kdv = r2((Number(f.kdv) || 0) * (t / eskiTutar));
          f.fatura_tutari = t;
        });
        yeni.makbuzlar.forEach((m) => (m.tutar = t));
      }
      if (body.aciklama !== undefined) {
        const satir = yeni.faturalar[0] || yeni.makbuzlar.find((m) => !m.otomatik);
        if (satir) satir.aciklama = metin(body.aciklama);
      }
      if (body.tarih) {
        const tarih = tarihKontrol(body.tarih);
        tumu.forEach((r) => (r.tarih = tarih));
      }
      await grupDegistir(db, grupId, yeni);
      return res.status(200).json({ ok: true, grupId, oncesi: eski, sonrasi: await grupOku(db, grupId) });
    }

    // Günsonu Geliri'ni kayıtlı günsonu verisinden yeniden hesaplar (idempotent: aynı gün tek kayıt, tekrar kaydedince güncellenir).
    if (resource === 'gunsonuGeliriSenkron') {
      if (!gsTarihIso(body.tarih)) throw new HataMesaji(400, 'Tarih geçersiz');
      await gelirSenkron(db, body.tarih);
      return res.status(200).json({ ok: true });
    }

    // ---------- Günsonları: düzenle / sil / geri al ----------

    // Düzenleme toplamları (nakit, POS, yemek, ciro) otomatik hesaplar ve ana kasa devrini sonraki günlere yayar.
    // onizleme=true: hiçbir şey yazmadan sonucu ve etkilenecek günleri döner.
    if (resource === 'gunsonuDuzenle') {
      const liste = await gsHepsi(db);
      const idx = liste.findIndex((r) => r.tarih === body.tarih);
      if (idx < 0) throw new HataMesaji(404, 'Günsonu kaydı bulunamadı');
      const oz = await tlKasaOzeti(db);
      const eskiTurev = gsTurevle(oz, liste);
      // Düzenleme türetilmiş (defterden gelen) görünüm üzerinde yapılır; devir ve harcamalar buradan düzenlenmez.
      const { alanlar: gelen } = { alanlar: { ...(body.alanlar || {}) } };
      delete gelen.dundenDevir;
      delete gelen.anaKasaToplam;
      delete gelen.gunlukKasaToplam;
      const { row } = gsDuzenle(eskiTurev[idx], gelen);
      const iso = gsTarihIso(row.tarih);
      const yeniListe = [...liste];
      yeniListe[idx] = row;
      const gelirYeni = gsTopla(gsSayi(row.toplam_nakit), oz.gun(iso).gunluk);
      const yeniTurev = gsTurevle(oz, yeniListe, { [row.tarih]: gelirYeni });
      const kayit = gsKayit(yeniTurev[idx]);
      // Bu günün nakdi değiştiyse sonraki günlerin devri de değişir (defterden otomatik; yalnızca bilgi için listelenir).
      const etkilenen = [];
      for (let j = idx + 1; j < liste.length; j++) {
        const e = gsKayit(eskiTurev[j]).anaKasaTakibi;
        const y = gsKayit(yeniTurev[j]).anaKasaTakibi;
        if (gsEs(e.dundenDevir, y.dundenDevir) && gsEs(e.yarinaDevir, y.yarinaDevir)) continue;
        etkilenen.push({ tarih: liste[j].tarih, eskiDunden: gsSayi(e.dundenDevir), yeniDunden: gsSayi(y.dundenDevir), eskiYarina: gsSayi(e.yarinaDevir), yeniYarina: gsSayi(y.yarinaDevir) });
      }
      if (body.onizleme) return res.status(200).json({ onizleme: true, kayit, etkilenen });
      if (JSON.stringify(row) === JSON.stringify(eskiTurev[idx])) return res.status(200).json({ ok: true, degisiklikYok: true, kayit });
      const { error } = await db.rpc('m2_gunsonu_degistir', { p_tarihler: [row.tarih], p_satirlar: [row] });
      kontrol(error);
      await gelirSenkron(db, row.tarih);
      return res.status(200).json({ ok: true, oncesi: [liste[idx]], sonrasi: [row], etkilenen, kayit });
    }

    if (resource === 'gunsonuSil') {
      const liste = await gsHepsi(db);
      const idx = liste.findIndex((r) => r.tarih === body.tarih);
      if (idx < 0) throw new HataMesaji(404, 'Günsonu kaydı bulunamadı');
      const oz = await tlKasaOzeti(db);
      const eskiTurev = gsTurevle(oz, liste);
      const silinen = liste[idx];
      const gSil = oz.gun(gsTarihIso(silinen.tarih)).gelir;
      // Silinen günün TL Kasa geliri de kalkar; sonraki günlerin devri o kadar azalır (defterden otomatik).
      const etkilenen = [];
      if (Math.abs(gSil) >= 0.005) {
        for (let j = idx + 1; j < liste.length; j++) {
          const e = gsKayit(eskiTurev[j]).anaKasaTakibi;
          etkilenen.push({ tarih: liste[j].tarih, eskiDunden: gsSayi(e.dundenDevir), yeniDunden: gsTopla(e.dundenDevir, -gSil), eskiYarina: gsSayi(e.yarinaDevir), yeniYarina: gsTopla(e.yarinaDevir, -gSil) });
        }
      }
      if (body.onizleme) return res.status(200).json({ onizleme: true, etkilenen });
      const { error } = await db.rpc('m2_gunsonu_degistir', { p_tarihler: [silinen.tarih], p_satirlar: [] });
      kontrol(error);
      await gelirSenkron(db, silinen.tarih);
      return res.status(200).json({ ok: true, oncesi: [silinen], sonrasi: [], etkilenen });
    }

    // Geri al / ileri al: ilgili günler işlemden SONRAKİ haliyle birebir aynıysa istenen hale yazılır; başka biri
    // (örn. kasadaki Gün Sonu Al ekranı) bu arada değiştirdiyse reddedilir.
    if (resource === 'gunsonuGeriYaz') {
      if (!Array.isArray(body.beklenen) || !Array.isArray(body.yazilacak)) throw new HataMesaji(400, 'beklenen ve yazilacak gerekli');
      const beklenen = body.beklenen.map(gsSatir);
      const yazilacak = body.yazilacak.map(gsSatir);
      const tarihler = [...new Set([...beklenen, ...yazilacak].map((r) => r.tarih))];
      if (!tarihler.length || tarihler.length > 400) throw new HataMesaji(400, 'Geçersiz istek');
      const { data, error } = await db.from('gs_kayitlar').select('*').in('tarih', tarihler);
      kontrol(error);
      const simdi = gsSirala((data || []).map(gsSatir));
      if (JSON.stringify(simdi) !== JSON.stringify(gsSirala(beklenen))) {
        throw new HataMesaji(409, 'Bu günsonu kaydı bu arada değiştirilmiş; geri alınamadı.');
      }
      const { error: yazHata } = await db.rpc('m2_gunsonu_degistir', { p_tarihler: tarihler, p_satirlar: yazilacak });
      kontrol(yazHata);
      for (const t of tarihler) await gelirSenkron(db, t);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Bilinmeyen işlem' });
  } catch (e) {
    if (e instanceof HataMesaji) return res.status(e.durum).json({ error: e.message });
    console.error('muhasebe2 hatası:', e);
    return res.status(500).json({ error: e?.message || 'Beklenmeyen hata' });
  }
}