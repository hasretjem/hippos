import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = 'Ekmek Kayıtları';
const HEADERS = ['ID', 'Tarih', 'Saat', 'Büyük Beyaz Ekmeği', 'Küçük Beyaz Ekmeği', 'Domatesli/Fesleğenli Ekmeği', 'Küçük Kepek Ekmeği'];

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

function rowToRecord(row) {
  return {
    id: row[0],
    tarih: row[1],
    saat: row[2],
    buyukBeyaz: parseInt(row[3], 10) || 0,
    kucukBeyaz: parseInt(row[4], 10) || 0,
    domatesli: parseInt(row[5], 10) || 0,
    kucukKepek: parseInt(row[6], 10) || 0,
  };
}

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    if (req.method === 'GET') {
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:G` });
      const rows = result.data.values || [];
      const bugun = new Date().toLocaleDateString('tr-TR');
      const records = rows.filter((r) => r[0] && r[1] === bugun).map(rowToRecord).reverse();
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const { buyukBeyaz = 0, kucukBeyaz = 0, domatesli = 0, kucukKepek = 0 } = req.body || {};
      const now = new Date();
      const id = String(Date.now());
      const tarih = now.toLocaleDateString('tr-TR');
      const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[id, tarih, saat, buyukBeyaz, kucukBeyaz, domatesli, kucukKepek]] },
      });
      return res.status(200).json({ record: { id, tarih, saat, buyukBeyaz, kucukBeyaz, domatesli, kucukKepek } });
    }

    if (req.method === 'PUT') {
      const { id, buyukBeyaz = 0, kucukBeyaz = 0, domatesli = 0, kucukKepek = 0 } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id gerekli' });
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:G` });
      const rows = result.data.values || [];
      const idx = rows.findIndex((r) => r[0] === String(id));
      if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });
      const rowNum = idx + 2; // başlık satırı + 1-index
      const tarih = rows[idx][1];
      const saat = rows[idx][2];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!D${rowNum}:G${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[buyukBeyaz, kucukBeyaz, domatesli, kucukKepek]] },
      });
      return res.status(200).json({ record: { id, tarih, saat, buyukBeyaz, kucukBeyaz, domatesli, kucukKepek } });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}