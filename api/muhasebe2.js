// Muhasebe2 API — Fişler/Faturalar ve Makbuzlar.
// Veri Supabase'de (m2_* tabloları), eski mh_* tablolarından bağımsız.
//
// Bu aşamada sadece KAYIT yapılır: ödeme yöntemi bilgileri (kasa, banka, kart) ileride
// açılacak sekmelerin kullanması için tabloda saklanır; kasa/banka hareketi üretilmez.
// Firma bakiyesi (m2_firma_bakiye görünümü): cari faturalar - ödeme makbuzları + tahsilat makbuzları.
import { createClient } from '@supabase/supabase-js';

export const FATURA_ODEME_TURLERI = ['Cari', 'Nakit', 'Kredi Kartı', 'Banka Havalesi'];
export const MAKBUZ_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi'];
export const MAKBUZ_TURLERI = ['Tahsilat', 'Ödeme'];
export const KASALAR = ['Günlük Kasa', 'Çelik Kasa'];
export const YONTEM_TURLERI = ['Kredi Kartı', 'Banka Havalesi'];

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

// Ödeme türüne göre deftere yazılacak odeme_hesabi / kasa alanlarını doğrular.
async function yontemAlanlari(db, odemeTuru, odemeHesabi, kasa) {
  if (odemeTuru === 'Cari') return { odeme_hesabi: null, kasa: null };

  if (odemeTuru === 'Nakit') {
    if (!KASALAR.includes(kasa)) throw new HataMesaji(400, 'Nakit ödemede kasayı seçin (Günlük Kasa / Çelik Kasa)');
    return { odeme_hesabi: null, kasa };
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

export default async function handler(req, res) {
  try {
    const db = dbAl();
    const resource = req.query?.resource;
    const body = req.body || {};

    // ---------- Okuma ----------
    if (req.method === 'GET' && resource === 'baslangic') {
      const [fi, ba, ka, yo] = await Promise.all([
        db.from('m2_firmalar').select('id,ad,varsayilan_kategori'),
        db.from('m2_firma_bakiye').select('firma_id,bakiye'),
        db.from('m2_kategoriler').select('ad').order('sira').order('ad'),
        db.from('m2_odeme_yontemleri').select('id,odeme_turu,ad').order('ad'),
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

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ---------- Fiş / Fatura girişi ----------
    if (resource === 'fisFaturaKaydet') {
      const tutar = tutarCoz(body.faturaTutari);
      if (tutar <= 0) throw new HataMesaji(400, 'Tutar sıfırdan büyük olmalı');
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

      const { error } = await db.from('m2_fis_faturalar').insert({
        tarih,
        firma_id: firma.id,
        firma_adi: firma.ad,
        fatura_no: metin(body.faturaNo),
        aciklama: metin(body.aciklama),
        gider_kategorisi: kategori,
        odeme_turu: odemeTuru,
        fatura_tutari: tutar,
        ...alan,
      });
      kontrol(error);
      return res.status(200).json({ ok: true, bakiye: await bakiyeGetir(db, firma.id) });
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

      const { error } = await db.from('m2_makbuzlar').insert({
        tarih,
        makbuz_turu: body.makbuzTuru,
        firma_id: firma.id,
        firma_adi: firma.ad,
        fatura_no: metin(body.faturaNo),
        aciklama: metin(body.aciklama),
        odeme_turu: odemeTuru,
        tutar,
        ...alan,
      });
      kontrol(error);
      return res.status(200).json({ ok: true, bakiye: await bakiyeGetir(db, firma.id) });
    }

    // ---------- Tanımlar ----------
    if (resource === 'firmaEkle') {
      const ad = String(body.ad || '').trim();
      if (!ad) throw new HataMesaji(400, 'Firma adı gerekli');
      const { data, error } = await db
        .from('m2_firmalar')
        .insert({ ad, varsayilan_kategori: metin(body.varsayilanKategori) })
        .select('id,ad,varsayilan_kategori')
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
      return res.status(200).json({ ok: true, yontem: data });
    }

    return res.status(400).json({ error: 'Bilinmeyen işlem' });
  } catch (e) {
    if (e instanceof HataMesaji) return res.status(e.durum).json({ error: e.message });
    console.error('muhasebe2 hatası:', e);
    return res.status(500).json({ error: e?.message || 'Beklenmeyen hata' });
  }
}