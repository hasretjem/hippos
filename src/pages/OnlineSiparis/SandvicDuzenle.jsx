import { useMemo, useState } from 'react';
import { Copy, Plus, X } from 'lucide-react';
import { ModalKabuk, TL, sayi } from '../Muhasebe2/m2Ortak';
import { boyHesap, yuzde } from './olHesap';
import { bosBoy, boyNormalle, sandvicKaydet } from './olVeri';
import FiyatSec from './FiyatSec';
import UrunEtiketleri from './UrunEtiketleri';
import MalzemeSec from './MalzemeSec';

const gramFmt = (g) => `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(g)} g`;

function Sonuc({ etiket, deger, ton, kucuk }) {
  return (
    <div className={`ol-sonuc ${ton || ''}`}>
      <span>{etiket}</span>
      <b>{deger}</b>
      {kucuk && <small>{kucuk}</small>}
    </div>
  );
}

function BoyPaneli({ baslik, boy, setBoy, veri, hesap, onFiyatSec, kopyala, kategoriMap }) {
  const { malzemeler, p } = veri;
  const satirGuncelle = (i, alan, deger) => setBoy({ ...boy, kalemler: boy.kalemler.map((k, j) => (j === i ? { ...k, [alan]: deger } : k)) });
  const [odakSatir, setOdakSatir] = useState(-1); // yeni eklenen satırın malzeme kutusuna imleç gelsin
  const satirEkle = () => {
    setOdakSatir(boy.kalemler.length);
    setBoy({ ...boy, kalemler: [...boy.kalemler, { malzeme_id: '', adet: '1' }] });
  };
  const satirSil = (i) => setBoy({ ...boy, kalemler: boy.kalemler.filter((_, j) => j !== i) });
  const h = hesap;
  const urunSayisi = h.dukkanUrunler.length;
  const dukkanEtiket = urunSayisi ? `${urunSayisi} ürün (satış ekranı, canlı fiyat)` : h.dukkan ? 'elle girilen' : '';

  return (
    <div className="ol-boy m2-card">
      <div className="ol-boy-baslik">
        <h4>{baslik}</h4>
        {kopyala && (
          <button className="m2-btn sec mini" onClick={kopyala} title="Normal boydaki malzemeleri buraya kopyala">
            <Copy size={14} /> Normalden kopyala
          </button>
        )}
      </div>

      <table className="m2-table ol-kalem-tablo">
        <thead>
          <tr>
            <th>Malzeme</th>
            <th>Adet</th>
            <th>Gram</th>
            <th>Maliyet</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {boy.kalemler.length === 0 && (
            <tr>
              <td colSpan={5} className="ol-bos">Henüz malzeme yok</td>
            </tr>
          )}
          {boy.kalemler.map((k, i) => {
            const s = h.satirlar[i];
            return (
              <tr key={i}>
                <td>
                  <MalzemeSec malzemeler={malzemeler} deger={k.malzeme_id} onSec={(id) => satirGuncelle(i, 'malzeme_id', id)} onYeniSatir={satirEkle} otoOdak={i === odakSatir} />
                </td>
                <td>
                  <input className="m2-input ol-adet" inputMode="decimal" value={k.adet} onChange={(e) => satirGuncelle(i, 'adet', e.target.value)} />
                </td>
                <td className="ol-sag">{s && s.malzeme && s.malzeme.birim_gram !== null ? gramFmt(s.gram) : '—'}</td>
                <td className="ol-sag">{s && s.malzeme ? TL(s.maliyet) : '—'}</td>
                <td>
                  <button className="rc-ikon-btn" onClick={() => satirSil(i)} aria-label="Satırı sil">
                    <X size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="m2-btn sec mini" onClick={satirEkle}>
        <Plus size={14} /> Malzeme ekle
      </button>

      <div className="ol-toplam">
        <div><span>Toplam gram</span><b>{gramFmt(h.gram)}</b></div>
        <div><span>Malzeme maliyeti</span><b>{TL(h.malzemeMaliyet)}</b></div>
        {h.ambalaj > 0 && <div><span>Ambalaj</span><b>{TL(h.ambalaj)}</b></div>}
        <div className="buyuk"><span>Toplam maliyet</span><b>{TL(h.toplamMaliyet)}</b></div>
      </div>
      {h.kontrolVar && <p className="ol-uyari">* işaretli malzemelerin fiyatı/gramı henüz kesin değil; maliyet tahminidir.</p>}
      {h.eksikVar && <p className="ol-uyari">Silinmiş bir malzeme var, satırı düzelt.</p>}

      <div className="ol-fiyat-alani">
        <label className="ol-alan">
          <span className="rc-etiket">Dükkân satış fiyatı (KDV dahil)</span>
          <button type="button" className="ol-fiyat-dugme" onClick={onFiyatSec}>
            {h.dukkan ? TL(h.dukkan) : 'Seç / yaz…'}
          </button>
          {dukkanEtiket && <small className="ol-sonuk">{dukkanEtiket}</small>}
        </label>
        <label className="ol-alan">
          <span className="rc-etiket">Platform fiyatı (elle)</span>
          <input
            className="m2-input"
            inputMode="decimal"
            placeholder={h.onerilen ? `önerilen: ${TL(h.onerilen)}` : 'önce dükkân fiyatı seç'}
            value={boy.platform_fiyat}
            onChange={(e) => setBoy({ ...boy, platform_fiyat: e.target.value })}
          />
          <small className="ol-sonuk">boşsa önerilen fiyat; yazarsan sabit kalır</small>
          {h.carpanli && (
            <small className="ol-indirimli">%{String(Math.round(Number(p.indirim) * 1000) / 10).replace('.', ',')} indirimli: <b>{TL(h.carpanli.indirimli)}</b></small>
          )}
        </label>
        <label className="ol-alan">
          <span className="rc-etiket">Çarpan</span>
          <input className="m2-input" inputMode="decimal" placeholder={String(p.carpan).replace('.', ',')} value={boy.carpan} onChange={(e) => setBoy({ ...boy, carpan: e.target.value })} />
          <small className="ol-sonuk">boşsa genel çarpan</small>
        </label>
        <label className="ol-alan">
          <span className="rc-etiket">Hedef net kâr (TL)</span>
          <input className="m2-input" inputMode="decimal" placeholder={h.dukkanKar !== null ? `dükkân: ${TL(h.dukkanKar)}` : 'isteğe bağlı'} value={boy.hedef_kar} onChange={(e) => setBoy({ ...boy, hedef_kar: e.target.value })} />
          <small className="ol-sonuk">boşsa dükkândaki kâr</small>
        </label>
      </div>

      {urunSayisi > 0 && <UrunEtiketleri urunler={h.dukkanUrunler} kategoriMap={kategoriMap} />}
      {h.urunEksik && <p className="ol-uyari">Satış ekranından silinmiş bir ürün var, fiyat seçimini yenile.</p>}

      {h.carpanli ? (
        <div className="ol-sonuclar">
          <Sonuc
            etiket="Platform fiyatı"
            deger={TL(h.carpanli.fiyat)}
            ton="ana"
            kucuk={h.carpanli.manuel ? `elle girildi · önerilen ${h.onerilen ? TL(h.onerilen) : '—'}` : `dükkân ${TL(h.dukkan)} × ${String(h.carpan).replace('.', ',')}`}
          />
          <Sonuc etiket={`%${String(Math.round(Number(p.indirim) * 1000) / 10).replace('.', ',')} indirimli müşteri fiyatı`} deger={TL(h.carpanli.indirimli)} />
          <Sonuc etiket="Bize kalan net" deger={TL(h.carpanli.net)} kucuk="KDV ve komisyon sonrası" />
          <Sonuc etiket="Platformda net kâr" deger={TL(h.carpanli.netKar)} ton={h.carpanli.netKar >= 0 ? 'iyi' : 'kotu'} />
          <Sonuc etiket="Kâr oranı (maliyete göre)" deger={yuzde(h.carpanli.karOrani)} kucuk="net kâr ÷ maliyet" />
          <Sonuc etiket="Marj (satış fiyatına göre)" deger={yuzde(h.carpanli.marj)} kucuk="net kâr ÷ müşterinin ödediği (KDV hariç)" />
          <Sonuc etiket="Dükkânda net kâr" deger={TL(h.dukkanKar)} kucuk={`oran ${yuzde(h.dukkanKarOrani)} · marj ${yuzde(h.dukkanMarj)}`} />
        </div>
      ) : (
        <p className="ol-bos">Platform fiyatını görmek için dükkân satış fiyatını seç.</p>
      )}

      {h.hedefli && (
        <div className="ol-hedef">
          <b>{h.hedefKarGirildi ? 'Hedef kâr' : 'Dükkânla aynı kâr'} için platform fiyatı: {TL(h.hedefli.fiyat)}</b>
          <span>
            net kâr {TL(h.hedefli.netKar)} · oran {yuzde(h.hedefli.karOrani)} · marj {yuzde(h.hedefli.marj)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function SandvicDuzenle({ sandvic, veri, urunler, altKategoriler, urunMap, kategoriMap, onKapat, onKaydedildi }) {
  const [ad, setAd] = useState(sandvic?.ad || '');
  const [normal, setNormal] = useState(() => (sandvic ? boyNormalle(sandvic.normal) : bosBoy()));
  const [buyuk, setBuyuk] = useState(() => (sandvic ? boyNormalle(sandvic.buyuk) : bosBoy()));
  const [secim, setSecim] = useState(null); // 'normal' | 'buyuk'
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  const malzMap = useMemo(() => new Map(veri.malzemeler.map((m) => [m.id, m])), [veri.malzemeler]);
  const hN = useMemo(() => boyHesap(normal, malzMap, veri.p, veri.p.ambalaj_normal, urunMap), [normal, malzMap, veri.p, urunMap]);
  const hB = useMemo(() => boyHesap(buyuk, malzMap, veri.p, veri.p.ambalaj_buyuk, urunMap), [buyuk, malzMap, veri.p, urunMap]);

  function fiyatTamam({ idler, elle }) {
    const guncelle = (b) => ({ ...b, dukkan_urunler: idler, dukkan_fiyat: elle });
    if (secim === 'normal') setNormal(guncelle);
    else setBuyuk(guncelle);
    setSecim(null);
  }

  async function kaydet() {
    if (!ad.trim()) {
      setHata('Sandviç adı yaz.');
      return;
    }
    const bosMu = (b) => b.kalemler.filter((k) => k.malzeme_id).length === 0;
    if (bosMu(normal) && bosMu(buyuk)) {
      setHata('En az bir boyda malzeme ekle.');
      return;
    }
    if ([...normal.kalemler, ...buyuk.kalemler].some((k) => !k.malzeme_id || sayi(k.adet) <= 0)) {
      setHata('Malzeme seçilmemiş ya da adedi 0 olan satır var.');
      return;
    }
    setBekliyor(true);
    setHata('');
    try {
      await sandvicKaydet({ id: sandvic?.id, sira: sandvic?.sira, ad, normal, buyuk });
      onKaydedildi();
    } catch (e) {
      setHata(e.message);
      setBekliyor(false);
    }
  }

  return (
    <>
    <ModalKabuk baslik={sandvic ? 'Sandviçi düzenle' : 'Yeni sandviç'} onKapat={onKapat} genis ekSinif="ol-modal">
      <label className="ol-ad-alan">
        <span className="rc-etiket">Sandviç adı</span>
        <input className="m2-input" placeholder="Örn. Sandviç 6" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus={!sandvic} />
      </label>

      <div className="ol-boylar">
        <BoyPaneli baslik="Normal boy" boy={normal} setBoy={setNormal} veri={veri} hesap={hN} onFiyatSec={() => setSecim('normal')} kategoriMap={kategoriMap} />
        <BoyPaneli
          baslik="Büyük boy"
          boy={buyuk}
          setBoy={setBuyuk}
          veri={veri}
          hesap={hB}
          onFiyatSec={() => setSecim('buyuk')}
          kategoriMap={kategoriMap}
          kopyala={() => setBuyuk({ ...buyuk, kalemler: normal.kalemler.map((k) => ({ ...k })) })}
        />
      </div>

      {hata && <div className="m2-info r">{hata}</div>}
      <div className="m2-modal-actions">
        <button className="m2-btn sec" onClick={onKapat}>
          Vazgeç
        </button>
        <button className="m2-btn" disabled={bekliyor} onClick={kaydet}>
          {bekliyor ? '…' : 'Kaydet'}
        </button>
      </div>
    </ModalKabuk>
    {secim && (
      <FiyatSec
        urunler={urunler}
        altKategoriler={altKategoriler}
        urunMap={urunMap}
        kategoriMap={kategoriMap}
        baslik={`Dükkân satış fiyatı seç · ${secim === 'normal' ? 'Normal boy' : 'Büyük boy'}`}
        ilkIdler={(secim === 'normal' ? normal : buyuk).dukkan_urunler}
        ilkElle={(secim === 'normal' ? normal : buyuk).dukkan_fiyat}
        onTamam={fiyatTamam}
        onKapat={() => setSecim(null)}
      />
    )}
    </>
  );
}
