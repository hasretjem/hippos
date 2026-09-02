import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const PERSONEL_TAB = 'Personel';
const PERSONEL_HEADERS = ['ID', 'Ad Soyad', 'İşe Başlama Tarihi', 'Maaş', 'Sigortalı', 'Cep No', 'Durum', 'İşten Ayrılma Tarihi', 'Not', 'Eklenme Tarihi'];
const PERSONEL_LAST_COL = 'J';

// Avans/maaş/vs. her ödeme kendi satırında — personel başına sınırsız ödeme geçmişi
// tutulabilsin diye ayrı bir sekme (Personel Ödemeleri) kullanılıyor, tek satıra
// gömülmüyor (aksi halde satır sürekli büyüyen bir JSON'a dönerdi).
const ODEME_TAB = 'Personel Ödemeleri';
const ODEME_HEADERS = ['ID', 'PersonelID', 'Personel Adı', 'Tarih', 'Tutar', 'Tür', 'Açıklama', 'Eklenme Saati'];
const ODEME_LAST_COL = 'H';

async function ensureTabs(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);

  const requests = [];
  if (!existingTitles.includes(PERSONEL_TAB)) requests.push({ addSheet: { properties: { title: PERSONEL_TAB } } });
  if (!existingTitles.includes(ODEME_TAB)) requests.push({ addSheet: { properties: { title: ODEME_TAB } } });
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  }
  if (!existingTitles.includes(PERSONEL_TAB)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${PERSONEL_TAB}!A1`, valueInputOption: 'USER_ENTERED',
      requestBody: { values: [PERSONEL_HEADERS] },
    });
  }
  if (!existingTitles.includes(ODEME_TAB)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${ODEME_TAB}!A1`, valueInputOption: 'USER_ENTERED',
      requestBody: { values: [ODEME_HEADERS] },
    });
  }
}

function rowToPersonel(r) {
  return {
    id: r[0],
    adSoyad: r[1] || '',
    iseBaslamaTarihi: r[2] || '',
    maas: Number(r[3]) || 0,
    sigortali: r[4] === 'Evet',
    cepNo: r[5] || '',
    durum: r[6] || 'aktif', // 'aktif' | 'ayrildi'
    istenAyrilmaTarihi: r[7] || '',
    not: r[8] || '',
    eklenmeTarihi: r[9] || '',
  };
}
function rowToOdeme(r) {
  return { id: r[0], personelId: r[1], personelAdi: r[2], tarih: r[3], tutar: Number(r[4]) || 0, tur: r[5] || '', aciklama: r[6] || '', eklenmeSaati: r[7] || '' };
}

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTabs(sheets);

    const resource = req.query.resource || (req.body || {}).resource || 'personel';

    if (req.method === 'GET') {
      if (resource === 'odemeler') {
        const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ODEME_TAB}!A2:${ODEME_LAST_COL}` });
        const rows = result.data.values || [];
        const records = rows.filter((r) => r[0]).map(rowToOdeme);
        return res.status(200).json({ records });
      }
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${PERSONEL_TAB}!A2:${PERSONEL_LAST_COL}` });
      const rows = result.data.values || [];
      const records = rows.filter((r) => r[0]).map(rowToPersonel);
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      if (resource === 'odeme') {
        const { personelId, personelAdi, tarih, tutar, tur, aciklama } = req.body || {};
        if (!personelId || !tutar) return res.status(400).json({ error: 'personelId ve tutar gerekli' });
        const id = String(Date.now());
        const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
        const rowValues = [id, personelId, personelAdi || '', tarih || new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }), tutar, tur || '', aciklama || '', saat];
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${ODEME_TAB}!A2`, valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS', requestBody: { values: [rowValues] },
        });
        return res.status(200).json({ ok: true, record: rowToOdeme(rowValues) });
      }

      // Yeni personel kaydı
      const { adSoyad, iseBaslamaTarihi, maas, sigortali, cepNo, not: notu } = req.body || {};
      if (!adSoyad) return res.status(400).json({ error: 'adSoyad gerekli' });
      const id = String(Date.now());
      const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const rowValues = [id, adSoyad, iseBaslamaTarihi || '', maas || 0, sigortali ? 'Evet' : 'Hayır', cepNo || '', 'aktif', '', notu || '', tarih];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `${PERSONEL_TAB}!A2`, valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS', requestBody: { values: [rowValues] },
      });
      return res.status(200).json({ ok: true, record: rowToPersonel(rowValues) });
    }

    if (req.method === 'PUT') {
      // Personel bilgisi güncelleme (işten ayrılma, maaş değişikliği vb.)
      const { id, ...patch } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id gerekli' });
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${PERSONEL_TAB}!A2:${PERSONEL_LAST_COL}` });
      const rows = result.data.values || [];
      const idx = rows.findIndex((r) => r[0] === id);
      if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });

      const existing = rowToPersonel(rows[idx]);
      const merged = { ...existing, ...patch };
      const rowValues = [
        merged.id, merged.adSoyad, merged.iseBaslamaTarihi, merged.maas,
        merged.sigortali ? 'Evet' : 'Hayır', merged.cepNo, merged.durum, merged.istenAyrilmaTarihi,
        merged.not, merged.eklenmeTarihi,
      ];
      const rowNum = idx + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `${PERSONEL_TAB}!A${rowNum}:${PERSONEL_LAST_COL}${rowNum}`,
        valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
      });
      return res.status(200).json({ ok: true, record: rowToPersonel(rowValues) });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}