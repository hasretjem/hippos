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

// ============================================================
// YENİ MUHASEBE MODÜLÜ (5 sekme): Giderler/Alışlar, Gelirler/Satışlar,
// Toptancılar ve Cari Takibi, Ortaklar Cari Takip, Reçeteler(mevcut).
// Hepsi Sheets tabanlı — realtime yok, sayfa yenilemede güncellenir (kullanıcı kararı).
// ============================================================

// Gelir kategorileri sabit 3 (gider kategorileri gibi kullanıcı tarafından
// genişletilebilir değil — sabit enum, tasarım dokümanında öyle tanımlandı).
const GELIR_KATEGORILERI = [
  'Kurumsal Satış / Catering Faturası',
  'Yemek Kartı Şirket Faturası',
  'Diğer Gelirler',
];

// Giderler sekmesi — 1. sekme. Her satır tek bir harcama/alış kaydı (XML'den gelen
// faturalarda kalem bazlı — aynı faturaya ait kalemler ortak FaturaID paylaşır, UI'da
// bu ID'ye göre TEK satıra gruplanıp gösterilir; kalem detayı ileride ayrı bir sayfada
// kullanılmak üzere Sheets'te saklanmaya devam eder).
// toptanciId doluysa bu gider aynı zamanda o toptancının hareket geçmişine
// borç satırı olarak da düşülür (FIFO bakiye hesabı hareketlerden yapılıyor).
const GIDER_TAB = {
  tab: 'Giderler',
  headers: ['ID', 'Tarih', 'Kategori', 'TedarikciAciklama', 'Tutar', 'KdvOrani', 'OdemeDurumu', 'BelgeNo', 'ToptanciID', 'KayitZamani', 'FaturaID'],
};
const GIDER_LAST_COL = 'K';

function rowToGider(r) {
  return {
    id: r[0], tarih: r[1] || '', kategori: r[2] || '', tedarikciAciklama: r[3] || '',
    tutar: sayiCoz(r[4]), kdvOrani: r[5] || '', odemeDurumu: r[6] || 'Ödendi',
    belgeNo: r[7] || '', toptanciId: r[8] || '', kayitZamani: r[9] || '', faturaId: r[10] || '',
  };
}

// Gelirler sekmesi — 2. sekme. Resmi satış/tabldot/yemek kartı faturaları.
// Günlük perakende ciro (Gün Sonu modülü) ile KARIŞTIRILMAZ, ayrı akış.
const GELIR_TAB = {
  tab: 'Gelirler',
  headers: ['ID', 'Tarih', 'Kategori', 'MusteriFirma', 'FaturaNo', 'Tutar', 'KdvOrani', 'VadeTarihi', 'TahsilatDurumu', 'KayitZamani'],
};
const GELIR_LAST_COL = 'J';

function rowToGelir(r) {
  return {
    id: r[0], tarih: r[1] || '', kategori: r[2] || '', musteriFirma: r[3] || '',
    faturaNo: r[4] || '', tutar: sayiCoz(r[5]), kdvOrani: r[6] || '', vadeTarihi: r[7] || '',
    tahsilatDurumu: r[8] || 'Tahsilat Bekliyor', kayitZamani: r[9] || '',
  };
}

// Toptancı Hareketleri — 3. sekmenin FIFO defteri. 'fatura' (borç, +) veya
// 'odeme' (borcu kapatan, -). Bakiye HER ZAMAN bu tablodan toplanarak hesaplanır,
// Toptancılar sekmesindeki eski 'Bakiye' sütunu artık okunmuyor.
const TOPTANCI_HAREKET_TAB = {
  tab: 'Toptancı Hareketleri',
  headers: ['ID', 'ToptanciID', 'Tarih', 'Tur', 'Tutar', 'Aciklama', 'KaynakGiderID', 'OdemeYontemi', 'KayitZamani'],
};
const TOPTANCI_HAREKET_LAST_COL = 'I';

function rowToToptanciHareket(r) {
  return {
    id: r[0], toptanciId: r[1] || '', tarih: r[2] || '', tur: r[3] || '',
    tutar: sayiCoz(r[4]), aciklama: r[5] || '', kaynakGiderId: r[6] || '',
    odemeYontemi: r[7] || '', kayitZamani: r[8] || '',
  };
}

// Ortaklar Cari Takip — 4. sekme. Dükkanın operasyonel P&L'ini ETKİLEMEZ,
// tamamen ayrı bir defter (ortak kâr payı çekimi / borç-alacak mahsubu).
// yon: 'cekim' (ortağa ödendi/çekildi, borcu artar) | 'yatirim' (ortak dükkana verdi, alacağı artar)
const ORTAK_HAREKET_TAB = {
  tab: 'Ortaklar Hareketleri',
  headers: ['ID', 'OrtakAdi', 'Tarih', 'IslemTuru', 'Yon', 'Tutar', 'KasaBanka', 'Aciklama', 'KayitZamani'],
};
const ORTAK_HAREKET_LAST_COL = 'I';
const ORTAKLAR = ['Hasret Cem Arslan', 'Hasan Arslan'];

function rowToOrtakHareket(r) {
  return {
    id: r[0], ortakAdi: r[1] || '', tarih: r[2] || '', islemTuru: r[3] || '',
    yon: r[4] || '', tutar: sayiCoz(r[5]), kasaBanka: r[6] || '', aciklama: r[7] || '',
    kayitZamani: r[8] || '',
  };
}

// ============================================================
// BANKA / KREDİ KARTI EKSTRESİ (kart-islemlerim.xlsx)
// Giderler ve Gelirler sekmelerinin 2. ve 3. alt sekmelerini besleyen tablo.
// Her satır bankadan gelen HAM bir hareket; sisteme girdikten sonra otomatik
// sınıflandırılır ve mümkünse mevcut kayıtlarla eşleştirilir.
//
// eslesmeDurumu değerleri:
//   'toptanci_odemesi' → GİDEN, tedarikçi Toptancılar'da bulundu; cari hesabına ödeme düşüldü
//   'fatura_bekliyor'  → GİDEN, tedarikçi eşleşmedi; "Faturası Beklenenler" havuzunda
//   'gidere_islendi'   → "Faturası Beklenenler"den manuel olarak Giderler'e aktarıldı
//   'pos_hakedis'      → GELEN, OKC formatlı POS hakediş yatışı
//   'gelir_diger'      → GELEN, OKC dışı (EFT, yemek kartı toplu ödemesi vb.)
//   'yoksayildi'       → kullanıcı bu satırı kapsam dışı bıraktı
//
// islemHash: aynı ekstre iki kez yüklendiğinde MÜKERRER kayıt oluşmasın diye
// tarih+yön+tutar+açıklama'dan üretilen parmak izi.
const EKSTRE_TAB = {
  tab: 'Ekstre Hareketleri',
  headers: ['ID', 'Tarih', 'IslemTuru', 'Yon', 'Tutar', 'Aciklama', 'SaticiAdi', 'SaticiKodu', 'KartTipi', 'IslemHash', 'EslesmeDurumu', 'EslesenToptanciID', 'EslesenKayitID', 'Kategori', 'KayitZamani'],
};
const EKSTRE_LAST_COL = 'O';

function rowToEkstre(r) {
  return {
    id: r[0], tarih: r[1] || '', islemTuru: r[2] || '', yon: r[3] || '',
    tutar: sayiCoz(r[4]), aciklama: r[5] || '', saticiAdi: r[6] || '', saticiKodu: r[7] || '',
    kartTipi: r[8] || '', islemHash: r[9] || '', eslesmeDurumu: r[10] || '',
    eslesenToptanciId: r[11] || '', eslesenKayitId: r[12] || '', kategori: r[13] || '',
    kayitZamani: r[14] || '',
  };
}

// Banka ekstresi Türkçe karaktersiz, kısaltılmış ve satır sonunda şehir/ülke taşır
// ("KOFTECI YUSUF IST SISLI B ISTANBUL TR"). Toptancılar'daki resmi unvanla
// ("KÖFTECİ YUSUF HZR. YEM. ... TİC.A.Ş.") eşleştirmek için ikisini de aynı sadeleştirmeden
// geçirip anlamlı kelimeleri karşılaştırıyoruz.
const TR_ASCII_MAP = { 'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','Ç':'c','Ğ':'g','İ':'i','I':'i','Ö':'o','Ş':'s','Ü':'u' };
function asciiNormalize(s) {
  return String(s || '')
    .split('').map((c) => (TR_ASCII_MAP[c] !== undefined ? TR_ASCII_MAP[c] : c)).join('')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Firma adında ayırt edici olmayan (her unvanda geçen) kelimeler — eşleştirmede atlanır.
const EKSTRE_GURULTU = new Set([
  'istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'tr', 'tur', 'turkiye',
  'ltd', 'sti', 'as', 'a', 's', 'san', 'tic', 've', 'gida', 'sanayi', 'ticaret',
  'ith', 'ihr', 'ent', 'mam', 'hzr', 'yem', 'tmz', 'can', 'hyv', 'kurumsal',
  'hizmetleri', 'hizmet', 'no', 'sube', 'subesi', 'merkez', 'anonim', 'limited', 'sirketi',
]);

function firmaAnlamliKelimeler(ad) {
  return asciiNormalize(ad).split(' ').filter((k) => k.length >= 2 && !EKSTRE_GURULTU.has(k));
}

// İlk anlamlı kelime birebir aynı olmalı; ikinci kelimede kısaltma toleransı var
// ("kaplaner muhendislik" ↔ "kaplaner muh"). Böylece kısaltmalar yakalanırken
// "kasap serkan" ↔ "karizma besler" gibi alakasız çiftler eşleşmez.
function firmaEslesirMi(ekstreAdi, toptanciAdi) {
  const a = firmaAnlamliKelimeler(ekstreAdi);
  const b = firmaAnlamliKelimeler(toptanciAdi);
  if (!a.length || !b.length) return false;
  if (a[0] !== b[0]) return false;
  if (a.length === 1 || b.length === 1) return true;
  return a[1].startsWith(b[1]) || b[1].startsWith(a[1]);
}

// Ekstre açıklamasının sonundaki şehir/ülke kuyruğunu atıp okunabilir satıcı adı üretir.
function saticiAdiCikar(aciklama) {
  let s = String(aciklama || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+(İSTANBUL|ISTANBUL|ANKARA|IZMIR|İZMİR|BURSA|ANTALYA)\s+(TR|TUR)\s*$/i, '');
  s = s.replace(/\s+(TR|TUR)\s*$/i, '');
  return s.trim();
}

// GELEN satırlarda POS hakediş yatışı şu formatta gelir:
// "1101252730007037047-G9221198082-OKC-26351.0" → OKC'den sonrası hakediş tutarı.
function posHakedisMi(aciklama) {
  return /-OKC-/i.test(String(aciklama || ''));
}

// Kart satıcı kodu (MCC) → varsayılan gider kategorisi tahmini. Kullanıcı her zaman
// değiştirebilir; amaç ilk girişte doğru kategoriyi önermek.
const MCC_KATEGORI = {
  '5411': 'Gıda Alışı',            // market / bakkal
  '5422': 'Kırmızı Et Alışı',      // kasap, et ürünleri
  '5499': 'Gıda Alışı',            // muhtelif gıda
  '5451': 'Kahvaltı Malzeme Alışı',// süt ürünleri
  '5462': 'Kahvaltı Malzeme Alışı',// fırın
  '5812': 'Gıda Alışı',            // yemek/restoran tedarik
  '5541': 'Diğer Giderler',        // akaryakıt
  '5542': 'Diğer Giderler',
  '5399': 'Ambalaj Malzeme Alışı', // muhtelif toptan
  '5122': 'Temizlik Malzemesi Alışı',
  '5300': 'Gıda Alışı',
};

// xlsx = zip; sharedStrings kullanan ve kullanmayan (inline t="str") dosyaların ikisini de
// okuyabilmek için ham XML ayrıştırılıyor. Yeni npm bağımlılığı eklemiyoruz — adm-zip zaten var.
function xlsxSatirlariniCoz(zipBuffer) {
  const zip = new AdmZip(zipBuffer);

  const sharedEntry = zip.getEntry('xl/sharedStrings.xml');
  const paylasilanMetinler = [];
  if (sharedEntry) {
    const sx = sharedEntry.getData().toString('utf8');
    const siRe = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRe.exec(sx)) !== null) {
      // Bir <si> içinde birden çok <t> olabilir (zengin metin) — hepsi birleştirilir.
      const parcalar = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlKacisCoz(x[1]));
      paylasilanMetinler.push(parcalar.join(''));
    }
  }

  // İlk çalışma sayfası
  const sheetEntry = zip.getEntry('xl/worksheets/sheet1.xml')
    || zip.getEntries().find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.entryName));
  if (!sheetEntry) return [];
  const sx = sheetEntry.getData().toString('utf8');

  const satirlar = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(sx)) !== null) {
    const hucreler = {};
    const cRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cRe.exec(rm[2])) !== null) {
      const sutun = cm[1];
      const nitelik = cm[3] || '';
      const icerik = cm[4] || '';
      const tipMatch = nitelik.match(/t="([^"]+)"/);
      const tip = tipMatch ? tipMatch[1] : 'n';
      let deger = '';
      if (tip === 'inlineStr') {
        deger = [...icerik.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlKacisCoz(x[1])).join('');
      } else {
        const vMatch = icerik.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        const ham = vMatch ? xmlKacisCoz(vMatch[1]) : '';
        deger = tip === 's' ? (paylasilanMetinler[Number(ham)] ?? '') : ham;
      }
      hucreler[sutun] = deger;
    }
    satirlar.push(hucreler);
  }
  return satirlar;
}

function xmlKacisCoz(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Aynı dosyanın iki kez yüklenmesine karşı satır parmak izi.
function ekstreHash(tarih, yon, tutar, aciklama) {
  const ham = `${tarih}|${yon}|${Number(tutar).toFixed(2)}|${asciiNormalize(aciklama)}`;
  let h = 0;
  for (let i = 0; i < ham.length; i++) {
    h = ((h << 5) - h) + ham.charCodeAt(i);
    h |= 0;
  }
  return 'h' + Math.abs(h).toString(36);
}

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
// KRİTİK: Number("1.034,50") -> NaN (Türkçe biçim) ve Number("1500,50") -> NaN (virgüllü
// ondalık) döner. Frontend'den body ile gelen tutar/oran alanları için — kullanıcı
// virgülle yazarsa sessizce 0'a düşmesin diye ondalikParse ile aynı mantık.
function ondalikParseServer(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Türkçe tarih (GG.AA.YYYY) -> Date, FIFO sıralaması için. api/recete.js'teki
// trTarihiCoz ile aynı mantık, ayrı dosya olduğu için burada da tanımlı.
function trTarihiCozServer(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

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
  // Tam sütun aralığı (A2:<lastCol>) veriliyor — sadece 'A2' gibi açık uçlu range
  // verilirse Sheets API bazen hedef genişliği yanlış tespit edip fazla sütunları
  // sessizce YAZMIYOR (GIDER_TAB'a FaturaID eklendiğinde yaşanan veri kaybının kök nedeni).
  const lc = lastCol(tabConfig.headers);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tabConfig.tab}!A2:${lc}`,
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
    return;
  }
  // KRİTİK: sekme zaten varsa header'a dokunulmuyordu — şema sonradan genişletildiğinde
  // (örn. GIDER_TAB'a FaturaID eklendi) eski sekmenin header'ı kısa kalıyor, values.append
  // bu durumda yeni sütunları mevcut header genişliğinin (A:J gibi) dışında sayıp
  // sessizce YAZMIYOR — veri kaybı fark edilmeden oluşuyordu. Artık mevcut header
  // istenen headers'dan KISAYSA eksik sütun başlıkları tamamlanıyor (mevcut veri/sıra
  // korunuyor, sadece eksik başlıklar ekleniyor).
  const mevcut = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!1:1` });
  const mevcutHeader = (mevcut.data.values && mevcut.data.values[0]) || [];
  if (mevcutHeader.length < headers.length) {
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
    // ---- BİR KERELİK ONARIM (4 Eylül 2026) — FaturaID eksik giden 20 eski Gider satırını
    // BelgeNo'ya (fatura no) göre gruplayıp FaturaID doldurur + eksik Toptancı Hareketleri'ni
    // oluşturur. Bu endpoint tek seferlik kullanım için, iş bitince koddan kaldırılacak.
    if (resource === 'onarimFaturaId') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const giderRows = await getRows(sheets, GIDER_TAB);
      const bozukSatirlar = giderRows.map((r, i) => ({ r, i })).filter(({ r }) => !r[10] && r[7]);
      const gruplar = {};
      bozukSatirlar.forEach(({ r, i }) => {
        const belgeNo = r[7];
        if (!gruplar[belgeNo]) gruplar[belgeNo] = { satirlar: [], tedarikciAdi: (r[3] || '').split(' — ')[0], tarih: r[1] };
        gruplar[belgeNo].satirlar.push(i);
      });

      const TOPTANCILAR_TABCONFIG = { tab: 'Toptancılar', headers: ['ID', 'Firma Adı', 'Kategori', 'Telefon', 'Yetkili Kişi', 'Adres', 'Not', 'Bakiye', 'Eklenme Tarihi', 'Durum'] };
      const toptancilarRows = await getRows(sheets, TOPTANCILAR_TABCONFIG);
      const sonuc = [];

      for (const [belgeNo, grup] of Object.entries(gruplar)) {
        const faturaId = benzersizId();
        // Her satırı yeni FaturaID ile güncelle.
        for (const idx of grup.satirlar) {
          const rowValues = [...giderRows[idx]];
          rowValues[10] = faturaId;
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, range: `${GIDER_TAB.tab}!A${idx + 2}:${GIDER_LAST_COL}${idx + 2}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
          });
        }
        // Toptancı bul/oluştur.
        const tedNorm = metinNormalize(grup.tedarikciAdi);
        let eslesen = toptancilarRows.find((r) => metinNormalize(r[1]) === tedNorm);
        let toptanciId;
        if (eslesen) {
          toptanciId = eslesen[0];
        } else {
          toptanciId = benzersizId();
          const ilkSatir = giderRows[grup.satirlar[0]];
          await appendRow(sheets, TOPTANCILAR_TABCONFIG, [
            toptanciId, grup.tedarikciAdi, ilkSatir[2] || '', '', '', '', 'XML faturadan otomatik oluşturuldu (onarım)', 0, grup.tarih, 'aktif',
          ]);
          toptancilarRows.push([toptanciId, grup.tedarikciAdi]);
        }
        // Gider satırlarına toptanciId'yi de yaz (9. index) + Toptancı Hareketi oluştur.
        let toplamTutar = 0;
        for (const idx of grup.satirlar) {
          const rowValues = [...giderRows[idx]];
          rowValues[8] = toptanciId;
          rowValues[10] = faturaId;
          toplamTutar += sayiCoz(rowValues[4]);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, range: `${GIDER_TAB.tab}!A${idx + 2}:${GIDER_LAST_COL}${idx + 2}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
          });
        }
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await appendRow(sheets, TOPTANCI_HAREKET_TAB, [
          benzersizId(), toptanciId, grup.tarih, 'fatura', Math.round(toplamTutar * 100) / 100, `Fatura No: ${belgeNo}`, faturaId, '', new Date().toISOString(),
        ]);
        sonuc.push({ belgeNo, faturaId, toptanciId, kalemSayisi: grup.satirlar.length, tutar: toplamTutar });
      }
      return res.status(200).json({ ok: true, onarilan: sonuc });
    }

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

    // ---- ADIM 4a-BATCH: Tüm onaylı alış faturalarını tek seferde kaydet ----
    // ÖNCEDEN: FaturaXmlIce her fatura için ayrı xmlKaydetAlis çağrısı yapıyordu.
    // 25 fatura × 4 Sheets isteği = ~100 istek → dakikalık okuma kotası patladı.
    // ARTIK: Tüm faturalar tek body'de gelir; Toptancılar 1 kez okunur, tüm yazma
    // işlemleri 3 toplu append'te tamamlanır (Giderler, Toptancı Hareketleri, Maliyet).
    if (resource === 'xmlKaydetAlisBatch') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { faturalar: gonderilen } = req.body || {};
      if (!Array.isArray(gonderilen) || gonderilen.length === 0) {
        return res.status(400).json({ error: 'faturalar dizisi boş veya eksik' });
      }

      const now = new Date();
      const kayitZamani = now.toISOString();

      // 1) Toptancılar listesini TEK SEFERDE oku — artık fatura başına ayrı sorgu yok.
      const TOPTANCILAR_TABCONFIG = { tab: 'Toptancılar', headers: ['ID', 'Firma Adı', 'Kategori', 'Telefon', 'Yetkili Kişi', 'Adres', 'Not', 'Bakiye', 'Eklenme Tarihi', 'Durum'] };
      const toptancilarRows = await getRows(sheets, TOPTANCILAR_TABCONFIG);
      // Bellekteki kopya — yeni eklenenler burada da izlenir, Sheets'e ikinci kez okunmaz.
      const toptancilarBellek = toptancilarRows.map((r) => ({ id: r[0], ad: r[1], kategori: r[2] }));

      const yeniToptancilarSatirlari = [];
      const giderSatirlariToplu = [];
      const hareketSatirlariToplu = [];
      const maliyetSatirlariToplu = [];
      const faturaIdleri = {};

      for (const f of gonderilen) {
        const { tedarikciAdi, faturaNo, tarih, toplamKdvDahil, satirlar } = f;
        if (!tedarikciAdi || !faturaNo || !Array.isArray(satirlar)) continue;

        const kayitTarih = tarih ? isoToTrTarih(tarih) || tarih : now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const faturaId = benzersizId();
        faturaIdleri[faturaNo] = faturaId;

        // 2) Toptancı ara/oluştur — Sheets'e okuma isteği YAPMA, bellekteki listeyi kullan.
        const tedNorm = metinNormalize(tedarikciAdi);
        let toptanci = toptancilarBellek.find((t) => metinNormalize(t.ad) === tedNorm);
        let toptanciId;
        if (toptanci) {
          toptanciId = toptanci.id;
        } else {
          toptanciId = benzersizId();
          const katSayim = {};
          satirlar.forEach((s) => { if (s.kategori) katSayim[s.kategori] = (katSayim[s.kategori] || 0) + 1; });
          const enSikKategori = Object.entries(katSayim).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
          // Yazma listesine ekle — Sheets'e henüz yazmıyoruz.
          yeniToptancilarSatirlari.push([toptanciId, tedarikciAdi, enSikKategori, '', '', '', 'XML faturadan otomatik oluşturuldu', 0, kayitTarih, 'aktif']);
          // Bellekte de kaydet ki aynı tedarikçinin başka faturasında tekrar oluşturulmasın.
          toptancilarBellek.push({ id: toptanciId, ad: tedarikciAdi, kategori: enSikKategori });
        }

        // 3) Gider satırlarını listeye ekle.
        satirlar.forEach((s) => {
          const id = benzersizId();
          const tutar = Math.round((Number(s.satirTutari) || 0) * 100) / 100;
          giderSatirlariToplu.push([id, kayitTarih, s.kategori || 'Diğer Giderler', `${tedarikciAdi} — ${s.urunAdi || ''}`, tutar, s.kdvOrani ? `%${s.kdvOrani}` : '', 'Ödeme Bekliyor', faturaNo, toptanciId, kayitZamani, faturaId]);
        });

        // 4) Tek borç hareketi.
        const toplamTutar = toplamKdvDahil != null ? Number(toplamKdvDahil) : satirlar.reduce((acc, s) => acc + (Number(s.satirTutari) || 0), 0);
        hareketSatirlariToplu.push([benzersizId(), toptanciId, kayitTarih, 'fatura', Math.round(toplamTutar * 100) / 100, `Fatura No: ${faturaNo}`, faturaId, '', kayitZamani]);

        // 5) Malzeme maliyet geçmişi.
        satirlar.filter((s) => s.malzemeId && s.miktar && s.satirTutari != null).forEach((s) => {
          const paketMiktar = Number(s.paketMiktar) || 1;
          const toplamMalzemeMiktari = Math.round(Number(s.miktar) * paketMiktar * 10000) / 10000;
          const birimMaliyet = toplamMalzemeMiktari > 0 ? Math.round((s.satirTutari / toplamMalzemeMiktari) * 10000) / 10000 : 0;
          maliyetSatirlariToplu.push([benzersizId(), s.malzemeId, s.malzemeAdi || '', isoToTrTarih(tarih), toplamMalzemeMiktari, s.paketBirim || '', s.satirTutari, birimMaliyet, faturaId]);
        });
      }

      // 6) TOPLU YAZMA — her tablo için tek append (Sheets API isteği başına ücretlendirilir,
      //    fatura sayısından bağımsız 4 istek: Toptancılar, Giderler, Hareketler, Maliyet).
      if (yeniToptancilarSatirlari.length) {
        await appendRow(sheets, TOPTANCILAR_TABCONFIG, yeniToptancilarSatirlari[0]);
        // İkiden fazla yeni toptancı varsa tek batch append yapıyoruz.
        if (yeniToptancilarSatirlari.length > 1) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID, range: `${TOPTANCILAR_TABCONFIG.tab}!A2:J`,
            valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
            requestBody: { values: yeniToptancilarSatirlari.slice(1) },
          });
        }
      }
      if (giderSatirlariToplu.length) {
        await ensureTab(sheets, GIDER_TAB.tab, GIDER_TAB.headers);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${GIDER_TAB.tab}!A2:${GIDER_LAST_COL}`,
          valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
          requestBody: { values: giderSatirlariToplu },
        });
      }
      if (hareketSatirlariToplu.length) {
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${TOPTANCI_HAREKET_TAB.tab}!A2:${TOPTANCI_HAREKET_LAST_COL}`,
          valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
          requestBody: { values: hareketSatirlariToplu },
        });
      }
      if (maliyetSatirlariToplu.length) {
        await ensureTab(sheets, MALIYET_TAB.tab, MALIYET_TAB.headers);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${MALIYET_TAB.tab}!A2`,
          valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
          requestBody: { values: maliyetSatirlariToplu },
        });
      }

      return res.status(200).json({
        ok: true,
        kaydedilen: gonderilen.length,
        yeniToptanci: yeniToptancilarSatirlari.length,
        toplamGiderSatiri: giderSatirlariToplu.length,
        faturaIdleri,
      });
    }

    // ---- ADIM 4a (TEK FATURA - eski compat): Alış faturasını onayla ve kaydet ----
    // Bu endpoint tek-fatura çağrıları için korundu; FaturaXmlIce artık batch kullanıyor.
    if (resource === 'xmlKaydetAlis') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tedarikciAdi, faturaNo, tarih, toplamKdvDahil, toplamKdvTutari, satirlar } = req.body || {};
      if (!tedarikciAdi || !faturaNo || !Array.isArray(satirlar) || satirlar.length === 0) {
        return res.status(400).json({ error: 'tedarikciAdi, faturaNo ve satirlar gerekli' });
      }
      const now = new Date();
      const kayitTarih = tarih ? isoToTrTarih(tarih) || tarih : now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const kayitZamani = now.toISOString();
      const faturaId = benzersizId();

      // Tedarikçi adı normalize edilerek Toptancılar sekmesinde KESİN (tam) eşleşme aranır —
      // eşleşme yoksa YENİ bir toptancı kartı OTOMATİK açılır (kullanıcı elle "Yeni Cari Kartı
      // Aç" yapmasa bile XML'den gelen her tedarikçi bir cari kaydına sahip olsun diye — önceden
      // bu durumda hareket sessizce hiç düşmüyordu, borç takipsiz kalıyordu).
      const TOPTANCILAR_TABCONFIG = { tab: 'Toptancılar', headers: ['ID', 'Firma Adı', 'Kategori', 'Telefon', 'Yetkili Kişi', 'Adres', 'Not', 'Bakiye', 'Eklenme Tarihi', 'Durum'] };
      const toptancilarRows = await getRows(sheets, TOPTANCILAR_TABCONFIG);
      const tedNorm = metinNormalize(tedarikciAdi);
      let eslesenToptanci = toptancilarRows.find((r) => metinNormalize(r[1]) === tedNorm);
      let toptanciId;
      if (eslesenToptanci) {
        toptanciId = eslesenToptanci[0];
      } else {
        toptanciId = benzersizId();
        // En sık geçen kategori bu faturanın varsayılan "Ana Harcama Grubu" olarak yazılır.
        const katSayim = {};
        satirlar.forEach((s) => { if (s.kategori) katSayim[s.kategori] = (katSayim[s.kategori] || 0) + 1; });
        const enSikKategori = Object.entries(katSayim).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        await appendRow(sheets, TOPTANCILAR_TABCONFIG, [
          toptanciId, tedarikciAdi, enSikKategori, '', '', '', 'XML faturadan otomatik oluşturuldu', 0, kayitTarih, 'aktif',
        ]);
      }

      // Her satır kendi kategorisiyle ayrı bir Gider kaydı olur — KDV dahil satır tutarı kullanılır.
      // Hepsi AYNI faturaId'yi paylaşır — UI'da fatura başına tek satır olarak gruplanıp gösterilir,
      // kalem detayı (ürün adı vb.) Sheets'te saklı kalır, ileride ayrı bir sayfada kullanılabilir.
      const giderSatirlari = satirlar.map((s) => {
        const id = benzersizId();
        const tutar = Math.round((Number(s.satirTutari) || 0) * 100) / 100;
        return [id, kayitTarih, s.kategori || 'Diğer Giderler', `${tedarikciAdi} — ${s.urunAdi || ''}`, tutar, s.kdvOrani ? `%${s.kdvOrani}` : '', 'Ödeme Bekliyor', faturaNo, toptanciId, kayitZamani, faturaId];
      });
      if (giderSatirlari.length) {
        await ensureTab(sheets, GIDER_TAB.tab, GIDER_TAB.headers);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${GIDER_TAB.tab}!A2:${GIDER_LAST_COL}`, valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS', requestBody: { values: giderSatirlari },
        });
      }

      // Toptancı artık her zaman var (eşleşme yoksa yukarıda otomatik açıldı) — TEK bir borç
      // (fatura) hareketi düşülür, fatura toplamı üzerinden (satır bazında değil, FIFO bakiye
      // tek fatura = tek borç kalemi olarak kapanır).
      {
        const toplamTutar = toplamKdvDahil != null ? Number(toplamKdvDahil) : giderSatirlari.reduce((s, r) => s + r[4], 0);
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await appendRow(sheets, TOPTANCI_HAREKET_TAB, [
          benzersizId(), toptanciId, kayitTarih, 'fatura', Math.round(toplamTutar * 100) / 100, `Fatura No: ${faturaNo}`, faturaId, '', kayitZamani,
        ]);
      }

      // Malzeme eşleştirmesi yapılmış satırlar için maliyet geçmişi kaydı — DEĞİŞMEDİ.
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

    // ---- ADIM 4b: Satış faturasını onayla ve kaydet ----
    // ARTIK Satış Faturası sekmesine DEĞİL — Gelirler sekmesine yazılıyor
    // ("Diğer Gelirler" varsayılan kategori, kullanıcı Giderler XML modalında değiştiremiyor
    // çünkü bu akış alış odaklı — satış faturaları nadiren XML'den geliyor).
    if (resource === 'xmlKaydetSatis') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { aliciAdi, faturaNo, tarih, toplamKdvDahil, toplamKdvTutari } = req.body || {};
      if (!aliciAdi || !faturaNo) return res.status(400).json({ error: 'aliciAdi ve faturaNo gerekli' });
      const now = new Date();
      const kayitTarih = tarih ? isoToTrTarih(tarih) || tarih : now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const kayitZamani = now.toISOString();
      const faturaId = benzersizId();
      await ensureTab(sheets, GELIR_TAB.tab, GELIR_TAB.headers);
      await appendRow(sheets, GELIR_TAB, [
        faturaId, kayitTarih, 'Diğer Gelirler', aliciAdi, faturaNo, toplamKdvDahil ?? 0, '', '', 'Tahsil Edildi', kayitZamani,
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

    // ============================================================
    // YENİ 5 SEKME — Giderler, Gelirler, Toptancı Hareketleri, Ortaklar Hareketleri
    // ============================================================

    // ============================================================
    // EKSTRE — yükleme, listeleme, eşleştirme
    // ============================================================

    // Ekstre listesi. Alt sekmeler bunu filtreleyerek kullanır:
    //   Kredi Kartı & Banka Ekstresi → tüm satırlar
    //   Faturası Beklenenler         → yon=GİDEN & eslesmeDurumu=fatura_bekliyor
    //   Bankaya Yatanlar             → yon=GELEN
    if (resource === 'ekstre') {
      if (req.method === 'GET') {
        const rows = await getRows(sheets, EKSTRE_TAB);
        let records = rows.map(rowToEkstre);
        if (req.query.yon) records = records.filter((r) => r.yon === req.query.yon);
        if (req.query.durum) records = records.filter((r) => r.eslesmeDurumu === req.query.durum);
        return res.status(200).json({ records });
      }
      // Satırın eşleşme durumunu/kategorisini güncelle (manuel müdahale).
      if (req.method === 'PUT') {
        const { id, ...patch } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id gerekli' });
        const rows = await getRows(sheets, EKSTRE_TAB);
        const idx = rows.findIndex((r) => r[0] === id);
        if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });
        const merged = { ...rowToEkstre(rows[idx]), ...patch };
        const rowValues = [
          merged.id, merged.tarih, merged.islemTuru, merged.yon, merged.tutar, merged.aciklama,
          merged.saticiAdi, merged.saticiKodu, merged.kartTipi, merged.islemHash,
          merged.eslesmeDurumu, merged.eslesenToptanciId, merged.eslesenKayitId, merged.kategori, merged.kayitZamani,
        ];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID, range: `${EKSTRE_TAB.tab}!A${idx + 2}:${EKSTRE_LAST_COL}${idx + 2}`,
          valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
        });
        return res.status(200).json({ ok: true, record: rowToEkstre(rowValues) });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Ekstre dosyasını (kart-islemlerim.xlsx) yükle, sınıflandır ve kaydet.
    // Mükerrer satırlar islemHash ile elenir; toptancı eşleşen GİDEN satırlar için
    // ilgili cariye "Kredi Kartı Ödemesi" hareketi düşülür (borç anında azalır).
    if (resource === 'ekstreYukle') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { dosyaBase64 } = req.body || {};
      if (!dosyaBase64) return res.status(400).json({ error: 'dosyaBase64 gerekli' });

      const buffer = Buffer.from(dosyaBase64, 'base64');
      let hamSatirlar;
      try {
        hamSatirlar = xlsxSatirlariniCoz(buffer);
      } catch (e) {
        return res.status(400).json({ error: 'Excel dosyası okunamadı: ' + e.message });
      }
      if (!hamSatirlar.length) return res.status(400).json({ error: 'Dosyada satır bulunamadı' });

      // Başlık satırından sütun harflerini bul — banka farklı sıralama kullanırsa da çalışsın.
      const baslik = hamSatirlar[0];
      const sutunBul = (...adaylar) => {
        for (const [harf, deger] of Object.entries(baslik)) {
          const d = asciiNormalize(deger);
          if (adaylar.some((a) => d === asciiNormalize(a))) return harf;
        }
        return null;
      };
      const cTarih = sutunBul('İşlem Tarihi', 'Tarih');
      const cTur = sutunBul('İşlem Türü', 'Islem Turu');
      const cYon = sutunBul('Gelen-Giden', 'Yon');
      const cTutar = sutunBul('İşlem Tutarı', 'Tutar');
      const cAciklama = sutunBul('Açıklama', 'Aciklama');
      const cSaticiKodu = sutunBul('Satıcı Kodu');
      const cKartTipi = sutunBul('Kart Tipi');
      if (!cTarih || !cYon || !cTutar || !cAciklama) {
        return res.status(400).json({ error: 'Beklenen sütunlar bulunamadı (İşlem Tarihi / Gelen-Giden / İşlem Tutarı / Açıklama)' });
      }

      const mevcutRows = await getRows(sheets, EKSTRE_TAB);
      const mevcutHashler = new Set(mevcutRows.map((r) => r[9]).filter(Boolean));

      const TOPTANCILAR_TABCONFIG = { tab: 'Toptancılar', headers: ['ID', 'Firma Adı', 'Kategori', 'Telefon', 'Yetkili Kişi', 'Adres', 'Not', 'Bakiye', 'Eklenme Tarihi', 'Durum'] };
      const toptancilarRows = await getRows(sheets, TOPTANCILAR_TABCONFIG);

      const now = new Date();
      const kayitZamani = now.toISOString();
      const yeniSatirlar = [];
      const toptanciOdemeleri = [];
      const ozet = { toplam: 0, eklenen: 0, mukerrer: 0, toptanciOdemesi: 0, faturaBekliyor: 0, posHakedis: 0, gelirDiger: 0 };

      for (let i = 1; i < hamSatirlar.length; i++) {
        const h = hamSatirlar[i];
        const tarih = String(h[cTarih] || '').trim();
        if (!tarih) continue;
        ozet.toplam++;

        const yon = String(h[cYon] || '').trim().toLocaleUpperCase('tr');
        const tutar = ondalikParseServer(h[cTutar]);
        const aciklama = String(h[cAciklama] || '').replace(/\s+/g, ' ').trim();
        const islemTuru = String(h[cTur] || '').trim();
        const saticiKodu = cSaticiKodu ? String(h[cSaticiKodu] || '').trim() : '';
        const kartTipi = cKartTipi ? String(h[cKartTipi] || '').trim() : '';

        const hash = ekstreHash(tarih, yon, tutar, aciklama);
        if (mevcutHashler.has(hash)) { ozet.mukerrer++; continue; }
        mevcutHashler.add(hash);

        const gidenMi = yon.includes('GİDEN') || yon.includes('GIDEN');
        const saticiAdi = gidenMi ? saticiAdiCikar(aciklama) : '';

        let eslesmeDurumu = '';
        let eslesenToptanciId = '';
        let kategori = '';

        if (gidenMi) {
          const eslesen = toptancilarRows.find((r) => firmaEslesirMi(saticiAdi, r[1]));
          if (eslesen) {
            eslesmeDurumu = 'toptanci_odemesi';
            eslesenToptanciId = eslesen[0];
            kategori = eslesen[2] || MCC_KATEGORI[saticiKodu] || '';
            ozet.toptanciOdemesi++;
            // Cari borcu azaltan ödeme hareketi — FIFO kapama toptanciHareket POST'unda
            // yapıldığı gibi burada da fatura kapatma yapılmıyor, sadece bakiye düşüyor.
            toptanciOdemeleri.push([
              benzersizId(), eslesen[0], tarih, 'odeme', tutar,
              `Kredi Kartı Ödemesi — ${saticiAdi}`, '', 'Kredi Kartı', kayitZamani,
            ]);
          } else {
            eslesmeDurumu = 'fatura_bekliyor';
            kategori = MCC_KATEGORI[saticiKodu] || '';
            ozet.faturaBekliyor++;
          }
        } else {
          if (posHakedisMi(aciklama)) { eslesmeDurumu = 'pos_hakedis'; ozet.posHakedis++; }
          else { eslesmeDurumu = 'gelir_diger'; ozet.gelirDiger++; }
        }

        yeniSatirlar.push([
          benzersizId(), tarih, islemTuru, gidenMi ? 'GİDEN' : 'GELEN', tutar, aciklama,
          saticiAdi, saticiKodu, kartTipi, hash, eslesmeDurumu, eslesenToptanciId, '', kategori, kayitZamani,
        ]);
        ozet.eklenen++;
      }

      if (yeniSatirlar.length) {
        await ensureTab(sheets, EKSTRE_TAB.tab, EKSTRE_TAB.headers);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${EKSTRE_TAB.tab}!A2:${EKSTRE_LAST_COL}`,
          valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
          requestBody: { values: yeniSatirlar },
        });
      }
      if (toptanciOdemeleri.length) {
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${TOPTANCI_HAREKET_TAB.tab}!A2:${TOPTANCI_HAREKET_LAST_COL}`,
          valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
          requestBody: { values: toptanciOdemeleri },
        });
      }

      return res.status(200).json({ ok: true, ozet });
    }

    // "Faturası Beklenenler" havuzundaki bir satırı Giderler'e aktar (fatura hiç gelmeyecekse
    // ya da fişle kapatılacaksa). Ekstre satırı 'gidere_islendi' olarak işaretlenir.
    if (resource === 'ekstreGidereIsle') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { ekstreId, kategori } = req.body || {};
      if (!ekstreId || !kategori) return res.status(400).json({ error: 'ekstreId ve kategori gerekli' });

      const rows = await getRows(sheets, EKSTRE_TAB);
      const idx = rows.findIndex((r) => r[0] === ekstreId);
      if (idx === -1) return res.status(404).json({ error: 'ekstre kaydı bulunamadı' });
      const kayit = rowToEkstre(rows[idx]);

      const giderId = benzersizId();
      const kayitZamani = new Date().toISOString();
      await appendRow(sheets, GIDER_TAB, [
        giderId, kayit.tarih, kategori, kayit.saticiAdi || kayit.aciklama, kayit.tutar, '',
        'Ödendi', 'Kart Ekstresi', '', kayitZamani, giderId,
      ]);

      const rowValues = [...rows[idx]];
      rowValues[10] = 'gidere_islendi';
      rowValues[12] = giderId;
      rowValues[13] = kategori;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `${EKSTRE_TAB.tab}!A${idx + 2}:${EKSTRE_LAST_COL}${idx + 2}`,
        valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
      });
      return res.status(200).json({ ok: true, giderId });
    }

    // Ciro & Hakediş eşleştirme: Gün Sonu'ndaki POS cirosu ile bankaya yatan OKC
    // hakedişlerini gün gün karşılaştırır, aradaki farkı komisyon adayı olarak döner.
    if (resource === 'hakedisEslestir') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const ekstreRows = await getRows(sheets, EKSTRE_TAB);
      const hakedisler = ekstreRows.map(rowToEkstre).filter((r) => r.eslesmeDurumu === 'pos_hakedis');

      // Gün Sonu Kasa: A=Tarih, E=POS Toplamı
      let gunSonuRows = [];
      try {
        const gs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Gün Sonu Kasa!A2:E' });
        gunSonuRows = gs.data.values || [];
      } catch { gunSonuRows = []; }
      const posByTarih = {};
      gunSonuRows.forEach((r) => {
        const t = String(r[0] || '').trim();
        if (!t) return;
        posByTarih[t] = (posByTarih[t] || 0) + sayiCoz(r[4]);
      });

      // Hakedişler bankaya genelde ERTESİ gün yatar — hem aynı gün hem bir önceki günün
      // POS cirosuyla karşılaştırıp daha yakın olanı eşleştiriyoruz.
      const oncekiGun = (trTarih) => {
        const d = trTarihiCozServer(trTarih);
        if (!d) return null;
        d.setDate(d.getDate() - 1);
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
      };

      const sonuc = hakedisler.map((h) => {
        const ayniGun = posByTarih[h.tarih];
        const dunTarih = oncekiGun(h.tarih);
        const dun = dunTarih ? posByTarih[dunTarih] : undefined;
        let ciroTarihi = null, ciroTutari = null;
        if (ayniGun !== undefined && dun !== undefined) {
          ciroTarihi = Math.abs(ayniGun - h.tutar) <= Math.abs(dun - h.tutar) ? h.tarih : dunTarih;
          ciroTutari = ciroTarihi === h.tarih ? ayniGun : dun;
        } else if (ayniGun !== undefined) { ciroTarihi = h.tarih; ciroTutari = ayniGun; }
        else if (dun !== undefined) { ciroTarihi = dunTarih; ciroTutari = dun; }
        const fark = ciroTutari !== null ? Math.round((ciroTutari - h.tutar) * 100) / 100 : null;
        return { ...h, ciroTarihi, ciroTutari, fark };
      });
      return res.status(200).json({ records: sonuc });
    }

    // ---- Giderler/Alışlar (1. sekme) ----
    if (resource === 'giderler') {
      if (req.method === 'GET') {
        const rows = await getRows(sheets, GIDER_TAB);
        return res.status(200).json({ records: rows.map(rowToGider) });
      }
      if (req.method === 'POST') {
        const { tarih, kategori, tedarikciAciklama, tutar, kdvOrani, odemeDurumu, belgeNo, toptanciId, yeniToptanciAdi } = req.body || {};
        if (!kategori || tutar === undefined || tutar === null || tutar === '') {
          return res.status(400).json({ error: 'kategori ve tutar gerekli' });
        }
        // Tarih artık ZORUNLU — boş tarihli kayıt "Bu Ay" filtresinde hiç görünmediği için
        // kullanıcı açısından kaybolmuş oluyordu. Frontend de boş tarihte kaydet'i kilitliyor.
        if (!tarih) return res.status(400).json({ error: 'tarih gerekli' });
        const id = benzersizId();
        const now = new Date();
        const kayitTarih = tarih;
        const kayitZamani = now.toISOString();
        const tutarNum = ondalikParseServer(tutar);

        // Toptancı Alışı modunda firma kayıtlı değilse yeni cari kartı açılır
        // (İşletme Gideri modunda yeniToptanciAdi hiç gönderilmez, cari oluşmaz).
        let etkinToptanciId = toptanciId || '';
        let yeniToptanciAcildi = false;
        if (!etkinToptanciId && String(yeniToptanciAdi || '').trim()) {
          const TOPTANCILAR_TABCONFIG = { tab: 'Toptancılar', headers: ['ID', 'Firma Adı', 'Kategori', 'Telefon', 'Yetkili Kişi', 'Adres', 'Not', 'Bakiye', 'Eklenme Tarihi', 'Durum'] };
          const tRows = await getRows(sheets, TOPTANCILAR_TABCONFIG);
          const adNorm = metinNormalize(yeniToptanciAdi);
          const mevcut = tRows.find((r) => metinNormalize(r[1]) === adNorm);
          if (mevcut) {
            etkinToptanciId = mevcut[0];
          } else {
            etkinToptanciId = benzersizId();
            yeniToptanciAcildi = true;
            await appendRow(sheets, TOPTANCILAR_TABCONFIG, [
              etkinToptanciId, String(yeniToptanciAdi).trim(), kategori, '', '', '', 'Manuel gider girişinden otomatik oluşturuldu', 0, kayitTarih, 'aktif',
            ]);
          }
        }

        // Manuel eklenen gider tek kalemlik kendi faturası gibi davranır — faturaId = kendi id'si,
        // böylece UI'daki fatura-bazlı gruplama (XML'den gelen çok kalemli faturalarla) tutarlı çalışır.
        const rowValues = [id, kayitTarih, kategori, tedarikciAciklama || '', tutarNum, kdvOrani || '', odemeDurumu || 'Ödendi', belgeNo || '', etkinToptanciId, kayitZamani, id];
        await appendRow(sheets, GIDER_TAB, rowValues);

        // Cari bağlantısı varsa hareket defterine borç (fatura) satırı düş — FIFO bakiye buradan hesaplanır.
        if (etkinToptanciId) {
          await appendRow(sheets, TOPTANCI_HAREKET_TAB, [
            benzersizId(), etkinToptanciId, kayitTarih, 'fatura', tutarNum, tedarikciAciklama || kategori, id, '', kayitZamani,
          ]);
        }
        return res.status(200).json({ ok: true, record: rowToGider(rowValues), yeniToptanciAcildi });
      }
      if (req.method === 'PUT') {
        const { id, ...patch } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id gerekli' });
        const rows = await getRows(sheets, GIDER_TAB);
        const idx = rows.findIndex((r) => r[0] === id);
        if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });
        const mevcut = rowToGider(rows[idx]);
        const merged = { ...mevcut, ...patch };
        const rowValues = [merged.id, merged.tarih, merged.kategori, merged.tedarikciAciklama, merged.tutar, merged.kdvOrani, merged.odemeDurumu, merged.belgeNo, merged.toptanciId, merged.kayitZamani, merged.faturaId];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID, range: `${GIDER_TAB.tab}!A${idx + 2}:${GIDER_LAST_COL}${idx + 2}`,
          valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
        });
        return res.status(200).json({ ok: true, record: rowToGider(rowValues) });
      }
      // Toplu güncelleme — aynı faturaId'ye ait TÜM satırların ödeme durumunu birlikte değiştirir
      // (Toptancılar sekmesinden "Ödeme Yap" sonrası, ya da manuel toplu işaretleme için).
      if (req.method === 'PATCH') {
        const { faturaId, odemeDurumu } = req.body || {};
        if (!faturaId || !odemeDurumu) return res.status(400).json({ error: 'faturaId ve odemeDurumu gerekli' });
        const rows = await getRows(sheets, GIDER_TAB);
        const eslesenIdx = rows.map((r, i) => ({ r, i })).filter(({ r }) => r[10] === faturaId);
        for (const { r, i } of eslesenIdx) {
          const rowValues = [...r];
          rowValues[6] = odemeDurumu;
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, range: `${GIDER_TAB.tab}!A${i + 2}:${GIDER_LAST_COL}${i + 2}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
          });
        }
        return res.status(200).json({ ok: true, guncellenen: eslesenIdx.length });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---- Gelirler/Satışlar (2. sekme) ----
    if (resource === 'gelirler') {
      if (req.method === 'GET') {
        const rows = await getRows(sheets, GELIR_TAB);
        return res.status(200).json({ records: rows.map(rowToGelir), kategoriler: GELIR_KATEGORILERI });
      }
      if (req.method === 'POST') {
        const { tarih, kategori, musteriFirma, faturaNo, tutar, kdvOrani, vadeTarihi, tahsilatDurumu } = req.body || {};
        if (!kategori || !musteriFirma || tutar === undefined || tutar === null || tutar === '') {
          return res.status(400).json({ error: 'kategori, musteriFirma ve tutar gerekli' });
        }
        // Tarih zorunlu (boş tarihli kayıt "Bu Ay" filtresinde görünmez olurdu).
        if (!tarih) return res.status(400).json({ error: 'tarih gerekli' });
        const id = benzersizId();
        const now = new Date();
        const kayitTarih = tarih;
        const kayitZamani = now.toISOString();
        const rowValues = [id, kayitTarih, kategori, musteriFirma, faturaNo || '', ondalikParseServer(tutar), kdvOrani || '', vadeTarihi || '', tahsilatDurumu || 'Tahsilat Bekliyor', kayitZamani];
        await appendRow(sheets, GELIR_TAB, rowValues);
        return res.status(200).json({ ok: true, record: rowToGelir(rowValues) });
      }
      if (req.method === 'PUT') {
        const { id, ...patch } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id gerekli' });
        const rows = await getRows(sheets, GELIR_TAB);
        const idx = rows.findIndex((r) => r[0] === id);
        if (idx === -1) return res.status(404).json({ error: 'kayıt bulunamadı' });
        const mevcut = rowToGelir(rows[idx]);
        const merged = { ...mevcut, ...patch };
        const rowValues = [merged.id, merged.tarih, merged.kategori, merged.musteriFirma, merged.faturaNo, merged.tutar, merged.kdvOrani, merged.vadeTarihi, merged.tahsilatDurumu, merged.kayitZamani];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID, range: `${GELIR_TAB.tab}!A${idx + 2}:${GELIR_LAST_COL}${idx + 2}`,
          valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues] },
        });
        return res.status(200).json({ ok: true, record: rowToGelir(rowValues) });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---- Toptancı Hareketleri (3. sekme — FIFO defteri) ----
    if (resource === 'toptanciHareket') {
      if (req.method === 'GET') {
        const rows = await getRows(sheets, TOPTANCI_HAREKET_TAB);
        let records = rows.map(rowToToptanciHareket);
        if (req.query.toptanciId) records = records.filter((r) => r.toptanciId === req.query.toptanciId);
        return res.status(200).json({ records });
      }
      // Manuel ödeme kaydı — 'odeme' türünde, tutar borcu azaltır. FIFO kapama: bu toptancının
      // Giderler'deki "Ödeme Bekliyor" faturaları (faturaId bazında gruplu) tarihe göre en eskiden
      // başlanarak, ödenen tutar tükenene kadar "Ödendi" işaretlenir — kısmi ödeme, son kapanan
      // faturanın kısmen ödenmiş kalmasına neden olabilir (bir sonraki ödemede devam eder).
      if (req.method === 'POST') {
        const { toptanciId, tarih, tutar, odemeYontemi, aciklama } = req.body || {};
        if (!toptanciId || tutar === undefined || tutar === null || tutar === '') {
          return res.status(400).json({ error: 'toptanciId ve tutar gerekli' });
        }
        const id = benzersizId();
        const now = new Date();
        const kayitTarih = tarih || now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const kayitZamani = now.toISOString();
        const odemeTutari = ondalikParseServer(tutar);
        const rowValues = [id, toptanciId, kayitTarih, 'odeme', odemeTutari, aciklama || '', '', odemeYontemi || '', kayitZamani];
        await appendRow(sheets, TOPTANCI_HAREKET_TAB, rowValues);

        // FIFO kapama — bu toptancının Giderler'deki bekleyen faturalarını (faturaId bazında
        // gruplu tutar) tarihe göre eskiden yeniye sırala, ödenen tutar tükenene kadar "Ödendi" yap.
        const giderRows = await getRows(sheets, GIDER_TAB);
        const bekleyenFaturalar = {}; // faturaId -> { tutar, satirIdxleri: [], tarih }
        giderRows.forEach((r, i) => {
          if (r[8] !== toptanciId || r[6] !== 'Ödeme Bekliyor') return;
          const faturaId = r[10] || r[0];
          if (!bekleyenFaturalar[faturaId]) bekleyenFaturalar[faturaId] = { tutar: 0, satirIdxleri: [], tarih: r[1] };
          bekleyenFaturalar[faturaId].tutar += sayiCoz(r[4]);
          bekleyenFaturalar[faturaId].satirIdxleri.push(i);
        });
        const siraliFaturalar = Object.entries(bekleyenFaturalar).sort((a, b) => {
          const ta = trTarihiCozServer(a[1].tarih), tb = trTarihiCozServer(b[1].tarih);
          return (ta?.getTime() || 0) - (tb?.getTime() || 0);
        });
        let kalanOdeme = odemeTutari;
        const kapatilanSatirIdx = [];
        for (const [, fatura] of siraliFaturalar) {
          if (kalanOdeme < fatura.tutar - 0.01) break; // tam kapanmıyorsa dur (kısmi ödeme sıradaki turda devam eder)
          kalanOdeme = Math.round((kalanOdeme - fatura.tutar) * 100) / 100;
          kapatilanSatirIdx.push(...fatura.satirIdxleri);
        }
        for (const idx of kapatilanSatirIdx) {
          const rowValues2 = [...giderRows[idx]];
          rowValues2[6] = 'Ödendi';
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, range: `${GIDER_TAB.tab}!A${idx + 2}:${GIDER_LAST_COL}${idx + 2}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [rowValues2] },
          });
        }

        return res.status(200).json({ ok: true, record: rowToToptanciHareket(rowValues), kapatilanFaturaSayisi: kapatilanSatirIdx.length });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---- Ortaklar Hareketleri (4. sekme) ----
    if (resource === 'ortakHareket') {
      if (req.method === 'GET') {
        const rows = await getRows(sheets, ORTAK_HAREKET_TAB);
        let records = rows.map(rowToOrtakHareket);
        if (req.query.ortakAdi) records = records.filter((r) => r.ortakAdi === req.query.ortakAdi);
        return res.status(200).json({ records, ortaklar: ORTAKLAR });
      }
      if (req.method === 'POST') {
        const { ortakAdi, tarih, islemTuru, yon, tutar, kasaBanka, aciklama } = req.body || {};
        if (!ortakAdi || !yon || tutar === undefined || tutar === null || tutar === '') {
          return res.status(400).json({ error: 'ortakAdi, yon ve tutar gerekli' });
        }
        const id = benzersizId();
        const now = new Date();
        const kayitTarih = tarih || now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const kayitZamani = now.toISOString();
        const rowValues = [id, ortakAdi, kayitTarih, islemTuru || 'Diğer', yon, ondalikParseServer(tutar), kasaBanka || '', aciklama || '', kayitZamani];
        await appendRow(sheets, ORTAK_HAREKET_TAB, rowValues);
        return res.status(200).json({ ok: true, record: rowToOrtakHareket(rowValues) });
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