import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = 'Ekmek Stok';
// Her satır bir HAREKET (ekleme veya düşme) — toplam stok bu hareketlerin toplamından
// hesaplanır. Tek bir "güncel adet" hücresi tutmuyoruz ki geçmiş her zaman denetlenebilsin.
const HEADERS = ['ID', 'Tarih', 'Saat', 'Tür', 'Değişim', 'Kaynak', 'Açıklama'];
const LAST_COL = 'G';

// Ürün key'i -> okunabilir isim (Sheets'te "Tür" sütununda bu görünür).
const TUR_ISIMLERI = {
  buyukBeyaz: 'Büyük Beyaz Ekmek',
  kucukBeyaz: 'Küçük Beyaz Ekmek',
  domatesli: 'Domatesli/Fesleğenli Ekmek',
  kucukKepek: 'Küçük Kepek Ekmeği',
};

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
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:${LAST_COL}` });
      const rows = (result.data.values || []).filter((r) => r[0]);

      const stok = { buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 };
      rows.forEach((r) => {
        const tur = r[3];
        const degisim = Number(r[4]) || 0;
        if (tur in stok) stok[tur] += degisim;
      });
      Object.keys(stok).forEach((k) => { if (stok[k] < 0) stok[k] = 0; });

      return res.status(200).json({ stok });
    }

    if (req.method === 'POST') {
      const { hareketler } = req.body || {};
      if (!Array.isArray(hareketler) || hareketler.length === 0) {
        return res.status(400).json({ error: 'hareketler (array) gerekli' });
      }

      const now = new Date();
      const tarih = now.toLocaleDateString('tr-TR');
      const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      const rowValues = hareketler
        .filter((h) => h.tur && Number(h.degisim) !== 0)
        .map((h, i) => [
          String(Date.now() + i),
          tarih,
          saat,
          h.tur,
          Number(h.degisim) || 0,
          h.kaynak || '',
          h.aciklama || TUR_ISIMLERI[h.tur] || '',
        ]);

      if (rowValues.length === 0) return res.status(200).json({ ok: true });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rowValues },
      });

      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:${LAST_COL}` });
      const rows = (result.data.values || []).filter((r) => r[0]);
      const stok = { buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 };
      rows.forEach((r) => {
        const tur = r[3];
        const degisim = Number(r[4]) || 0;
        if (tur in stok) stok[tur] += degisim;
      });
      Object.keys(stok).forEach((k) => { if (stok[k] < 0) stok[k] = 0; });

      return res.status(200).json({ ok: true, stok });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}