import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Sekme yoksa oluşturur ve başlık satırını yazar (yıl bazlı otomatik arşiv).
async function ensureTab(sheets, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${title}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { fisNo, tarih, saat, tur, masa, toplam, odemeTuru, urunler } = req.body;
    if (!fisNo) return res.status(400).json({ error: 'fisNo gerekli' });

    const year = new Date().getFullYear();
    const fislerTab = `Fişler_${year}`;
    const detayTab = `Fiş Detayları_${year}`;

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    await ensureTab(sheets, fislerTab, ['Fiş No', 'Tarih', 'Saat', 'Tür', 'Masa', 'Toplam', 'Ödeme Türü', 'Kasiyer']);
    await ensureTab(sheets, detayTab, ['Fiş No', 'Ürün', 'Adet', 'Fiyat']);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${fislerTab}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[fisNo, tarih, saat, tur, masa || '', toplam, odemeTuru || '', '']] },
    });

    // Aynı üründen birden fazla satılmışsa adet + toplam fiyat olarak tek satırda birleştirir.
    const grouped = {};
    (urunler || []).forEach((u) => {
      if (!grouped[u.ad]) grouped[u.ad] = { adet: 0, toplam: 0 };
      grouped[u.ad].adet += 1;
      grouped[u.ad].toplam += u.fiyat;
    });
    const detailRows = Object.entries(grouped).map(([ad, g]) => [fisNo, ad, g.adet, g.toplam]);

    if (detailRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${detayTab}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: detailRows },
      });
    }

    res.status(200).json({ ok: true, fisNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}