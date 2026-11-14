import { useMemo } from 'react';
import { renkBul, yaziRengi } from './olRenk';

const adetFmt = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n) || 0);

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
