import { useMemo } from 'react';
import { trNorm } from '../Muhasebe2/m2Ortak';
import { resolveButtonStyle } from '../../constants/themeDefaults';
import { getDisplayName } from '../../components/ProductButton';
import { yaziRengi } from './olRenk';

const adetFmt = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n) || 0);

// Hammadde adına en yakın satış ekranı ürününü bulur (örn. "Tavuk salam" → "Salam"); rengi oradan alınır.
function renkBul(malzemeAd, urunler, kategoriMap) {
  const a = trNorm(malzemeAd);
  let en = null;
  let enUzunluk = 0;
  urunler.forEach((u) => {
    const p = trNorm(getDisplayName(u));
    if (p && (a.includes(p) || p.includes(a)) && p.length > enUzunluk) {
      en = u;
      enUzunluk = p.length;
    }
  });
  if (!en) return null;
  return resolveButtonStyle(en, kategoriMap.get(en.kategori) || null).backgroundColor;
}

// Sandviç kartı: girilen hammaddeler (ad + adet), satış ekranındaki ürün renkleriyle.
export default function HammaddeEtiketleri({ satirlar, urunler, kategoriMap }) {
  const kalemler = useMemo(
    () =>
      satirlar
        .filter((s) => s.malzeme)
        .map((s) => ({ ad: s.malzeme.ad, adet: s.adet, renk: renkBul(s.malzeme.ad, urunler, kategoriMap) })),
    [satirlar, urunler, kategoriMap]
  );
  return (
    <div className="ol-etiketler">
      {kalemler.map((k, i) => {
        const bg = k.renk || '#e5e7eb';
        return (
          <div className="ol-etiket" key={i} style={{ background: bg, color: yaziRengi(bg) }}>
            <span>{k.ad}</span>
            <b>×{adetFmt(k.adet)}</b>
          </div>
        );
      })}
    </div>
  );
}
