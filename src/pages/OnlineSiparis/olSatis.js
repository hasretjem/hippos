// Satış ekranındaki "Online sipariş" kategorisi: sipariş kalemi üretimi, mutfak fişi yapısı ve yatacak tutar hesabı.
// Saf fonksiyonlar — ekrandan bağımsız, test edilebilir.
import { boyHesap, kurus, netOran } from './olHesap';

export { kurus };
export const ONLINE_KATEGORI = 'ONLINE SİPARİŞ';
export const ONLINE_ETIKET = 'Online sipariş';

// Müşterinin seçebildiği ekmekler (platformdaki adlarıyla)
export const EKMEKLER = {
  buyuk: ['Büyük Beyaz Baget Ekmeği', 'Domatesli/Fesleğenli Tam Tahıllı Ekmek'],
  normal: ['Küçük Beyaz Ekmek', 'Küçük Tahıllı Ekmek'],
};
export const boyAd = (boy) => (boy === 'buyuk' ? 'Büyük' : 'Küçük');
export const BUFE_AD = 'Kendi Sandviçini Oluştur';

const yeniId = () => Date.now() + Math.random();
const indirimli = (liste, p) => kurus(Number(liste) * (1 - Number(p.indirim)));

// Satışa hazır menüler: platform fiyatı ve malzemesi olan sandviç boyları.
export function menuListesi(veri, urunMap) {
  const malzMap = new Map(veri.malzemeler.map((m) => [m.id, m]));
  const liste = { buyuk: [], normal: [] };
  veri.sandvicler.forEach((s) => {
    ['buyuk', 'normal'].forEach((boy) => {
      const h = boyHesap(s[boy], malzMap, veri.p, 0, urunMap);
      if (h.satirlar.length === 0 || !h.carpanli) return;
      liste[boy].push({ sandvic: s, boy, h, liste: h.carpanli.fiyat, fiyat: kurus(h.carpanli.indirimli) });
    });
  });
  return liste;
}

// Menüdeki müşteri seçimli sorular: [{ index, soru, secenekler:[{id, ad}] }]
export function menuSorulari(h) {
  return h.satirlar
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.secimli && s.secenekler.length > 0)
    .map(({ s, index }) => ({ index, soru: s.soru || 'Seçim', secenekler: s.secenekler.map((m) => ({ id: m.id, ad: m.ad })) }));
}

// Fişe yazılacak malzeme listesi: ambalaj çıkar, ekmek yerine müşterinin seçtiği ekmek yazar, seçimli kalemde seçilen malzeme yazar.
function fisKalemleri(h, secimler) {
  const kalemler = [];
  h.satirlar.forEach((s, index) => {
    if (!s.malzeme) return;
    if (s.malzeme.tur === 'ambalaj' || s.malzeme.tur === 'ekmek') return;
    let m = s.malzeme;
    if (s.secimli && s.secenekler.length) m = s.secenekler.find((x) => x.id === Number(secimler?.[index])) || s.secenekler[0];
    kalemler.push({ ad: m.ad, adet: s.adet, s: m.surulebilir ? 1 : 0 });
  });
  return kalemler;
}

function online(p, alanlar) {
  return { netOran: netOran(p), ...alanlar };
}

export function menuKalemi({ menu, p, ekmek, altEkmek, secimler, not, siparisNo }) {
  const sorular = menuSorulari(menu.h);
  return {
    id: yeniId(),
    ad: `${menu.sandvic.ad} (${boyAd(menu.boy)})`,
    fiyat: menu.fiyat,
    kategori: ONLINE_KATEGORI,
    altKategori: 'Menüler',
    selected: false,
    note: false,
    online: online(p, {
      tur: 'menu',
      boy: menu.boy,
      ekmek,
      altEkmek: !!altEkmek,
      not: (not || '').trim(),
      siparisNo: (siparisNo || '').trim(),
      liste: menu.liste,
      secim: sorular.map((q) => (q.secenekler.find((o) => o.id === Number(secimler?.[q.index])) || q.secenekler[0]).ad).join(', '),
      kalemler: fisKalemleri(menu.h, secimler),
    }),
  };
}

export function bufeKalemi({ boy, p, ekmek, altEkmek, not, siparisNo }) {
  const liste = boy === 'buyuk' ? p.ekmek_fiyat_buyuk : p.ekmek_fiyat_kucuk;
  return {
    id: yeniId(),
    ad: `${BUFE_AD} (${boyAd(boy)})`,
    fiyat: indirimli(liste, p),
    kategori: ONLINE_KATEGORI,
    altKategori: 'Menüler',
    selected: false,
    note: false,
    online: online(p, { tur: 'bufe', boy, ekmek, altEkmek: !!altEkmek, not: (not || '').trim(), siparisNo: (siparisNo || '').trim(), liste: Number(liste), kalemler: [] }),
  };
}

// ustId: bağlı olduğu "Kendi Sandviçini Oluştur" kalemi (yoksa tek başına ekstra).
export function ekstraKalemi({ ekstra, boy, p, ustId, siparisNo }) {
  const liste = boy === 'buyuk' ? ekstra.fiyat_buyuk : ekstra.fiyat_kucuk;
  return {
    id: yeniId(),
    ad: `${ekstra.ad} (${boyAd(boy)} ekstra)`,
    fiyat: indirimli(liste, p),
    kategori: ONLINE_KATEGORI,
    altKategori: 'Ekstralar',
    selected: false,
    note: false,
    online: online(p, {
      tur: 'ekstra',
      boy,
      ustId: ustId || null,
      malzeme: ekstra.ad,
      adet: Number(boy === 'buyuk' ? ekstra.adet_buyuk : ekstra.adet_kucuk) || 1,
      s: ekstra.surulebilir ? 1 : 0,
      liste: Number(liste),
      siparisNo: (siparisNo || '').trim(),
    }),
  };
}

export function icecekKalemi({ icecek, p, siparisNo }) {
  return {
    id: yeniId(),
    ad: icecek.ad,
    fiyat: indirimli(icecek.fiyat, p),
    kategori: ONLINE_KATEGORI,
    altKategori: 'İçecekler',
    selected: false,
    note: false,
    online: online(p, { tur: 'icecek', liste: Number(icecek.fiyat), siparisNo: (siparisNo || '').trim() }),
  };
}

// Siparişteki (en son girilen) platform sipariş numarası
export function siparisNoBul(items) {
  for (let i = (items || []).length - 1; i >= 0; i -= 1) {
    const no = items[i]?.online?.siparisNo;
    if (no) return no;
  }
  return '';
}

// Masa notuna sipariş no ekler (zaten varsa dokunmaz).
export function notaSiparisNoEkle(not, siparisNo) {
  const no = (siparisNo || '').trim();
  const mevcut = (not || '').trim();
  if (!no) return mevcut;
  if (!mevcut) return no;
  if (mevcut.split(/[\s·|,-]+/).includes(no) || mevcut.includes(no)) return mevcut;
  return `${mevcut} · ${no}`;
}

// Aynı adlı satırları toplar; sürülebilirler başa gelir (ekmeğin hemen altı), sıra korunur.
function topla(kalemler) {
  const harita = new Map();
  kalemler.forEach((k) => {
    const o = harita.get(k.ad);
    if (o) o.adet += Number(k.adet) || 0;
    else harita.set(k.ad, { ad: k.ad, adet: Number(k.adet) || 0, s: k.s ? 1 : 0 });
  });
  const hepsi = [...harita.values()];
  return [...hepsi.filter((k) => k.s), ...hepsi.filter((k) => !k.s)];
}

// Mutfak fişi yapısı: sandviç blokları (menü + açık büfe), tek başına ekstralar, içecekler ve online olmayan kalemler.
export function fisYapisi(items) {
  const liste = items || [];
  const bloklar = [];
  const blokById = new Map();
  liste.forEach((i) => {
    const o = i.online;
    if (!o || (o.tur !== 'menu' && o.tur !== 'bufe')) return;
    const blok = { id: i.id, baslik: i.ad, fiyat: i.fiyat, ekmek: o.ekmek, altEkmek: !!o.altEkmek, not: o.not || '', ham: [...(o.kalemler || [])] };
    bloklar.push(blok);
    blokById.set(i.id, blok);
  });
  const serbest = { buyuk: [], normal: [] };
  const serbestFiyat = { buyuk: 0, normal: 0 };
  const icecekMap = new Map();
  const digerleri = [];
  liste.forEach((i) => {
    const o = i.online;
    if (!o) {
      digerleri.push(i);
      return;
    }
    if (o.tur === 'ekstra') {
      const blok = o.ustId ? blokById.get(o.ustId) : null;
      const kalem = { ad: o.malzeme, adet: o.adet, s: o.s };
      if (blok) {
        blok.ham.push(kalem);
        blok.fiyat += i.fiyat;
      } else {
        const boy = o.boy === 'buyuk' ? 'buyuk' : 'normal';
        serbest[boy].push(kalem);
        serbestFiyat[boy] += i.fiyat;
      }
    } else if (o.tur === 'icecek') {
      const x = icecekMap.get(i.ad);
      if (x) {
        x.adet += 1;
        x.fiyat += i.fiyat;
      } else icecekMap.set(i.ad, { ad: i.ad, adet: 1, fiyat: i.fiyat });
    }
  });
  return {
    siparisNo: siparisNoBul(liste),
    bloklar: bloklar.map((b) => ({ id: b.id, baslik: b.baslik, fiyat: kurus(b.fiyat), altEkmek: b.altEkmek, not: b.not, satirlar: [{ ad: b.ekmek, adet: 1 }, ...topla(b.ham)] })),
    ekstralar: ['buyuk', 'normal']
      .filter((boy) => serbest[boy].length)
      .map((boy) => ({ boy, baslik: `Ekstra (${boyAd(boy)})`, fiyat: kurus(serbestFiyat[boy]), satirlar: topla(serbest[boy]) })),
    icecekler: [...icecekMap.values()].map((x) => ({ ...x, fiyat: kurus(x.fiyat) })),
    digerleri,
    onlineVar: liste.some((i) => i.online),
  };
}

// Platformun hesabımıza yatıracağı tutar: online kalemlerin müşteri tutarı × (1 − toplam komisyon).
export function onlineOzet(items) {
  const online = (items || []).filter((i) => i.online && !i.note);
  const musteri = kurus(online.reduce((t, i) => t + (Number(i.fiyat) || 0), 0));
  const net = kurus(online.reduce((t, i) => t + (Number(i.fiyat) || 0) * (Number(i.online.netOran) || 1), 0));
  return { adet: online.length, musteri, net };
}

// Cari hareketine / satış günlüğüne yazılacak kalem fiyatı (online kalemde yatacak tutar payı).
export const netFiyat = (i) => (i.online ? kurus((Number(i.fiyat) || 0) * (Number(i.online.netOran) || 1)) : i.fiyat);

export const adetYaz = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n) || 0);
