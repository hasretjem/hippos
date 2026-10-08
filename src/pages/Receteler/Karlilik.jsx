import { useEffect, useState } from 'react';
import { fmt, rcApi, TL } from './rcOrtak';

export default function Karlilik({ bildir }) {
  const [gun, setGun] = useState(30);
  const [liste, setListe] = useState(null);
  useEffect(() => {
    setListe(null);
    rcApi('karlilik', { query: { gun } })
      .then((j) => setListe(j.liste))
      .catch((e) => bildir(e.message, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gun]);

  const tablo = (baslik, satirlar) => (
    <div className="rc-kar-blok">
      <h4>{baslik}</h4>
      <table className="m2-table rc-kar-tablo">
        <thead>
          <tr>
            <th>Ürün</th>
            <th className="sayi">Adet</th>
            <th className="sayi">Birim kâr</th>
            <th className="sayi">Kâr %</th>
            <th className="sayi">Toplam kâr</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((u) => (
            <tr key={u.id}>
              <td>{u.ad}</td>
              <td className="sayi">{u.adet}</td>
              <td className="sayi">{TL(u.birimKar)}</td>
              <td className="sayi">%{fmt(u.karYuzde, 1)}</td>
              <td className={`sayi ${u.toplamKar >= 0 ? 'rc-iyi' : 'rc-kotu'}`}><b>{TL(u.toplamKar)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="m2-card rc-kart">
      <div className="rc-arac">
        <span className="rc-etiket">Dönem</span>
        {[30, 90, 365].map((g) => (
          <button key={g} className={`m2-chip ${gun === g ? 'on' : ''}`} onClick={() => setGun(g)}>
            Son {g === 365 ? '1 yıl' : `${g} gün`}
          </button>
        ))}
      </div>
      {liste === null && <p className="m2-empty">Yükleniyor…</p>}
      {liste && liste.length === 0 && <p className="m2-empty">Bu dönemde, reçetesi tamam olan ürünlerden satış yok. Reçeteleri girdikçe burada kârlılık görünür.</p>}
      {liste && liste.length > 0 && (
        <div className="rc-kar-izgara">
          {tablo('En kârlı ürünler (adet × birim kâr)', liste.slice(0, 10))}
          {liste.length > 10 && tablo('En az kâr bırakanlar', [...liste].reverse().slice(0, 10))}
        </div>
      )}
      <p className="m2-hint">Yalnızca reçetesi eksiksiz olan ürünler hesaplanır. Kâr, bugünkü malzeme fiyatlarıyla bulunur (geçmiş satışların o günkü maliyeti ayrıca satış anında kaydedilir).</p>
    </div>
  );
}
