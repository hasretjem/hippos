// Muhasebe2 API — Fişler/Faturalar ve Makbuzlar + Datalar + Hesap Özetleri + Yemek Kartları.
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
import { randomUUID } from 'node:crypto';

export const FATURA_ODEME_TURLERI = ['Cari', 'Nakit', 'Kredi Kartı', 'Banka Havalesi'];
export const MAKBUZ_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi'];
export const MAKBUZ_TURLERI = ['Tahsilat', 'Ödeme'];
export const YONTEM_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi'];
// Datalar tüm kayıtları sayfa sayfa (1000'er) yükler; üst sınır 20.000 satır.
const DATALAR_SAYFA = 1000;
const DATALAR_MAKS_SAYFA = 20;
const YK_KATEGORI = 'Yemek Kart-Banka Masrafı';

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
  if (!ad) throw new HataMesaji(400, odemeTuru === 'Banka Havalesi' ? 'Bankayı seçin' : 'Kartı seçin');
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
  if (firma.firma_turu !== 'Ödeme Şekli') return { grup: 'Firma', bolum: 'cariler' };
  const turler = (yontemler || []).filter((y) => norm(y.ad) === norm(firma.ad)).map((y) => y.odeme_turu);
  if (turler.includes('Nakit')) return { grup: 'Kasa', bolum: 'kasaBanka' };
  if (turler.includes('Kredi Kartı') && turler.includes('Banka Havalesi')) return { grup: 'Cepten', bolum: 'cariler' };
  if (turler.includes('Kredi Kartı')) return { grup: 'Kredi Kartı', bolum: 'cariler' };
  if (turler.includes('Banka Havalesi')) return { grup: 'Banka', bolum: 'kasaBanka' };
  return { grup: 'Ödeme şekli', bolum: 'cariler' };
}

const kurus = (v) => Math.round((Number(v) || 0) * 100);

// Ekstre satırları: Fatura/Fiş -> Alacak, Tahsilat -> Alacak, Ödeme (Tediye) -> Borç.
// Sıralama: tarih, kayıt zamanı, sıra (fatura, elle makbuz, otomatik ödeme, otomatik tahsilat).
export function ekstreHesapla(faturalar, makbuzlar) {
  const ham = [
    ...faturalar.map((f) => ({
      id: f.id,
      tarih: f.tarih,
      zaman: f.kayit_zamani || '',
      sira: 1,
      evrakTuru: 'Fatura/Fiş',
      belgeNo: f.fatura_no || '',
      aciklama: f.aciklama || '',
      odemeSekli: f.kasa || f.odeme_hesabi || '',
      borcK: 0,
      alacakK: kurus(f.fatura_tutari),
      grupId: f.grup_id || null,
      otomatik: false,
    })),
    ...makbuzlar.map((m) => {
      const odeme = m.makbuz_turu === 'Ödeme';
      return {
        id: m.id,
        tarih: m.tarih,
        zaman: m.kayit_zamani || '',
        sira: !m.otomatik ? 2 : odeme ? 3 : 4,
        evrakTuru: odeme ? 'Ödeme (Tediye) Makbuzu' : 'Tahsilat Makbuzu',
        belgeNo: m.fatura_no || '',
        aciklama: m.aciklama || '',
        odemeSekli: m.kasa || m.odeme_hesabi || '',
        borcK: odeme ? kurus(m.tutar) : 0,
        alacakK: odeme ? 0 : kurus(m.tutar),
        grupId: m.grup_id || null,
        otomatik: !!m.otomatik,
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
    };
  });
  return { satirlar, toplamBorc: toplamBorcK / 100, toplamAlacak: toplamAlacakK / 100, bakiye: bakiyeK / 100 };
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

// Kesim aralığı: 10 -> ayın 1-10'u, 20 -> 11-20'si, 30 -> 21'den ay sonuna.
export function kesimGunleri(donem, kesim) {
  const [y, a] = String(donem).split('-').map(Number);
  const sonGun = new Date(y, a, 0).getDate();
  if (Number(kesim) === 10) return [1, 10];
  if (Number(kesim) === 20) return [11, 20];
  return [21, sonGun];
}

function sayiCozTR(v) {
  let t = String(v ?? '').trim();
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

// Günsonu kayıtlarındaki yemek kartı tutarları (marka bazında), kesim aralığı için.
async function gunsonuYemekToplamlari(db, donem, kesim) {
  const [y, a] = String(donem).split('-');
  const [bas, bit] = kesimGunleri(donem, kesim);
  const { data, error } = await db.from('gs_kayitlar').select('tarih,yemek_detay').like('tarih', `%.${a}.${y}`);
  kontrol(error);
  const toplam = {};
  (data || []).forEach((r) => {
    const gun = parseInt(String(r.tarih).split('.')[0], 10);
    if (!(gun >= bas && gun <= bit)) return;
    let detay = {};
    try {
      detay = JSON.parse(r.yemek_detay || '{}') || {};
    } catch {
      detay = {};
    }
    const tutarlar = detay.tutarlar || {};
    Object.keys(tutarlar).forEach((marka) => {
      const satir = tutarlar[marka] || {};
      const t = Object.keys(satir).reduce((x, k) => x + sayiCozTR(satir[k]), 0);
      const anahtar = norm(marka);
      toplam[anahtar] = Math.round(((toplam[anahtar] || 0) + t) * 100) / 100;
    });
  });
  return toplam;
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

export default async function handler(req, res) {
  try {
    const db = dbAl();
    const resource = req.query?.resource;
    const body = req.body || {};

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
          .select('id,tarih,fatura_no,aciklama,odeme_hesabi,kasa,fatura_tutari,grup_id,kayit_zamani')
          .eq('firma_id', firmaId),
        db
          .from('m2_makbuzlar')
          .select('id,tarih,makbuz_turu,fatura_no,aciklama,odeme_hesabi,kasa,tutar,otomatik,grup_id,kayit_zamani')
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
            'id,tarih,evrak_turu,firma_adi,fatura_no,aciklama,gider_kategorisi,odeme_turu,odeme_sekli,tutar,kdv,tahsilat,odeme_tediye,otomatik,kayit_zamani,sira',
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
        evrakTuru: r.evrak_turu,
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
      }));
      return res.status(200).json({ kayitlar, sinirli: kayitlar.length >= DATALAR_SAYFA * DATALAR_MAKS_SAYFA });
    }

    // Yemek Kartları: seçili dönem ve kesim için her kartın durumu.
    if (req.method === 'GET' && resource === 'yemekKarti') {
      const donem = String(req.query?.donem || bugunIstanbul().slice(0, 7));
      const kesim = Number(req.query?.kesim || 10);
      if (!/^\d{4}-\d{2}$/.test(donem)) throw new HataMesaji(400, 'Dönem geçersiz');
      if (![10, 20, 30].includes(kesim)) throw new HataMesaji(400, 'Kesim geçersiz');
      const [kr, ks] = await Promise.all([
        db.from('m2_yk_kartlar').select('*').order('sira'),
        db.from('m2_yk_kesimler').select('*').eq('donem', donem).eq('kesim', kesim),
      ]);
      [kr, ks].forEach((r) => kontrol(r.error));
      const kartlar = kr.data || [];
      const kesimler = ks.data || [];
      const firmaIdleri = kartlar.map((k) => k[`firma${kesim}_id`]).filter(Boolean);
      const [fr, od, gunsonu] = await Promise.all([
        firmaIdleri.length ? db.from('m2_firmalar').select('id,ad').in('id', firmaIdleri) : { data: [], error: null },
        kesimler.length ? db.from('m2_yk_odemeler').select('*').in('kesim_id', kesimler.map((k) => k.id)) : { data: [], error: null },
        gunsonuYemekToplamlari(db, donem, kesim).catch(() => ({})),
      ]);
      [fr, od].forEach((r) => kontrol(r.error));
      const firmaHaritasi = new Map((fr.data || []).map((f) => [f.id, f]));
      const bugun = bugunIstanbul();
      const r2 = (x) => Math.round(x * 100) / 100;
      const satirlar = kartlar
        .filter((k) => !k.pasif)
        .map((k) => {
          const kes = kesimler.find((x) => x.kart_id === k.id) || null;
          const cari = firmaHaritasi.get(k[`firma${kesim}_id`]) || null;
          const odemeler = kes
            ? (od.data || [])
                .filter((o) => o.kesim_id === kes.id)
                .sort((a, b) => (a.gelis_tarihi < b.gelis_tarihi ? -1 : 1))
                .map((o) => ({ id: o.id, tutar: sayiN(o.tutar), gelisTarihi: o.gelis_tarihi, hesapAdi: o.hesap_adi }))
            : [];
          const gelenToplam = r2(odemeler.reduce((x, o) => x + o.tutar, 0));
          const gunsonuToplam = gunsonu[norm(k.ad)] || 0;
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
            gunsonuToplam,
            gunsonuFark: kesimObj ? r2(kesimObj.faturaToplami - gunsonuToplam) : 0,
            vadeFarkliMi: !!(kesimObj && sonGelis && kesimObj.vade && sonGelis !== kesimObj.vade),
            vadeGecti: !!(kesimObj && kesimObj.vade && kesimObj.vade < bugun && kalan > 0.005),
          };
        });
      const [basGun, bitGun] = kesimGunleri(donem, kesim);
      const [y, a] = donem.split('-');
      return res.status(200).json({
        satirlar,
        donem,
        kesim,
        aralik: { bas: `${String(basGun).padStart(2, '0')}.${a}.${y}`, bit: `${String(bitGun).padStart(2, '0')}.${a}.${y}` },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ---------- Fiş / Fatura girişi ----------
    if (resource === 'fisFaturaKaydet') {
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

      const grupId = randomUUID();
      const faturaNo = metin(body.faturaNo);
      const aciklama = metin(body.aciklama);
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
        grup_id: grupId,
      };

      // Cari dışı ödemede iki otomatik makbuz: firmaya ödeme + ödeme şekline tahsilat.
      const makbuzlar = [];
      if (odemeTuru !== 'Cari') {
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
        });
      }

      // Fonksiyon fatura ve makbuzlarını TEK işlemde yazar: ya hepsi yazılır ya hiçbiri.
      const { error } = await db.rpc('m2_fatura_yaz', { p_fatura: fatura, p_makbuzlar: makbuzlar });
      kontrol(error);
      return res.status(200).json({ ok: true, bakiye: await bakiyeGetir(db, firma.id), otomatikMakbuz: makbuzlar.length });
    }

    // ---------- Tahsilat / Ödeme makbuzu ----------
    if (resource === 'makbuzKaydet') {
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

      const grupId = randomUUID();
      const tahsilatMi = body.makbuzTuru === 'Tahsilat';
      const faturaNo = metin(body.faturaNo);
      // Tek insert = tek işlem: makbuz ve karşı makbuzu birlikte yazılır.
      const { error } = await db.from('m2_makbuzlar').insert([
        {
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
        },
        {
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
        },
      ]);
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
      return res.status(200).json({ ok: true, hesap: h, duzenlendi: !!mevcut, cari: cari.ad });
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

    return res.status(400).json({ error: 'Bilinmeyen işlem' });
  } catch (e) {
    if (e instanceof HataMesaji) return res.status(e.durum).json({ error: e.message });
    console.error('muhasebe2 hatası:', e);
    return res.status(500).json({ error: e?.message || 'Beklenmeyen hata' });
  }
}