import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = 'Görünüm Şablonları';
// Sütunlar: A=Ad, B=ButonRengi, C=YaziRengi, D=Italik, E=Ikon

function toBool(v) {
  return String(v || '').trim().toUpperCase() === 'TRUE';
}

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // ---- Sekmeyi kontrol et / gerekirse oluştur ----
    async function ensureTab() {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const exists = meta.data.sheets.some((s) => s.properties.title === TAB);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            requests: [{ addSheet: { properties: { title: TAB } } }],
          },
        });
        // Başlık satırı ekle
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${TAB}!A1:E1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['Ad', 'ButonRengi', 'YaziRengi', 'Italik', 'Ikon']] },
        });
      }
    }

    if (req.method === 'GET') {
      await ensureTab();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2:E`,
      });
      const rows = (result.data.values || []).filter((r) => r[0]);
      const sablonlar = rows.map((r) => ({
        ad: String(r[0] || '').trim(),
        butonRengi: String(r[1] || '').trim() || null,
        butonYaziRengi: String(r[2] || '').trim() || null,
        italik: toBool(r[3]),
        ikon: String(r[4] || '').trim() || null,
      }));
      return res.status(200).json({ sablonlar });
    }

    if (req.method === 'POST') {
      // Tüm şablonları yeniden yaz (basit yaklaşım — şablon sayısı genelde az)
      const { sablonlar = [] } = req.body || {};
      await ensureTab();
      // Önce temizle
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2:E`,
      });
      if (sablonlar.length > 0) {
        const values = sablonlar.map((s) => [
          s.ad || '',
          s.butonRengi || '',
          s.butonYaziRengi || '',
          s.italik ? 'TRUE' : 'FALSE',
          s.ikon || '',
        ]);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${TAB}!A2`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}