// Gün Sonu Kasa kayıtları — artık Google Sheets'te değil, Supabase (Postgres)
// gs_kayitlar tablosunda. Kolon SIRASI eski Sheets başlıklarıyla BİREBİR aynı,
// bu yüzden rowToRecord/recordToRow fonksiyonları HİÇ değişmedi.
// Anahtar sütun ID değil TARİH (gün başına tek satır) — POST upsert ile yazıyor.
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

// Sheets başlık sırasıyla birebir: Tarih, Toplam Nakit Para, ... Kaydeden Saat
const KOLONLAR = [
  'tarih', 'toplam_nakit', 'nakit_kupur', 'kasa_avansi', 'pos_toplam', 'pos_satirlari',
  'ana_kasa_toplam', 'ana_kasa_harcamalar', 'gunluk_kasa_toplam', 'gunluk_kasa_harcamalar',
  'cari_toplam', 'cari_detay', 'yemek_toplam', 'yemek_detay', 'ciro', 'ana_kasa_takibi',
  'kaydeden_saat',
];

function satirdanNesne(rowValues) {
  const o = {};
  KOLONLAR.forEach((k, i) => {
    const v = rowValues[i];
    o[k] = v === null || v === undefined ? '' : String(v);
  });
  return o;
}

async function tumSatirlar() {
  const { data, error } = await db.from('gs_kayitlar').select(KOLONLAR.join(',')).order('sira', { ascending: true });
  if (error) throw new Error(`gs_kayitlar okunamadı: ${error.message}`);
  return (data || [])
    .map((r) => KOLONLAR.map((k) => (r[k] === null || r[k] === undefined ? '' : r[k])))
    .filter((r) => r[0]);
}

function j(v) {
  return JSON.stringify(v ?? null);
}
function safeParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// Eski (3 sütunlu: Tarih/JSON/KaydedenSaat) satırları da okuyabilsin diye — B sütunu
// eskiden tek büyük JSON'du, yeni satırlarda ise sadece bir sayı (Toplam Nakit Para).
// B hücresi "{" ile başlıyorsa eski formattır, tüm alanlar oradan çözülür.
function rowToRecord(r) {
  const tarih = r[0];
  const bRaw = r[1];
  if (bRaw && String(bRaw).trim().startsWith('{')) {
    // Eski format — tüm gün sonu verisi tek JSON'daydı.
    const eski = safeParse(bRaw) || {};
    return { tarih, ...eski, kaydedenSaat: r[2] };
  }
  return {
    tarih,
    toplamNakitPara: Number(r[1]) || 0,
    nakitKupurDetayi: safeParse(r[2]) || {},
    kasaAvansi: Number(r[3]) || 0,
    posToplam: Number(r[4]) || 0,
    posTutarlari: safeParse(r[5]) || [],
    anaKasaToplam: Number(r[6]) || 0,
    anaKasaHarcamalar: safeParse(r[7]) || [],
    gunlukKasaToplam: Number(r[8]) || 0,
    gunlukKasaHarcamalar: safeParse(r[9]) || [],
    cariToplam: Number(r[10]) || 0,
    cariDetay: safeParse(r[11]) || {},
    genelYemekToplami: Number(r[12]) || 0,
    yemekDetay: safeParse(r[13]) || {},
    ciro: safeParse(r[14]) || {},
    anaKasaTakibi: safeParse(r[15]) || {},
    // Eski/mevcut Ayarlar sayfası karşılaştırma kartı bu düz alanları bekliyordu —
    // anaKasaTakibi içinden de aynı adlarla dışarı veriyoruz, geriye dönük kırılmasın diye.
    dundenDevirAnaKasa: (safeParse(r[15]) || {}).dundenDevir ?? 0,
    yarinaDevirAnaKasa: (safeParse(r[15]) || {}).yarinaDevir ?? 0,
    kaydedenSaat: r[16],
  };
}

function recordToRow({ tarih, toplamNakitPara, nakitKupurDetayi, kasaAvansi, posToplam, posTutarlari, anaKasaToplam, anaKasaHarcamalar, gunlukKasaToplam, gunlukKasaHarcamalar, cariToplam, cariDetay, genelYemekToplami, yemekDetay, ciro, anaKasaTakibi }, saat) {
  return [
    tarih,
    toplamNakitPara ?? 0,
    j(nakitKupurDetayi),
    kasaAvansi ?? 0,
    posToplam ?? 0,
    j(posTutarlari),
    anaKasaToplam ?? 0,
    // KULLANIMDAN KALKTI (16 Eylül): harcama satır detayı artık buraya yazılmıyor.
    // Giderlerin adı/açıklaması TEK KAYNAK olarak Fatura ve Fişler sekmesinde tutuluyor
    // (GunlukHarcama=TRUE, AnaKasaHarcama sütunu hangi kasadan çıktığını söylüyor).
    // Sütunlar eski kayıtlar okunabilsin diye yerinde bırakıldı, yenilerine [] yazılıyor.
    j(anaKasaHarcamalar ?? []),
    gunlukKasaToplam ?? 0,
    j(gunlukKasaHarcamalar ?? []),
    cariToplam ?? 0,
    j(cariDetay),
    genelYemekToplami ?? 0,
    j(yemekDetay),
    j(ciro),
    j(anaKasaTakibi),
    saat,
  ];
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await tumSatirlar();
      return res.status(200).json({ records: rows.map(rowToRecord) });
    }

    if (req.method === 'POST') {
      const { tarih } = req.body || {};
      if (!tarih) return res.status(400).json({ error: 'tarih gerekli' });
      const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

      // Aynı tarihe ait kayıt varsa üzerine yaz (o gün birden fazla kez kaydedilebilsin diye).
      // Postgres upsert bunu tek işlemde yapıyor — önce "var mı" diye okumaya gerek yok.
      const rowValues = recordToRow(req.body, saat);
      const { error } = await db.from('gs_kayitlar').upsert(satirdanNesne(rowValues), { onConflict: 'tarih' });
      if (error) throw new Error(`gün sonu kaydedilemedi: ${error.message}`);

      return res.status(200).json({ ok: true, tarih, saat });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}