import { google } from 'googleapis';

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ---- 4 sekme: malzeme havuzu, malzeme fiyat geçmişi, reçete başlıkları, reçete kalemleri.
// Hepsi Sheets'te — Supabase'e SADECE satış anındaki maliyet snapshot'ı yazılıyor (sold_items).
const TABS = {
  malzeme: {
    tab: 'Malzeme Havuzu',
    headers: ['ID', 'Malzeme Adı', 'Birim', 'Aktif', 'Oluşturulma Tarihi'],
  },
  maliyetGecmisi: {
    tab: 'Malzeme Maliyet Geçmişi',
    headers: ['ID', 'MalzemeID', 'Malzeme Adı', 'Tarih', 'Miktar', 'Birim', 'Toplam Fiyat', 'Birim Maliyet', 'FaturaID'],
  },
  receteGecmisi: {
    tab: 'Reçete Geçmişi',
    headers: ['ID', 'ÜrünID', 'Ürün Adı', 'Versiyon', 'Aktif', 'Başlangıç Tarihi', 'Bitiş Tarihi'],
  },
  receteKalemleri: {
    tab: 'Reçete Kalemleri',
    headers: ['ID', 'ReceteID', 'MalzemeID', 'Malzeme Adı', 'Miktar', 'Birim'],
  },
};

// Birim dönüşüm — sadece kg<->gr ve litre<->ml otomatik dönüşür, adet dönüştürülemez.
const BIRIM_KATSAYI = { gr: 1, kg: 1000, ml: 1, litre: 1000, adet: null, porsiyon: null };
function ayniAileMi(a, b) {
  const agirlik = ['gr', 'kg'];
  const hacim = ['ml', 'litre'];
  return (agirlik.includes(a) && agirlik.includes(b)) || (hacim.includes(a) && hacim.includes(b));
}
// KRİTİK: Number("0,04") -> NaN döner (Türkçe ondalık virgülü JS'in anlamadığı format).
// Bu, "0,04 kg girince 0 kabul ediliyor" hatasının gerçek kaynağıydı — hem burada (Sheets'e
// yazarken) hem frontend'de (Reçeteler/Fatura Detaylı Giriş miktar input'larında) TEK bir
// güvenli ayrıştırıcı kullanılıyor: virgülü noktaya çevirip Number()'a veriyoruz.
function ondalikParse(deger) {
  if (deger === '' || deger === null || deger === undefined) return 0;
  if (typeof deger === 'number') return deger;
  let s = String(deger).trim();
  // Virgül varsa Türkçe biçim demektir: '.' binlik ayıracı, ',' ondalık ayıracı
  // (ör. "12.201,00" -> 12201.00). Virgül yoksa '.' zaten ondalık noktasıdır, dokunma.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
// birimMaliyet: kaynak birim başına TL (ör. kg başına). hedefBirim: reçetede kullanılan birim.
// Döner: hedef birim başına TL. BIRIM_KATSAYI = "1 [birim] kaç TEMEL birime eşit" (kg=1000 gr,
// litre=1000 ml). TL/kaynakBirim -> önce TEMEL birime böl, sonra hedef birime çarp.
// Örnek: 400 TL/kg -> gr'a çevir: (400 / 1000) * 1 = 0.4 TL/gr (kritik: BÖLME işlemi, çarpma değil).
// Kaynak/hedef birim string'leri de trim+lowercase ile normalize ediliyor — Sheets'ten "Kg",
// " kg " gibi boşluklu/büyük harfli gelirse eşleşme bozulmasın diye.
function birimNormalize(b) {
  return String(b || '').trim().toLocaleLowerCase('tr');
}
function birimMaliyetiCevir(birimMaliyet, kaynakBirim, hedefBirim) {
  const k = birimNormalize(kaynakBirim);
  const h = birimNormalize(hedefBirim);
  if (k === h) return birimMaliyet;
  if (!ayniAileMi(k, h)) return null; // adet gibi dönüştürülemeyen birimler
  const kaynakKatsayi = BIRIM_KATSAYI[k];
  const hedefKatsayi = BIRIM_KATSAYI[h];
  return (birimMaliyet / kaynakKatsayi) * hedefKatsayi;
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

function rowToMalzeme(r) {
  return { id: r[0], ad: r[1] || '', birim: r[2] || '', aktif: r[3] !== 'FALSE', olusturulmaTarihi: r[4] || '' };
}
function rowToMaliyet(r) {
  return {
    id: r[0], malzemeId: r[1], malzemeAdi: r[2] || '', tarih: r[3] || '',
    miktar: ondalikParse(r[4]), birim: r[5] || '', toplamFiyat: ondalikParse(r[6]),
    birimMaliyet: ondalikParse(r[7]), faturaId: r[8] || '',
  };
}
function rowToRecete(r) {
  return { id: r[0], urunId: r[1], urunAdi: r[2] || '', versiyon: Number(r[3]) || 1, aktif: r[4] !== 'FALSE', baslangic: r[5] || '', bitis: r[6] || '' };
}
function rowToKalem(r) {
  return { id: r[0], receteId: r[1], malzemeId: r[2], malzemeAdi: r[3] || '', miktar: ondalikParse(r[4]), birim: r[5] || '' };
}

// "GG.AA.YYYY" formatındaki (toLocaleDateString('tr-TR') çıktısı) tarihi Date'e çevirir.
// Geçersiz/boş tarih için null döner (öyle kayıtlar sıralamada en sona düşer, ID'ye göre yedeklenir).
function trTarihiCoz(tarihStr) {
  if (!tarihStr) return null;
  const parcalar = tarihStr.split('.');
  if (parcalar.length !== 3) return null;
  const [gun, ay, yil] = parcalar.map(Number);
  if (!gun || !ay || !yil) return null;
  return new Date(yil, ay - 1, gun).getTime();
}

// Bir malzemenin GÜNCEL birim maliyetini bulur. KRİTİK: "en güncel" burada FATURA TARİHİNE
// (Malzeme Maliyet Geçmişi'ndeki "Tarih" sütunu — kullanıcının fatura girerken belirttiği
// alış tarihi) göre belirlenir, SİSTEME KAYIT SIRASINA (ID = Date.now(), yani "ne zaman
// girildi") göre DEĞİL. Sebep: bir fatura geç girilebilir — örneğin 20 Ağustos'ta satış
// yapıldıktan SONRA, 5 Ağustos tarihli unutulmuş bir fatura sisteme eklenirse, bu geç giriş
// ID olarak en büyük (en son eklenen) olur ama TARİH olarak eskidir — ID'ye göre sıralasaydık
// yanlışlıkla "en güncel" sayılıp yanlış maliyeti güncel maliyet gibi gösterirdi. Tarihe göre
// sıralamak bu riski ortadan kaldırır: en yüksek (en yakın/geleceğe en yakın) TARİHLİ kayıt
// kazanır. Aynı tarihte birden fazla kayıt varsa (aynı gün 2 fatura girilmişse), ikincil
// kriter olarak ID (girilme sırası) kullanılır — o gün içindeki EN SON girilen kazanır.
async function guncelMalzemeMaliyeti(sheets, malzemeId) {
  const rows = await getRows(sheets, TABS.maliyetGecmisi);
  const kayitlar = rows.map(rowToMaliyet).filter((k) => k.malzemeId === String(malzemeId));
  if (kayitlar.length === 0) return null; // ⚠️ Maliyet bilgisi bulunamadı
  kayitlar.sort((a, b) => {
    const ta = trTarihiCoz(a.tarih);
    const tb = trTarihiCoz(b.tarih);
    if (ta !== tb) {
      if (ta === null) return 1; // tarihi çözülemeyen kayıt sona düşer
      if (tb === null) return -1;
      if (ta !== tb) return tb - ta; // büyük (yeni) tarih önce
    }
    return Number(b.id) - Number(a.id); // eşit tarihte, sisteme son girilen önce
  });
  return kayitlar[0];
}

// Bir ürünün aktif reçetesinin güncel toplam maliyetini hesaplar.
// Dönüş: { maliyet: number|null, eksikMalzemeler: [ad,...], kalemler: [...] }
async function receteMaliyetiHesapla(sheets, urunId) {
  const receteRows = await getRows(sheets, TABS.receteGecmisi);
  const receteler = receteRows.map(rowToRecete).filter((r) => r.urunId === String(urunId) && r.aktif);
  if (receteler.length === 0) return { maliyet: null, eksikMalzemeler: [], kalemler: [], receteYok: true };
  receteler.sort((a, b) => Number(b.id) - Number(a.id));
  const recete = receteler[0];

  const kalemRows = await getRows(sheets, TABS.receteKalemleri);
  const kalemler = kalemRows.map(rowToKalem).filter((k) => k.receteId === recete.id);

  let toplam = 0;
  const eksikMalzemeler = [];
  const kalemDetay = [];
  for (const kalem of kalemler) {
    const maliyetKaydi = await guncelMalzemeMaliyeti(sheets, kalem.malzemeId);
    if (!maliyetKaydi) {
      eksikMalzemeler.push(kalem.malzemeAdi);
      kalemDetay.push({ ...kalem, birimMaliyet: null, satirMaliyet: null });
      continue;
    }
    const cevrilmisMaliyet = birimMaliyetiCevir(maliyetKaydi.birimMaliyet, maliyetKaydi.birim, kalem.birim);
    if (cevrilmisMaliyet === null) {
      eksikMalzemeler.push(`${kalem.malzemeAdi} (birim uyumsuz: ${maliyetKaydi.birim}→${kalem.birim})`);
      kalemDetay.push({ ...kalem, birimMaliyet: null, satirMaliyet: null });
      continue;
    }
    const satirMaliyet = cevrilmisMaliyet * kalem.miktar;
    toplam += satirMaliyet;
    kalemDetay.push({ ...kalem, birimMaliyet: cevrilmisMaliyet, satirMaliyet });
  }

  return {
    maliyet: eksikMalzemeler.length > 0 ? null : Math.round(toplam * 100) / 100,
    eksikMalzemeler,
    kalemler: kalemDetay,
    receteId: recete.id,
    receteYok: false,
  };
}

export default async function handler(req, res) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const resource = req.method === 'GET' ? req.query.resource : (req.body || {}).resource;

    // ---- MALZEME HAVUZU ----
    if (resource === 'malzemeler') {
      if (req.method === 'GET') {
        const rows = await getRows(sheets, TABS.malzeme);
        return res.status(200).json({ records: rows.map(rowToMalzeme) });
      }
      if (req.method === 'POST') {
        const { ad, birim } = req.body || {};
        if (!ad || !birim) return res.status(400).json({ error: 'ad ve birim gerekli' });
        const id = String(Date.now());
        const olusturulmaTarihi = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        await appendRow(sheets, TABS.malzeme, [id, ad, birim, 'TRUE', olusturulmaTarihi]);
        return res.status(200).json({ ok: true, record: { id, ad, birim, aktif: true, olusturulmaTarihi } });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---- MALZEME MALİYET GEÇMİŞİ (fatura girişinden tetiklenir) ----
    if (resource === 'maliyetGecmisi') {
      if (req.method === 'GET') {
        const rows = await getRows(sheets, TABS.maliyetGecmisi);
        let records = rows.map(rowToMaliyet);
        if (req.query.malzemeId) records = records.filter((r) => r.malzemeId === req.query.malzemeId);
        return res.status(200).json({ records });
      }
      if (req.method === 'POST') {
        const { malzemeId, malzemeAdi, miktar, birim, toplamFiyat, faturaId } = req.body || {};
        if (!malzemeId || !miktar || !birim || !toplamFiyat) {
          return res.status(400).json({ error: 'malzemeId, miktar, birim, toplamFiyat gerekli' });
        }
        const id = String(Date.now());
        const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const miktarNum = ondalikParse(miktar);
        const toplamNum = ondalikParse(toplamFiyat);
        if (miktarNum <= 0) return res.status(400).json({ error: 'Miktar 0\'dan büyük olmalı' });
        const birimMaliyet = Math.round((toplamNum / miktarNum) * 10000) / 10000;
        await appendRow(sheets, TABS.maliyetGecmisi, [id, malzemeId, malzemeAdi || '', tarih, miktarNum, birim, toplamNum, birimMaliyet, faturaId || '']);
        return res.status(200).json({ ok: true, record: { id, malzemeId, malzemeAdi, tarih, miktar: miktarNum, birim, toplamFiyat: toplamNum, birimMaliyet, faturaId } });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---- REÇETELER (başlık + kalemler birlikte) ----
    if (resource === 'recete') {
      if (req.method === 'GET') {
        const urunId = req.query.urunId;
        if (!urunId) return res.status(400).json({ error: 'urunId gerekli' });
        const hesap = await receteMaliyetiHesapla(sheets, urunId);
        return res.status(200).json(hesap);
      }
      if (req.method === 'POST') {
        // Reçete kaydet: yeni versiyon oluşturulur, eskisi aktif=FALSE yapılır (geçmiş korunur).
        const { urunId, urunAdi, kalemler } = req.body || {};
        if (!urunId || !Array.isArray(kalemler)) return res.status(400).json({ error: 'urunId ve kalemler gerekli' });

        // Eski aktif reçeteyi bul, varsa versiyonu artır ve pasif yap.
        const receteRows = await getRows(sheets, TABS.receteGecmisi);
        const eskiReceteler = receteRows.map(rowToRecete).filter((r) => r.urunId === String(urunId));
        const eskiAktif = eskiReceteler.find((r) => r.aktif);
        const yeniVersiyon = eskiAktif ? eskiAktif.versiyon + 1 : 1;

        if (eskiAktif) {
          // Eski satırı pasif yap + bitiş tarihi ekle — satır index'ini bulup güncelle.
          const rowIdx = receteRows.findIndex((r) => r[0] === eskiAktif.id);
          if (rowIdx !== -1) {
            const sheetRow = rowIdx + 2; // A2'den başladığı için +2
            await sheets.spreadsheets.values.update({
              spreadsheetId: SHEET_ID,
              range: `${TABS.receteGecmisi.tab}!E${sheetRow}:G${sheetRow}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [['FALSE', eskiAktif.baslangic, new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })]] },
            });
          }
        }

        const receteId = String(Date.now());
        const baslangic = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        await appendRow(sheets, TABS.receteGecmisi, [receteId, urunId, urunAdi || '', yeniVersiyon, 'TRUE', baslangic, '']);

        for (const kalem of kalemler) {
          const kalemId = String(Date.now() + Math.floor(Math.random() * 1000));
          await appendRow(sheets, TABS.receteKalemleri, [kalemId, receteId, kalem.malzemeId, kalem.malzemeAdi || '', ondalikParse(kalem.miktar), kalem.birim || '']);
        }

        return res.status(200).json({ ok: true, receteId, versiyon: yeniVersiyon });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---- TÜM ÜRÜNLERİN MALİYET/DURUM ÖZETİ (Reçeteler ana listesi için) ----
    if (resource === 'ozet') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const urunIdleri = String(req.query.urunIdleri || '').split(',').filter(Boolean);
      const sonuc = {};
      for (const urunId of urunIdleri) {
        sonuc[urunId] = await receteMaliyetiHesapla(sheets, urunId);
      }
      return res.status(200).json({ ozet: sonuc });
    }

    return res.status(400).json({ error: 'Geçersiz resource' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}