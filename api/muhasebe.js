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

// ============================================================
// VERİ KATMANI — Google Sheets yerine Supabase (Postgres).
// Eski Sheets sekmelerinin her biri bir Postgres tablosuna karşılık geliyor.
// KOLON SIRASI eski başlık sırasıyla BİREBİR AYNI: satırlar yine dizi olarak
// dönüyor, bu yüzden rowToX() ve tüm iş mantığı DEĞİŞMEDİ.
// Haritada olmayan sekmeler (Gün Sonu Kasa, Malzeme Maliyet Geçmişi, eski
// belge sekmeleri) hâlâ Sheets'ten okunuyor/yazılıyor — bilinçli.
// ============================================================
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const TABLOLAR = {
  'Kategori Sözlüğü': { tablo: 'mh_kategoriler', kolonlar: ['id', 'kategori_adi', 'tarih'] },
  'Giderler': { tablo: 'mh_giderler', kolonlar: ['id', 'tarih', 'kategori', 'tedarikci_aciklama', 'tutar', 'kdv_orani', 'odeme_durumu', 'belge_no', 'toptanci_id', 'kayit_zamani', 'fatura_id'] },
  'Gelirler': { tablo: 'mh_gelirler', kolonlar: ['id', 'tarih', 'kategori', 'musteri_firma', 'fatura_no', 'tutar', 'kdv_orani', 'vade_tarihi', 'tahsilat_durumu', 'kayit_zamani'] },
  'Toptancı Hareketleri': { tablo: 'mh_toptanci_hareketleri', kolonlar: ['id', 'toptanci_id', 'tarih', 'tur', 'tutar', 'aciklama', 'kaynak_gider_id', 'odeme_yontemi', 'kayit_zamani'] },
  'Ortaklar Hareketleri': { tablo: 'mh_ortak_hareketleri', kolonlar: ['id', 'ortak_adi', 'tarih', 'islem_turu', 'yon', 'tutar', 'kasa_banka', 'aciklama', 'kayit_zamani'] },
  'Ekstre Hareketleri': { tablo: 'mh_ekstre', kolonlar: ['id', 'tarih', 'islem_turu', 'yon', 'tutar', 'aciklama', 'satici_adi', 'satici_kodu', 'kart_tipi', 'islem_hash', 'eslesme_durumu', 'eslesen_toptanci_id', 'eslesen_kayit_id', 'kategori', 'kayit_zamani'] },
  'Fatura ve Fişler': { tablo: 'mh_fatura_fis', kolonlar: ['id', 'tarih', 'gun', 'ay', 'yil', 'firma_adi', 'fatura_no', 'aciklama', 'gider_kategorisi', 'odeme_turu', 'odeme_detay', 'fatura_tutari', 'kdv_tutari', 'iskonto_tutari', 'odeme_tutari', 'bakiye_durumu', 'bakiye_tutari', 'kaynak_fatura_id', 'gunluk_harcama', 'kayit_zamani', 'ana_kasa_harcama'] },
  'Tahsilat Makbuzları': { tablo: 'mh_tahsilat', kolonlar: ['id', 'tarih', 'gun', 'ay', 'yil', 'firma_adi', 'fatura_no', 'aciklama', 'odeme_turu', 'odeme_detay', 'tutar', 'onceki_bakiye', 'yeni_bakiye', 'kaynak_ekstre_id', 'kayit_zamani', 'kasa_kaynak', 'limit_kaynak'] },
  'Fatura Firmaları': { tablo: 'mh_firmalar', kolonlar: ['id', 'firma_adi', 'gider_kategorisi', 'gunluk_harcama', 'kayit_zamani'] },
  'Ödeme Yöntemleri': { tablo: 'mh_odeme_yontemleri', kolonlar: ['id', 'tur', 'ad', 'kayit_zamani', 'limit_deger', 'acilis_bakiyesi', 'acilis_tarihi'] },
  'Banka Kart Hareketleri': { tablo: 'mh_banka_kart', kolonlar: ['id', 'tarih', 'hesap_turu', 'hesap_adi', 'yon', 'tutar', 'aciklama', 'kaynak_id', 'kayit_zamani'] },
  'Personel': { tablo: 'mh_personel', kolonlar: ['id', 'ad_soyad', 'telefon', 'gorev', 'ise_giris', 'net_maas', 'nakit_limit', 'havale_limit', 'cikis_tarihi', 'kayit_zamani'] },
  'Sabit Giderler': { tablo: 'mh_sabit_giderler', kolonlar: ['id', 'ad', 'kategori', 'tutar', 'odeme_gunu', 'pasif', 'kayit_zamani'] },
  'Tahakkuklar': { tablo: 'mh_tahakkuklar', kolonlar: ['id', 'tip', 'kayit_id', 'ad', 'donem', 'tarih', 'tutar', 'fatura_fis_id', 'kayit_zamani'] },
  'Devamsızlık': { tablo: 'mh_devamsizlik', kolonlar: ['id', 'personel_id', 'tarih', 'tur', 'aciklama', 'kayit_zamani'] },
  'Yemek Kartı Tanımları': { tablo: 'mh_yk_kartlar', kolonlar: ['id', 'ad', 'komisyon_orani', 'fatura_kdv', 'kesinti_kdv', 'kesim10', 'kesim20', 'kesim30', 'pasif', 'kayit_zamani'] },
  'Yemek Kartı Faturaları': { tablo: 'mh_yk_faturalar', kolonlar: ['id', 'kart_id', 'kart_adi', 'donem', 'kesim', 'fatura_tarihi', 'matrah', 'kdv', 'fatura_toplami', 'vade', 'kesinti_oran', 'kesinti_matrah', 'kesinti_kdv', 'kesinti_toplam', 'bankaya_yatacak', 'gider_fatura_fis_id', 'gelen_tutar', 'gelis_tarihi', 'gelen_hesap', 'kayit_zamani'] },
  'Muhasebe Ayarları': { tablo: 'mh_ayarlar', kolonlar: ['id', 'deger', 'kayit_zamani'] },
  'Tedarikçi Kategori Sözlüğü': { tablo: 'mh_tedarikci_kategori', kolonlar: ['id', 'tedarikci_adi', 'kategori', 'tarih'] },
  'Malzeme Eşleştirme Sözlüğü': { tablo: 'mh_eslestirme', kolonlar: ['id', 'tedarikci_adi', 'urun_kodu', 'urun_adi', 'malzeme_id', 'malzeme_adi', 'paket_miktari', 'paket_birimi', 'tarih'] },
  'Fatura İçe Aktarma Log': { tablo: 'mh_xml_log', kolonlar: ['id', 'uuid', 'fatura_no', 'tedarikci_adi', 'toplam_tutar', 'gorulme_tarihi'] },
  'Gün Sonu Kasa': { tablo: 'gs_kayitlar', kolonlar: ['tarih', 'toplam_nakit', 'nakit_kupur', 'kasa_avansi', 'pos_toplam', 'pos_satirlari', 'ana_kasa_toplam', 'ana_kasa_harcamalar', 'gunluk_kasa_toplam', 'gunluk_kasa_harcamalar', 'cari_toplam', 'cari_detay', 'yemek_toplam', 'yemek_detay', 'ciro', 'ana_kasa_takibi', 'kaydeden_saat'] },
  'Malzeme Havuzu': { tablo: 'rc_malzemeler', kolonlar: ['id', 'malzeme_adi', 'birim', 'aktif', 'olusturulma_tarihi'] },
  'Malzeme Maliyet Geçmişi': { tablo: 'rc_maliyet_gecmisi', kolonlar: ['id', 'malzeme_id', 'malzeme_adi', 'tarih', 'miktar', 'birim', 'toplam_fiyat', 'birim_maliyet', 'fatura_id'] },
  'Reçete Geçmişi': { tablo: 'rc_receteler', kolonlar: ['id', 'urun_id', 'urun_adi', 'versiyon', 'aktif', 'baslangic_tarihi', 'bitis_tarihi'] },
  'Reçete Kalemleri': { tablo: 'rc_recete_kalemleri', kolonlar: ['id', 'recete_id', 'malzeme_id', 'malzeme_adi', 'miktar', 'birim'] },
  'Realtime Kullanım': { tablo: 'rt_kullanim', kolonlar: ['id', 'row_type', 'tarih', 'saat', 'total_messages', 'table_state', 'sales_history', 'cari_hareketler', 'cari_odemeler', 'cari_faturalar', 'packages', 'paket_teslimatlari', 'mutfak_hazir_notlar', 'presence_sync', 'presence_join', 'presence_leave', 'other', 'full_scope', 'paketci', 'mutfak', 'monthly_limit', 'usage_percent'] },
  'Toptancılar': { tablo: 'mh_toptancilar', kolonlar: ['id', 'firma_adi', 'kategori', 'telefon', 'yetkili_kisi', 'adres', 'notlar', 'bakiye', 'eklenme_tarihi', 'durum'] },
};

function tabloBul(tabConfig) {
  const ad = typeof tabConfig === 'string' ? tabConfig : (tabConfig && tabConfig.tab);
  return TABLOLAR[ad] || null;
}

// Kolonlar text: Sheets de her şeyi metin veriyordu, mevcut sayı/tarih çözücüler
// (ondalikParseServer, sayiCoz, trTarihiCozServer) buna göre yazılmış durumda.
function metneCevir(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function satirdanNesne(t, rowValues) {
  const o = {};
  t.kolonlar.forEach((k, i) => { o[k] = metneCevir(rowValues[i]); });
  return o;
}

async function pgOku(t) {
  const { data, error } = await db.from(t.tablo).select(t.kolonlar.join(',')).order('sira', { ascending: true });
  if (error) throw new Error(`${t.tablo} okunamadı: ${error.message}`);
  return (data || [])
    .map((r) => t.kolonlar.map((k) => (r[k] === null || r[k] === undefined ? '' : r[k])))
    .filter((r) => r[0]);
}

// Toplu ekleme. rowsValues = dizi dizisi (eski Sheets append'inin aldığı biçim).
async function satirlarEkle(tabConfig, rowsValues) {
  if (!rowsValues || !rowsValues.length) return;
  const t = tabloBul(tabConfig);
  if (!t) throw new Error(`Bilinmeyen tablo: ${tabConfig && tabConfig.tab}`);
  const { error } = await db.from(t.tablo).insert(rowsValues.map((r) => satirdanNesne(t, r)));
  if (error) throw new Error(`${t.tablo} yazılamadı: ${error.message}`);
}

// Tek satır güncelleme. rowValues[0] HER ZAMAN kayıt ID'si (eski kodda da öyleydi:
// Sheets'te A sütunu ID idi ve satır tamamı yeniden yazılıyordu).
async function satirGuncelle(tabConfig, rowValues) {
  const t = tabloBul(tabConfig);
  if (!t) throw new Error(`Bilinmeyen tablo: ${tabConfig && tabConfig.tab}`);
  const { error } = await db.from(t.tablo).upsert(satirdanNesne(t, rowValues), { onConflict: 'id' });
  if (error) throw new Error(`${t.tablo} güncellenemedi: ${error.message}`);
}

async function satirSil(tabConfig, id) {
  const t = tabloBul(tabConfig);
  if (!t) throw new Error(`Bilinmeyen tablo: ${tabConfig && tabConfig.tab}`);
  const { error } = await db.from(t.tablo).delete().eq('id', id);
  if (error) throw new Error(`${t.tablo} silinemedi: ${error.message}`);
}

async function tabloBos(t) {
  const { count, error } = await db.from(t.tablo).select('id', { count: 'exact', head: true });
  if (error) throw new Error(`${t.tablo} sayılamadı: ${error.message}`);
  return !count;
}


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

// Yemek kartı / fintek komisyon firmaları — bunlar tedarikçi değil, aracı kurum.
// Kart ekstrelerinde GİDEN olarak görünseler de Toptancı Carisine ödeme olarak
// değil, doğrudan "Yemek Kart-Banka Masf." kategorisinde Giderlere yazılırlar.
// firmaEslesirMi ile bir toptancıya bağlanmaz; eslesmeDurumu = 'fintek_komisyon'.
const YEMEK_KARTI_KOMISYON_FIRMALARI = new Set([
  'multinet', 'tokenflex', 'token', 'metropal', 'sodexo', 'pluxee',
  'edenred', 'ticket', 'setcard', 'wincard', 'paycell', 'paye',
]);

function fintekKomisyonMu(saticiAdi) {
  const norm = asciiNormalize(saticiAdi).split(' ');
  return norm.some((k) => YEMEK_KARTI_KOMISYON_FIRMALARI.has(k));
}
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
// ============================================================
// YENİ ÜÇLÜ (9 Eylül): Fatura ve Fiş Girişi / Tahsilat Makbuzu / Banka/Kart Takip.
// Kullanıcı kararı: bu sekmeler TAMAMEN AYRI yaşar, mevcut Giderler ve Toptancı
// Hareketleri sekmelerine dokunmaz; içine SADECE bu ekranlardan elle girilen
// bilgiler yazılır (Supabase'den otomatik veri alınmaz).
// ============================================================
const FATURA_FIS_TAB = {
  tab: 'Fatura ve Fişler',
  headers: ['ID', 'Tarih', 'Gun', 'Ay', 'Yil', 'FirmaAdi', 'FaturaNo', 'Aciklama', 'GiderKategorisi',
    'OdemeTuru', 'OdemeDetay', 'FaturaTutari', 'KdvTutari', 'IskontoTutari', 'OdemeTutari',
    'BakiyeDurumu', 'BakiyeTutari', 'KaynakFaturaID', 'GunlukHarcama', 'KayitZamani',
    'AnaKasaHarcama'],
};

function rowToFaturaFis(r) {
  return {
    id: r[0], tarih: r[1], gun: r[2], ay: r[3], yil: r[4], firmaAdi: r[5] || '',
    faturaNo: r[6] || '', aciklama: r[7] || '', giderKategorisi: r[8] || '',
    odemeTuru: r[9] || '', odemeDetay: r[10] || '',
    faturaTutari: sayiCoz(r[11]), kdvTutari: sayiCoz(r[12]), iskontoTutari: sayiCoz(r[13]),
    odemeTutari: sayiCoz(r[14]),
    bakiyeDurumu: r[15] || '', bakiyeTutari: sayiCoz(r[16]),
    kaynakFaturaID: r[17] || '',
    gunlukHarcama: r[18] === 'TRUE' || r[18] === true,
    kayitZamani: r[19] || '',
    // Yeni sütun (16 Eylül): hızlı nakit gider hangi kasadan çıktı?
    // TRUE  -> Ana Kasa  (yarına devir ana kasadan düşülür, ciroyu etkilemez)
    // FALSE -> Günlük Kasa (o günün cirosuna GERİ EKLENİR — kasiyer harcanan parayı
    //          sayamadığı için nakit sayımı eksik kalıyor, bu tutar telafi ediyor)
    // Eski satırlarda sütun yok (undefined) -> false = günlük kasa sayılır.
    anaKasaHarcama: r[20] === 'TRUE' || r[20] === true,
  };
}

const TAHSILAT_TAB = {
  tab: 'Tahsilat Makbuzları',
  headers: ['ID', 'Tarih', 'Gun', 'Ay', 'Yil', 'FirmaAdi', 'FaturaNo', 'Aciklama',
    'OdemeTuru', 'OdemeDetay', 'Tutar', 'OncekiBakiye', 'YeniBakiye', 'KaynakEkstreID', 'KayitZamani',
    'KasaKaynak', 'LimitKaynak'],
};

function rowToTahsilat(r) {
  return {
    kasaKaynak: r[15] || '', limitKaynak: r[16] || '',
    id: r[0], tarih: r[1], gun: r[2], ay: r[3], yil: r[4], firmaAdi: r[5] || '',
    faturaNo: r[6] || '', aciklama: r[7] || '', odemeTuru: r[8] || '', odemeDetay: r[9] || '',
    tutar: sayiCoz(r[10]), oncekiBakiye: sayiCoz(r[11]), yeniBakiye: sayiCoz(r[12]),
    kaynakEkstreID: r[13] || '', kayitZamani: r[14] || '',
  };
}

// Firma defteri — tutarsız (henüz işlemi olmayan) firmalar da aramada çıksın diye ayrı tutulur.
// GunlukHarcama=TRUE olanlar kasa harcama mini formunda görünür, FALSE olanlar sadece muhasebede.
const FF_FIRMA_TAB = { tab: 'Fatura Firmaları', headers: ['ID', 'FirmaAdi', 'GiderKategorisi', 'GunlukHarcama', 'KayitZamani'] };

// Limit/AcilisBakiyesi/AcilisTarihi sütunları sonradan eklendi (eski satırlar boş kalır = 0).
const ODEME_YONTEMI_TAB = { tab: 'Ödeme Yöntemleri', headers: ['ID', 'Tur', 'Ad', 'KayitZamani', 'Limit', 'AcilisBakiyesi', 'AcilisTarihi'] };
const VARSAYILAN_ODEME_YONTEMLERI = [
  ['Nakit', ''],
  ['Kredi Kartı', 'Ödeal Kredi Kartı'],
  ['Kredi Kartı', 'İş Bankası Kredi Kartı'],
  ['Banka Havalesi', 'İş Bankası'],
  ['Banka Havalesi', 'Akbank'],
  ['Cari', ''],
];

function rowToOdemeYontemi(r) {
  return {
    id: r[0], tur: r[1] || '', ad: r[2] || '',
    limit: sayiCoz(r[4]), acilisBakiyesi: sayiCoz(r[5]), acilisTarihi: r[6] || '',
  };
}

// Sekme yoksa varsayılan yöntemlerle tohumlanır; varsa dokunulmaz (kullanıcının
// eklediği/sildiği yöntemler korunur). Her çağrıda güncel satırları döndürür.
async function ensureOdemeYontemleri(sheets) {
  const rows = await getRows(sheets, ODEME_YONTEMI_TAB);
  if (rows.length > 0) return rows;
  const now = new Date().toISOString();
  await satirlarEkle(ODEME_YONTEMI_TAB, VARSAYILAN_ODEME_YONTEMLERI.map(([tur, ad]) => [benzersizId(), tur, ad, now]));
  return getRows(sheets, ODEME_YONTEMI_TAB);
}

const BANKA_KART_TAB = {
  tab: 'Banka Kart Hareketleri',
  headers: ['ID', 'Tarih', 'HesapTuru', 'HesapAdi', 'Yon', 'Tutar', 'Aciklama', 'KaynakID', 'KayitZamani'],
};

function rowToBankaKartHareket(r) {
  return {
    id: r[0], tarih: r[1], hesapTuru: r[2] || '', hesapAdi: r[3] || '', yon: r[4] || '',
    tutar: sayiCoz(r[5]), aciklama: r[6] || '', kaynakID: r[7] || '', kayitZamani: r[8] || '',
  };
}

// Sadece kart/banka üzerinden yapılan ödemeler hesap hareketine düşer (nakit ve cari düşmez).
function hesapHareketiGerekir(odemeTuru) {
  return odemeTuru === 'Kredi Kartı' || odemeTuru === 'Banka Havalesi';
}

// ---- Devir (eski sistemden açılış) ----
// "Devir" ödeme türü kasa/banka hareketi ÜRETMEZ (hesapHareketiGerekir false döner).
// Devir faturaları bu kategoriyle yazılır; gider raporları bu kategoriyi hariç tutmalı.
const DEVIR_KATEGORI = 'Devir (Gider Değil)';

// ---- Personel + Sabit Giderler (tahakkuk modülü) ----
// Tahakkuk = ayın 1'ine "Cari" fatura satırı (borç doğar). Ödeme = Tahsilat satırı
// (borç düşer). Böylece cari/banka/kasa mantığı mevcut altyapıyla aynı çalışır.
const PERSONEL_TAB = {
  tab: 'Personel',
  headers: ['ID', 'AdSoyad', 'Telefon', 'Gorev', 'IseGiris', 'NetMaas',
    'NakitLimit', 'HavaleLimit', 'CikisTarihi', 'KayitZamani'],
};
const SABIT_GIDER_TAB = {
  tab: 'Sabit Giderler',
  headers: ['ID', 'Ad', 'Kategori', 'Tutar', 'OdemeGunu', 'Pasif', 'KayitZamani'],
};
const TAHAKKUK_TAB = {
  tab: 'Tahakkuklar',
  headers: ['ID', 'Tip', 'KayitId', 'Ad', 'Donem', 'Tarih', 'Tutar', 'FaturaFisId', 'KayitZamani'],
};
const DEVAMSIZLIK_TAB = {
  tab: 'Devamsızlık',
  headers: ['ID', 'PersonelId', 'Tarih', 'Tur', 'Aciklama', 'KayitZamani'],
};
const PERSONEL_KATEGORI = 'Personel Gideri';

// ---- Yemek kartları (fatura kesimi + mutabakat) ----
// Fatura toplamı = matrah + matrah*faturaKdv. Kesinti = matrah*oran, üstüne kendi KDV'si.
// Bankaya yatacak = fatura toplamı - kesinti toplamı.
const YK_KART_TAB = {
  tab: 'Yemek Kartı Tanımları',
  headers: ['ID', 'Ad', 'KomisyonOrani', 'FaturaKdv', 'KesintiKdv', 'Kesim10', 'Kesim20', 'Kesim30', 'Pasif', 'KayitZamani'],
};
const YK_FATURA_TAB = {
  tab: 'Yemek Kartı Faturaları',
  headers: ['ID', 'KartId', 'KartAdi', 'Donem', 'Kesim', 'FaturaTarihi', 'Matrah', 'Kdv', 'FaturaToplami',
    'Vade', 'KesintiOran', 'KesintiMatrah', 'KesintiKdv', 'KesintiToplam', 'BankayaYatacak',
    'GiderFaturaFisId', 'GelenTutar', 'GelisTarihi', 'GelenHesap', 'KayitZamani'],
};
const YEMEK_KARTI_KATEGORI = 'Yemek Kart-Banka Masf.';
const GUNSONU_TAB = { tab: 'Gün Sonu Kasa', headers: [] };
// Varsayılan kart tanımları (kullanıcının mevcut tablosundaki oran ve kesim günleri).
const YK_VARSAYILAN = [
  { ad: 'Setcard', oran: 0.08, kesim: [true, true, true] },
  { ad: 'Pluxee', oran: 0.06, kesim: [true, true, true] },
  { ad: 'Edenred', oran: 0.06, kesim: [true, true, true] },
  { ad: 'Metropol', oran: 0.06, kesim: [true, false, true] },
  { ad: 'Tokenflex', oran: 0.06, kesim: [false, false, true] },
  { ad: 'Multinet', oran: 0.06, kesim: [false, false, true] },
];

function rowToYemekKarti(r) {
  return {
    id: r[0], ad: r[1] || '', komisyonOrani: sayiCoz(r[2]), faturaKdv: sayiCoz(r[3]) || 0.1,
    kesintiKdv: sayiCoz(r[4]) || 0.2,
    kesim10: r[5] === 'TRUE', kesim20: r[6] === 'TRUE', kesim30: r[7] === 'TRUE',
    pasif: r[8] === 'TRUE', kayitZamani: r[9] || '',
  };
}
function rowToYemekFaturasi(r) {
  return {
    id: r[0], kartId: r[1] || '', kartAdi: r[2] || '', donem: r[3] || '', kesim: r[4] || '',
    faturaTarihi: r[5] || '', matrah: sayiCoz(r[6]), kdv: sayiCoz(r[7]), faturaToplami: sayiCoz(r[8]),
    vade: r[9] || '', kesintiOran: sayiCoz(r[10]), kesintiMatrah: sayiCoz(r[11]),
    kesintiKdv: sayiCoz(r[12]), kesintiToplam: sayiCoz(r[13]), bankayaYatacak: sayiCoz(r[14]),
    giderFaturaFisId: r[15] || '', gelenTutar: sayiCoz(r[16]), gelisTarihi: r[17] || '',
    gelenHesap: r[18] || '', kayitZamani: r[19] || '',
  };
}

// Matrahtan tüm zinciri hesaplar (Excel'deki formüllerin birebir karşılığı).
function yemekKartiHesapla(matrah, kart) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const m = ondalikParseServer(matrah);
  const kdv = r2(m * (kart.faturaKdv || 0.1));
  const faturaToplami = r2(m + kdv);
  const kesintiMatrah = r2(m * (kart.komisyonOrani || 0));
  const kesintiKdv = r2(kesintiMatrah * (kart.kesintiKdv || 0.2));
  const kesintiToplam = r2(kesintiMatrah + kesintiKdv);
  return { matrah: m, kdv, faturaToplami, kesintiMatrah, kesintiKdv, kesintiToplam,
    bankayaYatacak: r2(faturaToplami - kesintiToplam) };
}

// Kesim dönemi tarih aralığı: 10 -> ayın 1-10'u, 20 -> 11-20'si, 30 -> 21'den ay sonuna.
function kesimAraligi(donem, kesim) {
  const [y, a] = String(donem).split('-').map(Number);
  const sonGun = new Date(y, a, 0).getDate();
  if (Number(kesim) === 10) return [new Date(y, a - 1, 1), new Date(y, a - 1, 10)];
  if (Number(kesim) === 20) return [new Date(y, a - 1, 11), new Date(y, a - 1, 20)];
  return [new Date(y, a - 1, 21), new Date(y, a - 1, sonGun)];
}

// Gün Sonu Kasa sayfasındaki yemek kartı detaylarından dönem toplamlarını çıkarır.
// N sütunu JSON: { kolonlar: [...], tutarlar: { marka: { kolon: tutar } } }
async function gunsonuYemekToplamlari(sheets, bas, bit) {
  let rows = [];
  try {
    rows = await getRows(sheets, GUNSONU_TAB);
  } catch { return {}; }
  const toplam = {};
  rows.forEach((r) => {
    const t = trTarihiCozServer(r[0]);
    if (!t || t < bas || t > bit) return;
    let detay = {};
    try { detay = JSON.parse(r[13] || '{}'); } catch { detay = {}; }
    const tutarlar = detay.tutarlar || {};
    Object.keys(tutarlar).forEach((marka) => {
      const satir = tutarlar[marka] || {};
      const markaToplam = Object.keys(satir).reduce((x, k) => x + (ondalikParseServer(satir[k]) || 0), 0);
      const anahtar = metinNormalize(marka);
      toplam[anahtar] = Math.round(((toplam[anahtar] || 0) + markaToplam) * 100) / 100;
    });
  });
  return toplam;
}
// Cepten ödeme yöntemleri -> ortaklar carisine alacak (yatırım) yazar.
const CEPTEN_ORTAK = { 'Hasret Cepten': 'Hasret Cem Arslan', 'Hasan Cepten': 'Hasan Arslan' };

function rowToPersonel(r) {
  return {
    id: r[0], adSoyad: r[1] || '', telefon: r[2] || '', gorev: r[3] || '',
    iseGiris: r[4] || '', netMaas: sayiCoz(r[5]), nakitLimit: sayiCoz(r[6]),
    havaleLimit: sayiCoz(r[7]), cikisTarihi: r[8] || '', kayitZamani: r[9] || '',
  };
}
function rowToSabitGider(r) {
  return {
    id: r[0], ad: r[1] || '', kategori: r[2] || '', tutar: sayiCoz(r[3]),
    odemeGunu: r[4] || '', pasif: r[5] === 'TRUE', kayitZamani: r[6] || '',
  };
}
function rowToTahakkuk(r) {
  return {
    id: r[0], tip: r[1] || '', kayitId: r[2] || '', ad: r[3] || '', donem: r[4] || '',
    tarih: r[5] || '', tutar: sayiCoz(r[6]), faturaFisId: r[7] || '', kayitZamani: r[8] || '',
  };
}
function rowToDevamsizlik(r) {
  return {
    id: r[0], personelId: r[1] || '', tarih: r[2] || '', tur: r[3] || 'Tam',
    aciklama: r[4] || '', kayitZamani: r[5] || '',
  };
}

// 'GG.AA.YYYY' -> '2026-10' ; geçersizse ''
function donemAnahtari(trTarih) {
  const d = trTarihiCozServer(trTarih);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// '2026-10' -> '01.10.2026' (tahakkuk her zaman ayın 1'ine yazılır)
function donemIlkGunu(donem) {
  const [y, a] = String(donem).split('-');
  return `01.${a}.${y}`;
}
function bugununDonemi() {
  const d = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
  return donemAnahtari(d);
}

const AYAR_TAB = { tab: 'Muhasebe Ayarları', headers: ['Anahtar', 'Deger', 'KayitZamani'] };

// Okuma sekmeyi OLUŞTURMAZ: aynı anda birden fazla ekran açılınca paralel isteklerin
// ikisi birden sekme eklemeye çalışıp hata vermesin. Sekme yoksa ayar boş sayılır;
// sekme sadece ayar kaydedilirken (POST) oluşturulur.
async function ayarGetir(sheets, anahtar) {
  try {
    const rows = await getRowsAnahtarli(sheets, AYAR_TAB, false);
    const r = rows.find((x) => x[0] === anahtar);
    return r ? String(r[1] || '') : '';
  } catch {
    return '';
  }
}

async function getRowsAnahtarli(sheets, tabConfig, olustur = true) {
  const t = tabloBul(tabConfig);
  if (t) return pgOku(t);
  if (olustur) await ensureTab(sheets, tabConfig.tab, tabConfig.headers);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabConfig.tab}!A2:${lastCol(tabConfig.headers)}`,
  });
  return (result.data.values || []).filter((r) => r[0]);
}

// Devir tarihi DAHİL ve öncesi eski sistemde kalır; true = kart olarak gösterilebilir.
function devirSonrasiMi(tarihStr, devirTarihi) {
  if (!devirTarihi) return true;
  const t = trTarihiCozServer(tarihStr);
  if (!t) return true;
  return t.getTime() > devirTarihi.getTime();
}

// Hesap bazlı güncel durum. Açılış tarihi DAHİL ve öncesindeki hareketler açılış
// tutarının içinde sayılır, sadece SONRAKİ hareketler eklenir.
// Limit > 0 ise hesap kredi kartı gibi hesaplanır: açılış tutarı = kart borcu.
function hesapOzetleri(yontemler, hareketler) {
  const r2 = (x) => Math.round(x * 100) / 100;
  return yontemler
    .filter((o) => hesapHareketiGerekir(o.tur) && o.ad)
    .map((o) => {
      const acilis = trTarihiCozServer(o.acilisTarihi);
      let giren = 0;
      let giden = 0;
      hareketler.forEach((h) => {
        if (h.hesapAdi !== o.ad) return;
        if (acilis) {
          const t = trTarihiCozServer(h.tarih);
          if (t && t.getTime() <= acilis.getTime()) return;
        }
        if (h.yon === 'GİREN') giren += h.tutar;
        else if (h.yon === 'GİDEN') giden += h.tutar;
      });
      const temel = {
        id: o.id, tur: o.tur, ad: o.ad, limit: o.limit,
        acilisBakiyesi: o.acilisBakiyesi, acilisTarihi: o.acilisTarihi,
        giren: r2(giren), giden: r2(giden),
      };
      if (o.limit > 0) {
        const borc = r2(o.acilisBakiyesi + giden - giren);
        return { ...temel, kartModu: true, borc, kullanilabilir: r2(o.limit - borc) };
      }
      return { ...temel, kartModu: false, bakiye: r2(o.acilisBakiyesi + giren - giden) };
    });
}

function trTarihiParcala(trTarih) {
  const d = trTarihiCozServer(trTarih);
  if (!d) return { gun: '', ay: '', yil: '' };
  return { gun: d.getDate(), ay: d.getMonth() + 1, yil: d.getFullYear() };
}

// Bakiye = (fatura tutarları - peşin ödenenler) - yapılan tahsilatlar.
// Pozitif => firmaya BORÇLUYUZ (bunlar gider/alış faturaları).
function firmaBakiyesi(firmaAdi, faturaKayitlari, tahsilatlar) {
  const hedef = metinNormalize(firmaAdi);
  const borc = faturaKayitlari
    .filter((k) => metinNormalize(k.firmaAdi) === hedef)
    .reduce((s, k) => s + (k.faturaTutari - k.odemeTutari), 0);
  const odenen = tahsilatlar
    .filter((t) => metinNormalize(t.firmaAdi) === hedef)
    .reduce((s, t) => s + t.tutar, 0);
  return Math.round((borc - odenen) * 100) / 100;
}

function bakiyeDurumuEtiketi(bakiye) {
  if (Math.abs(bakiye) < 0.01) return 'Hesap Yok';
  return bakiye > 0 ? 'Borçlu' : 'Alacaklı';
}

// Arama listesi: firma defteri + fiilen işlem görmüş firmalar birleştirilir.
function firmaListesiCikar(firmaRows, faturaKayitlari, tahsilatlar) {
  const harita = new Map();
  const katMap = new Map(); // firmaAdi -> giderKategorisi
  const ekle = (ad, kat) => {
    const temiz = String(ad || '').trim();
    if (!temiz) return;
    const anahtar = metinNormalize(temiz);
    if (!harita.has(anahtar)) harita.set(anahtar, temiz);
    if (kat && !katMap.has(anahtar)) katMap.set(anahtar, kat);
  };
  firmaRows.forEach((r) => ekle(r[1], r[2])); // r[2] = GiderKategorisi
  faturaKayitlari.forEach((k) => ekle(k.firmaAdi, k.giderKategorisi));
  tahsilatlar.forEach((t) => ekle(t.firmaAdi));
  return [...harita.entries()]
    .map(([anahtar, ad]) => ({
      firmaAdi: ad,
      bakiye: firmaBakiyesi(ad, faturaKayitlari, tahsilatlar),
      giderKategorisi: katMap.get(anahtar) || '',
    }))
    .map((f) => ({ ...f, durum: bakiyeDurumuEtiketi(f.bakiye) }))
    .sort((a, b) => a.firmaAdi.localeCompare(b.firmaAdi, 'tr'));
}

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

async function ensureKategoriSeed() {
  const t = tabloBul(KATEGORI_TAB);
  if (!(await tabloBos(t))) return;
  const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
  await satirlarEkle(KATEGORI_TAB, VARSAYILAN_KATEGORILER.map((k, i) => [`kat${Date.now()}${i}`, k, tarih]));
}

async function getRows(sheets, tabConfig) {
  const t = tabloBul(tabConfig);
  if (t) return pgOku(t);
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

// Excel, tarih hücrelerini içeride sayı (1899-12-30'dan itibaren geçen gün sayısı) olarak
// saklar; xlsxSatirlariniCoz() hücre STİLİNİ (numFmt) okumadığı için bu ham sayı olduğu gibi
// gelir (örn. "46269"). Böyle bir değer görülürse gerçek DD.MM.YYYY tarihine çeviriyoruz;
// zaten "12.09.2026" gibi metin gelmişse dokunmuyoruz.
function excelTarihiCoz(v) {
  const s = String(v ?? '').trim();
  if (!s) return s;
  if (!/^\d+(\.\d+)?$/.test(s)) return s; // zaten metin/tarih formatındaysa aynen bırak
  const serial = Math.floor(Number(s));
  if (!Number.isFinite(serial) || serial < 1) return s;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(excelEpoch.getTime() + serial * 86400000);
  const gg = String(d.getUTCDate()).padStart(2, '0');
  const aa = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${gg}.${aa}.${yyyy}`;
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
  const t = tabloBul(tabConfig);
  if (t) { await satirlarEkle(tabConfig, [rowValues]); return; }
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
  // Postgres'e taşınan sekmelerde yapacak bir şey yok (tablo migration ile kuruldu).
  if (tabloBul(tab)) return;
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
    const resource = req.query.resource || (req.body || {}).resource;

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
        await satirlarEkle(XML_LOG_TAB, yeniLogSatirlari);
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
    // ============================================================
    // GECE ARŞİVİ — Postgres'teki muhasebe tablolarını Google Sheets'e yazar.
    // Amaç: Sheets okunan yer değil, ARŞİV/yedek olsun. Program gün boyu
    // Postgres kullanır, gecede bir bu iş çalışıp tabloları Sheets'e döker.
    //
    // KOTA: tüm tablolar TEK values.batchUpdate isteğiyle yazılır (22 ayrı
    // istek yerine 1). Toplam Sheets isteği: metadata + (gerekirse sekme açma)
    // + temizleme + yazma = en fazla 4.
    //
    // Sekme adları "Arşiv - X" biçiminde: mevcut sekmelerine DOKUNULMAZ,
    // oradaki eski kayıtların olduğu gibi kalır.
    // ============================================================
    if (resource === 'arsivYaz') {
      const gizli = process.env.REALTIME_SYNC_SECRET;
      if (gizli && (req.query.secret || (req.body || {}).secret) !== gizli) {
        return res.status(401).json({ error: 'yetkisiz' });
      }

      const basliklar = {
        'Kategori Sözlüğü': KATEGORI_TAB.headers,
        'Giderler': GIDER_TAB.headers,
        'Gelirler': GELIR_TAB.headers,
        'Toptancı Hareketleri': TOPTANCI_HAREKET_TAB.headers,
        'Ortaklar Hareketleri': ORTAK_HAREKET_TAB.headers,
        'Ekstre Hareketleri': EKSTRE_TAB.headers,
        'Fatura ve Fişler': FATURA_FIS_TAB.headers,
        'Tahsilat Makbuzları': TAHSILAT_TAB.headers,
        'Fatura Firmaları': FF_FIRMA_TAB.headers,
        'Ödeme Yöntemleri': ODEME_YONTEMI_TAB.headers,
        'Banka Kart Hareketleri': BANKA_KART_TAB.headers,
        'Personel': PERSONEL_TAB.headers,
        'Sabit Giderler': SABIT_GIDER_TAB.headers,
        'Tahakkuklar': TAHAKKUK_TAB.headers,
        'Devamsızlık': DEVAMSIZLIK_TAB.headers,
        'Yemek Kartı Tanımları': YK_KART_TAB.headers,
        'Yemek Kartı Faturaları': YK_FATURA_TAB.headers,
        'Muhasebe Ayarları': AYAR_TAB.headers,
        'Tedarikçi Kategori Sözlüğü': TEDARIKCI_TAB.headers,
        'Malzeme Eşleştirme Sözlüğü': ESLESTIRME_TAB.headers,
        'Fatura İçe Aktarma Log': XML_LOG_TAB.headers,
        'Toptancılar': ['ID', 'Firma Adı', 'Kategori', 'Telefon', 'Yetkili Kişi', 'Adres', 'Not', 'Bakiye', 'Eklenme Tarihi', 'Durum'],
        // 23 Eylül'de taşınanlar — bunlar da her gece arşive yazılıyor.
        'Gün Sonu Kasa': ['Tarih', 'Toplam Nakit Para', 'Nakit Küpür Detayı', 'Kasa Avansı', 'POS Toplamı', 'POS Satırları', 'Ana Kasa Toplamı', 'Ana Kasa Harcamaları', 'Günlük Kasa Toplamı', 'Günlük Kasa Harcamaları', 'Cari Toplam', 'Cari Detay', 'Yemek Kartı Toplam', 'Yemek Kartı Detay', 'Hippos Cirosu', 'Ana Kasa Takibi', 'Kaydeden Saat'],
        'Malzeme Havuzu': ['ID', 'Malzeme Adı', 'Birim', 'Aktif', 'Oluşturulma Tarihi'],
        'Malzeme Maliyet Geçmişi': MALIYET_TAB.headers,
        'Reçete Geçmişi': ['ID', 'ÜrünID', 'Ürün Adı', 'Versiyon', 'Aktif', 'Başlangıç Tarihi', 'Bitiş Tarihi'],
        'Reçete Kalemleri': ['ID', 'ReceteID', 'MalzemeID', 'Malzeme Adı', 'Miktar', 'Birim'],
        'Realtime Kullanım': ['ID', 'row_type', 'date', 'hour', 'total_messages', 'table_state', 'sales_history', 'cari_hareketler', 'cari_odemeler', 'cari_faturalar', 'packages', 'paket_teslimatlari', 'mutfak_hazir_notlar', 'presence_sync', 'presence_join', 'presence_leave', 'other', 'full', 'paketci', 'mutfak', 'monthly_limit', 'usage_percent'],
      };

      // 1) Postgres'ten oku (Sheets'e hiç gitmeden)
      const paketler = [];
      for (const [tabAdi, headers] of Object.entries(basliklar)) {
        const t = TABLOLAR[tabAdi];
        const satirlar = await pgOku(t);
        paketler.push({ hedef: `Arşiv - ${tabAdi}`, headers, satirlar });
      }

      // 2) Eksik arşiv sekmelerini TEK batchUpdate ile aç
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const mevcutSekmeler = new Set(meta.data.sheets.map((s) => s.properties.title));
      const acilacak = paketler.filter((p) => !mevcutSekmeler.has(p.hedef));
      if (acilacak.length) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: acilacak.map((p) => ({ addSheet: { properties: { title: p.hedef } } })) },
        });
      }

      // 3) Eski içeriği TEK batchClear ile temizle (silinen kayıtlar arşivde kalmasın)
      await sheets.spreadsheets.values.batchClear({
        spreadsheetId: SHEET_ID,
        requestBody: { ranges: paketler.map((p) => `${p.hedef}!A:AZ`) },
      });

      // 4) Hepsini TEK batchUpdate ile yaz
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: paketler.map((p) => ({
            range: `${p.hedef}!A1`,
            values: [p.headers, ...p.satirlar],
          })),
        },
      });

      const ozet = paketler.map((p) => ({ sekme: p.hedef, satir: p.satirlar.length }));

      // 5) TESLİMAT FOTOĞRAFI TEMİZLİĞİ — 7 günden eski fotoğraflar silinir.
      // Arşivden bağımsız: burada bir hata olursa arşiv yine başarılı sayılır.
      // DİKKAT: storage.remove() izin yoksa HATA VERMEDEN hiçbir şey silmez
      // (bu yüzden eskiden 292 sahipsiz dosya birikmişti). O yüzden "silindi"
      // sayısını istediğimiz listeden değil, Supabase'in DÖNDÜRDÜĞÜ listeden alıyoruz.
      let fotoTemizlik;
      try {
        const KOVA = 'teslimat-fotograflari';
        const sinir = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const eskiler = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db.storage.from(KOVA).list('', {
            limit: 1000, offset, sortBy: { column: 'created_at', order: 'asc' },
          });
          if (error) throw new Error(`liste alınamadı: ${error.message}`);
          if (!data || !data.length) break;
          for (const f of data) {
            if (f.id && f.created_at && new Date(f.created_at).getTime() < sinir) eskiler.push(f.name);
          }
          if (data.length < 1000) break;
        }

        const silinenler = [];
        for (let i = 0; i < eskiler.length; i += 100) {
          const { data, error } = await db.storage.from(KOVA).remove(eskiler.slice(i, i + 100));
          if (error) throw new Error(`silinemedi: ${error.message}`);
          (data || []).forEach((d) => silinenler.push(d.name));
        }

        // Fotoğrafı silinen kayıtların bağlantısını temizle — ekranda kırık "Foto" butonu kalmasın.
        let baglantiTemizlenen = 0;
        for (let i = 0; i < silinenler.length; i += 100) {
          const urlParcalari = silinenler.slice(i, i + 100);
          for (const tablo of ['cari_teslimat_bildirimleri', 'paket_teslimatlari']) {
            const { data: kayitlar, error: okuHata } = await db.from(tablo).select('id, foto_url').not('foto_url', 'is', null);
            if (okuHata) continue;
            const ilgili = (kayitlar || []).filter((k) => urlParcalari.some((ad) => (k.foto_url || '').endsWith(`/${KOVA}/${ad}`)));
            if (!ilgili.length) continue;
            const { error: gunHata } = await db.from(tablo).update({ foto_url: null }).in('id', ilgili.map((k) => k.id));
            if (!gunHata) baglantiTemizlenen += ilgili.length;
          }
        }

        fotoTemizlik = {
          ok: true,
          eskiDosya: eskiler.length,
          silinen: silinenler.length,
          baglantiTemizlenen,
          // İstenen ile silinen farklıysa izin sorunu var demektir — cron cevabında görünür.
          uyari: eskiler.length !== silinenler.length ? 'Bazı dosyalar silinemedi (izin sorunu olabilir)' : undefined,
        };
      } catch (e) {
        fotoTemizlik = { ok: false, hata: e.message };
      }

      return res.status(200).json({
        ok: true,
        zaman: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        toplamSatir: ozet.reduce((a, b) => a + b.satir, 0),
        tablolar: ozet,
        fotoTemizlik,
      });
    }

    // ============================================================
    // TEK SEFERLİK VERİ TAŞIMA — Sheets'teki mevcut kayıtları Postgres'e kopyalar.
    // 23 Eylül taşıması için: Gün Sonu Kasa, Malzeme Havuzu, Malzeme Maliyet Geçmişi,
    // Reçete Geçmişi, Reçete Kalemleri, Realtime Kullanım.
    // Güvenli: hedef tabloda AYNI anahtara sahip satır varsa üzerine yazar (upsert),
    // yani iki kez çalıştırılsa da mükerrer kayıt OLUŞMAZ.
    // İş bittikten ve doğrulandıktan sonra bu blok koddan kaldırılacak.
    // ============================================================
    if (resource === 'sheetsTasi') {
      const gizli = process.env.REALTIME_SYNC_SECRET;
      if (gizli && (req.query.secret || (req.body || {}).secret) !== gizli) {
        return res.status(401).json({ error: 'yetkisiz' });
      }

      // [Sheets sekmesi, son sütun, anahtar kolonu] — anahtar Gün Sonu'nda tarih, diğerlerinde id.
      const kaynaklar = [
        ['Gün Sonu Kasa', 'Q', 'tarih'],
        ['Malzeme Havuzu', 'E', 'id'],
        ['Malzeme Maliyet Geçmişi', 'I', 'id'],
        ['Reçete Geçmişi', 'G', 'id'],
        ['Reçete Kalemleri', 'F', 'id'],
        ['Realtime Kullanım', 'U', 'id'],
      ];

      const sonuc = [];
      for (const [tabAdi, sonSutun, anahtar] of kaynaklar) {
        const t = TABLOLAR[tabAdi];
        try {
          const r = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID, range: `${tabAdi}!A2:${sonSutun}`,
          });
          const satirlar = (r.data.values || []).filter((x) => x[0]);
          if (!satirlar.length) { sonuc.push({ tabAdi, okunan: 0, yazilan: 0 }); continue; }

          // Realtime Kullanım'da Sheets'te ID sütunu yok (anahtar row_type+date+hour),
          // ID'yi burada üretiyoruz ki tablo anahtarı dolsun.
          const nesneler = satirlar.map((satir) => {
            const degerler = tabAdi === 'Realtime Kullanım'
              ? [[satir[0], satir[1], satir[2]].map((v) => String(v ?? '')).join('|'), ...satir]
              : satir;
            const o = {};
            t.kolonlar.forEach((k, i) => {
              const v = degerler[i];
              o[k] = v === null || v === undefined ? '' : String(v);
            });
            return o;
          });

          let yazilan = 0;
          for (let i = 0; i < nesneler.length; i += 500) {
            const dilim = nesneler.slice(i, i + 500);
            const { error } = await db.from(t.tablo).upsert(dilim, { onConflict: anahtar });
            if (error) throw new Error(error.message);
            yazilan += dilim.length;
          }
          sonuc.push({ tabAdi, okunan: satirlar.length, yazilan });
        } catch (e) {
          sonuc.push({ tabAdi, hata: e.message });
        }
      }

      return res.status(200).json({ ok: true, sonuc });
    }

    if (resource === 'kategoriler') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      await ensureKategoriSeed(sheets);
      const katRows = await getRows(sheets, KATEGORI_TAB);
      if (!katRows.some((r) => metinNormalize(r[1]) === metinNormalize(DEVIR_KATEGORI))) {
        const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const devirSatiri = [benzersizId(), DEVIR_KATEGORI, tarih];
        await satirlarEkle(KATEGORI_TAB, [devirSatiri]);
        katRows.push(devirSatiri);
      }
      return res.status(200).json({ kategoriler: katRows.map((r) => r[1]).filter(Boolean), devirKategori: DEVIR_KATEGORI });
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
          await satirlarEkle(TOPTANCILAR_TABCONFIG, yeniToptancilarSatirlari.slice(1));
        }
      }
      if (giderSatirlariToplu.length) {
        await ensureTab(sheets, GIDER_TAB.tab, GIDER_TAB.headers);
        await satirlarEkle(GIDER_TAB, giderSatirlariToplu);
      }
      if (hareketSatirlariToplu.length) {
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await satirlarEkle(TOPTANCI_HAREKET_TAB, hareketSatirlariToplu);
      }
      if (maliyetSatirlariToplu.length) {
        await satirlarEkle(MALIYET_TAB, maliyetSatirlariToplu);
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
        await satirlarEkle(GIDER_TAB, giderSatirlari);
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
        await satirlarEkle(MALIYET_TAB, maliyetSatirlari);
      }

      return res.status(200).json({ ok: true, faturaId });
    }

    // ---- ADIM 4b: Satış faturasını onayla ve kaydet ----
    // ARTIK Satış Faturası sekmesine DEĞİL — Gelirler sekmesine yazılıyor
    // ("Diğer Gelirler" varsayılan kategori, kullanıcı Giderler XML modalında değiştiremiyor
    // çünkü bu akış alış odaklı — satış faturaları nadiren XML'den geliyor).
    // ---- ADIM 4b: Satış faturalarını toplu kaydet ----
    // Alış faturalarıyla aynı batch mantığı — tüm satış faturaları tek body'de gelir,
    // tek append'te Gelirler sekmesine yazılır. Frontend'deki for döngüsü kaldırıldı.
    if (resource === 'xmlKaydetSatisBatch') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { faturalar: gonderilen } = req.body || {};
      if (!Array.isArray(gonderilen) || gonderilen.length === 0) {
        return res.status(400).json({ error: 'faturalar dizisi boş veya eksik' });
      }
      const now = new Date();
      const kayitZamani = now.toISOString();
      const gelirSatirlari = gonderilen.map((f) => {
        const kayitTarih = f.tarih ? isoToTrTarih(f.tarih) || f.tarih : now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        return [benzersizId(), kayitTarih, 'Diğer Gelirler', f.aliciAdi, f.faturaNo, f.toplamKdvDahil ?? 0, '', '', 'Tahsil Edildi', kayitZamani];
      });
      await ensureTab(sheets, GELIR_TAB.tab, GELIR_TAB.headers);
      await satirlarEkle(GELIR_TAB, gelirSatirlari);
      return res.status(200).json({ ok: true, kaydedilen: gelirSatirlari.length });
    }

    // ---- ADIM 4b-compat: Tek satış faturası (geriye dönük uyumluluk) ----
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
        await satirGuncelle(EKSTRE_TAB, rowValues);
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
        const tarih = excelTarihiCoz(h[cTarih]);
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
          // Önce fintek/yemek kartı komisyon firması mı diye kontrol et — bu firmalar
          // tedarikçi değil, aracı kurum. Toptancı carisine DEĞİL, doğrudan Giderlere yazılır.
          if (fintekKomisyonMu(saticiAdi)) {
            eslesmeDurumu = 'fintek_komisyon';
            kategori = 'Yemek Kart-Banka Masf.';
            ozet.faturaBekliyor++;
          } else {
            const eslesen = toptancilarRows.find((r) => firmaEslesirMi(saticiAdi, r[1]));
            if (eslesen) {
              // KRİTİK DÜZELTME: Uyumsoft faturası henüz gelmemiş kart ödemeleri
              // toptancı carisini HEMEN eksiye geçirmemeli — "Faturası Beklenenler"
              // havuzunda beklеmeli. Kullanıcı "Cariye Ödeme Olarak İşle" butonuna
              // bastığında VEYA Uyumsoft faturasıyla eşleştiğinde cari güncellenir.
              // ÖNCEKİ HATALI DAVRANIŞ: firmaEslesirMi true → anında 'odeme' hareketi yazılıyordu
              // → fatura gelmeden bakiye düşüyordu → toptancı Köfteci Yusuf 27.645 TL eksi görünüyordu.
              eslesmeDurumu = 'fatura_bekliyor';
              eslesenToptanciId = eslesen[0];
              kategori = eslesen[2] || MCC_KATEGORI[saticiKodu] || '';
              ozet.faturaBekliyor++;
              // toptanciOdemeleri listesine ARTIK eklenmiyoruz — cari hareketi yazılmaz.
            } else {
              eslesmeDurumu = 'fatura_bekliyor';
              kategori = MCC_KATEGORI[saticiKodu] || '';
              ozet.faturaBekliyor++;
            }
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
        await satirlarEkle(EKSTRE_TAB, yeniSatirlar);
      }
      if (toptanciOdemeleri.length) {
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await satirlarEkle(TOPTANCI_HAREKET_TAB, toptanciOdemeleri);
      }

      return res.status(200).json({ ok: true, ozet });
    }

    // "Faturası Beklenenler" havuzundaki bir satırı işle. İKİ SEÇENEK:
    // 1) Giderler'e aktar (fatura hiç gelmeyecekse ya da fişle kapatılacaksa)
    // 2) Cariye ödeme olarak işle (ödeme yapıldı, fatura ayrıca Uyumsoft'tan gelecek)
    //    → Toptancı Hareketleri'ne 'odeme' kaydı düşülür; fatura gelince ayrıca 'fatura' kaydı açılır.
    if (resource === 'ekstreGidereIsle') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { ekstreId, kategori, cariyeOdemeOlarakIsle } = req.body || {};
      if (!ekstreId) return res.status(400).json({ error: 'ekstreId gerekli' });

      const rows = await getRows(sheets, EKSTRE_TAB);
      const idx = rows.findIndex((r) => r[0] === ekstreId);
      if (idx === -1) return res.status(404).json({ error: 'ekstre kaydı bulunamadı' });
      const kayit = rowToEkstre(rows[idx]);
      const kayitZamani = new Date().toISOString();
      let giderId = '';

      if (cariyeOdemeOlarakIsle) {
        // Toptancı carisine ödeme hareketi düş — fatura ayrıca gelecek.
        if (!kayit.eslesenToptanciId) return res.status(400).json({ error: 'Bu satır bir toptancıya bağlı değil; önce cari eşleştirmesi gerekiyor' });
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await appendRow(sheets, TOPTANCI_HAREKET_TAB, [
          benzersizId(), kayit.eslesenToptanciId, kayit.tarih, 'odeme', kayit.tutar,
          `Kredi Kartı Ödemesi — ${kayit.saticiAdi}`, '', 'Kredi Kartı', kayitZamani,
        ]);
        const rowValues = [...rows[idx]];
        rowValues[10] = 'toptanci_odemesi';
        await satirGuncelle(EKSTRE_TAB, rowValues);
        return res.status(200).json({ ok: true, islem: 'cariye_odeme' });
      }

      // Giderler'e aktar (eski davranış, kategori zorunlu).
      if (!kategori) return res.status(400).json({ error: 'kategori gerekli' });
      giderId = benzersizId();
      await appendRow(sheets, GIDER_TAB, [
        giderId, kayit.tarih, kategori, kayit.saticiAdi || kayit.aciklama, kayit.tutar, '',
        'Ödendi', 'Kart Ekstresi', kayit.eslesenToptanciId || '', kayitZamani, giderId,
      ]);
      // Toptancıya bağlı bir satırsa giderlere aktarıldığında borç hareketi de düş.
      if (kayit.eslesenToptanciId) {
        await ensureTab(sheets, TOPTANCI_HAREKET_TAB.tab, TOPTANCI_HAREKET_TAB.headers);
        await appendRow(sheets, TOPTANCI_HAREKET_TAB, [
          benzersizId(), kayit.eslesenToptanciId, kayit.tarih, 'fatura', kayit.tutar,
          `Kart Ekstresi — ${kayit.saticiAdi}`, giderId, '', kayitZamani,
        ]);
      }

      const rowValues = [...rows[idx]];
      rowValues[10] = 'gidere_islendi';
      rowValues[12] = giderId;
      rowValues[13] = kategori;
      await satirGuncelle(EKSTRE_TAB, rowValues);
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
        gunSonuRows = await getRows(sheets, GUNSONU_TAB);
      } catch { gunSonuRows = []; }
      // Gün Sonu Kasa sütun düzeni (api/gunsonu.js HEADERS ile birebir):
      // 0=Tarih, 1=Toplam Nakit Para, 2=Nakit Küpür, 3=Kasa Avansı, 4=POS Toplamı, 5=POS Satırları...
      // DÜZELTME: burada POS Toplamı r[3] diye okunuyordu — o sütun Kasa Avansı.
      // Doğrusu r[4]. Bu yüzden hakediş karşılaştırması yanlış sütunla yapılıyordu.
      // Tarih alanı eski kayıtlarda Excel serial date (46266 gibi) olabilir — dönüştür.
      const posByTarih = {};
      gunSonuRows.forEach((r) => {
        const t = excelTarihiCoz(String(r[0] || '').trim());
        if (!t) return;
        posByTarih[t] = (posByTarih[t] || 0) + sayiCoz(r[4]);
      });

      // Ekstre tarihlerini de serial date'ten düzelt (eski yüklenen kayıtlar için)
      const hakedislerDuzeltilmis = hakedisler.map(h => ({
        ...h,
        tarih: excelTarihiCoz(h.tarih) || h.tarih,
      }));

      // Hakediş bankaya SABİT olarak ertesi gün yatar — eşleşen günsonu POS cirosu her
      // zaman (hakediş yatış tarihi - 1 gün). "En yakın olanı seç" gibi esnek bir arama
      // yapılmaz (kullanıcı kararı, 8 Eylül).
      const oncekiGun = (trTarih) => {
        const d = trTarihiCozServer(trTarih);
        if (!d) return null;
        d.setDate(d.getDate() - 1);
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
      };

      const sonuc = hakedislerDuzeltilmis.map((h) => {
        const ciroTarihi = oncekiGun(h.tarih);
        const ciroTutari = ciroTarihi && posByTarih[ciroTarihi] !== undefined ? posByTarih[ciroTarihi] : null;
        const fark = ciroTutari !== null ? Math.round((ciroTutari - h.tutar) * 100) / 100 : null;
        return { ...h, ciroTarihi: ciroTutari !== null ? ciroTarihi : null, ciroTutari, fark };
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
        await satirGuncelle(GIDER_TAB, rowValues);
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
          await satirGuncelle(GIDER_TAB, rowValues);
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
        await satirGuncelle(GELIR_TAB, rowValues);
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
          await satirGuncelle(GIDER_TAB, rowValues2);
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

    // ============================================================
    // YENİ ÜÇLÜ: Fatura ve Fiş Girişi + Tahsilat Makbuzu + Banka/Kart Takip
    // Kullanıcı kararı (9 Eylül): bu üçlü TAMAMEN AYRI sheet'lerde yaşar, mevcut
    // Giderler / Toptancı Hareketleri sekmelerine HİÇ DOKUNMAZ. Supabase'den veri
    // ALINMAZ — sadece bu ekranlardan elle girilen bilgiler kaydedilir.
    // ============================================================

    if (resource === 'faturaFis') {
      if (req.method === 'GET') {
        const [ffRows, tahRows, firmaRows, oyRows] = await Promise.all([
          getRows(sheets, FATURA_FIS_TAB),
          getRows(sheets, TAHSILAT_TAB),
          getRows(sheets, FF_FIRMA_TAB),
          ensureOdemeYontemleri(sheets),
        ]);
        const kayitlar = ffRows.map(rowToFaturaFis);
        const tahsilatlar = tahRows.map(rowToTahsilat);
        const firmalar = firmaListesiCikar(firmaRows, kayitlar, tahsilatlar);
        return res.status(200).json({
          records: kayitlar,
          firmalar,
          odemeYontemleri: oyRows.map(rowToOdemeYontemi),
        });
      }

      if (req.method === 'POST') {
        const {
          tarih, firmaAdi, faturaNo, aciklama, giderKategorisi,
          odemeTuru, odemeDetay, faturaTutari, odemeTutari, kaynakFaturaID,
        } = req.body || {};
        if (!firmaAdi || !String(firmaAdi).trim()) return res.status(400).json({ error: 'firmaAdi gerekli' });
        if (faturaTutari === undefined || faturaTutari === null || faturaTutari === '') {
          return res.status(400).json({ error: 'faturaTutari gerekli' });
        }

        const now = new Date();
        const trTarih = tarih || now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const p = trTarihiParcala(trTarih);
        const fTutar = ondalikParseServer(faturaTutari);
        const oTutar = ondalikParseServer(odemeTutari || 0);
        const kategoriYaz = odemeTuru === 'Devir' ? DEVIR_KATEGORI : (giderKategorisi || '');

        // Kayıt SONRASI bakiye — mevcut bakiyeye bu faturanın kalan borcu ekleniyor.
        const [ffRows, tahRows] = await Promise.all([
          getRows(sheets, FATURA_FIS_TAB),
          getRows(sheets, TAHSILAT_TAB),
        ]);
        const oncekiBakiye = firmaBakiyesi(firmaAdi, ffRows.map(rowToFaturaFis), tahRows.map(rowToTahsilat));
        const yeniBakiye = Math.round((oncekiBakiye + (fTutar - oTutar)) * 100) / 100;

        const id = benzersizId();
        const gunlukHarcama = req.body.gunlukHarcama === true || req.body.gunlukHarcama === 'true';
        await appendRow(sheets, FATURA_FIS_TAB, [
          id, trTarih, p.gun, p.ay, p.yil, String(firmaAdi).trim(), faturaNo || '', aciklama || '',
          kategoriYaz, odemeTuru || '', odemeDetay || '', fTutar,
          ondalikParseServer(req.body.kdvTutari || 0),
          ondalikParseServer(req.body.iskontoTutari || 0),
          oTutar, bakiyeDurumuEtiketi(yeniBakiye), yeniBakiye, kaynakFaturaID || '',
          gunlukHarcama ? 'TRUE' : 'FALSE', now.toISOString(),
        ]);

        // Peşin ödeme kredi kartı / banka havalesiyle yapıldıysa o hesabın hareketine de düşer.
        if (oTutar > 0 && hesapHareketiGerekir(odemeTuru)) {
          await appendRow(sheets, BANKA_KART_TAB, [
            benzersizId(), trTarih, odemeTuru, odemeDetay || '', 'GİDEN', oTutar,
            `${firmaAdi}${faturaNo ? ' — ' + faturaNo : ''}`, id, now.toISOString(),
          ]);
        }

        return res.status(200).json({ ok: true, id, oncekiBakiye, yeniBakiye });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Yeni firma kaydı — ayrı "Fatura Firmaları" sekmesine yazılır.
    if (resource === 'faturaFisFirmaEkle') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { firmaAdi, giderKategorisi, gunlukHarcama } = req.body || {};
      if (!firmaAdi || !String(firmaAdi).trim()) return res.status(400).json({ error: 'firmaAdi gerekli' });
      const ad = String(firmaAdi).trim();
      await ensureTab(sheets, FF_FIRMA_TAB.tab, FF_FIRMA_TAB.headers);
      const mevcut = await getRows(sheets, FF_FIRMA_TAB);
      const adNorm = metinNormalize(ad);
      if (mevcut.some((r) => metinNormalize(r[1]) === adNorm)) {
        return res.status(200).json({ ok: true, zatenVar: true, firmaAdi: ad });
      }
      const id = benzersizId();
      await satirlarEkle(FF_FIRMA_TAB, [[id, ad, giderKategorisi || '', gunlukHarcama ? 'TRUE' : 'FALSE', new Date().toISOString()]]);
      return res.status(200).json({ ok: true, firmaAdi: ad, id });
    }

    // Günlük harcama firmalarını listele (GunlukHarcama=TRUE olanlar)
    if (resource === 'gunlukHarcamaFirmalar') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const rows = await getRows(sheets, FF_FIRMA_TAB);
      const firmalar = rows
        .filter((r) => r[3] === 'TRUE')
        .map((r) => ({ id: r[0], firmaAdi: r[1] || '', giderKategorisi: r[2] || '' }));
      return res.status(200).json({ firmalar });
    }

    // Günlük harcama kaydı — kasa harcama mini formundan gelir, GunlukHarcama=TRUE olarak işaretlenir.
    // Tarih otomatik (bugün), fatura no yok, ödeme türü Nakit (sabitleştirildi), bakiye hesabı yok.
    if (resource === 'gunlukHarcamaKaydet') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { firmaAdi, giderKategorisi, aciklama, faturaTutari, giderId, kaynak } = req.body || {};
      if (!firmaAdi || !String(firmaAdi).trim()) return res.status(400).json({ error: 'firmaAdi gerekli' });
      if (!faturaTutari) return res.status(400).json({ error: 'faturaTutari gerekli' });
      const now = new Date();
      const trTarih = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const p = trTarihiParcala(trTarih);
      const fTutar = ondalikParseServer(faturaTutari);
      const anaKasaFlag = kaynak === 'anaKasa' ? 'TRUE' : 'FALSE';

      // DEĞİŞİKLİK (16 Eylül): Eskiden giderId gönderilse bile HER KAYDET yeni satır
      // ekliyordu — bu yüzden aynı gider düzenlenince sheet'te mükerrer satır oluşuyordu.
      // Artık giderId varsa o satır bulunup GÜNCELLENİYOR (tek kaynak ilkesi), yoksa
      // yeni satır ekleniyor.
      if (giderId) {
        const rows = await getRows(sheets, FATURA_FIS_TAB);
        const idx = rows.findIndex((r) => r[0] === giderId);
        if (idx >= 0) {
          const rowValues = [...rows[idx]];
          // Eski satır kısa olabilir (AnaKasaHarcama sütunu eklenmeden yazılmış) —
          // sheet genişliğine tamamlanmazsa update aralığı ile değer sayısı uyuşmaz.
          while (rowValues.length < FATURA_FIS_TAB.headers.length) rowValues.push('');
          rowValues[5] = String(firmaAdi).trim();
          rowValues[7] = aciklama || '';
          rowValues[8] = giderKategorisi || '';
          rowValues[11] = fTutar;
          rowValues[18] = 'TRUE';
          rowValues[20] = anaKasaFlag;
          await satirGuncelle(FATURA_FIS_TAB, rowValues);
          return res.status(200).json({ ok: true, id: giderId, guncellendi: true });
        }
        // id gönderildi ama satır bulunamadı (silinmiş olabilir) — yeni satır olarak eklenir.
      }

      const id = giderId || benzersizId();
      await appendRow(sheets, FATURA_FIS_TAB, [
        id, trTarih, p.gun, p.ay, p.yil, String(firmaAdi).trim(), '', aciklama || '',
        giderKategorisi || '', 'Nakit', '', fTutar, 0, 0, 0,
        'Hesap Yok', 0, '', 'TRUE', now.toISOString(), anaKasaFlag,
      ]);
      return res.status(200).json({ ok: true, id });
    }

    // Bugünün hızlı nakit giderlerini listele — Gün Sonu ve Yönetim Paneli'ndeki
    // harcama bölümlerinin TEK veri kaynağı. İki ekran da aynı listeyi gösterir.
    // ?tarih=GG.AA.YYYY verilmezse bugün (Europe/Istanbul) alınır.
    if (resource === 'gunlukHarcamalar') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const hedefTarih = req.query.tarih
        || new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const [rows, tahRowsGH] = await Promise.all([
        getRows(sheets, FATURA_FIS_TAB),
        getRows(sheets, TAHSILAT_TAB),
      ]);
      const kayitlar = rows
        .map(rowToFaturaFis)
        .filter((k) => k.gunlukHarcama && k.tarih === hedefTarih)
        .map((k) => ({
          id: k.id, firmaAdi: k.firmaAdi, giderKategorisi: k.giderKategorisi,
          aciklama: k.aciklama, tutar: k.faturaTutari,
          kaynak: k.anaKasaHarcama ? 'anaKasa' : 'gunlukKasa',
          kayitZamani: k.kayitZamani, silinebilir: true,
        }))
        // Personel / sabit gider NAKİT ödemeleri de kasadan çıkar; bu ekranlarda
        // görünür ama buradan silinemez (kaynağı Tahsilat Makbuzları).
        .concat(tahRowsGH.map(rowToTahsilat)
          .filter((t) => t.kasaKaynak && t.tarih === hedefTarih)
          .map((t) => ({
            id: t.id, firmaAdi: t.firmaAdi, giderKategorisi: 'Personel / Sabit Gider Ödemesi',
            aciklama: t.aciklama, tutar: t.tutar, kaynak: t.kasaKaynak,
            kayitZamani: t.kayitZamani, silinebilir: false,
          })));
      const anaKasa = kayitlar.filter((k) => k.kaynak === 'anaKasa');
      const gunlukKasa = kayitlar.filter((k) => k.kaynak === 'gunlukKasa');
      return res.status(200).json({
        tarih: hedefTarih,
        anaKasa,
        gunlukKasa,
        anaKasaToplam: anaKasa.reduce((s, k) => s + k.tutar, 0),
        gunlukKasaToplam: gunlukKasa.reduce((s, k) => s + k.tutar, 0),
      });
    }

    // Hızlı nakit gider satırını sil. Sheets'te satır fiziksel olarak silinir
    // (deleteDimension) — böylece liste ve toplamlar anında doğru kalır.
    if (resource === 'gunlukHarcamaSil') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { giderId } = req.body || {};
      if (!giderId) return res.status(400).json({ error: 'giderId gerekli' });
      const rows = await getRows(sheets, FATURA_FIS_TAB);
      const idx = rows.findIndex((r) => r[0] === giderId);
      if (idx < 0) return res.status(404).json({ error: 'Kayıt bulunamadı' });
      await satirSil(FATURA_FIS_TAB, giderId);
      return res.status(200).json({ ok: true });
    }

    // Yeni ödeme yöntemi / kart / banka ekleme.
    if (resource === 'odemeYontemiEkle') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tur, ad } = req.body || {};
      if (!tur || !String(tur).trim()) return res.status(400).json({ error: 'tur gerekli' });
      await ensureOdemeYontemleri(sheets);
      const mevcut = await getRows(sheets, ODEME_YONTEMI_TAB);
      const turNorm = metinNormalize(tur);
      const adNorm = metinNormalize(ad || '');
      if (mevcut.some((r) => metinNormalize(r[1]) === turNorm && metinNormalize(r[2]) === adNorm)) {
        return res.status(200).json({ ok: true, zatenVar: true });
      }
      await appendRow(sheets, ODEME_YONTEMI_TAB, [benzersizId(), String(tur).trim(), String(ad || '').trim(), new Date().toISOString()]);
      return res.status(200).json({ ok: true });
    }

    if (resource === 'tahsilat') {
      if (req.method === 'GET') {
        const [ffRows, tahRows, firmaRows, oyRows] = await Promise.all([
          getRows(sheets, FATURA_FIS_TAB),
          getRows(sheets, TAHSILAT_TAB),
          getRows(sheets, FF_FIRMA_TAB),
          ensureOdemeYontemleri(sheets),
        ]);
        const kayitlar = ffRows.map(rowToFaturaFis);
        const tahsilatlar = tahRows.map(rowToTahsilat);
        return res.status(200).json({
          records: tahsilatlar,
          firmalar: firmaListesiCikar(firmaRows, kayitlar, tahsilatlar),
          odemeYontemleri: oyRows.map(rowToOdemeYontemi),
        });
      }

      if (req.method === 'POST') {
        const { tarih, firmaAdi, faturaNo, aciklama, odemeTuru, odemeDetay, tutar, kaynakEkstreID } = req.body || {};
        if (!firmaAdi || !String(firmaAdi).trim()) return res.status(400).json({ error: 'firmaAdi gerekli' });
        if (tutar === undefined || tutar === null || tutar === '') return res.status(400).json({ error: 'tutar gerekli' });

        const now = new Date();
        const trTarih = tarih || now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const p = trTarihiParcala(trTarih);
        const odenen = ondalikParseServer(tutar);

        const [ffRows, tahRows] = await Promise.all([
          getRows(sheets, FATURA_FIS_TAB),
          getRows(sheets, TAHSILAT_TAB),
        ]);
        const oncekiBakiye = firmaBakiyesi(firmaAdi, ffRows.map(rowToFaturaFis), tahRows.map(rowToTahsilat));
        const yeniBakiye = Math.round((oncekiBakiye - odenen) * 100) / 100;

        const id = benzersizId();
        await appendRow(sheets, TAHSILAT_TAB, [
          id, trTarih, p.gun, p.ay, p.yil, String(firmaAdi).trim(), faturaNo || '', aciklama || '',
          odemeTuru || '', odemeDetay || '', odenen, oncekiBakiye, yeniBakiye,
          kaynakEkstreID || '', now.toISOString(),
        ]);

        if (hesapHareketiGerekir(odemeTuru)) {
          await appendRow(sheets, BANKA_KART_TAB, [
            benzersizId(), trTarih, odemeTuru, odemeDetay || '', 'GİDEN', odenen,
            `Tahsilat — ${firmaAdi}`, id, now.toISOString(),
          ]);
        }

        return res.status(200).json({ ok: true, id, oncekiBakiye, yeniBakiye });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Bir firmanın kayıt öncesi bakiyesi (form "Güncel Bakiye" alanı için).
    if (resource === 'firmaBakiye') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const firmaAdi = req.query.firmaAdi || '';
      if (!firmaAdi) return res.status(400).json({ error: 'firmaAdi gerekli' });
      const [ffRows, tahRows] = await Promise.all([
        getRows(sheets, FATURA_FIS_TAB),
        getRows(sheets, TAHSILAT_TAB),
      ]);
      const bakiye = firmaBakiyesi(firmaAdi, ffRows.map(rowToFaturaFis), tahRows.map(rowToTahsilat));
      return res.status(200).json({ bakiye, durum: bakiyeDurumuEtiketi(bakiye) });
    }

    // Banka/Kart Takip sekmesi — hesap bazlı hareket dökümü.
    if (resource === 'bankaKartHareket') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const [hareketRows, oyRows] = await Promise.all([
        getRows(sheets, BANKA_KART_TAB),
        ensureOdemeYontemleri(sheets),
      ]);
      const tumHareketler = hareketRows.map(rowToBankaKartHareket);
      const yontemler = oyRows.map(rowToOdemeYontemi);
      let records = tumHareketler;
      if (req.query.hesapAdi) records = records.filter((r) => r.hesapAdi === req.query.hesapAdi);
      const hesaplar = yontemler.filter((o) => hesapHareketiGerekir(o.tur) && o.ad);
      const ozet = hesapOzetleri(yontemler, tumHareketler);
      return res.status(200).json({ records, hesaplar, ozet });
    }

    // Tek hareket ekle (günsonu POS → Ödeal, peşin ödeme vb.)
    // kaynakId verilirse AYNI kaynak için yeni satır açılmaz, mevcut satır güncellenir
    // (Günsonu aynı gün birden fazla kaydedilince POS'un mükerrer yazılmasını önler).
    if (resource === 'bankaKartHareketEkle') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tarih, hesapTuru, hesapAdi, yon, tutar, aciklama, kaynakId } = req.body || {};
      const tutarSayi = ondalikParseServer(tutar);
      if (!hesapTuru || (!kaynakId && !tutarSayi)) return res.status(400).json({ error: 'tutar ve hesapTuru gerekli' });
      const now = new Date();
      const trTarih = tarih || now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const yonYaz = yon || 'GİREN';

      if (kaynakId) {
        const rows = await getRows(sheets, BANKA_KART_TAB);
        let idx = rows.findIndex((r) => r[7] === kaynakId);
        // Bu düzeltmeden ÖNCE yazılmış (KaynakID boş) aynı günün satırı varsa onu sahiplen.
        if (idx < 0) {
          idx = rows.findIndex((r) => !r[7] && r[1] === trTarih && (r[3] || '') === (hesapAdi || '')
            && (r[4] || '') === yonYaz && (r[6] || '') === (aciklama || ''));
        }
        if (idx >= 0) {
          await satirGuncelle(BANKA_KART_TAB, [rows[idx][0], trTarih, hesapTuru, hesapAdi || '', yonYaz, tutarSayi, aciklama || '', kaynakId, now.toISOString()]);
          return res.status(200).json({ ok: true, guncellendi: true });
        }
        if (!tutarSayi) return res.status(200).json({ ok: true, atlandi: true });
      }

      await appendRow(sheets, BANKA_KART_TAB, [
        benzersizId(), trTarih, hesapTuru, hesapAdi || '', yonYaz,
        tutarSayi, aciklama || '', kaynakId || '', now.toISOString(),
      ]);
      return res.status(200).json({ ok: true });
    }

    // Banka/kart hesabının açılış bakiyesi, açılış tarihi ve limiti (Ödeme Yöntemleri satırı).
    if (resource === 'hesapAyarKaydet') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { id, limit, acilisBakiyesi, acilisTarihi } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id gerekli' });
      if (acilisTarihi && !trTarihiCozServer(acilisTarihi)) return res.status(400).json({ error: 'açılış tarihi GG.AA.YYYY olmalı' });
      const rows = await ensureOdemeYontemleri(sheets);
      const idx = rows.findIndex((r) => r[0] === id);
      if (idx < 0) return res.status(404).json({ error: 'hesap bulunamadı' });
      const hesapSatiri = [...rows[idx]];
      while (hesapSatiri.length < ODEME_YONTEMI_TAB.headers.length) hesapSatiri.push('');
      hesapSatiri[4] = ondalikParseServer(limit);
      hesapSatiri[5] = ondalikParseServer(acilisBakiyesi);
      hesapSatiri[6] = acilisTarihi || '';
      await satirGuncelle(ODEME_YONTEMI_TAB, hesapSatiri);
      return res.status(200).json({ ok: true });
    }

    // Genel muhasebe ayarları — şimdilik sadece devir tarihi.
    if (resource === 'muhasebeAyar') {
      if (req.method === 'GET') {
        return res.status(200).json({ devirTarihi: await ayarGetir(sheets, 'devirTarihi') });
      }
      if (req.method === 'POST') {
        const devirTarihi = String((req.body || {}).devirTarihi || '').trim();
        if (devirTarihi && !/^\d{2}\.\d{2}\.\d{4}$/.test(devirTarihi)) {
          return res.status(400).json({ error: 'devir tarihi GG.AA.YYYY olmalı' });
        }
        await satirGuncelle(AYAR_TAB, ['devirTarihi', devirTarihi, new Date().toISOString()]);
        return res.status(200).json({ ok: true, devirTarihi });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ============================================================
    // PERSONEL + SABİT GİDERLER (tahakkuk modülü)
    // ============================================================

    // Personel listesi: kayıt bilgileri + bu dönemin cari durumu.
    if (resource === 'personel') {
      if (req.method === 'GET') {
        const donem = req.query.donem || bugununDonemi();
        const [pRows, ffRows, tahRows, tkRows, dvRows] = await Promise.all([
          getRows(sheets, PERSONEL_TAB),
          getRows(sheets, FATURA_FIS_TAB),
          getRows(sheets, TAHSILAT_TAB),
          getRows(sheets, TAHAKKUK_TAB),
          getRows(sheets, DEVAMSIZLIK_TAB),
        ]);
        const kayitlar = ffRows.map(rowToFaturaFis);
        const tahsilatlar = tahRows.map(rowToTahsilat);
        const tahakkuklar = tkRows.map(rowToTahakkuk);
        const devamsizliklar = dvRows.map(rowToDevamsizlik);

        const personeller = pRows.map(rowToPersonel).map((pr) => {
          const kendiTahakkuk = tahakkuklar.filter((t) => t.tip === 'Personel' && t.kayitId === pr.id);
          const buDonem = kendiTahakkuk.find((t) => t.donem === donem);
          const sonTahakkuk = kendiTahakkuk.slice().sort((a, b) => (a.donem < b.donem ? 1 : -1))[0];
          // Dönem içi ödemeler (kesinti dahil) — limitler her ay sıfırlanır.
          const donemOdemeleri = tahsilatlar.filter((t) => t.firmaAdi === pr.adSoyad && donemAnahtari(t.tarih) === donem);
          const odenenNakit = donemOdemeleri
            .filter((t) => t.odemeTuru === 'Nakit' || (t.odemeTuru === 'Kesinti' && t.limitKaynak === 'Nakit'))
            .reduce((x, t) => x + t.tutar, 0);
          const odenenHavale = donemOdemeleri
            .filter((t) => t.odemeTuru !== 'Nakit' && !(t.odemeTuru === 'Kesinti' && t.limitKaynak === 'Nakit'))
            .reduce((x, t) => x + t.tutar, 0);
          const dv = devamsizliklar.filter((d) => d.personelId === pr.id && donemAnahtari(d.tarih) === donem);
          const devamsizGun = dv.reduce((x, d) => x + (d.tur === 'Yarım' ? 0.5 : 1), 0);
          const r2 = (x) => Math.round(x * 100) / 100;
          return {
            ...pr,
            bakiye: firmaBakiyesi(pr.adSoyad, kayitlar, tahsilatlar),
            buDonemTahakkuk: buDonem ? buDonem.tutar : 0,
            tahakkukEdildi: !!buDonem,
            sonTahakkukDonem: sonTahakkuk ? sonTahakkuk.donem : '',
            sonTahakkukTarih: sonTahakkuk ? sonTahakkuk.tarih : '',
            kalanNakit: r2(Math.max(0, pr.nakitLimit - odenenNakit)),
            kalanHavale: r2(Math.max(0, pr.havaleLimit - odenenHavale)),
            devamsizGun,
            devamsizlik: dv,
            // Önceki dönemlerden kapanmamış tahakkuk var mı? (bakiye > bu dönem kalanı)
            eskiBorcVar: firmaBakiyesi(pr.adSoyad, kayitlar, tahsilatlar) > (buDonem ? buDonem.tutar : 0) + 0.01,
          };
        });
        return res.status(200).json({ personeller, donem });
      }

      if (req.method === 'POST') {
        const { id, adSoyad, telefon, gorev, iseGiris, netMaas, nakitLimit, havaleLimit, cikisTarihi } = req.body || {};
        if (!adSoyad || !String(adSoyad).trim()) return res.status(400).json({ error: 'adSoyad gerekli' });
        const maas = ondalikParseServer(netMaas || 0);
        const nl = ondalikParseServer(nakitLimit || 0);
        const hl = ondalikParseServer(havaleLimit || 0);
        if (maas > 0 && Math.abs(nl + hl - maas) > 0.01) {
          return res.status(400).json({ error: 'Nakit + havale sınırı net maaşa eşit olmalı' });
        }
        const rows = await getRows(sheets, PERSONEL_TAB);
        const satir = [id || benzersizId(), String(adSoyad).trim(), telefon || '', gorev || '',
          iseGiris || '', maas, nl, hl, cikisTarihi || '', new Date().toISOString()];
        const idx = id ? rows.findIndex((r) => r[0] === id) : -1;
        if (idx >= 0) {
          satir[9] = rows[idx][9] || satir[9];
          await satirGuncelle(PERSONEL_TAB, satir);
          return res.status(200).json({ ok: true, id: satir[0], guncellendi: true });
        }
        await appendRow(sheets, PERSONEL_TAB, satir);
        return res.status(200).json({ ok: true, id: satir[0] });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Devamsızlık kaydı ekle / sil.
    if (resource === 'devamsizlik') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { islem, id, personelId, tarih, tur, aciklama } = req.body || {};
      if (islem === 'sil') {
        if (!id) return res.status(400).json({ error: 'id gerekli' });
        const rows = await getRows(sheets, DEVAMSIZLIK_TAB);
        const idx = rows.findIndex((r) => r[0] === id);
        if (idx < 0) return res.status(404).json({ error: 'Kayıt bulunamadı' });
        await satirSil(DEVAMSIZLIK_TAB, id);
        return res.status(200).json({ ok: true });
      }
      if (!personelId || !tarih) return res.status(400).json({ error: 'personelId ve tarih gerekli' });
      await appendRow(sheets, DEVAMSIZLIK_TAB, [
        benzersizId(), personelId, tarih, tur === 'Yarım' ? 'Yarım' : 'Tam',
        aciklama || '', new Date().toISOString(),
      ]);
      return res.status(200).json({ ok: true });
    }

    // Sabit gider tanımları.
    if (resource === 'sabitGider') {
      if (req.method === 'GET') {
        const donem = req.query.donem || bugununDonemi();
        const [sgRows, ffRows, tahRows, tkRows] = await Promise.all([
          getRows(sheets, SABIT_GIDER_TAB),
          getRows(sheets, FATURA_FIS_TAB),
          getRows(sheets, TAHSILAT_TAB),
          getRows(sheets, TAHAKKUK_TAB),
        ]);
        const kayitlar = ffRows.map(rowToFaturaFis);
        const tahsilatlar = tahRows.map(rowToTahsilat);
        const tahakkuklar = tkRows.map(rowToTahakkuk);
        const giderler = sgRows.map(rowToSabitGider).map((sg) => {
          const kendi = tahakkuklar.filter((t) => t.tip === 'SabitGider' && t.kayitId === sg.id);
          const buDonem = kendi.find((t) => t.donem === donem);
          const son = kendi.slice().sort((a, b) => (a.donem < b.donem ? 1 : -1))[0];
          return {
            ...sg,
            bakiye: firmaBakiyesi(sg.ad, kayitlar, tahsilatlar),
            tahakkukEdildi: !!buDonem,
            buDonemTahakkuk: buDonem ? buDonem.tutar : 0,
            sonTahakkukDonem: son ? son.donem : '',
            sonTahakkukTarih: son ? son.tarih : '',
          };
        });
        return res.status(200).json({ giderler, donem });
      }
      if (req.method === 'POST') {
        const { id, ad, kategori, tutar, odemeGunu, pasif } = req.body || {};
        if (!ad || !String(ad).trim()) return res.status(400).json({ error: 'ad gerekli' });
        const rows = await getRows(sheets, SABIT_GIDER_TAB);
        const satir = [id || benzersizId(), String(ad).trim(), kategori || '',
          ondalikParseServer(tutar || 0), odemeGunu || '', pasif ? 'TRUE' : 'FALSE', new Date().toISOString()];
        const idx = id ? rows.findIndex((r) => r[0] === id) : -1;
        if (idx >= 0) {
          await satirGuncelle(SABIT_GIDER_TAB, satir);
          return res.status(200).json({ ok: true, id: satir[0], guncellendi: true });
        }
        await appendRow(sheets, SABIT_GIDER_TAB, satir);
        return res.status(200).json({ ok: true, id: satir[0] });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Tahakkuk: seçili kayıt veya tüm liste için ayın 1'ine cari borç yazar.
    // Aynı dönemde ikinci kez yazmaz (mükerrer koruması).
    if (resource === 'tahakkukEt') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tip, kayitId, donem: donemGelen, tutar: tutarGelen, toplu } = req.body || {};
      if (tip !== 'Personel' && tip !== 'SabitGider') return res.status(400).json({ error: 'tip geçersiz' });
      const donem = donemGelen || bugununDonemi();
      const tarih = donemIlkGunu(donem);

      const [kayitRows, tkRows] = await Promise.all([
        getRows(sheets, tip === 'Personel' ? PERSONEL_TAB : SABIT_GIDER_TAB),
        getRows(sheets, TAHAKKUK_TAB),
      ]);
      const mevcut = tkRows.map(rowToTahakkuk).filter((t) => t.tip === tip && t.donem === donem);
      let hedefler = (tip === 'Personel' ? kayitRows.map(rowToPersonel) : kayitRows.map(rowToSabitGider));
      // Çıkış yapılmış personel ve pasif sabit gider tahakkuk edilmez.
      hedefler = hedefler.filter((h) => (tip === 'Personel'
        ? !(h.cikisTarihi && trTarihiCozServer(h.cikisTarihi) && trTarihiCozServer(h.cikisTarihi) < trTarihiCozServer(tarih))
        : !h.pasif));
      if (!toplu) {
        if (!kayitId) return res.status(400).json({ error: 'kayitId gerekli' });
        hedefler = hedefler.filter((h) => h.id === kayitId);
        if (!hedefler.length) return res.status(404).json({ error: 'Kayıt bulunamadı' });
      }

      // Satırlar önce hazırlanır, sonra iki TOPLU append ile yazılır. (Her kayıt için
      // ayrı appendRow çağırmak, her çağrının kendi sekme kontrolüyle birlikte
      // toplu tahakkukta onlarca Sheets isteği demek oluyordu — kota hatası.)
      const yazilan = [];
      const atlanan = [];
      const ffSatirlari = [];
      const tkSatirlari = [];
      const now = new Date();
      const p = trTarihiParcala(tarih);
      for (const h of hedefler) {
        const ad = tip === 'Personel' ? h.adSoyad : h.ad;
        const oncekiTahakkuk = mevcut.find((t) => t.kayitId === h.id);
        if (oncekiTahakkuk) { atlanan.push({ ad, tarih: oncekiTahakkuk.kayitZamani, donem }); continue; }
        const tutar = (!toplu && tutarGelen !== undefined && tutarGelen !== null && tutarGelen !== '')
          ? ondalikParseServer(tutarGelen)
          : (tip === 'Personel' ? h.netMaas : h.tutar);
        if (!tutar) { atlanan.push({ ad, tutarsiz: true }); continue; }

        const ffId = benzersizId();
        ffSatirlari.push([
          ffId, tarih, p.gun, p.ay, p.yil, ad, '', `${donem} dönemi tahakkuku`,
          tip === 'Personel' ? PERSONEL_KATEGORI : (h.kategori || 'Diğer Giderler'),
          'Cari', '', tutar, 0, 0, 0, bakiyeDurumuEtiketi(tutar), tutar, '', 'FALSE', now.toISOString(), 'FALSE',
        ]);
        tkSatirlari.push([benzersizId(), tip, h.id, ad, donem, tarih, tutar, ffId, now.toISOString()]);
        yazilan.push({ ad, tutar });
      }

      if (ffSatirlari.length) {
        await ensureTab(sheets, TAHAKKUK_TAB.tab, TAHAKKUK_TAB.headers);
        await satirlarEkle(FATURA_FIS_TAB, ffSatirlari);
        await satirlarEkle(TAHAKKUK_TAB, tkSatirlari);
      }
      return res.status(200).json({ ok: true, yazilan, atlanan, donem });
    }

    // Personel / sabit gider ödemesi. Cari borçtan düşer, gerekiyorsa banka-kart
    // hareketi, kasa kaydı ve ortak cari alacağı oluşturur.
    if (resource === 'tahakkukOdeme') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { tip, kayitId, tarih, odemeTuru, odemeDetay, tutar, kasaKaynak, aciklama, limitKaynak } = req.body || {};
      if (tip !== 'Personel' && tip !== 'SabitGider') return res.status(400).json({ error: 'tip geçersiz' });
      if (!kayitId) return res.status(400).json({ error: 'kayitId gerekli' });
      const odenen = ondalikParseServer(tutar);
      if (!odenen || odenen <= 0) return res.status(400).json({ error: 'tutar gerekli' });

      const now = new Date();
      const bugun = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const trTarih = tarih || bugun;
      const donem = donemAnahtari(trTarih);

      const [kayitRows, ffRows, tahRows, tkRows] = await Promise.all([
        getRows(sheets, tip === 'Personel' ? PERSONEL_TAB : SABIT_GIDER_TAB),
        getRows(sheets, FATURA_FIS_TAB),
        getRows(sheets, TAHSILAT_TAB),
        getRows(sheets, TAHAKKUK_TAB),
      ]);
      const kayit = (tip === 'Personel' ? kayitRows.map(rowToPersonel) : kayitRows.map(rowToSabitGider))
        .find((k) => k.id === kayitId);
      if (!kayit) return res.status(404).json({ error: 'Kayıt bulunamadı' });
      const ad = tip === 'Personel' ? kayit.adSoyad : kayit.ad;

      const kayitlar = ffRows.map(rowToFaturaFis);
      const tahsilatlar = tahRows.map(rowToTahsilat);
      const tahakkuklar = tkRows.map(rowToTahakkuk);

      // Kural: tahakkuk edilmeden ödeme yapılmaz (bakiye eksiye düşmesin).
      const bakiye = firmaBakiyesi(ad, kayitlar, tahsilatlar);
      if (bakiye <= 0) return res.status(400).json({ error: 'Bu kayıt için açık borç yok — önce tahakkuk edin' });
      if (odenen > bakiye + 0.01) {
        return res.status(400).json({ error: `Kalan borç ${bakiye.toFixed(2)} TL, daha fazlası ödenemez` });
      }
      if (!tahakkuklar.some((t) => t.tip === tip && t.kayitId === kayitId)) {
        return res.status(400).json({ error: 'Önce tahakkuk edin' });
      }

      // Nakit ödemede geçmiş tarihte günlük kasa seçilemez (günsonu zinciri bozulmasın).
      const kasa = kasaKaynak === 'gunlukKasa' ? 'gunlukKasa' : (kasaKaynak === 'anaKasa' ? 'anaKasa' : '');
      if (odemeTuru === 'Nakit') {
        if (!kasa) return res.status(400).json({ error: 'Nakit ödemede kasa seçimi gerekli' });
        if (kasa === 'gunlukKasa' && trTarih !== bugun) {
          return res.status(400).json({ error: 'Geçmiş tarihli nakit ödeme yalnızca ana kasadan yapılabilir' });
        }
      }

      // Personel sınır kontrolü (limitler her dönem sıfırlanır).
      if (tip === 'Personel' && kayit.netMaas > 0) {
        const donemOdemeleri = tahsilatlar.filter((t) => t.firmaAdi === ad && donemAnahtari(t.tarih) === donem);
        const nakitMi = odemeTuru === 'Nakit' || (odemeTuru === 'Kesinti' && limitKaynak === 'Nakit');
        const oncekiAyniKanal = donemOdemeleri
          .filter((t) => (t.odemeTuru === 'Nakit' || (t.odemeTuru === 'Kesinti' && t.limitKaynak === 'Nakit')) === nakitMi)
          .reduce((x, t) => x + t.tutar, 0);
        const sinir = nakitMi ? kayit.nakitLimit : kayit.havaleLimit;
        if (sinir > 0 && oncekiAyniKanal + odenen > sinir + 0.01) {
          const kalan = Math.max(0, sinir - oncekiAyniKanal);
          return res.status(400).json({
            error: `${nakitMi ? 'Nakit' : 'Havale'} ödeme üst sınırı aşıldı — kalan ${kalan.toFixed(2)} TL`,
          });
        }
      }

      const yeniBakiye = Math.round((bakiye - odenen) * 100) / 100;
      const id = benzersizId();
      const p = trTarihiParcala(trTarih);
      await appendRow(sheets, TAHSILAT_TAB, [
        id, trTarih, p.gun, p.ay, p.yil, ad, '', aciklama || '',
        odemeTuru || '', odemeDetay || '', odenen, bakiye, yeniBakiye, '', now.toISOString(),
        odemeTuru === 'Nakit' ? kasa : '', limitKaynak || '',
      ]);

      // Kredi kartı / havale -> banka-kart hareketi. Cepten ödeme -> ortak carisi.
      const ortak = CEPTEN_ORTAK[odemeDetay];
      if (ortak) {
        await appendRow(sheets, ORTAK_HAREKET_TAB, [
          benzersizId(), ortak, trTarih, 'İşletme Gideri', 'yatirim', odenen,
          odemeTuru || '', `${ad} — ${aciklama || 'ödeme'}`, now.toISOString(),
        ]);
      } else if (hesapHareketiGerekir(odemeTuru)) {
        await appendRow(sheets, BANKA_KART_TAB, [
          benzersizId(), trTarih, odemeTuru, odemeDetay || '', 'GİDEN', odenen,
          `${tip === 'Personel' ? 'Personel' : 'Sabit gider'} — ${ad}`, id, now.toISOString(),
        ]);
      }

      return res.status(200).json({ ok: true, id, oncekiBakiye: bakiye, yeniBakiye });
    }

    // Bir personel / sabit gider için hareket dökümü (tahakkuklar + ödemeler).
    if (resource === 'tahakkukHareket') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const ad = req.query.ad || '';
      if (!ad) return res.status(400).json({ error: 'ad gerekli' });
      const [ffRows, tahRows] = await Promise.all([
        getRows(sheets, FATURA_FIS_TAB),
        getRows(sheets, TAHSILAT_TAB),
      ]);
      const kayitlar = ffRows.map(rowToFaturaFis);
      const tahsilatlar = tahRows.map(rowToTahsilat);
      const hareketler = [
        ...kayitlar.filter((k) => k.firmaAdi === ad).map((k) => ({
          tip: 'Tahakkuk', id: k.id, tarih: k.tarih, tutar: k.faturaTutari,
          kanal: k.odemeTuru, aciklama: k.aciklama,
        })),
        ...tahsilatlar.filter((t) => t.firmaAdi === ad).map((t) => ({
          tip: t.odemeTuru === 'Kesinti' ? 'Kesinti' : 'Ödeme', id: t.id, tarih: t.tarih, tutar: t.tutar,
          kanal: `${t.odemeTuru}${t.odemeDetay ? ' — ' + t.odemeDetay : ''}${t.kasaKaynak ? ' (' + (t.kasaKaynak === 'anaKasa' ? 'Ana Kasa' : 'Günlük Kasa') + ')' : ''}`,
          aciklama: t.aciklama,
        })),
      ].sort((a, b) => {
        const da = trTarihiCozServer(a.tarih); const db = trTarihiCozServer(b.tarih);
        return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
      });
      return res.status(200).json({
        ad, hareketler, bakiye: firmaBakiyesi(ad, kayitlar, tahsilatlar),
      });
    }

    // ============================================================
    // YEMEK KARTLARI (fatura kesimi + günsonu/banka mutabakatı)
    // ============================================================

    // Kart tanımları + seçili dönemin faturaları + günsonu karşılaştırması.
    if (resource === 'yemekKarti') {
      if (req.method === 'GET') {
        const donem = req.query.donem || bugununDonemi();
        const kesim = req.query.kesim || '10';
        let kartRows = await getRows(sheets, YK_KART_TAB);
        // İlk açılışta varsayılan kart listesi TEK istekte yazılır. (Döngü içinde
        // appendRow çağırmak her satır için ayrı ensureTab + append demek oluyordu;
        // altı kart = 18+ Sheets çağrısı, istek kotaya takılıp boş liste dönüyordu.)
        if (!kartRows.length) {
          const now = new Date().toISOString();
          const satirlarYeni = YK_VARSAYILAN.map((v) => ([
            benzersizId(), v.ad, v.oran, 0.1, 0.2,
            v.kesim[0] ? 'TRUE' : 'FALSE', v.kesim[1] ? 'TRUE' : 'FALSE', v.kesim[2] ? 'TRUE' : 'FALSE',
            'FALSE', now,
          ]));
          await satirlarEkle(YK_KART_TAB, satirlarYeni);
          kartRows = satirlarYeni;
        }
        const kartlar = kartRows.map(rowToYemekKarti);
        let fatRows = [];
        try { fatRows = await getRows(sheets, YK_FATURA_TAB); } catch { fatRows = []; }
        const faturalar = fatRows.map(rowToYemekFaturasi)
          .filter((f) => f.donem === donem && String(f.kesim) === String(kesim));

        const [bas, bit] = kesimAraligi(donem, kesim);
        let gunsonu = {};
        try { gunsonu = await gunsonuYemekToplamlari(sheets, bas, bit); } catch { gunsonu = {}; }

        const satirlar = kartlar.filter((k) => !k.pasif).map((k) => {
          const kesilirMi = kesim === '10' ? k.kesim10 : (kesim === '20' ? k.kesim20 : k.kesim30);
          const fatura = faturalar.find((f) => f.kartId === k.id) || null;
          const gunsonuToplam = gunsonu[metinNormalize(k.ad)] || 0;
          const r2 = (x) => Math.round(x * 100) / 100;
          return {
            kart: k,
            kesilirMi,                    // false ise ekranda kırmızı, yine de girilebilir
            fatura,
            gunsonuToplam,
            // Kontrol 1: dönem günsonu toplamı ile fatura toplamı (KDV dahil) aynı olmalı.
            gunsonuFark: fatura ? r2(fatura.faturaToplami - gunsonuToplam) : 0,
            // Kontrol 2: gelen para + kesinti = fatura toplamı olmalı.
            bankaFark: fatura && fatura.gelenTutar
              ? r2(fatura.faturaToplami - (fatura.gelenTutar + fatura.kesintiToplam)) : 0,
            vadeFarkliMi: !!(fatura && fatura.gelisTarihi && fatura.vade && fatura.gelisTarihi !== fatura.vade),
          };
        });
        return res.status(200).json({
          satirlar, donem, kesim,
          aralik: {
            // Sunucu UTC'de çalışıyor: timeZone verilmezse gece yarısına yakın saatlerde
            // dönem aralığı bir gün kayık görünür (kalıcı kural).
            bas: bas.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            bit: bit.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          },
        });
      }

      // Kart tanımı ekle / güncelle (oran ve kesim günleri değişebilir).
      if (req.method === 'POST') {
        const { id, ad, komisyonOrani, faturaKdv, kesintiKdv, kesim10, kesim20, kesim30, pasif } = req.body || {};
        if (!ad || !String(ad).trim()) return res.status(400).json({ error: 'ad gerekli' });
        const rows = await getRows(sheets, YK_KART_TAB);
        const satir = [id || benzersizId(), String(ad).trim(),
          ondalikParseServer(komisyonOrani || 0), ondalikParseServer(faturaKdv || 0.1),
          ondalikParseServer(kesintiKdv || 0.2),
          kesim10 ? 'TRUE' : 'FALSE', kesim20 ? 'TRUE' : 'FALSE', kesim30 ? 'TRUE' : 'FALSE',
          pasif ? 'TRUE' : 'FALSE', new Date().toISOString()];
        const idx = id ? rows.findIndex((r) => r[0] === id) : -1;
        if (idx >= 0) {
          await satirGuncelle(YK_KART_TAB, satir);
          return res.status(200).json({ ok: true, id: satir[0], guncellendi: true });
        }
        await appendRow(sheets, YK_KART_TAB, satir);
        return res.status(200).json({ ok: true, id: satir[0] });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Fatura kesimi: hesap zincirini yazar ve kesinti tutarını gidere atar.
    if (resource === 'yemekKartiFatura') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { id, kartId, donem, kesim, faturaTarihi, matrah, vade } = req.body || {};
      if (!kartId || !donem || !kesim) return res.status(400).json({ error: 'kartId, donem ve kesim gerekli' });
      if (!matrah) return res.status(400).json({ error: 'matrah gerekli' });

      const kartRows = await getRows(sheets, YK_KART_TAB);
      const kart = kartRows.map(rowToYemekKarti).find((k) => k.id === kartId);
      if (!kart) return res.status(404).json({ error: 'Kart bulunamadı' });

      const h = yemekKartiHesapla(matrah, kart);
      const now = new Date();
      const trTarih = faturaTarihi || now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const fatRows = await getRows(sheets, YK_FATURA_TAB);
      const idx = id ? fatRows.findIndex((r) => r[0] === id)
        : fatRows.findIndex((r) => r[1] === kartId && r[3] === donem && String(r[4]) === String(kesim));
      const mevcut = idx >= 0 ? rowToYemekFaturasi(fatRows[idx]) : null;

      // Kesinti tutarı gider olarak yazılır. Kart ödemesinden mahsup edildiği için
      // "Mahsup" ödeme türüyle kapalı yazılır: cari borç doğurmaz, banka hareketi üretmez.
      let giderId = mevcut ? mevcut.giderFaturaFisId : '';
      const p = trTarihiParcala(trTarih);
      const giderSatiri = [
        giderId || benzersizId(), trTarih, p.gun, p.ay, p.yil, kart.ad, '',
        `${donem} / ${kesim} kesimi komisyon`, YEMEK_KARTI_KATEGORI, 'Mahsup', '',
        h.kesintiToplam, 0, 0, h.kesintiToplam, 'Hesap Yok', 0, '', 'FALSE', now.toISOString(), 'FALSE',
      ];
      if (giderId) {
        const ffRows = await getRows(sheets, FATURA_FIS_TAB);
        const gIdx = ffRows.findIndex((r) => r[0] === giderId);
        if (gIdx >= 0) {
          await satirGuncelle(FATURA_FIS_TAB, giderSatiri);
        } else { await appendRow(sheets, FATURA_FIS_TAB, giderSatiri); }
      } else {
        giderId = giderSatiri[0];
        await appendRow(sheets, FATURA_FIS_TAB, giderSatiri);
      }

      const satir = [
        mevcut ? mevcut.id : benzersizId(), kartId, kart.ad, donem, String(kesim), trTarih,
        h.matrah, h.kdv, h.faturaToplami, vade || '', kart.komisyonOrani,
        h.kesintiMatrah, h.kesintiKdv, h.kesintiToplam, h.bankayaYatacak, giderId,
        mevcut ? mevcut.gelenTutar : 0, mevcut ? mevcut.gelisTarihi : '', mevcut ? mevcut.gelenHesap : '',
        now.toISOString(),
      ];
      if (idx >= 0) {
        await satirGuncelle(YK_FATURA_TAB, satir);
      } else {
        await appendRow(sheets, YK_FATURA_TAB, satir);
      }
      return res.status(200).json({ ok: true, hesap: h, id: satir[0] });
    }

    // Para geldi: banka hareketi yazar, mutabakat farkını döndürür.
    if (resource === 'yemekKartiOdeme') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { faturaId, gelenTutar, gelisTarihi, hesapAdi } = req.body || {};
      if (!faturaId) return res.status(400).json({ error: 'faturaId gerekli' });
      const gelen = ondalikParseServer(gelenTutar);
      if (!gelen) return res.status(400).json({ error: 'gelen tutar gerekli' });

      const fatRows = await getRows(sheets, YK_FATURA_TAB);
      const idx = fatRows.findIndex((r) => r[0] === faturaId);
      if (idx < 0) return res.status(404).json({ error: 'Fatura bulunamadı' });
      const fatura = rowToYemekFaturasi(fatRows[idx]);

      const now = new Date();
      const trTarih = gelisTarihi || now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const satir = [...fatRows[idx]];
      while (satir.length < YK_FATURA_TAB.headers.length) satir.push('');
      satir[16] = gelen; satir[17] = trTarih; satir[18] = hesapAdi || '';
      await satirGuncelle(YK_FATURA_TAB, satir);

      // Bankaya giriş — aynı fatura için tekrar kaydedilirse satır güncellenir.
      const kaynakId = `YKODEME-${faturaId}`;
      const bkRows = await getRows(sheets, BANKA_KART_TAB);
      const bIdx = bkRows.findIndex((r) => r[7] === kaynakId);
      const bSatir = [bIdx >= 0 ? bkRows[bIdx][0] : benzersizId(), trTarih, 'Banka Havalesi',
        hesapAdi || '', 'GİREN', gelen, `${fatura.kartAdi} hakedişi`, kaynakId, now.toISOString()];
      if (bIdx >= 0) {
        await satirGuncelle(BANKA_KART_TAB, bSatir);
      } else {
        await appendRow(sheets, BANKA_KART_TAB, bSatir);
      }

      const fark = Math.round((fatura.faturaToplami - (gelen + fatura.kesintiToplam)) * 100) / 100;
      return res.status(200).json({ ok: true, fark, vadeFarkli: !!(fatura.vade && fatura.vade !== trTarih) });
    }

    // Uyumsoft'tan gelmiş ama bu ekrandan HENÜZ İŞLENMEMİŞ faturalar (kart olarak gösterilir).
    // Kaynak: mevcut XML içe aktarma verisi (Giderler sekmesi, FaturaID bazında gruplanır).
    if (resource === 'bekleyenFaturalar') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const [giderRows, ffRows, devirStr] = await Promise.all([
        getRows(sheets, GIDER_TAB),
        getRows(sheets, FATURA_FIS_TAB),
        ayarGetir(sheets, 'devirTarihi'),
      ]);
      const devirTarihi = trTarihiCozServer(devirStr);
      const islenmis = new Set(ffRows.map(rowToFaturaFis).map((r) => r.kaynakFaturaID).filter(Boolean));

      const gruplar = new Map();
      giderRows.map(rowToGider).forEach((g) => {
        if (!g.faturaId || islenmis.has(g.faturaId)) return;
        if (!devirSonrasiMi(g.tarih, devirTarihi)) return; // devir öncesi fatura eski sistemde
        const mevcut = gruplar.get(g.faturaId) || {
          faturaID: g.faturaId, tarih: g.tarih, firmaAdi: g.tedarikciAciklama,
          faturaNo: g.belgeNo, kategori: g.kategori, tutar: 0, kdvTutari: 0, satirSayisi: 0,
        };
        mevcut.tutar += Number(g.tutar) || 0;
        mevcut.kdvTutari += ondalikParseServer(g.kdvOrani);
        mevcut.satirSayisi += 1;
        gruplar.set(g.faturaId, mevcut);
      });

      let records = [...gruplar.values()].map((f) => ({
        ...f,
        tutar: Math.round(f.tutar * 100) / 100,
        kdvTutari: Math.round(f.kdvTutari * 100) / 100,
      }));
      if (req.query.firmaAdi) {
        const hedef = metinNormalize(req.query.firmaAdi);
        records = records.filter((r) => metinNormalize(r.firmaAdi).includes(hedef) || hedef.includes(metinNormalize(r.firmaAdi)));
      }
      records.sort((a, b) => (trTarihiCozServer(b.tarih)?.getTime() || 0) - (trTarihiCozServer(a.tarih)?.getTime() || 0));
      return res.status(200).json({ records });
    }

    // Banka ekstresinden gelen, henüz bir firmayla eşleştirilmemiş GİDEN ödemeler
    // (Tahsilat Makbuzu ekranındaki kartlar).
    if (resource === 'bekleyenOdemeler') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const [ekstreRows, tahRows, devirStr] = await Promise.all([
        getRows(sheets, EKSTRE_TAB),
        getRows(sheets, TAHSILAT_TAB),
        ayarGetir(sheets, 'devirTarihi'),
      ]);
      const devirTarihi = trTarihiCozServer(devirStr);
      const kullanilan = new Set(tahRows.map(rowToTahsilat).map((t) => t.kaynakEkstreID).filter(Boolean));
      const records = ekstreRows.map(rowToEkstre)
        .filter((e) => e.yon === 'GİDEN' && !kullanilan.has(e.id))
        .filter((e) => devirSonrasiMi(excelTarihiCoz(e.tarih), devirTarihi))
        .sort((a, b) => (trTarihiCozServer(b.tarih)?.getTime() || 0) - (trTarihiCozServer(a.tarih)?.getTime() || 0));
      return res.status(200).json({ records });
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