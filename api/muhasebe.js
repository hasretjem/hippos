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
    headers: ['ID', 'Tarih', 'Saat', 'Tedarikçi/Firma', 'Fatura No', 'Fatura Tarihi', 'Tutar', 'KDV Oranı', 'Ödeme Durumu', 'Açıklama'],
    fields: ['firma', 'faturaNo', 'faturaTarihi', 'tutar', 'kdvOrani', 'odemeDurumu', 'aciklama'],
  },
  satisFaturasi: {
    tab: 'Satış Faturası',
    headers: ['ID', 'Tarih', 'Saat', 'Cari/Müşteri Firma', 'Fatura No', 'Fatura Tarihi', 'Toplam Tutar', 'KDV Oranı', 'Tahsilat Durumu', 'Açıklama'],
    fields: ['firma', 'faturaNo', 'faturaTarihi', 'tutar', 'kdvOrani', 'tahsilatDurumu', 'aciklama'],
  },
  alisMakbuzu: {
    tab: 'Alış Makbuzu',
    headers: ['ID', 'Tarih', 'Saat', 'Ödeme Yapılan Firma/Kişi', 'İşlem/Dekont No', 'Ödenen Tutar', 'Ödeme Yöntemi', 'Açıklama'],
    fields: ['firma', 'dekontNo', 'tutar', 'odemeYontemi', 'aciklama'],
  },
  satisMakbuzu: {
    tab: 'Satış Makbuzu',
    headers: ['ID', 'Tarih', 'Saat', 'Cari/Müşteri', 'Alınan Tutar', 'Tahsilat Yöntemi', 'Açıklama'],
    fields: ['firma', 'tutar', 'tahsilatYontemi', 'aciklama'],
  },
};

// Fatura Detaylı Giriş — bir Alış Faturası kaydına bağlı, kalem kalem ürün satırları.
// Her kalem kendi satırında: hangi faturaya ait (faturaId), ürün adı, adet, birim fiyat,
// KDV oranı, iskonto oranı. Fiyat farkı raporlaması ileride bu tablodan beslenecek.
const DETAY_TAB = 'Fatura Detaylı Giriş';
const DETAY_HEADERS = ['ID', 'FaturaID', 'Tedarikçi/Firma', 'Fatura No', 'Tarih', 'Saat', 'Ürün Adı', 'Adet', 'Birim Fiyat', 'KDV Oranı', 'İskonto Oranı', 'KDV Tutarı', 'Satır Tutarı'];
const DETAY_LAST_COL = 'M';

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

function lastCol(headers) {
  return String.fromCharCode(64 + headers.length);
}

function rowToDetay(r) {
  return {
    id: r[0], faturaId: r[1], firma: r[2], faturaNo: r[3], tarih: r[4], saat: r[5],
    urunAdi: r[6] || '', adet: Number(r[7]) || 0, birimFiyat: Number(r[8]) || 0,
    kdvOrani: r[9] || '', iskontoOrani: r[10] || '', kdvTutari: Number(r[11]) || 0, satirTutari: Number(r[12]) || 0,
  };
}

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const resource = req.method === 'GET' ? req.query.resource : (req.body || {}).resource;

    // ---- Fatura Detaylı Giriş (kalem bazlı) ----
    if (resource === 'detay') {
      await ensureTab(sheets, DETAY_TAB, DETAY_HEADERS);

      if (req.method === 'GET') {
        const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${DETAY_TAB}!A2:${DETAY_LAST_COL}` });
        const rows = result.data.values || [];
        let records = rows.filter((r) => r[0]).map(rowToDetay);
        if (req.query.faturaId) records = records.filter((r) => r.faturaId === req.query.faturaId);
        return res.status(200).json({ records });
      }

      if (req.method === 'POST') {
        const { faturaId, firma, faturaNo, urunAdi, adet, birimFiyat, kdvOrani, iskontoOrani } = req.body || {};
        if (!faturaId || !urunAdi) return res.status(400).json({ error: 'faturaId ve urunAdi gerekli' });
        const id = String(Date.now());
        const now = new Date();
        const tarih = now.toLocaleDateString('tr-TR');
        const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const adetNum = Number(adet) || 0;
        const fiyatNum = Number(birimFiyat) || 0;
        const iskNum = parseFloat(String(iskontoOrani).replace('%', '')) || 0;
        const kdvNum = parseFloat(String(kdvOrani).replace('%', '')) || 0;
        const satirTutari = adetNum * fiyatNum * (1 - iskNum / 100);
        const kdvTutari = satirTutari * (kdvNum / 100);
        const rowValues = [id, faturaId, firma || '', faturaNo || '', tarih, saat, urunAdi, adetNum, fiyatNum, kdvOrani || '', iskontoOrani || '', Math.round(kdvTutari * 100) / 100, Math.round(satirTutari * 100) / 100];
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${DETAY_TAB}!A2`, valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS', requestBody: { values: [rowValues] },
        });
        return res.status(200).json({ ok: true, record: rowToDetay(rowValues) });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---- Fatura/Makbuz (4 tip) ----
    const tip = req.method === 'GET' ? req.query.tip : (req.body || {}).tip;
    if (!tip || !BELGE_TIPLERI[tip]) {
      return res.status(400).json({ error: 'geçersiz belge tipi (alisFaturasi/satisFaturasi/alisMakbuzu/satisMakbuzu) ya da resource=detay' });
    }
    const tipConfig = BELGE_TIPLERI[tip];
    const col = lastCol(tipConfig.headers);
    await ensureTab(sheets, tipConfig.tab, tipConfig.headers);

    if (req.method === 'GET') {
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tipConfig.tab}!A2:${col}` });
      const rows = result.data.values || [];
      const records = rows
        .filter((r) => r[0])
        .map((r) => {
          const rec = { id: r[0], tarih: r[1], saat: r[2] };
          tipConfig.fields.forEach((f, idx) => { rec[f] = r[idx + 3] ?? ''; });
          return rec;
        });
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const now = new Date();
      const tarih = now.toLocaleDateString('tr-TR');
      const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const id = String(Date.now());
      const rowValues = [id, tarih, saat, ...tipConfig.fields.map((f) => req.body[f] ?? '')];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${tipConfig.tab}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
      return res.status(200).json({ ok: true, id, tarih, saat });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}