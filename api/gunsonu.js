import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = 'Gün Sonu Kasa';

// Her kategori kendi sütununda. Değişken uzunluklu listeler (kupür adetleri, POS satırları,
// harcama satırları, cari detayları, yemek kartı detayları) kendi hücrelerinde JSON olarak
// tutuluyor — aksi halde sütun sayısı gün gün değişir ve tablo bozulurdu. Özet/toplam
// rakamlar ise düz sayı olarak ayrı sütunlarda, Excel'de doğrudan okunsun/toplansın diye.
const HEADERS = [
  'Tarih',                    // A
  'Toplam Nakit Para',        // B
  'Nakit Küpür Detayı',       // C  JSON: { "5": adet, "10": adet, ... }
  'Kasa Avansı',              // D
  'POS Toplamı',              // E
  'POS Satırları',            // F  JSON: [{ label, tutar }]
  'Ana Kasa Toplamı',         // G
  'Ana Kasa Harcamaları',     // H  JSON: [{ ad, tutar }]
  'Günlük Kasa Toplamı',      // I
  'Günlük Kasa Harcamaları',  // J  JSON: [{ ad, tutar }]
  'Cari Toplam',              // K
  'Cari Detay',               // L  JSON: { sabitler: {ad: tutar}, ekstra: [{ad, tutar}] }
  'Yemek Kartı Toplam',       // M
  'Yemek Kartı Detay',        // N  JSON: { kolonlar: [...], tutarlar: {marka: {kolon: tutar}} }
  'Hippos Cirosu',            // O  JSON: { nakit, kart, yemek, cari }
  'Ana Kasa Takibi',          // P  JSON: { dundenDevir, bugunkuNakit, anaKasaHarcama, yarinaDevir }
  'Kaydeden Saat',            // Q
];
const LAST_COL = 'Q';

async function ensureTab(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tabInfo = meta.data.sheets.find((s) => s.properties.title === TAB);
  if (!tabInfo) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
    return;
  }
  // Tab zaten vardı — eski (3 sütunlu) yapıdan geliyorsa başlık satırını yeni haline
  // getir. Sadece A1:Q1 boşsa ya da eskiyse üzerine yazıyoruz, mevcut veri satırlarına
  // dokunmuyoruz (onlar zaten kendi eski formatlarında okunabilir kalıyor).
  const headRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A1:${LAST_COL}1` });
  const currentHeaders = (headRes.data.values || [[]])[0];
  if (currentHeaders.length < HEADERS.length || currentHeaders[1] !== HEADERS[1]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
  }
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
    j(anaKasaHarcamalar),
    gunlukKasaToplam ?? 0,
    j(gunlukKasaHarcamalar),
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
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    if (req.method === 'GET') {
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:${LAST_COL}` });
      const rows = result.data.values || [];
      const records = rows.filter((r) => r[0]).map(rowToRecord);
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const { tarih } = req.body || {};
      if (!tarih) return res.status(400).json({ error: 'tarih gerekli' });
      const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

      // Aynı tarihe ait kayıt varsa üzerine yaz (o gün birden fazla kez kaydedilebilsin diye).
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:A` });
      const rows = existing.data.values || [];
      const idx = rows.findIndex((r) => r[0] === tarih);

      const rowValues = recordToRow(req.body, saat);
      if (idx === -1) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${TAB}!A2`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [rowValues] },
        });
      } else {
        const rowNum = idx + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${TAB}!A${rowNum}:${LAST_COL}${rowNum}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowValues] },
        });
      }
      return res.status(200).json({ ok: true, tarih, saat });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}