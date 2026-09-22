import { createClient } from '@supabase/supabase-js';

// SADECE OKUMA (Supabase) + SADECE YAZMA (Sheets) — hiçbir yeni Realtime channel/subscription
// açmıyor. realtime_usage_log zaten var olan tablo, mevcut bumpUsageCounter mekanizmasının
// yazdığı veriyi PERİYODİK olarak (saatte bir, dış zamanlayıcı ile) toplu okuyup rt_kullanim
// tablosuna TEK satır halinde özetliyor — ham event'ler realtime_usage_log'da kalmaya devam
// ediyor, özet satırı asla tek tek yazılmıyor.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);



const MONTHLY_LIMIT = 2000000;

// Kullanım logu artık Sheets'te değil, Supabase rt_kullanim tablosunda.
// Kolon sırası eski Sheets başlıklarıyla birebir; anahtar = row_type + tarih + saat.
const KOLONLAR = [
  'row_type', 'tarih', 'saat', 'total_messages', 'table_state', 'sales_history', 'cari_hareketler',
  'cari_odemeler', 'cari_faturalar', 'packages', 'paket_teslimatlari', 'mutfak_hazir_notlar',
  'presence_sync', 'presence_join', 'presence_leave', 'other', 'full_scope', 'paketci', 'mutfak',
  'monthly_limit', 'usage_percent',
];

// aramaKolonSayisi: saatlik satırlarda 3 (tip+tarih+saat), günlük satırlarda 2 (tip+tarih).
// Aynı anahtar tekrar yazılırsa üzerine yazılır — eski "satırı bul, varsa güncelle" mantığının
// Postgres karşılığı, ama tek işlemde ve tüm tabloyu okumadan.
async function satirYaz(sheets, rowValues, aramaKolonSayisi) {
  const anahtar = rowValues.slice(0, aramaKolonSayisi).map((v) => String(v ?? '')).join('|');
  const kayit = { id: anahtar };
  KOLONLAR.forEach((k, i) => {
    const v = rowValues[i];
    kayit[k] = v === null || v === undefined ? '' : String(v);
  });
  const { error } = await supabase.from('rt_kullanim').upsert(kayit, { onConflict: 'id' });
  if (error) throw new Error(`rt_kullanim yazılamadı: ${error.message}`);
}

export default async function handler(req, res) {
  try {
    const gelenSecret = req.query.secret || (req.headers.authorization || '').replace('Bearer ', '');
    if (!process.env.REALTIME_SYNC_SECRET) {
      return res.status(500).json({ error: 'REALTIME_SYNC_SECRET ortam değişkeni tanımlı değil — Vercel proje ayarlarından eklenmeli' });
    }
    if (gelenSecret !== process.env.REALTIME_SYNC_SECRET) {
      return res.status(401).json({ error: 'Yetkisiz' });
    }

    let hedefSaatBaslangic;
    if (req.query.hour) {
      hedefSaatBaslangic = new Date(`${req.query.hour}:00:00`);
      if (isNaN(hedefSaatBaslangic.getTime())) return res.status(400).json({ error: 'Geçersiz hour parametresi' });
    } else {
      const simdi = new Date();
      hedefSaatBaslangic = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate(), simdi.getHours() - 1);
    }
    const hedefSaatBitis = new Date(hedefSaatBaslangic.getTime() + 60 * 60 * 1000);

    const saatlikRows = await veriCek(hedefSaatBaslangic, hedefSaatBitis);
    const saatlikAgregat = agregatOlustur(saatlikRows);

    const dateStr = hedefSaatBaslangic.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const hourStr = String(hedefSaatBaslangic.getHours()).padStart(2, '0');

    const sheets = null; // Sheets kullanılmıyor — satirYaz imzası korunsun diye duruyor

    const hourlyRowValues = [
      'hourly', dateStr, hourStr, saatlikAgregat.total_messages, saatlikAgregat.table_state,
      saatlikAgregat.sales_history, saatlikAgregat.cari_hareketler, saatlikAgregat.cari_odemeler,
      saatlikAgregat.cari_faturalar, saatlikAgregat.packages, saatlikAgregat.paket_teslimatlari,
      saatlikAgregat.mutfak_hazir_notlar, saatlikAgregat.presence_sync, saatlikAgregat.presence_join,
      saatlikAgregat.presence_leave, saatlikAgregat.other, saatlikAgregat.full,
      saatlikAgregat.paketci, saatlikAgregat.mutfak, '', '',
    ];
    await satirYaz(sheets, hourlyRowValues, 3);

    const gunBaslangic = new Date(hedefSaatBaslangic.getFullYear(), hedefSaatBaslangic.getMonth(), hedefSaatBaslangic.getDate());
    const gunBitis = new Date(gunBaslangic.getTime() + 24 * 60 * 60 * 1000);
    const gunlukRows = await veriCek(gunBaslangic, gunBitis);
    const gunlukAgregat = agregatOlustur(gunlukRows);
    const usagePercent = Math.round((gunlukAgregat.total_messages / MONTHLY_LIMIT) * 10000) / 100;

    const dailyRowValues = [
      'daily', dateStr, '', gunlukAgregat.total_messages, gunlukAgregat.table_state, gunlukAgregat.sales_history,
      gunlukAgregat.cari_hareketler, gunlukAgregat.cari_odemeler, gunlukAgregat.cari_faturalar,
      gunlukAgregat.packages, gunlukAgregat.paket_teslimatlari, gunlukAgregat.mutfak_hazir_notlar,
      gunlukAgregat.presence_sync, gunlukAgregat.presence_join, gunlukAgregat.presence_leave,
      gunlukAgregat.other, gunlukAgregat.full, gunlukAgregat.paketci, gunlukAgregat.mutfak,
      MONTHLY_LIMIT, usagePercent,
    ];
    await satirYaz(sheets, dailyRowValues, 3);

    res.status(200).json({ ok: true, hour: `${dateStr} ${hourStr}:00`, hourly: saatlikAgregat, daily: gunlukAgregat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}