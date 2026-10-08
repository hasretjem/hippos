// Reçete, ham madde fiyatları ve e-Fatura (XML) fiyat okuma — Supabase (m2_rc_* tabloları).
//
// Kurallar (kullanıcı kararları):
//  * Birim fiyat KDV ve İSKONTO DAHİL (faturada gerçekten ödenen tutar) — satirTutariKdvDahil / (miktar × çarpan).
//  * Malzeme birimi kg | lt | adet. Reçetede miktar gram (kg), ml (lt) veya adet olarak yazılır.
//  * Fire %: reçetedeki miktar net kullanılan miktardır, maliyet = miktar / (1 - fire).
//  * Yarı mamul (ör. "salçalı yemek": salça+yağ+baharat): kendi reçetesi ve çıktı miktarı vardır, diğer reçetelerde malzeme gibi kullanılır.
//  * Paket işaretli kalemler (kutu, poşet...) yalnızca PAKET satışta maliyete eklenir.
//  * Maliyet = malzemenin SON ALIŞ fiyatı (fatura tarihine göre en yeni).
//  * Menü fiyatı KDV dahildir (%10); kâr = KDV hariç satış fiyatı - maliyet.
//  * XML faturalar yalnızca fiyat okumak ve Fiş/Fatura formunu doldurmak içindir; asla otomatik fiş/fatura kesilmez.
import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';
import { parseFaturaXml, KENDI_VKN } from './_faturaXml.js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

export const MENU_KDV = 10;

class Hata extends Error {
  constructor(kod, mesaj) {
    super(mesaj);
    this.kod = kod;
  }
}
const kontrol = (e) => {
  if (e) throw new Error(e.message || String(e));
};

// "0,04" / "12.201,00" / 3.5 → sayı. (Number("0,04") NaN verir; tek güvenli ayrıştırıcı bu.)
export function sayi(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
const yuvarla = (n, k = 2) => Math.round(n * 10 ** k) / 10 ** k;
const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
const bugunIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const isoGecerli = (t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t || ''));
const uuidMi = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

// PostgREST bir istekte en fazla 1000 satır döner; sayfa sayfa okur.
async function hepsiniOku(tablo, kolonlar, siralama) {
  const cikti = [];
  for (let bas = 0; ; bas += 1000) {
    let q = db.from(tablo).select(kolonlar).range(bas, bas + 999);
    if (siralama) q = q.order(siralama.kolon, { ascending: siralama.artan !== false });
    const { data, error } = await q;
    kontrol(error);
    cikti.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return cikti;
}

// ------------------------------ Maliyet motoru ------------------------------
let onbellek = null; // satış anı sorguları art arda gelir; 15 sn önbellek (yazma olunca temizlenir)
const temizle = () => {
  onbellek = null;
};

async function veriYukle() {
  if (onbellek && Date.now() - onbellek.zaman < 15000) return onbellek.veri;
  const [malzemeler, sonFiyat, receteler, kalemler] = await Promise.all([
    hepsiniOku('m2_rc_malzemeler', '*', { kolon: 'ad' }),
    hepsiniOku('m2_rc_son_fiyat', '*'),
    hepsiniOku('m2_rc_receteler', '*', { kolon: 'ad' }),
    hepsiniOku('m2_rc_kalemler', '*', { kolon: 'sira' }),
  ]);
  const veri = {
    malzemeler,
    sonFiyat,
    receteler,
    kalemler,
    malzemeMap: new Map(malzemeler.map((m) => [m.id, m])),
    fiyatMap: new Map(sonFiyat.map((f) => [f.malzeme_id, f])),
    receteMap: new Map(receteler.map((r) => [r.id, r])),
    urunReceteMap: new Map(receteler.filter((r) => r.tur === 'urun' && r.urun_id != null).map((r) => [Number(r.urun_id), r])),
    kalemMap: new Map(),
  };
  kalemler.forEach((k) => {
    if (!veri.kalemMap.has(k.recete_id)) veri.kalemMap.set(k.recete_id, []);
    veri.kalemMap.get(k.recete_id).push(k);
  });
  onbellek = { zaman: Date.now(), veri };
  return veri;
}

// Bir reçetenin maliyeti. Dönüş: { yerinde, paketEk, eksik[] } (paketEk: "paket" işaretli kalemlerin toplamı)
export function receteMaliyeti(v, receteId, yigin = new Set()) {
  if (yigin.has(receteId)) throw new Hata(400, 'Reçeteler birbirini çağırıyor (döngü)');
  yigin.add(receteId);
  let yerinde = 0;
  let paketEk = 0;
  const eksik = [];
  for (const k of v.kalemMap.get(receteId) || []) {
    let tutar = 0;
    if (k.malzeme_id) {
      const m = v.malzemeMap.get(k.malzeme_id);
      const f = v.fiyatMap.get(k.malzeme_id);
      if (!m) continue;
      if (!f) {
        eksik.push(m.ad);
        continue;
      }
      const bolen = m.birim === 'adet' ? 1 : 1000;
      const fire = 1 / (1 - Number(m.fire_yuzde || 0) / 100);
      tutar = (Number(f.birim_fiyat) / bolen) * Number(k.miktar) * fire;
    } else {
      const alt = v.receteMap.get(k.alt_recete_id);
      if (!alt) continue;
      const s = receteMaliyeti(v, alt.id, new Set(yigin));
      s.eksik.forEach((e) => eksik.push(`${e} (${alt.ad})`));
      const cikti = Number(alt.cikti_miktar) > 0 ? Number(alt.cikti_miktar) : 1;
      tutar = (s.yerinde / cikti) * Number(k.miktar);
    }
    if (k.paket) paketEk += tutar;
    else yerinde += tutar;
  }
  return { yerinde: yuvarla(yerinde), paketEk: yuvarla(paketEk), eksik: [...new Set(eksik)] };
}

function urunOzetleri(v, urunler) {
  return urunler.map((p) => {
    const r = v.urunReceteMap.get(Number(p.id));
    const fiyat = Number(p.fiyat) || 0;
    const net = yuvarla(fiyat / (1 + MENU_KDV / 100));
    const temel = { id: p.id, ad: p.ad, kategori: p.kategori || '', altKategori: p.alt_kategori || '', fiyat, netFiyat: net, durumu: p.durum };
    if (!r) return { ...temel, durum: 'yok' };
    if (r.gerekmez) return { ...temel, receteId: r.id, durum: 'gerekmez' };
    const h = receteMaliyeti(v, r.id);
    const kalemSayisi = (v.kalemMap.get(r.id) || []).length;
    if (!kalemSayisi) return { ...temel, receteId: r.id, durum: 'yok' };
    const durum = h.eksik.length ? 'eksik' : 'tamam';
    const kar = yuvarla(net - h.yerinde);
    return {
      ...temel,
      receteId: r.id,
      durum,
      maliyet: h.yerinde,
      paketEk: h.paketEk,
      eksik: h.eksik,
      kar,
      karYuzde: net > 0 ? yuvarla((kar / net) * 100, 1) : 0,
      maliyetYuzde: net > 0 ? yuvarla((h.yerinde / net) * 100, 1) : 0,
      paketKar: yuvarla(net - h.yerinde - h.paketEk),
    };
  });
}

async function urunleriOku() {
  const satirlar = await hepsiniOku('products', 'id,ad,kategori,alt_kategori,fiyat,durum,is_az_variant,parent_id', { kolon: 'id' });
  return satirlar.filter((p) => !p.is_az_variant);
}

// ------------------------------ Fiyat değişimi ------------------------------
function tarihGeri(gun) {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - gun);
  return d.toISOString().slice(0, 10);
}

function degisimHesapla(gecmis /* tarih desc */, bas) {
  if (!gecmis.length) return null;
  const son = gecmis[0];
  let taban = gecmis.find((g) => g.tarih <= bas);
  let ilkKayit = false;
  if (!taban) {
    taban = gecmis[gecmis.length - 1];
    ilkKayit = true;
  }
  if (taban === son && gecmis.length === 1) return { onceki: Number(taban.birim_fiyat), oncekiTarih: taban.tarih, fark: 0, yuzde: 0, ilkKayit };
  const onceki = Number(taban.birim_fiyat);
  const fark = Number(son.birim_fiyat) - onceki;
  return { onceki, oncekiTarih: taban.tarih, fark: yuvarla(fark, 4), yuzde: onceki > 0 ? yuvarla((fark / onceki) * 100, 1) : null, ilkKayit };
}

// Malzemeyi hangi ürünlerin (doğrudan veya yarı mamul üzerinden) kullandığını bulur.
function kullanimHaritasi(v, urunAdlari) {
  const harita = new Map(); // malzemeId -> Set(urun adı)
  const kokleri = (receteId, yigin = new Set()) => {
    if (yigin.has(receteId)) return new Set();
    yigin.add(receteId);
    const r = v.receteMap.get(receteId);
    if (r && r.tur === 'urun') return new Set([receteId]);
    const sonuc = new Set();
    for (const k of v.kalemler) {
      if (k.alt_recete_id === receteId) kokleri(k.recete_id, yigin).forEach((x) => sonuc.add(x));
    }
    return sonuc;
  };
  for (const k of v.kalemler) {
    if (!k.malzeme_id) continue;
    kokleri(k.recete_id).forEach((rid) => {
      const r = v.receteMap.get(rid);
      const ad = r && r.urun_id != null ? urunAdlari.get(Number(r.urun_id)) || r.ad : null;
      if (!ad) return;
      if (!harita.has(k.malzeme_id)) harita.set(k.malzeme_id, new Set());
      harita.get(k.malzeme_id).add(ad);
    });
  }
  return harita;
}

// ------------------------------ XML yardımcıları ------------------------------
function sozlukAnahtari(vkn, tedAd, kod, urunAdi) {
  return `${vkn || norm(tedAd)}|${kod ? `k:${norm(kod)}` : `a:${norm(urunAdi)}`}`;
}

function fiyatSatiri(fatura, satir, soz) {
  if (!soz || soz.yoksay || !soz.malzeme_id) return null;
  if (fatura.tip === 'IADE') return null;
  const miktar = sayi(satir.miktar);
  const tutar = sayi(satir.satirTutariKdvDahil);
  const carpan = Number(soz.carpan) > 0 ? Number(soz.carpan) : 1;
  if (!(miktar > 0) || !(tutar > 0) || !fatura.tarih) return null;
  return {
    malzeme_id: soz.malzeme_id,
    tarih: fatura.tarih,
    birim_fiyat: yuvarla(tutar / (miktar * carpan), 4),
    miktar: yuvarla(miktar * carpan, 4),
    toplam_tutar: tutar,
    kaynak: 'xml',
    firma_adi: fatura.tedarikci_ad,
    fatura_no: fatura.fatura_no,
    ettn: fatura.ettn,
    satir_no: String(satir.siraNo),
  };
}

async function sozlukOku() {
  const liste = await hepsiniOku('m2_rc_sozluk', '*');
  return new Map(liste.map((s) => [s.anahtar, s]));
}

// Verilen faturaların sözlükle eşleşen satırlarının fiyatlarını yazar (aynı fatura satırı tekrar yazılmaz → mükerrer olmaz).
async function fiyatlariIsle(faturalar, sozluk, yenidenYaz = false) {
  const satirlar = [];
  const silinecek = [];
  for (const f of faturalar) {
    for (const s of f.satirlar || []) {
      const soz = sozluk.get(sozlukAnahtari(f.tedarikci_vkn, f.tedarikci_ad, s.urunKodu, s.urunAdi));
      const fs = fiyatSatiri(f, s, soz);
      if (fs) satirlar.push(fs);
      else if (yenidenYaz && soz) silinecek.push({ ettn: f.ettn, satir_no: String(s.siraNo) });
    }
  }
  if (yenidenYaz) {
    for (const x of [...silinecek, ...satirlar.map((s) => ({ ettn: s.ettn, satir_no: s.satir_no }))]) {
      const { error } = await db.from('m2_rc_fiyatlar').delete().eq('ettn', x.ettn).eq('satir_no', x.satir_no).eq('kaynak', 'xml');
      kontrol(error);
    }
  }
  if (satirlar.length) {
    const { error } = await db.from('m2_rc_fiyatlar').upsert(satirlar, { onConflict: 'ettn,satir_no', ignoreDuplicates: !yenidenYaz });
    kontrol(error);
  }
  temizle();
  return satirlar.length;
}

// ------------------------------ Handler ------------------------------
export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const resource = req.method === 'GET' ? req.query.resource : body.resource || req.query.resource;
    const q = req.query || {};

    // ---------- Satış anı maliyeti (api tüketicisi: useHipposData snapshot) ----------
    if (resource === 'recete' && req.method === 'GET') {
      if (!q.urunId) throw new Hata(400, 'urunId gerekli');
      const v = await veriYukle();
      const r = v.urunReceteMap.get(Number(q.urunId));
      if (!r || r.gerekmez || !(v.kalemMap.get(r.id) || []).length) return res.status(200).json({ maliyet: null, eksikMalzemeler: [], kalemler: [], receteYok: true, gerekmez: !!(r && r.gerekmez) });
      const h = receteMaliyeti(v, r.id);
      const paket = q.paket === '1';
      return res.status(200).json({
        receteYok: false,
        receteId: r.id,
        eksikMalzemeler: h.eksik,
        maliyet: h.eksik.length ? null : yuvarla(h.yerinde + (paket ? h.paketEk : 0)),
      });
    }

    // ---------- Reçeteler sayfası: tüm ürünler + maliyet + kâr ----------
    if (resource === 'ozet' && req.method === 'GET') {
      const [v, urunler] = await Promise.all([veriYukle(), urunleriOku()]);
      const hepsi = urunOzetleri(v, urunler);
      const aktifler = hepsi.filter((u) => u.durumu === 'AKTIF');
      return res.status(200).json({
        kdv: MENU_KDV,
        urunler: hepsi,
        sayilar: {
          receteYok: aktifler.filter((u) => u.durum === 'yok').length,
          fiyatEksik: aktifler.filter((u) => u.durum === 'eksik').length,
          tamam: aktifler.filter((u) => u.durum === 'tamam').length,
          gerekmez: aktifler.filter((u) => u.durum === 'gerekmez').length,
        },
      });
    }

    // Ayarlar'daki Reçete düğmesi için bildirim rozeti
    if (resource === 'rozet' && req.method === 'GET') {
      const [v, urunler] = await Promise.all([veriYukle(), urunleriOku()]);
      const aktifler = urunOzetleri(v, urunler.filter((p) => p.durum === 'AKTIF'));
      return res.status(200).json({
        receteYok: aktifler.filter((u) => u.durum === 'yok').length,
        fiyatEksik: aktifler.filter((u) => u.durum === 'eksik').length,
      });
    }

    // Tek reçetenin kalemleri (düzenleme ekranı)
    if (resource === 'receteDetay' && req.method === 'GET') {
      const v = await veriYukle();
      let r = null;
      if (q.id) r = v.receteMap.get(q.id);
      else if (q.urunId) r = v.urunReceteMap.get(Number(q.urunId));
      if (!r) return res.status(200).json({ recete: null, kalemler: [] });
      const kalemler = (v.kalemMap.get(r.id) || []).map((k) => ({
        id: k.id,
        malzemeId: k.malzeme_id,
        altReceteId: k.alt_recete_id,
        miktar: Number(k.miktar),
        paket: !!k.paket,
      }));
      const h = receteMaliyeti(v, r.id);
      return res.status(200).json({
        recete: { id: r.id, tur: r.tur, ad: r.ad, urunId: r.urun_id, ciktiMiktar: r.cikti_miktar != null ? Number(r.cikti_miktar) : null, ciktiBirim: r.cikti_birim, gerekmez: !!r.gerekmez },
        kalemler,
        maliyet: h,
      });
    }

    // Yarı mamul listesi (+ birim maliyeti)
    if (resource === 'yariMamuller' && req.method === 'GET') {
      const v = await veriYukle();
      const liste = v.receteler
        .filter((r) => r.tur === 'yari_mamul')
        .map((r) => {
          const h = receteMaliyeti(v, r.id);
          const cikti = Number(r.cikti_miktar) > 0 ? Number(r.cikti_miktar) : 1;
          return { id: r.id, ad: r.ad, ciktiMiktar: Number(r.cikti_miktar) || null, ciktiBirim: r.cikti_birim, toplamMaliyet: h.yerinde, birimMaliyet: yuvarla(h.yerinde / cikti, 4), eksik: h.eksik, kalemSayisi: (v.kalemMap.get(r.id) || []).length };
        });
      return res.status(200).json({ yariMamuller: liste });
    }

    // ---------- Malzemeler ve fiyat değişimi ----------
    if (resource === 'malzemeler' && req.method === 'GET') {
      const [v, urunler, gecmisHepsi] = await Promise.all([
        veriYukle(),
        urunleriOku(),
        hepsiniOku('m2_rc_fiyatlar', 'malzeme_id,tarih,birim_fiyat,olusturma', { kolon: 'tarih', artan: false }),
      ]);
      const urunAdlari = new Map(urunler.map((p) => [Number(p.id), p.ad]));
      const kullanim = kullanimHaritasi(v, urunAdlari);
      const gecmisMap = new Map();
      gecmisHepsi.forEach((g) => {
        if (!gecmisMap.has(g.malzeme_id)) gecmisMap.set(g.malzeme_id, []);
        gecmisMap.get(g.malzeme_id).push(g);
      });
      const ozelBas = isoGecerli(q.bas) ? q.bas : null;
      const bas3 = tarihGeri(91);
      const bas6 = tarihGeri(182);
      const bas12 = tarihGeri(365);
      const liste = v.malzemeler.map((m) => {
        const f = v.fiyatMap.get(m.id);
        const g = gecmisMap.get(m.id) || [];
        return {
          id: m.id,
          ad: m.ad,
          birim: m.birim,
          fire: Number(m.fire_yuzde) || 0,
          tur: m.tur,
          aktif: m.aktif,
          fiyat: f ? Number(f.birim_fiyat) : null,
          fiyatTarihi: f ? f.tarih : null,
          firma: f ? f.firma_adi : null,
          faturaNo: f ? f.fatura_no : null,
          kayitSayisi: g.length,
          degisim: {
            ay3: degisimHesapla(g, bas3),
            ay6: degisimHesapla(g, bas6),
            yil1: degisimHesapla(g, bas12),
            ozel: ozelBas ? degisimHesapla(g, ozelBas) : null,
          },
          kullanan: [...(kullanim.get(m.id) || [])].sort((a, b) => a.localeCompare(b, 'tr')),
        };
      });
      return res.status(200).json({ malzemeler: liste });
    }

    // Bir malzemenin tüm alış geçmişi
    if (resource === 'fiyatGecmisi' && req.method === 'GET') {
      if (!uuidMi(q.malzemeId)) throw new Hata(400, 'malzemeId geçersiz');
      const { data, error } = await db
        .from('m2_rc_fiyatlar')
        .select('id,tarih,birim_fiyat,miktar,toplam_tutar,kaynak,firma_adi,fatura_no,olusturma')
        .eq('malzeme_id', q.malzemeId)
        .order('tarih', { ascending: false })
        .order('olusturma', { ascending: false });
      kontrol(error);
      return res.status(200).json({
        kayitlar: (data || []).map((g) => ({
          id: g.id,
          tarih: g.tarih,
          birimFiyat: Number(g.birim_fiyat),
          miktar: g.miktar != null ? Number(g.miktar) : null,
          toplamTutar: g.toplam_tutar != null ? Number(g.toplam_tutar) : null,
          kaynak: g.kaynak,
          firma: g.firma_adi || '',
          faturaNo: g.fatura_no || '',
        })),
      });
    }

    // Son 30 günün satış adedi × birim kâr (en kârlı / en az kârlı ürünler)
    if (resource === 'karlilik' && req.method === 'GET') {
      const gun = Math.min(365, Math.max(1, Number(q.gun) || 30));
      const [v, urunler, satis] = await Promise.all([
        veriYukle(),
        urunleriOku(),
        db.rpc('m2_rc_satis_adet', { p_bas: Date.now() - gun * 86400000 }),
      ]);
      kontrol(satis.error);
      const adet = new Map((satis.data || []).map((s) => [s.ad, Number(s.adet)]));
      const ozet = urunOzetleri(v, urunler).filter((u) => u.durum === 'tamam');
      const liste = ozet
        .map((u) => ({ id: u.id, ad: u.ad, adet: adet.get(u.ad) || 0, birimKar: u.kar, karYuzde: u.karYuzde, toplamKar: yuvarla((adet.get(u.ad) || 0) * u.kar) }))
        .filter((u) => u.adet > 0)
        .sort((a, b) => b.toplamKar - a.toplamKar);
      return res.status(200).json({ gun, liste });
    }

    // ---------- XML: liste ----------
    if (resource === 'xmlListe' && req.method === 'GET') {
      const [xmller, sozluk, malzemeler, fiyatSatirlari] = await Promise.all([
        hepsiniOku('m2_rc_xml', '*', { kolon: 'tarih', artan: false }),
        sozlukOku(),
        hepsiniOku('m2_rc_malzemeler', 'id,ad,birim', { kolon: 'ad' }),
        hepsiniOku('m2_rc_fiyatlar', 'ettn,satir_no,malzeme_id,birim_fiyat', { kolon: 'tarih', artan: false }),
      ]);
      const mAd = new Map(malzemeler.map((m) => [m.id, m]));
      const islendi = new Map(fiyatSatirlari.filter((f) => f.ettn).map((f) => [`${f.ettn}|${f.satir_no}`, f]));
      const faturalar = xmller.map((x) => {
        const satirlar = (x.satirlar || []).map((s) => {
          const anahtar = sozlukAnahtari(x.tedarikci_vkn, x.tedarikci_ad, s.urunKodu, s.urunAdi);
          const soz = sozluk.get(anahtar);
          const fy = islendi.get(`${x.ettn}|${s.siraNo}`);
          let durum = 'bekliyor';
          if (soz && soz.yoksay) durum = 'yoksay';
          else if (fy) durum = 'islendi';
          return {
            siraNo: s.siraNo,
            urunKodu: s.urunKodu || '',
            urunAdi: s.urunAdi || '',
            miktar: s.miktar,
            birimKodu: s.birimKodu,
            birimAdi: s.birimAdi,
            kdvOrani: s.kdvOrani,
            satirTutariKdvDahil: s.satirTutariKdvDahil,
            birimFiyatKdvDahil: s.efektifBirimFiyatKdvDahil,
            supheli: !!s.supheliMiktar,
            anahtar,
            durum,
            malzemeId: soz && soz.malzeme_id ? soz.malzeme_id : fy ? fy.malzeme_id : null,
            malzemeAdi: (soz && soz.malzeme_id && mAd.get(soz.malzeme_id)?.ad) || (fy && mAd.get(fy.malzeme_id)?.ad) || '',
            carpan: soz ? Number(soz.carpan) : null,
            malzemeFiyati: fy ? Number(fy.birim_fiyat) : null,
          };
        });
        const kdvTutari = yuvarla(
          satirlar.reduce((t, s) => t + (s.satirTutariKdvDahil && s.kdvOrani ? (s.satirTutariKdvDahil * s.kdvOrani) / (100 + s.kdvOrani) : 0), 0),
        );
        return {
          id: x.id,
          ettn: x.ettn,
          kdvTutari,
          satirSayisi: satirlar.length,
          faturaNo: x.fatura_no,
          tarih: x.tarih,
          tedarikciAdi: x.tedarikci_ad,
          tedarikciVkn: x.tedarikci_vkn,
          toplam: x.toplam_kdv_dahil != null ? Number(x.toplam_kdv_dahil) : null,
          odenecek: x.odenecek != null ? Number(x.odenecek) : null,
          durum: x.durum,
          yuklenme: x.yuklenme,
          satirlar: q.hafif === '1' ? undefined : satirlar,
          bekleyenSatir: satirlar.filter((s) => s.durum === 'bekliyor').length,
        };
      });
      return res.status(200).json({ faturalar });
    }

    // Fiş/Fatura sekmesindeki çekmece düğmesi için: forma aktarılmayı bekleyen fatura sayısı
    if (resource === 'xmlSayi' && req.method === 'GET') {
      const { count, error } = await db.from('m2_rc_xml').select('id', { count: 'exact', head: true }).eq('durum', 'bekliyor');
      kontrol(error);
      return res.status(200).json({ bekleyen: count || 0 });
    }

    if (resource === 'sozluk' && req.method === 'GET') {
      const [liste, malzemeler] = await Promise.all([hepsiniOku('m2_rc_sozluk', '*', { kolon: 'tedarikci_ad' }), hepsiniOku('m2_rc_malzemeler', 'id,ad,birim')]);
      const mAd = new Map(malzemeler.map((m) => [m.id, m]));
      return res.status(200).json({
        kayitlar: liste.map((s) => ({ id: s.id, tedarikci: s.tedarikci_ad, urunKodu: s.urun_kodu || '', urunAdi: s.urun_adi || '', malzemeId: s.malzeme_id, malzeme: s.malzeme_id ? mAd.get(s.malzeme_id)?.ad || '' : '', birim: s.malzeme_id ? mAd.get(s.malzeme_id)?.birim || '' : '', carpan: Number(s.carpan), yoksay: !!s.yoksay })),
      });
    }

    if (req.method !== 'POST') throw new Hata(405, 'Method not allowed');

    // ---------- Malzeme ----------
    if (resource === 'malzemeKaydet') {
      const ad = String(body.ad || '').trim();
      if (!ad) throw new Hata(400, 'Malzeme adı gerekli');
      if (!['kg', 'lt', 'adet'].includes(body.birim)) throw new Hata(400, 'Birim kg, lt veya adet olmalı');
      const fire = sayi(body.fireYuzde);
      if (fire < 0 || fire >= 100) throw new Hata(400, 'Fire % 0-99 arasında olmalı');
      const tur = body.tur === 'ambalaj' ? 'ambalaj' : 'malzeme';
      const satir = { ad, birim: body.birim, fire_yuzde: fire, tur, aktif: body.aktif !== false };
      if (body.id) {
        if (!uuidMi(body.id)) throw new Hata(400, 'id geçersiz');
        const { data: eski, error: e1 } = await db.from('m2_rc_malzemeler').select('birim').eq('id', body.id).maybeSingle();
        kontrol(e1);
        if (!eski) throw new Hata(404, 'Malzeme bulunamadı');
        if (eski.birim !== body.birim) {
          const { count, error: e2 } = await db.from('m2_rc_fiyatlar').select('id', { count: 'exact', head: true }).eq('malzeme_id', body.id);
          kontrol(e2);
          const { count: kc, error: e3 } = await db.from('m2_rc_kalemler').select('id', { count: 'exact', head: true }).eq('malzeme_id', body.id);
          kontrol(e3);
          if ((count || 0) > 0 || (kc || 0) > 0) throw new Hata(409, 'Fiyat veya reçetede kullanılan malzemenin birimi değiştirilemez');
        }
        const { error } = await db.from('m2_rc_malzemeler').update(satir).eq('id', body.id);
        kontrol(error);
        temizle();
        return res.status(200).json({ ok: true, id: body.id });
      }
      const { data, error } = await db.from('m2_rc_malzemeler').insert(satir).select('id').single();
      if (error && error.code === '23505') throw new Hata(409, 'Bu isimde bir malzeme zaten var');
      kontrol(error);
      temizle();
      return res.status(200).json({ ok: true, id: data.id });
    }

    if (resource === 'malzemeSil') {
      if (!uuidMi(body.id)) throw new Hata(400, 'id geçersiz');
      const { count, error: e1 } = await db.from('m2_rc_kalemler').select('id', { count: 'exact', head: true }).eq('malzeme_id', body.id);
      kontrol(e1);
      if ((count || 0) > 0) throw new Hata(409, 'Bu malzeme bir reçetede kullanılıyor; silmek yerine pasif yapın.');
      const { error } = await db.from('m2_rc_malzemeler').delete().eq('id', body.id);
      kontrol(error);
      temizle();
      return res.status(200).json({ ok: true });
    }

    // ---------- Elle fiyat ----------
    if (resource === 'fiyatEkle') {
      if (!uuidMi(body.malzemeId)) throw new Hata(400, 'malzemeId geçersiz');
      const fiyat = sayi(body.birimFiyat);
      if (!(fiyat > 0)) throw new Hata(400, 'Birim fiyat sıfırdan büyük olmalı');
      const tarih = isoGecerli(body.tarih) ? body.tarih : bugunIso();
      const { error } = await db.from('m2_rc_fiyatlar').insert({ malzeme_id: body.malzemeId, tarih, birim_fiyat: yuvarla(fiyat, 4), kaynak: 'elle', firma_adi: String(body.firma || '').trim() || null, fatura_no: String(body.faturaNo || '').trim() || null });
      kontrol(error);
      temizle();
      return res.status(200).json({ ok: true });
    }

    if (resource === 'fiyatSil') {
      if (!uuidMi(body.id)) throw new Hata(400, 'id geçersiz');
      const { error } = await db.from('m2_rc_fiyatlar').delete().eq('id', body.id);
      kontrol(error);
      temizle();
      return res.status(200).json({ ok: true });
    }

    // ---------- Reçete ----------
    if (resource === 'receteKaydet') {
      const tur = body.tur === 'yari_mamul' ? 'yari_mamul' : 'urun';
      const v = await veriYukle();
      let ad = String(body.ad || '').trim();
      const satir = { tur, gerekmez: !!body.gerekmez, guncelleme: new Date().toISOString() };
      let mevcut = null;
      if (tur === 'urun') {
        const urunId = Number(body.urunId);
        if (!Number.isFinite(urunId)) throw new Hata(400, 'urunId gerekli');
        if (!ad) {
          const { data: p, error: pe } = await db.from('products').select('ad').eq('id', urunId).maybeSingle();
          kontrol(pe);
          ad = p ? p.ad : String(urunId);
        }
        satir.urun_id = urunId;
        satir.ad = ad;
        mevcut = v.urunReceteMap.get(urunId) || null;
      } else {
        if (!ad) throw new Hata(400, 'Yarı mamul adı gerekli');
        if (!['g', 'ml', 'adet'].includes(body.ciktiBirim)) throw new Hata(400, 'Çıktı birimi g, ml veya adet olmalı');
        const cikti = sayi(body.ciktiMiktar);
        if (!(cikti > 0)) throw new Hata(400, 'Çıktı miktarı sıfırdan büyük olmalı');
        satir.ad = ad;
        satir.cikti_miktar = cikti;
        satir.cikti_birim = body.ciktiBirim;
        if (body.id) mevcut = v.receteMap.get(body.id) || null;
      }
      const kalemler = Array.isArray(body.kalemler) ? body.kalemler : [];
      const temiz = [];
      kalemler.forEach((k, i) => {
        const miktar = sayi(k.miktar);
        const m = k.malzemeId && uuidMi(k.malzemeId) ? k.malzemeId : null;
        const a = k.altReceteId && uuidMi(k.altReceteId) ? k.altReceteId : null;
        if (!m && !a) return; // boş satır
        if (m && a) throw new Hata(400, 'Satır ya malzeme ya yarı mamul olmalı');
        if (!(miktar > 0)) throw new Hata(400, 'Her satırın miktarı sıfırdan büyük olmalı');
        if (m && !v.malzemeMap.has(m)) throw new Hata(400, 'Malzeme bulunamadı');
        if (a) {
          const alt = v.receteMap.get(a);
          if (!alt || alt.tur !== 'yari_mamul') throw new Hata(400, 'Yarı mamul bulunamadı');
          if (mevcut && alt.id === mevcut.id) throw new Hata(400, 'Yarı mamul kendini içeremez');
        }
        temiz.push({ malzeme_id: m, alt_recete_id: a, miktar, paket: tur === 'urun' && !!k.paket, sira: i });
      });
      // Döngü kontrolü: eklenen yarı mamullerin altında bu reçete var mı?
      if (mevcut) {
        const icerir = (rid, hedef, yigin = new Set()) => {
          if (rid === hedef) return true;
          if (yigin.has(rid)) return false;
          yigin.add(rid);
          return (v.kalemMap.get(rid) || []).some((k) => k.alt_recete_id && icerir(k.alt_recete_id, hedef, yigin));
        };
        if (temiz.some((k) => k.alt_recete_id && icerir(k.alt_recete_id, mevcut.id))) throw new Hata(400, 'Reçeteler birbirini çağırıyor (döngü)');
      }
      let id = mevcut ? mevcut.id : null;
      if (id) {
        const { error } = await db.from('m2_rc_receteler').update(satir).eq('id', id);
        if (error && error.code === '23505') throw new Hata(409, 'Bu isimde bir yarı mamul zaten var');
        kontrol(error);
      } else {
        const { data, error } = await db.from('m2_rc_receteler').insert(satir).select('id').single();
        if (error && error.code === '23505') throw new Hata(409, 'Bu isimde bir yarı mamul zaten var');
        kontrol(error);
        id = data.id;
      }
      const eskiKalemler = v.kalemMap.get(id) || [];
      const { error: se } = await db.from('m2_rc_kalemler').delete().eq('recete_id', id);
      kontrol(se);
      if (temiz.length) {
        const { error: ie } = await db.from('m2_rc_kalemler').insert(temiz.map((k) => ({ ...k, recete_id: id })));
        if (ie) {
          if (eskiKalemler.length) await db.from('m2_rc_kalemler').insert(eskiKalemler.map(({ id: _x, ...k }) => k)); // geri yükle
          kontrol(ie);
        }
      }
      temizle();
      return res.status(200).json({ ok: true, id });
    }

    if (resource === 'receteSil') {
      if (!uuidMi(body.id)) throw new Hata(400, 'id geçersiz');
      const { count, error: e1 } = await db.from('m2_rc_kalemler').select('id', { count: 'exact', head: true }).eq('alt_recete_id', body.id);
      kontrol(e1);
      if ((count || 0) > 0) throw new Hata(409, 'Bu yarı mamul başka reçetelerde kullanılıyor.');
      const { error } = await db.from('m2_rc_receteler').delete().eq('id', body.id);
      kontrol(error);
      temizle();
      return res.status(200).json({ ok: true });
    }

    // Seçili ürünleri "reçete gerekmez" yap / geri al (kola, su gibi)
    if (resource === 'gerekmezToplu') {
      const idler = (Array.isArray(body.urunIdler) ? body.urunIdler : []).map(Number).filter(Number.isFinite);
      if (!idler.length) throw new Hata(400, 'Ürün seçilmedi');
      const v = await veriYukle();
      const { data: ps, error: pe } = await db.from('products').select('id,ad').in('id', idler);
      kontrol(pe);
      const adlar = new Map((ps || []).map((p) => [Number(p.id), p.ad]));
      if (body.gerekmez) {
        const yeni = idler.filter((id) => !v.urunReceteMap.has(id)).map((id) => ({ tur: 'urun', urun_id: id, ad: adlar.get(id) || String(id), gerekmez: true }));
        if (yeni.length) {
          const { error } = await db.from('m2_rc_receteler').insert(yeni);
          kontrol(error);
        }
        const var_ = idler.filter((id) => v.urunReceteMap.has(id));
        if (var_.length) {
          const { error } = await db.from('m2_rc_receteler').update({ gerekmez: true }).in('urun_id', var_).eq('tur', 'urun');
          kontrol(error);
        }
      } else {
        const { error } = await db.from('m2_rc_receteler').update({ gerekmez: false }).in('urun_id', idler).eq('tur', 'urun');
        kontrol(error);
        // kalemi olmayan, sadece "gerekmez" için açılmış boş reçeteleri temizle
        const bos = idler.map((id) => v.urunReceteMap.get(id)).filter((r) => r && !(v.kalemMap.get(r.id) || []).length).map((r) => r.id);
        if (bos.length) {
          const { error: de } = await db.from('m2_rc_receteler').delete().in('id', bos);
          kontrol(de);
        }
      }
      temizle();
      return res.status(200).json({ ok: true });
    }

    // ---------- XML yükleme (zip veya tek tek xml metinleri) ----------
    if (resource === 'xmlYukle') {
      const hamlar = [];
      if (body.zipBase64) {
        const zip = new AdmZip(Buffer.from(body.zipBase64, 'base64'));
        zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.xml')).forEach((e) => hamlar.push({ dosya: e.entryName, xml: e.getData().toString('utf8') }));
      }
      (Array.isArray(body.xmlMetinleri) ? body.xmlMetinleri : []).forEach((x) => hamlar.push({ dosya: x.dosya || 'xml', xml: String(x.xml || '') }));
      if (!hamlar.length) throw new Hata(400, 'Yüklenecek XML bulunamadı');

      const okunan = [];
      const hatalar = [];
      let satisAtlandi = 0;
      for (const h of hamlar) {
        try {
          const p = parseFaturaXml(h.xml);
          if (!p.uuid || !p.faturaNo) {
            hatalar.push({ dosya: h.dosya, hata: 'Fatura no veya ETTN okunamadı' });
            continue;
          }
          if (p.yon === 'satis' || p.tedarikciVkn === KENDI_VKN) {
            satisAtlandi++;
            continue;
          }
          okunan.push(p);
        } catch (e) {
          hatalar.push({ dosya: h.dosya, hata: e.message });
        }
      }
      const ettnler = [...new Set(okunan.map((p) => p.uuid))];
      const mevcutlar = new Set();
      for (let i = 0; i < ettnler.length; i += 200) {
        const { data, error } = await db.from('m2_rc_xml').select('ettn').in('ettn', ettnler.slice(i, i + 200));
        kontrol(error);
        (data || []).forEach((d) => mevcutlar.add(d.ettn));
      }
      const yeniler = [];
      const goruldu = new Set();
      for (const p of okunan) {
        if (mevcutlar.has(p.uuid) || goruldu.has(p.uuid)) continue;
        goruldu.add(p.uuid);
        yeniler.push({
          ettn: p.uuid,
          fatura_no: p.faturaNo,
          tarih: isoGecerli(p.tarih) ? p.tarih : null,
          tedarikci_ad: p.tedarikciAdi,
          tedarikci_vkn: p.tedarikciVkn,
          tip: p.tip,
          toplam_kdv_dahil: p.toplamKdvDahil,
          odenecek: p.odenecekTutar,
          satirlar: p.satirlar.map((s) => ({
            siraNo: s.siraNo,
            urunKodu: s.urunKodu,
            urunAdi: s.urunAdi,
            miktar: s.miktar,
            birimKodu: s.birimKodu,
            birimAdi: s.birimAdi,
            kdvOrani: s.kdvOrani,
            satirTutariKdvDahil: s.satirTutariKdvDahil,
            efektifBirimFiyatKdvDahil: s.efektifBirimFiyatKdvDahil,
            supheliMiktar: s.supheliMiktar,
          })),
        });
      }
      let islenenFiyat = 0;
      if (yeniler.length) {
        const eklenecek = yeniler;
        for (let i = 0; i < eklenecek.length; i += 100) {
          const { error } = await db.from('m2_rc_xml').insert(eklenecek.slice(i, i + 100));
          kontrol(error);
        }
        // Sözlükte karşılığı olan satırların fiyatları hemen yazılır (iade faturaları atlanır)
        const sozluk = await sozlukOku();
        islenenFiyat = await fiyatlariIsle(yeniler.map((y) => ({ ...y, satirlar: y.satirlar })), sozluk);
      }
      return res.status(200).json({ ok: true, okunan: okunan.length, eklenen: yeniler.length, mukerrer: okunan.length - yeniler.length, satisAtlandi, hatalar, islenenFiyat });
    }

    // Bir fatura satırını malzemeye bağla (veya "yoksay"); sözlüğe yazar, aynı kalemi taşıyan TÜM faturalara uygular
    if (resource === 'xmlSatirEsle') {
      if (!uuidMi(body.xmlId)) throw new Hata(400, 'xmlId geçersiz');
      const { data: x, error: xe } = await db.from('m2_rc_xml').select('*').eq('id', body.xmlId).maybeSingle();
      kontrol(xe);
      if (!x) throw new Hata(404, 'Fatura bulunamadı');
      const s = (x.satirlar || []).find((l) => String(l.siraNo) === String(body.satirNo));
      if (!s) throw new Hata(404, 'Satır bulunamadı');
      const anahtar = sozlukAnahtari(x.tedarikci_vkn, x.tedarikci_ad, s.urunKodu, s.urunAdi);
      const yoksay = !!body.yoksay;
      let malzemeId = null;
      let carpan = 1;
      if (!yoksay) {
        if (!uuidMi(body.malzemeId)) throw new Hata(400, 'Malzeme seçin');
        carpan = sayi(body.carpan);
        if (!(carpan > 0)) throw new Hata(400, 'Birim çarpanı sıfırdan büyük olmalı (ör. 1 koli = 12 adet → 12)');
        const { data: m, error: me } = await db.from('m2_rc_malzemeler').select('id').eq('id', body.malzemeId).maybeSingle();
        kontrol(me);
        if (!m) throw new Hata(404, 'Malzeme bulunamadı');
        malzemeId = body.malzemeId;
      }
      const { error: ue } = await db.from('m2_rc_sozluk').upsert(
        { anahtar, tedarikci_vkn: x.tedarikci_vkn, tedarikci_ad: x.tedarikci_ad, urun_kodu: s.urunKodu || null, urun_adi: s.urunAdi || null, malzeme_id: malzemeId, carpan, yoksay, guncelleme: new Date().toISOString() },
        { onConflict: 'anahtar' },
      );
      kontrol(ue);
      // Aynı anahtarı taşıyan tüm faturaları yeniden işle (önceki yanlış eşleşmenin fiyatları silinip yenisi yazılır)
      const tum = await hepsiniOku('m2_rc_xml', '*');
      const ilgili = tum
        .map((f) => ({ ...f, satirlar: (f.satirlar || []).filter((l) => sozlukAnahtari(f.tedarikci_vkn, f.tedarikci_ad, l.urunKodu, l.urunAdi) === anahtar) }))
        .filter((f) => f.satirlar.length);
      const sozluk = await sozlukOku();
      const islenen = await fiyatlariIsle(ilgili, sozluk, true);
      return res.status(200).json({ ok: true, islenen, faturaSayisi: ilgili.length });
    }

    if (resource === 'sozlukSil') {
      if (!uuidMi(body.id)) throw new Hata(400, 'id geçersiz');
      const { error } = await db.from('m2_rc_sozluk').delete().eq('id', body.id);
      kontrol(error);
      return res.status(200).json({ ok: true });
    }

    // Fatura durumu: bekliyor | kullanildi (forma aktarılıp kaydedildi) | gizli
    if (resource === 'xmlDurum') {
      if (!uuidMi(body.id)) throw new Hata(400, 'id geçersiz');
      if (!['bekliyor', 'kullanildi', 'gizli'].includes(body.durum)) throw new Hata(400, 'Durum geçersiz');
      const { error } = await db.from('m2_rc_xml').update({ durum: body.durum, fis_grup_id: uuidMi(body.fisGrupId) ? body.fisGrupId : null }).eq('id', body.id);
      kontrol(error);
      return res.status(200).json({ ok: true });
    }

    if (resource === 'xmlSil') {
      if (!uuidMi(body.id)) throw new Hata(400, 'id geçersiz');
      const { error } = await db.from('m2_rc_xml').delete().eq('id', body.id);
      kontrol(error);
      return res.status(200).json({ ok: true });
    }

    throw new Hata(400, 'Geçersiz resource');
  } catch (err) {
    if (err instanceof Hata) return res.status(err.kod).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
