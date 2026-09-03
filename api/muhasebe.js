import { google } from 'googleapis';
import AdmZip from 'adm-zip';

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

// ---- Fatura XML İçe Aktarma — Adım 2+3 destek sekmeleri ----
// Log: her başarıyla parse edilen fatura burada "görüldü" olarak işaretlenir
// (gerçek muhasebe kaydından BAĞIMSIZ) — böylece mükerrer zip yüklemesi hemen yakalanır.
const XML_LOG_TAB = { tab: 'Fatura İçe Aktarma Log', headers: ['ID', 'UUID', 'Fatura No', 'Tedarikçi Adı', 'Toplam Tutar', 'Görülme Tarihi'] };
// Kategori sözlüğü artık SABİT DEĞİL — Sheets'te kalıcı, kullanıcı arayüzden yeni
// kategori ekleyebiliyor (en sona eklenir). Bu liste sadece sekme ilk oluşturulurken
// tohumlanan varsayılan kategoriler (api/toptancilar.js TOPTANCI_KATEGORILERI ile aynı).
const VARSAYILAN_KATEGORILER = [
  'Manav', 'Kırmızı Et', 'Tavuk Eti', 'Ambalaj',
  'Baget Ekmek', 'Fırın Ekmeği', 'Kahvaltı ve Sandviç Malzemesi', 'Sulu Yemek Malzemesi',
];
const KATEGORI_TAB = { tab: 'Kategori Sözlüğü', headers: ['ID', 'Kategori Adı', 'Tarih'] };
// Tedarikçi bazlı öğrenen kategori önerisi — fatura seviyesinde varsayılan, ama her
// satır kendi kategorisini (frontend'de) bağımsız değiştirebiliyor.
const TEDARIKCI_TAB = { tab: 'Tedarikçi Kategori Sözlüğü', headers: ['ID', 'Tedarikçi Adı', 'Kategori', 'Tarih'] };
// Öğrenen eşleştirme sözlüğü: tedarikçinin ürün kodu/adı -> kendi malzeme kaydımız.
const ESLESTIRME_TAB = { tab: 'Malzeme Eşleştirme Sözlüğü', headers: ['ID', 'Tedarikçi Adı', 'Ürün Kodu', 'Ürün Adı', 'MalzemeID', 'Malzeme Adı', 'Paket Miktarı', 'Paket Birimi', 'Tarih'] };

async function ensureKategoriSeed(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === KATEGORI_TAB.tab);
  await ensureTab(sheets, KATEGORI_TAB.tab, KATEGORI_TAB.headers);
  if (!exists) {
    const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const satirlar = VARSAYILAN_KATEGORILER.map((k, i) => [String(Date.now() + i), k, tarih]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${KATEGORI_TAB.tab}!A2`, valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS', requestBody: { values: satirlar },
    });
  }
}

async function getRows(sheets, tabConfig) {
  await ensureTab(sheets, tabConfig.tab, tabConfig.headers);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabConfig.tab}!A2:${lastCol(tabConfig.headers)}`,
  });
  return (result.data.values || []).filter((r) => r[0]);
}

async function appendRow(sheets, tabConfig, rowValues) {
  await ensureTab(sheets, tabConfig.tab, tabConfig.headers);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tabConfig.tab}!A2`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [rowValues] },
  });
}

// Tedarikçi/ürün adı eşleştirmede büyük/küçük harf, boşluk ve Türkçe karakter
// farklarının eşleşmeyi bozmaması için normalize eder (recete.js'teki birimNormalize'a benzer).
function metinNormalize(s) {
  return String(s || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
}

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

// ============================================================
// FATURA XML İÇE AKTARMA (UBL-TR e-fatura/e-arşiv parser)
// ADIM 1: Sadece zip'i aç, XML'leri parse et, JSON döndür.
// HİÇBİR YERE YAZMA — amaç veriyi doğru okuduğumuzu doğrulamak.
//
// NOT: Bilinçli olarak ayrı bir api/*.js dosyası DEĞİL — Vercel
// Hobby planında bu projenin fonksiyon limiti 12 ve ayrı dosya
// 13'e çıkarıp deployment'ı "Deploying outputs" aşamasında
// (build log'una hiçbir şey yazmadan) hataya düşürüyordu.
// ============================================================

function xmlGetTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseInvoiceHeader(xml) {
  const id = xmlGetTag(xml, 'cbc:ID');
  const uuid = xmlGetTag(xml, 'cbc:UUID');
  const issueDate = xmlGetTag(xml, 'cbc:IssueDate');
  const typeCode = xmlGetTag(xml, 'cbc:InvoiceTypeCode');

  const supplierBlock = xml.match(/<cac:AccountingSupplierParty>([\s\S]*?)<\/cac:AccountingSupplierParty>/);
  let supplierName = null;
  let supplierVkn = null;
  if (supplierBlock) {
    const nameMatch = supplierBlock[1].match(/<cbc:Name>([^<]*)<\/cbc:Name>/);
    supplierName = nameMatch ? nameMatch[1].trim() : null;
    const vknMatch = supplierBlock[1].match(/<cbc:ID\s+schemeID="(?:VKN|TCKN)">([^<]*)<\/cbc:ID>/);
    supplierVkn = vknMatch ? vknMatch[1].trim() : null;
  }

  const totalBlock = xml.match(/<cac:LegalMonetaryTotal>([\s\S]*?)<\/cac:LegalMonetaryTotal>/);
  let toplamKdvHaric = null, toplamKdvDahil = null, odenecekTutar = null, toplamIskonto = null;
  if (totalBlock) {
    const m1 = totalBlock[1].match(/<cbc:LineExtensionAmount[^>]*>([^<]*)<\/cbc:LineExtensionAmount>/);
    const m2 = totalBlock[1].match(/<cbc:TaxInclusiveAmount[^>]*>([^<]*)<\/cbc:TaxInclusiveAmount>/);
    const m3 = totalBlock[1].match(/<cbc:PayableAmount[^>]*>([^<]*)<\/cbc:PayableAmount>/);
    const m4 = totalBlock[1].match(/<cbc:AllowanceTotalAmount[^>]*>([^<]*)<\/cbc:AllowanceTotalAmount>/);
    toplamKdvHaric = m1 ? Number(m1[1]) : null;
    toplamKdvDahil = m2 ? Number(m2[1]) : null;
    odenecekTutar = m3 ? Number(m3[1]) : null;
    toplamIskonto = m4 ? Number(m4[1]) : null;
  }

  const taxTotalBlock = xml.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
  let toplamKdvTutari = null;
  if (taxTotalBlock) {
    const m = taxTotalBlock[1].match(/<cbc:TaxAmount[^>]*>([^<]*)<\/cbc:TaxAmount>/);
    toplamKdvTutari = m ? Number(m[1]) : null;
  }

  return {
    faturaNo: id, uuid, tarih: issueDate, tip: typeCode,
    tedarikciAdi: supplierName, tedarikciVkn: supplierVkn,
    toplamKdvHaric, toplamKdvDahil, toplamKdvTutari, toplamIskonto, odenecekTutar,
  };
}

const UNIT_CODE_MAP = {
  C62: 'Adet', KGM: 'kg', GRM: 'gr', MGM: 'mg', LTR: 'lt', MLT: 'ml', MTR: 'm', BX: 'Kutu', PA: 'Paket',
};

function parseInvoiceLines(xml) {
  const lineBlocks = xml.match(/<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>/g) || [];
  return lineBlocks.map((block, idx) => {
    const siraNo = xmlGetTag(block, 'cbc:ID') || String(idx + 1);
    const note = xmlGetTag(block, 'cbc:Note');
    const qtyMatch = block.match(/<cbc:InvoicedQuantity\s+unitCode="([^"]*)"[^>]*>([^<]*)<\/cbc:InvoicedQuantity>/);
    const unitCode = qtyMatch ? qtyMatch[1] : null;
    const miktar = qtyMatch ? Number(qtyMatch[2]) : null;

    const lineExtMatch = block.match(/<cbc:LineExtensionAmount[^>]*>([^<]*)<\/cbc:LineExtensionAmount>/);
    const satirTutari = lineExtMatch ? Number(lineExtMatch[1]) : null;

    const priceMatch = block.match(/<cac:Price>[\s\S]*?<cbc:PriceAmount[^>]*>([^<]*)<\/cbc:PriceAmount>/);
    const birimFiyat = priceMatch ? Number(priceMatch[1]) : null;

    const itemBlock = block.match(/<cac:Item>([\s\S]*?)<\/cac:Item>/);
    let urunAdi = null, urunKodu = null;
    if (itemBlock) {
      const nameMatch = itemBlock[1].match(/<cbc:Name>([^<]*)<\/cbc:Name>/);
      urunAdi = nameMatch ? nameMatch[1].trim() : null;
      const kodMatch = itemBlock[1].match(/<cac:SellersItemIdentification>\s*<cbc:ID[^>]*>([^<]*)<\/cbc:ID>/);
      urunKodu = kodMatch ? kodMatch[1].trim() : null;
    }

    const taxBlock = block.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
    let kdvOrani = null, kdvTutari = null;
    if (taxBlock) {
      const percentMatch = taxBlock[1].match(/<cbc:Percent>([^<]*)<\/cbc:Percent>/);
      const amountMatch = taxBlock[1].match(/<cbc:TaxAmount[^>]*>([^<]*)<\/cbc:TaxAmount>/);
      kdvOrani = percentMatch ? Number(percentMatch[1]) : null;
      kdvTutari = amountMatch ? Number(amountMatch[1]) : null;
    }

    const allowanceBlock = block.match(/<cac:AllowanceCharge>([\s\S]*?)<\/cac:AllowanceCharge>/);
    let iskontoOrani = 0, iskontoTutari = 0;
    if (allowanceBlock) {
      const factorMatch = allowanceBlock[1].match(/<cbc:MultiplierFactorNumeric>([^<]*)<\/cbc:MultiplierFactorNumeric>/);
      const amountMatch = allowanceBlock[1].match(/<cbc:Amount[^>]*>([^<]*)<\/cbc:Amount>/);
      iskontoOrani = factorMatch ? Number(factorMatch[1]) * 100 : 0;
      iskontoTutari = amountMatch ? Number(amountMatch[1]) : 0;
    }

    // Tutarlılık kontrolü: miktar × birim fiyat × (1-iskonto) satır tutarını
    // tutmuyorsa satır "şüpheli" işaretlenir — akış durmaz, kullanıcı onay
    // ekranında düzeltir.
    let supheliMiktar = false;
    let hesaplananSatirTutari = null;
    if (miktar != null && birimFiyat != null) {
      hesaplananSatirTutari = miktar * birimFiyat * (1 - iskontoOrani / 100);
      if (satirTutari != null && Math.abs(hesaplananSatirTutari - satirTutari) > 0.5) {
        supheliMiktar = true;
      }
    } else {
      supheliMiktar = true;
    }

    // İSKONTO + KDV: "Birim Fiyat" olarak XML'deki ham cbc:PriceAmount değil, iskonto
    // düşülmüş ve KDV eklenmiş EFEKTİF birim fiyat kullanılıyor — kullanıcının fiilen
    // ödediği, malzeme maliyetine yansıması gereken rakam bu. satirTutari zaten UBL'de
    // iskonto sonrası net (KDV hariç) tutar olduğu için doğrudan miktara bölünüyor.
    const efektifBirimFiyatKdvDahil = (miktar && satirTutari != null)
      ? Math.round(((satirTutari + (kdvTutari || 0)) / miktar) * 100) / 100
      : null;
    const satirTutariKdvDahil = satirTutari != null ? Math.round((satirTutari + (kdvTutari || 0)) * 100) / 100 : null;

    return {
      siraNo, urunAdi, urunKodu, not: note, miktar,
      birimKodu: unitCode,
      birimAdi: UNIT_CODE_MAP[unitCode] || unitCode, // tanımadığımız kodda ham haliyle
      birimFiyat, satirTutari, kdvOrani, kdvTutari, iskontoOrani, iskontoTutari,
      efektifBirimFiyatKdvDahil, satirTutariKdvDahil,
      supheliMiktar,
      hesaplananSatirTutari: hesaplananSatirTutari != null ? Math.round(hesaplananSatirTutari * 100) / 100 : null,
    };
  });
}

function parseFaturaXml(xmlContent) {
  return { ...parseInvoiceHeader(xmlContent), satirlar: parseInvoiceLines(xmlContent) };
}

export default async function handler(req, res) {
  try {
    const resource = req.method === 'GET' ? req.query.resource : (req.body || {}).resource;

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // ---- Fatura XML İçe Aktarma: parse + mükerrer kontrolü + tedarikçi tipi + eşleştirme önerisi ----
    // Fatura Detaylı Giriş / Malzeme Maliyet Geçmişi'ne HÂLÂ hiçbir kayıt yapılmıyor (o Adım 4).
    // Sadece: (1) log sekmesine "görüldü" düşülüyor — mükerrer yakalamak için, (2) tedarikçinin
    // daha önce malzeme/gider olarak sınıflandırılıp sınıflandırılmadığına bakılıyor, (3) malzeme
    // tedarikçileri için satırlar eşleştirme sözlüğünde aranıyor.
    if (resource === 'xmlImport') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const { zipBase64 } = req.body || {};
      if (!zipBase64) return res.status(400).json({ error: 'zipBase64 gerekli' });

      const buffer = Buffer.from(zipBase64, 'base64');
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.xml'));

      if (entries.length === 0) return res.status(400).json({ error: 'Zip içinde .xml dosyası bulunamadı' });

      const faturalar = [];
      const hatalar = [];

      for (const entry of entries) {
        try {
          const xmlContent = entry.getData().toString('utf8');
          const parsed = parseFaturaXml(xmlContent);
          if (!parsed.faturaNo || !parsed.uuid) {
            hatalar.push({ dosya: entry.entryName, hata: 'Fatura no veya UUID okunamadı — beklenmeyen XML yapısı' });
            continue;
          }
          faturalar.push({ dosya: entry.entryName, ...parsed });
        } catch (err) {
          hatalar.push({ dosya: entry.entryName, hata: err.message });
        }
      }

      // Mükerrer kontrolü + tedarikçi sınıflandırma + eşleştirme önerisi — tek seferde okunup
      // her fatura/satır için bellekte eşleştiriliyor (fatura başına ayrı Sheets sorgusu yok).
      const [logRows, tedarikciRows, eslestirmeRows] = await Promise.all([
        getRows(sheets, XML_LOG_TAB),
        getRows(sheets, TEDARIKCI_TAB),
        getRows(sheets, ESLESTIRME_TAB),
      ]);

      const yeniLogSatirlari = [];
      for (const f of faturalar) {
        // --- mükerrer kontrolü (UUID bazlı) ---
        const oncekiGorulme = logRows.find((r) => r[1] === f.uuid);
        f.mukerrer = !!oncekiGorulme;
        f.oncekiGorulmeTarihi = oncekiGorulme ? oncekiGorulme[5] : null;
        if (!oncekiGorulme) {
          const simdi = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
          yeniLogSatirlari.push([String(Date.now()) + Math.floor(Math.random() * 1000), f.uuid, f.faturaNo, f.tedarikciAdi || '', f.toplamKdvDahil ?? '', simdi]);
        }

        // --- tedarikçi kategori önerisi (Toptancılar sayfasındaki mevcut kategori sözlüğü), en son karar geçerli ---
        const tedAdNorm = metinNormalize(f.tedarikciAdi);
        const tedKayitlari = tedarikciRows.filter((r) => metinNormalize(r[1]) === tedAdNorm);
        f.tedarikciKategoriOnerisi = tedKayitlari.length ? tedKayitlari[tedKayitlari.length - 1][2] : null;

        // --- satır bazlı eşleştirme önerisi + varsayılan kategori (satır bazında serbestçe değiştirilebilir) ---
        f.satirlar = f.satirlar.map((s) => {
          const kodNorm = metinNormalize(s.urunKodu);
          const adNorm = metinNormalize(s.urunAdi);
          const eslesen = eslestirmeRows.find((r) => {
            if (metinNormalize(r[1]) !== tedAdNorm) return false;
            if (s.urunKodu && r[2]) return metinNormalize(r[2]) === kodNorm;
            return metinNormalize(r[3]) === adNorm;
          });
          return {
            ...s,
            kategori: f.tedarikciKategoriOnerisi,
            eslesme: eslesen
              ? { malzemeId: eslesen[4], malzemeAdi: eslesen[5], paketMiktar: eslesen[6], paketBirim: eslesen[7] }
              : null,
          };
        });
      }

      // Yeni görülen faturaları log'a yaz (varsa) — tek batch, satır sayısı kadar ayrı append yerine tek istek.
      if (yeniLogSatirlari.length) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${XML_LOG_TAB.tab}!A2`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: yeniLogSatirlari },
        });
      }

      return res.status(200).json({
        ok: true,
        toplamDosya: entries.length,
        basariliFatura: faturalar.length,
        hataliDosya: hatalar.length,
        faturalar,
        hatalar,
      });
    }

    // ---- Kategori sözlüğü (Kategori Sözlüğü sekmesi — sabit değil, kullanıcı ekleyebiliyor) ----
    if (resource === 'kategoriler') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      await ensureKategoriSeed(sheets);
      const rows = await getRows(sheets, KATEGORI_TAB);
      return res.status(200).json({ kategoriler: rows.map((r) => r[1]).filter(Boolean) });
    }

    if (resource === 'kategoriEkle') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { kategori } = req.body || {};
      const temiz = String(kategori || '').trim();
      if (!temiz) return res.status(400).json({ error: 'kategori gerekli' });
      await ensureKategoriSeed(sheets);
      const rows = await getRows(sheets, KATEGORI_TAB);
      const zatenVar = rows.some((r) => metinNormalize(r[1]) === metinNormalize(temiz));
      if (!zatenVar) {
        const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        await appendRow(sheets, KATEGORI_TAB, [String(Date.now()), temiz, tarih]);
      }
      return res.status(200).json({ ok: true, kategori: temiz });
    }

    // ---- Tedarikçi kategori önerisi kaydet (Kategori Sözlüğü'ndeki herhangi bir kategori olabilir) ----
    if (resource === 'tedarikciKategoriKaydet') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tedarikciAdi, kategori } = req.body || {};
      if (!tedarikciAdi || !String(kategori || '').trim()) {
        return res.status(400).json({ error: 'tedarikciAdi ve kategori gerekli' });
      }
      const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      await appendRow(sheets, TEDARIKCI_TAB, [String(Date.now()), tedarikciAdi, kategori, tarih]);
      return res.status(200).json({ ok: true });
    }

    // ---- Malzeme eşleştirme sözlüğüne kayıt/güncelleme ----
    if (resource === 'eslestirmeKaydet') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tedarikciAdi, urunKodu, urunAdi, malzemeId, malzemeAdi, paketMiktar, paketBirim } = req.body || {};
      if (!tedarikciAdi || !urunAdi || !malzemeId) {
        return res.status(400).json({ error: 'tedarikciAdi, urunAdi ve malzemeId gerekli' });
      }
      const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      await appendRow(sheets, ESLESTIRME_TAB, [
        String(Date.now()), tedarikciAdi, urunKodu || '', urunAdi, malzemeId, malzemeAdi || '',
        paketMiktar || '', paketBirim || '', tarih,
      ]);
      return res.status(200).json({ ok: true });
    }

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
        const tarih = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
        // KRİTİK: Number("0,5") -> NaN döner (Türkçe ondalık virgülü) — bu adet/birimFiyat
        // alanları kg/gr/litre gibi ondalıklı miktarlar da taşıyabildiği için virgülü noktaya
        // çevirip ayrıştırıyoruz, yoksa 0,5 gibi bir miktar sessizce 0 kabul edilirdi.
        const adetNum = Number(String(adet).replace(',', '.')) || 0;
        const fiyatNum = Number(String(birimFiyat).replace(',', '.')) || 0;
        const iskNum = parseFloat(String(iskontoOrani).replace(',', '.').replace('%', '')) || 0;
        const kdvNum = parseFloat(String(kdvOrani).replace(',', '.').replace('%', '')) || 0;
        // satirTutari: KDV HARİÇ matrah (adet × birim fiyat, iskonto düşülmüş).
        // kdvTutari: bu matrah üzerinden hesaplanan KDV — ayrı sütunda, toplamda görünsün diye.
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
      const tarih = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
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