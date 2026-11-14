import { trNorm } from '../Muhasebe2/m2Ortak';
import { resolveButtonStyle } from '../../constants/themeDefaults';

// Etiket renkleri: satış ekranındaki buton rengi arka plan olur, yazı rengi kontrasta göre otomatik seçilir.
const KOYU = '#1b1b1b';
const ACIK = '#ffffff';

function rgbCoz(renk) {
  if (!renk || typeof renk !== 'string') return null;
  const r = renk.trim();
  let m = r.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
  m = r.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = r.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}
function parlaklik([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const oran = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export function yaziRengi(arkaPlan, yedek) {
  const rgb = rgbCoz(arkaPlan);
  if (!rgb) return yedek || KOYU;
  const L = parlaklik(rgb);
  const koyuOran = oran(L, parlaklik(rgbCoz(KOYU)));
  const acikOran = oran(L, parlaklik(rgbCoz(ACIK)));
  return koyuOran >= acikOran ? KOYU : ACIK;
}


const gorunenAd = (u) => (u?.satisAdi && u.satisAdi.trim() !== '' ? u.satisAdi : u?.ad);
// Ada en yakın satış ekranı ürününü bulur (örn. "Tavuk salam" → "Salam"); rengi oradan alınır. Bulunamazsa null.
export function renkBul(ad, urunler, kategoriMap) {
  const a = trNorm(ad);
  let en = null;
  let enUzunluk = 0;
  urunler.forEach((u) => {
    const p = trNorm(gorunenAd(u));
    if (p && (a.includes(p) || p.includes(a)) && p.length > enUzunluk) {
      en = u;
      enUzunluk = p.length;
    }
  });
  if (!en) return null;
  return resolveButtonStyle(en, kategoriMap.get(en.kategori) || null).backgroundColor;
}
