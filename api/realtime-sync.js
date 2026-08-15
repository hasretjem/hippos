import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

// SADECE OKUMA (Supabase) + SADECE YAZMA (Sheets) — hiçbir yeni Realtime channel/subscription
// açmıyor. realtime_usage_log zaten var olan tablo, mevcut bumpUsageCounter mekanizmasının
// yazdığı veriyi PERİYODİK olarak (saatte bir, dış zamanlayıcı ile) toplu okuyup Sheets'e TEK
// satır halinde özetliyor — ham event'ler Supabase'de kalmaya devam ediyor, Sheets'e asla
// tek tek yazılmıyor.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function getSheetsAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const HOURLY_TAB = 'Realtime Hourly';
const HOURLY_HEADERS = [
  'date', 'hour', 'total_messages', 'table_state', 'sales_history', 'cari_hareketler',
  'cari_odemeler', 'cari_faturalar', 'packages', 'paket_teslimatlari', 'mutfak_hazir_notlar',
  'presence_sync', 'presence_join', 'presence_leave', 'other', 'full', 'paketci', 'mutfak',
];
const DAILY_TAB = 'Realtime Daily';
const DAILY_HEADERS = [
  'date', 'total_messages', 'table_state', 'sales_history', 'cari_hareketler',
  'cari_odemeler', 'cari_faturalar', 'packages', 'paket_teslimatlari', 'mutfak_hazir_notlar',
  'presence_sync', 'presence_join', 'presence_leave', 'other', 'full', 'paketci', 'mutfak',
  'monthly_limit', 'usage_percent',
];

// Supabase'in Realtime free/pro plan aylık mesaj limiti — kullanıcı planı değişirse burası
// güncellenmeli, kod içinde başka hiçbir yerde varsayılmıyor.
const MONTHLY_LIMIT = 2000000;

async function ensureTab(sheets, tab, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === tab);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
  }
}

// event.table alanındaki ham isimleri (bumpUsageCounter'a geçilen string'ler) Sheets
// kolonlarına eşler. Karşılığı olmayan HER ŞEY 'other'a düşer — uydurma kategori yok.
function kategoriEsle(tableAdi) {
  if (tableAdi === 'table_state') return 'table_state';
  if (tableAdi === 'sales_history') return 'sales_history';
  if (tableAdi === 'cari_hareketler') return 'cari_hareketler';
  if (tableAdi === 'cari_odemeler') return 'cari_odemeler';
  if (tableAdi === 'cari_faturalar') return 'cari_faturalar';
  if (tableAdi === 'packages') return 'packages';
  if (tableAdi === 'paket_teslimatlari') return 'paket_teslimatlari';
  if (tableAdi === 'mutfak_hazir_notlar') return 'mutfak_hazir_notlar';
  if (tableAdi === 'presence (sync)') return 'presence_sync';
  if (tableAdi === 'presence (join)') return 'presence_join';
  if (tableAdi === 'presence (leave)') return 'presence_leave';
  return 'other';
}

// realtime_usage_log satırlarından (her satır bir client'ın 10sn'lik flush'ı, events JSONB
// dizisi + scope alanı taşıyor) verilen aralık için TEK bir agregasyon objesi üretir.
function agregatOlustur(rows) {
  const sonuc = {
    total_messages: 0, table_state: 0, sales_history: 0, cari_hareketler: 0,
    cari_odemeler: 0, cari_faturalar: 0, packages: 0, paket_teslimatlari: 0,
    mutfak_hazir_notlar: 0, presence_sync: 0, presence_join: 0, presence_leave: 0, other: 0,
    full: 0, paketci: 0, mutfak: 0,
  };
  rows.forEach((row) => {
    const scope = row.scope; // null olabilir (scope eklenmeden ÖNCEKİ eski satırlar)
    (row.events || []).forEach((ev) => {
      const kategori = kategoriEsle(ev.table);
      sonuc[kategori] += 1;
      sonuc.total_messages += 1;
      if (scope === 'full') sonuc.full += 1;
      else if (scope === 'paketci') sonuc.paketci += 1;
      else if (scope === 'mutfak') sonuc.mutfak += 1;
      // scope null ise (eski veri) hiçbir scope sütununa eklenmiyor — uydurmuyoruz.
    });
  });
  return sonuc;
}

async function saatlikVeriCek(baslangic, bitis) {
  const { data, error } = await supabase
    .from('realtime_usage_log')
    .select('events, scope, ts')
    .gte('ts', baslangic.toISOString())
    .lt('ts', bitis.toISOString());
  if (error) throw error;
  return data || [];
}

// Bir Sheet sekmesinde date(+hour) kolonlarına göre var olan satırı bulur — varsa
// güncellenecek satır numarasını, yoksa null döner. Aynı saat/gün için TEKRAR çalıştırılırsa
// (iki kez tetiklenmesi, elle backfill vb.) yeni satır EKLEMEK yerine ÜZERİNE YAZAR.
async function mevcutSatiriBul(sheets, tab, headers, aramaDegerleri) {
  const lastCol = String.fromCharCode(64 + headers.length);
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A2:${lastCol}` });
  const rows = result.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const eslesiyorMu = aramaDegerleri.every((deger, idx) => rows[i][idx] === deger);
    if (eslesiyorMu) return { rowIndex: i + 2, lastCol }; // +2: A1 başlık + 1-index
  }
  return { rowIndex: null, lastCol };
}

async function satirYaz(sheets, tab, headers, rowValues, aramaKolonSayisi) {
  await ensureTab(sheets, tab, headers);
  const aramaDegerleri = rowValues.slice(0, aramaKolonSayisi).map(String);
  const { rowIndex, lastCol } = await mevcutSatiriBul(sheets, tab, headers, aramaDegerleri);
  if (rowIndex) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A${rowIndex}:${lastCol}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A2`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
  }
}

export default async function handler(req, res) {
  try {
    // ---- GÜVENLİK: bu endpoint dışarıdan (dış zamanlayıcı) tetiklendiği için, herkesin
    // rastgele bulup tetikleyememesi için basit bir paylaşılan secret kontrolü var. Secret
    // ?secret=... query param OLARAK YA DA Authorization: Bearer ... header'ı olarak
    // gelebilir (çoğu ücretsiz cron servisi header eklemeyi desteklemiyor, o yüzden query
    // param da kabul ediliyor — endpoint zaten sadece OKUMA+AGREGASYON yapıyor, hassas veri
    // silmiyor/değiştirmiyor, ama yine de rastgele tetiklenmesin diye bu kontrol şart).
    const gelenSecret = req.query.secret || (req.headers.authorization || '').replace('Bearer ', '');
    if (!process.env.REALTIME_SYNC_SECRET) {
      return res.status(500).json({ error: 'REALTIME_SYNC_SECRET ortam değişkeni tanımlı değil — Vercel proje ayarlarından eklenmeli' });
    }
    if (gelenSecret !== process.env.REALTIME_SYNC_SECRET) {
      return res.status(401).json({ error: 'Yetkisiz' });
    }

    // Hedef saat: ?hour=2026-08-15T14 gibi elle verilebilir (test/backfill için), yoksa
    // "az önce biten saat" kullanılır — dış zamanlayıcı her saat başı birkaç dakika sonra
    // tetiklenirse o saatin verisi artık tamamen Supabase'e yazılmış olur.
    let hedefSaatBaslangic;
    if (req.query.hour) {
      hedefSaatBaslangic = new Date(`${req.query.hour}:00:00`);
      if (isNaN(hedefSaatBaslangic.getTime())) return res.status(400).json({ error: 'Geçersiz hour parametresi' });
    } else {
      const simdi = new Date();
      hedefSaatBaslangic = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate(), simdi.getHours() - 1);
    }
    const hedefSaatBitis = new Date(hedefSaatBaslangic.getTime() + 60 * 60 * 1000);

    const saatlikRows = await saatlikVeriCek(hedefSaatBaslangic, hedefSaatBitis);
    const saatlikAgregat = agregatOlustur(saatlikRows);

    const dateStr = hedefSaatBaslangic.toLocaleDateString('tr-TR');
    const hourStr = String(hedefSaatBaslangic.getHours()).padStart(2, '0');

    const auth = getSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const hourlyRowValues = [
      dateStr, hourStr, saatlikAgregat.total_messages, saatlikAgregat.table_state,
      saatlikAgregat.sales_history, saatlikAgregat.cari_hareketler, saatlikAgregat.cari_odemeler,
      saatlikAgregat.cari_faturalar, saatlikAgregat.packages, saatlikAgregat.paket_teslimatlari,
      saatlikAgregat.mutfak_hazir_notlar, saatlikAgregat.presence_sync, saatlikAgregat.presence_join,
      saatlikAgregat.presence_leave, saatlikAgregat.other, saatlikAgregat.full,
      saatlikAgregat.paketci, saatlikAgregat.mutfak,
    ];
    // date+hour ile eşleşen satır aranır (ilk 2 kolon) — TEK toplu yazma, event bazında değil.
    await satirYaz(sheets, HOURLY_TAB, HOURLY_HEADERS, hourlyRowValues, 2);

    // Günlük satır: o güne ait TÜM saatleri Supabase'ten yeniden okuyup baştan hesaplıyoruz
    // (hourly satırların toplamına güvenmek yerine) — gün içinde tekrar tekrar çağrılsa bile
    // hep doğru/güncel toplamı yazar, sürüklenme (drift) riski olmaz.
    const gunBaslangic = new Date(hedefSaatBaslangic.getFullYear(), hedefSaatBaslangic.getMonth(), hedefSaatBaslangic.getDate());
    const gunBitis = new Date(gunBaslangic.getTime() + 24 * 60 * 60 * 1000);
    const gunlukRows = await saatlikVeriCek(gunBaslangic, gunBitis);
    const gunlukAgregat = agregatOlustur(gunlukRows);
    const usagePercent = Math.round((gunlukAgregat.total_messages / MONTHLY_LIMIT) * 10000) / 100;

    const dailyRowValues = [
      dateStr, gunlukAgregat.total_messages, gunlukAgregat.table_state, gunlukAgregat.sales_history,
      gunlukAgregat.cari_hareketler, gunlukAgregat.cari_odemeler, gunlukAgregat.cari_faturalar,
      gunlukAgregat.packages, gunlukAgregat.paket_teslimatlari, gunlukAgregat.mutfak_hazir_notlar,
      gunlukAgregat.presence_sync, gunlukAgregat.presence_join, gunlukAgregat.presence_leave,
      gunlukAgregat.other, gunlukAgregat.full, gunlukAgregat.paketci, gunlukAgregat.mutfak,
      MONTHLY_LIMIT, usagePercent,
    ];
    await satirYaz(sheets, DAILY_TAB, DAILY_HEADERS, dailyRowValues, 1);

    res.status(200).json({ ok: true, hour: `${dateStr} ${hourStr}:00`, hourly: saatlikAgregat, daily: gunlukAgregat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}