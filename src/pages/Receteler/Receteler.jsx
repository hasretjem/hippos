import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import '../Muhasebe2/Muhasebe2.css';
import './Receteler.css';
import { rcApi } from './rcOrtak';
import UrunlerSekmesi from './UrunlerSekmesi';
import HamMaddeler from './HamMaddeler';
import YariMamuller from './YariMamuller';
import FaturaEsleme from './FaturaEsleme';
import Karlilik from './Karlilik';
import ReceteDuzenle from './ReceteDuzenle';

const SEKMELER = [
  ['urunler', 'Ürünler'],
  ['ham', 'Ham maddeler'],
  ['yarimamul', 'Yarı mamuller'],
  ['esleme', 'Fatura eşleme'],
  ['karlilik', 'Kârlılık'],
];

// Ayarlar > Reçeteler. Ürün reçeteleri, ham madde fiyatları (fatura XML'inden), yarı mamuller ve kârlılık.
export default function Receteler({ onNavigate }) {
  const [sekme, setSekme] = useState('urunler');
  const [ozet, setOzet] = useState(null);
  const [malzemeler, setMalzemeler] = useState([]);
  const [yariMamuller, setYariMamuller] = useState([]);
  const [duzenle, setDuzenle] = useState(null); // { tur, urun?, yariMamul? }
  const [toast, setToast] = useState(null);
  const [hata, setHata] = useState('');

  const bildir = useCallback((mesaj, hataMi = false) => {
    setToast({ mesaj, hataMi });
    setTimeout(() => setToast(null), hataMi ? 6000 : 3500);
  }, []);

  const yukle = useCallback(async () => {
    try {
      const [o, m, y] = await Promise.all([rcApi('ozet'), rcApi('malzemeler'), rcApi('yariMamuller')]);
      setOzet(o);
      setMalzemeler(m.malzemeler);
      setYariMamuller(y.yariMamuller);
      setHata('');
    } catch (e) {
      setHata(e.message);
    }
  }, []);
  useEffect(() => {
    yukle();
  }, [yukle]);

  const malzemeleriYenile = useCallback(async () => {
    const [m, y] = await Promise.all([rcApi('malzemeler'), rcApi('yariMamuller')]);
    setMalzemeler(m.malzemeler);
    setYariMamuller(y.yariMamuller);
  }, []);

  const sayilar = ozet?.sayilar;

  return (
    <div className="m2-shell rc-shell">
      <button className="m2-back" onClick={() => onNavigate('settings')}>
        <ArrowLeft size={16} /> Ayarlar
      </button>
      <h1 className="m2-title">
        Reçeteler
        {sayilar && sayilar.receteYok > 0 && <small>{sayilar.receteYok} ürünün reçetesi yok</small>}
        {sayilar && sayilar.fiyatEksik > 0 && <small className="rc-sari">{sayilar.fiyatEksik} reçetede fiyat eksik</small>}
      </h1>
      <div className="m2-tabs">
        {SEKMELER.map(([k, e]) => (
          <button key={k} className={`m2-tab ${sekme === k ? 'on' : ''}`} onClick={() => setSekme(k)}>
            {e}
          </button>
        ))}
      </div>

      {hata && <div className="m2-info r">{hata}</div>}
      {!ozet && !hata && <p className="m2-empty">Yükleniyor…</p>}

      {ozet && sekme === 'urunler' && (
        <UrunlerSekmesi ozet={ozet} bildir={bildir} onYenile={yukle} onDuzenle={(urun) => setDuzenle({ tur: 'urun', urun })} />
      )}
      {ozet && sekme === 'ham' && <HamMaddeler bildir={bildir} onYenile={yukle} />}
      {ozet && sekme === 'yarimamul' && (
        <YariMamuller yariMamuller={yariMamuller} bildir={bildir} onYenile={yukle} onDuzenle={(yariMamul) => setDuzenle({ tur: 'yari_mamul', yariMamul })} />
      )}
      {ozet && sekme === 'esleme' && <FaturaEsleme bildir={bildir} onYenile={yukle} />}
      {ozet && sekme === 'karlilik' && <Karlilik bildir={bildir} />}

      {duzenle && (
        <ReceteDuzenle
          tur={duzenle.tur}
          urun={duzenle.urun}
          yariMamul={duzenle.yariMamul}
          malzemeler={malzemeler}
          yariMamuller={yariMamuller}
          onMalzemelerYenile={malzemeleriYenile}
          onKapat={() => setDuzenle(null)}
          onKaydedildi={() => {
            setDuzenle(null);
            bildir('Reçete kaydedildi');
            yukle();
          }}
        />
      )}
      {toast && <div className={`m2-toast ${toast.hataMi ? 'hata' : ''}`}>{toast.mesaj}</div>}
    </div>
  );
}
