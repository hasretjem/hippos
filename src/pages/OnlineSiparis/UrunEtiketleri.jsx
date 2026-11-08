import { TL } from '../Muhasebe2/m2Ortak';
import { resolveButtonStyle } from '../../constants/themeDefaults';
import { getDisplayName } from '../../components/ProductButton';
import { yaziRengi } from './olRenk';

// Seçilen dükkân ürünleri: satış ekranındaki buton renginde, kontrasta göre yazı rengiyle, sırayla bir satır bir etiket.
export default function UrunEtiketleri({ urunler, kategoriMap, fiyatGoster = true, adetler = null }) {
  return (
    <div className="ol-etiketler">
      {urunler.map((u, i) => {
        if (!u) {
          return (
            <div className="ol-etiket" key={i} style={{ background: '#e5e7eb', color: '#1b1b1b' }}>
              <span>Silinmiş ürün</span>
            </div>
          );
        }
        const st = resolveButtonStyle(u, kategoriMap.get(u.kategori) || null);
        return (
          <div className="ol-etiket" key={i} style={{ background: st.backgroundColor, color: yaziRengi(st.backgroundColor, st.textColor) }}>
            <span>{getDisplayName(u)}</span>
            {fiyatGoster && <b>{TL(u.fiyat)}</b>}
            {adetler && adetler[i] ? <b className="ol-etiket-adet">×{adetler[i]}</b> : null}
          </div>
        );
      })}
    </div>
  );
}
