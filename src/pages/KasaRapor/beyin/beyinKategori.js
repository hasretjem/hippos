// İşletmenin Beyni — kategori içi değerlendirme (saf hesaplar).
// Küçük/büyük boylar "birleşik ad" altında toplanır: önce elle girilen birleşik ad, sonra ekmek → "Ekmek",
// sonra tek malzemeli eşleştirmede malzemenin adı (Beyaz Peynir K. + B. → "Beyaz peynir"), yoksa isimden boy ekleri atılır.
import { AYLIK, ekmekMi, birimMaliyet, gunEkle, haftaBasi } from './beyinHesap';

const MALZ_GORUNEN = { 'Kesik zeytin': 'Zeytin', 'Tavuk salam': 'Salam', 'Sosis/Patates': 'Sosis-patates', 'Kaşar peynir': 'Kaşar', 'Dana kavurma': 'Kavurma' };

export function adTemizle(ad) {
  let s = String(ad || '')
    .normalize('NFC')
    .replace(/i\u0307/g, 'i')
    .replace(/^\s*\d+\s*-\s*/, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\*+/g, ' ');
  s = s.replace(/(^|\s)(KS|BS|K|B|k|b|Kah|KAH|kah|Küçük|KÜÇÜK|küçük|Büyük|BÜYÜK|büyük|Kahv)\.?(?=\s|$)/g, ' ');
  s = s.replace(/[\s.]+$/, '').replace(/\s+/g, ' ').trim();
  const l = s.toLocaleLowerCase('tr');
  return l.charAt(0).toLocaleUpperCase('tr') + l.slice(1);
}

export function birlesikAdFn(model) {
  const esl = new Map((model.d.eslestirme || []).map((e) => [e.urun_ad, e]));
  return (ad, k) => {
    const e = esl.get(ad);
    if (e && e.birlesik_ad) return e.birlesik_ad;
    if (ekmekMi(ad, k)) return 'Ekmek';
    const mal = model.maliyet.get(ad);
    if (mal && mal.kaynak !== 'reçete' && mal.kalemler.length === 1) {
      const m = model.malzMap.get(mal.kalemler[0].m);
      if (m) return MALZ_GORUNEN[m.ad] || m.ad;
    }
    return adTemizle(ad) || ad;
  };
}

// "Güzel" fiyata yukarı yuvarla: 50 ₺'ye kadar tam lira, üstü 5'in katı.
export const guzelFiyat = (x) => (x <= 50 ? Math.ceil(x - 1e-9) : Math.ceil(x / 5 - 1e-9) * 5);

export function kategoriModel(model, k) {
  const bAd = birlesikAdFn(model);
  const menuFiyat = new Map((model.d.urunler || []).map((u) => [u.ad, Number(u.fiyat)]));
  const urunler = model.urunListe.filter((u) => u.k === k && u.adet + u.oncekiHaftalikAdet > 0);
  const gruplar = new Map();
  for (const u of urunler) {
    const ad = bAd(u.ad, u.k);
    const g = gruplar.get(ad) || { ad, varyant: [], adet: 0, ciro: 0, kar: 0, mc: 0, onceki: 0, seri: new Map() };
    g.varyant.push(u);
    g.adet += u.adet;
    g.ciro += u.ciro;
    g.onceki += u.oncekiHaftalikAdet;
    if (u.kar !== null) {
      g.kar += u.kar;
      g.mc += u.ciro;
    }
    for (const [h, x] of u.seri) {
      const y = g.seri.get(h) || { a: 0, c: 0 };
      y.a += x.a;
      y.c += x.c;
      g.seri.set(h, y);
    }
    gruplar.set(ad, g);
  }
  const liste = [...gruplar.values()].map((g) => {
    const mal = g.mc > 0;
    const trend = g.onceki > 0 ? (g.adet / 4 - g.onceki) / g.onceki : null;
    // Porsiyon başına fiyat: tek malzemeli varyantlarda (adet = dilim/porsiyon sayısı)
    const porsiyon = g.varyant
      .map((u) => {
        const m = model.maliyet.get(u.ad);
        const a = m && m.kaynak !== 'reçete' && m.kalemler.length === 1 ? m.kalemler[0].a : null;
        const fiyat = menuFiyat.has(u.ad) ? menuFiyat.get(u.ad) : u.fiyat;
        return a && fiyat ? { ad: u.ad, porsiyon: a, birimAd: model.malzMap.get(m.kalemler[0].m)?.birim_adi || 'porsiyon', fiyat, porsiyonFiyat: fiyat / a, adet: u.adet } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.porsiyon - b.porsiyon);
    let tutarsiz = null;
    if (porsiyon.length >= 2) {
      const pf = porsiyon.map((p) => p.porsiyonFiyat);
      const oran = Math.max(...pf) / Math.min(...pf);
      if (oran > 1.15) tutarsiz = oran;
    }
    return { ...g, marj: mal ? g.kar / g.mc : null, karVar: mal, kapsam: g.ciro ? g.mc / g.ciro : 0, trend, porsiyon, tutarsiz };
  });
  liste.sort((a, b) => b.ciro - a.ciro);

  const kat = model.kategoriler.get(k);
  const sum4 = (f) => model.son4.reduce((t, h) => t + (f(kat?.hafta.get(h)) || 0), 0);
  const ciro = sum4((x) => x?.c);
  const once = model.onceki8.length ? model.onceki8.reduce((t, h) => t + (kat?.hafta.get(h)?.c || 0), 0) / model.onceki8.length : 0;
  let tahKar = 0;
  for (const r of model.veri.haftalik || []) if (r.k === k && model.son4.includes(r.h)) tahKar += model.tahminiKar(r.u, r.k, Number(r.a), Number(r.c));
  const kapsam = kat?.kapsama || 0;
  const katMarj = model.katMarj(k);
  let toplam = 0;
  for (const x of model.kategoriler.values()) toplam += model.son4.reduce((t, h) => t + (x.hafta.get(h)?.c || 0), 0);

  // Bu ay kategori kârı (günlük ciro × kategori marjı)
  const ayBas = model.bugun.slice(0, 8) + '01';
  let ayCiro = 0;
  for (const r of model.veri.gunluk || []) if (r.k === k && r.g >= ayBas) ayCiro += Number(r.c);
  const ayKar = katMarj === null ? null : ayCiro * katMarj;
  const hedef = Number((model.d.ayarlar?.kategori_hedef || {})[k]) || 0;

  return {
    k,
    liste,
    ozet: {
      ciro,
      kar: katMarj === null && kapsam < 0.3 ? null : tahKar,
      marj: katMarj,
      kapsam,
      trend: once ? (ciro / 4 - once) / once : null,
      pay: toplam ? ciro / toplam : 0,
    },
    ay: { ciro: ayCiro, kar: ayKar, hedef, oran: hedef && ayKar !== null ? ayKar / hedef : null, beklenen: model.ay.gecenGun / model.ay.ayGun },
    menuFiyat,
    bAd,
  };
}

export function kategoriTespitleri(km) {
  const t = [];
  const l = km.liste.filter((g) => g.adet >= 10);
  const azKar = l.filter((g) => g.marj !== null && g.marj < 0.3 && g.kar >= 0).sort((a, b) => b.ciro - a.ciro)[0];
  if (azKar) t.push({ s: 'turuncu', baslik: `Çok satıyor, az kâr: ${azKar.ad}`, metin: `Kategori cirosunun %${Math.round((azKar.ciro / Math.max(1, km.ozet.ciro)) * 100)} kadarı, ama marjı ${Math.round(azKar.marj * 100)}%. Ayda ~${Math.round(azKar.kar * AYLIK).toLocaleString('tr-TR')} ₺ kâr bırakıyor.` });
  for (const g of l.filter((x) => x.karVar && x.kar < 0)) t.push({ s: 'kirmizi', baslik: `Zararına: ${g.ad}`, metin: `Son 4 haftada ${Math.round(g.adet)} adet, ${Math.round(g.kar).toLocaleString('tr-TR')} ₺ kâr (zarar). Ayda ~${Math.round(-g.kar * AYLIK).toLocaleString('tr-TR')} ₺ kaybettiriyor.` });
  const buyuyen = l.filter((g) => g.trend !== null && g.adet >= 20).sort((a, b) => b.trend - a.trend)[0];
  if (buyuyen && buyuyen.trend > 0.1) t.push({ s: 'yesil', baslik: `En hızlı büyüyen: ${buyuyen.ad}`, metin: `Haftalık adet önceki 8 haftaya göre +%${Math.round(buyuyen.trend * 100)}${buyuyen.marj !== null ? `, marjı %${Math.round(buyuyen.marj * 100)}` : ''}.` });
  const dusen = l.filter((g) => g.trend !== null && g.adet >= 20).sort((a, b) => a.trend - b.trend)[0];
  if (dusen && dusen.trend < -0.15) t.push({ s: 'sari', baslik: `En çok düşen: ${dusen.ad}`, metin: `Haftalık adet önceki 8 haftaya göre −%${Math.round(-dusen.trend * 100)}.` });
  for (const g of km.liste.filter((x) => x.tutarsiz)) {
    t.push({ s: 'sari', baslik: `Porsiyon başı fiyat tutarsız: ${g.ad}`, metin: g.porsiyon.map((p) => `${p.ad}: ${p.porsiyon} ${p.birimAd} ${p.fiyat.toLocaleString('tr-TR')} ₺ (${p.porsiyonFiyat.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺/${p.birimAd})`).join(' · ') });
  }
  return t;
}

// Fiyat listesi önerisi: marjı %40'ın altındaki kalemler %40'a, güzel fiyata yuvarlanarak. Satış adedi aynı kalırsa aylık etkisi.
export function fiyatOnerisi(model, km, hedefMarj = 0.4) {
  const satir = [];
  for (const g of km.liste) {
    for (const u of g.varyant) {
      if (u.birim === null || u.birim === undefined || !u.adet) continue;
      const fiyat = km.menuFiyat.has(u.ad) ? km.menuFiyat.get(u.ad) : u.fiyat;
      const marj = fiyat ? (fiyat - u.birim) / fiyat : null;
      const hedef = guzelFiyat(u.birim / (1 - hedefMarj));
      const oneri = marj !== null && marj >= hedefMarj ? fiyat : Math.max(fiyat, hedef);
      satir.push({ grup: g.ad, ad: u.ad, fiyat, birim: u.birim, marj, oneri, yeniMarj: oneri ? (oneri - u.birim) / oneri : null, aylik: (oneri - fiyat) * u.adet * AYLIK, adet: u.adet });
    }
  }
  return satir.sort((a, b) => b.aylik - a.aylik || a.grup.localeCompare(b.grup, 'tr'));
}

// Kombinasyonlar ve set önerisi (son 60 gün, fiş bazında). rpc = beyin_kategori sonucu
export function kombinasyonlar(model, km, rpc) {
  const fis = Number(rpc?.fis60) || 0;
  const sepetMap = new Map();
  for (const s of rpc?.sepet || []) {
    const adlar = [...new Set((s.urunler || []).map((u) => km.bAd(u, km.k)))].sort((a, b) => a.localeCompare(b, 'tr'));
    if (adlar.length < 2) continue;
    const key = adlar.join(' + ');
    sepetMap.set(key, (sepetMap.get(key) || 0) + Number(s.n));
  }
  const sepetler = [...sepetMap.entries()].map(([ad, n]) => ({ ad, n, oran: fis ? n / fis : 0 })).sort((a, b) => b.n - a.n).slice(0, 8);

  const urun = new Map();
  for (const u of rpc?.urun || []) {
    const ad = km.bAd(u.u, km.k);
    const x = urun.get(ad) || { ad, fis: 0, yalnizKat: 0, yalnizTum: 0 };
    x.fis += Number(u.fis);
    x.yalnizKat += Number(u.yalniz_kat);
    x.yalnizTum += Number(u.yalniz_tum);
    urun.set(ad, x);
  }
  const cift = new Map();
  for (const c of rpc?.cift || []) {
    const a = km.bAd(c.a, km.k);
    const b = km.bAd(c.b, km.k);
    if (a === b) continue;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    cift.set(key, (cift.get(key) || 0) + Number(c.n));
  }
  const ciftler = [...cift.entries()]
    .map(([key, n]) => {
      const [a, b] = key.split('|');
      const na = urun.get(a)?.fis || 0;
      const nb = urun.get(b)?.fis || 0;
      const [ilk, ikinci, oran] = n / Math.max(1, na) >= n / Math.max(1, nb) ? [a, b, n / Math.max(1, na)] : [b, a, n / Math.max(1, nb)];
      return { ilk, ikinci, n, oran: Math.min(1, oran) };
    })
    .filter((x) => x.n >= 5)
    .sort((x, y) => y.n * y.oran - x.n * x.oran)
    .slice(0, 10);

  // Set önerisi: fişlerin en az %25'inde görülen kalemler (en çok 6), her birinden en çok satan varyantın 1 porsiyonu
  const set = [...urun.values()]
    .filter((x) => fis && x.fis / fis >= 0.25)
    .sort((a, b) => b.fis - a.fis)
    .slice(0, 6)
    .map((x) => {
      const g = km.liste.find((y) => y.ad === x.ad);
      const v = g ? [...g.varyant].sort((a, b) => b.adet - a.adet)[0] : null;
      const fiyat = v ? (km.menuFiyat.has(v.ad) ? km.menuFiyat.get(v.ad) : v.fiyat) : 0;
      return { ad: x.ad, oran: x.fis / fis, varyant: v?.ad, fiyat: fiyat || 0, maliyet: v && v.birim !== null ? v.birim : null };
    });
  let setOneri = null;
  if (set.length >= 3) {
    const ayri = set.reduce((t, x) => t + x.fiyat, 0);
    const maliyet = set.every((x) => x.maliyet !== null) ? set.reduce((t, x) => t + x.maliyet, 0) : null;
    const fiyat = guzelFiyat(ayri * 0.9);
    setOneri = { kalemler: set, ayri, fiyat, maliyet, kar: maliyet !== null ? fiyat - maliyet : null, marj: maliyet !== null ? (fiyat - maliyet) / fiyat : null };
  }
  return { fis, sepetler, ciftler, urun, setOneri };
}

// "Menüden çıkarırsam ne olur?"
export function cikarmaEtkisi(g, komb) {
  const u = komb?.urun.get(g.ad);
  return {
    aylikCiro: g.ciro * AYLIK,
    aylikKar: g.karVar ? g.kar * AYLIK : null,
    fis: u?.fis || 0,
    yalnizTum: u && u.fis ? u.yalnizTum / u.fis : null,
    yalnizKat: u && u.fis ? u.yalnizKat / u.fis : null,
  };
}

// Sandviç derinliği: sandviç başına ortalama malzeme sayısı ve tutarı (tek ekmekli fişler, haftalık)
export function sandvicDerinligi(model) {
  const sf = model.d.sandvic?.fis || [];
  const sk = model.d.sandvic?.kalem || [];
  const h = new Map();
  for (const f of sf) {
    const x = h.get(f.h) || { n: 0, kalem: 0, tutar: 0 };
    x.n += Number(f.n);
    h.set(f.h, x);
  }
  for (const k of sk) {
    if (ekmekMi(k.u, 'SOĞUK SANDVİÇ') || model.grupOf(k.u, 'SOĞUK SANDVİÇ') === 'menu') continue;
    const x = h.get(k.h);
    if (!x) continue;
    x.kalem += Number(k.a);
    x.tutar += Number(k.c);
  }
  return model.haftalar.filter((w) => h.has(w)).map((w) => { const x = h.get(w); return { h: w, n: x.n, kalem: x.n ? x.kalem / x.n : 0, tutar: x.n ? x.tutar / x.n : 0 }; });
}

// Kategoriler arası kıyas (son 4 hafta)
export function kategoriKiyas(model) {
  const satir = [];
  let toplamC = 0;
  let toplamK = 0;
  for (const k of model.kategoriler.values()) {
    const c = model.son4.reduce((t, h) => t + (k.hafta.get(h)?.c || 0), 0);
    if (c <= 0) continue;
    let kar = 0;
    for (const r of model.veri.haftalik || []) if (r.k === k.k && model.son4.includes(r.h)) kar += model.tahminiKar(r.u, r.k, Number(r.a), Number(r.c));
    const karVar = model.katMarj(k.k) !== null || k.kapsama >= 0.3;
    const once = model.onceki8.length ? model.onceki8.reduce((t, h) => t + (k.hafta.get(h)?.c || 0), 0) / model.onceki8.length : 0;
    satir.push({ k: k.k, ciro: c, kar: karVar ? kar : null, marj: karVar && c ? kar / c : null, kapsam: k.kapsama, trend: once ? (c / 4 - once) / once : null });
    toplamC += c;
    if (karVar) toplamK += kar;
  }
  return satir
    .map((s) => ({ ...s, ciroPay: toplamC ? s.ciro / toplamC : 0, karPay: s.kar !== null && toplamK ? s.kar / toplamK : null }))
    .sort((a, b) => b.ciro - a.ciro);
}

export { birimMaliyet, gunEkle, haftaBasi };
