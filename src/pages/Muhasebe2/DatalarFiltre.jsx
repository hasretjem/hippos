import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { tarihTR, trNorm } from './m2Ortak';

// ---------------------------------------------------------------------------
// Datalar sayfası için Excel tarzı filtreler.
// Seçim modeli: null = filtre yok (hepsi seçili), Set = yalnızca o değerler görünür.
// Filtreler yüklenen tüm satırlar üzerinde çalışır; sütunlar arası AND mantığı vardır.
// ---------------------------------------------------------------------------

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const FILTRE_KOLONLARI = [
  { anahtar: 'tarih', baslik: 'Tarih' },
  { anahtar: 'evrakTuru', baslik: 'Evrak Türü' },
  { anahtar: 'firmaAdi', baslik: 'Firma Adı' },
  { anahtar: 'odemeTuru', baslik: 'Ödeme Türü' },
  { anahtar: 'odemeSekli', baslik: 'Ödeme Şekli' },
  { anahtar: 'giderKategorisi', baslik: 'Gider Kategorisi' },
];

export function bosSecimler() {
  return Object.fromEntries(FILTRE_KOLONLARI.map((k) => [k.anahtar, null]));
}

// Varsayılan: içinde bulunulan ayın günleri (listenin çok uzamaması için).
export function varsayilanTarihSecimi(kayitlar, bugunISO) {
  const ay = String(bugunISO).slice(0, 7);
  return new Set(kayitlar.filter((r) => r.tarih && r.tarih.startsWith(ay)).map((r) => r.tarih));
}

export function filtreUygula(kayitlar, secimler) {
  const aktifler = Object.entries(secimler).filter(([, v]) => v);
  if (!aktifler.length) return kayitlar;
  return kayitlar.filter((r) => aktifler.every(([anahtar, set]) => set.has(r[anahtar] ?? '')));
}

// Bir seçim kümesi hepsini kapsıyorsa filtre kalkar (null).
function sadelestir(set, toplam) {
  return set.size === toplam ? null : set;
}

// ---------------------------- Açılır menü kabuğu ---------------------------
export function FiltreMenu({ kolon, konum, degerler, secili, onChange, onKapat, bugun }) {
  const ref = useRef(null);
  useEffect(() => {
    const dis = (e) => {
      if (e.target.closest && e.target.closest('[data-filtre-dugme]')) return; // düğmenin kendisi açıp kapatır
      if (ref.current && !ref.current.contains(e.target)) onKapat();
    };
    const esc = (e) => e.key === 'Escape' && onKapat();
    document.addEventListener('mousedown', dis);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', dis);
      document.removeEventListener('keydown', esc);
    };
  }, [onKapat]);

  return (
    <div className="m2-fmenu" ref={ref} style={{ top: konum.top, left: konum.left }} role="dialog" aria-label={`${kolon.baslik} filtresi`}>
      <div className="m2-fbaslik">{kolon.baslik}</div>
      {kolon.anahtar === 'tarih' ? (
        <TarihAgaci gunler={degerler} secili={secili} onChange={onChange} bugun={bugun} />
      ) : (
        <DegerListesi degerler={degerler} secili={secili} onChange={onChange} />
      )}
    </div>
  );
}

// ------------------------- Düz değer listesi (sütunlar) ---------------------
function DegerListesi({ degerler, secili, onChange }) {
  const [ara, setAra] = useState('');
  const gorunen = degerler.filter((d) => trNorm(d === '' ? '(Boş)' : d).includes(trNorm(ara)));
  const isaretli = (d) => !secili || secili.has(d);

  function degistir(d) {
    const taban = secili ? new Set(secili) : new Set(degerler);
    if (taban.has(d)) taban.delete(d);
    else taban.add(d);
    onChange(sadelestir(taban, degerler.length));
  }

  return (
    <>
      <input className="m2-input m2-fara" placeholder="Ara…" value={ara} onChange={(e) => setAra(e.target.value)} autoFocus />
      <div className="m2-fbtn">
        <button type="button" onClick={() => onChange(null)}>
          Tümünü seç
        </button>
        <button type="button" onClick={() => onChange(new Set())}>
          Hiçbirini seçme
        </button>
      </div>
      <div className="m2-fliste">
        {gorunen.length === 0 && <div className="m2-dd-empty">Eşleşen değer yok</div>}
        {gorunen.map((d) => (
          <label key={d === '' ? '__bos__' : d} className="m2-fsatir">
            <input type="checkbox" checked={isaretli(d)} onChange={() => degistir(d)} />
            <span>{d === '' ? '(Boş)' : d}</span>
          </label>
        ))}
      </div>
    </>
  );
}

// ----------------------------- Yıl > Ay > Gün ağacı -------------------------
function UcDurumKutu({ liste, secili, onToggle, etiket, ad }) {
  const sayi = liste.filter((g) => !secili || secili.has(g)).length;
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = sayi > 0 && sayi < liste.length;
  }, [sayi, liste.length]);
  return (
    <label className="m2-fsatir" data-ad={ad}>
      <input ref={ref} type="checkbox" checked={sayi === liste.length} onChange={onToggle} />
      <span>{etiket}</span>
    </label>
  );
}

function TarihAgaci({ gunler, secili, onChange, bugun }) {
  const agac = useMemo(() => {
    const yillar = new Map();
    gunler.forEach((g) => {
      const [y, a] = g.split('-');
      if (!yillar.has(y)) yillar.set(y, new Map());
      const aylar = yillar.get(y);
      if (!aylar.has(a)) aylar.set(a, []);
      aylar.get(a).push(g);
    });
    return [...yillar.entries()]
      .sort((x, y) => y[0].localeCompare(x[0]))
      .map(([y, aylar]) => ({
        y,
        gunler: [...aylar.values()].flat(),
        aylar: [...aylar.entries()]
          .sort((x, z) => z[0].localeCompare(x[0]))
          .map(([a, gl]) => ({ a, gunler: [...gl].sort().reverse() })),
      }));
  }, [gunler]);

  const buAy = String(bugun).slice(0, 7);
  const [acik, setAcik] = useState(() => new Set([buAy.slice(0, 4), buAy]));
  const acKapat = (anahtar) =>
    setAcik((s) => {
      const y = new Set(s);
      if (y.has(anahtar)) y.delete(anahtar);
      else y.add(anahtar);
      return y;
    });

  function grupDegistir(liste) {
    const taban = secili ? new Set(secili) : new Set(gunler);
    const hepsi = liste.every((g) => taban.has(g));
    liste.forEach((g) => (hepsi ? taban.delete(g) : taban.add(g)));
    onChange(sadelestir(taban, gunler.length));
  }
  function buAyiSec() {
    onChange(sadelestir(new Set(gunler.filter((g) => g.startsWith(buAy))), gunler.length));
  }

  return (
    <>
      <div className="m2-fbtn">
        <button type="button" onClick={buAyiSec}>
          Bu ay
        </button>
        <button type="button" onClick={() => onChange(null)}>
          Tümünü seç
        </button>
        <button type="button" onClick={() => onChange(new Set())}>
          Hiçbirini seçme
        </button>
      </div>
      <div className="m2-fliste">
        {agac.length === 0 && <div className="m2-dd-empty">Kayıt yok</div>}
        {agac.map((yil) => (
          <div key={yil.y}>
            <div className="m2-fdal">
              <button type="button" className="m2-facik" aria-label={`${yil.y} aç/kapat`} onClick={() => acKapat(yil.y)}>
                {acik.has(yil.y) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <UcDurumKutu liste={yil.gunler} secili={secili} onToggle={() => grupDegistir(yil.gunler)} etiket={yil.y} ad={`yil-${yil.y}`} />
            </div>
            {acik.has(yil.y) &&
              yil.aylar.map((ay) => {
                const anahtar = `${yil.y}-${ay.a}`;
                return (
                  <div key={anahtar} style={{ marginLeft: 18 }}>
                    <div className="m2-fdal">
                      <button type="button" className="m2-facik" aria-label={`${AYLAR[Number(ay.a) - 1]} ${yil.y} aç/kapat`} onClick={() => acKapat(anahtar)}>
                        {acik.has(anahtar) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <UcDurumKutu
                        liste={ay.gunler}
                        secili={secili}
                        onToggle={() => grupDegistir(ay.gunler)}
                        etiket={AYLAR[Number(ay.a) - 1]}
                        ad={`ay-${anahtar}`}
                      />
                    </div>
                    {acik.has(anahtar) &&
                      ay.gunler.map((g) => (
                        <label key={g} className="m2-fsatir" style={{ marginLeft: 40 }} data-ad={`gun-${g}`}>
                          <input
                            type="checkbox"
                            checked={!secili || secili.has(g)}
                            onChange={() => grupDegistir([g])}
                          />
                          <span>{tarihTR(g)}</span>
                        </label>
                      ))}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </>
  );
}