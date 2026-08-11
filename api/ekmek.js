import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 eksik');
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = 'Ekmek Kayıtları';
const HEADERS = ['ID', 'Tarih', 'Saat', 'Büyük Beyaz Ekmeği', 'Küçük Beyaz Ekmeği', 'Domatesli/Fesleğenli Ekmeği', 'Küçük Kepek Ekmeği', 'İşlem Türü'];

async function ensureTab(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1:H1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] },
  });
}

function rowToRecord(row) {
  return {
    id: row[0],
    tarih: row[1],
    saat: row[2],
    buyukBeyaz: Number.parseInt(row[3], 10) || 0,
    kucukBeyaz: Number.parseInt(row[4], 10) || 0,
    domatesli: Number.parseInt(row[5], 10) || 0,
    kucukKepek: Number.parseInt(row[6], 10) || 0,
    islemTuru: row[7] || 'mutfaga_cikis',
  };
}

function calculateStok(records) {
  return records.reduce((stok, record) => {
    const factor = record.islemTuru === 'stok_girisi' ? 1 : -1;
    stok.buyukBeyaz += factor * record.buyukBeyaz;
    stok.kucukBeyaz += factor * record.kucukBeyaz;
    stok.domatesli += factor * record.domatesli;
    stok.kucukKepek += factor * record.kucukKepek;
    return stok;
  }, { buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 });
}

function normalizeBody(body = {}) {
  return {
    buyukBeyaz: Math.max(0, Number.parseInt(body.buyukBeyaz, 10) || 0),
    kucukBeyaz: Math.max(0, Number.parseInt(body.kucukBeyaz, 10) || 0),
    domatesli: Math.max(0, Number.parseInt(body.domatesli, 10) || 0),
    kucukKepek: Math.max(0, Number.parseInt(body.kucukKepek, 10) || 0),
    islemTuru: body.islemTuru || 'mutfaga_cikis',
  };
}

export default async function handler(req, res) {
  try {
    if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID eksik');
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:H` });
    const allRecords = (result.data.values || []).filter((row) => row[0]).map(rowToRecord);

    if (req.method === 'GET') {
      const bugun = new Date().toLocaleDateString('tr-TR');
      return res.status(200).json({
        records: allRecords.filter((record) => record.tarih === bugun).reverse(),
        stok: calculateStok(allRecords),
      });
    }

    if (req.method === 'POST') {
      const body = normalizeBody(req.body);
      if (!['stok_girisi', 'mutfaga_cikis'].includes(body.islemTuru)) {
        return res.status(400).json({ error: 'Geçersiz işlem türü' });
      }
      const miktarlar = {
        buyukBeyaz: body.buyukBeyaz,
        kucukBeyaz: body.kucukBeyaz,
        domatesli: body.domatesli,
        kucukKepek: body.kucukKepek,
      };
      if (Object.values(miktarlar).every((value) => value === 0)) {
        return res.status(400).json({ error: 'En az bir ekmek adedi girilmeli' });
      }
      if (body.islemTuru === 'mutfaga_cikis') {
        const stok = calculateStok(allRecords);
        const insufficient = Object.entries(miktarlar).find(([key, value]) => value > stok[key]);
        if (insufficient) {
          return res.status(400).json({ error: `${insufficient[0]} stoğu yetersiz. Mevcut: ${stok[insufficient[0]]}, istenen: ${insufficient[1]}` });
        }
      }
      const now = new Date();
      const id = String(Date.now());
      const tarih = now.toLocaleDateString('tr-TR');
      const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[id, tarih, saat, body.buyukBeyaz, body.kucukBeyaz, body.domatesli, body.kucukKepek, body.islemTuru]] },
      });
      const record = { id, tarih, saat, ...miktarlar, islemTuru: body.islemTuru };
      return res.status(200).json({ record, stok: calculateStok([...allRecords, record]) });
    }

    if (req.method === 'PUT') {
      const { id, buyukBeyaz = 0, kucukBeyaz = 0, domatesli = 0, kucukKepek = 0 } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id gerekli' });
      const rows = result.data.values || [];
      const idx = rows.findIndex((row) => row[0] === String(id));
      if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });
      const rowNum = idx + 2;
      const tarih = rows[idx][1];
      const saat = rows[idx][2];
      const islemTuru = rows[idx][7] || 'mutfaga_cikis';
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!D${rowNum}:G${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[Number.parseInt(buyukBeyaz, 10) || 0, Number.parseInt(kucukBeyaz, 10) || 0, Number.parseInt(domatesli, 10) || 0, Number.parseInt(kucukKepek, 10) || 0]] },
      });
      return res.status(200).json({ record: { id, tarih, saat, buyukBeyaz: Number.parseInt(buyukBeyaz, 10) || 0, kucukBeyaz: Number.parseInt(kucukBeyaz, 10) || 0, domatesli: Number.parseInt(domatesli, 10) || 0, kucukKepek: Number.parseInt(kucukKepek, 10) || 0, islemTuru } });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Ekmek API hatası:', err);
    return res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
}
