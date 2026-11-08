import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import '../Muhasebe2/Muhasebe2.css';
import '../Receteler/Receteler.css';
import './OnlineSiparis.css';
import { TL } from '../Muhasebe2/m2Ortak';
import { boyHesap, yuzde } from './olHesap';
import { olYukle, sandvicKaydet, sandvicSil } from './olVeri';
import SandvicDuzenle from './SandvicDuzenle';
import UrunEtiketleri from './UrunEtiketleri';
import MalzemeSekmesi from './MalzemeSekmesi';
import ParametreSekmesi from './ParametreSekmesi';

const SEKMELER = [
  ['sandvicler', 'Sandviçler'],
  ['malzemeler', 'Malzemeler'],
  ['parametreler', 'Parametreler'],
];

const yuzdeEtiket = (n) => `%${String(Math.round(Number(n) * 1000) / 10).replace('.', ',')}`;
const adetFmt = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n) || 0);

function BoyOzet({ baslik, h, kategoriMap, indirim, onPlatformKaydet }) {
  const c = h.carpanli;
  const [duzenliyor, setDuzenliyor] = useState(false);
  const [metin, setMetin] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  const ac = () => {
    setMetin(c ? String(c.fiyat).replace('.', ',') : '');
    setDuzenliyor(true);
  };
  async function kaydet(deger) {
    setBekliyor(true);
    try {
      await onPlatformKaydet(deger);
      setDuzenliyor(false);
    } finally {
      setBekliyor(false);
    }
  }
  const onaylaMetin = () => {
    const n = Number(String(metin).replace(',', '.'));
    if (!metin.trim()) return kaydet(null);
    if (!(n > 0)) return undefined;
    return kaydet(n);
  };

  return (
    <div className="ol-ozet-boy">
      <h5>{baslik}</h5>
      {h.satirlar.length === 0 ? (
        <p className="ol-bos">Tanımlı değil</p>
      ) : (
        <>
          {h.dukkanUrunler.length > 0 ? (
            <UrunEtiketleri urunler={h.dukkanUrunler} kategoriMap={kategoriMap} fiyatGoster={false} />
          ) : (
            <p className="ol-bos ol-sol">{h.dukkan ? `Dükkân fiyatı elle girilmiş: ${TL(h.dukkan)}` : 'Dükkân ürünleri seçilmedi'}</p>
          )}
          <ul className="ol-hammadde">
            {h.satirlar.filter((x) => x.malzeme).map((x, i) => (
              <li key={i}>
                <b>{adetFmt(x.adet)}×</b> {x.malzeme.ad}{x.malzeme.birim_adi ? <small> ({x.malzeme.birim_adi})</small> : null}
              </li>
            ))}
          </ul>

          <div className="ol-platform">
            <span className="ol-platform-etiket">Platform satış fiyatı</span>
            {duzenliyor ? (
              <div className="ol-platform-duzen">
                <input
                  className="m2-input"
                  inputMode="decimal"
                  autoFocus
                  value={metin}
                  placeholder={h.onerilen ? String(h.onerilen) : ''}
                  onChange={(e) => setMetin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onaylaMetin();
                    if (e.key === 'Escape') setDuzenliyor(false);
                  }}
                />
                <button className="rc-ikon-btn" disabled={bekliyor} onClick={onaylaMetin} aria-label="Kaydet"><Check size={16} /></button>
                <button className="rc-ikon-btn" onClick={() => setDuzenliyor(false)} aria-label="Vazgeç"><X size={16} /></button>
              </div>
            ) : (
              <div className="ol-platform-deger">
                <b>{c ? TL(c.fiyat) : '—'}</b>
                {c && (
                  <button className="rc-ikon-btn" onClick={ac} aria-label="Platform fiyatını düzenle" title="Platform fiyatını düzenle">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
            {c && !duzenliyor && (
              <div className="ol-indirimli-satir">
                <span>{yuzdeEtiket(indirim)} indirimli</span>
                <b>{TL(c.indirimli)}</b>
              </div>
            )}
            {c && c.manuel && !duzenliyor && (
              <small className="ol-sonuk">
                elle · önerilen {c.onerilen ? TL(c.onerilen) : '—'}{' '}
                <button className="ol-link" disabled={bekliyor} onClick={() => kaydet(null)}>öneriye dön</button>
              </small>
            )}
          </div>

          <dl>
            <dt>Maliyet</dt>
            <dd>{TL(h.toplamMaliyet)}{h.kontrolVar ? ' *' : ''}</dd>
            <dt>Platformda net kâr</dt>
            <dd className={c ? (c.netKar >= 0 ? 'iyi' : 'kotu') : ''}>{c ? TL(c.netKar) : '—'}</dd>
            <dt>Kâr oranı</dt>
            <dd>{c ? yuzde(c.karOrani) : '—'}</dd>
            <dt>Marj</dt>
            <dd>{c ? yuzde(c.marj) : '—'}</dd>
          </dl>
        </>
      )}
    </div>
  );
}

// Ayarlar > Online Sipariş. Yemeksepeti gibi platformlar için sandviç maliyeti ve platform fiyatı hesabı (normal + büyük boy).
export default function OnlineSiparis({ data, onNavigate }) {
  const [sekme, setSekme] = useState('sandvicler');
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  const [duzenle, setDuzenle] = useState(null); // { sandvic? }
  const [toast, setToast] = useState(null);

  const bildir = useCallback((mesaj, hataMi = false) => {
    setToast({ mesaj, hataMi });
    setTimeout(() => setToast(null), hataMi ? 6000 : 3000);
  }, []);

  const yukle = useCallback(async () => {
    try {
      setVeri(await olYukle());
      setHata('');
    } catch (e) {
      setHata(e.message);
    }
  }, []);
  useEffect(() => {
    yukle();
  }, [yukle]);

  const urunMap = useMemo(() => new Map((data?.products || []).map((u) => [u.id, u])), [data?.products]);
  const urunler = useMemo(
    () => (data?.products || []).filter((u) => u.kategori === 'SOĞUK SANDVİÇ' && u.durum !== 'PASIF'),
    [data?.products]
  );
  const kategoriMap = useMemo(() => new Map((data?.categories || []).map((c) => [c.name, c])), [data?.categories]);
  const malzMap = useMemo(() => new Map((veri?.malzemeler || []).map((m) => [m.id, m])), [veri]);

  // Kartın içinden platform fiyatını elle yaz / öneriye dön (null). Sandviç bu boyda kayıtlı kalır.
  async function platformKaydet(s, anahtar, deger) {
    try {
      await sandvicKaydet({ ...s, [anahtar]: { ...s[anahtar], platform_fiyat: deger === null ? '' : String(deger) } });
      bildir(deger === null ? 'Önerilen fiyata dönüldü' : 'Platform fiyatı kaydedildi');
      await yukle();
    } catch (e) {
      bildir(e.message, true);
      throw e;
    }
  }

  async function sil(s) {
    if (!window.confirm(`"${s.ad}" silinsin mi?`)) return;
    try {
      await sandvicSil(s.id);
      bildir('Sandviç silindi');
      yukle();
    } catch (e) {
      bildir(e.message, true);
    }
  }

  return (
    <div className="m2-shell rc-shell ol-shell">
      <button className="m2-back" onClick={() => onNavigate('settings')}>
        <ArrowLeft size={16} /> Ayarlar
      </button>
      <div className="ol-ust">
        <h1 className="m2-title">Online Sipariş</h1>
        <button className="m2-btn ol-yeni" disabled={!veri} onClick={() => { setSekme('sandvicler'); setDuzenle({}); }}>
          <Plus size={16} /> Yeni ekle
        </button>
      </div>
      <div className="m2-tabs">
        {SEKMELER.map(([k, e]) => (
          <button key={k} className={`m2-tab ${sekme === k ? 'on' : ''}`} onClick={() => setSekme(k)}>
            {e}
          </button>
        ))}
      </div>

      {hata && <div className="m2-info r">{hata}</div>}
      {!veri && !hata && <p className="m2-empty">Yükleniyor…</p>}

      {veri && sekme === 'sandvicler' && (
        <div className="ol-liste">
          {veri.sandvicler.length === 0 && (
            <p className="m2-empty">Henüz sandviç yok. Sağ üstteki "Yeni ekle" ile ilk sandviçini oluştur.</p>
          )}
          {veri.sandvicler.map((s) => {
            const hN = boyHesap(s.normal, malzMap, veri.p, veri.p.ambalaj_normal, urunMap);
            const hB = boyHesap(s.buyuk, malzMap, veri.p, veri.p.ambalaj_buyuk, urunMap);
            return (
              <div className="m2-card ol-sandvic" key={s.id}>
                <div className="ol-sandvic-ust">
                  <h3>{s.ad}</h3>
                  <div className="ol-sandvic-islem">
                    <button className="m2-btn sec mini" onClick={() => setDuzenle({ sandvic: s })}>
                      <Pencil size={14} /> Düzenle
                    </button>
                    <button className="rc-ikon-btn" onClick={() => sil(s)} aria-label="Sil">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="ol-ozet">
                  <BoyOzet baslik="Büyük boy" h={hB} kategoriMap={kategoriMap} indirim={veri.p.indirim} onPlatformKaydet={(d) => platformKaydet(s, 'buyuk', d)} />
                  <BoyOzet baslik="Normal boy" h={hN} kategoriMap={kategoriMap} indirim={veri.p.indirim} onPlatformKaydet={(d) => platformKaydet(s, 'normal', d)} />
                </div>
              </div>
            );
          })}
          {veri.sandvicler.some((s) => [...s.normal.kalemler, ...s.buyuk.kalemler].some((k) => malzMap.get(k.malzeme_id)?.kontrol)) && (
            <p className="ol-uyari">* işaretli maliyetler, fiyatı/gramı henüz kesin olmayan malzeme içeriyor (Malzemeler sekmesinde sarı satırlar).</p>
          )}
        </div>
      )}
      {veri && sekme === 'malzemeler' && <MalzemeSekmesi veri={veri} onYenile={yukle} bildir={bildir} />}
      {veri && sekme === 'parametreler' && <ParametreSekmesi veri={veri} onYenile={yukle} bildir={bildir} />}

      {duzenle && veri && (
        <SandvicDuzenle
          sandvic={duzenle.sandvic}
          veri={veri}
          urunler={urunler}
          altKategoriler={data?.subcategories || []}
          urunMap={urunMap}
          kategoriMap={kategoriMap}
          onKapat={() => setDuzenle(null)}
          onKaydedildi={() => {
            setDuzenle(null);
            bildir('Sandviç kaydedildi');
            yukle();
          }}
        />
      )}
      {toast && <div className={`m2-toast ${toast.hataMi ? 'hata' : ''}`}>{toast.mesaj}</div>}
    </div>
  );
}
