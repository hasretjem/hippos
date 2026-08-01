import { google } from 'googleapis';

function getAuth() {
  // Servis hesabı kimlik bilgileri tek parça base64 olarak tutuluyor — böylece
  // private_key içindeki satır sonları Vercel'in metin kutusunda asla bozulmuyor.
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toUpperCase();
  return s === 'TRUE' || s === 'EVET' || s === '1';
}

function toNum(v, def = 0) {
  if (v === undefined || v === null || v === '') return def;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? def : n;
}

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (req.method === 'GET') {
      const ranges = ['Kategoriler!A2:C', 'Alt Kategoriler!A2:C', 'Ürünler!A2:J'];
      const result = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges });
      const [catRows, subRows, prodRows] = result.data.valueRanges.map((r) => r.values || []);

      const categories = catRows
        .filter((r) => r[0])
        .map((r) => ({ name: String(r[0]).trim(), menuSirasi: toNum(r[1], 50), sabit: toBool(r[2]) }));

      const subcategories = subRows
        .filter((r) => r[0] && r[1])
        .map((r) => ({ kategori: String(r[0]).trim(), name: String(r[1]).trim(), menuSirasi: toNum(r[2], 50) }));

      let counter = 1;
      const products = [];
      prodRows
        .filter((r) => r[0])
        .forEach((r) => {
          const [ad, fiyat, kategori, altKategori, menuSirasi, aktif, sabit, azPorsiyon, azFiyat, gununMenusuKategori] = r;
          const id = 900000 + counter++;
          const isAz = toBool(azPorsiyon) && azFiyat !== undefined && azFiyat !== '';
          products.push({
            id,
            kategori: String(kategori || '').trim(),
            altKategori: String(altKategori || '').trim(),
            ad: String(ad).trim(),
            fiyat: toNum(fiyat, 0),
            durum: toBool(aktif) ? 'AKTIF' : 'PASIF',
            menuSirasi: toNum(menuSirasi, 50),
            sabit: toBool(sabit),
            azPorsiyon: isAz,
            azFiyat: isAz ? toNum(azFiyat, 0) : null,
            parentId: null,
            isAzVariant: false,
            gununMenusuKategori: String(gununMenusuKategori || '').trim() || null,
          });
          if (isAz) {
            products.push({
              id: id + 0.5,
              kategori: String(kategori || '').trim(),
              altKategori: String(altKategori || '').trim(),
              ad: `Az ${String(ad).trim()}`,
              fiyat: toNum(azFiyat, 0),
              durum: toBool(aktif) ? 'AKTIF' : 'PASIF',
              menuSirasi: toNum(menuSirasi, 50),
              sabit: false,
              azPorsiyon: false,
              azFiyat: null,
              parentId: id,
              isAzVariant: true,
            });
          }
        });

      return res.status(200).json({ categories, subcategories, products });
    }

    if (req.method === 'POST') {
      const { products = [], categories = [], subcategories = [] } = req.body || {};

      const catValues = categories.map((c) => [c.name, c.menuSirasi, c.sabit ? 'TRUE' : 'FALSE']);
      const subValues = subcategories.map((s) => [s.kategori, s.name, s.menuSirasi]);
      const mainProducts = products.filter((p) => !p.isAzVariant);
      const prodValues = mainProducts.map((p) => [
        p.ad,
        p.fiyat,
        p.kategori,
        p.altKategori || '',
        p.menuSirasi,
        p.durum !== 'PASIF' ? 'TRUE' : 'FALSE',
        p.sabit ? 'TRUE' : 'FALSE',
        p.azPorsiyon ? 'TRUE' : 'FALSE',
        p.azPorsiyon ? p.azFiyat : '',
        p.gununMenusuKategori || '',
      ]);

      await sheets.spreadsheets.values.batchClear({
        spreadsheetId: SHEET_ID,
        requestBody: { ranges: ['Kategoriler!A2:C', 'Alt Kategoriler!A2:C', 'Ürünler!A2:J'] },
      });
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: 'Kategoriler!A2', values: catValues },
            { range: 'Alt Kategoriler!A2', values: subValues },
            { range: 'Ürünler!A2', values: prodValues },
          ],
        },
      });

      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}