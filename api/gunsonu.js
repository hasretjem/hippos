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
// Tek satıra tüm gün sonu özetini JSON olarak gömüyoruz (B sütunu) — Excel'deki gibi
// onlarca sütuna dağıtmak yerine, esnek ve ileride alan eklemeyi kolaylaştıran bir yapı.
const HEADERS = ['Tarih', 'JSON', 'KaydedenSaat'];

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

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    if (req.method === 'GET') {
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:C` });
      const rows = result.data.values || [];
      const records = rows
        .filter((r) => r[0] && r[1])
        .map((r) => ({ tarih: r[0], ...JSON.parse(r[1]), kaydedenSaat: r[2] }));
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const { tarih, ...rest } = req.body || {};
      if (!tarih) return res.status(400).json({ error: 'tarih gerekli' });
      const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      // Aynı tarihe ait kayıt varsa üzerine yaz (o gün birden fazla kez kaydedilebilsin diye).
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:C` });
      const rows = existing.data.values || [];
      const idx = rows.findIndex((r) => r[0] === tarih);

      const rowValues = [tarih, JSON.stringify(rest), saat];
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
          range: `${TAB}!A${rowNum}:C${rowNum}`,
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