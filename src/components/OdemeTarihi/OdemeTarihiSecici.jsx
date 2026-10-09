import React, { useState } from 'react';
import { bugunAnahtar, tarihAnahtari, trTarih } from '../../utils/odemeTarihi';
import './OdemeTarihiSecici.css';

const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function ayGunleri(yil, ay) {
  const ilk = new Date(yil, ay, 1);
  const son = new Date(yil, ay + 1, 0);
  const bosluk = (ilk.getDay() + 6) % 7;
  const liste = [];
  for (let i = 0; i < bosluk; i++) liste.push(null);
  for (let d = 1; d <= son.getDate(); d++) liste.push(new Date(yil, ay, d));
  return liste;
}

// "Uçak bileti" görünümlü ödeme tarihi seçici: bu ay + gelecek ay yan yana, gün tıklanarak seçilir.
// Yanında "Ödeme Tarihi Belirsiz" seçeneği var; ikisi birden seçilemez.
// value: { tarih: 'YYYY-MM-DD' | null, belirsiz: boolean }
export default function OdemeTarihiSecici({ value, onChange }) {
  const bugun = bugunAnahtar();
  const [by, bm] = bugun.split('-').map(Number);
  const [yil, setYil] = useState(by);
  const [ay, setAy] = useState(bm - 1);
  const v = value || { tarih: null, belirsiz: false };

  const ikinci = ay === 11 ? { yil: yil + 1, ay: 0 } : { yil, ay: ay + 1 };
  const buAydayiz = yil === by && ay === bm - 1;

  function geri() {
    if (buAydayiz) return;
    if (ay === 0) { setYil(yil - 1); setAy(11); } else setAy(ay - 1);
  }
  function ileri() {
    if (ay === 11) { setYil(yil + 1); setAy(0); } else setAy(ay + 1);
  }
  function gunSec(d) {
    onChange({ tarih: tarihAnahtari(d), belirsiz: false });
  }
  function belirsizSec() {
    onChange(v.belirsiz ? { tarih: null, belirsiz: false } : { tarih: null, belirsiz: true });
  }

  function takvim(y, a, ustSol, ustSag) {
    return (
      <div className="ots-ay">
        <div className="ots-ay-bas">
          {ustSol ? <button type="button" className="ots-ok" onClick={geri} disabled={buAydayiz}>‹</button> : <span className="ots-ok-bos" />}
          <span className="ots-ay-ad">{AYLAR[a]} {y}</span>
          {ustSag ? <button type="button" className="ots-ok" onClick={ileri}>›</button> : <span className="ots-ok-bos" />}
        </div>
        <div className="ots-izgara">
          {GUNLER.map((g) => <div key={g} className="ots-gun-ad">{g}</div>)}
          {ayGunleri(y, a).map((d, i) => {
            if (!d) return <span key={i} className="ots-bos" />;
            const s = tarihAnahtari(d);
            const gecmis = s < bugun;
            const secili = s === v.tarih;
            return (
              <button
                key={i}
                type="button"
                disabled={gecmis}
                className={`ots-gun${secili ? ' secili' : ''}${s === bugun ? ' bugun' : ''}`}
                onClick={() => gunSec(d)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="ots-kap">
      <div className="ots-baslik">Ödeme Tarihi</div>
      <div className="ots-aylar">
        {takvim(yil, ay, true, false)}
        {takvim(ikinci.yil, ikinci.ay, false, true)}
      </div>
      <div className="ots-alt">
        <button type="button" className={`ots-belirsiz${v.belirsiz ? ' secili' : ''}`} onClick={belirsizSec}>
          Ödeme Tarihi Belirsiz
        </button>
        <span className="ots-secim">
          {v.tarih ? `Seçilen: ${trTarih(v.tarih)}` : v.belirsiz ? 'Tarih belirsiz' : 'Tarih seç ya da belirsiz de'}
        </span>
      </div>
    </div>
  );
}
