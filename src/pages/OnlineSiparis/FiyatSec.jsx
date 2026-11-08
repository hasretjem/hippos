import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ModalKabuk, TL, trNorm } from '../Muhasebe2/m2Ortak';
import ProductButton, { getDisplayName } from '../../components/ProductButton';

// Dükkân satış fiyatı seçimi: satış ekranındaki SOĞUK SANDVİÇ butonları (BÜYÜK solda, KÜÇÜK sağda).
// Birden çok ürün seçilir (aynı ürün tekrar eklenebilir, her biri ayrı satır); toplamları dükkân fiyatı olur.
export default function FiyatSec({ urunler, urunMap, kategoriMap, baslik, ilkIdler, ilkElle, onTamam, onKapat }) {
  const [ara, setAra] = useState('');
  const [secilen, setSecilen] = useState(() => (ilkIdler || []).map((id, i) => ({ anahtar: `${id}-${i}`, id })));
  const [elle, setElle] = useState(ilkElle || '');
  const [sayac, setSayac] = useState(1000);

  const sutunlar = useMemo(() => {
    const q = trNorm(ara);
    const uygun = urunler.filter((u) => !q || trNorm(`${u.ad} ${u.satisAdi || ''} ${u.altKategori}`).includes(q));
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

  const adetler = useMemo(() => {
    const m = new Map();
    secilen.forEach((s) => m.set(s.id, (m.get(s.id) || 0) + 1));
    return m;
  }, [secilen]);

  const ekle = (u) => {
    setSayac((n) => n + 1);
    setSecilen((l) => [...l, { anahtar: `y${sayac}`, id: u.id }]);
  };
  const cikar = (anahtar) => setSecilen((l) => l.filter((s) => s.anahtar !== anahtar));

  const toplam = secilen.reduce((t, s) => t + (Number(urunMap.get(s.id)?.fiyat) || 0), 0);

  function sutun(b, liste) {
    return (
      <div className="ol-fs-sutun" key={b}>
        <h4>{b}</h4>
        {liste.length === 0 ? (
          <p className="ol-bos">Ürün yok</p>
        ) : (
          <div className="ol-fs-karolar">
            {liste.map((u) => (
              <div className="ol-fs-karo" key={u.id}>
                <ProductButton product={u} category={kategoriMap.get(u.kategori) || null} isFav={false} onAdd={ekle} />
                {adetler.get(u.id) ? <span className="ol-fs-rozet">×{adetler.get(u.id)}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function tamam() {
    onTamam({ idler: secilen.map((s) => s.id), elle: secilen.length ? '' : elle });
  }

  return (
    <ModalKabuk baslik={baslik || 'Dükkân satış fiyatı seç'} onKapat={onKapat} genis ekSinif="ol-fs-modal">
      <div className="ol-fs-ust">
        <div className="rc-ara">
          <Search size={16} />
          <input className="m2-input" placeholder="Sandviç ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
        </div>
        <p className="m2-hint">Ürünlere dokundukça sağdaki listeye eklenir; aynı ürünü birden çok kez seçebilirsin. Toplamları dükkân fiyatı olur.</p>
      </div>

      <div className="ol-fs-ana">
        <div className="ol-fs-izgara">
          {sutun('BÜYÜK SANDVİÇ', sutunlar.buyuk)}
          {sutun('KÜÇÜK SANDVİÇ', sutunlar.kucuk)}
        </div>

        <aside className="ol-fs-yan">
          <h4>Seçilenler ({secilen.length})</h4>
          <div className="ol-fs-secilenler">
            {secilen.length === 0 && <p className="ol-bos">Henüz ürün seçilmedi</p>}
            {secilen.map((s, i) => {
              const u = urunMap.get(s.id);
              return (
                <div className="ol-fs-satir" key={s.anahtar}>
                  <span className="ol-fs-sira">{i + 1}</span>
                  <span className="ol-fs-ad">{u ? getDisplayName(u) : 'Silinmiş ürün'}</span>
                  <b>{u ? TL(u.fiyat) : '—'}</b>
                  <button className="rc-ikon-btn" onClick={() => cikar(s.anahtar)} aria-label="Çıkar">
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="ol-fs-toplam">
            <span>Dükkân fiyatı</span>
            <b>{TL(toplam)}</b>
          </div>
          <div className="ol-fs-elle">
            <input
              className="m2-input"
              inputMode="decimal"
              placeholder="veya elle fiyat yaz"
              value={secilen.length ? '' : elle}
              disabled={secilen.length > 0}
              onChange={(e) => setElle(e.target.value)}
            />
          </div>
          <div className="ol-fs-islem">
            {secilen.length > 0 && (
              <button className="m2-btn sec" onClick={() => setSecilen([])}>
                Hepsini temizle
              </button>
            )}
            <button className="m2-btn" onClick={tamam}>
              Tamam
            </button>
          </div>
        </aside>
      </div>
    </ModalKabuk>
  );
}
