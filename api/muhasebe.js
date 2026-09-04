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

// Tüm ID üretimlerinde kullanılıyor. Salt rakamlardan oluşan uzun ID'ler (örn.
// Date.now() + rastgele ek, 16+ hane) Google Sheets tarafından otomatik olarak
// SAYI'ya çevrilip yuvarlanabiliyor/bilimsel gösterime dönebiliyor (15-16 hane
// güvenli hassasiyet sınırını aşınca). Başına harf koymak Sheets'i bunu her
// zaman METİN olarak saklamaya zorluyor, ID hiçbir zaman bozulmuyor.
function benzersizId() {
  return 'id' + Date.now() + Math.floor(Math.random() * 1000);
}

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
const DETAY_HEADERS = ['ID', 'FaturaID', 'Tedarikçi/Firma', 'Fatura No', 'Tarih', 'Saat', 'Ürün Adı', 'Adet', 'Birim Fiyat', 'KDV Oranı', 'İskonto Oranı', 'KDV Tutarı', 'Satır Tutarı', 'Kategori'];
const DETAY_LAST_COL = 'N';

// ---- Fatura XML İçe Aktarma — Adım 2+3 destek sekmeleri ----
// Log: her başarıyla parse edilen fatura burada "görüldü" olarak işaretlenir
// (gerçek muhasebe kaydından BAĞIMSIZ) — böylece mükerrer zip yüklemesi hemen yakalanır.
const XML_LOG_TAB = { tab: 'Fatura İçe Aktarma Log', headers: ['ID', 'UUID', 'Fatura No', 'Tedarikçi Adı', 'Toplam Tutar', 'Görülme Tarihi'] };
// Kategori sözlüğü artık SABİT DEĞİL — Sheets'te kalıcı, kullanıcı arayüzden yeni
// kategori ekleyebiliyor (en sona eklenir). Bu liste sadece sekme ilk oluşturulurken
// tohumlanan varsayılan kategoriler (api/toptancilar.js TOPTANCI_KATEGORILERI ile aynı).
const VARSAYILAN_KATEGORILER = [
  'Gıda Alışı',
  'Kahvaltı Malzeme Alışı',
  'Tavuk Alışı',
  'Kırmızı Et Alışı',
  'İçecek Alışları',
  'Personel Gideri',
  'Ambalaj Malzeme Alışı',
  'Temizlik Malzemesi Alışı',
  'Fatura ( Elektrik + Su + Dogalgaz + Telefon + İnternet ) Gideri',
  'Diğer Giderler',
  'Kira + Aidat + Otopark Gideri',
  'Vergi + Ssk + Diğer. Giderler',
  'Yemek Kart-Banka Masf.',
];
const KATEGORI_TAB = { tab: 'Kategori Sözlüğü', headers: ['ID', 'Kategori Adı', 'Tarih'] };
// api/recete.js'teki TABS.maliyetGecmisi ile AYNI şema — orada "en güncel fiyat" bu
// tablodan (fatura TARİHİNE göre, kayıt sırasına göre değil) okunuyor. Burada satır
// bazında malzeme eşleştirmesi yapılmış her kalem için bir kayıt düşülüyor, böylece
// Reçeteler sayfası "fiyat bulunamadı" hatası almadan en son fatura fiyatını gösterebiliyor.
const MALIYET_TAB = { tab: 'Malzeme Maliyet Geçmişi', headers: ['ID', 'MalzemeID', 'Malzeme Adı', 'Tarih', 'Miktar', 'Birim', 'Toplam Fiyat', 'Birim Maliyet', 'FaturaID'] };

// XML'den gelen tarih "YYYY-MM-DD", Malzeme Maliyet Geçmişi'ndeki Tarih sütunu ise
// "GG.AA.YYYY" (recete.js'in trTarihiCoz'ünün beklediği format) — dönüştürüyoruz.
function isoToTrTarih(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}
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

// KRİTİK: Sheets'ten okunan hücreler (values.get varsayılan FORMATTED_VALUE modunda)
// sayıları sayfanın yerel biçimine göre METİN olarak döndürür (Türkçe locale'de
// "146,45" — virgüllü, binlik ayıracı '.'). Number("146,45") -> NaN olur ve || 0 ile
// sessizce sıfıra düşer — Fatura Detaylı Giriş'te Adet/Fiyat/Tutar'ın 0 görünmesinin
// nedeni buydu. Bu fonksiyon hem düz sayıları hem Türkçe biçimli metinleri doğru çözer.
function sayiCoz(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  // Virgül varsa Türkçe biçim demektir: '.' binlik ayıracı, ',' ondalık ayıracı
  // (ör. "12.201,00" -> 12201.00). Virgül yoksa '.' zaten ondalık noktasıdır, dokunma.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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
    urunAdi: r[6] || '', adet: sayiCoz(r[7]), birimFiyat: sayiCoz(r[8]),
    kdvOrani: r[9] || '', iskontoOrani: r[10] || '', kdvTutari: sayiCoz(r[11]), satirTutari: sayiCoz(r[12]),
    kategori: r[13] || '',
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

// Şirketin kendi VKN'si — fatura satıcı/alıcı taraflarından hangisinin "biz" olduğunu
// (dolayısıyla alış mı satış mı olduğunu) belirlemek için tek güvenilir yöntem bu.
// XML'deki InvoiceTypeCode alanı hem alış hem satış faturalarında aynı değeri taşıyabildiği
// için (örn. ikisi de "SATIS") ona güvenilemiyor.
const KENDI_VKN = '0851207665';

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

  const customerBlock = xml.match(/<cac:AccountingCustomerParty>([\s\S]*?)<\/cac:AccountingCustomerParty>/);
  let customerName = null;
  let customerVkn = null;
  if (customerBlock) {
    const nameMatch = customerBlock[1].match(/<cbc:Name>([^<]*)<\/cbc:Name>/);
    customerName = nameMatch ? nameMatch[1].trim() : null;
    const vknMatch = customerBlock[1].match(/<cbc:ID\s+schemeID="(?:VKN|TCKN)">([^<]*)<\/cbc:ID>/);
    customerVkn = vknMatch ? vknMatch[1].trim() : null;
  }

  // yon: satıcı biz isek "satis", alıcı biz isek "alis". İkisi de değilse (VKN eşleşmezse)
  // güvenli tarafta kalıp "alis" varsayılıyor — mevcut akış zaten alış için tasarlandı.
  const yon = supplierVkn === KENDI_VKN ? 'satis' : 'alis';

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
    faturaNo: id, uuid, tarih: issueDate, tip: typeCode, yon,
    tedarikciAdi: supplierName, tedarikciVkn: supplierVkn,
    aliciAdi: customerName, aliciVkn: customerVkn,
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
      const descMatch = itemBlock[1].match(/<cbc:Description>([^<]*)<\/cbc:Description>/);
      // Çoğu tedarikçide cbc:Name gerçek ürün adı. Ama bazıları (örn. Beşler Et) buraya
      // ürün KODUNU yazıp asıl adı cbc:Description'a koyuyor — Description doluysa
      // onu tercih ediyoruz, boşsa Name'e düşüyoruz.
      urunAdi = (descMatch && descMatch[1].trim()) ? descMatch[1].trim() : (nameMatch ? nameMatch[1].trim() : null);
      const kodMatch = itemBlock[1].match(/<cac:SellersItemIdentification>\s*<cbc:ID[^>]*>([^<]*)<\/cbc:ID>/);
      urunKodu = kodMatch ? kodMatch[1].trim() : null;
    }

    const taxBlock = block.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
    let kdvOrani = null, kdvTutari = null, taxableAmountXml = null;
    if (taxBlock) {
      const percentMatch = taxBlock[1].match(/<cbc:Percent>([^<]*)<\/cbc:Percent>/);
      const amountMatch = taxBlock[1].match(/<cbc:TaxAmount[^>]*>([^<]*)<\/cbc:TaxAmount>/);
      const taxableMatch = taxBlock[1].match(/<cbc:TaxableAmount[^>]*>([^<]*)<\/cbc:TaxableAmount>/);
      kdvOrani = percentMatch ? Number(percentMatch[1]) : null;
      kdvTutari = amountMatch ? Number(amountMatch[1]) : null;
      taxableAmountXml = taxableMatch ? Number(taxableMatch[1]) : null;
    }

    const allowanceBlock = block.match(/<cac:AllowanceCharge>([\s\S]*?)<\/cac:AllowanceCharge>/);
    let iskontoOrani = 0, iskontoTutari = 0;
    if (allowanceBlock) {
      const factorMatch = allowanceBlock[1].match(/<cbc:MultiplierFactorNumeric>([^<]*)<\/cbc:MultiplierFactorNumeric>/);
      const amountMatch = allowanceBlock[1].match(/<cbc:Amount[^>]*>([^<]*)<\/cbc:Amount>/);
      const baseAmountMatch = allowanceBlock[1].match(/<cbc:BaseAmount[^>]*>([^<]*)<\/cbc:BaseAmount>/);
      iskontoTutari = amountMatch ? Number(amountMatch[1]) : 0;
      const baseAmount = baseAmountMatch ? Number(baseAmountMatch[1]) : null;
      // DÜZELTME: cbc:MultiplierFactorNumeric'in yüzde mi (27.00 = %27) yoksa 0-1 arası
      // bir çarpan mı (0.10 = %10) olduğu TEDARİKÇİYE GÖRE DEĞİŞİYOR — sabit bir kural
      // (×100 ya da ×1) her zaman doğru sonuç vermiyor. En güvenilir yöntem: Amount ve
      // BaseAmount ikisi de gerçek TL tutarı olduğu için, oranlarından (Amount/BaseAmount)
      // gerçek yüzdeyi hesaplamak — bu, tedarikçinin MultiplierFactorNumeric'i nasıl
      // yazdığından tamamen bağımsız ve her koşulda doğru.
      if (baseAmount) {
        iskontoOrani = Math.round((iskontoTutari / baseAmount) * 10000) / 100;
      } else if (factorMatch) {
        const factor = Number(factorMatch[1]);
        iskontoOrani = factor <= 1 ? factor * 100 : factor; // BaseAmount yoksa son çare tahmin
      }
    }

    // NET SATIR TUTARI (KDV hariç, iskonto düşülmüş): iki aday var —
    //  (A) XML'deki TaxableAmount (çoğu tedarikçide doğru KDV matrahı)
    //  (B) LineExtensionAmount - iskontoTutarı (brüt tutardan iskontoyu manuel düşmek)
    // Akaryakıt (ÖTV'li) faturalarda TaxableAmount alanı bazen KDV matrahı değil,
    // BİRİM fiyatı taşıyor (örn. "69.04" — 4125 TL'lik satır için anlamsız bir matrah).
    // Bunu yakalamak için her adayı kdvOrani ile çarpıp gerçek TaxAmount'a en yakın
    // olanı seçiyoruz — kör bir "TaxableAmount her zaman doğrudur" varsayımı yerine.
    const grossMinusDiscount = satirTutari != null ? satirTutari - iskontoTutari : null;
    const tutarli = (aday) => aday != null && kdvOrani != null && kdvTutari != null
      && Math.abs(aday * (kdvOrani / 100) - kdvTutari) <= Math.max(0.5, Math.abs(kdvTutari) * 0.05);
    let netSatirTutari;
    if (tutarli(taxableAmountXml)) netSatirTutari = taxableAmountXml;
    else if (tutarli(grossMinusDiscount)) netSatirTutari = grossMinusDiscount;
    else netSatirTutari = taxableAmountXml ?? grossMinusDiscount ?? satirTutari; // hiçbiri tutmuyorsa son çare

    // Tutarlılık kontrolü: miktar × birim fiyat × (1-iskonto), NET satır tutarını
    // (KDV matrahını) tutmuyorsa satır "şüpheli" işaretlenir.
    let supheliMiktar = false;
    let hesaplananSatirTutari = null;
    if (miktar != null && birimFiyat != null) {
      hesaplananSatirTutari = miktar * birimFiyat * (1 - iskontoOrani / 100);
      if (netSatirTutari != null && Math.abs(hesaplananSatirTutari - netSatirTutari) > 0.5) {
        supheliMiktar = true;
      }
    } else {
      supheliMiktar = true;
    }

    // İSKONTO + KDV: "Birim Fiyat" olarak XML'deki ham cbc:PriceAmount değil, iskonto
    // düşülmüş (netSatirTutari) ve KDV eklenmiş EFEKTİF birim fiyat kullanılıyor —
    // kullanıcının fiilen ödediği, malzeme maliyetine yansıması gereken rakam bu.
    const efektifBirimFiyatKdvDahil = (miktar && netSatirTutari != null)
      ? Math.round(((netSatirTutari + (kdvTutari || 0)) / miktar) * 100) / 100
      : null;
    const satirTutariKdvDahil = netSatirTutari != null ? Math.round((netSatirTutari + (kdvTutari || 0)) * 100) / 100 : null;

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
          yeniLogSatirlari.push([benzersizId(), f.uuid, f.faturaNo, f.tedarikciAdi || '', f.toplamKdvDahil ?? '', simdi]);
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
        await appendRow(sheets, KATEGORI_TAB, [benzersizId(), temiz, tarih]);
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
      await appendRow(sheets, TEDARIKCI_TAB, [benzersizId(), tedarikciAdi, kategori, tarih]);
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
        benzersizId(), tedarikciAdi, urunKodu || '', urunAdi, malzemeId, malzemeAdi || '',
        paketMiktar || '', paketBirim || '', tarih,
      ]);
      return res.status(200).json({ ok: true });
    }

    // ---- ADIM 4a: Alış faturasını onayla ve kaydet ----
    // Alış Faturası (başlık) + her satır için Fatura Detaylı Giriş kaydı oluşturur.
    // Ayrıca eşleştirilmiş (malzemeId'si olan) satırlar için Malzeme Maliyet Geçmişi'ne
    // de kayıt düşer — Reçeteler sayfasının "en güncel fiyat" araması buradan besleniyor.
    if (resource === 'xmlKaydetAlis') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tedarikciAdi, faturaNo, tarih, toplamKdvDahil, toplamKdvTutari, satirlar } = req.body || {};
      if (!tedarikciAdi || !faturaNo || !Array.isArray(satirlar) || satirlar.length === 0) {
        return res.status(400).json({ error: 'tedarikciAdi, faturaNo ve satirlar gerekli' });
      }
      const now = new Date();
      const kayitTarih = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const kayitSaat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

      const faturaId = benzersizId();
      const alisConfig = BELGE_TIPLERI.alisFaturasi;
      await appendRow(sheets, { tab: alisConfig.tab, headers: alisConfig.headers }, [
        faturaId, kayitTarih, kayitSaat, tedarikciAdi, faturaNo, tarih || '',
        toplamKdvDahil ?? '', toplamKdvTutari ?? '', 'Beklemede', 'Uyumsoft XML içe aktarma',
      ]);

      const detaySatirlari = satirlar.map((s) => {
        const id = benzersizId();
        return [
          id, faturaId, tedarikciAdi, faturaNo, kayitTarih, kayitSaat,
          s.urunAdi || '', s.miktar ?? '', s.birimFiyat ?? '', s.kdvOrani ?? '', s.iskontoOrani ?? '',
          s.kdvTutari ?? '', s.satirTutari ?? '', s.kategori || '',
        ];
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `${DETAY_TAB}!A2`, valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS', requestBody: { values: detaySatirlari },
      });

      // Malzeme eşleştirmesi yapılmış satırlar için maliyet geçmişi kaydı.
      // miktar × paketMiktar = bu satırdan elde edilen TOPLAM malzeme birimi miktarı;
      // birim maliyet = satirTutari (KDV dahil) / bu miktar — yani "1 malzeme birimi
      // (örn. 1 kg) bu faturada ne kadara mal oldu".
      const maliyetSatirlari = satirlar
        .filter((s) => s.malzemeId && s.miktar && s.satirTutari != null)
        .map((s) => {
          const paketMiktar = Number(s.paketMiktar) || 1;
          const toplamMalzemeMiktari = Math.round(Number(s.miktar) * paketMiktar * 10000) / 10000;
          const birimMaliyet = toplamMalzemeMiktari > 0 ? Math.round((s.satirTutari / toplamMalzemeMiktari) * 10000) / 10000 : 0;
          return [
            benzersizId(), s.malzemeId, s.malzemeAdi || '', isoToTrTarih(tarih),
            toplamMalzemeMiktari, s.paketBirim || '', s.satirTutari, birimMaliyet, faturaId,
          ];
        });
      if (maliyetSatirlari.length) {
        await ensureTab(sheets, MALIYET_TAB.tab, MALIYET_TAB.headers);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${MALIYET_TAB.tab}!A2`, valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS', requestBody: { values: maliyetSatirlari },
        });
      }

      return res.status(200).json({ ok: true, faturaId });
    }

    // ---- ADIM 4b: Satış faturasını onayla ve kaydet (sadece başlık, satır detayı yok) ----
    if (resource === 'xmlKaydetSatis') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { aliciAdi, faturaNo, tarih, toplamKdvDahil, toplamKdvTutari } = req.body || {};
      if (!aliciAdi || !faturaNo) return res.status(400).json({ error: 'aliciAdi ve faturaNo gerekli' });
      const now = new Date();
      const kayitTarih = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const kayitSaat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
      const faturaId = benzersizId();
      const satisConfig = BELGE_TIPLERI.satisFaturasi;
      await appendRow(sheets, { tab: satisConfig.tab, headers: satisConfig.headers }, [
        faturaId, kayitTarih, kayitSaat, aliciAdi, faturaNo, tarih || '',
        toplamKdvDahil ?? '', toplamKdvTutari ?? '', 'Beklemede', 'Uyumsoft XML içe aktarma',
      ]);
      return res.status(200).json({ ok: true, faturaId });
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
        const { faturaId, firma, faturaNo, urunAdi, adet, birimFiyat, kdvOrani, iskontoOrani, kategori } = req.body || {};
        if (!faturaId || !urunAdi) return res.status(400).json({ error: 'faturaId ve urunAdi gerekli' });
        const id = benzersizId();
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
        const rowValues = [id, faturaId, firma || '', faturaNo || '', tarih, saat, urunAdi, adetNum, fiyatNum, kdvOrani || '', iskontoOrani || '', Math.round(kdvTutari * 100) / 100, Math.round(satirTutari * 100) / 100, kategori || ''];
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
          tipConfig.fields.forEach((f, idx) => {
            const ham = r[idx + 3] ?? '';
            // 'tutar' her zaman parasal bir değer — Sheets'in FORMATTED_VALUE ile
            // döndürdüğü virgüllü metni ("2.334,82") doğru sayıya çeviriyoruz.
            // 'kdvOrani' ise bağlama göre hem yüzde metni ("%20", manuel giriş) hem
            // tutar (XML içe aktarma) olabildiği için DOKUNMUYORUZ.
            rec[f] = f === 'tutar' ? sayiCoz(ham) : ham;
          });
          return rec;
        });
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const now = new Date();
      const tarih = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
      const id = benzersizId();
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