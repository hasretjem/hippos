import { useEffect, useMemo, useRef, useState } from 'react';
import { trNorm } from './rcOrtak';

// Yazarak arama yapılan seçim kutusu. secenekler: [{ id, ad, grup?, ek? }]
export default function SecimKutusu({ secenekler, deger, onSec, yer = 'Seç…', onYeni, yeniEtiket = '+ Yeni ekle' }) {
  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState('');
  const kap = useRef(null);
  const secili = secenekler.find((s) => s.id === deger);

  useEffect(() => {
    if (!acik) return undefined;
    const kapat = (e) => {
      if (kap.current && !kap.current.contains(e.target)) setAcik(false);
    };
    document.addEventListener('mousedown', kapat);
    return () => document.removeEventListener('mousedown', kapat);
  }, [acik]);

  const liste = useMemo(() => {
    const n = trNorm(metin);
    return secenekler.filter((s) => !n || trNorm(s.ad).includes(n)).slice(0, 60);
  }, [secenekler, metin]);

  const gruplar = [];
  liste.forEach((s) => {
    const g = s.grup || '';
    let blok = gruplar.find((b) => b.g === g);
    if (!blok) gruplar.push((blok = { g, ogeler: [] }));
    blok.ogeler.push(s);
  });

  return (
    <div className="rc-sec" ref={kap}>
      <input
        className="m2-input"
        value={acik ? metin : secili ? secili.ad : ''}
        placeholder={yer}
        onFocus={() => {
          setMetin('');
          setAcik(true);
        }}
        onChange={(e) => {
          setMetin(e.target.value);
          setAcik(true);
        }}
      />
      {acik && (
        <div className="rc-sec-liste">
          {gruplar.map((b) => (
            <div key={b.g}>
              {b.g && <div className="rc-sec-grup">{b.g}</div>}
              {b.ogeler.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`rc-sec-oge ${s.id === deger ? 'on' : ''}`}
                  onClick={() => {
                    onSec(s.id);
                    setAcik(false);
                  }}
                >
                  <span>{s.ad}</span>
                  {s.ek && <small>{s.ek}</small>}
                </button>
              ))}
            </div>
          ))}
          {!liste.length && <div className="rc-sec-bos">Sonuç yok</div>}
          {onYeni && (
            <button
              type="button"
              className="rc-sec-oge yeni"
              onClick={() => {
                setAcik(false);
                onYeni(metin);
              }}
            >
              {yeniEtiket}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
