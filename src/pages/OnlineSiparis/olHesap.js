// Online Sipariş (Yemeksepeti) maliyet ve fiyat hesapları. Saf fonksiyonlar — ekrandan bağımsız.
import { sayi } from '../Muhasebe2/m2Ortak';

export const yukariYuvarla = (n) => Math.ceil(n - 1e-9);

// Bir malzemenin 1 birimlik (kayıttaki birim: 1 dilim, 1 tutam, 1 adet...) maliyeti. Fiyat KDV dahildir.
export function birimMaliyet(m) {
  if (!m) return 0;
  const f = Number(m.fiyat) || 0;
  if (m.fiyat_turu === 'kg') return ((Number(m.birim_gram) || 0) / 1000) * f;
  return f;
}

// Toplam komisyon oranı: (iletim + dağıtım) × (1 + komisyon KDV'si)
export function komisyonToplam(p) {
  return (Number(p.kom_iletim) + Number(p.kom_dagitim)) * (1 + Number(p.kom_kdv));
}

// Dükkândaki net tutarı koruyan çarpan: 1 / ((1 − indirim) × (1 − toplam komisyon))
export function onerilenCarpan(p) {
  const d = (1 - Number(p.indirim)) * (1 - komisyonToplam(p));
  return d > 0 ? 1 / d : null;
}

// Menü fiyatından Yemeksepeti'nin hesabımıza yatıracağı tutara katsayı (KDV dahil, Yemeksepeti ekranıyla birebir):
// yatan = fiyat × (1 − indirim) × (1 − (iletim + dağıtım) × (1 + komisyon KDV'si)). Komisyon, KDV dahil indirimli fiyat üzerinden kesilir.
function netKatsayi(p) {
  return (1 - Number(p.indirim)) * (1 - komisyonToplam(p));
}

// Müşterinin ödediği (indirimli) tutardan hesabımıza yatan orana: 1 − toplam komisyon
export const netOran = (p) => 1 - komisyonToplam(p);
export const kurus = (n) => Math.round((Number(n) || 0) * 100) / 100;

// boy: { kalemler:[{malzeme_id, adet}], dukkan_urunler:[ürün id'leri, tekrar edebilir], dukkan_fiyat (elle), platform_fiyat (elle), carpan, hedef_kar } (sayılar metin de olabilir)
export function boyHesap(boy, malzMap, p, ambalaj, urunMap) {
  const satirlar = (boy.kalemler || []).map((k) => {
    const m = malzMap.get(Number(k.malzeme_id)) || null;
    const adet = sayi(k.adet);
    const gram = m && m.birim_gram !== null && m.birim_gram !== undefined ? adet * Number(m.birim_gram) : 0;
    // Müşteri seçimli kalemde maliyet EN PAHALI seçeneğe göre hesaplanır.
    const secenekler = k.secimli ? (k.secenekler || []).map((id) => malzMap.get(Number(id))).filter(Boolean) : [];
    const birim = secenekler.length ? Math.max(...secenekler.map(birimMaliyet)) : birimMaliyet(m);
    return { malzeme: m, adet, gram, maliyet: adet * birim, eksik: !m, secimli: !!k.secimli, soru: k.soru || '', secenekler };
  });
  const gram = satirlar.reduce((t, s) => t + s.gram, 0);
  const malzemeMaliyet = satirlar.reduce((t, s) => t + s.maliyet, 0);
  const kontrolVar = satirlar.some((s) => s.malzeme && s.malzeme.kontrol);
  const eksikVar = satirlar.some((s) => s.eksik);

  // Dükkân fiyatı: seçilen satış ekranı ürünlerinin CANLI fiyat toplamı (aynı ürün birden çok kez olabilir); liste boşsa elle girilen.
  const idler = boy.dukkan_urunler && boy.dukkan_urunler.length ? boy.dukkan_urunler : boy.dukkan_urun ? [boy.dukkan_urun] : [];
  const dukkanUrunler = idler.map((id) => urunMap.get(Number(id)) || null);
  const urunEksik = dukkanUrunler.some((u) => !u);
  const urunToplam = dukkanUrunler.reduce((t, u) => t + (u ? Number(u.fiyat) || 0 : 0), 0);
  const manuel = sayi(boy.dukkan_fiyat);
  const dukkan = idler.length ? urunToplam || null : manuel > 0 ? manuel : null;
  const platformManuel = sayi(boy.platform_fiyat) > 0 ? sayi(boy.platform_fiyat) : null;
  const carpan = sayi(boy.carpan) > 0 ? sayi(boy.carpan) : Number(p.carpan);
  const hedefKar = boy.hedef_kar === '' || boy.hedef_kar === null || boy.hedef_kar === undefined ? null : sayi(boy.hedef_kar);

  const amb = Number(ambalaj) || 0;
  const toplamMaliyet = malzemeMaliyet + amb;
  const kat = netKatsayi(p);
  const ind = Number(p.indirim);

  // Dükkân tarafı
  let dukkanKar = null;
  let dukkanKarOrani = null;
  let dukkanMarj = null;
  if (dukkan) {
    // KDV dahil kâr: kasaya giren tutar − malzeme maliyeti
    dukkanKar = dukkan - malzemeMaliyet;
    dukkanKarOrani = malzemeMaliyet > 0 ? dukkanKar / malzemeMaliyet : null;
    dukkanMarj = dukkan > 0 ? dukkanKar / dukkan : null;
  }

  // Platform tarafı (dükkân fiyatı × çarpan)
  const platformFiyat = (fiyat) => {
    const indirimli = fiyat * (1 - ind);
    const net = fiyat * kat; // Yemeksepeti'nin yatıracağı tutar
    const netKar = net - toplamMaliyet;
    return {
      fiyat,
      indirimli,
      net,
      netKar,
      karOrani: toplamMaliyet > 0 ? netKar / toplamMaliyet : null,
      marj: net > 0 ? netKar / net : null,
    };
  };
  // Önerilen platform fiyatı = dükkân × çarpan (yukarı yuvarlı); elle girilen platform fiyatı varsa o kullanılır (sabit kalır).
  const onerilen = dukkan ? yukariYuvarla(dukkan * carpan) : null;
  const carpanli = platformManuel ? { ...platformFiyat(platformManuel), manuel: true, onerilen } : onerilen ? { ...platformFiyat(onerilen), manuel: false, onerilen } : null;

  // Hedef kâr: elle girilen, yoksa dükkândaki net kâr
  const hedef = hedefKar !== null ? hedefKar : dukkanKar;
  const hedefli = hedef !== null && kat > 0 ? platformFiyat(yukariYuvarla((toplamMaliyet + hedef) / kat)) : null;

  return {
    satirlar, gram, malzemeMaliyet, ambalaj: amb, toplamMaliyet, kontrolVar, eksikVar,
    dukkan, dukkanUrunler, urunEksik, platformManuel, onerilen, carpan, hedef, hedefKarGirildi: hedefKar !== null,
    dukkanKar, dukkanKarOrani, dukkanMarj, carpanli, hedefli,
  };
}

// Faturadan birim maliyet: liste fiyatı → iskonto → KDV → koli adedine böl
export function faturaBirimFiyat(liste, iskontoYuzde, kdvYuzde, bolen) {
  const b = sayi(bolen) || 1;
  const v = (sayi(liste) * (1 - sayi(iskontoYuzde) / 100) * (1 + sayi(kdvYuzde) / 100)) / b;
  return Math.round(v * 100) / 100;
}

export const yuzde = (n, k = 1) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: k }).format(n * 100)}%`;
