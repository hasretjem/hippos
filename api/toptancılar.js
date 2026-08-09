import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = 'Toptancılar';
const HEADERS = ['ID', 'Firma Adı', 'Kategori', 'Telefon', 'Yetkili Kişi', 'Adres', 'Not', 'Bakiye', 'Eklenme Tarihi', 'Durum'];
const LAST_COL = 'J';

export const TOPTANCI_KATEGORILERI = [
  'Manav', 'Kırmızı Et', 'Tavuk Eti', 'Ambalaj',
  'Baget Ekmek', 'Fırın Ekmeği', 'Kahvaltı ve Sandviç Malzemesi', 'Sulu Yemek Malzemesi',
];

async function ensureTab(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === TAB);
  if (!exists) {
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
  }
}

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

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    if (req.method === 'GET') {
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:${LAST_COL}` });
      const rows = result.data.values || [];
      const records = rows.filter((r) => r[0]).map(rowToRecord);
      return res.status(200).json({ records, kategoriler: TOPTANCI_KATEGORILERI });
    }

    if (req.method === 'POST') {
      const { firmaAdi, kategori, telefon, yetkiliKisi, adres, not: notu, bakiye } = req.body || {};
      if (!firmaAdi) return res.status(400).json({ error: 'firmaAdi gerekli' });
      const id = String(Date.now());
      const tarih = new Date().toLocaleDateString('tr-TR');
      const rowValues = [id, firmaAdi, kategori || '', telefon || '', yetkiliKisi || '', adres || '', notu || '', bakiye || 0, tarih, 'aktif'];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
      return res.status(200).json({ ok: true, record: rowToRecord(rowValues) });
    }

    if (req.method === 'PUT') {
      const { id, ...patch } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id gerekli' });
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:${LAST_COL}` });
      const rows = result.data.values || [];
      const idx = rows.findIndex((r) => r[0] === id);
      if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });

      const existing = rowToRecord(rows[idx]);
      const merged = { ...existing, ...patch };
      const rowValues = [
        merged.id, merged.firmaAdi, merged.kategori, merged.telefon, merged.yetkiliKisi,
        merged.adres, merged.not, merged.bakiye, merged.eklenmeTarihi, merged.durum,
      ];
      const rowNum = idx + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A${rowNum}:${LAST_COL}${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] },
      });
      return res.status(200).json({ ok: true, record: rowToRecord(rowValues) });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}