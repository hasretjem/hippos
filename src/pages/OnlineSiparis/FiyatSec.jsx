import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ModalKabuk, TL, trNorm } from '../Muhasebe2/m2Ortak';

// Dükkân satış fiyatı hızlı seçimi: satış ekranındaki SOĞUK SANDVİÇ ürünleri (Küçük | BÜYÜK) — dokununca fiyat alınır.
export default function FiyatSec({ urunler, boy, onSec, onElle, onKapat }) {
  const [ara, setAra] = useState('');
  const [elle, setElle] = useState('');

  const sutunlar = useMemo(() => {
    const q = trNorm(ara);
    const uygun = urunler.filter((u) => !q || trNorm(`${u.ad} ${u.altKategori}`).includes(q));
    const kucuk = [];
    const buyuk = [];
    uygun.forEach((u) => {
      const alt = (u.altKategori || '').toLocaleLowerCase('tr-TR');
      if (alt.includes('büyük')) buyuk.push(u);
      else kucuk.push(u);
    });
    const sirala = (l) => l.sort((a, b) => (a.menuSirasi ?? 999) - (b.menuSirasi ?? 999) || a.ad.localeCompare(b.ad, 'tr'));
    return { kucuk: sirala(kucuk), buyuk: sirala(buyuk) };
  }, [urunler, ara]);

  function Sutun({ baslik, liste, vurgu }) {
    return (
      <div className={`ol-fs-sutun ${vurgu ? 'vurgu' : ''}`}>
        <h4>{baslik}</h4>
        <div className="ol-fs-liste">
          {liste.length === 0 && <p className="ol-bos">Ürün yok</p>}
          {liste.map((u) => (
            <button key={u.id} className="ol-fs-urun" onClick={() => onSec(u)}>
              <span>
                {u.ad}
                {u.altKategori && /menü/i.test(u.altKategori) ? <small> · {u.altKategori}</small> : null}
              </span>
              <b>{TL(u.fiyat)}</b>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ModalKabuk baslik="Dükkân satış fiyatı seç" onKapat={onKapat} genis ekSinif="ol-fs-modal">
      <p className="m2-hint">Satış ekranındaki soğuk sandviçlerden birine dokun, fiyatı otomatik alınır (satış ekranında fiyat değişirse burada da güncellenir).</p>
      <div className="ol-fs-ust">
        <div className="rc-ara">
          <Search size={16} />
          <input className="m2-input" placeholder="Sandviç ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
        </div>
        <div className="ol-fs-elle">
          <input className="m2-input" inputMode="decimal" placeholder="veya elle fiyat yaz" value={elle} onChange={(e) => setElle(e.target.value)} />
          <button className="m2-btn" disabled={!elle.trim()} onClick={() => onElle(elle)}>
            Uygula
          </button>
        </div>
      </div>
      <div className="ol-fs-izgara">
        <Sutun baslik="KÜÇÜK SANDVİÇ" liste={sutunlar.kucuk} vurgu={boy === 'normal'} />
        <Sutun baslik="BÜYÜK SANDVİÇ" liste={sutunlar.buyuk} vurgu={boy === 'buyuk'} />
      </div>
    </ModalKabuk>
  );
}
