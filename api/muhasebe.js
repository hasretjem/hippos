import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// 4 belge türü — her biri kendi sekmesinde, kendi sütun setiyle.
const BELGE_TIPLERI = {
  alisFaturasi: {
    tab: 'Alış Faturası',
    headers: ['Tarih', 'Saat', 'Tedarikçi/Firma', 'Fatura No', 'Fatura Tarihi', 'Tutar', 'KDV Oranı', 'Ödeme Durumu', 'Açıklama'],
    fields: ['firma', 'faturaNo', 'faturaTarihi', 'tutar', 'kdvOrani', 'odemeDurumu', 'aciklama'],
  },
  satisFaturasi: {
    tab: 'Satış Faturası',
    headers: ['Tarih', 'Saat', 'Cari/Müşteri Firma', 'Fatura No', 'Fatura Tarihi', 'Toplam Tutar', 'KDV Oranı', 'Tahsilat Durumu', 'Açıklama'],
    fields: ['firma', 'faturaNo', 'faturaTarihi', 'tutar', 'kdvOrani', 'tahsilatDurumu', 'aciklama'],
  },
  alisMakbuzu: {
    tab: 'Alış Makbuzu',
    headers: ['Tarih', 'Saat', 'Ödeme Yapılan Firma/Kişi', 'İşlem/Dekont No', 'Ödenen Tutar', 'Ödeme Yöntemi', 'Açıklama'],
    fields: ['firma', 'dekontNo', 'tutar', 'odemeYontemi', 'aciklama'],
  },
  satisMakbuzu: {
    tab: 'Satış Makbuzu',
    headers: ['Tarih', 'Saat', 'Cari/Müşteri', 'Alınan Tutar', 'Tahsilat Yöntemi', 'Açıklama'],
    fields: ['firma', 'tutar', 'tahsilatYontemi', 'aciklama'],
  },
};

async function ensureTab(sheets, tipConfig) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === tipConfig.tab);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tipConfig.tab } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tipConfig.tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [tipConfig.headers] },
    });
  }
}

function lastCol(headers) {
  // A=1 ... basit harf üretici, 26 sütunu aşmayacağımız için yeterli.
  return String.fromCharCode(64 + headers.length);
}

export default async function handler(req, res) {
  try {
    const tip = req.method === 'GET' ? req.query.tip : (req.body || {}).tip;
    if (!tip || !BELGE_TIPLERI[tip]) {
      return res.status(400).json({ error: 'geçersiz belge tipi (alisFaturasi/satisFaturasi/alisMakbuzu/satisMakbuzu)' });
    }
    const tipConfig = BELGE_TIPLERI[tip];
    const col = lastCol(tipConfig.headers);

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets, tipConfig);

    if (req.method === 'GET') {
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tipConfig.tab}!A2:${col}` });
      const rows = result.data.values || [];
      const records = rows
        .filter((r) => r[0])
        .map((r, i) => {
          const rec = { id: i, tarih: r[0], saat: r[1] };
          tipConfig.fields.forEach((f, idx) => { rec[f] = r[idx + 2] ?? ''; });
          return rec;
        });
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const now = new Date();
      const tarih = now.toLocaleDateString('tr-TR');
      const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const rowValues = [tarih, saat, ...tipConfig.fields.map((f) => req.body[f] ?? '')];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${tipConfig.tab}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
      return res.status(200).json({ ok: true, tarih, saat });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}