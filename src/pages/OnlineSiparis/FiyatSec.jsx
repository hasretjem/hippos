import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ModalKabuk, TL, trNorm } from '../Muhasebe2/m2Ortak';
import ProductButton, { getDisplayName } from '../../components/ProductButton';
import { resolveButtonStyle } from '../../constants/themeDefaults';

// Dükkân satış fiyatı seçimi: satış ekranındaki SOĞUK SANDVİÇ butonları (BÜYÜK solda, KÜÇÜK sağda).
// Birden çok ürün seçilir (aynı ürün tekrar eklenebilir, her biri ayrı satır); toplamları dükkân fiyatı olur.
export default function FiyatSec({ urunler, altKategoriler, urunMap, kategoriMap, baslik, ilkIdler, ilkElle, onTamam, onKapat }) {
  const [ara, setAra] = useState('');
  const [secilen, setSecilen] = useState(() => (ilkIdler || []).map((id, i) => ({ anahtar: `${id}-${i}`, id })));
  const [elle, setElle] = useState(ilkElle || '');
  const [sayac, setSayac] = useState(1000);

  // Satış ekranıyla aynı sıralama ve gruplama: alt kategori sırası → menü sırası → ad; "Az X" ana ürününün hemen yanında.
  const sutunlar = useMemo(() => {
    const q = trNorm(ara);
    const subOrderMap = new Map((altKategoriler || []).map((s) => [`${s.kategori}|${s.name}`, s.menuSirasi]));
    const subOrder = (p) => subOrderMap.get(`${p.kategori}|${p.altKategori}`) ?? 50;
    const byId = new Map(urunler.map((p) => [p.id, p]));
    const efektif = (p) => {
      if (p.isAzVariant && p.parentId != null) {
        const parent = byId.get(p.parentId);
        if (parent) return { sirasi: parent.menuSirasi ?? 50, baseAd: parent.ad, isAz: 1 };
      }
      return { sirasi: p.menuSirasi ?? 50, baseAd: p.ad, isAz: 0 };
    };
    const uygun = urunler
      .filter((u) => !q || trNorm(`${u.ad} ${u.satisAdi || ''}`).includes(q))
      .sort((a, b) => {
        const oa = efektif(a);
        const ob = efektif(b);
        return subOrder(a) - subOrder(b) || oa.sirasi - ob.sirasi || oa.baseAd.localeCompare(ob.baseAd, 'tr') || oa.isAz - ob.isAz || a.ad.localeCompare(b.ad, 'tr');
      });
    const gruplar = {};
    uygun.forEach((p) => {
      const sub = p.altKategori || p.kategori || 'Genel';
      (gruplar[sub] = gruplar[sub] || []).push(p);
    });
    const yon = (y) => Object.entries(gruplar).filter(([sub]) => (sub || '').toLocaleLowerCase('tr-TR').includes(y));
    return { buyuk: yon('büyük'), kucuk: yon('küçük') };
  }, [urunler, altKategoriler, ara]);

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

  const rozet = (id, ek = '') => (adetler.get(id) ? <span className={`ol-fs-rozet ${ek}`}>×{adetler.get(id)}</span> : null);
  const kat = (u) => kategoriMap.get(u.kategori) || null;

  function sutun(b, yonAd, gruplar) {
    return (
      <div className="ol-fs-sutun" key={b}>
        <h4>{b}</h4>
        {gruplar.length === 0 && <p className="ol-bos">Ürün yok</p>}
        {gruplar.map(([sub, items]) => (
          <div key={sub} className="ol-fs-grup">
            {sub.toLocaleLowerCase('tr-TR') !== `${yonAd} sandviç` && <h5 className="ol-fs-altbaslik">{sub}</h5>}
            <div className="ol-fs-karolar">
              {items.map((u, idx) => {
                const sonraki = items[idx + 1];
                const oncekiAnaMi = u.isAzVariant && items[idx - 1] && u.parentId === items[idx - 1].id;
                if (oncekiAnaMi) return null;
                if (!u.isAzVariant && sonraki?.isAzVariant && sonraki.parentId === u.id) {
                  const pairColor = resolveButtonStyle(u, kat(u)).backgroundColor;
                  return (
                    <div className="ol-fs-karo" key={u.id}>
                      <div className="pb-pair-wrapper">
                        <ProductButton product={u} category={kat(u)} isFav={false} onAdd={ekle} pairPosition="main" />
                        <ProductButton product={sonraki} category={kat(sonraki)} isFav={false} onAdd={ekle} pairPosition="az" pairColor={pairColor} />
                      </div>
                      {rozet(u.id)}
                      {rozet(sonraki.id, 'az')}
                    </div>
                  );
                }
                return (
                  <div className="ol-fs-karo" key={u.id}>
                    <ProductButton product={u} category={kat(u)} isFav={false} onAdd={ekle} pairPosition={null} pairColor={null} />
                    {rozet(u.id)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
          {sutun('BÜYÜK SANDVİÇ', 'büyük', sutunlar.buyuk)}
          {sutun('KÜÇÜK SANDVİÇ', 'küçük', sutunlar.kucuk)}
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
