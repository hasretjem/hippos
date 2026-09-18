// Toptancı cari kartları — artık Google Sheets'te değil, Supabase (Postgres)
// mh_toptancilar tablosunda. Dönen JSON biçimi DEĞİŞMEDİ, ekran kodu aynen çalışır.
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const KOLONLAR = ['id', 'firma_adi', 'kategori', 'telefon', 'yetkili_kisi', 'adres', 'notlar', 'bakiye', 'eklenme_tarihi', 'durum'];

export const TOPTANCI_KATEGORILERI = [
  'Manav', 'Kırmızı Et', 'Tavuk Eti', 'Ambalaj',
  'Baget Ekmek', 'Fırın Ekmeği', 'Kahvaltı ve Sandviç Malzemesi', 'Sulu Yemek Malzemesi',
];

function rowToRecord(r) {
  return {
    id: r[0],
    firmaAdi: r[1] || '',
    kategori: r[2] || '',
    telefon: r[3] || '',
    yetkiliKisi: r[4] || '',
    adres: r[5] || '',
    not: r[6] || '',
    bakiye: Number(r[7]) || 0,
    eklenmeTarihi: r[8] || '',
    durum: r[9] || 'aktif',
  };
}

function nesneyeCevir(rowValues) {
  const o = {};
  KOLONLAR.forEach((k, i) => {
    const v = rowValues[i];
    o[k] = v === null || v === undefined ? '' : String(v);
  });
  return o;
}

async function tumSatirlar() {
  const { data, error } = await db.from('mh_toptancilar').select(KOLONLAR.join(',')).order('sira', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || [])
    .map((r) => KOLONLAR.map((k) => (r[k] === null || r[k] === undefined ? '' : r[k])))
    .filter((r) => r[0]);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await tumSatirlar();
      return res.status(200).json({ records: rows.map(rowToRecord), kategoriler: TOPTANCI_KATEGORILERI });
    }

    if (req.method === 'POST') {
      const { firmaAdi, kategori, telefon, yetkiliKisi, adres, not: notu, bakiye } = req.body || {};
      if (!firmaAdi) return res.status(400).json({ error: 'firmaAdi gerekli' });
      const id = String(Date.now());
      const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const rowValues = [id, firmaAdi, kategori || '', telefon || '', yetkiliKisi || '', adres || '', notu || '', bakiye || 0, tarih, 'aktif'];
      const { error } = await db.from('mh_toptancilar').insert(nesneyeCevir(rowValues));
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, record: rowToRecord(rowValues) });
    }

    if (req.method === 'PUT') {
      const { id, ...patch } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id gerekli' });
      const rows = await tumSatirlar();
      const idx = rows.findIndex((r) => r[0] === id);
      if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });

      const existing = rowToRecord(rows[idx]);
      const merged = { ...existing, ...patch };
      const rowValues = [
        merged.id, merged.firmaAdi, merged.kategori, merged.telefon, merged.yetkiliKisi,
        merged.adres, merged.not, merged.bakiye, merged.eklenmeTarihi, merged.durum,
      ];
      const { error } = await db.from('mh_toptancilar').upsert(nesneyeCevir(rowValues), { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, record: rowToRecord(rowValues) });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}