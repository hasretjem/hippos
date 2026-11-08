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

// Müşterinin ödediği (indirimli, KDV dahil) tutardan bize kalan net tutara katsayı
function netKatsayi(p) {
  return ((1 - Number(p.indirim)) / (1 + Number(p.satis_kdv))) * (1 - komisyonToplam(p));
}

// boy: { kalemler:[{malzeme_id, adet}], dukkan_fiyat, dukkan_urun, carpan, hedef_kar } (sayılar metin de olabilir)
export function boyHesap(boy, malzMap, p, ambalaj, urunMap) {
  const satirlar = (boy.kalemler || []).map((k) => {
    const m = malzMap.get(Number(k.malzeme_id)) || null;
    const adet = sayi(k.adet);
    const gram = m && m.birim_gram !== null && m.birim_gram !== undefined ? adet * Number(m.birim_gram) : 0;
    return { malzeme: m, adet, gram, maliyet: adet * birimMaliyet(m), eksik: !m };
  });
  const gram = satirlar.reduce((t, s) => t + s.gram, 0);
  const malzemeMaliyet = satirlar.reduce((t, s) => t + s.maliyet, 0);
  const kontrolVar = satirlar.some((s) => s.malzeme && s.malzeme.kontrol);
  const eksikVar = satirlar.some((s) => s.eksik);

  const urun = boy.dukkan_urun ? urunMap.get(Number(boy.dukkan_urun)) || null : null;
  const manuel = sayi(boy.dukkan_fiyat);
  const dukkan = urun ? Number(urun.fiyat) || null : manuel > 0 ? manuel : null;
  const carpan = sayi(boy.carpan) > 0 ? sayi(boy.carpan) : Number(p.carpan);
  const hedefKar = boy.hedef_kar === '' || boy.hedef_kar === null || boy.hedef_kar === undefined ? null : sayi(boy.hedef_kar);

  const amb = Number(ambalaj) || 0;
  const toplamMaliyet = malzemeMaliyet + amb;
  const kat = netKatsayi(p);
  const kdv = Number(p.satis_kdv);
  const ind = Number(p.indirim);

  // Dükkân tarafı
  let dukkanKar = null;
  let dukkanKarOrani = null;
  let dukkanMarj = null;
  if (dukkan) {
    const kdvHaric = dukkan / (1 + kdv);
    dukkanKar = kdvHaric - malzemeMaliyet;
    dukkanKarOrani = malzemeMaliyet > 0 ? dukkanKar / malzemeMaliyet : null;
    dukkanMarj = kdvHaric > 0 ? dukkanKar / kdvHaric : null;
  }

  // Platform tarafı (dükkân fiyatı × çarpan)
  const platformFiyat = (fiyat) => {
    const indirimli = fiyat * (1 - ind);
    const net = fiyat * kat;
    const netKar = net - toplamMaliyet;
    const musteriKdvHaric = indirimli / (1 + kdv);
    return {
      fiyat,
      indirimli,
      net,
      netKar,
      karOrani: toplamMaliyet > 0 ? netKar / toplamMaliyet : null,
      marj: musteriKdvHaric > 0 ? netKar / musteriKdvHaric : null,
    };
  };
  const carpanli = dukkan ? platformFiyat(yukariYuvarla(dukkan * carpan)) : null;

  // Hedef kâr: elle girilen, yoksa dükkândaki net kâr
  const hedef = hedefKar !== null ? hedefKar : dukkanKar;
  const hedefli = hedef !== null && kat > 0 ? platformFiyat(yukariYuvarla((toplamMaliyet + hedef) / kat)) : null;

  return {
    satirlar, gram, malzemeMaliyet, ambalaj: amb, toplamMaliyet, kontrolVar, eksikVar,
    dukkan, dukkanUrun: urun, carpan, hedef, hedefKarGirildi: hedefKar !== null,
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
