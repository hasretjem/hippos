// Alacak/Borç Raporu için saf hesaplar (ekrana dokunmaz).
// bakiye = borç − alacak: eksi → bizim borcumuz (ödeyeceğimiz), artı → bizim alacağımız (tahsil edeceğimiz).

const KURUS = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kurus = (n) => {
  const r = Math.round((Number(n) || 0) * 100) / 100;
  return KURUS.format(r === 0 ? 0 : r).replace(/^-/, '−');
};

export const TUR_SIRA = ['Firma', 'Personel', 'Yemek Kartı', 'Sabit Gider', 'Kasa', 'Banka', 'Kredi Kartı', 'Ortaklar', 'Kasa / Banka'];

const sira = (t) => { const i = TUR_SIRA.indexOf(t); return i < 0 ? 99 : i; };

export function trNorm(s) {
  return String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function tarihKisa(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export function saatYaz(zaman) {
  const d = zaman ? new Date(zaman) : new Date();
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// gizliTurler: Set — kapatılan türler. Dönüş: iki liste (büyükten küçüğe), toplamlar ve tür bazlı alt toplamlar.
export function raporHesapla(satirlar, gizliTurler) {
  const acik = (satirlar || []).filter((r) => !gizliTurler.has(r.tur));
  const borclar = acik.filter((r) => r.bakiye < 0).map((r) => ({ ...r, tutar: -r.bakiye })).sort((a, b) => b.tutar - a.tutar);
  const alacaklar = acik.filter((r) => r.bakiye > 0).map((r) => ({ ...r, tutar: r.bakiye })).sort((a, b) => b.tutar - a.tutar);
  const topla = (l) => Math.round(l.reduce((s, r) => s + r.tutar, 0) * 100) / 100;
  const turToplam = (l) => {
    const m = new Map();
    l.forEach((r) => m.set(r.tur, (m.get(r.tur) || 0) + r.tutar));
    return [...m.entries()]
      .map(([tur, tutar]) => ({ tur, tutar: Math.round(tutar * 100) / 100 }))
      .sort((a, b) => sira(a.tur) - sira(b.tur));
  };
  const borcToplam = topla(borclar);
  const alacakToplam = topla(alacaklar);
  return {
    borclar,
    alacaklar,
    borcToplam,
    alacakToplam,
    fark: Math.round((alacakToplam - borcToplam) * 100) / 100, // artı: net alacaklıyız, eksi: net borçluyuz
    borcTurler: turToplam(borclar),
    alacakTurler: turToplam(alacaklar),
  };
}

export function farkEtiketi(fark) {
  if (Math.abs(fark) < 0.005) return 'DENGEDE';
  return fark < 0 ? 'NET BORÇLUYUZ' : 'NET ALACAKLIYIZ';
}
