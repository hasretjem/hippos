import { adetYaz, fisYapisi } from './olSatis';

const TLf = (n) => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)} ₺`;

// Online sipariş içeren adisyonun mutfak fişi gövdesi: her sandviç için alternatif ekmek işareti, büyük müşteri notu
// ve tek liste (ekmek → sürülebilirler → diğer malzemeler). Ekstralar, içecekler ve diğer kalemler altta.
export default function OnlineFis({ items }) {
  const f = fisYapisi(items);
  return (
    <div className="print-items ofis">
      {f.bloklar.map((b) => (
        <div className="ofis-blok" key={b.id}>
          <div className="ofis-baslik">
            <span>{b.baslik}</span>
            <span>{TLf(b.fiyat)}</span>
          </div>
          <div className="ofis-alt">
            ALTERNATİF EKMEK: <b className="ofis-isaret">{b.altEkmek ? '✓' : '✗'}</b>
          </div>
          {b.not && (
            <div className="ofis-not">
              <small>MÜŞTERİ NOTU</small>
              {b.not}
            </div>
          )}
          <div className="ofis-liste">
            {b.satirlar.map((s, i) => (
              <div key={i}>{adetYaz(s.adet)}x {s.ad}</div>
            ))}
          </div>
        </div>
      ))}
      {f.ekstralar.map((e) => (
        <div className="ofis-blok" key={e.boy}>
          <div className="ofis-baslik">
            <span>{e.baslik}</span>
            <span>{TLf(e.fiyat)}</span>
          </div>
          <div className="ofis-liste">
            {e.satirlar.map((s, i) => (
              <div key={i}>{adetYaz(s.adet)}x {s.ad}</div>
            ))}
          </div>
        </div>
      ))}
      {f.icecekler.length > 0 && (
        <div className="ofis-blok">
          <div className="ofis-baslik"><span>İçecekler</span></div>
          <div className="ofis-liste">
            {f.icecekler.map((x) => (
              <div className="ofis-satir" key={x.ad}>
                <span>{x.adet}x {x.ad}</span>
                <span>{TLf(x.fiyat)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {f.digerleri.map((item) => (
        <div key={item.id} className={`print-row${item.note ? ' note-row' : ''}`}>
          <span>
            {item.bicakGerekli && <span className="print-bicak-mark">🔪</span>}
            {item.ekmekGerekli && <span className="print-ekmek-mark">🥖</span>}
            {item.note ? `"${item.ad}"` : item.ad}
          </span>
          <span>{item.note ? '' : TLf(item.fiyat)}</span>
        </div>
      ))}
    </div>
  );
}
