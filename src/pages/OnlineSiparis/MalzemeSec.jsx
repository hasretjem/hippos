import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { trNorm } from '../Muhasebe2/m2Ortak';

const etiketOf = (m) => `${m.ad}${m.birim_adi ? ` (${m.birim_adi})` : ''}${m.kontrol ? ' *' : ''}`;

// Klavyeyle malzeme seçimi: yaz → ara, ↑↓ gez, Enter seç, Backspace/Delete seçimi sil, seçiliyken Enter → yeni satır.
export default function MalzemeSec({ malzemeler, deger, onSec, onYeniSatir, otoOdak }) {
  const girdi = useRef(null);
  const [metin, setMetin] = useState('');
  const [duzenliyor, setDuzenliyor] = useState(false); // true: kutuda arama metni var
  const [acik, setAcik] = useState(false);
  const [aktif, setAktif] = useState(0);
  const [konum, setKonum] = useState(null);

  const secili = deger ? malzemeler.find((m) => m.id === Number(deger)) || null : null;
  const gorunen = duzenliyor ? metin : secili ? etiketOf(secili) : '';

  const liste = useMemo(() => {
    const q = trNorm(metin);
    return malzemeler.filter((m) => !q || trNorm(`${m.ad} ${m.birim_adi || ''}`).includes(q));
  }, [malzemeler, metin]);

  useEffect(() => {
    if (otoOdak) girdi.current?.focus();
  }, [otoOdak]);

  // Liste pencere kenarına göre sabit konumlanır (tablo/pencere kaydırması kırpmasın).
  useLayoutEffect(() => {
    if (!acik || !girdi.current) return;
    const r = girdi.current.getBoundingClientRect();
    const yer = window.innerHeight - r.bottom;
    const yukari = yer < 220 && r.top > yer;
    setKonum({ left: r.left, width: Math.max(r.width, 240), ...(yukari ? { bottom: window.innerHeight - r.top + 2, maxHeight: Math.min(260, r.top - 12) } : { top: r.bottom + 2, maxHeight: Math.min(260, yer - 12) }) });
  }, [acik, metin, duzenliyor]);

  function sec(m) {
    onSec(m.id);
    setDuzenliyor(false);
    setMetin('');
    setAcik(false);
  }
  function kutuyuAc() {
    setDuzenliyor(true);
    setMetin('');
    setAktif(0);
    setAcik(true);
  }

  function tus(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!acik) {
        kutuyuAc();
        return;
      }
      setAktif((a) => (liste.length ? (a + (e.key === 'ArrowDown' ? 1 : -1) + liste.length) % liste.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (acik && liste.length) sec(liste[Math.min(aktif, liste.length - 1)]);
      else if (secili && !acik) onYeniSatir?.();
    } else if (e.key === 'Escape') {
      setAcik(false);
      setDuzenliyor(false);
      setMetin('');
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && secili && !duzenliyor) {
      e.preventDefault();
      onSec('');
      kutuyuAc();
    }
  }

  return (
    <div className="ol-ms">
      <input
        ref={girdi}
        className="m2-input ol-ms-girdi"
        placeholder="Malzeme yaz…"
        value={gorunen}
        onChange={(e) => {
          setDuzenliyor(true);
          setMetin(e.target.value);
          setAktif(0);
          setAcik(true);
        }}
        onFocus={() => { if (!secili) kutuyuAc(); }}
        onClick={() => { if (secili && !acik) kutuyuAc(); }}
        onBlur={() => {
          setAcik(false);
          setDuzenliyor(false);
          setMetin('');
        }}
        onKeyDown={tus}
        autoComplete="off"
      />
      {acik && konum && (
        <ul className="ol-ms-liste" style={konum} role="listbox">
          {liste.length === 0 && <li className="ol-ms-bos">Eşleşen malzeme yok</li>}
          {liste.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === aktif}
              className={i === aktif ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); sec(m); }}
              onMouseEnter={() => setAktif(i)}
            >
              {etiketOf(m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
