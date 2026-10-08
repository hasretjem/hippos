// Gün sonu paylaşım görseli (takvim yaprağı) için veri hazırlığı. Ekrana/DOM'a dokunmaz, test edilebilir.
// Kurallar: sıfır olan satır görsele girmez, satırlar tutara göre büyükten küçüğe dizilir,
// yemek kartında yalnızca o gün dolu olan kolonlar (sipariş hattı, kişi adları...) gösterilir.

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TAM = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const KURUS = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sayi = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))) || 0;
const eksiIsareti = (s) => s.replace(/^-/, '−');

// 8225.01 -> "8.225", -2000 -> "−2.000" (satırlarda kuruş yok, rakam kısa ve iri kalsın)
export function tam(v) {
  const r = Math.round(sayi(v));
  return eksiIsareti(TAM.format(r === 0 ? 0 : r));
}
// Toplam ciro kuruşlu: 64810.11 -> "64.810,11"
export function kurus(v) {
  const r = Math.round(sayi(v) * 100) / 100;
  return eksiIsareti(KURUS.format(r === 0 ? 0 : r));
}
export const buyukHarf = (s) => String(s || '').toLocaleUpperCase('tr-TR');

// "02.02.2026" (tr-TR) -> { gun: '02', ay: 'Şubat', yil: 2026, iso: '2026-02-02' }
export function tarihParcalari(trTarih) {
  const [g, a, y] = String(trTarih || '').split('.').map((x) => parseInt(x, 10));
  const iki = (n) => String(n || 0).padStart(2, '0');
  return { gun: iki(g), ay: AYLAR[(a || 1) - 1] || '', yil: y || '', iso: `${y}-${iki(a)}-${iki(g)}` };
}

const TAHSILAT_ADI = { NAKIT: 'nakit', KART: 'kart', KREDI_KARTI: 'kart', 'KREDİ KARTI': 'kart', YEMEK: 'yemek kartı', YEMEK_KARTI: 'yemek kartı' };
const buyuktenKucuge = (a, b) => b.tutar - a.tutar;
const dolu = (r) => Math.abs(sayi(r.tutar)) >= 0.005;

export function paylasimVerisi(g) {
  const tarih = tarihParcalari(g.tarih);

  const nakitSatir = [...(g.denoms || [])].sort((a, b) => b - a)
    .map((d) => ({ d, adet: parseInt((g.nakitAdet || {})[d], 10) || 0 }))
    .filter((x) => x.adet > 0)
    .map((x) => ({ ad: `${x.d} × ${x.adet}`, tutar: x.d * x.adet }));
  if (sayi(g.kasaAvansi) !== 0) nakitSatir.push({ ad: 'Kasa avansı', tutar: sayi(g.kasaAvansi) });

  const kartSatir = (g.posTutarlari || []).map((r) => ({ ad: r.label || 'POS', tutar: sayi(r.tutar) })).filter(dolu);

  const kolonlarTum = g.yemekKolonlari || [];
  const markalar = g.yemekKartlari || [];
  const deger = (m, k) => sayi(((g.yemekTutarlari || {})[m] || {})[k]);
  const yemekKolon = kolonlarTum.filter((k) => markalar.some((m) => deger(m, k) !== 0));
  const yemekSatir = markalar
    .map((m) => ({ ad: m, parcalar: yemekKolon.map((k) => deger(m, k)), tutar: kolonlarTum.reduce((s, k) => s + deger(m, k), 0) }))
    .filter(dolu).sort(buyuktenKucuge);

  const cariSatir = (g.cariler || []).map((c) => ({ ad: c.ad || 'Cari', tutar: sayi(c.tutar) })).filter(dolu).sort(buyuktenKucuge);
  const tahsilatSatir = Object.entries(g.tahsilatlar || {})
    .filter(([, v]) => sayi(v) !== 0)
    .map(([tur, v]) => ({ ad: `Tahsilat (${TAHSILAT_ADI[tur] || String(tur).toLocaleLowerCase('tr-TR')})`, tutar: -sayi(v) }));
  const cariHepsi = [...cariSatir, ...tahsilatSatir];
  // Uzun isim varsa tek sütun: isimler tek satırda kalsın, görsel aşağı uzasın (genişlemesin)
  const cariTekSutun = cariHepsi.some((c) => c.ad.length > 24);

  const harcama = (liste) => (liste || []).map((s) => ({ ad: s.ad || 'Harcama', tutar: sayi(s.tutar) })).filter(dolu).sort(buyuktenKucuge);

  const anaKasaHarcama = sayi(g.anaKasaToplam);
  const anaKasaSatir = [
    { ad: 'Dünden devir', tutar: sayi(g.dundenDevir) },
    { ad: '+ Bugünkü nakit', tutar: sayi(g.toplamNakitPara) },
  ];
  if (anaKasaHarcama !== 0) anaKasaSatir.push({ ad: '− TL Kasa harcaması', tutar: -anaKasaHarcama });

  const ay = g.ay || {};
  const ayniGune = sayi(ay.gecenAyAyniGune);
  const yuzde = ayniGune > 0 ? Math.round((sayi(ay.buAy) / ayniGune - 1) * 100) : null;

  const ekmek = (g.ekmek || []).map((e) => ({ ad: String(e.ad || '').replace(/\s*Ekmeği$/i, ''), adet: parseInt(e.adet, 10) || 0 }));

  return {
    tarih,
    toplamCiro: sayi(g.toplamCiro),
    ay: { buAy: sayi(ay.buAy), gecenAy: sayi(ay.gecenAy), ayniGune, yuzde },
    nakit: { satirlar: nakitSatir, toplam: sayi(g.toplamNakitPara) },
    kart: { satirlar: kartSatir, toplam: kartSatir.reduce((s, r) => s + r.tutar, 0) },
    yemek: { kolonlar: yemekKolon, satirlar: yemekSatir, toplam: yemekSatir.reduce((s, r) => s + r.tutar, 0) },
    cari: { satirlar: cariHepsi, toplam: cariHepsi.reduce((s, r) => s + r.tutar, 0), tekSutun: cariTekSutun },
    harcama: {
      tlKasa: { satirlar: harcama(g.anaKasa), toplam: anaKasaHarcama },
      gunluk: { satirlar: harcama(g.gunlukKasa), toplam: sayi(g.gunlukKasaToplam) },
    },
    anaKasa: { satirlar: anaKasaSatir, yarinaDevir: sayi(g.yarinaDevir) },
    ekmek: { satirlar: ekmek, toplam: ekmek.reduce((s, e) => s + e.adet, 0) },
    kaydedildi: !!g.kaydedildi,
  };
}