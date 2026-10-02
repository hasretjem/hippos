// Muhasebe2 API — Fişler/Faturalar ve Makbuzlar + Datalar + Hesap Özetleri.
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
export const YONTEM_TURLERI = ['Kredi Kartı', 'Banka Havalesi'];
const DATALAR_LIMIT = 1000;

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
      const { data, error } = await db
        .from('m2_datalar')
        .select(
          'id,tarih,evrak_turu,firma_adi,fatura_no,aciklama,gider_kategorisi,odeme_turu,odeme_sekli,tutar,kdv,tahsilat,odeme_tediye,otomatik,kayit_zamani,sira',
        )
        .order('tarih', { ascending: false })
        .order('kayit_zamani', { ascending: false })
        .order('sira', { ascending: true })
        .limit(DATALAR_LIMIT);
      kontrol(error);
      const kayitlar = (data || []).map((r) => ({
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
      return res.status(200).json({ kayitlar, sinirli: kayitlar.length >= DATALAR_LIMIT });
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

    return res.status(400).json({ error: 'Bilinmeyen işlem' });
  } catch (e) {
    if (e instanceof HataMesaji) return res.status(e.durum).json({ error: e.message });
    console.error('muhasebe2 hatası:', e);
    return res.status(500).json({ error: e?.message || 'Beklenmeyen hata' });
  }
}